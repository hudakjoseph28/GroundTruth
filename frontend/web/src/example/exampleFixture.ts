// THE EXAMPLE FIXTURE. Every value on the example pages (/parcels/sample,
// /deals/sample, /walkthrough) comes from this one file, and nothing else in
// the app reads it. It is made up for the demo video:
//
//   - "250 Hashing Rd" and parcel EX-000250 do not exist. The boundary is
//     drawn by hand on farmland in rural Franklin County, about 600 m
//     south-east of the golden parcel, so the baked aerial imagery and
//     elevation under it (public/parcels/EX-000250/) are real, but no county
//     publishes this lot.
//   - The flood zone, wetland, stream setback, zoning line, and right-of-way
//     drawn on it are invented shapes, not FEMA, NWI, or county data.
//   - The deal, its wallets, signatures, documents, and phone call never
//     happened. Signatures and wallets are labeled as examples and never
//     linked to Solana Explorer.
//
// Every page that shows it carries the "Example" tag. Real parcels and real
// deals never fall back to anything here.
//
// Written with erasable TypeScript and type-only imports, so
// scripts/bake-parcel.ts can read the parcel straight from this file.
import type {
  Check,
  Deal,
  DealDocument,
  Hold,
  ParcelLayers,
  ParcelReport,
  Parcel,
  Source,
  TimelineEvent,
} from "@groundtruth/shared";

/** The route segment and parcel key of the example: /parcels/sample, /deals/sample. */
export const EXAMPLE_KEY = "sample";

export const EXAMPLE_PARCEL: Parcel = {
  key: EXAMPLE_KEY,
  sourceParcelId: "EX-000250",
  county: "Franklin",
  countyFips: "39049",
  township: "Pleasant Township",
  siteAddress: "250 Hashing Rd",
  acreage: 6.02,
  mappedAcreage: 6.02,
  centroid: { latitude: 39.876053, longitude: -83.242227 },
  geometry: {
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [-83.2420853, 39.8771334],
          [-83.2408533, 39.8758014],
          [-83.2420867, 39.8751262],
          [-83.2427893, 39.8757451],
          [-83.2433187, 39.8764582],
          [-83.2420853, 39.8771334],
        ],
      ],
    },
    authority: "Ohio OGRIP",
    sourceUrl: "https://ogrip.oit.ohio.gov/",
    retrievedAt: "2026-11-19T15:00:00.000Z",
  },
};

/** When the example report was "generated". Every date below is on this day. */
const DAY = "2026-11-19";
const at = (time: string) => `${DAY}T${time}.000Z`;

// ---------- Map layers ----------
//
// Drawn by hand over the baked imagery (public/parcels/EX-000250/), in
// [longitude, latitude]. The creek runs through the real woods south of the
// lot and the right-of-way follows the real road in front of it; the shapes
// themselves are invented.

type Ring = number[][];

const FLOOD_AE: Ring = [[-83.243963, 39.875761], [-83.243902, 39.875755], [-83.243816, 39.875746], [-83.243716, 39.875735], [-83.243613, 39.875723], [-83.243520, 39.875710], [-83.243437, 39.875696], [-83.243357, 39.875681], [-83.243278, 39.875665], [-83.243200, 39.875649], [-83.243122, 39.875634], [-83.243044, 39.875619], [-83.242966, 39.875605], [-83.242889, 39.875591], [-83.242815, 39.875578], [-83.242746, 39.875566], [-83.242682, 39.875554], [-83.242623, 39.875543], [-83.242567, 39.875533], [-83.242513, 39.875524], [-83.242458, 39.875515], [-83.242404, 39.875507], [-83.242351, 39.875499], [-83.242299, 39.875493], [-83.242246, 39.875487], [-83.242192, 39.875481], [-83.242135, 39.875476], [-83.242077, 39.875472], [-83.242018, 39.875468], [-83.241960, 39.875465], [-83.241905, 39.875461], [-83.241853, 39.875455], [-83.241803, 39.875448], [-83.241755, 39.875442], [-83.241708, 39.875436], [-83.241661, 39.875433], [-83.241616, 39.875432], [-83.241573, 39.875432], [-83.241530, 39.875434], [-83.241486, 39.875439], [-83.241440, 39.875447], [-83.241390, 39.875459], [-83.241339, 39.875474], [-83.241286, 39.875492], [-83.241231, 39.875512], [-83.241174, 39.875532], [-83.241115, 39.875554], [-83.241053, 39.875579], [-83.240990, 39.875605], [-83.240927, 39.875629], [-83.240864, 39.875651], [-83.240803, 39.875669], [-83.240742, 39.875686], [-83.240681, 39.875702], [-83.240619, 39.875715], [-83.240554, 39.875727], [-83.240481, 39.875737], [-83.240399, 39.875746], [-83.240318, 39.875752], [-83.240249, 39.875757], [-83.240200, 39.875761], [-83.240223, 39.875306], [-83.240287, 39.875293], [-83.240367, 39.875276], [-83.240455, 39.875257], [-83.240539, 39.875236], [-83.240611, 39.875216], [-83.240679, 39.875193], [-83.240745, 39.875170], [-83.240810, 39.875145], [-83.240875, 39.875120], [-83.240942, 39.875094], [-83.241008, 39.875068], [-83.241074, 39.875040], [-83.241141, 39.875012], [-83.241207, 39.874985], [-83.241274, 39.874958], [-83.241341, 39.874929], [-83.241408, 39.874901], [-83.241474, 39.874874], [-83.241540, 39.874848], [-83.241604, 39.874823], [-83.241666, 39.874801], [-83.241726, 39.874779], [-83.241787, 39.874759], [-83.241850, 39.874741], [-83.241916, 39.874726], [-83.241983, 39.874712], [-83.242051, 39.874699], [-83.242122, 39.874690], [-83.242197, 39.874684], [-83.242277, 39.874682], [-83.242363, 39.874684], [-83.242452, 39.874690], [-83.242544, 39.874699], [-83.242635, 39.874710], [-83.242724, 39.874724], [-83.242813, 39.874742], [-83.242903, 39.874763], [-83.242992, 39.874786], [-83.243079, 39.874808], [-83.243163, 39.874829], [-83.243243, 39.874850], [-83.243321, 39.874871], [-83.243399, 39.874892], [-83.243479, 39.874911], [-83.243565, 39.874929], [-83.243664, 39.874945], [-83.243767, 39.874961], [-83.243861, 39.874974], [-83.243937, 39.874984], [-83.243963, 39.875761]];
const SETBACK: Ring = [[-83.243897, 39.875716], [-83.243830, 39.875706], [-83.243731, 39.875693], [-83.243612, 39.875676], [-83.243488, 39.875657], [-83.243368, 39.875636], [-83.243257, 39.875613], [-83.243155, 39.875588], [-83.243059, 39.875564], [-83.242971, 39.875542], [-83.242888, 39.875522], [-83.242801, 39.875503], [-83.242715, 39.875484], [-83.242629, 39.875466], [-83.242543, 39.875449], [-83.242454, 39.875431], [-83.242353, 39.875409], [-83.242261, 39.875387], [-83.242184, 39.875370], [-83.242126, 39.875360], [-83.242095, 39.875357], [-83.242072, 39.875358], [-83.242044, 39.875362], [-83.242005, 39.875372], [-83.241950, 39.875388], [-83.241884, 39.875408], [-83.241832, 39.875425], [-83.241776, 39.875447], [-83.241712, 39.875474], [-83.241642, 39.875505], [-83.241568, 39.875537], [-83.241504, 39.875564], [-83.241436, 39.875595], [-83.241361, 39.875629], [-83.241280, 39.875664], [-83.241193, 39.875698], [-83.241118, 39.875724], [-83.241040, 39.875750], [-83.240956, 39.875774], [-83.240864, 39.875797], [-83.240761, 39.875816], [-83.240640, 39.875832], [-83.240516, 39.875844], [-83.240397, 39.875853], [-83.240299, 39.875859], [-83.240235, 39.875863], [-83.240197, 39.875317], [-83.240284, 39.875311], [-83.240388, 39.875304], [-83.240493, 39.875296], [-83.240581, 39.875286], [-83.240641, 39.875276], [-83.240695, 39.875264], [-83.240746, 39.875251], [-83.240798, 39.875234], [-83.240858, 39.875214], [-83.240917, 39.875193], [-83.240973, 39.875169], [-83.241037, 39.875141], [-83.241107, 39.875109], [-83.241184, 39.875074], [-83.241257, 39.875043], [-83.241326, 39.875014], [-83.241400, 39.874981], [-83.241482, 39.874948], [-83.241571, 39.874916], [-83.241652, 39.874890], [-83.241727, 39.874867], [-83.241816, 39.874843], [-83.241923, 39.874823], [-83.242045, 39.874811], [-83.242181, 39.874813], [-83.242308, 39.874830], [-83.242418, 39.874852], [-83.242516, 39.874875], [-83.242600, 39.874894], [-83.242681, 39.874911], [-83.242771, 39.874929], [-83.242861, 39.874948], [-83.242951, 39.874967], [-83.243043, 39.874987], [-83.243140, 39.875009], [-83.243237, 39.875033], [-83.243329, 39.875056], [-83.243416, 39.875078], [-83.243500, 39.875097], [-83.243584, 39.875113], [-83.243689, 39.875130], [-83.243802, 39.875147], [-83.243909, 39.875161], [-83.243997, 39.875174], [-83.243897, 39.875716]];
const CREEK: Ring = [[-83.243960, 39.875459], [-83.243891, 39.875449], [-83.243791, 39.875435], [-83.243676, 39.875419], [-83.243558, 39.875401], [-83.243450, 39.875382], [-83.243353, 39.875362], [-83.243259, 39.875339], [-83.243167, 39.875316], [-83.243075, 39.875293], [-83.242985, 39.875271], [-83.242895, 39.875251], [-83.242806, 39.875232], [-83.242718, 39.875214], [-83.242631, 39.875196], [-83.242542, 39.875178], [-83.242452, 39.875158], [-83.242361, 39.875137], [-83.242271, 39.875116], [-83.242184, 39.875102], [-83.242103, 39.875095], [-83.242029, 39.875098], [-83.241959, 39.875109], [-83.241892, 39.875125], [-83.241825, 39.875144], [-83.241755, 39.875166], [-83.241685, 39.875189], [-83.241615, 39.875217], [-83.241545, 39.875247], [-83.241474, 39.875277], [-83.241403, 39.875308], [-83.241332, 39.875338], [-83.241262, 39.875371], [-83.241191, 39.875403], [-83.241119, 39.875433], [-83.241048, 39.875461], [-83.240979, 39.875485], [-83.240912, 39.875507], [-83.240843, 39.875527], [-83.240771, 39.875545], [-83.240690, 39.875560], [-83.240593, 39.875573], [-83.240480, 39.875584], [-83.240368, 39.875592], [-83.240270, 39.875598], [-83.240201, 39.875603], [-83.240228, 39.875577], [-83.240313, 39.875572], [-83.240420, 39.875564], [-83.240533, 39.875555], [-83.240639, 39.875544], [-83.240724, 39.875530], [-83.240798, 39.875514], [-83.240867, 39.875495], [-83.240933, 39.875475], [-83.241000, 39.875452], [-83.241070, 39.875427], [-83.241140, 39.875398], [-83.241210, 39.875366], [-83.241281, 39.875334], [-83.241352, 39.875302], [-83.241423, 39.875272], [-83.241494, 39.875241], [-83.241565, 39.875211], [-83.241636, 39.875181], [-83.241708, 39.875155], [-83.241779, 39.875133], [-83.241848, 39.875112], [-83.241917, 39.875093], [-83.241988, 39.875079], [-83.242064, 39.875072], [-83.242146, 39.875073], [-83.242233, 39.875085], [-83.242324, 39.875103], [-83.242415, 39.875125], [-83.242506, 39.875146], [-83.242594, 39.875164], [-83.242683, 39.875182], [-83.242771, 39.875200], [-83.242859, 39.875219], [-83.242948, 39.875239], [-83.243039, 39.875259], [-83.243130, 39.875282], [-83.243222, 39.875305], [-83.243315, 39.875328], [-83.243410, 39.875349], [-83.243509, 39.875368], [-83.243623, 39.875387], [-83.243740, 39.875404], [-83.243849, 39.875419], [-83.243936, 39.875431], [-83.243960, 39.875459]];
const WETLAND: Ring = [[-83.242746, 39.876143], [-83.242732, 39.876156], [-83.242715, 39.876169], [-83.242696, 39.876183], [-83.242676, 39.876196], [-83.242654, 39.876208], [-83.242632, 39.876218], [-83.242611, 39.876227], [-83.242591, 39.876232], [-83.242571, 39.876233], [-83.242550, 39.876231], [-83.242530, 39.876226], [-83.242509, 39.876219], [-83.242489, 39.876213], [-83.242469, 39.876207], [-83.242450, 39.876202], [-83.242431, 39.876201], [-83.242414, 39.876204], [-83.242399, 39.876210], [-83.242384, 39.876217], [-83.242369, 39.876226], [-83.242355, 39.876233], [-83.242340, 39.876240], [-83.242324, 39.876243], [-83.242307, 39.876242], [-83.242289, 39.876237], [-83.242269, 39.876229], [-83.242248, 39.876218], [-83.242227, 39.876205], [-83.242206, 39.876191], [-83.242186, 39.876177], [-83.242168, 39.876162], [-83.242152, 39.876147], [-83.242138, 39.876132], [-83.242124, 39.876115], [-83.242110, 39.876098], [-83.242098, 39.876080], [-83.242089, 39.876062], [-83.242081, 39.876044], [-83.242077, 39.876027], [-83.242077, 39.876011], [-83.242081, 39.875995], [-83.242089, 39.875980], [-83.242100, 39.875964], [-83.242114, 39.875949], [-83.242130, 39.875935], [-83.242147, 39.875921], [-83.242165, 39.875909], [-83.242183, 39.875897], [-83.242203, 39.875886], [-83.242223, 39.875875], [-83.242246, 39.875865], [-83.242270, 39.875856], [-83.242294, 39.875848], [-83.242318, 39.875841], [-83.242342, 39.875837], [-83.242365, 39.875834], [-83.242388, 39.875834], [-83.242411, 39.875836], [-83.242435, 39.875841], [-83.242459, 39.875846], [-83.242482, 39.875853], [-83.242504, 39.875860], [-83.242526, 39.875868], [-83.242546, 39.875875], [-83.242565, 39.875882], [-83.242584, 39.875890], [-83.242601, 39.875898], [-83.242617, 39.875907], [-83.242633, 39.875917], [-83.242649, 39.875926], [-83.242664, 39.875936], [-83.242679, 39.875946], [-83.242695, 39.875957], [-83.242711, 39.875968], [-83.242728, 39.875980], [-83.242743, 39.875992], [-83.242757, 39.876004], [-83.242770, 39.876017], [-83.242779, 39.876029], [-83.242785, 39.876041], [-83.242788, 39.876054], [-83.242789, 39.876067], [-83.242786, 39.876080], [-83.242782, 39.876093], [-83.242775, 39.876106], [-83.242767, 39.876119], [-83.242757, 39.876131], [-83.242746, 39.876143]];
const RIGHT_OF_WAY: Ring = [[-83.242490, 39.877747], [-83.239158, 39.874147], [-83.239331, 39.874052], [-83.242663, 39.877652], [-83.242490, 39.877747]];
const ZONE_NC: Ring = [[-83.243289, 39.877728], [-83.239700, 39.873852], [-83.236092, 39.875819], [-83.239681, 39.879695], [-83.243289, 39.877728]];
const ZONE_R: Ring = [[-83.243289, 39.877728], [-83.239700, 39.873852], [-83.243308, 39.871884], [-83.246897, 39.875761], [-83.243289, 39.877728]];

/** The land block's region: public/parcels/EX-000250/meta.json `bbox`. */
const REGION = {
  west: -83.24378605870614,
  south: 39.87482511493332,
  east: -83.24038594129384,
  north: 39.877434474933295,
};

const source = (authority: string, title: string, url: string): Source => ({
  authority,
  title,
  url,
  retrievedAt: at("15:00:00"),
});

const FEMA = source(
  "FEMA",
  "National Flood Hazard Layer, Franklin County",
  "https://www.fema.gov/flood-maps/national-flood-hazard-layer",
);
const NWI = source(
  "U.S. Fish & Wildlife Service",
  "National Wetlands Inventory",
  "https://www.fws.gov/program/national-wetlands-inventory",
);
const SETBACKS = source(
  "Franklin Soil & Water Conservation District",
  "Riparian stream setbacks",
  "https://franklinswcd.org/",
);
const ZONING = source(
  "Franklin County Economic Development & Planning",
  "Zoning map and Zoning Resolution",
  "https://development.franklincountyohio.gov/",
);
const ENGINEER = source(
  "Franklin County Engineer",
  "County road right-of-way",
  "https://www.franklincountyengineer.org/",
);
const AUDITOR = source(
  "Franklin County Auditor",
  "Parcel record and tax map",
  "https://www.franklincountyauditor.com/",
);
const RECORDER = source(
  "Franklin County Recorder",
  "Recorded deeds and easements",
  "https://recorder.franklincountyohio.gov/",
);
const SOILS = source(
  "USDA NRCS",
  "Web Soil Survey: septic tank absorption fields",
  "https://websoilsurvey.nrcs.usda.gov/",
);
const PUBLIC_HEALTH = source(
  "Franklin County Public Health",
  "Household sewage treatment systems",
  "https://myfcph.org/",
);
const UTILITIES = source(
  "Franklin County Sanitary Engineering",
  "Water and sewer service areas",
  "https://development.franklincountyohio.gov/",
);

export const EXAMPLE_LAYERS: ParcelLayers = {
  parcelKey: EXAMPLE_KEY,
  bbox: REGION,
  generatedAt: at("15:00:00"),
  layers: [
    {
      id: "flood",
      status: "found",
      shapes: [{ rings: [FLOOD_AE], tone: "strong", label: "Zone AE" }],
      inView: ["Zone AE (1% annual chance)", "Zone X (minimal)"],
      onLot: [{ name: "Zone AE", share: 0.067 }],
      source: FEMA,
    },
    {
      id: "streamSetback",
      status: "found",
      shapes: [
        { rings: [SETBACK], tone: "strong", label: "Stream setback" },
        // The creek itself, drawn as water inside its setback.
        { rings: [CREEK], tone: "light" },
      ],
      inView: ["100 ft riparian setback"],
      onLot: [{ name: "100 ft riparian setback", share: 0.07 }],
      source: SETBACKS,
    },
    {
      id: "wetlands",
      status: "found",
      shapes: [{ rings: [WETLAND], tone: "strong", label: "Wetland" }],
      inView: ["Freshwater emergent wetland"],
      onLot: [{ name: "Freshwater emergent wetland", share: 0.082 }],
      source: NWI,
    },
    {
      id: "zoning",
      status: "found",
      shapes: [
        { rings: [ZONE_R], tone: "strong", label: "R" },
        { rings: [ZONE_NC], tone: "strong", label: "NC" },
      ],
      inView: ["R (Rural Residential)", "NC (Neighborhood Commercial)"],
      onLot: [
        { name: "R", share: 0.66 },
        { name: "NC", share: 0.34 },
      ],
      source: ZONING,
    },
    {
      id: "roadRightOfWay",
      status: "found",
      shapes: [{ rings: [RIGHT_OF_WAY], tone: "strong", label: "Hashing Rd" }],
      inView: ["Hashing Rd, 60 ft county right-of-way"],
      distanceM: 0,
      source: ENGINEER,
    },
  ],
};

// ---------- Wallets and receipts ----------
//
// Base58 strings derived from sha256/sha512 of "groundtruth-example:<label>",
// so they are stable and belong to no one. The pages show them as example
// receipts and never link them to Solana Explorer.

export const EXAMPLE_WALLETS = {
  buyer: "DUShLgXdBdkgwnACbk2sJ8oaXA2EZaK2qwsM6LmUvUsD",
  seller: "81XHAL6PRpqtTjrceM7pY9TcubWYW97xHXRsaHsfNyhZ",
  sellerTokenAccount: "4YvmismqJyaGxDcEzj4TEHQuVS8dMF4ZVrSoHgZigGBi",
  title: "9qgzD5meUXaS9f8dxxJKxrQ6mzGLkSRK4tafufzfdSwo",
  survey: "4uwnUiM9J224xL9zZWnUHjQweFEzpAzxeuYGvA4FvYY4",
  septic: "HnspUhZvsPrwS9frnoYPZsqioAoEYyAnRYMnAykM4m4T",
  escrow: "G4gWzT6dgGZqiPy46CK21BigmwGYVdw6JQ3BPEbHd6G",
} as const;

export const EXAMPLE_RECEIPTS = {
  dealCreated:
    "4YrUaJ1CKW5Kujzcr4wzG1sSUvKWiTRp7vPFdqPMSYsxbgn7BgYo12hCyZz6o24qy3rKEtXn5wX1CgpVJRAwYpuL",
  funded:
    "2dMtfYFRULLy87LhkicE9hnj8YyGuCPUCDdvFvMmAb1BVaNArRu1exRfEYaxAkhPCBUBogALJferNjhU27UWsUP7",
  title:
    "FEEBSk9gye8TGUquD16kiEMn7DaM5mGadGfirTLfPUGmAqwooTBhRpf58rXi488CMGNZRFU4hTEqvETgriGkQTD",
  survey:
    "39z314Siq7xuyHdhZw2hAAbhiaRgh8V9CPFZVh4AiAPYvzFu27S75H67qoTcLw3ifzPJSt4xeLYdS5QKUxnW9cVC",
  septic:
    "4FWVFvHEFNXABiRkh4VPhVTHsb69cVq2N3B7UK9j35AftpPXsAUPEYRhvEpiEHRapMggF2CC7twzXTNyQkpbap4r",
  released:
    "2bcNhQe9oqjBcGtaFxDc5oeZdkYmudDv15ZG7hQZWD6v1YEW8BMwYHRh4HGzRAjk2XP9VBftuop8wwUeXCr9rFo8",
  hold: "5Z8SfBtWoapJyT8kAWc6s7nrot3xXQ5BHErKHkkJUydBYUMGwAuZXNVTQSY1xtfx3QUG4KHom1H2NMfhjESDwY1Y",
  releaseRejected:
    "5MynVaFpZe3M993FoApMyFGoQ87bCR6PXp15ghKskw8SbhwxzGzNBpbE37GfSQXwsfJEWvCNC1gJ3FtxSavhPbTK",
} as const;

// ---------- Documents ----------
//
// Each document "is" the one line of text below: its sha256 is the SHA-256 of
// that text (exampleFixture.test.ts recomputes every one). No file exists.

export const EXAMPLE_DOCUMENT_TEXT = {
  titleCommitment:
    "GroundTruth example document. Title commitment for 250 Hashing Rd, Franklin County, Ohio (example parcel EX-000250). Not a real document.",
  surveyPlat:
    "GroundTruth example document. Boundary survey plat for 250 Hashing Rd, Franklin County, Ohio (example parcel EX-000250), 6.02 acres. Not a real document.",
  septicSoilEvaluation:
    "GroundTruth example document. Septic soil evaluation for 250 Hashing Rd, Franklin County, Ohio (example parcel EX-000250). Not a real document.",
  zoningLetter:
    "GroundTruth example document. Zoning letter for 250 Hashing Rd, Franklin County, Ohio (example parcel EX-000250): districts R and NC. Not a real document.",
} as const;

export const EXAMPLE_DOCUMENTS: DealDocument[] = [
  {
    id: "example-doc-title",
    dealId: EXAMPLE_KEY,
    type: "titleCommitment",
    filename: "title-commitment-250-hashing-rd.pdf",
    contentType: "application/pdf",
    sizeBytes: 284_113,
    sha256: "0b2549d04f93ecb3a71032d8861a85de7147348331142417fce3d2d79b71e87a",
    uploaderRole: "title",
    uploadedAt: at("15:04:52"),
  },
  {
    id: "example-doc-survey",
    dealId: EXAMPLE_KEY,
    type: "surveyPlat",
    filename: "survey-plat-EX-000250.pdf",
    contentType: "application/pdf",
    sizeBytes: 1_912_448,
    sha256: "18e6e97e1f84fb2821fa71ccfdcf0d1603497d95c5237efeb70fa0bff488daca",
    uploaderRole: "survey",
    uploadedAt: at("15:40:31"),
  },
  {
    id: "example-doc-septic",
    dealId: EXAMPLE_KEY,
    type: "septicSoilEvaluation",
    filename: "soil-evaluation-250-hashing-rd.jpg",
    contentType: "image/jpeg",
    sizeBytes: 2_481_920,
    sha256: "8098685e6a8319b4afb8f8aaea51d9b678d2a883b1ec56958357a5e12ff9914f",
    uploaderRole: "septic",
    uploadedAt: at("16:11:57"),
  },
  {
    id: "example-doc-zoning",
    dealId: EXAMPLE_KEY,
    type: "zoningLetter",
    filename: "zoning-letter-franklin-county.pdf",
    contentType: "application/pdf",
    sizeBytes: 96_340,
    sha256: "42651151989c643abb1f050d819664f222e6934dd036fb510cb2c5670960b67f",
    uploaderRole: "buyer",
    uploadedAt: at("16:29:40"),
  },
];

const cite = (index: number) => {
  const doc = EXAMPLE_DOCUMENTS[index]!;
  return {
    sha256: doc.sha256,
    document: {
      id: doc.id,
      type: doc.type,
      filename: doc.filename,
      uploaderRole: doc.uploaderRole,
    },
  };
};

// ---------- The deal ----------

/** Oldest first, as the API sends a timeline. */
export const EXAMPLE_TIMELINE: TimelineEvent[] = [
  {
    id: "example-1",
    at: at("14:02:10"),
    type: "dealCreated",
    actorRole: "buyer",
    buyerMessage:
      "The buyer opened an escrow for 25 test USDC on 250 Hashing Rd, naming the seller and the title, survey, and septic reviewers.",
    transactionSignature: EXAMPLE_RECEIPTS.dealCreated,
    confirmationStatus: "confirmed",
  },
  {
    id: "example-2",
    at: at("14:03:41"),
    type: "funded",
    actorRole: "buyer",
    buyerMessage:
      "The buyer funded the escrow with Solana Pay: scanned the QR code, approved 25 test USDC in their wallet, and the vault received it.",
    transactionSignature: EXAMPLE_RECEIPTS.funded,
    confirmationStatus: "confirmed",
  },
  {
    id: "example-3",
    at: at("14:20:05"),
    type: "evidenceReceived",
    actorRole: "owner callback",
    buyerMessage:
      "Owner callback: an ElevenLabs voice agent called the owner of record, who confirmed they are selling 250 Hashing Rd. Evidence for the title reviewer only; it approves nothing.",
    confirmationStatus: "offChainEvidence",
  },
  {
    id: "example-4",
    at: at("15:05:30"),
    type: "approvalSigned",
    actorRole: "title",
    buyerMessage:
      "The title reviewer uploaded the title commitment and signed their approval. The approval records the document's hash on-chain.",
    transactionSignature: EXAMPLE_RECEIPTS.title,
    confirmationStatus: "confirmed",
    citedDocument: cite(0),
  },
  {
    id: "example-5",
    at: at("15:41:12"),
    type: "approvalSigned",
    actorRole: "survey",
    buyerMessage:
      "The survey reviewer uploaded the survey plat and signed their approval: five corner pins found, no encroachments.",
    transactionSignature: EXAMPLE_RECEIPTS.survey,
    confirmationStatus: "confirmed",
    citedDocument: cite(1),
  },
  {
    id: "example-6",
    at: at("16:12:48"),
    type: "approvalSigned",
    actorRole: "septic",
    buyerMessage:
      "The septic reviewer uploaded the soil evaluation and signed their approval from their phone.",
    transactionSignature: EXAMPLE_RECEIPTS.septic,
    confirmationStatus: "confirmed",
    citedDocument: cite(2),
  },
  {
    id: "example-7",
    at: at("16:30:02"),
    type: "evidenceReceived",
    actorRole: "buyer",
    buyerMessage:
      "Zoning letter attached: Franklin County confirms the R and NC districts on the lot. Evidence only; it approves nothing.",
    confirmationStatus: "offChainEvidence",
  },
  {
    id: "example-8",
    at: at("16:34:19"),
    type: "released",
    actorRole: "buyer",
    buyerMessage:
      "Release sent. With three approvals and no hold, the program paid exactly 25 test USDC to the seller and closed the vault.",
    transactionSignature: EXAMPLE_RECEIPTS.released,
    confirmationStatus: "confirmed",
  },
];

export const EXAMPLE_DEAL: Deal = {
  id: EXAMPLE_KEY,
  parcelKey: EXAMPLE_KEY,
  buyerWallet: EXAMPLE_WALLETS.buyer,
  sellerWallet: EXAMPLE_WALLETS.seller,
  sellerTokenAccount: EXAMPLE_WALLETS.sellerTokenAccount,
  reviewers: [
    {
      wallet: EXAMPLE_WALLETS.title,
      role: "title",
      required: true,
      approvedAt: EXAMPLE_TIMELINE[3]!.at,
      approvalTransaction: EXAMPLE_RECEIPTS.title,
    },
    {
      wallet: EXAMPLE_WALLETS.survey,
      role: "survey",
      required: true,
      approvedAt: EXAMPLE_TIMELINE[4]!.at,
      approvalTransaction: EXAMPLE_RECEIPTS.survey,
    },
    {
      wallet: EXAMPLE_WALLETS.septic,
      role: "septic",
      required: true,
      approvedAt: EXAMPLE_TIMELINE[5]!.at,
      approvalTransaction: EXAMPLE_RECEIPTS.septic,
    },
  ],
  amountBaseUnits: "25000000",
  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  cluster: "devnet",
  state: "released",
  escrowAddress: EXAMPLE_WALLETS.escrow,
  timeline: EXAMPLE_TIMELINE,
};

/**
 * The deal as it stood after its first `count` timeline rows: reviewers have
 * signed only once their row is in, and the state follows the last row.
 * The walkthrough steps through these.
 */
export function exampleDealAfter(count: number): Deal {
  const timeline = EXAMPLE_TIMELINE.slice(0, Math.max(0, count));
  const types = new Set(timeline.map((event) => event.type));
  return {
    ...EXAMPLE_DEAL,
    state: types.has("released") ? "released" : types.has("funded") ? "funded" : "draft",
    reviewers: EXAMPLE_DEAL.reviewers.map((reviewer) =>
      timeline.some((event) => event.transactionSignature === reviewer.approvalTransaction)
        ? reviewer
        : { wallet: reviewer.wallet, role: reviewer.role, required: reviewer.required },
    ),
    timeline,
  };
}

// ---------- The bonus: a seller who isn't real ----------

export const EXAMPLE_HOLD: Hold = {
  placedByWallet: EXAMPLE_WALLETS.title,
  role: "title",
  reasonCode: "SELLER_IDENTITY_DISPUTED",
  buyerMessage:
    "The owner of record told the voice agent they are not selling this lot. The title reviewer is checking who the seller really is.",
  transactionSignature: EXAMPLE_RECEIPTS.hold,
  placedAt: at("14:31:09"),
};

/** The same deal if the call had gone the other way: funded, then held, then a release the program refused. */
export const EXAMPLE_HELD_DEAL: Deal = {
  ...EXAMPLE_DEAL,
  state: "held",
  reviewers: EXAMPLE_DEAL.reviewers.map(({ wallet, role, required }) => ({ wallet, role, required })),
  hold: EXAMPLE_HOLD,
  timeline: [
    ...EXAMPLE_TIMELINE.slice(0, 2),
    {
      id: "example-held-3",
      at: at("14:20:05"),
      type: "evidenceReceived",
      actorRole: "owner callback",
      buyerMessage:
        "Owner callback: the person reached as the owner of record said they are not selling this lot. Evidence for the title reviewer only; it approves nothing.",
      confirmationStatus: "offChainEvidence",
    },
    {
      id: "example-held-4",
      at: EXAMPLE_HOLD.placedAt,
      type: "holdPlaced",
      actorRole: "title",
      buyerMessage: "The title reviewer placed a hold: seller identity disputed.",
      transactionSignature: EXAMPLE_RECEIPTS.hold,
      confirmationStatus: "confirmed",
    },
    {
      id: "example-held-5",
      at: at("14:33:47"),
      type: "releaseRejected",
      actorRole: "seller",
      buyerMessage:
        "Someone tried to release the money anyway. The program rejected it with DealHeld (6019): buyer, vault, and seller balances did not change.",
      transactionSignature: EXAMPLE_RECEIPTS.releaseRejected,
      confirmationStatus: "confirmed",
    },
  ],
};

// ---------- The owner calls (ElevenLabs Agents) ----------

export interface ExampleCallLine {
  who: "agent" | "owner";
  text: string;
}

export interface ExampleCall {
  /** Who the agent dials. */
  callee: string;
  lines: ExampleCallLine[];
  /** The analysis outcome, as the deal records it. */
  outcome: string;
  /** "confirmed" when the owner confirms the sale. */
  tone: "confirmed" | "denied";
  duration: string;
}

const OPENING: ExampleCallLine[] = [
  {
    who: "agent",
    text: "Hi, I'm an automated assistant calling for GroundTruth about 250 Hashing Rd. Am I speaking with the owner of record?",
  },
  { who: "owner", text: "Yes, that's me." },
  { who: "agent", text: "Thanks. Are you selling this lot right now?" },
];

export const EXAMPLE_CALL: ExampleCall = {
  callee: "Owner of record",
  lines: [
    ...OPENING,
    { who: "owner", text: "Yes, I am. I signed the purchase agreement last week." },
  ],
  outcome: "Owner confirms the sale",
  tone: "confirmed",
  duration: "0:41",
};

export const EXAMPLE_CALL_DENIED: ExampleCall = {
  callee: "Owner of record",
  lines: [
    ...OPENING,
    { who: "owner", text: "No. I'm not selling. I've never listed that lot." },
  ],
  outcome: "Owner says they are not selling",
  tone: "denied",
  duration: "0:37",
};

// ---------- The report ----------

const check = (value: Check): Check => value;

export const EXAMPLE_REPORT: ParcelReport = {
  parcelKey: EXAMPLE_KEY,
  generatedAt: at("15:00:00"),
  coverage: "deep",
  biggestOpenQuestion: "flood",
  checks: [
    check({
      kind: "zoning",
      status: "evidenceFound",
      finding:
        "Two districts cross the lot: Rural Residential (R) on about 66% of it and Neighborhood Commercial (NC) on the road-side 34%. A single-family home is a permitted use in R; NC allows small shops and offices along Hashing Rd.",
      limitation:
        "A zoning map says what a district allows, not that a permit will be issued. Setbacks and lot coverage are set when the permit is reviewed.",
      sources: [ZONING, AUDITOR],
      responsibleParty: {
        role: "County zoning office",
        organization: "Franklin County Economic Development & Planning",
        publicContactUrl: ZONING.url,
      },
      nextAction:
        "Site the house in the R district. A zoning letter naming both districts is attached to the deal.",
    }),
    check({
      kind: "flood",
      status: "needsReview",
      finding:
        "FEMA's flood map puts the south corner of the lot, about 0.4 acre (7%), in Zone AE: the 1% annual chance floodplain along the creek. The rest of the lot is Zone X, minimal flood hazard.",
      limitation:
        "A flood map is not an elevation survey. Whether a building pad clears the base flood elevation takes an elevation certificate.",
      sources: [FEMA],
      responsibleParty: {
        role: "County floodplain administrator",
        organization: "Franklin County Economic Development & Planning",
        publicContactUrl: FEMA.url,
      },
      nextAction:
        "Get a floodplain development permit before any fill, driveway, or structure in Zone AE, and keep the house on the higher north half.",
    }),
    check({
      kind: "environmental",
      status: "needsReview",
      finding:
        "NWI maps a freshwater emergent wetland, about 0.5 acre, in a low swale on the west half of the lot. Franklin County's 100 ft riparian setback along the creek covers about 7% of the lot at its south edge.",
      limitation:
        "NWI outlines are approximate; only a wetland delineation sets the line. A setback limits grading and building, not ownership.",
      sources: [NWI, SETBACKS],
      responsibleParty: {
        role: "Wetland delineator, then Franklin Soil & Water",
        publicContactUrl: SETBACKS.url,
      },
      nextAction:
        "Keep the build area out of the swale and the setback. Order a delineation only if work has to go near them.",
    }),
    check({
      kind: "access",
      status: "evidenceFound",
      finding:
        "The lot fronts Hashing Rd for about 600 ft. The road's 60 ft county right-of-way touches the whole front line, so the lot has direct public road access.",
      limitation:
        "Frontage on a public road is access; a driveway still needs a county permit for its location and culvert.",
      sources: [ENGINEER, AUDITOR],
      responsibleParty: {
        role: "County engineer",
        organization: "Franklin County Engineer",
        publicContactUrl: ENGINEER.url,
      },
      nextAction:
        "Apply for a driveway permit on the north half, away from the creek crossing.",
    }),
    check({
      kind: "utilities",
      status: "evidenceFound",
      finding:
        "Water: a public main runs along Hashing Rd in front of the lot. Electric: AEP Ohio lines on the road. Sewer: no public sewer within 1,000 ft, so the house needs an on-site septic system.",
      limitation:
        "Service maps show where lines run, not tap fees or capacity. The septic system is covered by the Septic check.",
      sources: [UTILITIES],
      responsibleParty: {
        role: "Water district and AEP Ohio",
        publicContactUrl: UTILITIES.url,
      },
      nextAction:
        "Ask the water district for a tap quote, and plan the septic system shown in the soil evaluation.",
    }),
    check({
      kind: "easements",
      status: "evidenceFound",
      finding:
        "The title commitment lists one recorded easement: a 20 ft AEP Ohio electric easement along the road frontage. No other easement or encroachment is recorded.",
      limitation:
        "An unrecorded easement, like a neighbor's farm lane, can still exist; the survey looked for one and found none.",
      sources: [RECORDER],
      responsibleParty: {
        role: "Title reviewer",
        publicContactUrl: RECORDER.url,
      },
      nextAction: "Keep the house and driveway apron out of the 20 ft electric easement.",
    }),
    check({
      kind: "sellerAuthority",
      status: "signedOff",
      finding:
        "The recorded 2014 deed names the seller as owner, the title commitment shows no other owner or lien, and the owner of record confirmed the sale on a recorded call. The title reviewer signed off.",
      limitation:
        "The title reviewer's sign-off covers who may sell. It is not title insurance.",
      sources: [RECORDER, AUDITOR],
      responsibleParty: { role: "Title reviewer" },
      nextAction: "Nothing further. The title reviewer signed.",
      reviewerWallet: EXAMPLE_WALLETS.title,
      transactionSignature: EXAMPLE_RECEIPTS.title,
    }),
    check({
      kind: "survey",
      status: "signedOff",
      finding:
        "A boundary survey found all five corner pins, measured 6.02 acres, and found no encroachments. The survey reviewer signed off on the plat.",
      limitation: "The survey fixes the boundary; it does not decide where a house may go.",
      sources: [AUDITOR],
      responsibleParty: { role: "Survey reviewer" },
      nextAction: "Nothing further. The survey reviewer signed.",
      reviewerWallet: EXAMPLE_WALLETS.survey,
      transactionSignature: EXAMPLE_RECEIPTS.survey,
    }),
    check({
      kind: "septic",
      status: "signedOff",
      finding:
        "USDA soils rate the silt loam here 'Very limited' for a standard leach field, so the soil evaluation sizes a mound system on the higher north half. The septic reviewer approved that site.",
      limitation:
        "The approval is for the site and system type. The county issues the installation permit.",
      sources: [SOILS, PUBLIC_HEALTH],
      responsibleParty: {
        role: "Septic reviewer",
        organization: "Franklin County Public Health",
        publicContactUrl: PUBLIC_HEALTH.url,
      },
      nextAction: "Nothing further for the closing. Apply for the installation permit before building.",
      reviewerWallet: EXAMPLE_WALLETS.septic,
      transactionSignature: EXAMPLE_RECEIPTS.septic,
    }),
  ],
};

/** The example's bottom line, in place of the one worked out for real reports. */
export const EXAMPLE_BOTTOM_LINE = {
  opening: "Buildable with conditions.",
  ask: "Check first: flood zone permit.",
} as const;
