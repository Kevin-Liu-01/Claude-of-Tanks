/**
 * watchCamera.ts — the Watch mode's two cameras (owner 2026-10-23: "watch tank battles and be able to go into a
 * spectator view you can control like a drone and then into any tank currently fighting").
 *
 *  - DRONE: a spectator drone (owner 2026-10-24: "how flying around should actually work (youre a spectator drone)").
 *    It moves on the horizontal heading and climbs on its own axis; the stick is shaped and eased before the velocity
 *    follows it (two lags: a press never jolts, a release glides out); its cruise speed scales with the height above
 *    the ground, so it creeps low and covers ground high. It holds the altitude it is left at; a terrain-follow floor
 *    sampled ahead of it lifts it over a rise before it gets there and lets it settle back after, and a hard floor
 *    under it never gives. The square's edges and the ceiling slow it down rather than stop it, and the structures
 *    are a swept ray along the move (the move slides along what it meets). Locked on a tank, it orbits it: sideways
 *    and the mouse go round, forward closes in, climb raises the orbit, and the drone flies to its slot through the
 *    same clamps; locking on and letting go are both continuous.
 *  - RIDE: the view a player in that tank would see — the arcade chase orbit behind the gun on the player's orbit
 *    steps, laid where the tank's gunner aims, and the gunner sight on the zoom key — with a free-look offset that
 *    eases back behind the gun. A destroyed target is held in a slow wreck orbit until the controller hands off.
 *
 * Every handover (drone to tank, tank to tank) is an eased pose blend from wherever the camera is, arcing over the
 * ground on long hops; leaving a tank gives the drone the camera's own pose with a short lift-off, so neither way cuts.
 * The camera owns no game state: the Watch controller (game/watchController.ts) picks targets and feeds input.
 * All scratch is retained; update() allocates nothing.
 */
import * as THREE from 'three';
import type { CameraEntity, CameraRaycast } from './cameraRig.ts';
import { PLAYABLE_HALF_EXTENT_M } from '../world/battlefieldBounds.ts';
import { A11Y } from '../ui/accessibilityPreferences.ts';

/** The drone's world clamp and flight laws (receipt: watchCamera.selftest.mjs). */
export const WATCH_DRONE = Object.freeze({
  /** Cruise speeds the wheel steps through (m/s at the reference height); the drone opens on `speedIndex`. */
  speeds: Object.freeze([4, 8, 14, 24, 40, 64]),
  speedIndex: 2,
  boostScale: 2.5,
  /** No faster than this whatever the height, step and boost. */
  maxSpeedMps: 180,
  /** The cruise speed scales with the height above ground as √(h / refAglM), held to these bounds. */
  refAglM: 18,
  heightScaleMin: 0.55,
  heightScaleMax: 2.6,
  /** Climb and descent: this share of the cruise speed, never slower than climbMinMps. */
  climbShare: 0.7,
  climbMinMps: 6,
  /** The stick is shaped (|x|^expo: fine near the centre) and eased, then the velocity follows it (s). */
  stickExpo: 1.5,
  stickTauS: 0.12,
  accelTauS: 0.32,
  brakeTauS: 0.6,
  /** Altitude hold: with no climb input the drone returns to the height it was left at; vertical response (s). */
  holdTauS: 0.9,
  verticalTauS: 0.2,
  lookTauS: 0.07,
  /** Rad per screen pixel of mouse travel. */
  lookSens: 0.0022,
  pitchMin: THREE.MathUtils.degToRad(-85),
  pitchMax: THREE.MathUtils.degToRad(80),
  /**
   * The terrain-follow floor: this far above the highest ground under the drone's footprint and ahead of it along its
   * path (lookAheadS of travel), reached at up to floorRiseMps (or 0.8 of the speed) over floorTauS; the hard floor
   * under it (hardClearanceM) never gives.
   */
  floorClearanceM: 3.5,
  hardClearanceM: 1.6,
  footprintM: 1.4,
  lookAheadS: Object.freeze([0.3, 0.6, 1.0, 1.5]),
  floorRiseMps: 26,
  floorTauS: 0.35,
  /** The ceiling above the ground under it, and an absolute one. */
  ceilingAboveGroundM: 280,
  ceilingM: 520,
  /** The square the drone keeps to: the playable ground plus a look at its edge (the terrain runs to 512 m). */
  halfExtentM: PLAYABLE_HALF_EXTENT_M + 20,
  /** Toward an edge or the ceiling the speed is held to what can still stop in the distance left at edgeBrakeMps2. */
  edgeBrakeMps2: 30,
  /** A structure is kept this far from the lens. */
  radiusM: 1.0,
  fovDeg: 70,
  boostFovDeg: 78,
  /** Bank into a strafe (rad per m/s of lateral speed) and into a turn (rad per rad/s of yaw), capped. */
  bankPerMps: 0.006,
  bankPerRadS: 0.07,
  bankMax: 0.09,
  /** Leaving a tank: the drone lifts and backs off from the chase pose for liftOffS (clear of the hull and the trees). */
  liftOffUpMps: 10,
  liftOffBackMps: 6,
  liftOffS: 1,
  /** Lock-on orbit round a tank: the range and elevation it keeps, the follow and slot eases, the look-in time. */
  orbitMinM: 10,
  orbitMaxM: 180,
  orbitElMin: THREE.MathUtils.degToRad(6),
  orbitElMax: THREE.MathUtils.degToRad(78),
  orbitFollowTauS: 0.3,
  orbitSlotTauS: 0.45,
  orbitLookInS: 0.6,
  /** A locked tank that moves this far in one frame (a revive across the field) lets the lock go. */
  orbitJumpM: 60,
});

/** The ride-along's chase and sight (the player's own rig grammar: cameraRig.ts ORBIT_STEPS, SNIPER zooms). */
export const WATCH_RIDE = Object.freeze({
  orbitSteps: Object.freeze([24, 18, 13, 9, 6]),
  orbitIndex: 2,
  zooms: Object.freeze([2, 4, 8]),
  pivotAboveTurretM: 1.0,
  pivotTauS: 0.1,
  distTauS: 0.15,
  /** The chase looks this much further down than the gunner's lay: the camera rides over the hull, out of the grass. */
  chasePitchBiasRad: THREE.MathUtils.degToRad(8),
  /** The view follows the gunner's lay (its aim point) at this ease; the sight follows tighter. */
  aimTauS: 0.18,
  sightTauS: 0.1,
  /** Free look eases back behind the gun after this much stillness. */
  freeLookHoldS: 1.4,
  freeLookReturnTauS: 0.55,
  pitchMin: THREE.MathUtils.degToRad(-65),
  pitchMax: THREE.MathUtils.degToRad(30),
  minClearanceM: 1.0,
  collisionPadM: 0.3,
  fovDeg: 60,
  /** The wreck orbit while the controller holds a destroyed target. */
  wreckOrbitRadS: 0.22,
  wreckDistM: 16,
});

/** The eased handover between poses. */
export const WATCH_BLEND = Object.freeze({
  minS: 1.05,
  maxS: 2.45,
  baseS: 0.82,
  metersPerS: 190,
  /** Long hops arc over the ground: up to this lift, a share of the hop's length. */
  arcMaxM: 35,
  arcShare: 0.12,
  /** The lens turns from where it looked to the new subject over this first share of the move, then holds it. */
  lookLeadShare: 0.55,
});

export interface WatchCameraInput {
  /** Drone stick: forward / right / up in [-1, 1]. */
  moveForward: number;
  moveRight: number;
  moveUp: number;
  /** Look in screen pixels (right / down positive); a stick feeds its rate times dt in the same units. */
  lookDX: number;
  lookDY: number;
  boost: boolean;
  /** Wheel notches this frame (+1 = in / faster). */
  wheel: number;
}

export interface WatchCameraDeps {
  heightField: { getHeightAt(x: number, z: number): number };
  /** World-only ray (terrain, structures): the chase's pull-in and the drone's structure clamp. */
  raycast: CameraRaycast;
  /**
   * Stream a destination before the camera arrives (perf-245's cold-terrain warm): the lens's pose there, what it looks
   * at and the flight's time. A lock that has far to fly calls it once.
   */
  prepareDestination?(position: THREE.Vector3, lookAt: THREE.Vector3, durationS: number): void;
}

type WatchCameraMode = 'off' | 'drone' | 'ride';

export interface WatchCamera {
  readonly mode: WatchCameraMode;
  readonly target: CameraEntity | null;
  readonly sight: boolean;
  readonly zoom: number;
  /** The ride-along's orbit step (an index into WATCH_RIDE.orbitSteps, the player rig's own steps). */
  readonly orbitStep: number;
  readonly speedIndex: number;
  readonly blending: boolean;
  /** The handover's progress, 0..1 (1 when no blend runs): the HUD changes subject at its midpoint. */
  readonly blendProgress: number;
  /** The drone's integrated position (the receipts read the clamp from it). */
  readonly dronePosition: THREE.Vector3;
  readonly droneVelocity: THREE.Vector3;
  /** The tank the drone orbits, or null in free flight. */
  readonly lockTarget: CameraEntity | null;
  /** Fly from the camera's current pose (a battle reveal, leaving a tank). `liftOff` adds the exit's rise. */
  startDrone(liftOff?: boolean): void;
  /** Lock the drone's orbit on `target`, or let go (null); continuous both ways. */
  lock(target: CameraEntity | null): void;
  /** Place the drone explicitly (the covered reveal), looking along yaw/pitch. */
  placeDrone(position: THREE.Vector3, yaw: number, pitch: number): void;
  /** Ride along `target`, blending from the live pose (or snapping on a covered reveal). */
  ride(target: CameraEntity, snap?: boolean): void;
  setSight(on: boolean): void;
  update(dt: number, input: WatchCameraInput): boolean;
  stop(): void;
}

function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function dirFromAngles(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  const cp = Math.cos(pitch);
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}

function ease(dt: number, tauS: number): number {
  return dt > 0 ? 1 - Math.exp(-dt / tauS) : 0;
}

/** The highest ground under a footprint (centre and four points round it). */
export function footprintGround(
  heightField: WatchCameraDeps['heightField'], x: number, z: number, radiusM: number,
): number {
  let h = heightField.getHeightAt(x, z);
  h = Math.max(h, heightField.getHeightAt(x + radiusM, z), heightField.getHeightAt(x - radiusM, z));
  return Math.max(h, heightField.getHeightAt(x, z + radiusM), heightField.getHeightAt(x, z - radiusM));
}

const _move = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _desiredVel = new THREE.Vector3();
const _pivotTarget = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _viewDir = new THREE.Vector3();
const _look = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _gunDir = new THREE.Vector3();
const _finalPos = new THREE.Vector3();
const _farPoint = new THREE.Vector3();
const _slot = new THREE.Vector3();

/** A stick axis shaped for fine control near the centre (|x|^expo, sign kept). */
function shapeStick(x: number): number {
  const v = THREE.MathUtils.clamp(x, -1, 1);
  return Math.sign(v) * Math.pow(Math.abs(v), WATCH_DRONE.stickExpo);
}

/** The cruise speed's scale at a height above ground. */
export function droneHeightScale(aglM: number): number {
  return THREE.MathUtils.clamp(Math.sqrt(Math.max(0.5, aglM) / WATCH_DRONE.refAglM),
    WATCH_DRONE.heightScaleMin, WATCH_DRONE.heightScaleMax);
}

export function createWatchCamera(camera: THREE.PerspectiveCamera, deps: WatchCameraDeps): WatchCamera {
  const { heightField, raycast } = deps;
  let mode: WatchCameraMode = 'off';

  // --- drone state ---
  const dronePos = new THREE.Vector3();
  const droneVel = new THREE.Vector3();
  /** The shaped, eased stick (horizontal m/s) the velocity follows; the held altitude. */
  const stickVel = new THREE.Vector3();
  let holdY = 0, climbing = false;
  // --- lock-on orbit ---
  let lockTarget: CameraEntity | null = null;
  const lockCenter = new THREE.Vector3();
  let orbitAz = 0, orbitEl = 0, orbitR = 30, lockLookIn = 1, lockFromYaw = 0, lockFromPitch = 0;
  let droneYaw = 0, droneYawT = 0, dronePitch = 0, dronePitchT = 0, droneRoll = 0, prevYaw = 0;
  let droneFov: number = WATCH_DRONE.fovDeg;
  let liftOffT = 0;
  let speedIndex: number = WATCH_DRONE.speedIndex;

  // --- ride state ---
  let target: CameraEntity | null = null;
  let hiddenRoot: THREE.Object3D | null = null;
  const pivot = new THREE.Vector3();
  let pivotReady = false;
  let orbitIndex: number = WATCH_RIDE.orbitIndex;
  let dist: number = WATCH_RIDE.orbitSteps[orbitIndex];
  let aimYaw = 0, aimPitch = 0, aimReady = false;
  let lookYaw = 0, lookPitch = 0, lookIdleS = 0;
  let sight = false;
  let preSightOrbit = -1;
  let zoomIndex = 0;
  let wreckAz = 0, wreckActive = false;

  // --- handover blend ---
  const fromPos = new THREE.Vector3();
  const fromLook = new THREE.Vector3();
  let fromFov = 60;
  let blendT = 0, blendDur = 0, blendArcM = 0;

  function setFov(fov: number): void {
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function revealTarget(): void {
    if (hiddenRoot) hiddenRoot.visible = true;
    hiddenRoot = null;
  }

  function captureFrom(): void {
    fromPos.copy(camera.position);
    camera.getWorldDirection(_viewDir);
    fromLook.copy(camera.position).addScaledVector(_viewDir, 14);
    fromFov = camera.fov;
  }

  function beginBlend(toward: THREE.Vector3): void {
    captureFrom();
    const hop = fromPos.distanceTo(toward);
    blendT = 0;
    blendDur = THREE.MathUtils.clamp(WATCH_BLEND.baseS + hop / WATCH_BLEND.metersPerS, WATCH_BLEND.minS, WATCH_BLEND.maxS);
    blendArcM = Math.min(WATCH_BLEND.arcMaxM, hop * WATCH_BLEND.arcShare);
  }

  /** Blend the solved pose (_desired, _look, fov) from the captured one; true while the blend runs. */
  function applyBlend(dt: number, fov: number): number {
    if (blendT >= blendDur) return fov;
    blendT = Math.min(blendDur, blendT + Math.max(0, dt));
    const u = blendDur > 0 ? blendT / blendDur : 1;
    const k = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
    // where the solved pose will look: a point far down its own view line, so the lens arrives already aligned with it
    // (aimed at the subject itself, a lens arriving from above stares down and swings level in the last frames)
    _finalPos.copy(_desired);
    _farPoint.copy(_look).sub(_finalPos);
    const finalLen = _farPoint.length();
    if (finalLen > 1e-4) _farPoint.multiplyScalar(60 / finalLen).add(_finalPos);
    else _farPoint.copy(_look);
    _desired.lerpVectors(fromPos, _desired, k);
    _desired.y += Math.sin(Math.PI * k) * blendArcM;
    const floor = heightField.getHeightAt(_desired.x, _desired.z) + WATCH_RIDE.minClearanceM;
    if (_desired.y < floor) _desired.y = floor;
    // the look is a direction, not a point: it turns from the old facing onto the subject early in the move and then
    // keeps the subject in view from wherever the arc carries the lens (a blended look point would sink under it)
    const v = Math.min(1, u / WATCH_BLEND.lookLeadShare);
    const kl = v * v * v * (v * (v * 6 - 15) + 10);
    _aim.copy(fromLook).sub(fromPos).normalize();
    _viewDir.copy(_farPoint).sub(_desired);
    const toLen = _viewDir.length();
    if (toLen > 1e-4) _viewDir.multiplyScalar(1 / toLen);
    else _viewDir.copy(_aim);
    _aim.lerp(_viewDir, kl);
    if (_aim.lengthSq() < 0.01) _aim.copy(_viewDir);
    _look.copy(_desired).addScaledVector(_aim.normalize(), Math.max(14, toLen));
    return fromFov + (fov - fromFov) * k;
  }

  // ------------------------------------------------------------------ drone

  /** Clamp a proposed drone move `_move` from dronePos against structures, ground, ceiling and square. */
  function clampDroneMove(): void {
    const len = _move.length();
    if (len > 1e-6) {
      _rayDir.copy(_move).multiplyScalar(1 / len);
      const hit = raycast(dronePos, _rayDir, len + WATCH_DRONE.radiusM);
      if (hit) {
        const n = hit.normal;
        const into = _move.dot(n);
        if (into < 0) {
          // slide along the face: the move and the velocity lose their component into it
          _move.addScaledVector(n, -into);
          const vInto = droneVel.dot(n);
          if (vInto < 0) droneVel.addScaledVector(n, -vInto);
          const slideLen = _move.length();
          if (slideLen > 1e-6) {
            // one re-test: a corner (a second face) stops the slide short of it
            _rayDir.copy(_move).multiplyScalar(1 / slideLen);
            const again = raycast(dronePos, _rayDir, slideLen + WATCH_DRONE.radiusM);
            if (again) _move.copy(_rayDir).multiplyScalar(Math.max(0, Math.min(slideLen, again.dist - WATCH_DRONE.radiusM)));
          }
        } else {
          // a face seen from behind (no usable normal): stop short of it
          _move.copy(_rayDir).multiplyScalar(Math.max(0, Math.min(len, hit.dist - WATCH_DRONE.radiusM)));
          droneVel.set(0, 0, 0);
        }
      }
    }
    dronePos.add(_move);
    const half = WATCH_DRONE.halfExtentM;
    if (dronePos.x > half) { dronePos.x = half; if (droneVel.x > 0) droneVel.x = 0; }
    if (dronePos.x < -half) { dronePos.x = -half; if (droneVel.x < 0) droneVel.x = 0; }
    if (dronePos.z > half) { dronePos.z = half; if (droneVel.z > 0) droneVel.z = 0; }
    if (dronePos.z < -half) { dronePos.z = -half; if (droneVel.z < 0) droneVel.z = 0; }
    const ground = footprintGround(heightField, dronePos.x, dronePos.z, WATCH_DRONE.footprintM);
    const floor = ground + WATCH_DRONE.hardClearanceM;
    if (dronePos.y < floor) { dronePos.y = floor; if (droneVel.y < 0) droneVel.y = 0; }
    const ceiling = Math.min(WATCH_DRONE.ceilingM, ground + WATCH_DRONE.ceilingAboveGroundM);
    if (dronePos.y > ceiling) { dronePos.y = ceiling; if (droneVel.y > 0) droneVel.y = 0; }
  }

  /** The terrain-follow floor: the highest ground under the footprint and ahead along the horizontal velocity. */
  function floorAhead(): number {
    let ground = footprintGround(heightField, dronePos.x, dronePos.z, WATCH_DRONE.footprintM);
    for (const t of WATCH_DRONE.lookAheadS) {
      ground = Math.max(ground, footprintGround(heightField, dronePos.x + droneVel.x * t, dronePos.z + droneVel.z * t,
        WATCH_DRONE.footprintM));
    }
    return ground + WATCH_DRONE.floorClearanceM;
  }

  /** The vertical speed the drone wants: the climb stick or the held altitude, lifted by the floor, under the ceiling. */
  function verticalTarget(climb: number, climbRate: number): number {
    let vy: number;
    if (Math.abs(climb) > 1e-3) { vy = climb * climbRate; holdY = dronePos.y; climbing = true; }
    else {
      // let go of the climb: hold the height the drone coasts to, not the one it was let go at (no sink back)
      if (climbing) { holdY = dronePos.y + droneVel.y * WATCH_DRONE.verticalTauS; climbing = false; }
      vy = THREE.MathUtils.clamp((holdY - dronePos.y) / WATCH_DRONE.holdTauS, -climbRate, climbRate);
    }
    const floor = floorAhead();
    if (dronePos.y < floor) {
      const rise = Math.max(WATCH_DRONE.floorRiseMps, Math.hypot(droneVel.x, droneVel.z) * 0.8);
      vy = Math.max(vy, Math.min(rise, (floor - dronePos.y) / WATCH_DRONE.floorTauS));
    }
    return vy;
  }

  /** The speed toward a limit `distM` away that can still stop at edgeBrakeMps2 (a braking curve: no dead stop). */
  const stoppable = (distM: number): number => Math.sqrt(2 * WATCH_DRONE.edgeBrakeMps2 * Math.max(0, distM));

  /** Toward the square's edges and the ceiling the drone brakes on the curve, so it arrives at rest, never stopped. */
  function softEdges(): void {
    const half = WATCH_DRONE.halfExtentM;
    if (droneVel.x > 0) droneVel.x = Math.min(droneVel.x, stoppable(half - dronePos.x));
    if (droneVel.x < 0) droneVel.x = Math.max(droneVel.x, -stoppable(half + dronePos.x));
    if (droneVel.z > 0) droneVel.z = Math.min(droneVel.z, stoppable(half - dronePos.z));
    if (droneVel.z < 0) droneVel.z = Math.max(droneVel.z, -stoppable(half + dronePos.z));
    if (droneVel.y > 0) {
      const ground = footprintGround(heightField, dronePos.x, dronePos.z, WATCH_DRONE.footprintM);
      droneVel.y = Math.min(droneVel.y, stoppable(Math.min(WATCH_DRONE.ceilingM, ground + WATCH_DRONE.ceilingAboveGroundM) - dronePos.y));
    }
  }

  /** Bank, lens and pose: the drone's camera from its state. */
  function presentDrone(dt: number, boosting: boolean): void {
    const fx = Math.sin(droneYaw), fz = Math.cos(droneYaw);
    const lateral = droneVel.x * -fz + droneVel.z * fx;
    const yawRate = dt > 0 ? wrapPi(droneYaw - prevYaw) / dt : 0;
    prevYaw = droneYaw;
    const bankT = THREE.MathUtils.clamp(-lateral * WATCH_DRONE.bankPerMps + yawRate * WATCH_DRONE.bankPerRadS,
      -WATCH_DRONE.bankMax, WATCH_DRONE.bankMax) * A11Y.shake;
    droneRoll += (bankT - droneRoll) * ease(dt, 0.25);
    const fovT = boosting ? WATCH_DRONE.boostFovDeg : WATCH_DRONE.fovDeg;
    droneFov += (fovT - droneFov) * ease(dt, 0.3);
    camera.position.copy(dronePos);
    camera.up.set(0, 1, 0);
    camera.rotation.set(dronePitch, droneYaw + Math.PI, droneRoll, 'YXZ');
    setFov(droneFov);
    camera.userData.scoped = false;
  }

  function easeLook(dt: number): void {
    const kLook = ease(dt, WATCH_DRONE.lookTauS);
    droneYaw += wrapPi(droneYawT - droneYaw) * kLook;
    dronePitch += (dronePitchT - dronePitch) * kLook;
  }

  function updateDrone(dt: number, input: WatchCameraInput): void {
    if (lockTarget) { updateOrbit(dt, input); return; }
    if (input.wheel) {
      speedIndex = THREE.MathUtils.clamp(speedIndex + Math.sign(input.wheel), 0, WATCH_DRONE.speeds.length - 1);
    }
    droneYawT -= input.lookDX * WATCH_DRONE.lookSens;
    dronePitchT = THREE.MathUtils.clamp(dronePitchT - input.lookDY * WATCH_DRONE.lookSens,
      WATCH_DRONE.pitchMin, WATCH_DRONE.pitchMax);
    easeLook(dt);

    const agl = dronePos.y - footprintGround(heightField, dronePos.x, dronePos.z, WATCH_DRONE.footprintM);
    const speed = Math.min(WATCH_DRONE.maxSpeedMps,
      WATCH_DRONE.speeds[speedIndex] * droneHeightScale(agl) * (input.boost ? WATCH_DRONE.boostScale : 1));
    const fx = Math.sin(droneYaw), fz = Math.cos(droneYaw);
    // the lens's screen right (rotation.y = yaw + π turns local +X to (-cos yaw, 0, sin yaw))
    const rx = -fz, rz = fx;
    const f = shapeStick(input.moveForward), r = shapeStick(input.moveRight), u = shapeStick(input.moveUp);
    _desiredVel.set((fx * f + rx * r) * speed, 0, (fz * f + rz * r) * speed);
    let liftUp = 0;
    if (liftOffT > 0) {
      // the exit's rise and back-off, fading out under the watcher's own stick
      const share = liftOffT / WATCH_DRONE.liftOffS;
      _desiredVel.x -= fx * WATCH_DRONE.liftOffBackMps * share;
      _desiredVel.z -= fz * WATCH_DRONE.liftOffBackMps * share;
      liftUp = WATCH_DRONE.liftOffUpMps * share;
      liftOffT = Math.max(0, liftOffT - Math.max(0, dt));
      holdY = dronePos.y;
    }
    // two lags: the stick eases, then the velocity follows it (a quicker start than its glide out)
    stickVel.lerp(_desiredVel, ease(dt, WATCH_DRONE.stickTauS));
    const steering = Math.abs(f) + Math.abs(r) > 1e-3 || liftOffT > 0;
    const kH = ease(dt, steering ? WATCH_DRONE.accelTauS : WATCH_DRONE.brakeTauS);
    droneVel.x += (stickVel.x - droneVel.x) * kH;
    droneVel.z += (stickVel.z - droneVel.z) * kH;
    const climbRate = Math.max(WATCH_DRONE.climbMinMps, speed * WATCH_DRONE.climbShare);
    const vy = verticalTarget(u, climbRate) + liftUp;
    droneVel.y += (vy - droneVel.y) * ease(dt, WATCH_DRONE.verticalTauS);
    softEdges();
    _move.copy(droneVel).multiplyScalar(Math.max(0, dt));
    clampDroneMove();
    presentDrone(dt, input.boost && steering);
  }

  // ------------------------------------------------------------- lock-on orbit

  /** Orbit the locked tank: the drone flies to its slot on the orbit (the free flight's clamps) and the lens holds the
   *  tank, turning onto it from wherever it looked over orbitLookInS. */
  function updateOrbit(dt: number, input: WatchCameraInput): void {
    const ent = lockTarget!;
    pivotFor(ent, _pivotTarget);
    if (_pivotTarget.distanceTo(lockCenter) > WATCH_DRONE.orbitJumpM) {
      // the tank went somewhere else at once (a revive): let go, fly on
      camApi.lock(null);
      updateDrone(dt, input);
      return;
    }
    lockCenter.lerp(_pivotTarget, ease(dt, WATCH_DRONE.orbitFollowTauS));
    const rate = WATCH_DRONE.speeds[speedIndex] * (input.boost ? WATCH_DRONE.boostScale : 1);
    const f = shapeStick(input.moveForward), r = shapeStick(input.moveRight), u = shapeStick(input.moveUp);
    // sideways and the mouse go round, climb and the mouse raise it, forward closes in, the wheel steps the range
    orbitAz += (r * rate / orbitR) * dt - input.lookDX * WATCH_DRONE.lookSens;
    orbitEl = THREE.MathUtils.clamp(orbitEl + (u * rate / orbitR) * dt + input.lookDY * WATCH_DRONE.lookSens,
      WATCH_DRONE.orbitElMin, WATCH_DRONE.orbitElMax);
    orbitR *= Math.exp((-f * rate / Math.max(orbitR, WATCH_DRONE.orbitMinM)) * dt);
    if (input.wheel) orbitR *= Math.pow(0.85, Math.sign(input.wheel));
    orbitR = THREE.MathUtils.clamp(orbitR, WATCH_DRONE.orbitMinM, WATCH_DRONE.orbitMaxM);
    const ce = Math.cos(orbitEl);
    _slot.set(lockCenter.x + Math.sin(orbitAz) * ce * orbitR, lockCenter.y + Math.sin(orbitEl) * orbitR,
      lockCenter.z + Math.cos(orbitAz) * ce * orbitR);
    // a damped pursuit of the slot, through the floor, the edges and the structures
    _desiredVel.copy(_slot).sub(dronePos).multiplyScalar(1 / WATCH_DRONE.orbitSlotTauS);
    const cap = WATCH_DRONE.maxSpeedMps;
    if (_desiredVel.lengthSq() > cap * cap) _desiredVel.setLength(cap);
    droneVel.lerp(_desiredVel, ease(dt, WATCH_DRONE.stickTauS));
    const floor = floorAhead();
    if (dronePos.y < floor) droneVel.y = Math.max(droneVel.y, Math.min(WATCH_DRONE.floorRiseMps, (floor - dronePos.y) / WATCH_DRONE.floorTauS));
    softEdges();
    _move.copy(droneVel).multiplyScalar(Math.max(0, dt));
    clampDroneMove();
    holdY = dronePos.y;
    // the lens onto the tank: eased in from the old facing, then held
    _viewDir.copy(lockCenter).sub(dronePos);
    const yawTo = Math.atan2(_viewDir.x, _viewDir.z);
    const pitchTo = THREE.MathUtils.clamp(Math.atan2(_viewDir.y, Math.hypot(_viewDir.x, _viewDir.z)),
      WATCH_DRONE.pitchMin, WATCH_DRONE.pitchMax);
    lockLookIn = Math.min(1, lockLookIn + Math.max(0, dt) / WATCH_DRONE.orbitLookInS);
    const k = lockLookIn * lockLookIn * lockLookIn * (lockLookIn * (lockLookIn * 6 - 15) + 10); // smootherstep
    droneYawT = lockFromYaw + wrapPi(yawTo - lockFromYaw) * k;
    dronePitchT = lockFromPitch + (pitchTo - lockFromPitch) * k;
    easeLook(dt);
    stickVel.set(droneVel.x, 0, droneVel.z);
    presentDrone(dt, false);
  }

  function adoptCameraPose(): void {
    dronePos.copy(camera.position);
    camera.getWorldDirection(_viewDir);
    droneYaw = droneYawT = prevYaw = Math.atan2(_viewDir.x, _viewDir.z);
    dronePitch = dronePitchT = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(_viewDir.y, -1, 1)),
      WATCH_DRONE.pitchMin, WATCH_DRONE.pitchMax);
    droneRoll = 0;
    droneFov = THREE.MathUtils.clamp(camera.fov, 20, WATCH_DRONE.boostFovDeg);
    holdY = dronePos.y;
    stickVel.set(0, 0, 0);
    lockTarget = null;
  }

  // ------------------------------------------------------------------- ride

  function pivotFor(ent: CameraEntity, out: THREE.Vector3): THREE.Vector3 {
    if (ent.visual) ent.visual.turretTopWorld(out);
    else {
      out.copy(ent.state.pos);
      out.y += ent.spec?.dims?.heightM ?? 2.4;
    }
    out.y += WATCH_RIDE.pivotAboveTurretM;
    return out;
  }

  function sightAnchorFor(ent: CameraEntity, out: THREE.Vector3): THREE.Vector3 {
    if (ent.visual) ent.visual.gunPivotWorld(out);
    else {
      out.copy(ent.state.pos);
      out.y += ent.spec?.dims?.heightM ?? 2.4;
    }
    return out;
  }

  /** The gunner's lay from `from`: its aim point when it has one, else the turret's line. */
  function layAngles(ent: CameraEntity, from: THREE.Vector3): { yaw: number; pitch: number } {
    const aim = ent.input?.aimPoint;
    if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.y) && Number.isFinite(aim.z)) {
      _aim.copy(aim).sub(from);
      const h = Math.hypot(_aim.x, _aim.z);
      if (h > 3) {
        layOut.yaw = Math.atan2(_aim.x, _aim.z);
        layOut.pitch = THREE.MathUtils.clamp(Math.atan2(_aim.y, h), WATCH_RIDE.pitchMin, WATCH_RIDE.pitchMax);
        return layOut;
      }
    }
    layOut.yaw = ent.state.yaw + ent.state.turretYaw;
    layOut.pitch = THREE.MathUtils.degToRad(-8);
    return layOut;
  }
  const layOut = { yaw: 0, pitch: 0 };

  function updateLook(dt: number, input: WatchCameraInput): void {
    const sens = sight ? WATCH_DRONE.lookSens / WATCH_RIDE.zooms[zoomIndex] : WATCH_DRONE.lookSens;
    if (input.lookDX !== 0 || input.lookDY !== 0) {
      lookYaw -= input.lookDX * sens;
      lookPitch = THREE.MathUtils.clamp(lookPitch - input.lookDY * sens, -1.1, 1.1);
      lookIdleS = 0;
    } else lookIdleS += Math.max(0, dt);
    if (lookIdleS > WATCH_RIDE.freeLookHoldS) {
      const k = ease(dt, WATCH_RIDE.freeLookReturnTauS);
      lookYaw += wrapPi(-lookYaw) * k;
      lookPitch += -lookPitch * k;
    }
  }

  function updateWheel(input: WatchCameraInput): void {
    if (!input.wheel) return;
    const dir = input.wheel > 0 ? 1 : -1;
    for (let n = Math.min(3, Math.abs(input.wheel | 0)); n > 0; n--) {
      if (!sight) {
        if (dir > 0 && orbitIndex === WATCH_RIDE.orbitSteps.length - 1) camApi.setSight(true);
        else orbitIndex = THREE.MathUtils.clamp(orbitIndex + dir, 0, WATCH_RIDE.orbitSteps.length - 1);
      } else {
        const i = zoomIndex + dir;
        if (i < 0) exitSight(false);
        else zoomIndex = Math.min(i, WATCH_RIDE.zooms.length - 1);
      }
    }
  }

  /** Out of the sight: a toggle returns to the orbit step it came from (the player rig's rule), the wheel to the closest. */
  function exitSight(restore: boolean): void {
    if (!sight) return;
    sight = false;
    revealTarget();
    orbitIndex = restore && preSightOrbit >= 0 ? preSightOrbit : WATCH_RIDE.orbitSteps.length - 1;
    dist = WATCH_RIDE.orbitSteps[orbitIndex];
    preSightOrbit = -1;
  }

  function solveWreck(ent: CameraEntity, dt: number): void {
    if (!wreckActive) {
      wreckActive = true;
      wreckAz = Math.atan2(camera.position.x - ent.state.pos.x, camera.position.z - ent.state.pos.z);
    }
    wreckAz += WATCH_RIDE.wreckOrbitRadS * dt;
    pivotFor(ent, _pivotTarget);
    _pivotTarget.y -= WATCH_RIDE.pivotAboveTurretM * 0.6;
    if (!pivotReady) { pivot.copy(_pivotTarget); pivotReady = true; } else pivot.lerp(_pivotTarget, ease(dt, 0.25));
    dist += (WATCH_RIDE.wreckDistM - dist) * ease(dt, 0.8);
    _desired.set(pivot.x + Math.sin(wreckAz) * dist * 0.93, pivot.y + dist * 0.36, pivot.z + Math.cos(wreckAz) * dist * 0.93);
    const floor = heightField.getHeightAt(_desired.x, _desired.z) + WATCH_RIDE.minClearanceM;
    if (_desired.y < floor) _desired.y = floor;
    _look.copy(pivot);
  }

  function solveChase(ent: CameraEntity, dt: number): void {
    pivotFor(ent, _pivotTarget);
    if (!pivotReady) { pivot.copy(_pivotTarget); pivotReady = true; } else pivot.lerp(_pivotTarget, ease(dt, WATCH_RIDE.pivotTauS));
    dist += (WATCH_RIDE.orbitSteps[orbitIndex] - dist) * ease(dt, WATCH_RIDE.distTauS);
    const lay = layAngles(ent, pivot);
    if (!aimReady) { aimYaw = lay.yaw; aimPitch = lay.pitch; aimReady = true; } else {
      const k = ease(dt, WATCH_RIDE.aimTauS);
      aimYaw += wrapPi(lay.yaw - aimYaw) * k;
      aimPitch += (lay.pitch - aimPitch) * k;
    }
    const viewPitch = THREE.MathUtils.clamp(aimPitch + lookPitch - WATCH_RIDE.chasePitchBiasRad,
      WATCH_RIDE.pitchMin, WATCH_RIDE.pitchMax);
    dirFromAngles(aimYaw + lookYaw, viewPitch, _viewDir);
    _desired.copy(pivot).addScaledVector(_viewDir, -dist);
    _rayDir.copy(_desired).sub(pivot);
    const segLen = _rayDir.length();
    if (segLen > 1e-4) {
      _rayDir.multiplyScalar(1 / segLen);
      const hit = raycast(pivot, _rayDir, segLen);
      if (hit) _desired.copy(pivot).addScaledVector(_rayDir, Math.max(0.15, Math.min(segLen, hit.dist - WATCH_RIDE.collisionPadM)));
    }
    const floor = heightField.getHeightAt(_desired.x, _desired.z) + WATCH_RIDE.minClearanceM;
    if (_desired.y < floor) _desired.y = floor;
    _look.copy(pivot);
  }

  /** The gunner sight is slaved to the gun (its bore, where the hull has one; else the gunner's lay): what the gun
   *  covers is the centre of the view, as in the player's own sight. Free look does not move it. */
  function solveSight(ent: CameraEntity, dt: number): void {
    sightAnchorFor(ent, _desired);
    let yaw: number, pitch: number;
    if (ent.visual?.gunDirWorld) {
      ent.visual.gunDirWorld(_gunDir);
      yaw = Math.atan2(_gunDir.x, _gunDir.z);
      pitch = Math.asin(THREE.MathUtils.clamp(_gunDir.y, -1, 1));
    } else {
      const lay = layAngles(ent, _desired);
      yaw = lay.yaw;
      pitch = lay.pitch;
    }
    const k = ease(dt, WATCH_RIDE.sightTauS);
    aimYaw += wrapPi(yaw - aimYaw) * k;
    aimPitch += (pitch - aimPitch) * k;
    dirFromAngles(aimYaw, THREE.MathUtils.clamp(aimPitch, WATCH_RIDE.pitchMin, WATCH_RIDE.pitchMax), _viewDir);
    _look.copy(_desired).addScaledVector(_viewDir, 50);
  }

  function updateRide(dt: number, input: WatchCameraInput): void {
    const ent = target;
    if (!ent || !ent.state) return;
    const wrecked = !!ent.combat?.destroyed;
    if (wrecked && sight) camApi.setSight(false);
    if (!wrecked) { wreckActive = false; updateLook(dt, input); updateWheel(input); }
    let fov: number = WATCH_RIDE.fovDeg;
    if (wrecked) { solveWreck(ent, dt); fov = 50; } else if (sight) {
      solveSight(ent, dt);
      fov = WATCH_RIDE.fovDeg / WATCH_RIDE.zooms[zoomIndex];
      if (ent.visual && hiddenRoot !== ent.visual.root) { revealTarget(); hiddenRoot = ent.visual.root; }
      if (hiddenRoot) hiddenRoot.visible = blendT < blendDur;
    } else {
      solveChase(ent, dt);
      revealTarget();
    }
    fov = applyBlend(dt, fov);
    camera.position.copy(_desired);
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);
    setFov(fov);
    camera.userData.scoped = sight && blendT >= blendDur;
  }

  const camApi: WatchCamera = {
    get mode() { return mode; },
    get target() { return mode === 'ride' ? target : null; },
    get sight() { return mode === 'ride' && sight; },
    get zoom() { return WATCH_RIDE.zooms[zoomIndex]; },
    get orbitStep() { return orbitIndex; },
    get speedIndex() { return speedIndex; },
    get blending() { return blendT < blendDur; },
    get blendProgress() { return blendDur > 0 && blendT < blendDur ? blendT / blendDur : 1; },
    get dronePosition() { return dronePos; },
    get droneVelocity() { return droneVel; },
    get lockTarget() { return mode === 'drone' ? lockTarget : null; },

    lock(next: CameraEntity | null): void {
      if (!next || !next.state) {
        if (!lockTarget) return;
        // let go: free flight carries on from the orbit's pose and speed
        lockTarget = null;
        holdY = dronePos.y;
        droneYawT = droneYaw;
        dronePitchT = dronePitch;
        stickVel.set(droneVel.x, 0, droneVel.z);
        return;
      }
      if (mode !== 'drone') return;
      lockTarget = next;
      pivotFor(next, lockCenter);
      _viewDir.copy(dronePos).sub(lockCenter);
      const range = _viewDir.length();
      orbitR = THREE.MathUtils.clamp(range, WATCH_DRONE.orbitMinM, WATCH_DRONE.orbitMaxM);
      orbitAz = Math.atan2(_viewDir.x, _viewDir.z);
      orbitEl = THREE.MathUtils.clamp(range > 1e-3 ? Math.asin(THREE.MathUtils.clamp(_viewDir.y / range, -1, 1)) : 0.4,
        WATCH_DRONE.orbitElMin, WATCH_DRONE.orbitElMax);
      // a lock from far away is a long flight to the orbit's slot: its ground streams in ahead of the drone
      const ce = Math.cos(orbitEl);
      _slot.set(lockCenter.x + Math.sin(orbitAz) * ce * orbitR, lockCenter.y + Math.sin(orbitEl) * orbitR,
        lockCenter.z + Math.cos(orbitAz) * ce * orbitR);
      const flight = _slot.distanceTo(dronePos);
      if (flight >= 60) deps.prepareDestination?.(_slot, lockCenter, Math.max(0.5, flight / (WATCH_DRONE.maxSpeedMps * 0.6)));
      lockLookIn = 0;
      lockFromYaw = droneYaw;
      lockFromPitch = dronePitch;
    },

    startDrone(liftOff = false): void {
      revealTarget();
      sight = false;
      target = null;
      blendT = blendDur = 0;
      adoptCameraPose();
      droneVel.set(0, 0, 0);
      liftOffT = liftOff ? WATCH_DRONE.liftOffS : 0;
      if (liftOff) {
        droneVel.set(-Math.sin(droneYaw) * WATCH_DRONE.liftOffBackMps, WATCH_DRONE.liftOffUpMps,
          -Math.cos(droneYaw) * WATCH_DRONE.liftOffBackMps);
      }
      // a pose inside a structure or under the ground is lifted out at once
      _move.set(0, 0, 0);
      clampDroneMove();
      mode = 'drone';
    },

    placeDrone(position: THREE.Vector3, yaw: number, pitch: number): void {
      revealTarget();
      sight = false;
      target = null;
      blendT = blendDur = 0;
      dronePos.copy(position);
      droneVel.set(0, 0, 0);
      stickVel.set(0, 0, 0);
      lockTarget = null;
      holdY = position.y;
      droneYaw = droneYawT = prevYaw = yaw;
      dronePitch = dronePitchT = THREE.MathUtils.clamp(pitch, WATCH_DRONE.pitchMin, WATCH_DRONE.pitchMax);
      droneRoll = 0;
      droneFov = WATCH_DRONE.fovDeg;
      _move.set(0, 0, 0);
      clampDroneMove();
      holdY = dronePos.y;
      mode = 'drone';
      camera.position.copy(dronePos);
      camera.rotation.set(dronePitch, droneYaw + Math.PI, 0, 'YXZ');
      setFov(droneFov);
      camera.updateMatrixWorld(true);
    },

    ride(next: CameraEntity, snap = false): void {
      if (!next || !next.state) return;
      if (mode === 'ride' && next === target) return;
      revealTarget();
      lockTarget = null;
      if (sight && target !== next) sight = false;
      target = next;
      mode = 'ride';
      pivotReady = false;
      aimReady = false;
      wreckActive = false;
      lookYaw = lookPitch = 0;
      lookIdleS = 0;
      dist = WATCH_RIDE.orbitSteps[orbitIndex];
      next.visual?.root.updateWorldMatrix(true, true);
      if (snap) { blendT = blendDur = 0; return; }
      pivotFor(next, _pivotTarget);
      beginBlend(_pivotTarget);
      // the hop's destination streams in from the hop's first frame (perf-245's warm): the chase pose behind the tank
      // at the orbit step, looking at its pivot, over the blend
      if (deps.prepareDestination) {
        const yaw = next.state.yaw, back = WATCH_RIDE.orbitSteps[orbitIndex];
        _slot.set(next.state.pos.x - Math.sin(yaw) * back, next.state.pos.y + 3, next.state.pos.z - Math.cos(yaw) * back);
        deps.prepareDestination(_slot, _pivotTarget, blendDur);
      }
    },

    setSight(on: boolean): void {
      if (mode !== 'ride' || !target || (on && target.combat?.destroyed)) return;
      if (on === sight) return;
      if (!on) { exitSight(true); return; }
      sight = true;
      preSightOrbit = orbitIndex;
    },

    update(dt: number, input: WatchCameraInput): boolean {
      if (mode === 'off') return false;
      if (mode === 'drone') updateDrone(dt, input);
      else updateRide(dt, input);
      return true;
    },

    stop(): void {
      revealTarget();
      sight = false;
      target = null;
      lockTarget = null;
      mode = 'off';
      blendT = blendDur = 0;
    },
  };
  return camApi;
}
