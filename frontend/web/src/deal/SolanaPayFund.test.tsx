import { renderToStaticMarkup } from "react-dom/server";
import { stagedPayRehearsalDeal } from "@groundtruth/shared";
import { describe, expect, it } from "vitest";
import { SolanaPayFund } from "./SolanaPayFund";

describe("SolanaPayFund", () => {
  const deal = stagedPayRehearsalDeal;
  const html = renderToStaticMarkup(
    <SolanaPayFund
      dealId={deal.id}
      amount="1"
      buyerWallet={deal.buyerWallet}
      origin="https://groundtruth.example"
    />,
  );
  const url = `solana:https://groundtruth.example/api/deals/${deal.id}/solana-pay/fund`;

  it("links the deal's transaction request endpoint as a Solana Pay URL", () => {
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(url);
  });

  it("draws a QR code for the same request", () => {
    expect(html).toContain('class="qr"');
    expect(html).toContain(
      `Solana Pay QR code for https://groundtruth.example/api/deals/${deal.id}/solana-pay/fund`,
    );
  });

  it("names the amount, devnet, and the only wallet that can fund it", () => {
    expect(html).toContain("1 test USDC");
    expect(html).toContain("devnet");
    expect(html).toContain("HEDe…EtXJ");
    expect(html).toContain("The API never signs");
  });
});
