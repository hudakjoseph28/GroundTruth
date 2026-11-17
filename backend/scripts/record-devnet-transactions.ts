/**
 * Records the GroundTruth escrow program's public devnet history for the
 * chain tests. Reads only public chain data from the public devnet RPC; it
 * needs no keys and signs nothing.
 *
 *   pnpm --filter @groundtruth/backend record:devnet
 *
 * Writes test/fixtures/devnet/program-history.json:
 *   - every transaction whose account keys include GROUNDTRUTH_PROGRAM_ID
 *     (getSignaturesForAddress), as getTransaction returns it with
 *     jsonParsed encoding, oldest first. That is the same shape as one
 *     transaction in a QuickNode Block dataset delivery;
 *   - the program account, and the Anchor IDL metadata account's raw data,
 *     so tests can check the deployed IDL against the checked-in one.
 *
 * Re-run it after new devnet transactions (the held and released demo
 * deals) to record their real logs; test/devnetRecorded.test.ts runs every
 * recorded transaction through the filter, webhook, and decoder.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUNDTRUTH_PROGRAM_ID } from "@groundtruth/shared";
import { IDL_METADATA_ACCOUNT } from "../test/fixtures/devnet/recording.js";

const RPC = "https://api.devnet.solana.com";
const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/devnet/program-history.json",
);

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    // The public RPC rate-limits bursts; back off and try again.
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const body = (await res.json()) as {
      result?: T;
      error?: { message: string };
    };
    if (!res.ok || body.error || body.result === undefined) {
      throw new Error(
        `${method}: ${res.status} ${body.error?.message ?? "no result"}`,
      );
    }
    return body.result;
  }
}

interface SignatureInfo {
  signature: string;
  slot: number;
}

const signatures = await rpc<SignatureInfo[]>("getSignaturesForAddress", [
  GROUNDTRUTH_PROGRAM_ID,
  { limit: 1000, commitment: "finalized" },
]);
if (signatures.length === 1000) {
  throw new Error("1000+ signatures: add pagination before recording");
}

const transactions: unknown[] = [];
for (const { signature } of [...signatures].reverse()) {
  transactions.push(
    await rpc("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      },
    ]),
  );
}

const account = (address: string) =>
  rpc<{ context: { slot: number }; value: unknown }>("getAccountInfo", [
    address,
    { encoding: "base64", commitment: "finalized" },
  ]);
const program = await account(GROUNDTRUTH_PROGRAM_ID);
const idl = await account(IDL_METADATA_ACCOUNT);

const recording = {
  note: "Public Solana devnet data recorded from the public RPC by scripts/record-devnet-transactions.ts. Not edited by hand.",
  cluster: "devnet",
  rpc: RPC,
  recordedAt: new Date().toISOString(),
  programId: GROUNDTRUTH_PROGRAM_ID,
  program: { slot: program.context.slot, account: program.value },
  idlMetadata: {
    address: IDL_METADATA_ACCOUNT,
    slot: idl.context.slot,
    account: idl.value,
  },
  transactions,
};
await writeFile(out, `${JSON.stringify(recording, null, 2)}\n`);
console.log(`recorded ${transactions.length} transactions to ${out}`);
