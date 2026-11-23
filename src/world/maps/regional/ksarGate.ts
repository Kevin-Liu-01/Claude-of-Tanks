// src/world/maps/regional/ksarGate.ts — the ksar gate post (the scenery lane, b16).
//
// Gauntlet wave 121 on Sirocco Wadi: "a modern prefab with blue glass windows" ("a jarring modern blue shed"). That was
// structureKit's steel checkpoint hut, standing at the two gates where the caravan road enters the ksar and among the
// map's scattered huts; Redrock's outposts had the same hut. A gate on these roads is a ksar's or a desert post's own
// building: a block of mud brick under a thick plaster render, its walls battered, a parapet round its flat roof with a
// merlon at each corner, rain spouts of timber through the parapet, a door and two small windows each under a timber
// lintel, the openings dark and unglazed, the render darker where the rain splashes at the foot.
//
// A map adopts it in place of the checkpoint hut by name (props structureVariants: { checkpointhut: 'ksargate' }): the
// gate beats keep their key, footprint and ground fit, and only the build changes. It draws on the map's regional
// plaster (vertex-coloured: the render, the timber, the dark openings) and falls back to the vertex-coloured baked
// material on a map without an architecture kit. Pure geometry: no DOM, no materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESTRUCTIBLE_BUILDING_TYPES } from '../structureKit.ts';
import { DESERT_SANGAR } from './desertSangar.ts';
import { BEDOUIN_CAMP_TENT, BEDOUIN_TENT, RUM_BARRACK, RUM_POST, RUM_SHED } from './wadiRumPosts.ts';
import { POLAR_DRIFT_FENCE, POLAR_DRUM_ROW, POLAR_DRUM_WALL, POLAR_DRUM_WALL_BIG, POLAR_DRUM_WALL_SMALL } from './polarWorks.ts';
import { LUNAR_BAG_FENCE, LUNAR_BAG_WALL, LUNAR_BAG_WALL_BIG, LUNAR_BAG_WALL_SMALL, LUNAR_BEACON, LUNAR_BLOCK_ROW, LUNAR_CANISTER,
  LUNAR_TETHER } from './lunarWorks.ts';

type Rng = () => number;

/** The colours the render, its damp foot, the timber and the openings carry (multiplying the plaster print). */
const RENDER: readonly [number, number, number] = [1.0, 0.97, 0.93];
const DAMP: readonly [number, number, number] = [0.8, 0.74, 0.68];
const TIMBER: readonly [number, number, number] = [0.42, 0.31, 0.21];
const OPENING: readonly [number, number, number] = [0.06, 0.05, 0.045];
/** The plaster print's tiling: a tile every 1.8 m of wall. */
const UV_PER_M = 1 / 1.8;

/** A box of the given size (centred, its base at y0), its print laid at the world's scale, all one colour. */
function block(w: number, h: number, d: number, x: number, y0: number, z: number,
  colour: readonly [number, number, number], rng: Rng, shade = 0.04): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    // (each face's print by its own extent: a wall's along its run and up, the roof's across)
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const su = ax > 0.5 ? d : w, sv = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * su * UV_PER_M + x * 0.37, uv.getY(i) * sv * UV_PER_M + z * 0.29);
  }
  g.translate(x, y0 + h / 2, z);
  const jitter = 1 + (rng() - 0.5) * 2 * shade;
  const colours = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    colours[i * 3] = colour[0] * jitter; colours[i * 3 + 1] = colour[1] * jitter; colours[i * 3 + 2] = colour[2] * jitter;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/** The walls' batter: every vertex above `y0` drawn in toward the centre line by `inset` at `y1`, linearly. */
function batter(g: THREE.BufferGeometry, y0: number, y1: number, inset: number, hw: number, hd: number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, (p.getY(i) - y0) / (y1 - y0)));
    const x = p.getX(i), z = p.getZ(i);
    p.setXYZ(i, x * (1 - (inset * t) / hw), p.getY(i), z * (1 - (inset * t) / hd));
  }
  g.computeVertexNormals();
  return g;
}

/** The render darker at the foot, where the rain splashes and the ground's damp climbs (below `rise` metres). */
function dampFoot(g: THREE.BufferGeometry, rise: number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute, c = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, p.getY(i) / rise));
    c.setXYZ(i, c.getX(i) * (DAMP[0] + (1 - DAMP[0]) * t), c.getY(i) * (DAMP[1] + (1 - DAMP[1]) * t), c.getZ(i) * (DAMP[2] + (1 - DAMP[2]) * t));
  }
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('ksarGate: merge produced no geometry');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** The gate post's measures (m): its body, its parapet, its corner merlons. */
const W = 4.2, D = 5.4, WALL = 2.75, PARAPET = 0.4, MERLON = 0.15, THICK = 0.32;
/** (dome-detail-275) the rubble under a fallen render, a weathered plank leaf, a clay jar's terracotta, wind-blown sand. */
const STONE: readonly [number, number, number] = [0.74, 0.66, 0.55];
const LEAF: readonly [number, number, number] = [0.5, 0.37, 0.25];
const CLAY: readonly [number, number, number] = [0.68, 0.42, 0.28];
const SAND: readonly [number, number, number] = [0.96, 0.88, 0.74];

/** Any geometry as one of the post's parts (dome-detail-275): non-indexed, all one colour. */
function painted(g: THREE.BufferGeometry, colour: readonly [number, number, number], rng: Rng, shade = 0.06): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  const p = out.attributes.position as THREE.BufferAttribute, jitter = 1 + (rng() - 0.5) * 2 * shade;
  const colours = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    colours[i * 3] = colour[0] * jitter; colours[i * 3 + 1] = colour[1] * jitter; colours[i * 3 + 2] = colour[2] * jitter;
  }
  out.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return out;
}

/** A palm log `len` long along x or z, its middle at (x, y, z), its end a little thinner (dome-detail-275). */
function palmLog(len: number, r: number, x: number, y: number, z: number, axis: 'x' | 'z', rng: Rng, sides = 7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * 0.92, r, len, sides, 1);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return painted(g, TIMBER, rng, 0.12);
}

/**
 * A block whose outer face leans in to its top (a buttress, a splash skirt, a drift; dome-detail-275): the top's
 * vertices on its `side` of the block (x+ / x- / z+ / z-) drawn back toward the wall by `lean`.
 */
function talus(w: number, h: number, d: number, x: number, y0: number, z: number, colour: readonly [number, number, number], rng: Rng,
  side: 'x+' | 'x-' | 'z+' | 'z-', lean: number): THREE.BufferGeometry {
  const g = block(w, h, d, x, y0, z, colour, rng, 0.03), p = g.attributes.position as THREE.BufferAttribute;
  const ax = side[0] === 'x' ? 0 : 2, sg = side[1] === '+' ? 1 : -1, c = ax === 0 ? x : z;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < y0 + h - 1e-4 || (p.getComponent(i, ax) - c) * sg <= 0) continue;
    p.setComponent(i, ax, p.getComponent(i, ax) - sg * lean);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The gate post standing: its door on +z (the road side, where the steel hut had its porch), a window in each side
 * wall, the parapet's merlons at the corners, two rain spouts on the back. About 4.2 x 5.4 m, 3.3 m to the merlons'
 * tops: inside the checkpoint hut's footprint (2.4 x 3.7 half extents, 3.3 m), whose key and ground fit it keeps.
 * (dome-detail-275: "a plain crenellated block with a door and two beam ends") The parapet crowned all round with the
 * ksar's merlons, stepped pinnacles at its corners; the palm-trunk beam ends (toron) through the walls under it; battered
 * buttresses at the corners and a sloped splash skirt along the foot; the doorway framed in timber under a palm-log
 * lintel, one plank leaf shut at the back of the reveal with its battens, a threshold stone, a mud bench (dokkana) by it and a clay jar; the
 * windows barred with palm ribs under palm-log lintels; the spouts open palm channels, the rain's stain down the wall
 * under each; the render fallen off the rubble in patches; sand drifted against the back corner.
 */
export function buildKsarGatePost(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // the body: four battered walls of render, the door and the windows cut through them (no painted opening: the r2
  // standard, props #1), the dark of the room behind them, its foot damp
  const wall = (w: number, h: number, d: number, x: number, y0: number, z: number) =>
    parts.push(dampFoot(batter(block(w, h, d, x, y0, z, RENDER, rng, 0.02), 0, WALL, 0.09, W / 2, D / 2), 0.45));
  // (dome-detail-275) a thin part laid on a wall, leaned with it
  const onWall = (g: THREE.BufferGeometry) => parts.push(batter(g, 0, WALL, 0.09, W / 2, D / 2));
  const DOOR_W = 1.0, DOOR_H = 2.12, WIN_Z = 0.6, WIN_D = 0.45, WIN_Y0 = 1.65, WIN_Y1 = 2.2;
  wall(W, WALL, THICK, 0, 0, -D / 2 + THICK / 2);
  for (const sx of [-1, 1]) wall(W / 2 - DOOR_W / 2, WALL, THICK, sx * (W / 2 + DOOR_W / 2) / 2, 0, D / 2 - THICK / 2);
  wall(DOOR_W, WALL - DOOR_H, THICK, 0, DOOR_H, D / 2 - THICK / 2);
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - THICK / 2);
    const z0 = -D / 2 + THICK, w0 = WIN_Z - WIN_D / 2 - z0, z1 = WIN_Z + WIN_D / 2, w1 = D / 2 - THICK - z1;
    wall(THICK, WALL, w0, x, 0, z0 + w0 / 2);
    wall(THICK, WALL, w1, x, 0, z1 + w1 / 2);
    wall(THICK, WIN_Y0, WIN_D, x, 0, WIN_Z);
    wall(THICK, WALL - WIN_Y1, WIN_D, x, WIN_Y1, WIN_Z);
    // (dome-detail-275) two palm ribs barring the window, in the wall's thickness
    for (const dz of [-0.09, 0.09]) onWall(block(0.04, WIN_Y1 - WIN_Y0 + 0.04, 0.04, x, WIN_Y0 - 0.02, WIN_Z + dz, TIMBER, rng, 0.1));
    // a palm-log lintel over it, half bedded in the wall
    parts.push(palmLog(0.8, 0.07, sx * (W / 2 - 0.09 * (WIN_Y1 + 0.08) / WALL + 0.01), WIN_Y1 + 0.08, WIN_Z, 'z', rng));
  }
  // the room's dark behind the openings, a hand inside the walls
  parts.push(block(W - 2 * THICK - 0.04, WALL - 0.12, D - 2 * THICK - 0.04, 0, 0.02, 0, OPENING, rng, 0));
  // the parapet round the roof, set on the battered wall's top
  const tw = W - 0.18, td = D - 0.18, PH = PARAPET - 0.1, top = WALL + PH;
  parts.push(block(tw, PH, THICK, 0, WALL, td / 2 - THICK / 2, RENDER, rng));
  parts.push(block(tw, PH, THICK, 0, WALL, -(td / 2 - THICK / 2), RENDER, rng));
  parts.push(block(THICK, PH, td - 2 * THICK, tw / 2 - THICK / 2, WALL, 0, RENDER, rng));
  parts.push(block(THICK, PH, td - 2 * THICK, -(tw / 2 - THICK / 2), WALL, 0, RENDER, rng));
  // (dome-detail-275) a stepped pinnacle at each corner and the merlons between them along every side
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (tw / 2 - 0.25), cz = sz * (td / 2 - 0.25);
    // (to the checkpoint hut's 3.3 m: the post keeps its envelope)
    parts.push(block(0.5, MERLON - 0.05, 0.5, cx, top, cz, RENDER, rng));
    parts.push(block(0.32, 0.08, 0.32, cx, top + MERLON - 0.05, cz, RENDER, rng));
    parts.push(block(0.16, 0.07, 0.16, cx, top + MERLON + 0.03, cz, RENDER, rng));
  }
  for (const [len, along] of [[tw, 'x'], [td, 'z']] as const) {
    const m = along === 'x' ? 3 : 4;
    for (let k = 1; k <= m; k++) for (const s of [-1, 1]) {
      const u = -len / 2 + 0.25 + (len - 0.5) * k / (m + 1), o = s * (along === 'x' ? td : tw) / 2 - s * THICK / 2;
      parts.push(along === 'x' ? block(0.36, 0.17, THICK - 0.04, u, top, o, RENDER, rng) : block(THICK - 0.04, 0.17, 0.36, o, top, u, RENDER, rng));
    }
  }
  // the roof inside the parapet, a hand under its top
  parts.push(block(tw - 2 * THICK, 0.12, td - 2 * THICK, 0, WALL - 0.1, 0, RENDER, rng));
  // (dome-detail-275) the toron: palm-trunk beam ends through the walls under the parapet (the front's clear of the
  // door's lintel)
  const yb = WALL - 0.3, fx = W / 2 - 0.09 * yb / WALL, fz = D / 2 - 0.09 * yb / WALL;
  for (const z of [-1.5, 1.5]) for (const sx of [-1, 1]) parts.push(palmLog(0.4, 0.075, sx * (fx + 0.03), yb, z, 'x', rng, 5));
  for (const x of [-1.4, 0, 1.4]) parts.push(palmLog(0.4, 0.075, x, yb, -(fz + 0.03), 'z', rng, 5));
  for (const x of [-1.45, 1.45]) parts.push(palmLog(0.4, 0.075, x, yb, fz + 0.03, 'z', rng, 5));
  // the door on the road side: its timber frame in the reveal, a palm-log lintel over it, one blue plank leaf shut at the
  // back of the reveal (its battens on it) and the other open on the room's dark; a threshold stone before it
  const front = D / 2 - 0.09 * 0.25; // (the battered face at a quarter of the wall's height)
  // (the jambs in the reveal clear of the doorway itself, the leaf and its battens behind the reveal's mouth: the opening
  // stays open through the wall)
  for (const sx of [-1, 1]) onWall(block(0.065, DOOR_H, 0.12, sx * (DOOR_W / 2 - 0.0225), 0, D / 2 - 0.08, TIMBER, rng, 0.08));
  onWall(block(DOOR_W, 0.1, 0.12, 0, DOOR_H - 0.1, D / 2 - 0.08, TIMBER, rng, 0.08));
  onWall(block(DOOR_W / 2 - 0.07, DOOR_H - 0.12, 0.04, -DOOR_W / 4 + 0.035, 0.02, D / 2 - THICK + 0.03, LEAF, rng, 0.05));
  for (const y of [0.45, 1.6]) onWall(block(DOOR_W / 2 - 0.11, 0.09, 0.025, -DOOR_W / 4 + 0.035, y, D / 2 - THICK + 0.055, LEAF.map((c) => c * 0.82) as [number, number, number], rng, 0.05));
  parts.push(palmLog(1.55, 0.095, 0, DOOR_H + 0.1, D / 2 - 0.09 * (DOOR_H + 0.1) / WALL + 0.02, 'x', rng));
  parts.push(block(1.5, 0.12, 0.6, 0, 0, front + 0.25, DAMP, rng, 0.03));
  // the mud bench (dokkana) along the front to the door's left, and a clay jar to its right
  parts.push(dampFoot(block(1.3, 0.42, 0.46, -1.35, 0, D / 2 + 0.2, RENDER, rng, 0.03), 0.3));
  parts.push(block(1.38, 0.07, 0.52, -1.35, 0.42, D / 2 + 0.21, RENDER.map((c) => c * 0.96) as [number, number, number], rng, 0.02));
  const jar = new THREE.LatheGeometry([[0.001, 0], [0.15, 0.03], [0.23, 0.24], [0.19, 0.48], [0.1, 0.58], [0.001, 0.6]].map(([r, y]) => new THREE.Vector2(r, y)), 8);
  jar.translate(1.25, 0, D / 2 + 0.32);
  parts.push(painted(jar, CLAY, rng));
  // the sloped splash skirt along the foot (clear of the door and the bench), the battered buttresses at the corners
  for (const sx of [-1, 1]) {
    parts.push(talus(0.3, 0.45, D - 0.6, sx * (W / 2 + 0.1), 0, 0, DAMP, rng, sx > 0 ? 'x+' : 'x-', 0.24));
    for (const sz of [-1, 1]) parts.push(dampFoot(talus(0.42, 1.9, 0.62, sx * (W / 2 + 0.08), 0, sz * (D / 2 - 0.36), RENDER, rng, sx > 0 ? 'x+' : 'x-', 0.28), 0.45));
  }
  parts.push(talus(W - 0.4, 0.45, 0.3, 0, 0, -(D / 2 + 0.1), DAMP, rng, 'z-', 0.24));
  parts.push(talus(1.0, 0.45, 0.3, 1.45, 0, D / 2 + 0.1, DAMP, rng, 'z+', 0.24));
  // two rain spouts through the back parapet's foot, each an open palm channel, and the rain's stain down the wall
  for (const x of [-1.1, 1.1]) {
    const zc = -(td / 2 + 0.12);
    parts.push(block(0.16, 0.03, 0.55, x, WALL + 0.02, zc, TIMBER, rng, 0.1));
    for (const s of [-1, 1]) parts.push(block(0.03, 0.09, 0.55, x + s * 0.07, WALL + 0.05, zc, TIMBER, rng, 0.1));
    for (const [y0, y1, w, k] of [[1.95, WALL - 0.02, 0.32, 0.72], [1.3, 1.95, 0.24, 0.8], [0.75, 1.3, 0.14, 0.88]] as const) {
      onWall(block(w, y1 - y0, 0.012, x, y0, -D / 2 - 0.006, RENDER.map((c) => c * k) as [number, number, number], rng, 0.01));
    }
  }
  // the render fallen off the rubble in patches: the stones bare, a few standing proud
  for (const [x, z, y0, w, h, side] of [[1.5, 0, 1.25, 0.6, 0.55, 'z'], [0, -1.5, 0.55, 0.8, 0.6, 'x']] as const) {
    const px = side === 'z' ? x : -W / 2 - 0.006, pz = side === 'z' ? D / 2 + 0.006 : z;
    onWall(block(side === 'z' ? w : 0.012, h, side === 'z' ? 0.012 : w, px, y0, pz, STONE, rng, 0.04));
    for (let k = 0; k < 3; k++) {
      const a = (rng() - 0.5) * (w - 0.2), b = y0 + 0.08 + rng() * (h - 0.2), sw = 0.14 + rng() * 0.08;
      onWall(block(side === 'z' ? sw : 0.04, 0.09, side === 'z' ? 0.04 : sw, side === 'z' ? px + a : px, b, side === 'z' ? pz : pz + a, STONE.map((c) => c * 0.92) as [number, number, number], rng, 0.08));
    }
  }
  // the sand drifted against the back corner
  parts.push(talus(1.7, 0.3, 0.7, -W / 2 + 0.9, 0, -D / 2 - 0.3, SAND, rng, 'z-', 0.55));
  return merge(parts);
}

/**
 * The gate post overrun: its render and brick in a low heap over its footprint, one corner of its walls still standing
 * to a man's height, a lintel thrown down across the rubble.
 */
export function buildKsarGatePostBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // the standing corner (back left), its foot damp
  parts.push(dampFoot(block(1.5, 1.7, THICK + 0.1, -W / 2 + 0.75, 0, -D / 2 + 0.25, RENDER, rng), 0.45));
  parts.push(dampFoot(block(THICK + 0.1, 1.3, 1.6, -W / 2 + 0.25, 0, -D / 2 + 1.05, RENDER, rng), 0.45));
  // the heap: blocks of render and brick, tumbled, lower toward the edges
  for (let i = 0; i < 11; i++) {
    const s = 0.45 + rng() * 0.6, x = (rng() - 0.5) * (W - 1.0), z = (rng() - 0.5) * (D - 1.2);
    const y = Math.max(0, 0.55 - Math.hypot(x / W, z / D) * 1.1) * rng();
    const b = block(s, s * (0.5 + rng() * 0.4), s * (0.7 + rng() * 0.5), 0, 0, 0, i % 4 === 0 ? DAMP : RENDER, rng, 0.06);
    b.rotateX((rng() - 0.5) * 0.9); b.rotateY(rng() * Math.PI); b.rotateZ((rng() - 0.5) * 0.9);
    b.translate(x, y - 0.08, z);
    parts.push(b);
  }
  // the low mound of the rest under the blocks: three slumped, turned slabs, not a platform
  for (const [x, z, w, d, h, a] of [[-0.3, -0.4, 3.0, 3.4, 0.32, 0.25], [0.5, 0.7, 2.4, 2.6, 0.24, -0.4], [-0.6, 1.2, 1.8, 1.6, 0.18, 0.9]] as const) {
    const slab = block(w, h, d, 0, 0, 0, DAMP, rng, 0.03);
    const sp = slab.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) > 0.01) sp.setXYZ(i, sp.getX(i) * 0.72, sp.getY(i), sp.getZ(i) * 0.72); // slumped: its top drawn in
    slab.computeVertexNormals();
    slab.rotateY(a);
    parts.push(slab.translate(x, -0.1, z));
  }
  // the door's lintel, thrown down
  const lintel = block(1.45, 0.16, 0.22, 0, 0, 0, TIMBER, rng, 0.08);
  lintel.rotateY(0.6); lintel.rotateZ(0.12);
  parts.push(lintel.translate(0.6, 0.42, D / 2 - 1.0));
  return merge(parts);
}

function mulberry32(a: number): Rng {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** The hut it stands in for. */
const HUT = DESTRUCTIBLE_BUILDING_TYPES.checkpointhut;

/**
 * The ksar gate post's destructible kind: the checkpoint hut's class, crush threshold and resistance (structureKit
 * lightMeta: keep 0.84, crushMin 4.5), a collider over its own footprint, the map's regional plaster. Its builds take
 * the hut's own draws from the props' destructible geometry stream and discard them (that one stream shapes every
 * pool, so every pool built after this one keeps its shape) and draw the post from a seed of its own.
 */
export const KSAR_GATE_POST = Object.freeze({
  cls: 'break' as const,
  mat: 'regionalPlaster',
  contact: 'ob' as const,
  collider: true as const,
  hw: 2.15,
  hl: 2.75,
  r: Math.hypot(2.15, 2.75),
  h: 3.3,
  keep: 0.84,
  crushMin: 4.5,
  instanceTintStrength: 0.05,
  build: (rng: Rng) => { HUT.build(rng).dispose(); return buildKsarGatePost(mulberry32(0x6a7e5)); },
  broken: (rng: Rng) => { HUT.broken(rng).dispose(); return buildKsarGatePostBroken(mulberry32(0x6a7e6)); },
});

/** The structure variants a map may name in place of a generic kind (props structureVariants; the Redrock lane's round 9:
 * the desert post's sangar for the field works' pillbox, desertSangar.ts; round 10: the Desert Patrol's rendered barrack
 * and fuel post for the Quonset hut and the checkpoint hut, the Bedouin's goat-hair tents for the desert and camp tents,
 * wadiRumPosts.ts; the map-content lane, 2026-10-10: a polar station's field works, its drum breastworks for the sandbag
 * stacks, its drift fence for the barbed wire and its drum row for the barrier, polarWorks.ts). */
export const STRUCTURE_VARIANTS = Object.freeze({ ksargate: KSAR_GATE_POST, sangar: DESERT_SANGAR, rumbarrack: RUM_BARRACK,
  rumpost: RUM_POST, rumshed: RUM_SHED, bedouintent: BEDOUIN_TENT, bedouincamp: BEDOUIN_CAMP_TENT,
  polardrumwall: POLAR_DRUM_WALL, polardrumwallbig: POLAR_DRUM_WALL_BIG, polardrumwallsmall: POLAR_DRUM_WALL_SMALL,
  polardriftfence: POLAR_DRIFT_FENCE, polardrumrow: POLAR_DRUM_ROW,
  // (the Earthrise 228 rebuild, 2026-10-18) a lunar station's works and clutter (lunarWorks.ts)
  lunarbagwall: LUNAR_BAG_WALL, lunarbagwallbig: LUNAR_BAG_WALL_BIG, lunarbagwallsmall: LUNAR_BAG_WALL_SMALL, lunartether: LUNAR_TETHER,
  lunarblockrow: LUNAR_BLOCK_ROW, lunarbeacon: LUNAR_BEACON, lunarcanister: LUNAR_CANISTER, lunarbagfence: LUNAR_BAG_FENCE });
