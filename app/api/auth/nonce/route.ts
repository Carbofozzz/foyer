import { jsonOk } from "@/lib/protocol/http";
import { cookieHeader, issueNonce, nonceCookie } from "@/lib/protocol/session";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export async function GET(request: Request) {
  return guardPublicWrite(request, "nonce", LIMITS.nonce, async () => {
    const ticket = issueNonce();
    const response = jsonOk({ nonce: ticket.nonce });
    response.headers.set("set-cookie", cookieHeader(nonceCookie(ticket)));
    return response;
  });
}
