// The Chieftain marks on the source-built Mk 5 X (release 268, owner 2026-11-02: "also update the cheiftainn mk 3 and
// mk 9"): the Mk 3 (chieftain3) and the Mk 9 (chieftain_mk9) are the Mk 5 X's castings and running gear with their own
// fittings (profiles/chieftainMarksX.ts), never a second casting, and the Mk 9 carries no Stillbrew (Mk 10 onward).
// The pre-268 receipt here pinned the retired uk.ts owner-rebuild turret (its shell receipts and seat datums); that
// build is gone. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { CHIEFTAIN5_X_DATUMS } from './chieftain5X.ts';

const D = CHIEFTAIN5_X_DATUMS.chieftain5;

/** A geometry's position bytes as a short digest. */
function digest(g) {
  const p = g.attributes.position.array;
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h * 31 + Math.round(p[i] * 1e5)) | 0;
  return `${p.length}:${h}`;
}

/** One HIGH build's authored parts by bucket (bounds and bytes in the bucket's own frame, before the factory's seat,
 * which reads the generated turret-ring receipt), and its rigs. */
function survey(id) {
  const parts = [];
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true,
    partCensus(bucket, g, source) {
      if (source !== 'add') return;
      g.computeBoundingBox();
      parts.push({ bucket, min: g.boundingBox.min.clone(), max: g.boundingBox.max.clone(), bytes: digest(g),
        stillbrew: g.userData.chieftain10Stillbrew });
    } });
  try {
    const castings = (bucket) => parts.filter((p) => p.bucket === bucket).map((p) => p.bytes).join('|');
    const rig = (name) => tank.root.getObjectByName(name).position.toArray().map((v) => +v.toFixed(6));
    return { parts, hull: castings('hull'), turret: castings('turret'), rigTurret: rig('rig_turret'),
      rigGun: rig('rig_gun'), wheels: tank.root.getObjectByName('rig_hull').userData.nativeRoadWheelStations };
  } finally { tank.dispose(); }
}

const count = (s, bucket, test = () => true) => s.parts.filter((p) => p.bucket === bucket && test(p)).length;
const mk5 = survey('chieftain5'), mk3 = survey('chieftain3'), mk9 = survey('chieftain_mk9');
const bore = D.trunnion;

for (const [id, s] of [['chieftain3', mk3], ['chieftain_mk9', mk9]]) {
  // The same castings, ring and trunnion as the Mk 5 X: the marks share them byte for byte.
  assert.equal(s.hull, mk5.hull, `${id}: the Mk 5 X hull casting`);
  assert.equal(s.turret, mk5.turret, `${id}: the Mk 5 X turret casting`);
  assert.deepEqual(s.rigTurret, mk5.rigTurret, `${id}: the Mk 5 X ring`);
  assert.deepEqual(s.rigGun, mk5.rigGun, `${id}: the Mk 5 X trunnion`);
  assert.equal(s.wheels, 6, `${id}: six road-wheel stations a side`);
  assert.equal(s.parts.filter((p) => p.stillbrew).length, 0, `${id}: no Stillbrew (the Mk 10 and later)`);
}

// Mk 3: the L21 ranging gun on the cradle (gun frame), 17 cm over the bore, its flash hider 1.25 m ahead of the
// trunnion; no muzzle reference system (1975). The Mk 5 and the Mk 9 carry no ranging gun.
const rangingGun = (p) => p.bucket.startsWith('gunMount') && p.min.y > .12 && p.max.y < .23;
assert.equal(count(mk3, 'gunMount', rangingGun) + count(mk3, 'gunMountDark', rangingGun), 4,
  'chieftain3: ranging-gun sleeve, nose, barrel and flash hider over the bore');
const flashHider = mk3.parts.find((p) => p.bucket === 'gunMountDark' && rangingGun(p) && p.max.z > 1.24);
assert.ok(flashHider && Math.abs(flashHider.max.z - (2.818 - bore[2])) < .002, 'chieftain3: the flash hider ends at z 2.818');
for (const [id, s] of [['chieftain5', mk5], ['chieftain_mk9', mk9]]) {
  assert.equal(s.parts.filter(rangingGun).length, 0, `${id}: no ranging gun (laser sight)`);
}

// Mk 9: the MRS mirror housing on the barrel crown behind the muzzle (gun frame), seated into the 0.102 m barrel.
const mrs = (p) => p.bucket === 'gun' && p.min.z > 6.59 - bore[2] && p.max.z < 6.79 - bore[2] && p.min.y > .07 && p.min.y < .1;
assert.equal(count(mk9, 'gun', mrs), 1, 'chieftain_mk9: the muzzle reference mirror housing');
assert.equal(count(mk5, 'gun', mrs) + count(mk3, 'gun', mrs), 0, 'Mk 5 and Mk 3: no MRS');
// Mk 9: the later stowage, a net rolled on the NBC pack and a bundle in the starboard basket, each tied by straps.
assert.equal(count(mk9, 'turretCloth') - count(mk5, 'turretCloth'), 2, 'chieftain_mk9: net roll and basket bundle');
assert.equal(count(mk9, 'turretDark') - count(mk5, 'turretDark'), 3, 'chieftain_mk9: three webbing straps');
assert.equal(count(mk3, 'turretCloth'), count(mk5, 'turretCloth'), 'chieftain3: the Mk 5 X stowage');

// LOW builds stay whole.
for (const id of ['chieftain3', 'chieftain_mk9']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'low', geometryReceipt: true });
  try {
    let triangles = 0;
    tank.root.traverse((m) => { if (m.isMesh) triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; });
    assert.ok(triangles > 10000, `${id}: LOW build has its geometry (${triangles})`);
    assert.ok(new THREE.Box3().setFromObject(tank.root).max.z > 6.7, `${id}: LOW build keeps its gun`);
  } finally { tank.dispose(); }
}
console.log('chieftainFidelity.selftest: Mk 3 and Mk 9 on the Mk 5 X castings, ring and trunnion; Mk 3 ranging gun, Mk 9 MRS and later stowage; no Stillbrew; LOW builds whole');
