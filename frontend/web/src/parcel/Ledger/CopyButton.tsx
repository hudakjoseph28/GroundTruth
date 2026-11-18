import { useEffect, useState } from "react";
import { LEDGER } from "../../content/parcel";

/** Copies a full address or signature; the short form on screen is only for reading. */
export function CopyButton({
  value,
  label,
  icon = false,
}: {
  value: string;
  label: string;
  /** Icon only, with a short "Copied" tip. */
  icon?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <button
      type="button"
      className={icon ? "copy copy-icon" : "copy"}
      onClick={copy}
      aria-label={copied ? LEDGER.copied : label}
    >
      {icon ? (
        <>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.4" />
            <path d="M10.5 5.5V3.2A1.2 1.2 0 0 0 9.3 2H3.2A1.2 1.2 0 0 0 2 3.2v6.1a1.2 1.2 0 0 0 1.2 1.2H5.5" />
          </svg>
          <span className="visually-hidden" aria-live="polite">
            {copied ? LEDGER.copied : label}
          </span>
          {copied ? <span className="copy-tip">{LEDGER.copied}</span> : null}
        </>
      ) : (
        <span aria-live="polite">{copied ? LEDGER.copied : "Copy"}</span>
      )}
    </button>
  );
}
