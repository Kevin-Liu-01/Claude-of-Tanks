// src/world/maps/sceneryKit.ts — the scenery lane's built landmarks (2026-10-03): the small things people set in a
// landscape that make a place nameable — a carved wayside shrine on its pillar, a timber field cross under its little
// roof, the Orthodox roadside cross, the steel wind pump that drains a polder, the lattice pylons of a high-voltage
// line. Stone landmarks that weather like the map's rock (calvaries, standing stones, cairns) are rock forms in
// sceneryRocks.ts; this kit holds the timber and steel ones.
//
// The destructible landmarks join the props destructible pools through SCENERY_DESTRUCTIBLE_TYPES (merged into the
// props type registry): a shrine breaks to its stump, a cross and a wind pump topple on their hinge as the lamps do —
// one instanced pool per kind, built from the kit's seeded builder, so a map that places none pays nothing. The pylon
// line is static scenery: its towers fold into the props `baked` bucket (no draw of their own) and only their legs
// stand in a hull's way; the conductors are thin catenaries in the same bucket.
//
// Builders author in HSL (sRGB) and store linear vertex colour (the inhabiting kit's convention); the timber pieces
// carry UVs for the props wood atlas. Origin at the base centre, +Y up, the face toward +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DestructiblePropType } from './inhabitKit.ts';
// (b15: the field stacks of every region, and the straw props' bands of the hay print)
import { HAY_FACE_V, HAY_WOOD_V } from '../hayPrint.ts';
import { mapToBand } from './haystackKit.ts';

type Rng = () => number;
type Palette = readonly [number, number, number];

const _c = new THREE.Color();

function scaleUV<T extends THREE.BufferGeometry>(geo: T, su: number, sv: number): T {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function box(w: number, h: number, d: number, uvScale = 0.7): THREE.BufferGeometry {
  return scaleUV(new THREE.BoxGeometry(w, h, d), Math.max(w, d) * uvScale, h * uvScale);
}

function paint<T extends THREE.BufferGeometry>(geo: T, pal: Palette, jit: number, rng: Rng): T {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _c.setHSL(pal[0], pal[1], Math.max(0.02, pal[2] + (rng() - 0.5) * jit), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** One attribute set for every part (position, normal, uv, colour where the kind's material wants it), merged. */
function merge(parts: THREE.BufferGeometry[], withColor: boolean, withUv: boolean): THREE.BufferGeometry {
  const ready = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (withUv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!withUv && g.attributes.uv) g.deleteAttribute('uv');
    if (withColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    if (!withColor && g.attributes.color) g.deleteAttribute('color');
    return g;
  });
  const merged = mergeGeometries(ready, false);
  if (!merged) throw new Error('sceneryKit: merge produced no geometry');
  return merged;
}

// palettes (sRGB HSL)
const SANDSTONE_RED: Palette = [0.03, 0.34, 0.40];
const SANDSTONE_GREY: Palette = [0.09, 0.10, 0.52];
const NICHE_DARK: Palette = [0.06, 0.18, 0.14];
const SHRINE_PAINT: Palette = [0.6, 0.30, 0.42];
const GALV: Palette = [0.56, 0.03, 0.50];
const GALV_DARK: Palette = [0.58, 0.04, 0.30];
const VANE_PAINT: Palette = [0.33, 0.30, 0.30];
const CONCRETE: Palette = [0.10, 0.05, 0.56];
const IRON: Palette = [0.6, 0.05, 0.13];
const INSULATOR: Palette = [0.55, 0.10, 0.22];

// ---------------------------------------------------------------------------------------------- wayside shrine

/** A Bildstock: a carved sandstone pillar on a plinth, the niche house on top under a saddle cap, an iron cross. */
function bBildstock(rng: Rng): THREE.BufferGeometry {
  const red = rng() < 0.6;
  const stone = red ? SANDSTONE_RED : SANDSTONE_GREY;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(box(0.66, 0.36, 0.66).translate(0, 0.18, 0), stone, 0.05, rng));
  parts.push(paint(box(0.5, 0.12, 0.5).translate(0, 0.42, 0), stone, 0.05, rng));
  parts.push(paint(box(0.3, 1.5, 0.3).translate(0, 1.23, 0), stone, 0.06, rng));
  parts.push(paint(box(0.42, 0.08, 0.42).translate(0, 2.01, 0), stone, 0.05, rng));
  // the niche house: back, sides and a sill framing a dark recess with its painted panel
  parts.push(paint(box(0.56, 0.62, 0.12).translate(0, 2.36, -0.16), stone, 0.05, rng));
  for (const side of [-1, 1]) parts.push(paint(box(0.1, 0.62, 0.36).translate(side * 0.23, 2.36, 0), stone, 0.05, rng));
  parts.push(paint(box(0.36, 0.5, 0.04).translate(0, 2.34, -0.08), NICHE_DARK, 0.04, rng));
  parts.push(paint(box(0.2, 0.3, 0.02).translate(0, 2.36, -0.055), SHRINE_PAINT, 0.08, rng));
  parts.push(paint(box(0.56, 0.08, 0.4).translate(0, 2.02, 0.01), stone, 0.05, rng));
  // the saddle cap: two sloped slabs meeting on the ridge
  for (const side of [-1, 1]) {
    const slab = box(0.38, 0.07, 0.5);
    slab.rotateZ(side * -0.55);
    parts.push(paint(slab.translate(side * 0.15, 2.78, 0), stone, 0.05, rng));
  }
  // the iron cross on the ridge
  parts.push(paint(box(0.035, 0.34, 0.035).translate(0, 3.05, 0), IRON, 0.02, rng));
  parts.push(paint(box(0.2, 0.035, 0.035).translate(0, 3.1, 0), IRON, 0.02, rng));
  return merge(parts, true, false);
}

/** What stays of a broken shrine: the plinth and the stump of the pillar, the niche house in pieces at its foot. */
function bBildstockBroken(rng: Rng): THREE.BufferGeometry {
  const stone = rng() < 0.6 ? SANDSTONE_RED : SANDSTONE_GREY;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(box(0.66, 0.36, 0.66).translate(0, 0.18, 0), stone, 0.05, rng));
  const stump = box(0.3, 0.55, 0.3);
  stump.rotateZ(0.08);
  parts.push(paint(stump.translate(0.02, 0.62, 0), stone, 0.06, rng));
  for (let i = 0; i < 4; i++) {
    const chunk = box(0.22 + rng() * 0.2, 0.12 + rng() * 0.1, 0.2 + rng() * 0.18);
    chunk.rotateY(rng() * 3); chunk.rotateZ((rng() - 0.5) * 0.6);
    parts.push(paint(chunk.translate((rng() - 0.5) * 1.4, 0.07, 0.4 + rng() * 0.6), stone, 0.06, rng));
  }
  return merge(parts, true, false);
}

// ---------------------------------------------------------------------------------------------- timber crosses

/** A field cross: a squared oak upright on a stone footing, the crossbar, a small board roof over the corpus. */
function bWaysideCross(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(0.17, 3.5, 0.15).translate(0, 1.75, 0));
  parts.push(box(1.36, 0.14, 0.12).translate(0, 2.62, 0.01));
  // the roof: two boards on a ridge, and its gable board
  for (const side of [-1, 1]) {
    const board = box(0.4, 0.035, 0.5, 0.9);
    board.rotateZ(side * -0.62);
    parts.push(board.translate(side * 0.15, 3.46, 0.08));
  }
  parts.push(box(0.08, 0.06, 0.52).translate(0, 3.58, 0.08));
  // the corpus: a pale carved figure on the crossing (arms along the bar)
  parts.push(box(0.1, 0.62, 0.06).translate(0, 2.36, 0.1));
  parts.push(box(0.9, 0.06, 0.05).translate(0, 2.6, 0.1));
  // the little picket fence round its foot
  for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) parts.push(box(0.06, 0.62, 0.06).translate(x, 0.31, z));
  for (const z of [-0.62, 0.62]) parts.push(box(1.24, 0.05, 0.04).translate(0, 0.5, z));
  for (const x of [-0.62, 0.62]) parts.push(box(0.04, 0.05, 1.24).translate(x, 0.5, 0));
  void rng;
  return merge(parts, false, true);
}

/** An Orthodox roadside cross: three bars (the lowest slanted), a two-board pitched roof (the golubets). */
function bOrthodoxCross(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(0.16, 3.4, 0.14).translate(0, 1.7, 0));
  parts.push(box(0.56, 0.11, 0.11).translate(0, 2.98, 0.01));
  parts.push(box(1.3, 0.13, 0.12).translate(0, 2.58, 0.01));
  const foot = box(0.8, 0.11, 0.11);
  foot.rotateZ(-0.38);
  parts.push(foot.translate(0, 1.32, 0.01));
  for (const side of [-1, 1]) {
    const board = box(0.5, 0.035, 0.26, 0.9);
    board.rotateZ(side * -0.6);
    parts.push(board.translate(side * 0.19, 3.42, 0));
  }
  // the foot: two short sill beams crossed in the turf
  parts.push(box(0.9, 0.12, 0.14).translate(0, 0.05, 0));
  parts.push(box(0.14, 0.12, 0.9).translate(0, 0.05, 0));
  void rng;
  return merge(parts, false, true);
}

// ---------------------------------------------------------------------------------------------- wind pump

/**
 * An "American" windmotor on a polder dyke: a tapered four-legged steel lattice, the platform and the head, an
 * eighteen-blade rotor in its ring, the tail vane, the pump rod down the middle and the concrete footings.
 */
function bWindPump(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const H = 11.5, base = 1.35, topHalf = 0.32;
  const halfAt = (y: number) => base + (topHalf - base) * (y / H);
  const strut = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number, pal: Palette) => {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(t, len, t);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    g.applyQuaternion(q);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parts.push(paint(g, pal, 0.04, rng));
  };
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) {
    strut(sx * base, 0, sz * base, sx * topHalf, H, sz * topHalf, 0.09, GALV);
    parts.push(paint(box(0.5, 0.3, 0.5).translate(sx * base, 0.05, sz * base), CONCRETE, 0.05, rng));
  }
  const bays = 5;
  for (let b = 0; b <= bays; b++) {
    const y = 0.45 + (H - 0.9) * (b / bays);
    const h = halfAt(y);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      strut(ax * h, y, az * h, bx * h, y, bz * h, 0.05, GALV);
      if (b < bays) {
        const y2 = 0.45 + (H - 0.9) * ((b + 1) / bays), h2 = halfAt(y2);
        strut(ax * h, y, az * h, bx * h2, y2, bz * h2, 0.03, GALV_DARK);
        strut(bx * h, y, bz * h, ax * h2, y2, az * h2, 0.03, GALV_DARK);
      }
    }
  }
  // the platform and the head
  parts.push(paint(box(1.2, 0.06, 1.2).translate(0, H - 0.1, 0), GALV_DARK, 0.04, rng));
  parts.push(paint(box(0.42, 0.42, 0.9).translate(0, H + 0.32, 0.05), GALV_DARK, 0.04, rng));
  // the rotor: eighteen pitched blades between a hub and an outer ring, facing +Z
  const R = 1.95, hubZ = 0.62;
  const hub = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8, 1);
  hub.rotateX(Math.PI / 2);
  parts.push(paint(hub.translate(0, H + 0.36, hubZ), GALV_DARK, 0.03, rng));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(0.28, R - 0.3, 0.025);
    blade.translate(0, (R - 0.3) / 2 + 0.25, 0);
    blade.rotateY(0.5); // pitch into the wind
    blade.rotateZ(a);
    parts.push(paint(blade.translate(0, H + 0.36, hubZ), GALV, 0.06, rng));
  }
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
    strut(Math.cos(a0) * R, H + 0.36 + Math.sin(a0) * R, hubZ, Math.cos(a1) * R, H + 0.36 + Math.sin(a1) * R, hubZ, 0.05, GALV_DARK);
  }
  // the tail: a boom to the vane plate behind the head
  strut(0, H + 0.4, -0.2, 0, H + 0.55, -2.4, 0.06, GALV_DARK);
  parts.push(paint(box(0.03, 1.0, 1.25).translate(0, H + 0.62, -2.6), VANE_PAINT, 0.05, rng));
  // the pump rod and the pump at the foot
  parts.push(paint(box(0.04, H - 0.6, 0.04).translate(0, (H - 0.6) / 2 + 0.6, 0), GALV_DARK, 0.03, rng));
  const pump = new THREE.CylinderGeometry(0.14, 0.17, 0.85, 8, 1);
  parts.push(paint(pump.translate(0, 0.43, 0), IRON, 0.05, rng));
  parts.push(paint(box(0.9, 0.18, 0.9).translate(0, 0.09, 0), CONCRETE, 0.05, rng));
  return merge(parts, true, false);
}

// ---------------------------------------------------------------------------------------------- the deltas

const paint_ = paint;
const STUCCO_PALE: Palette = [0.12, 0.2, 0.7];
const STUCCO_BLUE: Palette = [0.55, 0.14, 0.6];
const TOMB_TILE: Palette = [0.04, 0.42, 0.36];
const WEATHER_GREY: Palette = [0.1, 0.06, 0.42];

/**
 * A Mekong-delta family tomb in the rice fields: a rendered plinth, the low barrel of the grave, a headstone wall with
 * a little hipped roof of tiles, and two stub pillars at the foot — painted stucco gone grey with the monsoons.
 */
function bTomb(rng: Rng): THREE.BufferGeometry {
  const paint = rng() < 0.55 ? STUCCO_PALE : STUCCO_BLUE;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint_(box(2.6, 0.32, 3.4), WEATHER_GREY, 0.06, rng).translate(0, 0.16, 0));
  parts.push(paint_(box(1.7, 0.5, 2.4), paint, 0.06, rng).translate(0, 0.57, 0.15));
  const barrel = new THREE.CylinderGeometry(0.62, 0.62, 2.2, 10, 1, false, 0, Math.PI);
  barrel.rotateZ(Math.PI / 2); barrel.rotateY(Math.PI / 2);
  parts.push(paint_(barrel, paint, 0.05, rng).translate(0, 0.82, 0.15));
  // the headstone wall and its roof at the head (+Z), the stub pillars at the foot
  parts.push(paint_(box(2.2, 1.55, 0.3), paint, 0.05, rng).translate(0, 1.05, -1.3));
  parts.push(paint_(box(0.9, 0.7, 0.04), WEATHER_GREY, 0.05, rng).translate(0, 1.05, -1.13));
  for (const side of [-1, 1]) {
    const slope = box(1.35, 0.06, 0.62);
    slope.rotateZ(side * -0.42);
    parts.push(paint_(slope, TOMB_TILE, 0.06, rng).translate(side * 0.58, 2.02, -1.3));
    parts.push(paint_(box(0.32, 0.8, 0.32), paint, 0.05, rng).translate(side * 1.05, 0.72, 1.45));
  }
  return merge(parts, true, false);
}

function bTombBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint_(box(2.6, 0.32, 3.4), WEATHER_GREY, 0.06, rng).translate(0, 0.16, 0));
  for (let i = 0; i < 5; i++) {
    const chunk = box(0.4 + rng() * 0.6, 0.2 + rng() * 0.3, 0.4 + rng() * 0.6);
    chunk.rotateY(rng() * 3); chunk.rotateZ((rng() - 0.5) * 0.7);
    parts.push(paint_(chunk, rng() < 0.5 ? STUCCO_PALE : WEATHER_GREY, 0.08, rng).translate((rng() - 0.5) * 2.4, 0.42, (rng() - 0.5) * 3));
  }
  return merge(parts, true, false);
}

/** A Bengal straw stack: rice straw packed round a bamboo pole into a tall rounded cone, the pole's tip standing out. */
function bStrawStack(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = 3.4 + rng() * 0.6, r = 1.45 + rng() * 0.25;
  // a rounded cone: a lathe through the stack's profile (the belly above the ground, the shoulder, the tip)
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const radius = r * (t < 0.25 ? 0.82 + t * 0.72 : Math.pow(Math.max(0, 1 - (t - 0.25) / 0.75), 0.7));
    profile.push(new THREE.Vector2(Math.max(0.04, radius), t * h));
  }
  const stack = new THREE.LatheGeometry(profile, 11);
  const p = stack.attributes.position;
  // a lumpy bulge by angle and height (the seam's two columns share an angle, so the lathe stays closed)
  const phase = rng() * 6.28, lobes = 2 + ((rng() * 2) | 0);
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i);
    const f = 1 + 0.07 * Math.sin(a * lobes + phase + y * 0.9) + 0.03 * Math.sin(a * 5 - y * 1.7);
    p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f);
  }
  stack.computeVertexNormals();
  parts.push(mapToBand(scaleUV(stack, 3, 2), HAY_FACE_V));
  const pole = new THREE.CylinderGeometry(0.05, 0.06, 1.1, 5, 1);
  parts.push(mapToBand(scaleUV(pole, 0.3, 1), HAY_WOOD_V).translate((rng() - 0.5) * 0.06, h + 0.4, 0));
  return merge(parts, false, true);
}

function bStrawStackBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [ox, oz, rr] of [[-0.7, 0.2, 1.2], [0.8, -0.2, 1.0], [0.1, 0.8, 0.8]]) {
    const mound = new THREE.CylinderGeometry(rr * 0.5, rr, 0.55, 8, 1);
    const p = mound.attributes.position;
    for (let i = 0; i < p.count; i++) { const f = 1 + (rng() - 0.5) * 0.3; p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
    mound.computeVertexNormals();
    parts.push(mapToBand(scaleUV(mound, 2, 0.6), HAY_FACE_V).translate(ox, 0.27, oz));
  }
  return merge(parts, false, true);
}

// ---------------------------------------------------------------------------------------------- the mill yard

// (the map-revival lane, 2026-10-05, Longleaf round 2; gauntlet wave 124: "no log pond, lumber stacks or working mill
// yard in any frame")
const PINE_BOARD: Palette = [0.09, 0.42, 0.62];
const PINE_BOARD_OLD: Palette = [0.08, 0.22, 0.46];
const STICKER: Palette = [0.07, 0.25, 0.36];
const PINE_BARK: Palette = [0.06, 0.30, 0.22];
const PINE_END: Palette = [0.09, 0.40, 0.58];

/** A stickered stack of sawn pine drying in the yard: courses of boards laid edge to edge, a row of sticks between each
 * course so the air passes, the whole on three sleepers; a newer stack pale, an older one weathered grey. */
function bLumberStack(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const L = 4.6 + rng() * 0.6, W = 2.3, courses = 14 + ((rng() * 5) | 0), board = 0.06, stick = 0.04;
  const wood = rng() < 0.6 ? PINE_BOARD : PINE_BOARD_OLD;
  for (const z of [-L * 0.42, 0, L * 0.42]) parts.push(paint(box(W + 0.2, 0.16, 0.18), STICKER, 0.05, rng).translate(0, 0.08, z));
  let y = 0.16;
  for (let c = 0; c < courses; c++) {
    // a course in two runs of boards, one end ragged where a run was cut short
    for (const side of [-1, 1]) {
      const short = rng() < 0.3 ? 0.2 + rng() * 0.6 : 0;
      parts.push(paint(box(W / 2 - 0.01, board, L - short), wood, 0.07, rng).translate(side * W / 4, y + board / 2, short * (rng() < 0.5 ? 0.5 : -0.5)));
    }
    y += board;
    if (c < courses - 1) {
      for (const z of [-L * 0.42, 0, L * 0.42]) parts.push(paint(box(W, stick, 0.05), STICKER, 0.05, rng).translate(0, y + stick / 2, z));
      y += stick;
    }
  }
  return merge(parts, true, false);
}

function bLumberStackBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-1.9, 0, 1.9]) parts.push(paint(box(2.5, 0.16, 0.18), STICKER, 0.05, rng).translate(0, 0.08, z));
  for (let i = 0; i < 14; i++) {
    const b = box(0.44, 0.06, 2 + rng() * 2.6);
    b.rotateY((rng() - 0.5) * 1.6); b.rotateZ((rng() - 0.5) * 0.3);
    parts.push(paint(b, PINE_BOARD, 0.08, rng).translate((rng() - 0.5) * 3.2, 0.1 + rng() * 0.5, (rng() - 0.5) * 3.6));
  }
  return merge(parts, true, false);
}

/** The log deck at the mill's slip: long pine logs piled three high against two posts, their sawn ends to the yard. */
function bLogDeck(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const L = 7.2 + rng() * 0.8;
  const rows = [[5, 0.36], [4, 0.34], [3, 0.32]] as const;
  let y = 0;
  rows.forEach(([n, r], k) => {
    const spacing = 2 * r + 0.02, x0 = -((n - 1) * spacing) / 2;
    for (let i = 0; i < n; i++) {
      const rr = r * (0.88 + rng() * 0.24);
      const log = new THREE.CylinderGeometry(rr, rr, L - rng() * 0.6, 9, 1, false);
      log.rotateX(Math.PI / 2);
      parts.push(paint(log, PINE_BARK, 0.08, rng).translate(x0 + i * spacing + (rng() - 0.5) * 0.06, y + rr + k * 0.02, (rng() - 0.5) * 0.4));
      const end = new THREE.CircleGeometry(rr * 0.92, 9);
      parts.push(paint(end, PINE_END, 0.06, rng).translate(x0 + i * spacing, y + rr + k * 0.02, L / 2 - 0.2));
    }
    y += r * 1.7;
  });
  for (const side of [-1, 1]) parts.push(paint(box(0.22, 1.8, 0.22), STICKER, 0.05, rng).translate(side * 2.05, 0.9, 0));
  return merge(parts, true, false);
}

function bLogDeckBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const r = 0.3 + rng() * 0.08;
    const log = new THREE.CylinderGeometry(r, r, 6 + rng() * 1.5, 8, 1, false);
    log.rotateX(Math.PI / 2); log.rotateY((rng() - 0.5) * 0.9);
    parts.push(paint(log, PINE_BARK, 0.08, rng).translate((rng() - 0.5) * 4.4, r, (rng() - 0.5) * 2));
  }
  return merge(parts, true, false);
}

// ---------------------------------------------------------------------------------------------- the registry

/**
 * The scenery destructibles (merged into the props type registry after the inhabiting kit's, so no existing kind
 * moves). Footprints follow the visible geometry: the shrine's pillar plinth, the cross's footing, the pump's four
 * legs' square. Every one is shoot-through but the stone shrine, which a hull breaks only at a real overrun.
 */
export const SCENERY_DESTRUCTIBLE_TYPES = {
  bildstock: { cls: 'break', mat: 'baked', contact: 'ob', r: 0.5, h: 3.25, hw: 0.33, hl: 0.33, build: bBildstock, broken: bBildstockBroken, collider: true, keep: 0.9, crushMin: 2.6 },
  waysidecross: { cls: 'topple', mat: 'wood', contact: 'ob', r: 0.75, h: 3.65, shape: 'circle', collisionR: 0.2, groundR: 0.25, build: bWaysideCross, broken: null, keep: 0.97 },
  orthodoxcross: { cls: 'topple', mat: 'wood', contact: 'ob', r: 0.65, h: 3.6, shape: 'circle', collisionR: 0.18, groundR: 0.24, build: bOrthodoxCross, broken: null, keep: 0.97 },
  windpump: { cls: 'topple', mat: 'baked', contact: 'ob', r: 2.4, h: 13.9, hw: 1.4, hl: 1.4, groundR: 1.35, build: bWindPump, broken: null, keep: 0.86, crushMin: 2.0 },
  tomb: { cls: 'break', mat: 'baked', contact: 'ob', r: 1.9, h: 2.4, hw: 1.3, hl: 1.7, build: bTomb, broken: bTombBroken, collider: true, keep: 0.86, crushMin: 2.4 },
  strawstack: { cls: 'break', mat: 'straw', contact: 'ob', r: 1.6, h: 5.1, shape: 'circle', collisionR: 1.35, build: bStrawStack, broken: bStrawStackBroken },
  // the mill yard (the map-revival lane, 2026-10-05, Longleaf round 2): solid stacks a hull breaks only by ramming
  lumberstack: { cls: 'break', mat: 'baked', contact: 'ob', r: 2.7, h: 2.0, hw: 1.25, hl: 2.4, build: bLumberStack, broken: bLumberStackBroken, collider: true, keep: 0.86, crushMin: 2.4 },
  logdeck: { cls: 'break', mat: 'baked', contact: 'ob', r: 4.1, h: 1.95, hw: 2.1, hl: 3.5, build: bLogDeck, broken: bLogDeckBroken, collider: true, keep: 0.86, crushMin: 2.6 },
} satisfies Record<string, DestructiblePropType>;


// ---------------------------------------------------------------------------------------------- the pylon line

/** One lattice tower's geometry (baked, world-oriented later): a 400 kV double-circuit "Donau" tower, scaled. */
export function buildPylon(rng: Rng, height = 34, mobile = false, breadthOf = height): {
  geometry: THREE.BufferGeometry; legHalf: number; arms: Array<[number, number]>;
  /** The legs' half spread at a height over the footing and the tower's height (the hitbox lane, 2026-10-07: the legs'
   * colliders lean with them). */
  halfAt: (y: number) => number; height: number;
} {
  const parts: THREE.BufferGeometry[] = [];
  // (a tower stood taller over the woods keeps the breadth of the tower it was authored as: its footing, its waist and
  // its arms, so its legs and its conductors' spread stay where they were; only its body rises)
  const H = height, wide = breadthOf / 34, base = 4.2 * wide, waist = 1.1 * wide, waistY = H * 0.62;
  const strut = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number, pal: Palette) => {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    const g = new THREE.BoxGeometry(t, len, t);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parts.push(paint(g, pal, 0.05, rng));
  };
  const halfAt = (y: number) => (y <= waistY ? base + (waist - base) * Math.pow(y / waistY, 0.85) : waist * (1 - 0.25 * (y - waistY) / (H - waistY)));
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const sections = mobile ? 6 : 9;
  const levels: number[] = [];
  for (let i = 0; i <= sections; i++) levels.push((i / sections) * H * 0.97);
  for (let i = 0; i < sections; i++) {
    const y0 = levels[i], y1 = levels[i + 1], h0 = halfAt(y0), h1 = halfAt(y1), ym = (y0 + y1) / 2, hm = halfAt(ym);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      strut(ax * h0, y0, az * h0, ax * h1, y1, az * h1, 0.16, GALV);
      strut(ax * h1, y1, az * h1, bx * h1, y1, bz * h1, 0.08, GALV);
      if (!mobile || i % 2 === 0) {
        strut(ax * h0, y0, az * h0, bx * h1, y1, bz * h1, 0.06, GALV_DARK);
        strut(bx * h0, y0, bz * h0, ax * h1, y1, az * h1, 0.06, GALV_DARK);
      }
      if (!mobile) {
        // the secondary members: a redundant strut across each panel's middle and the short ties from it to the legs
        // (the lattice's fine print, which reads from the field as a tower and not as a sketch of one)
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        strut(ax * hm, ym, az * hm, bx * hm, ym, bz * hm, 0.045, GALV_DARK);
        strut(mx * h0, y0, mz * h0, mx * hm, ym, mz * hm, 0.04, GALV_DARK);
      }
    }
    // a plan brace across the body every other section (the tower's diaphragms)
    if (!mobile && i % 2 === 1) {
      strut(-h1, y1, -h1, h1, y1, h1, 0.05, GALV_DARK);
      strut(h1, y1, -h1, -h1, y1, h1, 0.05, GALV_DARK);
    }
  }
  // the crossarms: a lower wide pair and an upper narrower pair, each a lattice triangle; insulator strings hang off
  const arms: Array<[number, number]> = [];
  for (const [y, span] of [[waistY + 0.4, 11.5 * wide], [waistY + (H - waistY) * 0.55, 8.2 * wide]] as Array<[number, number]>) {
    const h = halfAt(y);
    for (const side of [-1, 1]) {
      strut(side * h, y, -h, side * span, y, 0, 0.1, GALV);
      strut(side * h, y, h, side * span, y, 0, 0.1, GALV);
      strut(side * h, y + 1.6, 0, side * span, y, 0, 0.08, GALV_DARK);
      // the arm's own lattice: two ties from its top chord down to the bottom chords, the far end braced across
      for (const f of [0.38, 0.7]) {
        const ax = side * (h + (span - h) * f), topY = y + 1.6 * (1 - f);
        strut(ax, topY, 0, ax, y, -h * (1 - f), 0.045, GALV_DARK);
        strut(ax, topY, 0, ax, y, h * (1 - f), 0.045, GALV_DARK);
      }
      // the insulator string: a rod of glass discs under the arm's tip, a yoke at the bottom (a pylon reads by them)
      const ix = side * (span - 0.3);
      const rod = new THREE.CylinderGeometry(0.025, 0.025, 2.6, 4, 1);
      parts.push(paint(rod.translate(ix, y - 1.3, 0), INSULATOR, 0.04, rng));
      const discs = mobile ? 4 : 7;
      for (let d = 0; d < discs; d++) {
        const disc = new THREE.CylinderGeometry(0.15, 0.13, 0.07, 6, 1);
        parts.push(paint(disc.translate(ix, y - 0.35 - (d / Math.max(1, discs - 1)) * 2.0, 0), INSULATOR, 0.04, rng));
      }
      parts.push(paint(box(0.42, 0.06, 0.12).translate(ix, y - 2.55, 0), GALV, 0.04, rng));
      arms.push([ix, y - 2.6]);
    }
  }
  // the earth-wire peak
  strut(-waist * 0.75, H * 0.97, 0, 0, H, 0, 0.08, GALV);
  strut(waist * 0.75, H * 0.97, 0, 0, H, 0, 0.08, GALV);
  arms.push([0, H]);
  for (const [sx, sz] of corners) parts.push(paint(box(0.9, 0.5, 0.9).translate(sx * base, 0.1, sz * base), CONCRETE, 0.05, rng));
  return { geometry: merge(parts, true, false), legHalf: base, arms, halfAt, height: H };
}

/** A sagging conductor between two attachment points as one thin box per segment (baked, dark). */
export function buildConductor(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, segments: number, radius: number,
): THREE.BufferGeometry {
  // (wave 48, "the power cables break into dashes": a conductor is a ribbon along its catenary — its centre line twice
  // over, a side each — that the wire material (props.ts) turns to face the camera and widens to at least a pixel, its
  // alpha the share of that pixel the true wire covers, so a far wire fades instead of breaking up. Position is the
  // centre line; aWireTangent the catenary's direction there, aWireSide -1 or +1, aWireRadius the true radius.)
  const n = segments + 1, positions = new Float32Array(n * 2 * 3), tangents = new Float32Array(n * 2 * 3);
  const sides = new Float32Array(n * 2), radii = new Float32Array(n * 2).fill(radius), index: number[] = [];
  const pt = (t: number) => [ax + (bx - ax) * t, ay + (by - ay) * t - sag * 4 * t * (1 - t), az + (bz - az) * t];
  for (let i = 0; i < n; i++) {
    const t = i / segments, p = pt(t);
    const t0 = Math.max(0, t - 1 / segments), t1 = Math.min(1, t + 1 / segments), p0 = pt(t0), p1 = pt(t1);
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], l = Math.hypot(dx, dy, dz) || 1;
    for (let k = 0; k < 2; k++) {
      const v = i * 2 + k;
      positions.set(p, v * 3);
      tangents.set([dx / l, dy / l, dz / l], v * 3);
      sides[v] = k ? 1 : -1;
    }
    if (i + 1 < n) { const a = i * 2, b = a + 2; index.push(a, a + 1, b, b, a + 1, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('aWireTangent', new THREE.BufferAttribute(tangents, 3));
  g.setAttribute('aWireSide', new THREE.BufferAttribute(sides, 1));
  g.setAttribute('aWireRadius', new THREE.BufferAttribute(radii, 1));
  g.setIndex(index);
  return g;
}

// ---------------------------------------------------------------------------------------------- sandbag stacks

// The scenery lane (2026-10-03; the gauntlet's wave 0: "a pile of identical pale ellipsoids"): the field works' sandbag
// stacks are laid bag by bag. Each bag is a filled sack — thick in the middle, thin and narrow at its folded and tied
// ends, sagging where it settled — in its own tone (sun-bleached hessian, weathered hessian, olive and grey-green
// polypropylene, a few dirty ones), grimed toward its bed, its weave on the props canvas atlas. The courses are laid
// in stretcher bond, front and back rows, each course stepping in a little (a battered parapet), the top course
// uneven. A stack fills the envelope of the sourced model it replaces (the same footprint and height on the same
// placements), so its cover stays where it was; the builders draw only their own stream, never the props stream.

/** The stacks' envelopes (the sourced models they replace): half length along the wall, half depth, top, sink. */
const SANDBAG_STACKS = {
  sandbagbig: { along: 'x', half: 1.787, depth: 0.438, top: 1.23, sink: 0.12, seed: 0x5b16 },
  sandbagsmall: { along: 'x', half: 1.304, depth: 0.421, top: 0.95, sink: 0.1, seed: 0x5b5a },
  sandbagwall: { along: 'z', half: 1.477, depth: 0.497, top: 0.9, sink: 0.1, seed: 0x5ba1 },
} as const;
type SandbagStackKind = keyof typeof SANDBAG_STACKS;

/** The bags' tones (sRGB HSL) and their shares (wave 20: darker and dirtier; a bag in the field is never clean). */
const SANDBAG_TONES: ReadonlyArray<readonly [Palette, number]> = [
  [[0.092, 0.24, 0.36], 0.42], // sun-bleached hessian
  [[0.086, 0.2, 0.3], 0.33],   // weathered hessian
  [[0.15, 0.16, 0.26], 0.12],  // olive polypropylene, faded
  [[0.078, 0.22, 0.23], 0.13], // dirty
];

function sandbagRng(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** An integer hash to [0, 1) (the burlap's threads draw no stream). */
function burlapHash(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(salt | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A thread's slub: its thickness along its length, a smooth wander between hashed knots every eight crossings. */
function burlapSlub(thread: number, along: number, salt: number, cycle: number): number {
  const k = Math.floor(along / 8), t = along / 8 - k, w = t * t * (3 - 2 * t);
  const a = burlapHash(thread, ((k % cycle) + cycle) % cycle, salt), b = burlapHash(thread, (((k + 1) % cycle) + cycle) % cycle, salt);
  return 0.78 + 0.4 * (a + (b - a) * w);
}

/**
 * The sandbags' hessian (gauntlet wave 52: "burlap that reads as fabric at its real weave scale"; wave 48's coarse
 * weave read as wood grain and a checkerboard): a plain weave of jute, 32 threads across the tile, so at the bags'
 * SANDBAG_WEAVE_UV a thread every 2.5 mm, as sacking is woven. Each crossing takes the warp over the weft or under it
 * in turn; each thread its own shade and its own slubs (thick and thin along it); the gaps between threads dark, a
 * fibre's fuzz across them. Tileable (the hashes wrap with the tile). Linear luminance near white (the bags' vertex
 * tones stay the cloth's colour) and the relief the normal map is drawn from.
 */
export function paintBurlap(size = 128): { lum: Float32Array; height: Float32Array } {
  const threads = 32, cell = size / threads;
  const lum = new Float32Array(size * size), height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / cell, gy = y / cell, wi = Math.floor(gx), fi = Math.floor(gy);
      const lx = gx - wi, ly = gy - fi;
      // the warp runs along v (a thread to each column), the weft along u; each with its slubs and its own shade
      const warpThick = burlapSlub(wi, gy, 11, threads / 8), weftThick = burlapSlub(fi, gx, 23, threads / 8);
      const warpProfile = Math.pow(Math.max(0, Math.sin(Math.PI * (0.5 + (lx - 0.5) / Math.min(1, warpThick)))), 0.7);
      const weftProfile = Math.pow(Math.max(0, Math.sin(Math.PI * (0.5 + (ly - 0.5) / Math.min(1, weftThick)))), 0.7);
      const warpOver = (wi + fi) % 2 === 0;
      // over and under: the thread on top at its crossing rises to its middle, the one beneath shows only at the edges
      const rise = (t: number) => 0.62 + 0.38 * Math.sin(Math.PI * t);
      const hw = warpProfile * (warpOver ? rise(ly) : 0.5) * Math.min(1.15, warpThick);
      const hf = weftProfile * (warpOver ? 0.5 : rise(lx)) * Math.min(1.15, weftThick);
      const h = Math.max(hw, hf);
      const shade = hw >= hf ? burlapHash(wi, 0, 37) : burlapHash(fi, 1, 41);
      const fuzz = burlapHash(x, y, 53);
      lum[y * size + x] = Math.min(1, 0.75 + h * 0.25 + (shade - 0.5) * 0.12 + (fuzz - 0.5) * 0.06);
      height[y * size + x] = h;
    }
  }
  return { lum, height };
}

/**
 * A bag's shaping: its fill (1 full, 0.75 slack), its course's dirt (0 clean, 1 earth-smeared), the end its bottom seam
 * is sewn across (+1 or -1 along its length; the other end is its mouth, folded under the bag), and, for a bag laid in a
 * stack, the faces a stack leaves in view (`laid`; a loose bag is closed): the section's angles kept (degrees, 0 its +z
 * side, 90 its top), the ends capped and the end segments kept whole (each [-x, +x]).
 */
interface BagShape {
  fill?: number;
  dirt?: number;
  seam?: 1 | -1;
  laid?: { from: number; to: number; caps: readonly [boolean, boolean]; whole: readonly [boolean, boolean] };
}

/** The bags' rings along their length and round their section (gauntlet wave 52: "pillow bags"). */
const BAG_RINGS: readonly number[] = [-1, -0.7, 0, 0.7, 1];
const BAG_AROUND = 8;
/** The burlap's weave: uv a metre (the hessian tile is 8 cm of cloth: a jute thread every 2.5 mm). */
export const SANDBAG_WEAVE_UV = 12.5;

/**
 * One filled bag along +X (length), Y (thickness), Z (width), centred (wave 20: "inflated toy capsules"; wave 52: "round
 * log ends", "daylight between courses"). A pillow pressed flat by the courses on it: its top and bed flat, its sides
 * bulging, both ends drawn in — the sewn bottom straight across the bag's full width with its two ears standing out at
 * the corners, the mouth folded under and gathered — so a bag seen end on is a squashed lens, never a log end. Its
 * normals the pillow's own (central differences of its smooth shape; the caps lean out along it), its weave wrapped
 * round it without stretch (u along, v round the section, at the cloth's real weave scale), its tone and the earth
 * toward its bed. Closed, 80 triangles; laid in a stack, only the faces the stack shows (a stack's core closes the rest).
 */
export function sandbagBag(len: number, thick: number, wid: number, r: Rng, shape: BagShape = {}): THREE.BufferGeometry {
  const fill = shape.fill ?? 1, dirt = shape.dirt ?? 0, seam = shape.seam ?? (r() < 0.5 ? 1 : -1);
  const T = thick * fill, W = wid * (1 + (1 - fill) * 0.3);
  // (wave 34, "tidy tubes": the fill settles — the top sags where the course above bears on it, the bag droops)
  const sag = (0.06 + r() * 0.08) * (1 + (1 - fill) * 2.5), droop = 0.012 + r() * 0.016;
  const twist = (r() - 0.5) * 0.08, ear = 0.012 + r() * 0.016, body = BAG_RINGS[BAG_RINGS.length - 2];
  /** The pillow's thickness and width along it (s: -1 the mouth .. +1 the seam), smooth: elliptical toward each end. */
  const profile = (s: number): [number, number] => {
    const a = Math.abs(s);
    if (a <= body) return [1, 1 + 0.03 * (1 - (s / body) ** 2)];
    const u = Math.min(1, (a - body) / (1 - body)), round = Math.sqrt(Math.max(0, 1 - u * u));
    return s > 0 ? [0.42 + 0.58 * round, 1] : [0.6 + 0.4 * round, 1 - 0.12 * u * u];
  };
  const exponent = 3;
  const section = (phi: number): [number, number] => {
    const c = Math.cos(phi), sn = Math.sin(phi);
    return [Math.sign(c) * Math.pow(Math.abs(c), 2 / exponent), Math.sign(sn) * Math.pow(Math.abs(sn), 2 / exponent)];
  };
  /** A point of the bag (s along, phi round), in its own frame with the seam end at +x. */
  const at = (s: number, phi: number): [number, number, number] => {
    const [tf, wf] = profile(s), [cz, cy] = section(phi);
    // the ears: the seam's corners stand out along the bag and a little to the side
    const earT = s > body ? Math.pow((s - body) / (1 - body), 3) * Math.pow(Math.abs(cz), 6) : 0;
    const x = (s * len) / 2 + ear * len * earT;
    let y = cy * T * 0.5 * tf;
    const z = cz * W * 0.5 * wf * (1 + 0.04 * earT);
    if (cy > 0.3) y -= sag * T * Math.max(0, 1 - (s / body) ** 2) * cy;
    y -= droop * (1 - s * s * 0.9) + twist * s * cz * T * 0.5;
    return [x, y, z];
  };
  const rings = BAG_RINGS.length, ring = BAG_AROUND + 1; // (a ring's first vertex twice: the weave's seam, under the bag)
  const phiOf = (k: number) => -Math.PI / 2 + (k / BAG_AROUND) * Math.PI * 2;
  const count = rings * ring + 2;
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2), colors = new Float32Array(count * 3);
  // the weave round the section: its arc length on the body's section
  const arc: number[] = [0];
  for (let k = 1; k <= BAG_AROUND; k++) {
    const [z0, y0] = section(phiOf(k - 1)), [z1, y1] = section(phiOf(k));
    arc.push(arc[k - 1] + Math.hypot((z1 - z0) * W * 0.5, (y1 - y0) * T * 0.5));
  }
  // the tone, and the earth toward its bed (more on a bag low in the stack)
  const [tone] = (() => { let pick = r(), pickAt = SANDBAG_TONES[0]; for (const t of SANDBAG_TONES) { if ((pick -= t[1]) <= 0) { pickAt = t; break; } } return pickAt; })();
  const lift = (r() - 0.5) * 0.05, hue = (r() - 0.5) * 0.01, du = r() * 7, dv = r() * 7;
  const put = (o: number, p: readonly number[], nx: number, ny: number, nz: number, u: number, v: number, s: number) => {
    positions[o * 3] = p[0] * seam; positions[o * 3 + 1] = p[1]; positions[o * 3 + 2] = p[2] * seam;
    const nl = Math.hypot(nx, ny, nz) || 1;
    normals[o * 3] = (nx / nl) * seam; normals[o * 3 + 1] = ny / nl; normals[o * 3 + 2] = (nz / nl) * seam;
    uvs[o * 2] = u; uvs[o * 2 + 1] = v;
    const bed = Math.max(0, Math.min(1, (-p[1] / (T * 0.5) + 0.2) / 1.2));
    const earth = Math.min(1, bed * (0.32 + dirt * 0.3) + dirt * 0.18);
    // the cloth bunched into the seam and the fold reads darker; the seam's stitched hem darkest
    const end = Math.abs(s) > body ? 0.9 : 1, hem = Math.abs(s) >= 1 ? (s > 0 ? 0.8 : 0.86) : 1;
    _c.setHSL(tone[0] + hue - earth * 0.01, tone[1] * (1 - earth * 0.3), Math.max(0.05, (tone[2] + lift) * (1 - earth) * end * hem), THREE.SRGBColorSpace);
    colors[o * 3] = _c.r; colors[o * 3 + 1] = _c.g; colors[o * 3 + 2] = _c.b;
  };
  const ds = 0.01, dphi = 0.01;
  for (let i = 0; i < rings; i++) {
    const s = BAG_RINGS[i];
    for (let k = 0; k < ring; k++) {
      const phi = phiOf(k), p = at(s, phi);
      // the pillow's own normal; at an end, where the section has drawn in, the end's outward lean over the section's
      // own normal (the seam and the fold face out along the bag, their faces up, down and to the side)
      let nx: number, ny: number, nz: number;
      if (Math.abs(s) === 1) {
        const [cz, cy] = section(phi), sz = cz / (W * 0.5), sy = cy / (T * 0.5), sl = Math.hypot(sz, sy) || 1;
        nx = Math.sign(s) * 1.2; ny = sy / sl; nz = sz / sl;
      } else {
        const a0 = at(s - ds, phi), a1 = at(s + ds, phi), b0 = at(s, phi - dphi), b1 = at(s, phi + dphi);
        const ex = a1[0] - a0[0], ey = a1[1] - a0[1], ez = a1[2] - a0[2], fx = b1[0] - b0[0], fy = b1[1] - b0[1], fz = b1[2] - b0[2];
        nx = ey * fz - ez * fy; ny = ez * fx - ex * fz; nz = ex * fy - ey * fx;
        if (nx * p[0] + ny * p[1] + nz * p[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      }
      put(i * ring + k, p, nx, ny, nz, du + p[0] * seam * SANDBAG_WEAVE_UV, dv + arc[k] * SANDBAG_WEAVE_UV, s);
    }
  }
  // the caps' centres: each end's middle, a little proud of its ring (the cloth bellies out between the seam's corners)
  for (const [o, s] of [[rings * ring, -1], [rings * ring + 1, 1]] as const) {
    const c: [number, number, number] = [s * (len / 2 + len * 0.012), -droop * 0.1, 0];
    put(o, c, s, 0, 0, du + c[0] * seam * SANDBAG_WEAVE_UV, dv + arc[BAG_AROUND >> 1] * SANDBAG_WEAVE_UV, s);
  }
  // the faces: the bag's own frame is turned end for end when its seam is at -x (x and z negate: a half turn), so the
  // laid mask, given in the final frame, maps back through it
  const laid = shape.laid;
  const ownEnd = (finalEnd: 0 | 1): 0 | 1 => (seam > 0 ? finalEnd : ((1 - finalEnd) as 0 | 1));
  const keepAngle = (phiMid: number): boolean => {
    if (!laid) return true;
    let deg = ((seam > 0 ? phiMid : Math.PI - phiMid) * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    const from = ((laid.from % 360) + 360) % 360, span = laid.to - laid.from;
    return ((deg - from + 360) % 360) <= span;
  };
  const wholeSeg = (i: number): boolean => !!laid && ((i === 0 && laid.whole[seam > 0 ? 0 : 1]) || (i === rings - 2 && laid.whole[seam > 0 ? 1 : 0]));
  const index: number[] = [];
  for (let i = 0; i + 1 < rings; i++) {
    for (let k = 0; k < BAG_AROUND; k++) {
      if (!wholeSeg(i) && !keepAngle(phiOf(k + 0.5))) continue;
      const a = i * ring + k, b = a + 1, c = a + ring + 1, d = a + ring;
      // counter-clockwise seen from outside (a bag turned end for end is the same bag turned half round: one winding)
      index.push(a, d, c, a, c, b);
    }
  }
  const capsOwn: [boolean, boolean] = laid ? [laid.caps[ownEnd(0)], laid.caps[ownEnd(1)]] : [true, true];
  if (capsOwn[0]) for (let k = 0; k < BAG_AROUND; k++) index.push(rings * ring, k, k + 1);
  if (capsOwn[1]) for (let k = 0; k < BAG_AROUND; k++) index.push(rings * ring + 1, (rings - 1) * ring + k + 1, (rings - 1) * ring + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/**
 * A stack's core: a battered box of dark spoil inside the bags, a few centimetres in from their faces and stepping in as
 * the courses do, so a joint between bags shows the earth behind it and never the sky (wave 52: "daylight between
 * courses"). 12 triangles.
 */
function sandbagCore(half: number, depth: number, height: number, batter: number): THREE.BufferGeometry {
  const H = height - 0.1, g = new THREE.BoxGeometry((half - 0.07) * 2, H, (depth - 0.09) * 2);
  const p = g.attributes.position, bottom = depth - 0.09, topHalf = Math.max(0.05, bottom - batter);
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, Math.sign(p.getZ(i)) * topHalf);
  g.computeVertexNormals();
  g.translate(0, H / 2 - 0.02, 0);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), uv = new Float32Array(n * 2).fill(0.5);
  _c.setHSL(0.075, 0.2, 0.15, THREE.SRGBColorSpace);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * The stack along local +X (base on y = 0 before the sink), front and back rows, a battered parapet. Wave 20: courses of
 * 15 cm squashed bags (each a third thicker than its course, pressed into the one under it), one bag in five slack, the
 * lowest courses smeared with earth. Wave 48/52: every third course below the top is laid in headers — two bags across
 * the stack end to end, their seamed ends on its faces — between courses of stretchers in a wandering half bond; each
 * bag draws only the faces the stack leaves in view, and the stack's core fills the joints.
 */
function sandbagCourses(half: number, depth: number, height: number, r: Rng): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const courses = Math.max(2, Math.round(height / 0.15));
  const thick = height / courses;
  const settleMid = 0.025 + r() * 0.02;
  for (let c = 0; c < courses; c++) {
    const inset = c * 0.02 + (c === courses - 1 ? 0.02 : 0);
    const rowHalf = depth - inset;
    const dirt = Math.max(0, 1 - c / 2.5);
    const top = c === courses - 1;
    const settleC = settleMid * (c / Math.max(1, courses - 1));
    if (c % 3 === 1 && !top) {
      // headers: two rows across, each bag from a face to just past the middle, its seam out on the face: its top, its
      // outer end and that end's cap in view (its long sides press on its neighbours, its inner end on the other row's)
      for (const side of [-1, 1]) {
        let x = -half + (r() - 0.5) * 0.06;
        while (x < half - 0.1) {
          const w = 0.28 + r() * 0.06, x0 = Math.max(-half, x), x1 = Math.min(half, x + w);
          x += w * (0.96 + r() * 0.03);
          if (x1 - x0 < 0.14) continue;
          const atEnd = x0 <= -half + 0.01 || x1 >= half - 0.01;
          const fill = r() < 0.2 ? 0.8 + r() * 0.1 : 0.95 + r() * 0.07;
          const bag = sandbagBag(rowHalf * (1.04 + r() * 0.04), thick * (1.3 + r() * 0.08), (x1 - x0) * 1.04, r, {
            fill, dirt, seam: 1, laid: { from: atEnd ? -90 : 30, to: atEnd ? 270 : 150, caps: [false, true], whole: [false, true] },
          });
          bag.rotateY((side > 0 ? -Math.PI / 2 : Math.PI / 2) + (r() - 0.5) * 0.08);
          bag.rotateX((r() - 0.5) * 0.04);
          const mid = (x0 + x1) / (2 * half);
          bag.translate((x0 + x1) / 2, c * thick + thick * 0.5 * fill + (r() - 0.5) * 0.015 - settleC * (1 - mid * mid), side * rowHalf * 0.5);
          parts.push(bag);
        }
      }
      continue;
    }
    // stretchers: two rows across (each along the wall) meeting in the middle, as long as the wall's length allows; a
    // staggered bond, as hands lay it — each course shifted its own way, each bag a little longer or shorter than the last
    for (const side of [-1, 1]) {
      const wid = Math.max(0.2, rowHalf);
      const n = Math.max(2, Math.round((half * 2) / 0.58));
      const len = (half * 2) / n;
      const shift = (c % 2 ? len * 0.5 : 0) + (r() - 0.5) * len * 0.3;
      let x = -half + shift - len;
      while (x < half) {
        const bagLenNominal = len * (0.88 + r() * 0.24);
        let x0 = x, x1 = x + bagLenNominal;
        x = x1;
        x0 = Math.max(-half, x0); x1 = Math.min(half, x1);
        if (x1 - x0 < len * 0.3) continue;
        // the top course: the odd bag missing, the rest at their own heights (an uneven line)
        if (top && r() < 0.18) continue;
        // (the drawn-in ends meet: each bag runs a little past its share, so neighbours press end to end; a row's end
        // bags keep their outer seams inside the stack's envelope)
        const bagLen = (x1 - x0) * (1.08 + r() * 0.05);
        const centre = Math.min(half - bagLen * 0.53, Math.max(-half + bagLen * 0.53, (x0 + x1) / 2));
        const fill = r() < 0.2 ? 0.78 + r() * 0.12 : 0.94 + r() * 0.1;
        // in view: its outer side and its top (the top course its inner shoulder too); a row's end bag its end, capped
        const startEnd = x0 <= -half + 0.01, finishEnd = x1 >= half - 0.01;
        const minusX = side > 0 ? startEnd : finishEnd, plusX = side > 0 ? finishEnd : startEnd;
        // (the top course is seen from under its overhangs too: closed)
        const bag = sandbagBag(bagLen, thick * (1.3 + r() * 0.1), wid * (1.02 + r() * 0.06), r, top
          ? { fill, dirt } : { fill, dirt, laid: { from: -45, to: 135, caps: [minusX, plusX], whole: [minusX, plusX] } });
        bag.rotateY((r() - 0.5) * 0.07 + (side < 0 ? Math.PI : 0));
        bag.rotateZ((r() - 0.5) * 0.05);
        bag.rotateX((r() - 0.5) * 0.04 - side * 0.03);
        // (wave 34, "no sag": a stack settles in its middle, the more the higher the course, up to 4 cm)
        const mid = (x0 + x1) / (2 * half), settle = settleC * (1 - mid * mid);
        const rise = (top ? (r() - 0.5) * thick * 0.4 : (r() - 0.5) * 0.015) - settle;
        bag.translate(centre + (r() - 0.5) * 0.02, c * thick + thick * 0.5 * fill + rise, side * (rowHalf - wid * 0.5) + (r() - 0.5) * 0.02);
        parts.push(bag);
      }
    }
  }
  parts.push(sandbagCore(half, depth, height - thick * 0.35, 0.02 * (courses - 1)));
  return parts;
}

/**
 * The earth banked against a stack's foot on all four sides (in the stack's final frame, the ground at y = 0): from
 * 3 cm under the ground 3-4 cm out of the bags up to 5-8 cm on their faces, lumpy; one flat earth tone (a fixed weave
 * texel), so the bottom course reads as sunk in the ground.
 */
function sandbagEarthFillet(half: number, depth: number, r: Rng): THREE.BufferGeometry {
  const positions: number[] = [], index: number[] = [];
  const ring = 28, pts: Array<[number, number, number, number]> = []; // x, z, outward x, outward z round the plan
  const per = (2 * half + 2 * depth) * 2;
  for (let k = 0; k < ring; k++) {
    const t = (k / ring) * per;
    let x: number, z: number, ox: number, oz: number;
    if (t < 2 * half) { x = -half + t; z = depth; ox = 0; oz = 1; }
    else if (t < 2 * half + 2 * depth) { x = half; z = depth - (t - 2 * half); ox = 1; oz = 0; }
    else if (t < 4 * half + 2 * depth) { x = half - (t - 2 * half - 2 * depth); z = -depth; ox = 0; oz = -1; }
    else { x = -half; z = -depth + (t - 4 * half - 2 * depth); ox = -1; oz = 0; }
    pts.push([x, z, ox, oz]);
  }
  for (const [x, z, ox, oz] of pts) {
    const h = 0.045 + r() * 0.035, out = 0.025 + r() * 0.02;
    positions.push(x - ox * 0.02, h, z - oz * 0.02, x + ox * out, -0.03, z + oz * out);
  }
  for (let k = 0; k < ring; k++) {
    const a = k * 2, b = ((k + 1) % ring) * 2;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const n = positions.length / 3, col = new Float32Array(n * 3), uv = new Float32Array(n * 2).fill(0.5);
  _c.setHSL(0.075, 0.24, 0.21, THREE.SRGBColorSpace);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function sandbagMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((part) => part.toNonIndexed()), false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('sceneryKit: sandbag merge produced no geometry');
  return merged;
}

/** A sandbag stack (props local types: sandbagbig, sandbagsmall, sandbagwall), its sink below y = 0. */
export function buildSandbagStack(kind: SandbagStackKind): THREE.BufferGeometry {
  const s = SANDBAG_STACKS[kind];
  const r = sandbagRng(s.seed);
  const parts = sandbagCourses(s.half, s.depth, s.top + s.sink, r).map((bag) => bag.translate(0, -s.sink, 0));
  parts.push(sandbagEarthFillet(s.half, s.depth, r));
  const g = sandbagMerge(parts);
  if (s.along === 'z') g.rotateY(Math.PI / 2);
  return g;
}

/**
 * A breached stack: a low surviving course at one end and the burst and spilled bags fanned round it. `spend` runs the
 * remnant builder it replaces first, so the props stream keeps every draw it always made.
 */
export function buildSandbagHeap(kind: SandbagStackKind, spend: () => void): THREE.BufferGeometry {
  spend();
  const s = SANDBAG_STACKS[kind];
  const r = sandbagRng(s.seed ^ 0x2f);
  const parts = sandbagCourses(s.half * 0.45, s.depth, 0.36, r).map((bag) => bag.translate(-s.half * 0.5, 0, 0));
  for (let k = 0; k < 12; k++) {
    const a = r() * Math.PI * 2, rr = 0.4 + Math.sqrt(r()) * s.half * 0.9;
    const burst = r() < 0.4;
    const bag = sandbagBag(0.5 + r() * 0.14, burst ? 0.07 + r() * 0.04 : 0.15 + r() * 0.04, burst ? 0.42 : 0.33, r);
    bag.rotateY(r() * Math.PI); bag.rotateX((r() - 0.5) * 0.3); bag.rotateZ((r() - 0.5) * 0.3);
    bag.translate(Math.cos(a) * rr * 0.9, burst ? 0.02 : 0.06, Math.sin(a) * rr * 0.55);
    parts.push(bag);
  }
  const g = sandbagMerge(parts);
  g.translate(0, -s.sink * 0.5, 0);
  if (s.along === 'z') g.rotateY(Math.PI / 2);
  return g;
}

/**
 * The ground a sandbag nest was dug into (wave 34: "a stacked prop on a bare mound — no berm, trench or spilled sand"):
 * the spoil banked against its outer long face, two fifths of its height up and 0.7-1 m out, lower along its inner
 * face and its ends; lumpy, its toe wandering and sunk a centimetre; a spill of the fill heaped from a burst bag at one
 * end, the emptied bag lying flat by it. World space on the height field (x, z the nest's foot, yaw and sc its turn and
 * scale), vertex coloured in the map's soil (`soil`, linear RGB) for the props' rock material; its own stream (the seed
 * names the place). Position, normal, colour, uv and aRockGround; it collides with nothing (a hull drives over a nest
 * as before).
 */
export function buildSandbagBedding(
  kind: SandbagStackKind, ground: { getHeightAt(x: number, z: number): number },
  x: number, z: number, yaw: number, sc: number, seed: number, soil: readonly [number, number, number], mobile = false,
  toward: readonly [number, number] | null = null,
): THREE.BufferGeometry {
  const s = SANDBAG_STACKS[kind], r = sandbagRng(seed);
  const hx = (s.along === 'x' ? s.half : s.depth) * sc, hz = (s.along === 'x' ? s.depth : s.half) * sc, H = s.top * sc;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const world = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  const longZ = s.along === 'x'; // the long faces look along local z
  // the face the spoil was thrown to: the enemy's (`toward`, a world direction) where the position has one
  const pick = r() < 0.5 ? -1 : 1;
  const facingDot = toward ? (longZ ? sin * toward[0] + cos * toward[1] : cos * toward[0] - sin * toward[1]) : 0;
  const outer = toward && Math.abs(facingDot) > 1e-6 ? Math.sign(facingDot) : pick;
  const positions: number[] = [], colors: number[] = [], index: number[] = [];
  const shade = (o: number) => {
    const n = 0.86 + r() * 0.24, toe = 1 - o * 0.12;
    colors.push(soil[0] * n * toe, soil[1] * n * toe, soil[2] * n * toe);
  };
  // the ring round the stack's plan, a point every 35 cm (60 on a phone), four rows out
  const per = 4 * (hx + hz), K = Math.max(12, Math.round(per / (mobile ? 0.6 : 0.35)));
  const OUT = [0, 0.3, 0.65, 1];
  const lumpA = r() * 6.3, lumpB = r() * 6.3;
  const ring: Array<[number, number, number, number]> = [], hs: number[] = [], reaches: number[] = [];
  for (let k = 0; k < K; k++) {
    const t = (k / K) * per;
    let lx: number, lz: number, nx: number, nz: number;
    if (t < 2 * hx) { lx = -hx + t; lz = hz; nx = 0; nz = 1; }
    else if (t < 2 * hx + 2 * hz) { lx = hx; lz = hz - (t - 2 * hx); nx = 1; nz = 0; }
    else if (t < 4 * hx + 2 * hz) { lx = hx - (t - 2 * hx - 2 * hz); lz = -hz; nx = 0; nz = -1; }
    else { lx = -hx; lz = -hz + (t - 4 * hx - 2 * hz); nx = -1; nz = 0; }
    // which face: the outer long face carries the spoil, the inner one and the ends a lower bank
    const onLong = longZ ? nz !== 0 : nx !== 0, facing = longZ ? nz : nx;
    const big = onLong && facing === outer;
    const a = (k / K) * Math.PI * 2;
    const lump = 1 + 0.18 * Math.sin(a * 5 + lumpA) + 0.1 * Math.sin(a * 11 + lumpB);
    ring.push([lx, lz, nx, nz]);
    hs.push(H * (big ? 0.4 : 0.17) * lump);
    reaches.push((big ? 0.85 : 0.5) * (0.85 + 0.3 * (0.5 + 0.5 * Math.sin(a * 3 + lumpB))) * Math.max(1, sc * 0.8));
  }
  // (the bank's height and reach eased round the corners, so the outer face's spoil runs down into the ends' bank)
  const ease = (v: number[]) => v.map((_, k) => {
    let sum = 0, w = 0;
    for (let j = -3; j <= 3; j++) { const q = 4 - Math.abs(j); sum += v[(k + j + K) % K] * q; w += q; }
    return sum / w;
  });
  const hE = ease(hs), reachE = ease(reaches);
  for (let k = 0; k < K; k++) {
    const [lx, lz, nx, nz] = ring[k], h = hE[k], reach = reachE[k];
    for (const o of OUT) {
      const d = -0.03 + reach * o;
      const [wx, wz] = world(lx + nx * d, lz + nz * d);
      // (lumpy spoil, clods and all: each point its own rise; the toe sunk under the ground)
      const clod = o > 0 && o < 1 ? 1 + (r() - 0.5) * 0.35 : 1;
      positions.push(wx, ground.getHeightAt(wx, wz) + h * Math.pow(1 - o, 1.5) * clod - 0.03 * o * o, wz);
      shade(o);
    }
  }
  const rows = OUT.length;
  for (let k = 0; k < K; k++) {
    const a = k * rows, b = ((k + 1) % K) * rows;
    for (let j = 0; j + 1 < rows; j++) index.push(a + j, a + j + 1, b + j, b + j, a + j + 1, b + j + 1);
  }
  // the spill: a heap of the fill at one end, a dome of three rings, and the emptied bag by it
  const end = r() < 0.5 ? -1 : 1, along = longZ ? [1, 0] : [0, 1], across = longZ ? [0, 1] : [1, 0];
  const reachEnd = (longZ ? hx : hz) + 0.3 + r() * 0.25, off = (r() - 0.5) * (longZ ? hz : hx);
  const cx = along[0] * end * reachEnd + across[0] * off, cz = along[1] * end * reachEnd + across[1] * off;
  const [sx, sz] = world(cx, cz);
  const radius = (0.32 + r() * 0.15) * Math.min(1.3, sc), height = 0.1 + r() * 0.08, segs = mobile ? 6 : 9;
  const centre = positions.length / 3;
  positions.push(sx, ground.getHeightAt(sx, sz) + height, sz);
  colors.push(soil[0] * 1.1, soil[1] * 1.1, soil[2] * 1.1);
  for (const ring of [0.45, 0.8, 1.15]) {
    for (let q = 0; q < segs; q++) {
      const a = (q / segs) * Math.PI * 2, rr = radius * ring * (0.85 + r() * 0.3);
      const px = sx + Math.cos(a) * rr, pz = sz + Math.sin(a) * rr;
      const fall = ring < 1 ? Math.pow(1 - ring / 1.15, 0.8) : 0;
      positions.push(px, ground.getHeightAt(px, pz) + height * fall - (ring > 1 ? 0.01 : 0), pz);
      const n = 0.95 + r() * 0.15;
      colors.push(soil[0] * 1.08 * n, soil[1] * 1.08 * n, soil[2] * 1.08 * n);
    }
  }
  for (let q = 0; q < segs; q++) {
    const q1 = (q + 1) % segs;
    index.push(centre, centre + 1 + q1, centre + 1 + q);
    for (let ring = 0; ring < 2; ring++) {
      const a0 = centre + 1 + ring * segs, b0 = a0 + segs;
      index.push(a0 + q, a0 + q1, b0 + q, b0 + q, a0 + q1, b0 + q1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // the emptied bag, flat on the ground by the spill (hessian, a little earth on it)
  const bag = sandbagBag(0.55 + r() * 0.12, 0.05 + r() * 0.03, 0.4, r, { fill: 0.6, dirt: 0.7 });
  bag.rotateY(r() * Math.PI);
  const bx = cx + along[0] * end * (radius + 0.2) + across[0] * (r() - 0.5) * 0.4, bz = cz + along[1] * end * (radius + 0.2) + across[1] * (r() - 0.5) * 0.4;
  const [wbx, wbz] = world(bx, bz);
  bag.rotateY(yaw).translate(wbx, ground.getHeightAt(wbx, wbz) + 0.012, wbz);
  bag.deleteAttribute('uv');
  const out = mergeGeometries([g.toNonIndexed(), bag.index ? bag.toNonIndexed() : bag], false);
  g.dispose(); bag.dispose();
  if (!out) throw new Error('sceneryKit: the sandbag bedding merge produced no geometry');
  // (wave 34 re-shoot, "a smooth clay mound up close": the bedding draws on the props rock material, as the bocage's
  // earth banks do — its detail print and relief, the grime, the wet maps' moss greening the spoil like a bank. Its
  // ground is given half a metre under the true ground, so the rocks' soil skirt, which would paint the spoil's foot
  // a second, brighter soil, never applies: the spoil is the soil, at half its linear albedo. The b5 hold measured the
  // skirt beside three boulders each on Verdant and Frontier: on a rock's shaded foot it is no brighter than the dirt
  // beside it, so the rocks keep it. A world-planar uv as the banks have.)
  const op = out.attributes.position, gr = new Float32Array(op.count), uv = new Float32Array(op.count * 2);
  // (the time-to-battle lane, 2026-10-08) the non-indexed merge repeats a vertex in every triangle it closes: its ground
  // is asked once (the same exact coordinates, the same height; 27.5 k of the 34 k asks on Verdant were repeats)
  const groundOf = new Map<number, Map<number, number>>();
  for (let i = 0; i < op.count; i++) {
    const px = op.getX(i), py = op.getY(i), pz = op.getZ(i);
    let groundY: number | undefined;
    if (px === 0 || pz === 0) groundY = ground.getHeightAt(px, pz);
    else {
      let row = groundOf.get(px);
      if (!row) groundOf.set(px, row = new Map());
      groundY = row.get(pz);
      if (groundY === undefined) row.set(pz, groundY = ground.getHeightAt(px, pz));
    }
    gr[i] = groundY - 0.5;
    uv[i * 2] = px * 0.37 + py * 0.21; uv[i * 2 + 1] = pz * 0.37 - py * 0.17;
  }
  out.setAttribute('aRockGround', new THREE.BufferAttribute(gr, 1));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
