import * as THREE from 'three';
import { KIT } from './profiles/kit.ts';
import { cloneVehicleMaterial } from './materials.ts';
import { oplotFlankOuterX } from './oplotFlankLayout.ts';
import {
  configureFoliageMaterial, FoliageCardBuffer, foliageCardPoints, vehicleFoliageAtlas, type FoliageCard, type VehicleFoliageKind,
} from './vehicleFoliage.ts';

type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];
type GhillieStyle = 'leafy' | 'ulcans' | 'nakidka';
type GhillieOwner = 'hull' | 'turret' | 'gun';
type DisposableResource = { dispose(): void };

interface TopPanel {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  nx?: number;
  nz?: number;
  yAt(x: number, z: number): number;
  outline?: readonly Point2[];
  holes?: readonly (readonly Point2[])[];
  /** Remove every cell any of whose corners falls in an opening (the authored A4 openings' rule), not just its centre. */
  strictHoles?: boolean;
  /** Regions where the carrier continues but no spray may sit (track lanes at the hull's ends). */
  foliageExclude?: readonly (readonly Point2[])[];
  seatGapM?: number;
  seat?: string;
  seed?: number;
  /** Garnish only within this distance of the panel's outer edge (a hull deck under the turret's sweep). */
  garnishEdgeBandM?: number;
  /** The highest a spray's stem line may stand above this carrier (default 0.22 m; low under the turret and gun sweep). */
  garnishRiseM?: number;
  /** Scales the panel's garnish count (default 1). */
  garnishDensity?: number;
  /** Clear margin around every opening (hatches, sights; default 0.09 m). */
  garnishOpeningMarginM?: number;
  /** Scales an unseated carrier's billow and gathered folds (default 1; a hull deck under the turret's sweep keeps it low). */
  reliefScale?: number;
}

interface SidePanel {
  side: number;
  z0: number;
  z1: number;
  nz?: number;
  ny?: number;
  topAt(z: number): number;
  bottomAt(z: number): number;
  outAt(z: number, t: number): number;
  seed?: number;
  /**
   * Round 3: the drape rolls over the wall's top edge into the roof net between z0 and z1 instead of ending in a free
   * edge — from its top (outAt(z, 1), topAt(z)) up and inboard to the roof net's edge (inAt(z), yAt(z)).
   */
  shoulder?: { readonly z0: number; readonly z1: number; inAt(z: number): number; yAt(z: number): number };
}

interface FacePanel {
  z: number;
  zAt?(x: number, y: number): number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  nx?: number;
  ny?: number;
  outline?: readonly Point2[];
  holes?: readonly (readonly Point2[])[];
  strictHoles?: boolean;
  seatGapM?: number;
  seat?: string;
  seed?: number;
}

interface GhilliePanels {
  top?: readonly TopPanel[];
  side?: readonly SidePanel[];
  face?: readonly FacePanel[];
}

export interface GhillieConfig {
  id: string;
  seed: number;
  style: GhillieStyle;
  density: number;
  leafScale: number;
  light: number;
  dark: number;
  netColor: string;
  disabled?: boolean;
  foliage?: boolean;
  /** The certified half-width no spray may reach past (a suit with a width receipt; default unbounded). */
  maxHalfWidth?: number;
  /**
   * The garnish tucked into the net: a species spray atlas of the trees lane (src/world/treeSprayAtlas.ts) for
   * leafy suits, or a painted multispectral cut garnish. Defaults by style (leafy: oak; ulcans / nakidka: woodland).
   */
  foliageKind?: VehicleFoliageKind;
  hull?: GhilliePanels;
  turret?: GhilliePanels;
  gun?: GhilliePanels;
}

interface GhillieBuilderPort {
  spec: { id: string };
  /** HIGH geometry (folded spray cards); LOW keeps the flat four-triangle cards. */
  readonly q?: boolean;
  hullG: THREE.Group;
  turretG: THREE.Group;
  gunG: THREE.Group;
  mats: { canvasCloth: THREE.MeshStandardMaterial };
  disposables: DisposableResource[];
}

// Shared physical-ghillie authoring process.
//
// A suit is a separately suspended equipment mesh, never a paint alias and
// never an armor bucket.  Each vehicle supplies its own cloth outlines,
// carrier height, running-gear hem and working-station openings.  The common
// builder owns deterministic ripples, ragged cell edges, connected cut-net
// texture, overlapping foliage and merged draw-call-safe output.

const noise01 = (n: number, salt = 0): number => {
  const v = Math.sin((n + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const rect = (x0: number, x1: number, z0: number, z1: number): Point2[] => (
  [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]
);

function insidePoly(x: number, z: number, poly: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-6) + xi)) inside = !inside;
  }
  return inside;
}

function makeGeometry(positions: number[], uvs: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// 2026-10-06 (round 2: the critics read the suits as nets "lying flat like decals or standing as rigid fences"): the
// carrier billows between its tie points on a deck, its hem sags in scallops between the ties along a flank, and the
// flank drape hangs in pleats that fold back toward the hull (never out past the authored carrier). A panel seated on
// a hard surface (seatGapM) keeps a shallow relief so it stays on that surface.
//
// Round 3 (2026-10-07: "a flat lattice pressed onto the armour like a stencil, with no thickness, sag, bunching or
// tie-downs", "the net stands straight up as a stiff free-standing fence", "near-identical scalloped edges on both hull
// sides"): the round-2 relief was a sine lattice on one 0.58 m tie pitch — itself a regular grid. The cloth now lies on
// seeded value noise: a broad swell, small wrinkles and meandering gathered folds (the zero set of a third field),
// pulled back onto its support at seeded tie-downs along the panel's edges. A flank hem is tied at irregular points
// drawn per panel (each side its own), sags between them by its own depth, billows out between ties and is drawn in at
// each tie; and a drape may roll over the wall's top edge into the roof net (SidePanel.shoulder) instead of standing
// as a free edge. Relief only ever lifts the cloth off its authored carrier height, never into the armour.

/** Integer hash of a lattice point -> [0, 1). */
function hash01(i: number, j: number, seed: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth seeded value noise in [-1, 1] on a lattice of `cell` metres (smoothstep-blended corners). */
function clothNoise(u: number, v: number, cell: number, seed: number): number {
  const fu = u / cell, fv = v / cell;
  const iu = Math.floor(fu), iv = Math.floor(fv);
  const su = fu - iu, sv = fv - iv;
  const wu = su * su * (3 - 2 * su), wv = sv * sv * (3 - 2 * sv);
  const a = hash01(iu, iv, seed), b = hash01(iu + 1, iv, seed), c = hash01(iu, iv + 1, seed), d = hash01(iu + 1, iv + 1, seed);
  return (a + (b - a) * wu + (c - a) * wv + (a - b - c + d) * wu * wv) * 2 - 1;
}

const panelSeed = (panel: { seed?: number }, suitSeed: number): number => ((panel.seed ?? 0) * 7919 + suitSeed * 31) | 0;

/** A top panel's tie-downs: seeded points along its outline's edges where the cord pulls the net onto its support. */
const TIE_CACHE = new WeakMap<TopPanel, Point2[]>();
function topTiePoints(panel: TopPanel, suitSeed: number): Point2[] {
  const cached = TIE_CACHE.get(panel);
  if (cached) return cached;
  const poly = panel.outline ?? rect(panel.x0, panel.x1, panel.z0, panel.z1);
  const rng = hash01;
  const s = panelSeed(panel, suitSeed);
  const ties: Point2[] = [];
  let k = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const len = Math.hypot(bx - ax, bz - az);
    for (let at = 0.25 + rng(k++, 1, s) * 0.4; at < len - 0.15; at += 0.6 + rng(k++, 2, s) * 0.7) {
      // a tie sits a few centimetres inside the edge
      const t = at / len, inset = 0.05 + rng(k++, 3, s) * 0.08;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const sign = insidePoly(px + nx * 0.02, pz + nz * 0.02, poly) ? 1 : -1;
      ties.push([px + sign * nx * inset, pz + sign * nz * inset]);
    }
  }
  TIE_CACHE.set(panel, ties);
  return ties;
}

/** The cloth's lift off a top panel's carrier at (x, z): swell, wrinkles, gathered folds, held down at the ties. */
function netRelief(x: number, z: number, panel: TopPanel, suitSeed: number, seated: boolean): number {
  const s = panelSeed(panel, suitSeed);
  const swell = clothNoise(x, z, 0.62, s);
  const fine = clothNoise(x, z, 0.21, s + 17);
  const fold = clothNoise(x * 0.85 + z * 0.4, z * 0.9 - x * 0.35, 0.5, s + 31);
  const ridge = Math.max(0, 1 - Math.abs(fold) / 0.16) ** 2;
  if (seated) return 0.004 + 0.004 * swell + 0.003 * fine + 0.006 * ridge;
  let lift = (panel.reliefScale ?? 1) * (0.012 * (1 + swell) + 0.004 * (1 + fine) + 0.04 * ridge);
  for (const [tx, tz] of topTiePoints(panel, suitSeed)) {
    const d2 = (x - tx) * (x - tx) + (z - tz) * (z - tz);
    if (d2 < 0.09) lift *= 1 - Math.exp(-d2 / 0.012);
  }
  return lift;
}

/** A face panel's outward lift (seated faces keep within their gap). */
function netReliefFace(x: number, y: number, panel: FacePanel, suitSeed: number): number {
  const s = panelSeed(panel, suitSeed);
  const swell = clothNoise(x, y, 0.5, s), fine = clothNoise(x, y, 0.19, s + 11);
  if (panel.seatGapM !== undefined) return 0.003 + 0.003 * swell + 0.002 * fine;
  return 0.01 * (1 + swell) + 0.004 * (1 + fine);
}

/** A flank's hem ties: irregular positions and per-span sag depths, drawn per panel (each side its own). */
interface HemTies { readonly at: number[]; readonly depth: number[] }
const HEM_CACHE = new WeakMap<SidePanel, HemTies>();
function hemTies(panel: SidePanel, suitSeed: number): HemTies {
  const cached = HEM_CACHE.get(panel);
  if (cached) return cached;
  const s = panelSeed(panel, suitSeed) ^ (panel.side > 0 ? 0x5a5a : 0x1f1f);
  const at: number[] = [], depth: number[] = [];
  let k = 0;
  for (let z = panel.z0 - hash01(k++, 7, s) * 0.35; z < panel.z1 + 0.9; z += 0.42 + hash01(k++, 8, s) * 0.62) {
    at.push(z);
    depth.push(0.03 + hash01(k++, 9, s) * 0.08);   // round 4: 3-11 cm scallops (were 1.4-6.4 cm)
  }
  const ties = { at, depth };
  HEM_CACHE.set(panel, ties);
  return ties;
}
function hemAt(ties: HemTies, z: number): { drop: number; span: number; tie: number } {
  const { at, depth } = ties;
  let i = 0;
  while (i < at.length - 2 && at[i + 1] < z) i++;
  const a = at[i], b = at[i + 1] ?? a + 0.6;
  const f = THREE.MathUtils.clamp((z - a) / Math.max(1e-3, b - a), 0, 1);
  const span = Math.pow(Math.sin(Math.PI * f), 1.3);
  const near = Math.min(Math.abs(z - a), Math.abs(z - b));
  return { drop: depth[i] * span, span, tie: Math.exp(-(near * near) / 0.006) };
}
/** The lowest a flank hem may sag: never into the running gear's corridor (ghillieSuit.selftest: above 0.52 m). */
const NET_HEM_FLOOR_M = 0.545;
/** How far out of phase the two flanks read their authored hem (round 3: "near-identical scalloped edges on both sides"). */
const HEM_PHASE_M = 0.29;
/** Net texture repeats per metre by style (round 3: a finer mesh, about 6.5 cm cells for a leafy net). */
const netUvPerM = (style: GhillieStyle): number => (style === 'leafy' ? 1.1 : 0.85);

function clothTop(panel: TopPanel, suitSeed: number, style: GhillieStyle): THREE.BufferGeometry {
  const {
    x0, x1, z0, z1, nx = 18, nz = 30, yAt, outline = null, holes = [], seed = 0,
  } = panel;
  const positions: number[] = [];
  const uvs: number[] = [];
  const seated = panel.seatGapM !== undefined;
  const uvk = netUvPerM(style);
  const vertex = (x: number, z: number): Point3 => [x, yAt(x, z) + netRelief(x, z, panel, suitSeed, seated), z];
  const tri = (a: Point3, b: Point3, c: Point3): void => {
    for (const p of [a, b, c]) {
      positions.push(...p);
      uvs.push(p[0] * uvk, p[2] * uvk);
    }
  };
  for (let iz = 0; iz < nz; iz++) {
    const za = THREE.MathUtils.lerp(z0, z1, iz / nz);
    const zb = THREE.MathUtils.lerp(z0, z1, (iz + 1) / nz);
    for (let ix = 0; ix < nx; ix++) {
      const xa = THREE.MathUtils.lerp(x0, x1, ix / nx);
      const xb = THREE.MathUtils.lerp(x0, x1, (ix + 1) / nx);
      const cx = (xa + xb) * 0.5;
      const cz = (za + zb) * 0.5;
      if (outline && !insidePoly(cx, cz, outline)) continue;
      if (holes.some((hole) => insidePoly(cx, cz, hole))) continue;
      if (panel.strictHoles && holes.some((hole) => [[xa, za], [xb, za], [xb, zb], [xa, zb]]
        .some(([px, pz]) => insidePoly(px, pz, hole)))) continue;
      // Deterministically tear a few perimeter-adjacent cells.  The carrier
      // remains connected while its silhouette stops reading machine-cut.
      const edge = ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1;
      if (edge && noise01(ix + iz * nx + seed, suitSeed) < 0.23) continue;
      const a = vertex(xa, za); const b = vertex(xb, za);
      const c = vertex(xb, zb); const d = vertex(xa, zb);
      tri(a, c, b); tri(a, d, c);
    }
  }
  return makeGeometry(positions, uvs);
}

/**
 * A flank drape's outward offset past its authored wall line at (z, t): fine pleats, the billow between the hem ties
 * (the cord draws the hem in at a tie), and a slow belly over the drape's height. Round 4 (2026-10-07, wave 216 on the
 * PT-91: "the side net is a straight vertical wall"): the billow and belly grew from about 1 cm to 3-6 cm. The cloth
 * and the garnish seated on it read the same offset.
 */
function drapeOffset(panel: SidePanel, suitSeed: number, z: number, t: number): number {
  const s = panelSeed(panel, suitSeed) ^ (panel.side > 0 ? 0x2b : 0x71);
  const hem = hemAt(hemTies(panel, suitSeed), z);
  const low = 1 - t;
  const pleatField = clothNoise(z, t * 0.6, 0.11, s);
  const pleat = 0.009 * (pleatField > 0 ? pleatField : 1.7 * pleatField) * (0.45 + 0.55 * low);
  const draw = low * (0.034 * hem.span - 0.03 * hem.tie);
  const belly = 0.022 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.6 + 0.4 * clothNoise(z, 0.5, 0.85, s + 13));
  return pleat + draw + belly;
}

function clothSide(panel: SidePanel, suitSeed: number, style: GhillieStyle, maxHalfWidth = Infinity): THREE.BufferGeometry {
  const {
    side, z0, z1, nz = 30, ny = 9, topAt, bottomAt, outAt, shoulder,
  } = panel;
  const positions: number[] = [];
  const uvs: number[] = [];
  const s = panelSeed(panel, suitSeed) ^ (side > 0 ? 0x2b : 0x71);
  const ties = hemTies(panel, suitSeed);
  const uvk = netUvPerM(style);
  const SHOULDER_ROWS = 3;
  // (z, row) -> position and the cloth's running length up from the hem (the texture's v)
  const vertex = (z: number, row: number): { p: Point3; v: number } => {
    const top = topAt(z);
    // the authored hems are one symmetric undulation; each flank reads it a little out of phase with the other
    const authoredBottom = bottomAt(z + side * HEM_PHASE_M);
    const hem = hemAt(ties, z);
    const bottom = Math.max(authoredBottom - hem.drop, Math.min(authoredBottom, NET_HEM_FLOOR_M));
    if (row <= ny) {
      const t = row / ny;
      // between ties the drape billows out; at a tie the cord draws the hem in toward the hull (drapeOffset)
      const wobble = 0.008 * clothNoise(z, t, 0.3, s + 5) * (1 - t * t * t * t);
      const y = THREE.MathUtils.lerp(bottom, top, t) + wobble;
      // a suit with a certified half-width keeps its billow inside it (the A4's 3.70 m receipt)
      return { p: [side * Math.min(outAt(z, t) + drapeOffset(panel, suitSeed, z, t), maxHalfWidth - 0.002), y, z], v: y };
    }
    // the roll over the wall's top edge into the roof net: a quadratic from the drape's top to the net's edge
    const k = (row - ny) / SHOULDER_ROWS;
    const xOut = outAt(z, 1), xIn = shoulder!.inAt(z), yIn = shoulder!.yAt(z);
    const cx = xOut + 0.014, cy = Math.max(top, yIn) + 0.03 + 0.008 * clothNoise(z, 0, 0.27, s + 9);
    const u = 1 - k;
    const x = u * u * xOut + 2 * u * k * cx + k * k * xIn;
    const y = u * u * top + 2 * u * k * cy + k * k * yIn;
    return { p: [side * x, y, z], v: top + Math.hypot(x - xOut, y - top) };
  };
  const tri = (a: { p: Point3; v: number }, b: { p: Point3; v: number }, c: { p: Point3; v: number }): void => {
    for (const q of [a, b, c]) {
      positions.push(...q.p);
      uvs.push(q.p[2] * uvk, q.v * uvk);
    }
  };
  for (let iz = 0; iz < nz; iz++) {
    const za = THREE.MathUtils.lerp(z0, z1, iz / nz);
    const zb = THREE.MathUtils.lerp(z0, z1, (iz + 1) / nz);
    const rolled = shoulder && za >= shoulder.z0 && zb <= shoulder.z1;
    const rows = ny + (rolled ? SHOULDER_ROWS : 0);
    for (let iy = 0; iy < rows; iy++) {
      if (iy === 0 && noise01(iz + (panel.seed ?? 0), suitSeed + side) < 0.19) continue;
      const a = vertex(za, iy); const b = vertex(zb, iy);
      const c = vertex(zb, iy + 1); const d = vertex(za, iy + 1);
      if (side > 0) { tri(a, b, c); tri(a, c, d); }
      else { tri(a, c, b); tri(a, d, c); }
    }
  }
  return makeGeometry(positions, uvs);
}

function clothFace(panel: FacePanel, suitSeed: number, style: GhillieStyle): THREE.BufferGeometry {
  const {
    z, zAt = null, x0, x1, y0, y1, nx = 16, ny = 9, outline = null, holes = [], seed = 0,
  } = panel;
  const positions: number[] = [];
  const uvs: number[] = [];
  const facing = z >= 0 || (zAt ? zAt((x0 + x1) / 2, (y0 + y1) / 2) >= 0 : false) ? 1 : -1;
  const uvk = netUvPerM(style);
  const vertex = (x: number, y: number): Point3 => [x, y,
    (zAt ? zAt(x, y) : z) + facing * netReliefFace(x, y, panel, suitSeed)];
  const tri = (a: Point3, b: Point3, c: Point3): void => {
    for (const p of [a, b, c]) {
      positions.push(...p);
      uvs.push(p[0] * uvk, p[1] * uvk);
    }
  };
  for (let iy = 0; iy < ny; iy++) {
    const ya = THREE.MathUtils.lerp(y0, y1, iy / ny);
    const yb = THREE.MathUtils.lerp(y0, y1, (iy + 1) / ny);
    for (let ix = 0; ix < nx; ix++) {
      const xa = THREE.MathUtils.lerp(x0, x1, ix / nx);
      const xb = THREE.MathUtils.lerp(x0, x1, (ix + 1) / nx);
      const cx = (xa + xb) * 0.5; const cy = (ya + yb) * 0.5;
      if (outline && !insidePoly(cx, cy, outline)) continue;
      if (holes.some((hole) => insidePoly(cx, cy, hole))) continue;
      if (panel.strictHoles && holes.some((hole) => [[xa, ya], [xb, ya], [xb, yb], [xa, yb]]
        .some(([px, py]) => insidePoly(px, py, hole)))) continue;
      const edge = ix === 0 || iy === 0 || ix === nx - 1 || iy === ny - 1;
      if (edge && noise01(ix + iy * nx + seed, suitSeed) < 0.20) continue;
      const a = vertex(xa, ya); const b = vertex(xb, ya);
      const c = vertex(xb, yb); const d = vertex(xa, yb);
      tri(a, b, c); tri(a, c, d);
    }
  }
  return makeGeometry(positions, uvs);
}

// ---------------------------------------------------------------------------------------------------------------
// Garnish: spray cards seated stem-first in the net (vehicleFoliage.ts).
//
// Round 3 (2026-10-07, the blind critics on the round-2 close-ups: "hundreds of near-identical pale-green leaf cut-outs
// sprinkled at even density", "oak-leaf cards in neat, evenly spaced rows inside a regular net grid, like wallpaper",
// "on the glacis they lie flat like stickers", "covering places no crew would block"). A crew stuffs cut boughs into a
// net in bunches: the garnish is now placed as clumps on a seeded point process — clump sizes from a single sprig to a
// nine-spray bough, irregular gaps, a slow field of where the crew stuffed more — never one spray per lattice cell. A
// clump's sprays fan out of one tuck point and stand out of the net (folded along their stems at the near level),
// lean aft and outboard, hang on drapes, and keep their colour as one cut bough (deep greens, some wilting). Hatches,
// sights and the driver's vision keep a margin; hull decks under the turret's sweep carry garnish only along their
// edges, low; every spray stays inside the suit's certified half-width.
// ---------------------------------------------------------------------------------------------------------------

function defaultFoliageKind(style: GhillieStyle): VehicleFoliageKind {
  return style === 'leafy' ? 'oak' : 'garnish-woodland';
}

/** The garnish's own seeded stream (mulberry32): placement draws never share the cloth's noise lattice. */
function garnishStream(seed: number): () => number {
  let a = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x5bd1e995) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One cut bough's colour: the suit's palette pulls the atlas a little; most cuts a deep green, a few wilting. */
function clumpTint(cfg: GhillieConfig, rng: () => number): [number, number, number] {
  const light = new THREE.Color(cfg.light), dark = new THREE.Color(cfg.dark);
  const mix = light.lerp(dark, 0.3 + rng() * 0.65);
  const k = (c: number, ref: number) => THREE.MathUtils.clamp(0.55 + (c / ref) * 0.45, 0.62, 1.22);
  // round 3 ("pale, washed-out lime-and-cream ... closer to lettuce heads"): a full stop darker than round 2's
  // 0.58-0.94, the yellow pulled out of the sunlit tips, and a share of cuts wilting toward olive-brown
  const value = 0.34 + rng() * 0.27;
  const wilt = rng() < 0.2 ? 0.3 + rng() * 0.6 : 0;
  return [k(mix.r, 0.11) * value * 0.8 * (1 + wilt * 0.6), k(mix.g, 0.15) * value * (1 - wilt * 0.12),
    k(mix.b, 0.07) * value * 0.9 * (1 - wilt * 0.3)];
}

function sprayTint(base: readonly number[], rng: () => number): [number, number, number] {
  const v = 0.84 + rng() * 0.3, warm = (rng() - 0.5) * 0.08;
  return [base[0] * v * (1 + warm), base[1] * v, base[2] * v * (1 - warm)];
}

function cardSize(cfg: GhillieConfig, rng: () => number): { length: number; width: number } {
  const base = cfg.style === 'leafy' ? 0.5 : 0.44;
  const length = base * cfg.leafScale * (0.68 + rng() * 0.6);
  return { length, width: length * (cfg.style === 'leafy' ? 0.92 : 1.02) };
}

/** Sprays per square metre of carrier (times the suit's density), and clump sizes in sprays (drawn uniformly). */
// Round 4 (2026-10-07, wave 216 on the Strv 103A: "leaf cards spread evenly across the net like a printed pattern", "a
// single green blanket draped over the vehicle ... the hull's own silhouette is barely legible"): about 40 % fewer
// sprays, in bigger bunches with more bare net between them (placeGarnishClumps).
const GARNISH_PER_M2 = { leafy: 6.2, cut: 4.6 } as const;
const LEAFY_CLUMP_SIZES = [2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9] as const;
const CUT_CLUMP_SIZES = [1, 2, 2, 3, 3, 4, 5] as const;
const clumpRadius = (size: number): number => 0.07 + 0.034 * size;

function pickClumpSize(cfg: GhillieConfig, rng: () => number): number {
  const sizes = cfg.style === 'leafy' ? LEAFY_CLUMP_SIZES : CUT_CLUMP_SIZES;
  return sizes[Math.min(sizes.length - 1, Math.floor(rng() * sizes.length))];
}

interface GarnishClump { u: number; v: number; size: number }

/**
 * Clump seats on a 2D domain: candidates uniform in the rectangle, accepted under a slow seeded "stuffing" field and a
 * spacing that varies per pair (some clumps touch, some leave a hand's width of bare net) — a point process with no
 * lattice. Stops when the spray budget is placed or the candidates run out.
 */
function placeGarnishClumps(
  rng: () => number,
  cfg: GhillieConfig,
  rect: readonly [number, number, number, number],
  allowed: (u: number, v: number) => boolean,
  sprayBudget: number,
  bias: (rng: () => number) => [number, number] = (r) => [r(), r()],
): GarnishClump[] {
  const [u0, u1, v0, v1] = rect;
  const clumps: GarnishClump[] = [];
  if (sprayBudget < 0.5) return clumps;
  const fa = 0.7 + rng() * 1.3, fb = 0.7 + rng() * 1.3, fc = 1.1 + rng() * 1.6, fd = 0.9 + rng() * 1.4;
  const pa = rng() * Math.PI * 2, pb = rng() * Math.PI * 2;
  const stuffing = (u: number, v: number): number => 0.5 + 0.5 * Math.sin(u * fa + v * fb + pa) * Math.cos(u * fc - v * fd + pb);
  let sprays = 0;
  for (let attempt = 0; attempt < 60 + sprayBudget * 30 && sprays < sprayBudget; attempt++) {
    const [ru, rv] = bias(rng);
    const u = u0 + ru * (u1 - u0), v = v0 + rv * (v1 - v0);
    const size = pickClumpSize(cfg, rng);
    const gap = 0.9 + rng() * 1.0;
    const accept = rng();
    if (!allowed(u, v)) continue;
    // round 4: the crew's stuffing field decides more (bunches gather where it is high, bare net where it is low)
    if (accept > 0.1 + 0.9 * Math.pow(stuffing(u, v), 1.6)) continue;
    const r = clumpRadius(size);
    if (clumps.some((c) => Math.hypot(c.u - u, c.v - v) < (r + clumpRadius(c.size)) * gap)) continue;
    clumps.push({ u, v, size });
    sprays += size;
  }
  return clumps;
}

/** Point-in-polygon or within `margin` of its edges. */
function nearPolygon(x: number, z: number, poly: readonly Point2[], margin: number): boolean {
  if (insidePoly(x, z, poly)) return true;
  if (margin <= 0) return false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < margin) return true;
  }
  return false;
}

/** Distance from (x, z) to the polygon's boundary and the outward direction toward it. */
function edgeDistance(x: number, z: number, poly: readonly Point2[]): { d: number; nx: number; nz: number } {
  let best = { d: Infinity, nx: 0, nz: 0 };
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, nx: (px - x) / (d || 1), nz: (pz - z) / (d || 1) };
  }
  return best;
}

/** Shared limits on one spray: the suit's certified half-width and the owner's openings. */
interface GarnishContext {
  readonly q: boolean;
  readonly maxHalfWidth: number;
}

function cardWithin(card: FoliageCard, ctx: GarnishContext, test?: (p: readonly number[]) => boolean): boolean {
  for (const p of foliageCardPoints(card)) {
    if (Math.abs(p[0]) > ctx.maxHalfWidth) return false;
    if (test && !test(p)) return false;
  }
  return true;
}

/** The axis and a face square to it from a heading (radians about +Y from +X), an elevation and a roll. */
function sprayFrame(heading: number, lift: number, roll: number): { axis: [number, number, number]; face: [number, number, number] } {
  const ch = Math.cos(heading), sh = Math.sin(heading), cl = Math.cos(lift), sl = Math.sin(lift);
  const axis: [number, number, number] = [ch * cl, sl, sh * cl];
  const up: [number, number, number] = [-ch * sl, cl, -sh * sl];
  const side: [number, number, number] = [-sh, 0, ch];
  const cr = Math.cos(roll), sr = Math.sin(roll);
  return { axis, face: [up[0] * cr + side[0] * sr, up[1] * cr + side[1] * sr, up[2] * cr + side[2] * sr] };
}

function topFoliagePointAllowed(panel: TopPanel, x: number, z: number, margin = 0): boolean {
  if (x < panel.x0 || x > panel.x1 || z < panel.z0 || z > panel.z1) return false;
  if (panel.outline && !insidePoly(x, z, panel.outline)) return false;
  if ((panel.foliageExclude ?? []).some((region) => nearPolygon(x, z, region, margin * 0.5))) return false;
  return !(panel.holes ?? []).some((hole) => nearPolygon(x, z, hole, margin));
}

function addTopFoliage(
  out: FoliageCardBuffer,
  panel: TopPanel,
  cfg: GhillieConfig,
  seedBase: number,
  ctx: GarnishContext,
): void {
  const rng = garnishStream(seedBase);
  const margin = panel.garnishOpeningMarginM ?? 0.09;
  const band = panel.garnishEdgeBandM;
  const outline = panel.outline ?? rect(panel.x0, panel.x1, panel.z0, panel.z1);
  const seatAllowed = (x: number, z: number): boolean => topFoliagePointAllowed(panel, x, z, margin)
    && (band === undefined || edgeDistance(x, z, outline).d <= band);
  // the carrier's garnished area on a 10 cm raster
  let cells = 0;
  for (let z = panel.z0 + 0.05; z < panel.z1; z += 0.1) for (let x = panel.x0 + 0.05; x < panel.x1; x += 0.1) if (seatAllowed(x, z)) cells++;
  const perM2 = cfg.style === 'leafy' ? GARNISH_PER_M2.leafy : GARNISH_PER_M2.cut;
  const clumps = placeGarnishClumps(rng, cfg, [panel.x0, panel.x1, panel.z0, panel.z1], seatAllowed,
    cells * 0.01 * perM2 * cfg.density * (panel.garnishDensity ?? 1));
  const riseMax = panel.garnishRiseM ?? 0.11;
  const seated = panel.seatGapM !== undefined;
  for (const clump of clumps) {
    const base = clumpTint(cfg, rng);
    const edge = band !== undefined ? edgeDistance(clump.u, clump.v, outline) : null;
    // boughs are tucked butt-forward, so their leaves stream aft and outboard (out of the sights' and gun's way); a
    // deck-edge clump leans out over its edge
    const outboard = Math.sign(clump.u || 1);
    const aft = Math.atan2(-1, 0.55 * outboard);
    const theta0 = edge ? Math.atan2(edge.nz, edge.nx) + (rng() - 0.5) * 0.9 : aft + (rng() - 0.5) * 1.6;
    const fan = clump.size <= 1 ? 0 : clump.size <= 3 ? 1.0 + rng() * 0.7 : clump.size <= 5 ? 2.0 + rng() * 1.0 : 4.6 + rng() * 1.4;
    const r = clumpRadius(clump.size);
    for (let k = 0; k < clump.size; k++) {
      const share = clump.size > 1 ? k / (clump.size - 1) : 0.5;
      const central = 1 - Math.abs(share - 0.5) * 2;
      // every draw for this spray happens here, before any fit or detail branch
      let heading = theta0 + (share - 0.5) * fan + (rng() - 0.5) * 0.45;
      let { length, width } = cardSize(cfg, rng);
      const grow = 0.86 + central * 0.26;
      length *= grow; width *= grow;
      // round 4 (wave 216: "fern fronds hover above the grey hatch slab with their shadows offset beneath them", "the
      // leaf clusters cast separate drop shadows with gaps beneath, so they float"; wave 213: "leaf cards floating off
      // the armour"): a spray is tucked stem-first and lies back along the net, lifted 3-19 degrees (was 19-63)
      let lift = 0.06 + rng() * 0.18 + central * 0.1;
      const roll = (rng() - 0.5) * 0.9;
      const jr = rng() * r * 0.35, ja = rng() * Math.PI * 2;
      const bend = 0.03 + rng() * 0.06;
      const fold = 0.16 + rng() * 0.16;
      const tile = Math.floor(rng() * 4) % 4;
      const tint = sprayTint(base, rng);
      const sx = clump.u + Math.cos(ja) * jr, sz = clump.v + Math.sin(ja) * jr;
      if (!topFoliagePointAllowed(panel, sx, sz, margin * 0.6)) continue;
      // a deck under the turret's sweep keeps its garnish low: the spray lies back toward the net instead of standing
      if (Math.sin(lift) * length > riseMax) lift = Math.asin(THREE.MathUtils.clamp(riseMax / length, 0.05, 1));
      if (lift < 0.2 && riseMax < length * 0.2) length = Math.max(0.22, riseMax / Math.sin(0.2)), lift = 0.2;
      const stemY = (x: number, z: number): number => panel.yAt(x, z) + netRelief(x, z, panel, cfg.seed, seated) - 0.004;
      let placed: FoliageCard | null = null;
      for (const scale of [1, 0.78, 0.6]) {
        for (let turn = 0; turn < 6 && !placed; turn++) {
          const h = heading + (turn % 2 ? -1 : 1) * Math.ceil(turn / 2) * 0.42;
          const len = length * scale;
          const { axis, face } = sprayFrame(h, lift, roll);
          const card: FoliageCard = {
            stem: [sx, stemY(sx, sz), sz], axis, face, out: [0, 1, 0], length: len, width: width * scale,
            tile, bend, tint, fold,
          };
          // the footprint of the whole spray stays on the net and off every opening; nothing drops below the carrier
          const ok = cardWithin(card, ctx, (p) => {
            const overEdge = edge && edgeDistance(p[0], p[2], outline).d < 0.2;
            if (!overEdge && !topFoliagePointAllowed(panel, p[0], p[2], margin * 0.5)) return false;
            if (overEdge && (panel.holes ?? []).some((hole) => nearPolygon(p[0], p[2], hole, margin * 0.5))) return false;
            return p[1] > panel.yAt(THREE.MathUtils.clamp(p[0], panel.x0, panel.x1), THREE.MathUtils.clamp(p[2], panel.z0, panel.z1)) - (overEdge ? 0.12 : 0.012);
          });
          if (ok) { placed = card; heading = h; }
        }
        if (placed) break;
      }
      if (placed) out.push(ctx.q ? placed : { ...placed, fold: 0 });
    }
  }
}

function addSideFoliage(
  out: FoliageCardBuffer,
  panel: SidePanel,
  cfg: GhillieConfig,
  seedBase: number,
  ctx: GarnishContext,
): void {
  const rng = garnishStream(seedBase);
  const span = panel.z1 - panel.z0;
  const zMid = (panel.z0 + panel.z1) / 2;
  const height = Math.max(0.05, panel.topAt(zMid) - panel.bottomAt(zMid));
  const perM2 = (cfg.style === 'leafy' ? GARNISH_PER_M2.leafy : GARNISH_PER_M2.cut) * 1.12;
  // clumps ride high on a drape (tucked under the top cord) more often than low
  const clumps = placeGarnishClumps(rng, cfg, [panel.z0 + 0.1, panel.z1 - 0.1, 0.14, 0.98], () => true,
    span * height * perM2 * cfg.density, (r) => [r(), 1 - Math.pow(r(), 1.45) * 0.86]);
  for (const clump of clumps) {
    const base = clumpTint(cfg, rng);
    const sweep0 = (rng() - 0.5) * 0.9 - 0.25;   // a bough hangs swept a little aft
    const fan = clump.size <= 2 ? 0.5 + rng() * 0.4 : 1.1 + rng() * 0.7;
    for (let k = 0; k < clump.size; k++) {
      const share = clump.size > 1 ? k / (clump.size - 1) : 0.5;
      let sweep = sweep0 + (share - 0.5) * fan + (rng() - 0.5) * 0.3;
      const { length, width } = cardSize(cfg, rng);
      const dz = (rng() - 0.5) * 0.1, dt = (rng() - 0.5) * 0.08;
      const tiltOut = 0.03 + rng() * 0.1;   // round 4: lies on the drape (was 0.08-0.38 rad off it)
      const bend = 0.03 + rng() * 0.06;
      const fold = 0.12 + rng() * 0.14;
      const tile = Math.floor(rng() * 4) % 4;
      const tint = sprayTint(base, rng);
      const z = THREE.MathUtils.clamp(clump.u + dz, panel.z0 + 0.05, panel.z1 - 0.05);
      const t = THREE.MathUtils.clamp(clump.v + dt, 0.1, 0.98);
      const bottom = panel.bottomAt(z), top = panel.topAt(z);
      const x = panel.side * (Math.min(panel.outAt(z, t) + drapeOffset(panel, cfg.seed, z, t), ctx.maxHalfWidth - 0.002) + 0.01);
      let placed: FoliageCard | null = null;
      for (const scale of [1, 0.75, 0.55]) {
        for (const tilt of [tiltOut, tiltOut * 0.4, 0]) {
          const len = length * scale;
          if (z + Math.sin(sweep) * len > panel.z1 || z + Math.sin(sweep) * len < panel.z0) sweep *= -0.5;
          const axis: [number, number, number] = [panel.side * Math.sin(tilt), -Math.cos(sweep) * Math.cos(tilt), Math.sin(sweep) * Math.cos(tilt)];
          const drop = len * (Math.cos(sweep) + bend);
          // hang from the net: never below the hem (the running gear's corridor), never above the top cord
          const stemY = Math.min(top + len * 0.1, Math.max(THREE.MathUtils.lerp(bottom, top, t) + len * 0.42, bottom + 0.035 + drop));
          const card: FoliageCard = {
            stem: [x, stemY, z], axis, face: [panel.side, 0.08, 0], out: [panel.side, 0, 0], length: len, width: width * scale,
            tile, bend, tint, fold,
          };
          if (cardWithin(card, ctx, (p) => p[2] >= panel.z0 - 0.04 && p[2] <= panel.z1 + 0.04 && p[1] >= bottom - 0.01)) { placed = card; break; }
        }
        if (placed) break;
      }
      if (placed) out.push(ctx.q ? placed : { ...placed, fold: 0 });
    }
  }
}

function addFaceFoliage(
  out: FoliageCardBuffer,
  panel: FacePanel,
  cfg: GhillieConfig,
  seedBase: number,
  ctx: GarnishContext,
): void {
  const rng = garnishStream(seedBase);
  const facing = panel.z >= 0 || (panel.zAt ? panel.zAt((panel.x0 + panel.x1) / 2, (panel.y0 + panel.y1) / 2) >= 0 : false) ? 1 : -1;
  const margin = 0.06;
  const pointOk = (x: number, y: number, m = margin): boolean => x >= panel.x0 && x <= panel.x1 && y >= panel.y0 - 0.05 && y <= panel.y1 + 0.05
    && (!panel.outline || insidePoly(x, y, panel.outline)) && !(panel.holes || []).some((hole) => nearPolygon(x, y, hole, m));
  let cells = 0;
  for (let y = panel.y0 + 0.05; y < panel.y1; y += 0.1) for (let x = panel.x0 + 0.05; x < panel.x1; x += 0.1) if (pointOk(x, y)) cells++;
  const perM2 = cfg.style === 'leafy' ? GARNISH_PER_M2.leafy : GARNISH_PER_M2.cut;
  const clumps = placeGarnishClumps(rng, cfg, [panel.x0, panel.x1, panel.y0, panel.y1], (x, y) => pointOk(x, y),
    cells * 0.01 * perM2 * cfg.density, (r) => [r(), 1 - Math.pow(r(), 1.3) * 0.9]);
  for (const clump of clumps) {
    const base = clumpTint(cfg, rng);
    const swing0 = (rng() - 0.5) * 1.2;
    const fan = clump.size <= 2 ? 0.6 : 1.4 + rng() * 0.6;
    for (let k = 0; k < clump.size; k++) {
      const share = clump.size > 1 ? k / (clump.size - 1) : 0.5;
      const swing = swing0 + (share - 0.5) * fan + (rng() - 0.5) * 0.3;
      const { length, width } = cardSize(cfg, rng);
      const dx = (rng() - 0.5) * 0.08, dy = (rng() - 0.5) * 0.06;
      const standOut = 0.04 + rng() * 0.12;   // round 4: lies on the face net (was 0.12-0.42 rad off it)
      const bend = 0.03 + rng() * 0.06;
      const fold = 0.14 + rng() * 0.16;
      const tile = Math.floor(rng() * 4) % 4;
      const tint = sprayTint(base, rng);
      const px = clump.u + dx, py = clump.v + dy;
      if (!pointOk(px, py, margin * 0.6)) continue;
      const pz = panel.zAt ? panel.zAt(px, py) : panel.z;
      let placed: FoliageCard | null = null;
      for (const scale of [1, 0.72, 0.52]) {
        for (const sw of [swing, -swing * 0.6, swing * 0.3]) {
          const len = length * scale;
          const axis: [number, number, number] = [Math.sin(sw) * Math.cos(standOut), -Math.cos(sw) * Math.cos(standOut), facing * Math.sin(standOut)];
          const card: FoliageCard = {
            stem: [px, py + len * 0.3, pz + facing * (0.014 + netReliefFace(px, py, panel, cfg.seed))], axis,
            face: [0, 0.1, facing], out: [0, 0, facing], length: len, width: width * scale, tile, bend, tint, fold,
          };
          if (cardWithin(card, ctx, (p) => pointOk(p[0], p[1], margin * 0.4))) { placed = card; break; }
        }
        if (placed) break;
      }
      if (placed) out.push(ctx.q ? placed : { ...placed, fold: 0 });
    }
  }
}

/**
 * The suit's cloth: a per-visual clone of the vehicle's canvas joined to its cascade registration
 * (cloneVehicleMaterial). The old plain clone lit with every cascade's sun at once (about four times the sun on a lit
 * face), which is why the suits read pale and flat in battle.
 */
function makeCloth(
  P: GhillieBuilderPort,
  configure: (material: THREE.MeshStandardMaterial) => void,
): THREE.MeshStandardMaterial {
  return cloneVehicleMaterial(P.mats.canvasCloth, (mat) => {
    mat.roughness = 1;
    mat.metalness = 0;
    mat.envMapIntensity = 0.08;
    // sealed check 2026-09-13: cloth is seen from both sides as the camera orbits
    mat.side = THREE.DoubleSide;
    // round 4 field wear (2026-10-08, the GPU check pair: the Leopard 2A4's hull net hem read as white lace over the
    // skirts): the canvas's soft-goods dust (COT_FIELD_WEAR 4) graded by height lit the alpha-cut cords near the ground
    // almost white. A suit hangs loose over the vehicle and sheds the caked coat, so its cloth carries no field wear.
    if (mat.defines) delete mat.defines.COT_FIELD_WEAR;
    configure(mat);
  });
}

function makeNet(
  P: GhillieBuilderPort,
  cfg: GhillieConfig,
  _owner: GhillieOwner,
): { mat: THREE.MeshStandardMaterial; texture: THREE.CanvasTexture | null } {
  let texture: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    // 2026-10-06 (round 2: the critics read the old even grid of jittered lines as "diamond wallpaper"): a knotted
    // carrier net. Knots sit on an uneven lattice (each row and column at its own pitch, every knot shifted a third of a
    // cell), strands sag between knots, a few are broken or doubled, the knots are tied blobs, and short garnish strips
    // are knotted in. The lattice repeats exactly across the tile, so the net tiles without a seam.
    // Round 3 (2026-10-07: "a regular net grid", "a flat lattice ... like a stencil"): the leafy net is a finer mesh
    // (fourteen knots a 0.9 m tile, about 6.5 cm cells, on a 256 px canvas) so the garnish sits in a net rather than one
    // spray per window; a multispectral cover (ULCANS, Nakidka) is a cut fabric, not an open lattice — a mottled sheet
    // laser-cut with slits and leaf holes over about a third of its area.
    const canvas = document.createElement('canvas');
    const SIZE = 256;
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const wrap9 = (draw: (ox: number, oy: number) => void): void => {
      for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) draw(ox, oy);
    };
    if (cfg.style === 'leafy') {
      const N = 14;
      const pitchX: number[] = [], pitchY: number[] = [];
      for (let i = 0; i < N; i++) { pitchX.push(0.7 + noise01(i, cfg.seed + 21) * 0.6); pitchY.push(0.7 + noise01(i, cfg.seed + 23) * 0.6); }
      const sumX = pitchX.reduce((a, b) => a + b, 0), sumY = pitchY.reduce((a, b) => a + b, 0);
      const colAt: number[] = [], rowAt: number[] = [];
      for (let i = 0, ax = 0, ay = 0; i < N; i++) { colAt.push((ax / sumX) * SIZE); rowAt.push((ay / sumY) * SIZE); ax += pitchX[i]; ay += pitchY[i]; }
      const cell = SIZE / N;
      const knot = (i: number, j: number): [number, number] => {
        const wi = ((i % N) + N) % N, wj = ((j % N) + N) % N;
        const shiftX = Math.floor(i / N) * SIZE, shiftY = Math.floor(j / N) * SIZE;
        return [colAt[wi] + (noise01(wi * 31 + wj, cfg.seed + 25) - 0.5) * cell * 0.62 + shiftX,
          rowAt[wj] + (noise01(wi * 17 + wj * 7, cfg.seed + 27) - 0.5) * cell * 0.62 + shiftY];
      };
      const strand = (a: [number, number], b: [number, number], sag: number, width: number): void => {
        ctx.lineWidth = width;
        wrap9((ox, oy) => {
          ctx.beginPath();
          ctx.moveTo(a[0] + ox, a[1] + oy);
          ctx.quadraticCurveTo((a[0] + b[0]) / 2 + ox, (a[1] + b[1]) / 2 + sag + oy, b[0] + ox, b[1] + oy);
          ctx.stroke();
        });
      };
      ctx.strokeStyle = cfg.netColor;
      ctx.fillStyle = cfg.netColor;
      ctx.lineCap = 'round';
      const base = 1.5;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const k = knot(i, j);
        for (const [di, dj, salt] of [[1, 0, 41], [0, 1, 43]] as const) {
          const r = noise01(i * 13 + j * 5 + salt, cfg.seed);
          if (r < 0.06) continue; // a broken strand
          const sag = 1.5 + noise01(i + j * 11 + salt, cfg.seed + 3) * 3.5;
          strand(k, knot(i + di, j + dj), sag, base * (r > 0.9 ? 1.8 : 0.85 + noise01(i * 3 + j, salt) * 0.35));
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const [kx, ky] = knot(i, j);
        const r = base * (0.9 + noise01(i * 7 + j * 3, cfg.seed + 29) * 0.8);
        wrap9((ox, oy) => { ctx.beginPath(); ctx.arc(kx + ox, ky + oy, r, 0, Math.PI * 2); ctx.fill(); });
      }
      // knotted-in garnish strips: short frayed tabs hanging from some knots
      for (let n = 0; n < 30; n++) {
        const [kx, ky] = knot(Math.floor(noise01(n, cfg.seed + 31) * N), Math.floor(noise01(n, cfg.seed + 33) * N));
        const len = cell * (0.5 + noise01(n, cfg.seed + 35) * 0.6), ang = Math.PI / 2 + (noise01(n, cfg.seed + 37) - 0.5) * 1.2;
        ctx.lineWidth = base * 2.2;
        wrap9((ox, oy) => { ctx.beginPath(); ctx.moveTo(kx + ox, ky + oy); ctx.lineTo(kx + ox + Math.cos(ang) * len, ky + oy + Math.sin(ang) * len); ctx.stroke(); });
      }
    } else {
      // the cut fabric: three tones of the suit's palette in soft-edged patches over the base cloth, then the cuts
      // an sRGB hex as a canvas colour (THREE.Color would hand back its linear channels)
      const tone = (hex: number, a: number): string => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
      const ground = new THREE.Color(cfg.light).lerp(new THREE.Color(cfg.dark), 0.55);
      ctx.fillStyle = tone(ground.getHex(), 0.94);
      ctx.fillRect(0, 0, SIZE, SIZE);
      // woodland patches: irregular lobed blobs (eleven-point outlines, each radius jittered), never round dots
      const patches: Array<[string, number]> = [[tone(cfg.light, 0.9), 11], [tone(cfg.dark, 0.92), 12], ['rgba(84,70,48,0.85)', 7]];
      let n = 0;
      for (const [fill, count] of patches) {
        ctx.fillStyle = fill;
        for (let i = 0; i < count; i++, n++) {
          const cx = noise01(n, cfg.seed + 51) * SIZE, cy = noise01(n, cfg.seed + 53) * SIZE;
          const rx = SIZE * (0.07 + noise01(n, cfg.seed + 55) * 0.1), ry = rx * (0.4 + noise01(n, cfg.seed + 57) * 0.45);
          const rot = noise01(n, cfg.seed + 59) * Math.PI;
          const pts: Array<[number, number]> = [];
          for (let k = 0; k < 11; k++) {
            const a = (k / 11) * Math.PI * 2, j = 0.55 + noise01(n * 11 + k, cfg.seed + 73) * 0.75;
            const ex = Math.cos(a) * rx * j, ey = Math.sin(a) * ry * j;
            pts.push([cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
          }
          wrap9((ox, oy) => {
            ctx.beginPath();
            pts.forEach(([px, py], k) => {
              const [qx, qy] = pts[(k + 1) % pts.length];
              if (k === 0) ctx.moveTo((px + qx) / 2 + ox, (py + qy) / 2 + oy);
              else ctx.quadraticCurveTo(px + ox, py + oy, (px + qx) / 2 + ox, (py + qy) / 2 + oy);
            });
            ctx.quadraticCurveTo(pts[0][0] + ox, pts[0][1] + oy, (pts[0][0] + pts[1][0]) / 2 + ox, (pts[0][1] + pts[1][1]) / 2 + oy);
            ctx.closePath();
            ctx.fill();
          });
        }
      }
      // the laser cuts: curved slits and leaf-shaped holes punched through the sheet
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.lineCap = 'round';
      for (let i = 0; i < 150; i++, n++) {
        const cx = noise01(n, cfg.seed + 61) * SIZE, cy = noise01(n, cfg.seed + 63) * SIZE;
        const len = 7 + noise01(n, cfg.seed + 65) * 16, ang = noise01(n, cfg.seed + 67) * Math.PI;
        const bend = (noise01(n, cfg.seed + 69) - 0.5) * len * 0.8;
        if (i % 5 === 0) {
          // a leaf hole
          wrap9((ox, oy) => { ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, len * 0.42, len * 0.17, ang, 0, Math.PI * 2); ctx.fill(); });
        } else {
          ctx.lineWidth = 1.6 + noise01(n, cfg.seed + 71) * 1.6;
          const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
          wrap9((ox, oy) => {
            ctx.beginPath();
            ctx.moveTo(cx - dx + ox, cy - dy + oy);
            ctx.quadraticCurveTo(cx - dy * bend / len + ox, cy + dx * bend / len + oy, cx + dx + ox, cy + dy + oy);
            ctx.stroke();
          });
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  const mat = makeCloth(P, (m) => {
    m.color.setHex(0xffffff);
    if (texture) {
      m.map = texture;
      // an alpha-tested opaque web (sorted transparency is neither needed nor stable for a cut net)
      m.alphaTest = 0.10;
      m.transparent = false;
    }
  });
  return { mat, texture };
}

function addMerged(
  P: GhillieBuilderPort,
  parent: THREE.Group,
  geos: THREE.BufferGeometry[],
  mat: THREE.MeshStandardMaterial,
  name: string,
  extras: readonly (DisposableResource | null)[] = [],
): void {
  if (!geos.length) {
    mat.dispose();
    for (const extra of extras) extra?.dispose?.();
    return;
  }
  const geo = KIT.mergeAll(geos);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  // A cut net encloses real exterior air: it is suspended dressing, outside the armor's zero-hole scan.
  mesh.userData.combatHitboxRole = 'nonArmor';
  mesh.userData.continuityRole = 'open-lattice';
  parent.add(mesh);
  P.disposables.push(geo, mat);
  for (const extra of extras) {
    if (extra) P.disposables.push(extra);
  }
}

const t64HullY = (_x: number, z: number): number => {
  if (z < -2.6) return 1.43;
  if (z < 1.55) return 1.39;
  if (z < 2.55) return 1.40 - (z - 1.55) * 0.20;
  return 1.20 - (z - 2.55) * 0.22;
};
const ptHullY = (_x: number, z: number): number => {
  if (z < -2.0) return 1.61;
  if (z < 1.2) return 1.54;
  if (z < 2.4) return 1.54 - (z - 1.2) * 0.14;
  return 1.37 - (z - 2.4) * 0.17;
};
// PT-91A turret carrier surface. The old blanket used one y=0.88 plane,
// leaving up to 0.6 m of daylight over the cast shoulders and front wedge.
// This profile mirrors buildPT91Twardy's authored dome, ERAWA cheeks, flank
// bins and bustle while preserving the ghillie's small suspended air layer.
const pt91DomeProfile: readonly Point2[] = Object.freeze([
  [0.03, 0.81], [0.38, 0.80], [0.72, 0.755], [1.00, 0.64],
  [1.18, 0.46], [1.26, 0.24],
]);
const pt91DomeY = (x: number, z: number): number => {
  const r = Math.hypot(x, (z + 0.08) / 0.98);
  if (r <= pt91DomeProfile[0][0]) return pt91DomeProfile[0][1];
  for (let i = 1; i < pt91DomeProfile.length; i++) {
    const [r1, y1] = pt91DomeProfile[i];
    if (r <= r1) {
      const [r0, y0] = pt91DomeProfile[i - 1];
      return THREE.MathUtils.lerp(y0, y1, (r - r0) / (r1 - r0));
    }
  }
  return 0.20;
};
const pt91TurretCoverY = (x: number, z: number): number => {
  const ax = Math.abs(x);
  let support = pt91DomeY(x, z);
  if (z < -1.04 && ax < 0.86) support = Math.max(support, 0.64); // bustle roof
  if (z >= -1.08 && z < -0.18 && ax > 0.82) support = Math.max(support, 0.61); // flank bins
  if (z >= 0.16 && z < 1.24 && ax > 0.24) {
    support = Math.max(support, 0.69 - Math.max(0, z - 0.62) * 0.065); // ERAWA wedge
  }
  return support + 0.030;
};
const pt91TurretSideTopY = (z: number): number => {
  if (z < -1.05) return 0.67;
  if (z < -0.18) return 0.64;
  if (z < 0.58) return 0.66;
  return 0.66 - (z - 0.58) * 0.34;
};
const pt91TurretSideX = (z: number, t: number): number => {
  let armorX;
  if (z < -1.05) armorX = 0.83;
  else if (z < 0.55) armorX = 1.31;
  else armorX = THREE.MathUtils.lerp(1.28, 0.78,
    THREE.MathUtils.clamp((z - 0.55) / 0.45, 0, 1));
  return armorX + (1 - t) * 0.032;
};
const pt91TurretFrontZ = (x: number, y: number): number => 1.58
  - Math.max(0, Math.abs(x) - 0.20) * 0.61
  - Math.max(0, 0.40 - y) * 0.08;
const profileY = (stations: readonly Point2[], z: number): number => {
  if (z <= stations[0][0]) return stations[0][1];
  for (let i = 1; i < stations.length; i++) {
    const [z1, y1] = stations[i];
    if (z <= z1) {
      const [z0, y0] = stations[i - 1];
      return THREE.MathUtils.lerp(y0, y1, (z - z0) / (z1 - z0));
    }
  }
  return stations.at(-1)?.[1] ?? 0;
};
const strv103aHullY = (_x: number, z: number): number => profileY([
  [-3.20, 1.89], [-2.00, 1.93], [0.62, 1.90], [1.55, 1.75],
  [2.36, 1.62], [2.98, 1.52], [3.45, 1.54],
], z);
const strv103bHullY = (_x: number, z: number): number => profileY([
  [-3.72, 1.57], [-2.75, 1.79], [0.75, 1.85], [1.60, 1.63],
  [2.61, 1.53], [3.22, 1.55],
], z);
const strv122HullY = (_x: number, z: number): number => {
  const armorY = z < 1.45 ? 1.76 : 1.76 - (z - 1.45) * 0.12;
  // The Swedish cover is tied to a shallow support frame above the bow.
  // This clearance keeps the front drape outside the live 2A5-family shoe
  // wrap while still following the glacis angle.
  return armorY + 0.15;
};
// The rebuilt Oplot keeps the donor fenders and a new welded turret. Cloth
// follows those surfaces; hatches, MG, sights and the pitching gun stay open.
const t84HullY = (_x: number, z: number): number => profileY([
  [-2.80, 1.526], [1.65, 1.509], [2.70, 1.446],
], z) + 0.027;
const t84TurretCoverGapM = 0.026;
const t84TurretCoverY = (_x: number, z: number): number => profileY([
  [-2.15, 0.66], [-0.50, 0.74], [0.28, 0.73], [1.63, 0.56],
], z) + t84TurretCoverGapM;
const oplotHullY = (_x: number, z: number): number => (
  z < 1.45 ? 1.51 : 1.51 - (z - 1.45) * 0.15
);
const abramsHullY = (x: number, z: number): number => {
  const armorY = z < 2.0 ? 1.49 : 1.49 - (z - 2.0) * 0.17;
  // ULCANS is a supported multispectral screen, not a skin-tight paint
  // layer.  Its battens keep the deck span clear of the 1.51 m return run;
  // the outboard lift is higher where the cloth crosses the fender line.
  return armorY + (Math.abs(x) > 1.04 ? 0.18 : 0.08);
};
// Round 3 (2026-10-07): the SEPv3 cover's deck carrier. abramsHullY's glacis slope (0.17 m/m from z 2) runs under the
// SEPv3's front deck tiles (1.45-1.52 m to z 3.2, then the 1.31-1.35 m bow strip, measured), so the old net sank into
// the armour ahead of the driver and the tiles stood through it; the cover now rides over the tiles to the bow edge.
const sepv3HullY = (x: number, z: number): number => Math.max(abramsHullY(x, z),
  (Math.abs(x) > 1.04 ? 1.58 : 1.56) - THREE.MathUtils.smoothstep(z, 3.2, 3.5) * 0.16);
/** The SEPv3 turret roof net's outer edge (its outline), for the flank drapes' roll-over. */
const sepv3TurretRoofEdge = (z: number): number => profileY([[-3.35, 1.05], [-2.32, 1.42], [0.38, 1.36], [1.12, 0.86]], z);
/** The Leopard 2A4 turret roof net's outer edge (LEO2A4_TURRET_ROOF_OUTLINE), for the flank drapes' roll-over. */
const leo2A4TurretRoofEdge = (z: number): number => profileY([[-2.28, 0.91], [-1.58, 0.99], [-0.72, 1.06], [0.69, 1.09]], z);

// Leopard 2A6 UA fitted camouflage carrier. The original blanket used a
// single y=.98 roof and z=2.72 face, leaving visible daylight over the 2A6M
// wedge. These profiles follow the authored roof tiers and the ruled cheek
// surface used by the UA ERA package. Values are turret-local metres.
const leo2A6UAFrontLowerZ = (x: number): number => profileY([
  [0.32, 2.70], [0.40, 2.64], [0.94, 2.26], [1.30, 1.96],
], Math.abs(x));
const leo2A6UAFrontUpperZ = (x: number): number => profileY([
  [0.32, 2.02], [0.55, 1.87], [0.90, 1.62], [1.08, 1.40], [1.30, 1.16],
], Math.abs(x));
const leo2A6UAFrontArmorZ = (x: number, y: number): number => THREE.MathUtils.lerp(
  leo2A6UAFrontLowerZ(x),
  leo2A6UAFrontUpperZ(x),
  THREE.MathUtils.clamp((y - 0.16) / 0.46, 0, 1),
);
const leo2A6UAFrontNetZ = (x: number, y: number): number => leo2A6UAFrontArmorZ(x, y) + 0.065;
const leo2A6UAFrontRoofY = (x: number, z: number): number => {
  const armorY = profileY([
    [0.46, 0.655], [0.72, 0.620], [1.20, 0.535], [1.68, 0.425], [2.18, 0.430],
  ], z);
  return armorY - Math.max(0, Math.abs(x) - 0.92) * 0.035 + 0.026;
};
const leo2A6UAMidRoofY = (x: number, z: number): number => {
  const armorY = z < -0.96 ? 0.78 : 0.75;
  return armorY - Math.max(0, Math.abs(x) - 0.72) * 0.055 + 0.026;
};
const leo2A6UARearRoofY = (_x: number, z: number): number => profileY([
  [-3.34, 0.62], [-3.02, 0.64], [-2.30, 0.66], [-1.58, 0.78],
], z) + 0.026;
// Leopard 2A4 full-vehicle suit (2026-10-05: moved from its private copy in profiles/leopard.ts onto this shared
// builder — the authored A4 cut-net carriers below are its outlines, openings and drapes unchanged; the garnish is
// the shared spray cards). The hull blanket floats 5-7 cm above the deck and follows the glacis to the beak; the
// side carriers follow the skirt shoulder and stop where the sprocket/idler arcs begin; the turret face opens a
// 0.9 m gun corridor; the crown opens around both hatches, EMES, the loader MG and the antenna seats.
const leo2A4HullBlanketY = (_x: number, z: number): number => {
  if (z <= 2.20) return 1.765;
  if (z <= 2.40) return 1.765 - (z - 2.20) * 0.45;
  if (z <= 2.96) return 1.675 - (z - 2.40) * 0.33;
  if (z <= 3.52) return 1.490 - (z - 2.96) * 0.18;
  return 1.389 - (z - 3.52) * 0.44;
};
const leo2A4HullSideWidth = (z: number): number => {
  if (z > 2.25) return THREE.MathUtils.lerp(1.71, 1.06, (z - 2.25) / 1.53);
  if (z < -3.20) return THREE.MathUtils.lerp(1.71, 1.33, (-z - 3.20) / 0.58);
  return 1.71;
};
// the physical skirt course moved up 100 mm; the carrier hem follows the supported 0.62/0.64 m armor bottoms
const leo2A4HullSideBottom = (z: number): number => 0.725 + Math.sin(z * 3.1) * 0.035 + Math.cos(z * 5.7) * 0.020;
const leo2A4TurretSideWidth = (z: number): number => {
  if (z > 0.55) return THREE.MathUtils.lerp(1.31, 1.05, (z - 0.55) / 0.55);
  if (z < -1.45) return THREE.MathUtils.lerp(1.28, 1.03, (-z - 1.45) / 1.28);
  return z < -0.50 ? 1.28 : 1.31;
};
const LEO2A4_HULL_BLANKET_OUTLINE: readonly Point2[] = [
  [-0.94, -3.80], [0.94, -3.80], [1.02, -3.42], [1.68, -3.12],
  // the bow shoulders come in before the idler arc, clear of the animated terminal shoes
  [1.71, -2.62], [1.72, 2.18], [1.57, 2.72], [0.84, 3.42],
  [0.88, 3.82], [-0.88, 3.82], [-0.84, 3.42], [-1.57, 2.72],
  [-1.72, 2.18], [-1.71, -2.62], [-1.68, -3.12], [-1.02, -3.42],
];
// end courses keep their sprays between the live track lanes
const LEO2A4_HULL_END_LANES: readonly (readonly Point2[])[] = [-1, 1].flatMap((side) => [
  [[side * 0.72, 3.18], [side * 2.0, 3.18], [side * 2.0, 4.2], [side * 0.72, 4.2]] as Point2[],
  [[side * 0.72, -3.18], [side * 2.0, -3.18], [side * 2.0, -4.2], [side * 0.72, -4.2]] as Point2[],
]);
// round 3: the front hull hatch rings (driver right, at x -0.6; the second ring left) open through the blanket, and the
// driver's view forward over the glacis carries no garnish (nor does the glacis itself: sprays would lie flat on it)
const LEO2A4_HULL_HATCHES: readonly (readonly Point2[])[] = [rect(-0.92, -0.28, 1.50, 2.18), rect(0.28, 0.92, 1.50, 2.18)];
const LEO2A4_GLACIS_CLEAR: readonly (readonly Point2[])[] = [[[-1.24, 2.12], [1.24, 2.12], [1.24, 3.95], [-1.24, 3.95]]];
const LEO2A4_TURRET_ROOF_OUTLINE: readonly Point2[] = [
  [-0.81, 1.06], [-0.48, 1.06], [-0.48, 0.80], [0.18, 0.80],
  [0.18, 0.30], [1.05, 0.30], [1.09, 0.69], [1.06, -0.72],
  [0.99, -1.58], [0.91, -2.28], [-0.91, -2.28], [-0.99, -1.58],
  [-1.06, -0.72], [-1.09, 0.69],
];
const LEO2A4_TURRET_ROOF_HOLES: readonly (readonly Point2[])[] = [
  [[-1.00, -0.98], [-1.00, 0.34], [-0.14, 0.34], [-0.14, -0.98]],
  [[0.19, -0.52], [0.19, -0.10], [0.53, -0.10], [0.53, -0.52]],
  [[0.28, -0.52], [0.91, -0.52], [0.91, -0.62], [0.96, -0.62],
    [0.96, -1.58], [0.38, -1.65], [0.38, -1.06], [0.28, -1.06]],
  [[-0.90, -2.25], [-0.90, -1.78], [-0.73, -1.78], [-0.73, -2.25]],
];

export const GHILLIE_SUIT_CONFIGS = Object.freeze({
  leo2a4: {
    id: 'leo2a4', seed: 2404, style: 'leafy', density: 0.9, leafScale: 0.96, foliageKind: 'beech', maxHalfWidth: 1.845,
    light: 0x64794a, dark: 0x34462d, netColor: 'rgba(34,48,27,0.72)',
    hull: {
      // the deck under the turret and gun sweep keeps its garnish to a low band along its edges (round 3)
      top: [{ x0: -1.72, x1: 1.72, z0: -3.80, z1: 3.82, nx: 30, nz: 60, yAt: leo2A4HullBlanketY,
        outline: LEO2A4_HULL_BLANKET_OUTLINE, holes: [rect(-1.39, 1.39, -2.12, 1.58), ...LEO2A4_HULL_HATCHES], strictHoles: true,
        foliageExclude: [...LEO2A4_HULL_END_LANES, ...LEO2A4_GLACIS_CLEAR], garnishEdgeBandM: 0.42, garnishRiseM: 0.08,
        reliefScale: 0.55, seed: 4 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.12, z1: 2.24, nz: 44, ny: 10,
        topAt: (z: number) => leo2A4HullBlanketY(0, z) - 0.015, bottomAt: leo2A4HullSideBottom,
        outAt: (z: number, t: number) => leo2A4HullSideWidth(z) + 0.025 + (1 - t) * 0.075, seed: 11 + side })),
      face: [
        // round 3: the bow drape ends at the beak (1.21 m at z 3.8, measured) where the blanket's front edge meets it;
        // its old top stood 0.3 m clear of the hull in front of the driver's view, a free-standing fence
        { z: 3.895, x0: -1.05, x1: 1.05, y0: 0.66, y1: 1.27, nx: 16, ny: 7, strictHoles: true,
          outline: [[-0.86, 0.69], [0.86, 0.69], [1.04, 0.88], [0.98, 1.16], [0.80, 1.25], [-0.80, 1.25], [-0.98, 1.16], [-1.04, 0.88]],
          holes: [[[-0.72, 1.09], [-0.46, 1.09], [-0.46, 1.29], [-0.72, 1.29]], [[0.46, 1.09], [0.72, 1.09], [0.72, 1.29], [0.46, 1.29]]],
          seed: 23 },
        { z: -3.825, x0: -1.48, x1: 1.48, y0: 0.64, y1: 1.74, nx: 20, ny: 10, strictHoles: true,
          outline: [[-1.31, 0.66], [1.31, 0.66], [1.46, 0.92], [1.37, 1.62], [0.98, 1.72], [-0.98, 1.72], [-1.37, 1.62], [-1.46, 0.92]],
          seed: 29 },
      ],
    },
    turret: {
      top: [{ x0: -1.10, x1: 1.10, z0: -2.30, z1: 1.08, nx: 22, nz: 34, yAt: () => 0.758,
        outline: LEO2A4_TURRET_ROOF_OUTLINE, holes: LEO2A4_TURRET_ROOF_HOLES, strictHoles: true, seed: 19 }],
      side: [-1, 1].map((side) => ({ side, z0: -2.73, z1: 1.08, nz: 38, ny: 9,
        topAt: (z: number) => 0.755 - Math.max(0, -z - 1.55) * 0.045,
        bottomAt: (z: number) => 0.10 + Math.sin(z * 4.7) * 0.028,
        outAt: (z: number, t: number) => leo2A4TurretSideWidth(z) + 0.018 + (1 - t) * 0.028, seed: 43 + side,
        shoulder: { z0: -2.28, z1: 0.69, inAt: (z: number) => leo2A4TurretRoofEdge(z) - 0.05, yAt: () => 0.752 } })),
      face: [
        { z: 1.292, x0: -1.20, x1: 1.20, y0: 0.06, y1: 0.80, nx: 20, ny: 9, strictHoles: true,
          outline: [[-1.18, 0.10], [1.18, 0.10], [1.11, 0.72], [0.74, 0.79], [-0.74, 0.79], [-1.11, 0.72]],
          holes: [[[-0.47, 0.04], [0.47, 0.04], [0.47, 0.73], [-0.47, 0.73]]], seed: 37 },
        { z: -2.755, x0: -1.10, x1: 1.10, y0: 0.08, y1: 0.70, nx: 18, ny: 8, strictHoles: true,
          outline: [[-0.98, 0.10], [0.98, 0.10], [1.09, 0.28], [0.91, 0.69], [-0.91, 0.69], [-1.09, 0.28]], seed: 47 },
      ],
    },
  },
  ua_t64bv: {
    id: 'ua_t64bv', seed: 640, style: 'leafy', density: 0.92, leafScale: 1.04,
    light: 0x6f7d48, dark: 0x33452d, netColor: 'rgba(38,54,29,0.76)',
    hull: {
      top: [{ x0: -1.50, x1: 1.50, z0: -3.12, z1: 3.18, nx: 24, nz: 48,
        yAt: t64HullY,
        outline: [[-1.08, -3.12], [1.08, -3.12], [1.50, -2.70], [1.50, 2.35], [0.95, 3.18], [-0.95, 3.18], [-1.50, 2.35], [-1.50, -2.70]],
        holes: [rect(-1.38, 1.38, -1.92, 1.20), rect(-0.22, 0.22, 0.94, 1.52)], seed: 3 }],
      side: [-1, 1].map((side) => ({ side, z0: -2.72, z1: 2.55, nz: 38, ny: 9,
        topAt: (z) => t64HullY(0, z), bottomAt: (z) => 0.69 + Math.sin(z * 3.1) * 0.035,
        outAt: (_z, t) => 1.72 + (1 - t) * 0.055, seed: 10 + side })),
      face: [{ z: 3.31, x0: -1.05, x1: 1.05, y0: 0.70, y1: 1.20, nx: 14, ny: 6,
        outline: [[-0.88, 0.70], [0.88, 0.70], [1.05, 0.90], [0.82, 1.20], [-0.82, 1.20], [-1.05, 0.90]], seed: 17 }],
    },
    turret: {
      top: [{ x0: -1.16, x1: 1.16, z0: -1.65, z1: 1.10, nx: 20, nz: 26,
        yAt: () => 0.78,
        outline: [[-0.72, -1.65], [0.72, -1.65], [1.16, -0.78], [1.12, 0.54], [0.66, 1.10], [-0.66, 1.10], [-1.12, 0.54], [-1.16, -0.78]],
        holes: [rect(-0.96, -0.36, -0.42, 0.22), rect(0.18, 0.76, -0.40, 0.18), rect(-0.67, -0.20, 0.62, 1.12)], seed: 29 }],
      side: [-1, 1].map((side) => ({ side, z0: -1.55, z1: 0.83, nz: 24, ny: 7,
        topAt: () => 0.73, bottomAt: (z) => 0.10 + Math.sin(z * 4.2) * 0.025,
        outAt: (z, t) => (z < -0.70 ? 1.02 : 1.25) + (1 - t) * 0.035, seed: 37 + side })),
      face: [{ z: 1.20, x0: -1.12, x1: 1.12, y0: 0.08, y1: 0.70, nx: 18, ny: 8,
        outline: [[-0.82, 0.08], [0.82, 0.08], [1.12, 0.36], [0.78, 0.70], [-0.78, 0.70], [-1.12, 0.36]],
        holes: [rect(-0.42, 0.42, 0.04, 0.64), rect(-0.72, -0.20, 0.48, 0.76)], seed: 43 }],
    },
  },
  pt91_twardy: {
    id: 'pt91_twardy', seed: 911, style: 'leafy', density: 0.86, leafScale: 0.92, foliageKind: 'birch',
    light: 0x71835a, dark: 0x374a35, netColor: 'rgba(43,58,35,0.76)',
    hull: {
      top: [{ x0: -1.55, x1: 1.55, z0: -3.15, z1: 3.22, nx: 24, nz: 48,
        yAt: ptHullY,
        outline: [[-1.10, -3.15], [1.10, -3.15], [1.55, -2.70], [1.55, 2.40], [1.00, 3.22], [-1.00, 3.22], [-1.55, 2.40], [-1.55, -2.70]],
        holes: [rect(-1.43, 1.43, -1.82, 1.42), rect(-0.24, 0.24, 0.96, 1.52)], seed: 5 }],
      // round 4 (2026-10-07, wave 216: "the side net is a straight vertical wall of evenly spaced clumps"): each flank
      // hangs as two drapes of different lengths with a bare stretch of skirt between them
      side: [-1, 1].flatMap((side) => [[-2.65, -0.18 + side * 0.22, 0], [0.42 + side * 0.22, 2.58, 1]].map(([z0, z1, k]) => ({
        side, z0, z1, nz: k ? 16 : 20, ny: 9,
        topAt: (z: number) => ptHullY(0, z), bottomAt: (z: number) => 0.63 + Math.sin(z * 2.8) * 0.035,
        outAt: (_z: number, t: number) => 1.80 + (1 - t) * 0.045, seed: 13 + side + k * 5 }))),
      face: [{ z: 3.48, x0: -1.08, x1: 1.08, y0: 0.82, y1: 1.28, nx: 14, ny: 6,
        outline: [[-0.88, 0.82], [0.88, 0.82], [1.08, 1.00], [0.78, 1.28], [-0.78, 1.28], [-1.08, 1.00]], seed: 19 }],
    },
    turret: {
      top: [{ x0: -1.17, x1: 1.17, z0: -1.65, z1: 1.25, nx: 26, nz: 34,
        yAt: pt91TurretCoverY,
        outline: [[-0.82, -1.65], [0.82, -1.65], [1.17, -0.72], [1.10, 0.52], [0.62, 1.25], [-0.62, 1.25], [-1.10, 0.52], [-1.17, -0.72]],
        holes: [rect(-0.94, -0.34, -0.46, 0.14), rect(0.24, 0.82, -0.42, 0.10),
          rect(-0.48, 0.48, 0.52, 1.30), rect(0.28, 0.78, 0.48, 1.02)], seed: 31 }],
      side: [-1, 1].map((side) => ({ side, z0: -1.58, z1: 1.00, nz: 28, ny: 8,
        topAt: pt91TurretSideTopY, bottomAt: (z) => 0.13 + Math.sin(z * 4.0) * 0.025,
        outAt: pt91TurretSideX, seed: 41 + side })),
      face: [{ z: 1.45, x0: -1.15, x1: 1.15, y0: 0.10, y1: 0.72, nx: 18, ny: 8,
        zAt: pt91TurretFrontZ,
        outline: [[-0.76, 0.10], [0.76, 0.10], [1.15, 0.34], [0.78, 0.72], [-0.78, 0.72], [-1.15, 0.34]],
        holes: [rect(-0.44, 0.44, 0.02, 0.67)], seed: 47 }],
    },
  },
  strv103a: {
    id: 'strv103a', seed: 1031, style: 'leafy', density: 0.82, leafScale: 0.90, foliageKind: 'spruce',
    light: 0x667a43, dark: 0x32452b, netColor: 'rgba(39,55,31,0.80)',
    hull: {
      top: [{ x0: -1.66, x1: 1.66, z0: -3.30, z1: 3.46, nx: 26, nz: 52,
        yAt: strv103aHullY,
        outline: [[-1.30, -3.30], [1.30, -3.30], [1.66, -2.65], [1.65, 2.40], [1.16, 3.46], [-1.16, 3.46], [-1.65, 2.40], [-1.66, -2.65]],
        // round 4 (2026-10-07, wave 216: "the thick-corded net passes under the slab instead of over or around it"):
        // the net opens round the spare links planted on the right glacis shoulder (sweden.ts: 0.98, z 2.30, 0.60 wide)
        holes: [rect(-0.27, 0.27, 0.78, 3.58), rect(0.03, 0.91, -1.30, 0.12), rect(-0.90, -0.28, -1.22, -0.46),
          rect(0.62, 1.34, 1.96, 2.64)], seed: 71 }],
      // round 4 (wave 216: "a single green blanket draped over the vehicle ... the hull's own silhouette is barely
      // legible"): each flank hangs as two drapes with the hull side bare between them, hems 8 cm higher
      side: [-1, 1].flatMap((side) => [[-3.12, -0.62, 0], [0.12, 2.40, 1]].map(([z0, z1, k]) => ({ side, z0, z1,
        nz: k ? 18 : 20, ny: 7,
        topAt: (z: number) => strv103aHullY(0, z) - 0.02,
        bottomAt: (z: number) => 1.42 + Math.sin(z * 2.7) * 0.028,
        outAt: (_z: number, t: number) => 1.84 + (1 - t) * 0.030, seed: 79 + side + k * 7 }))),
    },
  },
  strv103: {
    id: 'strv103', seed: 1032, style: 'leafy', density: 0.88, leafScale: 0.92, foliageKind: 'spruce',
    light: 0x65783f, dark: 0x304329, netColor: 'rgba(37,53,29,0.80)',
    hull: {
      top: [{ x0: -1.66, x1: 1.66, z0: -3.76, z1: 3.24, nx: 26, nz: 54,
        yAt: strv103bHullY,
        outline: [[-1.42, -3.76], [1.42, -3.76], [1.66, -2.70], [1.64, 2.35], [0.92, 3.24], [-0.92, 3.24], [-1.64, 2.35], [-1.66, -2.70]],
        holes: [rect(-0.28, 0.28, 0.76, 3.36), rect(-0.22, 0.92, -0.88, 0.20), rect(-0.98, -0.30, -1.44, -0.72)], seed: 87 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.58, z1: 2.72, nz: 44, ny: 7,
        topAt: (z) => strv103bHullY(0, z) - 0.02,
        bottomAt: (z) => 1.31 + Math.sin(z * 2.5) * 0.026,
        outAt: (_z, t) => 1.87 + (1 - t) * 0.028, seed: 93 + side })),
    },
  },
  strv122: {
    id: 'strv122', seed: 1220, style: 'leafy', density: 0.78, leafScale: 0.92, foliageKind: 'spruce',
    disabled: true,
    light: 0x657845, dark: 0x31422d, netColor: 'rgba(39,53,31,0.80)',
    hull: {
      top: [{ x0: -1.72, x1: 1.72, z0: -3.62, z1: 3.70, nx: 26, nz: 54,
        yAt: strv122HullY,
        outline: [[-1.36, -3.62], [1.36, -3.62], [1.72, -3.10], [1.72, 2.68], [1.10, 3.70], [-1.10, 3.70], [-1.72, 2.68], [-1.72, -3.10]],
        holes: [rect(-1.47, 1.47, -2.35, 1.42), rect(-0.24, 0.24, 1.04, 1.72)], seed: 101 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.10, z1: 3.05, nz: 42, ny: 8,
        topAt: (z) => strv122HullY(0, z), bottomAt: (z) => 1.54 + Math.sin(z * 2.4) * 0.025,
        outAt: (_z, t) => 1.91 + (1 - t) * 0.035, seed: 109 + side })),
    },
    turret: {
      top: [{ x0: -1.48, x1: 1.48, z0: -3.12, z1: 1.42, nx: 24, nz: 38,
        yAt: () => 1.08,
        outline: [[-1.08, -3.12], [1.08, -3.12], [1.48, -2.10], [1.42, 0.55], [0.90, 1.42], [-0.90, 1.42], [-1.42, 0.55], [-1.48, -2.10]],
        holes: [rect(-1.10, -0.38, -0.72, 0.10), rect(0.14, 0.88, -0.65, 0.12), rect(-0.36, 0.36, 0.62, 1.50)], seed: 117 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.02, z1: 0.92, nz: 32, ny: 8,
        topAt: () => 1.02, bottomAt: (z) => 0.10 + Math.sin(z * 3.1) * 0.024,
        outAt: (z, t) => (z < -1.65 ? 1.38 : 1.70) + (1 - t) * 0.030, seed: 125 + side })),
      face: [{ z: 1.55, x0: -1.38, x1: 1.38, y0: 0.02, y1: 0.92, nx: 20, ny: 9,
        outline: [[-1.02, 0.02], [1.02, 0.02], [1.38, 0.40], [0.96, 0.92], [-0.96, 0.92], [-1.38, 0.40]],
        holes: [rect(-0.50, 0.50, -0.04, 0.82)], seed: 133 }],
    },
  },
  t84: {
    id: 't84', seed: 840, style: 'leafy', density: 1.0, leafScale: 1.02,
    light: 0x6e804b, dark: 0x35492e, netColor: 'rgba(42,56,34,0.84)',
    hull: {
      // Separate shoulder covers leave the driver, engine grilles, lights and
      // turret sweep uncovered. Side nets hang outside the armored skirts.
      top: [-1, 1].map(side => ({ x0: side < 0 ? -1.74 : 1.42,
        x1: side < 0 ? -1.42 : 1.74, z0: 1.93, z1: 2.68, nx: 5, nz: 12,
        yAt: t84HullY, seatGapM: 0.027, seat: 'donor-fender', seed: 141 + side })),
      side: [-1, 1].map(side => ({ side, z0: -2.80, z1: 2.85, nz: 42, ny: 8,
        topAt: () => 1.405, bottomAt: z => 0.92 + Math.sin(z * 3.7) * 0.025,
        outAt: (_z, t) => 1.995 + (1 - t) * 0.012, seed: 149 + side })),
    },
    turret: {
      top: [
        { x0: -0.94, x1: 0.94, z0: -1.30, z1: 0.25, nx: 24, nz: 22,
          yAt: t84TurretCoverY,
          holes: [rect(0.10, 1.10, -1.20, 0.30), rect(-1.08, -0.13, -0.79, 0.30)],
          seatGapM: t84TurretCoverGapM, seat: 'welded-roof', seed: 157 },
        ...[-0.68, 0, 0.68].map(x => ({ x0: x - 0.26, x1: x + 0.26,
          z0: -1.99, z1: -1.49, nx: 7, nz: 8, yAt: () => 0.959,
          seatGapM: t84TurretCoverGapM, seat: 'strapped-bustle-pack', seed: 161 })),
        ...[-1, 1].map(side => ({ x0: side < 0 ? -0.94 : 0.57,
          x1: side < 0 ? -0.57 : 0.94, z0: 0.43, z1: 0.84, nx: 6, nz: 7,
          yAt: t84TurretCoverY, seatGapM: t84TurretCoverGapM, seat: 'cheek-roof', seed: 169 + side })),
      ],
      // The flank drape hangs 44 mm outside the side cassettes and follows them onto the tapering bustle.
      side: [-1, 1].map(side => ({ side, z0: -1.66, z1: -0.42, nz: 20, ny: 7,
        topAt: () => 0.56, bottomAt: z => 0.15 + Math.sin(z * 3.6) * 0.016,
        outAt: (z, t) => oplotFlankOuterX(z) + 0.044 + (1 - t) * 0.010, seed: 175 + side })),
      face: [{ z: -2.456, x0: -1.17, x1: 1.17, y0: 0.13, y1: 0.56, nx: 26, ny: 7,
        seatGapM: 0.026, seat: 'bustle-cage', seed: 183 }],
    },
  },
  ua_t84_oplot_m: {
    id: 'ua_t84_oplot_m', seed: 8420, style: 'leafy', density: 0.90, leafScale: 0.96,
    disabled: true,
    light: 0x708055, dark: 0x354830, netColor: 'rgba(43,59,35,0.82)',
    hull: {
      top: [{ x0: -1.65, x1: 1.65, z0: -3.42, z1: 3.46, nx: 26, nz: 52,
        yAt: oplotHullY,
        outline: [[-1.24, -3.42], [1.24, -3.42], [1.65, -2.94], [1.65, 2.62], [1.04, 3.46], [-1.04, 3.46], [-1.65, 2.62], [-1.65, -2.94]],
        holes: [rect(-1.48, 1.48, -2.08, 1.36), rect(-0.24, 0.24, 1.04, 1.58)], seed: 181 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.10, z1: 3.02, nz: 42, ny: 8,
        topAt: (z) => oplotHullY(0, z), bottomAt: (z) => 1.20 + Math.sin(z * 2.7) * 0.025,
        outAt: (_z, t) => 1.95 + (1 - t) * 0.045, seed: 189 + side })),
    },
    turret: {
      top: [{ x0: -1.46, x1: 1.46, z0: -2.12, z1: 2.10, nx: 24, nz: 34,
        yAt: () => 0.91,
        outline: [[-1.00, -2.12], [1.00, -2.12], [1.46, -1.14], [1.44, 1.18], [0.74, 2.10], [-0.74, 2.10], [-1.44, 1.18], [-1.46, -1.14]],
        holes: [rect(-1.05, -0.32, -0.60, 0.18), rect(0.24, 0.96, -0.62, 0.16), rect(-0.40, 0.40, 1.08, 2.18)], seed: 197 }],
      side: [-1, 1].map((side) => ({ side, z0: -2.04, z1: 1.42, nz: 28, ny: 8,
        topAt: () => 0.84, bottomAt: (z) => 0.04 + Math.sin(z * 3.4) * 0.024,
        outAt: (z, t) => (z < -1.08 ? 1.18 : 1.63) + (1 - t) * 0.034, seed: 205 + side })),
      face: [{ z: 2.28, x0: -1.32, x1: 1.32, y0: 0.00, y1: 0.80, nx: 20, ny: 8,
        outline: [[-0.92, 0.00], [0.92, 0.00], [1.32, 0.34], [0.84, 0.80], [-0.84, 0.80], [-1.32, 0.34]],
        holes: [rect(-0.50, 0.50, -0.04, 0.72)], seed: 213 }],
    },
  },
  m1a2_sepv3: {
    id: 'm1a2_sepv3', seed: 123, style: 'ulcans', density: 0.76, leafScale: 0.96,
    light: 0x7a795b, dark: 0x3d4636, netColor: 'rgba(50,55,43,0.82)',
    hull: {
      // round 3: the cover rides the measured front deck (sepv3HullY), opens the driver's periscopes with his hatch, keeps
      // the view over the glacis clear, and carries its garnish low along the deck edges under the turret's sweep
      top: [{ x0: -1.66, x1: 1.66, z0: -3.62, z1: 3.62, nx: 26, nz: 54,
        yAt: sepv3HullY,
        outline: [[-1.22, -3.62], [1.22, -3.62], [1.66, -3.12], [1.66, 2.65], [1.04, 3.62], [-1.04, 3.62], [-1.66, 2.65], [-1.66, -3.12]],
        holes: [rect(-1.57, 1.57, -2.85, 1.72), rect(-0.30, 0.30, 0.92, 2.25), rect(-1.52, -0.65, -3.58, -2.15)],
        foliageExclude: [[[-0.8, 1.6], [0.8, 1.6], [0.95, 3.7], [-0.95, 3.7]]],
        garnishEdgeBandM: 0.4, garnishRiseM: 0.08, reliefScale: 0.6, seed: 9 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.08, z1: 3.04, nz: 42, ny: 9,
        topAt: (z) => abramsHullY(0, z), bottomAt: (z) => 0.72 + Math.sin(z * 2.5) * 0.030,
        // ULCANS hangs from stand-off battens outside the skirt rather than
        // lying in the live SEPv3 shoe/pin envelope (outer x ~= 1.72 m).
        // Keep the lower hem farther out so suspension travel cannot pull a
        // shoe through the cloth while the upper edge still reads attached.
        outAt: (_z, t) => 1.92 + (1 - t) * 0.090, seed: 21 + side,
        // round 3: the drape rolls over the fender edge into the deck cover instead of standing as a free edge
        shoulder: { z0: -3.08, z1: 2.62, inAt: () => 1.6, yAt: (z: number) => sepv3HullY(1.6, z) - 0.004 } })),
      face: [{ z: 3.93, x0: -1.10, x1: 1.10, y0: 0.96, y1: 1.31, nx: 14, ny: 5,
        outline: [[-0.88, 0.96], [0.88, 0.96], [1.10, 1.12], [0.72, 1.31], [-0.72, 1.31], [-1.10, 1.12]],
        holes: [rect(-0.78, -0.42, 1.04, 1.29), rect(0.42, 0.78, 1.04, 1.29)], seed: 29 }],
    },
    turret: {
      top: [{ x0: -1.42, x1: 1.42, z0: -3.35, z1: 1.12, nx: 24, nz: 38,
        yAt: () => 0.88,
        outline: [[-1.05, -3.35], [1.05, -3.35], [1.42, -2.32], [1.36, 0.38], [0.86, 1.12], [-0.86, 1.12], [-1.36, 0.38], [-1.42, -2.32]],
        holes: [rect(-1.26, -0.48, -0.86, 0.02), rect(-0.52, 0.05, 0.06, 0.55), rect(0.16, 0.83, -0.64, 0.06), rect(-1.28, -0.70, -2.92, -1.70), rect(0.68, 1.30, -2.84, -1.62)], seed: 37 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.20, z1: 0.80, nz: 32, ny: 8,
        topAt: () => 0.80, bottomAt: (z) => 0.02 + Math.sin(z * 3.2) * 0.024,
        outAt: (z, t) => (z < -1.65 ? 1.52 : 1.68) + (1 - t) * 0.028, seed: 51 + side,
        // round 3 ("along both turret sides the net rises as vertical free-standing fence panels"): the flank drape
        // rolls over the roof edge and tucks under the roof net
        shoulder: { z0: -3.20, z1: 0.40, inAt: (z: number) => sepv3TurretRoofEdge(z) - 0.06, yAt: () => 0.874 } })),
      face: [{ z: 1.38, x0: -1.36, x1: 1.36, y0: -0.02, y1: 0.76, nx: 20, ny: 8,
        outline: [[-1.00, -0.02], [1.00, -0.02], [1.36, 0.40], [0.96, 0.76], [-0.96, 0.76], [-1.36, 0.40]],
        holes: [rect(-0.52, 0.52, -0.06, 0.68), rect(-1.22, -0.78, 0.44, 0.78), rect(0.78, 1.22, 0.44, 0.78)], seed: 61 }],
    },
  },
  ua_m1a1: {
    id: 'ua_m1a1', seed: 1101, style: 'leafy', density: 0.94, leafScale: 1.02,
    light: 0x737b4d, dark: 0x35472f, netColor: 'rgba(39,54,32,0.84)',
    hull: {
      top: [{ x0: -1.68, x1: 1.68, z0: -3.62, z1: 3.62, nx: 28, nz: 56,
        yAt: abramsHullY,
        outline: [[-1.22, -3.62], [1.22, -3.62], [1.68, -3.12], [1.68, 2.65], [1.04, 3.62], [-1.04, 3.62], [-1.68, 2.65], [-1.68, -3.12]],
        holes: [rect(-1.58, 1.58, -2.88, 1.72), rect(-0.30, 0.30, 0.86, 1.70)], seed: 221 }],
      side: [-1, 1].map((side) => ({ side, z0: -3.18, z1: 3.08, nz: 44, ny: 10,
        topAt: (z) => abramsHullY(0, z), bottomAt: (z) => 0.72 + Math.sin(z * 2.6) * 0.034,
        outAt: (_z, t) => 1.94 + (1 - t) * 0.10, seed: 229 + side })),
      face: [{ z: 3.94, x0: -1.12, x1: 1.12, y0: 0.96, y1: 1.33, nx: 16, ny: 6,
        outline: [[-0.90, 0.96], [0.90, 0.96], [1.12, 1.12], [0.74, 1.33], [-0.74, 1.33], [-1.12, 1.12]],
        holes: [rect(-0.80, -0.40, 1.03, 1.31), rect(0.40, 0.80, 1.03, 1.31)], seed: 237 }],
    },
    // A second carrier drapes over the full field-cage envelope rather than
    // clipping into the Abrams cheeks. It follows the turret rig and keeps a
    // generous center opening for gun elevation and recoil.
    turret: {
      top: [{ x0: -2.10, x1: 2.10, z0: -3.42, z1: 2.66, nx: 34, nz: 48,
        yAt: (x, z) => 1.38 + Math.cos(x * 1.2) * 0.012 - Math.max(0, z - 1.5) * 0.10,
        outline: [[-1.72, -3.42], [1.72, -3.42], [2.10, -2.82], [2.02, 1.80], [1.58, 2.66], [0.54, 2.66], [0.54, 1.82], [-0.54, 1.82], [-0.54, 2.66], [-1.58, 2.66], [-2.02, 1.80], [-2.10, -2.82]],
        holes: [rect(-0.54, 0.54, 1.62, 2.74), rect(-0.48, 0.48, 0.80, 1.70)], seed: 245 }],
      // owner 2026-09-15 (evening): the net walls that hung on the cage's sides and front read as
      // grey panels covering the cage; only the roof drape remains (the cage bars stay visible).
    },
  },
  leo2a6_ua: {
    id: 'leo2a6_ua', seed: 2606, style: 'leafy', density: 0.99, leafScale: 1.04,
    light: 0x747b50, dark: 0x34452f, netColor: 'rgba(38,53,32,0.86)',
    hull: {
      top: [
        { x0: -1.86, x1: 1.86, z0: -3.54, z1: -1.28, nx: 30, nz: 24,
          yAt: (x, z) => 1.91 + Math.cos(x * 1.7 + z) * 0.016,
          outline: [[-1.42, -3.54], [1.42, -3.54], [1.86, -3.12], [1.86, -1.28], [-1.86, -1.28], [-1.86, -3.12]],
          holes: [rect(-1.18, -0.35, -3.18, -2.08), rect(0.35, 1.18, -3.18, -2.08)], seed: 271 },
        { x0: -1.88, x1: 1.88, z0: 1.24, z1: 3.18, nx: 30, nz: 22,
          yAt: (x, z) => 1.77 - Math.max(0, z - 2.08) * 0.30 + Math.cos(x * 2.0) * 0.012,
          outline: [[-1.88, 1.24], [1.88, 1.24], [1.84, 2.66], [1.18, 3.18], [-1.18, 3.18], [-1.84, 2.66]],
          holes: [rect(0.35, 0.92, 1.25, 1.75)], seed: 277 },
      ],
      side: [-1, 1].map((side) => ({ side, z0: -3.34, z1: 3.28, nz: 50, ny: 11,
        topAt: (z) => z > 2.08 ? 1.76 - (z - 2.08) * 0.28 : 1.78,
        bottomAt: (z) => 0.69 + Math.sin(z * 3.1) * 0.034,
        outAt: (_z, t) => 2.25 + (1 - t) * 0.055, seed: 283 + side })),
      face: [{ z: 3.16, x0: -0.90, x1: 0.90, y0: 0.82, y1: 1.40, nx: 14, ny: 8,
        outline: [[-0.76, 0.82], [0.76, 0.82], [0.90, 1.00], [0.72, 1.40], [-0.72, 1.40], [-0.90, 1.00]],
        holes: [], seed: 291 }],
    },
    turret: {
      top: [
        { x0: -1.34, x1: 1.34, z0: -3.34, z1: -1.54, nx: 26, nz: 18,
          yAt: leo2A6UARearRoofY,
          outline: [[-1.02, -3.34], [1.02, -3.34], [1.34, -3.00], [1.30, -1.54], [-1.30, -1.54], [-1.34, -3.00]],
          holes: [rect(-1.17, -0.46, -2.24, -1.30)],
          seatGapM: 0.026, seat: 'bustle-roof', seed: 299 },
        { x0: -1.03, x1: 1.03, z0: -1.58, z1: 0.54, nx: 24, nz: 22,
          yAt: leo2A6UAMidRoofY,
          outline: [[-0.86, -1.58], [0.86, -1.58], [1.03, -0.94], [1.00, 0.54], [-1.00, 0.54], [-1.03, -0.94]],
          // round 4 (2026-10-07, fleetPassDefault vehicleMarkings): a window at the left roof edge over the turret's
          // tactical-number station; round 4's fuller drape and garnish had covered the number (3 of 9 clear samples)
          holes: [rect(-0.94, -0.34, -0.92, -0.22), rect(0.30, 0.94, -0.98, -0.08),
            rect(0.32, 0.96, 0.02, 0.52), rect(0.74, 1.10, -1.56, -1.04)],
          seatGapM: 0.026, seat: 'main-roof', seed: 303 },
        ...[-1, 1].map<TopPanel>((side) => ({
          x0: side < 0 ? -1.30 : 0.22, x1: side < 0 ? -0.22 : 1.30,
          z0: 0.46, z1: 2.18, nx: 13, nz: 20,
          yAt: leo2A6UAFrontRoofY,
          outline: side < 0
            ? [[-1.02, 0.46], [-0.28, 0.46], [-0.22, 2.18], [-0.54, 2.18], [-1.30, 1.42]]
            : [[0.28, 0.46], [1.02, 0.46], [1.30, 1.42], [0.54, 2.18], [0.22, 2.18]],
          holes: side > 0 ? [rect(0.36, 0.96, 0.46, 0.82)] : [],
          seatGapM: 0.026, seat: 'front-crown', seed: 311 + side,
        })),
      ],
      side: [-1, 1].map((side) => ({ side, z0: -3.44, z1: 2.28, nz: 44, ny: 11,
        topAt: (z) => 0.96 - Math.max(0, z - 1.15) * 0.11,
        bottomAt: (z) => 0.02 + Math.sin(z * 3.4) * 0.030,
        outAt: (_z, t) => 1.89 + (1 - t) * 0.045, seed: 307 + side })),
      face: [-1, 1].map<FacePanel>((side) => ({
        z: 0, zAt: leo2A6UAFrontNetZ,
        x0: side < 0 ? -1.32 : 0.34, x1: side < 0 ? -0.34 : 1.32,
        y0: 0.16, y1: 0.62, nx: 14, ny: 8,
        outline: side < 0
          ? [[-1.30, 0.16], [-0.36, 0.16], [-0.34, 0.62], [-1.24, 0.62]]
          : [[0.36, 0.16], [1.30, 0.16], [1.24, 0.62], [0.34, 0.62]],
        holes: [], seatGapM: 0.065, seat: 'cheek-era-face', seed: 317 + side,
      })),
    },
    gun: {
      top: [{ x0: -0.22, x1: 0.22, z0: 0.48, z1: 5.72, nx: 8, nz: 46,
        yAt: (x, z) => 0.17 + Math.cos(z * 3.0 + x) * 0.012,
        outline: [[-0.18, 0.48], [0.18, 0.48], [0.22, 1.55], [0.15, 5.72], [-0.15, 5.72], [-0.22, 1.55]], seed: 331 }],
      side: [-1, 1].map((side) => ({ side, z0: 0.50, z1: 5.72, nz: 44, ny: 5,
        topAt: () => 0.16, bottomAt: () => -0.16,
        outAt: (z, t) => (z < 2.30 ? 0.22 : 0.16) + (1 - t) * 0.018,
        seed: 337 + side })),
    },
  },
} satisfies Readonly<Record<string, GhillieConfig>>);

const GHILLIE_CONFIG_INDEX: Readonly<Record<string, GhillieConfig>> = GHILLIE_SUIT_CONFIGS;

interface GhillieGeometryBuckets {
  readonly net: THREE.BufferGeometry[];
  readonly foliage: FoliageCardBuffer;
}

function appendTopGhilliePanels(
  panels: readonly TopPanel[],
  cfg: GhillieConfig,
  buckets: GhillieGeometryBuckets,
  initialIndex: number,
  ctx: GarnishContext,
): number {
  let panelIndex = initialIndex;
  for (const panel of panels) {
    buckets.net.push(clothTop(panel, cfg.seed, cfg.style));
    if (cfg.foliage !== false) addTopFoliage(buckets.foliage, panel, cfg, cfg.seed + panelIndex * 1000, ctx);
    panelIndex++;
  }
  return panelIndex;
}

function appendSideGhilliePanels(
  panels: readonly SidePanel[],
  cfg: GhillieConfig,
  buckets: GhillieGeometryBuckets,
  initialIndex: number,
  ctx: GarnishContext,
): number {
  let panelIndex = initialIndex;
  for (const panel of panels) {
    buckets.net.push(clothSide(panel, cfg.seed, cfg.style, cfg.maxHalfWidth ?? Infinity));
    if (cfg.foliage !== false) addSideFoliage(buckets.foliage, panel, cfg, cfg.seed + panelIndex * 1000, ctx);
    panelIndex++;
  }
  return panelIndex;
}

function appendFaceGhilliePanels(
  panels: readonly FacePanel[],
  cfg: GhillieConfig,
  buckets: GhillieGeometryBuckets,
  initialIndex: number,
  ctx: GarnishContext,
): number {
  let panelIndex = initialIndex;
  for (const panel of panels) {
    buckets.net.push(clothFace(panel, cfg.seed, cfg.style));
    if (cfg.foliage !== false) addFaceFoliage(buckets.foliage, panel, cfg, cfg.seed + panelIndex * 1000, ctx);
    panelIndex++;
  }
  return panelIndex;
}

function addGhillieOwner(
  P: GhillieBuilderPort,
  cfg: GhillieConfig,
  owner: GhillieOwner,
  parent: THREE.Group,
  panels: GhilliePanels,
): void {
  const buckets: GhillieGeometryBuckets = { net: [], foliage: new FoliageCardBuffer() };
  const ctx: GarnishContext = { q: P.q !== false, maxHalfWidth: cfg.maxHalfWidth ?? Infinity };
  let panelIndex = appendTopGhilliePanels(panels.top ?? [], cfg, buckets, 0, ctx);
  panelIndex = appendSideGhilliePanels(panels.side ?? [], cfg, buckets, panelIndex, ctx);
  appendFaceGhilliePanels(panels.face ?? [], cfg, buckets, panelIndex, ctx);
  const netPack = makeNet(P, cfg, owner);
  addMerged(
    P, parent, buckets.net, netPack.mat, `${cfg.id}_ghillie_${owner}_net`, [netPack.texture],
  );
  const leaves = buckets.foliage.toGeometry();
  if (leaves) {
    const atlas = vehicleFoliageAtlas(cfg.foliageKind ?? defaultFoliageKind(cfg.style));
    const mat = makeCloth(P, (m) => configureFoliageMaterial(m, atlas));
    const mesh = new THREE.Mesh(leaves, mat);
    mesh.name = `${cfg.id}_ghillie_${owner}_leaves`;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.vehicleFoliage = cfg.foliageKind ?? defaultFoliageKind(cfg.style);
    // alpha-cut sprays enclose air between their leaves, like the net that carries them
    mesh.userData.combatHitboxRole = 'nonArmor';
    mesh.userData.continuityRole = 'open-lattice';
    parent.add(mesh);
    // the atlas is shared fleet-wide (vehicleFoliage.ts) and never joins a visual's disposables
    P.disposables.push(leaves, mat);
  }
}

export function addVehicleGhillieSuit(P: GhillieBuilderPort, config?: GhillieConfig): boolean {
  const cfg = config ?? GHILLIE_CONFIG_INDEX[P.spec.id];
  if (!cfg || cfg.disabled) return false;

  const owners: readonly [GhillieOwner, THREE.Group][] = [
    ['hull', P.hullG],
    ['turret', P.turretG],
    ['gun', P.gunG],
  ];
  for (const [owner, parent] of owners) {
    const panels = cfg[owner];
    if (!panels) continue;
    addGhillieOwner(P, cfg, owner, parent, panels);
  }
  return true;
}
