// battleResetLeftovers.selftest.mjs — what a cached world carried from one battle into the next (2026-11-02 audit R2).
//
// Worlds are cached and reused; the battle start resets their destruction (map.ts resetDestructibles). Three leftovers:
//   - the Studio turns a world's crush sweeps off while it plans on it (a crush event never sweeps a hull of its own across
//     a prop); switching to another world it stood the old world's crushes up but left its sweeps off, so in a later
//     battle there a remote or late ram crush of a car or a stall landed with no swept crumple: drawn intact, its obstacle
//     a ghost. The Studio's restore (studioCrush.ts) now leaves the world as it found it, sweeps on;
//   - the props' runtime drew a toss's scatter from the build's destruction stream, whose position was never reset: the
//     same toss landed elsewhere per rematch, per peer and per settled restore (the behaviour is pinned on the production
//     runtime in destructibleAuthority.selftest); here, no runtime path draws from that stream any more;
//   - the reset left the water's ripples and the sward's press fields (the hulls' flattened grass) as the last battle left
//     them.
// Not covered here (reported, not changed in this lane): a late joiner's settled props replay as a ram toward +Z
// (mp/presentation/battlePresentation.ts applyDestroyed; the snapshot's destroyed list carries indices only).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStudioCrushes } from '../game/studioCrush.ts';

// ---- the Studio's restore turns the sweeps back on (the world it leaves for another, or at its exit)
const sweeps = [];
const world = (name) => ({
  crushObstacle: () => true, crushProp: () => true, resetDestructibles() {}, advanceDestruction() {},
  setCrushSweeps(on) { sweeps.push(`${name}:${on ? 'on' : 'off'}`); },
});
const a = world('a'), b = world('b');
const crushes = createStudioCrushes();
a.setCrushSweeps(false); // studio.ts syncCrushPlan: the Studio presses with its own hulls on the world it plans on
crushes.setPlan(a, []);
crushes.restore(a); // syncCrushPlan, the Studio's world switched to b
b.setCrushSweeps(false);
crushes.setPlan(b, []);
assert.deepEqual(sweeps, ['a:off', 'a:on', 'b:off'], 'the world the Studio left has its sweeps back for the next battle');
sweeps.length = 0;
crushes.restore(null);
assert.deepEqual(sweeps, [], 'no world, nothing to restore');

// ---- no runtime path draws from the build's destruction stream
const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const runtime = props.slice(props.indexOf('  const D_CELL = 8;'), props.indexOf('\n  return { group, obstacles, colliders,'));
assert.ok(runtime.length > 1000, 'the props runtime section');
assert.ok(!/\bdrng\(\)/.test(runtime), 'the runtime (breaks, tosses, blasts, resets) draws nothing from the build\'s destruction stream');
assert.match(runtime, /if \(old\.spin == null\) \{ old\.spin = tossSpinOf\(old\.index\);/, 'an overflowed toss snaps with its own seeded tumble');

// ---- the reset stills the water and lifts the sward's press
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
const reset = map.slice(map.indexOf('    resetDestructibles: () => {'), map.indexOf('    pressHull: ('));
assert.ok(reset.includes('trackMarks.reset();'), 'the reset section');
assert.match(reset, /terrain\.userData\.resetWater\?\.\(\); setWater\(\[\]\);/, 'the water\'s ripples cleared (its static contacts kept)');
assert.match(reset, /tallGrass\.pressure\?\.clear\(\); tallGrass\.pressureFine\?\.clear\(\);/, 'both press fields back at rest');

// ---- (round 2 U13) no press state on the world's records: a hull's press is its battle's own ledger (sim/crushPress.ts,
// cleared at each battle start); the resets wrote two dead fields onto every trunk and prop record, and a census tool
// deleted them
for (const rel of ['./vegetation.ts', './props.ts', '../../tools/tank-world-contact-census.mjs']) {
  const text = readFileSync(new URL(rel, import.meta.url), 'utf8');
  assert.doesNotMatch(text, /_press[ST]\b/, `${rel}: no _pressS/_pressT field, write or delete`);
}

console.log('battleResetLeftovers.selftest: the Studio\'s sweeps restored, no runtime stream draw, water and sward reset with the world');
