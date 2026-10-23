// src/world/maps/regional/hessianCourt.ts — the street side of a Hessian farm court (Frontier Basin's Hofreiten, the
// map-revival lane's round 3, 2026-10-06; gauntlet wave 138: "houses stand alone on lawns and mud with no closed courts,
// sandstone walls or gates"). A Hofreite shuts its court off the lane with a wall a man's height, of the red
// Buntsandstein the basin is built of, and with the Hoftor: the big timber gateway, its two board leaves under a little
// roof of their own. The yard hook's court pass (yards.ts planCourt, props.ts) hangs them on the court's street end; they
// are the Hessian kit's own destructible kinds (ArchitectureStyle.destructibles), so no other kit sees them.
//
// 2026-10-22 (item/maps-frontier-saltmere-241, the port onto main; the owner: "bunkers r2 is the bar for every prop
// kind"): both kinds rebuilt to the r2 standard (tools/r2-standard.mjs). The wall is dressed courses, never a bare box: a
// plinth a few centimetres proud of the faces, the coursed body, a band course with its drip, and the saddleback coping
// in four dressed stones; its breach a stepped bite with the coping and blocks fallen at its foot. The Hoftor is
// chamfered oak (craftMesh.ts members): the posts, the lintel on them with a knee brace off each, the two leaves of
// boards on ledges with a brace and strap hinges, and a truss at each gable (tie beam, king post, principal rafters)
// under a boarded saddle roof with its ridge board and bargeboards; down, a post snapped, one leaf swung open on its
// hinges, the other leaf, the lintel and a roof slope in the gap. Numbers, collision and contact as round 4's.
//
// Material contract (props.ts): the wall rides the kit's stone material (regionalStone: the sandstone masonry print, its
// courses and joints, under a vertex tint near white like the kit's weathered stone), the gateway the structure wood
// (structureWood: the grain print under the kit's timber colours).
import type * as THREE from 'three';
import { WALL_SEG } from '../inhabitKit.ts';
import { Mesh, X, Y, Z, member, mul, norm, type V3 } from '../craftMesh.ts';
import { BUCKET_UV_DENSITY, rgb, shade, type Rgb } from './geometry.ts';
import type { RegionalDestructibleType } from './types.ts';

type Rng = () => number;
const tone = (c: Rgb, rng: Rng, spread: number): Rgb => shade(c, 1 - spread / 2 + rng() * spread);

// (round 4, gauntlet wave 183: "oversized salmon brick") the wall's courses at 1.7 times the kit's print density: about
// 30 cm courses of blocks half a metre long, the scale of a court wall's red sandstone, not of a house front's ashlar
const STONE_UV = BUCKET_UV_DENSITY.regionalStone * 1.7;
// the stone print is the kit's sandstone already: the tints are the kit's weathered stone (hessian.ts weather.stone),
// the coping a weathered top
const STONE_TINTS: readonly Rgb[] = [[1, 1, 1], [0.92, 0.9, 0.88], [1.04, 0.98, 0.94]];
const COPING: Rgb = [0.74, 0.7, 0.68];
// the kit's oak (HESSIAN_PALETTE timbers) and its barn-gate boards (hessian.ts GATE), the roof's boards silvered, the
// smith's iron; round 4's vertex colours, passed in times the wood print's mean (craftMesh.ts Mesh divides it out)
const WOOD_PRINT_MEAN = 0.8;
const wood = (hex: number): Rgb => mul(rgb(hex), WOOD_PRINT_MEAN);
const OAK = wood(0x5c4434), BOARD = wood(0x7a5d44), ROOF = wood(0x5f5852), IRON = wood(0x2a2826);
const GRAIN = { kind: 'grain', u0: 0 } as const;

/** The wall's module: overlaps its neighbours a little so the placement's 0.96–1.04 scale never opens a joint. */
const WALL_LEN = WALL_SEG + 0.12, WALL_H = 2.0, WALL_T = 0.5;
const PLINTH_H = 0.3, BODY_TOP = 1.75, COPE_Y = BODY_TOP + 0.12, COPE_RIDGE = WALL_H + 0.07;

/** The stone print on a face, placed in the module's frame so the courses run on from one module to the next. */
const stoneUv = (q: V3, n: V3): [number, number] => {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]);
  return ay > 0.6 ? [q[0] * STONE_UV, q[2] * STONE_UV]
    : ax > 0.5 ? [q[2] * STONE_UV, q[1] * STONE_UV] : [q[0] * STONE_UV, q[1] * STONE_UV];
};
/**
 * A dressed stone or course along local z (z0..z1): the section `sec` (x across, y up; counter-clockwise, its first edge
 * the foot) extruded, every face wound out; `foot` false leaves the foot face out (it stands on the course below).
 */
function course(m: Mesh, sec: ReadonlyArray<readonly [number, number]>, z0: number, z1: number, col: Rgb, foot = true): void {
  const n = sec.length;
  for (let k = foot ? 0 : 1; k < n; k++) {
    const [xa, ya] = sec[k], [xb, yb] = sec[(k + 1) % n];
    m.quad([xa, ya, z0], [xb, yb, z0], [xb, yb, z1], [xa, ya, z1], [yb - ya, xa - xb, 0], stoneUv, () => col, true);
  }
  for (const [z, s] of [[z0, -1], [z1, 1]] as const) {
    const nz: V3 = [0, 0, s];
    for (let k = 1; k + 1 < n; k++) {
      const [i, j] = s > 0 ? [k, k + 1] : [k + 1, k];
      const a: V3 = [sec[0][0], sec[0][1], z], b: V3 = [sec[i][0], sec[i][1], z], c: V3 = [sec[j][0], sec[j][1], z];
      m.tri(a, b, c, nz, nz, nz, stoneUv(a, nz), stoneUv(b, nz), stoneUv(c, nz), col);
    }
  }
}
/** A course's section `hw` either side of the wall's line from y0 to y1, its top arrises taken off by `c`. */
const dressed = (hw: number, y0: number, y1: number, c: number, x = 0): Array<[number, number]> =>
  [[x - hw, y0], [x + hw, y0], [x + hw, y1 - c], [x + hw - c, y1], [x - hw + c, y1], [x - hw, y1 - c]];
/** The band course's section: its underside weathered back to a drip `c` either side. */
const band = (hw: number, y0: number, y1: number, c: number): Array<[number, number]> =>
  [[-hw + c, y0], [hw - c, y0], [hw, y0 + c], [hw, y1], [-hw, y1], [-hw, y0 + c]];
/** A saddleback coping stone's section: its eaves `e` thick, its ridge at `top` on the wall's line. */
const saddle = (hw: number, y0: number, e: number, top: number, x = 0): Array<[number, number]> =>
  [[x - hw, y0], [x + hw, y0], [x + hw, y0 + e], [x, top], [x - hw, y0 + e]];

/**
 * One module of the court wall (WALL_LEN down local z): the plinth course 3 cm proud of each face, the coursed body, a
 * band course with its drip, and the saddleback coping in four dressed stones 6 cm over both faces.
 */
function courtWall(rng: Rng): THREE.BufferGeometry {
  const m = new Mesh({ kind: 'stone' });
  const tint = STONE_TINTS[Math.floor(rng() * STONE_TINTS.length)];
  const z0 = -WALL_LEN / 2, z1 = WALL_LEN / 2;
  course(m, dressed(WALL_T / 2 + 0.03, 0, PLINTH_H, 0.03), z0, z1, tone(tint, rng, 0.08), false);
  course(m, dressed(WALL_T / 2, PLINTH_H, BODY_TOP, 0.02), z0, z1, tone(tint, rng, 0.06), false);
  course(m, band(WALL_T / 2 + 0.03, BODY_TOP, COPE_Y, 0.03), z0, z1, tone(tint, rng, 0.06));
  const stones = 4, joint = 0.008, len = (WALL_LEN - (stones - 1) * joint) / stones;
  for (let k = 0; k < stones; k++) {
    const a = z0 + k * (len + joint);
    course(m, saddle(WALL_T / 2 + 0.06, COPE_Y, 0.06, COPE_RIDGE), a, a + len, tone(COPING, rng, 0.08));
  }
  return m.geometry();
}
/**
 * The wall breached: the plinth standing its whole length, the body stepped down into the breach from the module's
 * start and a stump at its end, a coping stone and blocks of the body fallen at its foot either side.
 */
function courtWallBroken(rng: Rng): THREE.BufferGeometry {
  const m = new Mesh({ kind: 'stone' });
  const tint = STONE_TINTS[Math.floor(rng() * STONE_TINTS.length)];
  const z0 = -WALL_LEN / 2, z1 = WALL_LEN / 2, foot = PLINTH_H * 0.9;
  course(m, dressed(WALL_T / 2 + 0.03, 0, foot, 0.03), z0, z1, tone(tint, rng, 0.08), false);
  const lip = 0.75 + rng() * 0.25, step = 0.45 + rng() * 0.15;
  course(m, dressed(WALL_T / 2, foot, 1.2 + rng() * 0.15, 0.02), z0, z0 + lip, tone(tint, rng, 0.08), false);
  course(m, dressed(WALL_T / 2, foot, 0.75, 0.02), z0 + lip, z0 + lip + step, tone(tint, rng, 0.08), false);
  course(m, dressed(WALL_T / 2, foot, 0.55 + rng() * 0.1, 0.02), z1 - 0.5, z1, tone(tint, rng, 0.08), false);
  // a coping stone on its bed beside the breach, turned off the wall's line
  const zc = z0 + lip + step + 0.45, from = m.mark;
  course(m, saddle(WALL_T / 2 + 0.06, 0, 0.06, COPE_RIDGE - COPE_Y, -0.72), zc - 0.38, zc + 0.38, tone(COPING, rng, 0.1));
  m.turn(from, -0.72, zc, 0.5 + rng() * 0.6);
  // the body's blocks: three on the far side of the breach, one on the coping's side at the module's start
  for (const [bx, bz] of [[0.6, -1.0], [0.85, -0.25], [0.65, 0.55], [-0.7, -1.05]] as const) {
    const x = bx + (rng() - 0.5) * 0.16, z = bz + (rng() - 0.5) * 0.16, half = 0.22 + rng() * 0.06;
    const mark = m.mark;
    course(m, dressed(0.17 + rng() * 0.06, 0, 0.24 + rng() * 0.06, 0.02, x), z - half, z + half, tone(tint, rng, 0.14));
    m.turn(mark, x, z, rng() * Math.PI);
  }
  return m.geometry();
}

// the gateway spans its slot: the posts' centres on the slot's ends, where the wall modules beside it end (yards.ts)
const POST_Z = WALL_SEG / 2, POST = 0.3, POST_H = 3.4;
const LINTEL_Y = POST_H + 0.15, TIE_Y = POST_H + 0.26, TIE_TOP = TIE_Y + 0.06, TRUSS_Z = POST_Z + 0.3;
// the roof: its boards' underside a line from the tie beams' ends (x 0.78 at their top) to the ridge, 0.9 m out over
// each face and 0.45 m past the posts; its height the kind's (EAVE_Y + RISE + 0.1 in round 4)
const TIE_X = 0.78, RIDGE_U = 4.25, EAVE_OUT = 0.9, ROOF_T = 0.06, ROOF_LEN = 2 * POST_Z + 0.9 + POST;
const PITCH = (RIDGE_U - TIE_TOP) / TIE_X, KIND_H = POST_H + 0.28 + 0.62 + 0.1;
/** The roof's underside at a distance `x` out from the ridge. */
const underside = (x: number): number => RIDGE_U - PITCH * Math.abs(x);
const LEAF_W = POST_Z - POST / 2 - 0.01, LEAF_Y0 = 0.12, LEAF_H = POST_H - 0.55 - LEAF_Y0;

/**
 * One leaf of the gate, hung from the post on the `s` side: four boards from the post's face to the middle, a ledge low
 * and high on its court face, the brace climbing from the low ledge at the hinge to the high one at the meeting stiles,
 * a strap hinge on each ledge; `h` its boards' height.
 */
function leaf(m: Mesh, rng: Rng, s: 1 | -1, h = LEAF_H): void {
  const zc = s * (0.01 + LEAF_W / 2), bw = LEAF_W / 4;
  for (let b = 0; b < 4; b++) {
    const zb = zc - LEAF_W / 2 + (b + 0.5) * bw;
    member(m, [0, LEAF_Y0, zb], [0, LEAF_Y0 + h, zb], 0.06, bw - 0.012, X, tone(BOARD, rng, 0.08), GRAIN);
  }
  const yLo = LEAF_Y0 + 0.35, yHi = LEAF_Y0 + h - 0.35;
  for (const y of [yLo, yHi]) {
    member(m, [0.055, y, zc - LEAF_W / 2 + 0.03], [0.055, y, zc + LEAF_W / 2 - 0.03], 0.05, 0.14, X, OAK, GRAIN);
    member(m, [0.086, y, s * (POST_Z - POST / 2)], [0.086, y, s * (POST_Z - POST / 2 - 0.56)], 0.012, 0.045, X, IRON, GRAIN);
  }
  member(m, [0.055, yLo + 0.07, s * (0.01 + LEAF_W - 0.1)], [0.055, yHi - 0.07, s * 0.11], 0.05, 0.12, X, OAK, GRAIN, { chamfer: 0.01 });
}

/**
 * The Hoftor: two oak posts on the slot's ends, the lintel over them with a knee brace off each post, the two leaves
 * shut (clear of the ground), and over the whole a boarded saddle roof on a truss at each gable — the tie beam on the
 * lintel's end, the king post and two principal rafters — its ridge board down the wall and a bargeboard on each verge.
 * Local z down the wall, x across it.
 */
function hoftor(rng: Rng): THREE.BufferGeometry {
  const m = new Mesh({ kind: 'wood' });
  const oak = tone(OAK, rng, 0.1);
  for (const s of [-1, 1] as const) {
    member(m, [0, 0, s * POST_Z], [0, POST_H, s * POST_Z], POST, POST, X, tone(oak, rng, 0.08), GRAIN, { chamfer: 0.03 });
    member(m, [0, POST_H - 0.8, s * (POST_Z - POST / 2)], [0, POST_H, s * (POST_Z - POST / 2 - 0.8)], 0.13, 0.13, X, oak, GRAIN,
      { chamfer: 0.015 });
  }
  member(m, [0, LINTEL_Y, -(POST_Z + 0.45)], [0, LINTEL_Y, POST_Z + 0.45], 0.32, 0.3, X, oak, GRAIN, { chamfer: 0.025 });
  leaf(m, rng, -1);
  leaf(m, rng, 1);
  // the trusses on the lintel's ends: the tie beam, the king post to the ridge, the principal rafters under the boards
  for (const s of [-1, 1]) {
    const z = s * TRUSS_Z;
    member(m, [-TIE_X, TIE_Y, z], [TIE_X, TIE_Y, z], 0.12, 0.12, Z, oak, GRAIN, { chamfer: 0.015 });
    member(m, [0, TIE_TOP, z], [0, RIDGE_U, z], 0.12, 0.12, X, oak, GRAIN, { chamfer: 0.015 });
    for (const side of [-1, 1]) {
      const n = norm([side * PITCH, 1, 0]);
      const at = (x: number): V3 => [side * x - n[0] * 0.05, underside(x) - n[1] * 0.05, z];
      member(m, at(TIE_X - 0.02), at(0.05), 0.1, 0.1, Z, oak, GRAIN, { chamfer: 0.012 });
    }
  }
  // the boards: one slope each side off the ridge, the ridge board over their meeting, a bargeboard on each verge
  const roof = tone(ROOF, rng, 0.1);
  for (const side of [-1, 1]) {
    const n = norm([side * PITCH, 1, 0]), down = norm([side, -PITCH, 0]);
    const half = Math.hypot(EAVE_OUT, PITCH * EAVE_OUT), mx = side * EAVE_OUT / 2, my = underside(EAVE_OUT / 2);
    const c: V3 = [mx + n[0] * ROOF_T / 2, my + n[1] * ROOF_T / 2, 0];
    member(m, [c[0], c[1], -ROOF_LEN / 2], [c[0], c[1], ROOF_LEN / 2], half, ROOF_T, down, tone(roof, rng, 0.06), GRAIN, { chamfer: 0.012 });
    for (const s of [-1, 1]) {
      const z = s * (ROOF_LEN / 2 + 0.016);
      member(m, [0, RIDGE_U, z], [side * (EAVE_OUT + 0.02), underside(EAVE_OUT + 0.02), z], 0.032, 0.2, Z, oak, GRAIN);
    }
  }
  const ridgeTop = RIDGE_U + ROOF_T * Math.hypot(1, PITCH);
  member(m, [0, ridgeTop + 0.025, -ROOF_LEN / 2 - 0.02], [0, ridgeTop + 0.025, ROOF_LEN / 2 + 0.02], 0.22, 0.05, X, roof, GRAIN,
    { chamfer: 0.012 });
  return m.geometry();
}
/**
 * The gateway down: one post snapped at a man's height with its leaf still on its hinges, swung open; the other post a
 * stump, its leaf flat in the gap with the lintel across it, and a roof slope fallen beside them.
 */
function hoftorBroken(rng: Rng): THREE.BufferGeometry {
  const m = new Mesh({ kind: 'wood' });
  const oak = tone(OAK, rng, 0.1), standing = 2.3 + rng() * 0.2;
  member(m, [0, 0, POST_Z], [0, standing, POST_Z], POST, POST, X, oak, GRAIN, { chamfer: 0.03 });
  member(m, [0, 0, -POST_Z], [0, 0.9 + rng() * 0.3, -POST_Z], POST, POST, X, oak, GRAIN, { chamfer: 0.03 });
  const hung = m.mark;
  leaf(m, rng, 1, standing - LEAF_Y0 - 0.1);
  m.turn(hung, 0, POST_Z - POST / 2, -(0.45 + rng() * 0.3));
  // the other leaf on its back in the gap: its four boards along z, its ledges up
  const bw = LEAF_W / 4, x0 = -0.95;
  for (let b = 0; b < 4; b++) {
    const xb = x0 + (b + 0.5) * bw;
    member(m, [xb, 0.03, -1.33], [xb, 0.03, 1.33], 0.06, bw - 0.012, Y, tone(BOARD, rng, 0.1), GRAIN);
  }
  for (const z of [-1.0, 0.8]) member(m, [x0 + 0.03, 0.085, z], [x0 + LEAF_W - 0.03, 0.085, z], 0.14, 0.05, Z, OAK, GRAIN);
  member(m, [-0.8, 0.21, -1.2], [-0.1, 0.21, 1.25], 0.32, 0.3, Y, oak, GRAIN, { chamfer: 0.025 });
  // a roof slope on the ground beside the leaf, its inner edge lying on the leaf's boards
  const slope = norm([1, -0.07, 0]), half = Math.hypot(EAVE_OUT, PITCH * EAVE_OUT);
  member(m, [0.25 + half * 0.5 * slope[0], 0.09 + half * 0.5 * slope[1], -1.95], [0.25 + half * 0.5 * slope[0], 0.09 + half * 0.5 * slope[1], 1.9],
    half, ROOF_T, slope, tone(ROOF, rng, 0.12), GRAIN, { chamfer: 0.012 });
  member(m, [0.6, 0.145, 1.7], [1.2, 0.115, 0.3], 0.12, 0.12, Y, oak, GRAIN, { chamfer: 0.015 });
  return m.geometry();
}

/** The Hessian kit's own destructible kinds: the court wall and the Hoftor. */
export const HESSIAN_COURT_TYPES: Readonly<Record<string, RegionalDestructibleType>> = Object.freeze({
  hessiancourtwall: Object.freeze({ cls: 'break', mat: 'regionalStone', contact: 'ob', r: 1.75, h: COPE_RIDGE /* the saddle's ridge */, hw: WALL_T / 2 + 0.08,
    hl: WALL_LEN / 2, build: courtWall, broken: courtWallBroken, wall: true, collider: true, keep: 0.84, crushMin: 2.4 }),
  hoftor: Object.freeze({ cls: 'break', mat: 'structureWood', contact: 'ob', r: 2.0, h: KIND_H, hw: POST / 2 + 0.1,
    hl: POST_Z + POST / 2, build: hoftor, broken: hoftorBroken, collider: true, keep: 0.8, crushMin: 2.2 }),
});

/** The court kinds' builds for the r2 receipt (regionalArchitecture.selftest): intact and broken from one seed. */
export const HESSIAN_COURT_FORMS = Object.freeze({ courtWall, courtWallBroken, hoftor, hoftorBroken });
