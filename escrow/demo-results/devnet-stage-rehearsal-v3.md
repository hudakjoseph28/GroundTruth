# GroundTruth demo closings on Solana devnet

Staged test closings with devnet test USDC. Every signature links to Solana Explorer (devnet).

| | |
| --- | --- |
| Status | complete |
| Program | [`ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG`](https://explorer.solana.com/address/ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG?cluster=devnet) |
| USDC mint | [`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet) (Circle devnet) |
| Parcel | `ohio:39049:230-000918` |
| Amount per deal | 5.00 test USDC (`5000000` base units) |
| Run | `stage-rehearsal-v3`, 2026-11-19T04:33:56.432Z → 2026-11-19T04:34:45.060Z |

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

## Released deal: seller paid after every approval

- Deal PDA: [`ESMKH5PB2jSd5U4L8hvC1XMVerhYsuRN6U3B6GHrLzf7`](https://explorer.solana.com/address/ESMKH5PB2jSd5U4L8hvC1XMVerhYsuRN6U3B6GHrLzf7?cluster=devnet)
- Vault: [`6JB6qRdQE2wXPr8oZUUM2UtQmY6oCVx5P4QRreytJ1qC`](https://explorer.solana.com/address/6JB6qRdQE2wXPr8oZUUM2UtQmY6oCVx5P4QRreytJ1qC?cluster=devnet)
- Backend deal: `staged-devnet-deal-rehearsal-v3`
- Deal ID: `f77b159c9e7399ecb98604f72ab4e3695ff2966e734ece81930314f15b9597fd` = sha256(`groundtruth-demo-rehearsal-v3`)
- Final state: **funded**

| Step | Signer | Result | State after | Signature |
| --- | --- | --- | --- | --- |
| initialize_deal | buyer | ok | draft | [`2q9hwKjn…wXG5`](https://explorer.solana.com/tx/2q9hwKjnb4GEvrTMqRiSXvi2K8XzhGby4UcBgL4ZubKiCjMHKCqLmFiMXhvciM8bEuT3Mq6rSdtdrth82NErwXG5?cluster=devnet) |
| fund | buyer | ok | funded | [`iTwkdfeL…Gkqe`](https://explorer.solana.com/tx/iTwkdfeLJgio8U1vdccTAhPFb9TJaGW5dGv1om41SPN33vN43aaLjyXWhmxEERDhDcz9tJJshuRYbj3KzWdGkqe?cluster=devnet) |
| sign_approval (title) | title reviewer | ok | funded | [`4wy966Zj…oYBQ`](https://explorer.solana.com/tx/4wy966Zja1E1BjNRwM2QuDs9gAchNQGQ8wd3az8bct2rBG2sohNzMzVXHEEvEH6xTKjbufKapKiytvkbJY8yoYBQ?cluster=devnet) |
| sign_approval (survey) | survey reviewer | ok | funded | [`4YQrEBQS…6C9Z`](https://explorer.solana.com/tx/4YQrEBQSUFA67N1np2AoaKGWL1TTdXs91fFuNDCtqDkLT6T4ZQRjBfCjBRrd5aW4W416gvCCfbf8DfSicHL76C9Z?cluster=devnet) |

| Balances (USDC) | Buyer | Vault | Seller |
| --- | --- | --- | --- |
| after fund | 0.00 | 5.00 | 35.00 |
| after stage-prep (title and survey approved) | 0.00 | 5.00 | 35.00 |
