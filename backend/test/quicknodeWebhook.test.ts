import { createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { ApplyResult } from "../src/chain/applyEvent.js";
import type {
  ConfirmedEvent,
  ConfirmedTransaction,
  ProgramEvent,
} from "../src/chain/programEvents.js";

const TOKEN = "qn-test-token";
const URL = "/api/webhooks/quicknode";
const SIG_A = "5".repeat(88);
const SIG_B = "4".repeat(88);
const PDA = "9".repeat(44);

const funded: ProgramEvent = {
  name: "DealFunded",
  dealPda: PDA,
  dealId: "ab".repeat(32),
  amountBaseUnits: "25000000",
};
const approved: ProgramEvent = {
  name: "ApprovalSigned",
  dealPda: PDA,
  dealId: "ab".repeat(32),
  reviewerWallet: "66EpT1ZYPxzYJAvhkbb8dzphLmdK6grtvv3LxRE8hLeN",
  role: "title",
};

const payload = {
  transactions: [
    {
      signature: SIG_A,
      slot: 100,
      blockTime: 1_763_200_000,
      logMessages: ["a"],
    },
    {
      signature: SIG_B,
      slot: 101,
      blockTime: 1_763_200_001,
      logMessages: ["b"],
    },
  ],
};

function sign(
  body: Buffer | string,
  token = TOKEN,
  nonce = "n-1",
  ts = "1763200000",
) {
  return {
    "x-qn-nonce": nonce,
    "x-qn-timestamp": ts,
    "x-qn-signature": createHmac("sha256", token)
      .update(nonce + ts)
      .update(body)
      .digest("hex"),
  };
}

function setup(
  decode = vi.fn((tx: ConfirmedTransaction): ProgramEvent[] =>
    tx.signature === SIG_A ? [funded] : [approved, approved],
  ),
) {
  const apply = vi.fn<(event: ConfirmedEvent) => Promise<ApplyResult>>(
    async () => "applied",
  );
  const app = createApp("test", { quicknode: { token: TOKEN, decode, apply } });
  return { app, apply, decode };
}

function post(app: ReturnType<typeof createApp>, body: Buffer | string) {
  return request(app)
    .post(URL)
    .set("content-type", "application/json")
    .send(body);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/quicknode", () => {
  it("refuses every delivery when no Stream token is configured", async () => {
    const app = createApp("test");
    const body = JSON.stringify(payload);

    const res = await post(app, body).set(sign(body));

    expect(res.status).toBe(503);
    expect(res.body.error.retryable).toBe(true);
  });

  it("applies each decoded event in chain order with per-transaction indexes", async () => {
    const { app, apply, decode } = setup();
    const body = JSON.stringify(payload);

    const res = await post(app, body).set(sign(body));

    expect(res.status).toBe(204);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls.map(([event]) => event)).toEqual([
      {
        signature: SIG_A,
        slot: 100,
        blockTime: 1_763_200_000,
        eventIndex: 0,
        event: funded,
      },
      {
        signature: SIG_B,
        slot: 101,
        blockTime: 1_763_200_001,
        eventIndex: 0,
        event: approved,
      },
      {
        signature: SIG_B,
        slot: 101,
        blockTime: 1_763_200_001,
        eventIndex: 1,
        event: approved,
      },
    ]);
  });

  it("verifies a gzip delivery against the decompressed body", async () => {
    const { app, apply } = setup();
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post(URL)
      .set("content-type", "application/json")
      .set("content-encoding", "gzip")
      .set(sign(body))
      // Send the gzip bytes as-is; supertest would JSON-encode a Buffer.
      .serialize((raw: unknown) => raw as string)
      .send(gzipSync(body));

    expect(res.status).toBe(204);
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it("accepts an empty batch", async () => {
    const { app, apply } = setup();
    const body = JSON.stringify({ transactions: [] });

    const res = await post(app, body).set(sign(body));

    expect(res.status).toBe(204);
    expect(apply).not.toHaveBeenCalled();
  });

  describe("rejects with 401 and applies nothing when", () => {
    const body = JSON.stringify(payload);
    const cases: [string, Record<string, string>, string][] = [
      ["headers are missing", {}, body],
      ["the token differs", sign(body, "other-token"), body],
      ["the body was altered", sign(body), body.replace("100", "999")],
      ["the nonce was altered", { ...sign(body), "x-qn-nonce": "n-2" }, body],
      [
        "the signature is not hex",
        { ...sign(body), "x-qn-signature": "zz" },
        body,
      ],
    ];

    it.each(cases)("%s", async (_label, headers, sent) => {
      const { app, apply } = setup();

      const res = await post(app, sent).set(headers);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(apply).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["not JSON", "{not json"],
    ["wrong shape", JSON.stringify({ data: [] })],
    [
      "bad signature string",
      JSON.stringify({
        transactions: [{ ...payload.transactions[0], signature: "0OIl" }],
      }),
    ],
    [
      "fractional slot",
      JSON.stringify({
        transactions: [{ ...payload.transactions[0], slot: 1.5 }],
      }),
    ],
  ])(
    "rejects a signed but malformed payload (%s) with 400",
    async (_label, body) => {
      const { app, apply } = setup();

      const res = await post(app, body).set(sign(body));

      expect(res.status).toBe(400);
      expect(apply).not.toHaveBeenCalled();
    },
  );

  it("answers 500 without applying anything while the program IDL is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const apply = vi.fn();
    const app = createApp("test", { quicknode: { token: TOKEN, apply } });
    const body = JSON.stringify(payload);

    const res = await post(app, body).set(sign(body));

    expect(res.status).toBe(500);
    expect(res.body.error.retryable).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("answers 500 so QuickNode retries when applying an event fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, apply } = setup();
    apply.mockRejectedValueOnce(new Error("database unavailable"));
    const body = JSON.stringify(payload);

    const res = await post(app, body).set(sign(body));

    expect(res.status).toBe(500);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).not.toContain(
      "database unavailable",
    );
  });
});
