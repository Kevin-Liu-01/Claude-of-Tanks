import assert from 'node:assert/strict';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { TYPE100_PROFILES } from './type100.ts';
import { TANK_SPECS } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { vehicleEraForId } from '../taxonomy.ts';
import { FLEET_GROUP_BY_ID } from '../fleetManifest.ts';
import { tankLabelRecord } from '../tankLabels.ts';

// Type 100 (owner 2026-09-16, "redesign the type 100 completely … use all of these as references"):
// the ZTZ-100 rebuilt from the ten reference renders. The receipt pins the roster identity, captures
// every tagged part at the builder port, and checks the silhouette the renders dictate: one wide glacis
// over a steep bow with chamfered corners, seven bolted skirt doors a side over a rubber apron, two hull
// crew hatches, a low wedge-fronted turret with the gunner's sight right and the panoramic drum left of
// the gun, twin quad pods on the rear roof corners, the tall remote weapon station at the rear centre,
// four corner sensor cubes, two whips, a louvred turret rear and a 105 mm tube.

const spec = TANK_SPECS.type100;
assert.equal(spec.name, 'Type 100'); assert.equal(spec.nation, 'China'); assert.equal(spec.era, 'next-generation');
assert.equal(spec.role, 'mbt'); assert.equal(spec.gun.caliberMm, 105); assert.equal(tankTier('type100'), 10);
assert.equal(vehicleEraForId('type100'), 'next-generation'); assert.equal(FLEET_GROUP_BY_ID.type100, 'modern2');
assert.equal(tankLabelRecord(spec).shortName, 'Type 100');
assert.equal(spec.visual.scheme, 'digital', 'digital woodland finish');
assert.equal(spec.visual.number, 'LZ83', 'hull number from the renders');
assert.deepEqual(spec.armor.turretPivot, [0, 1.80, -0.40]);
assert.deepEqual(spec.armor.gunPivot, [0, 0.34, 1.10], 'low trunnion in the wedge front');
assert.equal(spec.dims.hullLengthM, 7.30); assert.equal(spec.dims.heightM, 2.42);

const parts = [];
registerProfiledBuilders({ type100: (P) => TYPE100_PROFILES.type100.build(new Proxy(P, {
  get(target, key) {
    if (['add', 'addEquipment', 'addExternalArmor', 'addCupola', 'addGunExtra', 'addGunExtraDark', 'addModuleVisual'].includes(key)) {
      return (...args) => {
        const geometry = args.find((a) => a && a.isBufferGeometry);
        if (geometry?.userData.type100) {
          geometry.computeBoundingBox();
          const b = geometry.boundingBox;
          const nums = args.filter((a) => typeof a === 'number');
          const [x = 0, y = 0, z = 0] = nums;
          parts.push({ part: geometry.userData.type100, method: key, min: [b.min.x + x, b.min.y + y, b.min.z + z], max: [b.max.x + x, b.max.y + y, b.max.z + z] });
        }
        return target[key](...args);
      };
    }
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  },
})) });
const tank = createTank('type100', null, { proceduralOnly: true, geometryReceipt: true, quality: 'high', batchStatic: false });
tank.root.updateMatrixWorld(true);
const count = (part) => parts.filter((p) => p.part === part).length;
const one = (part) => parts.find((p) => p.part === part);
// hull
assert.equal(count('bow'), 1); assert.equal(count('glacis'), 1, 'one wide glacis over the bow');
assert.equal(count('bow-corner'), 2, 'chamfered bow corners'); assert.equal(count('bow-corner-lower'), 2);
assert.equal(count('hull-hatch'), 2, 'two crew hatches at the glacis top');
assert.equal(count('skirt-door'), 14, 'seven skirt doors a side');
assert.equal(count('skirt-seam'), 12, 'seams between the doors');
assert.equal(count('skirt-bolt'), 56, 'four bolts along every door top');
assert.equal(count('skirt-apron'), 2, 'rubber apron under the doors');
assert.equal(count('rear-grille'), 2, 'twin louvred exhaust grilles on the stern');
assert.equal(count('tail-lamp'), 2); assert.equal(count('tow-hook'), 4);
for (const part of ['tub', 'upper-body', 'intake', 'deck-grille', 'bow-rail', 'mud-flap']) assert.equal(count(part), 1, `${part} present once`);
const glacis = one('glacis'), bow = one('bow');
assert.ok(glacis.max[1] >= 1.79 && glacis.min[1] < 1.03 && glacis.min[2] > 1.60, 'the glacis spans the sponson floor to the roof');
assert.ok(bow.max[2] >= 3.76, 'the bow reaches the published hull nose');
// turret
assert.equal(count('citadel'), 1); assert.equal(count('cheek-module'), 4, 'two cheek slabs a side');
assert.equal(count('cheek-sensor'), 2); assert.equal(count('pod-tube'), 8, 'twin quad pods'); assert.equal(count('pod-mouth'), 8); assert.equal(count('pod-cap'), 8, 'closed tube caps');
assert.equal(count('das'), 4, 'four turret corner cubes'); assert.equal(count('bow-das'), 2, 'two bow cubes');
assert.equal(count('turret-hatch'), 2, 'two roof hatches'); assert.equal(count('antenna-pot'), 2);
for (const part of ['mantlet', 'trunnion', 'gunner-sight', 'panoramic-drum', 'panoramic-head', 'met-mast', 'rws-base', 'rws-column', 'rws-cradle', 'rws-barrel', 'rws-sensor', 'turret-grille']) {
  assert.equal(count(part), 1, `${part} present once`);
}
assert.ok(one('gunner-sight').min[0] > 0.3, 'gunner sight right of the gun');
assert.ok(one('panoramic-head').max[0] < -0.3, 'panoramic sight left of the gun');
const rwsTop = Math.max(...parts.filter((p) => p.part.startsWith('rws')).map((p) => p.max[1]));
const turretParts = parts.filter((p) => p.method !== 'addGunExtra' && p.method !== 'addGunExtraDark' && /^(citadel|cheek|das|pod|turret-hatch|antenna|gunner|panoramic|met|rws|turret-grille|grab)/.test(p.part));
assert.ok(rwsTop >= Math.max(...turretParts.map((p) => p.max[1])) - 1e-6, 'the remote weapon station is the tallest turret part');
assert.ok(rwsTop + spec.armor.turretPivot[1] <= spec.dims.silhouetteHeightM + 0.05, 'weapon station top inside the silhouette height');
assert.ok(one('citadel').max[1] <= 0.63, 'a low turret roof');
// envelope: hull parts inside the published width
const hullParts = parts.filter((p) => /tub|bow|glacis|upper-body|skirt|deck|intake|hull-hatch|rear|tail|tow|mud/.test(p.part));
const maxHalfWidth = Math.max(...hullParts.map((p) => Math.max(Math.abs(p.min[0]), Math.abs(p.max[0]))));
assert.ok(maxHalfWidth <= spec.dims.widthM / 2 + 0.16, `hull parts inside the published width (${(maxHalfWidth * 2).toFixed(2)} m)`);
const skirtDoors = parts.filter((p) => p.part === 'skirt-door');
assert.ok(skirtDoors.every((p) => Math.max(Math.abs(p.min[0]), Math.abs(p.max[0])) <= 1.83 + 1e-6), 'skirt doors define the width');
// gun and rig anchors
const muzzle = tank.root.getObjectByName('rig_muzzle');
assert.ok(muzzle, 'muzzle anchor exists');
const muzzleWorld = muzzle.getWorldPosition(new T.Vector3());
assert.ok(Math.abs(muzzleWorld.z - (spec.armor.turretPivot[2] + spec.armor.gunPivot[2] + 4.95)) < 0.02, `muzzle at ${muzzleWorld.z.toFixed(2)} m`);
assert.ok(muzzleWorld.z + 3.75 <= spec.dims.overallLengthM + 0.15, 'overall length covers the gun');
const meshes = []; tank.root.traverse((o) => { if (o.isMesh && !o.userData.shadowOnly) meshes.push(o); });
assert.ok(meshes.length > 20, 'the tank builds into buckets');
const receipt = tank.root.getObjectByName('rig_hull').userData.type100Receipt;
assert.equal(receipt?.launcherTubes, 8, 'build receipt published');
assert.equal(receipt?.architecture, 'type100-ztz100-r2'); assert.equal(receipt?.skirtDoorsPerSide, 7);
console.log(`type100: ${parts.length} tagged parts — one-piece glacis, 14 bolted skirt doors, 8 launcher tubes, weapon station top ${rwsTop.toFixed(2)} m (turret), 105 mm muzzle at ${muzzleWorld.z.toFixed(2)} m PASS`);
