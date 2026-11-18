/**
 * The GroundTruth program's public devnet history, recorded from the public
 * RPC by scripts/record-devnet-transactions.ts (program-history.json). This
 * is REAL CHAIN DATA, unlike the IDL-encoded logs in test/support.
 *
 * Re-recorded 2026-11-18 after the demo run: the deploy (#22), the two IDL
 * metadata writes, Kadhir's upgrade (#25, slot 523474592), and the 11
 * transactions of the two staged demo closings (escrow/demo-results), the
 * held deal's failed release included.
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/** Anchor IDL metadata account for the deployed program (#22). */
export const IDL_METADATA_ACCOUNT =
  "uQZLX7rQRUceEZdPYyxFtE8ei386h3XKatFkRJ3wZma";

/** One transaction as getTransaction returns it with jsonParsed encoding. */
export interface RecordedTransaction {
  slot: number;
  blockTime: number | null;
  transaction: { signatures: string[]; message: unknown };
  meta: { err: unknown; logMessages: string[] } & Record<string, unknown>;
}

interface RecordedAccount {
  data: [string, "base64"];
  executable: boolean;
  owner: string;
}

export interface DevnetRecording {
  cluster: "devnet";
  recordedAt: string;
  programId: string;
  program: { slot: number; account: RecordedAccount | null };
  idlMetadata: { address: string; account: RecordedAccount | null };
  transactions: RecordedTransaction[];
}

export function loadDevnetRecording(): DevnetRecording {
  return JSON.parse(
    readFileSync(new URL("program-history.json", import.meta.url), "utf8"),
  ) as DevnetRecording;
}

/**
 * The IDL JSON stored in a program-metadata account. Layout (program
 * metadata v1, as uploaded by `anchor idl init`): byte 84 compression
 * (2 = zlib), 85 format (1 = JSON), 86 data source (0 = in the account),
 * 87..91 data length (u32 LE), data from byte 96.
 */
export function idlFromMetadataAccount(account: RecordedAccount): unknown {
  const bytes = Buffer.from(account.data[0], "base64");
  const [compression, format, source] = [bytes[84], bytes[85], bytes[86]];
  if (compression !== 2 || format !== 1 || source !== 0) {
    throw new Error(
      `unexpected metadata header: compression ${compression}, format ${format}, source ${source}`,
    );
  }
  const length = bytes.readUInt32LE(87);
  return JSON.parse(
    inflateSync(bytes.subarray(96, 96 + length)).toString("utf8"),
  ) as unknown;
}
