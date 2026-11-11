// Proof (implicit state machine audit, round 3 merge review r1, 2026-11-06): a battle restart is a new life for every
// hull in every listener that keeps per-life state. The presentation tells a restart once on the bus
// ('battle:restarted', battlePresentation.ts resetSettledWorld on MatchFrame.battleRestarts; battleRestartReset pins
// that), and before only the effects heard it. The listeners that reset per life did so on a revive's edge
// ('mode:respawn') or a round's entry ('ui:battleStart', 'phase:change'), and a restart from the spawns emits neither
// (the kept host's migrationFallback builds a fresh actor; the presentation forwards only mode_* wire events). So:
//   1. killcam.ts: a seat dead at the restart kept chasing an ally while its own hull sat alive at its spawn, until the
//      battle ended (the semantic reviewer's probe); an observer seat's chase is its camera and must stay;
//   2. audioEngine.ts: a hull that died in the abandoned battle and is hidden after the restart had its next death
//      silenced (the death latch re-arms only on a respawn or on update() seeing the hull alive, and update() gets the
//      visible hulls); the player's fire alarm and the abandoned battle's burning wrecks played on;
//   3. serviceRecord.ts: the seat stayed dead for the record, an enemy damaged in the abandoned battle was no longer
//      fresh for One Shot, and an abandoned round stayed a hull's killing shot;
//   4. hud.ts and shotInfo.ts: their kill ledgers kept the abandoned battle's dead, so a hull that died there and dies
//      again in the restarted battle was never fed nor counted (round 4 E6b: moved to battleRestartTallies, on the real
//      HUD, where a restart opens a new battle and the counts start over; its contact memory, revive count and consumable
//      tray checks went with it, review r1).
// Cases 1-3 fail on the merged head before that fix (b598626c30) and pass now; case 4 is battleRestartTallies case 1.
// Review r2: the presentation's own actors kept the abandoned battle's deaths. A row writes a hull's life, a wreck is
// sent to every seat and a live hull this seat does not spot is not, so a hull that died in the abandoned battle and is
// hidden in the restarted one read destroyed after the restart:
//   5. on the real presentation and audio engine sharing one bus: the hidden hulls read destroyed, stayed in game.tanks
//      and dead in game.rosterTanks, the own prediction collided with their old wrecks, battle:ended's roster reported
//      them dead, and the crew, whose network side counts read that roster (main.ts getTeamRoster), called "last enemy"
//      at the restart with five enemies alive and hidden (restartLives had re-armed the call). It fails on 20a8d0d793.
//   1 (review r2): the killcam's restart listener is called from the frame pump, and a replay release that throws in
//      cancel() (rethrown by design, round 3 A9) left it, dropping the frame; now it is reported and the chase still ends.
// Round 4 (E4): the revived actors kept the abandoned battle's hull points and modules: a hidden revived wreck read alive
// with 0 hull points (the HUD's ear row drew an empty bar on a living enemy until it was spotted), and a hidden hull
// damaged there kept its damage and its broken module (told by module_state). Case 5 asserts both and fails on 0edd0e1ab5.
// Round 4 review r2: what the bus's module states laid outside the presentation's combat state started over too. Case 5:
// a hull alive at the restart (e5, hidden; the own hull) kept its thrown track band and its damaged gun on its visual
// (main.ts's 'module:state' listener draws them; only a wreck's visual was reset), and the audio kept the abandoned
// battle's module states, so the own hull's track thrown again in the restarted battle was no change and unheard. Case 2:
// the audio's battle play started over (audioEngine.ts resetBattlePlay): a smoke screen launched 5 s into the restarted
// battle was silent behind the abandoned battle's launch at 250 s (a watermark on the sim clock), and the player's first
// kill in the restarted battle was a double kill with the abandoned battle's last. All four fail on 0edd0e1ab5 and on
// 2c18dae0db.
// Round 7 merge review r1 (deploy 269 merged): 6. 269's crew procedure (src/audio/crewProcedure.ts) keeps its own battle
// state (the enemies its side has spotted, a watermark of the newest enemy smoke on the battle's sim clock, its countdown
// report, its rounds in flight) and reset it only on its own phase edge, which a restart does not take. The restarted
// battle's enemy smoke born earlier than the abandoned battle's last screen was never called, and smoke beside an enemy
// spotted only in the abandoned battle was called as a named enemy's. The engine's battle reset (resetBattlePlay, at a
// battle's start and in restartLives) now resets the crew. Case 6 fails on 7740bd2b63.
// Round 7 merge review r2: 7. 269's droneLastAt (where each carrier's drone was last heard in flight; 'drone:down' plays
// the drone's breakup there) was merged into the battle's fields, which a restart keeps, so a drone shot down in the
// restarted battle that this seat never heard fly broke up at the abandoned battle's last drone position. It is the
// battle's play now (resetBattlePlay, beside moduleStates as 269 had it). Case 7 fails on 791607ac0f.
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Vector3 } from 'three';
import {
  installFetch, namedContext, terrain, tank, listener, sounding, probeOf, mark, since, count,
} from '../../audio/engineHarness.test-support.mjs';

// the page's window and document, as far as the killcam's chase and the audio engine's probe reach
const windowListeners = new Map();
globalThis.window = {
  addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type).add(fn); },
  removeEventListener(type, fn) { windowListeners.get(type)?.delete(fn); },
};
globalThis.document = {
  pointerLockElement: null,
  addEventListener() {}, removeEventListener() {},
  body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }),
};
const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) };
installFetch();
const { createBus } = await import('../../game/stateCore.ts');
const { createKillCam } = await import('../../game/killcam.ts');
const { createAudio } = await import('../../audio/audioEngine.ts');
const { installServiceRecord, getServiceRecord, getLastBattleAwards } = await import('../../game/serviceRecord.ts');

const RESTART = { battleRestarts: 1 };
const wrong = [];

// ---- 1. the killcam: the dead seat's chase ends at the restart; an observer's camera stays
{
  const run = (observer, releaseFails = false) => {
    const me = { id: 'me', isPlayer: true, team: 'player', state: {}, visual: {}, combat: { destroyed: false } };
    const ally = { id: 'ally', team: 'player', state: {}, visual: {}, combat: { destroyed: false } };
    const game = { phase: 'battle', result: null, ruleset: { respawnS: null }, preBattleS: 0, tanks: [me, ally], tankById: new Map([['me', me], ['ally', ally]]) };
    const killcam = createKillCam({
      scene: new Scene(), camera: new PerspectiveCamera(), heightField: { getHeightAt: () => 0 },
      getPlayer: () => (observer ? null : me), getGame: () => game, isBattleEntryCovered: () => false,
      rig: { startSpectate() {}, setSpectateTarget() {}, spectateLook() {}, spectateZoom() {}, stopSpectate() {} },
    });
    const bus = createBus();
    let ends = 0;
    bus.on('spectate:end', () => { ends++; });
    killcam.bindBus(bus);
    if (observer) assert.equal(killcam.spectate.startObserver(), true, 'setup: an observer seat watches the field');
    else {
      me.combat.destroyed = true;
      assert.equal(killcam.spectate.maybeStart(), true, 'setup: a dead seat chases its ally');
    }
    // (review r2) a replay whose release throws: cancel() rethrows its first error after every step ran (round 3 A9)
    if (releaseFails) killcam.cancel = () => { throw new Error('a replay release failed'); };
    // the restart: every hull at its spawn again; the presentation tells the bus
    me.combat.destroyed = false;
    const reported = [];
    const consoleError = console.error;
    console.error = (...args) => { reported.push(args.map(String).join(' ')); };
    let thrown = null;
    try { bus.emit('battle:restarted', RESTART); } catch (error) { thrown = error; } finally { console.error = consoleError; }
    const after = { active: killcam.spectate.active, target: killcam.spectate.targetId, ends, thrown, reported };
    killcam.spectate.stop();
    return after;
  };
  const seat = run(false);
  if (seat.active) wrong.push(`killcam: the seat alive again at its spawn still chases '${seat.target}' after the restart`);
  if (seat.ends !== 1) wrong.push(`killcam: the HUD was told the chase ended ${seat.ends} times (once, as at the own revive)`);
  const observer = run(true);
  if (!observer.active) wrong.push('killcam: the restart took an observer seat\'s camera (its chase is its view)');
  // (review r2) the restart is told from the frame pump: a replay release that throws stays inside the listener
  const failing = run(false, true);
  if (failing.thrown) wrong.push(`killcam: a replay release that threw at the restart left the listener (${failing.thrown.message}), so the frame pump dropped the frame`);
  if (failing.active || failing.ends !== 1) wrong.push(`killcam: after a failed replay release the chase did not end (active ${failing.active}, ${failing.ends} ends)`);
  if (!failing.reported.some((line) => line.includes('a replay release failed'))) wrong.push('killcam: the failed replay release at the restart was not reported');
}

// ---- 2. the audio engine: a hidden hull's next death is heard; the old life's alarm and wrecks go
{
  const ctx = namedContext();
  const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  const bus = createBus();
  audio.bindBus(bus);
  audio.resume();
  const probe = probeOf();
  const me = tank('me', { isPlayer: true });
  const foe = tank('foe', { specId: 'leo2a4', nation: 'Germany', x: -40, z: 120, team: 'enemy' });
  const frame = (list, dt = 1 / 30) => { ctx.advance(dt); audio.update(dt, listener, list); };
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(['t72b3m_2022', 'leo2a4']);
  await probe.libraryIdle();
  audio.ambientOn(true);
  for (let i = 0; i < 10; i++) frame([me, foe]);
  bus.emit('battle:rollout', {});
  for (let i = 0; i < 5; i++) frame([me, foe]);
  // the abandoned battle: the foe cooks off (its wreck burns), the player's hull burns
  bus.emit('tank:fire', { id: 'me', burning: true });
  bus.emit('tank:destroyed', { id: 'foe', killerId: 'me', pos: [-40, 0, 120], cause: 'ammorack' });
  for (let i = 0; i < 20; i++) frame([me]);
  assert.ok(sounding(ctx).includes('cookoff_loop'), 'setup: the foe\'s wreck burns');
  assert.ok(sounding(ctx).includes('alarm_fire_loop'), 'setup: the player\'s fire alarm sounds');
  // (round 4 E6b review r2) the abandoned battle's play: the foe's death above is the player's kill, and a smoke screen is
  // launched 250 s into it (the battle's sim clock, sim/auxiliarySystems.ts born)
  const smoke = (born) => bus.emit('auxiliary:smokeScreens', { screens: [{ born, x: 40, y: 1, z: 40, source: ['t72b3m_2022', 40, 0, 40, 0, 0, 0, 0, 0, 1.5, 0] }] });
  const abandonedSmoke = mark(probe);
  smoke(250);
  for (let i = 0; i < 10; i++) frame([me]);
  assert.equal(count(since(abandonedSmoke, probe), 'smoke_launcher'), 1, 'setup: the abandoned battle\'s smoke launch is heard');
  assert.ok(probe.sayLog.some((entry) => entry.id === 'target_destroyed'), 'setup: the player\'s kill in the abandoned battle is called');
  // the restart: the foe stands at its spawn, hidden from this seat (update() is never given it)
  bus.emit('battle:restarted', RESTART);
  for (let i = 0; i < 20; i++) frame([me]);
  const still = sounding(ctx);
  if (still.includes('cookoff_loop')) wrong.push('audio: the abandoned battle\'s wreck still burns where no wreck stands');
  if (still.includes('alarm_fire_loop')) wrong.push('audio: the old hull\'s fire alarm still sounds on the fresh hull');
  // the restarted battle: the hidden foe dies
  const seq = mark(probe);
  bus.emit('tank:destroyed', { id: 'foe', killerId: 'ally', pos: [-40, 0, 120], cause: 'shot' });
  const heard = count(since(seq, probe), 'tank_explode');
  if (heard !== 1) wrong.push(`audio: the restarted battle's death of a hull hidden since the restart sounded ${heard} times (once)`);
  // (round 4 E6b review r2) the restarted battle's play is its own (audioEngine.ts resetBattlePlay at the restart): its sim
  // clock starts at 0 again, so a smoke screen 5 s in is heard, and the player's first kill in it, a few seconds after the
  // abandoned battle's last, is a kill, not a double kill
  const restartedSmoke = mark(probe);
  smoke(5);
  for (let i = 0; i < 10; i++) frame([me]);
  const launches = count(since(restartedSmoke, probe), 'smoke_launcher');
  if (launches !== 1) wrong.push(`audio: a smoke screen launched 5 s into the restarted battle sounded ${launches} times (the abandoned battle's launch at 250 s silenced it)`);
  const lastSay = probe.sayLog.at(-1);
  bus.emit('tank:destroyed', { id: 'foe2', killerId: 'me', pos: [40, 0, 160], cause: 'shot' });
  const killCall = probe.sayLog.slice(probe.sayLog.indexOf(lastSay) + 1).map((entry) => entry.id)
    .find((id) => id === 'double_kill' || id === 'target_destroyed');
  if (killCall !== 'target_destroyed') wrong.push(`audio: the player's first kill in the restarted battle was called '${killCall}' (the abandoned battle's last kill counted toward a double kill)`);
}

// ---- 3. the service record: a new life for the seat and every hull
{
  const teams = new Map([['me', 'player'], ['e1', 'enemy'], ['e2', 'enemy']]);
  const clock = { s: 0 };
  const bus = createBus();
  installServiceRecord(bus, {
    playerId: () => 'me', playerTeam: () => 'player', teamOf: (id) => teams.get(id) ?? null, gameMode: () => 'standard',
    clockS: () => clock.s, playerHpFraction: () => 1, playerMaxHp: () => 2000, playerNation: () => 'Germany',
    playerAerialKind: () => null, respawns: () => false, playerObjectiveTeam: () => null,
  });
  const medals = [];
  bus.on('service:medal', (event) => medals.push(event.id));
  const fire = (shellId) => bus.emit('shell:fired', { shooterId: 'me', shellId, caliberMm: 120 });
  const hit = (shellId, targetId, damage, extra = {}) => bus.emit('shell:hit', { attackerId: 'me', targetId, shellId, damage, kind: 'pen', ...extra });
  bus.emit('ui:battleStart', { specId: 'leopard_2a7', mapId: 'desert' });
  bus.emit('phase:change', { phase: 'battle' });
  // the abandoned battle: e1 damaged, a long round strikes e2 without killing it, the seat destroyed
  clock.s = 10; fire(1); hit(1, 'e1', 600);
  clock.s = 12; fire(2); hit(2, 'e2', 2100, { destroyed: true, flightDistM: 480 });
  clock.s = 14; bus.emit('tank:destroyed', { id: 'me', killerId: 'e1', cause: 'shot' });
  bus.emit('battle:restarted', RESTART);
  // the restarted battle: e1 falls to one round, e2 to a ram
  medals.length = 0;
  clock.s = 40; fire(3); hit(3, 'e1', 2400, { destroyed: true, flightDistM: 150 });
  bus.emit('tank:destroyed', { id: 'e1', killerId: 'me', specId: 'spec-e1', cause: 'shot' });
  if (!medals.includes('one_shot')) wrong.push('serviceRecord: an enemy damaged in the abandoned battle is not fresh for One Shot after the restart');
  clock.s = 50; bus.emit('tank:destroyed', { id: 'e2', killerId: 'me', specId: 'spec-e2', cause: 'ram' });
  bus.emit('battle:ended', { result: 'victory', durationS: 60, mapId: 'desert', gameMode: 'standard', roster: [] });
  const row = getServiceRecord().history[0];
  const ram = row?.trace?.find((step) => step.specId === 'spec-e2');
  if (!ram || ram.distM !== 0) wrong.push(`serviceRecord: the ram kill carries the abandoned battle's round as its killing shot (${ram?.distM} m)`);
  if (getLastBattleAwards()?.medals.includes('long_shot')) wrong.push('serviceRecord: the abandoned battle\'s 480 m round earned Long Shot for a ram');
  if (row?.survived !== true) wrong.push('serviceRecord: the seat destroyed in the abandoned battle is recorded dead at the restarted battle\'s end');
}

// ---- 4. moved (round 4 E6b) to battleRestartTallies.selftest.mjs, which drives the real HUD and its report over the
// recording DOM instead of the handlers' source: a restart now opens a new battle, so the kill counts start over (round 3
// kept them), a hull that died in the abandoned battle and dies again is fed once and counted, and the seat's revive count,
// contact memory and consumable tray are its fresh hull's (review r1: all four of the case's checks, on the real HUD).

// ---- 5. the presentation's own actors, and the network side counts that read them (review r2)
{
  const { createBattlePresentation } = await import('./index.ts');
  const { createTankState } = await import('../../sim/movement.ts');
  const { getSpec } = await import('../../vehicles/specs.ts');
  const { ENTITY_FLAGS, PHASE, TEAM, VERDICT, quantizePosition, zeroEntityRow } = await import('../wire/index.ts');
  const { createEntitySample } = await import('../match/interpolation.ts');
  const SPEC = 'm1a1_abrams_hc';
  const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0, getContactHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'hard', maxY: 1 };
  const bus = createBus();
  const ended = [];
  bus.on('battle:ended', (event) => ended.push(event));
  const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' };
  const presentation = createBattlePresentation({
    engineCtx: { scene: { add() {} }, anisotropy: 1 }, game, bus,
    worldCollision: { heightField: flat, getObstacles: () => [], getColliders: () => [], crushObstacle() {}, resetDestructibles() {} },
    // (round 4 E4 review r2) the visual's module look as the real one keeps it (vehicles/tankFactoryCore.ts: setTrackState
    // throws or re-seats a band, setWeaponModuleState keeps a weapon's damage, resetDestroyed re-seats both bands and clears
    // the weapon damage, on a wreck or a living hull alike)
    createTankVisual: () => {
      const visual = { root: { position: new Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, recoilKick() { return null; },
        gunMuzzleWorld(out) { return out.set(0, 2, 0); }, gunDirWorld(out) { return out.set(0, 0, 1); }, stripEra() {}, resetEra() {},
        setDestroyed() {}, dispose() {},
        thrown: new Set(), weaponDamage: new Map(),
        setTrackState(module, broken) { if (broken) visual.thrown.add(module); else visual.thrown.delete(module); },
        setWeaponModuleState(module, state) { if (state === 'ok') visual.weaponDamage.delete(module); else visual.weaponDamage.set(module, state); },
        resetDestroyed() { visual.thrown.clear(); visual.weaponDamage.clear(); } };
      return visual;
    },
    prepareVisualTextures: async () => {}, clearVehicleDecals: () => {}, camoFor: () => 'summer', clock: () => 1000,
  });
  // main.ts's 'module:state' listener (main.ts:971): the thrown track bands and the weapons' damage follow the bus
  bus.on('module:state', (payload) => {
    const visual = game.tankById.get(payload.id)?.visual;
    if (payload.module === 'trackL' || payload.module === 'trackR') visual?.setTrackState?.(payload.module, payload.state === 'red');
    else visual?.setWeaponModuleState?.(payload.module, payload.state);
  });
  // the seat and three allies (alpha), five enemies (bravo) in a Standard battle, where a death is final
  const seats = [['me', TEAM.ALPHA], ['a1', TEAM.ALPHA], ['a2', TEAM.ALPHA], ['a3', TEAM.ALPHA],
    ['e1', TEAM.BRAVO], ['e2', TEAM.BRAVO], ['e3', TEAM.BRAVO], ['e4', TEAM.BRAVO], ['e5', TEAM.BRAVO]];
  await presentation.applyRoster(seats.map(([playerId, team], seat) => ({
    entityId: seat + 1, seat, team, bot: seat > 0, connected: true, playerId, name: playerId, specId: SPEC,
  })), { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' });
  const spot = (id) => ({ x: 30 + 20 * seats.findIndex(([playerId]) => playerId === id), z: id.startsWith('e') ? 300 : 0 });
  const row = (id, destroyed) => {
    const out = createEntitySample(seats.findIndex(([playerId]) => playerId === id) + 1);
    Object.assign(out, { ...spot(id), y: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, hp: destroyed ? 0 : 1500, maxHp: 2000,
      reloadS: 0, reloadTotalS: 6, reloadKind: 'shell', gunReloadS: 0, gunReloadTotalS: 6, gunReloadKind: 'shell',
      ammo0: 20, ammo1: 4, ammo2: 2, flags: destroyed ? ENTITY_FLAGS.DESTROYED : 0, snapped: false, eraSpent: [] });
    return out;
  };
  const ownState = createTankState(getSpec(SPEC), new Vector3(0, 0, 0), 0);
  let tick = 100;
  const present = (restarts, rows) => {
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
      events: [], ownShots: [], extrapolatedMs: 0, phase: 'live', battleRestarts: restarts,
    });
  };
  const allies = ['a1', 'a2', 'a3'].map((id) => row(id, false));
  // the crew counts sides from the presentation's roster, as main.ts wires a deaths-final network battle
  const ctx = namedContext();
  const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop',
    getTeamRoster: () => game.rosterTanks ?? null });
  audio.bindBus(bus);
  audio.resume();
  const probe = probeOf();
  const me = Object.assign(tank('me', { isPlayer: true }), { networkVisible: true });
  const hear = (n) => { for (let i = 0; i < n; i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, [me]); } };
  const sideCalls = () => probe.sayLog.map((entry) => entry.id).filter((id) => id === 'last_enemy' || id === 'last_tank' || id === 'outnumbered');
  present(0, [...allies, ...['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => row(id, false))]);
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(['t72b3m_2022', SPEC]);
  await probe.libraryIdle();
  audio.ambientOn(true);
  hear(10);
  bus.emit('battle:rollout', {});
  hear(30 * 2);
  // the abandoned battle: four enemies fall; their wrecks reach every seat, the fifth is hidden
  present(0, [...allies, ...['e1', 'e2', 'e3', 'e4'].map((id) => row(id, true))]);
  for (const id of ['e1', 'e2', 'e3', 'e4']) {
    presentation.applyEvent({ kind: 'tank_destroyed', payload: { id, killerId: 'a1', cause: 'shot', ...spot(id), y: 0 } }, { own: false, feedbackPredicted: false });
  }
  hear(30 * 3);
  assert.deepEqual(sideCalls(), ['last_enemy'], 'setup: the abandoned battle\'s fourth death calls the last enemy');
  const e1 = game.tankById.get('e1');
  assert.ok(e1.combat.destroyed && game.tanks.includes(e1), 'setup: e1 is a wreck on this seat');
  // (round 4 E4) a module the abandoned battle broke, told on the presentation's own event path (module_state), on a
  // wreck (e1) and on e5, seen alive at 1500 of 2000 hull points before it went out of sight
  const enemies = ['e1', 'e2', 'e3', 'e4', 'e5'];
  const broken = Object.keys(e1.combat.modules).includes('engine') ? 'engine' : Object.keys(e1.combat.modules)[0];
  for (const id of ['e1', 'e5']) {
    presentation.applyEvent({ kind: 'module_state', payload: { id, module: broken, state: 'red', source: 'shot' } }, { own: false, feedbackPredicted: false });
  }
  const e5 = game.tankById.get('e5');
  assert.ok(e1.combat.modules[broken].state === 'red' && e5.combat.modules[broken].state === 'red', `setup: the abandoned battle broke e1's and e5's ${broken}`);
  // (round 4 E4 review r2) and what the bus's module states laid on the living hulls' visuals and in the audio: e5's left
  // track thrown and its gun damaged, the own hull's right track thrown (its break heard)
  const told = (id, module, state) => presentation.applyEvent({ kind: 'module_state', payload: { id, module, state, source: 'shot' } }, { own: false, feedbackPredicted: false });
  told('e5', 'trackL', 'red');
  told('e5', 'gun', 'yellow');
  const ownBreak = mark(probe);
  told('me', 'trackR', 'red');
  hear(3);
  const own = game.tankById.get('me');
  assert.ok(e5.visual.thrown.has('trackL') && e5.visual.weaponDamage.get('gun') === 'yellow' && own.visual.thrown.has('trackR'),
    'setup: the abandoned battle threw e5\'s left track, damaged its gun and threw the own hull\'s right track');
  assert.equal(count(since(ownBreak, probe), 'track_break'), 1, 'setup: the own hull\'s thrown track is heard');
  assert.ok(e1.combat.hp === 0 && e5.combat.hp === 1500 && e5.combat.maxHp === 2000, 'setup: e1 died, e5 was seen damaged (1500 of 2000)');
  // the restart: every hull alive at its spawn; this seat spots its allies and no enemy
  present(1, allies);
  present(1, allies);
  hear(30 * 3);
  const restartCalls = sideCalls().slice(1);
  if (restartCalls.length) wrong.push(`audio: the crew called ${JSON.stringify(restartCalls)} at the restart, with five enemies alive and hidden (the roster kept the abandoned battle's deaths)`);
  const stale = ['e1', 'e2', 'e3', 'e4'].filter((id) => game.tankById.get(id).combat.destroyed);
  if (stale.length) wrong.push(`presentation: the hidden hulls ${stale.join(', ')} still read destroyed after the restart`);
  const listed = game.tanks.filter((actor) => actor.id.startsWith('e')).map((actor) => actor.id);
  if (listed.length) wrong.push(`presentation: game.tanks still holds the hidden hulls ${listed.join(', ')} as wrecks`);
  const rosterDead = (game.rosterTanks ?? []).filter((actor) => actor.combat.destroyed).map((actor) => actor.id);
  if (rosterDead.length) wrong.push(`presentation: game.rosterTanks counts ${rosterDead.join(', ')} dead (the HUD's and the crew's side counts)`);
  const world = presentation.predictionWorld();
  const at = spot('e1');
  if (world?.collide(new Vector3(at.x, 0, at.z), 0, new Vector3())) wrong.push('presentation: the own prediction still collides with e1\'s old wreck');
  if (e1._wreckTurretPose || e1._networkDestroyed) wrong.push('presentation: e1 keeps its old wreck\'s look or turret pose');
  // (round 4 E4) the host restarted every hull whole: a hidden hull's hull points and modules are its new life's. Before, a
  // revived wreck read alive with 0 hull points (the HUD's ear row drew an empty health bar on a living enemy until it
  // was spotted) and a hull damaged in the abandoned battle kept its damage and its broken module
  const worn = enemies.map((id) => [id, game.tankById.get(id).combat]).filter(([, combat]) => combat.hp !== combat.maxHp)
    .map(([id, combat]) => `${id} ${combat.hp}/${combat.maxHp}`);
  if (worn.length) wrong.push(`presentation: the hidden hulls kept the abandoned battle's hull points after the restart (${worn.join(', ')})`);
  const unmended = enemies.filter((id) => Object.values(game.tankById.get(id).combat.modules).some((module) => module.state !== 'ok'));
  if (unmended.length) wrong.push(`presentation: the hidden hulls ${unmended.join(', ')} kept the abandoned battle's broken ${broken} after the restart`);
  // (round 4 E4 review r2) the living hulls' visuals begin the new life too (beginActorLife -> resetDestroyed): no thrown
  // band, no damaged weapon. Before, e5 (alive and hidden at the restart) and the own hull kept the abandoned battle's
  // thrown tracks and e5 its damaged gun while their modules read whole (only a wreck's visual was reset)
  const looks = [['e5', e5], ['me', own]].filter(([, actor]) => actor.visual.thrown.size || actor.visual.weaponDamage.size)
    .map(([id, actor]) => `${id}: ${[...actor.visual.thrown].map((band) => `${band} thrown`).concat([...actor.visual.weaponDamage].map(([module, state]) => `${module} ${state}`)).join(', ')}`);
  if (looks.length) wrong.push(`presentation: the living hulls' visuals kept the abandoned battle's module damage after the restart (${looks.join('; ')})`);
  // and the audio's module states are the restarted battle's (audioEngine.ts resetBattlePlay at the restart): the own hull's
  // right track thrown again is a new break. Before, the abandoned battle's 'red' stood, so it was no change: unheard
  const ownBreakAgain = mark(probe);
  told('me', 'trackR', 'red');
  hear(3);
  const breaks = count(since(ownBreakAgain, probe), 'track_break');
  if (breaks !== 1) wrong.push(`audio: the own hull's track thrown in the restarted battle sounded ${breaks} times (its abandoned battle's break was still the audio's state)`);
  presentation.applyEvent({ kind: 'match_ended', payload: { result: 'alpha', reason: 'time' } }, { own: false, feedbackPredicted: false });
  const endRow = ended[0]?.roster?.find((entry) => entry.id === 'e1');
  if (endRow?.alive !== true) wrong.push(`presentation: battle:ended's roster reports e1 ${endRow ? 'dead' : 'missing'} after the restart (the report marks it dead again)`);
  presentation.dispose();
}

// ---- 6. (round 7 merge review r1) the crew's procedure starts its battle over at the restart too
{
  const ctx = namedContext();
  const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  const bus = createBus();
  audio.bindBus(bus);
  audio.resume();
  const probe = probeOf();
  const me = tank('me', { isPlayer: true });
  const foe = tank('foe', { specId: 'leo2a4', nation: 'Germany', z: 200, team: 'enemy' });
  // (round 8 Y11) the crew names only what the player sees (round 8 Y3 s1-02: the page's visibility rule,
  // src/game/playerVisibility.ts, handed to update() as main's listener pose does), so the player's view is this case's
  // input: the foe is seen from its sighting until the restart, which moves the field and hides it again
  const seen = new Set();
  const visibleToUs = (hull) => hull.id === 'me' || seen.has(hull.id);
  const frame = (dt = 1 / 30) => { ctx.advance(dt); audio.update(dt, listener, [me, foe], [], visibleToUs); };
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(['t72b3m_2022', 'leo2a4']);
  await probe.libraryIdle();
  for (let i = 0; i < 10; i++) frame();
  bus.emit('battle:rollout', {});
  for (let i = 0; i < 5; i++) frame();
  // our side sees the foe (the event's team is the spotting side); its smoke launcher fires beside it, 198 m from us (a
  // screen's source is its launcher: [vehicle, x, y, z]; born is the battle's sim clock), and the crew's call is asked
  const spot = () => { seen.add('foe'); bus.emit('tank:spotted', { id: 'foe', team: 'player', spotterId: 'me' }); frame(); };
  const smokeCalls = (born) => {
    const last = probe.sayLog.at(-1);
    bus.emit('auxiliary:smokeScreens', { screens: [{ born, x: 2, y: 2, z: 196, source: ['leo2a4', 1, 2, 198] }] });
    for (let i = 0; i < 5; i++) frame();
    return probe.sayLog.slice(last ? probe.sayLog.lastIndexOf(last) + 1 : 0).filter((entry) => entry.id === 'enemy_smoke').length;
  };
  spot();
  assert.equal(smokeCalls(90), 1, 'setup: the abandoned battle\'s enemy smoke, 90 s in beside the spotted foe, is called');
  // the restart: the restarted battle's sim clock starts at 0; our side sees the foe again and it pops smoke 10 s in
  seen.clear();
  bus.emit('battle:restarted', RESTART);
  for (let i = 0; i < 10; i++) frame();
  spot();
  const earlier = smokeCalls(10);
  if (earlier !== 1) wrong.push(`audio: the crew called the restarted battle's enemy smoke 10 s in ${earlier} times (once; the abandoned battle's screen at 90 s was still its watermark)`);
  // another restart: no one on our side has seen the foe since, so smoke beside it is no enemy the crew can name
  seen.clear();
  bus.emit('battle:restarted', { battleRestarts: 2 });
  for (let i = 0; i < 10; i++) frame();
  const unseen = smokeCalls(200);
  if (unseen !== 0) wrong.push(`audio: the crew called smoke beside a foe no one on its side has spotted since the restart ${unseen} times (the abandoned battle's spotted set stood)`);
  // control: once our side sees the foe in this battle, its next screen is called
  spot();
  assert.equal(smokeCalls(210), 1, 'control: smoke beside the foe spotted since the restart is called');
}

// ---- 7. (round 7 merge review r2) where a carrier's drone was last heard is the abandoned battle's too
{
  const ctx = namedContext();
  const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  const bus = createBus();
  audio.bindBus(bus);
  audio.resume();
  const probe = probeOf();
  const me = tank('me', { isPlayer: true });
  const foe = tank('foe', { specId: 'leo2a4', nation: 'Germany', z: 200, team: 'enemy' });
  // the foe's drone in flight is a shell (tracer 'DRONE', its carrier the shooter), 160 m from us and 40 m up
  const drone = { id: 901, shooterId: 'foe', pos: { x: 60, y: 40, z: 150 }, vel: { x: 0, y: 0, z: 0 }, spec: { tracer: 'DRONE' }, dead: false };
  const frame = (shells = []) => { ctx.advance(1 / 30); audio.update(1 / 30, listener, [me, foe], shells); };
  const frames = (n, shells) => { for (let i = 0; i < n; i++) frame(shells); };
  // an ally shoots the foe's drone down: 'drone:down' names its carrier, and the engine plays its breakup where that
  // carrier's drone was last heard in flight (soundLog's 'drone:down' says whether it knew a place)
  const down = () => {
    const at = mark(probe);
    bus.emit('drone:down', { id: 'foe', killerId: 'ally' });
    frames(3);
    return { heard: probe.soundLog.filter((entry) => entry.type === 'drone:down').at(-1)?.heard, plays: count(since(at, probe), 'drone_shot_down') };
  };
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(['t72b3m_2022', 'leo2a4']);
  await probe.libraryIdle();
  frames(10);
  bus.emit('battle:rollout', {});
  frames(5);
  // the abandoned battle: the foe's drone flies in our hearing (its first flight warms the aerial set), then falls
  frames(10, [drone]);
  await probe.libraryIdle();
  frames(10, [drone]);
  const abandoned = down();
  assert.ok(abandoned.heard === true && abandoned.plays === 1, `setup: the abandoned battle's drone shot down breaks up where it was heard (${JSON.stringify(abandoned)})`);
  // the restart: the restarted battle has not heard the foe's drone fly, so its 'drone:down' has nowhere to play
  bus.emit('battle:restarted', RESTART);
  frames(60);
  const stale = down();
  if (stale.heard !== false || stale.plays !== 0) wrong.push(`audio: a drone shot down in the restarted battle that this seat never heard fly broke up at the abandoned battle's last drone position (${JSON.stringify(stale)}; a new battle plays nothing)`);
  // control: once the restarted battle's drone is heard in flight, its fall is heard
  frames(10, [drone]);
  const heard = down();
  assert.ok(heard.heard === true && heard.plays === 1, `control: the restarted battle's drone heard in flight breaks up when shot down (${JSON.stringify(heard)})`);
  // control: a new battle (the phase edge) has heard no drone fly either
  bus.emit('phase:change', { phase: 'battle' });
  frames(60);
  const fresh = down();
  assert.ok(fresh.heard === false && fresh.plays === 0, `control: a new battle's drone:down for a drone it never heard fly plays nothing (${JSON.stringify(fresh)})`);
}

if (wrong.length) {
  console.error(`battleRestartLives: a battle restart left per-life state of the abandoned battle:\n  ${wrong.join('\n  ')}`);
  assert.fail('a battle restart is a new life for every hull in every per-life listener');
}
console.log('battleRestartLives: a battle restart gives every hull a new life in the killcam (the dead seat\'s chase ends, an observer\'s stays), the audio engine (a hidden hull\'s next death heard, the old alarm and wrecks gone), the service record, the presentation\'s own actors (a hidden hull alive again for the roster, the side counts, the prediction and the end roster), the crew\'s procedure (its smoke watermark and spotted set start over), and where a drone was last heard (the abandoned battle\'s drone breaks up nowhere) PASS');
