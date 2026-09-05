import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";
import { joinWaitlist, parseWaitlistEmail } from "@/lib/protocol/waitlist";
import { isLocale } from "@/lib/i18n/config";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export async function POST(request: Request) {
  return guardPublicWrite(request, "waitlist", LIMITS.waitlist, () => postWaitlist(request));
}

async function postWaitlist(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body) || typeof body.email !== "string") {
    return jsonError("bad_request", "email is required", 400);
  }
  const locale = typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "en";
  try {
    return jsonOk(await joinWaitlist(parseWaitlistEmail(body.email), locale), 201);
  } catch (error) {
    return protocolFail(error);
  }
}
