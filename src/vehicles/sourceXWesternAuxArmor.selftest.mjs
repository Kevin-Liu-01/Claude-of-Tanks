import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';
import { assertConvexArmorOutline } from '../sim/armorOutline.test-support.mjs';
import { ARIETE_X_FAMILY_SCALE as ARIETE_SCALE } from './profiles/arieteXFamilyFrame.ts';
import { c1Point } from './profiles/challenger1XSuppliedFrame.ts';
import { synchronizeSecondWaveXCombatMetadata } from './sourceXSecondWaveSpecs.ts';

// 2026-10-01 (owner: retire frozen pins): the pinned permanent-armor/module/crew/collision digests, the
// whole-model geometry fingerprints and the historical guard-paint and Strv 122 wheel/link inverses that
// reached them are gone; the fleet geometry ledger owns whole-tank change detection. The auxiliary face
// counts, seating, posed traces, air and repeated-synchronization contracts below are live.
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// [hull, turret] auxiliary face counts per X study.
const cases = {
  leo2a6_x: { counts: [20, 0] },
  strv122_x: { counts: [676, 66] },
  ariete_c1_x: { counts: [210, 0] },
  challenger1_x: { counts: [156, 0] },
};
const pose = yaw => tankPoseFromState({ pos: new THREE.Vector3(), yaw: 0, visualPitch: 0,
  visualRoll: 0, turretYaw: yaw, gunPitch: 0 });
const auxiliary = armor => [...armor.hullPlates, ...armor.turretPlates].filter(p => p.surfaceGroup);
const arietePoint = point => point.map(value => value * ARIETE_SCALE);
assert.equal(ARIETE_SCALE, 1.12 * 1.10, 'owner-approved Ariete enlargement is fixed');
const shot = (id, from, to) => traceTank(new THREE.Vector3(...from), new THREE.Vector3(...to), pose(0), TANK_SPECS[id].armor)
  .filter(hit => hit.plate?.surfaceGroup?.startsWith(`${id}:`));
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 4e-6, `${label}: ${a} versus ${b}`);

function triangles(mesh) {
  const a = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
  const point = i => new THREE.Vector3().fromBufferAttribute(a, index ? index.getX(i) : i);
  const result = [];
  for (let i = 0; i < (index?.count ?? a.count); i += 3) {
    const t = new THREE.Triangle(point(i), point(i + 1), point(i + 2));
    if (t.getArea() > 1e-12) result.push(t);
  }
  return result;
}
function distance(point, faces) {
  const closest = new THREE.Vector3();
  return Math.min(...faces.map(face => face.closestPointToPoint(point, closest).distanceTo(point)));
}

for (const [id, expected] of Object.entries(cases)) {
  const armor = TANK_SPECS[id].armor;
  assert.deepEqual([armor.hullPlates.filter(p => p.surfaceGroup).length, armor.turretPlates.filter(p => p.surfaceGroup).length], expected.counts);
  const donor = TANK_SPECS[{ leo2a6_x: 'leo2a6', strv122_x: 'strv122', ariete_c1_x: 'ariete_c1', challenger1_x: 'challenger1' }[id]].armor;
  for (const plate of auxiliary(armor)) {
    assertConvexArmorOutline(plate.verts, `${id}/${plate.surfaceGroup}`);
    const original = [...donor.hullPlates, ...donor.turretPlates].find(p => p.name === plate.name);
    assert.ok(original, `${id}: each replacement uses its actual donor protection family`);
    assert.deepEqual([plate.physicalMm, plate.keMm, plate.ceMm], [original.physicalMm, original.keMm, original.ceMm]);
  }
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 });
    try {
      // Physical stock/posed protection below always uses the real painted tank.
      const hull = tank.root.getObjectByName('hullExternalArmor');
      const turret = tank.root.getObjectByName('turret');
      const native = { hull: triangles(hull), turret: triangles(turret) };
      for (const [owner, plates] of [['hull', armor.hullPlates], ['turret', armor.turretPlates]]) {
        for (const plate of plates.filter(p => p.surfaceGroup)) {
          const center = new THREE.Vector3();
          for (const p of plate.verts) {
            const point = new THREE.Vector3(...p);
            assert.ok(distance(point, native[owner]) < 4e-6, `${id}/${plate.surfaceGroup}: actual stock backs every corner ${p}`);
            center.add(point);
          }
          center.multiplyScalar(1 / plate.verts.length);
          assert.ok(distance(center, native[owner]) < 4e-6, `${id}/${plate.surfaceGroup}: actual stock backs face center`);
          const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...plate.verts[1]).sub(new THREE.Vector3(...plate.verts[0])),
            new THREE.Vector3(...plate.verts[2]).sub(new THREE.Vector3(...plate.verts[0]))).normalize();
          for (const yaw of [0, .37]) {
            tank.root.getObjectByName('rig_turret').rotation.y = yaw;
            tank.root.updateMatrixWorld(true);
            const mesh = owner === 'hull' ? hull : turret;
            const p = center.clone().applyMatrix4(mesh.matrixWorld), direction = n.clone().transformDirection(mesh.matrixWorld);
            const hits = traceTank(p.clone().addScaledVector(direction, .003), p.clone().addScaledVector(direction, -.001), pose(yaw), armor)
              .filter(hit => hit.plate?.surfaceGroup === plate.surfaceGroup);
            assert.equal(hits.length, 1, `${id}/${plate.surfaceGroup}: one actual layer at the posed face`);
            assert.ok(hits[0].point.distanceTo(p) < 4e-6, 'trace and actual native face coincide');
          }
        }
      }
    } finally { tank.dispose(); }
  }
}

// Historical donor slabs floating outside real stock must not be accepted.
for (const [id, x, y, z] of [['leo2a6_x', 1.91003491, .5, 0], ['strv122_x', 1.89504, .5, 2],
  ['ariete_c1_x', 1.82505556, .75, -2], ['challenger1_x', 1.83477273, .6, 0]]) {
  const scale = id === 'ariete_c1_x' ? ARIETE_SCALE : id === 'challenger1_x' ? 1.10 : 1;
  for (const side of [-1, 1]) assert.equal(shot(id, [side * (x * scale + .005), y * scale, z * scale],
    [side * (x * scale - .005), y * scale, z * scale]).length, 0,
    `${id}: old unsupported side slab remains gameplay air`);
}
for (const side of [-1, 1]) {
  const a6 = shot('leo2a6_x', [side * 1.8, 1.08, -1], [side * 1.70, 1.08, -1]);
  assert.equal(a6.length, 1); close(Math.abs(a6[0].point.x), 1.7409, 'source-fitted A6 thin leaf');
  assert.equal(shot('leo2a6_x', [side * 1.8, 1.08, .687], [side * 1.70, 1.08, .687]).length, 0, 'A6 true 51.25mm leaf gap');
  assert.equal(shot('leo2a6_x', [side * 1.90, 1.10, 2.169025], [side * 1.80, 1.10, 2.169025]).length, 0, 'A6 actual 1.08mm heavy-panel seam');
  const ariete = shot('ariete_c1_x', arietePoint([side * 2, .9, .5]), arietePoint([side * 1.48, .9, .5]));
  assert.equal(ariete.length, 1, 'Ariete outer cover does not double-charge its hidden inner sheet');
  close(Math.abs(ariete[0].point.x), 1.805 * ARIETE_SCALE, 'Ariete actual heavy face');
  const gap = shot('ariete_c1_x', arietePoint([side * 2, .9, .405]), arietePoint([side * 1.48, .9, .405]));
  assert.equal(gap.length, 1, 'real Ariete outer gap exposes only the actual inner leaf');
  close(gap[0].point.x, (side < 0 ? -1.529119 : 1.5299605) * ARIETE_SCALE, 'Ariete inner leaf through outer seam');
  for (const [rawZ, rawY, rawX] of [[-90, 40, 76.181099 - .43307], [-90, 58, 76.181099], [-73.365, 40, 70]]) {
    const p = c1Point(side * rawX, rawY, rawZ).map(value => value * 1.10);
    const hits = shot('challenger1_x', [side * 2.2, p[1], p[2]], [side * 1.65, p[1], p[2]]);
    assert.equal(hits.length, 1, 'Challenger field/rim/real course seam charges one exposed inherited family');
    close(hits[0].point.x, p[0], 'Challenger exact recessed sheet or raised rim');
  }
  const roof = shot('strv122_x', [side * .7, 2.6, 1.4], [side * .7, 2.25, 1.4]);
  assert.equal(roof.length, 1); close(roof[0].point.y, 2.3499142857142856, 'Strv actual forward cheek roof, not lower coarse shell');
  assert.equal(shot('strv122_x', [side * .7, 1.60, 1.4], [side * .7, 1.65, 1.4]).length, 0,
    'Strv true under-cheek air stays open');
}
// Startup can synchronize the donor rows repeatedly before its anatomy pass.
// Every invocation must rebuild one authored field, never append cumulatively.
const finalAuxiliary = Object.fromEntries(Object.keys(cases).map(id => [id, hash(auxiliary(TANK_SPECS[id].armor))]));
for (let repeat = 0; repeat < 2; repeat++) {
  synchronizeSecondWaveXCombatMetadata();
  for (const id of Object.keys(cases)) assert.equal(hash(auxiliary(TANK_SPECS[id].armor)), finalAuxiliary[id],
    `${id}: repeated synchronization before finalization retains one exact auxiliary field`);
}
console.log('sourceXWesternAuxArmor: four actual high/low surfaces, panel gaps, nested-sheet single billing, posed cheeks, repeated synchronization and donor protection pass');
