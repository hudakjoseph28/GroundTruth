import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import {
  buyerMessage,
  parseOwnerCallWebhook,
  type OwnerCall,
  type RecordResult,
} from "../src/voice/ownerCall.js";
import { verifyElevenLabsSignature } from "../src/webhooks/elevenlabsSignature.js";
import {
  AGENT_ID,
  NOW,
  NOW_SECS,
  initiationFailure,
  signHeader,
  transcription,
} from "./support/elevenlabsPayloads.js";

const SECRET = "wsec_test_secret";
const URL = "/api/webhooks/elevenlabs";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyElevenLabsSignature", () => {
  const body = JSON.stringify(transcription());
  const verify = (header: string, raw = body, now = NOW) =>
    verifyElevenLabsSignature({
      secret: SECRET,
      header,
      body: Buffer.from(raw),
      now,
    });

  it("accepts the t=…,v0=… header ElevenLabs sends, in either order", () => {
    const header = signHeader(body, SECRET);
    expect(verify(header)).toEqual({ ok: true });
    const [t, v0] = header.split(",");
    expect(verify(`${v0},${t}`)).toEqual({ ok: true });
  });

  it.each([
    ["another secret", () => signHeader(body, "other"), body],
    [
      "an altered body",
      () => signHeader(body, SECRET),
      body.replace("not selling", "selling"),
    ],
  ])("rejects %s", (_label, header, raw) => {
    expect(verify(header(), raw)).toEqual({ ok: false, reason: "mismatch" });
  });

  it.each(["", "v0=abc", "t=123", "t=abc,v0=" + "0".repeat(64), "t=1,v0=zz"])(
    "rejects a malformed header %j",
    (header) => {
      expect(verify(header)).toEqual({ ok: false, reason: "malformed" });
    },
  );

  it("rejects a signature older than 30 minutes, like the SDK", () => {
    const old = NOW_SECS - 31 * 60;
    expect(verify(signHeader(body, SECRET, old))).toEqual({
      ok: false,
      reason: "stale",
    });
    const recent = NOW_SECS - 29 * 60;
    expect(verify(signHeader(body, SECRET, recent))).toEqual({ ok: true });
  });
});

describe("parseOwnerCallWebhook", () => {
  const call = (payload: unknown): OwnerCall => {
    const parsed = parseOwnerCallWebhook(payload);
    if (parsed?.kind !== "call") throw new Error("expected a call");
    return parsed.call;
  };

  it.each([
    ["not_selling", "ownerDeniesSale"],
    [" Not_Selling ", "ownerDeniesSale"],
    ["selling", "ownerConfirmsSale"],
    ["unclear", "unclear"],
    ["maybe", "unclear"],
    [true, "unclear"],
    [undefined, "unclear"],
  ])("maps sale_answer %j to %s", (saleAnswer, outcome) => {
    expect(call(transcription({ saleAnswer })).outcome).toBe(outcome);
  });

  it("keeps only the contract's fields from a finished call", () => {
    expect(call(transcription({ saleAnswer: "not_selling" }))).toEqual({
      conversationId: "conv_01testcallnotselling",
      agentId: AGENT_ID,
      dealId: "staged-devnet-deal",
      completedAt: new Date((NOW_SECS - 75 + 42) * 1000),
      participantLabel: "Satya (teammate, consented)",
      callSuccessful: "success",
      outcome: "ownerDeniesSale",
    });
  });

  it("treats a call without analysis as unclear", () => {
    expect(call(transcription({ omitAnalysis: true }))).toMatchObject({
      outcome: "unclear",
      callSuccessful: "unknown",
    });
  });

  it("turns an initiation failure into no answer", () => {
    expect(call(initiationFailure({ reason: "busy" }))).toMatchObject({
      outcome: "noAnswer",
      callSuccessful: "notConnected",
      failureReason: "busy",
      dealId: "staged-devnet-deal",
      completedAt: NOW,
    });
  });

  it("ignores audio and unknown event types, and rejects non-webhooks", () => {
    expect(
      parseOwnerCallWebhook({ type: "post_call_audio", data: {} }),
    ).toEqual({
      kind: "ignored",
      type: "post_call_audio",
    });
    expect(parseOwnerCallWebhook({ hello: "world" })).toBeNull();
    expect(
      parseOwnerCallWebhook({ type: "post_call_transcription", data: {} }),
    ).toBeNull();
  });

  it("names the reviewer, not an approval, in every message", () => {
    for (const outcome of [
      "ownerDeniesSale",
      "ownerConfirmsSale",
      "unclear",
      "noAnswer",
    ] as const) {
      const message = buyerMessage({ ...call(transcription()), outcome });
      expect(message).toMatch(/reviewer/);
      expect(message).not.toMatch(/approved|released|blocked/i);
    }
  });
});

describe("POST /api/webhooks/elevenlabs", () => {
  function setup(agentId?: string) {
    const record = vi.fn<(call: OwnerCall) => Promise<RecordResult>>(
      async () => "recorded",
    );
    const app = createApp("test", {
      elevenlabs: { secret: SECRET, agentId, record, now: () => NOW },
    });
    return { app, record };
  }

  const post = (
    app: ReturnType<typeof createApp>,
    raw: string,
    header?: string,
  ) => {
    const req = request(app).post(URL).set("content-type", "application/json");
    return (header ? req.set("elevenlabs-signature", header) : req).send(raw);
  };

  it("refuses every delivery when no secret is configured", async () => {
    const raw = JSON.stringify(transcription());
    const res = await post(createApp("test"), raw, signHeader(raw, SECRET));

    expect(res.status).toBe(503);
    expect(res.body.error.retryable).toBe(true);
  });

  it("records a verified call and answers 200, which ElevenLabs requires", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { app, record } = setup();
    const raw = JSON.stringify(transcription({ saleAnswer: "not_selling" }));

    const res = await post(app, raw, signHeader(raw, SECRET));

    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0]![0]).toMatchObject({
      conversationId: "conv_01testcallnotselling",
      outcome: "ownerDeniesSale",
    });
  });

  it("logs IDs and the outcome, never transcript text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { app } = setup();
    const raw = JSON.stringify(transcription({ saleAnswer: "not_selling" }));

    await post(app, raw, signHeader(raw, SECRET));

    expect(log.mock.calls.map(([line]) => line)).toEqual([
      "elevenlabs recorded ownerDeniesSale conv_01testcallnotselling deal=staged-devnet-deal",
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /not selling that lot|Am I speaking/,
    );
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "wrong"],
    ["an expired signature", "stale"],
  ])("rejects %s with 401 and records nothing", async (_label, mode) => {
    const { app, record } = setup();
    const raw = JSON.stringify(transcription());
    const header =
      mode === undefined
        ? undefined
        : mode === "stale"
          ? signHeader(raw, SECRET, NOW_SECS - 3600)
          : signHeader(raw, "wrong");

    const res = await post(app, raw, header);

    expect(res.status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });

  it("rejects a signed body that is not a post-call event with 400", async () => {
    const { app, record } = setup();
    const raw = JSON.stringify({ type: "post_call_transcription", data: {} });

    const res = await post(app, raw, signHeader(raw, SECRET));

    expect(res.status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  it("acknowledges audio deliveries without storing them", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { app, record } = setup();
    const raw = JSON.stringify({
      type: "post_call_audio",
      event_timestamp: NOW_SECS,
      data: { conversation_id: "c", agent_id: AGENT_ID, full_audio: "AAAA" },
    });

    const res = await post(app, raw, signHeader(raw, SECRET));

    expect(res.status).toBe(200);
    expect(record).not.toHaveBeenCalled();
  });

  it("ignores calls from another agent when ELEVENLABS_AGENT_ID is set", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { app, record } = setup(AGENT_ID);
    const raw = JSON.stringify(transcription({ agentId: "agent_someoneelse" }));

    const res = await post(app, raw, signHeader(raw, SECRET));

    expect(res.status).toBe(200);
    expect(record).not.toHaveBeenCalled();
  });

  it("answers 500 so ElevenLabs retries when storing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, record } = setup();
    record.mockRejectedValueOnce(new Error("database unavailable"));
    const raw = JSON.stringify(transcription());

    const res = await post(app, raw, signHeader(raw, SECRET));

    expect(res.status).toBe(500);
  });
});

describe("sale_answer in workspace data points", () => {
  // Workspace-shared data points are keyed by an item ID, not the name
  // (seen on the real agent: platform_settings.data_collection.aitem_…).
  const ITEM = "aitem_6401m7qwc98bfh0rv197rpyekyvq";
  const withResults = (analysis: Record<string, unknown>) => {
    const payload = transcription();
    payload.data.analysis = {
      call_successful: "success",
      transcript_summary: "",
      evaluation_criteria_results: {},
      data_collection_results: {},
      ...analysis,
    };
    return payload;
  };
  const outcomeOf = (payload: unknown) => {
    const parsed = parseOwnerCallWebhook(payload);
    if (parsed?.kind !== "call") throw new Error("expected a call");
    return parsed.call.outcome;
  };

  it("finds the answer keyed by item ID with the name in `name`", () => {
    const payload = withResults({
      data_collection_results: {
        [ITEM]: {
          data_collection_id: ITEM,
          name: "sale_answer",
          value: "not_selling",
          rationale: "",
        },
      },
    });
    expect(outcomeOf(payload)).toBe("ownerDeniesSale");
  });

  it("finds the answer when data_collection_id is the name", () => {
    const payload = withResults({
      data_collection_results: {
        [ITEM]: {
          data_collection_id: "sale_answer",
          value: "selling",
          rationale: "",
        },
      },
    });
    expect(outcomeOf(payload)).toBe("ownerConfirmsSale");
  });

  it("finds the answer in the list form", () => {
    const payload = withResults({
      data_collection_results_list: [
        {
          data_collection_id: ITEM,
          name: "sale_answer",
          value: "not_selling",
          rationale: "",
        },
      ],
    });
    expect(outcomeOf(payload)).toBe("ownerDeniesSale");
  });

  it("ignores other fields, even when they say not_selling", () => {
    const payload = withResults({
      data_collection_results: {
        aitem_other: {
          data_collection_id: "aitem_other",
          name: "mood",
          value: "not_selling",
          rationale: "",
        },
      },
    });
    expect(outcomeOf(payload)).toBe("unclear");
  });
});
