import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createBrowserBattleBridge } from './browserBattleBridge.js';

const visuals = [];
const scene = { add() {} };
const game = {
  tanks: [],
  tankById: new Map(),
  player: null,
  shells: [],
  spotting: null,
  allTanks: [],
  timeS: 0,
  preBattleS: 0,
  result: null,
  resultReason: null,
  mapId: 'winter',
};
const busEvents = [];

function fakeVisual() {
  const visual = {
    root: { position: new Vector3() },
    visible: true,
    syncs: 0,
    revealedBeforePose: false,
    setVisible(next) {
      if (next && this.syncs === 0) this.revealedBeforePose = true;
      this.visible = next;
    },
    syncFromState(state) {
      this.syncs++;
      this.root.position.copy(state.pos);
    },
    dispose() {},
  };
  visuals.push(visual);
  return visual;
}

const bridge = createBrowserBattleBridge({
  engineCtx: { scene, anisotropy: 1 },
  game,
  bus: { emit(type, payload) { busEvents.push({ type, payload }); } },
  viewerId: 'guest',
  createTankVisual: fakeVisual,
  prepareVisualTextures: async () => {},
});

await bridge.prepareRoster([
  { id: 'host', name: 'Host', specId: 'm1a2', team: 'alpha' },
  { id: 'guest', name: 'Guest', specId: 'm1a2', team: 'bravo' },
]);
assert.equal(visuals.every((visual) => !visual.visible), true,
  'prepared multiplayer visuals stay hidden at the staging origin');

const entity = (id, team, x, z) => ({
  id, specId: 'm1a2', team, x, y: 1.2, z,
  vx: 0, vz: 0, yaw: 0.4, pitch: 0.03, roll: -0.02,
  turretYaw: 0.2, gunPitch: -0.04,
  hp: 2000, maxHp: 2000, reloadS: 0, shellSlot: 0, flags: 0,
});
const snapshot = {
  tick: 1,
  serverTimeMs: 100,
  entities: [entity('host', 'alpha', 142, -73), entity('guest', 'bravo', -91, 64)],
  shells: [],
  meta: { phase: 'countdown', countdownMs: 5000, destructibleRevision: 0,
    destroyedObstacleIndices: [] },
};
bridge.apply(snapshot);

assert.equal(visuals.some((visual) => visual.revealedBeforePose), false,
  'no remote or local tank becomes visible before its first authority pose');
assert.deepEqual(visuals.map((visual) => visual.syncs), [1, 1],
  'authority performs one hidden initialization sync, not per-frame duplicate work');
assert.deepEqual(
  visuals.map((visual) => [visual.root.position.x, visual.root.position.z]),
  [[142, -73], [-91, 64]],
  'first visible transforms match authoritative spawn positions',
);

snapshot.tick++;
snapshot.entities[0].x++;
snapshot.entities[1].z++;
bridge.apply(snapshot);
assert.deepEqual(visuals.map((visual) => visual.syncs), [1, 1],
  'subsequent snapshots leave visual sync ownership to the render loop');

assert.equal(bridge.endDisconnected(), true, 'an interrupted match resolves once');
assert.equal(game.result, 'draw');
assert.equal(game.resultReason, 'network_disconnect');
assert.equal(busEvents.at(-1)?.type, 'battle:ended');
assert.equal(busEvents.at(-1)?.payload?.reason, 'network_disconnect');
assert.equal(bridge.endDisconnected(), false, 'disconnect resolution is idempotent');

bridge.dispose();
console.log('browserBattleBridge.selftest: hidden authority-pose reveal passed');
