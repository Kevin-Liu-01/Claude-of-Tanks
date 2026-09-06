import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createBrowserBattleBridge } from './browserBattleBridge.ts';
import { BrowserInputRuntime } from './browserInputRuntime.ts';
import { SNAPSHOT_FLAGS } from './snapshot.ts';

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
    contactGeom: { halfLenM: 2.315, halfWidM: 1.715, zCenterM: 0.005, bottomYM: -0.064 },
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
  hp: 2000, maxHp: 2000, reloadS: 0, shellSlot: 0,
  ammo0: 0, ammo1: 4, ammo2: 2, flags: 0,
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

assert.equal(game.player.contactGeom, null,
  'network movement uses the same spec-derived contact footprint as headless authority');
assert.equal(game.player.rigidGear, false);
assert.equal(game.player.visual.contactGeom.bottomYM, -0.064,
  'authored visual contact metadata remains intact for presentation');

assert.equal(visuals.some((visual) => visual.revealedBeforePose), false,
  'no remote or local tank becomes visible before its first authority pose');
assert.deepEqual(visuals.map((visual) => visual.syncs), [1, 1],
  'authority performs one hidden initialization sync, not per-frame duplicate work');
assert.deepEqual(
  visuals.map((visual) => [visual.root.position.x, visual.root.position.z]),
  [[142, -73], [-91, 64]],
  'first visible transforms match authoritative spawn positions',
);

// A shell-selection edge is client intent until authority acknowledges it.
// Replaying a slightly older snapshot after the player empties the active
// channel must not erase the requested replacement before it reaches the
// input lane, or the ammo guard suppresses fire forever on the empty slot.
game.player.input.shellSlot = 1;
game.player.combat.shellSlot = 1;
snapshot.tick++;
bridge.apply(snapshot);
const requestedAmmoFrame = new BrowserInputRuntime().frame(game.player);
assert.equal(requestedAmmoFrame.shellSlot, 1,
  'a stale local snapshot cannot erase a pending ammunition selection');

snapshot.entities[1].shellSlot = 1;
snapshot.tick++;
bridge.apply(snapshot);
assert.equal(game.player.input.shellSlot, 1,
  'the authority acknowledgement settles the requested ammunition slot');
snapshot.entities[1].shellSlot = 0;
snapshot.tick++;
bridge.apply(snapshot);
assert.equal(game.player.input.shellSlot, 0,
  'a later authoritative reset applies after the pending request settles');

const mobility = {
  id: 'guest', modules: { engine: 'yellow', transmission: 'ok', trackL: 'red',
    trackR: 'ok', turretRing: 'yellow', gunMount: 'ok', gun: 'ok' },
  crew: { driver: false, gunner: true },
  equipment: { traverse: 1.1, turret: 1.15, aimTime: 0.9, bloom: 0.9 },
  modeSpeedMultiplier: 1.85,
};
snapshot.immediateAuthority = { tick: ++snapshot.tick, serverTimeMs: 200,
  ackInputSeq: null, entity: snapshot.entities[1], predictionState: mobility };
snapshot.meta.localPrediction = { ...mobility, modeSpeedMultiplier: 1 };
bridge.apply(snapshot);
assert.equal(game.player.combat.modules.trackL.state, 'red',
  'destroyed tracks affect prediction even when the reliable damage edge was missed');
assert.equal(game.player.combat.crew.driver, false);
assert.equal(game.player.combat.equipMults.turret, 1.15);
assert.equal(game.player.modeSpeedMultiplier, 1.85,
  'own movement uses newest authority metadata, not delayed remote metadata');
assert.equal(game.tankById.get('host').combat.modules.trackL.state, 'ok',
  'private mobility details never modify remote entities');
mobility.modules.trackL = 'ok';
mobility.crew.driver = true;
mobility.modeSpeedMultiplier = 1;
snapshot.tick++;
bridge.apply(snapshot);
assert.equal(game.player.combat.modules.trackL.state, 'ok',
  'persistent mobility snapshots restore repaired tracks');
assert.equal(game.player.combat.crew.driver, true);
assert.equal(game.player.modeSpeedMultiplier, 1,
  'respawn/round reset removes an earlier mode speed modifier');
delete snapshot.immediateAuthority;
delete snapshot.meta.localPrediction;

snapshot.entities[1].flags = SNAPSHOT_FLAGS.OVERTURNED;
snapshot.tick++;
bridge.apply(snapshot);
assert.equal(game.player.state.overturned, true,
  'local presentation receives the authoritative overturned state');
snapshot.entities[1].flags = SNAPSHOT_FLAGS.OVERTURNED | SNAPSHOT_FLAGS.AUTO_RIGHTING;
snapshot.tick++;
bridge.apply(snapshot, 1 / 60, [{ type: 'tank_self_right', id: 'guest' }]);
assert.equal(game.player.state._body.autoRighting, true,
  'local prediction follows the authoritative recovery actuator');
assert.ok(busEvents.some((event) => event.type === 'tank:selfRight'),
  'the authoritative recovery edge reaches presentation once');
snapshot.entities[1].flags = 0;

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

snapshot.tick++;
bridge.apply(snapshot, 1 / 60, [{
  type: 'ammo_selection_denied', id: 'guest', slot: 1, reason: 'AMMO_EMPTY', guided: true,
}]);
assert.deepEqual(busEvents.findLast((event) => event.type === 'ui:ammoSelectionDenied')?.payload,
  { type: 'ammo_selection_denied', id: 'guest', slot: 1, reason: 'AMMO_EMPTY', guided: true },
  'network empty-selection denial reaches the canonical red-flash HUD path');

snapshot.tick++;
bridge.apply(snapshot, 1 / 60, [{
  type: 'ammo_depleted', id: 'guest', slot: 1, fallbackSlot: 0,
}]);
assert.deepEqual(busEvents.findLast((event) => event.type === 'ammo:depleted')?.payload,
  { type: 'ammo_depleted', id: 'guest', slot: 1, fallbackSlot: 0 },
  'network depletion fallback reaches the canonical HUD selection path');

snapshot.tick++;
bridge.apply(snapshot, 1 / 60, [{
  type: 'shell_impact', shellId: 78, shooterId: 'host', kind: 'prop',
  surfaceKind: 'building', x: 3, y: 2, z: 9, nx: 0, ny: 0.2, nz: -0.98,
  shellType: 'APFSDS', caliberMm: 120,
}]);
const structureExpired = busEvents.findLast((event) => event.type === 'shell:expired');
assert.equal(structureExpired?.payload?.hitKind, 'prop',
  'network structure collisions reach the canonical world-impact presentation event');
assert.deepEqual(structureExpired?.payload?.normal, [0, 0.2, -0.98]);
assert.equal(structureExpired?.payload?.caliberMm, 120);

assert.equal(bridge.endDisconnected(), true, 'an interrupted match resolves once');
assert.equal(game.result, 'draw');
assert.equal(game.resultReason, 'network_disconnect');
assert.equal(busEvents.at(-1)?.type, 'battle:ended');
assert.equal(busEvents.at(-1)?.payload?.reason, 'network_disconnect');
assert.equal(bridge.endDisconnected(), false, 'disconnect resolution is idempotent');

bridge.dispose();

// A real bridge/predictor survives background authority updates without doing
// visual work or replaying effects/history from a life nobody could observe.
{
  const backgroundEvents = [];
  const wrecks = [];
  let visualSyncs = 0;
  let visualResets = 0;
  const backgroundGame = { tanks: [], tankById: new Map(), shells: [], allTanks: [] };
  const backgroundBridge = createBrowserBattleBridge({
    engineCtx: { scene, anisotropy: 1 }, game: backgroundGame, viewerId: 'guest',
    worldCollision: { heightField: {
      getHeightAt: () => 0, getHeightAtFast: () => 0,
      getNormalAt: () => new Vector3(0, 1, 0), getGroundType: () => 'hard',
    } },
    bus: { emit(type) { backgroundEvents.push(type); } },
    createTankVisual: () => ({
      root: { position: new Vector3() }, setVisible() {},
      syncFromState() { visualSyncs++; },
      setDestroyed(options) { wrecks.push(options.pop); },
      resetDestroyed() { visualResets++; }, dispose() {},
    }),
  });
  await backgroundBridge.prepareRoster([
    { id: 'guest', name: 'Guest', specId: 'm1a2', team: 'alpha' },
  ]);
  const frame = (tick, timeS, x, destroyed = false, round = 1) => {
    const own = { ...entity('guest', 'alpha', x, 0),
      flags: destroyed ? SNAPSHOT_FLAGS.DESTROYED : 0, hp: destroyed ? 0 : 2000 };
    return { tick, serverTimeMs: timeS * 1000, entities: [own], shells: [],
      meta: { phase: 'playing', roomRound: round, battleTimeMs: timeS * 1000 },
      immediateAuthority: { tick, serverTimeMs: timeS * 1000,
        ackInputSeq: null, entity: own } };
  };
  const fired = (shellId) => ({ type: 'shell_fired', shellId, shooterId: 'guest',
    shellType: 'APFSDS', timeS: 1, x: 0, y: 2, z: 0, dx: 0, dy: 0, dz: 1 });
  const destroyed = (timeS, cause = 'ammo_rack') => ({
    type: 'tank_destroyed', id: 'guest', timeS, cause,
  });
  backgroundBridge.apply(frame(60, 1, 0), 1 / 60, [fired(100), fired(101)]);
  assert.equal(backgroundEvents.filter((type) => type === 'shell:fired').length, 1);
  assert.equal(backgroundBridge.getPresentationEventStats().pending, 1);
  backgroundBridge.recordInput({ throttle: 1, steer: 0, aimYaw: 0, aimPitch: 0 }, 1 / 60, 0);
  assert.equal(backgroundBridge.getPredictionStats().pendingInputs, 1);
  const statsBeforeBlur = backgroundBridge.getPredictionStats();
  backgroundBridge.beginBackground();
  assert.equal(backgroundBridge.getPresentationEventStats().pending, 0,
    'blur drops queued transient effects instead of replaying them on focus');
  assert.equal(backgroundBridge.getPredictionStats().pendingInputs, 0);
  const visualSyncsBeforeBackground = visualSyncs;
  const eventsBeforeBackground = backgroundEvents.length;
  backgroundBridge.retainBackgroundState(frame(120, 2, 1, true), [fired(102), destroyed(2)]);
  backgroundBridge.retainBackgroundState(frame(180, 3, 3), []);
  assert.equal(visualSyncs, visualSyncsBeforeBackground);
  assert.equal(wrecks.length, 0, 'background death metadata does not construct a wreck');
  assert.equal(backgroundEvents.length, eventsBeforeBackground,
    'background metadata never emits FX, audio or gameplay presentation');
  backgroundBridge.apply(frame(181, 3.02, 3));
  assert.equal(backgroundGame.player.state.pos.x, 3,
    'the first visible authority seeds an unseen nearby respawn, not an old-life correction');
  assert.equal(backgroundBridge.getPredictionStats().correctionM, 0);
  assert.equal(backgroundBridge.getPredictionStats().hardSnaps, statsBeforeBlur.hardSnaps,
    'background reseeding is not reported as a visible hard snap');
  assert.equal(backgroundEvents.filter((type) => type === 'shell:fired').length, 1);

  backgroundBridge.beginBackground();
  backgroundBridge.retainBackgroundState(frame(240, 4, 3, true), [destroyed(4)]);
  assert.equal(wrecks.length, 0);
  backgroundBridge.apply(frame(241, 4.02, 3, true));
  assert.deepEqual(wrecks, [true],
    'persistent ammo-rack wreck appearance survives dropping its hidden FX event');
  assert.equal(backgroundEvents.includes('tank:destroyed'), false);

  // A live sample bounds the next life: old reliable metadata cannot attach
  // the prior ammo-rack pop to a later generic wreck with the same entity ID.
  backgroundBridge.apply(frame(300, 5, 3));
  assert.equal(visualResets, 1);
  backgroundBridge.beginBackground();
  backgroundBridge.retainBackgroundState(frame(360, 6, 3, true), [destroyed(4)]);
  backgroundBridge.apply(frame(361, 6.02, 3, true));
  assert.deepEqual(wrecks, [true, false]);

  // Round tick counters may restart. An older generation must never restore
  // its metadata after the new generation has been admitted.
  backgroundBridge.beginBackground();
  backgroundBridge.retainBackgroundState(frame(3, 0.05, 0, false, 2), []);
  backgroundBridge.retainBackgroundState(frame(400, 6.7, 0, true, 1), [destroyed(6.7)]);
  backgroundBridge.apply(frame(4, 0.067, 0, false, 2));
  assert.equal(backgroundBridge.apply(frame(401, 6.8, 0, true, 1)), false);
  backgroundBridge.retainBackgroundState(frame(6, 0.1, 0, true, 2), []);
  backgroundBridge.apply(frame(7, 0.117, 0, true, 2));
  assert.deepEqual(wrecks, [true, false, false], 'old-round ammo-rack metadata stays discarded');
  backgroundBridge.dispose();
}
{
  const predictionGame = { tanks: [], tankById: new Map(), player: null, shells: [],
    spotting: null, timeS: 0, preBattleS: 0, result: null, resultReason: null };
  const field = { getHeightAt: () => 0, getHeightAtFast: () => 0,
    getNormalAt: () => new Vector3(0, 1, 0), getGroundType: () => 'hard' };
  const predictionBridge = createBrowserBattleBridge({ engineCtx: { scene }, game: predictionGame,
    bus: { emit() {} }, viewerId: 'guest', worldCollision: { heightField: field },
    createTankVisual: fakeVisual, prepareVisualTextures: async () => {} });
  const own = entity('guest', 'alpha', 0, 0);
  const frame = { tick: 0, serverTimeMs: 0, entities: [own], shells: [],
    meta: { phase: 'playing' }, immediateAuthority: { tick: 0, serverTimeMs: 0,
      ackInputSeq: null, entity: { ...own }, predictionState: null } };
  predictionBridge.apply(frame);
  predictionBridge.recordInput({ throttle: 1, steer: 0, aimLocked: true }, 1 / 60, 1);
  frame.tick = frame.immediateAuthority.tick = 1;
  own.z = 10;
  predictionBridge.apply(frame, 1 / 60);
  const prediction = predictionGame.player.predictor;
  assert.ok(prediction.simEntity.state.pos.z < 0.01,
    'browser owned movement replays raw authority, never an already smoothed/extrapolated pose');
  assert.equal(prediction.getStats().replayedInputs, 1,
    'the browser uses its unacknowledged control history instead of cancelling local motion');
  frame.immediateAuthority.ackInputSeq = 1;
  frame.tick = frame.immediateAuthority.tick = 2;
  predictionBridge.apply(frame, 0);
  prediction.correction.x = 0.4;
  assert.equal(predictionBridge.advancePrediction(null, 1 / 60), false);
  const shown = predictionGame.player.state.pos.x;
  assert.ok(shown > 0 && shown < 0.4, 'no-control frames still settle existing presentation error');
  frame.tick = frame.immediateAuthority.tick = 3;
  predictionBridge.apply(frame, 1 / 60);
  assert.equal(predictionGame.player.state.pos.x, shown,
    'a fresh authority sample cannot spend the display correction clock a second time');
  predictionBridge.dispose();
}
console.log('browserBattleBridge.selftest: hidden authority-pose reveal passed');
