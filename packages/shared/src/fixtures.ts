import type { Deal, Parcel } from "./contract.js";

// TODO(Gagan): Replace this staged ring with a manually verified OGRIP boundary. These coordinates are a Franklin County stand-in, not a retrieved parcel.
export const stagedParcel = {
  key: "ohio:39049:STAGED-DEMO",
  sourceParcelId: "STAGED-DEMO",
  county: "Franklin",
  countyFips: "39049",
  centroid: { latitude: 39.961, longitude: -83.0 },
  geometry: {
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [-83.002, 39.96],
          [-82.998, 39.96],
          [-82.998, 39.962],
          [-83.002, 39.962],
          [-83.002, 39.96],
        ],
      ],
    },
    authority: "Ohio OGRIP",
    sourceUrl: "https://ohioparcels-geohio.hub.arcgis.com/",
    retrievedAt: "2026-11-12T00:00:00.000Z",
  },
} satisfies Parcel;

// TODO(Kadhir): Record escrowAddress and transaction signatures after the staged devnet accounts exist. Release stays any fee payer and refund stays the buyer, per Escrow v1.
export const stagedDeal = {
  id: "staged-devnet-deal",
  parcelKey: stagedParcel.key,
  buyerWallet: "HcLJ8kbrJ3Jxk7oEf84ZGpR8czUr4U2x3jVJosXPgykM",
  sellerWallet: "27hSFUGN9q65qXAvevvrUvvAunxiBLCFTG3SmdBWQJ6f",
  sellerTokenAccount: "3rim2iuiaKyoaBcsSyENyn5osJn2Hy93R5c8RL8GY7yC",
  reviewers: [
    {
      wallet: "66EpT1ZYPxzYJAvhkbb8dzphLmdK6grtvv3LxRE8hLeN",
      role: "title",
      required: true,
    },
    {
      wallet: "A4j9LzytgynD8kEMZty7tzP4jndrRDCkBCpAHDiR5xwv",
      role: "survey",
      required: true,
    },
    {
      wallet: "HopdTqQ2QWywRpMmPHmdeddowJKdAmZRQLkoNrefaAGx",
      role: "septic",
      required: true,
    },
  ],
  amountBaseUnits: "25000000",
  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  cluster: "devnet",
  state: "draft",
  timeline: [
    {
      id: "staged-devnet-deal-created",
      at: "2026-11-12T00:00:00.000Z",
      type: "dealCreated",
      actorRole: "buyer",
      buyerMessage: "Staged devnet deal created. No funds have moved.",
      confirmationStatus: "offChainEvidence",
    },
  ],
} satisfies Deal;
