// src/world/props.js — rocks, ~10-building village, walls and cover props.
// Contract: docs/ARCHITECTURE.md §3.2. All geometry composed BufferGeometry,
// all textures canvas-generated, everything merged into few draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { applyTone } from './terrain.js';
import { applySourcedBuildings } from './sourcedTextures.js';
import { URBAN_BUILDERS } from './maps/urbanKit.js';
// Build-time-baked licensed models (see tools/bake-props-models.mjs +
// docs/ATTRIBUTION.md). Synchronous import keeps the __GAME_READY contract.
import MODELS from './props-models.json';

// Per-category switch: sourced model vs procedural, set from side-by-side
// screenshot judging on 2026-07-27 (record in docs/ATTRIBUTION.md). Only the
// two winners survive; every losing category (buildings, ruin, rocks, fences,
// hay, haystacks, barrels, trees, tank wrecks) stays procedural and its
// models were removed from the repo.
const SOURCED = {
  sandbags: true, // sandbag emplacements — no procedural equivalent, fits the palette
  poles: true,    // telephone poles with crossarms/insulators/wire beat the plain cylinders
};

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------

function toTexture(px, s, { srgb = false, anisotropy = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  c.getContext('2d').putImageData(new ImageData(px, s, s), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function normalFromHeight(h, s, strength, anisotropy) {
  const px = new Uint8ClampedArray(s * s * 4);
  const H = (x, y) => h[((y + s) % s) * s + ((x + s) % s)];
  const v = new THREE.Vector3();
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    v.set(-dx * strength, -dy * strength, 1).normalize();
    const i = (y * s + x) * 4;
    px[i] = v.x * 127.5 + 127.5; px[i + 1] = v.y * 127.5 + 127.5; px[i + 2] = v.z * 127.5 + 127.5; px[i + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}

const _col = new THREE.Color();

function makePlaster(noi, anisotropy, tone = null) {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const n1 = noi.noise(x * 0.045, y * 0.045) * 0.5 + 0.5;
    const n2 = noi.noise(x * 0.16 + 40, y * 0.16 - 21) * 0.5 + 0.5;
    const stain = smoothstep(0.55, 0.9, noi.noise(x * 0.02 - 90, y * 0.05 + 33) * 0.5 + 0.5);
    const streak = smoothstep(0.60, 0.92, noi.noise(x * 0.11 + 250, y * 0.018 - 7) * 0.5 + 0.5);
    // weathered plaster: mid albedo so full sun never blows it to white
    const l = 0.44 + n1 * 0.08 + n2 * 0.04 - stain * 0.15 - streak * 0.08;
    _col.setHSL(0.085, 0.13 - stain * 0.05, l);
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = n1 * 0.5 + n2 * 0.5;
  }
  applyTone(px, tone);
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 1.2, anisotropy) };
}

function makeRoofTiles(noi, anisotropy, tone = null) {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const rowH = 32, tileW = 42;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const row = Math.floor(y / rowH);
    const off = (row % 2) * tileW * 0.5;
    const tile = Math.floor((x + off) / tileW);
    const tRng = noi.noise(tile * 13.7 + 3, row * 7.9 - 11) * 0.5 + 0.5; // per-tile tone
    const inRowY = (y % rowH) / rowH;
    const inTileX = ((x + off) % tileW) / tileW;
    const gap = (inRowY < 0.10 || inTileX < 0.06) ? 1 : 0;
    const curve = Math.sin(inTileX * Math.PI) * 0.5 + 0.5;
    const wear = noi.noise(x * 0.1 - 60, y * 0.1 + 45) * 0.5 + 0.5;
    _col.setHSL(0.028 + tRng * 0.02, 0.42 - wear * 0.12, (0.26 + tRng * 0.10 + curve * 0.04) * (gap ? 0.45 : 1));
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = gap ? 0.1 : 0.4 + curve * 0.5 + (1 - inRowY) * 0.15;
  }
  applyTone(px, tone);
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 2.4, anisotropy) };
}

function makeStone(noi, anisotropy, tone = null) {
  // Irregular fieldstone coursing (512 px, ~0.35-0.9 m blocks at uvScale 0.5):
  // variable row heights, per-row variable stone widths, wobbled mortar lines
  // and per-stone tone — kills the perfect repeating grid the old texture had.
  const s = 512, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const srng = mulberry32(0x51a7);
  const rowE = [0];
  while (rowE[rowE.length - 1] < s) {
    let nxt = rowE[rowE.length - 1] + 88 + ((srng() * 72) | 0);
    if (s - nxt < 70) nxt = s;
    rowE.push(nxt);
  }
  const nRows = rowE.length - 1;
  const stoneE = [];
  for (let r = 0; r < nRows; r++) {
    const e = [0];
    while (e[e.length - 1] < s) {
      let nxt = e[e.length - 1] + 105 + ((srng() * 125) | 0);
      if (s - nxt < 88) nxt = s;
      e.push(nxt);
    }
    stoneE.push(e);
  }
  for (let y = 0; y < s; y++) {
    let r = 0;
    while (rowE[r + 1] <= y) r++;
    const e = stoneE[r];
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      const wob = noi.noise(x * 0.085 + r * 31, y * 0.085 - 17) * 3.4;
      const dRow = Math.min(y - rowE[r], rowE[r + 1] - y) + wob * 0.6;
      let k = 0;
      while (e[k + 1] <= x) k++;
      const dCol = Math.min(x - e[k], e[k + 1] - x) + wob;
      const edgeD = Math.min(dRow, dCol * 0.9);
      const mortar = edgeD < 3.6 ? 1 : 0;
      const tone = noi.noise(r * 13.3 + k * 29.7 + 3.1, r * 7.7 - k * 11.9) * 0.5 + 0.5;
      const grain = noi.noise(x * 0.11 + 8, y * 0.11 - 77) * 0.5 + 0.5;
      const grime = smoothstep(0.5, 0.95, noi.noise(x * 0.016 + 130, y * 0.028 + 71) * 0.5 + 0.5);
      const bevel = clamp((edgeD - 3.6) / 15, 0, 1);
      _col.setHSL(
        0.081 + tone * 0.014,
        0.06 + tone * 0.055 - grime * 0.02,
        (mortar ? 0.25 + grain * 0.04
          : (0.305 + tone * 0.14 + grain * 0.05) * (0.82 + bevel * 0.18)) - grime * 0.07,
      );
      px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
      hgt[i] = mortar ? 0.12 : (0.48 + tone * 0.26 + grain * 0.16) * (0.55 + 0.45 * bevel);
    }
  }
  applyTone(px, tone);
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 3.0, anisotropy) };
}

function makeWood(noi, anisotropy, tone = null) {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const plankW = 42;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const plank = Math.floor(x / plankW);
    const tone = noi.noise(plank * 23.7, plank * 9.1 + 4) * 0.5 + 0.5;
    const inX = (x % plankW) / plankW;
    const gapped = inX < 0.07 ? 1 : 0;
    const grain = noi.noise(x * 0.30 + plank * 50, y * 0.02) * 0.5 + 0.5;
    _col.setHSL(0.070 + tone * 0.015, 0.32 - grain * 0.08, (0.185 + tone * 0.08 + grain * 0.05) * (gapped ? 0.5 : 1));
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = gapped ? 0.1 : 0.5 + grain * 0.4;
  }
  applyTone(px, tone);
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 1.8, anisotropy) };
}

function makeStraw(noi, anisotropy, tone = null) {
  // packed dry straw: long directional stalks with dark inter-stalk gaps and
  // per-stalk tone variation, graded toward dull ochre — the old bright
  // low-contrast yellow read as untextured toy cylinders on the hay bales
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const stalk = noi.noise(x * 0.022, y * 0.55) * 0.5 + 0.5;  // stalk-bundle tone
    const strand = noi.noise(x * 0.10 + 31, y * 1.55 - 12) * 0.5 + 0.5; // fine strands
    const kink = noi.noise(x * 0.45 + 77, y * 0.35 + 9) * 0.5 + 0.5;    // broken ends
    const gap = smoothstep(0.74, 0.92, noi.noise(x * 0.06 + 90, y * 0.9 + 55) * 0.5 + 0.5);
    const l = (0.21 + stalk * 0.13 + strand * 0.10 + kink * 0.04) * (1 - gap * 0.55);
    _col.setHSL(0.098 + stalk * 0.022, 0.38 - gap * 0.12, l);
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = (stalk * 0.45 + strand * 0.4 + kink * 0.15) * (1 - gap * 0.7);
  }
  applyTone(px, tone);
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 2.4, anisotropy) };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

// per-part random UV phase + mild scale jitter: with RepeatWrapping this
// de-syncs the texture grid between wall segments / buildings so no two
// surfaces tile identically. The scale term (r5) varies the apparent tile
// format per part — identical-pitch roof tile rows were striping in visible
// registration across whole rooftops.
function jitterUV(geo, rng) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  const ou = rng() * 7.31, ov = rng() * 5.17;
  const su = 0.86 + rng() * 0.30, sv = 0.86 + rng() * 0.30;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  return geo;
}

function _mustReplace(src, anchor, replacement) {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/props: shader anchor missing: ${anchor}`);
  return out;
}

// tileable simplex on a torus (same trick as terrain.js)
function torusN(noi, u, v, fu, fv, off) {
  const a = u * Math.PI * 2 * fu, b = v * Math.PI * 2 * fv;
  const r1 = fu * 0.55, r2 = fv * 0.55;
  return noi.noise4d(Math.cos(a) * r1 + off, Math.sin(a) * r1 - off * 0.7,
    Math.cos(b) * r2 + off * 1.3, Math.sin(b) * r2 + off * 0.35);
}

function makeGrimeTexture(noi, anisotropy) {
  const s = 256, px = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s, j = (y * s + x) * 4;
    const a = torusN(noi, u, v, 3, 3, 5) * 0.6 + torusN(noi, u, v, 7, 7, 19) * 0.4;
    const b = torusN(noi, u, v, 5, 5, 47) * 0.55 + torusN(noi, u, v, 13, 13, 91) * 0.45;
    px[j] = (a * 0.5 + 0.5) * 255;
    px[j + 1] = (b * 0.5 + 0.5) * 255;
    px[j + 2] = 128; px[j + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}

function box(w, h, d, uvScale = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleUV(g, Math.max(w, d) * uvScale, h * uvScale);
}

// triangular gable prism: width w, height h, thickness t (along z)
function gablePrism(w, h, t) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return scaleUV(g, 0.4, 0.4);
}

// ---------------------------------------------------------------------------
// Baked sourced models (vertex-colored, welded at bake time)
// ---------------------------------------------------------------------------

const _bakedCache = new Map();

/**
 * Build a BufferGeometry from a baked model: uniform scale to a target size,
 * XZ-centered, base at y=0, optional color grading (burn/darken for wrecks).
 * @param {string} name key in props-models.json
 * @param {{targetH?:number,targetW?:number,scale?:number,burn?:number,
 *   mul?:number,sink?:number}} [opts]
 * @returns {THREE.BufferGeometry} indexed geometry with position/normal/color
 */
function bakedGeometry(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  const hit = _bakedCache.get(key);
  if (hit) return hit;
  const m = MODELS[name];
  if (!m) throw new Error('world/props: missing baked model ' + name);
  const [minX, minY, minZ] = m.bbox.min, [maxX, maxY, maxZ] = m.bbox.max;
  let s = opts.scale ?? 1;
  if (opts.targetH) s = opts.targetH / Math.max(1e-6, maxY - minY);
  else if (opts.targetW) s = opts.targetW / Math.max(1e-6, Math.max(maxX - minX, maxZ - minZ));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const n = m.positions.length / 3;
  const pos = new Float32Array(m.positions.length);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (m.positions[i * 3] - cx) * s;
    pos[i * 3 + 1] = (m.positions[i * 3 + 1] - minY) * s - (opts.sink ?? 0);
    pos[i * 3 + 2] = (m.positions[i * 3 + 2] - cz) * s;
  }
  const col = new Float32Array(m.colors.length);
  const burn = opts.burn ?? 0, mul = opts.mul ?? 1;
  for (let i = 0; i < m.colors.length; i += 3) {
    let r = m.colors[i] * mul, g = m.colors[i + 1] * mul, b = m.colors[i + 2] * mul;
    if (burn > 0) { // char toward scorched brown-black, flatten saturation
      r = (r + (0.045 - r) * burn) * (1 - burn * 0.25);
      g = (g + (0.038 - g) * burn) * (1 - burn * 0.25);
      b = (b + (0.032 - b) * burn) * (1 - burn * 0.25);
    }
    col[i] = r; col[i + 1] = g; col[i + 2] = b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(m.normals), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(m.indices);
  geo.userData.size = {
    w: (maxX - minX) * s, h: (maxY - minY) * s, d: (maxZ - minZ) * s,
  };
  _bakedCache.set(key, geo);
  return geo;
}

// ---------------------------------------------------------------------------
// Building assembly — parts are pushed into per-material buckets, then merged
// ---------------------------------------------------------------------------

function makeCottage(rng, buckets, wallBucket = 'plaster') {
  const w = 5.2 + rng() * 1.2, d = 7.0 + rng() * 2.2;
  const wallH = 2.9, roofH = 1.9 + rng() * 0.4, over = 0.35;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0)); // foundation (sinks)
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  // roof slabs
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.12, d + over * 2, 0.35);
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  parts.stone.push(box(0.55, 1.6, 0.55).translate(w * 0.22, wallH + roofH - 0.2, d * 0.22)); // chimney
  // door on +z gable end
  parts.wood.push(box(1.1, 2.1, 0.10).translate(w * 0.08, 1.05, d / 2 + 0.10));
  parts.dark.push(box(0.86, 1.9, 0.06).translate(w * 0.08, 1.0, d / 2 + 0.16));
  // windows on long sides
  const nw = 2 + ((rng() * 2) | 0);
  for (let k = 0; k < nw; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / nw);
    for (const side of [-1, 1]) {
      if (rng() < 0.2) continue;
      // r5: frame PROUD, pane recessed (they were swapped — dark glass box
      // floated outside the frame and read as a painted-on rectangle), plus
      // a stone sill closing the bottom
      parts.wood.push(box(0.14, 1.06, 0.86).translate(side * (w / 2 + 0.05), 1.7, zz));
      parts.dark.push(box(0.06, 0.9, 0.7).translate(side * (w / 2 + 0.015), 1.7, zz));
      parts.stone.push(box(0.16, 0.09, 0.98).translate(side * (w / 2 + 0.06), 1.12, zz));
    }
  }
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeBarn(rng, buckets) {
  const w = 7.5 + rng() * 1.2, d = 11 + rng() * 2, wallH = 3.6, roofH = 2.6, over = 0.45;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts.wood.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, d / 2 - 0.15));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, -d / 2 + 0.15));
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.14, d + over * 2, 0.35);
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.07, 0);
    parts.roof.push(slab);
  }
  parts.dark.push(box(2.6, 2.9, 0.10).translate(0, 1.45, d / 2 + 0.08)); // big barn door
  parts.wood.push(box(2.9, 3.1, 0.06).translate(0, 1.55, d / 2 + 0.02));
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeTower(rng, buckets) {
  const w = 3.4, d = 3.4, wallH = 6.4 + rng() * 0.8;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.4, 1.2, d + 0.4).translate(0, -0.1, 0));
  parts.stone.push(box(w, wallH, d, 0.7).translate(0, wallH / 2, 0));
  const spire = new THREE.ConeGeometry(w * 0.78, 2.6, 4, 1);
  spire.rotateY(Math.PI / 4);
  scaleUV(spire, 2, 2);
  spire.translate(0, wallH + 1.3, 0);
  parts.roof.push(spire);
  for (let k = 0; k < 3; k++) {
    const yy = 1.8 + k * 1.7;
    parts.dark.push(box(0.5, 0.8, 0.06).translate(0, yy, d / 2 + 0.04));
    parts.dark.push(box(0.06, 0.8, 0.5).translate(w / 2 + 0.04, yy, 0));
  }
  parts.wood.push(box(1.0, 2.2, 0.1).translate(0, 1.1, -d / 2 - 0.06));
  mergeInto(buckets, parts);
  return { w: w + 0.4, d: d + 0.4, h: wallH + 2.6 };
}

function makeRuin(rng, buckets) {
  const w = 6.0 + rng(), d = 8.0 + rng() * 1.5;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0));
  // four broken walls: sequences of piers with varying heights
  const t = 0.5;
  const walls = [
    { len: d, rot: 0, ox: -w / 2 + t / 2, oz: 0 },
    { len: d, rot: 0, ox: w / 2 - t / 2, oz: 0 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: -d / 2 + t / 2 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: d / 2 - t / 2 },
  ];
  for (const wl of walls) {
    const segs = 3 + ((rng() * 3) | 0);
    const segLen = wl.len / segs;
    for (let k = 0; k < segs; k++) {
      if (rng() < 0.3) continue; // collapsed gap
      const hh = 0.9 + rng() * 2.1;
      const b = box(t, hh, segLen * 0.94, 0.7);
      b.translate(0, hh / 2, -wl.len / 2 + (k + 0.5) * segLen);
      if (wl.rot) b.rotateY(wl.rot);
      b.translate(wl.ox, 0, wl.oz);
      parts.stone.push(b);
    }
  }
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: 3.0 };
}

// flat-roofed adobe house (desert maps): parapet, wood roof beams, viga ends
function makeAdobe(rng, buckets) {
  const w = 5.4 + rng() * 1.8, d = 5.8 + rng() * 2.6;
  const wallH = 3.0 + rng() * 0.5;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 0.8, d + 0.3).translate(0, -0.15, 0));
  parts.plaster.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  // parapet rim
  parts.plaster.push(box(w, 0.45, 0.18).translate(0, wallH + 0.22, d / 2 - 0.09));
  parts.plaster.push(box(w, 0.45, 0.18).translate(0, wallH + 0.22, -d / 2 + 0.09));
  parts.plaster.push(box(0.18, 0.45, d - 0.36).translate(w / 2 - 0.09, wallH + 0.22, 0));
  parts.plaster.push(box(0.18, 0.45, d - 0.36).translate(-w / 2 + 0.09, wallH + 0.22, 0));
  parts.wood.push(box(w - 0.2, 0.1, d - 0.2, 0.35).translate(0, wallH + 0.02, 0)); // roof deck
  // viga beam ends over the door face
  const nBeam = Math.max(3, (w / 0.9) | 0);
  for (let k = 0; k < nBeam; k++) {
    const bx = -w / 2 + (k + 0.5) * (w / nBeam);
    const beam = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 5, 1);
    scaleUV(beam, 0.5, 0.5);
    beam.rotateX(Math.PI / 2);
    beam.translate(bx, wallH - 0.28, d / 2 + 0.18);
    parts.wood.push(beam);
  }
  parts.wood.push(box(1.0, 2.0, 0.10).translate(w * 0.1, 1.0, d / 2 + 0.08));
  parts.dark.push(box(0.8, 1.8, 0.06).translate(w * 0.1, 0.95, d / 2 + 0.13));
  const nw = 1 + ((rng() * 2) | 0);
  for (let k = 0; k < nw; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / nw);
    for (const side of [-1, 1]) {
      if (rng() < 0.3) continue;
      parts.dark.push(box(0.06, 0.7, 0.6).translate(side * (w / 2 + 0.05), 1.9, zz));
    }
  }
  if (rng() < 0.45) { // rooftop stair block
    parts.plaster.push(box(w * 0.35, 1.0, d * 0.3).translate(-w * 0.18, wallH + 0.5, -d * 0.18));
  }
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + 1.2 };
}

// 2-3 story town rowhouse (urban maps): window grids, shopfront, gable roof.
// dims {w,d} pins the footprint so street strips can butt shared walls.
function makeRowhouse(rng, buckets, wallBucket = 'plaster', dims = null) {
  const w = (dims && dims.w) || 8.0 + rng() * 3.0;
  const d = (dims && dims.d) || 9.0 + rng() * 4.0;
  const stories = 2 + ((rng() * 2) | 0);
  const wallH = stories * 2.9 + 0.6;
  const roofH = 1.4 + rng() * 0.6, over = 0.3;
  const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = box(slope + 0.15, 0.13, d + over * 2, 0.35);
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  parts.stone.push(box(0.6, 1.5, 0.6).translate(-w * 0.24, wallH + roofH - 0.1, -d * 0.2)); // chimney
  // window grids on the long sides.
  // r6: ground floors get STREET LIFE — one door or shopfront slot per long
  // side, and ~40% of buildings hang wooden shutters beside their windows.
  // The critique: two facade materials with identical punched black window
  // rectangles and "no street-level doors, shutters, or signage visible".
  const doorK = [(rng() * 97) | 0, (rng() * 97) | 0]; // per-side door slot (mod nwn below)
  const shutters = rng() < 0.4;
  for (let st = 0; st < stories; st++) {
    const wy = 1.8 + st * 2.9;
    const nwn = Math.max(2, (d / 2.6) | 0);
    for (let k = 0; k < nwn; k++) {
      const zz = -d / 2 + (k + 0.5) * (d / nwn);
      for (const side of [-1, 1]) {
        const wx = side * (w / 2);
        if (st === 0 && k === doorK[side < 0 ? 0 : 1] % nwn) {
          if (rng() < 0.45) {
            // shopfront: wide display glass, stall riser, lintel + signboard
            parts.dark.push(box(0.07, 1.55, 1.90).translate(wx + side * 0.02, 1.38, zz));
            parts.stone.push(box(0.16, 0.42, 2.06).translate(wx + side * 0.05, 0.32, zz));
            parts.wood.push(box(0.10, 0.15, 2.10).translate(wx + side * 0.055, 2.28, zz));
            parts.wood.push(box(0.09, 0.44, 1.72).translate(wx + side * 0.065, 2.66, zz));
          } else {
            // street door: wood leaf in a proud frame, lintel, stone step
            parts.wood.push(box(0.10, 2.24, 1.08).translate(wx + side * 0.03, 1.14, zz));
            parts.dark.push(box(0.06, 2.02, 0.86).translate(wx + side * 0.085, 1.05, zz));
            parts.wood.push(box(0.11, 0.15, 1.32).translate(wx + side * 0.055, 2.34, zz));
            parts.stone.push(box(0.36, 0.16, 1.26).translate(wx + side * 0.16, 0.10, zz));
          }
          continue;
        }
        if (rng() < 0.12) continue;
        // framed windows with a faked reveal: the pane sits barely proud of
        // the wall while jambs/lintel stand ~5 cm prouder and a stone sill
        // closes the bottom — the glass reads recessed, not painted on
        parts.dark.push(box(0.05, 1.25, 0.82).translate(wx + side * 0.012, wy, zz));
        parts.wood.push(box(0.09, 1.36, 0.09).translate(wx + side * 0.045, wy, zz - 0.44));
        parts.wood.push(box(0.09, 1.36, 0.09).translate(wx + side * 0.045, wy, zz + 0.44));
        parts.wood.push(box(0.09, 0.09, 0.97).translate(wx + side * 0.045, wy + 0.66, zz));
        parts.stone.push(box(0.14, 0.10, 1.0).translate(wx + side * 0.05, wy - 0.70, zz));
        if (shutters && rng() < 0.8) {
          parts.wood.push(box(0.05, 1.24, 0.30).translate(wx + side * 0.03, wy, zz - 0.70));
          parts.wood.push(box(0.05, 1.24, 0.30).translate(wx + side * 0.03, wy, zz + 0.70));
        }
      }
    }
    // gable-face windows
    if (st > 0) {
      for (const gz of [d / 2 + 0.05, -d / 2 - 0.05]) {
        parts.dark.push(box(0.82, 1.25, 0.06).translate(w * 0.18, wy, gz));
        parts.dark.push(box(0.82, 1.25, 0.06).translate(-w * 0.18, wy, gz));
      }
    }
  }
  // street door + shopfront on the +z gable face
  parts.wood.push(box(1.2, 2.3, 0.12).translate(-w * 0.15, 1.15, d / 2 + 0.08));
  parts.dark.push(box(1.0, 2.1, 0.06).translate(-w * 0.15, 1.1, d / 2 + 0.14));
  if (rng() < 0.55) parts.dark.push(box(2.3, 1.5, 0.06).translate(w * 0.18, 1.5, d / 2 + 0.10));
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);
const _posv = new THREE.Vector3();

function mergeInto(buckets, parts, transform = null) {
  for (const key of Object.keys(parts)) {
    for (const g of parts[key]) {
      if (transform) g.applyMatrix4(transform);
      buckets[key].push(g);
    }
  }
}

// ---------------------------------------------------------------------------
// createProps
// ---------------------------------------------------------------------------

/**
 * Create rocks, village buildings, walls and cover props.
 * @param {object} heightField HeightField from terrain.createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {number} [seed=2002] props seed
 * @param {?object} [cfg=null] map config (uses cfg.props); null = classic verdant set
 * @returns {{group:THREE.Group, obstacles:Array<{min:number[],max:number[]}>,
 *   colliders:Array<{min:number[],max:number[]}>, features:{buildings:Array<object>}}}
 */
export function createProps(heightField, engineCtx, seed = 2002, cfg = null) {
  const P = {
    plan: ['cottage', 'barn', 'cottage', 'tower', 'cottage', 'ruin',
      'cottage', 'barn', 'cottage', 'cottage'],
    tones: {}, rockTone: null, wallStoneChance: 0.25,
    buildingLat: [10, 4], sideSkip: 0.25, maxSpread: 1.7, spacingPad: 9,
    wallRuns: null, well: true, hayCrates: true, fences: true,
    telegraph: true, carts: true, logs: true,
    haystacks: 15, rocks: 170, outcrops: 16, craters: 30, rubblePiles: 0,
    streetRows: false, curbs: false, monument: false, townCraters: false,
    ...((cfg && cfg.props) || {}),
  };
  const mapId = cfg ? cfg.id : 'verdant';
  const rng = mulberry32(seed);
  const L = heightField._layout;
  const noVeg = heightField._noVeg || (() => false);
  const noi = new SimplexNoise({ random: mulberry32(seed + 7) });
  const aniso = engineCtx.anisotropy ?? 4;
  const group = new THREE.Group();
  group.name = 'props';
  const v = L.village;

  const T = P.tones || {};
  const plaster = makePlaster(noi, aniso, T.plaster || null);
  const roofT = makeRoofTiles(noi, aniso, T.roof || null);
  const stone = makeStone(noi, aniso, T.stone || null);
  const wood = makeWood(noi, aniso, T.wood || null);
  const straw = makeStraw(noi, aniso, T.straw || null);

  // Deep-hunt 2026-07: sourced CC0 PBR building sets (ambientCG, see
  // docs/ATTRIBUTION.md) swap into plaster/roof/wood (and stone -> brick on
  // urban) in place when they load; procedural stays the fallback of record.
  applySourcedBuildings({ plaster, roof: roofT, wood, stone }, mapId);

  const mats = {
    plaster: new THREE.MeshStandardMaterial({ map: plaster.albedo, normalMap: plaster.normal, roughness: 0.93, metalness: 0 }),
    roof: new THREE.MeshStandardMaterial({ map: roofT.albedo, normalMap: roofT.normal, roughness: 0.82, metalness: 0 }),
    stone: new THREE.MeshStandardMaterial({ map: stone.albedo, normalMap: stone.normal, roughness: 0.9, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: wood.albedo, normalMap: wood.normal, roughness: 0.8, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x161a1d, roughness: 0.35, metalness: 0.15 }),
    straw: new THREE.MeshStandardMaterial({ map: straw.albedo, normalMap: straw.normal, roughness: 0.95, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    baked: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
  };
  mats.rock.envMapIntensity = 0.35; // no white env-specular sparkle at distance
  mats.baked.envMapIntensity = 0.5; // flat-shaded sourced models: no spec sparkle

  // world-space grime/variation overlay: a second noise-masked albedo layer
  // (macro tone breakup + streaky weathering) that de-grids every tiled
  // hard-surface texture — walls stop reading as a repeated stamp at zoom
  const grimeTex = makeGrimeTexture(noi, aniso);
  const grimeHook = (shader) => {
    shader.uniforms.uGrime = { value: grimeTex };
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vGrimeW;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <worldpos_vertex>', /* glsl */`#include <worldpos_vertex>
{
  vec4 gw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  gw = instanceMatrix * gw;
  #endif
  vGrimeW = (modelMatrix * gw).xyz;
}`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vGrimeW;\nuniform sampler2D uGrime;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`#include <map_fragment>
{
  float gA = texture2D(uGrime, vGrimeW.xz * 0.021 + vGrimeW.y * 0.013).r;
  float gB = texture2D(uGrime, vec2(vGrimeW.x + vGrimeW.z, vGrimeW.y * 1.7) * 0.055).g;
  diffuseColor.rgb *= 0.84 + gA * 0.30;
  diffuseColor.rgb *= 1.0 - smoothstep(0.58, 0.95, gB) * 0.20;
}`);
  };
  for (const [mk, m] of Object.entries(mats)) {
    engineCtx.setupShadowMaterial(m, mk === 'dark' ? null : grimeHook);
    m.customProgramCacheKey = () => 'world-props-' + mk + '-v4';
  }

  const buckets = { plaster: [], stone: [], roof: [], wood: [], dark: [], straw: [], baked: [] };
  const obstacles = [];
  const colliders = [];
  const buildingFeatures = [];
  // sourced-model instancing: name -> { geo, list: [Matrix4, ...] }
  const bakedInstances = new Map();
  function addBakedInstance(name, geo, x, y, z, yaw, sc = 1, tiltX = 0, tiltZ = 0) {
    let e = bakedInstances.get(name);
    if (!e) { e = { geo, list: [] }; bakedInstances.set(name, e); }
    _quat.setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ, 'YXZ'));
    _mat4.compose(_posv.set(x, y, z), _quat, new THREE.Vector3(sc, sc, sc));
    e.list.push(_mat4.clone());
  }

  function groundFit(x, z, w, d, rot) {
    const cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
    const hx = (w * cs + d * sn) / 2, hz = (w * sn + d * cs) / 2;
    const hs = [
      heightField.getHeightAt(x - hx, z - hz), heightField.getHeightAt(x + hx, z - hz),
      heightField.getHeightAt(x - hx, z + hz), heightField.getHeightAt(x + hx, z + hz),
      heightField.getHeightAt(x, z),
    ];
    return { y: Math.min(...hs), spread: Math.max(...hs) - Math.min(...hs), hx, hz };
  }

  function addFootprintAABB(list, x, z, y, hx, hz, h) {
    list.push({ min: [x - hx, y, z - hz], max: [x + hx, y + h, z + hz] });
  }

  // --- village buildings along the roads ---
  const roads = L.roads;
  // junction/plaza: the road crossing nearest the village/town center
  let junction = { x: 20, z: 73 }; // classic verdant plaza
  if (mapId !== 'verdant') {
    let best = 1e9;
    junction = { x: v.cx, z: v.cz };
    for (let ra = 0; ra < roads.length; ra++) for (let rb = ra + 1; rb < roads.length; rb++) {
      for (const [ax, az] of roads[ra]) for (const [bx, bz] of roads[rb]) {
        if (Math.hypot(ax - bx, az - bz) > 18) continue;
        const jx = (ax + bx) / 2, jz = (az + bz) / 2;
        const d = Math.hypot(jx - v.cx, jz - v.cz);
        if (d < best) { best = d; junction = { x: jx, z: jz }; }
      }
    }
  }
  // point-to-segment distance (local twin of terrain.js segDist)
  function segD(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    const ex = ax + dx * t - px, ez = az + dz * t - pz;
    return Math.hypot(ex, ez);
  }
  // distance to the nearest road EXCLUDING index `skip` (keeps crossings open)
  function distToOtherRoads(x, z, skip = -1) {
    let best = 1e9;
    for (let ri = 0; ri < roads.length; ri++) {
      if (ri === skip) continue;
      const nodes = roads[ri];
      for (let sg = 0; sg < nodes.length - 1; sg++) {
        const d = segD(x, z, nodes[sg][0], nodes[sg][1], nodes[sg + 1][0], nodes[sg + 1][1]);
        if (d < best) best = d;
      }
    }
    return best;
  }

  const candidates = [];
  for (const nodes of roads) {
    for (let i = 1; i < nodes.length - 1; i++) {
      const [nx, nz] = nodes[i];
      if (nx < v.x0 + 6 || nx > v.x1 - 6 || nz < v.z0 + 6 || nz > v.z1 - 6) continue;
      if (Math.hypot(nx - junction.x, nz - junction.z) < 22) continue; // keep the plaza open
      const tx = nodes[i + 1][0] - nodes[i - 1][0], tz = nodes[i + 1][1] - nodes[i - 1][1];
      const tl = Math.hypot(tx, tz);
      candidates.push({ x: nx, z: nz, tx: tx / tl, tz: tz / tl });
    }
  }
  // NOTE: sourced barn/church models were trialed here and lost the
  // side-by-side judging to the procedural set (docs/ATTRIBUTION.md).
  const BUILDER_BY_NAME = {
    cottage: makeCottage, barn: makeBarn, tower: makeTower, ruin: makeRuin,
    adobe: makeAdobe, rowhouse: makeRowhouse,
    ...URBAN_BUILDERS, // church / factory landmarks (maps/urbanKit.js)
  };
  const builders = P.plan.map((n) => BUILDER_BY_NAME[n] || makeCottage);
  let bi = 0;
  const placedB = [];
  for (const cand of candidates) {
    if (P.streetRows) break; // town maps: strips own the street frontage
    if (bi >= builders.length) break;
    for (const side of [-1, 1]) {
      if (bi >= builders.length) break;
      if (rng() < P.sideSkip) continue;
      const lat = P.buildingLat[0] + rng() * P.buildingLat[1];
      const px = cand.x + -cand.tz * side * lat;
      const pz = cand.z + cand.tx * side * lat;
      if (px < v.x0 || px > v.x1 || pz < v.z0 || pz > v.z1) continue;
      if (heightField._roadDist(px, pz) < 7.5 || noVeg(px, pz)) continue;
      let clear = true;
      for (const pb of placedB) if (Math.hypot(px - pb.x, pz - pb.z) < pb.rr + P.spacingPad) { clear = false; break; }
      if (!clear) continue;
      const rot = Math.atan2(cand.tx, cand.tz) + (rng() - 0.5) * 0.10;
      const tmp = { plaster: [], stone: [], roof: [], wood: [], dark: [], straw: [], baked: [] };
      const info = builders[bi](rng, tmp, rng() < 1 - P.wallStoneChance ? 'plaster' : 'stone');
      const fit = groundFit(px, pz, info.w, info.d, rot);
      if (fit.spread > P.maxSpread) continue;
      // per-building texture phase: no two facades repeat the same grid
      for (const bk of Object.keys(tmp)) for (const g of tmp[bk]) jitterUV(g, rng);
      _quat.setFromAxisAngle(_upAxis, rot);
      _mat4.compose(_posv.set(px, fit.y + 0.05, pz), _quat, _one);
      mergeInto(buckets, tmp, _mat4);
      addFootprintAABB(obstacles, px, pz, fit.y, fit.hx, fit.hz, info.h);
      addFootprintAABB(colliders, px, pz, fit.y, fit.hx, fit.hz, info.h);
      buildingFeatures.push({ x: px, z: pz, w: info.w, d: info.d, rot });
      placedB.push({ x: px, z: pz, rr: Math.max(info.w, info.d) * 0.75 });
      bi++;
    }
  }

  // heaped masonry chunks + a jutting charred beam (shared by the street
  // rubble scatter and the collapsed rowhouse slots)
  function addRubblePile(x, z, pr, rrng) {
    const y = heightField.getHeightAt(x, z);
    const n = 6 + ((rrng() * 5) | 0);
    for (let k = 0; k < n; k++) {
      const a = rrng() * Math.PI * 2, rr = Math.sqrt(rrng()) * pr;
      const cs = 0.35 + rrng() * 0.8;
      const chunk = box(cs, cs * (0.5 + rrng() * 0.5), cs * (0.6 + rrng() * 0.6), 0.9);
      jitterUV(chunk, rrng);
      chunk.rotateY(rrng() * Math.PI);
      chunk.rotateX((rrng() - 0.5) * 0.5);
      chunk.translate(x + Math.cos(a) * rr, y + 0.12 + (1 - rr / pr) * pr * 0.35, z + Math.sin(a) * rr);
      buckets.stone.push(chunk);
    }
    if (rrng() < 0.6) { // charred beam jutting out
      const beam = box(0.14, 0.14, 2.2 + rrng() * 1.4, 1.0);
      beam.rotateX(-0.5 - rrng() * 0.4);
      beam.rotateY(rrng() * Math.PI * 2);
      beam.translate(x, y + pr * 0.4, z);
      buckets.wood.push(beam);
    }
    obstacles.push({ min: [x - pr, y, z - pr], max: [x + pr, y + pr * 0.7, z + pr] });
    colliders.push({ min: [x - pr, y, z - pr], max: [x + pr, y + pr * 0.7, z + pr] });
  }

  // --- contiguous rowhouse strips along the streets (town maps): buildings
  // butt against each other with shared walls, doors on the street, varied
  // heights/facades, the odd collapsed slot spilling rubble into the street ---
  if (P.streetRows) {
    const srng = mulberry32(seed + 505);
    const stripAABBs = []; // {x,z,hx,hz} world-AABB approximations
    for (let ri = 0; ri < roads.length; ri++) {
      const pts = roads[ri];
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      }
      const total = cum[cum.length - 1];
      const pointAt = (t) => {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < t) i++;
        const f = (t - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
        const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
        const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
        let tx = pts[i][0] - pts[i - 1][0], tz = pts[i][1] - pts[i - 1][1];
        const tl = Math.hypot(tx, tz) || 1;
        return [x, z, tx / tl, tz / tl];
      };
      for (const side of [-1, 1]) {
        let t = 3 + srng() * 9;
        while (t < total - 10) {
          const w = 8.2 + srng() * 3.0, d = 8.5 + srng() * 3.5;
          const [rx, rz, tx, tz] = pointAt(t + w / 2);
          if (rx < v.x0 + 8 || rx > v.x1 - 8 || rz < v.z0 + 8 || rz > v.z1 - 8) { t += w; continue; }
          const nx = -tz * side, nz = tx * side;
          // varied setback (5.7-7.5 m) breaks the razor-straight Monopoly
          // frontage line while keeping the street wall reading
          const off = 5.7 + srng() * 1.8 + d / 2;
          const px = rx + nx * off, pz = rz + nz * off;
          // keep crossings and the central square open
          if (distToOtherRoads(px, pz, ri) < 9.5
            || Math.hypot(px - junction.x, pz - junction.z) < 26
            || noVeg(px, pz)) { t += 6; continue; }
          const roll = srng();
          if (roll < 0.14) { t += 4 + srng() * 7; continue; } // alley / vacant lot
          const rot = Math.atan2(-nx, -nz); // local +z (door face) toward street
          const ruinChance = P.ruinChance ?? 0.24;
          const cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
          const hx = (w * cs + d * sn) / 2, hz = (w * sn + d * cs) / 2;
          let clear = true;
          for (const sb of stripAABBs) {
            if (Math.abs(px - sb.x) < hx + sb.hx - 1.0
              && Math.abs(pz - sb.z) < hz + sb.hz - 1.0) { clear = false; break; }
          }
          if (!clear) { t += w * 0.6; continue; }
          const ruined = roll < ruinChance; // shell-collapsed slot in the row
          const tmp = { plaster: [], stone: [], roof: [], wood: [], dark: [], straw: [], baked: [] };
          const info = ruined
            ? makeRuin(rng, tmp)
            : makeRowhouse(rng, tmp, srng() < 0.5 ? 'plaster' : 'stone', { w, d });
          const fit = groundFit(px, pz, info.w, info.d, rot);
          if (fit.spread > 3.2) { t += w; continue; }
          for (const bk of Object.keys(tmp)) for (const g of tmp[bk]) jitterUV(g, rng);
          _quat.setFromAxisAngle(_upAxis, rot);
          _mat4.compose(_posv.set(px, fit.y + 0.05, pz), _quat, _one);
          mergeInto(buckets, tmp, _mat4);
          addFootprintAABB(obstacles, px, pz, fit.y, fit.hx, fit.hz, info.h);
          addFootprintAABB(colliders, px, pz, fit.y, fit.hx, fit.hz, info.h);
          buildingFeatures.push({ x: px, z: pz, w: info.w, d: info.d, rot });
          placedB.push({ x: px, z: pz, rr: Math.max(info.w, info.d) * 0.75 });
          stripAABBs.push({ x: px, z: pz, hx, hz });
          if (ruined) { // debris spills toward the street
            const rbx = rx + nx * (off - d * 0.55), rbz = rz + nz * (off - d * 0.55);
            if (heightField._roadDist(rbx, rbz) > 3.4) {
              addRubblePile(rbx, rbz, 1.8 + srng() * 1.2, srng);
            }
          }
          t += w - 0.25; // shared wall with the next house
        }
      }
    }

    // --- street furniture + battle litter (town maps) --------------------
    // Cast-iron lampposts march both pavements; small masonry spill, roof-
    // tile shards and the odd toppled post litter the kerb line — the shelled
    // town finally carries its own street-level texture instead of bare
    // asphalt ribbons between facades.
    {
      const frng = mulberry32(seed + 606);
      for (let ri = 0; ri < roads.length; ri++) {
        const pts = roads[ri];
        for (let i = 1; i < pts.length - 1; i += 1) { // r5: every node (~32 m spacing)
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
          const tl = Math.hypot(bx - ax, bz - az) || 1;
          const txn = (bx - ax) / tl, tzn = (bz - az) / tl;
          const side = (i % 2) ? 1 : -1; // alternate pavements
          const lx = ax - tzn * side * 5.9, lz = az + txn * side * 5.9;
          if (lx < v.x0 + 4 || lx > v.x1 - 4 || lz < v.z0 + 4 || lz > v.z1 - 4) continue;
          if (distToOtherRoads(lx, lz, ri) < 7 || noVeg(lx, lz)) continue;
          const ly = heightField.getHeightAt(lx, lz);
          if (frng() < 0.18) { // toppled post lying across the pavement
            const fall = box(0.09, 0.09, 4.6, 1.4);
            fall.rotateY(frng() * Math.PI * 2);
            fall.translate(lx, ly + 0.1, lz);
            buckets.dark.push(fall);
            continue;
          }
          const yawL = -Math.atan2(tzn, txn); // arm reaches over the carriageway
          const post = new THREE.CylinderGeometry(0.055, 0.10, 4.4, 6, 1);
          scaleUV(post, 0.5, 2.0);
          post.translate(lx, ly + 2.2, lz);
          buckets.dark.push(post);
          const arm = box(0.07, 0.07, 0.85, 1.2);
          arm.translate(0, 0, 0.38); // build about the post axis, then swing
          arm.rotateY(yawL);
          arm.translate(lx, ly + 4.32, lz);
          buckets.dark.push(arm);
          const lampHead = box(0.28, 0.36, 0.28, 1.5);
          lampHead.translate(0, -0.24, 0.74);
          lampHead.rotateY(yawL);
          lampHead.translate(lx, ly + 4.32, lz);
          buckets.dark.push(lampHead);
        }
      }
      // kerb-line battle litter: masonry chips + slate shards along frontages
      for (let i = 0, placed = 0; i < 900 && placed < 150; i++) {
        const x = v.x0 + frng() * (v.x1 - v.x0);
        const z = v.z0 + frng() * (v.z1 - v.z0);
        const rd = heightField._roadDist(x, z);
        if (rd < 3.2 || rd > 7.5) continue; // hugs the kerb/pavement band
        if (noVeg(x, z)) continue;
        const y = heightField.getHeightAt(x, z);
        const cs = 0.14 + frng() * 0.34;
        const chip = box(cs, cs * (0.4 + frng() * 0.4), cs * (0.5 + frng() * 0.8), 1.6);
        jitterUV(chip, frng);
        chip.rotateY(frng() * Math.PI);
        chip.rotateX((frng() - 0.5) * 0.4);
        chip.translate(x, y + cs * 0.2, z);
        if (frng() < 0.72) buckets.stone.push(chip); else buckets.roof.push(chip);
        placed++;
      }
    }
  }

  // --- town block fill (urban): place remaining plan buildings on a coarse
  // grid BETWEEN the streets so blocks read built-up, not just road-fronted ---
  if (P.blockFill && bi < builders.length) {
    const brng = mulberry32(seed + 404);
    const step = 27;
    for (let gz = v.z0 + 14; gz < v.z1 - 14 && bi < builders.length; gz += step) {
      for (let gx = v.x0 + 14; gx < v.x1 - 14 && bi < builders.length; gx += step) {
        const px = gx + (brng() - 0.5) * 10, pz = gz + (brng() - 0.5) * 10;
        const rd = heightField._roadDist(px, pz);
        if (rd < 11 || rd > 60) continue; // off the frontage, inside the block
        if (noVeg(px, pz)) continue;
        if (Math.hypot(px - junction.x, pz - junction.z) < 24) continue;
        let clear = true;
        for (const pb of placedB) if (Math.hypot(px - pb.x, pz - pb.z) < pb.rr + P.spacingPad) { clear = false; break; }
        if (!clear) continue;
        const rot = (brng() < 0.5 ? 0 : Math.PI / 2) + (brng() - 0.5) * 0.06;
        const tmp = { plaster: [], stone: [], roof: [], wood: [], dark: [], straw: [], baked: [] };
        const info = builders[bi](rng, tmp, rng() < 1 - P.wallStoneChance ? 'plaster' : 'stone');
        const fit = groundFit(px, pz, info.w, info.d, rot);
        if (fit.spread > P.maxSpread) continue;
        for (const bk of Object.keys(tmp)) for (const g of tmp[bk]) jitterUV(g, rng);
        _quat.setFromAxisAngle(_upAxis, rot);
        _mat4.compose(_posv.set(px, fit.y + 0.05, pz), _quat, _one);
        mergeInto(buckets, tmp, _mat4);
        addFootprintAABB(obstacles, px, pz, fit.y, fit.hx, fit.hz, info.h);
        addFootprintAABB(colliders, px, pz, fit.y, fit.hx, fit.hz, info.h);
        buildingFeatures.push({ x: px, z: pz, w: info.w, d: info.d, rot });
        placedB.push({ x: px, z: pz, rr: Math.max(info.w, info.d) * 0.75 });
        bi++;
      }
    }
  }

  // --- low stone walls (cover) — axis-aligned runs for tight AABBs ---
  function addWallRun(x0, z0, x1, z1, gapAt = -1) {
    const along = Math.hypot(x1 - x0, z1 - z0);
    const nSeg = Math.max(1, Math.round(along / 6));
    const dx = (x1 - x0) / nSeg, dz = (z1 - z0) / nSeg;
    for (let k = 0; k < nSeg; k++) {
      if (k === gapAt) continue;
      const cx = x0 + dx * (k + 0.5), cz = z0 + dz * (k + 0.5);
      if (heightField._roadDist(cx, cz) < 5.5 || noVeg(cx, cz)) continue;
      const y = heightField.getHeightAt(cx, cz) - 0.15;
      const h = 1.0 + rng() * 0.25;
      const horizontal = Math.abs(dx) > Math.abs(dz);
      const len = Math.abs(horizontal ? dx : dz) * 0.96;
      const g = box(horizontal ? len : 0.45, h, horizontal ? 0.45 : len, 0.7);
      jitterUV(g, rng); // de-sync coursing between segments
      g.translate(cx, y + h / 2, cz);
      buckets.stone.push(g);
      const hx = (horizontal ? len : 0.45) / 2, hz = (horizontal ? 0.45 : len) / 2;
      obstacles.push({ min: [cx - hx, y, cz - hz], max: [cx + hx, y + h, cz + hz] });
      colliders.push({ min: [cx - hx, y, cz - hz], max: [cx + hx, y + h, cz + hz] });
    }
  }
  const wallRuns = P.wallRuns || [
    [v.x0 + 4, 8, v.x0 + 4, 64, 2],
    [v.x0 + 4, 8, v.x0 + 40, 8, 3],
    [v.x1 - 6, 30, v.x1 - 6, 96, 4],
    [-8, v.z1 - 10, 52, v.z1 - 10, 2],
    [38, v.z0 + 6, 74, v.z0 + 6, 1],
    [-44, 108, -10, 108, 0],
    // midfield field-boundary walls: hull-down/cover lines in the open ground
    [-186, -62, -118, -62, 3],
    [-118, -62, -118, -14, 1],
    [148, -196, 148, -132, 2],
    [-64, 218, 8, 218, 4],
    [196, 108, 258, 108, 2],
    [-266, 66, -212, 66, 1],
    [96, -320, 158, -320, 3],
  ];
  for (const wr of wallRuns) addWallRun(wr[0], wr[1], wr[2], wr[3], wr[4] ?? -1);

  // --- village well near the junction ---
  if (P.well) {
    let wx = junction.x + 9, wz = junction.z + 7;
    for (let i = 0; i < 20 && heightField._roadDist(wx, wz) < 6.5; i++) { wx += 2; wz += 1; }
    const wy = heightField.getHeightAt(wx, wz);
    const ring = new THREE.CylinderGeometry(1.0, 1.1, 0.9, 10, 1);
    scaleUV(ring, 3, 0.5);
    ring.translate(wx, wy + 0.45, wz);
    buckets.stone.push(ring);
    for (const s of [-1, 1]) {
      const post = box(0.14, 1.9, 0.14);
      post.translate(wx + s * 0.85, wy + 0.95, wz);
      buckets.wood.push(post);
    }
    const wroof = gablePrism(2.4, 0.7, 1.4);
    wroof.rotateY(Math.PI / 2);
    wroof.translate(wx, wy + 1.9, wz);
    buckets.roof.push(wroof);
    obstacles.push({ min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] });
    colliders.push({ min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] });
  }

  // --- hay bales + crates near buildings ---
  for (let i = 0; P.hayCrates && i < Math.min(5, placedB.length); i++) {
    const pb = placedB[i];
    const n = 1 + ((rng() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, r = pb.rr + 2 + rng() * 4;
      const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
      if (heightField._roadDist(x, z) < 4.5) continue;
      const y = heightField.getHeightAt(x, z);
      if (rng() < 0.5) {
        const bale = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 12, 1);
        scaleUV(bale, 2, 1);
        bale.rotateZ(Math.PI / 2);
        bale.rotateY(rng() * Math.PI);
        bale.translate(x, y + 0.72, z);
        buckets.straw.push(bale);
      } else {
        const cs = 0.9 + rng() * 0.4;
        const crate = box(cs, cs, cs, 1.0);
        crate.rotateY(rng() * Math.PI * 0.5);
        crate.translate(x, y + cs / 2 - 0.04, z);
        buckets.wood.push(crate);
      }
    }
  }

  // --- wooden fence runs + telegraph poles along the roads (visual only) ---
  {
    const roadsL = L.roads;
    function fenceRun(nodes, i0, i1, side) {
      for (let i = i0; i < i1 && i < nodes.length - 1; i++) {
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        const tx = dx / len, tz = dz / len;
        const ox = -tz * side * 7.6, oz = tx * side * 7.6;
        const nPost = Math.max(2, Math.floor(len / 2.4));
        let prev = null;
        for (let k = 0; k <= nPost; k++) {
          const x = ax + tx * ((len * k) / nPost) + ox, z = az + tz * ((len * k) / nPost) + oz;
          if (Math.max(Math.abs(x), Math.abs(z)) > 480) { prev = null; continue; }
          const y = heightField.getHeightAt(x, z);
          if (rng() > 0.06) { // the odd missing post
            const post = box(0.13, 1.2, 0.13, 1.2);
            post.rotateY(rng() * 0.2 - 0.1);
            post.translate(x, y + 0.52, z);
            buckets.wood.push(post);
          }
          if (prev) {
            for (const rh of [0.42, 0.92]) {
              const mx = (x + prev[0]) / 2, mz = (z + prev[2]) / 2;
              const my = (y + prev[1]) / 2 + rh;
              const rl = Math.hypot(x - prev[0], z - prev[2]);
              const rail = box(rl * 1.02, 0.09, 0.07, 1.2);
              rail.rotateZ(Math.atan2(prev[1] - y, rl) * 0.9);
              rail.rotateY(-Math.atan2(z - prev[2], x - prev[0]));
              rail.translate(mx, my, mz);
              buckets.wood.push(rail);
            }
          }
          prev = [x, y, z];
        }
      }
    }
    if (P.fences && roadsL.length >= 2) {
      fenceRun(roadsL[0], 11, 14, -1); // village approach, west side
      fenceRun(roadsL[0], 20, 23, 1);  // north exit, east side
      fenceRun(roadsL[1], 9, 12, -1);  // west field edge
      fenceRun(roadsL[1], 20, 23, 1);  // east field edge
    }
    // telegraph poles marching along road A — tapered round poles with twin
    // cross-arms and a brace, planted dead vertical
    const poleGeo = SOURCED.poles && P.telegraph
      ? bakedGeometry('telephone_pole_polygoogle', { targetH: 7.4, sink: 0.15 }) : null;
    for (let i = 8; P.telegraph && i < roadsL[0].length - 1; i += 2) {
      const [ax, az] = roadsL[0][i], [bx, bz] = roadsL[0][i + 1];
      const tl = Math.hypot(bx - ax, bz - az);
      const px = ax - ((bz - az) / tl) * 6.9, pz = az + ((bx - ax) / tl) * 6.9;
      if (Math.max(Math.abs(px), Math.abs(pz)) > 470 || noVeg(px, pz)) continue;
      const py = heightField.getHeightAt(px, pz);
      const armYaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      if (SOURCED.poles) {
        addBakedInstance('pole', poleGeo, px, py - 0.05, pz, armYaw, 1);
        continue;
      }
      const pole = new THREE.CylinderGeometry(0.09, 0.17, 6.2, 7, 1);
      scaleUV(pole, 0.8, 3.0);
      pole.translate(px, py + 3.0, pz);
      buckets.wood.push(pole);
      for (const armY of [5.75, 5.15]) {
        const arm = box(1.5, 0.11, 0.09, 1.0);
        arm.rotateY(armYaw);
        arm.translate(px, py + armY, pz);
        buckets.wood.push(arm);
        for (const s of [-1, 1]) { // insulator pegs
          const peg = box(0.07, 0.16, 0.07, 2.0);
          peg.rotateY(armYaw);
          peg.translate(px + Math.cos(armYaw) * 0.6 * s, py + armY + 0.13, pz - Math.sin(armYaw) * 0.6 * s);
          buckets.wood.push(peg);
        }
      }
      const brace = box(0.06, 1.1, 0.06, 1.5);
      brace.rotateZ(0.6);
      brace.rotateY(armYaw);
      brace.translate(px + Math.cos(armYaw) * 0.26, py + 4.8, pz - Math.sin(armYaw) * 0.26);
      buckets.wood.push(brace);
    }
  }

  // --- rocks (instanced, 3 displaced-icosahedron variants) ---
  const rockGeos = [];
  for (let vi = 0; vi < 3; vi++) {
    const g = new THREE.IcosahedronGeometry(1, vi === 2 ? 2 : 1);
    const p = g.attributes.position;
    const vr = mulberry32(seed + 30 + vi);
    const tmpv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      tmpv.set(p.getX(i), p.getY(i), p.getZ(i));
      const f = 1 + noi.noise3d(tmpv.x * 1.4 + vi * 9, tmpv.y * 1.4, tmpv.z * 1.4) * 0.34;
      tmpv.multiplyScalar(f);
      tmpv.y = Math.max(tmpv.y, -0.55);
      p.setXYZ(i, tmpv.x, tmpv.y * 0.82, tmpv.z);
    }
    g.computeVertexNormals();
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // darker, mossier boulders — the old light-gray tone flashed white at
      // distance under the sun/env light and read as pixel errors
      const l = 0.28 + vr() * 0.09 + p.getY(i) * 0.05;
      let rh = 0.09 + vr() * 0.02, rs = 0.07, rl = clamp(l, 0.16, 0.44);
      if (P.rockTone) { const t = P.rockTone(rh, rs, rl); rh = t[0]; rs = t[1]; rl = clamp(t[2], 0, 1); }
      _col.setHSL(rh, rs, rl, THREE.SRGBColorSpace);
      col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    rockGeos.push(g);
  }
  const rockPlacements = [[], [], []];
  function tryRock(x, z, scMin, scMax, slopePref) {
    const vv = (rng() * 3) | 0;
    const yawR = rng() * Math.PI * 2;
    const sc = scMin + Math.pow(rng(), 1.6) * (scMax - scMin);
    if (Math.max(Math.abs(x), Math.abs(z)) > 485) return false;
    if (x > v.x0 - 8 && x < v.x1 + 8 && z > v.z0 - 8 && z < v.z1 + 8) return false;
    if (heightField._roadDist(x, z) < 6) return false;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
    for (const s of [L.spawns.player, ...L.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 16) return false;
    }
    if (slopePref) {
      const steep = heightField.getNormalAt(x, z).y < 0.93;
      if (!steep && rng() > 0.30) return false; // prefer rocky slopes
    }
    const y = heightField.getHeightAt(x, z) - 0.22 * sc;
    _quat.setFromAxisAngle(_upAxis, yawR);
    _mat4.compose(_posv.set(x, y, z), _quat, new THREE.Vector3(sc, sc * (0.8 + rng() * 0.35), sc));
    rockPlacements[vv].push(_mat4.clone());
    if (sc >= 1.25) {
      const e = sc * 1.15;
      obstacles.push({ min: [x - e, y, z - e], max: [x + e, y + sc * 1.1, z + e] });
      colliders.push({ min: [x - e, y, z - e], max: [x + e, y + sc * 1.1, z + e] });
    }
    return true;
  }
  for (let i = 0, placed = 0; i < P.rocks * 9 && placed < P.rocks; i++) {
    if (tryRock((rng() * 2 - 1) * 485, (rng() * 2 - 1) * 485, 0.9, 2.8, true)) placed++;
  }
  // boulder outcrop clusters: chunky hull-down cover groups in the open field
  for (let c = 0, made = 0; c < P.outcrops * 8 && made < P.outcrops; c++) {
    const cx = (rng() * 2 - 1) * 420, cz = (rng() * 2 - 1) * 420;
    if (heightField._roadDist(cx, cz) < 12) continue;
    const n = 3 + (rng() * 3) | 0;
    let got = 0;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, rr = 1.5 + rng() * 6;
      if (tryRock(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 1.3, 3.2, false)) got++;
    }
    if (got > 0) made++;
  }
  for (let vi = 0; vi < 3; vi++) {
    if (rockPlacements[vi].length === 0) continue;
    const im = new THREE.InstancedMesh(rockGeos[vi], mats.rock, rockPlacements[vi].length);
    for (let i = 0; i < rockPlacements[vi].length; i++) im.setMatrixAt(i, rockPlacements[vi][i]);
    im.castShadow = true;
    im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.computeBoundingSphere();
    group.add(im);
  }

  // --- field haystacks: classic WoT soft-cover silhouettes in the open ---
  for (let i = 0, placed = 0; i < P.haystacks * 22 && placed < P.haystacks; i++) {
    const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
    if (x > v.x0 - 10 && x < v.x1 + 10 && z > v.z0 - 10 && z < v.z1 + 10) continue;
    if (heightField._roadDist(x, z) < 9) continue;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
    if (heightField.getNormalAt(x, z).y < 0.92) continue;
    let nearSpawn = false;
    for (const s of [L.spawns.player, ...L.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 18) { nearSpawn = true; break; }
    }
    if (nearSpawn) continue;
    const y = heightField.getHeightAt(x, z);
    const hr = 1.7 + rng() * 0.9, hh = 2.1 + rng() * 1.0;
    const stack = new THREE.ConeGeometry(hr, hh, 9, 2);
    { // slouch the profile so it reads as piled hay, not a geometric cone
      const sp = stack.attributes.position;
      for (let k = 0; k < sp.count; k++) {
        const rr2 = Math.hypot(sp.getX(k), sp.getZ(k));
        if (rr2 > 1e-4) {
          const f = 1 + (rng() - 0.5) * 0.24;
          sp.setX(k, sp.getX(k) * f); sp.setZ(k, sp.getZ(k) * f);
        }
      }
      stack.computeVertexNormals();
    }
    scaleUV(stack, 3, 1.5);
    stack.rotateY(rng() * Math.PI * 2);
    stack.translate(x, y + hh / 2 - 0.12, z);
    buckets.straw.push(stack);
    obstacles.push({ min: [x - hr * 0.9, y, z - hr * 0.9], max: [x + hr * 0.9, y + hh, z + hr * 0.9] });
    colliders.push({ min: [x - hr * 0.9, y, z - hr * 0.9], max: [x + hr * 0.9, y + hh, z + hr * 0.9] });
    placed++;
  }

  // --- field clutter: fallen logs + stumps (visual ground detail) ---
  for (let i = 0, placed = 0; P.logs && i < 260 && placed < 26; i++) {
    const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
    if (x > v.x0 - 6 && x < v.x1 + 6 && z > v.z0 - 6 && z < v.z1 + 6) continue;
    if (heightField._roadDist(x, z) < 7) continue;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
    const y = heightField.getHeightAt(x, z);
    if (rng() < 0.6) { // log
      const r = 0.16 + rng() * 0.13, len = 2.2 + rng() * 1.9;
      const log = new THREE.CylinderGeometry(r * 0.85, r, len, 7, 1);
      scaleUV(log, 1.0, len * 0.5);
      log.rotateZ(Math.PI / 2 + (rng() - 0.5) * 0.1);
      log.rotateY(rng() * Math.PI * 2);
      log.translate(x, y + r * 0.75, z);
      buckets.wood.push(log);
    } else { // stump
      const r = 0.22 + rng() * 0.15, h = 0.35 + rng() * 0.3;
      const st = new THREE.CylinderGeometry(r * 0.92, r * 1.15, h, 8, 1);
      scaleUV(st, 1.5, 0.5);
      st.rotateY(rng() * Math.PI);
      st.translate(x, y + h / 2 - 0.06, z);
      buckets.wood.push(st);
    }
    placed++;
  }

  // --- wrecked hay cart near the village edge ---
  {
    function buildCart(x, z, yaw) {
      const y = heightField.getHeightAt(x, z);
      const parts = { plaster: [], stone: [], roof: [], wood: [], dark: [], straw: [] };
      const bed = box(1.7, 0.13, 2.7, 0.8);
      bed.rotateZ(0.13);
      parts.wood.push(bed.translate(0, 0.62, 0));
      for (const s of [-1, 1]) {
        const rail = box(0.09, 0.34, 2.7, 1.2);
        rail.rotateZ(0.13);
        parts.wood.push(rail.translate(s * 0.82, 0.85 - s * 0.11, 0));
      }
      const wheel = new THREE.CylinderGeometry(0.62, 0.62, 0.09, 12, 1);
      scaleUV(wheel, 2, 2);
      wheel.rotateZ(Math.PI / 2);
      parts.wood.push(wheel.clone().translate(0.98, 0.62, -0.85));
      parts.wood.push(wheel.clone().translate(0.98, 0.62, 0.85));
      const fallen = wheel.clone();
      fallen.rotateX(Math.PI / 2);
      parts.wood.push(fallen.translate(-1.35, 0.07, 0.7));
      const shaft = box(0.08, 0.08, 1.9, 1.2);
      shaft.rotateX(-0.5);
      parts.wood.push(shaft.translate(-0.5, 0.35, -2.0));
      _quat.setFromAxisAngle(_upAxis, yaw);
      _mat4.compose(_posv.set(x, y, z), _quat, _one);
      mergeInto(buckets, parts, _mat4);
      obstacles.push({ min: [x - 1.6, y, z - 1.6], max: [x + 1.6, y + 1.1, z + 1.6] });
      colliders.push({ min: [x - 1.6, y, z - 1.6], max: [x + 1.6, y + 1.1, z + 1.6] });
    }
    let carts = 0;
    for (let i = 4; P.carts && L.roads.length >= 2 && i < L.roads[1].length - 1 && carts < 2; i += 7) {
      const [ax, az] = L.roads[1][i];
      const cxp = ax + 8.5, czp = az + 6.5;
      if (Math.max(Math.abs(cxp), Math.abs(czp)) > 440) continue;
      if (heightField._roadDist(cxp, czp) < 6) continue;
      if (heightField.getGroundType(cxp, czp) === 'soft' || noVeg(cxp, czp)) continue;
      buildCart(cxp, czp, rng() * Math.PI * 2);
      carts++;
    }
  }

  // --- sandbag emplacements: defensive clusters along the main road + plaza ---
  if (SOURCED.sandbags) {
    const srng = mulberry32(seed + 401);
    const sbBig = bakedGeometry('sack_trench_quaternius', { targetH: 1.35, sink: 0.12 });
    const sbSmall = bakedGeometry('sack_trench_small_quaternius', { targetH: 1.05, sink: 0.1 });
    const sbWall = bakedGeometry('sandbags_jtoastie', { targetH: 1.0, sink: 0.1 });
    let placedS = 0;
    const roadA = L.roads[0];
    for (let i = 6; i < roadA.length - 2 && placedS < 9; i += 3) {
      const [ax, az] = roadA[i], [bx, bz] = roadA[i + 1];
      if (Math.abs(az) > 330) continue;
      const tl = Math.hypot(bx - ax, bz - az);
      const side = (i % 2) ? 1 : -1;
      const sx = ax - ((bz - az) / tl) * 8.6 * side, sz = az + ((bx - ax) / tl) * 8.6 * side;
      if (Math.max(Math.abs(sx), Math.abs(sz)) > 460) continue;
      if (heightField._roadDist(sx, sz) < 5.5) continue;
      if (heightField.getGroundType(sx, sz) === 'soft' || noVeg(sx, sz)) continue;
      if (heightField.getNormalAt(sx, sz).y < 0.9) continue;
      let clearB = true;
      for (const pb of placedB) if (Math.hypot(sx - pb.x, sz - pb.z) < pb.rr + 4) { clearB = false; break; }
      if (!clearB) continue;
      const y = heightField.getHeightAt(sx, sz);
      // face the road: bags run perpendicular to the offset direction
      const yaw = Math.atan2(bx - ax, bz - az) + (srng() - 0.5) * 0.3;
      const pick = srng();
      const geo = pick < 0.45 ? sbBig : pick < 0.8 ? sbSmall : sbWall;
      const name = pick < 0.45 ? 'sbBig' : pick < 0.8 ? 'sbSmall' : 'sbWall';
      addBakedInstance(name, geo, sx, y - 0.04, sz, yaw, 1.25 + srng() * 0.3);
      const e = 2.6;
      obstacles.push({ min: [sx - e, y, sz - e], max: [sx + e, y + 1.3, sz + e] });
      colliders.push({ min: [sx - e, y, sz - e], max: [sx + e, y + 1.3, sz + e] });
      placedS++;
    }
    // plaza corner nest by the well
    {
      const nx = junction.x - 11, nz = junction.z - 8;
      const y = heightField.getHeightAt(nx, nz);
      addBakedInstance('sbBig', sbBig, nx, y - 0.04, nz, Math.PI * 0.7, 1.4);
      addBakedInstance('sbSmall', sbSmall, nx + 3.4, y - 0.04, nz + 1.6, Math.PI * 0.25, 1.3);
      obstacles.push({ min: [nx - 3, y, nz - 2.5], max: [nx + 4.5, y + 1.4, nz + 3] });
      colliders.push({ min: [nx - 3, y, nz - 2.5], max: [nx + 4.5, y + 1.4, nz + 3] });
    }
  }

  // --- street rubble piles (urban): heaped masonry chunks + broken beams ---
  // r6: every 4th candidate may land in a 90 m OUTSKIRT band around the town
  // rect — shelled approaches carry debris too; the establishing camera used
  // to frame nothing but clean lawn between itself and the first block
  if (P.rubblePiles > 0) {
    const rrng = mulberry32(seed + 403);
    for (let i = 0, placed = 0; i < P.rubblePiles * 14 && placed < P.rubblePiles; i++) {
      const ext = (i % 4 === 0) ? 90 : 0;
      const x = v.x0 - ext + rrng() * (v.x1 - v.x0 + ext * 2);
      const z = v.z0 - ext + rrng() * (v.z1 - v.z0 + ext * 2);
      const outskirt = x < v.x0 || x > v.x1 || z < v.z0 || z > v.z1;
      const rd = heightField._roadDist(x, z);
      if (rd < 4.5 || rd > (outskirt ? 70 : 16)) continue; // keep lanes open
      let clear = true;
      for (const pb of placedB) if (Math.hypot(x - pb.x, z - pb.z) < pb.rr + 2.5) { clear = false; break; }
      if (!clear) continue;
      let nearSpawn = false;
      for (const s of [L.spawns.player, ...L.spawns.enemies]) {
        if (Math.hypot(x - s.x, z - s.z) < 20) { nearSpawn = true; break; }
      }
      if (nearSpawn || Math.hypot(x - junction.x, z - junction.z) < 16) continue;
      addRubblePile(x, z, 1.6 + rrng() * 1.3, rrng);
      placed++;
    }
  }

  // --- street curbs (town maps): raised stone kerb lines along both sides of
  // every street inside the town rect, broken at crossings ---
  if (P.curbs) {
    // r6: urban kerbs/pavements read as CONCRETE, not planks — the urban
    // stone bucket is Bricks097 and its elongated courses on thin slabs read
    // as wooden boardwalk; route them to the plaster bucket on urban only
    const kerbBucket = mapId === 'urban' ? 'plaster' : 'stone';
    for (let ri = 0; ri < roads.length; ri++) {
      const nodes = roads[ri];
      for (let i = 0; i < nodes.length - 1; i++) {
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < v.x0 - 6 || mx > v.x1 + 6 || mz < v.z0 - 6 || mz > v.z1 + 6) continue;
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        const tx = dx / len, tz = dz / len;
        const nSub = Math.max(1, Math.ceil(len / 5.2));
        const segLen = (len / nSub) * 1.03;
        const yaw = -Math.atan2(tz, tx);
        for (let k = 0; k < nSub; k++) {
          const tt0 = k / nSub, tt = (k + 0.5) / nSub, tt1 = (k + 1) / nSub;
          const cx = ax + dx * tt, cz = az + dz * tt;
          for (const side of [-1, 1]) {
            const px = cx - tz * side * 5.05, pz = cz + tx * side * 5.05;
            if (distToOtherRoads(px, pz, ri) < 6.8) continue; // open corners
            const y = heightField.getHeightAt(px, pz);
            const g = box(segLen, 0.26, 0.34, 1.3);
            jitterUV(g, rng);
            g.rotateY(yaw);
            g.translate(px, y + 0.06, pz);
            buckets[kerbBucket].push(g);
            // r5: PAVEMENT slab behind the kerb — a 2.2 m sidewalk strip
            // flanking every street, pitched to the terrain per sub-segment.
            // The critique's "town = boxes dropped on a lawn" came straight
            // from streets with no built edge between asphalt and grass.
            const sx0 = ax + dx * tt0 - tz * side * 6.35, sz0 = az + dz * tt0 + tx * side * 6.35;
            const sx1 = ax + dx * tt1 - tz * side * 6.35, sz1 = az + dz * tt1 + tx * side * 6.35;
            const h0 = heightField.getHeightAt(sx0, sz0);
            const h1 = heightField.getHeightAt(sx1, sz1);
            const walk = box(segLen, 0.16, 2.25, 0.9);
            jitterUV(walk, rng);
            walk.rotateZ(Math.atan2(h1 - h0, segLen));
            walk.rotateY(yaw);
            walk.translate((sx0 + sx1) / 2, (h0 + h1) / 2 + 0.10, (sz0 + sz1) / 2);
            buckets[kerbBucket].push(walk);
          }
        }
      }
    }
  }

  // --- central-square monument (town maps): stepped stone obelisk ---
  if (P.monument) {
    let ox = junction.x - 8, oz = junction.z - 9;
    for (let i = 0; i < 24 && heightField._roadDist(ox, oz) < 6; i++) { ox -= 1.5; oz -= 1; }
    const oy = heightField.getHeightAt(ox, oz);
    buckets.stone.push(box(2.4, 0.5, 2.4, 0.8).translate(ox, oy + 0.2, oz));
    buckets.stone.push(box(1.5, 0.6, 1.5, 0.8).translate(ox, oy + 0.72, oz));
    const shaft = box(0.72, 3.4, 0.72, 1.2);
    jitterUV(shaft, rng);
    buckets.stone.push(shaft.translate(ox, oy + 2.7, oz));
    const tip = new THREE.ConeGeometry(0.5, 0.7, 4, 1);
    tip.rotateY(Math.PI / 4);
    scaleUV(tip, 1, 1);
    tip.translate(ox, oy + 4.75, oz);
    buckets.stone.push(tip);
    obstacles.push({ min: [ox - 1.3, oy, oz - 1.3], max: [ox + 1.3, oy + 5.1, oz + 1.3] });
    colliders.push({ min: [ox - 1.3, oy, oz - 1.3], max: [ox + 1.3, oy + 5.1, oz + 1.3] });
  }

  // --- ground-blend decals: dirt/AO ring under buildings + shell craters ---
  {
    function makeDecalTexture(kind) {
      const s = 128;
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, s, s);
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      if (kind === 'scorch') {
        g.addColorStop(0, 'rgba(26,20,14,0.92)');
        g.addColorStop(0.38, 'rgba(52,38,24,0.85)');
        g.addColorStop(0.66, 'rgba(84,66,42,0.55)');
        g.addColorStop(1, 'rgba(90,74,48,0)');
      } else {
        // foundation skirt: dark packed-earth AO ring so buildings sit IN the
        // ground instead of floating on the grass
        g.addColorStop(0, 'rgba(52,42,27,0.94)');
        g.addColorStop(0.4, 'rgba(66,53,34,0.82)');
        g.addColorStop(0.72, 'rgba(78,64,42,0.5)');
        g.addColorStop(1, 'rgba(82,68,45,0)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      // ragged edge: punch noise holes in the outer band
      const id = ctx.getImageData(0, 0, s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
        const rr = Math.hypot(dx, dy);
        const nse = noi.noise(x * 0.11 + (kind === 'scorch' ? 40 : 0), y * 0.11) * 0.5 + 0.5;
        const edge = smoothstep(0.55, 1.0, rr);
        id.data[(y * s + x) * 4 + 3] *= clamp(1 - edge * (0.4 + nse * 1.1), 0, 1);
      }
      ctx.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    }
    // terrain-conformed disc; profile[] lifts each ring above the ground
    function conformedDisc(x, z, r, profile) {
      const rings = [0, 0.4, 0.7, 1.0], segs = 18;
      const nv = 1 + (rings.length - 1) * segs;
      const pos = new Float32Array(nv * 3);
      const uv = new Float32Array(nv * 2);
      pos[0] = x; pos[1] = heightField.getHeightAt(x, z) + profile[0]; pos[2] = z;
      uv[0] = 0.5; uv[1] = 0.5;
      let vi = 1;
      for (let ri = 1; ri < rings.length; ri++) {
        for (let k = 0; k < segs; k++) {
          const a = (k / segs) * Math.PI * 2;
          const px = x + Math.cos(a) * r * rings[ri], pz = z + Math.sin(a) * r * rings[ri];
          pos[vi * 3] = px;
          pos[vi * 3 + 1] = heightField.getHeightAt(px, pz) + profile[ri];
          pos[vi * 3 + 2] = pz;
          uv[vi * 2] = 0.5 + Math.cos(a) * 0.5 * rings[ri];
          uv[vi * 2 + 1] = 0.5 + Math.sin(a) * 0.5 * rings[ri];
          vi++;
        }
      }
      const idx = [];
      for (let k = 0; k < segs; k++) idx.push(0, 1 + k, 1 + ((k + 1) % segs));
      for (let ri = 1; ri < rings.length - 1; ri++) {
        const a0 = 1 + (ri - 1) * segs, b0 = 1 + ri * segs;
        for (let k = 0; k < segs; k++) {
          const k1 = (k + 1) % segs;
          idx.push(a0 + k, b0 + k, a0 + k1, a0 + k1, b0 + k, b0 + k1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }
    function addDecalMesh(geos, tex) {
      if (geos.length === 0) return;
      const mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false,
        roughness: 0.97, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      engineCtx.setupShadowMaterial(mat);
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 1;
      group.add(mesh);
    }
    const dirtDiscs = [];
    for (const b of buildingFeatures) {
      dirtDiscs.push(conformedDisc(b.x, b.z, Math.max(b.w, b.d) * 1.05, [0.05, 0.05, 0.05, 0.04]));
    }
    addDecalMesh(dirtDiscs, makeDecalTexture('dirt'));
    // craters: scattered shell holes with a raised rim mound. Town maps
    // (P.townCraters) let them pock the streets and squares themselves —
    // the contract's shelled-town read needs impact scars ON the asphalt,
    // not just in the fields outside the rect.
    const craterDiscs = [];
    for (let i = 0, placed = 0; i < P.craters * 11 && placed < P.craters; i++) {
      const x = (rng() * 2 - 1) * 420, z = (rng() * 2 - 1) * 420;
      const inTown = x > v.x0 - 4 && x < v.x1 + 4 && z > v.z0 - 4 && z < v.z1 + 4;
      if (inTown && !P.townCraters) continue;
      if (heightField._roadDist(x, z) < (inTown ? 1.5 : 5.5)) continue;
      if (inTown) {
        let onBuilding = false;
        for (const pb of placedB) {
          if (Math.hypot(x - pb.x, z - pb.z) < pb.rr + 1.5) { onBuilding = true; break; }
        }
        if (onBuilding) continue;
      }
      if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
      let nearSpawn = false;
      for (const s of [L.spawns.player, ...L.spawns.enemies]) {
        if (Math.hypot(x - s.x, z - s.z) < 20) { nearSpawn = true; break; }
      }
      if (nearSpawn) continue;
      const r = 2.4 + rng() * 2.6;
      craterDiscs.push(conformedDisc(x, z, r, [0.04, 0.06, 0.14 + rng() * 0.12, 0.03]));
      placed++;
    }
    addDecalMesh(craterDiscs, makeDecalTexture('scorch'));
  }

  // --- sourced-model InstancedMeshes (one per model, shared baked material) ---
  for (const [, e] of bakedInstances) {
    if (e.list.length === 0) continue;
    const im = new THREE.InstancedMesh(e.geo, mats.baked, e.list.length);
    for (let i = 0; i < e.list.length; i++) im.setMatrixAt(i, e.list[i]);
    im.castShadow = true;
    im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.computeBoundingSphere();
    group.add(im);
  }

  // --- merge buckets into one mesh per material ---
  for (const key of Object.keys(buckets)) {
    if (buckets[key].length === 0) continue;
    // mergeGeometries requires uniform indexing (ExtrudeGeometry is non-indexed)
    const merged = mergeGeometries(buckets[key].map((g) => (g.index ? g.toNonIndexed() : g)), false);
    const mesh = new THREE.Mesh(merged, mats[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }

  return { group, obstacles, colliders, features: { buildings: buildingFeatures } };
}
