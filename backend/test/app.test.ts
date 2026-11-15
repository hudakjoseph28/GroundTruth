import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp("test-commit");

describe("GET /api/health", () => {
  it("reports ok with the configured commit and nothing else", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", commit: "test-commit" });
  });

  it("tags every response with a request id and hides the framework", async () => {
    const res = await request(app).get("/api/health");

    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("unknown routes", () => {
  it("return the v1 ApiError shape with the response's request id", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "That route is not available.",
        requestId: res.headers["x-request-id"],
        retryable: false,
      },
    });
  });
});
