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
// (props census #11: the wayside shrine, the crosses and the Mekong tomb live in waysideKit.ts)
import { bBildstock, bBildstockBroken, bWaysideCross, bOrthodoxCross, bTomb, bTombBroken } from './waysideKit.ts';

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
const GALV: Palette = [0.56, 0.03, 0.50];
const GALV_DARK: Palette = [0.58, 0.04, 0.30];
const VANE_PAINT: Palette = [0.33, 0.30, 0.30];
const CONCRETE: Palette = [0.10, 0.05, 0.56];
const IRON: Palette = [0.6, 0.05, 0.13];
const INSULATOR: Palette = [0.55, 0.10, 0.22];

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


// ---------------------------------------------------------------------------------------------- the Dutch windmotor

// (the map-revival lane, 2026-10-06, Tidegate Polders step 4; the coordinator: "Dutch steel windmotors (the Bosman type)
// were common in Zeeland's polders by the 1930s ... The critic read an American farm wind-pump. Give them the Dutch form:
// a lattice tower, a rosette with a vane, and the pump house at the foot.")
const BRICK_RED: Palette = [0.03, 0.42, 0.34];
const TILE_RED: Palette = [0.02, 0.48, 0.30];
const VANE_WHITE: Palette = [0.1, 0.04, 0.82];
const ROSETTE_RED: Palette = [0.0, 0.62, 0.38];

/**
 * A Bosman windmotor: a slender four-legged steel lattice tower, braced bay by bay, a railed platform under the head,
 * the rosette — a wide wheel of curved sheet-steel sails between an inner and an outer ring, its tips banded red — the
 * long tail boom with its white vane and the small side vane that turns the wheel out of a gale, the pump rod down the
 * tower's middle, and at the foot the brick pump house over the ditch with its tiled roof and its outfall. The rosette
 * faces +Z, the pump house stands off the tower's -Z side.
 */
function bWindMotor(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const H = 13, base = 1.55, topHalf = 0.42;
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
    strut(sx * base, 0, sz * base, sx * topHalf, H, sz * topHalf, 0.1, GALV);
    parts.push(paint(box(0.55, 0.35, 0.55).translate(sx * base, 0.1, sz * base), CONCRETE, 0.05, rng));
  }
  const bays = 6;
  for (let b = 0; b <= bays; b++) {
    const y = 0.5 + (H - 1.0) * (b / bays), h = halfAt(y);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      strut(ax * h, y, az * h, bx * h, y, bz * h, 0.05, GALV);
      if (b < bays) {
        const y2 = 0.5 + (H - 1.0) * ((b + 1) / bays), h2 = halfAt(y2);
        strut(ax * h, y, az * h, bx * h2, y2, bz * h2, 0.04, GALV_DARK);
        strut(bx * h, y, bz * h, ax * h2, y2, az * h2, 0.04, GALV_DARK);
      }
    }
  }
  // the platform and its rail, the head on its turntable
  parts.push(paint(box(1.5, 0.06, 1.5).translate(0, H - 0.05, 0), GALV_DARK, 0.04, rng));
  for (const [sx, sz] of corners) strut(sx * 0.72, H, sz * 0.72, sx * 0.72, H + 0.9, sz * 0.72, 0.035, GALV_DARK);
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
    strut(ax * 0.72, H + 0.9, az * 0.72, bx * 0.72, H + 0.9, bz * 0.72, 0.035, GALV_DARK);
  }
  parts.push(paint(box(0.55, 0.5, 1.2).translate(0, H + 0.45, 0.1), GALV_DARK, 0.04, rng));
  // the rosette: twenty-four sails between the inner and outer rings, pitched into the wind, their tips banded red
  const R = 3.0, r0 = 1.0, hubY = H + 0.55, hubZ = 0.95;
  const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.35, 10, 1);
  hub.rotateX(Math.PI / 2);
  parts.push(paint(hub.translate(0, hubY, hubZ), GALV_DARK, 0.03, rng));
  for (let i = 0; i < 6; i++) {
    // the spokes from the hub to the outer ring
    const a = (i / 6) * Math.PI * 2;
    strut(Math.cos(a) * 0.2, hubY + Math.sin(a) * 0.2, hubZ, Math.cos(a) * R, hubY + Math.sin(a) * R, hubZ, 0.06, GALV_DARK);
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, len = R - r0;
    const sail = new THREE.BoxGeometry(0.42, len * 0.82, 0.025);
    sail.translate(0, r0 + len * 0.41, 0);
    sail.rotateY(0.45);
    sail.rotateZ(a);
    parts.push(paint(sail.translate(0, hubY, hubZ), GALV, 0.06, rng));
    const tip = new THREE.BoxGeometry(0.44, len * 0.18, 0.027);
    tip.translate(0, r0 + len * 0.91, 0);
    tip.rotateY(0.45);
    tip.rotateZ(a);
    parts.push(paint(tip.translate(0, hubY, hubZ), ROSETTE_RED, 0.05, rng));
  }
  for (const ring of [r0, R]) {
    const seg = ring === R ? 32 : 16;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      strut(Math.cos(a0) * ring, hubY + Math.sin(a0) * ring, hubZ, Math.cos(a1) * ring, hubY + Math.sin(a1) * ring, hubZ, 0.05, GALV_DARK);
    }
  }
  // the tail: a long boom to the white vane, and the side vane that turns the wheel out of a gale
  strut(0, H + 0.5, -0.4, 0, H + 0.75, -3.9, 0.07, GALV_DARK);
  strut(0, H + 0.95, -0.4, 0, H + 0.8, -3.6, 0.04, GALV_DARK);
  parts.push(paint(box(0.04, 1.5, 2.2).translate(0, H + 0.9, -4.6), VANE_WHITE, 0.04, rng));
  parts.push(paint(box(0.9, 0.7, 0.03).translate(0.75, H + 0.7, 0.25), VANE_WHITE, 0.04, rng));
  // the pump rod down the tower
  parts.push(paint(box(0.05, H - 0.4, 0.05).translate(0, (H - 0.4) / 2 + 0.3, 0), GALV_DARK, 0.03, rng));
  // the pump house at the foot over the ditch: brick walls, a door, a tiled saddle roof, the outfall trough
  const hx = 0, hz = -2.9, hw = 1.15, hd = 0.95, hh = 2.0;
  parts.push(paint(box(hw * 2, hh, hd * 2).translate(hx, hh / 2, hz), BRICK_RED, 0.06, rng));
  parts.push(paint(box(0.8, 1.6, 0.05).translate(hx + 0.4, 0.8, hz + hd + 0.01), GALV_DARK, 0.05, rng));
  for (const side of [-1, 1]) {
    const slope = box(hw * 2 + 0.3, 0.08, hd + 0.35);
    slope.rotateX(side * 0.55);
    parts.push(paint(slope.translate(hx, hh + 0.42, hz + side * (hd + 0.35) / 2 * 0.85), TILE_RED, 0.05, rng));
  }
  parts.push(paint(box(hw * 2 + 0.1, 0.62, 0.1).translate(hx, hh + 0.28, hz), BRICK_RED, 0.05, rng));
  parts.push(paint(box(0.6, 0.35, 1.4).translate(hx, 0.18, hz - hd - 0.7), CONCRETE, 0.05, rng));
  return merge(parts, true, false);
}

// ---------------------------------------------------------------------------------------------- the deltas

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

/**
 * A straw rick (skirda) of the Virgin Lands: the combine's straw stacked on the field's edge in one long loaf, its steep
 * sides bellying out under a full rounded crown, the ends hipped round, trodden and slumped in lumps along its length
 * (the map-revival lane, 2026-10-05: Tarkhan Steppe's straw, in place of the field cones the critics took for markers).
 */
function bStrawRick(rng: Rng): THREE.BufferGeometry {
  const L = 9 + rng() * 3, W = 3.4 + rng() * 0.6, H = 3.5 + rng() * 0.6;
  const nL = 12, nS = 12, phase = rng() * 6.28;
  // the section from the ground on its +x side over the crown to the ground on its -x side (a superellipse)
  const section = (t: number): [number, number] => {
    const a = Math.PI * t, c = Math.cos(a), sn = Math.sin(a);
    return [Math.sign(c) * Math.pow(Math.abs(c), 0.55) * (W / 2), Math.pow(sn, 0.75) * H];
  };
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const ring = (i: number): Array<[number, number, number]> => {
    const t = i / nL, z = (t - 0.5) * L;
    // the hipped ends: the section draws in over the last 1.8 m to a third of its size
    const k = 0.34 + 0.66 * Math.sqrt(Math.min(1, Math.min(t * L, (1 - t) * L) / 1.8));
    return Array.from({ length: nS + 1 }, (_, j) => {
      const [x, y] = section(j / nS);
      const lump = 1 + 0.05 * Math.sin(z * 0.9 + phase + y * 0.7) + 0.025 * Math.sin(z * 2.3 - y * 1.3 + phase * 2);
      return [x * k * lump, y * (0.5 + 0.5 * k) * (1 + 0.03 * Math.sin(z * 0.6 + phase)), z] as [number, number, number];
    });
  };
  const rings = Array.from({ length: nL + 1 }, (_, i) => ring(i));
  for (let i = 0; i <= nL; i++) for (let j = 0; j <= nS; j++) {
    pos.push(...rings[i][j]);
    uv.push(rings[i][j][2] / 3, j / nS * (W + 2 * H) / 2.5);
  }
  for (let i = 0; i < nL; i++) for (let j = 0; j < nS; j++) {
    const a = i * (nS + 1) + j, b = a + 1, c = a + nS + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  // the hipped ends closed by a fan from the section's middle (the -z end faces -z, the +z end +z)
  for (const [i, sign] of [[0, -1], [nL, 1]] as const) {
    const base = pos.length / 3, mid = rings[i].reduce((m, p) => m + p[1], 0) / rings[i].length;
    pos.push(0, mid * 0.6, rings[i][0][2] + sign * 0.15); uv.push(rings[i][0][2] / 3, 0.5);
    for (let j = 0; j < nS; j++) {
      const a = i * (nS + 1) + j, b = a + 1;
      if (sign < 0) idx.push(base, b, a); else idx.push(base, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.translate(0, -0.12, 0);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return merge([flat], false, true);
}

function bStrawRickBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [oz, rr] of [[-3.2, 1.5], [-0.6, 1.8], [2.2, 1.6], [4.4, 1.1]] as const) {
    const mound = new THREE.CylinderGeometry(rr * 0.55, rr, 0.7, 9, 1);
    const p = mound.attributes.position;
    for (let i = 0; i < p.count; i++) { const f = 1 + (rng() - 0.5) * 0.3; p.setX(i, p.getX(i) * f * 1.1); p.setZ(i, p.getZ(i) * f); }
    mound.computeVertexNormals();
    parts.push(scaleUV(mound, 2, 0.6).translate((rng() - 0.5) * 0.6, 0.33, oz));
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
  // the mill yard (the map-revival lane, 2026-10-05, Longleaf round 2): solid stacks a hull breaks only by ramming
  lumberstack: { cls: 'break', mat: 'baked', contact: 'ob', r: 2.7, h: 2.0, hw: 1.25, hl: 2.4, build: bLumberStack, broken: bLumberStackBroken, collider: true, keep: 0.86, crushMin: 2.4 },
  logdeck: { cls: 'break', mat: 'baked', contact: 'ob', r: 4.1, h: 1.95, hw: 2.1, hl: 3.5, build: bLogDeck, broken: bLogDeckBroken, collider: true, keep: 0.86, crushMin: 2.6 },
  // (the map-revival lane, 2026-10-07, Tidegate Polders step 4; last, so no kind before it moves) the Dutch Bosman
  // windmotor: its tower's legs' square and the brick pump house at its foot (2.9 m off the -Z side) in the footprint
  windmotor: { cls: 'topple', mat: 'baked', contact: 'ob', r: 3.2, h: 16.6, hw: 1.6, hl: 3.8, groundR: 1.6, build: bWindMotor, broken: null, keep: 0.86, crushMin: 2.0 },
  // (appended after main's windmotor: every kind before it keeps its place in the props registry)
  strawrick: { cls: 'break', mat: 'straw', contact: 'ob', r: 4.8, h: 4.6, hw: 1.6, hl: 4.4, build: bStrawRick, broken: bStrawRickBroken },
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
