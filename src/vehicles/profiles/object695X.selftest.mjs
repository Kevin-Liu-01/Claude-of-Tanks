import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { OBJECT695_X_PROFILES, OBJECT695_X_DATUMS } from './object695X.ts';
import { TANK_SPECS, MODEL_SOURCE } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { vehicleEraForId } from '../taxonomy.ts';
import { FLEET_GROUP_BY_ID } from '../fleetManifest.ts';
import { tankLabelRecord } from '../tankLabels.ts';

// Object 695 (owner 2026-09-17): generated from the owner's supplied Armored Warfare reference model through the
// source-study procedure — the local oracle is measured (docs/references/tanks/object695_x.source-measurements.json),
// the scalars are transcribed into OBJECT695_X_DATUMS and the tank is an original primitive construction that imports
// no other profile. The receipt pins the roster identity (a tier X Russian IFV whose 30 mm belt is the fleet's fastest
// and hardest-hitting — the owner's "machine gun like machine gun that's very powerful"), the measured datums against
// the record, the part census at the builder port, the running-gear receipt (seven wheels, rear drive, raised front
// idler, no return rollers), the envelopes and the gun anchor.

const profileSource = readFileSync(new URL('./object695X.ts', import.meta.url), 'utf8');
assert.ok(!/bmp|bmpt|bumerang|t14|t-14|armata|type100|ztz|abrams|leopard|puma|bradley/i.test(profileSource.replace(/^\/\/.*$/gm, '')), 'the Object 695 imports and imitates no other profile');
assert.deepEqual([...profileSource.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort(),
  ['../profileBuilderAdapter.ts', '../tankFactoryCore.ts', '../vehicleNightLighting.ts', './kit.ts', './sectionSolid.ts', 'three'], 'only the shared kit, loft and lighting modules');
const record = JSON.parse(readFileSync(new URL('../../../docs/references/tanks/object695_x.source-measurements.json', import.meta.url), 'utf8'));
const spec = TANK_SPECS.object695_x;
assert.equal(spec.name, 'Object 695'); assert.equal(spec.nation, 'Russia'); assert.equal(spec.era, 'next-generation');
assert.equal(spec.role, 'ifv'); assert.equal(spec.gun.caliberMm, 30); assert.equal(tankTier('object695_x'), 10);
assert.equal(vehicleEraForId('object695_x'), 'next-generation'); assert.equal(FLEET_GROUP_BY_ID.object695_x, 'modern2');
assert.equal(tankLabelRecord(spec).shortName, 'Object 695');
assert.equal(MODEL_SOURCE.object695_x.source, 'procedural', 'the oracle never enters the runtime');
assert.equal(spec.visual.scheme, 'digital');
// the owner's belt: the fastest cycle and the highest belt damage-per-minute of every selectable IFV
const belt = spec.gun.shells[0];
assert.ok(belt.reloadS <= 0.26 && belt.dmg >= 88, 'a very powerful machine-gun-like belt');
for (const other of Object.values(TANK_SPECS)) {
  if (other.role !== 'ifv' || other.id === spec.id) continue;
  const round = other.gun.shells[0];
  assert.ok(belt.dmg / belt.reloadS > round.dmg / round.reloadS, `${other.id}: the Object 695 belt out-damages every other IFV belt per minute`);
}
assert.ok(spec.gun.shells.some((round) => round.guided), 'Kornet-EM guided rounds ride beside the belt');
assert.deepEqual(spec.armor.turretPivot, [...record.turretPivotM], 'module pivot from the measured record');
assert.deepEqual(spec.armor.gunPivot, [0, +(record.gunAxisM[1] - record.turretPivotM[1]).toFixed(4), +(record.gunAxisM[2] - record.turretPivotM[2]).toFixed(4)], 'trunnion from the measured gun axis');
assert.ok(Math.abs(spec.armor.gunBarrel.lengthM - (record.muzzleZM - record.gunAxisM[2])) < 1e-6, 'barrel reaches the measured muzzle');
assert.equal(spec.dims.hullLengthM, record.dimensionsM.hullExteriorLength);
assert.equal(spec.dims.overallLengthM, record.dimensionsM.overallLength);
assert.equal(spec.dims.widthM, record.dimensionsM.widthOverSkirts);
assert.equal(spec.dims.heightM, record.dimensionsM.hullRoof);
assert.equal(spec.dims.silhouetteHeightM, record.dimensionsM.launcherTop);
// datums transcribed from the record
assert.deepEqual([...OBJECT695_X_DATUMS.wheelStations], record.roadWheels.stationsZM);
assert.equal(OBJECT695_X_DATUMS.wheelR, record.roadWheels.radiusM); assert.equal(OBJECT695_X_DATUMS.wheelY, record.roadWheels.axleYM);
assert.deepEqual({ ...OBJECT695_X_DATUMS.sprocket }, { z: record.sprocket.zM, y: record.sprocket.yM, r: record.sprocket.radiusM });
assert.deepEqual({ ...OBJECT695_X_DATUMS.idler }, { z: record.idler.zM, y: record.idler.yM, r: record.idler.radiusM });
assert.deepEqual(record.returnRollers, [], 'no return rollers behind the side modules');
assert.equal(OBJECT695_X_DATUMS.muzzleZ, record.muzzleZM);
assert.equal(OBJECT695_X_DATUMS.mastTopM, record.dimensionsM.highestFitting);
assert.equal(record.localOracleSha256.length, 64, 'the quarantined oracle is hash-pinned');

const parts = [];
registerProfiledBuilders({ object695_x: (P) => OBJECT695_X_PROFILES.object695_x.build(new Proxy(P, {
  get(target, key) {
    if (['add', 'addEquipment', 'addExternalArmor', 'addCupola', 'addGunExtra', 'addGunExtraDark', 'addModuleVisual'].includes(key)) {
      return (...args) => {
        const geometry = args.find((a) => a && a.isBufferGeometry);
        if (geometry?.userData.object695) {
          geometry.computeBoundingBox();
          const b = geometry.boundingBox;
          const nums = args.filter((a) => typeof a === 'number');
          const [x = 0, y = 0, z = 0] = nums;
          parts.push({ part: geometry.userData.object695, method: key, min: [b.min.x + x, b.min.y + y, b.min.z + z], max: [b.max.x + x, b.max.y + y, b.max.z + z] });
        }
        return target[key](...args);
      };
    }
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  },
})) });

for (const quality of ['high', 'low']) {
  parts.length = 0;
  const tank = createTank('object695_x', null, { proceduralOnly: true, geometryReceipt: true, quality, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    const count = (part) => parts.filter((p) => p.part === part).length;
    const one = (part) => parts.find((p) => p.part === part);
    const body = one('hull-body');
    assert.equal(count('hull-body'), 1, 'the hull is one station loft');
    assert.ok(body.min[2] <= -3.45 && body.max[2] >= 3.57, 'stern plate to nose');
    assert.ok(Math.abs(body.max[1] - 2.19) < 1e-6, 'the rear roof is the highest hull plane');
    assert.ok(body.min[1] >= 0.55, 'the belly clears the ground datum');
    assert.equal(count('side-module'), 14, 'seven side armour modules a side');
    assert.ok(Math.abs(Math.max(...parts.filter((p) => p.part === 'module-front-chamfer').map((p) => p.max[2])) - 3.40) < 1e-6, 'the prow apex reaches the measured z 3.40');
    const modules = parts.filter((p) => p.part === 'side-module');
    assert.ok(Math.abs(Math.max(...modules.map((p) => p.max[0])) - 1.99) < 1e-6, 'modules out to the measured 1.99');
    assert.ok(Math.abs(Math.min(...modules.map((p) => p.min[1])) - 0.80) < 1e-6 && Math.abs(Math.max(...modules.map((p) => p.max[1])) - 1.95) < 1e-6, 'module band y 0.80–1.95');
    assert.equal(count('module-rear-chamfer'), 2); assert.equal(count('module-front-chamfer'), 4, 'two prow wedges a side'); assert.equal(count('mudguard'), 4); assert.equal(count('ring-fitting'), 2);
    assert.equal(count('ramp-door'), 1, 'the ramp is closed'); assert.equal(count('stern-box'), 2); assert.equal(count('rear-roof-hatch'), 1); assert.equal(count('rear-roof-post'), 2); assert.equal(count('rear-right-box'), 1); assert.equal(count('rear-rack-lid'), 1); assert.equal(count('rear-rack-post'), 4);
    // 2026-09-18: the boxes end at the source's stern SILHOUETTE (z −3.56; the record's −3.60 is their outermost fitting) so the
    // geometry gate's body-extent law reads the same hull length as the source (dims 87.1 → 96.7)
    const sternBoxAft = Math.min(...parts.filter((p) => p.part === 'stern-box').map((p) => p.min[2]));
    assert.ok(sternBoxAft <= -3.55 && sternBoxAft >= -3.575, `stern boxes end at the source's stern silhouette (${sternBoxAft.toFixed(3)})`);
    assert.equal(count('driver-hatch'), 1); assert.equal(count('lamp-box'), 2); assert.equal(count('tow-eye'), 4); assert.equal(count('intake-drum'), 1);
    assert.equal(count('smoke-tube'), 10); assert.equal(count('deck-louvre'), 1); assert.equal(count('nose-lip'), 1);
    // module
    assert.equal(count('turret-rear-block'), 1); assert.equal(count('turret-front-block'), 1); assert.equal(count('turret-belt'), 1);
    const rear = one('turret-rear-block');
    assert.ok(Math.abs(rear.max[0] - 1.05) < 1e-6 && Math.abs(rear.max[1] - 0.90) < 1e-6, 'measured rear block width and crown');
    assert.equal(count('pod-upper'), 2); assert.equal(count('pod-lower'), 2); assert.equal(count('bustle-box'), 2);
    assert.ok(Math.abs(Math.max(...parts.filter((p) => p.part === 'pod-upper').map((p) => p.max[0])) - 1.50) < 1e-6, 'pods out to the measured 1.50');
    assert.equal(count('launcher-box'), 1); assert.equal(count('launcher-tube'), 4, 'four-tube launcher'); assert.equal(count('launcher-mouth'), 4);
    assert.ok(Math.abs(one('launcher-box').max[1] + record.turretPivotM[1] - record.dimensionsM.launcherTop) < 1e-6, 'launcher top at the measured 3.49');
    assert.equal(count('mast'), 4, 'four whip masts');
    assert.ok(Math.abs(Math.max(...parts.filter((p) => p.part === 'mast').map((p) => p.max[1])) + record.turretPivotM[1] - record.dimensionsM.highestFitting) < 0.01, 'tallest mast at the measured 4.03');
    assert.equal(count('gunner-sight'), 1); assert.equal(count('commander-sight'), 1); assert.equal(count('periscope-column'), 1);
    assert.equal(count('roof-hatch'), 2); assert.equal(count('flash-hider'), 1); assert.equal(count('gun-sleeve'), 1);
    // the fleet machine-gun fitting is the module's coaxial gun (KIT.fittings census mg >= 1)
    assert.ok(tank.root.getObjectByName('object695CoaxialMachineGun'), 'the module carries the pintle machine gun fitting as its coaxial gun');
    // running gear receipt
    const hull = tank.root.getObjectByName('rig_hull');
    const gear = hull.userData.runningGearReceipts.at(-1);
    assert.deepEqual(gear.wheelZs, [...OBJECT695_X_DATUMS.wheelStations], 'seven measured road-wheel stations');
    assert.equal(gear.wheelR, OBJECT695_X_DATUMS.wheelR); assert.equal(gear.trackTh, 0.028, 'fleet-standard band');
    assert.ok(Math.abs(gear.sprocket.z - OBJECT695_X_DATUMS.sprocket.z) < 1e-9 && Math.abs(gear.idler.z - OBJECT695_X_DATUMS.idler.z) < 1e-9, 'drive aft, raised idler forward');
    assert.ok(Math.abs(gear.xcLeft - OBJECT695_X_DATUMS.trackX) < 1e-9 && Math.abs(gear.trackW - OBJECT695_X_DATUMS.trackW) < 1e-9, 'measured track lane');
    const tires = hull.getObjectByName('gearRoadWheelTires');
    assert.equal(tires.count, 14, 'seven road wheels a side');
    // rig and gun anchor
    const rig = hull.userData.object695Receipt;
    assert.equal(rig.architecture, 'object695-x-r1'); assert.equal(rig.roadWheelsPerSide, 7);
    assert.deepEqual(rig.pivot, [...record.turretPivotM]);
    const turretNode = tank.root.getObjectByName('rig_turret'), gunNode = tank.root.getObjectByName('rig_gun');
    assert.ok(turretNode && gunNode, 'module and gun frames exist');
    const muzzle = new T.Vector3(0, 0, rig.gunLengthM);
    gunNode.localToWorld(muzzle);
    hull.worldToLocal(muzzle);
    assert.ok(Math.abs(muzzle.z - record.muzzleZM) < 0.01 && Math.abs(muzzle.y - record.gunAxisM[1]) < 0.01, `muzzle at the measured (${record.gunAxisM[1]}, ${record.muzzleZM}); got (${muzzle.y.toFixed(3)}, ${muzzle.z.toFixed(3)})`);
    // envelope: nothing wider than the side modules, nothing ahead of the nose, the masts define the height
    const bounds = new T.Box3().setFromObject(tank.root);
    assert.ok(bounds.max.x <= 2.01 && bounds.min.x >= -2.01, 'width over the side modules');
    assert.ok(bounds.max.z <= record.hullM.noseZ + 0.05, 'nothing ahead of the nose');
    assert.ok(Math.abs(bounds.max.y - record.dimensionsM.highestFitting) < 0.03, `tallest point ${bounds.max.y.toFixed(3)} at the measured ${record.dimensionsM.highestFitting}`);
    console.log(JSON.stringify({ id: 'object695_x', quality, parts: parts.length, width: +(bounds.max.x - bounds.min.x).toFixed(3), height: +bounds.max.y.toFixed(3), length: +(bounds.max.z - bounds.min.z).toFixed(3) }));
  } finally { tank.dispose(); }
}
console.log('object695X: PASS');
