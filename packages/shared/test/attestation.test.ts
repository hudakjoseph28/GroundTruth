import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import {
  AttestationDecodeError,
  SAS_ACCOUNT_DISCRIMINATOR,
  SAS_MAX_NAME_BYTES,
  SAS_PROGRAM_ID,
  SAS_SEEDS,
  STAGED_REVIEWER_CREDENTIAL as CRED,
  decodeReviewerCredentialData,
  decodeSasAttestation,
  encodeCreateAttestationData,
  encodeReviewerCredentialData,
  showsReviewerCredentials,
  stagedDeal,
  stagedLiveDeal,
} from "@groundtruth/shared";

const program = new PublicKey(SAS_PROGRAM_ID);
const pda = (seeds: Uint8Array[]) =>
  PublicKey.findProgramAddressSync(seeds, program)[0].toBase58();
const text = (value: string) => new TextEncoder().encode(value);

test("recorded credential, schema, and attestation addresses are the SAS PDAs", () => {
  const credential = pda([
    text(SAS_SEEDS.credential),
    new PublicKey(CRED.authority).toBytes(),
    text(CRED.credentialName),
  ]);
  assert.equal(credential, CRED.credential);
  const schema = pda([
    text(SAS_SEEDS.schema),
    new PublicKey(credential).toBytes(),
    text(CRED.schemaName),
    Uint8Array.of(CRED.schemaVersion),
  ]);
  assert.equal(schema, CRED.schema);
  for (const a of CRED.attestations) {
    assert.equal(
      pda([
        text(SAS_SEEDS.attestation),
        new PublicKey(credential).toBytes(),
        new PublicKey(schema).toBytes(),
        new PublicKey(a.wallet).toBytes(),
      ]),
      a.address,
    );
  }
});

test("every staged reviewer has an attestation for the same role", () => {
  for (const reviewer of stagedDeal.reviewers) {
    const match = CRED.attestations.find((a) => a.wallet === reviewer.wallet);
    assert.equal(match?.role, reviewer.role);
  }
});

test("names fit in one SAS seed", () => {
  assert.ok(text(CRED.credentialName).length <= SAS_MAX_NAME_BYTES);
  assert.ok(text(CRED.schemaName).length <= SAS_MAX_NAME_BYTES);
  assert.match(
    CRED.schemaDescription,
    /^GroundTruth staged reviewer credential\. STAGED DEMO/,
  );
  assert.match(CRED.issuerLabel, /staged demo/i);
});

test("reviewer credential data round-trips and rejects bad input", () => {
  const value = {
    role: "survey",
    issuer: CRED.issuerLabel,
    staged: true,
  } as const;
  assert.deepEqual(
    decodeReviewerCredentialData(encodeReviewerCredentialData(value)),
    value,
  );
  assert.throws(
    () =>
      decodeReviewerCredentialData(
        encodeReviewerCredentialData({ ...value, role: "notary" as never }),
      ),
    AttestationDecodeError,
  );
  const extra = Uint8Array.from([...encodeReviewerCredentialData(value), 0]);
  assert.throws(
    () => decodeReviewerCredentialData(extra),
    AttestationDecodeError,
  );
});

test("decodes an attestation account laid out like SAS writes it", () => {
  const wallet = new PublicKey(CRED.attestations[0].wallet).toBytes();
  const data = encodeReviewerCredentialData({
    role: "title",
    issuer: CRED.issuerLabel,
    staged: true,
  });
  // CreateAttestation data is [6, nonce, len+data, expiry]; the account is
  // [2, nonce, credential, schema, len+data, signer, expiry, token account].
  const ix = encodeCreateAttestationData(wallet, data, 0);
  assert.equal(ix[0], 6);
  const account = Uint8Array.from([
    SAS_ACCOUNT_DISCRIMINATOR.attestation,
    ...wallet,
    ...new PublicKey(CRED.credential).toBytes(),
    ...new PublicKey(CRED.schema).toBytes(),
    ...ix.slice(33, ix.length - 8),
    ...new PublicKey(CRED.authority).toBytes(),
    ...ix.slice(ix.length - 8),
    ...new Uint8Array(32),
  ]);
  const decoded = decodeSasAttestation(account);
  assert.deepEqual(decoded.nonce, wallet);
  assert.equal(new PublicKey(decoded.schema).toBase58(), CRED.schema);
  assert.equal(decoded.expiry, 0n);
  assert.equal(decodeReviewerCredentialData(decoded.data).role, "title");
  assert.throws(
    () => decodeSasAttestation(Uint8Array.of(0, ...account.slice(1))),
    AttestationDecodeError,
  );
  assert.throws(
    () => decodeSasAttestation(account.slice(0, 50)),
    AttestationDecodeError,
  );
});

test("credentials show on rehearsal deals only", () => {
  assert.equal(
    showsReviewerCredentials("staged-devnet-deal-rehearsal-v3"),
    true,
  );
  assert.equal(showsReviewerCredentials(stagedLiveDeal.id), false);
  assert.equal(showsReviewerCredentials(stagedDeal.id), false);
  assert.equal(showsReviewerCredentials("staged-devnet-deal-released"), false);
});
