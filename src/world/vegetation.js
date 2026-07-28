// src/world/vegetation.js — instanced vegetation with GPU wind.
// Trees are built from alpha-carded foliage planes (canvas leaf-cluster
// textures) on branched trunks — not cone/blob primitives. Grass is a dense
// camera-centred instanced carpet (cell-cached, deterministic) layered over a
// sparser map-wide midfield scatter.
// Contract: docs/ARCHITECTURE.md §3.2; visuals per docs/research/graphics-aaa.md §8.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleSplatNoise, applyTone } from './terrain.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const HALF = 512;
const CHUNKS = 8, CHUNK_SIZE = 128;
const GRASS_PER_CHUNK = 7600;          // midfield scatter (map-wide, cheap)
const GRASS_FADE_END = 128;
// near carpet: camera-centred cells, dense
const CARPET_CELL = 14;
const CARPET_RING = 4;                 // (2R+1)^2 = 81 cells around the camera
const CARPET_PER_CELL = 460;           // attempts per cell (filters thin it)
const CARPET_FAR = 70;                 // shader fade distance
const CARPET_CAP = 16000;              // instances per tuft variant
const TREE_NEAR_IN = 260, TREE_NEAR_OUT = 290; // hysteresis band (full-detail radius)

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function smoothstepJs(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function _mustReplace(src, anchor, replacement) {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/vegetation: shader anchor missing: ${anchor}`);
  return out;
}

// Cards carry hand-authored normals (up for grass, canopy-outward for tree
// foliage); undo the DOUBLE_SIDED faceDirection flip so backfaces don't light
// from below.
function useAttributeNormal(shader) {
  shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <normal_fragment_begin>',
    '#include <normal_fragment_begin>\nnormal = normalize( vNormal );\nnonPerturbedNormal = normal;');
}

// ---------------------------------------------------------------------------
// Canvas textures (grass blade card, leaf-cluster + needle-spray foliage)
// ---------------------------------------------------------------------------

const _cc = new THREE.Color();
function css(h, s, l) { _cc.setHSL(h, s, l); return _cc.getStyle(); }

function finishAlphaTexture(c, ctx, floodR, floodG, floodB, radialFalloff = false, tone = null) {
  // flood transparent texels with the mean foliage tone so mip averaging does
  // not darken distant cards toward black (non-premultiplied-alpha bleed).
  // radialFalloff pulls border alpha to 0 so deep mips average BELOW the
  // alphaTest threshold — otherwise minified cards resolve as solid rectangles.
  const s = c.width;
  const id = ctx.getImageData(0, 0, s, s);
  const d = id.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    if (d[i + 3] < 24) { d[i] = floodR; d[i + 1] = floodG; d[i + 2] = floodB; }
    if (radialFalloff) {
      const rr = Math.hypot(x - s / 2, y - s / 2) / (s / 2);
      d[i + 3] *= clamp((1.08 - rr) / 0.5, 0, 1);
    }
  }
  applyTone(d, tone);
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Two tuft variants: 0 = lush meadow tuft, 1 = drier mixed tuft. Dense at the
// root line, ragged at the top so minified mips fade the card edges instead of
// exposing a translucent rectangle.
function makeGrassCardTexture(rng, variant, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const dryChance = variant === 0 ? 0.12 : 0.32;
  const nBlades = variant === 0 ? 46 : 38;
  for (let b = 0; b < nBlades; b++) {
    const dry = rng() < dryChance;
    const bx = 8 + rng() * (s - 16);
    const bw = 5 + rng() * 7;
    const tall = rng();
    const tipX = bx + (rng() - 0.5) * (variant === 0 ? 90 : 130);
    const tipY = s - (0.35 + 0.62 * tall) * s;
    const cpX = bx + (tipX - bx) * (0.25 + rng() * 0.3);
    const cpY = s - (s - tipY) * (0.45 + rng() * 0.2);
    const grad = ctx.createLinearGradient(0, s, 0, tipY);
    if (dry) {
      grad.addColorStop(0, css(0.105, 0.30, 0.16 + rng() * 0.05));
      grad.addColorStop(1, css(0.115, 0.36, 0.34 + rng() * 0.09));
    } else {
      grad.addColorStop(0, css(0.24, 0.42, 0.10 + rng() * 0.04));
      grad.addColorStop(0.6, css(0.225, 0.44, 0.22 + rng() * 0.06));
      grad.addColorStop(1, css(0.20 + rng() * 0.04, 0.42, 0.33 + rng() * 0.12));
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, s + 2);
    ctx.quadraticCurveTo(cpX - bw * 0.3, cpY, tipX, tipY);
    ctx.quadraticCurveTo(cpX + bw * 0.3, cpY, bx + bw / 2, s + 2);
    ctx.closePath();
    ctx.fill();
  }
  return finishAlphaTexture(c, ctx, 74, 88, 42, false, tone);
}

// Broadleaf foliage card: dozens of small leaf-ellipse clumps, centre-heavy so
// card silhouettes stay ragged; brighter toward the top (sun side).
function makeLeafClusterTexture(rng, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  for (let k = 0; k < 105; k++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.62) * 0.45 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const sun = 1 - y / s;
    const l = 0.17 + sun * 0.15 + rng() * 0.10;
    const hue = 0.215 + rng() * 0.045; // olive ramp — matches the far-canopy set
    ctx.fillStyle = css(hue, 0.22 + rng() * 0.09, l);
    const nl = 5 + (rng() * 6) | 0;
    for (let j = 0; j < nl; j++) {
      const lx = x + (rng() - 0.5) * 15, ly = y + (rng() - 0.5) * 15;
      const lw = 3.2 + rng() * 4.2, lh = 2.0 + rng() * 2.8;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rng() * Math.PI);
      ctx.beginPath();
      ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  return finishAlphaTexture(c, ctx, 70, 78, 40, true, tone);
}

// Conifer foliage card: fanned needle sprays, muted olive-green.
function makeNeedleSprayTexture(rng, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  ctx.lineCap = 'round';
  for (let k = 0; k < 95; k++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.6) * 0.44 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const sun = 1 - y / s;
    const dir = rng() * Math.PI * 2;
    const n = 8 + (rng() * 8) | 0;
    ctx.strokeStyle = css(0.30 + rng() * 0.035, 0.20 + rng() * 0.10, 0.17 + sun * 0.15 + rng() * 0.09);
    ctx.lineWidth = 1.5 + rng() * 0.9;
    for (let j = 0; j < n; j++) {
      const na = dir + (rng() - 0.5) * 1.5;
      const len = 9 + rng() * 12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(na) * len, y + Math.sin(na) * len + len * 0.25);
      ctx.stroke();
    }
  }
  return finishAlphaTexture(c, ctx, 52, 68, 48, true, tone);
}

// Palm frond card: central rib with paired leaflets, v axis = frond length
// (base at the bottom of the card). Warm green with a dry-tip gradient.
function makePalmFrondTexture(rng, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.lineCap = 'round';
  for (let f = 0; f < 3; f++) { // 3 slightly offset fronds per card
    const bx = s / 2 + (f - 1) * 26;
    const tipX = bx + (rng() - 0.5) * 40;
    // rib
    ctx.strokeStyle = css(0.13 + rng() * 0.03, 0.35, 0.20 + rng() * 0.06);
    ctx.lineWidth = 4.5 - f;
    ctx.beginPath();
    ctx.moveTo(bx, s - 2);
    ctx.quadraticCurveTo(bx, s * 0.5, tipX, 6);
    ctx.stroke();
    // leaflets marching up the rib
    const n = 26;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const rx = bx + (tipX - bx) * t * t;
      const ry = s - 2 - (s - 8) * t;
      const len = 34 * (1 - Math.abs(t - 0.45) * 1.3) + 8;
      const dry = t > 0.8 ? (t - 0.8) * 3 : 0;
      ctx.strokeStyle = css(0.20 - dry * 0.09 + rng() * 0.03, 0.38 - dry * 0.1,
        0.20 + t * 0.16 + rng() * 0.06);
      ctx.lineWidth = 2.6 - t * 1.2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + side * len * (0.85 + rng() * 0.3), ry - len * 0.42 + rng() * 6);
        ctx.stroke();
      }
    }
  }
  return finishAlphaTexture(c, ctx, 60, 82, 40, false, tone);
}

// Bare-twig card (winter birch crowns / bare shrubs): dark branching strokes.
function makeTwigTexture(rng, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.lineCap = 'round';
  function branch(x, y, a, len, w, depth) {
    if (depth <= 0 || len < 5) return;
    const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
    ctx.strokeStyle = css(0.06 + rng() * 0.02, 0.14, 0.14 + rng() * 0.10);
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    const forks = 2 + ((rng() * 2) | 0);
    for (let k = 0; k < forks; k++) {
      branch(nx, ny, a + (rng() - 0.5) * 1.5, len * (0.55 + rng() * 0.25), w * 0.62, depth - 1);
    }
  }
  for (let b = 0; b < 7; b++) {
    const a = rng() * Math.PI * 2;
    branch(s / 2 + (rng() - 0.5) * 60, s / 2 + (rng() - 0.5) * 60, a, 26 + rng() * 22, 2.6, 4);
  }
  return finishAlphaTexture(c, ctx, 58, 52, 48, true, tone);
}

// ---------------------------------------------------------------------------
// Tree geometry — branched trunk (opaque) + foliage cards (alpha-tested)
// ---------------------------------------------------------------------------

const _c = new THREE.Color();
const _v3 = new THREE.Vector3();
const _e = new THREE.Euler();
const _qq = new THREE.Quaternion();
const _m = new THREE.Matrix4();

function paintFlat(geo, color, flex) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const fl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    fl[i] = flex;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  return geo;
}

// one foliage card: plane transformed into place, vertex colour = AO/tint,
// normal = canopy-outward blend so lighting wraps the crown as one volume
function foliageCard(w, h, px, py, pz, euler, shade, hue, sat, flex, canopyCx, canopyCy, canopyCz) {
  const g = new THREE.PlaneGeometry(w, h);
  _qq.setFromEuler(euler);
  _m.compose(_v3.set(px, py, pz), _qq, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  _c.setHSL(hue, sat, 0.5, THREE.SRGBColorSpace); // tint via HSL, applied as multiplier around 1
  const col = new Float32Array(n * 3);
  const fl = new Float32Array(n);
  const nd = _v3.set(px - canopyCx, (py - canopyCy) * 0.65, pz - canopyCz);
  if (nd.lengthSq() < 1e-6) nd.set(0, 1, 0);
  nd.normalize();
  nd.y += 1.55; nd.normalize(); // strong up-bias: canopy reads sunlit, not backlit-black
  const nrm = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r * 1.7 * shade; col[i * 3 + 1] = _c.g * 1.7 * shade; col[i * 3 + 2] = _c.b * 1.7 * shade;
    fl[i] = flex;
    nrm.setXYZ(i, nd.x, nd.y, nd.z);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  return g;
}

function mergeParts(parts) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

// trunk + a few real branch cylinders reaching into the canopy
function buildBroadleafTrunk(rng) {
  const parts = [];
  const trunkH = 3.1 + rng() * 0.5;
  const trunk = new THREE.CylinderGeometry(0.17, 0.34, trunkH, 7, 2);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + tp.getY(i) * (rng() * 0.08));
  trunk.computeVertexNormals();
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.07, 0.26, 0.16 + rng() * 0.05, THREE.SRGBColorSpace);
  parts.push(paintFlat(trunk, _c.clone(), 0));
  const nBr = 3 + (rng() * 2) | 0;
  for (let b = 0; b < nBr; b++) {
    const len = 1.5 + rng() * 1.1;
    const br = new THREE.CylinderGeometry(0.045, 0.10, len, 5, 1);
    br.translate(0, len / 2, 0);
    br.rotateZ(0.55 + rng() * 0.55);
    br.rotateY(rng() * Math.PI * 2);
    br.translate(0, trunkH * (0.62 + rng() * 0.3), 0);
    _c.setHSL(0.07, 0.24, 0.15 + rng() * 0.04, THREE.SRGBColorSpace);
    parts.push(paintFlat(br, _c.clone(), 0.15));
  }
  return mergeParts(parts);
}

function buildBroadleafCards(rng, nCards, sizeMul, pal = {}) {
  const hue0 = pal.cardHue ?? 0.235, sat0 = pal.cardSat ?? 0.24;
  const cy = 4.35, rx = 2.35, ry = 1.75, rz = 2.35;
  const parts = [];
  for (let i = 0; i < nCards; i++) {
    // direction on a squashed sphere, radius biased outward
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.22 + 0.78 * rng(), 0.75);
    const px = dx * rad * rx, py = cy + dy * rad * ry * (dy > 0 ? 1 : 0.8), pz = dz * rad * rz;
    const wsz = (1.55 + rng() * 0.9) * sizeMul;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    const shade = (0.55 + 0.45 * rad) * (0.9 + 0.2 * clamp((py - cy) / ry * 0.5 + 0.5, 0, 1));
    parts.push(foliageCard(wsz, wsz * 0.82, px, py, pz, _e, shade,
      hue0 + (rng() - 0.5) * 0.03, sat0 + rng() * 0.08, 0.30 + rad * 0.65, 0, cy, 0));
  }
  // a couple of low cards hanging near the branch collar
  for (let i = 0; i < Math.max(2, nCards >> 4); i++) {
    const a = rng() * Math.PI * 2, rr = 0.9 + rng() * 0.9;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    parts.push(foliageCard(1.3 * sizeMul, 1.0 * sizeMul, Math.cos(a) * rr, 2.9 + rng() * 0.6, Math.sin(a) * rr,
      _e, 0.5, hue0 + 0.005, sat0 + 0.02, 0.35, 0, cy, 0));
  }
  return mergeParts(parts);
}

function buildPineTrunk(rng) {
  const parts = [];
  const trunkH = 5.9 + rng() * 0.6;
  const trunk = new THREE.CylinderGeometry(0.10, 0.30, trunkH, 7, 1);
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.06, 0.30, 0.14 + rng() * 0.04, THREE.SRGBColorSpace);
  parts.push(paintFlat(trunk, _c.clone(), 0));
  return mergeParts(parts);
}

function buildPineCards(rng, tierStep, sizeMul, pal = {}) {
  const hue0 = pal.cardHue ?? 0.325, sat0 = pal.cardSat ?? 0.23;
  const topY = 6.4;
  const parts = [];
  for (let y = 1.55; y < topY - 0.3; y += tierStep * (0.85 + rng() * 0.3)) {
    const t = (y - 1.2) / (topY - 1.2);
    const rr = (1.0 - t) * 1.65 + 0.30;
    const m = Math.max(3, Math.round(2 + rr * 2.2));
    const a0 = rng() * Math.PI * 2;
    for (let k = 0; k < m; k++) {
      const a = a0 + (k / m) * Math.PI * 2 + (rng() - 0.5) * 0.7;
      // cap card width — oversized bottom-tier quads mip into solid diamonds
      const w = Math.min(rr * 1.15 + 0.75, 2.4) * sizeMul, h = (0.9 + rr * 0.45) * sizeMul;
      _e.set(-Math.PI / 2 + 0.55 + rng() * 0.25, -a + Math.PI / 2, (rng() - 0.5) * 0.3, 'YXZ');
      const shade = 0.55 + t * 0.35 + rng() * 0.15;
      parts.push(foliageCard(w, h, Math.cos(a) * rr * 0.55, y + rng() * 0.25, Math.sin(a) * rr * 0.55,
        _e, shade, hue0 + (rng() - 0.5) * 0.02, sat0 + rng() * 0.07, 0.15 + Math.pow(t, 1.5) * 0.65,
        0, y - 0.6, 0));
    }
  }
  // vertical leader cards at the top
  for (let k = 0; k < 2; k++) {
    _e.set(0, rng() * Math.PI, 0, 'YXZ');
    parts.push(foliageCard(1.0 * sizeMul, 1.7 * sizeMul, 0, topY - 0.55, 0, _e, 0.9,
      hue0, sat0 + 0.03, 0.8, 0, topY - 1.6, 0));
  }
  return mergeParts(parts);
}

// --- palm: curved trunk + radiating frond cards from the crown ---
function buildPalmGeometry(rng) {
  const trunkParts = [];
  const H = 5.8 + rng() * 1.6;
  const leanA = rng() * Math.PI * 2;
  const lean = 0.5 + rng() * 0.5; // total top offset in meters
  const NSEG = 5;
  let px = 0, pz = 0;
  for (let i = 0; i < NSEG; i++) {
    const t0 = i / NSEG, t1 = (i + 1) / NSEG;
    const x0 = Math.cos(leanA) * lean * t0 * t0, z0 = Math.sin(leanA) * lean * t0 * t0;
    const x1 = Math.cos(leanA) * lean * t1 * t1, z1 = Math.sin(leanA) * lean * t1 * t1;
    const segLen = Math.hypot(H / NSEG, x1 - x0, z1 - z0);
    const seg = new THREE.CylinderGeometry(0.11 + (1 - t1) * 0.08, 0.12 + (1 - t0) * 0.08, segLen, 6, 1);
    // ring texture illusion: alternate slightly darker segments
    _c.setHSL(0.095, 0.18, (i % 2 ? 0.46 : 0.55) + rng() * 0.04, THREE.SRGBColorSpace);
    seg.rotateZ(Math.atan2(x1 - x0, H / NSEG) * -1);
    seg.rotateY(-leanA);
    seg.translate((x0 + x1) / 2, (t0 + t1) * 0.5 * H, (z0 + z1) / 2);
    trunkParts.push(paintFlat(seg, _c.clone(), t1 * 0.25));
    px = x1; pz = z1;
  }
  // fiber collar under the crown
  const collar = new THREE.CylinderGeometry(0.24, 0.16, 0.5, 6, 1);
  collar.translate(px, H - 0.2, pz);
  _c.setHSL(0.09, 0.28, 0.26, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(collar, _c.clone(), 0.25));

  const cardParts = [];
  const n = 13 + ((rng() * 4) | 0);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.5;
    const droop = 0.42 + rng() * 0.42; // 0 = horizontal, 1 = hanging
    const len = 3.2 + rng() * 1.1;
    const g = new THREE.PlaneGeometry(1.5, len);
    g.translate(0, len / 2, 0); // pivot at frond base
    _qq.setFromEuler(_e.set(-Math.PI / 2 + (1 - droop) * 1.25, 0, 0, 'YXZ'));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), _qq, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    const yq = new THREE.Matrix4().makeRotationY(a);
    g.applyMatrix4(yq);
    g.translate(px, H + 0.15, pz);
    // paint: brighter upper fronds
    const nv = g.attributes.position.count;
    _c.setHSL(0.23 + (rng() - 0.5) * 0.03, 0.30, 0.5, THREE.SRGBColorSpace);
    const col = new Float32Array(nv * 3);
    const fl = new Float32Array(nv);
    const shade = 0.75 + (1 - droop) * 0.35;
    for (let i = 0; i < nv; i++) {
      col[i * 3] = _c.r * 1.6 * shade; col[i * 3 + 1] = _c.g * 1.6 * shade; col[i * 3 + 2] = _c.b * 1.6 * shade;
      fl[i] = 0.55;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
    const nrm = g.attributes.normal;
    _v3.set(Math.sin(a) * 0.4, 1.35, Math.cos(a) * 0.4).normalize();
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, _v3.x, _v3.y, _v3.z);
    cardParts.push(g);
  }
  // 2 hanging dead fronds
  for (let k = 0; k < 2; k++) {
    const a = rng() * Math.PI * 2;
    const g = new THREE.PlaneGeometry(0.9, 2.2);
    g.translate(0, -1.1 + 0.2, 0);
    g.rotateX(0.35);
    g.rotateY(a);
    g.translate(px + Math.sin(a) * 0.3, H - 0.1, pz + Math.cos(a) * 0.3);
    _c.setHSL(0.10, 0.28, 0.30, THREE.SRGBColorSpace);
    const nv = g.attributes.position.count;
    const col = new Float32Array(nv * 3);
    const fl = new Float32Array(nv);
    for (let i = 0; i < nv; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      fl[i] = 0.3;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
    cardParts.push(g);
  }
  return { trunk: mergeParts(trunkParts), cards: mergeParts(cardParts) };
}

// --- birch: pale banded trunk, upward branches, sparse bare-twig cards ---
function buildBirchGeometry(rng) {
  const trunkParts = [];
  const H = 5.6 + rng() * 1.6;
  const trunk = new THREE.CylinderGeometry(0.07, 0.17, H, 7, 3);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + tp.getY(i) * (rng() * 0.03));
  trunk.computeVertexNormals();
  trunk.translate(0, H / 2, 0);
  // banded bark via vertex colours: pale white with darker patches
  {
    const nv = trunk.attributes.position.count;
    const col = new Float32Array(nv * 3);
    const fl = new Float32Array(nv);
    for (let i = 0; i < nv; i++) {
      const y = trunk.attributes.position.getY(i);
      const band = Math.sin(y * 5.1 + rng() * 0.3) > 0.72 ? 0.32 : 1;
      _c.setHSL(0.09, 0.04, (0.60 + rng() * 0.10) * band + (band < 1 ? 0.06 : 0), THREE.SRGBColorSpace);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      fl[i] = 0;
    }
    trunk.setAttribute('color', new THREE.BufferAttribute(col, 3));
    trunk.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
    trunkParts.push(trunk);
  }
  const nBr = 5 + ((rng() * 3) | 0);
  for (let b = 0; b < nBr; b++) {
    const len = 1.2 + rng() * 1.4;
    const br = new THREE.CylinderGeometry(0.015, 0.045, len, 4, 1);
    br.translate(0, len / 2, 0);
    br.rotateZ(0.35 + rng() * 0.5); // reach upward
    br.rotateY(rng() * Math.PI * 2);
    br.translate(0, H * (0.5 + rng() * 0.42), 0);
    _c.setHSL(0.07, 0.10, 0.22 + rng() * 0.08, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(br, _c.clone(), 0.3));
  }
  // sparse twig cards forming the bare crown silhouette
  const cardParts = [];
  const cy = H * 0.78;
  const nc = 9 + ((rng() * 5) | 0);
  for (let i = 0; i < nc; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = 1.2 + rng() * 0.8;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    cardParts.push(foliageCard(w, w * 0.9, dx * rad * 1.3, cy + dy * rad * H * 0.2, dz * rad * 1.3,
      _e, 0.9 + rng() * 0.3, 0.08, 0.06, 0.45, 0, cy, 0));
  }
  return { trunk: mergeParts(trunkParts), cards: mergeParts(cardParts) };
}

// --- far-LOD trees: OPAQUE canopy lobes (no alpha cards). Beyond ~260 m the
// card mips would resolve to solid rectangles; opaque jittered lobes give
// clean massed silhouettes for ridgelines and the rim forest instead. ---

function jitterRadial(geo, rng, amount) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) > 1e-4) {
      const f = 1 + (rng() - 0.5) * 2 * amount;
      pos.setX(i, x * f); pos.setZ(i, z * f);
      pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount * 0.8);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Sphere-project the normals of a canopy lobe (centered on cx/cy/cz, in the
// geometry's local space) with an up-bias, mirroring the near-LOD foliage
// cards: the crown lights as one smooth sunlit volume instead of a shattered
// pile of self-shadowing face normals. Call BEFORE translating the lobe.
function sphereNormals(geo, cx, cy, cz, upBias) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    _v3.set(pos.getX(i) - cx, (pos.getY(i) - cy) * 0.7, pos.getZ(i) - cz);
    if (_v3.lengthSq() < 1e-6) _v3.set(0, 1, 0);
    _v3.normalize();
    _v3.y += upBias;
    _v3.normalize();
    nrm.setXYZ(i, _v3.x, _v3.y, _v3.z);
  }
  return geo;
}

// vertical light gradient + speckle baked into vertex colours
function paintCanopy(geo, hue, sat, l0, l1, y0, y1, rng, flexTop) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const fl = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    _c.setHSL(hue + (rng() - 0.5) * 0.02, sat, (l0 + (l1 - l0) * t) * (0.9 + rng() * 0.2), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    fl[i] = t * flexTop;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  return geo;
}

// Far builders return { trunk, canopy } so the canopy can use its own lit
// material (no shadow reception, boosted sky ambient) — the old single-mesh
// bark material rendered canopies as near-black shattered shards at 8x zoom.
function buildOakFarGeometry(rng, pal = {}) {
  const cp = pal.canopy || {};
  const hue = cp.hue ?? 0.24, sat = cp.sat ?? 0.30, l0 = cp.l0 ?? 0.235, l1 = cp.l1 ?? 0.36;
  const trunkParts = [], canopyParts = [];
  const trunkH = 2.9;
  const trunk = new THREE.CylinderGeometry(0.20, 0.36, trunkH, 5, 1);
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.07, 0.26, 0.17, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  for (let b = 0; b < 3; b++) {
    const blob = new THREE.IcosahedronGeometry(1.45 + rng() * 0.5, 1);
    jitterRadial(blob, rng, 0.26);
    blob.scale(1.22, 0.85, 1.22);
    sphereNormals(blob, 0, 0, 0, 1.0); // smooth sunlit crown, no black facets
    blob.translate((rng() - 0.5) * 1.5, 4.1 + (rng() - 0.45) * 1.3, (rng() - 0.5) * 1.5);
    canopyParts.push(paintCanopy(blob, hue, sat, l0, l1, 2.6, 5.8, rng, 0.3));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

function buildPineFarGeometry(rng, pal = {}) {
  const cp = pal.canopy || {};
  const hue = cp.hue ?? 0.315, sat = cp.sat ?? 0.26, l0 = cp.l0 ?? 0.215, l1 = cp.l1 ?? 0.33;
  const trunkParts = [], canopyParts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.28, 2.2, 5, 1);
  trunk.translate(0, 1.1, 0);
  _c.setHSL(0.06, 0.28, 0.14, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  const lobes = [
    { y: 1.4, r: 1.55, h: 2.7 },
    { y: 3.3, r: 1.05, h: 2.3 },
    { y: 5.0, r: 0.60, h: 1.7 },
  ];
  for (const lv of lobes) {
    const cone = new THREE.ConeGeometry(lv.r * (0.9 + rng() * 0.2), lv.h, 8, 2);
    jitterRadial(cone, rng, 0.18);
    sphereNormals(cone, 0, lv.h * -0.25, 0, 0.75); // radial+up: lit side / sky-filled side
    cone.translate(0, lv.y + lv.h / 2, 0);
    canopyParts.push(paintCanopy(cone, hue, sat, l0, l1, 1.2, 6.6, rng, 0.35));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

function buildPalmFarGeometry(rng, pal = {}) {
  const cp = pal.canopy || {};
  const trunkParts = [], canopyParts = [];
  const H = 5.6;
  const trunk = new THREE.CylinderGeometry(0.11, 0.20, H, 5, 1);
  trunk.translate(0.25, H / 2, 0);
  trunk.rotateZ(-0.06);
  _c.setHSL(0.085, 0.24, 0.22, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  // crown: flattened jittered disc reads as a frond star at range
  const disc = new THREE.IcosahedronGeometry(1.9, 1);
  jitterRadial(disc, rng, 0.3);
  disc.scale(1.15, 0.28, 1.15);
  sphereNormals(disc, 0, 0, 0, 1.2);
  disc.translate(0.35, H + 0.15, 0);
  canopyParts.push(paintCanopy(disc, cp.hue ?? 0.235, cp.sat ?? 0.30,
    cp.l0 ?? 0.22, cp.l1 ?? 0.34, H - 0.5, H + 0.8, rng, 0.4));
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

function buildBirchFarGeometry(rng, pal = {}) {
  const cp = pal.canopy || {};
  const trunkParts = [], canopyParts = [];
  const H = 5.4;
  const trunk = new THREE.CylinderGeometry(0.06, 0.16, H, 5, 1);
  trunk.translate(0, H / 2, 0);
  _c.setHSL(0.09, 0.04, 0.62, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  // bare crown: two thin dark twig-mass lobes
  for (let b = 0; b < 2; b++) {
    const blob = new THREE.IcosahedronGeometry(0.9 + rng() * 0.35, 1);
    jitterRadial(blob, rng, 0.35);
    blob.scale(0.9, 1.5, 0.9);
    sphereNormals(blob, 0, 0, 0, 1.0);
    blob.translate((rng() - 0.5) * 0.8, H * 0.72 + (rng() - 0.4) * 1.2, (rng() - 0.5) * 0.8);
    canopyParts.push(paintCanopy(blob, cp.hue ?? 0.06, cp.sat ?? 0.08,
      cp.l0 ?? 0.16, cp.l1 ?? 0.26, H * 0.4, H, rng, 0.35));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

// squat card clump for hedgerow/field bushes
function buildBushCards(rng, pal = {}) {
  const hue0 = pal.cardHue ?? 0.24, sat0 = pal.cardSat ?? 0.26;
  const parts = [];
  const cy = 0.55;
  for (let i = 0; i < 11; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = 0.9 + rng() * 0.6;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    parts.push(foliageCard(w, w * 0.8, dx * rad * 0.85, cy + dy * rad * 0.38, dz * rad * 0.85,
      _e, 0.4 + 0.5 * rad, hue0 + (rng() - 0.5) * 0.04, sat0, 0.22, 0, cy, 0));
  }
  return mergeParts(parts);
}

// ---------------------------------------------------------------------------
// createVegetation
// ---------------------------------------------------------------------------

/**
 * Create instanced grass and trees with GPU wind.
 * @param {object} heightField HeightField from terrain.createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {number} [seed=2001] vegetation seed
 * @param {?object} [cfg=null] map config (uses cfg.vegetation); null = classic verdant set
 * @returns {{group:THREE.Group, update:function(number,THREE.Vector3):void,
 *   setWindTime:function(number):void, treeObstacles:Array<{min:number[],max:number[]}>}}
 */
export function createVegetation(heightField, engineCtx, seed = 2001, cfg = null) {
  const veg = {
    species: ['pine', 'oak'],
    clusterMix: [['pine', 0.55], ['oak', 0.45]],
    loneMix: [['pine', 0.5], ['oak', 0.5]],
    rimMix: [['pine', 0.7], ['oak', 0.3]],
    clusterCount: 46, loneCount: 95, rimCount: 58,
    grassDensity: 1, bushCount: 1, bushSpecies: 'oak',
    grassTexTone: null, tuftTone: null, parks: null, palettes: {},
    ...((cfg && cfg.vegetation) || {}),
  };
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'vegetation';
  const L = heightField._layout;
  const v = L.village;
  const noVeg = heightField._noVeg || (() => false);
  const grassPerChunk = Math.round(GRASS_PER_CHUNK * veg.grassDensity);
  const carpetPerCell = Math.round(CARPET_PER_CELL * veg.grassDensity);

  const uWindTime = { value: 0 };
  const uCamPos = { value: new THREE.Vector3(0, 0, 0) };
  // Sniper near-grass suppression (0 = arcade, 1 = sniper): with the camera at
  // the gun trunnion, meter-tall blades otherwise flood the lower half of the
  // scope. WoT hides near grass in sniper mode by default — fade tufts inside
  // ~15 m of the camera while the rig is in SNIPER. Eased over ~0.1 s in
  // update() so mode switches don't pop.
  const uSniperFade = { value: 0 };
  let sniperFadeTarget = 0;

  // ---- grass materials (shared hook, per-material fade distance) ----
  const grassWindHook = (farDist) => (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uGrassFar = { value: farDist };
    shader.uniforms.uSniperFade = uSniperFade;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nuniform vec3 uCamPos;\nuniform float uGrassFar;\nuniform float uSniperFade;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 giw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float dCam = distance(giw.xyz, uCamPos);
        // wide scale-out band (last ~third of the range): tufts shrink away
        // gradually instead of cutting to flat albedo on a visible line
        float gfade = 1.0 - smoothstep(uGrassFar * 0.66, uGrassFar, dCam);
        // sniper scope: suppress the near carpet so the sight picture stays clear
        gfade *= mix(1.0, smoothstep(7.0, 15.0, dCam), uSniperFade);
        transformed *= gfade;
        float sway = uv.y * uv.y;
        float phase = giw.x * 0.35 + giw.z * 0.28;
        transformed.x += sway * (0.12 * sin(uWindTime * 1.6 + phase) + 0.05 * sin(uWindTime * 3.7 + phase * 2.3));
        transformed.z += sway * 0.08 * cos(uWindTime * 1.3 + phase);
      }`);
    useAttributeNormal(shader);
  };

  // tuft geometry: 3 crossed planes, root sunk slightly for ground blend
  function makeTuftGeometry(w, h) {
    const planes = [];
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PlaneGeometry(w, h, 1, 2);
      p.translate(0, h / 2 - 0.03, 0);
      p.rotateY((k / 3) * Math.PI);
      planes.push(p);
    }
    const geo = mergeGeometries(planes, false);
    const nrm = geo.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    return geo;
  }

  const grassTex = [
    makeGrassCardTexture(mulberry32(seed + 41), 0, veg.grassTexTone),
    makeGrassCardTexture(mulberry32(seed + 42), 1, veg.grassTexTone),
  ];
  function makeGrassMaterial(tex, farDist, cacheKey) {
    const mat = new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.47, side: THREE.DoubleSide,
      roughness: 1.0, metalness: 0.0,
    });
    mat.envMapIntensity = 0.35; // kill white env-specular sparkle on distant blades
    engineCtx.setupShadowMaterial(mat, grassWindHook(farDist));
    mat.customProgramCacheKey = () => cacheKey;
    return mat;
  }
  const grassVariants = [];
  for (let gv = 0; gv < 2; gv++) {
    const w = gv === 0 ? 0.92 : 1.14, h = gv === 0 ? 0.60 : 0.48;
    grassVariants.push({
      geo: makeTuftGeometry(w, h),
      matMid: makeGrassMaterial(grassTex[gv], GRASS_FADE_END, 'world-grass-wind-v3'),
      matNear: makeGrassMaterial(grassTex[gv], CARPET_FAR, 'world-grass-carpet-v3'),
    });
  }

  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _pv = new THREE.Vector3();
  const _sv = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);

  // shared placement filter/tint for a tuft candidate; returns null or
  // [x, y, z, yaw, sxz, sy, r, g, b, variant].
  // PERF (GC): the returned array is a REUSED module scratch — callers must
  // copy the values out (slice() at init time, flat-pack for carpet cells)
  // before calling makeTuft again. This ran hot enough to top the allocation
  // profile while driving (new carpet cells stream in as the camera moves).
  const _tuftScratch = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  function makeTuft(x, z, crng, carpet) {
    if (Math.max(Math.abs(x), Math.abs(z)) > 474) return null;
    const roll = crng(), yaw = crng() * Math.PI * 2;
    const sxz = 0.74 + crng() * 0.62;
    let sy = 0.55 + crng() * 0.85;
    const hueJ = crng(), lumJ = crng(), varJ = crng(), clJ = crng();
    if (noVeg(x, z)) return null;
    const gt = heightField.getGroundType(x, z);
    if (gt === 'hard' || heightField._roadDist(x, z) < 4.2) return null;
    let dry = 0;
    if (gt === 'soft') { if (roll > 0.3) return null; sy *= 1.5; dry = 0.5; } // sparse marsh reeds
    if (heightField._villageMask(x, z) > 0.35 && roll > (carpet ? 0.35 : 0.15)) return null;
    if (heightField.getNormalAt(x, z).y < 0.78) return null;
    // splat-aware thinning: drier + thinner on dirt patches, dense in meadows
    const sn = sampleSplatNoise(x, z);
    const dirtPatch = smoothstepJs(0.62, 0.78, sn.n2 + (sn.n1 - 0.5) * 0.45);
    if (dirtPatch > 0.35 && clJ < dirtPatch * 0.9) dry = Math.max(dry, 0.55);
    if (dirtPatch > 0.55 && roll < (carpet ? 0.6 : 0.75)) return null;
    if (!carpet) { // midfield scatter keeps the clumpy meadow look
      if (sn.n1 < 0.42 && clJ > 0.25 + sn.n1) return null;
    }
    const vv = varJ < (0.75 - dry * 0.5) ? 0 : 1;
    const y = heightField.getHeightAt(x, z);
    let th = 0.225 + (hueJ - 0.5) * 0.045 - dry * 0.08;
    let ts = 0.335 - dry * 0.12;
    let tl = 0.465 + (lumJ - 0.5) * 0.16 + dry * 0.04;
    if (veg.tuftTone) [th, ts, tl] = veg.tuftTone(th, ts, tl);
    _c.setHSL(((th % 1) + 1) % 1, clamp(ts, 0, 1), clamp(tl, 0, 1));
    const t = _tuftScratch;
    t[0] = x; t[1] = y - 0.03; t[2] = z; t[3] = yaw; t[4] = sxz; t[5] = sy;
    t[6] = _c.r; t[7] = _c.g; t[8] = _c.b; t[9] = vv;
    return t;
  }

  // write a tuft stored at offset o of an indexable array (flat-packed cells)
  function writeTuftAt(mesh, i, t, o) {
    _q.setFromAxisAngle(_up, t[o + 3]);
    _m4.compose(_pv.set(t[o], t[o + 1], t[o + 2]), _q, _sv.set(t[o + 4], t[o + 5], t[o + 4]));
    mesh.setMatrixAt(i, _m4);
    _c.setRGB(t[o + 6], t[o + 7], t[o + 8]);
    mesh.setColorAt(i, _c);
  }
  function writeTuft(mesh, i, t) { writeTuftAt(mesh, i, t, 0); }

  // ---- midfield grass scatter (map-wide chunks, unchanged system) ----
  const grassChunks = [];
  for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) {
    const crng = mulberry32((seed ^ (cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const x0 = -HALF + cx * CHUNK_SIZE, z0 = -HALF + cz * CHUNK_SIZE;
    const tufts = [[], []];
    for (let i = 0; i < grassPerChunk; i++) {
      const t = makeTuft(x0 + crng() * CHUNK_SIZE, z0 + crng() * CHUNK_SIZE, crng, false);
      if (t) tufts[t[9]].push(t.slice()); // copy — makeTuft returns a scratch
    }
    const chunkMeshes = [];
    for (let vv = 0; vv < 2; vv++) {
      if (tufts[vv].length === 0) continue;
      const mesh = new THREE.InstancedMesh(grassVariants[vv].geo, grassVariants[vv].matMid, tufts[vv].length);
      for (let i = 0; i < tufts[vv].length; i++) writeTuft(mesh, i, tufts[vv][i]);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // visibility handled per-chunk in update()
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
      group.add(mesh);
      chunkMeshes.push({ mesh, total: tufts[vv].length });
    }
    if (chunkMeshes.length > 0) {
      grassChunks.push({ meshes: chunkMeshes, cx: x0 + CHUNK_SIZE / 2, cz: z0 + CHUNK_SIZE / 2 });
    }
  }

  // ---- near grass carpet (camera-centred, dense, cell-cached) ----
  const carpetMeshes = [];
  for (let vv = 0; vv < 2; vv++) {
    const mesh = new THREE.InstancedMesh(grassVariants[vv].geo, grassVariants[vv].matNear, CARPET_CAP);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.matrixAutoUpdate = false;
    mesh.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
    group.add(mesh);
    carpetMeshes.push(mesh);
  }
  // PERF (GC): each cached cell is ONE flat Float32Array (10 floats per tuft)
  // instead of ~a hundred small JS arrays — cell streaming while driving was
  // the top per-frame allocation source in the heap profile.
  const carpetCache = new Map(); // "ix,iz" -> Float32Array (len = 10 * count)
  const _cellScratch = new Float32Array(1024 * 10); // packs one cell before sizing
  function carpetCell(ix, iz) {
    const key = ix + ',' + iz;
    let cell = carpetCache.get(key);
    if (cell) return cell;
    const crng = mulberry32((seed ^ 0x51ab ^ (ix * 374761393) ^ (iz * 668265263)) >>> 0);
    const x0 = ix * CARPET_CELL, z0 = iz * CARPET_CELL;
    let n = 0;
    for (let i = 0; i < carpetPerCell; i++) {
      const t = makeTuft(x0 + crng() * CARPET_CELL, z0 + crng() * CARPET_CELL, crng, true);
      if (t && (n + 1) * 10 <= _cellScratch.length) {
        t[4] *= 0.92; t[5] *= 0.9;
        _cellScratch.set(t, n * 10);
        n++;
      }
    }
    cell = _cellScratch.slice(0, n * 10);
    carpetCache.set(key, cell);
    if (carpetCache.size > 420) carpetCache.delete(carpetCache.keys().next().value);
    return cell;
  }
  const _carpetLast = new THREE.Vector3(1e9, 0, 0);
  function rebuildCarpet(camPos) {
    const cix = Math.floor(camPos.x / CARPET_CELL), ciz = Math.floor(camPos.z / CARPET_CELL);
    const counts = [0, 0];
    for (let dz = -CARPET_RING; dz <= CARPET_RING; dz++) {
      for (let dx = -CARPET_RING; dx <= CARPET_RING; dx++) {
        const cell = carpetCell(cix + dx, ciz + dz);
        for (let o = 0; o < cell.length; o += 10) {
          const vv = cell[o + 9];
          if (counts[vv] >= CARPET_CAP) continue;
          writeTuftAt(carpetMeshes[vv], counts[vv]++, cell, o);
        }
      }
    }
    for (let vv = 0; vv < 2; vv++) {
      const mesh = carpetMeshes[vv];
      mesh.count = counts[vv];
      mesh.visible = counts[vv] > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // ---- trees ----
  const treeWindHook = (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nattribute float aFlex;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 tiw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = tiw.x * 0.043 + tiw.z * 0.051;
        float amp = aFlex * 0.14;
        transformed.x += amp * (sin(uWindTime * 1.15 + ph) + 0.45 * sin(uWindTime * 2.63 + ph * 1.7));
        transformed.z += amp * 0.7 * cos(uWindTime * 0.97 + ph * 1.3);
      }`);
  };
  const foliageWindHook = (shader) => {
    treeWindHook(shader);
    useAttributeNormal(shader);
  };
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0 });
  barkMat.envMapIntensity = 0.85;
  engineCtx.setupShadowMaterial(barkMat, treeWindHook);
  barkMat.customProgramCacheKey = () => 'world-tree-bark-v3';

  // far canopy: own material — strong sky/env fill acts as the fake-SSS
  // backlight term so shaded crown sides stay green, never crushed black
  const canopyFarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 });
  canopyFarMat.envMapIntensity = 1.35;
  engineCtx.setupShadowMaterial(canopyFarMat, treeWindHook);
  canopyFarMat.customProgramCacheKey = () => 'world-tree-canopyfar-v4';

  // species registry: texture + near/far geometry builders, seed bases keep
  // the classic verdant set bit-identical to the pre-config build
  const SPECIES = {
    pine: {
      texSeed: 52, nearSeed: 61, farSeed: 71,
      tex: (r, pal) => makeNeedleSprayTexture(r, pal.texTone || null),
      near: (k, pal) => ({
        trunk: buildPineTrunk(mulberry32(seed + 61 + k)),
        cards: buildPineCards(mulberry32(seed + 63 + k), 0.72, 1.0, pal),
      }),
      far: (r, pal) => buildPineFarGeometry(r, pal),
    },
    oak: {
      texSeed: 51, nearSeed: 65, farSeed: 73,
      tex: (r, pal) => makeLeafClusterTexture(r, pal.texTone || null),
      near: (k, pal) => ({
        trunk: buildBroadleafTrunk(mulberry32(seed + 65 + k)),
        cards: buildBroadleafCards(mulberry32(seed + 67 + k), 46, 1.0, pal),
      }),
      far: (r, pal) => buildOakFarGeometry(r, pal),
    },
    palm: {
      texSeed: 53, nearSeed: 81, farSeed: 75,
      tex: (r, pal) => makePalmFrondTexture(r, pal.texTone || null),
      near: (k, pal) => buildPalmGeometry(mulberry32(seed + 81 + k)),
      far: (r, pal) => buildPalmFarGeometry(r, pal),
    },
    birch: {
      texSeed: 54, nearSeed: 85, farSeed: 77,
      tex: (r, pal) => makeTwigTexture(r, pal.texTone || null),
      near: (k, pal) => buildBirchGeometry(mulberry32(seed + 85 + k)),
      far: (r, pal) => buildBirchFarGeometry(r, pal),
    },
  };
  const speciesList = veg.species.filter((sp) => SPECIES[sp]);
  const bushSpecies = speciesList.includes(veg.bushSpecies) ? veg.bushSpecies : speciesList[0];
  const palOf = (sp) => veg.palettes[sp] || {};

  const foliageTex = {};
  const foliageMats = {};
  const foliageDepthMats = {};
  for (const sp of speciesList) {
    foliageTex[sp] = SPECIES[sp].tex(mulberry32(seed + SPECIES[sp].texSeed), palOf(sp));
    const fm = new THREE.MeshStandardMaterial({
      map: foliageTex[sp], alphaTest: 0.45, side: THREE.DoubleSide,
      vertexColors: true, roughness: 1.0, metalness: 0.0,
    });
    fm.envMapIntensity = 0.85; // keep ambient on shaded leaves — no black cards
    engineCtx.setupShadowMaterial(fm, foliageWindHook);
    fm.customProgramCacheKey = () => 'world-tree-foliage-v3-' + sp;
    foliageMats[sp] = fm;
    // alpha-tested shadow casting: without this every card shadows as a quad
    foliageDepthMats[sp] = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: foliageTex[sp], alphaTest: 0.45,
    });
  }

  // near geometry: 2 variants per species; far geometry: 1 per species
  const treeGeo = {};
  const treeGeoFar = {};
  for (const sp of speciesList) {
    treeGeo[sp] = [0, 1].map((k) => SPECIES[sp].near(k, palOf(sp)));
    treeGeoFar[sp] = SPECIES[sp].far(mulberry32(seed + SPECIES[sp].farSeed), palOf(sp));
  }

  // weighted species pick from a [ [species, weight], ... ] mix
  function pickSpecies(mix, roll) {
    let tot = 0;
    for (const [sp, w] of mix) if (treeGeo[sp]) tot += w;
    let acc = 0;
    for (const [sp, w] of mix) {
      if (!treeGeo[sp]) continue;
      acc += w / tot;
      if (roll <= acc) return sp;
    }
    return speciesList[0];
  }

  // placement: clusters + lone trees + horizon rim forest
  const clusters = [];
  const trees = []; // { x,z,species,variant, mat: Matrix4, tint: Color, near: bool }
  const treeObstacles = [];
  // SPOTTING WIRING: concealment discs {x,z,r,add} sampled by the spotting
  // sim (src/sim/spotting.js) — bushes conceal strongly, tree canopies mildly.
  const concealers = [];
  function siteOk(x, z, margin) {
    if (Math.max(Math.abs(x), Math.abs(z)) > 455) return false;
    if (x > v.x0 - 24 && x < v.x1 + 24 && z > v.z0 - 24 && z < v.z1 + 24) return false;
    if (heightField._roadDist(x, z) < 9 + margin) return false;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
    if (veg.parks) { // town maps: trees only inside the park belts
      let inPark = false;
      for (const p of veg.parks) {
        if (Math.hypot(x - p.x, z - p.z) < p.r) { inPark = true; break; }
      }
      if (!inPark) return false;
    }
    for (const s of [L.spawns.player, ...L.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 26) return false;
    }
    return heightField.getNormalAt(x, z).y > 0.82;
  }
  function pushTree(x, z, species, scMin, scMax, withObstacle) {
    const y = heightField.getHeightAt(x, z);
    const sc = scMin + rng() * (scMax - scMin);
    _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
    _m4.compose(_pv.set(x, y - 0.06, z), _q, _sv.set(sc, sc * (0.9 + rng() * 0.2), sc));
    _c.setRGB(0.80 + rng() * 0.34, 0.84 + rng() * 0.30, 0.78 + rng() * 0.28); // per-tree tint
    trees.push({ x, z, species, variant: (rng() * 2) | 0, mat: _m4.clone(), tint: _c.clone(), near: false });
    if (withObstacle) {
      treeObstacles.push({ min: [x - 0.55, y, z - 0.55], max: [x + 0.55, y + 3.2 * sc, z + 0.55] });
      concealers.push({ x, z, r: 2.3 * sc, add: 0.13 }); // canopy soft-conceals
    }
  }
  function addTree(x, z, species) {
    if (!siteOk(x, z, 0)) return false;
    pushTree(x, z, species, 1.15, 1.9, true);
    return true;
  }
  let attempts = 0;
  while (clusters.length < veg.clusterCount && attempts++ < 2200) {
    const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
    if (!siteOk(x, z, 6)) continue;
    let far = true;
    for (const c of clusters) if (Math.hypot(x - c.x, z - c.z) < c.r + 26) { far = false; break; }
    if (!far) continue;
    const r = 16 + rng() * 26;
    const species = pickSpecies(veg.clusterMix, rng());
    const n = 15 + (rng() * 22) | 0;
    let placed = 0;
    for (let i = 0; i < n * 3 && placed < n; i++) {
      const a = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
      const sp = rng() < 0.8 ? species : pickSpecies(veg.loneMix, rng());
      if (addTree(x + Math.cos(a) * rr, z + Math.sin(a) * rr, sp)) placed++;
    }
    if (placed > 2) clusters.push({ x, z, r });
  }
  for (let i = 0, placed = 0; i < 700 && placed < veg.loneCount; i++) { // lone trees + pairs
    const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
    if (addTree(x, z, pickSpecies(veg.loneMix, rng()))) {
      placed++;
      if (rng() < 0.4) { // companion tree — lone lollipops read fake
        const a2 = rng() * Math.PI * 2, r2 = 4 + rng() * 7;
        if (addTree(x + Math.cos(a2) * r2, z + Math.sin(a2) * r2, pickSpecies(veg.loneMix, rng()))) placed++;
      }
    }
  }
  // horizon rim forest: dense clustered blocks on the raised map border so
  // distant ridgelines carry massed silhouettes instead of scattered lollipops
  for (let c = 0; c < veg.rimCount; c++) {
    const a = (c / Math.max(1, veg.rimCount)) * Math.PI * 2 + rng() * 0.11;
    const rad = 442 + rng() * 52;
    const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
    if (Math.max(Math.abs(cx), Math.abs(cz)) > 502) continue;
    const species = pickSpecies(veg.rimMix, rng());
    const n = 12 + (rng() * 14) | 0;
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 56, z = cz + (rng() - 0.5) * 56;
      if (Math.max(Math.abs(x), Math.abs(z)) > 506) continue;
      pushTree(x, z, rng() < 0.85 ? species : pickSpecies(veg.rimMix, rng()), 1.6, 2.7, false);
    }
  }

  // near/far instanced meshes (partition rewritten on camera movement, hysteresis).
  // Each LOD is a trunk mesh (opaque bark) + a card mesh (alpha foliage) sharing
  // the same instance matrices.
  function makeTreeMesh(geo, mat, sp, isFoliage) {
    const m = new THREE.InstancedMesh(geo, mat, trees.length);
    m.castShadow = true;
    // cards do NOT receive shadows: per-card CSM self-shadowing turns half the
    // canopy pitch-black; the baked vertex-colour AO carries that job instead
    m.receiveShadow = !isFoliage;
    m.frustumCulled = false;
    m.count = 0;
    m.matrixAutoUpdate = false;
    if (isFoliage) {
      m.customDepthMaterial = foliageDepthMats[sp];
      // GTAO's override-material prepass ignores alphaTest — cards would
      // composite as huge dark floating quads over the canopy
      m.userData.aoExclude = true;
    }
    group.add(m);
    return m;
  }
  const nearMeshes = {}, farMeshes = {};
  for (const sp of speciesList) {
    nearMeshes[sp] = treeGeo[sp].map((g) => [
      makeTreeMesh(g.trunk, barkMat, sp, false),
      makeTreeMesh(g.cards, foliageMats[sp], sp, true),
    ]);
    const farCanopy = makeTreeMesh(treeGeoFar[sp].canopy, canopyFarMat, sp, false);
    farCanopy.receiveShadow = false; // CSM self-shadow at range = black crowns
    farMeshes[sp] = [makeTreeMesh(treeGeoFar[sp].trunk, barkMat, sp, false), farCanopy];
  }

  // ---- bushes (hedgerow / field-edge cover, purely visual) ----
  {
    const bushPal = palOf(bushSpecies);
    const bushGeos = [buildBushCards(mulberry32(seed + 31), bushPal), buildBushCards(mulberry32(seed + 32), bushPal)];
    const bushPlacements = [[], []];
    function addBush(x, z) {
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) return;
      if (rng() > veg.bushCount) return; // per-map density scale
      if (heightField._roadDist(x, z) < 6) return;
      if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return;
      if (heightField.getNormalAt(x, z).y < 0.78) return;
      const y = heightField.getHeightAt(x, z);
      const sc = 0.9 + rng() * 1.3;
      _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
      _m4.compose(_pv.set(x, y - 0.05, z), _q, _sv.set(sc, sc * (0.8 + rng() * 0.3), sc));
      bushPlacements[(rng() * 2) | 0].push(_m4.clone());
      concealers.push({ x, z, r: 2.0 * sc, add: 0.35 }); // SPOTTING WIRING: bush cover
    }
    for (const c of clusters) { // fringe bushes around each tree cluster
      const n = 5 + (rng() * 6) | 0;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, rr = c.r * (1.05 + rng() * 0.5);
        addBush(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
      }
    }
    for (let i = 0; i < 340; i++) { // scattered field bushes, mild roadside bias
      const x = (rng() * 2 - 1) * 455, z = (rng() * 2 - 1) * 455;
      const rd = heightField._roadDist(x, z);
      if (rd > 26 && rng() > 0.55) continue;
      addBush(x, z);
    }
    // midfield concealment clumps: 2-4 bushes together read as usable cover
    for (let c = 0; c < 42; c++) {
      const x = (rng() * 2 - 1) * 420, z = (rng() * 2 - 1) * 420;
      const n = 2 + (rng() * 3) | 0;
      for (let i = 0; i < n; i++) {
        addBush(x + (rng() - 0.5) * 7, z + (rng() - 0.5) * 7);
      }
    }
    for (let bv = 0; bv < 2; bv++) {
      if (bushPlacements[bv].length === 0) continue;
      const m = new THREE.InstancedMesh(bushGeos[bv], foliageMats[bushSpecies], bushPlacements[bv].length);
      for (let i = 0; i < bushPlacements[bv].length; i++) {
        m.setMatrixAt(i, bushPlacements[bv][i]);
        _c.setRGB(0.80 + rng() * 0.30, 0.84 + rng() * 0.26, 0.78 + rng() * 0.24);
        m.setColorAt(i, _c);
      }
      m.castShadow = true;
      m.receiveShadow = false; // baked card AO, no per-card CSM self-shadow
      m.matrixAutoUpdate = false;
      m.customDepthMaterial = foliageDepthMats[bushSpecies];
      m.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
      m.computeBoundingSphere();
      group.add(m);
    }
  }

  const _lastCam = new THREE.Vector3(1e9, 0, 0);
  function repartitionTrees(camPos) {
    for (const t of trees) {
      const d = Math.hypot(t.x - camPos.x, t.z - camPos.z);
      if (t.near) { if (d > TREE_NEAR_OUT) t.near = false; }
      else if (d < TREE_NEAR_IN) t.near = true;
    }
    const counts = {}, farCounts = {};
    for (const sp of speciesList) { counts[sp] = [0, 0]; farCounts[sp] = 0; }
    for (const t of trees) {
      if (t.near) {
        const i = counts[t.species][t.variant]++;
        for (const m of nearMeshes[t.species][t.variant]) {
          m.setMatrixAt(i, t.mat);
          m.setColorAt(i, t.tint);
        }
      } else {
        const i = farCounts[t.species]++;
        for (const m of farMeshes[t.species]) {
          m.setMatrixAt(i, t.mat);
          m.setColorAt(i, t.tint);
        }
      }
    }
    for (const sp of speciesList) {
      for (let vi = 0; vi < 2; vi++) {
        for (const m of nearMeshes[sp][vi]) {
          m.count = counts[sp][vi];
          m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
          m.visible = m.count > 0;
        }
      }
      for (const m of farMeshes[sp]) {
        m.count = farCounts[sp];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.visible = m.count > 0;
      }
    }
  }

  function update(dt, camPos) {
    uWindTime.value += dt;
    uCamPos.value.copy(camPos);
    uSniperFade.value += (sniperFadeTarget - uSniperFade.value) *
      (1 - Math.exp(-(dt || 0) / 0.08));
    for (const gc of grassChunks) {
      const d = Math.max(0, Math.hypot(camPos.x - gc.cx, camPos.z - gc.cz) - CHUNK_SIZE * 0.71);
      // continuous density rolloff (no stepped 1 -> 0.45 pop at 64 m)
      let frac = d < GRASS_FADE_END ? 1 - 0.6 * smoothstepJs(44, 112, d) : 0;
      for (const cm of gc.meshes) {
        const count = Math.floor(cm.total * frac);
        cm.mesh.visible = count > 0;
        if (count > 0) cm.mesh.count = count;
      }
    }
    if (_carpetLast.distanceToSquared(camPos) > 49) {
      _carpetLast.copy(camPos);
      rebuildCarpet(camPos);
    }
    if (_lastCam.distanceToSquared(camPos) > 9) {
      _lastCam.copy(camPos);
      repartitionTrees(camPos);
    }
  }

  function setWindTime(t) { uWindTime.value = t; }

  /**
   * Drive sniper near-grass suppression (0 = arcade, 1 = sniper). The value
   * eases in update(); pass `immediate` to snap (deterministic screenshots).
   * @param {number} f target fade 0..1
   * @param {boolean} [immediate=false] skip the ease
   */
  function setSniperFade(f, immediate = false) {
    sniperFadeTarget = clamp(f, 0, 1);
    if (immediate) uSniperFade.value = sniperFadeTarget;
  }

  return { group, update, setWindTime, setSniperFade, treeObstacles, concealers, _clusters: clusters };
}
