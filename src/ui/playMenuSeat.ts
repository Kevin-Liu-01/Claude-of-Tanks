/**
 * The Play menu's room seat (implicit state machine audit F6, 2026-11-02): who owns the room the menu shows, as one
 * declared state with one transition table. The menu used to spread it over ten variables (`session`, `activeRoom`,
 * `handedOff`, `connecting`, …) plus the adapter's own and DOM classes, and every reader re-derived the state from
 * them. The menu's `moveSeat` is the only writer of its seat; its `handedOff` and `connecting` flags are views of it.
 * Pure and Node-runnable: the menu (src/ui/playMenu.ts) holds the DOM.
 */

/**
 * - none: no room (the entry, solo, a failure panel).
 * - connecting: the menu's own create or join is in flight.
 * - lobby: the menu holds the room and renders its lobby from the room's updates.
 * - handed_off: the menu's own room went to the battle owner for a round; the hidden lobby renders nothing (it used to
 *   go on rebuilding the roster, the URL, the page metadata and the stored mode through the whole first round).
 * - attached: the battle owner (the composition) holds the room and hands the menu its lobby (attachActiveRoom).
 */
export type PlayMenuSeat = 'none' | 'connecting' | 'lobby' | 'handed_off' | 'attached';

export const PLAY_MENU_SEAT_MOVES: Readonly<Record<PlayMenuSeat, readonly PlayMenuSeat[]>> = {
  none: ['connecting', 'lobby', 'attached'],
  connecting: ['lobby', 'none', 'attached'],
  lobby: ['handed_off', 'attached', 'none'],
  // a refused or rejected handoff gives the menu its lobby back
  handed_off: ['attached', 'lobby', 'none'],
  attached: ['none'],
};

/** The seat after `from → to`, or null when the table refuses the move (a same-state move is allowed). */
export function nextPlayMenuSeat(from: PlayMenuSeat, to: PlayMenuSeat): PlayMenuSeat | null {
  if (from === to) return to;
  return PLAY_MENU_SEAT_MOVES[from].includes(to) ? to : null;
}

/** Only a lobby the menu holds itself renders from the room's updates. */
export function seatRendersLobby(seat: PlayMenuSeat): boolean {
  return seat === 'lobby';
}

/**
 * A guest enters the round the room starts on its own (the lobby's state names it), once per match: a match the menu
 * already handed off (`handedOffMatchId`; back in the lobby, the battle owner refused it) is not begun again by the next
 * lobby render (it used to loop: the rejection re-showed the menu, whose render began the handoff again, without end
 * or backoff). Rejoin battle still retries on the player's press.
 */
export function shouldAutoHandoff({ seat, role, phase, matchId, handedOffMatchId }: {
  seat: PlayMenuSeat; role: 'host' | 'client' | null; phase: string; matchId: string | null; handedOffMatchId: string | null;
}): boolean {
  return seat === 'lobby' && role === 'client' && (phase === 'starting' || phase === 'playing')
    && !!matchId && matchId !== handedOffMatchId;
}

/** The room's rules (mode, arrangement, map, size, operation) are the host's to change, and only while the room waits. */
export function roomRulesLocked({ inLobby, role, phase }: { inLobby: boolean; role: 'host' | 'client' | null; phase: string | null | undefined }): boolean {
  return inLobby && (role !== 'host' || phase !== 'waiting');
}
