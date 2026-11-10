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
//      fed once and counted, and the seat's revive count, its contact memory and its consumable tray are its fresh hull's
//      (round 3's case 4 of battleRestartLives, all four of its checks, now on the real HUD; review r1: the contact memory
//      read on the minimap, where a hidden enemy's last-seen ghost is drawn, and the tray on its tiles; each fails with its
//      line removed from the HUD's restart listener or resetBattleRecord);
//   2. shotInfo.ts (reset(), also 'ui:battleStart''s): the report's shots, hits, damage, kills, deaths and timeline.
//      Before, the report of the battle that ended added the abandoned battle's to its own;
//   3. serviceRecord.ts (begin, also start's): kills, damage, shots and medals of the battle that ends only. Before, its
//      history row and career totals added the abandoned battle's;
//   4. profile.ts (openTally, also 'ui:battleStart''s): the career kills and damage and the battle's row likewise;
//   5. battleResultPresentationRuntime.ts (startOver, also reset()'s; review r1: it hears the edge on its own bus, as the
//      HUD and the records do, so the receipt drives the page's path): the ending's facts and the player's death flow.
//      Before, a death beat pending at the restart played its replay over the restarted battle, a seat whose death cam
//      had run got none when it died again, and a restarted battle that ended on time framed the abandoned battle's last
//      wreck. On the real camera rig and the real killcam (review r1, the completeness lens; review r2): a seat whose death
//      orbit ran gets its player's camera back at the restart, and a seat whose death replay was on screen its HUD and its
//      camera, whichever of the killcam and the runtime hears the edge first. The killcam's restart listener cancels the
//      replay, and a cancelled replay runs no onDone and keeps the rig's external pin (killcam.ts cancel -> finish(false)
//      -> teardown(false)), so the hand-back is the runtime's own. Before, the orbit circled the living hull until the
//      battle ended, and a cancelled replay left a frozen camera and a veiled HUD over the restarted battle (review r1's
//      stand-in killcam ran the replay's end at its cancel, which the real one does not: review r2);
//   6. medalToast.ts (review r1): a medal card the abandoned battle earned (the real service record's live award) is not
//      on screen, nor waiting, in the restarted battle.
// Cases 1-2 drive the real battle HUD (initHud) with its own report and end screen over the recording DOM; 3-4 the real
// installers on the same bus; 5 the real runtime, camera rig and killcam; 6 the real medal toasts. Every case fails on
// 0edd0e1ab5 and passes now: 24 checks fail there (13 in this file's first version, where the revive count passed;
// 22 after review r1 added the medal and camera checks; 24 since review r2's real killcam, whose cancelled replay leaves
// the HUD veiled too). On 2c18dae0db the two restart-in-the-replay flows fail 4 checks (the camera on the replay's pin,
// the HUD veiled).
import { created, resizeObserved, StubElement } from '../../ui/hudDomHarness.test-support.mjs';
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
import { createCameraRig } from '../../engine/cameraRig.ts';
import { createKillCam } from '../../game/killcam.ts';
import { installMedalToasts } from '../../ui/medalToast.ts';
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
const medalSeat = new StubElement('div');
installMedalToasts(bus, medalSeat);
const medalCards = () => medalSeat.children[0]?.children.length ?? 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
// the seat's spotting: every hull in view but the hidden ones
const hidden = new Set();
const spotting = { isSpotted: (id) => !hidden.has(id) };
const frame = () => { timeS += 1 / 60; hud.update({ timeS, mode: 'battle', player: me, tanks, spotting, aim, camera: null }); };
// the minimap's canvas, laid out (uiCanvas sizes its store from the box): its paint draws a hidden enemy's last-seen
// contact as a hollow ghost arrow, the one stroke in that ink (hud.ts drawGhostMarker)
const minimap = created.find((element) => element.classes.has('cot-minimap')).children.find((child) => child.tagName === 'CANVAS');
resizeObserved(minimap, 220, 220);
const minimapOps = minimap.getContext('2d').ops;
const GHOST_INK = '#e5a19b';
const MAP_GROUND = '#0b100e';
/** The minimap's paints from `from` on: whether it repainted, and whether any of them drew a ghost contact. */
const minimapSince = (from) => {
  const ops = minimapOps.slice(from);
  return { painted: ops.some((op) => op.op === 'fillRect' && op.style === MAP_GROUND), ghost: ops.some((op) => op.op === 'stroke' && op.style === GHOST_INK) };
};
/** A frame the minimap repaints in (its cadence is 15 to 30 Hz of wall time: hud.ts updateMinimapIfDue). */
const paintedFrame = async () => { await sleep(80); frame(); };
const tile = (slot) => created.filter((element) => element.classes.has('cot-con'))[slot];
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
// e3 was seen at (180, 0, 140), then hides: the HUD keeps its last-seen contact (the minimap's ghost)
tanks.find((entity) => entity.id === 'e3').state.pos.set(180, 0, 140);
frame();
hidden.add('e3');
const ghostFrom = minimapOps.length;
await paintedFrame();
const abandonedMap = minimapSince(ghostFrom);
assert.ok(abandonedMap.painted && abandonedMap.ghost, `setup: the minimap draws the hidden e3's last-seen contact (${JSON.stringify(abandonedMap)})`);
// a consumable spent in the abandoned battle: its tile empty and cooling (the authority's consumable_used)
bus.emit('ui:consumableUsed', { slot: 0, readyAt: timeS + 60, cooldownS: 60, charges: 0 });
frame();
assert.equal(tile(0).classes.has('empty'), true, 'setup: the spent kit reads empty');
// the abandoned battle's first kill earned a medal live (serviceRecord.ts first_blood): its card is on screen
assert.ok(medalCards() >= 1, 'setup: the abandoned battle\'s medal card shows');
// and the seat dies: its revive count shows
me.combat.destroyed = true;
bus.emit('tank:destroyed', { id: 'me', specId: SPEC, killerId: 'e3', cause: 'shot', pos: [0, 0, 0], timeS });
frame();
const revive = created.find((element) => element.classes.has('cot-revive'));
assert.equal(revive.classes.has('on'), true, 'setup: the dead seat\'s revive count shows');

// ---- the restart: every hull at its spawn, the battle's clock at 0 (e3 alive and still hidden)
for (const entity of tanks) { entity.combat = createCombatState(spec); }
bus.emit('battle:restarted', RESTART);
// 6. the medal toasts
if (medalCards()) wrong.push(`medals: ${medalCards()} card(s) of the abandoned battle's medals still on screen in the restarted battle`);
timeS = 0;
const restartFrom = minimapOps.length;
await paintedFrame();
if (revive.classes.has('on')) wrong.push('hud: the seat alive again at its spawn still shows its revive count');
const restartedMap = minimapSince(restartFrom);
assert.ok(restartedMap.painted, 'setup: the minimap repainted in the restarted battle');
if (restartedMap.ghost) wrong.push('hud: the abandoned battle\'s contact memory outlived the restart (the minimap draws e3 where it was last seen in the abandoned battle)');
if (tile(0).classes.has('empty') || tile(0).classes.has('cooling')) wrong.push('hud: the seat\'s consumable tray is not its fresh hull\'s (the abandoned battle\'s spent kit reads empty or cooling)');
if (medalCards()) wrong.push('medals: a card of the abandoned battle\'s medals entered in the restarted battle');
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
while (timeS < 35) { timeS += 0.25; hud.update({ timeS, mode: 'battle', player: me, tanks, spotting, aim, camera: null }); }
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

// ---- 5. the result flow: the ending's facts, the player's death flow and its camera (the real runtime on its own bus,
// as main.ts builds it, with the real camera rig and the real killcam on the same bus)
const idle = { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false };
/**
 * One seat's result flow. The player dies to a shell, its death beat starts the death orbit, and the beat's replay is
 * the real killcam's (createKillCam: it pins the camera through rig.setExternalPose). `replay`: the restart lands while
 * that replay is on screen (else inside the death beat, before the replay). `killcamFirst`: the killcam hears the edge
 * before the runtime (main.ts binds the lazy killcam's bus after the runtime is built, so the page's order is the
 * runtime first). The killcam's restart listener cancels the replay, and a cancelled replay runs no onDone and leaves
 * the rig's external pin (killcam.ts cancel -> finish(false) -> teardown(false)), so the hand-back is the runtime's.
 */
function resultFlow({ replay, killcamFirst }) {
  const label = `result flow (${replay ? 'restart in the replay' : 'restart in the death beat'}, ${killcamFirst ? 'killcam first' : 'runtime first'})`;
  const flowBus = createBus();
  const calls = [];
  let wallMs = 1000;
  let veiled = false;
  const root = new THREE.Object3D();
  const player = {
    id: 'me', isPlayer: true, team: 'player', spec, specId: SPEC,
    combat: { destroyed: false, crew: {}, modules: {} },
    state: { pos: new THREE.Vector3(), yaw: 0.3, turretYaw: 0, gunPitch: 0, visualPitch: 0, visualRoll: 0 },
    input: { aimPoint: new THREE.Vector3() }, aerial: null,
    visual: {
      root, turretTopWorld: (out) => out.set(0, 2, 0), gunPivotWorld: (out) => out.set(0, 1.7, 0.2),
      isDestroyed: () => player.combat.destroyed, wreckState: () => (player.combat.destroyed ? 'plain' : 'intact'),
      setDestroyed() {}, resetDestroyed() {}, syncFromState() {}, setVisible() {},
    },
  };
  const game = {
    result: null, resultReason: null, gameMode: 'standard', timeS: 10, player, ruleset: { respawnS: null }, matchModeState: null,
    phase: 'battle', tanks: [player], tankById: new Map([['me', player]]),
  };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
  const rig = createCameraRig(camera, { heightField: { getHeightAt: () => 0 }, raycast: () => null, getPlayer: () => player });
  rig.snapArcade(2, 0.3, -0.1);
  const killcam = createKillCam({
    scene: new THREE.Scene(), camera, rig, heightField: { getHeightAt: () => 0 },
    getPlayer: () => player, getGame: () => game, isBattleEntryCovered: () => false,
  });
  if (killcamFirst) killcam.bindBus(flowBus);
  const director = createBattleEndingDirector();
  // the page passes the killcam and the rig themselves; these ports forward to them and count what the runtime asks
  const killcamPort = {
    get lastBeginWallMs() { return killcam.lastBeginWallMs ?? null; },
    playForResult(result, timeS, onDone, options) {
      calls.push(`replay:${result}:${player.combat.destroyed ? 'dead' : 'alive'}`);
      return killcam.playForResult(result, timeS, onDone, options);
    },
  };
  const rigPort = {
    release: () => rig.release(),
    startDeathCam: () => { calls.push('deathCam'); rig.startDeathCam(); },
    endDeathCam: () => rig.endDeathCam?.(),
  };
  const runtime = createBattleResultPresentationRuntime({
    game, bus: flowBus, killcam: killcamPort, rig: rigPort,
    veilHud: (on) => { veiled = on; }, showEndOverlay: () => {}, emitPresented: () => {}, exitPointerLock: () => {}, recordFlow: () => {},
    ending: { director, camera: { begin: () => true, frame() {}, end() {} }, modeState: () => null, emitBeat() {} },
    now: () => wallMs, deathBeatMs: 2600,
  });
  if (!killcamFirst) killcam.bindBus(flowBus);
  const step = (ms) => { wallMs += ms; runtime.update(); rig.update(ms / 1000, idle); };
  // the abandoned battle: an enemy's wreck at (300, 0, 300), then the player dies to a shell; its death beat and orbit start
  runtime.observe('tank:destroyed', { id: 'e9', pos: [300, 0, 300], cause: 'shot' });
  runtime.update();
  player.combat.destroyed = true;
  killcam.onShellHit({
    shellId: null, targetId: 'me', attackerId: 'e9', destroyed: true, timeS: 10, pos: [0, 1, 0], normal: [0, 0, 1],
    localPos: [0, 1, 0], localDir: [0, 0, -1], modulesHit: [], crewHit: [], shellType: 'APFSDS', zone: 'hull',
  }, player);
  step(16);
  assert.equal(rig.cameraOwner, 'death', `setup: ${label}: the player's death starts its death orbit`);
  if (replay) {
    for (let i = 0; i < 12; i++) step(250);
    assert.ok(veiled && killcam.isActive() && rig.cameraOwner === 'external',
      `setup: ${label}: the killcam's death replay runs (veiled ${veiled}, replay ${killcam.isActive()}, camera ${rig.cameraOwner})`);
  } else step(1000);
  calls.length = 0;
  // the restart: the player alive at its spawn
  player.combat.destroyed = false;
  flowBus.emit('battle:restarted', RESTART);
  for (let i = 0; i < 20; i++) step(250);
  const stale = calls.filter((call) => call.startsWith('replay'));
  if (stale.length) wrong.push(`${label}: the abandoned battle's death beat played its replay over the restarted battle (${stale.join(', ')})`);
  if (killcam.isActive()) wrong.push(`${label}: the abandoned battle's replay is still on screen`);
  if (director.facts.lastDestroyed) wrong.push(`${label}: the restarted battle's ending reads the abandoned battle's last wreck (${director.facts.lastDestroyed.id})`);
  if (rig.cameraOwner !== 'player') wrong.push(`${label}: the camera is the ${rig.cameraOwner} owner's over the living hull at its spawn (the abandoned battle's ${replay ? 'replay pin' : 'death orbit'})`);
  if (veiled) wrong.push(`${label}: the HUD stays veiled after the abandoned battle's replay was cancelled`);
  // the restarted battle: the player dies again
  calls.length = 0;
  player.combat.destroyed = true;
  step(16);
  if (!calls.includes('deathCam') || rig.cameraOwner !== 'death') wrong.push(`${label}: the player's death in the restarted battle got no death cam (the abandoned battle's had run)`);
}
resultFlow({ replay: false, killcamFirst: false });
resultFlow({ replay: true, killcamFirst: false });
resultFlow({ replay: true, killcamFirst: true });

if (wrong.length) {
  console.error(`battleRestartTallies: a battle restart left the abandoned battle in the restarted battle's records:\n  ${wrong.join('\n  ')}`);
  assert.fail('a battle restart opens a new battle for every per-battle record');
}
console.log('battleRestartTallies: a battle restart opens a new battle for the HUD (kill counts, feed, contact memory, sixth sense, revive count, consumable tray), the battle report, the service record, the career record, the result flow (its ending facts, the player\'s death flow and its camera) and the medal toasts PASS');
