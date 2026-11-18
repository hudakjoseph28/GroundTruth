import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  dealRecord: { findUnique: vi.fn() },
  smsSubscriptionRecord: {
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
  },
}));
vi.mock("../src/db.js", () => ({ prisma: db }));

const { createApp } = await import("../src/app.js");
const { MAX_SUBSCRIPTIONS_PER_DEAL } =
  await import("../src/routes/smsSubscriptions.js");

const fakeSender = { send: vi.fn() };
const app = createApp("test-commit", { sms: { sender: fakeSender } });
const path = "/api/deals/staged-devnet-deal/sms-subscriptions";
const body = { phoneNumber: "(614) 555-0123", consent: true };

const publicDeal = (state = "funded") => ({
  id: "staged-devnet-deal",
  state,
  publicDemo: true,
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/deals/:id/sms-subscriptions", () => {
  it("answers 503 when Twilio is not configured", async () => {
    const res = await request(createApp("test-commit")).post(path).send(body);
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe(
      "Text updates are not switched on for this server.",
    );
    expect(db.dealRecord.findUnique).not.toHaveBeenCalled();
  });

  it("stores a new number for that deal and returns it masked", async () => {
    db.dealRecord.findUnique.mockResolvedValue(publicDeal());
    db.smsSubscriptionRecord.findUnique.mockResolvedValue(null);
    db.smsSubscriptionRecord.count.mockResolvedValue(0);

    const res = await request(app).post(path).send(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      dealId: "staged-devnet-deal",
      maskedPhoneNumber: "+1 ••• ••• 0123",
    });
    expect(JSON.stringify(res.body)).not.toContain("5550123");
    expect(db.smsSubscriptionRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          dealId: "staged-devnet-deal",
          phoneNumber: "+16145550123",
        }),
      }),
    );
    expect(fakeSender.send).not.toHaveBeenCalled();
  });

  it("re-confirms a number already subscribed to the deal with 200", async () => {
    db.dealRecord.findUnique.mockResolvedValue(publicDeal("held"));
    db.smsSubscriptionRecord.findUnique.mockResolvedValue({ id: "sub-1" });

    const res = await request(app).post(path).send(body);

    expect(res.status).toBe(200);
    expect(res.body.maskedPhoneNumber).toBe("+1 ••• ••• 0123");
    expect(db.smsSubscriptionRecord.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { consentedAt: expect.any(Date) },
    });
    expect(db.smsSubscriptionRecord.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["no consent", { phoneNumber: "6145550123" }],
    ["consent false", { phoneNumber: "6145550123", consent: false }],
    ["no number", { consent: true }],
  ])("refuses %s with 400", async (_label, payload) => {
    const res = await request(app).post(path).send(payload);
    expect(res.status).toBe(400);
    expect(db.dealRecord.findUnique).not.toHaveBeenCalled();
  });

  it("refuses malformed JSON with 400", async () => {
    const res = await request(app)
      .post(path)
      .set("content-type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
  });

  it("refuses a number it cannot read with 400", async () => {
    const res = await request(app)
      .post(path)
      .send({ phoneNumber: "555-0123", consent: true });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      "Enter a 10-digit US number, or an international number starting with +.",
    );
  });

  it("answers 404 for a private deal exactly like a missing one", async () => {
    db.dealRecord.findUnique.mockResolvedValue({
      ...publicDeal(),
      publicDemo: false,
    });
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("No public deal has this ID.");
    expect(db.smsSubscriptionRecord.upsert).not.toHaveBeenCalled();
  });

  it.each(["released", "refunded"])(
    "refuses a %s deal with 409",
    async (state) => {
      db.dealRecord.findUnique.mockResolvedValue(publicDeal(state));
      const res = await request(app).post(path).send(body);
      expect(res.status).toBe(409);
      expect(db.smsSubscriptionRecord.upsert).not.toHaveBeenCalled();
    },
  );

  it("refuses a new number once the deal has its limit of subscribers", async () => {
    db.dealRecord.findUnique.mockResolvedValue(publicDeal());
    db.smsSubscriptionRecord.findUnique.mockResolvedValue(null);
    db.smsSubscriptionRecord.count.mockResolvedValue(
      MAX_SUBSCRIPTIONS_PER_DEAL,
    );
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(409);
    expect(db.smsSubscriptionRecord.upsert).not.toHaveBeenCalled();
  });
});
