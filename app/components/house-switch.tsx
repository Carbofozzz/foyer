import type { Messages } from "@/lib/i18n/load";

export function roleLabel(role: string, t: Messages["cabinet"]) {
  if (role === "operator") return t.memberOperator;
  if (role === "observer") return t.memberObserver;
  return t.memberOwner;
}
