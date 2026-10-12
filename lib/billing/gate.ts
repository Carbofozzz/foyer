/**
 * When off, insist/submit skip credit checks.
 * Explicit FOYER_BILLING_GATE=on|off wins; otherwise production defaults on, local/dev off.
 */
export function billingGateEnabled(): boolean {
  const raw = process.env.FOYER_BILLING_GATE?.trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return false;
  if (raw === "on" || raw === "1" || raw === "true") return true;
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}
