import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { TANK_SPECS } from './specs.ts';
import { geometryFingerprint } from './tankAssets.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';
import { assertConvexArmorOutline } from '../sim/armorOutline.test-support.mjs';
import { c1Point } from './profiles/challenger1XSuppliedFrame.ts';
import { synchronizeSecondWaveXCombatMetadata } from './sourceXSecondWaveSpecs.ts';
import { withHistoricalFixedGuardPaint } from './historicalFixedGuardPaint.test-support.mjs';
import { historicalStrv122WheelConfig, withHistoricalStrv122Wheels } from './strv122WheelHistory.test-support.mjs';
import { strv122SuppliedWheelSolids } from './profiles/strv122XSuppliedGear.ts';
import { buildFleetTrackShoe } from './profiles/abramsSourceXTrackShoe.ts';
import { KIT } from './tankFactoryCore.ts';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cases = {
  leo2a6_x: { main: '9738004144f8aefecdc007bf5f40f6c841672c73fc2f7cade841d209c727d63b', geometry: ['fcd94cec', 'bbffce47'], counts: [20, 0] },
  strv122_x: { main: 'b8a437d4d0b97a7439e6acef7fb40854919f560386ccf6fc501aeea2c8c0e483', geometry: ['8af80603', 'ff3da394'], counts: [676, 66] },
  ariete_c1_x: { main: '9437418be3b9b6d1eee68126b9e9c4f5e5e68e2a1cafe279ab8ef5b6c9ba227b', geometry: ['5476ec88', '6b60abbe'], counts: [210, 0] },
  challenger1_x: { main: '83413e15bad8845f1a3d9043bd0769576d3777bf5b82a2314b00f7f27ec17ce5', geometry: ['079019ff', '285d7664'], counts: [156, 0] },
};
const pose = yaw => tankPoseFromState({ pos: new THREE.Vector3(), yaw: 0, visualPitch: 0,
  visualRoll: 0, turretYaw: yaw, gunPitch: 0 });
const auxiliary = armor => [...armor.hullPlates, ...armor.turretPlates].filter(p => p.surfaceGroup);
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

// Reject unintended recipes and preserve geometry ownership on both branches.
{
  const hook = KIT.buildRunningGear;
  let disposed = 0;
  assert.throws(() => withHistoricalStrv122Wheels(() => ({ dispose() { disposed++; } })));
  assert.equal(disposed, 1); assert.equal(KIT.buildRunningGear, hook);
  assert.throws(() => withHistoricalStrv122Wheels(() => KIT.buildRunningGear({ spec: { id: 'strv122' } }, {})));
  assert.equal(KIT.buildRunningGear, hook);
  for (const corrupt of [false, true]) {
    const solids = strv122SuppliedWheelSolids(48), counts = new Map();
    for (const g of Object.values(solids)) g.addEventListener('dispose', () => counts.set(g, (counts.get(g) ?? 0) + 1));
    const config = { trackShoeBuilder: buildFleetTrackShoe, wheelCoreGeometry: { disc: solids.core }, wheelZs: [1, 2],
      wheelFaceLayers: [{ side: -1, geometry: solids.left }, { side: 1, geometry: solids.right }] };
    if (corrupt) {
      solids.left.attributes.position.array[0] += .001;
      assert.throws(() => historicalStrv122WheelConfig(config));
      assert.equal(counts.size, 0, 'failed authentication keeps caller-owned inputs');
      Object.values(solids).forEach(g => g.dispose());
    } else {
      assert.throws(() => historicalStrv122WheelConfig({...config,trackShoeBuilder:()=>{}}),
        'an unrecognized link recipe cannot be hidden by the historical inverse');
      assert.equal(counts.size,0,'failed link authentication keeps input ownership');
      const restored = historicalStrv122WheelConfig(config);
      assert.equal(restored.trackShoeBuilder,undefined,'historical links use the unchanged original native builder');
      assert.equal(restored.wheelCoreGeometry, config.wheelCoreGeometry);
      assert.equal(restored.wheelZs, config.wheelZs, 'all non-target configuration stays owned and unchanged');
      assert.equal(counts.get(solids.core), undefined);
      assert.equal(counts.get(solids.left), 1); assert.equal(counts.get(solids.right), 1);
      solids.core.dispose(); restored.wheelFaceLayers.forEach(layer => layer.geometry.dispose());
    }
    for (const g of Object.values(solids)) assert.equal(counts.get(g), 1);
  }
}

for (const [id, expected] of Object.entries(cases)) {
  const armor = TANK_SPECS[id].armor;
  assert.equal(hash([armor.hullPlates.filter(p => p.kind !== 'spaced'), armor.turretPlates.filter(p => p.kind !== 'spaced'),
    armor.modules, armor.crew, armor.collisionShells]), expected.main,
  `${id}: pre-edit permanent armor, ERA, collision cells, modules and crew stay byte-identical`);
  assert.deepEqual([armor.hullPlates.filter(p => p.surfaceGroup).length, armor.turretPlates.filter(p => p.surfaceGroup).length], expected.counts);
  const donor = TANK_SPECS[{ leo2a6_x: 'leo2a6', strv122_x: 'strv122', ariete_c1_x: 'ariete_c1', challenger1_x: 'challenger1' }[id]].armor;
  for (const plate of auxiliary(armor)) {
    assertConvexArmorOutline(plate.verts, `${id}/${plate.surfaceGroup}`);
    const original = [...donor.hullPlates, ...donor.turretPlates].find(p => p.name === plate.name);
    assert.ok(original, `${id}: each replacement uses its actual donor protection family`);
    assert.deepEqual([plate.physicalMm, plate.keMm, plate.ceMm], [original.physicalMm, original.keMm, original.ceMm]);
  }
  for (const [lod, quality] of ['high', 'low'].entries()) {
    const tank = createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 });
    try {
      if(id==='leo2a6_x'){
        const original=withHistoricalFixedGuardPaint(id,()=>createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242}));
        try{assert.equal(geometryFingerprint(original.root),expected.geometry[lod],
          `${id}/${quality}: original complete mesh partition after eight authenticated finish inverses`);}
        finally{original.dispose();}
        assert.notEqual(geometryFingerprint(tank.root),expected.geometry[lod],
          'actual painted bucket partition is distinct from its historical grouping');
      }else if(id==='strv122_x'){
        const original=withHistoricalStrv122Wheels(()=>createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242}));
        try{assert.equal(geometryFingerprint(original.root),expected.geometry[lod],
          `${id}/${quality}: original whole model after authenticated wheel/link inverses`);}
        finally{original.dispose();}
        assert.notEqual(geometryFingerprint(tank.root),expected.geometry[lod]);
      }else assert.equal(geometryFingerprint(tank.root), expected.geometry[lod], `${id}/${quality}: every physical buffer unchanged`);
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
  for (const side of [-1, 1]) assert.equal(shot(id, [side * (x + .005), y, z], [side * (x - .005), y, z]).length, 0,
    `${id}: old unsupported side slab remains gameplay air`);
}
for (const side of [-1, 1]) {
  const a6 = shot('leo2a6_x', [side * 1.8, 1.08, -1], [side * 1.70, 1.08, -1]);
  assert.equal(a6.length, 1); close(Math.abs(a6[0].point.x), 1.7409, 'source-fitted A6 thin leaf');
  assert.equal(shot('leo2a6_x', [side * 1.8, 1.08, .687], [side * 1.70, 1.08, .687]).length, 0, 'A6 true 51.25mm leaf gap');
  assert.equal(shot('leo2a6_x', [side * 1.90, 1.10, 2.169025], [side * 1.80, 1.10, 2.169025]).length, 0, 'A6 actual 1.08mm heavy-panel seam');
  const ariete = shot('ariete_c1_x', [side * 2, .9, .5], [side * 1.48, .9, .5]);
  assert.equal(ariete.length, 1, 'Ariete outer cover does not double-charge its hidden inner sheet');
  close(Math.abs(ariete[0].point.x), 1.805, 'Ariete actual heavy face');
  const gap = shot('ariete_c1_x', [side * 2, .9, .405], [side * 1.48, .9, .405]);
  assert.equal(gap.length, 1, 'real Ariete outer gap exposes only the actual inner leaf');
  close(gap[0].point.x, side < 0 ? -1.529119 : 1.5299605, 'Ariete inner leaf through outer seam');
  for (const [rawZ, rawY, rawX] of [[-90, 40, 76.181099 - .43307], [-90, 58, 76.181099], [-73.365, 40, 70]]) {
    const p = c1Point(side * rawX, rawY, rawZ);
    const hits = shot('challenger1_x', [side * 2, p[1], p[2]], [side * 1.5, p[1], p[2]]);
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
console.log('sourceXWesternAuxArmor: four actual high/low surfaces, panel gaps, nested-sheet single billing, posed cheeks, unchanged meshes/main anatomy and donor protection pass');
