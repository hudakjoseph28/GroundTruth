# GroundTruth demo closings on Solana devnet

Staged test closings with devnet test USDC. Every signature links to Solana Explorer (devnet).

| | |
| --- | --- |
| Status | complete |
| Program | [`ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG`](https://explorer.solana.com/address/ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG?cluster=devnet) |
| USDC mint | [`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet) (Circle devnet) |
| Parcel | `ohio:39049:230-000918` |
| Amount per deal | 1.00 test USDC (`1000000` base units) |
| Run | `stage-pay-rehearsal-v1`, 2026-11-19T04:33:06.638Z → 2026-11-19T04:33:08.179Z |

## Wallets (staged, public keys only)

| Role | Address |
| --- | --- |
| buyer | [`HEDe3DMbVbFRku2Kzxq6usSjUdDJ1vphohTBxAXqEtXJ`](https://explorer.solana.com/address/HEDe3DMbVbFRku2Kzxq6usSjUdDJ1vphohTBxAXqEtXJ?cluster=devnet) |
| seller | [`6XPGX3Vmqh4gtj6UZNcgJTDN1haWivctw8KQ7D6UpMMj`](https://explorer.solana.com/address/6XPGX3Vmqh4gtj6UZNcgJTDN1haWivctw8KQ7D6UpMMj?cluster=devnet) |
| title | [`ExxnTPx24fjXRiAPcnrWqKCfEQDhDmxCDZ57VQ7RkBRW`](https://explorer.solana.com/address/ExxnTPx24fjXRiAPcnrWqKCfEQDhDmxCDZ57VQ7RkBRW?cluster=devnet) |
| survey | [`CT6Nstaijac7yAVuDNVWQ12JFMYGfggE4VPBK4sYohDa`](https://explorer.solana.com/address/CT6Nstaijac7yAVuDNVWQ12JFMYGfggE4VPBK4sYohDa?cluster=devnet) |
| septic | [`Ab7KLjree8ZgUrgXvtpb84oHKvzakC6VpRcPqnXoYz3F`](https://explorer.solana.com/address/Ab7KLjree8ZgUrgXvtpb84oHKvzakC6VpRcPqnXoYz3F?cluster=devnet) |
| buyer USDC | [`7gXgJ3bk14SoqoKd6VaYanGpxsg8s9UXJ9AqJyLekJ73`](https://explorer.solana.com/address/7gXgJ3bk14SoqoKd6VaYanGpxsg8s9UXJ9AqJyLekJ73?cluster=devnet) |
| seller USDC | [`CZQyg2JGyjj9vRyvaBYS2tz54kproMxoiNF9hHxTG5Zu`](https://explorer.solana.com/address/CZQyg2JGyjj9vRyvaBYS2tz54kproMxoiNF9hHxTG5Zu?cluster=devnet) |

## Solana Pay rehearsal deal: initialized here, funded by the buyer's wallet

- Deal PDA: [`9zy4EJot1UdRFjHzhBJrQPiQBQpp7oXhBhmBKrbtqszL`](https://explorer.solana.com/address/9zy4EJot1UdRFjHzhBJrQPiQBQpp7oXhBhmBKrbtqszL?cluster=devnet)
- Vault: [`a5mZ4QjeqxruNU29vrWgGa1q6DLbsvHKZ4T64Mfvft3`](https://explorer.solana.com/address/a5mZ4QjeqxruNU29vrWgGa1q6DLbsvHKZ4T64Mfvft3?cluster=devnet)
- Backend deal: `staged-devnet-deal-pay-rehearsal`
- Deal ID: `17e0f6568f539dba9581cef87392ac8b62226fdc71036ca5a2f94d1edcce6b9e` = sha256(`groundtruth-demo-pay-rehearsal-v1`)
- Final state: **draft**

| Step | Signer | Result | State after | Signature |
| --- | --- | --- | --- | --- |
| initialize_deal | buyer | ok | draft | [`3CePKjdY…PeeT`](https://explorer.solana.com/tx/3CePKjdYxbtfFVE6jHcLykzyPX4vtDNBbS5NAdrVhRuk5ojt3z9XD1FrXm91FdUq8DmEhmRMFerxLn7rPZzMPeeT?cluster=devnet) |

| Balances (USDC) | Buyer | Vault | Seller |
| --- | --- | --- | --- |
| after stage-init (draft, nothing funded) | 5.00 | 0.00 | 35.00 |
