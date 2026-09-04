import { principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { bearerToken, jsonError, jsonOk } from "@/lib/protocol/http";
import { sweep } from "@/lib/protocol/sweep";

export const maxDuration = 120;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token = bearerToken(request);
  const local = process.env.NODE_ENV !== "production";
  if (!local && (!secret || token !== secret)) {
    return jsonError("unauthorized", "Cron secret required", 401);
  }

  const db = getDb();
  const houses = await db.select({ id: principals.id }).from(principals);
  const now = new Date();
  let advanced = 0;
  for (const house of houses) {
    const result = await sweep(house.id, now);
    advanced += result.advanced;
  }
  return jsonOk({ houses: houses.length, advanced, at: now.toISOString() });
}
