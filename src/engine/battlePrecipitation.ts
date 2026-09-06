import * as THREE from 'three';
import { BATTLE_WEATHER_VERSION, type BattleWeather } from './battleWeatherPolicy.ts';

export const MAX_BATTLE_PRECIPITATION_PARTICLES = 768;

export interface BattlePrecipitation {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  /** Reuse the fixed pool for a match; caller supplies an independently admitted local budget. */
  reset(weather: BattleWeather, particleBudget?: number): void;
  setBudget(particleBudget: number): void;
  /** Absolute simulation/presentation time in seconds, including pause/shot freezing. */
  update(seconds: number, cameraX: number, cameraY: number, cameraZ: number): void;
  /** Sticky until reset: Garage/studio transitions cannot accidentally wake it. */
  hide(): void;
  dispose(): void;
}

const VERTEX = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uCamera;
uniform vec3 uSeedOffset;
uniform float uTime;
uniform float uSnow;
varying vec2 vUv;
varying float vFade;
void main() {
  vec3 extent = vec3(60.0, 40.0, 60.0);
  float speed = mix(18.0 + aSeed.w * 8.0, 1.5 + aSeed.w * 1.5, uSnow);
  vec3 velocity = vec3(mix(2.0, 0.45, uSnow), -speed, 0.30);
  vec3 motion = velocity * uTime;
  motion.x += sin(uTime * 0.8 + aSeed.w * 31.0) * uSnow * 0.8;
  motion.z += cos(uTime * 0.6 + aSeed.w * 23.0) * uSnow * 0.6;
  // Camera-local modulo of WORLD positions, not a cloud glued to the view.
  // Fade at every wrapping face; no CPU respawn loop or buffer upload.
  vec3 local = mod(aSeed.xyz * extent + uSeedOffset + motion - uCamera + extent * 0.5, extent) - extent * 0.5;
  vec3 edge = extent * 0.5 - abs(local);
  float edgeFade = smoothstep(0.0, 4.0, min(edge.x, min(edge.y, edge.z)));
  vFade = edgeFade * smoothstep(1.5, 3.5, length(local));
  vec4 center = viewMatrix * vec4(uCamera + local, 1.0);
  vec2 fall = (viewMatrix * vec4(velocity, 0.0)).xy;
  float fallLength = length(fall);
  fall = fallLength > 0.001 ? fall / fallLength : vec2(0.0, -1.0);
  vec2 right = vec2(-fall.y, fall.x);
  float width = mix(0.012 + aSeed.w * 0.009, 0.065 + aSeed.w * 0.065, uSnow);
  float height = mix(0.50 + aSeed.w * 0.40, width, uSnow);
  center.xy += right * position.x * width - fall * position.y * height;
  vUv = uv;
  gl_Position = projectionMatrix * center;
}
`;

const FRAGMENT = /* glsl */`
uniform float uSnow;
uniform float uOpacity;
varying vec2 vUv;
varying float vFade;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float snow = 1.0 - smoothstep(0.45, 1.0, dot(p, p));
  float rain = (1.0 - smoothstep(0.25, 1.0, abs(p.x))) * (1.0 - p.y * p.y);
  float alpha = mix(rain, snow, uSnow) * vFade * uOpacity;
  if (alpha < 0.008) discard;
  // Below-bloom linear color; the existing scene post owns output grading.
  vec3 color = mix(vec3(0.38, 0.44, 0.47), vec3(0.72, 0.75, 0.78), uSnow);
  gl_FragColor = vec4(color, alpha);
}
`;

function seedUnit(value: number): number {
  let word = value >>> 0;
  word = Math.imul(word ^ (word >>> 16), 0x7feb352d);
  word = Math.imul(word ^ (word >>> 15), 0x846ca68b);
  return ((word ^ (word >>> 16)) >>> 0) / 4294967296;
}

function createGeometry(capacity: number): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(capacity * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = seedUnit(i ^ 0x6d2b79f5);
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = 0;
  return geometry;
}

function requireWeather(weather: BattleWeather): void {
  if (weather.version !== BATTLE_WEATHER_VERSION || !Number.isSafeInteger(weather.seed)) {
    throw new RangeError('Unsupported precipitation weather descriptor');
  }
  if (!Number.isFinite(weather.precipitationIntensity)
    || weather.precipitationIntensity < 0 || weather.precipitationIntensity > 1) {
    throw new RangeError('Precipitation intensity must be in 0..1');
  }
  if (weather.timeOfDay !== 'day' && weather.timeOfDay !== 'night') {
    throw new RangeError('Unsupported precipitation time of day');
  }
}

/** One reusable instanced draw, two triangles per admitted particle, zero
 * textures/samplers/shadows. Construction is battle-intent-only; caller mounts
 * and warms the mesh through the existing scene path. Depth testing hides it
 * behind opaque surfaces; no roof occupancy, collision or soft-depth pass is
 * claimed. No observer, renderer, quality governor or clock is owned here.
 */
export function createBattlePrecipitation(capacity = MAX_BATTLE_PRECIPITATION_PARTICLES): BattlePrecipitation {
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > MAX_BATTLE_PRECIPITATION_PARTICLES) {
    throw new RangeError('Precipitation capacity must be an integer in 0..768');
  }
  const geometry = createGeometry(capacity);
  const uniforms = {
    uTime: { value: 0 }, uCamera: { value: new THREE.Vector3() },
    uSeedOffset: { value: new THREE.Vector3() }, uSnow: { value: 0 }, uOpacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms,
    transparent: true, depthTest: true, depthWrite: false,
    blending: THREE.NormalBlending, side: THREE.FrontSide,
  });
  material.name = 'battle-precipitation';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'battle-precipitation';
  mesh.frustumCulled = false; // Vertex shader owns the camera-local volume.
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.userData.aoExclude = true;
  let disposed = false;
  let enabled = false;
  let intensity = 0;
  let budget = capacity;

  function applyCount(): void {
    geometry.instanceCount = enabled ? Math.ceil(budget * intensity) : 0;
    mesh.visible = geometry.instanceCount > 0;
  }
  function setBudget(next: number): void {
    if (disposed) return;
    if (!Number.isInteger(next) || next < 0) throw new RangeError('Precipitation budget must be a nonnegative integer');
    budget = Math.min(capacity, next);
    applyCount();
  }
  function reset(weather: BattleWeather, particleBudget = capacity): void {
    if (disposed) throw new Error('Precipitation is disposed');
    requireWeather(weather);
    // Validate before changing live state; invalid reset cannot partially show it.
    if (!Number.isInteger(particleBudget) || particleBudget < 0) throw new RangeError('Precipitation budget must be a nonnegative integer');
    const seed = weather.seed >>> 0;
    uniforms.uSeedOffset.value.set(seedUnit(seed ^ 0x137) * 60,
      seedUnit(seed ^ 0x991) * 40, seedUnit(seed ^ 0x337) * 60);
    uniforms.uSnow.value = weather.condition === 'snow' ? 1 : 0;
    uniforms.uTime.value = 0;
    uniforms.uCamera.value.set(0, 0, 0);
    uniforms.uOpacity.value = weather.timeOfDay === 'night' ? 0.18 : 0.32;
    enabled = weather.condition === 'rain' || weather.condition === 'snow';
    intensity = enabled ? weather.precipitationIntensity : 0;
    setBudget(particleBudget);
  }
  function update(seconds: number, x: number, y: number, z: number): void {
    if (disposed || !enabled || budget === 0) return;
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    uniforms.uTime.value = seconds;
    uniforms.uCamera.value.set(x, y, z);
  }
  function hide(): void {
    enabled = false;
    applyCount();
  }
  function dispose(): void {
    if (disposed) return;
    hide();
    disposed = true;
    mesh.removeFromParent();
    geometry.dispose();
    material.dispose();
  }
  return { mesh, reset, setBudget, update, hide, dispose };
}
