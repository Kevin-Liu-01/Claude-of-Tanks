// src/world/maps/horizon.js — per-map horizon mountain ring.
//
// Replaces the old shared low-poly backdrop (one silhouette recolored per
// biome) with map-authored skylines: each map gets its own ridge GEOMETRY
// (seed mixed with the map id + a style-specific profile shaper) and its own
// slope/altitude MATERIAL response baked into vertex colors — snow caps and
// exposed rock for the winter alpine wall, stratified sandstone tablelands
// for the desert, soft forested rolling hills for grassland, long hazy
// escarpments behind the town. A high-frequency albedo grain and a stronger
// aerial-perspective gradient stop the faces from reading as flat unlit
// low-poly sheets, and the tuck rows hug the map rim closely enough that no
// fog-washed floor strip or sky sliver ever shows between rim and mountains.
//
// Consumed by src/world/terrain.js: buildHorizonRing(engineCtx, cfg, seed).
// Config surface (all optional, per map): cfg.horizon = {
//   baseHex, amp,                    — legacy tint + height scale
//   style,                           — 'rolling'|'alpine'|'mesa'|'escarpment'
//   snowline,                        — 0..1 fraction of peak height where snow starts (alpine)
//   treeline,                        — 0..1 fraction below which forest tint is applied
//   treelineLayers,                  — 1..3 skyline impostor depth ranks (default 1)
//   banding,                         — sandstone strata amplitude on steep faces (mesa)
//   rockHex, snowHex, forestHex,     — detail palette overrides
//   haze,                            — aerial-perspective multiplier (default 1)
//   grain,                           — per-vertex albedo grain amplitude (default 1)
// }

import * as THREE from 'three';
import { SimplexNoise } from '../../engine/simplexFast.js';
// MOBILE r1: central tier texture scale (desktop returns sizes unchanged)
import { texSize } from '../../engine/quality.ts';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
// tiny string hash so every map id lands on its own silhouette seed even
// when the config omits horizon.seed
function idHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const HORIZON_TREELINE_ATLAS_VARIANTS = 4;
export const HORIZON_TREELINE_MAX_LAYERS = 3;

export function resolveHorizonTreelineLayers(horizon = null) {
  const requested = Number.isFinite(horizon?.treelineLayers)
    ? Math.round(horizon.treelineLayers) : 1;
  return clamp(requested, 1, HORIZON_TREELINE_MAX_LAYERS);
}

/**
 * Periodic, low-frequency crown line used by the distant forest impostor.
 * The returned values are fractions of one atlas band, measured up from its
 * base. Keeping this pure lets the Node quality gate reject isolated needles
 * without needing a DOM/canvas implementation.
 */
export function sampleTreelineCrownProfile({
  seed = 0x5EED, variant = 0, samples = 192,
} = {}) {
  const count = Math.max(24, samples | 0);
  const rng = mulberry32((seed ^ Math.imul((variant | 0) + 1, 0x9E3779B1)) >>> 0);
  const phase0 = rng() * Math.PI * 2;
  const phase1 = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  const f0 = 2 + ((variant + (rng() * 2 | 0)) % 3);
  const f1 = 5 + ((variant * 2 + (rng() * 3 | 0)) % 4);
  const f2 = 9 + ((variant * 3 + (rng() * 4 | 0)) % 5);
  const heights = new Float32Array(count);
  const scratch = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    heights[i] = clamp(0.61
      + Math.sin(a * f0 + phase0) * 0.095
      + Math.sin(a * f1 + phase1) * 0.050
      + Math.sin(a * f2 + phase2) * 0.022, 0.44, 0.77);
  }
  // A compact circular blur keeps crown groups readable while guaranteeing
  // that no one-texel spike survives x8 scope magnification.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < count; i++) {
      scratch[i] = heights[(i - 1 + count) % count] * 0.2
        + heights[i] * 0.6 + heights[(i + 1) % count] * 0.2;
    }
    heights.set(scratch);
  }
  return heights;
}

const STYLE_BY_MAP = {
  verdant: 'rolling', desert: 'mesa', winter: 'alpine', urban: 'escarpment',
};

// ---------------------------------------------------------------------------
// Ridge profile shapers — a: angle around the ring, noi: per-map noise,
// row: {f0, f1, base, amp} row tuning. Return meters (pre cfg.amp scale).
// Each style owns its silhouette language; the same style on two maps still
// differs because the noise instance is seeded from the map id.
// ---------------------------------------------------------------------------
const PROFILES = {
  // soft overlapping billows — wide wavelengths, no sharp peaks
  rolling(a, noi, row) {
    const n1 = noi.noise(Math.cos(a) * row.f0 + 11, Math.sin(a) * row.f0 - 7) * 0.5 + 0.5;
    const n2 = noi.noise(Math.cos(a) * row.f1 - 3, Math.sin(a) * row.f1 + 9) * 0.5 + 0.5;
    const billow = Math.pow(n1, 1.4);
    return row.base + (billow * 0.75 + n2 * 0.25) * row.amp;
  },
  // Broad glacial massifs. Earlier versions stacked absolute-value ridge
  // noise at four frequencies. That looked detailed in the height array but
  // projected as repeated triangular needles around the skyline. A pair of
  // low-frequency massif fields now owns the silhouette; finer noise only
  // moves shoulders and never creates an independent summit.
  alpine(a, noi, row) {
    const warp = noi.noise(Math.cos(a) * 1.15 + 55, Math.sin(a) * 1.15 - 41) * 0.13;
    const aw = a + warp;
    const broad = noi.noise(Math.cos(aw) * row.f0 * 0.52 + 21,
      Math.sin(aw) * row.f0 * 0.52 - 14) * 0.5 + 0.5;
    const shoulder = noi.noise(Math.cos(aw) * row.f0 * 1.18 - 37,
      Math.sin(aw) * row.f0 * 1.18 + 28) * 0.5 + 0.5;
    const spur = noi.noise(Math.cos(a) * row.f0 * 2.65 + 83,
      Math.sin(a) * row.f0 * 2.65 - 61) * 0.5 + 0.5;
    const envelope = 0.58 + smoothstep(0.18, 0.86,
      noi.noise(Math.cos(a) * 0.58 + 3.1, Math.sin(a) * 0.58 - 8.7) * 0.5 + 0.5) * 0.50;
    const massif = smoothstep(0.12, 0.92, broad) * 0.68
      + smoothstep(0.18, 0.88, shoulder) * 0.24
      + (spur - 0.5) * 0.08;
    return row.base + clamp(massif, 0.12, 1.0) * envelope * row.amp;
  },
  // stepped tablelands: noise pushed through plateau terraces -> long flat
  // caps with cliff edges, plus lone buttes between the tables
  mesa(a, noi, row) {
    const n0 = noi.noise(Math.cos(a) * row.f0 + 41, Math.sin(a) * row.f0 - 27) * 0.5 + 0.5;
    const n2 = noi.noise(Math.cos(a) * row.f1 * 2.3 - 13, Math.sin(a) * row.f1 * 2.3 + 33) * 0.5 + 0.5;
    // r7 terrain_environment: EDGE CRENELLATION — two finer octaves wobble
    // the terrace-threshold field so cap rims read embayed/eroded promontory
    // lines instead of vector-clean prism edges (critique: "flat-faced
    // prisms"). Small amplitude: the wobble bends the PLAN of the cliff
    // line without breaking the flat-cap read.
    const cren = noi.noise(Math.cos(a) * row.f0 * 4.6 - 71, Math.sin(a) * row.f0 * 4.6 + 15) * 0.042
      + noi.noise(Math.cos(a) * row.f0 * 9.7 + 133, Math.sin(a) * row.f0 * 9.7 - 55) * 0.018;
    const n = n0 + cren;
    // two terrace levels with tight smoothstep walls => visible flat tops,
    // over a broad pedestal so inter-table stretches never sag to bare base
    // (bare-base gaps exposed the fog-washed backslope behind as a white
    // 'lake' sheet)
    const table1 = smoothstep(0.36, 0.45, n);
    const table2 = smoothstep(0.62, 0.70, n);
    const butte = smoothstep(0.80, 0.86, n2) * (1 - table2);
    const pedestal = smoothstep(0.14, 0.52, n) * 0.17;
    // r7: second cap-relief octave — tops undulate a few meters instead of
    // extruding one dead-flat lid per table
    const capWobble = 1 + 0.05 * noi.noise(Math.cos(a) * 9 + 3, Math.sin(a) * 9 - 8)
      + 0.028 * noi.noise(Math.cos(a) * 23 - 17, Math.sin(a) * 23 + 41);
    return row.base + (pedestal + table1 * 0.45 + table2 * 0.34 + butte * 0.30) * row.amp * capWobble;
  },
  // one long low escarpment line with a couple of gentle high points —
  // reads as far uplands behind a town, distinctly lower than 'rolling'
  escarpment(a, noi, row) {
    const n1 = noi.noise(Math.cos(a) * row.f0 * 0.7 + 61, Math.sin(a) * row.f0 * 0.7 - 47) * 0.5 + 0.5;
    const n2 = noi.noise(Math.cos(a) * row.f1 - 9, Math.sin(a) * row.f1 + 19) * 0.5 + 0.5;
    const bench = smoothstep(0.30, 0.62, n1); // long connected bench
    return row.base + (bench * 0.62 + Math.pow(n2, 2.2) * 0.38) * row.amp * 0.72;
  },
};

function softenAlpineRing(heights, offset, count, row, amp) {
  const scratch = new Float32Array(count);
  for (let pass = 0; pass < 8; pass++) {
    for (let k = 0; k < count; k++) {
      const km = (k - 1 + count) % count, kp = (k + 1) % count;
      scratch[k] = heights[offset + km] * 0.24
        + heights[offset + k] * 0.52 + heights[offset + kp] * 0.24;
    }
    for (let k = 0; k < count; k++) heights[offset + k] = scratch[k];
  }
  const maxStep = 1.35 + row.amp * amp * 0.035;
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k < count; k++) {
      const km = (k - 1 + count) % count;
      heights[offset + k] = clamp(heights[offset + k],
        heights[offset + km] - maxStep, heights[offset + km] + maxStep);
    }
    for (let k = count - 1; k >= 0; k--) {
      const kp = (k + 1) % count;
      heights[offset + k] = clamp(heights[offset + k],
        heights[offset + kp] - maxStep, heights[offset + kp] + maxStep);
    }
  }
}

/** Node-runnable skyline sampler used by the visual-quality regression. */
export function sampleHorizonSilhouette({
  style = 'alpine', mapId = 'winter', seed = 1337,
  row = { base: 50, amp: 76, f0: 2.6, f1: 5.2 }, amp = 1, count = 520,
} = {}) {
  const profile = PROFILES[style] || PROFILES.rolling;
  const noi = new SimplexNoise({ random: mulberry32(((seed ^ 0x7A11) ^ idHash(mapId)) >>> 0) });
  const heights = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2;
    heights[k] = profile(a, noi, row) * amp;
  }
  if (style === 'alpine') softenAlpineRing(heights, 0, count, row, amp);
  return heights;
}

// ---------------------------------------------------------------------------
// Rock-detail texture — U wraps around the ring (10 repeats), V = absolute
// altitude (0..1 of the tallest peak, matching the vertex UVs). Carries the
// HIGH-FREQUENCY material response vertex colors cannot: granular grain, dark
// drainage gullies elongated downslope, scree fans, sedimentary strata
// banding (mesa), forest mottle below the treeline, and a flatten-to-white
// above the snow line so striations never cut through the caps. Luminance-
// centred on 0.62 (recentred by the material color) — hue stays in the
// vertex colors, so one texture serves rock, forest, sand and snow zones.
// ---------------------------------------------------------------------------
function makeHorizonTexture(noi, { banding, snowline, treeline, grainAmp, gullyAmp = 1, coolRock = false }) {
  // Loading-speed r1: this texture is repeated around a backdrop hundreds of
  // metres away. 1536x512 oversampled the projected ridge by ~4x and spent
  // ~0.6 s in deterministic simplex work per map; 512x192 retains more than
  // a screen pixel per visible texel even at the establishing camera.
  const su = texSize(512), sv = texSize(192);
  const c = document.createElement('canvas');
  c.width = su; c.height = sv;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(su, sv);
  const d = img.data;
  const TAU = Math.PI * 2;
  // u-wrapping noise: angular loop on a circle, altitude along the 3rd axis
  const wn = (u, v, fu, fv, off) => noi.noise3d(
    Math.cos(u * TAU) * fu * 0.5 + off,
    Math.sin(u * TAU) * fu * 0.5 - off * 0.7,
    v * fv + off * 1.31,
  );
  // NOTE on fu/fv balance: one u repeat covers ~370 m of ridge arc while the
  // full v range covers ~200 m of altitude — fv must run ~3x fu-per-meter or
  // every feature bakes in vertically stretched and the walls read as hanging
  // curtain striping (the r3 'green felt curtain' artifact on the verdant
  // hills). Keep fv ≈ 3 * fu * (feature aspect) when tuning.
  for (let y = 0; y < sv; y++) {
    const v = 1 - y / (sv - 1); // canvas row 0 = top of texture (flipY) = v 1
    for (let x = 0; x < su; x++) {
      const u = x / su;
      let L = 1.0;
      // r6: forest weight computed EARLY — the granular rock grain must not
      // print onto canopy: under tangential-grazing anisotropic minification
      // its isotropic speckle smears into diagonal brush strokes (the
      // residual felt read on the ring side walls)
      const belowTree = treeline > 0 ? 1 - smoothstep(treeline * 0.85, treeline * 1.08, v) : 0;
      // granular grain, two octaves. r6c: fully OFF on vegetated styles —
      // canopy below the treeline and grass meadow above it are both smooth
      // at ring distance, and any fine texel noise combs into down-slope
      // fiber wherever the wall is viewed along-tangent (u degenerate)
      const fineOk = treeline > 0 ? 0 : 1;
      L += (wn(u, v, 90, 100, 17) * 0.05 + wn(u, v, 34, 38, 5) * 0.06) * grainAmp * fineOk;
      // drainage gullies: dark chutes down the faces with lighter scree fans.
      // SEGMENTED, not wall-height: a second altitude-frequency mask breaks
      // every chute into offset runs, because continuous top-to-bottom
      // streaks magnified on the far walls read as vertical paint smear
      // (the r-critique's "vertical texture smearing" on the desert ring)
      const faceVar = smoothstep(0.25, 0.75, wn(u, v * 0.25, 9, 1.1, 77) * 0.5 + 0.5);
      const g = 1 - Math.abs(wn(u, v, 46, 2.6, 9));
      const seg = 0.45 + 0.55 * smoothstep(0.3, 0.72, wn(u, v, 31, 9.5, 118) * 0.5 + 0.5);
      const gully = smoothstep(0.86, 0.985, g) * gullyAmp * (0.35 + 0.65 * faceVar) * seg;
      const scree = smoothstep(0.72, 0.92, g) * (1 - gully) * gullyAmp * faceVar * seg;
      L *= 1 - gully * 0.13 + scree * 0.04;
      // isotropic talus/boulder speckle: rubble-textured rock with no
      // preferred direction, so cliff faces keep grain even where the
      // directional chutes are masked out
      const talus = wn(u, v, 64, 46, 205);
      L *= 1 + talus * 0.045 * (0.5 + 0.5 * gullyAmp) * fineOk;
      // broad tonal patches so big faces never read as one fill (r6: on
      // vegetated styles the v-frequency drops to keep the degenerate-u
      // grazing projection free of fine stripes)
      L *= treeline > 0 ? 1 + wn(u, v, 7, 3.6, 41) * 0.05 : 1 + wn(u, v, 7, 11, 41) * 0.06;
      if (banding > 0.003) {
        // horizontal sedimentary strata, wobbled and width-varied, plus an
        // occasional darker marker bed — constant-altitude bands, exactly
        // how tableland geology reads from a distance.
        // r6: warp amplitude 1.9 -> 0.45 rad. The old warp displaced the fine
        // beds by ~8 m vertically over a 60 m horizontal wavelength — the
        // bands sheared into chevrons that magnified on the outer ring as
        // melted-curtain striations. Near-straight beds with only a gentle
        // long drift read as layered rock at every distance.
        const warp = wn(u, v, 2.2, 0.6, 23) * 0.45;
        const band = Math.sin(v * 46 + warp) * 0.5 + Math.sin(v * 13.5 + warp * 0.6 + 1.7) * 0.5;
        // per-bed strength variation so the wall is not one uniform stripe
        // print: some beds nearly vanish, others stay bold
        const bedW = 0.55 + 0.45 * (wn(u, v, 1.5, 9, 311) * 0.5 + 0.5);
        L *= 1 + band * banding * 1.35 * bedW;
        const marker = smoothstep(0.75, 0.95, Math.sin(v * 6.2 + warp * 0.4 + 0.6));
        L *= 1 - marker * banding * 0.65;
        // caprock/base tonal break-up: pale rim near the cap, darker scree
        // apron toward the base — vertical color structure that reads as
        // geology instead of a uniform tan fill
        L *= 1 + smoothstep(0.72, 0.95, v) * 0.07 - (1 - smoothstep(0.05, 0.4, v)) * 0.08;
      }
      // faintly warm rock by default; alpine (winter) flips to a faintly COOL
      // cast — the warm bias stacked with the warm scene grade/haze and read
      // as tan desert stone framing a snow map (the r3 winter critique)
      let r = L * (coolRock ? 0.978 : 1);
      let gc = L * (coolRock ? 0.998 : 0.995);
      let b = L * (coolRock ? 1.022 : 0.975);
      if (coolRock) {
        // r3 (content_breadth) ALPINE ROCK STRUCTURE: the bare-rock zones of
        // the winter wall carried only grain+talus (~±10% pre-fog) and
        // rendered as smooth grey slabs (critique, major). Three additions,
        // all broad-in-v so tangential grazing can NEVER comb them into the
        // old vertical fiber:
        //  - constant-altitude LEDGE BEDS (~37 m / ~110 m spacing, per-bed
        //    strength variation) — glacial benches/strata, horizontal by
        //    construction so they actively counter the vertical-smear read
        //  - blocky CRAG mottle (two isotropic octaves) + darker joints
        //  - SNOW LEDGES: thin white accumulation bands riding the ledge
        //    crests below the cap — the elevation-banded snow a real winter
        //    face carries
        const lwarp = wn(u, v, 2.6, 0.7, 143) * 0.35;
        const ledge = Math.sin(v * 34 + lwarp) * 0.55
          + Math.sin(v * 11.5 + lwarp * 0.7 + 2.1) * 0.45;
        const ledgeW = 0.55 + 0.45 * (wn(u, v, 1.7, 8, 517) * 0.5 + 0.5);
        const cragA = wn(u, v, 30, 11, 653);
        const cragB = wn(u, v, 12, 4.6, 719);
        const joint = smoothstep(0.82, 0.97, 1 - Math.abs(wn(u, v, 40, 3.4, 787)));
        const rockM = (1 + ledge * 0.115 * ledgeW)
          * (1 + cragA * 0.075 + cragB * 0.10) * (1 - joint * 0.16);
        r *= rockM; gc *= rockM; b *= rockM * 0.995;
        const shelf = smoothstep(0.55, 0.95, ledge) * ledgeW;
        const shelfW = shelf * 0.5 * smoothstep(0.06, 0.16, v);
        r += (1.06 - r) * shelfW;
        gc += (1.08 - gc) * shelfW;
        b += (1.12 - b) * shelfW;
      }
      if (treeline > 0 && v < treeline * 1.08) {
        // r6 CANOPY REWRITE. The old block was built from vertically-coherent
        // features (downslope creases at fv 2.2, gullies, angle-keyed face
        // columns) — magnified on the ring walls they read as green velvet
        // fabric, the critique's "curtain". A forested hillside seen from
        // kilometers away is: crown clumps (isotropic, sun-lit from above),
        // species-stand patchwork, meadow clearings and pale rock breaks —
        // nothing vertically elongated.
        const below = belowTree;
        // base forest darkening (green shift)
        const mw = below * 0.40;
        r *= 1 - mw * 1.05; gc *= 1 - mw * 0.42; b *= 1 - mw * 0.95;
        // crown texture kept NEAR-OFF (r6c). Any sub-20 m canopy variation is
        // fiber fuel: where the ring wall is seen along-tangent the u axis
        // degenerates to zero pixels and the texture renders as a 1-D
        // function of v — every fine v-frequency becomes a combed-hair
        // stripe down the slope, at ANY anisotropy setting. Real forested
        // hills at 600 m+ genuinely read smooth: broad stand patchwork +
        // serrated crest combs carry the forest, so only a whisper of crown
        // mottle survives here for the frontal mid-ring faces.
        const cA = wn(u, v, 48, 40, 631);
        const cB = wn(u, v, 20, 16, 733);
        const dAv = wn(u, v + 0.01, 48, 40, 631) - wn(u, v - 0.01, 48, 40, 631);
        const cl = clamp(1 + (cA * 0.025 + cB * 0.05 + dAv * 0.05) * below, 0.6, 1.5);
        r *= cl; gc *= cl; b *= cl;
        // species-stand patchwork, three octaves of hue/value (kept from r5)
        const standA = wn(u, v, 9, 5.5, 217) * 0.5 + 0.5;   // ~40 m patches
        const standB = wn(u, v, 3.4, 2.1, 305) * 0.5 + 0.5; // ~110 m stands
        const standC = wn(u, v, 1.3, 0.9, 419) * 0.5 + 0.5; // whole-flank drift
        const warmW = smoothstep(0.56, 0.86, standB) * below;      // birch/larch stands
        r *= 1 + warmW * 0.16; gc *= 1 + warmW * 0.10; b *= 1 - warmW * 0.10;
        const darkW = smoothstep(0.60, 0.88, 1 - standA) * below;  // spruce blocks
        r *= 1 - darkW * 0.22; gc *= 1 - darkW * 0.12; b *= 1 - darkW * 0.08;
        const lift = (standC - 0.5) * 0.14 * below;                // broad value drift
        r *= 1 + lift; gc *= 1 + lift; b *= 1 + lift;
        // meadow clearings: warm lighter breaks in the canopy sheet
        const clr = smoothstep(0.62, 0.86, wn(u, v, 8, 4.6, 841) * 0.5 + 0.5) * below;
        r *= 1 + clr * 0.22; gc *= 1 + clr * 0.20; b *= 1 + clr * 0.06;
        // sparse pale rock breaks on the upper flanks (broad in v — fine
        // v-frequencies stripe the tangentially-grazed walls)
        const scar = smoothstep(0.80, 0.94, wn(u, v, 16, 4.5, 947) * 0.5 + 0.5)
          * below * smoothstep(treeline * 0.35, treeline * 0.75, v);
        r += (0.72 - r) * scar * 0.6; gc += (0.72 - gc) * scar * 0.6; b += (0.70 - b) * scar * 0.6;
      }
      if (snowline <= 1) {
        const sw = smoothstep(snowline - 0.02, snowline + 0.09, v + wn(u, v, 24, 24, 51) * 0.05);
        // r7 SNOW SURFACE DETAIL: the near-constant 0.03 wind noise left every
        // snowed face reading as an untextured smooth sheet (the "faceted
        // low-poly with untextured faces" critique). Three structure scales:
        //  - sastrugi: wind-carved drift banding, gently diagonal, broad in v
        //  - drift shadows: large soft accumulation basins between spurs
        //  - rock ribs: dark spur lines piercing the caps where gullies run,
        //    plus sparse crag windows on the steeper mid-band (broad in v so
        //    tangential grazing cannot comb them into stripes)
        const sast = wn(u, v, 30, 17, 361) * 0.5 + wn(u, v, 14, 7, 409) * 0.5; // r5 TE: lower u-freq — no grazing stripes
        const basin = wn(u, v, 5.5, 3.2, 477);
        // rib lines from the RAW ridged field (the gullyAmp-scaled `gully` is
        // ~0.12 on alpine — far too faint to survive the ring fog)
        const ribRaw = smoothstep(0.90, 0.99, g);
        const ribMask = smoothstep(0.50, 0.80, wn(u, v * 0.4, 13, 2.0, 533) * 0.5 + 0.5);
        const crag = smoothstep(0.70, 0.92, wn(u, v, 26, 6.5, 601) * 0.5 + 0.5)
          * smoothstep(0.30, 0.55, v) * (1 - smoothstep(0.80, 0.95, v));
        // r8: amplitudes ~2x + one extra mid octave. At the r7 strengths the
        // whole structure pass washed out under fog/haze and the ring read as
        // an untextured smooth-gradient sheet with visible geometry facets
        // (critique: "flat-shaded untextured low-poly"). Broad-in-v scales
        // only, so tangential grazing still cannot comb them into stripes.
        const spur = wn(u, v, 11, 4.8, 861); // shoulder/spur shading between basins
        // r8b: measured std of the r8 pass was only ±9% luminance — after the
        // ~50% scene-fog wash that rendered as a smooth gradient. Broad basins
        // and spur shading carry most of the boost (they survive distance);
        // combined std lands ~±19% pre-fog, and the alpine material darkening
        // (1.61 -> 1.26 recenter) keeps it out of the tonemap shoulder.
        // r1 (content_breadth): rib strength 0.60 -> 0.30 and SEGMENTED by
        // the same offset-run mask the gullies use — the full-height 0.60
        // rib chutes were the "vertical texture smearing" the critique saw
        // on the winter wall (dark top-to-bottom streaks magnified at range)
        // r6 (content_breadth): the surviving ribs STILL read as rain streaks
        // across the big massif face (critique). seg's fv 9.5 leaves ~21 m
        // runs — long enough to chain visually into full-height chutes at
        // ring distance. A second, much tighter v-segmentation (fv 26 ≈ 8 m
        // runs) breaks every rib into short couloir dashes, and both chute
        // terms drop another step; the isotropic sastrugi/basin/spur fields
        // carry the face structure instead.
        const seg2 = smoothstep(0.30, 0.62, wn(u, v, 12, 26, 997) * 0.5 + 0.5);
        const snowL = 1.03 + sast * 0.26 + basin * 0.34 + spur * 0.18
          - gully * 0.10 - ribRaw * ribMask * seg * seg2 * 0.18;
        let sr = snowL * 0.98, sg = snowL * 1.0, sb = snowL * 1.04;
        // crag windows: bare cool rock showing through the mid-flank snow
        sr += (0.60 - sr) * crag * 0.85; sg += (0.63 - sg) * crag * 0.85; sb += (0.70 - sb) * crag * 0.85;
        r += (sr - r) * sw * 0.94;
        gc += (sg - gc) * sw * 0.94;
        b += (sb - b) * sw * 0.94;
      }
      const j = (y * su + x) * 4;
      d[j] = clamp(r * 159, 0, 255);
      d[j + 1] = clamp(gc * 159, 0, 255);
      d[j + 2] = clamp(b * 159, 0, 255);
      d[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  // r6: anisotropy is CONTENT-DEPENDENT. Constant-altitude strata and snow/
  // rock structure (mesa/alpine) survive high aniso — it keeps the beds crisp
  // at grazing angles. Stochastic canopy noise does the opposite: at 16x the
  // sampler RESOLVES the noise along the minor footprint axis and paints
  // coherent fiber streaks down every tangentially-grazed wall (the residual
  // felt read). Low aniso lets those faces mip to a soft hazy blend instead —
  // the tree combs and stand patchwork carry the forest read.
  // r1 (content_breadth): alpine drops to 4 — unlike the mesa's constant-
  // altitude beds, the snow/rock structure is stochastic, and 16x resolved it
  // into the same down-slope fiber on tangentially-grazed winter walls.
  // Only the banded (mesa) style keeps 16.
  // r5 terrain_environment: alpine 4 -> 2 — the residual vertical streaks on
  // the winter massif walls were the stochastic snow structure resolving at
  // grazing angles; 2x mips those faces to a soft blend like the canopy path.
  t.anisotropy = treeline > 0 ? 2 : (banding > 0.003 ? 16 : 2);
  // linear (non-sRGB): authored contrast passes through 1:1 and the 0.62
  // mid-gray recentres exactly with the material color multiplier below
  return t;
}

// ---------------------------------------------------------------------------
// High-zoom detail overlay (controls_gunnery r5) — a small TILEABLE value-
// noise texture multiplied into the ring at ~6 m and ~22 m feature scales.
// The base detail texture spans one u-repeat over ~370-800 m of ridge arc, so
// an x8 scope frame (~60-100 m of arc) sees at most a few dozen texels: the
// magnified walls read as an airbrushed matte gradient ("flat green
// matte-painting backdrop", r5 critique). This overlay carries the crown
// mottle / rock granulation the base texture cannot, mips away to nothing in
// wide shots, and is built from a WRAPPED-lattice noise so
// it tiles with no seam. Isotropic features + low anisotropy keep it from
// combing into down-slope fiber at grazing angles (the r3/r6 curtain bug).
// ---------------------------------------------------------------------------
function makeDetailNoiseTexture(rng) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  // wrapped-lattice value noise, three octaves (cells wrap → texture tiles)
  const octaves = [[8, 0.5], [24, 0.32], [64, 0.18]];
  const lattices = octaves.map(([cells]) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    return g;
  });
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (let o = 0; o < octaves.length; o++) {
        const cells = octaves[o][0], amp = octaves[o][1], g = lattices[o];
        const fx = (x / S) * cells, fy = (y / S) * cells;
        const x0 = Math.floor(fx) % cells, y0 = Math.floor(fy) % cells;
        const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
        const a = g[y0 * cells + x0], b = g[y0 * cells + x1];
        const e = g[y1 * cells + x0], f = g[y1 * cells + x1];
        v += ((a + (b - a) * tx) + ((e + (f - e) * tx) - (a + (b - a) * tx)) * ty - 0.5) * amp;
      }
      const L = clamp(128 + v * 255, 0, 255);
      const j = (y * S + x) * 4;
      d[j] = L; d[j + 1] = L; d[j + 2] = L; d[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 2; // grazing walls mip to a soft blend, never fiber streaks
  return t;
}

// ---------------------------------------------------------------------------
// Ridgeline tree-line texture — a repeating alpha-tested canopy silhouette.
// It is reserved for the outer skyline: using the same ribbon on nearer ridge
// faces turns it into a contour stripe under scope magnification. Drawn in a
// neutral green-grey and multiplied by the crest colors so haze/sun grading
// stays continuous with the distant terrain proxy.
// ---------------------------------------------------------------------------
function makeTreeLineTexture(profileSeed) {
  // Four crown variants share one atlas and one material. Earlier revisions
  // repeated one strip every 56 m on every ridge and flank; scopes exposed the
  // same conifer triangles as giant fins. A connected, low-frequency canopy
  // keeps the cheap impostor philosophy while reading as a forest mass.
  const w = texSize(768), h = texSize(128);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  const variants = HORIZON_TREELINE_ATLAS_VARIANTS;
  const bandH = Math.floor(h / variants);
  for (let variant = 0; variant < variants; variant++) {
    // CanvasTexture flips Y at upload, so variant zero is drawn into the
    // bottom canvas band to keep its UV range at v=0..0.25.
    const bandTop = (variants - 1 - variant) * bandH;
    const base = bandTop + bandH - 2;
    const usableH = Math.max(8, bandH - 5);
    const profile = sampleTreelineCrownProfile({
      seed: profileSeed, variant, samples: 192,
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop + 1, w, bandH - 2);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(0, base - profile[0] * usableH);
    for (let i = 1; i <= profile.length; i++) {
      const index = i % profile.length;
      ctx.lineTo((i / profile.length) * w, base - profile[index] * usableH);
    }
    ctx.lineTo(w, base);
    ctx.lineTo(0, base);
    ctx.closePath();
    const canopy = ctx.createLinearGradient(0, bandTop + 2, 0, base);
    canopy.addColorStop(0, 'rgb(166,181,122)');
    canopy.addColorStop(0.52, 'rgb(143,160,103)');
    canopy.addColorStop(1, 'rgb(103,122,78)');
    ctx.fillStyle = canopy;
    ctx.fill();
    ctx.clip();

    ctx.restore();
  }
  // flood transparent texels with the mean tone so mips never halo dark
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) { d[i] = 138; d[i + 1] = 152; d[i + 2] = 100; } // r7: follow the lit ink base
  }
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  // r6: aniso 2 (was 8) — comb ribbons seen along-tangent (frame edges)
  // smeared their tree silhouettes into a diagonal fiber band across the
  // ring wall; low aniso mips those grazing stretches to a soft green band
  // while frontal (magnified) combs stay crisp
  t.anisotropy = 2;
  return t;
}

/**
 * Build the horizon mountain ring for a map.
 * @param {object} engineCtx EngineCtx (unused, kept for call-site parity)
 * @param {?object} cfg map config (uses cfg.horizon, cfg.sky, cfg.id)
 * @param {number} seed base seed (mixed with the map id hash)
 * @returns {THREE.Mesh} unlit vertex-colored ring mesh named 'horizon-ring'
 */
export function buildHorizonRing(engineCtx, cfg, seed) {
  const H = (cfg && cfg.horizon) || {};
  const mapId = (cfg && cfg.id) || 'verdant';
  const style = H.style || STYLE_BY_MAP[mapId] || 'rolling';
  const profile = PROFILES[style] || PROFILES.rolling;
  const amp = H.amp ?? 1;
  const haze = H.haze ?? 1;
  const grainAmp = H.grain ?? 1;

  // lighting_post r7: vegetated ring base lifted toward the SUNLIT hillside
  // band (0x4a5a44 -> 0x5b6c4c) — the unlit ring's baked colors must carry
  // the sun x albedo product; 2-3-stops-dark backdrop was the teal-curtain
  // critical's other half.
  const base = new THREE.Color(H.baseHex ?? 0x5b6c4c);
  const fogC = new THREE.Color((cfg && cfg.sky && cfg.sky.fogTintHex) ?? 0x8fa3bd);
  // detail palette: sensible per-style defaults, overridable per map
  const rockC = new THREE.Color(H.rockHex ?? (style === 'mesa' ? 0x8a5a38 : 0x66625e));
  const snowC = new THREE.Color(H.snowHex ?? 0xeef2f7);
  const forestC = new THREE.Color(H.forestHex ?? 0x435f3a); // r7: lit-canopy green (was 0x2e4230 deep shade)
  const snowline = H.snowline ?? (style === 'alpine' ? 0.42 : 2); // >1 disables
  // r7: vegetated default treelines pushed near the crests (0.55/0.5 ->
  // 0.90/0.88). The old constant-altitude cutoff drew a horizontal band
  // across every hill where forest texture gave way to smooth bald ramp —
  // the critic's "artificial terrace band" + "bald gradient slopes". At
  // these view distances real hill country reads forested to the summit.
  const treeline = H.treeline ?? (style === 'rolling' ? 0.90 : style === 'escarpment' ? 0.88 : 0);
  const treelineLayers = resolveHorizonTreelineLayers(H);
  const banding = H.banding ?? (style === 'mesa' ? 0.16 : 0);
  // soft vegetated hills carry far less exposed rock / flank contrast than
  // cliff-forming styles — full strength there reads as curtain striping
  const rockAmp = style === 'rolling' ? 0.22 : style === 'escarpment' ? 0.3 : 0.78;
  const shadeAmp = style === 'rolling' ? 0.05 : style === 'escarpment' ? 0.06 : 0.12;

  const noi = new SimplexNoise({ random: mulberry32(((seed ^ 0x7A11) ^ idHash(mapId)) >>> 0) });
  const gnoi = new SimplexNoise({ random: mulberry32(((seed ^ 0x33C7) ^ idHash(mapId)) >>> 0) });
  const N = 520; // ~11 m silhouette resolution at the main ridge radius

  // Radial rows. The tuck + skirt rows ride just outside the playable rim and
  // stay LOW but opaque (ground-toned) so the fog-washed outer floor and the
  // pale sky band can never peek between the rim crest and the ridges — the
  // old ring showed exactly that gap as a white 'sea' sheet in wide shots.
  // Ridge bases sit well above any establishing camera (~50 m).
  // ANCHOR row: pinned 22 m underground inside the map rim, so the ring's
  // inner lip is welded to the terrain — without it, any skirt vertex that
  // rises above a rim dip opens a slot where the cream horizon sky pours
  // through as flat white 'ponds' behind the rim forest.
  // Skirt base 26-40 m + first ridge base 50 m keep the wall itself clear of
  // the rim crest at the map edge.
  // r6: rows are PER STYLE. The shared table put the first ridge at base 50 /
  // amp 52 only ~100 m past the rim — on the vegetated maps that projected as
  // a near-vertical green wall filling a third of the frame (the "curtain"
  // critique). Vegetated styles now open with a LOW first ridge and recede
  // through progressively taller, much hazier shells, so the ring reads as
  // 3-4 distinct forested ridgelines instead of one continuous slope. Cliff
  // styles (alpine/mesa) keep the imposing wall — it suits them.
  const ROWS_BY_STYLE = {
    default: [
      { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
      { r: 470, base: 26, amp: 14, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
      { r: 585, base: 50, amp: 52, f0: 3.1, f1: 6.2, aer: 0.12 },
      { r: 760, base: 62, amp: 96, f0: 2.1, f1: 4.6, aer: 0.24 },
      { r: 990, base: 84, amp: 128, f0: 1.5, f1: 3.3, aer: 0.42 },
      // outermost row is a REAL fourth range, not a low taper: a low flat lip
      // here projected as a dead-straight 'shoreline' and its fog-saturated
      // backslope read as a blown-out white lake wherever the nearer rows
      // dipped (loudest on the mesa style's low inter-table stretches)
      { r: 1240, base: 88, amp: 96, f0: 1.1, f1: 2.4, aer: 0.60 },
    ],
    rolling: [
      { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
      { r: 470, base: 22, amp: 12, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
      { r: 600, base: 32, amp: 38, f0: 3.0, f1: 6.4, aer: 0.12 },
      { r: 800, base: 45, amp: 72, f0: 2.0, f1: 4.4, aer: 0.32 },
      { r: 1050, base: 60, amp: 112, f0: 1.4, f1: 3.1, aer: 0.54 },
      { r: 1330, base: 72, amp: 120, f0: 1.0, f1: 2.2, aer: 0.72 },
    ],
    escarpment: [
      { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
      { r: 470, base: 24, amp: 12, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
      { r: 600, base: 36, amp: 44, f0: 2.8, f1: 6.0, aer: 0.14 },
      { r: 800, base: 50, amp: 82, f0: 2.0, f1: 4.4, aer: 0.34 },
      { r: 1050, base: 66, amp: 116, f0: 1.4, f1: 3.1, aer: 0.54 },
      { r: 1330, base: 76, amp: 106, f0: 1.0, f1: 2.2, aer: 0.70 },
    ],
    // terrain_environment r3: alpine gets its OWN row table with two extra
    // intermediate ranges. On the shared 4-ridge table the radial span
    // between rows reached 230-250 m — each wall was a single quad strip of
    // ~12 x 150 m triangles whose baked per-vertex shading interpolated into
    // exactly the "raw planar facets / vertical brush-smear" the critique
    // called out. Tighter spacing (plus the per-fragment relight below)
    // turns the wall into overlapping layered ridge lines.
    // r4 terrain_environment: two MORE intermediate ranges (650/940). The
    // winter critique's "faceted low-poly triangle mountains" were the huge
    // radial wall quads between adjacent rows — with only ~5 visible rows a
    // single triangle spanned 130-200 m and its vertex-color/normal
    // interpolation read as flat slate facets. Tighter row spacing halves
    // the facet size and adds two extra overlapping ridge lines.
    alpine: [
      { r: 428, base: -22, amp: 0, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
      { r: 470, base: 26, amp: 14, f0: 6.0, f1: 11.0, aer: 0.10, skirt: true },
      { r: 585, base: 50, amp: 52, f0: 3.1, f1: 6.2, aer: 0.10 },
      { r: 650, base: 52, amp: 64, f0: 2.8, f1: 5.7, aer: 0.14 },
      { r: 720, base: 56, amp: 76, f0: 2.6, f1: 5.2, aer: 0.18 },
      { r: 870, base: 66, amp: 102, f0: 1.9, f1: 4.0, aer: 0.30 },
      { r: 940, base: 74, amp: 114, f0: 1.7, f1: 3.6, aer: 0.36 },
      { r: 1040, base: 82, amp: 128, f0: 1.5, f1: 3.3, aer: 0.44 },
      { r: 1240, base: 88, amp: 100, f0: 1.1, f1: 2.4, aer: 0.60 },
    ],
  };
  const rows0 = ROWS_BY_STYLE[style] || ROWS_BY_STYLE.default;

  const nv0 = N * rows0.length;
  const pos0 = new Float32Array(nv0 * 3);
  const hs0 = new Float32Array(nv0);
  let maxH = 1;
  // >>> gameplay_feel r4: keep every ring row OUTSIDE the playable square. --
  // The rows are circles but the map is a SQUARE (half-width ~512): a
  // 428/470 m skirt circle lies entirely INSIDE that square, so anywhere the
  // player drives past radius ~430 from map center (the r4 critique's rough
  // drive spot sat at r=474) the opaque 22-38 m skirt wall stood in the
  // MIDDLE of the playfield and filled the whole chase/scope frame as a
  // featureless smeared "green wall" (drive_chase.png; reproduced and
  // isolated by hiding horizon-* meshes — scratchpad/gfdiag). Warp each
  // row's radius to hug the square rim instead:
  //   rEff(a) = max(row.r, rimDist(a) + margin_row)
  // with rimDist(a) = HALF_W / max(|cos a|, |sin a|) the distance from map
  // center to the square rim along that azimuth. Axis-facing stretches are
  // unchanged (row.r already clears the rim there); the edge/corner wedges
  // push outward, so the backdrop becomes a rounded square that can never
  // enter the playfield. The treeline combs follow automatically (they read
  // the warped crest vertices).
  const RIM_HALF_W = 512;
  // r3: margins keyed per row COUNT — the 7-row alpine table needs its own
  // outward-push ladder (values interpolate the original radius->margin curve)
  // r4: 9-row alpine ladder (rows added at 650/940) — margins interpolated so
  // rEff stays monotonic across rows along every azimuth (incl. corners)
  const ROW_RIM_MARGIN = rows0.length === 9
    ? [-34, 22, 95, 150, 200, 340, 430, 540, 800]
    : rows0.length === 7
      ? [-34, 22, 95, 200, 340, 540, 800]
      : [-34, 22, 95, 280, 520, 800];
  // <<< gameplay_feel r4 ------------------------------------------------------
  for (let ri = 0; ri < rows0.length; ri++) {
    const row = rows0[ri];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      // >>> gameplay_feel r4: square-rim radius clamp (see note above)
      const rim = RIM_HALF_W / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      const rEff = Math.max(row.r, rim + (ROW_RIM_MARGIN[ri] ?? 300));
      const jr = rEff * (1 + 0.03 * noi.noise(Math.cos(a) * 4 + ri * 13, Math.sin(a) * 4 - ri * 7));
      // <<< gameplay_feel r4
      let hh;
      if (row.skirt) {
        hh = row.base + (noi.noise(Math.cos(a) * row.f0, Math.sin(a) * row.f0) * 0.5 + 0.5) * row.amp;
      } else {
        hh = profile(a, noi, row);
      }
      hh *= amp;
      const i = ri * N + k;
      hs0[i] = hh;
      if (!row.skirt && hh > maxH) maxH = hh;
      pos0[i * 3] = Math.cos(a) * jr;
      pos0[i * 3 + 1] = hh;
      pos0[i * 3 + 2] = Math.sin(a) * jr;
    }
    // Low-pass only the skyline-owning alpine rows. This is deliberately a
    // geometry operation (rather than a material blur): even at x8 zoom the
    // silhouette cannot contain a one- or two-vertex needle. Eight compact
    // passes retain broad peak groups while removing the repeated sawtooth.
    if (style === 'alpine' && !row.skirt) {
      const baseI = ri * N;
      softenAlpineRing(hs0, baseI, N, row, amp);
      for (let k = 0; k < N; k++) pos0[(baseI + k) * 3 + 1] = hs0[baseI + k];
    }
  }

  // --- alpine RADIAL SUBDIVISION (content_breadth r5) ------------------------
  // Even with the 9-row ladder + smoothed analytic normals, the wall between
  // two adjacent alpine rows is ONE quad strip spanning 65-200 m radially —
  // from the establishing camera those quads render as flat "folded paper"
  // facets with a plain vertex-color gradient (critique, minor). Insert two
  // interpolated circles per non-skirt gap and displace them with a fractal
  // crag field scaled to the local wall relief: facet size drops ~3x, and the
  // sub-row knolls/gullies feed the smoothed-normal relight + per-fragment
  // rock splat with REAL surface structure instead of an interpolation ramp.
  // Silhouette is untouched (authored crest circles keep their vertices);
  // other styles pass through unchanged. Cost: 9 -> 21 rows x 520 verts.
  let rows = rows0, pos = pos0, hs = hs0;
  if (style === 'alpine') {
    const SUB = 2;
    const rowsX = [];
    const posX = [];
    const hsX = [];
    const pushRow = (rowObj, srcBase) => {
      rowsX.push(rowObj);
      for (let k = 0; k < N; k++) {
        const i = srcBase + k;
        posX.push(pos0[i * 3], pos0[i * 3 + 1], pos0[i * 3 + 2]);
        hsX.push(hs0[i]);
      }
    };
    for (let ri = 0; ri < rows0.length; ri++) {
      pushRow(rows0[ri], ri * N);
      if (ri >= rows0.length - 1 || rows0[ri].skirt || rows0[ri + 1].skirt) continue;
      const rA = rows0[ri], rB = rows0[ri + 1];
      for (let s = 1; s <= SUB; s++) {
        const f = s / (SUB + 1);
        rowsX.push({
          r: rA.r + (rB.r - rA.r) * f,
          base: rA.base + (rB.base - rA.base) * f,
          amp: rA.amp + (rB.amp - rA.amp) * f,
          f0: rA.f0, f1: rA.f1,
          aer: rA.aer + (rB.aer - rA.aer) * f,
          interpolated: true,
        });
        const fq = 6.5 + s * 2.3;
        for (let k = 0; k < N; k++) {
          const a = (k / N) * Math.PI * 2;
          const iA = ri * N + k, iB = (ri + 1) * N + k;
          const hA = hs0[iA], hB = hs0[iB];
          // crag displacement sized to the local wall relief (+ a floor so
          // even gentle spans pick up micro-structure)
          const crag = noi.noise(Math.cos(a) * fq + ri * 23.7 + s * 17.1,
            Math.sin(a) * fq - ri * 11.3 + s * 7.7) * 0.72
            + noi.noise(Math.cos(a) * 14.0 + s * 41.0 + ri * 3.0,
              Math.sin(a) * 14.0 - s * 23.0) * 0.28;
          const disp = crag * (Math.abs(hB - hA) * 0.16 + 7.0);
          // small radial wander so remaining facet borders never run straight
          const rj = 1 + 0.011 * noi.noise(Math.cos(a) * 9.0 - s * 13.0 + ri * 5.0,
            Math.sin(a) * 9.0 + s * 29.0);
          posX.push(
            (pos0[iA * 3] + (pos0[iB * 3] - pos0[iA * 3]) * f) * rj,
            hA + (hB - hA) * f + disp,
            (pos0[iA * 3 + 2] + (pos0[iB * 3 + 2] - pos0[iA * 3 + 2]) * f) * rj);
          hsX.push(hA + (hB - hA) * f + disp);
        }
      }
    }
    rows = rowsX;
    pos = new Float32Array(posX);
    hs = new Float32Array(hsX);
  }
  const nv = N * rows.length;
  const col = new Float32Array(nv * 3);
  const uvA = new Float32Array(nv * 2);
  // detail-texture UVs: u wraps the ring, v = absolute altitude fraction so
  // strata/snow features in the texture land at constant world height
  for (let ri = 0; ri < rows.length; ri++) {
    for (let k = 0; k < N; k++) {
      const i = ri * N + k;
      uvA[i * 2] = (k / N) * 10;
      uvA[i * 2 + 1] = clamp(hs[i] / maxH, 0, 1);
    }
  }

  // --- vertex shading -------------------------------------------------------
  // Baked, unlit: sun-facing ridge flanks lighter (real azimuth from cfg.sky),
  // steep faces expose rock, snow above the snowline on gentler slopes, forest
  // tint below the treeline, sandstone strata on mesa cliffs, fine albedo
  // grain, then the aerial-perspective haze ramp toward the fog color.
  const sunAz = ((cfg && cfg.sky && cfg.sky.sunAzimuthDeg) ?? 115) * Math.PI / 180;
  // lighting_post r3: real per-vertex N·L against the map sun replaces the
  // tangential-only baked sun/shade term (walls read as unshaded texture at
  // sniper x8). Elevation from cfg.sky, default 32 deg.
  const sunEl = ((cfg && cfg.sky && cfg.sky.sunElevationDeg) ?? 32) * Math.PI / 180;
  const lx = Math.sin(sunAz) * Math.cos(sunEl);
  const ly = Math.sin(sunEl);
  const lz = Math.cos(sunAz) * Math.cos(sunEl);
  // SMOOTHED height series for the shading derivatives only (silhouette keeps
  // its sharp vertices): raw per-vertex differences bake into alternating
  // light/dark column striping on the ridge faces.
  const hsS = new Float32Array(hs);
  for (let pass = 0; pass < 3; pass++) {
    for (let ri = 0; ri < rows.length; ri++) {
      const prev = hsS.slice(ri * N, ri * N + N);
      for (let k = 0; k < N; k++) {
        hsS[ri * N + k] = prev[(k - 1 + N) % N] * 0.27 + prev[k] * 0.46 + prev[(k + 1) % N] * 0.27;
      }
    }
  }
  // Per-vertex slope/sun response, then SMOOTHED ALONG THE RING before it
  // drives any color: the wall between two radial rows is a single quad
  // strip ~7 m wide and up to 100+ m tall, so any column-to-column jitter in
  // a slope-keyed color term (rock takeover, iron-oxide flush, snow shedding)
  // bakes into exact full-height vertical stripes — the r3 critique's
  // "vertical texture smearing" on the desert canyon walls was these vertex
  // color columns, not the detail texture.
  const slopeA = new Float32Array(nv);
  // per-vertex smoothed gradients (lighting_post r3: replaces the collapsed
  // tangential sunA scalar — both components feed a full N·L in the color loop)
  const dTangA = new Float32Array(nv);
  const dRadA = new Float32Array(nv);
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let k = 0; k < N; k++) {
      const i = ri * N + k;
      const hPrev = hsS[ri * N + ((k - 1 + N) % N)];
      const hNext = hsS[ri * N + ((k + 1) % N)];
      const dTang = (hNext - hPrev) / (2 * Math.PI * row.r / N * 2); // dh/darc
      const hIn = ri > 0 ? hsS[(ri - 1) * N + k] : hsS[i];
      const hOut = ri < rows.length - 1 ? hsS[(ri + 1) * N + k] : hsS[i];
      const dRad = (hOut - hIn) / (((ri < rows.length - 1 ? rows[ri + 1].r : row.r) -
        (ri > 0 ? rows[ri - 1].r : row.r)) || 1);
      slopeA[i] = clamp(Math.hypot(dTang, dRad * 2.2) * 1.6, 0, 1);
      dTangA[i] = dTang;       // dh/darc
      dRadA[i] = dRad * 2.2;   // dh/dradial, same weighting as slopeA
    }
  }
  for (let pass = 0; pass < 5; pass++) {
    for (let ri = 0; ri < rows.length; ri++) {
      const ps = slopeA.slice(ri * N, ri * N + N);
      const pt = dTangA.slice(ri * N, ri * N + N);
      const pr = dRadA.slice(ri * N, ri * N + N);
      for (let k = 0; k < N; k++) {
        const km = (k - 1 + N) % N, kp = (k + 1) % N;
        slopeA[ri * N + k] = ps[km] * 0.27 + ps[k] * 0.46 + ps[kp] * 0.27;
        dTangA[ri * N + k] = pt[km] * 0.27 + pt[k] * 0.46 + pt[kp] * 0.27;
        dRadA[ri * N + k] = pr[km] * 0.27 + pr[k] * 0.46 + pr[kp] * 0.27;
      }
    }
  }
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const i = ri * N + k;
      const t = clamp(hs[i] / maxH, 0, 1);
      const slope = slopeA[i];

      c.copy(base);
      // altitude tone drift: valleys slightly deeper, crests lighter
      c.multiplyScalar(0.82 + t * 0.34);
      // steep faces expose rock
      const rockW = smoothstep(0.34, 0.8, slope) * (row.skirt ? 0.25 : rockAmp);
      c.lerp(rockC, rockW);
      // forest band on the lower flanks (rolling / escarpment).
      // r6: the strength noise MUST vary with altitude too — keyed on the
      // ring angle alone it painted full-height light/dark columns down the
      // walls (a major contributor to the green-curtain fabric read).
      if (treeline > 0) {
        const fn = gnoi.noise(Math.cos(a) * 7 + 3 + t * 3.1, Math.sin(a) * 7 + ri - t * 2.4) * 0.5 + 0.5;
        const fw = (1 - smoothstep(treeline * 0.55, treeline, t)) * (1 - slope * 0.4) *
          (0.5 + 0.5 * fn);
        c.lerp(forestC, clamp(fw, 0, 1) * 0.6);
      }
      // iron-oxide flush on the steepest mesa walls — the strata BANDS are
      // painted by the altitude-mapped detail texture (per-vertex sin bands
      // aliased into mush at this vertex spacing)
      if (banding > 0.001) {
        // 0.4 (was 0.55): with the slope series smoothed the flush is a broad
        // face wash — softer, so the texture strata stay the dominant read
        const steepW = smoothstep(0.3, 0.7, slope);
        tmp.setRGB(c.r * 1.08, c.g * 0.89, c.b * 0.75);
        c.lerp(tmp, steepW * 0.4);
      }
      // snow above the snowline (gentler slopes hold snow; cliffs shed it).
      // r3: full caps above the line PLUS a thinner dusting on gentle ground
      // below it — a winter range is snow-bound to the valley floor, not a
      // snow-capped desert; bare tan foothills were the loudest winter tell
      if (snowline <= 1) {
        const band = smoothstep(snowline, snowline + 0.16, t +
          gnoi.noise(Math.cos(a) * 6 - 9, Math.sin(a) * 6 + 4) * 0.07);
        // r7: shed band 0.45-0.9 -> 0.30-0.68 — the old hold kept nearly
        // every face snowbound and the whole ring flattened into uniform
        // cream pyramids; steep flanks now expose cool rock ribs, giving the
        // slope-based snow/rock banding a real range shows
        // r8: 0.30-0.68 -> 0.22-0.56 — even so the winter shot still rendered
        // a near-uniform grey-white wall; more shed rock = more slope-keyed
        // material contrast to mask the facet shading
        // r1 (content_breadth): the r8 shed OVERSHOT — the fractal alpine
        // profile's slope metric sits >0.56 on virtually the whole wall, so
        // hold≈0 everywhere and the ring rendered as a BARE grey rock curtain
        // with zero snow on the peaks (critique). Two-part fix: widen the
        // shed band back to 0.38-0.78 (only true cliff faces shed), and force
        // a crest hold — the upper ~third of every summit stays snowbound
        // regardless of slope, exactly how a winter range reads. Shed rock
        // survives on the steep mid-flanks, giving the slope-keyed contrast
        // WITHOUT trading the caps away.
        const hold = 1 - smoothstep(0.38, 0.78, slope);
        const crest = smoothstep(0.52, 0.80, t);
        const holdEff = Math.min(1, hold + crest * 0.9);
        c.lerp(snowC, clamp(band * 0.95 + (1 - band) * 0.38, 0, 1) * holdEff);
      }
      // lighting_post r3: real N·L against the map sun — sun-facing slopes
      // lift warm, back slopes drop cool, exactly like the terrain-side
      // per-vertex relight in buildChunkGeometry. The haze lerp stays AFTER
      // this, so distance still flattens the lighting like aerial perspective.
      // tangent t̂ = (-sin a, 0, cos a), radial r̂ = (cos a, 0, sin a)
      {
        const nx = dTangA[i] * Math.sin(a) - dRadA[i] * Math.cos(a);
        const nz = -dTangA[i] * Math.cos(a) - dRadA[i] * Math.sin(a);
        const inv = 1 / Math.hypot(nx, 1, nz);
        const ndl = (nx * lx + ly + nz * lz) * inv;         // N.L, -1..1
        // r3 terrain_environment: alpine drops to 0.10 — its full N·L bake
        // interpolated across the huge wall triangles as visible planar
        // facets; the per-fragment relight in the material (smooth vertex
        // normals, uFragRel) carries the directional shading instead.
        const relAmp = row.skirt ? 0.08 :
          (style === 'alpine' ? 0.10 : style === 'mesa' ? 0.34 : 0.26);
        const lit = Math.max(ndl, 0), shade = Math.max(-ndl, 0);
        c.multiplyScalar(1 - relAmp * 0.85 + relAmp * 1.6 * lit); // sun side up, back slopes down
        c.lerp(tmp.setRGB(c.r * 1.05, c.g * 1.0, c.b * 0.92), lit * 0.30);   // warm lit faces
        c.lerp(tmp.setRGB(c.r * 0.88, c.g * 0.93, c.b * 1.08), shade * 0.35); // cool shadow faces
      }
      // low-frequency tone drift only — fine grain now lives in the detail
      // texture where it can't bake into triangle-sized shading facets.
      // ALTITUDE in the noise domain: keyed on (a, ri) alone this drift was
      // constant from wall base to crest, baking full-height light/dark
      // columns that read as vertical paint smear on the far desert walls
      const g1 = gnoi.noise(Math.cos(a) * 5.5 + ri * 0.7 + t * 2.6, Math.sin(a) * 5.5 - ri * 0.4 - t * 1.9);
      c.multiplyScalar(1 + g1 * 0.045 * grainAmp);
      // aerial perspective: row depth + valley haze + gentle base fade that
      // melts the ring into the scene fog instead of a hard color step
      let hazeW = row.aer * haze + (1 - t) * 0.07;
      if (row.skirt) hazeW = row.aer * haze; // ground band stays ground-toned
      c.lerp(fogC, clamp(hazeW, 0, 0.94));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  }

  // DEBUG: paint each row a flat color to identify geometry in screenshots
  if (globalThis.__HORIZON_DEBUG) {
    const dbg = [[1, 0.4, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1]];
    for (let ri = 0; ri < rows.length; ri++) {
      const dc = dbg[ri % dbg.length];
      for (let k = 0; k < N; k++) {
        const i = ri * N + k;
        col[i * 3] = dc[0]; col[i * 3 + 1] = dc[1]; col[i * 3 + 2] = dc[2];
      }
    }
  }
  const idx = [];
  for (let ri = 0; ri < rows.length - 1; ri++) {
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      const a0 = ri * N + k, a1 = ri * N + k1;
      const b0 = (ri + 1) * N + k, b1 = (ri + 1) * N + k1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // r4 terrain_environment: ANALYTIC SMOOTHED NORMALS for the alpine ring.
  // computeVertexNormals face-averages the sharp silhouette geometry, so
  // adjacent vertices carry wildly different normals and the per-fragment
  // relight/rock-splat interpolated them as huge flat planes — the winter
  // critique's "faceted low-poly triangle mountains". The 5-pass smoothed
  // slope series (dTangA/dRadA, same data the vertex relight uses) shades
  // the wall as one continuous surface; the SILHOUETTE keeps its sharp
  // vertices. Alpine only: the other styles never read normals (unlit).
  if (style === 'alpine') {
    const nAttr = geo.attributes.normal;
    for (let ri = 0; ri < rows.length; ri++) {
      for (let k = 0; k < N; k++) {
        const i = ri * N + k;
        const a = (k / N) * Math.PI * 2;
        const nx = dTangA[i] * Math.sin(a) - dRadA[i] * Math.cos(a);
        const nz = -dTangA[i] * Math.cos(a) - dRadA[i] * Math.sin(a);
        const inv = 1 / Math.hypot(nx, 1, nz);
        nAttr.setXYZ(i, nx * inv, inv, nz * inv);
      }
    }
  }
  // DoubleSide: the shallow inner skirt annulus is seen from ABOVE by raised
  // establishing cameras — with default FrontSide it backface-culls and the
  // sky shows through as a pale 'sea sheet' between rim and ridges (the old
  // ring's desert artifact).
  // Detail texture is authored around mid-gray 0.62 (linear); the material
  // color 1.61 recentres it so vertex colors keep their intended tone while
  // the map layers rock grain / gullies / strata / snow flatten on top.
  // gullies belong on cliff-forming styles; vegetated hills at 700 m don't
  // show drainage chutes, they show forest texture
  // chute strength tuned way down on the cliff styles: at far-wall
  // magnification the old 1.0/0.85 chutes dominated every face as vertical
  // streaking — strata (mesa) and snow/rock contrast (alpine) carry the
  // material read instead
  // r6: mesa 0.38 -> 0.14 — even the tuned chutes still stacked with the
  // sheared strata into vertical melt on the far walls; vegetated styles get
  // ZERO (the canopy texture owns those faces, and any downslope streak
  // reads as curtain fabric on a forested hill)
  // r7: alpine 0.24 -> 0.12 — the residual chutes still striped the big
  // near walls with vertical fiber under the winter overcast
  // r1 (content_breadth): alpine 0.12 -> 0.06 — pairs with the segmented rib
  // cut in the snow pass; kills the last of the vertical smear on the wall
  const gullyAmp = style === 'alpine' ? 0.06 : style === 'mesa' ? 0.14 : 0.0;
  const detailTex = makeHorizonTexture(gnoi, {
    banding, snowline, treeline, grainAmp, gullyAmp, coolRock: style === 'alpine',
  });
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, map: detailTex,
  }); // unlit; scene fog still applies
  mat.color.setRGB(1.61, 1.61, 1.61);
  // r8: the alpine wall's product (0.62-gray texture x 1.61 recenter x snow
  // vertex colors x sun-side relight) landed at 0.9-1.4 LINEAR — squarely on
  // the ACES shoulder, where the (boosted) sastrugi/rib/crag texture contrast
  // compressed to a flat untextured gradient (the critique's "flat-shaded
  // low-poly" winter ring). Pull the whole alpine ring ~22% down into the
  // midtones; under the overcast sky a real range reads darker than the
  // foreground snowfield anyway, and the surface structure finally resolves.
  if (style === 'alpine') mat.color.setRGB(1.26, 1.26, 1.26);
  // controls_gunnery r5: high-zoom detail overlay (see makeDetailNoiseTexture)
  // — two extra octaves of isotropic mottle at ~6 m / ~22 m feature scales so
  // the x8 sniper frame reads textured hillsides instead of a flat gradient.
  // One u-repeat of the BASE uv covers ~370-800 m of arc and the full v range
  // ~130-200 m of altitude, so (64, 26) lands both overlay axes near 6-8 m.
  {
    const detail2 = makeDetailNoiseTexture(
      mulberry32(((seed ^ 0x0D37) ^ idHash(mapId)) >>> 0));
    // r3 terrain_environment: PER-FRAGMENT alpine material pass. The winter
    // wall used to carry all slope/sun response baked per-vertex — across
    // 12 x 150 m wall triangles that interpolates as flat planar facets and
    // vertical gradient smear ("untextured lilac cardboard"). The fragment
    // pass reads the SMOOTH interpolated vertex normal instead:
    //  - slope-keyed rock exposure with a noise-broken boundary (snow sheds
    //    off steep faces per-fragment, not per-vertex),
    //  - constant-altitude strata banding on the exposed rock,
    //  - a real N·L relight against the map sun (replaces the baked term,
    //    which is dropped to 0.10 for alpine above).
    // r4: 0.30 -> 0.40 — with the tighter row ladder the per-fragment relight
    // carries more of the directional shading (vertex bake stays at 0.10)
    const fragRel = style === 'alpine' ? 0.40 : 0.0;
    const slopeSplat = style === 'alpine' ? 1.0 : 0.0;
    // r7 terrain_environment: GRAZING-SMEAR KILL. The ring texture's u axis
    // wraps the ring, so on any wall seen along-tangent u compresses to zero
    // pixels and every fine feature renders as a 1-D function of v — the
    // "vertical texture smearing on steep faces" (winter left massif) and
    // the stretched mesa cap tops. Per-fragment fix: on steep faces (alpine,
    // uWallFix) / near-flat caps (mesa, uCapFix) the texel is rebuilt from a
    // DEEP MIP of itself (broad authored tone, smear-free) times a triplanar
    // world-anchored mottle from the tileable detail texture — true surface
    // texture at any view angle, exactly like the terrain-side triplanar.
    const wallFix = style === 'alpine' ? 1.0 : 0.0;
    const capFix = style === 'mesa' ? 1.0 : 0.0;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail2 = { value: detail2 };
      shader.uniforms.uSunDirW = { value: new THREE.Vector3(lx, ly, lz) };
      shader.uniforms.uFragRel = { value: fragRel };
      shader.uniforms.uSlopeSplat = { value: slopeSplat };
      shader.uniforms.uMaxH = { value: maxH * 1.0 };
      shader.uniforms.uWallFix = { value: wallFix };
      shader.uniforms.uCapFix = { value: capFix };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          '#include <common>\nvarying vec3 vHNrm;\nvarying vec3 vHPos;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvHNrm = normal;\nvHPos = position;');
      // onBeforeCompile uniforms are NOT auto-declared in the GLSL —
      // declared at global scope ahead of the injected block.
      shader.fragmentShader = 'uniform sampler2D uDetail2;\n'
        + 'uniform vec3 uSunDirW;\nuniform float uFragRel;\n'
        + 'uniform float uSlopeSplat;\nuniform float uMaxH;\n'
        + 'uniform float uWallFix;\nuniform float uCapFix;\n'
        + 'varying vec3 vHNrm;\nvarying vec3 vHPos;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>', /* glsl */`#include <map_fragment>
        {
          vec3 hnW0 = normalize(vHNrm);
          float steepF0 = smoothstep(0.30, 0.60, 1.0 - hnW0.y) * uWallFix;
          float capF0 = smoothstep(0.84, 0.96, hnW0.y) * uCapFix;
          float fixW = max(steepF0, capF0);
          if (fixW > 0.004) {
            // broad smear-free base tone: the same texel at a deep mip
            vec3 mapSmooth = texture2D(map, vMapUv, 4.0).rgb;
            // triplanar world-anchored mottle, two feature scales
            vec3 awF = abs(hnW0);
            awF /= (awF.x + awF.y + awF.z);
            float wA = texture2D(uDetail2, vHPos.zy * 0.0052 + vec2(0.11, 0.71)).r * awF.x
                     + texture2D(uDetail2, vHPos.xy * 0.0052 + vec2(0.53, 0.29)).r * awF.z
                     + texture2D(uDetail2, vHPos.xz * 0.0052).r * awF.y;
            float wB = texture2D(uDetail2, vHPos.zy * 0.0175 + vec2(0.67, 0.13)).r * awF.x
                     + texture2D(uDetail2, vHPos.xy * 0.0175 + vec2(0.23, 0.87)).r * awF.z
                     + texture2D(uDetail2, vHPos.xz * 0.0175 + vec2(0.37, 0.61)).r * awF.y;
            vec3 fixCol = mapSmooth * (1.0 + (wA - 0.5) * 0.46 + (wB - 0.5) * 0.34);
            diffuseColor.rgb = diffuseColor.rgb / max(texture2D(map, vMapUv).rgb, vec3(1e-3))
              * mix(texture2D(map, vMapUv).rgb, fixCol, fixW * 0.85);
          }
          float dA = texture2D(uDetail2, vMapUv * vec2(64.0, 26.0)).r - 0.5;
          float dB = texture2D(uDetail2, vMapUv * vec2(17.0, 7.0) + vec2(0.37, 0.11)).r - 0.5;
          // amplitudes sized to SURVIVE the baked haze lerp + scene fog: the
          // wall multiplies this onto an already fog-flattened vertex color,
          // so ±0.1 authored contrast reads as ~±0.04 on screen (still-flat
          // first cut). ±0.29 lands at the crown-mottle read real hills give.
          // r7: the vMapUv-based overlay is itself u-degenerate on grazed
          // walls — fade it where the triplanar fix takes over.
          diffuseColor.rgb *= 1.0 + (dA * 0.28 + dB * 0.30) * (1.0 - fixW * 0.8);
          if (uSlopeSplat > 0.001) {
            vec3 hn = normalize(vHNrm);
            float slopeF = 1.0 - clamp(hn.y, 0.0, 1.0);
            // aerial attenuation: the outer ranges stay fog-flattened
            float farAtt = 1.0 - smoothstep(700.0, 1400.0, length(vHPos.xz)) * 0.62;
            // r6 (content_breadth) TRIPLANAR boundary noise. The old fields
            // sampled vHPos.xz only — constant straight DOWN a steep face, so
            // the rock/snow mix varied laterally but never vertically and the
            // whole wall broke into full-height light/dark runnels (the
            // critique's "rain streaks" on the winter massif). Blend the
            // horizontal-plane sample with the two vertical-plane projections
            // by the smooth normal, exactly like the terrain-side steep-slope
            // splat: steep faces now sample laterally-AND-vertically and the
            // boundary breaks into patches down the face. A third ~45 m field
            // (nD) adds the within-face patch scale the two broad fields lack.
            vec3 awT = abs(hn);
            awT /= (awT.x + awT.y + awT.z);
            #define HTRIP(s, o) (texture2D(uDetail2, vHPos.xz * (s) + (o)).r * awT.y \
              + texture2D(uDetail2, vHPos.zy * (s) + (o) + vec2(0.41, 0.07)).r * awT.x \
              + texture2D(uDetail2, vHPos.xy * (s) + (o) + vec2(0.13, 0.61)).r * awT.z)
            float nB = HTRIP(0.0016, vec2(0.0)) - 0.5;
            float nC = HTRIP(0.0071, vec2(0.29, 0.53)) - 0.5;
            float nD = HTRIP(0.0230, vec2(0.71, 0.19)) - 0.5;
            float hT = clamp(vHPos.y / max(uMaxH, 1.0), 0.0, 1.0);
            // rock exposure on steep faces; the highest crests hold snow
            float rockW = smoothstep(0.30, 0.58, slopeF + nB * 0.34 + nC * 0.20 + nD * 0.14)
                        * (1.0 - smoothstep(0.55, 0.85, hT) * 0.70) * uSlopeSplat * farAtt;
            vec3 rockCol = diffuseColor.rgb * vec3(0.47, 0.50, 0.58);
            // constant-altitude strata relief on the exposed rock
            float bedR = sin(vHPos.y * 0.42 + nB * 9.0) * 0.6
                       + sin(vHPos.y * 0.13 + nC * 5.0) * 0.4;
            rockCol *= 1.0 + bedR * 0.16;
            diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rockW * 0.85);
            // per-fragment N·L relight (smooth normals -> no planar facets)
            float ndl = dot(hn, uSunDirW);
            float rel = uFragRel * farAtt;
            diffuseColor.rgb *= 1.0 - rel * 0.85 + rel * 1.6 * max(ndl, 0.0);
            diffuseColor.rgb = mix(diffuseColor.rgb,
              diffuseColor.rgb * vec3(0.90, 0.94, 1.07), max(-ndl, 0.0) * 0.32 * farAtt);
          }
        }`);
    };
    mat.customProgramCacheKey = () => 'horizon-ring-r7te-' + style;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'horizon-ring';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  // GTAO's depth-edge pass draws dark halo slashes along distant ridge
  // silhouettes — exclude the backdrop like the other flat-lit world layers
  mesh.userData.aoExclude = true;

  // --- distant skyline impostor (vegetated styles only) ---------------------
  // One alpha-tested canopy ribbon follows whichever authored ridge actually
  // forms the skyline at each azimuth. It adds a soft forest-scale irregularity
  // against the sky without layering cards over visible ridge faces, and
  // inherits the same baked color/haze grading.
  // Values below 0.14 fade every crown to zero; skip the texture, geometry,
  // and draw call entirely on the intentionally bare desert/canyon maps.
  if (treeline >= 0.14) {
    const profileSeed = ((seed ^ 0xA771) ^ idHash(mapId)) >>> 0;
    const combTex = makeTreeLineTexture(profileSeed);
    // Alpine walls contain interpolated geometry rows for smooth shading.
    // Planting a ribbon on every row stacked visible contour stripes. Instead,
    // resolve the actual angular skyline once and follow that one envelope.
    const authoredRows = [];
    for (let ri = 0; ri < rows.length; ri++) {
      if (!rows[ri].skirt && !rows[ri].interpolated) authoredRows.push(ri);
    }
    const skylineRows = new Int16Array(N);
    let skylineRadius = 0;
    const observerY = 24;
    for (let k = 0; k < N; k++) {
      let bestRow = authoredRows[0] ?? 0;
      let bestRise = -Infinity;
      for (const ri of authoredRows) {
        const i = ri * N + k;
        const radius = Math.hypot(pos[i * 3], pos[i * 3 + 2]);
        const rise = (pos[i * 3 + 1] - observerY) / Math.max(1, radius);
        if (rise > bestRise) {
          bestRise = rise;
          bestRow = ri;
        }
      }
      skylineRows[k] = bestRow;
      skylineRadius += rows[bestRow].r;
    }
    skylineRadius /= N;
    const tlH = treeline * maxH;
    const cPos = [], cCol = [], cUv = [], cIdx = [];
    let vBase = 0;
    const atlasPad = 1.5 / Math.max(1, combTex.image.height);
    const atlasRange = (variant) => {
      const v0 = variant / HORIZON_TREELINE_ATLAS_VARIANTS + atlasPad;
      const v1 = (variant + 1) / HORIZON_TREELINE_ATLAS_VARIANTS - atlasPad;
      return [v0, Math.max(v0, v1)];
    };
    // Forest-heavy maps can carry two or three skyline-depth ranks. The rear
    // ranks are farther beyond the resolved skyline and more fog-washed. They
    // are still folded into one BufferGeometry and one draw call.
    const baseRepeats = Math.max(8, Math.round((Math.PI * 2 * skylineRadius) / 96));
    for (let layer = treelineLayers - 1; layer >= 0; layer--) {
      const variant = (profileSeed + layer * 3) % HORIZON_TREELINE_ATLAS_VARIANTS;
      const repeats = baseRepeats + layer;
      const [v0, v1] = atlasRange(variant);
      for (let k = 0; k <= N; k++) {  // N+1 columns: seam-free u wrap
        const kk = k % N;
        const ri = skylineRows[kk];
        const row = rows[ri];
        const i = ri * N + kk;
        const x = pos[i * 3], hh = pos[i * 3 + 1], z = pos[i * 3 + 2];
        // Trees thin toward the treeline and vanish above it. Rear ranks use
        // independent crown walks, not scaled duplicates of the front row.
        const height01 = hh / Math.max(1, maxH);
        const snowFade = snowline <= 1
          ? 1 - smoothstep(snowline - 0.05, snowline + 0.02, height01) : 1;
        const fade = (1 - smoothstep(tlH * 0.8, tlH * 1.12, hh)) * snowFade;
        const a = (kk / N) * Math.PI * 2;
        const hn = gnoi.noise(Math.cos(a) * 5.3 + ri * 9 + layer * 7.7,
          Math.sin(a) * 5.3 - ri * 5 - layer * 4.1) * 0.5 + 0.5;
        const hn2 = gnoi.noise(Math.cos(a) * 19.7 + ri * 3.1 - layer * 5.3,
          Math.sin(a) * 19.7 + ri * 11.9 + layer * 8.9) * 0.5 + 0.5;
        const span = (9 + hn * 7) * (0.94 + Math.min(row.r, 1400) / 7000) * fade *
          (0.88 + hn2 * 0.24) * (1 - layer * 0.045);
        // All ranks sit just behind the resolved crest. Putting the ribbon on
        // its inner slope lets the ridge's own triangles depth-occlude the
        // canopy completely; the small outward offset keeps the base hidden
        // by the crest while allowing the crowns to break the sky edge.
        const radialScale = 1.001 + layer * 0.006;
        const drop = 3.2 + layer * 0.72;
        cPos.push(x * radialScale, hh - drop, z * radialScale,
          x * radialScale, hh - drop + span, z * radialScale);
        // Additional aerial perspective is the main depth cue at these
        // distances and prevents dark, high-contrast cardboard silhouettes.
        const hz = Math.min(0.94, row.aer * 0.66 + 0.16 + layer * 0.11);
        const light = 1.7 - layer * 0.08;
        let cr = Math.min(1.9, col[i * 3] * light);
        let cg = Math.min(1.9, col[i * 3 + 1] * light);
        let cb = Math.min(1.9, col[i * 3 + 2] * light);
        cr += (fogC.r - cr) * hz;
        cg += (fogC.g - cg) * hz;
        cb += (fogC.b - cb) * hz;
        cCol.push(cr, cg, cb, cr, cg, cb);
        const u = (k / N) * repeats + variant * 0.23 + layer * 0.41;
        cUv.push(u, v0, u, v1);
      }
      for (let k = 0; k < N; k++) {
        const b0 = vBase + k * 2, t0 = b0 + 1, b1 = b0 + 2, t1 = b1 + 1;
        cIdx.push(b0, b1, t0, t0, b1, t1);
      }
      vBase += (N + 1) * 2;
    }
    // Do not plant ribbons on the ridge faces. They only read as parallel
    // contour stripes under scope magnification; the baked forest tint on the
    // horizon mesh already provides the correct distant canopy mass there.
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cPos), 3));
    cGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cCol), 3));
    cGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cUv), 2));
    cGeo.setIndex(cIdx);
    const cMat = new THREE.MeshBasicMaterial({
      map: combTex, vertexColors: true, alphaTest: 0.38,
      alphaToCoverage: true, side: THREE.DoubleSide,
    });
    const comb = new THREE.Mesh(cGeo, cMat);
    comb.name = 'horizon-treeline';
    comb.castShadow = false;
    comb.receiveShadow = false;
    comb.matrixAutoUpdate = false;
    comb.userData.aoExclude = true;
    comb.userData.horizonTreeline = {
      layers: treelineLayers,
      role: 'outer-skyline',
      vertices: cPos.length / 3,
    };
    mesh.add(comb);
  }
  return mesh;
}
