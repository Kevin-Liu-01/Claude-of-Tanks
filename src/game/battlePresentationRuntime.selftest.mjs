import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';

import { createBattlePresentationRuntime } from './battlePresentationRuntime.ts';
import {
  advanceTankPresentationPose,
  createTankPresentationPose,
  resetTankPresentationPose,
  sampleTankPresentationPose,
} from './presentationPose.js';

function createEntity({
  id = 'tank',
  team = 'ally',
  isPlayer = false,
  position = new Vector3(0, 0, -20),
  speed = 0,
} = {}) {
  const root = new Object3D();
  const syncs = [];
  const visibility = [];
  const visual = {
    root,
    setVisible(value) { root.visible = value; visibility.push(value); },
    syncFromState(...args) { syncs.push(args); },
  };
  return {
    entity: {
      id,
      team,
      isPlayer,
      state: { pos: position, yaw: 0, speed },
      combat: { destroyed: false },
      visual,
      spec: {
        era: 'modern',
        topSpeedKmh: 60,
        dims: { heightM: 2.5, widthM: 3.5, hullLengthM: 7 },
      },
      input: { throttle: 0 },
    },
    root,
    visual,
    syncs,
    visibility,
  };
}

function createHarness({ tanks = [], network = false, spotted = true, world = null } = {}) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 16 / 9, 0.5, 4000);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 1, -20);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  for (const tank of tanks) scene.add(tank.visual.root);
  const effects = { dust: [], exhaust: [], crushed: [] };
  const fx = {
    dust(position, forward, intensity) {
      effects.dust.push({ position: position.clone(), forward: forward.clone(), intensity });
    },
    exhaust(position, load, diesel) {
      effects.exhaust.push({ position: position.clone(), load, diesel });
    },
    propCrush(position, direction, height) {
      effects.crushed.push({ position: position.clone(), direction: direction.clone(), height });
    },
    loosePropHit(position, direction, height) {
      effects.crushed.push({ position: position.clone(), direction: direction.clone(), height, loose: true });
    },
  };
  const game = {
    phase: 'battle',
    tanks,
    player: tanks.find((tank) => tank.isPlayer) || tanks[0] || null,
    spotting: { isSpotted: () => spotted },
  };
  const runtime = createBattlePresentationRuntime({
    game,
    camera,
    scene,
    battleClient: {
      advanceTankPresentationPose,
      createTankPresentationPose,
      resetTankPresentationPose,
      sampleTankPresentationPose,
      isPostwarVehicleEra: (era) => era !== 'ww2',
    },
    getFx: () => fx,
    getWorld: () => world,
    isNetworkMatchActive: () => network,
    getPedestalVisual: () => null,
    isCinematicActive: () => false,
  });
  return { runtime, game, scene, camera, effects };
}

{
  const { entity, syncs } = createEntity({ isPlayer: true, position: new Vector3(0, 0, -20) });
  const { runtime } = createHarness({ tanks: [entity] });
  runtime.resetSoloPoses();
  entity.state.pos.set(2, 0, -20);
  runtime.captureSoloPoses();
  runtime.update(1 / 120, 0.5);
  assert.equal(syncs.length, 1);
  assert.equal(syncs[0][3].pos.x, 1, 'solo presentation samples between fixed steps');
  const stablePose = syncs[0][3];
  runtime.update(1 / 120, 0.75);
  assert.equal(syncs[1][3], stablePose, 'solo interpolation reuses its presented pose');
}

{
  const { entity, syncs } = createEntity({ isPlayer: true });
  const { runtime } = createHarness({ tanks: [entity], network: true });
  runtime.update(1 / 60, 0.25);
  assert.equal(syncs[0][3], entity.state,
    'network bridge poses bypass the solo interpolation buffer');
}

{
  const hidden = createEntity({ id: 'hidden', team: 'enemy' });
  const harness = createHarness({ tanks: [hidden.entity], spotted: false });
  harness.runtime.update(1 / 60);
  assert.equal(hidden.root.parent, null, 'fully hidden opponents leave scene traversal');
  assert.equal(hidden.root.userData.battleVisibilityDetached, true);
  assert.equal(hidden.syncs.length, 0, 'hidden opponents skip visual and track work');
  assert.equal(harness.effects.exhaust.length, 0, 'hidden opponents leak no FX');

  harness.game.spotting.isSpotted = () => true;
  harness.runtime.update(1);
  assert.equal(hidden.root.parent, harness.scene,
    'a legal spotting edge restores owner-detached residency before sync');
  assert.equal(hidden.syncs.length, 1);
}

{
  const foreign = createEntity({ id: 'foreign', team: 'enemy' });
  const harness = createHarness({ tanks: [foreign.entity], spotted: true });
  foreign.root.removeFromParent();
  harness.runtime.update(1 / 60);
  assert.equal(foreign.root.parent, null,
    'spotting cannot resurrect a visual detached by another lifecycle owner');
}

{
  const near = createEntity({ id: 'near', position: new Vector3(0, 0, -20) });
  const offscreen = createEntity({ id: 'offscreen', position: new Vector3(500, 0, -20) });
  const harness = createHarness({ tanks: [near.entity, offscreen.entity] });
  harness.runtime.update(1 / 60);
  assert.equal(near.syncs[0][4], true, 'on-screen running gear retains full detail cadence');
  assert.equal(offscreen.syncs[0][4], false,
    'off-screen running gear receives the reduced-detail signal');
}

{
  const sixty = createEntity({ isPlayer: true, speed: 10 });
  const sixtyHarness = createHarness({ tanks: [sixty.entity] });
  sixtyHarness.runtime.update(1 / 60);
  const oneTwenty = createEntity({ isPlayer: true, speed: 10 });
  const oneTwentyHarness = createHarness({ tanks: [oneTwenty.entity] });
  oneTwentyHarness.runtime.update(1 / 120);
  oneTwentyHarness.runtime.update(1 / 120);
  assert.equal(sixtyHarness.effects.exhaust.length, 1);
  assert.equal(oneTwentyHarness.effects.exhaust.length, 1,
    'vehicle FX density is display-refresh independent');
  assert.equal(sixtyHarness.effects.dust.length, oneTwentyHarness.effects.dust.length);
}

{
  const reverse = createEntity({ isPlayer: true, speed: -4 });
  const world = {
    crushables: [{ x: 0, y: 0, z: -20, h: 2, dynamic: false }],
    crushCalls: [],
    crushProp(index, x, z, speed) {
      this.crushCalls.push({ index, x, z, speed });
      return true;
    },
  };
  const harness = createHarness({ tanks: [reverse.entity], world });
  harness.runtime.update(1 / 60);
  assert.ok(world.crushCalls[0].z < 0,
    'reverse impacts use travel direction rather than hull facing');
  assert.ok(harness.effects.crushed[0].direction.z < 0);
}

{
  const first = createEntity({ position: new Vector3(4, 0, 7) });
  const second = createEntity({ position: new Vector3(-3, 0, 9) });
  let warmedPoints = null;
  const world = {
    heightField: {
      *warmFastTilesAround(points) { warmedPoints = points; yield 1; yield 2; },
    },
    crushProp: () => false,
  };
  const harness = createHarness({ tanks: [first.entity, second.entity], world });
  harness.runtime.primeDeploymentTerrainTiles();
  assert.deepEqual(warmedPoints, [
    { x: 4, z: 7, radiusM: 0 },
    { x: -3, z: 9, radiusM: 0 },
  ]);
}

console.log('battlePresentationRuntime.selftest: interpolation, visibility, detail, FX, and terrain passed');
