/** Native GEN has 18 decimals (same as quest-platform / genlayer-js). */
export const GEN_DECIMALS = 18;

export function parseGen(input: string): bigint {
  const raw = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) throw new Error("GEN amount is required");
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error("GEN amount must be a decimal");
  const [whole, frac = ""] = raw.split(".");
  if (frac.length > GEN_DECIMALS) throw new Error("GEN amount has too many decimals");
  const wei = BigInt(whole) * BigInt(10) ** BigInt(GEN_DECIMALS) + BigInt(frac.padEnd(GEN_DECIMALS, "0"));
  if (wei <= BigInt(0)) throw new Error("GEN amount must be greater than zero");
  return wei;
}

/**
 * Display only: cut a GEN string to `decimals` places without rounding up,
 * keeping enough digits that dust never shows as a flat zero.
 */
export function shortGen(value: string, decimals = 4): string {
  const raw = value.trim();
  const dot = raw.indexOf(".");
  if (dot < 0) return raw;
  const whole = raw.slice(0, dot);
  const frac = raw.slice(dot + 1);
  let keep = decimals;
  if (whole === "0") {
    const firstDigit = frac.search(/[1-9]/);
    if (firstDigit >= 0) keep = Math.max(decimals, firstDigit + 2);
  }
  const cut = frac.slice(0, keep).replace(/0+$/, "");
  return cut ? `${whole}.${cut}` : whole;
}

export function formatGen(wei: bigint): string {
  if (wei < BigInt(0)) return "0";
  const base = BigInt(10) ** BigInt(GEN_DECIMALS);
  const whole = wei / base;
  let frac = (wei % base).toString().padStart(GEN_DECIMALS, "0");
  frac = frac.replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

