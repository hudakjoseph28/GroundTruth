import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  MEMO_PROGRAM_ID,
  MEMO_PROGRAM_IDS,
  documentMemo,
} from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { documentHashFromMemos } from "../src/chain/documentMemo.js";
import { createEscrowDecoder } from "../src/chain/escrowDecoder.js";
import { toConfirmedEvents } from "../src/chain/programEvents.js";
import { decodeStreamPayload } from "../src/chain/streamPayload.js";
import {
  OTHER_PROGRAM,
  PROGRAM,
  dealKeys,
  events,
  heldReleaseLogs,
  invocation,
} from "./support/escrowLogs.js";

const HASH = createHash("sha256").update("septic evaluation").digest("hex");
const OTHER_HASH = createHash("sha256").update("another file").digest("hex");
const MEMO_V2 = "MemoSq4gqABAXKb96qnH8TyNmwnmJ6NerJ2SZcfSLgW";

const filterSource = readFileSync(
  new URL("../quicknode/groundtruth-filter.js", import.meta.url),
  "utf8",
);
const filter = new Function(`${filterSource}\nreturn main;`)() as (
  stream: unknown,
) => { transactions: Record<string, unknown>[] } | null;

/** A jsonParsed instruction: Memo programs come back parsed to their text. */
const memoIx = (text: string, programId: string = MEMO_PROGRAM_ID) => ({
  programId,
  program: "spl-memo",
  parsed: text,
  stackHeight: null,
});
const programIx = {
  programId: PROGRAM,
  accounts: [],
  data: "x",
  stackHeight: null,
};

/** One Block-dataset entry holding one successful transaction. */
function block(instructions: unknown[], logMessages: string[]) {
  return {
    data: [
      {
        slot: 523_850_000,
        blockTime: 1_794_800_000,
        transactions: [
          {
            transaction: {
              signatures: ["5".repeat(88)],
              message: { instructions },
            },
            meta: { err: null, innerInstructions: [], logMessages },
          },
        ],
      },
    ],
  };
}

describe("documentHashFromMemos", () => {
  it("reads the hash from a GroundTruth document memo", () => {
    expect(documentHashFromMemos([documentMemo(HASH)])).toBe(HASH);
    expect(documentHashFromMemos(["unrelated note", documentMemo(HASH)])).toBe(
      HASH,
    );
  });

  it("ignores memos that are not exactly a GroundTruth document hash", () => {
    for (const text of [
      "hello",
      `groundtruth:doc:${HASH.toUpperCase()}`,
      `groundtruth:doc:${HASH.slice(0, 63)}`,
      `groundtruth:doc:${HASH}x`,
      ` groundtruth:doc:${HASH}`,
      `other:doc:${HASH}`,
    ]) {
      expect(documentHashFromMemos([text])).toBeNull();
    }
  });

  it("cites nothing when one transaction names two different documents", () => {
    expect(
      documentHashFromMemos([documentMemo(HASH), documentMemo(OTHER_HASH)]),
    ).toBeNull();
    expect(
      documentHashFromMemos([documentMemo(HASH), documentMemo(HASH)]),
    ).toBe(HASH);
  });
});

describe("groundtruth-filter.js memos", () => {
  const logs = invocation(PROGRAM, [events(dealKeys()).approve("Septic")]);

  it("collects top-level Memo v1 and v2 instruction text", () => {
    const v1 = filter(block([programIx, memoIx(documentMemo(HASH))], logs));
    expect(v1?.transactions[0]?.memos).toEqual([documentMemo(HASH)]);
    const v2 = filter(
      block([programIx, memoIx(documentMemo(HASH), MEMO_V2)], logs),
    );
    expect(v2?.transactions[0]?.memos).toEqual([documentMemo(HASH)]);
  });

  it("ignores memo text in an instruction from a different program", () => {
    const body = filter(
      block(
        [
          programIx,
          memoIx(documentMemo(HASH), OTHER_PROGRAM),
          { programId: OTHER_PROGRAM, data: documentMemo(HASH) },
        ],
        logs,
      ),
    );
    expect(body?.transactions[0]).not.toHaveProperty("memos");
  });

  it("ignores memo-like log lines; only the instruction counts", () => {
    const body = filter(
      block(
        [programIx],
        [
          ...logs,
          ...invocation(OTHER_PROGRAM, [
            `Program log: Memo (len 80): "${documentMemo(HASH)}"`,
          ]),
        ],
      ),
    );
    expect(body?.transactions[0]).not.toHaveProperty("memos");
    const [approval] = decodeStreamPayload(body, createEscrowDecoder());
    expect(approval?.documentSha256).toBeUndefined();
  });

  it("sends no memos for a transaction that never touched GroundTruth", () => {
    expect(
      filter(block([memoIx(documentMemo(HASH))], ["Program log: hi"])),
    ).toBeNull();
  });

  it("uses the same Memo program IDs as the shared contract", () => {
    for (const id of MEMO_PROGRAM_IDS)
      expect(filterSource).toContain(`"${id}"`);
    expect(MEMO_PROGRAM_IDS).toContain(MEMO_PROGRAM_ID);
  });

  it("is accepted by the webhook payload schema and reaches the approval", () => {
    const body = filter(block([programIx, memoIx(documentMemo(HASH))], logs));
    const [approval] = decodeStreamPayload(body, createEscrowDecoder());
    expect(approval?.event.name).toBe("ApprovalSigned");
    expect(approval?.documentSha256).toBe(HASH);
  });
});

describe("toConfirmedEvents with memos", () => {
  const decode = createEscrowDecoder();
  const k = dealKeys();
  const e = events(k);
  const base = {
    signature: "5".repeat(88),
    slot: 1,
    blockTime: 1_794_700_800,
  };

  it("attaches nothing to an approval without a document memo", () => {
    const logMessages = invocation(PROGRAM, [e.approve("Septic")]);
    const [approval] = toConfirmedEvents(
      { ...base, logMessages, memos: ["just a note"] },
      decode,
    );
    expect(approval?.documentSha256).toBeUndefined();
  });

  it("attaches nothing to a failed transaction", () => {
    const [rejected] = toConfirmedEvents(
      {
        ...base,
        logMessages: heldReleaseLogs(),
        memos: [documentMemo(HASH)],
        err: { InstructionError: [0, { Custom: 6019 }] },
        releaseAccounts: [k.buyer.toBase58(), k.deal.toBase58()],
      },
      decode,
    );
    expect(rejected?.event.name).toBe("ReleaseRejected");
    expect(rejected?.documentSha256).toBeUndefined();
  });
});
