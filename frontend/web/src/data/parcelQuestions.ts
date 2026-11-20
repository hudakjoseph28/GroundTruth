import type {
  ParcelAnswer,
  ParcelAnswerCitation,
  ParcelVoiceAnswer,
} from "@groundtruth/shared";
import { postBinary, postJson, type FailedOutcome } from "./api";

export type QuestionOutcome =
  | { status: "answered"; answer: ParcelAnswer }
  | FailedOutcome;

export type VoiceQuestionOutcome =
  | { status: "answered"; answer: ParcelVoiceAnswer }
  | FailedOutcome;

export async function askParcel(
  parcelKey: string,
  question: string,
): Promise<QuestionOutcome> {
  const response = await postJson(questionPath(parcelKey), { question });
  if (response.status === "ok" && isParcelAnswer(response.body)) {
    return { status: "answered", answer: response.body };
  }
  return failure(response);
}

export async function askParcelByVoice(
  parcelKey: string,
  recording: Blob,
): Promise<VoiceQuestionOutcome> {
  const response = await postBinary(
    `${questionPath(parcelKey)}/voice`,
    recording,
  );
  if (response.status === "ok" && isVoiceAnswer(response.body)) {
    return { status: "answered", answer: response.body };
  }
  return failure(response);
}

export interface AskAvailability {
  text: boolean;
  voice: boolean;
}

/**
 * Whether this API can answer typed and spoken questions. Both routes answer
 * 503 before reading the body when their provider key is missing, and 400 for
 * an empty body when it is set; neither spends a rate-limited question. Any
 * other answer, including an older API without the route, counts as off.
 * backend/test/parcelQuestions.test.ts pins both answers.
 */
export async function askAvailability(
  parcelKey: string,
  signal?: AbortSignal,
): Promise<AskAvailability> {
  const on = (response: Awaited<ReturnType<typeof postJson>>) =>
    response.status === "rejected" &&
    response.error.error.code === "INVALID_REQUEST";
  const text = on(await postJson(questionPath(parcelKey), {}, signal));
  if (!text) return { text: false, voice: false };
  const voice = on(
    await postBinary(
      `${questionPath(parcelKey)}/voice`,
      new Blob([], { type: "audio/webm" }),
      signal,
    ),
  );
  return { text, voice };
}

function questionPath(parcelKey: string): string {
  return `/api/parcels/${encodeURIComponent(parcelKey)}/questions`;
}

function failure(
  response: Awaited<ReturnType<typeof postJson>>,
): FailedOutcome {
  if (response.status === "failed") return response.failure;
  if (response.status === "rejected") {
    return {
      status: "error",
      message: response.error.error.message,
      retryable: response.error.error.retryable,
    };
  }
  return {
    status: "error",
    message: "The answer could not be read. Try again.",
    retryable: true,
  };
}

function isParcelAnswer(value: unknown): value is ParcelAnswer {
  if (!value || typeof value !== "object") return false;
  const answer = value as Partial<ParcelAnswer>;
  return (
    typeof answer.answer === "string" &&
    typeof answer.covered === "boolean" &&
    Array.isArray(answer.citations) &&
    answer.citations.every(isCitation) &&
    Boolean(
      answer.responsibleParty &&
      typeof answer.responsibleParty.role === "string",
    )
  );
}

function isVoiceAnswer(value: unknown): value is ParcelVoiceAnswer {
  return (
    isParcelAnswer(value) &&
    typeof (value as Partial<ParcelVoiceAnswer>).transcript === "string"
  );
}

function isCitation(value: unknown): value is ParcelAnswerCitation {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as ParcelAnswerCitation).checkKind === "string" &&
    typeof (value as ParcelAnswerCitation).checkTitle === "string",
  );
}
