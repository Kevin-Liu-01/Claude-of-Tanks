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
const CLIMB_LIFT_MAX = 0.55;  // max extra camera height, × orbit distance
const CLIMB_LOOK_FRAC = 0.45; // look-target lift as a fraction of camera lift
const CLIMB_TAU_S = 0.35;     // assist ease time constant
// <<< gameplay_feel r4 ------------------------------------------------------
const COLLISION_PAD_M = 0.3;
const CAMERA_MIN_CLEARANCE_M = 1.0; // auto-height above terrain
const TRAUMA_DECAY_PER_S = 1.4;
// Scope-in aim policy (enterSniper): keep the aim point if it is at least
// this far away; otherwise lift the view to a shallow just-below-horizon
// scan pitch so the first zoom of a battle opens on the battlefield.
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

  let step = 2; // ORBIT_STEPS index — 13 m default
  let dist = ORBIT_STEPS[step];
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
      const refY = pivot.y - PIVOT_ABOVE_TURRET_M * 0.5; // ~turret roof line
      let rise = 0;
      for (let i = 1; i <= CLIMB_PROBE_N; i++) {
        const d = (i / CLIMB_PROBE_N) * dist * CLIMB_PROBE_RANGE;
        const a = Math.atan2(heightField.getHeightAt(pivot.x + fx * d, pivot.z + fz * d) - refY, d);
        if (a > rise) rise = a;
      }
      const liftTarget =
        THREE.MathUtils.clamp(rise / CLIMB_FULL_RAD, 0, 1) * dist * CLIMB_LIFT_MAX;
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

  /** Server-aim raycast from the camera through screen center (both modes). */
  function updateAim(player) {
    camera.getWorldDirection(_rayDir);
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
    const k = THREE.MathUtils.clamp(cine.t / cine.dur, 0, 1);
    pivotTargetFor(player, _pivotTarget);
    // path position: world-frame offsets from the (moving) pivot
    cine.curve.getPoint(k < 0.97 ? k : 0.97 + (k - 0.97) * 0.999, _desired);
    _desired.add(_pivotTarget);
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
    const s = THREE.MathUtils.smoothstep(k, 0.0, 0.6);
    _cineLook.copy(_pivotTarget)
      .addScaledVector(cine.fwd, 14 * (1 - s))
      .addScaledVector(_UPV, -1.0 * (1 - s));
    camera.lookAt(_cineLook);
    // FOV 72 -> 60: wide establishing breath tightening onto gameplay FOV
    setFov(BASE_FOV_DEG + 12 * (1 - k));
    return cine.t < cine.dur;
  }
  const _UPV = new THREE.Vector3(0, 1, 0);

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
        return;
      }

      // Shift toggles sniper on the rising edge.
      if (camInput.shiftPressed && !prevShift) {
        if (rig.mode === 'ARCADE') rig.enterSniper();
        else rig.exitSniper();
      }
      prevShift = camInput.shiftPressed;

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
      const curve = new THREE.CatmullRomCurve3([
        P(24, 2.6, 45),
        P(16, 0.6, 22),
        P(10, -0.2, 4),
        P(7.5, 0.6, -9),
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
      setLetterbox(false);
      trauma = 0;
      const player = getPlayer();
      death = { az: player && player.state ? player.state.yaw + Math.PI * 0.75 : 0 };
      rig.mode = 'ARCADE';
      applyPlayerVisibility(player, true);
    },

    /**
     * Enter sniper mode. Keeps the shared aim angles (no view snap); the own
     * hull is hidden on the next solve. Zoom resumes at the last-used step.
     * @returns {void}
     */
    enterSniper() {
      if (rig.mode === 'SNIPER') return;
      rig.mode = 'SNIPER';
      freeYaw = 0;
      freePitch = 0;
      // Scope-in must open on the BATTLEFIELD, not the dirt: the arcade
      // default pitch (-10 deg from a camera 5+ m up) rests the aim on
      // ground a dozen meters ahead, so entering sniper at the gun trunnion
      // stared at grass at 13 m ("aim 13 m" on the first scope of every
      // battle). Preserve the arcade aim POINT when it is a real target
      // (beyond SNIPER_KEEP_AIM_M); otherwise lift the view to a shallow
      // scan pitch just under the horizon.
      if (rig.aimDist < SNIPER_KEEP_AIM_M) {
        aimPitch = Math.max(aimPitch, SNIPER_ENTRY_PITCH_RAD);
        // gameplay_feel r1: facing RISING ground the flat-ground scan pitch
        // still ray-hits the slope a few meters out (full-screen grass at
        // 6 m). Raise the entry pitch in 2-degree steps until the scope
        // opens at least SNIPER_KEEP_AIM_M into the battlefield (PITCH_MAX
        // stops the loop when a genuine wall fills the view).
        const player = getPlayer();
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
      } else {
        // re-derive the pitch that keeps the current aim point centered
        // from the sniper anchor (the camera is about to jump from the
        // orbit position to the gun trunnion — different parallax)
        const player = getPlayer();
        if (player) {
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
      }
      applyPlayerVisibility(getPlayer(), false);
    },

    /**
     * Exit sniper back to arcade at the closest orbit step, with the orbit
     * oriented behind the current gun (aim yaw synced to hull yaw + turret
     * yaw) so the camera comes out behind the barrel.
     * @returns {void}
     */
    exitSniper() {
      if (rig.mode === 'ARCADE') return;
      rig.mode = 'ARCADE';
      step = ORBIT_STEPS.length - 1;
      dist = ORBIT_STEPS[step];
      const player = getPlayer();
      if (player && player.state) aimYaw = player.state.yaw + player.state.turretYaw;
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
      cine = null;
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
      cine = null;
      setLetterbox(false);
      death = null;
      rig.mode = 'ARCADE';
      step = THREE.MathUtils.clamp(step_ | 0, 0, ORBIT_STEPS.length - 1);
      aimYaw = orbitYaw;
      aimPitch = THREE.MathUtils.clamp(orbitPitch, PITCH_MIN, PITCH_MAX);
      freeYaw = 0;
      freePitch = 0;
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
      cine = null;
      setLetterbox(false);
      death = null;
      rig.mode = 'SNIPER';
      rig.zoom = zoom;
      aimYaw = aimYaw_;
      aimPitch = THREE.MathUtils.clamp(aimPitch_, PITCH_MIN, PITCH_MAX);
      freeYaw = 0;
      freePitch = 0;
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
    },
  };

  return rig;
}
