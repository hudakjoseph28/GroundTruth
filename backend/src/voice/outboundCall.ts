import { goldenParcel, stagedDeal } from "@groundtruth/shared";

export const OUTBOUND_CALL_URL =
  "https://api.elevenlabs.io/v1/convai/twilio/outbound-call";

export interface OwnerCallRequest {
  url: string;
  apiKey: string;
  body: {
    agent_id: string;
    agent_phone_number_id: string;
    to_number: string;
    conversation_initiation_client_data: {
      dynamic_variables: Record<string, string>;
    };
  };
  /** Safe to print: the callee's number with all but the last 4 digits hidden. */
  maskedTo: string;
}

/**
 * Builds the ElevenLabs outbound-call request for the staged owner callback
 * from local environment variables. Nothing here is sent anywhere.
 *
 * The callee must be a teammate who agreed to take the call; never a real
 * parcel owner. The API key and phone number stay in backend/.env.
 */
export function buildOwnerCallRequest(
  env: NodeJS.ProcessEnv,
): OwnerCallRequest {
  const apiKey = required(env, "ELEVENLABS_API_KEY");
  const agentId = required(env, "ELEVENLABS_AGENT_ID", /^agent_[A-Za-z0-9]+$/);
  const phoneNumberId = required(
    env,
    "ELEVENLABS_PHONE_NUMBER_ID",
    /^phnum_[A-Za-z0-9]+$/,
  );
  const toNumber = required(
    env,
    "OWNER_CALLBACK_TO_NUMBER",
    /^\+[1-9]\d{7,14}$/,
    "in +E.164 form, e.g. +16145550123",
  );
  const participantLabel = required(env, "OWNER_CALLBACK_PARTICIPANT_LABEL");
  const dealId = env.OWNER_CALLBACK_DEAL_ID?.trim() || stagedDeal.id;

  return {
    url: OUTBOUND_CALL_URL,
    apiKey,
    body: {
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: toNumber,
      conversation_initiation_client_data: {
        dynamic_variables: {
          deal_id: dealId,
          participant_label: participantLabel.slice(0, 120),
          parcel_id: goldenParcel.sourceParcelId,
          parcel_description: describeParcel(),
        },
      },
    },
    maskedTo: `${"*".repeat(Math.max(0, toNumber.length - 4))}${toNumber.slice(-4)}`,
  };
}

/** "the vacant lot on Seaman Rd in Franklin County, Ohio" */
export function describeParcel(): string {
  const street = (goldenParcel.siteAddress ?? "")
    .replace(/^0+\s+/, "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const where = street ? `on ${street} ` : "";
  return `the vacant lot ${where}in ${goldenParcel.county} County, Ohio`;
}

function required(
  env: NodeJS.ProcessEnv,
  name: string,
  pattern?: RegExp,
  hint?: string,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is missing from backend/.env`);
  if (pattern && !pattern.test(value)) {
    throw new Error(`${name} is not valid${hint ? ` (${hint})` : ""}`);
  }
  return value;
}
