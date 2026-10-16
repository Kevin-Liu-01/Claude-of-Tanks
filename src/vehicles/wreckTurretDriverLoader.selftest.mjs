// The wreck turret's physics loads only where turrets pop (physics lane, 2026-10-11; 218's bundle budget). The tank
// factory reaches it through wreckTurretDriverLoader.ts alone, so the gallery and the garage never carry it; the battle
// warm access and the Studio load it under their covers. A kill before it has loaded keeps the factory's scripted pop
// for that turret (the scripted tube drop, not the body's droop), the first kill after it is a body, and a hull that
// fell back is a body in its next life.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { WRECK_GUN_DROOP_RAD } from '../sim/wreckTurrets.ts';
import { createBattleWarmAccess } from '../game/battleWarmAccess.ts';
import { preloadWreckTurretDriver, wreckTurretDriverReady } from './wreckTurretDriverLoader.ts';

// the static graph: the factory and the loader name the driver only as types, and the factory never the rigid bodies
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const valueImportOf = (text, pattern) => [...text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)]
  .map((match) => match[1]).filter((specifier) => pattern.test(specifier));
assert.deepEqual(valueImportOf(source('./tankFactoryCore.ts'), /wreckTurretDriver\.ts$|rigidBody\.ts$|wreckTurrets\.ts$/), [],
  'the tank factory loads no wreck physics statically');
assert.deepEqual(valueImportOf(source('./tankFactory.ts'), /wreckTurretDriver\.ts$|rigidBody\.ts$|wreckTurrets\.ts$/), [],
  'the tank factory facade loads no wreck physics statically');
assert.deepEqual(valueImportOf(source('./wreckTurretDriverLoader.ts'), /./), [], 'the loader imports nothing but types');
assert.match(source('./wreckTurretDriverLoader.ts'), /import\('\.\/wreckTurretDriver\.ts'\)/, 'the loader imports the driver lazily');

assert.equal(wreckTurretDriverReady(), false, 'loading the tank factory does not load the wreck physics');

function battleTank() {
  const visual = createTank('m1a1_abrams_hc', null, { proceduralOnly: true, geometryReceipt: true, batchStatic: true, battleDetailLod: true });
  const turret = visual.root.getObjectByName('rig_turret');
  const gun = visual.root.getObjectByName('rig_gun');
  const seat = turret.position.clone();
  const state = createTankState(getSpec('m1a1_abrams_hc'), new THREE.Vector3(12, 0.7, -9), 0.83);
  state.turretYaw = 0.61;
  state.gunPitch = 0.17;
  visual.setGroundSampler(() => 1.4);
  for (let i = 0; i < 6; i++) visual.syncFromState(state, 0.08, 150);
  return { visual, turret, gun, seat, state };
}
const turretTurn = (turret) => 2 * Math.acos(Math.min(1, Math.abs(turret.quaternion.w)));

// a kill before the physics has loaded: the scripted pop, and the frame never waits for it
const early = battleTank();
early.visual.setDestroyed({ pop: true, ageS: 0.42 });
assert.ok(Math.abs(early.gun.rotation.x - WRECK_GUN_DROOP_RAD) > 0.05, 'a kill before the physics keeps the scripted tube drop');
assert.ok(early.turret.position.distanceTo(early.seat) > 0.3, 'the scripted pop still throws the turret off its ring');

// every battle path's cover loads the battle warm runtime, and the physics beside it
const warmAccess = createBattleWarmAccess();
const entry = warmAccess.preload();
const shared = [preloadWreckTurretDriver(), preloadWreckTurretDriver()];
await entry;
assert.equal(wreckTurretDriverReady(), true, 'the battle warm runtime arrives with the wreck physics loaded');
await Promise.all(shared);

// the early turret finishes its scripted fall: it is not taken over mid-flight
for (let i = 0; i < 40; i++) early.visual.syncFromState(early.state, 0.05, 150);
assert.ok(Math.abs(early.gun.rotation.x - WRECK_GUN_DROOP_RAD) > 0.05, 'a fallen-back turret keeps the scripted pose to rest');

// the first kill after the load is a body: off its ring, turned by its tumble, the gun easing to the wreck's droop
const late = battleTank();
late.visual.setDestroyed({ pop: true, ageS: 0.42 });
assert.ok(late.turret.position.distanceTo(late.seat) > 0.3 && turretTurn(late.turret) > 0.4,
  'a kill after the load throws the turret as a body');
assert.ok(Math.abs(late.gun.rotation.x - WRECK_GUN_DROOP_RAD) < 1e-9, 'the body-driven gun lies at the wreck droop');

// the hull that fell back: a garage reset seats its turret, and its next kill is a body
early.visual.resetForGaragePresentation();
assert.ok(early.turret.position.distanceTo(early.seat) < 1e-6 && turretTurn(early.turret) < 1e-6,
  'a garage reset after a scripted pop seats the turret');
assert.equal(early.visual.isDestroyed(), false);
for (let i = 0; i < 6; i++) early.visual.syncFromState(early.state, 0.08, 150);
early.visual.setDestroyed({ pop: true, ageS: 0.42 });
assert.ok(early.turret.position.distanceTo(early.seat) > 0.3 && Math.abs(early.gun.rotation.x - WRECK_GUN_DROOP_RAD) < 1e-9,
  'a fallen-back hull pops its turret as a body in its next life');

console.log('wreckTurretDriverLoader.selftest: the tank factory carries no wreck physics; a kill before it loads keeps the scripted pop, every kill after it is a body');
