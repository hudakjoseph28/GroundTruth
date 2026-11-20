import { PublicKey } from "@solana/web3.js";
import {
  AttestationDecodeError,
  SAS_PROGRAM_ID,
  SAS_SEEDS,
  STAGED_REVIEWER_CREDENTIAL as CRED,
  decodeReviewerCredentialData,
  decodeSasAttestation,
  type ReviewerRole,
} from "@groundtruth/shared";
import { DEVNET_RPC } from "../review/escrowTx";
import { decodeBase64, encodeBase58 } from "../verify/idlDecode";

// Reads each reviewer's staged credential straight from the Solana
// Attestation Service on devnet, in the browser: one getMultipleAccounts call
// to a public RPC, no GroundTruth server, no key, no wallet. The attestation
// address is derived from the reviewer's wallet, so nothing the API says is
// trusted. The page loads this module lazily, so web3.js (used only to
// derive the PDAs) stays out of the first load.

const TIMEOUT_MS = 10_000;

export interface CredentialSubject {
  wallet: string;
  role: ReviewerRole;
}

export type CredentialRead =
  /** A SAS attestation from the staged issuer names this wallet in this role. */
  | {
      status: "verified";
      attestation: string;
      role: ReviewerRole;
      issuer: string;
      staged: boolean;
      /** Unix seconds; 0 means no expiry. */
      expiry: number;
    }
  /** No account exists at the derived attestation address. */
  | { status: "none"; attestation: string }
  /** An account exists there but it does not say what the badge would claim. */
  | { status: "invalid"; attestation: string; reason: string }
  /** The RPC could not be reached or refused the read. */
  | { status: "error"; message: string };

export const credentialKey = (s: CredentialSubject) => `${s.role}:${s.wallet}`;

const sasProgram = () => new PublicKey(SAS_PROGRAM_ID);

/** The attestation PDA for a wallet under the staged issuer and schema (nonce = the wallet). */
export function attestationAddress(wallet: string): string {
  const [address] = PublicKey.findProgramAddressSync(
    [
      new TextEncoder().encode(SAS_SEEDS.attestation),
      new PublicKey(CRED.credential).toBytes(),
      new PublicKey(CRED.schema).toBytes(),
      new PublicKey(wallet).toBytes(),
    ],
    sasProgram(),
  );
  return address.toBase58();
}

/** Checks one account read at `attestation` for `subject`. Pure; exported for tests. */
export function checkAttestation(
  subject: CredentialSubject,
  attestation: string,
  account: { owner: string; data: Uint8Array } | null,
  nowSeconds: number,
): CredentialRead {
  if (!account) return { status: "none", attestation };
  const invalid = (reason: string): CredentialRead => ({
    status: "invalid",
    attestation,
    reason,
  });
  if (account.owner !== SAS_PROGRAM_ID) {
    return invalid(
      `Owned by ${account.owner}, not the Solana Attestation Service.`,
    );
  }
  try {
    const decoded = decodeSasAttestation(account.data);
    if (encodeBase58(decoded.nonce) !== subject.wallet)
      return invalid("Issued to a different wallet.");
    if (encodeBase58(decoded.credential) !== CRED.credential)
      return invalid("Not from the staged issuer.");
    if (encodeBase58(decoded.schema) !== CRED.schema)
      return invalid("Not the staged reviewer schema.");
    if (encodeBase58(decoded.signer) !== CRED.authority)
      return invalid("Signed by an unknown signer.");
    const expiry = Number(decoded.expiry);
    if (expiry !== 0 && expiry < nowSeconds) return invalid("Expired.");
    const fields = decodeReviewerCredentialData(decoded.data);
    if (fields.role !== subject.role)
      return invalid(`Names the ${fields.role} role, not ${subject.role}.`);
    return {
      status: "verified",
      attestation,
      role: fields.role,
      issuer: fields.issuer,
      staged: fields.staged,
      expiry,
    };
  } catch (error) {
    if (error instanceof AttestationDecodeError) return invalid(error.message);
    throw error;
  }
}

/** Reads every subject's attestation in one RPC call. Never throws. */
export async function readReviewerCredentials(
  subjects: readonly CredentialSubject[],
  options: {
    rpc?: string;
    fetch?: typeof fetch;
    now?: () => Date;
    signal?: AbortSignal;
  } = {},
): Promise<Map<string, CredentialRead>> {
  const out = new Map<string, CredentialRead>();
  if (subjects.length === 0) return out;
  const fail = (message: string) => {
    for (const s of subjects)
      out.set(credentialKey(s), { status: "error", message });
    return out;
  };
  let addresses: string[];
  try {
    addresses = subjects.map((s) => attestationAddress(s.wallet));
  } catch {
    return fail("A reviewer wallet is not a valid Solana address.");
  }

  const call = options.fetch ?? fetch;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  options.signal?.addEventListener("abort", () => abort.abort());
  let body: {
    error?: { message?: string };
    result?: { value?: ({ owner?: string; data?: [string, string] } | null)[] };
  };
  try {
    const response = await call(options.rpc ?? DEVNET_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getMultipleAccounts",
        params: [addresses, { encoding: "base64", commitment: "confirmed" }],
      }),
      signal: abort.signal,
    });
    if (!response.ok)
      return fail(`The devnet RPC answered HTTP ${response.status}.`);
    body = (await response.json()) as typeof body;
  } catch {
    return fail("The devnet RPC could not be reached.");
  } finally {
    clearTimeout(timer);
  }
  if (body.error)
    return fail(
      `The devnet RPC refused the read: ${body.error.message ?? "unknown error"}.`,
    );
  const values = body.result?.value;
  if (!Array.isArray(values) || values.length !== subjects.length) {
    return fail("The devnet RPC answered with an unreadable result.");
  }
  const nowSeconds = Math.floor(
    (options.now?.() ?? new Date()).getTime() / 1000,
  );
  subjects.forEach((subject, i) => {
    const value = values[i];
    const attestation = addresses[i]!;
    let account: { owner: string; data: Uint8Array } | null = null;
    if (value) {
      const [encoded, encoding] = value.data ?? [];
      if (
        typeof value.owner !== "string" ||
        typeof encoded !== "string" ||
        encoding !== "base64"
      ) {
        out.set(credentialKey(subject), {
          status: "invalid",
          attestation,
          reason: "The RPC returned an unreadable account.",
        });
        return;
      }
      account = { owner: value.owner, data: decodeBase64(encoded) };
    }
    out.set(
      credentialKey(subject),
      checkAttestation(subject, attestation, account, nowSeconds),
    );
  });
  return out;
}
