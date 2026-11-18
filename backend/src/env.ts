import { DEFAULT_OGRIP_TIMEOUT_MS } from "./parcels/ogrip.js";
import type { TwilioConfig } from "./sms/sender.js";
import {
  DEFAULT_ACCESS_TIMEOUT_MS,
  DEFAULT_FEMA_TIMEOUT_MS,
  DEFAULT_ZONING_TIMEOUT_MS,
} from "./reports/pipeline.js";

export interface ServerEnv {
  databaseUrl: string;
  port: number;
  commit: string;
  /** QuickNode Stream security token; the webhook refuses all deliveries without it. */
  quicknodeStreamToken: string | undefined;
  /** Per-request limit for Ohio OGRIP calls, in milliseconds. */
  ogripTimeoutMs: number;
  /** Limit for a report's FEMA flood check, in milliseconds. */
  femaTimeoutMs: number;
  /** Limit for a Franklin report's county zoning check, in milliseconds. */
  zoningTimeoutMs: number;
  /** Limit for a Franklin report's road access check, in milliseconds. */
  accessTimeoutMs: number;
  /** ElevenLabs post-call webhook secret; the webhook refuses all deliveries without it. */
  elevenLabsWebhookSecret: string | undefined;
  /** Optional: only this agent's calls become evidence. */
  elevenLabsAgentId: string | undefined;
  /** Twilio for staged deal text alerts. Unset: opt-ins are refused and nothing is texted. */
  twilio: TwilioConfig | undefined;
}

export function readServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return {
    databaseUrl,
    port: readPort(source.PORT),
    commit: readCommit(source.GIT_COMMIT),
    quicknodeStreamToken: source.QUICKNODE_STREAM_TOKEN?.trim() || undefined,
    ogripTimeoutMs: readOgripTimeout(source.OGRIP_TIMEOUT_MS),
    femaTimeoutMs: readTimeout(
      "FEMA_TIMEOUT_MS",
      source.FEMA_TIMEOUT_MS,
      DEFAULT_FEMA_TIMEOUT_MS,
    ),
    zoningTimeoutMs: readTimeout(
      "ZONING_TIMEOUT_MS",
      source.ZONING_TIMEOUT_MS,
      DEFAULT_ZONING_TIMEOUT_MS,
    ),
    accessTimeoutMs: readTimeout(
      "ACCESS_TIMEOUT_MS",
      source.ACCESS_TIMEOUT_MS,
      DEFAULT_ACCESS_TIMEOUT_MS,
    ),
    elevenLabsWebhookSecret:
      source.ELEVENLABS_WEBHOOK_SECRET?.trim() || undefined,
    elevenLabsAgentId: source.ELEVENLABS_AGENT_ID?.trim() || undefined,
    twilio: readTwilio(source),
  };
}

/** All three or none: a partial set is a deploy mistake, not "off". */
function readTwilio(source: NodeJS.ProcessEnv): TwilioConfig | undefined {
  const accountSid = source.TWILIO_ACCOUNT_SID?.trim() || undefined;
  const authToken = source.TWILIO_AUTH_TOKEN?.trim() || undefined;
  const fromNumber = source.TWILIO_FROM_NUMBER?.trim() || undefined;
  if (!accountSid && !authToken && !fromNumber) return undefined;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER must be set together",
    );
  }
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) {
    throw new Error("TWILIO_ACCOUNT_SID must be a Twilio Account SID (AC...)");
  }
  if (!/^\+[1-9]\d{7,14}$/.test(fromNumber)) {
    throw new Error("TWILIO_FROM_NUMBER must be in +E.164 form");
  }
  return { accountSid, authToken, fromNumber };
}

function readOgripTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "")
    return DEFAULT_OGRIP_TIMEOUT_MS;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("OGRIP_TIMEOUT_MS must be an integer");
  }
  const ms = Number(value);
  if (ms < 500 || ms > 60_000) {
    throw new Error("OGRIP_TIMEOUT_MS must be between 500 and 60000");
  }
  return ms;
}

function readTimeout(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be an integer`);
  }
  const ms = Number(value);
  if (ms < 500 || ms > 60_000) {
    throw new Error(`${name} must be between 500 and 60000`);
  }
  return ms;
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 3001;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("PORT must be an integer");
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error("PORT must be between 1 and 65535");
  }
  return port;
}

function readCommit(value: string | undefined): string {
  const commit = value?.trim();
  if (!commit) return "unknown";
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(commit)) {
    throw new Error("GIT_COMMIT contains unsupported characters");
  }
  return commit;
}
