// The far horizon panorama (the mountains lane, 2026-10-03; the owner: "i literally just see a treeline and then nothing
// transitioning and going into mountains or stuff beyond border. and the shapes need to be so much better, and
// textures"). The far ranges' (1.9-3.3 km) live mesh carried six rows and 431 columns — a column spans 15 screen
// pixels at 2.5 km, so no shading law could give it the ridgelines, cols, valleys, strata, scree and snowfields a range
// shows from the ground. The far country is BAKED instead, the way commercial tank games paint their backdrops:
//
//  1. a polar height grid over the annulus 1.5-9 km (log-spaced rows, so the grid's rows stand about as far apart on
//     screen as its columns): the character's far field — a warped ridged multifractal (the crest lines, the spurs off
//     them, the cols where they meet), Quilez's eroded octaves (smooth valleys, sharp spurs) and Clay John's gullies
//     across the local slope (the couloirs that stripe a face), under a distance envelope (foothills by the ring, the
//     ranges from about 3 km), valleys between the ranges, a slow envelope round the horizon, the tablelands' caprock
//     and beds, the sea sectors open; its first kilometre eases out of the ring's own outer heights;
//  2. the grid's light: the map's sun with its cast shadows (a soft march over the grid) and the sky's occlusion;
//  3. the strip: per texel of a cylindrical atlas (azimuth x elevation from the bake eye), the first grid row whose
//     elevation angle reaches the texel's, its surface law (rock strata on the faces, scree on the moderate slopes below
//     them, snow on the slopes that hold it above the snowline, stands and clearings of the map's forest on the lower
//     flanks, a slow colour variation) lit by the sun and the sky, graded toward the fog colour for the air past the
//     shell, transparent above the cloud deck, the sky and the open sea.
//
// The strip is drawn by ONE mesh: an apron from the ring's outer edge out to the shell (2.6 km) and the shell's wall,
// sampling the atlas by direction from the bake eye — 3.4k triangles (fewer than the round-72 far range's 4.3k it stands
// in for), no per-frame CPU, one atlas fetch per fragment.
// The bake runs where a renderer exists (the world's impostor warm-up under the loading cover; the first update
// otherwise), re-bakes after a GPU suspension disposes the atlas, and until it has baked the round-72 far range stays
// on (the receipts, a renderer without float targets). Desktop tier only: the mobile tier has no far range.
import * as THREE from 'three';
import { HAZE_EXT_CHROMA, HAZE_LAW_GLSL, hazeLayerInverseScale, hazeSigma, hazeTargetTerms } from '../engine/hazeLaw.ts';
import { SEA_APRON_OUTER_RADIUS_M, type SeaOpening } from './edgeWater.ts';
import type { HorizonReliefCharacter } from './horizonRelief.ts';

const DEG = Math.PI / 180;

/** The panorama's frame: the annulus it bakes, the shell it is shown on, the eye it is baked from, the strip. */
export const HORIZON_PANORAMA = Object.freeze({
  innerM: 1500, outerM: 9000, shellM: 2600, eyeY: 30,
  elevMin: -3 * DEG, elevMax: 22 * DEG,
  width: 8192, height: 512,
  gridA: 4096, gridR: 256,
  /** the apron's rows between the ring's outer edge and the shell (m out from the centre) and the wall's elevations:
   * its foot and its top only — a column's wall vertices stand on one vertical line and the fragment takes its own
   * direction from the eye, so rows between them drew triangles without changing a pixel */
  apronM: [1900, 2300] as readonly number[],
  wallElevDeg: [-4, 22] as readonly number[],
  /** the farthest the shell's edge row stands out over a sea opening (m; the wall 160 m past it). The scene depth the
   * cloud layer composites against is the shell's, not the far shore's painted on it, and its sea fog bank starts at
   * 3.6 km (CLOUD_FOGBANK_RANGE_M) — paired capture d6: a shell at 4.5 km over Saltwind's channel took the bank,
   * integrated to its far range, over the far shore (pale slabs with sheer ends, a box of cloud in the range) */
  seaEdgeMaxM: 3200,
});

/** The far country's vocabulary per relief character (amplitudes in m; wavelengths in m). */
export interface HorizonPanoramaCharacter {
  ampM: number; foot: number; macroL: number; sharp: number; midL: number; gullyL: number; gullyM: number;
  warpM: number; valley: number; valleyL: number; snowline: number; treeline: number; rockSlope: number;
  bedM: number; strata: number; tables: boolean;
  /** the far ranges' extra rise past 4 km (the hill countries' low mountains behind their hills) */
  farRise: number;
  /** 0..1: how far the ranges past ~3.5 km rise to stand a margin above the ring's own skyline from the battlefield
   * (the layers behind the ring); 0 leaves the far field as it falls */
  layers: number;
  /** true: the layers rise as a broad upland plinth under the far country's own hills (the hill countries: their slopes
   * stay gentle, wooded and farmed); false: the ranges' relief is scaled (the mountain countries: steeper, rockier) */
  plinth: boolean;
  /** the far shore across a sea sector (a channel coast: the mainland or the islands across the water, as seen from the
   * Dalmatian islands): the share of the far country's own height it rises to; 0 keeps the sector open sea to the
   * horizon (the ocean coasts) */
  shore: number;
  /** the channel: the far shore's distance from the battlefield's centre (m; it wanders 1.1 km either way) */
  shoreM: number;
  /** the coastal range behind the far shore (the mainland's front ranges along the coast), as a share of the far
   * country's envelope; 0: the far shore is the far country's own relief only */
  shoreRange: number;
  /** the canopy (m) of the far country's tree lines, shelterbelts and woods, standing on its ground (the flat and the
   * rolling countries' skyline is its trees, not its relief); 0: none */
  trees: number;
  /** a tableland's profile: its talus apron's width (m) and its share of the height, the caprock cliff's width (m), the
   * rim's alcoves and spurs (m) — a broad apron and a short cliff for eroded mesas, a short apron and a sheer fluted wall
   * for the sandstone jebels */
  mesaTalusM: number; mesaTalusShare: number; mesaCliffM: number; mesaFluteM: number;
  /** sparse isolated peaks over the far field: the share of 2.6 km cells holding one, its height (m), its radius (m) and
   * its profile's sharpness (about 1 a rounded cone, 2 a sharp nunatak); 0 share: none */
  peakShare: number; peakM: number; peakRadiusM: number; peakSharp: number;
  /** the slope (1 - n.y) where the forest begins to give way to bare ground (gone 0.23 steeper): a temperate hill's
   * woods stop on the steep faces; a monsoon hill country's forest climbs them */
  forestSlope: number;
  /** sheer jebels standing alone on the plain (maps lane A's inselberg section, horizonJebelSection): the share of
   * 2.6 km cells holding one, its height (m), its radius (m), the wall's foot and the cap's rim (fractions of the radius
   * and of the foot), the talus apron's share of the height, the flutes round the wall and their depth, the cap's
   * bosses (m) and the foot's wander; 0 share: none */
  jebelShare: number; jebelM: number; jebelRadiusM: number; jebelFoot: number; jebelRim: number; jebelApron: number;
  jebelFlutes: number; jebelFluteDepth: number; jebelBossM: number; jebelFootVary: number;
  /** desert varnish down the jebels' walls: the darkening of its streaks (0: none) */
  jebelVarnish: number;
}

/** The knobs most characters leave at rest: open sea, no tree canopy, the eroded mesa's profile, no isolated peaks. */
const PANO_EXTRAS = Object.freeze({
  shore: 0, shoreM: 5600, shoreRange: 0, trees: 0,
  mesaTalusM: 700, mesaTalusShare: 0.55, mesaCliffM: 50, mesaFluteM: 45,
  peakShare: 0, peakM: 0, peakRadiusM: 600, peakSharp: 1.5,
  forestSlope: 0.32,
  jebelShare: 0, jebelM: 0, jebelRadiusM: 900, jebelFoot: 0.66, jebelRim: 0.86, jebelApron: 0.18,
  jebelFlutes: 16, jebelFluteDepth: 0.5, jebelBossM: 0, jebelFootVary: 0.14, jebelVarnish: 0,
});

/** Maps lane A's sheer jebel (landformGeology.ts inselbergSection with a rim, origin/visual/maps-layouts ca018e38e):
 * the cap's fall from its crown to its rim, as a share of the height. */
export const HORIZON_JEBEL_CAP_DROP = 0.08;
/**
 * A sheer jebel's section, ported from maps lane A's inselbergSection (with a rim) for the far bake: a gently domed cap
 * out to `rim` of the wall's foot, a sheer wall (a smoothstep fall) down to the foot `foot` (fractions of the radius),
 * then a concave talus apron `apron` (a share of the height) high at the foot and thinning to the plain at q = 1. The
 * bake's GLSL (HORIZON_JEBEL_SECTION_GLSL) is the same law; receipts check the two against each other.
 */
export function horizonJebelSection(q: number, foot: number, apron: number, rim: number): number {
  if (q >= 1) return 0;
  const top = foot * rim;
  if (q <= top) return 1 - HORIZON_JEBEL_CAP_DROP * (q / top) ** 2;
  if (q <= foot) {
    const t = (q - top) / (foot - top);
    return apron + (1 - HORIZON_JEBEL_CAP_DROP - apron) * (1 - t * t * (3 - 2 * t));
  }
  const t = (1 - q) / (1 - foot);
  return apron * t * t;
}
const HORIZON_JEBEL_SECTION_GLSL = /* glsl */`
float jebelSection(float q, float foot, float apron, float rim) {
  if (q >= 1.0) return 0.0;
  float top = foot * rim;
  if (q <= top) return 1.0 - ${HORIZON_JEBEL_CAP_DROP.toFixed(4)} * (q / top) * (q / top);
  if (q <= foot) { float t = (q - top) / (foot - top); return apron + (${(1 - HORIZON_JEBEL_CAP_DROP).toFixed(4)} - apron) * (1.0 - t * t * (3.0 - 2.0 * t)); }
  float t = (1.0 - q) / (1.0 - foot);
  return apron * t * t;
}
`;

export const HORIZON_PANORAMA_CHARACTERS: Readonly<Record<HorizonReliefCharacter, HorizonPanoramaCharacter>> = Object.freeze({
  alpine: { ampM: 1700, foot: 0.16, macroL: 5200, sharp: 1.45, midL: 1500, gullyL: 520, gullyM: 55, warpM: 900, valley: 0.4, valleyL: 7500, snowline: 0.40, treeline: 0.22, rockSlope: 0.30, bedM: 70, strata: 0.10, tables: false, farRise: 0, layers: 1, plinth: false, ...PANO_EXTRAS },
  polar: { ampM: 1300, foot: 0.18, macroL: 5800, sharp: 1.3, midL: 1700, gullyL: 560, gullyM: 45, warpM: 1000, valley: 0.4, valleyL: 8000, snowline: 0.05, treeline: 0.10, rockSlope: 0.34, bedM: 80, strata: 0.08, tables: false, farRise: 0, layers: 1, plinth: false, ...PANO_EXTRAS },
  rolling: { ampM: 620, foot: 0.24, macroL: 5600, sharp: 1.3, midL: 1600, gullyL: 450, gullyM: 60, warpM: 1100, valley: 0.35, valleyL: 8500, snowline: 2, treeline: 0.85, rockSlope: 0.42, bedM: 60, strata: 0.05, tables: false, farRise: 1.1, layers: 1, plinth: true, ...PANO_EXTRAS },
  coastal: { ampM: 520, foot: 0.24, macroL: 5400, sharp: 1.3, midL: 1500, gullyL: 450, gullyM: 55, warpM: 1100, valley: 0.35, valleyL: 8500, snowline: 2, treeline: 0.80, rockSlope: 0.40, bedM: 50, strata: 0.06, tables: false, farRise: 0.9, layers: 1, plinth: true, ...PANO_EXTRAS },
  volcanic: { ampM: 1300, foot: 0.2, macroL: 5000, sharp: 1.3, midL: 1400, gullyL: 420, gullyM: 45, warpM: 800, valley: 0.4, valleyL: 7500, snowline: 2, treeline: 0.35, rockSlope: 0.32, bedM: 40, strata: 0.16, tables: false, farRise: 0, layers: 1, plinth: false, ...PANO_EXTRAS },
  karst: { ampM: 760, foot: 0.26, macroL: 2600, sharp: 2.2, midL: 900, gullyL: 300, gullyM: 30, warpM: 400, valley: 0.5, valleyL: 5500, snowline: 2, treeline: 0.95, rockSlope: 0.36, bedM: 30, strata: 0.12, tables: false, farRise: 0.3, layers: 1, plinth: false, ...PANO_EXTRAS },
  mesa: { ampM: 900, foot: 0.24, macroL: 6000, sharp: 1.0, midL: 2000, gullyL: 500, gullyM: 30, warpM: 900, valley: 0.3, valleyL: 7000, snowline: 2, treeline: 0, rockSlope: 0.30, bedM: 46, strata: 0.32, tables: true, farRise: 0, layers: 1, plinth: false, ...PANO_EXTRAS },
  martian: { ampM: 1300, foot: 0.24, macroL: 7000, sharp: 1.0, midL: 2400, gullyL: 600, gullyM: 35, warpM: 1100, valley: 0.5, valleyL: 8500, snowline: 2, treeline: 0, rockSlope: 0.30, bedM: 60, strata: 0.26, tables: true, farRise: 0, layers: 1, plinth: false, ...PANO_EXTRAS },
});

export interface HorizonPanoramaPalette { base: THREE.Color; rock: THREE.Color; snow: THREE.Color; forest: THREE.Color; fog: THREE.Color }

export interface HorizonPanoramaOptions {
  seed: number;
  character: HorizonReliefCharacter;
  /** per-map overrides of the character's knobs */
  overrides?: Partial<HorizonPanoramaCharacter>;
  palette: HorizonPanoramaPalette;
  /** the map's sun (unit vector), its gains (horizon.ts resolveHorizonLightingGains) */
  sun: readonly [number, number, number];
  gains: { ambient: number; sunGain: number };
  /** the lower of the map's cloud bases (m): the strip is open sky above it */
  deckBaseM: number;
  seaOpenings: readonly SeaOpening[];
  /** the sea weight per azimuth (0..1, the far range's law) and the sea level per azimuth (m) */
  seaWeightAt?: (angle: number) => { weight: number; level: number };
  /** the ring's outer edge: its last row's heights round the ring (431 columns), the panorama's first kilometre eases
   * out of them */
  ringEdge: { columns: number; positions: Float32Array; heights: Float32Array };
  /** the ring's own snowline and treeline as altitudes (m), so the far country's snow and forest meet the ring's; null
   * keeps the character's (fractions of its amplitude) */
  snowlineM?: number | null;
  treelineM?: number | null;
  /** the probes' smaller bake (a CPU renderer); production bakes at HORIZON_PANORAMA's sizes */
  resolution?: { width: number; height: number; gridA: number; gridR: number };
  /** the map's authored fogDensity: the shared haze law's σ (hazeLaw.ts) for the far country past the shell */
  fogDensity?: number | null;
  /** the map's own overcast fraction (lightModelCore resolveOvercast of its sky and cloudscape): the haze target's terms
   * under its deck — the light model the battlefield publishes can still be the last map's when the bake runs */
  overcast?: number | null;
}

/** How many frames a bake waits for the battlefield to publish this map's own sky before it keeps its own air. */
const HORIZON_PANORAMA_SKY_WAIT_FRAMES = 120;

/** What the bake reads of the sky the battlefield publishes (sky.ts scene.userData.atmosphere). */
interface PanoramaAtmosphere {
  active?: boolean;
  sunDir?: { x: number; y: number; z: number };
  fogDensity?: number; fogMix?: number; fogTint?: THREE.Color;
  summary?: { horizon: THREE.Color; sunHorizon: THREE.Color } | null;
}

/**
 * The shared haze law (hazeLaw.ts) for the bake: the far country past the shell takes the same Beer–Lambert law the
 * aerial pass lays over the shell's own depth (post.ts), so near, mid and far ranges stay one law — σ from the map's
 * fogDensity, the layer's path-averaged density, the per-channel extinction — and the same in-scatter target, the sky
 * at the horizon (the atmosphere's 1.25° bands away from the sun and toward it) drawn toward the authored tint, a step
 * under it. Null where there is no published sky for this map (the receipts, the labs, the mobile tier, a sky not yet
 * applied): the bake keeps its own air.
 */
export function horizonPanoramaHaze(atmosphere: PanoramaAtmosphere | null | undefined, sun: readonly [number, number, number],
  fogDensity: number | null | undefined, overcast = 0): { sigma: number; invScale: number; anti: THREE.Vector3; toward: THREE.Vector3 } | null {
  if (!atmosphere?.active || !atmosphere.summary || !atmosphere.fogTint) return null;
  // the map's own sky (a sky still showing the last map, or another hour, would hand its colour to this one's bake)
  const sd = atmosphere.sunDir;
  if (!sd) return null;
  const sl = Math.hypot(sun[0], sun[1], sun[2]) || 1, dl = Math.hypot(sd.x, sd.y, sd.z) || 1;
  if ((sun[0] * sd.x + sun[1] * sd.y + sun[2] * sd.z) / (sl * dl) < 0.9995) return null;
  const density = fogDensity ?? atmosphere.fogDensity;
  if (!(Number.isFinite(density) && (density as number) > 0)) return null;
  // the target's tint share and level under the deck: the aerial pass's own terms (hazeLaw.ts hazeTargetTerms)
  const terms = hazeTargetTerms(overcast, { x: 0, y: 0 });
  const tintShare = terms.x, targetK = terms.y;
  const tint = atmosphere.fogTint, tintL = Math.max(0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b, 1e-4);
  const mix = THREE.MathUtils.clamp((atmosphere.fogMix ?? 0) * tintShare, 0, 1);
  const target = (sky: THREE.Color): THREE.Vector3 => {
    // post.ts's target, term by term
    const skyL = 0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b;
    const k = skyL / tintL;
    let r = sky.r + (tint.r * k - sky.r) * mix, g = sky.g + (tint.g * k - sky.g) * mix, b = sky.b + (tint.b * k - sky.b) * mix;
    if (g > b) {
      const tl = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r += (tl * 0.92 - r) * 0.6; g += (tl * 0.99 - g) * 0.6; b += (tl * 1.12 - b) * 0.6;
    }
    return new THREE.Vector3(r * targetK, g * targetK, b * targetK);
  };
  const { horizon, sunHorizon } = atmosphere.summary;
  if (!(0.2126 * horizon.r + 0.7152 * horizon.g + 0.0722 * horizon.b > 1e-5)) return null;
  return { sigma: hazeSigma(density as number), invScale: hazeLayerInverseScale(), anti: target(horizon), toward: target(sunHorizon) };
}

/**
 * Per ring column, the tangent of the ring's own skyline elevation from the bake eye: the highest of its rows seen from
 * (0, eyeY, 0). The far ranges stand a margin above it (HorizonPanoramaCharacter.layers).
 */
export function horizonRingSkylineTan(ringEdge: HorizonPanoramaOptions['ringEdge'], eyeY: number): Float32Array {
  const n = ringEdge.columns, rows = Math.floor(ringEdge.heights.length / n);
  const out = new Float32Array(n).fill(-1);
  for (let row = 0; row < rows; row++) {
    for (let k = 0; k < n; k++) {
      const i = row * n + k;
      const r = Math.hypot(ringEdge.positions[i * 3], ringEdge.positions[i * 3 + 2]);
      if (r < 520) continue; // the battlefield's own seam rows
      const t = (ringEdge.heights[i] - eyeY) / r;
      if (t > out[k]) out[k] = t;
    }
  }
  // the envelope the far country answers: a running max over about 3 degrees (a ring summit's own width), then two box
  // passes over about 8 degrees — the layers rise with the ring's massing, not with every column of its skyline (a
  // target that jumped column to column stood the uplands' plinth up as walls)
  const wrap = (k: number): number => ((k % n) + n) % n;
  const maxR = Math.max(1, Math.round(n * 3 / 360)), boxR = Math.max(1, Math.round(n * 8 / 360));
  const tmp = new Float32Array(n);
  for (let k = 0; k < n; k++) { let m = -1; for (let d = -maxR; d <= maxR; d++) m = Math.max(m, out[wrap(k + d)]); tmp[k] = m; }
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? tmp : out, dst = pass === 0 ? out : tmp;
    for (let k = 0; k < n; k++) { let sum = 0; for (let d = -boxR; d <= boxR; d++) sum += src[wrap(k + d)]; dst[k] = sum / (2 * boxR + 1); }
  }
  return tmp;
}

/** The atlas's v for a direction's elevation from the bake eye (clamped by the sampler). */
export function horizonPanoramaV(elevation: number): number {
  return (elevation - HORIZON_PANORAMA.elevMin) / (HORIZON_PANORAMA.elevMax - HORIZON_PANORAMA.elevMin);
}

/** The atlas coordinates of a world point as seen from the bake eye: u by azimuth (0 at +x, round toward +z), v by
 * elevation. */
export function horizonPanoramaUv(x: number, y: number, z: number): [number, number] {
  let a = Math.atan2(z, x); if (a < 0) a += Math.PI * 2;
  const e = Math.atan2(y - HORIZON_PANORAMA.eyeY, Math.hypot(x, z));
  return [a / (Math.PI * 2), horizonPanoramaV(e)];
}

/**
 * The regional far-country classes (gauntlet wave 15, every critic: "mountain ranges behind places that have none" — a
 * full range behind the Jamuna chars, the Ca Mau coast, the Zeeland polders, the Prokhorovka forest-steppe; an almost
 * alpine skyline behind the rounded Eifel): a map's horizon block picks one with `panorama: { regional }`, in place of
 * its relief character's far vocabulary, so the far country is the real place's.
 *  - plain: floodplains, steppe, polders, forest-steppe — swells under 70 m, no layers over the ring, no far rise; the
 *    skyline is the country's tree lines, shelterbelts and woods (an 18 m canopy), its fields between;
 *  - erg: a flat sand sea of low soft dunes (long, broad swells; no ripple corduroy), no trees;
 *  - upland: rolling uplands — rounded forested hills, plateau edges, no peaks: 260 m, a half layer behind the ring;
 *  - forested: forested mountains (a cultivated Japanese valley's hills) — steep and rounded, wooded to the crests, no
 *    snow and little bare rock;
 *  - karstRidge: a coast's bare limestone ridge (the Dalmatian Biokovo / Mosor behind Brač) — rock over scrub;
 *  - ridges: long steep forested ridges and deep valleys (the Naga Hills round Kohima);
 *  - jebel: sheer fluted sandstone massifs standing out of flat sand (Wadi Rum) — a short apron, a sheer wall;
 *  - volcanicField: a weathered volcanic field (Blackglass's volcanic glass) — rounded cones on low lava plateaus;
 *  - iceSheet: an ice sheet with nunataks — a flat white skyline broken by a few dark rock peaks.
 */
export type HorizonPanoramaRegional = 'plain' | 'erg' | 'upland' | 'forested' | 'karstRidge' | 'ridges' | 'jebel' | 'volcanicField' | 'iceSheet';
export const HORIZON_PANORAMA_REGIONAL: Readonly<Record<HorizonPanoramaRegional, HorizonPanoramaCharacter>> = Object.freeze({
  plain: { ampM: 70, foot: 0.6, macroL: 5000, sharp: 1.0, midL: 1800, gullyL: 600, gullyM: 4, warpM: 900, valley: 0.2, valleyL: 8000, snowline: 2, treeline: 1.2, rockSlope: 0.8, bedM: 60, strata: 0, tables: false, farRise: 0, layers: 0, plinth: false, ...PANO_EXTRAS, trees: 18 },
  erg: { ampM: 40, foot: 0.7, macroL: 2400, sharp: 1.0, midL: 900, gullyL: 600, gullyM: 0, warpM: 700, valley: 0.15, valleyL: 6000, snowline: 2, treeline: 0, rockSlope: 0.9, bedM: 60, strata: 0, tables: false, farRise: 0, layers: 0, plinth: false, ...PANO_EXTRAS },
  upland: { ampM: 260, foot: 0.35, macroL: 5200, sharp: 0.9, midL: 1700, gullyL: 500, gullyM: 18, warpM: 1000, valley: 0.3, valleyL: 8000, snowline: 2, treeline: 0.9, rockSlope: 0.5, bedM: 60, strata: 0.03, tables: false, farRise: 0.25, layers: 0.45, plinth: true, ...PANO_EXTRAS, trees: 14 },
  forested: { ampM: 900, foot: 0.22, macroL: 4600, sharp: 1.2, midL: 1400, gullyL: 420, gullyM: 45, warpM: 900, valley: 0.4, valleyL: 7000, snowline: 2, treeline: 1.0, rockSlope: 0.62, bedM: 50, strata: 0.02, tables: false, farRise: 0, layers: 1, plinth: false, ...PANO_EXTRAS },
  karstRidge: { ampM: 520, foot: 0.24, macroL: 5400, sharp: 1.3, midL: 1500, gullyL: 450, gullyM: 55, warpM: 1100, valley: 0.35, valleyL: 8500, snowline: 2, treeline: 0.35, rockSlope: 0.22, bedM: 40, strata: 0.08, tables: false, farRise: 0.9, layers: 1, plinth: true, ...PANO_EXTRAS, shoreRange: 0.9 },
  // (gauntlet wave 24, Monsoon Ridge: the steep 'ridges' stood as "a pale, jagged desert rock formation" and a "needle-sharp
  // mountain spike" — rounded crests, shallower gullies, the forest up the steep faces and over the crests, rock only on
  // the cliffs, less lift toward the deck)
  ridges: { ampM: 750, foot: 0.25, macroL: 3800, sharp: 0.95, midL: 1500, gullyL: 380, gullyM: 30, warpM: 700, valley: 0.5, valleyL: 6000, snowline: 2, treeline: 1.6, rockSlope: 0.95, bedM: 40, strata: 0.02, tables: false, farRise: 0, layers: 0.25, plinth: false, ...PANO_EXTRAS, forestSlope: 0.8 },
  // (gauntlet wave 24, Redrock corner-ne: the tabled 'jebel' read as "low rounded swells, nothing resembles Wadi Rum's
  // walls" — now sheer massifs standing alone on a flat sand plain, maps lane A's section: bossed caps, fluted walls,
  // short talus aprons; the massifs bare rock, the aprons and the plain sand)
  jebel: { ampM: 45, foot: 0.7, macroL: 2600, sharp: 1.0, midL: 1000, gullyL: 600, gullyM: 0, warpM: 700, valley: 0.15, valleyL: 6000, snowline: 2, treeline: 0, rockSlope: 0.5, bedM: 26, strata: 0.3, tables: false, farRise: 0, layers: 0, plinth: false, ...PANO_EXTRAS,
    jebelShare: 0.65, jebelM: 480, jebelRadiusM: 650, jebelFoot: 0.66, jebelRim: 0.86, jebelApron: 0.18, jebelFlutes: 20, jebelFluteDepth: 0.8, jebelBossM: 90, jebelFootVary: 0.14, jebelVarnish: 0.55 },
  volcanicField: { ampM: 380, foot: 0.3, macroL: 4800, sharp: 1.0, midL: 1600, gullyL: 420, gullyM: 20, warpM: 800, valley: 0.3, valleyL: 7000, snowline: 2, treeline: 0.35, rockSlope: 0.4, bedM: 40, strata: 0.1, tables: false, farRise: 0, layers: 0.6, plinth: false, ...PANO_EXTRAS, peakShare: 0.35, peakM: 260, peakRadiusM: 800, peakSharp: 1.2 },
  iceSheet: { ampM: 110, foot: 0.5, macroL: 6000, sharp: 1.0, midL: 2200, gullyL: 600, gullyM: 6, warpM: 1000, valley: 0.2, valleyL: 8000, snowline: -0.5, treeline: 0, rockSlope: 0.35, bedM: 80, strata: 0.04, tables: false, farRise: 0, layers: 0.3, plinth: false, ...PANO_EXTRAS, peakShare: 0.2, peakM: 320, peakRadiusM: 380, peakSharp: 2.2 },
});

/** The resolved knobs for a map: its regional class's (or its relief character's) far vocabulary, then its overrides. */
export function resolveHorizonPanoramaCharacter(character: HorizonReliefCharacter, overrides?: Partial<HorizonPanoramaCharacter> & { regional?: HorizonPanoramaRegional }): HorizonPanoramaCharacter {
  const { regional, ...rest } = overrides ?? {};
  const base = regional ? HORIZON_PANORAMA_REGIONAL[regional] : (HORIZON_PANORAMA_CHARACTERS[character] ?? HORIZON_PANORAMA_CHARACTERS.rolling);
  return { ...base, ...rest };
}

// --------------------------------------------------------------------------------------------------- the shell mesh

/**
 * The shell: row 0 on the ring's outer edge (its own positions and heights, so the apron leaves the ring without a
 * seam), the apron's rows easing down to the shell's foot, the wall at the shell radius up its elevations. Every
 * vertex carries its azimuth fraction (u, continuous across the seam: column n repeats column 0 at u = 1).
 */
export function buildHorizonPanoramaShellGeometry(ringEdge: HorizonPanoramaOptions['ringEdge']): THREE.BufferGeometry {
  const n = ringEdge.columns, stride = n + 1;
  const P = HORIZON_PANORAMA;
  const rows = 1 + P.apronM.length + P.wallElevDeg.length;
  const positions = new Float32Array(stride * rows * 3), uvs = new Float32Array(stride * rows * 2);
  const start = ringEdge.heights.length - n; // the ring's last row
  // the apron's and the wall's base radius: the ring's outer radius as a running maximum over about 20 degrees, then
  // averaged over as many — where a sea opening carries the ring's marine faces out to the sea apron (Saltwind, Coastal,
  // Nordhavn Fjord: 1.3 km to 4.35 km within one column), a wall at the edge's own radius jumped there too, and the
  // quads joining the two stood radially, edge-on from the bake eye but a sheet of smeared far country from anywhere
  // else (the census, Saltwind's establishing view: a far range cut off sheer over the bay, a pale wedge beside it);
  // a ring without openings stays within 1.6 km, so its shell is unchanged
  const SPAN = 24, outerR = new Float32Array(n), runMax = new Float32Array(n), baseR = new Float32Array(n);
  for (let c = 0; c < n; c++) outerR[c] = Math.min(P.seaEdgeMaxM, Math.hypot(ringEdge.positions[(start + c) * 3], ringEdge.positions[(start + c) * 3 + 2]));
  for (let c = 0; c < n; c++) { let m = 0; for (let d = -SPAN; d <= SPAN; d++) m = Math.max(m, outerR[((c + d) % n + n) % n]); runMax[c] = m; }
  for (let c = 0; c < n; c++) { let sum = 0; for (let d = -SPAN; d <= SPAN; d++) sum += runMax[((c + d) % n + n) % n]; baseR[c] = sum / (2 * SPAN + 1); }
  for (let k = 0; k <= n; k++) {
    const c = k % n, i = start + c;
    const rx = ringEdge.positions[i * 3], rz = ringEdge.positions[i * 3 + 2], eh = ringEdge.heights[i];
    const a = Math.atan2(rz, rx), ca = Math.cos(a), sa = Math.sin(a);
    // (over a sea opening the edge row stands on the ring's marine faces at seaEdgeMaxM; they run on under the apron)
    const er = Math.hypot(rx, rz), ek = er > P.seaEdgeMaxM ? P.seaEdgeMaxM / er : 1;
    const ex = rx * ek, ez = rz * ek;
    const edgeR = baseR[c];
    let row = 0;
    const put = (x: number, y: number, z: number): void => {
      const o = row * stride + k;
      positions[o * 3] = x; positions[o * 3 + 1] = y; positions[o * 3 + 2] = z;
      uvs[o * 2] = k / n; uvs[o * 2 + 1] = 0;
      row++;
    };
    put(ex, eh - 0.05, ez);
    // the apron: from the edge level down toward a low plain at the shell's foot — from the edge's level averaged over
    // nine columns (the outer row is jagged column to column, and the apron reads the atlas by its own elevation from
    // the eye: a jagged apron read a different atlas row per column, one streak each, where a low ring shows it)
    let ehs = 0;
    for (let d = -4; d <= 4; d++) ehs += ringEdge.heights[start + ((c + d) % n + n) % n];
    ehs /= 9;
    const foot = Math.min(ehs, 20) - 25;
    P.apronM.forEach((r, j) => {
      const rr = Math.max(r, edgeR + 40 * (j + 1));
      const t = (j + 1) / (P.apronM.length + 1);
      put(ca * rr, ehs + (foot - ehs) * t, sa * rr);
    });
    // the wall: at the shell radius, rows at the strip's elevations as seen from the eye
    const R = Math.max(P.shellM, edgeR + 160);
    for (const deg of P.wallElevDeg) put(ca * R, Math.max(foot, P.eyeY + Math.tan(deg * DEG) * R), sa * R);
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let k = 0; k < n; k++) {
      const a = row * stride + k, b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The shell's material: the atlas by direction from the bake eye (an unlit backdrop; the post pass hazes it by depth),
 * transparent texels discarded (the sky and the clouds behind). The scene fog is off, as it was on the round-72 far
 * range: the strip carries its own air past the shell (the bake's distance grading). */
function buildShellMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide });
  material.name = 'horizon-panorama';
  const P = HORIZON_PANORAMA;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPanoEye = { value: new THREE.Vector3(0, P.eyeY, 0) };
    shader.uniforms.uPanoElev = { value: new THREE.Vector2(P.elevMin, P.elevMax) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPanoWorld; varying float vPanoU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPanoWorld = (modelMatrix * vec4(position, 1.0)).xyz; vPanoU = uv.x;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPanoEye; uniform vec2 uPanoElev; varying vec3 vPanoWorld; varying float vPanoU;')
      .replace('#include <map_fragment>', /* glsl */`
      #ifndef USE_MAP
        discard;
      #else
      {
        // a radial sheet (where the ring's own outer row jumps out to a sea opening's marine faces) is edge-on from the
        // bake eye and a smear of far country from anywhere else: not drawn
        vec3 fn = cross(dFdx(vPanoWorld), dFdy(vPanoWorld));
        float fl = length(fn), fh = length(fn.xz);
        if (fl > 1e-6 && fh > 0.5 * fl && abs(dot(fn.xz / fh, normalize(vPanoWorld.xz - uPanoEye.xz + vec2(1e-3)))) < 0.45) discard;
        vec3 d = vPanoWorld - uPanoEye;
        float e = atan(d.y, length(d.xz));
        vec4 pano = texture2D(map, vec2(vPanoU, clamp((e - uPanoElev.x) / (uPanoElev.y - uPanoElev.x), 0.002, 0.998)));
        if (pano.a < 0.5) discard;
        // the atlas holds display-encoded colour (more precision in the shadows), premultiplied so its filtered edge
        // samples carry no black from the sky texels: divided back out, then back to linear
        diffuseColor.rgb *= pow(pano.rgb / pano.a, vec3(2.2));
      }
      #endif`);
  };
  material.customProgramCacheKey = () => 'horizon-panorama-v3';
  return material;
}

// --------------------------------------------------------------------------------------------------- the bake shaders

const NOISE_GLSL = /* glsl */`
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// value noise with its analytic derivatives (Quilez): x = value in [-1, 1], yz = d/dx, d/dy
vec3 noised(vec2 x) {
  vec2 p = floor(x), w = fract(x);
  vec2 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
  float a = hash12(p), b = hash12(p + vec2(1.0, 0.0)), c = hash12(p + vec2(0.0, 1.0)), d = hash12(p + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(-1.0 + 2.0 * (a + k1 * u.x + k2 * u.y + k4 * u.x * u.y), 2.0 * du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
`;

const FIELD_GLSL = /* glsl */`
uniform vec4 uOff0, uOff1, uOff2, uOff3;  // the seed's offsets
uniform vec4 uChar0;   // ampM, foot, macroL, sharp
uniform vec4 uChar1;   // midL, gullyL, gullyM, warpM
uniform vec4 uChar2;   // valley, valleyL, tables, layers (negative: as a plinth)
uniform vec4 uChar3;   // snowline, treeline, rockSlope, bedM
uniform vec4 uChar4;   // strata, deckM, ampM, farRise
uniform vec4 uFrame;   // innerM, outerM, shellM, eyeY
uniform sampler2D uEdge; // per azimuth: r = the ring's outer height, g = sea weight, b = sea level, a = tan of the ring's skyline
uniform vec4 uShore;   // the far shore's height share (0: open sea), the channel's distance (m), its coastal range's share
uniform vec4 uTrees;   // the tree lines' and woods' canopy (m; 0: none)
uniform vec4 uMesa;    // a table's talus apron (m) and its share of the height, its caprock cliff (m), its rim's alcoves (m)
uniform vec4 uPeaks;   // isolated peaks: share of 2.6 km cells, height (m), radius (m), sharpness
uniform vec4 uJebel;   // sheer jebels: share of 2.6 km cells, height (m), radius (m), the cap's bosses (m)
uniform vec4 uJebel2;  // the wall's foot, the cap's rim, the apron's share, the flutes round the wall
uniform vec4 uJebel3;  // the flutes' depth, the foot's wander
${HORIZON_JEBEL_SECTION_GLSL}
// a smooth wander round a massif in its bearing, in [-1, 1] (maps lane A's lobe: four harmonics, falling amplitude)
float jebelLobe(float th, float salt) {
  float sum = 0.0;
  for (int k = 2; k <= 5; k++) {
    float fk = float(k);
    sum += sin(fk * th + 6.2831853 * hash12(vec2(fk, salt))) / (fk - 1.0);
  }
  return sum / 2.0833333;
}

float macroField(vec2 q) {
  float sum = 0.0, amp = 1.0, weight = 1.0, norm = 0.0;
  for (int o = 0; o < 7; o++) {
    float v = 1.0 - abs(noised(q).x);
    v = pow(v, uChar0.w) * weight;
    weight = clamp(v * 1.15, 0.0, 1.0);
    sum += v * amp; norm += amp; amp *= 0.47;
    q = ROT * q;
  }
  return sum / norm;
}
float midField(vec2 q) {
  float a = 0.0, b = 1.0, norm = 0.0; vec2 d = vec2(0.0);
  for (int o = 0; o < 6; o++) {
    vec3 n = noised(q); d += n.yz;
    a += b * n.x / (1.0 + dot(d, d)); norm += b; b *= 0.5;
    q = ROT * q;
  }
  return a / norm;
}
float baseField(vec2 p) {
  vec2 w = p + uChar1.w * vec2(noised(p / 3300.0 + uOff0.zw).x, noised(p / 3300.0 + uOff1.xy).x);
  float m = macroField(w / uChar0.z + uOff0.xy);
  return pow(m, 1.6) * 1.15 + 0.22 * midField(w / uChar1.x + uOff1.zw) * (0.35 + m);
}
// Clay John's erosion octave: waves across the slope (so their crests run down it), cosines in jittered cells
float gullyOctave(vec2 p, vec2 dir, float seed) {
  vec2 i = floor(p), f = fract(p);
  float va = 0.0, wt = 0.0;
  for (int j = -2; j <= 1; j++) for (int k = -2; k <= 1; k++) {
    vec2 c = i - vec2(float(k), float(j));
    vec2 h = vec2(hash12(c + vec2(seed, 0.0)), hash12(c + vec2(0.0, seed))) * 0.5;
    vec2 pp = f + vec2(float(k), float(j)) - h;
    float w = exp(-dot(pp, pp) * 2.0); wt += w;
    va += cos(dot(pp, dir) * 6.2831853) * w;
  }
  return va / wt;
}
float envelopeAt(vec2 p, float r) {
  float d = smoothstep(uFrame.x, uFrame.x + 1600.0, r);
  float rise = (uChar0.y + (1.0 - uChar0.y) * d) * (1.0 - 0.18 * smoothstep(5500.0, 9000.0, r));
  // the hill countries' far ranges: low mountains behind the hills (uChar4.w: their extra rise past 4 km)
  rise *= 1.0 + uChar4.w * smoothstep(3800.0, 7500.0, r);
  float az = noised(p / 11000.0 + uOff2.xy).x * 0.5 + 0.5;
  vec2 w = p + uChar1.w * vec2(noised(p / 3300.0 + uOff0.zw).x, noised(p / 3300.0 + uOff1.xy).x);
  float vf = abs(noised(w / uChar2.y + uOff2.zw).x);
  float valley = 1.0 - uChar2.x * (1.0 - smoothstep(0.0, 0.45, vf));
  // under a low cloud deck the far country stays mostly beneath it (the round-72 far range's law: its ranges scaled
  // under the deck), the summits that still reach it fading into the cloud (the strip's alpha)
  return min(uChar0.x, max(150.0, uChar4.y * 1.4)) * rise * (0.55 + 0.45 * smoothstep(0.15, 0.85, az)) * valley;
}
// a tableland: broad tables cut by canyons, buttes standing off them, a low plain between. Each table is shaped by its
// rim distance (the mask's margin over its own analytic gradient, in metres inside the rim): a concave talus apron 700 m
// wide rising to over half the table, the caprock cliff over the last 50 m, an inset upper tier on the broader tables
// (a bench at two-thirds, its own talus and cliff), the rim bitten by alcoves and spurs and the apron cut by gullies — an
// eroded mesa with its scree, not a box (gauntlet wave 6, Sirocco: "box-like flat-topped blocks with vertical walls …
// primitive shapes rather than eroded buttes"), at seven-tenths of the old tables' height; buttes the same way, a little
// taller, broad (a 1.8 km octave past a higher margin) with 320 m aprons, so no butte stands as a needle
float mesaRamp(float sv, float tw, float cw) {
  float t = smoothstep(-tw, 0.0, sv);
  return uMesa.y * t * t + (1.0 - uMesa.y) * smoothstep(0.0, cw, sv);
}
float mesaField(vec2 p, float A) {
  vec2 w = p + uChar1.w * vec2(noised(p / 3300.0 + uOff0.zw).x, noised(p / 3300.0 + uOff1.xy).x);
  float L1 = uChar0.z, L2 = uChar0.z * 0.37;
  vec3 na = noised(w / L1 + uOff0.xy), nb = noised(w / L2 + uOff1.zw), nr = noised(w / 420.0 + uOff2.xy);
  float big = na.x * 0.65 + nb.x * 0.35 + 0.05 * nr.x;
  vec2 g = na.yz * (0.65 / L1) + nb.yz * (0.35 / L2) + nr.yz * (0.05 / 420.0);
  // (few tables in the first one and a half kilometres past the ring: a near table mapped onto the shell stood over the
  // ring as a curved band from a camera off the square's centre; a third of the far country in tables, not half)
  float th = mix(0.9, 0.16, smoothstep(uFrame.x + 1500.0, uFrame.x + 3000.0, length(p)));
  float s1 = (big - th) / max(length(g), 1e-7);
  // alcoves and spurs along the rim (~180 m), gullies down the apron (~70 m across the slope)
  s1 += uMesa.w * noised(w / 180.0 + uOff3.zw).x;
  float lv = noised(w / (uChar0.z * 1.3) + uOff3.xy).x;
  float level = 0.42 + 0.22 * step(-0.15, lv) + 0.2 * step(0.3, lv) + 0.04 * noised(w / 1300.0).x;
  float prof = mesaRamp(s1, uMesa.x, uMesa.z);
  float inset = 260.0 + 160.0 * (noised(w / 2100.0 + vec2(4.1, -2.7)).x * 0.5 + 0.5);
  float tier = mesaRamp(s1 - inset, 200.0, 30.0);
  prof = prof * (1.0 - 0.32 * smoothstep(0.0, 1.0, tier)) + 0.32 * tier;
  float apron = smoothstep(-uMesa.x, -20.0, s1) * (1.0 - smoothstep(-20.0, 0.0, s1));
  prof *= 1.0 - 0.22 * apron * (noised(w / 70.0 + uOff2.zw).x * 0.5 + 0.5);
  // buttes off the tables: the finer octave's highs past a higher margin, shaped the same way, standing a little taller
  float Lb = uChar0.z * 0.3;
  vec3 nd = noised(w / Lb + uOff2.zw);
  float sb = (nd.x - (th + 0.5)) / max(length(nd.yz) / Lb, 1e-7);
  // (a butte stands to its full height only where it is broad: a narrow top — a noise peak's tip — keeps under half,
  // so it stays a low cone instead of a needle grazing the ring's skyline)
  float bprof = mesaRamp(sb, 320.0, 16.0) * (0.45 + 0.55 * smoothstep(20.0, 160.0, sb)) * (1.0 - smoothstep(-40.0, 40.0, s1));
  float plain = A * (0.04 + 0.05 * (noised(w / 900.0 + uOff3.zw).x * 0.5 + 0.5));
  float top = 1.0 + 0.04 * noised(w / 700.0 + vec2(-3.3, 1.9)).x;
  return plain + 0.7 * max(A * level * max(prof, 0.0) * top, A * (level + 0.22) * bprof);
}
float gPlinth = 0.0; // farField's plinth at its last point (the height pass writes it beside the height)
float gTree = 0.0;   // and its tree cover (the strip colours it as the forest)
float gPeak = 0.0;   // and its isolated peaks' weight (the strip bares them: a nunatak's rock, a cone's scoria)
float gVarnish = 0.0; // and a jebel country's desert varnish down its walls (written in the tree-cover channel)
float farField(vec2 p) {
  gPlinth = 0.0;
  gVarnish = 0.0;
  float r = length(p);
  float A = envelopeAt(p, r);
  float h = uChar2.z > 0.5 ? mesaField(p, A) : A * baseField(p);
  // the gullies: two erosion octaves across the local slope, deeper on the steeper ground
  float e = 30.0;
  vec2 g = A * vec2(baseField(p + vec2(e, 0.0)) - baseField(p - vec2(e, 0.0)), baseField(p + vec2(0.0, e)) - baseField(p - vec2(0.0, e))) / (2.0 * e);
  float s = length(g);
  if (uChar2.z < 0.5 && s > 0.02) {
    vec2 sd = g / s;
    float k = clamp(s * 2.2, 0.4, 2.2);
    vec2 dir = vec2(sd.y, -sd.x) * k;
    float gs = gullyOctave(p / uChar1.y + uOff3.xy, dir, 17.0) + 0.5 * gullyOctave(p / (uChar1.y * 0.5) + uOff3.zw, dir, 48.0);
    h += uChar1.z * smoothstep(0.05, 0.35, s) * gs * (0.4 + 0.6 * smoothstep(0.0, A * 0.5, h));
  }
  h = max(0.0, h);
  // the country's trees (uTrees.x > 0): shelterbelts along a slightly turned field grid (one direction dominant, the
  // other sparser, broken in places) and lobed woods favouring the low ground — a canopy on the far field, so the flat and
  // the rolling countries' skyline is their tree lines (the belts ~80 m deep in the grid, a row or two at 3-9 km)
  // isolated peaks (uPeaks.x > 0): one in a share of 2.6 km cells, at a jittered point — rounded cones on a volcanic
  // field, sharp nunataks through an ice sheet
  gPeak = 0.0;
  if (uPeaks.x > 0.0) {
    vec2 cell = floor(p / 2600.0);
    float best = 0.0, foot = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      float present = step(1.0 - uPeaks.x, hash12(c + vec2(13.1, 7.7)));
      vec2 centre = (c + 0.2 + 0.6 * vec2(hash12(c + vec2(1.3, 9.1)), hash12(c + vec2(8.7, 2.9)))) * 2600.0;
      float rad = uPeaks.z * (0.7 + 0.6 * hash12(c + vec2(4.4, 4.4)));
      // the sharp ones drawn out along a turned axis (a nunatak is an outcrop's ridge, not a cone; the rounded cones
      // stay round)
      float ang = 6.2831853 * hash12(c + vec2(5.9, 3.3));
      vec2 ax = vec2(cos(ang), sin(ang)), q = p - centre;
      float el = 1.0 + 0.58 * clamp(uPeaks.w - 1.0, 0.0, 1.2) * hash12(c + vec2(9.4, 0.6));
      float d = length(vec2(dot(q, ax) / el, dot(q, vec2(-ax.y, ax.x))));
      float cone = pow(max(0.0, 1.0 - d / rad), uPeaks.w) * (0.6 + 0.4 * hash12(c + vec2(2.2, 6.6)));
      best = max(best, cone * present);
      foot = max(foot, present * clamp(1.0 - d / rad, 0.0, 1.0));
    }
    // (the sharp ones' crests broken into crags and cols)
    best *= 1.0 + 0.18 * clamp(uPeaks.w - 1.0, 0.0, 1.2) * noised(p / 150.0 + vec2(2.7, -5.1)).x;
    h += uPeaks.y * best;
    gPeak = foot;
  }
  // sheer jebels (uJebel.x > 0): one in a share of 2.6 km cells, standing alone on the plain — maps lane A's section
  // (horizonJebelSection): a bossed cap, a sheer wall fluted in vertical grooves whose foot wanders round the massif, a
  // short concave talus apron; drawn out along a turned axis. The footprint inside the wall's foot is written for the
  // strip to bare to rock; the aprons and the plain stay sand
  if (uJebel.x > 0.0) {
    vec2 cell = floor(p / 2600.0);
    float best = 0.0, bare = 0.0, varnish = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      if (hash12(c + vec2(31.7, 3.1)) < 1.0 - uJebel.x) continue;
      vec2 centre = (c + 0.2 + 0.6 * vec2(hash12(c + vec2(2.9, 7.3)), hash12(c + vec2(6.1, 1.7)))) * 2600.0;
      float rad = uJebel.z * (0.7 + 0.6 * hash12(c + vec2(5.3, 8.8)));
      float ang = 6.2831853 * hash12(c + vec2(9.1, 4.4));
      vec2 ax = vec2(cos(ang), sin(ang)), q2 = p - centre;
      float el = 1.0 + 0.5 * hash12(c + vec2(0.7, 2.2));
      vec2 lq = vec2(dot(q2, ax) / el, dot(q2, vec2(-ax.y, ax.x))) / rad;
      float q = length(lq);
      if (q >= 1.0) continue;
      float th = atan(lq.y, lq.x), salt = hash12(c + vec2(4.8, 5.9)) * 97.0;
      float rim = uJebel2.y;
      float wall = clamp(uJebel2.x * (1.0 + uJebel3.y * jebelLobe(th, salt + 29.0)), 0.25, 0.92);
      // the flutes: a rounded notch where the cosine peaks, setting the wall back between its spurs
      float notch = pow(max(0.0, cos(6.2831853 * (th / 6.2831853 * uJebel2.w + hash12(c + vec2(3.7, 0.3))))), 2.0);
      wall -= notch * uJebel3.x * (1.0 - rim) * wall;
      float apron = uJebel2.z * (1.0 + 0.5 * jebelLobe(th, salt + 31.0));
      float hgt = uJebel.y * (0.7 + 0.3 * hash12(c + vec2(8.2, 6.6)));
      float hj = hgt * jebelSection(q, wall, apron, rim);
      // the cap's bosses: rounded domes inside the rim (their union), as maps lane A sets them
      float top = wall * rim;
      if (q < top && uJebel.w > 0.0) {
        float boss = 0.0;
        for (int k = 0; k < 4; k++) {
          float fk = float(k);
          float ba = 6.2831853 * hash12(vec2(fk, salt + 41.0)), br = sqrt(hash12(vec2(fk + 7.0, salt + 41.0))) * top * 0.62;
          float bradius = top * (0.3 + 0.16 * hash12(vec2(fk + 13.0, salt + 41.0)));
          float bd = length(lq - vec2(cos(ba), sin(ba)) * br) / bradius;
          if (bd < 1.0) boss = max(boss, (1.0 - bd * bd) * (1.0 - bd * bd) * (0.6 + 0.4 * hash12(vec2(fk + 19.0, salt + 41.0))));
        }
        hj += uJebel.w * boss;
      }
      best = max(best, hj);
      bare = max(bare, smoothstep(wall + 0.04, wall - 0.01, q));
      // desert varnish: dark streaks down the wall from under the rim (seepage from the cap), round the massif on the
      // circle (no seam), drawn out down the wall, fading over the talus
      if (uJebel3.z > 0.0 && q > top * 0.9 && q < wall + 0.05) {
        vec2 ring = vec2(cos(th), sin(th));
        float sv = noised(ring * 16.0 + vec2(q * 2.0, salt)).x * 0.65 + noised(ring * 41.0 + vec2(q * 4.0, salt + 5.0)).x * 0.35;
        float down = 1.0 - smoothstep(wall - 0.2 * (wall - top), wall + 0.05, q);
        varnish = max(varnish, smoothstep(0.08, 0.38, sv) * down);
      }
    }
    h += best;
    gPeak = max(gPeak, bare);
    gVarnish = varnish * uJebel3.z;
  }
  gTree = 0.0;
  if (uTrees.x > 0.0) {
    float tu = p.x * 0.913 + p.y * 0.408, tv = -p.x * 0.408 + p.y * 0.913;
    float du = abs(fract(tu / 640.0 + 0.5 * noised(vec2(tv, tu) / 2100.0).x) - 0.5) * 640.0;
    float dv = abs(fract(tv / 980.0 + 0.5 * noised(vec2(tu, tv) / 2300.0 + vec2(7.1, 0.0)).x) - 0.5) * 980.0;
    float brk = smoothstep(-0.2, 0.25, noised(p / 700.0 + vec2(3.3, -1.1)).x);
    float belt = max(1.0 - smoothstep(24.0, 40.0, du), 0.8 * (1.0 - smoothstep(24.0, 40.0, dv))) * brk;
    float wn = noised(p / 900.0 + vec2(5.5, -2.2)).x * 0.6 + noised(p / 320.0 + vec2(-4.4, 8.8)).x * 0.4;
    float woods = smoothstep(0.28, 0.38, wn - 0.12 * smoothstep(0.0, uChar0.x, h));
    gTree = max(belt, woods);
    h += uTrees.x * gTree * (0.85 + 0.3 * noised(p / 60.0).x);
  }
  gTree = max(gTree, gVarnish);
  float a = atan(p.y, p.x) * 0.15915494309;
  vec4 edge = texture2D(uEdge, vec2(fract(a), 0.5));
  // the layers behind the ring (the mountains lane, 2026-10-03: from the battlefield the far country hid behind the
  // ring's own skyline on most bearings): past ~3.5 km the ranges rise until their crests stand a margin above the
  // ring's skyline seen from the eye — the margin wanders round the compass (-0.9 to +4.3 degrees), so some sectors
  // stay behind the ring and the rest show their layers — and never into the cloud deck. Ranges keep their shape (the
  // field is scaled); tables lift to the level (their cliffs keep their profile).
  // (not over a sea sector or beside one: a coast's uplands rose sheer from the water at the sector's edge)
  float behind = abs(uChar2.w) * smoothstep(uChar2.w < 0.0 ? 2800.0 : 3400.0, uChar2.w < 0.0 ? 4200.0 : 6500.0, r)
    * (1.0 - smoothstep(0.02, 0.4, edge.g));
  if (behind > 0.001 && h > 0.0) {
    vec2 du = p / max(r, 1.0);
    float m = noised(du * 6.0 + uOff1.zw).x * 0.6 + noised(du * 15.0 + uOff2.xy).x * 0.4;
    // (a tableland's tops either clear the ring's skyline or stay behind it: a top grazing it stood as a sliver over the
    // ring — gauntlet wave 6, Sirocco's corner-ne "a thin vertical rectangular notch cut into the silhouette")
    float margin = uChar2.z > 0.5 ? mix(-0.03, 0.06, smoothstep(-0.08, 0.08, m)) : mix(-0.015, 0.075, smoothstep(-0.55, 0.55, m));
    float target = min(uFrame.w + r * (edge.a + margin), max(150.0, uChar4.y * 1.25));
    if (uChar2.z > 0.5) {
      // the tablelands scale too (their cliffs and talus keep their profile; lifting the tables to the target stood
      // them as boxes, and on Copper Mesa as one slab overhanging the frame), and by little
      h *= mix(1.0, clamp(target / max(1.0, 0.75 * A), 1.0, 1.6), behind);
    } else if (uChar2.w < 0.0) {
      // the hill countries: ridgelines in layers behind the ring — three, at about 4.6, 6.5 and 8.3 km (each wandering
      // 600 m in distance round the compass), each crest a little higher over the ring's skyline than the one before
      // (from the eye: bands of hills above the ring, each hazier), the country's own hills and valleys riding on them;
      // a single ramp to the target stood the uplands up as tepuis
      float cap = max(150.0, uChar4.y * 1.25), lift = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float rc = 4600.0 + fi * 1850.0 + 600.0 * noised(du * (3.0 + fi) + uOff3.xy + vec2(fi * 7.1, 1.3)).x;
        // broad (a hill country's far slopes are 10-25 degrees, a narrow ridge stood as a wall)
        float wr = 1500.0 + 420.0 * fi;
        float prof = exp(-((r - rc) * (r - rc)) / (wr * wr));
        float cm = mix(-0.012, 0.03 + 0.022 * fi, smoothstep(-0.6, 0.6, noised(du * (5.0 + 2.0 * fi) + uOff1.zw + vec2(fi * 3.3, -2.1)).x));
        // the crest line's own summits and saddles (a kilometre or two apart), so no ridge runs level; under the deck
        // the crest bows down instead of flattening on it
        float und = noised(du * (rc / 1400.0) + vec2(fi * 5.7, 9.1)).x * 0.6 + noised(du * (rc / 520.0) + vec2(-fi * 2.3, 4.4)).x * 0.4;
        // (gauntlet wave 6: the layers read as "a flat, featureless silhouette" — the crest kept within 16 % of its line;
        // now summits and saddles: two-thirds of the line in a saddle, a sixth over it on a summit)
        float crest = (uFrame.w + rc * (edge.a + cm)) * (0.67 + 0.48 * smoothstep(-0.55, 0.75, und));
        crest = crest < cap * 0.8 ? crest : cap * (0.8 + 0.2 * (1.0 - exp(-(crest - cap * 0.8) / (cap * 0.2))));
        lift = max(lift, (crest - 0.6 * A) * prof);
      }
      gPlinth = max(0.0, lift) * behind;
      h += gPlinth;
    } else {
      // (at most 1.8 x: a range scaled three times stood as a monolith — Nordhavn Fjord's far block)
      h *= mix(1.0, clamp(target / max(1.0, 0.8 * A), 1.0, 1.8), behind);
    }
  }
  // the near band stays under the ring's own skyline from the eye: what stands in the first two kilometres past the ring
  // is mapped onto the shell 2.6 km out, and seen from anywhere but the bake eye a tall near form bends with the shell
  // (Copper Mesa's near tables arched across the frame as one slab, Nordhavn Fjord's beside its bay stood as a block);
  // its excess over a line 1.7 degrees under that skyline is compressed to a seventh, released between 3.2 and 4.8 km
  float nearCap = uFrame.w + r * (edge.a - 0.03);
  float nearW = 1.0 - smoothstep(3200.0, 4800.0, r);
  if (h > nearCap) h = mix(h, nearCap + (h - nearCap) * 0.15, nearW);
  // the first kilometre eases out of the ring's outer heights; the sea sectors sink under their level — to the horizon,
  // or on a channel coast (uShore.x > 0, per map) as far as the far shore: the mainland or the islands across the water
  // (Saltwind, gauntlet wave 4: "behind the end of the road the land collapses into a thin flat strip with a pale blue
  // band under the haze line, so the world seems to end"; from the Dalmatian islands the mainland's ranges stand across
  // the channel). The shore wanders 1.1 km round its distance and rises out of the water over 1.8 km to the far
  // country's own height times the share, with a coastal range along it (the mainland's front ranges: the envelope's
  // share 2.4 km behind the shore, its crest wandering in height), so the far shore stands as a range across the water
  // instead of a low strip where the far country's own relief is low; its low ground stays under the water as bays.
  // (the census, Saltwind's establishing view: sunk along the bearing, the far ranges beside the bay ended in a sheer wall
  // over it) — the sea takes the country from a coastline whose distance falls with the sector's weight round the compass:
  // at the sector's edge the land runs to the annulus's end, toward its middle the coast closes in to the ring, so a bay
  // opens as headlands receding one behind another into the sea
  h = mix(edge.r * 0.8, h, smoothstep(uFrame.x, uFrame.x + 500.0, r));
  // the land falls away within ~12 degrees of a sea sector, the nearest opening counted either side (Nordhavn Fjord's
  // headland between its two openings stood at the mouth as an alpine monolith in the water, its sides cut by the sea)
  float a0 = fract(atan(p.y, p.x) * 0.15915494309);
  float nearSea = max(edge.g, max(
    max(texture2D(uEdge, vec2(fract(a0 + 0.017), 0.5)).g, texture2D(uEdge, vec2(fract(a0 - 0.017), 0.5)).g),
    max(texture2D(uEdge, vec2(fract(a0 + 0.034), 0.5)).g, texture2D(uEdge, vec2(fract(a0 - 0.034), 0.5)).g)));
  float landKeep = 1.0 - smoothstep(0.0, 0.45, nearSea);
  float sink = edge.g * smoothstep(0.0, 0.35, edge.g), seaH = edge.b - 6.0;
  if (sink > 0.0) {
    vec2 su = p / max(r, 1.0);
    float coastR = mix(uFrame.y + 500.0, uFrame.x - 300.0, pow(sink, 0.6)) + 700.0 * noised(su * 9.0 + uOff3.zw).x;
    float water = smoothstep(coastR - 900.0, coastR + 300.0, r);
    float land = h * landKeep;
    if (uShore.x > 0.0) {
      float rs = uShore.y + 1100.0 * noised(su * 5.0 + uOff2.zw).x;
      float rc = rs + 2400.0, crest = 0.7 + 0.3 * noised(su * 23.0 + uOff3.xy).x;
      float range = uShore.z * A * crest * exp(-((r - rc) * (r - rc)) / (1600.0 * 1600.0));
      // (well inside the sector only: at its flanks the far shore meets the tapered land, not a wall beside it)
      float back = smoothstep(rs, rs + 1800.0, r) * smoothstep(0.0, 0.6, sink);
      land = mix(land, h * uShore.x + range, back);
      water *= 1.0 - back;
    }
    h = mix(land, seaH, water);
  } else {
    h *= landKeep;
  }
  return h;
}
`;

const QUAD_VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** pass 1: the polar height grid (azimuth across, log radius up) */
const HEIGHT_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
${NOISE_GLSL}
${FIELD_GLSL}
void main() {
  float a = vUv.x * 6.2831853;
  float r = uFrame.x * pow(uFrame.y / uFrame.x, vUv.y);
  float h = farField(vec2(cos(a), sin(a)) * r);
  gl_FragColor = vec4(h, gPlinth, gTree, gPeak);
}
`;

const GRID_LOOKUP_GLSL = /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uFrame;
uniform vec2 uGrid; // gridA, gridR
// a world point's grid coordinates and its height (bilinear); -1e9 outside the annulus
vec2 gridUv(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x) * 0.15915494309;
  return vec2(fract(a), log(r / uFrame.x) / log(uFrame.y / uFrame.x));
}
float heightAt(vec2 p) {
  vec2 g = gridUv(p);
  if (g.y < 0.0 || g.y > 1.0) return -1e9;
  return texture2D(uHeight, g).r;
}
float rowRadius(float v) { return uFrame.x * pow(uFrame.y / uFrame.x, v); }
// the world normal at grid coordinates (central differences across the column and the row)
vec3 gridNormal(vec2 g) {
  float da = 1.0 / uGrid.x, dv = 1.0 / uGrid.y;
  float hA0 = texture2D(uHeight, g - vec2(da, 0.0)).r, hA1 = texture2D(uHeight, g + vec2(da, 0.0)).r;
  float hR0 = texture2D(uHeight, g - vec2(0.0, dv)).r, hR1 = texture2D(uHeight, g + vec2(0.0, dv)).r;
  float r = rowRadius(g.y), a = g.x * 6.2831853;
  float dr = rowRadius(g.y + dv) - rowRadius(g.y - dv), arc = 6.2831853 * r * 2.0 / uGrid.x;
  float dhdr = (hR1 - hR0) / max(1.0, dr), dhdt = (hA1 - hA0) / max(1.0, arc);
  float ca = cos(a), sa = sin(a);
  vec2 grad = vec2(dhdr * ca - dhdt * sa, dhdr * sa + dhdt * ca);
  return normalize(vec3(-grad.x, 1.0, -grad.y));
}
`;

/** pass 2: the grid's light — the sun's visibility (soft cast shadows) and the sky's occlusion */
const LIGHT_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uSun;
${GRID_LOOKUP_GLSL}
void main() {
  float a = vUv.x * 6.2831853, r = rowRadius(vUv.y);
  vec2 p = vec2(cos(a), sin(a)) * r;
  float h0 = texture2D(uHeight, vUv).r;
  vec2 sd = normalize(uSun.xz + vec2(1e-5));
  float tanSun = uSun.y / max(0.05, length(uSun.xz));
  float lit = 1.0, d = 30.0;
  for (int s = 0; s < 34; s++) {
    float hh = heightAt(p + sd * d);
    if (hh < -1e8) break;
    float over = hh - (h0 + 2.0 + d * tanSun);
    lit = min(lit, clamp(0.5 - over / (d * 0.06), 0.0, 1.0));
    if (lit <= 0.0) break;
    d *= 1.16;
  }
  lit = lit * lit * (3.0 - 2.0 * lit);
  float occ = 0.0;
  for (int q = 0; q < 6; q++) {
    float qa = float(q) * 1.0471976 + 0.3;
    vec2 qd = vec2(cos(qa), sin(qa));
    float maxT = 0.0;
    for (float dd = 60.0; dd <= 500.0; dd *= 1.6) {
      float hh = heightAt(p + qd * dd);
      if (hh < -1e8) break;
      maxT = max(maxT, (hh - h0) / dd);
    }
    occ += atan(maxT) / 1.5707963;
  }
  gl_FragColor = vec4(lit, 1.0 - occ / 6.0, 0.0, 1.0);
}
`;

/** pass 3: the strip — the first grid row reaching each texel's elevation, its surface law, its light and its air */
const STRIP_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uLight;
uniform vec3 uSun;
uniform vec2 uGains;
uniform vec3 uBase, uRock, uRock2, uScree, uSnow, uForest, uFog;
uniform vec4 uChar3;   // snowline, treeline, rockSlope, bedM
uniform vec4 uChar4;   // strata, deckM, ampM, farRise
uniform vec2 uElev;
uniform sampler2D uEdge;
uniform vec4 uShore;      // the far shore's height share (0: open sea), the channel's distance (m), its coastal range's share
uniform vec4 uTrees;      // the far field's canopy (m) and the forest's slope limit
uniform vec4 uJebel;      // sheer jebels: share of 2.6 km cells, height (m), radius (m), the cap's bosses (m)
uniform vec4 uHaze;       // the shared haze law (hazeLaw.ts): σ (1/m), 1 / the layer's scale height, the datum (m), on
uniform vec3 uHazeChroma; // its per-channel extinction
uniform vec3 uHazeAnti, uHazeToward; // its in-scatter target at the horizon away from the sun and toward it
${NOISE_GLSL}
${GRID_LOOKUP_GLSL}
${HAZE_LAW_GLSL}
vec3 surfaceColour(vec2 g, vec3 wp, vec3 n, float apron, vec4 light) {
  float slope = 1.0 - n.y;
  // the zones (forest, fields, snow, scree) by the height over the upland's plinth where it has one
  float hT = clamp((wp.y - texture2D(uHeight, g).g) / uChar4.z, 0.0, 1.0);
  float n1 = noised(wp.xz / 1900.0 + vec2(5.3, 1.7)).x * 0.7 + noised(wp.xz / 700.0 + vec2(-3.1, 8.2)).x * 0.3;
  // the lower flanks: stands of the map's forest (denser on the slopes, broken by clearings and fields on the gentle
  // lowland), the crowns' mottle; the meadows and fields a patchwork of their own tones
  float vegW = uChar3.y > 0.0 ? (1.0 - smoothstep(uChar3.y * 0.75, uChar3.y * 1.05, hT + 0.05 * n1)) * (1.0 - smoothstep(uTrees.y, uTrees.y + 0.23, slope)) : 0.0;
  float standN = noised(wp.xz / 170.0 + vec2(3.1, -7.7)).x + (1.0 - apron) * (0.45 * noised(wp.xz / 61.0 + vec2(-9.2, 4.4)).x + 0.25 * noised(wp.xz / 23.0).x);
  float stand = smoothstep(-0.15, 0.2, standN + 1.4 * smoothstep(0.03, 0.18, slope) - 0.55);
  float mottle = 0.72 + 0.4 * mix(noised(wp.xz / 29.0 + vec2(11.3, 5.1)).x * 0.5 + 0.5, 0.5, apron);
  // the lowland's fields: parcels on a slightly rotated grid (each its own crop: green, straw, tilled earth), on the
  // gentle ground only — distant farmland reads as bands of colour along the hills' feet
  vec2 fq = mat2(0.92, 0.39, -0.39, 0.92) * wp.xz / vec2(260.0, 170.0);
  vec2 fc = floor(fq + 0.3 * vec2(noised(fq * 0.21).x, noised(fq * 0.19 + 7.1).x));
  float crop = hash12(fc + 17.3);
  vec3 cropC = crop < 0.45 ? uBase * vec3(0.95, 1.08, 0.88) : crop < 0.75 ? uBase * vec3(1.32, 1.18, 0.78) : uBase * vec3(1.05, 0.88, 0.7);
  float fieldW = (1.0 - smoothstep(0.04, 0.1, slope)) * (1.0 - smoothstep(0.25, 0.45, hT)) * step(0.35, uChar3.y) * (1.0 - apron);
  float field = noised(floor(wp.xz / 210.0) * 1.7 + vec2(0.5)).x;
  field *= 1.0 - apron;
  vec3 meadow = uBase * (1.0 + 0.16 * field + 0.08 * (1.0 - apron) * noised(wp.xz / 90.0 + vec2(-2.2, 9.4)).x) * vec3(1.0 + 0.06 * field, 1.0, 1.0 - 0.05 * field);
  meadow = mix(meadow, cropC * (0.95 + 0.1 * noised(wp.xz / 37.0).x), fieldW * 0.85);
  vec3 ground = uBase * (0.92 + 0.16 * (noised(wp.xz / 120.0 + vec2(7.7, -1.3)).x * 0.5 + 0.5));
  vec3 col = mix(ground, mix(meadow, uForest * mottle, stand), vegW);
  // the far field's own tree lines and woods (its height pass's tree cover)
  col = mix(col, uForest * mottle * 0.9, uJebel.x > 0.0 ? 0.0 : texture2D(uHeight, g).b);
  // rock on the steep faces, its beds: a tone per bed, the bedding planes darker
  float bt = (wp.y + (wp.x * 0.6 + wp.z * 0.8) * 0.004) / uChar3.w;
  float bi = floor(bt), bf = bt - bi;
  float tone = hash12(vec2(bi * 7.13 + 1.7, 3.9));
  float bedTone = 1.0 + uChar4.x * (tone - 0.5) * 2.0;
  float plane = 1.0 - smoothstep(0.0, 0.08, bf) * smoothstep(0.0, 0.08, 1.0 - bf);
  vec3 rockC = mix(uRock, uRock2, tone > 0.55 ? 0.7 : 0.0) * bedTone * (1.0 - 0.54 * plane * uChar4.x);
  // the rock's own patches: warmer and cooler outcrops over a few hundred metres, weathered paler on the crests
  float rockN = noised(wp.xz / 420.0 + vec2(-6.1, 2.3)).x;
  rockC *= vec3(1.0 + 0.07 * rockN, 1.0 + 0.02 * rockN, 1.0 - 0.06 * rockN) * (1.0 + 0.12 * smoothstep(0.55, 0.95, hT));
  float rockW = smoothstep(uChar3.z, uChar3.z + 0.16, slope + 0.04 * n1);
  // the isolated peaks bare (the ice sheet's nunataks dark rock through the white, the field's cones their scoria): rock
  // on all but their gentlest ground
  float peak = smoothstep(0.08, 0.3, texture2D(uHeight, g).a);
  rockW = max(rockW, peak * smoothstep(0.03, 0.14, slope + 0.03 * n1));
  // (a jebel is bare rock over its whole footprint, its gently domed cap too: Wadi Rum's massifs carry no sand on top)
  if (uJebel.x > 0.0) rockW = max(rockW, smoothstep(0.3, 0.7, texture2D(uHeight, g).a));
  col = mix(col, rockC, rockW);
  // (a jebel's desert varnish, the tree-cover channel of a treeless country: dark streaks down its walls)
  if (uJebel.x > 0.0) col *= 1.0 - texture2D(uHeight, g).b;
  // scree on the moderate slopes below the rock
  col = mix(col, uScree, smoothstep(0.12, 0.24, slope) * (1.0 - rockW) * (1.0 - vegW) * 0.7);
  // snow above the snowline on the slopes that hold it
  // (no snow holds on a peak's steep faces)
  if (uChar3.x < 1.5) col = mix(col, uSnow, smoothstep(uChar3.x - 0.05, uChar3.x + 0.12, hT + 0.06 * n1) * (1.0 - smoothstep(0.3, 0.5, slope)) * (1.0 - 0.9 * peak * smoothstep(0.03, 0.12, slope)));
  col *= 1.0 + 0.08 * n1;
  // the sun with its cast shadows, the sky with its occlusion
  float ndl = max(0.0, dot(n, uSun));
  float fogL = (uFog.r + uFog.g + uFog.b) / 3.0;
  vec3 skyTint = 0.55 + 0.45 * uFog / max(1e-3, fogL);
  // the sun warm, the shade lit by the sky (cooler), a little light bounced up from the valleys
  vec3 sunC = uGains.y * 1.05 * ndl * light.r * vec3(1.06, 0.98, 0.86);
  vec3 skyC = uGains.x * (0.62 + 0.38 * n.y) * light.g * skyTint;
  vec3 bounce = uGains.x * 0.12 * (1.0 - n.y) * vec3(0.9, 0.85, 0.75);
  col *= sunC + skyC + bounce;
  return col;
}
void main() {
  float u = vUv.x, a = u * 6.2831853;
  float e = mix(uElev.x, uElev.y, vUv.y);
  float tanE = tan(e);
  // the march: grid rows near to far, the first whose elevation angle reaches e (the rows before it all fell short)
  float prevE = -2.0, prevV = 0.0, hitV = -1.0;
  for (int j = 0; j < 512; j++) {
    if (float(j) >= uGrid.y) break;
    float v = (float(j) + 0.5) / uGrid.y;
    float r = rowRadius(v);
    float h = texture2D(uHeight, vec2(u, v)).r;
    float ej = atan(h - uFrame.w, r);
    if (ej >= e) {
      float t = j == 0 ? 1.0 : clamp((e - prevE) / max(1e-6, ej - prevE), 0.0, 1.0);
      hitV = j == 0 ? v : mix(prevV, v, t);
      break;
    }
    prevE = ej; prevV = v;
  }
  if (hitV < 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 g = vec2(u, hitV);
  float rr = rowRadius(hitV);
  vec3 wp = vec3(cos(a) * rr, uFrame.w + tanE * rr, sin(a) * rr);
  vec3 n = gridNormal(g);
  // below the first row's elevation: the ground between the ring and the annulus (the shell's apron reads it from
  // below) — the ray's own meeting with that row's level, so the apron carries ground texture, not one streak per column
  float h0 = texture2D(uHeight, vec2(u, 0.5 / uGrid.y)).r;
  float apron = 0.0;
  if (hitV <= 0.5 / uGrid.y + 1e-5 && tanE < -1e-4 && h0 < uFrame.w) {
    // the first row's height smoothed round the compass (it carries the ring's outer heights, column by column)
    float hs = 0.0;
    for (int t = -4; t <= 4; t++) hs += texture2D(uHeight, vec2(u + float(t) * 3.0 / uGrid.x, 0.5 / uGrid.y)).r;
    h0 = hs / 9.0;
    rr = clamp((uFrame.w - h0) / -tanE, 300.0, uFrame.x);
    wp = vec3(cos(a) * rr, h0, sin(a) * rr);
    n = vec3(0.0, 1.0, 0.0);
    // the apron is seen at a grazing angle: one texel row spans hundreds of metres there, so its parcels, stands and
    // fine tones would stand as one streak per column (where a low ring shows it) — it keeps the broad tones only
    apron = 1.0;
  }
  // the texel's footprint on the ground along the ray (one strip row is 25/512 degrees): at a grazing angle it spans
  // hundreds of metres, and the parcels and the fine tones would alias into one streak per column (Saltmere's coast
  // where the ring is low) — they fade out over a 40-160 m footprint, the broad tones stay
  vec3 rayD = vec3(cos(e) * cos(a), sin(e), cos(e) * sin(a));
  float footprint = rr * ((uElev.y - uElev.x) / 512.0) / max(0.01, abs(dot(rayD, n)));
  // (the apron: its first row's light is one value per column — the near ridges' shadows across it — so it would streak;
  // it takes the open sky's)
  apron = max(apron, smoothstep(40.0, 160.0, footprint));
  // (a grazing reach's light too: its shadows and occlusion land a column apart as streaks — it takes a mild open sky)
  vec4 light = mix(texture2D(uLight, g), vec4(0.94, 0.9, 0.0, 1.0), apron);
  vec3 col = surfaceColour(g, wp, n, apron, light);
  float n1 = noised(wp.xz / 1900.0 + vec2(5.3, 1.7)).x * 0.7 + noised(wp.xz / 700.0 + vec2(-3.1, 8.2)).x * 0.3;
  float fogL = (uFog.r + uFog.g + uFog.b) / 3.0;
  vec3 skyTint = 0.55 + 0.45 * uFog / max(1e-3, fogL);
  vec4 edge = texture2D(uEdge, vec2(u, 0.5));
  // below the ring's own skyline from the eye the strip is hidden behind the ring — but a camera above the eye or off
  // the square's centre sees a band of it over the ring's outer rows, and there the strip grazes the near country, one
  // ground point per column (a band of vertical streaks over Saltmere's coast): it keeps one lit ground tone instead
  float hiddenW = 1.0 - smoothstep(atan(edge.a) - 0.012, atan(edge.a) - 0.002, e);
  if (hiddenW > 0.001) {
    // (a re-march from a higher eye was tried — the country behind the shell point seen from 300 m — and banded column
    // by column on the ridges it grazed: the fill stays a lit ground tone, its woods and fields as broad patches round
    // the compass, receding into the air toward the skyline so it reads as land falling away, not a sheet)
    vec2 sp = vec2(cos(a), sin(a)) * uFrame.z;
    float patchN = noised(sp / 900.0 + vec2(2.3, -7.1)).x * 0.6 + noised(sp / 340.0 + vec2(-4.4, 1.9)).x * 0.4;
    // (its ground the character's snow where the far country is white to its lowest swale — an ice sheet, a negative
    // snowline: the fill stood as a band of the battlefield's ground tone over Whiteout's low ring, the follow-up ticket)
    float fillSnow = uChar3.x < 0.0 ? 1.0 : 0.0;
    vec3 flatC = mix(uBase, uSnow, fillSnow) * (uGains.y * 1.05 * max(0.0, uSun.y) * vec3(1.06, 0.98, 0.86) + uGains.x * 0.82 * skyTint);
    vec3 fill = mix(flatC, flatC * uForest / max(vec3(1e-3), uBase) * 0.95, smoothstep(0.05, 0.45, patchN) * step(0.35, uChar3.y) * (1.0 - fillSnow));
    float recede = smoothstep(atan(edge.a) - 0.06, atan(edge.a), e);
    fill = mix(fill, uFog * 1.05, 0.25 + 0.35 * recede);
    col = mix(col, fill, hiddenW * 0.95);
  }
  // the sea sectors: the open water is the game's own (the sea apron, 4 km out, and the sky past it) — the strip leaves
  // it open, as the round-72 far range did (painted, it stood on the shell over the real water as a pale band, a wedge from
  // a camera off the centre); the ground the ring hides in a sea sector too (from the eye the ring there is the water)
  float sea = edge.g * step(wp.y, edge.b + 0.5);
  col = mix(col, uFog * 0.82, sea);
  // a channel coast's far reach (uShore.x > 0): past the sea apron the game draws no water, and the far shore stood over a
  // flat white stripe of open sky from the elevated views (gauntlet wave 24, Saltwind's establishing "a second, taller range
  // of sharp peaks floats above a flat white haze stripe"): the strip paints the channel past the apron as water, so the
  // far ridge sits on it; the near reach stays the game's own sea
  float farWater = uShore.x > 0.0 ? sea * smoothstep(${(SEA_APRON_OUTER_RADIUS_M - 150).toFixed(1)}, ${(SEA_APRON_OUTER_RADIUS_M + 50).toFixed(1)}, rr) : 0.0;
  col = mix(col, uFog * vec3(0.55, 0.62, 0.66), farWater);
  float open = max(smoothstep(0.02, 0.2, sea) * (1.0 - farWater), hiddenW * smoothstep(0.3, 0.7, edge.g));
  // the air past the shell. With the battlefield's sky published, the shared haze law (hazeLaw.ts; the coordinator,
  // 2026-10-03: "read it from hazeLaw rather than your own constants, so near and far stay consistent"): the aerial pass
  // hazes the shell's own depth, the bake the rest of the path to the far country — the same σ, the layer's density
  // between the eye and the point, the per-channel extinction, the same target. Without it the bake's own air (gauntlet
  // wave 6, "a flat, hazy, nearly featureless silhouette": a 13 km e-fold, a step under the fog's tone).
  if (uHaze.w > 0.5) {
    vec2 sunH = uSun.xz / max(length(uSun.xz), 1e-4);
    float toward = 0.5 + 0.5 * (cos(a) * sunH.x + sin(a) * sunH.y);
    vec3 target = mix(uHazeAnti, uHazeToward, toward * toward);
    float layer = hazeLayerMean(max(uFrame.w - uHaze.z, 0.0) * uHaze.y, max(wp.y - uHaze.z, 0.0) * uHaze.y);
    vec3 T = hazeTransmittance(uHaze.x, max(0.0, rr - uFrame.z), layer, uHazeChroma);
    col = col * T + target * (1.0 - T);
  } else {
    col = mix(col, uFog * 0.95, 1.0 - exp(-max(0.0, rr - uFrame.z) / 13000.0));
  }
  // into the cloud: a soft, broken fade over the deck's lowest 140 m
  float alpha = (1.0 - smoothstep(uChar4.y - 140.0, uChar4.y + 20.0, wp.y + 60.0 * noised(wp.xz / 260.0 + vec2(4.4, -2.9)).x)) * (1.0 - open);
  // premultiplied (paired capture d6: the skylines carried a dark dotted outline — the shell's filtered, mipmapped samples
  // at the edge averaged the land with the sky texels' black; the shell divides it back out)
  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)) * alpha, alpha);
}
`;

// --------------------------------------------------------------------------------------------------- the baker

/** The renderer surface the bake needs (production: the WebGLRenderer). */
export interface HorizonPanoramaRenderer {
  capabilities: { isWebGL2: boolean; maxTextureSize: number };
  extensions: { has(name: string): boolean };
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  autoClear: boolean;
  getClearColor(target: THREE.Color): THREE.Color;
  getClearAlpha(): number;
  setClearColor(color: THREE.Color, alpha: number): void;
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
  xr?: { enabled: boolean };
}

export interface HorizonPanoramaHandle {
  /** the mesh drawn once the atlas is baked */
  readonly mesh: THREE.Mesh;
  readonly baked: boolean;
  /** bake when a capable renderer is present and the atlas is not baked; true when baked after the call */
  ensureBaked(renderer: HorizonPanoramaRenderer | null | undefined): boolean;
  dispose(): void;
  /** the last bake's duration (ms) and count, for the probes; `tone`: whether the battlefield's own ground and rock
   * means coloured the bake ('ground') or the authored palette did ('authored') */
  readonly stats: { bakes: number; ms: number; unsupported: string | null; tone: 'authored' | 'ground';
    /** the haze law's terms the bake took (the overcast it read, the published light model's, σ, the targets), for the probes */
    hazeTerms: { overcast: number; published: number; sigma: number; anti: number[]; toward: number[] } | null };
  /**
   * The battlefield's own ground and rock albedo means (linear), so the far country continues the ring's terrain
   * material instead of the authored hill palette (Sirocco Wadi's far tables were saturated orange behind a pale
   * sand ring). Taken only before the bake (a later bake would hitch a frame); false when it came too late.
   */
  setGroundTone(ground: THREE.Color | null, rock: THREE.Color | null): boolean;
}

const _clear = new THREE.Color();

/**
 * The panorama for a ring: the shell mesh (hidden until baked) and its baker. `fallback` is the round-72 far range: it
 * stays visible until the bake succeeds and comes back when a GPU suspension disposes the atlas.
 */
export function createHorizonPanorama(options: HorizonPanoramaOptions, fallback: THREE.Object3D | null): HorizonPanoramaHandle {
  const P = HORIZON_PANORAMA;
  const ch = resolveHorizonPanoramaCharacter(options.character, options.overrides);
  const geometry = buildHorizonPanoramaShellGeometry(options.ringEdge);
  const material = buildShellMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  // the far range's name: the battle atmosphere dims every 'horizon-far-range' mesh's colour at night
  // (battleAtmosphereRuntime.ts), and the panorama is that range now; lookups by name still find the round-72 mesh, the
  // ring's first child of the name
  mesh.name = 'horizon-far-range';
  mesh.userData.horizonPanorama = true;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.userData.aoExclude = true;
  let atlas: THREE.WebGLRenderTarget | null = null;
  let baked = false;
  const stats = { bakes: 0, ms: 0, unsupported: null as string | null, tone: 'authored' as 'authored' | 'ground', haze: 'own' as 'own' | 'law',
    hazeTerms: null as { overcast: number; published: number; sigma: number; anti: number[]; toward: number[] } | null };
  let skyWaits = 0;
  const publishedSky = (): { atmosphere?: PanoramaAtmosphere; overcast: number } => {
    let root: THREE.Object3D = mesh;
    while (root.parent) root = root.parent;
    const data = root.userData as { atmosphere?: PanoramaAtmosphere; lightModel?: { overcast?: number } };
    return { atmosphere: data.atmosphere, overcast: data.lightModel?.overcast ?? 0 };
  };
  const publishedSkyPending = (): boolean => {
    const { atmosphere, overcast } = publishedSky();
    return !!atmosphere?.active && !horizonPanoramaHaze(atmosphere, options.sun, options.fogDensity, overcast);
  };
  // the haze law's datum: the ground at the square's edge (the ring's seam rows, a low quartile) — the aerial pass takes
  // the ground under the camera
  const hazeDatumM = (() => {
    const hs: number[] = [], e = options.ringEdge;
    for (let i = 0; i < e.heights.length; i++) if (Math.hypot(e.positions[i * 3], e.positions[i * 3 + 2]) < 600) hs.push(e.heights[i]);
    hs.sort((a, b) => a - b);
    return hs.length ? hs[Math.floor(hs.length * 0.25)] : 0;
  })();
  const palette = { ...options.palette };

  // the per-azimuth edge data: the ring's outer height, the sea weight and level, and the tangent of the ring's own
  // skyline elevation from the bake eye (half floats, filtered)
  const EDGE_W = 1024;
  const edgeData = new Uint16Array(EDGE_W * 4);
  const ringSkyline = horizonRingSkylineTan(options.ringEdge, P.eyeY);
  // the sea weight round the compass, softened over about 4 degrees each way: the far country beside a bay dropped to
  // the sea in a degree or two of azimuth — at 5 km a wall a few hundred metres wide (Nordhavn Fjord's far block)
  const seaW = new Float32Array(EDGE_W), seaL = new Float32Array(EDGE_W);
  for (let i = 0; i < EDGE_W; i++) {
    const sea = options.seaWeightAt ? options.seaWeightAt((i / EDGE_W) * Math.PI * 2) : { weight: 0, level: 0 };
    seaW[i] = sea.weight; seaL[i] = sea.level;
  }
  {
    const R = Math.round(EDGE_W * 4 / 360), tmp = new Float32Array(EDGE_W);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < EDGE_W; i++) { let sum = 0; for (let d = -R; d <= R; d++) sum += seaW[(i + d + EDGE_W) % EDGE_W]; tmp[i] = sum / (2 * R + 1); }
      seaW.set(tmp);
    }
  }
  {
    const n = options.ringEdge.columns, start = options.ringEdge.heights.length - n;
    for (let i = 0; i < EDGE_W; i++) {
      const angle = (i / EDGE_W) * Math.PI * 2;
      // the ring's last row by angle (its columns are not exactly even after the seam work: nearest by angle)
      const k = Math.round((angle / (Math.PI * 2)) * n) % n;
      // averaged over nine columns (about 7.5 degrees): the outer row is jagged column to column, and the far country's
      // first kilometre eases out of it, so a raw column stood in the strip as a streak
      let h = 0;
      for (let d = -4; d <= 4; d++) h += options.ringEdge.heights[start + ((k + d) % n + n) % n];
      h /= 9;
      edgeData[i * 4] = THREE.DataUtils.toHalfFloat(h);
      edgeData[i * 4 + 1] = THREE.DataUtils.toHalfFloat(seaW[i]);
      edgeData[i * 4 + 2] = THREE.DataUtils.toHalfFloat(seaL[i]);
      edgeData[i * 4 + 3] = THREE.DataUtils.toHalfFloat(ringSkyline[k]);
    }
  }

  const unsupported = (renderer: HorizonPanoramaRenderer): string | null => {
    if (!renderer.capabilities?.isWebGL2) return 'webgl1';
    if ((renderer.capabilities.maxTextureSize ?? 0) < (options.resolution ?? P).width) return 'max texture size';
    if (!renderer.extensions?.has('EXT_color_buffer_float') && !renderer.extensions?.has('EXT_color_buffer_half_float')) return 'no float render targets';
    return null;
  };

  function bake(renderer: HorizonPanoramaRenderer): void {
    const started = performance.now();
    // the battlefield's published sky, where the shell already hangs in the scene (the world's warm-up)
    const published = publishedSky();
    const haze = horizonPanoramaHaze(published.atmosphere, options.sun, options.fogDensity, options.overcast ?? published.overcast);
    stats.haze = haze ? 'law' : 'own';
    const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
    stats.hazeTerms = haze ? { overcast: r4(options.overcast ?? published.overcast), published: r4(published.overcast), sigma: haze.sigma,
      anti: [haze.anti.x, haze.anti.y, haze.anti.z].map(r4), toward: [haze.toward.x, haze.toward.y, haze.toward.z].map(r4) } : null;
    const rng = mulberry32((options.seed ^ 0x9A70) >>> 0);
    const off = Array.from({ length: 16 }, () => rng() * 200 - 100);
    const linear = (c: THREE.Color): THREE.Vector3 => new THREE.Vector3(c.r, c.g, c.b);
    const rock = palette.rock;
    const tables = ch.tables;
    const rock2 = tables ? new THREE.Vector3(rock.r * 1.22, rock.g * 1.05, rock.b * 0.92) : new THREE.Vector3(rock.r * 0.86, rock.g * 0.9, rock.b * 0.98);
    const scree = new THREE.Vector3(rock.r * 1.12 + 0.02, rock.g * 1.1 + 0.02, rock.b * 1.08 + 0.02);
    const edgeTex = new THREE.DataTexture(edgeData, EDGE_W, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    edgeTex.wrapS = THREE.RepeatWrapping; edgeTex.magFilter = THREE.LinearFilter; edgeTex.minFilter = THREE.LinearFilter;
    edgeTex.needsUpdate = true;
    const common = {
      uOff0: { value: new THREE.Vector4(off[0], off[1], off[2], off[3]) },
      uOff1: { value: new THREE.Vector4(off[4], off[5], off[6], off[7]) },
      uOff2: { value: new THREE.Vector4(off[8], off[9], off[10], off[11]) },
      uOff3: { value: new THREE.Vector4(off[12], off[13], off[14], off[15]) },
      uChar0: { value: new THREE.Vector4(ch.ampM, ch.foot, ch.macroL, ch.sharp) },
      uChar1: { value: new THREE.Vector4(ch.midL, ch.gullyL, ch.gullyM, ch.warpM) },
      // .w: the layers' strength, negative for the plinth (the hill countries)
      uChar2: { value: new THREE.Vector4(ch.valley, ch.valleyL, tables ? 1 : 0, ch.plinth ? -ch.layers : ch.layers) },
      // the snowline and the treeline as fractions of the amplitude the strip's law reads them by (the ring's own
      // altitudes where it has them)
      uChar3: { value: new THREE.Vector4(
        // (a negative snowline is the character's own, under every height: an ice sheet is white to its lowest swale —
        // the ring's snowline over a 110 m sheet left its lows bare, Whiteout's horizon a band of the battlefield's ground
        // tone, regional ticket 2026-10-03)
        options.snowlineM != null && ch.snowline >= 0 ? options.snowlineM / ch.ampM : ch.snowline,
        options.treelineM != null ? options.treelineM / ch.ampM : ch.treeline, ch.rockSlope, ch.bedM) },
      uChar4: { value: new THREE.Vector4(ch.strata, options.deckBaseM, ch.ampM, ch.farRise) },
      uShore: { value: new THREE.Vector4(ch.shore, ch.shoreM, ch.shoreRange, 0) },
      uTrees: { value: new THREE.Vector4(ch.trees, ch.forestSlope, 0, 0) },
      uMesa: { value: new THREE.Vector4(ch.mesaTalusM, ch.mesaTalusShare, ch.mesaCliffM, ch.mesaFluteM) },
      uPeaks: { value: new THREE.Vector4(ch.peakShare, ch.peakM, ch.peakRadiusM, ch.peakSharp) },
      uJebel: { value: new THREE.Vector4(ch.jebelShare, ch.jebelM, ch.jebelRadiusM, ch.jebelBossM) },
      uJebel2: { value: new THREE.Vector4(ch.jebelFoot, ch.jebelRim, ch.jebelApron, ch.jebelFlutes) },
      uJebel3: { value: new THREE.Vector4(ch.jebelFluteDepth, ch.jebelFootVary, ch.jebelVarnish, 0) },
      uFrame: { value: new THREE.Vector4(P.innerM, P.outerM, P.shellM, P.eyeY) },
      uHaze: { value: new THREE.Vector4(haze?.sigma ?? 0, haze?.invScale ?? 0, hazeDatumM, haze ? 1 : 0) },
      uHazeChroma: { value: new THREE.Vector3(...HAZE_EXT_CHROMA) },
      uHazeAnti: { value: haze?.anti ?? new THREE.Vector3() },
      uHazeToward: { value: haze?.toward ?? new THREE.Vector3() },
      uGrid: { value: new THREE.Vector2((options.resolution ?? P).gridA, (options.resolution ?? P).gridR) },
      uEdge: { value: edgeTex },
      uSun: { value: new THREE.Vector3(...options.sun).normalize() },
      uGains: { value: new THREE.Vector2(options.gains.ambient, options.gains.sunGain) },
      uElev: { value: new THREE.Vector2(P.elevMin, P.elevMax) },
      uBase: { value: linear(palette.base) }, uRock: { value: linear(rock) }, uRock2: { value: rock2 },
      uScree: { value: scree }, uSnow: { value: linear(palette.snow) }, uForest: { value: linear(palette.forest) },
      uFog: { value: linear(palette.fog) },
    };
    const target = (w: number, h: number, type: THREE.TextureDataType, mips: boolean): THREE.WebGLRenderTarget => new THREE.WebGLRenderTarget(w, h, {
      type, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: mips,
      minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    const res = options.resolution ?? P;
    const heightRT = target(res.gridA, res.gridR, THREE.HalfFloatType, false);
    const lightRT = target(res.gridA, res.gridR, THREE.UnsignedByteType, false);
    const stripRT = target(res.width, res.height, THREE.UnsignedByteType, true);
    stripRT.texture.colorSpace = THREE.NoColorSpace;
    stripRT.texture.anisotropy = 4;
    stripRT.texture.name = 'horizon-panorama-atlas';
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    const scene = new THREE.Scene(); scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pass = (fragmentShader: string, extra: Record<string, THREE.IUniform>): THREE.ShaderMaterial => new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX, fragmentShader, uniforms: { ...common, ...extra }, depthTest: false, depthWrite: false,
    });
    const heightMat = pass(HEIGHT_FRAGMENT, {});
    const lightMat = pass(LIGHT_FRAGMENT, { uHeight: { value: heightRT.texture } });
    const stripMat = pass(STRIP_FRAGMENT, { uHeight: { value: heightRT.texture }, uLight: { value: lightRT.texture } });
    const previousTarget = renderer.getRenderTarget();
    const previousColor = renderer.getClearColor(_clear).clone();
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousXr = renderer.xr?.enabled;
    try {
      renderer.autoClear = false;
      if (renderer.xr) renderer.xr.enabled = false;
      renderer.setClearColor(_clear.setRGB(0, 0, 0), 0);
      for (const [mat, rt] of [[heightMat, heightRT], [lightMat, lightRT], [stripMat, stripRT]] as const) {
        quad.material = mat;
        renderer.setRenderTarget(rt);
        renderer.clear(true, false, false);
        renderer.render(scene, camera);
      }
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.autoClear = previousAutoClear;
      if (renderer.xr && previousXr !== undefined) renderer.xr.enabled = previousXr;
      for (const m of [heightMat, lightMat, stripMat]) m.dispose();
      quad.geometry.dispose();
      heightRT.dispose(); lightRT.dispose(); edgeTex.dispose();
    }
    if (atlas) atlas.dispose();
    atlas = stripRT;
    // a GPU suspension (resourceLifetime) disposes the atlas texture: free its framebuffer, show the fallback again and
    // bake once more on the next request
    stripRT.texture.addEventListener('dispose', () => {
      if (atlas !== stripRT) return;
      baked = false; atlas = null; stripRT.dispose();
      mesh.visible = false;
      if (fallback) fallback.visible = true;
    });
    material.map = stripRT.texture;
    material.needsUpdate = true;
    mesh.visible = true;
    if (fallback) fallback.visible = false;
    baked = true;
    stats.bakes++;
    stats.ms = Math.round(performance.now() - started);
  }

  return {
    mesh,
    get baked() { return baked; },
    stats,
    setGroundTone(ground, rock) {
      if (baked || stats.bakes > 0) return false;
      if (ground) palette.base = ground.clone();
      if (rock) palette.rock = rock.clone();
      if (ground || rock) stats.tone = 'ground';
      return !!(ground || rock);
    },
    ensureBaked(renderer) {
      if (baked) return true;
      if (!renderer) return false;
      const why = unsupported(renderer);
      if (why) { stats.unsupported = why; return false; }
      // while the battlefield still publishes another map's (or hour's) sky, wait for this one's (up to about two seconds
      // of frames), so the far country takes its haze law; with no published sky at all (the labs, the receipts, the
      // mobile tier) bake at once (regional ticket 2026-10-03: in the shots' flow every map after the first baked before
      // its own sky was applied and kept the bake's own air)
      if (skyWaits < HORIZON_PANORAMA_SKY_WAIT_FRAMES && publishedSkyPending()) { skyWaits++; return false; }
      bake(renderer);
      return baked;
    },
    dispose() {
      if (atlas) { const a = atlas; atlas = null; baked = false; a.dispose(); }
      geometry.dispose();
      material.dispose();
    },
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The bake's shader sources, for the receipts (a structural check: the passes compile against the same uniforms). */
export const HORIZON_PANORAMA_SHADERS = Object.freeze({ vertex: QUAD_VERTEX, height: HEIGHT_FRAGMENT, light: LIGHT_FRAGMENT, strip: STRIP_FRAGMENT });
