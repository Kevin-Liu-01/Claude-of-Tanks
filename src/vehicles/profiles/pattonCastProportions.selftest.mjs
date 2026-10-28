// Release 262 (the owner, 2026-10-27: "update/redesign the m47, m46, and m48 pattons ... based on proper historical
// referrences so they will no longer look so chungus"): the rebuilt M46, M47 and M48A5 (profiles/pattonCast.ts) hold
// their published proportions, measured from the built tanks, not from their authored numbers:
// - hull length with fenders, width and the casting heights against docs/references/tanks/<id>.md (Hunnicutt, TM 9-718A,
//   AFV Database; the owner-supplied M48A5 model, whose dome is 2.48 m wide and 0.91 m floor to roof);
// - the turret castings are no longer squat or bloated: each mark's casting height and width sit in its source band,
//   and the three marks are told apart by their castings (the M47's long turret, the M46's short Pershing box, the
//   M48A5's wide egg);
// - the running gear the sources give each mark (six road wheels; five return rollers on the M46 and M48A5, three on the
//   M47; the small track-tension wheel on the M46 and M47 only);
// - the muzzle at the published overall length;
// - every cast hull and turret loft is a closed, coherent shell with no crossing faces (the base-shell audit's tests).
// Negative controls: the release-260 castings (the August squash, the old M48A5 print's 2.96 m dome) fail these laws.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { shellPart } from '../../../tools/base-shell-audit-math.mjs';
import { properSurfaceCrossings, shellEdgeTopology } from '../../../tools/base-shell-integrity.mjs';

/** Published figures (m) and the gear the sources give each mark. */
const SOURCES = {
  m46_patton: { hullLength: 6.358, width: 3.513, turretWidth: [1.90, 2.10], castHeight: [0.84, 1.00], rollers: 5, tension: true, glacis: [44, 48], device: 'm3a1' },
  // the T42 casting's width has no published figure: the gate's reference model measures 2.20 m over the flanks
  m47_patton: { hullLength: 6.358, width: 3.512, turretWidth: [1.95, 2.25], castHeight: [0.95, 1.15], rollers: 3, tension: true, glacis: [58, 62], device: 'm36' },
  // the owner's model's envelope (3.721 m over the left fender bar and the tracks on its 2.953 m centres), the source
  // ruler the gate measures it by
  m48a5_patton: { hullLength: 6.871, width: 3.721, turretWidth: [2.40, 2.52], castHeight: [0.84, 0.94], rollers: 5, tension: false, glacis: [55, 65] },
  // release 266: the M48 marks on the A5's castings, with their own running gear (docs/references/tanks/<id>.md): the A3
  // on the A5's (the Latrun tank), the early hull's tension wheel under the Magach 3, the A2 hull's three rollers under the
  // GA2 and the Super (whose skirts widen it); the A3's M41 ends in its T-shaped deflector
  m48a3_patton: { hullLength: 6.871, width: 3.721, turretWidth: [2.40, 2.52], castHeight: [0.84, 0.94], rollers: 5, tension: false, glacis: [55, 65], device: 'm36' },
  magach3: { hullLength: 6.871, width: 3.721, turretWidth: [2.40, 2.52], castHeight: [0.84, 0.94], rollers: 5, tension: true, glacis: [55, 65] },
  m48a2ga2: { hullLength: 6.871, width: 3.721, turretWidth: [2.40, 2.52], castHeight: [0.84, 0.94], rollers: 3, tension: false, glacis: [55, 65] },
  m48_super: { hullLength: 6.871, width: 3.721, turretWidth: [2.40, 2.52], castHeight: [0.84, 0.94], rollers: 3, tension: false, glacis: [55, 65] },
};
const box = (o) => new THREE.Box3().setFromObject(o);
const within = (v, [lo, hi]) => v >= lo && v <= hi;
// negative controls: the release-260 castings (the August squash and the old M48A5 print's dome) fail their marks' laws
assert.equal(within(2.504 - 1.708, SOURCES.m47_patton.castHeight), false, 'the squashed 0.80 m M47 casting fails');
assert.equal(within(2.541 - 1.731, SOURCES.m46_patton.castHeight), false, 'the squashed 0.81 m M46 casting fails');
assert.equal(within(2.348, SOURCES.m46_patton.turretWidth), false, 'the 2.35 m-wide M46 casting fails');
assert.equal(within(2.962, SOURCES.m48a5_patton.turretWidth), false, 'the 2.96 m-wide M48A5 dome fails');

const shells = {};
for (const [id, src] of Object.entries(SOURCES)) {
  const emissions = [];
  const tank = createTank(id, null, {
    proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true,
    partCensus(bucket, g, source) {
      if (source === 'add' && (bucket === 'hull' || bucket === 'turret')) emissions.push({ bucket, g });
    },
  });
  try {
    tank.root.updateMatrixWorld(true);
    const spec = getSpec(id);
    const receipt = tank.root.getObjectByName('rig_turret')?.userData.pattonCastReceipt;
    assert.equal(receipt?.revision, 'patton-cast-262', `${id}: built by the release-262 castings`);
    const hullBox = box(tank.root.getObjectByName('rig_hull'));
    const hullLength = hullBox.max.z - hullBox.min.z, width = hullBox.max.x - hullBox.min.x;
    assert.ok(Math.abs(hullLength / src.hullLength - 1) < 0.03, `${id}: hull ${hullLength.toFixed(3)} m vs published ${src.hullLength}`);
    assert.ok(Math.abs(width / src.width - 1) < 0.02, `${id}: width ${width.toFixed(3)} m vs published ${src.width}`);
    // the casting itself: the union of the turret lofts (the cupola, hatches and fittings stand on it)
    const shell = new THREE.Box3();
    for (const { g, bucket } of emissions) if (bucket === 'turret' && g.userData?.pattonCastLoft) { g.computeBoundingBox(); shell.union(g.boundingBox); }
    const turretW = shell.max.x - shell.min.x, turretL = shell.max.z - shell.min.z, turretH = shell.max.y - shell.min.y;
    shells[id] = { turretW, turretL, turretH };
    console.log(`${id}: hull ${hullLength.toFixed(3)} x ${width.toFixed(3)} m; casting ${turretL.toFixed(2)} long, ${turretW.toFixed(2)} wide, `
      + `${turretH.toFixed(2)} tall; ${receipt.returnRollers} return rollers${receipt.tensionWheel ? ' + tension wheel' : ''}; `
      + `glacis ${receipt.glacisFromVerticalDeg} deg`);
    assert.ok(within(turretH, src.castHeight), `${id}: the casting stands ${turretH.toFixed(3)} m floor to roof (${src.castHeight.join('-')})`);
    assert.ok(turretW >= src.turretWidth[0] && turretW <= src.turretWidth[1], `${id}: the casting is ${turretW.toFixed(3)} m wide`);
    assert.equal(receipt.roadWheels, 6, `${id}: six road wheels`);
    assert.equal(tank.root.getObjectByName('rig_hull').userData.runningGearReceipts?.[0]?.wheelZs?.length, 6, `${id}: six road-wheel stations built`);
    assert.equal(receipt.returnRollers, src.rollers, `${id}: ${src.rollers} return rollers`);
    assert.equal(receipt.tensionWheel, src.tension, `${id}: track-tension wheel ${src.tension ? 'fitted' : 'absent'}`);
    assert.equal(receipt.device, src.device ?? 'none', `${id}: muzzle device ${src.device ?? 'none'}`);
    assert.ok(receipt.glacisFromVerticalDeg >= src.glacis[0] && receipt.glacisFromVerticalDeg <= src.glacis[1],
      `${id}: glacis ${receipt.glacisFromVerticalDeg} deg from vertical`);
    // the retired m48RoofSeating receipt's pin, kept for all three marks: the gun, mantlet and recoil rig ride the turret
    // at the published trunnion (the M48A5's 1.921 m bore, which superseded the 258 mantlet's 2.10)
    const gunRig = tank.root.getObjectByName('rig_gun'), turretRig = tank.root.getObjectByName('rig_turret');
    let owner = gunRig?.parent;
    while (owner && owner !== turretRig) owner = owner.parent;
    assert.ok(owner === turretRig, `${id}: the gun rig rises with the turret`);
    const trunnion = gunRig.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(trunnion.y - receipt.trunnion[0]) < 1e-6 && Math.abs(trunnion.z - receipt.trunnion[1]) < 1e-6,
      `${id}: the gun rig at its trunnion (${trunnion.y.toFixed(4)}, ${trunnion.z.toFixed(4)}) vs ${receipt.trunnion.join(', ')}`);
    if (id === 'm48a5_patton') assert.deepEqual(receipt.trunnion, [1.921, 1.7616], 'the M48A5 bore at the source model\'s 1.921 m');
    const muzzle = new THREE.Vector3();
    tank.root.getObjectByName('rig_muzzle')?.getWorldPosition(muzzle);
    assert.ok(Math.abs(muzzle.z - hullBox.min.z - spec.dims.overallLengthM) < 0.12,
      `${id}: muzzle ${muzzle.z.toFixed(3)} at the published overall ${spec.dims.overallLengthM} m from the tail ${hullBox.min.z.toFixed(3)}`);
    // the cast lofts (castSolid / hullSolid) are closed shells
    const lofts = emissions.filter(({ g }) => g.userData?.pattonCastLoft);
    assert.ok(lofts.some(({ bucket }) => bucket === 'hull') && lofts.some(({ bucket }) => bucket === 'turret'), `${id}: cast hull and turret lofts emitted (${lofts.length})`);
    for (const { g, bucket } of lofts) {
      const part = shellPart(g);
      assert.deepEqual(shellEdgeTopology(part), { boundary: 0, nonmanifold: 0, inconsistent: 0 }, `${id} ${bucket}: closed, coherent casting`);
      assert.ok(part.volume > 1e-3, `${id} ${bucket}: positive volume`);
      assert.equal(properSurfaceCrossings(part).length, 0, `${id} ${bucket}: no crossing faces`);
    }
  } finally { tank.dispose(); }
}
// three marks, three castings
const { m46_patton: m46, m47_patton: m47, m48a5_patton: m48 } = shells;
assert.ok(m47.turretL / m47.turretW > 1.55, `the M47's long T42 casting (${(m47.turretL / m47.turretW).toFixed(2)} length/width)`);
assert.ok(m46.turretL / m46.turretW < 1.40, `the M46's short Pershing casting (${(m46.turretL / m46.turretW).toFixed(2)})`);
assert.ok(m48.turretW > m46.turretW + 0.25 && m48.turretL / m48.turretW < 1.40, 'the M48A5\'s wide egg dome');
console.log('pattonCastProportions: the M46, M47, M48A5 and the M48 marks\' castings, hulls and running gear hold their sources PASS');
