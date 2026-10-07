// src/world/maps/regional/ksarGate.ts — the ksar gate post (the scenery lane, b16; b25).
//
// Gauntlet wave 121 on Sirocco Wadi: "a modern prefab with blue glass windows" ("a jarring modern blue shed"). That was
// structureKit's steel checkpoint hut, standing at the two gates where the caravan road enters the ksar and among the
// map's scattered huts; Redrock's outposts had the same hut. A gate on these roads is a ksar's or a desert post's own
// building: a block of mud brick under a thick render of mud and straw, its walls battered, a parapet round its flat
// roof with a merlon at each corner, rain spouts of timber through the parapet, a door and two small windows each under
// a timber lintel.
//
// (b25; waves 173 and 174: "carved, pharaonic-looking glyphs" on the ksar wall; "a flat, unweathered decal with straight
// crowns and a hard ground line") It drew the map's regional plaster, whose print embosses rows of block motifs, the
// door and the windows only its darker vertex colours. Now its walls are the desert mud walls' own render (props.ts
// fieldMudBuilding: the walls' worn render with its losses over the courses of sun-dried bricks in world space, the
// rain's streaks, a damp foot; their crown slump off, a building's walls not a wall's), and its door, shutters,
// lintels and spouts are timber (the props' wood): two materials by the geometry's groups (KSAR_GATE_MATS). Its
// crowns are bitten and rounded by the rain, its foot settles into an apron of the mud washed off it, its door stands
// recessed between mud jambs.
//
// A map adopts it in place of the checkpoint hut by name (props structureVariants: { checkpointhut: 'ksargate' }): the
// gate beats keep their key, footprint and ground fit, and only the build changes. Vertex colours stay for a map
// without the mud print (the baked material reads them). Pure geometry: no DOM, no materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIELD_MUD_PLAIN_V } from '../../fieldMudSurface.ts';
import { ADOBE_UV_PER_M } from '../inhabitKit.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from '../structureKit.ts';

type Rng = () => number;

/** The materials a gate post draws, by its geometry's groups: 0 the mud walls' render, 1 the timber. */
export const KSAR_GATE_MATS = Object.freeze(['fieldMudBuilding', 'wood'] as const);
/** The colours the render, its damp foot and the timber carry for the baked fallback (the mud and wood ignore them). */
const RENDER: readonly [number, number, number] = [1.0, 0.97, 0.93];
const DAMP: readonly [number, number, number] = [0.8, 0.74, 0.68];
const TIMBER: readonly [number, number, number] = [0.42, 0.31, 0.21];
/** The timber's print: a tile every 1.2 m along the grain. */
const WOOD_UV_PER_M = 1 / 1.2;

/** A box of the given size (centred, its base at y0) in world-scaled uv (`uvPerM`), all one colour. */
function block(w: number, h: number, d: number, x: number, y0: number, z: number,
  colour: readonly [number, number, number], rng: Rng, uvPerM = ADOBE_UV_PER_M, shade = 0.04): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    // (each face's print by its own extent: a wall's along its run and up, the roof's across)
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const su = ax > 0.5 ? d : w, sv = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * su * uvPerM + x * 0.37, uv.getY(i) * sv * uvPerM + z * 0.29);
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
/** A piece of timber: a block on the wood print, the grain along its longest side. */
function timber(w: number, h: number, d: number, x: number, y0: number, z: number, rng: Rng): THREE.BufferGeometry {
  return block(w, h, d, x, y0, z, TIMBER, rng, WOOD_UV_PER_M, 0.08);
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

/**
 * A run of the parapet `len` long along x (rotated to z by `alongZ`), `segs` segments, its crown worn: bitten down in
 * one or two places by up to `bite` (the rain's notches, a third of a metre to a metre long), wandering a few centimetres
 * off level along its length, its upper arrises drawn in (rounded by the weather).
 */
function wornRun(len: number, h: number, thick: number, segs: number, bite: number, rng: Rng): THREE.BufferGeometry {
  const at = [rng() * 0.8 + 0.1, rng() < 0.55 ? rng() * 0.8 + 0.1 : -9], depth = [bite * (0.5 + rng() * 0.5), bite * (0.3 + rng() * 0.4)];
  const ph = [rng() * 6.28, rng() * 6.28];
  // the crown's height lost at a share t along the run: the bites (a third of a metre to a metre long, round-bottomed)
  // and a slow wander of a few centimetres, one smooth line along the whole run
  const crown = (t: number) => {
    let drop = 0;
    for (let k = 0; k < 2; k++) { const u = Math.max(0, 1 - Math.abs(t - at[k]) / 0.13); drop = Math.max(drop, depth[k] * u * u * (3 - 2 * u)); }
    return drop + 0.025 * (1 + Math.sin(t * 9.1 + ph[0]) * Math.sin(t * 4.3 + ph[1]));
  };
  // one strip of `segs` columns: its two faces, its rounded top (the upper arrises drawn in), its two ends
  const pos: number[] = [], uv: number[] = [];
  const hz = thick / 2, top = hz * 0.68;
  const quad = (a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[]) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d); uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  };
  const u = ADOBE_UV_PER_M;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs, x0 = -len / 2 + len * t0, x1 = -len / 2 + len * t1;
    const y0 = h - crown(t0), y1 = h - crown(t1);
    // the front (+z) and the back faces, wound outward
    quad([x0, 0, hz], [x1, 0, hz], [x1, y1, top], [x0, y0, top], [x0 * u, 0], [x1 * u, 0], [x1 * u, y1 * u], [x0 * u, y0 * u]);
    quad([x1, 0, -hz], [x0, 0, -hz], [x0, y0, -top], [x1, y1, -top], [x1 * u, 0], [x0 * u, 0], [x0 * u, y0 * u], [x1 * u, y1 * u]);
    // the top
    quad([x0, y0, top], [x1, y1, top], [x1, y1, -top], [x0, y0, -top], [x0 * u, 0.3], [x1 * u, 0.3], [x1 * u, 0.3 + thick * u], [x0 * u, 0.3 + thick * u]);
  }
  // the ends
  const yA = h - crown(0), yB = h - crown(1), xA = -len / 2, xB = len / 2;
  quad([xA, 0, -hz], [xA, 0, hz], [xA, yA, top], [xA, yA, -top], [0, 0], [thick * u, 0], [thick * u, yA * u], [0, yA * u]);
  quad([xB, 0, hz], [xB, 0, -hz], [xB, yB, -top], [xB, yB, top], [0, 0], [thick * u, 0], [thick * u, yB * u], [0, yB * u]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const colours = new Float32Array(pos.length);
  for (let i = 0; i < colours.length; i += 3) { colours[i] = RENDER[0]; colours[i + 1] = RENDER[1]; colours[i + 2] = RENDER[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/**
 * The apron at the foot: the mud the rain has washed off the walls, banked against them and spread a hand to a forearm
 * out, from the face (a hand up it) down under the ground at its ragged edge, on the print's plain band (no wall face
 * reads it). Round the body's foot (half extents hw x hd), out by `outX` on the sides and `outZ` front and back.
 */
function apron(hw: number, hd: number, outX: number, outZ: number, rng: Rng): THREE.BufferGeometry {
  const steps = 28, rows = 3, positions: number[] = [], uvs: number[] = [], index: number[] = [];
  const vMid = (FIELD_MUD_PLAIN_V[0] + FIELD_MUD_PLAIN_V[1]) / 2;
  const phase = [rng() * 6.28, rng() * 6.28];
  for (let k = 0; k < steps; k++) {
    // round the rectangle's perimeter
    const t = k / steps, per = 2 * (2 * hw + 2 * hd);
    let s = t * per, x: number, z: number, nx: number, nz: number;
    if (s < 2 * hw) { x = -hw + s; z = hd; nx = 0; nz = 1; }
    else if ((s -= 2 * hw) < 2 * hd) { x = hw; z = hd - s; nx = 1; nz = 0; }
    else if ((s -= 2 * hd) < 2 * hw) { x = hw - s; z = -hd; nx = 0; nz = -1; }
    else { s -= 2 * hw; x = -hw; z = -hd + s; nx = -1; nz = 0; }
    const out = (nx !== 0 ? outX : outZ) * (0.7 + 0.3 * Math.sin(t * 6.28 * 5 + phase[0]) * Math.sin(t * 6.28 * 3 + phase[1]));
    const ring: ReadonlyArray<readonly [number, number]> = [[-0.02, 0.1], [out * 0.45, 0.04], [out, -0.06]];
    for (let r = 0; r < rows; r++) {
      const [o, y] = ring[r];
      positions.push(x + nx * o, y, z + nz * o);
      uvs.push(t * per * ADOBE_UV_PER_M, vMid + (r - 1) * 0.02);
    }
  }
  for (let k = 0; k < steps; k++) for (let r = 0; r < rows - 1; r++) {
    const a = k * rows + r, b = ((k + 1) % steps) * rows + r;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  const ng = g.toNonIndexed();
  g.dispose();
  ng.computeVertexNormals();
  const colours = new Float32Array(ng.attributes.position.count * 3);
  for (let i = 0; i < colours.length; i += 3) { colours[i] = DAMP[0]; colours[i + 1] = DAMP[1]; colours[i + 2] = DAMP[2]; }
  ng.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return ng;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('ksarGate: merge produced no geometry');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
/** The mud's parts and the timber's merged into one geometry, a group each (KSAR_GATE_MATS). */
function mergeGroups(mud: THREE.BufferGeometry[], wood: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries([merge(mud), merge(wood)], true);
  if (!merged) throw new Error('ksarGate: merge produced no geometry');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** The gate post's measures (m): its body, its parapet, its corner merlons. */
const W = 4.2, D = 5.4, WALL = 2.75, PARAPET = 0.4, MERLON = 0.15, THICK = 0.32;

/**
 * The gate post standing: its door on +z (the road side, where the steel hut had its porch), a shuttered window in
 * each side wall, the parapet's worn merlons at the corners, two rain spouts on the back, the apron round its foot.
 * About 4.2 x 5.4 m, 3.3 m to the merlons' tops: inside the checkpoint hut's footprint (2.4 x 3.7 half extents, 3.3 m),
 * whose key and ground fit it keeps.
 */
export function buildKsarGatePost(rng: Rng): THREE.BufferGeometry {
  const mud: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
  // the body: one battered block of render, its foot damp, and the apron of washed-off mud round it
  mud.push(dampFoot(batter(block(W, WALL, D, 0, 0, 0, RENDER, rng, ADOBE_UV_PER_M, 0.02), 0, WALL, 0.09, W / 2, D / 2), 0.45));
  mud.push(apron(W / 2, D / 2, 0.16, 0.32, rng));
  // the parapet round the roof, set on the battered wall's top, its crown worn; a merlon at each corner, rounded
  const tw = W - 0.18, td = D - 0.18;
  for (const sz of [-1, 1]) mud.push(wornRun(tw, PARAPET, THICK, 10, 0.2, rng).translate(0, WALL, sz * (td / 2 - THICK / 2)));
  for (const sx of [-1, 1]) mud.push(wornRun(td - 2 * THICK, PARAPET, THICK, 10, 0.2, rng).rotateY(Math.PI / 2).translate(sx * (tw / 2 - THICK / 2), WALL, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const m = block(0.46, MERLON + 0.04, 0.46, 0, 0, 0, RENDER, rng);
    const mp = m.attributes.position as THREE.BufferAttribute, drop = rng() * 0.07;
    for (let v = 0; v < mp.count; v++) if (mp.getY(v) > MERLON) mp.setXYZ(v, mp.getX(v) * 0.7, MERLON + 0.04 - drop, mp.getZ(v) * 0.7);
    m.computeVertexNormals();
    mud.push(m.translate(sx * (tw / 2 - 0.25), WALL + PARAPET - 0.04, sz * (td / 2 - 0.25)));
  }
  // the roof inside the parapet, a hand under its top
  mud.push(block(tw - 2 * THICK, 0.12, td - 2 * THICK, 0, WALL - 0.1, 0, RENDER, rng));
  // the door on the road side, recessed between mud jambs under a timber lintel, a worn sill before it
  const front = D / 2 - 0.09 * 0.25; // (the battered face at a quarter of the wall's height)
  for (const sx of [-1, 1]) mud.push(block(0.24, 2.12, 0.14, sx * 0.62, 0, front + 0.06, RENDER, rng));
  wood.push(timber(1.0, 2.0, 0.06, 0, 0.12, front + 0.02, rng));
  wood.push(timber(1.62, 0.18, 0.3, 0, 2.12, front + 0.08, rng));
  mud.push(block(1.5, 0.12, 0.6, 0, 0, front + 0.25, DAMP, rng));
  // a small shuttered window in each side wall, high, under its own lintel
  const side = W / 2 - 0.09 * 0.65;
  for (const sx of [-1, 1]) {
    wood.push(timber(0.06, 0.55, 0.45, sx * (side + 0.02), 1.65, 0.6, rng));
    wood.push(timber(0.22, 0.12, 0.78, sx * (side + 0.04), 2.22, 0.6, rng));
  }
  // two rain spouts through the back parapet's foot
  for (const x of [-1.1, 1.1]) wood.push(timber(0.12, 0.12, 0.55, x, WALL + 0.04, -(td / 2 + 0.12), rng));
  return mergeGroups(mud, wood);
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
    const b = block(s, s * (0.5 + rng() * 0.4), s * (0.7 + rng() * 0.5), 0, 0, 0, i % 4 === 0 ? DAMP : RENDER, rng, ADOBE_UV_PER_M, 0.06);
    b.rotateX((rng() - 0.5) * 0.9); b.rotateY(rng() * Math.PI); b.rotateZ((rng() - 0.5) * 0.9);
    b.translate(x, y - 0.08, z);
    parts.push(b);
  }
  // the low mound of the rest under the blocks: three slumped, turned slabs, not a platform
  for (const [x, z, w, d, h, a] of [[-0.3, -0.4, 3.0, 3.4, 0.32, 0.25], [0.5, 0.7, 2.4, 2.6, 0.24, -0.4], [-0.6, 1.2, 1.8, 1.6, 0.18, 0.9]] as const) {
    const slab = block(w, h, d, 0, 0, 0, DAMP, rng, ADOBE_UV_PER_M, 0.03);
    const sp = slab.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) > 0.01) sp.setXYZ(i, sp.getX(i) * 0.72, sp.getY(i), sp.getZ(i) * 0.72); // slumped: its top drawn in
    slab.computeVertexNormals();
    slab.rotateY(a);
    parts.push(slab.translate(x, -0.1, z));
  }
  // the door's lintel, thrown down
  const lintel = timber(1.45, 0.16, 0.22, 0, 0, 0, rng);
  lintel.rotateY(0.6); lintel.rotateZ(0.12);
  return mergeGroups(parts, [lintel.translate(0.6, 0.42, D / 2 - 1.0)]);
}

/** The watch hut's measures (m): its body, its parapet. */
const HW = 3.1, HD = 2.9, HWALL = 3.05, HPARAPET = 0.42, HTHICK = 0.3;

/**
 * The ksar watch hut (b25; waves 173 and 174: "the corrugated-metal shed is the wrong building type for ksour country"),
 * in place of structureKit's steel guard post on its stilts: the small mud-brick borj a ksar's fields and its tracks
 * are watched from — a battered block of render a storey and a half high, a parapet round its roof terrace bitten by
 * the rain, the ends of the palm-trunk joists that carry the roof standing out of two faces under it, a timber door, a
 * slit window high on each side, a ladder of timber leaning to the terrace, two rain spouts, an apron of the mud
 * washed off it. Inside the guard post's footprint (2.02 x 1.98 half extents, 4.1 m) on its key; the mud render and
 * the timber by the geometry's groups, as the gate post's (KSAR_GATE_MATS).
 */
export function buildKsarWatchHut(rng: Rng): THREE.BufferGeometry {
  const mud: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
  mud.push(dampFoot(batter(block(HW, HWALL, HD, 0, 0, 0, RENDER, rng, ADOBE_UV_PER_M, 0.02), 0, HWALL, 0.1, HW / 2, HD / 2), 0.45));
  mud.push(apron(HW / 2, HD / 2, 0.16, 0.16, rng));
  const tw = HW - 0.2, td = HD - 0.2;
  for (const sz of [-1, 1]) mud.push(wornRun(tw, HPARAPET, HTHICK, 8, 0.2, rng).translate(0, HWALL, sz * (td / 2 - HTHICK / 2)));
  for (const sx of [-1, 1]) mud.push(wornRun(td - 2 * HTHICK, HPARAPET, HTHICK, 7, 0.2, rng).rotateY(Math.PI / 2).translate(sx * (tw / 2 - HTHICK / 2), HWALL, 0));
  mud.push(block(tw - 2 * HTHICK, 0.12, td - 2 * HTHICK, 0, HWALL - 0.1, 0, RENDER, rng));
  // the palm-trunk joists' ends out of the front and back faces, a hand under the roof
  for (const sz of [-1, 1]) for (let k = 0; k < 4; k++) {
    const x = -tw / 2 + 0.4 + k * ((tw - 0.8) / 3) + (rng() - 0.5) * 0.08;
    wood.push(timber(0.13, 0.13, 0.24, x, HWALL - 0.42 + (rng() - 0.5) * 0.04, sz * (HD / 2 - 0.1 * 0.8 + 0.08), rng));
  }
  // the door on the front, recessed between mud jambs under its lintel; a worn sill
  const front = HD / 2 - 0.1 * 0.25;
  for (const sx of [-1, 1]) mud.push(block(0.2, 1.96, 0.12, sx * 0.52, 0, front + 0.05, RENDER, rng));
  wood.push(timber(0.84, 1.86, 0.06, 0, 0.1, front + 0.02, rng));
  wood.push(timber(1.36, 0.16, 0.26, 0, 1.96, front + 0.07, rng));
  mud.push(block(1.2, 0.1, 0.45, 0, 0, front + 0.2, DAMP, rng));
  // a slit window high in each side wall, a timber lintel over it
  const side = HW / 2 - 0.1 * 0.7;
  for (const sx of [-1, 1]) {
    wood.push(timber(0.05, 0.5, 0.14, sx * (side + 0.02), 2.0, -0.2, rng));
    wood.push(timber(0.2, 0.1, 0.42, sx * (side + 0.04), 2.52, -0.2, rng));
  }
  // the ladder to the terrace, leaning on the right side wall: two stiles and five rungs
  const ladder: THREE.BufferGeometry[] = [];
  for (const dz of [-0.24, 0.24]) ladder.push(timber(0.08, 3.5, 0.08, 0, 0, dz, rng));
  for (let k = 0; k < 5; k++) ladder.push(timber(0.06, 0.06, 0.5, 0, 0.4 + k * 0.62, 0, rng));
  const lad = merge(ladder);
  lad.rotateZ(0.12); // (its foot out from the wall, its top resting on the parapet's face)
  wood.push(lad.translate(HW / 2 + 0.38, 0.0, 0.5));
  // two rain spouts through the back parapet's foot
  for (const x of [-0.8, 0.8]) wood.push(timber(0.11, 0.11, 0.5, x, HWALL + 0.04, -(td / 2 + 0.12), rng));
  return mergeGroups(mud, wood);
}

/** The watch hut fallen: a heap of render and brick round one standing corner, joists and the ladder thrown down. */
export function buildKsarWatchHutBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
  parts.push(dampFoot(block(1.2, 1.9, HTHICK + 0.1, -HW / 2 + 0.6, 0, -HD / 2 + 0.25, RENDER, rng), 0.45));
  parts.push(dampFoot(block(HTHICK + 0.1, 1.4, 1.2, -HW / 2 + 0.25, 0, -HD / 2 + 0.85, RENDER, rng), 0.45));
  for (let i = 0; i < 9; i++) {
    const sz = 0.4 + rng() * 0.5, x = (rng() - 0.5) * (HW - 0.8), z = (rng() - 0.5) * (HD - 0.8);
    const y = Math.max(0, 0.5 - Math.hypot(x / HW, z / HD) * 1.1) * rng();
    const b = block(sz, sz * (0.5 + rng() * 0.4), sz * (0.7 + rng() * 0.5), 0, 0, 0, i % 3 === 0 ? DAMP : RENDER, rng, ADOBE_UV_PER_M, 0.06);
    b.rotateX((rng() - 0.5) * 0.9); b.rotateY(rng() * Math.PI); b.rotateZ((rng() - 0.5) * 0.9);
    parts.push(b.translate(x, y - 0.08, z));
  }
  for (const [x, z, w, d, h, a] of [[-0.2, -0.2, 2.4, 2.2, 0.3, 0.3], [0.4, 0.5, 1.8, 1.6, 0.2, -0.5]] as const) {
    const slab = block(w, h, d, 0, 0, 0, DAMP, rng, ADOBE_UV_PER_M, 0.03);
    const sp = slab.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) if (sp.getY(i) > 0.01) sp.setXYZ(i, sp.getX(i) * 0.72, sp.getY(i), sp.getZ(i) * 0.72);
    slab.computeVertexNormals();
    slab.rotateY(a);
    parts.push(slab.translate(x, -0.1, z));
  }
  for (let k = 0; k < 3; k++) {
    const j = timber(0.13, 0.13, 1.6, 0, 0, 0, rng);
    j.rotateY(rng() * Math.PI); j.rotateZ((rng() - 0.5) * 0.3);
    wood.push(j.translate((rng() - 0.5) * 1.6, 0.35 + rng() * 0.2, (rng() - 0.5) * 1.4));
  }
  return mergeGroups(parts, wood);
}

function mulberry32(a: number): Rng {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** The hut it stands in for. */
const HUT = DESTRUCTIBLE_BUILDING_TYPES.checkpointhut;

/**
 * The ksar gate post's destructible kind: the checkpoint hut's class, crush threshold and resistance (structureKit
 * lightMeta: keep 0.84, crushMin 4.5), a collider over its own footprint, the mud and the timber. Its builds take
 * the hut's own draws from the props' destructible geometry stream and discard them (that one stream shapes every
 * pool, so every pool built after this one keeps its shape) and draw the post from a seed of its own.
 */
export const KSAR_GATE_POST = Object.freeze({
  cls: 'break' as const,
  // (b25: the desert mud walls' render and the timber by the geometry's groups; no instance tint: the render's losses
  // in world space vary every post, and the walls' program carries no instance colour)
  mat: 'fieldMudBuilding',
  mats: KSAR_GATE_MATS,
  contact: 'ob' as const,
  collider: true as const,
  hw: 2.15,
  hl: 2.75,
  r: Math.hypot(2.15, 2.75),
  h: 3.3,
  keep: 0.84,
  crushMin: 4.5,
  build: (rng: Rng) => { HUT.build(rng).dispose(); return buildKsarGatePost(mulberry32(0x6a7e5)); },
  broken: (rng: Rng) => { HUT.broken(rng).dispose(); return buildKsarGatePostBroken(mulberry32(0x6a7e6)); },
});

/** The guard post it stands in for. */
const GUARD = DESTRUCTIBLE_BUILDING_TYPES.guardpost;

/**
 * The ksar watch hut's destructible kind (b25): the guard post's class, crush threshold and resistance, a collider over
 * its own footprint, the mud and the timber. Its builds spend the guard post's own draws from the props' destructible
 * geometry stream (every later pool keeps its shape) and draw the hut from a seed of its own.
 */
export const KSAR_WATCH_HUT = Object.freeze({
  cls: 'break' as const,
  mat: 'fieldMudBuilding',
  mats: KSAR_GATE_MATS,
  contact: 'ob' as const,
  collider: true as const,
  hw: 1.62,
  hl: 1.55,
  r: Math.hypot(1.62, 1.55),
  h: 3.5,
  keep: 0.84,
  crushMin: 4.5,
  build: (rng: Rng) => { GUARD.build(rng).dispose(); return buildKsarWatchHut(mulberry32(0x6a7e7)); },
  broken: (rng: Rng) => { GUARD.broken(rng).dispose(); return buildKsarWatchHutBroken(mulberry32(0x6a7e8)); },
});

/** The structure variants a map may name in place of a generic kind (props structureVariants). */
export const STRUCTURE_VARIANTS = Object.freeze({ ksargate: KSAR_GATE_POST, ksarwatchhut: KSAR_WATCH_HUT });
