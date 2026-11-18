import { describe, expect, it, vi } from "vitest";
import { alertText, isAlertEvent } from "../src/sms/alerts.js";
import { maskPhoneNumber, normalizePhoneNumber } from "../src/sms/phone.js";
import { createTwilioSender } from "../src/sms/sender.js";

const SIG = "5releaseSignature111111111111111111111111111111111111111111111";
const EXPLORER = `https://explorer.solana.com/tx/${SIG}?cluster=devnet`;

describe("alertText", () => {
  it("labels test funds and links the event's own transaction", () => {
    expect(alertText("DealReleased", "10000000", SIG)).toBe(
      `GroundTruth: your 10 test USDC escrow was released to the seller. Explorer: ${EXPLORER}`,
    );
    expect(alertText("DealFunded", "25000000", SIG)).toBe(
      `GroundTruth: your 25 test USDC escrow was funded on Solana devnet. Explorer: ${EXPLORER}`,
    );
    expect(alertText("HoldPlaced", "2500000", SIG)).toBe(
      `GroundTruth: a reviewer placed a hold on your 2.5 test USDC escrow. Payment to the seller is blocked. Explorer: ${EXPLORER}`,
    );
    expect(alertText("ReleaseRejected", "25000000", SIG)).toBe(
      `GroundTruth: a release of your 25 test USDC escrow was rejected on-chain. No funds moved. Explorer: ${EXPLORER}`,
    );
  });

  it("fits one long SMS segment budget for every alert", () => {
    for (const name of [
      "DealFunded",
      "HoldPlaced",
      "ReleaseRejected",
      "DealReleased",
    ] as const) {
      // 88-char signature is the longest base58 Solana signature.
      expect(alertText(name, "25000000", "x".repeat(88)).length).toBeLessThan(
        306,
      );
    }
  });
});

describe("isAlertEvent", () => {
  it("texts funded, hold placed, release rejected, and released only", () => {
    expect(isAlertEvent("DealFunded")).toBe(true);
    expect(isAlertEvent("HoldPlaced")).toBe(true);
    expect(isAlertEvent("ReleaseRejected")).toBe(true);
    expect(isAlertEvent("DealReleased")).toBe(true);
    expect(isAlertEvent("DealInitialized")).toBe(false);
    expect(isAlertEvent("ApprovalSigned")).toBe(false);
    expect(isAlertEvent("DealRefunded")).toBe(false);
  });
});

describe("phone numbers", () => {
  it.each([
    ["614-555-0123", "+16145550123"],
    ["(614) 555 0123", "+16145550123"],
    ["1 614 555 0123", "+16145550123"],
    ["+1 614.555.0123", "+16145550123"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalizes %s to %s", (input, e164) => {
    expect(normalizePhoneNumber(input)).toBe(e164);
  });

  it.each(["", "555-0123", "+0 614 555 0123", "6145550123x9", "+1234567"])(
    "rejects %j",
    (input) => {
      expect(normalizePhoneNumber(input)).toBeNull();
    },
  );

  it("masks everything but the last four digits", () => {
    expect(maskPhoneNumber("+16145550123")).toBe("+1 ••• ••• 0123");
    expect(maskPhoneNumber("+442079460958")).toBe("+ ••• ••• 0958");
  });
});

describe("createTwilioSender", () => {
  const config = {
    accountSid: `AC${"a".repeat(32)}`,
    authToken: "test-auth-token",
    fromNumber: "+16145550100",
  };

  it("posts a form to the Messages API with Basic auth", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ sid: "SMtest" }, { status: 201 }),
    );
    const sender = createTwilioSender(config, fetchImpl as typeof fetch);

    await expect(
      sender.send({ to: "+16145550123", body: "GroundTruth: hi" }),
    ).resolves.toEqual({ messageId: "SMtest" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from(`${config.accountSid}:test-auth-token`).toString("base64")}`,
    );
    const form = init.body as URLSearchParams;
    expect(form.get("To")).toBe("+16145550123");
    expect(form.get("From")).toBe("+16145550100");
    expect(form.get("Body")).toBe("GroundTruth: hi");
  });

  it("rejects a refusal with the status and code, not Twilio's message", async () => {
    const sender = createTwilioSender(config, (async () =>
      Response.json(
        { code: 21211, message: "The 'To' number +16145550123 is not valid." },
        { status: 400 },
      )) as typeof fetch);

    const error = await sender
      .send({ to: "+16145550123", body: "x" })
      .catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Twilio refused the message: HTTP 400 code 21211",
    );
    expect((error as Error).message).not.toContain("0123");
  });
});
