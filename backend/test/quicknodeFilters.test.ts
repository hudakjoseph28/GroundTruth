import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { utils, web3 } from "@anchor-lang/core";
import {
  GROUNDTRUTH_ESCROW_IDL,
  GROUNDTRUTH_PROGRAM_ID,
} from "@groundtruth/shared";
import type { ApplyResult } from "../src/chain/applyEvent.js";
import { createEscrowDecoder } from "../src/chain/escrowDecoder.js";
import {
  dealKeys,
  events,
  heldReleaseLogs,
  invocation,
  releaseAccounts,
} from "./support/escrowLogs.js";
import type {
  ConfirmedEvent,
  ConfirmedTransaction,
} from "../src/chain/programEvents.js";

type Filter = (stream: unknown) => unknown;

const PROGRAM = GROUNDTRUTH_PROGRAM_ID;
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

interface Ix {
  programId: string;
  data?: string;
  accounts?: string[];
}

// Mirrors the Block dataset fields seen on devnet block 522700233.
function tx(opts: {
  sig: string;
  err?: unknown;
  top?: (string | Ix)[];
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
        instructions: (opts.top ?? []).map((ix) => {
          const {
            programId,
            data = "",
            accounts = [],
          } = typeof ix === "string" ? { programId: ix } : ix;
          return { programId, accounts, data, stackHeight: 1 };
        }),
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

async function deliver(
  body: unknown,
  decodeWith?: (tx: ConfirmedTransaction) => ConfirmedEvent["event"][],
) {
  const raw = JSON.stringify(body);
  const nonce = "nonce";
  const ts = "1794782508";
  const decode = vi.fn<(tx: ConfirmedTransaction) => ConfirmedEvent["event"][]>(
    decodeWith ?? (() => []),
  );
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
  return { res, decode, apply };
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

// Uses IDL-encoded test data (test/support/escrowLogs.ts), not devnet logs.
describe("groundtruth-filter.js: failed releases", () => {
  const RELEASE = utils.bytes.bs58.encode(
    Buffer.from(
      GROUNDTRUTH_ESCROW_IDL.instructions.find((ix) => ix.name === "release")!
        .discriminator,
    ),
  );
  const SIGN_APPROVAL = utils.bytes.bs58.encode(
    Buffer.from(
      GROUNDTRUTH_ESCROW_IDL.instructions.find(
        (ix) => ix.name === "sign_approval",
      )!.discriminator,
    ),
  );
  const keys = dealKeys();
  const accounts = releaseAccounts(keys, web3.Keypair.generate().publicKey);
  const held = { InstructionError: [0, { Custom: 6019 }] };

  it("matches release by the IDL's discriminator", () => {
    const source = readFileSync(
      new URL("../quicknode/groundtruth-filter.js", import.meta.url),
      "utf8",
    );
    expect(source).toContain(`const RELEASE_IX_DATA = "${RELEASE}";`);
  });

  it("sends a failed release with its error and accounts, and no other failure", () => {
    const filter = loadFilter("groundtruth-filter.js", PROGRAM);
    const body = filter(
      stream([
        tx({
          sig: sigs.failed,
          top: [{ programId: PROGRAM, data: RELEASE, accounts }],
          err: held,
          logs: heldReleaseLogs(),
        }),
        // Another GroundTruth instruction failed: not a rejected payout.
        tx({
          sig: sigs.other,
          top: [{ programId: PROGRAM, data: SIGN_APPROVAL }],
          err: { InstructionError: [0, { Custom: 6016 }] },
        }),
        // An earlier instruction failed, so the release never ran.
        tx({
          sig: sigs.cpi,
          top: [OTHER, { programId: PROGRAM, data: RELEASE, accounts }],
          err: { InstructionError: [0, { Custom: 1 }] },
        }),
      ]),
    );

    expect(body).toEqual({
      transactions: [
        {
          signature: sigs.failed,
          slot: 522700233,
          blockTime: 1794782508,
          logMessages: heldReleaseLogs(),
          err: held,
          releaseAccounts: accounts,
        },
      ],
    });
  });

  it("round-trips through the webhook and the real decoder into a rejection and events", async () => {
    const filter = loadFilter("groundtruth-filter.js", PROGRAM);
    const e = events(keys);
    const body = filter(
      stream([
        tx({
          sig: sigs.direct,
          top: [PROGRAM],
          logs: invocation(PROGRAM, [e.hold()]),
        }),
        tx({
          sig: sigs.failed,
          top: [{ programId: PROGRAM, data: RELEASE, accounts }],
          err: held,
          logs: heldReleaseLogs(),
        }),
      ]),
    );

    const { res, apply } = await deliver(body, createEscrowDecoder(PROGRAM));

    expect(res.status).toBe(204);
    expect(
      apply.mock.calls.map(([event]) => [event.signature, event.event.name]),
    ).toEqual([
      [sigs.direct, "HoldPlaced"],
      [sigs.failed, "ReleaseRejected"],
    ]);
    expect(apply.mock.calls[1]?.[0].event).toEqual({
      name: "ReleaseRejected",
      dealPda: keys.deal.toBase58(),
      errorName: "DealHeld",
      errorNumber: 6019,
    });
  });

  it("rejects a failed transaction without release accounts, and a success with them", async () => {
    const entry = {
      signature: sigs.failed,
      slot: 1,
      blockTime: 1794782508,
      logMessages: heldReleaseLogs(),
    };
    expect(
      (await deliver({ transactions: [{ ...entry, err: held }] })).res.status,
    ).toBe(400);
    expect(
      (
        await deliver({
          transactions: [{ ...entry, releaseAccounts: accounts }],
        })
      ).res.status,
    ).toBe(400);
  });
});
