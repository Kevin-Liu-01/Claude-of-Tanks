// src/world/terrain.js — 1 km simplex heightfield + chunked LOD meshes + splat-blended
// procedural PBR ground material. Pure part (createHeightField) is node-runnable.
// Contract: docs/ARCHITECTURE.md §2.7, §3.2; visuals per docs/research/graphics-aaa.md §6–7.

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { applySourcedTerrain } from './sourcedTextures.js';
import { buildHorizonRing } from './maps/horizon.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const HALF = 512;
const MAP_SIZE = 1024;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

// ---------------------------------------------------------------------------
// Map layout — seed-independent composition (roads, village, spawns, marshes,
// lakes, drivable corridors), built from a map config (src/world/maps/*).
// Shared by the other world modules via heightField._layout.
// ---------------------------------------------------------------------------

function buildCountryRoads() {
  const roadA = []; // roughly N-S, curving through the village
  for (let z = -HALF; z <= HALF; z += 32) {
    roadA.push([10 + 26 * Math.sin(z * 0.0062) + 8 * Math.sin(z * 0.017 + 2.1), z]);
  }
  const roadB = []; // roughly E-W
  for (let x = -HALF; x <= HALF; x += 32) {
    roadB.push([x, 46 + 34 * Math.sin(x * 0.0043 + 1.0) + 7 * Math.sin(x * 0.013 - 0.6)]);
  }
  return [roadA, roadB];
}

// straight-ish grid streets (urban): N-S lines at xs[], E-W lines at zs[]
function buildGridRoads(grid) {
  const roads = [];
  const jit = grid.jitter ?? 2.5;
  for (let gi = 0; gi < grid.xs.length; gi++) {
    const gx = grid.xs[gi];
    const line = [];
    for (let z = -HALF; z <= HALF; z += 32) {
      line.push([gx + Math.sin(z * 0.011 + gi * 2.3) * jit, z]);
    }
    roads.push(line);
  }
  for (let gi = 0; gi < grid.zs.length; gi++) {
    const gz = grid.zs[gi];
    const line = [];
    for (let x = -HALF; x <= HALF; x += 32) {
      line.push([x, gz + Math.sin(x * 0.011 + gi * 1.7) * jit]);
    }
    roads.push(line);
  }
  return roads;
}

const DEFAULT_TERRAIN = {
  hillScale: 1.0,
  microScale: 1.0,
  rimH: 24, // tall enough that the rim crest hides the fogged outer floor
  village: { x0: -60, x1: 80, z0: -40, z1: 120, cx: 10, cz: 40, feather: 42, flatten: 0.85 },
  marshes: [
    { x: 220, z: -140, r: 38 },
    { x: -190, z: -210, r: 48 },
    { x: -330, z: 330, r: 30 },
  ],
  lakes: [],           // [{x,z,r,depth}] — flattened frozen/ice sheets
  frozenMarshes: false, // marsh/lake ground reads 'hard' (ice) instead of 'soft'
  dunes: null,          // {amp} — long ridged sand dunes
  mesas: null,          // {amp, thr0, thr1} — flat-topped plateaus
  roads: 'country',     // 'country' | {grid:{xs:[],zs:[],jitter}}
};

const DEFAULT_SPAWNS = {
  player: { x: 14, z: -78 },
  enemies: [
    { x: -30, z: 320 }, { x: 140, z: 350 }, { x: 265, z: 235 }, { x: -215, z: 270 },
    { x: -330, z: 140 }, { x: 330, z: 130 }, { x: 15, z: 430 },
  ],
};

/**
 * Build the seed-independent layout object for a map config.
 * @param {?object} cfg map config (src/world/maps/*) or null for defaults
 * @returns {{village:object,marshes:Array,lakes:Array,spawns:object,roads:Array}}
 */
export function createLayout(cfg) {
  const t = { ...DEFAULT_TERRAIN, ...(cfg && cfg.terrain ? cfg.terrain : {}) };
  const village = { ...DEFAULT_TERRAIN.village, ...(t.village || {}) };
  const spawnsSrc = (cfg && cfg.spawns) || DEFAULT_SPAWNS;
  const player = { ...spawnsSrc.player };
  const enemies = spawnsSrc.enemies.map((e) => ({ ...e }));
  for (const s of [player, ...enemies]) {
    s.yaw = Math.atan2(village.cx - s.x, village.cz - s.z); // face the village/town
  }
  const roads = t.roads === 'country' || !t.roads
    ? buildCountryRoads()
    : buildGridRoads(t.roads.grid);
  return {
    village,
    marshes: (t.marshes || []).map((m) => ({ ...m })),
    lakes: (t.lakes || []).map((l) => ({ ...l })),
    spawns: { player, enemies },
    roads,
    terrain: t,
  };
}

// squared point-to-segment distance, returning t of the projection
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return { d: Math.sqrt(ex * ex + ez * ez), t };
}

// ---------------------------------------------------------------------------
// createHeightField — PURE, node-runnable
// ---------------------------------------------------------------------------

/**
 * Build the deterministic heightfield for the 1024 m map.
 * @param {number} [seed=1337] terrain seed (mulberry32)
 * @param {?object} [cfg=null] map config (src/world/maps/*); null = classic verdant
 * @returns {{getHeightAt:function(number,number):number,
 *   getNormalAt:function(number,number):THREE.Vector3,
 *   getGroundType:function(number,number):('hard'|'medium'|'soft'),
 *   size:number, minY:number, maxY:number}} HeightField (ARCHITECTURE §2.7)
 */
export function createHeightField(seed = 1337, cfg = null) {
  const layout = createLayout(cfg);
  const T = layout.terrain;
  const _VILLAGE = layout.village;
  const _MARSHES = layout.marshes;
  const _LAKES = layout.lakes;
  const _SPAWN_PLAYER = layout.spawns.player;
  const _SPAWN_ENEMIES = layout.spawns.enemies;
  const noi = new SimplexNoise({ random: mulberry32((seed ^ 0x9e3779b9) >>> 0) });

  // --- base noise: fBm detail + domain-warped ridge, and a smooth variant ---
  function core(x, z) {
    const wx = noi.noise(x * 0.0016 + 13.7, z * 0.0016 - 4.2) * 80;
    const wz = noi.noise(x * 0.0016 - 27.1, z * 0.0016 + 9.3) * 80;
    let rr = 1 - Math.abs(noi.noise((x + wx) * 0.0026 + 51, (z + wz) * 0.0026 - 33));
    const ridge = rr * rr * 6.5;
    const o0 = noi.noise(x * 0.0038 + 101, z * 0.0038 - 71) * 8.5;
    const o1 = noi.noise(x * 0.0079 - 11, z * 0.0079 + 177) * 4.1;
    let d = ridge + o0 + o1;
    d += noi.noise(x * 0.0152 + 301, z * 0.0152 + 41) * 1.9;
    d += noi.noise(x * 0.0313 - 222, z * 0.0313 - 97) * 0.85;
    d += noi.noise(x * 0.064 + 77, z * 0.064 + 13) * 0.35;
    d += noi.noise(x * 0.131 - 8, z * 0.131 + 259) * 0.14;
    const s = ridge * 0.5 + o0 + o1 * 0.45;
    return { d, s };
  }

  // --- precomputed field grid: road distance/elevation + corridor weight ---
  const GN = 257, CELL = MAP_SIZE / (GN - 1); // 4 m cells
  const gRoadDist = new Float32Array(GN * GN).fill(1e9);
  const gRoadElev = new Float32Array(GN * GN);
  const gSegRoad = new Int16Array(GN * GN);
  const gSegIdx = new Int16Array(GN * GN);
  const gSegT = new Float32Array(GN * GN);
  const gCorridor = new Float32Array(GN * GN);

  const roads = layout.roads;
  const corridors = [_SPAWN_PLAYER, ..._SPAWN_ENEMIES].map(
    (s) => [s.x, s.z, _VILLAGE.cx, _VILLAGE.cz]
  );

  for (let gz = 0; gz < GN; gz++) {
    const z = gz * CELL - HALF;
    for (let gx = 0; gx < GN; gx++) {
      const x = gx * CELL - HALF;
      const i = gz * GN + gx;
      for (let r = 0; r < roads.length; r++) {
        const nodes = roads[r];
        for (let s = 0; s < nodes.length - 1; s++) {
          const { d, t } = segDist(x, z, nodes[s][0], nodes[s][1], nodes[s + 1][0], nodes[s + 1][1]);
          if (d < gRoadDist[i]) { gRoadDist[i] = d; gSegRoad[i] = r; gSegIdx[i] = s; gSegT[i] = t; }
        }
      }
      let cw = 0;
      for (const c of corridors) {
        const { d } = segDist(x, z, c[0], c[1], c[2], c[3]);
        cw = Math.max(cw, 1 - smoothstep(8, 30, d));
      }
      gCorridor[i] = cw;
    }
  }

  function gridSample(arr, x, z) {
    const gx = clamp((x + HALF) / CELL, 0, GN - 1.0001);
    const gz = clamp((z + HALF) / CELL, 0, GN - 1.0001);
    const x0 = gx | 0, z0 = gz | 0, fx = gx - x0, fz = gz - z0;
    const i = z0 * GN + x0;
    const a = arr[i] + (arr[i + 1] - arr[i]) * fx;
    const b = arr[i + GN] + (arr[i + GN + 1] - arr[i + GN]) * fx;
    return a + (b - a) * fz;
  }

  const villageY = core(_VILLAGE.cx, _VILLAGE.cz).s;

  function villageMask(x, z) {
    const dx = Math.max(_VILLAGE.x0 - x, x - _VILLAGE.x1, 0);
    const dz = Math.max(_VILLAGE.z0 - z, z - _VILLAGE.z1, 0);
    return (1 - smoothstep(0, _VILLAGE.feather, Math.hypot(dx, dz))) * (_VILLAGE.flatten ?? 0.85);
  }

  const padYs = new Float64Array(8); // filled below (player + 7 enemies)
  const padPts = [_SPAWN_PLAYER, ..._SPAWN_ENEMIES];
  const lakeLevels = new Float64Array(Math.max(1, _LAKES.length)); // filled below

  function heightAt(x, z, padsOn, roadsOn, lakesOn = true) {
    x = clamp(x, -HALF, HALF); z = clamp(z, -HALF, HALF);
    const { d, s } = core(x, z);
    const cw = gridSample(gCorridor, x, z);
    let h = (d + (s - d) * (cw * 0.72)) * T.hillScale;
    const vm = villageMask(x, z);
    if (vm > 0) h += (villageY * T.hillScale + (s - villageY) * 0.10 - h) * vm;
    let marshW = 0;
    for (const m of _MARSHES) {
      const md = Math.hypot(x - m.x, z - m.z);
      if (md < m.r) {
        const t = 1 - md / m.r;
        h -= 2.6 * t * t * (3 - 2 * t);
        marshW = Math.max(marshW, t);
      }
    }
    // map-specific macro forms: long ridged sand dunes / flat-topped mesas —
    // both attenuated on drive corridors and in the village so play flows.
    if (T.dunes) {
      const dn = 1 - Math.abs(noi.noise(x * 0.0021 + 402, z * 0.0046 + 91));
      const dn2 = noi.noise(x * 0.0064 - 55, z * 0.0064 + 233) * 0.5 + 0.5;
      h += dn * dn * dn * T.dunes.amp * (0.7 + dn2 * 0.5) * (1 - cw * 0.7) * (1 - vm);
    }
    if (T.mesas) {
      const mn = noi.noise(x * 0.0014 - 310, z * 0.0014 + 208) * 0.5 + 0.5;
      // real mesa profile: near-vertical cliff wall (tight threshold band),
      // flat cap, plus a smaller second tier so big buttes read stepped
      const band = (T.mesas.thr1 - T.mesas.thr0);
      const wall = smoothstep(T.mesas.thr0, T.mesas.thr0 + band * 0.28, mn);
      const tier2 = smoothstep(T.mesas.thr1 + 0.045, T.mesas.thr1 + 0.072, mn);
      const capNoise = 0.97 + 0.03 * noi.noise(x * 0.012 + 31, z * 0.012 - 74);
      h += (wall + tier2 * 0.45) * T.mesas.amp * capNoise * (1 - cw) * (1 - vm) * (1 - marshW);
    }
    // tactical micro-terrain: berm crests + shallow scrapes every ~70-110 m so
    // the open midfield offers hull-down folds instead of a flat golf course.
    // Attenuated (not zeroed) on drive corridors so they stay drivable, and
    // suppressed in the village/marshes.
    {
      const f1 = noi.noise(x * 0.0104 + 610, z * 0.0104 - 320);
      const f2 = noi.noise(x * 0.0233 - 105, z * 0.0233 + 77);
      let crest = 1 - Math.abs(f1);
      crest *= crest;
      let micro = smoothstep(0.42, 0.92, crest) * (2.1 + f2 * 0.8) // berms/ridgelines
        - smoothstep(0.55, 0.92, f2) * 1.5;                        // shallow depressions
      micro *= (1 - cw * 0.55) * (1 - vm) * (1 - marshW) * T.microScale;
      h += micro;
    }
    const rim = smoothstep(430, HALF, Math.max(Math.abs(x), Math.abs(z)));
    h += rim * rim * T.rimH;
    // frozen/ice lakes: pull the terrain to a flat sheet at the lake level
    if (lakesOn) {
      for (let li = 0; li < _LAKES.length; li++) {
        const lk = _LAKES[li];
        const ld = Math.hypot(x - lk.x, z - lk.z);
        if (ld < lk.r) {
          const w = smoothstep(lk.r, lk.r * 0.82, ld);
          h += (lakeLevels[li] - h) * w;
        }
      }
    }
    if (padsOn) {
      for (let p = 0; p < padPts.length; p++) {
        const pd = Math.hypot(x - padPts[p].x, z - padPts[p].z);
        if (pd < 22) h += (padYs[p] - h) * (1 - smoothstep(9, 22, pd));
      }
    }
    if (roadsOn) {
      const rd = gridSample(gRoadDist, x, z);
      // wide feather: the roadbed melts into the terrain instead of sitting
      // proud on an embankment shelf
      if (rd < 14) h += (gridSample(gRoadElev, x, z) - h) * (1 - smoothstep(3.8, 14, rd));
    }
    return h;
  }

  // --- road node elevations: pre-road height sampled + smoothed + junction blend ---
  const nodeElev = roads.map((nodes) => nodes.map(([nx, nz]) => heightAt(nx, nz, false, false)));
  for (const elev of nodeElev) {
    for (let pass = 0; pass < 4; pass++) {
      const prev = elev.slice();
      for (let i = 1; i < elev.length - 1; i++) elev[i] = prev[i - 1] * 0.25 + prev[i] * 0.5 + prev[i + 1] * 0.25;
    }
  }
  // blend every road pair to a common elevation at their crossing
  for (let ra = 0; ra < roads.length; ra++) for (let rb = ra + 1; rb < roads.length; rb++) {
    let jA = 0, jB = 0, best = 1e9;
    for (let a = 0; a < roads[ra].length; a++) for (let b = 0; b < roads[rb].length; b++) {
      const dd = Math.hypot(roads[ra][a][0] - roads[rb][b][0], roads[ra][a][1] - roads[rb][b][1]);
      if (dd < best) { best = dd; jA = a; jB = b; }
    }
    if (best > 40) continue; // roads never actually cross
    const jElev = (nodeElev[ra][jA] + nodeElev[rb][jB]) * 0.5;
    for (let k = -3; k <= 3; k++) {
      const w = (1 - Math.abs(k) / 4) * 0.85;
      if (nodeElev[ra][jA + k] !== undefined) nodeElev[ra][jA + k] += (jElev - nodeElev[ra][jA + k]) * w;
      if (nodeElev[rb][jB + k] !== undefined) nodeElev[rb][jB + k] += (jElev - nodeElev[rb][jB + k]) * w;
    }
  }
  for (let i = 0; i < GN * GN; i++) {
    const e = nodeElev[gSegRoad[i]];
    const s = gSegIdx[i];
    gRoadElev[i] = e[s] + (e[s + 1] - e[s]) * gSegT[i];
  }

  // --- lake sheet levels (pipeline without lakes/pads), then spawn pads ---
  for (let li = 0; li < _LAKES.length; li++) {
    const lk = _LAKES[li];
    let lo = Infinity;
    for (let a = 0; a < 8; a++) {
      const hh = heightAt(lk.x + Math.cos(a * 0.785) * lk.r * 0.6,
        lk.z + Math.sin(a * 0.785) * lk.r * 0.6, false, false, false);
      if (hh < lo) lo = hh;
    }
    lakeLevels[li] = Math.min(lo, heightAt(lk.x, lk.z, false, false, false)) - (lk.depth ?? 1.4);
  }
  for (let p = 0; p < padPts.length; p++) padYs[p] = heightAt(padPts[p].x, padPts[p].z, false, true);

  const getHeightAt = (x, z) => heightAt(x, z, true, true);

  const _scratchN = new THREE.Vector3();
  const NEPS = 1.2;
  function getNormalAt(x, z) {
    const hl = getHeightAt(x - NEPS, z), hr = getHeightAt(x + NEPS, z);
    const hd = getHeightAt(x, z - NEPS), hu = getHeightAt(x, z + NEPS);
    return _scratchN.set(hl - hr, 2 * NEPS, hd - hu).normalize();
  }

  function getGroundType(x, z) {
    if (gridSample(gRoadDist, x, z) < 4.3) return 'hard';
    for (const lk of _LAKES) {
      if (Math.hypot(x - lk.x, z - lk.z) < lk.r * 0.95) return 'hard'; // ice sheet
    }
    for (const m of _MARSHES) {
      const md = Math.hypot(x - m.x, z - m.z);
      if (md < m.r && 1 - md / m.r > 0.35) return T.frozenMarshes ? 'hard' : 'soft';
    }
    return 'medium';
  }

  // vegetation/prop exclusion: open water/ice + marsh cores
  function noVeg(x, z) {
    for (const lk of _LAKES) {
      if (Math.hypot(x - lk.x, z - lk.z) < lk.r * 1.04) return true;
    }
    for (const m of _MARSHES) {
      if (T.frozenMarshes && Math.hypot(x - m.x, z - m.z) < m.r) return true;
    }
    return false;
  }

  // --- min/max over a coarse scan ---
  let minY = Infinity, maxY = -Infinity;
  for (let gz = 0; gz <= 128; gz++) for (let gx = 0; gx <= 128; gx++) {
    const h = getHeightAt(gx * 8 - HALF, gz * 8 - HALF);
    if (h < minY) minY = h; if (h > maxY) maxY = h;
  }

  return {
    getHeightAt, getNormalAt, getGroundType,
    size: MAP_SIZE, minY, maxY,
    _roadDist: (x, z) => gridSample(gRoadDist, x, z),
    _villageMask: villageMask,
    _noVeg: noVeg,
    _layout: layout,
  };
}

// ---------------------------------------------------------------------------
// applyTone — per-map HSL retint of a generated RGBA pixel buffer (alpha kept:
// it packs roughness in the terrain layers, coverage in foliage cards).
// ---------------------------------------------------------------------------
const _toneCol = new THREE.Color();
const _toneHsl = { h: 0, s: 0, l: 0 };
/**
 * Retint pixels in place through an HSL transform.
 * @param {Uint8ClampedArray} px RGBA buffer
 * @param {?function(number,number,number):number[]} fn (h,s,l) => [h,s,l]
 * @returns {Uint8ClampedArray} the same buffer
 */
export function applyTone(px, fn) {
  if (!fn) return px;
  for (let i = 0; i < px.length; i += 4) {
    _toneCol.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    _toneCol.getHSL(_toneHsl);
    const [h, s, l] = fn(_toneHsl.h, _toneHsl.s, _toneHsl.l);
    _toneCol.setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1));
    px[i] = _toneCol.r * 255; px[i + 1] = _toneCol.g * 255; px[i + 2] = _toneCol.b * 255;
  }
  return px;
}

// ---------------------------------------------------------------------------
// Procedural PBR texture layers (browser-only; called from buildTerrainMeshes)
// ---------------------------------------------------------------------------

function canvasToTexture(px, s, { srgb = false, anisotropy = 4, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  c.getContext('2d').putImageData(new ImageData(px, s, s), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
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
  return canvasToTexture(px, s, { anisotropy });
}

// tileable simplex on a torus; integer fu/fv keep it seamless
function torusNoise(noi, u, v, fu, fv, off) {
  const a = u * Math.PI * 2 * fu, b = v * Math.PI * 2 * fv;
  const r1 = fu * 0.55, r2 = fv * 0.55;
  return noi.noise4d(Math.cos(a) * r1 + off, Math.sin(a) * r1 - off * 0.7,
    Math.cos(b) * r2 + off * 1.3, Math.sin(b) * r2 + off * 0.35);
}

// CPU twin of the splat shader's uNoise samples (seed 3011 matches
// makeShaderNoiseTexture in createSplatMaterial). Lets vegetation placement
// read the same dirt-patch/clump fields the ground shader blends with, so
// grass thins out exactly where the terrain shows dirt.
let _splatNoi = null;
export function sampleSplatNoise(x, z) {
  if (_splatNoi === null) _splatNoi = new SimplexNoise({ random: mulberry32(3011) });
  const w = (t) => ((t % 1) + 1) % 1;
  const u1 = w(x * 0.0117), v1 = w(z * 0.0117);
  const n1 = torusNoise(_splatNoi, u1, v1, 4, 4, 3) * 0.6 + torusNoise(_splatNoi, u1, v1, 9, 9, 27) * 0.4;
  const u2 = w(x * 0.0031 + 0.41), v2 = w(z * 0.0031 + 0.13);
  const n2 = torusNoise(_splatNoi, u2, v2, 2, 2, 55) * 0.7 + torusNoise(_splatNoi, u2, v2, 5, 5, 91) * 0.3;
  return { n1: n1 * 0.5 + 0.5, n2: n2 * 0.5 + 0.5 };
}

const _col = new THREE.Color();
function _css(h, s, l) { _col.setHSL(h, s, l); return _col.getStyle(); }

// draw a canvas path callback at all 9 wrap offsets so the tile stays seamless
function drawWrapped(ctx, s, fn) {
  for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
    ctx.save();
    ctx.translate(ox, oy);
    fn();
    ctx.restore();
  }
}

// Painted grass layer: noise macro base + thousands of individual blade
// strokes so the near field reads as turf, not single-frequency speckle.
function makeGrassLayer(seed, anisotropy, tone = null) {
  const s = 512;
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x7f4a);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  // macro base: soil showing through + moss/dry patches at 3-7 tile frequency
  const base = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      const macro = torusNoise(noi, u, v, 3, 3, 11) * 0.6 + torusNoise(noi, u, v, 7, 7, 23) * 0.4;
      const fine = torusNoise(noi, u, v, 43, 43, 61) * 0.5 + 0.5;
      const m01 = macro * 0.5 + 0.5;
      const dry = smoothstep(0.62, 0.9, m01);
      _col.setHSL(0.21 + macro * 0.03 - dry * 0.07, 0.34 - dry * 0.08, 0.16 + m01 * 0.07 + fine * 0.05);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // blade strokes: short curved tapers in varied greens + scattered dry blades
  ctx.lineCap = 'round';
  for (let b = 0; b < 3400; b++) {
    const x = rng() * s, y = rng() * s;
    const dry = rng() < 0.14;
    const lum = 0.16 + rng() * 0.17 + (dry ? 0.12 : 0);
    ctx.strokeStyle = dry
      ? _css(0.11 + rng() * 0.02, 0.32, lum)
      : _css(0.20 + rng() * 0.075, 0.36 + rng() * 0.16, lum);
    ctx.lineWidth = 1.1 + rng() * 1.4;
    const len = 7 + rng() * 12;
    const a = rng() * Math.PI * 2;
    const bend = (rng() - 0.5) * 8;
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
        y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
        x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    });
  }
  // tiny clover/weed dots
  for (let b = 0; b < 420; b++) {
    const x = rng() * s, y = rng() * s, r = 1 + rng() * 2;
    ctx.fillStyle = _css(0.26 + rng() * 0.05, 0.4, 0.2 + rng() * 0.16);
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const g = px[i * 4 + 1] / 255;
    hgt[i] = g;
    px[i * 4 + 3] = clamp(0.97 - g * 0.08, 0.03, 1) * 255; // roughness in alpha (matte turf)
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 1.8, anisotropy),
  };
}

// Painted dirt layer: clods + drawn pebbles + cracks — real macro structure
// for the sub-10 m ground and the road gravel pass.
function makeDirtLayer(seed, anisotropy, tone = null) {
  const s = 512;
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x2e91);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const base = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      const clods = torusNoise(noi, u, v, 4, 4, 7) * 0.65 + torusNoise(noi, u, v, 9, 9, 31) * 0.35;
      const grain = torusNoise(noi, u, v, 47, 47, 3) * 0.5 + 0.5;
      const c01 = clods * 0.5 + 0.5;
      _col.setHSL(0.077 + clods * 0.014, 0.25 - grain * 0.05, 0.16 + c01 * 0.10 + grain * 0.045);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // soft clod shading blobs
  for (let b = 0; b < 110; b++) {
    const x = rng() * s, y = rng() * s;
    const rw = 8 + rng() * 22, rh = rw * (0.5 + rng() * 0.7), rot = rng() * Math.PI;
    const dark = rng() < 0.5;
    ctx.globalAlpha = 0.14 + rng() * 0.14;
    ctx.fillStyle = _css(0.075 + rng() * 0.015, 0.24, dark ? 0.12 : 0.30);
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  // cracks: dark meandering polylines
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = rng() * s, y = rng() * s;
    let a = rng() * Math.PI * 2;
    ctx.strokeStyle = _css(0.07, 0.25, 0.075 + rng() * 0.035);
    ctx.lineWidth = 0.9 + rng() * 1.2;
    const segs = 4 + (rng() * 5) | 0;
    const ptsX = [x], ptsY = [y];
    for (let q = 0; q < segs; q++) {
      a += (rng() - 0.5) * 1.2;
      x += Math.cos(a) * (7 + rng() * 12);
      y += Math.sin(a) * (7 + rng() * 12);
      ptsX.push(x); ptsY.push(y);
    }
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
    });
  }
  // pebbles with a contact-shadow offset
  for (let b = 0; b < 640; b++) {
    const x = rng() * s, y = rng() * s, r = 0.8 + Math.pow(rng(), 1.8) * 3.2;
    const lum = 0.2 + rng() * 0.2;
    const sh = _css(0.075, 0.2, 0.08);
    const fill = _css(0.075 + rng() * 0.02, 0.10 + rng() * 0.12, lum);
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.arc(x + r * 0.4, y + r * 0.5, r, 0, Math.PI * 2);
      ctx.fillStyle = sh;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    });
  }
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const l = (px[i * 4] * 0.45 + px[i * 4 + 1] * 0.4 + px[i * 4 + 2] * 0.15) / 255;
    hgt[i] = l;
    px[i * 4 + 3] = clamp(0.98 - l * 0.09, 0.03, 1) * 255;
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 3.0, anisotropy),
  };
}

// Lake-ice layer (winter): pale blue-grey sheet with darker depth blotches,
// dark meandering pressure-crack lines, faint wind-blown snow drift streaks.
// Roughness (packed in alpha) is LOW on clear ice, high on the drifts, so the
// sheet picks up sun/sky specular and reads as ice, not mud.
function makeIceLayer(seed, anisotropy) {
  const s = 512;
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const rng = mulberry32(seed ^ 0x1cE5);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const base = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, j = (y * s + x) * 4;
      const depth = torusNoise(noi, u, v, 3, 3, 9) * 0.6 + torusNoise(noi, u, v, 7, 7, 41) * 0.4;
      const fine = torusNoise(noi, u, v, 23, 23, 77) * 0.5 + 0.5;
      const d01 = depth * 0.5 + 0.5;
      const deep = smoothstep(0.58, 0.9, 1 - d01); // dark water under thin ice
      _col.setHSL(0.565 + depth * 0.015, 0.13 + deep * 0.09,
        0.76 - deep * 0.15 + fine * 0.04);
      base.data[j] = _col.r * 255; base.data[j + 1] = _col.g * 255; base.data[j + 2] = _col.b * 255;
      base.data[j + 3] = 255;
    }
  }
  ctx.putImageData(base, 0, 0);
  // pressure cracks: long forking dark polylines with a bright refrozen edge
  ctx.lineCap = 'round';
  function crack(x, y, a, segs, w) {
    const ptsX = [x], ptsY = [y];
    for (let q = 0; q < segs; q++) {
      a += (rng() - 0.5) * 0.9;
      x += Math.cos(a) * (14 + rng() * 22);
      y += Math.sin(a) * (14 + rng() * 22);
      ptsX.push(x); ptsY.push(y);
    }
    drawWrapped(ctx, s, () => {
      ctx.strokeStyle = _css(0.58, 0.10, 0.78);
      ctx.lineWidth = w + 1.6;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
      ctx.strokeStyle = _css(0.60, 0.22, 0.16);
      ctx.lineWidth = w;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    if (segs > 3 && rng() < 0.7) crack(ptsX[2], ptsY[2], a + (rng() < 0.5 ? 0.9 : -0.9), segs - 2, w * 0.7);
  }
  for (let k = 0; k < 9; k++) crack(rng() * s, rng() * s, rng() * Math.PI * 2, 5 + (rng() * 4) | 0, 1.4 + rng() * 1.2);
  // wind-blown snow drift streaks, one global direction
  const dir = 0.6;
  for (let k = 0; k < 60; k++) {
    const x = rng() * s, y = rng() * s;
    const len = 30 + rng() * 90, wdt = 2 + rng() * 7;
    ctx.globalAlpha = 0.10 + rng() * 0.22;
    ctx.strokeStyle = _css(0.58, 0.04, 0.88);
    ctx.lineWidth = wdt;
    drawWrapped(ctx, s, () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(dir) * len * 0.5, y + Math.sin(dir) * len * 0.5 + (rng() - 0.5) * 8,
        x + Math.cos(dir) * len, y + Math.sin(dir) * len);
      ctx.stroke();
    });
  }
  ctx.globalAlpha = 1;
  const out = ctx.getImageData(0, 0, s, s);
  const px = new Uint8ClampedArray(out.data);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    const l = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.45 + px[i * 4 + 2] * 0.25) / 255;
    hgt[i] = l * 0.5 + 0.25;
    // bright texels = snow drift (rough); dark clear ice = glossy
    const snowy = smoothstep(0.72, 0.9, l);
    px[i * 4 + 3] = clamp(0.10 + snowy * 0.72, 0.05, 1) * 255;
  }
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 0.8, anisotropy),
  };
}

function makeGroundLayer(seed, kind, anisotropy, tone = null, roughMul = 1) {
  const s = 512;
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const px = new Uint8ClampedArray(s * s * 4);
  const hgt = new Float32Array(s * s);
  let nStrength = 2.0;
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, i = y * s + x, j = i * 4;
      let rough = 0.9, hn = 0.5;
      if (kind === 'rock') {
        const tone = torusNoise(noi, u, v, 3, 3, 17) * 0.5 + 0.5;
        const r1 = 1 - Math.abs(torusNoise(noi, u, v, 6, 6, 41));
        const r2 = 1 - Math.abs(torusNoise(noi, u, v, 15, 15, 8));
        const ridge = r1 * 0.62 + r2 * 0.38;
        const crack = smoothstep(0.86, 0.985, ridge);
        hn = 0.72 - crack * 0.62 + (tone - 0.5) * 0.34;
        _col.setHSL(0.082, 0.055 + tone * 0.035, (0.40 + tone * 0.14) * (1 - crack * 0.45));
        rough = 0.76 + crack * 0.12 - tone * 0.06;
        nStrength = 3.0;
      } else { // mud
        const macro = torusNoise(noi, u, v, 3, 3, 29) * 0.5 + 0.5;
        const rip = torusNoise(noi, u, v, 42, 42, 13) * 0.5 + 0.5;
        const puddle = smoothstep(0.56, 0.76, macro);
        hn = macro * 0.55 + rip * 0.18 - puddle * 0.28 + 0.25;
        _col.setHSL(0.068, 0.27 - puddle * 0.12, 0.145 + (1 - puddle) * 0.075 + rip * 0.028);
        // matte floor ~0.74: puddle texels used to dip to 0.46 and bloomed
        // into white glitter patches under the sun at grazing angles
        rough = 0.84 - puddle * 0.10;
        nStrength = 1.5;
      }
      hn = clamp(hn, 0, 1);
      hgt[i] = hn;
      const cav = 0.72 + 0.28 * hn; // cavity darkening baked into albedo
      px[j] = _col.r * cav * 255; px[j + 1] = _col.g * cav * 255; px[j + 2] = _col.b * cav * 255;
      // 0.45 floor: 0.03 was mirror-glossy — at grazing view·sun geometry the
      // GGX lobe blew the whole sun-facing midground to white sparkle (flyby)
      px[j + 3] = clamp(rough * roughMul, 0.45, 1) * 255; // roughness packed in albedo alpha
    }
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, nStrength, anisotropy),
  };
}

// R = road core, G = wheel ruts, B = marsh wetness, A = village worn ground.
// 2 texels/m: the rut lanes and road borders actually resolve instead of
// smearing into 1-texel airbrush mush.
function makeMaskTexture(seedNoi, layout) {
  const _VILLAGE = layout.village;
  const _MARSHES = [...layout.marshes, ...layout.lakes]; // lakes share the wet/ice channel
  const s = 2048, T = s / MAP_SIZE;
  const dist = new Float32Array(s * s).fill(1e9);
  for (const nodes of layout.roads) {
    for (let sg = 0; sg < nodes.length - 1; sg++) {
      const [ax, az] = nodes[sg], [bx, bz] = nodes[sg + 1];
      const x0 = clamp(Math.floor((Math.min(ax, bx) - 14 + HALF) * T), 0, s - 1);
      const x1 = clamp(Math.ceil((Math.max(ax, bx) + 14 + HALF) * T), 0, s - 1);
      const z0 = clamp(Math.floor((Math.min(az, bz) - 14 + HALF) * T), 0, s - 1);
      const z1 = clamp(Math.ceil((Math.max(az, bz) + 14 + HALF) * T), 0, s - 1);
      for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
        const { d } = segDist(tx / T - HALF, tz / T - HALF, ax, az, bx, bz);
        const i = tz * s + tx;
        if (d < dist[i]) dist[i] = d;
      }
    }
  }
  const px = new Uint8ClampedArray(s * s * 4);
  for (let tz = 0; tz < s; tz++) {
    const z = tz / T - HALF;
    for (let tx = 0; tx < s; tx++) {
      const x = tx / T - HALF, i = tz * s + tx, j = i * 4;
      const d = dist[i];
      if (d < 13) {
        // edge wobble + a slow width modulation so the road narrows/widens
        // along its length instead of running at one constant gauge
        const wob = seedNoi.noise(x * 0.055, z * 0.055) * 0.8 + seedNoi.noise(x * 0.21, z * 0.21) * 0.35;
        const wid = seedNoi.noise(x * 0.011 + 41, z * 0.011 - 17) * 1.5;
        let core = 1 - smoothstep(3.3 + wob + wid, 4.4 + wob + wid, d);
        // center grass strip between the wheel tracks
        core *= 0.34 + 0.66 * smoothstep(0.25, 0.95, d + wob * 0.12);
        px[j] = core * 255;
        // twin compacted wheel ruts, gaussian profile at +-1.55 m; amplitude
        // wanders along the road so the striping never repeats identically
        const rutAmp = 0.55 + 0.45 * (seedNoi.noise(x * 0.019 - 3, z * 0.019 + 8) * 0.5 + 0.5);
        const rut = Math.exp(-Math.pow((d - 1.55) / 0.55, 2));
        px[j + 1] = rut * core * 245 * rutAmp;
      }
      let marsh = 0;
      for (const m of _MARSHES) {
        const md = Math.hypot(x - m.x, z - m.z);
        if (md < m.r + 24) {
          if (m.depth !== undefined) { // lake: ice sheet with a drifted-snow bank
            const re = m.r * (1 + 0.05 * seedNoi.noise(x * 0.03 + 7, z * 0.03 - 3));
            marsh = Math.max(marsh, 1 - smoothstep(re * 0.78, re * 1.02, md));
          } else {
            const re = m.r * (1 + 0.18 * seedNoi.noise(x * 0.02 + 7, z * 0.02 - 3));
            marsh = Math.max(marsh, 1 - smoothstep(re * 0.45, re, md));
          }
        }
      }
      px[j + 2] = marsh * 255;
      const dx = Math.max(_VILLAGE.x0 - x, x - _VILLAGE.x1, 0);
      const dz = Math.max(_VILLAGE.z0 - z, z - _VILLAGE.z1, 0);
      const vm = 1 - smoothstep(0, 26, Math.hypot(dx, dz));
      if (vm > 0) {
        const patch = 0.45 + 0.55 * (seedNoi.noise(x * 0.045 - 19, z * 0.045 + 8) * 0.5 + 0.5);
        px[j + 3] = vm * patch * 0.8 * 255;
      }
    }
  }
  return canvasToTexture(px, s, { anisotropy: 4, repeat: false });
}

function makeShaderNoiseTexture(seed) {
  const s = 256;
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const px = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s, j = (y * s + x) * 4;
    const a = torusNoise(noi, u, v, 4, 4, 3) * 0.6 + torusNoise(noi, u, v, 9, 9, 27) * 0.4;
    const b = torusNoise(noi, u, v, 2, 2, 55) * 0.7 + torusNoise(noi, u, v, 5, 5, 91) * 0.3;
    px[j] = (a * 0.5 + 0.5) * 255;
    px[j + 1] = (b * 0.5 + 0.5) * 255;
    px[j + 2] = 128; px[j + 3] = 255;
  }
  return canvasToTexture(px, s, { anisotropy: 1 });
}

// ---------------------------------------------------------------------------
// Splat material
// ---------------------------------------------------------------------------

function _mustReplace(src, anchor, replacement) {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/terrain: shader anchor missing: ${anchor}`);
  return out;
}

const SPLAT_COMMON_FRAG = /* glsl */`
varying vec3 vWPos;
varying vec3 vWNormal;
uniform sampler2D uAlbG, uAlbD, uAlbR, uAlbM;
uniform sampler2D uNrmG, uNrmD, uNrmR, uNrmM;
uniform sampler2D uMask, uNoise;
uniform vec3 uTintA, uTintB, uTintC, uRoadTint;
uniform float uMarshGloss;
uniform float uMicroAmp, uStrata, uRoadTex, uTownWear, uIceDrift;
uniform vec3 uRipple; // xy = wind dir, z = ripple normal amplitude
vec3 gSplatAlbedo; float gSplatRough; vec3 gSplatNrm;
vec4 splatSamp(sampler2D t, vec2 uv, float df, float mb) {
  return mix(texture2D(t, uv, mb), texture2D(t, uv * 0.2317 + vec2(0.5), mb), df);
}
void splatCompute() {
  vec3 wp = vWPos;
  vec3 wn = normalize(vWNormal);
  vec2 mUV = (wp.xz + 512.0) * (1.0 / 1024.0);
  vec4 mk = texture2D(uMask, mUV);
  float camDist = distance(wp, cameraPosition);
  float df = smoothstep(45.0, 160.0, camDist);
  float farM = smoothstep(90.0, 330.0, camDist);
  // detail fade: positive mip bias at range kills the single-frequency
  // speckle shimmer that anisotropic filtering keeps resolving
  float mipB = farM * 2.0;
  vec2 uv = wp.xz;
  float n1 = texture2D(uNoise, uv * 0.0117).r;
  float n1h = texture2D(uNoise, uv * 0.047).r; // high-freq edge breaker
  float n2 = texture2D(uNoise, uv * 0.0031 + vec2(0.41, 0.13)).g;
  float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
  // distance-attenuated edge breaker: full crispness near the camera, eased
  // toward its mean at range so the road blend never shows dither stipple
  // at 50-100 m
  float n1hs = mix(n1h, 0.5, farM * 0.85);
  // road masks: crisp noise-broken compacted core + wider soft dirt shoulder
  float roadCore = smoothstep(0.38, 0.70, mk.r + (n1hs - 0.5) * 0.30);
  float shoulder = smoothstep(0.04, 0.60, mk.r + (n1hs - 0.5) * 0.20);
  float rut = mk.g * (0.62 + 0.38 * n1hs);
  // dirt patches: noise-broken threshold => small worn patches with ragged
  // edges instead of giant airbrushed smears
  float worn = smoothstep(0.62, 0.78, n2 + (n1 - 0.5) * 0.45);
  float fD = clamp(max(worn * 0.62, max(shoulder, mk.a * uTownWear * (0.35 + 0.65 * n1))), 0.0, 1.0);
  float fM = mk.b;
  float fR = smoothstep(0.095, 0.235, slope + (n1 - 0.5) * 0.07);
  // hard rock takeover on steep faces (> ~30 deg): cliff walls and cut banks
  // always read as rock regardless of the noise breakup
  fR = max(fR, smoothstep(0.32, 0.50, slope));
  vec4 a = splatSamp(uAlbG, uv * 0.240, df, mipB);
  vec4 n = splatSamp(uNrmG, uv * 0.240, df, mipB);
  a = mix(a, splatSamp(uAlbD, uv * 0.210, df, mipB), fD); n = mix(n, splatSamp(uNrmD, uv * 0.210, df, mipB), fD);
  a = mix(a, splatSamp(uAlbM, uv * 0.190, df, mipB), fM); n = mix(n, splatSamp(uNrmM, uv * 0.190, df, mipB), fM);
  a = mix(a, splatSamp(uAlbR, uv * 0.155, df, mipB), fR); n = mix(n, splatSamp(uNrmR, uv * 0.155, df, mipB), fR);
  // triplanar side projection on steep faces: planar XZ UVs smear vertically
  // down cliff walls (the classic heightmap-stretch tell on the mesa cliffs)
  // — resample the rock layer in the wall's own plane and take it over as
  // the slope rises, so cliffs read as stratified rock instead of dragged
  // paint
  float steepW = smoothstep(0.34, 0.55, slope);
  if (steepW > 0.001) {
    float axisW = smoothstep(-0.08, 0.08, abs(wn.x) - abs(wn.z));
    vec2 uvSideA = vec2(wp.z, -wp.y) * 0.155;
    vec2 uvSideB = vec2(wp.x, -wp.y) * 0.155;
    vec4 aS = mix(splatSamp(uAlbR, uvSideA, df, mipB), splatSamp(uAlbR, uvSideB, df, mipB), axisW);
    vec4 nS = mix(splatSamp(uNrmR, uvSideA, df, mipB), splatSamp(uNrmR, uvSideB, df, mipB), axisW);
    a = mix(a, aS, steepW);
    n = mix(n, nS, steepW);
  }
  // meadow macro variation, three scales (~80 m, ~230 m, ~600 m): dry-straw
  // patches, dark clover, and broad field-to-field tone shifts so open ground
  // never reads as one continuous green wash at any distance
  float meadowA = texture2D(uNoise, uv * 0.0121 + vec2(0.63, 0.29)).r;
  float meadowB = texture2D(uNoise, uv * 0.0043 + vec2(0.11, 0.87)).g;
  float meadowC = texture2D(uNoise, uv * 0.0016 + vec2(0.37, 0.55)).r;
  // strength capped ~0.30-0.35 with n1 edge breakup so patch borders are
  // ragged at the ~10 m scale — full-strength smoothstep bands read as a
  // broken cloud-shadow projector in wide shots
  a.rgb = mix(a.rgb, a.rgb * uTintA, smoothstep(0.54, 0.85, meadowA) * (0.22 + 0.18 * n1) * (1.0 - fD));
  a.rgb = mix(a.rgb, a.rgb * uTintB, smoothstep(0.58, 0.85, 1.0 - meadowB) * (0.18 + 0.16 * n1) * (1.0 - fD));
  a.rgb = mix(a.rgb, a.rgb * uTintC, smoothstep(0.52, 0.9, meadowC) * (0.16 + 0.14 * n1) * (1.0 - fD));
  a.rgb *= 0.93 + meadowC * 0.14;
  // mid-frequency relief + mottle (25-450 m): stroke-free bump from the
  // SMOOTH noise field gradient (texture normals reused at giant scales read
  // as scratch marks), so the midground never collapses into smooth felt
  {
    float dMid = smoothstep(20.0, 55.0, camDist) * (1.0 - smoothstep(220.0, 480.0, camDist));
    vec2 uvA = uv * 0.017;
    float ha = texture2D(uNoise, uvA).r;
    vec2 ga = vec2(texture2D(uNoise, uvA + vec2(0.006, 0.0)).r - ha,
                   texture2D(uNoise, uvA + vec2(0.0, 0.006)).r - ha);
    vec2 uvB = uv * 0.0052;
    float hb = texture2D(uNoise, uvB).g;
    vec2 gb = vec2(texture2D(uNoise, uvB + vec2(0.005, 0.0)).g - hb,
                   texture2D(uNoise, uvB + vec2(0.0, 0.005)).g - hb);
    n.xy -= (ga * 1.4 + gb * 2.0) * dMid;
    float midN2 = texture2D(uNoise, uv * 0.0089 + vec2(0.71, 0.23)).g;
    a.rgb *= 1.0 + (ha - 0.5) * 0.09 * dMid
                 + (midN2 - 0.5) * 0.12 * smoothstep(30.0, 90.0, camDist);
    // rock gets its own coarse relief so cliff faces stay craggy at range
    vec3 dnR = texture2D(uNrmR, uv * 0.041).xyz * 2.0 - 1.0;
    n.xy += dnR.xy * fR * 0.9 * dMid;
  }
  // horizontal strata banding on steep faces (mesa cliff walls), world-Y driven
  if (uStrata > 0.001) {
    float steep = smoothstep(0.28, 0.52, slope);
    float band = sin(wp.y * 1.9 + n1 * 2.4) * 0.6 + sin(wp.y * 0.57 + n2 * 1.9) * 0.4;
    a.rgb *= 1.0 + band * uStrata * steep;
    a.rgb = mix(a.rgb, a.rgb * vec3(1.05, 0.90, 0.78), steep * 0.35); // baked iron-oxide faces
  }
  // far-cliff detail rescue: the mip-biased macro fade flattens steep rock
  // faces past ~300 m into featureless sheets — re-project the rock layer at
  // a coarse world scale + its normals so distant mesa/cut walls stay craggy
  {
    float farRock = fR * farM;
    if (farRock > 0.003) {
      vec4 rr = texture2D(uAlbR, uv * 0.031);
      a.rgb = mix(a.rgb, a.rgb * (0.74 + rr.rgb * 0.48), farRock * 0.55);
      vec3 rn = texture2D(uNrmR, uv * 0.019).xyz * 2.0 - 1.0;
      n.xy += rn.xy * farRock * 0.9;
    }
  }
  // wind-aligned sand ripples: anisotropic normal waves instead of dot noise.
  // Two wavelengths: ~2 m gameplay-range ripples + ~11 m dune-face waves that
  // still resolve in establishing shots.
  if (uRipple.z > 0.001) {
    float rphase = dot(uv, uRipple.xy);
    float rw = (sin(rphase * 2.9 + texture2D(uNoise, uv * 0.019).r * 7.0)
                  * (1.0 - smoothstep(40.0, 150.0, camDist))
              + sin(rphase * 0.55 + texture2D(uNoise, uv * 0.006).g * 4.0) * 1.1
                  * (1.0 - smoothstep(120.0, 420.0, camDist)))
              * uRipple.z * (1.0 - fR);
    n.xy += uRipple.xy * rw;
  }
  // 0-48 m detail pass: layered micro normals + albedo speckle + road gravel
  float dNear = 1.0 - smoothstep(18.0, 48.0, camDist);
  if (dNear > 0.001) {
    vec3 dn = texture2D(uNrmD, uv * 1.07).xyz * 2.0 - 1.0;
    n.xy += dn.xy * 0.85 * dNear;
    float micro = texture2D(uNoise, uv * 0.171).r;
    a.rgb *= 1.0 + (micro - 0.5) * 0.30 * dNear * uMicroAmp;
    vec4 grav = texture2D(uAlbR, uv * 0.83);
    a.rgb = mix(a.rgb, grav.rgb * vec3(1.02, 0.96, 0.86), roadCore * 0.42 * dNear);
    // sub-10 m second octave: clod/blade relief right under the camera
    float dNear2 = 1.0 - smoothstep(5.0, 15.0, camDist);
    if (dNear2 > 0.001) {
      vec3 dn2 = texture2D(uNrmG, uv * 2.71).xyz * 2.0 - 1.0;
      n.xy += dn2.xy * 0.6 * dNear2;
    }
  }
  {
    // compacted earth road: two-track profile — lightened compacted core,
    // dark wheel ruts, damp borders. uRoadTex (0..1) cross-fades to PAVED
    // town streets: the rock layer (cobble/sett) laid across the full
    // carriageway at every distance, ruts nearly gone.
    float dW = roadCore * 0.9 * (1.0 - uRoadTex);
    // pull the compacted core toward NEUTRAL packed earth: tint, then
    // partially desaturate so the carriageway never glows orange against
    // the graded green field
    vec3 roadCol = a.rgb * uRoadTint + vec3(0.014, 0.010, 0.006);
    roadCol = mix(roadCol, vec3(dot(roadCol, vec3(0.34, 0.45, 0.21))), 0.26);
    a.rgb = mix(a.rgb, roadCol, dW);
    a.rgb *= 1.0 - rut * mix(0.55, 0.10, uRoadTex);
    if (uRoadTex > 0.01) {
      float paveCore = smoothstep(0.14, 0.40, mk.r + (n1hs - 0.5) * 0.10) * uRoadTex;
      vec4 pav = splatSamp(uAlbR, uv * 0.31, df, mipB);
      vec4 pnn = splatSamp(uNrmR, uv * 0.31, df, mipB);
      a.rgb = mix(a.rgb, pav.rgb * uRoadTint, paveCore * 0.94);
      a.a = mix(a.a, pav.a, paveCore * 0.85);
      n = mix(n, pnn, paveCore * 0.85);
    }
  }
  float edgeBand = shoulder * (1.0 - roadCore);
  a.rgb *= 1.0 - edgeBand * 0.09;
  // rut relief from the mask G gradient (visible well past the near ring)
  {
    float texel = 1.4 / 1024.0;
    vec2 rutG;
    rutG.x = texture2D(uMask, mUV + vec2(texel, 0.0)).g - texture2D(uMask, mUV - vec2(texel, 0.0)).g;
    rutG.y = texture2D(uMask, mUV + vec2(0.0, texel)).g - texture2D(uMask, mUV - vec2(0.0, texel)).g;
    n.xy += rutG * 0.9 * (1.0 - df);
  }
  // wind-blown snow drifts across the ice sheet + snowbank shoreline blend
  float driftW = 0.0;
  if (uIceDrift > 0.001 && fM > 0.02) {
    float drift = smoothstep(0.52, 0.78,
      texture2D(uNoise, uv * 0.021 + vec2(0.31, 0.77)).r + (n1h - 0.5) * 0.30);
    float bank = 1.0 - smoothstep(0.25, 0.75, fM); // shoreline band drifts hardest
    driftW = clamp(drift * uIceDrift * (0.48 + bank * 0.52), 0.0, 1.0) * fM;
    a = mix(a, splatSamp(uAlbG, uv * 0.240, df, mipB), driftW);
    n = mix(n, splatSamp(uNrmG, uv * 0.240, df, mipB), driftW);
  }
  a.rgb *= 0.90 + n2 * 0.20;
  // wet/dark shoreline band where ground meets a marsh or ice sheet: the
  // sheet blends into darkened damp banks instead of ending on a hard seam
  float shoreW = smoothstep(0.04, 0.30, fM) * (1.0 - smoothstep(0.55, 0.95, fM));
  a.rgb *= 1.0 - shoreW * 0.30 * (1.0 - driftW);
  // distant mottling: forest-floor/heather patches keep far hills from reading
  // as one flat green wash
  float mot = texture2D(uNoise, uv * 0.0022 + vec2(0.17, 0.71)).g;
  a.rgb *= 1.0 - farM * 0.20 * smoothstep(0.48, 0.82, mot);
  a.rgb *= 1.0 + farM * 0.13 * smoothstep(0.55, 0.85, n1) * (1.0 - smoothstep(0.48, 0.82, mot));
  gSplatAlbedo = a.rgb;
  float iceW = clamp(fM * uMarshGloss * 1.3, 0.0, 1.0) * (1.0 - driftW);
  float rough0 = clamp(a.a * (1.0 - roadCore * 0.12) * (1.0 + rut * 0.1)
    * (1.0 - fM * uMarshGloss * (1.0 - driftW)), 0.05, 1.0);
  // matte floor: kills the wet-plastic sheen / white sparkle glints on every
  // ground type except intentionally glossy lake ice
  gSplatRough = max(rough0, 0.78 * (1.0 - iceW) + shoreW * -0.12);
  gSplatNrm = n.xyz * 2.0 - 1.0;
}
`;

const SPLAT_NORMAL_FRAG = /* glsl */`
{
  vec3 dN = gSplatNrm;
  vec3 gN = normalize(vWNormal);
  vec3 wN = normalize(vec3(gN.x + dN.x * 0.9, max(gN.y, 0.02), gN.z + dN.y * 0.9));
  normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
}
`;

function createSplatMaterial(engineCtx, layout, splatCfg, mapId = 'verdant') {
  const S = splatCfg || {};
  const aniso = engineCtx.anisotropy ?? 4;
  const layers = {
    G: makeGrassLayer(3000, aniso, S.grassTone || null),
    D: makeDirtLayer(3001, aniso, S.dirtTone || null),
    R: makeGroundLayer(3002, 'rock', aniso, S.rockTone || null),
    M: S.iceLake
      ? makeIceLayer(3003, aniso)
      : makeGroundLayer(3003, 'mud', aniso, S.mudTone || null, S.mudRough ?? 1),
  };
  // Deep-hunt 2026-07: sourced CC0 PBR sets (ambientCG/Poly Haven, see
  // docs/ATTRIBUTION.md) replace the procedural layer textures in place when
  // available; procedural stays the synchronous fallback behind the flag in
  // sourcedTextures.js and on any load failure.
  applySourcedTerrain(mapId, layers, S);
  const maskNoi = new SimplexNoise({ random: mulberry32(3010) });
  const mask = makeMaskTexture(maskNoi, layout);
  const noiseTex = makeShaderNoiseTexture(3011);
  const tintA = S.tintA || [1.16, 1.08, 0.76];
  const tintB = S.tintB || [0.78, 0.90, 0.72];
  const tintC = S.tintC || [1.10, 1.04, 0.84];
  // neutral packed-earth default (the old 1.20/1.12/0.96 pushed roads orange)
  const roadTint = S.roadTint || [1.08, 1.04, 0.96];

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 });
  const splatHook = (shader) => {
    shader.uniforms.uAlbG = { value: layers.G.albedo };
    shader.uniforms.uAlbD = { value: layers.D.albedo };
    shader.uniforms.uAlbR = { value: layers.R.albedo };
    shader.uniforms.uAlbM = { value: layers.M.albedo };
    shader.uniforms.uNrmG = { value: layers.G.normal };
    shader.uniforms.uNrmD = { value: layers.D.normal };
    shader.uniforms.uNrmR = { value: layers.R.normal };
    shader.uniforms.uNrmM = { value: layers.M.normal };
    shader.uniforms.uMask = { value: mask };
    shader.uniforms.uNoise = { value: noiseTex };
    shader.uniforms.uTintA = { value: new THREE.Vector3(...tintA) };
    shader.uniforms.uTintB = { value: new THREE.Vector3(...tintB) };
    shader.uniforms.uTintC = { value: new THREE.Vector3(...tintC) };
    shader.uniforms.uRoadTint = { value: new THREE.Vector3(...roadTint) };
    shader.uniforms.uMarshGloss = { value: S.marshGloss ?? 0 };
    shader.uniforms.uMicroAmp = { value: S.microAmp ?? 1 };
    shader.uniforms.uStrata = { value: S.strata ?? 0 };
    shader.uniforms.uRoadTex = { value: S.pavedRoads ? 1 : clamp(S.roadTexMix ?? 0, 0, 1) };
    shader.uniforms.uTownWear = { value: S.townWear ?? 1 };
    shader.uniforms.uIceDrift = { value: S.iceLake ? (S.iceDrift ?? 0.85) : 0 };
    {
      const rd = S.rippleDir || [0.8, 0.6];
      const rl = Math.hypot(rd[0], rd[1]) || 1;
      shader.uniforms.uRipple = {
        value: new THREE.Vector3(rd[0] / rl, rd[1] / rl, S.rippleAmp ?? 0),
      };
    }
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\n' + SPLAT_COMMON_FRAG);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>',
      'splatCompute();\ndiffuseColor.rgb *= gSplatAlbedo;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <roughnessmap_fragment>',
      'float roughnessFactor = roughness * gSplatRough;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>',
      SPLAT_NORMAL_FRAG);
  };
  engineCtx.setupShadowMaterial(mat, splatHook);
  mat.customProgramCacheKey = () => 'world-terrain-splat-v7';
  return mat;
}

// ---------------------------------------------------------------------------
// Chunked LOD terrain meshes
// ---------------------------------------------------------------------------

const CHUNKS = 8, CHUNK_SIZE = MAP_SIZE / CHUNKS;
const LOD_SEGS = [96, 48, 24];
const LOD_DIST = [200, 430]; // near < 200, mid < 430, else far
const SKIRT_DROP = 2.5;

function buildChunkGeometry(hf, cx0, cz0, segs) {
  const n = segs + 1, step = CHUNK_SIZE / segs;
  // padded height grid for seam-free central-difference normals
  const pn = n + 2;
  const hgrid = new Float64Array(pn * pn);
  for (let gz = 0; gz < pn; gz++) for (let gx = 0; gx < pn; gx++) {
    hgrid[gz * pn + gx] = hf.getHeightAt(cx0 + (gx - 1) * step, cz0 + (gz - 1) * step);
  }
  const perim = 4 * segs;
  const vcount = n * n + perim;
  const pos = new Float32Array(vcount * 3);
  const nrm = new Float32Array(vcount * 3);
  const inv2e = 1 / (2 * step);
  let vi = 0;
  for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++) {
    const wx = cx0 + gx * step, wz = cz0 + gz * step;
    const h = hgrid[(gz + 1) * pn + (gx + 1)];
    pos[vi * 3] = wx; pos[vi * 3 + 1] = h; pos[vi * 3 + 2] = wz;
    const hl = hgrid[(gz + 1) * pn + gx], hr = hgrid[(gz + 1) * pn + (gx + 2)];
    const hd = hgrid[gz * pn + (gx + 1)], hu = hgrid[(gz + 2) * pn + (gx + 1)];
    const nx = (hl - hr) * inv2e, nz = (hd - hu) * inv2e;
    const il = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
    nrm[vi * 3] = nx * il; nrm[vi * 3 + 1] = il; nrm[vi * 3 + 2] = nz * il;
    vi++;
  }
  // perimeter vertex indices in ring order (S, E, N, W edges)
  const ring = [];
  for (let gx = 0; gx < segs; gx++) ring.push(gx);                       // z=min, x asc
  for (let gz = 0; gz < segs; gz++) ring.push(gz * n + (n - 1));         // x=max, z asc
  for (let gx = segs; gx > 0; gx--) ring.push((n - 1) * n + gx);         // z=max, x desc
  for (let gz = segs; gz > 0; gz--) ring.push(gz * n);                   // x=min, z desc
  for (let k = 0; k < perim; k++) {
    const src = ring[k], dst = n * n + k;
    pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - SKIRT_DROP; pos[dst * 3 + 2] = pos[src * 3 + 2];
    nrm[dst * 3] = nrm[src * 3]; nrm[dst * 3 + 1] = nrm[src * 3 + 1]; nrm[dst * 3 + 2] = nrm[src * 3 + 2];
  }
  const idx = new Uint32Array(segs * segs * 6 + perim * 6);
  let ii = 0;
  for (let gz = 0; gz < segs; gz++) for (let gx = 0; gx < segs; gx++) {
    const a = gz * n + gx, b = a + 1, c = a + n, d = c + 1;
    idx[ii++] = a; idx[ii++] = c; idx[ii++] = b;
    idx[ii++] = b; idx[ii++] = c; idx[ii++] = d;
  }
  for (let k = 0; k < perim; k++) {
    const t0 = ring[k], t1 = ring[(k + 1) % perim];
    const s0 = n * n + k, s1 = n * n + ((k + 1) % perim);
    idx[ii++] = t0; idx[ii++] = s0; idx[ii++] = t1;
    idx[ii++] = t1; idx[ii++] = s0; idx[ii++] = s1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Horizon mountain ring — per-map styled skylines with baked sun shading,
// altitude-banded rock detail texture, snow caps and aerial perspective.
// Lives in ./maps/horizon.js (imported above); do NOT reintroduce the old
// inline low-poly ring here — the map configs (cfg.horizon.style/snowline/
// banding/treeline) target the styled builder.
// ---------------------------------------------------------------------------

/**
 * Build the chunked-LOD terrain mesh group with the splat-blended PBR material.
 * The returned group exposes `group.userData.updateLOD(camPos)` for map.js.
 * @param {object} heightField HeightField from createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {?object} [cfg=null] map config (uses cfg.splat for the palette)
 * @returns {THREE.Group} terrain chunk group
 */
export function buildTerrainMeshes(heightField, engineCtx, cfg = null) {
  const group = new THREE.Group();
  group.name = 'terrain';
  group.add(buildHorizonRing(engineCtx, cfg, 1337));
  const mat = createSplatMaterial(engineCtx, heightField._layout, cfg ? cfg.splat : null, (cfg && cfg.id) || 'verdant');
  const chunks = [];
  for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) {
    const cx0 = -HALF + cx * CHUNK_SIZE, cz0 = -HALF + cz * CHUNK_SIZE;
    const lods = LOD_SEGS.map((segs) => buildChunkGeometry(heightField, cx0, cz0, segs));
    const mesh = new THREE.Mesh(lods[2], mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    chunks.push({ mesh, lods, level: 2, cx: cx0 + CHUNK_SIZE / 2, cz: cz0 + CHUNK_SIZE / 2 });
  }
  group.userData.updateLOD = (camPos) => {
    for (const c of chunks) {
      const d = Math.hypot(camPos.x - c.cx, camPos.z - c.cz);
      // 10% hysteresis on both thresholds to prevent LOD flicker
      const t0 = LOD_DIST[0] * (c.level === 0 ? 1.1 : 0.9);
      const t1 = LOD_DIST[1] * (c.level <= 1 ? 1.1 : 0.9);
      const want = d < t0 ? 0 : d < t1 ? 1 : 2;
      if (want !== c.level) {
        c.level = want;
        c.mesh.geometry = c.lods[want];
      }
    }
  };
  return group;
}
