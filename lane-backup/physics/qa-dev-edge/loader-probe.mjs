import * as THREE from 'three';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { getSpec } from '../src/vehicles/specs.ts';
import { createTankState } from '../src/sim/movement.ts';
import { preloadWreckTurretDriver } from '../src/vehicles/wreckTurretDriverLoader.ts';
function battleTank() {
  const visual = createTank('m1a2', null, { proceduralOnly: true, geometryReceipt: true, batchStatic: true, battleDetailLod: true });
  const turret = visual.root.getObjectByName('rig_turret');
  const gun = visual.root.getObjectByName('rig_gun');
  const seat = turret.position.clone();
  const state = createTankState(getSpec('m1a2'), new THREE.Vector3(12, 0.7, -9), 0.83);
  state.turretYaw = 0.61; state.gunPitch = 0.17;
  visual.setGroundSampler(() => 1.4);
  for (let i = 0; i < 6; i++) visual.syncFromState(state, 0.08, 150);
  return { visual, turret, gun, seat, state };
}
const turn = (t) => 2 * Math.acos(Math.min(1, Math.abs(t.quaternion.w)));
const a = battleTank();
console.log('before kill gun', a.gun.rotation.x.toFixed(4), 'turret', a.turret.position.toArray().map(v=>v.toFixed(3)).join(','));
a.visual.setDestroyed({ pop: true, ageS: 0.42 });
console.log('fallback gun', a.gun.rotation.x.toFixed(4), 'dist', a.turret.position.distanceTo(a.seat).toFixed(3), 'turn', turn(a.turret).toFixed(3));
for (let i = 0; i < 40; i++) a.visual.syncFromState(a.state, 0.05, 150);
console.log('fallback rest gun', a.gun.rotation.x.toFixed(4), 'dist', a.turret.position.distanceTo(a.seat).toFixed(3), 'turn', turn(a.turret).toFixed(3));
await preloadWreckTurretDriver();
const b = battleTank();
b.visual.setDestroyed({ pop: true, ageS: 0.42 });
console.log('body gun', b.gun.rotation.x.toFixed(4), 'dist', b.turret.position.distanceTo(b.seat).toFixed(3), 'turn', turn(b.turret).toFixed(3));
for (let i = 0; i < 40; i++) b.visual.syncFromState(b.state, 0.05, 150);
console.log('body rest gun', b.gun.rotation.x.toFixed(4), 'dist', b.turret.position.distanceTo(b.seat).toFixed(3), 'turn', turn(b.turret).toFixed(3));
