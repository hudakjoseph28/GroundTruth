import { randomUUID } from "node:crypto";
import type { Parcel, ParcelLayers } from "@groundtruth/shared";
import express from "express";
import { createDevnetChain, type ActionChain } from "./actions/devnetChain.js";
import { applyConfirmedEvent } from "./chain/applyEvent.js";
import { createEscrowDecoder } from "./chain/escrowDecoder.js";
import { prisma } from "./db.js";
import { HttpError, logSafeFailure, sendApiError } from "./http/errors.js";
import { actionRoutes } from "./routes/actions.js";
import { getActivity } from "./routes/activity.js";
import { getDeal, getDealTimeline } from "./routes/deals.js";
import {
  documentRoutes,
  type DocumentRouteOptions,
} from "./routes/documents.js";
import {
  elevenLabsWebhook,
  type ElevenLabsWebhookOptions,
} from "./routes/elevenlabsWebhook.js";
import { getHealth } from "./routes/health.js";
import {
  createLandAssetService,
  prismaLandAssetStore,
  type LandAssetService,
} from "./land/landAssets.js";
import { landRoutes } from "./routes/land.js";
import { createParcelLayers } from "./layers/parcelLayers.js";
import { layersRoute } from "./routes/layers.js";
import { createFranklinStreamBuffersClient } from "./reports/franklinStreamBuffers.js";
import { createOgripClient, type OgripClient } from "./parcels/ogrip.js";
import { parcelRoutes } from "./routes/parcels.js";
import {
  parcelQuestionRoutes,
  type ParcelQuestionRouteOptions,
} from "./routes/parcelQuestions.js";
import {
  quickNodeWebhook,
  type QuickNodeWebhookOptions,
} from "./routes/quicknodeWebhook.js";
import {
  createParcelReportReader,
  reportRouteFromReader,
  type ReportRouteOptions,
} from "./routes/report.js";
import { createSmsSubscription } from "./routes/smsSubscriptions.js";
import {
  solanaPayRoutes,
  type SolanaPayRouteOptions,
} from "./routes/solanaPay.js";
import { createSmsAlertDispatcher } from "./sms/alerts.js";
import type { SmsSender } from "./sms/sender.js";
import { recordOwnerCall } from "./voice/ownerCall.js";

export interface AppOptions {
  quicknode?: Partial<QuickNodeWebhookOptions>;
  elevenlabs?: Partial<ElevenLabsWebhookOptions>;
  /** Statewide parcel source. Defaults to live OGRIP. */
  ogrip?: OgripClient;
  /** FEMA client, report store, flood limit, and clock for live reports. */
  report?: Omit<ReportRouteOptions, "ogrip">;
  /** Ask this lot model, voice, and limiter. Report access is always server-owned. */
  questions?: Omit<ParcelQuestionRouteOptions, "reports">;
  /** Map layers on the land block. Defaults to the live sources the report checks use. */
  layers?: { layers(parcel: Parcel): Promise<ParcelLayers>; now?: () => Date };
  /** Land block assets. Defaults to building from live OGRIP, NAIP, and Terrarium, cached in PostgreSQL. */
  land?: LandAssetService;
  /** Staged deal text alerts. No sender: opt-ins answer 503 and nothing is texted. */
  sms?: { sender?: SmsSender; log?: (line: string) => void };
  /** Deal documents: the signature clock and the document reader (none: uploads are not read). */
  documents?: DocumentRouteOptions;
  /** Reviewer-approval Blink: the devnet reads it needs. Defaults to public devnet RPC. */
  actions?: { chain?: ActionChain };
  /** Solana Pay funding: the devnet reads (default: the same chain as the Blink) and the icon wallets show. */
  solanaPay?: SolanaPayRouteOptions;
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
  // One client, so the report and the map layer share the setback outlines
  // (Big Darby's is 5.5 MB) instead of downloading them twice.
  const streamSetbacks = createFranklinStreamBuffersClient();
  const parcels = parcelRoutes(ogrip);
  const land = landRoutes(
    options.land ??
      createLandAssetService({
        ogrip,
        store: prismaLandAssetStore(prisma),
        // Tighter than the bake script's 60 s x 3: a visitor is waiting.
        buildOptions: {
          requestTimeoutMs: 20_000,
          attempts: 2,
          warn: (message) => console.warn(`land: ${message}`),
        },
      }),
  );

  app.get("/api/health", getHealth(commit));

  // Solana Actions (Blink): reviewer approval on the staged rehearsal deal.
  // Builds unsigned transactions only; the reviewer's wallet signs.
  // One devnet reader (SOLANA_RPC_URL, genesis-checked) for the Blink and
  // Solana Pay unless a test passes its own.
  const devnet = createDevnetChain();
  const actions = actionRoutes(options.actions?.chain ?? devnet);
  app.get("/actions.json", actions.actionsJson);
  app.options("/actions.json", actions.preflight);
  app.use("/api/actions", actions.router);

  app.get("/api/coverage", parcels.coverage);
  app.get("/api/parcels/search", parcels.search);
  // Before `:parcelKey`; `area` is never a parcel key (ohio:FIPS:ID).
  app.get("/api/parcels/area", parcels.area);
  app.get("/api/parcels/:parcelKey", parcels.getParcel);
  app.get("/api/parcels/:parcelKey/land", land.meta);
  app.get(
    "/api/parcels/:parcelKey/layers",
    layersRoute({
      ogrip,
      layers: options.layers ?? createParcelLayers({ streamSetbacks }),
    }),
  );
  app.get("/api/parcels/:parcelKey/land/:file", land.file);
  const reports = createParcelReportReader({
    streamBuffers: streamSetbacks,
    ...options.report,
    ogrip,
  });
  app.get("/api/parcels/:parcelKey/report", reportRouteFromReader(reports));
  const questions = parcelQuestionRoutes({ reports, ...options.questions });
  app.post("/api/parcels/:parcelKey/questions", ...questions.text);
  app.post("/api/parcels/:parcelKey/questions/voice", ...questions.voice);
  app.get("/api/activity", getActivity);
  app.get("/api/deals/:id", getDeal);
  app.get("/api/deals/:id/timeline", getDealTimeline);
  const documents = documentRoutes(prisma, options.documents);
  app.get("/api/deals/:id/documents", documents.list);
  app.post("/api/deals/:id/documents", ...documents.upload);
  app.post("/api/deals/:id/documents/findings", ...documents.findings);
  app.post("/api/deals/:id/documents/:documentId/file", ...documents.file);
  const solanaPay = solanaPayRoutes(prisma, {
    ...options.solanaPay,
    chain: options.solanaPay?.chain ?? options.actions?.chain ?? devnet,
  });
  app.options(
    "/api/deals/:id/solana-pay/fund",
    solanaPay.cors,
    solanaPay.preflight,
  );
  app.get("/api/deals/:id/solana-pay/fund", ...solanaPay.label);
  app.post("/api/deals/:id/solana-pay/fund", ...solanaPay.transaction);
  app.post(
    "/api/deals/:id/sms-subscriptions",
    ...createSmsSubscription(prisma, { enabled: Boolean(options.sms?.sender) }),
  );

  const project =
    options.quicknode?.apply ?? ((event) => applyConfirmedEvent(prisma, event));
  const textAlerts = options.sms?.sender
    ? createSmsAlertDispatcher(prisma, options.sms.sender, options.sms.log)
    : undefined;
  app.post(
    "/api/webhooks/quicknode",
    ...quickNodeWebhook({
      token: options.quicknode?.token,
      decode: options.quicknode?.decode ?? createEscrowDecoder(),
      // Texts go out after the event's transaction commits, on replays too,
      // so a refused text is retried; queued alerts make that send-once.
      apply: async (event) => {
        const result = await project(event);
        if (textAlerts && result !== "unknownDeal") await textAlerts(event);
        return result;
      },
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
