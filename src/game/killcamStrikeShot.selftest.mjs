// killcam-strike-shot-276 (Kevin 2026-11-24: "yes give air strike kills their own replay shot"): an Air Support kill
// replays its own planned shot (game/killcamStrikeShot.ts): the aircraft's run up to the round's release, the round's
// flight, the hit, then the card. The real frame owners run here as main.ts composes them (app/mainFrameRuntime.ts,
// game/battleFrameRuntime.ts, game/battleResultPresentationRuntime.ts, engine/cameraRig.ts, game/killcam.ts), with Air
// Support's own presentation of the rounds: the bridge (game/airSupportBridge.ts: the strafe's, the Maverick's and the
// AC-130's rounds as shooterless shell:fired) and the world that draws the aircraft (game/airSupportWorld.ts, the real
// airframes). Each strike kind kills the player in an Air Support battle (8 s respawn: the quick cam). The round's
// launch is the run's own (sim/strikeRuns.ts runPose / runMuzzle / runVelocity, as sim/airSupportFire.ts fires it), it
// flies on its own physics in the step, and its strike's record is the public one the world draws from. Each kind asserts:
//   1. a planned shot sequence plays: the run (none for the battery), then the round's flight, then the hit;
//   2. frame 1 of the replay is drawn from the pose the replay planned for its first shot (1 mm, 0.05 degrees);
//   3. the player's hull stands where it died on every frame before the hit;
//   4. the aircraft on screen is on its recorded run at the replay's clock: on frame i of the run shot at the run's time
//      (the release less the kind's lead, plus i frames), on every later frame at the clock the replay stages, and never
//      at its live pose; the battery's kill shows no aircraft;
//   5. no snap in the first 10 frames (the camera moves less than a frame's worth between them);
//   6. the run shot reads: the aircraft's drawn silhouette is 15-25 % of a 16:9 frame's width, whole, with the strike's
//      mark in frame on every run frame, and whole with the mark in frame in a phone's portrait frame.
// One kind also dies with the binoculars up. The planted control: the same kill with no shot (its round never
// announced: no strike record, no trace) falls back to the card alone, and the receipt must fail it on every kind.
// Before this item an airstrike kill replayed no shot of its own: the bomb's and the battery's had none at all (the card
// alone), and the strafe's, the Maverick's and the AC-130's glided from the live view onto a tracer with no aircraft.
// The browser half (the WebGL frames, the DOM overlay) is the lane's filmed strips (.qa-dev/killcam-strike-shots.mjs).
import { StubElement } from '../ui/hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
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
import { installAirSupportBridge } from './airSupportBridge.ts';
import { createAirSupportWorld } from './airSupportWorld.ts';
import { loadGunshipAirframe } from './gunshipVisual.ts';
import { strikeView } from './strikeViewState.ts';
import { strikeReplay } from './strikeReplayState.ts';
import { STRIKE_SHOT_FRAMING } from './killcamStrikeShot.ts';
import { AIR_STRIKE_WEAPONS, AIR_SUPPORT_RULES as R, GUNSHIP_WEAPONS, airStrikeFlies } from '../sim/matchRuleset.ts';
import { BOMB_GRAVITY_MPS2, bombReleaseOffsetS, missileLaunchOffsetS, runMuzzle, runPose, runVelocity } from '../sim/strikeRuns.ts';

assert.equal(typeof StubElement, 'function', 'setup: the recording DOM is installed');
const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);
await loadGunshipAirframe();
const spec = getSpec(SPEC);
const flat = { getHeightAt: () => 0 };
const DT = 1 / 60;
const HEADING = 0.35;

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
      syncFromState(state) { root.position.copy(state.pos); root.rotation.set(0, state.yaw, 0); root.updateMatrixWorld(true); },
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

/** The kind's round (the AC-130's: its 152 mm). */
const weaponOf = (kind) => (kind === 'gunship' ? GUNSHIP_WEAPONS[1] : AIR_STRIKE_WEAPONS[kind]);
/** When the kind's round leaves, from the strike's landsS (the authority's own timing: sim/airSupportFire.ts). */
const launchOffsetS = (kind) => (kind === 'bomb' ? bombReleaseOffsetS(R) : kind === 'missile' ? missileLaunchOffsetS(R, 0)
  : kind === 'strafe' ? 0.4 : kind === 'gunship' ? 4 : 0);

/**
 * One Air Support battle: a strike of `kind` kills the player. `announce` false is the planted control: the round is
 * never announced (no mode:strike_round), so the kill cam has no strike and no trace.
 */
function battle({ kind, binoculars = false, announce = true }) {
  const bus = createBus();
  installAirSupportBridge(bus);
  const t0 = 100;
  const firedS = t0 + DT; // the round leaves in the first step
  const landsS = firedS - launchOffsetS(kind);
  const record = {
    id: 7, kind, team: 'bravo', x: 0, y: 0, z: 0, heading: HEADING, calledS: landsS - R[kind].warningS, landsS,
    endS: landsS + 60, hp: 600, maxHp: 600, downedS: null, downedBy: null, mine: false,
  };
  // the round's launch, as the authority fires it
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
  const from = new THREE.Vector3(), vel = new THREE.Vector3();
  const speedMps = weaponOf(kind).velocityMps;
  const freeFall = kind === 'bomb';
  if (kind === 'artillery') from.set(-Math.sin(HEADING) * 600, 420, -Math.cos(HEADING) * 600);
  else runMuzzle(runPose(R, record, firedS, pose), kind, from);
  // the bomb's arc meets the ground near the mark; the player stands where it lands
  let victim = new THREE.Vector3(0, 0, 0);
  if (freeFall) {
    runVelocity(R, record, firedS, vel);
    for (let t = 0; t < 30; t += DT) {
      const y = from.y + vel.y * t - 0.5 * BOMB_GRAVITY_MPS2 * t * t;
      if (y <= 1.2) { victim = new THREE.Vector3(from.x + vel.x * t, 0, from.z + vel.z * t); break; }
    }
  } else vel.copy(victim).setY(1.2).sub(from).normalize().multiplyScalar(speedMps);
  const player = hull('me', 'alpha', victim.x, victim.z, 0.8);
  player.isPlayer = true; player.bot = false;
  const caller = hull('c', 'bravo', 260, 260, 0);
  const tanks = [player, caller];
  const air = { nowS: t0, points: 0, strikes: [record] };
  const game = {
    phase: 'battle', preBattleS: 0, timeS: t0, result: null, resultReason: null, gameMode: 'air_support', player, tanks,
    tankById: new Map(tanks.map((tank) => [tank.id, tank])), shells: [], matchModeState: { air, perspectiveTeam: 'alpha' },
    ruleset: { respawnS: 8 }, mpMode: null,
  };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 6000);
  const rig = createCameraRig(camera, { heightField: flat, raycast: () => null, getPlayer: () => game.player });
  rig.snapArcade(2, 0, -0.1);
  const planned = { inBegin: false, pose: null };
  const rigForKillcam = Object.create(rig, {
    setExternalPose: {
      value(position, target, fov) {
        if (planned.inBegin) planned.pose = { pos: position.clone(), look: target.clone(), fov };
        rig.setExternalPose(position, target, fov);
      },
    },
  });
  const killcam = createKillCam({
    scene: new THREE.Scene(), camera, rig: rigForKillcam, heightField: flat,
    getPlayer: () => game.player, getGame: () => game, getEntity: (id) => game.tankById.get(id) ?? null,
    isBattleEntryCovered: () => false,
  });
  const begun = (start) => { planned.inBegin = true; try { return start(); } finally { planned.inBegin = false; } };
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
  const worldRoot = new THREE.Group();
  const airWorld = createAirSupportWorld(worldRoot, { groundHeight: () => 0 });

  // the round on its own physics in the step: launched in the first step, the lethal hit where it meets the hull
  const shell = { id: 41, dead: false, pos: from.clone() };
  const aim = new THREE.Vector3(victim.x, 1.2, victim.z);
  let step = 0, landed = false, hitS = null;
  const stepSimulation = () => {
    step++;
    game.timeS += DT;
    air.nowS = game.timeS;
    if (step === 1) {
      if (announce) {
        const speed = vel.length();
        bus.emit('mode:strike_round', {
          strikeId: record.id, kind, team: 'bravo', shellId: shell.id, shellName: weaponOf(kind).name,
          shellType: weaponOf(kind).type, caliberMm: weaponOf(kind).caliberMm, velocityMps: speed,
          weaponSound: null, blastRadiusM: null, x: from.x, y: from.y, z: from.z,
          dx: vel.x / speed, dy: vel.y / speed, dz: vel.z / speed, freeFall: freeFall ? 1 : 0,
        });
      }
      game.shells.push(shell);
    }
    if (!landed && step >= 1) {
      const t = (step - 1) * DT;
      shell.pos.set(from.x + vel.x * t, from.y + vel.y * t - (freeFall ? 0.5 * BOMB_GRAVITY_MPS2 * t * t : 0), from.z + vel.z * t);
      const arrived = freeFall ? shell.pos.y <= 1.2 : shell.pos.distanceTo(from) >= aim.distanceTo(from);
      if (arrived) {
        landed = true;
        shell.dead = true;
        hitS = game.timeS;
        player.combat.destroyed = true;
        killcam.onShellHit({
          shellId: shell.id, targetId: player.id, attackerId: caller.id, attackerSource: kind === 'gunship' ? 'ac130' : kind,
          destroyed: true, timeS: game.timeS, pos: aim.toArray(), normal: [0, 1, 0], localPos: [0, 1.2, 0], localDir: [0, -1, 0],
          modulesHit: [], crewHit: [], shellType: weaponOf(kind).type, shellName: weaponOf(kind).name,
          caliberMm: weaponOf(kind).caliberMm, zone: 'hull', damage: 900, hpRemoved: 900, kind: 'pen',
        }, player);
        bus.emit('tank:destroyed', { id: player.id, killerId: caller.id, cause: 'shot' });
      }
    }
    // the wreck coasts after the hit: its live pose leaves where it died
    if (landed) player.state.pos.x += 4 * DT;
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
      update() { for (const tank of tanks) tank.visual.syncFromState(tank.state); },
      updateResult: () => runtime.update(),
    },
    getRigMode: () => rig.mode,
    stepSimulation,
    emitPause() {},
    simulationDt: DT,
  });
  const frames = [];
  const dir = new THREE.Vector3();
  const killcamPort = {
    get fxTimeScale() { return killcam.fxTimeScale; },
    isActive: () => killcam.isActive(),
    update: (dt) => killcam.update(dt),
  };
  // the aircraft on screen: the world's visible airframe (a jet's root, or the gunship's model beside its anchor)
  const aircraftObjects = () => worldRoot.children.filter((child) => child.visible && !/bomb/.test(child.name)
    && child.position.y > 20);
  const drawnAircraft = () => aircraftObjects().map((child) => child.position.clone());
  // the run shot's framing at an aspect: the aircraft's share of the frame's width (its drawn bounds projected) and
  // whether the strike's mark is inside the frame
  const corner = new THREE.Vector3(), lens = new THREE.PerspectiveCamera();
  const framingAt = (aspect) => {
    lens.position.copy(camera.position); lens.quaternion.copy(camera.quaternion);
    lens.fov = camera.fov; lens.aspect = aspect; lens.near = 0.1; lens.far = 6000;
    lens.updateProjectionMatrix(); lens.updateMatrixWorld(true);
    const craft = aircraftObjects();
    let width = 0, whole = false;
    if (craft.length === 1) {
      // the silhouette's own extent: every drawn vertex projected (a world box over a banked airframe overstates it)
      let lo = Infinity, hi = -Infinity, bottom = Infinity, top = -Infinity;
      craft[0].updateMatrixWorld(true);
      const visit = (node) => {
        if (!node.visible) return;
        const position = node.isMesh && node.geometry?.attributes?.position;
        if (position) {
          for (let v = 0; v < position.count; v++) {
            corner.fromBufferAttribute(position, v).applyMatrix4(node.matrixWorld).project(lens);
            if (corner.z < 1) {
              lo = Math.min(lo, corner.x); hi = Math.max(hi, corner.x);
              bottom = Math.min(bottom, corner.y); top = Math.max(top, corner.y);
            }
          }
        }
        for (const child of node.children) visit(child);
      };
      visit(craft[0]);
      if (hi > lo) width = (Math.min(1, hi) - Math.max(-1, lo)) / 2;
      whole = lo >= -1 && hi <= 1 && bottom >= -1 && top <= 1;
    }
    corner.set(record.x, record.y, record.z).project(lens);
    const markIn = Math.abs(corner.x) <= 1 && Math.abs(corner.y) <= 1 && corner.z < 1;
    return { width, whole, markIn };
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
          active: killcam.isActive(), phase: killcam.phase, pos: camera.position.clone(), dir: dir.clone(), fov: camera.fov,
          victim: player.visual.root.position.clone(),
          died: killcam.replayInfo?.targetPrePose ? new THREE.Vector3(...killcam.replayInfo.targetPrePose) : null,
          aircraft: drawnAircraft(),
          framing: killcam.phase === 'strike' ? { wide: framingAt(16 / 9), tall: framingAt(390 / 844) } : null,
          stagedS: strikeReplay.record ? strikeReplay.timeS : null, liveS: game.timeS,
          card: !!globalThis.document.body.classList.contains('cot-kc-live') && !killcam.isActive(),
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
    rig, killcam: killcamPort, veilHud() {},
    worldFramePresentation: { update() {} },
    // the mode world's Air Support term (matchModeWorldPresentation.ts): the aircraft from the public records
    matchModeWorld: { update: (state, timeS) => airWorld.update(state?.air ?? null, state?.perspectiveTeam ?? 'alpha', timeS) },
    audioListener: { update() {} },
    isGaragePresentationDirty: () => false, clearGaragePresentationDirty() {}, perfHud: { update() {} },
  });
  let nowMs = 0;
  const tick = () => { nowMs += 1000 * DT; wallMs += 1000 * DT; main.tick(nowMs); };
  tick();
  if (binoculars) {
    strikeView.open = true;
    for (let i = 0; i < 4; i++) tick();
    assert.equal(rig.mode, 'SNIPER', 'setup: the binoculars are up when the round lands');
  }
  for (let i = 0; i < 2400 && !frames.some((f) => f.active && f.phase === 'exit'); i++) tick();
  strikeView.open = false;
  const first = frames.findIndex((f) => f.active);
  const result = { frames, first, planned: planned.pose, record, firedS, hitS, leadS: STRIKE_SHOT_FRAMING[kind].leadS };
  killcam.cancel();
  airWorld.dispose();
  return result;
}

const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI;
const runAt = (record, timeS) => {
  const p = runPose(R, record, timeS, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
  return new THREE.Vector3(p.x, p.y, p.z);
};

function judge(label, kind, run) {
  const wrong = [];
  if (run.first < 0) return [`${label}: no planned strike shot: the kill fell back to the card alone`];
  const replay = run.frames.slice(run.first).filter((f) => f.active);
  const one = replay[0];
  // 1. the sequence: the run (flying kinds), then the round's flight, then the hit
  const order = [];
  for (const f of replay) if (order.at(-1) !== f.phase) order.push(f.phase);
  const want = airStrikeFlies(kind) ? ['strike', 'flight'] : ['flight'];
  if (order.slice(0, want.length).join(',') !== want.join(',') || !order.includes('impact')) {
    wrong.push(`${label}: the shot sequence is [${order.join(', ')}], not [${want.join(', ')}, ..., impact]`);
  }
  // 2. frame 1 is shot 1's planned pose
  const plan = run.planned;
  if (!plan) wrong.push(`${label}: the replay planned no first-shot pose`);
  else {
    const look = plan.look.clone().sub(plan.pos).normalize();
    const dPos = one.pos.distanceTo(plan.pos), dDir = angle(one.dir, look), dFov = Math.abs(one.fov - plan.fov);
    if (!(dPos <= 1e-3 && dDir <= 0.05 && dFov <= 0.01)) {
      wrong.push(`${label}: frame 1 is not drawn from shot 1's planned pose (off ${dPos.toFixed(3)} m, ${dDir.toFixed(2)} deg)`);
    }
  }
  // 3. the victim where it died, before the hit
  const preHit = replay.filter((f) => ['strike', 'flight', 'contact'].includes(f.phase) && f.died);
  const strayed = preHit.filter((f) => f.victim.distanceTo(f.died) > 0.05);
  if (strayed.length) {
    wrong.push(`${label}: ${strayed.length} of ${preHit.length} frames before the hit draw the player's hull up to `
      + `${Math.max(...strayed.map((f) => f.victim.distanceTo(f.died))).toFixed(2)} m from where it died`);
  }
  // 4. the aircraft on its recorded run at the replay's clock, never live
  if (airStrikeFlies(kind)) {
    const runStart = run.firedS - run.leadS;
    let i = 0;
    for (const f of replay) {
      const expectS = f.phase === 'strike' ? runStart + i * DT : f.stagedS;
      if (f.phase === 'strike') i++;
      if (expectS == null) { wrong.push(`${label}: a ${f.phase} frame stages no aircraft`); break; }
      if (f.phase !== 'strike' && !(expectS >= runStart - 1e-6 && expectS <= run.hitS + 6)) {
        wrong.push(`${label}: a ${f.phase} frame stages the aircraft at ${expectS.toFixed(2)} s, off its run's replay span`);
        break;
      }
      if (f.aircraft.length !== 1) { wrong.push(`${label}: a ${f.phase} frame draws ${f.aircraft.length} aircraft`); break; }
      const want = runAt(run.record, expectS), live = runAt(run.record, f.liveS);
      const off = f.aircraft[0].distanceTo(want);
      if (off > 0.05) {
        wrong.push(`${label}: on a ${f.phase} frame the aircraft is ${off.toFixed(2)} m off its recorded run at ${expectS.toFixed(2)} s`);
        break;
      }
      if (want.distanceTo(live) > 1 && f.aircraft[0].distanceTo(live) < 0.05) {
        wrong.push(`${label}: on a ${f.phase} frame the aircraft is drawn at its live pose`);
        break;
      }
    }
  } else if (replay.some((f) => f.aircraft.length)) wrong.push(`${label}: the battery's kill draws an aircraft`);
  // 5. no snap in the first 10 frames
  for (let k = 1; k < Math.min(10, replay.length); k++) {
    const a = replay[k - 1], b = replay[k];
    const jump = a.pos.distanceTo(b.pos), turn = angle(a.dir, b.dir);
    // a frame's worth: the run shot rides an aircraft at up to 220 m/s (under 4 m a frame) and the flight's handoff
    if (jump > 6 || turn > 8) wrong.push(`${label}: replay frame ${k} -> ${k + 1} snaps (camera ${jump.toFixed(2)} m, ${turn.toFixed(1)} deg)`);
  }
  // 6. the run shot reads: the aircraft is a fifth of a 16:9 frame's width (15-25 %), whole, with the mark in frame, and
  //    in a phone's portrait frame (the same lens's height) it stays whole with the mark in frame
  const runFrames = replay.filter((f) => f.framing);
  const misframed = runFrames.filter((f) => !(f.framing.wide.width >= 0.15 && f.framing.wide.width <= 0.25 && f.framing.wide.whole
    && f.framing.wide.markIn && f.framing.tall.whole && f.framing.tall.markIn));
  if (misframed.length) {
    const f = misframed[0].framing;
    wrong.push(`${label}: ${misframed.length} of ${runFrames.length} run frames misframe the aircraft (16:9 width `
      + `${(100 * f.wide.width).toFixed(0)} %, whole ${f.wide.whole}, mark ${f.wide.markIn}; portrait whole ${f.tall.whole}, mark ${f.tall.markIn})`);
  }
  return wrong;
}

const KINDS = ['strafe', 'bomb', 'missile', 'gunship', 'artillery'];
const failures = [];
for (const kind of KINDS) {
  const run = battle({ kind });
  failures.push(...judge(kind, kind, run));
}
failures.push(...judge('bomb, binoculars up', 'bomb', battle({ kind: 'bomb', binoculars: true })));
// the planted control: the kill with no shot (its round never announced) falls back to the card alone and must fail
for (const kind of KINDS) {
  const lines = judge(kind, kind, battle({ kind, announce: false }));
  if (!lines.length) failures.push(`control: ${kind}: a strike kill with no shot was not caught`);
}
if (failures.length) {
  for (const line of failures) console.error(`FAIL ${line}`);
  process.exit(1);
}
console.log(`killcamStrikeShot: PASS (${KINDS.length} strike kinds and the binoculars: each kill plays its planned shot, frame 1 `
  + 'is its first planned pose, the victim held pre-hit, the aircraft on its recorded run; the no-shot control is caught on each)');
