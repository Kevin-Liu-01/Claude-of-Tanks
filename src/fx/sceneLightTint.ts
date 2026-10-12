/**
 * The scene's light on the pooled FX media (particles.ts FX_LIGHT_TINT: the normal-blended dust, smoke and debris pools,
 * which draw their own colour and a sun-side shade, not the scene's lights). Linear RGB, from the live light rig
 * (scene.userData.lightRig, published by engine/lighting.ts every preset change): exactly white in daylight, falling
 * through warm dusk tones to a dim moonlit blue at night. Measured rigs (Verdant): day sun 4.5 / hemi 0.45 -> 1.0;
 * sunset 2.8 / 0.73 -> ~0.5 warm; night 0.6 / 0.75 -> ~0.2 blue. An overcast day's deck (sun 1.35, sky 0.85) dims it
 * to about half: the media take the light the ground under them takes, so the camera's exposure lifts both alike.
 *
 * (fx 9, the owner 2026-10-11: "make sure the effects and smoke and dust from tank driving and from engine and tracers
 * are correct for the times of days as well") the battle's pools were self-lit at the daylight level at every hour —
 * pale dust and exhaust glowing in a moonlit field; the Studio's cinematic layer alone tinted them. Battle and Studio
 * now read the same tint. Emissive media (fire's burning core, sparks, flashes, tracers) are never tinted. (2026-10-12,
 * the coordinator) The battle measures it on the grounded light model wherever that lights the scene
 * (battleLightTintForModel below), on the rig elsewhere.
 */
import type * as THREE from 'three';

type Rgb = { r: number; g: number; b: number };
interface LightRigLike {
  sunIntensity?: number; sunColor?: Rgb;
  hemiIntensity?: number; hemiSky?: Rgb; hemiGround?: Rgb;
  fillIntensity?: number; fillColor?: Rgb;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The rig's level (0.06..1 of Verdant's noon) at which the tint starts to blend to pure white, reaching it 0.13 above:
 *  the Studio's cinematic layer measured its rigs against Verdant's noon (0.82); the battle keeps every clear daylight
 *  map's look exactly (their published rigs sit at 0.85-1.0 of it: sun 3.7-4.5) and tints only dusk, night and an
 *  overcast deck (0.72). */
export const TINT_WHITE_FROM_CINEMATIC = 0.82, TINT_WHITE_FROM_BATTLE = 0.72;

/** The tint for a light rig (out, linear RGB); white with no rig. */
export function lightTintForRig(rig: LightRigLike | null | undefined, out: THREE.Color,
  whiteFrom = TINT_WHITE_FROM_CINEMATIC): THREE.Color {
  if (!rig || !rig.sunColor || !rig.hemiSky) return out.setRGB(1, 1, 1);
  const sunI = rig.sunIntensity ?? 4.5, hemiI = rig.hemiIntensity ?? 0.45;
  const sc = rig.sunColor, hc = rig.hemiSky;
  const sunLum = 0.2126 * sc.r + 0.7152 * sc.g + 0.0722 * sc.b;
  const level = clamp((sunI * sunLum * 0.75 + hemiI * 0.9) / 3.4, 0.06, 1);
  // hue: sun and sky poles weighted by their share of the light
  const ws = sunI * 0.75, wh = hemiI * 0.9;
  let r = sc.r * ws + hc.r * wh, g = sc.g * ws + hc.g * wh, b = sc.b * ws + hc.b * wh;
  const peak = Math.max(r, g, b, 1e-4);
  r /= peak; g /= peak; b /= peak;
  const white = clamp((level - whiteFrom) / 0.13, 0, 1);
  const k = level * (1 - white);
  return out.setRGB(r * k + white, g * k + white, b * k + white);
}

/** The tint for a scene's published light rig (the Studio cinematic layer's measure). */
export function lightTintFromRig(scene: THREE.Scene | null | undefined, out: THREE.Color,
  whiteFrom = TINT_WHITE_FROM_CINEMATIC): THREE.Color {
  return lightTintForRig((scene?.userData?.lightRig ?? null) as LightRigLike | null, out, whiteFrom);
}

/**
 * The battle's measure on the authored rig (the phone tier's Preetham sky, a galaxy sky, any scene without the grounded
 * model): the light a puff of dust or smoke receives under the rig, as a share of what it receives under the engine's
 * default noon rig (engine/lighting.ts: sun 4.5 #fff1dc, sky .36 #aac8f5 over ground #94815f, fill .66 #bdd2f2). Every
 * term counts at its colour's luminance — the cinematic measure above counted the sky term at full strength whatever its
 * colour, so under the night's dim navy sky it lit the pools about three times brighter than the ground they rose from.
 * A puff takes the sun on its whole lit side (no cosine: it has no single facing), the sky dome from above with a little
 * of the ground's bounce, and the anti-sun fill.
 */
const srgbLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexLin = (hex: number): Rgb => ({ r: srgbLin(((hex >> 16) & 255) / 255), g: srgbLin(((hex >> 8) & 255) / 255), b: srgbLin((hex & 255) / 255) });
const lumOf = (c: Rgb): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const SUN_SHARE = 0.75, SKY_SHARE = 0.9, GROUND_IN_SKY = 0.35, FILL_SHARE = 0.5;
function puffIrradiance(rig: LightRigLike, out: Rgb): Rgb {
  const sun = rig.sunColor!, sky = rig.hemiSky!, ground = rig.hemiGround ?? sky, fill = rig.fillColor ?? sky;
  const sI = (rig.sunIntensity ?? 4.5) * SUN_SHARE, hI = (rig.hemiIntensity ?? 0.36) * SKY_SHARE, fI = (rig.fillIntensity ?? 0) * FILL_SHARE;
  const mix = (a: number, b: number) => a + (b - a) * GROUND_IN_SKY;
  out.r = sun.r * sI + mix(sky.r, ground.r) * hI + fill.r * fI;
  out.g = sun.g * sI + mix(sky.g, ground.g) * hI + fill.g * fI;
  out.b = sun.b * sI + mix(sky.b, ground.b) * hI + fill.b * fI;
  return out;
}
const NOON_RIG: LightRigLike = { sunIntensity: 4.5, sunColor: hexLin(0xfff1dc), hemiIntensity: 0.36, hemiSky: hexLin(0xaac8f5),
  hemiGround: hexLin(0x94815f), fillIntensity: 0.66, fillColor: hexLin(0xbdd2f2) };
const NOON_LUM = lumOf(puffIrradiance(NOON_RIG, { r: 0, g: 0, b: 0 }));
const _irr: Rgb = { r: 0, g: 0, b: 0 };
function tintFromLight(e: Rgb, level: number, out: THREE.Color): THREE.Color {
  const peak = Math.max(e.r, e.g, e.b, 1e-6);
  const white = clamp((level - TINT_WHITE_FROM_BATTLE) / 0.13, 0, 1), k = level * (1 - white);
  return out.setRGB((e.r / peak) * k + white, (e.g / peak) * k + white, (e.b / peak) * k + white);
}
/** The battle pools' tint for a rig (out, linear RGB): white on a clear day; its own light's share and hue otherwise. */
export function battleLightTintForRig(rig: LightRigLike | null | undefined, out: THREE.Color): THREE.Color {
  if (!rig || !rig.sunColor || !rig.hemiSky) return out.setRGB(1, 1, 1);
  const e = puffIrradiance(rig, _irr);
  return tintFromLight(e, clamp(lumOf(e) / NOON_LUM, 0.03, 1), out);
}

/**
 * The battle's measure under the grounded light model (engine/lightModel.ts, every open sky on the desktop tiers): the
 * rig it publishes has no sky term by day — the sky lights the scene through the environment (scene.environmentIntensity
 * over the dome's raw irradiance) — so the rig alone left out a fifth of the day's light and most of a sunset's. A puff
 * is a scattering volume: it takes light from every direction, so its measure is the light arriving over the whole
 * sphere — the sun at normal incidence, and the sky dome, the deck's glow and the ground's reflection each from its own
 * half of the sphere, twice the irradiance it gives a level face (a uniform hemisphere of radiance L sends π L onto a
 * level face and 2π L through a point). Against Verdant's clear day (VERDANT_DAY_PUFF_LIGHT, pinned by the receipt on
 * the model itself): sunset about half, warm; a moonlit night about a sixth, blue; an overcast deck about two fifths. The
 * camera's exposure lifts the pools and the ground alike, so a puff keeps the ground's own relation to it at every hour.
 */
interface LightModelLike {
  mode?: string; sunIntensity: number; sunColor: ArrayLike<number>; envIntensity: number; envDiffuseGain: number;
  hemiIntensity: number; hemiSky: ArrayLike<number>; hemiGround: ArrayLike<number>; groundAlbedo: ArrayLike<number>; illuminance: number;
}
/** The puff light of Verdant's clear day under the grounded model (sun 4.02, sky 1.13, the ground's reflection 0.98). */
export const VERDANT_DAY_PUFF_LIGHT = 6.136;
/** The light a puff receives under the grounded model (out, linear RGB; its luminance is the measure). */
export function puffLightForModel(model: LightModelLike, skyIrradianceRaw: Rgb, out: Rgb): Rgb {
  const sun = model.sunIntensity;
  const sky2 = 2 * Math.PI * model.envIntensity * model.envDiffuseGain; // × the dome's raw irradiance, per channel
  const hemi2 = 2 * model.hemiIntensity, ground2 = 2 * model.illuminance;
  const s = model.sunColor, hs = model.hemiSky, hg = model.hemiGround, ga = model.groundAlbedo;
  out.r = s[0] * sun + skyIrradianceRaw.r * sky2 + (hs[0] + hg[0]) * hemi2 + ga[0] * ground2;
  out.g = s[1] * sun + skyIrradianceRaw.g * sky2 + (hs[1] + hg[1]) * hemi2 + ga[1] * ground2;
  out.b = s[2] * sun + skyIrradianceRaw.b * sky2 + (hs[2] + hg[2]) * hemi2 + ga[2] * ground2;
  return out;
}
/** The battle pools' tint under the grounded model (out, linear RGB). */
export function battleLightTintForModel(model: LightModelLike, skyIrradianceRaw: Rgb, out: THREE.Color): THREE.Color {
  const e = puffLightForModel(model, skyIrradianceRaw, _irr);
  return tintFromLight(e, clamp(lumOf(e) / VERDANT_DAY_PUFF_LIGHT, 0.03, 1), out);
}
/** The battle pools' tint for a scene: the grounded model's measure where it lights the scene, the rig's otherwise. */
export function battleLightTintFromRig(scene: THREE.Scene | null | undefined, out: THREE.Color): THREE.Color {
  const data = scene?.userData;
  const model = data?.lightModel as LightModelLike | undefined;
  const irr = (data?.atmosphere as { irradianceRaw?: Rgb | null } | undefined)?.irradianceRaw;
  if (model && model.mode === 'physical' && irr) return battleLightTintForModel(model, irr, out);
  return battleLightTintForRig((data?.lightRig ?? null) as LightRigLike | null, out);
}
