/**
 * sceneAlpha.ts — the scene target's alpha channel, one law for its writer and its readers (2026-10-14, the engine-cs
 * lane, contact round r2: the ground occlusion's snow law keyed on LOCAL snow cover, not the map's albedo lever).
 *
 * The canvas is opaque, so the HDR scene target's alpha is free for the post chain (round 69): every opaque lit pixel
 * writes 2 + its CSM sun visibility (lighting.ts), a vehicle pixel 4 + it (vehicleOcclusion.ts), and anything else — a
 * grass or leaf card (its coverage), glass, water, the sky — keeps its real alpha, under 1.5. The aerial pass decodes it
 * (contactShadows.ts cotSunVisOf) and restores an alpha of one.
 *
 * The snow band. A terrain pixel (the only writer that defines COT_SNOW_COVER) carries its own snow cover: the share of
 * its final albedo that is snow on a snow map (terrain.ts cotSnowCover), quantised to SCENE_ALPHA_SNOW_LEVELS steps. A
 * pixel with no snow writes 2 + v exactly as before; snow level k (1..3) writes SNOW_BASE + (k − 1)·SNOW_BAND + v·SNOW_SPAN,
 * inside the gap between the lit band's top (3.0, a sunlit pixel) and the vehicles' VEHICLE_ALPHA_MIN (3.5), so every
 * reader that tests a pixel as lit (≥ 1.5), as a vehicle (≥ 3.5) or as ground (< 3.5) reads it as before, and only the
 * sun-visibility decode learns the band. The target is half float: in [2, 4) its step is 1/512, so a band's 0.14 span
 * holds the visibility to 1/72 and the 0.01 gaps keep the levels apart.
 */
import { VEHICLE_ALPHA_MIN } from './vehicleOcclusion.ts';

/** A lit pixel without snow: 2 + its sun visibility. */
export const SCENE_ALPHA_LIT = 2;
/** Anything at or over this is lit (a card, glass, water, the sky sit under it). */
export const SCENE_ALPHA_OPAQUE = 1.5;
/** The snow band: level k ≥ 1 writes SNOW_BASE + (k − 1)·SNOW_BAND + v·SNOW_SPAN; decoded from SNOW_MIN up. */
export const SCENE_ALPHA_SNOW_LEVELS = 3;
export const SCENE_ALPHA_SNOW_BASE = 3.05;
export const SCENE_ALPHA_SNOW_BAND = 0.15;
export const SCENE_ALPHA_SNOW_SPAN = 0.14;
export const SCENE_ALPHA_SNOW_MIN = 3.025;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The snow level a cover writes (0: none; nearest of SCENE_ALPHA_SNOW_LEVELS steps). */
export function sceneSnowLevel(snowCover: number): number {
  return Math.floor(clamp01(snowCover) * SCENE_ALPHA_SNOW_LEVELS + 0.5);
}

/** The writer (lighting.ts's opaque chunk): a lit pixel's alpha from its sun visibility and its snow cover. */
export function encodeSceneAlpha(sunVis: number, snowCover = 0): number {
  const k = sceneSnowLevel(snowCover);
  return k === 0 ? SCENE_ALPHA_LIT + sunVis
    : SCENE_ALPHA_SNOW_BASE + (k - 1) * SCENE_ALPHA_SNOW_BAND + clamp01(sunVis) * SCENE_ALPHA_SNOW_SPAN;
}

function snowBandIndex(alpha: number): number {
  return Math.min(SCENE_ALPHA_SNOW_LEVELS - 1, Math.max(0,
    Math.floor((alpha - SCENE_ALPHA_SNOW_BASE) / SCENE_ALPHA_SNOW_BAND + 1 / 30)));
}

/** The sun visibility of a lit or vehicle pixel, or −1 for anything else (contactShadows.ts cotSunVisOf's CPU twin). */
export function decodeSceneSunVis(alpha: number): number {
  if (alpha >= VEHICLE_ALPHA_MIN) return clamp01(alpha - 4);
  if (alpha >= SCENE_ALPHA_SNOW_MIN) {
    const l = alpha - SCENE_ALPHA_SNOW_BASE;
    return clamp01((l - snowBandIndex(alpha) * SCENE_ALPHA_SNOW_BAND) / SCENE_ALPHA_SNOW_SPAN);
  }
  return alpha >= SCENE_ALPHA_OPAQUE ? clamp01(alpha - SCENE_ALPHA_LIT) : -1;
}

/** A pixel's snow cover as its alpha carries it (0 off the band: no snow, a vehicle, a card). */
export function decodeSceneSnow(alpha: number): number {
  if (!(alpha >= SCENE_ALPHA_SNOW_MIN && alpha < VEHICLE_ALPHA_MIN)) return 0;
  return (snowBandIndex(alpha) + 1) / SCENE_ALPHA_SNOW_LEVELS;
}

const f = (x: number): string => x.toFixed(4);

/** The writer's GLSL (lighting.ts, inside the opaque chunk): `cotSceneAlphaSnow( sunVis, snowCover )`. */
export const SCENE_ALPHA_SNOW_WRITE_GLSL = /* glsl */ `
	float cotSnowK = floor( clamp( cotSnowCover, 0.0, 1.0 ) * ${f(SCENE_ALPHA_SNOW_LEVELS)} + 0.5 );
	gl_FragColor.a = cotSnowK < 0.5 ? ${f(SCENE_ALPHA_LIT)} + cotSunVis
		: ${f(SCENE_ALPHA_SNOW_BASE)} + ( cotSnowK - 1.0 ) * ${f(SCENE_ALPHA_SNOW_BAND)} + clamp( cotSunVis, 0.0, 1.0 ) * ${f(SCENE_ALPHA_SNOW_SPAN)};`;

/** The snow reader's GLSL: `cotSnowOf( a )` (with its band index; the GLSL twin's fixture includes it on its own). */
export const SCENE_ALPHA_SNOW_READ_GLSL = /* glsl */ `
    float cotSnowBandOf( float a ) {
      return clamp( floor( ( a - ${f(SCENE_ALPHA_SNOW_BASE)} ) / ${f(SCENE_ALPHA_SNOW_BAND)} + ${(1 / 30).toFixed(4)} ), 0.0, ${(SCENE_ALPHA_SNOW_LEVELS - 1).toFixed(1)} );
    }
    // the pixel's own snow cover (0 off the band)
    float cotSnowOf( float a ) {
      return a >= ${f(SCENE_ALPHA_SNOW_MIN)} && a < ${f(VEHICLE_ALPHA_MIN)} ? ( cotSnowBandOf( a ) + 1.0 ) / ${f(SCENE_ALPHA_SNOW_LEVELS)} : 0.0;
    }
`;

/** The readers' GLSL (the aerial pass): `cotSunVisOf( a )` and `cotSnowOf( a )`. */
export const SCENE_ALPHA_READ_GLSL = /* glsl */ `${SCENE_ALPHA_SNOW_READ_GLSL}
    // the scene target's alpha: 2 + the CSM sun visibility of an opaque lit surface (in the snow band on a snowy terrain
    // pixel, sceneAlpha.ts), 4 + it on a vehicle (vehicleOcclusion.ts), below 1.5 anything else
    float cotSunVisOf( float a ) {
      if ( a >= ${f(VEHICLE_ALPHA_MIN)} ) return clamp( a - 4.0, 0.0, 1.0 );
      if ( a >= ${f(SCENE_ALPHA_SNOW_MIN)} ) return clamp( ( a - ${f(SCENE_ALPHA_SNOW_BASE)} - cotSnowBandOf( a ) * ${f(SCENE_ALPHA_SNOW_BAND)} ) / ${f(SCENE_ALPHA_SNOW_SPAN)}, 0.0, 1.0 );
      return a >= ${f(SCENE_ALPHA_OPAQUE)} ? clamp( a - ${f(SCENE_ALPHA_LIT)}, 0.0, 1.0 ) : -1.0;
    }
`;
