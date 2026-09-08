import { NextResponse } from "next/server";
import { jsonError, jsonOk, protocolFail, bearerToken } from "@/lib/protocol/http";
import { publicOrigin } from "@/lib/mcp/config";
import { deployEnv } from "@/lib/ops/client";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";
import { handleTelegramUpdate, registerTelegramWebhook, telegramWebhookSecretOk } from "@/lib/notify/telegram";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token = bearerToken(request);
  const local = deployEnv() === "development";
  if ((local || (secret && token === secret)) && request.headers.get("content-type")?.includes("json")) {
    let peek: unknown = null;
    try {
      peek = await request.clone().json();
    } catch {
      peek = null;
    }
    if (peek && typeof peek === "object" && (peek as { setup?: unknown }).setup === true) {
      try {
        await registerTelegramWebhook(publicOrigin(request));
        return jsonOk({ ok: true });
      } catch (error) {
        return protocolFail(error);
      }
    }
  }

  return guardPublicWrite(request, "telegram", LIMITS.telegram, async () => {
    if (!telegramWebhookSecretOk(request)) {
      return jsonError("unauthorized", "Bad webhook secret", 401);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("bad_request", "JSON body required", 400);
    }
    await handleTelegramUpdate(body);
    return new NextResponse(null, { status: 200 });
  });
}
