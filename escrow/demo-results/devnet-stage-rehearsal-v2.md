# GroundTruth demo closings on Solana devnet

Staged test closings with devnet test USDC. Every signature links to Solana Explorer (devnet).

| | |
| --- | --- |
| Status | complete |
| Program | [`ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG`](https://explorer.solana.com/address/ASQoBtBsz1igQXsWzKZqFYqBGtBX4ErCJjNpuo8rEBZG?cluster=devnet) |
| USDC mint | [`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet) (Circle devnet) |
| Parcel | `ohio:39049:230-000918` |
| Amount per deal | 10.00 test USDC (`10000000` base units) |
| Run | `stage-rehearsal-v2`, 2026-11-19T02:48:35.053Z → 2026-11-19T02:48:45.498Z |

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

- Deal PDA: [`EPYNKVUCSUJvmuKa5NqJqNmswcdziLRJHUgwTkkC8J2X`](https://explorer.solana.com/address/EPYNKVUCSUJvmuKa5NqJqNmswcdziLRJHUgwTkkC8J2X?cluster=devnet)
- Vault: [`4awpxEmXL8fHDFDE9Lu6qHGq6NdBVpLjUUgT3nCHtCpt`](https://explorer.solana.com/address/4awpxEmXL8fHDFDE9Lu6qHGq6NdBVpLjUUgT3nCHtCpt?cluster=devnet)
- Backend deal: `staged-devnet-deal-rehearsal-v2`
- Deal ID: `6554bc65047df74393d5596eb8bb9d493bb646c30f7f798de1566b150b0db7cc` = sha256(`groundtruth-demo-rehearsal-v2`)
- Final state: **funded**

| Step | Signer | Result | State after | Signature |
| --- | --- | --- | --- | --- |
| initialize_deal | buyer | ok | draft | [`5pDg1LzF…MY9t`](https://explorer.solana.com/tx/5pDg1LzFXVWFCTbtqdDSaBc6Kr2EVNJW27WWrDnGquw2vEs8dDq8XAXfU3m53bV4cCbqhH3aNMnm8PpVZgwaMY9t?cluster=devnet) |
| fund | buyer | ok | funded | [`2vha8dsD…cD3D`](https://explorer.solana.com/tx/2vha8dsDDk5HRG72UXBy6KosU5C2NWAtzmdMKczDbYx91na4NTBasBz2EANE7QQGrQRaaZvvwxHh4v6YHmMocD3D?cluster=devnet) |
| sign_approval (title) | title reviewer | ok | funded | [`XqiiMvze…axnW`](https://explorer.solana.com/tx/XqiiMvzexcsrSCCFxEmEcufBVzX29jsUK28nC6ARrKUV5GHQNwbBRjZCsacWppiHhmSvXnT4eSuGNuRnRy6axnW?cluster=devnet) |
| sign_approval (survey) | survey reviewer | ok | funded | [`2ZuVbvFT…mmQ7`](https://explorer.solana.com/tx/2ZuVbvFTBXztdK8Qw2m1DoVd1x4TZZKnaaQ46PAsLRvig2V4zf7NdF4JA5cuTBugwz8iT9CGvquvU5GvuspXmmQ7?cluster=devnet) |

| Balances (USDC) | Buyer | Vault | Seller |
| --- | --- | --- | --- |
| after fund | 5.00 | 10.00 | 35.00 |
| after stage-prep (title and survey approved) | 5.00 | 10.00 | 35.00 |
