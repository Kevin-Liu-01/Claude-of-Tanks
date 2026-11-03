// 2026-11-02 audit F10: who poses a wreck's turret is one declared mode (wreckTurretDriver.ts WreckTurretDriverMode),
// and the drawn turret follows its authority whatever order the calls come in:
//  - an authority declared before the kill (awaitExternal, or its first pose) holds for the next begin: no local body
//    is thrown (it was wiped by begin, so a host's turret flew here first and snapped to the host's pose later);
//  - a null pose ("none this frame") never drops a pose not yet drawn;
//  - a failed physics load is a declared state, reported once, and retried (it was swallowed);
//  - a kill before the physics had loaded keeps the scripted arc only until an authority's pose arrives: the wreck asks
//    for the physics and hands its turret to the body, so the turret drawn and the turret shells meet agree;
//  - a restaged victim (the killcam) re-wrecked at a late age with its authority's pose declared first lies there, not
//    where a local body would have settled it; the killcam's wreck receipt does the same for a restaged attacker.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getSpec } from './specs.ts';
import { createWreckTurretDriver } from './wreckTurretDriver.ts';
import * as pageLoader from './wreckTurretDriverLoader.ts';
import { createTank } from './tankFactory.ts';
import { createTankState } from '../sim/movement.ts';
import { wreckTurretProfile } from '../sim/wreckTurrets.ts';
import { recordKillcamWreck, restoreKillcamWreck } from '../game/killcamWreckReceipt.ts';

const spec = getSpec('m1a1_abrams_hc');
const profile = wreckTurretProfile(spec);
const GROUND = 2;
function rig() {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.position.set(50, GROUND, -20);
  root.rotation.set(0, 0.4, 0, 'YXZ');
  const turret = new THREE.Group();
  turret.position.set(profile.pivot[0], profile.pivot[1], profile.pivot[2]);
  const gun = new THREE.Group();
  turret.add(gun);
  root.add(turret);
  scene.add(root);
  let seed = 7;
  const driver = createWreckTurretDriver({
    spec, root, turret, gun, ground: () => () => GROUND,
    random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, trail() {}, landing() {},
  });
  return { root, turret, driver };
}
const worldOf = (o) => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); };
// a pose well clear of anything the turret's own throw reaches in a few frames
const hostPose = (root, dx = 7, dz = 3) => Float64Array.of(root.position.x + dx, GROUND + 0.9, root.position.z + dz, 0, 0.3826834, 0, 0.9238795);

// ---- the driver ----
{
  // declared before the kill: held, never thrown here
  const r = rig();
  assert.equal(r.driver.mode, 'inactive');
  r.driver.awaitExternal();
  const seat = worldOf(r.turret);
  r.driver.begin(true, r.turret.position.clone(), null);
  assert.equal(r.driver.mode, 'awaiting', 'an authority declared before the kill holds for it');
  for (let f = 1; f <= 30; f++) r.driver.update(f / 60, 1 / 60);
  assert.ok(worldOf(r.turret).distanceTo(seat) < 1e-6, 'the turret waits for its authority instead of flying here');
  const pose = hostPose(r.root);
  r.driver.setExternal(pose);
  r.driver.setExternal(null); // none this frame: the pose not yet drawn stands
  r.driver.update(31 / 60, 1 / 60);
  assert.equal(r.driver.mode, 'external');
  assert.ok(worldOf(r.turret).distanceTo(new THREE.Vector3(pose[0], pose[1], pose[2])) < 1e-6, 'drawn at the authority\'s pose');
  const held = new Float64Array(7);
  assert.equal(r.driver.heldPose(held), true);
  assert.deepEqual([...held], [...pose]);
  r.driver.reset();
  assert.equal(r.driver.mode, 'inactive');
  r.driver.begin(true, r.turret.position.clone(), null);
  assert.equal(r.driver.mode, 'pending', 'a reset forgets the authority');
}
{
  // a pose before a late-age begin (a re-wreck): placed there at once, no local run to that age
  const r = rig();
  const pose = hostPose(r.root, -6, 4);
  r.driver.setExternal(pose);
  r.driver.begin(false, r.turret.position.clone(), 12);
  assert.equal(r.driver.mode, 'awaiting');
  r.driver.update(12, 0);
  assert.ok(worldOf(r.turret).distanceTo(new THREE.Vector3(pose[0], pose[1], pose[2])) < 1e-6, 'a re-wreck lies where its authority had it');
}

// ---- the loader: a failure is declared, reported once and retried ----
{
  const reports = [];
  let fail = true;
  const loader = pageLoader.createWreckTurretDriverLoader(async () => {
    if (fail) throw new Error('chunk 404');
    return import('./wreckTurretDriver.ts');
  }, (message, error) => reports.push([message, error.message]));
  assert.equal(loader.state, 'idle');
  const first = loader.preload();
  assert.equal(loader.state, 'loading');
  await assert.rejects(first, /chunk 404/);
  assert.equal(loader.state, 'failed', 'a failed load is a state, not swallowed');
  assert.equal(reports.length, 1);
  assert.equal(reports[0][1], 'chunk 404');
  assert.equal(loader.create({}), null, 'nothing to drive with while failed');
  fail = false;
  await loader.preload();
  assert.equal(loader.state, 'loaded', 'the next request retries');
  assert.equal(reports.length, 1);
}

// ---- the factory: a kill before the physics, then the authority's pose ----
function battleTank() {
  const visual = createTank('m1a1_abrams_hc', null, { proceduralOnly: true, geometryReceipt: true, batchStatic: true, battleDetailLod: true });
  const state = createTankState(spec, new THREE.Vector3(12, 0.7, -9), 0.83);
  visual.setGroundSampler(() => 0.7);
  for (let i = 0; i < 4; i++) visual.syncFromState(state, 0.05, 60);
  return { visual, state, turret: visual.root.getObjectByName('rig_turret') };
}
assert.equal(pageLoader.wreckTurretDriverReady(), false, 'nothing has loaded the physics in this process yet');
{
  const t = battleTank();
  t.visual.setDestroyed({ pop: true });
  t.visual.syncFromState(t.state, 0.05, 60);
  const pose = hostPose(t.visual.root, 6, -5);
  const target = new THREE.Vector3(pose[0], pose[1], pose[2]);
  t.visual.setWreckTurretPose(pose);
  assert.equal(pageLoader.wreckTurretDriverLoadState?.(), 'loading', "the authority's pose asks for the physics");
  await pageLoader.preloadWreckTurretDriver();
  for (let f = 0; f < 3; f++) {
    t.visual.setWreckTurretPose(pose);
    t.visual.syncFromState(t.state, 0.05, 60);
  }
  const off = worldOf(t.turret).distanceTo(target);
  assert.ok(off < 1, `the scripted turret hands over to its authority's pose once the physics lands (${off.toFixed(2)} m off)`);

  // the killcam's restage: lifted intact, then re-wrecked late with its authority's pose declared first
  const held = new Float64Array(7);
  assert.equal(t.visual.wreckTurretHeldPose(held), true);
  t.visual.resetDestroyed();
  t.visual.syncFromState(t.state, 0, 60);
  t.visual.awaitWreckTurretPose();
  t.visual.setWreckTurretPose(held);
  t.visual.setDestroyed({ pop: true, ageS: 12 });
  t.visual.syncFromState(t.state, 0, 60);
  const back = worldOf(t.turret).distanceTo(target);
  assert.ok(back < 1, `the re-wrecked turret lies where its authority had it (${back.toFixed(2)} m off)`);

  // the killcam's receipt (game/killcamWreckReceipt.ts) for any restaged wreck, an attacker that cooked off after firing
  // too: read before the lift, it comes back a cook-off at its authority's pose (the attacker's re-wreck was plain, its
  // turret thrown and settled by a local body by its seat)
  const receipt = recordKillcamWreck(t.visual);
  assert.equal(receipt.pop, true, 'the receipt reads the cook-off');
  t.visual.resetDestroyed();
  t.visual.syncFromState(t.state, 0, 60);
  restoreKillcamWreck(t.visual, receipt);
  t.visual.syncFromState(t.state, 0, 60);
  assert.equal(t.visual.wreckState(), 'cookoff', 'and the restored wreck is one');
  const restored = worldOf(t.turret).distanceTo(target);
  assert.ok(restored < 1, `its turret lies where its authority had it (${restored.toFixed(2)} m off)`);
}

console.log('wreckTurretMode.selftest: one declared turret mode; an authority declared before the kill holds, a failed physics load is reported and retried, a scripted turret hands over to its authority, a re-wreck lies where its authority had it');
