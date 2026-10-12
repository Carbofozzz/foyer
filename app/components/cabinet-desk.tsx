export type CabinetTabId = "inbox" | "plan" | "rules" | "connect" | "test" | "people" | "contacts" | "settings";

export function parseCabinetTab(value: string | undefined, allowed: CabinetTabId[]): CabinetTabId {
  const raw =
    value === "tech" ? "connect" : value === "history" || value === "treasury" ? "plan" : value;
  if (raw && allowed.includes(raw as CabinetTabId)) return raw as CabinetTabId;
  return allowed[0] ?? "inbox";
}
