// 274 (the armour-live-pen lane, 2026-11-18): where two plates meet at one point (the Leopard 2A6's mantlet and the sight
// recess beside it, the recess and the right cheek), a trace told them apart by float noise in its segment parameter, so
// the plate a real shot met moved with the per-tick segment's length and start and could differ from the reticle's.
// sim/armor.ts breaks those ties by plate (outermost, thickest, name). Here a round flown tick by tick at three muzzle
// velocities and four tick phases, at two places on the map, meets the same plates at every ray across both seams, and
// the same plates the reticle reads (sim/aimPenetration.ts aimArmorAlong at the controller's reach) and the 800 m query.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from '../vehicles/canvasFixture.test-support.mjs';

installCanvasFixture();
const { traceTank, queryAimArmor, tankPoseFromState } = await import('./armor.ts');
const { aimArmorAlong, AIM_REACH_M } = await import('./aimPenetration.ts');
const { createTankState } = await import('./movement.ts');
const { getSpec } = await import('../vehicles/specs.ts');
const { ensureTankBuilder } = await import('../vehicles/fleetFactory.ts');

const SIM_DT = 1 / 60;
const VELOCITIES = [1750, 1400, 1000]; // APFSDS, HEAT, HE (m/s): per-tick segments of 29.2, 23.3 and 16.7 m
const PHASES = [0, 0.27, 0.5, 0.81]; // where in its first tick the round leaves the muzzle

await ensureTankBuilder('leo2a6');
const spec = getSpec('leo2a6');
const armor = spec.armor;

/** The plate stack a hit list reads (queryAimArmor's rule): every plate up to and including the first main one. */
function stackOf(hits) {
  const names = [];
  for (const hit of hits) {
    if (hit.kind !== 'plate') continue;
    names.push(hit.plate.name);
    if (hit.plate.kind === 'main') break;
  }
  return names.join(' > ');
}

/** A round flown from `muzzle` along `dir`, tick by tick (prevPos to pos), as the authority and a solo battle trace it. */
function shellStack(muzzle, dir, pose, velocity, phase) {
  const step = velocity * SIM_DT;
  const from = new THREE.Vector3(), to = new THREE.Vector3();
  for (let travelled = -phase * step; travelled < AIM_REACH_M; travelled += step) {
    from.copy(muzzle).addScaledVector(dir, Math.max(0, travelled));
    to.copy(muzzle).addScaledVector(dir, travelled + step);
    const stack = stackOf(traceTank(from, to, pose, armor));
    if (stack) return stack;
  }
  return '';
}

const seams = [
  // shooter 30 degrees round from the bow: the mantlet and the sight recess meet
  { label: 'mantlet / sight recess', bearingDeg: 30, x: [-0.9, -0.48], y: [1.92, 2.04], step: 0.01, plates: ['mantlet', 'turret_sight_recess'] },
  // shooter on the bow: the sight recess and the right cheek meet
  { label: 'sight recess / cheek', bearingDeg: 0, x: [-1.14, 1.36], y: [1.70, 1.80], step: 0.03, plates: ['turret_sight_recess', 'turret_cheek_R'] },
];
const places = [
  { label: 'at the origin', at: new THREE.Vector3(0, 0, 0) },
  { label: 'far out on the map', at: new THREE.Vector3(1237.3, 14.2, -861.9) },
];

let rays = 0, traces = 0;
const seen = new Map();
for (const place of places) {
  const state = createTankState(spec, place.at.clone(), 0);
  const pose = tankPoseFromState(state, { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 });
  for (const seam of seams) {
    const bearing = (seam.bearingDeg * Math.PI) / 180;
    const muzzle = new THREE.Vector3(300 * Math.sin(bearing), 2.2, 300 * Math.cos(bearing)).add(place.at);
    const counts = new Map();
    for (let x = seam.x[0]; x <= seam.x[1] + 1e-9; x += seam.step) for (let y = seam.y[0]; y <= seam.y[1] + 1e-9; y += 0.01) {
      const point = new THREE.Vector3(x, y, seam.bearingDeg ? 1.0 : 2.0).add(place.at);
      const dir = point.clone().sub(muzzle).normalize();
      const query = queryAimArmor(muzzle, dir, AIM_REACH_M, pose, armor);
      if (!query) continue;
      const stack = query.layers.map((layer) => layer.plate.name).join(' > ');
      // the reticle: the controller's reach, the target's distance plus its bounding radius
      const reach = Math.min(AIM_REACH_M, muzzle.distanceTo(place.at) + armor.boundingRadiusM);
      const reticle = aimArmorAlong(muzzle, dir, reach, state, armor, undefined, {
        pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 });
      assert.ok(reticle, `${seam.label} ${place.label} (${x.toFixed(2)}, ${y.toFixed(2)}): the reticle reads armour`);
      assert.equal(reticle.layers.map((layer) => layer.plate.name).join(' > '), stack,
        `${seam.label} ${place.label} (${x.toFixed(2)}, ${y.toFixed(2)}): the reticle reads the 800 m query's plates`);
      for (const velocity of VELOCITIES) for (const phase of PHASES) {
        traces++;
        assert.equal(shellStack(muzzle, dir, pose, velocity, phase), stack,
          `${seam.label} ${place.label} (${x.toFixed(2)}, ${y.toFixed(2)}): a ${velocity} m/s round leaving at tick phase ${phase} meets the reticle's plates`);
      }
      rays++;
      const first = query.layers[0].plate.name;
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    for (const plate of seam.plates) {
      assert.ok(counts.get(plate) > 0, `${seam.label} ${place.label}: rays on the seam meet ${plate} (${JSON.stringify([...counts])})`);
    }
    seen.set(`${seam.label} ${place.label}`, Object.fromEntries(counts));
  }
}
assert.ok(rays > 1000, `the seams are swept (${rays} rays)`);
console.log(`coplanarTie.selftest: ${rays} rays across the leo2a6's mantlet/sight-recess and sight-recess/cheek seams, two places on the map; ${traces} tick-by-tick rounds (${VELOCITIES.join('/')} m/s, phases ${PHASES.join('/')}) each meet the reticle's plates ${JSON.stringify(Object.fromEntries(seen))}`);
