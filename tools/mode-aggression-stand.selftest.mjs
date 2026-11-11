// The aggression harness's stand measure and its planted control as one owner (round 8 Y10 s6-07,
// tools/mode-aggression-stand.mjs). Scripted hulls stepped at SIM_DT in the harness's own order (each tick the stand,
// then the plant; every 30 ticks the engaged sample and the plant's look at it):
//   1. a hull rolls to a stand, stands longer than T_REV and pulls away: the sample at the end of its approach
//      (|speed| under 0.75 m/s at its tick, rolled over 0.375 m in its window) is the stand's (red before: displacement
//      re-decided it, neither still nor pending); the pull-away sample (|speed| over 0.75 m/s at its tick, moved under
//      0.375 m) is a moving sample by the same reading; the stand counts as many samples as the old per-sample
//      measure (--standMinS=0) does, one at each edge traded;
//   2. a hull shoved sideways with still tracks (|state.speed| under 0.75 m/s, more than 0.375 m per sample) stands, by
//      the header's definition: every sample counts (red before: displacement re-decided it);
//   3. a full-throttle reversal is no stand: its slow samples are dropped (a guard, unchanged);
//   4. the stand's transition table, its clock running one way (red before: a tick back in time was taken), and
//      --standMinS=0 counting by displacement as before;
//   5. the planted control: a held hull blocked at 0.05 m/s under full throttle ends 'unproven' at its deadline with a
//      PLANT line the receipt reads as a miss (red before: the control never ended); a planted stand that ends is
//      reported after the first sample past its end, its samples counted in full and that one not credited (red
//      before: the run broke before that sample);
//      a run that ends with the control open says so; a hull destroyed on every try ends unproven; the phase table
//      rejects a move it does not declare;
//   6. --plantStand with --standMinS=0 is refused before the battle loads (red before: the run held its hull to the
//      clock cap and printed no PLANT line);
//   7. a census: the harness keeps no stand or plant field of its own.
// Each case reports apart; the receipt fails with every red case named.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as owner from './mode-aggression-stand.mjs';

const HARNESS = fileURLToPath(new URL('./mode-aggression-harness.mjs', import.meta.url));
const DT = 1 / 60, SAMPLE_TICKS = 30, WINDOW = SAMPLE_TICKS * DT, EPS = 0.75;
const T_REV = (59 + SAMPLE_TICKS) * DT; // the harness's STAND_MIN_TICKS * SIM_DT (pinned there and re-derived by its receipt)
/** The harness's PLANT success line (tools/mode-aggression-harness.selftest.mjs reads it so). */
const PLANT_OK = /stood ([\d.]+) s .*, (under way|destroyed): engaged samples in the stand (\d+), counted (\d+)/;

const failures = [];
const passed = [];
async function check(name, body) {
  try { await body(); passed.push(name); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); }
}

/**
 * Step one scripted hull: `speedAt(t)` is its state.speed (the stand's quantity), `pushAt(t)` a sideways shove outside it
 * (a depenetration push), `aliveAt(t)` its life. Each tick: the stand, then the plant (when given, with its drive read
 * back by `onDrive`); every SAMPLE_TICKS ticks the engaged sample (displacement over 0.5 s) and the plant's look at it.
 */
function drive({ seconds, speedAt, pushAt = () => 0, aliveAt = () => true, minS = T_REV, plant = null, onDrive = () => {}, id = 'h1' }) {
  const stand = owner.createStand({ minS });
  const out = { still: 0, samples: [], reports: [], stand, endedAtTick: null };
  let x = 0, z = 0, prev = null;
  const ticks = Math.round(seconds / DT);
  for (let tick = 1; tick <= ticks; tick++) {
    const t = tick * DT;
    if (plant) onDrive(plant.drive, t);
    const speed = speedAt(t), alive = aliveAt(t);
    x += speed * DT; z += pushAt(t) * DT;
    const commit = stand.step(alive && Math.abs(speed) < EPS, t);
    if (commit) out.still += commit.still;
    if (plant) {
      if (plant.id == null) { if (alive && plant.wants(t)) plant.pick(id, t); }
      else if (!plant.ended) {
        const report = plant.tick({ t, alive, standFromT: stand.fromT, still: out.still });
        if (report) out.reports.push({ t, ...report });
      }
      if (plant.ended) { out.endedAtTick = tick; break; }
    }
    if (tick % SAMPLE_TICKS === 0) {
      if (alive && prev) {
        const moved = Math.hypot(x - prev.x, z - prev.z) / WINDOW;
        const slowSample = moved < EPS;
        if (plant && plant.id === id) plant.noteSample({ t, slowSample });
        const verdict = stand.sample(t, { settled: true, slowSample });
        if (verdict === 'still') out.still++;
        out.samples.push({ t: +t.toFixed(4), speed: +speed.toFixed(3), moved: +moved.toFixed(3), verdict });
      }
      prev = alive ? { x, z } : null;
      if (plant && !plant.ended) {
        const report = plant.afterSample({ t, alive, still: out.still });
        if (report) out.reports.push({ t, ...report });
      }
      if (plant?.ended) { out.endedAtTick = tick; break; }
    }
  }
  return out;
}
/** The same hull under the old per-sample measure (--standMinS=0): every sample that moved under 0.375 m counts. */
const legacyCount = (script) => drive({ ...script, minS: 0 }).still;

// ---- 1. a stand's edges are read at the sample's tick -------------------------------------------------------------------
// 3 m/s, braking at 2.5 m/s^2 from 1 s: |speed| under 0.75 m/s from 1.9 s, at rest at 2.2 s; the sample at 2 s (|speed|
// 0.5 m/s) rolled 0.56 m in its window. Full throttle (2 m/s^2) from 5 s: |speed| past 0.75 m/s at 5.375 s, and the
// sample at 5.5 s (|speed| 1.0 m/s) moved 0.25 m in its window.
const edges = { seconds: 7, speedAt: (t) => (t <= 1 ? 3 : t <= 5 ? Math.max(0, 3 - 2.5 * (t - 1)) : 2 * (t - 5)) };
await check('stand edges', () => {
  const run = drive(edges);
  const at = (t) => run.samples.find((sample) => Math.abs(sample.t - t) < 1e-6);
  const approach = at(2), pullAway = at(5.5);
  assert.ok(approach.speed < EPS && approach.moved >= EPS, `the scripted approach sample: |speed| ${approach.speed}, moved ${approach.moved} m/s`);
  assert.ok(pullAway.speed >= EPS && pullAway.moved < EPS, `the scripted pull-away sample: |speed| ${pullAway.speed}, moved ${pullAway.moved} m/s`);
  assert.equal(approach.verdict, 'pend', `the approach's last sample is the stand's, held while it is young (got ${approach.verdict}): ${JSON.stringify(run.samples)}`);
  assert.equal(pullAway.verdict, 'none', `the pull-away sample is a moving sample (got ${pullAway.verdict})`);
  const inStand = run.samples.filter((sample) => sample.t >= 2 - 1e-9 && sample.t <= 5 + 1e-9).length;
  assert.equal(run.still, inStand, `the stand's ${inStand} samples (2 s .. 5 s) all count (${run.still})`);
  assert.equal(run.still, legacyCount(edges), `as many as the old per-sample measure counts on this stand (${legacyCount(edges)})`);
});

// ---- 2. a hull shoved with still tracks stands ---------------------------------------------------------------------------
// |state.speed| 0 throughout; a sideways push of 1 m/s from 1 s to 4 s (more than 0.375 m per sample), then rest to 6 s.
const shoved = { seconds: 6, speedAt: () => 0, pushAt: (t) => (t > 1 && t <= 4 ? 1 : 0) };
await check('shoved stand', () => {
  const run = drive(shoved);
  const pushed = run.samples.filter((sample) => sample.moved >= EPS);
  assert.ok(pushed.length >= 5, `the push moves the hull over 0.375 m a sample (${pushed.length} samples)`);
  assert.deepEqual(pushed.map((sample) => sample.verdict).filter((verdict) => verdict !== 'still' && verdict !== 'pend'), [],
    `a sample in a stand is the stand's whatever it moved: ${JSON.stringify(pushed)}`);
  assert.equal(run.still, run.samples.length, `every sample of the 6 s stand counts (${run.still} of ${run.samples.length})`);
});

// ---- 3. a reversal is no stand -------------------------------------------------------------------------------------------
// -2 m/s, then full throttle from 1 s at 1.5 m/s^2: |speed| under 0.75 m/s for 1 s (inside T_REV), then under way.
const reversal = { seconds: 5, speedAt: (t) => (t <= 1 ? -2 : Math.min(3, -2 + 1.5 * (t - 1))) };
await check('reversal', () => {
  const run = drive(reversal);
  assert.ok(run.samples.some((sample) => sample.verdict === 'pend'), `its slow samples are held while the stretch is young: ${JSON.stringify(run.samples)}`);
  assert.equal(run.still, 0, 'and dropped when it ends inside T_REV');
});

// ---- 4. the stand's table, its clock, the old measure ------------------------------------------------------------------
await check('stand table', () => {
  assert.deepEqual(owner.STAND_STATES, ['moving', 'young', 'standing'], 'the stand\'s states');
  assert.deepEqual(owner.STAND_EDGES, { moving: ['moving', 'young'], young: ['young', 'standing', 'moving'], standing: ['standing', 'moving'] });
  const minS = 1;
  const stand = owner.createStand({ minS });
  const at = (slow, t) => { const commit = stand.step(slow, t); return [stand.state, commit]; };
  assert.deepEqual(at(false, 0.1), ['moving', null], 'moving, fast: moving');
  assert.deepEqual(at(true, 0.2), ['young', null], 'moving, slow: young');
  assert.equal(stand.sample(0.2, { settled: true, slowSample: true }), 'pend', 'a young stand holds its sample');
  assert.equal(stand.sample(0.2, { settled: false, slowSample: false }), 'pend', 'whatever the sample moved');
  assert.deepEqual(at(true, 1.2), ['young', null], 'young until minS has passed');
  assert.deepEqual(at(true, 1.25), ['standing', { still: 2, settledStill: 1 }], 'young, past minS: standing, its samples committed');
  assert.equal(stand.sample(1.25, { settled: true, slowSample: false }), 'still', 'a standing sample counts');
  assert.deepEqual(at(false, 1.3), ['moving', null], 'standing, fast: moving');
  assert.equal(stand.sample(1.5, { settled: true, slowSample: true }), 'none', 'a sample after the stand\'s end is a moving one, whatever it moved');
  assert.deepEqual(at(true, 2.1), ['young', null]);
  assert.equal(stand.sample(2.1, { settled: true, slowSample: true }), 'pend');
  assert.deepEqual(at(false, 2.2), ['moving', null], 'young, fast: moving, its samples dropped');
  assert.equal(stand.sample(2.5, { settled: true, slowSample: true }), 'none', 'and leaves nothing pending');
  assert.deepEqual(at(true, 2.6), ['young', null]);
  assert.deepEqual(at(true, 3.7), ['standing', null], 'nothing pending: nothing to commit');
  assert.throws(() => stand.step(true, 3.0), /back|forward|earlier/i, 'a tick earlier than the last is refused');
  assert.throws(() => stand.sample(3.0, { settled: true, slowSample: true }), /earlier/i, 'and a sample before it');
  const off = owner.createStand({ minS: 0 });
  assert.deepEqual([off.step(true, 0.1), off.state], [null, 'moving'], 'no stand measure: the stand never starts');
  assert.deepEqual([off.sample(0.5, { settled: true, slowSample: true }), off.sample(1, { settled: true, slowSample: false })], ['still', 'none'],
    '--standMinS=0 counts the samples that moved under 0.375 m, as before');
});

// ---- 5. the planted control ------------------------------------------------------------------------------------------
const plantOf = (options = {}) => owner.createPlant({ standS: 3, fromS: 0, minS: T_REV, ...options });
/** A planted hull: under way at 3 m/s, braked to rest in 1 s once held, then (driven off) `leave(t - leftAt)`. */
function planted(plant, { leave, aliveAt, seconds = 60 }) {
  let heldAt = null, leftAt = null;
  return drive({ seconds, plant, aliveAt,
    onDrive: (drive, t) => { if (drive === 'hold' && heldAt == null) heldAt = t; if (drive === 'go' && leftAt == null) leftAt = t; },
    speedAt: (t) => (heldAt == null ? 3 : leftAt == null ? Math.max(0, 3 - 3 * (t - heldAt)) : leave(t - leftAt)) });
}
await check('plant blocked', () => {
  const plant = plantOf();
  const run = planted(plant, { leave: () => 0.05 }); // full throttle into an obstacle: |speed| pinned at 0.05 m/s
  const line = run.reports.at(-1)?.line ?? '';
  assert.equal(plant.phase, 'unproven', `a blocked hull's control ends unproven at its deadline (phase ${plant.phase}, ${run.reports.length} report(s))`);
  assert.match(line, /^PLANT h1 unproven: .*never ended/, `with a PLANT line naming the cause: ${line}`);
  assert.doesNotMatch(line, PLANT_OK, 'which the receipt reads as a miss');
  assert.ok(run.endedAtTick * DT < 30, `inside the deadline after the hold (${(run.endedAtTick * DT).toFixed(1)} s)`);
});
await check('plant last sample', () => {
  const plant = plantOf();
  const run = planted(plant, { leave: (s) => 2 * s }); // driven off at 2 m/s^2
  const done = run.reports.at(-1);
  assert.equal(plant.phase, 'done', `the control completes (${plant.phase}: ${done?.line})`);
  const m = PLANT_OK.exec(done.line);
  assert.ok(m, `a PLANT line the receipt reads: ${done.line}`);
  assert.equal(Number(m[3]), Number(m[4]), `every sample of the stand counted: ${done.line}`);
  const after = run.samples.at(-1), before = run.samples.at(-2);
  assert.ok(Math.abs(done.t - after.t) < 1e-6 && after.speed >= EPS,
    `reported at the first sample past the stand's end (|speed| ${after.speed}, moved ${after.moved}): ${JSON.stringify(run.samples.slice(-3))}`);
  assert.deepEqual([before.verdict, after.verdict], ['still', 'none'], 'the stand\'s last sample counted, the pull-away not');
  assert.ok(Number(m[1]) >= 3, `it stood the planted 3 s (${m[1]})`);
});
await check('plant run end', () => {
  const plant = plantOf({ fromS: 50 });
  drive({ seconds: 10, plant, speedAt: () => 3 });
  const report = plant.finish('the clock cap 10 s');
  assert.equal(plant.phase, 'unproven', 'a control still open when the run ends is closed unproven');
  assert.match(report?.line ?? '', /^PLANT none unproven: the run ended \(the clock cap 10 s\) while waiting/, `and says so: ${report?.line}`);
  assert.equal(plant.finish('again'), null, 'once');
});
await check('plant destroyed', () => {
  const plant = plantOf({ maxTries: 2 });
  const run = planted(plant, { leave: () => 0, aliveAt: (t) => t < 2 || (t > 2.5 && t < 4.5), seconds: 30 });
  assert.match(run.reports[0]?.line ?? '', /^PLANT h1 destroyed .*planting the next hull/, `a hull destroyed is replaced: ${run.reports[0]?.line}`);
  assert.equal(plant.phase, 'unproven', `destroyed on every try ends unproven (${plant.phase}: ${run.reports.at(-1)?.line})`);
  assert.match(run.reports.at(-1).line, /^PLANT h1 unproven: destroyed/, run.reports.at(-1).line);
});
await check('plant table', () => {
  assert.deepEqual(owner.PLANT_PHASES, ['waiting', 'holding', 'leaving', 'closing', 'done', 'unproven']);
  assert.deepEqual(owner.PLANT_EDGES, {
    waiting: ['holding', 'unproven'], holding: ['leaving', 'waiting', 'unproven'], leaving: ['closing', 'waiting', 'unproven'],
    closing: ['done', 'unproven'], done: [], unproven: [],
  });
  const plant = plantOf();
  assert.throws(() => plant.tick({ t: 1, alive: true, standFromT: null, still: 0 }), /waiting/, 'no tick before a hull is picked');
  plant.pick('h1', 1);
  assert.throws(() => plant.pick('h2', 1.1), /holding/, 'a second pick is refused');
  // a held hull whose stand never begins (a guard: the brake's static hold stops a hull on any drivable grade)
  for (let t = 1; t < 12; t += DT) { if (plant.tick({ t, alive: true, standFromT: null, still: 0 })) break; }
  assert.equal(plant.phase, 'unproven', 'a stand that never begins ends unproven at its deadline');
});

// ---- 6. the refusal ------------------------------------------------------------------------------------------------------
await check('refusal (owner)', () => {
  assert.match(owner.plantOptionsError({ plantStandS: 3, standMinS: 0 }) ?? '', /--plantStand.*--standMinS=0/, 'the owner names the clash');
  assert.equal(owner.plantOptionsError({ plantStandS: 3, standMinS: T_REV }), null);
  assert.equal(owner.plantOptionsError({ plantStandS: 0, standMinS: 0 }), null);
});
await check('refusal (harness)', async () => {
  const result = await new Promise((done) => {
    const child = spawn(process.execPath, ['--max-old-space-size=4096', HARNESS, 'run', '--mode=standard', '--seed=1', '--player=m60a2',
      '--standMinS=0', '--plantStand=3', '--capS=60'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (chunk) => { err += chunk; });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 300_000);
    child.on('close', (code, signal) => { clearTimeout(timer); done({ code, signal, err }); });
  });
  assert.equal(result.code, 2, `the harness refuses the run (exit ${result.code ?? result.signal}; ${result.err.split('\n').filter((line) => line.startsWith('PLANT')).join(' | ') || 'no PLANT line'})`);
  assert.match(result.err, /--plantStand.*--standMinS=0/, 'naming the clash');
});

// ---- 7. census -------------------------------------------------------------------------------------------------------------
await check('census', () => {
  const harness = readFileSync(HARNESS, 'utf8');
  assert.doesNotMatch(harness, /\b(?:slowFromT|pendingStill|pendingSettledStill)\b/, 'the harness keeps no stand field of its own');
  assert.doesNotMatch(harness, /\bplant\.\w+\s*=[^=]|Object\.assign\(plant\b/, 'and writes no plant field');
  assert.match(harness, /stand: createStand\(\{ minS: STAND_MIN_S \}\)/, 'every hull\'s stand is the owner\'s');
  assert.match(harness, /plantOptionsError\(/, 'its options are judged by the owner before the battle loads');
  assert.match(harness, /sample\(t\);\n\s*const report = PLANT_STAND_S[^\n]*\? plant\.afterSample\(/, 'the control looks at each sample before it ends the run');
  assert.match(harness, /plant\.finish\(/, 'and closes a control the run outlived');
});

console.log(`mode-aggression-stand.selftest: ${passed.length} case(s) pass${passed.length ? ` (${passed.join(', ')})` : ''}`);
assert.deepEqual(failures, [], `red cases:\n  ${failures.join('\n  ')}`);
console.log('mode-aggression-stand.selftest: a sample is its stand\'s when its tick lies in the stand, whatever it moved (both edges read so, '
  + 'a shoved hull stands); a reversal is none; a planted control ends done after the first sample past its stand or unproven with its '
  + 'cause; --plantStand needs the stand measure');
