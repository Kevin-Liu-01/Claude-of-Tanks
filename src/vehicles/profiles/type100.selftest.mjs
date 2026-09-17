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

// Type 100, fourth build (owner 2026-09-16: hull in the T-90M study's grammar, turret in the T-14 Armata's,
// "redesign from scratch … you're using the primitives only"). The receipt pins the roster identity, the part
// census at the builder port (lofted body, hanging curtain panels with furniture, glacis appliqué courses and bow
// gear, deck grille and covers; core loft wrapped in facet slabs, trapezoid housing and moving mantlet, sight
// cavity, roof tiles, drum-stack panoramic sight, pedestal weapon station with a real pintle MG, pods, smoke,
// radar panels), the envelopes, the tallest turret part and the gun anchor.

const spec = TANK_SPECS.type100;
assert.equal(spec.name, 'Type 100'); assert.equal(spec.nation, 'China'); assert.equal(spec.era, 'next-generation');
assert.equal(spec.role, 'mbt'); assert.equal(spec.gun.caliberMm, 105); assert.equal(tankTier('type100'), 10);
assert.equal(vehicleEraForId('type100'), 'next-generation'); assert.equal(FLEET_GROUP_BY_ID.type100, 'modern2');
assert.equal(tankLabelRecord(spec).shortName, 'Type 100');
assert.equal(spec.visual.scheme, 'digital', 'digital woodland finish');
assert.equal(spec.visual.number, 'LZ83', 'hull number from the renders');
assert.deepEqual(spec.armor.turretPivot, [0, 1.80, -0.95], 'turret set back over the hull as in the renders');
assert.deepEqual(spec.armor.gunPivot, [0, 0.34, 1.65], 'low trunnion at the wedge apex');
assert.equal(spec.dims.hullLengthM, 7.05); assert.equal(spec.dims.widthM, 3.66); assert.equal(spec.dims.overallLengthM, 10.05);

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
// hull body loft (T-90M grammar): bevelled keel, sponson floor, band, two-plane front
const body = one('hull-body');
assert.equal(count('hull-body'), 1, 'the hull is one cross-section loft');
assert.ok(Math.abs(body.max[0] - 1.78) < 1e-6, 'the hull flank sits behind the hanging curtains');
assert.equal(count('fender-shoulder'), 2, 'fender shoulders carry the glacis edges out to the skirt line');
assert.ok(body.min[2] <= -3.75 + 1e-6 && body.max[2] >= 3.29, 'stern plate to nose');
assert.ok(body.max[0] > 1.7 && parts.filter((p) => p.part === 'hull-body').length === 1, 'one body loft narrows into the prow');
assert.ok(Math.abs(body.max[1] - 1.80) < 1e-6 && Math.abs(body.min[1] - 0.40) < 1e-6, 'roof and belly heights');
// hanging curtains with mounting furniture
assert.equal(count('curtain-panel'), 14, 'seven hanging curtain panels a side');
assert.equal(count('curtain-lead'), 2, 'the slanted leading panel ends on the lower glacis');
assert.ok(count('curtain-hinge') >= 30 && count('curtain-bolt') >= 56 && count('curtain-rib') === 14, 'hinge blocks, clip bolts and stiffeners on every panel');
assert.equal(count('fender-lip'), 2); assert.equal(count('hinge-rail'), 2); assert.equal(count('hem-strip'), 2);
const curtains = parts.filter((p) => p.part === 'curtain-panel' || p.part === 'curtain-lead');
assert.ok(curtains.every((p) => Math.max(Math.abs(p.min[0]), Math.abs(p.max[0])) <= 1.83 + 1e-6), 'curtains define the 3.66 m width');
assert.ok(curtains.every((p) => p.min[1] >= 0.62 - 1e-6 && p.max[1] <= 1.37 + 1e-6), 'curtains hang from the fender line to the hem');
assert.ok(one('curtain-lead').max[2] >= 3.25, 'the leading curtain panel runs to the nose at full height');
// glacis field and bow gear
assert.equal(count('glacis-course'), 7, 'stepped appliqué courses on the trapezoid upper glacis');
assert.equal(count('hull-hatch'), 2); assert.equal(count('periscope-block'), 5); assert.equal(count('glacis-rail'), 2);
assert.equal(count('lamp'), 2); assert.equal(count('lamp-guard'), 2); assert.equal(count('tow-eye'), 4); assert.equal(count('bow-strip'), 1);
assert.equal(count('bow-strip-bolt'), 8); assert.equal(count('glacis-vent'), 1);
// deck and stern
assert.equal(count('deck-grille'), 1); assert.equal(count('deck-grille-slat'), 9); assert.equal(count('deck-cover'), 2); assert.equal(count('deck-cover-hinge'), 2);
assert.equal(count('exhaust-housing'), 1); assert.equal(count('exhaust-louvre'), 5); assert.equal(count('intake'), 1);
assert.equal(count('stern-grille'), 3); assert.equal(count('shackle-plate'), 2); assert.equal(count('tail-lamp'), 2); assert.equal(count('mud-flap'), 1);
// turret (T-14 grammar): core loft wrapped in facet slabs
assert.equal(count('citadel'), 1, 'one structural core loft');
assert.equal(count('bustle-facet-low'), 2); assert.equal(count('bustle-facet-up'), 2);
assert.equal(count('flank-facet-low'), 6); assert.equal(count('flank-facet-up'), 6);
assert.equal(count('cheek-facet-low'), 4); assert.equal(count('cheek-facet-up'), 4);
assert.equal(count('shoulder-face-low'), 2); assert.equal(count('shoulder-face-up'), 2);
assert.equal(count('bustle-face'), 1); assert.equal(count('roof-plate'), 1); assert.equal(count('turret-grille'), 1);
const facets = parts.filter((p) => /facet/.test(p.part));
assert.ok(facets.every((p) => Math.max(Math.abs(p.min[0]), Math.abs(p.max[0])) <= 1.32 + 1e-6), 'facet skins define the turret width');
assert.ok(one('citadel').max[0] <= 1.05 && one('citadel').max[1] <= 0.68 + 1e-6, 'the core stays inside the skins');
assert.equal(count('mantlet-housing'), 1); assert.equal(count('mantlet'), 1); assert.equal(count('trunnion-collar'), 1);
assert.ok(one('mantlet').method === 'addGunExtra', 'the trapezoid mantlet pitches with the gun');
assert.equal(count('mrs-collar'), 1); assert.equal(count('mrs-bracket'), 1);
assert.equal(count('gunner-sight'), 1); assert.equal(count('gunner-sight-rim'), 2); assert.equal(count('gunner-sight-cover'), 1);
assert.ok(one('gunner-sight').min[0] > 0.4, 'gunner sight right of the gun');
assert.equal(count('cheek-sensor'), 2); assert.equal(count('das'), 4); assert.equal(count('radar-panel'), 4);
assert.equal(count('smoke-tube'), 8); assert.equal(count('pod-tube'), 8); assert.equal(count('pod-cap'), 8); assert.equal(count('pod-bracket'), 2);
assert.equal(count('roof-tile'), 5); assert.equal(count('roof-tile-bolt'), 20);
assert.equal(count('stowage-box'), 2); assert.equal(count('roof-rail'), 2); assert.equal(count('antenna-pot'), 3);
for (const part of ['commander-hatch', 'roof-hatch', 'panoramic-bearing', 'panoramic-drum', 'panoramic-upper', 'panoramic-head', 'panoramic-cap',
  'rws-ring', 'rws-base', 'rws-column', 'rws-bearing', 'rws-cradle', 'rws-sensor', 'rws-sight-dome', 'met-mast', 'gps-dome', 'roof-vent', 'bustle-rail']) {
  assert.equal(count(part), 1, `${part} present once`);
}
assert.equal(count('rws-fork'), 2);
assert.ok(tank.root.getObjectByName('type100RemoteMachineGun'), 'the weapon station carries the pintle machine gun fitting');
const rwsTop = Math.max(...parts.filter((p) => p.part.startsWith('rws')).map((p) => p.max[1]));
const turretParts = parts.filter((p) => p.method !== 'addGunExtra' && p.method !== 'addGunExtraDark'
  && /^(citadel|bustle|flank|cheek|shoulder|roof-|mantlet|das|pod|commander|panoramic|met|gps|rws|turret-grille|grab|side-|antenna|gunner|smoke|radar|stowage)/.test(p.part));
assert.ok(rwsTop >= Math.max(...turretParts.map((p) => p.max[1])) - 1e-6, 'the weapon station is the tallest tagged turret part');
assert.ok(rwsTop + spec.armor.turretPivot[1] <= spec.dims.silhouetteHeightM + 0.05, 'weapon station top inside the silhouette height');
// gun and rig anchors
const muzzle = tank.root.getObjectByName('rig_muzzle');
assert.ok(muzzle, 'muzzle anchor exists');
const muzzleWorld = muzzle.getWorldPosition(new T.Vector3());
assert.ok(Math.abs(muzzleWorld.z - (spec.armor.turretPivot[2] + spec.armor.gunPivot[2] + 5.60)) < 0.02, `muzzle at ${muzzleWorld.z.toFixed(2)} m`);
assert.ok(muzzleWorld.z + 3.75 <= spec.dims.overallLengthM + 0.15, 'overall length covers the gun');
const meshes = []; tank.root.traverse((o) => { if (o.isMesh && !o.userData.shadowOnly) meshes.push(o); });
assert.ok(meshes.length > 20, 'the tank builds into buckets');
const receipt = tank.root.getObjectByName('rig_hull').userData.type100Receipt;
assert.equal(receipt?.architecture, 'type100-ztz100-r4'); assert.equal(receipt?.curtainPanelsPerSide, 8); assert.equal(receipt?.launcherTubes, 8);
console.log(`type100: ${parts.length} tagged parts — lofted body ${body.min[2].toFixed(2)}..${body.max[2].toFixed(2)} m behind 16 hanging curtains, core loft in ${facets.length} facet skins, weapon station top ${rwsTop.toFixed(2)} m (turret), 105 mm muzzle at ${muzzleWorld.z.toFixed(2)} m PASS`);
