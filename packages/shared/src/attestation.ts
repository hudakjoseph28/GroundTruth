// Staged reviewer credentials on the Solana Attestation Service (SAS), devnet.
//
// The GroundTruth team issues one attestation per staged reviewer wallet
// (title, survey, septic) under its own staged issuer. It says only "this test
// wallet is GroundTruth's staged <role> reviewer". It is not a license, a
// background check, or any real professional credential, and the escrow
// program does not read it: a reviewer's authority on a deal still comes from
// the deal account's bound reviewer list.
//
// Account and instruction layouts follow SAS (program
// 22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG, the same ID on devnet and
// mainnet): one discriminator byte, then borsh-style fields with u32
// little-endian length prefixes. No runtime dependencies; callers derive PDAs
// and base58 with their own Solana library.
import type { ReviewerRole } from "./contract.js";

export const SAS_PROGRAM_ID = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";

/** PDA seeds: credential = [credential, authority, name]; schema = [schema, credential, name, [version]]; attestation = [attestation, credential, schema, nonce]. */
export const SAS_SEEDS = {
  credential: "credential",
  schema: "schema",
  attestation: "attestation",
} as const;

/**
 * First byte of each SAS account (AttestationAccountDiscriminators in the
 * program; sas-lib's account enum is alphabetical and does not match).
 */
export const SAS_ACCOUNT_DISCRIMINATOR = {
  credential: 0,
  schema: 1,
  attestation: 2,
} as const;

/** First byte of each SAS instruction this repo sends. */
export const SAS_INSTRUCTION_DISCRIMINATOR = {
  createCredential: 0,
  createSchema: 1,
  createAttestation: 6,
} as const;

/** SAS schema field types used here (SchemaDataTypes). */
export const SAS_FIELD_TYPE = { bool: 10, string: 12 } as const;

/** SAS derives PDAs from the raw name, so a name is at most one 32-byte seed. */
export const SAS_MAX_NAME_BYTES = 32;

/**
 * The staged issuer, schema, and field layout, as created on devnet by
 * `pnpm --filter @groundtruth/escrow sas:credentials issue`. Addresses are
 * the PDAs SAS derives; packages/shared/test/attestation.test.ts re-derives
 * them.
 */
export const STAGED_REVIEWER_CREDENTIAL = {
  cluster: "devnet",
  programId: SAS_PROGRAM_ID,
  /** Staged issuer keypair (escrow/.demo-wallets/issuer.json, gitignored). */
  authority: "E9jmb9CE68eWn7J2LhKv1ubEK7QYWMTMAACV1NosYBRk",
  credentialName: "GroundTruth staged issuer",
  credential: "BVrSkgLXY5fJ67anEkj2F2zhSPFr2BxQRnAw8N7taUBB",
  /**
   * The requested title, "GroundTruth staged reviewer credential", is 38
   * bytes; SAS seeds the schema PDA with the name and refuses seeds over 32
   * bytes, so the on-chain name is shorter and the description carries the
   * full title.
   */
  schemaName: "GroundTruth staged reviewer",
  schemaDescription:
    "GroundTruth staged reviewer credential. STAGED DEMO on Solana devnet: issued by the GroundTruth team to its own test reviewer wallets for a hackathon demo. Not a license, background check, or real professional credential.",
  schemaVersion: 1,
  schema: "7tQHRjjiPvDU6gaYkCz6EABSygRUVxBt3GhKGXVUGGuS",
  fieldNames: ["role", "issuer", "staged"],
  layout: [SAS_FIELD_TYPE.string, SAS_FIELD_TYPE.string, SAS_FIELD_TYPE.bool],
  /** Written into every attestation's `issuer` field. */
  issuerLabel:
    "GroundTruth staged demo issuer (devnet test credential, not a license)",
  /** 0: the attestation does not expire. */
  expiry: 0,
  /**
   * One attestation per staged reviewer wallet, nonce = the wallet, so its
   * address is derivable from the wallet alone.
   */
  attestations: [
    {
      role: "title",
      wallet: "ExxnTPx24fjXRiAPcnrWqKCfEQDhDmxCDZ57VQ7RkBRW",
      address: "C51Ds1fUCPZdCenXz2KS8tWZSqAunR6xXQacCKAnt2xJ",
    },
    {
      role: "survey",
      wallet: "CT6Nstaijac7yAVuDNVWQ12JFMYGfggE4VPBK4sYohDa",
      address: "BpVTHemJpJw6rzZg2S9WcAjhEQdE58fWtNYNQ24pawkR",
    },
    {
      role: "septic",
      wallet: "Ab7KLjree8ZgUrgXvtpb84oHKvzakC6VpRcPqnXoYz3F",
      address: "3L2x6J3r8ih56fnjkss1Ka2P7fk59EcL3Z2SGLkpQnyJ",
    },
  ],
} as const;

/** What one staged reviewer attestation holds. */
export interface ReviewerCredentialData {
  role: ReviewerRole;
  issuer: string;
  staged: boolean;
}

/** A decoded SAS Attestation account. Addresses are 32 raw bytes. */
export interface SasAttestation {
  nonce: Uint8Array;
  credential: Uint8Array;
  schema: Uint8Array;
  data: Uint8Array;
  signer: Uint8Array;
  /** Unix seconds; 0 means it never expires. */
  expiry: bigint;
  tokenAccount: Uint8Array;
}

const REVIEWER_ROLES: readonly ReviewerRole[] = ["title", "survey", "septic"];

export class AttestationDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttestationDecodeError";
  }
}

class Reader {
  private offset = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private need(n: number) {
    if (this.offset + n > this.bytes.length) {
      throw new AttestationDecodeError(
        `Account data ends at byte ${this.bytes.length}; needed ${this.offset + n}.`,
      );
    }
  }
  u8(): number {
    this.need(1);
    return this.bytes[this.offset++]!;
  }
  u32(): number {
    this.need(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }
  i64(): bigint {
    this.need(8);
    const value = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return value;
  }
  take(n: number): Uint8Array {
    this.need(n);
    const out = this.bytes.slice(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }
  sized(): Uint8Array {
    return this.take(this.u32());
  }
  get remaining(): number {
    return this.bytes.length - this.offset;
  }
}

/** Decodes a SAS Attestation account's bytes. Throws AttestationDecodeError. */
export function decodeSasAttestation(bytes: Uint8Array): SasAttestation {
  const r = new Reader(bytes);
  const discriminator = r.u8();
  if (discriminator !== SAS_ACCOUNT_DISCRIMINATOR.attestation) {
    throw new AttestationDecodeError(
      `Not a SAS attestation (discriminator ${discriminator}).`,
    );
  }
  return {
    nonce: r.take(32),
    credential: r.take(32),
    schema: r.take(32),
    data: r.sized(),
    signer: r.take(32),
    expiry: r.i64(),
    tokenAccount: r.take(32),
  };
}

const utf8 = new TextEncoder();

function pushU32(out: number[], value: number) {
  out.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function pushString(out: number[], value: string) {
  const bytes = utf8.encode(value);
  pushU32(out, bytes.length);
  out.push(...bytes);
}

/** The attestation `data` bytes for the staged layout: role, issuer, staged. */
export function encodeReviewerCredentialData(
  value: ReviewerCredentialData,
): Uint8Array {
  const out: number[] = [];
  pushString(out, value.role);
  pushString(out, value.issuer);
  out.push(value.staged ? 1 : 0);
  return Uint8Array.from(out);
}

/** Decodes attestation `data` written with the staged layout. Throws AttestationDecodeError. */
export function decodeReviewerCredentialData(
  bytes: Uint8Array,
): ReviewerCredentialData {
  const r = new Reader(bytes);
  const text = new TextDecoder("utf-8", { fatal: true });
  const role = text.decode(r.sized());
  const issuer = text.decode(r.sized());
  const flag = r.u8();
  if (r.remaining !== 0) {
    throw new AttestationDecodeError(
      `${r.remaining} unexpected trailing bytes.`,
    );
  }
  if (!(REVIEWER_ROLES as readonly string[]).includes(role)) {
    throw new AttestationDecodeError(`Unknown reviewer role "${role}".`);
  }
  if (flag > 1) throw new AttestationDecodeError(`Bad bool byte ${flag}.`);
  return { role: role as ReviewerRole, issuer, staged: flag === 1 };
}

/** CreateCredential instruction data: name, then the authorized signers (raw 32-byte keys). */
export function encodeCreateCredentialData(
  name: string,
  signers: readonly Uint8Array[],
): Uint8Array {
  const out: number[] = [SAS_INSTRUCTION_DISCRIMINATOR.createCredential];
  pushString(out, name);
  pushU32(out, signers.length);
  for (const signer of signers) out.push(...signer);
  return Uint8Array.from(out);
}

/** CreateSchema instruction data: name, description, layout bytes, field names. */
export function encodeCreateSchemaData(schema: {
  name: string;
  description: string;
  layout: readonly number[];
  fieldNames: readonly string[];
}): Uint8Array {
  const out: number[] = [SAS_INSTRUCTION_DISCRIMINATOR.createSchema];
  pushString(out, schema.name);
  pushString(out, schema.description);
  pushU32(out, schema.layout.length);
  out.push(...schema.layout);
  pushU32(out, schema.fieldNames.length);
  for (const field of schema.fieldNames) pushString(out, field);
  return Uint8Array.from(out);
}

/** CreateAttestation instruction data: nonce (raw key), data, expiry (i64 LE). */
export function encodeCreateAttestationData(
  nonce: Uint8Array,
  data: Uint8Array,
  expiry: number,
): Uint8Array {
  const out: number[] = [SAS_INSTRUCTION_DISCRIMINATOR.createAttestation];
  out.push(...nonce);
  pushU32(out, data.length);
  out.push(...data);
  const tail = new Uint8Array(8);
  new DataView(tail.buffer).setBigInt64(0, BigInt(expiry), true);
  out.push(...tail);
  return Uint8Array.from(out);
}

/**
 * Deal IDs whose pages show reviewer credentials: the rehearsal deals only.
 * The live stage deal and the held and released proof deals are left as
 * they are.
 */
export const CREDENTIAL_DEAL_IDS: readonly string[] = [
  "staged-devnet-deal-rehearsal",
  "staged-devnet-deal-rehearsal-v2",
  "staged-devnet-deal-rehearsal-v3",
  "staged-devnet-deal-pay-rehearsal",
];

export function showsReviewerCredentials(dealId: string): boolean {
  return CREDENTIAL_DEAL_IDS.includes(dealId);
}
