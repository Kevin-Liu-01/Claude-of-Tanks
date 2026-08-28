import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createListenerPoseRuntime } from './listenerPoseRuntime.ts';

const camera = new PerspectiveCamera();
camera.position.set(10, 20, 30);
camera.lookAt(10, 20, 31);
camera.updateMatrixWorld(true);
const player = {
  id: 'player', state: { pos: new Vector3(2, 3, 4) },
  spec: { dims: { heightM: 3 } },
};
const ally = {
  id: 'ally', state: { pos: new Vector3(-2, 1, 8) },
  spec: { dims: { heightM: 2.5 } },
};
const game = {
  player,
  tanks: [player, ally],
  tankById: new Map([[player.id, player], [ally.id, ally]]),
};
const rig = { mode: 'ARCADE' };
let replayActive = false;
const killcam = {
  isActive: () => replayActive,
  spectate: { active: false, targetId: null },
};
const calls = [];
const runtime = createListenerPoseRuntime({
  camera, game, rig, killcam,
  audio: {
    update(dtSeconds, pose, tanks) {
      calls.push({ dtSeconds, pose, tanks, position: pose.pos.toArray(), kind: pose.kind,
        ownerId: pose.ownerId, scoped: pose.scoped, forward: pose.forward.toArray() });
    },
  },
});

runtime.update(1 / 60, true, false);
assert.deepEqual(calls.at(-1).position, [2, 5.04, 4]);
assert.equal(calls.at(-1).kind, 'player-tank');
assert.equal(calls.at(-1).ownerId, 'player');
assert.equal(calls.at(-1).tanks, game.tanks);

rig.mode = 'SNIPER';
camera.userData.scoped = true;
runtime.update(1 / 60, true, false);
assert.equal(calls.at(-1).scoped, true, 'scope selects the interior listener perspective');
assert.equal(calls.at(-1).pose, runtime.pose, 'the pose object is retained across frames');

killcam.spectate.active = true;
killcam.spectate.targetId = ally.id;
runtime.update(1 / 60, true, false);
assert.deepEqual(calls.at(-1).position, [-2, 2.7, 8]);
assert.equal(calls.at(-1).kind, 'spectated-tank');
assert.equal(calls.at(-1).ownerId, 'ally');

replayActive = true;
runtime.update(1 / 60, true, true);
assert.equal(calls.at(-1).kind, 'killcam-camera');
assert.equal(calls.at(-1).pose.pos, camera.position);
assert.equal(calls.at(-1).scoped, false);

replayActive = false;
runtime.update(1 / 60, false, false);
assert.equal(calls.at(-1).kind, 'camera');
assert.equal(calls.at(-1).ownerId, null);
assert.ok(Math.abs(calls.at(-1).forward[0]) < 1e-9 &&
  Math.abs(calls.at(-1).forward[1]) < 1e-9 && calls.at(-1).forward[2] > 0.999,
'listener azimuth follows the camera direction');

console.log('listenerPoseRuntime.selftest: player, scope, spectator and killcam poses passed');
