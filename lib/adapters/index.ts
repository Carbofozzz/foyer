import { bookAdapter, cancelAdapter, messageAdapter } from "./stubs";
import { spendAdapter } from "./spend";
import type { Adapter, AdapterContext, AdapterMap } from "./types";
import type { ActionKind, ActionPayload } from "@/lib/protocol/types";

const adapters: AdapterMap = {
  spend: spendAdapter,
  book: bookAdapter,
  message: messageAdapter,
  cancel: cancelAdapter,
};

export function adapterOf(kind: ActionKind): Adapter {
  return adapters[kind];
}

/** Same `apply` shape for every kind. Spend is almost-real; the rest stay stubs. */
export async function apply(
  kind: ActionKind,
  payload: ActionPayload,
  ctx: AdapterContext,
): Promise<Record<string, unknown>> {
  return adapters[kind].apply(payload, ctx);
}
