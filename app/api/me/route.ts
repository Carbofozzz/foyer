import { jsonOk } from "@/lib/protocol/http";
import { ensureHouseForOwner } from "@/lib/protocol/houses";
import { readSession } from "@/lib/protocol/session";

export async function GET(request: Request) {
  const session = readSession(request);
  if (!session) return jsonOk({ address: null, has_house: false });
  await ensureHouseForOwner(session.address);
  return jsonOk({ address: session.address, has_house: true });
}
