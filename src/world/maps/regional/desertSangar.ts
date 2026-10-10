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

/** A box (centred on x, z, its base at y0), its print at the world's scale, one colour jittered by `shade`. */
function block(w: number, h: number, d: number, x: number, y0: number, z: number, colour: Rgb, rng: Rng, shade = 0.04): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
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

/** One sandbag: a flattened block, a little turned and tipped, its colour a bag's own. */
function bag(x: number, y: number, z: number, along: 'x' | 'z', rng: Rng): THREE.BufferGeometry {
  const g = along === 'x' ? block(0.56, 0.2, 0.34, 0, 0, 0, BAGS, rng, 0.07) : block(0.34, 0.2, 0.56, 0, 0, 0, BAGS, rng, 0.07);
  g.rotateY((rng() - 0.5) * 0.18);
  g.rotateZ((rng() - 0.5) * 0.08);
  return g.translate(x, y, z);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('desertSangar: merge produced no geometry');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** The sangar's measures (m): its body, its walls' height, the roof slab. */
const W = 5.3, D = 4.7, WALL = 1.72, SLAB = 0.2;

/** The sangar standing: its slits on +z (the pillbox's front), its door on -z behind a blast wall. 2.4 m to the bags. */
function buildDesertSangar(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // the footing: rough stone, a hand proud of the render, half sunk in the sand
  parts.push(block(W + 0.24, 0.62, D + 0.24, 0, -0.3, 0, STONE, rng, 0.05));
  // the body: one battered block of render over its stone, its foot damp
  parts.push(dampFoot(batter(block(W, WALL, D, 0, 0, 0, RENDER, rng, 0.03), 0, WALL, 0.16, W / 2, D / 2), 0.55));
  // the roof slab, a little proud of the battered walls' head
  parts.push(block(W - 0.16, SLAB, D - 0.16, 0, WALL, 0, RENDER, rng, 0.03));
  // two courses of sandbags round the slab's edge, the upper course staggered, gaps left in the front for the guns
  const top = WALL + SLAB, hx = (W - 0.16) / 2 - 0.2, hz = (D - 0.16) / 2 - 0.2;
  for (let course = 0; course < 2; course++) {
    const y = top + course * 0.2, stagger = course * 0.28;
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
  // three firing slits on the front, each dark under a timber lintel
  const front = D / 2 - 0.16 * 0.7;
  for (const x of [-1.6, 0, 1.6]) {
    parts.push(block(0.85, 0.24, 0.04, x, 1.12, front + 0.01, OPENING, rng, 0));
    parts.push(block(1.1, 0.12, 0.22, x, 1.36, front + 0.05, TIMBER, rng, 0.08));
  }
  // a slit in each side wall
  const side = W / 2 - 0.16 * 0.7;
  for (const sx of [-1, 1]) {
    parts.push(block(0.04, 0.24, 0.7, sx * (side + 0.01), 1.12, 0.4, OPENING, rng, 0));
    parts.push(block(0.22, 0.12, 0.95, sx * (side + 0.05), 1.36, 0.4, TIMBER, rng, 0.08));
  }
  // the door on the back under its lintel, a stone step, and the blast wall of piled stone a metre out from it
  const back = -(D / 2 - 0.16 * 0.4);
  parts.push(block(0.9, 1.5, 0.04, 0.9, 0.0, back - 0.01, OPENING, rng, 0));
  parts.push(block(1.25, 0.14, 0.24, 0.9, 1.5, back - 0.05, TIMBER, rng, 0.08));
  parts.push(block(1.1, 0.12, 0.5, 0.9, 0, back - 0.3, STONE, rng, 0.05));
  for (let k = 0; k < 5; k++) {
    const s = 0.34 + rng() * 0.18;
    const g = block(s * 1.4, s, s, 0, 0, 0, STONE, rng, 0.08);
    g.rotateY((rng() - 0.5) * 0.4);
    parts.push(g.translate(0.2 + k * 0.38, (k % 2) * 0.32, back - 1.05 + (rng() - 0.5) * 0.08));
  }
  parts.push(block(2.0, 0.9, 0.42, 0.95, -0.1, back - 1.05, STONE, rng, 0.06));
  return merge(parts);
}

/** The sangar overrun: its render and stone in a low heap over its footprint, a corner standing, bags strewn. */
function buildDesertSangarBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(block(W + 0.24, 0.5, D + 0.24, 0, -0.3, 0, STONE, rng, 0.05));
  parts.push(dampFoot(block(1.6, 1.3, 0.42, -W / 2 + 0.8, 0, -D / 2 + 0.21, RENDER, rng), 0.55));
  parts.push(dampFoot(block(0.42, 1.0, 1.5, -W / 2 + 0.21, 0, -D / 2 + 1.0, RENDER, rng), 0.55));
  for (let i = 0; i < 12; i++) {
    const s = 0.4 + rng() * 0.6, x = (rng() - 0.5) * (W - 1.0), z = (rng() - 0.5) * (D - 1.0);
    const y = Math.max(0, 0.5 - Math.hypot(x / W, z / D) * 1.1) * rng();
    const b = block(s, s * (0.5 + rng() * 0.4), s * (0.7 + rng() * 0.5), 0, 0, 0, i % 3 === 0 ? STONE : RENDER, rng, 0.06);
    b.rotateX((rng() - 0.5) * 0.9); b.rotateY(rng() * Math.PI); b.rotateZ((rng() - 0.5) * 0.9);
    parts.push(b.translate(x, y - 0.08, z));
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
