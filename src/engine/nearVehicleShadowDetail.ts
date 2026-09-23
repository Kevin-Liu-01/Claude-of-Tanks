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

/** Hulls farther than this from the camera keep their convex proxies in every cascade. */
export const NEAR_VEHICLE_SHADOW_RANGE_M = 70;
/** At most this many hulls cast their real armour per frame (the nearest ones). */
export const NEAR_VEHICLE_SHADOW_MAX = 4;
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
  /** False keeps every hull on its proxies (mobile tier, low presets, debug A/B). */
  enabled(): boolean;
  rangeM?: number;
  max?: number;
  extentM?: number;
}

interface NearVehicleSelection {
  readonly root: Object3D;
  readonly depth: number;
  readonly cascadeMask: number;
}

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
  const max = options.max ?? NEAR_VEHICLE_SHADOW_MAX;
  const extentM = options.extentM ?? NEAR_VEHICLE_SHADOW_EXTENT_M;
  const selected: NearVehicleSelection[] = [];
  const candidates: NearVehicleSelection[] = [];
  // the flags flipped for the cascade being rendered, restored in afterLight in reverse order
  const flipped: { object: Object3D; castShadow: boolean; visible: boolean }[] = [];

  function update(): void {
    selected.length = 0;
    if (!options.enabled()) return;
    const ranges = options.cascadeRanges();
    if (!ranges.length) return;
    options.camera.updateMatrixWorld();
    _view.copy(options.camera.matrixWorld).invert();
    candidates.length = 0;
    for (const child of options.scene.children) {
      const detail = vehicleShadowDetailOf(child);
      if (!detail || !child.visible || !detail.detail.length) continue;
      child.getWorldPosition(_position).applyMatrix4(_view);
      const depth = -_position.z;
      if (!(depth > -extentM) || depth > rangeM) continue;
      const cascadeMask = cascadeMaskForDepth(Math.max(0, depth), extentM, ranges);
      if (!cascadeMask) continue;
      candidates.push({ root: child, depth, cascadeMask });
    }
    candidates.sort((a, b) => a.depth - b.depth);
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
        if (mesh.castShadow) continue;
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
/** Detail sets are capped so a hull never adds more than this many shadow draws to its cascade. */
export const NEAR_SHADOW_DETAIL_MAX_MESHES = 28;
