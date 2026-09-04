import { jsonOk, protocolFail } from "@/lib/protocol/http";
import { spawnGuest } from "@/lib/protocol/spawn";

export async function POST() {
  try {
    return jsonOk(await spawnGuest(), 201);
  } catch (error) {
    return protocolFail(error);
  }
}
