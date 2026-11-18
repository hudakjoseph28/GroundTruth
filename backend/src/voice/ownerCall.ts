import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * The agent's data-collection field that carries the owner's answer. Its
 * value is one of SALE_ANSWERS (see backend/elevenlabs/owner-callback-agent.md).
 */
export const SALE_ANSWER_FIELD = "sale_answer";

export type OwnerCallOutcome =
  | "ownerDeniesSale"
  | "ownerConfirmsSale"
  | "unclear"
  | "noAnswer";

export interface OwnerCall {
  conversationId: string;
  agentId: string;
  /** From the call's `deal_id` dynamic variable; null when absent. */
  dealId: string | null;
  completedAt: Date;
  participantLabel: string;
  /** ElevenLabs analysis.call_successful, or "notConnected". */
  callSuccessful: string;
  outcome: OwnerCallOutcome;
  /** Only for noAnswer: busy, no-answer, or unknown. */
  failureReason?: string;
}

export type ParsedWebhook =
  | { kind: "call"; call: OwnerCall }
  | { kind: "ignored"; type: string };

export type RecordResult = "recorded" | "duplicate" | "unknownDeal";

const dynamicVariables = z
  .object({ dynamic_variables: z.record(z.string(), z.unknown()).optional() })
  .optional();

const transcription = z.object({
  type: z.literal("post_call_transcription"),
  event_timestamp: z.number().int().positive(),
  data: z.object({
    conversation_id: z.string().min(1).max(200),
    agent_id: z.string().min(1).max(200),
    metadata: z
      .object({
        start_time_unix_secs: z.number().int().positive().optional(),
        call_duration_secs: z.number().nonnegative().optional(),
      })
      .optional(),
    analysis: z
      .object({
        call_successful: z.string().optional(),
        data_collection_results: z
          .record(z.string(), z.object({ value: z.unknown().optional() }))
          .optional(),
      })
      .nullish(),
    conversation_initiation_client_data: dynamicVariables.nullable(),
  }),
});

const initiationFailure = z.object({
  type: z.literal("call_initiation_failure"),
  event_timestamp: z.number().int().positive(),
  data: z.object({
    conversation_id: z.string().min(1).max(200),
    agent_id: z.string().min(1).max(200),
    failure_reason: z.string().optional(),
    conversation_initiation_client_data: dynamicVariables.nullable(),
  }),
});

const envelope = z.object({ type: z.string() });

/**
 * Reads the fields GroundTruth keeps from a verified ElevenLabs webhook.
 * Returns null when the body is not a webhook shape we recognize at all.
 * The transcript, audio, and phone details in the payload are never read.
 */
export function parseOwnerCallWebhook(body: unknown): ParsedWebhook | null {
  const head = envelope.safeParse(body);
  if (!head.success) return null;

  if (head.data.type === "post_call_transcription") {
    const parsed = transcription.safeParse(body);
    if (!parsed.success) return null;
    const { data, event_timestamp } = parsed.data;
    const vars = data.conversation_initiation_client_data?.dynamic_variables;
    const meta = data.metadata;
    const endedAt =
      meta?.start_time_unix_secs !== undefined &&
      meta.call_duration_secs !== undefined
        ? meta.start_time_unix_secs + meta.call_duration_secs
        : event_timestamp;
    const callSuccessful = data.analysis?.call_successful ?? "unknown";
    return {
      kind: "call",
      call: {
        conversationId: data.conversation_id,
        agentId: data.agent_id,
        dealId: readString(vars?.deal_id),
        completedAt: new Date(Math.round(endedAt * 1000)),
        participantLabel: readLabel(vars?.participant_label),
        callSuccessful,
        outcome: toOutcome(
          data.analysis?.data_collection_results?.[SALE_ANSWER_FIELD]?.value,
        ),
      },
    };
  }

  if (head.data.type === "call_initiation_failure") {
    const parsed = initiationFailure.safeParse(body);
    if (!parsed.success) return null;
    const { data, event_timestamp } = parsed.data;
    const vars = data.conversation_initiation_client_data?.dynamic_variables;
    return {
      kind: "call",
      call: {
        conversationId: data.conversation_id,
        agentId: data.agent_id,
        dealId: readString(vars?.deal_id),
        completedAt: new Date(event_timestamp * 1000),
        participantLabel: readLabel(vars?.participant_label),
        callSuccessful: "notConnected",
        outcome: "noAnswer",
        failureReason: data.failure_reason ?? "unknown",
      },
    };
  }

  // post_call_audio and anything newer: acknowledged, never stored.
  return { kind: "ignored", type: head.data.type };
}

/** The agent reports one of these; anything else is not an answer. */
function toOutcome(value: unknown): OwnerCallOutcome {
  if (typeof value !== "string") return "unclear";
  const answer = value.trim().toLowerCase();
  if (answer === "not_selling") return "ownerDeniesSale";
  if (answer === "selling") return "ownerConfirmsSale";
  return "unclear";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readLabel(value: unknown): string {
  return readString(value)?.slice(0, 120) ?? "not provided";
}

export function buyerMessage(call: OwnerCall): string {
  switch (call.outcome) {
    case "ownerDeniesSale":
      return "Owner callback: the person reached as the owner on record said they are not selling this lot. This is evidence for the title reviewer, who decides whether to place a hold.";
    case "ownerConfirmsSale":
      return "Owner callback: the person reached as the owner on record said they are selling this lot. This is evidence for the title reviewer, not an approval.";
    case "unclear":
      return "Owner callback: the call did not establish whether the owner on record is selling this lot. The title reviewer needs to follow up.";
    case "noAnswer":
      return `Owner callback: the owner on record could not be reached (${call.failureReason ?? "unknown"}). Unanswered calls go to the title reviewer.`;
  }
}

/**
 * Stores one owner call and its timeline evidence row, exactly once per
 * conversation. Only public demo deals accept evidence. Deal state,
 * approvals, and holds are never touched: a reviewer decides what the call
 * means, and Solana decides whether money moves.
 */
export async function recordOwnerCall(
  prisma: PrismaClient,
  call: OwnerCall,
): Promise<RecordResult> {
  if (!call.dealId) return "unknownDeal";
  const dealId = call.dealId;
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.ownerCallRecord.findUnique({
        where: { conversationId: call.conversationId },
        select: { conversationId: true },
      });
      if (existing) return "duplicate";

      const deal = await tx.dealRecord.findUnique({
        where: { id: dealId },
        select: { publicDemo: true },
      });
      if (!deal?.publicDemo) return "unknownDeal";

      await tx.ownerCallRecord.create({
        data: {
          conversationId: call.conversationId,
          dealId,
          completedAt: call.completedAt,
          participantLabel: call.participantLabel,
          callSuccessful: call.callSuccessful,
          outcome: call.outcome,
        },
      });
      await tx.timelineEventRecord.create({
        data: {
          id: `owner-call:${call.conversationId}`,
          dealId,
          at: call.completedAt,
          type: "evidenceReceived",
          actorRole: "owner callback",
          buyerMessage: buyerMessage(call),
          confirmationStatus: "offChainEvidence",
        },
      });
      return "recorded";
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "duplicate";
    }
    throw error;
  }
}
