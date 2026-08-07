/**
 * cameraRig.js — the WoT camera: third-person arcade orbit + sniper zoom.
 *
 * Implements docs/research/movement-physics.md §9/§11 verbatim and
 * ARCHITECTURE.md §3.1.5:
 *  - one camera, two states (ARCADE orbit / SNIPER first-person), sharing one
 *    aim yaw/pitch pair so mode switches never snap the view;
 *  - arcade: spring-followed pivot 2.5 m above the turret, discrete orbit
 *    steps [24,18,13,9,6,4] m with smooth lerp, collision pull-in, terrain
 *    auto-height, pitch clamp [-65°, +15°];
 *  - sniper: camera at the gun trunnion, FOV = 60/zoom, zoom steps ×2/×4/×8
 *    (×16/×25 behind the increased-zoom flag), mouse sensitivity ÷ zoom, own
 *    hull hidden;
 *  - server-aim: raycast from the camera through screen center (max 720 m);
 *    the rig writes the result into the player's `input.aimPoint` every frame;
 *  - trauma-based rotational shake (graphics-aaa.md §11), ×0.3 in sniper;
 *  - deterministic screenshot hooks: setExternalPose / snapArcade / snapSniper.
 */
import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

const ORBIT_STEPS = [24, 18, 13, 9, 6, 4]; // meters, wheel-in moves toward the end
const SNIPER_ZOOMS_BASE = [2, 4, 8];
const SNIPER_ZOOMS_FULL = [2, 4, 8, 16, 25]; // ×16/×25 behind rig._increasedZoom
const BASE_FOV_DEG = 60;
const BASE_SENS = 0.0022; // rad per mouse px
const PITCH_MIN = THREE.MathUtils.degToRad(-65); // looking down
// Looking up: must EXCEED every tank's gun elevation limit (+18..+20° per the
// class table in movement-physics.md §7) or full elevation is uncommandable —
// close targets uphill were unaimable at the old +15°. WoT lets the camera
// look well above the horizon; the gun clamps itself at spec.gunElevationDeg
// with the atGunLimit reticle pin (movement.js).
const PITCH_MAX = THREE.MathUtils.degToRad(30);
const MAX_AIM_DIST_M = 720;
const PIVOT_ABOVE_TURRET_M = 2.5;
const PIVOT_FOLLOW_TAU_S = 0.1; // critically-damped-feel position lag
const DIST_LERP_TAU_S = 0.15; // smooth lerp between orbit steps
// >>> gameplay_feel r4: uphill framing assist -------------------------------
// Climbing toward rising ground the naive orbit buries ~85% of the frame in
// the hill face (r4 drive critique — "green wall"): WoT slides the camera up
// so the vehicle and some crest/sky stay in frame. We probe how steeply the
// terrain ahead of the pivot rises above the turret line within ~1.6 orbit
// distances and blend extra camera height (plus a small look-target lift).
const CLIMB_PROBE_N = 5;      // heightfield samples along the view azimuth
const CLIMB_PROBE_RANGE = 1.6; // × orbit distance probed ahead of the pivot
const CLIMB_FULL_RAD = 0.30;  // apparent terrain rise (rad) for full assist
// r2 (gameplay_feel critique MAJOR): 0.55 with a turret-roof reference lifted
// the camera 7+ m while DESCENDING into any bowl whose far wall rises — the
// player tank shrank to <5% of frame behind canopy. The probe now references
// the PIVOT height (a far wall must clear the whole camera pivot line before
// it counts as "uphill"), the assist only engages when the ground under/ahead
// of the hull actually RISES (CLIMB_GATE_*), and the max lift is clamped so
// the projected hull stays in the lower third of frame (atan(0.42·0.45) ≈
// 10.7° look-offset ≈ the lower-third boundary at FOV 60).
const CLIMB_LIFT_MAX = 0.42;  // max extra camera height, × orbit distance
const CLIMB_GATE_DIST_M = 9;  // near-ground slope probe ahead of the pivot
const CLIMB_GATE_LO_RAD = 0.05; // ~3° near-ground rise — assist starts
const CLIMB_GATE_HI_RAD = 0.16; // ~9° — full assist authority
const CLIMB_LOOK_FRAC = 0.45; // look-target lift as a fraction of camera lift
const CLIMB_TAU_S = 0.35;     // assist ease time constant
// <<< gameplay_feel r4 ------------------------------------------------------
const COLLISION_PAD_M = 0.3;
const CAMERA_MIN_CLEARANCE_M = 1.0; // auto-height above terrain
const TRAUMA_DECAY_PER_S = 1.4;
// Scope-in aim policy (enterSniper): the reticle's world point is PRESERVED
// across the boundary (gunnery r1, owner mandate — see enterSniper). The
// scan-lift below survives ONLY for a battle where the player has not aimed
// yet (aimTouched false): the arcade default pitch rests the aim on grass a
// dozen meters ahead and the first scope used to open on dirt.
const SNIPER_KEEP_AIM_M = 50;
const SNIPER_ENTRY_PITCH_RAD = THREE.MathUtils.degToRad(-1.5);
const SHAKE_FREQ = 11;
const SHAKE_AMP_XY = 0.045;
const SHAKE_AMP_Z = 0.03;
const SNIPER_SHAKE_SCALE = 0.3;

const _pivotTarget = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _viewDir = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
// >>> gameplay_feel r4: uphill framing assist scratch
const _lookTarget = new THREE.Vector3();
// <<< gameplay_feel r4

/** Forward direction from view yaw/pitch (yaw 0 → +Z, positive pitch → up). */
function dirFromAngles(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}

/** Index of the zoom step closest to `zoom` inside `list`. */
function nearestZoomIndex(zoom, list) {
  let best = 0;
  let bestErr = Infinity;
  for (let i = 0; i < list.length; i++) {
    const err = Math.abs(list[i] - zoom);
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  return best;
}

/**
 * @typedef {object} CamInput
 * @property {number} mouseDX - mouse delta x in px this frame
 * @property {number} mouseDY - mouse delta y in px this frame
 * @property {number} wheel - accumulated wheel notches this frame (int, ±3 max): +N zoom in, -N zoom out
 * @property {boolean} rmb - right button held (gun lock: free look, aim frozen)
 * @property {boolean} shiftPressed - Shift held (rising edge toggles sniper)
 * @property {boolean} [aimHold] - RMB hold-to-aim level (gunnery r1, settings
 *   rmbMode 'hold'): rising edge enters sniper from ARCADE, falling edge
 *   returns to the pre-scope arcade orbit with the aim ray preserved. Only
 *   an entry latched by THIS hold is exited by its release — Shift/wheel
 *   scopes are never yanked by a stray RMB release.
 * @property {boolean} [cursorAim] - CURSOR-AIM FALLBACK: pointer lock is
 *   unavailable — run the server-aim raycast through the real cursor position
 *   (cursorX/cursorY) instead of screen center; the turret then slews toward
 *   the terrain point under the cursor at its real traverse speed (the sim
 *   already chases input.aimPoint). Mouse deltas are zero in this mode.
 * @property {number} [cursorX] - cursor NDC x (-1..1) when cursorAim
 * @property {number} [cursorY] - cursor NDC y (-1..1, +y up) when cursorAim
 */

/**
 * @typedef {object} Rig
 * @property {'ARCADE'|'SNIPER'} mode
 * @property {number} zoom - sniper zoom step value (2|4|8|16|25)
 * @property {THREE.Vector3} aimPoint - server-aim raycast result, updated each frame
 * @property {number} aimDist - meters from camera to aimPoint
 * @property {(dt: number, camInput: CamInput) => void} update
 * @property {(x: number) => void} addTrauma
 * @property {() => void} enterSniper
 * @property {() => void} exitSniper
 * @property {(outOrigin: THREE.Vector3, outDir: THREE.Vector3) => void} getAimRay
 * @property {(pos: THREE.Vector3, lookAt: THREE.Vector3, fovDeg?: number) => void} setExternalPose
 * @property {(step: number, orbitYaw: number, orbitPitch: number) => void} snapArcade
 * @property {(zoom: number, aimYaw: number, aimPitch: number) => void} snapSniper
 * @property {() => void} release
 */

/**
 * Create the camera rig.
 *
 * @param {THREE.PerspectiveCamera} camera - the gameplay camera (rig drives
 *   position, rotation and fov; integration owns near/far/aspect)
 * @param {{ heightField: import('../world/terrain.js').HeightField,
 *           raycast: (origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) =>
 *             ?{ point: THREE.Vector3, normal: THREE.Vector3, dist: number, kind: string },
 *           getPlayer: () => ?object }} deps - world queries + player accessor
 * @returns {Rig}
 */
export function createCameraRig(camera, deps) {
  const { heightField, raycast, getPlayer } = deps;
  // Server-aim ray may use a richer raycast (world + enemy tank armor) so the
  // reticle sticks to vehicles; camera collision keeps the world-only raycast.
  const aimRaycast = deps.aimRaycast || raycast;
  const noise = new ImprovedNoise();

  // Shared aim angles (both modes; switching modes never snaps the view).
  let aimYaw = 0;
  let aimPitch = THREE.MathUtils.degToRad(-10);
  // RMB free-look offsets (arcade): camera moves, turret/aim stay frozen.
  let freeYaw = 0;
  let freePitch = 0;
  // gunnery r1: has the player actively mouse-aimed since the last battle
  // snap? Gates enterSniper's dirt-guard scan-lift — once the player owns the
  // pitch, scoping preserves it exactly (see enterSniper).
  let aimTouched = false;
  // gunnery r1: RMB hold-to-aim edge state (camInput.aimHold).
  let prevAimHold = false;
  let aimHoldLatched = false;

  let step = 2; // ORBIT_STEPS index — 13 m default
  let dist = ORBIT_STEPS[step];
  // gameplay_feel r6 (round critique MINOR): the arcade orbit step the player
  // scoped in FROM — Shift-exit restores it (WoT behavior) instead of dumping
  // the camera at the 4 m step inside the nearest bush.
  let preSniperStep = -1;
  const pivot = new THREE.Vector3();
  let pivotInitialized = false;
  // >>> gameplay_feel r4: current uphill camera lift in meters (eased)
  let climbLift = 0;
  // <<< gameplay_feel r4

  let external = false;
  let prevShift = false;
  let trauma = 0;
  let shakeT = 0;
  let recoil = 0; // gun-fire pitch kick (rad), decays fast — additive like shake
  let fovKick = 0; // gun-fire FOV punch (0..1), ~120 ms concussion pulse
  let lastFov = 0;
  // battle-start cinematic flyby state (null when inactive)
  let cine = null;   // { t, dur, endYaw }
  // death-cam slow orbit state (null when inactive)
  let death = null;  // { az }
  // >>> SPECTATE (killcam_endscreen r1): ally chase-cam state after the
  // player's death replay — null when inactive. The spectate camera is the
  // arcade chase grammar re-aimed at a LIVING ALLY: damped pivot follow,
  // free orbit yaw/pitch, the same collision pull-in + terrain floor as
  // solveArcade, plus an eased pose BLEND whenever the target changes so
  // cycling allies never teleports the camera (owner ask). Driven entirely
  // through rig.startSpectate / setSpectateTarget / spectateLook /
  // stopSpectate — no main.js wiring needed (killcam.js owns the flow).
  // killcam r2 FREE CURSOR ORBIT: yaw/pitch/dist carry eased TARGETS
  // (yawT/pitchT/distT) fed by spectateLook/spectateZoom — cursor motion
  // orbits the camera with chase-free-look damping instead of raw per-event
  // steps, full 360° yaw, pitch clamped, wheel zoom clamped + eased.
  let spec = null;   // { ent, yaw, yawT, pitch, pitchT, dist, distT, pivot,
                     //   blendT, blendDur, fromPos, fromLook }
  const _specFrom = new THREE.Vector3();
  const _specFromLook = new THREE.Vector3();
  const _specLook = new THREE.Vector3();
  const SPEC_DIST_M = 14;
  const SPEC_DIST_MIN = 7;   // wheel-in floor (never inside the hull)
  const SPEC_DIST_MAX = 26;  // wheel-out ceiling (ally stays readable)
  const SPEC_PITCH = THREE.MathUtils.degToRad(-13);
  const SPEC_BLEND_S = 1.05;
  const SPEC_LOOK_TAU_S = 0.085; // orbit ease toward the cursor target
  // rad per px: one full screen-width of cursor travel ≈ a full 360° walk
  // around the tank (pointer lock is not guaranteed while spectating, so an
  // unlocked cursor must reach all the way around before it hits the screen
  // edge). Damped by SPEC_LOOK_TAU_S above, so the higher gain stays smooth.
  const SPEC_SENS = BASE_SENS * 1.8;

  /** Resolve the arcade orbit pivot for the current player into `out`. */
  function pivotTargetFor(player, out) {
    if (player.visual !== null && player.visual !== undefined) {
      player.visual.turretTopWorld(out);
    } else {
      out.copy(player.state.pos);
      out.y += (player.spec && player.spec.dims ? player.spec.dims.heightM : 2.4);
    }
    out.y += PIVOT_ABOVE_TURRET_M;
    return out;
  }

  /** Resolve the sniper camera anchor (gun trunnion) into `out`. */
  function sniperAnchorFor(player, out) {
    if (player.visual !== null && player.visual !== undefined) {
      player.visual.gunPivotWorld(out);
    } else {
      out.copy(player.state.pos);
      out.y += (player.spec && player.spec.dims ? player.spec.dims.heightM : 2.4);
    }
    return out;
  }

  function setFov(fovDeg) {
    if (lastFov !== fovDeg) {
      camera.fov = fovDeg;
      camera.updateProjectionMatrix();
      lastFov = fovDeg;
    }
  }

  /** Place the arcade camera for the current angles. `snap` skips all smoothing. */
  function solveArcade(player, dt, snap) {
    pivotTargetFor(player, _pivotTarget);
    if (snap || !pivotInitialized) {
      pivot.copy(_pivotTarget);
      pivotInitialized = true;
      dist = ORBIT_STEPS[step];
      // >>> gameplay_feel r4: snaps are deterministic screenshot poses — no lift
      climbLift = 0;
      // <<< gameplay_feel r4
    } else {
      pivot.lerp(_pivotTarget, 1 - Math.exp(-dt / PIVOT_FOLLOW_TAU_S));
      dist += (ORBIT_STEPS[step] - dist) * (1 - Math.exp(-dt / DIST_LERP_TAU_S));
    }

    const viewYaw = aimYaw + freeYaw;
    const viewPitch = THREE.MathUtils.clamp(aimPitch + freePitch, PITCH_MIN, PITCH_MAX);
    dirFromAngles(viewYaw, viewPitch, _viewDir);
    _desired.copy(pivot).addScaledVector(_viewDir, -dist);

    // >>> gameplay_feel r4: uphill framing assist ---------------------------
    // How steeply does the ground ahead rise above the turret roof line
    // within CLIMB_PROBE_RANGE orbits? (0 on flat/downhill ground — the
    // reference point sits above the hull, so level terrain never engages.)
    if (!snap && dt > 0) {
      const fx = Math.sin(viewYaw), fz = Math.cos(viewYaw);
      // r2: reference the PIVOT line, not the turret roof — a bowl's far
      // wall must rise past the camera pivot before it reads as "uphill".
      const refY = pivot.y;
      let rise = 0;
      for (let i = 1; i <= CLIMB_PROBE_N; i++) {
        const d = (i / CLIMB_PROBE_N) * dist * CLIMB_PROBE_RANGE;
        const a = Math.atan2(heightField.getHeightAt(pivot.x + fx * d, pivot.z + fz * d) - refY, d);
        if (a > rise) rise = a;
      }
      // r2 gate: the assist exists for CLIMBS. Only engage when the ground
      // immediately ahead of the hull is actually rising — a far wall across
      // a depression is a view feature, not a climb, and must never pull the
      // camera off the tank.
      const hHere = heightField.getHeightAt(pivot.x, pivot.z);
      const hNear = heightField.getHeightAt(
        pivot.x + fx * CLIMB_GATE_DIST_M, pivot.z + fz * CLIMB_GATE_DIST_M);
      const nearPitch = Math.atan2(hNear - hHere, CLIMB_GATE_DIST_M);
      const gate = THREE.MathUtils.clamp(
        (nearPitch - CLIMB_GATE_LO_RAD) / (CLIMB_GATE_HI_RAD - CLIMB_GATE_LO_RAD), 0, 1);
      const liftTarget =
        THREE.MathUtils.clamp(rise / CLIMB_FULL_RAD, 0, 1) * gate * dist * CLIMB_LIFT_MAX;
      climbLift += (liftTarget - climbLift) * (1 - Math.exp(-dt / CLIMB_TAU_S));
    }
    if (climbLift > 1e-3) _desired.y += climbLift;
    // <<< gameplay_feel r4 ---------------------------------------------------

    // Collision pull-in: pivot → desired camera position.
    _rayDir.copy(_desired).sub(pivot);
    const segLen = _rayDir.length();
    if (segLen > 1e-4) {
      _rayDir.multiplyScalar(1 / segLen);
      const hit = raycast(pivot, _rayDir, segLen);
      if (hit !== null) {
        _desired.copy(hit.point).addScaledVector(hit.normal, COLLISION_PAD_M);
      }
    }

    // Auto height: never let the camera go subterranean behind the tank.
    const minY = heightField.getHeightAt(_desired.x, _desired.z) + CAMERA_MIN_CLEARANCE_M;
    if (_desired.y < minY) _desired.y = minY;

    camera.position.copy(_desired);
    camera.up.set(0, 1, 0);
    // >>> gameplay_feel r4: tip the look target up with the lift so the crest
    // and some sky come down into frame while the tank stays in the lower
    // third (plain lookAt(pivot) when the assist is idle).
    _lookTarget.copy(pivot);
    if (climbLift > 1e-3) _lookTarget.y += climbLift * CLIMB_LOOK_FRAC;
    camera.lookAt(_lookTarget);
    // <<< gameplay_feel r4
    setFov(BASE_FOV_DEG);
    camera.userData.scoped = false;
  }

  /** Place the sniper camera: glued to the gun, view = aim angles instantly. */
  function solveSniper(player) {
    sniperAnchorFor(player, _desired);
    camera.position.copy(_desired);
    const viewPitch = THREE.MathUtils.clamp(aimPitch, PITCH_MIN, PITCH_MAX);
    camera.rotation.set(viewPitch, aimYaw + Math.PI, 0, 'YXZ');
    setFov(BASE_FOV_DEG / rig.zoom);
    // fx reads this: own-gun muzzle-flash geometry is hidden in the scope
    // (WoT behavior) and replaced by the light flash + reticle kick
    camera.userData.scoped = true;
  }

  // CURSOR-AIM FALLBACK state (set per update from camInput; snaps reset it so
  // deterministic screenshot poses always aim through screen center).
  let cursorAimOn = false;
  let cursorNdcX = 0;
  let cursorNdcY = 0;

  /** Server-aim raycast from the camera through screen center — or through
   *  the real cursor position in cursor-aim mode (both camera modes). */
  function updateAim(player) {
    if (cursorAimOn) {
      camera.updateMatrixWorld();
      _rayDir.set(cursorNdcX, cursorNdcY, 0.5).unproject(camera)
        .sub(camera.position).normalize();
    } else {
      camera.getWorldDirection(_rayDir);
    }
    const hit = aimRaycast(camera.position, _rayDir, MAX_AIM_DIST_M);
    if (hit !== null) {
      rig.aimPoint.copy(hit.point);
      rig.aimDist = hit.dist;
    } else {
      rig.aimPoint.copy(camera.position).addScaledVector(_rayDir, MAX_AIM_DIST_M);
      rig.aimDist = MAX_AIM_DIST_M;
    }
    writePlayerAim(player);
  }

  /** Push the rig's aim point into the player's input (every update). */
  function writePlayerAim(player) {
    if (player.input && player.input.aimPoint) player.input.aimPoint.copy(rig.aimPoint);
  }

  /** Set own-hull visibility (hidden while in sniper — camera is inside the tank). */
  function applyPlayerVisibility(player, visible) {
    if (player && player.visual !== null && player.visual !== undefined) {
      player.visual.root.visible = visible;
    }
  }

  // Sun azimuth of the fixed lighting rig (sky.js: elevation 35°, azimuth
  // 140° — world sun dir ≈ (0.527, 0.574, -0.627)). The flyby keeps the
  // camera on the sun side of the hero tank: the r6 flyby opened on an unlit
  // black silhouette in its own terrain shadow.
  const SUN_DIR_X = 0.527, SUN_DIR_Z = -0.627;

  const _cineLook = new THREE.Vector3();

  // --- cinematic letterbox (rig-owned DOM) ----------------------------------
  // The flyby must READ as an authored cinematic, not a camera bug: two black
  // bars own the frame while cine is active. Created lazily (headless-safe),
  // torn between by every path that cancels the cinematic. main.js
  // additionally veils the battle HUD while rig.cinematicActive (see the
  // cinematicActive getter note).
  let letterboxEl = null;
  function setLetterbox(on) {
    if (typeof document === 'undefined') return;
    if (!letterboxEl) {
      if (!on) return;
      letterboxEl = document.createElement('div');
      letterboxEl.className = 'cot-cine-letterbox';
      letterboxEl.style.cssText =
        'position:fixed;inset:0;z-index:59;pointer-events:none;display:none;';
      for (const side of ['top:0', 'bottom:0']) {
        const bar = document.createElement('div');
        bar.style.cssText =
          `position:absolute;left:0;right:0;${side};height:11vh;background:#000;`;
        letterboxEl.appendChild(bar);
      }
      document.body.appendChild(letterboxEl);
    }
    letterboxEl.style.display = on ? 'block' : 'none';
  }

  /**
   * Solve the battle-start flyby at cine.t; returns false when finished.
   * r5 rebuild: the old quintic crane-down parked at the chase pose by 1 s of
   * a "3 s" cinematic (r4: static for frames 3-10 of 10). Now a real authored
   * path — open 45 m out low over the advance route, sweep laterally past the
   * hull (terrain parallax, nonzero velocity throughout), then swing onto the
   * chase pose over the last beat. The camera LOOK starts down the battle
   * line and converges onto the tank, so the sweep reveals the objective.
   */
  function solveCinematic(player, dt) {
    cine.t += dt;
    camera.userData.scoped = false;
    const kLin = THREE.MathUtils.clamp(cine.t / cine.dur, 0, 1);
    // r6 HOLD BEAT (critic: "flyby is ~2 s and weakly composed ... fully over
    // with HUD up by 2.2 s"): the path parameter now decelerates through the
    // mid-arc — the camera visibly LINGERS on the hero close-up (~0.45x path
    // speed around k=0.5) and accelerates out onto the chase pose. Total
    // screen time comes from startCinematic's 4 s floor.
    const k = THREE.MathUtils.clamp(
      kLin + 0.55 * Math.sin(Math.PI * 2 * kLin) / (Math.PI * 2), 0, 1);
    pivotTargetFor(player, _pivotTarget);
    // path position: world-frame offsets from the (moving) pivot
    cine.curve.getPoint(k < 0.97 ? k : 0.97 + (k - 0.97) * 0.999, _desired);
    _desired.add(_pivotTarget);
    // r2 minimum standoff: the swing-behind segment could cut directly over
    // the rear deck (~2.5 m off the hull at k≈0.83), clipping through the
    // exhaust plume right before handoff. Enforce a hull-sphere standoff —
    // the camera is pushed radially out (never below) when it dips inside.
    {
      const vis = player && player.visual;
      const standR = Math.max(4.2, (vis && vis.boundingRadiusM ? vis.boundingRadiusM : 3) + 2.2);
      const dx = _desired.x - _pivotTarget.x;
      const dy = _desired.y - _pivotTarget.y;
      const dz = _desired.z - _pivotTarget.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 1e-4 && d < standR) {
        const push = standR / d;
        _desired.x = _pivotTarget.x + dx * push;
        _desired.y = _pivotTarget.y + Math.max(dy * push, dy); // never push down
        _desired.z = _pivotTarget.z + dz * push;
      }
    }
    const minY = heightField.getHeightAt(_desired.x, _desired.z) + 1.3;
    if (_desired.y < minY) _desired.y = minY;
    camera.position.copy(_desired);
    camera.up.set(0, 1, 0);
    // look: a SHORT lead down the advance route converging onto the hero tank
    // from the very first frame. r5 motion capture: the old 40 m lead (held
    // until k=0.12, converged at 0.72) pointed the camera at empty road for
    // ~1.4 s of the 3 s sweep with the hull fully off-screen — every battle
    // opened on what read as a camera bug. A 14 m lead keeps the hull inside
    // the left third at k=0 (camera opens 45 m out) while still revealing the
    // battle line; converged fully by k=0.6.
    // r4: lead 14 -> 9 m and converge by k=0.5 — with the tightened r4 path
    // (opens 36 m out) the 14 m lead pushed the hull to the frame edge for
    // the first beat; 9 m keeps the hero inside the middle third from the
    // opening frame while still reading the advance route.
    // r6 (critic: flyby_08 "clips the hero tank at the bottom frame edge
    // with 55% empty sky"): lead 9 -> 7 m, the downward look bias cut to
    // -0.3, and convergence pulled in to k=0.32 — the hull is fully inside
    // frame from k~0.15 and OWNS the frame through the mid-arc hold beat.
    const s = THREE.MathUtils.smoothstep(k, 0.0, 0.32);
    _cineLook.copy(_pivotTarget)
      .addScaledVector(cine.fwd, 7 * (1 - s))
      .addScaledVector(_UPV, -0.3 * (1 - s));
    camera.lookAt(_cineLook);
    // FOV 72 -> 60: wide establishing breath tightening onto gameplay FOV
    setFov(BASE_FOV_DEG + 12 * (1 - k));
    return cine.t < cine.dur;
  }
  const _UPV = new THREE.Vector3(0, 1, 0);

  /**
   * SPECTATE solve: damped chase orbit around the spectated ally with the
   * same collision pull-in / terrain floor as solveArcade, wrapped in an
   * eased position+look blend while a target handover is in flight. The
   * blend's FROM pose is wherever the camera actually was when the handover
   * started (previous ally, death cam, killcam exit) so the cut is always a
   * continuous camera move, never a teleport.
   * @param {number} dt render delta seconds
   */
  function solveSpectate(dt) {
    const ent = spec.ent;
    if (!ent || !ent.state) return;
    camera.userData.scoped = false;
    // pivot: damped follow of the ally's turret line (arcade grammar)
    pivotTargetFor(ent, _pivotTarget);
    if (spec.pivot === null) {
      spec.pivot = new THREE.Vector3().copy(_pivotTarget);
    } else {
      spec.pivot.lerp(_pivotTarget, 1 - Math.exp(-dt / PIVOT_FOLLOW_TAU_S));
    }
    // killcam r2: ease the live orbit toward the cursor-fed targets — the
    // free orbit damps like the chase cam's smoothed free look instead of
    // stepping per mousemove event, and the wheel dist glides between stops
    if (dt > 0) {
      const kLook = 1 - Math.exp(-dt / SPEC_LOOK_TAU_S);
      spec.yaw += (spec.yawT - spec.yaw) * kLook;
      spec.pitch += (spec.pitchT - spec.pitch) * kLook;
      spec.dist += (spec.distT - spec.dist) * (1 - Math.exp(-dt / DIST_LERP_TAU_S));
    }
    const viewPitch = THREE.MathUtils.clamp(spec.pitch, PITCH_MIN, PITCH_MAX);
    dirFromAngles(spec.yaw, viewPitch, _viewDir);
    _desired.copy(spec.pivot).addScaledVector(_viewDir, -spec.dist);
    // collision pull-in: pivot -> desired camera position (solveArcade pattern)
    _rayDir.copy(_desired).sub(spec.pivot);
    const segLen = _rayDir.length();
    if (segLen > 1e-4) {
      _rayDir.multiplyScalar(1 / segLen);
      const hit = raycast(spec.pivot, _rayDir, segLen);
      if (hit !== null) _desired.copy(hit.point).addScaledVector(hit.normal, COLLISION_PAD_M);
    }
    const minY = heightField.getHeightAt(_desired.x, _desired.z) + CAMERA_MIN_CLEARANCE_M;
    if (_desired.y < minY) _desired.y = minY;
    _specLook.copy(spec.pivot);
    // eased handover blend (target switch / spectate entry)
    if (spec.blendT < spec.blendDur) {
      spec.blendT = Math.min(spec.blendDur, spec.blendT + Math.max(0, dt));
      const u = spec.blendT / spec.blendDur;
      const k = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
      _desired.lerpVectors(spec.fromPos, _desired, k);
      _specLook.lerpVectors(spec.fromLook, _specLook, k);
      // the interpolated path must respect the terrain floor too — a blend
      // across a ridge otherwise dips the camera through the crest
      const bMinY = heightField.getHeightAt(_desired.x, _desired.z) + CAMERA_MIN_CLEARANCE_M;
      if (_desired.y < bMinY) _desired.y = bMinY;
    }
    camera.position.copy(_desired);
    camera.up.set(0, 1, 0);
    camera.lookAt(_specLook);
    setFov(55);
  }

  /** Capture the live camera pose as the FROM side of a spectate blend. */
  function specCaptureFrom() {
    _specFrom.copy(camera.position);
    camera.getWorldDirection(_viewDir);
    _specFromLook.copy(camera.position).addScaledVector(_viewDir, SPEC_DIST_M);
  }

  /** Hand control back to the arcade rig exactly where the flyby lands. */
  function endCinematic(player) {
    aimYaw = cine.endYaw;
    aimPitch = THREE.MathUtils.degToRad(-10);
    cine = null;
    setLetterbox(false);
    freeYaw = 0;
    freePitch = 0;
    rig.mode = 'ARCADE';
    step = 2;
    if (player) { solveArcade(player, 0, true); updateAim(player); }
  }

  function stepZoom(dir) {
    if (rig.mode === 'ARCADE') {
      if (dir > 0 && step === ORBIT_STEPS.length - 1) rig.enterSniper();
      else step = THREE.MathUtils.clamp(step + dir, 0, ORBIT_STEPS.length - 1);
    } else {
      const zooms = rig._increasedZoom ? SNIPER_ZOOMS_FULL : SNIPER_ZOOMS_BASE;
      const i = nearestZoomIndex(rig.zoom, zooms) + dir;
      if (i < 0) rig.exitSniper();
      else rig.zoom = zooms[Math.min(i, zooms.length - 1)];
    }
  }

  const rig = {
    mode: 'ARCADE',
    zoom: SNIPER_ZOOMS_BASE[0],
    aimPoint: new THREE.Vector3(),
    aimDist: MAX_AIM_DIST_M,
    /** True while setExternalPose pins the camera (harness/killcam framing).
     * Consumers (main.js foliage occlusion focus) must not treat an external
     * capture pose as a chase camera — WoT never fades foliage in replays. */
    externalActive: false,
    /** Settings flag: unlock ×16/×25 sniper zoom steps ("increased zoom"). */
    _increasedZoom: false,
    /**
     * True while the battle-open flyby drives the camera. The rig owns the
     * cinematic LETTERBOX bars itself (setLetterbox); main.js reads this flag
     * to veil the battle HUD for the sweep's duration (a full battle HUD over
     * the opening cinematic reads as a bug — see effects_combat-r5 handoff).
     */
    get cinematicActive() { return cine !== null; },

    /**
     * Per-frame rig update (ARCHITECTURE.md §4 step 3). No-op while an
     * external pose is active. Applies mouse to the shared aim angles
     * (sensitivity ÷ zoom in sniper), handles wheel zoom stepping and
     * Shift sniper toggling, solves the active camera mode, runs the
     * server-aim raycast, writes the player's `input.aimPoint`, and applies
     * trauma shake last.
     *
     * @param {number} dt - render delta seconds
     * @param {CamInput} camInput - this frame's camera input
     * @returns {void}
     */
    update(dt, camInput) {
      if (external) return;
      const player = getPlayer();
      if (!player) return;

      // CURSOR-AIM FALLBACK: latch this frame's cursor ray inputs for
      // updateAim (main.js sets cursorAim only while a battle is live and
      // pointer lock is unavailable).
      cursorAimOn = !!camInput.cursorAim;
      if (cursorAimOn) {
        cursorNdcX = camInput.cursorX || 0;
        cursorNdcY = camInput.cursorY || 0;
      }

      // SPECTATE: ally chase-cam owns the frame (mouse/wheel/keys ignored —
      // orbit input arrives via rig.spectateLook from the spectate controller).
      if (spec) {
        solveSpectate(dt);
        return;
      }

      // Death-cam: slow orbit of the wreck (input ignored until released).
      if (death) {
        camera.userData.scoped = false;
        death.az += 0.22 * dt;
        pivotTargetFor(player, _pivotTarget);
        _pivotTarget.y -= PIVOT_ABOVE_TURRET_M * 0.6;
        const d = 15 + Math.sin(death.az * 0.7) * 1.5;
        _desired.set(
          _pivotTarget.x + Math.sin(death.az) * d * 0.93,
          _pivotTarget.y + d * 0.36,
          _pivotTarget.z + Math.cos(death.az) * d * 0.93,
        );
        const minY = heightField.getHeightAt(_desired.x, _desired.z) + CAMERA_MIN_CLEARANCE_M;
        if (_desired.y < minY) _desired.y = minY;
        camera.position.copy(_desired);
        camera.up.set(0, 1, 0);
        camera.lookAt(_pivotTarget);
        setFov(50);
        return;
      }

      // Battle-start cinematic flyby — skippable with any input.
      if (cine) {
        const skip = Math.abs(camInput.mouseDX) > 2 || Math.abs(camInput.mouseDY) > 2 ||
          camInput.wheel !== 0 || camInput.shiftPressed || camInput.rmb;
        if (skip || !solveCinematic(player, dt)) endCinematic(player);
        // controls_gunnery r6: a Shift tap must SKIP AND STILL TOGGLE. The
        // tap used to be eaten by the skip (prevShift never updates in this
        // branch, so the rising edge died with the cinematic): players who
        // Shift'ed into the opening flyby landed in ARCADE with no scope
        // treatment and read sniper entry as broken (probe: mode ARCADE /
        // fov 60 after a mid-flyby tap; the critic's "live sniper entry has
        // no vignette" frame is exactly this failure). A shift-skip now
        // falls through so the rising-edge toggle below fires this same
        // frame; every other skip input (and the natural end) returns as
        // before.
        if (!(camInput.shiftPressed && cine === null)) return;
      }

      // Shift toggles sniper on the rising edge.
      if (camInput.shiftPressed && !prevShift) {
        if (rig.mode === 'ARCADE') rig.enterSniper();
        else rig.exitSniper(true); // gameplay_feel r6: restore pre-scope orbit
      }
      prevShift = camInput.shiftPressed;

      // RMB HOLD-TO-AIM (gunnery r1, settings rmbMode 'hold' — the default):
      // press enters sniper, release returns to the pre-scope arcade orbit
      // with the aim ray preserved (bug-2 rules). The latch ties the exit to
      // an entry THIS hold made: releasing RMB over a Shift- or wheel-entered
      // scope must not kick the player out of it.
      if (camInput.aimHold && !prevAimHold) {
        if (rig.mode === 'ARCADE') {
          aimHoldLatched = true;
          rig.enterSniper();
        }
      } else if (!camInput.aimHold && prevAimHold && aimHoldLatched) {
        aimHoldLatched = false;
        if (rig.mode === 'SNIPER') rig.exitSniper(true);
      }
      if (!camInput.aimHold && aimHoldLatched && rig.mode === 'ARCADE') {
        aimHoldLatched = false; // scope left by other means mid-hold
      }
      prevAimHold = !!camInput.aimHold;

      // Consume ALL wheel notches accumulated this frame (main.js clamps to
      // ±3): fast flicks used to collapse to one step per render frame.
      if (camInput.wheel) {
        const wDir = camInput.wheel > 0 ? 1 : -1;
        for (let n = Math.min(Math.abs(camInput.wheel | 0), 3); n > 0; n--) stepZoom(wDir);
      }

      const sens = rig.mode === 'SNIPER' ? BASE_SENS / rig.zoom : BASE_SENS;
      if (camInput.rmb) {
        // Gun lock: camera orbits freely, aim (and turret) frozen.
        if (rig.mode === 'ARCADE') {
          freeYaw += camInput.mouseDX * sens;
          freePitch = THREE.MathUtils.clamp(
            freePitch - camInput.mouseDY * sens,
            PITCH_MIN - aimPitch,
            PITCH_MAX - aimPitch,
          );
        } else {
          // SNIPER gun lock: the view still follows the mouse (WoT mantlet
          // wiggle); the aim raycast below stays skipped, so the gun holds.
          aimYaw += camInput.mouseDX * sens;
          aimPitch = THREE.MathUtils.clamp(
            aimPitch - camInput.mouseDY * sens, PITCH_MIN, PITCH_MAX);
        }
      } else {
        freeYaw = 0;
        freePitch = 0;
        if (camInput.mouseDX !== 0 || camInput.mouseDY !== 0) aimTouched = true;
        aimYaw += camInput.mouseDX * sens;
        aimPitch = THREE.MathUtils.clamp(aimPitch - camInput.mouseDY * sens, PITCH_MIN, PITCH_MAX);
      }

      applyPlayerVisibility(player, rig.mode !== 'SNIPER');
      if (rig.mode === 'ARCADE') solveArcade(player, dt, false);
      else solveSniper(player);

      if (!camInput.rmb) updateAim(player); // RMB: aim raycast frozen (gun lock)
      else writePlayerAim(player); // …but the (frozen) aim point is still published

      // Trauma shake — additive rotational only, after the solve.
      trauma = Math.max(0, trauma - TRAUMA_DECAY_PER_S * dt);
      shakeT += dt;
      // Sniper idle drift: subtle low-frequency handheld wander + breathing
      // bob, additive AFTER the aim raycast so the reticle stays truthful.
      if (rig.mode === 'SNIPER') {
        camera.rotation.x += 0.0011 * noise.noise(shakeT * 0.45, 11.7, 0) +
          0.0004 * Math.sin(shakeT * 1.9);
        camera.rotation.y += 0.0013 * noise.noise(4.2, shakeT * 0.38, 0);
      }
      if (trauma > 0) {
        // t^1.6 (was t^2): a 0.35-trauma hit now lands a clearly readable
        // ~0.7 deg flinch instead of a sub-pixel wobble
        const s = Math.pow(trauma, 1.6) * (rig.mode === 'SNIPER' ? SNIPER_SHAKE_SCALE : 1);
        camera.rotation.x += SHAKE_AMP_XY * s * noise.noise(shakeT * SHAKE_FREQ, 0, 0);
        camera.rotation.y += SHAKE_AMP_XY * s * noise.noise(0, shakeT * SHAKE_FREQ, 0);
        camera.rotation.z += SHAKE_AMP_Z * s * noise.noise(0, 0, shakeT * SHAKE_FREQ);
      }
      // Recoil pitch kick — sharp upward bump on fire, fast exponential return.
      // Sniper keeps a STRONG reticle kick (0.55): with own-gun flash geometry
      // hidden in the scope, the kick is what sells the shot.
      if (recoil > 1e-4) {
        camera.rotation.x += recoil * (rig.mode === 'SNIPER' ? 0.55 : 1);
        recoil *= Math.exp(-dt / 0.09);
      } else {
        recoil = 0;
      }
      // FOV punch on fire (effects_combat r7: "fire-kick not readable in
      // motion") — a 2-3 frame wide-angle pulse that reads as concussion.
      // Applied AFTER the mode solve set the base fov; decays in ~120 ms.
      // Scoped keeps a fraction so the zoom optics only flinch.
      if (fovKick > 0.02) {
        const base = lastFov;
        // 0.075 (was 0.045) over ~0.08 s: a 4.5-deg concussion pulse that
        // survives 3-5 rendered frames (r5: the shot was a non-event from the
        // chase camera — flash sub-100 ms, kick sub-pixel).
        setFov(base * (1 + 0.075 * fovKick * (rig.mode === 'SNIPER' ? 0.25 : 1)));
        lastFov = base; // next solve compares against the UNKICKED base
        fovKick *= Math.exp(-dt / 0.08);
      } else if (fovKick !== 0) {
        // pulse over — snap the projection back to the unkicked base
        // (setFov would no-op: lastFov already holds the base value)
        fovKick = 0;
        camera.fov = lastFov;
        camera.updateProjectionMatrix();
      }
    },

    /**
     * Add camera-shake trauma (fire 0.25, hit 0.45, near explosion 0.7).
     * @param {number} x - trauma to add, result clamped to [0, 1]
     * @returns {void}
     */
    addTrauma(x) {
      trauma = Math.min(1, trauma + x);
    },

    /**
     * Camera recoil kick when the player's gun fires: an instant upward pitch
     * impulse (visual only — aim angles are untouched) that eases back in
     * ~0.25 s. Complements the noise-based trauma shake.
     * @param {number} [x=0.012] - pitch impulse in radians
     * @returns {void}
     */
    recoilKick(x = 0.012) {
      // 2.4x the caller impulse (r5 motion capture: even the r7 1.5x kick was
      // imperceptible across a 13-frame burst from the 13 m chase orbit — a
      // 120 mm shot must visibly punch the camera) + arm the FOV punch.
      recoil = Math.min(0.055, recoil + x * 2.4);
      fovKick = 1;
    },

    /**
     * Start the battle-open cinematic: a ~3 s flyby sweeping from a high
     * front-quarter arc down onto the arcade chase pose behind the player
     * tank. Any camera input skips it instantly.
     * @param {number} [durS=3] sweep duration in seconds
     * @returns {void}
     */
    startCinematic(durS = 3) {
      spec = null; // SPECTATE never survives into a fresh battle flyby
      // r6 (critic: "battle-start flyby is ~2 s ... over with HUD up by
      // 2.2 s"): 4 s floor regardless of the caller's legacy constant — the
      // authored sweep + mid-arc hold beat needs the screen time, and every
      // input still skips it instantly.
      durS = Math.max(4.0, durS);
      const player = getPlayer();
      death = null;
      trauma = 0;
      const endYaw = player && player.state ? player.state.yaw : aimYaw;
      // r5 authored path (world-frame offsets from the pivot, Catmull-Rom):
      // open 45 m ahead over the advance route on the SUN side, sweep
      // laterally past the hull at speed (parallax against terrain), then
      // swing behind onto the exact arcade chase pose. Camera velocity stays
      // nonzero until the final blend — no parked frames.
      const fwd = new THREE.Vector3(Math.sin(endYaw), 0, Math.cos(endYaw));
      const right = new THREE.Vector3(Math.cos(endYaw), 0, -Math.sin(endYaw));
      // pick the lateral side the sun lives on so the hero hull is lit
      const side = (right.x * SUN_DIR_X + right.z * SUN_DIR_Z) >= 0 ? 1 : -1;
      const P = (rx, y, fz, out = new THREE.Vector3()) =>
        out.set(0, y, 0).addScaledVector(right, rx * side).addScaledVector(fwd, fz);
      // exact chase-pose offset (solveArcade: pivot - dir(endYaw, -10deg) * 13 m)
      dirFromAngles(endYaw, THREE.MathUtils.degToRad(-10), _viewDir);
      const chase = new THREE.Vector3().addScaledVector(_viewDir, -ORBIT_STEPS[2]);
      // r2: 4th waypoint routed wider + higher (7.5,0.6,-9 -> 9.5,1.6,-10) —
      // the old swing-behind cut over the rear deck through the exhaust
      // plume at ~2.5 s; paired with the solve-time hull standoff clamp.
      // r4 HERO FRAMING: the whole arc pulled in — the old path (open 51 m
      // out, lateral pass at 10 m) peaked the player tank at ~15% of frame
      // width ("the flyby never features the hero tank"). Opens 36 m out
      // with the hull already readable, and the low lateral beat passes at
      // ~6.5 m — a 3/4 close-up where the hull fills ~40% of frame height —
      // before swinging up onto the chase pose. The hull-sphere standoff
      // clamp below still guarantees no clip.
      const curve = new THREE.CatmullRomCurve3([
        P(18, 2.2, 31),
        P(11, 0.4, 14),
        P(6.5, -0.5, 2.5),
        P(6.8, 0.9, -7.5),
        chase,
      ], false, 'centripetal', 0.5);
      cine = {
        t: 0,
        dur: Math.max(0.5, durS),
        endYaw,
        fwd,
        curve,
      };
      setLetterbox(true);
      rig.mode = 'ARCADE';
      applyPlayerVisibility(player, true);
    },

    /**
     * Start the death-cam: a slow orbit around the player's wreck. Runs until
     * a snap/external pose or a new cinematic takes over.
     * @returns {void}
     */
    startDeathCam() {
      cine = null;
      spec = null; // SPECTATE: a fresh death cam always retires the ally chase
      setLetterbox(false);
      trauma = 0;
      const player = getPlayer();
      death = { az: player && player.state ? player.state.yaw + Math.PI * 0.75 : 0 };
      rig.mode = 'ARCADE';
      applyPlayerVisibility(player, true);
    },

    // --- SPECTATE (killcam_endscreen r1) ------------------------------------

    /** True while the ally spectate chase-cam owns the camera. */
    get spectateActive() { return spec !== null; },

    /** Entity currently spectated (null when inactive). */
    get spectateTargetEnt() { return spec ? spec.ent : null; },

    /**
     * Enter spectate on a living ally. The camera BLENDS from wherever it is
     * right now (killcam exit pose, death-cam orbit) onto a chase pose behind
     * the ally — no cut. Overrides an active death cam.
     * @param {object} ent ally TankEntity (state + visual)
     */
    startSpectate(ent) {
      if (!ent || !ent.state) return;
      death = null;
      cine = null;
      setLetterbox(false);
      trauma = 0;
      specCaptureFrom();
      spec = {
        ent,
        yaw: ent.state.yaw,          // open behind the ally's hull
        yawT: ent.state.yaw,
        pitch: SPEC_PITCH,
        pitchT: SPEC_PITCH,
        dist: SPEC_DIST_M,
        distT: SPEC_DIST_M,
        pivot: null,
        blendT: 0,
        blendDur: SPEC_BLEND_S,
        fromPos: _specFrom,
        fromLook: _specFromLook,
      };
      rig.mode = 'ARCADE';
      applyPlayerVisibility(getPlayer(), true);
    },

    /**
     * Retarget the spectate camera onto another ally with an eased blend
     * (cycling, auto-advance on target death). No-op when not spectating.
     * The orbit re-centers behind the NEW tank (yaw target reset); the
     * player's chosen zoom distance survives the switch.
     * @param {object} ent ally TankEntity
     */
    setSpectateTarget(ent) {
      if (!spec || !ent || !ent.state || ent === spec.ent) return;
      specCaptureFrom();
      spec.ent = ent;
      spec.yaw = ent.state.yaw;
      spec.yawT = ent.state.yaw;
      spec.pitch = SPEC_PITCH;
      spec.pitchT = SPEC_PITCH;
      spec.pivot = null;
      spec.blendT = 0;
      spec.blendDur = SPEC_BLEND_S;
    },

    /**
     * Free-look orbit input while spectating — cursor motion forwarded by
     * the spectate controller (killcam r2: no button hold; solveSpectate
     * eases the live angles toward these targets). Full 360° yaw, pitch
     * clamped to the arcade envelope.
     * @param {number} dxPx horizontal cursor pixels
     * @param {number} dyPx vertical cursor pixels
     */
    spectateLook(dxPx, dyPx) {
      if (!spec) return;
      spec.yawT += dxPx * SPEC_SENS;
      spec.pitchT = THREE.MathUtils.clamp(
        spec.pitchT - dyPx * SPEC_SENS, PITCH_MIN, PITCH_MAX);
    },

    /**
     * Wheel zoom while spectating (killcam r2): steps the eased orbit
     * distance target — in toward SPEC_DIST_MIN, out to SPEC_DIST_MAX.
     * @param {number} notches wheel steps (+1 out / -1 in per notch)
     */
    spectateZoom(notches) {
      if (!spec || !notches) return;
      spec.distT = THREE.MathUtils.clamp(
        spec.distT * Math.pow(1.22, notches), SPEC_DIST_MIN, SPEC_DIST_MAX);
    },

    /** Leave spectate (battle end / garage). The next owner sets the pose. */
    stopSpectate() { spec = null; },

    /**
     * Enter sniper mode. Keeps the shared aim angles (no view snap); the own
     * hull is hidden on the next solve. Zoom resumes at the last-used step.
     * @returns {void}
     */
    enterSniper() {
      if (rig.mode === 'SNIPER') return;
      rig.mode = 'SNIPER';
      preSniperStep = step; // gameplay_feel r6: restored on Shift-exit
      freeYaw = 0;
      freePitch = 0;
      // AIM PRESERVATION (gunnery r1, owner bug 2 — bidirectional with
      // exitSniper): scoping in keeps the reticle's WORLD POINT — yaw/pitch
      // are re-solved from the gun trunnion, because the camera is about to
      // jump there from the orbit position (different parallax). The old
      // unconditional close-aim scan-lift re-pitched every deliberate
      // close-quarters scope toward the horizon and, against rising ground,
      // stepped it clear up to PITCH_MAX — the SKY — with nothing ever
      // restoring it (owner: "aimed by scrolling → looking at the sky, have
      // to come down"; each in/out cycle ratcheted the pitch further up).
      //
      // The scan-lift survives for exactly one case: the player has not
      // aimed at all since the battle snapped (aimTouched false), where the
      // arcade default pitch rests the aim on grass a dozen meters ahead and
      // the first scope of a battle used to open on dirt ("aim 13 m" —
      // gameplay_feel r4). Once the player owns the aim, their pitch is
      // their pitch.
      const player = getPlayer();
      if (!aimTouched && rig.aimDist < SNIPER_KEEP_AIM_M) {
        aimPitch = Math.max(aimPitch, SNIPER_ENTRY_PITCH_RAD);
        // gameplay_feel r1: facing RISING ground the flat-ground scan pitch
        // still ray-hits the slope a few meters out (full-screen grass at
        // 6 m). Raise the entry pitch in 2-degree steps until the scope
        // opens at least SNIPER_KEEP_AIM_M into the battlefield (PITCH_MAX
        // stops the loop when a genuine wall fills the view).
        if (player) {
          sniperAnchorFor(player, _desired);
          const stepR = THREE.MathUtils.degToRad(2);
          for (let i = 0; i < 20 && aimPitch < PITCH_MAX; i++) {
            dirFromAngles(aimYaw, aimPitch, _rayDir);
            const hit = aimRaycast(_desired, _rayDir, SNIPER_KEEP_AIM_M);
            if (hit === null) break;
            aimPitch = Math.min(aimPitch + stepR, PITCH_MAX);
          }
        }
      } else if (player) {
        sniperAnchorFor(player, _desired);
        const dx = rig.aimPoint.x - _desired.x;
        const dy = rig.aimPoint.y - _desired.y;
        const dz = rig.aimPoint.z - _desired.z;
        const h = Math.hypot(dx, dz);
        if (h > 1e-3) {
          aimPitch = THREE.MathUtils.clamp(
            Math.atan2(dy, h), PITCH_MIN, PITCH_MAX);
          aimYaw = Math.atan2(dx, dz);
        }
      }
      applyPlayerVisibility(getPlayer(), false);
    },

    /**
     * Exit sniper back to arcade, with the orbit oriented behind the current
     * gun (aim yaw synced to hull yaw + turret yaw) so the camera comes out
     * behind the barrel — the classic cannon-following camera, unchanged.
     * gameplay_feel r6 (round critique MINOR): a Shift TOGGLE exit
     * (`restorePrev` true) returns to the orbit distance the player scoped
     * in from — WoT restores the pre-sniper arcade distance — while the
     * wheel-out path keeps the closest 4 m step for zoom continuity.
     *
     * PITCH PRESERVATION (gunnery r1, owner scope-aim fix — bidirectional
     * with enterSniper): the arcade PITCH is re-solved from the CURRENT
     * reticle world point (its elevation as seen from the orbit pivot), so
     * the scope's pitch — including any never-aimed entry scan-lift — can no
     * longer ratchet the arcade view toward the sky ("aimed by scrolling →
     * looking at the sky, have to come down": the old exit kept the
     * scope-mutated pitch verbatim, +8.5 deg per close-aim scope cycle).
     * Yaw stays the classic behind-the-cannon line above; only the pitch
     * component of the preserved aim ray is applied.
     *
     * Cursor-aim mode keeps the fully legacy exit (pitch untouched): there
     * the aim point is the ray through the real CURSOR, and re-solving the
     * view pitch from it would tilt the camera toward wherever the cursor
     * happened to rest.
     * @param {boolean} [restorePrev=false] restore the pre-sniper orbit step
     * @returns {void}
     */
    exitSniper(restorePrev = false) {
      if (rig.mode === 'ARCADE') return;
      rig.mode = 'ARCADE';
      step = restorePrev && preSniperStep >= 0
        ? preSniperStep
        : ORBIT_STEPS.length - 1;
      dist = ORBIT_STEPS[step];
      const player = getPlayer();
      if (player && player.state) aimYaw = player.state.yaw + player.state.turretYaw;
      if (!cursorAimOn && player) {
        pivotTargetFor(player, _pivotTarget);
        const dx = rig.aimPoint.x - _pivotTarget.x;
        const dy = rig.aimPoint.y - _pivotTarget.y;
        const dz = rig.aimPoint.z - _pivotTarget.z;
        const h = Math.hypot(dx, dz);
        if (h > 1e-3) {
          aimPitch = THREE.MathUtils.clamp(
            Math.atan2(dy, h), PITCH_MIN, PITCH_MAX);
        }
      }
      applyPlayerVisibility(player, true);
    },

    /**
     * Screen-center aim ray in world space (shared origin/direction with the
     * server-aim raycast).
     * @param {THREE.Vector3} outOrigin - receives the camera position
     * @param {THREE.Vector3} outDir - receives the unit view direction
     * @returns {void}
     */
    getAimRay(outOrigin, outDir) {
      outOrigin.copy(camera.position);
      camera.getWorldDirection(outDir);
    },

    // --- deterministic screenshot hooks -------------------------------------

    /**
     * Pin the camera to an explicit pose and suspend all rig control until
     * `release()`. Own hull is made visible (external shots frame the tank).
     * @param {THREE.Vector3} pos - world camera position
     * @param {THREE.Vector3} lookAt - world look-at target
     * @param {number} [fovDeg=50] - vertical field of view in degrees
     * @returns {void}
     */
    setExternalPose(pos, lookAt, fovDeg = 50) {
      external = true;
      rig.externalActive = true;
      cine = null;
      spec = null; // SPECTATE never survives an external pose
      setLetterbox(false);
      death = null;
      trauma = 0;
      camera.userData.scoped = false;
      applyPlayerVisibility(getPlayer(), true);
      camera.position.copy(pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(lookAt);
      setFov(fovDeg);
      camera.updateMatrixWorld(true);
    },

    /**
     * Deterministic arcade pose: snap pivot/distance (no smoothing, no shake)
     * and solve immediately. Resumes normal rig control.
     * @param {number} step_ - orbit step index 0..5 into [24,18,13,9,6,4] m
     * @param {number} orbitYaw - view yaw in radians (0 → looking down +Z)
     * @param {number} orbitPitch - view pitch in radians (negative = looking down)
     * @returns {void}
     */
    snapArcade(step_, orbitYaw, orbitPitch) {
      external = false;
      rig.externalActive = false;
      cine = null;
      spec = null; // SPECTATE: deterministic pose retires the ally chase
      setLetterbox(false);
      death = null;
      cursorAimOn = false; // deterministic pose: aim through screen center
      rig.mode = 'ARCADE';
      step = THREE.MathUtils.clamp(step_ | 0, 0, ORBIT_STEPS.length - 1);
      aimYaw = orbitYaw;
      aimPitch = THREE.MathUtils.clamp(orbitPitch, PITCH_MIN, PITCH_MAX);
      freeYaw = 0;
      freePitch = 0;
      aimTouched = false; // gunnery r1: fresh battle/staged pose — dirt-guard re-arms
      prevAimHold = false;
      aimHoldLatched = false;
      trauma = 0;
      shakeT = 0;
      const player = getPlayer();
      if (!player) return;
      applyPlayerVisibility(player, true);
      solveArcade(player, 0, true);
      updateAim(player);
      camera.updateMatrixWorld(true);
    },

    /**
     * Deterministic sniper pose: set zoom and aim angles, solve immediately
     * (own hull hidden, no shake). Resumes normal rig control.
     * @param {number} zoom - zoom factor (2|4|8|16|25)
     * @param {number} aimYaw_ - view yaw in radians
     * @param {number} aimPitch_ - view pitch in radians
     * @returns {void}
     */
    snapSniper(zoom, aimYaw_, aimPitch_) {
      external = false;
      rig.externalActive = false;
      cine = null;
      spec = null; // SPECTATE: deterministic pose retires the ally chase
      setLetterbox(false);
      death = null;
      cursorAimOn = false; // deterministic pose: aim through screen center
      rig.mode = 'SNIPER';
      rig.zoom = zoom;
      aimYaw = aimYaw_;
      aimPitch = THREE.MathUtils.clamp(aimPitch_, PITCH_MIN, PITCH_MAX);
      freeYaw = 0;
      freePitch = 0;
      aimTouched = false; // gunnery r1: staged pose — see snapArcade
      prevAimHold = false;
      aimHoldLatched = false;
      trauma = 0;
      shakeT = 0;
      const player = getPlayer();
      if (!player) return;
      applyPlayerVisibility(player, false);
      solveSniper(player);
      updateAim(player);
      camera.updateMatrixWorld(true);
    },

    /**
     * Resume normal rig control after `setExternalPose`.
     * @returns {void}
     */
    release() {
      external = false;
      rig.externalActive = false;
    },
  };

  return rig;
}

// ===========================================================================
// GARAGE CAMERA: showroom hero framing + damped drag orbit
// ===========================================================================
// The garage pedestal used to be a hard-coded eye/target pair, so the SAME
// pose framed a 4.4 m Leichttraktor and an 11 m Object 279 (small tanks sat
// lost in the middle of the bay, long-gun TDs pushed the muzzle into the stats
// card). This block replaces it with a solved pose:
//
//  - AUTO-FRAME: the selected vehicle's ORIENTED bounding box (measured in the
//    hull's own local frame, so a yawed 10 m hull is not padded out by an
//    axis-aligned world box) is projected through the live camera basis and a
//    distance + framing offsets are solved so the whole silhouette — barrel
//    included — lands inside the garage's clear STAGE RECT (the screen area
//    the UI leaves free; garage.js measures it from its own DOM) with even
//    margins. Every vehicle therefore reads at the same apparent size and the
//    same 3/4 angle regardless of hull length.
//
//  - DRAG ORBIT: pointer drag steers a damped turntable around the hero pose
//    with release momentum and a gentle spring back to the hero angle after a
//    couple of seconds idle. Yaw is FREE — a continuous 360° walk-around
//    (garage-scene r1: the player can inspect the rear); only pitch keeps its
//    turntable clamp. The camera distance grows (never shrinks below the hero
//    distance) if the widening silhouette would otherwise leave the stage
//    rect, so a broadside orbit of a long vehicle can never crop the gun.
//
// Determinism: the pose is a pure function of (box, yaw, pitch, zoom, rect).
// `reset()` snaps the orbit state back to the hero pose and re-solves, which
// is what the __SHOTS garage/techtree recipes call — a staged capture is
// therefore byte-identical whether or not the player had dragged the view.

const SHOW_FOV_DEG = 42;               // stage lens (matches the authored bay)
const SHOW_HERO_FILL = 0.86;           // hero framing: fraction of the stage rect
const SHOW_KEEP_FILL = 0.99;           // orbiting: pull back rather than crop
// garage-scene r1: the ±72° yaw clamp is GONE — free continuous 360° orbit
// (the hangar dressing gives every azimuth something to look at). Pitch keeps
// its clamps: the turntable read must never go under the pedestal or top-down.
const SHOW_PITCH_MIN = THREE.MathUtils.degToRad(5);   // never below the pedestal
const SHOW_PITCH_MAX = THREE.MathUtils.degToRad(35);
const SHOW_DRAG_YAW_PER_PX = THREE.MathUtils.degToRad(0.22);
const SHOW_DRAG_PITCH_PER_PX = THREE.MathUtils.degToRad(0.10);
const SHOW_FOLLOW_TAU_S = 0.085;       // pointer → camera smoothing
const SHOW_INERTIA_TAU_S = 0.42;       // release momentum decay
const SHOW_INERTIA_MIN = THREE.MathUtils.degToRad(2.5); // rad/s: coast cutoff
const SHOW_INERTIA_MAX = THREE.MathUtils.degToRad(220); // rad/s: flick clamp
const SHOW_IDLE_RETURN_S = 2.0;        // idle before the spring back engages
const SHOW_RETURN_TAU_S = 0.75;        // spring-back ease
const SHOW_ZOOM_STEP = 0.9;            // per wheel notch
const SHOW_ZOOM_MIN = 0.62;
const SHOW_ZOOM_MAX = 1.55;
const SHOW_DIST_MAX_M = 19;            // stays inside the 46 m bay (HW 23)
const SHOW_NEAR_PAD_M = 1.2;           // camera never inside the silhouette
const SHOW_FLOOR_PAD_M = 0.7;          // camera never under the pedestal plane
const SHOW_SOLVE_ITERS = 9;

/** Wrap an angle delta into [-π, π) — yaw springs take the short way home. */
function wrapPi(a) {
  const TAU = Math.PI * 2;
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

const _sbMin = new THREE.Vector3();
const _sbMax = new THREE.Vector3();
const _sbInv = new THREE.Matrix4();
const _sbV = new THREE.Vector3();
const _sbC = new THREE.Vector3();      // target → camera unit vector
const _sbR = new THREE.Vector3();      // camera right
const _sbU = new THREE.Vector3();      // camera up
const _sbPos = new THREE.Vector3();
const _sbLook = new THREE.Vector3();
const _sbCenter = new THREE.Vector3();
const _sbCorners = [];
for (let i = 0; i < 8; i++) _sbCorners.push(new THREE.Vector3());
// per-corner camera-basis coordinates (right, up, toward-camera), reused
const _sbPr = new Float64Array(8);
const _sbPu = new Float64Array(8);
const _sbPc = new Float64Array(8);

/**
 * Union of every descendant mesh's geometry AABB, expressed in `root`'s LOCAL
 * frame (so the result hugs a yawed hull instead of ballooning into a
 * world-axis box). Invisible children are included on purpose: the garage
 * hides the whole hero while its GLB parses, and the pose must still solve.
 *
 * @param {THREE.Object3D} root
 * @param {THREE.Vector3} outMin
 * @param {THREE.Vector3} outMax
 * @returns {boolean} false when the subtree carries no geometry
 */
function measureLocalBox(root, outMin, outMax) {
  root.updateMatrixWorld(true);
  _sbInv.copy(root.matrixWorld).invert();
  outMin.set(Infinity, Infinity, Infinity);
  outMax.set(-Infinity, -Infinity, -Infinity);
  let any = false;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    if (!bb || bb.isEmpty()) return;
    for (let i = 0; i < 8; i++) {
      _sbV.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
      _sbV.applyMatrix4(o.matrixWorld).applyMatrix4(_sbInv);
      outMin.min(_sbV);
      outMax.max(_sbV);
      any = true;
    }
  });
  return any;
}

/**
 * Create the garage showroom camera controller.
 *
 * Owns nothing but the pose it hands to `rig.setExternalPose` — the rig stays
 * the single writer of camera position/rotation/fov.
 *
 * @param {THREE.PerspectiveCamera} camera - reads aspect; never written here
 * @param {Rig} rig - target for the solved pose
 * @param {{ getSubject: () => ?THREE.Object3D,
 *           getStageRect: () => ?{ x: number, y: number, w: number, h: number },
 *           heroYawRad: number, heroPitchRad: number, floorY: () => number }} deps
 *   `getSubject` returns the pedestal hero root (null while empty);
 *   `getStageRect` returns the UI-free screen area in CSS px (null → whole
 *   viewport); `heroYawRad` is the world azimuth of the camera as seen FROM
 *   the vehicle (0 → +Z), `heroPitchRad` its elevation.
 * @returns {object} showroom controller
 */
export function createShowroomOrbit(camera, rig, deps) {
  const heroYaw = deps.heroYawRad;
  const heroPitch = THREE.MathUtils.clamp(deps.heroPitchRad, SHOW_PITCH_MIN, SHOW_PITCH_MAX);

  // measured subject (local-frame box + the world transform it was taken in)
  let subject = null;
  let haveBox = false;
  let heroDist = 12;
  let nearDist = 3;
  // live orbit state: `t*` are the pointer/spring targets, the bare values are
  // the damped ones actually rendered.
  let tYaw = heroYaw, yaw = heroYaw;
  let tPitch = heroPitch, pitch = heroPitch;
  let tZoom = 1, zoom = 1;
  let yawVel = 0, pitchVel = 0;
  let dragging = false;
  let running = false;
  let sinceInputS = 999;
  let lastDragMs = 0;
  let measureAccS = 0;
  const win = { cx: 0, cy: 0, hx: 1, hy: 1 };

  /** Stage rect (CSS px) → NDC center/half-extents, with a sanity floor. */
  function readWindow() {
    const vw = camera.__cotViewW || (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const vh = camera.__cotViewH || (typeof window !== 'undefined' ? window.innerHeight : 1080);
    let r = null;
    try { r = deps.getStageRect ? deps.getStageRect() : null; } catch (_) { r = null; }
    let x0 = 0, y0 = 0, x1 = vw, y1 = vh;
    if (r && r.w > 0 && r.h > 0) { x0 = r.x; y0 = r.y; x1 = r.x + r.w; y1 = r.y + r.h; }
    // Crowded viewports (the 768 px embed the controls probe drives) can pinch
    // the free area to a sliver — never let the UI starve the hero framing.
    const minW = vw * 0.52, minH = vh * 0.44;
    if (x1 - x0 < minW) {
      const c = THREE.MathUtils.clamp((x0 + x1) / 2, minW / 2, vw - minW / 2);
      x0 = c - minW / 2; x1 = c + minW / 2;
    }
    if (y1 - y0 < minH) {
      const c = THREE.MathUtils.clamp((y0 + y1) / 2, minH / 2, vh - minH / 2);
      y0 = c - minH / 2; y1 = c + minH / 2;
    }
    win.cx = ((x0 + x1) / vw) - 1;          // NDC x of the rect center
    win.cy = 1 - ((y0 + y1) / vh);          // NDC y (screen y grows downward)
    win.hx = (x1 - x0) / vw;                // NDC half-width
    win.hy = (y1 - y0) / vh;
    return win;
  }

  /** Re-measure the hero's oriented box + world corners. @returns {boolean} */
  function measure() {
    const root = deps.getSubject ? deps.getSubject() : null;
    subject = root || null;
    haveBox = false;
    if (!root) return false;
    if (!measureLocalBox(root, _sbMin, _sbMax)) return false;
    for (let i = 0; i < 8; i++) {
      _sbCorners[i].set(i & 1 ? _sbMax.x : _sbMin.x, i & 2 ? _sbMax.y : _sbMin.y,
        i & 4 ? _sbMax.z : _sbMin.z).applyMatrix4(root.matrixWorld);
    }
    _sbCenter.set(0, 0, 0);
    for (let i = 0; i < 8; i++) _sbCenter.add(_sbCorners[i]);
    _sbCenter.multiplyScalar(1 / 8);
    // FIXED FRAMING (garage r9 — owner: "when I select different tanks the
    // camera keeps shifting around, just keep the camera in one place looking
    // at center of garage"). The per-hull fit re-solved the ANCHOR (measured
    // box center) and the DISTANCE on every carousel step, so a Leo 2A7 and a
    // Panzer III parked the eye in visibly different places. With
    // deps.fixedFrame the orbit still requires a live subject (an empty
    // pedestal must never be framed) but poses against a CANONICAL box on the
    // stage center: identical eye for every vehicle, while the stage-rect fit
    // below still adapts to viewport size / UI panel layout as before.
    const fb = deps.fixedFrame ? deps.fixedFrame() : null;
    if (fb) {
      _sbCenter.set(fb.x, fb.y, fb.z);
      for (let i = 0; i < 8; i++) {
        _sbCorners[i].set(_sbCenter.x + (i & 1 ? fb.hw : -fb.hw),
          _sbCenter.y + (i & 2 ? fb.hh : -fb.hh),
          _sbCenter.z + (i & 4 ? fb.hd : -fb.hd));
      }
    }
    let radius = 0;
    for (let i = 0; i < 8; i++) radius = Math.max(radius, _sbCorners[i].distanceTo(_sbCenter));
    nearDist = radius + SHOW_NEAR_PAD_M;
    haveBox = true;
    return true;
  }

  /** Camera basis for (yaw, pitch) into _sbC / _sbR / _sbU. */
  function basis(y, p) {
    const cp = Math.cos(p);
    _sbC.set(Math.sin(y) * cp, Math.sin(p), Math.cos(y) * cp);
    _sbR.set(Math.cos(y), 0, -Math.sin(y));
    _sbU.set(-Math.sin(p) * Math.sin(y), cp, -Math.sin(p) * Math.cos(y));
  }

  /**
   * Solve the pose for the current box at (yaw, pitch).
   *
   * Projects the 8 oriented-box corners through the camera basis and iterates
   * distance + lateral/vertical framing offsets until the silhouette fills
   * `fill` of the stage rect, centered in it. `fixedDist` skips the distance
   * search and only solves the centering offsets (used once the orbit has
   * picked its own distance).
   *
   * @returns {{ dist: number, sx: number, sy: number }} sx/sy shift the camera
   *   along its right/up axes (the framing offsets).
   */
  function solve(y, p, fill, fixedDist) {
    const w = readWindow();
    const tanV = Math.tan(THREE.MathUtils.degToRad(SHOW_FOV_DEG) * 0.5);
    const tanH = tanV * (camera.aspect || 16 / 9);
    basis(y, p);
    let maxPc = -Infinity;
    for (let i = 0; i < 8; i++) {
      _sbV.copy(_sbCorners[i]).sub(_sbCenter);
      _sbPr[i] = _sbV.dot(_sbR);
      _sbPu[i] = _sbV.dot(_sbU);
      _sbPc[i] = _sbV.dot(_sbC);
      if (_sbPc[i] > maxPc) maxPc = _sbPc[i];
    }
    const dFloor = Math.max(maxPc + SHOW_NEAR_PAD_M, nearDist, 1);
    let d = fixedDist || Math.max(dFloor, nearDist * 2.2);
    let sx = 0, sy = 0;
    for (let it = 0; it < SHOW_SOLVE_ITERS; it++) {
      let nx0 = Infinity, nx1 = -Infinity, ny0 = Infinity, ny1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        const depth = d - _sbPc[i];
        const nx = (_sbPr[i] - sx) / (depth * tanH);
        const ny = (_sbPu[i] - sy) / (depth * tanV);
        if (nx < nx0) nx0 = nx; if (nx > nx1) nx1 = nx;
        if (ny < ny0) ny0 = ny; if (ny > ny1) ny1 = ny;
      }
      if (!fixedDist) {
        const s = Math.min((w.hx * fill) / Math.max(nx1 - nx0, 1e-6),
          (w.hy * fill) / Math.max(ny1 - ny0, 1e-6));
        const dNew = THREE.MathUtils.clamp(d / s, dFloor, SHOW_DIST_MAX_M);
        // offsets are proportional to distance — carry them across the step so
        // the centering correction below starts from the same framing
        const k = dNew / d;
        sx *= k; sy *= k;
        nx0 /= k; nx1 /= k; ny0 /= k; ny1 /= k;   // first-order ndc rescale
        d = dNew;
      }
      // UI-AWARE CENTERING (garage-scene r1): pin the projected OBB CENTER on
      // the stage-rect center X instead of the silhouette-extremes midpoint.
      // The 8 projected corners over-hang the true pixels asymmetrically on
      // the gun side (empty box volume above/beside the barrel), so extremes-
      // centering parked every hull ~50 px right of the panel-aware center at
      // 1920x1080 — the vehicle MASS read as centered on the raw viewport,
      // off-center against the left column / stats panel. The box center
      // tracks the hull mass, so the tank now reads centered in the UI-free
      // area. Camera ANGLES are untouched — this only slides the eye/look-at
      // pair along the camera's right axis, exactly like the old offset.
      sx = -w.cx * d * tanH;                    // closed form: center → w.cx
      let fx0 = Infinity, fx1 = -Infinity;      // extremes at the pinned sx
      for (let i = 0; i < 8; i++) {
        const nx = (_sbPr[i] - sx) / ((d - _sbPc[i]) * tanH);
        if (nx < fx0) fx0 = nx; if (nx > fx1) fx1 = nx;
      }
      // fit wins over mass-centering: shove back inside the rect so a long
      // gun can never crop against a panel (narrow viewports, broadside orbit)
      const loN = w.cx - w.hx * 0.995, hiN = w.cx + w.hx * 0.995;
      if (fx1 - fx0 > hiN - loN) {
        // silhouette wider than the window (distance already capped —
        // crowded portrait viewports): symmetric overflow, old behavior
        sx += ((fx0 + fx1) * 0.5 - w.cx) * d * tanH;
      } else if (fx0 < loN) sx += (fx0 - loN) * d * tanH;
      else if (fx1 > hiN) sx += (fx1 - hiN) * d * tanH;
      // vertical framing keeps the original extremes-midpoint behavior
      sy += ((ny0 + ny1) * 0.5 - w.cy) * d * tanV;
    }
    return { dist: d, sx, sy };
  }

  /** Write the solved pose for the current damped orbit state to the rig. */
  function applyPose() {
    if (!haveBox) return;
    const need = solve(yaw, pitch, SHOW_KEEP_FILL, 0).dist;
    const d = THREE.MathUtils.clamp(Math.max(heroDist, need) * zoom,
      nearDist, SHOW_DIST_MAX_M);
    const off = solve(yaw, pitch, SHOW_HERO_FILL, d);
    basis(yaw, pitch);
    _sbPos.copy(_sbCenter).addScaledVector(_sbC, d)
      .addScaledVector(_sbR, off.sx).addScaledVector(_sbU, off.sy);
    // last-resort floor guard: the pitch clamp already keeps the eye above the
    // pedestal, this catches a pathological framing offset on a huge subject.
    const minY = (deps.floorY ? deps.floorY() : -Infinity) + SHOW_FLOOR_PAD_M;
    if (_sbPos.y < minY) _sbPos.y = minY;
    _sbLook.copy(_sbPos).addScaledVector(_sbC, -d);
    rig.setExternalPose(_sbPos, _sbLook, SHOW_FOV_DEG);
  }

  const api = {
    /** True once a hero has been measured (the orbit owns the camera). */
    get active() { return running && haveBox; },
    /** Hero framing distance in meters (0 until measured). */
    get heroDist() { return haveBox ? heroDist : 0; },

    /**
     * Re-measure the hero and snap the orbit back to the solved hero pose.
     * Deterministic — the __SHOTS garage recipes call this so a staged capture
     * never inherits a dragged view.
     * @returns {boolean} true when a hero was measured and the pose applied
     */
    reset() {
      if (!measure()) return false;
      tYaw = yaw = heroYaw;
      tPitch = pitch = heroPitch;
      tZoom = zoom = 1;
      yawVel = pitchVel = 0;
      dragging = false;
      sinceInputS = 999;
      measureAccS = 0;
      heroDist = solve(heroYaw, heroPitch, SHOW_HERO_FILL, 0).dist;
      applyPose();
      return true;
    },

    /** Enable showroom ownership and immediately solve the selected hero. */
    start() {
      running = true;
      return api.reset();
    },

    /** Release showroom ownership before battle/shot-mode camera control. */
    stop() {
      running = false;
      dragging = false;
      yawVel = pitchVel = 0;
    },

    /**
     * Per-frame damped integration (drag → momentum → idle spring-back) and
     * pose write. Cheap: two 8-corner solves, no allocation.
     * @param {number} dt render delta seconds
     * @returns {void}
     */
    update(dt) {
      if (!running || !haveBox) return;
      const d = THREE.MathUtils.clamp(dt, 0, 0.1);
      // The hero GLB streams in behind a procedural stand-in and the carousel
      // can swap vehicles at any time — re-measure a few times a second so the
      // framing (and heroDist) always describes what is actually on stage.
      measureAccS += d;
      if (measureAccS > 0.4) {
        measureAccS = 0;
        const prev = subject;
        if (measure() && haveBox) {
          heroDist = solve(heroYaw, heroPitch, SHOW_HERO_FILL, 0).dist;
          if (prev !== subject) { // new hero on the pedestal — settle it back
            // nearest yaw equivalent of the hero heading: a tank switch after
            // a free 360° orbit swings ≤180° home, never rewinds whole turns
            tYaw = yaw + wrapPi(heroYaw - yaw);
            tPitch = heroPitch; tZoom = 1;
            yawVel = pitchVel = 0;
          }
        }
        if (!haveBox) return;
      }
      if (dragging) {
        sinceInputS = 0;
      } else {
        sinceInputS += d;
        if (Math.hypot(yawVel, pitchVel) > SHOW_INERTIA_MIN) {
          // garage-scene r1: yaw coasts FREE (360° walk-around) — only the
          // pitch clamp survives, killing its coast at the stops as before.
          tYaw += yawVel * d;
          tPitch += pitchVel * d;
          const before = tPitch;
          tPitch = THREE.MathUtils.clamp(tPitch, SHOW_PITCH_MIN, SHOW_PITCH_MAX);
          if (tPitch !== before) pitchVel = 0;   // kill the coast at the clamp
          const k = Math.exp(-d / SHOW_INERTIA_TAU_S);
          yawVel *= k; pitchVel *= k;
        } else {
          yawVel = pitchVel = 0;
        }
        if (sinceInputS > SHOW_IDLE_RETURN_S) {
          const a = 1 - Math.exp(-d / SHOW_RETURN_TAU_S);
          // spring home the SHORT way around: after a free orbit the hero
          // pose is any yaw ≡ heroYaw (mod 2π) — never a multi-turn rewind
          tYaw += wrapPi(heroYaw - tYaw) * a;
          tPitch += (heroPitch - tPitch) * a;
          tZoom += (1 - tZoom) * a;
        }
      }
      const f = 1 - Math.exp(-d / SHOW_FOLLOW_TAU_S);
      yaw += (tYaw - yaw) * f;
      pitch += (tPitch - pitch) * f;
      zoom += (tZoom - zoom) * f;
      applyPose();
    },

    /** Pointer went down on the 3D stage. @returns {void} */
    beginDrag() {
      if (!running || !haveBox) return;
      dragging = true;
      sinceInputS = 0;
      yawVel = pitchVel = 0;
      lastDragMs = 0;
    },

    /**
     * Pointer moved during a stage drag: steer the turntable within the clamp
     * and remember the flick velocity for release momentum.
     * @param {number} dxPx horizontal pointer delta in CSS px
     * @param {number} dyPx vertical pointer delta in CSS px
     * @returns {void}
     */
    drag(dxPx, dyPx) {
      if (!dragging) return;
      sinceInputS = 0;
      const y0 = tYaw, p0 = tPitch;
      // drag right → the near face sweeps right (camera orbits left).
      // garage-scene r1: yaw unclamped — drag all the way around to the rear.
      tYaw -= dxPx * SHOW_DRAG_YAW_PER_PX;
      // drag down → look further down onto the roof (turntable tilt)
      tPitch = THREE.MathUtils.clamp(tPitch + dyPx * SHOW_DRAG_PITCH_PER_PX,
        SHOW_PITCH_MIN, SHOW_PITCH_MAX);
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const dtMs = lastDragMs ? THREE.MathUtils.clamp(now - lastDragMs, 4, 60) : 16;
      lastDragMs = now;
      const inv = 1000 / dtMs;
      const mix = 0.45;                       // EMA over ~2-3 pointer events
      yawVel = THREE.MathUtils.clamp(yawVel * (1 - mix) + (tYaw - y0) * inv * mix,
        -SHOW_INERTIA_MAX, SHOW_INERTIA_MAX);
      pitchVel = THREE.MathUtils.clamp(pitchVel * (1 - mix) + (tPitch - p0) * inv * mix,
        -SHOW_INERTIA_MAX, SHOW_INERTIA_MAX);
    },

    /** Pointer released — the coast + spring-back take over. @returns {void} */
    endDrag() {
      dragging = false;
      sinceInputS = 0;
    },

    /**
     * Wheel zoom inside clamps derived from the fitted hero distance.
     * @param {number} notches positive = zoom in
     * @returns {void}
     */
    wheel(notches) {
      if (!haveBox || !notches) return;
      const n = THREE.MathUtils.clamp(notches | 0, -3, 3) ||
        (notches > 0 ? 1 : -1);
      tZoom = THREE.MathUtils.clamp(tZoom * Math.pow(SHOW_ZOOM_STEP, n),
        SHOW_ZOOM_MIN, SHOW_ZOOM_MAX);
      sinceInputS = 0;
    },

    /**
     * Live state for the headless camera probe (tools/garage-camera-probe.mjs).
     * @returns {object}
     */
    debugState() {
      return {
        active: running && haveBox,
        running,
        yawDeg: THREE.MathUtils.radToDeg(yaw),
        pitchDeg: THREE.MathUtils.radToDeg(pitch),
        heroYawDeg: THREE.MathUtils.radToDeg(heroYaw),
        heroPitchDeg: THREE.MathUtils.radToDeg(heroPitch),
        // garage-scene r1: yaw is unclamped (full 360°). Report a full turn so
        // probe assertions of the form |yaw-hero| <= clamp keep holding for
        // any single-drag gesture without a schema change.
        yawClampDeg: 360,
        pitchMinDeg: THREE.MathUtils.radToDeg(SHOW_PITCH_MIN),
        pitchMaxDeg: THREE.MathUtils.radToDeg(SHOW_PITCH_MAX),
        zoom, zoomMin: SHOW_ZOOM_MIN, zoomMax: SHOW_ZOOM_MAX,
        heroDist, dragging, sinceInputS,
        fovDeg: SHOW_FOV_DEG,
        box: haveBox
          ? { min: _sbMin.toArray(), max: _sbMax.toArray(), center: _sbCenter.toArray() }
          : null,
        corners: haveBox ? _sbCorners.map((c) => c.toArray()) : null,
        stage: { cx: win.cx, cy: win.cy, hx: win.hx, hy: win.hy },
      };
    },
  };

  return api;
}
