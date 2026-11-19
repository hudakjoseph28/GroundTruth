import {
  DOCUMENT_AUTH_HEADERS,
  documentAuthMessage,
  type DocumentAuthRequest,
} from "@groundtruth/shared";

/** The wallet adapter's `signMessage`. */
export type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

/**
 * Has the connected wallet sign one document request and returns the
 * headers that carry it. The API rebuilds the same message and checks the
 * signature; GroundTruth never holds a key.
 */
export async function signDocumentRequest(input: {
  dealId: string;
  wallet: string;
  request: DocumentAuthRequest;
  signMessage: SignMessage;
}): Promise<Record<string, string>> {
  const issuedAt = new Date().toISOString();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const message = documentAuthMessage({
    dealId: input.dealId,
    wallet: input.wallet,
    issuedAt,
    nonce,
    request: input.request,
  });
  const signature = await input.signMessage(new TextEncoder().encode(message));
  return {
    [DOCUMENT_AUTH_HEADERS.wallet]: input.wallet,
    [DOCUMENT_AUTH_HEADERS.issuedAt]: issuedAt,
    [DOCUMENT_AUTH_HEADERS.nonce]: nonce,
    [DOCUMENT_AUTH_HEADERS.signature]: btoa(String.fromCharCode(...signature)),
  };
}

/** True when the wallet refused or the person declined. */
export function declined(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /reject|declin|denied|cancel/i.test(text);
}
