/**
 * Phone numbers for staged-demo deal texts. Stored as E.164; anything the
 * API returns or logs uses the masked form.
 */

/** A 10-digit number is read as US/Canada (+1); otherwise a leading + is required. */
export function normalizePhoneNumber(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  const e164 = /^\d{10}$/.test(compact)
    ? `+1${compact}`
    : /^1\d{10}$/.test(compact)
      ? `+${compact}`
      : compact;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** "+16145550123" -> "+1 ••• ••• 0123". Only the last four digits survive. */
export function maskPhoneNumber(e164: string): string {
  const country = e164.startsWith("+1") ? "+1" : "+";
  return `${country} ••• ••• ${e164.slice(-4)}`;
}
