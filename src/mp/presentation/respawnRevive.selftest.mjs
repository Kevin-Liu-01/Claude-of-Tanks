// Proof (implicit state machine audit, round 4 E6a, 2026-11-06): a hull a mode revives (sim/matchModes.ts reviveAtSpawn:
// its `mode_respawn`, which every viewer receives) is alive and whole on a seat that does not see it rise. A row writes a
// hull's life only where it reaches this seat: a wreck is sent to every seat, a live hull this seat does not spot is not.
// Before, the presentation forwarded `mode_respawn` to the bus and nothing else, so a hull that died in view and rose
// out of sight stayed a wreck until a row reached it: in game.tanks, dead in game.rosterTanks (the HUD's pips, the crew's
// side counts: main.ts getTeamRoster), dead in battle:ended's roster, a prediction collider at its old wreck, with the
// last life's hull points (0) and broken modules. The restart's revive (round 3 X5, round 4 E4) did this for every hull;
// a respawn now does it for its one hull (battlePresentation.ts reviveAtRespawn, through the same beginActorLife).
//   1. Through the real MatchClient (its interpolator, its budgeted event queue and its frames) on the scripted server,
//      bound to the real battle presentation as the page binds it (bindMatchPresentation): an enemy dies in view, a
//      module_state breaks its engine, and it respawns beyond this seat's view. Fails on 0edd0e1ab5.
//   2. The row that can still show the wreck (the session's direction): a hull that stays in view may keep its held
//      row a few snapshots past its revive (server/match/interestTiers.ts needsFreshRow: a row is refreshed on its tier's
//      cadence while the entity stays in the view, and a wreck was in every view), so the frame that releases the
//      revive can still carry the old life's wreck row. A row that reached the hull this frame is the authority's word
//      for its pose and life: the revive leaves them to the rows (no wreck undone and laid again, no flicker), mends what
//      no row carries (its modules and crew), and the hull's next fresh row revives it. Its wreck and revive half passes
//      on 0edd0e1ab5 (no revive there), its module half fails there; with the revive applied whatever the row says, the
//      wreck flickers (plain, revive, plain, revive) and it fails.
//   3. (review r1) The held-then-hidden case: the round's first ruling said such a hull could not leave the view before
//      its fresh row (an enemy spotted at its spawn lingering SPOT_LINGER_S), but the linger keeps only the team's spotted
//      flag; per-viewer visibility does not linger (sim/spotting.ts isSpotted with a receiver: an enemy seen through an
//      ally's radio share drops out when this seat leaves the share's reach or its radio is hit). Such a hull stayed a
//      wreck with 0 hull points until spotted again. Its revive is now owed under the held row and settled once no row
//      reaches it (battlePresentation.ts settleOwedRevive). Fails on 956e2ed079 and on 0edd0e1ab5.
//   4. (review r1) The owed revive is the life before's: a hull that dies again before its fresh row is not revived
//      when its rows stop.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createLoopbackPair } from '../transport/index.ts';
import { ENTITY_FLAGS, PHASE, TEAM, VERDICT, quantizePosition, zeroEntityRow } from '../wire/index.ts';
import { HeadlessMatchClientDriver, MatchClient } from '../match/index.ts';
import { createEntitySample } from '../match/interpolation.ts';
import { ScriptedMatchServer } from '../match/scriptedServer.test-support.ts';
import { createTankState } from '../../sim/movement.ts';
import { getSpec } from '../../vehicles/specs.ts';
import { createBus } from '../../game/stateCore.ts';
import { bindMatchPresentation, createBattlePresentation } from './index.ts';

const SPEC_ID = 'm1a1_abrams_hc';
const MOVEMENT = {
  enginePowerHp: 1500, weightTons: 60, topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42,
  turretTraverseDegS: 40, gunPitchDegS: 25, gunElevationDeg: 20, gunDepressionDeg: 10, pivotStyle: 'neutral',
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
  dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
  gun: { caliberMm: 120, baseAccuracy: 0.3, aimTimeS: 2, bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 } },
  armor: { boundingRadiusM: 4.8, turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.2], gunBarrel: { lengthM: 5.3 } },
};
const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0, getContactHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'hard', maxY: 1 };
const wrong = [];

function presentationFor(game, bus, visualLog) {
  return createBattlePresentation({
    engineCtx: { scene: { add() {} }, anisotropy: 1 }, game, bus,
    worldCollision: { heightField: flat, getObstacles: () => [], getColliders: () => [], crushObstacle() {}, resetDestructibles() {} },
    createTankVisual: () => ({ root: { position: new Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, recoilKick() { return null; },
      gunMuzzleWorld(out) { return out.set(0, 2, 0); }, gunDirWorld(out) { return out.set(0, 0, 1); }, stripEra() {}, resetEra() {},
      setDestroyed(options) { visualLog?.push(options.pop ? 'cookoff' : 'plain'); }, resetDestroyed() { visualLog?.push('revive'); }, dispose() {} }),
    prepareVisualTextures: async () => {}, clearVehicleDecals: () => {}, camoFor: () => 'summer', clock: () => 1000,
  });
}
const newGame = () => ({ tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' });

// ---- 1. the real client: an enemy dies in view and rises out of it
{
  let nowMs = 10_000;
  const clock = () => nowMs;
  const server = new ScriptedMatchServer({
    clock, heightField: flat, specFor: () => MOVEMENT, countdownTicks: 30, visibilityRadiusM: 150,
    seats: [
      { entityId: 1, specId: SPEC_ID, playerId: 'me', name: 'Me', team: TEAM.ALPHA, token: 'tok-me', x: 0, z: 0, yaw: 0 },
      { entityId: 2, specId: SPEC_ID, playerId: 'foe', name: 'Foe', team: TEAM.BRAVO, token: 'tok-foe', x: 40, z: 30, yaw: Math.PI },
    ],
  });
  const link = { latencyMs: 30, jitterMs: 0, loss: 0 };
  const pair = createLoopbackPair({ clock, clientToServer: link, serverToClient: link, random: () => 0.5 });
  server.attach(pair.server);
  const pump = (t) => { pair.pump(t); server.advance(t); pair.pump(t); };
  const controls = () => ({ throttle: 0, steer: 0, brake: false, fire: false, aimLocked: true, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 });
  const client = new MatchClient({ transport: pair.client, token: 'tok-me', clock, controls, prediction: null });
  const driver = new HeadlessMatchClientDriver({ client, advanceClock: (ms) => (nowMs += ms), pump });
  const game = newGame();
  const bus = createBus();
  const told = [];
  bus.on('mode:respawn', (event) => told.push(event.id));
  const presentation = presentationFor(game, bus, null);
  // what the presentation saw of the foe when the revive reached it (the page's adapter, recorded on the way through)
  let atRevive = null;
  const adapter = {
    applyRoster: (roster, context) => presentation.applyRoster(roster, context),
    applyFrame: (frame) => presentation.applyFrame(frame),
    applyEvent: (event, context) => {
      if (event.kind === 'mode_respawn') {
        const foe = game.tankById.get('foe');
        atRevive = { reached: !!foe?.networkVisible, destroyed: !!foe?.combat.destroyed };
      }
      presentation.applyEvent(event, context);
    },
    applyVerdict: (verdict, reason) => presentation.applyVerdict(verdict, reason),
    setVisibility: (entityId, visible) => presentation.setVisibility(entityId, visible),
    dispose: () => presentation.dispose(),
  };
  const unbind = bindMatchPresentation(client, adapter);
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; driver.step(nowMs); } };
  client.connect();
  for (let i = 0; i < 120 && !client.isSeated; i++) frames(1);
  assert.ok(client.isSeated, 'setup: the client is seated');
  await presentation.rosterReady();
  frames(60 * 2);
  const foe = game.tankById.get('foe');
  assert.ok(foe && foe.networkVisible && !foe.combat.destroyed, 'setup: the foe is in view, alive');
  // it dies in view, and a module_state of its death broke its engine (the authority's own event path)
  const engine = Object.keys(foe.combat.modules).includes('engine') ? 'engine' : Object.keys(foe.combat.modules)[0];
  server.destroy(2);
  server['broadcastEvent']({ kind: 'module_state', payload: { id: 'foe', module: engine, state: 'red', source: 'shot' } });
  frames(60);
  assert.ok(foe.combat.destroyed && foe.combat.hp === 0 && game.tanks.includes(foe), 'setup: the foe is a wreck in view');
  assert.equal(foe.combat.modules[engine].state, 'red', 'setup: its engine broke');
  // it rises at a spawn beyond this seat's view (the scripted server's 150 m radius)
  server.respawn(2, 600, 600, 0);
  frames(60);
  assert.deepEqual(told, ['foe'], 'setup: the revive reached the bus');
  assert.ok(atRevive && !atRevive.reached, `setup: no row reached the foe in the frame that released its revive (${JSON.stringify(atRevive)})`);
  assert.equal(foe.networkVisible, false, 'setup: the foe is out of view');
  if (foe.combat.destroyed) wrong.push('the foe revived out of view still reads destroyed');
  if (game.tanks.includes(foe)) wrong.push('game.tanks still holds the foe revived out of view as a wreck');
  if ((game.rosterTanks ?? []).some((actor) => actor === foe && actor.combat.destroyed)) wrong.push('game.rosterTanks counts the revived foe dead (the HUD\'s pips and the crew\'s side counts)');
  if (foe.combat.hp !== foe.combat.maxHp) wrong.push(`the revived foe has its last life's hull points (${foe.combat.hp}/${foe.combat.maxHp}): the HUD's ear row draws an empty bar on a living enemy`);
  if (foe.combat.modules[engine].state !== 'ok') wrong.push(`the revived foe keeps its last life's broken ${engine}`);
  if (foe._networkDestroyed || foe._wreckTurretPose) wrong.push('the revived foe keeps its wreck look or its wreck turret pose');
  const world = presentation.predictionWorld();
  if (world?.collide(new Vector3(40, 0, 30), 0, new Vector3())) wrong.push('the own prediction still collides with the revived foe\'s old wreck');
  presentation.applyEvent({ kind: 'match_ended', payload: { result: 'alpha', reason: 'time' } }, { own: false, feedbackPredicted: false });
  unbind();
  presentation.dispose();
  server.dispose();
}

/** One seat and one peer on the real presentation, fed frames by hand: the rows each frame carries, then its events. */
async function heldRowSeat(peer, team) {
  const game = newGame();
  const bus = createBus();
  const visual = [];
  const presentation = presentationFor(game, bus, visual);
  await presentation.applyRoster([
    { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'me', name: 'Me', specId: SPEC_ID },
    { entityId: 2, seat: 1, team, bot: true, connected: true, playerId: peer, name: peer, specId: SPEC_ID },
  ], { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' });
  const ownState = createTankState(getSpec(SPEC_ID), new Vector3(0, 0, 0), 0);
  let tick = 100;
  const row = (destroyed, x, hp) => Object.assign(createEntitySample(2), {
    x, y: 0, z: 30, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, hp, maxHp: 2000,
    reloadS: 0, reloadTotalS: 6, reloadKind: 'shell', gunReloadS: 0, gunReloadTotalS: 6, gunReloadKind: 'shell',
    ammo0: 20, ammo1: 4, ammo2: 2, flags: destroyed ? ENTITY_FLAGS.DESTROYED : 0, snapped: false, eraSpent: [],
  });
  const present = (rows, events = []) => {
    tick += 2;
    presentation.applyFrame({
      tick, renderTimeMs: tick * 16, entities: rows, shells: [], unseenShells: [],
      meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 12_500, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
      modeStateJson: null, destroyed: [], destructibleRevision: 0,
      viewer: { entityId: 1, playerId: 'me', state: ownState,
        row: { ...zeroEntityRow(1), x: quantizePosition(0), y: 0, z: quantizePosition(0), hp: 1800, maxHp: 2000, reloadTotal: 3000 },
        viewer: { entityId: 1, modules: new Array(15).fill(0), crewBits: 0, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000,
          modeGravityScale: 1000, movementVersion: 0, movementFlags: 0, movementValues: [] },
        authorityTick: tick - 2, authorityReceivedAtMs: 1000, predictedShot: null },
      events: [], ownShots: [], extrapolatedMs: 0, phase: 'live', battleRestarts: 0,
    });
    for (const event of events) presentation.applyEvent(event, { own: false, feedbackPredicted: false });
  };
  present([row(false, 30, 1500)]);
  const actor = game.tankById.get(peer);
  const engine = Object.keys(actor.combat.modules)[0];
  present([row(true, 30, 0)], [
    { kind: 'tank_destroyed', payload: { id: peer, killerId: 'other', cause: 'shot', x: 30, y: 0, z: 30 } },
    { kind: 'module_state', payload: { id: peer, module: engine, state: 'red', source: 'shot' } },
  ]);
  assert.deepEqual(visual, ['plain'], `setup: the ${peer} is a wreck`);
  return { game, presentation, visual, row, present, actor, engine };
}

// ---- 2. a revive released while a held row still shows the wreck, and the hull stays in view
{
  const { presentation, visual, row, present, actor: held, engine } = await heldRowSeat('ally', TEAM.ALPHA);
  // the revive's frame and the next carry the held wreck row (the ally stayed in view): the rows keep its life
  present([row(true, 30, 0)], [{ kind: 'mode_respawn', payload: { id: 'ally', team: 'alpha' } }]);
  if (!held.combat.destroyed) wrong.push('held row: the revive undid the wreck a row of this frame still shows');
  if (held.combat.modules[engine].state !== 'ok') wrong.push(`held row: the revive left the last life's broken ${engine} (no row carries a remote hull's modules)`);
  present([row(true, 30, 0)]);
  // its fresh row: alive at its spawn
  present([row(false, 200, 2000)]);
  if (held.combat.destroyed || held.combat.hp !== 2000) wrong.push('held row: the fresh row did not revive the ally');
  if (visual.join() !== 'plain,revive') wrong.push(`held row: the wreck flickered across the revive (${visual.join(' -> ')}; once laid, once undone)`);
  // and out of view afterwards it stays as the fresh row left it (the debt was paid: nothing revives it twice)
  present([]);
  if (held.combat.destroyed || visual.join() !== 'plain,revive') wrong.push(`held row: the ally was revived again once out of view (${visual.join(' -> ')})`);
  presentation.dispose();
}

// ---- 3. (review r1) a revive released under a held wreck row, then the hull leaves this seat's view before its fresh
// row: an enemy seen through an ally's radio share drops out of this seat's snapshot when the seat leaves the share's
// reach or its radio is hit (sim/spotting.ts isSpotted with a receiver; per-viewer visibility does not linger), and no
// row comes to revive it. Fails on 956e2ed079 (the reviewer's probe: destroyed, 0 hp, in game.tanks) and on 0edd0e1ab5.
{
  const { game, presentation, visual, row, present, actor: foe } = await heldRowSeat('foe', TEAM.BRAVO);
  present([row(true, 30, 0)], [{ kind: 'mode_respawn', payload: { id: 'foe', team: 'bravo' } }]);
  if (!foe.combat.destroyed) wrong.push('held then hidden: the revive undid the wreck a row of this frame still shows');
  present([]);
  if (foe.combat.destroyed) wrong.push('held then hidden: the foe out of view after its revive still reads destroyed');
  if (foe.combat.hp !== foe.combat.maxHp) wrong.push(`held then hidden: the revived foe has its last life's hull points (${foe.combat.hp}/${foe.combat.maxHp})`);
  if (game.tanks.includes(foe)) wrong.push('held then hidden: game.tanks still holds the revived foe as a wreck');
  if ((game.rosterTanks ?? []).some((actor) => actor === foe && actor.combat.destroyed)) wrong.push('held then hidden: game.rosterTanks counts the revived foe dead');
  if (presentation.predictionWorld()?.collide(new Vector3(30, 0, 30), 0, new Vector3())) wrong.push('held then hidden: the own prediction still collides with the revived foe\'s old wreck');
  if (visual.join() !== 'plain,revive') wrong.push(`held then hidden: the wreck look went ${visual.join(' -> ')} (laid once, undone once)`);
  // seen again at its spawn: the rows write it as any row does
  present([row(false, 200, 2000)]);
  if (foe.combat.destroyed || visual.join() !== 'plain,revive') wrong.push(`held then hidden: its fresh row found it in a wrong life (${visual.join(' -> ')})`);
  presentation.dispose();
}

// ---- 4. (review r1) the owed revive is the life before's: a hull that dies again in its new life before its fresh row
// reaches this seat (its tank_destroyed after the revive) is not revived when its rows stop (a wreck a mode set inactive
// is sent to no seat: authoritativeMatch.ts canObserveEntity, modeActive)
{
  const { presentation, row, present, actor: foe } = await heldRowSeat('foe', TEAM.BRAVO);
  present([row(true, 30, 0)], [{ kind: 'mode_respawn', payload: { id: 'foe', team: 'bravo' } }]);
  present([row(true, 30, 0)], [{ kind: 'tank_destroyed', payload: { id: 'foe', killerId: 'other', cause: 'shot', x: 30, y: 0, z: 30 } }]);
  present([]);
  if (!foe.combat.destroyed) wrong.push('died again: the revive before its new life\'s death revived the foe once its rows stopped');
  presentation.dispose();
}

if (wrong.length) {
  console.error(`respawnRevive: a mode's revive left this seat's actor in its last life:\n  ${wrong.join('\n  ')}`);
  assert.fail('a revived hull is alive and whole on every seat, seen or not');
}
console.log('respawnRevive: a hull revived out of view is alive and whole on the seat (roster, side counts, prediction, hull points, modules); a revive released under a held wreck row leaves the life to the rows, mends the modules, and the fresh row revives it without a flicker, or the revive is settled once no row reaches the hull (not after a new death) PASS');
