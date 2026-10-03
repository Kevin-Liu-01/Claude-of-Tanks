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
 * Geometry, exactly. Each hull is three boxes in its own (root) frame, measured once from the built visual: the hull
 * above its belly (the armour-derived shadow proxy's width and deck, the belly plate's length, down to the measured
 * hull-pan floor), and
 * the two track runs under it (the track bands' lanes and length, from the contact plane up to the belly). The share of
 * a receiver's cosine-weighted sky a box hides is its projected solid angle over π, Lambert's edge integral over the
 * box's silhouette hexagon (Quilez's box-occlusion construction): exact while the box stands above the receiver's
 * horizon, so each box is clipped at the receiver's height (the clip relaxes as the normal tilts toward a wall). The
 * belly at 0.31–0.51 m hides 0.96–0.97 of the sky at its middle, half at the footprint's edge, continuously on either
 * side (no rectangle); a far run is hidden behind the near one, and the hull's reach fades out at three hull heights.
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
 * belly's middle here lands at 0.06–0.10. `vehicleGroundOcclusionLocal` is the CPU twin the receipt pins against the GLSL.
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
/** The track boxes stand this far over the contact plane, so the ground beside them sees each box above its horizon. */
export const GROUND_AO_TRACK_LIFT_M = 0.02;
/** A hull's reach fades out between these multiples of its height (deck over the contact plane) from its footprint. */
export const GROUND_AO_REACH = Object.freeze([1.5, 3] as const);
/** A track run's between these multiples of its box height (the belly's clearance) from the run's footprint. */
export const GROUND_AO_TRACK_REACH = Object.freeze([2, 4] as const);
/** The belly's and the walls' strengths blend across the footprint's edge over ± this (m). */
export const GROUND_AO_EDGE_M = 0.25;
/** The receiver's horizon clip drops this far (m) per unit of normal tilt: a wall facing a hull keeps the whole box. */
export const GROUND_AO_CLIP_SLACK_M = 4;
/**
 * A pixel within this far (m) of the hull's footprint and over its belly is the hull itself — a marking decal or glass
 * blended over it, whose alpha no longer carries the vehicle tag (vehicleOcclusion.ts) — and is never a receiver.
 */
export const GROUND_AO_HULL_SKIN_M = 0.12;
/**
 * The hull box runs the belly plate's own length — the proxy's lowest vertices between the runs, within this band (m) of
 * the belly — plus
 * GROUND_AO_PLATE_OVERHANG_M at each end: a sloped nose or rear plate rises off the ground (the M1A2's from 0.41 m to
 * 1.0 m over its last metre), so the ground under it keeps much of its sky.
 */
export const GROUND_AO_BELLY_PLATE_BAND_M = 0.12;
export const GROUND_AO_PLATE_OVERHANG_M = 0.3;
/** Where the proxy's low vertices do not span a plate (a coarse hull), the belly ends this far (m) past the track run's
 * ground contact — over the end wheels. */
export const GROUND_AO_BELLY_BEYOND_RUN_M = 0.6;
/** Fallbacks for a hull without measured contact geometry: the belly's clearance and a run's width (m). */
export const GROUND_AO_CLEARANCE_M = 0.45;
export const GROUND_AO_TRACK_WIDTH_M = 0.6;

export interface Vec3Like { x: number; y: number; z: number; }

/** A hull's three boxes in its root frame (metres): the hull over its belly and the two runs under it. */
export interface VehicleGroundBoxes {
  /** The hull: |x| ≤ hx, yb ≤ y ≤ yt, hz0 ≤ z ≤ hz1 (yb the belly, yt the deck). */
  readonly hx: number; readonly yb: number; readonly yt: number; readonly hz0: number; readonly hz1: number;
  /** The runs: xi ≤ |x| ≤ xo, y0 ≤ y ≤ yb, tz0 ≤ z ≤ tz1 (y0 the contact plane plus the lift). */
  readonly xi: number; readonly xo: number; readonly y0: number; readonly tz0: number; readonly tz1: number;
}

export interface VehicleGroundStrengths { readonly belly: number; readonly wall: number; }

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** One silhouette edge of Lambert's edge integral: the angle it subtends times the normal's share of its plane. */
function edgeTerm(ax: number, ay: number, az: number, bx: number, by: number, bz: number, n: Vec3Like): number {
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  const s = Math.hypot(cx, cy, cz);
  return s > 1e-6 ? Math.atan2(s, ax * bx + ay * by + az * bz) * (n.x * cx + n.y * cy + n.z * cz) / s : 0;
}

/** Quilez's silhouette hexagon: the corner pattern of each vertex (times the corner nearest the receiver). */
const HEXAGON: readonly (readonly [number | 'x' | 'y' | 'z', number | 'x' | 'y' | 'z', number | 'x' | 'y' | 'z'])[] = [
  [1, 1, -1], [1, 'x', 'x'], [1, -1, 1], ['z', 'z', 1], [-1, 1, 1], ['y', 1, 'y'],
];

/**
 * The share of a receiver's cosine-weighted sky a box hides (its projected solid angle over π): the receiver at q
 * relative to the box's centre with unit normal n, r the box's half extents. Lambert's edge integral over the box's
 * silhouette hexagon, signed by the octant's mirror parity and clamped to [0, 1] — exact while the box stands above the
 * receiver's horizon; a box partly below it subtracts its hidden part, so it can only under-count.
 */
export function boxSkyOcclusion(q: Vec3Like, n: Vec3Like, r: Vec3Like): number {
  const sx = q.x >= 0 ? 1 : -1, sy = q.y >= 0 ? 1 : -1, sz = q.z >= 0 ? 1 : -1;
  const inside = { x: r.x >= Math.abs(q.x) ? 1 : -1, y: r.y >= Math.abs(q.y) ? 1 : -1, z: r.z >= Math.abs(q.z) ? 1 : -1 };
  const f = [r.x * sx, r.y * sy, r.z * sz];
  const at = (k: number | 'x' | 'y' | 'z'): number => (typeof k === 'number' ? k : inside[k]);
  const verts = HEXAGON.map((pattern) => {
    const vx = at(pattern[0]) * f[0] - q.x, vy = at(pattern[1]) * f[1] - q.y, vz = at(pattern[2]) * f[2] - q.z;
    const l = Math.hypot(vx, vy, vz) || 1;
    return [vx / l, vy / l, vz / l];
  });
  let k = 0;
  for (let i = 0; i < 6; i++) {
    const a = verts[i], b = verts[(i + 1) % 6];
    k += edgeTerm(a[0], a[1], a[2], b[0], b[1], b[2], n);
  }
  return clamp01((k * sx * sy * sz) / (2 * Math.PI));
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

/**
 * The CPU twin of the GLSL: the occlusion one hull casts on a receiver at q (root frame) with unit normal n (root
 * frame), its three boxes clipped at the receiver's horizon, each faded over its reach, the far run hidden behind the
 * near one, and the belly's or the walls' strength by the receiver's place across the footprint's edge.
 */
export function vehicleGroundOcclusionLocal(
  q: Vec3Like, n: Vec3Like, b: VehicleGroundBoxes, strengths: VehicleGroundStrengths,
): number {
  const H = b.yt - b.y0;
  const hcz = 0.5 * (b.hz0 + b.hz1), hhz = 0.5 * (b.hz1 - b.hz0);
  const dx = Math.abs(q.x) - b.hx, dz = Math.abs(q.z - hcz) - hhz;
  const dOut = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  if (dOut > H * GROUND_AO_REACH[1] || q.y > b.yt || q.y < b.y0 - H * GROUND_AO_REACH[1]) return 0;
  if (q.y > b.yb + 0.02 && dOut < GROUND_AO_HULL_SKIN_M) return 0;
  const yc = q.y + 0.002 - GROUND_AO_CLIP_SLACK_M * (1 - n.y);
  let occ = 0;
  const bot = Math.max(b.yb, yc);
  if (bot < b.yt) {
    occ += (1 - smoothstep(H * GROUND_AO_REACH[0], H * GROUND_AO_REACH[1], dOut))
      * boxSkyOcclusion({ x: q.x, y: q.y - 0.5 * (bot + b.yt), z: q.z - hcz }, n, { x: b.hx, y: 0.5 * (b.yt - bot), z: hhz });
  }
  const tb = Math.max(b.y0, yc);
  if (tb < b.yb) {
    const th = b.yb - b.y0, span = Math.max(b.xo - b.xi, 1e-3);
    const r = { x: 0.5 * (b.xo - b.xi), y: 0.5 * (b.yb - tb), z: 0.5 * (b.tz1 - b.tz0) };
    const cx = 0.5 * (b.xi + b.xo), cy = 0.5 * (tb + b.yb), cz = 0.5 * (b.tz0 + b.tz1);
    for (const side of [-1, 1]) {
      const lx = q.x - side * cx;
      const reach = Math.hypot(Math.max(Math.abs(lx) - r.x, 0), Math.max(Math.abs(q.z - cz) - r.z, 0));
      const shown = clamp01(side < 0 ? (b.xo - q.x) / span : (q.x + b.xo) / span);
      const w = shown * (1 - smoothstep(th * GROUND_AO_TRACK_REACH[0], th * GROUND_AO_TRACK_REACH[1], reach));
      if (w > 0) occ += w * boxSkyOcclusion({ x: lx, y: q.y - cy, z: q.z - cz }, n, r);
    }
  }
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
  /** Per hull, three vec4: (hx, yb, yt, hz0), (hz1, xi, xo, y0), (tz0, tz1, weight, 0) — the boxes in the root frame. */
  uVehGroundB: THREE.IUniform<THREE.Vector4[]>;
  /** The interreflection's inputs: the ground's albedo, the hull's, the belly's view of open ground, the shaded ground. */
  uVehGroundLight: THREE.IUniform<THREE.Vector4>;
}

export function createVehicleGroundOcclusionUniforms(): VehicleGroundOcclusionUniforms {
  const rows = () => Array.from({ length: GROUND_AO_MAX_HULLS * 3 }, () => new THREE.Vector4());
  return {
    uVehGround: { value: 0 },
    uVehGroundM: { value: rows() },
    uVehGroundB: { value: rows() },
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

/** The z extent of the belly plate: the proxy's vertices under `top` between the runs (|x| ≤ xMax, root frame). */
function bellyPlateSpan(proxy: THREE.Mesh, root: THREE.Object3D, top: number, xMax: number): [number, number] | null {
  const position = proxy.geometry.getAttribute('position');
  if (!position || !rootFrameMatrix(proxy, root, _rel)) return null;
  let z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < position.count; i++) {
    _vertex.fromBufferAttribute(position, i).applyMatrix4(_rel);
    if (_vertex.y <= top && Math.abs(_vertex.x) <= xMax) { z0 = Math.min(z0, _vertex.z); z1 = Math.max(z1, _vertex.z); }
  }
  return z1 > z0 ? [z0, z1] : null;
}

interface ContactGeometryLike {
  bottomYM?: number | null; panYM?: number | null; halfWidM?: number | null; halfLenM?: number | null; zCenterM?: number | null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A hull's three boxes, measured once from the built visual and cached on the root: the contact plane, the belly and
 * the runs' outer edge from the movement contact geometry (tankFactoryCore.ts / restPoseContact.ts), the hull's width,
 * length and deck from its shadow proxy, the runs' lanes and length from the track bands. Null without a proxy.
 */
export function measureVehicleGroundBoxes(root: THREE.Object3D): VehicleGroundBoxes | null {
  // a showroom hero has no contact geometry until it is lent to a battle (prepareForSimulation): measure again then
  const cg = (root.userData.contactGeom as ContactGeometryLike | null | undefined) ?? null;
  const cached = root.userData.groundAoBoxes as VehicleGroundBoxes | null | undefined;
  if (cached !== undefined && root.userData.groundAoBoxesFor === cg) return cached;
  let boxes: VehicleGroundBoxes | null = null;
  const proxy = hullProxyOf(root);
  const hull = proxy ? rootFrameBounds(proxy, root, proxy.geometry, new THREE.Box3()) : null;
  if (hull) {
    let bandXi = Infinity, bandXo = 0, bandZ0 = Infinity, bandZ1 = -Infinity, bands = 0;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || (mesh.name !== 'gearTrackBandL' && mesh.name !== 'gearTrackBandR')) return;
      const b = rootFrameBounds(mesh, root, mesh.geometry, _bounds);
      if (!b) return;
      const inner = b.min.x > 0 ? b.min.x : b.max.x < 0 ? -b.max.x : 0;
      bandXi = Math.min(bandXi, inner);
      bandXo = Math.max(bandXo, Math.abs(b.min.x), Math.abs(b.max.x));
      bandZ0 = Math.min(bandZ0, b.min.z); bandZ1 = Math.max(bandZ1, b.max.z);
      bands++;
    });
    const ground = finite(cg?.bottomYM) ? cg.bottomYM : hull.min.y - GROUND_AO_CLEARANCE_M;
    const yb = finite(cg?.panYM) ? Math.max(cg.panYM, ground + 0.1) : Math.max(hull.min.y, ground + 0.1);
    const xo = finite(cg?.halfWidM) && cg.halfWidM > 0.5 ? cg.halfWidM : bands ? bandXo : Math.max(Math.abs(hull.min.x), hull.max.x);
    const xi = bands && bandXi > 0.2 && bandXi < xo - 0.1 ? bandXi : Math.max(0.2, xo - GROUND_AO_TRACK_WIDTH_M);
    const zc = finite(cg?.zCenterM) ? cg.zCenterM : 0.5 * (hull.min.z + hull.max.z);
    const hl = finite(cg?.halfLenM) ? cg.halfLenM : 0.35 * (hull.max.z - hull.min.z);
    const tz0 = bands ? bandZ0 : zc - hl - 0.5, tz1 = bands ? bandZ1 : zc + hl + 0.5;
    let plate = proxy ? bellyPlateSpan(proxy, root, Math.min(hull.min.y, yb) + GROUND_AO_BELLY_PLATE_BAND_M, xi + 0.15) : null;
    if (plate && plate[1] - plate[0] < 1) plate = null;
    if (!plate && finite(cg?.halfLenM) && finite(cg?.zCenterM)) {
      plate = [cg.zCenterM - cg.halfLenM - GROUND_AO_BELLY_BEYOND_RUN_M, cg.zCenterM + cg.halfLenM + GROUND_AO_BELLY_BEYOND_RUN_M];
    }
    const hz0 = plate ? Math.max(hull.min.z, plate[0] - GROUND_AO_PLATE_OVERHANG_M) : hull.min.z;
    const hz1 = plate ? Math.min(hull.max.z, plate[1] + GROUND_AO_PLATE_OVERHANG_M) : hull.max.z;
    const candidate: VehicleGroundBoxes = {
      hx: Math.max(Math.abs(hull.min.x), Math.abs(hull.max.x), xo), yb, yt: hull.max.y, hz0, hz1,
      xi, xo, y0: ground + GROUND_AO_TRACK_LIFT_M, tz0, tz1,
    };
    const valid = candidate.yt > candidate.yb + 0.2 && candidate.yb > candidate.y0 && candidate.xo > candidate.xi
      && candidate.hz1 > candidate.hz0 && candidate.tz1 > candidate.tz0 && Object.values(candidate).every(finite);
    boxes = valid ? Object.freeze(candidate) : null;
  }
  root.userData.groundAoBoxes = boxes;
  root.userData.groundAoBoxesFor = cg;
  return boxes;
}

const _world = new THREE.Matrix4(), _inv = new THREE.Matrix4();

/**
 * Per frame (post.ts): the boxes of the near hulls the shadow router selected (lighting.ts publishes the selection on
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
      const b = measureVehicleGroundBoxes(root);
      if (!b) continue;
      _world.compose(root.position, root.quaternion, root.scale);
      if (root.parent) _world.premultiply(root.parent.matrixWorld);
      const e = _inv.copy(_world).invert().elements;
      u.uVehGroundM.value[n * 3].set(e[0], e[4], e[8], e[12]);
      u.uVehGroundM.value[n * 3 + 1].set(e[1], e[5], e[9], e[13]);
      u.uVehGroundM.value[n * 3 + 2].set(e[2], e[6], e[10], e[14]);
      u.uVehGroundB.value[n * 3].set(b.hx, b.yb, b.yt, b.hz0);
      u.uVehGroundB.value[n * 3 + 1].set(b.hz1, b.xi, b.xo, b.y0);
      u.uVehGroundB.value[n * 3 + 2].set(b.tz0, b.tz1, 1, 0);
      n++;
    }
  }
  u.uVehGround.value = n;
}

const f = (x: number): string => x.toFixed(4);

/**
 * The block the aerial fragment includes AFTER `CONTACT_SHADOW_GLSL` (it uses that block's cotSunVisOf, cotNormalAt
 * and rig uniforms, and the pass's uSunDir): `cotVehicleGroundShade(uv, P, alpha, dist)` → the multiplier for a ground
 * pixel's colour (1 = untouched).
 */
export const VEHICLE_GROUND_OCCLUSION_GLSL = /* glsl */ `
    // 2026-10-03: the ground's sky under and beside the near hulls (vehicleGroundOcclusion.ts)
    uniform float uVehGround;
    uniform vec4 uVehGroundM[ ${GROUND_AO_MAX_HULLS * 3} ];
    uniform vec4 uVehGroundB[ ${GROUND_AO_MAX_HULLS * 3} ];
    uniform vec4 uVehGroundLight;
    // one silhouette edge of Lambert's projected solid angle: the angle it subtends times the normal's share of its plane
    float cotVgEdge( vec3 a, vec3 b, vec3 n ) {
      vec3 c = cross( a, b );
      float s = length( c );
      return s > 1e-6 ? atan( s, dot( a, b ) ) * dot( n, c ) / s : 0.0;
    }
    // the share of the cosine-weighted sky a box (half extents r) hides from q (relative to its centre), normal n:
    // Quilez's silhouette hexagon, signed by the octant's mirror parity
    float cotVgBox( vec3 q, vec3 n, vec3 r ) {
      vec3 sg = step( 0.0, q ) * 2.0 - 1.0;
      vec3 fq = r * sg;
      vec3 si = step( abs( q ), r ) * 2.0 - 1.0;
      vec3 v0 = normalize( vec3( 1.0, 1.0, -1.0 ) * fq - q );
      vec3 v1 = normalize( vec3( 1.0, si.x, si.x ) * fq - q );
      vec3 v2 = normalize( vec3( 1.0, -1.0, 1.0 ) * fq - q );
      vec3 v3 = normalize( vec3( si.z, si.z, 1.0 ) * fq - q );
      vec3 v4 = normalize( vec3( -1.0, 1.0, 1.0 ) * fq - q );
      vec3 v5 = normalize( vec3( si.y, 1.0, si.y ) * fq - q );
      float k = cotVgEdge( v0, v1, n ) + cotVgEdge( v1, v2, n ) + cotVgEdge( v2, v3, n )
              + cotVgEdge( v3, v4, n ) + cotVgEdge( v4, v5, n ) + cotVgEdge( v5, v0, n );
      return clamp( k * sg.x * sg.y * sg.z * ${(1 / (2 * Math.PI)).toFixed(7)}, 0.0, 1.0 );
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
        vec4 b0 = uVehGroundB[ i * 3 ], b1 = uVehGroundB[ i * 3 + 1 ], b2 = uVehGroundB[ i * 3 + 2 ];
        float H = b0.z - b1.w;
        float hcz = 0.5 * ( b0.w + b1.x ), hhz = 0.5 * ( b1.x - b0.w );
        vec2 dd = vec2( abs( q.x ) - b0.x, abs( q.z - hcz ) - hhz );
        float dOut = length( max( dd, vec2( 0.0 ) ) );
        if ( dOut > H * ${f(GROUND_AO_REACH[1])} || q.y > b0.z || q.y < b1.w - H * ${f(GROUND_AO_REACH[1])} ) continue;
        // the hull itself (a marking decal or glass blended over it no longer carries the vehicle tag): never a receiver
        if ( q.y > b0.y + 0.02 && dOut < ${f(GROUND_AO_HULL_SKIN_M)} ) continue;
        if ( !haveN ) { haveN = true; if ( sunVis >= 0.0 ) N = cotNormalAt( uv, P ); }
        vec3 n = normalize( vec3( dot( m0.xyz, N ), dot( m1.xyz, N ), dot( m2.xyz, N ) ) );
        // each box clipped at the receiver's horizon (exact for a level receiver; a wall facing the hull keeps it whole)
        float yc = q.y + 0.002 - ${f(GROUND_AO_CLIP_SLACK_M)} * ( 1.0 - n.y );
        float ho = 0.0;
        float bot = max( b0.y, yc );
        if ( bot < b0.z ) {
          ho += ( 1.0 - smoothstep( H * ${f(GROUND_AO_REACH[0])}, H * ${f(GROUND_AO_REACH[1])}, dOut ) )
            * cotVgBox( vec3( q.x, q.y - 0.5 * ( bot + b0.z ), q.z - hcz ), n, vec3( b0.x, 0.5 * ( b0.z - bot ), hhz ) );
        }
        // the two runs under the belly; a run is hidden from a receiver past the other one
        float tb = max( b1.w, yc );
        if ( tb < b0.y ) {
          float th = b0.y - b1.w, span = max( b1.z - b1.y, 1e-3 );
          vec3 r = vec3( 0.5 * ( b1.z - b1.y ), 0.5 * ( b0.y - tb ), 0.5 * ( b2.y - b2.x ) );
          float cx = 0.5 * ( b1.y + b1.z ), cy = 0.5 * ( tb + b0.y ), cz = 0.5 * ( b2.x + b2.y );
          vec2 dl = vec2( abs( q.x + cx ) - r.x, abs( q.z - cz ) - r.z );
          float wl = clamp( ( b1.z - q.x ) / span, 0.0, 1.0 )
            * ( 1.0 - smoothstep( th * ${f(GROUND_AO_TRACK_REACH[0])}, th * ${f(GROUND_AO_TRACK_REACH[1])}, length( max( dl, vec2( 0.0 ) ) ) ) );
          if ( wl > 0.0 ) ho += wl * cotVgBox( vec3( q.x + cx, q.y - cy, q.z - cz ), n, r );
          vec2 dr = vec2( abs( q.x - cx ) - r.x, abs( q.z - cz ) - r.z );
          float wr = clamp( ( q.x + b1.z ) / span, 0.0, 1.0 )
            * ( 1.0 - smoothstep( th * ${f(GROUND_AO_TRACK_REACH[0])}, th * ${f(GROUND_AO_TRACK_REACH[1])}, length( max( dr, vec2( 0.0 ) ) ) ) );
          if ( wr > 0.0 ) ho += wr * cotVgBox( vec3( q.x - cx, q.y - cy, q.z - cz ), n, r );
        }
        // the belly's strength under the hull, the walls' beside it, blended across the footprint's edge
        float sd = dOut + min( max( dd.x, dd.y ), 0.0 );
        float inside = 1.0 - smoothstep( ${f(-GROUND_AO_EDGE_M)}, ${f(GROUND_AO_EDGE_M)}, sd );
        vis *= 1.0 - min( ho, 1.0 ) * mix( sWall, sBelly, inside ) * b2.z;
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
