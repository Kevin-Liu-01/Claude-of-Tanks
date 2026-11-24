#!/usr/bin/env node
// hud-chase-bands-drift.selftest.mjs — the stale check for the recorded chase bands (guidance-pointers-276).
// First-party tooling: Kevin B. Liu.
//  1. the recorded fixture against itself, and against itself with every box nudged within BANDS_DRIFT_PX and reordered:
//     no drift;
//  2. the negative controls: the phone's right column moved up (the 276 staleness), a box gone, a box added, the ceiling,
//     the rise cap and a whole size missing are each found;
//  3. the browser tool's --check reads this comparison, not an exact match.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANDS_DRIFT_PX, bandsDrift } from './hud-chase-bands-drift.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const recorded = JSON.parse(read('./fixtures/hud-chase-bands.json')).sizes;
const clone = () => JSON.parse(JSON.stringify(recorded));

// 1. within tolerance
assert.deepEqual(bandsDrift(recorded, recorded), [], 'the fixture against itself: no drift');
{
  const nudged = clone();
  for (const states of Object.values(nudged)) for (const bands of Object.values(states)) {
    bands.floor = bands.floor.map((b, i) => ({ x0: b.x0 + (i % 2 ? 3 : -3), y0: b.y0 + 2, x1: b.x1 - 1, y1: b.y1 + BANDS_DRIFT_PX })).reverse();
    bands.ceiling += 2;
  }
  assert.deepEqual(bandsDrift(recorded, nudged), [], `every box within ${BANDS_DRIFT_PX} px, in another order: no drift`);
}

// 2. the negative controls
const phone = '390x844';
const found = (fresh, pattern, why) => {
  const drift = bandsDrift(recorded, fresh);
  assert.ok(drift.some((d) => pattern.test(`${d.size} ${d.state} ${d.what}`)), `control: ${why} (${JSON.stringify(drift).slice(0, 200)})`);
};
{
  const moved = clone();
  moved[phone].idle.floor = moved[phone].idle.floor.map((b) => (b.x0 === 324 ? { ...b, y0: b.y0 - 240, y1: b.y1 - 240 } : b));
  found(moved, /^390x844 idle floor box \[324,468,376,520\] recorded, gone or moved$/, 'the phone\'s right column moved up');
  const one = clone();
  one[phone].idle.floor[0] = { ...one[phone].idle.floor[0], y0: one[phone].idle.floor[0].y0 + BANDS_DRIFT_PX + 1 };
  found(one, /floor box .* recorded, gone or moved/, 'one edge past the tolerance');
  const gone = clone();
  gone[phone].idle.floor.pop();
  found(gone, /recorded, gone or moved/, 'a box gone');
  const added = clone();
  added[phone].idle.floor.push({ x0: 10, y0: 10, x1: 50, y1: 50 });
  found(added, /fresh, not recorded/, 'a box added');
  const ceiling = clone();
  ceiling[phone].idle.ceiling += 20;
  found(ceiling, /^390x844 idle ceiling/, 'the head band moved');
  const cap = clone();
  delete cap[phone].idle.riseCap;
  found(cap, /^390x844 idle rise cap/, 'the rise cap gone');
  const size = clone();
  delete size['844x390'];
  found(size, /^844x390 idle missing from the fresh capture$/, 'a size missing');
}

// 3. the tool reads it
{
  const tool = read('./hud-chase-bands.browser.mjs');
  assert.match(tool, /import \{ BANDS_DRIFT_PX, bandsDrift \} from '\.\/hud-chase-bands-drift\.mjs';/, 'the browser tool imports the comparison');
  assert.match(tool, /bandsDrift\(recorded\.sizes, sizes\)/, '--check fails on drift past the tolerance');
  assert.doesNotMatch(tool, /JSON\.stringify\(recorded\.sizes\) === JSON\.stringify\(sizes\)/, 'not an exact match');
}

console.log(`hud-chase-bands-drift.selftest: the fixture holds within ${BANDS_DRIFT_PX} px of itself; a moved, gone or added box, the head band, the rise cap and a missing size are each found`);
