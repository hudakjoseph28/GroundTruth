import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ApplyResult } from "../src/chain/applyEvent.js";
import type {
  ConfirmedEvent,
  ConfirmedTransaction,
} from "../src/chain/programEvents.js";

type Filter = (stream: unknown) => unknown;

const PROGRAM = "GTescrow1111111111111111111111111111111111";
const OTHER = "SigDHT99hPznk4d9SAxWLoBnKWT8jcob5pV8X7ti8SM";
const TOKEN = "filter-test-token";

function loadFilter(file: string, programId?: string): Filter {
  let source = readFileSync(
    new URL(`../quicknode/${file}`, import.meta.url),
    "utf8",
  );
  if (programId) {
    source = source.replace("REPLACE_WITH_ESCROW_PROGRAM_ID", programId);
  }
  return new Function(`${source}\nreturn main;`)() as Filter;
}

// Mirrors the Block dataset fields seen on devnet block 522700233.
function tx(opts: {
  sig: string;
  err?: unknown;
  top?: string[];
  inner?: string[];
  logs?: string[];
}) {
  return {
    version: 0,
    transaction: {
      signatures: [opts.sig],
      message: {
        accountKeys: [
          {
            pubkey: "8oYvqBeCAhQYhA7Fw2fxG2ZvYgmhUtEdtXhteT7xdbti",
            writable: true,
            signer: true,
            source: "transaction",
          },
        ],
        recentBlockhash: "BkrYc5YcvpYZfoPZDCmmABp2kUt5DjTpXuTrbJAGtAVJ",
        instructions: (opts.top ?? []).map((programId) => ({
          programId,
          accounts: [],
          data: "",
          stackHeight: 1,
        })),
      },
    },
    meta: {
      err: opts.err ?? null,
      status: opts.err ? { Err: opts.err } : { Ok: null },
      fee: 5000,
      innerInstructions: opts.inner
        ? [
            {
              index: 0,
              instructions: opts.inner.map((programId) => ({
                programId,
                accounts: [],
                data: "",
                stackHeight: 2,
              })),
            },
          ]
        : [],
      logMessages: opts.logs ?? [`Program ${PROGRAM} invoke [1]`],
    },
  };
}

function stream(transactions: unknown[], slot = 522700233) {
  return {
    metadata: {
      dataset: "block",
      network: "solana-devnet",
      batch_start_range: slot,
      batch_end_range: slot,
    },
    data: [
      {
        previousBlockhash: "Bwxemvtpi3dz2YjBi4rTv5E4kntSYuVk6BvfLqajcwsJ",
        blockhash: "BkrYc5YcvpYZfoPZDCmmABp2kUt5DjTpXuTrbJAGtAVJ",
        parentSlot: slot - 1,
        transactions,
        rewards: [],
        blockTime: 1794782508,
        blockHeight: 509820517,
        slot,
      },
    ],
  };
}

const sigs = {
  direct: "2".repeat(88),
  cpi: "3".repeat(88),
  failed: "4".repeat(88),
  other: "5".repeat(88),
};

async function deliver(body: unknown) {
  const raw = JSON.stringify(body);
  const nonce = "nonce";
  const ts = "1794782508";
  const decode = vi.fn<(tx: ConfirmedTransaction) => []>(() => []);
  const apply = vi.fn<(event: ConfirmedEvent) => Promise<ApplyResult>>();
  const app = createApp("test", { quicknode: { token: TOKEN, decode, apply } });
  const res = await request(app)
    .post("/api/webhooks/quicknode")
    .set("content-type", "application/json")
    .set({
      "x-qn-nonce": nonce,
      "x-qn-timestamp": ts,
      "x-qn-signature": createHmac("sha256", TOKEN)
        .update(nonce + ts)
        .update(raw)
        .digest("hex"),
    })
    .send(raw);
  return { res, decode };
}

describe("groundtruth-filter.js", () => {
  const filter = loadFilter("groundtruth-filter.js", PROGRAM);
  const block = stream([
    tx({ sig: sigs.direct, top: [PROGRAM] }),
    tx({
      sig: sigs.other,
      top: [OTHER],
      logs: [`Program ${OTHER} invoke [1]`],
    }),
    tx({ sig: sigs.cpi, top: [OTHER], inner: [PROGRAM] }),
    tx({
      sig: sigs.failed,
      top: [PROGRAM],
      err: { InstructionError: [0, { Custom: 6000 }] },
    }),
  ]);

  it("keeps successful program transactions, direct or via CPI, in block order", () => {
    expect(filter(block)).toEqual({
      transactions: [
        {
          signature: sigs.direct,
          slot: 522700233,
          blockTime: 1794782508,
          logMessages: [`Program ${PROGRAM} invoke [1]`],
        },
        {
          signature: sigs.cpi,
          slot: 522700233,
          blockTime: 1794782508,
          logMessages: [`Program ${PROGRAM} invoke [1]`],
        },
      ],
    });
  });

  it("returns null for a block without GroundTruth activity", () => {
    expect(filter(stream([tx({ sig: sigs.other, top: [OTHER] })]))).toBeNull();
    expect(filter(stream([]))).toBeNull();
  });

  it("matches nothing until the program ID is filled in", () => {
    expect(loadFilter("groundtruth-filter.js")(block)).toBeNull();
  });

  it("produces a body the webhook accepts", async () => {
    const { res, decode } = await deliver(filter(block));

    expect(res.status).toBe(204);
    expect(decode.mock.calls.map(([t]) => t.signature)).toEqual([
      sigs.direct,
      sigs.cpi,
    ]);
  });
});

describe("heartbeat-filter.js", () => {
  it("produces an empty batch the webhook accepts", async () => {
    const body = loadFilter("heartbeat-filter.js")(
      stream([tx({ sig: sigs.direct, top: [PROGRAM] })]),
    );

    expect(body).toEqual({ transactions: [] });
    const { res, decode } = await deliver(body);
    expect(res.status).toBe(204);
    expect(decode).not.toHaveBeenCalled();
  });
});
