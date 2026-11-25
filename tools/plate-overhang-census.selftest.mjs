// Plate overhang receipt (hull-plates-fit-277; Main, fire-center-277: the T95's, M46's and M47's hull plates ran 18 to 27 %
// past their drawn bows). First-party tooling: Kevin B. Liu. Three parts:
//  1. the census catches the defect: the T95's authored track pair (+-3.81 m round its origin, its hull drawn 1.7 m behind
//     it) stands 1.9 m past the drawn bow, the seated pair does not;
//  2. the seating (combatAnatomy.ts seatPlatesOnTrack): the three named hulls' track plates lie on their measured prisms'
//     outermost faces over the drawn run (the T95 on its outer track of two), keep their height band and armour, and the
//     prisms carry that armour; the T95's wreck hull box ends at its drawn bow;
//  3. the fleet: no untraced plate of any saved id stands past its frame's drawn envelope (the census fails listing ids).
import assert from 'node:assert/strict';
import { plateOverhangCensus, plateOverhangRows } from './plate-overhang-census.mjs';
import { plateOverhangTolM } from '../src/vehicles/combatAnatomy.ts';
import { wreckTurretProfile } from '../src/sim/wreckTurrets.ts';

const census = await plateOverhangCensus();
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { combatAnatomyCalibration } = await import('../src/vehicles/combatAnatomyCalibrationRegistry.ts');

assert.equal(plateOverhangTolM(3), 0.10, '10 cm on a short hull');
assert.ok(Math.abs(plateOverhangTolM(8) - 0.24) < 1e-12, '3 % of a long hull');

// 1. The negative control: the T95's pair as specHelpers communityArmor authors it.
const t95 = TANK_SPECS.t95;
const authoredPair = (plate) => {
  const right = plate.name === 'track_R';
  const x = right ? 1.97 : -1.97;
  return { ...plate, verts: right
    ? [[x, 0.15, 3.81], [x, 0.15, -3.81], [x, 1.08, -3.81], [x, 1.08, 3.81]]
    : [[x, 0.15, -3.81], [x, 0.15, 3.81], [x, 1.08, 3.81], [x, 1.08, -3.81]] };
};
const authored = { ...t95, armor: { ...t95.armor,
  hullPlates: t95.armor.hullPlates.map((plate) => (/^track_[LR]$/.test(plate.name) ? authoredPair(plate) : plate)) } };
const before = plateOverhangRows(authored, combatAnatomyCalibration('t95')).filter((row) => row.off);
assert.deepEqual(before.map((row) => `${row.plate} ${row.face}`).sort(), ['track_L +z', 'track_R +z'],
  'the census flags the authored T95 pair past the bow');
assert.ok(before.every((row) => row.overM > 1.8 && row.why === 'trackPair'), 'by the 1.9 m fire-center-277 measured');
assert.deepEqual(plateOverhangRows(t95, combatAnatomyCalibration('t95')).filter((row) => row.off), [],
  'the seated T95 pair stands on the build');

// 2. The seating on the three named hulls.
for (const id of ['t95', 'm46_patton', 'm47_patton']) {
  const armor = TANK_SPECS[id].armor;
  for (const plate of armor.hullPlates.filter((p) => p.name === 'track_R' || p.name === 'track_L')) {
    const side = armor.trackShapes.filter((shape) => shape.module === plate.moduleLink);
    const right = plate.moduleLink === 'trackR';
    const face = right ? Math.max(...side.map((s) => s.x1)) : Math.min(...side.map((s) => s.x0));
    const run = side.flatMap((s) => s.poly.map((point) => point[0]));
    assert.ok(plate.verts.every((v) => v[0] === face), `${id}: ${plate.name} on its outermost prism face (${face})`);
    assert.deepEqual([Math.min(...plate.verts.map((v) => v[2])), Math.max(...plate.verts.map((v) => v[2]))],
      [Math.min(...run), Math.max(...run)], `${id}: ${plate.name} spans the drawn run`);
    assert.ok(plate.verts.every((v) => v[1] >= 0.1 && v[1] <= 1.2), `${id}: ${plate.name} keeps its height band`);
    const prism = armor.trackShapes.find((shape) => shape.module === plate.moduleLink);
    assert.deepEqual([prism.plate.physicalMm, prism.plate.keMm, prism.plate.ceMm], [plate.physicalMm, plate.keMm, plate.ceMm],
      `${id}: the ${plate.moduleLink} prism carries ${plate.name}'s armour`);
  }
}
const t95Wreck = wreckTurretProfile(t95);
const t95Hull = combatAnatomyCalibration('t95').hull;
const bow = t95Wreck.hullCenter[2] + t95Wreck.hullHalf[2];
assert.ok(Math.abs(bow - t95Hull.max[2]) <= plateOverhangTolM(t95Hull.max[2] - t95Hull.min[2]),
  `the T95's wreck hull box ends at its drawn bow (${bow.toFixed(2)} vs ${t95Hull.max[2].toFixed(2)})`);

// 3. The fleet.
assert.ok(census.ids.length >= 300 && census.rows.some((row) => row.why === 'trackPair')
  && census.rows.some((row) => row.why === 'mainUnderCells'), 'the census reads the whole saved fleet, both kinds');
assert.deepEqual(census.offIds, [], `untraced plates past the drawn build: ${census.off.map((row) =>
  `${row.id} ${row.owner} ${row.plate} ${row.overM} m ${row.face}`).join('; ')}`);

console.log(`plate-overhang-census.selftest: ${census.ids.length} ids, ${census.rows.length} untraced plates on the build; `
  + 'the T95, M46 and M47 track pairs seated');
