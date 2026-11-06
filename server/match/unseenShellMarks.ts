// One viewer's unseen-round marks (round 2 of the 2026-11-02 audit, U31; wire 11, SnapshotFrame.unseenShells): the rounds
// its frames showed that left its view while the authority still flies them. The authority hides a round with its shooter
// (spotting) and a view keeps at most MAX_VIEW_SHELLS, so a round's absence alone cannot tell the client an end from a
// spotting loss. A round that ended (`dead`) is not named: its absence is its end. Each is named for
// UNSEEN_SHELL_MARK_TICKS from the frame it left, whatever becomes of it after, so a lost snapshot loses no mark and the
// mark never tells its end (a hidden round's end stays the authority's).
//
// Round 3 (A13): the list is bounded. Past MAX_SHELLS ids the encoder refuses the frame (codec.ts writeUnseenShells:
// too_many), so more than 256 rounds leaving one view inside half a second used to make every frame for that viewer fail
// to encode until the marks ran out. The marks now hold at most MAX_UNSEEN_SHELLS; a round that leaves when they are full
// takes the place of the mark made longest ago (ties: the lowest id), never of a round that left in the same frame. A
// view shows at most MAX_VIEW_SHELLS (matchActor.ts) <= MAX_UNSEEN_SHELLS rounds, so every round that leaves in flight is
// named at least in the frame it left. The marks are kept in ascending id order as they come and go (the order the wire
// requires): no sort.
//
// Round 4 (F4, E11): no storage is made again per frame. The marks and the last frame's rounds live in storage made once,
// with a count (round 3 emptied its arrays with `length = 0` and pushed again, and trimmed the marks when they lapsed, so
// V8 made new backing stores on every frame that showed a round). The list a frame returns is never written again: a
// frame whose names are the last frame's gets the same list, a frame whose names changed gets a new one, once per
// change. The publisher keeps up to HISTORY_FRAMES frames as delta baselines (publisher.ts), so round 3's one array,
// rewritten by the next frame, left every kept baseline holding another frame's names.
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
   * MAX_UNSEEN_SHELLS long, or undefined when none. The list is never written again, by this or any later call: a frame
   * keeps its own names however long the publisher keeps it, and consecutive frames with the same names share one list.
   * Read it, never write it.
   */
  frame(tick: number, rows: readonly UnseenShellRow[], rounds: readonly UnseenShellRound[]): number[] | undefined;
}

// Which wire ids the frame being marked shows: the frame's stamp at each id. One table for every viewer of every actor in
// the process: a frame's marks are taken synchronously, start to end, so no two interleave. Made on first use (256 KB).
let shownAt: Uint32Array | null = null;
let stamp = 0;

export function createUnseenShellMarks(): UnseenShellMarks {
  // the last frame's rounds: their wire ids and the authority's rounds behind them (read for `dead` when they leave), the
  // first shownCount of each; grown to the widest view seen, never shrunk, a slot past the count holds no round
  let shownIds = new Uint16Array(MAX_UNSEEN_SHELLS);
  const shownRounds: (UnseenShellRound | null)[] = [];
  let shownCount = 0;
  // the marks, ascending by id, and the tick each round left: the first markCount of each
  const ids = new Uint16Array(MAX_UNSEEN_SHELLS);
  const leftAt = new Float64Array(MAX_UNSEEN_SHELLS);
  let markCount = 0;
  // the list the last frame returned (never written again), and whether the names changed since it was made
  let list: number[] | undefined;
  let changed = false;

  function mark(id: number, tick: number): void {
    let at = 0;
    let high = markCount;
    while (at < high) { const mid = (at + high) >>> 1; if (ids[mid]! < id) at = mid + 1; else high = mid; }
    if (at < markCount && ids[at] === id) { leftAt[at] = tick; return; }
    if (markCount >= MAX_UNSEEN_SHELLS) {
      let oldest = 0;
      for (let index = 1; index < markCount; index++) if (leftAt[index]! < leftAt[oldest]!) oldest = index;
      // full of rounds that left in this frame (only a view wider than MAX_UNSEEN_SHELLS can do that): this one goes unnamed
      if (leftAt[oldest]! >= tick) return;
      ids.copyWithin(oldest, oldest + 1, markCount);
      leftAt.copyWithin(oldest, oldest + 1, markCount);
      markCount--;
      if (oldest < at) at--;
    }
    ids.copyWithin(at + 1, at, markCount);
    leftAt.copyWithin(at + 1, at, markCount);
    ids[at] = id;
    leftAt[at] = tick;
    markCount++;
    changed = true;
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
      for (let index = 0; index < markCount; index++) {
        const id = ids[index]!;
        const left = leftAt[index]!;
        if (table[id] === now || tick - left >= UNSEEN_SHELL_MARK_TICKS) continue;
        ids[kept] = id;
        leftAt[kept] = left;
        kept++;
      }
      if (kept !== markCount) { markCount = kept; changed = true; }
      // the rounds the last frame showed that this one does not, still flying, are marked from this frame
      for (let index = 0; index < shownCount; index++) {
        if (table[shownIds[index]!] !== now && shownRounds[index]!.dead !== true) mark(shownIds[index]!, tick);
      }
      // this frame's rounds, for the next; a view wider than any before grows the ids once
      if (count > shownIds.length) shownIds = new Uint16Array(Math.max(count, shownIds.length * 2));
      for (let index = 0; index < count; index++) { shownIds[index] = rows[index]!.id & 0xffff; shownRounds[index] = rounds[index]!; }
      for (let index = count; index < shownCount; index++) shownRounds[index] = null;
      shownCount = count;
      if (changed) {
        changed = false;
        list = undefined;
        if (markCount) {
          list = new Array<number>(markCount);
          for (let index = 0; index < markCount; index++) list[index] = ids[index]!;
        }
      }
      return list;
    },
  };
}
