import { useEffect, useState } from "react";
import { LEDGER } from "../../content/parcel";

/** Copies a full address or signature; the short form on screen is only for reading. */
export function CopyButton({ value, label }: { value: string; label: string }) {
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
    <button type="button" className="copy" onClick={copy} aria-label={label}>
      <span aria-live="polite">{copied ? LEDGER.copied : "Copy"}</span>
    </button>
  );
}
