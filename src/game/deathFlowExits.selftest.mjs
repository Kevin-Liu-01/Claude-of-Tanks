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
//      Neither path reaches a restart today (every entry runs reset(): activationRuntime.ts,
//      soloBattleStartRuntime.ts; Watch is solo, which never hears 'battle:restarted'; a Watch seat is taken only
//      after the driven hull's replay ended: watchController.ts drivenHandoff waits for !killcam.isActive()), so 1 and
//      2 are the owner's transitions.
//   3. The player's hull revived by its mode while its death replay is on screen, in a mode whose deaths are not
//      final without a respawn timer (Horde: matchRuleset.ts endless_horde respawnS null; matchModes.ts
//      startHordeWave revives every fallen ally, the human seat's hull too, 8 s after a wave is cleared, inside a
//      replay of up to 15 s). The killcam's 'mode:respawn' listener cancels the replay (killcam.ts: "the revive takes
//      the camera back"), and the cancel runs no onDone. Before, the revived hull played on under the replay's frozen
//      pin with the HUD veiled, and its next death got no death cam (deathCamShown stayed set: the runtime read a null
//      respawn timer as a final death). Both orders in which the killcam and the runtime hear the revive (the page's
//      is the runtime first: it subscribes when built, and the killcam binds its bus later).
//   4. The same revive inside the death beat, before the replay: the death orbit ends with the player's camera and
//      the beat does not fire over the living hull (before, the orbit circled it, and the beat's late fire restarted
//      it).
// Cases 1-4 fail on f60d0aa200 (14 checks) and pass now; each fails alone with its own line taken out of the runtime
// (clearPending's drop, newSeat's drop, the revive's listener, its death-cam re-arm, its hand-back). The browser half
// (the camera's motion, the replay's WebGL frames, the HUD's paint) is not reproduced here.
import { StubElement } from '../ui/hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
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

await ensureAuthorityFleet([SPEC]);
const spec = getSpec(SPEC);

/**
 * One seat's result flow on the real runtime, rig and killcam. `killcamFirst`: the killcam hears the bus's edges before
 * the runtime (the page's order is the runtime first). `respawnS`: the ruleset's respawn timer (null: Horde's, whose
 * deaths still revive at a wave's start).
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
    showEndOverlay: () => {}, emitPresented: () => {}, exitPointerLock: () => {}, recordFlow: () => {},
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
  return { bus, calls, hud, player, rig, killcam, runtime, step, kill, die, toReplay, pinNext };
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

// ---- 3. the player's hull revived by its mode while its death replay is on screen (Horde: no respawn timer)
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
{
  const label = 'a revive in the death beat';
  const s = seat({ respawnS: null });
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

if (wrong.length) {
  console.error(`deathFlowExits: the player's death flow outlived the exit that ended it:\n  ${wrong.join('\n  ')}`);
  assert.fail('every exit that ends the player\'s death replay leaves the result runtime owing nothing for it');
}
console.log('deathFlowExits: a teardown, a fresh seat and a mode\'s revive end the player\'s death flow (no stale '
  + 'hand-back at a later restart; the revive hands the HUD and the camera back, and the next death has its own) PASS');
