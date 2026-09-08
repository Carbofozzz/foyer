import type { ActionPayload, KnownActionKind } from "@/lib/protocol/types";

export type AdapterContext = {
  principalId: string;
  actionId: string;
};

export type Adapter = {
  reversible: boolean;
  apply: (payload: ActionPayload, ctx: AdapterContext) => Promise<Record<string, unknown>>;
};

export type AdapterMap = Record<KnownActionKind, Adapter>;
