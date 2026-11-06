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
//      again in the restarted battle was never fed nor counted.
// Cases 1-4 fail on the merged head before that fix (b598626c30) and pass now.
// Review r2: the presentation's own actors kept the abandoned battle's deaths. A row writes a hull's life, a wreck is
// sent to every seat and a live hull this seat does not spot is not, so a hull that died in the abandoned battle and is
// hidden in the restarted one read destroyed after the restart:
//   5. on the real presentation and audio engine sharing one bus: the hidden hulls read destroyed, stayed in game.tanks
//      and dead in game.rosterTanks, the own prediction collided with their old wrecks, battle:ended's roster reported
//      them dead, and the crew, whose network side counts read that roster (main.ts getTeamRoster), called "last enemy"
//      at the restart with five enemies alive and hidden (restartLives had re-armed the call). It fails on 20a8d0d793.
//   1 (review r2): the killcam's restart listener is called from the frame pump, and a replay release that throws in
//      cancel() (rethrown by design, round 3 A9) left it, dropping the frame; now it is reported and the chase still ends.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { Scene, PerspectiveCamera, Vector3 } from 'three';
import { BattleKillLedger } from '../../game/battleEventStats.ts';
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

// ---- 4. the HUD's and the battle report's kill ledgers: a hull that died in the abandoned battle is fed and counted again
{
  const hud = await readFile(new URL('../../ui/hud.ts', import.meta.url), 'utf8');
  const handler = (source, opener) => {
    const start = source.indexOf(opener);
    return start < 0 ? null : stripTypeScriptTypes(source.slice(start, source.indexOf('\n  });', start) + 6));
  };
  const listeners = {};
  const hudLedger = new BattleKillLedger();
  const fed = [];
  const spotById = new Map([['foe', { vis: false, ever: true, lastX: 10, lastZ: 20 }]]);
  const calls = [];
  const destroyed = handler(hud, "  on('tank:destroyed',");
  const restarted = handler(hud, "  on('battle:restarted',");
  if (!restarted) wrong.push('hud: no listener hears the restart');
  else {
    for (const source of [destroyed, restarted]) {
      new Function('on', 'killLedger', 'teamById', 'spotById', 'pushKill', 'reviveCountdown', 'playerId', 'resetConsumableTray', source)(
        (name, fn) => { listeners[name] = fn; }, hudLedger, new Map([['foe', 'enemy'], ['me', 'player']]), spotById,
        (p) => fed.push(p.id), { onDestroyed() {}, revived() { calls.push('revived'); } }, 'me', () => calls.push('tray'));
    }
    listeners['tank:destroyed']({ id: 'foe', killerId: 'me' });
    listeners['battle:restarted'](RESTART);
    listeners['tank:destroyed']({ id: 'foe', killerId: 'me' });
    if (fed.length !== 2) wrong.push(`hud: the kill feed showed the foe's deaths ${fed.length} times over both battles (twice)`);
    if (hudLedger.count('me') !== 2) wrong.push(`hud: the seat's kills count ${hudLedger.count('me')} (both battles' deaths: 2)`);
    if (spotById.size) wrong.push('hud: the abandoned battle\'s contact memory outlived the restart');
    if (calls.join() !== 'revived,tray') wrong.push(`hud: the seat's revive count and consumable tray were not its fresh hull's (${calls.join() || 'nothing'})`);
  }
  const shotInfo = await readFile(new URL('../../ui/shotInfo.ts', import.meta.url), 'utf8');
  const reportRestart = handler(shotInfo, "  bus.on('battle:restarted',");
  if (!reportRestart) wrong.push('shotInfo: the battle report hears no restart');
  else {
    const reportLedger = new BattleKillLedger();
    reportLedger.record('foe', 'me', 'enemy', 'player');
    const rows = new Map([['foe', { dead: true, deaths: 1 }], ['me', { dead: false, deaths: 0 }]]);
    let onRestart = null;
    new Function('bus', 'killLedger', 'combatants', 'recordCombatantRevived', reportRestart)(
      { on: (name, fn) => { if (name === 'battle:restarted') onRestart = fn; } }, reportLedger, rows, (row) => { row.dead = false; });
    onRestart(RESTART);
    if (rows.get('foe').dead) wrong.push('shotInfo: the foe destroyed in the abandoned battle is still dead in the report');
    if (rows.get('foe').deaths !== 1) wrong.push('shotInfo: the restart rewrote a death count');
    if (!reportLedger.record('foe', 'me', 'enemy', 'player')) wrong.push('shotInfo: the restarted battle\'s death of the foe is refused by the report\'s ledger');
  }
}

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
    createTankVisual: () => ({ root: { position: new Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, recoilKick() { return null; },
      gunMuzzleWorld(out) { return out.set(0, 2, 0); }, gunDirWorld(out) { return out.set(0, 0, 1); }, stripEra() {}, resetEra() {},
      setDestroyed() {}, resetDestroyed() {}, dispose() {} }),
    prepareVisualTextures: async () => {}, clearVehicleDecals: () => {}, camoFor: () => 'summer', clock: () => 1000,
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
  presentation.applyEvent({ kind: 'match_ended', payload: { result: 'alpha', reason: 'time' } }, { own: false, feedbackPredicted: false });
  const endRow = ended[0]?.roster?.find((entry) => entry.id === 'e1');
  if (endRow?.alive !== true) wrong.push(`presentation: battle:ended's roster reports e1 ${endRow ? 'dead' : 'missing'} after the restart (the report marks it dead again)`);
  presentation.dispose();
}

if (wrong.length) {
  console.error(`battleRestartLives: a battle restart left per-life state of the abandoned battle:\n  ${wrong.join('\n  ')}`);
  assert.fail('a battle restart is a new life for every hull in every per-life listener');
}
console.log('battleRestartLives: a battle restart gives every hull a new life in the killcam (the dead seat\'s chase ends, an observer\'s stays), the audio engine (a hidden hull\'s next death heard, the old alarm and wrecks gone), the service record, the HUD\'s and report\'s kill ledgers, and the presentation\'s own actors (a hidden hull alive again for the roster, the side counts, the prediction and the end roster) PASS');
