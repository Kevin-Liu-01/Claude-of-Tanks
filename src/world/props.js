// src/world/props.js — rocks, ~10-building village, walls and cover props.
// Contract: docs/ARCHITECTURE.md §3.2. All geometry composed BufferGeometry,
// all textures canvas-generated, everything merged into few draw calls.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../engine/simplexFast.js';
import { applyTone } from './terrain.js';
import { applySourcedBuildings } from './sourcedTextures.js';
import { URBAN_BUILDERS } from './maps/urbanKit.js';
import { dressMapExtras } from './maps/mapKits.js'; // content_breadth r2
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
    // r3: blue carries a smooth 1-2 cycle field — sampled at very low world
    // frequency it drives the per-neighbourhood facade tint drift below
    const c2 = torusN(noi, u, v, 2, 2, 133) * 0.7 + torusN(noi, u, v, 5, 5, 171) * 0.3;
    px[j] = (a * 0.5 + 0.5) * 255;
    px[j + 1] = (b * 0.5 + 0.5) * 255;
    px[j + 2] = (c2 * 0.5 + 0.5) * 255; px[j + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}

function box(w, h, d, uvScale = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleUV(g, Math.max(w, d) * uvScale, h * uvScale);
}

// r2 terrain_environment: per-face-correct UV box for THIN SLABS (roof
// planes, sidewalks). box() scales V by the box HEIGHT on every face — on a
// 0.12 m-thick roof slab the top face's V axis actually runs along the slab
// LENGTH, so the tile texture was stretched ~200:1 into featureless orange
// streaks (the critique's "untextured flat orange planes"). BoxGeometry face
// order: +x,-x,+y,-y,+z,-z, 4 verts each — scale each face by its true
// world dimensions so tile rows resolve on the visible plane.
function slabBox(w, h, d, uvScale = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const su = [d, d, w, w, w, w], sv = [h, h, d, d, h, h];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * su[f] * uvScale, uv.getY(i) * sv[f] * uvScale);
    }
  }
  return g;
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
  // (content_breadth r3: wallBucket may now be plaster2/plaster3 — the
  // parts literal below carries all wall families)
  const w = 5.2 + rng() * 1.2, d = 7.0 + rng() * 2.2;
  const wallH = 2.9, roofH = 1.9 + rng() * 0.4, over = 0.35;
  const parts = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0)); // foundation (sinks)
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  // roof slabs
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = slabBox(slope + 0.15, 0.12, d + over * 2, 0.35); // r2: real tile rows (see slabBox)
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  // r2: ridge cap — the bare slab junction read as an extruded cardboard fold
  parts.roof.push(slabBox(0.34, 0.13, d + over * 2, 0.5).translate(0, wallH + roofH + 0.04, 0));
  // r2: chimney with cap slab + clay pot (was a bare stub most shots missed)
  parts.stone.push(box(0.55, 1.6, 0.55).translate(w * 0.22, wallH + roofH - 0.2, d * 0.22));
  parts.stone.push(box(0.72, 0.12, 0.72).translate(w * 0.22, wallH + roofH + 0.56, d * 0.22));
  {
    const pot = new THREE.CylinderGeometry(0.09, 0.12, 0.30, 6, 1);
    scaleUV(pot, 0.5, 0.5);
    pot.translate(w * 0.22, wallH + roofH + 0.74, d * 0.22);
    parts.roof.push(pot);
  }
  // door on +z gable end (r2: + lintel and a stone doorstep)
  parts.wood.push(box(1.1, 2.1, 0.10).translate(w * 0.08, 1.05, d / 2 + 0.10));
  parts.dark.push(box(0.86, 1.9, 0.06).translate(w * 0.08, 1.0, d / 2 + 0.16));
  parts.wood.push(box(1.3, 0.14, 0.14).translate(w * 0.08, 2.16, d / 2 + 0.10));
  parts.stone.push(box(1.24, 0.14, 0.5).translate(w * 0.08, 0.07, d / 2 + 0.28));
  // r2: small dark attic window in the +z gable
  parts.dark.push(box(0.5, 0.6, 0.06).translate(-w * 0.16, wallH + roofH * 0.42, d / 2 + 0.02));
  // windows on long sides
  const nw = 2 + ((rng() * 2) | 0);
  const shutters = rng() < 0.6; // r2: hung shutters on most cottages
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
      if (shutters && rng() < 0.85) {
        parts.wood.push(box(0.05, 1.0, 0.30).translate(side * (w / 2 + 0.04), 1.7, zz - 0.43 - 0.16));
        parts.wood.push(box(0.05, 1.0, 0.30).translate(side * (w / 2 + 0.04), 1.7, zz + 0.43 + 0.16));
      }
    }
  }
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeBarn(rng, buckets) {
  const w = 7.5 + rng() * 1.2, d = 11 + rng() * 2, wallH = 3.6, roofH = 2.6, over = 0.45;
  const parts = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts.wood.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, d / 2 - 0.15));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, -d / 2 + 0.15));
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = slabBox(slope + 0.15, 0.14, d + over * 2, 0.35); // r2: real tile rows
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.07, 0);
    parts.roof.push(slab);
  }
  parts.dark.push(box(2.6, 2.9, 0.10).translate(0, 1.45, d / 2 + 0.08)); // big barn door
  parts.wood.push(box(2.9, 3.1, 0.06).translate(0, 1.55, d / 2 + 0.02));
  // r2 terrain_environment: the barn was a featureless dark box (critique).
  // Ridge cap, vertical batten relief on both long walls, cross-braced door
  // planks, a hayloft door + hoist beam in the gable, and small side windows.
  parts.roof.push(slabBox(0.36, 0.14, d + over * 2, 0.5).translate(0, wallH + roofH + 0.05, 0));
  {
    const nBat = Math.max(6, Math.round(d / 1.15));
    for (let bIdx = 0; bIdx < nBat; bIdx++) {
      const zz = -d / 2 + (bIdx + 0.5) * (d / nBat);
      for (const side of [-1, 1]) {
        const bat = box(0.07, wallH - 0.35, 0.13, 1.4);
        jitterUV(bat, rng);
        parts.wood.push(bat.translate(side * (w / 2 + 0.035), wallH / 2 - 0.1, zz));
      }
    }
    // diagonal door cross-brace plank
    const brace = box(0.16, 3.4, 0.05, 1.2);
    brace.rotateZ(0.72);
    parts.wood.push(brace.translate(0, 1.45, d / 2 + 0.15));
    // hayloft door + hoist beam high in the +z gable
    parts.dark.push(box(1.05, 1.15, 0.08).translate(0, wallH + roofH * 0.42, d / 2 + 0.04));
    parts.wood.push(box(1.25, 0.10, 0.10).translate(0, wallH + roofH * 0.42 + 0.68, d / 2 + 0.04));
    const hoist = box(0.10, 0.10, 0.85, 1.2);
    hoist.translate(0, wallH + roofH * 0.78, d / 2 + 0.35);
    parts.wood.push(hoist);
    // small side windows under the eaves
    for (const side of [-1, 1]) {
      for (const zz of [-d * 0.28, d * 0.28]) {
        if (rng() < 0.25) continue;
        parts.dark.push(box(0.06, 0.5, 0.62).translate(side * (w / 2 + 0.02), wallH - 0.75, zz));
        parts.wood.push(box(0.10, 0.08, 0.74).translate(side * (w / 2 + 0.04), wallH - 1.06, zz));
      }
    }
  }
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeTower(rng, buckets) {
  const w = 3.4, d = 3.4, wallH = 6.4 + rng() * 0.8;
  const parts = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [] };
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
  const parts = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [] };
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
  const parts = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [] };
  parts.stone.push(box(w + 0.3, 0.8, d + 0.3).translate(0, -0.15, 0));
  parts.plaster.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  // parapet rim
  parts.plaster.push(box(w, 0.45, 0.18).translate(0, wallH + 0.22, d / 2 - 0.09));
  parts.plaster.push(box(w, 0.45, 0.18).translate(0, wallH + 0.22, -d / 2 + 0.09));
  parts.plaster.push(box(0.18, 0.45, d - 0.36).translate(w / 2 - 0.09, wallH + 0.22, 0));
  parts.plaster.push(box(0.18, 0.45, d - 0.36).translate(-w / 2 + 0.09, wallH + 0.22, 0));
  parts.wood.push(slabBox(w - 0.2, 0.1, d - 0.2, 0.35).translate(0, wallH + 0.02, 0)); // roof deck (r2: slabBox)
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
  // content_breadth r3: MIXED roof pitches — every house carried the same
  // 1.4-2.0 m gable ("one gable pitch" critique). ~20% low-pitch pans, ~15%
  // steep town gables, the rest the classic band.
  const roofRoll = rng();
  // content_breadth r4: ~13% PARAPET-FLAT roofs — the establishing camera
  // reads the town as roofscape, and an unbroken sheet of same-axis gables
  // was the loudest "archetype repetition" tell along the main street.
  const flatRoof = roofRoll < 0.13;
  const roofH = flatRoof ? 0.7
    : roofRoll < 0.30 ? 0.75 + rng() * 0.35
      : roofRoll < 0.44 ? 1.9 + rng() * 0.55
        : 1.35 + rng() * 0.6;
  const over = 0.3;
  const parts = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [], glass: [], curtain: [] };
  // window-pane material mix (content_breadth r3): mostly sky-catching
  // glass, ~1 in 5 pale curtained interiors, ~1 in 6 stays black (broken /
  // open casements in a shelled town) — kills the uniform void grid
  const paneBucket = () => {
    const r = rng();
    return r < 0.62 ? 'glass' : r < 0.83 ? 'curtain' : 'dark';
  };
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  if (flatRoof) {
    // content_breadth r4: parapet-flat massing — tar deck below a raised
    // parapet with stone coping; breaks the one-gable-pitch roofscape.
    // Deck rides the MATTE vertex-colored 'baked' bucket — the specular
    // 'dark' material (roughness .35) mirrored the sky and every flat roof
    // read as a swimming pool from the establishing camera.
    const deck = box(w - 0.24, 0.10, d - 0.24);
    {
      const n = deck.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = 0.045 + rng() * 0.02;
        col[i * 3] = v * 1.08; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.90;
      }
      deck.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    deck.translate(0, wallH + 0.14, 0);
    if (buckets.baked) { (parts.baked = parts.baked || []).push(deck); }
    else parts.roof.push(deck);
    const ph = 0.55 + rng() * 0.25;
    parts[wallBucket].push(box(w, ph, 0.22).translate(0, wallH + ph / 2, d / 2 - 0.11));
    parts[wallBucket].push(box(w, ph, 0.22).translate(0, wallH + ph / 2, -d / 2 + 0.11));
    parts[wallBucket].push(box(0.22, ph, d).translate(w / 2 - 0.11, wallH + ph / 2, 0));
    parts[wallBucket].push(box(0.22, ph, d).translate(-w / 2 + 0.11, wallH + ph / 2, 0));
    parts.stone.push(box(w + 0.14, 0.10, 0.32).translate(0, wallH + ph + 0.05, d / 2 - 0.11));
    parts.stone.push(box(w + 0.14, 0.10, 0.32).translate(0, wallH + ph + 0.05, -d / 2 + 0.11));
    parts.stone.push(box(0.32, 0.10, d + 0.14).translate(w / 2 - 0.11, wallH + ph + 0.05, 0));
    parts.stone.push(box(0.32, 0.10, d + 0.14).translate(-w / 2 + 0.11, wallH + ph + 0.05, 0));
    if (rng() < 0.6) { // rooftop access hut
      parts[wallBucket].push(box(1.5, 1.1, 1.9).translate((rng() - 0.5) * w * 0.3, wallH + 0.55, (rng() - 0.5) * d * 0.3));
    }
  } else {
    parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
    parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  }
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  if (!flatRoof) for (const side of [-1, 1]) {
    const slab = slabBox(slope + 0.15, 0.13, d + over * 2, 0.35); // r2: real tile rows
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  // content_breadth r4: facade RELIEF that survives to mid distance — a
  // proud eaves cornice band under the roofline (~60%) and stone corner
  // quoin strips on masonry walls (~45%): the two most-repeated street
  // archetypes stop reading as bare extruded boxes
  const trimB = wallBucket === 'plaster' || wallBucket === 'stone' ? 'stone' : 'plaster';
  if (rng() < 0.6) {
    parts[trimB].push(box(w + 0.22, 0.16, 0.12).translate(0, wallH - 0.10, d / 2 + 0.05));
    parts[trimB].push(box(w + 0.22, 0.16, 0.12).translate(0, wallH - 0.10, -d / 2 - 0.05));
    parts[trimB].push(box(0.12, 0.16, d + 0.22).translate(w / 2 + 0.05, wallH - 0.10, 0));
    parts[trimB].push(box(0.12, 0.16, d + 0.22).translate(-w / 2 - 0.05, wallH - 0.10, 0));
  }
  if (rng() < 0.45) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.stone.push(box(0.20, wallH - 0.3, 0.20)
        .translate(sx * (w / 2 + 0.02), (wallH - 0.3) / 2, sz * (d / 2 + 0.02)));
    }
  }
  // r7 ROOFSCAPE: ridge chimney stacks with cap slabs (1-2 per house, real
  // masonry proportions) — the old lone 0.6 m stub on the slope was invisible
  // at gameplay distance and the roofs read as bare extruded caps
  {
    const nChim = 1 + (rng() < 0.55 ? 1 : 0);
    for (let ci = 0; ci < nChim; ci++) {
      const cz = -d * 0.38 + rng() * d * 0.76;
      const cx = (rng() - 0.5) * w * 0.12; // hugs the ridge line
      const ch = 1.1 + rng() * 0.7;
      const stack = box(0.66, ch, 0.66, 0.8);
      jitterUV(stack, rng);
      parts.stone.push(stack.translate(cx, wallH + roofH + ch / 2 - 0.35, cz));
      parts.stone.push(box(0.82, 0.14, 0.82).translate(cx, wallH + roofH + ch - 0.30, cz));
      if (rng() < 0.5) { // clay pot
        const pot = new THREE.CylinderGeometry(0.10, 0.13, 0.34, 6, 1);
        pot.translate(cx + (rng() - 0.5) * 0.3, wallH + roofH + ch - 0.06, cz + (rng() - 0.5) * 0.3);
        parts.roof.push(pot);
      }
    }
  }
  // r7 DORMERS on ~40% of houses: boxed body half-sunk into the slope, dark
  // attic window on the vertical face, pitched cap slab — breaks the bare
  // roof planes the critique flagged
  if (rng() < 0.4 && roofH > 1.45) {
    const nd = 1 + ((rng() * 2) | 0);
    for (let di = 0; di < nd; di++) {
      const dside = rng() < 0.5 ? -1 : 1;
      const dz = -d * 0.30 + rng() * d * 0.60;
      const yc = wallH + roofH * 0.40;
      // roof-surface x at the dormer belt: body straddles the slope plane
      const dx = dside * (w / 2 + over) * 0.55;
      parts[wallBucket].push(box(0.98, 1.0, 0.88).translate(dx, yc + 0.08, dz));
      parts.dark.push(box(0.07, 0.60, 0.52).translate(dx + dside * 0.50, yc + 0.14, dz));
      parts.wood.push(box(0.05, 0.72, 0.10).translate(dx + dside * 0.51, yc + 0.14, dz - 0.31));
      parts.wood.push(box(0.05, 0.72, 0.10).translate(dx + dside * 0.51, yc + 0.14, dz + 0.31));
      const cap = slabBox(1.24, 0.09, 1.04, 0.4);
      cap.rotateZ(dside * ang * 0.5);
      cap.translate(dx - dside * 0.06, yc + 0.72, dz);
      parts.roof.push(cap);
    }
  }
  // window grids on the long sides.
  // r6: ground floors get STREET LIFE — one door or shopfront slot per long
  // side, and ~40% of buildings hang wooden shutters beside their windows.
  // The critique: two facade materials with identical punched black window
  // rectangles and "no street-level doors, shutters, or signage visible".
  const doorK = [(rng() * 97) | 0, (rng() * 97) | 0]; // per-side door slot (mod nwn below)
  const shutters = rng() < 0.4;
  // r7 PER-BUILDING WINDOW LANGUAGE: bay pitch, opening size and a rhythm
  // phase all vary house-to-house — the critique's "repeated identical
  // window spacing across facades" came from every facade computing the same
  // d/2.6 grid with the same 1.25 x 0.82 opening
  const bayPitch = 2.3 + rng() * 0.9;              // m between window bays
  const winW = 0.72 + rng() * 0.22;                // opening width
  const winH = 1.10 + rng() * 0.30;                // opening height
  const wPhase = (rng() - 0.5) * 0.5;              // whole-facade rhythm shift
  const trimBucket = rng() < 0.5 ? 'stone' : wallBucket === 'plaster' ? 'stone' : 'plaster';
  for (let st = 0; st < stories; st++) {
    const wy = 1.8 + st * 2.9;
    const nwn = Math.max(2, Math.round(d / bayPitch));
    for (let k = 0; k < nwn; k++) {
      const zz = -d / 2 + (k + 0.5) * (d / nwn) + wPhase;
      if (zz < -d / 2 + 0.75 || zz > d / 2 - 0.75) continue;
      for (const side of [-1, 1]) {
        const wx = side * (w / 2);
        if (st === 0 && k === doorK[side < 0 ? 0 : 1] % nwn) {
          if (rng() < 0.55) {
            // shopfront: wide display glass, stall riser, lintel + signboard
            parts.glass.push(box(0.07, 1.55, 1.90).translate(wx + side * 0.02, 1.38, zz));
            parts.stone.push(box(0.16, 0.42, 2.06).translate(wx + side * 0.05, 0.32, zz));
            parts.wood.push(box(0.10, 0.15, 2.10).translate(wx + side * 0.055, 2.28, zz));
            parts.wood.push(box(0.09, 0.44, 1.72).translate(wx + side * 0.065, 2.66, zz));
            if (rng() < 0.55) {
              // content_breadth r3: shop AWNING — an angled slab over the
              // display glass; the one street-level cue that still reads as
              // "storefront" from the establishing camera
              const aw = box(0.85, 0.06, 2.15);
              aw.rotateZ(side * -0.42);
              aw.translate(wx + side * 0.52, 2.62, zz);
              parts.roof.push(aw);
            }
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
        // r7 REAL WINDOW REVEALS: pane near-flush, jambs/lintel/sill stand a
        // full 12-16 cm proud with masonry-scale sections — deep trim that
        // still casts shadow lines at gameplay camera distance (the old 5 cm
        // sticks vanished and the glass read painted-on)
        parts[paneBucket()].push(box(0.05, winH, winW).translate(wx + side * 0.012, wy, zz));
        const jw = 0.14, jp = side * 0.065; // jamb section / proudness
        parts[trimBucket].push(box(jw, winH + 0.14, 0.13).translate(wx + jp, wy, zz - winW / 2 - 0.06));
        parts[trimBucket].push(box(jw, winH + 0.14, 0.13).translate(wx + jp, wy, zz + winW / 2 + 0.06));
        // lintel: deeper + taller than the jambs, reads as a structural head
        parts[trimBucket].push(box(0.17, 0.16, winW + 0.34).translate(wx + side * 0.08, wy + winH / 2 + 0.09, zz));
        // projecting sill with a drip shadow under it
        parts.stone.push(box(0.22, 0.11, winW + 0.30).translate(wx + side * 0.10, wy - winH / 2 - 0.07, zz));
        // mid-rail cross bar keeps the pane from reading as one black slab
        parts.wood.push(box(0.07, 0.07, winW).translate(wx + side * 0.038, wy + winH * 0.12, zz));
        if (shutters && rng() < 0.8) {
          parts.wood.push(box(0.05, winH, 0.30).translate(wx + side * 0.03, wy, zz - winW / 2 - 0.30));
          parts.wood.push(box(0.05, winH, 0.30).translate(wx + side * 0.03, wy, zz + winW / 2 + 0.30));
        }
      }
    }
    // gable-face windows (jittered per house, framed like the long sides)
    if (st > 0) {
      const gx = w * (0.14 + rng() * 0.08);
      for (const gz of [d / 2 + 0.05, -d / 2 - 0.05]) {
        for (const gs of [-1, 1]) {
          parts[paneBucket()].push(box(winW, winH, 0.06).translate(gs * gx, wy, gz));
          parts.stone.push(box(winW + 0.28, 0.10, 0.16).translate(gs * gx, wy - winH / 2 - 0.06, gz));
        }
      }
    }
  }
  // string course between ground and first floor on masonry facades: cheap
  // horizontal relief that kills the single-extrusion read from the street
  if (rng() < 0.55) {
    parts[trimBucket].push(box(w + 0.16, 0.14, 0.10).translate(0, 3.32, d / 2 + 0.04));
    parts[trimBucket].push(box(w + 0.16, 0.14, 0.10).translate(0, 3.32, -d / 2 - 0.04));
    parts[trimBucket].push(box(0.10, 0.14, d + 0.16).translate(w / 2 + 0.04, 3.32, 0));
    parts[trimBucket].push(box(0.10, 0.14, d + 0.16).translate(-w / 2 - 0.04, 3.32, 0));
  }
  // street door + shopfront on the +z gable face
  parts.wood.push(box(1.2, 2.3, 0.12).translate(-w * 0.15, 1.15, d / 2 + 0.08));
  parts.dark.push(box(1.0, 2.1, 0.06).translate(-w * 0.15, 1.1, d / 2 + 0.14));
  if (rng() < 0.55) parts.glass.push(box(2.3, 1.5, 0.06).translate(w * 0.18, 1.5, d / 2 + 0.10));
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
    wrecks: 4, // r7: burned-out vehicle hulks along the roads (contested read)
    // r6 terrain_environment dressing passes (per-biome, see map configs):
    // cropFields = standing crop-row plots on open farmland; lampposts =
    // cast-iron street lights along the town grid; hedgehogs = steel anti-
    // tank obstacles scattered on streets/approaches
    cropFields: 0, lampposts: false, hedgehogs: 0,
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
  // content_breadth r3: TWO extra render families — the street walls
  // recycled one plaster print ("same white-plaster box repeats dozens of
  // times", critique). Map configs may author tones.plaster2/plaster3
  // (urban.js does); other maps derive tasteful shifts of their own plaster
  // tone so village cottages inherit the variety for free.
  const _tShift = (base, dh, ds, dl) => (h, s, l) => {
    const [bh, bs, bl] = base ? base(h, s, l) : [h, s, l];
    return [Math.max(0, Math.min(1, bh + dh)),
      Math.max(0, Math.min(1, bs * ds)),
      Math.max(0, Math.min(1, bl * dl))];
  };
  const plaster2 = makePlaster(noi, aniso, T.plaster2 || _tShift(T.plaster, +0.022, 1.1, 0.90));
  const plaster3 = makePlaster(noi, aniso, T.plaster3 || _tShift(T.plaster, -0.035, 0.72, 0.84));
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
    plaster2: new THREE.MeshStandardMaterial({ map: plaster2.albedo, normalMap: plaster2.normal, roughness: 0.93, metalness: 0 }),
    plaster3: new THREE.MeshStandardMaterial({ map: plaster3.albedo, normalMap: plaster3.normal, roughness: 0.93, metalness: 0 }),
    roof: new THREE.MeshStandardMaterial({ map: roofT.albedo, normalMap: roofT.normal, roughness: 0.82, metalness: 0 }),
    stone: new THREE.MeshStandardMaterial({ map: stone.albedo, normalMap: stone.normal, roughness: 0.9, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: wood.albedo, normalMap: wood.normal, roughness: 0.8, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x161a1d, roughness: 0.35, metalness: 0.15 }),
    // content_breadth r3: window PANES get real materials — the old shared
    // near-black 'dark' slabs read as unframed voids at establishing
    // distance (critique). 'glass' is a low-roughness slate that picks up
    // sky/env specular; 'curtain' is a warm pale fill (daytime curtained /
    // shuttered interiors) that breaks the all-black grid.
    glass: new THREE.MeshStandardMaterial({ color: 0x2b3640, roughness: 0.18, metalness: 0.4 }),
    curtain: new THREE.MeshStandardMaterial({ color: 0xb3a992, roughness: 0.92, metalness: 0 }),
    straw: new THREE.MeshStandardMaterial({ map: straw.albedo, normalMap: straw.normal, roughness: 0.95, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    baked: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
  };
  mats.rock.envMapIntensity = 0.35; // no white env-specular sparkle at distance
  mats.baked.envMapIntensity = 0.5; // flat-shaded sourced models: no spec sparkle
  mats.glass.envMapIntensity = 1.5; // panes catch the sky at range

  // world-space grime/variation overlay: a second noise-masked albedo layer
  // (macro tone breakup + streaky weathering) that de-grids every tiled
  // hard-surface texture — walls stop reading as a repeated stamp at zoom
  const grimeTex = makeGrimeTexture(noi, aniso);
  // r5 terrain_environment: WINTER SNOW-CAP — on the winter map every prop
  // material whitens its UP-FACING fragments toward drifted snow (clumpy,
  // noise-broken). This is what fixes the physically-contradictory "fully
  // snow-free saturated orange roofs in a deep-snow scene" critique: roofs,
  // wall tops, chimneys, carts, sourced baked models and rocks all carry a
  // slope-masked snow load, while vertical faces keep their material.
  const snowCap = mapId === 'winter';
  const grimeHook = (shader) => {
    shader.uniforms.uGrime = { value: grimeTex };
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <worldpos_vertex>', /* glsl */`#include <worldpos_vertex>
{
  vec4 gw = vec4(transformed, 1.0);
  vec3 gn = objectNormal;
  #ifdef USE_INSTANCING
  gw = instanceMatrix * gw;
  gn = mat3(instanceMatrix) * gn;
  #endif
  vGrimeW = (modelMatrix * gw).xyz;
  vGrimeN = normalize(mat3(modelMatrix) * gn);
}`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`#include <map_fragment>
{
  float gA = texture2D(uGrime, vGrimeW.xz * 0.021 + vGrimeW.y * 0.013).r;
  float gB = texture2D(uGrime, vec2(vGrimeW.x + vGrimeW.z, vGrimeW.y * 1.7) * 0.055).g;
  diffuseColor.rgb *= 0.84 + gA * 0.30;
  diffuseColor.rgb *= 1.0 - smoothstep(0.58, 0.95, gB) * 0.20;
  // r3 terrain_environment: smooth ~25-60 m warm/cool + value drift so
  // adjacent buildings stop sharing one identical facade/roof tone (the
  // "whole town shares 3-4 materials" tell). Low frequency = no seams
  // across a single wall, but neighbouring houses land on different tints.
  float gC = texture2D(uGrime, vGrimeW.xz * 0.0058 + vec2(0.31, 0.67)).b;
  diffuseColor.rgb *= 0.92 + gC * 0.16;
  diffuseColor.rgb = mix(diffuseColor.rgb,
    diffuseColor.rgb * (gC > 0.5 ? vec3(1.05, 1.0, 0.93) : vec3(0.95, 0.99, 1.06)),
    abs(gC - 0.5) * 1.1);
${snowCap ? `
  // winter: slope-masked snow load on upward faces (clumpy, wind-tailed)
  {
    float swN = texture2D(uGrime, vGrimeW.xz * 0.11 + vec2(0.13, 0.71)).r;
    float sw = smoothstep(0.52, 0.80, vGrimeN.y + (swN - 0.5) * 0.22);
    sw *= 0.72 + 0.28 * texture2D(uGrime, vGrimeW.xz * 0.031).g;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.795, 0.835, 0.90), sw * 0.88);
  }` : ''}
}`);
  };
  for (const [mk, m] of Object.entries(mats)) {
    engineCtx.setupShadowMaterial(m, mk === 'dark' || mk === 'glass' ? null : grimeHook);
    m.customProgramCacheKey = () => 'world-props-' + mk + '-v6' + (snowCap ? 's' : '');
  }

  const buckets = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [], glass: [], curtain: [], straw: [], baked: [] };
  const obstacles = [];
  const colliders = [];
  const crushables = []; // [{x,y,z,r,h,index,toppled}] — telegraph poles (effects_combat r1)
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

  // content_breadth r3: wall-material picker — stone share still follows
  // P.wallStoneChance (desert adobe stays all-sandstone), but the plaster
  // share now splits across the three render families, and a cap stops the
  // SAME plaster print appearing on 3+ consecutive placements (the "same
  // white box repeats dozens of times" critique).
  const _wallHist = [null, null];
  function pickWall(rr) {
    let b = rr() < P.wallStoneChance ? 'stone'
      : (() => { const q = rr(); return q < 0.5 ? 'plaster' : q < 0.8 ? 'plaster2' : 'plaster3'; })();
    if (b !== 'stone' && _wallHist[0] === b && _wallHist[1] === b) {
      b = b === 'plaster' ? 'plaster2' : b === 'plaster2' ? 'plaster3' : 'plaster';
    }
    _wallHist[1] = _wallHist[0]; _wallHist[0] = b;
    return b;
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
      const tmp = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [], glass: [], curtain: [], straw: [], baked: [] };
      const info = builders[bi](rng, tmp, pickWall(rng));
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
  // rubble scatter and the collapsed rowhouse slots).
  // r3 terrain_environment: chunks are no longer axis-clean boxes — each box
  // gets a consistent PER-CORNER offset (shared corners move together, so
  // faces stay welded) turning it into an irregular broken-masonry
  // hexahedron; a scatter of small brick shards rings the pile base.
  const _rubbleOff = new Float32Array(24);
  function roughenChunk(chunk, rrng, amt) {
    for (let c = 0; c < 8; c++) {
      _rubbleOff[c * 3] = (rrng() - 0.5) * amt;
      _rubbleOff[c * 3 + 1] = (rrng() - 0.5) * amt * 0.7;
      _rubbleOff[c * 3 + 2] = (rrng() - 0.5) * amt;
    }
    const cp = chunk.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const ci = (cp.getX(i) > 0 ? 1 : 0) + (cp.getY(i) > 0 ? 2 : 0) + (cp.getZ(i) > 0 ? 4 : 0);
      cp.setXYZ(i, cp.getX(i) + _rubbleOff[ci * 3], cp.getY(i) + _rubbleOff[ci * 3 + 1],
        cp.getZ(i) + _rubbleOff[ci * 3 + 2]);
    }
    chunk.computeVertexNormals();
    return chunk;
  }
  function addRubblePile(x, z, pr, rrng) {
    const y = heightField.getHeightAt(x, z);
    const n = 6 + ((rrng() * 5) | 0);
    for (let k = 0; k < n; k++) {
      const a = rrng() * Math.PI * 2, rr = Math.sqrt(rrng()) * pr;
      const cs = 0.35 + rrng() * 0.8;
      // mix chunk classes: blocky masonry / flat slab / brick-proportioned
      const cls = rrng();
      const chunk = cls < 0.55
        ? box(cs, cs * (0.5 + rrng() * 0.5), cs * (0.6 + rrng() * 0.6), 0.9)
        : cls < 0.8
          ? box(cs * 1.3, cs * 0.22, cs * (0.8 + rrng() * 0.5), 0.9)   // wall slab
          : box(cs * 0.7, cs * 0.3, cs * 0.35, 0.9);                    // brick clump
      roughenChunk(chunk, rrng, cs * 0.34);
      jitterUV(chunk, rrng);
      chunk.rotateY(rrng() * Math.PI);
      chunk.rotateX((rrng() - 0.5) * 0.5);
      chunk.translate(x + Math.cos(a) * rr, y + 0.12 + (1 - rr / pr) * pr * 0.35, z + Math.sin(a) * rr);
      buckets.stone.push(chunk);
    }
    // brick-shard apron: small debris feathering the pile into the ground
    for (let k = 0; k < 7; k++) {
      const a = rrng() * Math.PI * 2, rr = pr * (0.8 + rrng() * 0.6);
      const bs = 0.10 + rrng() * 0.16;
      const shard = roughenChunk(box(bs * 1.7, bs * 0.7, bs, 1.2), rrng, bs * 0.4);
      shard.rotateY(rrng() * Math.PI);
      shard.translate(x + Math.cos(a) * rr, y + 0.05, z + Math.sin(a) * rr);
      buckets.stone.push(shard);
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
          const tmp = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [], glass: [], curtain: [], straw: [], baked: [] };
          const info = ruined
            ? makeRuin(rng, tmp)
            : makeRowhouse(rng, tmp, pickWall(srng), { w, d });
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
        const tmp = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [], glass: [], curtain: [], straw: [], baked: [] };
        const info = builders[bi](rng, tmp, pickWall(rng));
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

  // --- yard set-dressing (r2 terrain_environment): woodpiles, barrels and
  // short garden-fence runs around every free-standing building. The village
  // read as boxes dropped on pristine lawn — lived-in clutter grounds them.
  if (P.yardClutter ?? !P.streetRows) {
    const yrng = mulberry32(seed + 808);
    function yardSpot(pb, rMin, rMax) {
      for (let t = 0; t < 8; t++) {
        const a = yrng() * Math.PI * 2, r = pb.rr + rMin + yrng() * (rMax - rMin);
        const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 4.5 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.9) continue;
        let clear = true;
        for (const ob of placedB) {
          if (ob !== pb && Math.hypot(x - ob.x, z - ob.z) < ob.rr) { clear = false; break; }
        }
        if (clear) return [x, z];
      }
      return null;
    }
    for (const pb of placedB) {
      // woodpile: stacked split logs against the yard
      if (yrng() < 0.6) {
        const spot = yardSpot(pb, 1.2, 3.4);
        if (spot) {
          const [x, z] = spot;
          const y = heightField.getHeightAt(x, z);
          const yaw = yrng() * Math.PI * 2;
          const pxd = Math.sin(yaw), pzd = Math.cos(yaw); // stack axis (perp to logs)
          const rows = [[5, 0.14], [4, 0.40], [2, 0.64]];
          for (const [nLog, ly] of rows) {
            for (let li = 0; li < nLog; li++) {
              const off = (li - (nLog - 1) / 2) * 0.29;
              const log = new THREE.CylinderGeometry(0.125, 0.135, 1.7 + yrng() * 0.3, 6, 1);
              scaleUV(log, 0.8, 0.8);
              jitterUV(log, yrng);
              log.rotateZ(Math.PI / 2); // axis -> world X
              log.rotateY(yaw);
              log.translate(x + pxd * off, y + ly, z + pzd * off);
              buckets.wood.push(log);
            }
          }
        }
      }
      // barrels by the wall
      if (yrng() < 0.7) {
        const spot = yardSpot(pb, 0.8, 2.6);
        if (spot) {
          const n = 1 + ((yrng() * 2) | 0);
          for (let bIdx = 0; bIdx < n; bIdx++) {
            const x = spot[0] + (yrng() - 0.5) * 1.4, z = spot[1] + (yrng() - 0.5) * 1.4;
            const y = heightField.getHeightAt(x, z);
            const tipped = yrng() < 0.25;
            const bar = new THREE.CylinderGeometry(0.30, 0.33, 0.88, 9, 1);
            scaleUV(bar, 1.2, 0.6);
            jitterUV(bar, yrng);
            if (tipped) { bar.rotateX(Math.PI / 2); bar.rotateY(yrng() * Math.PI); bar.translate(x, y + 0.32, z); }
            else bar.translate(x, y + 0.40, z);
            buckets.wood.push(bar);
            for (const hy of tipped ? [] : [0.18, 0.62]) {
              const hoop = new THREE.CylinderGeometry(0.325, 0.325, 0.05, 9, 1, true);
              scaleUV(hoop, 1, 1);
              hoop.translate(x, y + hy, z);
              buckets.dark.push(hoop);
            }
          }
        }
      }
      // short garden-fence run along one side of the yard
      if (yrng() < 0.5) {
        const spot = yardSpot(pb, 2.2, 4.2);
        if (spot) {
          const [x0f, z0f] = spot;
          const yaw = yrng() * Math.PI * 2;
          const tx = Math.cos(yaw), tz = Math.sin(yaw);
          const len = 4.5 + yrng() * 3;
          const nPost = Math.max(3, Math.round(len / 1.4));
          let prev = null;
          for (let k = 0; k <= nPost; k++) {
            const x = x0f + tx * (len * k / nPost - len / 2), z = z0f + tz * (len * k / nPost - len / 2);
            if (heightField._roadDist(x, z) < 4 || noVeg(x, z)) { prev = null; continue; }
            const y = heightField.getHeightAt(x, z);
            const post = box(0.09, 0.95, 0.09, 1.4);
            post.rotateY(yrng() * 0.2);
            post.translate(x, y + 0.42, z);
            buckets.wood.push(post);
            if (prev) {
              const mx = (x + prev[0]) / 2, mz = (z + prev[2]) / 2, my = (y + prev[1]) / 2;
              const rl = Math.hypot(x - prev[0], z - prev[2]);
              for (const rh of [0.36, 0.74]) {
                const rail = box(rl * 1.03, 0.07, 0.06, 1.4);
                rail.rotateZ(Math.atan2(prev[1] - y, rl) * 0.9);
                rail.rotateY(-Math.atan2(z - prev[2], x - prev[0]));
                rail.translate(mx, my + rh, mz);
                buckets.wood.push(rail);
              }
            }
            prev = [x, y, z];
          }
        }
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
    // r4 terrain_environment: record pole stations — catenary WIRES are strung
    // between consecutive poles below (the bare pole line was a critique item:
    // "telephone poles have no visible wires, they read as bare sticks")
    const poleLine = [];
    // r5 terrain_environment: poles every node (~32 m, was every 2nd). The
    // 64 m spans cut CHORDS across the road's curves — one span slashed
    // diagonally through the default chase-cam frame as a hard black line
    // (critique). Short spans follow the carriageway; the wires read as
    // roadside infrastructure instead of a graphical artifact.
    for (let i = 8; P.telegraph && i < roadsL[0].length - 1; i += 1) {
      const [ax, az] = roadsL[0][i], [bx, bz] = roadsL[0][i + 1];
      const tl = Math.hypot(bx - ax, bz - az);
      const px = ax - ((bz - az) / tl) * 6.9, pz = az + ((bx - ax) / tl) * 6.9;
      if (Math.max(Math.abs(px), Math.abs(pz)) > 470 || noVeg(px, pz)) continue;
      const py = heightField.getHeightAt(px, pz);
      const armYaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      poleLine.push({ x: px, y: py, z: pz, yaw: armYaw, sourced: !!SOURCED.poles });
      if (SOURCED.poles) {
        addBakedInstance('pole', poleGeo, px, py - 0.05, pz, armYaw, 1);
        // effects_combat r1: poles are CRUSHABLE — record the instance index
        // so a driving tank can hinge-topple it (crushProp) instead of
        // ghosting through.
        crushables.push({
          x: px, y: py, z: pz, r: 0.45, h: 7.4,
          index: bakedInstances.get('pole').list.length - 1, toppled: false,
        });
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
    // r4 terrain_environment: catenary wire spans between consecutive poles —
    // two conductors per span (one per insulator side), sagging ~0.8 m at
    // mid-span, built as short 4-sided cylinder segments so the line reads
    // as a continuous drooping wire instead of the poles standing as bare
    // sticks (critique). Spans longer than ~85 m (a skipped pole) are left
    // unstrung. Cheap: ~15 spans x 2 wires x 7 segments of 4-side cylinders.
    for (let pi = 0; pi + 1 < poleLine.length; pi++) {
      const A = poleLine[pi], B = poleLine[pi + 1];
      const spanL = Math.hypot(B.x - A.x, B.z - A.z);
      if (spanL > 52 || spanL < 6) continue; // a skipped pole leaves the span unstrung
      // wire attachment height: sourced pole crossarm rides higher than the
      // procedural twin-arm pole
      const hTop = A.sourced ? 6.5 : 5.75;
      for (const s of [-1, 1]) { // one wire per insulator side
        // insulator offset in each pole's OWN arm frame
        const ax2 = A.x + Math.cos(A.yaw) * 0.6 * s, az2 = A.z - Math.sin(A.yaw) * 0.6 * s;
        const bx2 = B.x + Math.cos(B.yaw) * 0.6 * s, bz2 = B.z - Math.sin(B.yaw) * 0.6 * s;
        const ay2 = A.y + hTop, by2 = B.y + hTop;
        // r5 terrain_environment: true COSH catenary at 16 segments (was a
        // 7-seg sin approximation — visible kinks) and a thinner conductor;
        // the drooping curve is what separates "power line" from "polyline"
        const SEGS = 16, CATK = 1.35;
        const droop = 0.45 + spanL * 0.008; // deeper sag on longer spans
        const coshK = Math.cosh(CATK) - 1;
        let prevX = ax2, prevY = ay2, prevZ = az2;
        for (let k2 = 1; k2 <= SEGS; k2++) {
          const t = k2 / SEGS;
          const cat = 1 - (Math.cosh((t - 0.5) * 2 * CATK) - 1) / coshK; // 0 at ends, 1 mid
          const cx2 = ax2 + (bx2 - ax2) * t;
          const cy2 = ay2 + (by2 - ay2) * t - cat * droop;
          const cz2 = az2 + (bz2 - az2) * t;
          const segL = Math.hypot(cx2 - prevX, cy2 - prevY, cz2 - prevZ);
          const wire = new THREE.CylinderGeometry(0.020, 0.020, segL * 1.02, 4, 1);
          wire.rotateX(Math.PI / 2); // axis -> +z, then aim
          const m4w = new THREE.Matrix4().lookAt(
            new THREE.Vector3(prevX, prevY, prevZ),
            new THREE.Vector3(cx2, cy2, cz2),
            new THREE.Vector3(0, 1, 0));
          wire.applyMatrix4(m4w);
          wire.translate((prevX + cx2) / 2, (prevY + cy2) / 2, (prevZ + cz2) / 2);
          buckets.dark.push(wire);
          prevX = cx2; prevY = cy2; prevZ = cz2;
        }
      }
    }
  }

  // --- rocks (instanced, 3 displaced-icosahedron variants) ---
  // r3 terrain_environment: REBUILT. The old detail-1 icospheres with one
  // low-frequency displacement octave kept their geodesic facet pattern and
  // flat (unwelded) normals — a raw white faceted primitive sat in the
  // winter establishing foreground. Now: welded vertices (smooth normals),
  // higher subdivision, THREE displacement octaves for real lumpy boulder
  // silhouettes, and a slope/height-keyed albedo blend (pale weathered top
  // vs darker base) so the tops read snow/lichen-capped per map tone.
  const rockGeos = [];
  for (let vi = 0; vi < 3; vi++) {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, vi === 2 ? 3 : 2));
    const p = g.attributes.position;
    const vr = mulberry32(seed + 30 + vi);
    const tmpv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      tmpv.set(p.getX(i), p.getY(i), p.getZ(i));
      const f = 1
        + noi.noise3d(tmpv.x * 1.4 + vi * 9, tmpv.y * 1.4, tmpv.z * 1.4) * 0.30
        + noi.noise3d(tmpv.x * 3.1 - vi * 17, tmpv.y * 3.1 + 40, tmpv.z * 3.1) * 0.13
        + noi.noise3d(tmpv.x * 6.8 + 91, tmpv.y * 6.8 - vi * 5, tmpv.z * 6.8) * 0.05;
      tmpv.multiplyScalar(f);
      tmpv.y = Math.max(tmpv.y, -0.55);
      p.setXYZ(i, tmpv.x, tmpv.y * 0.82, tmpv.z);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // darker, mossier boulders — the old light-gray tone flashed white at
      // distance under the sun/env light and read as pixel errors
      const upW = clamp(nrm.getY(i), 0, 1);
      const l = 0.26 + vr() * 0.08 + p.getY(i) * 0.04 + upW * upW * 0.10;
      let rh = 0.09 + vr() * 0.02, rs = 0.07, rl = clamp(l, 0.15, 0.48);
      if (P.rockTone) { const t = P.rockTone(rh, rs, rl); rh = t[0]; rs = t[1]; rl = clamp(t[2], 0, 1); }
      // upward faces take the map cap tone harder (snow/dust), sides darker
      _col.setHSL(rh, rs, clamp(rl * (0.86 + upW * 0.22), 0, 1), THREE.SRGBColorSpace);
      col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    rockGeos.push(g);
  }
  const rockPlacements = [[], [], []];
  function tryRock(x, z, scMin, scMax, slopePref, sink = 0.22) {
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
    const y = heightField.getHeightAt(x, z) - sink * sc;
    _quat.setFromAxisAngle(_upAxis, yawR);
    _mat4.compose(_posv.set(x, y, z), _quat, new THREE.Vector3(sc, sc * (0.8 + rng() * 0.35), sc));
    rockPlacements[vv].push(_mat4.clone());
    // sink <= 0.5: half-drifted surface rocks keep their cover role; only the
    // deep-embedded ground-clutter class (0.60) is drive-over
    if (sc >= 1.25 && sink <= 0.5) {
      const e = sc * 1.15;
      obstacles.push({ min: [x - e, y, z - e], max: [x + e, y + sc * 1.1, z + e] });
      colliders.push({ min: [x - e, y, z - e], max: [x + e, y + sc * 1.1, z + e] });
    }
    return true;
  }
  // r3: per-map surface-rock sink (winter buries boulders deeper so they
  // read as drift-covered rock shoulders, not loose balls ON the snow)
  const surfSink = P.rockSink ?? 0.22;
  for (let i = 0, placed = 0; i < P.rocks * 9 && placed < P.rocks; i++) {
    if (tryRock((rng() * 2 - 1) * 485, (rng() * 2 - 1) * 485, 0.9, 2.8, true, surfSink)) placed++;
  }
  // r3 terrain_environment: embedded half-buried boulders — sunk to ~60% so
  // the ground reads like it HOLDS rock instead of hosting loose balls; no
  // colliders (drive-over ground clutter), pairs with the new heightfield
  // micro-relief for a believable near-field ground
  for (let i = 0, placed = 0; i < P.rocks * 5 && placed < Math.round(P.rocks * 0.7); i++) {
    if (tryRock((rng() * 2 - 1) * 470, (rng() * 2 - 1) * 470, 0.55, 1.5, false, 0.60)) placed++;
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
  const stackSpots = []; // r6: fed to the grounding-decal pass below
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
    stackSpots.push({ x, z, r: hr * 1.5 });
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

  // --- standing crop fields (r6 terrain_environment) ------------------------
  // The open farmland carried no crops at all ("summer fields have no crops"
  // critique) — WoT maps stage their fields with standing grain. Each plot is
  // a fan of parallel crop-card rows (terrain-conformed vertical strips, one
  // merged alpha-tested mesh) plus the field's own haystack-ready clearing.
  // ~350 tris/plot — establishing-shot scale dressing at negligible cost.
  if ((P.cropFields ?? 0) > 0) {
    const crng = mulberry32(seed + 515);
    const cs = 256;
    const cc = document.createElement('canvas');
    cc.width = cc.height = cs;
    const cctx = cc.getContext('2d');
    cctx.clearRect(0, 0, cs, cs);
    for (let b = 0; b < 260; b++) { // wheat stalks with seed heads
      const x = crng() * cs;
      const hgt = cs * (0.50 + crng() * 0.42);
      const lean = (crng() - 0.5) * 16;
      const lum = 0.30 + crng() * 0.20;
      _col.setHSL(0.115 + crng() * 0.02, 0.34, lum);
      cctx.strokeStyle = _col.getStyle();
      cctx.lineWidth = 1.2 + crng() * 1.1;
      cctx.beginPath();
      cctx.moveTo(x, cs + 2);
      cctx.quadraticCurveTo(x + lean * 0.4, cs - hgt * 0.6, x + lean, cs - hgt);
      cctx.stroke();
      _col.setHSL(0.105 + crng() * 0.02, 0.38, Math.min(0.62, lum + 0.12));
      cctx.fillStyle = _col.getStyle();
      cctx.beginPath();
      cctx.ellipse(x + lean, cs - hgt, 1.7 + crng(), 4.5 + crng() * 2.5, lean * 0.03, 0, Math.PI * 2);
      cctx.fill();
    }
    const cid = cctx.getImageData(0, 0, cs, cs);
    for (let i = 0; i < cs * cs; i++) { // mean-tone flood so mips don't halo
      if (cid.data[i * 4 + 3] < 24) {
        cid.data[i * 4] = 150; cid.data[i * 4 + 1] = 122; cid.data[i * 4 + 2] = 62;
      }
    }
    cctx.putImageData(cid, 0, 0);
    const cropTex = new THREE.CanvasTexture(cc);
    cropTex.colorSpace = THREE.SRGBColorSpace;
    cropTex.wrapS = THREE.RepeatWrapping;
    cropTex.anisotropy = aniso;
    const cropGeos = [];
    for (let p = 0, made = 0; p < P.cropFields * 30 && made < P.cropFields; p++) {
      const cx = (crng() * 2 - 1) * 380, cz = (crng() * 2 - 1) * 380;
      const pw = 34 + crng() * 26, pd = 26 + crng() * 22; // plot extents
      const pr = Math.hypot(pw, pd) * 0.5;
      if (cx > v.x0 - pr - 14 && cx < v.x1 + pr + 14 && cz > v.z0 - pr - 14 && cz < v.z1 + pr + 14) continue;
      if (heightField._roadDist(cx, cz) < pr + 9) continue;
      if (heightField.getGroundType(cx, cz) === 'soft' || noVeg(cx, cz)) continue;
      let ok = heightField.getNormalAt(cx, cz).y > 0.965;
      for (const s of [L.spawns.player, ...L.spawns.enemies]) {
        if (Math.hypot(cx - s.x, cz - s.z) < pr + 24) { ok = false; break; }
      }
      // flatness scan at the corners: crops on a hillside read broken
      const dirA = crng() * Math.PI;
      const dx = Math.cos(dirA), dz = Math.sin(dirA); // row direction
      const px2 = -dz, pz2 = dx;                      // row-normal direction
      if (ok) {
        const y0 = heightField.getHeightAt(cx, cz);
        for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const qx = cx + dx * ex * pw * 0.5 + px2 * ez * pd * 0.5;
          const qz = cz + dz * ex * pw * 0.5 + pz2 * ez * pd * 0.5;
          if (Math.abs(heightField.getHeightAt(qx, qz) - y0) > 3.2) { ok = false; break; }
        }
      }
      if (!ok) continue;
      const rowPitch = 2.5 + crng() * 0.5;
      const nRows = Math.floor(pd / rowPitch);
      const rowH = 1.05 + crng() * 0.2;
      const tintL = 0.9 + crng() * 0.25; // per-plot ripeness
      for (let r = 0; r < nRows; r++) {
        const off = (r - (nRows - 1) / 2) * rowPitch;
        const rx = cx + px2 * off, rz = cz + pz2 * off;
        const half = pw * (0.44 + crng() * 0.08);
        const nSt = Math.max(3, Math.ceil((half * 2) / 3.4));
        const pos = [], uv = [], idx = [], col = [];
        for (let sIt = 0; sIt <= nSt; sIt++) {
          const t = sIt / nSt;
          const sx2 = rx + dx * (t * 2 - 1) * half;
          const sz2 = rz + dz * (t * 2 - 1) * half;
          const gy = heightField.getHeightAt(sx2, sz2);
          const hh = rowH * (0.86 + crng() * 0.28);
          pos.push(sx2, gy + 0.02, sz2, sx2, gy + hh, sz2);
          uv.push(t * half * 0.8, 0, t * half * 0.8, 1);
          const cshade = tintL * (0.9 + crng() * 0.2);
          col.push(cshade, cshade, cshade, cshade, cshade, cshade);
          if (sIt > 0) {
            const b0 = (sIt - 1) * 2, b1 = sIt * 2;
            idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
        g.setIndex(idx);
        cropGeos.push(g);
      }
      made++;
    }
    if (cropGeos.length > 0) {
      const cropMat = new THREE.MeshStandardMaterial({
        map: cropTex, alphaTest: 0.42, side: THREE.DoubleSide,
        vertexColors: true, roughness: 1.0, metalness: 0.0,
      });
      cropMat.envMapIntensity = 0.5;
      engineCtx.setupShadowMaterial(cropMat);
      const merged = mergeGeometries(cropGeos, false);
      // up-facing normals: crop strips light like the meadow they stand in.
      // (r6 content_breadth hotfix: the strip geometries carry no normal
      // attribute, so allocate the all-up normals instead of dereferencing
      // a missing attribute — this crashed createProps map-wide)
      const nPos = merged.attributes.position.count;
      const nUp = new Float32Array(nPos * 3);
      for (let i = 0; i < nPos; i++) nUp[i * 3 + 1] = 1;
      merged.setAttribute('normal', new THREE.BufferAttribute(nUp, 3));
      const cropMesh = new THREE.Mesh(merged, cropMat);
      cropMesh.name = 'crop-fields';
      cropMesh.castShadow = false;
      cropMesh.receiveShadow = false;
      cropMesh.matrixAutoUpdate = false;
      cropMesh.userData.aoExclude = true; // GTAO prepass ignores alphaTest
      group.add(cropMesh);
    }
  }

  // --- street lampposts (r6 terrain_environment, town maps) -----------------
  // Cast-iron posts marching along the paved grid — the missing street
  // furniture scale cue ("urban streets missing furniture" critique).
  if (P.lampposts) {
    const lrng = mulberry32(seed + 611);
    let lampCount = 0;
    for (let ri = 0; ri < L.roads.length && lampCount < 44; ri++) {
      const nodes = L.roads[ri];
      for (let i = 2; i < nodes.length - 1 && lampCount < 44; i += 2) {
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
        const tl = Math.hypot(bx - ax, bz - az) || 1;
        const side = ((i >> 1) % 2) ? 1 : -1; // alternate sides
        const lx = ax - ((bz - az) / tl) * 6.3 * side;
        const lz = az + ((bx - ax) / tl) * 6.3 * side;
        // town grid only: posts belong to the paved core
        if (lx < v.x0 - 12 || lx > v.x1 + 12 || lz < v.z0 - 12 || lz > v.z1 + 12) continue;
        if (heightField._roadDist(lx, lz) < 4.6) continue;
        let onB = false;
        for (const pb of placedB) {
          if (Math.hypot(lx - pb.x, lz - pb.z) < pb.rr + 1.2) { onB = true; break; }
        }
        if (onB) continue;
        const y = heightField.getHeightAt(lx, lz);
        const H = 4.4 + lrng() * 0.5;
        const pole = new THREE.CylinderGeometry(0.045, 0.085, H, 6, 1);
        scaleUV(pole, 0.6, 2.0);
        pole.translate(lx, y + H / 2, lz);
        buckets.dark.push(pole);
        const collar = new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6, 1);
        collar.translate(lx, y + 0.25, lz);
        buckets.dark.push(collar);
        // curved arm reaching over the carriageway + lantern head
        const armA = Math.atan2(((bx - ax) / tl) * -side * 0, 1) + Math.atan2((ax - lx), (az - lz));
        const arm = new THREE.CylinderGeometry(0.035, 0.045, 1.25, 5, 1);
        arm.rotateZ(Math.PI / 2 - 0.5);
        arm.rotateY(armA);
        arm.translate(lx + Math.sin(armA) * 0.5, y + H - 0.18, lz + Math.cos(armA) * 0.5);
        buckets.dark.push(arm);
        const head = new THREE.CylinderGeometry(0.16, 0.24, 0.34, 6, 1);
        head.translate(lx + Math.sin(armA) * 1.02, y + H - 0.02, lz + Math.cos(armA) * 1.02);
        buckets.dark.push(head);
        const cap = new THREE.ConeGeometry(0.20, 0.16, 6, 1);
        cap.translate(lx + Math.sin(armA) * 1.02, y + H + 0.22, lz + Math.cos(armA) * 1.02);
        buckets.dark.push(cap);
        obstacles.push({ min: [lx - 0.3, y, lz - 0.3], max: [lx + 0.3, y + H, lz + 0.3] });
        lampCount++;
      }
    }
  }

  // --- anti-tank hedgehogs (r6 terrain_environment) --------------------------
  // Steel-beam obstacles on the streets/approaches — the classic shelled-town
  // debris silhouette WoT urban maps scatter at intersections.
  if ((P.hedgehogs ?? 0) > 0) {
    const hrng = mulberry32(seed + 613);
    for (let i = 0, placed = 0; i < P.hedgehogs * 20 && placed < P.hedgehogs; i++) {
      const inTown = hrng() < 0.7;
      const hx = inTown ? v.x0 + hrng() * (v.x1 - v.x0) : (hrng() * 2 - 1) * 320;
      const hz = inTown ? v.z0 + hrng() * (v.z1 - v.z0) : (hrng() * 2 - 1) * 320;
      const rd = heightField._roadDist(hx, hz);
      if (rd > 8.5) continue; // hug the street edges / approaches
      if (rd < 2.2 && hrng() < 0.5) continue; // some ON the road, most beside it
      let onB = false;
      for (const pb of placedB) {
        if (Math.hypot(hx - pb.x, hz - pb.z) < pb.rr + 1.5) { onB = true; break; }
      }
      if (onB || noVeg(hx, hz)) continue;
      let nearSpawn = false;
      for (const s of [L.spawns.player, ...L.spawns.enemies]) {
        if (Math.hypot(hx - s.x, hz - s.z) < 20) { nearSpawn = true; break; }
      }
      if (nearSpawn) continue;
      const y = heightField.getHeightAt(hx, hz);
      const yawH = hrng() * Math.PI * 2;
      const scH = 0.85 + hrng() * 0.35;
      for (let b = 0; b < 3; b++) { // three crossed I-beams
        const beam = box(0.16 * scH, 0.16 * scH, 2.1 * scH, 1.2);
        beam.rotateX(b === 0 ? 0.62 : b === 1 ? -0.62 : 0.02);
        beam.rotateY(yawH + b * (Math.PI * 2 / 3) + (hrng() - 0.5) * 0.3);
        beam.translate(hx, y + 0.62 * scH, hz);
        buckets.dark.push(beam);
      }
      const e = 1.15 * scH;
      obstacles.push({ min: [hx - e, y, hz - e], max: [hx + e, y + 1.3 * scH, hz + e] });
      colliders.push({ min: [hx - e, y, hz - e], max: [hx + e, y + 1.3 * scH, hz + e] });
      placed++;
    }
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

  // --- burned-out vehicle wrecks (r7): charred hulks along the roads -------
  // Every map read PEACEFUL (critique: "no wrecks... maps read uncontested").
  // Generic knocked-out hulks — low hull with collapsed running gear, skewed
  // turret, drooped gun — in charred vertex colors with rust bloom, one merged
  // mesh on the rock material (matte, no spec sparkle), plus a scorch decal
  // pushed into the crater decal pass below.
  const wreckScorch = [];
  if ((P.wrecks ?? 0) > 0) {
    const wrng = mulberry32(seed + 909);
    const wreckGeos = [];
    function charPaint(geo, rustBias) {
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = 0.055 + wrng() * 0.05;
        if (wrng() < rustBias) { // rust bloom patches
          const rl = 0.10 + wrng() * 0.10;
          col[i * 3] = rl * 1.9; col[i * 3 + 1] = rl * 0.95; col[i * 3 + 2] = rl * 0.55;
        } else {
          col[i * 3] = v * 1.06; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.94;
        }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    }
    function buildWreck(x, z, yaw) {
      const y = heightField.getHeightAt(x, z);
      const parts = [];
      const rust = 0.22 + wrng() * 0.25;
      // hull, settled low on dead suspension
      parts.push(charPaint(box(2.9, 0.95, 5.4, 0.6).translate(0, 0.78, 0), rust));
      // glacis wedge
      const gl = box(2.9, 0.9, 1.3, 0.6);
      gl.rotateX(-0.6);
      parts.push(charPaint(gl.translate(0, 0.86, 2.55), rust));
      // track runs (thrown/collapsed): one side sags, one spills forward
      parts.push(charPaint(box(0.55, 0.62, 5.7, 0.8).translate(-1.68, 0.42, 0), rust + 0.1));
      parts.push(charPaint(box(0.55, 0.5, 4.6, 0.8).rotateY(0.06).translate(1.7, 0.34, -0.4), rust + 0.1));
      // skewed turret + drooped gun (knocked out, not parked)
      const tYaw = (wrng() - 0.5) * 1.6;
      const tur = new THREE.CylinderGeometry(1.12, 1.28, 0.62, 10, 1);
      scaleUV(tur, 1, 1);
      tur.rotateY(tYaw);
      parts.push(charPaint(tur.translate(-0.15, 1.55, -0.5), rust));
      const gun = new THREE.CylinderGeometry(0.075, 0.10, 3.3, 6, 1);
      scaleUV(gun, 1, 1);
      gun.rotateX(Math.PI / 2 + 0.10); // droops toward the ground
      gun.rotateY(tYaw);
      parts.push(charPaint(gun.translate(-0.15 + Math.sin(tYaw) * 2.2, 1.28, -0.5 + Math.cos(tYaw) * 2.2), rust * 0.6));
      // blown-open hatch leaning on the turret roof
      parts.push(charPaint(box(0.62, 0.07, 0.62, 1).rotateZ(0.9).translate(0.42, 1.98, -0.7), rust));
      const tilt = (wrng() - 0.5) * 0.12;
      for (const g of parts) {
        g.rotateZ(tilt);
        g.rotateY(yaw);
        g.translate(x, y - 0.06, z);
        wreckGeos.push(g);
      }
      obstacles.push({ min: [x - 3.1, y, z - 3.1], max: [x + 3.1, y + 2.0, z + 3.1] });
      colliders.push({ min: [x - 3.1, y, z - 3.1], max: [x + 3.1, y + 2.0, z + 3.1] });
      wreckScorch.push([x, z]);
    }
    let placedW = 0;
    for (let ri = 0; ri < roads.length && placedW < P.wrecks; ri++) {
      const nodes = roads[ri];
      for (let i = 5; i < nodes.length - 1 && placedW < P.wrecks; i += 4 + ((wrng() * 3) | 0)) {
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
        const tl = Math.hypot(bx - ax, bz - az) || 1;
        const side = wrng() < 0.5 ? -1 : 1;
        const off = 6.5 + wrng() * 4.5;
        const px = ax - ((bz - az) / tl) * off * side;
        const pz = az + ((bx - ax) / tl) * off * side;
        if (Math.max(Math.abs(px), Math.abs(pz)) > 440) continue;
        if (heightField._roadDist(px, pz) < 5.2) continue;
        if (heightField.getGroundType(px, pz) === 'soft' || noVeg(px, pz)) continue;
        if (heightField.getNormalAt(px, pz).y < 0.88) continue;
        let bad = false;
        for (const s of [L.spawns.player, ...L.spawns.enemies]) {
          if (Math.hypot(px - s.x, pz - s.z) < 30) { bad = true; break; }
        }
        if (bad) continue;
        for (const pb of placedB) {
          if (Math.hypot(px - pb.x, pz - pb.z) < pb.rr + 4) { bad = true; break; }
        }
        if (bad || Math.hypot(px - junction.x, pz - junction.z) < 20) continue;
        buildWreck(px, pz, Math.atan2(bx - ax, bz - az) + (wrng() - 0.5) * 0.9);
        placedW++;
      }
    }
    if (wreckGeos.length > 0) {
      const wm = new THREE.Mesh(
        mergeGeometries(wreckGeos.map((g) => (g.index ? g.toNonIndexed() : g)), false),
        mats.rock);
      wm.castShadow = true;
      wm.receiveShadow = true;
      wm.matrixAutoUpdate = false;
      group.add(wm);
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
    // lighting_post r4: urban plaster (~0.88 albedo) on sun-facing horizontal
    // slabs rendered ~100% white ("sidewalks read emissive") — stone reads as
    // concrete-gray on every map.
    const kerbBucket = 'stone';
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
            const g = slabBox(segLen, 0.26, 0.34, 1.3);
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
            const walk = slabBox(segLen, 0.16, 2.25, 0.9); // r2: un-stretched paving
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
      } else if (kind === 'crater') {
        // r5 terrain_environment: SHELL CRATER — near-black pit core, a raw
        // disturbed-earth ring where the rim mound geometry rises, ejecta
        // rays feathering outward. Reads as an impact, not a soft smudge.
        g.addColorStop(0, 'rgba(16,13,10,0.96)');
        g.addColorStop(0.30, 'rgba(30,24,17,0.93)');
        g.addColorStop(0.52, 'rgba(64,50,32,0.88)'); // thrown raw earth on the rim
        g.addColorStop(0.74, 'rgba(70,56,37,0.55)');
        g.addColorStop(1, 'rgba(74,60,40,0)');
      } else if (kind === 'apron') {
        // r6 (content_breadth): packed dirt/grit APRON for town buildings —
        // pale rubble-dust in the urban dirtTone family. Laid as rotated
        // rects hugging each footprint plus courtyard patches between the
        // rows, so blocks read tied into a worked street fabric instead of
        // dropped straight onto lawn (critique, major). Square-metric
        // falloff (see the ragged-edge pass below) keeps the fade parallel
        // to the walls.
        g.addColorStop(0, 'rgba(112,101,84,0.92)');
        g.addColorStop(0.55, 'rgba(104,93,76,0.88)');
        g.addColorStop(0.82, 'rgba(96,86,70,0.72)');
        g.addColorStop(1, 'rgba(90,80,66,0.55)');
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
      if (kind === 'apron') { // grit mottle: swept-dirt texture, not one fill
        const arng = mulberry32(5519);
        for (let k = 0; k < 260; k++) {
          const px = arng() * s, py = arng() * s, pr = 0.8 + arng() * 2.6;
          ctx.fillStyle = arng() < 0.5
            ? `rgba(84,74,60,${0.10 + arng() * 0.16})`
            : `rgba(132,121,102,${0.08 + arng() * 0.14})`;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (kind === 'crater') { // ejecta rays: ragged radial streaks past the rim
        const rrng = mulberry32(7717);
        ctx.strokeStyle = 'rgba(58,46,30,0.55)';
        ctx.lineCap = 'round';
        for (let k = 0; k < 22; k++) {
          const a = rrng() * Math.PI * 2;
          const r0 = s * (0.26 + rrng() * 0.10), r1 = s * (0.38 + rrng() * 0.16);
          ctx.lineWidth = 1.5 + rrng() * 3.5;
          ctx.globalAlpha = 0.35 + rrng() * 0.5;
          ctx.beginPath();
          ctx.moveTo(s / 2 + Math.cos(a) * r0, s / 2 + Math.sin(a) * r0);
          ctx.lineTo(s / 2 + Math.cos(a + (rrng() - 0.5) * 0.2) * r1,
            s / 2 + Math.sin(a + (rrng() - 0.5) * 0.2) * r1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // ragged edge: punch noise holes in the outer band. Aprons use a
      // SQUARE distance metric so the worn fringe runs parallel to the
      // building walls, with a hard guarantee of full transparency at the
      // rect rim.
      const id = ctx.getImageData(0, 0, s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
        const rr = kind === 'apron'
          ? Math.max(Math.abs(dx), Math.abs(dy))
          : Math.hypot(dx, dy);
        const nse = noi.noise(x * 0.11 + (kind === 'scorch' ? 40 : 0), y * 0.11) * 0.5 + 0.5;
        const edge = kind === 'apron'
          ? smoothstep(0.66, 0.99, rr + (nse - 0.5) * 0.20)
          : smoothstep(0.55, 1.0, rr);
        let aMul = clamp(1 - edge * (kind === 'apron' ? 1.0 + nse * 0.25 : 0.4 + nse * 1.1), 0, 1);
        if (kind === 'apron') aMul *= 1 - smoothstep(0.94, 1.0, rr);
        id.data[(y * s + x) * 4 + 3] *= aMul;
      }
      ctx.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    }
    // r5 terrain_environment: TRACK-TEAR strip texture — churned dark earth
    // with two ragged tread lanes running along V; laid as conformed strips
    // on the AI drive corridors so the approaches read fought-over.
    function makeChurnTexture() {
      const w = 128, h = 256;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      const trng = mulberry32(9131);
      // churned base band
      for (let y = 0; y < h; y += 2) {
        const wob = noi.noise(y * 0.05, 3.7) * 10;
        const grd = ctx.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, 'rgba(60,48,32,0)');
        grd.addColorStop(0.22, 'rgba(52,41,27,0.62)');
        grd.addColorStop(0.5, 'rgba(58,46,30,0.72)');
        grd.addColorStop(0.78, 'rgba(52,41,27,0.62)');
        grd.addColorStop(1, 'rgba(60,48,32,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(wob, y, w - wob * 2, 2.4);
      }
      // twin tread lanes: darker compacted ruts with lug chatter
      for (const lane of [0.32, 0.68]) {
        for (let y = 0; y < h; y += 3) {
          const wobL = noi.noise(y * 0.07, lane * 9) * 5;
          ctx.fillStyle = `rgba(28,22,15,${0.55 + (trng() * 0.3)})`;
          ctx.fillRect(w * lane - 7 + wobL, y, 14, 2.2);
        }
        for (let y = 0; y < h; y += 7) { // lug marks across the rut
          ctx.fillStyle = 'rgba(20,16,11,0.5)';
          ctx.fillRect(w * lane - 8 + trng() * 3, y + trng() * 3, 16, 1.6);
        }
      }
      // fade both ends + ragged alpha
      const id = ctx.getImageData(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const vv = y / h;
        const endFade = smoothstep(0, 0.14, vv) * smoothstep(1, 0.86, vv);
        const nse = noi.noise(x * 0.12 + 80, y * 0.12) * 0.5 + 0.5;
        id.data[(y * w + x) * 4 + 3] *= endFade * clamp(0.75 + nse * 0.5, 0, 1);
      }
      ctx.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    }
    // terrain-conformed rectangular strip (track tears): stations every ~2.4 m
    function conformedStrip(ax, az, bx, bz, wS) {
      const len = Math.hypot(bx - ax, bz - az);
      const nSt = Math.max(3, Math.ceil(len / 2.4));
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const nx = -tz, nz = tx;
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= nSt; i++) {
        const t = i / nSt;
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        for (const sd of [-1, 1]) {
          const px = cx + nx * sd * wS / 2, pz = cz + nz * sd * wS / 2;
          pos.push(px, heightField.getHeightAt(px, pz) + 0.05, pz);
          uv.push(sd < 0 ? 0 : 1, t);
        }
        if (i > 0) {
          const b0 = (i - 1) * 2, b1 = i * 2;
          idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
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
    // r6 (content_breadth): terrain-conformed ROTATED RECT (building aprons)
    // — 5x5 vertex grid so the sheet follows the ground; uv spans 0..1 for
    // the square-falloff apron texture.
    function conformedRect(cx, cz, hw, hd, rot) {
      const nx = 5, nz = 5;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const pos = [], uv = [], idx = [];
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const u = ix / (nx - 1), vv = iz / (nz - 1);
          const lx = (u - 0.5) * 2 * hw, lz = (vv - 0.5) * 2 * hd;
          const px = cx + lx * cosR + lz * sinR;
          const pz = cz - lx * sinR + lz * cosR;
          pos.push(px, heightField.getHeightAt(px, pz) + 0.06, pz);
          uv.push(u, vv);
        }
      }
      for (let iz = 0; iz < nz - 1; iz++) {
        for (let ix = 0; ix < nx - 1; ix++) {
          const a = iz * nx + ix, b = a + 1, c2 = a + nx, d2 = c2 + 1;
          idx.push(a, c2, b, b, c2, d2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
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
    const apronGeos = [];
    for (const b of buildingFeatures) {
      if (P.streetRows) {
        // r6 (content_breadth): TOWN buildings get a rotated RECT apron of
        // packed dirt/grit hugging the footprint (+~2.8 m) instead of the
        // round earth ring — whole rowhouse blocks sat directly on grass
        // with no yard/pavement transition (critique, major). Adjacent
        // rowhouses' aprons overlap into continuous worked strips along
        // the street walls.
        apronGeos.push(conformedRect(b.x, b.z,
          b.w / 2 + 2.8, b.d / 2 + 2.8, b.rot || 0));
      } else {
        // r2: 1.05 -> 1.2 — a wider worn-earth apron grounds the building
        dirtDiscs.push(conformedDisc(b.x, b.z, Math.max(b.w, b.d) * 1.2, [0.05, 0.05, 0.05, 0.04]));
      }
    }
    // r6 terrain_environment: grounding decals under EVERY standing prop —
    // telegraph/lamp poles and haystacks sat on untouched pristine grass
    // ("object-terrain grounding is weak" critique). Small worn-earth discs
    // tie them in like the building aprons.
    for (const cp of crushables) {
      dirtDiscs.push(conformedDisc(cp.x, cp.z, 1.15, [0.05, 0.05, 0.04, 0.03]));
    }
    for (const ss of stackSpots) {
      dirtDiscs.push(conformedDisc(ss.x, ss.z, ss.r, [0.05, 0.05, 0.04, 0.03]));
    }
    // r3 terrain_environment (town maps): courtyard/yard wear decals — the
    // ground between buildings was one continuous noise smear; structured
    // trampled-earth patches between the rows read as used yards and paths.
    // r6 (content_breadth): patches upsized (3.2-7.8 -> 4.5-11.5 m) and
    // nearly doubled in count, riding the pale packed-grit apron texture —
    // the block INTERIORS still read as full lawn between the rows
    // (critique); big overlapping courtyard sheets replace the grass with
    // worked ground the way a lived-in town core reads.
    if (P.streetRows) {
      const crng2 = mulberry32(seed + 771);
      for (let i = 0, placed = 0; i < 700 && placed < 84; i++) {
        const x = v.x0 + crng2() * (v.x1 - v.x0);
        const z = v.z0 + crng2() * (v.z1 - v.z0);
        const rd = heightField._roadDist(x, z);
        if (rd < 7 || rd > 40) continue; // block interiors, not the street
        let onB = false;
        for (const pb of placedB) {
          if (Math.hypot(x - pb.x, z - pb.z) < pb.rr + 1) { onB = true; break; }
        }
        if (onB || noVeg(x, z)) continue;
        apronGeos.push(conformedDisc(x, z, 4.5 + crng2() * 7.0, [0.04, 0.04, 0.04, 0.03]));
        placed++;
      }
    }
    addDecalMesh(dirtDiscs, makeDecalTexture('dirt'));
    addDecalMesh(apronGeos, makeDecalTexture('apron'));
    // craters: scattered shell holes with a raised rim mound. Town maps
    // (P.townCraters) let them pock the streets and squares themselves —
    // the contract's shelled-town read needs impact scars ON the asphalt,
    // not just in the fields outside the rect.
    // r5 terrain_environment: CRATER KIT rebuild. The old soft scorch smudge
    // + 0.14-0.26 m rim never registered ("zero battle scarring ... pristine
    // lawns", critique). Now: (a) a dedicated crater texture (black pit, raw
    // rim earth, ejecta rays), (b) a REAL raised rim mound (0.26-0.48 m at
    // the 0.7 ring — catches sun/shadow so the scar reads in silhouette),
    // (c) 3 radius classes, (d) ~55% of craters CLUSTER along the AI drive
    // corridors (spawn -> objective) where the eye actually looks, and (e) a
    // debris-clod ring around the larger holes.
    const craterDiscs = [];
    const burnDiscs = [];
    const corridors = [L.spawns.player, ...L.spawns.enemies]
      .map((sp) => [sp.x, sp.z, v.cx ?? 10, v.cz ?? 40]);
    const CR_R = [2.3, 3.6, 5.2, 6.8];
    for (let i = 0, placed = 0; i < P.craters * 14 && placed < P.craters; i++) {
      let x, z;
      if (rng() < 0.55 && corridors.length) { // corridor-clustered scarring
        const co = corridors[(rng() * corridors.length) | 0];
        const t = 0.16 + rng() * 0.74;
        const lat = (rng() - 0.5) * 44;
        const dx = co[2] - co[0], dz = co[3] - co[1];
        const dl = Math.hypot(dx, dz) || 1;
        x = co[0] + dx * t - (dz / dl) * lat;
        z = co[1] + dz * t + (dx / dl) * lat;
      } else {
        x = (rng() * 2 - 1) * 420; z = (rng() * 2 - 1) * 420;
      }
      if (Math.max(Math.abs(x), Math.abs(z)) > 430) continue;
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
      const roll = rng();
      if (roll < 0.24) { // burnt patch, no rim — HE strike / burn scar
        burnDiscs.push(conformedDisc(x, z, 2.6 + rng() * 2.6, [0.03, 0.03, 0.04, 0.02]));
        placed++;
        continue;
      }
      const r = CR_R[(rng() * CR_R.length) | 0] * (0.85 + rng() * 0.3);
      const rim = 0.26 + rng() * 0.22;
      craterDiscs.push(conformedDisc(x, z, r, [0.03, 0.02, rim, 0.02]));
      // debris-clod ring on the bigger holes (merged into the stone bucket)
      if (r > 3.2) {
        const nCl = 4 + ((rng() * 3) | 0);
        for (let ci = 0; ci < nCl; ci++) {
          const a = rng() * Math.PI * 2;
          const cr2 = r * (0.68 + rng() * 0.45);
          const cs = 0.14 + rng() * 0.26;
          const clod = roughenChunk(box(cs * 1.4, cs * 0.7, cs, 1.3), rng, cs * 0.4);
          jitterUV(clod, rng);
          clod.rotateY(rng() * Math.PI);
          clod.translate(x + Math.cos(a) * cr2,
            heightField.getHeightAt(x + Math.cos(a) * cr2, z + Math.sin(a) * cr2) + cs * 0.25,
            z + Math.sin(a) * cr2);
          buckets.stone.push(clod);
        }
      }
      placed++;
    }
    // r7: burn scar under every vehicle wreck — grounds the hulk and sells
    // the kill site (flat profile: no rim, just scorched earth)
    for (const [wx, wz] of wreckScorch) {
      burnDiscs.push(conformedDisc(wx, wz, 5.6, [0.03, 0.04, 0.05, 0.02]));
    }
    addDecalMesh(craterDiscs, makeDecalTexture('crater'));
    addDecalMesh(burnDiscs, makeDecalTexture('scorch'));
    // r5 terrain_environment: TRACK-TEAR strips along the AI corridors —
    // tread-churned earth runs (14-26 m) with twin rut lanes, conformed to
    // the terrain, so the approaches read driven-over ("no tread-torn earth
    // beyond faint road ruts", critique).
    {
      const trng = mulberry32(seed + 5115);
      const tearGeos = [];
      const nTears = P.streetRows ? 10 : 16;
      for (let i = 0, placed = 0; i < nTears * 10 && placed < nTears; i++) {
        const co = corridors[(trng() * corridors.length) | 0];
        const t = 0.18 + trng() * 0.66;
        const dx = co[2] - co[0], dz = co[3] - co[1];
        const dl = Math.hypot(dx, dz) || 1;
        const lat = (trng() - 0.5) * 30;
        const cx = co[0] + dx * t - (dz / dl) * lat;
        const cz = co[1] + dz * t + (dx / dl) * lat;
        if (Math.max(Math.abs(cx), Math.abs(cz)) > 420) continue;
        if (heightField._roadDist(cx, cz) < 6) continue;
        if (heightField.getGroundType(cx, cz) === 'soft' || noVeg(cx, cz)) continue;
        if (heightField.getNormalAt(cx, cz).y < 0.86) continue;
        let onB = false;
        for (const pb of placedB) {
          if (Math.hypot(cx - pb.x, cz - pb.z) < pb.rr + 2) { onB = true; break; }
        }
        if (onB) continue;
        const ang = Math.atan2(dz, dx) + (trng() - 0.5) * 0.5;
        const hl = 7 + trng() * 6; // half length
        tearGeos.push(conformedStrip(
          cx - Math.cos(ang) * hl, cz - Math.sin(ang) * hl,
          cx + Math.cos(ang) * hl, cz + Math.sin(ang) * hl,
          3.2 + trng() * 0.8));
        placed++;
      }
      addDecalMesh(tearGeos, makeChurnTexture());
    }
  }

  // --- sourced-model InstancedMeshes (one per model, shared baked material) ---
  let poleIM = null; // effects_combat r1: kept for hinge-topple matrix writes
  // r3 terrain_environment: the pale-sand baked sandbag models rendered as
  // raw white lumps on the winter snowfield (probed: the "foreground white
  // icosphere" of the critique was a sack_trench instance at 87 m). Per-map
  // instance tint pulls them to dark wet hessian so they read as emplaced
  // defenses against the snow.
  const bakedTint = mapId === 'winter' ? new THREE.Color(0.52, 0.50, 0.47) : null;
  for (const [name, e] of bakedInstances) {
    if (e.list.length === 0) continue;
    const im = new THREE.InstancedMesh(e.geo, mats.baked, e.list.length);
    const tint = bakedTint && name.startsWith('sb') ? bakedTint : null;
    for (let i = 0; i < e.list.length; i++) {
      im.setMatrixAt(i, e.list[i]);
      if (tint) im.setColorAt(i, tint);
    }
    im.castShadow = true;
    im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.computeBoundingSphere();
    group.add(im);
    if (name === 'pole') { poleIM = im; im.frustumCulled = false; }
  }

  // content_breadth r2: map-specific set dressing (Frosthollow lake basin —
  // shoreline reeds / refrozen pressure ridges / rowboat / jetty). Soft
  // dressing only: pushes into the existing material buckets, no colliders.
  dressMapExtras({ mapId, L, heightField, rng, buckets });

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

  // effects_combat r1: hinge-topple animation state for crushed poles. A
  // toppled pole eases to ~83deg from vertical (falling AWAY from the
  // vehicle's travel direction) with a small end bounce; the instance matrix
  // is rebuilt every tick from the ORIGINAL placement so the hinge never
  // compounds.
  const crushAnims = [];
  const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion();
  const _cax = new THREE.Vector3();
  function crushProp(i, dx, dz) {
    const c = crushables[i];
    if (!c || c.toppled || !poleIM) return false;
    c.toppled = true;
    const l = Math.hypot(dx, dz) || 1;
    // hinge axis: horizontal, perpendicular to travel — pole falls AWAY
    crushAnims.push({ c, t: 0, ax: -dz / l, az: dx / l, placement: null });
    return true;
  }
  function updateProps(dt) {
    if (!crushAnims.length || !poleIM) return;
    for (let k = crushAnims.length - 1; k >= 0; k--) {
      const a = crushAnims[k];
      a.t = Math.min(a.t + dt, 1.1);
      // eased fall to ~83deg with a small end bounce
      const u = Math.min(a.t / 0.8, 1);
      let ang = 1.45 * u * u * (3 - 2 * u);
      if (a.t > 0.8) ang = 1.45 - 0.06 * Math.sin((a.t - 0.8) * 18) * Math.exp(-(a.t - 0.8) * 6);
      const c = a.c;
      if (!a.placement) {
        // capture the ORIGINAL placement on the first tick so the hinge
        // composes against it, never an already-rotated matrix
        poleIM.getMatrixAt(c.index, _cm);
        a.placement = _cm.clone();
      }
      _cax.set(a.ax, 0, a.az).normalize();
      _cq.setFromAxisAngle(_cax, ang);
      const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(_cq))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z))
        .multiply(a.placement);
      poleIM.setMatrixAt(c.index, m);
      poleIM.instanceMatrix.needsUpdate = true;
      if (a.t >= 1.1) crushAnims.splice(k, 1);
    }
  }
  return { group, obstacles, colliders, crushables, crushProp, updateProps,
    features: { buildings: buildingFeatures } };
}
