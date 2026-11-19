import { solanaPayFundPath, solanaPayUrl } from "@groundtruth/shared";
import { SOLANA_PAY } from "../content/deal";
import { shortAddress } from "../data/ledger";
import { QrCode } from "./QrCode";

/**
 * A draft deal's Solana Pay transaction request: the QR and the link open the
 * buyer's wallet, which asks the API for the unsigned `fund` transaction,
 * then signs and sends it. The page never builds, signs, or sends anything.
 */
export function SolanaPayFund({
  dealId,
  amount,
  buyerWallet,
  origin = window.location.origin,
}: {
  dealId: string;
  /** Whole and fractional test USDC, for example "1". */
  amount: string;
  buyerWallet: string;
  /** The API is reached on the page's origin (/api is forwarded). */
  origin?: string;
}) {
  const link = `${origin}${solanaPayFundPath(dealId)}`;
  const url = solanaPayUrl(link);
  return (
    <section className="deal-pay" aria-labelledby="deal-pay-title">
      <QrCode value={url} label={SOLANA_PAY.alt(link)} />
      <div>
        <h2 id="deal-pay-title">{SOLANA_PAY.title}</h2>
        <p>{SOLANA_PAY.body(amount)}</p>
        <p>{SOLANA_PAY.buyerOnly(shortAddress(buyerWallet))}</p>
        <p className="deal-pay-actions">
          <a className="btn btn-primary btn-small" href={url}>
            {SOLANA_PAY.open}
          </a>
        </p>
        <p className="deal-pay-link">
          <span>{SOLANA_PAY.link}</span> <span className="mono">{url}</span>
        </p>
        <p className="deal-pay-note">{SOLANA_PAY.signing}</p>
      </div>
    </section>
  );
}
