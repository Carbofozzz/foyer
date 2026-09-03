/**
 * Advances time for one house. Day 1: no windows to close yet.
 * Day 2 fills silence, ack, appeal, and the guardian turn.
 */
export async function sweep(_principalId: string, _now: Date): Promise<{ advanced: number }> {
  return { advanced: 0 };
}
