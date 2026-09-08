import { eq } from "drizzle-orm";
import { principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { cabinetFromToken, needManage } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { publicOrigin } from "@/lib/mcp/config";
import { contactsPayload, queueConfirmEmail, saveHouseEmail } from "@/lib/notify/contacts";
import { unlinkTelegram } from "@/lib/notify/telegram";
import { isLocale } from "@/lib/i18n/config";
import { isRecord } from "@/lib/protocol/parse";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needManage(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  try {
    const wake = new URL(request.url).searchParams.get("wake") === "1";
    return jsonOk(await contactsPayload(auth.principal, { drain: wake }));
  } catch (error) {
    return protocolFail(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needManage(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body)) return jsonError("bad_request", "JSON object required", 400);
  const locale = typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "en";
  const origin = publicOrigin(request);
  try {
    if (body.unlink_telegram === true) {
      await unlinkTelegram(auth.principal.id);
      const [fresh] = await getDb().select().from(principals).where(eq(principals.id, auth.principal.id)).limit(1);
      return jsonOk(fresh ? await contactsPayload(fresh) : { ok: true });
    }
    if (body.resend === true) {
      if (!auth.principal.contactEmail || auth.principal.emailVerifiedAt) {
        return jsonError("bad_request", "nothing to confirm", 400);
      }
      await queueConfirmEmail(auth.principal, origin);
      return jsonOk({ ok: true, confirmQueued: true });
    }
    const saved = await saveHouseEmail(auth.principal, body.email, locale, origin);
    const [fresh] = await getDb().select().from(principals).where(eq(principals.id, auth.principal.id)).limit(1);
    return jsonOk({ ...saved, ...(fresh ? await contactsPayload(fresh) : {}) });
  } catch (error) {
    return protocolFail(error);
  }
}
