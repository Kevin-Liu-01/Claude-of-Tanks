// Round 75, item 6 (integrator, deploy-100 Verdant hull-side frame), rebuilt by the scenery lane 2026-10-04 (gauntlet
// wave 52: the boulders were "low-poly frustums, chamfered boxes or polyhedra … all under one even noise texture and
// none sunk into the ground"; wave 57: "a bar-of-soap form", "painted strata", "confetti" lichen, "no soil collar").
// This module owns the boulders' look: their forms (blocks their joints cut, flat faced and round arrissed; the bedded
// rocks' beds stacked, the soft ones recessed under ledges: buildBoulderForm), their tone by block, face, fracture and
// arris (paintBoulder), the per-map dressing (the map's rock — its lithology: granite speckle, gneiss foliation,
// sandstone laminae, limestone pits, slate cleavage, basalt vesicles, chalk — the lichen of its climate in colonies on
// the tops and the weather side, moss on the shaded faces of wet maps, a dust cap and desert varnish on arid maps, a
// soil band and contact darkening at the ground line everywhere, on each rock's own ground plane so a slope is met all
// round), the generated tiles the rock material samples (a 256 px detail tile of the map's lithology, triplanar — no UVs
// on a boulder — and a lichen colony tile), and the shader hook. The legacy rocks' projected hulls stay the collision proxies: the visual rock lies
// inside the hull the dedicated shards already carry and no record moves. Renderer-free apart from the texture
// helpers; Node-runnable.
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
  };
}

// ---------------------------------------------------------------------------------------------- geometry

/**
 * The boulders' forms (the scenery lane). Gauntlet wave 52 read the first boulders as "low-poly frustums, chamfered
 * boxes or polyhedra … none sunk into the ground"; wave 57 read their successors as "a bar-of-soap form", "a rounded box
 * with a pillow or loaf silhouette", "a smooth, near-symmetric dome". A boulder is now one or more blocks its joints
 * cut, each the intersection of its joint planes with its arrises rounded by the weather: the planes drawn in by the
 * block's radius and the block grown back by a ball of it (a Minkowski sum), so a joint face is exactly flat, an arris
 * exactly a quarter-cylinder and a corner a patch of sphere, every normal exact (no normal is a triangle's, and no seam
 * of light runs along a triangle's edge). The kinds follow the rock: a jointed block (three joint sets out of square,
 * every face at its own depth, its upper corners chipped by fresh fractures, often a lower shelf on one side), a
 * corestone the weather rounded (many faces, a broad radius, one face flat), a bedded block (beds of their own
 * thickness stacked, the soft ones recessed so the hard ones stand out as ledges and overhangs, every bed its own
 * shade), a slab. A smooth warp bends every face a little; the rock is fitted inside the legacy hull above the ground
 * line and as tall as the legacy rock (the collider's cover), and its skirt runs deep under the ground with its girth,
 * so a slope's downhill side bares a buried flank and never an underside.
 */
export const BOULDER_KINDS = Object.freeze(['jointed block', 'corestone', 'bedded block', 'slab'] as const);
type BoulderKindName = (typeof BOULDER_KINDS)[number];

/** The kinds a lithology's three variants are built as, how far the weather rounds its arrises, and whether it beds. */
const LITHOLOGY_FORMS: Readonly<Record<BoulderLithology, { kinds: readonly [BoulderKindName, BoulderKindName, BoulderKindName]; soft: number; bedded: boolean }>> = Object.freeze({
  granite: { kinds: ['jointed block', 'corestone', 'slab'], soft: 1, bedded: false },
  gneiss: { kinds: ['jointed block', 'corestone', 'slab'], soft: 0.9, bedded: false },
  basalt: { kinds: ['jointed block', 'corestone', 'jointed block'], soft: 0.8, bedded: false },
  sandstone: { kinds: ['bedded block', 'slab', 'bedded block'], soft: 0.85, bedded: true },
  limestone: { kinds: ['bedded block', 'jointed block', 'slab'], soft: 1, bedded: true },
  slate: { kinds: ['slab', 'jointed block', 'slab'], soft: 0.6, bedded: false },
  chalk: { kinds: ['bedded block', 'corestone', 'jointed block'], soft: 1.7, bedded: true },
});

/** The kind (an index into BOULDER_KINDS) a map's variant is built as. */
export function boulderKindFor(lithology: BoulderLithology, variant: number): number {
  return BOULDER_KINDS.indexOf(LITHOLOGY_FORMS[lithology].kinds[variant % 3]);
}

/** A joint plane: outward unit normal, offset from the centre, and 1 for a fresh fracture. */
type JointPlane = [nx: number, ny: number, nz: number, d: number, fresh: number];

/** One block of a boulder: its joint planes, its arrises' radius, its own shade (-1..1: a bed's hardness, a ledge's). */
interface BoulderBody { planes: JointPlane[]; round: number; tone: number }

/** The skirt's depth under the centre (unit space): deep under any ground a slope bares. */
const BOULDER_FLOOR = 1.45;

/** The blocks of a kind (unit space, about a metre across), every draw from `rng`. */
function boulderBodies(kind: BoulderKindName, rng: () => number, soft: number, bedded: boolean, simple = false): BoulderBody[] {
  const jitter = (a: number): number => (rng() * 2 - 1) * a;
  const range = (lo: number, hi: number): number => lo + rng() * (hi - lo);
  const bodies: BoulderBody[] = [];
  /** A plane along a direction, at a depth relative to the support of an ellipsoid of `size` about `at`. */
  const plane = (size: readonly number[], at: readonly number[], x: number, y: number, z: number, depth: number, fresh = 0): JointPlane => {
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    const d = Math.sqrt((size[0] * x) ** 2 + (size[1] * y) ** 2 + (size[2] * z) ** 2) * depth + x * at[0] + y * at[1] + z * at[2];
    return [x, y, z, d, fresh];
  };
  /** Azimuths round the circle as a random walk (no two joint sets square). */
  const ring = (count: number, spread = 0.55): number[] => {
    const steps = Array.from({ length: count }, () => spread + rng());
    const total = steps.reduce((p, q) => p + q, 0);
    let az = rng() * Math.PI * 2;
    return steps.map((step) => { const out = az; az += (step / total) * Math.PI * 2; return out; });
  };
  /** A joint face round the side, leaning back a little (never under: the girth only grows downward). */
  const side = (size: readonly number[], at: readonly number[], az: number, lean: number, depth: number, fresh = 0): JointPlane =>
    plane(size, at, Math.cos(az) * Math.cos(lean), Math.sin(Math.max(0, lean)), Math.sin(az) * Math.cos(lean), depth, fresh);
  /** The shoulders: a ring of facets between the top joint and the sides, the weathered top's breaks, at their own heights. */
  const shoulders = (size: readonly number[], at: readonly number[], count: number, el: [number, number], depth: [number, number], planes: JointPlane[], freshShare = 0.3): void => {
    for (const az of ring(count, 0.4)) {
      const e = range(el[0], el[1]);
      planes.push(plane(size, at, Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az), range(depth[0], depth[1]), rng() < freshShare ? 1 : 0));
    }
  };
  // the skirt's floor (fresh -1 marks it: the fit sets its depth under the fitted rock, whatever the kind's height)
  const floor = (size: readonly number[] = [1, 0.8, 1]): JointPlane => [0, -1, 0, BOULDER_FLOOR * (size[1] / 0.8), -1];
  /** An irregular block about `at`: a tilted top joint, a ring of shoulders, a set of near-upright joint faces, one of
   * them cut deep (a broad flat face). */
  const block = (size: readonly number[], at: readonly number[], o: { sides: [number, number]; shoulders: [number, number];
    el: [number, number]; topTilt: number; round: number; tone: number }): BoulderBody => {
    const planes: JointPlane[] = [plane(size, at, jitter(o.topTilt), 1, jitter(o.topTilt), range(0.86, 1))];
    shoulders(size, at, o.shoulders[0] + Math.floor(rng() * (o.shoulders[1] - o.shoulders[0] + 1)), o.el, [0.84, 0.97], planes);
    const sideAz = ring(o.sides[0] + Math.floor(rng() * (o.sides[1] - o.sides[0] + 1)));
    const deep = Math.floor(rng() * sideAz.length);
    sideAz.forEach((az, k) => planes.push(side(size, at, az, rng() * 0.1, k === deep ? range(0.7, 0.78) : range(0.84, 1.08), k === deep && rng() < 0.5 ? 1 : 0)));
    planes.push(floor(size));
    return { planes, round: o.round, tone: o.tone };
  };
  if (kind === 'jointed block') {
    // a jointed rock parted along its joints: a main block, a sharper piece split off one side and standing a step
    // higher or lower, often a low ledge on another (a union of blocks: their meeting creases are the joints)
    const az = rng() * Math.PI * 2;
    bodies.push(block([0.86, 0.8, 0.76], [0, 0, 0], { sides: [5, 7], shoulders: [1, 3], el: [0.4, 0.8], topTilt: 0.32, round: 0.095 * soft, tone: jitter(0.3) }));
    if (simple) return bodies;
    const up = rng() < 0.5 ? range(0.08, 0.2) : -range(0.15, 0.3);
    bodies.push(block([0.52, 0.62, 0.5], [Math.cos(az) * 0.5, up, Math.sin(az) * 0.5],
      { sides: [4, 6], shoulders: [1, 2], el: [0.45, 0.8], topTilt: 0.4, round: 0.045 * soft, tone: jitter(0.5) }));
    if (rng() < 0.55) {
      const az2 = az + Math.PI * range(0.6, 1.4);
      bodies.push(block([0.58, 0.36, 0.52], [Math.cos(az2) * 0.5, -0.32, Math.sin(az2) * 0.5],
        { sides: [4, 6], shoulders: [1, 2], el: [0.35, 0.7], topTilt: 0.25, round: 0.07 * soft, tone: jitter(0.45) }));
    }
  } else if (kind === 'corestone') {
    // the weathered core of a jointed mass: many facets, its arrises worn broad, a lobe the weather has not yet parted
    // from it, one face still a flat joint
    bodies.push(block([0.9, 0.82, 0.84], [0, 0, 0], { sides: [6, 8], shoulders: [4, 6], el: [0.3, 0.9], topTilt: 0.3, round: 0.15 * soft, tone: jitter(0.3) }));
    if (simple) return bodies;
    const az = rng() * Math.PI * 2;
    bodies.push(block([0.56, 0.55, 0.52], [Math.cos(az) * 0.45, -range(0.12, 0.3), Math.sin(az) * 0.45],
      { sides: [5, 6], shoulders: [3, 5], el: [0.3, 0.85], topTilt: 0.3, round: 0.1 * soft, tone: jitter(0.4) }));
  } else {
    // a bedded block, or a slab: an irregular jointed block (its top, shoulders and sides) sliced by its bedding planes
    // into beds of their own thickness, each set back a little its own way (wave 57: "evenly spaced painted strata"; the
    // beds are relief: small recessed ledges at irregular heights, a groove at every parting). A massive rock's slab is
    // one bed.
    const slab = kind === 'slab';
    const size = slab ? [1.06, 0.5, 0.92] : [0.98, 0.8, 0.86];
    // (its top is a bedding plane, near level for a bedded rock, the cleavage's tilt for a slate; its shoulders break it)
    const outline = block(size, [0, 0, 0], slab
      ? { sides: [5, 7], shoulders: [2, 4], el: [0.3, 0.6], topTilt: bedded ? 0.06 : 0.12, round: 0, tone: 0 }
      : { sides: [5, 7], shoulders: [3, 4], el: [0.3, 0.7], topTilt: 0.07, round: 0, tone: 0 });
    const topPlane = outline.planes[0], walls = outline.planes.slice(1, -1);
    // the top joint's lowest point over the rock (it is tilted): no parting runs up to it, so no bed pinches out to an edge
    const topY = (topPlane[3] - 1.1 * Math.hypot(topPlane[0], topPlane[2])) / Math.max(0.5, topPlane[1]);
    const want = bedded && !simple ? (slab ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2)) : 1;
    // the partings: each bed its own thickness, the lowest the thickest (its first ledge stands well up the rock, never
    // a plinth at the ground line); a parting that would leave a bed thinner than a hand and a half is not drawn (a thin
    // bed's flat face is a sliver between its rounded arrises)
    const weights = Array.from({ length: want }, (_, i) => (i === 0 && want > 1 ? 1.2 : 0.4) + rng());
    const sum = weights.reduce((p, q) => p + q, 0), base = -0.08 * size[1];
    const partings: number[] = [];
    let at = base;
    for (let i = 0; i < want - 1; i++) {
      at += ((topY - base) * weights[i]) / sum;
      if (at - (partings.length ? partings[partings.length - 1] : base) >= 0.16 && topY - at >= 0.16) partings.push(at);
    }
    const count = partings.length + 1;
    // the beds dip together (a slate's cleavage steeper)
    const dip = slab && !bedded ? range(0.08, 0.3) : rng() * 0.07, dipAz = rng() * Math.PI * 2;
    const nx = Math.sin(dip) * Math.cos(dipAz), ny = Math.cos(dip), nz = Math.sin(dip) * Math.sin(dipAz);
    let hard = false;
    for (let i = 0; i < count; i++) {
      hard = count === 1 ? true : i === 0 ? false : rng() < (hard ? 0.35 : 0.8);
      const recess = hard ? rng() * 0.015 : range(0.025, 0.06);
      const bottom = i === 0 ? base : partings[i - 1], top = i === count - 1 ? topY : partings[i];
      const round = Math.min((hard ? 0.05 : 0.04) * soft, 0.24 * (top - bottom));
      // (each face its own way: here the groove is deep, there the bed runs flush past it)
      const planes: JointPlane[] = walls.map(([x, y, z, d, fresh]) => [x, y, z, d - recess * range(0, 1.6) - rng() * 0.02, fresh] as JointPlane);
      planes.push(i === count - 1 ? topPlane : [nx, ny, nz, ny * top, 0]);
      // a bed's bed: the parting under it, overlapped by its radius so the two press together in a groove
      planes.push(i === 0 ? floor(size) : [-nx, -ny, -nz, -ny * (bottom - round - 0.01), 0]);
      bodies.push({ planes, round, tone: (hard ? 0.5 : -0.45) + jitter(0.2) });
    }
  }
  return bodies;
}

/** A face of a polytope: its plane and its vertex loop, counter-clockwise from outside. */
interface PolytopeFace { plane: number; loop: number[] }

/** The convex polytope of half-spaces n.x <= d: its vertices (with their incident planes) and its faces. */
function polytope(planes: ReadonlyArray<readonly [number, number, number, number]>): { verts: number[][]; faces: PolytopeFace[] } {
  const verts: number[][] = [];
  const n = planes.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const [ax, ay, az, ad] = planes[i], [bx, by, bz, bd] = planes[j], [cx, cy, cz, cd] = planes[k];
    const bcx = by * cz - bz * cy, bcy = bz * cx - bx * cz, bcz = bx * cy - by * cx;
    const det = ax * bcx + ay * bcy + az * bcz;
    if (Math.abs(det) < 1e-9) continue;
    const cax = cy * az - cz * ay, cay = cz * ax - cx * az, caz = cx * ay - cy * ax;
    const abx = ay * bz - az * by, aby = az * bx - ax * bz, abz = ax * by - ay * bx;
    const x = (ad * bcx + bd * cax + cd * abx) / det, y = (ad * bcy + bd * cay + cd * aby) / det, z = (ad * bcz + bd * caz + cd * abz) / det;
    let inside = true;
    for (const [px, py, pz, pd] of planes) if (px * x + py * y + pz * z > pd + 1e-7) { inside = false; break; }
    if (!inside) continue;
    if (!verts.some((v) => Math.abs(v[0] - x) + Math.abs(v[1] - y) + Math.abs(v[2] - z) < 1e-6)) verts.push([x, y, z]);
  }
  const faces: PolytopeFace[] = [];
  planes.forEach(([px, py, pz, pd], plane) => {
    const on = verts.map((_, v) => v).filter((v) => Math.abs(px * verts[v][0] + py * verts[v][1] + pz * verts[v][2] - pd) < 1e-6);
    if (on.length < 3) return;
    let cx = 0, cy = 0, cz = 0;
    for (const v of on) { cx += verts[v][0]; cy += verts[v][1]; cz += verts[v][2]; }
    cx /= on.length; cy /= on.length; cz /= on.length;
    // a basis on the plane, e2 = n x e1: ascending angle runs counter-clockwise seen from outside
    let ex = Math.abs(py) < 0.9 ? 0 : 1, ey = Math.abs(py) < 0.9 ? 1 : 0, ez = 0;
    const dot = ex * px + ey * py + ez * pz;
    ex -= dot * px; ey -= dot * py; ez -= dot * pz;
    const el = Math.hypot(ex, ey, ez); ex /= el; ey /= el; ez /= el;
    const fx = py * ez - pz * ey, fy = pz * ex - px * ez, fz = px * ey - py * ex;
    const angle = (v: number): number => {
      const dx = verts[v][0] - cx, dy = verts[v][1] - cy, dz = verts[v][2] - cz;
      return Math.atan2(dx * fx + dy * fy + dz * fz, dx * ex + dy * ey + dz * ez);
    };
    faces.push({ plane, loop: on.sort((a, b) => angle(a) - angle(b)) });
  });
  return { verts, faces };
}

/** A boulder's mesh as it is assembled: positions, normals, index, and per vertex the facts its tone law reads. */
interface BoulderMesh { positions: number[]; normals: number[]; index: number[]; arris: number[]; fresh: number[]; tone: number[]; radius: number[] }

function slerp(a: readonly number[], b: readonly number[], t: number): number[] {
  const cos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const angle = Math.acos(cos);
  if (angle < 1e-6) return [a[0], a[1], a[2]];
  const s = Math.sin(angle), wa = Math.sin((1 - t) * angle) / s, wb = Math.sin(t * angle) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

/**
 * One rounded block into the mesh: the polytope of its planes drawn in by its radius, grown back by a ball of it. Its
 * faces (fanned from a ring, or from their centre on a phone), the arris strips between them (a segment across every
 * `turnStep` radians the arris turns, at most `maxSegments`; an edge cut every `edgeStep` along) and the corner
 * patches; every vertex shared, so the block is closed.
 */
function addRoundedBlock(body: BoulderBody, turnStep: number, maxSegments: number, edgeStep: number, ring: boolean, mesh: BoulderMesh): void {
  const r = body.round;
  // the drawn-in polytope, its slivers dropped: a plane that only grazes it (a face narrower than a few millimetres
  // between its neighbours) is subsumed by the rounding, so its plane goes and its neighbours close over the spot
  let planes = body.planes.slice();
  let { verts, faces } = polytope(planes.map(([x, y, z, d]) => [x, y, z, d - r] as [number, number, number, number]));
  for (let pass = 0; pass < 6; pass++) {
    const sliver = faces.find((face) => {
      let area = 0, perimeter = 0;
      const o = verts[face.loop[0]];
      for (let k = 0; k < face.loop.length; k++) {
        const p = verts[face.loop[k]], q = verts[face.loop[(k + 1) % face.loop.length]];
        perimeter += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (k > 0 && k + 1 < face.loop.length) {
          const ux = p[0] - o[0], uy = p[1] - o[1], uz = p[2] - o[2], vx = q[0] - o[0], vy = q[1] - o[1], vz = q[2] - o[2];
          area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        }
      }
      return area / Math.max(1e-9, perimeter) < 0.006;
    });
    if (!sliver) break;
    planes = planes.filter((_, i) => i !== sliver.plane);
    ({ verts, faces } = polytope(planes.map(([x, y, z, d]) => [x, y, z, d - r] as [number, number, number, number])));
  }
  body = { ...body, planes };
  const normalOf = (plane: number): number[] => [body.planes[plane][0], body.planes[plane][1], body.planes[plane][2]];
  const freshOf = (plane: number): number => body.planes[plane][4];
  // each joint face a shade of its own about its block's (a hash of its normal: no draw from the stream)
  const toneOf = (plane: number): number => {
    const [x, y, z] = body.planes[plane];
    const hsh = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return body.tone * 0.75 + (hsh - Math.floor(hsh) - 0.5) * 0.6;
  };
  const ids = new Map<string, number>();
  const vertex = (key: string, p: readonly number[], n: readonly number[], arris: number, fresh: number, tone: number): number => {
    let id = ids.get(key);
    if (id !== undefined) return id;
    id = mesh.positions.length / 3;
    ids.set(key, id);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    mesh.positions.push(p[0], p[1], p[2]);
    mesh.normals.push(n[0] / l, n[1] / l, n[2] / l);
    mesh.arris.push(arris); mesh.fresh.push(fresh); mesh.tone.push(tone); mesh.radius.push(r);
    return id;
  };
  /** The arris between faces f and g: a segment across every turnStep of its turn (the same for its strip and its corners). */
  const segmentsOf = (f: number, g: number): number => {
    const a = normalOf(f), b = normalOf(g);
    const turn = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    return Math.max(1, Math.min(maxSegments, Math.ceil(turn / turnStep - 1e-6)));
  };
  /** A point of the arc at polytope vertex v from face f's normal toward face g's, s steps of the arris's segments along. */
  const arc = (v: number, f: number, g: number, s: number): number => {
    const S = segmentsOf(f, g);
    if (s <= 0) return corner(v, f);
    if (s >= S) return corner(v, g);
    const lo = Math.min(f, g), hi = Math.max(f, g), step = f === lo ? s : S - s;
    const u = slerp(normalOf(lo), normalOf(hi), step / S);
    const p = verts[v];
    return vertex(`a${v}:${lo}:${hi}:${step}`, [p[0] + r * u[0], p[1] + r * u[1], p[2] + r * u[2]], u, Math.sin((Math.PI * step) / S),
      freshOf(lo) + (freshOf(hi) - freshOf(lo)) * (step / S), toneOf(lo) + (toneOf(hi) - toneOf(lo)) * (step / S));
  };
  const corner = (v: number, f: number): number => {
    const p = verts[v], n = normalOf(f);
    return vertex(`c${v}:${f}`, [p[0] + r * n[0], p[1] + r * n[1], p[2] + r * n[2]], n, 0, freshOf(f), toneOf(f));
  };
  // the edges: each with the face where it runs a -> b (a < b) and the face where it runs back
  const edges = new Map<string, { a: number; b: number; F: number; G: number; M: number }>();
  for (const face of faces) {
    for (let k = 0; k < face.loop.length; k++) {
      const v = face.loop[k], w = face.loop[(k + 1) % face.loop.length], a = Math.min(v, w), b = Math.max(v, w);
      const key = `${a}:${b}`;
      let e = edges.get(key);
      if (!e) {
        const len = Math.hypot(verts[b][0] - verts[a][0], verts[b][1] - verts[a][1], verts[b][2] - verts[a][2]);
        e = { a, b, F: -1, G: -1, M: Math.max(1, Math.min(3, Math.round(len / edgeStep))) };
        edges.set(key, e);
      }
      if (v === a) e.F = face.plane; else e.G = face.plane;
    }
  }
  /** A point along edge {a, b}, m steps of M from a, s steps across from F toward G. */
  const along = (e: { a: number; b: number; F: number; G: number; M: number }, m: number, s: number): number => {
    if (m <= 0) return arc(e.a, e.F, e.G, s);
    if (m >= e.M) return arc(e.b, e.F, e.G, s);
    const S = segmentsOf(e.F, e.G), t = m / e.M, pa = verts[e.a], pb = verts[e.b];
    const u = slerp(normalOf(e.F), normalOf(e.G), s / S);
    return vertex(`e${e.a}:${e.b}:${m}:${s}`, [pa[0] + (pb[0] - pa[0]) * t + r * u[0], pa[1] + (pb[1] - pa[1]) * t + r * u[1],
      pa[2] + (pb[2] - pa[2]) * t + r * u[2]], u, Math.sin((Math.PI * s) / S), freshOf(e.F) + (freshOf(e.G) - freshOf(e.F)) * (s / S),
      toneOf(e.F) + (toneOf(e.G) - toneOf(e.F)) * (s / S));
  };
  const tri = (a: number, b: number, c: number): void => { mesh.index.push(a, b, c); };
  // the faces
  for (const face of faces) {
    const boundary: number[] = [];
    for (let k = 0; k < face.loop.length; k++) {
      const v = face.loop[k], w = face.loop[(k + 1) % face.loop.length];
      const e = edges.get(`${Math.min(v, w)}:${Math.max(v, w)}`)!;
      boundary.push(corner(v, face.plane));
      if (v === e.a) for (let m = 1; m < e.M; m++) boundary.push(along(e, m, 0));
      else for (let m = e.M - 1; m >= 1; m--) boundary.push(along(e, m, segmentsOf(e.F, e.G)));
    }
    const n = normalOf(face.plane), fresh = freshOf(face.plane), tone = toneOf(face.plane);
    let cx = 0, cy = 0, cz = 0;
    for (const id of boundary) { cx += mesh.positions[id * 3]; cy += mesh.positions[id * 3 + 1]; cz += mesh.positions[id * 3 + 2]; }
    cx /= boundary.length; cy /= boundary.length; cz /= boundary.length;
    const centre = vertex(`f${face.plane}`, [cx, cy, cz], n, 0, fresh, tone);
    if (!ring || boundary.length < 6) {
      for (let k = 0; k < boundary.length; k++) tri(centre, boundary[k], boundary[(k + 1) % boundary.length]);
      continue;
    }
    const inner2 = boundary.map((id, k) => vertex(`f${face.plane}:${k}`, [cx + (mesh.positions[id * 3] - cx) * 0.55,
      cy + (mesh.positions[id * 3 + 1] - cy) * 0.55, cz + (mesh.positions[id * 3 + 2] - cz) * 0.55], n, 0, fresh, tone));
    for (let k = 0; k < boundary.length; k++) {
      const k1 = (k + 1) % boundary.length;
      tri(boundary[k], boundary[k1], inner2[k1]);
      tri(boundary[k], inner2[k1], inner2[k]);
      tri(centre, inner2[k], inner2[k1]);
    }
  }
  // the arris strips: outside face F (where the edge runs a -> b), across toward G
  for (const e of edges.values()) {
    if (e.F < 0 || e.G < 0) continue;
    const S = segmentsOf(e.F, e.G);
    for (let m = 0; m < e.M; m++) for (let s = 0; s < S; s++) {
      const A = along(e, m, s), B = along(e, m + 1, s), C = along(e, m + 1, s + 1), D = along(e, m, s + 1);
      tri(A, C, B); tri(A, D, C);
    }
  }
  // the corner patches: the faces round each vertex counter-clockwise from outside, fanned from their mean normal
  verts.forEach((p, v) => {
    const round = faces.filter((face) => face.loop.includes(v)).map((face) => face.plane);
    if (round.length < 3) return;
    let cx = 0, cy = 0, cz = 0;
    for (const f of round) { const n = normalOf(f); cx += n[0]; cy += n[1]; cz += n[2]; }
    const cl = Math.hypot(cx, cy, cz) || 1; cx /= cl; cy /= cl; cz /= cl;
    let ex = Math.abs(cy) < 0.9 ? 0 : 1, ey = Math.abs(cy) < 0.9 ? 1 : 0, ez = 0;
    const dot = ex * cx + ey * cy + ez * cz;
    ex -= dot * cx; ey -= dot * cy; ez -= dot * cz;
    const el = Math.hypot(ex, ey, ez); ex /= el; ey /= el; ez /= el;
    const gx = cy * ez - cz * ey, gy = cz * ex - cx * ez, gz = cx * ey - cy * ex;
    const angle = (f: number): number => { const n = normalOf(f); return Math.atan2(n[0] * gx + n[1] * gy + n[2] * gz, n[0] * ex + n[1] * ey + n[2] * ez); };
    round.sort((a, b) => angle(a) - angle(b));
    const rim: number[] = [];
    for (let k = 0; k < round.length; k++) {
      const S = segmentsOf(round[k], round[(k + 1) % round.length]);
      for (let s = 0; s < S; s++) rim.push(arc(v, round[k], round[(k + 1) % round.length], s));
    }
    // a corner whose rim is only its faces' corners (one segment across every arris) is the triangle fan of its rim: a
    // centre point would sit on the patch's edge where two of its faces nearly agree, and fold under the weathering
    if (rim.length === round.length) {
      for (let k = 1; k + 1 < rim.length; k++) tri(rim[0], rim[k], rim[k + 1]);
      return;
    }
    const centre = vertex(`p${v}`, [p[0] + r * cx, p[1] + r * cy, p[2] + r * cz], [cx, cy, cz], 1, 0, body.tone);
    for (let k = 0; k < rim.length; k++) tri(centre, rim[k], rim[(k + 1) % rim.length]);
  });
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

/** A boulder form and the per-vertex facts its tone law reads. */
interface BoulderForm {
  geometry: THREE.BufferGeometry;
  /** 0 on a joint face, rising to 1 across an arris or a corner. */
  edge: Float32Array;
  /** The fresh fractures' share. */
  fresh: Float32Array;
  /** The block's own shade (-1..1), and its face's. */
  facet: Float32Array;
}

/** The ground line in the form's unit space: above it the form keeps inside the legacy hull. */
export const BOULDER_SEAT_Y = 0;

export function buildBoulderForm(
  variant: number, noise: SimplexNoise, rng: () => number, hull: readonly number[], subdiv = 6, topY = 0,
  kindIndex = variant % 3, lithology: BoulderLithology = 'granite',
): BoulderForm {
  const kind = BOULDER_KINDS[kindIndex] ?? BOULDER_KINDS[0];
  const forms = LITHOLOGY_FORMS[lithology];
  const fine = subdiv >= 6;
  const bodies = boulderBodies(kind, rng, forms.soft, forms.bedded && (kind === 'bedded block' || kind === 'slab'), !fine);
  // the fit, estimated on the blocks' sharp polytopes, is applied to the planes before they are rounded: every arris is
  // rounded (and its segments counted) in the rock's own fitted proportions, never stretched after (a slab's fit doubles
  // its height)
  let top0 = -Infinity;
  const corners: number[][] = [];
  for (const body of bodies) for (const v of polytope(body.planes.map(([x, y, z, d]) => [x, y, z, d] as [number, number, number, number])).verts) { corners.push(v); top0 = Math.max(top0, v[1]); }
  const ky0 = topY > 0 && top0 > 0 ? (topY * 0.98) / top0 : 1;
  let kx0 = Infinity;
  for (const [x, y, z] of corners) {
    if (y * ky0 < BOULDER_SEAT_Y) continue;
    const rr = Math.hypot(x, z);
    if (rr > 1e-6) kx0 = Math.min(kx0, (hullRadiusAt(hull, x / rr, z / rr) * 0.985) / rr);
  }
  if (!Number.isFinite(kx0)) kx0 = 1;
  for (const body of bodies) {
    body.planes = body.planes.map(([x, y, z, d, fresh]) => {
      const nx = x / kx0, ny = y / ky0, nz = z / kx0, l = Math.hypot(nx, ny, nz);
      // (the skirt's floor: as deep under the fitted rock whatever its kind)
      return fresh < 0 ? [0, -1, 0, Math.max(d / l, BOULDER_FLOOR), 0] as JointPlane : [nx / l, ny / l, nz / l, d / l, fresh] as JointPlane;
    });
  }
  const mesh: BoulderMesh = { positions: [], normals: [], index: [], arris: [], fresh: [], tone: [], radius: [] };
  for (const body of bodies) addRoundedBlock(body, fine ? Math.PI / 3 : Math.PI, fine ? 2 : 1, fine ? 1.4 : 9, false, mesh);
  const count = mesh.positions.length / 3;
  const pos = new Float32Array(mesh.positions), nor = new Float32Array(mesh.normals);
  // weathering: a smooth warp of the whole rock (two octaves, its slope everywhere far under one: no face can fold, and
  // nearby points move together, so even a hand-wide corner keeps its shape) bends every joint face a little, never a
  // perfect plane; the normals carried through the warp's Jacobian (the inverse transpose, by central differences)
  const salt = variant * 7.7 + rng() * 50, A = 0.034, F = 1.2, A2 = 0.01, F2 = 3.1, h = 1e-3;
  const warp = (x: number, y: number, z: number, out: number[]): void => {
    out[0] = x + A * noise.noise3d(x * F + salt, y * F, z * F) + A2 * noise.noise3d(x * F2 - salt, y * F2, z * F2);
    out[1] = y + (A * noise.noise3d(x * F, y * F + salt, z * F) + A2 * noise.noise3d(x * F2, y * F2 - salt, z * F2)) * 0.7;
    out[2] = z + A * noise.noise3d(x * F, y * F, z * F + salt) + A2 * noise.noise3d(x * F2, y * F2, z * F2 - salt);
  };
  const w0 = [0, 0, 0], w1 = [0, 0, 0], J = new Float64Array(9);
  for (let v = 0; v < count; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let axis = 0; axis < 3; axis++) {
      warp(x + (axis === 0 ? h : 0), y + (axis === 1 ? h : 0), z + (axis === 2 ? h : 0), w1);
      warp(x - (axis === 0 ? h : 0), y - (axis === 1 ? h : 0), z - (axis === 2 ? h : 0), w0);
      for (let row = 0; row < 3; row++) J[row * 3 + axis] = (w1[row] - w0[row]) / (2 * h);
    }
    // the cofactor matrix is the inverse transpose up to the determinant's scale
    const nx = nor[v * 3], ny = nor[v * 3 + 1], nz = nor[v * 3 + 2];
    const c00 = J[4] * J[8] - J[5] * J[7], c01 = J[5] * J[6] - J[3] * J[8], c02 = J[3] * J[7] - J[4] * J[6];
    const c10 = J[2] * J[7] - J[1] * J[8], c11 = J[0] * J[8] - J[2] * J[6], c12 = J[1] * J[6] - J[0] * J[7];
    const c20 = J[1] * J[5] - J[2] * J[4], c21 = J[2] * J[3] - J[0] * J[5], c22 = J[0] * J[4] - J[1] * J[3];
    const mx = c00 * nx + c10 * ny + c20 * nz, my = c01 * nx + c11 * ny + c21 * nz, mz = c02 * nx + c12 * ny + c22 * nz;
    const ml = Math.hypot(mx, my, mz) || 1;
    nor[v * 3] = mx / ml; nor[v * 3 + 1] = my / ml; nor[v * 3 + 2] = mz / ml;
    warp(x, y, z, w0);
    pos[v * 3] = w0[0]; pos[v * 3 + 1] = w0[1]; pos[v * 3 + 2] = w0[2];
  }
  // as tall as the legacy rock (its collider's cover), then inside the legacy hull above the ground line
  let top = -Infinity;
  for (let v = 0; v < count; v++) top = Math.max(top, pos[v * 3 + 1]);
  const ky = topY > 0 && top > 0 ? (topY * 0.98) / top : 1;
  let kx = Infinity;
  for (let v = 0; v < count; v++) {
    if (pos[v * 3 + 1] * ky < BOULDER_SEAT_Y) continue;
    const x = pos[v * 3], z = pos[v * 3 + 2], rr = Math.hypot(x, z);
    if (rr > 1e-6) kx = Math.min(kx, (hullRadiusAt(hull, x / rr, z / rr) * 0.985) / rr);
  }
  if (!Number.isFinite(kx)) kx = 1;
  for (let v = 0; v < count; v++) {
    let x = pos[v * 3] * kx, z = pos[v * 3 + 2] * kx;
    const y = pos[v * 3 + 1] * ky;
    // under the ground line the stone is held softly to the hull (a few per cent over it where a slope's downhill side
    // can bare it, more deeper down), so a hull never meets a rock it can't see
    const rr = Math.hypot(x, z);
    if (y < BOULDER_SEAT_Y && rr > 1e-6) {
      const deep = clamp((-y - 0.4) / 0.3, 0, 1);
      const limit = hullRadiusAt(hull, x / rr, z / rr) * (1.03 + 0.12 * deep * deep * (3 - 2 * deep));
      const soft = 0.04 * limit, k = (limit - soft * Math.log(1 + Math.exp((limit - rr) / soft))) / rr; // a smooth min(r, limit)
      x *= k; z *= k;
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    // a normal under the non-uniform scale: the inverse transpose
    const nx = nor[v * 3] / kx, ny = nor[v * 3 + 1] / ky, nz = nor[v * 3 + 2] / kx, nl = Math.hypot(nx, ny, nz) || 1;
    nor[v * 3] = nx / nl; nor[v * 3 + 1] = ny / nl; nor[v * 3 + 2] = nz / nl;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setIndex(mesh.index);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, edge: new Float32Array(mesh.arris), fresh: new Float32Array(mesh.fresh), facet: new Float32Array(mesh.tone) };
}

/** The lithologies' base tones (sRGB HSL) under a map's rock tone law: a weathered grey, the chalk a cream white. */
const LITHOLOGY_TONE: Readonly<Partial<Record<BoulderLithology, readonly [number, number, number]>>> = Object.freeze({
  chalk: [0.115, 0.1, 0.62],
});

/**
 * The boulder's vertex tone: the map's rock tone over its lithology's base (a weathered grey), each block a shade of its
 * own (a hard bed paler, a soft one darker), the fresh fractures paler and greyer, the arrises a little paler (worn), the
 * upward faces taking the map's cap tone harder. Linear RGB in a 'color' attribute.
 */
export function paintBoulder(form: BoulderForm, tone: ToneFunction | null | undefined, lithology: BoulderLithology = 'granite'): void {
  const g = form.geometry, p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const [bh, bs, bl] = LITHOLOGY_TONE[lithology] ?? [0.09, 0.07, 0.28];
  for (let i = 0; i < p.count; i++) {
    const up = clamp(n.getY(i), 0, 1), worn = clamp(form.edge[i] * 1.2, 0, 1), fresh = clamp(form.fresh[i], 0, 1);
    const l = bl + p.getY(i) * 0.04 + up * up * 0.1 + form.facet[i] * 0.045 + fresh * 0.05 + worn * 0.03;
    let h = bh + form.facet[i] * 0.008, s = bs * (1 - fresh * 0.45), lt = clamp(l, 0.15, bl > 0.4 ? 0.82 : 0.5);
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
export function applyRockShaderHook(shader: RockShader, dressing: RockDressing, lichenTile: THREE.Texture | null = null): void {
  shader.uniforms.uRockMoss = { value: dressing.moss };
  shader.uniforms.uRockDust = { value: dressing.dust };
  shader.uniforms.uRockSoil = { value: new THREE.Vector3(...dressing.soil) };
  shader.uniforms.uRockLichen = { value: new THREE.Vector3(lichenTile ? dressing.lichen[0] : 0, dressing.lichen[1], dressing.lichen[2]) };
  shader.uniforms.uRockLichenA = { value: new THREE.Vector3(...dressing.lichenA) };
  shader.uniforms.uRockLichenB = { value: new THREE.Vector3(...dressing.lichenB) };
  shader.uniforms.uRockVarnish = { value: dressing.varnish };
  shader.uniforms.uRockLichenTile = { value: lichenTile };
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
uniform sampler2D uRockLichenTile;`);
  // the triplanar detail multiplies in the map slot (order-free); the laws mix after the vertex tone has multiplied
  // (three's color_fragment), so they are the final colour, not a tint under it
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`
vec3 rockTw = abs(vGrimeN); rockTw = rockTw * rockTw * rockTw * rockTw; rockTw /= max(1e-4, rockTw.x + rockTw.y + rockTw.z);
vec3 rockPw = vGrimeW * 0.62;
float rockDetail = 0.8;
#ifdef USE_MAP
rockDetail = texture2D(map, rockPw.yz).r * rockTw.x + texture2D(map, rockPw.xz).r * rockTw.y + texture2D(map, rockPw.xy).r * rockTw.z;
diffuseColor.rgb *= 0.42 + 0.66 * rockDetail;
#endif`);
  // the normal tile, triplanar in world space: three's tangent frame (normal_fragment_maps) divides by the UV
  // derivatives, which are zero on a mesh without UVs, so its chunk is replaced outright
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>', /* glsl */`
#ifdef USE_NORMALMAP
{
  vec3 rockTx = texture2D(normalMap, rockPw.yz).xyz * 2.0 - 1.0;
  vec3 rockTy = texture2D(normalMap, rockPw.xz).xyz * 2.0 - 1.0;
  vec3 rockTz = texture2D(normalMap, rockPw.xy).xyz * 2.0 - 1.0;
  vec3 rockPert = vec3(0.0, rockTx.x, rockTx.y) * rockTw.x + vec3(rockTy.x, 0.0, rockTy.y) * rockTw.y + vec3(rockTz.x, rockTz.y, 0.0) * rockTw.z;
  vec3 rockN = normalize(normalize(vGrimeN) + rockPert * 0.55);
  normal = normalize((viewMatrix * vec4(rockN, 0.0)).xyz);
}
#endif`);
  shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <color_fragment>', /* glsl */`#include <color_fragment>
{
  if (vRockSeed >= 0.0) {
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
  // and a boulder darkens where it meets the ground (the occlusion of the turf and the soil round its foot)
  if (vRockSeed >= 0.0) diffuseColor.rgb *= 0.55 + 0.45 * smoothstep(-0.04 + soilTop * 0.5, 0.3 + soilTop * 0.5, vRockAbove);
}`);
}
