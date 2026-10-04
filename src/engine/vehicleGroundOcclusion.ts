/**
 * vehicleGroundOcclusion.ts — 2026-10-03 (the skies-and-atmosphere lane, which the gauntlet's wave 0 handed light,
 * colour and atmosphere: "no ambient occlusion"; "the grass in the tank's shadow ... reads as a hole in the ground").
 *
 * The ground's sky light under and beside the near hulls, inside the aerial pass. Scene-wide GTAO stays off on every
 * tier by the owner's choice (2026-09-28, quality.ts: its speckled crevice wash over terrain and foliage), so this is
 * analytic: no screen-space search, no noise, nothing but the ground around the few hulls the shadow router already
 * selects each frame (nearVehicleShadowDetail.ts: the nearest four within 70 m). The term dims only the pixel's
 * ambient share, as the vehicle cavity term does (vehicleOcclusion.ts): colour · (1 − occ · A / (T + A)), the sun term
 * T and the ambient A the light rig gives the pixel's depth normal (contactShadows.ts) — sunlit ground beside a hull
 * keeps its sun, the ground in the hull's own shadow (T = 0) takes the whole darkening. A grass or leaf card (its
 * alpha is its coverage, no sun state) takes a fixed ambient share in the open and the whole of it under a belly. Vehicle pixels are never receivers (their own
 * cavities are vehicleOcclusion.ts's). The term fades out over the selection's last 20 m.
 *
 * 2026-10-03 (the vehicle-ground lane, wave 13: "a strip of fully-lit snow under the belly makes the vehicle look like it
 * hovers", on the PR head and with this module on alike). Two causes, both measured:
 *  - the multi-bounce term ran Jimenez et al.'s fit (2016) on the MAP's ground albedo. That fit assumes the occluding
 *    cavity has the receiver's albedo; under a hull the occluder is the dark, dirty belly. On snow (ρ 0.8) it kept 0.37
 *    of the sky at the belly's middle and 0.81 at its rear edge, the strip a chase camera sees under the rear plate;
 *  - the old under-belly law saw the sky through two side gaps at a fixed 0.45 m clearance, which the running gear
 *    closes, and stopped at 0.85: 0.3 m inside the rear edge it hid 0.65 of the sky where the hull hides 0.79.
 *
 * Geometry, exactly. Each hull is one convex solid in its own (root) frame, measured once from the built visual: the
 * shadow proxy's width, length and deck over its lower profile — the measured hull-pan floor along the belly, rising
 * linearly under the sloped end plates (a least-squares hinge fitted to the proxy's underside). The share of a
 * receiver's cosine-weighted sky a convex solid hides is its projected solid angle over π, Lambert's edge integral over
 * its silhouette: each edge between a face turned to the receiver and one turned away, counted once. It is exact while
 * the solid stands above the receiver's horizon, so the solid is clipped at the receiver's height (the clip relaxes as
 * the normal tilts toward a wall). The runs are not separate occluders: from beside or beyond a hull every ray through a
 * run goes on into the hull's belly (summing the two hid 0.65 of the sky 0.3 m beside a T-90M's track where the union
 * hides 0.44). They add only the side gaps a receiver between them would see under the hull's edges: the part of each
 * run below the plane through the receiver and that edge, which closes as the receiver nears the run. The receipt pins
 * the law against a brute-force union of the hull and both runs.
 *
 * Interreflection, first order. A blocked direction does not see black: it sees the occluder, whose radiance relative
 * to the sky's is r = ρ_hull · E_face / A_up; the occluder hides (1 − r) of what it covers. The belly sees mostly the
 * shaded ground under itself and, through its openings and the road-wheel gaps, a share of the lit open ground:
 *   r_belly = ρ_hull · ρ_ground · (v · (1 + k) + (1 − v) · u)
 * and a wall sees half sky, half ground (half of it in the hull's own shadow):
 *   r_wall  = ρ_hull · (½ + ½ · ρ_ground · (1 + ½ k))
 * with k = T / A_up of open flat ground (the rig's sun over its sky), v = GROUND_AO_BELLY_VIEW, u = GROUND_AO_UNDER_GROUND.
 * Snow (ρ 0.8, k ≈ 0.65) keeps 0.88 of the belly's occlusion and 0.74 of the walls'; sunny sand (ρ 0.34, k ≈ 6.5)
 * 0.81 and 0.70. The two strengths blend across the footprint's edge (± GROUND_AO_EDGE_M). Photographs of hulls on sand
 * put the belly at about 0.07–0.16 of the sunlit ground in display light (the lane's fp9 note): through the AgX curve the
 * belly's middle here lands at 0.06–0.10. `vehicleGroundOcclusionLocal` is the CPU twin the receipts pin against the GLSL.
 */
import * as THREE from 'three';
import { lightTune } from './lightModelCore.ts';

/** At most this many hulls (the shadow router's near selection: NEAR_VEHICLE_SHADOW_MAX). */
export const GROUND_AO_MAX_HULLS = 4;
/** The selection's range (m) and the fade over its last stretch. */
export const GROUND_AO_RANGE_M = 70;
export const GROUND_AO_FADE_M = 20;
/** A card pixel's assumed ambient share (its sun state is unknown: a meadow half in sun, half in shade). */
export const GROUND_AO_CARD_AMBIENT_SHARE = 0.6;
/** The ground albedo without a grounded light model (atmosphere.ts's default ground). */
export const GROUND_AO_DEFAULT_ALBEDO = 0.25;
/** The hull's own albedo — dusty paint, the belly's grime, the runs' rubber and steel. */
export const GROUND_AO_HULL_ALBEDO = 0.25;
/** The share of the belly's view that is lit open ground: the openings fore and aft between the runs, the road-wheel gaps. */
export const GROUND_AO_BELLY_VIEW = 0.3;
/** The shaded ground under the belly (the rest of its view) relative to open ground. */
export const GROUND_AO_UNDER_GROUND = 0.15;
/** A hull's reach fades out between these multiples of its height (deck over the contact plane) from its footprint. */
export const GROUND_AO_REACH = Object.freeze([1.5, 3] as const);
/** The belly's and the walls' strengths blend across the footprint's edge over ± this (m). */
export const GROUND_AO_EDGE_M = 0.25;
/** The receiver's horizon clip drops this far (m) per unit of normal tilt: a wall facing a hull keeps the whole solid. */
export const GROUND_AO_CLIP_SLACK_M = 4;
/**
 * A pixel within this far (m) of the hull's footprint and over its belly is the hull itself — a marking decal or glass
 * blended over it, whose alpha no longer carries the vehicle tag (vehicleOcclusion.ts) — and is never a receiver.
 */
export const GROUND_AO_HULL_SKIN_M = 0.12;
/**
 * The track shoes are the vehicle too, but their cloned material never joins the cascade setup, so it writes no vehicle
 * tag: a pixel in the shoes' measured lane (widened by GROUND_AO_LANE_MARGIN_M for their faces), over the floor and under
 * the deck is skipped where it is a shoe — along the shoes' ground run (± GROUND_AO_CONTACT_MARGIN_M) and, past it, on the
 * wraps once it stands GROUND_AO_WRAP_LIFT_M over the ground (the ground under a rising wrap stays a receiver). Under the
 * floor (GROUND_AO_SHOE_FLOOR_M over the contact plane) a lane pixel is ground: under the ground run the shoes cover it
 * (seen through their gaps and at their foot, the track's contact line) and it keeps no sky; past the run it takes its
 * sky back over GROUND_AO_TRACK_LIFTOFF_M as the track lifts off.
 */
const GROUND_AO_CONTACT_MARGIN_M = 0.03;
const GROUND_AO_WRAP_LIFT_M = 0.05;
const GROUND_AO_SHOE_FLOOR_M = 0.04;
const GROUND_AO_LANE_MARGIN_M = 0.02;
const GROUND_AO_TRACK_LIFTOFF_M = 0.3;
/** The wraps reach this far (m) past the shoes' measured ends. */
const GROUND_AO_RUN_END_M = 0.04;
/**
 * Past the ground run (where the lane beyond a run's inner face is ground, under the wrap's ramp, which the solid does
 * not carry) the side-gap closure fades in over this far (m) from that face, so the two sides meet without a step.
 */
export const GROUND_AO_GAP_FADE_M = 0.1;
/** A shoe on the ground run stands within this (m) of the lowest shoe. */
const GROUND_AO_SHOE_GROUND_M = 0.025;
/** The proxy's underside is sampled at this many points along its length (each at three points across the belly). */
const GROUND_AO_PROFILE_SAMPLES = 48;
/** Fallbacks for a hull without measured contact geometry or shoes: the belly's clearance and a run's width (m). */
const GROUND_AO_CLEARANCE_M = 0.45;
const GROUND_AO_TRACK_WIDTH_M = 0.6;

export interface Vec3Like { x: number; y: number; z: number; }

/** A hull's solid and its runs in its root frame (metres). */
interface VehicleGroundHull {
  /**
   * The hull: |x| ≤ hx, fz0 ≤ z ≤ fz1, from its lower profile up to the deck yt. The profile: the belly yb along
   * pz0..pz1, rising hr per metre behind pz0 and hf per metre ahead of pz1 (the sloped end plates).
   */
  readonly hx: number; readonly yb: number; readonly yt: number; readonly fz0: number; readonly fz1: number;
  readonly pz0: number; readonly pz1: number; readonly hr: number; readonly hf: number;
  /** The contact plane y0 and the runs: the shoes' lane xi ≤ |x| ≤ xo along tz0..tz1, their ground run cz0..cz1. */
  readonly y0: number; readonly xi: number; readonly xo: number;
  readonly tz0: number; readonly tz1: number; readonly cz0: number; readonly cz1: number;
}

interface VehicleGroundStrengths { readonly belly: number; readonly wall: number; }

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const INV_2PI = 1 / (2 * Math.PI);

/** One silhouette edge of Lambert's edge integral: the angle it subtends times the normal's share of its plane (a and b
 * are the edge's ends relative to the receiver; their lengths cancel). */
function edgeTerm(a: readonly number[], b: readonly number[], n: Vec3Like): number {
  const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  const s = Math.hypot(cx, cy, cz);
  return s > 1e-9 ? Math.atan2(s, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * (n.x * cx + n.y * cy + n.z * cz) / s : 0;
}

/** Quilez's silhouette hexagon: the corner pattern of each vertex (times the corner nearest the receiver). */
const HEXAGON: readonly (readonly [number | 'x' | 'y' | 'z', number | 'x' | 'y' | 'z', number | 'x' | 'y' | 'z'])[] = [
  [1, 1, -1], [1, 'x', 'x'], [1, -1, 1], ['z', 'z', 1], [-1, 1, 1], ['y', 1, 'y'],
];

/**
 * The share of a receiver's cosine-weighted sky a box hides (its projected solid angle over π): the receiver at q
 * relative to the box's centre with unit normal n, r the box's half extents. Lambert's edge integral over the box's
 * silhouette hexagon, signed by the octant's mirror parity and clamped to [0, 1] — exact while the box stands above the
 * receiver's horizon.
 */
export function boxSkyOcclusion(q: Vec3Like, n: Vec3Like, r: Vec3Like): number {
  const sx = q.x >= 0 ? 1 : -1, sy = q.y >= 0 ? 1 : -1, sz = q.z >= 0 ? 1 : -1;
  const inside = { x: r.x >= Math.abs(q.x) ? 1 : -1, y: r.y >= Math.abs(q.y) ? 1 : -1, z: r.z >= Math.abs(q.z) ? 1 : -1 };
  const f = [r.x * sx, r.y * sy, r.z * sz];
  const at = (k: number | 'x' | 'y' | 'z'): number => (typeof k === 'number' ? k : inside[k]);
  const verts = HEXAGON.map((p) => [at(p[0]) * f[0] - q.x, at(p[1]) * f[1] - q.y, at(p[2]) * f[2] - q.z]);
  let k = 0;
  for (let i = 0; i < 6; i++) k += edgeTerm(verts[i], verts[(i + 1) % 6], n);
  return clamp01(k * sx * sy * sz * INV_2PI);
}

/**
 * The hull solid's 12 corners — per side (R: +x, L: −x) the deck's rear and front (T0, T1), the front end's foot (E1),
 * the belly's front and rear ends (P1, P0), the rear end's foot (E0) — and its 18 edges, each counter-clockwise for its
 * first face seen from outside, the second face beyond it. An edge is on the silhouette when exactly one of its faces is
 * turned to the receiver; the GLSL is generated from this table.
 */
type HullCorner = 'T0R' | 'T1R' | 'E1R' | 'P1R' | 'P0R' | 'E0R' | 'T0L' | 'T1L' | 'E1L' | 'P1L' | 'P0L' | 'E0L';
type HullFace = 'Top' | 'Bot' | 'Rend' | 'Fend' | 'Right' | 'Left' | 'Rpl' | 'Fpl';
const HULL_EDGES: readonly (readonly [HullCorner, HullCorner, HullFace, HullFace])[] = [
  ['T0R', 'T0L', 'Top', 'Rend'], ['T0L', 'T1L', 'Top', 'Left'], ['T1L', 'T1R', 'Top', 'Fend'], ['T1R', 'T0R', 'Top', 'Right'],
  ['P0L', 'P0R', 'Bot', 'Rpl'], ['P0R', 'P1R', 'Bot', 'Right'], ['P1R', 'P1L', 'Bot', 'Fpl'], ['P1L', 'P0L', 'Bot', 'Left'],
  ['E0L', 'E0R', 'Rpl', 'Rend'], ['E0R', 'P0R', 'Rpl', 'Right'], ['P0L', 'E0L', 'Rpl', 'Left'],
  ['P1R', 'E1R', 'Fpl', 'Right'], ['E1R', 'E1L', 'Fpl', 'Fend'], ['E1L', 'P1L', 'Fpl', 'Left'],
  ['T0R', 'E0R', 'Rend', 'Right'], ['E0L', 'T0L', 'Rend', 'Left'], ['T1L', 'E1L', 'Fend', 'Left'], ['E1R', 'T1R', 'Fend', 'Right'],
];

/** The hull's lower profile at z (clamped to its length): the belly, risen under the sloped end plates. */
export function hullBottomAt(z: number, h: VehicleGroundHull): number {
  const zc = Math.min(h.fz1, Math.max(h.fz0, z));
  return Math.min(h.yt, h.yb + Math.max(0, h.hr * (h.pz0 - zc), h.hf * (zc - h.pz1)));
}

/**
 * The share of a receiver's cosine-weighted sky the hull solid hides: the receiver at q (root frame) with unit normal
 * n, the solid clipped at height c (its horizon). Lambert's edge integral over the silhouette edges of HULL_EDGES.
 */
export function hullSkyOcclusion(q: Vec3Like, n: Vec3Like, h: VehicleGroundHull, c: number): number {
  const yb = Math.max(h.yb, c);
  if (yb >= h.yt) return 0;
  const lift = Math.max(c - h.yb, 0);
  const p0 = h.hr > 0 ? Math.max(h.fz0, h.pz0 - lift / Math.max(h.hr, 1e-6)) : h.pz0;
  const p1 = h.hf > 0 ? Math.min(h.fz1, h.pz1 + lift / Math.max(h.hf, 1e-6)) : h.pz1;
  const yr = Math.min(h.yt, Math.max(yb, h.yb + h.hr * (h.pz0 - h.fz0)));
  const yf = Math.min(h.yt, Math.max(yb, h.yb + h.hf * (h.fz1 - h.pz1)));
  const v = (x: number, y: number, z: number): number[] => [x - q.x, y - q.y, z - q.z];
  const corner: Record<HullCorner, number[]> = {
    T0R: v(h.hx, h.yt, h.fz0), T1R: v(h.hx, h.yt, h.fz1), E1R: v(h.hx, yf, h.fz1), P1R: v(h.hx, yb, p1), P0R: v(h.hx, yb, p0), E0R: v(h.hx, yr, h.fz0),
    T0L: v(-h.hx, h.yt, h.fz0), T1L: v(-h.hx, h.yt, h.fz1), E1L: v(-h.hx, yf, h.fz1), P1L: v(-h.hx, yb, p1), P0L: v(-h.hx, yb, p0), E0L: v(-h.hx, yr, h.fz0),
  };
  const facing: Record<HullFace, number> = {
    Top: q.y > h.yt ? 1 : 0, Bot: q.y < yb ? 1 : 0, Rend: q.z < h.fz0 ? 1 : 0, Fend: q.z > h.fz1 ? 1 : 0,
    Right: q.x > h.hx ? 1 : 0, Left: q.x < -h.hx ? 1 : 0,
    Rpl: -(p0 - h.fz0) * (q.y - yr) - (yr - yb) * (q.z - h.fz0) > 0 ? 1 : 0,
    Fpl: -(h.fz1 - p1) * (q.y - yf) + (yf - yb) * (q.z - h.fz1) > 0 ? 1 : 0,
  };
  let k = 0;
  for (const [u, w, fa, fb] of HULL_EDGES) {
    if (facing[fa] !== facing[fb]) k += (facing[fa] - facing[fb]) * edgeTerm(corner[u], corner[w], n);
  }
  return clamp01(-k * INV_2PI);
}

/**
 * What a blocked direction keeps of its darkening: one minus the occluder's radiance relative to the sky's
 * (first-order interreflection), for the belly enclosure and for the walls, from the ground's albedo and the rig's
 * sun-to-sky ratio k of open flat ground. The hull's albedo and the belly's view are the knobs the capture may tune.
 */
export function vehicleGroundStrengths(
  groundAlbedo: number, sunToSky: number, hullAlbedo = GROUND_AO_HULL_ALBEDO, bellyView = GROUND_AO_BELLY_VIEW,
  underGround = GROUND_AO_UNDER_GROUND,
): VehicleGroundStrengths {
  const rho = Math.min(Math.max(groundAlbedo, 0), 0.95), k = Math.max(sunToSky, 0);
  return {
    belly: clamp01(1 - hullAlbedo * rho * (bellyView * (1 + k) + (1 - bellyView) * underGround)),
    wall: clamp01(1 - hullAlbedo * (0.5 + 0.5 * rho * (1 + 0.5 * k))),
  };
}

/** A pixel that is one of the hull's own track shoes (their material carries no vehicle tag): see GROUND_AO_CONTACT_MARGIN_M. */
export function isRunShoe(q: Vec3Like, h: VehicleGroundHull): boolean {
  if (Math.abs(Math.abs(q.x) - 0.5 * (h.xi + h.xo)) >= 0.5 * (h.xo - h.xi) + GROUND_AO_LANE_MARGIN_M
    || q.y < h.y0 + GROUND_AO_SHOE_FLOOR_M || q.y >= h.yt + GROUND_AO_RUN_END_M) return false;
  if (q.z > h.cz0 - GROUND_AO_CONTACT_MARGIN_M && q.z < h.cz1 + GROUND_AO_CONTACT_MARGIN_M) return true;
  return q.z > h.tz0 - GROUND_AO_RUN_END_M && q.z < h.tz1 + GROUND_AO_RUN_END_M && q.y > h.y0 + GROUND_AO_WRAP_LIFT_M;
}

/** The ground under a track's ground run (the shoes cover it): 1 in the lane along the run, back to 0 past it as the
 * track lifts off. */
export function underTrackOcclusion(q: Vec3Like, h: VehicleGroundHull): number {
  const lane = smoothstep(-0.005, 0.005, 0.5 * (h.xo - h.xi) - Math.abs(Math.abs(q.x) - 0.5 * (h.xi + h.xo)));
  return lane * (1 - smoothstep(0, GROUND_AO_TRACK_LIFTOFF_M, Math.max(h.cz0 - q.z, q.z - h.cz1, 0)));
}

/**
 * The side gaps a receiver between the runs sees under the hull's edges, closed by the runs where they stand on the
 * ground (their ground run): per run, the part of it below the plane through the receiver and the hull's edge beyond it
 * (the rest of the run hides only sky the hull already hides). Zero outside the runs' inner faces; past the ground run
 * faded in over GROUND_AO_GAP_FADE_M from them.
 */
export function runGapOcclusion(q: Vec3Like, n: Vec3Like, h: VehicleGroundHull, c: number): number {
  if (Math.abs(q.x) >= h.xi) return 0;
  const belly = hullBottomAt(q.z, h), lo = Math.max(h.y0, c);
  const wrap = smoothstep(-0.04, 0, Math.max(h.cz0 - q.z, q.z - h.cz1) - GROUND_AO_CONTACT_MARGIN_M);
  const fade = 1 + (smoothstep(0, GROUND_AO_GAP_FADE_M, h.xi - Math.abs(q.x)) - 1) * wrap;
  let occ = 0;
  for (const side of [1, -1]) {
    const top = q.y + (belly - q.y) * (h.xi - side * q.x) / (h.hx - side * q.x);
    if (top <= lo) continue;
    occ += boxSkyOcclusion({ x: q.x - side * 0.5 * (h.xi + h.xo), y: q.y - 0.5 * (lo + top), z: q.z - 0.5 * (h.cz0 + h.cz1) }, n,
      { x: 0.5 * (h.xo - h.xi), y: 0.5 * (top - lo), z: 0.5 * (h.cz1 - h.cz0) });
  }
  return occ * fade;
}

/**
 * The CPU twin of the GLSL: the occlusion one hull casts on a receiver at q (root frame) with unit normal n (root
 * frame) — its solid and the side gaps its runs close, clipped at the receiver's horizon, faded over its reach, the
 * ground its tracks cover, and the belly's or the walls' strength by the receiver's place across the footprint's edge.
 */
export function vehicleGroundOcclusionLocal(
  q: Vec3Like, n: Vec3Like, h: VehicleGroundHull, strengths: VehicleGroundStrengths,
): number {
  const H = h.yt - h.y0;
  const dx = Math.abs(q.x) - h.hx, dz = Math.abs(q.z - 0.5 * (h.fz0 + h.fz1)) - 0.5 * (h.fz1 - h.fz0);
  const dOut = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  if (dOut > H * GROUND_AO_REACH[1] || q.y > h.yt || q.y < h.y0 - H * GROUND_AO_REACH[1]) return 0;
  if (q.y > h.yb + 0.02 && dOut < GROUND_AO_HULL_SKIN_M) return 0;
  if (isRunShoe(q, h)) return 0;
  const c = q.y - GROUND_AO_CLIP_SLACK_M * (1 - n.y);
  const reach = 1 - smoothstep(H * GROUND_AO_REACH[0], H * GROUND_AO_REACH[1], dOut);
  const occ = Math.max(reach * (hullSkyOcclusion(q, n, h, c) + runGapOcclusion(q, n, h, c)), underTrackOcclusion(q, h));
  const sd = dOut + Math.min(Math.max(dx, dz), 0);
  const s = strengths.wall + (strengths.belly - strengths.wall) * (1 - smoothstep(-GROUND_AO_EDGE_M, GROUND_AO_EDGE_M, sd));
  return Math.min(occ, 1) * s;
}

/** Several hulls hide the sky as independent occluders; the selection's range fade on the result. */
export function combineVehicleGroundOcclusion(perHull: readonly number[], distance: number): number {
  let vis = 1;
  for (const occ of perHull) vis *= 1 - clamp01(occ);
  return (1 - vis) * (1 - smoothstep(GROUND_AO_RANGE_M - GROUND_AO_FADE_M, GROUND_AO_RANGE_M, distance));
}

export interface VehicleGroundOcclusionUniforms {
  /** The hulls written this frame (0: the block is skipped). */
  uVehGround: THREE.IUniform<number>;
  /** Per hull, three rows: world → root frame (local axis i = dot(row.xyz, P) + row.w; the root's scale included). */
  uVehGroundM: THREE.IUniform<THREE.Vector4[]>;
  /** Per hull, four vec4: (hx, yb, yt, y0), (fz0, fz1, pz0, pz1), (hr, hf, xi, xo), (tz0, tz1, cz0, cz1) — the root frame. */
  uVehGroundB: THREE.IUniform<THREE.Vector4[]>;
  /** The interreflection's inputs: the ground's albedo, the hull's, the belly's view of open ground, the shaded ground. */
  uVehGroundLight: THREE.IUniform<THREE.Vector4>;
}

export function createVehicleGroundOcclusionUniforms(): VehicleGroundOcclusionUniforms {
  const rows = (n: number) => Array.from({ length: GROUND_AO_MAX_HULLS * n }, () => new THREE.Vector4());
  return {
    uVehGround: { value: 0 },
    uVehGroundM: { value: rows(3) },
    uVehGroundB: { value: rows(4) },
    uVehGroundLight: { value: new THREE.Vector4(GROUND_AO_DEFAULT_ALBEDO, GROUND_AO_HULL_ALBEDO, GROUND_AO_BELLY_VIEW, GROUND_AO_UNDER_GROUND) },
  };
}

/** The hull proxy of a vehicle root (its shadow detail record's first proxy: procShadow_hull). */
export function hullProxyOf(root: THREE.Object3D, detailKey = 'nearShadowDetail'): THREE.Mesh | null {
  const cached = root.userData.groundAoHull as THREE.Mesh | null | undefined;
  if (cached !== undefined) return cached;
  const detail = root.userData[detailKey] as { proxies?: readonly THREE.Object3D[] } | undefined;
  const hull = detail?.proxies?.find((p) => p.name === 'procShadow_hull') as THREE.Mesh | undefined;
  const source = hull?.geometry ? hull : null;
  if (source && !source.geometry.boundingBox) source.geometry.computeBoundingBox();
  root.userData.groundAoHull = source;
  return source;
}

const _rel = new THREE.Matrix4(), _part = new THREE.Matrix4(), _bounds = new THREE.Box3(), _vertex = new THREE.Vector3();
const _shoe = new THREE.Matrix4(), _shoeFrame = new THREE.Matrix4();

/** An object's matrix in its root's frame, from the local poses up the chain (never a stale world matrix). */
function rootFrameMatrix(object: THREE.Object3D, root: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 | null {
  out.identity();
  let node: THREE.Object3D | null = object;
  for (; node && node !== root; node = node.parent) {
    out.premultiply(node.matrixAutoUpdate ? _part.compose(node.position, node.quaternion, node.scale) : node.matrix);
  }
  return node === root ? out : null;
}

/** An object's bounds in its root's frame. */
function rootFrameBounds(object: THREE.Object3D, root: THREE.Object3D, geometry: THREE.BufferGeometry, out: THREE.Box3): THREE.Box3 | null {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingBox || geometry.boundingBox.isEmpty() || !rootFrameMatrix(object, root, _rel)) return null;
  return out.copy(geometry.boundingBox).applyMatrix4(_rel);
}

/**
 * The proxy's underside along its length: at each z sample the lowest point of its surface over the vertical lines at
 * the given x (through its triangles, root frame); Infinity where no line meets it.
 */
function lowerProfile(proxy: THREE.Mesh, root: THREE.Object3D, xs: readonly number[], zs: readonly number[]): number[] {
  const geometry = proxy.geometry, position = geometry.getAttribute('position'), index = geometry.getIndex();
  const out = zs.map(() => Infinity);
  if (!position || !rootFrameMatrix(proxy, root, _rel)) return out;
  const p = new Float64Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    _vertex.fromBufferAttribute(position, i).applyMatrix4(_rel);
    p[i * 3] = _vertex.x; p[i * 3 + 1] = _vertex.y; p[i * 3 + 2] = _vertex.z;
  }
  const count = index ? index.count : position.count;
  for (let t = 0; t + 2 < count; t += 3) {
    const a = (index ? index.getX(t) : t) * 3, b = (index ? index.getX(t + 1) : t + 1) * 3, c = (index ? index.getX(t + 2) : t + 2) * 3;
    const ux = p[b] - p[a], uz = p[b + 2] - p[a + 2], wx = p[c] - p[a], wz = p[c + 2] - p[a + 2];
    const det = ux * wz - wx * uz;
    if (Math.abs(det) < 1e-12) continue; // seen edge-on from below
    for (let k = 0; k < zs.length; k++) {
      for (const x of xs) {
        const rx = x - p[a], rz = zs[k] - p[a + 2];
        const s = (rx * wz - wx * rz) / det, r = (ux * rz - rx * uz) / det;
        if (s < -1e-9 || r < -1e-9 || s + r > 1 + 1e-9) continue;
        const y = p[a + 1] + s * (p[b + 1] - p[a + 1]) + r * (p[c + 1] - p[a + 1]);
        if (y < out[k]) out[k] = y;
      }
    }
  }
  return out;
}

/**
 * The least-squares hinge from the profile's lowest sample outward: the knee (where the plate leaves the belly) and the
 * plate's rise per metre, over the samples from the lowest to the end (dir −1: rearward, +1: forward).
 */
function fitHinge(zs: readonly number[], ys: readonly number[], low: number, from: number, dir: 1 | -1): { knee: number; slope: number } {
  const span: number[] = [];
  for (let i = from; i >= 0 && i < zs.length; i += dir) if (Number.isFinite(ys[i])) span.push(i);
  let best = { knee: zs[from], slope: 0, sse: Infinity };
  for (const k of span) {
    let st = 0, tt = 0, sse = 0;
    for (const i of span) { const t = Math.max(0, dir * (zs[i] - zs[k])); st += (ys[i] - low) * t; tt += t * t; }
    const slope = tt > 0 ? Math.max(0, st / tt) : 0;
    for (const i of span) { const e = ys[i] - low - slope * Math.max(0, dir * (zs[i] - zs[k])); sse += e * e; }
    if (sse < best.sse - 1e-12) best = { knee: zs[k], slope, sse };
  }
  return { knee: best.knee, slope: best.slope };
}

interface ContactGeometryLike {
  bottomYM?: number | null; panYM?: number | null; halfWidM?: number | null; halfLenM?: number | null; zCenterM?: number | null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A hull's solid and runs, measured once from the built visual and cached on the root: the contact plane and the belly
 * from the movement contact geometry (tankFactoryCore.ts / restPoseContact.ts), the solid's width, length, deck and
 * lower profile from its shadow proxy, the runs' lane, length and ground run from the track shoes (the bands, then the
 * contact geometry without them). Null without a proxy.
 */
export function measureVehicleGroundHull(root: THREE.Object3D): VehicleGroundHull | null {
  // a showroom hero has no contact geometry until it is lent to a battle (prepareForSimulation): measure again then
  const cg = (root.userData.contactGeom as ContactGeometryLike | null | undefined) ?? null;
  const cached = root.userData.groundAoShape as VehicleGroundHull | null | undefined;
  if (cached !== undefined && root.userData.groundAoShapeFor === cg) return cached;
  let shape: VehicleGroundHull | null = null;
  const proxy = hullProxyOf(root);
  const hull = proxy ? rootFrameBounds(proxy, root, proxy.geometry, new THREE.Box3()) : null;
  if (proxy && hull) {
    let bandXi = Infinity, bandXo = 0, bandZ0 = Infinity, bandZ1 = -Infinity, bands = 0;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || (mesh.name !== 'gearTrackBandL' && mesh.name !== 'gearTrackBandR')) return;
      const b = rootFrameBounds(mesh, root, mesh.geometry, _bounds);
      if (!b) return;
      bandXi = Math.min(bandXi, b.min.x > 0 ? b.min.x : b.max.x < 0 ? -b.max.x : 0);
      bandXo = Math.max(bandXo, Math.abs(b.min.x), Math.abs(b.max.x));
      bandZ0 = Math.min(bandZ0, b.min.z); bandZ1 = Math.max(bandZ1, b.max.z);
      bands++;
    });
    // the shoes themselves (their instanced stream): the lane the exclusion of the untagged shoes must not overreach,
    // their length, and their ground run (the shoes within GROUND_AO_SHOE_GROUND_M of the lowest)
    const shoes: { x0: number; x1: number; y: number; z0: number; z1: number }[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh || mesh.name !== 'gearTrackPads' || !rootFrameMatrix(mesh, root, _shoeFrame)) return;
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, _shoe);
        const e = _shoe.elements;
        if (Math.abs(e[0]) + Math.abs(e[5]) + Math.abs(e[10]) < 1e-5) continue; // a collapsed (hidden) shoe
        const b = _bounds.copy(geometry.boundingBox).applyMatrix4(_shoe.premultiply(_shoeFrame));
        if (b.min.x > 0) shoes.push({ x0: b.min.x, x1: b.max.x, y: b.min.y, z0: b.min.z, z1: b.max.z });
        else if (b.max.x < 0) shoes.push({ x0: -b.max.x, x1: -b.min.x, y: b.min.y, z0: b.min.z, z1: b.max.z });
      }
    });
    let shoeXi = Infinity, shoeXo = 0, shoeZ0 = Infinity, shoeZ1 = -Infinity, shoeLow = Infinity;
    for (const s of shoes) {
      shoeXi = Math.min(shoeXi, s.x0); shoeXo = Math.max(shoeXo, s.x1);
      shoeZ0 = Math.min(shoeZ0, s.z0); shoeZ1 = Math.max(shoeZ1, s.z1); shoeLow = Math.min(shoeLow, s.y);
    }
    let runZ0 = Infinity, runZ1 = -Infinity;
    const runFeet: number[] = [];
    for (const s of shoes) {
      if (s.y > shoeLow + GROUND_AO_SHOE_GROUND_M) continue;
      runZ0 = Math.min(runZ0, s.z0); runZ1 = Math.max(runZ1, s.z1); runFeet.push(s.y);
    }
    runFeet.sort((a, b) => a - b);
    const haveShoes = shoes.length > 0 && shoeXo > 0.5 && shoeXi > 0.2 && shoeXi < shoeXo - 0.1 && runZ1 > runZ0;

    // the contact plane: the ground run's shoes themselves (their median foot) — the published contact geometry of a
    // battle visual can sit far below its tracks (2026-10-03: bottomYM −0.12 and panYM −0.30 on the battle Abrams, 0 and
    // 0.355 built here) — then the published plane, then a clearance under the proxy
    const y0 = haveShoes ? runFeet[runFeet.length >> 1] : finite(cg?.bottomYM) ? cg.bottomYM : hull.min.y - GROUND_AO_CLEARANCE_M;
    const xo = haveShoes ? shoeXo
      : finite(cg?.halfWidM) && cg.halfWidM > 0.5 ? cg.halfWidM : bands ? bandXo : Math.max(Math.abs(hull.min.x), hull.max.x);
    const xi = haveShoes ? shoeXi
      : bands && bandXi > 0.2 && bandXi < xo - 0.1 ? bandXi : Math.max(0.2, xo - GROUND_AO_TRACK_WIDTH_M);
    const zc = finite(cg?.zCenterM) ? cg.zCenterM : 0.5 * (hull.min.z + hull.max.z);
    const hl = finite(cg?.halfLenM) ? cg.halfLenM : 0.35 * (hull.max.z - hull.min.z);
    const tz0 = haveShoes ? shoeZ0 : bands ? bandZ0 : zc - hl - 0.5, tz1 = haveShoes ? shoeZ1 : bands ? bandZ1 : zc + hl + 0.5;
    const cz0 = haveShoes ? runZ0 : Math.max(tz0, zc - hl), cz1 = haveShoes ? runZ1 : Math.min(tz1, zc + hl);

    // the lower profile: the proxy's underside between the runs, its lowest point set on the measured pan, a hinge each way
    const fz0 = hull.min.z, fz1 = hull.max.z, yt = hull.max.y;
    const zs = Array.from({ length: GROUND_AO_PROFILE_SAMPLES }, (_, i) => fz0 + 0.02 + (i / (GROUND_AO_PROFILE_SAMPLES - 1)) * (fz1 - fz0 - 0.04));
    const ys = lowerProfile(proxy, root, [0, 0.5 * xi, -0.5 * xi], zs);
    let low = Infinity, lowAt = -1;
    for (let i = 0; i < ys.length; i++) if (ys[i] < low) { low = ys[i]; lowAt = i; }
    // the belly: the measured hull-pan floor where it stands over the contact plane, else the proxy's lowest underside
    const pan = finite(cg?.panYM) && cg.panYM > y0 + 0.05 ? cg.panYM : Number.isFinite(low) ? low : hull.min.y;
    const yb = Math.max(pan, y0 + 0.1);
    let pz0 = fz0, pz1 = fz1, hr = 0, hf = 0;
    if (lowAt >= 0) {
      // (a flat end keeps the belly to the hull's end)
      const rear = fitHinge(zs, ys, low, lowAt, -1), front = fitHinge(zs, ys, low, lowAt, 1);
      if (rear.slope > 1e-4) { pz0 = rear.knee; hr = rear.slope; }
      if (front.slope > 1e-4) { pz1 = front.knee; hf = front.slope; }
    }
    const candidate: VehicleGroundHull = {
      hx: Math.max(Math.abs(hull.min.x), Math.abs(hull.max.x), xo), yb, yt, fz0, fz1, pz0, pz1, hr, hf,
      y0, xi, xo, tz0, tz1, cz0, cz1,
    };
    const valid = candidate.yt > candidate.yb + 0.2 && candidate.yb > candidate.y0 && candidate.xo > candidate.xi
      && candidate.fz1 > candidate.fz0 + 1 && candidate.pz1 >= candidate.pz0 && candidate.tz1 > candidate.tz0
      && candidate.cz1 > candidate.cz0 && Object.values(candidate).every(finite);
    shape = valid ? Object.freeze(candidate) : null;
  }
  root.userData.groundAoShape = shape;
  root.userData.groundAoShapeFor = cg;
  return shape;
}

const _world = new THREE.Matrix4(), _inv = new THREE.Matrix4();

/**
 * Per frame (post.ts): the solids of the near hulls the shadow router selected (lighting.ts publishes the selection on
 * scene.userData.nearVehicles). Each hull's frame comes from its root's own pose this frame — the renderer refreshes
 * world matrices only inside the render, a frame after a moving hull. No allocation: every uniform is written in place.
 */
export function updateVehicleGroundOcclusionUniforms(
  u: VehicleGroundOcclusionUniforms, roots: readonly { readonly root: THREE.Object3D }[] | null | undefined, enabled: boolean,
  // (QA: __LIGHT_TUNE.GROUND_AO_HULL_ALBEDO / GROUND_AO_BELLY_VIEW tune the interreflection without a rebuild)
  groundAlbedo = GROUND_AO_DEFAULT_ALBEDO, hullAlbedo = lightTune('GROUND_AO_HULL_ALBEDO', GROUND_AO_HULL_ALBEDO),
  bellyView = lightTune('GROUND_AO_BELLY_VIEW', GROUND_AO_BELLY_VIEW),
): void {
  u.uVehGroundLight.value.set(Math.min(Math.max(groundAlbedo, 0), 0.95), clamp01(hullAlbedo), clamp01(bellyView), GROUND_AO_UNDER_GROUND);
  let n = 0;
  if (enabled && roots) {
    for (let i = 0; i < roots.length && n < GROUND_AO_MAX_HULLS; i++) {
      const root = roots[i].root;
      if (!root.visible) continue;
      const h = measureVehicleGroundHull(root);
      if (!h) continue;
      _world.compose(root.position, root.quaternion, root.scale);
      if (root.parent) _world.premultiply(root.parent.matrixWorld);
      const e = _inv.copy(_world).invert().elements;
      u.uVehGroundM.value[n * 3].set(e[0], e[4], e[8], e[12]);
      u.uVehGroundM.value[n * 3 + 1].set(e[1], e[5], e[9], e[13]);
      u.uVehGroundM.value[n * 3 + 2].set(e[2], e[6], e[10], e[14]);
      u.uVehGroundB.value[n * 4].set(h.hx, h.yb, h.yt, h.y0);
      u.uVehGroundB.value[n * 4 + 1].set(h.fz0, h.fz1, h.pz0, h.pz1);
      u.uVehGroundB.value[n * 4 + 2].set(h.hr, h.hf, h.xi, h.xo);
      u.uVehGroundB.value[n * 4 + 3].set(h.tz0, h.tz1, h.cz0, h.cz1);
      n++;
    }
  }
  u.uVehGround.value = n;
}

const f = (x: number): string => x.toFixed(4);
/** The hull's corners in the GLSL (b0 = (hx, yb, yt, y0), b1 = (fz0, fz1, pz0, pz1); yb, p0, p1, yr, yf clipped). */
const GLSL_CORNER: Record<HullCorner, string> = {
  T0R: 'vec3( b0.x, b0.z, b1.x )', T1R: 'vec3( b0.x, b0.z, b1.y )', E1R: 'vec3( b0.x, yf, b1.y )',
  P1R: 'vec3( b0.x, yb, p1 )', P0R: 'vec3( b0.x, yb, p0 )', E0R: 'vec3( b0.x, yr, b1.x )',
  T0L: 'vec3( -b0.x, b0.z, b1.x )', T1L: 'vec3( -b0.x, b0.z, b1.y )', E1L: 'vec3( -b0.x, yf, b1.y )',
  P1L: 'vec3( -b0.x, yb, p1 )', P0L: 'vec3( -b0.x, yb, p0 )', E0L: 'vec3( -b0.x, yr, b1.x )',
};
const GLSL_HULL_EDGES = HULL_EDGES.map(([u, w, fa, fb]) =>
  `      if ( f${fa} != f${fb} ) k += ( f${fa} - f${fb} ) * cotVgEdge( ${u}, ${w}, n );`).join('\n');

/**
 * The block the aerial fragment includes AFTER `CONTACT_SHADOW_GLSL` (it uses that block's cotSunVisOf, cotNormalAt
 * and rig uniforms, and the pass's uSunDir): `cotVehicleGroundShade(uv, P, alpha, dist)` → the multiplier for a ground
 * pixel's colour (1 = untouched).
 */
export const VEHICLE_GROUND_OCCLUSION_GLSL = /* glsl */ `
    // 2026-10-03: the ground's sky under and beside the near hulls (vehicleGroundOcclusion.ts)
    uniform float uVehGround;
    uniform vec4 uVehGroundM[ ${GROUND_AO_MAX_HULLS * 3} ];
    uniform vec4 uVehGroundB[ ${GROUND_AO_MAX_HULLS * 4} ];
    uniform vec4 uVehGroundLight;
    // one silhouette edge of Lambert's projected solid angle (a, b relative to the receiver; their lengths cancel)
    float cotVgEdge( vec3 a, vec3 b, vec3 n ) {
      vec3 c = cross( a, b );
      float s = length( c );
      return s > 1e-9 ? atan( s, dot( a, b ) ) * dot( n, c ) / s : 0.0;
    }
    // the share of the cosine-weighted sky a box (half extents r) hides from q (relative to its centre), normal n:
    // Quilez's silhouette hexagon, signed by the octant's mirror parity
    float cotVgBox( vec3 q, vec3 n, vec3 r ) {
      vec3 sg = step( 0.0, q ) * 2.0 - 1.0;
      vec3 fq = r * sg;
      vec3 si = step( abs( q ), r ) * 2.0 - 1.0;
      vec3 v0 = vec3( 1.0, 1.0, -1.0 ) * fq - q;
      vec3 v1 = vec3( 1.0, si.x, si.x ) * fq - q;
      vec3 v2 = vec3( 1.0, -1.0, 1.0 ) * fq - q;
      vec3 v3 = vec3( si.z, si.z, 1.0 ) * fq - q;
      vec3 v4 = vec3( -1.0, 1.0, 1.0 ) * fq - q;
      vec3 v5 = vec3( si.y, 1.0, si.y ) * fq - q;
      float k = cotVgEdge( v0, v1, n ) + cotVgEdge( v1, v2, n ) + cotVgEdge( v2, v3, n )
              + cotVgEdge( v3, v4, n ) + cotVgEdge( v4, v5, n ) + cotVgEdge( v5, v0, n );
      return clamp( k * sg.x * sg.y * sg.z * ${INV_2PI.toFixed(7)}, 0.0, 1.0 );
    }
    // the share the hull solid hides from q (root frame), clipped at height c: its belly yb along p0..p1, the end plates
    // rising to yr at the rear end and yf at the front, each edge between a face turned to q and one turned away
    float cotVgHull( vec3 q, vec3 n, vec4 b0, vec4 b1, vec4 b2, float c ) {
      float yb = max( b0.y, c );
      if ( yb >= b0.z ) return 0.0;
      float lift = max( c - b0.y, 0.0 );
      float p0 = b2.x > 0.0 ? max( b1.x, b1.z - lift / max( b2.x, 1e-6 ) ) : b1.z;
      float p1 = b2.y > 0.0 ? min( b1.y, b1.w + lift / max( b2.y, 1e-6 ) ) : b1.w;
      float yr = min( b0.z, max( yb, b0.y + b2.x * ( b1.z - b1.x ) ) );
      float yf = min( b0.z, max( yb, b0.y + b2.y * ( b1.y - b1.w ) ) );
${(Object.keys(GLSL_CORNER) as HullCorner[]).map((k) => `      vec3 ${k} = ${GLSL_CORNER[k]} - q;`).join('\n')}
      float fTop = q.y > b0.z ? 1.0 : 0.0, fBot = q.y < yb ? 1.0 : 0.0;
      float fRend = q.z < b1.x ? 1.0 : 0.0, fFend = q.z > b1.y ? 1.0 : 0.0;
      float fRight = q.x > b0.x ? 1.0 : 0.0, fLeft = q.x < -b0.x ? 1.0 : 0.0;
      float fRpl = -( p0 - b1.x ) * ( q.y - yr ) - ( yr - yb ) * ( q.z - b1.x ) > 0.0 ? 1.0 : 0.0;
      float fFpl = -( b1.y - p1 ) * ( q.y - yf ) + ( yf - yb ) * ( q.z - b1.y ) > 0.0 ? 1.0 : 0.0;
      float k = 0.0;
${GLSL_HULL_EDGES}
      return clamp( -k * ${INV_2PI.toFixed(7)}, 0.0, 1.0 );
    }
    float cotVehicleGroundShade( vec2 uv, vec3 P, float alpha, float dist ) {
      float fade = 1.0 - smoothstep( ${f(GROUND_AO_RANGE_M - GROUND_AO_FADE_M)}, ${f(GROUND_AO_RANGE_M)}, dist );
      float sunVis = cotSunVisOf( alpha );
      // what a blocked direction keeps of its darkening: one minus the occluder's own light over the sky's (first-order
      // interreflection) — the belly lit by the open ground it glimpses, a wall by half sky and half ground
      float aUp = uContactAmb.x + uContactAmb.z + uContactAmb.w * max( uContactFillDir.y, 0.0 );
      float kSun = uContactSunLum * max( uSunDir.y, 0.0 ) / max( aUp, 1e-4 );
      vec4 lt = uVehGroundLight;
      float sBelly = clamp( 1.0 - lt.y * lt.x * ( lt.z * ( 1.0 + kSun ) + ( 1.0 - lt.z ) * lt.w ), 0.0, 1.0 );
      float sWall = clamp( 1.0 - lt.y * ( 0.5 + 0.5 * lt.x * ( 1.0 + 0.5 * kSun ) ), 0.0, 1.0 );
      vec3 N = vec3( 0.0, 1.0, 0.0 );
      bool haveN = false;
      float vis = 1.0;
      float under = 0.0; // how far inside a footprint, below its belly, the pixel stands: no sun reaches it there
      for ( int i = 0; i < ${GROUND_AO_MAX_HULLS}; i++ ) {
        if ( float( i ) >= uVehGround ) break;
        vec4 m0 = uVehGroundM[ i * 3 ], m1 = uVehGroundM[ i * 3 + 1 ], m2 = uVehGroundM[ i * 3 + 2 ];
        vec3 q = vec3( dot( m0.xyz, P ) + m0.w, dot( m1.xyz, P ) + m1.w, dot( m2.xyz, P ) + m2.w );
        vec4 b0 = uVehGroundB[ i * 4 ], b1 = uVehGroundB[ i * 4 + 1 ], b2 = uVehGroundB[ i * 4 + 2 ], b3 = uVehGroundB[ i * 4 + 3 ];
        float H = b0.z - b0.w;
        vec2 dd = vec2( abs( q.x ) - b0.x, abs( q.z - 0.5 * ( b1.x + b1.y ) ) - 0.5 * ( b1.y - b1.x ) );
        float dOut = length( max( dd, vec2( 0.0 ) ) );
        if ( dOut > H * ${f(GROUND_AO_REACH[1])} || q.y > b0.z || q.y < b0.w - H * ${f(GROUND_AO_REACH[1])} ) continue;
        // the vehicle itself is never a receiver: the hull over its belly along its whole length (a marking decal or glass
        // blended over it no longer carries the vehicle tag), and the shoes in their lane over the floor (their material
        // carries none): along their ground run, and on the wraps once off the ground (the ground under a wrap stays a
        // receiver)
        if ( q.y > b0.y + 0.02 && dOut < ${f(GROUND_AO_HULL_SKIN_M)} ) continue;
        float laneD = 0.5 * ( b2.w - b2.z ) - abs( abs( q.x ) - 0.5 * ( b2.z + b2.w ) );
        if ( laneD > ${f(-GROUND_AO_LANE_MARGIN_M)} && q.y >= b0.w + ${f(GROUND_AO_SHOE_FLOOR_M)} && q.y < b0.z + ${f(GROUND_AO_RUN_END_M)}
          && ( ( q.z > b3.z - ${f(GROUND_AO_CONTACT_MARGIN_M)} && q.z < b3.w + ${f(GROUND_AO_CONTACT_MARGIN_M)} )
            || ( q.z > b3.x - ${f(GROUND_AO_RUN_END_M)} && q.z < b3.y + ${f(GROUND_AO_RUN_END_M)} && q.y > b0.w + ${f(GROUND_AO_WRAP_LIFT_M)} ) ) ) continue;
        if ( !haveN ) { haveN = true; if ( sunVis >= 0.0 ) N = cotNormalAt( uv, P ); }
        vec3 n = normalize( vec3( dot( m0.xyz, N ), dot( m1.xyz, N ), dot( m2.xyz, N ) ) );
        // the solid clipped at the receiver's horizon (exact for a level receiver; a wall facing the hull keeps it whole)
        float c = q.y - ${f(GROUND_AO_CLIP_SLACK_M)} * ( 1.0 - n.y );
        float ho = cotVgHull( q, n, b0, b1, b2, c );
        // between the runs: the side gaps under the hull's edges, the part of each run's ground run below the plane
        // through q and the edge beyond it (past the ground run faded in from the runs' inner faces)
        if ( abs( q.x ) < b2.z ) {
          float gap = 0.0;
          float zc = clamp( q.z, b1.x, b1.y );
          float belly = min( b0.z, b0.y + max( 0.0, max( b2.x * ( b1.z - zc ), b2.y * ( zc - b1.w ) ) ) );
          float lo = max( b0.w, c );
          float topR = q.y + ( belly - q.y ) * ( b2.z - q.x ) / ( b0.x - q.x );
          if ( topR > lo ) gap += cotVgBox( vec3( q.x - 0.5 * ( b2.z + b2.w ), q.y - 0.5 * ( lo + topR ), q.z - 0.5 * ( b3.z + b3.w ) ), n,
            vec3( 0.5 * ( b2.w - b2.z ), 0.5 * ( topR - lo ), 0.5 * ( b3.w - b3.z ) ) );
          float topL = q.y + ( belly - q.y ) * ( b2.z + q.x ) / ( b0.x + q.x );
          if ( topL > lo ) gap += cotVgBox( vec3( q.x + 0.5 * ( b2.z + b2.w ), q.y - 0.5 * ( lo + topL ), q.z - 0.5 * ( b3.z + b3.w ) ), n,
            vec3( 0.5 * ( b2.w - b2.z ), 0.5 * ( topL - lo ), 0.5 * ( b3.w - b3.z ) ) );
          float wrap = smoothstep( -0.04, 0.0, max( b3.z - q.z, q.z - b3.w ) - ${f(GROUND_AO_CONTACT_MARGIN_M)} );
          ho += gap * mix( 1.0, smoothstep( 0.0, ${f(GROUND_AO_GAP_FADE_M)}, b2.z - abs( q.x ) ), wrap );
        }
        ho *= 1.0 - smoothstep( H * ${f(GROUND_AO_REACH[0])}, H * ${f(GROUND_AO_REACH[1])}, dOut );
        // the ground under a track's ground run: its shoes cover it (their gaps, their foot)
        ho = max( ho, smoothstep( -0.005, 0.005, laneD )
          * ( 1.0 - smoothstep( 0.0, ${f(GROUND_AO_TRACK_LIFTOFF_M)}, max( max( b3.z - q.z, q.z - b3.w ), 0.0 ) ) ) );
        // the belly's strength under the hull, the walls' beside it, blended across the footprint's edge
        float sd = dOut + min( max( dd.x, dd.y ), 0.0 );
        float inside = 1.0 - smoothstep( ${f(-GROUND_AO_EDGE_M)}, ${f(GROUND_AO_EDGE_M)}, sd );
        vis *= 1.0 - min( ho, 1.0 ) * mix( sWall, sBelly, inside );
        under = max( under, inside * step( q.y, b0.y ) );
      }
      float occ = ( 1.0 - vis ) * fade;
      if ( occ <= 0.003 ) return 1.0;
      // a card has no sun state: half in sun in the open, in the hull's own shade under its belly
      float ambShare = mix( ${f(GROUND_AO_CARD_AMBIENT_SHARE)}, 1.0, under );
      if ( sunVis >= 0.0 ) {
        float T = uContactSunLum * max( dot( N, uSunDir ), 0.0 ) * clamp( sunVis, 0.0, 1.0 );
        float A = mix( uContactAmb.y, uContactAmb.x, N.y * 0.5 + 0.5 ) + uContactAmb.z
          + uContactAmb.w * max( dot( N, uContactFillDir ), 0.0 );
        ambShare = A / max( T + A, 1e-4 );
      }
      return 1.0 - occ * ambShare;
    }
`;
