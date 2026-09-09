const URL_RE = /https?:\/\/[^\s<>"'\\]+/gi;
const TRAIL = /[),.;:!?\]}>]+$/;

/** http(s) URLs from agent text. Caps match evidence. */
export function urlsIn(...parts: unknown[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const raw of scan(part)) {
      const url = cleanUrl(raw);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      found.push(url);
      if (found.length >= 8) return found;
    }
  }
  return found;
}

function scan(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") {
    const hits = value.match(URL_RE);
    if (hits) into.push(...hits);
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) scan(item, into);
    return into;
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (rec.type === "link" && typeof rec.value === "string") into.push(rec.value);
    for (const item of Object.values(rec)) scan(item, into);
  }
  return into;
}

function cleanUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(TRAIL, "");
  if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) return null;
  if (trimmed.length > 2000) return null;
  return trimmed;
}
