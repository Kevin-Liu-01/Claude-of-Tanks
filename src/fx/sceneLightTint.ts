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
 * now read the same tint. Emissive media (fire's burning core, sparks, flashes, tracers) are never tinted.
 */
import type * as THREE from 'three';

interface LightRigLike {
  sunIntensity?: number; sunColor?: { r: number; g: number; b: number };
  hemiIntensity?: number; hemiSky?: { r: number; g: number; b: number };
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

/** The tint for a scene's published light rig. */
export function lightTintFromRig(scene: THREE.Scene | null | undefined, out: THREE.Color,
  whiteFrom = TINT_WHITE_FROM_CINEMATIC): THREE.Color {
  return lightTintForRig((scene?.userData?.lightRig ?? null) as LightRigLike | null, out, whiteFrom);
}
