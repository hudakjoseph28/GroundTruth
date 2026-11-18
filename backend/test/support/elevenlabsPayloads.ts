import { createHmac } from "node:crypto";

// Shapes follow ElevenLabs' post-call webhook docs and the SDK 2.75.0 types
// (analysis.data_collection_results[name].value). Not recorded from a live
// call; replace with a recorded payload once the first real call lands.

export const AGENT_ID = "agent_9401m7p90m78f3rryvprg3wd4jxd";
export const NOW = new Date("2026-11-17T20:00:00.000Z");
export const NOW_SECS = Math.floor(NOW.getTime() / 1000);

export function transcription(
  overrides: {
    conversationId?: string;
    agentId?: string;
    saleAnswer?: unknown;
    callSuccessful?: string;
    dealId?: string | null;
    participantLabel?: string;
    omitAnalysis?: boolean;
  } = {},
) {
  const vars: Record<string, unknown> = {
    parcel_id: "230-000918",
    parcel_description: "the vacant lot on Seaman Rd in Franklin County, Ohio",
    participant_label:
      overrides.participantLabel ?? "Satya (teammate, consented)",
  };
  if (overrides.dealId !== null) {
    vars.deal_id = overrides.dealId ?? "staged-devnet-deal";
  }
  return {
    type: "post_call_transcription",
    event_timestamp: NOW_SECS,
    data: {
      agent_id: overrides.agentId ?? AGENT_ID,
      conversation_id: overrides.conversationId ?? "conv_01testcallnotselling",
      status: "done",
      transcript: [
        {
          role: "agent",
          message: "Am I speaking with the owner?",
          time_in_call_secs: 0,
        },
        {
          role: "user",
          message: "Yes. No, I'm not selling that lot.",
          time_in_call_secs: 4,
        },
      ],
      metadata: {
        start_time_unix_secs: NOW_SECS - 75,
        call_duration_secs: 42,
        cost: 120,
        termination_reason: "end_call tool was called.",
      },
      analysis: overrides.omitAnalysis
        ? undefined
        : {
            call_successful: overrides.callSuccessful ?? "success",
            transcript_summary: "The owner said they are not selling the lot.",
            evaluation_criteria_results: {},
            data_collection_results:
              overrides.saleAnswer === undefined
                ? {}
                : {
                    sale_answer: {
                      data_collection_id: "sale_answer",
                      value: overrides.saleAnswer,
                      rationale: "The owner said no.",
                    },
                  },
          },
      conversation_initiation_client_data: { dynamic_variables: vars },
    },
  };
}

export function initiationFailure(
  overrides: { conversationId?: string; reason?: string; dealId?: string } = {},
) {
  return {
    type: "call_initiation_failure",
    event_timestamp: NOW_SECS,
    data: {
      agent_id: AGENT_ID,
      conversation_id: overrides.conversationId ?? "conv_01testnoanswer",
      failure_reason: overrides.reason ?? "no-answer",
      metadata: { type: "twilio", body: {} },
      conversation_initiation_client_data: {
        dynamic_variables: {
          deal_id: overrides.dealId ?? "staged-devnet-deal",
          participant_label: "Satya (teammate, consented)",
        },
      },
    },
  };
}

/** The `ElevenLabs-Signature` header for a raw body, as ElevenLabs sends it. */
export function signHeader(body: string, secret: string, t = NOW_SECS): string {
  const digest = createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
  return `t=${t},v0=${digest}`;
}
