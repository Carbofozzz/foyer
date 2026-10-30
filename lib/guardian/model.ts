import { eq } from "drizzle-orm";
import { platformWalletState } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ensureCourtGasSchema } from "@/lib/judge/gas-stats";
import { ProtocolError } from "@/lib/protocol/errors";

const STATE_ID = "singleton";
export const DEFAULT_GUARDIAN_MODEL = "openai/gpt-4o-mini";

export async function resolveGuardianModel(): Promise<string> {
  await ensureCourtGasSchema();
  const db = getDb();
  const [row] = await db
    .select({ model: platformWalletState.guardianModel })
    .from(platformWalletState)
    .where(eq(platformWalletState.id, STATE_ID))
    .limit(1);
  const saved = row?.model?.trim();
  if (saved) return saved;
  return process.env.FOYER_GUARDIAN_MODEL?.trim() || DEFAULT_GUARDIAN_MODEL;
}

export async function saveGuardianModel(model: string): Promise<string> {
  const next = model.trim();
  if (!next || next.length > 120) {
    throw new ProtocolError("bad_request", "model id is required", 400);
  }
  await ensureCourtGasSchema();
  const db = getDb();
  await db
    .insert(platformWalletState)
    .values({ id: STATE_ID, guardianModel: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformWalletState.id,
      set: { guardianModel: next, updatedAt: new Date() },
    });
  return next;
}
