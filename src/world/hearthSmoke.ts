// Hearth smoke — thin wisps drifting from inhabited chimneys.
//
// settlement pass 2 (2026-09-12, owner: "the maps feel much barer",
// "settlements … make it feel so much more immersive"). Every authored
// chimney the shared exterior pass detects becomes a candidate; a seeded
// share of them smokes. One instanced draw of tall camera-facing strips, a
// procedural wisp sheet scrolled by the world wind clock, no per-frame
// allocation, no scene light, and nothing collides or occludes.
import * as THREE from 'three';

export type HearthAnchor = readonly [number, number, number];

export interface HearthSmokeOptions {
  seed?: number;
  /** Share of detected chimneys that smoke (0..1). */
  share?: number;
  /** Wind bearing in degrees (direction the smoke leans toward). */
  windDeg?: number;
  cap?: number;
}

export interface HearthSmoke {
  readonly mesh: THREE.InstancedMesh;
  readonly count: number;
  setTime(seconds: number): void;
  /** Live battle frames advance the clock; shots set it absolutely. */
  advance(deltaSeconds: number): void;
  dispose(): void;
}

export const HEARTH_SMOKE_LIMITS = Object.freeze({
  cap: 96,
  share: 0.65,
  heightM: [6.5, 9.5] as const,
  widthM: [1.3, 1.8] as const,
});

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Procedural wisp sheet: three soft filaments that thin and scatter upward. */
export function makeHearthSmokeTexture(): THREE.DataTexture {
  const w = 32, h = 128, data = new Uint8Array(w * h * 4);
  const rng = mulberry32(0x4ea7);
  const filaments = [0.42, 0.5, 0.58].map((c) => ({ c, phase: rng() * 6.28, amp: 0.05 + rng() * 0.05, freq: 2.5 + rng() * 2 }));
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      let a = 0;
      for (const f of filaments) {
        const centre = f.c + Math.sin(v * f.freq * 3.14159 + f.phase) * f.amp * (0.4 + v);
        const width = 0.06 + v * 0.16;
        const d = Math.abs(u - centre) / width;
        a += Math.max(0, 1 - d * d) * (0.55 + 0.45 * (1 - v));
      }
      const fade = Math.pow(Math.min(1, v * 6), 0.7) * Math.pow(1 - v, 1.35);
      const alpha = Math.min(1, a) * fade;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * alpha);
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const VERT = /* glsl */`
attribute vec2 aSeed; // seed, phase
varying vec2 vUv;
varying float vSeed;
uniform float uTime;
uniform vec2 uWind;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv; vSeed = aSeed.x;
  vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float w = length(vec3(instanceMatrix[0].xyz));
  float h = length(vec3(instanceMatrix[1].xyz));
  vec3 toCam = cameraPosition - base.xyz; toCam.y = 0.0;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam + vec3(1e-4, 0.0, 0.0))));
  float rise = uv.y;
  // the plume leans down-wind and widens as it rises; gusts wobble it
  float lean = rise * rise * (0.9 + 0.35 * sin(uTime * 0.31 + aSeed.y));
  vec3 drift = vec3(uWind.x, 0.0, uWind.y) * lean * h * 0.55;
  float wobble = sin(uTime * 0.9 + aSeed.y * 4.0 + rise * 5.0) * rise * 0.18 * w;
  float widen = 1.0 + rise * 1.8;
  vec3 world = base.xyz + right * (position.x * w * widen + wobble) + vec3(0.0, position.y * h, 0.0) + drift;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 uv = vUv;
  uv.y = fract(uv.y - uTime * 0.11 + vSeed);
  float a = texture2D(uMap, uv).a;
  // the sheet scrolls, the plume envelope does not: fade the top and the foot in place
  a *= smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  a *= uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uTint, a);
  #include <fog_fragment>
}`;

export function createHearthSmoke(anchors: readonly HearthAnchor[], options: HearthSmokeOptions = {}): HearthSmoke {
  const cap = Math.max(1, Math.min(HEARTH_SMOKE_LIMITS.cap, options.cap ?? HEARTH_SMOKE_LIMITS.cap));
  const share = Math.min(1, Math.max(0, options.share ?? HEARTH_SMOKE_LIMITS.share));
  const rng = mulberry32((options.seed ?? 2003) | 0);
  const chosen: HearthAnchor[] = [];
  for (const anchor of anchors) {
    if (!anchor || anchor.length < 3 || !anchor.every(Number.isFinite)) continue;
    if (rng() < share) chosen.push(anchor);
  }
  const count = Math.min(cap, chosen.length);
  const texture = makeHearthSmokeTexture();
  const windRad = THREE.MathUtils.degToRad(options.windDeg ?? 35);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uMap: { value: null }, uTime: { value: 0 }, uOpacity: { value: 0.5 },
    uTint: { value: new THREE.Color(0xd8d5cf) },
    uWind: { value: new THREE.Vector2(Math.sin(windRad), Math.cos(windRad)) },
  }]);
  uniforms.uMap.value = texture;
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const seeds = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 2), 2);
  geometry.setAttribute('aSeed', seeds);
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.name = 'hearth-smoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const [x, y, z] = chosen[i];
    const h = HEARTH_SMOKE_LIMITS.heightM[0] + rng() * (HEARTH_SMOKE_LIMITS.heightM[1] - HEARTH_SMOKE_LIMITS.heightM[0]);
    const w = HEARTH_SMOKE_LIMITS.widthM[0] + rng() * (HEARTH_SMOKE_LIMITS.widthM[1] - HEARTH_SMOKE_LIMITS.widthM[0]);
    m.compose(p.set(x, y - 0.15, z), q.identity(), s.set(w, h, 1));
    mesh.setMatrixAt(i, m);
    seeds.setXY(i, rng(), rng() * 6.2831);
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  seeds.needsUpdate = true;
  mesh.visible = count > 0;
  return {
    mesh,
    count,
    setTime(seconds: number) { uniforms.uTime.value = seconds; },
    advance(deltaSeconds: number) { if (deltaSeconds > 0) uniforms.uTime.value += Math.min(0.1, deltaSeconds); },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose(); material.dispose(); texture.dispose();
    },
  };
}
