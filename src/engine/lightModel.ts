/**
 * lightModel.ts — the grounded light model (2026-10-01, the visual redesign's lighting lane).
 *
 * One pure function turns a map's sky preset (sun, atmosphere, cloud cover, the optional `lighting` block) and the
 * physically based sky the atmosphere rendered (atmosphere.ts, its summary readback) into the light the renderer
 * applies: the direct sun, the image-based sky light, the overcast dome, the ground the sky sees below the horizon,
 * the exposure and the subtle per-map grade. No DOM, no WebGL: the receipt and the offline tools run it in Node.
 *
 * The model, in the engine's light units (a directional light of intensity 1 gives irradiance 1):
 *
 *   sun        E0 · T(sun) · (1 − 0.98 · overcast)   T = the atmosphere's transmittance toward the sun (the same medium
 *                                                    and march as the transmittance LUT, integrated here on the CPU), E0
 *                                                    LIGHT_SOLAR_IRRADIANCE: the solar constant in light units, fixed so
 *                                                    Verdant's 32° sun keeps the key every material was authored under;
 *                                                    the colour is T, through an overcast deck greyed toward cloud light.
 *                                                    Derived on every preset, never read from it: a map's sun follows its
 *                                                    own elevation, atmosphere and cloudscape whoever edits them, and the
 *                                                    authored sunIntensity / sunColorHex light only the night (the moon)
 *                                                    and the legacy rig
 *   sky        the PMREM of the sky dome itself, baked without the sun disc and without the display knee (sky.ts), at
 *              environment intensity 1 so a mirror reflects the sky the dome shows; its diffuse share takes
 *              SKY_DIFFUSE_GAIN on top (the aerosol and fair-weather cloud light the round-65 visual calibration
 *              left out of the clean sky: the shade under a clear sky is lit about a quarter as strongly as the sun
 *              lights open ground, not a ninth) and keeps SKY_DIFFUSE_CHROMA of the clean dome's hue (that light is
 *              far whiter than the Rayleigh dome), and the clear sky's share fades under an overcast deck
 *   overcast   the deck's own diffuse light, the hemisphere light's new role: the sunlight and skylight the cloud
 *              transmits, neutral grey from above, the ground's reflection from below
 *   ground     below the horizon the environment shows the ground (its albedo under the sky light, and half of it
 *              sunlit — the share a clutter of shadows leaves, so a mirror turned down sees lit ground); the sunlit
 *              rest reaches the faces the sun lights through groundBounce.ts
 *   exposure   a camera that adapts part of the way: EXPOSURE_KEY · (E_ref / E)^ADAPTATION, E the horizontal
 *              illuminance (sun + sky + deck); a darker scene reads darker, never black, a brighter one never blows
 *
 * The retired terms: the anti-sun "rescue" fill (a second, unshadowed sun on every backlit face), the legacy disc
 * folded into the environment's diffuse mip (a shadowless sun-direction fill), the constant-hue hemisphere floor and
 * the environment floor. The mobile tier, whose dome is the Preetham fallback with no summary readback, keeps its
 * authored rig (`mode: 'legacy'`), and so do a galaxy sky (the space maps: a dome dimmed to the stars over an authored
 * daylight key, not a sky that lights the ground) and the Garage's enclosed bay (lighting.ts).
 *
 * 2026-10-02 (the boot weight): the types, the authored rig and the dispatcher live in lightModelCore.ts, in the boot
 * chunk; this module loads behind the battle entry (lightModelCore.ts loadGroundedLightModel: the battle atmosphere's
 * acquisition and the capture staging await it). It imports nothing at runtime — the core hands it the atmosphere it
 * integrates (groundedLightModel) — so its chunk shares no module with the boot closure.
 */
import type { AtmosphereParams } from './atmosphere.ts';
import type { GroundedLightEnv, GroundedLightResolver, LightModel, LightModelPreset, LightModelSky, Rgb } from './lightModelCore.ts';

/** The atmosphere and defaults the core hands over on install (atmosphere.ts's medium, the shared ground and meter). */
let env: GroundedLightEnv | null = null;
const atmosphereOf = (): GroundedLightEnv => {
  if (!env) throw new Error('lightModel.ts: install the grounded model first (lightModelCore.ts loadGroundedLightModel)');
  return env;
};
// the core's small helpers, local so this chunk imports nothing at runtime (lightModel.selftest pins them equal)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function hexToLinear(hex: number): Rgb {
  const ch = (v: number): number => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return [ch((hex >> 16) & 255), ch((hex >> 8) & 255), ch(hex & 255)];
}
function lightTune(name: string, fallback: number): number {
  try {
    const value = (globalThis as { __LIGHT_TUNE?: Record<string, number> }).__LIGHT_TUNE?.[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The solar constant in light units: Verdant's 32° sun through its atmosphere lands on the authored key every
 * material was tuned under (4.5 × 0xfff1dc = irradiance luminance 4.02 over a transmittance of 0.806).
 */
export const LIGHT_SOLAR_IRRADIANCE = 4.99;
/** Diffuse sky light over the dome's own radiance (aerosol + fair-weather cloud light the clean sky lacks). */
export const SKY_DIFFUSE_GAIN = 1.45;
/**
 * 2026-10-03 (the skies-and-atmosphere lane; the gauntlet's wave 0: the shade under a hull rendered indigo on straw and
 * teal on grass): the share of the clean dome's hue the sky's diffuse light keeps about its luminance. The dome's
 * cosine-weighted light runs B/R 3.3–4 (Verdant 0.069 / 0.130 / 0.273: a Rayleigh sky, far past 20 000 K); real open
 * shade under a clear sky, with the aerosol and whitened horizon the gain above stands for, runs 9 000–15 000 K
 * (B/R about 1.6–2.2): 0.4 lands Verdant at 1.8 and Sirocco at 1.6. The luminance — the shade's level, the exposure's
 * illuminance — is unchanged; the specular share keeps the dome's own colour (a mirror reflects the sky the eye sees).
 * 2026-10-04 (the gauntlet's wave 46: on Sirocco's sand the cast shadows read warmer than the sunlit sand in every
 * desert shot; wave 47: "no blue in the shade" on clear Saltwind): 0.4 → 0.5, the smallest of a GPU sweep (0.40 / 0.45 /
 * 0.50 / 0.55 / 0.65) at which the tank's shadow on the sand reads cooler than the sand in the sun (its yellowness about
 * its lightness, b* per L*: +0.03 over the sunlit sand at 0.40, −0.01 at 0.45, −0.04 at 0.50; the palms' shadow −0.11), with
 * the grass under Verdant's hull still green (hue 132° → 134°, never the waves' teal) and Verdant at B/R about 2.0. The
 * shade-fill toe (post.ts) lifts deep shade per channel, which took the old 0.4's margin; a closed deck keeps its shade
 * neutral (× 1 − the overcast: Whiteout's frames unchanged).
 */
export const SKY_DIFFUSE_CHROMA = 0.5;
/**
 * Share of the direct sun an overcast deck removes at overcast 1.
 *
 * 2026-10-04 (the skies lane; the gauntlet's waves 80 and 82: under Titan Gorge's closed deck "the terrain beneath stays
 * implausibly saturated and contrasty", "crisp, hard-edged shadows" under a discless glow): 0.9 → 0.96. A closed deck
 * passes almost none of the beam — thick stratus leaves a few per cent, very soft — and the 0.9 cut left a tenth: on
 * Titan's sand 13 % of the horizontal light came from a point sun, a sun-facing wall took 0.42 over the 0.95 the deck
 * gave every wall (lit and shaded faces 1.4 apart), and the cascades cast it hard-edged. What the deck cuts past
 * OVERCAST_DIFFUSED_FROM it sends down diffused, in its glow, so the horizontal light — the exposure — holds.
 * 2026-10-05 (with OVERCAST_THICK_CUT): 0.96 → 0.98. The thick deck's glow fell to 0.45 of itself, and the 4 % of the beam
 * a closed deck passed rose from 6 % of Titan Gorge's sun-and-deck light to 11 % (Whiteout 3 → 5 %) — the hard shadows of
 * waves 80 and 82 coming back; 2 % holds the sun's share where it was (5 %, 3 %). A deck with gaps keeps its clear sun in
 * the gaps (resolveDeckClosure): there the change only moves 2 % of the average beam into the glow.
 */
export const OVERCAST_DIRECT_CUT = 0.98;
/** The beam cut the deck's glow (OVERCAST_TRANSMISSION) was calibrated against (2026-10-01): a deck's cut past it comes
 * down diffused, added to the glow. */
export const OVERCAST_DIFFUSED_FROM = 0.9;
/** Share of the clear sky's light an overcast deck replaces at overcast 1. */
export const OVERCAST_SKY_CUT = 0.85;
/** Diffuse transmission of the deck: the share of the clear-sky horizontal light it passes on as its own glow. */
export const OVERCAST_TRANSMISSION = 0.42;
/**
 * 2026-10-05 (the gauntlet's wave 118, both critics: "sand and lawn are bright and saturated under grey overcast"):
 * under a deck a ground sits near its own albedo against the sky — the overcast photographs' ground/sky 0.13–0.16 — and
 * the game's sat at twice that (Railyard 0.31, Titan Gorge's sand 0.48–0.57): the hemisphere carried 42 % of the clear
 * light while the trace draws the deck's transmitted sun at a third of its physical share. A thick deck passes less than
 * a thin one: the glow's transmission falls by OVERCAST_THICK_CUT over the overcast's last stretch (smoothstep from
 * OVERCAST_THICK_FROM to 1). With the camera adapting 60 % to the horizontal light, ground/sky on screen follows the light
 * itself: the ground darker, the deck brighter (QA knobs of the same names). Measured (in-page, Railyard 0.95 / Titan
 * Gorge 1.0 / Frosthollow 0.79, establishing and sunward): the transmission halved took ground/sky 0.31 → 0.24, 0.57 →
 * 0.42 and 1.26 → 1.05, and with the sun off Railyard's ambient alone sat at 0.23 — so a little past half at a full deck:
 * 0.55 from overcast 0.5 (0.42 → 0.19 at a closed deck, 0.20 at Railyard, 0.28 at Frosthollow; a clear sky untouched).
 */
export const OVERCAST_THICK_CUT = 0.55;
export const OVERCAST_THICK_FROM = 0.5;
/**
 * 2026-10-05 (the same wave): the grade's linear saturation under a deck, × (1 − this × overcast) (QA:
 * OVERCAST_SATURATION_CUT): the 1.4 a sunlit frame takes to 1.15 under a closed deck (Titan Gorge's sand C* 34 → 26,
 * Railyard 17 → 13 in the lab; the overcast photographs 8.5–24); a clear sky untouched.
 */
export const OVERCAST_SATURATION_CUT = 0.18;
/** The deck's light: a neutral grey, a touch cool (linear, luminance ≈ 1; overcast daylight ≈ 6500–7000 K). */
export const OVERCAST_LIGHT_COLOR: Rgb = Object.freeze([0.96, 1.0, 1.04]) as Rgb;
/**
 * 2026-10-03 (the skies-and-atmosphere lane; the gauntlet's wave 17 on Whiteout's chase: the overcast snow read as "dull
 * blue-grey plaster, darker and much bluer than the neutral overcast sky" — its light a fifth darker than the deck's
 * level and B/R 1.36 against the sky's 1.13): the share of the light a ground sends up that a deck's base sends back
 * down (a stratus base returns about half of it). Light bounces between a bright ground and a closed deck — why an
 * overcast snowfield is bright and a whiteout loses its horizon — so the deck's glow carries the returned light,
 * E · g / (1 − g) on the direct E, g = overcast × this × the ground's albedo: a snowfield (0.80) under a closed deck
 * gains two thirds, grass (0.2) a tenth, an open sky nothing.
 */
export const OVERCAST_GROUND_RETURN = 0.5;
/**
 * The night's own sky light (horizontal irradiance at full night, light units): the moonlit sky, airglow and the
 * scattered light of a populated horizon that keep a moonlit field readable — the dome's 8 % moonlit sky alone
 * lights the shade about a tenth as strongly as the moon lights open ground, which reads as a black void on a screen.
 */
export const NIGHT_SKY_GLOW = 0.22;
/**
 * The camera's night offset (EV at full night): a moonlit scene sits under two stops below the day (its displayed key
 * about 30 % of Verdant's noon — the old rig's night sat at about a third of its day, and the owner asked on 2026-09-14
 * for a night a little more visible, not darker; the shade keeps the glow's light).
 * (2026-10-03: +0.265 while the daylight key sat at 1.05, carrying the night's camera; −0.25 again with the key back at 1.5.)
 */
export const NIGHT_EV = -0.25;
/**
 * The camera's low-sun offset (EV with the sun near the horizon, full below 6°, none above 18°): a golden-hour scene is
 * exposed for its sky rather than opened toward the day's key, so the long light keeps its depth and the sky its blue
 * (the adapting camera alone lifted the 7° sunset to a pale, flat near-day).
 */
export const LOW_SUN_EV = -0.5;
/**
 * 2026-10-03 (the skies-and-atmosphere lane; the gauntlet's wave 7: a key matched to the photographs' median greyed
 * every snowfield): the camera's lift for a bright ground, the way a photographer opens up over a snowfield. A map whose
 * ground albedo (its luminance) passes EXPOSURE_ALBEDO_REF gains EXPOSURE_ALBEDO_K stops per doubling, at most
 * EXPOSURE_ALBEDO_MAX_EV, by day (Frosthollow's 0.80: +0.3 EV at K 0.25); every darker ground is untouched (QA:
 * __LIGHT_TUNE.EXPOSURE_ALBEDO_K; fp10's preview of +0.5 EV put the snow at L* 83-85 against 77-80).
 * (2026-10-03, the gauntlet's wave 19: K 0.42 → 0.25 with the deck's ground return, which brightens an overcast
 * snowfield by itself — OVERCAST_GROUND_RETURN; fp12's lift25 frames: Whiteout's chase 1.86 → 3.86 against the PR head.)
 */
export const EXPOSURE_ALBEDO_REF = 0.35;
export const EXPOSURE_ALBEDO_K = 0.25;
export const EXPOSURE_ALBEDO_MAX_EV = 0.75;
/** The bright-ground lift (EV) of a ground albedo (luminance) by day; 0 at or under the reference. */
export function exposureAlbedoEV(groundLuminance: number): number {
  const k = lightTune('EXPOSURE_ALBEDO_K', EXPOSURE_ALBEDO_K);
  if (!(k > 0) || !(groundLuminance > EXPOSURE_ALBEDO_REF)) return 0;
  return clamp(k * Math.log2(groundLuminance / EXPOSURE_ALBEDO_REF), 0, lightTune('EXPOSURE_ALBEDO_MAX_EV', EXPOSURE_ALBEDO_MAX_EV));
}
/** Its colour: the blue of a moonlit sky (linear, luminance ≈ 1). */
export const NIGHT_GLOW_COLOR: Rgb = Object.freeze([0.72, 0.95, 1.38]) as Rgb;
/** The sunlit share of the ground the environment shows below the horizon (groundBounce.ts adds the rest). */
export const GROUND_SUNLIT_SHARE = 0.5;
/**
 * Exposure law: the key at the reference illuminance, and the adaptation share.
 *
 * 2026-10-03 (the skies-and-atmosphere lane, which the gauntlet's wave 0 handed light, colour and atmosphere: "flat
 * high-key lighting", "exposure either washed out or oversaturated"): the key is a calibrated meter, π / E_ref — an 18 %
 * grey card under the reference illuminance (3.0) reaches the tone curve at scene-linear 0.18, AgX's middle grey (display
 * L* ≈ 53, the photographic standard). The 1.5 it replaces was half a stop hot: a sunlit card at Verdant displayed at
 * L* ≈ 60 and the census frames' median at L* 63 with their darkest twentieth at 36, against 54 / 23 for the gauntlet's
 * thirty-five reference photographs (World of Tanks 43 / 19, War Thunder 47 / 17); offline re-grades of the wave-0
 * frames put this key at 53 / 24.
 *
 * Back to 1.5 the same day (the gauntlet's wave 7, PR head against the lane: sky +0.13, lighting −0.20, Frosthollow's
 * chase −1.6): a key matched to the photographs' median pulled every snowfield to grey (the snow at L* 70–73 against
 * 79–80, where a photographer keeps it near white with +1 to +1.5 EV over a mid-grey meter). The calibration returns
 * only with an albedo-aware key that holds snow and bright sand high (the lane's next hand-over).
 */
export const EXPOSURE_KEY = 1.5;
export const EXPOSURE_ADAPTATION = 0.6;
/** The camera's adaptation bounds around its key (a night scene stays a night scene, a snowfield never goes grey). */
export const EXPOSURE_MIN = 0.45;
export const EXPOSURE_MAX = 2.6;
/** How much of the vehicle readability lift an overcast deck of 1 removes (the deck lights every face). */
export const READABILITY_OVERCAST_FADE = 0.7;

/** Linear RGB → sRGB hex (rounded). */
export function linearToHex(c: Rgb): number {
  const ch = (v: number): number => {
    const x = clamp(v, 0, 1);
    const s = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(clamp(s, 0, 1) * 255);
  };
  return (ch(c[0]) << 16) | (ch(c[1]) << 8) | ch(c[2]);
}

/**
 * Transmittance from the viewer toward a direction of elevation sine `mu` — the atmosphere's medium (atmosphere.ts
 * ATMO_MEDIUM, scaled by the preset's parameters) marched to the top of the atmosphere, the transmittance LUT's own
 * integral (it agrees with the LUT texel to its bilinear error).
 */
export function atmosphereTransmittance(p: AtmosphereParams, mu: number, steps = atmosphereOf().transmittanceSteps): [number, number, number] {
  const { groundKm: ATMO_GROUND_KM, topKm: ATMO_TOP_KM, medium: M } = atmosphereOf();
  const r = ATMO_GROUND_KM + p.viewHeightKm;
  const m = clamp(mu, -1, 1);
  const dx = Math.sqrt(Math.max(1 - m * m, 0)), dy = m;
  // ray from (0, r) along (dx, dy) to the sphere of radius ATMO_TOP_KM
  const b = r * dy;
  const c = r * r - ATMO_TOP_KM * ATMO_TOP_KM;
  const tMax = -b + Math.sqrt(Math.max(b * b - c, 0));
  // a ray into the ground (below the horizon past the tangent) sees no sun
  const cg = r * r - ATMO_GROUND_KM * ATMO_GROUND_KM;
  if (dy < 0 && b * b - cg >= 0 && -b - Math.sqrt(b * b - cg) > 0) return [0, 0, 0];
  const dt = tMax / steps;
  const od = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const h = Math.hypot(dx * t, r + dy * t) - ATMO_GROUND_KM;
    const rayD = Math.exp(-h / M.rayleighScaleHeightKm);
    const mieD = Math.exp(-h / M.mieScaleHeightKm);
    const ozD = Math.max(0, 1 - Math.abs(h - M.ozoneCentreKm) / M.ozoneHalfWidthKm);
    for (let k = 0; k < 3; k++) {
      od[k] += (M.rayleighScattering[k] * rayD * p.rayleighScale
        + M.mieExtinction * mieD * p.mieScale
        + M.ozoneAbsorption[k] * ozD * p.ozoneScale) * dt;
    }
  }
  return [Math.exp(-od[0]), Math.exp(-od[1]), Math.exp(-od[2])];
}

/**
 * The physical sun of a preset through its atmosphere and deck, in the authored convention: a colour whose
 * brightest channel is 1 (an sRGB hex with a 0xff channel) and an intensity such that intensity × luminance(colour)
 * is the irradiance luminance — exactly how the map presets write `sunIntensity` / `sunColorHex`.
 */
export function deriveSun(
  p: AtmosphereParams, overcast: number, solar = LIGHT_SOLAR_IRRADIANCE,
): { intensity: number; color: Rgb; colorHex: number } {
  const T = atmosphereTransmittance(p, p.sunDir[1]);
  const lumT = luminance(T);
  if (!(lumT > 1e-6)) return { intensity: 0, color: [1, 1, 1], colorHex: 0xffffff };
  const o = clamp(overcast, 0, 1);
  const tint: Rgb = [T[0] / lumT, T[1] / lumT, T[2] / lumT];
  const grey = OVERCAST_LIGHT_COLOR;
  const mixed = [tint[0] + (grey[0] - tint[0]) * o, tint[1] + (grey[1] - tint[1]) * o, tint[2] + (grey[2] - tint[2]) * o];
  const peak = Math.max(mixed[0], mixed[1], mixed[2]);
  const color: Rgb = [mixed[0] / peak, mixed[1] / peak, mixed[2] / peak];
  const colorHex = linearToHex(color);
  const quantized = hexToLinear(colorHex);
  const irradiance = lightTune('LIGHT_SOLAR_IRRADIANCE', solar) * lumT * (1 - lightTune('OVERCAST_DIRECT_CUT', OVERCAST_DIRECT_CUT) * o);
  return { intensity: irradiance / luminance(quantized), color: quantized, colorHex };
}

/** The white-balance gains of a warmth value (luminance-preserving; +1 ≈ a 1500 K warmer grade). */
export function whiteBalanceGains(warmth: number): Rgb {
  const w = clamp(warmth, -1, 1);
  const g: Rgb = [1 + 0.16 * w, 1 + 0.01 * w, 1 - 0.2 * w];
  const l = luminance(g);
  return [g[0] / l, g[1] / l, g[2] / l];
}

/** The exposure the law gives a horizontal illuminance (and an authored EV offset). */
export function exposureFor(illuminance: number, exposureEV = 0): number {
  const e = Math.max(illuminance, 1e-4);
  const ratio = Math.pow(lightTune('EXPOSURE_REFERENCE_ILLUMINANCE', atmosphereOf().referenceIlluminance) / e, lightTune('EXPOSURE_ADAPTATION', EXPOSURE_ADAPTATION));
  return lightTune('EXPOSURE_KEY', EXPOSURE_KEY) * clamp(ratio, lightTune('EXPOSURE_MIN', EXPOSURE_MIN), lightTune('EXPOSURE_MAX', EXPOSURE_MAX))
    * Math.pow(2, clamp(exposureEV, -3, 3));
}

/** The grounded model of an open sky (lightModelCore.ts resolveLightModel hands it every resolve with a summary, and
 * the preset's overcast and night, which the authored rig reads too). */
function resolveGrounded(
  preset: LightModelPreset,
  params: AtmosphereParams,
  sky: LightModelSky,
  sun: { intensity: number; colorHex: number } | null,
  overcast: number,
  night: number,
  closure = 1,
): LightModel {
  const L = preset.lighting ?? {};
  // (2026-10-05, the skies lane: a deck with gaps) the sun the cascades carry takes the overcast's cut only by the deck's
  // closure (lightModelCore.ts resolveDeckClosure) — in a gap it is the clear sun, and the cloud shade map's pattern
  // shades the cells — while the light the camera meters, the ground's radiance and the deck's return take the average
  // cut (`derived`), so the exposure and the open ground's mean level hold
  const derived = deriveSun(params, overcast);
  const close = clamp(closure, 0, 1);
  const beam = close < 1 ? deriveSun(params, overcast * close) : derived;
  // the night: the dome dimmed to a moonlit sky. The direct light is the authored moon there, the derived sun by day,
  // blended by the night amount (the presets sit at its ends: day and sunset 0, the night preset 1)
  const moon = sun ? { intensity: sun.intensity, color: hexToLinear(sun.colorHex) } : { intensity: derived.intensity, color: derived.color };
  const sunIntensity = beam.intensity + (moon.intensity - beam.intensity) * night;
  const sunColor: Rgb = [0, 1, 2].map((c) => beam.color[c] + (moon.color[c] - beam.color[c]) * night) as unknown as Rgb;
  // the average direct (the meter's, the ground's, the deck's return): the overcast's whole cut
  const avgIntensity = derived.intensity + (moon.intensity - derived.intensity) * night;
  const avgColor: Rgb = [0, 1, 2].map((c) => derived.color[c] + (moon.color[c] - derived.color[c]) * night) as unknown as Rgb;
  const sunIrradiance = avgIntensity * luminance(avgColor);
  const sinEl = Math.max(0, params.sunDir[1]);
  // the clear sky (the env bake's dome, in its own units, × skyIntensity already) and its light
  const irr = sky.irradianceRaw;
  const clearShare = 1 - lightTune('OVERCAST_SKY_CUT', OVERCAST_SKY_CUT) * overcast;
  const envIntensity = clearShare;
  const envDiffuseGain = lightTune('SKY_DIFFUSE_GAIN', SKY_DIFFUSE_GAIN) * (L.skyLight ?? 1);
  const skyLightH = Math.PI * luminance(irr) * envIntensity * envDiffuseGain;
  // the deck's glow: the clear-sky horizontal light it transmits (sun + sky as if the deck were absent)
  // (by night the moon the deck would pass: the authored key is the moonlight as seen, never cut)
  // (2026-10-04: the clear sun from the clear sun itself — dividing the cut one back out failed at a cut of 1)
  const clear = deriveSun(params, 0);
  const clearSun = clear.intensity * luminance(clear.color);
  const clearSunH = (clearSun + (moon.intensity * luminance(moon.color) - clearSun) * night) * sinEl;
  const clearSkyH = Math.PI * luminance(irr) * envDiffuseGain;
  // (2026-10-04) the beam a deck cuts past the glow's calibration comes down diffused (OVERCAST_DIRECT_CUT): by day the
  // horizontal light it took from the sun returns in the glow, so the exposure and the open ground's level hold while
  // the faces and cast shadows the point sun modelled lose it (QA: OVERCAST_BEAM_DIFFUSE 0 drops it)
  const beamDiffused = Math.max(0, lightTune('OVERCAST_DIRECT_CUT', OVERCAST_DIRECT_CUT) - OVERCAST_DIFFUSED_FROM) * clamp(overcast, 0, 1)
    * clearSun * sinEl * (1 - night) * lightTune('OVERCAST_BEAM_DIFFUSE', 1);
  // (2026-10-05: a thick deck passes less — OVERCAST_THICK_CUT over the overcast's last stretch)
  const thick = 1 - lightTune('OVERCAST_THICK_CUT', OVERCAST_THICK_CUT) * smoothstep(lightTune('OVERCAST_THICK_FROM', OVERCAST_THICK_FROM), 1, overcast);
  const deckGlow = overcast * lightTune('OVERCAST_TRANSMISSION', OVERCAST_TRANSMISSION) * thick * (clearSunH + clearSkyH) + beamDiffused;
  // at night the hemisphere also carries the night sky's own glow (NIGHT_SKY_GLOW), blended into its colour by share
  const nightGlow = night * lightTune('NIGHT_SKY_GLOW', NIGHT_SKY_GLOW);
  const ground = L.groundAlbedoHex != null ? hexToLinear(L.groundAlbedoHex) : atmosphereOf().groundAlbedo;
  // (2026-10-03) the deck sends back part of what the ground sends up (OVERCAST_GROUND_RETURN), in the deck's own light
  const groundReturn = clamp(overcast * lightTune('OVERCAST_GROUND_RETURN', OVERCAST_GROUND_RETURN) * luminance(ground), 0, 0.9);
  const returned = (sunIrradiance * sinEl + skyLightH + deckGlow + nightGlow) * groundReturn / (1 - groundReturn);
  const hemiIntensity = deckGlow + nightGlow + returned;
  const glowShare = hemiIntensity > 1e-6 ? nightGlow / hemiIntensity : 0;
  const hemiSky: Rgb = [0, 1, 2].map((c) => OVERCAST_LIGHT_COLOR[c] + (NIGHT_GLOW_COLOR[c] - OVERCAST_LIGHT_COLOR[c]) * glowShare) as unknown as Rgb;
  // the deck's light from below is its reflection off the ground: the hemisphere's ground pole is the albedo itself
  const hemiGround: Rgb = [ground[0], ground[1], ground[2]];
  const illuminance = sunIrradiance * sinEl + skyLightH + hemiIntensity;
  const sunElevationDeg = Math.asin(clamp(params.sunDir[1], -1, 1)) * 180 / Math.PI;
  const lowSun = (1 - night) * (1 - smoothstep(6, 18, sunElevationDeg));
  const exposure = exposureFor(illuminance, (L.exposureEV ?? 0) + night * lightTune('NIGHT_EV', NIGHT_EV)
    + lowSun * lightTune('LOW_SUN_EV', LOW_SUN_EV) + (1 - night) * exposureAlbedoEV(luminance(ground)));
  // the readability lift's floor holds its on-screen level as the camera adapts (Verdant's key keeps it whole), and
  // fades with the deck that lights the shade itself
  const vehicleReadability = clamp(Math.min(1, lightTune('EXPOSURE_KEY', EXPOSURE_KEY) / exposure)
    * (1 - lightTune('READABILITY_OVERCAST_FADE', READABILITY_OVERCAST_FADE) * overcast), 0.1, 1);
  return {
    mode: 'physical',
    sunIntensity,
    sunColor,
    envIntensity,
    envDiffuseGain,
    // (2026-10-03: the clear sky's share under a deck keeps none of the dome's blue at a closed deck — the deck's light
    // is the deck's grey; the clear dome's Rayleigh hue on the remaining share put Whiteout's snow at B/R 1.36)
    envDiffuseChroma: clamp(lightTune('SKY_DIFFUSE_CHROMA', SKY_DIFFUSE_CHROMA), 0, 1) * (1 - clamp(overcast, 0, 1)),
    hemiIntensity,
    hemiSky,
    hemiGround,
    fillIntensity: 0,
    groundAlbedo: ground,
    groundRadiance: [0, 1, 2].map((c) => ground[c] * (irr[c] + lightTune('GROUND_SUNLIT_SHARE', GROUND_SUNLIT_SHARE)
      * avgIntensity * avgColor[c] * sinEl / (Math.PI * Math.max(envDiffuseGain, 1e-3)))) as unknown as Rgb,
    overcast,
    deckClosure: close,
    illuminance,
    exposure,
    whiteBalance: whiteBalanceGains(L.warmth ?? 0),
    saturation: (L.saturation ?? 1) * (1 - lightTune('OVERCAST_SATURATION_CUT', OVERCAST_SATURATION_CUT) * clamp(overcast, 0, 1)),
    contrast: L.contrast ?? 1,
    night,
    vehicleReadability,
  };
}

/** lightModelCore.ts, on load: the grounded resolver over the atmosphere the core hands over. */
export function groundedLightModel(handed: GroundedLightEnv): GroundedLightResolver {
  env = handed;
  return resolveGrounded;
}
