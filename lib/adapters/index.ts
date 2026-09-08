import { bookAdapter, cancelAdapter, messageAdapter } from "./stubs";
import { spendAdapter } from "./spend";
import type { Adapter, AdapterContext } from "./types";
import type { ActionPayload, KnownActionKind } from "@/lib/protocol/types";

const adapters: Record<KnownActionKind, Adapter> = {
  spend: spendAdapter,
  book: bookAdapter,
  message: messageAdapter,
  cancel: cancelAdapter,
};

export function adapterOf(kind: string): Adapter {
  if (kind === "spend" || kind === "book" || kind === "message" || kind === "cancel") {
    return adapters[kind];
  }
  return messageAdapter;
}

/** Same `apply` shape for every kind. Spend is almost-real; unknown labels use the message stub. */
export async function apply(
  kind: string,
  payload: ActionPayload,
  ctx: AdapterContext,
): Promise<Record<string, unknown>> {
  return adapterOf(kind).apply(payload, ctx);
}
