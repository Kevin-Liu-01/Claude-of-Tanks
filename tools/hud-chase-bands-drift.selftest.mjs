#!/usr/bin/env node
// hud-chase-bands-drift.selftest.mjs — the stale check for the recorded chase bands (guidance-pointers-276).
// First-party tooling: Kevin B. Liu.
//  1. the recorded fixture against itself, and against itself with every box nudged within BANDS_DRIFT_PX and reordered:
//     no drift;
//  2. the negative controls: the phone's right column moved up (the 276 staleness), a box gone, a box added, the ceiling,
//     the rise cap and a whole size missing are each found;
//  3. the browser tool's --check reads this comparison, not an exact match;
//  4. (hud-bands-live-276) the fixture is the live game's: recorded in a battle, every window BAND_SIZES names there with
//     its states (idle, and the controls strip at the mouse windows), and the tool never reads the DOM-only layout page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAND_SIZES, BANDS_DRIFT_PX, bandsDrift } from './hud-chase-bands-drift.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const fixture = JSON.parse(read('./fixtures/hud-chase-bands.json'));
const recorded = fixture.sizes;
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
  // (the phone's rightmost box 240 px up: the 276 staleness, its right column's place)
  const right = moved[phone].idle.floor.reduce((a, b) => (b.x0 > a.x0 ? b : a));
  moved[phone].idle.floor = moved[phone].idle.floor.map((b) => (b === right ? { ...b, y0: b.y0 - 240, y1: b.y1 - 240 } : b));
  const where = `\\[${[right.x0, right.y0, right.x1, right.y1].join(',')}\\]`;
  found(moved, new RegExp(`^390x844 idle floor box ${where} recorded, gone or moved$`), 'the phone\'s right column moved up');
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
  cap[phone].idle.riseCap = (cap[phone].idle.riseCap ?? -100) + 100;
  found(cap, /^390x844 idle rise cap/, 'the rise cap changed or added');
  const capped = Object.entries(recorded).find(([, states]) => states.idle.riseCap !== undefined);
  if (capped) {
    const gone = clone();
    delete gone[capped[0]].idle.riseCap;
    found(gone, new RegExp(`^${capped[0]} idle rise cap`), 'a rise cap gone');
  }
  const size = clone();
  delete size['844x390'];
  found(size, /^844x390 idle missing from the fresh capture$/, 'a size missing');
}

// 3. the tool reads it
{
  const tool = read('./hud-chase-bands.browser.mjs');
  assert.match(tool, /import \{ BAND_BATTLE, BAND_SIZES, BANDS_DRIFT_PX, bandsDrift \} from '\.\/hud-chase-bands-drift\.mjs';/, 'the browser tool imports the comparison');
  assert.match(tool, /const against = only \? [^\n]* : recorded\.sizes;/, '--check compares the whole fixture (a partial run, its own sizes)');
  assert.match(tool, /const drift = bandsDrift\(against, sizes\);/, '--check fails on drift past the tolerance');
  assert.match(tool, /process\.exit\(drift\.length \? 1 : 0\)/, 'and exits 1 on any');
  assert.doesNotMatch(tool, /JSON\.stringify\(recorded\.sizes\) === JSON\.stringify\(sizes\)/, 'not an exact match');
}

// 4. the live game's bands (hud-bands-live-276)
{
  const tool = read('./hud-chase-bands.browser.mjs');
  assert.doesNotMatch(tool, /battle-hud-layout\.html\?|goto\([^)]*battle-hud-layout/, 'the bands are never recorded off the DOM-only layout page');
  assert.match(tool, /mode: 'preview'/, 'a built preview');
  assert.match(tool, /window\.__DEBUG\.beginSoloBattle\(request\)/, 'a real solo battle');
  assert.match(tool, /D\?\.battleBands/, 'the bands battleHudLayout published (src/dev/debugSurface.ts battleBands)');
  assert.equal(fixture.source, 'live', 'the fixture says it was recorded live');
  assert.match(fixture.note, /in a live solo battle .* on a built preview/, 'and its note says where');
  const keys = BAND_SIZES.map(([w, h]) => `${w}x${h}`);
  assert.deepEqual(Object.keys(recorded), keys, 'every window, in the tool\'s order');
  for (const [w, h, touch] of BAND_SIZES) {
    const states = recorded[`${w}x${h}`];
    assert.deepEqual(Object.keys(states), touch ? ['idle'] : ['idle', 'hints'], `${w}x${h}: its states`);
    for (const [state, bands] of Object.entries(states)) {
      assert.deepEqual([bands.width, bands.height, bands.touch], [w, h, touch], `${w}x${h} ${state}: the window it was recorded in`);
      assert.ok(bands.floor.length > 0 && Number.isFinite(bands.ceiling), `${w}x${h} ${state}: a floor and a head band`);
      assert.equal(!!bands.transient?.length, state === 'hints', `${w}x${h} ${state}: the strip transient only while it shows`);
    }
  }
}

console.log(`hud-chase-bands-drift.selftest: the fixture holds within ${BANDS_DRIFT_PX} px of itself; a moved, gone or added box, the head band, the rise cap and a missing size are each found; the fixture is the live game's at ${BAND_SIZES.length} windows`);
