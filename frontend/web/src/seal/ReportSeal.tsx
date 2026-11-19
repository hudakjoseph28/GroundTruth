import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { ParcelReport } from "@groundtruth/shared";
import { SEAL } from "../content/seal";
import { explorerTxUrl, shortAddress } from "../data/ledger";
import { CopyButton } from "../parcel/Ledger/CopyButton";
import type { MemoRead } from "./readReportMemo";
import { reportHash } from "./reportHash";
import "./seal.css";

// "Save this report on Solana" and "Check a report", under the parcel report.
// The fingerprint and the checker need no wallet. Wallet code (and web3.js
// with it) loads only when the visitor asks to save.

const SealWithWallet = lazy(() => import("./SealWithWallet"));

type Fingerprint =
  | { status: "computing" }
  | { status: "ready"; hash: string }
  | { status: "failed" };

function useFingerprint(report: ParcelReport): Fingerprint {
  const [state, setState] = useState<{
    report: ParcelReport;
    value: Fingerprint;
  } | null>(null);
  useEffect(() => {
    let current = true;
    reportHash(report).then(
      (hash) =>
        current && setState({ report, value: { status: "ready", hash } }),
      () => current && setState({ report, value: { status: "failed" } }),
    );
    return () => {
      current = false;
    };
  }, [report]);
  return state && state.report === report
    ? state.value
    : { status: "computing" };
}

export function ReportSeal({ report }: { report: ParcelReport }) {
  const fingerprint = useFingerprint(report);
  const [saving, setSaving] = useState(false);
  // A just-confirmed save fills the check box, so checking it is one tap.
  const [checkInput, setCheckInput] = useState("");

  return (
    <section className="seal" aria-labelledby="seal-title">
      <header className="seal-head">
        <p className="eyebrow">{SEAL.eyebrow}</p>
        <h3 id="seal-title">{SEAL.title}</h3>
        <p className="seal-intro">{SEAL.intro}</p>
      </header>

      <div className="seal-fingerprint">
        <p className="seal-label">{SEAL.fingerprint}</p>
        {fingerprint.status === "ready" ? (
          <p className="seal-hash">
            <code>{fingerprint.hash}</code>
            <CopyButton
              value={fingerprint.hash}
              label={SEAL.copyFingerprint}
              icon
            />
          </p>
        ) : (
          <p className="seal-quiet" role="status">
            {fingerprint.status === "computing"
              ? SEAL.computing
              : SEAL.noCrypto}
          </p>
        )}
        <p className="seal-quiet">{SEAL.covers(report.generatedAt)}</p>
      </div>

      {fingerprint.status === "ready" &&
        (saving ? (
          <Suspense
            fallback={<p className="seal-quiet">{SEAL.loadingWallet}</p>}
          >
            <SealWithWallet
              hash={fingerprint.hash}
              onConfirmed={setCheckInput}
            />
          </Suspense>
        ) : (
          <div className="seal-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setSaving(true)}
            >
              {SEAL.save}
            </button>
            <p className="seal-quiet">{SEAL.fee}</p>
          </div>
        ))}

      <CheckReport report={report} input={checkInput} onInput={setCheckInput} />
    </section>
  );
}

type Checked =
  | { status: "idle" }
  | { status: "running" }
  | { status: "invalid" }
  | { status: "done"; read: MemoRead; hash: string };

const TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Recomputes this page's fingerprint and looks for it in one devnet transaction. */
function CheckReport({
  report,
  input,
  onInput,
}: {
  report: ParcelReport;
  input: string;
  onInput: (value: string) => void;
}) {
  const [checked, setChecked] = useState<Checked>({ status: "idle" });
  const run = useRef(0);
  useEffect(
    () => () => {
      run.current += 1; // Ignore a read that finishes after the page closes.
    },
    [],
  );
  async function check(event: FormEvent) {
    event.preventDefault();
    const id = ++run.current;
    setChecked({ status: "running" });
    try {
      const { readReportMemo, signatureFromInput } =
        await import("./readReportMemo");
      const target = signatureFromInput(input);
      if (!target) {
        if (id === run.current) setChecked({ status: "invalid" });
        return;
      }
      const [hash, read] = await Promise.all([
        reportHash(report),
        readReportMemo(target),
      ]);
      if (id === run.current) setChecked({ status: "done", read, hash });
    } catch {
      if (id === run.current)
        setChecked({ status: "done", read: { status: "error" }, hash: "" });
    }
  }

  const verdict =
    checked.status === "done" ? verdictFor(checked.read, checked.hash) : null;

  return (
    <form
      className="seal-check"
      data-result={verdict?.tone}
      onSubmit={(e) => void check(e)}
    >
      <h4>{SEAL.check.title}</h4>
      <p className="seal-quiet">{SEAL.check.intro}</p>
      <label className="seal-input">
        <span>{SEAL.check.label}</span>
        <input
          type="text"
          value={input}
          onChange={(event) => onInput(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
      </label>
      <button
        type="submit"
        className="btn btn-small"
        disabled={checked.status === "running" || input.trim() === ""}
      >
        {checked.status === "running" ? SEAL.check.running : SEAL.check.run}
      </button>
      <div aria-live="polite">
        {checked.status === "invalid" && (
          <p className="notice notice-error">{SEAL.check.invalid}</p>
        )}
        {checked.status === "done" && verdict && (
          <div className="seal-verdict" data-tone={verdict.tone}>
            <p className="seal-verdict-title">{verdict.title}</p>
            {verdict.detail && <p>{verdict.detail}</p>}
            {checked.read.status === "read" &&
              checked.read.hashes.length > 0 &&
              verdict.tone === "mismatch" && (
                <dl className="seal-compare">
                  <dt>{SEAL.check.onChain}</dt>
                  {checked.read.hashes.map((hash) => (
                    <dd key={hash}>
                      <code>{hash}</code>
                    </dd>
                  ))}
                  <dt>{SEAL.check.thisPage}</dt>
                  <dd>
                    <code>{checked.hash}</code>
                  </dd>
                </dl>
              )}
            {"signature" in checked.read &&
              checked.read.status !== "notFound" && (
                <a
                  href={explorerTxUrl(checked.read.signature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {SEAL.viewTx}
                </a>
              )}
          </div>
        )}
      </div>
    </form>
  );
}

function verdictFor(
  read: MemoRead,
  hash: string,
): { tone: "match" | "mismatch" | "unknown"; title: string; detail?: string } {
  switch (read.status) {
    case "read":
      if (read.hashes.includes(hash)) {
        const when = read.blockTime
          ? TIME.format(new Date(read.blockTime * 1000))
          : "";
        return {
          tone: "match",
          title: SEAL.check.match,
          detail: SEAL.check.matchDetail(
            shortAddress(read.sender),
            when,
            read.slot.toLocaleString("en-US"),
          ),
        };
      }
      return read.hashes.length > 0
        ? {
            tone: "mismatch",
            title: SEAL.check.differ,
            detail: SEAL.check.differDetail,
          }
        : { tone: "mismatch", title: SEAL.check.noMemo };
    case "failedOnChain":
      return { tone: "mismatch", title: SEAL.check.failedOnChain };
    case "notFound":
      return { tone: "unknown", title: SEAL.check.notFound };
    case "error":
      return { tone: "unknown", title: SEAL.check.error };
  }
}
