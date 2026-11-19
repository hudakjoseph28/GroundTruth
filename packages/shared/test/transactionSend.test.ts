import test from "node:test";
import assert from "node:assert/strict";
import { ComputeBudgetProgram } from "@solana/web3.js";
import {
  MAX_COMPUTE_UNITS,
  NotLandedError,
  PRIORITY_FEE,
  computeBudgetInstructions,
  computeUnitLimit,
  isBlockhashExpiredError,
  maxPriorityFeeLamports,
  priorityFeeMicroLamports,
  sendUntilLanded,
  writableAccounts,
  type LandingIo,
  type SignatureState,
} from "@groundtruth/shared";

const fees = (...values: number[]) =>
  values.map((prioritizationFee) => ({ prioritizationFee }));

test("priority fee: 75th percentile of recent slots, zeros included, capped", () => {
  assert.equal(priorityFeeMicroLamports([]), 0);
  assert.equal(priorityFeeMicroLamports(fees(0, 0, 0, 0)), 0);
  assert.equal(priorityFeeMicroLamports(fees(0, 0, 0, 100)), 0);
  assert.equal(priorityFeeMicroLamports(fees(0, 0, 100, 100)), 100);
  assert.equal(priorityFeeMicroLamports(fees(40, 10, 30, 20)), 30);
  assert.equal(
    priorityFeeMicroLamports(fees(1e9)),
    PRIORITY_FEE.maxMicroLamports,
  );
  assert.equal(priorityFeeMicroLamports(fees(Number.NaN, -5)), 0);
});

test("compute unit limit: simulated units + 20% + 1,000, within the ceiling", () => {
  assert.equal(computeUnitLimit(10_000), 13_000);
  assert.equal(computeUnitLimit(1_390_000), MAX_COMPUTE_UNITS);
  assert.equal(computeUnitLimit(undefined), MAX_COMPUTE_UNITS);
  assert.equal(computeUnitLimit(0), MAX_COMPUTE_UNITS);
  assert.equal(maxPriorityFeeLamports(), 140_000n);
  assert.equal(maxPriorityFeeLamports(25_000, 40), 1n);
});

test("budget instructions match web3.js ComputeBudgetProgram", () => {
  const [limit, price] = computeBudgetInstructions({
    units: 31_337,
    microLamports: 12_345,
  });
  const ref = {
    limit: ComputeBudgetProgram.setComputeUnitLimit({ units: 31_337 }),
    price: ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 12_345 }),
  };
  assert.equal(limit!.programId, ref.limit.programId.toBase58());
  assert.deepEqual(Buffer.from(limit!.data), ref.limit.data);
  assert.deepEqual(Buffer.from(price!.data), ref.price.data);
  assert.deepEqual(limit!.keys, []);
});

test("writable accounts: deduplicated, writable only", () => {
  assert.deepEqual(
    writableAccounts([
      {
        programId: "p",
        data: new Uint8Array(),
        keys: [
          { pubkey: "a", isSigner: true, isWritable: false },
          { pubkey: "b", isSigner: false, isWritable: true },
        ],
      },
      {
        programId: "p",
        data: new Uint8Array(),
        keys: [{ pubkey: "b", isSigner: false, isWritable: true }],
      },
    ]),
    ["b"],
  );
});

test("expired-blockhash errors are recognised", () => {
  assert.ok(
    isBlockhashExpiredError(
      new Error("Transaction simulation failed: Blockhash not found"),
    ),
  );
  assert.ok(
    isBlockhashExpiredError("TransactionExpiredBlockheightExceededError"),
  );
  assert.ok(
    !isBlockhashExpiredError(new Error("custom program error: 0x1770")),
  );
});

/** A chain whose height rises one per read; `statuses` scripts what each poll sees. */
function chain(script: {
  statuses: (attempt: number, poll: number, deep: boolean) => SignatureState;
  firstBroadcast?: (attempt: number) => void;
  lifetime?: number;
}) {
  let height = 100;
  let attempt = 0;
  let poll = 0;
  const events: string[] = [];
  const broadcasts: { attempt: number; first: boolean }[] = [];
  const io: LandingIo = {
    async prepare(n) {
      attempt = n;
      poll = 0;
      return {
        signature: `sig${n}`,
        serialized: new Uint8Array([n]),
        lastValidBlockHeight: height + (script.lifetime ?? 2),
      };
    },
    async broadcast(_bytes, first) {
      broadcasts.push({ attempt, first });
      if (first) script.firstBroadcast?.(attempt);
    },
    async status(_signature, deep) {
      return script.statuses(attempt, deep ? poll : poll++, deep);
    },
    async blockHeight() {
      return (height += 1);
    },
    onEvent: (event) => events.push(`${event.kind}:${event.signature}`),
    pollMs: 0,
    sleep: async () => {},
  };
  return { io, events, broadcasts };
}

const confirmed = (err: unknown = null): SignatureState => ({
  confirmationStatus: "confirmed",
  err,
});

test("lands on the first attempt and rebroadcasts while waiting", async () => {
  const c = chain({
    statuses: (_a, poll) => (poll >= 3 ? confirmed() : null),
    lifetime: 50,
  });
  const landed = await sendUntilLanded(c.io);
  assert.deepEqual(landed, { signature: "sig1", err: null, attempts: 1 });
  assert.deepEqual(c.events, ["sent:sig1"]);
  assert.ok(c.broadcasts.filter((b) => !b.first).length >= 1);
  assert.ok(c.broadcasts.every((b) => b.attempt === 1));
});

test("an on-chain failure resolves with its error, not a resend", async () => {
  const err = { InstructionError: [2, { Custom: 6019 }] };
  const c = chain({ statuses: () => confirmed(err) });
  const landed = await sendUntilLanded(c.io);
  assert.deepEqual(landed, { signature: "sig1", err, attempts: 1 });
});

test("resends on a fresh blockhash once the first expires unseen", async () => {
  const c = chain({
    statuses: (attempt) => (attempt === 2 ? confirmed() : null),
  });
  const landed = await sendUntilLanded(c.io);
  assert.equal(landed.signature, "sig2");
  assert.equal(landed.attempts, 2);
  assert.deepEqual(c.events, ["sent:sig1", "expired:sig1", "sent:sig2"]);
});

test("does not resend while the old one is processed; resends once it vanishes", async () => {
  // Attempt 1 is seen as processed for a while past expiry, then dropped.
  const c = chain({
    statuses: (attempt, poll, deep) =>
      attempt === 1
        ? poll < 6 && !deep
          ? { confirmationStatus: "processed", err: null }
          : null
        : confirmed(),
  });
  const landed = await sendUntilLanded(c.io);
  assert.equal(landed.signature, "sig2");
});

test("a transaction found by the deep history check counts as landed", async () => {
  const c = chain({ statuses: (_a, _p, deep) => (deep ? confirmed() : null) });
  const landed = await sendUntilLanded(c.io);
  assert.deepEqual(landed, { signature: "sig1", err: null, attempts: 1 });
});

test("a 'blockhash not found' first send moves straight to the next attempt", async () => {
  const c = chain({
    statuses: (attempt) => (attempt === 2 ? confirmed() : null),
    firstBroadcast: (attempt) => {
      if (attempt === 1)
        throw new Error("Transaction simulation failed: Blockhash not found");
    },
  });
  const landed = await sendUntilLanded(c.io);
  assert.equal(landed.signature, "sig2");
  assert.deepEqual(c.events, ["expired:sig1", "sent:sig2"]);
});

test("other first-send errors (a preflight rejection) are rethrown", async () => {
  const c = chain({
    statuses: () => null,
    firstBroadcast: () => {
      throw new Error("custom program error: 0x1770");
    },
  });
  await assert.rejects(sendUntilLanded(c.io), /0x1770/);
});

test("gives up after the attempt limit with reason 'expired'", async () => {
  const c = chain({ statuses: () => null });
  await assert.rejects(
    sendUntilLanded({ ...c.io, maxAttempts: 2 }),
    (error: unknown) =>
      error instanceof NotLandedError &&
      error.reason === "expired" &&
      error.signature === "sig2",
  );
  assert.deepEqual(c.events, ["sent:sig1", "expired:sig1", "sent:sig2"]);
});

test("stops when aborted", async () => {
  const controller = new AbortController();
  const c = chain({
    statuses: () => {
      controller.abort();
      return null;
    },
  });
  await assert.rejects(
    sendUntilLanded({ ...c.io, signal: controller.signal }),
    (error: unknown) =>
      error instanceof NotLandedError && error.reason === "aborted",
  );
});
