import { prisma } from "../db.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { HttpError } from "../http/errors.js";
import { parseParcelKey } from "../parcels/parcelKey.js";
import { toParcelReport } from "../reports/mapReport.js";

export const getParcelReport = asyncRoute(async (req, res) => {
  const parcelKey = readParcelKey(req.params.parcelKey);
  if (!parseParcelKey(parcelKey)) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "Parcel key must look like ohio:39049:PARCEL-ID.",
      false,
    );
  }

  const parcel = await prisma.parcelRecord.findUnique({
    where: { key: parcelKey },
    include: {
      report: {
        include: {
          checks: {
            include: { sources: true },
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });

  if (!parcel) {
    throw new HttpError(
      404,
      "NOT_FOUND",
      "No parcel is recorded for this key.",
      false,
    );
  }
  if (!parcel.report) {
    throw new HttpError(
      404,
      "NOT_FOUND",
      "No report is recorded for this parcel.",
      false,
    );
  }

  res.json(toParcelReport(parcel.report));
});

function readParcelKey(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
