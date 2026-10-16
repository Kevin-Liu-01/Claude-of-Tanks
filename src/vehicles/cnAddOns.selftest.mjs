// Release 227 (owner 2026-10-16): "make the qqilin turret 10% shorter. and make the yun keep all its extra add ons and
// modifications but altered slightly to be wrapped around the type 96b turret base, and redesign the qilin turret around
// this principle." The CN track's add-on inventory: every Yun add-on (wrapped round its Type 96B) and every Qilin add-on
// (wrapped round its cut ZTZ-99A2) is present with its role (userData.chineseModernization.role) and seated on real stock
// (no part more than 2 mm from its receiver; permanent parts never resting on ERA); the Qilin's body is 90 % of the
// 99A2's length with everything ahead of the cut band untouched; the main gun clears every add-on and every station's
// moving gun clears the turret over its arc; the lamp census is as authored.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { NATIONAL_DONOR_TURRETS, QILIN_BUSTLE_CUT_M } from './nationalDonorTurrets.ts';
import { bustleCutZ, ZTZ99A2_BUSTLE_CUT_FRONT_Z } from './donorBustleCut.ts';
import { auxiliaryWeaponProfile } from './auxiliaryWeapons.ts';
import { minimumMechanicalGunPitch } from '../sim/gunPitchLimits.ts';
import { censusPart, partGap, SurfaceGrid, meshTriangles, meshPoints } from './cnTurretGeometry.test-support.mjs';

// role -> [minimum parts, exact reactive cassettes (parts with ERA hit faces) or null]
const INVENTORY = {
  t80u_yun: {
    'wrap-housing': [2, 0], chevron: [24, 12], 'flank-tile': [12, 6], 'bustle-module': [4, 0], 'rear-band': [3, 0],
    'cage-root': [2, 0], 'cage-front-post': [2, 0], 'cage-side-rail': [2, 0], 'cage-post': [2, 0], 'cage-rear-rail': [4, 0], 'cage-floor': [3, 0],
    'smoke-tube': [16, 0], 'service-case': [3, 0], 'spine-frame': [7, 0], 'low-optic': [3, 0], cable: [2, 0], antenna: [2, 0],
    'sight-hood': [3, 0], 'spine-sensor': [3, 0], 'slit-lamp': [2, 0], 'monocle-eye': [4, 0], 'side-electronics': [6, 0],
    'gun-band': [5, 0], 'muzzle-strip': [1, 0], 'ring-race': [1, 0],
  },
  t72b3_qilin: {
    brow: [2, 0], 'brow-chevron': [12, 6], 'rear-flank-housing': [2, 0], 'flank-tile': [12, 6], 'rail-post': [4, 0],
    'rear-box-seam': [2, 0], 'bustle-plate': [1, 0], rack: [7, 0], 'flat-eye': [4, 0], 'split-sensor': [3, 0], lamp: [2, 0],
    camera: [3, 0], 'field-box': [1, 0], 'tool-chest': [1, 0], roll: [4, 0], carrier: [3, 0], cable: [2, 0],
    'cage-root': [2, 0], 'cage-side-rail': [2, 0], 'cage-post': [2, 0], 'cage-rear-rail': [3, 0], 'cage-floor': [4, 0],
  },
};
const LIGHTS = { t80u_yun: [6, 0], t72b3_qilin: [4, 0], t72b3m_kunlun: [6, 2] };

function build(id, quality) {
  const parts = [];
  const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242,
    partCensus(bucket, g) { parts.push({ ...censusPart(bucket, g), hit: (g.userData?.eraHitFaceVertexStarts?.length ?? 0) > 0 }); } });
  tank.root.updateMatrixWorld(true);
  return { tank, parts };
}

for (const quality of ['high', 'low']) {
  // ---- the Qilin's cut against the fleet ZTZ-99A2's own turret
  const fleet = build('ztz99a2', quality);
  const key = (x, y, z) => [x, y, z].map((v) => Math.round(v * 1e4)).join(',');
  const fleetShell = new Set();
  for (const p of fleet.parts) if (p.bucket === 'turret') for (let i = 0; i < p.tri.length; i += 3)
    if (p.tri[i + 2] >= ZTZ99A2_BUSTLE_CUT_FRONT_Z) fleetShell.add(key(p.tri[i], p.tri[i + 1], p.tri[i + 2]));
  fleet.tank.dispose();

  for (const id of [...Object.keys(INVENTORY), 't72b3m_kunlun']) {
    const { tank, parts } = build(id, quality);
    try {
      const turret = tank.root.getObjectByName('rig_turret'), turretInv = new THREE.Matrix4().copy(turret.matrixWorld).invert();
      // ---- inventory and seating
      const want = INVENTORY[id];
      if (want) {
        for (const [role, [min, cassettes]] of Object.entries(want)) {
          const list = parts.filter((p) => p.role === role);
          assert.ok(list.length >= min, `${id}/${quality}: add-on ${role} present (${list.length} of at least ${min} parts)`);
          if (cassettes) assert.equal(list.filter((p) => p.hit).length, cassettes, `${id}/${quality}: ${role} reactive cassettes`);
        }
        const tagged = parts.filter((p) => p.role);
        for (const p of tagged) {
          const grown = p.box.clone().expandByScalar(.01);
          let best = .05;
          for (const q of parts) {
            if (q === p || !q.box.intersectsBox(grown) || (!p.era && q.era) || q.bucket.startsWith('hull') !== p.bucket.startsWith('hull')) continue;
            best = Math.min(best, partGap(p, q, best)); if (best === 0) break;
          }
          assert.ok(best <= .002, `${id}/${quality}: ${p.role} (${p.bucket}) is seated (${(best * 1000).toFixed(1)} mm from its receiver at ${p.box.min.toArray().map((v) => v.toFixed(3))})`);
        }
      }
      // ---- the Qilin: 10 % shorter, nothing ahead of the band moved, height kept
      if (id === 't72b3_qilin') {
        const body = new THREE.Box3(), shell = new THREE.Box3(), v = new THREE.Vector3();
        // the coordinator's ruling R1: the body is the shell and its external armour front to rear, the front ERA face
        // included (the gun and roof equipment not)
        for (const p of parts) {
          if (!['turret', 'turretExternalArmor'].includes(p.bucket)) continue;
          for (let i = 0; i < p.tri.length; i += 3) { v.set(p.tri[i], p.tri[i + 1], p.tri[i + 2]); body.expandByPoint(v); if (p.bucket === 'turret') shell.expandByPoint(v); }
        }
        const length = body.max.z - body.min.z;
        assert.ok(Math.abs(length - 3.559) <= .010, `Qilin: body length ${length.toFixed(4)} m (3.559 +- .010)`);
        assert.ok(Math.abs(length / 3.954 - .90) <= .003, `Qilin: ${(100 * length / 3.954).toFixed(2)} % of the 99A2 body's 3.954 m`);
        assert.ok(Math.abs(shell.max.y - shell.min.y - .9575) <= .001, `Qilin: shell height ${(shell.max.y - shell.min.y).toFixed(4)} m unchanged`);
        // every 99A2 shell vertex ahead of the band lies on the Qilin's shell (the loft's vertices exactly; the throat
        // clip's cut points slide along their own unchanged planes). The loft's floor fan runs from its centre (z -0.57)
        // to the moved rear plan points, so its seam with the gun throat's clip plane (|x| 0.40, inside the turret under
        // the mantlet) is the one place a point ahead of the band follows the floor's new slope.
        const qilinShell = new Set(), qilinTris = [];
        for (const p of parts) if (p.bucket === 'turret') { qilinTris.push(...p.tri); for (let i = 0; i < p.tri.length; i += 3) qilinShell.add(key(p.tri[i], p.tri[i + 1], p.tri[i + 2])); }
        const surface = new SurfaceGrid(Float64Array.from(qilinTris), { cell: .05, rq: .002 });
        const moved = [...fleetShell].filter((k) => !qilinShell.has(k)).filter((k) => surface.distance(...k.split(',').map((n) => n / 1e4)) > 2e-4)
          .filter((k) => Math.abs(Math.abs(Number(k.split(',')[0])) - 4000) > 2);
        assert.equal(moved.length, 0, `Qilin: ${moved.length} 99A2 shell points ahead of z ${ZTZ99A2_BUSTLE_CUT_FRONT_Z} moved off its surface: ${moved.slice(0, 8).join(" ; ")}`);
        assert.equal(NATIONAL_DONOR_TURRETS.t72b3_qilin.builderOptions.bustleCutM, QILIN_BUSTLE_CUT_M);
        assert.ok(Math.abs(bustleCutZ(-2.265, QILIN_BUSTLE_CUT_M) - body.min.z) < .006, 'Qilin: the rear armour assembly moved forward by the cut');
      }
      // ---- the main gun (barrel, mantlet, boot) at every legal pitch and recoil clears every add-on and the station
      const gun = tank.root.getObjectByName('rig_gun'), recoil = tank.root.getObjectByName('rig_recoil');
      const station = (() => { let s = null; turret.traverse((o) => { if (!s && o.userData.remoteControlled && o.userData.firingAxis === '+Z') s = o; }); return s; })();
      const stationMeshes = []; station.traverse((o) => { if (o.isMesh && !o.name.includes('Shadow')) stationMeshes.push(o); });
      const addOnTris = [...parts.filter((p) => p.role && p.bucket.startsWith('turret')).flatMap((p) => Array.from(p.tri)), ...meshTriangles(stationMeshes, turretInv)];
      const kit = new SurfaceGrid(Float64Array.from(addOnTris));
      const gunInv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
      const gunMeshes = []; gun.traverse((o) => { if (o.isMesh && !o.name.includes('Shadow')) gunMeshes.push(o); });
      const recoiling = new Set(); recoil?.traverse((o) => recoiling.add(o));
      const fixedPts = meshPoints(gunMeshes.filter((m) => !recoiling.has(m)), gunInv), recoilPts = meshPoints(gunMeshes.filter((m) => recoiling.has(m)), gunInv);
      const spec = getSpec(id), deepest = Math.min(...Array.from({ length: 37 }, (_, k) => minimumMechanicalGunPitch(spec, k * Math.PI / 36)));
      let gunMin = Infinity;
      for (const pitch of [deepest, -.05, 0, .12, (spec.gunElevationDeg ?? 14) * Math.PI / 180]) for (const rc of [0, .135]) {
        const m = new THREE.Matrix4().compose(gun.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, 0, 0)), new THREE.Vector3(1, 1, 1));
        const v = new THREE.Vector3();
        for (const [pts, back] of [[fixedPts, 0], [recoilPts, rc]]) for (let i = 0; i < pts.length; i += 3) {
          v.set(pts[i], pts[i + 1], pts[i + 2] - back).applyMatrix4(m); gunMin = Math.min(gunMin, kit.distance(v.x, v.y, v.z));
        }
      }
      if (want) assert.ok(gunMin >= .025, `${id}/${quality}: the main gun passes every add-on by ${(gunMin * 1000).toFixed(1)} mm`);
      // ---- the station's moving mass over its arc and pitch range clears every other turret part by 20 mm
      const pitchGroup = station.getObjectByName('auxiliaryWeaponPitch');
      const others = []; turret.traverse((o) => { if (!o.isMesh || o.name.includes('Shadow') || o.name.startsWith('vehicleMarking')) return; for (let p = o; p; p = p.parent) if (p === station) return; others.push(o); });
      const fixed = new SurfaceGrid(meshTriangles(others, turretInv));
      const pitchMeshes = [], yawMeshes = []; station.traverse((o) => { if (!o.isMesh || o.name.includes('Shadow')) return; let inPitch = false; for (let p = o; p; p = p.parent) if (p === pitchGroup) inPitch = true; (inPitch ? pitchMeshes : yawMeshes).push(o); });
      const pivot = new THREE.Vector3(...station.userData.auxiliaryPivot);
      const pv = meshPoints(pitchMeshes, new THREE.Matrix4().copy(pitchGroup.matrixWorld).invert());
      const yv = meshPoints(yawMeshes, new THREE.Matrix4().copy(station.matrixWorld).invert(), (a) => a.y > .06);
      const profile = auxiliaryWeaponProfile(station.userData.caliberMm, id), arc = station.userData.yawArc ?? [-Math.PI, Math.PI], table = station.userData.depressionByYaw;
      const depAt = (yaw) => { if (!table || yaw < table[0][0] || yaw > table.at(-1)[0]) return profile.depressionRad;
        for (let i = 1; i < table.length; i++) if (yaw <= table[i][0]) return Math.min(profile.depressionRad, table[i - 1][1], table[i][1]); return profile.depressionRad; };
      let stationMin = Infinity; const v = new THREE.Vector3();
      for (let yaw = arc[0]; yaw <= arc[1] + 1e-9; yaw += (quality === 'high' ? 3 : 6) * Math.PI / 180) for (const el of [-depAt(yaw), 0, .375, profile.elevationRad]) {
        const sM = new THREE.Matrix4().compose(station.position, station.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)), new THREE.Vector3(1, 1, 1));
        const full = sM.clone().multiply(new THREE.Matrix4().compose(pivot, new THREE.Quaternion().setFromEuler(new THREE.Euler(-el, 0, 0)), new THREE.Vector3(1, 1, 1)));
        for (const [pts, M] of [[pv, full], [yv, sM]]) for (let i = 0; i < pts.length; i += 3) { v.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(M); stationMin = Math.min(stationMin, fixed.distance(v.x, v.y, v.z)); }
      }
      assert.ok(stationMin >= .020, `${id}/${quality}: the ${station.name} moving mass clears the turret by ${(stationMin * 1000).toFixed(1)} mm over its arc`);
      // ---- lamps: real emitters only where authored
      const lights = tank.root.userData.nightLightCoverage;
      assert.equal(lights.headlights, LIGHTS[id][0], `${id}: headlight lenses`);
      assert.equal(lights.shtora ?? 0, LIGHTS[id][1], `${id}: Shtora lenses`);
      console.log(`${id}/${quality}: add-ons ${want ? Object.keys(want).length : 0} roles present and seated, gun ${(gunMin * 1000).toFixed(0)} mm, station ${(stationMin * 1000).toFixed(0)} mm PASS`);
    } finally { tank.dispose(); }
  }
}
console.log('cnAddOns: the Yun and Qilin add-ons wrapped round their base turrets, the Qilin 10 % shorter, the stations and gun clear PASS');
