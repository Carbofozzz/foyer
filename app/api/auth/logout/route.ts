import { jsonOk } from "@/lib/protocol/http";
import { clearSessionCookie, cookieHeader } from "@/lib/protocol/session";

export async function POST() {
  const response = jsonOk({ ok: true });
  response.headers.set("set-cookie", cookieHeader(clearSessionCookie()));
  return response;
}
