// Proof (implicit state machine audit, round 4 E6b, 2026-11-06): a network battle restart opens a new battle for every
// per-battle record. Decision (the session's, under the owner's standing "I approve everything: decide, act"; Kevin may
// overrule): the HUD's kill counts and the battle report start over at the restart, and the service record and the
// career record take only the battle that ends, so the abandoned battle adds nothing. Every owner resets on the one
// restart edge the presentation tells once ('battle:restarted', battlePresentation.ts resetSettledWorld; battleRestartReset
// case 6 pins once), through the reset its battle start runs:
//   1. hud.ts (resetBattleRecord, also beginBattle's): the ear rows' kill counts, the kill feed and ribbon, the contact
//      memory and the sixth sense on the restarted clock. Before, the kill ledger only re-armed its dead (round 3), so the
//      ear rows counted the abandoned battle's kills into the restarted one's, its feed lines stayed, and its sixth-sense
//      fuse lit the lamp at its own time on the restarted clock. A hull that died in the abandoned battle and dies again is
//      fed once and counted, and the seat's revive count is its fresh hull's (round 3's case 4 of battleRestartLives, now
//      on the real HUD);
//   2. shotInfo.ts (reset(), also 'ui:battleStart''s): the report's shots, hits, damage, kills, deaths and timeline.
//      Before, the report of the battle that ended added the abandoned battle's to its own;
//   3. serviceRecord.ts (begin, also start's): kills, damage, shots and medals of the battle that ends only. Before, its
//      history row and career totals added the abandoned battle's;
//   4. profile.ts (openTally, also 'ui:battleStart''s): the career kills and damage and the battle's row likewise;
//   5. battleResultPresentationRuntime.ts (restart(), main.ts wires it to the edge; the wiring is page code, not run here):
//      the ending's facts and the player's death flow. Before, a death beat pending at the restart played its replay over
//      the restarted battle, a seat whose death cam had run got none when it died again, and a restarted battle that ended
//      on time framed the abandoned battle's last wreck.
// Cases 1-2 drive the real battle HUD (initHud) with its own report and end screen over the recording DOM; 3-4 the real
// installers on the same bus; 5 the real runtime. Each fails on 0edd0e1ab5 and passes now.
import { created } from '../../ui/hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { getSpec } from '../../vehicles/specs.ts';
import { createCombatState } from '../../sim/damage.ts';
import { createSpecialActionState } from '../../sim/specialActionPolicy.ts';
import { createBus } from '../../game/stateCore.ts';
import { initHud } from '../../ui/hud.ts';
import { installServiceRecord, getServiceRecord } from '../../game/serviceRecord.ts';
import { installBattleRecords, getLastBattleRecord, getPlayerRecord } from '../../game/profile.ts';
import { createBattleResultPresentationRuntime } from '../../game/battleResultPresentationRuntime.ts';
import { createBattleEndingDirector } from '../../game/battleEnding.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';

const SPEC = 'm1a1_abrams_hc';
const RESTART = { battleRestarts: 1 };
const wrong = [];

await ensureAuthorityFleet([SPEC]);
const bus = createBus();
const hud = initHud(bus);
installServiceRecord(bus, {
  playerId: () => 'me', playerTeam: () => 'player', teamOf: (id) => (id.startsWith('e') ? 'enemy' : 'player'), gameMode: () => 'standard',
  clockS: () => timeS, playerHpFraction: () => 1, playerMaxHp: () => 2000, playerNation: () => 'USA',
  playerAerialKind: () => null, respawns: () => false, playerObjectiveTeam: () => null,
});
installBattleRecords(bus);
const spec = getSpec(SPEC);
const tank = (id, team, isPlayer = false) => ({
  id, team, isPlayer, displayName: id, spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
  state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
  visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } },
});
const me = tank('me', 'player', true);
const tanks = [me, tank('a1', 'player'), tank('e1', 'enemy'), tank('e2', 'enemy'), tank('e3', 'enemy')];
const aim = { singleReticle: false, point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
let timeS = 0;
const frame = () => { timeS += 1 / 60; hud.update({ timeS, mode: 'battle', player: me, tanks, spotting: { isSpotted: () => true }, aim, camera: null }); };
const fire = (shellId) => bus.emit('shell:fired', { shooterId: 'me', isPlayer: true, shellId, caliberMm: 120, shellType: 'APFSDS', timeS });
const hit = (shellId, targetId, damage, destroyed = false) => bus.emit('shell:hit', {
  attackerId: 'me', targetId, shellId, damage, hpRemoved: damage, kind: 'pen', destroyed, targetName: targetId, timeS });
const kill = (id) => {
  tanks.find((entity) => entity.id === id).combat.destroyed = true;
  bus.emit('tank:destroyed', { id, specId: SPEC, killerId: 'me', cause: 'shot', pos: [0, 0, 0], timeS });
};
const earKills = (nick) => {
  const row = created.find((element) => element.classes.has('cot-er') && element.parentNode && element.querySelector('.nick').textContent === nick);
  const text = row?.querySelector('.kills').textContent;
  return text ? Number(text) : 0;
};

// ---- the abandoned battle: three rounds, two kills (2600 hull points)
bus.emit('ui:battleStart', { playerId: 'me', specId: SPEC, mapId: 'steppe' });
hud.setMode('battle');
hud.setPreBattleRules(matchRulesetFor('capture_the_flag')); // a mode that revives: the seat's revive count shows
bus.emit('phase:change', { phase: 'battle' });
frame();
timeS = 30;
fire(1); hit(1, 'e1', 600);
fire(2); hit(2, 'e1', 1400, true); kill('e1');
fire(3); hit(3, 'e2', 600, true); kill('e2');
bus.emit('player:spotted', { timeS }); // the sixth sense's fuse: the lamp would light 3 s later, at 33 s
frame();
assert.equal(earKills('me'), 2, 'setup: the ear row counts the abandoned battle\'s two kills');
// and the seat dies: its revive count shows
me.combat.destroyed = true;
bus.emit('tank:destroyed', { id: 'me', specId: SPEC, killerId: 'e3', cause: 'shot', pos: [0, 0, 0], timeS });
frame();
const revive = created.find((element) => element.classes.has('cot-revive'));
assert.equal(revive.classes.has('on'), true, 'setup: the dead seat\'s revive count shows');

// ---- the restart: every hull at its spawn, the battle's clock at 0
for (const entity of tanks) { entity.combat = createCombatState(spec); }
bus.emit('battle:restarted', RESTART);
timeS = 0;
frame();
if (revive.classes.has('on')) wrong.push('hud: the seat alive again at its spawn still shows its revive count');
// ---- the restarted battle: one round, one kill (2000 hull points) of e1, which died in the abandoned battle too
const feedBefore = created.filter((element) => element.classes.has('cot-kf')).length;
timeS = 20;
fire(4); hit(4, 'e1', 2000, true); kill('e1');
frame();
// 1. the HUD
const counted = earKills('me');
if (counted !== 1) wrong.push(`hud: the ear row counts ${counted} kills for the restarted battle's one (the abandoned battle's added)`);
const fed = created.filter((element) => element.classes.has('cot-kf')).slice(feedBefore);
if (fed.length !== 1) wrong.push(`hud: the kill feed showed e1's death in the restarted battle ${fed.length} times (once: it died in the abandoned battle too)`);
const lingering = created.filter((element) => element.classes.has('cot-kf') && !fed.includes(element) && element.parentNode?.children.includes(element));
if (lingering.length) wrong.push(`hud: the kill feed still lists ${lingering.length} of the abandoned battle's kills`);
// the restarted battle's clock passes the abandoned battle's fuse time
const sixth = created.find((element) => element.classes.has('cot-sixth'));
while (timeS < 35) { timeS += 0.25; hud.update({ timeS, mode: 'battle', player: me, tanks, spotting: { isSpotted: () => true }, aim, camera: null }); }
if (sixth.classes.has('on')) wrong.push('hud: the abandoned battle\'s sixth-sense fuse lit the lamp 33 s into the restarted battle');
// the battle ends: the report, the service record, the career record
const roster = tanks.map((entity) => ({ id: entity.id, specId: SPEC, vehicle: spec.name, team: entity.team, alive: !entity.combat.destroyed, isPlayer: entity.isPlayer }));
bus.emit('battle:ended', { result: 'victory', reason: 'elimination', timeS: 60, durationS: 60, map: 'steppe', mapId: 'steppe',
  gameMode: 'standard', network: true, roster });
await new Promise((resolve) => setTimeout(resolve, 700)); // the report gate's no-replay flush
// 2. the battle report
const report = created.find((element) => element.classes.has('cot-si-stats'));
assert.ok(report?.dataset.banner, 'setup: the report rendered');
if (report.dataset.fired !== '1') wrong.push(`report: ${report.dataset.fired} rounds fired for the restarted battle's one`);
if (report.dataset.hits !== '1') wrong.push(`report: ${report.dataset.hits} hits for the restarted battle's one`);
const score = created.filter((element) => element.classes.has('es-score')).at(-1);
const ownKills = /<span class="o">([^<]*)<\/span>/.exec(score?.innerHTML ?? '')?.[1];
if (ownKills !== '1') wrong.push(`report: the score counts ${ownKills} kills for the restarted battle's one`);
// 3. the service record
const row = getServiceRecord().history[0];
if (row?.kills !== 1 || row?.damage !== 2000) wrong.push(`serviceRecord: the battle's row reads ${row?.kills} kills and ${row?.damage} damage (the restarted battle's: 1 and 2000)`);
const career = getServiceRecord().stats;
if (career.kills !== 1 || career.shots !== 1) wrong.push(`serviceRecord: the career totals took ${career.kills} kills and ${career.shots} shots from a battle of 1 and 1`);
// 4. the career record
const last = getLastBattleRecord();
if (last?.kills !== 1 || last?.damage !== 2000) wrong.push(`profile: the battle's record reads ${last?.kills} kills and ${last?.damage} damage (1 and 2000)`);
if (getPlayerRecord().kills !== 1) wrong.push(`profile: the career kills took ${getPlayerRecord().kills} from a battle of 1`);

// ---- 5. the result flow: the ending's facts and the player's death flow (the real runtime; main.ts wires the edge)
{
  const calls = [];
  let wallMs = 1000;
  const player = { combat: { destroyed: false }, state: { pos: { x: 0, y: 0, z: 0 } } };
  const game = { result: null, resultReason: null, gameMode: 'standard', timeS: 10, player, ruleset: { respawnS: null }, matchModeState: null };
  const director = createBattleEndingDirector();
  const runtime = createBattleResultPresentationRuntime({
    game,
    killcam: { lastBeginWallMs: null, playForResult(result) { calls.push(`replay:${result}:${player.combat.destroyed ? 'dead' : 'alive'}`); return false; } },
    rig: { release: () => {}, startDeathCam: () => calls.push('deathCam') },
    veilHud: () => {}, showEndOverlay: () => {}, emitPresented: () => {}, exitPointerLock: () => {}, recordFlow: () => {},
    ending: { director, camera: { begin: () => true, frame() {}, end() {} }, modeState: () => null, emitBeat() {} },
    now: () => wallMs, deathBeatMs: 2600,
  });
  const step = (ms) => { wallMs += ms; runtime.update(); };
  // the abandoned battle: an enemy's wreck at (300, 0, 300), then the player dies; its death beat starts
  runtime.observe('tank:destroyed', { id: 'e9', pos: [300, 0, 300], cause: 'shot' });
  runtime.update();
  player.combat.destroyed = true;
  step(16);
  assert.deepEqual(calls, ['deathCam'], 'setup: the player\'s death starts its death cam and its beat');
  step(1000);
  // the restart, inside the death beat: the player alive at its spawn
  player.combat.destroyed = false;
  runtime.restart?.();
  for (let i = 0; i < 20; i++) step(250);
  const stale = calls.filter((call) => call.startsWith('replay'));
  if (stale.length) wrong.push(`result flow: the abandoned battle's death beat played its replay over the restarted battle (${stale.join(', ')})`);
  if (director.facts.lastDestroyed) wrong.push(`result flow: the restarted battle's ending reads the abandoned battle's last wreck (${director.facts.lastDestroyed.id})`);
  // the restarted battle: the player dies again
  calls.length = 0;
  player.combat.destroyed = true;
  step(16);
  if (!calls.includes('deathCam')) wrong.push('result flow: the player\'s death in the restarted battle got no death cam (the abandoned battle\'s had run)');
}

if (wrong.length) {
  console.error(`battleRestartTallies: a battle restart left the abandoned battle in the restarted battle's records:\n  ${wrong.join('\n  ')}`);
  assert.fail('a battle restart opens a new battle for every per-battle record');
}
console.log('battleRestartTallies: a battle restart opens a new battle for the HUD\'s kill counts, the battle report, the service record, the career record and the result flow (its ending facts and the player\'s death flow) PASS');
