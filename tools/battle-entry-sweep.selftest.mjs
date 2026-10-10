// battle-entry-sweep.selftest.mjs — the per-deploy battle entry sweep's verdicts (2026-10-09, the black-screen lane).
// The browser sweep itself is tools/battle-entry-sweep.mjs; this pins how one run's observations become its verdict.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyControl, classifyRun, lumaStats, WATCHDOG_THRESHOLD } from './battle-entry-sweep.mjs';

const limits = { minLuma: 10, minSd: 2, bandWarn: 9 };
const picture = [{ at: 0.5, mean: 62.3, sd: 21.4 }, { at: 2, mean: 61.4, sd: 20.9 }];
const watchdog = (result, status = 'complete') => ({ status, result });
let passed = 0;

assert.equal(WATCHDOG_THRESHOLD, 6, 'the sweep reports against the game\'s refusal threshold');

{
  const run = classifyRun({ entry: 'revealed', watchdog: watchdog({ before: 26.6, nightRadianceScale: 0.08, rescued: false }), samples: picture }, limits);
  assert.deepEqual(run, { verdict: 'entered', why: '', notes: [] });
  passed++;
}

{
  // production 207, the phone tier at sunset: Cinder Junction entered on a band 1.2 above the refusal threshold
  const run = classifyRun({ entry: 'revealed', watchdog: watchdog({ before: 7.2, rescued: false }), samples: picture }, limits);
  assert.equal(run.verdict, 'entered');
  assert.match(run.notes[0], /band 7\.2 is within 3 of the refusal threshold 6/);
  passed++;
}

{
  // production 207, Mangrove at sunset on the phone tier: the covered entry returned to the Garage
  const run = classifyRun({ entry: 'failed', reason: 'Error: Battlefield scene watchdog could not validate a healthy frame',
    watchdog: watchdog({ before: 4.7, rescued: false, failed: true }, 'failed'), samples: [] }, limits);
  assert.equal(run.verdict, 'refused');
  assert.match(run.why, /could not validate a healthy frame/);
  assert.match(run.notes[0], /band 4\.7/);
  passed++;
}

{
  const run = classifyRun({ entry: 'timeout', reason: 'no reveal and no failure in 240 s', samples: [] }, limits);
  assert.equal(run.verdict, 'stuck');
  passed++;
}

{
  const run = classifyRun({ entry: 'revealed', watchdog: watchdog({ before: 0, after: 18, rescued: true, stage: 'shadows-off' }), samples: picture }, limits);
  assert.equal(run.verdict, 'rescued', 'a compatibility stage changed the picture: never a pass');
  assert.match(run.why, /shadows-off/);
  passed++;
}

{
  const run = classifyRun({ entry: 'revealed', watchdog: watchdog({ before: 3, response: 3, rescued: false, failed: true }, 'failed'), samples: picture }, limits);
  assert.equal(run.verdict, 'refused', 'a refused watchdog row fails the run even if a frame revealed');
  passed++;
}

for (const sample of [{ at: 2, mean: 3.1, sd: 9 }, { at: 5, mean: 48, sd: 0.4 }, { at: 0.5, mean: NaN, sd: NaN }]) {
  const run = classifyRun({ entry: 'revealed', watchdog: watchdog({ before: 20, rescued: false }), samples: [picture[0], sample] }, limits);
  assert.equal(run.verdict, 'black', `a black or flat sample fails the run: ${JSON.stringify(sample)}`);
  passed++;
}

{
  // a loaded machine can leave the entry promise unsettled after a playable reveal: entered, with a note
  const run = classifyRun({ entry: 'revealed', entryPromise: 'unsettled (revealed and playing)',
    watchdog: watchdog({ before: 46, rescued: false }), samples: picture }, limits);
  assert.equal(run.verdict, 'entered');
  assert.deepEqual(run.notes, ['entry promise unsettled (revealed and playing)']);
  passed++;
}

{
  const run = classifyRun({ entry: 'revealed', watchdog: null, samples: picture }, limits);
  assert.equal(run.verdict, 'entered');
  assert.ok(run.notes.some((note) => /no battle watchdog row/.test(note)), 'a missing probe is reported, not hidden');
  passed++;
}

{
  // the negative control (?diagforce=blackout): only a watchdog refusal certifies that the sweep still sees black
  const refused = classifyControl({ entry: 'failed', reason: 'Error: Battlefield scene watchdog could not validate a healthy frame' });
  assert.equal(refused.verdict, 'control-refused');
  for (const run of [{ entry: 'revealed' }, { entry: 'timeout', reason: 'no reveal' },
    { entry: 'failed', reason: 'Error: Player damage panel was not prepared' }]) {
    assert.equal(classifyControl(run).verdict, 'control-missed', `a forced-black run that ${run.entry} is a missed control`);
  }
  passed++;
}

{
  // luma over the centre: a black frame with a bright HUD edge stays black
  const width = 10, height = 10, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, edge = x < 2 || x > 7 || y < 2 || y > 7;
    data[i] = data[i + 1] = data[i + 2] = edge ? 255 : 0; data[i + 3] = 255;
  }
  assert.deepEqual(lumaStats(data, width, height), { mean: 0, sd: 0 });
  passed++;
}

{
  // the sweep is the player's covered path: navigator.webdriver false, the solo time pinned, the covered entry
  const source = readFileSync(new URL('./battle-entry-sweep.mjs', import.meta.url), 'utf8');
  assert.match(source, /Object\.defineProperty\(Navigator\.prototype, 'webdriver', \{ get: \(\) => false/);
  assert.match(source, /localStorage\.setItem\('cot\.battle\.times\.v2'/);
  assert.match(source, /D\.beginSoloBattle\(\{ specId, mapId, randomRoster: false \}\)/);
  assert.match(source, /if \(control\) url\.searchParams\.set\('diagforce', 'blackout'\)/, 'the control forces a black lit pipeline');
  assert.match(source, /r\.control \? r\.verdict === 'control-refused' : r\.verdict === 'entered'/, 'a missed control fails the sweep');
  assert.doesNotMatch(source, /console\.log\([^)]*BYPASS/, 'the protection bypass secret is never printed');
  passed++;
}

console.log(`battle-entry-sweep.selftest: ${passed} verdict cases passed`);
