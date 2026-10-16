// src/world/maps/regional/desertSangar.ts — the desert post's bunker (the Redrock lane, round 9, 2026-10-08).
//
// Gauntlet wave 261 on Redrock: "an untextured grey box with a flat plank roof and a flat black rectangle for a door",
// "a crude buried cube ... proportions that belong to no regional building". That was the field works' concrete pillbox
// (inhabitKit.ts bunker), standing behind every breastwork. A position on the Desert Patrol's ground is built of the
// valley's own stone under a mud render: a low battered block on a stone footing, its roof slab under two courses of
// sandbags with gaps left for the guns, three firing slits under timber lintels on the front, and the door on the back
// behind a blast wall of piled stone.
//
// A map adopts it in place of the pillbox by name (props structureVariants: { bunker: 'sangar' }): the field works keep
// their key, footprint (inside the bunker's 2.98 x 2.68 m half extents and 2.45 m height), class and ground fit, and only
// the build changes. It draws on the map's regional plaster (vertex-coloured). Pure geometry: no DOM, no materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESTRUCTIBLE_TYPES } from '../inhabitKit.ts';

type Rng = () => number;
type Rgb = readonly [number, number, number];

/** The colours multiplying the plaster print: the render, its damp foot, the stone, the bags, the timber, the openings. */
const RENDER: Rgb = [0.96, 0.86, 0.76];
const DAMP: Rgb = [0.76, 0.66, 0.58];
const STONE: Rgb = [0.66, 0.48, 0.39];
const BAGS: Rgb = [0.84, 0.74, 0.58];
const TIMBER: Rgb = [0.42, 0.31, 0.21];
const OPENING: Rgb = [0.06, 0.05, 0.045];
/** The plaster print's tiling: a tile every 1.8 m. */
const UV_PER_M = 1 / 1.8;

/** The walls' batter: every vertex above `y0` drawn in toward the centre by `inset` at `y1`, linearly. */
function batter(g: THREE.BufferGeometry, y0: number, y1: number, inset: number, hw: number, hd: number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, (p.getY(i) - y0) / (y1 - y0)));
    p.setXYZ(i, p.getX(i) * (1 - (inset * t) / hw), p.getY(i), p.getZ(i) * (1 - (inset * t) / hd));
  }
  g.computeVertexNormals();
  return g;
}

/** The render darker at the foot (below `rise` metres), where the rain splashes and the sand scours. */
function dampFoot(g: THREE.BufferGeometry, rise: number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute, c = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, p.getY(i) / rise));
    c.setXYZ(i, c.getX(i) * (DAMP[0] / RENDER[0] + (1 - DAMP[0] / RENDER[0]) * t), c.getY(i) * (DAMP[1] / RENDER[1] + (1 - DAMP[1] / RENDER[1]) * t),
      c.getZ(i) * (DAMP[2] / RENDER[2] + (1 - DAMP[2] / RENDER[2]) * t));
  }
  return g;
}

/** A soup of triangles, each wound to face its side, with a colour per triangle: a non-indexed geometry with its face
 *  normals and its print laid by each face's own axes at the world's scale. */
class Soup {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  tri(a: V3, b: V3, c: V3, colour: Rgb, want?: V3): void {
    if (want) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) [b, c] = [c, b];
    }
    for (const q of [a, b, c]) { this.pos.push(q[0], q[1], q[2]); this.col.push(colour[0], colour[1], colour[2]); }
  }
  quad(a: V3, b: V3, c: V3, d: V3, colour: Rgb, want?: V3): void {
    if (want) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) [a, b, c, d] = [d, c, b, a];
    }
    this.tri(a, b, c, colour);
    this.tri(a, c, d, colour);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.computeVertexNormals();
    const n = g.attributes.normal as THREE.BufferAttribute, uv = new Float32Array((this.pos.length / 3) * 2);
    for (let i = 0; i < this.pos.length / 3; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      const [a, b] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
      uv[i * 2] = a * UV_PER_M; uv[i * 2 + 1] = b * UV_PER_M;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
}
type V3 = [number, number, number];

/** A chamfered rectangle's eight corners (w x h, its corners cut by c), counter-clockwise from +a. */
function octagon(w: number, h: number, c: number): Array<[number, number]> {
  const a = w / 2, b = h / 2;
  return [[a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c], [-a + c, -b], [a - c, -b]];
}

/** A prism along x from -len/2 to len/2 of the section (y, z) points, its far end's section scaled by `end`, capped. */
function prismX(len: number, section: ReadonlyArray<[number, number]>, colour: Rgb, rng: Rng, shade = 0.04, end = 1, startScale = 1): THREE.BufferGeometry {
  const s = new Soup(), k = 1 + (rng() - 0.5) * 2 * shade, c: Rgb = [colour[0] * k, colour[1] * k, colour[2] * k];
  const ring = (x: number, sc: number): V3[] => section.map(([y, z]) => [x, y * sc, z * sc]);
  const r0 = ring(-len / 2, startScale), r1 = ring(len / 2, end);
  for (let i = 0; i < section.length; i++) {
    const j = (i + 1) % section.length, my = (section[i][0] + section[j][0]) / 2, mz = (section[i][1] + section[j][1]) / 2;
    s.quad(r0[i], r1[i], r1[j], r0[j], c, [0, my, mz]);
  }
  for (let i = 1; i + 1 < section.length; i++) {
    s.tri(r0[0], r0[i], r0[i + 1], c, [-1, 0, 0]);
    s.tri(r1[0], r1[i], r1[i + 1], c, [1, 0, 0]);
  }
  return s.geometry();
}

/** The same prism stood on end: its section in plan (x, z), from y0 up `h`, its top's plan scaled by `top`. */
function prismY(h: number, plan: ReadonlyArray<[number, number]>, y0: number, colour: Rgb, rng: Rng, shade = 0.04, top = 1): THREE.BufferGeometry {
  return prismX(h, plan.map(([x, z]) => [-x, z] as [number, number]), colour, rng, shade, top).rotateZ(Math.PI / 2).translate(0, y0 + h / 2, 0);
}

/** A rough stone: an icosahedron squashed to its sizes and turned, each corner a little off. */
function rubble(sx: number, sy: number, sz: number, colour: Rgb, rng: Rng): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  if (g.index) throw new Error("desertSangar: an indexed icosahedron");
  const p = g.attributes.position as THREE.BufferAttribute, key = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const id = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let j = key.get(id);
    if (j === undefined) key.set(id, j = 0.82 + rng() * 0.3);
    p.setXYZ(i, p.getX(i) * sx * j, p.getY(i) * sy * j, p.getZ(i) * sz * j);
  }
  g.deleteAttribute('uv');
  const s = new Soup(), k = 0.92 + rng() * 0.16, c: Rgb = [colour[0] * k, colour[1] * k, colour[2] * k];
  for (let i = 0; i < p.count; i += 3) s.tri([p.getX(i), p.getY(i), p.getZ(i)], [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)], [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)], c);
  return s.geometry();
}

/** One sandbag: a stuffed sack, its section rounded, its ends drawn in, a little turned and tipped, its colour its own. */
function bag(x: number, y: number, z: number, along: 'x' | 'z', rng: Rng): THREE.BufferGeometry {
  const g = prismX(0.56, octagon(0.2, 0.34, 0.07), BAGS, rng, 0.07, 0.72, 0.8);
  if (along === 'z') g.rotateY(Math.PI / 2);
  g.rotateY((rng() - 0.5) * 0.18);
  g.rotateZ((rng() - 0.5) * 0.08);
  return g.translate(x, y + 0.1, z);
}

/** A timber lintel: a squared baulk with its arrises taken off, `len` along x, centred at its bed. */
function lintel(len: number, deep: number, x: number, y: number, z: number, along: 'x' | 'z', rng: Rng): THREE.BufferGeometry {
  const g = prismX(len, octagon(0.13, deep, 0.025), TIMBER, rng, 0.08);
  if (along === 'z') g.rotateY(Math.PI / 2);
  return g.translate(x, y + 0.065, z);
}

/** A hole cut through a wall's outer face: along its face (u) and up, its splay to the inner end, a sill or none. */
interface Hole { u0: number; u1: number; y0: number; y1: number; splay: number }

/**
 * One battered wall's outer face (before the batter), its plane at `at` along `n`, `len` along `u`, from the ground to
 * WALL: the face cut round its holes; each hole's reveal through the wall's thickness, splayed in to its inner end, and
 * the dark of the room behind at that end.
 */
function wallFace(s: Soup, n: V3, at: number, len: number, holes: readonly Hole[], t: number): void {
  const u: V3 = [-n[2], 0, n[0]];
  const P = (a: number, y: number, o = 0): V3 => [n[0] * (at - o) + u[0] * a, y, n[2] * (at - o) + u[2] * a];
  const ys = [...new Set([0, WALL, ...holes.flatMap((h) => [h.y0, h.y1])])].sort((a, b) => a - b);
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k], y1 = ys[k + 1], my = (y0 + y1) / 2;
    const cuts = holes.filter((h) => h.y0 <= my && h.y1 >= my).sort((a, b) => a.u0 - b.u0);
    let a = -len / 2;
    for (const h of [...cuts, { u0: len / 2, u1: len / 2 }]) {
      if (h.u0 - a > 0.002) s.quad(P(a, y0), P(h.u0, y0), P(h.u0, y1), P(a, y1), RENDER, n);
      a = h.u1;
    }
  }
  for (const h of holes) {
    const sp = h.splay, i0 = h.u0 + sp, i1 = h.u1 - sp, j0 = h.y0 + (h.y0 > 0.01 ? sp * 0.5 : 0), j1 = h.y1 - sp * 0.5;
    const o: V3[] = [P(h.u0, h.y0), P(h.u1, h.y0), P(h.u1, h.y1), P(h.u0, h.y1)], q: V3[] = [P(i0, j0, t), P(i1, j0, t), P(i1, j1, t), P(i0, j1, t)];
    const c = P((h.u0 + h.u1) / 2, (h.y0 + h.y1) / 2, t * 0.5);
    for (let e = 0; e < 4; e++) {
      const f = (e + 1) % 4;
      const m: V3 = [(o[e][0] + o[f][0]) / 2, (o[e][1] + o[f][1]) / 2, (o[e][2] + o[f][2]) / 2];
      s.quad(o[e], o[f], q[f], q[e], e === 0 ? shadeOf(RENDER, 0.9) : shadeOf(RENDER, 0.78), [c[0] - m[0], c[1] - m[1], c[2] - m[2]]);
    }
    s.quad(q[0], q[1], q[2], q[3], OPENING, n);
  }
}
const shadeOf = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('desertSangar: merge produced no geometry');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** The sangar's measures (m): its body, its walls' height and thickness, the roof slab. */
const W = 5.3, D = 4.7, WALL = 1.72, SLAB = 0.2, T = 0.45;

/**
 * The sangar standing: its slits on +z (the pillbox's front), its door on -z behind a blast wall. 2.4 m to the bags.
 * (The r2 sweep, 2026-10-16: "six painted plates, every piece a plain box, the wreck a raft": the slits and the door are
 * cut through the battered walls with their reveals splayed in to the dark of the room, the footing, slab and stones
 * chamfered or rough, the bags stuffed sacks, the lintels squared baulks; the wreck stands as two corners of its walls
 * with the slab broken over the heap.)
 */
function buildDesertSangar(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // the footing: rough stone, a hand proud of the render, half sunk in the sand, its arrises knocked off
  parts.push(prismY(0.62, octagon(W + 0.24, D + 0.24, 0.16), -0.3, STONE, rng, 0.05, 0.985));
  // the body: four battered walls of render over its stone, the slits and the door cut through them, its foot damp
  const body = new Soup();
  const slit = (u: number, w: number): Hole => ({ u0: u - w / 2, u1: u + w / 2, y0: 1.0, y1: 1.24, splay: 0.16 });
  wallFace(body, [0, 0, 1], D / 2, W, [-1.6, 0, 1.6].map((x) => slit(x, 0.85)), T);
  wallFace(body, [0, 0, -1], D / 2, W, [{ u0: -0.9 - 0.45, u1: -0.9 + 0.45, y0: 0, y1: 1.5, splay: 0.04 }], T);
  wallFace(body, [1, 0, 0], W / 2, D, [slit(-0.4, 0.7)], T);
  wallFace(body, [-1, 0, 0], W / 2, D, [slit(0.4, 0.7)], T);
  parts.push(dampFoot(batter(body.geometry(), 0, WALL, 0.16, W / 2, D / 2), 0.55));
  // the roof slab, a little proud of the battered walls' head, its edge chamfered
  parts.push(prismY(SLAB, octagon(W - 0.16, D - 0.16, 0.08), WALL, RENDER, rng, 0.03, 0.99));
  // two courses of sandbags round the slab's edge, the upper course staggered, gaps left in the front for the guns
  const top = WALL + SLAB, hx = (W - 0.16) / 2 - 0.2, hz = (D - 0.16) / 2 - 0.2;
  for (let course = 0; course < 2; course++) {
    const y = top + course * 0.15 - 0.03, stagger = course * 0.28;
    for (let x = -hx + stagger; x <= hx; x += 0.56) {
      if (course === 1 && Math.abs(x) < 0.5) continue; // the front's gun gap
      parts.push(bag(x, y, hz, 'x', rng));
      parts.push(bag(x, y, -hz, 'x', rng));
    }
    for (let z = -hz + 0.34 + stagger; z <= hz - 0.34; z += 0.56) {
      parts.push(bag(hx, y, z, 'z', rng));
      parts.push(bag(-hx, y, z, 'z', rng));
    }
  }
  // the lintels over the slits and the door, bedded into the render over each head
  const lean = 0.16 * 1.25 / WALL;
  for (const x of [-1.6, 0, 1.6]) parts.push(lintel(1.15, 0.24, x, 1.26, D / 2 - lean - 0.08, 'x', rng));
  for (const sx of [-1, 1]) parts.push(lintel(0.98, 0.24, sx * (W / 2 - lean - 0.08), 1.26, sx * 0.4, 'z', rng));
  parts.push(lintel(1.3, 0.26, -0.9, 1.52, -(D / 2 - 0.16 * 1.5 / WALL - 0.08), 'x', rng));
  // the door's stone step, and the blast wall of piled stone a metre out from it
  const back = -(D / 2 - 0.16 * 0.1);
  parts.push(prismX(1.1, octagon(0.16, 0.5, 0.04), STONE, rng, 0.05).translate(-0.9, 0.04, back - 0.27));
  parts.push(prismX(2.1, [[-0.1, 0.3], [0.45, 0.24], [0.8, 0.1], [0.8, -0.1], [0.45, -0.24], [-0.1, -0.3]], STONE, rng, 0.06, 0.96, 0.96).translate(-0.85, 0, back - 1.05));
  for (let k = 0; k < 6; k++) {
    const sz = 0.3 + rng() * 0.16;
    const g = rubble(sz * 1.5, sz, sz * 1.1, STONE, rng);
    g.rotateY((rng() - 0.5) * 0.6);
    parts.push(g.translate(-1.75 + k * 0.36, 0.78 + (k % 2) * 0.1, back - 1.05 + (rng() - 0.5) * 0.08));
  }
  return merge(parts);
}

/**
 * The sangar overrun: its footing; two corners of its walls standing to ragged heads, the slab broken in three over the
 * heap and leaning on them, the render and stone in a heap over its footprint, the bags strewn and spilled.
 */
function buildDesertSangarBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(prismY(0.5, octagon(W + 0.24, D + 0.24, 0.16), -0.3, STONE, rng, 0.05, 0.98));
  // the standing corners: each two lengths of battered wall to a ragged head
  for (const [cx, cz, lx, lz, h] of [[-1, -1, 1.7, 1.5, 1.55], [1, 1, 1.3, 1.1, 1.25]] as const) {
    const xs = cx * (W / 2 - T / 2), zs = cz * (D / 2 - T / 2);
    const runX = prismX(lx, [[0, T / 2], [h, T / 2 - 0.12], [h - 0.18, -T / 2 + 0.1], [0, -T / 2]], RENDER, rng, 0.04, 0.9);
    parts.push(dampFoot(runX.translate(xs - cx * (lx / 2 - T / 2), 0, zs), 0.55));
    const runZ = prismX(lz, [[0, T / 2], [h * 0.85, T / 2 - 0.12], [h * 0.85 - 0.2, -T / 2 + 0.1], [0, -T / 2]], RENDER, rng, 0.04, 0.85);
    parts.push(dampFoot(runZ.rotateY(Math.PI / 2).translate(xs, 0, zs - cz * (lz / 2 + T / 2)), 0.55));
  }
  // the slab in three pieces: one leaning from the heap onto each standing corner, the third flat on the heap
  for (const [x, y, z, rx, rz, w, d] of [[-1.1, 0.75, -0.9, 0.35, -0.4, 2.2, 1.8], [1.0, 0.65, 0.9, -0.3, 0.32, 1.9, 1.7], [0.2, 0.5, -0.1, 0.08, 0.1, 1.6, 1.4]] as const) {
    const g = prismY(SLAB, octagon(w, d, 0.12), -SLAB / 2, RENDER, rng, 0.04, 0.97);
    g.rotateX(rx); g.rotateZ(rz);
    parts.push(g.translate(x, y, z));
  }
  for (let i = 0; i < 12; i++) {
    const s = 0.4 + rng() * 0.5, x = (rng() - 0.5) * (W - 1.0), z = (rng() - 0.5) * (D - 1.0);
    const y = Math.max(0, 0.55 - Math.hypot(x / W, z / D) * 1.1) * (0.6 + rng() * 0.4);
    const b = rubble(s, s * (0.5 + rng() * 0.4), s * (0.7 + rng() * 0.5), i % 3 === 0 ? STONE : RENDER, rng);
    b.rotateY(rng() * Math.PI);
    parts.push(b.translate(x, y + 0.1, z));
  }
  for (let i = 0; i < 9; i++) parts.push(bag((rng() - 0.5) * W, 0.1 + rng() * 0.3, (rng() - 0.5) * D, rng() < 0.5 ? 'x' : 'z', rng));
  return merge(parts);
}

function mulberry32(a: number): Rng {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** The pillbox it stands in for. */
const BUNKER = DESTRUCTIBLE_TYPES.bunker;

/**
 * The sangar's destructible kind: the pillbox's class, contact, collider, extents, keep and crush threshold, on the map's
 * regional plaster. Its builds take the pillbox's own draws from the props' destructible geometry stream and discard
 * them (that stream shapes every pool, so every pool built after this one keeps its shape) and draw the sangar from a
 * seed of its own.
 */
export const DESERT_SANGAR = Object.freeze({
  cls: BUNKER.cls,
  mat: 'regionalPlaster',
  contact: BUNKER.contact,
  collider: true as const,
  hw: BUNKER.hw,
  hl: BUNKER.hl,
  r: BUNKER.r,
  h: BUNKER.h,
  keep: BUNKER.keep,
  crushMin: BUNKER.crushMin,
  instanceTintStrength: 0.05,
  build: (rng: Rng) => { BUNKER.build(rng).dispose(); return buildDesertSangar(mulberry32(0x5a96a7)); },
  broken: (rng: Rng) => { BUNKER.broken(rng).dispose(); return buildDesertSangarBroken(mulberry32(0x5a96a8)); },
});
