// Round 75, item 6 (integrator, deploy-100 Verdant hull-side frame), rebuilt by the scenery lane 2026-10-04 (gauntlet
// wave 52: the boulders were "low-poly frustums, chamfered boxes or polyhedra … all under one even noise texture and
// none sunk into the ground"; wave 57: "a bar-of-soap form", "confetti" lichen, "no soil collar"; wave 66: the hard-cut
// forms "machined", and "the same orange-peel bump texture on every facet", whatever the form).
// This module owns the boulders' look: their forms (weathered masses, the smooth maximum of their joints broken up by
// the weather at three scales, at most one blended fracture: buildBoulderForm), their tone by face, fracture, arris and
// hollow (paintBoulder), the per-map dressing (the map's rock — its lithology and how the photographed stone reads on
// it — the lichen of its climate in colonies on the tops and the weather side, moss on the shaded faces of wet maps, a
// dust cap and desert varnish on arid maps, a soil band and contact darkening at the ground line everywhere, on each
// rock's own ground plane so a slope is met all round), the generated tiles (the photographed stone's procedural
// stand-in, a 256 px tile of the map's lithology, triplanar — no UVs on a boulder — and a lichen colony tile), and the
// shader hook. The stone itself is the terrain's own rock photograph (sourcedTextures.ts applySourcedRock), swapped
// into the stand-in's textures when it loads. The legacy rocks' projected hulls stay the collision proxies: the visual
// rock lies inside the hull the dedicated shards already carry and no record moves. Renderer-free apart from the
// texture helpers; Node-runnable.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { normalTextureFromHeight, textureFromRgbaPixels, tileableTorusNoise } from './proceduralTexture.ts';

type ToneFunction = (hue: number, saturation: number, lightness: number) => readonly [number, number, number];

/** The rock a battlefield's boulders are made of: what their forms and their detail tile draw. */
type BoulderLithology = 'granite' | 'gneiss' | 'sandstone' | 'limestone' | 'slate' | 'basalt' | 'chalk';

export interface RockDressing {
  /** Moss / lichen weight on the shaded and upward faces (0 on snow and arid maps). */
  moss: number;
  /** Dust cap and skirt weight (arid maps). */
  dust: number;
  /** Linear soil colour the base blends toward (the map's dirt tone). */
  soil: readonly [number, number, number];
  lithology: BoulderLithology;
  /** The lichen: cover of the exposed faces, the share of the first species, 1 where snow lies on the tops. */
  lichen: readonly [number, number, number];
  /** The two species' linear colours. */
  lichenA: readonly [number, number, number];
  lichenB: readonly [number, number, number];
  /** Desert varnish on the exposed faces (arid maps). */
  varnish: number;
  /** The photographed stone's treatment for the lithology: its contrast, its colour's share, its relief's strength. */
  photo: readonly [number, number, number];
  /** The lithology's own surface: its flint nodules, its weathered grey rind, the soil's stain up its foot. */
  surface: readonly [number, number, number];
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
  // (wave 57: Prokhorovka lies south of the glacial limit, so no erratic boulders; its exposed rock is the Cretaceous
  // chalk of the Belogorye — white blocks and outcrops, a little moss, the grey and orange lichens of calcareous stone)
  verdant: { moss: 0.6, dust: 0, lith: 'chalk', lichen: [0.16, GREY_GREEN, ORANGE, 0.7] },
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

/**
 * How the photographed stone (the terrain's Rock058, normalised to a mid grey) reads on each lithology: its contrast
 * about the vertex tone, how much of its own colour (the iron seams) it keeps, and the strength of its relief. The
 * crystalline rocks take it whole, the bedded ones softer, the chalk barely (a soft, porous, pale stone).
 */
const LITHOLOGY_PHOTO: Readonly<Record<BoulderLithology, readonly [number, number, number]>> = Object.freeze({
  granite: [1.25, 0.7, 1.0],
  gneiss: [1.2, 0.6, 1.0],
  basalt: [1.1, 0.25, 0.9],
  sandstone: [0.9, 0.5, 0.8],
  limestone: [0.75, 0.3, 0.7],
  slate: [1.0, 0.3, 0.9],
  // (b12, wave 74: the chalk read as "a white marshmallow, a fleece or a snow heap" — a pale stone, but a rough one: pitted,
  // fractured, its relief as strong as the limestone's)
  chalk: [0.8, 0.15, 0.9],
});

/**
 * The lithologies' own surfaces (b12): the flint nodules in the chalk's bands, the weathered grey rind of the soft
 * carbonate stones (algae, soot and the lichen's crust on a pale stone), and the soil's stain up a pale block's foot.
 */
const LITHOLOGY_SURFACE: Readonly<Record<BoulderLithology, readonly [number, number, number]>> = Object.freeze({
  granite: [0, 0, 0],
  gneiss: [0, 0, 0],
  basalt: [0, 0, 0],
  sandstone: [0, 0, 0],
  limestone: [0, 0.35, 0.5],
  slate: [0, 0, 0],
  chalk: [1, 0.6, 1],
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
    lithology: climate.lith,
    lichen: [cover, split, snowCap ? 1 : 0], lichenA: linearOf(a), lichenB: linearOf(b),
    varnish: climate.varnish ?? 0,
    photo: LITHOLOGY_PHOTO[climate.lith],
    surface: LITHOLOGY_SURFACE[climate.lith],
  };
}

// ---------------------------------------------------------------------------------------------- geometry

/**
 * The boulders' forms (the scenery lane). Wave 52 read the first boulders as "low-poly frustums, chamfered boxes or
 * polyhedra"; wave 57 read b6's weathered masses as "a bar-of-soap form", "a rounded box with a pillow or loaf
 * silhouette"; wave 66 read the hard-cut blocks after them as "trapezoidal prisms", "gem-cut", machined. The forms
 * oscillated between soap and gems; the stone's micro-detail is the material's (the photographed rock the terrain
 * wears, rockDressing's hook), and the form is b6's weathered mass again: the smooth maximum of its joint planes'
 * signed distances (broad faces rounded into each other, never a crease), its joints out of square (no box, no loaf),
 * broken up by the weather at three scales — a broad lump that unbalances the silhouette, knobs and hollows, a grain
 * the normals carry — with at most one fracture, a shallow flat the same rounding blends into the mass. Its foot flares
 * a little under the ground line and its skirt runs deep, so a slope's downhill side bares a buried flank. The surface
 * is star-shaped about the centre, so it is meshed by casting a cube-sphere grid's directions at it (columns crowded
 * toward the arrises, rows above the ground line) and its normals are the surface's own (central differences of the
 * same function), each quad split along the diagonal whose ends shade alike. Fitted inside the legacy hull (the
 * collision footprint the shards carry) above the ground line and as tall as the legacy rock.
 */
export const BOULDER_KINDS = Object.freeze(['block', 'rounded', 'slab'] as const);
type BoulderKindName = (typeof BOULDER_KINDS)[number];

interface BoulderKindShape {
  /** Semi-axes (x, up, z) of the ellipsoid the joint planes circumscribe, before the hull fit. */
  readonly size: readonly [number, number, number];
  /** The smooth maximum's width over the joint planes (unit space): how broadly the weather rounds the arrises. */
  readonly round: number;
  /** The weathering's three scales, each a share of the radius: the broad lump, the knobs and hollows, the grain. */
  readonly lumps: readonly [number, number, number];
  /** The chance of the one fracture. */
  readonly chip: number;
}

const KIND_SHAPES: Readonly<Record<BoulderKindName, BoulderKindShape>> = Object.freeze({
  block: { size: [1.0, 0.8, 0.86], round: 0.1, lumps: [0.075, 0.03, 0.011], chip: 0.7 },
  rounded: { size: [0.98, 0.84, 0.9], round: 0.13, lumps: [0.09, 0.034, 0.012], chip: 0.5 },
  slab: { size: [1.05, 0.62, 0.92], round: 0.1, lumps: [0.06, 0.026, 0.01], chip: 0.6 },
});

/** The kinds a lithology's three variants take, and how broadly its weather rounds them (the chalk softest). */
const LITHOLOGY_FORMS: Readonly<Record<BoulderLithology, { kinds: readonly [BoulderKindName, BoulderKindName, BoulderKindName]; soft: number }>> = Object.freeze({
  granite: { kinds: ['block', 'rounded', 'slab'], soft: 1 },
  gneiss: { kinds: ['block', 'rounded', 'slab'], soft: 0.9 },
  basalt: { kinds: ['block', 'rounded', 'block'], soft: 0.85 },
  sandstone: { kinds: ['block', 'slab', 'block'], soft: 0.9 },
  limestone: { kinds: ['block', 'slab', 'rounded'], soft: 1 },
  slate: { kinds: ['slab', 'block', 'slab'], soft: 0.7 },
  // (b12: the marshmallow — two of three rounded, the softest weather — gives way to fractured blocks and a slab)
  chalk: { kinds: ['block', 'rounded', 'slab'], soft: 0.95 },
});

/** The kind (an index into BOULDER_KINDS) a map's variant is built as. */
export function boulderKindFor(lithology: BoulderLithology, variant: number): number {
  return BOULDER_KINDS.indexOf(LITHOLOGY_FORMS[lithology].kinds[variant % 3]);
}

/** A joint plane: outward unit normal, offset from the centre, and 1 for the fracture. */
type JointPlane = [nx: number, ny: number, nz: number, d: number, fresh: number];

/** The skirt's floor under the centre, a share of the kind's height: deep under any ground a slope bares. */
const BOULDER_FLOOR = 1.7;

/** The kind's joint planes: its frame, the floor, the fracture. Every draw from `rng`. */
function jointPlanes(kind: BoulderKindName, rng: () => number): JointPlane[] {
  const [sx, sy, sz] = KIND_SHAPES[kind].size;
  const planes: JointPlane[] = [];
  const jitter = (a: number): number => (rng() * 2 - 1) * a;
  const range = (lo: number, hi: number): number => lo + rng() * (hi - lo);
  const add = (x: number, y: number, z: number, depth: number, fresh = 0): void => {
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    // the ellipsoid's support along the normal, so a frame plane at depth 1 touches it
    planes.push([x, y, z, Math.sqrt((sx * x) ** 2 + (sy * y) ** 2 + (sz * z) ** 2) * depth, fresh]);
  };
  /** Azimuths round the circle as a random walk: no two joint sets square, so no box and no loaf. */
  const ring = (count: number): number[] => {
    const steps = Array.from({ length: count }, () => 0.55 + rng());
    const total = steps.reduce((p, q) => p + q, 0);
    let az = rng() * Math.PI * 2;
    return steps.map((step) => { const out = az; az += (step / total) * Math.PI * 2; return out; });
  };
  /** A joint round the side, leaning back (its face wider toward the ground). */
  const side = (az: number, lean: number, depth: number): void =>
    add(Math.cos(az) * Math.cos(lean), Math.sin(lean), Math.sin(az) * Math.cos(lean), depth);
  if (kind === 'block') {
    // a jointed block the weather rounded: a tilted top joint, five or six joints round it at their own leans, and a
    // shoulder or two breaking the top's rim
    add(jitter(0.22), 1, jitter(0.22), range(0.95, 1));
    for (const az of ring(5 + Math.floor(rng() * 2))) side(az, range(0.04, 0.28), range(0.92, 1.05));
    for (let k = 1 + Math.floor(rng() * 2); k > 0; k--) {
      const az = rng() * Math.PI * 2, e = range(0.45, 0.85);
      add(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az), range(0.9, 0.98));
    }
  } else if (kind === 'rounded') {
    // a corestone: a Fibonacci sphere's facets down to a little under its equator, jittered, weathered round (none
    // faces the ground: the skirt below runs down to the floor)
    const count = 14;
    for (let i = 0; i < count; i++) {
      const y = 1 - ((i + 0.5) / count) * 1.25, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + rng() * 0.6;
      add(Math.cos(a) * r + jitter(0.18), y + jitter(0.18), Math.sin(a) * r + jitter(0.18), range(0.9, 1));
    }
  } else {
    // a slab: a bed's top and a ring of steep joints leaning back
    add(jitter(0.1), 1, jitter(0.1), 1);
    for (const az of ring(6)) side(az, range(0.03, 0.22), range(0.93, 1.02));
  }
  planes.push([0, -1, 0, sy * BOULDER_FLOOR, 0]); // the floor, deep under every ground line
  // at most one fracture: a shallow flat across an upper corner, blended into the mass by the same rounding
  if (rng() < KIND_SHAPES[kind].chip) {
    const a = rng() * Math.PI * 2, e = range(0.3, 0.8);
    add(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a), range(0.87, 0.94), 1);
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
interface BoulderForm {
  geometry: THREE.BufferGeometry;
  /** 0 on a joint face, rising over an arris (one less the largest plane's share). */
  edge: Float32Array;
  /** The fracture's share. */
  fresh: Float32Array;
  /** The faces' own tone offsets (-1..1), blended over the arrises. */
  facet: Float32Array;
  /** How far the weather has hollowed the stone there (0..1): the chalk greys only in its hollows. */
  hollow: Float32Array;
}

/** The ground line in the form's unit space: above it the form keeps inside the legacy hull. */
export const BOULDER_SEAT_Y = 0;

export function buildBoulderForm(
  variant: number, noise: SimplexNoise, rng: () => number, hull: readonly number[], subdiv = 6, topY = 0,
  kindIndex = variant % 3, lithology: BoulderLithology = 'granite',
): BoulderForm {
  const kind = BOULDER_KINDS[kindIndex] ?? BOULDER_KINDS[0];
  const shape = KIND_SHAPES[kind];
  const [sx, sy, sz] = shape.size;
  // the grid: eight cells a face on the desktop, five on a phone, whose coarser rows round the arrises a third wider
  // (a cell must not straddle an arris's whole turn)
  const n = subdiv >= 6 ? 8 : 5;
  const round = Math.max(n < 8 ? 0.11 : 0.08, shape.round * LITHOLOGY_FORMS[lithology].soft * (n < 8 ? 1.35 : 1));
  const planes = jointPlanes(kind, rng);
  const tones = planes.map(() => rng() * 2 - 1);
  const salt = variant * 11.3 + rng() * 40;
  const [lumpA, lumpB, lumpC] = shape.lumps;
  const out = [0, 0, 0];
  let lumpAt = 0;
  /** The weathered surface along a unit direction (the joint surface lumped at three scales, its foot flared). */
  const surface = (ux: number, uy: number, uz: number, weights: Float64Array | null): number[] => {
    const t = jointRadius(planes, round, ux, uy, uz, weights);
    let x = ux * t, y = uy * t, z = uz * t;
    lumpAt = noise.noise3d(x * 1.15 + salt, y * 1.15, z * 1.15 - salt) * lumpA
      + noise.noise3d(x * 2.7 - salt, y * 2.7 + salt, z * 2.7) * lumpB;
    const f = 1 + lumpAt + noise.noise3d(x * 6.3 + salt * 0.5, y * 6.3 - salt, z * 6.3 + 7) * lumpC;
    x *= f; y *= f; z *= f;
    const q = clamp(-y / (0.45 * sy), 0, 1), foot = 1 + q * q * (3 - 2 * q) * 0.05;
    out[0] = x * foot; out[1] = y; out[2] = z * foot;
    return out;
  };
  const { points, quads, fan } = cubeGrid(n);
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
  // the skirt's floor as deep under the fitted rock as under any other, whatever its kind's height: the rock's top (which
  // no floor reaches) sets the fit's height, and the floor goes at least 1.5 under the ground line in fitted space
  let top0 = -Infinity;
  for (let v = 0; v < count; v++) if (dirs[v * 3 + 1] > 0) top0 = Math.max(top0, surface(dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2], null)[1]);
  const ky0 = topY > 0 && top0 > 0 ? (topY * 0.98) / top0 : 1;
  const floorPlane = planes.find((q) => q[1] === -1);
  if (floorPlane) floorPlane[3] = Math.max(floorPlane[3], 1.5 / ky0);
  // the fit: as tall as the legacy rock (its collider's cover), and inside the legacy hull above the ground line
  const edge = new Float32Array(count), fresh = new Float32Array(count), facet = new Float32Array(count), hollow = new Float32Array(count);
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
    // (the broad and middle scales' inward share: a hollow, not the grain)
    hollow[v] = clamp(-lumpAt / (0.55 * (lumpA + lumpB)), 0, 1);
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
  // the normals are the fitted surface's own, averaged over a third of a grid cell either side: they carry the grain
  // the mesh is too coarse to follow, and an arris narrower than a cell shades as one a cell wide instead of flickering
  const eps = (Math.PI / 2 / n) * 0.35;
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
  return { geometry, edge, fresh, facet, hollow };
}

/**
 * The lithologies' base tones (sRGB HSL) under a map's rock tone law: a weathered grey; the chalk a warm off-white
 * (wave 66 read the grey of the round before as "slate-blue … painted concrete" against Verdant's golden grass).
 */
const LITHOLOGY_TONE: Readonly<Partial<Record<BoulderLithology, readonly [number, number, number]>>> = Object.freeze({
  // (b12: an albedo of 0.6 to 0.7, not snow's: a cooler, greyer off-white; a fresh fracture a shade paler, to 0.76)
  chalk: [0.11, 0.16, 0.6],
});

/**
 * The boulder's vertex tone: the map's rock tone over its lithology's base, each face a shade of its own, the fracture
 * paler and greyer, the arrises a little paler (worn), the upward faces taking the map's cap tone harder, the hollows a
 * little darker — and the chalk greyer there, its only grey. Linear RGB in a 'color' attribute.
 */
export function paintBoulder(form: BoulderForm, tone: ToneFunction | null | undefined, lithology: BoulderLithology = 'granite'): void {
  const g = form.geometry, p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const [bh, bs, bl] = LITHOLOGY_TONE[lithology] ?? [0.09, 0.07, 0.28];
  const chalk = lithology === 'chalk';
  for (let i = 0; i < p.count; i++) {
    const up = clamp(n.getY(i), 0, 1), worn = clamp(form.edge[i] * 1.6, 0, 1), fresh = clamp(form.fresh[i], 0, 1);
    const hollow = form.hollow[i];
    // (b12: a fresh break gathers no grime, so the hollow's darkening keeps to the weathered skin: a chalk fracture reads
    // white even where its cut lies in a hollow of the mass)
    const l = bl + p.getY(i) * 0.04 + up * up * 0.1 + form.facet[i] * 0.025 + fresh * 0.05 + worn * 0.03 - hollow * (chalk ? 0.2 : 0.05) * (1 - fresh);
    let h = bh + form.facet[i] * 0.008, s = bs * (1 - fresh * 0.45) * (1 - hollow * (chalk ? 0.85 : 0.3));
    let lt = clamp(l, 0.15, chalk ? 0.76 : bl > 0.4 ? 0.82 : 0.5);
    if (tone) { const t = tone(h, s, lt); h = t[0]; s = t[1]; lt = clamp(t[2], 0, 1); }
    _soil.setHSL(h, s, clamp(lt * (0.86 + up * (chalk ? 0.1 : 0.22)), 0, 1), THREE.SRGBColorSpace);
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
  const lineWeight = { granite: 0.75, gneiss: 0.6, sandstone: 0.55, limestone: 0.8, slate: 0.6, basalt: 0.7, chalk: 0.3 }[lithology];
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
        // the laminae: fine lines, their set's angle swinging (cross-bedding), here and there (wave 57: "evenly spaced
        // painted strata lines"), on a fine sand grain
        const lam = (v * 28 + u * 3 * tileableTorusNoise(noi, u, v, 1, 2, 431) + tileableTorusNoise(noi, u, v, 3, 3, 433) * 0.6) % 1;
        const patch = clamp(tileableTorusNoise(noi, u, v, 2, 2, 437) * 1.6, 0, 1);
        lum -= (1 - clamp(((lam + 1) % 1) / 0.14, 0, 1)) * 0.045 * patch;
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
      } else if (lithology === 'chalk') {
        // chalk: a soft fine-grained white stone, its pores and the odd dark flint nodule, few fractures
        cellular(u, v, 30, 471, cell);
        const flint = hash3(cell.id, 5, 473) < 0.035 ? 1 - clamp((cell.d1 - 0.18) / 0.08, 0, 1) : 0;
        const pore = tileableTorusNoise(noi, u, v, 83, 83, 477) * 0.5 + 0.5;
        lum += 0.06 - flint * 0.5 - (pore > 0.82 ? 0.08 : 0) + (grain - 0.5) * -0.05;
        height -= flint * 0.2 + (pore > 0.82 ? 0.1 : 0);
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
      // the lichen colonies: lobed discs of every size, six cells to the tile (wave 57: "confetti spots": no satellites);
      // each texel's priority falls from its colony's own toward the rim, so a growing cover grows every colony outward
      // from its centre and a dense cluster merges them into a patch
      let best = 0, bestId = 0;
      for (const [n, salt, r0, r1, weight] of [[6, 461, 0.3, 0.38, 1]] as const) {
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
  // the tile is the photographed stone's stand-in until it loads (and its fallback of record): a mid grey on average,
  // as the photo is composed (the hook divides the stone's structure out about that mean)
  let lumSum = 0;
  for (let i = 0; i < s * s; i++) lumSum += px[i * 4];
  const toMid = 127.5 / Math.max(1, lumSum / (s * s));
  for (let i = 0; i < s * s; i++) {
    const value = Math.min(255, px[i * 4] * toMid);
    px[i * 4] = value; px[i * 4 + 1] = value; px[i * 4 + 2] = value;
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
 * ground under every vertex rides an attribute (a merged mesh's per vertex; an instanced boulder's as its centre's
 * height and the slope of its ground, `aRockSlope`, so the ground line is met all round on a slope), the detail tile is
 * sampled triplanar in world space, and the map's laws blend on top of the vertex tone. On the instanced boulders only
 * (vRockSeed >= 0; the merged formations, nests and works carry their own laws in their vertex tones): the desert
 * varnish, the lichen colonies of the climate on the tops and the weather side, a snow map's snow, and the contact
 * darkening where the stone meets the ground.
 */
export function applyRockShaderHook(
  shader: RockShader, dressing: RockDressing, lichenTile: THREE.Texture | null = null, stoneMean: THREE.Vector3 | null = null,
): void {
  shader.uniforms.uRockMoss = { value: dressing.moss };
  shader.uniforms.uRockDust = { value: dressing.dust };
  shader.uniforms.uRockSoil = { value: new THREE.Vector3(...dressing.soil) };
  shader.uniforms.uRockLichen = { value: new THREE.Vector3(lichenTile ? dressing.lichen[0] : 0, dressing.lichen[1], dressing.lichen[2]) };
  shader.uniforms.uRockLichenA = { value: new THREE.Vector3(...dressing.lichenA) };
  shader.uniforms.uRockLichenB = { value: new THREE.Vector3(...dressing.lichenB) };
  shader.uniforms.uRockVarnish = { value: dressing.varnish };
  shader.uniforms.uRockLichenTile = { value: lichenTile };
  shader.uniforms.uRockPhoto = { value: new THREE.Vector3(...dressing.photo) };
  shader.uniforms.uRockSurface = { value: new THREE.Vector3(...dressing.surface) };
  // the stone's linear mean, per channel: the procedural stand-in's mid grey until the photographed stone lands (its
  // owner updates the vector in place, sourcedTextures.ts applySourcedRock)
  shader.uniforms.uRockStoneMean = { value: stoneMean ?? new THREE.Vector3(0.214, 0.214, 0.214) };
  shader.vertexShader = mustReplace(shader.vertexShader, 'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;',
    'varying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nattribute float aRockGround;\nvarying float vRockAbove;\nvarying float vRockSeed;\n#ifdef USE_INSTANCING\nattribute vec2 aRockSlope;\n#endif');
  shader.vertexShader = mustReplace(shader.vertexShader, '  vGrimeN = normalize(mat3(modelMatrix) * gn);\n}', /* glsl */`  vGrimeN = normalize(mat3(modelMatrix) * gn);
  vRockAbove = vGrimeW.y - aRockGround;
  vRockSeed = -1.0;
  #ifdef USE_INSTANCING
  // a boulder's ground: the plane through its centre's ground along the slope under it; and its own hash
  vRockAbove -= dot(aRockSlope, vGrimeW.xz - (modelMatrix * instanceMatrix[3]).xz);
  vRockSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  #endif
}`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, 'uniform sampler2D uGrime;', `uniform sampler2D uGrime;
varying float vRockAbove;
varying float vRockSeed;
uniform float uRockMoss;
uniform float uRockDust;
uniform vec3 uRockSoil;
uniform vec3 uRockLichen;
uniform vec3 uRockLichenA;
uniform vec3 uRockLichenB;
uniform float uRockVarnish;
uniform sampler2D uRockLichenTile;
uniform vec3 uRockPhoto;
uniform vec3 uRockSurface;
uniform vec3 uRockStoneMean;`);
  // the stone in the map slot, triplanar (order-free): the map's terrain rock layer, photographed (sourcedTextures.ts
  // applySourcedRock; the procedural tile until it loads), divided by its own mean, so it multiplies its structure into
  // the vertex tone — its contrast and its own colour's share the lithology's — and the stone's colour stays the vertex
  // tone's. The laws mix after the vertex tone has multiplied (three's color_fragment): the final colour, not a tint under it
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`
vec3 rockTw = abs(vGrimeN); rockTw = rockTw * rockTw * rockTw * rockTw; rockTw /= max(1e-4, rockTw.x + rockTw.y + rockTw.z);
// each boulder its own cut of the stone (the scenery lane, b12; Sonnet, wave 74: "identical banding recognisable" from
// rock to rock): on an instanced boulder the photo's frame turns about the vertical by its hash, its strata tip up to
// ten degrees, its scale runs 0.44 to 0.69 per metre and its phase is its own; a merged formation keeps the world frame
mat3 rockR = mat3(1.0);
vec3 rockPw = vGrimeW * 0.55;
if (vRockSeed >= 0.0) {
  float rockYaw = vRockSeed * 6.2831853, rockTip = (fract(vRockSeed * 7.13) - 0.5) * 0.35;
  float rcy = cos(rockYaw), rsy = sin(rockYaw), rct = cos(rockTip), rst = sin(rockTip);
  rockR = mat3(rcy, 0.0, -rsy, 0.0, 1.0, 0.0, rsy, 0.0, rcy) * mat3(1.0, 0.0, 0.0, 0.0, rct, rst, 0.0, -rst, rct);
  rockPw = rockR * vGrimeW * (0.44 + 0.25 * fract(vRockSeed * 3.71)) + vRockSeed * vec3(31.7, 7.3, 19.1);
}
vec3 rockTp = abs(rockR * vGrimeN); rockTp = rockTp * rockTp * rockTp * rockTp; rockTp /= max(1e-4, rockTp.x + rockTp.y + rockTp.z);
float rockDetail = 0.8;
#ifdef USE_MAP
{
  vec3 rockPhoto = texture2D(map, rockPw.yz).rgb * rockTp.x + texture2D(map, rockPw.xz).rgb * rockTp.y + texture2D(map, rockPw.xy).rgb * rockTp.z;
  vec3 rockF = rockPhoto / max(uRockStoneMean, vec3(0.01));
  float rockFL = dot(rockF, vec3(0.2126, 0.7152, 0.0722));
  rockF = max(vec3(0.0), mix(vec3(1.0), mix(vec3(rockFL), rockF, uRockPhoto.y), uRockPhoto.x));
  diffuseColor.rgb *= rockF;
  rockDetail = clamp(0.8 * rockFL, 0.0, 1.6);
}
#endif`);
  // the normal tile, triplanar in world space: three's tangent frame (normal_fragment_maps) divides by the UV
  // derivatives, which are zero on a mesh without UVs, so its chunk is replaced outright
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>', /* glsl */`
#ifdef USE_NORMALMAP
{
  vec3 rockTx = texture2D(normalMap, rockPw.yz).xyz * 2.0 - 1.0;
  vec3 rockTy = texture2D(normalMap, rockPw.xz).xyz * 2.0 - 1.0;
  vec3 rockTz = texture2D(normalMap, rockPw.xy).xyz * 2.0 - 1.0;
  vec3 rockPert = vec3(0.0, rockTx.x, rockTx.y) * rockTp.x + vec3(rockTy.x, 0.0, rockTy.y) * rockTp.y + vec3(rockTz.x, rockTz.y, 0.0) * rockTp.z;
  rockPert = transpose(rockR) * rockPert; // (the perturbation drawn in the boulder's frame, turned back to the world)
  vec3 rockN = normalize(normalize(vGrimeN) + rockPert * uRockPhoto.z);
  normal = normalize((viewMatrix * vec4(rockN, 0.0)).xyz);
}
#endif`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <color_fragment>', /* glsl */`#include <color_fragment>
{
  if (vRockSeed >= 0.0) {
    // the soft carbonate stones' own surface (b12; wave 74 read Verdant's chalk as "a white marshmallow, a fleece or a
    // snow heap"): the weathered rind greys a pale stone (algae, soot, the lichen's crust), most on the tops and the
    // weather side, broken by the grime field; the chalk's flints, knobbly dark nodules in bands about 0.6 m apart, a
    // hand to a forearm across; and the soil's stain, soft and uneven, half a metre up its foot
    if (uRockSurface.y > 0.0) {
      float rindN = texture2D(uGrime, vGrimeW.xz * 0.37 + vGrimeW.y * 0.21).r;
      float rind = uRockSurface.y * smoothstep(0.25, 0.95, 0.5 + 0.45 * vGrimeN.y + (rindN - 0.5) * 0.9);
      float rindL = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(rindL * 0.84, rindL * 0.85, rindL * 0.86), rind * 0.65);
    }
    if (uRockSurface.x > 0.0) {
      float flintBand = abs(fract(vGrimeW.y * 1.65 + vRockSeed * 5.3 + (texture2D(uGrime, vGrimeW.xz * 0.11).g - 0.5) * 0.7) - 0.5);
      float flintN = texture2D(uGrime, rockPw.xz * 2.7 + rockPw.y * 1.3).r;
      float flint = uRockSurface.x * (1.0 - smoothstep(0.07, 0.17, flintBand)) * smoothstep(0.6, 0.68, flintN) * smoothstep(0.15, 0.5, vRockAbove);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.052, 0.058), flint);
    }
    if (uRockSurface.z > 0.0) {
      float stainTop = 0.5 + (texture2D(uGrime, vGrimeW.xz * 0.6).g - 0.5) * 0.45;
      float stain = uRockSurface.z * (1.0 - smoothstep(0.0, stainTop, vRockAbove));
      vec3 stainTint = uRockSoil / max(dot(uRockSoil, vec3(0.3333)), 0.01);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * stainTint * 0.6, stain * 0.75);
    }
    // desert varnish: a dark patina run down the exposed faces from their brows
    if (uRockVarnish > 0.0) {
      float runs = texture2D(uGrime, vec2((vGrimeW.x + vGrimeW.z) * 0.7, vGrimeW.y * 0.05)).g;
      float varnish = uRockVarnish * smoothstep(0.45, 0.75, runs) * (1.0 - abs(vGrimeN.y)) * smoothstep(0.15, 0.7, vRockAbove);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.35, 0.3), varnish);
    }
    // the lichen (wave 57: "pasted flecks", "evenly scattered confetti spots"): colonies grow in clusters, a few patches
    // to a rock where the cluster field allows, on its tops and its weather side (none under), merging where they are
    // dense; a crust over the stone, not a paint on it (on a snowy map only the steep faces the snow leaves bare)
    if (uRockLichen.x > 0.0) {
      vec3 lPw = vGrimeW * 0.3 + vRockSeed * 3.7;
      vec2 lc = texture2D(uRockLichenTile, lPw.yz).rg * rockTw.x + texture2D(uRockLichenTile, lPw.xz).rg * rockTw.y + texture2D(uRockLichenTile, lPw.xy).rg * rockTw.z;
      vec2 lFlank = normalize(vGrimeN.xz + vec2(1e-4, 0.0));
      float weather = dot(lFlank, vec2(0.55, -0.83)) * length(vGrimeN.xz);
      float exposed = smoothstep(0.15, 0.75, vGrimeN.y + 0.45 * weather) * smoothstep(0.25, 0.6, vRockAbove)
        * (1.0 - uRockLichen.z * smoothstep(0.4, 0.72, vGrimeN.y));
      float cluster = smoothstep(0.5, 0.68, texture2D(uGrime, vGrimeW.xz * 0.09 + vec2(vRockSeed * 0.37, 0.61)).r);
      float cover = min(0.72, uRockLichen.x * 3.0 * exposed * cluster * (0.6 + 0.8 * fract(vRockSeed * 3.31)));
      float edge = 0.02 + length(fwidth(lPw)) * 2.0;
      float lichen = smoothstep(1.0 - cover - edge, 1.0 - cover + edge, lc.x);
      vec3 lichenColor = mix(uRockLichenB, uRockLichenA, step(lc.y, uRockLichen.y)) * (0.72 + 0.3 * rockDetail);
      lichenColor = mix(lichenColor, diffuseColor.rgb, 0.3);
      diffuseColor.rgb = mix(diffuseColor.rgb, lichenColor, lichen * (0.42 + 0.26 * fract(lc.y * 7.0)));
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
  // the base sits in the ground: soil climbs the lower third of a metre, its top wandering a hand up and down (wave 57:
  // "a ruler-straight base line"), broken by the grime field
  float soilTop = (texture2D(uGrime, vGrimeW.xz * 0.47 + vGrimeW.y * 0.11).g - 0.5) * 0.3;
  float soilMask = (1.0 - smoothstep(-0.12 + soilTop, 0.34 + soilTop, vRockAbove)) * (0.55 + 0.45 * texture2D(uGrime, vGrimeW.xz * 1.3).r);
  diffuseColor.rgb = mix(diffuseColor.rgb, uRockSoil, soilMask * 0.92);
  // and a boulder darkens where it meets the ground (the occlusion of the turf and the soil round its foot); on a dusty
  // map less and softer (b12, wave 72 on Redrock: "a uniformly dark crisp ring"): drifted sand fills the foot and
  // takes the light, the darkening fading over half a metre
  if (vRockSeed >= 0.0) {
    float contactK = 0.45 * (1.0 - 0.6 * uRockDust);
    diffuseColor.rgb *= (1.0 - contactK) + contactK * smoothstep(-0.04 + soilTop * 0.5, 0.3 + 0.25 * uRockDust + soilTop * 0.5, vRockAbove);
  }
}`);
}
