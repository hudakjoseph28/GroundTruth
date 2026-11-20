import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ParcelAnswer, ParcelVoiceAnswer } from "@groundtruth/shared";
import {
  askAvailability,
  askParcel,
  askParcelByVoice,
  type AskAvailability,
} from "../../data/parcelQuestions";

interface Exchange {
  id: number;
  question: string;
  answer: ParcelAnswer;
  audio?: ParcelVoiceAnswer["audio"];
}

const SUGGESTIONS = [
  "What does the report say about road access?",
  "What flood zone is shown?",
  "What does the zoning record say?",
  "How much are the annual property taxes?",
] as const;

/**
 * Shown only once the API says it can answer: without the server's model key
 * every question would fail with a 503. The microphone needs the voice key too.
 */
export function AskThisLot({ parcelKey }: { parcelKey: string }) {
  const [available, setAvailable] = useState<AskAvailability | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    askAvailability(parcelKey, controller.signal).then(setAvailable, () => {
      // Aborted: the page closed or the parcel changed.
    });
    return () => controller.abort();
  }, [parcelKey]);

  return available?.text ? (
    <AskThisLotPanel parcelKey={parcelKey} voice={available.voice} />
  ) : null;
}

export function AskThisLotPanel({
  parcelKey,
  voice,
}: {
  parcelKey: string;
  voice: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const nextId = useRef(0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const asked = question.trim();
    if (asked.length < 3 || busy) return;
    setBusy(true);
    setError("");
    const outcome = await askParcel(parcelKey, asked);
    setBusy(false);
    if (outcome.status === "error") {
      setError(outcome.message);
      return;
    }
    addExchange(asked, outcome.answer);
    setQuestion("");
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream);
      recorder.current = next;
      chunks.current = [];
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      next.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, {
          type: next.mimeType || "audio/webm",
        });
        setBusy(true);
        const outcome = await askParcelByVoice(parcelKey, blob);
        setBusy(false);
        if (outcome.status === "error") {
          setError(outcome.message);
          return;
        }
        addExchange(
          outcome.answer.transcript,
          outcome.answer,
          outcome.answer.audio,
        );
      };
      next.start();
      setRecording(true);
    } catch {
      setError(
        "Microphone access was not available. You can type the question instead.",
      );
    }
  }

  function addExchange(
    asked: string,
    answer: ParcelAnswer,
    audio?: ParcelVoiceAnswer["audio"],
  ) {
    nextId.current += 1;
    setExchanges((current) => [
      ...current,
      { id: nextId.current, question: asked, answer, audio },
    ]);
  }

  return (
    <section className="ask-lot" aria-labelledby="ask-lot-title">
      <div className="ask-lot-heading">
        <p className="ask-lot-eyebrow">Parcel evidence</p>
        <h2 id="ask-lot-title">Ask this lot</h2>
        <p>
          Answers use only this parcel report. Missing records stay unknown.
        </p>
      </div>

      {exchanges.length ? (
        <ol className="ask-lot-thread" aria-live="polite">
          {exchanges.map((exchange) => (
            <li key={exchange.id} className="ask-lot-exchange">
              <p className="ask-lot-question">{exchange.question}</p>
              <article data-covered={exchange.answer.covered}>
                <p className="ask-lot-status">
                  {exchange.answer.covered
                    ? "From this report"
                    : "Not covered by this report"}
                </p>
                <p>{exchange.answer.answer}</p>
                {!exchange.answer.covered ? (
                  <p className="ask-lot-party">
                    Responsible: {exchange.answer.responsibleParty.role}
                    {exchange.answer.responsibleParty.organization
                      ? ` · ${exchange.answer.responsibleParty.organization}`
                      : ""}
                  </p>
                ) : null}
                <ul className="ask-lot-citations" aria-label="Answer sources">
                  {exchange.answer.citations.map((citation, index) => (
                    <li
                      key={`${citation.checkKind}-${citation.source?.url ?? index}`}
                    >
                      <span>{citation.checkTitle}</span>
                      {citation.source ? (
                        <a
                          href={citation.source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {citation.source.authority}: {citation.source.title}
                        </a>
                      ) : (
                        <span>No supporting source in this report</span>
                      )}
                    </li>
                  ))}
                </ul>
                {exchange.audio ? (
                  <audio
                    className="ask-lot-audio"
                    controls
                    src={`data:${exchange.audio.contentType};base64,${exchange.audio.base64}`}
                  >
                    Voice answer
                  </audio>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="ask-lot-suggestions" aria-label="Suggested questions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setQuestion(suggestion)}
            disabled={busy}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form className="ask-lot-form" onSubmit={submit}>
        <label htmlFor="ask-lot-question">Question about this lot</label>
        <div>
          <input
            id="ask-lot-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={600}
            placeholder="Ask about access, flood, zoning…"
            disabled={busy || recording}
          />
          {voice ? (
            <button
              className="ask-lot-mic"
              type="button"
              onClick={toggleRecording}
              disabled={busy}
              aria-pressed={recording}
              aria-label={recording ? "Stop recording" : "Ask with microphone"}
            >
              <span aria-hidden="true">{recording ? "■" : "●"}</span>
              {recording ? "Stop" : "Mic"}
            </button>
          ) : null}
          <button
            className="btn"
            type="submit"
            disabled={busy || recording || question.trim().length < 3}
          >
            {busy ? "Checking report…" : "Ask"}
          </button>
        </div>
      </form>
      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
