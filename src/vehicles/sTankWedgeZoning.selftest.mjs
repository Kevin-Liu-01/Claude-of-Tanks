// sTankWedgeZoning.selftest.mjs (inherited-reds-276, 2026-11-23; Main's ruling: the S-tank's beak underside is the
// wedge's). The S-tanks' front is zoned by height (ArmorPlate.frontZone, combatAnatomy.ts frontZonePlate): a forward
// hull face above the lower front's top edge reads the wedge (upper_glacis), below it the lower front, whichever way it
// faces. Zoned by facing, the 103B's beak underside read the 65 mm lower front at centre height once 0e6edc9b66's shared
// casemate put it there (fleetBalance: "center-mass shot meets the visible wedge first", red on main c7d111fad4).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import { traceTank } from '../sim/armor.ts';

const S_TANKS = ['udes03', 'strv103a', 'strv103b', 'strv103b_net', 'strv103e', 'strv152'];

/** Every forward frontal hull face that reads against the height zoning: [{ cell, face, reads, expected }]. */
function misZoned(armor) {
  const upper = armor.hullPlates.find((plate) => plate.frontZone === 'upper');
  const lower = armor.hullPlates.find((plate) => plate.frontZone === 'lower');
  const splitY = Math.max(...lower.verts.map((v) => v[1])), rearZ = Math.min(...upper.verts.map((v) => v[2]));
  const out = [];
  armor.collisionShells.hull.forEach((cell, index) => {
    for (const face of cell.faces) {
      const [nx, , nz] = face.normal;
      if (nz < 0.2 || Math.abs(nx) > nz || face.center[2] < rearZ) continue;
      const expected = face.center[1] >= splitY ? upper : lower;
      if (face.plate !== expected) out.push({ cell: index, face, reads: face.plate.name, expected: expected.name });
    }
  });
  return out;
}

let faces = 0;
for (const id of S_TANKS) {
  const armor = TANK_SPECS[id]?.armor;
  assert.ok(armor?.collisionShells?.hull?.length, `${id}: a hull shell to zone`);
  assert.equal(armor.hullPlates.filter((plate) => plate.frontZone === 'upper').length, 1, `${id}: one wedge plate`);
  assert.equal(armor.hullPlates.filter((plate) => plate.frontZone === 'lower').length, 1, `${id}: one lower front`);
  assert.deepEqual(misZoned(armor).map(({ cell, reads, expected }) => `${cell}:${reads}->${expected}`), [],
    `${id}: every forward frontal face reads the front plate of its height`);
  faces += armor.collisionShells.hull.reduce((n, cell) => n + cell.faces.length, 0);

  // the centre-mass shot (the middle of the closed shell's height, fleetBalance's siege line) meets the wedge
  const ys = armor.collisionShells.hull.flatMap((cell) => [cell.min[1], cell.max[1]]);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const pose = { pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
  const first = traceTank(new Vector3(0, y, 10), new Vector3(0, y, -10), pose, armor).find((hit) => hit.kind === 'plate');
  assert.equal(first?.plate.name, 'upper_glacis', `${id}: the centre-mass shot (y ${y.toFixed(3)}) meets the wedge`);
}

// negative control: a forward face above the split planted on the lower front is found
{
  const armor = TANK_SPECS.strv103b.armor;
  const lower = armor.hullPlates.find((plate) => plate.frontZone === 'lower');
  const upper = armor.hullPlates.find((plate) => plate.frontZone === 'upper');
  const splitY = Math.max(...lower.verts.map((v) => v[1])), rearZ = Math.min(...upper.verts.map((v) => v[2]));
  const wedgeFace = (f) => f.plate === upper && f.center[1] > splitY && f.center[2] >= rearZ && f.normal[2] >= 0.2
    && Math.abs(f.normal[0]) <= f.normal[2];
  const cell = armor.collisionShells.hull.find((c) => c.faces.some(wedgeFace));
  const face = cell.faces.find(wedgeFace);
  const planted = { ...armor, collisionShells: { ...armor.collisionShells, hull: armor.collisionShells.hull.map((c) => (c !== cell ? c
    : { ...c, faces: c.faces.map((f) => (f === face ? { ...f, plate: lower } : f)) })) } };
  const found = misZoned(planted);
  assert.equal(found.length, 1, 'the planted mis-zoned face is the one found');
  assert.equal(found[0].reads, 'lower_front');
  assert.equal(found[0].expected, 'upper_glacis');
}

console.log(`sTankWedgeZoning.selftest: ${S_TANKS.length} S-tanks, ${faces} hull faces; forward faces zoned by height, the centre-mass shot meets the wedge; a planted mis-zoned face is found (negative control) PASS`);
