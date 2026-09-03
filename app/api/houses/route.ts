import { PRINCIPAL_TYPES, type PrincipalType } from "@/lib/protocol/types";
import { createHouse } from "@/lib/protocol/houses";
import { jsonError, jsonOk } from "@/lib/protocol/http";

export async function POST(request: Request) {
  let body: { name?: string; type?: string };
  try {
    body = (await request.json()) as { name?: string; type?: string };
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }

  const name = body.name?.trim();
  const type = body.type as PrincipalType | undefined;
  if (!name) return jsonError("bad_request", "name is required", 400);
  if (!type || !PRINCIPAL_TYPES.includes(type)) {
    return jsonError("bad_request", "type must be personal or org", 400);
  }

  const house = await createHouse({ name, type });
  return jsonOk(house, 201);
}
