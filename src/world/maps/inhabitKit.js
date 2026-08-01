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
// registry
// ---------------------------------------------------------------------------

/**
 * Destructible type table (world-dressing r1).
 * cls: 'break' swaps intact -> broken debris; 'topple' hinge-falls and persists.
 * mat: 'wood' | 'straw' (map-toned textured materials) | 'baked' (vertex color).
 * contact: 'ob' = crushable obstacle (state.js SAT seam — resists a crawl,
 *   breaks on real overrun, exactly the tree mechanism); 'loop' = cosmetic
 *   hull-radius crush via the world.crushables loop in main.js (no obstacle
 *   at all — sapling class); 'none' = shells only.
 * r/h: record radius / height (AABB + shell sweep bounds).
 */
export const DESTRUCTIBLE_TYPES = {
  barrel:      { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.40, h: 1.0,  build: bBarrel,      broken: bBarrelBroken },
  crate:       { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.62, h: 1.1,  build: bCrate,       broken: bCrateBroken },
  pallet:      { cls: 'break',  mat: 'wood',  contact: 'loop', r: 0.62, h: 0.2,  build: bPallet,      broken: bPalletBroken },
  bale:        { cls: 'break',  mat: 'straw', contact: 'ob',   r: 0.78, h: 1.45, build: bBale,        broken: bBaleBroken },
  stook:       { cls: 'break',  mat: 'straw', contact: 'ob',   r: 0.55, h: 1.3,  build: bStook,       broken: bStookBroken },
  firewood:    { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.85, h: 0.95, build: bFirewood,    broken: bFirewoodBroken },
  trough:      { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.95, h: 0.68, build: bTrough,      broken: bTroughBroken },
  stall:       { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.45, h: 2.3,  build: bStall,       broken: bStallBroken },
  bench:       { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.85, h: 1.0,  build: bBench,       broken: bBenchBroken },
  churn:       { cls: 'topple', mat: 'baked', contact: 'loop', r: 0.26, h: 0.82, build: bChurn,       broken: null },
  lamp:        { cls: 'topple', mat: 'baked', contact: 'ob',   r: 0.30, h: 4.7,  build: bLamp,        broken: null },
  drum:        { cls: 'topple', mat: 'baked', contact: 'loop', r: 0.32, h: 0.92, build: bDrum,        broken: null },
  sled:        { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.75, h: 0.5,  build: bSled,        broken: bSledBroken },
  pot:         { cls: 'break',  mat: 'baked', contact: 'loop', r: 0.55, h: 0.75, build: bPot,         broken: bPotBroken },
  rugframe:    { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.15, h: 2.2,  build: bRugFrame,    broken: bRugFrameBroken },
  laundry:     { cls: 'break',  mat: 'baked', contact: 'loop', r: 1.75, h: 1.95, build: bLaundry,     broken: bLaundryBroken },
  haycart:     { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.55, h: 2.1,  build: bHaycart,     broken: bHaycartBroken },
  handcart:    { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 0.85, h: 1.1,  build: bHandcart,    broken: bHandcartBroken },
  haystack:    { cls: 'break',  mat: 'straw', contact: 'ob',   r: 1.75, h: 2.5,  build: bHaystack,    broken: bHaystackBroken },
  fenceplank:  { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.25, h: 1.1,  build: bFencePlank,  broken: bFencePlankBroken, fence: true },
  fencepicket: { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.25, h: 1.0,  build: bFencePicket, broken: bFencePicketBroken, fence: true },
  fencewattle: { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.25, h: 1.0,  build: bFenceWattle, broken: bFenceWattleBroken, fence: true },
  fencerail:   { cls: 'break',  mat: 'baked', contact: 'ob',   r: 1.25, h: 1.05, build: bFenceRail,   broken: bFenceRailBroken, fence: true },
  gate:        { cls: 'break',  mat: 'wood',  contact: 'ob',   r: 1.0,  h: 1.3,  build: bGate,        broken: bGateBroken },
};
