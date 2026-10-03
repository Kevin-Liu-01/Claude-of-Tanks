/**
 * hazeLaw.ts — the battlefield's aerial perspective on the physically based sky (2026-10-03, the skies-and-atmosphere
 * lane of the visual redesign; owner 2026-10-02: "maps need to look so much better esp the horizons"; the integrator:
 * "haze turns the far half of the overview milky ... far land loses colour, contrast and the layering of near, mid and
 * far ridges"; the mountains lane: far ranges at 1.9–3.3 km read at 0.95–1.07 of the sky above them).
 *
 * One Beer–Lambert law for every surface and every cloud the desktop tier draws over the atmosphere: the light of a
 * thing d metres out reaches the camera as L·T + S·(1 − T), T = exp(−σ · d · ρ̄ · c) per channel, where
 *   σ   the map's own air: its authored fogDensity (Monsoon thick, the coast clear) × HAZE_SIGMA_PER_FOG,
 *   ρ̄   the path-averaged density of an exponential haze layer (scale height HAZE_LAYER_SCALE_M over the ground under
 *       the camera) between the camera's height and the point's — a crest stands in thinner air than its foot, a cloud
 *       base over most of the layer, a camera 300 m up looks down through less of it,
 *   c   the per-channel extinction (aerosol haze dims blue a little faster than red: far sandstone keeps its warmth),
 *   S   the in-scatter target: the sky behind the point (post.ts: a step under it, so a range never pales past it).
 * Every kilometre adds the same share of haze, so near, mid and far ridges stay separate layers: the round-6 Gaussian
 * curves this replaces saturated at ~650 m, their ceilings gave every range from 0.7 to 3 km one veil, and the
 * materials' FogExp2 laid a second veil over the ranges (62–77 % at 3 km) — it keeps HAZE_MATERIAL_FOG_SHARE of its
 * share here (sky.ts), enough for what writes no depth. The mobile tier's legacy dome keeps the round-6 law byte for byte.
 *
 * The constants are read through the light model's QA hook (lightTune), so a lab can sweep them live; the GLSL is shared
 * by the aerial pass (post.ts) and the cloud trace (volumetricClouds.ts), so a cloud bank and the range under it haze alike.
 */
import { lightTune } from './lightModelCore.ts';

/** σ (1/m) per unit of the map's fogDensity: Verdant's 0.00074 → 0.00031 (T at 2 km 0.54 on the ground). */
export const HAZE_SIGMA_PER_FOG = 0.42;
/**
 * The haze layer's scale height (m) over the ground under the camera: thin enough that a crest 400 m up stands in a
 * third less haze than its foot (the far ranges read to the horizon) and an overview from 300 m looks down through two
 * thirds of the ground's (World of Tanks' overviews keep the far half's colour), the path across the ground at its full.
 */
export const HAZE_LAYER_SCALE_M = 400;
/** Per-channel extinction, luminance-weighted mean 1. */
export const HAZE_EXT_CHROMA: readonly [number, number, number] = Object.freeze([0.90, 1.0, 1.14]) as readonly [number, number, number];
/** The authored fog tint's share of the in-scatter target (× the map's fogMix); all of it under a closed deck. */
export const HAZE_TINT_SHARE = 0.4;
/** The in-scatter target relative to the sky behind the surface (a range never pales past the sky). */
export const HAZE_TARGET_SKY_K = 0.92;
/**
 * The in-scatter target under a closed deck, relative to the clear sky's (× the light model's overcast): the LUT is the
 * clear sky, but under a deck the air is lit by what the deck lets through (about half the clear sky's light, lightModel.ts
 * OVERCAST_TRANSMISSION and the cut sun) — the labs (2026-10-03): Cinder Junction's overview under the clear sky's target
 * took a milky veil a few hundred metres out.
 */
export const HAZE_OVERCAST_K = 0.45;
/** The materials' FogExp2 share of its old extinction share on the physically based sky (sky.ts applyFog). */
export const HAZE_MATERIAL_FOG_SHARE = 0.3;

/** σ (1/m) of a map's fogDensity (QA-tunable). */
export function hazeSigma(fogDensity: number): number {
  return Math.max(0, (Number.isFinite(fogDensity) ? fogDensity : 0) * lightTune('AERIAL_SIGMA_PER_FOG', HAZE_SIGMA_PER_FOG));
}
/** 1 / the layer's scale height (QA-tunable, floor 50 m). */
export function hazeLayerInverseScale(): number {
  return 1 / Math.max(50, lightTune('AERIAL_LAYER_SCALE_M', HAZE_LAYER_SCALE_M));
}

/**
 * GLSL: the layer's path-averaged density (1 at the datum) between heights a0 and a1 over the datum, both in units of
 * the scale height; and the per-channel transmittance of a path of length d at σ.
 */
export const HAZE_LAW_GLSL = /* glsl */`
float hazeLayerMean( float a0, float a1 ) {
	return abs( a0 - a1 ) < 1e-3 ? exp( -0.5 * ( a0 + a1 ) ) : ( exp( -a1 ) - exp( -a0 ) ) / ( a0 - a1 );
}
vec3 hazeTransmittance( float sigma, float d, float layerMean, vec3 chroma ) {
	return exp( -( sigma * d * layerMean ) * chroma );
}
`;
