// Release 262 (owner 2026-10-27: "the ztz 20 should be completely new, not based off of qilin, and the ztz 100 is its
// prototype, ztz 20 needs to be designed from scratch and then it should update the ztz 100"; then "keep the ztz 100
// prototype then add the ztz 20 and then have a ztz 20 prototype"). The ZTZ-20 family receipt: the builder is its own
// (no Qilin/Kunlun/Yun, Type 99, Longwei or retired ZTZ-100 stock), the four stages share one
// measured hull, gear and turret frame and differ only by their typed deltas, every delta is visible in the part census,
// the datums are the concept rows' (tools/first-party-concept-policy.mjs), the running gear holds the measured stations,
// the gun reaches its measured muzzle through a recessed bore, the slat cage keeps its air, and every turret part outside
// the ring collar clears the hull top at every turret yaw (a block laid on the deck fails the same check).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { TANK_SPECS, MODEL_SOURCE } from '../specs.ts';
import { vehicleEraForId } from '../taxonomy.ts';
import { FLEET_GROUP_BY_ID } from '../fleetManifest.ts';
import { tankLabelRecord } from '../tankLabels.ts';
import { displayTier } from '../../techTree/tiers.ts';
import { ZTZ20_DATUMS, ZTZ20_STAGES } from './ztz20Family.ts';
import { ZTZ20_PROFILES } from './ztz20.ts';
import { ZTZ100_PROTOTYPE_PROFILES } from './ztz100Prototype.ts';
import { firstPartyConcept } from '../../../tools/first-party-concept-policy.mjs';

// ------------------------------------------------------------------------------------------------ independence
const source = readFileSync(new URL('./ztz20Family.ts', import.meta.url), 'utf8');
assert.deepEqual([...source.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort(), [
  '../factoryGeometry.ts', '../nationWheelConstructions.ts', '../tankFactoryCore.ts', '../vehicleAuxiliaryGeometry.ts',
  '../vehicleNightLighting.ts', './abramsSourceXTrackShoe.ts', './auxiliaryStation.ts', './kit.ts', './lathedWheelStock.ts',
  './sectionSolid.ts', 'three', 'three/addons/geometries/ConvexGeometry.js',
], 'the family imports the shared kit vocabulary only');
const code = source.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, '');
assert.doesNotMatch(code, /qilin|kunlun|yun|longwei|type99|type96|ztz100X|buildZTZ99|chineseFrontline/i, 'no donor tank participates');

// ------------------------------------------------------------------------------------------------ identity
const expected = {
  ztz20: { name: 'ZTZ-20', caliber: 105, tier: 10 },
  ztz100: { name: 'ZTZ-100', caliber: 105, tier: 10 },
  ztz100_prototype: { name: 'ZTZ-100 Prototype', caliber: 35, tier: 10 },
  ztz20_prototype: { name: 'ZTZ-20 Prototype', caliber: 105, tier: 10 },
};
for (const [id, want] of Object.entries(expected)) {
  const spec = TANK_SPECS[id];
  assert.equal(spec.name, want.name); assert.equal(spec.nation, 'China'); assert.equal(spec.era, 'next-generation');
  assert.equal(vehicleEraForId(id), 'next-generation'); assert.equal(FLEET_GROUP_BY_ID[id], 'modern2');
  assert.equal(MODEL_SOURCE[id].source, 'procedural', `${id}: the oracle never enters the runtime`);
  assert.equal(spec.gun.caliberMm, want.caliber); assert.equal(displayTier(id), want.tier);
  assert.deepEqual(spec.armor.turretPivot, [...ZTZ20_DATUMS.turretPivot], `${id}: one turret ring for the family`);
  const design = firstPartyConcept(id);
  assert.ok(design, `${id}: an owner-authored concept row`);
  assert.deepEqual(spec.armor.turretPivot, design.ring);
}
assert.equal(tankLabelRecord(TANK_SPECS.ztz20).shortName, 'ZTZ-20');
for (const id of ['ztz20', 'ztz20_prototype', 'ztz100']) {
  const spec = TANK_SPECS[id];
  assert.deepEqual(spec.armor.gunPivot, [0, ZTZ20_DATUMS.trunnion[1] - ZTZ20_DATUMS.turretPivot[1], ZTZ20_DATUMS.trunnion[2] - ZTZ20_DATUMS.turretPivot[2]].map((v) => +v.toFixed(4)));
  // the combat barrel is the drawn muzzle (the concept rows): the production brake's 0.08 m end cap, the pre-production
  // gun's sleeve at 0.104 (its round brake's 0.095 inside the census's 2 cm), the bare-tube testbed's 0.072
  assert.equal(spec.armor.gunBarrel.lengthM, ZTZ20_DATUMS.barrelLengthM);
  assert.equal(spec.armor.gunBarrel.radiusM, firstPartyConcept(id).barrelRadiusM);
  assert.equal(firstPartyConcept(id).barrelRadiusM, { ztz20: 0.08, ztz100: 0.104, ztz20_prototype: ZTZ20_DATUMS.barrelRadiusM }[id]);
}
// the production type outguns and outlasts its earlier steps; its turret testbed sits at or below it throughout
assert.ok(TANK_SPECS.ztz20.gun.shells[0].pen100Mm > TANK_SPECS.ztz100.gun.shells[0].pen100Mm);
assert.ok(TANK_SPECS.ztz20.gun.reloadS < TANK_SPECS.ztz100.gun.reloadS);
const [z20, z20p] = [TANK_SPECS.ztz20, TANK_SPECS.ztz20_prototype];
assert.ok(z20p.gun.shells[0].pen100Mm <= z20.gun.shells[0].pen100Mm && z20p.gun.reloadS >= z20.gun.reloadS && z20p.hp <= z20.hp
  && z20p.gun.baseAccuracy >= z20.gun.baseAccuracy && z20p.gun.aimTimeS >= z20.gun.aimTimeS && z20p.topSpeedKmh <= z20.topSpeedKmh,
  'the ZTZ-20 Prototype at or below the ZTZ-20');

// ------------------------------------------------------------------------------------------------ census
const parts = [];
const census = (build) => (P) => build(new Proxy(P, {
  get(target, key) {
    if (['add', 'addEquipment', 'addExternalArmor', 'addCupola', 'addHatch', 'addGunExtra', 'addGunExtraDark', 'addModuleVisual'].includes(key)) {
      return (...args) => {
        const geometry = args.find((a) => a && a.isBufferGeometry);
        const name = geometry?.userData.ztz20 ?? geometry?.userData.ztz100;
        if (name) {
          geometry.computeBoundingBox();
          const b = geometry.boundingBox, [x = 0, y = 0, z = 0] = args.filter((a) => typeof a === 'number');
          parts.push({ part: name, bucket: args.find((a) => typeof a === 'string' && a !== key), min: [b.min.x + x, b.min.y + y, b.min.z + z], max: [b.max.x + x, b.max.y + y, b.max.z + z] });
        }
        return target[key](...args);
      };
    }
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  },
}));
registerProfiledBuilders({
  ztz20: census(ZTZ20_PROFILES.ztz20.build), ztz100: census(ZTZ20_PROFILES.ztz100.build),
  ztz100_prototype: census(ZTZ100_PROTOTYPE_PROFILES.ztz100_prototype.build),
  ztz20_prototype: census(ZTZ20_PROFILES.ztz20_prototype.build),
});

/** Hull top height map (2 cm) from every visible hull mesh outside the turret, in the hull frame. */
function hullTopMap(hull, turret) {
  const R = 0.02, X0 = -2.0, Z0 = -4.3, nx = 200, nz = 500, top = new Float32Array(nx * nz).fill(-Infinity);
  const inv = new T.Matrix4().copy(hull.matrixWorld).invert(), m = new T.Matrix4(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  hull.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    for (let p = o; p; p = p.parent) if (p === turret) return;
    const g = o.geometry, pos = g.getAttribute('position'), idx = g.index, n = idx ? idx.count : pos.count;
    const instances = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < instances; k++) {
      m.multiplyMatrices(inv, o.matrixWorld);
      if (o.isInstancedMesh) { const im = new T.Matrix4(); o.getMatrixAt(k, im); m.multiply(im); }
      for (let i = 0; i < n; i += 3) {
        a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
        b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m);
        c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m);
        const y = Math.max(a.y, b.y, c.y);
        const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - X0) / R)), x1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - X0) / R));
        const z0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - Z0) / R)), z1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - Z0) / R));
        for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) if (y > top[iz * nx + ix]) top[iz * nx + ix] = y;
      }
    }
  });
  return { at: (x, z) => { const ix = Math.floor((x - X0) / R), iz = Math.floor((z - Z0) / R); return ix < 0 || iz < 0 || ix >= nx || iz >= nz ? -Infinity : top[iz * nx + ix]; } };
}
/** The turret's lowest stock (outside the ring collar) against the hull top, swept round the ring every 5 degrees. */
function turretSweepClearance(turret, map, ring) {
  const pts = [], inv = new T.Matrix4().copy(turret.matrixWorld).invert(), m = new T.Matrix4(), v = new T.Vector3();
  turret.traverse((o) => {
    if (!o.isMesh || !o.visible || o.name === 'rig_gun') return;
    for (let p = o; p && p !== turret; p = p.parent) if (p.name === 'rig_gun') return;
    const pos = o.geometry.getAttribute('position');
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      // the ring and its race (the missile testbed's ring stands 0.10 m ahead of the pivot) bear below the ring plane
      if (v.y < 0.20 && !(Math.hypot(v.x, v.z) < 1.32 && v.y < 0.03)) pts.push(v.x, v.y, v.z);
    }
  });
  let worst = { d: Infinity };
  for (let deg = 0; deg < 360; deg += 5) {
    const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
    for (let i = 0; i < pts.length; i += 3) {
      const x = ring[0] + c * pts[i] + s * pts[i + 2], z = ring[2] - s * pts[i] + c * pts[i + 2], y = ring[1] + pts[i + 1];
      const d = y - map.at(x, z);
      if (d < worst.d) worst = { d, deg, at: [x, y, z].map((q) => +q.toFixed(3)) };
    }
  }
  return { ...worst, samples: pts.length / 3 };
}

const counts = {};
for (const id of ['ztz20', 'ztz20_prototype', 'ztz100', 'ztz100_prototype']) {
  const stage = ZTZ20_STAGES[id], design = firstPartyConcept(id);
  for (const quality of ['high', 'low']) {
    parts.length = 0;
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, batchStatic: false });
    try {
      tank.root.updateMatrixWorld(true);
      const count = (part) => parts.filter((p) => p.part === part).length;
      const one = (part) => parts.find((p) => p.part === part);
      counts[`${id}/${quality}`] = Object.fromEntries([...new Set(parts.map((p) => p.part))].map((p) => [p, count(p)]));
      // the shared hull
      const body = one('hull-body');
      assert.equal(count('hull-body'), 1, `${id}: one station loft`);
      assert.ok(Math.abs(body.min[2] - ZTZ20_DATUMS.sternPlateZ) < 1e-6 && Math.abs(body.max[2] - ZTZ20_DATUMS.noseZ) < 1e-6, `${id}: stern plate to nose`);
      assert.ok(Math.abs(body.max[1] - (stage.deck === 'flat' ? 1.41 : 1.465)) < 1e-6, `${id}: the ${stage.deck} engine deck`);
      assert.equal(count('rear-fender-box'), 2); assert.equal(count('crew-hatch'), 2, `${id}: the crew capsule's two hatches`);
      assert.equal(count('crew-periscope-hood'), stage.hatches === 'flush' ? 0 : 10, `${id}: ${stage.hatches} crew hatches`);
      assert.equal(count('skirt-upper'), 16); assert.equal(count('skirt-front'), 2);
      assert.equal(count('skirt-lower'), stage.skirtLowerBand ? 12 : 0, `${id}: lower skirt band`);
      assert.equal(count('skirt-lip'), stage.skirtLip ? 10 : 0, `${id}: rubber lip`);
      assert.equal(count('glacis-tile') > 0, stage.glacisTiles, `${id}: glacis tiles`);
      assert.equal(count('cage-slat') > 0, stage.stern === 'slat-cage', `${id}: slat cage`);
      assert.equal(count('stern-bin'), stage.stern === 'slat-cage' ? 0 : 1, `${id}: stern bin`);
      assert.equal(count('stern-basket-rail') > 0, stage.stern === 'stowage-basket', `${id}: trials basket`);
      // the running gear
      const hull = tank.root.getObjectByName('rig_hull'), turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
      const gear = hull.userData.runningGearReceipts.at(-1);
      assert.deepEqual(gear.wheelZs, [...ZTZ20_DATUMS.wheelStations], `${id}: seven measured stations`);
      assert.equal(gear.wheelR, ZTZ20_DATUMS.wheelR);
      assert.ok(Math.abs(gear.sprocket.z - ZTZ20_DATUMS.sprocket.z) < 1e-9 && Math.abs(gear.idler.z - ZTZ20_DATUMS.idler.z) < 1e-9, `${id}: drive aft, idler forward`);
      const tires = hull.getObjectByName('gearRoadWheelTires');
      assert.equal(tires.count, 14, `${id}: seven road wheels a side`);
      // the cage's air: between two slats the eye reaches the recessed stern louvre bay
      if (stage.stern === 'slat-cage') {
        const start = hull.localToWorld(new T.Vector3(0.2, 1.26, -4.4)), dir = new T.Vector3(0, 0, 1).transformDirection(hull.matrixWorld);
        const hit = new T.Raycaster(start, dir).intersectObject(hull, true)[0];
        const z = hit && hull.worldToLocal(hit.point.clone()).z;
        assert.ok(z > -3.62 && z < -3.50, `${id}: the stern shows between the cage slats (${z})`);
      }
      // the turret clears the hull top at every yaw (the ring collar alone bears on its race)
      const map = hullTopMap(hull, turret);
      const clear = turretSweepClearance(turret, map, design.ring);
      assert.ok(clear.samples > 100 && clear.d >= 0.005, `${id}/${quality}: turret stock ${(clear.d * 100).toFixed(1)} cm over the hull at yaw ${clear.deg} (${clear.at})`);
      if (quality === 'high' && id === 'ztz20') {
        // negative control: a 6 cm block laid on the engine deck where the cheeks' 1.48 floors sweep (1.6 m behind the
        // ring, 1.5 cm over the deck) fails the same check
        const block = new T.Mesh(new T.BoxGeometry(0.4, 0.06, 0.4));
        block.position.set(0, 1.495, -2.15); hull.add(block); block.updateMatrixWorld(true);
        const blocked = turretSweepClearance(turret, hullTopMap(hull, turret), design.ring);
        assert.ok(blocked.d < 0.005, `a block on the deck under the cheeks' sweep fails the sweep (${(blocked.d * 100).toFixed(1)} cm)`);
        hull.remove(block); block.geometry.dispose();
      }
      if (id === 'ztz100_prototype') continue;
      // the gun-tank turret and its deltas
      assert.equal(count('main-body'), 1); assert.equal(count('bustle'), 1); assert.equal(count('roof-plateau'), 1);
      assert.equal(count('flank-pod'), stage.pods === 'armour' ? 2 : 0); assert.equal(count('ballast-block'), stage.pods === 'ballast' ? 4 : 0);
      for (const facet of ['cheek', 'cheek-outer', 'cheek-filler']) assert.equal(count(facet), 2, `${id}: ${facet}`);
      assert.equal(count('cheek-plate'), 4, `${id}: a plate on each stepped cheek block`);
      assert.equal(count('gun-housing'), 1);
      assert.equal(count('aps-launcher-tube'), stage.apsTowers === 'launchers' ? 8 : 0, `${id}: hard-kill launchers`);
      assert.equal(count('aps-blank'), stage.apsTowers === 'blanked' ? 2 : 0, `${id}: blanked seats`);
      assert.equal(count('rws-missile-launcher'), stage.rws === 'twin-tube' ? 1 : 0, `${id}: weapon-station ATGM launcher`);
      assert.equal(count('coax-housing'), stage.coaxHousing ? 1 : 0); assert.equal(count('coax-seat-cover'), stage.coaxHousing ? 0 : 1);
      for (const piece of ['cheek-tip', 'cheek-notch-wedge', 'cheek-notch-wall', 'cheek-notch-slab']) assert.equal(count(piece), stage.coaxHousing ? 1 : 0, `${id}: the coax slot in the right cheek`);
      assert.equal(count('coax-port'), stage.coaxHousing || stage.mantlet !== 'angular' ? 0 : 1, `${id}: the coax in the mantlet until its cheek housing`);
      assert.equal(count('brake-slot'), stage.brake === 'slotted' ? 10 : 0, `${id}: slotted brake`);
      assert.equal(count('brake-face'), stage.brake === 'slotted' ? 1 : 0);
      assert.equal(count('brake-port-ring'), stage.brake === 'round' ? 4 : 0, `${id}: round brake`);
      assert.equal(count('brake-rib'), stage.brake === 'ribbed' ? 16 : 0, `${id}: ribbed brake`);
      assert.equal(count('trials-mast'), stage.trialsMast ? 1 : 0); assert.equal(count('side-bin'), stage.bustleStowage ? 2 : 0);
      assert.equal(count('rack-slat'), stage.bustleStowage ? 21 : 0, `${id}: the three-bay rack's inclined slats`);
      assert.equal(count('rear-stowage-block'), stage.bustleStowage ? 1 : 0, `${id}: the closed rear stowage block under the slats`);
      assert.equal(count('muzzle-reference-sensor'), stage.sleeve ? 1 : 0, `${id}: muzzle reference sensor with the sleeve`);
      assert.equal(count('rws-yoke-arm'), stage.rws === 'none' ? 0 : 2, `${id}: the weapon station's sight yoke`);
      assert.equal(count('smoke-tube'), stage.smoke ? 8 : 0);
      assert.equal(count('panoramic-head'), stage.commanderSight === 'panoramic' ? 1 : 0); assert.equal(count('periscope-block'), stage.commanderSight === 'periscope' ? 1 : 0);
      assert.equal(count('mantlet'), stage.mantlet === 'angular' ? 1 : 0); assert.equal(count('mantlet-early'), stage.mantlet === 'early' ? 1 : 0);
      assert.equal(count('thermal-sleeve'), stage.sleeve ? 1 : 0); assert.equal(count('fume-extractor'), stage.sleeve ? 0 : 1);
      assert.equal(Boolean(tank.root.getObjectByName('ztz20RemoteWeaponStation')), stage.rws !== 'none', `${id}: the remote weapon station`);
      // the measured turret datums: pods to ±1.51, the 2.30 rear plateau
      if (stage.pods === 'armour') {
        const pod = parts.filter((p) => p.part === 'flank-pod');
        assert.ok(Math.abs(Math.max(...pod.map((p) => p.max[0])) - 1.51) < 1e-6, `${id}: pods to ±1.51`);
      }
      assert.ok(Math.abs(one('bustle').max[1] + 1.41 - 2.30) < 1e-6, `${id}: the 2.30 rear plateau`);
      // the muzzle and its open bore
      const muzzle = gun.localToWorld(new T.Vector3(0, 0, ZTZ20_DATUMS.barrelLengthM));
      hull.worldToLocal(muzzle);
      assert.ok(Math.abs(muzzle.z - ZTZ20_DATUMS.muzzleZ) < 0.005 && Math.abs(muzzle.y - ZTZ20_DATUMS.trunnion[1]) < 0.005, `${id}: muzzle at the measured station`);
      const start = gun.localToWorld(new T.Vector3(0, 0, ZTZ20_DATUMS.barrelLengthM + 0.1));
      const boreHit = new T.Raycaster(start, new T.Vector3(0, 0, -1).transformDirection(gun.matrixWorld)).intersectObject(gun, true)[0];
      assert.ok(boreHit && gun.worldToLocal(boreHit.point.clone()).z < ZTZ20_DATUMS.barrelLengthM - 0.19, `${id}: no cap hides the bore`);
      const size = new T.Box3().setFromObject(tank.root).getSize(new T.Vector3());
      console.log(JSON.stringify({ id, quality, parts: parts.length, size: size.toArray().map((v) => +v.toFixed(3)), turretClearanceCm: +(clear.d * 100).toFixed(1) }));
    } finally { tank.dispose(); }
  }
}
// the stages differ only where their deltas say: the hull census of the production and pre-production ZTZ-20 hulls
// agrees outside the delta-owned parts
const deltaParts = /^(glacis-|skirt-lower|skirt-lip|skirt-rail|cage-|stern-bin|stern-basket|aps-|rws-|coax-|cheek-tip|cheek-notch|mrs-|muzzle-reference|rear-stowage|rear-block|brake-|trials-|side-bin|rack-|deck-|filler-cap|exhaust|ballast-|periscope-|mantlet|thermal-|sleeve-|fume-|smoke-|panoramic-|flank-pod|pod-)/;
const shared = (key) => Object.entries(counts[key]).filter(([p]) => !deltaParts.test(p) && !/^(concept-|pod-|backup-|pitch-|elevation-|bank-|sensor-|gunner-sight-(foot|stem|body|window)|service-|antenna-)/.test(p));
assert.deepEqual(shared('ztz100/high').filter(([p]) => /^(hull-|rear-fender|crew-|skirt-upper|skirt-front|skirt-step|skirt-hanger|lamp|tow-|nose-|driver-|stern-louvre|tail-)/.test(p)),
  shared('ztz20/high').filter(([p]) => /^(hull-|rear-fender|crew-|skirt-upper|skirt-front|skirt-step|skirt-hanger|lamp|tow-|nose-|driver-|stern-louvre|tail-)/.test(p)),
  'the pre-production hull is the production hull');
assert.deepEqual(shared('ztz20_prototype/high'), shared('ztz20/high'), 'the turret testbed shares every non-delta part with the ZTZ-20');
console.log('ztz20Family: PASS');
