// src/world/maps/archedStoneBridge.ts — the river bridges the dressing kits build on the decks terrain.ts resolves
// (round 61), and the ruined crossing of a river without one: extracted from mapKits.ts (Lane C, #27, 2026-10-15) so
// the bridges family has its own file; the output is unchanged.
//
// Authored by Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, jitterUV, scaleUV, slabBox } from '../propGeometry.ts';
import { cloneCollisionRecord, setCompoundShape, type SimpleCollisionShape } from '../collision.ts';
import type { DressingBuckets, DressingHeightField, FocusedDressingContext, LayoutDisc, Rng } from './mapKits.ts';

/** Round 61: the deck plane the river kit builds its arched bridge on (terrain.ts BridgeDeckPlane). */
export interface DressingBridgeDeck {
  x: number;
  z: number;
  ux: number;
  uz: number;
  halfLength: number;
  halfWidth: number;
  deckY: number;
  bedY: number;
  waterY: number;
  route: number;
}

/**
 * (#27, 2026-10-15) The ruined crossing's pieces are a reinforced-concrete bridge's (the Delta: a 1930s RCC road bridge
 * blown in the war): built in the abutment's own frame — u along the road, away from the river, y up from the bank,
 * v across the road — and placed on the bank. Concrete in the plaster bucket, the rebar in the dark one.
 */
interface RuinFrame { x: number; y: number; z: number; cos: number; sin: number; side: number }
function ruinFrame(centerX: number, centerZ: number, cross: number, halfSpan: number, side: number, heightField: DressingHeightField): RuinFrame {
  const x = centerX + Math.cos(cross) * halfSpan * side, z = centerZ + Math.sin(cross) * halfSpan * side;
  return { x, y: heightField.getHeightAt(x, z), z, cos: Math.cos(cross), sin: Math.sin(cross), side };
}
/** A geometry built in the frame's (u, y, v) placed on the bank: u runs from the river toward the bank on either side. */
function placeRuin(g: THREE.BufferGeometry, f: RuinFrame): THREE.BufferGeometry {
  // local x = u (mirrored by the side, so +u leaves the river on both banks), local z = v; then the road's heading
  if (f.side < 0) { g.scale(-1, 1, 1); flipWinding(g); }
  g.rotateY(-Math.atan2(f.sin, f.cos));
  return g.translate(f.x, f.y, f.z);
}
function flipWinding(g: THREE.BufferGeometry): void {
  const idx = g.index;
  if (idx) { for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); } idx.needsUpdate = true; }
  else {
    for (const name of Object.keys(g.attributes)) {
      const a = g.getAttribute(name) as THREE.BufferAttribute, n = a.itemSize;
      for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) { const t = a.getComponent(i + 1, k); a.setComponent(i + 1, k, a.getComponent(i + 2, k)); a.setComponent(i + 2, k, t); }
      a.needsUpdate = true;
    }
  }
  const nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (nor) { for (let i = 0; i < nor.count; i++) nor.setX(i, -nor.getX(i)); nor.needsUpdate = true; }
}
/** A box from its extents in the ruin frame. */
function ruinBox(u0: number, u1: number, y0: number, y1: number, v0: number, v1: number): THREE.BufferGeometry {
  const g = box(u1 - u0, y1 - y0, v1 - v0, 0.6);
  return g.translate((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2);
}
/** Rebar run out of a broken concrete face at u = u0 toward -u: `n` bars across [v0, v1] at height y, each bent down. */
function rebar(u0: number, y: number, v0: number, v1: number, n: number, r: () => number): THREE.BufferGeometry[] {
  const bars: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const v = v0 + ((k + 0.5) / n) * (v1 - v0), len = 0.45 + r() * 0.75, droop = 0.15 + r() * 0.6;
    const bar = box(len, 0.035, 0.035, 1);
    bar.translate(-len / 2, 0, 0);
    bar.rotateZ(droop);
    bar.translate(u0, y + (r() - 0.5) * 0.08, v + (r() - 0.5) * 0.1);
    bars.push(bar);
  }
  return bars;
}

function addBridgeAbutment(
  side: number,
  centerX: number,
  centerZ: number,
  cross: number,
  halfSpan: number,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const f = ruinFrame(centerX, centerZ, cross, halfSpan, side, heightField);
  const r = localRng(Math.round(f.x * 11 + f.z * 5));
  const seat = 3.0, half = 3.6;
  const concrete = (g: THREE.BufferGeometry, mapStream = false) => buckets.plaster.push(placeRuin(jitterUV(g, mapStream ? rng : r), f));
  // the breast wall facing the river on its footing, the ballast wall behind the bearing shelf (the map's stream: the
  // four draws a piece the round-1 abutment's four pieces took)
  concrete(ruinBox(-0.5, 0.5, -1.2, seat, -half, half), true);
  concrete(ruinBox(0.5, 1.0, -0.8, seat + 0.6, -half, half), true);
  concrete(ruinBox(-1.2, 1.4, -1.4, -0.5, -half - 0.4, half + 0.4));
  // the wing walls splayed back into the bank, their tops falling with it
  for (const sv of [-1, 1]) {
    const a = sv * 0.6, len = 4.6, t = 0.5;
    const ca = Math.cos(a), sa = Math.sin(a);
    const p0: [number, number] = [0.3, sv * half], p1: [number, number] = [0.3 + len * ca, sv * half + len * sa];
    const n: [number, number] = [-sa * t * sv, ca * t * sv];
    const poly: [number, number][] = sv > 0 ? [p0, p1, [p1[0] + n[0], p1[1] + n[1]], [p0[0] + n[0], p0[1] + n[1]]]
      : [p0, [p0[0] + n[0], p0[1] + n[1]], [p1[0] + n[0], p1[1] + n[1]], p1];
    const wing = prism(poly.map(([u, v]) => [u, v] as const), -1.0, sv > 0 ? [seat + 0.6, 0.9, 0.9, seat + 0.6] : [seat + 0.6, seat + 0.6, 0.9, 0.9]);
    concrete(wing, true);
  }
  // the broken T-beam deck's stub on the shelf: its slab and three ribs run out over the river and end ragged, the
  // rebar standing out of the broken faces, the end sagging where it tore
  const deckTop = seat + 0.62, sag = 0.07;
  const stub: THREE.BufferGeometry[] = [];
  stub.push(ruinBox(-2.9, 0.55, deckTop - 0.22, deckTop, -3.3, -0.2), ruinBox(-2.2, 0.55, deckTop - 0.22, deckTop, -0.2, 1.4), ruinBox(-3.4, 0.55, deckTop - 0.22, deckTop, 1.4, 3.3));
  const ribEnds = [-2.6, -2.0, -3.1];
  [-2.4, 0, 2.4].forEach((v, k) => stub.push(ruinBox(ribEnds[k], 0.55, deckTop - 0.82, deckTop - 0.22, v - 0.18, v + 0.18)));
  // the kerbs and a stump of the railing posts on the stub
  for (const sv of [-1, 1]) {
    stub.push(ruinBox(sv > 0 ? -3.4 : -2.9, 0.55, deckTop, deckTop + 0.25, sv * 3.3 - (sv > 0 ? 0.3 : 0), sv * 3.3 + (sv > 0 ? 0 : 0.3)));
    for (const u of [-1.8, 0.2]) stub.push(ruinBox(u - 0.12, u + 0.12, deckTop + 0.25, deckTop + 1.05, sv * 3.15 - 0.12, sv * 3.15 + 0.12));
  }
  for (const g of stub) { g.translate(-0.55, 0, 0).rotateZ(sag).translate(0.55, 0, 0); concrete(g); }
  const bars = [...rebar(-2.9, deckTop - 0.1, -3.2, -0.3, 6, r), ...rebar(-2.2, deckTop - 0.1, -0.1, 1.3, 3, r), ...rebar(-3.4, deckTop - 0.1, 1.5, 3.2, 4, r),
    ...ribEnds.flatMap((u, k) => rebar(u, deckTop - 0.7, [-2.4, 0, 2.4][k] - 0.12, [-2.4, 0, 2.4][k] + 0.12, 2, r))];
  for (const g of bars) { g.translate(-0.55, 0, 0).rotateZ(sag).translate(0.55, 0, 0); buckets.dark.push(placeRuin(g, f)); }
}

function addFallenBridgeSlabs(
  centerX: number,
  centerZ: number,
  cross: number,
  halfSpan: number,
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  // the dropped spans: T-beam deck lengths lying in the river where they fell, tipped on their ribs, the rebar out of
  // their broken ends (the map's stream draws as the round-1 slabs: place, size, turn, tip and the slab's UV jitter)
  const r = localRng(Math.round(centerX * 7 + centerZ * 3));
  for (let k = 0; k < 5; k++) {
    const offset = (rng() - 0.5) * halfSpan * 1.2;
    const x = centerX + Math.cos(cross) * offset;
    const z = centerZ + Math.sin(cross) * offset;
    const L = 2.2 + rng() * 1.6, W = 2.6 + rng() * 1.0;
    const turn = -cross + (rng() - 0.5) * 0.8, tip = (rng() - 0.5) * 0.5;
    const y = heightField.getHeightAt(x, z) + 0.3;
    const place = (g: THREE.BufferGeometry) => g.rotateZ(tip).rotateY(turn).translate(x, y, z);
    const slab = box(L, 0.22, W, 0.7);
    slab.translate(0, 0.35, 0);
    buckets.plaster.push(place(jitterUV(slab, rng)));
    // its ribs under it (one or two, broken shorter than the slab), and the rebar out of both broken ends
    const ribs = W > 3.1 ? [-W / 4, W / 4] : [0];
    for (const v of ribs) {
      const cut = r() * 0.5;
      const rib = box(L - cut, 0.5, 0.34, 0.7);
      rib.translate(-cut / 2, 0.0, v);
      buckets.plaster.push(place(jitterUV(rib, r)));
    }
    for (const end of [-1, 1]) {
      for (const bar of rebar(0, 0.38, -W / 2 + 0.2, W / 2 - 0.2, 4, r)) {
        if (end > 0) bar.rotateY(Math.PI);
        bar.translate(end * L / 2, 0, 0);
        buckets.dark.push(place(bar));
      }
    }
  }
}

export function addRuinedRiverBridge(
  links: readonly LayoutDisc[],
  heightField: DressingHeightField,
  rng: Rng,
  buckets: DressingBuckets,
): void {
  const centerIndex = Math.floor(links.length * 0.4);
  const before = links[Math.max(0, centerIndex - 1)];
  const after = links[Math.min(links.length - 1, centerIndex + 1)];
  const centerX = links[centerIndex].x;
  const centerZ = links[centerIndex].z;
  const cross = Math.atan2(after.z - before.z, after.x - before.x) + Math.PI / 2;
  const halfSpan = links[centerIndex].r * 1.02;
  for (const side of [-1, 1]) {
    addBridgeAbutment(side, centerX, centerZ, cross, halfSpan, heightField, rng, buckets);
  }
  addFallenBridgeSlabs(centerX, centerZ, cross, halfSpan, heightField, rng, buckets);
}

/** The bridge's dressing: none over the round-61 body ('plain': Cliffbridge's gorge span, until its own pass), or a
 *  Norman river bridge's masonry ('norman': Amberford). */
export type BridgeMasonry = 'plain' | 'norman';

/** A local stream for the dressing's UV jitter (so the map's own stream keeps its place: the old pieces' draws only). */
export function localRng(seed: number): () => number {
  let a = (seed | 0) ^ 0x2f6b9d3;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A prism from a convex polygon (xz, either winding) between y0 and y1 (y1 may be a per-corner array: a sloping top),
 *  every face pointing out, its UVs metres x 0.7. Non-indexed. */
export function prism(input: readonly (readonly [number, number])[], y0: number, y1: number | readonly number[]): THREE.BufferGeometry {
  // either winding: the polygon is put in the order whose faces all point out (a positive area in x-z), the per-corner
  // tops following their corners
  let area = 0;
  for (let i = 0; i < input.length; i++) { const [ax, az] = input[i], [bx, bz] = input[(i + 1) % input.length]; area += ax * bz - bx * az; }
  const flip = area > 0;
  const poly = flip ? [...input].reverse() : input;
  const tops = typeof y1 === 'number' ? null : (flip ? [...y1].reverse() : y1);
  const n = poly.length, top = (i: number) => (tops ? tops[i] : (y1 as number));
  const pos: number[] = [], uv: number[] = [];
  const tri = (a: number[], b: number[], c: number[], u: number[][]) => { pos.push(...a, ...b, ...c); uv.push(...u[0], ...u[1], ...u[2]); };
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n];
    const l = Math.hypot(bx - ax, bz - az) * 0.7;
    const a0 = [ax, y0, az], b0 = [bx, y0, bz], a1 = [ax, top(i), az], b1 = [bx, top((i + 1) % n), bz];
    tri(a0, b0, b1, [[0, y0 * 0.7], [l, y0 * 0.7], [l, top((i + 1) % n) * 0.7]]);
    tri(a0, b1, a1, [[0, y0 * 0.7], [l, top((i + 1) % n) * 0.7], [0, top(i) * 0.7]]);
  }
  for (let i = 1; i + 1 < n; i++) {
    const [ax, az] = poly[0], [bx, bz] = poly[i], [qx, qz] = poly[i + 1];
    tri([ax, top(0), az], [bx, top(i), bz], [qx, top(i + 1), qz], [[ax * 0.7, az * 0.7], [bx * 0.7, bz * 0.7], [qx * 0.7, qz * 0.7]]);
    tri([ax, y0, az], [qx, y0, qz], [bx, y0, bz], [[ax * 0.7, az * 0.7], [qx * 0.7, qz * 0.7], [bx * 0.7, bz * 0.7]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Temporaries merged into one fresh geometry with the three streams the stone bucket keeps (each source disposed). */
export function mergeStone(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    const out = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) { const a = g.getAttribute(k); if (a) out.setAttribute(k, a); }
    return out;
  });
  const g = mergeGeometries(flat, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('archedStoneBridge: the masonry does not merge');
  return g;
}

/**
 * (#27, 2026-10-15) A Norman river bridge's masonry on the round-61 body, in its local frame (x along the road, y up, z
 * across, the body's faces at z = +-halfWidth): on both faces each arch's ring of voussoirs (dressed blocks a hand
 * proud of the spandrel, every other one longer, a keystone at the crown), the string course under the parapets, the
 * parapets' coping in lengths, each pier's pointed cutwater with its starling (the sloped cap) and the pilaster rising
 * from it to the string course. One geometry, the stone bucket's streams; no draws from the map's stream.
 */
function normanMasonry(b: {
  halfWidth: number; bodyHalf: number; parapetHalf: number; deckY: number; top: number; bottom: number; springY: number;
  centreY: number; radius: number; halfAngle: number; arcs: readonly number[]; piers: readonly number[]; seed: number;
  copings: boolean;
}): THREE.BufferGeometry {
  const r = localRng(b.seed), parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry) => { jitterUV(g, r); parts.push(g); };
  const RING = 0.55, PROUD = 0.07, BLOCK = 0.42;
  for (const face of [-1, 1]) {
    const zf = face * b.halfWidth;
    // the arch rings: odd counts so a keystone stands at the crown
    for (const ax of b.arcs) {
      const arc = 2 * b.halfAngle * b.radius;
      const n = Math.max(5, Math.round(arc / BLOCK) | 1);
      const step = (2 * b.halfAngle) / n;
      for (let k = 0; k < n; k++) {
        const a = Math.PI / 2 - b.halfAngle + (k + 0.5) * step, key = k === (n - 1) / 2;
        const depth = key ? RING * 1.35 : k % 2 ? RING * 0.82 : RING;
        const len = 2 * b.radius * Math.sin(step / 2) * 0.94;
        const v = box(len, depth, PROUD + (key ? 0.05 : 0), 0.7);
        v.translate(0, depth / 2, 0);
        v.rotateZ(a - Math.PI / 2);
        v.translate(ax + Math.cos(a) * b.radius, b.centreY + Math.sin(a) * b.radius, zf + face * (PROUD + (key ? 0.05 : 0)) / 2);
        add(v);
      }
    }
    // the string course under the parapet, the body's length
    const sc = box(b.bodyHalf * 2 + 0.3, 0.24, 0.14, 0.7);
    sc.translate(0, b.top - 0.14, zf + face * 0.05);
    add(sc);
    // the coping on the parapet in lengths (the parapet stands on the slab's edge, 0.5 m thick, 1.1 m tall)
    const copeLen = 1.45, nCope = b.copings ? Math.max(2, Math.round((b.parapetHalf * 2) / copeLen)) : 0;
    for (let k = 0; k < nCope; k++) {
      const x0 = -b.parapetHalf + (k * b.parapetHalf * 2) / nCope;
      const c = box((b.parapetHalf * 2) / nCope - 0.02, 0.14, 0.64, 0.7);
      c.translate(x0 + b.parapetHalf / nCope, b.deckY + BRIDGE_PARAPET_HEIGHT_M + 0.07, face * (b.halfWidth - BRIDGE_PARAPET_THICK_M / 2));
      add(c);
    }
    // the cutwaters: a pointed prism into the stream, its starling sloping back to the wall, the pilaster over it
    for (const px of b.piers) {
      const w = BRIDGE_PIER_M * 0.5, out = BRIDGE_PIER_M * 0.85, capTop = b.springY + 0.5;
      const poly: [number, number][] = face > 0
        ? [[px - w, zf], [px + w, zf], [px, zf + out]]
        : [[px + w, zf], [px - w, zf], [px, zf - out]];
      add(prism(poly, b.bottom, capTop));
      add(prism(poly, capTop, [capTop + 0.75, capTop + 0.75, capTop]));
      const pil = box(BRIDGE_PIER_M * 0.7, b.top - 0.26 - capTop - 0.6, 0.16, 0.7);
      pil.translate(px, (capTop + 0.6 + b.top - 0.26) / 2, zf + face * 0.08);
      add(pil);
    }
  }
  return mergeStone(parts);
}

/** The parapets' runs (#27): about six metres each. */
const PARAPET_RUN_M = 6;

/**
 * (#27, 2026-10-15) A bridge's parapets as structures of their own through the props' sink: each side in runs of about
 * six metres, each run its wall (coped in lengths on a Norman bridge) and, at the bridge's ends, its end post, built in
 * the run's frame (x along the road) and handed to `ctx.structure` with its place: it takes its own records and its
 * damage path, so a round's blow or a ram brings the run down as its own pieces while the deck stays.
 */
function addParapetRuns(ctx: FocusedDressingContext, cx: number, cz: number, ux: number, uz: number, halfWidth: number,
  deckY: number, parapetHalf: number, coped: boolean): void {
  if (!ctx.structure) return;
  const vx = -uz, vz = ux, rot = Math.atan2(-uz, ux), H = BRIDGE_PARAPET_HEIGHT_M, T = BRIDGE_PARAPET_THICK_M;
  const inset = halfWidth - T / 2, runs = Math.max(2, Math.round((parapetHalf * 2) / PARAPET_RUN_M)), L = (parapetHalf * 2) / runs;
  const r = localRng(Math.round(cx * 17 + cz * 23));
  for (const side of [-1, 1]) for (let k = 0; k < runs; k++) {
    const xm = -parapetHalf + (k + 0.5) * L;
    const stone: THREE.BufferGeometry[] = [];
    const wall = box(L - 0.02, H, T, 0.7);
    wall.translate(0, H / 2, 0);
    stone.push(jitterUV(wall, r));
    if (coped) {
      const n = Math.max(2, Math.round(L / 1.45));
      for (let j = 0; j < n; j++) {
        const c = box(L / n - 0.02, 0.14, T + 0.14, 0.7);
        c.translate(-L / 2 + (j + 0.5) * (L / n), H + 0.07, 0);
        stone.push(jitterUV(c, r));
      }
    }
    for (const end of [-1, 1]) {
      if ((end < 0 && k !== 0) || (end > 0 && k !== runs - 1)) continue;
      const post = box(0.8, H + 0.4, 0.8, 0.7);
      post.translate(end * L / 2, (H + 0.4) / 2, 0);
      stone.push(jitterUV(post, r));
    }
    ctx.structure('bridge-parapet', { stone }, cx + ux * xm + vx * inset * side, deckY, cz + uz * xm + vz * inset * side, rot);
  }
}

/** The map-stream draws the round-61 arched bridge on `deck` takes (its pieces' UV jitter: four a piece): a kit that
 *  builds another bridge on the deck burns as many, so everything the kit dresses after it keeps its place. */
export function archedBridgeDraws(deck: DressingBridgeDeck): number {
  const wetSpan = Math.max(4, (deck.halfLength - 3) * 2);
  const arches = Math.max(1, Math.round(wetSpan / (deck.halfLength > 60 ? 32 : 11)));
  return 4 * (12 + 2 * (arches - 1));
}

/** Align a box's width axis (local +x) with the world direction (dx, dz); local +z then points to (-dz, dx). */
export function alignWidth<T extends THREE.BufferGeometry>(geometry: T, dx: number, dz: number): T {
  geometry.rotateY(Math.atan2(-dz, dx));
  return geometry;
}

/** Round 61: the pier between two arches and the abutment past the last, the parapet and the deck slab (m). */
const BRIDGE_PIER_M = 2.0;
const BRIDGE_PARAPET_HEIGHT_M = 1.1;
const BRIDGE_PARAPET_THICK_M = 0.5;
const BRIDGE_SLAB_M = 0.5;
/** The body's bottom below the bed and its top under the slab; the spandrel fill over an arch crown. */
const BRIDGE_BODY_BELOW_BED_M = 0.6;
const BRIDGE_BODY_TOP_UNDER_DECK_M = 0.45;
const BRIDGE_SPANDREL_FILL_M = 0.55;
/** The pier face shown above the water surface before the arch springs. */
const BRIDGE_SPRING_OVER_WATER_M = 0.3;
/**
 * Round 63: the vault's collision bands (the building hitboxes' shell bands are 0.5 m; the arcs are finer). Round 67
 * (2026-09-24): halved — at 0.3 (four 0.275 m bands over the 1.1 m rise) a shell within a band's height of the arc
 * could meet stone the eye sees through or pass a sliver of it; eight 0.1375 m bands halve that — every haunch edge
 * lies ON the arc at its band's middle height, so a shell's height error against the arc is at most half a band,
 * 6.9 cm (13 cm before). The deck part, the abutments, the piers and the parapets are the parts they were.
 */
const BRIDGE_VAULT_BAND_M = 0.15;

/**
 * Round 61 (2026-09-24): the arched stone bridge on the deck plane terrain.ts resolved — the water flows under it.
 * The body is ONE extruded elevation profile through the full deck width: the spandrel walls with N segmental arches
 * (the chord from the wet span, the rise from the headroom the deck leaves over the spring line) whose vault soffits are
 * the extrusion's inner walls, so the openings are arcs, not recesses, and the sheet runs through them. Piers carry
 * cutwaters turned into the stream, the abutments stand on the banks past the wet reach with splayed wing walls, the
 * deck slab lies level at deckY (flush with the graded approaches) and the parapets ride on it. The collision record
 * the ride stands on is a compound whose parts follow the geometry (round 63, 2026-09-24 — it was one solid body
 * from the footing to the deck, an invisible wall across every arch): the deck from the crown line up, the piers and
 * abutments from the footing to the crown line, each vault as thin bands whose haunches reach from the pier faces to
 * the arc, and the two parapets. A hull on the approach mounts the deck part as its floor, a shell through an
 * opening passes, a hull low enough for the vault passes under it, a hull in the river is pushed by the piers and
 * the vault, and the parapets stop a hull that leaves the deck sideways. Everything is derived from the deck plane;
 * no map coordinate lives here.
 */
export function addArchedStoneBridge(
  deck: DressingBridgeDeck, heightField: DressingHeightField, rng: Rng, buckets: DressingBuckets,
  ctx: FocusedDressingContext, style: BridgeMasonry = 'plain',
): void {
  const { x: cx, z: cz, ux, uz, halfLength, halfWidth, deckY, bedY, waterY } = deck;
  const vx = -uz, vz = ux; // across the road = along the river (the extrusion's local +z)
  const width = halfWidth * 2;
  const bodyHalf = halfLength + 1.0; // a metre into each approach embankment
  const bottom = bedY - BRIDGE_BODY_BELOW_BED_M;
  const top = deckY - BRIDGE_BODY_TOP_UNDER_DECK_M;
  // the arches share the wet span between the abutments: N ≈ one per 11 m, piers between them
  const wetSpan = Math.max(4, (halfLength - 3) * 2);
  const arches = Math.max(1, Math.round(wetSpan / (halfLength > 60 ? 32 : 11)));
  const chord = (wetSpan - (arches - 1) * BRIDGE_PIER_M) / arches;
  const springY = halfLength > 60 ? deckY - 14 : waterY + BRIDGE_SPRING_OVER_WATER_M;
  const crownY = top - BRIDGE_SPANDREL_FILL_M;
  const rise = Math.max(0.4, Math.min(chord * 0.32, crownY - springY));
  const radius = (chord * chord / 4 + rise * rise) / (2 * rise);
  const centreY = springY + rise - radius;
  const halfAngle = Math.asin(Math.min(1, chord / 2 / radius));
  // the elevation profile (local x along the road, y up), traced clockwise with the arch openings cut from the bottom
  const profile = new THREE.Shape();
  profile.moveTo(-bodyHalf, bottom);
  profile.lineTo(-bodyHalf, top);
  profile.lineTo(bodyHalf, top);
  profile.lineTo(bodyHalf, bottom);
  for (let i = arches - 1; i >= 0; i--) {
    const archX = -wetSpan / 2 + chord / 2 + i * (chord + BRIDGE_PIER_M);
    profile.lineTo(archX + chord / 2, bottom);
    profile.lineTo(archX + chord / 2, springY);
    profile.absarc(archX, centreY, radius, Math.PI / 2 - halfAngle, Math.PI / 2 + halfAngle, false);
    profile.lineTo(archX - chord / 2, bottom);
  }
  profile.lineTo(-bodyHalf, bottom);
  const body = new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false, curveSegments: 10 });
  body.translate(0, 0, -width / 2);
  scaleUV(body, 0.7, 0.7); // the extrusion's UVs are metres; the stone bucket's boxes carry 0.7 per metre
  jitterUV(body, rng);
  alignWidth(body, ux, uz);
  buckets.stone.push(body.translate(cx, 0, cz));
  // the deck slab, level and flush with the approaches (a thin slab takes per-face metre UVs — box() would stretch
  // the stone across the deck's width into stripes), and the parapets on its edges with end posts
  const slab = slabBox(bodyHalf * 2, BRIDGE_SLAB_M, width, 0.7);
  jitterUV(slab, rng);
  buckets.stone.push(alignWidth(slab, ux, uz).translate(cx, deckY - BRIDGE_SLAB_M / 2, cz));
  const parapetHalf = bodyHalf + 0.2;
  // (#27) with the props' structure sink the parapets stand as structures of their own, in runs of about six metres,
  // each with its coping and its end post: a round's blow or a ram brings a run down as its own pieces (the sections
  // path), the deck and its body stay (the record below keeps them, fixed); the map's stream takes the draws the whole
  // parapets' pieces took
  // (Cliffbridge's gorge span keeps its solid parapets: a hull through a broken one would fall thirty metres)
  const parapetRuns = !!ctx.structure && style === 'norman';
  if (parapetRuns) {
    for (let k = 0; k < 24; k++) rng();
    addParapetRuns(ctx, cx, cz, ux, uz, halfWidth, deckY, parapetHalf, style === 'norman');
  }
  for (const side of parapetRuns ? [] : [-1, 1]) {
    const inset = halfWidth - BRIDGE_PARAPET_THICK_M / 2;
    const parapet = box(parapetHalf * 2, BRIDGE_PARAPET_HEIGHT_M, BRIDGE_PARAPET_THICK_M, 0.7);
    jitterUV(parapet, rng);
    buckets.stone.push(alignWidth(parapet, ux, uz)
      .translate(cx + vx * inset * side, deckY + BRIDGE_PARAPET_HEIGHT_M / 2, cz + vz * inset * side));
    for (const end of [-1, 1]) {
      const post = box(0.8, BRIDGE_PARAPET_HEIGHT_M + 0.4, 0.8, 0.7);
      jitterUV(post, rng);
      buckets.stone.push(alignWidth(post, ux, uz).translate(
        cx + ux * end * parapetHalf + vx * inset * side, deckY + (BRIDGE_PARAPET_HEIGHT_M + 0.4) / 2,
        cz + uz * end * parapetHalf + vz * inset * side));
    }
  }
  // cutwaters on both faces of every pier, their noses turned into the stream
  const cutwaterTop = springY + 0.5;
  for (let i = 0; i < arches - 1; i++) {
    const pierX = -wetSpan / 2 + (i + 1) * chord + i * BRIDGE_PIER_M + BRIDGE_PIER_M / 2;
    for (const side of [-1, 1]) {
      const nose = box(BRIDGE_PIER_M * 0.8, cutwaterTop - bottom, BRIDGE_PIER_M * 0.8, 0.7);
      nose.rotateY(Math.PI / 4);
      jitterUV(nose, rng);
      buckets.stone.push(alignWidth(nose, ux, uz).translate(
        cx + ux * pierX + vx * (halfWidth + 0.5) * side, (cutwaterTop + bottom) / 2,
        cz + uz * pierX + vz * (halfWidth + 0.5) * side));
    }
  }
  // wing walls splay from each abutment corner down the bank
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const wingX = cx + ux * end * (bodyHalf + 2.2) + vx * (halfWidth + 1.4) * side;
      const wingZ = cz + uz * end * (bodyHalf + 2.2) + vz * (halfWidth + 1.4) * side;
      const foot = heightField.getHeightAt(wingX, wingZ) - 0.5;
      const wingTop = deckY + 0.3;
      const wing = box(5.2, wingTop - foot, 0.9, 0.7);
      wing.rotateY(-end * side * 0.6);
      jitterUV(wing, rng);
      buckets.stone.push(alignWidth(wing, ux, uz).translate(wingX, (foot + wingTop) / 2, wingZ));
    }
  }
  // (#27) a Norman river bridge's masonry over the body: the arch rings, the string course, the coped parapets, the
  // pointed cutwaters with their starlings and the pilasters over them (visual only: the record below is unchanged)
  if (style === 'norman') {
    const arcs = Array.from({ length: arches }, (_, i) => -wetSpan / 2 + chord / 2 + i * (chord + BRIDGE_PIER_M));
    const piers = Array.from({ length: arches - 1 }, (_, i) => -wetSpan / 2 + (i + 1) * chord + i * BRIDGE_PIER_M + BRIDGE_PIER_M / 2);
    const g = normanMasonry({ halfWidth, bodyHalf, parapetHalf, deckY, top, bottom, springY, centreY, radius, halfAngle,
      arcs, piers, seed: Math.round(cx * 13 + cz * 7), copings: !parapetRuns });
    buckets.stone.push(alignWidth(g, ux, uz).translate(cx, 0, cz));
  }
  // The record (round 63, 2026-09-24): parts that follow the geometry. The deck part is the spandrel fill and the slab
  // from the crown line up — deckY − crownY = BRIDGE_BODY_TOP_UNDER_DECK_M + BRIDGE_SPANDREL_FILL_M = 1.0 m, over
  // HULL_STANDABLE_HEIGHT_M (0.9), so a hull on the deck mounts it as its floor and is not pushed by its sides — the
  // abutments and the piers stand from the footing to the crown line, and each vault is BRIDGE_VAULT_BAND_M bands
  // (the shell bands of the building hitboxes) whose solid haunches reach in from the pier faces to the arc at the
  // band's middle height, so the opening a shell or a low hull sees is the arc to within a band. Below the spring
  // line the openings are clear from pier to pier.
  const yaw = Math.atan2(ux, uz); // an OBB's forward axis is (sin yaw, cos yaw), like a hull's
  const parts: SimpleCollisionShape[] = [{ kind: 'obb', cx, cz, hw: halfWidth, hl: bodyHalf, yaw, y0: crownY, y1: deckY }];
  const solid = (from: number, to: number, y0: number, y1: number): void => {
    // one solid slice of the body between two stations along the road, through the full deck width
    const at = (from + to) / 2;
    parts.push({ kind: 'obb', cx: cx + ux * at, cz: cz + uz * at, hw: halfWidth, hl: (to - from) / 2, yaw, y0, y1 });
  };
  solid(-bodyHalf, -wetSpan / 2, bottom, crownY); // the abutments
  solid(wetSpan / 2, bodyHalf, bottom, crownY);
  for (let i = 0; i < arches - 1; i++) { // the piers
    const pierX = -wetSpan / 2 + (i + 1) * chord + i * BRIDGE_PIER_M;
    solid(pierX, pierX + BRIDGE_PIER_M, bottom, crownY);
  }
  const bands = Math.max(1, Math.ceil((crownY - springY) / BRIDGE_VAULT_BAND_M));
  for (let i = 0; i < arches; i++) { // the vaults' haunches, band by band
    const archX = -wetSpan / 2 + chord / 2 + i * (chord + BRIDGE_PIER_M);
    for (let band = 0; band < bands; band++) {
      const y0 = springY + (crownY - springY) * band / bands, y1 = springY + (crownY - springY) * (band + 1) / bands;
      const dy = (y0 + y1) / 2 - centreY;
      const opening = Math.sqrt(Math.max(0, radius * radius - dy * dy)); // the arc's half-opening at the band's middle
      if (opening >= chord / 2) continue;
      solid(archX - chord / 2, archX - opening, y0, y1);
      solid(archX + opening, archX + chord / 2, y0, y1);
    }
  }
  const parapetInset = halfWidth - BRIDGE_PARAPET_THICK_M / 2;
  for (const side of parapetRuns ? [] : [-1, 1]) {
    parts.push({ kind: 'obb', cx: cx + vx * parapetInset * side, cz: cz + vz * parapetInset * side,
      hw: BRIDGE_PARAPET_THICK_M / 2, hl: parapetHalf, yaw, y0: deckY, y1: deckY + BRIDGE_PARAPET_HEIGHT_M });
  }
  // Preserve exact vault bands within the 64-part server wire limit.
  for (let offset = 0; offset < parts.length; offset += 64) {
    const record = setCompoundShape({ min: [0, bottom, 0], max: [0, deckY + BRIDGE_PARAPET_HEIGHT_M, 0], kind: 'bridge' }, parts.slice(offset, offset + 64));
    ctx.obstacles?.push(record);
    ctx.colliders?.push(cloneCollisionRecord(record));
  }
}
