import { jsonOk } from "@/lib/protocol/http";
import { cookieHeader, issueNonce, nonceCookie } from "@/lib/protocol/session";

export async function GET() {
  const ticket = issueNonce();
  const response = jsonOk({ nonce: ticket.nonce });
  response.headers.set("set-cookie", cookieHeader(nonceCookie(ticket)));
  return response;
}
