// Per-vertex lamp emission on existing merged/instanced geometry. Never make
// shared poles, armor or periscopes glow just because they share a material.
import * as THREE from 'three';

export const NIGHT_EMISSION_ATTRIBUTE = 'nightEmissionMask';
export const NIGHT_HEADLIGHT_COLOR = 0xffe2ad;
export const NIGHT_SHTORA_COLOR = 0xff3020;
// Saturated red driven at the shared white-lamp radiance (3) turns amber
// through ACES' channel mixing and washes to a pale pink along AgX's path to
// white (the production curve since 2026-10-01). Keep only a fifth of the
// added red-aperture radiance, then cap the lit lens at the tone curve's
// input (NIGHT_RED_DISPLAY_LEVEL); authored day emission and warm lamps stay
// unchanged.
const RED_EMISSION_GAIN = .2;
/**
 * 2026-10-02: the ceiling of a lit red lens at the tone curve's input (its peak channel after the camera's exposure,
 * post.ts). The grounded light model's night camera opens about two stops over the day's (3.3 against the day key's
 * 1.5), which put the fully driven lens at 2.5 there, far along AgX's path to white: it read salmon. Through the
 * production grade (the scene-referred saturation and contrast, AgX, the night's scotopic shift) a saturated red keeps
 * its colour to about half of scene white: here the lens reads a lit red, brighter than its unlit day floor, and still
 * red. A driven red lens is capped at this level through any exposure (setNightEmissionExposure); a dimmer drive (the
 * windows' obstruction bulbs) stays below it untouched, as does every undriven day radiance.
 */
export const NIGHT_RED_DISPLAY_LEVEL = .5;
/**
 * The camera the authored red lens floors (a lens's own day glow) were tuned at: the light model's day key and the
 * legacy rig's exposure. An unlit red lens (a wreck, a tank with its lights off) holds its on-screen level there when
 * the camera opens further (an overcast deck, the night), where it would otherwise glow salmon above its lit neighbours;
 * at the day key and under any brighter sky its authored radiance is exact.
 */
export const NIGHT_RED_FLOOR_EXPOSURE = 1.5;
/** The camera's exposure, shared by reference with every night-lens program (post.ts sets it each frame). */
const nightEmissionExposure = { value: 1 };
/** post.ts: the output pass's exposure, so a lit red lens keeps under its ceiling (NIGHT_RED_DISPLAY_LEVEL). */
export function setNightEmissionExposure(exposure: number): void {
  if (Number.isFinite(exposure) && exposure > 0) nightEmissionExposure.value = exposure;
}
const BASE_EMISSION = new WeakMap<THREE.MeshStandardMaterial, THREE.Color>();

/** Authoring may adjust a shared material after attaching a lens. Finalize
 * its day radiance once the whole model has been authored, before night use.
 */
export function refreshNightEmissionBase(material: THREE.MeshStandardMaterial): void {
  BASE_EMISSION.get(material)?.copy(material.emissive).multiplyScalar(material.emissiveIntensity);
}

export function setNightEmissionMask(
  geometry: THREE.BufferGeometry, value: 0 | 1 | 2, vertices?: readonly number[],
): void {
  const values = new Uint8Array(geometry.getAttribute('position').count);
  if (vertices) for (const vertex of vertices) values[vertex] = value;
  else values.fill(value);
  geometry.setAttribute(NIGHT_EMISSION_ATTRIBUTE, new THREE.BufferAttribute(values, 1));
}

/** The runtime drives white emissive/color intensity; the authored mask owns
 * warm lamp/red Shtora tint. Original day emission is unchanged even on an
 * existing emissive material. Call before warm compilation, once per material.
 */
export function installNightEmissionMask(
  material: THREE.MeshStandardMaterial,
  options: { readonly instanceActiveAttribute?: string } = {},
): void {
  const activity = options.instanceActiveAttribute ?? '';
  if (activity && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(activity)) throw new TypeError('Invalid night emission activity attribute');
  if (material.userData.nightEmissionMask === true) {
    if (material.userData.nightEmissionActivity !== activity) throw new Error('Night emission mask activity cannot change after installation');
    return;
  }
  material.userData.nightEmissionMask = true;
  material.userData.nightEmissionActivity = activity;
  const base = material.emissive.clone().multiplyScalar(material.emissiveIntensity);
  BASE_EMISSION.set(material, base);
  const headlight = new THREE.Color(NIGHT_HEADLIGHT_COLOR);
  const shtora = new THREE.Color(NIGHT_SHTORA_COLOR).multiplyScalar(RED_EMISSION_GAIN);
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, {
      nightEmissionBase: { value: base }, nightEmissionWarm: { value: headlight }, nightEmissionRed: { value: shtora },
      nightEmissionRedLevel: { value: NIGHT_RED_DISPLAY_LEVEL }, nightEmissionFloorExposure: { value: NIGHT_RED_FLOOR_EXPOSURE },
      nightEmissionExposure,
    });
    const activityDeclaration = activity ? `\nattribute float ${activity};` : '';
    const activityFactor = activity ? ` * ${activity}` : '';
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nattribute float nightEmissionMask;\nvarying float vNightEmissionMask, vNightEmissionActive;${activityDeclaration}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvNightEmissionMask = nightEmissionMask;\nvNightEmissionActive = 1.0${activityFactor};`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vNightEmissionMask, vNightEmissionActive;\nuniform vec3 nightEmissionBase, nightEmissionWarm, nightEmissionRed;\nuniform float nightEmissionRedLevel, nightEmissionFloorExposure, nightEmissionExposure;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
vec3 nightEmissionTint = mix(nightEmissionWarm, nightEmissionRed, step(1.5, vNightEmissionMask));
float nightEmissionOn = step(0.5, vNightEmissionMask) * clamp(vNightEmissionActive, 0.0, 1.0);
vec3 nightEmissionDriven = totalEmissiveRadiance - nightEmissionBase;
totalEmissiveRadiance = nightEmissionBase + nightEmissionDriven * nightEmissionTint * nightEmissionOn;
float nightEmissionRedLens = step(1.5, vNightEmissionMask) * nightEmissionOn;
float nightEmissionLit = step(1e-4, dot(nightEmissionDriven, nightEmissionDriven));
float nightEmissionRedPeak = max(max(totalEmissiveRadiance.r, totalEmissiveRadiance.g), max(totalEmissiveRadiance.b, 1e-6)) * nightEmissionExposure;
float nightEmissionRedScale = mix(min(1.0, nightEmissionFloorExposure / nightEmissionExposure), min(1.0, nightEmissionRedLevel / nightEmissionRedPeak), nightEmissionLit);
totalEmissiveRadiance *= mix(1.0, nightEmissionRedScale, nightEmissionRedLens);`);
  };
  material.customProgramCacheKey = function () { return previousKey.call(this) + '|night-emission-mask-v1:' + activity; };
  material.needsUpdate = true;
}
