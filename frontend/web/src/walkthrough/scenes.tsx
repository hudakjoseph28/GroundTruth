import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { DealDocument, TimelineEvent } from "@groundtruth/shared";
import { EXAMPLE } from "../content/example";
import { WALKTHROUGH } from "../content/walkthrough";
import { ChainStrip } from "../deal/ChainStrip";
import { chainBlocks } from "../deal/chainBlocks";
import { DealHero, DealHoldCard, DealReviewers, DealRow } from "../deal/DealParts";
import { MoneyFlow } from "../deal/MoneyFlow";
import { QrCode } from "../deal/QrCode";
import { dealPath } from "../data/dealSource";
import { viewDeal, viewTimeline, type TimelineRow } from "../data/dealView";
import { getParcelLedger, shortAddress, type LedgerRecord } from "../data/ledger";
import { parcelPath } from "../data/parcelSource";
import { DealDocuments } from "../documents/DealDocuments";
import { shortHash } from "../documents/fileCheck";
import { EXAMPLE_DATA } from "../example/exampleData";
import {
  EXAMPLE_BOTTOM_LINE,
  EXAMPLE_CALL,
  EXAMPLE_CALL_DENIED,
  EXAMPLE_DEAL,
  EXAMPLE_DOCUMENTS,
  EXAMPLE_HELD_DEAL,
  EXAMPLE_KEY,
  EXAMPLE_PARCEL,
  EXAMPLE_REPORT,
  EXAMPLE_TIMELINE,
  exampleDealAfter,
  type ExampleCall,
} from "../example/exampleFixture";
import { Inspector } from "../parcel/Ledger/Inspector";
import { RecordCard } from "../parcel/Ledger/RecordCard";
import { ReportSummary } from "../parcel/Ledger/ReportSummary";
import { LandBlock } from "../parcel/ParcelScene/LandBlock";
import { useLandAssets } from "../parcel/ParcelScene/useLandAssets";
import { SceneBoundary } from "../parcel/SceneBoundary";
import { useRenderMode } from "../parcel/useRenderMode";
import { BuildableAreaCard } from "../parcel/BuildableArea/BuildableAreaCard";
import type { BuildableAreaEstimate } from "../parcel/BuildableArea/estimate";
import { stagedReleasedDeal } from "@groundtruth/shared";
import {
  fileSize,
  LetterPaper,
  PhoneFrame,
  PlatPaper,
  SoilPaper,
  TitlePaper,
  useClock,
  usePhase,
  useTyped,
} from "./parts";

// One scene per walkthrough step. Each is the real component where one
// exists (the land block, the report cards, the money flow, the reviewer
// badges, the timeline rows), fed the example, and plays its beats over the
// step's eight seconds. With reduced motion every scene opens on its last beat.

const DealLand = lazy(() => import("../deal/DealLand"));

const noop = () => {};

/** One timeline row from the example, as the deal page draws it. */
function rowOf(event: TimelineEvent): TimelineRow {
  return viewTimeline([event])[0]!;
}

function Appear({ when, children, className }: { when: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className ? `walk-appear ${className}` : "walk-appear"} data-shown={when}>
      {children}
    </div>
  );
}

// ---------- 1. Find the lot ----------

const FIND_BEATS = [1700, 2300] as const;

export function FindScene() {
  const typed = useTyped(WALKTHROUGH.search.query, 350, 70);
  const phase = usePhase(FIND_BEATS);
  return (
    <div className="walk-find">
      <div className="search walk-search" aria-hidden="true">
        <div className="search-row">
          <svg className="search-icon" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="4.6" />
            <path d="m10.5 10.5 3.4 3.4" />
          </svg>
          <span className="walk-search-field">
            {typed || <span className="quiet">{WALKTHROUGH.search.label}</span>}
            {phase === 0 && <i className="walk-caret" />}
          </span>
          <span className="btn btn-primary" data-pressed={phase === 1 || undefined}>
            {WALKTHROUGH.search.button}
          </span>
        </div>
      </div>
      <Appear when={phase >= 2}>
        <p className="walk-find-count">{WALKTHROUGH.search.results}</p>
        <ul className="results walk-results">
          <li>
            <Link to={parcelPath(EXAMPLE_KEY)} data-featured>
              <span className="result-address">{EXAMPLE_PARCEL.siteAddress}</span>
              <span className="result-facts">
                <span>Franklin County</span>
                <span>{EXAMPLE_PARCEL.township}</span>
                <span>{EXAMPLE_PARCEL.acreage} acres</span>
              </span>
              <span className="result-meta quiet">
                <span className="result-id">Parcel {EXAMPLE_PARCEL.sourceParcelId}</span>
                <span>{WALKTHROUGH.search.matched}</span>
              </span>
            </Link>
          </li>
        </ul>
      </Appear>
    </div>
  );
}

// ---------- 2. The land ----------

export function LandScene() {
  const { assets, building } = useLandAssets(EXAMPLE_PARCEL);
  const mode = useRenderMode();
  const [buildable, setBuildable] = useState<BuildableAreaEstimate | null>(null);
  return (
    <div className="walk-land">
      <LandBlock
        parcel={EXAMPLE_PARCEL}
        assets={assets}
        building={building}
        mode={mode}
        staged={false}
        revealed
        onReady={noop}
        getLayers={EXAMPLE_DATA.getLayers}
        onBuildableArea={setBuildable}
      />
      {buildable && <BuildableAreaCard estimate={buildable} compact />}
    </div>
  );
}

// ---------- 3. The report ----------

export function ReportScene() {
  const ledger = useMemo(() => getParcelLedger(EXAMPLE_KEY, EXAMPLE_REPORT, EXAMPLE_DEAL), []);
  const [open, setOpen] = useState<LedgerRecord | null>(null);
  return (
    <section className="ledger walk-report" data-revealed="true" data-paused="true" aria-label={WALKTHROUGH.steps.report.title}>
      <ReportSummary ledger={ledger} onOpen={(record) => setOpen(record)} override={EXAMPLE_BOTTOM_LINE} />
      <ol className="chain walk-cards">
        {ledger.records.map((record, index) => (
          <RecordCard
            key={record.check.kind}
            record={record}
            index={index}
            last
            biggest={record.check.kind === ledger.biggestOpenQuestion}
            open={open === record}
            onOpen={() => setOpen(record)}
            chain
          />
        ))}
      </ol>
      <Inspector record={open} origin={null} onClose={() => setOpen(null)} />
    </section>
  );
}

// ---------- 4. Fund with Solana Pay ----------

const FUND_BEATS = [900, 3000, 4300] as const;

export function FundScene() {
  const phase = usePhase(FUND_BEATS);
  const words = WALKTHROUGH.pay.wallet;
  const exampleDeal = `${window.location.origin}${dealPath(EXAMPLE_KEY)}`;
  return (
    <div className="walk-fund">
      <section className="deal-pay walk-pay" aria-label={WALKTHROUGH.pay.title}>
        <QrCode value={exampleDeal} label={WALKTHROUGH.pay.alt} />
        <div>
          <h3>{WALKTHROUGH.pay.title}</h3>
          <p>{WALKTHROUGH.pay.body}</p>
          <p className="deal-pay-note">{WALKTHROUGH.pay.note}</p>
        </div>
      </section>
      <PhoneFrame label={words.action}>
        <div className="walk-wallet" data-phase={phase}>
          <p className="walk-wallet-head">
            <span>
              {words.account} · {shortAddress(EXAMPLE_DEAL.buyerWallet)}
            </span>
            <strong>{words.balance(phase >= 3 ? "0" : "25")}</strong>
          </p>
          {phase === 0 ? (
            <div className="walk-wallet-scan">
              <span className="walk-wallet-viewfinder" />
              <p>{words.scan}</p>
            </div>
          ) : (
            <div className="walk-wallet-sheet">
              <p className="walk-wallet-from">
                <span className="walk-wallet-favicon" aria-hidden="true" />
                {words.from}
              </p>
              <p className="walk-wallet-wants">{words.wants}</p>
              <p className="walk-wallet-action">{words.action}</p>
              <p className="walk-wallet-amount">−{words.amount}</p>
              <dl>
                <div>
                  <dt>{words.network}</dt>
                  <dd>{words.networkValue}</dd>
                </div>
                <div>
                  <dt>{words.fee}</dt>
                  <dd>{words.feeValue}</dd>
                </div>
              </dl>
              {phase >= 3 ? (
                <p className="walk-wallet-done">
                  <span aria-hidden="true">✓</span> {words.sent}
                </p>
              ) : (
                <p className="walk-wallet-buttons">
                  <span className="walk-wallet-cancel">{words.cancel}</span>
                  <span className="walk-wallet-approve" data-pressed={phase === 2 || undefined}>
                    {phase === 2 ? words.sending : words.approve}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </PhoneFrame>
      <div className="walk-flow" data-tone={phase >= 3 ? "pending" : "quiet"}>
        <MoneyFlow amount="25" state={phase >= 3 ? "funded" : "draft"} live={phase >= 3} />
      </div>
    </div>
  );
}

// ---------- 5. The owner call ----------

const CALL_BEATS = [1400, 2000, 3100, 4100, 5100, 6400] as const;
const HELD_BEATS = [700, 1100, 1800, 2400, 3000, 3700, 5000, 6400] as const;

/** An ElevenLabs Agents call on a phone: ringing, connected, the words, then the outcome. */
function CallPhone({ call, phase }: { call: ExampleCall; phase: number }) {
  const connected = phase >= 1;
  const clock = useClock(connected, call.duration);
  const lines = call.lines.slice(0, Math.max(0, phase - 1));
  const done = phase >= call.lines.length + 2;
  return (
    <PhoneFrame label={WALKTHROUGH.call.by}>
      <div className="walk-call" data-connected={connected} data-tone={call.tone}>
        <p className="walk-call-by">
          <img src="/logos/elevenlabs.svg" alt="" />
          {WALKTHROUGH.call.by}
        </p>
        <div className="walk-call-who">
          <span className="walk-call-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="9" r="4" />
              <path d="M4.5 20c1.2-4 4.2-6 7.5-6s6.3 2 7.5 6" />
            </svg>
            {!connected && (
              <>
                <i className="walk-ring" />
                <i className="walk-ring" />
              </>
            )}
          </span>
          <strong>{WALKTHROUGH.call.callee}</strong>
          <span>{WALKTHROUGH.call.lot}</span>
          <span className="walk-call-state">
            {connected ? `${WALKTHROUGH.call.connected} · ${clock}` : WALKTHROUGH.call.calling}
          </span>
          {connected && !done && (
            <span className="walk-wave" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => (
                <i key={index} />
              ))}
            </span>
          )}
        </div>
        <ol className="walk-call-lines" aria-live="polite">
          {lines.map((line, index) => (
            <li key={index} data-who={line.who}>
              <span>{line.who === "agent" ? WALKTHROUGH.call.agent : WALKTHROUGH.call.owner}</span>
              {line.text}
            </li>
          ))}
        </ol>
        {done && (
          <p className="walk-call-outcome" data-tone={call.tone}>
            <strong>{call.outcome}</strong>
            <span>{WALKTHROUGH.call.evidence}</span>
          </p>
        )}
      </div>
    </PhoneFrame>
  );
}

export function CallScene() {
  const phase = usePhase(CALL_BEATS);
  const done = phase >= CALL_BEATS.length;
  return (
    <div className="walk-split">
      <CallPhone call={EXAMPLE_CALL} phase={phase} />
      <div className="walk-side">
        <ul className="walk-facts">
          {WALKTHROUGH.call.facts.map((fact) => (
            <li key={fact.text} data-tone={fact.tone}>
              {fact.text}
            </li>
          ))}
        </ul>
        <Appear when={done}>
          <ol className="deal-rows walk-rows">
            <DealRow row={rowOf(EXAMPLE_TIMELINE[2]!)} />
          </ol>
          <p className="walk-note">{WALKTHROUGH.call.reviewer}</p>
        </Appear>
      </div>
    </div>
  );
}

// ---------- 6–8. Title, survey, septic ----------

const DOC_BEATS = [1200, 2600, 3900] as const;

/** One reviewer's step: the document goes up, gets its hash, and the approval puts the hash on-chain. */
function ReviewScene({
  doc,
  row,
  rowIndex,
  left,
}: {
  doc: DealDocument;
  row: TimelineEvent;
  /** The approval's place in the example timeline. */
  rowIndex: number;
  left: (phase: number) => ReactNode;
}) {
  const phase = usePhase(DOC_BEATS);
  const signed = phase >= 3;
  const deal = useMemo(() => viewDeal(exampleDealAfter(signed ? rowIndex + 1 : rowIndex)), [signed, rowIndex]);
  return (
    <div className="walk-split">
      <div className="walk-doc-side">{left(phase)}</div>
      <div className="walk-side">
        <div className="walk-file" data-phase={phase}>
          <p className="walk-file-name">
            <span className="walk-file-icon" aria-hidden="true">
              {doc.contentType === "application/pdf" ? "PDF" : "JPG"}
            </span>
            <span>
              <strong>{doc.filename}</strong>
              <small>{fileSize(doc.sizeBytes)}</small>
            </span>
          </p>
          {phase === 0 ? (
            <p className="walk-file-progress" aria-label={WALKTHROUGH.doc.uploading}>
              <i />
            </p>
          ) : (
            <p className="walk-file-hash">
              <span>{WALKTHROUGH.doc.sha}</span>
              <code className="mono" title={doc.sha256}>
                {shortHash(doc.sha256)}
              </code>
            </p>
          )}
          <Appear when={phase >= 2}>
            <p className="walk-memo">
              <span>{WALKTHROUGH.doc.memo}</span>
              <code className="mono">groundtruth:doc:{doc.sha256.slice(0, 16)}…</code>
              <em>{WALKTHROUGH.doc.onChain}</em>
            </p>
          </Appear>
        </div>
        <div className="walk-tone" data-tone="released">
          <DealReviewers deal={deal} />
        </div>
        <Appear when={signed}>
          <ol className="deal-rows walk-rows">
            <DealRow row={rowOf(row)} />
          </ol>
        </Appear>
      </div>
    </div>
  );
}

export function TitleScene() {
  return (
    <ReviewScene
      doc={EXAMPLE_DOCUMENTS[0]!}
      row={EXAMPLE_TIMELINE[3]!}
      rowIndex={3}
      left={() => <TitlePaper />}
    />
  );
}

export function SurveyScene() {
  return (
    <ReviewScene
      doc={EXAMPLE_DOCUMENTS[1]!}
      row={EXAMPLE_TIMELINE[4]!}
      rowIndex={4}
      left={() => <PlatPaper />}
    />
  );
}

export function SepticScene() {
  return (
    <ReviewScene
      doc={EXAMPLE_DOCUMENTS[2]!}
      row={EXAMPLE_TIMELINE[5]!}
      rowIndex={5}
      left={(phase) => <ReviewerPhone phase={phase} />}
    />
  );
}

/** The septic reviewer's phone: the deal, the soil evaluation, and the approve button. */
function ReviewerPhone({ phase }: { phase: number }) {
  const words = WALKTHROUGH.phone;
  return (
    <PhoneFrame label={words.role}>
      <div className="walk-review" data-phase={phase}>
        <p className="walk-review-role">{words.role}</p>
        <p className="walk-review-deal">{words.deal}</p>
        <SoilPaper />
        <p className="walk-review-attached">
          <span aria-hidden="true">📎</span> {words.attached}
        </p>
        {phase >= 3 ? (
          <p className="walk-review-done">
            <span aria-hidden="true">✓</span> {words.signed}
          </p>
        ) : (
          <p className="walk-review-button" data-pressed={phase === 2 || undefined}>
            {phase === 2 ? words.signing : words.approve}
          </p>
        )}
      </div>
    </PhoneFrame>
  );
}

// ---------- 9. Zoning letter ----------

const ZONING_BEATS = [1300] as const;

export function ZoningScene() {
  const phase = usePhase(ZONING_BEATS);
  const doc = EXAMPLE_DOCUMENTS[3]!;
  const signed = useMemo(() => viewDeal(exampleDealAfter(7)), []);
  return (
    <div className="walk-split">
      <div className="walk-doc-side">
        <LetterPaper />
      </div>
      <div className="walk-side">
        <div className="walk-file" data-phase={phase >= 1 ? 2 : 0}>
          <p className="walk-file-name">
            <span className="walk-file-icon" aria-hidden="true">
              PDF
            </span>
            <span>
              <strong>{doc.filename}</strong>
              <small>{fileSize(doc.sizeBytes)}</small>
            </span>
          </p>
          {phase === 0 ? (
            <p className="walk-file-progress" aria-label={WALKTHROUGH.doc.uploading}>
              <i />
            </p>
          ) : (
            <p className="walk-file-hash">
              <span>{WALKTHROUGH.doc.sha}</span>
              <code className="mono">{shortHash(doc.sha256)}</code>
              <em>{WALKTHROUGH.doc.evidence}</em>
            </p>
          )}
        </div>
        <Appear when={phase >= 1}>
          <ol className="deal-rows walk-rows">
            <DealRow row={rowOf(EXAMPLE_TIMELINE[6]!)} />
          </ol>
        </Appear>
        <div className="walk-tone" data-tone="released">
          <DealReviewers deal={signed} />
        </div>
      </div>
    </div>
  );
}

// ---------- 10. Release ----------

const RELEASE_BEATS = [1400] as const;

export function ReleaseScene() {
  const phase = usePhase(RELEASE_BEATS);
  const released = phase >= 1;
  const deal = useMemo(() => viewDeal(exampleDealAfter(released ? 8 : 6)), [released]);
  return (
    <div className="walk-release walk-tone" data-tone={released ? "released" : "pending"}>
      <div className="walk-flow walk-glide">
        <MoneyFlow amount={deal.amount} state={deal.state} live={released} />
      </div>
      <div className="walk-release-row">
        <DealHero deal={deal} live={released} parcel={EXAMPLE_PARCEL} />
        <SceneBoundary fallback={null}>
          <Suspense fallback={<div className="deal-land" aria-hidden="true" />}>
            <DealLand parcel={EXAMPLE_PARCEL} state={deal.state} liveState={released ? "released" : null} />
          </Suspense>
        </SceneBoundary>
      </div>
    </div>
  );
}

// ---------- 11. Receipts ----------

export function ReceiptsScene() {
  const blocks = useMemo(() => chainBlocks(EXAMPLE_TIMELINE), []);
  const evidence = EXAMPLE_TIMELINE.filter((event) => event.confirmationStatus === "offChainEvidence");
  return (
    <div className="walk-receipts">
      <section aria-labelledby="walk-chain">
        <h3 id="walk-chain" className="walk-label">
          {WALKTHROUGH.receipts.chain}
        </h3>
        <ChainStrip blocks={blocks} />
      </section>
      <div className="walk-receipts-grid">
        <DealDocuments
          state={{ status: "ready", documents: EXAMPLE_DOCUMENTS }}
          timeline={EXAMPLE_TIMELINE}
          compact
          note={EXAMPLE.deal.documentsNote}
        />
        <section aria-labelledby="walk-evidence">
          <h3 id="walk-evidence" className="walk-label">
            {WALKTHROUGH.receipts.evidence}
          </h3>
          <ol className="deal-rows walk-rows">
            {evidence.map((event) => (
              <DealRow key={event.id} row={rowOf(event)} />
            ))}
          </ol>
          <p className="walk-links">
            <Link to={dealPath(EXAMPLE_KEY)}>
              {WALKTHROUGH.receipts.openDeal} <span aria-hidden="true">→</span>
            </Link>
            <Link to={dealPath(stagedReleasedDeal.id)}>
              {WALKTHROUGH.receipts.real} <span aria-hidden="true">→</span>
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

// ---------- 12. Bonus: the seller isn't real ----------

export function HeldScene() {
  const phase = usePhase(HELD_BEATS);
  const callPhase = Math.min(phase, EXAMPLE_CALL_DENIED.lines.length + 2);
  const held = phase >= 7;
  const rejected = phase >= 8;
  const deal = useMemo(() => viewDeal(EXAMPLE_HELD_DEAL), []);
  const rejectedRow = EXAMPLE_HELD_DEAL.timeline[4]!;
  return (
    <div className="walk-split">
      <CallPhone call={EXAMPLE_CALL_DENIED} phase={callPhase} />
      <div className="walk-side walk-tone" data-tone={held ? "held" : "pending"}>
        <div className="walk-flow">
          <MoneyFlow amount="25" state={held ? "held" : "funded"} live={held} />
        </div>
        <Appear when={held}>{deal.hold && <DealHoldCard hold={deal.hold} />}</Appear>
        <Appear when={rejected}>
          <ol className="deal-rows walk-rows">
            <DealRow row={rowOf(rejectedRow)} />
          </ol>
          <p className="walk-rejected mono">{WALKTHROUGH.held.rejected}</p>
        </Appear>
      </div>
    </div>
  );
}
