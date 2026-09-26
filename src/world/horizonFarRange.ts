// src/world/horizonFarRange.ts — round 72 (2026-09-25): the far range, the peaks behind the ring.
//
// The ring's outer shoulder stands 1.24–1.38 km out; beyond it there was sky. A second annulus of ranges now stands
// 1.86–3.32 km out — inside the cloud domes (3.4 km) and the camera's far plane (4 km), so the clouds still pass
// behind the peaks and the peaks still pass behind the ring's crests — and reads through the ring's passes and over
// its lower ranges as the country's far skyline: broad massifs with ridged crests from the same character table as
// the ring's relief (horizonRelief.ts), coming and going around the horizon so some sectors open onto a distant
// plain. One unlit, vertex-shaded draw: albedo by altitude and slope, a Lambert sun and a sky term matching the
// vista program's, then its own aerial perspective toward the fog tint by row (the scene fog is off on it — at
// three kilometres the exponential fog would erase it — and the post aerial pass adds its ceiling on top). A map
// with a low cloud deck keeps its far peaks under the deck (a peak inside the deck would stand in front of the
// dome-drawn clouds). Desktop tier only; no per-frame work.
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { type SeaOpening, dominantSeaOpening, seaOpeningWeight } from './edgeWater.ts';
import type { HorizonFarRangeSettings, HorizonReliefCharacter } from './horizonRelief.ts';

export const HORIZON_FAR_SEGMENTS = 288;

/** The rows: radius, the share of the peak height the row's crest reaches, the aerial-perspective rank (0..1). */
export const HORIZON_FAR_ROWS: readonly { r: number; lift: number; aer: number }[] = Object.freeze([
  { r: 1860, lift: 0.00, aer: 0.00 },
  { r: 2150, lift: 0.34, aer: 0.18 },
  { r: 2480, lift: 0.74, aer: 0.42 },
  { r: 2820, lift: 1.00, aer: 0.70 },
  { r: 3150, lift: 0.62, aer: 0.92 },
  { r: 3320, lift: 0.12, aer: 1.00 },
]);

/** The far ring's foot: the plain the ranges rise from (m), a little under the ring's own outer shoulders. */
export const HORIZON_FAR_FOOT_M = 40;

interface HorizonFarRangeOptions {
  seed: number;
  settings: HorizonFarRangeSettings;
  character: HorizonReliefCharacter;
  /** The map's cloud base (m): the peaks stay under it. */
  deckBaseM: number;
  sun: readonly [number, number, number];
  base: THREE.Color;
  rock: THREE.Color;
  snow: THREE.Color;
  forest: THREE.Color;
  fog: THREE.Color;
  /** 0 for no forest tint, else the ring's treeline fraction. */
  treeline: number;
  seaOpenings: readonly SeaOpening[];
  /** The ring's own peak height (m): the far foot never rises above the ring's crests. */
  nearMaxHeight: number;
  /** The vista's ambient and sun gains for this map (maps/horizon.ts resolveHorizonLightingGains). */
  gains: { ambient: number; sunGain: number };
}

interface HorizonFarRangeGeometry {
  columns: number;
  rowCount: number;
  positions: Float32Array;
  heights: Float32Array;
  /** The effective peak height after the deck ceiling (m). */
  ampM: number;
  /** Per-vertex sea weight (0..1). */
  marine: Float32Array;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The effective peak height: the character's, capped under a low cloud deck (never under 120 m). */
export function resolveFarRangeAmp(settings: HorizonFarRangeSettings, deckBaseM: number): number {
  return Math.min(settings.ampM, Math.max(120, deckBaseM * 0.82));
}

/** Pure geometry (world xz, heights), for the mesh and the receipts. */
export function sampleHorizonFarRange(options: Pick<HorizonFarRangeOptions, 'seed' | 'settings' | 'deckBaseM' | 'seaOpenings'>): HorizonFarRangeGeometry {
  const { settings: s, seed } = options;
  const n = HORIZON_FAR_SEGMENTS, rows = HORIZON_FAR_ROWS;
  const noise = new SimplexNoise({ random: mulberry32(seed >>> 0) });
  const ampM = resolveFarRangeAmp(s, options.deckBaseM);
  const TAU = Math.PI * 2;
  // Round 72b (integrator: "rows of symmetric cones"): the far silhouette is built from three RANGES with oblique
  // axes, like the ring's (horizonRelief.ts) — an anisotropic ridged field stretched along each axis with one flank
  // compressed and phase-jittered sub-peaks, inside an azimuth window; isotropic ridged noise along a row is a row
  // of symmetric cones by construction
  const rangeRng = mulberry32((seed ^ 0x3F41) >>> 0);
  const farRanges = Array.from({ length: 3 }, (_, k) => {
    const slot = TAU / 3, theta = k * slot + (rangeRng() - 0.5) * slot * 0.5;
    const oblique = (rangeRng() < 0.5 ? -1 : 1) * (0.35 + rangeRng() * 0.5);
    return {
      theta, halfSpan: (Math.PI / 3) * (1.1 + rangeRng() * 0.4), phi: theta + Math.PI / 2 + oblique,
      cx: Math.cos(theta) * 2600, cz: Math.sin(theta) * 2600, height: 0.7 + rangeRng() * 0.6,
      steepSide: rangeRng() < 0.5 ? -1 : 1, steepness: 1.5 + rangeRng() * 0.6,
      // round 72b (crops: Alpine's far range was two smooth white domes, then — with short crests at full weight — a
      // row of cones the step clamp had cut to straight flanks): massifs 1.6–2.2 km along the axis (was 2.4–3.2 km,
      // six crests around the whole horizon) carrying two octaves of serration whose amplitude falls with their
      // wavelength (a 1/f^0.8 spectrum: 0.5 / 0.2 / 0.08), so the flanks stay under the clamp at 25–30°
      lambdaAlong: 1600 + rangeRng() * 600, lambdaAcross: 720 + rangeRng() * 240,
      o1: rangeRng() * 100, o2: rangeRng() * 100, o3: rangeRng() * 100, o4: rangeRng() * 100, jitterPhase: rangeRng() * 100,
    };
  });
  const rangeReliefAt = (x: number, z: number, a: number): number => {
    let sum = 0;
    for (const g of farRanges) {
      let d = a - g.theta; d -= Math.round(d / TAU) * TAU;
      const w = 1 - smoothstep(g.halfSpan * 0.5, g.halfSpan, Math.abs(d));
      if (w < 1e-3) continue;
      const cp = Math.cos(g.phi), sp = Math.sin(g.phi), dx = x - g.cx, dz = z - g.cz;
      const along = dx * cp + dz * sp;
      let across = -dx * sp + dz * cp;
      if (across * g.steepSide < 0) across *= g.steepness;
      const n1 = noise.noise(along / g.lambdaAlong + g.o1, across / g.lambdaAcross + g.o2);
      // the massif itself is rounded (a ridged cusp across a 700 m range at the character's sharpness was a cone
      // seen from the side); the character's sharpness belongs to the serrations on it
      const r1 = Math.pow(1 - Math.abs(n1), 0.75);
      const jitter = noise.noise(along / (g.lambdaAlong * 0.6) + g.jitterPhase, 3.3) * g.lambdaAlong * 0.15;
      // the serrations: one octave at a third of the massif (460–630 m: eight to ten of the 288 columns at the crest
      // row — a finer octave sampled at two to four columns aliased into one-column needles that the step clamp cut
      // into symmetric cones, the very look the integrator sent back), at the character's sharpness, halved
      const n2 = noise.noise((along + jitter) / (g.lambdaAlong / 3.5) + g.o3, across / (g.lambdaAcross / 2) + g.o4);
      const r2 = Math.pow(1 - Math.abs(n2), s.sharpness * 0.5 + 0.35) * clamp(r1 * 2, 0, 1);
      sum += w * g.height * (r1 * 0.5 + r2 * 0.24 + 0.25);
    }
    return sum;
  };
  // round 72b (crops: Alpine's far range was two smooth domes even with shorter crests): the ranged sum ran past 1
  // over most of a range and the clamp left only the smooth envelope. Normalise it over the annulus (RMS 0.5) and
  // compress the tops through a soft knee instead of a clamp, so the crests keep their pinnacles
  let rangeScale = 1;
  {
    const N = 96, R = 6; let sq = 0;
    for (let j = 0; j < R; j++) for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, rr = rows[0].r + (rows[rows.length - 1].r - rows[0].r) * (j + 0.5) / R;
      const v = rangeReliefAt(Math.cos(a) * rr, Math.sin(a) * rr, a); sq += v * v;
    }
    rangeScale = 0.5 / Math.max(1e-4, Math.sqrt(sq / (N * R)));
  }
  const knee = (v: number): number => (v < 0.8 ? v : 0.8 + 0.2 * Math.tanh((v - 0.8) / 0.2));
  const positions = new Float32Array(n * rows.length * 3);
  const heights = new Float32Array(n * rows.length);
  const marine = new Float32Array(n * rows.length);
  for (let row = 0; row < rows.length; row++) {
    const { r: rowR, lift } = rows[row];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      // the ranges come and go around the horizon: a slow envelope between the floor and the full height
      const env = s.floor + (1 - s.floor) * smoothstep(0.12, 0.88, noise.noise(ca * 1.7 + 11.3, sa * 1.7 - 4.1) * 0.5 + 0.5);
      // a rigid radius meander per row so the crest lines bend in plan
      const radius = rowR * (1 + 0.035 * noise.noise(ca * 3.1 + row * 7.3, sa * 3.1 - row * 2.9));
      const x = ca * radius, z = sa * radius;
      // ridged crests along the row, warped by a broad world field so the massifs are two-dimensional
      const wx = x + noise.noise(x * 0.0009 + 3.7, z * 0.0009 - 8.1) * 260;
      const wz = z + noise.noise(x * 0.0009 - 5.9, z * 0.0009 + 2.3) * 260;
      // the ranged silhouette (above) over a weak isotropic base that keeps the gaps from going flat
      const ridged = (v: number): number => Math.pow(1 - Math.abs(v), s.sharpness);
      const base = ridged(noise.noise(wx * 0.0017 + 41, wz * 0.0017 - 17)) * 0.6 + ridged(noise.noise(wx * 0.0041 - 23, wz * 0.0041 + 31)) * 0.4;
      let relief = rangeReliefAt(x, z, a) * rangeScale + base * 0.2;
      relief = knee(Math.max(0, relief));
      // the crest row carries the peaks; the rows before it rise toward them, the rows behind fall away
      let h = HORIZON_FAR_FOOT_M + ampM * env * (0.18 + 0.82 * relief) * lift;
      // sea sectors: the far ring is open water there (a little under the level, the apron carries the surface)
      const opening = dominantSeaOpening(a, options.seaOpenings);
      const sea = opening ? seaOpeningWeight(a, opening) : 0;
      if (sea > 0) h += ((opening?.level ?? 0) - 1 - h) * sea;
      const i = row * n + k;
      positions[i * 3] = x; positions[i * 3 + 1] = h; positions[i * 3 + 2] = z;
      heights[i] = h;
      marine[i] = sea;
    }
  }
  // a step clamp along each row (the same law as the alpine ring): no one-column needles at three kilometres — a
  // column-to-column step of at most 0.9 of the row's arc, a 42° flank
  for (let row = 1; row < rows.length; row++) {
    const off = row * n;
    // no smoothing pass (round 72b: three rounded every crest into a dome); the step clamp below keeps the needles out
    const maxStep = rows[row].r * TAU / n * 0.9;
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k < n; k++) {
        const km = (k - 1 + n) % n;
        heights[off + k] = clamp(heights[off + k], heights[off + km] - maxStep, heights[off + km] + maxStep);
      }
      for (let k = n - 1; k >= 0; k--) {
        const kp = (k + 1) % n;
        heights[off + k] = clamp(heights[off + k], heights[off + kp] - maxStep, heights[off + kp] + maxStep);
      }
    }
    for (let k = 0; k < n; k++) positions[(off + k) * 3 + 1] = heights[off + k];
  }
  return { columns: n, rowCount: rows.length, positions, heights, ampM, marine };
}

const _c = new THREE.Color();

/**
 * The mesh: one indexed annulus (a seam column closes it), vertex colours baked (albedo, sun, sky, haze), an unlit
 * material with the scene fog off and a two-scale world mottle in the fragment. Returns null when the range would be
 * entirely under the ring's crests (a deck ceiling below the ring's own peaks).
 */
export function buildHorizonFarRange(options: HorizonFarRangeOptions & { detailTexture?: THREE.Texture | null }): THREE.Mesh | null {
  const geometry = sampleHorizonFarRange(options);
  const { columns: n, rowCount, positions, heights, ampM, marine } = geometry;
  if (ampM + HORIZON_FAR_FOOT_M < options.nearMaxHeight * 0.55) return null;
  const s = options.settings;
  const [lx, ly, lz] = options.sun;
  const colors = new Float32Array(n * rowCount * 3);
  const fog = options.fog;
  const forestOn = options.treeline > 0;
  const shadeTint = new THREE.Color(0.90, 0.94, 1.08), seaColor = fog.clone().multiplyScalar(0.9), scratch = new THREE.Color();
  for (let row = 0; row < rowCount; row++) {
    const { aer } = HORIZON_FAR_ROWS[row];
    for (let k = 0; k < n; k++) {
      const i = row * n + k;
      const km = row * n + (k - 1 + n) % n, kp = row * n + (k + 1) % n;
      const jm = Math.max(0, row - 1) * n + k, jp = Math.min(rowCount - 1, row + 1) * n + k;
      // the height-field normal from central differences (along the row and across it)
      const tx = positions[kp * 3] - positions[km * 3], ty = heights[kp] - heights[km], tz = positions[kp * 3 + 2] - positions[km * 3 + 2];
      const rx = positions[jp * 3] - positions[jm * 3], ry = heights[jp] - heights[jm], rz = positions[jp * 3 + 2] - positions[jm * 3 + 2];
      let nx = ty * rz - tz * ry, ny = tz * rx - tx * rz, nz = tx * ry - ty * rx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const hT = clamp((heights[i] - HORIZON_FAR_FOOT_M) / Math.max(1, ampM), 0, 1);
      const slope = 1 - ny;
      // albedo: the base tone low, forest below the treeline where the map has one, rock on the steep faces and the
      // crests, snow above the snowline on the gentler faces
      _c.copy(options.base).multiplyScalar(0.86 + hT * 0.28);
      if (forestOn) _c.lerp(options.forest, (1 - smoothstep(options.treeline * 0.7, options.treeline * 1.05, hT)) * 0.7);
      const rockW = Math.max(smoothstep(0.22, 0.55, slope), smoothstep(0.55, 0.9, hT) * 0.6);
      _c.lerp(options.rock, rockW);
      if (s.snowline <= 1) {
        const snowW = smoothstep(s.snowline - 0.05, s.snowline + 0.14, hT) * (1 - smoothstep(0.40, 0.75, slope));
        _c.lerp(options.snow, snowW);
      }
      // the vista program's own lighting law: a hemispherical sky term and a Lambert sun (SUN / pi)
      const ndl = nx * lx + ny * ly + nz * lz;
      const sky = 0.55 + 0.45 * ny;
      const shade = options.gains.ambient * sky + options.gains.sunGain * Math.max(ndl, 0);
      // round 72b (crops: the far faces were one flat white): a cavity term from the crest's own profile — a vertex
      // above its neighbours three columns either side is a rib (lit), one below them a couloir (shaded), ±14 %
      let near = 0;
      for (let d = -3; d <= 3; d++) if (d !== 0) near += heights[row * n + (k + d + n) % n];
      const rib = clamp((heights[i] - near / 6) / Math.max(1, ampM * 0.08), -1, 1);
      _c.multiplyScalar(shade * (1 + rib * 0.14));
      if (ndl < 0) _c.lerp(scratch.copy(_c).multiply(shadeTint), Math.min(1, -ndl) * 0.35);
      // the sea sectors are the low sky, like the ring's far apron
      if (marine[i] > 0) _c.lerp(seaColor, marine[i]);
      // aerial perspective by row toward the fog tint (the scene fog is off on this material)
      const haze = s.hazeIn + (s.hazeOut - s.hazeIn) * aer;
      _c.lerp(fog, haze + (1 - hT) * 0.04);
      colors[i * 3] = _c.r; colors[i * 3 + 1] = _c.g; colors[i * 3 + 2] = _c.b;
    }
  }
  // close the seam: a copy of column 0 at the end of every row
  const stride = n + 1;
  const closedPos = new Float32Array(stride * rowCount * 3), closedCol = new Float32Array(stride * rowCount * 3);
  for (let row = 0; row < rowCount; row++) {
    closedPos.set(positions.subarray(row * n * 3, (row + 1) * n * 3), row * stride * 3);
    closedPos.set(positions.subarray(row * n * 3, row * n * 3 + 3), (row * stride + n) * 3);
    closedCol.set(colors.subarray(row * n * 3, (row + 1) * n * 3), row * stride * 3);
    closedCol.set(colors.subarray(row * n * 3, row * n * 3 + 3), (row * stride + n) * 3);
  }
  const indices: number[] = [];
  for (let row = 0; row < rowCount - 1; row++) {
    for (let k = 0; k < n; k++) {
      const inner = row * stride + k, outer = inner + stride;
      indices.push(inner, outer, inner + 1, inner + 1, outer, outer + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(closedPos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(closedCol, 3));
  geo.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const detail = options.detailTexture ?? null;
  if (detail) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFDetail = { value: detail };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFPos = position;');
      shader.fragmentShader = 'uniform sampler2D uFDetail;\nvarying vec3 vFPos;\n' + shader.fragmentShader
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          // round 72: two world-anchored fields (about 110 m and 30 m) break the far faces into masses and grain
          float fA = texture2D(uFDetail, vFPos.xz * 0.0036 + vec2(0.17, 0.61)).r - 0.5;
          float fB = texture2D(uFDetail, vec2(vFPos.x + vFPos.z * 0.6, vFPos.y * 1.7) * 0.013 + vec2(0.43, 0.09)).r - 0.5;
          diffuseColor.rgb *= 1.0 + fA * 0.16 + fB * 0.10;
        }`);
    };
    material.customProgramCacheKey = () => 'horizon-far-range-r72';
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'horizon-far-range';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.userData.aoExclude = true;
  mesh.userData.horizonFarRange = { columns: n, rows: rowCount, ampM, character: options.character, vertices: stride * rowCount };
  return mesh;
}
