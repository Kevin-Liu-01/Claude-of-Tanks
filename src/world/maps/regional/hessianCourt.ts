// src/world/maps/regional/hessianCourt.ts — the street side of a Hessian farm court (Frontier Basin's Hofreiten, the
// map-revival lane's round 3, 2026-10-06; gauntlet wave 138: "houses stand alone on lawns and mud with no closed courts,
// sandstone walls or gates"). A Hofreite shuts its court off the lane with a wall a man's height, of the red
// Buntsandstein the basin is built of, and with the Hoftor: the big timber gateway, its two board leaves under a little
// roof of their own. The yard hook's court pass (yards.ts planCourt, props.ts) hangs them on the court's street end; they
// are the Hessian kit's own destructible kinds (ArchitectureStyle.destructibles), so no other kit sees them.
//
// Material contract (props.ts): the wall rides the kit's stone material (regionalStone: the sandstone masonry print, its
// courses and joints, under a vertex tint near white like the kit's weathered stone), the gateway the structure wood
// (structureWood: the grain print under the kit's timber colours). Both are single boxes and slabs — the print carries
// the masonry and the boarding — so a module costs a few dozen triangles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALL_SEG } from '../inhabitKit.ts';
import { BUCKET_UV_DENSITY, rgb, shade, type Rgb } from './geometry.ts';
import type { RegionalDestructibleType } from './types.ts';

type Rng = () => number;

/**
 * A box `w` (local x) by `h` by `d` (local z) centred at `at`, coloured `colour` (linear), its UVs in metres times
 * `density`: 'world' projects each face on its two axes in the part's frame plus `at` (courses line up across the
 * wall's parts), 'member' runs v along the box's longest axis (the grain along a post, a board, a lintel).
 */
function part(w: number, h: number, d: number, colour: Rgb, mode: 'world' | 'member', density: number,
  at: readonly [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const long = w >= h && w >= d ? 0 : h >= d ? 1 : 2;
  const p = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    p[0] = pos.getX(i) + (mode === 'world' ? at[0] : 0);
    p[1] = pos.getY(i) + (mode === 'world' ? at[1] : 0);
    p[2] = pos.getZ(i) + (mode === 'world' ? at[2] : 0);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const axis = nx > 0.5 ? 0 : ny > 0.5 ? 1 : 2;
    const [a, b] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    const [ua, va] = mode === 'member' && a === long ? [b, a] : [a, b];
    uv.setXY(i, p[ua] * density, p[va] * density);
  }
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) col.set(colour, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.translate(at[0], at[1], at[2]);
}
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('hessianCourt: empty merge');
  g.computeVertexNormals();
  return g;
}
const tone = (c: Rgb, rng: Rng, spread: number): Rgb => shade(c, 1 - spread / 2 + rng() * spread);

const STONE_UV = BUCKET_UV_DENSITY.regionalStone, WOOD_UV = BUCKET_UV_DENSITY.structureWood;
// the stone print is the kit's sandstone already: the tints are the kit's weathered stone (hessian.ts weather.stone),
// the coping a weathered top
const STONE_TINTS: readonly Rgb[] = [[1, 1, 1], [0.92, 0.9, 0.88], [1.04, 0.98, 0.94]];
const COPING: Rgb = [0.74, 0.7, 0.68];
// the kit's oak (HESSIAN_PALETTE timbers) and its barn-gate boards (hessian.ts GATE), the roof's boards silvered
const OAK = rgb(0x5c4434), BOARD = rgb(0x7a5d44), ROOF = rgb(0x5f5852);

/** The wall's module: overlaps its neighbours a little so the placement's 0.96–1.04 scale never opens a joint. */
const WALL_LEN = WALL_SEG + 0.12, WALL_H = 2.0, WALL_T = 0.5, COPE_H = 0.1;

/**
 * One module of the court wall (WALL_LEN down local z): the ashlar body on a footing course 3 cm proud of each face,
 * under a saddle coping of two slabs with a drip over both faces.
 */
function courtWall(rng: Rng): THREE.BufferGeometry {
  const tint = STONE_TINTS[Math.floor(rng() * STONE_TINTS.length)];
  const top = WALL_H - COPE_H;
  const parts = [
    part(WALL_T + 0.06, 0.3, WALL_LEN, tone(tint, rng, 0.08), 'world', STONE_UV, [0, 0.15, 0]),
    // (the body runs up into the saddle, so no void shows under the ridge at a run's end)
    part(WALL_T, top - 0.15, WALL_LEN, tone(tint, rng, 0.06), 'world', STONE_UV, [0, 0.2 + (top - 0.15) / 2, 0]),
  ];
  // the saddle: two slabs off a ridge down the wall, 6 cm over each face
  const slope = 0.3, half = (WALL_T / 2 + 0.06) / Math.cos(slope);
  for (const side of [-1, 1]) {
    const slab = part(half, COPE_H, WALL_LEN, tone(COPING, rng, 0.08), 'member', STONE_UV);
    slab.rotateZ(-side * slope);
    parts.push(slab.translate(side * (half / 2) * Math.cos(slope), top + COPE_H / 2 + (WALL_T / 4) * Math.tan(slope) - 0.02, 0));
  }
  return merged(parts);
}
/** The wall breached: its footing and a course or two standing, the rest a heap of blocks at its foot. */
function courtWallBroken(rng: Rng): THREE.BufferGeometry {
  const tint = STONE_TINTS[Math.floor(rng() * STONE_TINTS.length)];
  const parts = [
    part(WALL_T + 0.06, 0.3, WALL_LEN, tone(tint, rng, 0.08), 'world', STONE_UV, [0, 0.15, 0]),
    part(WALL_T, 0.5, WALL_LEN * 0.6, tone(tint, rng, 0.08), 'world', STONE_UV, [0, 0.47, -WALL_LEN * 0.18]),
  ];
  for (let k = 0; k < 7; k++) {
    const b = part(0.36 + rng() * 0.3, 0.28, 0.5 + rng() * 0.4, tone(tint, rng, 0.14), 'world', STONE_UV);
    b.rotateY(rng() * Math.PI); b.rotateX((rng() - 0.5) * 0.5);
    parts.push(b.translate((rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.8), 0.12 + rng() * 0.12, (rng() - 0.5) * (WALL_LEN - 0.8)));
  }
  return merged(parts);
}

// the gateway spans its slot: the posts' centres on the slot's ends, where the wall modules beside it end (yards.ts)
const POST_Z = WALL_SEG / 2, POST = 0.3, POST_H = 3.4;
const EAVE_Y = POST_H + 0.28, RISE = 0.62, EAVE_OUT = 0.85;
/**
 * The Hoftor: two oak posts on the slot's ends, a lintel over them with a knee brace off each post, the two leaves
 * shut (upright boards on two ledges and a diagonal brace each, clear of the ground), and over the whole a little
 * saddle roof of boards, its ridge down the wall, 0.85 m over both faces and 0.45 m past the posts. Local z down the
 * wall, x across it.
 */
function hoftor(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const oak = tone(OAK, rng, 0.1), board = tone(BOARD, rng, 0.1);
  for (const s of [-1, 1]) {
    parts.push(part(POST, POST_H, POST, tone(oak, rng, 0.08), 'member', WOOD_UV, [0, POST_H / 2, s * POST_Z]));
    // the knee brace: 45° from the post's face 0.8 m below the lintel to the lintel's underside 0.8 m in
    const len = 0.8 * Math.SQRT2;
    const brace = part(0.13, len, 0.13, oak, 'member', WOOD_UV);
    brace.rotateX(-s * Math.PI / 4);
    parts.push(brace.translate(0, POST_H - 0.4, s * (POST_Z - POST / 2 - 0.4)));
  }
  parts.push(part(0.32, 0.3, 2 * POST_Z + 0.9, oak, 'member', WOOD_UV, [0, POST_H + 0.15, 0]));
  // the leaves: each from the post's face to the middle, four boards on a ledge low and high, a brace between them
  const leafW = POST_Z - POST / 2 - 0.01, leafY0 = 0.12, leafH = POST_H - 0.55 - leafY0;
  for (const s of [-1, 1]) {
    const zc = s * (0.01 + leafW / 2);
    for (let b = 0; b < 4; b++) {
      const bw = leafW / 4;
      parts.push(part(0.06, leafH, bw - 0.012, tone(board, rng, 0.08), 'member', WOOD_UV,
        [0, leafY0 + leafH / 2, zc - leafW / 2 + (b + 0.5) * bw]));
    }
    const yLo = leafY0 + 0.35, yHi = leafY0 + leafH - 0.35;
    for (const y of [yLo, yHi]) parts.push(part(0.05, 0.14, leafW - 0.06, oak, 'member', WOOD_UV, [0.055, y, zc]));
    // the brace climbs from the low ledge at the hinge to the high ledge at the meeting stiles
    const run = leafW - 0.2, rise = yHi - yLo, len = Math.hypot(run, rise);
    const brace = part(0.05, len, 0.12, oak, 'member', WOOD_UV);
    brace.rotateX(-s * Math.atan2(run, rise));
    parts.push(brace.translate(0.055, (yLo + yHi) / 2, zc));
  }
  // the roof: two board slopes off the ridge, a ridge board over their meeting
  const half = Math.hypot(EAVE_OUT, RISE), pitch = Math.atan2(RISE, EAVE_OUT), roofLen = 2 * POST_Z + 0.9 + POST;
  for (const side of [-1, 1]) {
    const slope = part(half, 0.07, roofLen, tone(ROOF, rng, 0.1), 'member', WOOD_UV);
    slope.rotateZ(-side * pitch);
    parts.push(slope.translate(side * EAVE_OUT / 2, EAVE_Y + RISE / 2 + 0.035, 0));
  }
  parts.push(part(0.2, 0.06, roofLen + 0.04, tone(ROOF, rng, 0.1), 'member', WOOD_UV, [0, EAVE_Y + RISE + 0.07, 0]));
  // each gable's truss on the lintel's ends: a tie beam under the eaves and a king post up to the ridge
  for (const s of [-1, 1]) {
    parts.push(part(2 * EAVE_OUT - 0.2, 0.12, 0.12, oak, 'member', WOOD_UV, [0, EAVE_Y - 0.02, s * (POST_Z + 0.3)]));
    parts.push(part(0.12, RISE, 0.12, oak, 'member', WOOD_UV, [0, EAVE_Y + RISE / 2, s * (POST_Z + 0.3)]));
  }
  return merged(parts);
}
/** The gateway down: one post standing, the lintel and the roof boards in a heap, a leaf flat in the gap. */
function hoftorBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const oak = tone(OAK, rng, 0.1);
  parts.push(part(POST, POST_H * 0.72, POST, oak, 'member', WOOD_UV, [0, POST_H * 0.36, POST_Z]));
  const lintel = part(0.32, 0.3, 2 * POST_Z + 0.9, oak, 'member', WOOD_UV);
  lintel.rotateY(0.35); lintel.rotateZ(0.1);
  parts.push(lintel.translate(1.0, 0.3, 0));
  parts.push(part(2.3, 0.07, POST_Z - 0.2, tone(BOARD, rng, 0.1), 'member', WOOD_UV, [0.25, 0.1, -POST_Z / 2]));
  for (let k = 0; k < 4; k++) {
    const b = part(1.0, 0.07, 0.8 + rng() * 1.4, tone(ROOF, rng, 0.12), 'member', WOOD_UV);
    b.rotateY(rng() * Math.PI); b.rotateZ((rng() - 0.5) * 0.5);
    parts.push(b.translate(-0.9 + rng() * 1.8, 0.14 + k * 0.08, (rng() - 0.5) * 2.4));
  }
  return merged(parts);
}

/** The Hessian kit's own destructible kinds: the court wall and the Hoftor. */
export const HESSIAN_COURT_TYPES: Readonly<Record<string, RegionalDestructibleType>> = Object.freeze({
  hessiancourtwall: Object.freeze({ cls: 'break', mat: 'regionalStone', contact: 'ob', r: 1.75, h: WALL_H + 0.07 /* the saddle's ridge */, hw: WALL_T / 2 + 0.08,
    hl: WALL_LEN / 2, build: courtWall, broken: courtWallBroken, wall: true, collider: true, keep: 0.84, crushMin: 2.4 }),
  hoftor: Object.freeze({ cls: 'break', mat: 'structureWood', contact: 'ob', r: 2.0, h: EAVE_Y + RISE + 0.1, hw: POST / 2 + 0.1,
    hl: POST_Z + POST / 2, build: hoftor, broken: hoftorBroken, collider: true, keep: 0.8, crushMin: 2.2 }),
});
