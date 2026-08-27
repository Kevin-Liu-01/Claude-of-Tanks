import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createBrowserBattleBridge } from './browserBattleBridge.js';
import { SNAPSHOT_FLAGS } from './snapshot.js';

const visuals = [];
const visualOptions = [];
const textureWarms = [];
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
const destructionOrder = [];

function fakeVisual(_specId, _engineCtx, opts) {
  visualOptions.push(opts);
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
    recoilKick() { return 1; },
    gunMuzzleWorld(out, muzzleIndex) { return out.set(20 + muzzleIndex, 3, -8); },
    strippedEra: [],
    eraResets: 0,
    stripEra(name) { this.strippedEra.push(name); },
    resetEra() { this.eraResets++; },
    setDestroyed() { destructionOrder.push(`wreck:${visuals.indexOf(this)}`); },
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
  prepareVisualTextures: async (...args) => { textureWarms.push(args); },
  clearVehicleDecals: (visual) => {
    destructionOrder.push(`decals:${visuals.indexOf(visual)}`);
  },
});

await bridge.prepareRoster([
  { id: 'host', name: 'Host', specId: 'm1a2', camo: 'summer', team: 'alpha' },
  { id: 'guest', name: 'Guest', specId: 'm1a2', camo: 'winter', team: 'bravo' },
]);
assert.deepEqual(visualOptions.map((opts) => opts.camoPattern), ['summer', 'winter'],
  'duplicate vehicles build with each roster player\'s immutable camo variant');
assert.deepEqual(textureWarms.map((args) => args[4]), ['summer', 'winter'],
  'every distinct vehicle/camo variant is prewarmed before reveal');
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
snapshot.entities[0].eraSpent = ['glacis_era_L'];
bridge.apply(snapshot);
assert.deepEqual(visuals.map((visual) => visual.syncs), [1, 1],
  'subsequent snapshots leave visual sync ownership to the render loop');
assert.deepEqual(visuals[0].strippedEra, ['glacis_era_L'],
  'snapshot state depletes ERA for clients that missed the activation event');

snapshot.tick++;
snapshot.entities[0].eraSpent = [];
bridge.apply(snapshot);
assert.equal(visuals[0].eraResets, 1,
  'new-round empty ERA state restores the reusable vehicle visual');

snapshot.tick++;
snapshot.entities[0].flags = SNAPSHOT_FLAGS.DESTROYED;
snapshot.entities[0].hp = 0;
bridge.apply(snapshot);
assert.deepEqual(destructionOrder, ['decals:0', 'wreck:0'],
  'network destruction clears transient scars before the wreck material traversal');
snapshot.entities[0].flags = 0;
snapshot.entities[0].hp = 2000;

snapshot.tick++;
bridge.apply(snapshot, 1 / 60, [{
  type: 'shell_fired', shellId: 77, shooterId: 'host',
  shellType: 'APFSDS', shellName: 'M829A3', caliberMm: 120,
  velocityMps: 1650, timeS: 1, x: 142, y: 2, z: -73,
  dx: 0, dy: 0, dz: 1,
}]);
const fired = busEvents.findLast((event) => event.type === 'shell:fired');
assert.equal(fired?.payload?.muzzleIndex, 1,
  'network shell audio receives the same twin-barrel index as recoil and flash');
assert.deepEqual(fired?.payload?.muzzlePos, [21, 3, -8],
  'network shell audio originates from the selected muzzle tip');

snapshot.tick++;
bridge.apply(snapshot, 1 / 60, [{
  type: 'magazine_reload_denied', id: 'guest', reason: 'MAGAZINE_RELOADING',
}]);
assert.equal(busEvents.findLast((event) => event.type === 'ui:magazineReloadDenied')?.payload?.reason,
  'MAGAZINE_RELOADING', 'network reload denial reaches the canonical HUD feedback path');

assert.equal(bridge.endDisconnected(), true, 'an interrupted match resolves once');
assert.equal(game.result, 'draw');
assert.equal(game.resultReason, 'network_disconnect');
assert.equal(busEvents.at(-1)?.type, 'battle:ended');
assert.equal(busEvents.at(-1)?.payload?.reason, 'network_disconnect');
assert.equal(bridge.endDisconnected(), false, 'disconnect resolution is idempotent');

bridge.dispose();
console.log('browserBattleBridge.selftest: hidden authority-pose reveal passed');
