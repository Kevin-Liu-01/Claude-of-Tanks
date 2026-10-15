// src/world/maps/regional/polarWorks.ts — the field works in a polar station's own materials (the map-content lane, L2,
// 2026-10-10).
//
// Gauntlet wave 358a on Whiteout Crossing (DYE-M at Cape Dyer, 1985), both critics: "sandbags and barbed wire don't
// belong at a 1985 radar station". The owner's order of 2026-09-17 ("more trenches/barbed wire/AA guns/bunkers on ALL
// maps") keeps the works on every map, so the coordinator's ruling (2026-10-10) keeps them, their cover and their seats,
// and dresses them in the region's materials. A DEW Line station's breastworks were its fuel drums, the POL stock every
// station held by the thousand, stood in rows and filled with gravel; its "wire" was the slatted drift fencing it set
// across the wind. A map adopts the dress by name (props structureVariants), kind by kind:
//   sandbagwall, sandbagsmall, sandbagbig -> polardrumwall, polardrumwallsmall, polardrumwallbig: a breastwork of drums
//     two deep, standing, a course laid along their tops, over the stack's own length and depth (the sandbag stacks'
//     envelopes, sceneryKit.ts SANDBAG_STACKS) and a little over its height;
//   barbedwire -> polardriftfence: a slatted snow fence on two steel posts over the wire's span;
//   barrier -> polardrumrow: four banded drums in a row over the barrier's length.
// Each keeps its kind's name, record radius, class, cover rule (collision.ts names the sandbag kinds dense cover), crush
// threshold and seat. Its records sit on the ground under them, pitched and rolled to it (props.ts groundPose, as the carts
// sit): on a slope the drums stand with it, no corner in the air and none buried. Each build spends exactly the draws the
// generic build spent from the props' shared destructible stream (brokenDraws.ts: every later pool keeps its geometry) and
// draws its own shape from a seed of its own. Pure geometry: no DOM, no materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESTRUCTIBLE_TYPES, bSandbagBroken } from '../inhabitKit.ts';

type Rng = () => number;
/** A colour in HSL (sRGB), the world code's authoring space; stored linear. */
type Hsl = readonly [number, number, number];

// the POL drums: olive drab, black, the red of the petrol drums, a few blue; rust where the paint has gone; the yellow
// band a drum's contents were marked by; the snow on the lids
const OLIVE: Hsl = [0.16, 0.28, 0.25];
const BLACK: Hsl = [0.58, 0.06, 0.11];
const RED: Hsl = [0.01, 0.46, 0.3];
const BLUE: Hsl = [0.58, 0.3, 0.3];
const RUST: Hsl = [0.05, 0.55, 0.22];
const BAND: Hsl = [0.13, 0.68, 0.5];
const SNOW: Hsl = [0.6, 0.1, 0.88];
// the drift fence: laths weathered grey, a few darker; the steel posts; the binding wire
const LATH: Hsl = [0.08, 0.14, 0.42];
const LATH_DARK: Hsl = [0.07, 0.24, 0.27];
const POST: Hsl = [0.6, 0.06, 0.16];
const WIRE: Hsl = [0.6, 0.03, 0.32];

/** The drums' sides. */
const SEG = 10;

const _c = new THREE.Color();
const shade = ([h, s, l]: Hsl, k: number): Hsl => [h, s, l * k];

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
  if (!geometry) throw new Error('polarWorks: the merge produced no geometry');
  return geometry;
}

interface DrumLook { body: Hsl; band?: Hsl; snow?: boolean; bottom?: boolean }

/**
 * A drum `h` tall of radius `r`, its base at the origin and its axis up: the rolled body (a minority of its vertices gone
 * to rust), the two rolling hoops, the band, the lid (snow lying on it) and, for a drum on its side, the bottom.
 */
function drum(r: number, h: number, look: DrumLook, rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = paint(new THREE.CylinderGeometry(r, r, h, SEG, 1, true).translate(0, h / 2, 0), look.body, 0.08, rng);
  const col = body.attributes.color;
  for (let i = 0; i < col.count; i++) {
    if (rng() >= 0.16) continue;
    _c.setHSL(RUST[0], RUST[1], RUST[2] + (rng() - 0.5) * 0.08, THREE.SRGBColorSpace);
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  parts.push(body);
  for (const f of [0.32, 0.68]) {
    parts.push(paint(new THREE.CylinderGeometry(r * 1.035, r * 1.035, h * 0.045, SEG, 1, true).translate(0, h * f, 0), shade(look.body, 0.78), 0.05, rng));
  }
  if (look.band) parts.push(paint(new THREE.CylinderGeometry(r * 1.006, r * 1.006, h * 0.13, SEG, 1, true).translate(0, h * 0.86, 0), look.band, 0.05, rng));
  parts.push(paint(new THREE.CircleGeometry(r, SEG).rotateX(-Math.PI / 2).translate(0, h, 0), look.snow ? SNOW : shade(look.body, 0.9), 0.04, rng));
  if (look.bottom) parts.push(paint(new THREE.CircleGeometry(r, SEG).rotateX(Math.PI / 2), shade(look.body, 0.7), 0.04, rng));
  return merge(parts);
}

/** A drum of the stock: mostly olive and black, the odd petrol red or blue, a third of them banded. */
function stockLook(rng: Rng, snow: boolean): DrumLook {
  const v = rng();
  return { body: v < 0.45 ? OLIVE : v < 0.75 ? BLACK : v < 0.9 ? RED : BLUE, band: rng() < 0.3 ? BAND : undefined, snow };
}

/** A drum on its side, its axis along x, centred on the origin's vertical, lying on y = 0. */
function lyingDrum(r: number, h: number, look: DrumLook, rng: Rng): THREE.BufferGeometry {
  const g = drum(r, h, { ...look, bottom: true }, rng);
  g.rotateY(rng() * Math.PI * 2);
  g.rotateZ(Math.PI / 2);
  return g.translate(h / 2, r, 0);
}

// ---------------------------------------------------------------------------------------------------------- the walls

/** A breastwork's plan: the sandbag stack's envelope it stands in (half length along the wall, half depth, the wall's
 * axis) and the share of its length the top course covers. */
interface WallPlan { half: number; depth: number; along: 'x' | 'z'; course: number; seed: number }

/** The drums of the walls: a 200 L drum at four fifths, so the parapets' own scale (1.15-1.4) stands it full size. */
const WALL_R = 0.24, WALL_H = 0.72, WALL_PITCH = 2 * WALL_R + 0.02, WALL_SETTLE = 0.04;
/** The breastworks' top: the laid course's crown with the snow on it. */
const WALL_TOP = WALL_H - WALL_SETTLE + 2 * WALL_R + 0.035;

/** The rows' offset from the wall's line: the two rows nested (staggered by half a drum) inside the stack's depth. */
const rowOffset = (plan: WallPlan): number => Math.max(WALL_R * 0.9, Math.min(plan.depth - WALL_R, WALL_R + 0.01));
/** The front row's drums (the back row one fewer, staggered by half a pitch). */
const rowDrums = (plan: WallPlan): number => Math.max(2, Math.round((2 * plan.half) / WALL_PITCH));
/** The laid course's drums, end to end. */
const courseDrums = (plan: WallPlan): number => Math.max(1, Math.floor((2 * plan.half - 0.1) / (WALL_H + 0.04)));

/** A wall's half extents in its local frame (x across, z along for a wall along z): the records' footprint. */
function wallExtents(plan: WallPlan): { hw: number; hl: number } {
  const along = ((rowDrums(plan) - 1) * WALL_PITCH) / 2 + WALL_R + 0.03, across = rowOffset(plan) + WALL_R + 0.03;
  return plan.along === 'z' ? { hw: across, hl: along } : { hw: along, hl: across };
}

/**
 * A breastwork of drums: two rows standing along the wall's line, nested, each drum settled a little into the ground and
 * leaning its own way, snow on their lids; a course laid end to end along the groove between their tops (over part of the
 * run on the lower stacks, from one end, as a wall is built up) with the snow along it.
 */
function drumWall(plan: WallPlan): THREE.BufferGeometry {
  const rng = mulberry32(plan.seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = rowDrums(plan), off = rowOffset(plan);
  for (const [row, z] of [[0, -off], [1, off]] as const) {
    const count = row ? n - 1 : n, x0 = -((count - 1) * WALL_PITCH) / 2;
    for (let k = 0; k < count; k++) {
      const g = drum(WALL_R, WALL_H, stockLook(rng, true), rng);
      g.rotateY(rng() * Math.PI * 2);
      g.rotateX((rng() - 0.5) * 0.05);
      g.rotateZ((rng() - 0.5) * 0.05);
      parts.push(g.translate(x0 + k * WALL_PITCH + (rng() - 0.5) * 0.02, -WALL_SETTLE * (0.5 + rng() * 0.5), z + (rng() - 0.5) * 0.02));
    }
  }
  const m = courseDrums(plan), laid = Math.max(1, Math.round(m * plan.course)), from = rng() < 0.5 ? 0 : m - laid;
  const len = WALL_H + 0.04, y = WALL_H - WALL_SETTLE;
  for (let k = from; k < from + laid; k++) {
    const x = -((m - 1) * len) / 2 + k * len;
    parts.push(lyingDrum(WALL_R, WALL_H, stockLook(rng, false), rng).translate(x, y, 0));
    parts.push(paint(new THREE.BoxGeometry(WALL_H * 0.86, 0.035, WALL_R * 0.7).translate(x, y + 2 * WALL_R + 0.012, 0), SNOW, 0.04, rng));
  }
  const g = merge(parts);
  if (plan.along === 'z') g.rotateY(Math.PI / 2);
  return g;
}

/**
 * A breastwork knocked down: a stretch still standing at one end, two deep; the rest of the drums thrown down on their
 * sides in front of it and behind, one in three crushed oval.
 */
function drumWallBroken(plan: WallPlan): THREE.BufferGeometry {
  const rng = mulberry32(plan.seed ^ 0x5b);
  const parts: THREE.BufferGeometry[] = [];
  const n = rowDrums(plan), off = rowOffset(plan), x0 = -((n - 1) * WALL_PITCH) / 2;
  const standing = 2 + Math.floor(rng() * 2);
  for (let k = 0; k < standing; k++) {
    const g = drum(WALL_R, WALL_H, stockLook(rng, true), rng);
    g.rotateY(rng() * Math.PI * 2);
    g.rotateX((rng() - 0.5) * 0.12);
    parts.push(g.translate(x0 + k * WALL_PITCH, -WALL_SETTLE, (k % 2 ? off : -off)));
  }
  const fallen = Math.max(3, 2 * n - 1 + courseDrums(plan) - standing - 4);
  for (let k = 0; k < fallen; k++) {
    const g = lyingDrum(WALL_R, WALL_H, stockLook(rng, false), rng);
    g.translate(0, -WALL_R, 0);
    const crushed = rng() < 0.33;
    if (crushed) g.scale(1, 0.6, 1.18);
    g.rotateY(rng() * Math.PI * 2);
    const x = x0 + WALL_PITCH * (standing + rng() * Math.max(1, n - standing)), z = (rng() - 0.5) * 2.4;
    parts.push(g.translate(Math.min(plan.half, x), WALL_R * (crushed ? 0.6 : 1) - 0.02, z));
  }
  const g = merge(parts);
  if (plan.along === 'z') g.rotateY(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------------------------------------- the drift fence

/** The barbed wire's span (inhabitKit.ts barbedwire hl 1.32): the fence panel stands in its length along z. */
const FENCE_HALF = 1.32;
/** The posts' tops, a hand over the laths'. */
const FENCE_TOP = 1.2;

/**
 * A drift fence's steel post (props census #12: "drift fences with T-section posts"): a rolled T, its flange 5 cm across
 * the run, its stem toward the laths, `h` long from y0; non-indexed, as the kit's parts are.
 */
function tPost(h: number, y0: number): THREE.BufferGeometry {
  const shape = new THREE.Shape([
    new THREE.Vector2(-0.006, -0.025), new THREE.Vector2(0.006, -0.025), new THREE.Vector2(0.006, -0.003),
    new THREE.Vector2(0.034, -0.003), new THREE.Vector2(0.034, 0.003), new THREE.Vector2(0.006, 0.003),
    new THREE.Vector2(0.006, 0.025), new THREE.Vector2(-0.006, 0.025),
  ]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  // (the section in x-y, its length along z: stood up, its flange across the run (z), its stem out along x)
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI / 2);
  return (g.index ? g.toNonIndexed() : g).translate(0, y0, 0);
}

/**
 * A panel of slatted drift fence: grey laths on edge a hand's breadth apart (half the fence open, as a drift fence is),
 * clear of the ground at the foot, bound by twisted wire top and bottom to two steel posts driven at its ends.
 */
function driftFence(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-FENCE_HALF + 0.05, FENCE_HALF - 0.05]) {
    const post = tPost(FENCE_TOP + 0.25, -0.25);
    post.rotateX((rng() - 0.5) * 0.05);
    parts.push(paint(post.translate(0, 0, z), POST, 0.05, rng));
  }
  const run = 2 * FENCE_HALF - 0.12, n = Math.round(run / 0.1), pitch = run / n;
  for (let k = 0; k < n; k++) {
    const h = 1.0 + (rng() - 0.5) * 0.06, foot = 0.1 + (rng() - 0.5) * 0.04;
    const lath = new THREE.BoxGeometry(0.014, h, 0.04).translate(0, h / 2, 0);
    lath.rotateX((rng() - 0.5) * 0.04);
    lath.rotateZ((rng() - 0.5) * 0.03);
    parts.push(paint(lath.translate(0.03, foot, -FENCE_HALF + 0.06 + (k + 0.5) * pitch), rng() < 0.15 ? LATH_DARK : LATH, 0.06, rng));
  }
  for (const y of [0.3, 0.95]) parts.push(paint(new THREE.BoxGeometry(0.01, 0.012, 2 * FENCE_HALF - 0.04).translate(0.042, y, 0), WIRE, 0.03, rng));
  return merge(parts);
}

/** A panel driven down: one post still in, leaning hard; the other out on the snow; the laths flattened and scattered. */
function driftFenceBroken(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const lean = tPost(FENCE_TOP + 0.25, -0.25);
  lean.rotateX(0.45 + rng() * 0.3);
  parts.push(paint(lean.translate(0, 0, -FENCE_HALF + 0.05), POST, 0.05, rng));
  const down = tPost(1.4, -0.7);
  down.rotateZ(Math.PI / 2 - 0.05);
  down.rotateY(rng() * Math.PI);
  parts.push(paint(down.translate((rng() - 0.5) * 0.8, 0.03, FENCE_HALF * 0.6), POST, 0.05, rng));
  for (let k = 0; k < 16; k++) {
    const lath = new THREE.BoxGeometry(0.014, 0.6 + rng() * 0.45, 0.04);
    lath.rotateZ(Math.PI / 2 + (rng() - 0.5) * 0.1);
    lath.rotateY(rng() * Math.PI);
    parts.push(paint(lath.translate((rng() - 0.5) * 1.2, 0.012 + rng() * 0.02, (rng() - 0.5) * 2 * FENCE_HALF), rng() < 0.15 ? LATH_DARK : LATH, 0.06, rng));
  }
  return merge(parts);
}

// ------------------------------------------------------------------------------------------------------- the drum row

/** The road-marker row: full-size drums (the barrier is placed at its own scale), four along the barrier's length. */
const ROW_R = 0.29, ROW_H = 0.88, ROW_Z = [-1.02, -0.34, 0.34, 1.02] as const;
const ROW_TOP = ROW_H + 0.01;

function drumRow(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (const z of ROW_Z) {
    const g = drum(ROW_R, ROW_H, { body: rng() < 0.5 ? BLACK : OLIVE, band: BAND, snow: true }, rng);
    g.rotateY(rng() * Math.PI * 2);
    g.rotateX((rng() - 0.5) * 0.05);
    g.rotateZ((rng() - 0.5) * 0.05);
    parts.push(g.translate((rng() - 0.5) * 0.06, -0.03, z + (rng() - 0.5) * 0.04));
  }
  return merge(parts);
}

/** The row knocked over: one drum still up, the others down and rolled, one crushed. */
function drumRowBroken(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const up = drum(ROW_R, ROW_H, { body: BLACK, band: BAND, snow: true }, rng);
  up.rotateZ(0.08);
  parts.push(up.translate(0, -0.03, ROW_Z[0]));
  for (let k = 1; k < ROW_Z.length; k++) {
    const g = lyingDrum(ROW_R, ROW_H, { body: rng() < 0.5 ? BLACK : OLIVE, band: BAND }, rng);
    g.translate(0, -ROW_R, 0);
    const crushed = k === 2;
    if (crushed) g.scale(1, 0.6, 1.18);
    g.rotateY(rng() * Math.PI * 2);
    parts.push(g.translate((rng() - 0.5) * 1.4, ROW_R * (crushed ? 0.6 : 1) - 0.02, ROW_Z[k] + (rng() - 0.5) * 0.8));
  }
  return merge(parts);
}

// ---------------------------------------------------------------------------------------------------------- the types

type Builder = (rng: Rng) => THREE.BufferGeometry;
/** Spend a generic builder's draws exactly (it is built and thrown away). */
function spend(builder: Builder | null, rng: Rng): void {
  builder?.(rng).dispose();
}

// the sandbag stacks' envelopes (sceneryKit.ts SANDBAG_STACKS: along, half length, half depth; their receipt holds the
// walls to them) and their records' radius and resistance (props.ts LOCAL_TYPES: r, keep)
const WALL: WallPlan = { half: 1.477, depth: 0.497, along: 'z', course: 0.67, seed: 0x9d01 };
const BIG: WallPlan = { half: 1.787, depth: 0.438, along: 'x', course: 1, seed: 0x9d02 };
const SMALL: WallPlan = { half: 1.304, depth: 0.421, along: 'x', course: 0.67, seed: 0x9d03 };

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
    h: WALL_TOP,
    ...wallExtents(plan),
    keep,
    groundPose: true as const,
    build: () => drumWall(plan),
    broken: (rng: Rng) => { bSandbagBroken(rng).dispose(); return drumWallBroken(plan); },
  });
}

export const POLAR_DRUM_WALL = wallType(WALL, 1.5, 0.975);
export const POLAR_DRUM_WALL_BIG = wallType(BIG, 2.0, 0.97);
export const POLAR_DRUM_WALL_SMALL = wallType(SMALL, 1.7, 0.975);

/** The drift fence in place of the barbed wire: the wire's record (class, footprint, resistance), the fence's height. */
export const POLAR_DRIFT_FENCE = Object.freeze({
  ...DESTRUCTIBLE_TYPES.barbedwire,
  h: FENCE_TOP,
  groundPose: true as const,
  build: (rng: Rng) => { spend(DESTRUCTIBLE_TYPES.barbedwire.build, rng); return driftFence(0x9d11); },
  broken: (rng: Rng) => { spend(DESTRUCTIBLE_TYPES.barbedwire.broken, rng); return driftFenceBroken(0x9d12); },
});

/** The drum row in place of the concrete barrier: the barrier's record (class, footprint, collider, resistance). */
export const POLAR_DRUM_ROW = Object.freeze({
  ...DESTRUCTIBLE_TYPES.barrier,
  h: ROW_TOP,
  groundPose: true as const,
  build: (rng: Rng) => { spend(DESTRUCTIBLE_TYPES.barrier.build, rng); return drumRow(0x9d21); },
  broken: (rng: Rng) => { spend(DESTRUCTIBLE_TYPES.barrier.broken, rng); return drumRowBroken(0x9d22); },
});

/** For the receipt: the plans the walls stand in (sceneryKit.ts SANDBAG_STACKS' envelopes). */
export const POLAR_WALL_PLANS = Object.freeze({ sandbagwall: WALL, sandbagbig: BIG, sandbagsmall: SMALL });
