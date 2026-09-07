import type { NetworkBrowserSessionRuntime } from './networkBrowserSessionRuntime.ts';
import { resetNetworkRoundState, type NetworkRoundState } from './networkRoundState.ts';

interface NetworkEntryOwner {
  cancel(reason?: string): void;
}

interface NetworkRoomOwner {
  clear(): void;
}

export interface NetworkRoundLifecycleOptions {
  game: NetworkRoundState;
  session: Pick<
    NetworkBrowserSessionRuntime,
    'clearRound' | 'close' | 'disposePresentation'
  >;
  getEntryOwner(): NetworkEntryOwner | null;
  getRoomOwner(): NetworkRoomOwner | null;
}

export interface NetworkRoundLifecycle {
  /** Release only round presentation while retaining the room transport. */
  disposePresentation(): void;
  /** Clear retained snapshot/input state before a rematch acquisition. */
  clearRound(): void;
  /** Remove the previous result before any new network frame can render. */
  resetBattleState(): void;
  /** Abort entry, close match transport, then clear room presentation. */
  close(reason?: string): void;
}

/**
 * Own the browser network round's reset and teardown order.
 *
 * The lobby deliberately survives `disposePresentation` and `clearRound` for
 * rematches. A full close is stronger: it first aborts an in-flight entry,
 * then closes the match transport, then clears the room owner. Keeping those
 * operations here prevents error, leave, and rematch paths from drifting.
 */
export function createNetworkRoundLifecycle({
  game,
  session,
  getEntryOwner,
  getRoomOwner,
}: NetworkRoundLifecycleOptions): NetworkRoundLifecycle {
  const required = [session?.clearRound, session?.close,
    session?.disposePresentation, getEntryOwner, getRoomOwner];
  if (!game || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('network round lifecycle requires state, session, and owner ports');
  }

  return {
    disposePresentation: () => session.disposePresentation(),
    clearRound: () => session.clearRound(),
    resetBattleState() {
      resetNetworkRoundState(game);
    },
    close(reason = 'network_match_closed') {
      getEntryOwner()?.cancel(reason);
      session.close(reason);
      getRoomOwner()?.clear();
    },
  };
}
