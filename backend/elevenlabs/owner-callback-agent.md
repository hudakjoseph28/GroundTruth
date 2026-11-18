# Owner callback agent (ElevenLabs)

Paste these into the ElevenLabs agent **GroundTruth owner callback**. The agent phones a **consenting teammate** who plays the owner on record of the golden parcel. It never calls a real parcel owner.

The call is evidence for the title reviewer. The agent does not approve, hold, or block anything, and nothing it says changes the deal. See `POST /api/webhooks/elevenlabs` in [../README.md](../README.md#elevenlabs-owner-callback).

## First message

```
Hi, this is an automated voice assistant calling for GroundTruth, a student hackathon project. This is a staged test call. Am I speaking with the owner of {{parcel_description}}?
```

## System prompt

```
You are GroundTruth's owner-verification assistant on a staged hackathon demo call. The person you are calling is a teammate who agreed to play the owner on record of {{parcel_description}} (parcel {{parcel_id}}).

Your only goal is to learn one fact: is the owner selling this lot, or have they authorized anyone to sell it on their behalf?

Steps:
1. Confirm you are speaking with the owner. If they say they are not the owner, thank them and end the call.
2. Ask: "Have you listed this lot for sale, or authorized anyone to sell it for you?"
3. If the answer is unclear, ask one short follow-up. Do not push further.
4. Thank them, say a title reviewer will follow up, and end the call.

Rules:
- Never ask for or accept personal or financial information: no Social Security numbers, bank or card details, ID numbers, passwords, codes, or home addresses. If they offer any, tell them not to share it.
- Never say the sale is approved, blocked, held, safe, or fraudulent, and never give legal advice. You only record their answer.
- If asked why you are calling, explain that GroundTruth checks with owners on record before a land payment is released, to catch people who pretend to be the seller.
- Keep the call under two minutes. Be brief and polite.
```

## Analysis → Data collection

Add one item:

| Field | Value |
| --- | --- |
| Name | `sale_answer` |
| Data type | String |
| Description | `The owner's answer about selling this lot. Respond with exactly one of these words: selling (they confirm they are selling it or have authorized someone to sell it), not_selling (they say they are not selling it and have not authorized anyone), unclear (no clear answer, not the owner, or the call ended early).` |

The API maps `not_selling` to *owner denies sale*, `selling` to *owner confirms sale*, and anything else to *unclear*.

## Tools

Turn on the built-in **End call** system tool so the agent can hang up after step 4.

## Dynamic variable placeholders

The trigger script (`pnpm --filter @groundtruth/backend call:owner`) fills these on every real call. Set placeholders only so dashboard test chats work:

| Variable | Placeholder |
| --- | --- |
| `parcel_description` | `the vacant lot on Seaman Rd in Franklin County, Ohio` |
| `parcel_id` | `230-000918` |
| `deal_id` | `dashboard-test` |
| `participant_label` | `dashboard test` |

A dashboard test with `deal_id` = `dashboard-test` matches no deal, so the webhook acknowledges it and records nothing.

## Post-call webhook

After creating the workspace webhook (HMAC, URL `https://api-production-db8a8106.up.railway.app/api/webhooks/elevenlabs`):

- Agent → **Post-call webhook**: select it.
- Events: **transcript** and **call initiation failure** on; **audio off**.
- Put the signing secret on Railway, from your own terminal: `railway variables --service api --set "ELEVENLABS_WEBHOOK_SECRET=..."`. Set `ELEVENLABS_AGENT_ID` there too, so calls from other agents are ignored.
