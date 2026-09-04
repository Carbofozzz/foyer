export const AUTH_EVENT = "foyer-auth";

export function notifyAuthChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVENT));
}
