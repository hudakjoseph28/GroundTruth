import { randomUUID } from "node:crypto";
import express from "express";
import { applyConfirmedEvent } from "./chain/applyEvent.js";
import { decoderPendingIdl } from "./chain/programEvents.js";
import { prisma } from "./db.js";
import { HttpError, logSafeFailure, sendApiError } from "./http/errors.js";
import { getDeal, getDealTimeline } from "./routes/deals.js";
import { getHealth } from "./routes/health.js";
import {
  quickNodeWebhook,
  type QuickNodeWebhookOptions,
} from "./routes/quicknodeWebhook.js";
import { getParcelReport } from "./routes/report.js";

export interface AppOptions {
  quicknode?: Partial<QuickNodeWebhookOptions>;
}

export function createApp(commit: string, options: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");

  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });

  app.get("/api/health", getHealth(commit));
  app.get("/api/parcels/:parcelKey/report", getParcelReport);
  app.get("/api/deals/:id", getDeal);
  app.get("/api/deals/:id/timeline", getDealTimeline);
  app.post(
    "/api/webhooks/quicknode",
    ...quickNodeWebhook({
      token: options.quicknode?.token,
      decode: options.quicknode?.decode ?? decoderPendingIdl,
      apply:
        options.quicknode?.apply ??
        ((event) => applyConfirmedEvent(prisma, event)),
    }),
  );

  app.use((_req, res) => {
    sendApiError(
      res,
      readRequestId(res),
      new HttpError(404, "NOT_FOUND", "That route is not available.", false),
    );
  });

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      const requestId = readRequestId(res);
      if (error instanceof HttpError) {
        sendApiError(res, requestId, error);
        return;
      }
      logSafeFailure(requestId, error);
      sendApiError(
        res,
        requestId,
        new HttpError(
          500,
          "INTERNAL_ERROR",
          "The request could not be completed.",
          true,
        ),
      );
    },
  );

  return app;
}

function readRequestId(res: express.Response): string {
  return typeof res.locals.requestId === "string"
    ? res.locals.requestId
    : "unknown";
}
