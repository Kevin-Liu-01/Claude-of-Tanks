// Proof (implicit state machine audit, round 5 U4, 2026-11-06): the player's death replay leaves the result
// runtime's books on every exit that ends its life (game/battleResultPresentationRuntime.ts deathReplayShown), so no
// later edge hands back a HUD or a camera for a replay that is not on screen, and an edge that ends it on screen hands
// them back. The runtime, the camera rig (createCameraRig) and the killcam (createKillCam, whose replay pins the rig
// through setExternalPose) are the real ones on one bus, as main.ts builds them; the runtime's ports forward to them
// and count what the runtime asks.
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
//      subscribes when built, and the killcam binds its bus later); cases 3-7 run both.
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
//      the screen comes back at the edge, the abandoned life's death flow does not start over the wreck, and the death
//      cam re-arms once the hull reads alive (reviveOwed). Neither driver orders it so today (solo reviveAtSpawn revives
//      before it emits; mp/presentation/adapter.ts applies a frame's rows before its events), so 7 is the owner's
//      transition (round 5 review r1).
// On f60d0aa200 (no revive listener) 1-4 and 7 fail (30 checks); 5 and 6 pass there trivially, so they are mutation
// controls: 5 fails with the id gate taken out, 6 with the endShown guard. 7 fails on the round-five r1 head too,
// which re-armed the death cam at the event. Each line of the owner fails its own cases when taken out: clearPending's
// drop (1), newSeat's drop (2), the revive's listener (3, 4, 7), its re-arm at the event (3's next death), the re-arm
// at the alive edge (7's next death), its hand-back (3, 4, 7). The browser half (the camera's motion, the replay's
// WebGL frames, the HUD's paint) is not reproduced here.
import { StubElement, windowStub } from '../ui/hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createBus } from './stateCore.ts';
import { createBattleResultPresentationRuntime } from './battleResultPresentationRuntime.ts';
import { createBattleEndingDirector } from './battleEnding.ts';
import { createCameraRig } from '../engine/cameraRig.ts';
import { createKillCam } from './killcam.ts';

const SPEC = 'm1a1_abrams_hc';
const RESTART = { battleRestarts: 1 };
const idle = { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false };
const wrong = [];
assert.equal(typeof StubElement, 'function', 'setup: the recording DOM is installed');
// Node's EventTarget ignores a boolean capture in removeEventListener (Node 24; a browser honours it), so every replay
// this receipt opens leaves the killcam's replay key listener on the one recording window (killcam.ts teardown removes
// it with `true`): the window's cap sits above the cases' replays instead of warning of a leak the page does not have.
setMaxListeners(64, windowStub);

await ensureAuthorityFleet([SPEC]);
const spec = getSpec(SPEC);

/**
 * One seat's result flow on the real runtime, rig and killcam. `killcamFirst`: the killcam hears the bus's edges before
 * the runtime (the page's order is the runtime first). `respawnS`: the ruleset's respawn timer (null: Horde's, whose
 * fallen Alpha hulls still stand up at a wave's start).
 */
function seat({ killcamFirst = false, respawnS = null } = {}) {
  const bus = createBus();
  const calls = [];
  let wallMs = 1000;
  const hud = { veiled: false };
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
    result: null, resultReason: null, gameMode: respawnS == null ? 'endless_horde' : 'standard', timeS: 10, player,
    ruleset: { respawnS }, matchModeState: null, phase: 'battle', tanks: [player], tankById: new Map([['me', player]]),
  };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
  const rig = createCameraRig(camera, {
    heightField: { getHeightAt: () => 0 }, raycast: () => null, getPlayer: () => player,
  });
  rig.snapArcade(2, 0.3, -0.1);
  const killcam = createKillCam({
    scene: new THREE.Scene(), camera, rig, heightField: { getHeightAt: () => 0 },
    getPlayer: () => player, getGame: () => game, isBattleEntryCovered: () => false,
  });
  if (killcamFirst) killcam.bindBus(bus);
  const runtime = createBattleResultPresentationRuntime({
    game, bus,
    killcam: {
      get lastBeginWallMs() { return killcam.lastBeginWallMs ?? null; },
      playForResult(result, timeS, onDone, options) {
        calls.push(`replay:${player.combat.destroyed ? 'dead' : 'alive'}`);
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
    now: () => wallMs, deathBeatMs: 2600,
  });
  if (!killcamFirst) killcam.bindBus(bus);
  const step = (ms) => { wallMs += ms; game.timeS += ms / 1000; runtime.update(); rig.update(ms / 1000, idle); };
  /** The player dies to a recorded lethal shell (its death beat and death orbit start, unless the flow is spent). */
  const kill = () => {
    player.combat.destroyed = true;
    killcam.onShellHit({
      shellId: null, targetId: 'me', attackerId: 'e9', destroyed: true, timeS: game.timeS,
      pos: [0, 1, 0], normal: [0, 0, 1], localPos: [0, 1, 0], localDir: [0, 0, -1], modulesHit: [], crewHit: [],
      shellType: 'APFSDS', zone: 'hull',
    }, player);
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
  return { bus, game, calls, hud, player, rig, killcam, runtime, step, kill, die, toReplay, pinNext };
}

// ---- 1-2. the replay's life ends at a teardown or a fresh seat; a restart reached without reset() owes it nothing
for (const exit of ['teardown', 'newSeat']) {
  const label = exit === 'teardown' ? 'teardown (clearBattle\'s order), then a restart without reset()'
    : 'a fresh Watch seat after a cancelled replay, then a restart without reset()';
  const s = seat({ respawnS: null });
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
  const s = seat({ killcamFirst, respawnS: null });
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
  // the revived hull dies again: its death gets its own death flow (the death orbit, then the beat's replay)
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

// ---- 4. the same revive inside the death beat, before the replay
for (const killcamFirst of [false, true]) {
  const label = `a revive in the death beat (${killcamFirst ? 'killcam first' : 'runtime first'})`;
  const s = seat({ killcamFirst, respawnS: null });
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
      const s = seat({ killcamFirst, respawnS: null });
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
  const s = seat({ killcamFirst, respawnS: null });
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
    const s = seat({ killcamFirst, respawnS: null });
    s.die(label);
    if (phase === 'beat') s.step(1000);
    else s.toReplay(label);
    s.calls.length = 0;
    s.bus.emit('mode:respawn', { id: 'me', team: 'player' });
    s.step(16);
    s.player.combat.destroyed = false;
    for (let i = 0; i < 20; i++) s.step(250);
    const stale = s.calls.filter((call) => call.startsWith('replay') || call === 'deathCam');
    if (stale.length) wrong.push(`${label}: the abandoned life's death flow ran over the hull (${stale.join(', ')})`);
    if (s.killcam.isActive() || s.hud.veiled || s.rig.cameraOwner !== 'player') {
      wrong.push(`${label}: the screen is not the revived hull's (replay ${s.killcam.isActive()}, veiled `
        + `${s.hud.veiled}, camera ${s.rig.cameraOwner})`);
    }
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
}

if (wrong.length) {
  console.error(`deathFlowExits: the player's death flow outlived the exit that ended it:\n  ${wrong.join('\n  ')}`);
  assert.fail('every exit that ends the player\'s death replay leaves the result runtime owing nothing for it');
}
console.log('deathFlowExits: a teardown, a fresh seat and a mode\'s revive end the player\'s death flow (no stale '
  + 'hand-back at a later restart; the revive hands the HUD and the camera back, and the next death has its own; '
  + 'another hull\'s revive and a revive after the verdict leave it alone; a revive ahead of its row re-arms the death '
  + 'cam only once the hull reads alive) PASS');
