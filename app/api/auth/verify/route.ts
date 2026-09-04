import { jsonError } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";
import { ensureHouseForOwner } from "@/lib/protocol/houses";
import {
  addressFromLogin,
  clearNonceCookie,
  cookieHeader,
  sessionCookie,
} from "@/lib/protocol/session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body) || typeof body.message !== "string" || typeof body.signature !== "string") {
    return jsonError("bad_request", "message and signature are required", 400);
  }
  const address = await addressFromLogin(request, body.message, body.signature);
  if (!address) return jsonError("forbidden", "Bad signature", 403);
  await ensureHouseForOwner(address);
  const headers = new Headers({ "content-type": "application/json" });
  headers.append("set-cookie", cookieHeader(sessionCookie(address)));
  headers.append("set-cookie", cookieHeader(clearNonceCookie()));
  return new Response(JSON.stringify({ data: { address, has_house: true } }), {
    status: 200,
    headers,
  });
}
