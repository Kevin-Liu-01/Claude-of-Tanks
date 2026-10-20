// src/engine/nearVehicleShadowDetail.ts — round 28 (2026-09-20, owner: "shadows look weird on tanks, verify this
// yourself from a shadow on a tank"). Every tank casts through three convex proxies (hull / turret / gun) so that
// forty-two hulls cost nine shadow draws each across the cascades. Convex proxies have no concavities: a turret
// never shadows its own deck, a gun never shadows the glacis, stowage never shadows a fender, and the ground shadow
// is a box floating at belly height. This module lets the FEW hulls the player is actually looking at cast their
// real armour instead — only into the cascade that covers them — while the proxies keep serving every other hull
// and every farther cascade. The tank factory marks each hull's detail set (`markVehicleShadowDetail`); the
// lighting module installs the policy on the shadow router (renderLayers.ts) and calls `update()` once per frame.
import type { Camera, Object3D, Scene } from 'three';
import { Matrix4, Vector3 } from 'three';
import type { ShadowCascadePolicy } from './renderLayers.ts';

/**
 * Hulls farther than this from the camera keep their convex proxies in every cascade (2026-10-15, SKY shadows r2b: 70 m
 * -> 90 m, High's cascade-1 break; the detail / proxy swap stood where the ground occlusion fades, 50-70 m).
 */
export const NEAR_VEHICLE_SHADOW_RANGE_M = 90;
/** At most this many hulls cast their real armour per frame (the nearest ones) on Ultra and High (r2b: 4 -> 6). */
export const NEAR_VEHICLE_SHADOW_MAX = 6;
/** Medium and Low keep four (their near cascade's budget). */
const NEAR_VEHICLE_SHADOW_MAX_LOWER = 4;
/**
 * The swap's hysteresis (r2b): a hull enters the selection inside the range less this and leaves past the range plus
 * this (m), so a hull driving along the boundary does not flip between its armour and its proxies.
 */
export const NEAR_VEHICLE_SHADOW_HYSTERESIS_M = 8;
/** And by rank: a hull selected last update competes for the cap as if this much nearer (m). */
export const NEAR_VEHICLE_SHADOW_RANK_HOLD_M = 6;
/**
 * The reduced tier (r2b, the plan's P2b: Ultra Low and every phone preset, whose 512-1024 near cascades the full sets
 * would cost too much): the nearest hull alone — in practice the player's own, 13 m from the orbit camera and under the
 * gunner's — within this range (m), into cascade 0 only, with NEAR_SHADOW_REDUCED_NAMES' meshes (about eight draws).
 * Every other hull keeps its proxies, as before; without it the player's tank cast a rectangle on those tiers.
 */
export const NEAR_VEHICLE_SHADOW_REDUCED_RANGE_M = 30;
/** The cap by quality preset: six hulls on Ultra and High, four elsewhere. */
export function nearVehicleShadowMaxFor(preset: string): number {
  return preset === 'ultra' || preset === 'high' ? NEAR_VEHICLE_SHADOW_MAX : NEAR_VEHICLE_SHADOW_MAX_LOWER;
}
/** A hull straddling a cascade boundary casts into both; this is the half extent that decides "straddling". */
export const NEAR_VEHICLE_SHADOW_EXTENT_M = 6;
export const VEHICLE_SHADOW_DETAIL_KEY = 'nearShadowDetail';

interface VehicleShadowDetail {
  /** Real armour / running-gear meshes that cast when the hull is near (castShadow is toggled around each cascade). */
  readonly detail: readonly Object3D[];
  /** The convex proxies (or their batch sources) hidden while the detail casts. */
  readonly proxies: readonly Object3D[];
}

export interface CascadeRange { readonly near: number; readonly far: number; }

interface NearVehicleShadowPolicyOptions {
  camera: Camera;
  scene: Scene;
  /** Per-cascade view-depth ranges in metres (CSM breaks × far). */
  cascadeRanges(): readonly CascadeRange[];
  /** False keeps every hull on its proxies (debug A/B; the tiers without a near-detail budget). */
  enabled(): boolean;
  /** True: the reduced tier (NEAR_VEHICLE_SHADOW_REDUCED_RANGE_M): one hull, cascade 0, the reduced mesh set. */
  reduced?: () => boolean;
  rangeM?: number;
  /** The cap: a number, or read at every update (lighting.ts: the live preset's nearVehicleShadowMaxFor). */
  max?: number | (() => number);
  extentM?: number;
  /**
   * 2026-10-14 (SKY shadows r2a): the direction FROM the sun (CSM lightDirection), so a hull's detail covers every cascade
   * its shadow lands in — the shadow reaches NEAR_VEHICLE_SHADOW_HEIGHT_M / tan(elevation) down-sun, and under a low sun
   * that crosses a break a hull's own depth does not (a detail / proxy seam inside one shadow at 18-24 m).
   */
  sunDirection?: () => Vector3;
}

interface NearVehicleSelection {
  readonly root: Object3D;
  readonly depth: number;
  readonly cascadeMask: number;
}
/** A candidate's competing depth: its own, less the rank hold when it was selected last update. */
interface NearVehicleCandidate extends NearVehicleSelection { readonly rank: number; }

export interface NearVehicleShadowPolicy extends ShadowCascadePolicy {
  /** Re-select the near hulls for this frame; cheap (scene children only). */
  update(): void;
  readonly selected: readonly NearVehicleSelection[];
}

export function markVehicleShadowDetail(root: Object3D, detail: VehicleShadowDetail): void {
  root.userData[VEHICLE_SHADOW_DETAIL_KEY] = detail;
}

export function vehicleShadowDetailOf(root: Object3D): VehicleShadowDetail | null {
  const detail = root.userData[VEHICLE_SHADOW_DETAIL_KEY] as VehicleShadowDetail | undefined;
  return detail && Array.isArray(detail.detail) && Array.isArray(detail.proxies) ? detail : null;
}

/** Cascade ranges from a CSM instance: breaks are fractions of min(camera.far, maxFar). */
export function cascadeRangesFromBreaks(breaks: readonly number[], near: number, far: number): CascadeRange[] {
  const ranges: CascadeRange[] = [];
  let previous = 0;
  for (const fraction of breaks) {
    ranges.push({ near: Math.max(near, previous * far), far: fraction * far });
    previous = fraction;
  }
  return ranges;
}

/** The hull height whose shadow the cascade mask follows (m): a turret roof, its tallest common part. */
export const NEAR_VEHICLE_SHADOW_HEIGHT_M = 3;
/** The shadow's reach is capped here (m): a sun near the horizon would otherwise ask for every cascade. */
export const NEAR_VEHICLE_SHADOW_REACH_MAX_M = 40;

/**
 * The view-depth span of a hull's shadow (m, [min, max] offsets from its own depth): the shadow runs from the hull
 * down-sun over height / tan(elevation), projected on the camera's forward. `fromSun` is the CSM light direction.
 */
function shadowReachDepthSpan(fromSun: Vector3, viewMatrix: Matrix4, heightM = NEAR_VEHICLE_SHADOW_HEIGHT_M): [number, number] {
  const horizontal = Math.hypot(fromSun.x, fromSun.z);
  const sinElevation = -fromSun.y;
  if (!(horizontal > 1e-6) || !(sinElevation > 0)) return [0, 0];
  const reach = Math.min(NEAR_VEHICLE_SHADOW_REACH_MAX_M, heightM * horizontal / sinElevation);
  _reach.set(fromSun.x / horizontal * reach, 0, fromSun.z / horizontal * reach).transformDirection(viewMatrix).multiplyScalar(reach);
  const depthDelta = -_reach.z;
  return [Math.min(0, depthDelta), Math.max(0, depthDelta)];
}
const _reach = new Vector3();

/** Bit i set when a hull at `depth` (± extent) overlaps cascade i. */
export function cascadeMaskForDepth(depth: number, extent: number, ranges: readonly CascadeRange[]): number {
  let mask = 0;
  for (let i = 0; i < ranges.length && i < 31; i++) {
    const r = ranges[i];
    if (depth + extent >= r.near && depth - extent < r.far) mask |= 1 << i;
  }
  return mask;
}

const _view = new Matrix4();
const _position = new Vector3();

export function createNearVehicleShadowPolicy(options: NearVehicleShadowPolicyOptions): NearVehicleShadowPolicy {
  const rangeM = options.rangeM ?? NEAR_VEHICLE_SHADOW_RANGE_M;
  const maxOption = options.max ?? NEAR_VEHICLE_SHADOW_MAX;
  const extentM = options.extentM ?? NEAR_VEHICLE_SHADOW_EXTENT_M;
  const selected: NearVehicleSelection[] = [];
  const candidates: NearVehicleCandidate[] = [];
  // the hulls selected by the last update (the hysteresis reads them); cleared and refilled in place
  const held = new Set<Object3D>();
  let reducedNow = false;
  // the flags flipped for the cascade being rendered, restored in afterLight in reverse order
  const flipped: { object: Object3D; castShadow: boolean; visible: boolean }[] = [];

  function update(): void {
    held.clear();
    for (const entry of selected) held.add(entry.root);
    selected.length = 0;
    if (!options.enabled()) return;
    const ranges = options.cascadeRanges();
    if (!ranges.length) return;
    reducedNow = options.reduced?.() ?? false;
    const max = reducedNow ? 1 : typeof maxOption === 'function' ? maxOption() : maxOption;
    const range = reducedNow ? NEAR_VEHICLE_SHADOW_REDUCED_RANGE_M : rangeM;
    options.camera.updateMatrixWorld();
    _view.copy(options.camera.matrixWorld).invert();
    const span = options.sunDirection ? shadowReachDepthSpan(options.sunDirection(), _view) : [0, 0];
    candidates.length = 0;
    for (const child of options.scene.children) {
      const detail = vehicleShadowDetailOf(child);
      if (!detail || !child.visible || !detail.detail.length) continue;
      child.getWorldPosition(_position).applyMatrix4(_view);
      const depth = -_position.z;
      // (r2b) the hysteresis: in inside range - H, out past range + H
      const wasHeld = held.has(child);
      if (!(depth > -extentM) || depth > range + (wasHeld ? NEAR_VEHICLE_SHADOW_HYSTERESIS_M : -NEAR_VEHICLE_SHADOW_HYSTERESIS_M)) continue;
      // (2026-10-14: and every cascade its shadow lands in: the reach down-sun, on the view depth)
      let cascadeMask = cascadeMaskForDepth(Math.max(0, depth), extentM, ranges);
      if (span[0] < 0 || span[1] > 0) {
        const lo = Math.max(0, depth + span[0]), hi = Math.max(0, depth + span[1]);
        cascadeMask |= cascadeMaskForDepth((lo + hi) / 2, (hi - lo) / 2 + extentM, ranges);
      }
      if (reducedNow) {
        // cascade 0 only, and only a hull with a reduced mesh to cast (its proxies are hidden while the detail casts)
        cascadeMask &= 1;
        if (!detail.detail.some(isReducedMesh)) continue;
      }
      if (!cascadeMask) continue;
      candidates.push({ root: child, depth, cascadeMask, rank: depth - (wasHeld ? NEAR_VEHICLE_SHADOW_RANK_HOLD_M : 0) });
    }
    candidates.sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < candidates.length && i < max; i++) selected.push(candidates[i]);
  }

  function beforeLight(_light: Object3D, cascadeIndex: number): void {
    flipped.length = 0;
    if (cascadeIndex < 0 || !selected.length) return;
    const bit = 1 << cascadeIndex;
    for (const entry of selected) {
      if (!(entry.cascadeMask & bit)) continue;
      const detail = vehicleShadowDetailOf(entry.root);
      if (!detail) continue;
      for (const mesh of detail.detail) {
        if (mesh.castShadow || (reducedNow && !isReducedMesh(mesh))) continue;
        flipped.push({ object: mesh, castShadow: mesh.castShadow, visible: mesh.visible });
        mesh.castShadow = true;
      }
      for (const proxy of detail.proxies) {
        if (!proxy.visible) continue;
        flipped.push({ object: proxy, castShadow: proxy.castShadow, visible: proxy.visible });
        proxy.visible = false;
      }
    }
  }

  function afterLight(): void {
    for (let i = flipped.length - 1; i >= 0; i--) {
      const f = flipped[i];
      f.object.castShadow = f.castShadow;
      f.object.visible = f.visible;
    }
    flipped.length = 0;
  }

  return { update, beforeLight, afterLight, selected };
}

/** Names of the armour / running-gear meshes worth casting for a near hull (see tankFactoryCore.collectNearShadowDetail). */
export const NEAR_SHADOW_DETAIL_NAMES: ReadonlySet<string> = new Set([
  'hull', 'hullDark', 'hullDetail', 'hullExternalArmor', 'hullEquipment', 'hullTrackGuardL', 'hullTrackGuardR',
  'hullRubber', 'hullFixedPaintedBodywork', 'hullOpenLattice',
  'turret', 'turretDark', 'turretDetail', 'turretExternalArmor', 'turretEquipment',
  'gun', 'gunDark', 'gunMount', 'gunMountDark',
  'gearTrackBandL', 'gearTrackBandR', 'gearEndWheelBody', 'gearEndWheelHardware',
  // instanced running gear: one draw each
  'gearRoadWheelDiscs', 'gearRoadWheelTires', 'gearReturnRollerDiscs', 'gearReturnRollerTires', 'gearTrackPadsSimplified',
]);
/** The reduced tier's set (P2b): the silhouette and the running gear's bands, discs and pads, about eight draws. */
export const NEAR_SHADOW_REDUCED_NAMES: ReadonlySet<string> = new Set([
  'hull', 'turret', 'gun', 'gearTrackBandL', 'gearTrackBandR', 'gearRoadWheelDiscs', 'gearRoadWheelTires', 'gearTrackPadsSimplified',
]);
const isReducedMesh = (mesh: Object3D): boolean => NEAR_SHADOW_REDUCED_NAMES.has(mesh.name);
/** Detail sets are capped so a hull never adds more than this many shadow draws to its cascade. */
export const NEAR_SHADOW_DETAIL_MAX_MESHES = 28;
