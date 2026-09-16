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

// Type 100 (owner 2026-09-15): the paraded PLA next-generation medium tank, built from the Puma /
// CV90 Mk IV vocabulary. The receipt pins the roster identity, captures every tagged part at the
// builder port, and checks the silhouette the parade photograph dictates: three glacis facets,
// seven skirt doors a side, eight launcher tubes, a sensor mast above the roof, a 105 mm tube.

const spec = TANK_SPECS.type100;
assert.equal(spec.name, 'Type 100'); assert.equal(spec.nation, 'China'); assert.equal(spec.era, 'next-generation');
assert.equal(spec.role, 'mbt'); assert.equal(spec.gun.caliberMm, 105); assert.equal(tankTier('type100'), 10);
assert.equal(vehicleEraForId('type100'), 'next-generation'); assert.equal(FLEET_GROUP_BY_ID.type100, 'modern2');
assert.equal(tankLabelRecord(spec).shortName, 'Type 100');
assert.equal(spec.visual.scheme, 'digital', 'parade digital finish');
assert.deepEqual(spec.armor.turretPivot, [0, 1.80, -0.40]);

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
          const [x = 0, y = 0, z = 0] = key === 'addModuleVisual' ? nums : nums;
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
assert.equal(count('bow') + count('glacis-lower') + count('glacis-upper'), 3, 'three glacis facets');
assert.equal(count('skirt-door'), 14, 'seven skirt doors a side');
assert.equal(count('pod-tube'), 8, 'twin quadruple launcher pods');
assert.equal(count('pod-mouth'), 8);
assert.equal(count('cheek-module'), 4, 'two creased cheek modules a side');
assert.equal(count('lwr'), 4, 'laser warning receivers on the four roof corners');
assert.equal(count('skirt-seam'), 12, 'dark seams between the painted skirt doors');
for (const part of ['mast-pedestal', 'mast-column', 'mast-head', 'mast-window', 'mast-cap', 'mast-dome', 'commander-hatch', 'gunner-sight', 'mantlet', 'trunnion', 'driver-hatch', 'bow-rail', 'deck-grille', 'exhaust']) {
  assert.equal(count(part), 1, `${part} present once`);
}
// envelope: the hull stays inside the published width, the mast is the tallest turret part
const hullParts = parts.filter((p) => /tub|bow|glacis|monocoque|skirt|fender|deck|exhaust|driver|rear|tail|tow|flank/.test(p.part));
const maxHalfWidth = Math.max(...hullParts.map((p) => Math.max(Math.abs(p.min[0]), Math.abs(p.max[0]))));
assert.ok(maxHalfWidth <= spec.dims.widthM / 2 + 0.16, `hull parts inside the published width (${(maxHalfWidth * 2).toFixed(2)} m)`);
const mastTop = Math.max(...parts.filter((p) => p.part.startsWith('mast')).map((p) => p.max[1]));
const turretParts = parts.filter((p) => !hullParts.includes(p) && !/pod|antenna/.test(p.part));
assert.ok(mastTop >= Math.max(...turretParts.map((p) => p.max[1])) - 1e-6, 'the sensor mast is the tallest turret part');
assert.ok(mastTop + spec.armor.turretPivot[1] <= spec.dims.silhouetteHeightM + 0.05, 'mast top inside the silhouette height');
// gun and rig anchors
const muzzle = tank.root.getObjectByName('rig_muzzle');
assert.ok(muzzle, 'muzzle anchor exists');
const muzzleWorld = muzzle.getWorldPosition(new T.Vector3());
assert.ok(Math.abs(muzzleWorld.z - (spec.armor.turretPivot[2] + spec.armor.gunPivot[2] + 4.95)) < 0.02, `muzzle at ${muzzleWorld.z.toFixed(2)} m`);
assert.ok(muzzleWorld.z + 3.55 <= spec.dims.overallLengthM + 0.15, 'overall length covers the gun');
const meshes = []; tank.root.traverse((o) => { if (o.isMesh && !o.userData.shadowOnly) meshes.push(o); });
assert.ok(meshes.length > 20, 'the tank builds into buckets');
assert.equal(tank.root.getObjectByName('rig_hull').userData.type100Receipt?.launcherTubes, 8, 'build receipt published');
console.log(`type100: ${parts.length} tagged parts — three-facet glacis, 14 skirt doors, 8 launcher tubes, sensor mast top ${mastTop.toFixed(2)} m (turret), 105 mm muzzle at ${muzzleWorld.z.toFixed(2)} m PASS`);
