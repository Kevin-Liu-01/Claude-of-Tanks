// battleOutcome.selftest.mjs — leaving a battle early is no loss (leave-no-loss-276; Kevin 2026-11-24: "leaving battles
// early should not count as a loss"). Copyright © 2026 Kevin B. Liu.
//
// The cause it guards: death-flow-275 R6's leave path sent `battle:ended` with result 'defeat', and every record reader
// (profile.ts, serviceRecord.ts) turned a result it did not know into a defeat too. Now a left battle is the closed set's
// 'left' (game/battleOutcome.ts): the history stands it as "Left" and no total hears it.
//
//   1. the closed set: battleOutcomeOf refuses what is outside it (null, never 'defeat'); outcomeCounts says only the
//      three verdicts count;
//   2. a solo Leave mid-battle (the real game/state.ts recordBattleLeft) and a room Leave mid-battle (the real
//      mp/presentation battlePresentation recordLeft) reach the real profile, service record and campaign recorders: the
//      battles, wins, losses, draws, win rate, kills, damage, bests, medals, achievements and places are unchanged, the
//      Frontline ladder takes no attempt, and both histories' newest row reads 'left';
//   3. the negative control: R6's leave-as-defeat, planted on the same recorders, fails the same check;
//   4. every outcome has its label in every catalog (the Garage card and the service record read garage.record.<outcome>),
//      and the Esc menu no longer says a Leave counts as a defeat.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const { BATTLE_OUTCOMES, battleOutcomeOf, outcomeCounts } = await import('./battleOutcome.ts');
const { installBattleRecords, getPlayerRecord } = await import('./profile.ts');
const { installServiceRecord, getServiceRecord } = await import('./serviceRecord.ts');
const { installCampaignProgress, readCampaignRecord } = await import('./campaignProgress.ts');
const { recordBattleLeft } = await import('./state.ts');
const { createBattlePresentation } = await import('../mp/presentation/index.ts');
const { TEAM, PHASE, VERDICT, zeroEntityRow, quantizePosition } = await import('../mp/wire/index.ts');
const { createEntitySample } = await import('../mp/match/interpolation.ts');
const { createTankState } = await import('../sim/movement.ts');
const { getSpec } = await import('../vehicles/specs.ts');

// ---- 1. the closed set
assert.deepEqual([...BATTLE_OUTCOMES], ['victory', 'defeat', 'draw', 'left']);
for (const outcome of BATTLE_OUTCOMES) assert.equal(battleOutcomeOf(outcome), outcome);
for (const stray of ['win', 'loss', 'unknown', '', null, undefined, 3, {}]) {
  assert.equal(battleOutcomeOf(stray), null, `${String(stray)} is no outcome, never a defeat`);
}
assert.deepEqual(BATTLE_OUTCOMES.filter(outcomeCounts), ['victory', 'defeat', 'draw'], 'a left battle counts toward no total');

// ---- the recorders, on one bus
function makeBus() {
  const handlers = new Map();
  return {
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); return () => {}; },
    emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
  };
}
const world = { mode: 'standard', player: 'me' };
const bus = makeBus();
installBattleRecords(bus);
installServiceRecord(bus, {
  playerId: () => world.player, playerTeam: () => 'player', teamOf: (id) => (id === world.player ? 'player' : 'enemy'),
  gameMode: () => world.mode, clockS: () => 30, playerHpFraction: () => 0.6, playerMaxHp: () => 2000, playerNation: () => 'Germany',
  playerAerialKind: () => null, respawns: () => false, playerObjectiveTeam: () => null,
});
installCampaignProgress(bus, globalThis.localStorage);

/** One recorded battle (a verdict) so every total starts above zero. */
function fight(result, mode = 'standard') {
  world.mode = mode;
  bus.emit('ui:battleStart', { playerId: world.player, specId: 'm1a1_abrams_hc', mapId: 'desert', gameMode: mode });
  bus.emit('phase:change', { phase: 'battle' });
  bus.emit('shell:hit', { attackerId: world.player, targetId: 'foe', damage: 700, hpRemoved: 700 });
  bus.emit('tank:destroyed', { killerId: world.player, id: 'foe' });
}
fight('victory');
bus.emit('battle:ended', { result: 'victory', reason: 'elimination', durationS: 90, mapId: 'desert', gameMode: 'standard',
  roster: [{ id: 'me', team: 'player', alive: true, isPlayer: true }, { id: 'foe', team: 'enemy', alive: false }] });
bus.emit('phase:change', { phase: 'garage' });
fight('defeat');
bus.emit('battle:ended', { result: 'defeat', reason: 'elimination', durationS: 60, mapId: 'desert', gameMode: 'standard',
  roster: [{ id: 'me', team: 'player', alive: false, isPlayer: true }, { id: 'foe', team: 'enemy', alive: false }] });
bus.emit('phase:change', { phase: 'garage' });

/** Every total a left battle must leave alone. */
function totals() {
  const profile = getPlayerRecord(), service = getServiceRecord(), campaign = readCampaignRecord(globalThis.localStorage);
  return {
    matches: profile.matches, wins: profile.wins, losses: profile.losses, draws: profile.draws,
    winRate: profile.matches ? profile.wins / profile.matches : 0, kills: profile.kills, damage: profile.damage,
    bestDamage: profile.bestDamage, stats: { ...service.stats },
    medals: Object.fromEntries(Object.entries(service.medals).map(([id, tally]) => [id, tally.count])),
    achievements: service.achievements.map((a) => [a.def.id, a.tier]),
    achievementValues: service.achievements.map((a) => a.value),
    places: (({ maps = [], vehicles = [], nations = [], modes = [] }) => [maps, vehicles, nations, modes].map((list) => list.length).join('/'))(JSON.parse(store.get('cot.service.v1') ?? '{}')),
    frontline: JSON.stringify(campaign.frontline),
  };
}
const newest = () => [getPlayerRecord().recentBattles[0]?.result, getServiceRecord().history[0]?.result];
/** What a leave did wrong: each total it moved, and a history that does not read 'left'. */
function leaveFaults(before, label) {
  const after = totals(), faults = [];
  for (const key of Object.keys(before)) {
    if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) faults.push(`${label}: ${key} ${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`);
  }
  const [profileRow, serviceRow] = newest();
  if (profileRow !== 'left') faults.push(`${label}: the career history reads ${profileRow}`);
  if (serviceRow !== 'left') faults.push(`${label}: the service history reads ${serviceRow}`);
  return faults;
}

// ---- 2a. a solo Leave mid-battle: the real recordBattleLeft
function soloGame(mode) {
  const tank = (id, team) => ({ id, specId: 'm1a1_abrams_hc', spec: { name: 'M1A1' }, team, combat: { destroyed: false } });
  const me = tank('me', 'player');
  return {
    result: null, resultReason: null, phase: 'battle', timeS: 41, mapId: 'desert', gameMode: mode, campaignOperationId: null,
    ruleset: { records: true, watch: false, couch: false, timeLimitS: 600 }, matchModeState: null, player: me,
    tanks: [me, tank('foe', 'enemy'), tank('ally', 'player')], brains: null, jev: null, watch: null,
  };
}
for (const mode of ['standard', 'frontline_assault']) {
  fight('left', mode);
  const before = totals();
  const game = soloGame(mode);
  assert.equal(recordBattleLeft(game, bus), true, `${mode}: a solo Leave before the verdict is recorded`);
  assert.equal(game.result, null, `${mode}: the battle itself takes no verdict`);
  assert.deepEqual(leaveFaults(before, `solo ${mode}`), [], `${mode}: a solo Leave moves no total and reads "Left"`);
  bus.emit('phase:change', { phase: 'garage' });
}
// a practice battle records nothing at all
assert.equal(recordBattleLeft({ ...soloGame('standard'), ruleset: { records: false } }, bus), false);

// ---- 2b. a room Leave mid-battle: the real presentation's recordLeft
const roomEvents = [];
const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0,
  result: null, resultReason: null, mapId: 'desert' };
const visual = () => ({
  root: { position: new Vector3(), userData: {} }, visible: true, setVisible() {}, syncFromState() {}, recoilKick: () => 1,
  gunMuzzleWorld: (out) => out.set(0, 3, 0), gunDirWorld: (out) => out.set(0, 0, 1), stripEra() {}, resetEra() {},
  setDestroyed() {}, resetDestroyed() {}, dispose() {},
});
const presentation = createBattlePresentation({
  engineCtx: { scene: { add() {} }, anisotropy: 1 }, game,
  bus: { emit(type, payload) { roomEvents.push({ type, payload }); bus.emit(type, payload); } },
  worldCollision: { heightField: { getHeightAt: () => 0, getHeightAtFast: () => 0, getGroundType: () => 'hard' }, getObstacles: () => [], crushObstacle() {} },
  createTankVisual: visual, prepareVisualTextures: async () => {}, clearVehicleDecals() {},
  camoFor: () => 'summer', clock: () => 1000, verdictGraceMs: 500,
});
await presentation.applyRoster([
  { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a1_abrams_hc' },
  { entityId: 2, seat: 1, team: TEAM.BRAVO, bot: false, connected: true, playerId: 'foe', name: 'Foe', specId: 'm1a1_abrams_hc' },
], { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'desert', mode: 'standard', rulesetJson: '{}' });
const spec = getSpec('m1a1_abrams_hc');
const foe = createEntitySample(2);
Object.assign(foe, { x: -40, y: 1.2, z: 60, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, hp: 1500, maxHp: 2000, reloadS: 0,
  reloadTotalS: 6, reloadKind: 'shell', gunReloadS: 0, gunReloadTotalS: 6, gunReloadKind: 'shell', ammo0: 20, ammo1: 4, ammo2: 2,
  flags: 0, snapped: false, eraSpent: [] });
presentation.applyFrame({
  tick: 120, renderTimeMs: 2000, entities: [foe], shells: [],
  meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 30_000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
  modeStateJson: null, destroyed: [], destructibleRevision: 0,
  viewer: { entityId: 1, playerId: 'me', state: createTankState(spec, new Vector3(10, 1.2, -20), 0),
    row: { ...zeroEntityRow(1), x: quantizePosition(10), y: 1200, z: quantizePosition(-20), hp: 1800, maxHp: 2000, reload: 0, reloadTotal: 3000,
      magazineRounds: 0, magazineCapacity: 0, ammo0: 12, ammo1: 6, ammo2: 0, flags: 0 },
    viewer: { entityId: 1, modules: new Array(15).fill(0), crewBits: 0, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000,
      modeGravityScale: 1000, movementVersion: 0, movementFlags: 0, movementValues: [] },
    authorityTick: 118, authorityReceivedAtMs: 990, predictedShot: null },
  events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
});
assert.equal(game.player?.id, 'me', 'the room battle is mounted under its seat');
fight('left');
const beforeRoom = totals();
assert.equal(presentation.recordLeft(), true, 'a room Leave before the verdict is recorded');
const roomEnded = roomEvents.filter((event) => event.type === 'battle:ended');
assert.equal(roomEnded.length, 1);
assert.equal(roomEnded[0].payload.result, 'left', 'the room sends the closed set\'s left, never a defeat');
assert.equal(game.result, null, 'the seat\'s own verdict is untouched: the team plays on');
assert.deepEqual(leaveFaults(beforeRoom, 'room'), [], 'a room Leave moves no total and reads "Left"');
bus.emit('phase:change', { phase: 'garage' });

// ---- 3. the negative control: R6's leave-as-defeat, planted on the same recorders, fails the same check
fight('left');
const beforePlant = totals();
bus.emit('battle:ended', { result: 'defeat', reason: 'left', left: true, durationS: 20, mapId: 'desert', gameMode: 'standard',
  roster: [{ id: 'me', team: 'player', alive: true, isPlayer: true }] });
const planted = leaveFaults(beforePlant, 'planted');
for (const moved of ['matches', 'losses', 'winRate', 'kills', 'damage', 'stats', 'career history reads defeat', 'service history reads defeat']) {
  assert.ok(planted.some((fault) => fault.includes(moved)), `the planted leave-as-defeat is caught: ${moved} (${planted.join('; ')})`);
}

// ---- 4. the labels, and the Esc menu's words
for (const locale of ['en-US', 'zh-CN', 'es', 'ja', 'de', 'pt-BR', 'ru']) {
  const catalog = JSON.parse(readFileSync(new URL(`../ui/i18nCatalog.${locale}.json`, import.meta.url), 'utf8'));
  for (const outcome of BATTLE_OUTCOMES) assert.ok(catalog[`garage.record.${outcome}`], `${locale}: garage.record.${outcome}`);
  assert.equal(catalog['settings.leaveDefeat'], undefined, `${locale}: no Leave says it counts as a defeat`);
}
const settings = readFileSync(new URL('../ui/settings.ts', import.meta.url), 'utf8');
assert.ok(!settings.includes('leaveCountsAsDefeat'), 'the Esc menu has no leave-as-defeat label');

console.log('battleOutcome.selftest: the closed set (no fallthrough to a defeat), a solo and a room Leave moving no total and reading "Left" (standard and the Frontline ladder), the planted leave-as-defeat caught, the labels in seven catalogs PASS');
