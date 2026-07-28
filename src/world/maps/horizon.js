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
  // glacial ranges REBUILT (r7): multi-octave ridged FBM under a massif
  // envelope. The r6 profile shaped every summit from ONE ridged frequency
  // cubed — straight-flanked triangles at near-even spacing, the critic's
  // "1990s midpoint-displacement sawtooth". Four ridged octaves, each with
  // its own domain warp and each riding ON the main ridge, give fractal
  // flanks with secondary spurs, couloirs and shoulder benches; peak
  // sharpness, height and spacing all wander independently around the ring
  // so no two summits repeat.
  alpine(a, noi, row) {
    // per-octave domain warp: wavelength/spacing wander around the ring
    const w1 = noi.noise(Math.cos(a) * 1.9 + 55, Math.sin(a) * 1.9 - 41) * 0.16;
    const w2 = noi.noise(Math.cos(a) * 3.1 - 12, Math.sin(a) * 3.1 + 29) * 0.07;
    const aw = a + w1, aw2 = a + w1 * 0.6 + w2;
    // massif envelope (~2 wavelengths around the ring): tall ranges vs
    // saddle stretches at ~55% height
    const env = noi.noise(Math.cos(a) * 0.62 + 3.1, Math.sin(a) * 0.62 - 8.7) * 0.5 + 0.5;
    const mass = 0.55 + 0.65 * smoothstep(0.20, 0.84, env);
    // peak-shape selector, independent slow noise: 0 = rounded shoulder
    // domes, 1 = sharp glacial horns — so neighbouring summits differ
    const sel = smoothstep(0.28, 0.72, noi.noise(Math.cos(a) * 1.15 - 14.2, Math.sin(a) * 1.15 + 6.4) * 0.5 + 0.5);
    const R = (ang, f, off) => 1 - Math.abs(noi.noise(Math.cos(ang) * f + off, Math.sin(ang) * f - off * 0.7));
    const o1 = R(aw, row.f0, 21);
    const o2 = R(aw2, row.f0 * 2.15, 57);
    const o3 = R(aw, row.f0 * 4.4, 93);
    const o4 = R(aw2, row.f0 * 8.9, 131);
    // main ridge NEVER cubed (pow 1.5 dome country -> 2.4 horn country);
    // finer octaves are amplitude-keyed to the main ridge so spurs grow out
    // of the massifs instead of filling the saddles with even chop
    const main = Math.pow(o1, 1.5 + sel * 0.9);
    const h = main * 0.60
      + o2 * o2 * 0.20 * (0.45 + 0.55 * o1)
      + o3 * 0.10 * (0.35 + 0.65 * o1)
      + o4 * 0.05 * (0.30 + 0.70 * o1);
    // per-peak amplitude jitter: neighbouring summits differ in height, not
    // just shape, so the ring never settles into an even-spaced comb
    const ampJit = 0.76 + 0.48 * (noi.noise(Math.cos(a) * 2.6 - 44, Math.sin(a) * 2.6 + 71) * 0.5 + 0.5);
    return row.base + h * mass * ampJit * row.amp * 1.15;
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
        const sast = wn(u, v, 52, 17, 361) * 0.5 + wn(u, v, 21, 7, 409) * 0.5;
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
        const snowL = 1.03 + sast * 0.26 + basin * 0.34 + spur * 0.18
          - gully * 0.18 - ribRaw * ribMask * seg * 0.30;
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
  t.anisotropy = treeline > 0 ? 2 : (banding > 0.003 ? 16 : 4);
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
// Ridgeline tree-line texture (r5) — a repeating strip of conifer/broadleaf
// SILHOUETTES with alpha. Planted along the crest of the nearer ridge rows on
// vegetated styles: the loudest tell of the old backdrop was a perfectly
// smooth dome wrapped in speckle noise, where a real forested hill reads as a
// serrated tree line breaking the sky. Drawn in a neutral green-grey band and
// multiplied by per-vertex crest colors so haze/sun grading matches the ridge.
// ---------------------------------------------------------------------------
function makeTreeLineTexture(rng) {
  // controls_gunnery r5: 1024x256 -> 2048x320 (2x u-resolution — at x8 one
  // 56 m repeat spans several hundred screen px and the old texels smeared),
  // and every tree carries INTERNAL shading — sun-lit upper tiers/crown lobes
  // over a darker shadow core — so the magnified skyline reads as lit forest
  // depth instead of flat paper cutouts.
  const w = 2048, h = 320;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const base = h - 2;
  const ink = (tone) =>
    `rgb(${Math.round(126 * tone)},${Math.round(148 * tone)},${Math.round(116 * tone)})`;
  // r8 FOREST MASS BAND: two depth layers of overlapping crown lobes filling
  // the lower ~35% of the strip as a CONTINUOUS closed-canopy mass. Spaced
  // individual silhouettes alone minify to isolated 1-2 px "toothpick" dashes
  // along every distant ridgeline (critique: "model-railway diorama, no
  // coherent forest mass past ~800 m"); a real forested crest is a solid
  // serrated band with emergent crowns — the trees drawn after this become
  // those emergents. Band height wanders and dips (never to zero) so
  // clearings read as low scrub saddles, not bald crest.
  for (let layer = 0; layer < 2; layer++) {
    const tone0 = layer === 0 ? 0.52 : 0.72; // back layer darker (depth)
    const hTop = layer === 0 ? 0.50 : 0.36;  // fraction of strip height
    let bx = -20;
    let bh = h * hTop * (0.75 + rng() * 0.4);
    while (bx < w + 20) {
      const cw = 30 + rng() * 52;
      bh = clamp(bh + (rng() - 0.5) * h * 0.09, h * 0.09, h * hTop);
      const rY = bh * 0.55;
      // hud_ui r6: each canopy cell is 3 overlapping jittered lobes instead
      // of ONE clean ellipse — at x8 sniper magnification the single-ellipse
      // band read as smooth paper-cutout blobs; broken lobed edges read as
      // crown texture.
      for (let lb = 0; lb < 3; lb++) {
        const ox = (rng() - 0.5) * cw * 0.5;
        const oy = (rng() - 0.3) * rY * 0.5;
        ctx.fillStyle = ink(tone0 * (0.78 + rng() * 0.44));
        ctx.beginPath();
        ctx.ellipse(bx + cw / 2 + ox, base - bh + rY + oy,
          cw * (0.34 + rng() * 0.30), rY * (0.55 + rng() * 0.40),
          rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      bx += cw * (0.42 + rng() * 0.30);
    }
  }
  let x = 2;
  while (x < w - 24) {
    const conifer = rng() < 0.62;
    const tj = 0.62 + rng() * 0.55; // per-tree value jitter
    if (conifer) {
      // hud_ui r6: cap the height/width aspect near 4:1 (was up to ~12:1) —
      // the old needle spires magnified into bare flagpoles poking out of
      // the canopy at x8 sniper zoom, the single loudest cardboard tell.
      const tw = 30 + rng() * 40;
      const th = Math.min(84 + rng() * 132, tw * (3.4 + rng() * 0.9));
      const tiers = 3 + (rng() * 2 | 0);
      for (let t = 0; t < tiers; t++) {
        const ty = base - (th * (t + 1)) / tiers;
        const twt = tw * (1 - (t / tiers) * 0.72);
        // shading: shadowed lower skirts -> lit upper tiers (top-down sun)
        ctx.fillStyle = ink(tj * (0.74 + 0.42 * (t / Math.max(1, tiers - 1))));
        ctx.beginPath();
        ctx.moveTo(x + tw / 2 - twt / 2, ty + (th / tiers) * 1.45);
        ctx.lineTo(x + tw / 2 + twt / 2, ty + (th / tiers) * 1.45);
        ctx.lineTo(x + tw / 2 + (rng() - 0.5) * 5, ty);
        ctx.closePath();
        ctx.fill();
      }
      // dark interior core keeps the silhouette from reading as a flat wash
      ctx.fillStyle = ink(tj * 0.6);
      ctx.fillRect(x + tw / 2 - tw * 0.09, base - th * 0.72, tw * 0.18, th * 0.5);
      ctx.fillStyle = ink(tj * 0.62);
      ctx.fillRect(x + tw / 2 - 2.5, base - th * 0.3, 5, th * 0.3 + 2);
      x += tw * (0.55 + rng() * 0.75);
    } else {
      const th = 82 + rng() * 130, tw = 35 + rng() * 52;
      const cy = base - th * 0.62;
      for (let k = 0; k < 6; k++) {
        const ox = (rng() - 0.5) * tw * 0.5;
        const oy = (rng() - 0.5) * th * 0.38;
        // shading: upper/left lobes lit, lower lobes in crown shadow
        const lit = 0.78 - (oy / (th * 0.38)) * 0.28 - (ox / (tw * 0.5)) * 0.10;
        ctx.fillStyle = ink(tj * clamp(lit, 0.5, 1.15));
        ctx.beginPath();
        ctx.ellipse(x + tw / 2 + ox, cy + oy,
          tw * (0.26 + rng() * 0.22), th * (0.18 + rng() * 0.14), rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = ink(tj * 0.58);
      ctx.fillRect(x + tw / 2 - 3, base - th * 0.35, 6, th * 0.35 + 2);
      x += tw * (0.6 + rng() * 0.7);
    }
    if (rng() < 0.12) x += 22 + rng() * 58; // occasional clearing gap
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

  const base = new THREE.Color(H.baseHex ?? 0x4a5a44);
  const fogC = new THREE.Color((cfg && cfg.sky && cfg.sky.fogTintHex) ?? 0x8fa3bd);
  // detail palette: sensible per-style defaults, overridable per map
  const rockC = new THREE.Color(H.rockHex ?? (style === 'mesa' ? 0x8a5a38 : 0x66625e));
  const snowC = new THREE.Color(H.snowHex ?? 0xeef2f7);
  const forestC = new THREE.Color(H.forestHex ?? 0x2e4230);
  const snowline = H.snowline ?? (style === 'alpine' ? 0.42 : 2); // >1 disables
  // r7: vegetated default treelines pushed near the crests (0.55/0.5 ->
  // 0.90/0.88). The old constant-altitude cutoff drew a horizontal band
  // across every hill where forest texture gave way to smooth bald ramp —
  // the critic's "artificial terrace band" + "bald gradient slopes". At
  // these view distances real hill country reads forested to the summit.
  const treeline = H.treeline ?? (style === 'rolling' ? 0.90 : style === 'escarpment' ? 0.88 : 0);
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
  };
  const rows = ROWS_BY_STYLE[style] || ROWS_BY_STYLE.default;

  const nv = N * rows.length;
  const pos = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const uvA = new Float32Array(nv * 2);
  const hs = new Float32Array(nv);
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
  const ROW_RIM_MARGIN = [-34, 22, 95, 280, 520, 800];
  // <<< gameplay_feel r4 ------------------------------------------------------
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
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
        const relAmp = row.skirt ? 0.08 :
          (style === 'alpine' || style === 'mesa' ? 0.34 : 0.26);
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
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail2 = { value: detail2 };
      // onBeforeCompile uniforms are NOT auto-declared in the GLSL —
      // declared at global scope ahead of the injected block.
      shader.fragmentShader = 'uniform sampler2D uDetail2;\n' +
        shader.fragmentShader.replace(
          '#include <map_fragment>', /* glsl */`#include <map_fragment>
        {
          float dA = texture2D(uDetail2, vMapUv * vec2(64.0, 26.0)).r - 0.5;
          float dB = texture2D(uDetail2, vMapUv * vec2(17.0, 7.0) + vec2(0.37, 0.11)).r - 0.5;
          // amplitudes sized to SURVIVE the baked haze lerp + scene fog: the
          // wall multiplies this onto an already fog-flattened vertex color,
          // so ±0.1 authored contrast reads as ~±0.04 on screen (still-flat
          // first cut). ±0.29 lands at the crown-mottle read real hills give.
          diffuseColor.rgb *= 1.0 + dA * 0.28 + dB * 0.30;
        }`);
    };
    mat.customProgramCacheKey = () => 'horizon-ring-detail2-r5';
  }
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
    // r6: comb the outermost ridge too — every vegetated crest silhouette
    // carries a serrated tree line, and the recession shells read forested
    // all the way out instead of going bald past row 4
    const combRows = [2, 3, 4, 5];
    const tlH = treeline * maxH;
    const cPos = [], cCol = [], cUv = [], cIdx = [];
    let vBase = 0;
    // controls_gunnery r5: every comb row plants TWO ranks — the crest ribbon
    // plus a BACK rank just outside and below the crest (u phase-shifted,
    // hazier, ~15% shorter). Its crowns peek through the front rank's gaps
    // and dips, so at x8 the skyline reads as layered forest DEPTH instead of
    // one paper-cutout strip glued to the ridge line.
    const ranks = [];
    for (const ri of combRows) ranks.push([ri, 0], [ri, 1]);
    for (const [ri, back] of ranks) {
      const row = rows[ri];
      // r6: 92 -> 72 m per texture repeat — denser tree combs so the crest
      // reads as closed forest, not scattered lollipops along a bare rim
      // lighting_post r3: 72 -> 56 m per repeat keeps density while the comb
      // span drops to real conifer scale (8-20 m crowns, was 12-30 m)
      const repeats = Math.max(8, Math.round((Math.PI * 2 * row.r) / 56));
      for (let k = 0; k <= N; k++) {  // N+1 columns: seam-free u wrap
        const kk = k % N;
        const i = ri * N + kk;
        const x = pos[i * 3], hh = pos[i * 3 + 1], z = pos[i * 3 + 2];
        // trees thin toward the treeline, vanish above it; strip degenerates
        // to a hidden zero-height line where faded out
        const fade = 1 - smoothstep(tlH * 0.8, tlH * 1.12, hh);
        const a = (kk / N) * Math.PI * 2;
        const hn = gnoi.noise(Math.cos(a) * 5.3 + ri * 9 + back * 3.7,
          Math.sin(a) * 5.3 - ri * 5 - back * 2.9) * 0.5 + 0.5;
        // r7: crown span scales with row radius so far-ring combs keep their
        // angular weight — distant ridges must read forested, not stubbled
        const span = (5 + (8 + hn * 12) * (0.85 + row.r / 2600)) * fade *
          (back ? 0.85 : 1);
        const inw = back ? 1.004 : 0.995; // back rank behind the crest line
        const drop = back ? 5 + span * 0.4 : 5;
        cPos.push(x * inw, hh - drop, z * inw, x * inw, hh - drop + span, z * inw);
        // lighting_post r3: combs inherit extra aerial haze (row.aer * 0.5)
        // so distant tree lines melt into the ridge instead of popping darker
        // in front of it (r5: the back rank gets an extra step of haze)
        const hz = Math.min(0.9, row.aer * 0.5 + (back ? 0.22 : 0));
        let cr = Math.min(1.4, col[i * 3] * (back ? 1.32 : 1.5));
        let cg = Math.min(1.4, col[i * 3 + 1] * (back ? 1.32 : 1.5));
        let cb = Math.min(1.4, col[i * 3 + 2] * (back ? 1.32 : 1.5));
        cr += (fogC.r - cr) * hz;
        cg += (fogC.g - cg) * hz;
        cb += (fogC.b - cb) * hz;
        cCol.push(cr, cg, cb, cr, cg, cb);
        const u = (k / N) * repeats + (back ? 0.5 : 0); // de-correlate ranks
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
