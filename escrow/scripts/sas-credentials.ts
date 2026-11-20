/**
 * Issues GroundTruth's staged reviewer credentials on the Solana Attestation
 * Service (SAS) on devnet: one staged issuer (credential), one schema, and
 * one attestation per staged reviewer wallet (title, survey, septic).
 *
 *   pnpm --filter @groundtruth/escrow sas:credentials          # plan (default): addresses + chain state, sends nothing
 *   pnpm --filter @groundtruth/escrow sas:credentials issue    # creates whatever is missing
 *
 * Every account is a PDA, so `issue` is safe to re-run: it skips accounts
 * that already exist and checks that existing attestations hold the expected
 * role and issuer label. It never touches a deal; the escrow program does
 * not read these credentials.
 *
 * Keys (escrow/.demo-wallets, gitignored): issuer.json is the credential
 * authority and the attestation signer; buyer.json pays rent and fees (the
 * staged buyer already pays every demo fee). Only public keys are printed.
 * Output: demo-results/sas-credentials-devnet.{json,md}.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SAS_PROGRAM_ID,
  SAS_SEEDS,
  SAS_MAX_NAME_BYTES,
  STAGED_REVIEWER_CREDENTIAL as CRED,
  decodeReviewerCredentialData,
  decodeSasAttestation,
  encodeCreateAttestationData,
  encodeCreateCredentialData,
  encodeCreateSchemaData,
  encodeReviewerCredentialData,
  stagedDeal,
} from "@groundtruth/shared";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM = new PublicKey(SAS_PROGRAM_ID);
const WALLET_DIR = join(__dirname, "..", ".demo-wallets");
const RESULTS = join(__dirname, "..", "demo-results");
const explorer = (kind: "tx" | "address", id: string) =>
  `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

function loadKeypair(name: string): Keypair {
  const path = join(WALLET_DIR, `${name}.json`);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}. Copy the staged keypairs into escrow/.demo-wallets first.`,
    );
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))),
  );
}

const seed = (text: string) => {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > SAS_MAX_NAME_BYTES) {
    throw new Error(
      `"${text}" is ${bytes.length} bytes; SAS seeds allow ${SAS_MAX_NAME_BYTES}.`,
    );
  }
  return bytes;
};

function derive(authority: PublicKey) {
  const [credential] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(SAS_SEEDS.credential),
      authority.toBuffer(),
      seed(CRED.credentialName),
    ],
    PROGRAM,
  );
  const [schema] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(SAS_SEEDS.schema),
      credential.toBuffer(),
      seed(CRED.schemaName),
      Buffer.from([CRED.schemaVersion]),
    ],
    PROGRAM,
  );
  const attestations = CRED.attestations.map((a) => {
    const wallet = new PublicKey(a.wallet);
    const [address] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(SAS_SEEDS.attestation),
        credential.toBuffer(),
        schema.toBuffer(),
        wallet.toBuffer(),
      ],
      PROGRAM,
    );
    return { ...a, walletKey: wallet, addressKey: address };
  });
  return { credential, schema, attestations };
}

interface Step {
  what: string;
  address: string;
  status: "exists" | "created" | "missing";
  signature?: string;
}

async function main() {
  const mode = process.argv[2] ?? "plan";
  if (mode !== "plan" && mode !== "issue") {
    throw new Error(`Unknown mode "${mode}". Use plan or issue.`);
  }
  const connection = new Connection(RPC_URL, "confirmed");
  const issuer = loadKeypair("issuer");
  const payer = loadKeypair("buyer");
  if (!issuer.publicKey.equals(new PublicKey(CRED.authority))) {
    throw new Error(
      `issuer.json is ${issuer.publicKey.toBase58()}, not the staged authority ${CRED.authority}.`,
    );
  }
  if (payer.publicKey.toBase58() !== stagedDeal.buyerWallet) {
    throw new Error("buyer.json is not the staged buyer.");
  }
  const d = derive(issuer.publicKey);
  for (const [name, derived, recorded] of [
    ["credential", d.credential.toBase58(), CRED.credential],
    ["schema", d.schema.toBase58(), CRED.schema],
    ...d.attestations.map(
      (a) =>
        [`${a.role} attestation`, a.addressKey.toBase58(), a.address] as const,
    ),
  ] as const) {
    if (derived !== recorded) {
      throw new Error(
        `${name}: derived ${derived}, shared constant says ${recorded}.`,
      );
    }
  }
  // Each stagedDeal reviewer must be one of the attested wallets, role for role.
  for (const reviewer of stagedDeal.reviewers) {
    const match = CRED.attestations.find((a) => a.wallet === reviewer.wallet);
    if (!match || match.role !== reviewer.role) {
      throw new Error(
        `Staged ${reviewer.role} reviewer ${reviewer.wallet} has no matching attestation.`,
      );
    }
  }

  console.log(`RPC ${RPC_URL}  mode ${mode}`);
  console.log(`SAS program   ${SAS_PROGRAM_ID}`);
  console.log(
    `issuer        ${issuer.publicKey.toBase58()} (staged authority)`,
  );
  console.log(
    `fee payer     ${payer.publicKey.toBase58()} (staged buyer), ${(await connection.getBalance(payer.publicKey)) / 1e9} SOL`,
  );

  const steps: Step[] = [];
  const send = async (
    what: string,
    address: PublicKey,
    ix: TransactionInstruction,
  ) => {
    const existing = await connection.getAccountInfo(address);
    if (existing) {
      if (!existing.owner.equals(PROGRAM)) {
        throw new Error(
          `${what} ${address.toBase58()} exists but is owned by ${existing.owner.toBase58()}.`,
        );
      }
      steps.push({ what, address: address.toBase58(), status: "exists" });
      console.log(`  ${what}: exists ${address.toBase58()}`);
      return existing.data;
    }
    if (mode === "plan") {
      steps.push({ what, address: address.toBase58(), status: "missing" });
      console.log(`  ${what}: missing ${address.toBase58()}`);
      return null;
    }
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer, issuer],
      {
        commitment: "confirmed",
      },
    );
    steps.push({
      what,
      address: address.toBase58(),
      status: "created",
      signature,
    });
    console.log(
      `  ${what}: created ${address.toBase58()}\n    ${explorer("tx", signature)}`,
    );
    return (
      (await connection.getAccountInfo(address, "confirmed"))?.data ?? null
    );
  };

  await send(
    "credential",
    d.credential,
    new TransactionInstruction({
      programId: PROGRAM,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: d.credential, isSigner: false, isWritable: true },
        { pubkey: issuer.publicKey, isSigner: true, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(
        encodeCreateCredentialData(CRED.credentialName, [
          issuer.publicKey.toBytes(),
        ]),
      ),
    }),
  );
  await send(
    "schema",
    d.schema,
    new TransactionInstruction({
      programId: PROGRAM,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: issuer.publicKey, isSigner: true, isWritable: false },
        { pubkey: d.credential, isSigner: false, isWritable: false },
        { pubkey: d.schema, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(
        encodeCreateSchemaData({
          name: CRED.schemaName,
          description: CRED.schemaDescription,
          layout: CRED.layout,
          fieldNames: CRED.fieldNames,
        }),
      ),
    }),
  );
  for (const a of d.attestations) {
    const data = await send(
      `${a.role} attestation`,
      a.addressKey,
      new TransactionInstruction({
        programId: PROGRAM,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: issuer.publicKey, isSigner: true, isWritable: false },
          { pubkey: d.credential, isSigner: false, isWritable: false },
          { pubkey: d.schema, isSigner: false, isWritable: false },
          { pubkey: a.addressKey, isSigner: false, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: Buffer.from(
          encodeCreateAttestationData(
            a.walletKey.toBytes(),
            encodeReviewerCredentialData({
              role: a.role,
              issuer: CRED.issuerLabel,
              staged: true,
            }),
            CRED.expiry,
          ),
        ),
      }),
    );
    if (data) {
      const attestation = decodeSasAttestation(data);
      const fields = decodeReviewerCredentialData(attestation.data);
      const ok =
        new PublicKey(attestation.nonce).equals(a.walletKey) &&
        new PublicKey(attestation.credential).equals(d.credential) &&
        new PublicKey(attestation.schema).equals(d.schema) &&
        new PublicKey(attestation.signer).equals(issuer.publicKey) &&
        fields.role === a.role &&
        fields.issuer === CRED.issuerLabel &&
        fields.staged;
      console.log(
        `    read back: role=${fields.role} staged=${fields.staged} issuer="${fields.issuer}" ${ok ? "OK" : "MISMATCH"}`,
      );
      if (!ok) process.exitCode = 1;
    }
  }

  if (mode === "issue") {
    // A re-run finds the accounts already there; keep the creating signatures.
    const recordPath = join(RESULTS, "sas-credentials-devnet.json");
    if (existsSync(recordPath)) {
      const previous = JSON.parse(readFileSync(recordPath, "utf8")) as {
        steps?: Step[];
      };
      for (const step of steps) {
        const before = previous.steps?.find(
          (p) => p.address === step.address && p.signature,
        );
        if (step.status === "exists" && before) {
          step.status = "created";
          step.signature = before.signature;
        }
      }
    }
    const record = {
      cluster: "devnet",
      rpc: RPC_URL,
      program: SAS_PROGRAM_ID,
      issuerAuthority: issuer.publicKey.toBase58(),
      feePayer: payer.publicKey.toBase58(),
      credentialName: CRED.credentialName,
      schemaName: CRED.schemaName,
      schemaDescription: CRED.schemaDescription,
      issuerLabel: CRED.issuerLabel,
      steps,
      writtenAt: new Date().toISOString(),
    };
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    const lines = [
      "# Staged reviewer credentials on SAS (devnet)",
      "",
      "STAGED DEMO. Issued by the GroundTruth team to its own test reviewer wallets; not a license, background check, or real professional credential. The escrow program does not read these.",
      "",
      `- SAS program: [\`${SAS_PROGRAM_ID}\`](${explorer("address", SAS_PROGRAM_ID)})`,
      `- Staged issuer authority: \`${issuer.publicKey.toBase58()}\`; fee payer: staged buyer \`${payer.publicKey.toBase58()}\``,
      `- Issuer label written into each attestation: "${CRED.issuerLabel}"`,
      "",
      "| Account | Address | Transaction |",
      "| --- | --- | --- |",
      ...steps.map(
        (s) =>
          `| ${s.what} | [\`${s.address}\`](${explorer("address", s.address)}) | ${
            s.signature
              ? `[${s.signature.slice(0, 8)}…](${explorer("tx", s.signature)})`
              : s.status
          } |`,
      ),
      "",
      `Written ${record.writtenAt} by \`pnpm --filter @groundtruth/escrow sas:credentials issue\`.`,
      "",
    ];
    writeFileSync(join(RESULTS, "sas-credentials-devnet.md"), lines.join("\n"));
    console.log("Wrote demo-results/sas-credentials-devnet.{json,md}");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
