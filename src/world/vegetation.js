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
const GRASS_PER_CHUNK = 9600;          // midfield scatter (map-wide, cheap)
const GRASS_FADE_END = 235;            // scale-out ends here (no hard carpet line)
// near carpet: camera-centred cells, dense. Ring 5 pushes the dense band to
// ~77 m so the ground-level view no longer pops to flat albedo at 30-40 m;
// the midfield scatter carries the 70-235 m band beyond it.
const CARPET_CELL = 14;
const CARPET_RING = 5;                 // (2R+1)^2 = 121 cells around the camera
const CARPET_PER_CELL = 460;           // attempts per cell (filters thin it)
const CARPET_FAR = 95;                 // shader fade distance
const CARPET_CAP = 24000;              // instances per tuft variant
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
    ctx.strokeStyle = css(0.30 + rng() * 0.035, 0.18 + rng() * 0.08, 0.15 + sun * 0.12 + rng() * 0.07);
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

// Palm frond card: ONE feather-shaped frond filling the card, v axis = frond
// length (base at the bottom). Dense overlapping leaflets fill a contiguous
// silhouette with a serrated edge so the frond reads as a mass, not sparse
// scribbles; dry tips, darker underside strokes for depth.
function makePalmFrondTexture(rng, tone = null) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const bx = s / 2;
  // two passes: dark under-layer slightly wider, lit top layer
  for (let pass = 0; pass < 2; pass++) {
    const n = 42;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ry = s - 4 - (s - 12) * t;
      const rx = bx + Math.sin(t * 2.6) * 5;
      // feather envelope: widest just below mid, tapering to the tip
      const env = Math.sin(Math.min(1, t * 1.12) * Math.PI);
      const len = (14 + env * 88) * (pass === 0 ? 1.08 : 1.0);
      const dry = t > 0.78 ? (t - 0.78) * 3.6 : 0;
      const droop = 18 + t * 26;
      for (const side of [-1, 1]) {
        for (let l = 0; l < 3; l++) { // overlapping leaflets per station
          const lw = 5.5 - t * 2.4 - l * 0.8;
          if (lw <= 0.8) continue;
          const jit = (rng() - 0.5) * 7;
          const lum = pass === 0
            ? 0.13 + rng() * 0.05
            : 0.20 + t * 0.12 + rng() * 0.07 + dry * 0.10;
          const sat = pass === 0 ? 0.32 : 0.40 - dry * 0.16;
          const hue = 0.225 - dry * 0.10 + (rng() - 0.5) * 0.02;
          ctx.strokeStyle = css(hue, sat, lum);
          ctx.lineWidth = lw;
          ctx.lineCap = 'round';
          const ex = rx + side * len * (0.9 + rng() * 0.2);
          const ey = ry - len * 0.30 + droop * (0.4 + rng() * 0.3) + jit;
          ctx.beginPath();
          ctx.moveTo(rx, ry + l * 2.2);
          ctx.quadraticCurveTo(rx + side * len * 0.5, ry - len * 0.24 + jit * 0.5, ex, ey);
          ctx.stroke();
        }
      }
    }
  }
  // central rib on top
  ctx.strokeStyle = css(0.13, 0.34, 0.30);
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(bx, s - 2);
  ctx.quadraticCurveTo(bx + 4, s * 0.5, bx + Math.sin(2.6) * 5, 10);
  ctx.stroke();
  return finishAlphaTexture(c, ctx, 55, 76, 38, false, tone);
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
  // multi-lobe crown: cards cluster around 2-3 offset sub-lobes so the canopy
  // silhouette reads as a broken broadleaf mass, not one lollipop ball
  const lobes = [[0, cy, 0]];
  const nLobes = 2 + ((rng() * 2) | 0);
  for (let li = 1; li < nLobes; li++) {
    const la = rng() * Math.PI * 2;
    lobes.push([Math.cos(la) * (1.2 + rng() * 0.7), cy + (rng() - 0.35) * 1.3,
      Math.sin(la) * (1.2 + rng() * 0.7)]);
  }
  const parts = [];
  for (let i = 0; i < nCards; i++) {
    const lobe = lobes[(rng() * lobes.length) | 0];
    const lr = lobe === lobes[0] ? 1.0 : 0.62; // satellites are smaller
    // direction on a squashed sphere, radius biased outward
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.22 + 0.78 * rng(), 0.75);
    const px = lobe[0] + dx * rad * rx * lr;
    const py = lobe[1] + dy * rad * ry * lr * (dy > 0 ? 1 : 0.8);
    const pz = lobe[2] + dz * rad * rz * lr;
    const wsz = (1.55 + rng() * 0.9) * sizeMul;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    const distC = Math.hypot(px, py - cy, pz) / Math.max(rx, ry);
    const shade = (0.48 + 0.52 * clamp(distC, 0, 1)) // dark core, lit shell
      * (0.9 + 0.2 * clamp((py - cy) / ry * 0.5 + 0.5, 0, 1));
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
    const m = Math.max(4, Math.round(2.8 + rr * 2.7)); // denser tiers: no see-through crowns
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

// --- palm: curved warm-brown trunk + a crown of ARCHED drooping fronds
// (bent tapered planes, dense frond texture) + coconut cluster ---
function buildPalmGeometry(rng) {
  const trunkParts = [];
  const H = 5.6 + rng() * 1.4;
  const leanA = rng() * Math.PI * 2;
  const lean = 0.5 + rng() * 0.5; // total top offset in meters
  const NSEG = 6;
  let px = 0, pz = 0;
  for (let i = 0; i < NSEG; i++) {
    const t0 = i / NSEG, t1 = (i + 1) / NSEG;
    const x0 = Math.cos(leanA) * lean * t0 * t0, z0 = Math.sin(leanA) * lean * t0 * t0;
    const x1 = Math.cos(leanA) * lean * t1 * t1, z1 = Math.sin(leanA) * lean * t1 * t1;
    const segLen = Math.hypot(H / NSEG, x1 - x0, z1 - z0) * 1.04;
    const seg = new THREE.CylinderGeometry(
      0.13 + (1 - t1) * 0.10, 0.14 + (1 - t0) * 0.10, segLen, 7, 1);
    // ring-band illusion: alternating leaf-scar bands in warm brown
    _c.setHSL(0.072, 0.30, (i % 2 ? 0.255 : 0.325) + rng() * 0.03, THREE.SRGBColorSpace);
    seg.rotateZ(Math.atan2(x1 - x0, H / NSEG) * -1);
    seg.rotateY(-leanA);
    seg.translate((x0 + x1) / 2, (t0 + t1) * 0.5 * H, (z0 + z1) / 2);
    trunkParts.push(paintFlat(seg, _c.clone(), t1 * 0.2));
    px = x1; pz = z1;
  }
  // fiber collar under the crown
  const collar = new THREE.CylinderGeometry(0.30, 0.19, 0.6, 7, 1);
  collar.translate(px, H - 0.15, pz);
  _c.setHSL(0.082, 0.32, 0.22, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(collar, _c.clone(), 0.2));
  // coconut cluster nestled at the crown base
  for (let k = 0; k < 4 + ((rng() * 3) | 0); k++) {
    const a = rng() * Math.PI * 2;
    const nut = new THREE.IcosahedronGeometry(0.13 + rng() * 0.05, 0);
    nut.translate(px + Math.cos(a) * (0.22 + rng() * 0.14), H + 0.02 + rng() * 0.16,
      pz + Math.sin(a) * (0.22 + rng() * 0.14));
    _c.setHSL(0.09, 0.38, 0.22 + rng() * 0.08, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(nut, _c.clone(), 0.3));
  }

  // arched frond: tapered plane bent along its length — rises from the crown,
  // arcs over and droops at the tip. Built per-frond so the canopy is a mass.
  function frond(a, phi0, phiTip, len, wBase, shade, dead) {
    const SEGS = 6;
    const g = new THREE.PlaneGeometry(1, 1, 1, SEGS);
    const p = g.attributes.position;
    // bend: integrate the frond direction along the arc; x stays width axis
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5; // 0..1 along the frond
      const w = (1 - t * 0.8) * wBase; // taper toward the tip
      let ry = 0, rf = 0;
      const steps = 12;
      const dl = (len * t) / steps;
      for (let sIt = 0; sIt < steps; sIt++) {
        const tt = ((sIt + 0.5) / steps) * t;
        const ph = phi0 + (phiTip - phi0) * tt * tt;
        rf += Math.cos(ph) * dl;
        ry += Math.sin(ph) * dl;
      }
      p.setXYZ(i, p.getX(i) * w, ry, rf);
    }
    g.computeVertexNormals();
    const rotY = new THREE.Matrix4().makeRotationY(a);
    g.applyMatrix4(rotY);
    g.translate(px, H + 0.18, pz);
    const nv = p.count;
    const col = new Float32Array(nv * 3);
    const fl = new Float32Array(nv);
    if (dead) _c.setHSL(0.095, 0.30, 0.28, THREE.SRGBColorSpace);
    else _c.setHSL(0.228 + (rng() - 0.5) * 0.025, 0.32, 0.5, THREE.SRGBColorSpace);
    const uvA = g.attributes.uv;
    for (let i = 0; i < nv; i++) {
      const t = uvA.getY(i); // 0..1 along the frond length
      const m = dead ? 1 : 1.55 * shade;
      col[i * 3] = _c.r * m; col[i * 3 + 1] = _c.g * m; col[i * 3 + 2] = _c.b * m;
      fl[i] = dead ? 0.25 : 0.30 + t * 0.45;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
    // sky-lit normals: outward + strong up bias, like the other canopies
    const nrm = g.attributes.normal;
    _v3.set(Math.sin(a) * 0.45, 1.35, Math.cos(a) * 0.45).normalize();
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, _v3.x, _v3.y, _v3.z);
    return g;
  }

  const cardParts = [];
  const n = 11 + ((rng() * 4) | 0);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.45;
    // alternate steep/shallow launch angles => layered dome-shaped crown
    const steep = k % 2 === 0;
    const phi0 = steep ? 0.95 + rng() * 0.25 : 0.55 + rng() * 0.25; // up from horizontal
    const phiTip = -(0.5 + rng() * 0.7); // tips droop below horizontal
    const len = 3.4 + rng() * 1.2;
    const shade = 0.7 + (steep ? 0.3 : 0.12) + rng() * 0.1;
    cardParts.push(frond(a, phi0, phiTip, len, 1.9, shade, false));
  }
  // 2-3 hanging dead fronds against the trunk
  for (let k = 0; k < 2 + ((rng() * 2) | 0); k++) {
    const a = rng() * Math.PI * 2;
    cardParts.push(frond(a, -0.9 - rng() * 0.3, -1.45, 2.3, 1.1, 0.6, true));
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
  // 4-5 unequal lobes with strong offsets: broken asymmetric broadleaf mass
  // (the old 3 near-equal blobs read as the same broccoli clone on every
  // mid-distance tree), with a deeper shade gradient bottom -> crown
  const nLobes = 4 + ((rng() * 2) | 0);
  for (let b = 0; b < nLobes; b++) {
    const big = b === 0 ? 1 : 0.62 + rng() * 0.32;
    const blob = new THREE.IcosahedronGeometry((1.25 + rng() * 0.6) * big, 1);
    jitterRadial(blob, rng, 0.34);
    blob.scale(1.1 + rng() * 0.3, 0.72 + rng() * 0.25, 1.1 + rng() * 0.3);
    sphereNormals(blob, 0, 0, 0, 1.0); // smooth sunlit crown, no black facets
    blob.translate((rng() - 0.5) * 2.2, 4.15 + (rng() - 0.45) * 1.7 - (1 - big) * 0.7,
      (rng() - 0.5) * 2.2);
    canopyParts.push(paintCanopy(blob, hue, sat, l0 * 0.82, l1, 2.3, 5.9, rng, 0.3));
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
  const trunk = new THREE.CylinderGeometry(0.13, 0.24, H, 5, 1);
  trunk.translate(0.25, H / 2, 0);
  trunk.rotateZ(-0.06);
  _c.setHSL(0.072, 0.30, 0.27, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  // crown: flattened jittered dome reads as a frond mass at range
  const disc = new THREE.IcosahedronGeometry(2.2, 1);
  jitterRadial(disc, rng, 0.3);
  disc.scale(1.2, 0.32, 1.2);
  sphereNormals(disc, 0, 0, 0, 1.2);
  disc.translate(0.35, H + 0.15, 0);
  canopyParts.push(paintCanopy(disc, cp.hue ?? 0.228, cp.sat ?? 0.30,
    cp.l0 ?? 0.21, cp.l1 ?? 0.33, H - 0.5, H + 0.8, rng, 0.4));
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
  // Camera forward (unit) — drives the sniper center-cone grass clear-out.
  const uCamFwd = { value: new THREE.Vector3(0, 0, 1) };

  // ---- grass materials (shared hook, per-material fade distance) ----
  const grassWindHook = (farDist) => (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uGrassFar = { value: farDist };
    shader.uniforms.uSniperFade = uSniperFade;
    shader.uniforms.uCamFwd = uCamFwd;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nuniform vec3 uCamPos;\nuniform float uGrassFar;\nuniform float uSniperFade;\nuniform vec3 uCamFwd;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 giw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float dCam = distance(giw.xyz, uCamPos);
        // wide scale-out band (last ~third of the range): tufts shrink away
        // gradually instead of cutting to flat albedo on a visible line
        float gfade = 1.0 - smoothstep(uGrassFar * 0.66, uGrassFar, dCam);
        // sniper scope (WoT keeps the scoped picture clean): the trunnion-
        // height camera stares OVER meter-tall blades, so the old 7-15 m
        // suppression still let midfield grass flood 30-60% of the sight at
        // x2-x8. Widen the near band to 30 m AND clear a center cone — blades
        // within ~3-6 m of the view ray out to ~90 m shrink away; off-axis
        // and far grass keeps the meadow context around the scope edges.
        float nearBand = smoothstep(12.0, 30.0, dCam);
        float dRay = length(cross(giw.xyz - uCamPos, uCamFwd));
        float rayBand = 1.0 - (1.0 - smoothstep(2.6, 6.0, dRay)) * (1.0 - smoothstep(90.0, 130.0, dCam));
        gfade *= mix(1.0, nearBand * rayBand, uSniperFade);
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
      map: tex, alphaTest: 0.44, side: THREE.DoubleSide,
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
      matMid: makeGrassMaterial(grassTex[gv], GRASS_FADE_END, 'world-grass-wind-v5'),
      matNear: makeGrassMaterial(grassTex[gv], CARPET_FAR, 'world-grass-carpet-v5'),
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
    // sparse-biome ecology (desert scrub / winter litter): confetti-uniform
    // scatter reads as noise dots — gate placement behind a low-frequency
    // mask so growth clusters in hollows and along moisture lines, with only
    // stray outliers between the clumps
    if (veg.grassDensity < 0.5) {
      const clump = smoothstepJs(0.38, 0.62, sn.n2);
      if (clJ > clump * 0.92 + 0.08) return null;
    }
    const vv = varJ < (0.75 - dry * 0.5) ? 0 : 1;
    const y = heightField.getHeightAt(x, z);
    // toned to sit on the terrain grass albedo so the far scale-out is
    // invisible (tufts must NOT read brighter than the ground they stand on)
    let th = 0.225 + (hueJ - 0.5) * 0.045 - dry * 0.08;
    let ts = 0.30 - dry * 0.11;
    let tl = 0.425 + (lumJ - 0.5) * 0.15 + dry * 0.04;
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
  // Every tree material carries the per-instance occlusion fade (aFadeI,
  // 0 = solid → 1 = dithered to ~12%) plus a near-camera dissolve: WoT fades
  // any tree standing between the chase camera and the vehicle — without it,
  // forest routes hide the player tank behind full-screen canopy walls, and
  // cards inside the orbit radius degrade to giant flat unlit sheets.
  const treeWindHook = (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nattribute float aFlex;\nattribute float aFadeI;\nvarying float vFadeI;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 tiw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = tiw.x * 0.043 + tiw.z * 0.051;
        float amp = aFlex * 0.14;
        transformed.x += amp * (sin(uWindTime * 1.15 + ph) + 0.45 * sin(uWindTime * 2.63 + ph * 1.7));
        transformed.z += amp * 0.7 * cos(uWindTime * 0.97 + ph * 1.3);
        vFadeI = aFadeI;
      }`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying float vFadeI;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
      #include <alphatest_fragment>
      {
        // camera-occlusion fade (per-instance) + near-camera card dissolve.
        // Screen-space dither keeps the opaque/alpha-tested pipeline (depth
        // writes stay correct — no sorting, no blend halos).
        float fadeKeep = 1.0 - 0.88 * vFadeI;
        fadeKeep *= smoothstep(1.5, 4.2, length(vViewPosition));
        if (fadeKeep < 0.9995) {
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (ign > fadeKeep) discard;
        }
      }`);
  };
  const foliageWindHook = (shader) => {
    treeWindHook(shader);
    useAttributeNormal(shader);
    // SNIPER FOLIAGE FADE (controls_gunnery r2): WoT fades the bush the
    // player is scoped inside — screen-door-dither leaf fragments within
    // ~10 m of the camera while uSniperFade > 0 (same eased uniforms as the
    // grass suppression; zero cost in arcade mode where vFolKeep == 1.0).
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uSniperFade = uSniperFade;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform vec3 uCamPos;\nuniform float uSniperFade;\nvarying float vFolKeep;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <project_vertex>', /* glsl */`
      {
        vec4 fiw = instanceMatrix * vec4(transformed, 1.0);
        vFolKeep = mix(1.0, smoothstep(4.0, 10.0, distance(fiw.xyz, uCamPos)), uSniperFade);
      }
      #include <project_vertex>`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying float vFolKeep;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
      #include <alphatest_fragment>
      if (vFolKeep < 0.999) {
        float fdit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (fdit >= vFolKeep) discard;
      }`);
  };
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0 });
  barkMat.envMapIntensity = 0.85;
  engineCtx.setupShadowMaterial(barkMat, treeWindHook);
  barkMat.customProgramCacheKey = () => 'world-tree-bark-v4';

  // far canopy: own material — strong sky/env fill acts as the fake-SSS
  // backlight term so shaded crown sides stay green, never crushed black
  const canopyFarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 });
  canopyFarMat.envMapIntensity = 1.35;
  engineCtx.setupShadowMaterial(canopyFarMat, treeWindHook);
  canopyFarMat.customProgramCacheKey = () => 'world-tree-canopyfar-v5';

  // species registry: texture + near/far geometry builders, seed bases keep
  // the classic verdant set bit-identical to the pre-config build
  const SPECIES = {
    pine: {
      texSeed: 52, nearSeed: 61, farSeed: 71,
      tex: (r, pal) => makeNeedleSprayTexture(r, pal.texTone || null),
      near: (k, pal) => ({
        trunk: buildPineTrunk(mulberry32(seed + 61 + k)),
        cards: buildPineCards(mulberry32(seed + 63 + k), 0.60, 1.0, pal),
      }),
      far: (r, pal) => buildPineFarGeometry(r, pal),
    },
    oak: {
      texSeed: 51, nearSeed: 65, farSeed: 73,
      tex: (r, pal) => makeLeafClusterTexture(r, pal.texTone || null),
      near: (k, pal) => ({
        trunk: buildBroadleafTrunk(mulberry32(seed + 65 + k)),
        cards: buildBroadleafCards(mulberry32(seed + 67 + k), 58, 1.0, pal),
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
      map: foliageTex[sp], alphaTest: 0.38, side: THREE.DoubleSide,
      vertexColors: true, roughness: 1.0, metalness: 0.0,
    });
    fm.envMapIntensity = 0.85; // keep ambient on shaded leaves — no black cards
    engineCtx.setupShadowMaterial(fm, foliageWindHook);
    fm.customProgramCacheKey = () => 'world-tree-foliage-v5-' + sp;
    foliageMats[sp] = fm;
    // alpha-tested shadow casting: without this every card shadows as a quad
    foliageDepthMats[sp] = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: foliageTex[sp], alphaTest: 0.38,
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
    // height variance clamped tight (no needle-thin scaling-bug giants)
    _m4.compose(_pv.set(x, y - 0.06, z), _q, _sv.set(sc, sc * (0.92 + rng() * 0.16), sc));
    // per-tree hue/value jitter, WIDE: identical-sibling canopies are the
    // loudest mid-distance tell, so value swings ~2x and hue drifts between
    // yellow-green and blue-green per instance
    const vj = 0.58 + rng() * 0.42;
    _c.setRGB(vj * (0.88 + rng() * 0.26), vj * (0.96 + rng() * 0.22), vj * (0.84 + rng() * 0.24));
    trees.push({
      x, z, species, variant: (rng() * 2) | 0, mat: _m4.clone(), tint: _c.clone(), near: false,
      // occlusion-fade bookkeeping: canopy proxy sphere (world center/radius,
      // generous enough for every species' card spread), eased fade 0..1 and
      // the instance slot assigned by the current near partition (-1 = far).
      cy: y + 4.4 * sc, cr: 2.9 * sc, fade: 0, slot: -1,
    });
    if (withObstacle) {
      treeObstacles.push({ min: [x - 0.55, y, z - 0.55], max: [x + 0.55, y + 3.2 * sc, z + 0.55] });
      concealers.push({ x, z, r: 2.3 * sc, add: 0.13 }); // canopy soft-conceals
    }
  }
  function addTree(x, z, species) {
    if (!siteOk(x, z, 0)) return false;
    pushTree(x, z, species, 0.95, 1.7, true); // wide size spread per stand
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
      pushTree(x, z, rng() < 0.85 ? species : pickSpecies(veg.rimMix, rng()), 1.5, 2.1, false);
    }
  }

  // near/far instanced meshes (partition rewritten on camera movement, hysteresis).
  // Each LOD is a trunk mesh (opaque bark) + a card mesh (alpha foliage) sharing
  // the same instance matrices.
  function makeTreeMesh(geo, mat, sp, isFoliage) {
    // per-instance occlusion fade — EVERY geometry drawn with the tree hooks
    // must carry the attribute (near meshes are updated live; far meshes stay
    // zero — a tree within camera range is always in the near partition)
    if (!geo.getAttribute('aFadeI')) {
      const fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(trees.length), 1);
      fadeAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFadeI', fadeAttr);
    }
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
      // hull-height concealers: foliage reaches ~2.5-3 m so a parked tank is
      // genuinely occluded (knee-high shrubs sold zero visual concealment)
      const sc = 1.6 + rng() * 1.6;
      _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
      _m4.compose(_pv.set(x, y - 0.05, z), _q, _sv.set(sc, sc * (1.05 + rng() * 0.35), sc));
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
    for (let i = 0; i < 470; i++) { // scattered field bushes, mild roadside bias
      const x = (rng() * 2 - 1) * 455, z = (rng() * 2 - 1) * 455;
      const rd = heightField._roadDist(x, z);
      if (rd > 26 && rng() > 0.55) continue;
      addBush(x, z);
    }
    // midfield concealment clumps: 4-6 bushes over a ~10-12 m spread so a
    // parked tank is at least half-occluded from ground level
    for (let c = 0; c < 58; c++) {
      const x = (rng() * 2 - 1) * 420, z = (rng() * 2 - 1) * 420;
      const n = 4 + (rng() * 3) | 0;
      for (let i = 0; i < n; i++) {
        addBush(x + (rng() - 0.5) * 11, z + (rng() - 0.5) * 11);
      }
    }
    for (let bv = 0; bv < 2; bv++) {
      if (bushPlacements[bv].length === 0) continue;
      // bushes share the hooked foliage material → need the fade attribute
      // too (all zeros: bushes are hull-height cover, never camera-occluders)
      bushGeos[bv].setAttribute('aFadeI',
        new THREE.InstancedBufferAttribute(new Float32Array(bushPlacements[bv].length), 1));
      const m = new THREE.InstancedMesh(bushGeos[bv], foliageMats[bushSpecies], bushPlacements[bv].length);
      for (let i = 0; i < bushPlacements[bv].length; i++) {
        m.setMatrixAt(i, bushPlacements[bv][i]);
        // darker, near-neutral multipliers: the old 0.8-1.1 range let lit
        // bushes glow saturated pure green against the graded terrain and
        // read as pasted-in — sit them INTO the field tone instead
        const bj = 0.52 + rng() * 0.34;
        _c.setRGB(bj * (0.94 + rng() * 0.14), bj * (0.98 + rng() * 0.14), bj * (0.90 + rng() * 0.16));
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

  // ---- chase-camera foliage occlusion fade -------------------------------
  // WoT behavior: any tree standing between the camera and the player's tank
  // fades to near-transparency so the third-person loop stays readable on
  // forest routes. Each frame the pivot→camera segment is swept against every
  // near tree's canopy proxy sphere; intersecting trees ease toward fade = 1
  // (dithered to ~12% in the shader), everything else eases back to 0.
  const OCCL_TAU_S = 0.13;  // ease time constant (≈150 ms feel, like uSniperFade)
  const OCCL_PAD_M = 1.1;   // canopy-sphere pad — cards jut past the fit sphere
  const OCCL_BOX_PAD = 12;  // XZ broadphase reject (max near-tree cr + pad)
  let occlAny = false;      // skip the sweep entirely once everything settled
  const _dirtyFadeAttrs = new Set();
  function writeTreeFade(t) {
    for (const m of nearMeshes[t.species][t.variant]) {
      const attr = m.geometry.attributes.aFadeI;
      attr.array[t.slot] = t.fade;
      _dirtyFadeAttrs.add(attr);
    }
  }
  function updateOcclusionFade(dt, camPos, focusPos) {
    const active = focusPos !== null && focusPos !== undefined;
    if (!active && !occlAny) return;
    // dt = 0 (shot mode / deterministic captures) snaps: harness stays exact.
    const k = dt > 0 ? 1 - Math.exp(-dt / OCCL_TAU_S) : 1;
    let any = false;
    let ax = 0, ay = 0, az = 0, dx = 0, dy = 0, dz = 0, segLen2 = 0;
    let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
    if (active) {
      ax = focusPos.x; ay = focusPos.y; az = focusPos.z;
      dx = camPos.x - ax; dy = camPos.y - ay; dz = camPos.z - az;
      segLen2 = dx * dx + dy * dy + dz * dz;
      minX = Math.min(ax, camPos.x) - OCCL_BOX_PAD;
      maxX = Math.max(ax, camPos.x) + OCCL_BOX_PAD;
      minZ = Math.min(az, camPos.z) - OCCL_BOX_PAD;
      maxZ = Math.max(az, camPos.z) + OCCL_BOX_PAD;
    }
    for (const t of trees) {
      let target = 0;
      if (active && t.near && t.x > minX && t.x < maxX && t.z > minZ && t.z < maxZ) {
        // closest point on the pivot→camera segment to the canopy center
        let s = segLen2 > 1e-6
          ? ((t.x - ax) * dx + (t.cy - ay) * dy + (t.z - az) * dz) / segLen2
          : 0;
        s = s < 0 ? 0 : (s > 1 ? 1 : s);
        const px = ax + dx * s - t.x;
        const py = ay + dy * s - t.cy;
        const pz = az + dz * s - t.z;
        const rr = t.cr + OCCL_PAD_M;
        if (px * px + py * py + pz * pz < rr * rr) target = 1;
      }
      if (t.fade !== target) {
        t.fade += (target - t.fade) * k;
        if (Math.abs(t.fade - target) < 0.02) t.fade = target;
        if (t.slot >= 0) writeTreeFade(t);
      }
      if (t.fade !== 0) any = true;
    }
    occlAny = any;
    if (_dirtyFadeAttrs.size > 0) {
      for (const attr of _dirtyFadeAttrs) attr.needsUpdate = true;
      _dirtyFadeAttrs.clear();
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
        t.slot = i;
        for (const m of nearMeshes[t.species][t.variant]) {
          m.setMatrixAt(i, t.mat);
          m.setColorAt(i, t.tint);
          m.geometry.attributes.aFadeI.array[i] = t.fade;
        }
      } else {
        t.slot = -1;
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
          m.geometry.attributes.aFadeI.needsUpdate = true;
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

  function update(dt, camPos, camFwd = null, focusPos = null) {
    uWindTime.value += dt;
    uCamPos.value.copy(camPos);
    if (camFwd) uCamFwd.value.copy(camFwd);
    uSniperFade.value += (sniperFadeTarget - uSniperFade.value) *
      (1 - Math.exp(-(dt || 0) / 0.08));
    for (const gc of grassChunks) {
      const d = Math.max(0, Math.hypot(camPos.x - gc.cx, camPos.z - gc.cz) - CHUNK_SIZE * 0.71);
      // continuous density rolloff (no stepped 1 -> 0.45 pop at 64 m)
      let frac = d < GRASS_FADE_END ? 1 - 0.52 * smoothstepJs(62, 205, d) : 0;
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
    updateOcclusionFade(dt, camPos, focusPos);
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
