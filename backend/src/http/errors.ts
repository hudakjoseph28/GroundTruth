import type { ApiError } from "@groundtruth/shared";
import type { Response } from "express";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiError["error"]["code"];
  readonly retryable: boolean;

  constructor(
    status: number,
    code: ApiError["error"]["code"],
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function sendApiError(
  res: Response,
  requestId: string,
  error: HttpError,
): void {
  const body: ApiError = {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      retryable: error.retryable,
    },
  };
  res.status(error.status).json(body);
}

export function logSafeFailure(requestId: string, error: unknown): void {
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(`request ${requestId} failed: ${name}`);
}
