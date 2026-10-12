// physics lane scratch: a Studio-like cook-off in Node (createTank with the scene's camo seed, a flat ground, the
// Studio's setDestroyed({ pop: true, ageS: 0 }), then frames): where the turret flies and rests, per 100 ms
import * as THREE from 'three';
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { getSpec } = await import('../src/vehicles/specs.ts');
const { createTankState } = await import('../src/sim/movement.ts');
const cases = { t90m: [4208, 250, 20], m1a2: [4210, 120, -30], kv2: [4212, 300, 15] };
const which = (process.argv[2] ?? 't90m,m1a2,kv2').split(',');
for (const id of which) {
  const [camoSeed, facingDeg, turretDeg] = cases[id];
  const visual = createTank(id, null, { camoSeed, proceduralOnly: true, geometryReceipt: true, batchStatic: true, battleDetailLod: true });
  visual.prewarmBurn?.();
  const state = createTankState(getSpec(id), new THREE.Vector3(190, 0, 391), facingDeg * Math.PI / 180);
  state.turretYaw = turretDeg * Math.PI / 180;
  visual.setGroundSampler(() => 0);
  for (let i = 0; i < 3; i++) visual.syncFromState(state, 1 / 60, 150);
  visual.setDestroyed({ pop: true, ageS: 0 });
  const turret = visual.root.getObjectByName('rig_turret');
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3();
  const rows = [];
  let peak = 0;
  for (let f = 1; f <= 480; f++) {
    visual.syncFromState(state, 1 / 60, 150);
    visual.root.updateMatrixWorld(true);
    turret.matrixWorld.decompose(p, q, s);
    peak = Math.max(peak, p.y);
    if (f % 6 === 0) {
      up.set(0, 1, 0).applyQuaternion(q);
      rows.push(`${(f / 60).toFixed(1)}:y${p.y.toFixed(1)} d${Math.hypot(p.x - 190, p.z - 391).toFixed(1)} t${(Math.acos(Math.max(-1, Math.min(1, up.y))) * 57.3).toFixed(0)}`);
    }
  }
  console.log(`${id}: peak ${peak.toFixed(1)} m; ` + rows.filter((_, k) => k % 3 === 0).join('  '));
}
