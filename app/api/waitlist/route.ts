import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";
import { joinWaitlist, parseWaitlistEmail } from "@/lib/protocol/waitlist";
import { isLocale } from "@/lib/i18n/config";

export async function POST(request: Request) {
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
