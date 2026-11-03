// The Chieftain marks on the source-built castings (release 268b, owner 2026-11-02: "the cheiftain mk 3 and mk 9s look
// identical and way way too smimilar to the inspirations, make them look much more different inn editing the turret and
// hull appearances to like like precessors"): the Mk 3 (chieftain3) is the Mk 5 X's castings and running gear with the
// early marks' fittings (profiles/chieftainMk3X.ts and the `early` options of the Mk 5 X's equipment); the Mk 9
// (chieftain_mk9) is the Mk 10 X's castings and running gear without the Stillbrew, with the bare cast nose and its own
// late-1970s fittings (profiles/chieftainMk9X.ts). Round 268 put both on the Mk 5 X with small fittings. First-party
// tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { CHIEFTAIN5_X_DATUMS } from './chieftain5X.ts';
import { CHIEFTAIN10_X_DATUMS } from './chieftain10X.ts';

const D5 = CHIEFTAIN5_X_DATUMS.chieftain5, D10 = CHIEFTAIN10_X_DATUMS.chieftain_mk10;

/** A geometry's position bytes as a short digest. */
function digest(g) {
  const p = g.attributes.position.array;
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h * 31 + Math.round(p[i] * 1e5)) | 0;
  return `${p.length}:${h}`;
}

/** One HIGH build's authored parts by bucket (bounds and bytes in the bucket's own frame, before the factory's seat,
 * which reads the generated turret-ring receipt), its rigs and its named fittings. */
function survey(id) {
  const parts = [];
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true,
    partCensus(bucket, g, source) {
      if (source !== 'add') return;
      g.computeBoundingBox();
      parts.push({ bucket, min: g.boundingBox.min.clone(), max: g.boundingBox.max.clone(), bytes: digest(g),
        stillbrew: g.userData.chieftain10Stillbrew, horn: g.userData.chieftain10Horn, mk9: g.userData.chieftainMk9 });
    } });
  try {
    const rig = (name) => tank.root.getObjectByName(name).position.toArray().map((v) => +v.toFixed(6));
    return { parts, rigTurret: rig('rig_turret'), rigGun: rig('rig_gun'),
      wheels: tank.root.getObjectByName('rig_hull').userData.nativeRoadWheelStations,
      jerryCans: !!tank.root.getObjectByName('chieftainMk3JerryCans') };
  } finally { tank.dispose(); }
}

const bytes = (s, bucket, test = () => true) => s.parts.filter((p) => p.bucket === bucket && test(p)).map((p) => p.bytes);
const count = (s, bucket, test = () => true) => bytes(s, bucket, test).length;
const mk5 = survey('chieftain5'), mk3 = survey('chieftain3'), mk10 = survey('chieftain_mk10'), mk9 = survey('chieftain_mk9');

// Mk 3: the Mk 5 X's hull and turret castings, ring and trunnion, byte for byte.
assert.deepEqual(bytes(mk3, 'hull'), bytes(mk5, 'hull'), 'chieftain3: the Mk 5 X hull casting');
assert.deepEqual(bytes(mk3, 'turret'), bytes(mk5, 'turret'), 'chieftain3: the Mk 5 X turret casting');
assert.deepEqual(mk3.rigTurret, mk5.rigTurret, 'chieftain3: the Mk 5 X ring');
assert.deepEqual(mk3.rigGun, mk5.rigGun, 'chieftain3: the Mk 5 X trunnion');
// Mk 9: the Mk 10 X's hull casting (plus the closures of its roof pockets) and its turret casting without the Stillbrew
// and the two horns it stands on, plus the bare nose; the Mk 10 X's ring, trunnion and gun (its muzzle reference mirror).
const mk10Hull = bytes(mk10, 'hull'), mk9Hull = bytes(mk9, 'hull', (p) => !p.mk9);
assert.deepEqual(mk9Hull, mk10Hull, 'chieftain_mk9: the Mk 10 X hull casting');
assert.deepEqual(bytes(mk9, 'turret', (p) => !p.mk9), bytes(mk10, 'turret', (p) => !p.stillbrew && p.horn === undefined),
  'chieftain_mk9: the Mk 10 X turret casting less the Stillbrew and its horns');
assert.equal(count(mk10, 'turret', (p) => p.horn !== undefined), 2, 'chieftain_mk10: the two horns under the Stillbrew');
assert.equal(count(mk10, 'turret', (p) => p.stillbrew), 3, 'chieftain_mk10: two Stillbrew cheeks and the spine');
assert.equal(mk9.parts.filter((p) => p.stillbrew).length, 0, 'chieftain_mk9: no Stillbrew (the Mk 10 and later)');
assert.equal(count(mk9, 'turret', (p) => p.mk9 === 'bareNose'), 2, 'chieftain_mk9: the bare cast nose, two cheeks');
assert.deepEqual(mk9.rigTurret, mk10.rigTurret, 'chieftain_mk9: the Mk 10 X ring');
assert.deepEqual(mk9.rigGun, mk10.rigGun, 'chieftain_mk9: the Mk 10 X trunnion');
assert.deepEqual(bytes(mk9, 'gun'), bytes(mk10, 'gun'), 'chieftain_mk9: the Mk 10 X gun and its MRS');
for (const [id, s] of [['chieftain3', mk3], ['chieftain_mk9', mk9]]) assert.equal(s.wheels, 6, `${id}: six road-wheel stations a side`);
// The bare nose stays out of the gun's slot (|x| < 0.17 at the trunnion's height and over it).
for (const p of mk9.parts.filter((q) => q.mk9 === 'bareNose')) {
  assert.ok(p.min.x > .17 - D10.turretPivot[0] - 1e-3 || p.max.x < -.17 - D10.turretPivot[0] + 1e-3,
    'chieftain_mk9: the bare nose leaves the gun slot open');
}

// Mk 3: the L21 ranging gun on the cradle (gun frame), 17 cm over the bore: housing, nose, barrel and flash hider, the
// hider's mouth 1.60 m ahead of the trunnion (z 3.170). The Mk 5 and the Mk 9 carry no ranging gun (laser sight).
const bore = D5.trunnion;
const rangingGun = (p) => p.bucket.startsWith('gunMount') && p.min.y > .12 && p.max.y < .24 && p.min.z > .2;
assert.equal(count(mk3, 'gunMount', rangingGun) + count(mk3, 'gunMountDark', rangingGun), 4,
  'chieftain3: ranging-gun housing, nose, barrel and flash hider over the bore');
const flashHider = mk3.parts.filter((p) => p.bucket === 'gunMountDark' && rangingGun(p))
  .reduce((a, p) => (!a || p.max.z > a.max.z ? p : a), null);
assert.ok(flashHider && Math.abs(flashHider.max.z - (3.170 - bore[2])) < .002, 'chieftain3: the flash hider ends at z 3.170');
for (const [id, s] of [['chieftain5', mk5], ['chieftain_mk9', mk9]]) {
  assert.equal(s.parts.filter(rangingGun).length, 0, `${id}: no ranging gun (laser sight)`);
}
// Mk 3: the early turret: no full-width NBC pack (the Mk 5's 1.44 m case), its own 0.86 m pack, the open bar basket
// across the bustle (more open-lattice members than the Mk 5's two side baskets) and the jerry cans on the right.
const wide = (w) => (p) => Math.abs(p.max.x - p.min.x - w) < .02 && p.max.y - p.min.y > .3;
assert.equal(count(mk5, 'turretDetail', wide(1.4449)), 1, 'chieftain5: the full-width NBC pack');
assert.equal(count(mk3, 'turretDetail', wide(1.4449)), 0, 'chieftain3: no Mk 5 NBC pack');
assert.equal(count(mk3, 'turretDetail', (p) => wide(.86)(p) && p.max.y - p.min.y < .36), 1, 'chieftain3: the original NBC pack');
assert.ok(count(mk3, 'turretOpenLattice') > count(mk5, 'turretOpenLattice') + 20, 'chieftain3: the open rear basket');
assert.ok(mk3.jerryCans && !mk5.jerryCans, 'chieftain3: jerry cans where the Mk 5 carries its stowage box');

// Mk 9: its stowage (a net rolled on the NBC pack and a tarpaulin in the open carrier, each tied by two straps).
assert.equal(count(mk9, 'turretCloth') - count(mk10, 'turretCloth'), 2, 'chieftain_mk9: net roll and tarpaulin roll');
assert.equal(count(mk9, 'turretDark') - count(mk10, 'turretDark'), 4, 'chieftain_mk9: four webbing straps');

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
console.log('chieftainFidelity.selftest: Mk 3 on the Mk 5 X castings with the early turret, ranging gun and cans; Mk 9 on the Mk 10 X castings without Stillbrew, bare nose and late stowage; LOW builds whole');
