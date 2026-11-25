/**
 * fire-center-277 (Kevin 2026-11-24: "tank fires need to be from the center of tank. rn its not, fix."): where a burning
 * hull's live fire stands on it, in the hull's own frame (the visual root's: +Z forward, the ground at y 0).
 *
 * The fire burns over the hull's measured centre: the middle of the hull's drawn bounds that tools/gen-combat-anatomy.mjs
 * measures off every build (combatAnatomyCalibration(id).hull), never the model's origin. Origins differ per tank
 * (the T95's drawn hull sits 1.7 m behind its origin, the M46's 1.3 m), so no offset from the origin can centre it; the
 * 275 law (a hit's point, else the rear deck 0.3 of the length behind the origin) put every fire off the centre.
 * Its flames rise out of the top over that centre: the deck, or the turret's roof when the turret covers the centre at
 * every bearing (the deck there is under the turret, and flames born in it would be hidden).
 * A spec with no calibration (a Studio stand-in, a test hull) burns over its dims' middle on the 275 deck share.
 */
import { combatAnatomyCalibration } from '../vehicles/combatAnatomyCalibrationRegistry.ts';

/** A hull's box for its fire, in the hull frame: its measured bounds and middle, the top over the middle as max[1]. */
export interface HullFireFrame {
  readonly centre: readonly [number, number, number];
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** where the numbers came from: the measured hull, or the spec's dims (no calibration) */
  readonly source: 'calibration' | 'dims';
}

interface FireSpec {
  id?: string;
  dims?: { heightM?: number; hullLengthM?: number; widthM?: number };
  armor?: { turretPivot?: readonly number[] } | null;
}

/** (fire-visible-275) the deck's share of the hull's height over its origin, for a spec with dims and no calibration */
export const HULL_FIRE_DIMS_DECK_K = 0.62;

const frames = new WeakMap<object, HullFireFrame | null>();

function measure(spec: FireSpec): HullFireFrame | null {
  const cal = typeof spec.id === 'string' ? combatAnatomyCalibration(spec.id) : null;
  const hull = cal?.hull;
  if (hull && hull.min.length >= 3 && hull.max.length >= 3) {
    const min: [number, number, number] = [hull.min[0], hull.min[1], hull.min[2]];
    const max: [number, number, number] = [hull.max[0], hull.max[1], hull.max[2]];
    const centre: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const cx = centre[0], cz = centre[2];
    // the turret's roof, when the turret stands over the centre whichever way it faces: its footprint's inscribed reach
    // round its pivot covers the centre
    const turret = cal.turret, pivot = cal.rig?.turretPivot ?? spec.armor?.turretPivot;
    if (turret && pivot && pivot.length >= 3) {
      const reach = Math.min(-turret.min[0], turret.max[0], -turret.min[2], turret.max[2]);
      if (Math.hypot(cx - pivot[0], cz - pivot[2]) <= reach) max[1] = Math.max(max[1], pivot[1] + turret.max[1]);
    }
    // the centre stays the hull's own middle (a hull on its side burns from its side wall over it, not beside it)
    return { centre, min, max, source: 'calibration' };
  }
  const h = spec.dims?.heightM;
  if (!(typeof h === 'number' && h > 0)) return null;
  const L = spec.dims?.hullLengthM ?? 6, W = spec.dims?.widthM ?? 3.4;
  const top = HULL_FIRE_DIMS_DECK_K * h;
  return { centre: [0, top / 2, 0], min: [-W / 2, 0, -L / 2], max: [W / 2, top, L / 2], source: 'dims' };
}

/** The hull's fire frame (cached per spec object); null for a spec with neither a calibration nor a height. */
export function hullFireFrame(spec: FireSpec | null | undefined): HullFireFrame | null {
  if (!spec || typeof spec !== 'object') return null;
  if (frames.has(spec)) return frames.get(spec) ?? null;
  const frame = measure(spec);
  frames.set(spec, frame);
  return frame;
}

/**
 * How far (hull-frame metres) the hull's top lies from its centre along `up`, the world's up in the hull frame (unit):
 * the box's face that ray leaves by. Upright, the top over the centre; tilted, the same top met on the slant; on its
 * side, the side wall; upside down, the belly. So the fire comes up out of the hull however it lies.
 */
export function hullFireRise(frame: HullFireFrame, ux: number, uy: number, uz: number): number {
  const c = frame.centre;
  let t = Infinity;
  if (Math.abs(ux) > 1e-6) t = Math.min(t, (ux > 0 ? frame.max[0] - c[0] : c[0] - frame.min[0]) / Math.abs(ux));
  if (Math.abs(uy) > 1e-6) t = Math.min(t, (uy > 0 ? frame.max[1] - c[1] : c[1] - frame.min[1]) / Math.abs(uy));
  if (Math.abs(uz) > 1e-6) t = Math.min(t, (uz > 0 ? frame.max[2] - c[2] : c[2] - frame.min[2]) / Math.abs(uz));
  return Number.isFinite(t) ? t : frame.max[1] - c[1];
}
