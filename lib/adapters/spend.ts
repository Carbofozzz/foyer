import { eq } from "drizzle-orm";
import { spendReceipts } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/protocol/keys";
import type { Adapter } from "./types";

/** Almost-real spend: writes a house receipt. Not a card charge. Irreversible. */
export const spendAdapter: Adapter = {
  reversible: false,
  async apply(payload, ctx) {
    const id = mintToken("rcpt");
    const amount = typeof payload.amount === "number" ? String(payload.amount) : null;
    const currency = typeof payload.currency === "string" ? payload.currency : null;
    const db = getDb();
    await db
      .insert(spendReceipts)
      .values({
        id,
        principalId: ctx.principalId,
        actionId: ctx.actionId,
        amount,
        currency,
        summary: payload.summary,
      })
      .onConflictDoNothing({ target: spendReceipts.actionId });
    const [row] = await db
      .select()
      .from(spendReceipts)
      .where(eq(spendReceipts.actionId, ctx.actionId))
      .limit(1);
    return {
      charged: payload,
      receipt_id: row?.id ?? id,
      at: (row?.createdAt ?? new Date()).toISOString(),
    };
  },
};
