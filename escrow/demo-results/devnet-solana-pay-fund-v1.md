# Solana Pay funding of the rehearsal deal on devnet (2026-11-19)

The buyer funded `staged-devnet-deal-pay-rehearsal` with the transaction that `POST /api/deals/:id/solana-pay/fund` returned. The API built it unsigned; the buyer's key signed it. Staged wallets and test USDC only. Public keys and signatures only.

- Deal PDA: [`9zy4EJot…qszL`](https://explorer.solana.com/address/9zy4EJot1UdRFjHzhBJrQPiQBQpp7oXhBhmBKrbtqszL?cluster=devnet)
- Vault: [`a5mZ4Qje…ft3`](https://explorer.solana.com/address/a5mZ4QjeqxruNU29vrWgGa1q6DLbsvHKZ4T64Mfvft3?cluster=devnet)
- Initialized by `demo:deals stage-init`: [`3CePKjdY…PeeT`](https://explorer.solana.com/tx/3CePKjdYxbtfFVE6jHcLykzyPX4vtDNBbS5NAdrVhRuk5ojt3z9XD1FrXm91FdUq8DmEhmRMFerxLn7rPZzMPeeT?cluster=devnet). Record: [`devnet-stage-pay-rehearsal-v1.md`](devnet-stage-pay-rehearsal-v1.md).

## How it was run

- The API ran locally (this branch) against a throwaway Postgres seeded with the staged deals, reading public devnet through `https://api.devnet.solana.com`.
- **The wallet was simulated, not a real wallet app.** A Node script used the official Solana Pay client (`@solana/pay` 0.2.6):
  - `parseURL` accepted the URL the deal page shows;
  - `fetchTransaction` made the spec's POST `{ account }` and accepted the response;
  - the script then signed the transaction with the staged buyer keypair and sent it.
- The returned transaction had one required signer (the buyer), and that signature slot was empty. It held a single `fund` instruction to program `ASQoBt…EBZG`, with accounts in the IDL's order: buyer, deal, buyer USDC, vault, mint, token program.
- **Top-up.** Another session's deal (vault `6JB6qRdQ…`) used the buyer's 5 test USDC at 04:34:37Z, between `stage-init` and funding. So 1 test USDC moved from the staged seller to the staged buyer first: [`5eMWngUM…wFaW`](https://explorer.solana.com/tx/5eMWngUMBXU7Awu4csDvBUQ3MY761avwhkFnAnfdA6QNYPrLsDhLwH4sGTvioLnEPPCiEesT6hsi85vANkqEwFaW?cluster=devnet) (slot 523872653; seller 35 → 34, buyer 0 → 1).

## Fund

| Step | Signer | Result | Slot | Signature |
| --- | --- | --- | --- | --- |
| fund (from the Solana Pay response) | buyer | ok, finalized | 523872660 (04:35:58Z) | [`2SdfcZHd…TH3u`](https://explorer.solana.com/tx/2SdfcZHdc3sUdgjksEKLnMBvV3XkTRXf1ipVwU4esH13NRjEGQous3yNpeXBxwk2xWXtNh3Thck7xcG1EphWTH3u?cluster=devnet) |

| Balances (test USDC, from the transaction's meta) | Buyer | Vault |
| --- | --- | --- |
| before fund | 1 | 0 |
| after fund | 0 | 1 |

`replay:devnet --deal staged-devnet-deal-pay-rehearsal` then applied `DealFunded`, and the API showed the deal as `funded`.

## Refusals checked against the same deal

| Request | Answer |
| --- | --- |
| POST as the staged seller `6XPG…pMMj` | `403` "Only the deal's buyer wallet can fund it (HEDe…EtXJ)." |
| POST as the buyer after funding, while the API still said `draft` | `409` "Devnet shows this deal is already funded." (the chain wins) |
| POST as the buyer after the replay (API `funded`) | `409` "This deal is already funded; it can be funded only once." |
