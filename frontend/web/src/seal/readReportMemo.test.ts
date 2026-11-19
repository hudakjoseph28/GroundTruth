import { describe, expect, it } from "vitest";
import { MEMO_PROGRAM_IDS } from "@groundtruth/shared";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { reportHashesInMessage, signatureFromInput } from "./readReportMemo";
import { reportMemoInstruction } from "./reportHash";

const A = "a".repeat(64);
const B = "b".repeat(64);
const payer = new PublicKey(new Uint8Array(32).fill(7));
const other = new PublicKey(new Uint8Array(32).fill(9));

const memo = (programId: string, text: string) =>
  new TransactionInstruction({
    programId: new PublicKey(programId),
    keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, "utf8"),
  });

function compile(instructions: TransactionInstruction[]) {
  return new TransactionMessage({
    payerKey: payer,
    recentBlockhash: "11111111111111111111111111111111",
    instructions,
  }).compileToV0Message();
}

describe("reportHashesInMessage", () => {
  it("reads the fingerprint from the instruction the save button sends", () => {
    const spec = reportMemoInstruction({ signer: payer.toBase58(), sha256: A });
    const message = compile([
      new TransactionInstruction({
        programId: new PublicKey(spec.programId),
        keys: spec.keys.map((key) => ({
          ...key,
          pubkey: new PublicKey(key.pubkey),
        })),
        data: Buffer.from(spec.data),
      }),
    ]);
    expect(reportHashesInMessage(message)).toEqual([A]);
  });

  it("reads both Memo programs, and only report memos from them", () => {
    const message = compile([
      memo(MEMO_PROGRAM_IDS[0], `groundtruth:doc:${B}`),
      memo(MEMO_PROGRAM_IDS[1], `groundtruth:report:${B}`),
      memo(MEMO_PROGRAM_IDS[0], `groundtruth:report:${A}`),
      memo(MEMO_PROGRAM_IDS[0], "groundtruth:report:not-a-hash"),
    ]);
    expect(reportHashesInMessage(message)).toEqual([B, A]);
  });

  it("ignores memo-like text sent to any other program", () => {
    const message = compile([
      memo(other.toBase58(), `groundtruth:report:${A}`),
    ]);
    expect(reportHashesInMessage(message)).toEqual([]);
  });
});

describe("signatureFromInput", () => {
  const SIG =
    "5QovFTbAMquUY5M5NpJwZPUJhtcKAcmQ5xmZhvFWT46KfPh3UBkaQMhgQhcuphBqvTiYLUgTmNNS7b8tyR7JJ2ib";

  it("takes a signature, padded or not, or an Explorer link to one", () => {
    expect(signatureFromInput(SIG)).toBe(SIG);
    expect(signatureFromInput(`  ${SIG}\n`)).toBe(SIG);
    expect(
      signatureFromInput(
        `https://explorer.solana.com/tx/${SIG}?cluster=devnet`,
      ),
    ).toBe(SIG);
  });

  it("refuses anything else", () => {
    expect(signatureFromInput("")).toBeNull();
    expect(signatureFromInput("0".repeat(88))).toBeNull(); // base58 has no 0
    expect(signatureFromInput("https://explorer.solana.com/tx/abc")).toBeNull();
    expect(signatureFromInput(`${SIG} extra`)).toBeNull();
  });
});
