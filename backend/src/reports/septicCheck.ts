import type { Check, Parcel, Source } from "@groundtruth/shared";
import {
  LIVING_ATLAS_SOILS_LAYER,
  SDA_POST_REST,
  type SoilMapUnit,
  type SoilsOutcome,
  type SoilsSource,
} from "./ssurgoSoils.js";

export const ODH_SEWAGE_HOMEOWNER_GUIDANCE =
  "https://odh.ohio.gov/know-our-programs/sewage-treatment-systems/information-for-homeowners/";

export function septicCheck(
  parcel: Parcel,
  outcome: SoilsOutcome,
  timeoutMs: number,
): Check {
  const responsibleParty = {
    role: "Local health district (sewage treatment systems)",
    organization: `${parcel.county} County or city health district`,
    publicContactUrl: ODH_SEWAGE_HOMEOWNER_GUIDANCE,
  };
  const nextAction =
    "Open the Ohio Department of Health homeowner page to find the local health district, then obtain the district's site and soil evaluation before planning a septic system.";

  switch (outcome.outcome) {
    case "found":
      return {
        kind: "septic",
        status: "needsReview",
        finding: `USDA NRCS SSURGO${viaFallback(outcome.source)} maps ${listMapUnits(outcome.mapUnits)} under this parcel. These published soil limitations do not establish that an on-site sewage system is feasible.`,
        limitation:
          "The rating describes a map unit's dominant soil condition for septic-tank absorption fields. It does not confirm sewer availability, choose a system or drain-field location, account for every site condition, or replace a permit and an on-site soil evaluation.",
        sources: [ssurgoSource(outcome.source, outcome.retrievedAt)],
        responsibleParty,
        nextAction,
      };
    case "missing":
      return {
        kind: "septic",
        status: "unknown",
        finding:
          outcome.reason === "noMapUnits"
            ? `${providerName(outcome.source)} returned no SSURGO soil map unit under this parcel.`
            : "One or more SSURGO soil map units under this parcel have no published septic-tank absorption field rating in the requested rating classes.",
        limitation:
          "No septic-suitability conclusion either way. Missing or unrated soil records are not evidence that a septic system will or will not work.",
        sources: [ssurgoSource(outcome.source, outcome.retrievedAt)],
        responsibleParty,
        nextAction,
      };
    case "timeout":
      return {
        kind: "septic",
        status: "unknown",
        finding:
          outcome.cause === "timedOut"
            ? `Neither USDA NRCS Soil Data Access nor the Esri Living Atlas SSURGO copy answered within ${formatSeconds(timeoutMs)}, so soil map units and septic ratings were not checked.`
            : "Neither USDA NRCS Soil Data Access nor the Esri Living Atlas SSURGO copy could be reached, so soil map units and septic ratings were not checked.",
        limitation: "No septic-suitability conclusion either way.",
        sources: [],
        responsibleParty,
        nextAction,
      };
  }
}

function listMapUnits(mapUnits: SoilMapUnit[]): string {
  return list(
    mapUnits.map(
      (unit) =>
        `${percent(unit.share)} as map unit ${unit.symbol} (${unit.name}), rated “${unit.rating}” for septic-tank absorption fields`,
    ),
  );
}

function ssurgoSource(source: SoilsSource, retrievedAt: string): Source {
  return source === "soilDataAccess"
    ? {
        authority: "USDA Natural Resources Conservation Service",
        title:
          "SSURGO map units: septic-tank absorption fields, dominant-condition rating",
        url: SDA_POST_REST,
        retrievedAt,
      }
    : {
        authority:
          "USDA Natural Resources Conservation Service (SSURGO), hosted by Esri ArcGIS Living Atlas",
        title:
          "USA Soils Map Units (gSSURGO): septic-tank absorption fields, dominant-condition rating (engstafdcd)",
        url: LIVING_ATLAS_SOILS_LAYER,
        retrievedAt,
      };
}

function providerName(source: SoilsSource): string {
  return source === "soilDataAccess"
    ? "USDA NRCS Soil Data Access"
    : "The Esri Living Atlas copy of USDA NRCS SSURGO";
}

function viaFallback(source: SoilsSource): string {
  return source === "livingAtlas"
    ? " (Esri Living Atlas copy, used because Soil Data Access was unavailable)"
    : "";
}

function percent(share: number): string {
  const value = Math.round(share * 1_000) / 10;
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}% of the parcel`;
}

function list(items: string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function formatSeconds(ms: number): string {
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
