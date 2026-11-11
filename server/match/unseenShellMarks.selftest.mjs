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
//   3. a stable list: with no departures the names stay as they are, frame to frame, until their window ends, in one
//      list (nothing made while they stay);
//   4. (round 4 F4) no storage made again per frame: a steady view, and marks that stay named, allocate under a byte a
//      frame over 10,000 frames (new-space bytes, a full GC before each window, a scavenge inside one counted through).
//      Round 3 emptied its arrays with `length = 0` and pushed again, so V8 made new backing stores on every frame that
//      showed a round (about 1 KB a frame for a 40-round view), and its check (the same array each frame) could not see
//      that. The meter fails closed: no new space to read throws, and two controls of known garbage (one inside new
//      space, one past it) must weigh what they make;
//   5. (round 4 E11) a frame keeps its own names: the publisher keeps up to 64 frames as delta baselines (publisher.ts),
//      and round 3 returned its one live array, rewritten by the next frame, so a kept frame held another frame's names.
//      No reader encoded a kept frame's list (publisher.ts encodes the current frame; codec.ts buildSnapshotPacket reads
//      the frame's list, never its baseline's), so the alias was latent; the encode below stands in for one that would.
//      A list once returned is never written again; churn makes a new one per change.
// Run with: node server/match/unseenShellMarks.selftest.mjs (it runs itself again under --expose-gc for section 4)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';

if (!globalThis.gc) {
  // section 4 weighs new-space bytes after a full GC: the receipt runs itself again with the GC exposed
  const child = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit', timeout: 300_000 });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}
const { MAX_SHELLS, PHASE, UNSEEN_SHELL_MARK_TICKS, VERDICT } = await import('../../src/mp/wire/constants.ts');
const { encodeSnapshotFrame } = await import('../../src/mp/wire/codec.ts');
const { MAX_UNSEEN_SHELLS, createUnseenShellMarks } = await import('./unseenShellMarks.ts');

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
  const list = rounds.frame(marks, 42, [40]);
  for (let tick = 43; tick < 41 + UNSEEN_SHELL_MARK_TICKS; tick++) {
    const named = rounds.frame(marks, tick, [40]);
    assert.deepEqual([...named], first, `the same names ${tick - 41} ticks on`);
    assert.equal(named, list, `${tick - 41} ticks on: the same names, the same list (nothing made)`);
  }
}

// ---- 4. no storage made again per frame (round 4 F4) -----------------------------------------------------------------
{
  /** New-space bytes in use. A heap that names no new space throws: the meter would weigh every window at 0 B. */
  const newSpaceUsed = () => {
    for (const space of v8.getHeapSpaceStatistics()) if (space.space_name === 'new_space') return space.space_used_size;
    throw new Error(`unseenShellMarks.selftest: no new_space among ${v8.getHeapSpaceStatistics().map((space) => space.space_name).join(', ')}: section 4 cannot weigh a frame`);
  };
  /** The same from a v8.GCProfiler record's heap statistics, before or after one collection. */
  const newSpaceIn = (statistics) => {
    const space = statistics.heapSpaceStatistics.find((entry) => entry.spaceName === 'new_space');
    if (!space) throw new Error('unseenShellMarks.selftest: a collection\'s record names no new_space: section 4 cannot weigh a frame');
    return space.spaceUsedSize;
  };
  const profiler = new v8.GCProfiler();
  /**
   * The most new-space bytes `run()` allocated in five windows, a full GC before each, beyond the measurement's own. A
   * scavenge inside a window (new space is 1 MB here; round 3's 10,000 steady frames made about 10 MB) empties it, so the
   * bytes in use before and after each collection (v8.GCProfiler) carry the count through it.
   */
  const allocated = (run) => {
    let most = -Infinity;
    for (let window = 0; window < 5; window++) {
      globalThis.gc();
      const empty = newSpaceUsed();
      const overhead = newSpaceUsed() - empty;
      globalThis.gc();
      profiler.start();
      const before = newSpaceUsed();
      run();
      const after = newSpaceUsed();
      let bytes = -overhead;
      let from = before;
      for (const collection of profiler.stop().statistics) {
        bytes += newSpaceIn(collection.beforeGC) - from;
        from = newSpaceIn(collection.afterGC);
      }
      most = Math.max(most, bytes + after - from);
    }
    return most;
  };
  // the meter sees garbage of a known size: sixteen arrays of 256 numbers (at least 1 KB each), and 4,096 of them (past
  // new space: the scavenges are counted through)
  const sink = new Array(16);
  const smallBytes = allocated(() => { for (let n = 0; n < 16; n++) sink[n] = new Array(256).fill(n); });
  const largeBytes = allocated(() => { for (let n = 0; n < 4096; n++) sink[n & 15] = new Array(256).fill(n); });
  assert.ok(smallBytes >= 16 * 1024, `the meter weighs sixteen 256-number arrays at 16 KB or more (${smallBytes} B)`);
  assert.ok(largeBytes >= 4096 * 1024, `the meter weighs 4,096 of them, past new space, at 4 MB or more (${largeBytes} B)`);
  const FRAMES = 10_000;
  const shown = Array.from({ length: 40 }, (_, n) => ({ id: 100 + n }));
  const behind = shown.map(() => ({ dead: false }));
  const fewer = shown.slice(0, 37), fewerBehind = behind.slice(0, 37);
  // a steady view: forty rounds in flight in every frame, none leaving
  const steady = createUnseenShellMarks();
  let tick = 0;
  let named = 0; // asserted outside the weighed loops (an assert call makes its own garbage)
  const steadyFrames = (frames) => { for (let n = 0; n < frames; n++) if (steady.frame(tick++, shown, behind) !== undefined) named++; };
  steadyFrames(FRAMES); // every path compiled before it is weighed
  const steadyBytes = allocated(() => steadyFrames(FRAMES));
  assert.equal(named, 0, 'none left the view');
  assert.ok(steadyBytes < FRAMES, `a steady 40-round view makes under a byte a frame (${steadyBytes} B over ${FRAMES} frames; round 3 made about 1 KB a frame)`);
  // marks that stay named: three rounds left, the view holds on without them inside their window
  const held = createUnseenShellMarks();
  const STAY = UNSEEN_SHELL_MARK_TICKS - 2;
  let heldTick = 0;
  let heldList = null;
  const cycle = (stay) => {
    held.frame(heldTick++, shown, behind); // all forty in view: no marks
    heldList = held.frame(heldTick++, fewer, fewerBehind); // three leave: named
    for (let n = 0; n < stay; n++) assert.equal(held.frame(heldTick++, fewer, fewerBehind), heldList);
  };
  for (let n = 0; n < 400; n++) cycle(STAY);
  cycle(0);
  assert.deepEqual([...heldList], [137, 138, 139]);
  let other = 0;
  const HELD_REPEATS = Math.ceil(FRAMES / STAY);
  const heldBytes = allocated(() => {
    for (let repeat = 0; repeat < HELD_REPEATS; repeat++) {
      for (let n = 0; n < STAY; n++) if (held.frame(heldTick++, fewer, fewerBehind) !== heldList) other++;
      heldTick -= STAY; // the same frames again, inside the marks' window
    }
  });
  assert.equal(other, 0, 'the same three named, in the same list, all through');
  assert.ok(heldBytes < HELD_REPEATS * STAY, `marks that stay named make under a byte a frame (${heldBytes} B over ${HELD_REPEATS * STAY} frames)`);
}

// ---- 5. a frame keeps its own names (round 4 E11) ----------------------------------------------------------------------
{
  const frameOf = (tick, unseenShells) => ({
    tick, serverTimeMs: tick * 50, ackedInputTick: tick, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 0,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: tick * 50, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], entities: [], shells: [], viewer: null, modeStateJson: null,
    ...(unseenShells ? { unseenShells } : {}),
  });
  const marks = createUnseenShellMarks();
  const rounds = view();
  rounds.frame(marks, 50, [7, 8, 9]);
  const kept = frameOf(51, rounds.frame(marks, 51, [8, 9])); // 7 left: the frame matchActor.ts builds, the one the publisher keeps
  const keptBytes = encodeSnapshotFrame(kept, null);
  assert.deepEqual([...kept.unseenShells], [7]);
  // the names change every way they can: seen again and another leaves, the window ends, one more leaves
  assert.deepEqual([...rounds.frame(marks, 52, [7, 9])], [8], 'seen again, and another left');
  assert.equal(rounds.frame(marks, 52 + UNSEEN_SHELL_MARK_TICKS, [7, 9]), undefined, 'the window ended');
  assert.deepEqual([...rounds.frame(marks, 53 + UNSEEN_SHELL_MARK_TICKS, [7])], [9], 'and one more left');
  assert.deepEqual([...kept.unseenShells], [7], 'the kept frame still names what it named');
  assert.deepEqual([...encodeSnapshotFrame(kept, null)], [...keptBytes], 'and a kept frame encodes as it did when it was sent');
  // churn: forty new rounds a frame, the forty of the frame before leave (the bound fills and turns over); every frame's
  // list stays that frame's
  const churn = createUnseenShellMarks();
  const churned = view();
  const lists = [];
  churned.frame(churn, 0, range(0, 40));
  for (let tick = 1; tick <= 120; tick++) {
    const named = churned.frame(churn, tick, range(tick * 40, 40));
    assert.ok(named, `tick ${tick}: rounds are named`);
    assert.ok(named.length <= MAX_UNSEEN_SHELLS && named.every((value, n) => n === 0 || value > named[n - 1]), `tick ${tick}: bounded and ascending`);
    assert.ok(range((tick - 1) * 40, 40).every((id) => named.includes(id)), `tick ${tick}: this frame's departures are named`);
    lists.push([named, [...named]]);
  }
  assert.equal(lists.at(-1)[0].length, MAX_UNSEEN_SHELLS, 'the bound held through the churn');
  lists.forEach(([list, names], n) => assert.deepEqual([...list], names, `the list of frame ${n + 1} still holds its names`));
}

console.log(`unseenShellMarks.selftest: marks as round 2 made them, at most ${MAX_UNSEEN_SHELLS} names (the oldest mark gives its place; every round named in the frame it left), a stable ascending list, no storage made again per frame, a frame keeps its own names PASS`);
