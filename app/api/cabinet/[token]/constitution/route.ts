import { cabinetFromToken, needManage } from "@/lib/protocol/auth";
import { jsonError, jsonOk, protocolFail } from "@/lib/protocol/http";
import { isRecord } from "@/lib/protocol/parse";
import { saveConstitution } from "@/lib/protocol/cabinet";
import { parseRequireSigned } from "@/lib/protocol/write-sign";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = needManage(await cabinetFromToken(token, request));
  if ("error" in auth) return auth.error;
  const principal = auth.principal;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("bad_request", "JSON body required", 400);
  }
  if (!isRecord(body) || typeof body.constitution !== "string") {
    return jsonError("bad_request", "constitution is required", 400);
  }
  const type = body.type === "org" || body.type === "personal" ? body.type : undefined;
  try {
    await saveConstitution(principal, body.constitution, type, {
      collect_window_sec: body.collect_window_sec,
      bargain_window_sec: body.bargain_window_sec,
      require_signed_writes: parseRequireSigned(body.require_signed_writes),
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return protocolFail(error);
  }
}
