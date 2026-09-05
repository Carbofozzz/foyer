import { requestLogs } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/protocol/keys";
import { hashClient } from "./client";

export async function writeRequestLog(
  request: Request,
  route: string,
  status: number,
  ms: number,
): Promise<void> {
  const db = getDb();
  await db.insert(requestLogs).values({
    id: mintToken("log"),
    route,
    method: request.method,
    status,
    ipHash: hashClient(request),
    ms,
  });
}
