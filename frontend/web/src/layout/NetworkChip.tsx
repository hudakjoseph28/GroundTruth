import { useEffect, useState } from "react";
import { NETWORK } from "../content/site";
import { readDevnetSlot } from "../parcel/BlockTransition/devnetSlot";

/** Wait for the page to paint before asking; ask again this often while it is open. */
const FIRST_CHECK_MS = 1200;
const RECHECK_MS = 60_000;

/**
 * Which network this is, and whether the page has actually reached it. It
 * reads "live" only after Solana devnet answers; until then, and whenever the
 * request fails, it reads "preview".
 */
export function NetworkChip() {
  const [slot, setSlot] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    const check = () => {
      if (document.hidden) return;
      void readDevnetSlot().then((value) => {
        if (current) setSlot(value);
      });
    };
    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const again = window.setInterval(check, RECHECK_MS);
    return () => {
      current = false;
      window.clearTimeout(first);
      window.clearInterval(again);
    };
  }, []);

  const live = slot !== null;
  return (
    <p
      className="net-chip"
      data-state={live ? "live" : "preview"}
      title={live ? NETWORK.liveTitle(slot) : NETWORK.previewTitle}
    >
      <span className="net-dot" aria-hidden="true" />
      {NETWORK.name} <span className="net-state">{live ? NETWORK.live : NETWORK.preview}</span>
    </p>
  );
}
