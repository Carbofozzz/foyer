import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { spawnGuest } from "@/lib/protocol/spawn";
import { guardPublicWrite } from "@/lib/ops/guard";
import { LIMITS } from "@/lib/ops/rate-limit";

export async function POST(request: Request) {
  return guardPublicWrite(request, "spawn", LIMITS.spawn, async () => {
    try {
      return jsonOk(await spawnGuest(), 201);
    } catch (error) {
      return protocolFail(error);
    }
  });
}
