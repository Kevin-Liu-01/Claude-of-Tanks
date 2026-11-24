// killcam-first-frame-276 (Kevin 2026-11-24, playing Air Support: "the first shot of the instant replays starts from
// where you are then snaps you back to where you died"): every replay's first presented frame is its first shot, posed
// before it is drawn. The real frame owners run here as main.ts composes them: the main frame (app/mainFrameRuntime.ts),
// the battle frame (game/battleFrameRuntime.ts), the result runtime that picks the death's shape and fires its replay
// (game/battleResultPresentationRuntime.ts), the camera rig (engine/cameraRig.ts) and the kill cam (game/killcam.ts). A
// killer 120 m off fires one round into the player and drives on; the live presentation paints every hull at its live
// pose each frame, as battlePresentationRuntime.ts does. The death runs into its replay on the frame clock:
//   full   Standard (no respawn): the death orbit, the 2.15 s beat, then the replay, which glides from the orbit's pose;
//   quick  Zone Control (6 s respawn): the 1 s beat on the live chase view, then the cut to the killer's firing pose;
//   binoculars  Air Support (8 s respawn) with the strike view's binoculars up when the round lands: the quick cam.
// Each case asserts, at the post chain's draw (the presented frame):
//   1. frame 1 of the replay (the first draw with the kill cam on screen) is drawn from the pose the replay planned for
//      its first shot (the camera pose begin() set, within 1 mm, 0.05 degrees and 0.01 degrees of lens);
//   2. on frame 1 the killer stands at its recorded firing pose, not where it has driven since (the shot's own frame);
//   3. on every frame of the shot, before the hit and after it (the impact, the x-ray), both hulls stand at their
//      recorded poses: the killer where it fired, the player's hull where it died;
//   4. no snap in the first 10 replay frames: the camera and both hulls move less than a frame's worth between them;
//   5. (killcam-strike-shot-276) the world's markers (capture plates and arcs, objective badges, beacons, spawn rings, on
//      a Zone Control field the mode world dresses each frame) leave the screen on every frame of the replay, every
//      shot of it, and come back once the replay leaves; the zones' posts stay (killcamWorldMarkers.test-support.mjs).
//      Its planted controls: the replay's veil never reaching the world, and the veil left on after the replay leaves.
// The planted controls must fail: the replay's camera one frame late fails (1) on the cut shapes (the full cam's first
// shot glides from the live view, so a late pose is the same picture there), and one live repaint over frame 1 fails (2).
// Before the fix the frame that began a replay was presented as a live frame (its receipt sampled the kill cam before the
// result update started it), so its draw carried the live hull poses, and the flight never restaged the victim before
// the hit: 2, 3 and 4 failed for every shape (the player's hull drawn where its wreck lay through the whole shot). The browser half
// (the WebGL frames, the DOM overlay) is the lane's filmed strip (.qa-dev/killcam-first-frames.mjs).
import { StubElement } from '../ui/hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createBus } from './stateCore.ts';
import { createBattleResultPresentationRuntime } from './battleResultPresentationRuntime.ts';
import { createBattleEndingDirector } from './battleEnding.ts';
import { createBattleFrameRuntime } from './battleFrameRuntime.ts';
import { createMainFrameRuntime } from '../app/mainFrameRuntime.ts';
import { createCameraRig } from '../engine/cameraRig.ts';
import { createKillCam } from './killcam.ts';
import { strikeView } from './strikeViewState.ts';
import { createMarkerField, judgeWorldMarkers } from './killcamWorldMarkers.test-support.mjs';

assert.equal(typeof StubElement, 'function', 'setup: the recording DOM is installed');
// each battle builds its own kill cam, whose replay key listener stays on the window after its replay (one kill cam in the
// game re-adds the same function, a no-op); fourteen battles here
setMaxListeners(32, globalThis.window);
const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);
const spec = getSpec(SPEC);
const flat = { getHeightAt: () => 0 };
const DT = 1 / 60;

/** A hull whose visual is a transform the presentation and the replay both write (syncFromState), as a TankVisual's. */
function hull(id, team, x, z, yaw) {
  const root = new THREE.Object3D();
  const entity = {
    id, team, isPlayer: false, bot: true, modeActive: true, spec, specId: SPEC,
    combat: { destroyed: false, crew: {}, modules: {}, maxHp: 1000, hp: 1000 },
    state: { pos: new THREE.Vector3(x, 0, z), yaw, turretYaw: 0, gunPitch: 0, visualPitch: 0, visualRoll: 0, speed: 0 },
    input: { throttle: 0, steer: 0, fire: false, aimPoint: new THREE.Vector3() },
    aerial: null,
    visual: {
      root,
      syncFromState(state) {
        root.position.copy(state.pos);
        root.rotation.set(0, state.yaw, 0);
        root.updateMatrixWorld(true);
      },
      turretTopWorld: (out) => out.set(0, 2.4, 0).applyMatrix4(root.matrixWorld),
      gunPivotWorld: (out) => out.set(0, 2.1, 0.6).applyMatrix4(root.matrixWorld),
      gunMuzzleWorld: (out) => out.set(0, 2.1, 5.4).applyMatrix4(root.matrixWorld),
      gunDirWorld: (out) => out.set(0, 0, 1).transformDirection(root.matrixWorld),
      isDestroyed: () => entity.combat.destroyed,
      wreckState: () => (entity.combat.destroyed ? 'plain' : 'intact'),
      setDestroyed() {}, resetDestroyed() {}, setVisible() {},
    },
  };
  entity.visual.syncFromState(entity.state);
  return entity;
}

/**
 * One battle on the real frame owners. The planted controls: `latePose`, the replay's camera one frame late (every pose it
 * sets from begin() through its first presented frame reaches the rig only at its second); `liveRepaint`, one live
 * presentation pass over the replay's first frame (every hull repainted at its live pose after the replay's update).
 */
function battle({ mode, respawnS, binoculars = false, latePose = false, liveRepaint = false, veilFault = null }) {
  const bus = createBus();
  const player = hull('me', 'alpha', 0, 0, 0);
  player.isPlayer = true; player.bot = false;
  const killer = hull('k', 'bravo', 0, 120, Math.PI);
  const tanks = [player, killer];
  const game = {
    phase: 'battle', preBattleS: 0, timeS: 30, result: null, resultReason: null, gameMode: mode, player, tanks,
    tankById: new Map(tanks.map((tank) => [tank.id, tank])), shells: [], matchModeState: null,
    ruleset: { respawnS }, mpMode: null,
  };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 4000);
  const rig = createCameraRig(camera, { heightField: flat, raycast: () => null, getPlayer: () => game.player });
  rig.snapArcade(2, 0, -0.1);
  // the pose each replay planned for its first shot: every external pose set while begin() runs (the last one wins)
  const planned = { inBegin: false, pose: null, held: null, holding: false, updates: 0 };
  const rigForKillcam = Object.create(rig, {
    setExternalPose: {
      value(position, target, fov) {
        if (planned.inBegin) { planned.pose = { pos: position.clone(), look: target.clone(), fov }; planned.holding = latePose; }
        if (planned.holding) { planned.held = [position.clone(), target.clone(), fov]; return; }
        rig.setExternalPose(position, target, fov);
      },
    },
  });
  const killcam = createKillCam({
    scene: new THREE.Scene(), camera, rig: rigForKillcam, heightField: flat,
    getPlayer: () => game.player, getGame: () => game, getEntity: (id) => game.tankById.get(id) ?? null,
    isBattleEntryCovered: () => false,
  });
  const begun = (start) => {
    planned.inBegin = true;
    try { return start(); } finally { planned.inBegin = false; }
  };
  let wallMs = 1000;
  const runtime = createBattleResultPresentationRuntime({
    game, bus,
    killcam: {
      get lastBeginWallMs() { return killcam.lastBeginWallMs ?? null; },
      playQuick: (timeS, budgetS, onDone) => begun(() => killcam.playQuick(timeS, budgetS, onDone)),
      showDeathCard: (timeS) => killcam.showDeathCard(timeS),
      hideDeathCard: () => killcam.hideDeathCard(),
      playForResult: (result, timeS, onDone, options) => begun(() => killcam.playForResult(result, timeS, onDone, options)),
    },
    rig: { release: () => rig.release(), startDeathCam: () => rig.startDeathCam(), endDeathCam: () => rig.endDeathCam() },
    veilHud() {}, showEndOverlay() {}, emitPresented() {}, exitPointerLock() {}, recordFlow() {},
    ending: {
      director: createBattleEndingDirector(), camera: { begin: () => true, frame() {}, end() {} },
      modeState: () => null, emitBeat() {},
    },
    now: () => wallMs,
  });
  killcam.bindBus(bus);

  // the round: fired on the first step, 0.1 s of flight, then the lethal hit as the solo step tells it
  const shell = { id: 7, dead: false, pos: new THREE.Vector3() };
  const muzzle = killer.visual.gunMuzzleWorld(new THREE.Vector3());
  const aim = new THREE.Vector3(0, 1.2, 0);
  let step = 0, landed = false;
  const stepSimulation = () => {
    step++;
    game.timeS += DT;
    if (step === 1) {
      bus.emit('shell:fired', {
        shellId: shell.id, shooterId: killer.id, isPlayer: false, shellType: 'APFSDS', shellName: 'M829A1',
        muzzlePos: muzzle.toArray(), dir: aim.clone().sub(muzzle).normalize().toArray(), velocityMps: 1500,
        caliberMm: 120, muzzleIndex: -1, recoilScale: 1, timeS: game.timeS,
      });
      game.shells.push(shell);
    }
    if (!landed && step >= 1) {
      const u = Math.min(1, step / 6);
      shell.pos.lerpVectors(muzzle, aim, u);
      if (u >= 1) {
        landed = true;
        shell.dead = true;
        player.combat.destroyed = true;
        killcam.onShellHit({
          shellId: shell.id, targetId: player.id, attackerId: killer.id, destroyed: true, timeS: game.timeS,
          pos: aim.toArray(), normal: [0, 0, 1], localPos: [0, 1.2, 1.9], localDir: [0, 0, -1], modulesHit: [], crewHit: [],
          shellType: 'APFSDS', shellName: 'M829A1', caliberMm: 120, zone: 'hull', damage: 900, hpRemoved: 900, kind: 'pen',
        }, player);
        bus.emit('tank:destroyed', { id: player.id, killerId: killer.id, cause: 'shot' });
      }
    }
    // the killer drives on after its shot (12 m/s across the field): its live pose leaves its firing pose; the player
    // was driving at 9 m/s when the round landed and its wreck coasts on (its live pose leaves where it died)
    if (step > 1) { killer.state.pos.x += 12 * DT; killer.state.yaw = Math.PI - 0.4; }
    player.state.speed = landed ? Math.max(0, player.state.speed - 3 * DT) : 9;
    player.state.pos.x += player.state.speed * DT;
    killcam.recordSimStep(game);
  };

  const battleFrame = createBattleFrameRuntime({
    game,
    settings: { isOpen: () => false },
    killcam,
    input: { poll() {} },
    network: { isActive: () => false, pump() {} },
    countdown: { isWarmPending: () => false, advance: (s) => s, show() {}, rollout() {} },
    presentation: {
      captureSoloPose() {},
      // the live presentation: every hull painted at its live pose (battlePresentationRuntime.ts updateTank)
      update() { for (const tank of tanks) tank.visual.syncFromState(tank.state); },
      updateResult: () => runtime.update(),
    },
    getRigMode: () => rig.mode,
    stepSimulation,
    emitPause() {},
    simulationDt: DT,
  });
  // the presented frames: what the post chain draws, read at its render
  const frames = [];
  // the mode world's Zone Control field, dressed on every frame (killcamWorldMarkers.test-support.mjs)
  const markers = createMarkerField(THREE, { fault: veilFault, replayLeft: () => frames.some((f) => f.active) && !killcam.isActive() });
  const dir = new THREE.Vector3();
  let liveRigFrames = 0;
  const rigPort = Object.create(rig, {
    update: { value(dt, input) { liveRigFrames++; return rig.update(dt, input); } },
  });
  const killcamPort = {
    get fxTimeScale() { return killcam.fxTimeScale; },
    isActive: () => killcam.isActive(),
    update(dt) {
      planned.updates++;
      if (planned.holding && planned.updates >= 2) {
        planned.holding = false;
        const [p, l, f] = planned.held; planned.held = null;
        rig.setExternalPose(p, l, f);
      }
      killcam.update(dt);
      if (liveRepaint && planned.updates === 1) for (const tank of tanks) tank.visual.syncFromState(tank.state);
    },
  };
  const main = createMainFrameRuntime({
    scene: new THREE.Scene(), camera, game,
    scheduleFrame() {}, isGraphicsContextLost: () => false, syncViewportPixelRatio: () => false,
    battleEntryLifecycle: { renderingCovered: false, noteBattleFrame() {} },
    getFx: () => null, getWorld: () => null, getBaseFogDensity: () => 0,
    getStudio: () => ({ active: false, tick() {} }), getShotMode: () => false, getShotHudFrame: () => false,
    sniperFill: { update() {} }, resolveFxSubject: () => null,
    battleHudFrame: { redrawFrozen() {}, update() {} },
    lighting: { updateFov() {}, setStaticPresentationDormant() {}, setVehicleShadowMerge() {}, update() {} },
    post: {
      render() {
        camera.updateMatrixWorld(true);
        camera.getWorldDirection(dir);
        frames.push({
          active: killcam.isActive(), phase: killcam.phase, owner: rig.cameraOwner,
          pos: camera.position.clone(), dir: dir.clone(), fov: camera.fov,
          killer: killer.visual.root.position.clone(),
          firing: killcam.replayInfo?.attackerPose ? new THREE.Vector3(...killcam.replayInfo.attackerPose) : null,
          victim: player.visual.root.position.clone(),
          died: killcam.replayInfo?.targetPrePose ? new THREE.Vector3(...killcam.replayInfo.targetPrePose) : null,
          world: markers.count(),
        });
      },
    },
    showroom: { moving: false, update() {} }, pedestal: { switchPending: false },
    networkSession: { pump() {} },
    garageFramePacer: { noteActivity() {}, shouldRender: () => true },
    battleFrame,
    isBattleLoadCovering: () => false, isPresentationRestoreCovering: () => false,
    isTransitionHoldingSceneForFadeIn: () => false,
    cameraInput: { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false, autoAimPoint: null },
    getMobileAutoAim: () => null,
    rig: rigPort, killcam: killcamPort, veilHud() {},
    worldFramePresentation: { update() {} },
    // the mode world (matchModeWorldPresentation.ts) dressing the Zone Control field each frame; the planted faults: the
    // replay's veil never reaching it, and the veil left on after the replay leaves
    matchModeWorld: { update: () => markers.update(game.timeS) },
    audioListener: { update() {} },
    isGaragePresentationDirty: () => false, clearGaragePresentationDirty() {}, perfHud: { update() {} },
  });
  let nowMs = 0;
  const tick = () => { nowMs += 1000 * DT; wallMs += 1000 * DT; main.tick(nowMs); };
  tick(); // the first paint (no interval)
  if (binoculars) {
    // Air Support's strike view: the binoculars up (the HUD's toggle; the rig enters its scope and holds it)
    strikeView.open = true;
    for (let i = 0; i < 4; i++) tick();
    assert.equal(rig.mode, 'SNIPER', 'setup: the binoculars are up when the round lands');
  }
  // the whole replay: from its first frame to its exit's dip
  for (let i = 0; i < 4000 && !frames.some((f) => f.active && f.phase === 'exit'); i++) tick();
  strikeView.open = false;
  // the replay leaves the screen on its own (its exit's dip), then a few live frames
  for (let i = 0; i < 600 && killcam.isActive(); i++) tick();
  if (killcam.isActive()) killcam.cancel();
  for (let i = 0; i < 5; i++) tick();
  const first = frames.findIndex((f) => f.active);
  assert.ok(first > 0, `setup: ${mode}: a replay reached the screen (owner ${rig.cameraOwner}, phase ${killcam.phase})`);
  const result = { frames, first, planned: planned.pose, replayFrames: frames.slice(first, first + 10), liveRigFrames };
  killcam.cancel();
  markers.dispose();
  return result;
}

const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI;
/** The three rules for one run; each failure is a line. */
function judge(label, run) {
  const wrong = [];
  const one = run.frames[run.first];
  const plan = run.planned;
  if (!plan) wrong.push(`${label}: the replay planned no first-shot pose`);
  else {
    const want = plan.look.clone().sub(plan.pos).normalize();
    const dPos = one.pos.distanceTo(plan.pos), dDir = angle(one.dir, want), dFov = Math.abs(one.fov - plan.fov);
    if (!(dPos <= 1e-3 && dDir <= 0.05 && dFov <= 0.01)) {
      wrong.push(`${label}: frame 1 is not drawn from shot 1's planned pose (off ${dPos.toFixed(3)} m, `
        + `${dDir.toFixed(2)} deg, lens ${dFov.toFixed(2)} deg; drawn from [${one.pos.toArray().map((v) => v.toFixed(1))}], `
        + `planned [${plan.pos.toArray().map((v) => v.toFixed(1))}])`);
    }
  }
  if (one.firing && one.killer.distanceTo(one.firing) > 0.05) {
    wrong.push(`${label}: on frame 1 the killer is drawn ${one.killer.distanceTo(one.firing).toFixed(2)} m from its firing `
      + 'pose (where it has driven since, not where it fired)');
  }
  if (one.died && one.victim.distanceTo(one.died) > 0.05) {
    wrong.push(`${label}: on frame 1 the player's hull is drawn ${one.victim.distanceTo(one.died).toFixed(2)} m from where it `
      + 'died (where its wreck lies now)');
  }
  for (let i = 1; i < run.replayFrames.length; i++) {
    const a = run.replayFrames[i - 1], b = run.replayFrames[i];
    const camJump = a.pos.distanceTo(b.pos), turn = angle(a.dir, b.dir);
    const killerJump = a.killer.distanceTo(b.killer), victimJump = a.victim.distanceTo(b.victim);
    // a frame's worth: the replay's fastest move (the approach's glide) covers under 3 m and 6 degrees a frame here
    if (camJump > 3 || turn > 6 || killerJump > 0.5 || victimJump > 0.5) {
      wrong.push(`${label}: replay frame ${i} -> ${i + 1} snaps (camera ${camJump.toFixed(2)} m, ${turn.toFixed(1)} deg; `
        + `killer ${killerJump.toFixed(2)} m; player's hull ${victimJump.toFixed(2)} m)`);
    }
  }
  // on every frame of the shot, before the hit and after it (the impact, the x-ray), both hulls stand at their recorded
  // poses: the player's hull where it died (the hit's restage never snaps it back from where its wreck lies now), the
  // killer where it fired
  for (const [when, phases] of [['before the hit', ['approach', 'firing', 'flight', 'contact']], ['after the hit', ['impact', 'xray']]]) {
    const shown = run.frames.slice(run.first).filter((f) => f.active && phases.includes(f.phase) && f.died);
    if (!shown.length) { wrong.push(`${label}: no replay frame ${when}`); continue; }
    const victimOff = shown.filter((f) => f.victim.distanceTo(f.died) > 0.05);
    const killerOff = shown.filter((f) => f.firing && f.killer.distanceTo(f.firing) > 0.05);
    if (victimOff.length) {
      wrong.push(`${label}: ${victimOff.length} of ${shown.length} frames ${when} draw the player's hull up to `
        + `${Math.max(...victimOff.map((f) => f.victim.distanceTo(f.died))).toFixed(2)} m from where it died`);
    }
    if (killerOff.length) {
      wrong.push(`${label}: ${killerOff.length} of ${shown.length} frames ${when} draw the killer up to `
        + `${Math.max(...killerOff.map((f) => f.killer.distanceTo(f.firing))).toFixed(2)} m from where it fired`);
    }
  }
  // 5. the world's markers leave the screen for the whole replay, every shot of it, and come back when it leaves
  wrong.push(...judgeWorldMarkers(label, run.frames, run.first));
  return wrong;
}

// `cut`: the first shot cuts from the live view (the quick cam's firing pose); the full cam's first shot glides from the
// live view, so its planned first pose is the live camera's and a late one is the same picture (its control is the repaint)
const CASES = [
  { label: 'full (Standard)', mode: 'standard', respawnS: null, cut: false },
  { label: 'quick (Zone Control)', mode: 'zone_control', respawnS: 6, cut: true },
  { label: 'quick (Air Support, binoculars up)', mode: 'air_support', respawnS: 8, binoculars: true, cut: true },
];
const failures = [];
for (const c of CASES) {
  const run = battle(c);
  failures.push(...judge(c.label, run));
  // the live rig never drives a frame the replay owns
  if (run.frames.slice(run.first).some((f) => f.owner !== 'external')) failures.push(`${c.label}: a replay frame was drawn under the live camera owner`);
}
// the planted controls must be caught on every shape: the camera one frame late, and one live repaint over frame 1
for (const c of CASES) {
  const late = c.cut ? judge(c.label, battle({ ...c, latePose: true })) : null;
  if (late && !late.some((line) => line.includes('frame 1 is not drawn from shot 1'))) {
    failures.push(`control: ${c.label}: a replay camera one frame late was not caught [${late.join(' | ') || 'no line'}]`);
  }
  const repaint = judge(c.label, battle({ ...c, liveRepaint: true }));
  if (!repaint.some((line) => line.includes('on frame 1 the killer')) || !repaint.some((line) => line.includes("on frame 1 the player's hull"))) {
    failures.push(`control: ${c.label}: one live repaint over frame 1 was not caught [${repaint.join(' | ') || 'no line'}]`);
  }
}
// the world's markers' planted faults must be caught on every shape: the veil never set, and the veil left on after exit
for (const c of CASES) {
  const never = judge(c.label, battle({ ...c, veilFault: 'never' }));
  if (!never.some((line) => line.includes("replay frames draw the world's markers"))) {
    failures.push(`control: ${c.label}: markers drawn through the replay were not caught [${never.join(' | ') || 'no line'}]`);
  }
  const stuck = judge(c.label, battle({ ...c, veilFault: 'stuck' }));
  if (!stuck.some((line) => line.includes('after the replay the world draws'))) {
    failures.push(`control: ${c.label}: markers left hidden after the replay were not caught [${stuck.join(' | ') || 'no line'}]`);
  }
}
if (failures.length) {
  for (const line of failures) console.error(`FAIL ${line}`);
  process.exit(1);
}
console.log(`killcamFirstFrame: PASS (${CASES.length} shapes; frame 1 is shot 1's planned pose, both hulls at their `
  + 'recorded poses on every frame of the shot, no snap in 10 frames, the world\'s markers off the screen through the replay and '
  + 'back after it; the late-camera (cut shapes), live-repaint and both veil controls are caught on each)');
