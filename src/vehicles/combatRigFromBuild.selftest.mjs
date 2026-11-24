// One tank on every driver (276 sim-det-trig; Main's ruling on the class of combat data only the visual builder
// computed). A five-minute solo battle verified in Node drifted where a round met a track: the page traced the track
// prisms createTank attached and every authority the legacy rectangles, and the combat pivots were hand numbers the drawn
// rig had left (up to 1.96 m on the Olifant Mk1B). Now tools/gen-combat-anatomy.mjs measures the drawn rig into each id's
// calibration (tools/combat-rig-measure.mjs) and finalizeCombatAnatomy applies it, so per id:
// - the authority fleet's combat data (all of spec.armor and spec.gun: what traceTank, the HE resolution and
//   gunWorldPose read) is, field for field, what the page holds after createTank builds it: the build writes no combat
//   data;
// - the rig measured on today's build is the calibration's: no committed calibration is stale against its builder;
// - and a planted builder write (a visual-only field on the armor) is caught, the negative control;
// - a drawn rig that stands more than 1 um off its authored input publishes the measurement (a turret moved 5 um), and one
//   within 1 um publishes the authored number itself (moved 0.4 um): the measurement proves the drawn rig is that input.
// Builds every tank: MANUAL suite 'fleet' (tools/selftest-tiers.mjs). `--ids=a,b` for a few.
import assert from 'node:assert/strict';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import { ensureAuthorityFleet } from './authorityFleet.ts';
import { getSpec, PRODUCTION_TANK_IDS } from './specs.ts';
import { combatAnatomyCalibration } from './combatAnatomyCalibrationRegistry.ts';
import { MEASURED_EQUAL_M, measureCombatRig } from '../../tools/combat-rig-measure.mjs';
import { authoringRigSpec } from './combatGunRigSeat.ts';

installCanvasFixture();
const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));
const ids = idsArg ? idsArg.slice(6).split(',').filter(Boolean) : [...PRODUCTION_TANK_IDS];
await ensureAuthorityFleet(ids);
const { createTank } = await import('./tankFactory.ts');

/** A plain, ordered copy of combat data (functions and render objects named, typed arrays as arrays). */
function plain(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return typeof value === 'function' ? '[function]' : value;
  if (seen.has(value)) return '[repeat]';
  seen.add(value);
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (value.isObject3D || value.isMaterial || value.isBufferGeometry) return '[render]';
  if (Array.isArray(value)) return value.map((item) => plain(item, seen));
  if (value instanceof Map || value instanceof Set) return [value.constructor.name, ...[...value].map((item) => plain(item, seen))];
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, plain(value[key], seen)]));
}
const combatOf = (spec) => plain({ armor: spec.armor, gun: spec.gun });

/** The first fields where two combat snapshots differ (path: before -> after), at most `limit`. */
function differences(a, b, at = '', out = [], limit = 6) {
  if (out.length >= limit) return out;
  if (Object.is(a, b)) return out;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    out.push(`${at || '.'}: ${JSON.stringify(a)?.slice(0, 80)} -> ${JSON.stringify(b)?.slice(0, 80)}`);
    return out;
  }
  if (Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && a.length !== b.length)) {
    out.push(`${at}: ${Array.isArray(a) ? `${a.length} items` : 'an object'} -> ${Array.isArray(b) ? `${b.length} items` : 'an object'}`);
    return out;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${at}.${key}`, out, limit);
  return out;
}

// the negative control: a builder that writes a visual-only field onto the shared armor is caught by name
{
  const id = ids[0];
  const before = combatOf(getSpec(id));
  const planted = structuredClone(before);
  planted.armor.trackShapes = [{ module: 'trackL', x0: -1.6, x1: -1, poly: [[-2, 0], [2, 0], [2, 1]] }];
  const named = differences(before, planted);
  assert.ok(named.some((line) => line.startsWith('.armor.trackShapes')), `control: a builder-written armor field is named (${named.join('; ')})`);
}

// the rule either side of 1 um: a drawn turret moved off its authored seat is measured where it stands, unless the move is
// under a micron, where the rig is its input and the input is written
{
  const id = ids.find((candidate) => getSpec(candidate).armor?.turretless !== true) ?? ids[0];
  const spec = getSpec(id);
  const input = authoringRigSpec(spec).armor.turretPivot;
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const turret = tank.root.getObjectByName('rig_turret');
    assert.ok(turret, `${id}: a turret to move`);
    const atRest = measureCombatRig(tank, spec).turretPivot;
    assert.deepEqual(atRest, [...input], `${id}: the drawn turret on its seat publishes the authored pivot, bit for bit`);
    turret.position.x += 5e-6;
    const moved = measureCombatRig(tank, spec).turretPivot;
    assert.notEqual(moved[0], input[0], `${id}: a turret drawn 5 um off its seat publishes the measurement`);
    assert.ok(Math.abs(moved[0] - (input[0] + 5e-6)) <= 5e-7, `${id}: to the micron (${moved[0]} for ${input[0]} + 5 um)`);
    turret.position.x -= 5e-6 - 4e-7;
    assert.ok(4e-7 < MEASURED_EQUAL_M, 'control: 0.4 um is inside the rule');
    assert.equal(measureCombatRig(tank, spec).turretPivot[0], input[0], `${id}: a turret 0.4 um off publishes the authored number`);
    turret.position.x -= 4e-7;
  } finally {
    tank.dispose?.();
  }
}

const failures = [];
let measured = 0;
for (const id of ids) {
  const spec = getSpec(id);
  const authority = combatOf(spec);
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const page = combatOf(getSpec(id));
    const written = differences(authority, page);
    if (written.length) failures.push(`${id}: the build writes combat data (${written.join('; ')})`);
    const rig = combatAnatomyCalibration(id)?.rig;
    if (!rig) { failures.push(`${id}: its calibration has no measured rig`); continue; }
    const today = plain(measureCombatRig(tank, spec));
    const stale = differences(plain(rig), today);
    if (stale.length) failures.push(`${id}: the calibration's rig is not today's build (${stale.join('; ')})`);
    measured++;
  } finally {
    tank.dispose?.();
  }
}
assert.deepEqual(failures, [], `combat data the build alone holds, or a stale measured rig:\n${failures.join('\n')}`);
console.log(`combatRigFromBuild.selftest: ${ids.length} id(s): the authority fleet's armour and gun are the page's after the build, `
  + `field for field, and ${measured} measured rig(s) are today's builds; a builder-written armour field is named; a rig 5 um off its `
  + `input publishes the measurement, 0.4 um off the input`);
