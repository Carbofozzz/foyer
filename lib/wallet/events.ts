export const AUTH_EVENT = "foyer-auth";
export const HOUSE_EVENT = "foyer-house";

export function notifyAuthChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVENT));
}

export function notifyHouseChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HOUSE_EVENT));
}
