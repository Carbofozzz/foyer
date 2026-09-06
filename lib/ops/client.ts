import { createHash } from "node:crypto";

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "unknown";
}

export function hashClient(request: Request): string {
  return createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 16);
}

export function deployEnv(): "production" | "preview" | "development" {
  const env = process.env.VERCEL_ENV;
  if (env === "production" || env === "preview") return env;
  return "development";
}

export function cronIntervalSec(): number {
  const raw = Number(process.env.CRON_INTERVAL_SEC);
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
}

/** Preview and production both require the secret. Local `vercel dev` does not. */
export function cronRunsHere(): boolean {
  return deployEnv() === "production";
}
