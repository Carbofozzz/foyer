/** Add calendar months; clamp to last day when the target day does not exist (Stripe-style). */
export function addMonthsClamp(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const day = from.getUTCDate();
  const hours = from.getUTCHours();
  const minutes = from.getUTCMinutes();
  const seconds = from.getUTCSeconds();
  const ms = from.getUTCMilliseconds();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return new Date(Date.UTC(year, month, clamped, hours, minutes, seconds, ms));
}

export const SUB_GRACE_MS = 5 * 24 * 60 * 60 * 1000;
