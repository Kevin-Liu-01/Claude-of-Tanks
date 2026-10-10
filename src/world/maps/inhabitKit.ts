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
import { CIVILIAN_VEHICLE_RECEIPTS, civilianVehicleOverrides } from './civilianVehicleKit.ts';
import { CART_RECEIPTS, cartOverrides } from './cartKit.ts';
import type { RunnerTrack } from './cartBodies.ts';
import type { StructureCollisionRuntimeBand } from '../structureCollision.ts';
import { setNightEmissionMask } from '../../engine/nightEmissionMaterial.ts';
import { FIELD_STONE_FACE_V, FIELD_STONE_HEARTING_V } from '../fieldStoneSurface.ts';
// (b15: the straw props wear the hay print's bands: hayPrint.ts; the stook is a teepee of bound sheaves: haystackKit.ts)
import { HAY_FACE_V, HAY_PACKED_V } from '../hayPrint.ts';
import { buildStook, mapToBand } from './haystackKit.ts';

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
  /** The map-vehicles lane (2026-10-06): a cart's body plan (cartKit.ts CartFootprint hull), local, flat [x, z, ...]. */
  bodyHull?: readonly number[];
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
  /** A frozen contact band the pool refit uses in place of the built geometry's (the rebuilt vehicles keep their legacy
   * collision exactly: civilianVehicleLegacy.ts). */
  contactBand?: StructureCollisionRuntimeBand;
  /** Each instance's own colour (a vehicle's livery through the material's paint mask), by its place and slot. */
  instancePaint?: (out: THREE.Color, x: number, z: number, slot: number) => void;
  /** A lighter stand-in that casts the pool's shadows in place of its full geometry (no stream draws). */
  shadowBuild?: () => THREE.BufferGeometry;
  /** The family's cascaded shadow, over the size rule (destructibleRenderPolicy.ts destructibleCastsShadow). */
  castShadow?: boolean;
  /** Round 3 (cartKit.ts): a sled's runner tracks on a snowbound map, in the placed copy's frame; the props press them
   * into the ground (vehicleContactShadow.ts buildRunnerTracks). */
  runners?: RunnerTrack;
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

// ---------------------------------------------------------------------------
// shared sub-assemblies
// ---------------------------------------------------------------------------

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
function bPalletBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const half = box(0.55, 0.08, 1.0);
  half.rotateY(0.3); half.rotateZ(0.14);
  parts.push(half.translate(-0.25, 0.07, 0));
  parts.push(...plankScatter(4, 0.6, 0.14, 0.6, rng));
  return merge(parts);
}

function bBale(_rng: Rng): THREE.BufferGeometry { // straw-textured round bale
  const b = new THREE.CylinderGeometry(0.72, 0.72, 1.45, 12, 1);
  mapToBand(scaleUV(b, 2, 1), HAY_PACKED_V);
  b.rotateZ(Math.PI / 2);
  return merge([b.translate(0, 0.70, 0)]);
}
function bBaleBroken(rng: Rng): THREE.BufferGeometry { // burst low hay heap
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
function bTroughBroken(rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const bed = box(0.55, 0.08, 1.8);
  bed.rotateY(0.2); bed.rotateZ(0.08);
  parts.push(bed.translate(0, 0.07, 0));
  parts.push(...plankScatter(4, 0.9, 0.16, 0.8, rng));
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
function bStallBroken(rng: Rng): THREE.BufferGeometry {
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
function bRugFrameBroken(rng: Rng): THREE.BufferGeometry {
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
function bLaundryBroken(rng: Rng): THREE.BufferGeometry {
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

function bHaystack(rng: Rng): THREE.BufferGeometry { // straw-textured slouched field stack (was merged geometry)
  const hr = 1.9, hh = 2.5;
  const stack = new THREE.ConeGeometry(hr, hh, 9, 2);
  const sp = stack.attributes.position;
  for (let k = 0; k < sp.count; k++) {
    const rr2 = Math.hypot(sp.getX(k), sp.getZ(k));
    if (rr2 > 1e-4) {
      const f = 1 + (rng() - 0.5) * 0.24;
      sp.setX(k, sp.getX(k) * f); sp.setZ(k, sp.getZ(k) * f);
    }
  }
  stack.computeVertexNormals();
  mapToBand(scaleUV(stack, 3, 1.5), HAY_FACE_V);
  return merge([stack.translate(0, hh / 2 - 0.12, 0)]);
}
function bHaystackBroken(rng: Rng): THREE.BufferGeometry { // driven-through stack: low split mound
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
function bFencePicketBroken(rng: Rng): THREE.BufferGeometry {
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
function bFenceWattleBroken(_rng: Rng): THREE.BufferGeometry {
  const parts = [];
  const mat = box(0.06, 0.8, FENCE_SEG * 0.85); // collapsed woven mat
  mat.rotateZ(Math.PI / 2 - 0.1);
  parts.push(mat.translate(0.15, 0.07, 0));
  const stub = box(0.09, 0.3, 0.09);
  parts.push(stub.translate(0, 0.13, -FENCE_SEG / 2));
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
function bGateBroken(_rng: Rng): THREE.BufferGeometry {
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

/**
 * The scenery lane (wave 16, "a miniature castle battlement"): where a dry-stone run ends or opens, a rubble wall head —
 * the wall's own stones racked up square, a little broader than the wall and about its height, the top stones laid
 * across it unevenly; no post, no cap slab. World-free: centred on its foot, its own stream (the seed names the place).
 */
export function buildDryStoneWallHead(seed: number, thick: number, height: number): THREE.BufferGeometry {
  const r = dryStoneRng(seed), parts: THREE.BufferGeometry[] = [];
  const w = thick + 0.1 + r() * 0.06, top = height * (0.92 + r() * 0.12);
  let y = 0;
  while (y < top - 0.08) {
    const h = Math.min(top - y, 0.12 + r() * 0.12);
    // each lift two or three stones across, alternating, so the head is bonded like a quoin
    const n = r() < 0.5 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const len = w / n * (0.9 + r() * 0.15), stone = roughStone(len, h * 0.96, w * (0.9 + r() * 0.12), r, [0, 1, 2, 4, 5], 0.22);
      stone.rotateY((r() - 0.5) * 0.12); stone.rotateZ((r() - 0.5) * 0.08);
      parts.push(stone.translate(-w / 2 + (k + 0.5) * (w / n) + (r() - 0.5) * 0.03, y + h / 2, (r() - 0.5) * 0.04));
    }
    y += h;
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
function bWallAdobeBroken(rng: Rng): THREE.BufferGeometry {
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
function bTentBroken(rng: Rng): THREE.BufferGeometry {
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
function bTransformerBroken(rng: Rng): THREE.BufferGeometry {
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
/** The vehicle roles' record fields (class, material, contact, radius, height, collider, crush rules); a role's
 * footprint, contact band and builders come from its fleet (civilianVehicleKit.ts). */
const VEHICLE_RECORD_FIELDS = {
  truck: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 3.55, h: 2.3, collider: true, keep: 0.88, crushMin: 2.0 },
  jeep: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 2.10, h: 1.73, keep: 0.94 },
  sedan: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 2.35, h: 1.61, keep: 0.95 },
  wagon: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 2.35, h: 1.69, keep: 0.95 },
  pickup: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 2.72, h: 1.77, keep: 0.93 },
  van: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 2.63, h: 2.08, collider: true, keep: 0.92, crushMin: 1.8 },
  truckbox: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 3.55, h: 2.47, collider: true, keep: 0.87, crushMin: 2.0 },
  truckflatbed: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 3.55, h: 1.96, collider: true, keep: 0.87, crushMin: 2.0 },
} satisfies Record<string, Omit<DestructiblePropType, 'build' | 'broken'>>;

/** The table's own vehicle entry: the default fleet's builders, and its footprint and contact band read on first use
 * (each map's props override every vehicle role with its own fleet: civilianVehicleTypes). */
function vehicleEntry(kind: keyof typeof VEHICLE_RECORD_FIELDS): DestructiblePropType {
  const receipt = CIVILIAN_VEHICLE_RECEIPTS[kind];
  const entry = { ...VEHICLE_RECORD_FIELDS[kind], build: receipt.build, broken: receipt.broken } as DestructiblePropType;
  return Object.defineProperties(entry, {
    hw: { enumerable: true, get: () => receipt.footprint().hw },
    hl: { enumerable: true, get: () => receipt.footprint().hl },
    contactBand: { enumerable: true, get: () => receipt.footprint().contactBand },
  });
}

/** The cart roles' record fields (the map-vehicles lane, P3): the legacy records' class, contact, radius and height; a
 * role's footprint, contact band and builders come from the map's carts (cartKit.ts). */
const CART_RECORD_FIELDS = {
  haycart: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 1.55, h: 2.1 },
  handcart: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 0.85, h: 1.1 },
  sled: { cls: 'break', mat: 'vehicle', contact: 'ob', r: 0.75, h: 0.5 },
} satisfies Record<string, Omit<DestructiblePropType, 'build' | 'broken'>>;

/** The table's own cart entry: the default set's builders, its footprint and contact band read on first use. */
function cartEntry(kind: keyof typeof CART_RECORD_FIELDS): DestructiblePropType {
  const receipt = CART_RECEIPTS[kind];
  const entry = { ...CART_RECORD_FIELDS[kind], build: receipt.build, broken: receipt.broken } as DestructiblePropType;
  return Object.defineProperties(entry, {
    hw: { enumerable: true, get: () => receipt.footprint().hw },
    hl: { enumerable: true, get: () => receipt.footprint().hl },
    contactBand: { enumerable: true, get: () => receipt.footprint().contactBand },
    bodyHull: { enumerable: true, get: () => receipt.footprint().hull },
  });
}

export const DESTRUCTIBLE_TYPES = {
  barrel:      { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.40, h: 1.0,  build: bBarrel,      broken: bBarrelBroken },
  crate:       { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.62, h: 1.1,  hw: 0.51, hl: 0.51, build: bCrate, broken: bCrateBroken },
  pallet:      { cls: 'break',  mat: 'wood',  contact: 'loop', r: 0.62, h: 0.2,  build: bPallet,      broken: bPalletBroken },
  bale:        { cls: 'break',  mat: 'straw', contact: 'ob',   r: 0.78, h: 1.45, shape: 'circle', collisionR: 0.75, build: bBale, broken: bBaleBroken },
  stook:       { cls: 'break',  mat: 'straw', contact: 'ob',   r: 0.55, h: 1.3,  shape: 'circle', collisionR: 0.48, build: bStook, broken: bStookBroken },
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
  sled: cartEntry('sled'),
  pot:         { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.55, h: 0.75, build: bPot,         broken: bPotBroken },
  rugframe:    { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.15, h: 2.2,  hw: 1.2, hl: 0.12, build: bRugFrame, broken: bRugFrameBroken },
  laundry:     { cls: 'break',  mat: 'baked', contact: 'loop', r: 1.75, h: 1.95, build: bLaundry,     broken: bLaundryBroken },
  haycart: cartEntry('haycart'),
  handcart: cartEntry('handcart'),
  haystack:    { cls: 'break',  mat: 'straw', contact: 'ob',   r: 1.75, h: 2.5,  shape: 'circle', collisionR: 1.75, build: bHaystack, broken: bHaystackBroken },
  fenceplank:  { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.25, h: 1.1,  hw: 0.10, hl: 1.25, build: bFencePlank,  broken: bFencePlankBroken, fence: true },
  fencepicket: { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.25, h: 1.0,  hw: 0.10, hl: 1.25, build: bFencePicket, broken: bFencePicketBroken, fence: true },
  fencewattle: { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.25, h: 1.0,  hw: 0.10, hl: 1.25, build: bFenceWattle, broken: bFenceWattleBroken, fence: true },
  fencerail:   { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.25, h: 1.05, hw: 0.11, hl: 1.25, build: bFenceRail,   broken: bFenceRailBroken, fence: true },
  gate:        { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.0,  h: 1.3,  hw: 0.46, hl: 0.97, build: bGate,        broken: bGateBroken },
  // --- DESTRUCTIBLES r1: heavier light cover + soft vehicles ---------------
  wallstone:   { cls: 'break',  mat: 'stone',   contact: 'ob', r: 1.6,  h: 1.15, hw: 0.30, hl: 1.54, build: bWallStone,  broken: bWallStoneBroken, wall: true, collider: true, keep: 0.82, crushMin: 2.2 },
  walladobe:   { cls: 'break',  mat: 'plaster', contact: 'ob', r: 1.6,  h: 1.2,  hw: 0.28, hl: 1.53, build: bWallAdobe,  broken: bWallAdobeBroken, wall: true, collider: true, keep: 0.86, crushMin: 2.0 },
  truck: vehicleEntry('truck'),
  jeep: vehicleEntry('jeep'),
  sedan: vehicleEntry('sedan'),
  wagon: vehicleEntry('wagon'),
  pickup: vehicleEntry('pickup'),
  van: vehicleEntry('van'),
  truckbox: vehicleEntry('truckbox'),
  truckflatbed: vehicleEntry('truckflatbed'),
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
 * One map's civilian vehicles and carts (the map-vehicles lane, 2026-10-05/06): every vehicle role's entry with the
 * map's fleet builders, liveries, footprint and contact band, and every cart role's with the map's carts (cartKit.ts),
 * over the table's record (class, contact, radius, height), for props.ts's local types. A cart's footprint and band are
 * read on first use (a map builds only the roles it places).
 */
export function civilianVehicleTypes(mapId: string, mobile: boolean): Record<string, DestructiblePropType> {
  const out: Record<string, DestructiblePropType> = {};
  for (const [kind, override] of Object.entries(civilianVehicleOverrides(mapId, mobile))) {
    out[kind] = { ...VEHICLE_RECORD_FIELDS[kind as keyof typeof VEHICLE_RECORD_FIELDS], ...override };
  }
  for (const [kind, override] of Object.entries(cartOverrides(mapId, mobile))) {
    const entry = { ...CART_RECORD_FIELDS[kind as keyof typeof CART_RECORD_FIELDS], build: override.build, broken: override.broken,
      instancePaint: override.instancePaint, ...(override.shadowBuild ? { shadowBuild: override.shadowBuild } : {}),
      // round 3 (wave 234: the airfield's cylinder cart "hovers"): every cart casts the sun's shadow on desktop through
      // its coarse stand-in (one instanced draw a cascade), the handcart and the sled under the size rule's 1.15 m too
      ...(override.shadowBuild ? { castShadow: true } : {}),
      ...(override.runners ? { runners: override.runners } : {}) } as DestructiblePropType;
    out[kind] = Object.defineProperties(entry, {
      hw: { enumerable: true, get: () => override.hw },
      hl: { enumerable: true, get: () => override.hl },
      contactBand: { enumerable: true, get: () => override.contactBand },
      bodyHull: { enumerable: true, get: () => override.bodyHull },
    });
  }
  return out;
}

/** The coursed wall module the brick-print maps keep (see bWallStone): the stone wall's record with its original
 * courses and remnant. */
export const COURSED_WALLSTONE = {
  ...DESTRUCTIBLE_TYPES.wallstone, build: wallStoneEnvelope, broken: wallStoneBrokenDraws,
} satisfies DestructiblePropType;
