import type { ActionKind, ActionPayload } from "@/lib/protocol/types";

const RESULT_KEY: Record<ActionKind, string> = {
  spend: "would_charge",
  book: "would_book",
  message: "would_message",
  cancel: "would_cancel",
};

/** Stub adapters. Same `apply` shape that later wires to real APIs. */
export function apply(kind: ActionKind, payload: ActionPayload): Record<string, unknown> {
  return {
    [RESULT_KEY[kind]]: payload,
    at: new Date().toISOString(),
  };
}
