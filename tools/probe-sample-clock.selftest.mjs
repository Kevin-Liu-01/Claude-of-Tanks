// (2026-11-25, tree-breakdown-277) Every frame-budget sample keeps its clock and the machine's thermal state. The third
// A/A of one dist ran chase 1080p 4.4 ms slower in both middle slots, and nothing recorded when each sample ran or how
// hot the machine was, so a slot-position artifact could not be told apart from the machine heating or another job
// starting.
//   thermalState over stub command output: macOS's ProcessInfo level (0-3) and pmset's CPU speed limit; a reading that
//   fails or is out of range is null, never a guess. timedSample on a fake clock: start, end and ms around the
//   measurement, with thermal readings taken before and after it. The planted control stamps the clock after the
//   measurement, and the bracketing judgement must catch it.
//   The probe's page loop measures through timedSample (a source check: it needs a browser to run).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thermalState, timedSample } from './frame-budget-probe.mjs';

const failed = [];
const check = async (name, body) => { try { await body(); console.log(`ok ${name}`); } catch (error) { failed.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`); } };

/** A stub runner: `osascript` prints `level`, `pmset` prints `therm` (or each throws when given an Error). */
const runner = (level, therm) => (file) => {
  const out = file === 'osascript' ? level : file === 'pmset' ? therm : null;
  if (out instanceof Error) throw out;
  return out;
};
const PMSET_LIMITED = 'Note: No thermal warning level has been recorded\nCPU Power notify\n\tCPU_Scheduler_Limit \t= 100\n\tCPU_Available_CPUs \t= 16\n\tCPU_Speed_Limit \t= 72\n';
const PMSET_NOTHING = 'Note: No thermal warning level has been recorded\nNote: No performance warning level has been recorded\nNote: No CPU power status has been recorded\n';

await check('thermalState reads the ProcessInfo level and pmset\'s speed limit; unknown stays null', () => {
  assert.deepEqual(thermalState({ run: runner('1\n', PMSET_LIMITED) }), { level: 1, state: 'fair', speedLimit: 72 });
  assert.deepEqual(thermalState({ run: runner('0\n', PMSET_NOTHING) }), { level: 0, state: 'nominal', speedLimit: null });
  assert.deepEqual(thermalState({ run: runner('3', PMSET_NOTHING) }).state, 'critical');
  assert.deepEqual(thermalState({ run: runner('7', PMSET_NOTHING) }), { level: null, state: null, speedLimit: null }, 'out of range');
  assert.deepEqual(thermalState({ run: runner(new Error('no osascript'), new Error('no pmset')) }), { level: null, state: null, speedLimit: null });
});

/** The judgement: the sample's clock brackets its measurement, and a thermal reading sits at each end. Returns failures. */
function judgeBracketed(sample, ran) {
  const failures = [];
  const start = Date.parse(sample.clock?.start), end = Date.parse(sample.clock?.end);
  if (!(start <= ran.from)) failures.push(`clock start ${sample.clock?.start} is after the measurement began`);
  if (!(end >= ran.to)) failures.push(`clock end ${sample.clock?.end} is before the measurement ended`);
  if (sample.clock?.ms !== end - start) failures.push(`clock ms ${sample.clock?.ms} is not end - start`);
  if (sample.thermal?.start?.at > ran.from || sample.thermal?.end?.at < ran.to) failures.push('a thermal reading is inside the measurement, not at its ends');
  return failures;
}

/** A fake clock that the measurement advances by `ms`, and thermal readings stamped with the time they were taken. */
function fakeMachine(ms = 4200) {
  let t = Date.parse('2026-11-25T07:22:00.000Z');
  const ran = {};
  return {
    ran,
    now: () => new Date(t),
    thermal: () => ({ level: 0, state: 'nominal', speedLimit: null, at: t }),
    measure: async () => { ran.from = t; t += ms; ran.to = t; return { summary: { frames: 241 } }; },
  };
}

await check('timedSample brackets the measurement with its clock and a thermal reading at each end', async () => {
  const m = fakeMachine();
  const sample = await timedSample(m.measure, { now: m.now, thermal: m.thermal });
  assert.deepEqual(judgeBracketed(sample, m.ran), []);
  assert.deepEqual(sample.clock, { start: '2026-11-25T07:22:00.000Z', end: '2026-11-25T07:22:04.200Z', ms: 4200 });
  assert.equal(sample.summary.frames, 241, 'the measurement\'s own fields are kept');
});

await check('planted control: a clock stamped after the measurement is caught', async () => {
  const m = fakeMachine();
  const late = async (measure, { now, thermal }) => {
    const measured = await measure();
    const at = now();
    return { ...measured, clock: { start: at.toISOString(), end: at.toISOString(), ms: 0 }, thermal: { start: thermal(), end: thermal() } };
  };
  const failures = judgeBracketed(await late(m.measure, { now: m.now, thermal: m.thermal }), m.ran);
  assert.ok(failures.some((f) => /after the measurement began/.test(f)), `the judgement flags it (${failures.join('; ') || 'nothing'})`);
});

await check('the probe\'s page loop measures every sample through timedSample', () => {
  const tool = readFileSync(new URL('./frame-budget-probe.mjs', import.meta.url), 'utf8');
  const body = tool.slice(tool.indexOf('async function measureOnPage'), tool.indexOf('export async function runFrameProbe('));
  assert.match(body, /await timedSample\(\(\) => sampleView\(/);
  assert.doesNotMatch(body.replace(/timedSample\(\(\) => sampleView\(/g, ''), /sampleView\(page/, 'no sample is measured outside timedSample');
});

if (failed.length) {
  console.error(`probe-sample-clock: ${failed.length} failed\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log('probe-sample-clock: thermal readings, a bracketing clock on every sample, control caught — ok');
