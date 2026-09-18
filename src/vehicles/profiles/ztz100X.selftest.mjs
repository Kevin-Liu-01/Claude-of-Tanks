import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { ZTZ100_X_PROFILES, ZTZ100_X_DATUMS } from './ztz100X.ts';
import { TANK_SPECS, MODEL_SOURCE } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { vehicleEraForId } from '../taxonomy.ts';
import { FLEET_GROUP_BY_ID } from '../fleetManifest.ts';
import { tankLabelRecord } from '../tankLabels.ts';

// ZTZ-100 (owner 2026-09-17): generated from the owner's supplied "[OD]ZTZ-20 Test-3" reference model through the
// source-study procedure — the local oracle is measured (docs/references/tanks/ztz100_x.source-measurements.json),
// the scalars are transcribed into ZTZ100_X_DATUMS and the tank is an original primitive construction that imports no
// other profile (owner: "completely separate following completely inspired generation"). The receipt
// pins the roster identity, the measured datums against the record, the part census at the builder port, the
// running-gear receipt (seven wheels, rear drive, front idler, two rollers), the envelopes and the gun anchor.

const profileSource = readFileSync(new URL('./ztz100X.ts', import.meta.url), 'utf8');
assert.ok(!/type100|Type 100|T-90|T-14|abrams|leopard/i.test(profileSource.replace(/^\/\/.*$/gm, '')), 'the ZTZ-100 imports and imitates no other profile');
assert.deepEqual([...profileSource.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort(),
  ['../profileBuilderAdapter.ts', '../tankFactoryCore.ts', '../vehicleNightLighting.ts', './kit.ts', './sectionSolid.ts', 'three'], 'only the shared kit, loft and lighting modules');
const record = JSON.parse(readFileSync(new URL('../../../docs/references/tanks/ztz100_x.source-measurements.json', import.meta.url), 'utf8'));
const spec = TANK_SPECS.ztz100_x;
assert.equal(spec.name, 'ZTZ-100'); assert.equal(spec.nation, 'China'); assert.equal(spec.era, 'next-generation');
assert.equal(spec.role, 'mbt'); assert.equal(spec.gun.caliberMm, 105); assert.equal(tankTier('ztz100_x'), 10);
assert.equal(vehicleEraForId('ztz100_x'), 'next-generation'); assert.equal(FLEET_GROUP_BY_ID.ztz100_x, 'modern2');
assert.equal(tankLabelRecord(spec).shortName, 'ZTZ-100');
assert.equal(MODEL_SOURCE.ztz100_x.source, 'procedural', 'the oracle never enters the runtime');
assert.equal(spec.visual.scheme, 'digital');
assert.deepEqual(spec.armor.turretPivot, [...record.turretPivotM], 'turret pivot from the measured record');
assert.deepEqual(spec.armor.gunPivot, [0, +(record.gunAxisM[1] - record.turretPivotM[1]).toFixed(4), +(record.gunAxisM[2] - record.turretPivotM[2]).toFixed(4)], 'trunnion from the measured gun axis');
assert.ok(Math.abs(spec.armor.gunBarrel.lengthM - (record.muzzleZM - record.gunAxisM[2])) < 1e-6, 'barrel reaches the measured muzzle');
assert.equal(spec.dims.hullLengthM, record.dimensionsM.hullExteriorLength);
assert.equal(spec.dims.overallLengthM, record.dimensionsM.overallLength);
assert.equal(spec.dims.widthM, record.dimensionsM.widthOverSkirts);
assert.equal(spec.dims.heightM, record.dimensionsM.turretRoof);
assert.equal(spec.dims.silhouetteHeightM, record.dimensionsM.highestFitting);
// datums transcribed from the record
assert.deepEqual([...ZTZ100_X_DATUMS.wheelStations], record.roadWheels.stationsZM);
assert.equal(ZTZ100_X_DATUMS.wheelR, record.roadWheels.radiusM); assert.equal(ZTZ100_X_DATUMS.wheelY, record.roadWheels.axleYM);
assert.deepEqual({ ...ZTZ100_X_DATUMS.sprocket }, { z: record.sprocket.zM, y: record.sprocket.yM, r: record.sprocket.radiusM });
assert.deepEqual({ ...ZTZ100_X_DATUMS.idler }, { z: record.idler.zM, y: record.idler.yM, r: record.idler.radiusM });
assert.deepEqual(ZTZ100_X_DATUMS.rollers.map((r) => ({ ...r })), record.returnRollers.map((r) => ({ z: r.zM, y: r.yM, r: r.radiusM })));
assert.equal(ZTZ100_X_DATUMS.muzzleZ, record.muzzleZM);
assert.equal(record.localOracleSha256.length, 64, 'the quarantined oracle is hash-pinned');

const parts = [];
registerProfiledBuilders({ ztz100_x: (P) => ZTZ100_X_PROFILES.ztz100_x.build(new Proxy(P, {
  get(target, key) {
    if (['add', 'addEquipment', 'addExternalArmor', 'addCupola', 'addGunExtra', 'addGunExtraDark', 'addModuleVisual'].includes(key)) {
      return (...args) => {
        const geometry = args.find((a) => a && a.isBufferGeometry);
        if (geometry?.userData.ztz100) {
          geometry.computeBoundingBox();
          const b = geometry.boundingBox;
          const nums = args.filter((a) => typeof a === 'number');
          const [x = 0, y = 0, z = 0] = nums;
          parts.push({ part: geometry.userData.ztz100, method: key, min: [b.min.x + x, b.min.y + y, b.min.z + z], max: [b.max.x + x, b.max.y + y, b.max.z + z] });
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
  const tank = createTank('ztz100_x', null, { proceduralOnly: true, geometryReceipt: true, quality, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    const count = (part) => parts.filter((p) => p.part === part).length;
    const one = (part) => parts.find((p) => p.part === part);
    const body = one('hull-body');
    assert.equal(count('hull-body'), 1, 'the hull is one station loft');
    assert.ok(body.min[2] <= -3.37 && body.max[2] >= 3.54, 'stern plate to nose');
    assert.ok(Math.abs(body.max[1] - 1.50) < 1e-6, 'the raised engine deck is the highest hull plane');
    assert.ok(body.min[1] >= 0.34, 'the belly clears the ground datum');
    assert.equal(count('skirt-upper'), 18, 'nine upper skirt panels a side, the aft one beside the stern bin'); assert.equal(count('sponson-box-aft'), 4);
    assert.equal(count('skirt-lower'), 12, 'six lower skirt panels a side over the measured z −2.6..2.8'); assert.equal(count('skirt-lip'), 10, 'the inboard lip course under them, z −2.2..2.4');
    const upper = parts.filter((p) => p.part === 'skirt-upper');
    assert.ok(Math.abs(Math.max(...upper.map((p) => p.max[0])) - 1.849) < 1e-6, 'forward skirt plane at the measured 1.849');
    assert.ok(Math.abs(Math.max(...upper.filter((p) => p.max[2] < -0.40).map((p) => p.max[0])) - 1.765) < 1e-6, 'aft skirt plane at the measured 1.765');
    assert.equal(count('sponson-box'), 2); assert.equal(count('glacis-plate'), 8, 'two tiers of appliqué plates plus the centre pair');
    assert.equal(count('driver-hood'), 1); assert.equal(count('lamp'), 2); assert.equal(count('tow-eye'), 4); assert.equal(count('bustle-basket'), 2);
    assert.equal(count('deck-rack-floor'), 1); assert.equal(count('cage-bar'), 24, 'eight-bar slat cage across the stern and along both rear flanks'); assert.equal(count('stern-grille'), 1); assert.equal(count('deck-grille'), 2);
    assert.ok(Math.min(...parts.filter((p) => p.part === 'cage-bar').map((p) => p.min[2])) <= -4.07, 'the cage reaches the measured rear extreme');
    // turret
    const turret = one('turret-body');
    assert.equal(count('turret-body'), 1, 'the turret is one faceted loft');
    assert.ok(Math.abs(turret.max[0] - 1.50) < 1e-6 && Math.abs(turret.max[1] - 0.90) < 1e-6, 'measured pod line and plateau');
    assert.ok(turret.min[2] <= -2.04 && turret.max[2] >= 1.67, 'bustle rear to housing front');
    assert.equal(count('tower-drum'), 2, 'two sensor towers');
    assert.ok(Math.abs(Math.max(...parts.filter((p) => p.part.startsWith('tower')).map((p) => p.max[1])) + record.turretPivotM[1] - 2.54) < 0.03, 'tower tops at the measured 2.54'); assert.equal(count('rws-fork'), 2); // 2026-09-17: the gun body is the pintle fitting (checked below), no hand-built 'rws-body'
    assert.equal(count('rws-tube'), 2); assert.equal(count('missile-bank'), 1); assert.equal(count('panoramic-drum'), 1);
    // 2026-09-17 release gate: the fleet pintle machine-gun fitting is the station's gun (KIT.fittings census mg >= 1)
    assert.ok(tank.root.getObjectByName('ztz100RemoteMachineGun'), 'the weapon station carries the pintle machine gun fitting');
    assert.equal(count('cage-bin'), 1, 'the stern bin body closes the top silhouette inside the slat cage');
    assert.equal(count('smoke-tube'), 8); assert.equal(count('roof-hatch'), 2); assert.equal(count('mantlet'), 1);
    assert.equal(count('brake-baffle'), 6, 'multi-baffle muzzle brake');
    // running gear receipt
    const hull = tank.root.getObjectByName('rig_hull');
    const gear = hull.userData.runningGearReceipts.at(-1);
    assert.deepEqual(gear.wheelZs, [...ZTZ100_X_DATUMS.wheelStations], 'seven measured road-wheel stations');
    assert.equal(gear.wheelR, ZTZ100_X_DATUMS.wheelR); assert.equal(gear.trackTh, 0.028, 'fleet-standard band');
    assert.ok(Math.abs(gear.sprocket.z - ZTZ100_X_DATUMS.sprocket.z) < 1e-9 && Math.abs(gear.idler.z - ZTZ100_X_DATUMS.idler.z) < 1e-9, 'drive aft, idler forward');
    assert.ok(Math.abs(gear.xcLeft - ZTZ100_X_DATUMS.trackX) < 1e-9 && Math.abs(gear.trackW - ZTZ100_X_DATUMS.trackW) < 1e-9, 'measured track lane');
    const tires = hull.getObjectByName('gearRoadWheelTires');
    assert.equal(tires.count, 14, 'seven road wheels a side');
    // rig and gun anchor
    const rig = hull.userData.ztz100Receipt;
    assert.equal(rig.architecture, 'ztz100-x-r2'); assert.equal(rig.roadWheelsPerSide, 7);
    assert.deepEqual(rig.pivot, [...record.turretPivotM]);
    const turretNode = tank.root.getObjectByName('rig_turret'), gunNode = tank.root.getObjectByName('rig_gun');
    assert.ok(turretNode && gunNode, 'turret and gun frames exist');
    const muzzle = new T.Vector3(0, 0, rig.gunLengthM);
    gunNode.localToWorld(muzzle);
    hull.worldToLocal(muzzle);
    assert.ok(Math.abs(muzzle.z - record.muzzleZM) < 0.01 && Math.abs(muzzle.y - record.gunAxisM[1]) < 0.01, `muzzle at the measured (${record.gunAxisM[1]}, ${record.muzzleZM}); got (${muzzle.y.toFixed(3)}, ${muzzle.z.toFixed(3)})`);
    // envelope: nothing above the weapon station, nothing wider than the skirts
    const bounds = new T.Box3().setFromObject(tank.root);
    // the whips are the fleet's antenna convention; the measured highest fitting is the weapon station top
    const rwsTop = Math.max(...parts.filter((p) => p.part.startsWith('rws')).map((p) => p.max[1])) + record.turretPivotM[1];
    assert.ok(Math.abs(rwsTop - record.dimensionsM.highestFitting) < 0.08, `weapon station top ${rwsTop.toFixed(3)} at the measured ${record.dimensionsM.highestFitting}`);
    assert.ok(bounds.max.x <= 1.87 && bounds.min.x >= -1.87, 'width over skirts');
    assert.ok(bounds.max.z <= record.muzzleZM + 0.05, 'nothing ahead of the muzzle');
    console.log(JSON.stringify({ id: 'ztz100_x', quality, parts: parts.length, width: +(bounds.max.x - bounds.min.x).toFixed(3), height: +bounds.max.y.toFixed(3), length: +(bounds.max.z - bounds.min.z).toFixed(3) }));
  } finally { tank.dispose(); }
}
console.log('ztz100X: PASS');
