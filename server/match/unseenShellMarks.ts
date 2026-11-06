// One viewer's unseen-round marks (round 2 of the 2026-11-02 audit, U31; wire 11, SnapshotFrame.unseenShells): the rounds
// its frames showed that left its view while the authority still flies them. The authority hides a round with its shooter
// (spotting) and a view keeps at most MAX_VIEW_SHELLS, so a round's absence alone cannot tell the client an end from a
// spotting loss. A round that ended (`dead`) is not named: its absence is its end. Each is named for
// UNSEEN_SHELL_MARK_TICKS from the frame it left, whatever becomes of it after, so a lost snapshot loses no mark and the
// mark never tells its end (a hidden round's end stays the authority's).
//
// Round 3 (A13): the list is bounded and kept without allocating. Past MAX_SHELLS ids the encoder refuses the frame
// (codec.ts writeUnseenShells: too_many), so more than 256 rounds leaving one view inside half a second used to make every
// frame for that viewer fail to encode until the marks ran out. The marks now hold at most MAX_UNSEEN_SHELLS; a round that
// leaves when they are full takes the place of the mark made longest ago (ties: the lowest id), never of a round that
// left in the same frame. A view shows at most MAX_VIEW_SHELLS (matchActor.ts) <= MAX_UNSEEN_SHELLS rounds, so every
// round that leaves in flight is named at least in the frame it left. The list is kept in ascending id order as marks
// come and go (the order the wire requires), in arrays reused for every frame: no sort, no fresh array.
import { MAX_SHELLS, UNSEEN_SHELL_MARK_TICKS } from '../../src/mp/wire/constants.ts';

/** The most rounds one frame names unseen: the wire's bound on the list (codec.ts writeUnseenShells). */
export const MAX_UNSEEN_SHELLS = MAX_SHELLS;

/** A shown round as the frame holds it: its wire id (u16 after masking). */
export interface UnseenShellRow { readonly id: number }
/** The authority's round behind a shown row: `dead` once it ended. */
export interface UnseenShellRound { readonly dead?: boolean }

export interface UnseenShellMarks {
  /**
   * One frame of this viewer's, at `tick`: `rows[i]` are the rounds it shows and `rounds[i]` the authority's rounds
   * behind them (parallel; `rounds.length` of each). Returns the frame's unseen list, ascending, at most
   * MAX_UNSEEN_SHELLS long, or undefined when none. The list is these marks' own array, rewritten by the next call: the
   * publisher encodes a frame at once, and no baseline reads its unseen list (codec.ts encodeSnapshotFrame and
   * buildSnapshotPacket read only the frame's own).
   */
  frame(tick: number, rows: readonly UnseenShellRow[], rounds: readonly UnseenShellRound[]): number[] | undefined;
}

// Which wire ids the frame being marked shows: the frame's stamp at each id. One table for every viewer of every actor in
// the process: a frame's marks are taken synchronously, start to end, so no two interleave. Made on first use (256 KB).
let shownAt: Uint32Array | null = null;
let stamp = 0;

export function createUnseenShellMarks(): UnseenShellMarks {
  // the last frame's rounds: their wire ids and the authority's rounds behind them (read for `dead` when they leave)
  const shownIds: number[] = [];
  const shownRounds: UnseenShellRound[] = [];
  // the marks, ascending by id, and the tick each round left
  const ids: number[] = [];
  const leftAt: number[] = [];

  function mark(id: number, tick: number): void {
    let at = 0;
    let high = ids.length;
    while (at < high) { const mid = (at + high) >>> 1; if (ids[mid]! < id) at = mid + 1; else high = mid; }
    if (ids[at] === id) { leftAt[at] = tick; return; }
    if (ids.length >= MAX_UNSEEN_SHELLS) {
      let oldest = 0;
      for (let index = 1; index < ids.length; index++) if (leftAt[index]! < leftAt[oldest]!) oldest = index;
      // full of rounds that left in this frame (only a view wider than MAX_UNSEEN_SHELLS can do that): this one goes unnamed
      if (leftAt[oldest]! >= tick) return;
      for (let index = oldest; index < ids.length - 1; index++) { ids[index] = ids[index + 1]!; leftAt[index] = leftAt[index + 1]!; }
      ids.pop();
      leftAt.pop();
      if (oldest < at) at--;
    }
    ids.push(id);
    leftAt.push(tick);
    for (let index = ids.length - 1; index > at; index--) { ids[index] = ids[index - 1]!; leftAt[index] = leftAt[index - 1]!; }
    ids[at] = id;
    leftAt[at] = tick;
  }

  return {
    frame(tick, rows, rounds) {
      const table = (shownAt ??= new Uint32Array(0x10000));
      if (stamp === 0xffffffff) { table.fill(0); stamp = 0; }
      const now = ++stamp;
      const count = rounds.length;
      for (let index = 0; index < count; index++) table[rows[index]!.id & 0xffff] = now;
      // a mark ends with its window, or when its round is in view again
      let kept = 0;
      for (let index = 0; index < ids.length; index++) {
        const id = ids[index]!;
        const left = leftAt[index]!;
        if (table[id] === now || tick - left >= UNSEEN_SHELL_MARK_TICKS) continue;
        ids[kept] = id;
        leftAt[kept] = left;
        kept++;
      }
      ids.length = kept;
      leftAt.length = kept;
      // the rounds the last frame showed that this one does not, still flying, are marked from this frame
      for (let index = 0; index < shownIds.length; index++) {
        if (table[shownIds[index]!] !== now && shownRounds[index]!.dead !== true) mark(shownIds[index]!, tick);
      }
      shownIds.length = 0;
      shownRounds.length = 0;
      for (let index = 0; index < count; index++) { shownIds.push(rows[index]!.id & 0xffff); shownRounds.push(rounds[index]!); }
      return ids.length ? ids : undefined;
    },
  };
}
