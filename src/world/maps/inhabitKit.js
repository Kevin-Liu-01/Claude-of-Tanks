// src/world/maps/inhabitKit.js — world-dressing r1: the INHABITING-OBJECT kit.
// Small themed props (carts, barrels, crates, bales, stooks, troughs, market
// stalls, benches, churns, laundry lines, pottery, oil drums, sleds, firewood,
// street lamps) plus the wooden FENCE segment kit — every type built twice:
// an INTACT geometry and a flattened BROKEN debris variant, both centered on
// XZ with base at y=0, so props.js can run them as per-type InstancedMesh
// pools with per-instance swap-out on destruction (see props.js destructible
// layer + src/world/destructibles.js seam).
//
// Material contract (props.js): mat 'wood'/'straw' types carry UVs and ride
// the map-toned textured materials; mat 'baked' types carry vertex colors and
// ride the shared matte vertex-color material (grime/snow-cap shader hooks
// apply to all of them, so winter gets snow-covered variants for free).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FENCE_SEG = 2.4; // fence-kit module pitch, meters

const _c = new THREE.Color();

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function box(w, h, d, uvScale = 0.7) {
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleUV(g, Math.max(w, d) * uvScale, h * uvScale);
}

function cyl(r0, r1, h, seg = 7) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1);
  return scaleUV(g, 1, 1);
}

/** Author in HSL (sRGB) like the rest of the world code; store linear. */
function paint(geo, h, s, l, jit, rng) {
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
const WOOD = [0.075, 0.38, 0.30];
const WOOD_PALE = [0.085, 0.30, 0.42];
const WHITEWASH = [0.10, 0.10, 0.68];
// sun-bleached working canvas — saturated fabric read as toy plastic in the
// first closeup pass, so awnings/rugs sit in a weathered dyed-cloth band
const CANVAS = [0.096, 0.26, 0.55];
const CANVAS2 = [0.025, 0.34, 0.38];
const HAY = [0.105, 0.55, 0.46];
const TERRA = [0.045, 0.52, 0.38];
const STEEL = [0.58, 0.04, 0.24];
const GALV = [0.56, 0.03, 0.46];
const RUST = [0.05, 0.55, 0.22];
const LINEN = [0.11, 0.12, 0.64];
const IRON = [0.60, 0.05, 0.13];

function P(geo, pal, jit, rng) { return paint(geo, pal[0], pal[1], pal[2], jit, rng); }

function merge(parts) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// ---------------------------------------------------------------------------
// shared sub-assemblies
// ---------------------------------------------------------------------------

/** spoked cart wheel (baked): rim ring + hub + 4 spoke boxes, axis +z */
function cartWheel(r, rng) {
  const parts = [];
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
function plankScatter(n, len, wid, rad, rng, pal = null) {
  const parts = [];
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

function bBarrel(rng) {
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
function bBarrelBroken(rng) {
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

function bCrate(rng) { // wood-textured
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
function bCrateBroken(rng) {
  const parts = plankScatter(7, 0.95, 0.20, 0.7, rng);
  const panel = box(0.9, 0.05, 0.9); // one side panel resting on the pile
  panel.rotateY(rng());
  panel.rotateX(0.24);
  parts.push(panel.translate(0.1, 0.16, -0.1));
  return merge(parts);
}

function bPallet(rng) { // wood-textured
  const parts = [];
  for (const bz of [-0.44, 0, 0.44]) parts.push(box(1.15, 0.09, 0.10).translate(0, 0.07, bz));
  for (let k = 0; k < 5; k++) parts.push(box(0.16, 0.035, 1.05).translate(-0.46 + k * 0.23, 0.14, 0));
  return merge(parts);
}
function bPalletBroken(rng) {
  const parts = [];
  const half = box(0.55, 0.08, 1.0);
  half.rotateY(0.3); half.rotateZ(0.14);
  parts.push(half.translate(-0.25, 0.07, 0));
  parts.push(...plankScatter(4, 0.6, 0.14, 0.6, rng));
  return merge(parts);
}

function bBale(rng) { // straw-textured round bale
  const b = new THREE.CylinderGeometry(0.72, 0.72, 1.45, 12, 1);
  scaleUV(b, 2, 1);
  b.rotateZ(Math.PI / 2);
  return merge([b.translate(0, 0.70, 0)]);
}
function bBaleBroken(rng) { // burst low hay heap
  const heap = new THREE.CylinderGeometry(1.0, 1.25, 0.42, 10, 1);
  scaleUV(heap, 2.5, 0.5);
  const p = heap.attributes.position;
  for (let i = 0; i < p.count; i++) { // slump the profile
    const f = 1 + (rng() - 0.5) * 0.3;
    p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f);
  }
  heap.computeVertexNormals();
  const parts = [heap.translate(0, 0.20, 0)];
  for (let k = 0; k < 3; k++) { // thrown wads
    const wad = new THREE.CylinderGeometry(0.22, 0.30, 0.18, 7, 1);
    scaleUV(wad, 1, 1);
    const a = rng() * Math.PI * 2;
    parts.push(wad.translate(Math.cos(a) * (0.9 + rng() * 0.6), 0.08, Math.sin(a) * (0.9 + rng() * 0.6)));
  }
  return merge(parts);
}

function bStook(rng) { // straw-textured harvest sheaf teepee
  const parts = [];
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.3;
    const sh = new THREE.CylinderGeometry(0.055, 0.16, 1.25, 6, 1);
    scaleUV(sh, 1, 1);
    sh.rotateX(0.34);
    sh.rotateY(a);
    sh.translate(Math.cos(a) * 0.22, 0.60, Math.sin(a) * 0.22);
    parts.push(sh);
  }
  const band = new THREE.CylinderGeometry(0.20, 0.20, 0.09, 8, 1, true);
  scaleUV(band, 1, 1);
  parts.push(band.translate(0, 0.86, 0));
  return merge(parts);
}
function bStookBroken(rng) {
  const parts = [];
  for (let k = 0; k < 5; k++) { // sheaves knocked flat, radial
    const a = rng() * Math.PI * 2;
    const sh = new THREE.CylinderGeometry(0.06, 0.15, 1.2, 6, 1);
    scaleUV(sh, 1, 1);
    sh.rotateZ(Math.PI / 2 - 0.06);
    sh.rotateY(a);
    sh.translate(Math.cos(a) * 0.5, 0.10, Math.sin(a) * 0.5);
    parts.push(sh);
  }
  return merge(parts);
}

function bFirewood(rng) { // wood-textured stacked split logs
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
function bFirewoodBroken(rng) {
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

function bTrough(rng) { // wood-textured water trough on cross legs
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
function bTroughBroken(rng) {
  const parts = [];
  const bed = box(0.55, 0.08, 1.8);
  bed.rotateY(0.2); bed.rotateZ(0.08);
  parts.push(bed.translate(0, 0.07, 0));
  parts.push(...plankScatter(4, 0.9, 0.16, 0.8, rng));
  return merge(parts);
}

function bStall(rng) { // baked: market stall — counter, posts, striped awning
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
function bStallBroken(rng) {
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

function bBench(rng) { // wood-textured
  const parts = [];
  parts.push(box(1.7, 0.07, 0.42).translate(0, 0.48, 0));
  parts.push(box(1.7, 0.34, 0.06).translate(0, 0.82, -0.20));
  for (const s of [-1, 1]) {
    parts.push(box(0.08, 0.48, 0.40).translate(s * 0.72, 0.24, 0));
  }
  return merge(parts);
}
function bBenchBroken(rng) {
  const parts = [];
  const seat = box(1.6, 0.06, 0.4);
  seat.rotateZ(0.15); seat.rotateY(0.2);
  parts.push(seat.translate(0, 0.12, 0));
  parts.push(...plankScatter(3, 0.7, 0.14, 0.6, rng));
  return merge(parts);
}

function bChurn(rng) { // baked: galvanized milk churn
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
// in props.js. Each mesh is still authored base-at-y=0 and centered on XZ so
// its visual tumble can rotate around the real mid-height.
function bTrashcan(rng) {
  const parts = [];
  parts.push(P(cyl(0.27, 0.31, 0.72, 11).translate(0, 0.36, 0), GALV, 0.10, rng));
  parts.push(P(cyl(0.34, 0.34, 0.055, 11).translate(0, 0.755, 0), STEEL, 0.07, rng));
  parts.push(P(cyl(0.08, 0.10, 0.08, 8).translate(0, 0.825, 0), IRON, 0.05, rng));
  for (const s of [-1, 1]) {
    parts.push(P(box(0.07, 0.18, 0.07).translate(s * 0.32, 0.52, 0), STEEL, 0.07, rng));
  }
  return merge(parts);
}

function bGasBottle(rng) {
  const parts = [];
  const BLUEGREY = [0.56, 0.16, 0.34];
  parts.push(P(cyl(0.17, 0.18, 0.62, 10).translate(0, 0.34, 0), BLUEGREY, 0.10, rng));
  parts.push(P(cyl(0.105, 0.17, 0.16, 10).translate(0, 0.73, 0), BLUEGREY, 0.08, rng));
  parts.push(P(cyl(0.075, 0.09, 0.12, 8).translate(0, 0.87, 0), STEEL, 0.06, rng));
  parts.push(P(box(0.17, 0.055, 0.065).translate(0.07, 0.95, 0), IRON, 0.05, rng));
  parts.push(P(cyl(0.19, 0.19, 0.055, 10).translate(0, 0.035, 0), IRON, 0.06, rng));
  return merge(parts);
}

function bBucket(rng) {
  const parts = [];
  parts.push(P(cyl(0.23, 0.17, 0.36, 10).translate(0, 0.18, 0), GALV, 0.11, rng));
  parts.push(P(new THREE.TorusGeometry(0.23, 0.018, 5, 12)
    .rotateX(Math.PI / 2).translate(0, 0.37, 0), STEEL, 0.06, rng));
  const handle = new THREE.TorusGeometry(0.25, 0.014, 5, 12, Math.PI);
  handle.rotateZ(Math.PI / 2);
  parts.push(P(handle.translate(0, 0.34, 0), IRON, 0.05, rng));
  return merge(parts);
}

function bJerryCan(rng) {
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

function bLooseWheel(rng) {
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

function bLamp(rng) { // baked: cast-iron street lamp (topple class)
  const parts = [];
  const H = 4.5;
  const pole = new THREE.CylinderGeometry(0.05, 0.09, H, 6, 1);
  parts.push(P(pole.translate(0, H / 2, 0), IRON, 0.05, rng));
  const collar = new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6, 1);
  parts.push(P(collar.translate(0, 0.25, 0), IRON, 0.05, rng));
  const arm = new THREE.CylinderGeometry(0.035, 0.045, 1.2, 5, 1);
  arm.rotateZ(Math.PI / 2 - 0.5);
  parts.push(P(arm.translate(0.5, H - 0.2, 0), IRON, 0.05, rng));
  const head = new THREE.CylinderGeometry(0.16, 0.24, 0.34, 6, 1);
  parts.push(P(head.translate(1.0, H - 0.05, 0), IRON, 0.05, rng));
  const cap = new THREE.ConeGeometry(0.20, 0.16, 6, 1);
  parts.push(P(cap.translate(1.0, H + 0.20, 0), IRON, 0.05, rng));
  return merge(parts);
}

function bDrum(rng) { // baked: 200 L oil drum, rust-blotched (topple class)
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

function bSled(rng) { // wood-textured winter sled
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
function bSledBroken(rng) {
  const parts = [];
  const half = box(0.5, 0.06, 1.6);
  half.rotateY(0.4); half.rotateZ(0.12);
  parts.push(half.translate(-0.2, 0.08, 0));
  parts.push(...plankScatter(4, 0.6, 0.13, 0.7, rng));
  return merge(parts);
}

function bPot(rng) { // baked: terracotta jar cluster (2 big + 1 small)
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
function bPotBroken(rng) {
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

function bRugFrame(rng) { // baked: souk rug display frame with two hung rugs
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(P(box(0.09, 2.1, 0.09).translate(s * 1.1, 1.05, 0), WOOD, 0.10, rng));
  }
  parts.push(P(box(2.35, 0.08, 0.08).translate(0, 2.05, 0), WOOD, 0.10, rng));
  // vegetable-dye tones with heavy per-vertex variegation — pure saturated
  // panels read as painted plastic sheets in the first closeup pass
  const rugPals = [[[0.03, 0.36, 0.26], [0.075, 0.30, 0.42]], [[0.60, 0.18, 0.24], [0.09, 0.28, 0.46]]];
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
function bRugFrameBroken(rng) {
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

function bLaundry(rng) { // baked: two posts, line, three hung sheets
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(P(box(0.08, 1.85, 0.08).translate(s * 1.7, 0.92, 0), WOOD, 0.10, rng));
  }
  parts.push(P(box(3.4, 0.025, 0.025).translate(0, 1.80, 0), IRON, 0.04, rng));
  const tones = [LINEN, [0.55, 0.12, 0.52], [0.09, 0.18, 0.56]];
  for (let k = 0; k < 3; k++) {
    const sheet = box(0.78, 0.9 + rng() * 0.25, 0.035);
    sheet.rotateY((rng() - 0.5) * 0.14);
    parts.push(P(sheet.translate(-1.0 + k * 1.0, 1.34, 0), tones[k], 0.08, rng));
  }
  return merge(parts);
}
function bLaundryBroken(rng) {
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

function bHaycart(rng) { // baked: intact hay cart — bed, rails, 2 wheels, shafts, hay load
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
function bHaycartBroken(rng) {
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

function bHandcart(rng) { // wood-textured: small two-wheel hand cart, tipped back
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
function bHandcartBroken(rng) {
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

function bHaystack(rng) { // straw-textured slouched field stack (was merged geometry)
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
  scaleUV(stack, 3, 1.5);
  return merge([stack.translate(0, hh / 2 - 0.12, 0)]);
}
function bHaystackBroken(rng) { // driven-through stack: low split mound
  const parts = [];
  for (const [ox, oz, r] of [[-0.8, 0.2, 1.3], [0.9, -0.3, 1.1], [0.1, 0.9, 0.8]]) {
    const mound = new THREE.CylinderGeometry(r * 0.55, r, 0.62, 8, 1);
    scaleUV(mound, 2, 0.6);
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

function bFencePlank(rng) { // wood-textured: post + 3 rough horizontal planks
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
function bFencePlankBroken(rng) {
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

function bFencePicket(rng) { // baked: whitewashed picket module
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
function bFencePicketBroken(rng) {
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

function bFenceWattle(rng) { // wood-textured woven hurdle fence
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
function bFenceWattleBroken(rng) {
  const parts = [];
  const mat = box(0.06, 0.8, FENCE_SEG * 0.85); // collapsed woven mat
  mat.rotateZ(Math.PI / 2 - 0.1);
  parts.push(mat.translate(0.15, 0.07, 0));
  const stub = box(0.09, 0.3, 0.09);
  parts.push(stub.translate(0, 0.13, -FENCE_SEG / 2));
  return merge(parts);
}

function bFenceRail(rng) { // baked: stone posts + twin timber rails
  const parts = [];
  const post = box(0.16, 1.05, 0.16);
  parts.push(P(post.translate(0, 0.44, -FENCE_SEG / 2), [0.09, 0.10, 0.34], 0.10, rng));
  for (const rh of [0.42, 0.82]) {
    parts.push(P(box(0.07, 0.10, FENCE_SEG * 1.02).translate(0, rh, 0), WOOD, 0.12, rng));
  }
  return merge(parts);
}
function bFenceRailBroken(rng) {
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

function bGate(rng) { // wood-textured farm gate (hangs open ~30°)
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
function bGateBroken(rng) {
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
// collider/explosive) are consumed by props.js (see DESTRUCTIBLE_TYPES docs).
// ---------------------------------------------------------------------------

export const WALL_SEG = 3.0; // wall-kit module pitch, meters

// dark faded olive-drab / field-grey band — the first cut sat at l 0.22-0.30
// with s 0.24+ and the truck cabs tonemapped to toy lego-green in the frame
// review; military paint under this sun needs to start near-charcoal
const OLIVE = [0.19, 0.20, 0.185];
const OLIVE_D = [0.20, 0.22, 0.145];
const FIELDGREY = [0.58, 0.07, 0.28];
const TENTCANVAS = [0.10, 0.16, 0.295];
const TENTCANVAS_D = [0.095, 0.14, 0.225];
const CHAR = [0.07, 0.10, 0.055];
const CHAR_RUST = [0.05, 0.42, 0.16];
const REDDRUM = [0.015, 0.62, 0.34];
const GLASS_D = [0.58, 0.10, 0.16];
const TIRE = [0.60, 0.03, 0.075];

/** char-paint with rust bloom — burnt-hulk vertex palette (truck/jeep wrecks) */
function charPaint(geo, rng, rustBias = 0.2) {
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
// UV'd for the map-toned stone/plaster materials (props.js routes meta.mat).
// Irregular per-course offsets kill the one-box-per-6m silhouette the old
// merged runs had; the broken state is a low crumbled remnant + tumbled
// blocks — drive-over rubble that persists for the battle.

function wallCourses(rng, thick, courses) {
  const parts = [];
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

function bWallStone(rng) {
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
function bWallStoneBroken(rng) {
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

function bWallAdobe(rng) {
  const { parts, top } = wallCourses(rng, 0.52, [0.56, 0.46]);
  const cap = box(0.40, 0.15, WALL_SEG * 1.0, 0.9); // rounded mud cap read
  parts.push(cap.translate(0, top + 0.05, 0));
  return merge(parts);
}
function bWallAdobeBroken(rng) {
  const parts = [];
  const h = 0.24 + rng() * 0.2;
  const stub = box(0.52, h, WALL_SEG * 0.44, 0.7);
  stub.rotateX((rng() - 0.5) * 0.12);
  parts.push(stub.translate(0, h / 2, -WALL_SEG * 0.22));
  for (let k = 0; k < 5; k++) { // mud-brick clods
    const bs = 0.13 + rng() * 0.16;
    const blk = box(bs * 1.4, bs * 0.6, bs, 1.2);
    blk.rotateY(rng() * Math.PI);
    parts.push(blk.translate((rng() - 0.5) * 1.5, bs * 0.28, (rng() - 0.5) * WALL_SEG * 0.9));
  }
  return merge(parts);
}

// --- sandbag emplacement (broken state for the sourced baked intact) --------
// The intact geometry is the licensed baked model (props.js LOCAL kinds need
// bakedGeometry, so the kind entries live there); this is the shared
// driven-through state: bags burst, split and spilled.
export function bSandbagBroken(rng) {
  const parts = [];
  const HESS = [0.105, 0.22, 0.46];
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

// --- supply truck (era-neutral bonneted cargo truck) + burnt hulk -----------
function truckWheel(rng, r = 0.44, w = 0.26) {
  const t = new THREE.CylinderGeometry(r, r, w, 10, 1);
  t.rotateZ(Math.PI / 2);
  return P(t, TIRE, 0.05, rng);
}
function bTruck(rng) {
  const parts = [];
  const body = rng() < 0.5 ? OLIVE : OLIVE_D;
  // chassis + bonnet + cab
  parts.push(P(box(1.9, 0.28, 5.9).translate(0, 0.62, 0), [body[0], body[1] * 0.8, body[2] * 0.7], 0.08, rng));
  parts.push(P(box(1.44, 0.72, 1.5).translate(0, 1.12, 2.05), body, 0.17, rng));   // bonnet
  parts.push(P(box(0.24, 0.5, 1.3).translate(0, 1.5, 2.72), body, 0.08, rng));     // grille/rad
  parts.push(P(box(1.7, 1.06, 1.15).translate(0, 1.45, 1.06), body, 0.17, rng));   // cab
  parts.push(P(box(1.5, 0.5, 0.06).translate(0, 1.62, 1.64), GLASS_D, 0.05, rng)); // windshield
  parts.push(P(box(1.86, 0.10, 0.55).translate(0, 1.02, 2.9), body, 0.08, rng));   // front fenders
  // cargo bed with canvas tilt (or open bed with crates)
  parts.push(P(box(1.94, 0.32, 3.1).translate(0, 0.94, -1.35), [0.075, 0.30, 0.26], 0.12, rng));
  if (rng() < 0.62) {
    const tilt = new THREE.CylinderGeometry(0.98, 0.98, 3.0, 7, 1, false, Math.PI, Math.PI);
    tilt.rotateX(Math.PI / 2);
    tilt.scale(1, 0.72, 1);
    parts.push(P(tilt.translate(0, 1.14, -1.35), CANVAS, 0.09, rng));
    parts.push(P(box(1.9, 0.9, 0.06).translate(0, 1.4, -2.83), CANVAS2, 0.08, rng)); // rear flap
  } else {
    for (let k = 0; k < 3; k++) { // open load: crates + a drum
      parts.push(P(box(0.6, 0.5, 0.6).translate(-0.45 + k * 0.5, 1.35, -0.7 - k * 0.75), WOOD, 0.12, rng));
    }
    parts.push(P(cyl(0.26, 0.26, 0.8, 9).translate(0.55, 1.5, -2.3), STEEL, 0.08, rng));
  }
  // wheels: 2 front + 4 rear (dualies read as one wide drum)
  parts.push(truckWheel(rng).translate(-0.98, 0.44, 2.05));
  parts.push(truckWheel(rng).translate(0.98, 0.44, 2.05));
  parts.push(truckWheel(rng, 0.44, 0.4).translate(-0.95, 0.44, -1.0));
  parts.push(truckWheel(rng, 0.44, 0.4).translate(0.95, 0.44, -1.0));
  parts.push(truckWheel(rng, 0.44, 0.4).translate(-0.95, 0.44, -2.1));
  parts.push(truckWheel(rng, 0.44, 0.4).translate(0.95, 0.44, -2.1));
  return merge(parts);
}
function bTruckBroken(rng) {
  // burnt hulk: settled chassis, torched cab shell, bed ribs bare, tires gone
  const parts = [];
  parts.push(charPaint(box(1.9, 0.26, 5.7).translate(0, 0.34, 0), rng, 0.3));
  const cab = box(1.66, 0.78, 1.1);
  cab.rotateZ((rng() - 0.5) * 0.14);
  parts.push(charPaint(cab.translate(0.04, 0.94, 1.08), rng, 0.22));
  parts.push(charPaint(box(1.4, 0.5, 1.42).translate(0, 0.68, 2.05), rng, 0.3)); // burnt bonnet
  const block = box(0.7, 0.5, 0.9); // exposed engine block
  parts.push(charPaint(block.translate(0, 0.75, 2.1), rng, 0.45));
  for (const bz of [-0.5, -1.35, -2.2]) { // bare bed ribs
    parts.push(charPaint(box(1.9, 0.3, 0.09).translate(0, 0.62, bz), rng, 0.25));
  }
  const rim = (x, z, tip) => {
    const w = new THREE.CylinderGeometry(0.30, 0.30, 0.2, 8, 1);
    w.rotateZ(Math.PI / 2 + tip);
    return charPaint(w.translate(x, 0.30, z), rng, 0.5);
  };
  parts.push(rim(-0.98, 2.05, 0.3), rim(0.98, -1.0, -0.2), rim(0.95, -2.1, 0.1));
  const door = box(0.06, 0.7, 0.9); // blown-open door on the ground
  door.rotateY(rng());
  door.rotateX(Math.PI / 2 - 0.12);
  parts.push(charPaint(door.translate(1.5, 0.08, 0.9), rng, 0.3));
  return merge(parts);
}

// --- light utility 4x4 (open-top field car) ---------------------------------
function bJeep(rng) {
  const parts = [];
  const body = rng() < 0.5 ? OLIVE : FIELDGREY;
  parts.push(P(box(1.5, 0.5, 3.3).translate(0, 0.72, 0), body, 0.16, rng));        // tub
  parts.push(P(box(1.44, 0.34, 1.0).translate(0, 1.05, 1.25), body, 0.10, rng));   // bonnet
  parts.push(P(box(1.34, 0.44, 0.05).translate(0, 1.42, 0.72), GLASS_D, 0.05, rng)); // windshield
  parts.push(P(box(1.34, 0.06, 0.09).translate(0, 1.66, 0.72), body, 0.06, rng));
  for (const [sx, sz] of [[-0.5, -0.15], [0.5, -0.15]]) { // seat backs
    parts.push(P(box(0.55, 0.4, 0.08).translate(sx, 1.12, sz), CANVAS2, 0.08, rng));
  }
  parts.push(P(box(1.5, 0.09, 0.4).translate(0, 0.96, -1.6), body, 0.08, rng));    // rear shelf
  const spare = new THREE.CylinderGeometry(0.36, 0.36, 0.2, 9, 1);
  spare.rotateX(Math.PI / 2);
  parts.push(P(spare.translate(0, 1.0, -1.72), TIRE, 0.05, rng));
  parts.push(truckWheel(rng, 0.38, 0.22).translate(-0.78, 0.38, 1.1));
  parts.push(truckWheel(rng, 0.38, 0.22).translate(0.78, 0.38, 1.1));
  parts.push(truckWheel(rng, 0.38, 0.22).translate(-0.78, 0.38, -1.05));
  parts.push(truckWheel(rng, 0.38, 0.22).translate(0.78, 0.38, -1.05));
  return merge(parts);
}
function bJeepBroken(rng) {
  const parts = [];
  const tub = box(1.5, 0.42, 3.2); // burnt tub settled on rims, nose skewed
  tub.rotateY(0.12);
  tub.rotateZ(0.06);
  parts.push(charPaint(tub.translate(0, 0.42, 0), rng, 0.25));
  parts.push(charPaint(box(1.4, 0.3, 0.95).rotateY(0.12).translate(0.1, 0.62, 1.22), rng, 0.3));
  const frame = box(1.3, 0.05, 0.07); // windshield frame folded flat
  frame.rotateY(0.12);
  parts.push(charPaint(frame.translate(0, 0.68, 0.68), rng, 0.2));
  const rim = (x, z) => {
    const w = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 8, 1);
    w.rotateZ(Math.PI / 2);
    return charPaint(w.translate(x, 0.26, z), rng, 0.5);
  };
  parts.push(rim(-0.78, 1.1), rim(0.78, 1.1), rim(-0.78, -1.05));
  return merge(parts);
}

// --- ammunition boxes (stacked pair + strewn broken state) ------------------
function bAmmobox(rng) {
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
function bAmmoboxBroken(rng) {
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
function bTent(rng) {
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
function bTentBroken(rng) {
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
function bBarrier(rng) {
  const parts = [];
  const CONC = [0.08, 0.06, 0.43];
  const base = box(0.72, 0.42, 2.7);
  parts.push(P(base.translate(0, 0.21, 0), CONC, 0.10, rng));
  const top = box(0.34, 0.58, 2.52);
  parts.push(P(top.translate(0, 0.68, 0), [0.08, 0.05, 0.5], 0.13, rng));
  for (const z of [-0.92, 0.92]) {
    parts.push(P(box(0.78, 0.12, 0.22).translate(0, 0.06, z), CONC, 0.08, rng));
  }
  return merge(parts);
}
function bBarrierBroken(rng) {
  const parts = [];
  const CONC = [0.08, 0.05, 0.38];
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

function bRoadsign(rng) {
  const parts = [];
  const post = box(0.11, 2.8, 0.11);
  parts.push(P(post.translate(0, 1.4, 0), STEEL, 0.08, rng));
  const sign = box(1.18, 0.78, 0.07);
  parts.push(P(sign.translate(0, 2.45, 0), [0.58, 0.56, 0.12], 0.08, rng));
  const inset = box(0.92, 0.52, 0.025);
  parts.push(P(inset.translate(0, 2.45, 0.052), [0.02, 0.12, 0.48], 0.05, rng));
  return merge(parts);
}

function bCone(rng) {
  const parts = [];
  const ORANGE = [0.055, 0.84, 0.48];
  parts.push(P(box(0.5, 0.08, 0.5).translate(0, 0.04, 0), [0.03, 0.06, 0.18], 0.06, rng));
  const cone = new THREE.ConeGeometry(0.21, 0.68, 10, 1);
  parts.push(P(cone.translate(0, 0.42, 0), ORANGE, 0.08, rng));
  const band = new THREE.CylinderGeometry(0.17, 0.19, 0.1, 10, 1);
  parts.push(P(band.translate(0, 0.42, 0), [0.11, 0.04, 0.82], 0.03, rng));
  return merge(parts);
}

function bTransformer(rng) {
  const parts = [];
  const CAB = [0.31, 0.12, 0.29];
  parts.push(P(box(1.2, 1.5, 0.78).translate(0, 0.75, 0), CAB, 0.12, rng));
  parts.push(P(box(1.08, 0.06, 0.03).translate(0, 0.92, 0.405), STEEL, 0.05, rng));
  for (const x of [-0.36, 0, 0.36]) {
    const ins = new THREE.CylinderGeometry(0.08, 0.1, 0.34, 7, 1);
    parts.push(P(ins.translate(x, 1.68, 0), [0.32, 0.18, 0.32], 0.06, rng));
  }
  parts.push(P(box(1.45, 0.12, 0.95).translate(0, 0.06, 0), [0.08, 0.05, 0.4], 0.08, rng));
  return merge(parts);
}
function bTransformerBroken(rng) {
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

function bCableSpool(rng) {
  const parts = [];
  const axis = new THREE.CylinderGeometry(0.18, 0.18, 1.0, 10, 1);
  axis.rotateZ(Math.PI / 2);
  parts.push(P(axis.translate(0, 0.68, 0), STEEL, 0.08, rng));
  for (const x of [-0.55, 0.55]) {
    const cheek = new THREE.CylinderGeometry(0.74, 0.74, 0.12, 12, 1);
    cheek.rotateZ(Math.PI / 2);
    parts.push(P(cheek.translate(x, 0.68, 0), WOOD, 0.15, rng));
  }
  const cable = new THREE.CylinderGeometry(0.49, 0.49, 0.96, 12, 1);
  cable.rotateZ(Math.PI / 2);
  parts.push(P(cable.translate(0, 0.68, 0), [0.02, 0.05, 0.13], 0.06, rng));
  return merge(parts);
}
function bCableSpoolBroken(rng) {
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
function bDrumRed(rng) {
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
function bDrumRedBroken(rng) {
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
 *   | 'baked' (vertex color).
 * contact: 'ob' = crushable obstacle (state.js SAT seam — resists a crawl,
 *   breaks on real overrun, exactly the tree mechanism); 'loop' = cosmetic
 *   hull-radius crush via the world.crushables loop in main.js (no obstacle
 *   at all — sapling class); 'none' = shells only.
 * r/h: record radius / height (AABB + shell sweep bounds).
 * DESTRUCTIBLES r1 knobs (consumed by props.js):
 *   keep: per-overrun speed retention (ob.crushKeep — 0.97 sandbags barely
 *     bite, 0.82 stone wall scrubs hard; default state.js CRUSH_SPEED_KEEP);
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
  stook:       { cls: 'break',  mat: 'straw', contact: 'ob',   r: 0.55, h: 1.3,  shape: 'circle', collisionR: 0.48, build: bStook, broken: bStookBroken },
  firewood:    { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.85, h: 0.95, hw: 0.94, hl: 0.57, build: bFirewood, broken: bFirewoodBroken },
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
  haycart:     { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.55, h: 2.1,  hw: 1.10, hl: 2.30, build: bHaycart, broken: bHaycartBroken },
  handcart:    { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.85, h: 1.1,  hw: 0.63, hl: 1.50, build: bHandcart, broken: bHandcartBroken },
  haystack:    { cls: 'break',  mat: 'straw', contact: 'ob',   r: 1.75, h: 2.5,  shape: 'circle', collisionR: 1.75, build: bHaystack, broken: bHaystackBroken },
  fenceplank:  { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.25, h: 1.1,  build: bFencePlank,  broken: bFencePlankBroken, fence: true },
  fencepicket: { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.25, h: 1.0,  build: bFencePicket, broken: bFencePicketBroken, fence: true },
  fencewattle: { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.25, h: 1.0,  build: bFenceWattle, broken: bFenceWattleBroken, fence: true },
  fencerail:   { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.25, h: 1.05, build: bFenceRail,   broken: bFenceRailBroken, fence: true },
  gate:        { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.0,  h: 1.3,  build: bGate,        broken: bGateBroken },
  // --- DESTRUCTIBLES r1: heavier light cover + soft vehicles ---------------
  wallstone:   { cls: 'break',  mat: 'stone',   contact: 'ob', r: 1.6,  h: 1.15, build: bWallStone,  broken: bWallStoneBroken, wall: true, collider: true, keep: 0.82, crushMin: 2.2 },
  walladobe:   { cls: 'break',  mat: 'plaster', contact: 'ob', r: 1.6,  h: 1.2,  build: bWallAdobe,  broken: bWallAdobeBroken, wall: true, collider: true, keep: 0.86, crushMin: 2.0 },
  truck:       { cls: 'break',  mat: 'baked', contact: 'ob',   r: 2.6,  h: 2.2,  hw: 1.14, hl: 3.0, build: bTruck, broken: bTruckBroken, collider: true, keep: 0.88, crushMin: 2.0 },
  jeep:        { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.7,  h: 1.7,  hw: 0.90, hl: 1.82, build: bJeep, broken: bJeepBroken, keep: 0.94 },
  ammobox:     { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.85, h: 0.75, build: bAmmobox,    broken: bAmmoboxBroken },
  tent:        { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.7,  h: 2.1,  hw: 1.30, hl: 1.72, build: bTent, broken: bTentBroken, keep: 0.985 },
  drumred:     { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.34, h: 0.92, build: bDrumRed,    broken: bDrumRedBroken, explosive: true },
  barrier:     { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.45, h: 1.0,  hw: 0.42, hl: 1.42, build: bBarrier, broken: bBarrierBroken, collider: true, keep: 0.83, crushMin: 2.4 },
  roadsign:    { cls: 'topple', mat: 'baked', contact: 'ob',   r: 0.48, h: 2.85, shape: 'circle', collisionR: 0.20, groundR: 0.22, build: bRoadsign, broken: null, keep: 0.96 },
  cone:        { cls: 'physics', mat: 'baked', contact: 'loop', r: 0.32, h: 0.8,  build: bCone,       broken: null, bodyR: 0.27, mass: 0.34, bounce: 0.44 },
  transformer: { cls: 'break',  mat: 'baked', contact: 'ob',   r: 0.9,  h: 1.85, hw: 0.76, hl: 0.51, build: bTransformer, broken: bTransformerBroken, collider: true, keep: 0.86, crushMin: 2.2 },
  cablespool:  { cls: 'break',  mat: 'baked', contact: 'ob',   r: 0.9,  h: 1.5,  hw: 0.66, hl: 0.76, build: bCableSpool, broken: bCableSpoolBroken, keep: 0.9 },
};
