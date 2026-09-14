import * as THREE from 'three';
import type { HeightField } from './terrain.ts';
import { waterContactProfile } from './waterContact.ts';

const GRID_STEP_M = 8;
const MIN_COVERAGE = 0.002;

export interface ShallowWaterGeometry {
  geometry: THREE.BufferGeometry;
  heightAt(x: number, z: number): number;
}

function surfaceCell(value: number, half: number, step: number, segments: number): number {
  let cell = Math.min(segments - 1, Math.max(0, Math.floor((value + half) / step)));
  // Match the packed Float32 X/Z boundaries, including non-integral grid steps.
  if (cell > 0 && value < Math.fround(cell * step - half)) cell--;
  else if (cell < segments - 1 && value >= Math.fround((cell + 1) * step - half)) cell++;
  return cell;
}

function waterHeightSampler(
  heights: Float32Array,
  admitted: Uint8Array,
  field: Pick<HeightField, 'size' | 'getHeightAt'>,
  segments: number,
): (x: number, z: number) => number {
  const count = segments + 1, step = field.size / segments, half = field.size / 2;
  const boundary = Math.fround(half);
  return (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)
      || x < -boundary || x > boundary || z < -boundary || z > boundary) return field.getHeightAt(x, z);
    const cx = surfaceCell(x, half, step, segments), cz = surfaceCell(z, half, step, segments);
    const cell = cz * segments + cx;
    if (!(admitted[cell >> 3] & (1 << (cell & 7)))) return field.getHeightAt(x, z);
    const x0 = Math.fround(cx * step - half), x1 = Math.fround((cx + 1) * step - half);
    const z0 = Math.fround(cz * step - half), z1 = Math.fround((cz + 1) * step - half);
    const u = (x - x0) / (x1 - x0), v = (z - z0) / (z1 - z0);
    const key = cz * count + cx;
    const a = heights[key], b = heights[key + 1], c = heights[key + count], d = heights[key + count + 1];
    return u + v <= 1 ? a * (1 - u - v) + b * u + c * v
      : b * (1 - v) + c * (1 - u) + d * (u + v - 1);
  };
}

/** One bounded, static surface, not a fluid solver or another scene/reflection pass. */
export function* shallowWaterGeometrySteps(
  field: Pick<HeightField, 'size' | 'getHeightAt' | 'getWaterMaskAt' | 'getWaterDepthAt'>,
): Generator<void, ShallowWaterGeometry | null, void> {
  const segments = Math.ceil(field.size / GRID_STEP_M);
  const count = segments + 1, step = field.size / segments, half = field.size / 2;
  const wet = new Float32Array(count * count);
  for (let z = 0; z < count; z++) {
    for (let x = 0; x < count; x++) wet[z * count + x] = field.getWaterMaskAt(x * step - half, z * step - half);
    yield;
  }
  const slots = new Int32Array(count * count).fill(-1);
  const admitted = new Uint8Array(Math.ceil(segments * segments / 8));
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  function vertex(x: number, z: number): number {
    const key = z * count + x;
    if (slots[key] >= 0) return slots[key];
    const wx = x * step - half, wz = z * step - half;
    const index = positions.length / 3;
    slots[key] = index;
    positions.push(wx, field.getHeightAt(wx, wz) + (field.getWaterDepthAt?.(wx, wz) ?? 0), wz);
    normals.push(0, 1, 0);
    return index;
  }
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const key = z * count + x;
      const corners = Math.max(wet[key], wet[key + 1], wet[key + count], wet[key + count + 1]);
      if (corners <= MIN_COVERAGE
        && field.getWaterMaskAt((x + 0.5) * step - half, (z + 0.5) * step - half) <= MIN_COVERAGE) continue;
      const a = vertex(x, z), b = vertex(x + 1, z), c = vertex(x, z + 1), d = vertex(x + 1, z + 1);
      indices.push(a, c, b, b, c, d);
      const cell = z * segments + x;
      admitted[cell >> 3] |= 1 << (cell & 7);
    }
    yield;
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const packedPositions = geometry.getAttribute('position');
  for (let key = 0; key < slots.length; key++) wet[key] = slots[key] < 0 ? NaN : packedPositions.getY(slots[key]);
  // Reuse the wet grid as exact packed heights; admission cannot be inferred
  // from four populated corners around an omitted cell. At 1024 m these two
  // retained buffers total 66,564 + 2,048 = 68,612 bytes. The separate factory
  // captures neither temporary slots/arrays nor the rendered geometry owner.
  return { geometry, heightAt: waterHeightSampler(wet, admitted, field, segments) };
}

/** Water pass 6 (2026-09-14): a vehicle in the water — rings and churn spread from it. */
export interface WaterDisturbance { readonly x: number; readonly z: number; readonly strength: number; }
export const WATER_DISTURBANCE_CAP = 8;

export interface ShallowWaterSurface {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  update(deltaSeconds: number): void;
  setTime(timeSeconds: number): void;
  /** Publish the vehicles in the water this frame (at most WATER_DISTURBANCE_CAP; strength 0..1). */
  setDisturbances(sources: readonly WaterDisturbance[]): void;
}

type ShallowWaterShader = Parameters<NonNullable<THREE.MeshStandardMaterial['onBeforeCompile']>>[0];
/**
 * Water pass 3 (2026-09-12): the engine hook that folds the surface into the
 * cascaded-shadow setup. Until now the water material set `onBeforeCompile`
 * on its own and never joined it, so all four cascade directional lights
 * struck the sheet at once — four suns on every bay, which every earlier
 * water tuning (roughness floors, opacity, sky reflection) was fighting.
 */
export type ShallowWaterMaterialSetup =
  (material: THREE.MeshStandardMaterial, hook: (shader: ShallowWaterShader) => void) => void;

export function createShallowWaterSurface(
  geometry: THREE.BufferGeometry,
  mask: THREE.Texture,
  waveNormal: THREE.Texture,
  size: number,
  mapId: string,
  ramp: readonly [number, number],
  setup: ShallowWaterMaterialSetup | null = null,
): ShallowWaterSurface {
  const profile = waterContactProfile(mapId);
  const clock = { value: 0 };
  // Water pass 6: vehicle wakes. Each slot is (x, z, strength, phase) in the tank frame of the map.
  const ripples = Array.from({ length: WATER_DISTURBANCE_CAP }, () => new THREE.Vector4(0, 0, 0, 0));
  const rippleCount = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    color: profile.color, roughness: profile.roughness, metalness: 0,
    // Water 2026-09-12: 0.28 -> 0.55 — the surface mirrors more sky at grazing
    // angles (the 1049e4e bay carried visible sky and sun glints).
    // Water pass 3 (2026-09-12): 0.55 -> 0.9 now that the sheet is lit once
    // (cascade setup) instead of by four suns.
    envMapIntensity: 0.9,
    transparent: true, opacity: profile.opacity, depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.forceSinglePass = true;
  material.name = `water:${profile.kind}`;
  const hook = (shader: ShallowWaterShader): void => {
    Object.assign(shader.uniforms, {
      uWaterMask: { value: mask }, uWaterWave: { value: waveNormal },
      uWaterSize: { value: size }, uWaterTime: clock,
      uWaterRamp: { value: new THREE.Vector2(...ramp) },
      uWaterFlow: { value: new THREE.Vector2(profile.flowX, profile.flowZ) },
      uWaterShore: { value: new THREE.Color(profile.shoreColor) },
      uWaterShallow: { value: new THREE.Color(profile.shallowColor) },
      uWaterFoam: { value: profile.foam },
      uWaterWaveScale: { value: profile.waveScale },
      uWaterWaveStrength: { value: profile.waveStrength },
      // QA only: 1 paints the turbidity field as greyscale so a headless shot can prove the plumbing
      uWaterDebug: { value: 0 },
      uWaterRipples: { value: ripples },
      uWaterRippleCount: rippleCount,
    });
    material.userData.waterShader = shader;
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vWaterWorld;');
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWaterWorld;
      uniform sampler2D uWaterMask;
      uniform sampler2D uWaterWave;
      uniform float uWaterSize;
      uniform float uWaterTime;
      uniform vec2 uWaterRamp;
      uniform vec2 uWaterFlow;
      uniform vec3 uWaterShore;
      uniform vec3 uWaterShallow;
      uniform float uWaterFoam;
      uniform float uWaterWaveScale;
      uniform float uWaterWaveStrength;
      uniform float uWaterDebug;
      uniform vec4 uWaterRipples[8];
      uniform int uWaterRippleCount;
      float waterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float waterValueNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(waterHash(i), waterHash(i + vec2(1.0, 0.0)), u.x), mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      /** Water pass 5: sediment / weed-bed field, 0..1, ~45 m and ~17 m octaves. */
      float waterTurbidityField(vec2 world) {
        float n = waterValueNoise(world / 45.0) * 0.65 + waterValueNoise(world / 17.0 + vec2(3.7, 9.1)) * 0.35;
        return smoothstep(0.25, 0.85, n);
      }
      float waterDeep;
      float waterBank;
      float waterGrazing;
      float waterTurbidity;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 waterUV = (vWaterWorld.xz + uWaterSize * 0.5) / uWaterSize;
      float wet = smoothstep(uWaterRamp.x, uWaterRamp.y, texture2D(uWaterMask, waterUV).b);
      if (wet < 0.015) discard;
      vec3 eye = normalize(cameraPosition - vWaterWorld);
      float grazing = pow(1.0 - abs(eye.y), 3.0);
      waterGrazing = grazing;
      waterDeep = smoothstep(0.18, 0.86, wet);
      waterBank = smoothstep(0.015, 0.20, wet) * (1.0 - smoothstep(0.32, 0.74, wet));
      // Water 2026-09-12: the bed shows through the shallows — the deep colour
      // rises out of a sunlit bank tint instead of one flat sheet.
      // Water pass 5 (2026-09-13): the bank colour reaches further into the body
      // (0.05..0.75 -> 0.02..0.90) so a lake is not one saturated sheet 20 m out.
      diffuseColor.rgb = mix(uWaterShallow, diffuseColor.rgb, smoothstep(0.02, 0.90, waterDeep));
      // Water pass 4 (2026-09-13, owner: "significantly better, more varied,
      // more like real life"): the deep body darkens harder and the surface
      // leans on what the SKY does — mirror-like at grazing angles, bed and
      // body colour when looked into — instead of one saturated sheet.
      diffuseColor.rgb *= mix(0.90, 0.58, waterDeep);
      diffuseColor.rgb *= 1.0 - 0.35 * grazing;
      diffuseColor.a = smoothstep(0.0, 0.55, wet) * mix(opacity, 0.86, grazing);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      vec2 waveUV = vWaterWorld.xz * uWaterWaveScale;
      vec2 drift = uWaterFlow * uWaterTime;
      vec4 waveNear = texture2D(uWaterWave, waveUV + drift);
      vec4 waveBroad = texture2D(uWaterWave, waveUV * 0.61 - drift * 0.7);
      vec2 wave = waveNear.xy * 2.0 - 1.0;
      // water pass 3 (2026-09-12): the broad swell carries more of the relief so
      // the open sea keeps the 1049e4e bay's long wave bands, not just fine chop
      wave += (waveBroad.xy * 2.0 - 1.0) * 0.9;
      // Water pass 4: a fine, faster ripple layer breaks the two-scale pattern
      // into sun sparkle instead of a printed texture.
      vec4 waveFine = texture2D(uWaterWave, waveUV * 2.7 + drift * 1.9 + vec2(0.37, 0.11));
      wave += (waveFine.xy * 2.0 - 1.0) * 0.35;
      // Water pass 6 (2026-09-14, owner: "more interactive"): every vehicle in the
      // water pushes concentric rings outward and churns the surface white around
      // its hull; the rings ride on the normal so the sun and sky read them.
      float wakeFoam = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= uWaterRippleCount) break;
        vec4 rp = uWaterRipples[i];
        vec2 dv = vWaterWorld.xz - rp.xy;
        float d = length(dv) + 1e-3;
        float env = exp(-d * 0.22) * rp.z;
        float ring = sin(d * 4.2 - uWaterTime * 6.5 + rp.w) * env;
        wave += (dv / d) * ring * 3.0;
        wakeFoam += smoothstep(0.2, 1.0, rp.z) * exp(-d * 0.42) * (0.55 + 0.45 * sin(d * 7.0 - uWaterTime * 10.0 + rp.w));
      }
      normal = normalize((viewMatrix * vec4(normalize(vec3(wave.x * uWaterWaveStrength, 1.0, wave.y * uWaterWaveStrength)), 0.0)).xyz);
      normal *= faceDirection;
      // Surface colour breakup reuses the same two wave fetches: moving
      // two-scale value variation, a shore tint band and sparse crests.
      // diffuseColor is consumed by the lighting pass after this point.
      float broadWave = waveBroad.x;
      float fineWave = waveNear.y;
      diffuseColor.rgb *= 0.96 + (broadWave - 0.5) * 0.22 + (fineWave - 0.5) * 0.06;
      // Water pass 5 (2026-09-13, owner: "more varied colours, more like real
      // life"): a very large-scale drift of the same wave texture stands in for
      // suspended sediment and weed beds — the body brightens and dulls in
      // 40-60 m patches (0.42 x the wave scale) and leans toward the bank colour
      // where it is thick.
      // (a normal-map fetch read as one flat sheet at this scale — a normal map
      // hugs 0.5 — so the field is two octaves of value noise on world position)
      float turbidity = waterTurbidityField(vWaterWorld.xz + drift * 6.0);
      waterTurbidity = turbidity;
      diffuseColor.rgb *= 0.80 + turbidity * 0.40;
      diffuseColor.rgb = mix(diffuseColor.rgb, uWaterShallow * 0.80, smoothstep(0.45, 0.90, turbidity) * 0.38 * waterDeep);
      diffuseColor.rgb = mix(diffuseColor.rgb, uWaterShore, waterBank * (0.24 + broadWave * 0.12));
      diffuseColor.rgb += vec3(0.018, 0.026, 0.028)
        * smoothstep(0.66, 0.90, broadWave) * (0.35 + fineWave * 0.65) * waterDeep;
      // Water 2026-09-12: shoreline foam — broken wave crests pile up on the
      // bank band and a few sparse crests whiten open water on the sea maps.
      float foamBank = smoothstep(0.52, 0.86, broadWave * 0.7 + fineWave * 0.5) * waterBank;
      float foamCrest = smoothstep(0.80, 0.96, broadWave) * smoothstep(0.55, 0.9, fineWave) * waterDeep * 0.6;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.85, 0.84), (foamBank * 0.55 + foamCrest * 0.45) * uWaterFoam);
      // Water pass 6: churned water around a vehicle whitens regardless of the map's foam profile.
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.90, 0.90), clamp(wakeFoam, 0.0, 0.85) * 0.85);
    `);
    // The game's strong sun/bloom exposure turns a broad default dielectric
    // highlight into a white sheet. Keep the directional glint, at a bounded
    // energy, without changing world lighting or adding a reflection pass.
    // Water pass 3 (2026-09-12): the old 0.16 / 0.35 / 0.18 clamps were
    // fighting four cascade suns; lit once, the sheet needs most of its
    // dielectric glint back or the waves read as one flat sheet.
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>',
      '#include <lights_physical_fragment>\nmaterial.specularColor *= 0.85;\nmaterial.specularF90 = 0.9;');
    // Water pass 4: the sky reflection follows the water's own fresnel — a mirror
    // toward the horizon, a window into the shallows underfoot — and the sun
    // glitter keeps most of its energy (the old 0.55 clamp deleted the glints;
    // bloom now carries them as sparkle, not a white sheet).
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>',
      // Water pass 5: wind-ruffled, sediment-laden patches mirror less sky, so the
      // sheet reads as water of varying depth and colour instead of one reflection.
      '#include <lights_fragment_maps>\nradiance *= mix(0.45, 1.75, waterGrazing);\nradiance *= 1.15 - 0.55 * smoothstep(0.35, 0.85, waterTurbidity);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight -= max(vec3(0.0), totalSpecular - vec3(1.15));\nif (uWaterDebug > 0.5) { outgoingLight = vec3(waterTurbidity); diffuseColor.a = 1.0; }\n#include <opaque_fragment>');
  };
  if (setup) setup(material, hook);
  else material.onBeforeCompile = hook;
  material.customProgramCacheKey = () => 'shallow-water-v9';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `shallow_water_${mapId}`;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  // Surface first, then its foam/track rings and transparent combat particles.
  mesh.renderOrder = 2;
  return {
    mesh,
    update(dt) { if (Number.isFinite(dt) && dt > 0) clock.value += Math.min(dt, 0.1); },
    setTime(t) { if (Number.isFinite(t)) clock.value = Math.max(0, t); },
    setDisturbances(sources) {
      const n = Math.min(WATER_DISTURBANCE_CAP, sources.length);
      for (let i = 0; i < n; i++) {
        const s = sources[i];
        ripples[i].set(s.x, s.z, Math.min(1, Math.max(0, s.strength)), i * 1.7);
      }
      rippleCount.value = n;
    },
  };
}
