import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createBrowserBattleBridge } from './browserBattleBridge.ts';
import { BrowserInputRuntime } from './browserInputRuntime.ts';
import { SNAPSHOT_FLAGS } from './snapshot.ts';

const visuals = [];
const visualOptions = [];
const textureWarms = [];
const registeredVisuals = [];
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
  assert.equal(opts.eraVisualBindingReceipt, false,
    'network actors keep live ERA state without rebuilding the authoring audit');
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
  onVisualReady: (entity) => registeredVisuals.push(entity),
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
assert.deepEqual(registeredVisuals.map((entity) => entity.id), ['host', 'guest'],
  'each fully constructed actor publishes one explicit late-emitter lifecycle event');
assert.ok(registeredVisuals.every((entity) => entity.networkVisible === false),
  'emitter registration alone never reveals a network actor before authority');

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
bridge.recordInput(requestedAmmoFrame, 1 / 60, 0);

snapshot.entities[1].shellSlot = 1;
snapshot.ackInputSeq = 0;
snapshot.tick++;
bridge.apply(snapshot);
assert.equal(game.player.input.shellSlot, 1,
  'a countdown receipt preserves the requested ammunition slot');
snapshot.meta.phase = 'playing';
snapshot.tick++;
bridge.apply(snapshot);
bridge.recordInput(requestedAmmoFrame, 1 / 60, 1);
snapshot.ackInputSeq = 1;
snapshot.tick++;
bridge.apply(snapshot);
assert.equal(game.player._networkAmmoSelectionPending, false,
  'a playing input receipt settles the requested ammunition slot');
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
function rosterSchedulingFixture({ rosterScheduling, onCreate = () => {}, onWarm = async () => {} } = {}) {
  const stagedVisuals = [];
  const warmed = [];
  const attached = [];
  const registered = [];
  const stagedGame = { tanks: [], tankById: new Map(), player: null, shells: [],
    spotting: null, timeS: 0, preBattleS: 0, result: null, resultReason: null };
  const stagedBridge = createBrowserBattleBridge({
    engineCtx: { scene: { add(root) { attached.push(root); } }, anisotropy: 2 },
    game: stagedGame,
    bus: { emit() {} },
    viewerId: 'roster-0',
    rosterScheduling,
    createTankVisual(specId, _ctx, options) {
      assert.equal(options.eraVisualBindingReceipt, false,
        'every staged participant omits only the fitted-surface audit');
      const visual = { root: { position: new Vector3() }, visible: true, disposals: 0,
        setVisible(value) { this.visible = value; },
        dispose() { this.disposals++; } };
      stagedVisuals.push({ specId, options, visual });
      onCreate();
      return visual;
    },
    async prepareVisualTextures(...args) {
      warmed.push(args);
      await onWarm(...args);
    },
    onVisualReady(actor) { registered.push(actor); },
  });
  return { bridge: stagedBridge, game: stagedGame, visuals: stagedVisuals, warmed, attached, registered };
}

const fullCachedRoster = Object.freeze(Array.from({ length: 14 }, (_, index) => Object.freeze({
  id: `roster-${index}`, name: `Commander ${index}`, specId: 'm1a2',
  camo: index % 2 ? 'summer' : 'winter', team: index < 7 ? 'alpha' : 'bravo',
})));

{
  let ambientFrames = 0;
  const waits = [];
  const priorFrame = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const fixture = rosterSchedulingFixture({ rosterScheduling: {
    now: () => 0,
    yieldTask: async () => { waits.push('task'); },
    yieldFrame: async () => { waits.push('frame'); },
  }, onWarm: async (_spec, _anisotropy, _quality, tick) => { await tick(); await tick(); } });
  const progress = [];
  try {
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true, writable: true,
      value(callback) { ambientFrames++; queueMicrotask(callback); return ambientFrames; },
    });
    await fixture.bridge.prepareRoster([...fullCachedRoster,
      Object.freeze({ id: 'watcher', specId: 'not-a-vehicle', team: 'spectator' }),
    ], (fraction, specId) => progress.push([fraction, specId]));
    assert.equal(ambientFrames, 0,
      'a cached 14-entity roster does not force one ambient animation frame per entity');
    assert.deepEqual(waits, ['task'],
      'new cached actors leave the preceding world task once, not once per checkpoint');
    assert.equal(fixture.visuals.length, 14);
    assert.equal(fixture.bridge.entities.size, 14,
      'duplicate vehicle picks retain fourteen distinct network identities');
    assert.deepEqual(fixture.visuals.map(({ options }) => [options.camoPattern, options.quality]),
      fullCachedRoster.map((player, index) => [player.camo, index === 0 ? 'high' : 'ai']),
      'cached staging preserves the immutable camouflage and local/replica quality tuple');
    assert.deepEqual(fixture.warmed.map(([spec, anisotropy, quality, _tick, camo]) =>
      [spec.id, anisotropy, quality, camo]), [
      ['m1a2', 2, 'high', 'winter'], ['m1a2', 2, 'ai', 'summer'], ['m1a2', 2, 'ai', 'winter'],
    ], 'only exact spec/camouflage/quality tuples share texture preparation');
    assert.equal(new Set(fixture.visuals.map(({ options }) => options.camoSeed)).size, 14,
      'shared spec picks retain identity-derived camouflage seeds');
    assert.deepEqual(fixture.registered.map((actor) => actor.id), fullCachedRoster.map((player) => player.id));
    assert.ok(fixture.registered.every((actor) => actor.networkVisible === false
      && actor._networkPoseReady === false && !actor.visual.visible
      && actor.state.pos.equals(new Vector3())), 'staged entities have no authority pose or visible enemy data');
    assert.deepEqual(fixture.attached, fixture.visuals.map(({ visual }) => visual.root));
    assert.deepEqual(progress, fullCachedRoster.map((_player, index) => [(index + 1) / 14, 'm1a2']));
    assert.deepEqual(fixture.game.tanks, [], 'preparation does not publish the private bridge roster');
    assert.equal(fixture.game.tankById.size, 0);
    assert.equal(fixture.game.player, null);
  } finally {
    if (priorFrame) Object.defineProperty(globalThis, 'requestAnimationFrame', priorFrame);
    else delete globalThis.requestAnimationFrame;
    fixture.bridge.dispose();
  }
}

{
  let clock = 0;
  const waits = [];
  const fixture = rosterSchedulingFixture({
    rosterScheduling: {
      now: () => clock,
      yieldTask: async () => { waits.push(['task', clock, fixture.visuals.length]); },
      yieldFrame: async () => { waits.push(['frame', clock, fixture.visuals.length]); },
    },
    onCreate: () => { clock += 4; },
  });
  try {
    await fixture.bridge.prepareRoster(fullCachedRoster);
    assert.deepEqual(waits, [
      ['task', 0, 0],
      ['task', 8, 2], ['task', 16, 4], ['task', 24, 6], ['task', 32, 8],
      ['task', 40, 10], ['task', 48, 12], ['frame', 52, 13],
    ], '8ms exhausted slices yield tasks and the first checkpoint past 50ms permits a progress frame');
    assert.ok(fixture.visuals.every(({ visual }) => !visual.visible));
    const firstActors = [...fixture.bridge.entities.values()];
    clock = 500;
    await fixture.bridge.prepareRoster(fullCachedRoster);
    assert.equal(waits.length, 8, 'already staged actors add no initial task or loading budget wait');
    assert.equal(fixture.visuals.length, 14, 'already staged IDs do not construct duplicate replicas');
    assert.deepEqual([...fixture.bridge.entities.values()], firstActors);
    assert.equal(fixture.registered.length, 14, 'cached IDs do not repeat the visual lifecycle publication');
    await fixture.bridge.prepareRoster([]);
    assert.equal(waits.length, 8, 'empty roster preparation adds no scheduler work');
  } finally {
    fixture.bridge.dispose();
  }
}

{
  let clock = 0;
  const waits = [];
  const fixture = rosterSchedulingFixture({
    rosterScheduling: {
      now: () => clock,
      yieldTask: async () => { waits.push(['task', clock]); },
      yieldFrame: async () => { waits.push(['frame', clock]); },
    },
    async onWarm(_spec, _anisotropy, _quality, tick) {
      for (let step = 0; step < 3; step++) { clock += 4; await tick(); }
    },
    onCreate: () => { clock += 4; },
  });
  try {
    await fixture.bridge.prepareRoster(fullCachedRoster.slice(0, 1));
    assert.deepEqual(waits, [['task', 0], ['task', 8], ['task', 16]],
      'texture painter checkpoints and actor construction consume the same per-call budget');
    assert.equal(fixture.visuals[0].visual.visible, false);
  } finally {
    fixture.bridge.dispose();
  }
}

{
  let clock = 0;
  let completions = 0;
  const frames = [];
  const timers = [];
  const tasks = [];
  const cancelledFrames = [];
  const clearedTimers = [];
  const keys = ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'scheduler'];
  const prior = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const fixture = rosterSchedulingFixture({
    rosterScheduling: { now: () => clock, yieldTask: async () => {} },
    onCreate: () => { clock += 50; },
  });
  let pending;
  try {
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true, writable: true,
      value(callback) { frames.push(callback); return frames.length; },
    });
    Object.defineProperty(globalThis, 'setTimeout', {
      configurable: true, writable: true,
      value(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true, writable: true, value(id) { cancelledFrames.push(id); },
    });
    Object.defineProperty(globalThis, 'clearTimeout', {
      configurable: true, writable: true, value(id) { clearedTimers.push(id); },
    });
    Object.defineProperty(globalThis, 'scheduler', {
      configurable: true, writable: true,
      value: { yield: () => new Promise(resolve => tasks.push(resolve)) },
    });
    pending = fixture.bridge.prepareRoster(fullCachedRoster.slice(0, 1)).then(() => { completions++; });
    for (let turn = 0; turn < 32 && frames.length === 0; turn++) await Promise.resolve();
    assert.equal(frames.length, 1, 'an exhausted paint interval requests one animation callback');
    assert.deepEqual(timers.map(({ delay }) => delay), [34],
      'roster preparation uses the bounded fallback when animation callbacks never fire');
    assert.equal(completions, 0);
    timers[0].callback();
    for (let turn = 0; turn < 32 && tasks.length === 0; turn++) await Promise.resolve();
    assert.equal(tasks.length, 1, 'the default paint fallback still leaves its resolving microtask');
    assert.equal(completions, 0, 'roster preparation waits for the following task, not just the timer');
    assert.deepEqual(clearedTimers, [1]);
    assert.deepEqual(cancelledFrames, [1], 'the fallback releases its outstanding frame owner');
    tasks[0]();
    await pending;
    assert.equal(completions, 1, 'the fallback completes hidden-document roster preparation');
    frames[0]();
    timers[0].callback();
    await Promise.resolve();
    assert.equal(completions, 1, 'late callbacks cannot duplicate completion or construction');
    assert.equal(fixture.visuals.length, 1);
    assert.equal(fixture.visuals[0].visual.visible, false);
    assert.equal(timers.length, 1);
  } finally {
    // Drain the frame/fallback and its following task even when an assertion
    // fails. Restore the host before awaiting any later real fallback.
    for (const callback of frames) callback();
    for (const timer of timers) timer.callback();
    await Promise.resolve();
    for (const task of tasks) task();
    for (const key of keys) {
      const descriptor = prior.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    try { await pending; } finally { fixture.bridge.dispose(); }
  }
}

{
  let release;
  const boundary = new Promise(resolve => { release = resolve; });
  const fixture = rosterSchedulingFixture({ rosterScheduling: {
    now: () => 0, yieldTask: () => boundary,
    yieldFrame: async () => { assert.fail('the initial task does not require an animation frame'); },
  } });
  const progress = [];
  const pending = fixture.bridge.prepareRoster(fullCachedRoster.slice(0, 1), value => progress.push(value));
  try {
    await Promise.resolve();
    assert.equal(fixture.visuals.length, 0, 'no tank construction in the world activation task');
    assert.equal(fixture.warmed.length, 0, 'cached texture/import microtasks cannot bypass the boundary');
    assert.deepEqual(progress, [], 'no false construction progress before yielding');
    release();
    await pending;
    assert.equal(fixture.visuals.length, 1);
    assert.deepEqual(progress, [1]);
    assert.equal(fixture.game.player, null, 'staging still cannot publish the bridge');
  } finally { release(); try { await pending; } finally { fixture.bridge.dispose(); } }
}

{
  let release;
  const boundary = new Promise(resolve => { release = resolve; });
  const fixture = rosterSchedulingFixture({ rosterScheduling: {
    now: () => 0, yieldTask: () => boundary,
  } });
  const pending = fixture.bridge.prepareRoster(fullCachedRoster.slice(0, 1));
  const rejected = assert.rejects(pending, /disposed battle bridge/);
  fixture.bridge.dispose();
  release();
  await rejected;
  assert.equal(fixture.visuals.length, 0, 'disposing during the owned task cannot resurrect tank visuals');
  assert.equal(fixture.warmed.length, 0);
  await assert.rejects(fixture.bridge.prepareRoster([]), /disposed battle bridge/);
}

{
  let release, entered, painterFinished = false;
  const boundary = new Promise(resolve => { release = resolve; });
  const warming = new Promise(resolve => { entered = resolve; });
  const fixture = rosterSchedulingFixture({ rosterScheduling: {
    now: () => 0, yieldTask: async () => {},
  }, async onWarm(_spec, _anisotropy, _quality, tick) {
    entered(); await boundary; await tick();
    painterFinished = true;
  } });
  const pending = fixture.bridge.prepareRoster(fullCachedRoster.slice(0, 1));
  const rejected = assert.rejects(pending, /disposed battle bridge/);
  await warming;
  fixture.bridge.dispose(); release();
  await rejected;
  assert.equal(painterFinished, true, 'disposal cannot interrupt shared in-place texture promotion');
  assert.equal(fixture.visuals.length, 0,
    'the synchronous texture compatibility fallback cannot swallow disposal and build a stale tank');
}

{
  const failure = new Error('task scheduling failed');
  const fixture = rosterSchedulingFixture({ rosterScheduling: {
    now: () => 0, yieldTask: async () => { throw failure; },
  } });
  try {
    await assert.rejects(fixture.bridge.prepareRoster(fullCachedRoster.slice(0, 1)), error => error === failure);
    assert.equal(fixture.visuals.length, 0);
    assert.equal(fixture.warmed.length, 0);
  } finally { fixture.bridge.dispose(); }
}

{
  let clock = 0, tasks = 0, painterFinished = false;
  const failure = new Error('late texture scheduling failure');
  const fixture = rosterSchedulingFixture({ rosterScheduling: {
    now: () => clock,
    yieldTask: async () => { if (++tasks > 1) throw failure; },
  }, async onWarm(_spec, _anisotropy, _quality, tick) {
    clock = 10; await tick();
    clock = 20; await tick();
    painterFinished = true;
  } });
  try {
    await assert.rejects(fixture.bridge.prepareRoster(fullCachedRoster.slice(0, 1)), error => error === failure);
    assert.equal(painterFinished, true, 'shared texture promotion drains despite a rejected scheduling task');
    assert.equal(fixture.visuals.length, 0, 'the compatibility fallback cannot swallow a scheduling failure');
  } finally { fixture.bridge.dispose(); }
}

console.log('browserBattleBridge.selftest: hidden authority-pose reveal and roster scheduling passed');
