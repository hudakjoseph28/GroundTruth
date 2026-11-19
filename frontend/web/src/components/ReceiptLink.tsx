import type { ReactNode } from "react";
import { EXAMPLE } from "../content/example";
import { explorerAddressUrl, explorerTxUrl } from "../data/ledger";
import { useIsExample } from "../example/ExampleContext";

/**
 * A link to Solana Explorer for a transaction or an account. On an example
 * page the receipt is made up, so it is shown as an example and not linked.
 */
export function ReceiptLink({
  signature,
  address,
  className,
  title,
  children,
}: {
  signature?: string;
  address?: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const example = useIsExample();
  if (example) {
    return (
      <span
        className={className ? `${className} example-receipt` : "example-receipt"}
        title={EXAMPLE.receiptTitle}
        data-example-receipt
      >
        {children}
      </span>
    );
  }
  const href = signature ? explorerTxUrl(signature) : explorerAddressUrl(address ?? "");
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer" title={title}>
      {children}
    </a>
  );
}
