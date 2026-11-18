// Places the staged GroundTruth owner callback: the ElevenLabs agent phones a
// consenting teammate who plays the owner on record of the golden parcel.
//
//   pnpm --filter @groundtruth/backend call:owner            # dry run
//   pnpm --filter @groundtruth/backend call:owner --confirm  # dials
//
// Reads backend/.env: ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID,
// ELEVENLABS_PHONE_NUMBER_ID, OWNER_CALLBACK_TO_NUMBER,
// OWNER_CALLBACK_PARTICIPANT_LABEL, and optional OWNER_CALLBACK_DEAL_ID.
// Prints IDs only; never the API key or the full phone number.
import { buildOwnerCallRequest } from "../src/voice/outboundCall.js";

async function main(): Promise<void> {
  const request = buildOwnerCallRequest(process.env);
  const vars =
    request.body.conversation_initiation_client_data.dynamic_variables;
  console.log(`agent:        ${request.body.agent_id}`);
  console.log(`phone number: ${request.body.agent_phone_number_id}`);
  console.log(`calling:      ${request.maskedTo}`);
  console.log(`deal:         ${vars.deal_id}`);
  console.log(`participant:  ${vars.participant_label}`);
  console.log(`parcel:       ${vars.parcel_id}, ${vars.parcel_description}`);

  if (!process.argv.includes("--confirm")) {
    console.log("\nDry run. Add --confirm to place the call.");
    return;
  }

  const res = await fetch(request.url, {
    method: "POST",
    headers: {
      "xi-api-key": request.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(request.body),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    console.error(`\nCall not placed: HTTP ${res.status}`);
    console.error(
      JSON.stringify(body.detail ?? body.message ?? body).slice(0, 400),
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nCall placed.");
  console.log(
    `conversation_id: ${String(body.conversation_id ?? "(not returned)")}`,
  );
  console.log(`twilio callSid:  ${String(body.callSid ?? "(not returned)")}`);
  console.log(
    "When the call ends, ElevenLabs posts the result to /api/webhooks/elevenlabs.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "call failed");
  process.exitCode = 1;
});
