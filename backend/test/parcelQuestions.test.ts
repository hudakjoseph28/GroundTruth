import {
  goldenReport,
  type CheckKind,
  type ParcelReport,
} from "@groundtruth/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, type AppOptions } from "../src/app.js";
import type { ParcelVoiceService } from "../src/questions/elevenlabs.js";
import type { ReportStore } from "../src/reports/store.js";
import {
  answerParcelQuestion,
  type CheckSelector,
} from "../src/questions/answer.js";
import { createOpenAiCheckSelector } from "../src/questions/openai.js";
import { createQuestionRateLimiter } from "../src/questions/rateLimit.js";
import { REFUSAL_QUESTIONS } from "./fixtures/refusalQuestions.js";

const choose = (...checkKinds: CheckKind[]): CheckSelector => ({
  select: vi.fn(async () => ({
    mode: "answered" as const,
    checkKinds,
    responsibleCheckKind: checkKinds[0] ?? null,
  })),
});

describe("Ask this lot grounding", () => {
  it.each([
    ["What does the report say about road access?", "access"],
    ["What flood zone is shown?", "flood"],
    ["What does the zoning record say?", "zoning"],
  ] as const)(
    "answers %s only from its cited check",
    async (question, kind) => {
      const answer = await answerParcelQuestion(
        goldenReport,
        question,
        choose(kind),
      );
      const check = goldenReport.checks.find((item) => item.kind === kind)!;
      expect(answer.covered).toBe(true);
      expect(answer.answer).toContain(check.finding);
      expect(answer.answer).toContain(check.limitation);
      expect(answer.citations.length).toBe(check.sources.length);
      expect(
        answer.citations.every(
          (citation) => citation.checkKind === kind && citation.source,
        ),
      ).toBe(true);
      expect(answer.answer).not.toMatch(/\bsafe\b|\byou can build\b/i);
    },
  );

  it.each(REFUSAL_QUESTIONS)(
    "refuses unsupported question: %s",
    async (question) => {
      const selector = choose("zoning");
      const answer = await answerParcelQuestion(
        goldenReport,
        question,
        selector,
      );
      expect(answer.covered).toBe(false);
      expect(answer.answer).toContain("I don't know from the report");
      expect(answer.responsibleParty.role).toBeTruthy();
      expect(answer.citations[0]?.checkTitle).toBeTruthy();
      expect(answer.answer).not.toMatch(/\bsafe\b|\byou can build\b/i);
      expect(selector.select).not.toHaveBeenCalled();
    },
  );

  it("drops a check the model picks outside the eligible set", async () => {
    const answer = await answerParcelQuestion(
      goldenReport,
      "What does the report say about road access?",
      choose("flood"),
    );
    expect(answer.covered).toBe(false);
    expect(answer.answer).toContain("I don't know from the report");
    expect(answer.answer).not.toContain(
      goldenReport.checks.find((check) => check.kind === "flood")!.finding,
    );
  });

  it("refuses an unknown check instead of calling the model", async () => {
    const selector = choose("easements");
    const answer = await answerParcelQuestion(
      goldenReport,
      "Is there a recorded easement on the lot?",
      selector,
    );
    expect(answer.covered).toBe(false);
    expect(answer.responsibleParty.role).toBe("Title reviewer");
    expect(answer.citations[0]).toMatchObject({ checkKind: "easements" });
    expect(answer.citations[0]).not.toHaveProperty("source");
    expect(selector.select).not.toHaveBeenCalled();
  });

  it("sends the full report in a strict structured-output request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.input[0].content).toContain(JSON.stringify(goldenReport));
      expect(request.text.format.strict).toBe(true);
      return new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    mode: "answered",
                    checkKinds: ["flood"],
                    responsibleCheckKind: "flood",
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const selector = createOpenAiCheckSelector({
      apiKey: "server-secret",
      model: "gpt-test",
      fetch,
    });
    await expect(
      selector.select({
        question: "What flood zone is shown?",
        report: goldenReport,
        eligibleKinds: ["flood"],
      }),
    ).resolves.toMatchObject({ checkKinds: ["flood"] });
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("Ask this lot rate limit", () => {
  it("caps all clients together", () => {
    const limiter = createQuestionRateLimiter({
      globalLimit: 2,
      now: () => 1_000,
    });
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("b").allowed).toBe(true);
    expect(limiter.take("c").allowed).toBe(false);
  });

  it("shares one six-question window", () => {
    const limiter = createQuestionRateLimiter({ now: () => 1_000 });
    for (let index = 0; index < 6; index += 1) {
      expect(limiter.take("buyer").allowed).toBe(true);
    }
    expect(limiter.take("buyer")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.take("other").allowed).toBe(true);
  });
});

const path = (key = goldenReport.parcelKey) =>
  `/api/parcels/${encodeURIComponent(key)}/questions`;

function storeWith(report: ParcelReport): ReportStore {
  return {
    read: vi.fn(async (key: string) =>
      key === report.parcelKey ? report : null,
    ),
    write: vi.fn(async () => {}),
  };
}

function appWith(questions: AppOptions["questions"]) {
  return createApp("test-commit", {
    report: { store: storeWith(goldenReport) },
    questions,
  });
}

describe("POST /api/parcels/:parcelKey/questions", () => {
  it("answers from the server-loaded report and cites its sources", async () => {
    const selector = choose("flood");
    const res = await request(appWith({ selector }))
      .post(path())
      .send({ question: "What flood zone is shown?" });
    expect(res.status).toBe(200);
    expect(res.body.covered).toBe(true);
    expect(res.body.citations[0]).toMatchObject({ checkKind: "flood" });
    expect(res.body.citations[0].source.url).toMatch(/^https:/);
    const args = vi.mocked(selector.select).mock.calls[0]![0];
    expect(args.report).toEqual(goldenReport);
  });

  it("ignores a report the client tries to supply", async () => {
    const selector = choose("flood");
    await request(appWith({ selector }))
      .post(path())
      .send({ question: "What flood zone is shown?", report: { checks: [] } });
    const args = vi.mocked(selector.select).mock.calls[0]![0];
    expect(args.report).toEqual(goldenReport);
  });

  it("rejects an empty question", async () => {
    const res = await request(appWith({ selector: choose("flood") }))
      .post(path())
      .send({ question: " " });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });

  it("answers an empty-body probe 400 when on, without spending a question", async () => {
    const app = appWith({
      selector: choose("flood"),
      limiter: createQuestionRateLimiter({ limit: 1, now: () => 5_000 }),
    });
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).post(path()).send({})).status).toBe(400);
    }
    const res = await request(app)
      .post(path())
      .send({ question: "What flood zone is shown?" });
    expect(res.status).toBe(200);
  });

  it("answers 503 when no model key is configured", async () => {
    const res = await request(appWith({}))
      .post(path())
      .send({ question: "What flood zone is shown?" });
    expect(res.status).toBe(503);
    expect(res.body.error.retryable).toBe(true);
  });

  it("turns a model outage into a retryable 502, not an answer", async () => {
    const selector: CheckSelector = {
      select: vi.fn(async () => {
        throw new Error("OpenAI response 500");
      }),
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await request(appWith({ selector }))
      .post(path())
      .send({ question: "What flood zone is shown?" });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ retryable: true });
    expect(res.body).not.toHaveProperty("answer");
  });

  it("limits each forwarded client separately with 429 and retry-after", async () => {
    const app = appWith({
      selector: choose("flood"),
      limiter: createQuestionRateLimiter({ limit: 1, now: () => 5_000 }),
    });
    const ask = (ip: string) =>
      request(app)
        .post(path())
        .set("x-forwarded-for", `${ip}, 10.0.0.1`)
        .send({ question: "What flood zone is shown?" });
    expect((await ask("203.0.113.5")).status).toBe(200);
    const limited = await ask("203.0.113.5");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(limited.headers["retry-after"]).toBe("60");
    expect((await ask("198.51.100.7")).status).toBe(200);
  });
});

describe("POST /api/parcels/:parcelKey/questions/voice", () => {
  const voice = (): ParcelVoiceService => ({
    transcribe: vi.fn(async () => "How much are the annual property taxes?"),
    speak: vi.fn(async () => Buffer.from("mp3")),
  });

  it("transcribes, answers on the same report-only path, and speaks the answer", async () => {
    const service = voice();
    const selector = choose("zoning");
    const res = await request(appWith({ selector, voice: service }))
      .post(`${path()}/voice`)
      .set("content-type", "audio/webm;codecs=opus")
      .send(Buffer.from("fake-audio"));
    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("How much are the annual property taxes?");
    expect(res.body.covered).toBe(false);
    expect(res.body.answer).toContain("I don't know from the report");
    expect(service.transcribe).toHaveBeenCalledWith(
      expect.any(Buffer),
      "audio/webm",
    );
    expect(service.speak).toHaveBeenCalledWith(res.body.answer);
    expect(Buffer.from(res.body.audio.base64, "base64").toString()).toBe("mp3");
    expect(selector.select).not.toHaveBeenCalled();
  });

  it("answers an empty recording 400 when voice is on", async () => {
    const res = await request(
      appWith({ selector: choose("flood"), voice: voice() }),
    )
      .post(`${path()}/voice`)
      .set("content-type", "audio/webm")
      .send(Buffer.alloc(0));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });

  it("answers 503 when voice is not configured", async () => {
    const res = await request(appWith({ selector: choose("flood") }))
      .post(`${path()}/voice`)
      .set("content-type", "audio/webm")
      .send(Buffer.from("fake-audio"));
    expect(res.status).toBe(503);
  });
});
