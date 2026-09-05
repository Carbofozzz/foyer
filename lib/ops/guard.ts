import { jsonError, protocolFail } from "@/lib/protocol/http";
import { writeRequestLog } from "./log";
import { overLimit, type RateLimit } from "./rate-limit";

export async function guardPublicWrite(
  request: Request,
  route: string,
  limit: RateLimit,
  handler: () => Promise<Response | undefined>,
): Promise<Response> {
  const started = Date.now();
  try {
    if (await overLimit(request, route, limit)) {
      await writeRequestLog(request, route, 429, Date.now() - started);
      const response = jsonError("rate_limited", "Too many requests", 429);
      response.headers.set("retry-after", String(limit.windowSec));
      return response;
    }
    const response = (await handler()) ?? jsonError("internal", "Unexpected error", 500);
    await writeRequestLog(request, route, response.status, Date.now() - started);
    return response;
  } catch (error) {
    await writeRequestLog(request, route, 500, Date.now() - started).catch(() => undefined);
    return protocolFail(error);
  }
}
