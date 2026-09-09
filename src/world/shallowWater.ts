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

export interface ShallowWaterSurface {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  update(deltaSeconds: number): void;
  setTime(timeSeconds: number): void;
}

export function createShallowWaterSurface(
  geometry: THREE.BufferGeometry,
  mask: THREE.Texture,
  waveNormal: THREE.Texture,
  size: number,
  mapId: string,
  ramp: readonly [number, number],
): ShallowWaterSurface {
  const profile = waterContactProfile(mapId);
  const clock = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    color: profile.color, roughness: profile.roughness, metalness: 0,
    envMapIntensity: 0.25,
    transparent: true, opacity: profile.opacity, depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.forceSinglePass = true;
  material.name = `water:${profile.kind}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      uWaterMask: { value: mask }, uWaterWave: { value: waveNormal },
      uWaterSize: { value: size }, uWaterTime: clock,
      uWaterRamp: { value: new THREE.Vector2(...ramp) },
      uWaterFlow: { value: new THREE.Vector2(profile.flowX, profile.flowZ) },
    });
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
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 waterUV = (vWaterWorld.xz + uWaterSize * 0.5) / uWaterSize;
      float wet = smoothstep(uWaterRamp.x, uWaterRamp.y, texture2D(uWaterMask, waterUV).b);
      if (wet < 0.015) discard;
      vec3 eye = normalize(cameraPosition - vWaterWorld);
      float grazing = pow(1.0 - abs(eye.y), 3.0);
      diffuseColor.a = wet * mix(opacity, 0.78, grazing);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      vec2 waveUV = vWaterWorld.xz * 0.07;
      vec2 drift = uWaterFlow * uWaterTime;
      vec2 wave = texture2D(uWaterWave, waveUV + drift).xy * 2.0 - 1.0;
      wave += (texture2D(uWaterWave, waveUV * 0.61 - drift * 0.7).xy * 2.0 - 1.0) * 0.55;
      normal = normalize((viewMatrix * vec4(normalize(vec3(wave.x * 0.85, 1.0, wave.y * 0.85)), 0.0)).xyz);
      normal *= faceDirection;
    `);
    // The game's strong sun/bloom exposure turns a broad default dielectric
    // highlight into a white sheet. Keep the directional glint, at a bounded
    // energy, without changing world lighting or adding a reflection pass.
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>',
      '#include <lights_physical_fragment>\nmaterial.specularColor *= 0.10;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight -= max(vec3(0.0), totalSpecular - vec3(0.16));\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'shallow-water-v3';
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
  };
}
