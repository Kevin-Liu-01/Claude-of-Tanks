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
//   banding,                         — sandstone strata amplitude on steep faces (mesa)
//   rockHex, snowHex, forestHex,     — detail palette overrides
//   haze,                            — aerial-perspective multiplier (default 1)
//   grain,                           — per-vertex albedo grain amplitude (default 1)
// }

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

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
  // glacial ranges: ridged-noise horns blended per-stretch with rounded domes
  // and long shoulder benches, under a low-frequency massif envelope — real
  // alpine walls read as distinct massifs split by lower saddle country, not
  // one uniform comb of identical sharp teeth (the r2 sawtooth critique)
  alpine(a, noi, row) {
    // DOMAIN WARP (r5): the raw ridged field put near-identical teeth at
    // near-identical spacing — warp the angular coordinate before every peak
    // sample so wavelength and spacing wander around the ring
    const warp = noi.noise(Math.cos(a) * 1.9 + 55, Math.sin(a) * 1.9 - 41) * 0.16;
    const aw = a + warp;
    // massif envelope (~2 wavelengths around the ring): tall ranges vs
    // saddle stretches at ~55% height
    const env = noi.noise(Math.cos(a) * 0.62 + 3.1, Math.sin(a) * 0.62 - 8.7) * 0.5 + 0.5;
    const mass = 0.58 + 0.62 * smoothstep(0.22, 0.82, env);
    // peak-shape selector, independent slow noise: 0 = rounded shoulder
    // domes, 1 = sharp glacial horns — so neighbouring summits differ
    const sel = smoothstep(0.3, 0.7, noi.noise(Math.cos(a) * 1.15 - 14.2, Math.sin(a) * 1.15 + 6.4) * 0.5 + 0.5);
    const r1 = 1 - Math.abs(noi.noise(Math.cos(aw) * row.f0 + 21, Math.sin(aw) * row.f0 - 17));
    const r2 = 1 - Math.abs(noi.noise(Math.cos(aw) * row.f1 * 1.7 - 31, Math.sin(aw) * row.f1 * 1.7 + 13));
    const horn = r1 * r1 * r1;
    // dome variant: same ridged field, softened exponent + slight widening
    const dome = Math.pow(r1, 1.35) * 0.72;
    const peak = dome + (horn - dome) * sel;
    // per-peak amplitude jitter: neighbouring summits differ in height, not
    // just shape, so the ring never settles into an even-spaced comb
    const ampJit = 0.78 + 0.44 * (noi.noise(Math.cos(a) * 2.6 - 44, Math.sin(a) * 2.6 + 71) * 0.5 + 0.5);
    // crest serration only survives on the sharp stretches; dome country
    // carries a longer soft undulation instead
    const jag = noi.noise(Math.cos(aw) * 14.0 + 5, Math.sin(aw) * 14.0 - 3) * sel;
    const swell = noi.noise(Math.cos(a) * 3.3 + 27, Math.sin(a) * 3.3 - 19) * (1 - sel);
    return row.base + ((peak * 0.8 * ampJit + r2 * r2 * 0.28) * mass + jag * 0.05 + swell * 0.06) * row.amp;
  },
  // stepped tablelands: noise pushed through plateau terraces -> long flat
  // caps with cliff edges, plus lone buttes between the tables
  mesa(a, noi, row) {
    const n = noi.noise(Math.cos(a) * row.f0 + 41, Math.sin(a) * row.f0 - 27) * 0.5 + 0.5;
    const n2 = noi.noise(Math.cos(a) * row.f1 * 2.3 - 13, Math.sin(a) * row.f1 * 2.3 + 33) * 0.5 + 0.5;
    // two terrace levels with tight smoothstep walls => visible flat tops,
    // over a broad pedestal so inter-table stretches never sag to bare base
    // (bare-base gaps exposed the fog-washed backslope behind as a white
    // 'lake' sheet)
    const table1 = smoothstep(0.36, 0.45, n);
    const table2 = smoothstep(0.62, 0.70, n);
    const butte = smoothstep(0.80, 0.86, n2) * (1 - table2);
    const pedestal = smoothstep(0.14, 0.52, n) * 0.17;
    const capWobble = 1 + 0.05 * noi.noise(Math.cos(a) * 9 + 3, Math.sin(a) * 9 - 8);
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
  const su = 1536, sv = 512;
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
      // granular grain, two octaves
      L += (wn(u, v, 90, 100, 17) * 0.05 + wn(u, v, 34, 38, 5) * 0.06) * grainAmp;
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
      L *= 1 + talus * 0.045 * (0.5 + 0.5 * gullyAmp);
      // broad tonal patches so big faces never read as one fill
      L *= 1 + wn(u, v, 7, 11, 41) * 0.06;
      if (banding > 0.003) {
        // horizontal sedimentary strata, wobbled and width-varied, plus an
        // occasional darker marker bed — constant-altitude bands, exactly
        // how tableland geology reads from a distance
        const warp = wn(u, v, 6, 1.5, 23) * 1.9;
        const band = Math.sin(v * 46 + warp) * 0.5 + Math.sin(v * 13.5 + warp * 0.6 + 1.7) * 0.5;
        // 1.35 (was 0.9): constant-altitude beds are the ONE feature that
        // stays crisp under grazing-angle u-minification — they must win over
        // the vertical grain or the far walls read as smeared paint
        L *= 1 + band * banding * 1.35;
        const marker = smoothstep(0.75, 0.95, Math.sin(v * 6.2 + warp * 0.4 + 0.6));
        L *= 1 - marker * banding * 0.65;
      }
      // faintly warm rock by default; alpine (winter) flips to a faintly COOL
      // cast — the warm bias stacked with the warm scene grade/haze and read
      // as tan desert stone framing a snow map (the r3 winter critique)
      let r = L * (coolRock ? 0.978 : 1);
      let gc = L * (coolRock ? 0.998 : 0.995);
      let b = L * (coolRock ? 1.022 : 0.975);
      if (treeline > 0 && v < treeline) {
        // conifer/broadleaf mottle on the lower flanks — dark green-shifted
        // blotches (two scales) + lighter clearing patches, so vegetated
        // ranges read as forest texture instead of striped rock
        const m = smoothstep(0.42, 0.85, wn(u, v, 58, 78, 33) * 0.5 + 0.5)
          + smoothstep(0.5, 0.9, wn(u, v, 21, 27, 71) * 0.5 + 0.5) * 0.6;
        const below = 1 - smoothstep(treeline * 0.72, treeline, v);
        const mw = Math.min(1, m) * below * 0.42;
        r *= 1 - mw * 1.1; gc *= 1 - mw * 0.45; b *= 1 - mw * 1.0;
        const clearing = smoothstep(0.62, 0.9, wn(u, v, 13, 15, 141) * 0.5 + 0.5) * below;
        r *= 1 + clearing * 0.10; gc *= 1 + clearing * 0.13; b *= 1 + clearing * 0.05;
        // r5: HUE/VALUE stand variation, three octaves — real forested hills
        // are a patchwork of species stands (yellow-green birch blocks, dark
        // blue-green spruce, hazier mixed slopes), never one uniform speckle
        const standA = wn(u, v, 9, 12, 217) * 0.5 + 0.5;   // ~40 m patches
        const standB = wn(u, v, 3.4, 4.5, 305) * 0.5 + 0.5; // ~110 m stands
        const standC = wn(u, v, 1.3, 1.8, 419) * 0.5 + 0.5; // whole-flank drift
        const warmW = smoothstep(0.56, 0.86, standB) * below;      // birch/larch stands
        r *= 1 + warmW * 0.16; gc *= 1 + warmW * 0.10; b *= 1 - warmW * 0.10;
        const darkW = smoothstep(0.60, 0.88, 1 - standA) * below;  // spruce blocks
        r *= 1 - darkW * 0.22; gc *= 1 - darkW * 0.12; b *= 1 - darkW * 0.08;
        const lift = (standC - 0.5) * 0.14 * below;                // broad value drift
        r *= 1 + lift; gc *= 1 + lift; b *= 1 + lift;
        // darkened valley creases: shaded drainage folds running downslope,
        // segmented so they never read as continuous paint streaks
        const cr = 1 - Math.abs(wn(u, v, 26, 2.2, 511));
        const crSeg = smoothstep(0.35, 0.7, wn(u, v, 17, 8, 623) * 0.5 + 0.5);
        const crease = smoothstep(0.82, 0.97, cr) * crSeg * below;
        r *= 1 - crease * 0.30; gc *= 1 - crease * 0.20; b *= 1 - crease * 0.22;
      }
      if (snowline <= 1) {
        const sw = smoothstep(snowline - 0.02, snowline + 0.09, v + wn(u, v, 24, 24, 51) * 0.05);
        // snow: flatten detail toward a cool white, keep faint wind texture
        // and let the strongest rock ribs pierce the caps
        const snowL = 1.03 + wn(u, v, 40, 50, 61) * 0.03 - gully * 0.12;
        r += (snowL * 0.98 - r) * sw * 0.94;
        gc += (snowL * 1.0 - gc) * sw * 0.94;
        b += (snowL * 1.04 - b) * sw * 0.94;
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
  t.anisotropy = 8; // far walls are seen at grazing angles — 4 still smeared
  // linear (non-sRGB): authored contrast passes through 1:1 and the 0.62
  // mid-gray recentres exactly with the material color multiplier below
  return t;
}

// ---------------------------------------------------------------------------
// Ridgeline tree-line texture (r5) — a repeating strip of conifer/broadleaf
// SILHOUETTES with alpha. Planted along the crest of the nearer ridge rows on
// vegetated styles: the loudest tell of the old backdrop was a perfectly
// smooth dome wrapped in speckle noise, where a real forested hill reads as a
// serrated tree line breaking the sky. Drawn in a neutral green-grey band and
// multiplied by per-vertex crest colors so haze/sun grading matches the ridge.
// ---------------------------------------------------------------------------
function makeTreeLineTexture(rng) {
  const w = 1024, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const base = h - 2;
  let x = 2;
  while (x < w - 12) {
    const conifer = rng() < 0.62;
    const tj = 0.62 + rng() * 0.55; // per-tree value jitter
    ctx.fillStyle = `rgb(${Math.round(126 * tj)},${Math.round(148 * tj)},${Math.round(116 * tj)})`;
    if (conifer) {
      const th = 80 + rng() * 150, tw = 18 + rng() * 26;
      const tiers = 3 + (rng() * 2 | 0);
      for (let t = 0; t < tiers; t++) {
        const ty = base - (th * (t + 1)) / tiers;
        const twt = tw * (1 - (t / tiers) * 0.72);
        ctx.beginPath();
        ctx.moveTo(x + tw / 2 - twt / 2, ty + (th / tiers) * 1.45);
        ctx.lineTo(x + tw / 2 + twt / 2, ty + (th / tiers) * 1.45);
        ctx.lineTo(x + tw / 2 + (rng() - 0.5) * 4, ty);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(x + tw / 2 - 2, base - th * 0.3, 4, th * 0.3 + 2);
      x += tw * (0.55 + rng() * 0.75);
    } else {
      const th = 66 + rng() * 104, tw = 28 + rng() * 42;
      const cy = base - th * 0.62;
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(x + tw / 2 + (rng() - 0.5) * tw * 0.5, cy + (rng() - 0.5) * th * 0.38,
          tw * (0.26 + rng() * 0.22), th * (0.18 + rng() * 0.14), rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillRect(x + tw / 2 - 2.5, base - th * 0.35, 5, th * 0.35 + 2);
      x += tw * (0.6 + rng() * 0.7);
    }
    if (rng() < 0.12) x += 18 + rng() * 46; // occasional clearing gap
  }
  // flood transparent texels with the mean tone so mips never halo dark
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) { d[i] = 112; d[i + 1] = 132; d[i + 2] = 104; }
  }
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
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

  const base = new THREE.Color(H.baseHex ?? 0x4a5a44);
  const fogC = new THREE.Color((cfg && cfg.sky && cfg.sky.fogTintHex) ?? 0x8fa3bd);
  // detail palette: sensible per-style defaults, overridable per map
  const rockC = new THREE.Color(H.rockHex ?? (style === 'mesa' ? 0x8a5a38 : 0x66625e));
  const snowC = new THREE.Color(H.snowHex ?? 0xeef2f7);
  const forestC = new THREE.Color(H.forestHex ?? 0x2e4230);
  const snowline = H.snowline ?? (style === 'alpine' ? 0.42 : 2); // >1 disables
  const treeline = H.treeline ?? (style === 'rolling' ? 0.55 : style === 'escarpment' ? 0.5 : 0);
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
  const rows = [
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
  ];

  const nv = N * rows.length;
  const pos = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const uvA = new Float32Array(nv * 2);
  const hs = new Float32Array(nv);
  let maxH = 1;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const jr = row.r * (1 + 0.03 * noi.noise(Math.cos(a) * 4 + ri * 13, Math.sin(a) * 4 - ri * 7));
      let hh;
      if (row.skirt) {
        hh = row.base + (noi.noise(Math.cos(a) * row.f0, Math.sin(a) * row.f0) * 0.5 + 0.5) * row.amp;
      } else {
        hh = profile(a, noi, row);
      }
      hh *= amp;
      const i = ri * N + k;
      hs[i] = hh;
      if (!row.skirt && hh > maxH) maxH = hh;
      pos[i * 3] = Math.cos(a) * jr;
      pos[i * 3 + 1] = hh;
      pos[i * 3 + 2] = Math.sin(a) * jr;
    }
  }
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
  const sunX = Math.sin(sunAz), sunZ = Math.cos(sunAz);
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
  const sunA = new Float32Array(nv);
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const i = ri * N + k;
      const hPrev = hsS[ri * N + ((k - 1 + N) % N)];
      const hNext = hsS[ri * N + ((k + 1) % N)];
      const dTang = (hNext - hPrev) / (2 * Math.PI * row.r / N * 2); // dh/darc
      const hIn = ri > 0 ? hsS[(ri - 1) * N + k] : hsS[i];
      const hOut = ri < rows.length - 1 ? hsS[(ri + 1) * N + k] : hsS[i];
      const dRad = (hOut - hIn) / (((ri < rows.length - 1 ? rows[ri + 1].r : row.r) -
        (ri > 0 ? rows[ri - 1].r : row.r)) || 1);
      slopeA[i] = clamp(Math.hypot(dTang, dRad * 2.2) * 1.6, 0, 1);
      // sun response: horizontal normal component along the ring tangent is
      // -dh/darc — continuous, so flanks shade smoothly instead of flipping
      const st = -Math.sin(a) * sunX + Math.cos(a) * sunZ; // sun · tangent
      sunA[i] = clamp(-dTang * st * 2.4, -1, 1);
    }
  }
  for (let pass = 0; pass < 5; pass++) {
    for (let ri = 0; ri < rows.length; ri++) {
      const ps = slopeA.slice(ri * N, ri * N + N);
      const pu = sunA.slice(ri * N, ri * N + N);
      for (let k = 0; k < N; k++) {
        const km = (k - 1 + N) % N, kp = (k + 1) % N;
        slopeA[ri * N + k] = ps[km] * 0.27 + ps[k] * 0.46 + ps[kp] * 0.27;
        sunA[ri * N + k] = pu[km] * 0.27 + pu[k] * 0.46 + pu[kp] * 0.27;
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
      const sunFace = sunA[i];

      c.copy(base);
      // altitude tone drift: valleys slightly deeper, crests lighter
      c.multiplyScalar(0.82 + t * 0.34);
      // steep faces expose rock
      const rockW = smoothstep(0.34, 0.8, slope) * (row.skirt ? 0.25 : rockAmp);
      c.lerp(rockC, rockW);
      // forest band on the lower flanks (rolling / escarpment)
      if (treeline > 0) {
        const fw = (1 - smoothstep(treeline * 0.55, treeline, t)) * (1 - slope * 0.4) *
          (0.5 + 0.5 * (gnoi.noise(Math.cos(a) * 7 + 3, Math.sin(a) * 7 + ri) * 0.5 + 0.5));
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
        const hold = 1 - smoothstep(0.45, 0.9, slope); // cliffs shed snow
        c.lerp(snowC, clamp(band * 0.95 + (1 - band) * 0.38, 0, 1) * hold);
      }
      // baked sun/shade on the ridge flanks
      c.multiplyScalar(1 + sunFace * (row.skirt ? 0.04 : shadeAmp));
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
  const gullyAmp = style === 'alpine' ? 0.32 : style === 'mesa' ? 0.38 : 0.07;
  const detailTex = makeHorizonTexture(gnoi, {
    banding, snowline, treeline, grainAmp, gullyAmp, coolRock: style === 'alpine',
  });
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, map: detailTex,
  }); // unlit; scene fog still applies
  mat.color.setRGB(1.61, 1.61, 1.61);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'horizon-ring';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  // GTAO's depth-edge pass draws dark halo slashes along distant ridge
  // silhouettes — exclude the backdrop like the other flat-lit world layers
  mesh.userData.aoExclude = true;

  // --- ridgeline tree combs (r5, vegetated styles only) ---------------------
  // Alpha-tested tree-silhouette ribbons planted along the crest of every
  // ridge row below the treeline: the skyline breaks into serrated forest
  // instead of smooth painted domes. Ribbons follow the exact crest vertices
  // and inherit their vertex colors (x ~1.5 against a ~0.53-mean texture, so
  // trees sit slightly darker than the flank they stand on and pick up the
  // same haze/sun grading).
  if (treeline > 0) {
    const trng = mulberry32(((seed ^ 0x5EED) ^ idHash(mapId)) >>> 0);
    const combTex = makeTreeLineTexture(trng);
    const combRows = [2, 3, 4];
    const tlH = treeline * maxH;
    const cPos = [], cCol = [], cUv = [], cIdx = [];
    let vBase = 0;
    for (const ri of combRows) {
      const row = rows[ri];
      const repeats = Math.max(8, Math.round((Math.PI * 2 * row.r) / 92));
      for (let k = 0; k <= N; k++) {  // N+1 columns: seam-free u wrap
        const kk = k % N;
        const i = ri * N + kk;
        const x = pos[i * 3], hh = pos[i * 3 + 1], z = pos[i * 3 + 2];
        // trees thin toward the treeline, vanish above it; strip degenerates
        // to a hidden zero-height line where faded out
        const fade = 1 - smoothstep(tlH * 0.8, tlH * 1.12, hh);
        const a = (kk / N) * Math.PI * 2;
        const hn = gnoi.noise(Math.cos(a) * 5.3 + ri * 9, Math.sin(a) * 5.3 - ri * 5) * 0.5 + 0.5;
        const span = (5 + 10 + hn * 15) * fade; // buried 5 m + 10-25 m of crowns
        const inw = 0.995; // plant just inside the crest line
        cPos.push(x * inw, hh - 5, z * inw, x * inw, hh - 5 + span, z * inw);
        const cr = Math.min(1.4, col[i * 3] * 1.5);
        const cg = Math.min(1.4, col[i * 3 + 1] * 1.5);
        const cb = Math.min(1.4, col[i * 3 + 2] * 1.5);
        cCol.push(cr, cg, cb, cr, cg, cb);
        const u = (k / N) * repeats;
        cUv.push(u, 0, u, 1);
      }
      for (let k = 0; k < N; k++) {
        const b0 = vBase + k * 2, t0 = b0 + 1, b1 = b0 + 2, t1 = b1 + 1;
        cIdx.push(b0, b1, t0, t0, b1, t1);
      }
      vBase += (N + 1) * 2;
    }
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cPos), 3));
    cGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cCol), 3));
    cGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cUv), 2));
    cGeo.setIndex(cIdx);
    const cMat = new THREE.MeshBasicMaterial({
      map: combTex, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide,
    });
    const comb = new THREE.Mesh(cGeo, cMat);
    comb.name = 'horizon-treeline';
    comb.castShadow = false;
    comb.receiveShadow = false;
    comb.matrixAutoUpdate = false;
    comb.userData.aoExclude = true;
    mesh.add(comb);
  }
  return mesh;
}
