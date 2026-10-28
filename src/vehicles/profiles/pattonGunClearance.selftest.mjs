// Release 262 (the owner: "update/redesign the m47, m46, and m48 pattons ... based on proper historical referrences"):
// the rebuilt Pattons' main guns over their own hulls, across each gun's source elevation range (M46 M73 mount +20/-10,
// M47 M78 mount +19/-10, M48A5 +19/-9: docs/references/tanks/<id>.md). At every whole degree of turret yaw the gun (every
// mesh under rig_gun, the recoiling parts in battery and at 0.135 m) keeps 25 mm from every hull mesh at its published
// depression stop (gunPitchByYawDeg, measured by tools/gun-depression-sweep.mjs at 26 mm), at level and at full
// elevation (gunHullClearance.test-support.mjs). The drawn trunnion is the combat rig's: rig_gun stands on the pivot the
// census published (combatGunRigs.generated.ts), so the authority fires from the gun the player sees. Negative control:
// the same probe, laid 25 deg down dead ahead, puts the barrel into the glacis.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gunHullProbe, gunHullSweep, GUN_HULL_KEEP_M } from '../gunHullClearance.test-support.mjs';
import { createTank } from '../tankFactory.ts';
import { COMBAT_GUN_RIGS } from '../combatGunRigs.generated.ts';

const DEG = Math.PI / 180;
/** id -> [elevation, depression] in degrees, from the sources. */
const SOURCE_RANGE = { m46_patton: [20, 10], m47_patton: [19, 10], m48a5_patton: [19, 9] };
const ids = process.env.PATTON_GUN_IDS?.split(',') ?? Object.keys(SOURCE_RANGE);

for (const id of ids) {
  const [elevation, depression] = SOURCE_RANGE[id];
  const probe = gunHullProbe(id);
  try {
    const { spec } = probe;
    assert.equal(spec.gunElevationDeg, elevation, `${id}: the spec's elevation is the source's`);
    assert.equal(spec.gunDepressionDeg, depression, `${id}: the spec's depression is the source's`);
    const worst = gunHullSweep(probe, spec);
    console.log(`${id}: worst ${(worst.d * 1000).toFixed(1)} mm at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(2)} deg (${worst.part})`);
    assert.ok(worst.d >= GUN_HULL_KEEP_M - 1e-4, `${id}: the gun keeps 25 mm from its hull at every yaw and legal pitch `
      + `(${(worst.d * 1000).toFixed(2)} mm at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(2)} deg, from ${worst.part})`);
    const buried = probe.distance(0, -25 * DEG, GUN_HULL_KEEP_M);
    assert.ok(buried < GUN_HULL_KEEP_M, `${id}: negative control: 25 deg down dead ahead the gun meets its glacis (${(buried * 1000).toFixed(1)} mm)`);
  } finally { probe.dispose(); }

  // the drawn trunnion on the combat rig
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    tank.root.updateMatrixWorld(true);
    const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const rig = COMBAT_GUN_RIGS[id];
    assert.ok(rig, `${id}: the census publishes its combat gun rig`);
    const drawn = new THREE.Vector3(); gun.getWorldPosition(drawn);
    const ring = new THREE.Vector3(); turret.getWorldPosition(ring);
    const pivot = new THREE.Vector3(...rig.turretPivot).add(new THREE.Vector3(...rig.gunPivot));
    assert.ok(ring.distanceTo(new THREE.Vector3(...rig.turretPivot)) < 1e-3, `${id}: rig_turret on the combat turret pivot`);
    assert.ok(Math.abs(drawn.y - pivot.y) < 2e-3 && Math.abs(drawn.x - pivot.x) < 2e-3,
      `${id}: the drawn trunnion (${drawn.toArray().map((n) => n.toFixed(3))}) and the combat gun pivot `
      + `(${pivot.toArray().map((n) => n.toFixed(3))}) share one bore line`);
  } finally { tank.dispose(); }
}
console.log(`pattonGunClearance: ${ids.length} rebuilt Patton guns keep 25 mm from their hulls over the source elevation range and pivot on their combat rigs PASS`);
