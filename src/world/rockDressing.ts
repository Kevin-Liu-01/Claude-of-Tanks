// Round 75, item 6 (integrator, deploy-100 Verdant hull-side frame), rebuilt by the scenery lane 2026-10-04 (gauntlet
// wave 52: the boulders were "low-poly frustums, chamfered boxes or polyhedra … all under one even noise texture and
// none sunk into the ground"). This module owns the boulders' look: their forms (jointed blocks the weather rounded,
// buildBoulderForm), their tone by face, fracture and arris (paintBoulder), the per-map dressing (the map's rock — its
// lithology: granite speckle, gneiss foliation, sandstone and limestone beds, slate cleavage, basalt vesicles — the
// lichen of its climate in two species, moss on the shaded faces of wet maps, a dust cap and desert varnish on arid
// maps, a soil skirt and contact darkening at the base everywhere so the stone sits in the ground), the generated tiles
// the rock material samples (a 256 px detail tile of the map's lithology, triplanar — no UVs on a boulder — and a lichen
// colony tile), and the shader hook. The legacy rocks' projected hulls stay the collision proxies: the visual rock lies
// inside the hull the dedicated shards already carry and no record moves. Renderer-free apart from the texture
// helpers; Node-runnable.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { normalTextureFromHeight, textureFromRgbaPixels, tileableTorusNoise } from './proceduralTexture.ts';

type ToneFunction = (hue: number, saturation: number, lightness: number) => readonly [number, number, number];

/** The rock a battlefield's boulders are made of: what its detail tile and its beds draw. */
export type BoulderLithology = 'granite' | 'gneiss' | 'sandstone' | 'limestone' | 'slate' | 'basalt';

export interface RockDressing {
  /** Moss / lichen weight on the shaded and upward faces (0 on snow and arid maps). */
  moss: number;
  /** Dust cap and skirt weight (arid maps). */
  dust: number;
  /** Linear soil colour the base blends toward (the map's dirt tone). */
  soil: readonly [number, number, number];
  lithology: BoulderLithology;
  /** The beds: strength (0 none), spacing (m), the largest tilt from level (radians), the partings' depth. */
  beds: readonly [number, number, number, number];
  /** The lichen: cover of the exposed faces, the share of the first species, 1 where snow lies on the tops. */
  lichen: readonly [number, number, number];
  /** The two species' linear colours. */
  lichenA: readonly [number, number, number];
  lichenB: readonly [number, number, number];
  /** Desert varnish on the exposed faces (arid maps). */
  varnish: number;
}

// lichen species (sRGB): the grey-green foliose and crustose, the yellow-green map lichen, the orange Xanthoria of
// sea-spray, farm and wall tops, the pale grey-white crusts, the black of the high and the dry
const GREY_GREEN = 0x9ea48d, YELLOW_GREEN = 0xa6a466, ORANGE = 0xa8794a, PALE = 0xb4b5aa, BLACK = 0x3a3934;

interface RockClimate {
  moss: number;
  dust: number;
  lith: BoulderLithology;
  /** cover, species A, species B, A's share */
  lichen: readonly [number, number, number, number];
  varnish?: number;
}

/** The battlefields' rock; a map absent here is dry temperate granite (a little moss, grey lichen, no dust). */
const ROCK_CLIMATE: Readonly<Record<string, RockClimate>> = Object.freeze({
  verdant: { moss: 0.75, dust: 0, lith: 'granite', lichen: [0.21, GREY_GREEN, YELLOW_GREEN, 0.7] },
  autumn: { moss: 0.7, dust: 0, lith: 'granite', lichen: [0.2, GREY_GREEN, ORANGE, 0.75] },
  coastal: { moss: 0.6, dust: 0, lith: 'granite', lichen: [0.27, ORANGE, PALE, 0.55] },
  fjord: { moss: 0.8, dust: 0, lith: 'gneiss', lichen: [0.2, GREY_GREEN, BLACK, 0.65] },
  monsoon: { moss: 0.85, dust: 0, lith: 'granite', lichen: [0.19, PALE, GREY_GREEN, 0.6] },
  mangrove: { moss: 0.85, dust: 0, lith: 'limestone', lichen: [0.19, PALE, ORANGE, 0.7] },
  delta: { moss: 0.7, dust: 0, lith: 'limestone', lichen: [0.17, PALE, GREY_GREEN, 0.6] },
  polders: { moss: 0.65, dust: 0, lith: 'granite', lichen: [0.22, GREY_GREEN, ORANGE, 0.6] },
  orchard: { moss: 0.7, dust: 0, lith: 'granite', lichen: [0.2, GREY_GREEN, PALE, 0.65] },
  longleaf: { moss: 0.75, dust: 0, lith: 'sandstone', lichen: [0.19, GREY_GREEN, PALE, 0.7] },
  reservoir: { moss: 0.7, dust: 0, lith: 'slate', lichen: [0.21, GREY_GREEN, YELLOW_GREEN, 0.6] },
  saltwind: { moss: 0.55, dust: 0, lith: 'limestone', lichen: [0.26, ORANGE, PALE, 0.5] },
  frontier: { moss: 0.5, dust: 0, lith: 'sandstone', lichen: [0.15, ORANGE, GREY_GREEN, 0.55], varnish: 0.07 },
  alpine: { moss: 0.45, dust: 0, lith: 'gneiss', lichen: [0.19, YELLOW_GREEN, BLACK, 0.55] },
  urban: { moss: 0.3, dust: 0.1, lith: 'granite', lichen: [0.07, PALE, ORANGE, 0.7] },
  railyard: { moss: 0.25, dust: 0.15, lith: 'granite', lichen: [0.06, PALE, ORANGE, 0.7] },
  foundry: { moss: 0.25, dust: 0.15, lith: 'granite', lichen: [0.05, PALE, ORANGE, 0.7] },
  ruinspires: { moss: 0.25, dust: 0.1, lith: 'sandstone', lichen: [0.09, PALE, ORANGE, 0.6] },
  skybridge: { moss: 0.2, dust: 0.1, lith: 'sandstone', lichen: [0.1, ORANGE, PALE, 0.5] },
  caldera: { moss: 0.05, dust: 0.35, lith: 'basalt', lichen: [0.06, PALE, ORANGE, 0.6] },
  blackglass: { moss: 0, dust: 0.25, lith: 'basalt', lichen: [0.04, PALE, ORANGE, 0.7] },
  steppe: { moss: 0.15, dust: 0.4, lith: 'granite', lichen: [0.15, ORANGE, GREY_GREEN, 0.5], varnish: 0.06 },
  airfield: { moss: 0.2, dust: 0.4, lith: 'granite', lichen: [0.12, GREY_GREEN, ORANGE, 0.6], varnish: 0.05 },
  desert: { moss: 0, dust: 0.8, lith: 'sandstone', lichen: [0.03, BLACK, ORANGE, 0.6], varnish: 0.33 },
  badlands: { moss: 0, dust: 0.8, lith: 'sandstone', lichen: [0.03, BLACK, ORANGE, 0.6], varnish: 0.3 },
  copper_mesa: { moss: 0, dust: 0.75, lith: 'sandstone', lichen: [0.04, ORANGE, BLACK, 0.5], varnish: 0.3 },
  titan_gorge: { moss: 0, dust: 0.7, lith: 'sandstone', lichen: [0.04, BLACK, ORANGE, 0.6], varnish: 0.27 },
  oasis: { moss: 0, dust: 0.7, lith: 'sandstone', lichen: [0.04, ORANGE, BLACK, 0.5], varnish: 0.24 },
  mars: { moss: 0, dust: 0.9, lith: 'basalt', lichen: [0, PALE, PALE, 1] },
  moon: { moss: 0, dust: 0.7, lith: 'basalt', lichen: [0, PALE, PALE, 1] },
  cliffbridge: { moss: 0.6, dust: 0.6, lith: 'limestone', lichen: [0.19, ORANGE, PALE, 0.5] },
  winter: { moss: 0, dust: 0, lith: 'granite', lichen: [0.16, BLACK, YELLOW_GREEN, 0.6] },
  whiteout: { moss: 0, dust: 0, lith: 'granite', lichen: [0.12, BLACK, YELLOW_GREEN, 0.7] },
});
const DEFAULT_CLIMATE: RockClimate = { moss: 0.35, dust: 0, lith: 'granite', lichen: [0.15, GREY_GREEN, PALE, 0.6] };

/** The lithologies' beds: strength, spacing (m), the largest tilt from level (radians), the partings' depth. */
const BEDS: Readonly<Record<BoulderLithology, readonly [number, number, number, number]>> = Object.freeze({
  granite: [0, 1, 0, 0],             // massive: its joints are the forms' faces
  gneiss: [0.5, 0.07, 1.1, 0.12],    // foliation: thin light and dark bands, steeply tilted
  sandstone: [0.8, 0.2, 0.3, 0.35],  // beds a hand to a forearm thick, near level, parted by soft partings
  limestone: [0.45, 0.38, 0.22, 0.4],
  slate: [0.42, 0.05, 1.25, 0.25],   // the cleavage, close and steep
  basalt: [0, 1, 0, 0],
});

/** The battlefield's boulder lithology (the detail tile is drawn for it). */
export function rockLithologyFor(mapId: string): BoulderLithology {
  return (ROCK_CLIMATE[mapId] ?? DEFAULT_CLIMATE).lith;
}

const _soil = new THREE.Color();
const _species = new THREE.Color();
function linearOf(hex: number): [number, number, number] {
  _species.setHex(hex, THREE.SRGBColorSpace);
  return [_species.r, _species.g, _species.b];
}

/**
 * Resolve a map's rock dressing; the soil follows the map's dirt tone law over a loam base. On a snow-capped map the
 * lichen keeps to the steep faces the snow leaves bare.
 */
export function rockDressingFor(mapId: string, dirtTone: ToneFunction | null | undefined, snowCap = false): RockDressing {
  const climate = ROCK_CLIMATE[mapId] ?? DEFAULT_CLIMATE;
  let h = 0.085, s = 0.32, l = 0.30;
  if (dirtTone) {
    const t = dirtTone(h, s, l);
    h = Math.min(1, Math.max(0, t[0])); s = Math.min(1, Math.max(0, t[1])); l = Math.min(1, Math.max(0, t[2]));
  }
  _soil.setHSL(h, s, l, THREE.SRGBColorSpace);
  const [cover, a, b, split] = climate.lichen;
  return {
    moss: climate.moss, dust: climate.dust, soil: [_soil.r, _soil.g, _soil.b],
    lithology: climate.lith, beds: BEDS[climate.lith],
    lichen: [cover, split, snowCap ? 1 : 0], lichenA: linearOf(a), lichenB: linearOf(b),
    varnish: climate.varnish ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------- geometry

/**
 * The boulders' forms (the scenery lane, 2026-10-04; gauntlet wave 52, the most-cited defect: "low-poly frustums,
 * chamfered boxes or polyhedra that pass through each other, all under one even noise texture and none sunk into the
 * ground", "a hard diagonal shading seam across its face"). A boulder is a block its joints cut out of the bedrock and
 * the weather rounded: the surface is the smooth maximum of its joint planes' signed distances (flat joint faces, the
 * arrises between them rounded over a width of their own, never a crease), lumped a few per cent by two octaves of
 * weathering, its foot flaring a little under the ground line so the ground cuts it where it still widens downward and
 * it reads bedded. Three kinds share the instancing: a jointed block (three joint sets a little out of square, its upper
 * corners chipped by later fractures), a rounded boulder (a jittered sphere of facets weathered round, one fresh cleaved
 * face) and a bedded slab (a bed's top and a polygon of steep joints). The surface is star-shaped about the centre, so
 * it is meshed by casting a cube-sphere grid's directions at it (rows crowded above the ground line, where the rock
 * shows) and its normals are the surface's own (central differences of the same function, never the triangles'), each
 * quad split along the diagonal whose ends shade alike: no seam of light runs along a triangle edge. Fitted inside the
 * legacy hull (the collision footprint the shards carry) above the ground line and as tall as the legacy rock, so the
 * collider stands for the visible rock and no record moves.
 */
interface BoulderKind {
  readonly name: string;
  /** Semi-axes (x, up, z) of the ellipsoid the joint planes circumscribe, before the hull fit. */
  readonly size: readonly [number, number, number];
  /** 'box': three joint sets a little out of square; 'facets': a jittered sphere of facets; 'slab': a bed's top and a
   * polygon of steep joints. */
  readonly frame: 'box' | 'facets' | 'slab';
  /** Later fractures through the frame's upper corners and edges (fresh faces). */
  readonly chips: number;
  /** The arrises' rounding: the width of the smooth maximum over the joint planes (unit space). */
  readonly round: number;
  /** Weathering: the broad and the fine lumps' share of the radius. */
  readonly lumps: readonly [number, number];
}

export const BOULDER_KINDS: readonly BoulderKind[] = Object.freeze([
  Object.freeze({ name: 'jointed block', size: [1.0, 0.8, 0.86] as const, frame: 'box' as const, chips: 3, round: 0.07, lumps: [0.025, 0.01] as const }),
  Object.freeze({ name: 'rounded boulder', size: [0.98, 0.84, 0.9] as const, frame: 'facets' as const, chips: 1, round: 0.1, lumps: [0.035, 0.012] as const }),
  Object.freeze({ name: 'bedded slab', size: [1.05, 0.7, 0.92] as const, frame: 'slab' as const, chips: 2, round: 0.07, lumps: [0.025, 0.01] as const }),
]);

/**
 * The kinds a lithology's boulders take, one to each of the three variants: the bedded and cleaved rocks break into
 * blocks and slabs along their joints; granite, gneiss and basalt weather round as well (wave-52 shots: Desert's
 * sandstone as smooth eggs).
 */
const BOULDER_KINDS_OF: Readonly<Record<BoulderLithology, readonly [number, number, number]>> = Object.freeze({
  granite: [0, 1, 2], gneiss: [0, 1, 2], basalt: [0, 1, 0],
  sandstone: [0, 2, 0], limestone: [0, 2, 1], slate: [2, 0, 2],
});

/** The kind (an index into BOULDER_KINDS) a map's variant is built as. */
export function boulderKindFor(lithology: BoulderLithology, variant: number): number {
  return BOULDER_KINDS_OF[lithology][variant % 3];
}

/** A joint plane: outward unit normal, offset from the centre, and 1 for a later (fresh) fracture. */
type JointPlane = [nx: number, ny: number, nz: number, d: number, fresh: number];

/** The kind's joint planes: the frame, a floor well under the ground, the chips. */
function jointPlanes(kind: BoulderKind, rng: () => number): JointPlane[] {
  const [sx, sy, sz] = kind.size;
  const planes: JointPlane[] = [];
  const add = (x: number, y: number, z: number, depth: number, fresh = 0): void => {
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    // the ellipsoid's support along the normal, so a frame plane at depth 1 touches it
    planes.push([x, y, z, Math.sqrt((sx * x) ** 2 + (sy * y) ** 2 + (sz * z) ** 2) * depth, fresh]);
  };
  const tilt = (x: number, y: number, z: number, a: number): [number, number, number] =>
    [x + (rng() * 2 - 1) * a, y + (rng() * 2 - 1) * a, z + (rng() * 2 - 1) * a];
  if (kind.frame === 'box') {
    for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]] as const) {
      const [tx, ty, tz] = tilt(x, y, z, 0.15);
      add(tx, ty, tz, 0.95 + rng() * 0.07);
    }
  } else if (kind.frame === 'facets') {
    const count = 14;
    for (let i = 0; i < count; i++) {
      // a Fibonacci sphere's upper four fifths, jittered
      const y = 1 - ((i + 0.5) / count) * 1.65, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + rng() * 0.6;
      const [tx, ty, tz] = tilt(Math.cos(a) * r, y, Math.sin(a) * r, 0.18);
      add(tx, ty, tz, 0.9 + rng() * 0.1);
    }
  } else {
    const [tx, ty, tz] = tilt(0, 1, 0, 0.1);
    add(tx, ty, tz, 1);
    const sides = 6, a0 = rng() * Math.PI * 2;
    for (let i = 0; i < sides; i++) {
      const a = a0 + ((i + (rng() - 0.5) * 0.55) / sides) * Math.PI * 2;
      const [px, py, pz] = tilt(Math.cos(a), (rng() - 0.4) * 0.22, Math.sin(a), 0.07);
      add(px, py, pz, 0.93 + rng() * 0.09);
    }
  }
  planes.push([0, -1, 0, sy * 0.8, 0]); // the floor, under every ground line
  for (let c = 0; c < kind.chips; c++) {
    const a = rng() * Math.PI * 2, e = 0.4 + rng() * 0.55;
    add(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), 0.8 + rng() * 0.1, 1);
  }
  return planes;
}

/**
 * Along the unit direction u: the distance to the rounded joint surface (the root of the planes' smooth maximum,
 * Newton from outside — the smooth maximum is convex along the ray, so the steps fall monotonically onto the root),
 * and, into `weights`, each plane's share of the surface there.
 */
function jointRadius(planes: readonly JointPlane[], k: number, ux: number, uy: number, uz: number, weights: Float64Array | null): number {
  let t = 4;
  for (let iteration = 0; iteration < 40; iteration++) {
    let m = -Infinity;
    for (const p of planes) m = Math.max(m, t * (p[0] * ux + p[1] * uy + p[2] * uz) - p[3]);
    let sum = 0, slope = 0;
    for (const p of planes) {
      const a = p[0] * ux + p[1] * uy + p[2] * uz, e = Math.exp((t * a - p[3] - m) / k);
      sum += e; slope += e * a;
    }
    const step = (m + k * Math.log(sum)) / (slope / sum);
    t -= step;
    if (Math.abs(step) < 1e-10) break;
  }
  if (weights) {
    let m = -Infinity;
    for (const p of planes) m = Math.max(m, t * (p[0] * ux + p[1] * uy + p[2] * uz) - p[3]);
    let sum = 0;
    for (let i = 0; i < planes.length; i++) {
      const p = planes[i];
      sum += weights[i] = Math.exp((t * (p[0] * ux + p[1] * uy + p[2] * uz) - p[3] - m) / k);
    }
    for (let i = 0; i < planes.length; i++) weights[i] /= sum;
  }
  return t;
}

/** The legacy hull's radius along an XZ direction (the convex polygon [x, z, ...] about the origin). */
function hullRadiusAt(hull: readonly number[], dx: number, dz: number): number {
  const count = hull.length / 2;
  let best = Infinity;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const ax = hull[i * 2], az = hull[i * 2 + 1], ex = hull[j * 2] - ax, ez = hull[j * 2 + 1] - az;
    // the ray t (dx, dz) against the edge a + s (e)
    const det = ex * dz - ez * dx;
    if (Math.abs(det) < 1e-12) continue;
    const t = (ex * az - ez * ax) / det, s = (dx * az - dz * ax) / det;
    if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) best = Math.min(best, t);
  }
  return best;
}

/**
 * A cube's surface gridded n x n a face, welded: the corner points, the quads (counter-clockwise from outside) and,
 * for the floor face (always buried: no grid there to pay for), a fan from its centre round its rim.
 */
function cubeGrid(n: number): { points: number[]; quads: number[]; fan: number[] } {
  const faces: ReadonlyArray<readonly [readonly number[], readonly number[], readonly number[]]> = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const points: number[] = [], quads: number[] = [], fan: number[] = [], seen = new Map<string, number>();
  for (const [N, U, V] of faces) {
    const floor = N[1] === -1, ids: number[] = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      if (floor && i > 0 && i < n && j > 0 && j < n) { ids.push(-1); continue; }
      const a = -1 + (2 * i) / n, b = -1 + (2 * j) / n;
      const x = N[0] + a * U[0] + b * V[0], y = N[1] + a * U[1] + b * V[1], z = N[2] + a * U[2] + b * V[2];
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
      let id = seen.get(key);
      if (id === undefined) { id = points.length / 3; seen.set(key, id); points.push(x, y, z); }
      ids.push(id);
    }
    if (floor) {
      // the rim in the quads' turning sense, then a fan from the centre
      const rim: number[] = [];
      for (let i = 0; i < n; i++) rim.push(ids[i]);
      for (let j = 0; j < n; j++) rim.push(ids[j * (n + 1) + n]);
      for (let i = n; i > 0; i--) rim.push(ids[n * (n + 1) + i]);
      for (let j = n; j > 0; j--) rim.push(ids[j * (n + 1)]);
      const centre = points.length / 3;
      points.push(N[0], N[1], N[2]);
      for (let k = 0; k < rim.length; k++) fan.push(centre, rim[k], rim[(k + 1) % rim.length]);
      continue;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = j * (n + 1) + i;
      quads.push(ids[o], ids[o + 1], ids[o + n + 2], ids[o + n + 1]);
    }
  }
  return { points, quads, fan };
}

/** A boulder form and the per-vertex facts its tone law reads. */
export interface BoulderForm {
  geometry: THREE.BufferGeometry;
  /** 0 on a joint face, rising over an arris (one less the largest plane's share). */
  edge: Float32Array;
  /** The later fractures' share (fresh faces). */
  fresh: Float32Array;
  /** The faces' own tone offsets (-1..1), blended over the arrises. */
  facet: Float32Array;
}

/** The ground line in the form's unit space: above it the form keeps inside the legacy hull. */
export const BOULDER_SEAT_Y = 0;

export function buildBoulderForm(
  variant: number, noise: SimplexNoise, rng: () => number, hull: readonly number[], subdiv = 6, topY = 0,
  kindIndex = variant % BOULDER_KINDS.length,
): BoulderForm {
  const kind = BOULDER_KINDS[kindIndex];
  const [sx, sy, sz] = kind.size;
  const planes = jointPlanes(kind, rng);
  const tones = planes.map(() => rng() * 2 - 1);
  const salt = variant * 11.3 + rng() * 40;
  const [lumpA, lumpB] = kind.lumps;
  const out = [0, 0, 0];
  /** The weathered surface along a unit direction (the joint surface lumped, its foot flared), in the kind's units. */
  const surface = (ux: number, uy: number, uz: number, weights: Float64Array | null): number[] => {
    const t = jointRadius(planes, kind.round, ux, uy, uz, weights);
    let x = ux * t, y = uy * t, z = uz * t;
    const f = 1 + noise.noise3d(x * 1.7 + salt, y * 1.7, z * 1.7 - salt) * lumpA + noise.noise3d(x * 4.3 - salt, y * 4.3 + salt, z * 4.3) * lumpB;
    x *= f; y *= f; z *= f;
    const q = clamp(-y / (0.45 * sy), 0, 1), foot = 1 + q * q * (3 - 2 * q) * 0.05;
    out[0] = x * foot; out[1] = y; out[2] = z * foot;
    return out;
  };
  const { points, quads, fan } = cubeGrid(Math.max(2, subdiv));
  const count = points.length / 3;
  // the directions: columns crowded toward the cube's edges (where the frame's arrises fall) and rows upward (the
  // ground cuts the lower half), aimed at the kind's ellipsoid
  const dirs = new Float64Array(count * 3);
  const edgeward = (t: number): number => 0.5 * t + 0.5 * Math.sin((t * Math.PI) / 2);
  for (let v = 0; v < count; v++) {
    const ux = edgeward(points[v * 3]) * sx, uy = (-1 + 2 * Math.pow((points[v * 3 + 1] + 1) / 2, 0.62)) * sy, uz = edgeward(points[v * 3 + 2]) * sz;
    const ul = Math.hypot(ux, uy, uz);
    dirs[v * 3] = ux / ul; dirs[v * 3 + 1] = uy / ul; dirs[v * 3 + 2] = uz / ul;
  }
  // the fit: as tall as the legacy rock (its collider's cover), and inside the legacy hull above the ground line
  const edge = new Float32Array(count), fresh = new Float32Array(count), facet = new Float32Array(count);
  const weights = new Float64Array(planes.length);
  const raw = new Float64Array(count * 3);
  let top = -Infinity;
  for (let v = 0; v < count; v++) {
    const p = surface(dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2], weights);
    raw[v * 3] = p[0]; raw[v * 3 + 1] = p[1]; raw[v * 3 + 2] = p[2];
    top = Math.max(top, p[1]);
    let largest = 0, chip = 0, tone = 0;
    for (let i = 0; i < planes.length; i++) { largest = Math.max(largest, weights[i]); chip += weights[i] * planes[i][4]; tone += weights[i] * tones[i]; }
    edge[v] = 1 - largest; fresh[v] = chip; facet[v] = tone;
  }
  const ky = topY > 0 && top > 0 ? (topY * 0.98) / top : 1;
  let kx = Infinity;
  for (let v = 0; v < count; v++) {
    if (raw[v * 3 + 1] * ky < BOULDER_SEAT_Y) continue;
    const x = raw[v * 3], z = raw[v * 3 + 2], r = Math.hypot(x, z);
    if (r > 1e-6) kx = Math.min(kx, (hullRadiusAt(hull, x / r, z / r) * 0.985) / r);
  }
  if (!Number.isFinite(kx)) kx = 1;
  // the girth at the ground line, round the rock: under it the sides go straight down (or a little out), never curving
  // back under, so a slope's downhill side bares a buried flank and not an undercut a boulder seems to float on
  const GIRTH = 72, girth = new Float64Array(GIRTH);
  for (let j = 0; j < GIRTH; j++) {
    const theta = (j / GIRTH) * Math.PI * 2, c = Math.cos(theta), sn = Math.sin(theta);
    let lo = -1.3, hi = 1.3;
    for (let it = 0; it < 26; it++) {
      const e = (lo + hi) / 2, q = surface(Math.cos(e) * c, Math.sin(e), Math.cos(e) * sn, null);
      if (q[1] > 0) hi = e; else lo = e;
    }
    const e = (lo + hi) / 2, q = surface(Math.cos(e) * c, Math.sin(e), Math.cos(e) * sn, null);
    girth[j] = Math.hypot(q[0], q[2]);
  }
  const girthAt = (x: number, z: number): number => {
    const t = ((Math.atan2(z, x) / (Math.PI * 2) + 1) % 1) * GIRTH, j = Math.floor(t) % GIRTH, f = t - Math.floor(t);
    return girth[j] + (girth[(j + 1) % GIRTH] - girth[j]) * f;
  };
  /** The fitted surface: scaled into the hull; under the ground line the stone keeps its girth and is held softly to
   * the hull (a few per cent over it where a slope's downhill side can bare it, more deeper down), so a hull never meets
   * a rock it can't see. */
  const fitted = (ux: number, uy: number, uz: number): number[] => {
    const p = surface(ux, uy, uz, null);
    if (p[1] < 0) {
      const r0 = Math.hypot(p[0], p[2]);
      if (r0 > 1e-6) {
        const q = clamp(-p[1] / (0.12 * sy), 0, 1), w = q * q * (3 - 2 * q);
        const k = (r0 + (Math.max(r0, girthAt(p[0], p[2])) - r0) * w) / r0;
        p[0] *= k; p[2] *= k;
      }
    }
    const x = p[0] * kx, y = p[1] * ky, z = p[2] * kx;
    out[1] = y;
    const r = Math.hypot(x, z);
    if (y >= BOULDER_SEAT_Y || r < 1e-6) { out[0] = x; out[2] = z; return out; }
    const deep = clamp((-y - 0.4) / 0.3, 0, 1);
    const limit = hullRadiusAt(hull, x / r, z / r) * (1.03 + 0.12 * deep * deep * (3 - 2 * deep));
    const soft = 0.04 * limit, k = (limit - soft * Math.log(1 + Math.exp((limit - r) / soft))) / r; // a smooth min(r, limit)
    out[0] = x * k; out[2] = z * k;
    return out;
  };
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  // the normals are the fitted surface's own, averaged over a third of a grid cell either side: an arris narrower than
  // the mesh can follow shades as one a cell wide instead of flickering between the faces from vertex to vertex
  const eps = (Math.PI / 2 / Math.max(2, subdiv)) * 0.35;
  for (let v = 0; v < count; v++) {
    const ux = dirs[v * 3], uy = dirs[v * 3 + 1], uz = dirs[v * 3 + 2];
    const p = fitted(ux, uy, uz);
    pos[v * 3] = p[0]; pos[v * 3 + 1] = p[1]; pos[v * 3 + 2] = p[2];
    const ax = Math.abs(uy) < 0.9 ? 0 : 1, ay = Math.abs(uy) < 0.9 ? 1 : 0;
    let t1x = ay * uz, t1y = -ax * uz, t1z = ax * uy - ay * ux;
    const t1l = Math.hypot(t1x, t1y, t1z); t1x /= t1l; t1y /= t1l; t1z /= t1l;
    const t2x = uy * t1z - uz * t1y, t2y = uz * t1x - ux * t1z, t2z = ux * t1y - uy * t1x;
    const at = (a: number, b: number): number[] => {
      const dx = ux + a * t1x + b * t2x, dy = uy + a * t1y + b * t2y, dz = uz + a * t1z + b * t2z, dl = Math.hypot(dx, dy, dz);
      return fitted(dx / dl, dy / dl, dz / dl).slice();
    };
    const p1 = at(eps, 0), m1 = at(-eps, 0), p2 = at(0, eps), m2 = at(0, -eps);
    const ex = p1[0] - m1[0], ey = p1[1] - m1[1], ez = p1[2] - m1[2], fx = p2[0] - m2[0], fy = p2[1] - m2[1], fz = p2[2] - m2[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    if (nx * ux + ny * uy + nz * uz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const nl = Math.hypot(nx, ny, nz) || 1;
    nor[v * 3] = nx / nl; nor[v * 3 + 1] = ny / nl; nor[v * 3 + 2] = nz / nl;
  }
  // each quad split along the diagonal whose ends shade alike (the other diagonal would carry a seam of light)
  const index: number[] = [];
  const dot = (a: number, b: number): number => nor[a * 3] * nor[b * 3] + nor[a * 3 + 1] * nor[b * 3 + 1] + nor[a * 3 + 2] * nor[b * 3 + 2];
  for (let q = 0; q < quads.length; q += 4) {
    const a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
    if (dot(a, c) >= dot(b, d)) index.push(a, b, c, a, c, d);
    else index.push(a, b, d, b, c, d);
  }
  index.push(...fan);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setIndex(index);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, edge, fresh, facet };
}

/**
 * The boulder's vertex tone: the map's rock tone over a weathered grey, the joint faces each a shade of their own, the
 * fresh fractures paler and greyer, the arrises a little paler (worn), the upward faces taking the map's cap tone harder.
 * Linear RGB in a 'color' attribute.
 */
export function paintBoulder(form: BoulderForm, tone: ToneFunction | null | undefined): void {
  const g = form.geometry, p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const up = clamp(n.getY(i), 0, 1), worn = clamp(form.edge[i] * 1.6, 0, 1), fresh = clamp(form.fresh[i], 0, 1);
    const l = 0.28 + p.getY(i) * 0.04 + up * up * 0.1 + form.facet[i] * 0.025 + fresh * 0.05 + worn * 0.035;
    let h = 0.09 + form.facet[i] * 0.008, s = 0.07 * (1 - fresh * 0.45), lt = clamp(l, 0.15, 0.5);
    if (tone) { const t = tone(h, s, lt); h = t[0]; s = t[1]; lt = clamp(t[2], 0, 1); }
    _soil.setHSL(h, s, clamp(lt * (0.86 + up * 0.22), 0, 1), THREE.SRGBColorSpace);
    col[i * 3] = _soil.r; col[i * 3 + 1] = _soil.g; col[i * 3 + 2] = _soil.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** True when every vertex of the geometry projects inside (or onto) the convex hull, an XZ polygon as [x, z, ...]. */
export function projectsInsideHull(geometry: THREE.BufferGeometry, hull: readonly number[], tolerance = 1e-4): boolean {
  const p = geometry.attributes.position;
  const count = hull.length / 2;
  // the hull is counter-clockwise from convexHull2 (monotone chain); a point is inside when it is left of (or on) every edge
  let orientation = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count, k = (i + 2) % count;
    orientation += (hull[j * 2] - hull[i * 2]) * (hull[k * 2 + 1] - hull[j * 2 + 1]) - (hull[j * 2 + 1] - hull[i * 2 + 1]) * (hull[k * 2] - hull[j * 2]);
  }
  const sign = orientation >= 0 ? 1 : -1;
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v), z = p.getZ(v);
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const cross = (hull[j * 2] - hull[i * 2]) * (z - hull[i * 2 + 1]) - (hull[j * 2 + 1] - hull[i * 2 + 1]) * (x - hull[i * 2]);
      if (cross * sign < -tolerance) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------- the tiles

interface RockDetailSlice { fine: true; stage: string }

export interface RockDetailTextures {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  surface: THREE.CanvasTexture;
  /** The lichen colonies: red, a coverage rank (a cover c takes the texels above 1 - c); green, the colony's species roll. */
  lichen: THREE.CanvasTexture;
}

function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }

/** An integer hash to [0, 1). */
function hash3(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable cellular noise: n x n jittered points over the unit tile; the nearest two distances (in cells) and the nearest's cell. */
function cellular(u: number, v: number, n: number, salt: number, out: { d1: number; d2: number; id: number }): void {
  const x = u * n, y = v * n, cx = Math.floor(x), cy = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j, wx = ((gx % n) + n) % n, wy = ((gy % n) + n) % n;
    const px = gx + hash3(wx, wy, salt), py = gy + hash3(wx, wy, salt + 1);
    const d = Math.hypot(x - px, y - py);
    if (d < d1) { d2 = d1; d1 = d; id = wy * n + wx; } else if (d < d2) d2 = d;
  }
  out.d1 = d1; out.d2 = d2; out.id = id;
}

/**
 * The map's 256 px tileable rock tile: its lithology's grain over a granular ground and the fracture lines — granite's
 * speckle of dark mica and pale feldspar, gneiss's foliation bands, sandstone's laminae, limestone's solution pits,
 * slate's cleavage streaks, basalt's vesicles — near-white luminance so the vertex tone stays the rock's colour; the
 * ORM packs occlusion in the lines and pits. And the lichen colony tile. Sixteen rows a checkpoint.
 */
export function* makeRockDetail(
  noi: SimplexNoise, anisotropy: number, lithology: BoulderLithology = 'granite',
): Generator<RockDetailSlice, RockDetailTextures, void> {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), orm = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const lichenRank = new Float32Array(s * s), lichenId = new Float32Array(s * s);
  const cell = { d1: 0, d2: 0, id: 0 }, colony = { d1: 0, d2: 0, id: 0 };
  const lineWeight = { granite: 0.75, gneiss: 0.6, sandstone: 0.55, limestone: 0.8, slate: 0.6, basalt: 0.7 }[lithology];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = (x + 0.5) / s, v = (y + 0.5) / s, i = y * s + x, j = i * 4;
      const lines = (Math.pow(1 - Math.abs(tileableTorusNoise(noi, u, v, 3, 3, 211)), 6) * 0.7
        + Math.pow(1 - Math.abs(tileableTorusNoise(noi, u, v, 7, 7, 223)), 8) * 0.5) * lineWeight;
      const grain = tileableTorusNoise(noi, u, v, 19, 19, 239) * 0.5 + 0.5;
      const flake = tileableTorusNoise(noi, u, v, 41, 41, 251) * 0.5 + 0.5;
      let lum = 0.78 + grain * 0.14 + flake * 0.06 - lines * 0.42;
      let height = 0.62 + grain * 0.22 + flake * 0.1 - lines * 0.5;
      if (lithology === 'granite' || lithology === 'gneiss') {
        // the crystals: dark mica and hornblende, pale feldspar and quartz, a fine dark seam between grains
        cellular(u, v, lithology === 'granite' ? 56 : 72, 401, cell);
        const roll = hash3(cell.id, 7, 409);
        lum += roll < (lithology === 'granite' ? 0.13 : 0.2) ? -0.3 : roll > 0.62 ? 0.07 : 0;
        lum -= (1 - clamp((cell.d2 - cell.d1) / 0.12, 0, 1)) * 0.05;
        height += roll > 0.62 ? 0.04 : 0;
        if (lithology === 'gneiss') {
          // the foliation: light and dark bands, wavy, a few to the tile
          const band = Math.sin((v * 7 + tileableTorusNoise(noi, u, v, 2, 2, 419) * 0.35) * Math.PI * 2);
          lum += Math.sign(band) * Math.pow(Math.abs(band), 0.5) * 0.09;
        }
      } else if (lithology === 'sandstone') {
        // the laminae: fine parallel lines, their set's angle swinging (cross-bedding), on a fine sand grain
        const lam = (v * 28 + u * 3 * tileableTorusNoise(noi, u, v, 1, 2, 431) + tileableTorusNoise(noi, u, v, 3, 3, 433) * 0.3) % 1;
        lum -= (1 - clamp(((lam + 1) % 1) / 0.14, 0, 1)) * 0.07;
        const sand = tileableTorusNoise(noi, u, v, 61, 61, 439) * 0.5 + 0.5;
        lum += (sand - 0.5) * 0.08;
        height += (sand - 0.5) * 0.06;
      } else if (lithology === 'limestone' || lithology === 'basalt') {
        // limestone's solution pits, basalt's gas vesicles: small dark round hollows
        const basalt = lithology === 'basalt';
        cellular(u, v, basalt ? 44 : 26, 443, cell);
        const pit = hash3(cell.id, 3, 449) < (basalt ? 0.45 : 0.3) ? 1 - clamp((cell.d1 - (basalt ? 0.14 : 0.11)) / 0.06, 0, 1) : 0;
        lum -= pit * (basalt ? 0.36 : 0.3);
        height -= pit * 0.45;
        if (!basalt) lum += (grain - 0.5) * -0.06; // smoother than the rest
      } else {
        // slate: the cleavage streaks, close and parallel
        const streak = tileableTorusNoise(noi, u, v, 2, 70, 457);
        lum += streak * 0.08;
        height += streak * 0.12;
      }
      lum = clamp(lum, 0.2, 1);
      height = clamp(height, 0, 1);
      const value = lum * 255;
      px[j] = value; px[j + 1] = value; px[j + 2] = value; px[j + 3] = 255;
      orm[j] = clamp(0.62 + height * 0.38, 0, 1) * 255;
      orm[j + 1] = clamp(0.8 + (1 - height) * 0.18, 0, 1) * 255;
      orm[j + 2] = 0;
      orm[j + 3] = 255;
      hgt[i] = height;
      // the lichen colonies: lobed discs, a scatter of large ones and of small satellites; each texel's priority falls
      // from its colony's own toward the rim, so a growing cover grows every colony outward from its centre
      let best = 0, bestId = 0;
      for (const [n, salt, r0, r1, weight] of [[8, 461, 0.32, 0.4, 1], [20, 467, 0.26, 0.14, 0.55]] as const) {
        cellular(u, v, n, salt, colony);
        const roll = hash3(colony.id, 11, salt + 2);
        const cx = colony.id % n, cy = (colony.id / n) | 0;
        const ax = (cx + hash3(cx, cy, salt)) / n, ay = (cy + hash3(cx, cy, salt + 1)) / n;
        let dx = u - ax, dy = v - ay;
        dx -= Math.round(dx); dy -= Math.round(dy);
        const lobes = 1 + 0.16 * Math.sin(Math.atan2(dy, dx) * 5 + roll * 40) + 0.08 * Math.sin(Math.atan2(dy, dx) * 9 + roll * 17);
        const r = (r0 + r1 * roll) * lobes;
        const q = colony.d1 / r;
        if (q >= 1) continue;
        const priority = (0.2 + 0.8 * hash3(colony.id, 13, salt + 3)) * (1 - q * q) * weight;
        if (priority > best) { best = priority; bestId = hash3(colony.id, 17, salt + 4); }
      }
      lichenRank[i] = best; lichenId[i] = bestId;
    }
    if ((y + 1) % 16 === 0) yield { fine: true, stage: `rock-rows-${y + 1}` };
  }
  // rank the colony texels: a texel's value is one less the share of the tile at or above its priority, so a cover c
  // takes exactly the top c of the tile (the colony-free texels stay at zero and are never taken below their share)
  const order = Array.from(lichenRank.keys()).filter((i) => lichenRank[i] > 0).sort((a, b) => lichenRank[a] - lichenRank[b]);
  const lich = new Uint8ClampedArray(s * s * 4);
  for (let k = 0; k < order.length; k++) lich[order[k] * 4] = Math.round((1 - (order.length - k) / (s * s)) * 255);
  for (let i = 0; i < s * s; i++) { lich[i * 4 + 1] = Math.round(lichenId[i] * 255); lich[i * 4 + 3] = 255; }
  return {
    albedo: textureFromRgbaPixels(px, s, { srgb: true, anisotropy }),
    normal: normalTextureFromHeight(hgt, s, 0.5, anisotropy),
    surface: textureFromRgbaPixels(orm, s, { anisotropy }),
    lichen: textureFromRgbaPixels(lich, s, { anisotropy }),
  };
}

// ---------------------------------------------------------------------------------------------- the shader hook

interface RockShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

function mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/rockDressing: shader anchor missing: ${anchor}`);
  return out;
}

/**
 * Patch the rock material's program after the props grime hook (which supplies vGrimeW / vGrimeN and uGrime): the
 * instance's ground height rides an instanced attribute, the detail tile is sampled triplanar in world space, and the
 * map's laws blend on top of the vertex tone. On the instanced boulders only (vRockSeed >= 0; the merged formations,
 * nests and works carry their own laws in their vertex tones): the beds in each rock's own frame and tilt, the desert
 * varnish, the lichen colonies of the climate and the contact darkening where the stone meets the ground.
 */
export function applyRockShaderHook(shader: RockShader, dressing: RockDressing, lichenTile: THREE.Texture | null = null): void {
  shader.uniforms.uRockMoss = { value: dressing.moss };
  shader.uniforms.uRockDust = { value: dressing.dust };
  shader.uniforms.uRockSoil = { value: new THREE.Vector3(...dressing.soil) };
  shader.uniforms.uRockBeds = { value: new THREE.Vector4(...dressing.beds) };
  shader.uniforms.uRockLichen = { value: new THREE.Vector3(lichenTile ? dressing.lichen[0] : 0, dressing.lichen[1], dressing.lichen[2]) };
  shader.uniforms.uRockLichenA = { value: new THREE.Vector3(...dressing.lichenA) };
  shader.uniforms.uRockLichenB = { value: new THREE.Vector3(...dressing.lichenB) };
  shader.uniforms.uRockVarnish = { value: dressing.varnish };
  shader.uniforms.uRockLichenTile = { value: lichenTile };
  shader.vertexShader = mustReplace(shader.vertexShader, 'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;',
    'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nattribute float aRockGround;\nvarying float vRockAbove;\nvarying float vRockSeed;\nvarying float vRockBed;\nuniform vec4 uRockBeds;');
  shader.vertexShader = mustReplace(shader.vertexShader, '  vGrimeN = normalize(mat3(modelMatrix) * gn);\n}', /* glsl */`  vGrimeN = normalize(mat3(modelMatrix) * gn);
  vRockAbove = vGrimeW.y - aRockGround;
  vRockSeed = -1.0;
  vRockBed = 0.0;
  #ifdef USE_INSTANCING
  {
    // the boulder's own frame: its hash, and its beds tilted and turned by it
    vec3 rockScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vRockSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    float rockBedAz = vRockSeed * 6.2832, rockBedTilt = uRockBeds.z * fract(vRockSeed * 7.13);
    vec3 rockBedN = vec3(sin(rockBedTilt) * cos(rockBedAz), cos(rockBedTilt), sin(rockBedTilt) * sin(rockBedAz));
    vRockBed = dot(transformed * rockScale, rockBedN) / uRockBeds.y + vRockSeed * 31.0;
  }
  #endif
}`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, 'uniform sampler2D uGrime;', `uniform sampler2D uGrime;
varying float vRockAbove;
varying float vRockSeed;
varying float vRockBed;
uniform float uRockMoss;
uniform float uRockDust;
uniform vec3 uRockSoil;
uniform vec4 uRockBeds;
uniform vec3 uRockLichen;
uniform vec3 uRockLichenA;
uniform vec3 uRockLichenB;
uniform float uRockVarnish;
uniform sampler2D uRockLichenTile;`);
  // the triplanar detail multiplies in the map slot (order-free); the laws mix after the vertex tone has multiplied
  // (three's color_fragment), so they are the final colour, not a tint under it
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`
vec3 rockTw = abs(vGrimeN); rockTw = rockTw * rockTw * rockTw * rockTw; rockTw /= max(1e-4, rockTw.x + rockTw.y + rockTw.z);
vec3 rockPw = vGrimeW * 0.62;
float rockDetail = 0.8;
float rockParting = 0.0;
#ifdef USE_MAP
rockDetail = texture2D(map, rockPw.yz).r * rockTw.x + texture2D(map, rockPw.xz).r * rockTw.y + texture2D(map, rockPw.xy).r * rockTw.z;
diffuseColor.rgb *= 0.42 + 0.66 * rockDetail;
#endif`);
  // the normal tile, triplanar in world space: three's tangent frame (normal_fragment_maps) divides by the UV
  // derivatives, which are zero on a mesh without UVs, so its chunk is replaced outright; a boulder's bed partings
  // recess a few millimetres (a bump from their screen derivatives)
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>', /* glsl */`
#ifdef USE_NORMALMAP
{
  vec3 rockTx = texture2D(normalMap, rockPw.yz).xyz * 2.0 - 1.0;
  vec3 rockTy = texture2D(normalMap, rockPw.xz).xyz * 2.0 - 1.0;
  vec3 rockTz = texture2D(normalMap, rockPw.xy).xyz * 2.0 - 1.0;
  vec3 rockPert = vec3(0.0, rockTx.x, rockTx.y) * rockTw.x + vec3(rockTy.x, 0.0, rockTy.y) * rockTw.y + vec3(rockTz.x, rockTz.y, 0.0) * rockTw.z;
  vec3 rockN = normalize(normalize(vGrimeN) + rockPert * 0.55);
  if (vRockSeed >= 0.0 && uRockBeds.x > 0.0) {
    vec3 rockDx = dFdx(vGrimeW), rockDy = dFdy(vGrimeW);
    float rockHx = dFdx(rockParting) * -0.004, rockHy = dFdy(rockParting) * -0.004;
    vec3 rockR1 = cross(rockDy, rockN), rockR2 = cross(rockN, rockDx);
    float rockDet = dot(rockDx, rockR1);
    vec3 rockGrad = sign(rockDet) * (rockHx * rockR1 + rockHy * rockR2);
    rockN = normalize(abs(rockDet) * rockN - rockGrad * uRockBeds.x);
  }
  normal = normalize((viewMatrix * vec4(rockN, 0.0)).xyz);
}
#endif`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <color_fragment>', /* glsl */`#include <color_fragment>
{
  if (vRockSeed >= 0.0) {
    // the beds (sandstone, limestone; gneiss foliation, slate cleavage): planes through the boulder in its own frame,
    // each bed a shade of its own, the partings dark; beds finer than a pixel or two fade to their mean
    if (uRockBeds.x > 0.0) {
      float bedC = vRockBed + (texture2D(uGrime, vGrimeW.xz * 0.09 + vGrimeW.y * 0.03).b - 0.5) * 0.7;
      bedC += 0.3 * sin(bedC * 2.1 + vRockSeed * 9.0); // beds of unequal thickness
      float bedW = fwidth(bedC);
      float bedFade = 1.0 - smoothstep(0.3, 0.7, bedW);
      float bedHash = fract(sin(floor(bedC) * 91.17 + vRockSeed * 311.7) * 43758.5453);
      float bedF = fract(bedC), bedPw = max(0.06, bedW * 1.5);
      rockParting = min(1.0, (1.0 - smoothstep(0.0, bedPw, bedF)) + smoothstep(1.0 - bedPw, 1.0, bedF)) * bedFade;
      // a bed's own shade and a little of its own hue (iron-stained, bleached)
      vec3 bedTint = mix(vec3(0.66, 0.64, 0.62), vec3(1.24, 1.2, 1.12), bedHash) * mix(vec3(1.06, 0.98, 0.9), vec3(0.96, 1.0, 1.04), fract(bedHash * 5.3));
      diffuseColor.rgb *= mix(vec3(1.0), bedTint * (1.0 - rockParting * uRockBeds.w), uRockBeds.x * bedFade);
    }
    // desert varnish: a dark patina run down the exposed faces from their brows
    if (uRockVarnish > 0.0) {
      float runs = texture2D(uGrime, vec2((vGrimeW.x + vGrimeW.z) * 0.7, vGrimeW.y * 0.05)).g;
      float varnish = uRockVarnish * smoothstep(0.45, 0.75, runs) * (1.0 - abs(vGrimeN.y)) * smoothstep(0.15, 0.7, vRockAbove);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.35, 0.3), varnish);
    }
    // the lichen: colonies of the climate's two species on the tops and the upper faces, clear of the soil (on a snowy
    // map only the steep faces the snow leaves bare); a colony finer than the pixel keeps its share as a tint
    if (uRockLichen.x > 0.0) {
      vec3 lPw = vGrimeW * 0.7 + vRockSeed * 3.7;
      vec2 lc = texture2D(uRockLichenTile, lPw.yz).rg * rockTw.x + texture2D(uRockLichenTile, lPw.xz).rg * rockTw.y + texture2D(uRockLichenTile, lPw.xy).rg * rockTw.z;
      float exposed = smoothstep(-0.1, 0.75, vGrimeN.y) * smoothstep(0.22, 0.6, vRockAbove) * (1.0 - uRockLichen.z * smoothstep(0.4, 0.72, vGrimeN.y));
      float clump = smoothstep(0.3, 0.72, texture2D(uGrime, vGrimeW.xz * 0.33 + vGrimeW.y * 0.21 + vRockSeed).r);
      float cover = uRockLichen.x * exposed * (0.3 + 1.2 * fract(vRockSeed * 3.31)) * (0.25 + 1.5 * clump);
      float edge = 0.03 + length(fwidth(lPw)) * 2.0;
      float lichen = smoothstep(1.0 - cover - edge, 1.0 - cover + edge, lc.x);
      vec3 lichenColor = mix(uRockLichenB, uRockLichenA, step(lc.y, uRockLichen.y)) * (0.72 + 0.3 * rockDetail);
      diffuseColor.rgb = mix(diffuseColor.rgb, lichenColor, lichen * (0.38 + 0.3 * fract(lc.y * 7.0)));
    }
  }
  // a snow map's boulders carry the snow on their tops and shelves, laid after their tone (the grime hook's snow lies
  // under the vertex tone, which a dark stone would darken away)
  if (vRockSeed >= 0.0 && uRockLichen.z > 0.5) {
    float rockSnowN = texture2D(uGrime, vGrimeW.xz * 0.23 + vec2(0.41, 0.17)).r;
    float rockSnow = smoothstep(0.5, 0.78, vGrimeN.y + (rockSnowN - 0.5) * 0.3) * (0.75 + 0.25 * texture2D(uGrime, vGrimeW.xz * 0.05).g);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.795, 0.835, 0.90), rockSnow * 0.9);
  }
  // moss on the shaded side and the tops of wet maps, in the tile's grain
  vec2 flank = normalize(vGrimeN.xz + vec2(1e-4, 0.0));
  float shaded = 0.5 - 0.5 * dot(flank, vec2(0.55, -0.83));
  // (gauntlet wave 29, Saltmere Bay's tor: "near-black slabs": the moss keeps to the damp ground a metre or two up; a
  // tall rock's tops dry in the wind and carry the lichen its own tone paints, not moss)
  float mossMask = uRockMoss * smoothstep(0.15, 0.85, shaded * 0.6 + max(0.0, vGrimeN.y) * 0.7)
    * smoothstep(0.32, 0.72, texture2D(uGrime, vGrimeW.xz * 0.55 + vGrimeW.y * 0.31).g)
    * (1.0 - 0.75 * smoothstep(0.9, 2.6, vRockAbove));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.23, 0.09) * (0.6 + 0.7 * rockDetail), mossMask * 0.85);
  // dust: a pale cap on the upward faces and a skirt at the base of arid maps
  float dustMask = uRockDust * (0.4 * smoothstep(0.35, 0.9, vGrimeN.y) + 0.6 * (1.0 - smoothstep(0.0, 1.1, vRockAbove)));
  diffuseColor.rgb = mix(diffuseColor.rgb, uRockSoil * 1.35, dustMask * 0.65);
  // the base sits in the ground: soil climbs the lower third of a metre, broken by the grime field
  float soilMask = (1.0 - smoothstep(-0.12, 0.34, vRockAbove)) * (0.55 + 0.45 * texture2D(uGrime, vGrimeW.xz * 1.3).r);
  diffuseColor.rgb = mix(diffuseColor.rgb, uRockSoil, soilMask * 0.92);
  // and a boulder darkens where it meets the ground (the occlusion of the turf and the soil round its foot)
  if (vRockSeed >= 0.0) diffuseColor.rgb *= 0.6 + 0.4 * smoothstep(-0.04, 0.3, vRockAbove);
}`);
}
