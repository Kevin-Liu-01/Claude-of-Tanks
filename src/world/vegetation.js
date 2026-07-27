// src/world/vegetation.js — instanced vegetation with GPU wind.
// Trees are built from alpha-carded foliage planes (canvas leaf-cluster
// textures) on branched trunks — not cone/blob primitives. Grass is a dense
// camera-centred instanced carpet (cell-cached, deterministic) layered over a
// sparser map-wide midfield scatter.
// Contract: docs/ARCHITECTURE.md §3.2; visuals per docs/research/graphics-aaa.md §8.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { _LAYOUT, sampleSplatNoise } from './terrain.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const HALF = 512;
const CHUNKS = 8, CHUNK_SIZE = 128;
const GRASS_PER_CHUNK = 5200;          // midfield scatter (map-wide, cheap)
const GRASS_FADE_END = 118;
// near carpet: camera-centred cells, dense
const CARPET_CELL = 14;
const CARPET_RING = 3;                 // (2R+1)^2 = 49 cells around the camera
const CARPET_PER_CELL = 460;           // attempts per cell (filters thin it)
const CARPET_FAR = 54;                 // shader fade distance
const CARPET_CAP = 12000;              // instances per tuft variant
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

function finishAlphaTexture(c, ctx, floodR, floodG, floodB, radialFalloff = false) {
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
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Two tuft variants: 0 = lush meadow tuft, 1 = drier mixed tuft. Dense at the
// root line, ragged at the top so minified mips fade the card edges instead of
// exposing a translucent rectangle.
function makeGrassCardTexture(rng, variant) {
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
  return finishAlphaTexture(c, ctx, 74, 88, 42);
}

// Broadleaf foliage card: dozens of small leaf-ellipse clumps, centre-heavy so
// card silhouettes stay ragged; brighter toward the top (sun side).
function makeLeafClusterTexture(rng) {
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
    const l = 0.15 + sun * 0.14 + rng() * 0.11;
    const hue = 0.23 + rng() * 0.05;
    ctx.fillStyle = css(hue, 0.27 + rng() * 0.11, l);
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
  return finishAlphaTexture(c, ctx, 58, 74, 34, true);
}

// Conifer foliage card: fanned needle sprays, dark blue-green.
function makeNeedleSprayTexture(rng) {
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
    ctx.strokeStyle = css(0.34 + rng() * 0.04, 0.26 + rng() * 0.12, 0.16 + sun * 0.14 + rng() * 0.09);
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
  return finishAlphaTexture(c, ctx, 52, 68, 48, true);
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

function buildBroadleafCards(rng, nCards, sizeMul) {
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
      0.255 + (rng() - 0.5) * 0.03, 0.34 + rng() * 0.1, 0.30 + rad * 0.65, 0, cy, 0));
  }
  // a couple of low cards hanging near the branch collar
  for (let i = 0; i < Math.max(2, nCards >> 4); i++) {
    const a = rng() * Math.PI * 2, rr = 0.9 + rng() * 0.9;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    parts.push(foliageCard(1.3 * sizeMul, 1.0 * sizeMul, Math.cos(a) * rr, 2.9 + rng() * 0.6, Math.sin(a) * rr,
      _e, 0.5, 0.26, 0.36, 0.35, 0, cy, 0));
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

function buildPineCards(rng, tierStep, sizeMul) {
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
        _e, shade, 0.36 + (rng() - 0.5) * 0.02, 0.30 + rng() * 0.08, 0.15 + Math.pow(t, 1.5) * 0.65,
        0, y - 0.6, 0));
    }
  }
  // vertical leader cards at the top
  for (let k = 0; k < 2; k++) {
    _e.set(0, rng() * Math.PI, 0, 'YXZ');
    parts.push(foliageCard(1.0 * sizeMul, 1.7 * sizeMul, 0, topY - 0.55, 0, _e, 0.9,
      0.36, 0.34, 0.8, 0, topY - 1.6, 0));
  }
  return mergeParts(parts);
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

function buildOakFarGeometry(rng) {
  const parts = [];
  const trunkH = 2.9;
  const trunk = new THREE.CylinderGeometry(0.20, 0.36, trunkH, 5, 1);
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.07, 0.26, 0.17, THREE.SRGBColorSpace);
  parts.push(paintFlat(trunk, _c, 0));
  for (let b = 0; b < 3; b++) {
    const blob = new THREE.IcosahedronGeometry(1.45 + rng() * 0.5, 1);
    jitterRadial(blob, rng, 0.26);
    blob.scale(1.22, 0.85, 1.22);
    blob.translate((rng() - 0.5) * 1.5, 4.1 + (rng() - 0.45) * 1.3, (rng() - 0.5) * 1.5);
    parts.push(paintCanopy(blob, 0.275, 0.34, 0.15, 0.27, 2.6, 5.8, rng, 0.3));
  }
  return mergeParts(parts);
}

function buildPineFarGeometry(rng) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.28, 2.2, 5, 1);
  trunk.translate(0, 1.1, 0);
  _c.setHSL(0.06, 0.28, 0.14, THREE.SRGBColorSpace);
  parts.push(paintFlat(trunk, _c, 0));
  const lobes = [
    { y: 1.4, r: 1.55, h: 2.7 },
    { y: 3.3, r: 1.05, h: 2.3 },
    { y: 5.0, r: 0.60, h: 1.7 },
  ];
  for (const lv of lobes) {
    const cone = new THREE.ConeGeometry(lv.r * (0.9 + rng() * 0.2), lv.h, 8, 2);
    jitterRadial(cone, rng, 0.18);
    cone.translate(0, lv.y + lv.h / 2, 0);
    parts.push(paintCanopy(cone, 0.36, 0.28, 0.145, 0.26, 1.2, 6.6, rng, 0.35));
  }
  return mergeParts(parts);
}

// squat card clump for hedgerow/field bushes
function buildBushCards(rng) {
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
      _e, 0.4 + 0.5 * rad, 0.26 + (rng() - 0.5) * 0.04, 0.32, 0.22, 0, cy, 0));
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
 * @returns {{group:THREE.Group, update:function(number,THREE.Vector3):void,
 *   setWindTime:function(number):void, treeObstacles:Array<{min:number[],max:number[]}>}}
 */
export function createVegetation(heightField, engineCtx, seed = 2001) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'vegetation';
  const v = _LAYOUT.village;

  const uWindTime = { value: 0 };
  const uCamPos = { value: new THREE.Vector3(0, 0, 0) };

  // ---- grass materials (shared hook, per-material fade distance) ----
  const grassWindHook = (farDist) => (shader) => {
    shader.uniforms.uWindTime = uWindTime;
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uGrassFar = { value: farDist };
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nuniform vec3 uCamPos;\nuniform float uGrassFar;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 giw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float gfade = 1.0 - smoothstep(uGrassFar - 16.0, uGrassFar, distance(giw.xyz, uCamPos));
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
    makeGrassCardTexture(mulberry32(seed + 41), 0),
    makeGrassCardTexture(mulberry32(seed + 42), 1),
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
  // [x, y, z, yaw, sxz, sy, r, g, b, variant]
  function makeTuft(x, z, crng, carpet) {
    if (Math.max(Math.abs(x), Math.abs(z)) > 474) return null;
    const roll = crng(), yaw = crng() * Math.PI * 2;
    const sxz = 0.74 + crng() * 0.62;
    let sy = 0.55 + crng() * 0.85;
    const hueJ = crng(), lumJ = crng(), varJ = crng(), clJ = crng();
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
    _c.setHSL(
      0.23 + (hueJ - 0.5) * 0.045 - dry * 0.08,
      0.37 - dry * 0.13,
      0.49 + (lumJ - 0.5) * 0.16 + dry * 0.04,
    );
    return [x, y - 0.03, z, yaw, sxz, sy, _c.r, _c.g, _c.b, vv];
  }

  function writeTuft(mesh, i, t) {
    _q.setFromAxisAngle(_up, t[3]);
    _m4.compose(_pv.set(t[0], t[1], t[2]), _q, _sv.set(t[4], t[5], t[4]));
    mesh.setMatrixAt(i, _m4);
    _c.setRGB(t[6], t[7], t[8]);
    mesh.setColorAt(i, _c);
  }

  // ---- midfield grass scatter (map-wide chunks, unchanged system) ----
  const grassChunks = [];
  for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) {
    const crng = mulberry32((seed ^ (cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const x0 = -HALF + cx * CHUNK_SIZE, z0 = -HALF + cz * CHUNK_SIZE;
    const tufts = [[], []];
    for (let i = 0; i < GRASS_PER_CHUNK; i++) {
      const t = makeTuft(x0 + crng() * CHUNK_SIZE, z0 + crng() * CHUNK_SIZE, crng, false);
      if (t) tufts[t[9]].push(t);
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
  const carpetCache = new Map(); // "ix,iz" -> [tuft, ...]
  function carpetCell(ix, iz) {
    const key = ix + ',' + iz;
    let cell = carpetCache.get(key);
    if (cell) return cell;
    cell = [];
    const crng = mulberry32((seed ^ 0x51ab ^ (ix * 374761393) ^ (iz * 668265263)) >>> 0);
    const x0 = ix * CARPET_CELL, z0 = iz * CARPET_CELL;
    for (let i = 0; i < CARPET_PER_CELL; i++) {
      const t = makeTuft(x0 + crng() * CARPET_CELL, z0 + crng() * CARPET_CELL, crng, true);
      if (t) { t[4] *= 0.92; t[5] *= 0.9; cell.push(t); }
    }
    carpetCache.set(key, cell);
    if (carpetCache.size > 260) carpetCache.delete(carpetCache.keys().next().value);
    return cell;
  }
  const _carpetLast = new THREE.Vector3(1e9, 0, 0);
  function rebuildCarpet(camPos) {
    const cix = Math.floor(camPos.x / CARPET_CELL), ciz = Math.floor(camPos.z / CARPET_CELL);
    const counts = [0, 0];
    for (let dz = -CARPET_RING; dz <= CARPET_RING; dz++) {
      for (let dx = -CARPET_RING; dx <= CARPET_RING; dx++) {
        const cell = carpetCell(cix + dx, ciz + dz);
        for (let i = 0; i < cell.length; i++) {
          const t = cell[i];
          const vv = t[9];
          if (counts[vv] >= CARPET_CAP) continue;
          writeTuft(carpetMeshes[vv], counts[vv]++, t);
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
  barkMat.envMapIntensity = 0.85; // far canopies share this — keep backlit sides readable
  engineCtx.setupShadowMaterial(barkMat, treeWindHook);
  barkMat.customProgramCacheKey = () => 'world-tree-bark-v3';

  const foliageTex = {
    oak: makeLeafClusterTexture(mulberry32(seed + 51)),
    pine: makeNeedleSprayTexture(mulberry32(seed + 52)),
  };
  const foliageMats = {};
  const foliageDepthMats = {};
  for (const sp of ['oak', 'pine']) {
    const fm = new THREE.MeshStandardMaterial({
      map: foliageTex[sp], alphaTest: 0.45, side: THREE.DoubleSide,
      vertexColors: true, roughness: 1.0, metalness: 0.0,
    });
    fm.envMapIntensity = 0.55; // keep ambient on shaded leaves — no black cards
    engineCtx.setupShadowMaterial(fm, foliageWindHook);
    fm.customProgramCacheKey = () => 'world-tree-foliage-v3-' + sp;
    foliageMats[sp] = fm;
    // alpha-tested shadow casting: without this every card shadows as a quad
    foliageDepthMats[sp] = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: foliageTex[sp], alphaTest: 0.45,
    });
  }

  // near geometry: 2 variants per species; far geometry: 1 per species
  const treeGeo = {
    pine: [0, 1].map((k) => ({
      trunk: buildPineTrunk(mulberry32(seed + 61 + k)),
      cards: buildPineCards(mulberry32(seed + 63 + k), 0.72, 1.0),
    })),
    oak: [0, 1].map((k) => ({
      trunk: buildBroadleafTrunk(mulberry32(seed + 65 + k)),
      cards: buildBroadleafCards(mulberry32(seed + 67 + k), 46, 1.0),
    })),
  };
  const treeGeoFar = {
    pine: buildPineFarGeometry(mulberry32(seed + 71)),
    oak: buildOakFarGeometry(mulberry32(seed + 73)),
  };

  // placement: clusters + lone trees + horizon rim forest
  const clusters = [];
  const trees = []; // { x,z,species,variant, mat: Matrix4, tint: Color, near: bool }
  const treeObstacles = [];
  function siteOk(x, z, margin) {
    if (Math.max(Math.abs(x), Math.abs(z)) > 455) return false;
    if (x > v.x0 - 24 && x < v.x1 + 24 && z > v.z0 - 24 && z < v.z1 + 24) return false;
    if (heightField._roadDist(x, z) < 9 + margin) return false;
    if (heightField.getGroundType(x, z) === 'soft') return false;
    for (const s of [_LAYOUT.spawns.player, ..._LAYOUT.spawns.enemies]) {
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
    }
  }
  function addTree(x, z, species) {
    if (!siteOk(x, z, 0)) return false;
    pushTree(x, z, species, 1.15, 1.9, true);
    return true;
  }
  let attempts = 0;
  while (clusters.length < 24 && attempts++ < 800) {
    const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
    if (!siteOk(x, z, 6)) continue;
    let far = true;
    for (const c of clusters) if (Math.hypot(x - c.x, z - c.z) < c.r + 42) { far = false; break; }
    if (!far) continue;
    const r = 18 + rng() * 26;
    const species = rng() < 0.55 ? 'pine' : 'oak';
    const n = 12 + (rng() * 18) | 0;
    let placed = 0;
    for (let i = 0; i < n * 3 && placed < n; i++) {
      const a = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
      const sp = rng() < 0.8 ? species : (species === 'pine' ? 'oak' : 'pine');
      if (addTree(x + Math.cos(a) * rr, z + Math.sin(a) * rr, sp)) placed++;
    }
    if (placed > 2) clusters.push({ x, z, r });
  }
  for (let i = 0, placed = 0; i < 380 && placed < 55; i++) { // lone trees
    const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
    if (addTree(x, z, rng() < 0.5 ? 'pine' : 'oak')) placed++;
  }
  // horizon rim forest: dense clustered blocks on the raised map border so
  // distant ridgelines carry massed silhouettes instead of scattered lollipops
  for (let c = 0; c < 44; c++) {
    const a = (c / 44) * Math.PI * 2 + rng() * 0.14;
    const rad = 442 + rng() * 52;
    const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
    if (Math.max(Math.abs(cx), Math.abs(cz)) > 502) continue;
    const species = rng() < 0.7 ? 'pine' : 'oak';
    const n = 10 + (rng() * 12) | 0;
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 52, z = cz + (rng() - 0.5) * 52;
      if (Math.max(Math.abs(x), Math.abs(z)) > 506) continue;
      pushTree(x, z, rng() < 0.85 ? species : 'oak', 1.6, 2.7, false);
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
  for (const sp of ['pine', 'oak']) {
    nearMeshes[sp] = treeGeo[sp].map((g) => [
      makeTreeMesh(g.trunk, barkMat, sp, false),
      makeTreeMesh(g.cards, foliageMats[sp], sp, true),
    ]);
    farMeshes[sp] = [makeTreeMesh(treeGeoFar[sp], barkMat, sp, false)];
  }

  // ---- bushes (hedgerow / field-edge cover, purely visual) ----
  {
    const bushGeos = [buildBushCards(mulberry32(seed + 31)), buildBushCards(mulberry32(seed + 32))];
    const bushPlacements = [[], []];
    function addBush(x, z) {
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) return;
      if (heightField._roadDist(x, z) < 6) return;
      if (heightField.getGroundType(x, z) === 'soft') return;
      if (heightField.getNormalAt(x, z).y < 0.78) return;
      const y = heightField.getHeightAt(x, z);
      const sc = 0.9 + rng() * 1.3;
      _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
      _m4.compose(_pv.set(x, y - 0.05, z), _q, _sv.set(sc, sc * (0.8 + rng() * 0.3), sc));
      bushPlacements[(rng() * 2) | 0].push(_m4.clone());
    }
    for (const c of clusters) { // fringe bushes around each tree cluster
      const n = 5 + (rng() * 6) | 0;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, rr = c.r * (1.05 + rng() * 0.5);
        addBush(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
      }
    }
    for (let i = 0; i < 150; i++) { // scattered field bushes, roadside bias
      const x = (rng() * 2 - 1) * 455, z = (rng() * 2 - 1) * 455;
      const rd = heightField._roadDist(x, z);
      if (rd > 26 && rng() > 0.30) continue; // favor road fringes
      addBush(x, z);
    }
    for (let bv = 0; bv < 2; bv++) {
      if (bushPlacements[bv].length === 0) continue;
      const m = new THREE.InstancedMesh(bushGeos[bv], foliageMats.oak, bushPlacements[bv].length);
      for (let i = 0; i < bushPlacements[bv].length; i++) {
        m.setMatrixAt(i, bushPlacements[bv][i]);
        _c.setRGB(0.80 + rng() * 0.30, 0.84 + rng() * 0.26, 0.78 + rng() * 0.24);
        m.setColorAt(i, _c);
      }
      m.castShadow = true;
      m.receiveShadow = false; // baked card AO, no per-card CSM self-shadow
      m.matrixAutoUpdate = false;
      m.customDepthMaterial = foliageDepthMats.oak;
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
    const counts = { pine: [0, 0], oak: [0, 0] };
    const farCounts = { pine: 0, oak: 0 };
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
    for (const sp of ['pine', 'oak']) {
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
    for (const gc of grassChunks) {
      const d = Math.max(0, Math.hypot(camPos.x - gc.cx, camPos.z - gc.cz) - CHUNK_SIZE * 0.71);
      let frac = 0;
      if (d < 64) frac = 1;
      else if (d < GRASS_FADE_END) frac = 0.45;
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

  return { group, update, setWindTime, treeObstacles, _clusters: clusters };
}
