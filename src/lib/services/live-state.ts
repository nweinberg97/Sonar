/**
 * Tiny shared state about live conversations, kept apart from the queues so
 * they can read it without importing each other.
 */
export const liveState = {
  /** Last time any respondent was mid-conversation (sent audio or paused). */
  lastActivityAt: 0,
  /** Conversations that ended but whose last bursts are still being transcribed. */
  finishingBySession: new Map<string, number>(),
};

/**
 * True while someone is mid-conversation. Background analysis waits so the
 * model is free to write their next follow-up quickly.
 */
export function liveBusy(windowMs = 15_000): boolean {
  return Date.now() - liveState.lastActivityAt < windowMs;
}

export function finishingConversations(sessionId?: string): number {
  if (sessionId) return liveState.finishingBySession.get(sessionId) ?? 0;
  let n = 0;
  for (const v of liveState.finishingBySession.values()) n += v;
  return n;
}
