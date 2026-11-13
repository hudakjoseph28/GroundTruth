# Phase 3 · Connected surfaces

**Outcome.** A buyer who researched a parcel on the web can open the same deal on a second device and see a reviewer decision arrive from confirmed chain state. The disputed path includes an ElevenLabs callback as evidence for that reviewer.

**Read first**

- Website, phone, and the closing diagram in [Architecture](../../architecture/Architecture.md)
- The SolMail section of [Reference builds](../../context/ReferenceBuilds.md)
- The QuickNode and ElevenLabs rows in the [UBC brief](../../ubc/UBC-Hackathon.md)

## Carry in

The phone and the website share the deal API and the deal identity. The QR code carries an HTTPS deal link, and the server checks that the signed-in account may open it. Credentials and deal details stay out of the QR payload. Judges without the installed app get a mobile-web route to the same deal.

ElevenLabs supplies evidence for the disputed closing. The assigned reviewer decides whether to sign a hold. QuickNode Streams is the source for the buyer’s live timeline: a signed change on one device updates the other after the chain confirms it. Voice output and model output remain advisory.

Configure Devnet explicitly for every client and agent path.

## Leave behind

A phone agent that can release or refund, SolMail’s email score policy, and hard-coded instruction discriminators from another program. Native wallet signing on the phone is optional. The iPhone demo can show status and alerts while the tested web wallet signs.

## Demo scope

One filtered Stream, one consenting teammate on the ElevenLabs call, and one second device are enough. The disputed deal plays the callback, records the hold, and shows the rejected release. The cleared deal shows the final approval arrive through the Stream and then the payout. Push notifications are in scope only if an installed build, permissions, and platform credentials are ready. The mobile-web route covers the judge path either way.

## Acceptance checks

1. Open the deal link on a phone with the authorized account. A reviewer approval appears from the confirmed chain update, and a refresh shows the same deal and receipt.
2. A different account opening that link receives no private deal data.
3. The callback result reaches the reviewer as evidence. The reviewer signature, not the call, is what the program checks. The Stream event matches the saved transaction signature.

## Depends on

[Phase 1](../01-escrow/Escrow.md) provides the held and released transactions. [Phase 2](../02-parcel-research/ParcelResearch.md) provides the parcel the deal is about. This phase wires those fixtures to the second device, the call, and the Stream.
