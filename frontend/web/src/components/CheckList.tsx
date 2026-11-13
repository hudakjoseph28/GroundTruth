import type { Check, CheckKind, ParcelReport } from "@groundtruth/shared";
import { CHECK_LABELS, DOCUMENTED_CHECKS, STATUS_LABELS } from "../labels";

export function CheckList({ report }: { report: ParcelReport | null }) {
  return (
    <section className="checks" aria-labelledby="checks-heading">
      <h2 id="checks-heading">What still needs to be checked</h2>
      <ol>
        {DOCUMENTED_CHECKS.map((kind) => {
          const recorded = report?.checks.find((check) => check.kind === kind);
          return (
            <li key={kind}>
              {recorded ? (
                <RecordedCheck check={recorded} />
              ) : (
                <MissingCheck kind={kind} />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RecordedCheck({ check }: { check: Check }) {
  return (
    <article>
      <header>
        <h3>{CHECK_LABELS[check.kind]}</h3>
        <p className={`status status-${check.status}`}>
          {STATUS_LABELS[check.status]}
        </p>
      </header>
      <p>{check.finding}</p>
      <p>{check.limitation}</p>
      <p>Next action: {check.nextAction}</p>
      <p>
        Contact: {check.responsibleParty.role}
        {check.responsibleParty.organization
          ? `, ${check.responsibleParty.organization}`
          : ""}
        {check.responsibleParty.publicContactUrl ? (
          <>
            {" "}
            <a href={check.responsibleParty.publicContactUrl}>Public contact</a>
          </>
        ) : null}
      </p>
      {check.sources.length > 0 ? (
        <ul>
          {check.sources.map((source) => (
            <li key={`${source.url}-${source.retrievedAt}`}>
              <a href={source.url}>{source.title}</a>
              <span>
                {" "}
                {source.authority}, retrieved {source.retrievedAt}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function MissingCheck({ kind }: { kind: CheckKind }) {
  return (
    <article>
      <header>
        <h3>{CHECK_LABELS[kind]}</h3>
        <p className="status status-unknown">Unknown</p>
      </header>
      <p>The staged fixture does not include this check.</p>
      <p>No source, contact, or next action is recorded yet.</p>
    </article>
  );
}
