import { garageViewPoint } from '../game/garagePresentationPose.ts';
import type { GarageVariant } from '../game/garageVariants.ts';
import type { KitVec } from './garageKitGeometry.ts';

/**
 * Small helpers for the per-garage kit tables (garage r9): a placement's yaw that turns a piece's front (+Z) toward a
 * point of the opening view, an atmosphere card corner given in the view's frame, and which Garages' tables lay out
 * their own working cells. No three.js: the facility and the slideshow table read it.
 */

/**
 * The Garages whose kit tables lay out their own working cells (fuel and water points, ammunition points, an engine
 * cell): the facility drops its primitive station piles and loose yard piece there (garageFacilityDetails.ts).
 */
export const GARAGE_KIT_CELL_ARCHITECTURES: ReadonlySet<GarageVariant['architecture']> = new Set<GarageVariant['architecture']>([
  'shade_depot', 'brick_arsenal',
]);

/**
 * The Garages whose kit tables stock the two shelter flanks beside the turntable with their own pieces (a gas cage, a
 * pallet with drums or stores): the facility counts those stations (purposes, stock, the secured cage) but emits no
 * primitive for them (garageFacilityDetails.ts). A Garage is in at most one of these two sets.
 */
export const GARAGE_KIT_FLANK_ARCHITECTURES: ReadonlySet<GarageVariant['architecture']> = new Set<GarageVariant['architecture']>([
  'naval_drydock', 'rail_roundhouse', 'factory_line',
]);

/** The canonical camera's ground point in the opening view's frame (side, depth). */
const GARAGE_CANONICAL_CAMERA_VIEW: readonly [number, number] = [0, -19.03];

/** The kit yaw (relative to the yard grid) that turns a piece at `at` to face `target` (both [side, depth]). */
export function kitYawToward(at: readonly [number, number], target: readonly [number, number] = GARAGE_CANONICAL_CAMERA_VIEW): number {
  const direction = garageViewPoint(target[0] - at[0], target[1] - at[1]);
  return Math.atan2(direction.x, direction.z);
}

/** A world-local point from the opening view's frame (side, height, depth), for atmosphere cards. */
export function kitViewPoint(side: number, y: number, depth: number): KitVec {
  const point = garageViewPoint(side, depth);
  return [point.x, y, point.z];
}
