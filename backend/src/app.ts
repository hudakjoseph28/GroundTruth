import { randomUUID } from "node:crypto";
import express from "express";
import { applyConfirmedEvent } from "./chain/applyEvent.js";
import { createEscrowDecoder } from "./chain/escrowDecoder.js";
import { prisma } from "./db.js";
import { HttpError, logSafeFailure, sendApiError } from "./http/errors.js";
import { getDeal, getDealTimeline } from "./routes/deals.js";
import {
  elevenLabsWebhook,
  type ElevenLabsWebhookOptions,
} from "./routes/elevenlabsWebhook.js";
import { getHealth } from "./routes/health.js";
import { createOgripClient, type OgripClient } from "./parcels/ogrip.js";
import { parcelRoutes } from "./routes/parcels.js";
import {
  quickNodeWebhook,
  type QuickNodeWebhookOptions,
} from "./routes/quicknodeWebhook.js";
import { reportRoute, type ReportRouteOptions } from "./routes/report.js";
import { recordOwnerCall } from "./voice/ownerCall.js";

export interface AppOptions {
  quicknode?: Partial<QuickNodeWebhookOptions>;
  elevenlabs?: Partial<ElevenLabsWebhookOptions>;
  /** Statewide parcel source. Defaults to live OGRIP. */
  ogrip?: OgripClient;
  /** FEMA client, report store, flood limit, and clock for live reports. */
  report?: Omit<ReportRouteOptions, "ogrip">;
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

  const ogrip = options.ogrip ?? createOgripClient();
  const parcels = parcelRoutes(ogrip);

  app.get("/api/health", getHealth(commit));
  app.get("/api/coverage", parcels.coverage);
  app.get("/api/parcels/search", parcels.search);
  app.get("/api/parcels/:parcelKey", parcels.getParcel);
  app.get(
    "/api/parcels/:parcelKey/report",
    reportRoute({ ...options.report, ogrip }),
  );
  app.get("/api/deals/:id", getDeal);
  app.get("/api/deals/:id/timeline", getDealTimeline);
  app.post(
    "/api/webhooks/quicknode",
    ...quickNodeWebhook({
      token: options.quicknode?.token,
      decode: options.quicknode?.decode ?? createEscrowDecoder(),
      apply:
        options.quicknode?.apply ??
        ((event) => applyConfirmedEvent(prisma, event)),
    }),
  );
  app.post(
    "/api/webhooks/elevenlabs",
    ...elevenLabsWebhook({
      secret: options.elevenlabs?.secret,
      agentId: options.elevenlabs?.agentId,
      now: options.elevenlabs?.now,
      record:
        options.elevenlabs?.record ?? ((call) => recordOwnerCall(prisma, call)),
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
