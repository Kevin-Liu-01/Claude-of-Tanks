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
//     them (round 2: proven on the real fields through map.ts's and terrain.ts's own reset code; the Studio's seek decided).
// Not covered here: a late joiner's settled props (mp/presentation/battlePresentation.ts applyDestroyed). They replayed
// as a ram toward +Z while the snapshot's destroyed list carried indices only; round 2 (U27) gave each index its fall
// (wire 11, sim/obstacleFall.ts), so they lie as they fell, a withheld fall along the prop's own heading
// (mp/presentation/settledFalls.selftest).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStudioCrushes } from '../game/studioCrush.ts';
import { createGroundPressureField, GROUND_PRESSURE_FINE_WINDOW_M } from './groundPressure.ts';
import { createWaterRippleField } from './waterRipples.ts';

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

// ---- the reset stills the water and lifts the sward's press: map.ts's own resetDestructibles and terrain.ts's own water
// reset, compiled from the source, over real press and ripple fields (a recording renderer, no WebGL). (round 2 Q13: this
// was a source regex alone.) And (round 2 U27, decided) the Studio's reset of its battlefield runs the same reset: a
// backward seek past a crush it applied starts from still water and an unpressed sward (the traces are transient, a kept
// trail would be the take's later one), as it starts from unmarked ground
function recordingRenderer() {
  let target = null;
  return {
    autoClear: true, renders: 0,
    getRenderTarget() { return target; },
    setRenderTarget(value) { target = value; },
    render() { this.renders++; },
  };
}
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
const resetAt = map.indexOf('    resetDestructibles: () => {');
const resetArrow = map.slice(resetAt + '    resetDestructibles: '.length, map.indexOf('\n    pressHull: (', resetAt)).trim().replace(/,$/, '');
assert.ok(resetArrow.startsWith('() => {') && resetArrow.includes('trackMarks.reset();'), 'map.ts resetDestructibles');
const facadeReset = new Function('groundCoverCraters', 'props', 'vegetation', 'trackMarks', 'terrain', 'setWater', 'tallGrass',
  `return (${resetArrow});`);
const terrainSource = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const waterReset = terrainSource.match(/group\.userData\.resetWater = (\(\) => \{[^\n]*\});/);
assert.ok(waterReset, 'terrain.ts resetWater');
const terrainWaterReset = new Function('water', `return (${waterReset[1]});`);
function battlefield() {
  const log = [];
  const pressure = createGroundPressureField(recordingRenderer(), { tier: 'desktop' });
  const pressureFine = createGroundPressureField(recordingRenderer(), { tier: 'desktop', windowM: GROUND_PRESSURE_FINE_WINDOW_M });
  const ripples = createWaterRippleField(recordingRenderer(), { tier: 'desktop' });
  const water = { ripples, setDisturbances: (list) => { ripples.setDisturbances(list); log.push(`wakes:${list.length}`); } };
  const reset = facadeReset(
    { resetHoles: () => log.push('holes') }, { resetDestructibles: () => log.push('props') },
    { resetToppled: () => log.push('trees') }, { reset: () => log.push('marks') },
    { userData: { resetWater: terrainWaterReset(water) } }, (list) => log.push(`sheet:${list.length}`),
    { pressure, pressureFine });
  /** A hull drove through the grass and the shallows. */
  const drive = () => {
    const hull = [{ x: 4, z: -2, dirX: 0, dirZ: 1, speed: 6, halfLength: 3.4, halfWidth: 1.8 }];
    for (const field of [pressure, pressureFine]) { field.setDisturbances(hull); field.step(1 / 30, 0, 0); }
    water.setDisturbances([{ x: 4, z: -2, strength: 1, dirX: 0, dirZ: 1, speed: 6 }]);
    ripples.step(0.1, 0, 0);
  };
  const atRest = () => [pressure, pressureFine, ripples].map((field) => field.params.w === 0)
    .concat([pressure.stateUniform.value === null, pressureFine.stateUniform.value === null]);
  return { log, pressure, pressureFine, ripples, reset, drive, atRest };
}
{
  const b = battlefield();
  b.drive();
  assert.deepEqual(b.atRest(), [false, false, false, false, false], 'the hull pressed both sward fields and rippled the water');
  b.log.length = 0;
  b.reset();
  assert.deepEqual(b.atRest(), [true, true, true, true, true], 'the reset lifts both press fields and stills the ripples');
  assert.deepEqual(b.log, ['holes', 'props', 'trees', 'marks', 'wakes:0', 'sheet:0'],
    'with the holes, props, trees and marks, the wakes and the sheet\'s disturbances cleared');
  b.pressure.step(1 / 60, 0, 0);
  assert.equal(b.pressure.params.w, 1, 'and the next battle presses it again');
}
{
  // the Studio: a backward seek past a crush it applied resets its battlefield through the same facade reset
  const b = battlefield();
  const record = { kind: 'fence', crushable: true };
  const studioWorld = {
    crushObstacle: () => true, crushProp: () => true, advanceDestruction() {}, resetDestructibles: b.reset,
  };
  const studio = createStudioCrushes();
  studio.setPlan(studioWorld, [{ tMs: 2000, record, crushable: -1, dirX: 1, dirZ: 0, speedMps: 8 }]);
  studio.advanceTo(studioWorld, 3000); // played past the crush
  b.drive();
  studio.settleTo(studioWorld, 500); // seeked back before it
  assert.deepEqual(b.atRest(), [true, true, true, true, true],
    'the seek starts from still water and an unpressed sward (decided: the traces are transient; the take presses them again)');
}

// ---- (round 2 U13) no press state on the world's records: a hull's press is its battle's own ledger (sim/crushPress.ts,
// cleared at each battle start); the resets wrote two dead fields onto every trunk and prop record, and a census tool
// deleted them
for (const rel of ['./vegetation.ts', './props.ts', '../../tools/tank-world-contact-census.mjs']) {
  const text = readFileSync(new URL(rel, import.meta.url), 'utf8');
  assert.doesNotMatch(text, /_press[ST]\b/, `${rel}: no _pressS/_pressT field, write or delete`);
}

console.log('battleResetLeftovers.selftest: the Studio\'s sweeps restored, no runtime stream draw, water and sward reset with the world');
