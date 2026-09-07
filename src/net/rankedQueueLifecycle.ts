import type { RankedQueueTicket } from './rankedServiceClient.ts';

export interface RankedQueueAttempt {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  adoptTicket(ticket: RankedQueueTicket): Promise<boolean>;
  takeMatch(): void;
  release(): void;
}

interface ActiveAttempt {
  abort: AbortController;
  ticket: RankedQueueTicket | null;
}

/** One ranked intent owns refresh, HTTP join, polling and the final handoff. */
export function createRankedQueueLifecycle(): {
  begin(): RankedQueueAttempt | null;
  cancel(): Promise<void>;
} {
  let active: ActiveAttempt | null = null;

  const cancelTicket = async (ticket: RankedQueueTicket | null): Promise<void> => {
    if (ticket?.status === 'queued') await ticket.cancel();
  };

  return {
    begin(): RankedQueueAttempt | null {
      if (active) return null;
      const attempt: ActiveAttempt = { abort: new AbortController(), ticket: null };
      active = attempt;
      const isCurrent = () => active === attempt && !attempt.abort.signal.aborted;
      return {
        signal: attempt.abort.signal,
        isCurrent,
        async adoptTicket(ticket): Promise<boolean> {
          if (!isCurrent()) {
            // The HTTP request may finish after mode switch or dismissal.
            // Cancel that exact receipt without touching a replacement search.
            await cancelTicket(ticket);
            return false;
          }
          attempt.ticket = ticket;
          return true;
        },
        takeMatch(): void { if (isCurrent()) attempt.ticket = null; },
        release(): void { if (active === attempt) active = null; },
      };
    },
    async cancel(): Promise<void> {
      const attempt = active;
      if (!attempt) return;
      active = null;
      attempt.abort.abort();
      const ticket = attempt.ticket;
      attempt.ticket = null;
      await cancelTicket(ticket);
    },
  };
}
