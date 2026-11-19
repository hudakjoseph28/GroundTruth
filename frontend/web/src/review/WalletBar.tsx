import { WalletReadyState } from "@solana/wallet-adapter-base";
import { PhantomWalletName } from "@solana/wallet-adapter-phantom";
import { useWallet } from "@solana/wallet-adapter-react";
import { REVIEW } from "../content/review";

const short = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

/** Connect or disconnect Phantom; in a browser without it, open the page in Phantom's app. */
export function WalletBar() {
  const { wallets, wallet, publicKey, connecting, select, connect, disconnect } = useWallet();
  const phantom = wallets.find((w) => w.adapter.name === PhantomWalletName);
  const detected =
    phantom?.readyState === WalletReadyState.Installed ||
    phantom?.readyState === WalletReadyState.Loadable;

  if (publicKey) {
    return (
      <div className="review-wallet">
        <span>{REVIEW.connectedAs(short(publicKey.toBase58()))}</span>
        <button type="button" className="btn btn-small" onClick={() => void disconnect()}>
          {REVIEW.disconnect}
        </button>
      </div>
    );
  }
  if (!detected) {
    const here = typeof window === "undefined" ? "" : window.location.href;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return (
      <div className="review-wallet review-wallet-missing">
        <p>{REVIEW.noPhantom}</p>
        <a
          className="btn"
          href={`https://phantom.app/ul/browse/${encodeURIComponent(here)}?ref=${encodeURIComponent(origin)}`}
        >
          {REVIEW.openInPhantom}
        </a>
      </div>
    );
  }
  return (
    <div className="review-wallet">
      <button
        type="button"
        className="btn btn-primary"
        disabled={connecting}
        onClick={() => {
          if (wallet?.adapter.name === PhantomWalletName) void connect().catch(() => {});
          else select(PhantomWalletName);
        }}
      >
        {connecting ? REVIEW.connecting : REVIEW.connect}
      </button>
      <p className="review-hint">{REVIEW.phantomNetwork}</p>
    </div>
  );
}
