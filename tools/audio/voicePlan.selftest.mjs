// Receipt (round 8 Y9 s1-12, 2026-11-08): a crew line's file n is always its script take n. build-voices.mjs skipped a
// take whose speech request threw (or that came back empty) and mastered the next one at shipped.length, one index low:
// script [A, B, C] with B failing shipped [A, C], so take 1 played C under caption B; a later --append saw two takes
// shipped, kept both and built index 2 only, giving [A, C, C], with B never attempted again and nothing flagged. Now
// tools/audio/voicePlan.mjs buildLine stops a line at its aligned prefix ([A]) and --append's count rule resumes it at the
// failed take; --dry counts with the same planner. A take under the bar is dropped only when a budget or quota stop cut it
// short (pickTake, review r1). Driven here on the real planLine, pickTake and buildLine with an injected attempt, cut,
// take and master (no API, no ffmpeg), and a census of build-voices.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const voice = await import('./voicePlan.mjs');
const SCRIPT = ['A', 'B', 'C'];

/** A line's build with an injected attempt picker and master: files[index] is the take text mastered there. */
function harness({ failAt = null, nullAt = null, shipFailAt = null, stopAfter = null, files = {} } = {}) {
  let stop = false;
  const h = {
    files,
    written: [],
    errors: [],
    stopped: () => stop,
    take: async (i) => {
      if (i === failAt) throw new Error(`speech 503 on take ${i}`);
      return i === nullAt ? null : { text: SCRIPT[i], dur: +(1 + i / 10).toFixed(1) };
    },
    ship: async (index, best) => {
      if (index === shipFailAt) throw new Error(`ffmpeg failed at ${index}`);
      h.files[index] = best.text;
      h.written.push([index, best.text]);
      if (index === stopAfter) stop = true;
      return best.dur;
    },
    onError: (i, error) => h.errors.push([i, error ? error.message : null]),
  };
  return h;
}
const exists = (h) => (i) => Object.hasOwn(h.files, i);
const build = (h, previous, append) => {
  const plan = voice.planLine({ previous, takes: SCRIPT, append, exists: exists(h) });
  return voice.buildLine({ previous, plan, take: h.take, ship: h.ship, stopped: h.stopped, onError: h.onError }).then((out) => ({ plan, out }));
};
const shippedOf = (out) => (Array.isArray(out) ? out : out.shipped);

// 1. take B's request throws: C is never mastered as _1; the line stops at its aligned prefix [A]
const first = harness({ failAt: 1 });
const run1 = await build(first, [], false);
assert.deepEqual(first.written, [[0, 'A']], 'B threw: C is never written as file _1 (file index = script index)');
assert.deepEqual(shippedOf(run1.out), [1], 'the line ships its aligned prefix [A]');
assert.deepEqual(first.errors, [[1, 'speech 503 on take 1']], 'the failure is reported at its script index');

// 2. the following --append resumes at the failed take and completes the pack in script order
const again = harness({ files: first.files });
const run2 = await build(again, shippedOf(run1.out), true);
assert.deepEqual(run2.plan, { kept: 1, build: [1, 2] }, '--append keeps [A] and builds takes 1 and 2');
assert.deepEqual(again.written, [[1, 'B'], [2, 'C']], 'B is built at _1, C at _2');
assert.deepEqual(shippedOf(run2.out), [1, 1.1, 1.2], 'the pack is [A, B, C]: take n is caption n');
assert.deepEqual(again.files, { 0: 'A', 1: 'B', 2: 'C' });

// 3. an empty take (no attempt built) stops the line the same way, and says so
{
  const h = harness({ nullAt: 1 });
  const { out } = await build(h, [], false);
  assert.deepEqual(h.written, [[0, 'A']], 'an empty take 1: C is never written as _1');
  assert.deepEqual(shippedOf(out), [1]);
  assert.deepEqual(h.errors, [[1, null]], 'an empty take is reported at its index');
}

// 4. the master throws on take 1: the line stops at [A]; nothing is mastered after it
{
  const h = harness({ shipFailAt: 1 });
  const { out } = await build(h, [], false);
  assert.deepEqual(h.written, [[0, 'A']]);
  assert.deepEqual(shippedOf(out), [1]);
  assert.deepEqual(h.errors, [[1, 'ffmpeg failed at 1']]);
}

// 5. a budget or quota stop after take 0: the prefix [A] stands, and --append resumes at 1
{
  const h = harness({ stopAfter: 0 });
  const { out } = await build(h, [], false);
  assert.deepEqual(shippedOf(out), [1], 'a stop leaves the aligned prefix');
  assert.deepEqual(voice.planLine({ previous: shippedOf(out), takes: SCRIPT, append: true, exists: exists(h) }), { kept: 1, build: [1, 2] });
}

// 6. the keep rule (--append, and --dry, which counts with it)
{
  const all = () => true;
  assert.deepEqual(voice.planLine({ previous: [1, 1.1], takes: SCRIPT, append: false, exists: all }), { kept: 0, build: [0, 1, 2] }, 'no --append: every take builds');
  assert.deepEqual(voice.planLine({ previous: [1, 1.1], takes: SCRIPT, append: true, exists: all }), { kept: 2, build: [2] }, '--append keeps the shipped prefix');
  assert.deepEqual(voice.planLine({ previous: [1, 1.1], takes: SCRIPT, append: true, exists: (i) => i !== 1 }), { kept: 0, build: [0, 1, 2] },
    'a shipped file gone from disk: the line rebuilds (the old --dry count said 1 take)');
  assert.deepEqual(voice.planLine({ previous: [1, 1.1, 1.2, 1.3], takes: SCRIPT, append: true, exists: all }), { kept: 0, build: [0, 1, 2] },
    'the script lost a take: the line rebuilds');
  assert.deepEqual(voice.planLine({ previous: [], takes: SCRIPT, append: true, exists: all }), { kept: 0, build: [0, 1, 2] });
}

// 7. the declared machine: a take is kept or due; a due take is mastered only after every take before it stands
assert.equal(typeof voice.takeMove, 'function', 'voicePlan.mjs declares its moves (takeMove)');
assert.deepEqual(Object.keys(voice.TAKE_MOVES), ['kept', 'due', 'mastering', 'built', 'missing']);
for (const [states, i, to] of [
  [['kept', 'due', 'due'], 1, 'mastering'],
  [['built', 'mastering', 'due'], 1, 'built'],
  [['built', 'mastering', 'due'], 1, 'missing'],
  [['built', 'due', 'due'], 1, 'missing'],
  [['built', 'missing', 'due'], 2, 'missing'],
]) assert.equal(voice.takeMove([...states], i, to), to, `${states[i]} -> ${to}`);
for (const [states, i, to, why] of [
  [['built', 'missing', 'due'], 2, 'mastering', 'a take after a missing one'],
  [['due', 'due', 'due'], 1, 'mastering', 'a take before its predecessor'],
  [['kept', 'due', 'due'], 0, 'mastering', 'a kept take rebuilt'],
  [['built', 'missing', 'due'], 1, 'mastering', 'a missing take built late'],
  [['built', 'due', 'due'], 0, 'missing', 'a built take dropped'],
  [['built', 'due', 'due'], 1, 'built', 'a take built without mastering'],
]) assert.throws(() => voice.takeMove([...states], i, to), /no move/, `refused: ${why}`);
{
  const h = harness({ failAt: 1 });
  const plan = voice.planLine({ previous: [], takes: SCRIPT, append: false, exists: exists(h) });
  const out = await voice.buildLine({ previous: [], plan, take: h.take, ship: h.ship, stopped: h.stopped, onError: h.onError });
  assert.deepEqual(out.takes, ['built', 'missing', 'missing'], 'buildLine reports each take\'s state');
}

// 8. one take's pick (pickTake, verifier edge 6; review r1): a take under the bar is dropped only when a budget or
// quota stop cut it short (its attempts ended before all ran, or its cut pass never ran). A take whose attempts and cut
// pass all ran ships its best attempt, flagged as before, even when another line's stop lands while it is being cut.
{
  const BAR = 0.62;
  /** One take's attempts scored `sims`; the stop flag flips during attempt `stopAt`, or inside the cut pass. */
  const picker = ({ sims, stopAt = null, stopInCut = false, stopBefore = false, cutOf = null } = {}) => {
    let stop = stopBefore;
    const p = { ran: [], cut: [] };
    p.pick = () => voice.pickTake({
      attempts: 3, bar: BAR, verify: true, stopped: () => stop, better: (a, b) => a.sim > b.sim,
      attempt: async (n) => { p.ran.push(n); if (n === stopAt) stop = true; return { sim: sims[n], repeated: false, durS: 1, attempt: n }; },
      trim: async (candidate) => {
        p.cut.push(candidate.attempt);
        if (stopInCut) stop = true;
        return candidate.attempt === cutOf ? { sim: 0.8, repeated: false, durS: 0.5, attempt: cutOf, trimmed: true } : null;
      },
    });
    return p;
  };
  const under = [0.3, 0.4, 0.35];
  // every attempt and every cut ran, none passed, no stop: the best attempt ships (build-voices flags it under 0.34)
  {
    const p = picker({ sims: under });
    assert.equal((await p.pick())?.attempt, 1, 'no stop: the best attempt under the bar ships, as before');
    assert.deepEqual([p.ran, p.cut], [[0, 1, 2], [0, 1, 2]], 'every attempt ran, then every cut');
  }
  // another line's stop lands while this take is being cut (trimmedTake runs every cut): its pass ran in full, it ships
  {
    const p = picker({ sims: under, stopInCut: true });
    assert.equal((await p.pick())?.attempt, 1, 'attempts and cuts ran in full, a stop set afterwards: the take ships');
    assert.deepEqual([p.ran, p.cut], [[0, 1, 2], [0, 1, 2]]);
  }
  // the stop ends the attempts after the first: cut short under the bar, no take
  {
    const p = picker({ sims: under, stopAt: 0 });
    assert.equal(await p.pick(), null, 'attempts cut short under the bar: no take');
    assert.deepEqual([p.ran, p.cut], [[0], []]);
  }
  // the stop lands during the last attempt: every attempt ran, but the cut pass never did
  {
    const p = picker({ sims: under, stopAt: 2 });
    assert.equal(await p.pick(), null, 'the cut pass skipped by a stop: no take');
    assert.deepEqual([p.ran, p.cut], [[0, 1, 2], []]);
  }
  // a stop before any attempt: no take; an attempt that passes ships whatever the stop; a cut that reads ships
  assert.equal(await picker({ sims: under, stopBefore: true }).pick(), null, 'no attempt ran: no take');
  assert.equal((await picker({ sims: [0.7], stopAt: 0 }).pick())?.attempt, 0, 'an attempt at the bar ships though the stop came with it');
  assert.equal((await picker({ sims: under, cutOf: 1 }).pick())?.trimmed, true, 'a cut that reads as the script ships');
  assert.deepEqual([[0.5, true], [0.5, false], [0.7, true]].map(([sim, cutShort]) => voice.acceptTake({ best: { sim }, bar: BAR, cutShort })?.sim ?? null),
    [null, 0.5, 0.7], 'acceptTake: under the bar and cut short is dropped; under the bar in full, or at the bar, ships');
  assert.equal(voice.acceptTake({ best: null, bar: BAR, cutShort: false }), null);
  // a cut-short take in a line: the line ends at its aligned prefix, and the following --append plans that take
  const h = harness();
  const take = (i) => (i === 1 ? picker({ sims: under, stopAt: 0 }).pick() : h.take(i));
  const plan = voice.planLine({ previous: [], takes: SCRIPT, append: false, exists: exists(h) });
  const out = await voice.buildLine({ previous: [], plan, take, ship: h.ship, stopped: h.stopped, onError: h.onError });
  assert.deepEqual([h.written, out.shipped, out.takes], [[[0, 'A']], [1], ['built', 'missing', 'missing']], 'the line stops at [A]');
  assert.deepEqual(h.errors, [[1, null]], 'the cut-short take is reported at its index');
  assert.deepEqual(voice.planLine({ previous: out.shipped, takes: SCRIPT, append: true, exists: exists(h) }), { kept: 1, build: [1, 2] },
    '--append tries the cut-short take again in full');
}

// 9. census: build-voices.mjs plans with planLine in both --dry and the build, builds through buildLine only, and picks a
// take through pickTake only (no second attempt loop or stop rule)
{
  const source = readFileSync(new URL('./build-voices.mjs', import.meta.url), 'utf8');
  assert.equal(source.match(/planLine\(/g)?.length, 2, 'build-voices.mjs plans every line with planLine, --dry included');
  assert.equal(source.match(/buildLine\(/g)?.length, 1, 'build-voices.mjs builds a line through buildLine');
  for (const rule of ['shipped.length', 'previous.length', '.slice(kept)', '?.length ?? 0']) {
    assert.ok(!source.includes(rule), `build-voices.mjs keeps no second keep or index rule (${rule})`);
  }
  assert.equal(source.match(/pickTake\(/g)?.length, 1, 'build-voices.mjs bestTake picks through pickTake');
  assert.match(source, /pickTake\(\{[^}]*stopped: \(\) => stop,/, 'pickTake reads the run\'s stop flag');
  for (const rule of ['< attempts', 'stop) return null', 'tried.push(']) {
    assert.ok(!source.includes(rule), `build-voices.mjs keeps no second attempt loop or stop rule (${rule})`);
  }
}

console.log('voicePlan.selftest: file n is script take n; a failed, empty or stopped take ends its line at the aligned prefix and --append resumes there; a take under the bar is dropped only when a stop cut it short; --dry plans alike; moves declared');
