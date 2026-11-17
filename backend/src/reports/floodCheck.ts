import type { Check, ResponsibleParty, Source } from "@groundtruth/shared";
import {
  FEMA_MAP_SERVICE_CENTER,
  NFHL_LAYERS,
  nfhlLayerUrl,
  type FloodOutcome,
  type FloodZone,
} from "./femaFlood.js";

const SFHA_MEANING =
  "a Special Flood Hazard Area (FEMA's 1%-annual-chance floodplain)";

const FEMA_MAP: ResponsibleParty = {
  role: "FEMA flood map",
  organization: "FEMA Flood Map Service Center",
  publicContactUrl: FEMA_MAP_SERVICE_CENTER,
};

const FLOODPLAIN_ADMINISTRATOR: ResponsibleParty = {
  role: "Community floodplain administrator (city, village, or county)",
};

/**
 * Turns one FEMA outcome into the flood check. Only `found` becomes
 * `evidenceFound`; every other outcome is `unknown` with a limitation and
 * a next action. `timeoutMs` is the limit the pipeline gave the adapter.
 */
export function floodCheck(outcome: FloodOutcome, timeoutMs: number): Check {
  switch (outcome.outcome) {
    case "found":
      return foundCheck(outcome);
    case "missing":
      return {
        kind: "flood",
        status: "unknown",
        finding:
          "FEMA's National Flood Hazard Layer has no digital flood map covering this lot.",
        limitation:
          "No digital map is not a finding of low flood risk. An older paper map or a local flood study may exist; GroundTruth did not check for one.",
        sources: queriedSources(outcome.retrievedAt),
        responsibleParty: FLOODPLAIN_ADMINISTRATOR,
        nextAction:
          "Ask the floodplain administrator for the city, village, or county whether a paper flood map or local study covers the lot.",
      };
    case "conflict":
      return {
        kind: "flood",
        status: "unknown",
        finding:
          outcome.reason === "studyWithoutZones"
            ? "FEMA lists a flood study for this area, but its flood-zone layer has no zone covering this lot."
            : "FEMA's flood-zone records for this lot contradict FEMA's own zone definitions: a zone's Special Flood Hazard Area flag does not match its zone letter.",
        limitation:
          "Because FEMA's records disagree, GroundTruth states no flood zone for this lot.",
        sources: queriedSources(outcome.retrievedAt),
        responsibleParty: FLOODPLAIN_ADMINISTRATOR,
        nextAction:
          "Ask the community floodplain administrator to read the effective flood map for this lot.",
      };
    case "timeout":
      return {
        kind: "flood",
        status: "unknown",
        finding:
          outcome.cause === "timedOut"
            ? `FEMA's flood map service did not answer within ${formatSeconds(timeoutMs)}, so no flood zone was checked.`
            : "FEMA's flood map service could not be reached, so no flood zone was checked.",
        limitation: "No conclusion either way about flood risk.",
        sources: [],
        responsibleParty: FEMA_MAP,
        nextAction:
          "Reload the report to ask FEMA again, or look the lot up on FEMA's Flood Map Service Center.",
      };
  }
}

function foundCheck(
  outcome: Extract<FloodOutcome, { outcome: "found" }>,
): Check {
  const { zones } = outcome;
  const inSfha = zones.some((zone) => zone.specialFloodHazardArea);
  const floodway = zones.some((zone) => zone.subtype === "FLOODWAY");
  const labels = zones.map(zoneLabel);

  let finding: string;
  if (zones.length === 1) {
    finding = inSfha
      ? `FEMA's flood map puts this lot in ${labels[0]}, ${SFHA_MEANING}.`
      : `FEMA's flood map puts this lot in ${labels[0]}. No part of it is mapped in a Special Flood Hazard Area.`;
  } else {
    finding = `The lot crosses ${zones.length} FEMA flood zones: ${joinList(labels)}. ${
      inSfha
        ? `Part of it is in ${SFHA_MEANING}.`
        : "None of them is a Special Flood Hazard Area."
    }`;
  }
  if (outcome.partlyNotIncluded) {
    finding += " Part of the lot is outside the area FEMA studied.";
  }

  const limitation = [
    zones.length > 1
      ? "GroundTruth has not measured how much of the lot lies in each zone, and FEMA's zone lines and the parcel lines come from different maps."
      : "FEMA's zone lines and the parcel lines come from different maps, so the edges may not line up exactly.",
    inSfha
      ? undefined
      : "Being outside the mapped floodplain does not mean the lot never floods.",
    "A flood zone is not a flood-insurance determination or a building permit.",
  ]
    .filter(Boolean)
    .join(" ");

  const nextAction = inSfha
    ? `Ask your lender whether flood insurance will be required, and ask the community floodplain administrator what building ${floodway ? "in the floodway" : "here"} requires.`
    : "Check the current map for this lot on FEMA's Flood Map Service Center before closing; a lender may still order its own flood determination.";

  return {
    kind: "flood",
    status: "evidenceFound",
    finding,
    limitation,
    sources: [
      zonesSource(outcome.retrievedAt),
      ...outcome.panels.map(
        (panel): Source => ({
          authority: "FEMA",
          title: `Flood Insurance Rate Map panel ${panel.id}`,
          url: nfhlLayerUrl(NFHL_LAYERS.firmPanels),
          retrievedAt: outcome.retrievedAt,
          effectiveDate: panel.effectiveDate,
        }),
      ),
      ...outcome.lomrs.map(
        (lomr): Source => ({
          authority: "FEMA",
          title: `Letter of Map Revision ${lomr.id}`,
          url: nfhlLayerUrl(NFHL_LAYERS.lomrs),
          retrievedAt: outcome.retrievedAt,
          effectiveDate: lomr.effectiveDate,
        }),
      ),
    ],
    responsibleParty: inSfha ? FLOODPLAIN_ADMINISTRATOR : FEMA_MAP,
    nextAction,
  };
}

function zonesSource(retrievedAt: string): Source {
  return {
    authority: "FEMA",
    title: "National Flood Hazard Layer: flood hazard zones",
    url: nfhlLayerUrl(NFHL_LAYERS.floodHazardZones),
    retrievedAt,
  };
}

/** The layers that were asked and answered, dated, for a dated gap. */
function queriedSources(retrievedAt: string): Source[] {
  return [
    {
      authority: "FEMA",
      title: "National Flood Hazard Layer: study availability",
      url: nfhlLayerUrl(NFHL_LAYERS.availability),
      retrievedAt,
    },
    zonesSource(retrievedAt),
  ];
}

/** `Zone AE (regulatory floodway)`, `Zone X (0.2% annual chance flood hazard)`. */
export function zoneLabel(zone: FloodZone): string {
  const name = /\s/.test(zone.zone)
    ? zone.zone.toLowerCase()
    : `Zone ${zone.zone}`;
  if (!zone.subtype) return name;
  const subtype =
    zone.subtype === "FLOODWAY"
      ? "regulatory floodway"
      : zone.subtype.toLowerCase().replace(/(\d)\s*pct\b/g, "$1%");
  return `${name} (${subtype})`;
}

function joinList(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function formatSeconds(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
