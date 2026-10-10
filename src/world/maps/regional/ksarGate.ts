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

/**
 * The gate post standing: its door on +z (the road side, where the steel hut had its porch), a window in each side
 * wall, the parapet's merlons at the corners, two rain spouts on the back. About 4.2 x 5.4 m, 3.3 m to the merlons'
 * tops: inside the checkpoint hut's footprint (2.4 x 3.7 half extents, 3.3 m), whose key and ground fit it keeps.
 */
export function buildKsarGatePost(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // the body: one battered block of render, its foot damp
  parts.push(dampFoot(batter(block(W, WALL, D, 0, 0, 0, RENDER, rng, 0.02), 0, WALL, 0.09, W / 2, D / 2), 0.45));
  // the parapet round the roof, set on the battered wall's top, and a merlon at each corner
  const tw = W - 0.18, td = D - 0.18;
  parts.push(block(tw, PARAPET, THICK, 0, WALL, td / 2 - THICK / 2, RENDER, rng));
  parts.push(block(tw, PARAPET, THICK, 0, WALL, -(td / 2 - THICK / 2), RENDER, rng));
  parts.push(block(THICK, PARAPET, td - 2 * THICK, tw / 2 - THICK / 2, WALL, 0, RENDER, rng));
  parts.push(block(THICK, PARAPET, td - 2 * THICK, -(tw / 2 - THICK / 2), WALL, 0, RENDER, rng));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(block(0.5, MERLON, 0.5, sx * (tw / 2 - 0.25), WALL + PARAPET, sz * (td / 2 - 0.25), RENDER, rng));
  }
  // the roof inside the parapet, a hand under its top
  parts.push(block(tw - 2 * THICK, 0.12, td - 2 * THICK, 0, WALL - 0.1, 0, RENDER, rng));
  // the door on the road side: dark and unglazed, a timber lintel over it, a worn sill before it
  const front = D / 2 - 0.09 * 0.25; // (the battered face at a quarter of the wall's height)
  parts.push(block(1.0, 2.0, 0.04, 0, 0.12, front + 0.01, OPENING, rng, 0));
  parts.push(block(1.45, 0.16, 0.22, 0, 2.12, front + 0.04, TIMBER, rng, 0.08));
  parts.push(block(1.5, 0.12, 0.6, 0, 0, front + 0.25, DAMP, rng, 0.03));
  // a small window in each side wall, high, under its own lintel
  const side = W / 2 - 0.09 * 0.65;
  for (const sx of [-1, 1]) {
    parts.push(block(0.04, 0.55, 0.45, sx * (side + 0.01), 1.65, 0.6, OPENING, rng, 0));
    parts.push(block(0.2, 0.12, 0.75, sx * (side + 0.03), 2.22, 0.6, TIMBER, rng, 0.08));
  }
  // two rain spouts through the back parapet's foot
  for (const x of [-1.1, 1.1]) parts.push(block(0.12, 0.12, 0.55, x, WALL + 0.04, -(td / 2 + 0.12), TIMBER, rng, 0.1));
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
 * wadiRumPosts.ts). */
export const STRUCTURE_VARIANTS = Object.freeze({ ksargate: KSAR_GATE_POST, sangar: DESERT_SANGAR, rumbarrack: RUM_BARRACK,
  rumpost: RUM_POST, rumshed: RUM_SHED, bedouintent: BEDOUIN_TENT, bedouincamp: BEDOUIN_CAMP_TENT });
