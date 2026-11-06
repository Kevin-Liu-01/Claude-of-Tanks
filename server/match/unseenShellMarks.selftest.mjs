// Round 3 of the 2026-11-02 audit, A13 (U31's first bullet, the match actor's half): one viewer's unseen-round marks
// (server/match/unseenShellMarks.ts, wire 11's SnapshotFrame.unseenShells). The actor named every round its viewer was
// shown that left the view in flight, uncapped, in a fresh array sorted each frame; past MAX_SHELLS (256) names inside
// the half-second mark window the encoder refused every frame for that viewer (codec.ts writeUnseenShells: too_many).
// The real actor path is unseenRounds.selftest section 1 (a 512-round burst). Here the owner itself:
//   1. the marks as round 2 made them: a round shown and gone while flying is named for UNSEEN_SHELL_MARK_TICKS from the
//      frame it left, an ended round never, a round seen again no longer, ids masked to the wire's u16;
//   2. the bound: never more than MAX_UNSEEN_SHELLS (= MAX_SHELLS) names, ascending; a departure when they are full takes
//      the place of the mark made longest ago (ties: the lowest id), never of a round that left in the same frame, so
//      every round that leaves is named in the frame it left (a view shows at most 256);
//   3. a stable list: with no departures the names stay as they are, frame to frame, until their window ends;
//   4. no allocation per frame: every frame's list is the same array, rewritten in place, and the order is kept as
//      marks come and go (never sorted).
// Run with: node server/match/unseenShellMarks.selftest.mjs
import assert from 'node:assert/strict';
import { MAX_SHELLS, UNSEEN_SHELL_MARK_TICKS } from '../../src/mp/wire/constants.ts';
import { MAX_UNSEEN_SHELLS, createUnseenShellMarks } from './unseenShellMarks.ts';

assert.equal(MAX_UNSEEN_SHELLS, MAX_SHELLS, 'the bound is the wire\'s');
const range = (from, count) => Array.from({ length: count }, (_, n) => from + n);
/** One frame of a view: `ids` shown, `dead` the ids of rounds the authority has ended since they were shown. */
const view = () => {
  const rounds = new Map();
  return {
    round(id) { if (!rounds.has(id)) rounds.set(id, { dead: false }); return rounds.get(id); },
    end(id) { this.round(id).dead = true; },
    frame(marks, tick, ids) { return marks.frame(tick, ids.map((id) => ({ id })), ids.map((id) => this.round(id))); },
  };
};

// ---- 1. the marks ------------------------------------------------------------------------------------------------
{
  const marks = createUnseenShellMarks();
  const rounds = view();
  assert.equal(rounds.frame(marks, 100, [7, 8, 9]), undefined, 'none left');
  rounds.end(8);
  const left = rounds.frame(marks, 101, [9]);
  assert.deepEqual([...left], [7], 'the round that left in flight is named; the one that ended is not');
  for (let tick = 102; tick < 101 + UNSEEN_SHELL_MARK_TICKS; tick++) assert.deepEqual([...rounds.frame(marks, tick, [9])], [7], `named ${tick - 101} ticks on`);
  assert.equal(rounds.frame(marks, 101 + UNSEEN_SHELL_MARK_TICKS, [9]), undefined, 'not past its window');
  rounds.frame(marks, 200, [9, 10]);
  assert.deepEqual([...rounds.frame(marks, 201, [9])], [10]);
  assert.equal(rounds.frame(marks, 202, [9, 10]), undefined, 'seen again, it is not named');
  // a wire id is the round's id masked to u16
  rounds.frame(marks, 300, [9, 10, 0x10005]);
  assert.deepEqual([...rounds.frame(marks, 301, [9, 10])], [5]);
}

// ---- 2. the bound ------------------------------------------------------------------------------------------------
{
  const marks = createUnseenShellMarks();
  const rounds = view();
  const first = range(1000, 256), second = range(2000, 256);
  rounds.frame(marks, 10, [3, 4]);
  rounds.frame(marks, 11, first); // 3 and 4 leave
  let named = rounds.frame(marks, 12, second); // the first 256 leave: 258 marks would be due
  assert.equal(named.length, MAX_UNSEEN_SHELLS, 'at most MAX_UNSEEN_SHELLS names');
  assert.deepEqual([...named], first, 'the departures of this frame take the places of the oldest marks');
  named = rounds.frame(marks, 13, []);
  assert.deepEqual([...named], second, 'and again: every round is named in the frame it left');
  // the oldest goes first, ties the lowest id: marks made at four ticks, then one departure past the bound
  const mixed = createUnseenShellMarks();
  const ages = view();
  ages.frame(mixed, 20, range(0, 64)); ages.frame(mixed, 21, range(64, 64)); // 0..63 leave at 21
  ages.frame(mixed, 22, range(128, 64)); // 64..127 at 22
  ages.frame(mixed, 23, range(192, 64)); // 128..191 at 23
  ages.frame(mixed, 24, [500]); // 192..255 at 24
  named = ages.frame(mixed, 25, []); // 500 at 25: one past the bound
  assert.equal(named.length, MAX_UNSEEN_SHELLS);
  assert.deepEqual([...named], [...range(1, 255), 500], 'the oldest mark with the lowest id gave its place, and the list stays ascending');
  // a view wider than the bound (never the actor's: MAX_VIEW_SHELLS is 256) names the first MAX_UNSEEN_SHELLS of a frame
  const wide = createUnseenShellMarks();
  const wideRounds = view();
  wideRounds.frame(wide, 30, range(0, 300));
  named = wideRounds.frame(wide, 31, []);
  assert.equal(named.length, MAX_UNSEEN_SHELLS, 'never past the bound');
  assert.deepEqual([...named], range(0, MAX_UNSEEN_SHELLS), 'the departures of one frame never displace each other');
}

// ---- 3. a stable list --------------------------------------------------------------------------------------------
{
  const marks = createUnseenShellMarks();
  const rounds = view();
  rounds.frame(marks, 40, [5, 900, 40, 7]);
  const first = [...rounds.frame(marks, 41, [40])];
  assert.deepEqual(first, [5, 7, 900], 'ascending, whatever order the view showed them in');
  for (let tick = 42; tick < 41 + UNSEEN_SHELL_MARK_TICKS; tick++) assert.deepEqual([...rounds.frame(marks, tick, [40])], first, `the same names ${tick - 41} ticks on`);
}

// ---- 4. no allocation per frame -----------------------------------------------------------------------------------
{
  const marks = createUnseenShellMarks();
  const rounds = view();
  let list = null;
  // churn: each frame shows forty new rounds, and the forty of the frame before leave (the bound fills and turns over)
  rounds.frame(marks, 0, range(0, 40));
  for (let tick = 1; tick <= 120; tick++) {
    const named = rounds.frame(marks, tick, range(tick * 40, 40));
    assert.ok(named, `tick ${tick}: rounds are named`);
    list ??= named;
    assert.equal(named, list, `tick ${tick}: the same array, rewritten in place`);
    assert.ok(named.length <= MAX_UNSEEN_SHELLS && named.every((value, n) => n === 0 || value > named[n - 1]), `tick ${tick}: bounded and ascending`);
    assert.ok(range((tick - 1) * 40, 40).every((id) => named.includes(id)), `tick ${tick}: this frame's departures are named`);
  }
  assert.equal(list.length, MAX_UNSEEN_SHELLS, 'the bound held through the churn');
}

console.log(`unseenShellMarks.selftest: marks as round 2 made them, at most ${MAX_UNSEEN_SHELLS} names (the oldest mark gives its place; every round named in the frame it left), a stable ascending list, one array rewritten in place PASS`);
