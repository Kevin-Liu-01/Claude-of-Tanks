// src/world/horizonCloudShade.ts — round 72 (2026-09-25): the volumetric layer's cloud shadows on the ranges.
//
// The layer (engine/volumetricClouds.ts) casts its shadows through the CSM with per-cascade gobo planes whose depth
// material discards by the weather field; the ring is unlit and stands beyond the cascades, so its ranges took no
// cloud shadow at all while the battlefield under the same sky did. The ring's fragment now reads the SAME weather
// fields the gobos read — the layer's own textures and shifts, bound here by reference each frame — projects the
// fragment along the sun to the cloud base and darkens where the field stands over the shadow threshold, softened
// a little (a hard discard at three kilometres would read as a stencil). Off whenever the layer is off, has no
// shadow regime or does not expose its gobo uniforms (the binding is defensive: the cloud lane owns that module).
import type * as THREE from 'three';

/** The weather and street tiles of the layer (engine/volumetricClouds.ts CLOUD_WEATHER_TILE_M / CLOUD_STREET_TILE_M, both 12 km). */
export const HORIZON_CLOUD_SHADE_TILE_M = 12000;

export const HORIZON_CLOUD_SHADE_UNIFORM_DECLARATIONS = /* glsl */`
uniform sampler2D uVCWeather; uniform sampler2D uVCStreets; uniform vec2 uVCWeatherShift; uniform vec2 uVCStreetShift;
uniform vec2 uVCWindDir; uniform float uVCStreetMix; uniform float uVCFieldMix; uniform float uVCThreshold;
uniform float uVCBase; uniform float uVCShade;
`;

/** After `sunVis` is known: the cloud's shadow on the sun term (1 = open sky). Reads P (world) and uSunDirW. */
export const HORIZON_CLOUD_SHADE_FRAGMENT = /* glsl */`
  float cloudLit = 1.0;
  if (uVCShade > 0.001) {
    // the fragment's shadow is cast by the cloud base straight up the sun's ray
    vec2 cxz = P.xz + uSunDirW.xz * ((uVCBase - P.y) / max(uSunDirW.y, 0.05));
    vec4 cw = texture2D(uVCWeather, (cxz + uVCWeatherShift) / ${HORIZON_CLOUD_SHADE_TILE_M.toFixed(1)});
    vec2 cq = vec2(dot(cxz, uVCWindDir), dot(cxz, vec2(-uVCWindDir.y, uVCWindDir.x)));
    vec4 cst = texture2D(uVCStreets, (cq + uVCStreetShift) / ${HORIZON_CLOUD_SHADE_TILE_M.toFixed(1)});
    float cfield = mix(mix(cw.r, cst.r, uVCStreetMix), cw.b, uVCFieldMix);
    cloudLit = 1.0 - uVCShade * smoothstep(uVCThreshold - 0.05, uVCThreshold + 0.05, cfield);
  }
`;

interface GoboUniforms {
  tWeather?: THREE.IUniform; tStreets?: THREE.IUniform; uWeatherShift?: THREE.IUniform; uStreetShift?: THREE.IUniform;
  uWindDir?: THREE.IUniform; uStreets?: THREE.IUniform; uFieldMix?: THREE.IUniform; uThreshold?: THREE.IUniform;
}

/** What the binder reads of the layer: its activity, its preset's shadow policy and base, and its gobo uniforms. */
export interface HorizonCloudShadeSource {
  active: boolean;
  shadowsActive?: boolean;
  currentPreset: { shadow: boolean; baseM: number; coverage: number } | null;
  goboMaterial?: { uniforms: GoboUniforms };
}

/** The ring's own uniform objects for the cloud shade (created with the vista uniforms). */
export function createHorizonCloudShadeUniforms(): Record<string, THREE.IUniform> {
  return {
    uVCWeather: { value: null }, uVCStreets: { value: null },
    uVCWeatherShift: { value: { x: 0, y: 0 } }, uVCStreetShift: { value: { x: 0, y: 0 } }, uVCWindDir: { value: { x: 1, y: 0 } },
    uVCStreetMix: { value: 0 }, uVCFieldMix: { value: 0 }, uVCThreshold: { value: 0.5 }, uVCBase: { value: 1400 }, uVCShade: { value: 0 },
  };
}

/** The shade strength on the ring's sun term where the field says cloud: the gobos are opaque, the ranges keep a little skylight. */
export const HORIZON_CLOUD_SHADE_STRENGTH = 0.62;

/**
 * Per frame (the ring's onBeforeRender): point the ring's uniforms at the layer's live values. Textures and vectors
 * are bound by reference, so a bound ring follows the wind with no per-frame copies beyond four numbers; returns
 * whether the shade is on.
 */
export function bindHorizonCloudShade(uniforms: Record<string, THREE.IUniform>, layer: HorizonCloudShadeSource | null | undefined): boolean {
  const gobo = layer?.goboMaterial?.uniforms;
  const preset = layer?.currentPreset;
  const on = !!layer && layer.active && !!preset?.shadow && (layer.shadowsActive ?? true) && !!gobo?.tWeather?.value && !!gobo?.tStreets?.value;
  if (!on) {
    if (uniforms.uVCShade.value !== 0) uniforms.uVCShade.value = 0;
    return false;
  }
  const g = gobo as Required<GoboUniforms>;
  uniforms.uVCWeather.value = g.tWeather.value;
  uniforms.uVCStreets.value = g.tStreets.value;
  uniforms.uVCWeatherShift.value = g.uWeatherShift?.value ?? uniforms.uVCWeatherShift.value;
  uniforms.uVCStreetShift.value = g.uStreetShift?.value ?? uniforms.uVCStreetShift.value;
  uniforms.uVCWindDir.value = g.uWindDir?.value ?? uniforms.uVCWindDir.value;
  uniforms.uVCStreetMix.value = g.uStreets?.value ?? 0;
  uniforms.uVCFieldMix.value = g.uFieldMix?.value ?? 0;
  uniforms.uVCThreshold.value = g.uThreshold?.value ?? 0.5;
  uniforms.uVCBase.value = preset!.baseM;
  uniforms.uVCShade.value = HORIZON_CLOUD_SHADE_STRENGTH;
  return true;
}
