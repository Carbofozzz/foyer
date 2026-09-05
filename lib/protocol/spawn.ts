import { eq } from "drizzle-orm";
import { principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { saveConstitution, saveLocks } from "./cabinet";
import { enableGuardian, runFirstPass } from "./house-clients";
import { createHouse } from "./houses";
import { requireCabinet } from "./auth";
import { ProtocolError } from "./errors";

const SPAWN_CHARTER =
  "Save money, except being late for work or losing a client. External promises outrank internal convenience. Security may block mail that looks like payment or other people's data.";

/** Throwaway house for a guest with no runtime. Not the product. */
export async function spawnGuest() {
  const house = await createHouse({ name: "Demo", type: "personal" });
  const principal = await requireCabinet(house.cabinetToken);
  if (!principal) throw new ProtocolError("internal", "Failed to open spawn house", 500);

  await saveConstitution(principal, SPAWN_CHARTER);
  await saveLocks(principal, ["spend", "book", "message"]);

  const db = getDb();
  await db
    .update(principals)
    .set({ isSpawn: true, wizardConnectDone: true })
    .where(eq(principals.id, principal.id));

  const [fresh] = await db.select().from(principals).where(eq(principals.id, principal.id)).limit(1);
  if (!fresh) throw new ProtocolError("internal", "Failed to open spawn house", 500);

  await enableGuardian(fresh);
  const [ready] = await db.select().from(principals).where(eq(principals.id, principal.id)).limit(1);
  if (!ready) throw new ProtocolError("internal", "Failed to open spawn house", 500);
  await runFirstPass(ready);

  return { cabinetToken: house.cabinetToken };
}
