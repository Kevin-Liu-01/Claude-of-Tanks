import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { OBJECT695_X_PROFILES, OBJECT695_X_DATUMS } from './object695X.ts';
import { TANK_SPECS, MODEL_SOURCE } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { vehicleEraForId } from '../taxonomy.ts';
import { FLEET_GROUP_BY_ID } from '../fleetManifest.ts';
import { tankLabelRecord } from '../tankLabels.ts';

// Owner-directed 2026-09-19 rebuild: retain the independently measured Object
// chassis, derive the complete corrected Epokha module from Kurganets. The old
// oracle remains authenticated hull evidence; its obsolete turret is not a gate.

const profileSource = readFileSync(new URL('./object695X.ts', import.meta.url), 'utf8');
assert.ok(!/bmp|bmpt|bumerang|t14|t-14|armata|type100|ztz|abrams|leopard|puma|bradley/i.test(profileSource.replace(/^\/\/.*$/gm, '')), 'no unrelated vehicle profile enters the build');
assert.deepEqual([...profileSource.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort(),
  ['../profileBuilderAdapter.ts', '../tankFactoryCore.ts', '../vehicleNightLighting.ts', './epokhaTurret.ts', './kit.ts', './sectionSolid.ts', './sourceStudyGunMount.ts', 'three'], 'only the narrow Epokha module plus shared primitives and rig appearance');
const record = JSON.parse(readFileSync(new URL('../../../docs/references/tanks/object695_x.source-measurements.json', import.meta.url), 'utf8'));
const spec = TANK_SPECS.object695_x;
assert.equal(spec.name, 'Object 695'); assert.equal(spec.nation, 'Russia'); assert.equal(spec.era, 'next-generation');
assert.equal(spec.role, 'ifv'); assert.equal(spec.gun.caliberMm, 57); assert.equal(tankTier('object695_x'), 10);
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
assert.deepEqual(spec.armor.gunPivot, [-.004, .707, .59], 'corrected Epokha trunnion relative to the retained Object ring');
assert.equal(spec.armor.gunBarrel.lengthM, 1.537, 'corrected short 57 mm gun');
assert.deepEqual(spec.gun.shells.map(s => [s.caliberMm, s.launcherTubes ?? 0]), [[57,0],[152,4],[70,8]]);
assert.ok(spec.gun.shells.slice(1).every(s => s.guided && s.count >= s.launcherTubes));
assert.equal(spec.dims.hullLengthM, record.dimensionsM.hullExteriorLength);
assert.equal(spec.dims.overallLengthM, record.dimensionsM.overallLength);
assert.equal(spec.dims.widthM, record.dimensionsM.widthOverSkirts);
assert.equal(spec.dims.heightM, record.dimensionsM.hullRoof);
assert.equal(spec.dims.silhouetteHeightM, OBJECT695_X_DATUMS.launcherTopM);
// datums transcribed from the record
assert.deepEqual([...OBJECT695_X_DATUMS.wheelStations], record.roadWheels.stationsZM);
assert.equal(OBJECT695_X_DATUMS.wheelR, record.roadWheels.radiusM); assert.equal(OBJECT695_X_DATUMS.wheelY, record.roadWheels.axleYM);
assert.deepEqual({ ...OBJECT695_X_DATUMS.sprocket }, { z: record.sprocket.zM, y: record.sprocket.yM, r: record.sprocket.radiusM });
assert.deepEqual({ ...OBJECT695_X_DATUMS.idler }, { z: record.idler.zM, y: record.idler.yM, r: record.idler.radiusM });
assert.deepEqual(record.returnRollers, [], 'no return rollers behind the side modules');
assert.equal(OBJECT695_X_DATUMS.muzzleZ, 1.027);
assert.equal(OBJECT695_X_DATUMS.mastTopM, 4.11415);
assert.equal(record.localOracleSha256.length, 64, 'the quarantined oracle is hash-pinned');

function checkEpokha(tank) {
  const hull = tank.root.getObjectByName('rig_hull');
  const hit = (frame, start, direction, far = 2) => {
    const ray = new T.Raycaster(frame.localToWorld(new T.Vector3(...start)),
      new T.Vector3(...direction).transformDirection(frame.matrixWorld), 0, far);
    return ray.intersectObject(tank.root, true).find(h => {
      for (let n = h.object; n; n = n.parent) if (!n.visible || n.userData.shadowOnly) return false;
      const m = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material;
      return m.visible !== false && m.colorWrite !== false;
    });
  };
  // Independent source stations translated only by the retained hull's ring.
  for (const [x,z,y,r] of [[-.019845,-2.66298,3.85,.0409],[-.638995,-2.84023,3.98,.0186],
    [-.783995,-1.23913,3.85,.01605],[-.292545,-1.22183,3.61,.0865]]) {
    const h = hit(hull,[x+.15,y-.06,z+.17],[-1,0,0]);
    assert.ok(h && Math.abs(hull.worldToLocal(h.point.clone()).x-x-r)<.0017, 'all four actual source-shaped mast faces');
  }
  for (const x of [-1.474,-1.281,1.281,1.474]) {
    const h = hit(hull,[x,2.809,-.45],[0,0,-1]);
    assert.ok(h && Math.abs(hull.worldToLocal(h.point.clone()).z+.528)<.001, 'four distinct Kornet terminal faces');
  }
  for (const [y,xs] of [[3.291,[.526,.628,.732]],[3.463,[.479,.580,.686,.789,.893]]]) for (const x of xs) {
    const h = hit(hull,[x,y-.06,-3.4],[0,0,1]);
    assert.ok(h && Math.abs(hull.worldToLocal(h.point.clone()).z+3.0775)<.001, 'eight distinct Bulat terminals');
  }
  const recoil = tank.root.getObjectByName('rig_recoil');
  const openBore = () => {
    const h = hit(recoil,[0,0,1.57],[0,0,-1]);
    assert.ok(h && Math.abs(recoil.worldToLocal(h.point.clone()).z-1.337)<.001, 'physical recessed 57 mm bore, no flat painted cap');
  };
  openBore();
  const cap = new T.Mesh(new T.CircleGeometry(.0395,24),new T.MeshBasicMaterial());
  cap.position.z=1.537;recoil.add(cap);tank.root.updateMatrixWorld(true);
  try { assert.throws(openBore,assert.AssertionError,'a flush cap must fail'); }
  finally {recoil.remove(cap);cap.geometry.dispose();cap.material.dispose();tank.root.updateMatrixWorld(true);}
  // The real coaxial receiver follows gun pitch rather than the recoiling tube.
  assert.ok(tank.root.getObjectByName('gunMountDark'), 'actual offset coaxial stock is installed on the pitching cradle');
}

await ensureInteriorFills(['object695_x']);
const costs = [];
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
    checkEpokha(tank);
    const optics=tank.root.userData.combatGeometryParts.filter(p=>p.module==='optics'&&p.parent==='turretG');
    assert.equal(optics.length,3,'all three actual Epokha glass faces publish turret-owned optics');
    const state=createTankState(spec,new T.Vector3(),0), cradle=tank.root.getObjectByName('gunMount');
    const gun=tank.root.getObjectByName('rig_gun'), recoil=tank.root.getObjectByName('rig_recoil');
    assert.equal(cradle.parent,gun,'actual cradle pitches without recoiling');
    for(const pitch of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]) {
      state.gunPitch=pitch*Math.PI/180;tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
      const fixed=cradle.getWorldPosition(new T.Vector3()), before=recoil.position.z;
      tank.recoilKick(0,1);tank.syncFromState(state,.12);tank.root.updateMatrixWorld(true);
      assert.ok(recoil.position.z<before-.02,'real cannon tube recoils at every legal pitch');
      assert.ok(cradle.getWorldPosition(new T.Vector3()).distanceTo(fixed)<1e-7,'receiving cradle stays seated during recoil');
      tank.syncFromState(state,1);assert.ok(Math.abs(recoil.position.z-before)<1e-6);
    }
    state.gunPitch=0;tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
    let triangles=0,meshes=0;
    tank.root.traverseVisible(o=>{
      if(!o.isMesh||o.userData.shadowOnly)return;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      if(mats.every(m=>m.visible===false||m.colorWrite===false))return;
      meshes++;triangles+=Math.min(o.geometry.index?.count??o.geometry.attributes.position.count,o.geometry.drawRange.count)/3*(o.isInstancedMesh?o.count:1);
    });
    costs.push({quality,triangles,meshes});
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
    assert.equal(rig.architecture, 'object695-x-epokha-r2'); assert.equal(rig.roadWheelsPerSide, 7);
    assert.deepEqual(rig.pivot, [...record.turretPivotM]);
    const turretNode = tank.root.getObjectByName('rig_turret'), gunNode = tank.root.getObjectByName('rig_gun');
    assert.ok(turretNode && gunNode, 'module and gun frames exist');
    const muzzle = new T.Vector3(0, 0, rig.gunLengthM);
    gunNode.localToWorld(muzzle);
    hull.worldToLocal(muzzle);
    assert.ok(Math.abs(muzzle.z - OBJECT695_X_DATUMS.muzzleZ) < .001 &&
      Math.abs(muzzle.y - OBJECT695_X_DATUMS.trunnion[1]) < .001, 'actual short gun matches the registered firing frame');

    // envelope: nothing wider than the side modules, nothing ahead of the nose, the masts define the height
    const bounds = new T.Box3().setFromObject(tank.root);
    assert.ok(bounds.max.x <= 2.01 && bounds.min.x >= -2.01, 'width over the side modules');
    assert.ok(bounds.max.z <= record.hullM.noseZ + 0.05, 'nothing ahead of the nose');
    assert.ok(Math.abs(bounds.max.y - OBJECT695_X_DATUMS.mastTopM) < 0.03, `tallest point ${bounds.max.y.toFixed(3)} at the measured ${OBJECT695_X_DATUMS.mastTopM}`);
    console.log(JSON.stringify({ id: 'object695_x', quality, parts: parts.length, width: +(bounds.max.x - bounds.min.x).toFixed(3), height: +bounds.max.y.toFixed(3), length: +(bounds.max.z - bounds.min.z).toFixed(3) }));
  } finally { tank.dispose(); }
}
console.log('object695X: PASS',JSON.stringify(costs));
