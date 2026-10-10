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
import { ATMO_GROUND_KM, ATMOSPHERE_SKY_GLSL, type AtmosphereParams } from '../engine/atmosphere.ts';
import { CLOUD_SHADE_PARS_GLSL } from '../engine/cloudShadeMap.ts';
import { authoredSunOf, lightTune, resolveLightModel, type LightModel, type LightModelPreset, type Rgb } from '../engine/lightModelCore.ts';
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
  /** the bake's own air over the far path as a share of the haze law's σ (1: the map's fogDensity; a clean coast's air
   * less) — the same law, layer, chroma and target */
  air: number;
  /** the fill below the ring's skyline from the eye (what a camera above it sees over the ring's crest): 0, the lit
   * ground pushed toward the fog colour; 1, the lowland's own cover under the law's air over its reach */
  fillLaw: number;
  /** bare rock only above this share of the relief's height (the scrub holds the steep lower slopes); below 0: rock on
   * every steep face */
  rockFloor: number;
  /** a dry coast's scrub (the maquis): its share of the vegetated ground (rather than the temperate mosaic of woods,
   * meadows and fields), and its cover in the gullies up the bare faces, so the limestone stands on the spurs */
  scrub: number;
  /** 1: the far country keeps the map's authored rock instead of the battlefield's rock mean (setGroundTone) — Saltwind's
   * mainland is pale limestone, its battlefield rock a dark brown (gauntlet wave 32: "pale bare limestone on the upper
   * faces"; with the battlefield's rock its ridge held 17 levels of shading) */
  ownRock: number;
  /** sheer jebels standing alone on the plain (maps lane A's inselberg section, horizonJebelSection): the share of
   * 2.6 km cells holding one, its height (m), its radius (m), the wall's foot and the cap's rim (fractions of the radius
   * and of the foot), the talus apron's share of the height, the flutes round the wall and their depth, the cap's
   * bosses (m) and the foot's wander; 0 share: none */
  jebelShare: number; jebelM: number; jebelRadiusM: number; jebelFoot: number; jebelRim: number; jebelApron: number;
  jebelFlutes: number; jebelFluteDepth: number; jebelBossM: number; jebelFootVary: number;
  /** desert varnish down the jebels' walls: the darkening of its streaks (0: none) */
  jebelVarnish: number;
  /** the nearest a jebel's near edge stands from the battlefield's centre (m). The massifs stand clear of the near band's
   * pressing under the ring's skyline (that cut a near massif's top dead flat, gauntlet wave 50: "near-rectangular blocks
   * with dead-flat tops"), so this keeps them past the shell, where the shell's parallax stays small */
  jebelNearM: number;
}

/** The knobs most characters leave at rest: open sea, no tree canopy, the eroded mesa's profile, no isolated peaks. */
const PANO_EXTRAS = Object.freeze({
  shore: 0, shoreM: 5600, shoreRange: 0, trees: 0,
  mesaTalusM: 700, mesaTalusShare: 0.55, mesaCliffM: 50, mesaFluteM: 45,
  peakShare: 0, peakM: 0, peakRadiusM: 600, peakSharp: 1.5,
  forestSlope: 0.32,
  air: 1, fillLaw: 0, rockFloor: -1, scrub: 0, ownRock: 0,
  jebelShare: 0, jebelM: 0, jebelRadiusM: 900, jebelFoot: 0.66, jebelRim: 0.86, jebelApron: 0.18,
  jebelFlutes: 16, jebelFluteDepth: 0.5, jebelBossM: 0, jebelFootVary: 0.14, jebelVarnish: 0, jebelNearM: 0,
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
  /** 2026-10-05 (Part 1, the skies lane): bake the cloud shade's aux (STRIP_AUX_FRAGMENT) so the far country takes the
   * clouds' shadows; the desktop tier only (phones have no cloud shade map) */
  cloudShade?: boolean;
  /** the map's authored fogDensity: the shared haze law's σ (hazeLaw.ts) for the far country past the shell */
  fogDensity?: number | null;
  /** the map's own overcast fraction (lightModelCore resolveOvercast of its sky and cloudscape): the haze target's terms
   * under its deck — the light model the battlefield publishes can still be the last map's when the bake runs */
  overcast?: number | null;
  /** the battlefield's ground (world x, z → y), the aerial pass's haze datum under the camera (post.ts
   *  setGroundHeightSource): the far earth lands on the screen's horizon through that pass */
  groundAt?: ((x: number, z: number) => number) | null;
  /**
   * 2026-10-08 (the nightsky lane; the owner: "on sunsets and nights, the far skybox is still like glowing instead of
   * having the right lighting"): the map's authored sky preset (its sky block with its cloudscape) — the day light the
   * bake's gains were tuned under. relight() rebuilds that light with the grounded model (lightModelCore.ts) from the sky
   * the first bake saw, and re-bakes the far country under the light the battlefield now publishes. Absent: the far
   * country keeps its day bake (relight() reports false and the night dim stands).
   */
  lightPreset?: LightModelPreset | null;
}

/** How many frames a bake waits for the battlefield to publish this map's own sky before it keeps its own air. */
const HORIZON_PANORAMA_SKY_WAIT_FRAMES = 120;

/** What the bake reads of the sky the battlefield publishes (sky.ts scene.userData.atmosphere). */
interface PanoramaAtmosphere {
  active?: boolean;
  sunDir?: { x: number; y: number; z: number };
  fogDensity?: number; fogMix?: number; fogTint?: THREE.Color;
  summary?: { horizon: THREE.Color; sunHorizon: THREE.Color } | null;
  /** the sky-view LUT and what sampling it needs (sky.ts AtmospherePublishedState; read, never written) */
  skyView?: THREE.Texture | null; viewHeightKm?: number; knee?: THREE.Vector3; skyIntensity?: number;
  /** the atmosphere's parameters and its raw sky irradiance (the grounded light model's inputs; relight) */
  params?: AtmosphereParams | null; irradianceRaw?: THREE.Color;
}

/**
 * The light a far face takes under a light model and the sky it was resolved under (lightModel.ts's terms: irradiance in
 * light units, per channel), as the battlefield's lit materials take it: the key light's at normal incidence (the sun,
 * the night's moon), and the sky's on a level face — the environment's diffuse share with the hue it keeps
 * (envDiffuseChroma) plus the hemisphere's glow (an overcast deck's, the night sky's).
 */
export function horizonFarLight(model: LightModel, irradianceRaw: Rgb): { sun: [number, number, number]; sky: [number, number, number] } {
  const lumIrr = 0.2126 * irradianceRaw[0] + 0.7152 * irradianceRaw[1] + 0.0722 * irradianceRaw[2];
  const env = Math.PI * lumIrr * model.envIntensity * model.envDiffuseGain;
  const chroma = model.envDiffuseChroma;
  const hue = (c: number): number => (lumIrr > 1e-9 ? irradianceRaw[c] / lumIrr : 1);
  const sky = [0, 1, 2].map((c) => env * (1 + (hue(c) - 1) * chroma) + model.hemiIntensity * model.hemiSky[c]) as [number, number, number];
  const sun = [0, 1, 2].map((c) => model.sunIntensity * model.sunColor[c]) as [number, number, number];
  return { sun, sky };
}

/** The light the far country is baked under, against the day its gains were tuned for (horizonPanoramaRelight). */
export interface HorizonPanoramaLight {
  /** the key light's direction (unit, toward it): the sun, or the night's moon */
  sun: [number, number, number];
  /** the live light over the day's, per channel: the sun's term, the sky's, and the valleys' bounce (the level ground's
   * whole light, which the bounce carries up) */
  sunScale: [number, number, number];
  skyScale: [number, number, number];
  bounceScale: [number, number, number];
  /** the live sky's luminance at the horizon over the day's: the bake's own air colour (its fog: the fill under the
   * skyline, the channel's far water, the air it keeps without a published law) */
  airScale: number;
}

/** One side of a relight: a resolved light model, the sky it was resolved under and that sky's horizon (both bands). */
export interface HorizonPanoramaLightSample {
  model: LightModel;
  irradianceRaw: Rgb;
  horizon: Rgb;
  sunHorizon: Rgb;
  /** unit vector toward the key light */
  sunDir: readonly [number, number, number];
}

/** The bake's own day light on a level face (STRIP_FRAGMENT's surface law: its gains, the warm sun, the fog's sky tint and
 * a typical sky occlusion), which relight holds to the battlefield's level ground. */
export interface HorizonPanoramaBakeLight {
  gains: { ambient: number; sunGain: number };
  /** the bake's fog colour (linear): the hue of its sky term (skyTint) */
  fog: Rgb;
}
/** The strip's sun warmth and a level face's typical sky occlusion (light.g), for the level-face match. */
const STRIP_SUN_WARM: Rgb = [1.06, 0.98, 0.86];
const LEVEL_SKY_OCCLUSION = 0.9;

/**
 * The relight of the far country (2026-10-08, the nightsky lane): the bake's sun and sky terms scaled per channel by the
 * live light over the day light its gains were tuned under, the key light's own direction, and its own air scaled by the
 * sky at the horizon. Null when the live light is the day's (the authored day bake stands, byte for byte). Ratios are
 * clamped to [0, 4]: a term the day lacked (none at all) keeps its day value.
 *
 * With the bake's own light (`bake`), the sun and sky scales also take one per-channel factor that holds a level far face
 * to the battlefield's level ground: the bake's day split between its sun and sky terms is its calibration, not the light
 * model's, and a night lit mostly by the sky would otherwise leave the far land brighter against the near ground than by
 * day (the receipt measured up to 1.9 times). The sun's share against the sky's keeps the per-term ratios; the bounce
 * already carries the level ground's whole light.
 */
export function horizonPanoramaRelight(day: HorizonPanoramaLightSample, live: HorizonPanoramaLightSample,
  bake: HorizonPanoramaBakeLight | null = null): HorizonPanoramaLight | null {
  const d = horizonFarLight(day.model, day.irradianceRaw), l = horizonFarLight(live.model, live.irradianceRaw);
  const ratio = (a: number, b: number): number => (b > 1e-9 ? Math.min(4, Math.max(0, a / b)) : 1);
  const sinD = Math.max(0, day.sunDir[1]), sinL = Math.max(0, live.sunDir[1]);
  const sunScale = [0, 1, 2].map((c) => ratio(l.sun[c], d.sun[c])) as [number, number, number];
  const skyScale = [0, 1, 2].map((c) => ratio(l.sky[c], d.sky[c])) as [number, number, number];
  const bounceScale = [0, 1, 2].map((c) => ratio(l.sun[c] * sinL + l.sky[c], d.sun[c] * sinD + d.sky[c])) as [number, number, number];
  const lum = (a: Rgb, b: Rgb): number => 0.2126 * (a[0] + b[0]) + 0.7152 * (a[1] + b[1]) + 0.0722 * (a[2] + b[2]);
  const airScale = ratio(lum(live.horizon, live.sunHorizon), lum(day.horizon, day.sunHorizon));
  const ll = Math.hypot(live.sunDir[0], live.sunDir[1], live.sunDir[2]) || 1;
  const sun = [live.sunDir[0] / ll, live.sunDir[1] / ll, live.sunDir[2] / ll] as [number, number, number];
  const dl = Math.hypot(day.sunDir[0], day.sunDir[1], day.sunDir[2]) || 1;
  const same = (v: number): boolean => Math.abs(v - 1) < 1e-9;
  // the day's own light: the authored bake stands
  if ((sun[0] * day.sunDir[0] + sun[1] * day.sunDir[1] + sun[2] * day.sunDir[2]) / dl > 1 - 1e-9
    && [...sunScale, ...skyScale, ...bounceScale, airScale].every(same)) return null;
  if (bake) {
    const fogL = Math.max(1e-3, (bake.fog[0] + bake.fog[1] + bake.fog[2]) / 3);
    const level = (c: number, sunS: number, skyS: number, sinEl: number): number => bake.gains.sunGain * 1.05 * sinEl * STRIP_SUN_WARM[c] * sunS
      + bake.gains.ambient * LEVEL_SKY_OCCLUSION * (0.55 + 0.45 * bake.fog[c] / fogL) * skyS;
    for (let c = 0; c < 3; c++) {
      const far = ratio(level(c, sunScale[c], skyScale[c], sinL), level(c, 1, 1, sinD));
      const fix = far > 1e-9 ? bounceScale[c] / far : 1;
      sunScale[c] = Math.min(4, sunScale[c] * fix);
      skyScale[c] = Math.min(4, skyScale[c] * fix);
    }
    // The day bake lights a level far face brighter than the battlefield lights its own level ground (its gains against
    // the light model's day: about 1.3 to 1.6 times, the calibration the critics scored by day). Under another light the
    // far land is never lit brighter than the near ground of the same albedo (the coordinator, 2026-10-08: "never brighter
    // than the near terrain under the same light"): every term comes down by that excess, by its luminance (no hue shift).
    const lumOf = (f: (c: number) => number): number => 0.2126 * f(0) + 0.7152 * f(1) + 0.0722 * f(2);
    const excess = lumOf((c) => level(c, 1, 1, sinD)) / Math.max(1e-9, lumOf((c) => (d.sun[c] * sinD + d.sky[c]) / Math.PI));
    if (excess > 1) {
      for (let c = 0; c < 3; c++) { sunScale[c] /= excess; skyScale[c] /= excess; bounceScale[c] /= excess; }
    }
  }
  return { sun, sunScale, skyScale, bounceScale, airScale };
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
  const terms = hazeTargetTerms(overcast, atmosphere.fogMix ?? 0, { x: 0, y: 0 });
  const mix = terms.x, targetK = terms.y;
  const tint = atmosphere.fogTint, tintL = Math.max(0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b, 1e-4);
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
    jebelShare: 0.65, jebelM: 720, jebelRadiusM: 700, jebelFoot: 0.66, jebelRim: 0.86, jebelApron: 0.18, jebelFlutes: 20, jebelFluteDepth: 0.8, jebelBossM: 110, jebelFootVary: 0.14, jebelVarnish: 0.55, jebelNearM: 3000 },
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
 * vertex carries its azimuth fraction (u, continuous across the seam: column n repeats column 0 at u = 1), and v marks
 * the ground rows (1 on the edge and the apron, 0 on the wall): the apron is ground and never reads sky.
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
      uvs[o * 2] = k / n; uvs[o * 2 + 1] = row <= P.apronM.length ? 1 : 0;
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

/** The shell's uniforms the bake fills: the strip's skyline per column (SKYLINE_FRAGMENT) and the far path's haze law
 *  (σ times the map's air share, the layer's inverse scale, the datum, on; the targets away from and toward the sun; the
 *  sun's bearing; the per-channel extinction) */
interface ShellAir {
  uPanoSkyline: THREE.IUniform<THREE.Texture | null>;
  uPanoHaze: THREE.IUniform<THREE.Vector4>;
  uPanoHazeAnti: THREE.IUniform<THREE.Vector3>;
  uPanoHazeToward: THREE.IUniform<THREE.Vector3>;
  uPanoSunH: THREE.IUniform<THREE.Vector2>;
  uPanoHazeChroma: THREE.IUniform<THREE.Vector3>;
  /** the aerial pass's σ over the shell's depth (the law's, no air share) */
  uPanoSigmaPost: THREE.IUniform<number>;
  /** the dome's own lookup (atmosphere.ts ATMOSPHERE_SKY_GLSL, bound read-only from the published atmosphere each draw) */
  tAtmoSky: THREE.IUniform<THREE.Texture | null>;
  uAtmoSun: THREE.IUniform<THREE.Vector3>;
  uAtmoViewH: THREE.IUniform<number>;
  uAtmoKnee: THREE.IUniform<THREE.Vector3>;
  uAtmoIntensity: THREE.IUniform<number>;
  /** the aerial pass's terms each draw: the fog tint; (its share, the target's level, the overcast); the haze datum
   *  under the camera; whether the dome's lookup is live */
  uPanoTint: THREE.IUniform<THREE.Vector3>;
  uPanoTerms: THREE.IUniform<THREE.Vector3>;
  /** the dome's deck greying, its own uniforms copied each draw (sky.ts: the tint and its weight by the overcast, the
   *  closed deck's), read-only (DOME_DECK_GREY_GLSL) */
  uDeckHorizon: THREE.IUniform<THREE.Vector4>;
  uDeckClosed: THREE.IUniform<number>;
  uPanoDatum: THREE.IUniform<number>;
  uPanoSkyOn: THREE.IUniform<number>;
  /** the cloud layer's composite, its dome's own uniforms copied each draw (CLOUD_COMPOSITE_GLSL), read-only; whether
   *  the layer draws; the frame's view-projection (the screen the dome samples the clouds' history in) */
  tClouds: THREE.IUniform<THREE.Texture | null>;
  uHistorySize: THREE.IUniform<THREE.Vector2>;
  uKnee: THREE.IUniform<THREE.Vector3>;
  uSkyIntensity: THREE.IUniform<number>;
  uFlash: THREE.IUniform<THREE.Vector4>;
  uFlashTint: THREE.IUniform<THREE.Vector3>;
  uSunDir: THREE.IUniform<THREE.Vector3>;
  uInside: THREE.IUniform<number>;
  uPanoCloudOn: THREE.IUniform<number>;
  uPanoViewProj: THREE.IUniform<THREE.Matrix4>;
  /** the aerial pass's cloud shade, as post.ts sets it each frame (AERIAL_CLOUD_SHADE_GLSL) */
  uCloudShade: THREE.IUniform<number>;
  /** 2026-10-05 (Part 1): the far country's cloud shadows — the bake's aux (premultiplied: r the land's distance from the
   *  eye / 10 km, g the sun's share of the texel's colour, b the coverage), whether the shade is on this draw, and the
   *  shared shade map's uniforms (cloudShadeMap.ts), pointed at the layer's each draw */
  uPanoAux: THREE.IUniform<THREE.Texture | null>;
  uPanoShadeOn: THREE.IUniform<number>;
  tCotCloudShade: THREE.IUniform<THREE.Texture | null>;
  uCotCloudShade: THREE.IUniform<THREE.Vector4>;
  uCotCloudSun: THREE.IUniform<THREE.Vector4>;
}

/** The dome's deck greying (sky.ts ATMOSPHERE_DOME_FRAGMENT: the deck's grey at the horizon, a closed deck's at every
 * elevation), which the far earth's screen horizon goes through. sky.ts keeps it inline in the dome's fragment rather than
 * as a chunk, so this is a copy of its statements, wrapped in a function: horizonPanoramaDeck.selftest.mjs evaluates the
 * dome's statements, read out of sky.ts, and this function's on the same skies, directions, overcasts and knobs, and
 * fails on any difference. Its uniforms are the dome's own, copied each draw (the shell's onBeforeRender), so the knob,
 * the light model's mode and the tint are the dome's too. */
const DOME_DECK_GREY_GLSL = /* glsl */`
uniform vec4 uDeckHorizon;
uniform float uDeckClosed;
vec3 panoDeckGrey( vec3 skyCol, vec3 direction ) {
	float deckW = max( uDeckHorizon.w * ( 1.0 - smoothstep( 0.0, 0.12, direction.y ) ), uDeckClosed );
	if ( deckW > 0.0 ) {
		float deckTintL = max( dot( uDeckHorizon.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 );
		float deckL = dot( skyCol, vec3( 0.2126, 0.7152, 0.0722 ) );
		if ( uDeckClosed > 0.0 ) {
			vec2 hzXZ = length( direction.xz ) > 1e-4 ? normalize( direction.xz ) : vec2( 1.0, 0.0 );
			deckL = mix( deckL, dot( atmoSky( vec3( hzXZ.x, 0.0, hzXZ.y ) ), vec3( 0.2126, 0.7152, 0.0722 ) ), uDeckClosed );
		}
		skyCol = mix( skyCol, uDeckHorizon.rgb * ( deckL / deckTintL ), deckW );
	}
	return skyCol;
}
`;

/** The cloud layer's composite (volumetricClouds.ts DOME_FRAGMENT), which the far earth's screen horizon goes through:
 * what the frame shows just over the horizontal is the dome under the cloud layer, and under a deck that is the deck's
 * far rows, which the layer pulls only 82 % of the way to the aerial pass's target (the rest is the deck's own lit
 * radiance: Titan Gorge's and Frosthollow's far earth stood 0.08 and 0.05 under them on the screen-horizon pair).
 * volumetricClouds.ts keeps it in the dome's fragment rather than as a chunk, so this carries the dome's filter and knee
 * word for word, its statements from the history's sample to the flash on a given uv and direction, and the dome's blend
 * (one, one minus the source alpha) over the sky under it: horizonPanoramaClouds.selftest.mjs runs the dome's and these
 * through one GLSL-subset evaluator and fails on any difference. The uniforms are the cloud dome's own, copied each draw
 * (the shell's onBeforeRender). */
const CLOUD_COMPOSITE_GLSL = /* glsl */`
uniform sampler2D tClouds;
uniform vec2 uHistorySize;
uniform vec3 uKnee;
uniform float uSkyIntensity;
uniform vec4 uFlash;
uniform vec3 uFlashTint;
uniform vec3 uSunDir;
uniform float uInside;
vec4 cloudsCatmullRom( vec2 uv, vec2 size ) {
	vec2 sp = uv * size;
	vec2 tp1 = floor( sp - 0.5 ) + 0.5;
	vec2 fr = sp - tp1;
	vec2 w0 = fr * ( fr * ( fr * -0.5 + 1.0 ) - 0.5 );
	vec2 w1 = fr * fr * ( fr * 1.5 - 2.5 ) + 1.0;
	vec2 w2 = fr * ( fr * ( fr * -1.5 + 2.0 ) + 0.5 );
	vec2 w3 = fr * fr * ( fr * 0.5 - 0.5 );
	vec2 w12 = w1 + w2;
	vec2 tc0 = ( tp1 - 1.0 ) / size, tc3 = ( tp1 + 2.0 ) / size, tc12 = ( tp1 + w2 / w12 ) / size;
	float a = w12.x * w0.y, b = w0.x * w12.y, c = w12.x * w12.y, d = w3.x * w12.y, e = w12.x * w3.y;
	vec4 sum = texture2D( tClouds, vec2( tc12.x, tc0.y ) ) * a + texture2D( tClouds, vec2( tc0.x, tc12.y ) ) * b
		+ texture2D( tClouds, tc12 ) * c + texture2D( tClouds, vec2( tc3.x, tc12.y ) ) * d + texture2D( tClouds, vec2( tc12.x, tc3.y ) ) * e;
	return sum / ( a + b + c + d + e );
}
vec3 cloudKnee( vec3 c ) {
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	if ( l > uKnee.x ) c *= ( uKnee.x + uKnee.y * ( 1.0 - exp( -( l - uKnee.x ) * uKnee.z ) ) ) / l;
	return c;
}
vec3 panoCloudOver( vec3 sky, vec2 uv, vec3 dir ) {
	vec4 c = max( cloudsCatmullRom( uv, uHistorySize ), vec4( 0.0 ) );
	// nothing below the horizon line (the history holds no cloud there either) — unless the camera is in the slab
	float above = max( smoothstep( -0.05, -0.02, dir.y ), uInside );
	// the knee eases off within a few degrees of the sun: the silver lining of a cloud in front of it outshines the glow
	float sunNear = pow( max( dot( dir, uSunDir ), 0.0 ), 400.0 );
	vec3 rgb = mix( cloudKnee( c.rgb ), min( c.rgb, vec3( 6.0 ) ), sunNear ) * uSkyIntensity * above;
	float alpha = ( 1.0 - min( c.a, 1.0 ) ) * above;
	if ( uFlash.w > 0.0 ) {
		// the cloud mass around the strike lit from inside: a broad glow and a bright core, only where there is cloud
		float k = max( dot( dir, uFlash.xyz ), 0.0 );
		rgb += uFlashTint * ( uFlash.w * ( pow( k, 30.0 ) * 0.7 + pow( k, 600.0 ) * 1.6 ) * alpha );
	}
	return rgb + sky * ( 1.0 - alpha );
}
`;

/** The aerial pass's cloud shade (post.ts: "large-scale cloud shadows / light patchiness", world-anchored noise that
 * multiplies every geometry pixel after the haze while the clouds cast no shadows of their own), which falls on the far
 * earth too: Titan Gorge's dense overcast (0.30) laid patches up to a third darker across its far earth at the horizon on
 * the composite's pair, where the land has long gone into the haze. post.ts keeps the noise and the shade inline in its
 * aerial pass, so this is a copy of its statements: horizonPanoramaClouds.selftest.mjs runs post.ts's and these through
 * the GLSL-subset evaluator and fails on any difference. The far earth divides its screen horizon by it before the
 * aerial pass's compensation, so the pass's shade lands it back on the horizon. */
const AERIAL_CLOUD_SHADE_GLSL = /* glsl */`
uniform float uCloudShade;
float vhash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  return mix( mix( vhash( i ), vhash( i + vec2( 1.0, 0.0 ) ), u.x ),
              mix( vhash( i + vec2( 0.0, 1.0 ) ), vhash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float panoCloudShade( vec2 cp ) {
  vec3 shade = vec3( 1.0 );
  if ( uCloudShade > 0.003 ) {
    float cn = vnoise( cp * ( 1.0 / 340.0 ) ) * 0.62
             + vnoise( cp * ( 1.0 / 131.0 ) + vec2( 4.7, 8.1 ) ) * 0.38;
    shade *= 1.0 - uCloudShade * smoothstep( 0.52, 0.80, cn );
  }
  return shade.r;
}
`;

/** The shell's material: the atlas by direction from the bake eye (an unlit backdrop; the post pass hazes it by depth),
 * transparent texels discarded (the sky and the clouds behind). The scene fog is off, as it was on the round-72 far
 * range: the strip carries its own air past the shell (the bake's distance grading).
 * Over its column's skyline (the mountains lane, 2026-10-04) a texel the shell reads as sky stays open, except where the
 * shell is ground for the camera: the apron (its inner rows stand on the ring's outer edge above the bake eye's horizon,
 * where a low far country's atlas is sky; discarded, they let the sky dome through between the ring and the shell from a
 * high camera) and the far earth (gauntlet waves 53-54's bird views, "the world simply ends ... a ruler-straight hard top
 * edge": the sky dome under the camera's own horizontal, where the land goes on to a horizon 0.56 degrees under it from
 * 300 m). Both take the column's skyline, its farthest ground; the far earth hazed by the map's law over the reach past
 * the strip at which the camera's ray meets the ground, so it converges to the law's target toward the horizontal. A
 * ground or tank-height camera's rays to the wall's sky point above its own horizontal, so its view is unchanged. */
function buildShellMaterial(): { material: THREE.MeshBasicMaterial; air: ShellAir } {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide });
  material.name = 'horizon-panorama';
  const P = HORIZON_PANORAMA;
  const air: ShellAir = {
    uPanoSkyline: { value: null },
    uPanoHaze: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPanoHazeAnti: { value: new THREE.Vector3() },
    uPanoHazeToward: { value: new THREE.Vector3() },
    uPanoSunH: { value: new THREE.Vector2(1, 0) },
    uPanoHazeChroma: { value: new THREE.Vector3(...HAZE_EXT_CHROMA) },
    uPanoSigmaPost: { value: 0 },
    tAtmoSky: { value: null },
    uAtmoSun: { value: new THREE.Vector3(0, 1, 0) },
    uAtmoViewH: { value: ATMO_GROUND_KM + 0.05 },
    uAtmoKnee: { value: new THREE.Vector3(1e6, 0, 1) },
    uAtmoIntensity: { value: 1 },
    uPanoTint: { value: new THREE.Vector3(1, 1, 1) },
    uPanoTerms: { value: new THREE.Vector3(0, 1, 0) },
    uDeckHorizon: { value: new THREE.Vector4(1, 1, 1, 0) },
    uDeckClosed: { value: 0 },
    tClouds: { value: null },
    uHistorySize: { value: new THREE.Vector2(4, 4) },
    uKnee: { value: new THREE.Vector3(1e6, 0, 1) },
    uSkyIntensity: { value: 1 },
    uFlash: { value: new THREE.Vector4() },
    uFlashTint: { value: new THREE.Vector3(1, 1, 1) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uInside: { value: 0 },
    uPanoCloudOn: { value: 0 },
    uPanoViewProj: { value: new THREE.Matrix4() },
    uCloudShade: { value: 0 },
    uPanoAux: { value: null },
    uPanoShadeOn: { value: 0 },
    tCotCloudShade: { value: null },
    uCotCloudShade: { value: new THREE.Vector4(0, 0, 1 / 12000, 0) },
    uCotCloudSun: { value: new THREE.Vector4(0, 1, 0, 1400) },
    uPanoDatum: { value: 0 },
    uPanoSkyOn: { value: 0 },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPanoEye = { value: new THREE.Vector3(0, P.eyeY, 0) };
    shader.uniforms.uPanoElev = { value: new THREE.Vector2(P.elevMin, P.elevMax) };
    Object.assign(shader.uniforms, air);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPanoWorld; varying float vPanoU; varying float vPanoApron;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPanoWorld = (modelMatrix * vec4(position, 1.0)).xyz; vPanoU = uv.x; vPanoApron = uv.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uPanoEye; uniform vec2 uPanoElev; varying vec3 vPanoWorld; varying float vPanoU; varying float vPanoApron;
uniform sampler2D uPanoSkyline; uniform vec4 uPanoHaze; uniform vec3 uPanoHazeAnti, uPanoHazeToward, uPanoHazeChroma;
uniform vec2 uPanoSunH;
uniform float uPanoSigmaPost;
uniform vec3 uPanoTint; uniform vec3 uPanoTerms; uniform float uPanoDatum, uPanoSkyOn, uPanoCloudOn;
uniform mat4 uPanoViewProj;
uniform sampler2D uPanoAux; uniform float uPanoShadeOn;
${CLOUD_SHADE_PARS_GLSL}
${ATMOSPHERE_SKY_GLSL}
${DOME_DECK_GREY_GLSL}
${CLOUD_COMPOSITE_GLSL}
${AERIAL_CLOUD_SHADE_GLSL}
${HAZE_LAW_GLSL}`)
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
        vec2 panoUv = vec2(vPanoU, clamp((e - uPanoElev.x) / (uPanoElev.y - uPanoElev.x), 0.002, 0.998));
        vec4 pano = texture2D(map, panoUv);
        if (pano.a < 0.5) {
          // over its column's skyline: open (the sky), unless the shell is ground for this camera, on a ray under the
          // camera's own horizontal — the apron over the bake eye's horizon, or the far earth. A hole under the skyline
          // (the open water the game draws, the band over a sea's ring) stays open, as does a column with no land; a
          // camera looking up at the shell's sky (every ground and tank-height view) sees it open as before
          vec4 skyline = texture2D(uPanoSkyline, vec2(vPanoU, 0.25));
          if (skyline.a < 0.0 || panoUv.y <= skyline.a) discard;
          vec3 vd = vPanoWorld - cameraPosition;
          bool apron = vPanoApron > 0.5 && e > 0.0;
          if (vd.y >= 0.0 || !(apron || uPanoHaze.w > 0.5)) discard;
          vec3 ground = pow(max(skyline.rgb, vec3(0.0)), vec3(2.2));
          if (!apron) {
            // (its land the column's skyline right over it, the wide average above: one colour per column, constant up
            // the ray, stood as bars to the horizon in the clear air — Verdant and Oasis in the lab)
            vec3 wide = pow(max(texture2D(uPanoSkyline, vec2(vPanoU, 0.75)).rgb, vec3(0.0)), vec3(2.2));
            // the far earth: the law over the reach past the strip (its far country already carries the air to 9 km)
            // at which the camera's ray meets the ground, the layer's density between there and the ray's height at
            // the strip's end, toward the column's own target
            vec3 rd = vd / length(vd);
            float meet = (cameraPosition.y - uPanoHaze.z) / max(-rd.y, 1e-5);
            float stripEnd = min(meet, ${P.outerM.toFixed(1)});
            float reach = max(0.0, meet - ${P.outerM.toFixed(1)});
            float layer = hazeLayerMean(max(cameraPosition.y + rd.y * stripEnd - uPanoHaze.z, 0.0) * uPanoHaze.y, 0.0);
            vec3 T = hazeTransmittance(uPanoHaze.x, reach, layer, uPanoHazeChroma);
            float a = vPanoU * 6.2831853;
            float toward = 0.5 + 0.5 * (cos(a) * uPanoSunH.x + sin(a) * uPanoSunH.y);
            ground = mix(ground, wide, smoothstep(0.0, 0.0087, e - mix(uPanoElev.x, uPanoElev.y, skyline.a)));
            // toward the horizontal the land goes into the screen's own horizon (the pairs of bfc773bb1 and f61a53f3d:
            // the law's target from the bake, and the atmosphere's summary bands, both landed 0.08-0.27 over the sky
            // the frames show). It is the dome as sky.ts draws it just over the horizon — the sky-view LUT on this
            // bearing, greyed by the deck (the dome's own greying on the dome's own uniforms), through the knee, at
            // the sky's intensity — drawn toward the aerial pass's target as the overcast closes (the cloud layer's far
            // rows, pulled to that target, are the horizon under a deck). The in-scatter target is the colour the
            // aerial pass turns into it: its own target along this fragment's ray and its own transmittance over the
            // camera's distance (σ, the layer from the ground under the camera, the per-channel extinction)
            vec3 inScatter = mix(uPanoHazeAnti, uPanoHazeToward, toward * toward);
            if (uPanoSkyOn > 0.5) {
              const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
              vec3 skyT = atmoSkyVisible(normalize(vec3(rd.x, max(rd.y, 0.02), rd.z)));
              float tintL = max(dot(uPanoTint, LUMA), 1e-4);
              vec3 aerialT = mix(skyT, uPanoTint * (dot(skyT, LUMA) / tintL), uPanoTerms.x);
              if (aerialT.g > aerialT.b) {
                float tl = dot(aerialT, LUMA);
                aerialT = mix(aerialT, vec3(tl * 0.92, tl * 0.99, tl * 1.12), 0.6);
              }
              aerialT *= uPanoTerms.y;
              vec3 hdir = normalize(vec3(rd.x, 0.004, rd.z));
              vec3 domeSky = atmoKnee(panoDeckGrey(atmoSky(hdir), hdir)) * uAtmoIntensity;
              // where the cloud layer is not read (none drawn, or the horizon point off the frame's top or bottom):
              // the dome, toward the aerial pass's target as the overcast closes
              vec3 screen = mix(domeSky, aerialT, smoothstep(0.3, 0.8, uPanoTerms.z));
              if (uPanoCloudOn > 0.5) {
                // the dome under the cloud layer as the frame composites it at the horizon point on this bearing: its
                // history sampled where the cloud dome samples it, at the point's own place on this frame's screen
                vec4 hc = uPanoViewProj * vec4(hdir, 0.0);
                if (hc.w > 0.0) {
                  vec2 cuv = hc.xy / hc.w * 0.5 + 0.5;
                  // eased to the proxy over the frame's last twentieth at the top and the bottom (no jump as the point
                  // leaves the frame); held at the side edges, where the horizon beside it is in the frame
                  float inFrame = smoothstep(0.0, 0.05, cuv.y) * (1.0 - smoothstep(0.95, 1.0, cuv.y));
                  if (inFrame > 0.0) screen = mix(screen, panoCloudOver(domeSky, vec2(clamp(cuv.x, 0.0, 1.0), cuv.y), hdir), inFrame);
                }
              }
              // (the aerial pass shades this pixel by its cloud shade after its haze: the horizon taken back out of it)
              screen /= max(panoCloudShade(vPanoWorld.xz), 0.05);
              float postLayer = hazeLayerMean(max(cameraPosition.y - uPanoDatum, 0.0) * uPanoHaze.y, max(vPanoWorld.y - uPanoDatum, 0.0) * uPanoHaze.y);
              vec3 Tp = hazeTransmittance(uPanoSigmaPost, length(vd), postLayer, uPanoHazeChroma);
              inScatter = max((screen - aerialT * (1.0 - Tp)) / max(Tp, vec3(0.05)), vec3(0.0));
            }
            ground = ground * T + inScatter * (1.0 - T);
          }
          diffuseColor.rgb *= ground;
        } else {
          // the atlas holds display-encoded colour (more precision in the shadows), premultiplied so its filtered edge
          // samples carry no black from the sky texels: divided back out, then back to linear
          vec3 land = pow(pano.rgb / pano.a, vec3(2.2));
          // 2026-10-05 (Part 1, the skies lane: the distant hills' cloud shadows): the far point rebuilt from the bake's
          // distance (the column's azimuth, the ray's elevation from the bake eye), up the sun's ray into the shared shade
          // map (cotCloudSun: inside its square, faded at the edge); only the sun's share of the texel dims — the sky's light
          // and the haze stay
          if (uPanoShadeOn > 0.5) {
            vec4 aux = texture2D(uPanoAux, panoUv);
            if (aux.b > 0.5) {
              float rr = aux.r / aux.b * 10000.0, share = clamp(aux.g / aux.b, 0.0, 1.0), az = vPanoU * 6.2831853;
              vec3 fp = vec3(cos(az) * rr, uPanoEye.y + tan(e) * rr, sin(az) * rr);
              land *= 1.0 - share * (1.0 - cotCloudSun(fp));
            }
          }
          diffuseColor.rgb *= land;
        }
      }
      #endif`);
  };
  material.customProgramCacheKey = () => 'horizon-panorama-v4';
  return { material, air };
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

/** The far jebels' law, shared by the height pass and the strip (which takes the walls' normals from it). */
const JEBEL_GLSL = /* glsl */`
uniform vec4 uJebel;   // sheer jebels: share of 2.6 km cells, height (m), radius (m), the cap's bosses (m)
uniform vec4 uJebel2;  // the wall's foot, the cap's rim, the apron's share, the flutes round the wall
uniform vec4 uJebel3;  // the flutes' depth, the foot's wander, the varnish, the nearest centre (m)
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

// the jebels at a point (uJebel.x > 0): the tallest massif's height over the plain (one in a share of 2.6 km cells,
// standing alone on the plain — maps lane A's section, horizonJebelSection: a bossed cap, a sheer wall fluted in vertical
// grooves whose foot wanders round the massif, a short concave talus apron; drawn out along a turned axis). Beside it the
// footprint inside the walls' feet (the height pass writes it for the strip to bare), the varnish down the walls, and for
// the strip the massif the point belongs to: its share of its own height there, its bearing round its centre, its salt
float gJebelBare = 0.0, gJebelVarnish = 0.0, gJebelRel = 0.0, gJebelTh = 0.0, gJebelSalt = 0.0;
float jebelField(vec2 p) {
  gJebelBare = 0.0; gJebelVarnish = 0.0; gJebelRel = 0.0; gJebelTh = 0.0; gJebelSalt = 0.0;
  vec2 cell = floor(p / 2600.0);
  float best = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    if (hash12(c + vec2(31.7, 3.1)) < 1.0 - uJebel.x) continue;
    vec2 centre = (c + 0.2 + 0.6 * vec2(hash12(c + vec2(2.9, 7.3)), hash12(c + vec2(6.1, 1.7)))) * 2600.0;
    float rad = uJebel.z * (0.7 + 0.6 * hash12(c + vec2(5.3, 8.8)));
    float el = 1.0 + 0.5 * hash12(c + vec2(0.7, 2.2));
    // (its near edge past the limit: the massif's long axis is rad * el)
    if (length(centre) - rad * el < uJebel3.w) continue;
    float ang = 6.2831853 * hash12(c + vec2(9.1, 4.4));
    vec2 ax = vec2(cos(ang), sin(ang)), q2 = p - centre;
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
    if (hj > best) { best = hj; gJebelRel = hj / hgt; gJebelTh = th; gJebelSalt = salt; }
    gJebelBare = max(gJebelBare, smoothstep(wall + 0.04, wall - 0.01, q));
    // desert varnish: dark streaks down the wall from under the rim (seepage from the cap), round the massif on the
    // circle (no seam), drawn out down the wall, fading over the talus
    if (uJebel3.z > 0.0 && q > top * 0.9 && q < wall + 0.05) {
      vec2 ring = vec2(cos(th), sin(th));
      float sv = noised(ring * 16.0 + vec2(q * 2.0, salt)).x * 0.65 + noised(ring * 41.0 + vec2(q * 4.0, salt + 5.0)).x * 0.35;
      float down = 1.0 - smoothstep(wall - 0.2 * (wall - top), wall + 0.05, q);
      gJebelVarnish = max(gJebelVarnish, smoothstep(0.08, 0.38, sv) * down);
    }
  }
  return best;
}
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
${JEBEL_GLSL}
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
float gGully = 0.0;  // and its erosion octaves' troughs on the steeper ground (a dry coast's scrub holds them)
float gVarnish = 0.0; // and a jebel country's desert varnish down its walls (written in the tree-cover channel)
float farField(vec2 p) {
  gPlinth = 0.0;
  gGully = 0.0;
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
    gGully = smoothstep(0.1, 0.8, -gs) * smoothstep(0.08, 0.3, s) * (1.0 - smoothstep(1.0, 1.5, h / max(A, 1.0)));
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
  // sheer jebels (uJebel.x > 0): JEBEL_GLSL jebelField — the footprint inside the walls' feet is written for the strip to
  // bare to rock, the varnish in the tree-cover channel; the massifs' heights join after the near band's pressing (v3b:
  // pressed, a massif inside 4.8 km lost its bossed top to a level line under the ring's skyline)
  float hJebel = 0.0;
  if (uJebel.x > 0.0) {
    hJebel = jebelField(p);
    gPeak = max(gPeak, gJebelBare);
    gVarnish = gJebelVarnish * uJebel3.z;
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
  // a dry coast's scrub (uTrees.z, the maquis): it holds the gullies up the bare faces, the limestone the spurs between
  if (uTrees.z > 0.0) gTree = max(gTree, uTrees.z * gGully);
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
  // (the jebels stand whole: their near edges keep past the shell, jebelNearM)
  h += hJebel;
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
      // the coastal range carries the far country's own relief (gauntlet wave 32, Saltwind's edge-w: "a flat, nearly
      // textureless white cutout"): its summits and saddles from the base field, the erosion octaves down its flanks,
      // a dry coast's scrub in their troughs
      float rangeS = range * 2.0 * abs(r - rc) / (1600.0 * 1600.0);
      vec2 rdir = vec2(su.y, -su.x) * clamp(rangeS * 2.2, 0.4, 2.2);
      float rgs = gullyOctave(p / uChar1.y + uOff3.xy, rdir, 17.0) + 0.5 * gullyOctave(p / (uChar1.y * 0.5) + uOff3.zw, rdir, 48.0);
      range = range * (0.8 + 0.5 * baseField(p)) * (1.0 + 0.15 * rgs * smoothstep(0.05, 0.3, rangeS));
      if (uTrees.z > 0.0) gTree = max(gTree, uTrees.z * smoothstep(0.1, 0.8, -rgs) * smoothstep(0.05, 0.3, rangeS) * smoothstep(rs, rs + 1800.0, r));
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

/** pass 4: per strip column, its highest opaque texel — its colour (display-encoded, out of the premultiplication) and
 *  its v; v -1 where the column holds no land */
const SKYLINE_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uStrip;
uniform float uRows;
void main() {
  vec4 found = vec4(0.0, 0.0, 0.0, -1.0);
  for (int j = 0; j < 4096; j++) {
    if (float(j) >= uRows) break;
    float v = (uRows - float(j) - 0.5) / uRows;
    vec4 c = textureLod(uStrip, vec2(vUv.x, v), 0.0);
    if (c.a >= 0.5) { found = vec4(c.rgb / c.a, v); break; }
  }
  gl_FragColor = found;
}
`;

/** pass 5: the skyline's colour averaged among the columns that hold land, each column keeping its own v — row 0 over 2.8
 *  degrees either side (one bright peak's column would stand as a bar up the far earth), row 1 over 45 degrees (the far
 *  earth's land past the strip: the clear air carried row 0's bars to the horizon, Verdant and Oasis in the lab) */
const SKYLINE_BLUR_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSkyline;
uniform float uColumns;
void main() {
  vec4 own = textureLod(uSkyline, vec2(vUv.x, 0.5), 0.0);
  float stride = vUv.y < 0.5 ? 1.0 : 16.0;
  vec3 sum = vec3(0.0);
  float n = 0.0;
  for (int k = -64; k <= 64; k++) {
    vec4 c = textureLod(uSkyline, vec2(vUv.x + float(k) * stride / uColumns, 0.5), 0.0);
    if (c.a >= 0.0) { sum += c.rgb; n += 1.0; }
  }
  gl_FragColor = vec4(n > 0.0 ? sum / n : own.rgb, own.a);
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
uniform vec3 uSunScale, uSkyScale, uBounceScale; // the live light over the day's (relight; 1 by day)
uniform vec3 uBase, uRock, uRock2, uScree, uSnow, uForest, uFog;
uniform vec4 uChar3;   // snowline, treeline, rockSlope, bedM
uniform vec4 uChar4;   // strata, deckM, ampM, farRise
uniform vec2 uElev;
uniform sampler2D uEdge;
uniform vec4 uShore;      // the far shore's height share (0: open sea), the channel's distance (m), its coastal range's share
uniform vec4 uTrees;      // the far field's canopy (m), the forest's slope limit, a dry coast's scrub
uniform vec4 uAir;        // the far path's share of the law's σ, the fill's law (0 / 1), the bare rock's floor (a share of the relief)
uniform vec4 uHaze;       // the shared haze law (hazeLaw.ts): σ (1/m), 1 / the layer's scale height, the datum (m), on
uniform vec3 uHazeChroma; // its per-channel extinction
uniform vec3 uHazeAnti, uHazeToward; // its in-scatter target at the horizon away from the sun and toward it
${NOISE_GLSL}
${GRID_LOOKUP_GLSL}
${HAZE_LAW_GLSL}
// the streaks down a hillside's fall line: each 1.2 km cell draws them in its own frame (the grid's gradient over 600 m at
// its centre, about that centre), the four nearest cells blended, so neither a texel's small relief winds them into loops
// nor one global frame slants them across the faces it does not fit
float fallStreak(vec2 xz) {
  vec2 cf = xz / 1200.0 - 0.5, c0 = floor(cf), f = fract(cf);
  float acc = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 cell = c0 + vec2(float(i), float(j)), centre = (cell + 0.5) * 1200.0;
    vec2 grad = vec2(heightAt(centre + vec2(300.0, 0.0)) - heightAt(centre - vec2(300.0, 0.0)),
      heightAt(centre + vec2(0.0, 300.0)) - heightAt(centre - vec2(0.0, 300.0)));
    vec2 fall = abs(grad.x) + abs(grad.y) > 1.0 && abs(grad.x) + abs(grad.y) < 1e6 ? -normalize(grad) : -normalize(centre + vec2(1e-3));
    vec2 q = xz - centre;
    float s = noised(vec2(dot(q, vec2(-fall.y, fall.x)) / 70.0, dot(q, fall) / 300.0) + 13.0 * vec2(hash12(cell), hash12(cell + 7.3))).x;
    acc += s * (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
  }
  return acc;
}
${JEBEL_GLSL}
float gJebelW = 0.0; // how much of a jebel's own law this texel's surface takes (0 off the massifs)
vec3 surfaceColour(vec2 g, vec3 wp, vec3 n, float apron, vec4 light) {
  float slope = 1.0 - n.y;
  // the zones (forest, fields, snow, scree) by the height over the upland's plinth where it has one
  float hT = clamp((wp.y - texture2D(uHeight, g).g) / uChar4.z, 0.0, 1.0);
  float n1 = noised(wp.xz / 1900.0 + vec2(5.3, 1.7)).x * 0.7 + noised(wp.xz / 700.0 + vec2(-3.1, 8.2)).x * 0.3;
  // the lower flanks: stands of the map's forest (denser on the slopes, broken by clearings and fields on the gentle
  // lowland), the crowns' mottle; the meadows and fields a patchwork of their own tones
  // a dry coast's scrub (uTrees.z, the maquis; gauntlet wave 32, Saltwind: "dark maquis on the lower slopes, pale bare
  // limestone only on the upper faces"): its edge and the bare rock's floor climb the gullies (the height pass's scrub in
  // their troughs) and the streaks down each hillside's fall line (fallStreak), so no contour runs level across a face
  // (radial streaks slanted across the faces they did not fit; a frame from each texel's own normal wound them into loops)
  float streak = uTrees.z > 0.0 ? smoothstep(-0.2, 0.6, fallStreak(wp.xz)) : 0.0;
  float climb = uTrees.z * (0.3 * texture2D(uHeight, g).b + 0.25 * streak + 0.1 * n1);
  float vegW = uChar3.y > 0.0 ? (1.0 - smoothstep(uChar3.y * 0.75, uChar3.y * 1.05, hT + 0.05 * n1 - climb)) * (1.0 - smoothstep(uTrees.y, uTrees.y + 0.23, slope)) : 0.0;
  float standN = noised(wp.xz / 170.0 + vec2(3.1, -7.7)).x + (1.0 - apron) * (0.45 * noised(wp.xz / 61.0 + vec2(-9.2, 4.4)).x + 0.25 * noised(wp.xz / 23.0).x);
  float stand = mix(smoothstep(-0.15, 0.2, standN + 1.4 * smoothstep(0.03, 0.18, slope) - 0.55), 1.0, 0.85 * uTrees.z);
  float mottle = 0.72 + 0.4 * mix(noised(wp.xz / 29.0 + vec2(11.3, 5.1)).x * 0.5 + 0.5, 0.5, apron);
  // the lowland's fields: parcels on a slightly rotated grid (each its own crop: green, straw, tilled earth), on the
  // gentle ground only — distant farmland reads as bands of colour along the hills' feet
  vec2 fq = mat2(0.92, 0.39, -0.39, 0.92) * wp.xz / vec2(260.0, 170.0);
  vec2 fc = floor(fq + 0.3 * vec2(noised(fq * 0.21).x, noised(fq * 0.19 + 7.1).x));
  float crop = hash12(fc + 17.3);
  vec3 cropC = crop < 0.45 ? uBase * vec3(0.95, 1.08, 0.88) : crop < 0.75 ? uBase * vec3(1.32, 1.18, 0.78) : uBase * vec3(1.05, 0.88, 0.7);
  float fieldW = (1.0 - smoothstep(0.04, 0.1, slope)) * (1.0 - smoothstep(0.25, 0.45, hT)) * step(0.35, uChar3.y) * (1.0 - apron) * (1.0 - uTrees.z);
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
  float rockW = smoothstep(uChar3.z, uChar3.z + 0.16, slope + 0.04 * n1) * smoothstep(uAir.z - 0.12, uAir.z + 0.12, hT + 0.05 * n1 - climb);
  // the isolated peaks bare (the ice sheet's nunataks dark rock through the white, the field's cones their scoria): rock
  // on all but their gentlest ground
  float peak = smoothstep(0.08, 0.3, texture2D(uHeight, g).a);
  rockW = max(rockW, peak * smoothstep(0.03, 0.14, slope + 0.03 * n1));
  // (a jebel is bare rock over its whole footprint, its gently domed cap too: Wadi Rum's massifs carry no sand on top)
  if (uJebel.x > 0.0) rockW = max(rockW, smoothstep(0.3, 0.7, texture2D(uHeight, g).a));
  col = mix(col, rockC, rockW);
  // (and in the fissures down the bare faces, fainter: the limestone between them)
  col = mix(col, uForest * mottle * 0.85, uTrees.z * rockW * streak * 0.5);
  // (a jebel's desert varnish, the tree-cover channel of a treeless country: dark streaks down its walls)
  if (uJebel.x > 0.0) col *= 1.0 - texture2D(uHeight, g).b;
  // Wadi Rum's sandstone (v3): the dark red-brown walls (the Umm Ishrin sandstone) under the pale domes (the Disi), the
  // contact wandering round each massif; bedded every ~17 m (each bed its own tone, the bedding planes dark); split by
  // vertical joints whose clefts hold shadow on the walls
  // (v3b, the pair of 8248ca70b: the cap uRock x (1.85, 3, 3.6) over the upper half stood as "pale grey-white castles",
  // the domes brighter than the sky above them. From the plain's own sand now: the walls desert-varnished, about a third
  // of the sand's albedo and redder-brown; the Disi only on the domes and the rim, buff, a touch paler than the sand)
  if (gJebelW > 0.0) {
    float rel = gJebelRel, th = gJebelTh, salt = gJebelSalt;
    float wallW = smoothstep(0.35, 0.75, slope);
    float contact = smoothstep(0.8, 0.9, rel + 0.05 * noised(vec2(th * 5.0, salt)).x);
    vec3 lower = uBase * vec3(0.36, 0.3, 0.38);
    vec3 upper = mix(uBase, vec3(dot(uBase, vec3(0.2126, 0.7152, 0.0722))), 0.25) * 1.15;
    float bt = wp.y / 17.0 + 0.25 * noised(vec2(th * 3.0, wp.y / 70.0) + salt).x;
    float bi = floor(bt), bf = bt - bi;
    float bedT = 0.9 + 0.2 * hash12(vec2(bi, salt));
    float plane = 1.0 - smoothstep(0.0, 0.07, bf) * smoothstep(0.0, 0.07, 1.0 - bf);
    float joints = 30.0 + 24.0 * fract(salt * 0.618);
    float jv = fract(th / 6.2831853 * joints + 0.18 * noised(vec2(rel * 3.0, th * 2.0 + salt)).x + fract(salt * 0.37));
    float cleft = 1.0 - smoothstep(0.0, 0.045, min(jv, 1.0 - jv));
    vec3 stone = mix(lower, upper, contact) * bedT * (1.0 - 0.22 * plane * wallW) * (1.0 - 0.5 * cleft * wallW);
    col = mix(col, stone * (1.0 - texture2D(uHeight, g).b), gJebelW * rockW);
  }
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
  // the sun warm, the shade lit by the sky (cooler), a little light bounced up from the valleys — each term under the
  // live light over the day's it was tuned for (2026-10-08, the nightsky lane: relight; exactly 1 by day)
  vec3 sunC = uGains.y * 1.05 * ndl * light.r * vec3(1.06, 0.98, 0.86) * uSunScale;
  vec3 skyC = uGains.x * (0.62 + 0.38 * n.y) * light.g * skyTint * uSkyScale;
  vec3 bounce = uGains.x * 0.12 * (1.0 - n.y) * vec3(0.9, 0.85, 0.75) * uBounceScale;
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
  // a jebel's walls (v3, gauntlet wave 50: "flat-coloured, near-rectangular blocks", the walls "one even pale tone with no
  // lit or shaded faces"): the grid's rows lie ~35 m apart at 5 km, and its normal across two of them smoothed a 60 m sheer
  // wall into a slope that took the sun from every side. The massif's own law gives the wall's normal at 4 m, so the face
  // toward the sun is lit and the face away from it in shade.
  gJebelW = 0.0;
  if (uJebel.x > 0.0 && apron < 0.5 && texture2D(uHeight, g).a > 0.01) {
    float e4 = 4.0;
    float hx = jebelField(wp.xz + vec2(e4, 0.0)), hz = jebelField(wp.xz + vec2(0.0, e4));
    float h0 = jebelField(wp.xz); // (last: the massif's globals are this point's own)
    gJebelW = smoothstep(2.0, 14.0, h0);
    n = normalize(mix(n, normalize(vec3(-(hx - h0) / e4, 1.0, -(hz - h0) / e4)), gJebelW));
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
  // the law's in-scatter target for the column: the sky at the horizon, warm toward the sun, cool away from it
  vec2 sunH = uSun.xz / max(length(uSun.xz), 1e-4);
  float toward = 0.5 + 0.5 * (cos(a) * sunH.x + sin(a) * sunH.y);
  vec3 lawTarget = mix(uHazeAnti, uHazeToward, toward * toward);
  if (hiddenW > 0.001) {
    // (a re-march from a higher eye was tried — the country behind the shell point seen from 300 m — and banded column
    // by column on the ridges it grazed: the fill stays a lit ground tone, its woods and fields as broad patches round
    // the compass, receding into the air toward the skyline so it reads as land falling away, not a sheet)
    vec2 sp = vec2(cos(a), sin(a)) * uFrame.z;
    float patchN = noised(sp / 900.0 + vec2(2.3, -7.1)).x * 0.6 + noised(sp / 340.0 + vec2(-4.4, 1.9)).x * 0.4;
    // (its ground the character's snow where the far country is white to its lowest swale — an ice sheet, a negative
    // snowline: the fill stood as a band of the battlefield's ground tone over Whiteout's low ring, the follow-up ticket)
    float fillSnow = uChar3.x < 0.0 ? 1.0 : 0.0;
    vec3 flatC = mix(uBase, uSnow, fillSnow) * (uGains.y * 1.05 * max(0.0, uSun.y) * vec3(1.06, 0.98, 0.86) * uSunScale + uGains.x * 0.82 * skyTint * uSkyScale);
    vec3 fill = mix(flatC, flatC * uForest / max(vec3(1e-3), uBase) * 0.95, smoothstep(0.05, 0.45, patchN) * step(0.35, uChar3.y) * (1.0 - fillSnow));
    float recede = smoothstep(atan(edge.a) - 0.06, atan(edge.a), e);
    if (uAir.y > 0.5) {
      // (the fill law, a map's opt-in — Saltwind, gauntlet wave 32: "a second range rests on a uniform bright haze
      // stripe, lighter than the range above it"): the lowland's own cover, its scrub and woods in broad patches round
      // the compass, under the air over its own reach — the ground just behind the ring, under a kilometre past the
      // shell, nearer than the far country above it and no hazier — so the band reads as the country between the ring
      // and the range, never paler than the range (the law's air with the battlefield's sky published, else the bake's own)
      // (a bare country's lowland is its own ground: Redrock's sand plain under the jebels, v3b — the fog-tinted fill
      // stood as a peach band the massifs' feet dissolved into)
      float wooded = uTrees.z > 0.0 || uChar3.y >= 0.35 ? 1.0 : 0.0;
      vec3 cover = mix(flatC, flatC * uForest / max(vec3(1e-3), uBase) * 0.95, max(0.5 + 0.4 * smoothstep(0.05, 0.45, patchN), 0.9 * uTrees.z) * (1.0 - fillSnow) * wooded);
      if (uHaze.w > 0.5) {
        float fillLayer = hazeLayerMean(max(uFrame.w - uHaze.z, 0.0) * uHaze.y, max(60.0 - uHaze.z, 0.0) * uHaze.y);
        vec3 TF = hazeTransmittance(uHaze.x * uAir.x, 800.0 * recede, fillLayer, uHazeChroma);
        fill = cover * TF + lawTarget * (1.0 - TF);
      } else {
        fill = mix(cover, uFog * 0.95, 1.0 - exp(-800.0 * recede / 13000.0));
      }
    } else {
      fill = mix(fill, uFog * 1.05, 0.25 + 0.35 * recede);
    }
    // (not over a jebel's wall: the march past the ring meets the massif's own lower wall there, not grazing ground —
    // painted with the fill, the near massifs stood on a flat band of it from the elevated views, v3b)
    col = mix(col, fill, hiddenW * 0.95 * (1.0 - gJebelW));
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
  // (toward the far shore the channel takes the mountains' reflection, darker — wave 32: "the water darker toward the
  // shore rather than haze-bright": the grid 600 m further out along the column is the far shore's land)
  float shoreAhead = smoothstep(0.0, 25.0, texture2D(uHeight, vec2(u, log((rr + 600.0) / uFrame.x) / log(uFrame.y / uFrame.x))).r - edge.b);
  col = mix(col, uFog * vec3(0.55, 0.62, 0.66) * (1.0 - 0.45 * shoreAhead), farWater);
  float open = max(smoothstep(0.02, 0.2, sea) * (1.0 - farWater), hiddenW * smoothstep(0.3, 0.7, edge.g));
  // the air past the shell. With the battlefield's sky published, the shared haze law (hazeLaw.ts; the coordinator,
  // 2026-10-03: "read it from hazeLaw rather than your own constants, so near and far stay consistent"): the aerial pass
  // hazes the shell's own depth, the bake the rest of the path to the far country — the same σ, the layer's density
  // between the eye and the point, the per-channel extinction, the same target. Without it the bake's own air (gauntlet
  // wave 6, "a flat, hazy, nearly featureless silhouette": a 13 km e-fold, a step under the fog's tone).
  if (uHaze.w > 0.5) {
    vec3 target = lawTarget;
    float layer = hazeLayerMean(max(uFrame.w - uHaze.z, 0.0) * uHaze.y, max(wp.y - uHaze.z, 0.0) * uHaze.y);
    vec3 T = hazeTransmittance(uHaze.x * uAir.x, max(0.0, rr - uFrame.z), layer, uHazeChroma);
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

/**
 * 2026-10-05 (Part 1, the skies lane: the distant hills' cloud shadows): the strip's own march, run twice per texel —
 * the sun's term on and off — for what the shell needs to dim the sun's part under the clouds: r the land's distance from
 * the eye (/ 10 km), g the sun's share of the texel's final colour, 1 − L(no sun) / L(full) (the haze and the sky's light
 * cancel; 0 where the sun's term is 0 — a face turned from it, a ridge's shadow), b the coverage; premultiplied by the
 * coverage like the atlas, so a filtered skyline sample keeps its land's distance. Derived from STRIP_FRAGMENT by name
 * (null if the strip no longer has the lines it rewrites: the bake skips the pass, the receipt fails).
 */
export const STRIP_AUX_FRAGMENT: string | null = deriveStripAux(STRIP_FRAGMENT);
function deriveStripAux(strip: string): string | null {
  const edits: [string, string][] = [
    ['vec3 sunC = uGains.y * 1.05 * ndl * light.r * vec3(1.06, 0.98, 0.86) * uSunScale;', 'vec3 sunC = uGains.y * 1.05 * ndl * light.r * vec3(1.06, 0.98, 0.86) * uSunScale * gSunScale;'],
    ['(uGains.y * 1.05 * max(0.0, uSun.y) * vec3(1.06, 0.98, 0.86) * uSunScale + uGains.x * 0.82 * skyTint * uSkyScale)', '(uGains.y * 1.05 * max(0.0, uSun.y) * vec3(1.06, 0.98, 0.86) * uSunScale * gSunScale + uGains.x * 0.82 * skyTint * uSkyScale)'],
    ['void main() {', 'vec4 stripTexel() {'],
    ['if (hitV < 0.0) { gl_FragColor = vec4(0.0); return; }', 'if (hitV < 0.0) { gRR = 0.0; return vec4(0.0); }'],
    ['gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)) * alpha, alpha);', 'gRR = rr; return vec4(clamp(col, 0.0, 1.0), alpha);'],
  ];
  let out = strip;
  for (const [from, to] of edits) {
    if (out.split(from).length !== 2) return null;
    out = out.replace(from, to);
  }
  const head = out.indexOf('${NOISE_GLSL}') >= 0 ? null : out.indexOf('float fallStreak(');
  if (head === null || head < 0) return null;
  out = `${out.slice(0, head)}float gSunScale = 1.0;\nfloat gRR = 0.0;\n${out.slice(head)}`;
  return `${out}
void main() {
  gSunScale = 1.0;
  vec4 full = stripTexel();
  float rr = gRR;
  gSunScale = 0.0;
  vec4 dark = stripTexel();
  float la = dot(full.rgb, vec3(0.2126, 0.7152, 0.0722)), lb = dot(dark.rgb, vec3(0.2126, 0.7152, 0.0722));
  float share = la > 1e-5 ? clamp(1.0 - lb / la, 0.0, 1.0) : 0.0;
  gl_FragColor = vec4(vec3(rr / 10000.0, share, 1.0) * full.a, 1.0);
}
`;
}

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
  /**
   * 2026-10-08 (the nightsky lane): re-bake the far country under the light the battlefield now publishes (the battle
   * atmosphere's time of day, applied under its cover): the key light's direction and the sun, sky and bounce terms over
   * the day's, the haze from the live sky. True when the far country carries that light after the call (unchanged when
   * it already did; the day light is the authored bake); false when it cannot (no capable renderer, no grounded light, no
   * day reference): the bake stands as it was.
   */
  relight(renderer: HorizonPanoramaRenderer | null | undefined): boolean;
  /**
   * Keep the sky the battlefield publishes as the day reference relight() measures against, when it is this map's
   * authored day sky (the battle atmosphere calls it before it applies a time of day: world activation applies the map's
   * sky after the warm-up, so a map entered straight into a night may not have baked under it). True when a reference
   * is held after the call.
   */
  noteDaySky(): boolean;
  dispose(): void;
  /** the last bake's duration (ms) and count, for the probes; `tone`: whether the battlefield's own ground and rock
   * means coloured the bake ('ground') or the authored palette did ('authored') */
  readonly stats: { bakes: number; ms: number; unsupported: string | null; tone: 'authored' | 'ground';
    /** the battlefield's ground and rock means the bake took (linear), for the probes and the bake's receipt */
    groundTone: number[] | null; rockTone: number[] | null;
    /** the haze law's terms the bake took (the overcast it read, the published light model's, σ, the targets), for the probes */
    hazeTerms: { overcast: number; published: number; sigma: number; anti: number[]; toward: number[] } | null;
    /** the light the atlas carries (null: the authored day), the relights run, the last relight's bake (ms) and whether
     * the first bake took this map's day sky for its reference */
    light: HorizonPanoramaLight | null; relights: number; relightMs: number; dayReference: boolean };
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
  const { material, air } = buildShellMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  // the far range's name: the battle atmosphere dims every 'horizon-far-range' mesh's colour at night
  // (battleAtmosphereRuntime.ts), and the panorama is that range now; lookups by name still find the round-72 mesh, the
  // ring's first child of the name
  mesh.name = 'horizon-far-range';
  mesh.userData.horizonPanorama = true;
  // (the shell's air: the frame-budget probe's far-earth toggle switches the law's flag in place)
  mesh.userData.panoAir = air;
  const lawTerms = { x: 0, y: 0 };
  // the dome (sky.ts's 'atmosphere-dome' mesh), found once per scene: its deck uniforms are read each draw
  let domeScene: THREE.Object3D | null = null;
  let dome: THREE.Object3D | undefined;
  mesh.onBeforeRender = (_renderer, scene, camera) => {
    // (Part 1, 2026-10-05: the far country's cloud shadows — the layer's shared shade map, by reference; off without the
    // bake's aux, without a published map, or by the QA knob PANO_CLOUD_SHADE 0)
    {
      const shared = (scene.userData as { cloudShadeUniforms?: { tCotCloudShade: THREE.IUniform<THREE.Texture | null>;
        uCotCloudShade: THREE.IUniform<THREE.Vector4>; uCotCloudSun: THREE.IUniform<THREE.Vector4> } }).cloudShadeUniforms;
      const on = !!air.uPanoAux.value && !!shared && shared.uCotCloudShade.value.w > 0.5 && !!shared.tCotCloudShade.value
        && lightTune('PANO_CLOUD_SHADE', 1) > 0;
      air.uPanoShadeOn.value = on ? 1 : 0;
      if (on) {
        air.tCotCloudShade.value = shared!.tCotCloudShade.value;
        air.uCotCloudShade.value = shared!.uCotCloudShade.value;
        air.uCotCloudSun.value = shared!.uCotCloudSun.value;
      }
    }
    // the far earth's landing on the screen's horizon (the shell's far-earth note): the dome's own lookup and greying and
    // the aerial pass's terms as post.ts sets them this frame, the ground under the camera as its datum
    const data = scene.userData as { atmosphere?: PanoramaAtmosphere; lightModel?: { overcast?: number } };
    const atmosphere = data.atmosphere;
    const live = !!(atmosphere?.active && atmosphere.skyView && atmosphere.sunDir && atmosphere.knee && atmosphere.fogTint
      && air.uPanoHaze.value.w > 0.5);
    air.uPanoSkyOn.value = live ? 1 : 0;
    if (!live || !atmosphere) {
      // (no reference kept to a cloud history the layer may since have released)
      air.uPanoCloudOn.value = 0;
      air.tClouds.value = null;
      return;
    }
    air.tAtmoSky.value = atmosphere.skyView ?? null;
    const sun = atmosphere.sunDir!;
    air.uAtmoSun.value.set(sun.x, sun.y, sun.z).normalize();
    air.uAtmoViewH.value = ATMO_GROUND_KM + (atmosphere.viewHeightKm ?? 0.05);
    air.uAtmoKnee.value.copy(atmosphere.knee!);
    air.uAtmoIntensity.value = atmosphere.skyIntensity ?? 1;
    const tint = atmosphere.fogTint!;
    air.uPanoTint.value.set(tint.r, tint.g, tint.b);
    const overcast = Math.min(1, Math.max(0, data.lightModel?.overcast ?? 0));
    hazeTargetTerms(overcast, atmosphere.fogMix ?? 0, lawTerms);
    air.uPanoTerms.value.set(lawTerms.x, lawTerms.y, overcast);
    // the deck's grey: the dome's own uniforms, as sky.ts set them (no dome in the scene: no greying)
    if (domeScene !== scene || dome?.parent == null) { domeScene = scene; dome = scene.getObjectByName('atmosphere-dome'); }
    const domeUniforms = ((dome as THREE.Mesh | undefined)?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    const deckHorizon = domeUniforms?.uDeckHorizon?.value, deckClosed = domeUniforms?.uDeckClosed?.value;
    if (deckHorizon instanceof THREE.Vector4 && typeof deckClosed === 'number') {
      air.uDeckHorizon.value.copy(deckHorizon);
      air.uDeckClosed.value = deckClosed;
    } else {
      air.uDeckHorizon.value.set(1, 1, 1, 0);
      air.uDeckClosed.value = 0;
    }
    // the cloud layer's composite: its dome's own uniforms while it draws, as volumetricClouds.ts set them for this
    // frame (the history resolves before the scene draws), and this frame's view-projection, the screen the dome
    // samples the history in (TAA's jitter included)
    const cloudDome = (scene.userData as { volumetricClouds?: { dome?: THREE.Object3D } | null }).volumetricClouds?.dome;
    const cu = cloudDome?.visible ? ((cloudDome as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms : undefined;
    const clouds = cu?.tClouds?.value, perspective = (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
    const cloudsOn = !!(perspective && clouds instanceof THREE.Texture && cu && cu.uHistorySize?.value instanceof THREE.Vector2
      && cu.uKnee?.value instanceof THREE.Vector3 && typeof cu.uSkyIntensity?.value === 'number' && cu.uFlash?.value instanceof THREE.Vector4
      && cu.uFlashTint?.value instanceof THREE.Vector3 && cu.uSunDir?.value instanceof THREE.Vector3 && typeof cu.uInside?.value === 'number');
    air.uPanoCloudOn.value = cloudsOn ? 1 : 0;
    air.tClouds.value = cloudsOn ? clouds as THREE.Texture : null;
    if (cloudsOn && cu) {
      air.uHistorySize.value.copy(cu.uHistorySize.value as THREE.Vector2);
      air.uKnee.value.copy(cu.uKnee.value as THREE.Vector3);
      air.uSkyIntensity.value = cu.uSkyIntensity.value as number;
      air.uFlash.value.copy(cu.uFlash.value as THREE.Vector4);
      air.uFlashTint.value.copy(cu.uFlashTint.value as THREE.Vector3);
      air.uSunDir.value.copy(cu.uSunDir.value as THREE.Vector3);
      air.uInside.value = cu.uInside.value as number;
      air.uPanoViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    }
    if (Number.isFinite(atmosphere.fogDensity)) air.uPanoSigmaPost.value = hazeSigma(atmosphere.fogDensity as number);
    // the aerial pass's cloud shade, as post.ts sets it each frame (its CLOUD_SHADE_DEFAULT without a published one)
    // (2026-10-05, the skies lane: faded by the light model's overcast as post.ts fades it — none under a closed deck)
    const shade = (scene.userData as { cloudShadeAmp?: number }).cloudShadeAmp;
    const deck = Math.min(1, Math.max(0, (scene.userData.lightModel as { overcast?: number } | undefined)?.overcast ?? 0));
    air.uCloudShade.value = (typeof shade === 'number' && Number.isFinite(shade) ? shade : 0.22) * (1 - deck);
    const ground = options.groundAt ? options.groundAt(camera.position.x, camera.position.z) : NaN;
    air.uPanoDatum.value = Number.isFinite(ground) ? ground : hazeDatumM;
  };
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.userData.aoExclude = true;
  let atlas: THREE.WebGLRenderTarget | null = null;
  let skyline: THREE.WebGLRenderTarget | null = null;
  // (Part 1, 2026-10-05: the cloud shade's aux, a quarter of the strip's size; null on the phone tier)
  let aux: THREE.WebGLRenderTarget | null = null;
  let baked = false;
  const stats = { bakes: 0, ms: 0, auxMs: 0, aux: false, unsupported: null as string | null, tone: 'authored' as 'authored' | 'ground', haze: 'own' as 'own' | 'law',
    groundTone: null as number[] | null, rockTone: null as number[] | null,
    hazeTerms: null as { overcast: number; published: number; sigma: number; anti: number[]; toward: number[] } | null,
    light: null as HorizonPanoramaLight | null, relights: 0, relightMs: 0, dayReference: false };
  let skyWaits = 0;
  const publishedSky = (): { atmosphere?: PanoramaAtmosphere; overcast: number; model?: LightModel } => {
    let root: THREE.Object3D = mesh;
    while (root.parent) root = root.parent;
    const data = root.userData as { atmosphere?: PanoramaAtmosphere; lightModel?: LightModel };
    return { atmosphere: data.atmosphere, overcast: data.lightModel?.overcast ?? 0, model: data.lightModel };
  };
  // 2026-10-08 (the nightsky lane): the light the next bake takes (null: the authored day, the bake's own uniforms), and
  // the day it is measured against — this map's own sky as a bake saw it (the atmosphere's parameters, its raw
  // irradiance and its horizon), from which relight() rebuilds the day light with the grounded model
  let light: HorizonPanoramaLight | null = null;
  let dayReference: { params: AtmosphereParams; irradianceRaw: Rgb; horizon: Rgb; sunHorizon: Rgb } | null = null;
  const rgb = (c: THREE.Color): Rgb => [c.r, c.g, c.b];
  /** This map's authored day sky is what the battlefield publishes: its sun (the haze law's test) and its dome's
   * intensity (the night preset keeps some maps' sun elevation and dims the dome to .08). */
  const authoredSkyShowing = (atmosphere: PanoramaAtmosphere | undefined): boolean => {
    const sd = atmosphere?.sunDir;
    if (!atmosphere?.active || !sd || !atmosphere.params || !atmosphere.irradianceRaw || !atmosphere.summary) return false;
    const [x, y, z] = options.sun, sl = Math.hypot(x, y, z) || 1, dl = Math.hypot(sd.x, sd.y, sd.z) || 1;
    return (x * sd.x + y * sd.y + z * sd.z) / (sl * dl) >= 0.9995
      && Math.abs((atmosphere.skyIntensity ?? 1) - (options.lightPreset?.skyIntensity ?? 1)) < 1e-6;
  };
  const takeDayReference = (atmosphere: PanoramaAtmosphere | undefined): void => {
    if (dayReference || !options.lightPreset || !authoredSkyShowing(atmosphere)) return;
    const a = atmosphere!;
    dayReference = { params: { ...a.params!, sunDir: [...a.params!.sunDir] as [number, number, number] }, irradianceRaw: rgb(a.irradianceRaw!),
      horizon: rgb(a.summary!.horizon), sunHorizon: rgb(a.summary!.sunHorizon) };
    stats.dayReference = true;
  };
  const publishedSkyPending = (): boolean => {
    const { atmosphere, overcast } = publishedSky();
    // (the sky of the light being baked: the authored day's, or a relight's — a GPU suspension's re-bake at night)
    return !!atmosphere?.active && !horizonPanoramaHaze(atmosphere, light ? light.sun : options.sun, options.fogDensity, overcast);
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
    // (the nightsky lane: the day bake keeps this map's sky as the day reference relight() measures the live light against)
    if (!light) takeDayReference(published.atmosphere);
    // the key light the far country is lit by: the authored sun by day, the live light's after a relight — the haze law
    // takes the published sky only when it is that light's
    const sun: readonly [number, number, number] = light ? light.sun : options.sun;
    const haze = horizonPanoramaHaze(published.atmosphere, sun, options.fogDensity, options.overcast ?? published.overcast);
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
      uTrees: { value: new THREE.Vector4(ch.trees, ch.forestSlope, ch.scrub, 0) },
      uAir: { value: new THREE.Vector4(ch.air, ch.fillLaw, ch.rockFloor, 0) },
      uMesa: { value: new THREE.Vector4(ch.mesaTalusM, ch.mesaTalusShare, ch.mesaCliffM, ch.mesaFluteM) },
      uPeaks: { value: new THREE.Vector4(ch.peakShare, ch.peakM, ch.peakRadiusM, ch.peakSharp) },
      uJebel: { value: new THREE.Vector4(ch.jebelShare, ch.jebelM, ch.jebelRadiusM, ch.jebelBossM) },
      uJebel2: { value: new THREE.Vector4(ch.jebelFoot, ch.jebelRim, ch.jebelApron, ch.jebelFlutes) },
      uJebel3: { value: new THREE.Vector4(ch.jebelFluteDepth, ch.jebelFootVary, ch.jebelVarnish, ch.jebelNearM) },
      uFrame: { value: new THREE.Vector4(P.innerM, P.outerM, P.shellM, P.eyeY) },
      uHaze: { value: new THREE.Vector4(haze?.sigma ?? 0, haze?.invScale ?? 0, hazeDatumM, haze ? 1 : 0) },
      uHazeChroma: { value: new THREE.Vector3(...HAZE_EXT_CHROMA) },
      uHazeAnti: { value: haze?.anti ?? new THREE.Vector3() },
      uHazeToward: { value: haze?.toward ?? new THREE.Vector3() },
      uGrid: { value: new THREE.Vector2((options.resolution ?? P).gridA, (options.resolution ?? P).gridR) },
      uEdge: { value: edgeTex },
      uSun: { value: new THREE.Vector3(...sun).normalize() },
      uGains: { value: new THREE.Vector2(options.gains.ambient, options.gains.sunGain) },
      // (the nightsky lane: the live light over the day's, 1 by day — relight)
      uSunScale: { value: new THREE.Vector3(...(light?.sunScale ?? [1, 1, 1])) },
      uSkyScale: { value: new THREE.Vector3(...(light?.skyScale ?? [1, 1, 1])) },
      uBounceScale: { value: new THREE.Vector3(...(light?.bounceScale ?? [1, 1, 1])) },
      uElev: { value: new THREE.Vector2(P.elevMin, P.elevMax) },
      uBase: { value: linear(palette.base) }, uRock: { value: linear(rock) }, uRock2: { value: rock2 },
      uScree: { value: scree }, uSnow: { value: linear(palette.snow) }, uForest: { value: linear(palette.forest) },
      // the bake's own air colour, under the live sky at the horizon after a relight (its hue the map's: the sky tint
      // the strip derives from it is scale-free)
      uFog: { value: light ? linear(palette.fog).multiplyScalar(light.airScale) : linear(palette.fog) },
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
    // (Part 1: the cloud shade's aux at a quarter of the strip — 2048 x 128 half floats, 2 MB — where the tier has a
    // shade map and the knob is on; QA: PANO_CLOUD_SHADE 0 bakes none)
    const auxRT = options.cloudShade && STRIP_AUX_FRAGMENT && lightTune('PANO_CLOUD_SHADE', 1) > 0
      ? target(Math.max(64, res.width >> 2), Math.max(16, res.height >> 2), THREE.HalfFloatType, false) : null;
    const skylineRawRT = target(res.width, 1, THREE.HalfFloatType, false);
    skylineRawRT.texture.minFilter = skylineRawRT.texture.magFilter = THREE.NearestFilter;
    const skylineRT = target(res.width, 2, THREE.HalfFloatType, false);
    skylineRT.texture.name = 'horizon-panorama-skyline';
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
    const skylineMat = pass(SKYLINE_FRAGMENT, { uStrip: { value: stripRT.texture }, uRows: { value: res.height } });
    const skylineBlurMat = pass(SKYLINE_BLUR_FRAGMENT, { uSkyline: { value: skylineRawRT.texture }, uColumns: { value: res.width } });
    const auxMat = auxRT ? pass(STRIP_AUX_FRAGMENT!, { uHeight: { value: heightRT.texture }, uLight: { value: lightRT.texture } }) : null;
    const previousTarget = renderer.getRenderTarget();
    const previousColor = renderer.getClearColor(_clear).clone();
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousXr = renderer.xr?.enabled;
    try {
      renderer.autoClear = false;
      if (renderer.xr) renderer.xr.enabled = false;
      renderer.setClearColor(_clear.setRGB(0, 0, 0), 0);
      for (const [mat, rt] of [[heightMat, heightRT], [lightMat, lightRT], [stripMat, stripRT], [skylineMat, skylineRawRT], [skylineBlurMat, skylineRT]] as const) {
        quad.material = mat;
        renderer.setRenderTarget(rt);
        renderer.clear(true, false, false);
        renderer.render(scene, camera);
      }
      if (auxMat && auxRT) {
        const t0 = performance.now();
        quad.material = auxMat;
        renderer.setRenderTarget(auxRT);
        renderer.clear(true, false, false);
        renderer.render(scene, camera);
        stats.auxMs = Math.round((performance.now() - t0) * 10) / 10;
      }
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.autoClear = previousAutoClear;
      if (renderer.xr && previousXr !== undefined) renderer.xr.enabled = previousXr;
      for (const m of [heightMat, lightMat, stripMat, skylineMat, skylineBlurMat, auxMat]) m?.dispose();
      quad.geometry.dispose();
      heightRT.dispose(); lightRT.dispose(); skylineRawRT.dispose(); edgeTex.dispose();
    }
    if (atlas) atlas.dispose();
    if (skyline) skyline.dispose();
    if (aux) aux.dispose();
    atlas = stripRT;
    skyline = skylineRT;
    aux = auxRT;
    air.uPanoAux.value = auxRT ? auxRT.texture : null;
    stats.aux = !!auxRT;
    // a GPU suspension (resourceLifetime) disposes the atlas texture: free its framebuffer, show the fallback again and
    // bake once more on the next request
    stripRT.texture.addEventListener('dispose', () => {
      if (atlas !== stripRT) return;
      baked = false; atlas = null; stripRT.dispose();
      if (skyline === skylineRT) { skyline = null; skylineRT.dispose(); air.uPanoSkyline.value = null; }
      // (the aux goes with the atlas: the shell's cloud shade is off until the next bake makes both)
      if (auxRT && aux === auxRT) { aux = null; auxRT.dispose(); air.uPanoAux.value = null; }
      mesh.visible = false;
      if (fallback) fallback.visible = true;
    });
    material.map = stripRT.texture;
    material.needsUpdate = true;
    // the shell's ground over the skyline: the column's skyline, the far path's law (σ times the map's air share)
    air.uPanoSkyline.value = skylineRT.texture;
    if (haze) {
      air.uPanoHaze.value.set(haze.sigma * ch.air, haze.invScale, hazeDatumM, 1);
      air.uPanoSigmaPost.value = haze.sigma;
      air.uPanoHazeAnti.value.copy(haze.anti);
      air.uPanoHazeToward.value.copy(haze.toward);
      air.uPanoSunH.value.set(sun[0], sun[2]);
      if (air.uPanoSunH.value.lengthSq() > 1e-8) air.uPanoSunH.value.normalize(); else air.uPanoSunH.value.set(1, 0);
    } else {
      air.uPanoHaze.value.set(0, 0, 0, 0);
    }
    mesh.visible = true;
    if (fallback) fallback.visible = false;
    baked = true;
    stats.bakes++;
    stats.light = light;
    stats.ms = Math.round(performance.now() - started);
  }

  return {
    mesh,
    get baked() { return baked; },
    stats,
    setGroundTone(ground, rock) {
      if (baked || stats.bakes > 0) return false;
      const means = (c: THREE.Color) => [c.r, c.g, c.b].map((v) => Math.round(v * 1e4) / 1e4);
      if (ground) { palette.base = ground.clone(); stats.groundTone = means(ground); }
      if (rock && !(ch.ownRock > 0)) { palette.rock = rock.clone(); stats.rockTone = means(rock); }
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
    relight(renderer) {
      // the live light as the battlefield publishes it (the battle atmosphere has just applied its preset): the grounded
      // model's resolve, the sky it was resolved under and that sky's horizon
      const { atmosphere, model } = publishedSky();
      if (!renderer || unsupported(renderer)) return false;
      // (refused: a bake relit for an earlier battle returns to the authored day — the September behaviour, whose night
      // dim the battle atmosphere then applies; a galaxy sky's legacy rig on a cached world must not keep a night bake)
      const refuse = (): boolean => {
        if (light && baked) { light = null; bake(renderer); }
        return false;
      };
      if (!options.lightPreset || !model || model.mode !== 'physical') return refuse();
      if (!atmosphere?.active || !atmosphere.sunDir || !atmosphere.irradianceRaw || !atmosphere.summary) return refuse();
      // (a first relight with the day showing takes its reference now: a bake that ran under another map's sky had none)
      takeDayReference(atmosphere);
      if (!dayReference) return refuse();
      // the day light rebuilt from this map's own sky as the bake saw it, under the same deck pattern the live resolve took
      const preset = options.lightPreset;
      const dayModel = resolveLightModel(preset, dayReference.params, { irradianceRaw: dayReference.irradianceRaw },
        authoredSunOf(preset), model.deckClosure < 1);
      if (dayModel.mode !== 'physical') return refuse();
      const next = horizonPanoramaRelight(
        { model: dayModel, irradianceRaw: dayReference.irradianceRaw, horizon: dayReference.horizon, sunHorizon: dayReference.sunHorizon,
          sunDir: dayReference.params.sunDir },
        { model, irradianceRaw: rgb(atmosphere.irradianceRaw), horizon: rgb(atmosphere.summary.horizon), sunHorizon: rgb(atmosphere.summary.sunHorizon),
          sunDir: [atmosphere.sunDir.x, atmosphere.sunDir.y, atmosphere.sunDir.z] },
        { gains: options.gains, fog: rgb(palette.fog) });
      const same = (a: HorizonPanoramaLight | null, b: HorizonPanoramaLight | null): boolean => (a === null || b === null ? a === b
        : JSON.stringify(a) === JSON.stringify(b));
      // (the bake already carries this light: nothing to do — the day battle after a day battle, the same night twice)
      if (baked && same(next, light)) return true;
      light = next;
      const started = performance.now();
      bake(renderer);
      stats.relights++;
      stats.relightMs = Math.round(performance.now() - started);
      return baked;
    },
    noteDaySky() {
      takeDayReference(publishedSky().atmosphere);
      return !!dayReference;
    },
    dispose() {
      if (atlas) { const a = atlas; atlas = null; baked = false; a.dispose(); }
      if (skyline) { const k = skyline; skyline = null; air.uPanoSkyline.value = null; k.dispose(); }
      if (aux) { const x = aux; aux = null; air.uPanoAux.value = null; x.dispose(); }
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
export const HORIZON_PANORAMA_SHADERS = Object.freeze({ vertex: QUAD_VERTEX, height: HEIGHT_FRAGMENT, light: LIGHT_FRAGMENT, strip: STRIP_FRAGMENT, skyline: SKYLINE_FRAGMENT, skylineBlur: SKYLINE_BLUR_FRAGMENT, stripAux: STRIP_AUX_FRAGMENT ?? '' });
