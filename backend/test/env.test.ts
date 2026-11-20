import { describe, expect, it } from "vitest";
import { readServerEnv } from "../src/env.js";

const DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

describe("readServerEnv", () => {
  it("applies defaults when only DATABASE_URL is set", () => {
    expect(readServerEnv({ DATABASE_URL })).toEqual({
      databaseUrl: DATABASE_URL,
      port: 3001,
      commit: "unknown",
      ogripTimeoutMs: 8000,
      femaTimeoutMs: 6000,
      zoningTimeoutMs: 6000,
      accessTimeoutMs: 6000,
      wetlandsTimeoutMs: 10000,
      streamBuffersTimeoutMs: 6000,
      utilitiesTimeoutMs: 8000,
      solanaRpcUrl: "https://api.devnet.solana.com",
    });
  });

  it("reads SOLANA_RPC_URL (Blink and Solana Pay) and rejects a non-URL", () => {
    expect(
      readServerEnv({
        DATABASE_URL,
        SOLANA_RPC_URL: " https://rpc.example/devnet ",
      }).solanaRpcUrl,
    ).toBe("https://rpc.example/devnet");
    expect(() =>
      readServerEnv({ DATABASE_URL, SOLANA_RPC_URL: "devnet" }),
    ).toThrow("SOLANA_RPC_URL must be an http(s) URL");
  });

  it("reads the two environmental limits separately", () => {
    const env = readServerEnv({
      DATABASE_URL,
      WETLANDS_TIMEOUT_MS: "12000",
      STREAM_BUFFERS_TIMEOUT_MS: "4000",
    });
    expect(env.wetlandsTimeoutMs).toBe(12000);
    expect(env.streamBuffersTimeoutMs).toBe(4000);
    expect(() =>
      readServerEnv({ DATABASE_URL, WETLANDS_TIMEOUT_MS: "100" }),
    ).toThrow("WETLANDS_TIMEOUT_MS must be between 500 and 60000");
  });

  it("reads UTILITIES_TIMEOUT_MS and rejects an out-of-range value", () => {
    expect(
      readServerEnv({ DATABASE_URL, UTILITIES_TIMEOUT_MS: "5000" })
        .utilitiesTimeoutMs,
    ).toBe(5000);
    expect(() =>
      readServerEnv({ DATABASE_URL, UTILITIES_TIMEOUT_MS: "100" }),
    ).toThrow("UTILITIES_TIMEOUT_MS must be between 500 and 60000");
  });

  it("reads FEMA_TIMEOUT_MS and rejects an out-of-range value", () => {
    expect(
      readServerEnv({ DATABASE_URL, FEMA_TIMEOUT_MS: "3000" }).femaTimeoutMs,
    ).toBe(3000);
    expect(() =>
      readServerEnv({ DATABASE_URL, FEMA_TIMEOUT_MS: "100" }),
    ).toThrow("FEMA_TIMEOUT_MS must be between 500 and 60000");
  });

  it("reads OGRIP_TIMEOUT_MS", () => {
    expect(
      readServerEnv({ DATABASE_URL, OGRIP_TIMEOUT_MS: "2500" }).ogripTimeoutMs,
    ).toBe(2500);
  });

  it.each([
    ["1.5", "OGRIP_TIMEOUT_MS must be an integer"],
    ["fast", "OGRIP_TIMEOUT_MS must be an integer"],
    ["100", "OGRIP_TIMEOUT_MS must be between 500 and 60000"],
    ["600000", "OGRIP_TIMEOUT_MS must be between 500 and 60000"],
  ])("rejects OGRIP_TIMEOUT_MS %s", (OGRIP_TIMEOUT_MS, message) => {
    expect(() => readServerEnv({ DATABASE_URL, OGRIP_TIMEOUT_MS })).toThrow(
      message,
    );
  });

  it("reads PORT and GIT_COMMIT", () => {
    const env = readServerEnv({
      DATABASE_URL,
      PORT: "8080",
      GIT_COMMIT: "6aaaec4",
    });
    expect(env.port).toBe(8080);
    expect(env.commit).toBe("6aaaec4");
  });

  it("requires DATABASE_URL", () => {
    expect(() => readServerEnv({})).toThrow("DATABASE_URL is required");
    expect(() => readServerEnv({ DATABASE_URL: "  " })).toThrow(
      "DATABASE_URL is required",
    );
  });

  it.each(["abc", "3.5", "-1"])("rejects non-integer PORT %s", (PORT) => {
    expect(() => readServerEnv({ DATABASE_URL, PORT })).toThrow(
      "PORT must be an integer",
    );
  });

  it.each(["0", "65536"])("rejects out-of-range PORT %s", (PORT) => {
    expect(() => readServerEnv({ DATABASE_URL, PORT })).toThrow(
      "PORT must be between 1 and 65535",
    );
  });

  it("rejects a GIT_COMMIT that could inject into the health response", () => {
    expect(() =>
      readServerEnv({ DATABASE_URL, GIT_COMMIT: "<script>" }),
    ).toThrow("GIT_COMMIT contains unsupported characters");
  });

  describe("Twilio", () => {
    const twilio = {
      TWILIO_ACCOUNT_SID: `AC${"0123456789abcdef".repeat(2)}`,
      TWILIO_AUTH_TOKEN: "test-auth-token",
      TWILIO_FROM_NUMBER: "+16145550100",
    };

    it("is off when none of the three are set", () => {
      expect(readServerEnv({ DATABASE_URL }).twilio).toBeUndefined();
    });

    it("reads all three together", () => {
      expect(readServerEnv({ DATABASE_URL, ...twilio }).twilio).toEqual({
        accountSid: twilio.TWILIO_ACCOUNT_SID,
        authToken: "test-auth-token",
        fromNumber: "+16145550100",
      });
    });

    it("refuses a partial set", () => {
      expect(() =>
        readServerEnv({ DATABASE_URL, ...twilio, TWILIO_AUTH_TOKEN: " " }),
      ).toThrow(
        "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER must be set together",
      );
    });

    it("refuses a malformed SID or sender", () => {
      expect(() =>
        readServerEnv({ DATABASE_URL, ...twilio, TWILIO_ACCOUNT_SID: "SK1" }),
      ).toThrow("TWILIO_ACCOUNT_SID must be a Twilio Account SID (AC...)");
      expect(() =>
        readServerEnv({
          DATABASE_URL,
          ...twilio,
          TWILIO_FROM_NUMBER: "614-555-0100",
        }),
      ).toThrow("TWILIO_FROM_NUMBER must be in +E.164 form");
    });
  });
});
