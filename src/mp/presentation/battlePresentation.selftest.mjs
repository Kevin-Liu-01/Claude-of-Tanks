import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState } from '../../sim/movement.ts';
import { getSpec } from '../../vehicles/specs.ts';
import { ENTITY_FLAGS, NO_ENTITY, PHASE, TEAM, VERDICT, eraPlateNames, quantizePosition, quantizeReloadS, zeroEntityRow } from '../wire/index.ts';
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
const viewerState = { entityId: 1, modules: [0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], crewBits: 2, equipment: [1100, 1150, 900, 900], modeSpeedMultiplier: 1850, modeGravityScale: 1000, movementVersion: 0, movementFlags: 0, movementValues: [] };
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
const completeRoster = game.rosterTanks;
assert.deepEqual(completeRoster.map(actor => actor.id), ['me', 'foe', 'bot-3']);
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
assert.equal(game.rosterTanks, completeRoster, 'unspotting retains the announced roster object');
assert.deepEqual(game.rosterTanks.map(actor => actor.id), ['me', 'foe', 'bot-3'], 'an unseen opponent stays listed');
assert.equal(game.rosterTanks[1], foe, 'identity and last observed state are retained without revealing the actor');
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

// Spotting, rolling back onto the tracks and our reload reach the bus in solo play's shapes (2026-10-04): the crew's
// spot calls, the sixth sense, the self-right and the loading machinery work in a network battle too.
{
  const since = busEvents.length;
  presentation.applyEvent({ kind: 'tank_spotted', payload: { id: 'foe', team: 'alpha', timeS: 12.4, spotterId: 'me' } }, { own: false, feedbackPredicted: false });
  presentation.applyEvent({ kind: 'tank_spotted', payload: { id: 'me', team: 'bravo', timeS: 12.5, spotterId: 'foe' } }, { own: false, feedbackPredicted: false });
  presentation.applyEvent({ kind: 'tank_spotted', payload: { id: 'bot-3', team: 'bravo', timeS: 12.5, spotterId: 'foe' } }, { own: false, feedbackPredicted: false });
  presentation.applyEvent({ kind: 'tank_autoflip', payload: { id: 'bot-3' } }, { own: false, feedbackPredicted: false });
  const out = busEvents.slice(since).map(({ type, payload }) => [type, payload]);
  assert.deepEqual(out, [
    ['tank:spotted', { id: 'foe', team: 'player', timeS: 12.4, spotterId: 'me' }],
    ['tank:spotted', { id: 'me', team: 'enemy', timeS: 12.5, spotterId: 'foe' }],
    ['player:spotted', { timeS: game.timeS }],
    ['tank:spotted', { id: 'bot-3', team: 'enemy', timeS: 12.5, spotterId: 'foe' }],
    ['tank:autoflip', { id: 'bot-3', specId: 'm1a2' }],
  ], 'spots read as the viewer\'s side, our own exposure lights the sixth sense once, and an autoflip passes through');
  // (the event object is reused per step, as in solo play: read it when it is emitted)
  const steps = [];
  const row = (reloadS) => ownRow({ reload: quantizeReloadS(reloadS), reloadTotal: quantizeReloadS(6), reloadKind: 1 });
  const step = (tick, viewerRow) => {
    const mark = busEvents.length;
    presentation.applyFrame(frame({ tick, viewer: { ...frame().viewer, row: viewerRow } }));
    for (const event of busEvents.slice(mark)) if (event.type === 'player:reload') steps.push({ ...event.payload });
  };
  step(135, row(4));
  step(135, row(4));
  step(136, row(1.5));
  step(137, ownRow({ reload: 0, reloadTotal: 0, reloadKind: 0 }));
  step(138, ownRow({ reload: 0, reloadTotal: 0, reloadKind: 0 }));
  assert.equal(steps.length, 3, `one event per new reload step, none for a repeated row or a gun at rest (${JSON.stringify(steps)})`);
  assert.deepEqual(steps.map((e) => [e.done, e.kind, e.total]), [[false, 'shell', 6], [false, 'shell', 6], [true, 'shell', 6]],
    'the finished step keeps the reload\'s own kind and length');
  assert.ok(Math.abs(steps[0].progress - 1 / 3) < 0.02 && Math.abs(steps[1].progress - 0.75) < 0.02 && steps[2].progress === 1, 'progress runs to 1');
  assert.ok(steps.every((e) => e.caliberMm === spec.gun.shells[0].caliberMm), 'with the loaded round\'s bore');
}
// a prop this viewer's world does not have (lane mp/ui-sync-check, 2026-09-30): nothing crushed, nothing emitted, no throw —
// a `pos: null` prop:crushed threw in the feedback runtime inside the frame pump on the mobile tier's lighter world
{
  const before = busEvents.length;
  presentation.applyEvent({ kind: 'world_prop_destroyed', payload: { obstacleIndex: 99, kind: 'fence', cause: 'ram', directionX: 1, directionZ: 0, speedMps: 8 } }, { own: false, feedbackPredicted: false });
  assert.equal(busEvents.length, before, 'an unknown obstacle index emits nothing');
  assert.equal(crushed.length, 0, 'and crushes nothing');
}
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
assert.equal(game.rosterTanks, undefined, 'dispose restores the solo roster fallback');

// Announced opponents are listed even before their first spotted snapshot.
{
  const state = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null };
  const p = createBattlePresentation({
    engineCtx: { scene, anisotropy: 1 }, game: state, bus: { emit() {} },
    createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, clock: () => nowMs,
  });
  await p.applyRoster(roster, context);
  p.applyFrame(frame({ entities: [sample(3, 10, 10)] }));
  assert.deepEqual(state.rosterTanks.map(actor => [actor.displayName, actor.team]),
    [['Me', 'player'], ['Foe', 'enemy'], ['Bot 3', 'player']]);
  assert.deepEqual(state.tanks.map(actor => actor.id), ['me', 'bot-3']);
  assert.equal(state.spotting.isSpotted('foe'), false);
  assert.equal(p.actors.get('foe').visual.visible, false);
  p.dispose();
}

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
  // The prediction world rides the authority's structure support field over the shared terrain (physics lane,
  // 2026-10-03; it used to hand movement the bare height field, so a predicted hull fell through a roof the authority
  // stood it on): the terrain is the same function, the wall's top a floor only for a hull above it.
  assert.ok(world && typeof world.heightField.beginHull === 'function' && typeof world.beginStep === 'function');
  for (const [x, z] of [[20, -20], [-60, 40], [5, 5]]) {
    assert.equal(world.heightField.getHeightAt(x, z), worldCollision.heightField.getHeightAt(x, z), 'the same terrain away from parts');
  }
  assert.equal(p.predictionWorld(), world, 'the world is built once per viewer spec');
  const push = new Vector3();
  assert.equal(world.collide(new Vector3(20, 0, -20), 4, push), false, 'open ground pushes nothing');
  assert.equal(world.collide(new Vector3(20, 0, 28), 4, push), true, 'the wall pushes the hull back');
  assert.ok(push.z < 0);
  assert.equal(world.collide(new Vector3(20, 0, 14), 4, push), true, 'a disclosed hull pushes');
  assert.ok(Math.hypot(push.x, push.z) > 0);
  // A rewind to an authority pose inside the presented hull (one interpolation delay old; the authority resolved that
  // contact) seats the hull against the pose: the pose is clear, the hull stays solid one step further in, and a rewind
  // that is clear presents it where it is again. A penetration within the wire's quantization is left as presented.
  const depth = Math.hypot(push.x, push.z);
  const nx = push.x / depth, nz = push.z / depth;
  world.anchor({ pos: new Vector3(20, 0, 14), yaw: ownState.yaw });
  assert.equal(world.collide(new Vector3(20, 0, 14), 4, push), false, 'the authority pose is clear of the seated hull');
  assert.equal(world.collide(new Vector3(20 - nx * 0.3, 0, 14 - nz * 0.3), 4, push), true, 'the seated hull is still solid');
  assert.ok(Math.abs(Math.hypot(push.x, push.z) - 0.3) < 0.01, `pushed back by the 0.3 m it was driven in (${Math.hypot(push.x, push.z)})`);
  world.anchor({ pos: new Vector3(20, 0, -20), yaw: ownState.yaw });
  assert.equal(world.collide(new Vector3(20, 0, 14), 4, push), true, 'a clear rewind presents the hull where it is');
  assert.ok(Math.abs(Math.hypot(push.x, push.z) - depth) < 1e-9);
  const graze = new Vector3(20 + nx * (depth - 0.02), 0, 14 + nz * (depth - 0.02));
  world.anchor({ pos: graze, yaw: ownState.yaw });
  assert.equal(world.collide(graze, 4, push), true, 'a 2 cm overlap at the rewind is contact, not a stale hull');
  assert.ok(Math.abs(Math.hypot(push.x, push.z) - 0.02) < 0.005);
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

// ------------------------------------------------------------ the authority's ruleset reaches the game state (lane mp/ui-sync-check, 2026-09-30)
{
  const { matchRulesetFor } = await import('../../sim/matchRuleset.ts');
  assert.equal(game.ruleset?.mode, 'standard', 'a placeholder rulesetJson leaves the mode\'s own table');
  const state = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' };
  const q = createBattlePresentation({ engineCtx: { scene, anisotropy: 1 }, game: state, bus: { emit() {} }, worldCollision, createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, clearVehicleDecals: () => {}, camoFor: () => 'summer', clock: () => nowMs });
  const arranged = matchRulesetFor('zone_control', null, { allies: null, enemies: null, waveSize: null, enemyNation: null, scoreTarget: 100 });
  await q.applyRoster(roster, { ...context, mode: 'zone_control', rulesetJson: JSON.stringify(arranged) });
  assert.equal(state.gameMode, 'zone_control');
  assert.equal(state.ruleset?.scoreTarget, 100, 'the WELCOME\'s ruleset (the room\'s arrangement) is what the HUD reads');
  assert.equal(state.ruleset?.respawnS, 6);
  await q.applyRoster(roster, { ...context, mode: 'zone_control', rulesetJson: JSON.stringify({ mode: 'standard', scoreTarget: 1 }) });
  assert.equal(state.ruleset?.mode, 'zone_control', 'a table naming another mode is refused: the mode\'s own');
  assert.equal(state.ruleset?.scoreTarget, undefined, 'the mode\'s own table names no target (the controller scores to 750)');
  await q.applyRoster(roster, { ...context, mode: 'zone_control', rulesetJson: 'not json' });
  assert.equal(state.ruleset?.scoreTarget, undefined, 'unparseable: the mode\'s own');
  q.dispose();
}

// ------------------------------------------------------------ destroyed props: settled state vs live events (world state audit, 2026-10-01)
// The persistent destroyed list reaches the presentation one interpolation delay ahead of the presented world. Before this
// lane it felled every listed prop on arrival — early, toward +Z, at speed 0 — and the `world_prop_destroyed` event found
// nothing left to fell; a late joiner watched every earlier fall replay; a host migration's re-sends crunched twice.
{
  const propObstacles = Array.from({ length: 6 }, (_, index) => ({ min: [index * 4, 0, 40], max: [index * 4 + 1, 2, 41], crushed: false, crushable: true, crushMin: 0, shape2: null }));
  const propCalls = [];
  const propFx = [];
  const propWorld = {
    heightField: worldCollision.heightField,
    getObstacles: () => propObstacles,
    crushObstacle(obstacle, dx, dz, speed, cause, options) { propCalls.push([propObstacles.indexOf(obstacle), dx, dz, speed, cause ?? null, options?.settled === true]); },
  };
  const propGame = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' };
  const props = createBattlePresentation({ engineCtx: { scene, anisotropy: 1 }, game: propGame, bus: { emit(type, payload) { propFx.push({ type, payload }); } }, worldCollision: propWorld, createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, clock: () => nowMs });
  await props.applyRoster(roster, context);
  const owed = new Set([2]);
  const crushFx = () => propFx.filter((event) => event.type === 'prop:crushed').length;
  const propFrame = (overrides) => frame({ destroyedPending: (index) => owed.has(index), ...overrides });
  // a late joiner's first frame: the list is settled state — final pose, no fall, no sound; the prop whose event is owed waits for it
  props.applyFrame(propFrame({ tick: 500, destroyed: [0, 2, 4], destructibleRevision: 3 }));
  assert.deepEqual(propCalls, [[0, 0, 1, 0, 'ram', true], [4, 0, 1, 0, 'ram', true]], 'what predates the view lands settled; the owed prop is left to its event');
  assert.equal(crushFx(), 0, 'settled state makes no sound');
  assert.equal(propObstacles[2].crushed, false);
  // the owed event arrives: a live fall with the authority\'s direction and speed, and the crunch
  props.applyEvent({ kind: 'world_prop_destroyed', payload: { obstacleIndex: 2, kind: 'tree', cause: 'ram', directionX: 0.6, directionZ: -0.8, speedMps: 7 } }, { own: false, feedbackPredicted: false });
  assert.deepEqual(propCalls.at(-1), [2, 0.6, -0.8, 7, 'ram', false], 'the event fells the prop live, in its direction, at its speed');
  assert.equal(crushFx(), 1);
  assert.deepEqual(propFx.at(-1).payload.dir, [0.6, 0, -0.8]);
  owed.delete(2);
  // the same list again, the owed prop released meanwhile: nothing more to lay down
  props.applyFrame(propFrame({ tick: 503, destroyed: [0, 2, 4], destructibleRevision: 3 }));
  assert.equal(propCalls.length, 3);
  // a duplicate send (a host migration re-destroying what already fell here): no second fall, no second crunch
  props.applyEvent({ kind: 'world_prop_destroyed', payload: { obstacleIndex: 2, kind: 'tree', cause: 'ram', directionX: 1, directionZ: 0, speedMps: 9 } }, { own: false, feedbackPredicted: false });
  assert.equal(propCalls.length, 3, 'a prop falls once');
  assert.equal(crushFx(), 1, 'and crunches once');
  // a shell-felled prop carries its cause
  props.applyEvent({ kind: 'world_prop_destroyed', payload: { obstacleIndex: 3, kind: 'fence', cause: 'shell', directionX: 0, directionZ: 1, speedMps: 900 } }, { own: false, feedbackPredicted: false });
  assert.deepEqual(propCalls.at(-1), [3, 0, 1, 900, 'shell', false]);
  // the new host\'s list reads lower for a moment (a revision regression across a migration) yet names a prop this view
  // has not laid down: the content decides, not the number
  props.applyFrame(propFrame({ tick: 600, destroyed: [0, 1], destructibleRevision: 2 }));
  assert.deepEqual(propCalls.at(-1), [1, 0, 1, 0, 'ram', true]);
  // a frame without the owed-prop predicate (a recorder, an older client) still settles its list
  props.applyFrame(frame({ tick: 700, destroyed: [0, 1, 5], destructibleRevision: 4 }));
  assert.deepEqual(propCalls.at(-1), [5, 0, 1, 0, 'ram', true]);
  assert.equal(crushFx(), 2, 'only the two live events sounded');
  props.dispose();
}

// ------------------------------------------------------------ the authority's detonations as munition:blast (destruction §11, 2026-10-07)
// A world impact raises one blast before the round expires (its structure mapped to this world's, open water by this
// world's mask); a round bursting on a hull raises one from its direct hit's event before the hit, none from splash; a
// cook-off and a fuel fire raise theirs before the death — the solo step's order.
{
  const { setCompoundShape, setObbShape } = await import('../../world/collision.ts');
  const blastBus = [];
  const houseObstacles = [setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0], kind: 'structure', structureIdx: 0 }, 40, 40, 6, 4, 0)];
  const houseColliders = [setCompoundShape({ min: [0, 0, 0], max: [0, 6, 0], kind: 'structure', structureIdx: 0 },
    [{ kind: 'obb', cx: 40, cz: 40, hw: 6, hl: 4, yaw: 0 }])];
  const blastWorld = {
    heightField: { getHeightAt: () => 0, getHeightAtFast: () => 0, getContactHeightAt: () => 0, getGroundType: () => 'hard',
      getWaterMaskAt: (x) => (x < -100 ? 1 : 0) },
    getObstacles: () => houseObstacles, getColliders: () => houseColliders, crushObstacle() {},
  };
  const blastGame = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0,
    result: null, resultReason: null, mapId: 'winter' };
  const p = createBattlePresentation({ engineCtx: { scene, anisotropy: 1 }, game: blastGame,
    bus: { emit(type, payload) { blastBus.push({ type, payload }); } }, worldCollision: blastWorld, createTankVisual: fakeVisual,
    prepareVisualTextures: async () => {}, clock: () => nowMs });
  const quiet = { own: false, feedbackPredicted: false };
  const types = () => blastBus.map((event) => event.type);
  p.applyEvent({ kind: 'shell_impact', payload: { munition: 'he', chargeKg: 3.5, structureId: 0, shellId: 900, shooterId: 'foe',
    kind: 'prop', surfaceKind: 'structure', x: 40, y: 2, z: 36, nx: 0, ny: 0, nz: -1, shellType: 'HE', caliberMm: 125 } }, quiet);
  assert.deepEqual(types(), ['munition:blast', 'shell:expired'], 'the blast before the round expires');
  assert.deepEqual(blastBus[0].payload, { munition: 'he', chargeKg: 3.5, x: 40, y: 2, z: 36, nx: 0, ny: 0, nz: -1,
    surface: 'structure', structureId: 0 }, 'the struck structure is this world\'s');
  blastBus.length = 0;
  p.applyEvent({ kind: 'shell_impact', payload: { munition: 'howitzer', chargeKg: 6.8, shellId: 901, kind: 'terrain', surfaceKind: 'terrain',
    x: -150, y: 0, z: 0, nx: 0, ny: 1, nz: 0, craterId: 3 } }, quiet);
  assert.equal(blastBus[0].payload.surface, 'water', 'open water by this world\'s mask');
  assert.equal(blastBus[0].payload.craterId, 3, 'the crater it dug rides the blast');
  assert.equal('structureId' in blastBus[0].payload, false);
  blastBus.length = 0;
  p.applyEvent({ kind: 'shell_impact', payload: { munition: 'kinetic', chargeKg: 0, shellId: 902, kind: 'terrain', x: 0, y: 0, z: 0 } }, quiet);
  assert.deepEqual(types(), ['shell:expired'], 'a penetrator raises no blast');
  blastBus.length = 0;
  const hitBase = { shellId: 903, shooterId: 'foe', attackerId: 'foe', targetId: 'me', pos: [1, 1, 1], normal: [0, 1, 0], munition: 'heat', chargeKg: 1.6 };
  p.applyEvent({ kind: 'shell_hit', payload: { ...hitBase, kind: 'he_pen', blast: [5, 1.5, 6, 1, 0, 0] } }, quiet);
  p.applyEvent({ kind: 'shell_hit', payload: { ...hitBase, kind: 'he_splash', targetId: 'bot-3', pos: [9, 1, 9] } }, quiet);
  assert.deepEqual(types(), ['munition:blast', 'shell:hit', 'shell:hit'], 'one blast, from the direct hit, before it');
  assert.deepEqual(blastBus[0].payload, { munition: 'heat', chargeKg: 1.6, x: 5, y: 1.5, z: 6, nx: 1, ny: 0, nz: 0, surface: 'tank' });
  blastBus.length = 0;
  p.applyEvent({ kind: 'tank_destroyed', payload: { id: 'ghost', killerId: 'foe', cause: 'fire', x: 3, y: 0.5, z: 4 } }, quiet);
  assert.deepEqual(types(), ['munition:blast', 'tank:destroyed'], 'a fuel fire bursts before the death');
  assert.deepEqual(blastBus[0].payload, { munition: 'fuel', chargeKg: 4, x: 3, y: 1.5, z: 4, nx: 0, ny: 1, nz: 0, surface: 'tank' });
  blastBus.length = 0;
  p.applyEvent({ kind: 'tank_destroyed', payload: { id: 'ghost-2', killerId: 'foe', cause: 'shot', x: 3, y: 0.5, z: 4 } }, quiet);
  assert.deepEqual(types(), ['tank:destroyed'], 'a plain kill raises no blast');
  p.dispose();
}

console.log('mp battle presentation: roster → hidden visuals, frames → game state/visuals/combat/ERA/wrecks/shells/props, events → bus vocabulary, predicted own shots, settled destroyed lists vs live prop falls, verdicts, disconnect, spectator perspective, prediction world, the authority\'s detonations as munition:blast pass');

{
 const state={tanks:[],tankById:new Map(),player:null,shells:[],spotting:null,allTanks:[],timeS:0};
 const built=[],painted=[];
 const p=createBattlePresentation({engineCtx:{scene,anisotropy:1},game:state,bus:{emit(){}},
  createTankVisual:(id,...rest)=>{built.push(id);return fakeVisual(id,...rest);},
  prepareVisualTextures:async spec=>{painted.push(spec.id);},clock:()=>nowMs});
 await p.applyRoster([
  {...roster[0],bot:false,team:TEAM.ALPHA},
  {...roster[1],bot:true,team:TEAM.ALPHA},
 ],{...context,mode:'ac130'});
 assert.equal(p.actors.get('me').visual.root.userData.aircraftOnly,true);
 assert.deepEqual(built,[roster[1].specId],'only the ground escort constructs a tank');
 assert.deepEqual(painted,[roster[1].specId],'only the ground escort prepares camouflage');
 p.dispose();
}
