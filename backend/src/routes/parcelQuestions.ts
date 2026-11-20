import type { ParcelVoiceAnswer } from "@groundtruth/shared";
import express, { type Request, type RequestHandler } from "express";
import { z } from "zod";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError } from "../http/errors.js";
import {
  answerParcelQuestion,
  type CheckSelector,
} from "../questions/answer.js";
import type { ParcelVoiceService } from "../questions/elevenlabs.js";
import {
  createQuestionRateLimiter,
  type QuestionRateLimiter,
} from "../questions/rateLimit.js";
import type { ParcelReportReader } from "./report.js";

const Question = z.object({
  question: z.string().trim().min(3).max(600),
});

export interface ParcelQuestionRouteOptions {
  reports: ParcelReportReader;
  selector?: CheckSelector;
  voice?: ParcelVoiceService;
  limiter?: QuestionRateLimiter;
}

export function parcelQuestionRoutes(options: ParcelQuestionRouteOptions): {
  text: RequestHandler[];
  voice: RequestHandler[];
} {
  const limiter = options.limiter ?? createQuestionRateLimiter();
  return {
    text: [
      express.json({ limit: "8kb", type: "application/json" }),
      // Order matters: 503 (off) before 400 (bad body) before the limiter, so
      // the web's empty-body probe learns on/off without spending a question.
      asyncRoute(async (req, res) => {
        const selector = requireSelector(options.selector);
        const parsed = Question.safeParse(req.body);
        if (!parsed.success) {
          throw new HttpError(
            400,
            "INVALID_REQUEST",
            "Ask one question between 3 and 600 characters.",
            false,
          );
        }
        rateLimit(req, res, limiter);
        const report = await options.reports.read(
          String(req.params.parcelKey ?? ""),
          String(res.locals.requestId),
        );
        res.json(
          await viaProvider(res, "Ask this lot", () =>
            answerParcelQuestion(report, parsed.data.question, selector),
          ),
        );
      }),
    ],
    voice: [
      express.raw({
        limit: "8mb",
        type: ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"],
      }),
      asyncRoute(async (req, res) => {
        const selector = requireSelector(options.selector);
        if (!options.voice) {
          throw new HttpError(
            503,
            "INTERNAL_ERROR",
            "Voice questions are not configured yet.",
            true,
          );
        }
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          throw new HttpError(
            400,
            "INVALID_REQUEST",
            "Record a question before sending it.",
            false,
          );
        }
        rateLimit(req, res, limiter);
        const voice = options.voice;
        const audioIn = req.body;
        const transcript = await viaProvider(res, "Voice transcription", () =>
          voice.transcribe(
            audioIn,
            req.headers["content-type"]?.split(";")[0] ?? "audio/webm",
          ),
        );
        const parsed = Question.safeParse({ question: transcript });
        if (!parsed.success) {
          throw new HttpError(
            400,
            "INVALID_REQUEST",
            "The recording did not contain a clear question.",
            false,
          );
        }
        const report = await options.reports.read(
          String(req.params.parcelKey ?? ""),
          String(res.locals.requestId),
        );
        const answer = await viaProvider(res, "Ask this lot", () =>
          answerParcelQuestion(report, parsed.data.question, selector),
        );
        const audio = await viaProvider(res, "Spoken answer", () =>
          voice.speak(answer.answer),
        );
        const response: ParcelVoiceAnswer = {
          ...answer,
          transcript,
          audio: {
            contentType: "audio/mpeg",
            base64: audio.toString("base64"),
          },
        };
        res.json(response);
      }),
    ],
  };
}

/** A model or voice outage is a retryable 502, never a guessed answer. */
async function viaProvider<T>(
  res: Parameters<RequestHandler>[1],
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const reason = error instanceof Error ? error.message : "unknown error";
    console.warn(
      `questions: ${label} failed request=${String(res.locals.requestId)} ${reason}`,
    );
    throw new HttpError(
      502,
      "INTERNAL_ERROR",
      `${label} is unavailable right now. Try again in a moment.`,
      true,
    );
  }
}

function requireSelector(selector: CheckSelector | undefined): CheckSelector {
  if (!selector) {
    throw new HttpError(
      503,
      "INTERNAL_ERROR",
      "Ask this lot is not configured yet.",
      true,
    );
  }
  return selector;
}

function rateLimit(
  req: Request,
  res: Parameters<RequestHandler>[1],
  limiter: QuestionRateLimiter,
): void {
  const result = limiter.take(clientKey(req));
  res.setHeader("x-ratelimit-limit", String(limiter.limit));
  if (!result.allowed) {
    res.setHeader("retry-after", String(result.retryAfterSeconds));
    throw new HttpError(
      429,
      "RATE_LIMITED",
      "Too many questions. Try again in a minute.",
      true,
    );
  }
}

/**
 * Railway (and Vercel's /api rewrite in front of it) terminate the connection,
 * so `req.ip` is the proxy for every buyer. The left-most forwarded address is
 * the client. A forged header only moves a caller into another bucket; the
 * limiter's global cap still bounds total model and voice spend.
 */
function clientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim();
  return first || req.ip || req.socket.remoteAddress || "unknown";
}
