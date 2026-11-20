/**
 * The fee sponsor ledger against PostgreSQL: one row per issued fee-payer
 * signature, and a per-deal cap that holds under concurrent requests.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { prismaSponsorLedger } from "../../src/sponsor/ledger.js";

const run = randomUUID().slice(0, 8);
const ledger = prismaSponsorLedger(prisma);
const entry = (dealId: string, n: number) => ({
  dealId,
  action: "sign_approval" as const,
  wallet: "CT6Nstaijac7yAVuDNVWQ12JFMYGfggE4VPBK4sYohDa",
  role: "survey",
  signature: `dbtest-${run}-${dealId}-${n}`,
});

afterAll(async () => {
  await prisma.sponsoredFeeRecord.deleteMany({
    where: { signature: { startsWith: `dbtest-${run}-` } },
  });
  await prisma.$disconnect();
});

describe("prismaSponsorLedger", () => {
  it("records each signature and refuses once the deal reaches its cap", async () => {
    const deal = `dbtest-${run}-a`;
    expect(await ledger.record(entry(deal, 1), 2)).toBe(true);
    expect(
      await ledger.record(
        { ...entry(deal, 2), action: "release", role: undefined },
        2,
      ),
    ).toBe(true);
    expect(await ledger.record(entry(deal, 3), 2)).toBe(false);

    const rows = await prisma.sponsoredFeeRecord.findMany({
      where: { dealId: deal },
      orderBy: { signature: "asc" },
    });
    expect(rows.map((r) => [r.signature, r.action, r.role])).toEqual([
      [entry(deal, 1).signature, "sign_approval", "survey"],
      [entry(deal, 2).signature, "release", null],
    ]);
  });

  it("counts each deal separately", async () => {
    const other = `dbtest-${run}-b`;
    expect(await ledger.record(entry(other, 1), 1)).toBe(true);
    expect(await ledger.record(entry(other, 2), 1)).toBe(false);
  });

  it("holds the cap when requests race", async () => {
    const deal = `dbtest-${run}-c`;
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, n) => ledger.record(entry(deal, n), 3)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(
      await prisma.sponsoredFeeRecord.count({ where: { dealId: deal } }),
    ).toBe(3);
  });
});
