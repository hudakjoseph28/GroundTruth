/** Test USDC base units (6 decimals) as a plain number, e.g. "25000000" -> "25". */
export function formatUsdc(baseUnits: string): string {
  const value = BigInt(baseUnits);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}
