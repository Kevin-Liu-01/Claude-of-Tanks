// src/world/terrain.js — 1 km simplex heightfield + chunked LOD meshes + splat-blended
// procedural PBR ground material. Pure part (createHeightField) is node-runnable.
// Contract: docs/ARCHITECTURE.md §2.7, §3.2; visuals per docs/research/graphics-aaa.md §6–7.

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

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
// Map layout — seed-independent composition constants (roads, village, spawns,
// marshes, drivable corridors). Shared by the other world modules.
// ---------------------------------------------------------------------------

function buildRoadNodes() {
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

const _VILLAGE = { x0: -60, x1: 80, z0: -40, z1: 120, cx: 10, cz: 40, feather: 42 };
const _MARSHES = [
  { x: 220, z: -140, r: 38 },
  { x: -190, z: -210, r: 48 },
  { x: -330, z: 330, r: 30 },
];
const _SPAWN_PLAYER = { x: 14, z: -78 };
const _SPAWN_ENEMIES = [
  { x: -30, z: 320 }, { x: 140, z: 350 }, { x: 265, z: 235 }, { x: -215, z: 270 },
  { x: -330, z: 140 }, { x: 330, z: 130 }, { x: 15, z: 430 },
];
for (const s of [_SPAWN_PLAYER, ..._SPAWN_ENEMIES]) {
  s.yaw = Math.atan2(_VILLAGE.cx - s.x, _VILLAGE.cz - s.z); // face the village
}

/** Internal shared layout (roads/village/marsh/spawn geometry). @type {object} */
export const _LAYOUT = {
  village: _VILLAGE,
  marshes: _MARSHES,
  spawns: { player: _SPAWN_PLAYER, enemies: _SPAWN_ENEMIES },
  roads: buildRoadNodes(), // [ [ [x,z], ... ], [ [x,z], ... ] ]
};

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
 * @returns {{getHeightAt:function(number,number):number,
 *   getNormalAt:function(number,number):THREE.Vector3,
 *   getGroundType:function(number,number):('hard'|'medium'|'soft'),
 *   size:number, minY:number, maxY:number}} HeightField (ARCHITECTURE §2.7)
 */
export function createHeightField(seed = 1337) {
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

  const roads = _LAYOUT.roads;
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
    return (1 - smoothstep(0, _VILLAGE.feather, Math.hypot(dx, dz))) * 0.85;
  }

  const padYs = new Float64Array(8); // filled below (player + 7 enemies)
  const padPts = [_SPAWN_PLAYER, ..._SPAWN_ENEMIES];

  function heightAt(x, z, padsOn, roadsOn) {
    x = clamp(x, -HALF, HALF); z = clamp(z, -HALF, HALF);
    const { d, s } = core(x, z);
    const cw = gridSample(gCorridor, x, z);
    let h = d + (s - d) * (cw * 0.72);
    const vm = villageMask(x, z);
    if (vm > 0) h += (villageY + (s - villageY) * 0.10 - h) * vm;
    for (const m of _MARSHES) {
      const md = Math.hypot(x - m.x, z - m.z);
      if (md < m.r) { const t = 1 - md / m.r; h -= 2.6 * t * t * (3 - 2 * t); }
    }
    const rim = smoothstep(430, HALF, Math.max(Math.abs(x), Math.abs(z)));
    h += rim * rim * 17;
    if (padsOn) {
      for (let p = 0; p < padPts.length; p++) {
        const pd = Math.hypot(x - padPts[p].x, z - padPts[p].z);
        if (pd < 22) h += (padYs[p] - h) * (1 - smoothstep(9, 22, pd));
      }
    }
    if (roadsOn) {
      const rd = gridSample(gRoadDist, x, z);
      if (rd < 10.5) h += (gridSample(gRoadElev, x, z) - h) * (1 - smoothstep(4.6, 10.5, rd));
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
  { // blend both roads to a common elevation at their crossing
    let jA = 0, jB = 0, best = 1e9;
    for (let a = 0; a < roads[0].length; a++) for (let b = 0; b < roads[1].length; b++) {
      const dd = Math.hypot(roads[0][a][0] - roads[1][b][0], roads[0][a][1] - roads[1][b][1]);
      if (dd < best) { best = dd; jA = a; jB = b; }
    }
    const jElev = (nodeElev[0][jA] + nodeElev[1][jB]) * 0.5;
    for (let k = -3; k <= 3; k++) {
      const w = (1 - Math.abs(k) / 4) * 0.85;
      if (nodeElev[0][jA + k] !== undefined) nodeElev[0][jA + k] += (jElev - nodeElev[0][jA + k]) * w;
      if (nodeElev[1][jB + k] !== undefined) nodeElev[1][jB + k] += (jElev - nodeElev[1][jB + k]) * w;
    }
  }
  for (let i = 0; i < GN * GN; i++) {
    const e = nodeElev[gSegRoad[i]];
    const s = gSegIdx[i];
    gRoadElev[i] = e[s] + (e[s + 1] - e[s]) * gSegT[i];
  }

  // --- spawn pad target heights (pipeline without pads) ---
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
    for (const m of _MARSHES) {
      const md = Math.hypot(x - m.x, z - m.z);
      if (md < m.r && 1 - md / m.r > 0.35) return 'soft';
    }
    return 'medium';
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
    _layout: _LAYOUT,
  };
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

const _col = new THREE.Color();

function makeGroundLayer(seed, kind, anisotropy) {
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
      if (kind === 'grass') {
        const macro = torusNoise(noi, u, v, 3, 3, 11) * 0.65 + torusNoise(noi, u, v, 7, 7, 23) * 0.35;
        const streak = torusNoise(noi, u, v, 9, 34, 5); // anisotropic blade streaks
        const m01 = macro * 0.5 + 0.5, s01 = streak * 0.5 + 0.5;
        hn = m01 * 0.5 + s01 * 0.5;
        const dry = smoothstep(0.62, 0.88, s01);
        _col.setHSL(0.235 + macro * 0.02 - dry * 0.055, 0.34 - dry * 0.12, 0.245 + hn * 0.10);
        rough = 0.88 - s01 * 0.10;
        nStrength = 1.6;
      } else if (kind === 'dirt') {
        const clods = torusNoise(noi, u, v, 4, 4, 7) * 0.7 + torusNoise(noi, u, v, 9, 9, 31) * 0.3;
        const grain = torusNoise(noi, u, v, 52, 52, 3);
        const c01 = clods * 0.5 + 0.5, g01 = grain * 0.5 + 0.5;
        hn = c01 * 0.62 + g01 * 0.38;
        _col.setHSL(0.075 + clods * 0.012, 0.31 - g01 * 0.06, 0.205 + hn * 0.09);
        rough = 0.96 - g01 * 0.05;
        nStrength = 2.2;
      } else if (kind === 'rock') {
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
        rough = 0.62 - puddle * 0.34;
        nStrength = 1.5;
      }
      hn = clamp(hn, 0, 1);
      hgt[i] = hn;
      const cav = 0.72 + 0.28 * hn; // cavity darkening baked into albedo
      px[j] = _col.r * cav * 255; px[j + 1] = _col.g * cav * 255; px[j + 2] = _col.b * cav * 255;
      px[j + 3] = clamp(rough, 0.03, 1) * 255; // roughness packed in albedo alpha
    }
  }
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, nStrength, anisotropy),
  };
}

// R = road core, G = wheel ruts, B = marsh wetness, A = village worn ground
function makeMaskTexture(seedNoi) {
  const s = 1024;
  const dist = new Float32Array(s * s).fill(1e9);
  for (const nodes of _LAYOUT.roads) {
    for (let sg = 0; sg < nodes.length - 1; sg++) {
      const [ax, az] = nodes[sg], [bx, bz] = nodes[sg + 1];
      const x0 = clamp(Math.floor(Math.min(ax, bx) - 14 + HALF), 0, s - 1);
      const x1 = clamp(Math.ceil(Math.max(ax, bx) + 14 + HALF), 0, s - 1);
      const z0 = clamp(Math.floor(Math.min(az, bz) - 14 + HALF), 0, s - 1);
      const z1 = clamp(Math.ceil(Math.max(az, bz) + 14 + HALF), 0, s - 1);
      for (let tz = z0; tz <= z1; tz++) for (let tx = x0; tx <= x1; tx++) {
        const { d } = segDist(tx - HALF, tz - HALF, ax, az, bx, bz);
        const i = tz * s + tx;
        if (d < dist[i]) dist[i] = d;
      }
    }
  }
  const px = new Uint8ClampedArray(s * s * 4);
  for (let tz = 0; tz < s; tz++) {
    const z = tz - HALF;
    for (let tx = 0; tx < s; tx++) {
      const x = tx - HALF, i = tz * s + tx, j = i * 4;
      const d = dist[i];
      if (d < 13) {
        const wob = seedNoi.noise(x * 0.055, z * 0.055) * 1.1;
        px[j] = (1 - smoothstep(3.4 + wob, 5.8 + wob, d)) * 255;
        const rut = Math.exp(-Math.pow((d - 1.55) / 0.55, 2));
        px[j + 1] = rut * (px[j] / 255) * 215;
      }
      let marsh = 0;
      for (const m of _MARSHES) {
        const md = Math.hypot(x - m.x, z - m.z);
        if (md < m.r + 24) {
          const re = m.r * (1 + 0.18 * seedNoi.noise(x * 0.02 + 7, z * 0.02 - 3));
          marsh = Math.max(marsh, 1 - smoothstep(re * 0.45, re, md));
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
vec3 gSplatAlbedo; float gSplatRough; vec3 gSplatNrm;
vec4 splatSamp(sampler2D t, vec2 uv, float df) {
  return mix(texture2D(t, uv), texture2D(t, uv * 0.2317 + vec2(0.5)), df);
}
void splatCompute() {
  vec3 wp = vWPos;
  vec3 wn = normalize(vWNormal);
  vec4 mk = texture2D(uMask, (wp.xz + 512.0) * (1.0 / 1024.0));
  float df = smoothstep(22.0, 105.0, distance(wp, cameraPosition));
  vec2 uv = wp.xz;
  float n1 = texture2D(uNoise, uv * 0.0117).r;
  float n2 = texture2D(uNoise, uv * 0.0031 + vec2(0.41, 0.13)).g;
  float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
  float fD = clamp(max(smoothstep(0.58, 0.87, n2) * 0.85, max(mk.r, mk.a * (0.35 + 0.65 * n1))), 0.0, 1.0);
  float fM = mk.b;
  float fR = smoothstep(0.095, 0.235, slope + (n1 - 0.5) * 0.07);
  vec4 a = splatSamp(uAlbG, uv * 0.240, df);
  vec4 n = splatSamp(uNrmG, uv * 0.240, df);
  a = mix(a, splatSamp(uAlbD, uv * 0.210, df), fD); n = mix(n, splatSamp(uNrmD, uv * 0.210, df), fD);
  a = mix(a, splatSamp(uAlbM, uv * 0.190, df), fM); n = mix(n, splatSamp(uNrmM, uv * 0.190, df), fM);
  a = mix(a, splatSamp(uAlbR, uv * 0.155, df), fR); n = mix(n, splatSamp(uNrmR, uv * 0.155, df), fR);
  a.rgb = mix(a.rgb, a.rgb * vec3(1.55, 1.40, 1.05) + vec3(0.055, 0.045, 0.028), mk.r * 0.9);
  a.rgb *= 1.0 - mk.g * 0.30;
  a.rgb *= 0.90 + n2 * 0.20;
  gSplatAlbedo = a.rgb;
  gSplatRough = clamp(a.a * (1.0 - mk.r * 0.12), 0.05, 1.0);
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

function createSplatMaterial(engineCtx) {
  const aniso = engineCtx.anisotropy ?? 4;
  const layers = {
    G: makeGroundLayer(3000, 'grass', aniso),
    D: makeGroundLayer(3001, 'dirt', aniso),
    R: makeGroundLayer(3002, 'rock', aniso),
    M: makeGroundLayer(3003, 'mud', aniso),
  };
  const maskNoi = new SimplexNoise({ random: mulberry32(3010) });
  const mask = makeMaskTexture(maskNoi);
  const noiseTex = makeShaderNoiseTexture(3011);

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
  mat.customProgramCacheKey = () => 'world-terrain-splat-v1';
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

/**
 * Build the chunked-LOD terrain mesh group with the splat-blended PBR material.
 * The returned group exposes `group.userData.updateLOD(camPos)` for map.js.
 * @param {object} heightField HeightField from createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @returns {THREE.Group} terrain chunk group
 */
export function buildTerrainMeshes(heightField, engineCtx) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const mat = createSplatMaterial(engineCtx);
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
