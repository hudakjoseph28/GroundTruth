/**
 * Replays one deal's devnet history into PostgreSQL: the backup for missed
 * QuickNode deliveries.
 *
 *   pnpm --filter @groundtruth/backend replay:devnet --deal staged-devnet-deal
 *   ... --deal <id> --dry-run          # fetch, filter, decode, print; write nothing
 *   ... --deal <id> --save <file.json> # also save the fetched transactions
 *
 * Fetches every transaction that touched the deal's PDA (escrowAddress),
 * failed ones included, from the public devnet RPC at `finalized`, oldest
 * first. Each goes through quicknode/groundtruth-filter.js as its own Block
 * entry, then the webhook's payload schema, the IDL decoder, and
 * applyConfirmedEvent, exactly as a live delivery. Idempotent: rows are
 * unique by signature + event index, so a second run reports every event as
 * `duplicate` and changes nothing. Reads public chain data only.
 */
import { writeFileSync } from "node:fs";
import { applyConfirmedEvent } from "../src/chain/applyEvent.js";
import {
  replayTransactions,
  streamPayloadFor,
  type RpcTransaction,
} from "../src/chain/devnetReplay.js";
import { createEscrowDecoder } from "../src/chain/escrowDecoder.js";
import { decodeStreamPayload } from "../src/chain/streamPayload.js";
import { prisma } from "../src/db.js";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const body = (await res.json()) as {
      result?: T;
      error?: { message: string };
    };
    if (!res.ok || body.error || body.result === undefined) {
      throw new Error(
        `${method}: ${res.status} ${body.error?.message ?? "no result"}`,
      );
    }
    return body.result;
  }
}

/** Every signature for `address`, newest first, across pages. */
async function allSignatures(address: string): Promise<string[]> {
  const out: string[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await rpc<{ signature: string }[]>("getSignaturesForAddress", [
      address,
      { limit: 1000, commitment: "finalized", ...(before && { before }) },
    ]);
    out.push(...page.map((s) => s.signature));
    if (page.length < 1000) return out;
    before = page[page.length - 1]!.signature;
  }
}

function parseArgs(argv: string[]) {
  const args: { deal?: string; save?: string; dryRun: boolean } = {
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--deal") args.deal = argv[++i];
    else if (arg === "--save") args.save = argv[++i];
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!args.deal) {
    throw new Error(
      "usage: replay:devnet --deal <id> [--dry-run] [--save <file.json>]",
    );
  }
  return args as { deal: string; save?: string; dryRun: boolean };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deal = await prisma.dealRecord.findUnique({ where: { id: args.deal } });
  if (!deal) throw new Error(`no deal ${args.deal} in the database`);
  if (!deal.escrowAddress) {
    throw new Error(`deal ${args.deal} has no escrowAddress (deal PDA)`);
  }
  console.log(
    `deal ${deal.id}: PDA ${deal.escrowAddress}, state ${deal.state}`,
  );

  const signatures = (await allSignatures(deal.escrowAddress)).reverse();
  const txs: RpcTransaction[] = [];
  for (const signature of signatures) {
    txs.push(
      await rpc<RpcTransaction>("getTransaction", [
        signature,
        {
          encoding: "jsonParsed",
          commitment: "finalized",
          maxSupportedTransactionVersion: 0,
        },
      ]),
    );
  }
  console.log(`fetched ${txs.length} finalized transactions from ${RPC}`);
  if (args.save) {
    writeFileSync(
      args.save,
      `${JSON.stringify(
        {
          note: "Public Solana devnet data fetched by backend/scripts/replay-devnet.ts (getTransaction, jsonParsed, finalized). Not edited by hand.",
          cluster: "devnet",
          rpc: RPC,
          dealId: deal.id,
          dealPda: deal.escrowAddress,
          fetchedAt: new Date().toISOString(),
          transactions: txs,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`saved to ${args.save}`);
  }

  const decode = createEscrowDecoder();
  if (args.dryRun) {
    const payload = streamPayloadFor(txs);
    const events = decodeStreamPayload(payload, decode);
    console.log(
      `filter sends ${payload.transactions.length}; ${events.length} events (dry run, nothing written):`,
    );
    for (const e of events) {
      console.log(`  ${e.event.name} ${e.signature}:${e.eventIndex}`);
    }
    return;
  }

  const applied = await replayTransactions(txs, {
    decode,
    apply: (event) => applyConfirmedEvent(prisma, event),
    onApplied: ({ event, result }) =>
      console.log(
        `  ${result.padEnd(11)} ${event.event.name} ${event.signature}:${event.eventIndex}`,
      ),
  });
  const counts = applied.reduce<Record<string, number>>((acc, { result }) => {
    acc[result] = (acc[result] ?? 0) + 1;
    return acc;
  }, {});
  const after = await prisma.dealRecord.findUniqueOrThrow({
    where: { id: deal.id },
  });
  console.log(
    `${applied.length} events: ${
      Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ") || "none"
    }. Deal state ${after.state}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
