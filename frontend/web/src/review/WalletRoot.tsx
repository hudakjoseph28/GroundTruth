import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { DEVNET_RPC } from "./escrowTx";

/**
 * Wallet context for the reviewer portal only, so no other page loads
 * wallet code. Phantom is listed explicitly; other Wallet Standard wallets
 * are detected too. The connection is pinned to Solana devnet.
 */
export function WalletRoot({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={DEVNET_RPC} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
