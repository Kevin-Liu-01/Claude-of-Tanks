/**
 * fire-center-277: where a burning hull's live fire stands on it, and where its kill stands, in the hull's own frame (the
 * visual root's: +Z forward, the ground at y 0).
 *
 * The hull's centre is the middle of its drawn bounds that tools/gen-combat-anatomy.mjs measures off every build
 * (combatAnatomyCalibration(id).hull), never the model's origin: origins differ per tank (the T95's drawn hull sits 1.7 m
 * behind its origin, the M46's 1.3 m). A tank's kill and its wreck column stand over it (hullCentreWorld; effects.ts
 * centreKillPoint).
 *
 * The live fire burns on the engine deck (Kevin 2026-11-25: "technically they should be over engines cuz thats how fires
 * start"; sim/damage.ts lights a fire from an engine or transmission hit, or a destroyed fuel tank): over the middle of
 * the engine module the hit system itself uses (the finalized spec's armor.modules engine box), front-engined hulls (the
 * IFVs, the Merkavas, the S-tank) at the front. Its flames rise out of the hull's skin there: the top of the measured
 * hull collision cells over that point (a vertical ray), or the turret's roof when the turret covers the point at every
 * bearing (flames born under it would be hidden). A hull with no engine box burns over its centre. A spec with no
 * calibration (a Studio stand-in, a test hull) burns over its dims' middle on the 275 deck share.
 * The 275 law (a hit's point, else 0.3 of the length behind the origin) put fires off both.
 */
import { combatAnatomyCalibration, type AnatomyCalibrationCell } from '../vehicles/combatAnatomyCalibrationRegistry.ts';

type V3 = readonly [number, number, number];

/** A hull's measured box, its centre and its fire's anchor, in the hull frame. */
export interface HullFireFrame {
  /** the hull's measured middle (kills, wreck columns) */
  readonly centre: V3;
  /** the hull's measured box */
  readonly min: V3;
  readonly max: V3;
  /** the fire's ray origin: the engine's middle (else the hull's centre) */
  readonly fire: V3;
  /** the skin's top over the fire's point: the engine deck, or the turret's roof over it */
  readonly fireTop: number;
  /** what the fire stands over */
  readonly anchor: 'engine' | 'centre';
  /** where the numbers came from: the measured hull, or the spec's dims (no calibration) */
  readonly source: 'calibration' | 'dims';
}

interface FireModule { module?: string; min?: readonly number[]; max?: readonly number[]; turretLocal?: boolean; external?: boolean }

interface FireSpec {
  id?: string;
  dims?: { heightM?: number; hullLengthM?: number; widthM?: number };
  armor?: { turretPivot?: readonly number[]; modules?: readonly FireModule[] } | null;
}

/** (fire-visible-275) the deck's share of the hull's height over its origin, for a spec with dims and no calibration */
export const HULL_FIRE_DIMS_DECK_K = 0.62;

const frames = new WeakMap<object, HullFireFrame | null>();

/** The highest point of the measured hull skin on the vertical through (x, z): its triangles' crossings; null for none. */
function skinTopAt(cells: readonly AnatomyCalibrationCell[], x: number, z: number): number | null {
  let top = -Infinity;
  for (const cell of cells) {
    if (x < cell.min[0] || x > cell.max[0] || z < cell.min[2] || z > cell.max[2]) continue;
    const v = cell.vertices;
    for (const f of cell.faces) {
      for (let k = 1; k + 1 < f.length; k++) {
        const a = v[f[0]], b = v[f[k]], c = v[f[k + 1]];
        const d = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
        if (Math.abs(d) < 1e-9) continue; // a vertical face
        const u = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / d;
        const w = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / d;
        if (u < -1e-6 || w < -1e-6 || u + w > 1 + 1e-6) continue;
        top = Math.max(top, a[1] + u * (b[1] - a[1]) + w * (c[1] - a[1]));
      }
    }
  }
  return Number.isFinite(top) ? top : null;
}

function engineOf(spec: FireSpec): FireModule | null {
  for (const m of spec.armor?.modules ?? []) {
    if (m.module === 'engine' && !m.turretLocal && !m.external && m.min && m.max) return m;
  }
  return null;
}

function measure(spec: FireSpec): HullFireFrame | null {
  const cal = typeof spec.id === 'string' ? combatAnatomyCalibration(spec.id) : null;
  const hull = cal?.hull;
  if (hull && hull.min.length >= 3 && hull.max.length >= 3) {
    const min: V3 = [hull.min[0], hull.min[1], hull.min[2]];
    const max: V3 = [hull.max[0], hull.max[1], hull.max[2]];
    const centre: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const engine = engineOf(spec);
    const anchor = engine ? 'engine' : 'centre';
    const fx = engine ? Math.min(max[0], Math.max(min[0], (engine.min![0] + engine.max![0]) / 2)) : centre[0];
    const fz = engine ? Math.min(max[2], Math.max(min[2], (engine.min![2] + engine.max![2]) / 2)) : centre[2];
    const cells = [...(cal.hullCollision ?? []), ...(cal.hullStructureCollision ?? [])];
    let fireTop = skinTopAt(cells, fx, fz) ?? max[1];
    // the turret's roof, when the turret stands over the point whichever way it faces: its footprint's inscribed reach
    // round its pivot covers it
    const turret = cal.turret, pivot = cal.rig?.turretPivot ?? spec.armor?.turretPivot;
    if (turret && pivot && pivot.length >= 3) {
      const reach = Math.min(-turret.min[0], turret.max[0], -turret.min[2], turret.max[2]);
      if (Math.hypot(fx - pivot[0], fz - pivot[2]) <= reach) fireTop = Math.max(fireTop, pivot[1] + turret.max[1]);
    }
    // the ray's origin: the engine's own middle (a hull on its side burns from its side wall over the engine)
    const fy = engine ? Math.min(fireTop, Math.max(min[1], (engine.min![1] + engine.max![1]) / 2)) : centre[1];
    return { centre, min, max, fire: [fx, fy, fz], fireTop, anchor, source: 'calibration' };
  }
  const h = spec.dims?.heightM;
  if (!(typeof h === 'number' && h > 0)) return null;
  const L = spec.dims?.hullLengthM ?? 6, W = spec.dims?.widthM ?? 3.4;
  const top = HULL_FIRE_DIMS_DECK_K * h;
  return { centre: [0, top / 2, 0], min: [-W / 2, 0, -L / 2], max: [W / 2, top, L / 2], fire: [0, top / 2, 0], fireTop: top,
    anchor: 'centre', source: 'dims' };
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
 * How far (hull-frame metres) the hull's skin lies from the fire's point along `up`, the world's up in the hull frame
 * (unit): the face of the hull's box that ray leaves by, its top the skin over the point (fireTop). Upright, the engine
 * deck; tilted, the same deck met on the slant; on its side, the side wall; upside down, the belly. So the fire comes up
 * out of the hull however it lies.
 */
export function hullFireRise(frame: HullFireFrame, ux: number, uy: number, uz: number): number {
  const c = frame.fire;
  let t = Infinity;
  if (Math.abs(ux) > 1e-6) t = Math.min(t, (ux > 0 ? frame.max[0] - c[0] : c[0] - frame.min[0]) / Math.abs(ux));
  if (Math.abs(uy) > 1e-6) t = Math.min(t, (uy > 0 ? frame.fireTop - c[1] : c[1] - frame.min[1]) / Math.abs(uy));
  if (Math.abs(uz) > 1e-6) t = Math.min(t, (uz > 0 ? frame.max[2] - c[2] : c[2] - frame.min[2]) / Math.abs(uz));
  return Number.isFinite(t) ? t : frame.fireTop - c[1];
}

/** A hull's pose for its centre: its visual root (whole transform), else its state's place and yaw. */
export interface HullCentrePose {
  root?: { matrixWorld?: { elements: ArrayLike<number> }; updateWorldMatrix?(parents: boolean, children: boolean): void } | null;
  pos?: { x: number; y: number; z: number } | null;
  yaw?: number;
}

/**
 * (fire-center-277 follow-up, Main: one source for every hull-anchored effect) A point of the hull's frame in the world,
 * by its root's whole transform (yaw, pitch, roll, a flip, a mode's scale), else its state's place and yaw; written to
 * `out` [x, y, z]. False when the pose resolves to nothing. Allocation-free.
 */
function hullPointWorld(c: V3, pose: HullCentrePose, out: number[]): boolean {
  const root = pose.root;
  if (root?.matrixWorld?.elements && typeof root.updateWorldMatrix === 'function') {
    root.updateWorldMatrix(true, false);
    const e = root.matrixWorld.elements;
    out[0] = e[0] * c[0] + e[4] * c[1] + e[8] * c[2] + e[12];
    out[1] = e[1] * c[0] + e[5] * c[1] + e[9] * c[2] + e[13];
    out[2] = e[2] * c[0] + e[6] * c[1] + e[10] * c[2] + e[14];
    return true;
  }
  const at = pose.pos;
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return false;
  const yaw = typeof pose.yaw === 'number' && Number.isFinite(pose.yaw) ? pose.yaw : 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  out[0] = at.x + cy * c[0] + sy * c[2];
  out[1] = at.y + c[1];
  out[2] = at.z + cy * c[2] - sy * c[0];
  return true;
}

/** The hull's measured centre in the world (a kill, a wreck column); false with no frame or no pose. */
export function hullCentreWorld(spec: FireSpec | null | undefined, pose: HullCentrePose | null | undefined,
  out: number[]): boolean {
  const frame = hullFireFrame(spec);
  return !!frame && !!pose && hullPointWorld(frame.centre, pose, out);
}

/** The fire's point (over the engine, at the box's mid height) in the world; false with no frame or no pose. */
export function hullFireWorld(spec: FireSpec | null | undefined, pose: HullCentrePose | null | undefined,
  out: number[]): boolean {
  const frame = hullFireFrame(spec);
  return !!frame && !!pose && hullPointWorld(frame.fire, pose, out);
}
