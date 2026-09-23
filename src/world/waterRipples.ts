import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { getDeviceTier } from '../engine/quality.ts';
import type { WaterDisturbance } from './shallowWater.ts';

/**
 * Water pass 8 (2026-09-23, owner: "when the tank is in and rolling it looks so jank and not reactive — literally a
 * static PNG following you"): a world-anchored shallow-water simulation on the GPU.
 *
 * The surface height, its flow and a foam field live in one half-float texture that covers a WINDOW square around
 * the camera focus. Every frame a fullscreen pass integrates the linear shallow-water equations at a fixed step —
 * momentum du/dt = -g grad(h + hull pressure), continuity dh/dt = -H div u — with damping, and the sheet shader
 * (shallowWater.ts) reads the height gradient for its normals and the foam field for its whitecaps. A hull is a
 * moving pressure patch, its draft over the rounded footprint: standing, it presses a dimple the surface holds;
 * moving, the patch radiates a bow mound, diverging arms and a stern train on its own (the Havelock wake), and the
 * churn its tracks inject stays where the water was churned and decays there. Nothing is built in the hull frame,
 * so nothing follows the vehicle; a shell splash is one impulse into the same field.
 *
 * The texture is a torus over world space: texel = fract(world / WINDOW). The mapping never depends on the anchor,
 * so moving the window moves nothing; the seam sits at the window's far edge, where every step fades the state to
 * rest. The mobile tier and headless receipts (no renderer) get null and the sheet keeps its procedural fallback
 * wake for the slots outside the window.
 */
export const WATER_RIPPLE_WINDOW_M = 192;
export const WATER_RIPPLE_TEXELS = 512;
/** Effective depth of the wave model (m): c = sqrt(g·H) = 4.4 m/s, so a tank at 6–10 m/s runs supercritical (a V wake). */
export const WATER_RIPPLE_DEPTH_M = 2.0;
export const WATER_RIPPLE_FIXED_DT = 1 / 60;
export const WATER_RIPPLE_MAX_SUBSTEPS = 3;
export const WATER_RIPPLE_GRAVITY = 9.81;
/** Amplitude damping (1/s): a free ripple loses an e-fold of amplitude in ~1.4 s. */
const WATER_RIPPLE_DAMPING_PER_S = 0.70;
/** Foam decay (1/s): a churned lane stays white ~2.8 s after the tracks left it, spreading as it fades. */
const WATER_RIPPLE_FOAM_DECAY_PER_S = 0.36;
/** Full-strength hull draft pressed into the surface (m). */
export const WATER_RIPPLE_HULL_DRAFT_M = 0.36;
/** Ground speed at which the tracks churn at full rate — the same speed the sheet's fallback wake saturates at. */
export const WATER_RIPPLE_CHURN_FULL_SPEED_MPS = 8;
const SLOT_CAP = 8;
const DEFAULT_HALF_LENGTH_M = 3.4;
const DEFAULT_HALF_WIDTH_M = 1.8;

const QUAD_VERTEX = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const RESET_FRAGMENT = 'void main(){ gl_FragColor = vec4(0.0); }';

/** R = height (m), G/B = flow (m/s), A = foam 0..1. */
const STEP_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tState;
uniform float uTexel;
uniform float uDx;
uniform float uSize;
uniform vec2 uAnchor;
uniform float uDt;
uniform float uGravity;
uniform float uDepth;
uniform float uDamping;
uniform float uFoamDecay;
uniform vec4 uHullA[8];
uniform vec4 uHullB[8];
uniform int uHullCount;
uniform vec4 uImpulse[8];
uniform float uImpulseFoam[8];
uniform int uImpulseCount;
uniform sampler2D tMask;
uniform float uMapSize;
uniform vec2 uRamp;
// The sheet's own wetness at a world point (1 past the square: the sea apron is open water).
float wetness(vec2 w) {
  vec2 uv = w / uMapSize + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  return smoothstep(uRamp.x, uRamp.y, texture2D(tMask, uv).b);
}

// The torus copy of this texel nearest the window centre (period uSize): the mapping never depends on uAnchor.
vec2 texelWorld(vec2 uv) {
  vec2 w = uv * uSize;
  return w + uSize * floor((uAnchor - w) / uSize + 0.5);
}
// Signed distance to a hull's rounded footprint (half length a.x, half width a.y) in its own frame.
float hullDistance(vec2 w, vec4 a, vec4 b) {
  vec2 rel = w - a.xy;
  vec2 fwd = a.zw;
  vec2 side = vec2(-fwd.y, fwd.x);
  vec2 q = vec2(abs(dot(rel, fwd)) - b.x, abs(dot(rel, side)) - b.y);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
// Hull pressure in metres of surface: the draft over the footprint, feathered 0.8 m past the skirt.
float hullPressure(vec2 w) {
  float p = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uHullCount) break;
    p += uHullB[i].z * (1.0 - smoothstep(-0.2, 0.6, hullDistance(w, uHullA[i], uHullB[i])));
  }
  return p;
}
float rippleHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Track churn: two strips under the tracks of a moving hull, strongest at the stern where the wash leaves it,
// broken into world-anchored clots (a hash per 0.7 m cell) so the lane never reads as two painted lines.
float trackChurn(vec2 w) {
  float c = 0.0;
  float clots = 0.45 + 1.1 * rippleHash(floor(w * 1.45));
  for (int i = 0; i < 8; i++) {
    if (i >= uHullCount) break;
    vec4 a = uHullA[i];
    vec4 b = uHullB[i];
    vec2 rel = w - a.xy;
    vec2 fwd = a.zw;
    vec2 side = vec2(-fwd.y, fwd.x);
    float along = dot(rel, fwd);
    float across = abs(dot(rel, side));
    float lane = smoothstep(b.y - 0.95, b.y - 0.6, across) * (1.0 - smoothstep(b.y + 0.05, b.y + 0.4, across));
    float span = 1.0 - smoothstep(b.x, b.x + 0.5, abs(along));
    c += b.w * lane * span * (1.0 + smoothstep(b.x - 2.0, b.x, -along));
  }
  return c * clots;
}
void main() {
  vec4 c = texture2D(tState, vUv);
  vec4 l = texture2D(tState, vUv - vec2(uTexel, 0.0));
  vec4 r = texture2D(tState, vUv + vec2(uTexel, 0.0));
  vec4 d = texture2D(tState, vUv - vec2(0.0, uTexel));
  vec4 u = texture2D(tState, vUv + vec2(0.0, uTexel));
  vec2 w = texelWorld(vUv);
  float pl = hullPressure(w - vec2(uDx, 0.0));
  float pr = hullPressure(w + vec2(uDx, 0.0));
  float pd = hullPressure(w - vec2(0.0, uDx));
  float pu = hullPressure(w + vec2(0.0, uDx));
  float inv2dx = 0.5 / uDx;
  // the shallows: waves slow toward the bank (crests bend shore-parallel) and the bank itself absorbs them
  float wet = wetness(w);
  float depth = uDepth * mix(0.25, 1.0, wet);
  // momentum: the surface slope and the hull pressure both push the water
  vec2 grad = vec2((r.r + pr) - (l.r + pl), (u.r + pu) - (d.r + pd)) * inv2dx;
  vec2 vel = c.gb - uGravity * grad * uDt;
  vel *= 1.0 - uDamping * uDt;
  vel *= 1.0 - min(1.0, 6.0 * uDt) * (1.0 - wet);
  // continuity: converging flow lifts the surface
  float div = ((r.g - l.g) + (u.b - d.b)) * inv2dx;
  float h = c.r - depth * div * uDt;
  h *= 1.0 - min(1.0, 3.0 * uDt) * (1.0 - wet);
  // collocated central differences decouple odd and even texels; a little diffusion keeps them one surface
  h = mix(h, (l.r + r.r + u.r + d.r) * 0.25, 0.04);
  vel = mix(vel, (l.gb + r.gb + u.gb + d.gb) * 0.25, 0.04);
  // the foam spreads as it fades (a churned lane widens behind the stern instead of staying two painted lines)
  float foam = mix(c.a, (l.a + r.a + u.a + d.a) * 0.25, 0.05) * exp(-uFoamDecay * uDt);
  for (int i = 0; i < 8; i++) {
    if (i >= uImpulseCount) break;
    vec4 imp = uImpulse[i];
    vec2 rel = w - imp.xy;
    float g = exp(-dot(rel, rel) / (imp.z * imp.z));
    h -= imp.w * g;
    foam += uImpulseFoam[i] * g;
  }
  foam += trackChurn(w) * uDt * 0.8;
  foam += smoothstep(0.70, 1.60, length(vel)) * uDt * 0.35;
  foam = clamp(foam, 0.0, 1.0);
  // the window: the state fades to rest toward the far edge, where the torus seam sits
  vec2 off = abs(w - uAnchor) / uSize;
  float window = 1.0 - smoothstep(0.40, 0.47, max(off.x, off.y));
  gl_FragColor = vec4(h, vel, foam) * window;
}
`;

export interface WaterRippleField {
  /** The current state texture (R height m, GB flow m/s, A foam) — the sheet shader's own uniform value object. */
  readonly stateUniform: { value: THREE.Texture | null };
  /** (window m, anchor x, anchor z, active 0/1) for the sheet shader. */
  readonly params: THREE.Vector4;
  /** (texel size in uv, texel size in metres). */
  readonly texel: THREE.Vector2;
  /** Steps integrated so far. */
  readonly steps: number;
  setDisturbances(sources: readonly WaterDisturbance[]): void;
  /** One splash: a crater of `amplitudeM` over `radiusM` and its foam, consumed by the next step. */
  addImpulse(x: number, z: number, radiusM: number, amplitudeM: number, foam?: number): void;
  /** Integrate up to WATER_RIPPLE_MAX_SUBSTEPS fixed steps toward real time, the window centred on the anchor. */
  step(dt: number, anchorX: number, anchorZ: number): void;
  /** Return the field to rest (map switch, teleport). */
  clear(): void;
  dispose(): void;
}

interface WaterRippleOptions {
  windowM?: number;
  texels?: number;
  depthM?: number;
  tier?: 'mobile' | 'desktop';
  /** The sheet's water mask (wetness in .b), the map size it spans and the sheet's wetness ramp. */
  mask?: THREE.Texture | null;
  mapSizeM?: number;
  ramp?: readonly [number, number];
}

/** The renderer surface the field needs; receipts hand a recording stub, production the WebGLRenderer. */
type WaterRippleRenderer = Pick<THREE.WebGLRenderer, 'render' | 'setRenderTarget' | 'getRenderTarget'>
  & { autoClear: boolean };

function makeTarget(texels: number, name: string): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(texels, texels, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
  });
  target.texture.name = name;
  return target;
}

export function createWaterRippleField(
  renderer: WaterRippleRenderer | null | undefined,
  options: WaterRippleOptions = {},
): WaterRippleField | null {
  if (!renderer || typeof renderer.setRenderTarget !== 'function' || typeof renderer.render !== 'function') return null;
  if ((options.tier ?? getDeviceTier()) === 'mobile') return null;
  const windowM = options.windowM ?? WATER_RIPPLE_WINDOW_M;
  const texels = options.texels ?? WATER_RIPPLE_TEXELS;
  const dx = windowM / texels;
  let read = makeTarget(texels, 'waterRipples.a');
  let write = makeTarget(texels, 'waterRipples.b');
  const hullA = Array.from({ length: SLOT_CAP }, () => new THREE.Vector4(0, 0, 0, 1));
  const hullB = Array.from({ length: SLOT_CAP }, () => new THREE.Vector4(DEFAULT_HALF_LENGTH_M, DEFAULT_HALF_WIDTH_M, 0, 0));
  const impulses = Array.from({ length: SLOT_CAP }, () => new THREE.Vector4(0, 0, 1, 0));
  const impulseFoam: number[] = new Array(SLOT_CAP).fill(0);
  let impulseCount = 0;
  const uniforms = {
    tState: { value: read.texture as THREE.Texture | null },
    uTexel: { value: 1 / texels },
    uDx: { value: dx },
    uSize: { value: windowM },
    uAnchor: { value: new THREE.Vector2(0, 0) },
    uDt: { value: WATER_RIPPLE_FIXED_DT },
    uGravity: { value: WATER_RIPPLE_GRAVITY },
    uDepth: { value: options.depthM ?? WATER_RIPPLE_DEPTH_M },
    uDamping: { value: WATER_RIPPLE_DAMPING_PER_S },
    uFoamDecay: { value: WATER_RIPPLE_FOAM_DECAY_PER_S },
    uHullA: { value: hullA },
    uHullB: { value: hullB },
    uHullCount: { value: 0 },
    uImpulse: { value: impulses },
    uImpulseFoam: { value: impulseFoam },
    uImpulseCount: { value: 0 },
    tMask: { value: options.mask ?? null },
    uMapSize: { value: options.mapSizeM ?? 1024 },
    uRamp: { value: new THREE.Vector2(options.ramp?.[0] ?? 0.40, options.ramp?.[1] ?? 0.78) },
  };
  const stepMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: QUAD_VERTEX, fragmentShader: STEP_FRAGMENT, depthTest: false, depthWrite: false,
  });
  stepMaterial.name = 'waterRipples:step';
  const resetMaterial = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX, fragmentShader: RESET_FRAGMENT, depthTest: false, depthWrite: false,
  });
  resetMaterial.name = 'waterRipples:reset';
  const stepQuad = new FullScreenQuad(stepMaterial);
  const resetQuad = new FullScreenQuad(resetMaterial);
  const stateUniform = { value: null as THREE.Texture | null };
  const params = new THREE.Vector4(windowM, 0, 0, 0);
  const texel = new THREE.Vector2(1 / texels, dx);
  const gl = renderer as THREE.WebGLRenderer;
  let accum = 0;
  let primed = false;
  let disposed = false;
  let steps = 0;

  function resetTargets(): void {
    gl.setRenderTarget(read);
    resetQuad.render(gl);
    gl.setRenderTarget(write);
    resetQuad.render(gl);
    primed = true;
  }

  return {
    stateUniform,
    params,
    texel,
    get steps() { return steps; },
    setDisturbances(sources) {
      const n = Math.min(SLOT_CAP, sources.length);
      for (let i = 0; i < n; i++) {
        const s = sources[i];
        let fx = s.dirX ?? 0, fz = s.dirZ ?? 1;
        const len = Math.hypot(fx, fz);
        if (Number.isFinite(len) && len > 1e-6) { fx /= len; fz /= len; } else { fx = 0; fz = 1; }
        const strength = Number.isFinite(s.strength) ? Math.min(1, Math.max(0, s.strength)) : 0;
        const speed = Math.abs(s.speed ?? 0);
        const churn = Number.isFinite(speed) ? Math.min(1, speed / WATER_RIPPLE_CHURN_FULL_SPEED_MPS) * strength : 0;
        hullA[i].set(s.x, s.z, fx, fz);
        hullB[i].set(Math.max(0.5, s.halfLength ?? DEFAULT_HALF_LENGTH_M), Math.max(0.3, s.halfWidth ?? DEFAULT_HALF_WIDTH_M),
          strength * WATER_RIPPLE_HULL_DRAFT_M, churn);
      }
      uniforms.uHullCount.value = n;
    },
    addImpulse(x, z, radiusM, amplitudeM, foam = 0.6) {
      if (impulseCount >= SLOT_CAP || !Number.isFinite(x) || !Number.isFinite(z)) return;
      impulses[impulseCount].set(x, z, Math.max(0.4, radiusM || 0), Math.max(0, amplitudeM || 0));
      impulseFoam[impulseCount] = Math.min(1, Math.max(0, foam));
      impulseCount++;
    },
    step(dt, anchorX, anchorZ) {
      if (disposed || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(anchorX) || !Number.isFinite(anchorZ)) return;
      // fixed-step integration toward real time; a long frame runs a few steps, a stall never spirals
      accum = Math.min(accum + Math.min(dt, 0.1), WATER_RIPPLE_FIXED_DT * WATER_RIPPLE_MAX_SUBSTEPS);
      const n = Math.floor(accum / WATER_RIPPLE_FIXED_DT + 1e-6);
      if (n <= 0) return;
      accum -= n * WATER_RIPPLE_FIXED_DT;
      uniforms.uAnchor.value.set(anchorX, anchorZ);
      params.set(windowM, anchorX, anchorZ, 1);
      const previousTarget = gl.getRenderTarget();
      const previousAutoClear = gl.autoClear;
      gl.autoClear = false;
      try {
        if (!primed) resetTargets();
        for (let i = 0; i < n; i++) {
          uniforms.tState.value = read.texture;
          uniforms.uImpulseCount.value = i === 0 ? impulseCount : 0; // a splash lands once
          gl.setRenderTarget(write);
          stepQuad.render(gl);
          const swap = read; read = write; write = swap;
          steps++;
        }
      } finally {
        gl.setRenderTarget(previousTarget);
        gl.autoClear = previousAutoClear;
      }
      impulseCount = 0;
      stateUniform.value = read.texture;
    },
    clear() {
      if (disposed) return;
      const previousTarget = gl.getRenderTarget();
      const previousAutoClear = gl.autoClear;
      gl.autoClear = false;
      try { resetTargets(); } finally { gl.setRenderTarget(previousTarget); gl.autoClear = previousAutoClear; }
      accum = 0;
      impulseCount = 0;
      params.w = 0;
      stateUniform.value = null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      read.dispose();
      write.dispose();
      stepQuad.dispose();
      resetQuad.dispose();
      stepMaterial.dispose();
      resetMaterial.dispose();
      params.w = 0;
      stateUniform.value = null;
    },
  };
}
