import { useEffect, useRef, useState } from "react";
import type { Deal } from "@groundtruth/shared";
import { VERIFY } from "../content/verify";
import { explorerAddressUrl, shortAddress } from "../data/ledger";
import { compareDeal, type CellValue, type Comparison } from "./compare";
import type { ChainRead } from "./readChain";
import "./verify.css";

// "Verify on-chain": the visitor's browser reads the deal's escrow account and
// vault from a public devnet RPC and lays them beside this page. Nothing here
// goes through the GroundTruth API. The RPC reader (and web3.js with it) loads
// only when the visitor asks.

type Check =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; read: ChainRead; app: Deal; comparison: Comparison | null };

export function VerifyOnChain({ deal }: { deal: Deal }) {
  const [check, setCheck] = useState<Check>({ status: "idle" });
  const run = useRef(0);
  useEffect(
    () => () => {
      run.current += 1; // Ignore a read that finishes after the page closes.
    },
    [],
  );

  const address = deal.escrowAddress;

  async function verify() {
    if (!address) return;
    const id = ++run.current;
    const app = deal;
    setCheck({ status: "running" });
    let read: ChainRead;
    try {
      const { readDealFromChain } = await import("./readChain");
      read = await readDealFromChain(address);
    } catch {
      read = { status: "error", message: "" };
    }
    if (id !== run.current) return;
    setCheck({
      status: "done",
      read,
      app,
      comparison: read.status === "read" ? compareDeal(app, read.snapshot) : null,
    });
  }

  const result =
    check.status !== "done"
      ? check.status
      : check.comparison
        ? check.comparison.matches
          ? "match"
          : "mismatch"
        : check.read.status === "error"
          ? "unknown"
          : "failed";

  return (
    <section
      className="deal-verify"
      id="verify"
      data-result={result}
      aria-labelledby="deal-verify-title"
      aria-busy={check.status === "running"}
    >
      <header className="deal-verify-head">
        <div>
          <p className="eyebrow">{VERIFY.eyebrow}</p>
          <h2 id="deal-verify-title">{VERIFY.title}</h2>
          <p className="deal-verify-intro">{VERIFY.intro}</p>
        </div>
        {address ? (
          <button
            type="button"
            className={`btn ${check.status === "idle" ? "btn-primary" : ""}`}
            onClick={() => void verify()}
            disabled={check.status === "running"}
          >
            {check.status === "running"
              ? VERIFY.running
              : check.status === "idle"
                ? VERIFY.run
                : VERIFY.again}
          </button>
        ) : (
          <p className="notice">{VERIFY.noAccount}</p>
        )}
      </header>

      <div aria-live="polite">
        {check.status === "done" && (
          <Outcome read={check.read} comparison={check.comparison} />
        )}
        {check.status === "done" && dealKey(check.app) !== dealKey(deal) && (
          <p className="notice deal-verify-outdated">{VERIFY.outdated}</p>
        )}
      </div>

      {check.status === "done" && check.comparison && (
        <FieldTable comparison={check.comparison} />
      )}

      {check.status === "done" && check.read.status === "read" && (
        <footer className="deal-verify-foot">
          <p className="deal-verify-accounts">
            <ExplorerLink
              label={VERIFY.accounts.pda}
              address={check.read.snapshot.address}
            />
            <ExplorerLink
              label={VERIFY.accounts.vault}
              address={check.read.snapshot.vault.address}
            />
          </p>
          <p className="deal-verify-source mono">
            {VERIFY.source(
              check.read.snapshot.rpc,
              check.read.snapshot.slot.toLocaleString("en-US"),
              new Date(check.read.snapshot.readAt).toLocaleTimeString(),
            )}
          </p>
        </footer>
      )}
    </section>
  );
}

/** What the page shows that a check compares; a new poll with the same values is not a change. */
function dealKey(deal: Deal): string {
  return JSON.stringify([
    deal.state,
    deal.amountBaseUnits,
    deal.escrowAddress,
    deal.reviewers.map((r) => [r.wallet, r.role, r.required, Boolean(r.approvedAt)]),
    deal.hold ?? null,
  ]);
}

function Outcome({
  read,
  comparison,
}: {
  read: ChainRead;
  comparison: Comparison | null;
}) {
  if (!comparison) {
    // An RPC that cannot be read is unknown, not a mismatch.
    const unknown = read.status === "error";
    return (
      <div
        className="deal-verify-banner"
        data-tone={unknown ? "unknown" : "bad"}
        role="alert"
      >
        <strong>
          <span aria-hidden="true">{unknown ? "? " : "✕ "}</span>
          {unknown ? VERIFY.failed.unknownTitle : VERIFY.failed.title}
        </strong>
        <p>{failure(read)}</p>
      </div>
    );
  }
  if (comparison.matches) {
    return (
      <div className="deal-verify-banner" data-tone="good" role="status">
        <strong>
          <span aria-hidden="true">✓ </span>
          {VERIFY.matches}
        </strong>
        <p>{VERIFY.matchesDetail(comparison.checks.length)}</p>
      </div>
    );
  }
  return (
    <div className="deal-verify-banner" data-tone="bad" role="alert">
      <strong>
        <span aria-hidden="true">✕ </span>
        {VERIFY.mismatch(comparison.mismatches.length)}
      </strong>
      <ul>
        {comparison.mismatches.map((check) => (
          <li key={check.id}>
            {VERIFY.mismatchLine(check.label, plain(check.chain), plain(check.app))}
            {check.note ? ` ${check.note}` : ""}
          </li>
        ))}
      </ul>
      <p>{VERIFY.mismatchDetail}</p>
    </div>
  );
}

function failure(read: ChainRead): string {
  switch (read.status) {
    case "missing":
      return VERIFY.failed.missing(read.address);
    case "foreign":
      return VERIFY.failed.foreign(read.owner);
    case "undecodable":
      return VERIFY.failed.undecodable(read.reason);
    case "error":
      return [VERIFY.failed.error, read.message].filter(Boolean).join(" ");
    case "read":
      return "";
  }
}

function FieldTable({ comparison }: { comparison: Comparison }) {
  return (
    <table className="deal-verify-table">
      <thead>
        <tr>
          <th scope="col">{VERIFY.columns.field}</th>
          <th scope="col">{VERIFY.columns.chain}</th>
          <th scope="col">{VERIFY.columns.app}</th>
          <th scope="col">
            <span className="visually-hidden">{VERIFY.columns.result}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {comparison.checks.map((check) => (
          <tr key={check.id} data-match={check.match}>
            <th scope="row">{check.label}</th>
            <td data-label={VERIFY.columns.chain}>
              <Cell value={check.chain} />
            </td>
            <td data-label={VERIFY.columns.app}>
              <Cell value={check.app} />
              {check.note && <span className="deal-verify-note">{check.note}</span>}
            </td>
            <td className="deal-verify-mark">
              <span aria-hidden="true">{check.match ? "✓" : "✕"}</span>
              <span className="visually-hidden">
                {check.match ? VERIFY.agree : VERIFY.differ}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({ value }: { value: CellValue }) {
  return (
    <>
      {value.text && <span>{value.text}</span>}
      {value.address && (
        <span className="mono" title={value.address}>
          {shortAddress(value.address)}
        </span>
      )}
    </>
  );
}

/** A cell as one line of text, for the mismatch list. */
function plain(value: CellValue): string {
  return [value.text, value.address && shortAddress(value.address)]
    .filter(Boolean)
    .join(" · ");
}

function ExplorerLink({ label, address }: { label: string; address: string }) {
  return (
    <a href={explorerAddressUrl(address)} target="_blank" rel="noreferrer">
      {label} <span className="mono">{shortAddress(address)}</span>
      <span aria-hidden="true"> ↗</span>
      <span className="visually-hidden"> (opens Solana Explorer in a new tab)</span>
    </a>
  );
}
