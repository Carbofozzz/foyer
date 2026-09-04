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

export function formatGen(wei: bigint): string {
  if (wei < BigInt(0)) return "0";
  const base = BigInt(10) ** BigInt(GEN_DECIMALS);
  const whole = wei / base;
  let frac = (wei % base).toString().padStart(GEN_DECIMALS, "0");
  frac = frac.replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

