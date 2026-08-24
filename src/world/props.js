// src/world/props.js — rocks, ~10-building village, walls and cover props.
// Contract: docs/ARCHITECTURE.md §3.2. All geometry composed BufferGeometry,
// all textures canvas-generated, everything merged into few draw calls.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../engine/simplexFast.js';
import { applyTone } from './terrain.js';
import { getDeviceTier } from '../engine/quality.js';
import { applySourcedBuildings } from './sourcedTextures.js';
import { URBAN_BUILDERS } from './maps/urbanKit.js';
import { dressMapExtras } from './maps/mapKits.js'; // content_breadth r2
// world-dressing r1: building-catalog extension + destructible small props
import { VILLAGE_BUILDERS } from './maps/villageKit.js';
import { DESTRUCTIBLE_TYPES, FENCE_SEG, WALL_SEG, bSandbagBroken } from './maps/inhabitKit.js';
import {
  DESTRUCTIBLE_BUILDING_TYPES, STRUCTURE_BUILDERS,
} from './maps/structureKit.js';
import { registerWorldDestructibles, emitBreakFx, emitDestroyed } from './destructibles.js';
import { setToppleAxis, settledToppleAngle } from './topple.js';
import { createUtilityNetwork } from './utilityNetwork.js';
import {
  LOOSE_PROP_STEP_S, createLoosePropBody, kickLooseProp, resetLoosePropBody,
  resolveLoosePropObstacle, resolveLoosePropPair, stepLoosePropBody,
} from './loosePropPhysics.js';
import {
  cloneCollisionRecord, convexHull2, setCircleShape, setConvexShape, setObbShape,
} from './collision.js';
import { hedgehogBeamSpecs, sampleDiscGround, sampleObbGround } from './propPlacement.js';
import {
  box, gablePrism, jitterUV, makeTelephonePoleDistanceGeometry, scaleUV, slabBox,
} from './propGeometry.js';
// DESTRUCTIBLES r1: real-roster tank wrecks baked to static geometry
import { bakeTankWreck, bakeWreckDebris, wreckPool } from './wrecks.js';
import { isPostwarVehicleEra } from '../vehicles/taxonomy.js';
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
    // AA spec (4eccce8): WIDER grooves + softer groove contrast — the 1-2px
    // repeating tile-gap rows with bright specular rims were the loudest
    // remaining shimmer at range (rim softening pairs with the lower
    // normal-map strength below)
    const gap = (inRowY < 0.14 || inTileX < 0.09) ? 1 : 0;
    const curve = Math.sin(inTileX * Math.PI) * 0.5 + 0.5;
    const wear = noi.noise(x * 0.1 - 60, y * 0.1 + 45) * 0.5 + 0.5;
    _col.setHSL(0.028 + tRng * 0.02, 0.42 - wear * 0.12, (0.26 + tRng * 0.10 + curve * 0.04) * (gap ? 0.55 : 1));
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = gap ? 0.16 : 0.4 + curve * 0.5 + (1 - inRowY) * 0.15;
  }
  applyTone(px, tone);
  // normal strength 2.4 -> 1.8: damps the per-tile specular rim glints that
  // aliased into fireflies once a roof fell below ~2px/tile on screen
  return { albedo: toTexture(px, s, { srgb: true, anisotropy }), normal: normalFromHeight(hgt, s, 1.8, anisotropy) };
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

// Neutral detail atlases for the vertex-colored destructible building kit.
// Their RGB stays close to white so the kit palette remains authoritative;
// the texture contributes grain/weave/corrugation and its normal map adds the
// readable material response that flat vertex colors could not provide.
function makeStructureDetail(noi, anisotropy, kind) {
  const s = 128, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const grain = noi.noise(x * 0.17 + (kind === 'steel' ? 70 : 11), y * 0.06 - 31) * 0.5 + 0.5;
    let h = grain, value = 0.90;
    if (kind === 'wood') {
      const plank = (x % 28) / 28;
      const seam = plank < 0.07 ? 1 : 0;
      const rings = Math.sin(y * 0.11 + noi.noise(x * 0.08, y * 0.018) * 4) * 0.5 + 0.5;
      h = seam ? 0.08 : 0.46 + rings * 0.38;
      value = (0.86 + grain * 0.13) * (seam ? 0.68 : 1);
    } else if (kind === 'canvas') {
      const warp = Math.sin(x * Math.PI * 0.52) * 0.5 + 0.5;
      const weft = Math.sin(y * Math.PI * 0.52) * 0.5 + 0.5;
      h = warp * 0.45 + weft * 0.45 + grain * 0.10;
      value = 0.88 + h * 0.10;
    } else {
      const corr = Math.sin(x * Math.PI / 5) * 0.5 + 0.5;
      const scratch = smoothstep(0.72, 0.94, noi.noise(x * 0.09 + 91, y * 0.31 - 17) * 0.5 + 0.5);
      h = corr * 0.80 + grain * 0.20;
      value = 0.86 + corr * 0.12 - scratch * 0.10;
    }
    const v = clamp(value, 0.55, 1) * 255;
    px[j] = v; px[j + 1] = v; px[j + 2] = v; px[j + 3] = 255;
    hgt[i] = h;
  }
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, kind === 'canvas' ? 0.9 : 1.45, anisotropy),
  };
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
  // r7 terrain_environment: opts.whiteCap = [r,g,b] remaps NEAR-WHITE source
  // vertices (min channel > 0.72, low chroma) to the given tone. The
  // telephone pole's 0.90-grey insulator caps rendered as blown emissive
  // blobs at noon — "lit streetlamps" (critique); remapped to dark glazed
  // ceramic they read as insulators.
  const wc = opts.whiteCap || null;
  for (let i = 0; i < m.colors.length; i += 3) {
    let r = m.colors[i] * mul, g = m.colors[i + 1] * mul, b = m.colors[i + 2] * mul;
    if (wc && Math.min(r, g, b) > 0.72 && Math.max(r, g, b) - Math.min(r, g, b) < 0.10) {
      r = wc[0]; g = wc[1]; b = wc[2];
    }
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
  // r7 terrain_environment ROOF CLUTTER: small vent pipes + the occasional
  // wire aerial mast — the ridge chimneys alone left mid-distance roofscapes
  // reading as bare extruded caps (critique: "almost no roof clutter")
  {
    const nVent = 1 + ((rng() * 2) | 0);
    for (let vi2 = 0; vi2 < nVent; vi2++) {
      const vz = -d * 0.34 + rng() * d * 0.68;
      const vSide = rng() < 0.5 ? -1 : 1;
      const vx = vSide * w * (0.10 + rng() * 0.16);
      const vy = wallH + roofH * (1 - Math.abs(vx) / (w / 2 + over)) - 0.12;
      const pipe = new THREE.CylinderGeometry(0.05, 0.06, 0.5 + rng() * 0.3, 5, 1);
      pipe.translate(vx, vy + 0.28, vz);
      parts.dark.push(pipe);
    }
    if (rng() < 0.35) { // wire aerial: thin mast + one cross bar at the top
      const az2 = -d * 0.3 + rng() * d * 0.6;
      const ah = 1.4 + rng() * 0.8;
      const mast = new THREE.CylinderGeometry(0.022, 0.028, ah, 4, 1);
      mast.translate((rng() - 0.5) * w * 0.2, wallH + roofH + ah / 2 - 0.3, az2);
      parts.dark.push(mast);
      const bar = box(0.9 + rng() * 0.5, 0.03, 0.03, 2.0);
      bar.rotateY(rng() * Math.PI);
      bar.translate((rng() - 0.5) * w * 0.2, wallH + roofH + ah - 0.34, az2);
      parts.dark.push(bar);
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
const _scalev = new THREE.Vector3();
const _euler = new THREE.Euler();

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
  const g = propsBuildSteps(heightField, engineCtx, seed, cfg);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/**
 * perf-r3 (play-session probe): chunked twin of {@link createProps} — the
 * one-call build was a single ~1.6 s task behind the loading bar. Awaits
 * `tick(done, total)` between placement families (buildings, rowhouses,
 * walls, trucks, crops, street furniture, wrecks, pool finalization) so the
 * loading screen keeps painting. Byte-identical output: both wrappers drain
 * the same generator, same rng draw order.
 * @param {?function(number, number): (Promise<void>|void)} tick
 */
export async function createPropsAsync(heightField, engineCtx, seed = 2002, cfg = null,
  tick = null, fineSlices = false) {
  const g = propsBuildSteps(heightField, engineCtx, seed, cfg);
  let r = g.next();
  let i = 0;
  const total = fineSlices ? 48 : 9;
  while (!r.done) {
    if (tick && (fineSlices || !r.value || !r.value.fine)) await tick(++i, total);
    r = g.next();
  }
  return r.value;
}

function* propsBuildSteps(heightField, engineCtx, seed, cfg) {
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
    destructibleBuildings: [],
    // Authored composite positions that turn a broad lane into a memorable
    // decision point. Each beat may combine a destructible structure,
    // sandbag redoubt, hard rock outcrop and staged wreck while reusing the
    // existing pooled/merged render families.
    tacticalBeats: [],
    streetRows: false, curbs: false, monument: false, townCraters: false,
    ...((cfg && cfg.props) || {}),
  };
  const mapId = cfg ? cfg.id : 'verdant';
  const rng = mulberry32(seed);
  const detailUvRng = () => 0.5;
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
  const structureWood = makeStructureDetail(noi, aniso, 'wood');
  const structureCanvas = makeStructureDetail(noi, aniso, 'canvas');
  const structureMetal = makeStructureDetail(noi, aniso, 'steel');

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
    // world-dressing r1 + AA agent's FINAL measured glass spec (4eccce8):
    // roughness floor 0.35 (sub-pixel sky-glints shimmered under AA at
    // range — the sky-catch read comes from envMapIntensity, not tightness),
    // metalness <= 0.2, envMapIntensity capped at 1.0 below (1.5 pushed
    // glints past the 1.78 bloom threshold).
    glass: new THREE.MeshStandardMaterial({ color: 0x2b3640, roughness: 0.35, metalness: 0.2 }),
    curtain: new THREE.MeshStandardMaterial({ color: 0xb3a992, roughness: 0.92, metalness: 0 }),
    straw: new THREE.MeshStandardMaterial({ map: straw.albedo, normalMap: straw.normal, roughness: 0.95, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    baked: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    structureWood: new THREE.MeshStandardMaterial({
      map: structureWood.albedo, normalMap: structureWood.normal,
      vertexColors: true, roughness: 0.94, metalness: 0,
    }),
    structureCanvas: new THREE.MeshStandardMaterial({
      map: structureCanvas.albedo, normalMap: structureCanvas.normal,
      vertexColors: true, roughness: 0.98, metalness: 0,
    }),
    structureMetal: new THREE.MeshStandardMaterial({
      map: structureMetal.albedo, normalMap: structureMetal.normal,
      vertexColors: true, roughness: 0.72, metalness: 0.08,
    }),
  };
  mats.rock.envMapIntensity = 0.35; // no white env-specular sparkle at distance
  mats.baked.envMapIntensity = 0.5; // flat-shaded sourced models: no spec sparkle
  mats.structureWood.envMapIntensity = 0.34;
  mats.structureCanvas.envMapIntensity = 0.22;
  mats.structureMetal.envMapIntensity = 0.48;
  mats.glass.envMapIntensity = 1.0; // capped (AA glass spec 4eccce8 — glints
  // above this crossed the 1.78 bloom threshold; the post-side firefly clamp
  // is a safety net, not a design allowance)

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
  const snowCap = mapId === 'winter' || !!P.snowCap;
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
  // crushables — the main.js hull-radius contact loop (effects_combat r1).
  // Entries are telegraph poles ({index} into the pole InstancedMesh) OR
  // world-dressing r1 'loop'-contact destructibles ({recIdx} into the
  // destructible records below): flat/small clutter a hull brushes aside.
  const crushables = []; // [{x,y,z,r,h,toppled, index?|recIdx?}]
  // One renderer-free topology + one InstancedMesh for every conductor
  // segment. Only spans touching a falling pole are rewritten during impact.
  let utilityNetwork = null;
  let wireIM = null;

  // -------------------------------------------------------------------------
  // DESTRUCTIBLE SMALL-PROP LAYER (world-dressing r1) — "just like trees".
  //
  // Every inhabiting object (carts, crates, barrels, fences, stalls, bales,
  // troughs, lamps, ...) is an instance in a per-type InstancedMesh pool with
  // a destructible RECORD. Three trigger paths, all landing in breakRecord():
  //  1. hull overrun of a tagged CRUSHABLE OBSTACLE — the exact tree seam:
  //     state.js SAT detects, queues, calls world.crushObstacle → propIdx
  //     routes here (map.js); state.js applies the speed bite + emits
  //     prop:crushed (generic dust via main.js fx.propCrush);
  //  2. hull-radius contact via the main.js crushables loop ('loop' class —
  //     sapling-grade clutter with NO obstacle at all);
  //  3. shells — src/fx/effects.js forwards per-frame flight segments and
  //     world-impact points through src/world/destructibles.js; light props
  //     are shoot-through (no colliders — a hay bale never eats a shell) and
  //     break cosmetically, HE clears a radius.
  // Break classes: 'break' zero-scales the intact instance and activates a
  // pre-built flattened debris instance in the type's broken pool (no
  // per-frame cost once settled, no respawn); 'topple' runs the pole-style
  // eased hinge fall and persists tipped. Kind-flavored particle bursts ride
  // the destructibles.js seam into fx.propBreak (splinters/staves/hay puff).
  // -------------------------------------------------------------------------
  const drng = mulberry32(seed + 9001); // own stream — never shifts placements
  const destructibles = []; // records: {kind,cls,x,y,z,yaw,sc,r,h,slot,state,ob}
  const looseRecords = []; // physics-class records; sleeping records cost no update work
  const activeLoose = []; // only awake records, bounded by the local interaction area
  const dPools = new Map(); // kind -> {meta, mats4: Matrix4[], imI, imB, nBroken}
  const _dq = new THREE.Quaternion();
  const _de = new THREE.Euler();
  // DESTRUCTIBLES r1: kinds whose INTACT geometry is a licensed baked model
  // (props-models.json) — they cannot live in inhabitKit (no bakedGeometry
  // there). Same meta shape; the shared broken state is the burst-bag heap.
  // keep 0.97: driving a sandbag line barely registers on the speedo.
  const LOCAL_TYPES = {
    sandbagbig: {
      cls: 'break', mat: 'baked', contact: 'ob', r: 2.0, h: 1.35, keep: 0.97,
      build: () => bakedGeometry('sack_trench_quaternius', { targetH: 1.35, sink: 0.12 }),
      broken: bSandbagBroken,
    },
    sandbagsmall: {
      cls: 'break', mat: 'baked', contact: 'ob', r: 1.7, h: 1.05, keep: 0.975,
      build: () => bakedGeometry('sack_trench_small_quaternius', { targetH: 1.05, sink: 0.1 }),
      broken: bSandbagBroken,
    },
    sandbagwall: {
      cls: 'break', mat: 'baked', contact: 'ob', r: 1.5, h: 1.0, keep: 0.975,
      build: () => bakedGeometry('sandbags_jtoastie', { targetH: 1.0, sink: 0.1 }),
      broken: bSandbagBroken,
    },
  };
  function addDestructible(kind, x, y, z, yaw = 0, sc = 1, tiltX = 0, tiltZ = 0) {
    const meta = LOCAL_TYPES[kind] || DESTRUCTIBLE_BUILDING_TYPES[kind] || DESTRUCTIBLE_TYPES[kind];
    if (!meta) throw new Error('world/props: unknown destructible kind ' + kind);
    // Center-point placement left wide props hovering over terrain shoulders.
    // Ground against the authored footprint once at map build time. Explicitly
    // pitched fence/wall modules already fit their endpoints and keep that pose.
    if ((meta.fence || meta.wall)) {
      // Runs are pitched from their endpoints, but a concave terrain sample
      // can still rise beneath the module midpoint. Keep that midpoint buried.
      y = Math.min(y, heightField.getHeightAt(x, z) - 0.025);
    } else if (Math.abs(tiltX) < 0.08 && Math.abs(tiltZ) < 0.08) {
      const support = (meta.hw != null || meta.hl != null)
        ? sampleObbGround(heightField, x, z,
          (meta.hw ?? meta.r) * sc, (meta.hl ?? meta.r) * sc, yaw, 0.025)
        : sampleDiscGround(heightField, x, z,
          (meta.groundR ?? meta.collisionR ?? meta.r) * sc, 0.025);
      y = Math.min(y, support.y);
    }
    let pool = dPools.get(kind);
    if (!pool) { pool = { meta, mats4: [], records: [], imI: null, imB: null, nBroken: 0 }; dPools.set(kind, pool); }
    _de.set(tiltX, yaw, tiltZ, 'YXZ');
    _dq.setFromEuler(_de);
    _mat4.compose(_posv.set(x, y, z), _dq, _scalev.set(sc, sc, sc));
    pool.mats4.push(_mat4.clone());
    const rec = {
      kind, cls: meta.cls, x, y, z, yaw, sc,
      r: meta.r * sc, h: meta.h * sc,
      slot: pool.mats4.length - 1, state: 0, ob: null,
    };
    const idx = destructibles.length;
    destructibles.push(rec);
    pool.records.push(rec);
    if (meta.cls === 'physics') {
      rec.looseIndex = looseRecords.length;
      rec.body = createLoosePropBody({
        x, baseY: y, z,
        radius: (meta.bodyR ?? meta.r) * sc,
        height: rec.h,
        mass: meta.mass ?? 1,
        restitution: meta.bounce ?? 0.32,
        friction: meta.friction ?? 2.2,
        airDrag: meta.airDrag ?? 0.16,
        angularDrag: meta.angularDrag ?? 0.42,
        groundConstrained: meta.groundConstrained === true,
        spinBias: ((idx + seed) & 1) ? 1 : -1,
      });
      rec.looseListed = false;
      looseRecords.push(rec);
    }
    if (meta.contact === 'ob') {
      const rr = (meta.fence || meta.wall) ? Math.max(meta.r * sc, 0.6) : rec.r;
      // fence/wall modules: tight oriented-ish AABB — run direction extents
      let hx = rr, hz = rr;
      if (meta.hw != null || meta.hl != null) {
        const localHw = (meta.hw ?? meta.r) * sc;
        const localHl = (meta.hl ?? meta.r) * sc;
        const cs = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
        hx = localHw * cs + localHl * sn + 0.05;
        hz = localHw * sn + localHl * cs + 0.05;
      } else if (meta.fence || meta.wall) {
        const segLen = meta.wall ? WALL_SEG : FENCE_SEG;
        const thick = meta.wall ? 0.35 : 0.2;
        const cs = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
        hx = (thick * cs + segLen * 0.5 * sn) * sc + 0.05;
        hz = (thick * sn + segLen * 0.5 * cs) * sc + 0.05;
      }
      const ob = {
        min: [x - hx, y, z - hz], max: [x + hx, y + rec.h, z + hz],
        crushable: true, crushed: false, propIdx: idx, kind,
      };
      // Rotated fences/walls/trucks used to collide as their enclosing world
      // AABB, making the empty triangular corners solid. Keep the AABB for
      // the broad phase but publish the authored local footprint too.
      if (meta.hw != null || meta.hl != null) {
        setObbShape(ob, x, z, (meta.hw ?? meta.r) * sc + 0.05,
          (meta.hl ?? meta.r) * sc + 0.05, yaw);
      } else if (meta.fence || meta.wall) {
        const segLen = meta.wall ? WALL_SEG : FENCE_SEG;
        const thick = meta.wall ? 0.35 : 0.2;
        setObbShape(ob, x, z, thick * sc + 0.05, segLen * 0.5 * sc + 0.05, yaw);
      } else if (meta.shape === 'circle') {
        setCircleShape(ob, x, z, (meta.collisionR ?? meta.r) * sc + 0.025);
      } else {
        setObbShape(ob, x, z, rr, rr, yaw);
      }
      // DESTRUCTIBLES r1: per-kind overrun feel — momentum bite + threshold
      // ride the obstacle record into the state.js crush seam.
      if (meta.keep != null) ob.crushKeep = meta.keep;
      if (meta.crushMin != null) ob.crushMin = meta.crushMin;
      rec.ob = ob;
      obstacles.push(ob);
      // Shells: light props stay shoot-through (sapling rule) — but wall
      // modules and trucks are REAL cover while intact: their collider blocks
      // shells/LOS until the record breaks (flagged dead, restored on rematch).
      if (meta.collider) {
        const col = cloneCollisionRecord(ob);
        col.dead = false;
        rec.col = col;
        colliders.push(col);
      }
    } else if (meta.contact === 'loop') {
      const entry = {
        x, y, z, r: rec.r, h: rec.h, recIdx: idx, kind,
        dynamic: meta.cls === 'physics', toppled: false,
      };
      crushables.push(entry);
      rec.loopRef = entry; // breakRecord marks static debris; physics updates its position
    }
    return rec;
  }

  /**
   * March destructible fence MODULES (FENCE_SEG pitch) along a ground line —
   * the wooden-fence side of the wall kit. Modules pitch to the terrain,
   * skip road crossings (natural gaps), and can hang an open GATE module at
   * a skip or at the far end. Every module is an independent destructible:
   * drive-through-able like saplings, breakable by shells.
   * @param {string} kind fence type ('fenceplank'|'fencepicket'|'fencewattle'|'fencerail')
   * @param {number} gateChance chance the first road-gap edge gets a gate
   */
  function placeFenceRun(kind, x0, z0, x1, z1, gateChance = 0.35) {
    const along = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(along / FENCE_SEG));
    const tx = (x1 - x0) / along, tz = (z1 - z0) / along;
    const yaw = Math.atan2(tx, tz); // module runs along local +z
    let gated = false;
    let openRun = false;
    for (let k = 0; k < n; k++) {
      const ax = x0 + tx * (k * FENCE_SEG), az = z0 + tz * (k * FENCE_SEG);
      const bx = x0 + tx * ((k + 1) * FENCE_SEG), bz = z0 + tz * ((k + 1) * FENCE_SEG);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 478) { openRun = false; continue; }
      if (heightField._roadDist(cx, cz) < 4.6 || noVeg(cx, cz)) {
        if (openRun && !gated && drng() < gateChance) {
          // hang an open gate at the field entrance the road cuts
          const gy = heightField.getHeightAt(ax, az);
          addDestructible('gate', ax, gy - 0.06, az, yaw, 1);
          gated = true;
        }
        openRun = false;
        continue;
      }
      if (drng() < 0.05) { openRun = false; continue; } // the odd missing module
      const ya = heightField.getHeightAt(ax, az), yb = heightField.getHeightAt(bx, bz);
      const cy = Math.min(ya, yb);
      const tiltX = Math.atan2(yb - ya, FENCE_SEG) * 0.85;
      addDestructible(kind, cx, cy - 0.06, cz, yaw, 0.96 + drng() * 0.10, tiltX, (drng() - 0.5) * 0.03);
      openRun = true;
    }
  }

  /** Seeded ring scatter of destructibles around a point (yards, markets). */
  function scatterDestructibles(kind, cx, cz, count, rMin, rMax, minRoad = 3.5) {
    let placed = 0;
    for (let t = 0; t < count * 7 && placed < count; t++) {
      const a = drng() * Math.PI * 2, r = rMin + drng() * (rMax - rMin);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) > 478) continue;
      if (heightField._roadDist(x, z) < minRoad || noVeg(x, z)) continue;
      if (heightField.getNormalAt(x, z).y < 0.88) continue;
      let onB = false;
      for (const pb of placedB) {
        if (Math.hypot(x - pb.x, z - pb.z) < pb.rr - 0.5) { onB = true; break; }
      }
      if (onB) continue;
      const y = heightField.getHeightAt(x, z);
      addDestructible(kind, x, y - 0.03, z, drng() * Math.PI * 2, 0.9 + drng() * 0.2);
      placed++;
    }
    return placed;
  }

  const buildingFeatures = [];
  const tacticalBeatFeatures = [];
  // sourced-model instancing: name -> { geo, list: [Matrix4, ...] }
  const bakedInstances = new Map();
  function addBakedInstance(name, geo, x, y, z, yaw, sc = 1, tiltX = 0, tiltZ = 0) {
    let e = bakedInstances.get(name);
    if (!e) { e = { geo, list: [] }; bakedInstances.set(name, e); }
    _quat.setFromEuler(_euler.set(tiltX, yaw, tiltZ, 'YXZ'));
    _mat4.compose(_posv.set(x, y, z), _quat, _scalev.set(sc, sc, sc));
    e.list.push(_mat4.clone());
  }

  function groundFit(x, z, w, d, rot) {
    const cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
    const hx = (w * cs + d * sn) / 2, hz = (w * sn + d * cs) / 2;
    const support = sampleObbGround(heightField, x, z, w / 2, d / 2, rot);
    return { y: support.y, spread: support.spread, hx, hz };
  }

  function addFootprintAABB(list, x, z, y, hx, hz, h,
    localHw = hx, localHl = hz, yaw = 0) {
    const rec = { min: [x - hx, y, z - hz], max: [x + hx, y + h, z + hz] };
    setObbShape(rec, x, z, localHw, localHl, yaw);
    list.push(rec);
  }

  yield;
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
    // world-dressing r1: per-theme catalog — farmhouse/granary/chapel/mill,
    // logcabin/alpine/onionchurch/woodshed, minaret, cornershop, depot
    ...VILLAGE_BUILDERS,
    // Map-quality structure pass: eight new heavyweight landmarks. They use
    // the same bucket merge path, so detail rises without one mesh per house.
    ...STRUCTURE_BUILDERS,
  };
  const builders = P.plan.map((n) => BUILDER_BY_NAME[n] || makeCottage);
  let bi = 0;
  const placedB = [];
  const tacticalReservations = [];
  for (const beat of P.tacticalBeats || []) {
    if (!beat.structure) continue;
    const meta = DESTRUCTIBLE_BUILDING_TYPES[beat.structure];
    if (!meta) continue;
    tacticalReservations.push({
      x: beat.x, z: beat.z,
      rr: Math.hypot(meta.hw, meta.hl) * 0.72 + (beat.reservePad ?? 2.5),
    });
  }
  const conflictsTacticalReservation = (x, z, clearance = 10) => tacticalReservations
    .some((site) => Math.hypot(x - site.x, z - site.z) < site.rr + clearance);
  for (const cand of candidates) {
    // Monumental-city maps place their landmark plan first, then let the
    // rowhouse strips knit dense street walls around those reserved masses.
    if (P.streetRows && !P.streetRowsAfterLandmarks) break;
    if (bi >= builders.length) break;
    for (const side of [-1, 1]) {
      if (bi >= builders.length) break;
      if (rng() < P.sideSkip) continue;
      const lat = P.buildingLat[0] + rng() * P.buildingLat[1];
      const px = cand.x + -cand.tz * side * lat;
      const pz = cand.z + cand.tx * side * lat;
      if (px < v.x0 || px > v.x1 || pz < v.z0 || pz > v.z1) continue;
      if (heightField._roadDist(px, pz) < 7.5 || noVeg(px, pz)) continue;
      if (conflictsTacticalReservation(px, pz)) continue;
      let clear = true;
      for (const pb of placedB) if (Math.hypot(px - pb.x, pz - pb.z) < pb.rr + P.spacingPad) { clear = false; break; }
      if (!clear) continue;
      const rot = Math.atan2(cand.tx, cand.tz) + (rng() - 0.5) * 0.10;
      const tmp = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [], glass: [], curtain: [], straw: [], baked: [] };
      const info = builders[bi](rng, tmp, pickWall(rng));
      const fit = groundFit(px, pz, info.w, info.d, rot);
      if (fit.spread > P.maxSpread) continue;
      // per-building texture phase: no two facades repeat the same grid
      for (const bk of Object.keys(tmp)) for (const g of tmp[bk]) {
        jitterUV(g, g.userData?.detailUv ? detailUvRng : rng);
      }
      _quat.setFromAxisAngle(_upAxis, rot);
      _mat4.compose(_posv.set(px, fit.y + 0.05, pz), _quat, _one);
      mergeInto(buckets, tmp, _mat4);
      addFootprintAABB(obstacles, px, pz, fit.y, fit.hx, fit.hz, info.h,
        info.w * 0.5, info.d * 0.5, rot);
      addFootprintAABB(colliders, px, pz, fit.y, fit.hx, fit.hz, info.h,
        info.w * 0.5, info.d * 0.5, rot);
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
    obstacles.push(setCircleShape(
      { min: [x - pr, y, z - pr], max: [x + pr, y + pr * 0.7, z + pr] }, x, z, pr));
    colliders.push(setCircleShape(
      { min: [x - pr, y, z - pr], max: [x + pr, y + pr * 0.7, z + pr] }, x, z, pr));
  }

  yield;
  // --- contiguous rowhouse strips along the streets (town maps): buildings
  // butt against each other with shared walls, doors on the street, varied
  // heights/facades, the odd collapsed slot spilling rubble into the street ---
  if (P.streetRows) {
    const srng = mulberry32(seed + 505);
    const stripAABBs = []; // {x,z,hx,hz} world-AABB approximations
    const frontageReservations = placedB.slice();
    for (let ri = 0; ri < roads.length; ri++) {
      if (ri % Math.max(1, P.streetRowRoadStride || 1) !== 0) continue;
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
            || noVeg(px, pz)
            || conflictsTacticalReservation(px, pz, Math.hypot(w, d) * 0.5)) { t += 6; continue; }
          if (frontageReservations.some((site) =>
            Math.hypot(px - site.x, pz - site.z) < site.rr + Math.hypot(w, d) * 0.34)) {
            t += w;
            continue;
          }
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
          for (const bk of Object.keys(tmp)) for (const g of tmp[bk]) {
            jitterUV(g, g.userData?.detailUv ? detailUvRng : rng);
          }
          _quat.setFromAxisAngle(_upAxis, rot);
          _mat4.compose(_posv.set(px, fit.y + 0.05, pz), _quat, _one);
          mergeInto(buckets, tmp, _mat4);
          addFootprintAABB(obstacles, px, pz, fit.y, fit.hx, fit.hz, info.h,
            info.w * 0.5, info.d * 0.5, rot);
          addFootprintAABB(colliders, px, pz, fit.y, fit.hx, fit.hz, info.h,
            info.w * 0.5, info.d * 0.5, rot);
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
          // world-dressing r1: standing lamps are DESTRUCTIBLE instances —
          // a moving hull hinge-topples them (tree seam), shells knock them
          // down; the felled post persists across the pavement.
          // lamp kit's arm runs along local +x; the old post aimed local +z
          // over the carriageway with yaw -atan2(tzn,txn) — shift by -pi/2
          const yawL = -Math.atan2(tzn, txn) - Math.PI / 2;
          addDestructible('lamp', lx, ly - 0.02, lz, yawL, 0.95 + frng() * 0.1);
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

  yield;
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
        if (conflictsTacticalReservation(px, pz)) continue;
        if (Math.hypot(px - junction.x, pz - junction.z) < 24) continue;
        let clear = true;
        for (const pb of placedB) if (Math.hypot(px - pb.x, pz - pb.z) < pb.rr + P.spacingPad) { clear = false; break; }
        if (!clear) continue;
        const rot = (brng() < 0.5 ? 0 : Math.PI / 2) + (brng() - 0.5) * 0.06;
        const tmp = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [], glass: [], curtain: [], straw: [], baked: [] };
        const info = builders[bi](rng, tmp, pickWall(rng));
        const fit = groundFit(px, pz, info.w, info.d, rot);
        if (fit.spread > P.maxSpread) continue;
        for (const bk of Object.keys(tmp)) for (const g of tmp[bk]) {
          jitterUV(g, g.userData?.detailUv ? detailUvRng : rng);
        }
        _quat.setFromAxisAngle(_upAxis, rot);
        _mat4.compose(_posv.set(px, fit.y + 0.05, pz), _quat, _one);
        mergeInto(buckets, tmp, _mat4);
        addFootprintAABB(obstacles, px, pz, fit.y, fit.hx, fit.hz, info.h,
          info.w * 0.5, info.d * 0.5, rot);
        addFootprintAABB(colliders, px, pz, fit.y, fit.hx, fit.hz, info.h,
          info.w * 0.5, info.d * 0.5, rot);
        buildingFeatures.push({ x: px, z: pz, w: info.w, d: info.d, rot });
        placedB.push({ x: px, z: pz, rr: Math.max(info.w, info.d) * 0.75 });
        bi++;
      }
    }
  }

  // Map-specific strongpoints. Random dressing is still valuable between
  // lanes, but critical cover cannot be left to a scatter pass: these beats
  // deliberately anchor the brawl, scout and support routes authored by each
  // expansion map. Structures and redoubts reuse destructible pools, so the
  // pass adds no new material or draw-call family.
  if (P.tacticalBeats?.length) {
    for (const beat of P.tacticalBeats) {
      const yaw = THREE.MathUtils.degToRad(beat.yawDeg || 0);
      let structurePlaced = false;
      if (beat.structure) {
        const meta = DESTRUCTIBLE_BUILDING_TYPES[beat.structure];
        if (!meta) throw new Error(`world/props: unknown tactical structure ${beat.structure}`);
        const fit = groundFit(beat.x, beat.z, meta.hw * 2, meta.hl * 2, yaw);
        const rr = Math.hypot(meta.hw, meta.hl) * 0.72;
        let clear = fit.spread <= Math.max(P.maxSpread, beat.maxSpread ?? 3.8)
          && !noVeg(beat.x, beat.z);
        for (const pb of placedB) {
          if (Math.hypot(beat.x - pb.x, beat.z - pb.z) < pb.rr + rr + 1.5) {
            clear = false; break;
          }
        }
        if (clear) {
          addDestructible(beat.structure, beat.x, fit.y + 0.04, beat.z, yaw);
          buildingFeatures.push({ x: beat.x, z: beat.z, w: meta.hw * 2, d: meta.hl * 2, rot: yaw });
          placedB.push({ x: beat.x, z: beat.z, rr });
          structurePlaced = true;
        }
      }
      if (beat.redoubt) {
        const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
        const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
        const offset = beat.redoubtOffset ?? 8.5;
        const cx = beat.x + fwdX * offset, cz = beat.z + fwdZ * offset;
        for (let si = -1; si <= 1; si++) {
          const sx = cx + sideX * si * 3.05, sz = cz + sideZ * si * 3.05;
          const sy = heightField.getHeightAt(sx, sz);
          const kind = si === 0 ? 'sandbagbig' : 'sandbagsmall';
          addDestructible(kind, sx, sy - 0.04, sz, yaw + (si * 0.12), 1.18);
        }
        scatterDestructibles('ammobox', cx - fwdX * 2.2, cz - fwdZ * 2.2, 2, 0.8, 2.2, 0);
        scatterDestructibles('crate', cx - fwdX * 3.0, cz - fwdZ * 3.0, 1, 0.5, 1.5, 0);
      }
      tacticalBeatFeatures.push({
        id: beat.id, role: beat.role, x: beat.x, z: beat.z,
        structurePlaced, redoubt: !!beat.redoubt,
      });
    }
  }

  // Light-building pass: huts, shelters, tents and camp infrastructure are
  // individually destructible, unlike the heavyweight merged landmarks.
  // A separate seeded stream keeps the established village layout stable.
  // Each type becomes one intact InstancedMesh plus an empty broken-state
  // pool, bounded to the handful of families authored by the active map.
  if (P.destructibleBuildings && P.destructibleBuildings.length) {
    const srng = mulberry32(seed + 17041);
    const lateral = P.destructibleBuildingLat || [9.5, 9.0];
    for (const kind of P.destructibleBuildings) {
      const meta = DESTRUCTIBLE_BUILDING_TYPES[kind];
      if (!meta) continue;
      const rr = Math.hypot(meta.hw, meta.hl) * 0.72;
      for (let attempt = 0; attempt < 80; attempt++) {
        let px, pz, rot;
        if (attempt < 52 && candidates.length) {
          const cand = candidates[(srng() * candidates.length) | 0];
          const side = srng() < 0.5 ? -1 : 1;
          const lat = lateral[0] + srng() * lateral[1];
          px = cand.x - cand.tz * side * lat;
          pz = cand.z + cand.tx * side * lat;
          rot = Math.atan2(cand.tx, cand.tz) + (srng() - 0.5) * 0.16;
        } else {
          px = v.x0 + 10 + srng() * Math.max(1, v.x1 - v.x0 - 20);
          pz = v.z0 + 10 + srng() * Math.max(1, v.z1 - v.z0 - 20);
          rot = (srng() < 0.5 ? 0 : Math.PI / 2) + (srng() - 0.5) * 0.14;
          const roadDist = heightField._roadDist(px, pz);
          if (roadDist < 7.5 || roadDist > 48) continue;
        }
        const margin = Math.max(meta.hw, meta.hl) + 2;
        if (px < v.x0 + margin || px > v.x1 - margin || pz < v.z0 + margin || pz > v.z1 - margin) continue;
        if (Math.hypot(px - junction.x, pz - junction.z) < 18 || noVeg(px, pz)) continue;
        const fit = groundFit(px, pz, meta.hw * 2, meta.hl * 2, rot);
        if (fit.spread > Math.max(P.maxSpread, 1.9)) continue;
        let clear = true;
        for (const pb of placedB) {
          if (Math.hypot(px - pb.x, pz - pb.z) < pb.rr + rr + 2.0) { clear = false; break; }
        }
        if (!clear) continue;
        addDestructible(kind, px, fit.y + 0.04, pz, rot);
        buildingFeatures.push({ x: px, z: pz, w: meta.hw * 2, d: meta.hl * 2, rot });
        placedB.push({ x: px, z: pz, rr });
        break;
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
    // world-dressing r1: yard dressing is now the DESTRUCTIBLE inhabiting-
    // object layer — firewood stacks, barrels, troughs, churns, benches,
    // laundry lines and hand carts placed per the map's inhabit config, all
    // instanced + crushable (see the destructible layer above). The garden
    // fence keeps its role as a fence-kit run of breakable modules.
    const INH = P.inhabit || {};
    const yardFence = INH.yardFence || 'fencepicket';
    for (const pb of placedB) {
      if (yrng() < 0.6) { // firewood stack against the yard
        const spot = yardSpot(pb, 1.2, 3.4);
        if (spot) {
          const y = heightField.getHeightAt(spot[0], spot[1]);
          addDestructible('firewood', spot[0], y - 0.03, spot[1], yrng() * Math.PI * 2, 0.9 + yrng() * 0.25);
        }
      }
      if (yrng() < 0.7) { // barrels by the wall
        const spot = yardSpot(pb, 0.8, 2.6);
        if (spot) {
          const n = 1 + ((yrng() * 2) | 0);
          for (let bIdx = 0; bIdx < n; bIdx++) {
            const x = spot[0] + (yrng() - 0.5) * 1.4, z = spot[1] + (yrng() - 0.5) * 1.4;
            const y = heightField.getHeightAt(x, z);
            addDestructible('barrel', x, y - 0.02, z, yrng() * Math.PI * 2, 0.9 + yrng() * 0.25);
          }
        }
      }
      if ((INH.troughs ?? 1) && yrng() < 0.35) { // water trough by the yard
        const spot = yardSpot(pb, 1.4, 3.2);
        if (spot) {
          const y = heightField.getHeightAt(spot[0], spot[1]);
          addDestructible('trough', spot[0], y - 0.03, spot[1], yrng() * Math.PI * 2, 1);
        }
      }
      if ((INH.churns ?? 0) && yrng() < 0.4) { // milk churn pair by the door
        const spot = yardSpot(pb, 0.7, 2.0);
        if (spot) {
          const y = heightField.getHeightAt(spot[0], spot[1]);
          addDestructible('churn', spot[0], y - 0.01, spot[1], yrng() * Math.PI, 1);
          if (yrng() < 0.6) {
            addDestructible('churn', spot[0] + 0.5, heightField.getHeightAt(spot[0] + 0.5, spot[1] + 0.2) - 0.01,
              spot[1] + 0.2, yrng() * Math.PI, 0.95);
          }
        }
      }
      if ((INH.laundry ?? 0) && yrng() < 0.30) { // laundry line across the yard
        const spot = yardSpot(pb, 2.4, 4.4);
        if (spot) {
          const y = heightField.getHeightAt(spot[0], spot[1]);
          addDestructible('laundry', spot[0], y - 0.02, spot[1], yrng() * Math.PI * 2, 1);
        }
      }
      if ((INH.handcarts ?? 1) && yrng() < 0.25) { // hand cart parked outside
        const spot = yardSpot(pb, 1.6, 3.6);
        if (spot) {
          const y = heightField.getHeightAt(spot[0], spot[1]);
          addDestructible('handcart', spot[0], y - 0.02, spot[1], yrng() * Math.PI * 2, 1);
        }
      }
      // short garden-fence run along one side of the yard (breakable modules)
      if (yrng() < 0.5) {
        const spot = yardSpot(pb, 2.6, 4.4);
        if (spot) {
          const yaw = yrng() * Math.PI * 2;
          const tx = Math.cos(yaw), tz = Math.sin(yaw);
          const len = 4.8 + yrng() * 4.8;
          placeFenceRun(yardFence, spot[0] - tx * len / 2, spot[1] - tz * len / 2,
            spot[0] + tx * len / 2, spot[1] + tz * len / 2, 0.2);
        }
      }
    }
  }

  yield;
  // --- low boundary walls (cover) ---
  // world-dressing r1 built these as a styled merged kit; DESTRUCTIBLES r1
  // rebuilds every run as WALL_SEG (3 m) DESTRUCTIBLE MODULES: a tank at
  // speed plows through (crushable obstacle, per-kind momentum scrub, never
  // a hard stop), shells + HE splash breach them LOCALLY (module-granular),
  // and each broken module leaves low crumbled rubble that persists for the
  // battle. Intact modules keep REAL cover value — a per-module collider
  // blocks shells/LOS until it dies with the module. Square END/CORNER POSTS
  // stay static dressing (they anchor breach lips visually), as does the
  // authored gapAt breach (crumbled courses + tumbled blocks).
  function addWallRun(x0, z0, x1, z1, gapAt = -1) {
    const style = P.wallStyle || 'fieldstone';
    const wallB = style === 'adobe' ? 'plaster' : 'stone';
    // brick-style maps route to the stone module (urban's 'stone' texture IS
    // the brick print); adobe keeps its own thicker mud module
    const wallKind = style === 'adobe' ? 'walladobe' : 'wallstone';
    const along = Math.hypot(x1 - x0, z1 - z0);
    const nSeg6 = Math.max(1, Math.round(along / 6)); // legacy gapAt frame
    const nMod = Math.max(1, Math.round(along / WALL_SEG));
    const tx = (x1 - x0) / along, tz = (z1 - z0) / along;
    const yaw = Math.atan2(tx, tz); // module runs along local +z
    const thick = style === 'adobe' ? 0.52 : 0.46;
    const runH = 1.0 + rng() * 0.15; // family height scale
    let prevBuilt = false;
    function endPost(px, pz) {
      const py = heightField.getHeightAt(px, pz) - 0.15;
      const ph = runH * 1.05 + 0.3;
      const post = box(thick + 0.22, ph, thick + 0.22, 0.7);
      jitterUV(post, rng);
      buckets[wallB].push(post.translate(px, py + ph / 2, pz));
      buckets[wallB].push(box(thick + 0.34, 0.12, thick + 0.34, 0.8)
        .translate(px, py + ph + 0.05, pz)); // cap slab
    }
    for (let k = 0; k < nMod; k++) {
      const t0 = k * WALL_SEG, t1 = Math.min((k + 1) * WALL_SEG, along);
      const tc = (t0 + t1) / 2;
      const cx = x0 + tx * tc, cz = z0 + tz * tc;
      // legacy gapAt (authored in the old ~6 m segmentation): modules whose
      // center falls in that span render the static breach instead
      const inGap = gapAt >= 0 && tc >= gapAt * (along / nSeg6) && tc < (gapAt + 1) * (along / nSeg6);
      const skip = heightField._roadDist(cx, cz) < 5.5 || noVeg(cx, cz)
        || Math.max(Math.abs(cx), Math.abs(cz)) > 478;
      if (inGap || skip) {
        if (!skip && inGap && !(k > 0 && gapAt >= 0
          && (tc - WALL_SEG) >= gapAt * (along / nSeg6))) {
          // BROKEN BREACH (once per gap): crumbled remnant + tumbled blocks
          for (const bt of [0.18, 0.82]) { // stub courses at both breach lips
            const sx = x0 + tx * (t0 + bt * (t1 - t0)), sz = z0 + tz * (t0 + bt * (t1 - t0));
            const sy = heightField.getHeightAt(sx, sz) - 0.15;
            const sh = 0.30 + rng() * 0.25;
            const stub = box(thick, sh, WALL_SEG * 0.4, 0.7);
            jitterUV(stub, rng);
            stub.rotateY(yaw);
            buckets[wallB].push(stub.translate(sx, sy + sh / 2, sz));
          }
          for (let b = 0; b < 5; b++) { // tumbled blocks feathering the gap
            const bt = 0.2 + rng() * 0.6;
            const bx2 = x0 + tx * (t0 + bt * (t1 - t0)) + (rng() - 0.5) * 1.6;
            const bz2 = z0 + tz * (t0 + bt * (t1 - t0)) + (rng() - 0.5) * 1.6;
            const bs = 0.16 + rng() * 0.22;
            const blk = roughenChunk(box(bs * 1.5, bs * 0.8, bs, 1.2), rng, bs * 0.4);
            jitterUV(blk, rng);
            blk.rotateY(rng() * Math.PI);
            blk.translate(bx2, heightField.getHeightAt(bx2, bz2) + bs * 0.3, bz2);
            buckets[wallB].push(blk);
          }
        }
        if (prevBuilt) endPost(x0 + tx * t0, z0 + tz * t0); // post at the lip
        prevBuilt = false;
        continue;
      }
      if (!prevBuilt) endPost(x0 + tx * t0, z0 + tz * t0); // run (re)start
      const ya = heightField.getHeightAt(x0 + tx * t0, z0 + tz * t0);
      const yb = heightField.getHeightAt(x0 + tx * t1, z0 + tz * t1);
      const cy = Math.min(ya, yb);
      const tiltX = Math.atan2(yb - ya, t1 - t0) * 0.85;
      addDestructible(wallKind, cx, cy - 0.13, cz, yaw,
        runH * (0.94 + rng() * 0.12), tiltX, (rng() - 0.5) * 0.02);
      prevBuilt = true;
    }
    if (prevBuilt) endPost(x1, z1); // closing post
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
    obstacles.push(setCircleShape(
      { min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] }, wx, wz, 1.1));
    colliders.push(setCircleShape(
      { min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] }, wx, wz, 1.1));
  }

  // --- INHABITING OBJECTS (world-dressing r1): themed destructible dressing
  // per map config zones — market ring on the plaza, working clutter through
  // the village core, hay bales/stooks on the open farmland, oil drums +
  // pallets on industrial aprons, souk pottery/rugs, winter sleds. Density
  // knobs live in cfg.props.inhabit; everything placed here is instanced and
  // destructible (drive-through/knock-over/breakable per class). ---
  {
    const inh = P.inhabit || {};
    // market: stall ring + goods clutter around the junction plaza
    const nStalls = inh.stalls ?? 0;
    if (nStalls > 0) {
      let placedSt = 0;
      for (let t = 0; t < nStalls * 14 && placedSt < nStalls; t++) {
        const a = drng() * Math.PI * 2, r = 9 + drng() * 9;
        const x = junction.x + Math.cos(a) * r, z = junction.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 4.2 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.92) continue;
        let onB = false;
        for (const pb of placedB) {
          if (Math.hypot(x - pb.x, z - pb.z) < pb.rr + 0.5) { onB = true; break; }
        }
        if (onB) continue;
        const y = heightField.getHeightAt(x, z);
        // stall faces the plaza center
        addDestructible('stall', x, y - 0.03, z, Math.atan2(junction.x - x, junction.z - z), 0.95 + drng() * 0.15);
        // goods spill beside it
        if (drng() < 0.8) scatterDestructibles('crate', x, z, 1, 1.6, 2.6);
        if (drng() < 0.6) scatterDestructibles('barrel', x, z, 1 + ((drng() * 2) | 0), 1.4, 2.8);
        if (drng() < 0.5) scatterDestructibles((inh.pots ?? 0) > 0 ? 'pot' : 'pallet', x, z, 1, 1.5, 2.5);
        placedSt++;
      }
      // benches around the square
      scatterDestructibles('bench', junction.x, junction.z, inh.benches ?? 2, 7, 15, 4.0);
    }
    // village-core work clutter: crates/barrels/pallets between the houses
    if ((inh.coreClutter ?? 0) > 0) {
      for (let k = 0; k < inh.coreClutter; k++) {
        const x = v.x0 + drng() * (v.x1 - v.x0);
        const z = v.z0 + drng() * (v.z1 - v.z0);
        if (heightField._roadDist(x, z) < 4.0 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.90) continue;
        let onB = false;
        for (const pb of placedB) {
          if (Math.hypot(x - pb.x, z - pb.z) < pb.rr + 0.3) { onB = true; break; }
        }
        if (onB) continue;
        const y = heightField.getHeightAt(x, z);
        const roll = drng();
        const kind = roll < 0.4 ? 'crate' : roll < 0.7 ? 'barrel' : roll < 0.85 ? 'pallet' : 'handcart';
        addDestructible(kind, x, y - 0.03, z, drng() * Math.PI * 2, 0.9 + drng() * 0.25);
      }
    }
    // open-farmland hay: round bales + harvest stooks scattered on worked land
    function fieldScatter(kind, count) {
      for (let t = 0, placed = 0; t < count * 16 && placed < count; t++) {
        const x = (drng() * 2 - 1) * 420, z = (drng() * 2 - 1) * 420;
        if (x > v.x0 - 8 && x < v.x1 + 8 && z > v.z0 - 8 && z < v.z1 + 8) continue;
        if (heightField._roadDist(x, z) < 8) continue;
        if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.93) continue;
        let nearSpawn = false;
        for (const s of [L.spawns.player, ...L.spawns.enemies]) {
          if (Math.hypot(x - s.x, z - s.z) < 18) { nearSpawn = true; break; }
        }
        if (nearSpawn) continue;
        const y = heightField.getHeightAt(x, z);
        addDestructible(kind, x, y - 0.03, z, drng() * Math.PI * 2, 0.9 + drng() * 0.3);
        // bales/stooks cluster: drop 1-2 partners nearby
        if (drng() < 0.55) {
          const n2 = 1 + ((drng() * 2) | 0);
          for (let j = 0; j < n2; j++) {
            const a2 = drng() * Math.PI * 2, r2 = 2.4 + drng() * 4;
            const x2 = x + Math.cos(a2) * r2, z2 = z + Math.sin(a2) * r2;
            if (heightField._roadDist(x2, z2) < 7 || noVeg(x2, z2)) continue;
            addDestructible(kind, x2, heightField.getHeightAt(x2, z2) - 0.03, z2,
              drng() * Math.PI * 2, 0.85 + drng() * 0.3);
          }
        }
        placed++;
      }
    }
    if ((inh.bales ?? 0) > 0) fieldScatter('bale', inh.bales);
    if ((inh.stooks ?? 0) > 0) fieldScatter('stook', inh.stooks);
    if ((inh.sleds ?? 0) > 0) fieldScatter('sled', inh.sleds);
    // industrial dressing: oil drums + pallet spots along streets/aprons
    if ((inh.drums ?? 0) > 0) {
      for (let t = 0, placed = 0; t < inh.drums * 16 && placed < inh.drums; t++) {
        const x = v.x0 + drng() * (v.x1 - v.x0);
        const z = v.z0 + drng() * (v.z1 - v.z0);
        const rd = heightField._roadDist(x, z);
        if (rd < 3.4 || rd > 14 || noVeg(x, z)) continue;
        let onB = false;
        for (const pb of placedB) {
          if (Math.hypot(x - pb.x, z - pb.z) < pb.rr + 0.3) { onB = true; break; }
        }
        if (onB) continue;
        const y = heightField.getHeightAt(x, z);
        addDestructible('drum', x, y - 0.02, z, drng() * Math.PI * 2, 0.95 + drng() * 0.12);
        if (drng() < 0.5) scatterDestructibles('pallet', x, z, 1 + ((drng() * 2) | 0), 1.0, 2.4);
        if (drng() < 0.35) scatterDestructibles('crate', x, z, 1, 1.2, 2.2);
        placed++;
      }
    }
    // souk dressing: pottery clusters + rug display frames near buildings
    if ((inh.pots ?? 0) > 0) {
      for (let t = 0, placed = 0; t < inh.pots * 16 && placed < inh.pots; t++) {
        const pb = placedB.length ? placedB[(drng() * placedB.length) | 0] : null;
        if (!pb) break;
        const a = drng() * Math.PI * 2, r = pb.rr + 0.8 + drng() * 2.6;
        const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 3.6 || noVeg(x, z)) continue;
        let onB = false;
        for (const ob2 of placedB) {
          if (ob2 !== pb && Math.hypot(x - ob2.x, z - ob2.z) < ob2.rr) { onB = true; break; }
        }
        if (onB) continue;
        const y = heightField.getHeightAt(x, z);
        addDestructible(drng() < 0.7 ? 'pot' : 'rugframe', x, y - 0.02, z, drng() * Math.PI * 2, 0.9 + drng() * 0.25);
        placed++;
      }
    }
  }

  // --- DESTRUCTIBLES r1: soft-vehicle + military-clutter dressing ----------
  yield;
  // Supply trucks and utility 4x4s parked on roadside pull-offs and yards
  // (destructible to burnt hulks), fuel-drum clusters with the rare RED
  // explosive drum, ammo-box stacks, and campsite/supply-dump story clusters
  // (tents + firewood + crates + drums) in the off-road clearings where
  // battles funnel. Everything rides the instanced destructible layer.
  {
    const inh = P.inhabit || {};
    const vrng = mulberry32(seed + 12007);
    // roadside spot finder: offset from a road node, clear of buildings/spawns
    function roadsideSpot(offMin, offMax, tries = 40) {
      for (let t = 0; t < tries; t++) {
        const nodes = roads[(vrng() * roads.length) | 0];
        if (!nodes || nodes.length < 4) continue;
        const i = 2 + ((vrng() * (nodes.length - 3)) | 0);
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1] || nodes[i - 1];
        const tl = Math.hypot(bx - ax, bz - az) || 1;
        const side = vrng() < 0.5 ? -1 : 1;
        const off = offMin + vrng() * (offMax - offMin);
        const x = ax - ((bz - az) / tl) * off * side;
        const z = az + ((bx - ax) / tl) * off * side;
        if (Math.max(Math.abs(x), Math.abs(z)) > 455) continue;
        if (heightField._roadDist(x, z) < 4.6 || noVeg(x, z)) continue;
        if (heightField.getGroundType(x, z) === 'soft') continue;
        if (heightField.getNormalAt(x, z).y < 0.90) continue;
        let bad = false;
        for (const s of [L.spawns.player, ...L.spawns.enemies]) {
          if (Math.hypot(x - s.x, z - s.z) < 24) { bad = true; break; }
        }
        if (bad) continue;
        for (const pb of placedB) {
          if (Math.hypot(x - pb.x, z - pb.z) < pb.rr + 2.5) { bad = true; break; }
        }
        if (bad) continue;
        return [x, z, Math.atan2(bx - ax, bz - az)];
      }
      return null;
    }
    // parked supply trucks: nose along the road, the odd one mid-turn
    for (let k = 0, cap = inh.trucks ?? 0; k < cap; k++) {
      const spot = roadsideSpot(5.6, 9.5);
      if (!spot) continue;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('truck', spot[0], y - 0.04, spot[1],
        spot[2] + (vrng() < 0.25 ? (vrng() - 0.5) * 1.6 : (vrng() - 0.5) * 0.3),
        0.96 + vrng() * 0.10);
      // truck stops spill cargo: crates/ammo beside the tailgate
      if (vrng() < 0.6) scatterDestructibles('crate', spot[0], spot[1], 1, 2.6, 4.2);
      if (vrng() < 0.45) scatterDestructibles('ammobox', spot[0], spot[1], 1, 2.4, 4.0);
    }
    // light utility 4x4s: yards + plaza edges
    for (let k = 0, cap = inh.jeeps ?? 0; k < cap; k++) {
      const spot = roadsideSpot(4.8, 7.5);
      if (!spot) continue;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('jeep', spot[0], y - 0.03, spot[1],
        spot[2] + (vrng() - 0.5) * 0.9, 0.95 + vrng() * 0.1);
    }
    // fuel-drum clusters (2-4 drums; ~12% carry one RED explosive drum)
    for (let k = 0, cap = inh.drumClusters ?? 0; k < cap; k++) {
      const spot = roadsideSpot(5.0, 12);
      if (!spot) continue;
      const n = 2 + ((vrng() * 3) | 0);
      let redDone = false;
      for (let d = 0; d < n; d++) {
        const a = vrng() * Math.PI * 2, r = vrng() * 1.4;
        const x = spot[0] + Math.cos(a) * r, z = spot[1] + Math.sin(a) * r;
        const y = heightField.getHeightAt(x, z);
        const red = !redDone && vrng() < 0.12;
        if (red) redDone = true;
        addDestructible(red ? 'drumred' : 'drum', x, y - 0.02, z, vrng() * Math.PI * 2, 0.95 + vrng() * 0.1);
      }
      if (vrng() < 0.4) scatterDestructibles('pallet', spot[0], spot[1], 1, 1.6, 3.0);
    }
    // Persistent loose dressing: the galvanized churn was the original
    // visually "bouncy gray can". Expand that interaction language into
    // bins, bottles, pails, jerry cans and detached wheels, with a deliberate
    // map-flavored mix. These are sleeping instanced bodies: the count adds
    // scene detail but no per-frame physics until a hull or shell wakes one.
    const industrialLoose = ['trashcan', 'gasbottle', 'jerrycan', 'loosewheel', 'bucket', 'drum'];
    const ruralLoose = ['churn', 'bucket', 'jerrycan', 'loosewheel', 'gasbottle', 'trashcan'];
    const dryLoose = ['jerrycan', 'gasbottle', 'bucket', 'loosewheel', 'trashcan', 'cone'];
    const isIndustrial = mapId === 'urban' || mapId === 'railyard' || mapId === 'foundry' || mapId === 'caldera';
    const isDry = mapId === 'desert' || mapId === 'badlands' || mapId === 'frontier';
    const looseKinds = isIndustrial ? industrialLoose : isDry ? dryLoose : ruralLoose;
    const looseCap = inh.looseClutter ?? (P.streetRows ? 20 : P.plan.length >= 14 ? 18 : 14);
    for (let k = 0; k < looseCap; k++) {
      const spot = roadsideSpot(isIndustrial ? 4.6 : 5.2, isIndustrial ? 12 : 15, 52);
      if (!spot) continue;
      const members = vrng() < 0.42 ? 2 : 1;
      for (let j = 0; j < members; j++) {
        const a = vrng() * Math.PI * 2;
        const rr = j ? 0.65 + vrng() * 0.75 : 0;
        const x = spot[0] + Math.cos(a) * rr, z = spot[1] + Math.sin(a) * rr;
        if (noVeg(x, z)) continue;
        const kind = looseKinds[(vrng() * looseKinds.length) | 0];
        addDestructible(kind, x, heightField.getHeightAt(x, z) - 0.015, z,
          vrng() * Math.PI * 2, 0.88 + vrng() * 0.18);
      }
    }
    // campsites / supply dumps: tents, firewood, crates, drums — the "life"
    // clusters at village outskirts and along the approach woods
    for (let k = 0, cap = inh.camps ?? 0; k < cap; k++) {
      const spot = roadsideSpot(10, 26, 60);
      if (!spot) continue;
      const [cx, cz] = spot;
      const yawC = vrng() * Math.PI * 2;
      const y0 = heightField.getHeightAt(cx, cz);
      addDestructible('tent', cx, y0 - 0.03, cz, yawC, 0.95 + vrng() * 0.15);
      if (vrng() < 0.7) { // second tent facing the fire
        const a = yawC + Math.PI * (0.6 + vrng() * 0.5);
        const tx = cx + Math.cos(a) * (4 + vrng() * 2), tz = cz + Math.sin(a) * (4 + vrng() * 2);
        if (heightField._roadDist(tx, tz) > 4.5 && !noVeg(tx, tz)) {
          addDestructible('tent', tx, heightField.getHeightAt(tx, tz) - 0.03, tz,
            a + Math.PI + (vrng() - 0.5) * 0.5, 0.9 + vrng() * 0.15);
        }
      }
      // fire ring: small static stone circle + char decal read via clutter
      const nStone = 5 + ((vrng() * 3) | 0);
      const fy = heightField.getHeightAt(cx + 2.6, cz + 1.4);
      for (let s2 = 0; s2 < nStone; s2++) {
        const a = (s2 / nStone) * Math.PI * 2;
        const st = box(0.22 + vrng() * 0.1, 0.18, 0.2, 1.4);
        jitterUV(st, vrng);
        st.rotateY(vrng() * Math.PI);
        st.translate(cx + 2.6 + Math.cos(a) * 0.55, fy + 0.08, cz + 1.4 + Math.sin(a) * 0.55);
        buckets.stone.push(st);
      }
      scatterDestructibles('firewood', cx, cz, 1, 2.2, 4.5);
      scatterDestructibles('crate', cx, cz, 1 + ((vrng() * 2) | 0), 2.4, 5.5);
      scatterDestructibles('ammobox', cx, cz, 1 + ((vrng() * 2) | 0), 2.0, 5.0);
      if (vrng() < 0.5) scatterDestructibles('drum', cx, cz, 1 + ((vrng() * 2) | 0), 3.0, 6.0);
      if (vrng() < 0.35) { // parked vehicle completes the camp read
        const a = vrng() * Math.PI * 2;
        const px2 = cx + Math.cos(a) * (6.5 + vrng() * 2), pz2 = cz + Math.sin(a) * (6.5 + vrng() * 2);
        if (heightField._roadDist(px2, pz2) > 4.6 && !noVeg(px2, pz2)
          && heightField.getNormalAt(px2, pz2).y > 0.9) {
          addDestructible(vrng() < 0.5 ? 'jeep' : 'truck', px2,
            heightField.getHeightAt(px2, pz2) - 0.04, pz2, vrng() * Math.PI * 2, 0.95);
        }
      }
    }
    // Modern roadside and industrial vocabulary: concrete vehicle barriers,
    // signs, cones, transformer cabinets and cable reels. Every piece uses an
    // existing instanced destructible pool, so a count of 40 still costs five
    // draw calls rather than forty and remains idle until actually hit.
    const modernCfg = inh.modernClutter ?? 0;
    const authoredModernKinds = typeof modernCfg === 'object' && modernCfg
      ? Object.entries(modernCfg).flatMap(([kind, count]) =>
        Array.from({ length: Math.max(0, count | 0) }, () => kind))
      : null;
    // Authored legacy-map backports guarantee every vocabulary family while
    // retaining seeded variety in where those families land. Numeric budgets
    // keep the original weighted selection path byte-for-byte unchanged.
    if (authoredModernKinds) {
      for (let i = authoredModernKinds.length - 1; i > 0; i--) {
        const j = (vrng() * (i + 1)) | 0;
        [authoredModernKinds[i], authoredModernKinds[j]] =
          [authoredModernKinds[j], authoredModernKinds[i]];
      }
    }
    const modernCap = authoredModernKinds ? authoredModernKinds.length : modernCfg;
    for (let k = 0; k < modernCap; k++) {
      const spot = roadsideSpot(5.0, 13.5, 52);
      if (!spot) continue;
      const [mx, mz, myaw] = spot;
      const roll = authoredModernKinds ? 0 : vrng();
      const kind = authoredModernKinds ? authoredModernKinds[k]
        : roll < 0.25 ? 'barrier'
          : roll < 0.45 ? 'roadsign'
            : roll < 0.70 ? 'cone'
              : roll < 0.84 ? 'transformer' : 'cablespool';
      const y = heightField.getHeightAt(mx, mz);
      addDestructible(kind, mx, y - 0.03, mz,
        myaw + (vrng() - 0.5) * (kind === 'barrier' ? 0.18 : 0.7),
        0.9 + vrng() * 0.18);
      // Checkpoint barriers and work-zone cones read as arrangements rather
      // than isolated props. Partners keep the same seeded placement path.
      if (kind === 'barrier' && vrng() < 0.6) {
        const lx = Math.cos(myaw), lz = -Math.sin(myaw);
        for (let j = 1; j <= 1 + ((vrng() * 2) | 0); j++) {
          const bx = mx + lx * 2.75 * j, bz = mz + lz * 2.75 * j;
          if (noVeg(bx, bz)) continue;
          addDestructible('barrier', bx, heightField.getHeightAt(bx, bz) - 0.03,
            bz, myaw + (vrng() - 0.5) * 0.12, 0.92 + vrng() * 0.12);
        }
      } else if (kind === 'cone') {
        scatterDestructibles('cone', mx, mz, 1 + ((vrng() * 3) | 0), 0.7, 2.5);
      }
    }
  }

  // --- hay bales + crates near buildings (world-dressing r1: instanced
  // DESTRUCTIBLES — a hull crushes them, shells burst them, hay puffs) ---
  for (let i = 0; P.hayCrates && i < Math.min(5, placedB.length); i++) {
    const pb = placedB[i];
    const n = 1 + ((rng() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, r = pb.rr + 2 + rng() * 4;
      const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
      if (heightField._roadDist(x, z) < 4.5) continue;
      const y = heightField.getHeightAt(x, z);
      addDestructible(rng() < 0.5 ? 'bale' : 'crate', x, y - 0.03, z,
        rng() * Math.PI, 0.9 + rng() * 0.3);
    }
  }

  // --- wooden fence runs + telegraph poles along the roads ---
  // world-dressing r1: road fences are now DESTRUCTIBLE fence-kit modules
  // (per-map type, drive-through-able like saplings, shell-breakable) with
  // the odd open gate where field entrances meet the road.
  {
    const roadsL = L.roads;
    const roadFence = (P.inhabit && P.inhabit.roadFence) || 'fenceplank';
    function fenceRun(nodes, i0, i1, side) {
      for (let i = i0; i < i1 && i < nodes.length - 1; i++) {
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        const tx = dx / len, tz = dz / len;
        const ox = -tz * side * 7.6, oz = tx * side * 7.6;
        placeFenceRun(roadFence, ax + ox, az + oz, bx + ox, bz + oz, 0.30);
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
    // r7 terrain_environment: whiteCap remaps the model's 0.90-white insulator
    // caps to dark glazed glass-green — they rendered as blown "daytime
    // streetlamp" blobs on every pole (player_view critique)
    const poleGeo = SOURCED.poles && P.telegraph
      ? bakedGeometry('telephone_pole_polygoogle',
        { targetH: 7.4, sink: 0.15, whiteCap: [0.14, 0.21, 0.16] }) : null;
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
      // A pole occupies more than one height-field sample. Plant its full base
      // against the lowest nearby terrain so a verge shoulder cannot leave it
      // visibly suspended above the map.
      const py = sampleDiscGround(heightField, px, pz, 0.30, 0.035).y;
      const armYaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      const networkIndex = poleLine.length;
      const poleRec = {
        x: px, y: py, z: pz, yaw: armYaw, sourced: !!SOURCED.poles,
        attachH: SOURCED.poles ? 6.5 : 5.75,
      };
      if (SOURCED.poles) {
        addBakedInstance('pole', poleGeo, px, py, pz, armYaw, 1);
        poleRec.instanceIndex = bakedInstances.get('pole').list.length - 1;
        poleLine.push(poleRec);
        // effects_combat r1: poles are CRUSHABLE — record the instance index
        // so a driving tank can hinge-topple it (crushProp) instead of
        // ghosting through.
        crushables.push({
          x: px, y: py, z: pz, r: 0.45, h: 7.4,
          index: poleRec.instanceIndex, wirePoleIndex: networkIndex, toppled: false,
        });
        continue;
      }
      poleLine.push(poleRec);
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
    // Catenary topology. Geometry is instantiated after material finalization;
    // keeping the spans out of the static dark bucket lets adjacent wires be
    // pulled down by a toppled pole without unmerging the rest of the world.
    const wireSpans = [];
    for (let pi = 0; pi + 1 < poleLine.length; pi++) {
      const A = poleLine[pi], B = poleLine[pi + 1];
      const spanL = Math.hypot(B.x - A.x, B.z - A.z);
      if (spanL > 52 || spanL < 6) continue; // a skipped pole leaves the span unstrung
      wireSpans.push([pi, pi + 1]);
    }
    if (wireSpans.length) utilityNetwork = createUtilityNetwork(poleLine, wireSpans);
    // DESTRUCTIBLES r1: telegraph-pole DEBRIS — every pole line lost a few
    // to the shelling: a snapped stump, the felled pole across the verge
    // with its crossarm splayed, a coil of downed wire. Static dressing
    // (no collision) that sells the fought-over road.
    if (P.telegraph && poleLine.length > 3) {
      const prng2 = mulberry32(seed + 4407);
      const nDebris = Math.min(3, (poleLine.length / 5) | 0);
      for (let d = 0; d < nDebris; d++) {
        const pl = poleLine[(prng2() * poleLine.length) | 0];
        const ox = pl.x + (prng2() - 0.5) * 4, oz = pl.z + (prng2() - 0.5) * 4;
        if (Math.max(Math.abs(ox), Math.abs(oz)) > 460 || noVeg(ox, oz)) continue;
        if (heightField._roadDist(ox, oz) < 4.2) continue;
        const oy = heightField.getHeightAt(ox, oz);
        const yawD = prng2() * Math.PI * 2;
        // snapped stump
        const stump = new THREE.CylinderGeometry(0.13, 0.17, 0.9 + prng2() * 0.6, 7, 1);
        scaleUV(stump, 0.8, 1.0);
        stump.rotateZ((prng2() - 0.5) * 0.24);
        stump.translate(ox, oy + 0.45, oz);
        buckets.wood.push(stump);
        // felled pole lying along yawD, slightly proud of the grass
        const fall = new THREE.CylinderGeometry(0.09, 0.15, 5.6 + prng2() * 1.2, 7, 1);
        scaleUV(fall, 0.8, 3.0);
        fall.rotateX(Math.PI / 2);
        fall.rotateY(yawD);
        fall.translate(ox + Math.sin(yawD) * 3.4, oy + 0.16, oz + Math.cos(yawD) * 3.4);
        buckets.wood.push(fall);
        const arm = box(1.4, 0.10, 0.09, 1.0); // crossarm knocked loose
        arm.rotateY(yawD + 0.5 + prng2());
        arm.translate(ox + Math.sin(yawD) * 5.6, oy + 0.10, oz + Math.cos(yawD) * 5.6);
        buckets.wood.push(arm);
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
  const rockHulls = [];
  // r7 terrain_environment: RIDGED FRACTURE displacement + crease shading —
  // the r3 boulders still read as "smooth grey blobs with no fracture
  // planes" (critique). A ridged octave (1-|noise|) carves crease valleys
  // into the surface; crease proximity darkens the albedo (fracture shadow
  // lines) and the same field keys a partial normal HARDENING (lerp toward
  // the local radial facet direction) so crease shoulders shade as broken
  // faces instead of one continuous smooth ball.
  for (let vi = 0; vi < 3; vi++) {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, vi === 2 ? 3 : 2));
    const p = g.attributes.position;
    const vr = mulberry32(seed + 30 + vi);
    const tmpv = new THREE.Vector3();
    const creaseA = new Float32Array(p.count); // 1 at crease line, 0 elsewhere
    for (let i = 0; i < p.count; i++) {
      tmpv.set(p.getX(i), p.getY(i), p.getZ(i));
      const ridge = 1 - Math.abs(noi.noise3d(
        tmpv.x * 2.2 + vi * 31, tmpv.y * 2.2 - 7, tmpv.z * 2.2 + 13));
      const crease = Math.pow(ridge, 5); // sharp valley lines
      creaseA[i] = crease;
      const f = 1
        + noi.noise3d(tmpv.x * 1.4 + vi * 9, tmpv.y * 1.4, tmpv.z * 1.4) * 0.30
        + noi.noise3d(tmpv.x * 3.1 - vi * 17, tmpv.y * 3.1 + 40, tmpv.z * 3.1) * 0.13
        + noi.noise3d(tmpv.x * 6.8 + 91, tmpv.y * 6.8 - vi * 5, tmpv.z * 6.8) * 0.05
        - crease * 0.115; // carved fracture valleys
      tmpv.multiplyScalar(f);
      tmpv.y = Math.max(tmpv.y, -0.55);
      p.setXYZ(i, tmpv.x, tmpv.y * 0.82, tmpv.z);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    // partial facet hardening: pull normals toward the radial direction on
    // crease shoulders — the smooth-welded shading breaks into planes there
    const nv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const cw = creaseA[i] * 0.55;
      if (cw < 0.03) continue;
      nv.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      tmpv.set(p.getX(i), p.getY(i) * 0.6, p.getZ(i)).normalize();
      nv.lerp(tmpv, cw).normalize();
      nrm.setXYZ(i, nv.x, nv.y, nv.z);
    }
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // darker, mossier boulders — the old light-gray tone flashed white at
      // distance under the sun/env light and read as pixel errors
      const upW = clamp(nrm.getY(i), 0, 1);
      const l = 0.26 + vr() * 0.08 + p.getY(i) * 0.04 + upW * upW * 0.10;
      let rh = 0.09 + vr() * 0.02, rs = 0.07, rl = clamp(l, 0.15, 0.48);
      if (P.rockTone) { const t = P.rockTone(rh, rs, rl); rh = t[0]; rs = t[1]; rl = clamp(t[2], 0, 1); }
      // upward faces take the map cap tone harder (snow/dust), sides darker;
      // crease valleys darken like fracture shadow lines
      _col.setHSL(rh, rs,
        clamp(rl * (0.86 + upW * 0.22) * (1 - creaseA[i] * 0.34), 0, 1), THREE.SRGBColorSpace);
      col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    rockGeos.push(g);
    const projected = [];
    for (let i = 0; i < p.count; i++) projected.push([p.getX(i), p.getZ(i)]);
    rockHulls.push(convexHull2(projected));
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
    _mat4.compose(_posv.set(x, y, z), _quat,
      _scalev.set(sc, sc * (0.8 + rng() * 0.35), sc));
    rockPlacements[vv].push(_mat4.clone());
    // sink <= 0.5: half-drifted surface rocks keep their cover role; only the
    // deep-embedded ground-clutter class (0.60) is drive-over
    if (sc >= 1.25 && sink <= 0.5) {
      // The old square ±1.15*scale AABB made its four empty corners solid;
      // at a 3 m outcrop that stopped a hull more than a metre from the
      // visible stone. Use the displaced mesh's actual projected convex hull.
      const c = Math.cos(yawR), s = Math.sin(yawR);
      const local = rockHulls[vv];
      const points = new Array(local.length);
      for (let i = 0; i < local.length; i += 2) {
        const lx = local[i] * sc, lz = local[i + 1] * sc;
        points[i] = x + lx * c + lz * s;
        points[i + 1] = z - lx * s + lz * c;
      }
      const rec = setConvexShape(
        { min: [x, y, z], max: [x, y + sc * 1.1, z] }, points);
      obstacles.push(rec);
      colliders.push(cloneCollisionRecord(rec));
    }
    return true;
  }
  // Hard cover belonging to the authored tactical beats is added before the
  // general scatter. It lands in the same three rock instances and therefore
  // costs geometry instances, not draw calls. A broken crescent leaves two
  // peek routes instead of forming an impassable wall.
  for (const beat of P.tacticalBeats || []) {
    if (!beat.outcrop) continue;
    const count = beat.outcrop.count ?? 5;
    const radius = beat.outcrop.radius ?? 9;
    const yaw = THREE.MathUtils.degToRad(beat.yawDeg || 0);
    for (let i = 0; i < count; i++) {
      const arc = count === 1 ? 0 : (i / (count - 1) - 0.5) * Math.PI * 0.92;
      const a = yaw + Math.PI + arc;
      const rr = radius * (0.72 + 0.28 * Math.abs(Math.sin(i * 2.17 + seed)));
      tryRock(beat.x + Math.cos(a) * rr, beat.z + Math.sin(a) * rr,
        beat.outcrop.scaleMin ?? 1.55, beat.outcrop.scaleMax ?? 3.1, false, 0.24);
    }
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
    // world-dressing r1: haystacks are DESTRUCTIBLE instances now — a hull
    // plows through (crushable obstacle, WoT hay behavior) and shells pass
    // through cosmetically instead of being EATEN (the old collider made a
    // hay pile stop AP rounds; colliders are gone for hay).
    const sc = 0.85 + rng() * 0.4;
    addDestructible('haystack', x, y - 0.10, z, rng() * Math.PI * 2, sc);
    stackSpots.push({ x, z, r: 1.9 * sc * 1.5 });
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
  yield;
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
        map: cropTex, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
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
  yield;
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
        // world-dressing r1: cast-iron lamps ride the destructible layer —
        // instanced, hinge-toppled by a hull (crushable obstacle seam),
        // knocked down by shells, felled post persists.
        const armA = Math.atan2((ax - lx), (az - lz)); // arm toward the road
        addDestructible('lamp', lx, y - 0.02, lz, armA - Math.PI / 2, 0.95 + lrng() * 0.12);
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
      const yawH = hrng() * Math.PI * 2;
      const scH = 0.85 + hrng() * 0.35;
      const y = sampleDiscGround(heightField, hx, hz, 1.08 * scH, 0.035).y;
      const yawOffsets = [
        (hrng() - 0.5) * 0.3,
        (hrng() - 0.5) * 0.3,
        (hrng() - 0.5) * 0.3,
      ];
      const beams = hedgehogBeamSpecs(hx, y, hz, yawH, scH, yawOffsets);
      for (const beamSpec of beams) { // three crossed I-beams
        const beam = box(0.16 * scH, 0.16 * scH, 2.1 * scH, 1.2);
        beam.rotateX(beamSpec.tilt);
        beam.rotateY(beamSpec.yaw);
        beam.translate(hx, y + 0.62 * scH, hz);
        buckets.dark.push(beam);
        const rec = setObbShape({
          min: [hx, beamSpec.minY, hz], max: [hx, beamSpec.maxY, hz],
          kind: 'hedgehog', hedgehogId: placed,
        }, hx, hz, beamSpec.halfWidth + 0.025, beamSpec.halfLength + 0.025, beamSpec.yaw);
        obstacles.push(rec);
        colliders.push(cloneCollisionRecord(rec));
      }
      placed++;
    }
  }

  // --- carts along the roads (world-dressing r1: DESTRUCTIBLE hay carts +
  // hand carts — a moving hull smashes them to debris, shells burst them;
  // no collider so they never eat a shell) ---
  {
    const cartCap = (P.inhabit && P.inhabit.carts) ?? 2;
    let carts = 0;
    for (let i = 4; P.carts && L.roads.length >= 2 && i < L.roads[1].length - 1 && carts < cartCap; i += 5) {
      const [ax, az] = L.roads[1][i];
      const cxp = ax + 8.5, czp = az + 6.5;
      if (Math.max(Math.abs(cxp), Math.abs(czp)) > 440) continue;
      if (heightField._roadDist(cxp, czp) < 6) continue;
      if (heightField.getGroundType(cxp, czp) === 'soft' || noVeg(cxp, czp)) continue;
      const y = heightField.getHeightAt(cxp, czp);
      addDestructible(carts % 2 ? 'handcart' : 'haycart', cxp, y - 0.04, czp,
        rng() * Math.PI * 2, 0.95 + rng() * 0.12);
      carts++;
    }
  }

  // --- sandbag emplacements: defensive clusters along the main road + plaza ---
  // DESTRUCTIBLES r1: sandbags no longer wall a hull OR eat shells — every
  // emplacement is a destructible record (crushKeep ~0.97: you barely feel
  // them) that bursts into spilled bags. The three sourced silhouettes ride
  // the LOCAL_TYPES pools; a tank at speed just drives over the position.
  if (SOURCED.sandbags) {
    const srng = mulberry32(seed + 401);
    const sbKind = (pick) => (pick < 0.45 ? 'sandbagbig' : pick < 0.8 ? 'sandbagsmall' : 'sandbagwall');
    let placedS = 0;
    const sandbagCap = P.sandbagLines ?? 9;
    const roadA = L.roads[0];
    for (let i = 6; i < roadA.length - 2 && placedS < sandbagCap; i += 3) {
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
      addDestructible(sbKind(srng()), sx, y - 0.04, sz, yaw, 1.25 + srng() * 0.3);
      // DESTRUCTIBLES r1: defended positions carry supplies — ammo boxes and
      // the odd drum cluster behind the bags (all destructible clutter)
      if (srng() < 0.55) scatterDestructibles('ammobox', sx, sz, 1, 1.8, 3.2);
      if (srng() < 0.3) scatterDestructibles('crate', sx, sz, 1, 1.8, 3.0);
      placedS++;
    }
    // plaza corner nest by the well
    {
      const nx = junction.x - 11, nz = junction.z - 8;
      const y = heightField.getHeightAt(nx, nz);
      addDestructible('sandbagbig', nx, y - 0.04, nz, Math.PI * 0.7, 1.4);
      addDestructible('sandbagsmall', nx + 3.4,
        heightField.getHeightAt(nx + 3.4, nz + 1.6) - 0.04, nz + 1.6, Math.PI * 0.25, 1.3);
      scatterDestructibles('ammobox', nx + 1.5, nz + 1, 2, 1.2, 2.6);
    }
  }

  // --- knocked-out TANK WRECKS: real roster vehicles, baked static ----------
  yield;
  // DESTRUCTIBLES r1 replaces the r7 generic box hulks with the game's own
  // tank models: era-appropriate roster vehicles built through tankFactory,
  // posed by the factory's settled-wreck machinery (turret tossed or unseated,
  // gun drooped), charred/rust-painted and BAKED into ONE static merged mesh
  // per map (src/world/wrecks.js — no live tank cost, no articulation).
  // They are pure DRESSING: solid obstacles + shell colliders, never in
  // game.tanks, invisible to spotting and the minimap. Placement stays the
  // storytelling read: roadside kills along the advance routes, plus paired
  // "duel" beats where two hulks face each other off the same verge.
  const wreckScorch = [];
  const tankWreckSpots = []; // probe/debug: {specId,x,z,yaw,hx,hz,h} per hulk
  {
    const wCfg = P.tankWrecks || null;
    const requestedWrecks = wCfg ? (wCfg.count ?? 3) : (P.wrecks ?? 0);
    // Loading-speed r1: the third mobile hulk was one independent 284 ms
    // hidden-prefetch atom. Two keep the paired roadside story beat on a
    // small screen while removing two transient live-tank factories; desktop
    // content stays unchanged. A second similarly sized roster atom was
    // exposed after this one disappeared and is scheduled separately.
    const wreckCount = getDeviceTier() === 'mobile'
      ? Math.min(requestedWrecks, 2) : requestedWrecks;
    if (wreckCount > 0) {
      const wrng = mulberry32(seed + 909);
      const era = (wCfg && wCfg.era) || 'ww2';
      const pool = (wCfg && wCfg.ids) || wreckPool(era);
      const bakeCache = new Map(); // specId|pop -> bake result
      const wreckGeos = [];
      const wreckShadowGeos = []; // factory shadow proxies, wreck-posed
      let bakedTris = 0;
      let wreckSerial = 0;
      let wreckPickSerial = 0;
      function bakeFor(specId, pop) {
        const key = specId + (pop ? '|p' : '');
        if (bakeCache.has(key)) return bakeCache.get(key);
        const baked = bakeTankWreck(engineCtx, specId, {
          seed: seed + bakeCache.size * 131, pop,
        });
        bakeCache.set(key, baked);
        return baked;
      }
      function placeWreck(x, z, yaw) {
        // Explicit map pools are deliberate story casts: consume them in
        // order so the complete modern wreck vocabulary is guaranteed across
        // the legacy-map set. Unauthored pools retain seeded random variety.
        const specId = wCfg?.ids?.length
          ? pool[wreckPickSerial++ % pool.length]
          : pool[(wrng() * pool.length) | 0];
        const pop = wrng() < 0.45; // mix ammo-rack tosses with unseated kills
        const baked = bakeFor(specId, pop);
        if (!baked) return false;
        bakedTris += baked.tris; // budget counts PLACED tris (clones render too)
        const y = heightField.getHeightAt(x, z);
        const tilt = (wrng() - 0.5) * 0.10;
        const g = baked.geo.clone();
        g.rotateZ(tilt);
        g.rotateY(yaw);
        g.translate(x, y - 0.14, z); // settled on dead suspension
        wreckGeos.push(g);
        // Secondary destruction stays inside the same static merged wreck
        // mesh: torn track runs, wheels and armor plates improve the scene
        // read without adding draw calls, animation, or live vehicle state.
        let debrisTris = 0;
        if (wCfg?.debris !== false) {
          const debris = bakeWreckDebris(seed + 17001 + wreckSerial * 97, {
            modern: isPostwarVehicleEra(era),
          });
          wreckSerial++;
          debris.geo.rotateY(yaw);
          debris.geo.translate(x, y - 0.13, z);
          wreckGeos.push(debris.geo);
          debrisTris = debris.tris;
          bakedTris += debrisTris;
        }
        if (baked.shadowGeo) {
          const sg = baked.shadowGeo.clone();
          sg.rotateZ(tilt);
          sg.rotateY(yaw);
          sg.translate(x, y - 0.14, z);
          wreckShadowGeos.push(sg);
        }
        // solid obstacle + shell collider from the yaw-rotated footprint
        const cs = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
        const hx = baked.hx * cs + baked.hz * sn + 0.2;
        const hz = baked.hx * sn + baked.hz * cs + 0.2;
        const rec = setObbShape(
          { min: [x - hx, y, z - hz], max: [x + hx, y + baked.h - 0.2, z + hz] },
          x, z, baked.hx + 0.2, baked.hz + 0.2, yaw);
        obstacles.push(rec);
        colliders.push(cloneCollisionRecord(rec));
        wreckScorch.push([x, z]);
        tankWreckSpots.push({ specId, x, z, yaw, hx, hz, h: baked.h, debrisTris });
        return true;
      }
      let placedW = 0;
      // Story-critical wrecks mark crossfires and failed assaults at authored
      // lane anchors. They consume the existing map wreck budget, remain one
      // merged mesh, and leave the remaining budget to the road-placement
      // pass for organic variation.
      for (const beat of P.tacticalBeats || []) {
        if (!beat.wreck || placedW >= wreckCount || bakedTris > 260000) continue;
        const yawW = THREE.MathUtils.degToRad(beat.wreckYawDeg ?? beat.yawDeg ?? 0);
        if (placeWreck(beat.x + (beat.wreckOffsetX || 0),
          beat.z + (beat.wreckOffsetZ || 0), yawW)) {
          placedW++;
          yield { fine: true };
        }
      }
      for (let ri = 0; ri < roads.length && placedW < wreckCount; ri++) {
        const nodes = roads[ri];
        for (let i = 5; i < nodes.length - 1 && placedW < wreckCount; i += 4 + ((wrng() * 3) | 0)) {
          if (bakedTris > 260000) break; // perf stop — enough hulks for one map
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
          const yawW = Math.atan2(bx - ax, bz - az) + (wrng() - 0.5) * 0.9;
          if (!placeWreck(px, pz, yawW)) continue;
          placedW++;
          yield { fine: true }; // loading-speed r1: one static tank bake per idle slice
          // paired DUEL beat: a second hulk 9-14 m off, guns facing the first
          if (placedW < wreckCount && wrng() < 0.4) {
            const da = wrng() * Math.PI * 2;
            const dd = 9 + wrng() * 5;
            const qx = px + Math.cos(da) * dd, qz = pz + Math.sin(da) * dd;
            if (Math.max(Math.abs(qx), Math.abs(qz)) <= 440
              && heightField._roadDist(qx, qz) >= 5.2
              && heightField.getGroundType(qx, qz) !== 'soft' && !noVeg(qx, qz)
              && heightField.getNormalAt(qx, qz).y >= 0.88) {
              if (placeWreck(qx, qz, Math.atan2(px - qx, pz - qz) + (wrng() - 0.5) * 0.3)) {
                placedW++;
                yield { fine: true };
              }
            }
          }
        }
      }
      if (wreckGeos.length > 0) {
        const wm = new THREE.Mesh(mergeGeometries(wreckGeos, false), mats.baked);
        wm.name = 'tank-wrecks';
        // PERF: the full hulks never enter the shadow passes — the factory's
        // own low-poly proxies (baked below in the same pose) cast instead,
        // exactly like live procedural tanks (installProceduralShadowProxies)
        wm.castShadow = false;
        wm.receiveShadow = true;
        wm.matrixAutoUpdate = false;
        group.add(wm);
        for (const g of wreckGeos) g.dispose();
        if (wreckShadowGeos.length > 0) {
          const shadowMat = new THREE.MeshBasicMaterial({
            name: 'TankWreckShadowProxy', colorWrite: false, depthWrite: false,
          });
          const sm = new THREE.Mesh(mergeGeometries(wreckShadowGeos, false), shadowMat);
          sm.name = 'tank-wrecks-shadow';
          sm.castShadow = true;
          sm.receiveShadow = false;
          sm.matrixAutoUpdate = false;
          group.add(sm);
          for (const g of wreckShadowGeos) g.dispose();
        }
      }
      for (const baked of bakeCache.values()) {
        if (!baked) continue;
        baked.geo.dispose();
        if (baked.shadowGeo) baked.shadowGeo.dispose();
      }
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
    function addDecalMesh(geos, tex, {
      receiveShadow = true,
      groundContact = false,
      decalKind = 'surface',
    } = {}) {
      if (geos.length === 0) return;
      const mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false,
        roughness: 0.97, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      if (receiveShadow) engineCtx.setupShadowMaterial(mat);
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      // Foundation/contact tint already supplies the small-scale grounding
      // term. Letting the live CSM shade that translucent layer again stacks
      // two darkening systems and makes cascade movement read as a flashing
      // ground texture. Authored surface decals (craters, aprons, churn) still
      // receive directional shadows; only the contact layer opts out.
      mesh.receiveShadow = receiveShadow;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 1;
      mesh.userData.groundContactDecal = groundContact;
      mesh.userData.terrainDecal = true;
      mesh.userData.terrainDecalKind = decalKind;
      mesh.userData.decalParts = geos.length;
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
    addDecalMesh(dirtDiscs, makeDecalTexture('dirt'), {
      receiveShadow: false,
      groundContact: true,
      decalKind: 'ground-contact',
    });
    addDecalMesh(apronGeos, makeDecalTexture('apron'), { decalKind: 'apron' });
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
    addDecalMesh(craterDiscs, makeDecalTexture('crater'), { decalKind: 'crater' });
    addDecalMesh(burnDiscs, makeDecalTexture('scorch'), { decalKind: 'scorch' });
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
      addDecalMesh(tearGeos, makeChurnTexture(), { decalKind: 'churn' });
    }
  }

  // --- sourced-model InstancedMeshes (one per model, shared baked material) ---
  let poleIM = null; // effects_combat r1: virtual writer for hinge-topple matrices
  let poleFullIM = null;
  let poleDistanceIM = null;
  let poleMatrices = null;
  let poleHigh = null;
  let poleLodDirty = false;
  const lastPoleCamera = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);

  function rebuildPoleInstances() {
    if (!poleFullIM || !poleDistanceIM || !poleMatrices) return;
    let fullCount = 0, distanceCount = 0;
    for (let i = 0; i < poleMatrices.length; i++) {
      if (poleHigh[i]) poleFullIM.setMatrixAt(fullCount++, poleMatrices[i]);
      else poleDistanceIM.setMatrixAt(distanceCount++, poleMatrices[i]);
    }
    poleFullIM.count = fullCount;
    poleDistanceIM.count = distanceCount;
    poleFullIM.visible = fullCount > 0;
    poleDistanceIM.visible = distanceCount > 0;
    poleFullIM.instanceMatrix.needsUpdate = true;
    poleDistanceIM.instanceMatrix.needsUpdate = true;
    poleLodDirty = false;
  }

  function updatePoleLod(cameraPos, force = false) {
    if (!poleMatrices) return;
    let changed = force;
    if (cameraPos && Number.isFinite(cameraPos.x) && Number.isFinite(cameraPos.z)) {
      const moved = !Number.isFinite(lastPoleCamera.x)
        || lastPoleCamera.distanceToSquared(cameraPos) > 64;
      if (moved || force) {
        lastPoleCamera.copy(cameraPos);
        for (let i = 0; i < poleMatrices.length; i++) {
          const e = poleMatrices[i].elements;
          const d = Math.hypot(e[12] - cameraPos.x, e[14] - cameraPos.z);
          // Hysteresis keeps a moving chase camera from repartitioning at the
          // boundary. The full model remains exact through 105 m and only
          // yields after 120 m, where the compact crossarm is screen-equivalent.
          const high = poleHigh[i] ? d <= 120 : d < 105;
          if (high !== poleHigh[i]) { poleHigh[i] = high; changed = true; }
        }
      }
    }
    if (changed || poleLodDirty) rebuildPoleInstances();
  }
  // r3 terrain_environment: the pale-sand baked sandbag models rendered as
  // raw white lumps on the winter snowfield (probed: the "foreground white
  // icosphere" of the critique was a sack_trench instance at 87 m). Per-map
  // instance tint pulls them to dark wet hessian so they read as emplaced
  // defenses against the snow.
  const bakedTint = snowCap ? new THREE.Color(0.52, 0.50, 0.47) : null;
  for (const [name, e] of bakedInstances) {
    if (e.list.length === 0) continue;
    if (name === 'pole') {
      poleMatrices = e.list.map((matrix) => matrix.clone());
      poleHigh = new Uint8Array(e.list.length);
      poleHigh.fill(1);
      poleFullIM = new THREE.InstancedMesh(e.geo, mats.baked, e.list.length);
      poleDistanceIM = new THREE.InstancedMesh(
        makeTelephonePoleDistanceGeometry(), mats.baked, e.list.length);
      for (const mesh of [poleFullIM, poleDistanceIM]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
      poleFullIM.name = 'baked-pole-full';
      poleDistanceIM.name = 'baked-pole-distance';
      poleFullIM.userData.distanceSplitM = 120;
      poleDistanceIM.userData.distanceSplitM = 105;
      poleDistanceIM.count = 0;
      poleDistanceIM.visible = false;
      rebuildPoleInstances();
      // Crush/topple records retain their stable authored index. The renderer
      // is free to pack near/far instances independently behind this writer.
      poleIM = {
        instanceMatrix: { needsUpdate: false },
        getMatrixAt(index, target) { target.copy(poleMatrices[index]); },
        setMatrixAt(index, matrix) {
          poleMatrices[index].copy(matrix);
          poleLodDirty = true;
        },
      };
      continue;
    }
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
    im.name = `baked-${name}`;
    group.add(im);
  }

  // Linked utility conductors: one four-sided unit cylinder, instanced along
  // all sampled catenaries. No shadow casting avoids sub-pixel CSM shimmer;
  // matrices move only while a connected pole is actively toppling.
  const _wirePoints = utilityNetwork
    ? new Float64Array((utilityNetwork.segments + 1) * 3) : null;
  const _wireA = new THREE.Vector3(), _wireB = new THREE.Vector3();
  const _wireMid = new THREE.Vector3(), _wireDir = new THREE.Vector3();
  const _wireUp = new THREE.Vector3(0, 1, 0), _wireScale = new THREE.Vector3();
  const _wireQuat = new THREE.Quaternion(), _wireMatrix = new THREE.Matrix4();
  function writeWireSpan(spanIndex) {
    if (!wireIM || !utilityNetwork) return;
    for (let side = 0; side < 2; side++) {
      utilityNetwork.writeSpanPoints(spanIndex, side, _wirePoints);
      for (let seg = 0; seg < utilityNetwork.segments; seg++) {
        const a = seg * 3, b = a + 3;
        _wireA.set(_wirePoints[a], _wirePoints[a + 1], _wirePoints[a + 2]);
        _wireB.set(_wirePoints[b], _wirePoints[b + 1], _wirePoints[b + 2]);
        _wireDir.subVectors(_wireB, _wireA);
        const len = _wireDir.length();
        if (len < 1e-5) continue;
        _wireQuat.setFromUnitVectors(_wireUp, _wireDir.multiplyScalar(1 / len));
        _wireMid.addVectors(_wireA, _wireB).multiplyScalar(0.5);
        _wireScale.set(0.020, len * 1.02, 0.020);
        _wireMatrix.compose(_wireMid, _wireQuat, _wireScale);
        wireIM.setMatrixAt(utilityNetwork.instanceIndex(spanIndex, side, seg), _wireMatrix);
      }
    }
  }
  function rebuildWireSpans(indices = null) {
    if (!wireIM || !utilityNetwork) return;
    if (indices) {
      for (const spanIndex of indices) writeWireSpan(spanIndex);
    } else {
      for (let i = 0; i < utilityNetwork.spans.length; i++) writeWireSpan(i);
    }
    wireIM.instanceMatrix.needsUpdate = true;
  }
  if (utilityNetwork && utilityNetwork.instanceCount) {
    const wireGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1);
    wireIM = new THREE.InstancedMesh(wireGeo, mats.dark, utilityNetwork.instanceCount);
    wireIM.name = 'utility-wires';
    wireIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wireIM.castShadow = false;
    wireIM.receiveShadow = false;
    wireIM.frustumCulled = false;
    wireIM.matrixAutoUpdate = false;
    group.add(wireIM);
    rebuildWireSpans();
  }

  // content_breadth r2: map-specific set dressing (Frosthollow lake basin —
  // shoreline reeds / refrozen pressure ridges / rowboat / jetty). Soft
  // dressing only: pushes into the existing material buckets, no colliders.
  dressMapExtras({ mapId, extraKits: P.extraKits, L, heightField, rng, buckets });

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
    yield { fine: true }; // loading-speed r1: merge one material family per idle slice
  }

  // -------------------------------------------------------------------------
  yield;
  // DESTRUCTIBLE POOL FINALIZATION (world-dressing r1): one InstancedMesh per
  // type for the intact instances, one (initially empty) for the broken
  // debris states. Geometry is built ONCE per type per map from the kit's
  // seeded builders; per-instance variety rides matrix scale/yaw + the
  // world-space grime shader. Break = zero-scale the intact slot + activate a
  // broken slot: two matrix writes, no per-frame cost once settled.
  // -------------------------------------------------------------------------
  const _zeroScale = new THREE.Vector3(1e-4, 1e-4, 1e-4);
  for (const [kind, pool] of dPools) {
    yield; // perf-r3: one instanced-pool build per slice (geometry per kind)
    const meta = pool.meta;
    // DESTRUCTIBLES r1: wall modules ride the map-toned masonry materials
    // ('stone'/'plaster') so runs match the biome exactly like the old
    // merged walls did; everything else keeps the r1 wood/straw/baked split.
    const mat = mats[meta.mat] || mats.baked;
    const geoI = meta.build(drng);
    // Refit every destructible obstacle to the actual built geometry. The
    // metadata radius was only a placement hint; using it as a square
    // collider made carts, tents, crates and wall modules stop tanks in air.
    // One convex hull is derived per type, then transformed per instance.
    const pa = geoI.getAttribute && geoI.getAttribute('position');
    if (pa && pool.records.length) {
      const localPts = [];
      for (let i = 0; i < pa.count; i++) localPts.push([pa.getX(i), pa.getZ(i)]);
      const localHull = convexHull2(localPts);
      for (const rec of pool.records) {
        if (!rec.ob || localHull.length < 6) continue;
        const c = Math.cos(rec.yaw), s = Math.sin(rec.yaw);
        const points = new Array(localHull.length);
        for (let i = 0; i < localHull.length; i += 2) {
          const lx = localHull[i] * rec.sc, lz = localHull[i + 1] * rec.sc;
          points[i] = rec.x + lx * c + lz * s;
          points[i + 1] = rec.z - lx * s + lz * c;
        }
        setConvexShape(rec.ob, points);
        if (rec.col) setConvexShape(rec.col, points.slice());
      }
    }
    const imI = new THREE.InstancedMesh(geoI, mat, pool.mats4.length);
    for (let i = 0; i < pool.mats4.length; i++) imI.setMatrixAt(i, pool.mats4[i]);
    // winter: sourced sandbag models take the dark wet-hessian tint the old
    // solid emplacements wore (see bakedTint note below)
    if (snowCap && kind.startsWith('sandbag')) {
      const tint = new THREE.Color(0.52, 0.50, 0.47);
      for (let i = 0; i < pool.mats4.length; i++) imI.setColorAt(i, tint);
    }
    imI.castShadow = true;
    imI.receiveShadow = true;
    imI.matrixAutoUpdate = false;
    if (meta.cls === 'topple' || meta.cls === 'toss' || meta.cls === 'physics') imI.frustumCulled = false; // instances animate
    else imI.computeBoundingSphere();
    imI.name = 'destructible-' + kind;
    group.add(imI);
    pool.imI = imI;
    if (meta.broken) {
      const geoB = meta.broken(drng);
      const imB = new THREE.InstancedMesh(geoB, mat, pool.mats4.length);
      imB.count = 0;
      imB.visible = false;
      imB.castShadow = true;
      imB.receiveShadow = true;
      imB.matrixAutoUpdate = false;
      imB.frustumCulled = false; // slots appended over the battle
      imB.name = 'destructible-' + kind + '-broken';
      group.add(imB);
      pool.imB = imB;
    }
  }
  // spatial hash over destructible records for the shell paths (8 m cells)
  const D_CELL = 8;
  const dHash = new Map();
  for (let i = 0; i < destructibles.length; i++) {
    const rec = destructibles[i];
    const kx = Math.floor(rec.x / D_CELL), kz = Math.floor(rec.z / D_CELL);
    const key = kx + ':' + kz;
    let cell = dHash.get(key);
    if (!cell) { cell = []; dHash.set(key, cell); }
    cell.push(i);
    rec._dKey = key;
  }

  // Loose bodies can cross the shell hash's 8 m cells. Re-key only on a cell
  // boundary crossing (rare); the steady-state fixed step remains allocation
  // free and shell hits never target a stale/ghost position.
  function refreshDestructibleCell(rec) {
    const key = Math.floor(rec.x / D_CELL) + ':' + Math.floor(rec.z / D_CELL);
    if (key === rec._dKey) return;
    const old = dHash.get(rec._dKey);
    if (old) {
      const at = old.indexOf(rec._destructibleIndex);
      if (at >= 0) old.splice(at, 1);
    }
    let cell = dHash.get(key);
    if (!cell) { cell = []; dHash.set(key, cell); }
    cell.push(rec._destructibleIndex);
    rec._dKey = key;
  }
  for (let i = 0; i < destructibles.length; i++) destructibles[i]._destructibleIndex = i;

  // Dedicated static broad phase for awake clutter. It uses its own stamp so
  // it cannot interfere with map.js's movement grid over the same records.
  const LOOSE_CELL = 12;
  const looseCells = new Map();
  const looseCellKey = (x, z) => (x + 32768) * 65536 + (z + 32768);
  for (const ob of obstacles) {
    const x0 = Math.floor(ob.min[0] / LOOSE_CELL), x1 = Math.floor(ob.max[0] / LOOSE_CELL);
    const z0 = Math.floor(ob.min[2] / LOOSE_CELL), z1 = Math.floor(ob.max[2] / LOOSE_CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const key = looseCellKey(cx, cz);
      let cell = looseCells.get(key);
      if (!cell) { cell = []; looseCells.set(key, cell); }
      cell.push(ob);
    }
  }
  const looseObstacleScratch = [];
  let looseObstacleStamp = 0;
  function queryLooseObstacles(x, z, r) {
    looseObstacleScratch.length = 0;
    looseObstacleStamp++;
    const x0 = Math.floor((x - r) / LOOSE_CELL), x1 = Math.floor((x + r) / LOOSE_CELL);
    const z0 = Math.floor((z - r) / LOOSE_CELL), z1 = Math.floor((z + r) / LOOSE_CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const cell = looseCells.get(looseCellKey(cx, cz));
      if (!cell) continue;
      for (const ob of cell) {
        if (ob.__looseStamp === looseObstacleStamp) continue;
        ob.__looseStamp = looseObstacleStamp;
        if (ob.max[0] < x - r || ob.min[0] > x + r || ob.max[2] < z - r || ob.min[2] > z + r) continue;
        looseObstacleScratch.push(ob);
      }
    }
    return looseObstacleScratch;
  }

  // hinge-topple animation state (effects_combat r1 pole pattern, generalized
  // world-dressing r1): every entry rebuilds its instance matrix per tick from
  // the ORIGINAL placement so the hinge never compounds. Poles and topple-
  // class destructibles share the runner. Cap simultaneous anims — overflow
  // entries snap the oldest to its final pose.
  const crushAnims = [];
  const MAX_CRUSH_ANIMS = 14;
  const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion();
  const _cax = new THREE.Vector3();
  // Topple/toss poses run inside the RAF-driven world update. Reuse the same
  // composition matrices for every bounded animation instead of allocating
  // three Matrix4 objects per prop per frame.
  const _animM = new THREE.Matrix4();
  const _animR = new THREE.Matrix4();
  const _animT = new THREE.Matrix4();
  let fxBudget = 6; // kind-flavored break bursts per frame (refilled each tick)

  function poseToppled(a, ang) {
    _cax.set(a.ax, 0, a.az).normalize();
    _cq.setFromAxisAngle(_cax, ang);
    _animM.makeTranslation(a.x, a.y, a.z)
      .multiply(_animR.makeRotationFromQuaternion(_cq))
      .multiply(_animT.makeTranslation(-a.x, -a.y, -a.z))
      .multiply(a.placement);
    a.im.setMatrixAt(a.index, _animM);
    a.im.instanceMatrix.needsUpdate = true;
    if (a.wirePoleIndex != null && utilityNetwork) {
      const spans = utilityNetwork.setPoleFall(a.wirePoleIndex, a.ax, a.az, ang);
      rebuildWireSpans(spans);
    }
  }
  function pushCrushAnim(a) {
    if (crushAnims.length >= MAX_CRUSH_ANIMS) {
      const old = crushAnims.shift(); // snap-finish the oldest
      if (!old.placement) { old.im.getMatrixAt(old.index, _cm); old.placement = _cm.clone(); }
      if (old.type === 'toss') {
        if (old.spin == null) { old.spin = 6; old.r = old.h * 0.35; }
        poseTossed(old, old.dur);
      } else {
        poseToppled(old, old.maxAng);
      }
    }
    crushAnims.push(a);
  }

  // DESTRUCTIBLES r1: explosive chain queue — a red fuel drum detonating
  // inside breakRecord must not recurse into shellImpact mid-iteration, so
  // blasts are deferred one tick (also naturally staggers chained drums).
  const pendingBlasts = [];

  function ensureLooseActive(rec) {
    if (rec.looseListed) return;
    rec.looseListed = true;
    activeLoose.push(rec);
  }

  function kickLooseRecord(idx, dx, dz, speed, cause) {
    const rec = destructibles[idx];
    if (!rec || !rec.body || !kickLooseProp(rec.body, dx, dz, speed, cause)) return false;
    ensureLooseActive(rec);
    return true;
  }

  /**
   * Break/topple/toss one destructible record. All trigger paths land here
   * (hull-overrun obstacle seam, hull-radius loop, shell sweep/impact).
   * @param {number} idx destructibles index
   * @param {number} dx break direction (XZ, need not be unit)
   * @param {number} [speed=0] impact speed m/s (hull overrun) — debris throw
   *   inherits it; 0 = shell-grade base energy
   * @param {string} [cause='shell'] 'ram' | 'shell' | 'blast'
   * @returns {boolean} true if the record broke now
   */
  function breakRecord(idx, dx, dz, speed = 0, cause = 'shell') {
    const rec = destructibles[idx];
    if (!rec || rec.state) return false;
    const pool = dPools.get(rec.kind);
    if (!pool || !pool.imI) return false;
    // Loose dressing is displaced, never consumed. Shells/blasts kick it too,
    // and a later tank can push the exact same object again after it settles.
    if (rec.cls === 'physics') return kickLooseRecord(idx, dx, dz, speed, cause);
    rec.state = 1;
    if (rec.ob) rec.ob.crushed = true;          // ghost for collision + AI
    if (rec.col) rec.col.dead = true;           // shells/LOS pass the breach
    if (rec.loopRef) rec.loopRef.toppled = true; // stop the main.js loop
    const l = Math.hypot(dx, dz) || 1;
    if (rec.cls === 'topple') {
      setToppleAxis(_cax, dx, dz);
      pushCrushAnim({
        im: pool.imI, index: rec.slot, x: rec.x, y: rec.y, z: rec.z,
        ax: _cax.x, az: _cax.z, t: 0, placement: null,
        maxAng: settledToppleAngle(heightField, rec.x, rec.y, rec.z, dx, dz,
          rec.h, Math.max(0.05, Math.min(0.22, rec.r * 0.18))),
      });
    } else if (rec.cls === 'toss') {
      // DESTRUCTIBLES r1: rammed drums/churns go FLYING — short ballistic
      // arc along the impact direction (speed-scaled), tumbling in flight,
      // settling on their side. Persists via the anim's final pose.
      const th = 2.2 + Math.min(speed, 12) * 0.55;    // horizontal throw m/s
      setToppleAxis(_cax, dx, dz);
      pushCrushAnim({
        type: 'toss', im: pool.imI, index: rec.slot,
        x: rec.x, y: rec.y, z: rec.z, h: rec.h,
        vx: (dx / l) * th + (drng() - 0.5) * 1.2,
        vz: (dz / l) * th + (drng() - 0.5) * 1.2,
        vy: 2.6 + Math.min(speed, 12) * 0.30,
        ax: _cax.x, az: _cax.z,
        t: 0, placement: null, dur: 1.5,
      });
    } else {
      // swap-out: zero-scale the intact slot, activate a broken slot in place
      _quat.setFromAxisAngle(_upAxis, rec.yaw);
      _mat4.compose(_posv.set(rec.x, rec.y, rec.z), _quat, _zeroScale);
      pool.imI.setMatrixAt(rec.slot, _mat4);
      pool.imI.instanceMatrix.needsUpdate = true;
      if (pool.imB) {
        const bi = pool.nBroken++;
        if (bi < pool.mats4.length) {
          pool.imB.setMatrixAt(bi, pool.mats4[rec.slot]);
          pool.imB.count = pool.nBroken;
          pool.imB.visible = true;
          pool.imB.instanceMatrix.needsUpdate = true;
        }
      }
    }
    // explosive kinds (red fuel drums): a proper blast next tick — flavored
    // fireball via the fx seam + chained radius damage onto nearby records
    if (pool.meta.explosive) {
      pendingBlasts.push({ x: rec.x, y: rec.y + rec.h * 0.4, z: rec.z });
    }
    if (fxBudget > 0) {
      fxBudget--;
      // debris inherits the rammer's velocity: dir magnitude carries energy
      // (1 = shell-grade break; a 14 m/s overrun throws ~2.6x as hard)
      const throwK = 1 + Math.min(speed, 14) * 0.115;
      emitBreakFx(rec.kind, rec.x, rec.y + Math.min(0.5, rec.h * 0.3), rec.z,
        (dx / l) * throwK, (dz / l) * throwK, rec.h);
    }
    // audio seam (DESTRUCTIBLES r1): every destruction reports on the bus
    emitDestroyed({ kind: rec.kind, pos: [rec.x, rec.y, rec.z], cause });
    return true;
  }

  /** main.js crushables-loop contract (poles + 'loop'-class destructibles). */
  function crushProp(i, dx, dz, speed = 0) {
    const c = crushables[i];
    if (!c || c.toppled) return false;
    if (c.recIdx != null) {
      const rec = destructibles[c.recIdx];
      if (rec && rec.body) return kickLooseRecord(c.recIdx, dx, dz, speed, 'ram');
      c.toppled = true;
      return breakRecord(c.recIdx, dx, dz, speed, 'ram');
    }
    if (!poleIM) return false;
    c.toppled = true;
    setToppleAxis(_cax, dx, dz);
    // Hinge axis is perpendicular to travel and oriented so a positive
    // right-handed rotation makes the pole fall along the ram direction.
    pushCrushAnim({
      im: poleIM, index: c.index, x: c.x, y: c.y, z: c.z,
      wirePoleIndex: c.wirePoleIndex,
      ax: _cax.x, az: _cax.z, t: 0, placement: null,
      maxAng: settledToppleAngle(heightField, c.x, c.y, c.z, dx, dz, c.h, 0.12),
    });
    return true;
  }

  /** map.js crushObstacle seam for prop-tagged crushable obstacles. */
  function crushDestructible(propIdx, dx, dz, speed = 0, cause = 'ram') {
    return breakRecord(propIdx, dx, dz, speed, cause);
  }

  // shell paths (registered through src/world/destructibles.js; effects.js
  // forwards flight segments + world impact points)
  const _dCells = [];
  function cellsAround(x0, z0, x1, z1, pad) {
    _dCells.length = 0;
    const minX = Math.floor((Math.min(x0, x1) - pad) / D_CELL);
    const maxX = Math.floor((Math.max(x0, x1) + pad) / D_CELL);
    const minZ = Math.floor((Math.min(z0, z1) - pad) / D_CELL);
    const maxZ = Math.floor((Math.max(z0, z1) + pad) / D_CELL);
    // cap the scan: a chained flight segment can span tens of meters (an
    // APFSDS covers ~28 m per sim tick), so allow a generous window — empty
    // cells are a Map miss each; a pathological hitch-length span still bails
    if ((maxX - minX + 1) * (maxZ - minZ + 1) > 220) return _dCells;
    for (let kx = minX; kx <= maxX; kx++) {
      for (let kz = minZ; kz <= maxZ; kz++) {
        const cell = dHash.get(kx + ':' + kz);
        if (cell) _dCells.push(cell);
      }
    }
    return _dCells;
  }
  function shellSweep(ax, ay, az, bx, by, bz) {
    let broke = 0;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (const cell of cellsAround(ax, az, bx, bz, 2.5)) {
      for (const idx of cell) {
        const rec = destructibles[idx];
        if (rec.state) continue;
        // slab test: segment vs the record's AABB (x/z ± r, y .. y+h)
        let t0 = 0, t1 = 1, hit = true;
        const mins = [rec.x - rec.r, rec.y - 0.4, rec.z - rec.r];
        const maxs = [rec.x + rec.r, rec.y + rec.h, rec.z + rec.r];
        const o = [ax, ay, az], d = [dx, dy, dz];
        for (let a2 = 0; a2 < 3; a2++) {
          if (Math.abs(d[a2]) < 1e-9) {
            if (o[a2] < mins[a2] || o[a2] > maxs[a2]) { hit = false; break; }
            continue;
          }
          const inv = 1 / d[a2];
          let u0 = (mins[a2] - o[a2]) * inv, u1 = (maxs[a2] - o[a2]) * inv;
          if (u0 > u1) { const tt = u0; u0 = u1; u1 = tt; }
          if (u0 > t0) t0 = u0;
          if (u1 < t1) t1 = u1;
          if (t0 > t1) { hit = false; break; }
        }
        if (hit && breakRecord(idx, dx, dz, 0, 'shell') && ++broke >= 3) return;
      }
    }
  }
  function shellImpact(x, y, z, opts = {}) {
    const r = opts.r ?? (opts.he ? 4.6 : 1.0);
    const cause = opts.cause || 'blast';
    let broke = 0;
    for (const cell of cellsAround(x, z, x, z, r + 2.5)) {
      for (const idx of cell) {
        const rec = destructibles[idx];
        if (rec.state) continue;
        const ddx = rec.x - x, ddz = rec.z - z;
        if (Math.hypot(ddx, ddz) > r + rec.r) continue;
        if (y < rec.y - r || y > rec.y + rec.h + r) continue;
        if (breakRecord(idx, ddx, ddz, 0, cause) && ++broke >= 6) return;
      }
    }
  }
  registerWorldDestructibles({
    key: mapId,
    isActive: () => {
      for (let o = group; o; o = o.parent) if (o.visible === false) return false;
      return !!group.parent; // only once assembled into a scene
    },
    sweep: shellSweep,
    impact: shellImpact,
  });

  // DESTRUCTIBLES r1: tossed-prop pose — ballistic arc along the impact
  // direction with tumble, composed about the prop's own center against the
  // ORIGINAL placement (same non-compounding rule as the hinge topple).
  const _tq = new THREE.Quaternion();
  function poseTossed(a, t) {
    const u = Math.min(t / a.dur, 1);
    const ox = a.vx * t, oz = a.vz * t;
    let oy = a.vy * t - 4.9 * t * t;
    // rest pose: lying on its side — center drops from h/2 to its radius
    const rest = (a.r ?? a.h * 0.34) - a.h * 0.5;
    const gd = heightField.getHeightAt(a.x + ox, a.z + oz)
      - heightField.getHeightAt(a.x, a.z);
    if (oy < rest + gd) oy = rest + gd;
    // tumble, easing into a flat-lying quarter-turn multiple by touchdown
    const rawAng = a.spin * t;
    const lieAng = (Math.floor(rawAng / Math.PI) + 0.5) * Math.PI;
    const ang = u < 0.72 ? rawAng : rawAng + (lieAng - rawAng) * ((u - 0.72) / 0.28);
    _cax.set(a.ax, 0, a.az).normalize();
    _tq.setFromAxisAngle(_cax, ang);
    // M = T(flight offset) * T(center) * R * T(-center) * placement — tumble
    // about the prop's own mid-height, carried along the ballistic offset
    const cy = a.y + a.h * 0.5;
    _animM.makeTranslation(a.x + ox, cy + oy, a.z + oz)
      .multiply(_animR.makeRotationFromQuaternion(_tq))
      .multiply(_animT.makeTranslation(-a.x, -cy, -a.z))
      .multiply(a.placement);
    a.im.setMatrixAt(a.index, _animM);
    a.im.instanceMatrix.needsUpdate = true;
  }

  // Persistent loose-body pose: rotate the authored placement about its
  // scaled mid-height, then carry that center with the body. Shared matrices
  // keep every awake-body step allocation-free.
  const _looseQ = new THREE.Quaternion();
  const _looseM = new THREE.Matrix4();
  const _looseR = new THREE.Matrix4();
  function poseLooseRecord(rec) {
    const b = rec.body, pool = dPools.get(rec.kind);
    if (!b || !pool || !pool.imI) return;
    _looseQ.set(b.qx, b.qy, b.qz, b.qw);
    _looseM.makeTranslation(b.x, b.y, b.z);
    _looseR.makeRotationFromQuaternion(_looseQ);
    _looseM.multiply(_looseR);
    _looseR.makeTranslation(-b.homeX, -(b.homeBaseY + b.height * 0.5), -b.homeZ);
    _looseM.multiply(_looseR).multiply(pool.mats4[rec.slot]);
    pool.imI.setMatrixAt(rec.slot, _looseM);
    pool.imI.instanceMatrix.needsUpdate = true;
  }

  function syncLooseRecord(rec) {
    const b = rec.body;
    rec.x = b.x; rec.y = b.y - b.height * 0.5; rec.z = b.z;
    if (rec.loopRef) {
      rec.loopRef.x = b.x;
      rec.loopRef.y = b.y - b.radius;
      rec.loopRef.z = b.z;
    }
    refreshDestructibleCell(rec);
    poseLooseRecord(rec);
  }

  let looseAcc = 0;
  function updateLooseProps(dt) {
    if (!activeLoose.length || dt <= 0) return;
    looseAcc = Math.min(0.1, looseAcc + dt);
    while (looseAcc >= LOOSE_PROP_STEP_S) {
      looseAcc -= LOOSE_PROP_STEP_S;
      // Integrate + collide with static cover first.
      for (let i = activeLoose.length - 1; i >= 0; i--) {
        const rec = activeLoose[i], b = rec.body;
        stepLoosePropBody(b, LOOSE_PROP_STEP_S,
          heightField.getHeightAt, heightField.getNormalAt);
        for (const ob of queryLooseObstacles(b.x, b.z, b.radius + 0.08)) {
          resolveLoosePropObstacle(b, ob);
        }
      }
      // Momentum transfer wakes neighboring sleeping clutter. Active/active
      // pairs are resolved once by looseIndex ordering.
      for (let i = 0; i < activeLoose.length; i++) {
        const rec = activeLoose[i], a = rec.body;
        for (let j = 0; j < looseRecords.length; j++) {
          const other = looseRecords[j];
          if (other === rec || (other.body.active && other.looseIndex < rec.looseIndex)) continue;
          const wakes = resolveLoosePropPair(a, other.body);
          if ((wakes & 1) && !rec.looseListed) ensureLooseActive(rec);
          if (wakes & 2) ensureLooseActive(other);
        }
      }
      for (let i = activeLoose.length - 1; i >= 0; i--) {
        const rec = activeLoose[i];
        syncLooseRecord(rec);
        if (!rec.body.active) {
          rec.looseListed = false;
          activeLoose.splice(i, 1);
        }
      }
    }
  }

  function updateProps(dt, cameraPos = null) {
    updatePoleLod(cameraPos);
    fxBudget = 6; // per-frame kind-burst cap refill
    // DESTRUCTIBLES r1: deferred explosive-drum blasts (max 2/tick so chains
    // ripple instead of detonating as one frame spike)
    for (let b = 0; b < 2 && pendingBlasts.length; b++) {
      const bl = pendingBlasts.shift();
      emitBreakFx('drumblast', bl.x, bl.y, bl.z, 0, 0, 1.4); // flavored fireball
      shellImpact(bl.x, bl.y, bl.z, { r: 5.4, he: true, cause: 'blast' });
    }
    updateLooseProps(dt);
    if (!crushAnims.length) return; // zero per-frame cost when idle
    for (let k = crushAnims.length - 1; k >= 0; k--) {
      const a = crushAnims[k];
      if (!a.placement) {
        // capture the ORIGINAL placement on the first tick so the hinge/arc
        // composes against it, never an already-rotated matrix
        a.im.getMatrixAt(a.index, _cm);
        a.placement = _cm.clone();
        if (a.type === 'toss') {
          a.spin = 5.0 + mulberry32((a.index + 3) * 2654435761)() * 4.5;
          a.r = a.h * 0.35;
        } else {
          // random hinge-axis wobble so simultaneous topples de-sync
          const wob = (mulberry32((a.index + 1) * 2654435761)() - 0.5) * 0.22;
          const cw = Math.cos(wob), sw = Math.sin(wob);
          const nx = a.ax * cw - a.az * sw, nz = a.ax * sw + a.az * cw;
          a.ax = nx; a.az = nz;
        }
      }
      if (a.type === 'toss') {
        a.t = Math.min(a.t + dt, a.dur);
        poseTossed(a, a.t);
        if (a.t >= a.dur) crushAnims.splice(k, 1);
        continue;
      }
      a.t = Math.min(a.t + dt, 1.1);
      // eased fall to ~83-85deg with a small end bounce
      const u = Math.min(a.t / 0.8, 1);
      let ang = a.maxAng * u * u * (3 - 2 * u);
      if (a.t > 0.8) ang = a.maxAng - 0.06 * Math.sin((a.t - 0.8) * 18) * Math.exp(-(a.t - 0.8) * 6);
      poseToppled(a, ang);
      if (a.t >= 1.1) crushAnims.splice(k, 1);
    }
    updatePoleLod(cameraPos);
  }

  /**
   * DESTRUCTIBLES r1: rematch restore — worlds are cached and reused across
   * battles, so startBattle() calls this to stand every broken/toppled/
   * tossed destructible back up: records reset, intact instance matrices
   * restored, broken pools emptied, obstacle/collider ghosts revived, pole
   * topples righted and any in-flight anims dropped.
   */
  function resetDestructibles() {
    crushAnims.length = 0;
    pendingBlasts.length = 0;
    activeLoose.length = 0;
    looseAcc = 0;
    for (const rec of destructibles) {
      if (rec.ob) {
        rec.ob.crushed = false;
        rec.ob._pressS = 0;
        rec.ob._pressT = -1e9;
      }
      if (rec.col) rec.col.dead = false;
      if (rec.loopRef) rec.loopRef.toppled = false;
      if (rec.body) {
        resetLoosePropBody(rec.body);
        rec.looseListed = false;
        rec.x = rec.body.homeX; rec.y = rec.body.homeBaseY; rec.z = rec.body.homeZ;
        if (rec.loopRef) {
          rec.loopRef.x = rec.x; rec.loopRef.y = rec.y; rec.loopRef.z = rec.z;
        }
        refreshDestructibleCell(rec);
        const pool = dPools.get(rec.kind);
        if (pool && pool.imI) {
          pool.imI.setMatrixAt(rec.slot, pool.mats4[rec.slot]);
          pool.imI.instanceMatrix.needsUpdate = true;
        }
        continue;
      }
      if (!rec.state) continue;
      rec.state = 0;
      const pool = dPools.get(rec.kind);
      if (pool && pool.imI) {
        pool.imI.setMatrixAt(rec.slot, pool.mats4[rec.slot]);
        pool.imI.instanceMatrix.needsUpdate = true;
      }
    }
    for (const pool of dPools.values()) {
      pool.nBroken = 0;
      if (pool.imB) {
        pool.imB.count = 0;
        pool.imB.visible = false;
        pool.imB.instanceMatrix.needsUpdate = true;
      }
    }
    // felled telegraph poles stand back up (their placement matrices are
    // authoritative in bakedInstances; the topple only ever composed on top)
    if (poleIM) {
      let dirty = false;
      for (const c of crushables) {
        if (c.recIdx != null || c.index == null) continue;
        if (!c.toppled) continue;
        c.toppled = false;
        const e = bakedInstances.get('pole');
        if (e && e.list[c.index]) {
          poleIM.setMatrixAt(c.index, e.list[c.index]);
          dirty = true;
        }
      }
      if (dirty) poleIM.instanceMatrix.needsUpdate = true;
      updatePoleLod(lastPoleCamera, true);
    }
    if (utilityNetwork) {
      utilityNetwork.reset();
      rebuildWireSpans();
    }
  }

  return { group, obstacles, colliders, crushables, crushProp, crushDestructible,
    destructibles, looseRecords, updateProps, resetDestructibles, tankWreckSpots, utilityNetwork,
    getLoosePropStats: () => ({ total: looseRecords.length, active: activeLoose.length }),
    features: { buildings: buildingFeatures, tacticalBeats: tacticalBeatFeatures } };
}
