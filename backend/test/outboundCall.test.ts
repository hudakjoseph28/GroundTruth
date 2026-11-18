import { describe, expect, it } from "vitest";
import {
  OUTBOUND_CALL_URL,
  buildOwnerCallRequest,
  describeParcel,
} from "../src/voice/outboundCall.js";

const env = {
  ELEVENLABS_API_KEY: "sk_test_key",
  ELEVENLABS_AGENT_ID: "agent_9401m7p90m78f3rryvprg3wd4jxd",
  ELEVENLABS_PHONE_NUMBER_ID: "phnum_4201m7p8zsg4fybbrxtykc6s1ygp",
  OWNER_CALLBACK_TO_NUMBER: "+16145550123",
  OWNER_CALLBACK_PARTICIPANT_LABEL: "Satya (teammate, consented)",
};

describe("buildOwnerCallRequest", () => {
  it("builds the Twilio outbound-call body with the call's dynamic variables", () => {
    const request = buildOwnerCallRequest(env);

    expect(request.url).toBe(OUTBOUND_CALL_URL);
    expect(request.body).toEqual({
      agent_id: env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: env.ELEVENLABS_PHONE_NUMBER_ID,
      to_number: "+16145550123",
      conversation_initiation_client_data: {
        dynamic_variables: {
          deal_id: "staged-devnet-deal",
          participant_label: "Satya (teammate, consented)",
          parcel_id: "230-000918",
          parcel_description:
            "the vacant lot on Seaman Rd in Franklin County, Ohio",
        },
      },
    });
  });

  it("masks the callee's number for printing", () => {
    expect(buildOwnerCallRequest(env).maskedTo).toBe("********0123");
  });

  it("lets a demo deal ID be chosen", () => {
    const request = buildOwnerCallRequest({
      ...env,
      OWNER_CALLBACK_DEAL_ID: "held-demo",
    });
    expect(
      request.body.conversation_initiation_client_data.dynamic_variables
        .deal_id,
    ).toBe("held-demo");
  });

  it.each([
    ["ELEVENLABS_API_KEY", undefined, "missing"],
    ["OWNER_CALLBACK_PARTICIPANT_LABEL", " ", "missing"],
    ["OWNER_CALLBACK_TO_NUMBER", "614-555-0123", "not valid"],
    ["ELEVENLABS_AGENT_ID", "9401m7p90m78", "not valid"],
    ["ELEVENLABS_PHONE_NUMBER_ID", "+16145550123", "not valid"],
  ])("refuses to build when %s is %j", (name, value, message) => {
    expect(() => buildOwnerCallRequest({ ...env, [name]: value })).toThrow(
      message,
    );
  });

  it("never puts the API key in the request body", () => {
    expect(JSON.stringify(buildOwnerCallRequest(env).body)).not.toContain(
      "sk_test_key",
    );
  });
});

describe("describeParcel", () => {
  it("reads the golden parcel's street, dropping the 0 house number", () => {
    expect(describeParcel()).toBe(
      "the vacant lot on Seaman Rd in Franklin County, Ohio",
    );
  });
});
