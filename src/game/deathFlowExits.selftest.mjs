// Proof (implicit state machine audit, round 5 U4, 2026-11-06): the player's death replay leaves the result
// runtime's books on every exit that ends its life (game/battleResultPresentationRuntime.ts deathReplayShown), so no
// later edge hands back a HUD or a camera for a replay that is not on screen, and an edge that ends it on screen hands
// them back. The runtime, the camera rig (createCameraRig) and the killcam (createKillCam, whose replay pins the rig
// through setExternalPose) are the real ones on one bus, as main.ts builds them; the runtime's ports forward to them
// and count what the runtime asks. A death is told as the solo step tells it (the lethal hit and tank:destroyed, then
// the frame's update reads the wreck) unless a case says a network seat's order (its own row, the newest authority row,
// shows the wreck a frame before the frame tells that death's events: mp/match/matchClient.ts flushes events through
// the interpolated tick).
//   1. The battle's teardown (main.ts clearBattle: runtime.clearPending(), then killcam.cancel(), whose cancelled
//      replay runs no onDone, so no afterDeath), then a restart reached without reset(). Before, clearPending() left
//      the flag set, and the restart's listener unveiled the HUD and released the rig for a replay no longer on
//      screen: the release took the camera from the owner that pinned it after the teardown.
//   2. A freshly taken Watch seat (newSeat) after a cancelled replay, then a restart without reset(): likewise.
//      Neither path reaches a restart today (every entry runs reset(): mp/session/activationRuntime.ts,
//      soloBattleStartRuntime.ts; Watch is solo, which never hears 'battle:restarted'; a Watch seat is taken only
//      after the driven hull's replay ended: watchController.ts drivenHandoff waits for !killcam.isActive()), so 1 and
//      2 are the owner's transitions.
//   3. The seat's hull revived by its mode while its death replay is on screen, in a mode with no respawn timer
//      (matchRuleset.ts endless_horde and frontline_assault, respawnS null), where the runtime runs the full death
//      flow. A solo human's death there ends the battle in the same step (matchModes.ts stepHorde/stepAssault), so
//      two seats reach it: a network Horde room with another human alive (startHordeWave stands every fallen Alpha
//      hull up, humans too, 8 s after a wave is cleared) and a Watch seat driving an allied bot (WATCH_RULES.modes;
//      drivenHandoff keeps the seat while the replay runs) that Horde's next wave or a Frontline sector's capture
//      stands up, inside a replay of up to 15 s. The killcam's 'mode:respawn' listener cancels the replay (killcam.ts:
//      "the revive takes the camera back"), and the cancel runs no onDone. Before, the revived hull played on under
//      the replay's frozen pin with the HUD veiled, and its next death got no death cam (deathCamShown stayed set).
//      Both orders in which the killcam and the runtime hear the revive (the page's is the runtime first: it
//      subscribes when built, and the killcam binds its bus later); cases 3-9 run both.
//   4. The same revive inside the death beat, before the replay: the death orbit ends with the player's camera and
//      the beat does not fire over the living hull (before, the orbit circled it, and the beat's late fire restarted
//      it).
//   5. Another hull's revive inside the seat's death beat or replay (an ally's id and an enemy's): each revive tells
//      the same event with its own id there (matchModes.ts reviveAtSpawn: Horde's arrivals and wave start, Frontline's
//      bot allies, sector capture and reinforcements). The seat's death flow runs on as it was: nothing handed back,
//      the beat fires once, no second death cam or replay (the listener's id gate).
//   6. The seat's own revive after its verdict is shown: the ending's camera and HUD stay (the listener's endShown
//      guard; defensive, as a mode's step revives no more once its verdict latches: matchModes.ts step's `result`).
//   7. A revive told before its hull reads alive (the row a frame behind its event), in the beat and in the replay:
//      the screen comes back at the edge, the abandoned life's death flow does not start over the wreck (not even when
//      another hull's destruction is told before the row: the destruction listener's id gate), and the death cam
//      re-arms once the hull reads alive, so the next death's flow starts on its row (reviveOwed). Neither driver
//      orders it so today (solo reviveAtSpawn revives before it emits; a network seat's own row leads its events), so 7
//      is the owner's transition (round 5 review r1).
//   8. A network seat revived and killed again within the interpolation delay (review r2): the revive is told under
//      the row of its next death, in the beat and in the replay. The screen comes back at the edge, no flow starts
//      until that death's own tank:destroyed is told, which pays the debt: the next death gets its death cam and
//      replay. Its first death is told in the network's order too: that death's own tank:destroyed, heard after its row
//      started the flow, does not start it again (the destruction listener reads only a standing debt).
//   9. The revive's most frequent timing in a network Horde room (review r2): after the death replay ended on its own
//      (the killcam's phases run out under update(), then its exit's wall-clock fade, killcam.ts beginExit/
//      completeExit; afterDeath ran). (Round 6 V5) With the room's other human alive, as a room goes on only while one
//      is, the killcam's ally chase holds the camera then (it starts at a death replay's end whenever an ally lives),
//      and the revive leaves the screen to the player (the killcam's listener ends the chase; the runtime's orbit
//      hand-back leaves another owner as it is). With no ally to chase the death orbit holds, and the revive ends it.
//      Nothing else is asked (no veil, no release), and the next death gets its own death cam and replay, and with an
//      ally its ally chase after that replay (the killcam starts it only from a death flow). Before, the revived
//      hull's later deaths got none of it (deathCamShown stayed set): the chase view over the wreck until the next wave.
//  10. A Watch seat left (review r2): the real watch controller (createWatchController, createWatchCamera, the seat
//      ledger) on the same bus, rig and killcam, its frame asked only while no replay is on screen, as
//      app/mainFrameRuntime.ts updateCombatCamera does. The watcher takes an allied bot in a watched Standard battle
//      (no respawn timer: the full death flow), it dies, and Leave (the touch button's toggleSeat; Enter and pad R3 run
//      the same leave()) inside its death beat: no replay follows and the drone keeps the screen (before, the beat
//      fired the left hull's replay over the drone up to 1.6 s later, veiled the HUD and took the camera for up to
//      15 s: watchController.ts leave told the runtime nothing). Leave while its replay is on screen: the replay plays
//      out and its own end hands back, then the drone (as on f60d0aa200; the contract the runtime's leaveSeat states).
// On f60d0aa200 (no revive or destruction listener, no leaveSeat) 1-4, 7-9 and 10's beat leave fail (54 checks); 5, 6
// and 10's replay leave pass there (5 and 6 are mutation controls: 5 fails with the revive's id gate taken out, 6 with
// the endShown guard; 10's replay leave pins the contract leaveSeat states). 8 and 10's beat leave fail on the
// round-five r1 head too (ab43905660: no destruction listener, no leaveSeat), and 7 on the r0 head (8a8907c9c0: the
// death cam re-armed at the event). Each line of the owner fails its own cases when taken out: clearPending's drop (1),
// newSeat's drop (2), the revive's listener (3, 4, 7, 8, 9), its re-arm at the event (3's and 9's next death), the
// re-arm at the alive edge (7's next death on its row), its hand-back (3, 4, 7, 8, 9), the destruction listener (8's
// next death), its debt gate (8's first death), its id gate (7), leaveSeat's drop and the controller's call to it
// (10's beat leave). The browser half (the camera's motion, the replay's WebGL frames, the HUD's paint) is not
// reproduced here.
import { StubElement, windowStub } from '../ui/hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createBus } from './stateCore.ts';
import { createBattleResultPresentationRuntime } from './battleResultPresentationRuntime.ts';
import { createBattleEndingDirector } from './battleEnding.ts';
import { createCameraRig } from '../engine/cameraRig.ts';
import { createWatchCamera } from '../engine/watchCamera.ts';
import { createKillCam } from './killcam.ts';
import { createWatchController } from './watchController.ts';
import { prepareWatchSeat } from './watchSeat.ts';
import { matchRulesetFor, watchRulesetFor } from '../sim/matchRuleset.ts';

const SPEC = 'm1a1_abrams_hc';
const RESTART = { battleRestarts: 1 };
const idle = { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false };
const flat = { getHeightAt: () => 0 };
const wrong = [];
assert.equal(typeof StubElement, 'function', 'setup: the recording DOM is installed');
// Node's EventTarget ignores a boolean capture in removeEventListener (Node 24; a browser honours it), so every replay
// this receipt opens leaves the killcam's replay key listener on the one recording window (killcam.ts teardown removes
// it with `true`), as does each watch controller's stop(): the window's cap sits above the cases' replays and
// controllers instead of warning of a leak the page does not have.
setMaxListeners(96, windowStub);

await ensureAuthorityFleet([SPEC]);
const spec = getSpec(SPEC);

/** A hull the killcam, the rig and the seat ledger can all read (a parked pool entry's fields are not needed). */
function hull(id, team, { x = 0, z = 0, bot = true } = {}) {
  const root = new THREE.Object3D();
  root.position.set(x, 0, z);
  root.updateMatrixWorld(true);
  const entity = {
    id, team, isPlayer: false, bot, modeActive: true, spec, specId: SPEC, aiCtl: { update() {} },
    combat: { destroyed: false, crew: {}, modules: {} },
    state: { pos: root.position, yaw: 0.3, turretYaw: 0, gunPitch: 0, visualPitch: 0, visualRoll: 0 },
    input: { throttle: 0, steer: 0, brake: false, fire: false, actionBits: 0, aimLocked: false,
      aimPoint: new THREE.Vector3(x, 2, z + 300) },
    aerial: null,
    visual: {
      root, turretTopWorld: (out) => out.set(0, 2, 0).applyMatrix4(root.matrixWorld),
      gunPivotWorld: (out) => out.set(0, 1.7, 0.2).applyMatrix4(root.matrixWorld),
      isDestroyed: () => entity.combat.destroyed, wreckState: () => (entity.combat.destroyed ? 'plain' : 'intact'),
      setDestroyed() {}, resetDestroyed() {}, syncFromState() {}, setVisible() {},
    },
  };
  return entity;
}

/**
 * The real runtime, rig and killcam for `game` (its player read live, as main.ts wires getPlayer), with the runtime's
 * ports counting what it asks. `killcamFirst`: the killcam hears the bus's edges before the runtime (the page's order is
 * the runtime first).
 */
function presentation(game, { killcamFirst }) {
  const bus = createBus();
  const calls = [];
  const clock = { wallMs: 1000 };
  const hud = { veiled: false };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
  const rig = createCameraRig(camera, { heightField: flat, raycast: () => null, getPlayer: () => game.player });
  rig.snapArcade(2, 0.3, -0.1);
  const killcam = createKillCam({
    scene: new THREE.Scene(), camera, rig, heightField: flat,
    getPlayer: () => game.player, getGame: () => game, isBattleEntryCovered: () => false,
  });
  if (killcamFirst) killcam.bindBus(bus);
  const runtime = createBattleResultPresentationRuntime({
    game, bus,
    killcam: {
      get lastBeginWallMs() { return killcam.lastBeginWallMs ?? null; },
      playForResult(result, timeS, onDone, options) {
        calls.push(`replay:${game.player?.combat.destroyed ? 'dead' : game.player ? 'alive' : 'no seat'}`);
        return killcam.playForResult(result, timeS, onDone, options);
      },
    },
    rig: {
      release: () => { calls.push('release'); rig.release(); },
      startDeathCam: () => { calls.push('deathCam'); rig.startDeathCam(); },
      endDeathCam: () => { calls.push('endDeathCam'); rig.endDeathCam(); },
    },
    veilHud: (on) => { calls.push(`veil:${on}`); hud.veiled = on; },
    showEndOverlay: () => {}, emitPresented: (result) => calls.push(`presented:${result}`), exitPointerLock: () => {},
    recordFlow: () => {},
    ending: {
      director: createBattleEndingDirector(), camera: { begin: () => true, frame() {}, end() {} },
      modeState: () => null, emitBeat() {},
    },
    now: () => clock.wallMs, deathBeatMs: 2600,
  });
  if (!killcamFirst) killcam.bindBus(bus);
  /** The seat's hull takes a lethal shell (the killcam's capture of the death its replay shows). */
  const lethalHit = (target) => killcam.onShellHit({
    shellId: null, targetId: target.id, attackerId: 'e9', destroyed: true, timeS: game.timeS,
    pos: [0, 1, 0], normal: [0, 0, 1], localPos: [0, 1, 0], localDir: [0, 0, -1], modulesHit: [], crewHit: [],
    shellType: 'APFSDS', zone: 'hull',
  }, target);
  const told = (id) => bus.emit('tank:destroyed', { id, killerId: 'e9', cause: 'shot' });
  /**
   * The replay ends on its own: its phases run out under update() (the x-ray hold's end begins the exit), then the
   * exit's letterbox and fade hand back on their wall-clock timers (beginExit: EXIT_HOLD_MS), update() its second driver.
   */
  const endReplay = async (label) => {
    for (let i = 0; i < 2400 && killcam.isActive() && killcam.phase !== 'exit'; i++) killcam.update(1 / 30);
    for (let waited = 0; killcam.isActive() && waited < 20000; waited += 25) {
      await sleep(25);
      killcam.update(1 / 60);
    }
    assert.ok(!killcam.isActive(), `setup: ${label}: the replay ended on its own (phase ${killcam.phase})`);
  };
  return { bus, calls, clock, hud, camera, rig, killcam, runtime, lethalHit, told, endReplay };
}

/**
 * One seat's result flow (its hull 'me', no Watch), with no respawn timer (Horde's: fallen Alpha hulls stand up).
 * `ally` (round 6 V5): the room's other human lives, so a death replay's end hands the camera to the killcam's ally chase.
 */
function seat({ killcamFirst = false, ally = false } = {}) {
  const player = hull('me', 'player', { bot: false });
  player.isPlayer = true;
  const tanks = ally ? [player, hull('other', 'player', { x: 20, bot: false })] : [player];
  const game = {
    result: null, resultReason: null, gameMode: 'endless_horde', timeS: 10, player,
    ruleset: { respawnS: null }, matchModeState: null, phase: 'battle', tanks,
    tankById: new Map(tanks.map((tank) => [tank.id, tank])),
  };
  const p = presentation(game, { killcamFirst });
  const { calls, clock, hud, rig, killcam, runtime } = p;
  const step = (ms) => { clock.wallMs += ms; game.timeS += ms / 1000; runtime.update(); rig.update(ms / 1000, idle); };
  /** The solo step's order: the lethal hit and tank:destroyed are told in the step, the frame's update reads the wreck. */
  const kill = () => {
    player.combat.destroyed = true;
    p.lethalHit(player);
    p.told('me');
    step(16);
  };
  const die = (label) => {
    kill();
    assert.equal(rig.cameraOwner, 'death', `setup: ${label}: the player's death starts its death orbit`);
  };
  /** The death beat runs out and the killcam's death replay takes the screen. */
  const toReplay = (label) => {
    for (let i = 0; i < 12; i++) step(250);
    assert.ok(hud.veiled && killcam.isActive() && rig.cameraOwner === 'external',
      `setup: ${label}: the killcam's death replay runs (veiled ${hud.veiled}, replay ${killcam.isActive()}, `
      + `camera ${rig.cameraOwner})`);
  };
  /** Another owner pins the camera after the replay left the screen (a shot view, the ending camera, a replay). */
  const pinNext = () => rig.setExternalPose(new THREE.Vector3(60, 40, 60), new THREE.Vector3(0, 0, 0), 40);
  return { ...p, game, calls, hud, player, rig, killcam, runtime, step, kill, die, toReplay, pinNext };
}

/** The revived hull's next death (the solo order) gets its own death flow: the death orbit, then the beat's replay. */
function nextDeathRuns(s, label) {
  s.calls.length = 0;
  s.kill();
  if (!s.calls.includes('deathCam') || s.rig.cameraOwner !== 'death') {
    wrong.push(`${label}: the revived hull's next death got no death cam (camera ${s.rig.cameraOwner})`);
  }
  for (let i = 0; i < 12; i++) s.step(250);
  if (!s.calls.includes('replay:dead') || !s.killcam.isActive()) {
    wrong.push(`${label}: the revived hull's next death got no death replay (${s.calls.join(', ') || 'no call'})`);
  }
}

// ---- 1-2. the replay's life ends at a teardown or a fresh seat; a restart reached without reset() owes it nothing
for (const exit of ['teardown', 'newSeat']) {
  const label = exit === 'teardown' ? 'teardown (clearBattle\'s order), then a restart without reset()'
    : 'a fresh Watch seat after a cancelled replay, then a restart without reset()';
  const s = seat();
  s.die(label);
  s.toReplay(label);
  s.calls.length = 0;
  if (exit === 'teardown') {
    // main.ts clearBattle: the runtime first, then the killcam's cancel (no afterDeath), then the page unveils the HUD
    s.runtime.clearPending();
    s.killcam.cancel();
  } else {
    s.killcam.cancel();
    s.runtime.newSeat();
  }
  assert.ok(!s.killcam.isActive(), `setup: ${label}: the replay left the screen`);
  assert.deepEqual(s.calls, [], `setup: ${label}: the cancelled replay ran no afterDeath (${s.calls.join(', ')})`);
  s.hud.veiled = false;
  s.pinNext();
  s.player.combat.destroyed = false;
  s.bus.emit('battle:restarted', RESTART);
  s.step(16);
  const handBack = s.calls.filter((call) => call === 'veil:false' || call === 'release');
  if (handBack.length) wrong.push(`${label}: the restart handed back a replay not on screen (${handBack.join(', ')})`);
  if (s.rig.cameraOwner !== 'external') {
    wrong.push(`${label}: the restart took the camera from the owner that pinned it since (now ${s.rig.cameraOwner})`);
  }
}

// ---- 3. the seat's hull revived by its mode while its death replay is on screen (no respawn timer)
for (const killcamFirst of [false, true]) {
  const label = `a revive in the death replay (${killcamFirst ? 'killcam first' : 'runtime first'})`;
  const s = seat({ killcamFirst });
  s.die(label);
  s.toReplay(label);
  s.calls.length = 0;
  s.player.combat.destroyed = false;
  s.bus.emit('mode:respawn', { id: 'me', team: 'player' });
  for (let i = 0; i < 20; i++) s.step(250);
  if (s.killcam.isActive()) wrong.push(`${label}: the abandoned life's replay is still on screen`);
  if (s.hud.veiled) wrong.push(`${label}: the HUD stays veiled over the revived hull`);
  if (s.rig.cameraOwner !== 'player') {
    wrong.push(`${label}: the camera is the ${s.rig.cameraOwner} owner's over the revived hull (the replay's pin)`);
  }
  const stale = s.calls.filter((call) => call.startsWith('replay'));
  if (stale.length) wrong.push(`${label}: a replay was asked for over the revived hull (${stale.join(', ')})`);
  nextDeathRuns(s, label);
}

// ---- 4. the same revive inside the death beat, before the replay
for (const killcamFirst of [false, true]) {
  const label = `a revive in the death beat (${killcamFirst ? 'killcam first' : 'runtime first'})`;
  const s = seat({ killcamFirst });
  s.die(label);
  s.step(1000);
  s.calls.length = 0;
  s.player.combat.destroyed = false;
  s.bus.emit('mode:respawn', { id: 'me', team: 'player' });
  for (let i = 0; i < 20; i++) s.step(250);
  if (s.rig.cameraOwner !== 'player') {
    wrong.push(`${label}: the camera is the ${s.rig.cameraOwner} owner's over the revived hull (the old life's orbit)`);
  }
  const stale = s.calls.filter((call) => call.startsWith('replay') || call === 'deathCam');
  if (stale.length) {
    wrong.push(`${label}: the abandoned life's death beat fired over the revived hull (${stale.join(', ')})`);
  }
  if (s.hud.veiled) wrong.push(`${label}: the HUD is veiled over the revived hull`);
}

// ---- 5. another hull's revive inside the seat's death beat or replay is not the seat's
for (const killcamFirst of [false, true]) {
  for (const phase of ['beat', 'replay']) {
    for (const other of [{ id: 'ally1', team: 'player' }, { id: 'e9', team: 'enemy' }]) {
      const label = `${other.id}'s revive in the death ${phase} (${killcamFirst ? 'killcam first' : 'runtime first'})`;
      const s = seat({ killcamFirst });
      s.die(label);
      if (phase === 'beat') s.step(1000);
      else s.toReplay(label);
      const before = {
        camera: s.rig.cameraOwner, veiled: s.hud.veiled, replay: s.killcam.isActive(),
        pending: s.runtime.snapshot().pendingDeadlineMs,
      };
      s.calls.length = 0;
      s.bus.emit('mode:respawn', other);
      s.step(16);
      const after = {
        camera: s.rig.cameraOwner, veiled: s.hud.veiled, replay: s.killcam.isActive(),
        pending: s.runtime.snapshot().pendingDeadlineMs,
      };
      const handBack = s.calls.filter((call) => call === 'veil:false' || call === 'release' || call === 'endDeathCam');
      if (handBack.length) wrong.push(`${label}: the seat's death flow was handed back (${handBack.join(', ')})`);
      for (const key of Object.keys(before)) {
        if (before[key] !== after[key]) wrong.push(`${label}: ${key} ${before[key]} became ${after[key]}`);
      }
      // the seat's flow runs on: the beat fires once and its replay holds the screen; no second death cam or replay
      for (let i = 0; i < 12; i++) s.step(250);
      const replays = s.calls.filter((call) => call.startsWith('replay'));
      const cams = s.calls.filter((call) => call === 'deathCam');
      const want = phase === 'beat' ? ['replay:dead'] : [];
      if (replays.join() !== want.join() || cams.length) {
        wrong.push(`${label}: the death flow ran ${replays.length} replay(s) and ${cams.length} death cam(s) more `
          + `(want ${want.length} and 0: ${s.calls.join(', ')})`);
      }
      if (!s.killcam.isActive() || !s.hud.veiled || s.rig.cameraOwner !== 'external') {
        wrong.push(`${label}: the seat's death replay is not on screen (replay ${s.killcam.isActive()}, veiled `
          + `${s.hud.veiled}, camera ${s.rig.cameraOwner})`);
      }
    }
  }
}

// ---- 6. the seat's own revive after its verdict is shown is the ending's
for (const killcamFirst of [false, true]) {
  const label = `a revive after the verdict (${killcamFirst ? 'killcam first' : 'runtime first'})`;
  const s = seat({ killcamFirst });
  s.die(label);
  s.toReplay(label);
  s.game.result = 'defeat';
  s.game.resultReason = 'horde_overrun';
  for (let i = 0; i < 160 && !s.calls.includes('presented:defeat'); i++) s.step(250);
  assert.ok(s.calls.includes('presented:defeat'), `setup: ${label}: the verdict's report is shown`);
  const ending = { camera: s.rig.cameraOwner, veiled: s.hud.veiled };
  assert.equal(ending.camera, 'death', `setup: ${label}: the defeat's ending orbits the wreck`);
  s.calls.length = 0;
  s.player.combat.destroyed = false;
  s.bus.emit('mode:respawn', { id: 'me', team: 'player' });
  for (let i = 0; i < 8; i++) s.step(250);
  const asked = s.calls.filter((call) => call !== 'presented:defeat');
  if (asked.length) wrong.push(`${label}: the runtime acted over the ending (${asked.join(', ')})`);
  if (s.rig.cameraOwner !== ending.camera || s.hud.veiled !== ending.veiled) {
    wrong.push(`${label}: the ending's camera or HUD changed (camera ${s.rig.cameraOwner}, veiled ${s.hud.veiled})`);
  }
}

// ---- 7. a revive told before its hull reads alive (the row a frame behind its event)
for (const killcamFirst of [false, true]) {
  for (const phase of ['beat', 'replay']) {
    const label = `a revive told a frame before its row, in the death ${phase} `
      + `(${killcamFirst ? 'killcam first' : 'runtime first'})`;
    const s = seat({ killcamFirst });
    s.die(label);
    if (phase === 'beat') s.step(1000);
    else s.toReplay(label);
    s.calls.length = 0;
    s.bus.emit('mode:respawn', { id: 'me', team: 'player' });
    // another hull's destruction told in the same frame, before the seat's row shows it alive
    s.told('ally1');
    s.step(16);
    s.player.combat.destroyed = false;
    for (let i = 0; i < 20; i++) s.step(250);
    const stale = s.calls.filter((call) => call.startsWith('replay') || call === 'deathCam');
    if (stale.length) wrong.push(`${label}: the abandoned life's death flow ran over the hull (${stale.join(', ')})`);
    if (s.killcam.isActive() || s.hud.veiled || s.rig.cameraOwner !== 'player') {
      wrong.push(`${label}: the screen is not the revived hull's (replay ${s.killcam.isActive()}, veiled `
        + `${s.hud.veiled}, camera ${s.rig.cameraOwner})`);
    }
    // the next death in a network seat's order: its row first, its events a frame later; the flow starts on the row
    s.calls.length = 0;
    s.player.combat.destroyed = true;
    s.step(16);
    if (!s.calls.includes('deathCam') || s.rig.cameraOwner !== 'death') {
      wrong.push(`${label}: the revived hull's next death started no death cam on its row (camera `
        + `${s.rig.cameraOwner}; ${s.calls.join(', ') || 'no call'})`);
    }
    s.lethalHit(s.player);
    s.told('me');
    s.step(16);
    for (let i = 0; i < 12; i++) s.step(250);
    if (!s.calls.includes('replay:dead') || !s.killcam.isActive()) {
      wrong.push(`${label}: the revived hull's next death got no death replay (${s.calls.join(', ') || 'no call'})`);
    }
  }
}

// ---- 8. a network seat revived and killed again within the interpolation delay: its revive is told under the row
// of its next death, and that death's events come after (review r2)
for (const killcamFirst of [false, true]) {
  for (const phase of ['beat', 'replay']) {
    const label = `a revive told under the row of the hull's next death, in the death ${phase} `
      + `(${killcamFirst ? 'killcam first' : 'runtime first'})`;
    const s = seat({ killcamFirst });
    // the first death in the network's order: the row starts the flow, the death's own events come a frame later
    s.player.combat.destroyed = true;
    s.step(16);
    const deadline = s.runtime.snapshot().pendingDeadlineMs;
    assert.ok(s.calls.includes('deathCam') && deadline !== null, `setup: ${label}: the row starts the death flow`);
    s.lethalHit(s.player);
    s.told('me');
    s.step(16);
    const cams = s.calls.filter((call) => call === 'deathCam').length;
    if (cams !== 1 || s.runtime.snapshot().pendingDeadlineMs !== deadline) {
      wrong.push(`${label}: the first death's own tank:destroyed started its flow again (${cams} death cams, beat due `
        + `${s.runtime.snapshot().pendingDeadlineMs} for ${deadline})`);
    }
    if (phase === 'beat') s.step(1000);
    else s.toReplay(label);
    s.calls.length = 0;
    // the hull stays destroyed: the row already shows its next death
    s.bus.emit('mode:respawn', { id: 'me', team: 'player' });
    s.step(16);
    if (s.killcam.isActive() || s.hud.veiled) {
      wrong.push(`${label}: the abandoned life's replay holds the screen (replay ${s.killcam.isActive()}, veiled `
        + `${s.hud.veiled})`);
    }
    const early = s.calls.filter((call) => call.startsWith('replay') || call === 'deathCam');
    if (early.length) wrong.push(`${label}: a death flow ran before the next death was told (${early.join(', ')})`);
    // the next death's events (tick order: after the revive)
    s.calls.length = 0;
    s.lethalHit(s.player);
    s.told('me');
    s.step(16);
    if (!s.calls.includes('deathCam') || s.rig.cameraOwner !== 'death') {
      wrong.push(`${label}: the next death got no death cam (camera ${s.rig.cameraOwner}; `
        + `${s.calls.join(', ') || 'no call'})`);
    }
    for (let i = 0; i < 12; i++) s.step(250);
    if (!s.calls.includes('replay:dead') || !s.killcam.isActive() || s.rig.cameraOwner !== 'external') {
      wrong.push(`${label}: the next death got no death replay (${s.calls.join(', ') || 'no call'})`);
    }
  }
}

// ---- 9. the revive after the death replay ended on its own: the room's other human alive (the killcam's ally chase
// holds the camera), or no ally to chase (the death orbit holds)
for (const killcamFirst of [false, true]) {
  for (const ally of [true, false]) {
    const label = `a revive after the death replay ended, ${ally ? 'the ally chase on' : 'the orbit holding'} `
      + `(${killcamFirst ? 'killcam first' : 'runtime first'})`;
    const s = seat({ killcamFirst, ally });
    s.die(label);
    s.toReplay(label);
    s.calls.length = 0;
    await s.endReplay(label);
    s.step(16);
    assert.deepEqual(s.calls, ['veil:false', 'release', 'deathCam'], `setup: ${label}: the replay's end ran afterDeath`);
    const holds = ally ? 'spectate' : 'death';
    assert.ok(s.rig.cameraOwner === holds && !s.hud.veiled,
      `setup: ${label}: the ${ally ? 'ally chase' : 'death orbit'} holds, the HUD is back (camera ${s.rig.cameraOwner})`);
    s.calls.length = 0;
    s.player.combat.destroyed = false;
    s.bus.emit('mode:respawn', { id: 'me', team: 'player' });
    for (let i = 0; i < 8; i++) s.step(250);
    if (ally) {
      // the killcam's listener ends its chase; the runtime's orbit hand-back leaves another owner as it is
      const asked = s.calls.filter((call) => call !== 'endDeathCam');
      if (asked.length || s.rig.cameraOwner !== 'player') {
        wrong.push(`${label}: the revive did not leave the screen to the player alone (camera ${s.rig.cameraOwner}; `
          + `${s.calls.join(', ') || 'no call'})`);
      }
    } else if (s.calls.join() !== 'endDeathCam' || s.rig.cameraOwner !== 'player') {
      wrong.push(`${label}: the revive did not end the orbit alone (camera ${s.rig.cameraOwner}; `
        + `${s.calls.join(', ') || 'no call'})`);
    }
    nextDeathRuns(s, label);
    if (ally) {
      // that death's replay ends on its own: the ally chase again (the killcam starts it only from a death flow)
      await s.endReplay(label);
      s.step(16);
      if (s.rig.cameraOwner !== 'spectate') {
        wrong.push(`${label}: the revived hull's next death got no ally chase after its replay (camera `
          + `${s.rig.cameraOwner})`);
      }
      s.killcam.spectate.stop(false); // the chase's poll timer would hold the process open
    }
  }
}

// ---- 10. a Watch seat left inside its death beat or replay
for (const killcamFirst of [false, true]) {
  for (const phase of ['beat', 'replay']) {
    const label = `a Watch seat left in its death ${phase} (${killcamFirst ? 'killcam first' : 'runtime first'})`;
    const human = hull('me', 'player', { z: -100, bot: false });
    const ally = hull('ally1', 'player', { x: 30, z: -110 });
    const foe = hull('e9', 'enemy', { z: 100 });
    const tanks = [human, ally, foe];
    const game = {
      phase: 'battle', player: human, tanks, tankById: new Map(tanks.map((tank) => [tank.id, tank])),
      result: null, resultReason: null, gameMode: 'standard', timeS: 10, matchModeState: null, watch: null,
      ruleset: watchRulesetFor(matchRulesetFor('standard')),
    };
    human.isPlayer = true;
    prepareWatchSeat(game, human);
    const p = presentation(game, { killcamFirst });
    const watchCamera = createWatchCamera(p.camera, { heightField: flat, raycast: () => null });
    const controller = createWatchController({
      game, camera: p.camera, watchCamera, rig: p.rig, bus: p.bus, killcam: p.killcam, cameraInput: idle,
      input: {
        getState: () => ({ forward: false, back: false, left: false, right: false }),
        isDown: () => false, pressVirtual() {}, releaseVirtual() {}, getVirtualMove: () => false,
        getPadSnapshot: (out) => Object.assign(out, { connected: false, leftX: 0, leftY: 0, rightX: 0, rightY: 0,
          leftTrigger: 0, rightTrigger: 0, buttons: 0 }),
        isLocked: () => true,
      },
      resultPresentation: p.runtime,
      onSeat() {}, isInputHeld: () => false, pickSurface: () => true,
      openingFrame: (out) => { out.position.set(0, 60, -250); out.yaw = 0; out.pitch = -0.35; return true; },
    });
    // app/mainFrameRuntime.ts: the result runtime each frame; Watch's frame (else the rig) only while no replay is on
    // screen, the killcam's own update while one is
    const frames = { drone: 0, other: 0 };
    const step = (ms) => {
      p.clock.wallMs += ms;
      game.timeS += ms / 1000;
      p.runtime.update();
      if (p.killcam.isActive()) { frames.other++; return; }
      if (controller.frame(ms / 1000)) frames.drone++;
      else { frames.other++; p.rig.update(ms / 1000, idle); }
    };
    controller.open();
    assert.equal(game.player, null, `setup: ${label}: the watched battle opens on the drone`);
    controller.rideId('ally1');
    for (let i = 0; i < 400 && controller.focusId !== 'ally1'; i++) step(16);
    controller.toggleSeat();
    assert.ok(controller.view === 'drive' && game.player === ally, `setup: ${label}: the watcher drives the ally`);
    step(16);
    ally.combat.destroyed = true;
    p.lethalHit(ally);
    p.told('ally1');
    step(16);
    assert.equal(p.rig.cameraOwner, 'death', `setup: ${label}: the driven hull's death starts its death orbit`);
    if (phase === 'beat') step(1000);
    else {
      for (let i = 0; i < 12; i++) step(250);
      assert.ok(p.hud.veiled && p.killcam.isActive(), `setup: ${label}: the driven hull's death replay runs`);
    }
    p.calls.length = 0;
    controller.toggleSeat();
    assert.ok(controller.view === 'drone' && game.player === null, `setup: ${label}: Leave lifts the drone off`);
    if (phase === 'beat') {
      frames.drone = frames.other = 0;
      for (let i = 0; i < 20; i++) step(250);
      const flow = p.calls.filter((call) => call.startsWith('replay') || call === 'veil:true');
      if (flow.length || p.killcam.isActive() || p.hud.veiled) {
        wrong.push(`${label}: the left seat's death flow ran over the drone (${flow.join(', ') || 'no call'}; replay `
          + `${p.killcam.isActive()}, veiled ${p.hud.veiled})`);
      }
      if (frames.other || controller.view !== 'drone') {
        wrong.push(`${label}: the drone lost the screen for ${frames.other} of ${frames.drone + frames.other} frames `
          + `(view ${controller.view})`);
      }
    } else {
      // the replay on screen plays out (the leave's Enter steps it a beat) and its own end hands back
      await p.endReplay(label);
      frames.drone = frames.other = 0;
      for (let i = 0; i < 8; i++) step(250);
      if (p.calls.join() !== 'veil:false,release,deathCam' || p.hud.veiled) {
        wrong.push(`${label}: the replay's end did not hand back once (${p.calls.join(', ') || 'no call'}; veiled `
          + `${p.hud.veiled})`);
      }
      if (frames.other || controller.view !== 'drone') {
        wrong.push(`${label}: the drone did not take the screen after the replay (${frames.other} of `
          + `${frames.drone + frames.other} frames elsewhere, view ${controller.view})`);
      }
    }
    controller.stop();
  }
}

if (wrong.length) {
  console.error(`deathFlowExits: the player's death flow outlived the exit that ended it:\n  ${wrong.join('\n  ')}`);
  assert.fail('every exit that ends the player\'s death replay leaves the result runtime owing nothing for it');
}
console.log('deathFlowExits: a teardown, a fresh seat, a mode\'s revive and a Watch seat left end the player\'s death '
  + 'flow (no stale hand-back at a later restart; the revive hands the HUD and the camera back, in the beat, in the '
  + 'replay or after it, and the next death has its own; another hull\'s revive and a revive after the verdict leave it '
  + 'alone; a revive ahead of its row re-arms the death cam once the hull reads alive, one under the row of its next '
  + 'death at that death\'s event; no replay follows a Leave) PASS');
