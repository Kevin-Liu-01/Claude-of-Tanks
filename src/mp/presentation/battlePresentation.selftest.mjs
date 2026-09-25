import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState } from '../../sim/movement.ts';
import { getSpec } from '../../vehicles/specs.ts';
import { ENTITY_FLAGS, NO_ENTITY, PHASE, TEAM, VERDICT, eraPlateNames, quantizePosition, zeroEntityRow } from '../wire/index.ts';
import { createEntitySample } from '../match/interpolation.ts';
import { RecordingPresentation, createBattlePresentation } from './index.ts';

// ------------------------------------------------------------ fixtures
const visuals = [];
const visualOptions = [];
const textureWarms = [];
const destructionOrder = [];
const busEvents = [];
let nowMs = 1000;
const scene = { add() {} };
const game = {
  tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [],
  timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter',
};
function fakeVisual(_specId, _engineCtx, opts) {
  assert.equal(opts.eraVisualBindingReceipt, false, 'actors keep live ERA state without rebuilding the authoring audit');
  visualOptions.push(opts);
  const visual = {
    root: { position: new Vector3(), userData: {} },
    visible: true, syncs: 0, revealedBeforePose: false, kicks: 0,
    setVisible(next) { if (next && this.syncs === 0) this.revealedBeforePose = true; this.visible = next; },
    syncFromState(state) { this.syncs++; this.root.position.copy(state.pos); },
    recoilKick() { this.kicks++; return 1; },
    gunMuzzleWorld(out, muzzleIndex) { return out.set(20 + muzzleIndex, 3, -8); },
    gunDirWorld(out) { return out.set(0, 0, 1); },
    strippedEra: [], eraResets: 0,
    stripEra(name) { this.strippedEra.push(name); },
    resetEra() { this.eraResets++; },
    setDestroyed(options) { destructionOrder.push([`wreck:${visuals.indexOf(this)}`, options.pop]); },
    resetDestroyed() { destructionOrder.push([`revive:${visuals.indexOf(this)}`, null]); },
    disposed: false,
    dispose() { this.disposed = true; },
  };
  visuals.push(visual);
  return visual;
}
const obstacles = [
  { min: [10, 0, 10], max: [12, 3, 12], crushed: false, crushable: false, shape2: null },
  { min: [-5, 0, 30], max: [-3, 1, 32], crushed: false, crushable: true, crushMin: 2.8, shape2: null },
];
const crushed = [];
const worldCollision = {
  heightField: { getHeightAt: () => 0, getHeightAtFast: () => 0, getGroundType: () => 'hard' },
  getObstacles: () => obstacles,
  crushObstacle(obstacle, dx, dz, speed) { crushed.push([obstacles.indexOf(obstacle), dx, dz, speed]); },
};
const presentation = createBattlePresentation({
  engineCtx: { scene, anisotropy: 1 },
  game,
  bus: { emit(type, payload) { busEvents.push({ type, payload }); } },
  worldCollision,
  createTankVisual: fakeVisual,
  prepareVisualTextures: async (...args) => { textureWarms.push(args); },
  clearVehicleDecals: (visual) => { destructionOrder.push([`decals:${visuals.indexOf(visual)}`, null]); },
  camoFor: (entry) => (entry.team === TEAM.ALPHA ? 'summer' : 'winter'),
  clock: () => nowMs,
  verdictGraceMs: 500,
});

const roster = [
  { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a2' },
  { entityId: 2, seat: 1, team: TEAM.BRAVO, bot: false, connected: true, playerId: 'foe', name: 'Foe', specId: 'm1a2' },
  { entityId: 3, seat: 255, team: TEAM.ALPHA, bot: true, connected: true, playerId: 'bot-3', name: 'Bot 3', specId: 'm1a2' },
];
const context = { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' };
await presentation.applyRoster(roster, context);
assert.deepEqual(visualOptions.map((opts) => opts.camoPattern), ['summer', 'winter', 'summer'], 'paint comes from the camo policy');
assert.deepEqual(visualOptions.map((opts) => opts.quality), ['high', 'ai', 'ai'], 'the viewer paints in high quality, others in ai');
assert.deepEqual(textureWarms.map((args) => [args[4], args[2]]), [['summer', 'high'], ['winter', 'ai'], ['summer', 'ai']],
  'each vehicle/paint/quality variant is warmed once');
assert.ok(visuals.every((visual) => !visual.visible), 'prepared visuals stay hidden at the staging origin');
assert.equal(presentation.actors.size, 3);
assert.equal(presentation.ownActor.id, 'me');
assert.equal(presentation.ownActor.contactGeom, null, 'movement uses the spec-derived contact footprint');
assert.equal(game.player, null, 'the game state is untouched until the first frame');
await presentation.applyRoster(roster, context);
assert.equal(visuals.length, 3, 'applyRoster is idempotent');

// ------------------------------------------------------------ frames
const spec = getSpec('m1a2');
const ownState = createTankState(spec, new Vector3(142, 1.2, -73), 0.4);
function sample(entityId, x, z, extra = {}) {
  const out = createEntitySample(entityId);
  Object.assign(out, { x, y: 1.2, z, yaw: 0.4, pitch: 0.03, roll: -0.02, turretYaw: 0.2, gunPitch: -0.04, hp: 1500, maxHp: 2000,
    reloadS: 1.5, reloadTotalS: 6, reloadKind: 'shell', gunReloadS: 1.5, gunReloadTotalS: 6, gunReloadKind: 'shell',
    ammo0: 20, ammo1: 4, ammo2: 2, flags: 0, snapped: false, eraSpent: [] }, extra);
  return out;
}
function ownRow(overrides = {}) {
  return { ...zeroEntityRow(1), x: quantizePosition(142), y: 1200, z: quantizePosition(-73), hp: 1800, maxHp: 2000, reload: 0, reloadTotal: 3000,
    magazineRounds: 0, magazineCapacity: 0, ammo0: 12, ammo1: 6, ammo2: 0, flags: 0, ...overrides };
}
const viewerState = { entityId: 1, modules: [0, 0, 2, 0, 1, 0, 0], crewBits: 2, equipment: [1100, 1150, 900, 900], modeSpeedMultiplier: 1850, modeGravityScale: 1000, movementVersion: 0, movementFlags: 0, movementValues: [] };
function frame(overrides = {}) {
  return {
    tick: 120, renderTimeMs: 2000, entities: [sample(2, -91, 64), sample(3, 10, 10)], shells: [],
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 12_500, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    modeStateJson: null, destroyed: [], destructibleRevision: 0,
    viewer: { entityId: 1, playerId: 'me', state: ownState, row: ownRow(), viewer: viewerState, authorityTick: 118, authorityReceivedAtMs: 990, predictedShot: null },
    events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
    ...overrides,
  };
}
presentation.applyFrame(frame());
assert.equal(game.player, presentation.ownActor, 'the first frame mounts the presentation');
assert.equal(game.player.state, ownState, 'the viewer renders the client\'s predicted state object');
assert.equal(game.tankById, presentation.actors);
assert.deepEqual(game.tanks.map((actor) => actor.id), ['me', 'foe', 'bot-3']);
assert.deepEqual(game.tanks.map((actor) => actor.team), ['player', 'enemy', 'player'], 'teams classify against the viewer');
assert.equal(visuals.some((visual) => visual.revealedBeforePose), false, 'nobody is visible before a pose');
assert.deepEqual(visuals.map((visual) => visual.syncs), [1, 1, 1], 'one hidden initialization sync each; the render loop owns the rest');
assert.deepEqual(visuals.map((visual) => [visual.root.position.x, visual.root.position.z]), [[142, -73], [-91, 64], [10, 10]]);
assert.equal(game.spotting.isSpotted('foe'), true);
assert.equal(game.timeS, 12.5);
assert.equal(game.preBattleS, 0);
assert.equal(game.gameMode, 'standard');
const foe = presentation.actors.get('foe');
assert.equal(foe.combat.hp, 1500);
assert.equal(foe.combat.reload.t, 1.5);
assert.equal(foe.combat.reload.totalS, 6);
assert.equal(foe.combat.reload.kind, 'shell');
assert.deepEqual(foe.combat.ammo.slice(0, 3), [20, 4, 2]);
assert.equal(foe.state.speed, 0);
assert.ok(Math.abs(foe.state.yaw - 0.4) < 1e-9);
const me = presentation.ownActor;
assert.equal(me.combat.hp, 1800, 'own combat comes from the newest authority row');
assert.deepEqual(me.combat.ammo.slice(0, 3), [12, 6, 0]);
assert.equal(me.combat.modules.trackL.state, 'red', 'the viewer section carries module damage');
assert.equal(me.combat.modules.turretRing.state, 'yellow');
assert.equal(me.combat.crew.driver, false);
assert.equal(me.combat.crew.gunner, true);
assert.ok(Math.abs(me.combat.equipMults.turret - 1.15) < 1e-9);
assert.ok(Math.abs(me.modeSpeedMultiplier - 1.85) < 1e-9);
assert.equal(presentation.actors.get('bot-3').combat.modules.trackL.state, 'ok', 'private mobility details never modify remote actors');

// Track scroll follows observed motion; a hidden enemy leaves the visible roster and the spotting facade.
presentation.applyFrame(frame({ tick: 122, entities: [sample(3, 10.5, 10)] }));
assert.equal(game.spotting.isSpotted('foe'), false);
assert.equal(visuals[1].visible, false, 'an entity absent from the frame is hidden');
assert.deepEqual(game.tanks.map((actor) => actor.id), ['me', 'bot-3']);
const bot = presentation.actors.get('bot-3');
assert.ok(Math.abs(bot.state.trackScroll.l - 0.5 * Math.sin(0.4)) < 1e-9, 'track scroll integrates the observed travel');
presentation.setVisibility(2, true);
assert.equal(visuals[1].visible, true);

// ERA cassettes travel as spec-order indices; the visual strips by name and resets on an empty set.
const eraNames = eraPlateNames(spec.armor);
assert.ok(eraNames.length > 0, 'm1a2 carries ERA in its authored armor');
presentation.applyFrame(frame({ tick: 124, entities: [sample(2, -91, 64, { eraSpent: [0] }), sample(3, 10.5, 10)] }));
assert.deepEqual(visuals[1].strippedEra, [eraNames[0]], 'snapshot state depletes ERA by index → plate name');
presentation.applyFrame(frame({ tick: 126, entities: [sample(2, -91, 64, { eraSpent: [] }), sample(3, 10.5, 10)] }));
assert.equal(visuals[1].eraResets, 1, 'an empty set restores the cassettes');

// Destruction: the cause arrives as an event before the row flips; scars detach before the wreck traversal.
presentation.applyEvent({ kind: 'tank_destroyed', payload: { id: 'foe', killerId: 'me', cause: 'ammo_rack' } }, { own: false, feedbackPredicted: false });
assert.equal(busEvents.at(-1).type, 'tank:destroyed');
assert.equal(busEvents.at(-1).payload.cause, 'ammorack');
assert.deepEqual(busEvents.at(-1).payload.pos, [-91, 1.2, 64]);
presentation.applyFrame(frame({ tick: 128, entities: [sample(2, -91, 64, { hp: 0, flags: ENTITY_FLAGS.DESTROYED }), sample(3, 10.5, 10)] }));
assert.deepEqual(destructionOrder, [['decals:1', null], ['wreck:1', true]], 'decals clear first, then the wreck pops its turret');
assert.equal(foe.combat.destroyed, true);
assert.deepEqual(game.tanks.map((actor) => actor.id), ['me', 'foe', 'bot-3'], 'wrecks stay in the roster');
presentation.applyFrame(frame({ tick: 130, entities: [sample(2, -91, 64), sample(3, 10.5, 10)] }));
assert.deepEqual(destructionOrder.at(-1), ['revive:1', null], 'a live row after a wreck restores the visual');

// Events: remote shots kick the visual and read the muzzle tip; own confirmed shots after a predicted flash do not kick twice.
presentation.applyEvent({ kind: 'shell_fired', payload: { shellId: 77, shooterId: 'foe', shellType: 'APFSDS', shellName: 'M829A3', caliberMm: 120, velocityMps: 1650, x: 142, y: 2, z: -73, dx: 0, dy: 0, dz: 1 } }, { own: false, feedbackPredicted: false });
let fired = busEvents.at(-1);
assert.equal(fired.type, 'shell:fired');
assert.equal(fired.payload.muzzleIndex, 1, 'audio receives the same muzzle index as recoil and flash');
assert.deepEqual(fired.payload.muzzlePos, [21, 3, -8]);
assert.equal(fired.payload.isPlayer, false);
assert.equal(visuals[1].kicks, 1);
presentation.applyFrame(frame({ tick: 132, viewer: { ...frame().viewer, predictedShot: { fireSeq: 5, shellSlot: 0, confirmed: false } } }));
const predicted = busEvents.at(-1);
assert.equal(predicted.type, 'weapon:predicted', 'a fire edge flashes before the authority confirms it');
assert.equal(predicted.payload.fireIntentSeq, 5);
assert.equal(visuals[0].kicks, 1);
presentation.applyFrame(frame({ tick: 134, viewer: { ...frame().viewer, predictedShot: { fireSeq: 5, shellSlot: 0, confirmed: false } } }));
assert.equal(busEvents.at(-1).type, 'weapon:predicted', 'the same edge is not flashed twice');
assert.equal(busEvents.filter((event) => event.type === 'weapon:predicted').length, 1);
presentation.applyEvent({ kind: 'shell_fired', payload: { shellId: 78, shooterId: 'me', fireIntentSeq: 5, shellSlot: 0, shellType: 'APFSDS', shellName: 'M829A3', muzzleIndex: -1, caliberMm: 120, velocityMps: 1650, x: 142, y: 2, z: -73, dx: 0, dy: 0, dz: 1 } }, { own: true, feedbackPredicted: true });
fired = busEvents.at(-1);
assert.equal(fired.type, 'shell:fired');
assert.equal(fired.payload.feedbackPredicted, true);
assert.equal(fired.payload.isPlayer, true);
assert.equal(visuals[0].kicks, 1, 'a predicted shot does not recoil again on confirmation');

// Local-player events map to the HUD vocabulary and ignore other ids.
presentation.applyEvent({ kind: 'magazine_reload_denied', payload: { id: 'me', reason: 'MAGAZINE_RELOADING' } }, { own: false, feedbackPredicted: false });
assert.equal(busEvents.at(-1).type, 'ui:magazineReloadDenied');
assert.equal(busEvents.at(-1).payload.reason, 'MAGAZINE_RELOADING');
presentation.applyEvent({ kind: 'ammo_selection_denied', payload: { id: 'me', slot: 1, reason: 'AMMO_EMPTY', guided: true } }, { own: false, feedbackPredicted: false });
assert.deepEqual(busEvents.at(-1).payload, { type: 'ammo_selection_denied', id: 'me', slot: 1, reason: 'AMMO_EMPTY', guided: true });
const before = busEvents.length;
presentation.applyEvent({ kind: 'consumable_used', payload: { id: 'foe', slot: 0, cooldownS: 30, readyAt: 1 } }, { own: false, feedbackPredicted: false });
assert.equal(busEvents.length, before, 'another player\'s consumable is not our HUD feedback');
presentation.applyEvent({ kind: 'shell_impact', payload: { shellId: 78, shooterId: 'foe', kind: 'prop', surfaceKind: 'building', x: 3, y: 2, z: 9, nx: 0, ny: 0.2, nz: -0.98, shellType: 'APFSDS', caliberMm: 120 } }, { own: false, feedbackPredicted: false });
const expired = busEvents.at(-1);
assert.equal(expired.type, 'shell:expired');
assert.equal(expired.payload.hitKind, 'prop');
assert.deepEqual(expired.payload.normal, [0, 0.2, -0.98]);
presentation.applyEvent({ kind: 'module_state', payload: { id: 'foe', module: 'gun', state: 'red', source: 'hit' } }, { own: false, feedbackPredicted: false });
assert.equal(busEvents.at(-1).type, 'module:state');
presentation.applyEvent({ kind: 'world_prop_destroyed', payload: { obstacleIndex: 1, kind: 'fence', cause: 'ram', directionX: 1, directionZ: 0, speedMps: 8 } }, { own: false, feedbackPredicted: false });
assert.deepEqual(crushed, [[1, 1, 0, 8]], 'a destroyed prop crushes the world obstacle');
assert.equal(busEvents.at(-1).type, 'prop:crushed');
assert.deepEqual(busEvents.at(-1).payload.pos, [-4, 0, 31]);

// Shells and persistent destroyed props ride the frame.
presentation.applyFrame(frame({ tick: 136, shells: [{ id: 9, shooterEntityId: 2, x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 900, shellType: 'APFSDS', guided: false }], destroyed: [0, 1], destructibleRevision: 3 }));
assert.equal(game.shells.length, 1);
assert.equal(game.shells[0].shooterId, 'foe');
assert.equal(game.shells[0].spec.tracer, 'APFSDS');
assert.equal(obstacles[0].crushed, true, 'persistent destroyed indices crush obstacles the events never reached');
assert.equal(crushed.length, 2, 'an already-crushed obstacle is not crushed again');
presentation.applyFrame(frame({ tick: 138, shells: [], destroyed: [0, 1], destructibleRevision: 3 }));
assert.equal(game.shells.length, 0, 'a vanished shell is retired');

// The verdict: from meta after the grace when no event arrived, or at once from the event.
presentation.applyFrame(frame({ tick: 140, meta: { ...frame().meta, verdict: VERDICT.ALPHA, verdictReason: 'elimination' } }));
assert.equal(game.result, null, 'a fresh verdict waits for its event');
nowMs += 600;
presentation.applyFrame(frame({ tick: 142, meta: { ...frame().meta, verdict: VERDICT.ALPHA, verdictReason: 'elimination' } }));
assert.equal(game.result, 'victory', 'after the grace the persistent verdict presents');
assert.equal(game.resultReason, 'elimination');
const ended = busEvents.at(-1);
assert.equal(ended.type, 'battle:ended');
assert.equal(ended.payload.network, true);
assert.deepEqual(ended.payload.roster.map((entry) => [entry.id, entry.team, entry.isPlayer]), [['me', 'ally', true], ['foe', 'enemy', false], ['bot-3', 'ally', false]]);
presentation.applyEvent({ kind: 'match_ended', payload: { result: 'bravo', reason: 'time' } }, { own: false, feedbackPredicted: false });
assert.equal(game.result, 'victory', 'a second verdict never overrides the first');

presentation.dispose();
assert.ok(visuals.every((visual) => visual.disposed));
assert.equal(game.player, null, 'dispose restores the game state');
assert.deepEqual(game.tanks, []);

// ------------------------------------------------------------ the event path, a disconnect and a spectator
{
  const events = [];
  const state = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'oasis' };
  const p = createBattlePresentation({
    engineCtx: { scene, anisotropy: 1 }, game: state, bus: { emit(type, payload) { events.push({ type, payload }); } },
    createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, clock: () => nowMs,
  });
  await p.applyRoster(roster, context);
  p.applyFrame(frame());
  p.applyEvent({ kind: 'match_ended', payload: { result: 'bravo', reason: 'time_limit' } }, { own: false, feedbackPredicted: false });
  assert.equal(state.result, 'defeat', 'the event path resolves at once against the viewer\'s team');
  assert.equal(state.resultReason, 'time_limit');
  p.dispose();

  const dropped = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, timeS: 0, preBattleS: 0, result: null, resultReason: null };
  const droppedEvents = [];
  const q = createBattlePresentation({
    engineCtx: { scene, anisotropy: 1 }, game: dropped, bus: { emit(type, payload) { droppedEvents.push({ type, payload }); } },
    createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, clock: () => nowMs,
  });
  await q.applyRoster(roster, context);
  q.applyFrame(frame());
  q.applyFrame(frame({ phase: 'failed' }));
  assert.equal(dropped.result, 'draw');
  assert.equal(dropped.resultReason, 'network_disconnect');
  assert.equal(q.endDisconnected(), false, 'disconnect resolution is idempotent');
  q.dispose();

  const watching = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, timeS: 0, preBattleS: 0, result: null, resultReason: null };
  const s = createBattlePresentation({
    engineCtx: { scene, anisotropy: 1 }, game: watching, bus: { emit() {} }, spectator: true,
    createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, clock: () => nowMs,
  });
  await s.applyRoster(roster, { ...context, ownEntityId: NO_ENTITY, ownPlayerId: '' });
  s.applyFrame(frame({ entities: [sample(1, 142, -73), sample(2, -91, 64), sample(3, 10, 10)], viewer: { ...frame().viewer, entityId: NO_ENTITY, playerId: '', state: null, row: null, viewer: null } }));
  assert.equal(watching.player, null, 'a spectator owns no tank');
  assert.equal(watching.tanks.length, 3);
  assert.equal(s.predictionWorld(), null, 'no prediction world without a viewer');
  assert.equal(s.setPerspective(2), true);
  assert.deepEqual(watching.tanks.map((actor) => actor.team), ['enemy', 'player', 'enemy'], 'the perspective team reads as allies');
  s.dispose();
}

// ------------------------------------------------------------ the prediction world mirrors the authority's contacts
{
  const state = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, timeS: 0, preBattleS: 0, result: null, resultReason: null };
  const obstacleWall = [{ min: [0, 0, 30], max: [40, 3, 32], crushed: false, crushable: false, shape2: null }];
  const p = createBattlePresentation({
    engineCtx: { scene, anisotropy: 1 }, game: state, bus: { emit() {} },
    worldCollision: { heightField: worldCollision.heightField, getObstacles: () => obstacleWall, crushObstacle() {} },
    createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, clock: () => nowMs,
  });
  await p.applyRoster(roster, context);
  p.applyFrame(frame({ entities: [sample(2, 20, 12), sample(3, -50, -50)] }));
  const world = p.predictionWorld();
  assert.ok(world && world.heightField === worldCollision.heightField);
  assert.equal(p.predictionWorld(), world, 'the world is built once per viewer spec');
  const push = new Vector3();
  assert.equal(world.collide(new Vector3(20, 0, -20), 4, push), false, 'open ground pushes nothing');
  assert.equal(world.collide(new Vector3(20, 0, 28), 4, push), true, 'the wall pushes the hull back');
  assert.ok(push.z < 0);
  assert.equal(world.collide(new Vector3(20, 0, 14), 4, push), true, 'a disclosed hull pushes');
  assert.ok(Math.hypot(push.x, push.z) > 0);
  p.applyFrame(frame({ entities: [sample(3, -50, -50)] }));
  assert.equal(world.collide(new Vector3(20, 0, 14), 4, push), false, 'a hidden hull never pushes (its coordinates are stale)');
  p.dispose();
}

// ------------------------------------------------------------ the recording adapter (headless soaks)
{
  const recorder = new RecordingPresentation(4);
  recorder.applyRoster(roster, context);
  for (let n = 0; n < 6; n++) recorder.applyFrame(frame({ tick: 200 + n, entities: [sample(3, n, n)] }));
  assert.equal(recorder.frames.length, 4, 'the log is bounded');
  assert.deepEqual([...recorder.hidden], [2], 'an entity absent from the frame is hidden; the viewer never is');
  recorder.applyEvent({ kind: 'match_ended', payload: { result: 'draw', reason: 'time' } }, { own: false, feedbackPredicted: false });
  assert.deepEqual(recorder.verdict, { verdict: VERDICT.DRAW, reason: 'time' });
  recorder.dispose();
  assert.equal(recorder.disposed, true);
}

console.log('mp battle presentation: roster → hidden visuals, frames → game state/visuals/combat/ERA/wrecks/shells/props, events → bus vocabulary, predicted own shots, verdicts, disconnect, spectator perspective, prediction world pass');
