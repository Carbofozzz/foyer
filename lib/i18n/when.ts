/** Date and time for feed rows and transfer history. Falls back to the raw value. */
export function formatWhen(iso: string, locale: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(at);
  } catch {
    return at.toISOString().slice(0, 16).replace("T", " ");
  }
}
