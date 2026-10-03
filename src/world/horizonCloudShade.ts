// src/world/horizonCloudShade.ts — round 72 (2026-09-25): the volumetric layer's cloud shadows on the ranges.
//
// The ring's vista is unlit and stands beyond the cascades, so it takes the clouds' shadows by its own lookup. Round 72
// read the layer's two weather fields here (the gobos' field, re-cut per fragment); since 2026-10-03 every lit material
// reads one undithered shade map the layer renders at the cloud base around the camera (engine/cloudShadeMap.ts), and
// the vista samples that same map: one path, so the ranges' cloud shadows are the battlefield's (the cumulus fields,
// the front's clear radius and the cut included) and the vista spends one sampler where it spent two. The fragment
// projects the ring point up the sun's ray to the cloud base and takes the map's share of the sun there, faded at the
// square's edge and under a grazing sun; off whenever the layer publishes no map (no shadow regime, the layer off).
import type * as THREE from 'three';

export const HORIZON_CLOUD_SHADE_UNIFORM_DECLARATIONS = /* glsl */`
uniform sampler2D uVCMap; uniform vec4 uVCRect; uniform float uVCBase; uniform float uVCShade;
`;

/** After `sunVis` is known: the cloud's shadow on the sun term (1 = open sky). Reads P (world) and uSunDirW. */
export const HORIZON_CLOUD_SHADE_FRAGMENT = /* glsl */`
  float cloudLit = 1.0;
  if (uVCShade > 0.001 && uSunDirW.y > 0.03) {
    // the fragment's shadow is cast by the cloud base straight up the sun's ray (engine/cloudShadeMap.ts cotCloudSun)
    vec2 cxz = P.xz + uSunDirW.xz * ((uVCBase - P.y) / uSunDirW.y);
    vec2 cuv = (cxz - uVCRect.xy) * uVCRect.z + 0.5;
    float cedge = max(abs(cuv.x - 0.5), abs(cuv.y - 0.5)) * 2.0;
    if (cedge < 1.0) cloudLit = 1.0 - uVCShade * texture2D(uVCMap, cuv).r * (1.0 - smoothstep(0.84, 1.0, cedge))
      * smoothstep(0.03, 0.08, uSunDirW.y);
  }
`;

/** The shared cloud-shade uniforms the layer publishes (engine/cloudShadeMap.ts CloudShadeUniforms). */
interface SharedCloudShade {
  tCotCloudShade: THREE.IUniform;
  uCotCloudShade: THREE.IUniform<{ w: number }>;
  uCotCloudSun: THREE.IUniform<{ w: number }>;
}

/** What the binder reads of the layer: its activity and the shade map it publishes (null where it publishes none). */
export interface HorizonCloudShadeSource {
  active: boolean;
  cloudShade?: SharedCloudShade | null;
}

/** The ring's own uniform objects for the cloud shade (created with the vista uniforms). */
export function createHorizonCloudShadeUniforms(): Record<string, THREE.IUniform> {
  return {
    uVCMap: { value: null }, uVCRect: { value: { x: 0, y: 0, z: 1 / 12000, w: 0 } }, uVCBase: { value: 1400 }, uVCShade: { value: 0 },
  };
}

/**
 * Per frame (the ring's onBeforeRender): point the ring's uniforms at the layer's shade map. The map and its square
 * are bound by reference (the layer refreshes them in place), the base copied; returns whether the shade is on.
 */
export function bindHorizonCloudShade(uniforms: Record<string, THREE.IUniform>, layer: HorizonCloudShadeSource | null | undefined): boolean {
  const shade = layer?.active ? layer.cloudShade : null;
  const on = !!shade && shade.uCotCloudShade.value.w > 0.5 && !!shade.tCotCloudShade.value;
  if (!on) {
    if (uniforms.uVCShade.value !== 0) uniforms.uVCShade.value = 0;
    return false;
  }
  uniforms.uVCMap.value = shade!.tCotCloudShade.value;
  uniforms.uVCRect.value = shade!.uCotCloudShade.value;
  uniforms.uVCBase.value = shade!.uCotCloudSun.value.w;
  uniforms.uVCShade.value = 1;
  return true;
}
