export const HOUSE_EVENT = "foyer-house";

export function notifyHouseChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HOUSE_EVENT));
}
