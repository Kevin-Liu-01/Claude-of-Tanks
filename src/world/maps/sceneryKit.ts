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
  parts.push(scaleUV(stack, 3, 2));
  const pole = new THREE.CylinderGeometry(0.05, 0.06, 1.1, 5, 1);
  parts.push(scaleUV(pole, 0.3, 1).translate((rng() - 0.5) * 0.06, h + 0.4, 0));
  return merge(parts, false, true);
}

function bStrawStackBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [ox, oz, rr] of [[-0.7, 0.2, 1.2], [0.8, -0.2, 1.0], [0.1, 0.8, 0.8]]) {
    const mound = new THREE.CylinderGeometry(rr * 0.5, rr, 0.55, 8, 1);
    const p = mound.attributes.position;
    for (let i = 0; i < p.count; i++) { const f = 1 + (rng() - 0.5) * 0.3; p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
    mound.computeVertexNormals();
    parts.push(scaleUV(mound, 2, 0.6).translate(ox, 0.27, oz));
  }
  return merge(parts, false, true);
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
} satisfies Record<string, DestructiblePropType>;


// ---------------------------------------------------------------------------------------------- the pylon line

/** One lattice tower's geometry (baked, world-oriented later): a 400 kV double-circuit "Donau" tower, scaled. */
export function buildPylon(rng: Rng, height = 34, mobile = false): { geometry: THREE.BufferGeometry; legHalf: number; arms: Array<[number, number]> } {
  const parts: THREE.BufferGeometry[] = [];
  const H = height, base = 4.2 * (height / 34), waist = 1.1 * (height / 34), waistY = H * 0.62;
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
    const y0 = levels[i], y1 = levels[i + 1], h0 = halfAt(y0), h1 = halfAt(y1);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      strut(ax * h0, y0, az * h0, ax * h1, y1, az * h1, 0.16, GALV);
      strut(ax * h1, y1, az * h1, bx * h1, y1, bz * h1, 0.08, GALV);
      if (!mobile || i % 2 === 0) {
        strut(ax * h0, y0, az * h0, bx * h1, y1, bz * h1, 0.06, GALV_DARK);
        strut(bx * h0, y0, bz * h0, ax * h1, y1, az * h1, 0.06, GALV_DARK);
      }
    }
  }
  // the crossarms: a lower wide pair and an upper narrower pair, each a lattice triangle; insulator strings hang off
  const arms: Array<[number, number]> = [];
  for (const [y, span] of [[waistY + 0.4, 11.5 * (height / 34)], [waistY + (H - waistY) * 0.55, 8.2 * (height / 34)]] as Array<[number, number]>) {
    const h = halfAt(y);
    for (const side of [-1, 1]) {
      strut(side * h, y, -h, side * span, y, 0, 0.1, GALV);
      strut(side * h, y, h, side * span, y, 0, 0.1, GALV);
      strut(side * h, y + 1.6, 0, side * span, y, 0, 0.08, GALV_DARK);
      const ins = new THREE.CylinderGeometry(0.11, 0.11, 2.6, 6, 1);
      parts.push(paint(ins.translate(side * (span - 0.3), y - 1.3, 0), INSULATOR, 0.04, rng));
      arms.push([side * (span - 0.3), y - 2.6]);
    }
  }
  // the earth-wire peak
  strut(-waist * 0.75, H * 0.97, 0, 0, H, 0, 0.08, GALV);
  strut(waist * 0.75, H * 0.97, 0, 0, H, 0, 0.08, GALV);
  arms.push([0, H]);
  for (const [sx, sz] of corners) parts.push(paint(box(0.9, 0.5, 0.9).translate(sx * base, 0.1, sz * base), CONCRETE, 0.05, rng));
  return { geometry: merge(parts, true, false), legHalf: base, arms };
}

/** A sagging conductor between two attachment points as one thin box per segment (baked, dark). */
export function buildConductor(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, segments: number, radius: number,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = ay + (by - ay) * t - sag * 4 * t * (1 - t);
    pts.push(new THREE.Vector3(ax + (bx - ax) * t, y, az + (bz - az) * t));
  }
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  for (let i = 0; i < segments; i++) {
    dir.subVectors(pts[i + 1], pts[i]);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(radius, radius, len, 4, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
    g.translate((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2, (pts[i].z + pts[i + 1].z) / 2);
    parts.push(paint(g, [0.6, 0.05, 0.16], 0, () => 0.5));
  }
  return merge(parts, true, false);
}
