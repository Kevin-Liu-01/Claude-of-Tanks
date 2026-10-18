// src/world/maps/regional/lunarWorks.ts — the field works and the yard clutter in a lunar station's own materials (the
// Earthrise 228 rebuild, 2026-10-18).
//
// On Earthrise the Moon had inherited Mars's props — sandbag breastworks, barbed wire, concrete barriers, traffic cones,
// milk churns, trash cans, pad-mount transformers and timber cable spools on the regolith of the Apollo 17 valley. The
// owner's order of 2026-09-17 ("more trenches/barbed wire/AA guns/bunkers on ALL maps") keeps the works on every map, and
// the coordinator's polar ruling (2026-10-10, polarWorks.ts) keeps them, their cover and their seats, dressed in the place's
// own materials. A map adopts the dress by name (props structureVariants), kind by kind:
//   sandbagwall, sandbagbig, sandbagsmall -> lunarbagwall, lunarbagwallbig, lunarbagwallsmall: regolith bags — white
//     geotextile sacks filled with the valley's regolith and grey with its dust from the ground up, coursed two rows deep
//     in stretcher bond, battered, over the stack's own length and depth and a little over its height;
//   barbedwire -> lunartether: a keep-out tether, two steel stakes banded in reflective tape, the tether line at two
//     heights and orange pennants along the top one;
//   barrier -> lunarblockrow: three sintered regolith blocks in a row over the barrier's length;
//   cone -> lunarbeacon: a delineator pole on its base plate, its solar cap and its pennant;
//   trashcan -> lunarcanister: a waste stowage canister under its clamped lid;
//   fenceplank -> lunarbagfence: the yards' course of regolith bags.
// The Moon's churn (a water can), loose wheel (a mesh rover wheel), cable spool (a steel spool) and transformer (lunar
// switchgear) are already the clutter kit's lunar forms (clutterKit.ts, utilityKit.ts) and stay as they are.
// Each keeps its kind's name, record radius, class, cover rule, crush threshold and seat, and its records sit on the
// ground under it (props.ts groundPose). Each build spends exactly the draws the generic build spent from the props'
// shared destructible stream (brokenDraws.ts: every later pool keeps its geometry) and draws its own shape from a seed of
// its own. Pure geometry: no DOM, no materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESTRUCTIBLE_TYPES } from '../inhabitKit.ts';
import { bSandbagBroken } from '../fieldworksKit.ts';

type Rng = () => number;
/** A colour in HSL (sRGB), the world code's authoring space; stored linear. */
type Hsl = readonly [number, number, number];

// the geotextile under its dust, the dust itself, sintered regolith, steel, safety orange, reflective tape, white panels
// (round 3, 2026-10-18; the blind judge: "the white sandbag stacks ... are off-palette") the geotextile grey under its dust,
// a shade over the regolith, not a white
const BAG: Hsl = [0.1, 0.035, 0.56];
const BAG_DUST: Hsl = [0.09, 0.045, 0.44];
const SINTER: Hsl = [0.08, 0.05, 0.36];
const STEEL: Hsl = [0.1, 0.03, 0.48];
const DARK: Hsl = [0.6, 0.06, 0.18];
const ORANGE: Hsl = [0.06, 0.72, 0.5];
const TAPE: Hsl = [0.15, 0.1, 0.85];
const PANEL: Hsl = [0.1, 0.03, 0.86];
const CABLE: Hsl = [0.6, 0.05, 0.12];

const _c = new THREE.Color();

function mulberry32(a: number): Rng {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Every vertex in one colour, its lightness jittered (painted on the indexed geometry, so shared corners agree). */
function paint<T extends THREE.BufferGeometry>(geo: T, [h, s, l]: Hsl, jit: number, rng: Rng): T {
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _c.setHSL(h, s, Math.max(0.02, l + (rng() - 0.5) * jit), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** One geometry of the parts (position, normal, uv and colour, non-indexed, as the inhabit kit's props are). */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(flat, false);
  for (const part of new Set([...parts, ...flat])) part.dispose();
  if (!geometry) throw new Error('lunarWorks: the merge produced no geometry');
  return geometry;
}

/**
 * A regolith bag `l` long (along x), `h` high and `d` deep, its bottom on y = 0: a filled sack, full in the middle and
 * gathered at its tied ends, settled flat underneath; coloured from its dusted foot to its paler top.
 */
function bag(l: number, h: number, d: number, rng: Rng, dust: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(l, h, d, 2, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), end = Math.abs(x) > l * 0.4;
    if (end) { p.setY(i, p.getY(i) * 0.78); p.setZ(i, p.getZ(i) * 0.74); }
    // the crown rounder than the bed
    if (p.getY(i) > 0 && !end) p.setY(i, p.getY(i) * 1.06);
  }
  g.computeVertexNormals();
  // (round 2, 2026-10-18; the blind critics: "the white sandbag stack is blocky") a filled bag is a pillow, not a box: each
  // corner's normal leans from its face's toward the bag's own rounded body (the ellipsoid through its corners), so the
  // light rolls over its shoulders and crown — the same triangles, no hard edge between its faces
  const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const ex = p.getX(i) / (l * 0.5), ey = p.getY(i) / (h * 0.5), ez = p.getZ(i) / (d * 0.5), el = Math.hypot(ex, ey, ez) || 1;
    const nx = nrm.getX(i) * 0.4 + (ex / el) * 0.6, ny = nrm.getY(i) * 0.4 + (ey / el) * 0.6, nz = nrm.getZ(i) * 0.4 + (ez / el) * 0.6;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(i, nx / nl, ny / nl, nz / nl);
  }
  g.translate(0, h / 2, 0);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i) / h)) * (1 - dust);
    const tone: Hsl = [BAG[0], BAG_DUST[1] + (BAG[1] - BAG_DUST[1]) * t, BAG_DUST[2] + (BAG[2] - BAG_DUST[2]) * t + (rng() - 0.5) * 0.05];
    _c.setHSL(tone[0], tone[1], tone[2], THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------------------------------------------------- the walls

/** A breastwork's plan: the sandbag stack's envelope it stands in (half length along the wall, half depth, the wall's
 * axis, its top) and its seed. */
interface WallPlan { half: number; depth: number; along: 'x' | 'z'; top: number; seed: number }
// the sandbag stacks' envelopes (fieldworksKit.ts SANDBAG_STACKS) and their records' radius and resistance (props.ts)
const WALL: WallPlan = { half: 1.477, depth: 0.497, along: 'z', top: 0.9, seed: 0x1a01 };
const BIG: WallPlan = { half: 1.787, depth: 0.438, along: 'x', top: 1.23, seed: 0x1a02 };
const SMALL: WallPlan = { half: 1.304, depth: 0.421, along: 'x', top: 0.95, seed: 0x1a03 };

const BAG_L = 0.56, BAG_H = 0.24, BAG_D = 0.34;
/** The courses a wall lays to reach its top a little over the stack's. */
const courses = (plan: WallPlan): number => Math.max(3, Math.round(plan.top / (BAG_H * 0.92)));

/** A wall's half extents in its local frame (x across, z along for a wall along z): the records' footprint. */
function wallExtents(plan: WallPlan): { hw: number; hl: number } {
  const along = plan.half + 0.02, across = Math.min(plan.depth, BAG_D + 0.02) + 0.03;
  return plan.along === 'z' ? { hw: across, hl: along } : { hw: along, hl: across };
}
const wallTop = (plan: WallPlan): number => courses(plan) * BAG_H * 0.92 + BAG_H * 0.1;

/**
 * A breastwork of regolith bags: two rows (front and back) in stretcher bond, each course stepping in a little, the top
 * course a bag short at one end (built up from the other).
 */
function bagWall(plan: WallPlan): THREE.BufferGeometry {
  const rng = mulberry32(plan.seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = courses(plan), rowZ = Math.min(plan.depth, BAG_D + 0.02) - BAG_D / 2;
  for (let c = 0; c < n; c++) {
    const inset = c * 0.035, y = c * BAG_H * 0.92, half = plan.half - inset - (c === n - 1 ? BAG_L * 0.5 : 0);
    const count = Math.max(2, Math.round((2 * half) / BAG_L)), pitch = (2 * half) / count, off = (c % 2) * pitch * 0.5;
    for (const z of [-rowZ + inset, rowZ - inset]) {
      for (let k = 0; k < count - (c % 2); k++) {
        const x = -half + off + (k + 0.5) * pitch;
        const g = bag(pitch - 0.03, BAG_H * (0.96 + rng() * 0.1), BAG_D * (0.94 + rng() * 0.08), rng, Math.max(0, 0.6 - c * 0.25));
        g.rotateY((rng() - 0.5) * 0.08);
        parts.push(g.translate(x + (rng() - 0.5) * 0.03, y - 0.02, z + (rng() - 0.5) * 0.03));
      }
    }
  }
  const g = merge(parts);
  if (plan.along === 'z') g.rotateY(Math.PI / 2);
  return g;
}

/** A breastwork knocked down: a stub still standing at one end, the rest of the bags spilled in front and behind. */
function bagWallBroken(plan: WallPlan): THREE.BufferGeometry {
  const rng = mulberry32(plan.seed ^ 0x5b);
  const parts: THREE.BufferGeometry[] = [];
  const rowZ = Math.min(plan.depth, BAG_D + 0.02) - BAG_D / 2;
  for (let c = 0; c < 2; c++) for (const z of [-rowZ, rowZ]) {
    parts.push(bag(BAG_L - 0.03, BAG_H, BAG_D, rng, 0.4).translate(-plan.half + 0.3 + (c % 2) * 0.28, c * BAG_H * 0.92 - 0.02, z));
  }
  for (let k = 0; k < 9; k++) {
    const g = bag(BAG_L - 0.03, BAG_H * 0.8, BAG_D * 1.1, rng, 0.2);
    g.rotateY(rng() * Math.PI);
    parts.push(g.translate(-plan.half + 0.9 + rng() * (2 * plan.half - 1.0), -0.03 + (k % 3 === 2 ? BAG_H * 0.7 : 0), (rng() - 0.5) * 1.6));
  }
  const g = merge(parts);
  if (plan.along === 'z') g.rotateY(Math.PI / 2);
  return g;
}

// --------------------------------------------------------------------------------------------------- the keep-out tether

/** The barbed wire's span (inhabitKit.ts barbedwire hl 1.32): the tether stands in its length along z. */
const TETHER_HALF = 1.3, TETHER_TOP = 1.06;

function stake(h: number, rng: Rng): THREE.BufferGeometry {
  return merge([
    paint(new THREE.CylinderGeometry(0.025, 0.03, h, 6).translate(0, h / 2 - 0.25, 0), STEEL, 0.04, rng),
    paint(new THREE.CylinderGeometry(0.032, 0.032, 0.09, 6).translate(0, h - 0.4, 0), TAPE, 0.03, rng),
    paint(new THREE.CylinderGeometry(0.032, 0.032, 0.09, 6).translate(0, h - 0.62, 0), TAPE, 0.03, rng),
    paint(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 6).translate(0, h - 0.25, 0), ORANGE, 0.03, rng),
  ]);
}

function tether(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-TETHER_HALF + 0.03, TETHER_HALF - 0.03]) {
    const s = stake(TETHER_TOP + 0.25, rng);
    s.rotateX((rng() - 0.5) * 0.04);
    parts.push(s.translate(0, 0, z));
  }
  // the tether at two heights, sagging a hand between the stakes; the pennants along the upper line
  for (const [y, sag] of [[0.9, 0.06], [0.45, 0.03]] as const) {
    for (let k = 0; k < 4; k++) {
      const z0 = -TETHER_HALF + 0.03 + k * (2 * TETHER_HALF - 0.06) / 4, z1 = z0 + (2 * TETHER_HALF - 0.06) / 4;
      const y0 = y - sag * Math.sin((k / 4) * Math.PI), y1 = y - sag * Math.sin(((k + 1) / 4) * Math.PI);
      const len = Math.hypot(z1 - z0, y1 - y0);
      const seg = new THREE.BoxGeometry(0.012, 0.012, len + 0.01);
      seg.rotateX(-Math.atan2(y1 - y0, z1 - z0));
      parts.push(paint(seg.translate(0, (y0 + y1) / 2, (z0 + z1) / 2), CABLE, 0.03, rng));
    }
  }
  for (let k = 1; k <= 3; k++) {
    const z = -TETHER_HALF + k * (2 * TETHER_HALF) / 4, y = 0.9 - 0.06 * Math.sin((k / 4) * Math.PI);
    parts.push(paint(new THREE.BoxGeometry(0.006, 0.16, 0.14).translate(0, y - 0.085, z), ORANGE, 0.06, rng));
  }
  return merge(parts);
}

/** The tether run over: one stake leaning hard, the other flat, the line on the ground. */
function tetherBroken(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const lean = stake(TETHER_TOP + 0.25, rng);
  lean.rotateX(0.5 + rng() * 0.3);
  parts.push(lean.translate(0, 0, -TETHER_HALF + 0.03));
  const down = stake(TETHER_TOP + 0.25, rng);
  down.rotateZ(Math.PI / 2 - 0.04);
  parts.push(down.translate(0.4, 0.03, TETHER_HALF * 0.5));
  parts.push(paint(new THREE.BoxGeometry(0.012, 0.012, 2.2).rotateY(0.2).translate(0.1, 0.01, 0), CABLE, 0.03, rng));
  parts.push(paint(new THREE.BoxGeometry(0.14, 0.006, 0.16).translate(0.3, 0.005, 0.4), ORANGE, 0.06, rng));
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------------- the block row

/** The barrier's length (inhabitKit.ts barrier hl 1.42): three sintered blocks along z. */
const ROW_Z = [-0.95, 0, 0.95] as const, ROW_TOP = 0.86;

function sinteredBlock(rng: Rng, h: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.78, h, 0.86, 1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.9); p.setZ(i, p.getZ(i) * 0.93); }
  g.computeVertexNormals();
  return paint(g.translate(0, h / 2, 0), SINTER, 0.07, rng);
}

function blockRow(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  return merge(ROW_Z.map((z) => {
    const g = sinteredBlock(rng, ROW_TOP - rng() * 0.06);
    g.rotateY((rng() - 0.5) * 0.08);
    return g.translate((rng() - 0.5) * 0.06, -0.02, z);
  }));
}

function blockRowBroken(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts = [sinteredBlock(rng, ROW_TOP).translate(0, -0.02, ROW_Z[0])];
  for (const z of [ROW_Z[1], ROW_Z[2]]) {
    const g = sinteredBlock(rng, ROW_TOP);
    g.rotateZ(Math.PI / 2 * (rng() < 0.5 ? 1 : -1));
    g.rotateY(rng() * Math.PI);
    parts.push(g.translate((rng() - 0.5) * 1.2, 0.39, z + (rng() - 0.5) * 0.5));
  }
  return merge(parts);
}

// ----------------------------------------------------------------------------------------------- the light clutter

/** A delineator beacon: its base plate, the pole, the solar cap and its pennant (in the cone's 0.8 m). */
function beacon(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  return merge([
    paint(new THREE.CylinderGeometry(0.24, 0.26, 0.05, 10).translate(0, 0.025, 0), STEEL, 0.05, rng),
    paint(new THREE.CylinderGeometry(0.025, 0.03, 0.68, 6).translate(0, 0.39, 0), PANEL, 0.03, rng),
    paint(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6).translate(0, 0.42, 0), ORANGE, 0.03, rng),
    paint(new THREE.BoxGeometry(0.16, 0.05, 0.16).translate(0, 0.755, 0), DARK, 0.03, rng),
    paint(new THREE.BoxGeometry(0.1, 0.03, 0.1).translate(0, 0.79, 0), ORANGE, 0.03, rng),
    paint(new THREE.BoxGeometry(0.006, 0.14, 0.18).translate(0, 0.58, 0.115), ORANGE, 0.05, rng),
  ]);
}

/** A waste stowage canister (in the trash can's 0.85 m): its drum, clamped lid and label. */
function canister(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  return merge([
    paint(new THREE.CylinderGeometry(0.29, 0.3, 0.74, 12).translate(0, 0.37, 0), STEEL, 0.05, rng),
    paint(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 12).translate(0, 0.77, 0), PANEL, 0.04, rng),
    paint(new THREE.CylinderGeometry(0.302, 0.302, 0.14, 12).translate(0, 0.5, 0), ORANGE, 0.04, rng),
    paint(new THREE.BoxGeometry(0.2, 0.04, 0.05).translate(0, 0.82, 0), DARK, 0.03, rng),
  ]);
}

/** The yards' course of regolith bags in the plank fence's run along z: two courses and a coping bag here and there. */
const FENCE_HALF = 1.24;
function bagFence(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 3; c++) {
    const n = c === 2 ? 2 : 4, pitch = (2 * FENCE_HALF) / 4, off = c === 1 ? pitch * 0.5 : 0;
    for (let k = 0; k < n - (c === 1 ? 1 : 0); k++) {
      const x = -FENCE_HALF + off + (k + 0.5) * pitch + (c === 2 ? (rng() < 0.5 ? 0 : pitch * 2) : 0);
      const g = bag(pitch - 0.03, 0.3, 0.36, rng, Math.max(0, 0.6 - c * 0.3));
      g.rotateY((rng() - 0.5) * 0.08);
      parts.push(g.translate(x, c * 0.28 - 0.02, (rng() - 0.5) * 0.03));
    }
  }
  return merge(parts).rotateY(Math.PI / 2);
}
function bagFenceBroken(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const g = bag(0.58, 0.26, 0.38, rng, 0.3);
    g.rotateY(rng() * Math.PI);
    parts.push(g.translate((rng() - 0.5) * 0.8, -0.02 + (k === 5 ? 0.22 : 0), -FENCE_HALF + 0.3 + k * 0.42));
  }
  return merge(parts);
}

// ---------------------------------------------------------------------------------------------------------- the types

type Builder = ((rng: Rng) => THREE.BufferGeometry) | null | undefined;
/** Spend a generic builder's draws exactly (it is built and thrown away). */
function spend(builder: Builder, rng: Rng): void {
  builder?.(rng).dispose();
}

/** A breastwork's kind: the stack's record (class, cover, radius, resistance), its own footprint and height. The stacks'
 * intact builds draw nothing from the props stream (their own seeded streams); their breaks spend the burst-bag remnant's
 * draws (props.ts: buildSandbagHeap runs bSandbagBroken first), which this break spends too. */
function wallType(plan: WallPlan, r: number, keep: number) {
  return Object.freeze({
    cls: 'break' as const,
    mat: 'baked' as const,
    contact: 'ob' as const,
    collider: true as const,
    r,
    h: wallTop(plan),
    ...wallExtents(plan),
    keep,
    groundPose: true as const,
    build: () => bagWall(plan),
    broken: (rng: Rng) => { bSandbagBroken(rng).dispose(); return bagWallBroken(plan); },
  });
}

export const LUNAR_BAG_WALL = wallType(WALL, 1.5, 0.975);
export const LUNAR_BAG_WALL_BIG = wallType(BIG, 2.0, 0.97);
export const LUNAR_BAG_WALL_SMALL = wallType(SMALL, 1.7, 0.975);

/** A generic kind dressed: its record as it is, its build and break the lunar form's after the generic draws. */
function dressed<K extends keyof typeof DESTRUCTIBLE_TYPES>(kind: K, h: number, build: () => THREE.BufferGeometry, broken: (() => THREE.BufferGeometry) | null,
  extents: { hw?: number } = {}) {
  const generic = DESTRUCTIBLE_TYPES[kind] as { build: Builder; broken?: Builder };
  return Object.freeze({
    ...DESTRUCTIBLE_TYPES[kind],
    mat: 'baked' as const,
    h,
    ...extents,
    groundPose: true as const,
    build: (rng: Rng) => { spend(generic.build, rng); return build(); },
    broken: broken ? (rng: Rng) => { spend(generic.broken, rng); return broken(); } : null,
  });
}

export const LUNAR_TETHER = dressed('barbedwire', TETHER_TOP, () => tether(0x1a11), () => tetherBroken(0x1a12));
export const LUNAR_BLOCK_ROW = dressed('barrier', ROW_TOP, () => blockRow(0x1a21), () => blockRowBroken(0x1a22));
export const LUNAR_BEACON = dressed('cone', 0.805, () => beacon(0x1a31), null);
export const LUNAR_CANISTER = dressed('trashcan', 0.84, () => canister(0x1a71), null);
// (the bag course is a bag's depth across, where the plank fence was a board's: its footprint takes the bags')
export const LUNAR_BAG_FENCE = dressed('fenceplank', 0.9, () => bagFence(0x1a91), () => bagFenceBroken(0x1a92), { hw: 0.22 });

/** For the receipt: the plans the walls stand in (fieldworksKit.ts SANDBAG_STACKS' envelopes). */
export const LUNAR_WALL_PLANS = Object.freeze({ sandbagwall: WALL, sandbagbig: BIG, sandbagsmall: SMALL });
/** The Moon's structure variants, kind by kind (props structureVariants). */
export const LUNAR_STRUCTURE_VARIANTS = Object.freeze({
  sandbagwall: 'lunarbagwall', sandbagbig: 'lunarbagwallbig', sandbagsmall: 'lunarbagwallsmall', barbedwire: 'lunartether',
  barrier: 'lunarblockrow', cone: 'lunarbeacon', trashcan: 'lunarcanister', fenceplank: 'lunarbagfence',
} as const);
