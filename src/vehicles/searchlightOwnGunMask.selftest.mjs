// 2026-10-18 (release 227 land stage; geometry critic UAPL-R6C-1: "The station searchlight's 0.11 rad cone still lights
// the main-gun barrel at station poses the auto-control can reach near dead ahead ... met only at rest"): the Zubr II
// illuminator's own-vehicle mask (vehicleNightLighting.ts maskSearchlightsOffOwnGun). Over the station's whole working
// envelope (yaw 360 x pitch -10..+43 on a 2-degree grid) at main-gun pitches -6, 0, +6 and +14, measured as the critic
// measured it (barrel vertices inside the cone within its reach), every pose that would light the barrel finds the lamp
// masked dark; the lamp is lit at rest and over at least 95 % of the envelope; and the mask's test allocates nothing.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { vehicleNightLightEmittersFor } from './vehicleNightLighting.ts';
import { NATIONAL_ROOF_LOADOUTS } from './nationalRoofConfig.ts';

const id = 't72b3_zubr_ii', DEG = Math.PI / 180, spec = getSpec(id), l = NATIONAL_ROOF_LOADOUTS[id];
const t = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true });
try {
  const turret = t.root.getObjectByName('rig_turret'), gun = t.root.getObjectByName('rig_gun');
  const station = turret.getObjectByName(l.name), pitch = station.getObjectByName('auxiliaryWeaponPitch');
  const mesh = pitch.getObjectByName(`${l.name}_pitch_turretGlass`);
  const lamps = vehicleNightLightEmittersFor(mesh).filter((lamp) => lamp.searchlight);
  assert.equal(lamps.length, 1, 'one searchlight on the station');
  const [lamp] = lamps;
  assert.equal(typeof lamp.isActive, 'function', 'the searchlight carries its own-gun mask');
  t.root.updateMatrixWorld(true);
  assert.equal(lamp.isActive(), true, 'the searchlight is lit at rest');
  const barrel = []; gun.traverse((o) => { if (o.isMesh && !/gunMount/.test(o.name) && !/Shadow/.test(o.name)) barrel.push(o); });
  const local = []; for (const o of barrel) { const p = o.geometry.getAttribute('position'); for (let i = 0; i < p.count; i += 3) local.push([o, new THREE.Vector3().fromBufferAttribute(p, i)]); }
  const at = new THREE.Vector3(), aim = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Vector3();
  let poses = 0, lit = 0, masked = 0, leaks = 0;
  for (const gp of [-spec.gunDepressionDeg, 0, 6, spec.gunElevationDeg]) {
    gun.rotation.x = -gp * DEG;
    for (let y = -180; y < 180; y += 2) for (let p = -10; p <= 43; p += 2) {
      station.rotation.y = y * DEG; pitch.rotation.x = -p * DEG; t.root.updateMatrixWorld(true);
      at.fromArray(lamp.position).applyMatrix4(mesh.matrixWorld); aim.fromArray(lamp.direction).transformDirection(mesh.matrixWorld);
      let hit = false;
      for (const [o, v] of local) { w.copy(q.copy(v).applyMatrix4(o.matrixWorld)).sub(at); if (w.length() < lamp.range && w.angleTo(aim) < lamp.coneRad) { hit = true; break; } }
      const on = lamp.isActive();
      poses++; if (hit) lit++; if (!on) masked++; if (hit && on) leaks++;
    }
  }
  gun.rotation.x = 0; station.rotation.y = 0; pitch.rotation.x = 0; t.root.updateMatrixWorld(true);
  assert.equal(leaks, 0, `the searchlight never lights its own barrel (${leaks} of ${lit} barrel-lit poses left lit)`);
  assert.ok(lit > 0, 'the envelope does reach across the barrel (the mask is exercised)');
  assert.ok(masked / poses <= .05, `the mask keeps the lamp lit over 95 % of the envelope (${(100 * masked / poses).toFixed(2)} % masked)`);
  // no allocation in the per-frame test: the same pose a million times stays inside the young generation's noise
  const before = process.memoryUsage().heapUsed; for (let i = 0; i < 200000; i++) lamp.isActive(); const grown = process.memoryUsage().heapUsed - before;
  assert.ok(grown < 4e6, `the mask's test allocates nothing per call (${(grown / 1e6).toFixed(2)} MB over 200k calls)`);
  console.log(`searchlightOwnGunMask: ${poses} poses, barrel in the cone at ${lit}, masked at ${masked} (${(100 * masked / poses).toFixed(2)} %), leaks 0: PASS`);
} finally {
  t.dispose?.();
}
