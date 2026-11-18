export interface SmsMessage {
  /** E.164. */
  to: string;
  body: string;
}

export interface SmsSender {
  /** Resolves to the provider's message ID; rejects if it was not accepted. */
  send(message: SmsMessage): Promise<{ messageId: string }>;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** The team's existing Twilio number, E.164. */
  fromNumber: string;
}

export const TWILIO_TIMEOUT_MS = 10_000;

/**
 * Twilio Programmable Messaging: POST /2010-04-01/Accounts/{sid}/Messages.json
 * with HTTP Basic auth (Account SID : Auth Token). Credentials come from the
 * environment and never leave the API process.
 */
export function createTwilioSender(
  config: TwilioConfig,
  fetchImpl: typeof fetch = fetch,
): SmsSender {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
  const authorization = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
  return {
    async send({ to, body }) {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: new URLSearchParams({
          To: to,
          From: config.fromNumber,
          Body: body,
        }),
        signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => undefined)) as
        | { sid?: unknown; code?: unknown }
        | undefined;
      if (!response.ok || typeof payload?.sid !== "string") {
        // Twilio's error code only: its message can echo the recipient.
        const code =
          typeof payload?.code === "number" ? ` code ${payload.code}` : "";
        throw new Error(
          `Twilio refused the message: HTTP ${response.status}${code}`,
        );
      }
      return { messageId: payload.sid };
    },
  };
}
