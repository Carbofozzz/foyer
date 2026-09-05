import type { Adapter } from "./types";

function stub(key: string): Adapter {
  return {
    reversible: true,
    async apply(payload) {
      return {
        [key]: payload,
        at: new Date().toISOString(),
      };
    },
  };
}

export const bookAdapter = stub("would_book");
export const messageAdapter = stub("would_message");
export const cancelAdapter = stub("would_cancel");
