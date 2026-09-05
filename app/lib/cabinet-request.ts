/** Session cabinet calls name the house in a header so one wallet can open several. */
export function cabinetHeaders(houseId: string | undefined, extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra);
  if (houseId) headers.set("x-foyer-house", houseId);
  return headers;
}
