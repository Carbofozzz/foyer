import { DEMO_TOKEN } from "@/lib/demo/preview";

export { DEMO_TOKEN };

/** Landing and POST /api/spawn open the static demo. No house is created. */
export async function spawnGuest() {
  return { cabinetToken: DEMO_TOKEN };
}
