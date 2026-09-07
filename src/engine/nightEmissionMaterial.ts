// Per-vertex lamp emission on existing merged/instanced geometry. Never make
// shared poles, armor or periscopes glow just because they share a material.
import * as THREE from 'three';

export const NIGHT_EMISSION_ATTRIBUTE = 'nightEmissionMask';
export const NIGHT_HEADLIGHT_COLOR = 0xffe2ad;
export const NIGHT_SHTORA_COLOR = 0xff3020;

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
  const headlight = new THREE.Color(NIGHT_HEADLIGHT_COLOR), shtora = new THREE.Color(NIGHT_SHTORA_COLOR);
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, {
      nightEmissionBase: { value: base }, nightEmissionWarm: { value: headlight }, nightEmissionRed: { value: shtora },
    });
    const activityDeclaration = activity ? `\nattribute float ${activity};` : '';
    const activityFactor = activity ? ` * ${activity}` : '';
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nattribute float nightEmissionMask;\nvarying float vNightEmissionMask, vNightEmissionActive;${activityDeclaration}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvNightEmissionMask = nightEmissionMask;\nvNightEmissionActive = 1.0${activityFactor};`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vNightEmissionMask, vNightEmissionActive;\nuniform vec3 nightEmissionBase, nightEmissionWarm, nightEmissionRed;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
vec3 nightEmissionTint = mix(nightEmissionWarm, nightEmissionRed, step(1.5, vNightEmissionMask));
totalEmissiveRadiance = nightEmissionBase + (totalEmissiveRadiance - nightEmissionBase) * nightEmissionTint * step(0.5, vNightEmissionMask) * clamp(vNightEmissionActive, 0.0, 1.0);`);
  };
  material.customProgramCacheKey = function () { return previousKey.call(this) + '|night-emission-mask-v1:' + activity; };
  material.needsUpdate = true;
}
