import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { TEXT_ALERTS } from "../content/deal";
import { subscribeToDealTexts } from "../data/dealSource";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; masked: string }
  | { kind: "error"; message: string };

/**
 * Staged demo opt-in to texts about this deal. The API stores the number for
 * this deal only and answers with it masked; the page never shows it back.
 */
export function TextAlerts({ dealId }: { dealId: string }) {
  const titleId = useId();
  const fieldId = useId();
  const hintId = useId();
  const consentId = useId();
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === "sending") return;
    if (!phone.trim()) {
      setStatus({ kind: "error", message: TEXT_ALERTS.needNumber });
      return;
    }
    if (!consent) {
      setStatus({ kind: "error", message: TEXT_ALERTS.needConsent });
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setStatus({ kind: "sending" });
    try {
      const outcome = await subscribeToDealTexts(
        dealId,
        phone,
        controller.signal,
      );
      if (outcome.status === "subscribed") {
        setPhone("");
        setConsent(false);
        setStatus({
          kind: "done",
          masked: outcome.subscription.maskedPhoneNumber,
        });
      } else {
        setStatus({ kind: "error", message: outcome.message });
      }
    } catch {
      // Aborted: the page closed.
    }
  }

  if (status.kind === "done") {
    return (
      <section className="deal-texts" aria-labelledby={titleId}>
        <h2 id={titleId}>{TEXT_ALERTS.title}</h2>
        <p className="deal-texts-done" role="status">
          {TEXT_ALERTS.done(status.masked)}
        </p>
        <p>{TEXT_ALERTS.doneNext}</p>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => setStatus({ kind: "idle" })}
        >
          {TEXT_ALERTS.another}
        </button>
      </section>
    );
  }

  return (
    <section className="deal-texts" aria-labelledby={titleId}>
      <h2 id={titleId}>{TEXT_ALERTS.title}</h2>
      <p>{TEXT_ALERTS.body}</p>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor={fieldId}>{TEXT_ALERTS.label}</label>
        <input
          id={fieldId}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={32}
          value={phone}
          placeholder={TEXT_ALERTS.placeholder}
          aria-describedby={hintId}
          onChange={(event) => setPhone(event.target.value)}
        />
        <p id={hintId} className="deal-texts-hint">
          {TEXT_ALERTS.hint}
        </p>
        <div className="deal-texts-consent">
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <label htmlFor={consentId}>{TEXT_ALERTS.consent}</label>
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={status.kind === "sending"}
        >
          {status.kind === "sending" ? TEXT_ALERTS.sending : TEXT_ALERTS.submit}
        </button>
        {status.kind === "error" && (
          <p className="deal-texts-error" role="alert">
            {status.message}
          </p>
        )}
      </form>
      <p className="deal-texts-note">{TEXT_ALERTS.note}</p>
    </section>
  );
}
