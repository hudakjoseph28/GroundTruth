import { describe, expect, it } from "vitest";
import { readServerEnv } from "../src/env.js";

const DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

describe("readServerEnv", () => {
  it("applies defaults when only DATABASE_URL is set", () => {
    expect(readServerEnv({ DATABASE_URL })).toEqual({
      databaseUrl: DATABASE_URL,
      port: 3001,
      commit: "unknown",
    });
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
});
