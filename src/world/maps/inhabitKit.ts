// src/world/maps/inhabitKit.ts — world-dressing r1: the INHABITING-OBJECT kit.
// Small themed props (carts, barrels, crates, bales, stooks, troughs, market
// stalls, benches, churns, laundry lines, pottery, oil drums, sleds, firewood,
// street lamps) plus the wooden FENCE segment kit — every type built twice:
// an INTACT geometry and a flattened BROKEN debris variant, both centered on
// XZ with base at y=0, so props.ts can run them as per-type InstancedMesh
// pools with per-instance swap-out on destruction (see props.ts destructible
// layer + src/world/destructibles.ts seam).
//
// Material contract (props.ts): mat 'wood'/'straw' types carry UVs and ride
// the map-toned textured materials; mat 'baked' types carry vertex colors and
// ride the shared matte vertex-color material (grime/snow-cap shader hooks
// apply to all of them, so winter gets snow-covered variants for free).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  certifyGroundedStructureParts, certifyStructureAttachments,
} from '../structureConnectivity.ts';
import { CIVILIAN_VEHICLE_RECEIPTS } from './civilianVehicleKit.ts';
import { spentDraws } from './brokenDraws.ts';
import { setNightEmissionMask } from '../../engine/nightEmissionMaterial.ts';
import { FIELD_STONE_FACE_V, FIELD_STONE_HEARTING_V } from '../fieldStoneSurface.ts';
import { layDryStoneFace } from '../dryStoneCourses.ts';
// (b15: the straw props wear the hay print's bands: hayPrint.ts; the stook is a teepee of bound sheaves: haystackKit.ts)
import { HAY_FACE_V, HAY_PACKED_V } from '../hayPrint.ts';
import { STRAW_STAND_IN_TOP_M, buildHaycock, buildHaycockContactProxy, buildKopna, buildStook, mapToBand, prismStandIn, spilledStack } from './haystackKit.ts';

type Rng = () => number;
type Palette = readonly [number, number, number];
type PropBuilder = (rng: Rng) => THREE.BufferGeometry;

export interface DestructiblePropType {
  cls: 'break' | 'topple' | 'physics';
  mat: 'wood' | 'straw' | 'stone' | 'plaster' | 'baked' | 'vehicle';
  contact: 'ob' | 'loop' | 'none';
  r: number;
  h: number;
  build: PropBuilder;
  broken: PropBuilder | null;
  hw?: number;
  hl?: number;
  shape?: 'circle';
  collisionR?: number;
  groundR?: number;
  bodyR?: number;
  mass?: number;
  bounce?: number;
  friction?: number;
  angularDrag?: number;
  groundConstrained?: boolean;
  fence?: boolean;
  wall?: boolean;
  collider?: boolean;
  keep?: number;
  crushMin?: number;
  explosive?: boolean;
  /** (b22) A convex stand-in the pool's colliders are refit from in place of its build (props.ts
   * refitDestructibleColliders): a lumpy straw form's sections ear-clip into dozens of parts, each a shard record's
   * polygon and a contact test, where one convex outline does for a crushable, shoot-through prop. */
  contactProxy?: () => THREE.BufferGeometry;
  /** (b25) Materials by the build's geometry groups, in place of `mat` alone (the ksar gate post: its mud render and its
   * timber); the broken build carries the same groups. */
  mats?: readonly string[];
}

export const FENCE_SEG = 2.4; // fence-kit module pitch, meters

const _c = new THREE.Color();
const _detailRng = () => 0.5;

function scaleUV<T extends THREE.BufferGeometry>(geo: T, su: number, sv: number): T {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function box(w: number, h: number, d: number, uvScale = 0.7): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleUV(g, Math.max(w, d) * uvScale, h * uvScale);
}

function cyl(r0: number, r1: number, h: number, seg = 7): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1);
  return scaleUV(g, 1, 1);
}

/** Author in HSL (sRGB) like the rest of the world code; store linear. */
function paint<T extends THREE.BufferGeometry>(
  geo: T,
  h: number,
  s: number,
  l: number,
  jit: number,
  rng: Rng,
): T {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _c.setHSL(h, s, Math.max(0.02, l + (rng() - 0.5) * jit), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// palette shorthands (h, s, l) — sRGB HSL
const WOOD: Palette = [0.075, 0.38, 0.30];
const WOOD_PALE: Palette = [0.085, 0.30, 0.42];
const WHITEWASH: Palette = [0.10, 0.10, 0.68];
// sun-bleached working canvas — saturated fabric read as toy plastic in the
// first closeup pass, so awnings/rugs sit in a weathered dyed-cloth band
const CANVAS: Palette = [0.096, 0.26, 0.55];
const CANVAS2: Palette = [0.025, 0.34, 0.38];
const HAY: Palette = [0.105, 0.55, 0.46];
const TERRA: Palette = [0.045, 0.52, 0.38];
const STEEL: Palette = [0.58, 0.04, 0.24];
const GALV: Palette = [0.56, 0.03, 0.46];
const RUST: Palette = [0.05, 0.55, 0.22];
const LINEN: Palette = [0.11, 0.12, 0.64];
const IRON: Palette = [0.60, 0.05, 0.13];
const LAMP_GLASS: Palette = [0.105, 0.42, 0.42];

function P<T extends THREE.BufferGeometry>(geo: T, pal: Palette, jit: number, rng: Rng): T {
  return paint(geo, pal[0], pal[1], pal[2], jit, rng);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(
    parts.map((part) => (part.index ? part.toNonIndexed() : part)),
    false,
  );
  if (!geometry) throw new Error('inhabiting prop geometry merge produced no result');
  return geometry;
}

// ---- (b39, the scenery lane; the destructibles audit: "a single tilted counter slab", "one flat slab and a stub") the
// broken states built as the intact ones are: the prop's own parts, in its own materials, broken the way they break —
// timber snapped with splinters, canvas down in folds, loads spilled.

/** Rotate (x, then y, then z) and place a part. */
function put<T extends THREE.BufferGeometry>(g: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  return g.translate(x, y, z);
}
/**
 * A timber snapped: the stick (w x len x d) standing from y 0 to len, its top a splintered break — two or three
 * slivers of their own lengths and splay. Unplaced pieces (the caller paints and places them).
 */
function snappedTimber(w: number, len: number, d: number, o: Rng, slivers = 2): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [box(w, len, d).translate(0, len / 2, 0)];
  for (let i = 0; i < slivers; i++) {
    const sl = 0.05 + o() * 0.12, sw = (w / slivers) * 0.85;
    const s = box(sw, sl, d * (0.45 + o() * 0.4));
    s.rotateZ((o() - 0.5) * 0.4); s.rotateX((o() - 0.5) * 0.3);
    out.push(s.translate(-w / 2 + (w / slivers) * (i + 0.5), len + sl / 2 - 0.015, (o() - 0.5) * d * 0.3));
  }
  return out;
}
/**
 * (b39) A double-faced cloth through `at(u, v)` (u, v in 0..1) on a cols x rows grid: its two faces on their own
 * vertices, so each lights from its own side (the props materials are front-sided; one vertex set shared by both
 * windings summed its normals to nothing).
 */
function clothSheet(cols: number, rows: number, at: (u: number, v: number) => readonly [number, number, number]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], w = cols + 1, face = (rows + 1) * w;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= cols; j++) { const p = at(j / cols, i / rows); pos.push(p[0], p[1], p[2]); uv.push(j / cols, i / rows); }
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
    idx.push(a, c, b, b, c, d); // one face
    idx.push(face + a, face + b, face + c, face + b, face + d, face + c); // the other, on its own vertices
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A cloth strip down in folds: x0..x1 across, z0..z1 along, its height over the ground `h(x, z)`, `n` rows along;
 * drawn on both faces (a fallen awning is seen from above and below). UVs 0..1 across and along.
 */
function drapedStrip(x0: number, x1: number, z0: number, z1: number, n: number, h: (x: number, z: number) => number, cols = 1): THREE.BufferGeometry {
  return clothSheet(cols, n, (u, v) => { const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v; return [x, h(x, z), z]; });
}

// ---------------------------------------------------------------------------
// shared sub-assemblies
// ---------------------------------------------------------------------------

/** spoked cart wheel (baked): rim ring + hub + 4 spoke boxes, axis +z */
function cartWheel(r: number, rng: Rng): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const rim = new THREE.CylinderGeometry(r, r, 0.09, 12, 1);
  rim.rotateX(Math.PI / 2);
  parts.push(P(rim, WOOD, 0.10, rng));
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.14, 6, 1);
  hub.rotateX(Math.PI / 2);
  parts.push(P(hub, WOOD_PALE, 0.08, rng));
  for (let k = 0; k < 4; k++) {
    const sp = new THREE.BoxGeometry(0.05, r * 1.7, 0.05);
    sp.rotateZ(k * Math.PI / 4);
    parts.push(P(sp, WOOD_PALE, 0.10, rng));
  }
  return parts;
}

/** scatter of flat planks (broken-state filler), painted or UV'd */
function plankScatter(
  n: number,
  len: number,
  wid: number,
  rad: number,
  rng: Rng,
  pal: Palette | null = null,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * rad;
    const p = box(len * (0.5 + rng() * 0.6), 0.045, wid * (0.7 + rng() * 0.5));
    p.rotateY(rng() * Math.PI);
    p.rotateX((rng() - 0.5) * 0.16);
    p.translate(Math.cos(a) * rr, 0.05 + rng() * 0.08, Math.sin(a) * rr);
    parts.push(pal ? P(p, pal, 0.14, rng) : p);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// object builders — intact + broken pairs
// ---------------------------------------------------------------------------

function bBarrel(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const body = cyl(0.30, 0.33, 0.92, 10);
  // subtle stave banding via per-vertex tone
  parts.push(P(body.translate(0, 0.46, 0), WOOD, 0.16, rng));
  for (const hy of [0.16, 0.74]) {
    const hoop = new THREE.CylinderGeometry(0.328, 0.332, 0.055, 10, 1, true);
    parts.push(P(hoop.translate(0, hy, 0), IRON, 0.04, rng));
  }
  const lid = cyl(0.285, 0.285, 0.04, 10);
  parts.push(P(lid.translate(0, 0.93, 0), WOOD_PALE, 0.12, rng));
  return merge(parts);
}
function bBarrelBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  for (let k = 0; k < 6; k++) { // sprung staves fanned flat
    const a = (k / 6) * Math.PI * 2 + rng() * 0.5;
    const st = box(0.13, 0.035, 0.88);
    st.rotateX((rng() - 0.5) * 0.2);
    st.rotateY(a);
    st.translate(Math.cos(a) * 0.34, 0.05, Math.sin(a) * 0.34);
    parts.push(P(st, WOOD, 0.16, rng));
  }
  const hoop = new THREE.CylinderGeometry(0.33, 0.33, 0.03, 10, 1, true);
  hoop.rotateX(0.12);
  parts.push(P(hoop.translate(0.1, 0.05, -0.06), IRON, 0.04, rng));
  const bottom = cyl(0.28, 0.28, 0.035, 10);
  parts.push(P(bottom.translate(-0.15, 0.03, 0.12), WOOD_PALE, 0.12, rng));
  return merge(parts);
}

function bCrate(_rng: Rng): THREE.BufferGeometry { // wood-textured
  const s = 0.92;
  const parts = [box(s, s, s).translate(0, s / 2, 0)];
  for (const e of [[0, s - 0.03, 0.03], [0, 0.05, 0.03]]) { // edge battens
    parts.push(box(s + 0.05, 0.07, 0.07).translate(0, e[1], s / 2));
    parts.push(box(s + 0.05, 0.07, 0.07).translate(0, e[1], -s / 2));
    parts.push(box(0.07, 0.07, s + 0.05).translate(s / 2, e[1], 0));
    parts.push(box(0.07, 0.07, s + 0.05).translate(-s / 2, e[1], 0));
  }
  return merge(parts);
}
function bCrateBroken(rng: Rng): THREE.BufferGeometry {
  const parts = plankScatter(7, 0.95, 0.20, 0.7, rng);
  const panel = box(0.9, 0.05, 0.9); // one side panel resting on the pile
  panel.rotateY(rng());
  panel.rotateX(0.24);
  parts.push(panel.translate(0.1, 0.16, -0.1));
  return merge(parts);
}

function bPallet(_rng: Rng): THREE.BufferGeometry { // wood-textured
  const parts = [];
  for (const bz of [-0.44, 0, 0.44]) parts.push(box(1.15, 0.09, 0.10).translate(0, 0.07, bz));
  for (let k = 0; k < 5; k++) parts.push(box(0.16, 0.035, 1.05).translate(-0.46 + k * 0.23, 0.14, 0));
  return merge(parts);
}
function bPalletBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const half = box(0.55, 0.08, 1.0);
  half.rotateY(0.3); half.rotateZ(0.14);
  parts.push(half.translate(-0.25, 0.07, 0));
  parts.push(...plankScatter(4, 0.6, 0.14, 0.6, rng));
  return merge(parts);
}
/**
 * (b39) The pallet broken: half of it still nailed together on its stringers, cocked up on the broken one; its other
 * deck boards torn off — snapped, their ends splintered — and scattered round it, a stringer broken in two.
 */
function bPalletBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bPalletBrokenLegacy, rng, 0x9a11);
  const parts: THREE.BufferGeometry[] = [];
  const keep: THREE.BufferGeometry[] = [];
  for (const bz of [-0.44, 0]) keep.push(box(0.62, 0.09, 0.10).translate(-0.24, 0.07, bz));
  for (let k = 0; k < 3; k++) keep.push(box(0.16, 0.035, 0.62).translate(-0.46 + k * 0.23, 0.14, -0.2));
  for (const g of keep) { g.rotateZ(0.16); g.rotateY(0.22); parts.push(g.translate(0, 0.06, 0)); }
  for (let k = 0; k < 3; k++) {
    for (const g of snappedTimber(0.16, 0.38 + o() * 0.35, 0.035, o)) parts.push(put(g, 0.25 + o() * 0.5, 0.03, (o() - 0.5) * 1.0, Math.PI / 2, o() * Math.PI, 0));
  }
  parts.push(put(box(0.6, 0.09, 0.1), 0.45, 0.05, 0.55, 0, 0.6, 0));
  parts.push(put(box(0.5, 0.09, 0.1), -0.1, 0.05, 0.62, 0, -0.3, 0.05));
  return merge(parts);
}

function bBale(_rng: Rng): THREE.BufferGeometry { // straw-textured round bale
  const b = new THREE.CylinderGeometry(0.72, 0.72, 1.45, 12, 1);
  mapToBand(scaleUV(b, 2, 1), HAY_PACKED_V);
  b.rotateZ(Math.PI / 2);
  return merge([b.translate(0, 0.70, 0)]);
}
function bBaleBrokenLegacy(rng: Rng): THREE.BufferGeometry { // burst low hay heap
  const heap = new THREE.CylinderGeometry(1.0, 1.25, 0.42, 10, 1);
  mapToBand(scaleUV(heap, 2.5, 0.5), HAY_FACE_V);
  const p = heap.attributes.position;
  for (let i = 0; i < p.count; i++) { // slump the profile
    const f = 1 + (rng() - 0.5) * 0.3;
    p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f);
  }
  heap.computeVertexNormals();
  const parts = [heap.translate(0, 0.20, 0)];
  for (let k = 0; k < 3; k++) { // thrown wads
    const wad = new THREE.CylinderGeometry(0.22, 0.30, 0.18, 7, 1);
    mapToBand(scaleUV(wad, 1, 1), HAY_FACE_V);
    const a = rng() * Math.PI * 2;
    parts.push(wad.translate(Math.cos(a) * (0.9 + rng() * 0.6), 0.08, Math.sin(a) * (0.9 + rng() * 0.6)));
  }
  return merge(parts);
}
/**
 * (b39; the audit's "a burst low hay heap") The round bale knocked off its seat and burst: the roll, smaller now, lying
 * where it rolled with its packed layers showing at its ends, the layers it lost unrolled behind it in a long mat of hay
 * folded over itself, a few clumps torn off round it.
 */
function bBaleBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bBaleBrokenLegacy, rng, 0xba1e);
  const parts: THREE.BufferGeometry[] = [];
  const r = 0.46 + o() * 0.08, w = 1.4, yaw = o() * Math.PI * 2, back = 0.55;
  // the roll, rolled a little way from its seat
  const roll = new THREE.CylinderGeometry(r, r, w, 12, 1);
  mapToBand(scaleUV(roll, 2, 1), HAY_PACKED_V);
  roll.rotateZ(Math.PI / 2);
  parts.push(roll.translate(0, r - 0.03, back));
  // the unrolled mat from under the roll back across its old seat, folded where it slid
  const L = 1.9 + o() * 0.6, phase = o() * 6;
  const mat = clothSheet(4, 10, (u, v) => {
    const x = (u - 0.5) * w * (1 - 0.12 * v), z = back - v * L;
    return [x + 0.06 * Math.sin(v * 9 + phase), 0.025 + 0.07 * Math.max(0, Math.sin(v * 7.5 + phase + u)) * (1 - v * 0.6), z];
  });
  mapToBand(scaleUV(mat, w * 1.2, L * 0.6), HAY_FACE_V);
  parts.push(mat);
  // clumps torn off round it
  for (let k = 0; k < 3; k++) {
    const clump = new THREE.SphereGeometry(0.2 + o() * 0.12, 6, 4);
    clump.scale(1, 0.42, 0.8);
    mapToBand(scaleUV(clump, 1, 1), HAY_FACE_V);
    const a = o() * Math.PI * 2, d = 0.9 + o() * 0.8;
    parts.push(clump.translate(Math.cos(a) * d, 0.05, Math.sin(a) * d - 0.3));
  }
  const g = merge(parts);
  g.rotateY(yaw);
  return g;
}

function bStook(rng: Rng): THREE.BufferGeometry { // a teepee of bound sheaves (b15: haystackKit.ts)
  return buildStook(rng);
}
function bStookBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  for (let k = 0; k < 5; k++) { // sheaves knocked flat, radial
    const a = rng() * Math.PI * 2;
    const sh = new THREE.CylinderGeometry(0.06, 0.15, 1.2, 6, 1);
    mapToBand(scaleUV(sh, 1, 1), HAY_FACE_V);
    sh.rotateZ(Math.PI / 2 - 0.06);
    sh.rotateY(a);
    sh.translate(Math.cos(a) * 0.5, 0.10, Math.sin(a) * 0.5);
    parts.push(sh);
  }
  return merge(parts);
}

function bFirewood(rng: Rng): THREE.BufferGeometry { // wood-textured stacked split logs
  const parts = [];
  const rows = [[5, 0.13], [4, 0.38], [3, 0.60], [1, 0.80]];
  for (const [nLog, ly] of rows) {
    for (let li = 0; li < nLog; li++) {
      const off = (li - (nLog - 1) / 2) * 0.27;
      const log = new THREE.CylinderGeometry(0.115, 0.13, 1.5 + rng() * 0.3, 6, 1);
      scaleUV(log, 0.8, 0.8);
      log.rotateZ(Math.PI / 2);
      log.translate(0, ly, off);
      parts.push(log);
    }
  }
  return merge(parts);
}
function bFirewoodBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  for (let k = 0; k < 8; k++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * 1.0;
    const log = new THREE.CylinderGeometry(0.11, 0.125, 1.3 + rng() * 0.3, 6, 1);
    scaleUV(log, 0.8, 0.8);
    log.rotateZ(Math.PI / 2 + (rng() - 0.5) * 0.1);
    log.rotateY(rng() * Math.PI);
    log.translate(Math.cos(a) * rr, 0.12, Math.sin(a) * rr);
    parts.push(log);
  }
  return merge(parts);
}

function bTrough(_rng: Rng): THREE.BufferGeometry { // wood-textured water trough on cross legs
  const parts = [];
  parts.push(box(0.55, 0.09, 1.9).translate(0, 0.28, 0));            // floor
  for (const s of [-1, 1]) {
    const side = box(0.07, 0.42, 1.9);
    side.rotateZ(s * 0.10);
    parts.push(side.translate(s * 0.30, 0.45, 0));
    parts.push(box(0.62, 0.42, 0.07).translate(0, 0.45, s * 0.93)); // ends
    const leg = box(0.60, 0.12, 0.14);
    parts.push(leg.translate(0, 0.10, s * 0.62));
  }
  return merge(parts);
}
function bTroughBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const bed = box(0.55, 0.08, 1.8);
  bed.rotateY(0.2); bed.rotateZ(0.08);
  parts.push(bed.translate(0, 0.07, 0));
  parts.push(...plankScatter(4, 0.9, 0.16, 0.8, rng));
  return merge(parts);
}
/**
 * (b39) The trough broken open: its floor cracked and dropped at one end, one side board burst off and lying flat, the
 * other leaning out from the floor, an end board knocked out, its trestle legs kicked over.
 */
function bTroughBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bTroughBrokenLegacy, rng, 0x7e06);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(put(box(0.55, 0.09, 1.9), 0, 0.17, 0, 0.1, 0.05, 0));
  parts.push(put(box(0.07, 0.42, 1.9), -0.3, 0.38, 0, 0.08, 0.05, 0.4 + o() * 0.25));
  parts.push(put(box(0.42, 0.07, 1.85), 0.62 + o() * 0.15, 0.04, 0.1, 0, 0.05 + o() * 0.2, 0));
  parts.push(put(box(0.62, 0.42, 0.07), 0, 0.42, -0.93, 0, 0.05, 0));
  parts.push(put(box(0.62, 0.07, 0.42), 0.15, 0.04, 1.35, 0, 0.6, 0));
  parts.push(put(box(0.6, 0.12, 0.14), -0.1, 0.06, -0.62, 0, 0.3, 0));
  parts.push(put(box(0.6, 0.14, 0.12), 0.35, 0.07, 0.7, 0, -0.5, Math.PI / 2));
  return merge(parts);
}

function bStall(rng: Rng): THREE.BufferGeometry { // baked: market stall — counter, posts, striped awning
  const parts = [];
  parts.push(P(box(2.6, 0.10, 1.3).translate(0, 0.88, 0), WOOD_PALE, 0.10, rng)); // counter
  parts.push(P(box(2.6, 0.5, 0.06).translate(0, 0.62, 0.62), WOOD, 0.12, rng));   // skirt
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = box(0.09, sz < 0 ? 2.15 : 1.85, 0.09);
      parts.push(P(post.translate(sx * 1.22, (sz < 0 ? 2.15 : 1.85) / 2, sz * 0.58), WOOD, 0.10, rng));
    }
  }
  // striped awning: alternating canvas bands on a forward slope
  for (let k = 0; k < 5; k++) {
    const band = box(0.56, 0.035, 1.75);
    band.rotateZ(0); band.rotateX(0.24);
    band.translate(-1.12 + k * 0.56, 2.06, 0.14);
    parts.push(P(band, k % 2 ? CANVAS2 : CANVAS, 0.05, rng));
  }
  // goods: two sacks + a small box on the counter
  const sack = new THREE.SphereGeometry(0.17, 6, 5);
  sack.scale(1, 0.75, 1);
  parts.push(P(sack.translate(-0.6, 1.02, 0.1), LINEN, 0.10, rng));
  const sack2 = sack.clone();
  parts.push(P(sack2.translate(1.15, -0.02, -0.25), TERRA, 0.10, rng));
  parts.push(P(box(0.4, 0.24, 0.3).translate(0.45, 1.05, -0.15), WOOD, 0.10, rng));
  return merge(parts);
}
function bStallBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const counter = box(2.4, 0.09, 1.2);
  counter.rotateY(0.16); counter.rotateZ(0.10);
  parts.push(P(counter.translate(0.1, 0.14, 0), WOOD_PALE, 0.10, rng));
  for (let k = 0; k < 3; k++) { // snapped posts
    const st = box(0.09, 0.05, 0.8 + rng() * 0.7);
    st.rotateY(rng() * Math.PI);
    parts.push(P(st.translate((rng() - 0.5) * 2, 0.05, (rng() - 0.5) * 1.4), WOOD, 0.12, rng));
  }
  // awning draped over the wreck
  const drape = box(2.5, 0.05, 1.7);
  drape.rotateY(0.1); drape.rotateX(0.20); drape.rotateZ(0.06);
  parts.push(P(drape.translate(-0.15, 0.34, 0.2), CANVAS, 0.07, rng));
  return merge(parts);
}
/**
 * (b39) The market stall wrecked: the counter cracked in two — one half fallen onto its stub, one flat in the dirt —
 * its skirt board down in front in two pieces; the rear posts snapped high, the front one a stub, the fourth lying;
 * the striped awning down in folds from the rear stubs over the counter to the ground, one band torn short; the goods
 * spilled — a sack split, the crate on its side, produce rolled away.
 */
function bStallBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bStallBrokenLegacy, rng, 0x57a1);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(P(put(box(1.3, 0.1, 1.3), -0.62, 0.33, 0, 0, 0.06, 0.32), WOOD_PALE, 0.10, o));
  parts.push(P(put(box(1.22, 0.1, 1.24), 0.7, 0.07, 0.08, 0, 0.22 + o() * 0.1, -0.04), WOOD_PALE, 0.10, o));
  for (const [x, len, ry] of [[-0.62, 1.2, 0.08], [0.66, 1.25, -0.12]] as const) {
    parts.push(P(put(box(len, 0.06, 0.48), x, 0.04, 0.92, 0, ry, 0), WOOD, 0.12, o));
  }
  const posts: ReadonlyArray<readonly [number, number, number]> = [[-1.22, -0.58, 1.25 + o() * 0.3], [1.22, -0.58, 0.85 + o() * 0.35], [-1.22, 0.58, 0.3 + o() * 0.2]];
  for (const [x, z, len] of posts) for (const g of snappedTimber(0.09, len, 0.09, o)) parts.push(P(g.translate(x, 0, z), WOOD, 0.10, o));
  parts.push(P(put(box(0.09, 1.7, 0.09), 1.0, 0.05, 1.05, 0, 0.5, Math.PI / 2 - 0.05), WOOD, 0.10, o));
  // the awning: hung from the rear stubs (about a metre up), over the fallen half (higher on the left), to the dirt
  const hang = (x: number, z: number) => {
    const t = Math.min(1, Math.max(0, (z + 0.6) / 1.9));
    const base = 0.98 * Math.pow(1 - t, 1.6) + 0.04;
    const over = z > -0.6 && z < 0.65 ? Math.max(0, 0.42 - 0.3 * (x + 1.3) / 2.6) * (1 - Math.abs(z - 0.02) / 0.65) : 0;
    return Math.max(base, over + 0.06) + 0.035 * Math.sin(z * 9 + x * 4);
  };
  for (let k = 0; k < 5; k++) {
    const x0 = -1.4 + k * 0.56, torn = k === 3 ? 0.6 : 1;
    parts.push(P(drapedStrip(x0, x0 + 0.55, -0.62, -0.62 + 2.1 * torn, 6, hang), k % 2 ? CANVAS2 : CANVAS, 0.05, o));
  }
  // the goods: one sack whole, one split flat, the crate on its side, produce rolled away
  const sack = new THREE.SphereGeometry(0.17, 6, 5); sack.scale(1, 0.75, 1);
  parts.push(P(sack.translate(-0.25, 0.1, 1.25), LINEN, 0.10, o));
  const split = new THREE.SphereGeometry(0.19, 6, 4); split.scale(1.5, 0.3, 1.15);
  parts.push(P(split.translate(0.55, 0.04, 1.35), TERRA, 0.10, o));
  parts.push(P(put(box(0.4, 0.24, 0.3), 1.45, 0.15, 0.2, 0, 0.7, Math.PI / 2), WOOD, 0.10, o));
  for (let k = 0; k < 3; k++) {
    const lump = new THREE.SphereGeometry(0.055, 5, 4);
    parts.push(P(lump.translate(0.2 + o() * 1.2, 0.05, 1.5 + o() * 0.5), TERRA, 0.12, o));
  }
  return merge(parts);
}

function bBench(_rng: Rng): THREE.BufferGeometry { // wood-textured
  const parts = [];
  parts.push(box(1.7, 0.07, 0.42).translate(0, 0.48, 0));
  parts.push(box(1.7, 0.34, 0.06).translate(0, 0.82, -0.20));
  for (const s of [-1, 1]) {
    parts.push(box(0.08, 0.48, 0.40).translate(s * 0.72, 0.24, 0));
  }
  return merge(parts);
}
function bBenchBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const seat = box(1.6, 0.06, 0.4);
  seat.rotateZ(0.15); seat.rotateY(0.2);
  parts.push(seat.translate(0, 0.12, 0));
  parts.push(...plankScatter(3, 0.7, 0.14, 0.6, rng));
  return merge(parts);
}

function bChurn(rng: Rng): THREE.BufferGeometry { // baked: galvanized milk churn
  const parts = [];
  const body = cyl(0.20, 0.24, 0.62, 9);
  parts.push(P(body.translate(0, 0.31, 0), GALV, 0.10, rng));
  const neck = cyl(0.15, 0.17, 0.14, 9);
  parts.push(P(neck.translate(0, 0.68, 0), GALV, 0.08, rng));
  const lid = cyl(0.16, 0.16, 0.06, 9);
  parts.push(P(lid.translate(0, 0.78, 0), STEEL, 0.06, rng));
  return merge(parts);
}

// Lightweight metal dressing below shares the deterministic loose-body path
// in props.ts. Each mesh is still authored base-at-y=0 and centered on XZ so
// its visual tumble can rotate around the real mid-height.
function bTrashcan(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  parts.push(P(cyl(0.27, 0.31, 0.72, 11).translate(0, 0.36, 0), GALV, 0.10, rng));
  parts.push(P(cyl(0.34, 0.34, 0.055, 11).translate(0, 0.755, 0), STEEL, 0.07, rng));
  parts.push(P(cyl(0.08, 0.10, 0.08, 8).translate(0, 0.825, 0), IRON, 0.05, rng));
  for (const s of [-1, 1]) {
    parts.push(P(box(0.07, 0.18, 0.07).translate(s * 0.32, 0.52, 0), STEEL, 0.07, rng));
  }
  return merge(parts);
}

function bGasBottle(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const BLUEGREY: Palette = [0.56, 0.16, 0.34];
  parts.push(P(cyl(0.17, 0.18, 0.62, 10).translate(0, 0.34, 0), BLUEGREY, 0.10, rng));
  parts.push(P(cyl(0.105, 0.17, 0.16, 10).translate(0, 0.73, 0), BLUEGREY, 0.08, rng));
  parts.push(P(cyl(0.075, 0.09, 0.12, 8).translate(0, 0.87, 0), STEEL, 0.06, rng));
  parts.push(P(box(0.17, 0.055, 0.065).translate(0.07, 0.95, 0), IRON, 0.05, rng));
  parts.push(P(cyl(0.19, 0.19, 0.055, 10).translate(0, 0.035, 0), IRON, 0.06, rng));
  return merge(parts);
}

function bBucket(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  parts.push(P(cyl(0.23, 0.17, 0.36, 10).translate(0, 0.18, 0), GALV, 0.11, rng));
  parts.push(P(new THREE.TorusGeometry(0.23, 0.018, 5, 12)
    .rotateX(Math.PI / 2).translate(0, 0.37, 0), STEEL, 0.06, rng));
  const handle = new THREE.TorusGeometry(0.25, 0.014, 5, 12, Math.PI);
  handle.rotateZ(Math.PI / 2);
  parts.push(P(handle.translate(0, 0.34, 0), IRON, 0.05, rng));
  return merge(parts);
}

function bJerryCan(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  parts.push(P(box(0.38, 0.48, 0.21).translate(0, 0.24, 0), OLIVE, 0.10, rng));
  // pressed X ribs on both broad faces
  for (const z of [-0.118, 0.118]) {
    for (const s of [-1, 1]) {
      const rib = box(0.035, 0.34, 0.025);
      rib.rotateZ(s * 0.62);
      parts.push(P(rib.translate(0, 0.24, z), OLIVE_D, 0.07, rng));
    }
  }
  for (const x of [-0.13, 0.13]) parts.push(P(box(0.045, 0.15, 0.045)
    .translate(x, 0.55, 0), OLIVE_D, 0.06, rng));
  parts.push(P(box(0.30, 0.045, 0.05).translate(0, 0.62, 0), OLIVE_D, 0.06, rng));
  parts.push(P(cyl(0.045, 0.055, 0.09, 7).translate(0.13, 0.68, 0), STEEL, 0.05, rng));
  return merge(parts);
}

function bLooseWheel(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const tire = new THREE.TorusGeometry(0.26, 0.085, 7, 14);
  parts.push(P(tire.translate(0, 0.345, 0), TIRE, 0.045, rng));
  const hub = new THREE.CylinderGeometry(0.13, 0.13, 0.13, 10, 1);
  hub.rotateX(Math.PI / 2);
  parts.push(P(hub.translate(0, 0.345, 0), STEEL, 0.09, rng));
  for (let i = 0; i < 5; i++) {
    const spoke = box(0.045, 0.20, 0.05);
    spoke.rotateZ(i * Math.PI * 0.4);
    parts.push(P(spoke.translate(0, 0.345, 0.075), STEEL, 0.07, rng));
  }
  return merge(parts);
}

function bLamp(rng: Rng): THREE.BufferGeometry { // baked: cast-iron street lamp (topple class)
  const parts: THREE.BufferGeometry[] = [];
  const H = 4.35;
  const pole = new THREE.CylinderGeometry(0.055, 0.09, H, 6, 1);
  const polePart = P(pole.translate(0, H / 2, 0), IRON, 0.05, rng);
  parts.push(polePart);
  const collar = new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6, 1);
  const collarPart = P(collar.translate(0, 0.25, 0), IRON, 0.05, rng);
  parts.push(collarPart);
  const addArm = (start: THREE.Vector3, end: THREE.Vector3, radius: number): THREE.BufferGeometry => {
    const direction = end.clone().sub(start);
    const segment = new THREE.CylinderGeometry(radius, radius * 1.08, direction.length(), 5, 1);
    segment.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), direction.normalize(),
    ));
    segment.translate(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2,
    );
    const painted = P(segment, IRON, 0.05, rng);
    parts.push(painted);
    return painted;
  };
  // Pole -> rising elbow -> horizontal arm -> drop neck -> lamp housing.
  // Every joint deliberately overlaps: the old single diagonal stopped at a
  // corner of the shade and made the light read as floating beside the pole.
  const elbowPart = addArm(
    new THREE.Vector3(0, H - 0.24, 0), new THREE.Vector3(0.30, H + 0.10, 0), 0.045,
  );
  const armPart = addArm(
    new THREE.Vector3(0.27, H + 0.10, 0), new THREE.Vector3(0.98, H + 0.10, 0), 0.042,
  );
  const neckPart = addArm(
    new THREE.Vector3(0.98, H + 0.13, 0), new THREE.Vector3(0.98, H - 0.08, 0), 0.042,
  );
  const head = new THREE.CylinderGeometry(0.17, 0.25, 0.36, 6, 1);
  const headPart = P(head.translate(0.98, H - 0.25, 0), IRON, 0.05, rng);
  parts.push(headPart);
  const cap = new THREE.ConeGeometry(0.20, 0.16, 6, 1);
  const capPart = P(cap.translate(0.98, H - 0.01, 0), IRON, 0.05, rng);
  parts.push(capPart);
  const lens = new THREE.CylinderGeometry(0.20, 0.20, 0.055, 6, 1);
  const lensPart = P(lens.translate(0.98, H - 0.455, 0), LAMP_GLASS, 0.035, rng);
  parts.push(lensPart);
  // Tag the authored lens before merging, never infer a lamp from paint color.
  for (const part of parts) setNightEmissionMask(part, part === lensPart ? 1 : 0);
  const connectivity = certifyGroundedStructureParts('streetlamp', parts, {
    epsilon: 0.025, groundMinY: -0.04, groundMaxY: 0.02,
  });
  const attachments = certifyStructureAttachments('streetlamp', {
    id: 'pole', geometry: polePart,
  }, [
    { id: 'base-collar', geometry: collarPart, support: 'pole' },
    { id: 'elbow', geometry: elbowPart, support: 'pole' },
    { id: 'arm', geometry: armPart, support: 'elbow' },
    { id: 'drop-neck', geometry: neckPart, support: 'arm' },
    { id: 'housing', geometry: headPart, support: 'drop-neck' },
    { id: 'cap', geometry: capPart, support: 'housing' },
    { id: 'lens', geometry: lensPart, support: 'housing' },
  ]);
  const geometry = merge(parts);
  geometry.userData.structureConnectivity = connectivity;
  geometry.userData.streetFurnitureAttachment = attachments;
  return geometry;
}

function bDrum(rng: Rng): THREE.BufferGeometry { // baked: 200 L oil drum, rust-blotched (topple class)
  const parts = [];
  const body = cyl(0.30, 0.30, 0.90, 11);
  const painted = P(body.translate(0, 0.45, 0), STEEL, 0.10, rng);
  // rust blotches: re-tint a random minority of vertices
  const col = painted.attributes.color;
  for (let i = 0; i < col.count; i++) {
    if (rng() < 0.18) {
      _c.setHSL(RUST[0], RUST[1], RUST[2] + (rng() - 0.5) * 0.08, THREE.SRGBColorSpace);
      col.setXYZ(i, _c.r, _c.g, _c.b);
    }
  }
  parts.push(painted);
  for (const hy of [0.28, 0.62]) {
    const rib = new THREE.CylinderGeometry(0.315, 0.315, 0.045, 11, 1, true);
    parts.push(P(rib.translate(0, hy, 0), STEEL, 0.06, rng));
  }
  return merge(parts);
}

function bSled(_rng: Rng): THREE.BufferGeometry { // wood-textured winter sled
  const parts = [];
  for (const s of [-1, 1]) { // runners with curled nose
    const run = box(0.07, 0.10, 1.9);
    parts.push(run.translate(s * 0.34, 0.09, 0));
    const nose = box(0.07, 0.30, 0.09);
    nose.rotateX(-0.55);
    parts.push(nose.translate(s * 0.34, 0.22, 0.95));
    for (const lz of [-0.6, 0.5]) parts.push(box(0.06, 0.18, 0.06).translate(s * 0.34, 0.23, lz));
  }
  for (let k = 0; k < 5; k++) parts.push(box(0.86, 0.045, 0.16).translate(0, 0.33, -0.75 + k * 0.33));
  return merge(parts);
}
function bSledBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const half = box(0.5, 0.06, 1.6);
  half.rotateY(0.4); half.rotateZ(0.12);
  parts.push(half.translate(-0.2, 0.08, 0));
  parts.push(...plankScatter(4, 0.6, 0.13, 0.7, rng));
  return merge(parts);
}
/**
 * (b39) The sled smashed: a runner snapped behind its curled nose, the sled's deck slats torn off — snapped, splintered
 * — and scattered, the other runner lying on its side with two slats still on it.
 */
function bSledBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bSledBrokenLegacy, rng, 0x51ed);
  const parts: THREE.BufferGeometry[] = [];
  // the runner still carrying two slats, lying on its side
  const keep: THREE.BufferGeometry[] = [box(0.07, 0.10, 1.9).translate(0.34, 0.09, 0), put(box(0.07, 0.30, 0.09), 0.34, 0.22, 0.95, -0.55, 0, 0)];
  for (const z of [-0.42, 0.24]) keep.push(box(0.6, 0.045, 0.16).translate(0.08, 0.33, z));
  for (const g of keep) { g.rotateZ(1.1); parts.push(g.translate(0.15, 0.25, 0)); }
  // the other runner snapped in two
  parts.push(put(box(0.07, 0.10, 1.05), -0.45, 0.05, -0.4, 0, 0.12, 0));
  parts.push(put(box(0.07, 0.10, 0.8), -0.6, 0.05, 0.62, 0, -0.35, 0.2));
  for (let k = 0; k < 3; k++) {
    for (const g of snappedTimber(0.16, 0.35 + o() * 0.35, 0.045, o)) parts.push(put(g, -0.2 + o() * 0.9, 0.03, (o() - 0.5) * 1.6, Math.PI / 2, o() * Math.PI, 0));
  }
  return merge(parts);
}

function bPot(rng: Rng): THREE.BufferGeometry { // baked: terracotta jar cluster (2 big + 1 small)
  const parts = [];
  const spots = [[0, 0, 0.30], [0.42, 0.12, 0.24], [-0.30, 0.28, 0.18]];
  for (const [px, pz, r] of spots) {
    const belly = new THREE.CylinderGeometry(r * 0.72, r * 0.5, r * 1.1, 8, 1);
    parts.push(P(belly.translate(px, r * 0.55, pz), TERRA, 0.10, rng));
    const shoulder = new THREE.CylinderGeometry(r * 0.42, r * 0.72, r * 0.7, 8, 1);
    parts.push(P(shoulder.translate(px, r * 1.45, pz), TERRA, 0.10, rng));
    const rim = new THREE.CylinderGeometry(r * 0.46, r * 0.42, r * 0.22, 8, 1);
    parts.push(P(rim.translate(px, r * 1.9, pz), TERRA, 0.14, rng));
  }
  return merge(parts);
}
function bPotBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  for (let k = 0; k < 8; k++) { // shard ring
    const a = rng() * Math.PI * 2, rr = 0.15 + Math.sqrt(rng()) * 0.55;
    const sh = box(0.16 + rng() * 0.14, 0.035, 0.12 + rng() * 0.1);
    sh.rotateY(rng() * Math.PI);
    sh.rotateX((rng() - 0.5) * 0.3);
    parts.push(P(sh.translate(Math.cos(a) * rr, 0.04, Math.sin(a) * rr), TERRA, 0.12, rng));
  }
  const base = new THREE.CylinderGeometry(0.20, 0.16, 0.16, 8, 1); // surviving pot base
  parts.push(P(base.translate(0.1, 0.08, -0.05), TERRA, 0.10, rng));
  return merge(parts);
}

function bRugFrame(rng: Rng): THREE.BufferGeometry { // baked: souk rug display frame with two hung rugs
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(P(box(0.09, 2.1, 0.09).translate(s * 1.1, 1.05, 0), WOOD, 0.10, rng));
  }
  parts.push(P(box(2.35, 0.08, 0.08).translate(0, 2.05, 0), WOOD, 0.10, rng));
  // vegetable-dye tones with heavy per-vertex variegation — pure saturated
  // panels read as painted plastic sheets in the first closeup pass
  const rugPals: ReadonlyArray<readonly [Palette, Palette]> = [
    [[0.03, 0.36, 0.26], [0.075, 0.30, 0.42]],
    [[0.60, 0.18, 0.24], [0.09, 0.28, 0.46]],
  ];
  for (const s of [-1, 1]) {
    const [pa, pb] = rugPals[s < 0 ? 0 : 1];
    const rug = box(0.92, 1.55, 0.045);
    parts.push(P(rug.translate(s * 0.52, 1.22, 0.02 * s), pa, 0.22, rng));
    const bandT = box(0.92, 0.22, 0.05);
    parts.push(P(bandT.translate(s * 0.52, 1.86, 0.02 * s), pb, 0.14, rng));
    const bandB = box(0.92, 0.22, 0.05);
    parts.push(P(bandB.translate(s * 0.52, 0.56, 0.02 * s), pb, 0.14, rng));
  }
  return merge(parts);
}
function bRugFrameBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const bar = box(2.2, 0.08, 0.08);
  bar.rotateY(0.3);
  parts.push(P(bar.translate(0, 0.08, 0.1), WOOD, 0.10, rng));
  const rug = box(1.0, 0.05, 1.5); // rug crumpled on the ground
  rug.rotateY(rng());
  parts.push(P(rug.translate(-0.3, 0.06, -0.1), [0.02, 0.50, 0.32], 0.12, rng));
  const rug2 = box(0.9, 0.05, 1.4);
  rug2.rotateY(rng());
  rug2.rotateX(0.08);
  parts.push(P(rug2.translate(0.5, 0.10, 0.2), [0.60, 0.25, 0.30], 0.12, rng));
  return merge(parts);
}
/**
 * (b39) The rug frame knocked down: one post snapped, its crossbar fallen with one end still on the standing post; the
 * two rugs down — one sliding off the slanted bar in folds, one heaped on the ground — in their own dyes and borders.
 */
function bRugFrameBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bRugFrameBrokenLegacy, rng, 0x26f4);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(P(box(0.09, 2.1, 0.09).translate(-1.1, 1.05, 0), WOOD, 0.10, o));
  for (const g of snappedTimber(0.09, 0.6 + o() * 0.3, 0.09, o)) parts.push(P(g.translate(1.1, 0, 0), WOOD, 0.10, o));
  // the bar from the standing post's top down to the ground
  const a = Math.atan2(1.95, 2.3);
  const bar = box(Math.hypot(2.3, 1.95), 0.08, 0.08); bar.rotateZ(-a);
  parts.push(P(bar.translate(0.05, 1.05, 0.05), WOOD, 0.10, o));
  const rugPals: ReadonlyArray<readonly [Palette, Palette]> = [
    [[0.03, 0.36, 0.26], [0.075, 0.30, 0.42]],
    [[0.60, 0.18, 0.24], [0.09, 0.28, 0.46]],
  ];
  // the first rug sliding off the bar: draped from it down to the ground, its border along its foot
  const barY = (x: number) => Math.max(0.03, 1.95 - (x + 1.1) * (1.95 / 2.3));
  const [pa, pb] = rugPals[0];
  parts.push(P(drapedStrip(-1.0, -0.1, -0.05, 0.85, 5, (x, z) => Math.max(0.03, barY(x) * (1 - z / 0.9) + 0.04 * Math.sin(z * 9 + x * 3)), 3), pa, 0.22, o));
  parts.push(P(drapedStrip(-1.0, -0.1, 0.85, 1.05, 1, () => 0.035), pb, 0.14, o));
  // the second heaped on the ground in folds
  const [qa, qb] = rugPals[1];
  const heap = drapedStrip(-0.46, 0.46, -0.7, 0.7, 6, (x, z) => 0.03 + 0.12 * Math.max(0, Math.sin(z * 4.5 + x)) * (1 - Math.abs(x) * 0.8), 3);
  const heapYaw = 0.6 + o() * 0.5; // (its border strip lies along the same end)
  parts.push(P(put(heap, 0.75, 0, 0.6, 0, heapYaw, 0), qa, 0.22, o));
  parts.push(P(put(drapedStrip(-0.46, 0.46, 0.7, 0.92, 1, () => 0.035), 0.75, 0, 0.6, 0, heapYaw, 0), qb, 0.14, o));
  return merge(parts);
}

function bLaundry(rng: Rng): THREE.BufferGeometry { // baked: two posts, line, three hung sheets
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(P(box(0.08, 1.85, 0.08).translate(s * 1.7, 0.92, 0), WOOD, 0.10, rng));
  }
  parts.push(P(box(3.4, 0.025, 0.025).translate(0, 1.80, 0), IRON, 0.04, rng));
  const tones: Palette[] = [LINEN, [0.55, 0.12, 0.52], [0.09, 0.18, 0.56]];
  for (let k = 0; k < 3; k++) {
    const sheet = box(0.78, 0.9 + rng() * 0.25, 0.035);
    sheet.rotateY((rng() - 0.5) * 0.14);
    parts.push(P(sheet.translate(-1.0 + k * 1.0, 1.34, 0), tones[k], 0.08, rng));
  }
  return merge(parts);
}
function bLaundryBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const post = box(0.08, 0.08, 1.7);
  post.rotateY(0.5);
  parts.push(P(post.translate(0.4, 0.06, 0.2), WOOD, 0.10, rng));
  for (let k = 0; k < 2; k++) {
    const sheet = box(0.9, 0.045, 1.0);
    sheet.rotateY(rng() * Math.PI);
    parts.push(P(sheet.translate((rng() - 0.5) * 1.6, 0.05, (rng() - 0.5) * 0.8), LINEN, 0.10, rng));
  }
  return merge(parts);
}
/**
 * (b39) The washing line down: one post snapped with splinters, the other still standing; the line sagging from it to
 * the ground; the three sheets fallen with it — one still hanging on the line in folds, two lying crumpled in the
 * dirt — each its own colour.
 */
function bLaundryBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bLaundryBrokenLegacy, rng, 0x1a0d);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(P(box(0.08, 1.85, 0.08).translate(-1.7, 0.92, 0), WOOD, 0.10, o));
  for (const g of snappedTimber(0.08, 0.5 + o() * 0.3, 0.08, o)) parts.push(P(g.translate(1.7, 0, 0), WOOD, 0.10, o));
  // the line: from the standing post's top sagging to the ground past the broken one
  const lineY = (x: number) => Math.max(0.02, 1.8 * Math.pow(Math.max(0, (1.2 - x) / 2.9), 1.5));
  for (let k = 0; k < 4; k++) {
    const xa = -1.7 + k * 0.85, xb = xa + 0.85, ya = lineY(xa), yb = lineY(xb), len = Math.hypot(xb - xa, yb - ya);
    const seg = box(len, 0.02, 0.02); seg.rotateZ(Math.atan2(yb - ya, xb - xa));
    parts.push(P(seg.translate((xa + xb) / 2, (ya + yb) / 2, 0), IRON, 0.04, o));
  }
  const tones: Palette[] = [LINEN, [0.55, 0.12, 0.52], [0.09, 0.18, 0.56]];
  // the first sheet still on the slack line, hanging in folds; where the line has sagged low, its hem lies on the ground
  parts.push(P(clothSheet(4, 6, (u, v) => {
    const x = -1.4 + 0.75 * u, top = lineY(x) - 0.02, drop = v * 0.95, fold = 0.035 * Math.sin(x * 13 + v * 4);
    return top - drop > 0.03 ? [x, top - drop, fold] : [x, 0.03, fold + drop - (top - 0.03)];
  }), tones[0], 0.08, o));
  // two lying crumpled
  for (let k = 1; k < 3; k++) {
    const cx = -0.2 + k * 0.85 + (o() - 0.5) * 0.3, cz = (o() - 0.5) * 0.9, ry = o() * Math.PI;
    const sheet = drapedStrip(-0.42, 0.42, -0.5, 0.5, 4, (x, z) => 0.025 + 0.07 * Math.max(0, Math.sin(x * 6 + z * 3 + k)) * (1 - Math.abs(z)), 3);
    parts.push(P(put(sheet, cx, 0, cz, 0, ry, 0), tones[k], 0.08, o));
  }
  return merge(parts);
}

function bHaycart(rng: Rng): THREE.BufferGeometry { // baked: intact hay cart — bed, rails, 2 wheels, shafts, hay load
  const parts = [];
  parts.push(P(box(1.6, 0.12, 2.6).translate(0, 0.72, 0), WOOD, 0.12, rng));
  for (const s of [-1, 1]) {
    parts.push(P(box(0.08, 0.4, 2.6).translate(s * 0.78, 0.94, 0), WOOD_PALE, 0.12, rng));
    parts.push(...cartWheel(0.62, rng).map((g) => g.translate(s * 0.92, 0.62, 0.35)));
    const shaft = box(0.07, 0.07, 1.7);
    shaft.rotateX(-0.22);
    parts.push(P(shaft.translate(s * 0.5, 0.58, -1.95), WOOD, 0.10, rng));
  }
  const hay = new THREE.ConeGeometry(1.05, 1.1, 8, 1);
  hay.scale(1, 1, 1.35);
  parts.push(P(hay.translate(0, 1.45, 0.1), HAY, 0.14, rng));
  const prop = box(0.08, 0.62, 0.08); // standing prop leg under the shafts
  prop.rotateX(0.1);
  parts.push(P(prop.translate(0, 0.30, -2.0), WOOD, 0.10, rng));
  return merge(parts);
}
function bHaycartBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const bed = box(1.55, 0.10, 2.5); // bed dropped and skewed
  bed.rotateY(0.24); bed.rotateZ(0.16);
  parts.push(P(bed.translate(0, 0.28, 0), WOOD, 0.12, rng));
  const w1 = merge(cartWheel(0.60, rng));
  w1.rotateX(Math.PI / 2);
  parts.push(w1.translate(1.15, 0.08, 0.7));
  const w2 = merge(cartWheel(0.60, rng));
  w2.rotateX(Math.PI / 2 - 0.35);
  w2.rotateY(0.8);
  parts.push(w2.translate(-1.05, 0.16, -0.5));
  const hay = new THREE.CylinderGeometry(0.9, 1.2, 0.4, 8, 1); // spilled hay
  parts.push(P(hay.translate(0.3, 0.42, 0.4), HAY, 0.14, rng));
  parts.push(...plankScatter(3, 0.8, 0.14, 1.0, rng, WOOD_PALE));
  return merge(parts);
}

function bHandcart(_rng: Rng): THREE.BufferGeometry { // wood-textured: small two-wheel hand cart, tipped back
  const parts = [];
  const bed = box(0.95, 0.09, 1.5);
  bed.rotateX(-0.18);
  parts.push(bed.translate(0, 0.52, 0));
  for (const s of [-1, 1]) {
    const rail = box(0.06, 0.25, 1.5);
    rail.rotateX(-0.18);
    parts.push(rail.translate(s * 0.46, 0.68, 0));
    const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10, 1);
    scaleUV(wheel, 1.5, 1.5);
    wheel.rotateZ(Math.PI / 2);
    parts.push(wheel.translate(s * 0.56, 0.42, 0.30));
    const handle = box(0.05, 0.05, 0.85);
    handle.rotateX(-0.18);
    parts.push(handle.translate(s * 0.40, 0.78, -1.05));
  }
  const leg = box(0.06, 0.34, 0.06);
  parts.push(leg.translate(0, 0.17, -0.62));
  return merge(parts);
}
function bHandcartBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const bed = box(0.9, 0.08, 1.4);
  bed.rotateY(0.5); bed.rotateZ(2.6); // flipped
  parts.push(bed.translate(0, 0.24, 0));
  const wheel = new THREE.CylinderGeometry(0.40, 0.40, 0.07, 10, 1);
  scaleUV(wheel, 1.5, 1.5);
  wheel.rotateX(Math.PI / 2 - 0.2);
  parts.push(wheel.translate(0.7, 0.08, 0.4));
  parts.push(...plankScatter(3, 0.6, 0.12, 0.7, rng));
  return merge(parts);
}

function bHaystack(rng: Rng): THREE.BufferGeometry { // straw-textured slouched field stack (was merged geometry)
  // (b21; gauntlet wave 139: the legacy cone read as "a straight-edged, four-sided pyramid" — it is the kopna now,
  // haystackKit buildKopna, from a stream of its own: the cone's draws are still spent here, one a jittered vertex, so
  // every pool built after the stacks keeps its geometry)
  const hr = 1.9, hh = 2.5;
  const stack = new THREE.ConeGeometry(hr, hh, 9, 2);
  const sp = stack.attributes.position;
  for (let k = 0; k < sp.count; k++) {
    if (Math.hypot(sp.getX(k), sp.getZ(k)) > 1e-4) rng();
  }
  stack.dispose();
  return buildKopna();
}
function bHaystackBrokenLegacy(rng: Rng): THREE.BufferGeometry { // driven-through stack: low split mound
  const parts = [];
  for (const [ox, oz, r] of [[-0.8, 0.2, 1.3], [0.9, -0.3, 1.1], [0.1, 0.9, 0.8]]) {
    const mound = new THREE.CylinderGeometry(r * 0.55, r, 0.62, 8, 1);
    mapToBand(scaleUV(mound, 2, 0.6), HAY_FACE_V);
    const p = mound.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 1 + (rng() - 0.5) * 0.3;
      p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f);
    }
    mound.computeVertexNormals();
    parts.push(mound.translate(ox, 0.30, oz));
  }
  return merge(parts);
}
/** (b39) The kopna torn open (haystackKit spilledStack): no pole, its hay fanned out of the bite. */
function bHaystackBroken(rng: Rng): THREE.BufferGeometry {
  return spilledStack(spentDraws(bHaystackBrokenLegacy, rng, 0x4a75), { R: 1.5, H: 2.3 });
}

// ---------------------------------------------------------------------------
// fence segment kit (FENCE_SEG pitch, run along local Z, post at -Z end)
// ---------------------------------------------------------------------------

function bFencePlank(rng: Rng): THREE.BufferGeometry { // wood-textured: post + 3 rough horizontal planks
  const parts = [];
  const post = box(0.12, 1.15, 0.12);
  post.rotateY((rng() - 0.5) * 0.1);
  parts.push(post.translate(0, 0.48, -FENCE_SEG / 2));
  for (const [rh, tilt] of [[0.34, 0.02], [0.66, -0.02], [0.95, 0.015]]) {
    const rail = box(0.06, 0.17, FENCE_SEG * 1.02);
    rail.rotateX(tilt);
    parts.push(rail.translate(0, rh, 0));
  }
  return merge(parts);
}
function bFencePlankBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const stub = box(0.12, 0.35, 0.12);
  stub.rotateX(0.14);
  parts.push(stub.translate(0, 0.15, -FENCE_SEG / 2));
  for (let k = 0; k < 3; k++) {
    const p = box(0.05, 0.15, 0.8 + rng() * 1.0);
    p.rotateY((rng() - 0.5) * 0.9);
    p.rotateZ(Math.PI / 2 - 0.06 + rng() * 0.1);
    p.translate((rng() - 0.5) * 0.6, 0.08 + rng() * 0.05, (rng() - 0.5) * FENCE_SEG * 0.8);
    parts.push(p);
  }
  return merge(parts);
}

function bFencePicket(rng: Rng): THREE.BufferGeometry { // baked: whitewashed picket module
  const parts = [];
  const post = box(0.10, 1.0, 0.10);
  parts.push(P(post.translate(0, 0.45, -FENCE_SEG / 2), WHITEWASH, 0.10, rng));
  for (const rh of [0.38, 0.78]) {
    parts.push(P(box(0.05, 0.09, FENCE_SEG * 1.02).translate(0, rh, 0), WHITEWASH, 0.10, rng));
  }
  const n = 7;
  for (let k = 0; k < n; k++) {
    const pk = box(0.045, 0.85 + (rng() - 0.5) * 0.1, 0.11);
    pk.rotateX((rng() - 0.5) * 0.05);
    parts.push(P(pk.translate(0.045, 0.52, -FENCE_SEG / 2 + (k + 0.5) * (FENCE_SEG / n)), WHITEWASH, 0.14, rng));
  }
  return merge(parts);
}
function bFencePicketBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const stub = box(0.10, 0.3, 0.10);
  parts.push(P(stub.translate(0, 0.13, -FENCE_SEG / 2), WHITEWASH, 0.10, rng));
  const mat = box(0.05, 0.9, FENCE_SEG * 0.9); // picket mat knocked flat
  mat.rotateZ(Math.PI / 2 - 0.08);
  parts.push(P(mat.translate(0.2, 0.09, 0.1), WHITEWASH, 0.14, rng));
  for (let k = 0; k < 2; k++) {
    const pk = box(0.045, 0.7, 0.11);
    pk.rotateZ(Math.PI / 2 - 0.2 + rng() * 0.4);
    pk.rotateY(rng());
    parts.push(P(pk.translate((rng() - 0.5) * 0.8, 0.07, (rng() - 0.5) * 1.6), WHITEWASH, 0.12, rng));
  }
  return merge(parts);
}
/**
 * (b39) The picket module broken through: its post snapped with splinters; both rails broken mid-span — the post's half
 * of each hanging from the post to the ground, the far halves lying — three pickets still nailed to the hanging rails,
 * the rest knocked flat and scattered, a few splinters in the grass; all in its whitewash.
 */
function bFencePicketBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bFencePicketBrokenLegacy, rng, 0x91c3);
  const parts: THREE.BufferGeometry[] = [];
  const z0 = -FENCE_SEG / 2;
  for (const g of snappedTimber(0.10, 0.55 + o() * 0.2, 0.10, o, 3)) parts.push(P(g.translate(0, -0.05, z0), WHITEWASH, 0.10, o));
  // the post's rail halves: from the post down to the ground, tilted
  const fall = 0.5 + o() * 0.12;
  for (const [rh, len] of [[0.78, FENCE_SEG * 0.55], [0.38, FENCE_SEG * 0.42]] as const) {
    const a = Math.asin(Math.min(0.95, rh / len));
    const rail = box(0.05, 0.09, len);
    rail.translate(0, 0, len / 2);
    rail.rotateX(a);
    parts.push(P(rail.translate(0.02, rh, z0), WHITEWASH, 0.10, o));
  }
  // three pickets on the hanging rails, leaning with them
  for (let k = 0; k < 3; k++) {
    const zc = z0 + 0.25 + k * 0.32, along = (zc - z0) / (FENCE_SEG * 0.55), y = 0.78 * (1 - along) * 0.75 + 0.2;
    parts.push(P(put(box(0.045, 0.85, 0.11), 0.06, y, zc, -fall * (0.6 + 0.4 * along), 0, (o() - 0.5) * 0.15), WHITEWASH, 0.14, o));
  }
  // the far rail halves and the other pickets lying
  for (const [x, z, ry] of [[0.35, 0.55, 0.3 + o() * 0.3], [-0.25, 0.75, -0.2 - o() * 0.3]] as const) {
    parts.push(P(put(box(0.05, 0.09, FENCE_SEG * 0.45), x, 0.05, z, 0, ry, Math.PI / 2), WHITEWASH, 0.10, o));
  }
  for (let k = 0; k < 4; k++) {
    parts.push(P(put(box(0.045, 0.82, 0.11), (o() - 0.5) * 1.3, 0.04, 0.1 + o() * 1.1, Math.PI / 2, o() * Math.PI, 0), WHITEWASH, 0.14, o));
  }
  for (let k = 0; k < 4; k++) {
    parts.push(P(put(box(0.02, 0.12 + o() * 0.12, 0.03), (o() - 0.5) * 0.9, 0.02, z0 + 0.4 + o() * 0.8, Math.PI / 2, o() * Math.PI, 0), WHITEWASH, 0.16, o));
  }
  return merge(parts);
}

function bFenceWattle(_rng: Rng): THREE.BufferGeometry { // wood-textured woven hurdle fence
  const parts = [];
  for (const pz of [-FENCE_SEG / 2, 0]) {
    const post = box(0.09, 1.0, 0.09);
    parts.push(post.translate(0, 0.42, pz));
  }
  for (let k = 0; k < 5; k++) { // woven withies: slim rails with alternating bow
    const w = new THREE.CylinderGeometry(0.028, 0.028, FENCE_SEG * 1.03, 5, 1);
    scaleUV(w, 0.6, 0.6);
    w.rotateX(Math.PI / 2);
    w.translate((k % 2 ? 0.035 : -0.035), 0.16 + k * 0.17, 0);
    parts.push(w);
  }
  return merge(parts);
}
function bFenceWattleBrokenLegacy(_rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const mat = box(0.06, 0.8, FENCE_SEG * 0.85); // collapsed woven mat
  mat.rotateZ(Math.PI / 2 - 0.1);
  parts.push(mat.translate(0.15, 0.07, 0));
  const stub = box(0.09, 0.3, 0.09);
  parts.push(stub.translate(0, 0.13, -FENCE_SEG / 2));
  return merge(parts);
}
/**
 * (b39) The woven hurdle broken: one stake still standing, leaning, the other snapped with splinters; the weave torn
 * from the broken side — each withy bent where it tore and sagging to the ground, its strands parting — and two withies
 * pulled loose, lying across the grass.
 */
function bFenceWattleBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bFenceWattleBrokenLegacy, rng, 0x3a77);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(put(box(0.09, 1.0, 0.09).translate(0, 0.5, 0), 0, -0.08, -FENCE_SEG / 2, 0.12, 0, (o() - 0.5) * 0.12));
  for (const g of snappedTimber(0.09, 0.42 + o() * 0.15, 0.09, o)) parts.push(g.translate(0, -0.08, 0));
  const withy = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    const w = new THREE.CylinderGeometry(0.028, 0.028, len, 5, 1, true);
    scaleUV(w, 0.6, 0.6 * len);
    w.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)));
    return w.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  };
  // the weave: each withy from the standing stake, bent where it tore, sagging toward the snapped one's ground
  const z0 = -FENCE_SEG / 2;
  for (let k = 0; k < 5; k++) {
    const y0 = 0.16 + k * 0.17, x0 = k % 2 ? 0.035 : -0.035;
    const zt = z0 + FENCE_SEG * (0.35 + o() * 0.25), yt = y0 * (0.55 + o() * 0.25);
    const ze = zt + FENCE_SEG * (0.25 + o() * 0.2), ye = 0.03 + o() * 0.05, xe = x0 + 0.15 + o() * 0.35;
    parts.push(withy(x0, y0, z0, x0 + (o() - 0.5) * 0.06, yt, zt));
    parts.push(withy(x0 + (o() - 0.5) * 0.06, yt, zt, xe, ye, ze));
  }
  for (let k = 0; k < 2; k++) {
    const a = o() * Math.PI, x = 0.3 + o() * 0.5, z = (o() - 0.5) * FENCE_SEG * 0.8, len = 0.9 + o() * 0.6;
    parts.push(withy(x - Math.cos(a) * len / 2, 0.03, z - Math.sin(a) * len / 2, x + Math.cos(a) * len / 2, 0.04, z + Math.sin(a) * len / 2));
  }
  return merge(parts);
}

function bFenceRail(rng: Rng): THREE.BufferGeometry { // baked: stone posts + twin timber rails
  const parts = [];
  const post = box(0.16, 1.05, 0.16);
  parts.push(P(post.translate(0, 0.44, -FENCE_SEG / 2), [0.09, 0.10, 0.34], 0.10, rng));
  for (const rh of [0.42, 0.82]) {
    parts.push(P(box(0.07, 0.10, FENCE_SEG * 1.02).translate(0, rh, 0), WOOD, 0.12, rng));
  }
  return merge(parts);
}
function bFenceRailBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const post = box(0.16, 1.0, 0.16); // stone post survives, tipped
  post.rotateX(0.5);
  parts.push(P(post.translate(0, 0.30, -FENCE_SEG / 2 + 0.2), [0.09, 0.10, 0.34], 0.10, rng));
  for (let k = 0; k < 2; k++) {
    const r = box(0.07, 0.10, FENCE_SEG * (0.5 + rng() * 0.4));
    r.rotateY((rng() - 0.5) * 0.8);
    parts.push(P(r.translate((rng() - 0.5) * 0.4, 0.06, (rng() - 0.5) * 0.8), WOOD, 0.12, rng));
  }
  return merge(parts);
}

function bGate(_rng: Rng): THREE.BufferGeometry { // wood-textured farm gate (hangs open ~30°)
  const parts = [];
  const frame = [];
  frame.push(box(0.07, 0.95, 1.5).translate(0, 0.62, 0.75)); // gate leaf about hinge at z=0
  const brace = box(0.05, 0.09, 1.7);
  brace.rotateX(0.55);
  frame.push(brace.translate(0.01, 0.62, 0.75));
  for (const g of frame) { g.rotateY(0.55); parts.push(g); }
  for (const pz of [0, 1.75]) { // hinge + latch posts
    const post = box(0.14, 1.25, 0.14);
    parts.push(post.translate(0, 0.55, pz));
  }
  return merge(parts);
}
function bGateBrokenLegacy(_rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const leaf = box(0.07, 1.4, 0.9);
  leaf.rotateZ(Math.PI / 2 - 0.12);
  leaf.rotateY(0.4);
  parts.push(leaf.translate(0.3, 0.09, 0.8));
  const post = box(0.14, 0.4, 0.14);
  post.rotateX(0.2);
  parts.push(post.translate(0, 0.17, 0));
  return merge(parts);
}
/**
 * (b39) The farm gate smashed: torn off its hinges and lying on the ground, its brace snapped in two; the hinge post
 * leaning out of true, the latch post broken off with splinters.
 */
function bGateBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bGateBrokenLegacy, rng, 0x6a7e);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(put(box(0.14, 1.25, 0.14).translate(0, 0.55, 0), 0, -0.05, 0, 0.16, 0, -0.1));
  for (const g of snappedTimber(0.14, 0.35 + o() * 0.25, 0.14, o, 3)) parts.push(g.translate(0, -0.05, 1.75));
  const ry = 0.3 + o() * 0.4;
  parts.push(put(box(0.95, 0.07, 1.5), 0.45, 0.05, 0.85, 0, ry, 0.05));
  const b1 = box(0.05, 0.09, 0.95); parts.push(put(b1, 0.42, 0.1, 0.55, 0.04, ry + 0.55, 0));
  const b2 = box(0.05, 0.09, 0.7); parts.push(put(b2, 0.9, 0.06, 1.25, 0, ry - 0.9, 0.08));
  return merge(parts);
}

// ---------------------------------------------------------------------------
// DESTRUCTIBLES r1 — heavier light-cover + vehicle families. Same intact/
// broken pairing as the r1 kit; the new metadata knobs (keep/crushMin/
// collider/explosive) are consumed by props.ts (see DESTRUCTIBLE_TYPES docs).
// ---------------------------------------------------------------------------

export const WALL_SEG = 3.0; // wall-kit module pitch, meters
/** The mud wall's print density along and round it: one field-mud tile (fieldMudSurface.ts) is one module, 3 m. */
export const ADOBE_UV_PER_M = 1 / WALL_SEG;

// dark faded olive-drab / field-grey band — the first cut sat at l 0.22-0.30
// with s 0.24+ and the truck cabs tonemapped to toy lego-green in the frame
// review; military paint under this sun needs to start near-charcoal
const OLIVE: Palette = [0.19, 0.20, 0.185];
const OLIVE_D: Palette = [0.20, 0.22, 0.145];
const TENTCANVAS: Palette = [0.10, 0.16, 0.295];
const TENTCANVAS_D: Palette = [0.095, 0.14, 0.225];
const CHAR: Palette = [0.07, 0.10, 0.055];
const CHAR_RUST: Palette = [0.05, 0.42, 0.16];
const REDDRUM: Palette = [0.015, 0.62, 0.34];
const TIRE: Palette = [0.60, 0.03, 0.075];

/** char-paint with rust bloom — burnt-hulk vertex palette (truck/jeep wrecks) */
function charPaint<T extends THREE.BufferGeometry>(geo: T, rng: Rng, rustBias = 0.2): T {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    if (rng() < rustBias) {
      _c.setHSL(CHAR_RUST[0], CHAR_RUST[1], CHAR_RUST[2] + (rng() - 0.5) * 0.07, THREE.SRGBColorSpace);
    } else {
      _c.setHSL(CHAR[0], CHAR[1], Math.max(0.02, CHAR[2] + (rng() - 0.5) * 0.045), THREE.SRGBColorSpace);
    }
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// --- masonry wall modules (WALL_SEG pitch, run along local Z) ---------------
// UV'd for the map-toned stone/plaster materials (props.ts routes meta.mat).
// Irregular per-course offsets kill the one-box-per-6m silhouette the old
// merged runs had; the broken state is a low crumbled remnant + tumbled
// blocks — drive-over rubble that persists for the battle.

function wallCourses(
  rng: Rng,
  thick: number,
  courses: readonly number[],
): { parts: THREE.BufferGeometry[]; top: number } {
  const parts: THREE.BufferGeometry[] = [];
  let y = 0;
  for (let c = 0; c < courses.length; c++) {
    const ch = courses[c];
    const seg = box(thick + (rng() - 0.5) * 0.04, ch, WALL_SEG * (0.985 + rng() * 0.03), 0.7);
    seg.rotateY((rng() - 0.5) * 0.012);
    parts.push(seg.translate((rng() - 0.5) * 0.05, y + ch / 2, 0));
    y += ch - 0.015;
  }
  return { parts, top: y };
}

function wallStoneEnvelope(rng: Rng): THREE.BufferGeometry {
  const { parts, top } = wallCourses(rng, 0.46, [0.42, 0.38, 0.30]);
  // uneven capstone course: 4 slabs with per-slab pitch
  for (let k = 0; k < 4; k++) {
    const cap = box(0.56, 0.11, WALL_SEG * 0.26, 0.9);
    cap.rotateX((rng() - 0.5) * 0.08);
    cap.rotateZ((rng() - 0.5) * 0.06);
    parts.push(cap.translate((rng() - 0.5) * 0.04, top + 0.04, -WALL_SEG / 2 + (k + 0.5) * (WALL_SEG / 4)));
  }
  return merge(parts);
}
function wallStoneBrokenDraws(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  // crumbled remnant courses: two low stubs with a bite between them
  for (const [z0, len] of [[-WALL_SEG / 2, WALL_SEG * 0.30], [WALL_SEG * 0.14, WALL_SEG * 0.34]]) {
    const h = 0.20 + rng() * 0.22;
    const stub = box(0.46, h, len, 0.7);
    stub.rotateX((rng() - 0.5) * 0.1);
    parts.push(stub.translate((rng() - 0.5) * 0.08, h / 2, z0 + len / 2));
  }
  for (let k = 0; k < 7; k++) { // tumbled blocks feathering both faces
    const bs = 0.14 + rng() * 0.20;
    const blk = box(bs * (1.1 + rng() * 0.7), bs * 0.75, bs, 1.2);
    blk.rotateY(rng() * Math.PI);
    blk.rotateX((rng() - 0.5) * 0.5);
    blk.translate((rng() - 0.5) * 1.7, bs * 0.3, (rng() - 0.5) * WALL_SEG * 0.95);
    parts.push(blk);
  }
  return merge(parts);
}

// The scenery lane (2026-10-03; the gauntlet's wave 0: "a stone wall built from obviously stacked rectangular blocks
// with no mortar lines, weathering or chipped corners"): the field wall is built as a dry-stone wall — a battered
// hearting, face stones of every size standing proud of it in rough courses, their corners knocked off, and a coping of
// cope stones set on edge along the top. The original course builder still runs first: it spends exactly the draws it
// always spent (every pool built after the wall keeps its geometry) and gives the module's envelope, and the new wall
// is fitted to that envelope, so the fitted wall collider (wallSpanPlacement.ts refits it to the geometry) keeps its
// plan and height; only its foot follows the new stones' ground samples by a millimetre or two. Where a map's stone
// bucket is a brick print (sourcedStoneIsBrick, sourcedTextures.ts) the coursed module stays — its courses are what
// the brick print was laid out for — through COURSED_WALLSTONE in props.ts's local types.
function dryStoneRng(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Keep only the listed faces of a box (BoxGeometry's face groups run +x, -x, +y, -y, +z, -z). */
function keepFaces<T extends THREE.BufferGeometry>(g: T, keep: readonly number[]): T {
  const index = g.index!.array, kept: number[] = [];
  for (const group of g.groups) {
    if (!keep.includes(group.materialIndex ?? 0)) continue;
    for (let i = group.start; i < group.start + group.count; i++) kept.push(index[i]);
  }
  g.setIndex(kept);
  g.clearGroups();
  return g;
}

/** The wall's texture density (tiles a metre): a face stone's window of the field print. */
const DRY_UV = 1.2;

/**
 * The dry-stone module's parts by kind (the aStone attribute's w): the material settles a wall's stones and drops the
 * odd cope by the world place of each stone's centre (props.ts, the stone wall hook), so a run's modules differ.
 */
export const DRY_STONE_KIND = { core: 0, face: 1, through: 2, cope: 3, tumbled: 4, snow: 5 } as const;

/** Tag a part with its centre (its box's) and its kind, on every vertex (aStone: x, y, z, kind). */
function tagStone<T extends THREE.BufferGeometry>(g: T, kind: number): T {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  const n = g.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = c.x; a[i * 4 + 1] = c.y; a[i * 4 + 2] = c.z; a[i * 4 + 3] = kind; }
  g.setAttribute('aStone', new THREE.BufferAttribute(a, 4));
  return g;
}

/**
 * A stone: a box with its corners knocked back a little (each corner moves inward by up to `knockBack` of its half
 * extents), only its listed faces kept, and a window of the field print of its own projected on each face at the wall's
 * density (wave 34: the print is one stone's skin over its face band — fieldStoneSurface.ts — and every face's window
 * lies inside that band: u along the stone, v up its sides and across its top).
 */
function roughStone(
  w: number, h: number, d: number, r: Rng, keep: readonly number[], knockBack = 0.1, knockY = knockBack,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const knock = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.sign(p.getX(i))},${Math.sign(p.getY(i))},${Math.sign(p.getZ(i))}`;
    let k = knock.get(key);
    if (!k) knock.set(key, k = [1 - r() * knockBack, 1 - r() * knockY, 1 - r() * knockBack]);
    p.setXYZ(i, p.getX(i) * k[0], p.getY(i) * k[1], p.getZ(i) * k[2]);
  }
  const du = r() * 8, place = r();
  const extent = Math.max(h, w) * DRY_UV, room = FIELD_STONE_FACE_V[1] - FIELD_STONE_FACE_V[0];
  const squash = extent > room ? room / extent : 1;
  const v0 = FIELD_STONE_FACE_V[0] + place * Math.max(0, room - extent * squash) + (extent * squash) / 2;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [a, b] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getZ(i), p.getX(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, du + a * DRY_UV, v0 + b * DRY_UV * squash);
  }
  g.computeVertexNormals();
  return keepFaces(g, keep);
}

/**
 * The dry-stone module along +Z (local X across, base at y = 0), before it is fitted to the original envelope: a
 * battered hearting (the field print's hearting band: packing stones and dark voids where it shows), face stones laid
 * in rough courses standing a little proud of it, and flattish top stones laid across. About 300 triangles: the faces
 * no one sees are left out.
 */
function dryStoneModule(r: Rng, broken: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const L = WALL_SEG, H = broken ? 0.32 + r() * 0.16 : 0.92, bottom = 0.26, top = broken ? 0.22 : 0.18;
  const halfAt = (y: number) => bottom + (top - bottom) * Math.min(1, y / 0.92);
  // the hearting: a battered core, its faces a little uneven; its bottom sits in the ground and is left out
  const core = new THREE.BoxGeometry(2, 1, 2, 1, 1, 2);
  const cp = core.attributes.position;
  // (b14: a whole module's hearting stops where its face stones do, under the copes: where the material drops a cope
  // the face stones' tops and the rubble show, not a slab standing above them)
  const coreH = broken ? H : H - 0.1;
  // the unevenness is a function of the corner's place (the box's faces share their corners: no crack opens); the
  // bow is nil at both ends, where the next module meets it, and the +z end steps a centimetre and a half inside the
  // next module's start, so the overlapping ends of a run never share a plane (no depth fighting at the joints)
  const phase = r() * 10, bow = (r() < 0.5 ? -1 : 1) * 0.012;
  const lift = (x: number, z: number) => Math.sin(z * 7.3 + x * 3.1 + phase) * 0.5 + Math.sin(z * 17.9 - phase) * 0.5;
  for (let i = 0; i < cp.count; i++) {
    const u = cp.getZ(i), y = (cp.getY(i) + 0.5) * coreH, z = u * (L / 2) * 0.995, side = Math.sign(cp.getX(i));
    const half = halfAt(y) - 0.03 - Math.max(0, u - 0.5) * 0.03;
    cp.setXYZ(i, side * half + Math.sin(Math.PI * u) * bow, y + (y > 0.01 ? lift(side, z) * 0.015 : 0), z);
  }
  core.computeVertexNormals();
  // (wave 34: the core reads the print's hearting band — u along the wall, v up its height across the band once)
  {
    const cn = core.attributes.normal, cuv = core.attributes.uv;
    const [h0, h1] = FIELD_STONE_HEARTING_V;
    for (let i = 0; i < cp.count; i++) {
      const up = Math.abs(cn.getY(i)) > 0.5, across = Math.abs(cn.getX(i)) > 0.5;
      const t = up ? 0.5 + cp.getX(i) / (2 * bottom) : Math.min(1, Math.max(0, cp.getY(i) / coreH));
      cuv.setXY(i, (across || up ? cp.getZ(i) : cp.getX(i)) * DRY_UV, h0 + (h1 - h0) * t);
    }
  }
  parts.push(tagStone(keepFaces(core, [0, 1, 2, 4, 5]), DRY_STONE_KIND.core));
  // the face stones (wave 34, "coursed rubble relief"): laid in rough courses, the biggest at the foot as a waller lays
  // them, each course's line the module's own (a run repeats the module, so its courses meet the next one's) and every
  // stone sitting on what is under it, a little high or low; now and then a jumper standing two courses high, a pair
  // of thin stones in one course, a pin; a few millimetres between neighbours, the odd gap where the hearting shows;
  // each stone one to three centimetres proud of the hearting, leaning out a little as a face settles. A stone's top
  // ledge carries a normal leaning out (wave 34: the snow cap whitened every ledge into "thin white slivers")
  const CELL = 0.02, cells = Math.round(L / CELL);
  const iOf = (z: number) => Math.max(0, Math.min(cells, Math.round((z + L / 2) / CELL)));
  const limit = broken ? H : H - 0.12; // the top stones finish the wall
  const nCourses = broken ? (H > 0.4 ? 3 : 2) : 4;
  const heights: number[] = [];
  // (b14, wave 97: "stacked brown rectangular slabs of near-identical size and thickness": the courses' heights from a
  // third more to two thirds of the mean, the foot's the biggest)
  for (let c = 0; c < nCourses; c++) heights.push((1.3 - c * 0.15) * (0.66 + r() * 0.68));
  const sumH = heights.reduce((a, b) => a + b, 0);
  const lines = [0];
  for (const h of heights) lines.push(lines[lines.length - 1] + (h / sumH) * limit);
  const skylines: Float32Array[] = [];
  for (const face of [-1, 1]) {
    const keep = face > 0 ? [0, 2] : [1, 2];
    const sky = new Float32Array(cells + 1);
    const taken: Array<Array<[number, number]>> = lines.map(() => []); // jumpers' spans, per course they reach into
    const layStone = (z0: number, z1: number, y0: number, y1: number): void => {
      const za = Math.max(-L / 2, z0), zb = Math.min(L / 2, z1);
      if (zb - za < 0.06) return;
      // (it sits on what is under it — the stones below, or the ground — bedded a centimetre into the middle of their
      // tops (a higher one under its end hides inside it), so no bed joint gapes along the course; its knocked corners
      // leave the voids)
      const under: number[] = [];
      for (let i = iOf(za); i <= iOf(zb); i++) under.push(sky[i]);
      under.sort((p, q) => p - q);
      const bed = under[Math.floor(under.length * 0.5)];
      const base = bed > 0 ? bed - 0.01 : y0;
      const topY = Math.max(base + 0.05, y1);
      const hh = topY - base, yc = base + hh / 2, proud = 0.006 + r() * 0.022;
      // (its corners knocked well back along the course, little in its height: the bed joints close, the corners gape)
      const stone = roughStone(proud + 0.07, hh, zb - za, r, keep, 0.34, 0.22);
      // (wave 34 re-shoot, "flat grey from a distance": each stone's face turned a little its own way — up to a
      // ninth of a radian — in its shading only, so neighbours catch the light differently and read stone by stone)
      // (wave 48, "crisp rectangular blocks … stacked crates or voxels": and its face shaded as a rounded stone — each
      // corner's normal leaning out from the face's middle, so the light rolls off toward its edges)
      const nrm = stone.attributes.normal, spos = stone.attributes.position, tiltY = (r() - 0.5) * 0.22, tiltZ = (r() - 0.5) * 0.22;
      const halfH = Math.max(0.02, hh / 2), halfL = Math.max(0.02, (zb - za) / 2);
      for (let i = 0; i < nrm.count; i++) {
        if (nrm.getY(i) >= 0.6) {
          const l = Math.hypot(0.9, 0.42);
          nrm.setXYZ(i, (face * 0.9) / l, 0.42 / l, 0);
        } else if (Math.abs(nrm.getX(i)) > 0.5) {
          const roundY = Math.max(-1, Math.min(1, spos.getY(i) / halfH)) * 0.38, roundZ = Math.max(-1, Math.min(1, spos.getZ(i) / halfL)) * 0.3;
          const x = nrm.getX(i), y = nrm.getY(i) + tiltY + roundY, z = nrm.getZ(i) + tiltZ + roundZ, l = Math.hypot(x, y, z) || 1;
          nrm.setXYZ(i, x / l, y / l, z / l);
        }
      }
      // (b14: each stone set at its own tilt in the face, its bed off the course line: no stacked slabs)
      stone.rotateZ(face * ((r() - 0.5) * 0.07 - 0.02)); stone.rotateX((r() - 0.5) * 0.16); stone.rotateY((r() - 0.5) * 0.08);
      parts.push(tagStone(stone.translate(face * (halfAt(yc) - 0.03 + proud - (proud + 0.07) / 2), yc, (za + zb) / 2), DRY_STONE_KIND.face));
      for (let i = iOf(za); i <= iOf(zb); i++) sky[i] = Math.max(sky[i], topY);
    };
    for (let c = 0; c < nCourses; c++) {
      const y0 = lines[c], y1 = lines[c + 1], ch = y1 - y0;
      let z = -L / 2 - r() * 0.35;
      while (z < L / 2) {
        // a jumper from the course below already stands here: lay on past it
        const jump = taken[c].find(([a, b]) => z >= a - 0.01 && z < b);
        if (jump) { z = jump[1] + 0.004; continue; }
        const pick = r();
        // (b14: lengths from a hand to a metre — a long bonder, a run of small ones — not a course of equal slabs)
        const len = (c === 0 ? 0.3 : 0.18) + Math.pow(r(), 1.6) * (c === 0 ? 0.85 : 0.7);
        const gap = r() < 0.14 ? 0.012 + r() * 0.025 : 0.004;
        const settle = (r() - 0.5) * 0.05;
        if (pick < 0.1 && c + 1 < nCourses) {
          // a jumper: one stone two courses high
          const jl = Math.min(len, 0.55);
          layStone(z, z + jl, y0 + settle * 0.5, lines[c + 2] + settle);
          taken[c + 1].push([z, z + jl]);
          z += jl + gap;
        } else if (pick < 0.26) {
          // two thin stones in the course, one on the other
          const split = 0.38 + r() * 0.24, pl = len * (0.75 + r() * 0.2);
          layStone(z, z + pl, y0, y0 + ch * split);
          layStone(z + (r() - 0.5) * 0.06, z + pl * (0.85 + r() * 0.2), y0 + ch * split, y1 + settle);
          z += pl + gap;
        } else if (pick < 0.38) {
          // a pin wedged before the next stone
          const pl = 0.08 + r() * 0.07;
          layStone(z, z + pl, y0 + ch * (0.15 + r() * 0.3), y0 + ch * (0.55 + r() * 0.3));
          z += pl + 0.004;
        } else {
          layStone(z, z + len, y0 + settle * 0.3, y1 + settle);
          z += len + gap;
        }
      }
    }
    skylines.push(sky);
  }
  if (!broken) {
    // a through-stone or two, long enough to show its ends on both faces, laid at a course line
    for (let k = 0, n = 1 + (r() < 0.5 ? 1 : 0); k < n; k++) {
      const y = lines[1 + Math.floor(r() * 2)] + 0.04, len = 0.18 + r() * 0.12, th = 0.09 + r() * 0.05;
      const ts = roughStone(halfAt(y) * 2 + 0.12, th, len, r, [0, 1, 2, 4, 5]);
      parts.push(tagStone(ts.translate((r() - 0.5) * 0.03, y, (r() - 0.5) * (L - 0.6)), DRY_STONE_KIND.through));
    }
    // the top (b14, wave 97: "a dead-level top"): a coping of stones set on edge across the wall, as a Dalmatian or a
    // Cotswold waller finishes one — each 6-15 cm thick along the wall, standing 12-20 cm on the rubble under it, its
    // own lean, the odd flat top stone among them — so the top is a ragged line of copes, not a course. The material
    // settles them and drops the odd one (props.ts), so a run's modules differ
    let z = -L / 2 + 0.005;
    while (z < L / 2 - 0.04) {
      const flat = r() < 0.12;
      const len = Math.min(L / 2 - z, flat ? 0.22 + r() * 0.2 : 0.06 + r() * 0.09);
      const ch = flat ? 0.08 + r() * 0.06 : 0.12 + r() * 0.08;
      const a = Math.max(0, Math.floor((z + L / 2) / CELL)), b = Math.min(cells, Math.ceil((z + len + L / 2) / CELL));
      let base = 0;
      for (const sky of skylines) for (let i = a; i <= b; i++) base = Math.max(base, sky[i]);
      const cope = roughStone(top * 2 + 0.04 + r() * 0.08, ch, len * 0.96, r, [0, 1, 2, 4, 5], 0.3, 0.18);
      cope.rotateX((r() - 0.5) * (flat ? 0.08 : 0.3)); cope.rotateZ((r() - 0.5) * 0.1);
      parts.push(tagStone(cope.translate((r() - 0.5) * 0.04, base + ch * 0.42, z + len / 2), DRY_STONE_KIND.cope));
      z += len * (0.94 + r() * 0.05);
    }
  } else {
    // the stones that came off it, tumbled on both sides
    for (let k = 0; k < 9; k++) {
      const bs = 0.14 + r() * 0.16;
      const stone = roughStone(bs * (1.4 + r() * 0.6), bs * 0.55, bs, r, [0, 1, 2, 3, 4, 5]);
      stone.rotateY(r() * Math.PI); stone.rotateX((r() - 0.5) * 0.5);
      parts.push(tagStone(stone.translate((r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.6), bs * 0.25, (r() - 0.5) * L * 0.9), DRY_STONE_KIND.tumbled));
    }
  }
  // nothing runs past the hearting's ends: the module's length is the core's, so a run's terminal module still
  // reaches its authored post at every height (the end stones are squared off against the next module's)
  const g = merge(parts), zEnd = (L / 2) * 0.995, gp = g.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setZ(i, Math.max(-zEnd, Math.min(zEnd, gp.getZ(i))));
  return g;
}

/**
 * (b26) A stone of a laid face as geometry: its outline (`pts`: module z along, y up, counter-clockwise as the coursing
 * law gives it) on the face of `side` (+1 the +x face), its face standing `out(z, y)` beyond the face's plane and
 * swelling `swell` at its middle, its sides back `depth` into the wall where they can be seen (its top, a turned end
 * standing proud, a cut end at a head). A window of the field print of its own (the face band: one stone's skin): u
 * along from `uz` (the unshifted place: a stone split at a module's end keeps one window across the joint), v about the
 * band's own place for it.
 */
function laidStone(
  pts: number[], side: number, halfAt: (y: number) => number, out: (z: number, y: number) => number,
  swell: number, depth: number, uz: number, uv0: number, vMid: number, round: number, ends: readonly boolean[],
  /** The whole stone's height range (a part cut at a module's end maps its print as the whole stone does). */
  yRange: readonly [number, number],
): THREE.BufferGeometry {
  const n = pts.length / 2, pos: number[] = [], nor: number[] = [], uv: number[] = [];
  let cz = 0, cy = 0;
  for (let k = 0; k < n; k++) { cz += pts[k * 2]; cy += pts[k * 2 + 1]; }
  cz /= n; cy /= n;
  const yMid = (yRange[0] + yRange[1]) / 2;
  const squash = Math.min(1, (FIELD_STONE_FACE_V[1] - FIELD_STONE_FACE_V[0]) / Math.max(1e-3, (yRange[1] - yRange[0]) * DRY_UV));
  const point = (z: number, y: number, o: number): [number, number, number] => [side * (halfAt(y) + o), y, z];
  const uvOf = (z: number, y: number): [number, number] => [uv0 + (z - uz) * DRY_UV, vMid + (y - yMid) * DRY_UV * squash];
  // the face's normal (the batter tips it up, the stone's own turn turns it): the gradient of x = side (half + out)
  const dh = (halfAt(cy + 0.05) - halfAt(cy - 0.05)) / 0.1, eps = 0.01;
  const tz = (out(cz + eps, cy) - out(cz - eps, cy)) / (2 * eps), ty = (out(cz, cy + eps) - out(cz, cy - eps)) / (2 * eps);
  const fn = new THREE.Vector3(side, -(dh + ty), -tz).normalize();
  const C = point(cz, cy, out(cz, cy) + swell);
  const ring = Array.from({ length: n }, (_, k) => point(pts[k * 2], pts[k * 2 + 1], out(pts[k * 2], pts[k * 2 + 1])));
  const push = (p: readonly number[], q: THREE.Vector3, t: [number, number]) => { pos.push(p[0], p[1], p[2]); nor.push(q.x, q.y, q.z); uv.push(t[0], t[1]); };
  const tmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const ringNormal = (k: number): THREE.Vector3 => {
    tmp.set(ring[k][0] - C[0], ring[k][1] - C[1], ring[k][2] - C[2]);
    tmp.addScaledVector(fn, -tmp.dot(fn)).normalize();
    return new THREE.Vector3().copy(fn).addScaledVector(tmp, round).normalize();
  };
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    a.set(ring[k][0] - C[0], ring[k][1] - C[1], ring[k][2] - C[2]); b.set(ring[j][0] - C[0], ring[j][1] - C[1], ring[j][2] - C[2]);
    const [p, q] = a.cross(b).dot(fn) >= 0 ? [k, j] : [j, k];
    push(C, fn, uvOf(cz, cy));
    push(ring[p], ringNormal(p), uvOf(pts[p * 2], pts[p * 2 + 1]));
    push(ring[q], ringNormal(q), uvOf(pts[q * 2], pts[q * 2 + 1]));
  }
  // the sides that show: back into the wall along the edge's outward direction
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, ds = pts[j * 2] - pts[k * 2], dyv = pts[j * 2 + 1] - pts[k * 2 + 1];
    const el = Math.hypot(ds, dyv) || 1, nz = dyv / el, ny = -ds / el;
    const standsOut = Math.max(out(pts[k * 2], pts[k * 2 + 1]), out(pts[j * 2], pts[j * 2 + 1])) > 0.03;
    if (ny < 0.3 && !ends[k] && !(standsOut && ny > -0.35)) continue;
    const pk = ring[k], pj = ring[j];
    const bk = point(pts[k * 2], pts[k * 2 + 1], -depth), bj = point(pts[j * 2], pts[j * 2 + 1], -depth);
    const dirv = new THREE.Vector3(0, ny, nz).addScaledVector(fn, 0.25).normalize();
    a.set(pj[0] - pk[0], pj[1] - pk[1], pj[2] - pk[2]); b.set(bk[0] - pk[0], bk[1] - pk[1], bk[2] - pk[2]);
    const flip = a.clone().cross(b).dot(dirv) < 0;
    const quadPts = flip ? [pk, bk, bj, pj] : [pk, pj, bj, bk];
    const t = (p: readonly number[]): [number, number] => [uv0 + 0.31 + (p[2] - uz) * DRY_UV, vMid + 0.05 + (p[1] - yMid) * DRY_UV * squash * 0.5];
    for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]]) for (const i of [i0, i1, i2]) push(quadPts[i], dirv, t(quadPts[i]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * (b26) A rubble lump (a top stone of the crown): a ring of five corners round its plan, a rounded top fanned from a
 * high point off its middle, its sides down to where it beds. World-free: centred on (x, bed, z), its own draws.
 */
function rubbleLump(r: Rng, x: number, z: number, bed: number, h: number, halfL: number, halfW: number, uv0: number, sides = true): THREE.BufferGeometry {
  const yaw = (r() - 0.5) * 0.5, cyaw = Math.cos(yaw), syaw = Math.sin(yaw), phase = r() * 1.2566;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const at = (la: number, lw: number, y: number): [number, number, number] => [x + lw * cyaw + la * syaw, y, z - lw * syaw + la * cyaw];
  const shoulder: Array<[number, number, number]> = [], foot: Array<[number, number, number]> = [];
  for (let k = 0; k < 5; k++) {
    const ang = phase + k * 1.2566, reach = 0.78 + r() * 0.3, lift = (0.6 + r() * 0.28) * (sides ? 1 : 0.3);
    // (a lump without sides — one wedged in a gap — is a mound out of what it lies in: its corners down at its bed)
    shoulder.push(at(Math.cos(ang) * halfL * reach, Math.sin(ang) * halfW * reach, bed + h * lift));
    foot.push(at(Math.cos(ang) * halfL * reach * 0.86, Math.sin(ang) * halfW * reach * 0.86, bed - 0.01));
  }
  const top = at((r() - 0.5) * 0.7 * halfL, (r() - 0.5) * 0.7 * halfW, bed + h);
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const t = (p: readonly number[]): [number, number] => [uv0 + (p[0] + p[2]) * DRY_UV * 0.7, FIELD_STONE_FACE_V[0] + 0.3 + (p[1] - bed) * DRY_UV];
  const push = (p: readonly number[], q: THREE.Vector3) => { pos.push(p[0], p[1], p[2]); nor.push(q.x, q.y, q.z); const w = t(p); uv.push(w[0], w[1]); };
  for (let k = 0; k < 5; k++) {
    const p = shoulder[k], q = shoulder[(k + 1) % 5];
    const np = tmp.set(p[0] - top[0], 0, p[2] - top[2]).normalize().multiplyScalar(0.55).add(up).normalize().clone();
    const nq = tmp.set(q[0] - top[0], 0, q[2] - top[2]).normalize().multiplyScalar(0.55).add(up).normalize().clone();
    // (wound to face up: the ring runs counter-clockwise seen from above when its cross product points up)
    const ccw = ((p[2] - top[2]) * (q[0] - top[0]) - (p[0] - top[0]) * (q[2] - top[2])) > 0;
    if (ccw) { push(top, up); push(p, np); push(q, nq); } else { push(top, up); push(q, nq); push(p, np); }
    if (!sides) continue;
    const f0 = foot[k], f1 = foot[(k + 1) % 5];
    const side = tmp.set((p[0] + q[0]) / 2 - top[0], 0, (p[2] + q[2]) / 2 - top[2]).normalize().clone();
    const quadPts = ccw ? [p, f0, f1, q] : [p, q, f1, f0];
    for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]]) for (const i of [i0, i1, i2]) push(quadPts[i], side);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** (b26) Cut a stone's outline at z = cut, keeping the side `keep` (-1: z <= cut, +1: z >= cut). */
function clipOutline(pts: number[], cut: number, keep: number): number[] {
  const outPts: number[] = [], n = pts.length / 2;
  const inside = (z: number) => (keep < 0 ? z <= cut : z >= cut);
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, za = pts[k * 2], ya = pts[k * 2 + 1], zb = pts[j * 2], yb = pts[j * 2 + 1];
    if (inside(za)) outPts.push(za, ya);
    if (inside(za) !== inside(zb)) { const t = (cut - za) / (zb - za); outPts.push(cut, ya + (yb - ya) * t); }
  }
  return outPts;
}

/**
 * (b26; gauntlet wave 177, Saltwind: "neat stacks of uniform rectangular slabs with upright coping", the coordinator:
 * "Saltwind needs one suhozid kit: rough, irregular pale limestone of uneven sizes … no upright coping, no decal grout")
 * The Dalmatian suhozid module, a limestone map's field wall: the hearting as the dry-stone module's, each face laid by
 * the coursing law the field works' stone form and their print are laid by (dryStoneCourses.ts) — chunky lumps of every
 * size in wandering courses, the footing's big stones at the foot, knocked corners leaving their voids, each face turned
 * a little its own way — a through-stone or two, and a crown of rubble top stones laid across it (the material drops
 * the odd one and settles the run by world place, as it does the copes: they carry the cope's kind). Each face is laid
 * on a skyline that wraps at the module's length, so a run of modules is one face with no joint ruled down it every
 * three metres: a stone over the module's end is cut there, its two parts flat-faced so the next module's part meets it
 * as one stone. Like the dry-stone module, built on the original envelope's seed after its draws.
 */
function suhozidModule(r: Rng, broken: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const L = WALL_SEG, H = broken ? 0.32 + r() * 0.16 : 0.92, bottom = 0.27, top = broken ? 0.22 : 0.19;
  const halfAt = (y: number) => bottom + (top - bottom) * Math.min(1, Math.max(0, y) / 0.92);
  const topReserve = broken ? 0 : 0.11;
  // the hearting: the dry-stone module's battered core, its top under the crown's stones
  {
    const core = new THREE.BoxGeometry(2, 1, 2, 1, 1, 2);
    const cp = core.attributes.position, coreH = H - topReserve - 0.02;
    for (let i = 0; i < cp.count; i++) {
      const u = cp.getZ(i), y = (cp.getY(i) + 0.5) * coreH, side = Math.sign(cp.getX(i));
      cp.setXYZ(i, side * (halfAt(y) - 0.045 - Math.max(0, u - 0.5) * 0.03), y, u * (L / 2) * 0.995);
    }
    core.computeVertexNormals();
    const cn = core.attributes.normal, cuv = core.attributes.uv;
    const [h0, h1] = FIELD_STONE_HEARTING_V;
    for (let i = 0; i < cp.count; i++) {
      const upF = Math.abs(cn.getY(i)) > 0.5, across = Math.abs(cn.getX(i)) > 0.5;
      const t = upF ? 0.5 + cp.getX(i) / (2 * bottom) : Math.min(1, Math.max(0, cp.getY(i) / coreH));
      cuv.setXY(i, (across || upF ? cp.getZ(i) : cp.getX(i)) * DRY_UV, h0 + (h1 - h0) * t);
    }
    parts.push(tagStone(keepFaces(core, [0, 1, 2, 4, 5]), DRY_STONE_KIND.core));
  }
  // the faces, by the coursing law on a skyline wrapped at the module's length
  for (const side of [-1, 1]) {
    const face = layDryStoneFace(r, L, {
      // (a little bigger than the field works' stone form's: the module is a field's wall seen across it, every three
      // metres the same one)
      crown: () => H - topReserve, foot: 0.05, footH: [0.21, 0.31], footL: [0.4, 0.8], courseH: [0.13, 0.27], courseL: [0.24, 0.68], wrap: true,
    });
    for (const st of face) {
      const proud = (st.kind === 1 ? 0.018 : 0) + (r() < 0.22 ? 0.014 + r() * 0.016 : r() * 0.01);
      // (each face turned a little its own way: less than the stone form's, the module seen across a field)
      const tS = (r() - 0.5) * 0.16, tY = (r() - 0.5) * 0.14, swell = 0.018 + r() * 0.022, uv0 = r() * 8;
      const vMid = FIELD_STONE_FACE_V[0] + 0.12 + r() * (FIELD_STONE_FACE_V[1] - FIELD_STONE_FACE_V[0] - 0.24);
      // (its place on the wrapped face: the module whose span holds it, or the two it spans, cut at the end)
      const k0 = Math.floor(st.s0 / L), k1 = Math.floor((st.s1 - 1e-6) / L);
      const pieces: Array<{ pts: number[]; shift: number; cut: boolean }> = k0 === k1
        ? [{ pts: st.pts, shift: k0 * L, cut: false }]
        : [{ pts: clipOutline(st.pts, k1 * L, -1), shift: k0 * L, cut: true }, { pts: clipOutline(st.pts, k1 * L, 1), shift: k1 * L, cut: true }];
      for (const piece of pieces) {
        if (piece.pts.length < 6) continue;
        const pts = piece.pts.map((v, i) => (i % 2 === 0 ? v - piece.shift - L / 2 : v));
        let cz = 0, cy = 0, lowest = Infinity;
        for (let k = 0; k < pts.length; k += 2) { cz += pts[k]; cy += pts[k + 1]; }
        cz /= pts.length / 2; cy /= pts.length / 2;
        // (a cut stone's two parts lie in one plane, flat-faced, so they meet across the module's end as one stone)
        const turnS = piece.cut ? 0 : tS, turnY = piece.cut ? 0 : tY;
        for (let k = 0; k < pts.length; k += 2) lowest = Math.min(lowest, turnS * (pts[k] - cz) + turnY * (pts[k + 1] - cy));
        const out = (z: number, y: number) => proud + turnS * (z - cz) + turnY * (y - cy) - lowest - 0.03;
        const ends = pts.filter((_, i) => i % 2 === 0).map(() => false);
        const g = laidStone(pts, side, halfAt, out, piece.cut ? 0 : swell, 0.06, st.s0 - piece.shift - L / 2, uv0, vMid, piece.cut ? 0 : 0.5, ends, [st.y0, st.y1]);
        parts.push(tagStone(g, DRY_STONE_KIND.face));
      }
    }
  }
  if (!broken) {
    // a through-stone or two, its ends jutting from both faces, laid at about a third of the wall's height
    for (let k = 0, n = 1 + (r() < 0.5 ? 1 : 0); k < n; k++) {
      const y = H * (0.3 + r() * 0.15), len = 0.2 + r() * 0.12, th = 0.09 + r() * 0.05;
      const ts = roughStone(halfAt(y) * 2 + 0.14, th, len, r, [0, 1, 2, 4, 5]);
      parts.push(tagStone(ts.translate((r() - 0.5) * 0.03, y, (r() - 0.5) * (L - 0.6)), DRY_STONE_KIND.through));
    }
    // the crown: rubble top stones across the wall, each its own length, height and lean, the odd small one lower
    let z = -L / 2 + r() * 0.04;
    while (z < L / 2 - 0.08) {
      const len = 0.22 + r() * 0.24, gap = 0.01 + r() * 0.05, h = (0.1 + r() * 0.075) * (r() < 0.15 ? 1.25 : 1);
      const mid = Math.min(L / 2 - 0.1, z + len / 2);
      const halfW = (top + 0.02) * (0.68 + r() * 0.38), across = (r() - 0.5) * 2 * Math.max(0, top + 0.02 - halfW);
      parts.push(tagStone(rubbleLump(r, across, mid, H - topReserve - 0.03, h, len / 2, halfW, r() * 8), DRY_STONE_KIND.cope));
      if (r() < 0.3) parts.push(tagStone(rubbleLump(r, (r() - 0.5) * 0.12, Math.min(L / 2 - 0.06, z + len + gap / 2), H - topReserve - 0.04, 0.06 + r() * 0.04, 0.05 + r() * 0.04, 0.07 + r() * 0.05, r() * 8, false), DRY_STONE_KIND.cope));
      z += len + gap;
    }
  } else {
    // the stones that came off it, tumbled on both sides
    for (let k = 0; k < 9; k++) {
      const bs = 0.14 + r() * 0.16;
      const stone = roughStone(bs * (1.4 + r() * 0.6), bs * 0.55, bs, r, [0, 1, 2, 3, 4, 5]);
      stone.rotateY(r() * Math.PI); stone.rotateX((r() - 0.5) * 0.5);
      parts.push(tagStone(stone.translate((r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.6), bs * 0.25, (r() - 0.5) * L * 0.9), DRY_STONE_KIND.tumbled));
    }
  }
  const g = merge(parts), zEnd = (L / 2) * 0.995, gp = g.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setZ(i, Math.max(-zEnd, Math.min(zEnd, gp.getZ(i))));
  return g;
}

/** Map a geometry affinely onto a box (each axis on its own), so its extents are the box's. */
function fitToEnvelope(g: THREE.BufferGeometry, box3: THREE.Box3): THREE.BufferGeometry {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const p = g.attributes.position;
  const sx = (box3.max.x - box3.min.x) / Math.max(1e-6, b.max.x - b.min.x);
  const sy = (box3.max.y - box3.min.y) / Math.max(1e-6, b.max.y - b.min.y);
  const sz = (box3.max.z - box3.min.z) / Math.max(1e-6, b.max.z - b.min.z);
  // the normals go through the inverse transpose (a per-axis scale: divide), so each stone keeps its smooth faces
  const n = g.attributes.normal;
  // (a dry-stone module's stone centres go through the same map)
  const stone = g.getAttribute('aStone');
  if (stone) for (let i = 0; i < stone.count; i++) {
    stone.setXYZ(i, box3.min.x + (stone.getX(i) - b.min.x) * sx, box3.min.y + (stone.getY(i) - b.min.y) * sy, box3.min.z + (stone.getZ(i) - b.min.z) * sz);
  }
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, box3.min.x + (p.getX(i) - b.min.x) * sx, box3.min.y + (p.getY(i) - b.min.y) * sy, box3.min.z + (p.getZ(i) - b.min.z) * sz);
    const nx = n.getX(i) / sx, ny = n.getY(i) / sy, nz = n.getZ(i) / sz, len = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(i, nx / len, ny / len, nz / len);
  }
  g.computeBoundingBox();
  return g;
}

/** (b26) The hearting's box for a head or a stub: its sides and top on the field print's hearting band. */
function heartingBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const core = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const cp = core.attributes.position, cn = core.attributes.normal, cuv = core.attributes.uv;
  const [h0, h1] = FIELD_STONE_HEARTING_V;
  for (let i = 0; i < cp.count; i++) {
    const upF = Math.abs(cn.getY(i)) > 0.5, across = Math.abs(cn.getX(i)) > 0.5;
    const t = upF ? 0.5 + cp.getX(i) / Math.max(1e-3, w) : Math.min(1, Math.max(0, cp.getY(i) / h));
    cuv.setXY(i, (across || upF ? cp.getZ(i) : cp.getX(i)) * DRY_UV, h0 + (h1 - h0) * t);
  }
  return keepFaces(core, [0, 1, 2, 4, 5]);
}

/**
 * (b26) Lay a face round a closed or open run of flat sides by the coursing law: `sides` their origins (x, z), unit
 * directions along (tx, tz) and lengths, the run's outward side on the right of the direction; a stone over a corner is
 * cut there into flat-faced parts (a quoin turning the corner), a stone on one side keeps its own turn and swell.
 */
function layFacesRound(
  r: Rng, parts: THREE.BufferGeometry[], sides: ReadonlyArray<{ ox: number; oz: number; tx: number; tz: number; len: number }>,
  wrap: boolean, crown: (s: number) => number, inset: (y: number) => number,
  sizes: { footH: readonly [number, number]; footL: readonly [number, number]; courseH: readonly [number, number]; courseL: readonly [number, number] },
): void {
  const starts: number[] = [];
  let total = 0;
  for (const side of sides) { starts.push(total); total += side.len; }
  const face = layDryStoneFace(r, total, { crown, foot: 0.04, ...sizes, wrap });
  for (const st of face) {
    const proud = (st.kind === 1 ? 0.014 : 0) + r() * 0.012, tS = (r() - 0.5) * 0.2, tY = (r() - 0.5) * 0.16;
    const swell = 0.016 + r() * 0.02, uv0 = r() * 8;
    const vMid = FIELD_STONE_FACE_V[0] + 0.12 + r() * (FIELD_STONE_FACE_V[1] - FIELD_STONE_FACE_V[0] - 0.24);
    const pieces: Array<{ k: number; pts: number[]; shift: number }> = [];
    for (let m = 0; m < (wrap ? 2 : 1); m++) {
      for (let k = 0; k < sides.length; k++) {
        const s0 = starts[k] + m * total, s1 = s0 + sides[k].len;
        if (st.s1 <= s0 + 1e-6 || st.s0 >= s1 - 1e-6) continue;
        let pts = st.pts;
        if (st.s0 < s0) pts = clipOutline(pts, s0, 1);
        if (st.s1 > s1 && pts.length >= 6) pts = clipOutline(pts, s1, -1);
        if (pts.length >= 6) pieces.push({ k, pts, shift: s0 });
      }
    }
    const cut = pieces.length > 1;
    for (const piece of pieces) {
      const side = sides[piece.k];
      // (a part at a corner reaches a couple of centimetres past it, so the two parts' faces meet over the corner)
      const pts = piece.pts.map((v, i) => (i % 2 === 0 ? v - piece.shift : v))
        .map((v, i) => (i % 2 === 0 && cut ? (v < 0.003 ? v - 0.02 : v > side.len - 0.003 ? v + 0.02 : v) : v));
      let cz = 0, cy = 0, lowest = Infinity;
      for (let k = 0; k < pts.length; k += 2) { cz += pts[k]; cy += pts[k + 1]; }
      cz /= pts.length / 2; cy /= pts.length / 2;
      const turnS = cut ? 0 : tS, turnY = cut ? 0 : tY;
      for (let k = 0; k < pts.length; k += 2) lowest = Math.min(lowest, turnS * (pts[k] - cz) + turnY * (pts[k + 1] - cy));
      const out = (z: number, y: number) => proud + turnS * (z - cz) + turnY * (y - cy) - lowest;
      const g = laidStone(pts, 1, inset, out, cut ? 0 : swell, 0.06, st.s0 - piece.shift, uv0, vMid, cut ? 0 : 0.5,
        pts.filter((_, i) => i % 2 === 0).map(() => false), [st.y0, st.y1]);
      // (the canonical face, +x out and z along, turned onto the side: +z to its direction, +x to its outward side)
      g.rotateY(Math.atan2(side.tx, side.tz)).translate(side.ox, 0, side.oz);
      parts.push(g);
    }
  }
}

/**
 * The scenery lane (wave 16, "a miniature castle battlement"): where a dry-stone run ends or opens, a rubble wall head —
 * a little broader than the wall and about its height, its top stones laid across it unevenly; no post, no cap slab.
 * (b26; gauntlet wave 174, Verdant's yard wall: "a neatly stacked column at its corner") its faces laid by the coursing
 * law round all four sides at once (dryStoneCourses.ts: the courses run on round its corners, a stone over a corner cut
 * into a quoin's two faces), its top a heap of rubble lumps, the hearting under them. World-free: centred on its foot,
 * its own stream (the seed names the place).
 */
export function buildDryStoneWallHead(seed: number, thick: number, height: number): THREE.BufferGeometry {
  const r = dryStoneRng(seed ^ 0x6b26), parts: THREE.BufferGeometry[] = [];
  const w = thick + 0.1 + r() * 0.06, d = w * (0.9 + r() * 0.15), top = height * (0.92 + r() * 0.12), crown = top - 0.1;
  const lean = 0.03 + r() * 0.02;
  parts.push(heartingBox(w - 0.1, crown - 0.01, d - 0.1));
  // (a head is built of the wall's biggest stones, a corner pier's bigger still)
  const grow = 1.15 * Math.pow(Math.max(1, w / 0.6), 0.6);
  layFacesRound(r, parts, [
    { ox: -w / 2, oz: -d / 2, tx: 1, tz: 0, len: w }, { ox: w / 2, oz: -d / 2, tx: 0, tz: 1, len: d },
    { ox: w / 2, oz: d / 2, tx: -1, tz: 0, len: w }, { ox: -w / 2, oz: d / 2, tx: 0, tz: -1, len: d },
  ], true, () => crown, (y) => -lean * Math.min(1, Math.max(0, y) / crown),
  { footH: [0.18 * grow, 0.28 * grow], footL: [0.32 * grow, 0.62 * grow], courseH: [0.12 * grow, 0.24 * grow], courseL: [0.2 * grow, 0.56 * grow] });
  // the top: a few rubble lumps over it, each its own height
  const nx = w > 1.0 ? 2 : 1, nz = d > 1.0 ? 2 : 1;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const hw = (w - 0.06) / nx / 2, hd = (d - 0.06) / nz / 2;
    const x = -w / 2 + 0.03 + hw * (2 * i + 1) + (r() - 0.5) * hw * 0.3, z = -d / 2 + 0.03 + hd * (2 * k + 1) + (r() - 0.5) * hd * 0.3;
    parts.push(rubbleLump(r, x, z, crown - 0.03, 0.1 + r() * 0.08, hd * (0.9 + r() * 0.25), hw * (0.9 + r() * 0.25), r() * 8));
  }
  return merge(parts);
}

/**
 * (b26) A breach's stub (props.ts addBrokenBreach): what is left of the wall either side of a gap — low and ragged, its
 * top fallen lower toward the gap's side, its faces laid as the wall's (the coursing law), its broken ends the hearting
 * with the rubble core's lumps standing out of it, a few rubble lumps along its top. World-free: its foot at the origin,
 * along z, its own stream (the seed names the place).
 */
export function buildDryStoneStub(seed: number, thick: number, height: number, length: number): THREE.BufferGeometry {
  const r = dryStoneRng(seed ^ 0x57b2), parts: THREE.BufferGeometry[] = [];
  const half = thick / 2 + 0.02, L = length, ph = r() * 6.28;
  const crown = (s: number) => Math.max(0.14, height * Math.pow(0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, s / L))), 0.55) * (0.92 + 0.08 * Math.sin(s * 7.1 + ph)));
  const lean = 0.05;
  parts.push(heartingBox(thick - 0.06, height * 0.7, L * 0.96));
  // its two faces (the run's +x face along +z, the -x face back along -z), open at their ends
  const sizes = { footH: [0.2, 0.3], footL: [0.36, 0.7], courseH: [0.13, 0.26], courseL: [0.24, 0.6] } as const;
  layFacesRound(r, parts, [{ ox: half, oz: -L / 2, tx: 0, tz: 1, len: L }], false, (s) => crown(s) - 0.05,
    (y) => -lean * Math.min(1, Math.max(0, y) / height), sizes);
  layFacesRound(r, parts, [{ ox: -half, oz: L / 2, tx: 0, tz: -1, len: L }], false, (s) => crown(L - s) - 0.05,
    (y) => -lean * Math.min(1, Math.max(0, y) / height), sizes);
  // its broken ends: the rubble core's lumps standing out of the hearting
  for (const end of [-1, 1]) {
    const hEnd = crown(end < 0 ? 0.02 : L - 0.02);
    for (let k = 0, n = 3 + Math.floor(r() * 2); k < n; k++) {
      const y = 0.02 + r() * Math.max(0.04, hEnd - 0.1);
      parts.push(rubbleLump(r, (r() - 0.5) * (thick - 0.16), end * (L / 2 - 0.02 + r() * 0.04), y, 0.07 + r() * 0.05, 0.06 + r() * 0.04, 0.06 + r() * 0.04, r() * 8));
    }
  }
  // its top: rubble lumps along it
  for (let z = -L / 2 + 0.08 + r() * 0.06; z < L / 2 - 0.1; z += 0.18 + r() * 0.14) {
    const s = z + L / 2;
    parts.push(rubbleLump(r, (r() - 0.5) * 0.06, z, Math.max(0.05, crown(s) - 0.12 - r() * 0.05), 0.08 + r() * 0.07, 0.09 + r() * 0.06, thick / 2 - 0.03, r() * 8, false));
  }
  return merge(parts);
}

/**
 * The scenery lane (wave 16): where a mud wall ends or opens, an eroded pier — a little broader and taller than the
 * wall, its arrises rubbed round, its top slumped to a worn dome, a lean of its own; no cap slab. World-free, centred
 * on its foot, its own stream.
 */
export function buildAdobePilaster(seed: number, thick: number, height: number): THREE.BufferGeometry {
  const r = dryStoneRng(seed ^ 0xad01);
  const w = thick + 0.16 + r() * 0.08, h = height * (0.95 + r() * 0.12);
  const g = new THREE.BoxGeometry(w, h, w, 4, 6, 4);
  const p = g.attributes.position;
  const lean = (r() - 0.5) * 0.06, phase = r() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / h + 0.5, z = p.getZ(i) / (w / 2); // x, z in -1..1, y in 0..1
    // the arrises rubbed round (a superellipse section), wider at the foot, the top a worn dome slumped to one side
    const k = Math.pow(Math.pow(Math.abs(x), 3) + Math.pow(Math.abs(z), 3), 1 / 3) || 1;
    const round = Math.max(Math.abs(x), Math.abs(z)) / k;
    const foot = 1 + 0.08 * (1 - y) * (1 - y);
    const dome = y > 0.86 ? 1 - Math.pow((y - 0.86) / 0.14, 2) * 0.38 : 1;
    const wear = 1 + Math.sin(x * 2.1 + z * 1.7 + phase) * 0.03;
    const sx = x * round * foot * dome * wear, sz = z * round * foot * dome * wear;
    const slump = y > 0.8 ? (Math.sin(phase + x * 1.3) * 0.04 - 0.03) * (y - 0.8) / 0.2 : 0;
    p.setXYZ(i, sx * w / 2 + lean * y * h, y * h + slump * h, sz * w / 2);
  }
  g.computeVertexNormals();
  return keepFaces(scaleUV(g, w * ADOBE_UV_PER_M, h * ADOBE_UV_PER_M), [0, 1, 2, 4, 5]); // the field-mud print's density
}

function bWallStone(rng: Rng): THREE.BufferGeometry {
  const envelope = wallStoneEnvelope(rng);
  envelope.computeBoundingBox();
  const box3 = envelope.boundingBox!.clone();
  envelope.dispose();
  const seed = Math.round((box3.max.x - box3.min.x) * 1e6 + (box3.max.y - box3.min.y) * 1e4 + box3.max.z * 1e3);
  return fitToEnvelope(dryStoneModule(dryStoneRng(seed), false), box3);
}

/**
 * (b26) The suhozid module for a limestone map's field walls (props.ts takes it where fieldStoneLithologyFor gives
 * 'limestone'): the dry-stone module's envelope and seed (its draws spent as the original's), its own laying.
 */
export function bWallSuhozid(rng: Rng): THREE.BufferGeometry {
  const envelope = wallStoneEnvelope(rng);
  envelope.computeBoundingBox();
  const box3 = envelope.boundingBox!.clone();
  envelope.dispose();
  const seed = Math.round((box3.max.x - box3.min.x) * 1e6 + (box3.max.y - box3.min.y) * 1e4 + box3.max.z * 1e3);
  return fitToEnvelope(suhozidModule(dryStoneRng(seed ^ 0x5b02), false), box3);
}

/** (b26) The suhozid module's remnant (the dry-stone module's draws first). */
export function bWallSuhozidBroken(rng: Rng): THREE.BufferGeometry {
  wallStoneBrokenDraws(rng).dispose();
  return suhozidModule(dryStoneRng(0x5d0f), true);
}

function bWallStoneBroken(rng: Rng): THREE.BufferGeometry {
  wallStoneBrokenDraws(rng).dispose(); // the original remnant's draws, so every later pool keeps its geometry
  return dryStoneModule(dryStoneRng(0x5d0e), true);
}

function adobeEnvelope(rng: Rng): THREE.BufferGeometry {
  const { parts, top } = wallCourses(rng, 0.52, [0.56, 0.46]);
  const cap = box(0.40, 0.15, WALL_SEG * 1.0, 0.9); // rounded mud cap read
  parts.push(cap.translate(0, top + 0.05, 0));
  return merge(parts);
}

/**
 * The scenery lane (2026-10-03; wave 20, "smooth pillow- and pipe-shaped walls instead of eroded mud brick"): the mud
 * wall as a slab — near-upright faces battered a little, cut back at the foot where the splash wore it, shoulders
 * rubbed round to a worn crown. One extrusion of a thirteen-point section every 15 cm on the field-mud print, one tile
 * a module (u along the wall, v round the section). Like the stone wall, the original builder still runs first (its
 * draws, its envelope) and the mass is fitted to that envelope, so the fitted wall collider keeps its plan and height.
 *
 * (b14; gauntlet wave 97: "wave-top silhouette and rust-colored staining repeat identically roughly eight times across
 * the frame", "stamped rectangle decals") A pool draws this one module for every module of every mud wall, so whatever
 * it carries repeats every three metres. Its crown is now level and its faces plain: the crown's slumps and the
 * wall's height, the render's losses with the courses under them, and the rain's stains are the material's, laid in
 * world space (props.ts, the mud hook), continuous across the modules' joints and never the same twice.
 */
function adobeModule(r: Rng): THREE.BufferGeometry {
  const L = WALL_SEG, H = 1.0, half = 0.26;
  void r; // (a module's place seeds its stream; the level crown draws nothing from it)
  const segs = 20;
  // the section, one foot over the crown to the other: [across (x / half), height (y / H)]
  // (wave 34: "rounded slumped tops" — the faces battered in toward a crown worn round, not squared shoulders)
  const section: Array<[number, number]> = [[-1.05, 0], [-0.99, 0.06], [-1.03, 0.22], [-0.95, 0.64], [-0.82, 0.86],
    [-0.48, 0.975], [0, 1.0], [0.48, 0.975], [0.82, 0.86], [0.95, 0.64], [1.03, 0.22], [0.99, 0.06], [1.05, 0]];
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  const rowLength = section.length;
  const arc = [0];
  for (let k = 1; k < rowLength; k++) arc.push(arc[k - 1] + Math.hypot((section[k][0] - section[k - 1][0]) * half, (section[k][1] - section[k - 1][1]) * H));
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, z = (u - 0.5) * L * 0.995;
    const tuck = 1 - Math.max(0, u - 0.9) * 0.3; // the +z end steps inside the next module's start
    for (let k = 0; k < rowLength; k++) {
      const [sx, sy] = section[k];
      positions.push(sx * half * tuck, sy * H, z);
      uvs.push(u, arc[k] * ADOBE_UV_PER_M);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k + 1 < rowLength; k++) {
      const a = i * rowLength + k, b = a + 1, c = a + rowLength, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // the end faces: a flat fan over each end's section, their own corners (so the sides keep their soft normals). Wave
  // 34: where two modules meet a few millimetres apart a sliver of an end face shows, a dark line down the wall at every
  // joint — so an end face is shaded as the section's own faces at its rim (their normals), and its sliver reads as wall
  const capPositions: number[] = [], capUvs: number[] = [], capNormals: number[] = [];
  const sideNormal = g.attributes.normal;
  for (const [i, last] of [[0, false], [segs, true]] as const) {
    const base = i * rowLength;
    const at = (k: number) => [positions[(base + k) * 3], positions[(base + k) * 3 + 1], positions[(base + k) * 3 + 2]];
    for (let k = 1; k + 1 < rowLength; k++) {
      const tri = last ? [0, k, k + 1] : [0, k + 1, k];
      for (const q of tri) {
        const p = at(q);
        capPositions.push(...p); capUvs.push(p[0] * ADOBE_UV_PER_M, p[1] * ADOBE_UV_PER_M);
        capNormals.push(sideNormal.getX(base + q), sideNormal.getY(base + q), sideNormal.getZ(base + q));
      }
    }
  }
  const caps = new THREE.BufferGeometry();
  caps.setAttribute('position', new THREE.Float32BufferAttribute(capPositions, 3));
  caps.setAttribute('uv', new THREE.Float32BufferAttribute(capUvs, 2));
  caps.setAttribute('normal', new THREE.Float32BufferAttribute(capNormals, 3));
  return merge([g, caps]);
}

function bWallAdobe(rng: Rng): THREE.BufferGeometry {
  const envelope = adobeEnvelope(rng);
  envelope.computeBoundingBox();
  const box3 = envelope.boundingBox!.clone();
  envelope.dispose();
  const seed = Math.round((box3.max.x - box3.min.x) * 1e6 + (box3.max.y - box3.min.y) * 1e4 + box3.max.z * 1e3) ^ 0xad0b;
  return fitToEnvelope(adobeModule(dryStoneRng(seed)), box3);
}
function bWallAdobeBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const h = 0.24 + rng() * 0.2;
  const stub = box(0.52, h, WALL_SEG * 0.44, ADOBE_UV_PER_M);
  stub.rotateX((rng() - 0.5) * 0.12);
  parts.push(stub.translate(0, h / 2, -WALL_SEG * 0.22));
  for (let k = 0; k < 5; k++) { // mud-brick clods
    const bs = 0.13 + rng() * 0.16;
    const blk = box(bs * 1.4, bs * 0.6, bs, ADOBE_UV_PER_M * 1.6);
    blk.rotateY(rng() * Math.PI);
    parts.push(blk.translate((rng() - 0.5) * 1.5, bs * 0.28, (rng() - 0.5) * WALL_SEG * 0.9));
  }
  return merge(parts);
}
/**
 * (b39; the destructibles audit: "a box stub and four cubes in place of the rounded wall") The mud wall breached: the
 * module's own section, cut where the wall above came down — a stub a third to two thirds high along the module, a
 * breach where the most fell, its broken top ragged and crumbled in — the fallen mud slumped against both feet in
 * low lumpy heaps (more under the breach, most on the side it fell to) and a few clods rolled out; all on the wall's
 * field-mud print, fitted to the same envelope as the standing wall.
 */
function bWallAdobeBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bWallAdobeBrokenLegacy, rng, 0xad0c);
  const L = WALL_SEG, H = 1.0, half = 0.26, segs = 20;
  const section: Array<[number, number]> = [[-1.05, 0], [-0.99, 0.06], [-1.03, 0.22], [-0.95, 0.64], [-0.82, 0.86],
    [-0.48, 0.975], [0, 1.0], [0.48, 0.975], [0.82, 0.86], [0.95, 0.64], [1.03, 0.22], [0.99, 0.06], [1.05, 0]];
  const rowLength = section.length, arc = [0];
  for (let k = 1; k < rowLength; k++) arc.push(arc[k - 1] + Math.hypot((section[k][0] - section[k - 1][0]) * half, (section[k][1] - section[k - 1][1]) * H));
  const breachU = 0.32 + o() * 0.36, breachW = 0.13 + o() * 0.08, phase = o() * 6.3, side = o() < 0.5 ? -1 : 1;
  const fell = (u: number) => Math.exp(-(((u - breachU) / breachW) ** 2));
  // most of the module standing, its crown broken off; the breach down to a hand or two over the ground
  const cutAt = (u: number) => Math.max(0.12, Math.min(0.93, 0.84 + 0.06 * Math.sin(u * 7 + phase) - 0.74 * fell(u)));
  // the stub: the section cut at the break, its top ragged, crumbled in
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, z = (u - 0.5) * L * 0.995, cut = cutAt(u) * H;
    for (let k = 0; k < rowLength; k++) {
      const [sx, sy] = section[k];
      let x = sx * half, y = sy * H;
      if (y > cut) {
        // the break: lumpy along and across (no spikes), the faces crumbled in a little toward it
        const lump = 0.045 * Math.sin(u * 23 + k * 1.7 + phase) + 0.03 * Math.sin(u * 51 - k * 0.9);
        y = cut + lump - 0.04 * Math.abs(sx);
        x *= 0.9;
      }
      pos.push(x, y, z); uv.push(u, arc[k] * ADOBE_UV_PER_M);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k + 1 < rowLength; k++) {
    const a = i * rowLength + k, b = a + 1, c = a + rowLength, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const stub = new THREE.BufferGeometry();
  stub.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  stub.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  stub.setIndex(idx);
  stub.computeVertexNormals();
  // its ends: a fan over each end row
  const capPos: number[] = [], capUv: number[] = [];
  for (const [i, last] of [[0, false], [segs, true]] as const) {
    const at = (k: number) => [pos[(i * rowLength + k) * 3], pos[(i * rowLength + k) * 3 + 1], pos[(i * rowLength + k) * 3 + 2]];
    for (let k = 1; k + 1 < rowLength; k++) for (const q of (last ? [0, k, k + 1] : [0, k + 1, k])) {
      const p = at(q); capPos.push(...p); capUv.push(p[0] * ADOBE_UV_PER_M, p[1] * ADOBE_UV_PER_M);
    }
  }
  const caps = new THREE.BufferGeometry();
  caps.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  caps.setAttribute('uv', new THREE.Float32BufferAttribute(capUv, 2));
  caps.computeVertexNormals();
  // the fallen mud: a low lumpy heap along each foot, more under the breach, most on the side it fell to
  const heap = (sgn: number) => {
    const hs: Array<[number, number]> = [[-0.04, 0.02], [0.06, 0.2], [0.18, 0.27], [0.32, 0.2], [0.44, 0.08], [0.55, -0.02]];
    const hp: number[] = [], hu: number[] = [], hi: number[] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const u = i / n, z = (u - 0.5) * L * 0.98, amt = (0.06 + fell(u) * (sgn === side ? 0.9 : 0.4)) * (0.85 + 0.3 * o());
      let v = 0;
      for (let k = 0; k < hs.length; k++) {
        const [hx, hy] = hs[k];
        const x = sgn * (half * 0.95 + hx * (0.35 + 1.1 * amt)), y = hy * amt * (k === 0 || k === hs.length - 1 ? 1 : 0.85 + 0.3 * Math.sin(u * 23 + k * 2.1)) * 1.6;
        if (k > 0) v += Math.hypot((hs[k][0] - hs[k - 1][0]) * (0.35 + 1.1 * amt), (hs[k][1] - hs[k - 1][1]) * amt);
        hp.push(x, y, z); hu.push(u, 0.05 + v * ADOBE_UV_PER_M);
      }
    }
    for (let i = 0; i < n; i++) for (let k = 0; k + 1 < hs.length; k++) {
      const a = i * hs.length + k, b = a + 1, c = a + hs.length, d = c + 1;
      if (sgn > 0) hi.push(a, c, b, b, c, d); else hi.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(hu, 2));
    g.setIndex(hi);
    g.computeVertexNormals();
    return g;
  };
  const parts: THREE.BufferGeometry[] = [stub, caps, heap(-1), heap(1)];
  // a few clods rolled out from the breach
  for (let k = 0; k < 4; k++) {
    const c = new THREE.IcosahedronGeometry(0.1 + o() * 0.07, 0);
    c.scale(1.2, 0.7, 1);
    const cp = c.attributes.position as THREE.BufferAttribute, cu: number[] = [];
    for (let i = 0; i < cp.count; i++) cu.push(cp.getX(i) * ADOBE_UV_PER_M + 0.3, cp.getY(i) * ADOBE_UV_PER_M + 0.2);
    c.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    parts.push(c.translate(side * (half + 0.55 + o() * 0.45), 0.06, (breachU - 0.5) * L + (o() - 0.5) * 0.8));
  }
  const ruin = merge(parts);
  // fitted as the standing wall is (bWallAdobe: the module to the legacy envelope), so the two share their scale
  const envelope = adobeEnvelope(o);
  envelope.computeBoundingBox();
  const box3 = envelope.boundingBox!.clone();
  envelope.dispose();
  const module = adobeModule(o);
  module.computeBoundingBox();
  const b = module.boundingBox!.clone();
  module.dispose();
  const sx = (box3.max.x - box3.min.x) / Math.max(1e-6, b.max.x - b.min.x);
  const sy = (box3.max.y - box3.min.y) / Math.max(1e-6, b.max.y - b.min.y);
  const sz = (box3.max.z - box3.min.z) / Math.max(1e-6, b.max.z - b.min.z);
  const p = ruin.attributes.position as THREE.BufferAttribute, nrm = ruin.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, box3.min.x + (p.getX(i) - b.min.x) * sx, box3.min.y + (p.getY(i) - b.min.y) * sy, box3.min.z + (p.getZ(i) - b.min.z) * sz);
    const nx = nrm.getX(i) / sx, ny = nrm.getY(i) / sy, nz = nrm.getZ(i) / sz, len = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(i, nx / len, ny / len, nz / len);
  }
  return ruin;
}

// --- sandbag emplacement (broken state for the sourced baked intact) --------
// The intact geometry is the licensed baked model (props.ts LOCAL kinds need
// bakedGeometry, so the kind entries live there); this is the shared
// driven-through state: bags burst, split and spilled.
export function bSandbagBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const HESS: Palette = [0.105, 0.22, 0.46];
  for (let k = 0; k < 11; k++) { // spilled single bags
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * 1.9;
    const bag = new THREE.SphereGeometry(0.26 + rng() * 0.08, 6, 5);
    bag.scale(1.35, 0.42 + rng() * 0.12, 0.85);
    bag.rotateY(rng() * Math.PI);
    bag.translate(Math.cos(a) * rr, 0.10, Math.sin(a) * rr * 0.7);
    parts.push(P(bag, HESS, 0.14, rng));
  }
  // low surviving bag course at one end
  for (let k = 0; k < 3; k++) {
    const bag = new THREE.SphereGeometry(0.28, 6, 5);
    bag.scale(1.4, 0.5, 0.9);
    bag.translate(-1.2 + k * 0.62, 0.13, -0.5 + (rng() - 0.5) * 0.2);
    parts.push(P(bag, HESS, 0.12, rng));
  }
  return merge(parts);
}

// --- ammunition boxes (stacked pair + strewn broken state) ------------------
function bAmmobox(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const spots = [[0, 0, 0, 0.14], [0.14, 0.36, -0.08, -0.3], [-0.5, 0, 0.32, 0.5]];
  for (const [px, py, pz, ry] of spots) {
    const bx = box(0.85, 0.36, 0.42);
    bx.rotateY(ry);
    parts.push(P(bx.translate(px, py + 0.18, pz), OLIVE_D, 0.10, rng));
    const lid = box(0.87, 0.06, 0.44);
    lid.rotateY(ry);
    parts.push(P(lid.translate(px, py + 0.38, pz), [OLIVE_D[0], OLIVE_D[1], OLIVE_D[2] * 1.25], 0.08, rng));
  }
  return merge(parts);
}
function bAmmoboxBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  for (let k = 0; k < 3; k++) { // burst boxes, lids blown
    const bx = box(0.8, 0.14, 0.4);
    bx.rotateY(rng() * Math.PI);
    bx.rotateX((rng() - 0.5) * 0.3);
    parts.push(P(bx.translate((rng() - 0.5) * 1.4, 0.08, (rng() - 0.5) * 1.2), OLIVE_D, 0.12, rng));
  }
  parts.push(...plankScatter(4, 0.5, 0.14, 0.8, rng, OLIVE_D));
  return merge(parts);
}

// --- field tent (canvas ridge tent) ------------------------------------------
function bTent(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const W = 2.4, H = 1.5, L = 3.2;
  for (const s of [-1, 1]) { // canvas slopes — weathered field canvas, not paper
    const slope = Math.hypot(W / 2, H);
    const panel = box(slope + 0.1, 0.05, L);
    panel.rotateZ(s * Math.atan2(H, W / 2));
    parts.push(P(panel.translate(-s * W / 4, H / 2 + 0.32, 0),
      s < 0 ? TENTCANVAS : [TENTCANVAS[0], TENTCANVAS[1], TENTCANVAS[2] * 0.92], 0.13, rng));
  }
  // rear gable canvas closed (triangular panel under the slopes); the front
  // stays open with one flap pulled aside
  {
    const tri = new THREE.Shape();
    tri.moveTo(-W * 0.46, 0);
    tri.lineTo(W * 0.46, 0);
    tri.lineTo(0, H * 0.92);
    tri.closePath();
    const end = new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: false });
    parts.push(P(end.translate(0, 0.30, -(L / 2 - 0.03)), TENTCANVAS_D, 0.12, rng));
  }
  const flap = box(W * 0.4, H * 0.7, 0.05);
  flap.rotateY(0.7);
  parts.push(P(flap.translate(W * 0.28, H * 0.36 + 0.3, L / 2 + 0.14), TENTCANVAS, 0.12, rng));
  for (const pz of [-L / 2 + 0.1, L / 2 - 0.1]) { // ridge poles
    parts.push(P(box(0.07, H + 0.34, 0.07).translate(0, (H + 0.34) / 2, pz), WOOD, 0.10, rng));
  }
  parts.push(P(box(0.06, 0.06, L + 0.2).translate(0, H + 0.30, 0), WOOD, 0.08, rng)); // ridge beam
  return merge(parts);
}
function bTentBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  // collapsed canvas: two crumpled sheets over a snapped ridge pole
  for (let k = 0; k < 2; k++) {
    const sheet = box(1.6 + rng() * 0.8, 0.10, 2.0 + rng() * 0.9);
    sheet.rotateY(rng() * Math.PI);
    sheet.rotateX((rng() - 0.5) * 0.16);
    parts.push(P(sheet.translate((rng() - 0.5) * 1.2, 0.10 + k * 0.07, (rng() - 0.5) * 0.8), k ? TENTCANVAS : TENTCANVAS_D, 0.12, rng));
  }
  const pole = box(0.07, 0.07, 2.2);
  pole.rotateY(rng());
  parts.push(P(pole.translate(0.2, 0.22, 0), WOOD, 0.10, rng));
  return merge(parts);
}
/**
 * (b39) The tent down: its ridge snapped at the middle — the rear pole still standing, the front one broken off with
 * splinters, the ridge's halves sloping from the standing pole to the ground — and the canvas fallen with them, its two
 * slopes sagging in folds from the broken ridge to the pegs; the rear gable fallen in, the door flap lying open.
 */
function bTentBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bTentBrokenLegacy, rng, 0x7e47);
  const parts: THREE.BufferGeometry[] = [];
  const W = 2.4, H = 1.5, L = 3.2, top = H + 0.3;
  parts.push(P(put(box(0.07, H + 0.34, 0.07).translate(0, (H + 0.34) / 2, 0), 0, 0, -L / 2 + 0.1, 0.1, 0, 0.05), WOOD, 0.10, o));
  for (const g of snappedTimber(0.07, 0.45 + o() * 0.25, 0.07, o)) parts.push(P(g.translate(0, 0, L / 2 - 0.1), WOOD, 0.10, o));
  // the ridge in two, from the standing pole down to where it broke, and its far half lying
  const breakZ = 0.15 + o() * 0.3, breakY = 0.35 + o() * 0.2;
  const len1 = Math.hypot(breakZ + L / 2, top - breakY), a1 = Math.atan2(top - breakY, breakZ + L / 2);
  const r1 = box(0.06, 0.06, len1); r1.translate(0, 0, len1 / 2); r1.rotateX(a1);
  parts.push(P(r1.translate(0, top, -L / 2), WOOD, 0.08, o));
  parts.push(P(put(box(0.06, 0.06, L / 2 - breakZ + 0.15), 0.08, 0.04, (breakZ + L / 2) / 2 + 0.05, 0, 0.12, 0), WOOD, 0.08, o));
  // the canvas: from the broken ridge line down to the pegs either side, in folds
  const ridgeAt = (z: number) => {
    const t = Math.min(1, Math.max(0, (z + L / 2) / (breakZ + L / 2)));
    return z <= breakZ ? top + (breakY - top) * t : breakY * Math.max(0.15, 1 - (z - breakZ) / (L / 2 - breakZ + 0.2));
  };
  const fold = (x: number, z: number) => 0.05 * Math.sin(z * 7.3 + x * 2.1) + 0.03 * Math.sin(x * 9 - z * 3);
  for (const sgn of [-1, 1]) {
    const h = (x: number, z: number) => {
      const across = Math.min(1, Math.abs(x) / (W / 2 + 0.25));
      return Math.max(0.03, ridgeAt(z) * Math.pow(1 - across, 1.3) + fold(x, z) * (1 - across * 0.5));
    };
    const strip = sgn < 0 ? drapedStrip(-W / 2 - 0.25, 0, -L / 2, L / 2 + 0.1, 8, h, 3) : drapedStrip(0, W / 2 + 0.25, -L / 2, L / 2 + 0.1, 8, h, 3);
    parts.push(P(strip, sgn < 0 ? TENTCANVAS : [TENTCANVAS[0], TENTCANVAS[1], TENTCANVAS[2] * 0.92], 0.13, o));
  }
  // the rear gable fallen in under the slopes, the flap lying open in front
  const tri = new THREE.Shape();
  tri.moveTo(-W * 0.46, 0); tri.lineTo(W * 0.46, 0); tri.lineTo(0, H * 0.92); tri.closePath();
  const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false });
  parts.push(P(put(gable, 0, 0.12, -L / 2 - 0.05, -1.25, 0, 0), TENTCANVAS_D, 0.12, o));
  parts.push(P(put(box(W * 0.4, 0.04, H * 0.7), W * 0.3, 0.05, L / 2 + 0.55, 0, 0.5, 0.05), TENTCANVAS, 0.12, o));
  return merge(parts);
}

// --- modern roadside / industrial clutter ---------------------------------
// These five silhouettes extend the map language beyond farm and WWII props.
// They remain one instanced pool per kind and use the same break/topple seam,
// so denser modern maps do not add per-object draw calls or idle updates.
function bBarrier(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const CONC: Palette = [0.08, 0.06, 0.43];
  const base = box(0.72, 0.42, 2.7);
  parts.push(P(base.translate(0, 0.21, 0), CONC, 0.10, rng));
  const top = box(0.34, 0.58, 2.52);
  parts.push(P(top.translate(0, 0.68, 0), [0.08, 0.05, 0.5], 0.13, rng));
  for (const z of [-0.92, 0.92]) {
    parts.push(P(box(0.78, 0.12, 0.22).translate(0, 0.06, z), CONC, 0.08, rng));
  }
  // Recessed reflective panels make these read as purpose-built traffic
  // barriers instead of unmarked concrete blocks. They stay in the same
  // vertex-colour destructible pool (zero additional material/draw family).
  for (const side of [-1, 1]) for (const z of [-0.82, 0, 0.82]) {
    parts.push(P(box(0.025, 0.20, 0.42).translate(side * 0.185, 0.72, z),
      z === 0 ? [0.055, 0.48, 0.68] : [0.52, 0.46, 0.10], 0.06, _detailRng));
  }
  return merge(parts);
}
function bBarrierBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const CONC: Palette = [0.08, 0.05, 0.38];
  for (let i = 0; i < 7; i++) {
    const s = 0.24 + rng() * 0.34;
    const chunk = box(s * (0.8 + rng()), s, s * (0.7 + rng() * 0.7));
    chunk.rotateX((rng() - 0.5) * 0.8);
    chunk.rotateY(rng() * Math.PI);
    parts.push(P(chunk.translate((rng() - 0.5) * 1.5, s * 0.35,
      (rng() - 0.5) * 2.8), CONC, 0.16, rng));
  }
  return merge(parts);
}

// --- fortifications (owner 2026-09-17: "more trenches/barbed wire/AA guns/bunkers on ALL maps") ---------

/**
 * Barbed-wire module: two screw pickets carrying three taut strands and a tangle of short barbed
 * coils between them (2.6 m along +z). Shoot-through, crushable at a walking pace with a small bite.
 */
function bBarbedWire(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  for (const z of [-1.15, 1.15]) {
    const picket = cyl(0.028, 0.034, 1.02, 5);
    picket.rotateX((rng() - 0.5) * 0.16);
    parts.push(P(picket.translate(0, 0.51, z), RUST, 0.10, rng));
    // corkscrew foot of the picket
    parts.push(P(cyl(0.07, 0.05, 0.10, 6).translate(0, 0.05, z), RUST, 0.08, rng));
  }
  for (const y of [0.34, 0.64, 0.94]) {
    parts.push(P(box(0.018, 0.018, 2.62).translate(0, y, 0), IRON, 0.10, rng));
  }
  // diagonal bracing strands
  for (const side of [-1, 1]) {
    const brace = box(0.016, 0.016, 2.7);
    brace.rotateX(side * 0.235);
    parts.push(P(brace.translate(0, 0.64, 0), IRON, 0.10, rng));
  }
  // concertina barbs: short angled stubs along the run
  for (let i = 0; i < 10; i++) {
    const barb = box(0.02, 0.02, 0.26);
    barb.rotateX((rng() - 0.5) * 2.4);
    barb.rotateY((rng() - 0.5) * 1.2);
    parts.push(P(barb.translate((rng() - 0.5) * 0.18, 0.46 + rng() * 0.48, -1.1 + (i + rng()) * 0.22), RUST, 0.12, rng));
  }
  return merge(parts);
}
function bBarbedWireBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  // one picket down, strands tangled on the ground
  const picket = cyl(0.028, 0.034, 1.02, 5);
  picket.rotateX(Math.PI / 2 - 0.2);
  picket.rotateY(rng() * 0.6);
  parts.push(P(picket.translate(0.1, 0.05, 0.6), RUST, 0.10, rng));
  for (let i = 0; i < 7; i++) {
    const strand = box(0.018, 0.018, 0.5 + rng() * 0.6);
    strand.rotateY(rng() * Math.PI);
    strand.rotateX((rng() - 0.5) * 0.5);
    parts.push(P(strand.translate((rng() - 0.5) * 0.8, 0.03 + rng() * 0.12, (rng() - 0.5) * 2.4), IRON, 0.12, rng));
  }
  return merge(parts);
}

/**
 * Concrete pillbox (5.6 × 2.3 × 5.0 m): chamfered body under a roof slab, a wide firing embrasure
 * on +z with two flank slits, a door recess aft, an earth berm skirt and a sandbag cap on the roof
 * edge. Solid to hulls and shells (collider), breaks into rubble under fire.
 */
function bBunker(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const CONC: Palette = [0.09, 0.05, 0.42];
  const CONC_DARK: Palette = [0.09, 0.05, 0.33];
  const SLIT: Palette = [0.60, 0.05, 0.05];
  const EARTH: Palette = [0.09, 0.30, 0.27];
  const BAGS: Palette = [0.10, 0.26, 0.46];
  parts.push(P(box(5.6, 1.9, 5.0).translate(0, 0.95, 0), CONC, 0.10, rng));
  // chamfered shoulders soften the box silhouette
  for (const side of [-1, 1]) {
    const shoulder = box(1.6, 1.9, 1.6);
    shoulder.rotateY(Math.PI / 4);
    parts.push(P(shoulder.translate(side * 2.55, 0.95, 1.95), CONC, 0.10, rng));
    parts.push(P(box(0.9, 0.34, 0.12).translate(side * 2.05, 1.3, 2.52), SLIT, 0.04, rng));
  }
  parts.push(P(box(5.95, 0.36, 5.35).translate(0, 2.08, 0), CONC_DARK, 0.09, rng));
  parts.push(P(box(2.5, 0.44, 0.14).translate(0, 1.36, 2.52), SLIT, 0.04, rng));
  parts.push(P(box(0.95, 1.55, 0.14).translate(0.9, 0.78, -2.52), SLIT, 0.04, rng));
  // earth berm skirt on three sides (the door side stays open)
  for (const [x, z, ry] of [[0, 2.95, 0], [-3.25, 0, Math.PI / 2], [3.25, 0, Math.PI / 2]] as const) {
    const berm = box(6.6, 0.9, 1.2);
    berm.rotateX(0.62);
    berm.rotateY(ry);
    parts.push(P(berm.translate(x, 0.18, z), EARTH, 0.12, rng));
  }
  // sandbag cap along the roof edges
  for (const [x, z, ry] of [[0, 2.55, 0], [0, -2.55, 0], [-2.85, 0, Math.PI / 2], [2.85, 0, Math.PI / 2]] as const) {
    const cap = box(5.6, 0.34, 0.42);
    cap.rotateY(ry);
    parts.push(P(cap.translate(x, 2.43, z), BAGS, 0.12, rng));
  }
  return merge(parts);
}
function bBunkerBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const CONC: Palette = [0.09, 0.05, 0.36];
  // the roof slab dropped and tilted into the shell
  const slab = box(5.6, 0.36, 5.0);
  slab.rotateZ(0.22);
  slab.rotateX(-0.12);
  parts.push(P(slab.translate(0.3, 1.05, 0.2), CONC, 0.10, rng));
  parts.push(P(box(5.4, 0.9, 4.8).translate(0, 0.45, 0), CONC, 0.10, rng));
  for (let i = 0; i < 9; i++) {
    const s = 0.4 + rng() * 0.6;
    const chunk = box(s * (0.8 + rng()), s, s * (0.7 + rng() * 0.7));
    chunk.rotateX((rng() - 0.5) * 0.9);
    chunk.rotateY(rng() * Math.PI);
    parts.push(P(chunk.translate((rng() - 0.5) * 6.4, s * 0.4, (rng() - 0.5) * 6.0), CONC, 0.16, rng));
  }
  return merge(parts);
}

function bRoadsign(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const post = box(0.11, 2.8, 0.11);
  parts.push(P(post.translate(0, 1.4, 0), STEEL, 0.08, rng));
  const sign = box(1.18, 0.78, 0.07);
  parts.push(P(sign.translate(0, 2.45, 0), [0.58, 0.56, 0.12], 0.08, rng));
  const inset = box(0.92, 0.52, 0.025);
  parts.push(P(inset.translate(0, 2.45, 0.052), [0.02, 0.12, 0.48], 0.05, rng));
  // Direction chevron, border and mounting bolts remain geometric at this
  // scale, so the sign retains meaning when texture mip levels collapse.
  for (const x of [-0.36, 0.36]) {
    parts.push(P(box(0.06, 0.06, 0.035).translate(x, 2.45, 0.084), STEEL, 0.03, _detailRng));
  }
  for (const y of [2.22, 2.68]) {
    parts.push(P(box(0.92, 0.035, 0.024).translate(0, y, 0.083), [0.58, 0.56, 0.12], 0.03, _detailRng));
  }
  const shaft = box(0.48, 0.07, 0.026).translate(-0.10, 2.45, 0.085);
  parts.push(P(shaft, [0.58, 0.56, 0.12], 0.03, _detailRng));
  const up = box(0.24, 0.07, 0.026); up.rotateZ(Math.PI / 4);
  parts.push(P(up.translate(0.26, 2.54, 0.085), [0.58, 0.56, 0.12], 0.03, _detailRng));
  const dn = box(0.24, 0.07, 0.026); dn.rotateZ(-Math.PI / 4);
  parts.push(P(dn.translate(0.26, 2.36, 0.085), [0.58, 0.56, 0.12], 0.03, _detailRng));
  return merge(parts);
}

function bCone(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const ORANGE: Palette = [0.055, 0.84, 0.48];
  parts.push(P(box(0.5, 0.08, 0.5).translate(0, 0.04, 0), [0.03, 0.06, 0.18], 0.06, rng));
  const cone = new THREE.ConeGeometry(0.21, 0.68, 10, 1);
  parts.push(P(cone.translate(0, 0.42, 0), ORANGE, 0.08, rng));
  const band = new THREE.CylinderGeometry(0.17, 0.19, 0.1, 10, 1);
  parts.push(P(band.translate(0, 0.42, 0), [0.11, 0.04, 0.82], 0.03, rng));
  return merge(parts);
}

function bTransformer(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const CAB: Palette = [0.31, 0.12, 0.29];
  parts.push(P(box(1.2, 1.5, 0.78).translate(0, 0.75, 0), CAB, 0.12, rng));
  parts.push(P(box(1.08, 0.06, 0.03).translate(0, 0.92, 0.405), STEEL, 0.05, rng));
  for (const x of [-0.36, 0, 0.36]) {
    const ins = new THREE.CylinderGeometry(0.08, 0.1, 0.34, 7, 1);
    parts.push(P(ins.translate(x, 1.68, 0), [0.32, 0.18, 0.32], 0.06, rng));
  }
  for (let i = 0; i < 5; i++) {
    parts.push(P(box(0.72, 0.035, 0.035).translate(0, 0.42 + i * 0.11, 0.414),
      STEEL, 0.04, _detailRng));
  }
  parts.push(P(box(0.24, 0.22, 0.028).translate(0.35, 1.12, 0.416),
    [0.55, 0.50, 0.08], 0.04, _detailRng));
  parts.push(P(box(0.06, 0.30, 0.055).translate(-0.34, 1.08, 0.43), STEEL, 0.04, _detailRng));
  parts.push(P(box(1.45, 0.12, 0.95).translate(0, 0.06, 0), [0.08, 0.05, 0.4], 0.08, rng));
  return merge(parts);
}
function bTransformerBrokenLegacy(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const shell = box(1.15, 0.42, 0.75);
  shell.rotateZ(0.18 + rng() * 0.25);
  parts.push(charPaint(shell.translate(0, 0.3, 0), rng, 0.35));
  for (let i = 0; i < 4; i++) {
    const plate = box(0.6 + rng() * 0.35, 0.05, 0.35 + rng() * 0.25);
    plate.rotateX((rng() - 0.5) * 0.5);
    plate.rotateY(rng() * Math.PI);
    parts.push(charPaint(plate.translate((rng() - 0.5) * 1.6, 0.08,
      (rng() - 0.5) * 1.3), rng, 0.4));
  }
  return merge(parts);
}
/**
 * (b39) A part in its palette, scorched in patches: soot where a slow noise over its position runs high (higher up the
 * part, as a fire climbs), the paint blistered dark round the soot, the rest its own colour, so a burned cabinet keeps
 * its identity. `keep` (0..1) moves the line: higher keeps more paint.
 */
function scorched<T extends THREE.BufferGeometry>(geo: T, pal: Palette, o: Rng, keep: number, phase = 0): T {
  P(geo, pal, 0.06, o);
  const pos = geo.attributes.position, col = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const heat = 0.5 + 0.24 * Math.sin(x * 5.3 + y * 3.1 + phase) + 0.24 * Math.sin(z * 4.7 - y * 6.2 + phase * 1.7) + y * 0.1;
    if (heat > keep + 0.1) {
      _c.setHSL(CHAR[0], CHAR[1], Math.max(0.02, CHAR[2] + (o() - 0.5) * 0.04), THREE.SRGBColorSpace);
      col.setXYZ(i, _c.r, _c.g, _c.b);
    } else if (heat > keep) col.setXYZ(i, col.getX(i) * 0.5, col.getY(i) * 0.46, col.getZ(i) * 0.42);
  }
  return geo;
}

/**
 * (b39) The pad-mount transformer blown open: the cabinet knocked half off its plinth and slumped, its front torn off
 * and lying face up before it with the warning plate and three of the cooling fins still on it, the core's copper
 * windings showing in the scorched dark inside; the green paint surviving in patches over the soot, the bushings
 * snapped to stumps but one, cracked and leaning, porcelain shards and two fins in the dirt, the oil out in a dark
 * pool round the plinth.
 */
function bTransformerBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(bTransformerBrokenLegacy, rng, 0x7f0a);
  const CAB: Palette = [0.31, 0.12, 0.29], PORCELAIN: Palette = [0.32, 0.18, 0.32], COPPER: Palette = [0.06, 0.55, 0.3];
  const parts: THREE.BufferGeometry[] = [];
  // the oil: a dark glossless pool spread round the plinth's foot
  const pool = new THREE.CircleGeometry(1, 12);
  pool.rotateX(-Math.PI / 2);
  pool.scale(1.15 + o() * 0.2, 1, 0.85 + o() * 0.15);
  parts.push(P(pool.translate(0.1, 0.012, 0.2), [0.08, 0.25, 0.045], 0.02, o));
  // the plinth stays where it stood, sooted along the side the cabinet burned on
  parts.push(scorched(new THREE.BoxGeometry(1.45, 0.12, 0.95, 2, 1, 2).translate(0, 0.06, 0), [0.08, 0.05, 0.4], o, 0.62, 1.3));
  // the cabinet: back, sides, buckled top and floor, open at the front, slumped to 1.18 m
  const H = 1.18, W = 1.2, D = 0.78, t = 0.04, phase = o() * 6;
  const cab: THREE.BufferGeometry[] = [];
  cab.push(scorched(new THREE.BoxGeometry(W, H, t, 3, 3, 1).translate(0, H / 2, -D / 2 + t / 2), CAB, o, 0.5, phase));
  cab.push(scorched(new THREE.BoxGeometry(t, H, D, 1, 3, 2).translate(-W / 2 + t / 2, H / 2, 0), CAB, o, 0.5, phase));
  const torn = new THREE.BoxGeometry(t, H * 0.8, D, 1, 3, 2); // the right side torn short where the front came away
  cab.push(scorched(torn.translate(W / 2 - t / 2, H * 0.4, 0), CAB, o, 0.5, phase));
  const top = new THREE.BoxGeometry(W + 0.05, t, D + 0.05, 3, 1, 2);
  top.rotateX(0.14); top.rotateZ(-0.09); // buckled by the blast
  cab.push(scorched(top.translate(0, H + 0.02, 0.02), CAB, o, 0.45, phase));
  cab.push(scorched(new THREE.BoxGeometry(W, t, D).translate(0, t / 2, 0), CAB, o, 0.3, phase));
  // the core inside: three windings on a yoke, the copper burnt dark and green with verdigris
  for (const x of [-0.34, 0, 0.34]) {
    const coil = new THREE.CylinderGeometry(0.13, 0.13, 0.62, 8, 1);
    cab.push(scorched(coil.translate(x, 0.42, -0.06), COPPER, o, 0.4, phase + x));
  }
  cab.push(scorched(new THREE.BoxGeometry(1.0, 0.1, 0.22).translate(0, 0.78, -0.06), IRON, o, 0.35, phase));
  // the bushings: two snapped to stumps, the third cracked and leaning
  for (const [x, h, lean] of [[-0.36, 0.09, 0], [0, 0.12, 0], [0.36, 0.3, 0.35 + o() * 0.2]] as const) {
    const bushing = new THREE.CylinderGeometry(h < 0.2 ? 0.095 : 0.08, 0.1, h, 7, 1);
    bushing.translate(0, h / 2, 0); bushing.rotateZ(-lean);
    cab.push(P(bushing.translate(x, H + 0.04, 0), PORCELAIN, 0.06, o));
  }
  // the whole cabinet slid off the plinth's side: its floor on the plinth's edge, its far corner in the dirt
  const tip = 0.22 + o() * 0.08, reach = 0.725 + 0.12 / Math.tan(tip);
  for (const g of cab) { g.rotateZ(-tip); g.translate(reach - (W / 2) * Math.cos(tip), (W / 2) * Math.sin(tip), -0.04); parts.push(g); }
  // the front, torn off and thrown face up before the plinth, its warning plate and three fins still on it
  const door: THREE.BufferGeometry[] = [];
  door.push(scorched(new THREE.BoxGeometry(W - 0.06, 0.035, H - 0.1, 3, 1, 3), CAB, o, 0.55, phase + 2));
  for (const i of [0, 1, 3]) door.push(P(box(0.72, 0.035, 0.035).translate(0, 0.035, -0.3 + i * 0.11), STEEL, 0.04, o));
  door.push(P(box(0.24, 0.028, 0.22).translate(0.35, 0.03, 0.2), [0.55, 0.50, 0.08], 0.04, o));
  const doorYaw = (o() - 0.5) * 0.6;
  for (const g of door) { g.rotateX(0.05); g.rotateY(doorYaw); g.translate(0.05 + (o() - 0.5) * 0.2, 0.03, 1.05); parts.push(g); }
  // two fins in the dirt, bent
  for (let k = 0; k < 2; k++) {
    const fin = box(0.72, 0.035, 0.035);
    fin.rotateZ((o() - 0.5) * 0.3); fin.rotateY(o() * Math.PI);
    parts.push(P(fin.translate(-0.9 + o() * 0.4, 0.02, 0.6 + o() * 0.6), STEEL, 0.04, o));
  }
  // porcelain shards from the snapped bushings
  for (let k = 0; k < 6; k++) {
    const shard = box(0.05 + o() * 0.07, 0.03, 0.04 + o() * 0.05);
    shard.rotateY(o() * Math.PI);
    parts.push(P(shard.translate(-0.8 + o() * 1.9, 0.015, -0.9 + o() * 0.5), PORCELAIN, 0.08, o));
  }
  return merge(parts);
}

function bCableSpool(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const axis = new THREE.CylinderGeometry(0.18, 0.18, 1.0, 10, 1);
  axis.rotateZ(Math.PI / 2);
  parts.push(P(axis.translate(0, 0.68, 0), STEEL, 0.08, rng));
  for (const x of [-0.55, 0.55]) {
    const cheek = new THREE.CylinderGeometry(0.74, 0.74, 0.12, 12, 1);
    cheek.rotateZ(Math.PI / 2);
    parts.push(P(cheek.translate(x, 0.68, 0), WOOD, 0.15, rng));
    for (let i = 0; i < 4; i++) {
      const spoke = box(0.04, 1.18, 0.08);
      spoke.rotateX(i * Math.PI / 4);
      parts.push(P(spoke.translate(x + Math.sign(x) * 0.07, 0.68, 0), WOOD, 0.10, _detailRng));
    }
  }
  const cable = new THREE.CylinderGeometry(0.49, 0.49, 0.96, 12, 1);
  cable.rotateZ(Math.PI / 2);
  parts.push(P(cable.translate(0, 0.68, 0), [0.02, 0.05, 0.13], 0.06, rng));
  return merge(parts);
}
function bCableSpoolBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  for (let i = 0; i < 2; i++) {
    const cheek = new THREE.CylinderGeometry(0.68, 0.68, 0.1, 12, 1);
    cheek.rotateX(Math.PI / 2);
    cheek.rotateY((rng() - 0.5) * 0.5);
    parts.push(P(cheek.translate((rng() - 0.5) * 1.7, 0.1,
      (rng() - 0.5) * 1.1), WOOD, 0.17, rng));
  }
  parts.push(...plankScatter(5, 0.7, 0.12, 1.3, rng, WOOD));
  return merge(parts);
}

// --- EXPLOSIVE fuel drum (rare red variant — fx blast + chain damage) --------
function bDrumRed(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const body = cyl(0.30, 0.30, 0.90, 11);
  parts.push(P(body.translate(0, 0.45, 0), REDDRUM, 0.08, rng));
  for (const hy of [0.28, 0.62]) {
    const rib = new THREE.CylinderGeometry(0.315, 0.315, 0.045, 11, 1, true);
    parts.push(P(rib.translate(0, hy, 0), [REDDRUM[0], REDDRUM[1] * 0.8, REDDRUM[2] * 0.72], 0.05, rng));
  }
  const band = new THREE.CylinderGeometry(0.305, 0.305, 0.12, 11, 1, true); // pale hazard band
  parts.push(P(band.translate(0, 0.45, 0), [0.11, 0.30, 0.62], 0.06, rng));
  return merge(parts);
}
function bDrumRedBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  // torn-open shell: split half-cylinders peeled flat + charred base ring
  for (const s of [-1, 1]) {
    const half = new THREE.CylinderGeometry(0.30, 0.30, 0.82, 6, 1, true, s > 0 ? 0 : Math.PI, Math.PI);
    half.rotateZ(Math.PI / 2 - s * 0.4);
    half.rotateY(rng() * Math.PI);
    parts.push(charPaint(half.translate(s * 0.42, 0.16, (rng() - 0.5) * 0.4), rng, 0.35));
  }
  const base = new THREE.CylinderGeometry(0.29, 0.29, 0.05, 11, 1);
  parts.push(charPaint(base.translate(0.05, 0.03, 0.1), rng, 0.4));
  return merge(parts);
}

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

/**
 * Destructible type table (world-dressing r1, extended DESTRUCTIBLES r1).
 * cls: 'break' swaps intact -> broken debris; 'topple' hinge-falls and
 *   persists; 'physics' is a sleeping deterministic loose body that can be
 *   pushed repeatedly, bounce, tumble, collide and settle.
 * mat: 'wood' | 'straw' | 'stone' | 'plaster' (map-toned textured materials)
 *   | 'baked' (vertex color) | 'vehicle' (vertex color multiplied by a shared
 *     low-bandwidth paint/chip PBR texture).
 * contact: 'ob' = crushable obstacle (state.ts SAT seam — resists a crawl,
 *   breaks on real overrun, exactly the tree mechanism); 'loop' = cosmetic
 *   hull-radius crush via the world.crushables loop in main.ts (no obstacle
 *   at all — sapling class); 'none' = shells only.
 * r/h: record radius / height (AABB + shell sweep bounds).
 * DESTRUCTIBLES r1 knobs (consumed by props.ts):
 *   keep: per-overrun speed retention (ob.crushKeep — 0.97 sandbags barely
 *     bite, 0.82 stone wall scrubs hard; default state.ts CRUSH_SPEED_KEEP);
 *   crushMin: overrun threshold m/s override (ob.crushMin);
 *   collider: record blocks SHELLS/LOS while intact (flagged dead on break —
 *     walls/trucks are real cover until breached; everything else stays
 *     shoot-through per the sapling rule);
 *   explosive: breaking detonates — fx blast + chained radius damage;
 *   wall: module marches at WALL_SEG pitch with run-oriented AABBs (like
 *     fence, but thick masonry footprint).
 *   hw/hl: authored local half-width/half-length for a tight oriented box;
 *   shape: 'circle' plus optional collisionR for genuinely round footprints.
 */
export const DESTRUCTIBLE_TYPES = {
  barrel:      { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.40, h: 1.0,  build: bBarrel,      broken: bBarrelBroken },
  crate:       { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.62, h: 1.1,  hw: 0.51, hl: 0.51, build: bCrate, broken: bCrateBroken },
  pallet:      { cls: 'break',  mat: 'wood',  contact: 'loop', r: 0.62, h: 0.2,  build: bPallet,      broken: bPalletBroken },
  bale:        { cls: 'break',  mat: 'straw', contact: 'ob',   r: 0.78, h: 1.45, shape: 'circle', collisionR: 0.75, build: bBale, broken: bBaleBroken },
  stook:       { cls: 'break',  mat: 'straw', contact: 'ob',   r: 0.55, h: 1.3,  shape: 'circle', collisionR: 0.48, build: bStook, broken: bStookBroken,
    contactProxy: () => prismStandIn(0.22, 1.3) }, // (b24: inside the sheaves' cone; haystackKit prismStandIn)
  firewood:    { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.85, h: 0.95, hw: 0.84, hl: 0.69, build: bFirewood, broken: bFirewoodBroken },
  trough:      { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.95, h: 0.68, hw: 0.36, hl: 1.0, build: bTrough, broken: bTroughBroken },
  stall:       { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.45, h: 2.3,  hw: 1.42, hl: 0.94, build: bStall, broken: bStallBroken },
  bench:       { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.85, h: 1.0,  hw: 0.88, hl: 0.28, build: bBench, broken: bBenchBroken },
  churn:       { cls: 'physics', mat: 'baked', contact: 'loop', r: 0.26, h: 0.82, build: bChurn,       broken: null, bodyR: 0.23, mass: 0.65, bounce: 0.38 },
  lamp:        { cls: 'topple', mat: 'baked', contact: 'ob',   r: 0.30, h: 4.7,  shape: 'circle', collisionR: 0.20, groundR: 0.22, build: bLamp, broken: null },
  drum:        { cls: 'physics', mat: 'baked', contact: 'loop', r: 0.32, h: 0.92, build: bDrum,        broken: null, bodyR: 0.31, mass: 1.0, bounce: 0.30 },
  trashcan:    { cls: 'physics', mat: 'baked', contact: 'loop', r: 0.35, h: 0.85, build: bTrashcan,    broken: null, bodyR: 0.32, mass: 0.75, bounce: 0.34 },
  gasbottle:   { cls: 'physics', mat: 'baked', contact: 'loop', r: 0.22, h: 1.0,  build: bGasBottle,   broken: null, bodyR: 0.20, mass: 1.2, bounce: 0.28 },
  bucket:      { cls: 'physics', mat: 'baked', contact: 'loop', r: 0.27, h: 0.62, build: bBucket,      broken: null, bodyR: 0.23, mass: 0.38, bounce: 0.46 },
  jerrycan:    { cls: 'physics', mat: 'baked', contact: 'loop', r: 0.29, h: 0.72, build: bJerryCan,    broken: null, bodyR: 0.27, mass: 0.82, bounce: 0.27 },
  loosewheel:  { cls: 'physics', mat: 'baked', contact: 'loop', r: 0.36, h: 0.69, build: bLooseWheel,  broken: null, bodyR: 0.34, mass: 0.85, bounce: 0.40, friction: 1.15 },
  sled:        { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.75, h: 0.5,  hw: 0.45, hl: 1.0, build: bSled, broken: bSledBroken },
  pot:         { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.55, h: 0.75, build: bPot,         broken: bPotBroken },
  rugframe:    { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.15, h: 2.2,  hw: 1.2, hl: 0.12, build: bRugFrame, broken: bRugFrameBroken },
  laundry:     { cls: 'break',  mat: 'baked', contact: 'loop', r: 1.75, h: 1.95, build: bLaundry,     broken: bLaundryBroken },
  haycart:     { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.55, h: 2.1,  hw: 1.54, hl: 2.16, build: bHaycart, broken: bHaycartBroken },
  handcart:    { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.85, h: 1.1,  hw: 0.62, hl: 1.14, build: bHandcart, broken: bHandcartBroken },
  haystack:    { cls: 'break',  mat: 'straw', contact: 'ob',   r: 1.75, h: 2.5,  shape: 'circle', collisionR: 1.75, build: bHaystack, broken: bHaystackBroken,
    contactProxy: () => prismStandIn(1.49, STRAW_STAND_IN_TOP_M) }, // (b24: inside the kopna's foot, not the old cone's 1.75)
  fenceplank:  { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.25, h: 1.1,  hw: 0.10, hl: 1.25, build: bFencePlank,  broken: bFencePlankBroken, fence: true },
  fencepicket: { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.25, h: 1.0,  hw: 0.10, hl: 1.25, build: bFencePicket, broken: bFencePicketBroken, fence: true },
  fencewattle: { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.25, h: 1.0,  hw: 0.10, hl: 1.25, build: bFenceWattle, broken: bFenceWattleBroken, fence: true },
  fencerail:   { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.25, h: 1.05, hw: 0.11, hl: 1.25, build: bFenceRail,   broken: bFenceRailBroken, fence: true },
  gate:        { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.0,  h: 1.3,  hw: 0.46, hl: 0.97, build: bGate,        broken: bGateBroken },
  // --- DESTRUCTIBLES r1: heavier light cover + soft vehicles ---------------
  wallstone:   { cls: 'break',  mat: 'stone',   contact: 'ob', r: 1.6,  h: 1.15, hw: 0.30, hl: 1.54, build: bWallStone,  broken: bWallStoneBroken, wall: true, collider: true, keep: 0.82, crushMin: 2.2 },
  walladobe:   { cls: 'break',  mat: 'plaster', contact: 'ob', r: 1.6,  h: 1.2,  hw: 0.28, hl: 1.53, build: bWallAdobe,  broken: bWallAdobeBroken, wall: true, collider: true, keep: 0.86, crushMin: 2.0 },
  truck:       { cls: 'break',  mat: 'vehicle', contact: 'ob', r: 3.55, h: 2.3,  hw: 1.29, hl: 3.30, build: CIVILIAN_VEHICLE_RECEIPTS.truck.build, broken: CIVILIAN_VEHICLE_RECEIPTS.truck.broken, collider: true, keep: 0.88, crushMin: 2.0 },
  jeep:        { cls: 'break',  mat: 'vehicle', contact: 'ob', r: 2.10, h: 1.73, hw: 0.94, hl: 1.88, build: CIVILIAN_VEHICLE_RECEIPTS.jeep.build, broken: CIVILIAN_VEHICLE_RECEIPTS.jeep.broken, keep: 0.94 },
  sedan:       { cls: 'break',  mat: 'vehicle', contact: 'ob', r: 2.35, h: 1.61, hw: 1.01, hl: 2.13, build: CIVILIAN_VEHICLE_RECEIPTS.sedan.build, broken: CIVILIAN_VEHICLE_RECEIPTS.sedan.broken, keep: 0.95 },
  wagon:       { cls: 'break',  mat: 'vehicle', contact: 'ob', r: 2.35, h: 1.69, hw: 1.01, hl: 2.13, build: CIVILIAN_VEHICLE_RECEIPTS.wagon.build, broken: CIVILIAN_VEHICLE_RECEIPTS.wagon.broken, keep: 0.95 },
  pickup:      { cls: 'break',  mat: 'vehicle', contact: 'ob', r: 2.72, h: 1.77, hw: 1.11, hl: 2.47, build: CIVILIAN_VEHICLE_RECEIPTS.pickup.build, broken: CIVILIAN_VEHICLE_RECEIPTS.pickup.broken, keep: 0.93 },
  van:         { cls: 'break',  mat: 'vehicle', contact: 'ob', r: 2.63, h: 2.08, hw: 1.11, hl: 2.38, build: CIVILIAN_VEHICLE_RECEIPTS.van.build, broken: CIVILIAN_VEHICLE_RECEIPTS.van.broken, collider: true, keep: 0.92, crushMin: 1.8 },
  truckbox:    { cls: 'break',  mat: 'vehicle', contact: 'ob', r: 3.55, h: 2.47, hw: 1.29, hl: 3.30, build: CIVILIAN_VEHICLE_RECEIPTS.truckbox.build, broken: CIVILIAN_VEHICLE_RECEIPTS.truckbox.broken, collider: true, keep: 0.87, crushMin: 2.0 },
  truckflatbed:{ cls: 'break',  mat: 'vehicle', contact: 'ob', r: 3.55, h: 1.96, hw: 1.29, hl: 3.30, build: CIVILIAN_VEHICLE_RECEIPTS.truckflatbed.build, broken: CIVILIAN_VEHICLE_RECEIPTS.truckflatbed.broken, collider: true, keep: 0.87, crushMin: 2.0 },
  ammobox:     { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.85, h: 0.75, build: bAmmobox,    broken: bAmmoboxBroken },
  tent:        { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.7,  h: 2.1,  hw: 1.28, hl: 1.90, build: bTent, broken: bTentBroken, keep: 0.985 },
  drumred:     { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.34, h: 0.92, build: bDrumRed,    broken: bDrumRedBroken, explosive: true },
  barrier:     { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.45, h: 1.0,  hw: 0.42, hl: 1.42, build: bBarrier, broken: bBarrierBroken, collider: true, keep: 0.83, crushMin: 2.4 },
  // fortifications (2026-09-17): shoot-through wire a hull crushes with a bite; a pillbox no hull crushes and shells stop on
  barbedwire:  { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.4,  h: 1.05, hw: 0.10, hl: 1.32, build: bBarbedWire, broken: bBarbedWireBroken, keep: 0.9, crushMin: 1.5 },
  // (b12, gauntlet wave 81: Verdant's and Frontier's villages "mix a thatched roof, a red tile roof … and a red quonset-style
  // roof": the concrete pillbox drew the 'stone' bucket, which a map's regional kit lays as its masonry — the kolkhoz's red
  // brick, the Hessian red Buntsandstein — so a pillbox by the village read as a red brick hut with red berms. It draws
  // its own palette (concrete, earth berms, sandbags) on the vertex-colour material on every map; same kit and footprint)
  bunker:      { cls: 'break',  mat: 'baked', contact: 'ob',   r: 3.9,  h: 2.45, hw: 2.98, hl: 2.68, build: bBunker, broken: bBunkerBroken, collider: true, keep: 0.0, crushMin: 999 },
  roadsign:    { cls: 'topple', mat: 'baked', contact: 'ob',   r: 0.48, h: 2.85, shape: 'circle', collisionR: 0.20, groundR: 0.22, build: bRoadsign, broken: null, keep: 0.96 },
  cone:        { cls: 'physics', mat: 'baked', contact: 'loop', r: 0.32, h: 0.8,  build: bCone,       broken: null, bodyR: 0.27, mass: 0.34, bounce: 0.20, friction: 3.8, angularDrag: 2.4, groundConstrained: true },
  transformer: { cls: 'break',  mat: 'baked', contact: 'ob',   r: 0.9,  h: 1.85, hw: 0.76, hl: 0.51, build: bTransformer, broken: bTransformerBroken, collider: true, keep: 0.86, crushMin: 2.2 },
  cablespool:  { cls: 'break',  mat: 'baked', contact: 'ob',   r: 0.9,  h: 1.5,  hw: 0.66, hl: 0.76, build: bCableSpool, broken: bCableSpoolBroken, keep: 0.9 },
} satisfies Record<string, DestructiblePropType>;

/**
 * The period's 'bale' (b22): the haycock (haystackKit buildHaycock) on the round bale's record, contact and burst heap.
 * props.ts swaps it in on every map but the modern ones (haystackKit ROUND_BALE_MAPS). The round bale's build draws
 * nothing from the stream, nor does the haycock's. Its colliders are refit from a convex stand-in, as the round bale's
 * were from its convex cylinder (one outline, not the dome's ear-clipped dozens).
 */
export const HAYCOCK_BALE: DestructiblePropType = {
  ...DESTRUCTIBLE_TYPES.bale, build: () => buildHaycock(), contactProxy: () => buildHaycockContactProxy(),
};

/**
 * (b39; the audit's "2-3 plain box chunks") The coursed module breached, in its own courses: each course's blocks gone
 * across a gap round the breach that widens course by course (a broken masonry edge steps along its courses), the bottom
 * course nearly whole; the capstones left only where the course under them stands; the fallen blocks and caps lying on
 * both faces below the breach, tilted as they landed.
 */
function bWallStoneCoursedBroken(rng: Rng): THREE.BufferGeometry {
  const o = spentDraws(wallStoneBrokenDraws, rng, 0xc0a5);
  const parts: THREE.BufferGeometry[] = [];
  const courses = [0.42, 0.38, 0.30], thick = 0.46, L = WALL_SEG;
  const breach = (o() - 0.5) * 0.4 * L, width = (0.42 + o() * 0.2) * L;
  let y = 0, fallen = 0, topLo = 0, topHi = 0;
  for (let c = 0; c < courses.length; c++) {
    const ch = courses[c], share = c === 0 ? 0.18 : c === 1 ? 0.72 : 1;
    const lo = breach - (width / 2) * share * (0.85 + o() * 0.3), hi = breach + (width / 2) * share * (0.85 + o() * 0.3);
    if (c === courses.length - 1) { topLo = lo; topHi = hi; }
    for (let z = -L / 2; z < L / 2 - 0.04;) {
      const bl = Math.min(L / 2 - z, 0.36 + o() * 0.3), zc = z + bl / 2;
      if (zc < lo || zc > hi) {
        const blk = box(thick + (o() - 0.5) * 0.03, ch - 0.015, bl - 0.012, 0.7);
        // the blocks at the gap's edge loosened: tilted and pushed a little out of the face
        const edge = Math.min(Math.abs(zc - lo), Math.abs(zc - hi)) < 0.45;
        blk.rotateX((o() - 0.5) * (edge ? 0.12 : 0.03)); blk.rotateZ((o() - 0.5) * (edge ? 0.1 : 0.03));
        parts.push(blk.translate((o() - 0.5) * (edge ? 0.1 : 0.03), y + ch / 2, zc));
      } else fallen++;
      z += bl;
    }
    y += ch - 0.015;
  }
  // the capstones that still have a course under them; the rest fall with the blocks
  for (let k = 0; k < 4; k++) {
    const zc = -L / 2 + (k + 0.5) * (L / 4);
    if (zc > topLo - L / 8 && zc < topHi + L / 8) { fallen++; continue; }
    const cap = box(0.56, 0.11, L * 0.26, 0.9);
    cap.rotateX((o() - 0.5) * 0.08); cap.rotateZ((o() - 0.5) * 0.06);
    parts.push(cap.translate((o() - 0.5) * 0.04, y + 0.04, zc));
  }
  // the fallen: on both faces below the breach, a block for most of those gone, a cap or two among them
  const lying = Math.max(5, Math.round(fallen * 0.7));
  for (let k = 0; k < lying; k++) {
    const side = o() < 0.5 ? -1 : 1, cap = k < 2;
    const piece = cap ? box(0.56, 0.11, L * 0.26, 0.9) : box(thick * (0.85 + o() * 0.2), 0.3 + o() * 0.1, 0.36 + o() * 0.3, 0.7);
    piece.rotateY((o() - 0.5) * 1.2 + (cap ? Math.PI / 2 : 0)); piece.rotateX((o() - 0.5) * 0.6); piece.rotateZ((o() - 0.5) * 0.5);
    parts.push(piece.translate(side * (0.45 + o() * 1.0), cap ? 0.06 : 0.14, breach + (o() - 0.5) * width * 1.1));
  }
  return merge(parts);
}

/** The coursed wall module the brick-print maps keep (see bWallStone): the stone wall's record with its original
 * courses, and (b39) its breach in those courses. */
export const COURSED_WALLSTONE = {
  ...DESTRUCTIBLE_TYPES.wallstone, build: wallStoneEnvelope, broken: bWallStoneCoursedBroken,
} satisfies DestructiblePropType;
