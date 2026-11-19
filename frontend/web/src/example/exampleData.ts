import type { ParcelData } from "../pages/ParcelPage";
import {
  EXAMPLE_BOTTOM_LINE,
  EXAMPLE_DEAL,
  EXAMPLE_KEY,
  EXAMPLE_LAYERS,
  EXAMPLE_REPORT,
} from "./exampleFixture";

/**
 * The example parcel's data, in the shape the parcel view reads from the API.
 * Everything comes from exampleFixture.ts; nothing here touches the network.
 */
export const EXAMPLE_DATA: ParcelData = {
  getReport: async () => ({ status: "found", report: EXAMPLE_REPORT }),
  dealIdsFor: () => [EXAMPLE_KEY],
  getDeal: async () => ({ status: "found", deal: EXAMPLE_DEAL }),
  getLayers: async () => ({ status: "found", layers: EXAMPLE_LAYERS }),
  bottomLine: EXAMPLE_BOTTOM_LINE,
};
