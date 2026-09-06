export type CabinetTabId = "inbox" | "treasury" | "rules" | "connect" | "test" | "people";

export function parseCabinetTab(value: string | undefined, allowed: CabinetTabId[]): CabinetTabId {
  const raw = value === "tech" ? "connect" : value === "history" ? "treasury" : value;
  if (raw && allowed.includes(raw as CabinetTabId)) return raw as CabinetTabId;
  return allowed[0] ?? "inbox";
}
