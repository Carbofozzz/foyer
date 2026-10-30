import { and, eq } from "drizzle-orm";
import { agents, principals } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { ProtocolError } from "@/lib/protocol/errors";
import { sealKey, unsealKey } from "@/lib/protocol/seal";
import { ensureGuardianSchema, ensureHouseGuardian } from "./house";

const PRESETS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const ADDENDUM_MAX = 500;

export type GuardianSettings = {
  name: string;
  llm_url: string;
  llm_model: string;
  has_key: boolean;
  addendum: string;
};

export async function loadGuardianSettings(principalId: string): Promise<GuardianSettings> {
  await ensureGuardianSchema();
  const guardian = await ensureHouseGuardian(principalId);
  const [row] = await getDb().select().from(principals).where(eq(principals.id, principalId)).limit(1);
  return {
    name: guardian.name,
    llm_url: row?.guardianLlmUrl ?? "",
    llm_model: row?.guardianLlmModel ?? "",
    has_key: Boolean(row?.guardianLlmKey),
    addendum: row?.guardianAddendum ?? "",
  };
}

export async function houseGuardianEndpoint(principalId: string): Promise<{
  own?: { url: string; key: string; model: string };
  addendum: string;
}> {
  await ensureGuardianSchema();
  const [row] = await getDb().select().from(principals).where(eq(principals.id, principalId)).limit(1);
  const addendum = row?.guardianAddendum?.trim() ?? "";
  const url = row?.guardianLlmUrl?.trim() ?? "";
  const model = row?.guardianLlmModel?.trim() ?? "";
  const sealed = row?.guardianLlmKey ?? "";
  if (!url || !model || !sealed) return { addendum };
  return { own: { url, model, key: unsealKey(sealed) }, addendum };
}

export async function saveGuardianSettings(
  principalId: string,
  input: { name?: string; llm_url?: string; llm_model?: string; llm_key?: string; addendum?: string },
): Promise<GuardianSettings> {
  await ensureGuardianSchema();
  const guardian = await ensureHouseGuardian(principalId);
  const db = getDb();
  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new ProtocolError("bad_request", "Guardian name is required", 400);
    await db.update(agents).set({ name }).where(and(eq(agents.id, guardian.id), eq(agents.watcher, true)));
  }
  const patch: Partial<typeof principals.$inferInsert> = {};
  if (typeof input.llm_url === "string") {
    const raw = input.llm_url.trim();
    const url = PRESETS[raw] ?? raw;
    if (url && !/^https:\/\//.test(url)) throw new ProtocolError("bad_request", "Guardian URL must be https", 400);
    patch.guardianLlmUrl = url;
  }
  if (typeof input.llm_model === "string") patch.guardianLlmModel = input.llm_model.trim().slice(0, 120);
  if (typeof input.llm_key === "string" && input.llm_key.trim()) {
    patch.guardianLlmKey = sealKey(input.llm_key.trim());
  }
  if (typeof input.addendum === "string") patch.guardianAddendum = input.addendum.trim().slice(0, ADDENDUM_MAX);
  if (Object.keys(patch).length) {
    await db.update(principals).set(patch).where(eq(principals.id, principalId));
  }
  return loadGuardianSettings(principalId);
}
