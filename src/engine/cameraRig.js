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
const PITCH_MAX = THREE.MathUtils.degToRad(15); // looking up
const MAX_AIM_DIST_M = 720;
const PIVOT_ABOVE_TURRET_M = 2.5;
const PIVOT_FOLLOW_TAU_S = 0.1; // critically-damped-feel position lag
const DIST_LERP_TAU_S = 0.15; // smooth lerp between orbit steps
const COLLISION_PAD_M = 0.3;
const CAMERA_MIN_CLEARANCE_M = 1.0; // auto-height above terrain
const TRAUMA_DECAY_PER_S = 1.4;
const SHAKE_FREQ = 11;
const SHAKE_AMP_XY = 0.045;
const SHAKE_AMP_Z = 0.03;
const SNIPER_SHAKE_SCALE = 0.3;

const _pivotTarget = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _viewDir = new THREE.Vector3();
const _rayDir = new THREE.Vector3();

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
 * @property {-1|0|1} wheel - wheel step: +1 zoom in, -1 zoom out
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

  let external = false;
  let prevShift = false;
  let trauma = 0;
  let shakeT = 0;
  let lastFov = 0;

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
    } else {
      pivot.lerp(_pivotTarget, 1 - Math.exp(-dt / PIVOT_FOLLOW_TAU_S));
      dist += (ORBIT_STEPS[step] - dist) * (1 - Math.exp(-dt / DIST_LERP_TAU_S));
    }

    const viewYaw = aimYaw + freeYaw;
    const viewPitch = THREE.MathUtils.clamp(aimPitch + freePitch, PITCH_MIN, PITCH_MAX);
    dirFromAngles(viewYaw, viewPitch, _viewDir);
    _desired.copy(pivot).addScaledVector(_viewDir, -dist);

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
    camera.lookAt(pivot);
    setFov(BASE_FOV_DEG);
  }

  /** Place the sniper camera: glued to the gun, view = aim angles instantly. */
  function solveSniper(player) {
    sniperAnchorFor(player, _desired);
    camera.position.copy(_desired);
    const viewPitch = THREE.MathUtils.clamp(aimPitch, PITCH_MIN, PITCH_MAX);
    camera.rotation.set(viewPitch, aimYaw + Math.PI, 0, 'YXZ');
    setFov(BASE_FOV_DEG / rig.zoom);
  }

  /** Server-aim raycast from the camera through screen center (both modes). */
  function updateAim(player) {
    camera.getWorldDirection(_rayDir);
    const hit = raycast(camera.position, _rayDir, MAX_AIM_DIST_M);
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

      // Shift toggles sniper on the rising edge.
      if (camInput.shiftPressed && !prevShift) {
        if (rig.mode === 'ARCADE') rig.enterSniper();
        else rig.exitSniper();
      }
      prevShift = camInput.shiftPressed;

      if (camInput.wheel) stepZoom(camInput.wheel);

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
      if (trauma > 0) {
        const s = trauma * trauma * (rig.mode === 'SNIPER' ? SNIPER_SHAKE_SCALE : 1);
        camera.rotation.x += SHAKE_AMP_XY * s * noise.noise(shakeT * SHAKE_FREQ, 0, 0);
        camera.rotation.y += SHAKE_AMP_XY * s * noise.noise(0, shakeT * SHAKE_FREQ, 0);
        camera.rotation.z += SHAKE_AMP_Z * s * noise.noise(0, 0, shakeT * SHAKE_FREQ);
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
     * Enter sniper mode. Keeps the shared aim angles (no view snap); the own
     * hull is hidden on the next solve. Zoom resumes at the last-used step.
     * @returns {void}
     */
    enterSniper() {
      if (rig.mode === 'SNIPER') return;
      rig.mode = 'SNIPER';
      freeYaw = 0;
      freePitch = 0;
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
      trauma = 0;
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
