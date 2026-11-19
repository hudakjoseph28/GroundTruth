import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SEAL } from "../content/seal";
import { explorerTxUrl, shortAddress } from "../data/ledger";
import { CopyButton } from "../parcel/Ledger/CopyButton";
import {
  explainFailure,
  signAndSend,
  waitForConfirmation,
  type SendPhase,
} from "../review/escrowTx";
import { WalletBar } from "../review/WalletBar";
import { WalletRoot } from "../review/WalletRoot";
import { reportMemo, reportMemoInstruction } from "./reportHash";

type Saving =
  | { phase: "idle" }
  | { phase: SendPhase; signature?: string }
  | { phase: "confirmed"; signature: string }
  | { phase: "failed"; message: string; signature?: string };

/**
 * The save half of the panel, with a wallet: loaded only after the visitor
 * asks to save, so the parcel page carries no wallet code until then.
 */
export default function SealWithWallet(props: {
  hash: string;
  onConfirmed: (signature: string) => void;
}) {
  return (
    <WalletRoot>
      <Sender {...props} />
    </WalletRoot>
  );
}

function Sender({
  hash,
  onConfirmed,
}: {
  hash: string;
  onConfirmed: (signature: string) => void;
}) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [saving, setSaving] = useState<Saving>({ phase: "idle" });
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const busy =
    saving.phase === "checking" ||
    saving.phase === "signing" ||
    saving.phase === "sent";

  const save = useCallback(async () => {
    if (!publicKey) return;
    if (!signTransaction) {
      setSaving({ phase: "failed", message: SEAL.noSigner });
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let signature: string | undefined;
    try {
      signature = await signAndSend({
        connection,
        payer: publicKey,
        spec: reportMemoInstruction({
          signer: publicKey.toBase58(),
          sha256: hash,
        }),
        signTransaction,
        onPhase: (phase) => setSaving({ phase }),
      });
      setSaving({ phase: "sent", signature });
      await waitForConfirmation(connection, signature, controller.signal);
      if (!controller.signal.aborted) {
        setSaving({ phase: "confirmed", signature });
        onConfirmed(signature);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSaving({
          phase: "failed",
          message: explainFailure(error),
          signature,
        });
      }
    }
  }, [connection, publicKey, signTransaction, hash, onConfirmed]);

  const signature = "signature" in saving ? saving.signature : undefined;

  return (
    <div className="seal-save">
      <p className="seal-memo">
        <span className="seal-label">{SEAL.memoLabel}</span>{" "}
        <code>{reportMemo(hash)}</code>
      </p>
      <WalletBar />
      {publicKey && saving.phase !== "confirmed" && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {saving.phase === "failed"
            ? SEAL.saveAgain
            : SEAL.send(shortAddress(publicKey.toBase58()))}
        </button>
      )}
      <p className="seal-quiet">{SEAL.fee}</p>

      {saving.phase !== "idle" && (
        <div
          className="seal-status"
          data-phase={saving.phase}
          aria-live="polite"
        >
          <p>
            {saving.phase === "failed"
              ? `${SEAL.status.failed} ${saving.message}`
              : SEAL.status[saving.phase]}
          </p>
          {signature && (
            <>
              <p className="seal-signature">
                <span className="seal-label">{SEAL.signature}</span>{" "}
                <code>{signature}</code>
                <CopyButton value={signature} label={SEAL.copySignature} icon />
              </p>
              <a
                href={explorerTxUrl(signature)}
                target="_blank"
                rel="noreferrer"
              >
                {SEAL.viewTx}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
