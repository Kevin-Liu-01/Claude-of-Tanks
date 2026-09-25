/**
 * battleEndingCamera.ts — turns a battle-ending plan (battleEnding.ts) into camera poses through the rig's
 * external-pose API, and arms the any-key / click skip. Browser-side twin of the pure director: the director
 * owns timing and the decision, this module owns THREE math, terrain clamping and window listeners.
 *
 *   timesUp / pullBack   an eased pull-back from the live view up and away over the player's tank
 *   objective / lineOverview   a slow orbit of the deciding objective, blended in from the live view
 *   wreckOrbit           a tighter orbit of the last wreck
 *
 * The rig is used, never modified (rig.setExternalPose / rig.release, as the killcam does).
 */
import * as THREE from 'three';
import type { BattleEndingPlan, EndingFocus } from './battleEnding.ts';

interface EndingRig {
  setExternalPose(position: THREE.Vector3, target: THREE.Vector3, fovDeg?: number): void;
  release(): void;
}

interface EndingWindow {
  addEventListener(type: string, listener: (event: Event) => void, options?: boolean): void;
  removeEventListener(type: string, listener: (event: Event) => void, options?: boolean): void;
}

export interface BattleEndingCameraDeps {
  rig: EndingRig;
  camera: { position: THREE.Vector3 };
  getPlayerYaw(): number | null;
  getHeightAt(x: number, z: number): number;
  /** The window the skip listens on (null disables the skip: headless probes). */
  win?: EndingWindow | null;
}

export interface BattleEndingCamera {
  /** Start a beat; false when the plan frames nothing (the caller presents the report at once). */
  begin(plan: BattleEndingPlan, onSkip: () => void): boolean;
  /** Pose the rig for progress u in 0..1 (eased inside). */
  frame(u: number): void;
  /** Release the rig and the skip listeners. */
  end(): void;
  readonly active: boolean;
}

const FOV_DEG = 50;
const PULL_BACK_M = 26;
const PULL_UP_M = 15;
const PULL_LOOK_LIFT_M = 1.6;
const ORBIT_MIN_RADIUS_M = 26;
const ORBIT_RADIUS_SCALE = 1.5;
const ORBIT_HEIGHT_SCALE = 0.62;
const ORBIT_SWEEP_RAD = 0.5;
const ORBIT_BLEND_U = 0.4;
const WRECK_RADIUS_M = 16;
const WRECK_HEIGHT_M = 7;
const WRECK_SWEEP_RAD = 0.9;
const WRECK_BLEND_U = 0.35;
const GROUND_CLEARANCE_M = 3;
const SKIP_EVENTS = ['keydown', 'mousedown', 'touchstart'];

const smoothstep = (u: number): number => {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
};

export function createBattleEndingCamera({
  rig, camera, getPlayerYaw, getHeightAt, win = typeof window === 'undefined' ? null : window,
}: BattleEndingCameraDeps): BattleEndingCamera {
  const start = new THREE.Vector3();
  const center = new THREE.Vector3();
  const endPos = new THREE.Vector3();
  const back = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  let plan: BattleEndingPlan | null = null;
  let focus: EndingFocus | null = null;
  let azimuth0 = 0;
  let onSkip: (() => void) | null = null;

  const skipListener = (): void => { onSkip?.(); };
  const arm = (): void => {
    if (!win) return;
    for (const type of SKIP_EVENTS) win.addEventListener(type, skipListener, true);
  };
  const disarm = (): void => {
    if (!win) return;
    for (const type of SKIP_EVENTS) win.removeEventListener(type, skipListener, true);
  };

  const groundY = (x: number, z: number): number => {
    const y = getHeightAt(x, z);
    return Number.isFinite(y) ? y : 0;
  };

  const clampAboveGround = (target: THREE.Vector3): void => {
    target.y = Math.max(target.y, groundY(target.x, target.z) + GROUND_CLEARANCE_M);
  };

  const orbitParams = (): { radius: number; height: number; sweep: number; blend: number } => {
    if (!focus) return { radius: ORBIT_MIN_RADIUS_M, height: ORBIT_MIN_RADIUS_M * ORBIT_HEIGHT_SCALE, sweep: ORBIT_SWEEP_RAD, blend: ORBIT_BLEND_U };
    if (plan?.beat === 'wreckOrbit') {
      return { radius: WRECK_RADIUS_M, height: WRECK_HEIGHT_M, sweep: WRECK_SWEEP_RAD, blend: WRECK_BLEND_U };
    }
    const radius = Math.max(ORBIT_MIN_RADIUS_M, focus.radiusM * ORBIT_RADIUS_SCALE);
    return { radius, height: radius * ORBIT_HEIGHT_SCALE, sweep: ORBIT_SWEEP_RAD, blend: ORBIT_BLEND_U };
  };

  const framePullBack = (u: number): void => {
    const e = smoothstep(u);
    pos.lerpVectors(start, endPos, e);
    clampAboveGround(pos);
    look.copy(center).y += 0.6;
    rig.setExternalPose(pos, look, FOV_DEG);
  };

  const frameOrbit = (u: number): void => {
    const { radius, height, sweep, blend } = orbitParams();
    const az = azimuth0 + sweep * u;
    endPos.set(center.x + Math.sin(az) * radius, center.y + height, center.z + Math.cos(az) * radius);
    clampAboveGround(endPos);
    pos.lerpVectors(start, endPos, smoothstep(blend > 0 ? u / blend : 1));
    clampAboveGround(pos);
    look.copy(center);
    rig.setExternalPose(pos, look, FOV_DEG);
  };

  return {
    begin(next, skip) {
      focus = next.focus;
      if (!focus || next.beat === 'none') return false;
      plan = next;
      onSkip = skip;
      start.copy(camera.position);
      if (!Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(start.z)) start.set(focus.x, 0, focus.z);
      const focusY = focus.y != null && Number.isFinite(focus.y) ? focus.y : groundY(focus.x, focus.z);
      center.set(focus.x, focusY + PULL_LOOK_LIFT_M, focus.z);
      // a camera that was never placed (fresh boot, headless) starts from a chase pose behind the focus
      if (start.distanceToSquared(center) < 1) {
        const yaw = getPlayerYaw() ?? 0;
        start.set(center.x - Math.sin(yaw) * 13, center.y + 4, center.z - Math.cos(yaw) * 13);
      }
      if (plan.beat === 'timesUp' || plan.beat === 'pullBack') {
        back.set(start.x - center.x, 0, start.z - center.z);
        if (back.lengthSq() < 1e-4) {
          const yaw = getPlayerYaw() ?? 0;
          back.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        }
        back.normalize();
        endPos.copy(center).addScaledVector(back, PULL_BACK_M);
        endPos.y = center.y + PULL_UP_M;
      } else {
        azimuth0 = Math.atan2(start.x - center.x, start.z - center.z);
      }
      arm();
      this.frame(0);
      return true;
    },
    frame(u) {
      if (!plan) return;
      if (plan.beat === 'timesUp' || plan.beat === 'pullBack') framePullBack(u);
      else frameOrbit(u);
    },
    end() {
      if (!plan) return;
      disarm();
      onSkip = null;
      plan = null;
      focus = null;
      rig.release();
    },
    get active() { return plan !== null; },
  };
}
