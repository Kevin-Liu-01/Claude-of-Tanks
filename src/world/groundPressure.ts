import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { getDeviceTier } from '../engine/quality.ts';

/**
 * Round 73 (2026-09-25, the ground redux; owner: "add tall grass that interacts with tanks"): a world-anchored
 * pressure field the tall grass reads. Every hull stamps its rounded footprint into one half-float texture that
 * covers a WINDOW square around the chase focus — R = how flat the sward is pressed (0..1), GB = the direction it
 * was pushed in (world xz), A = a slower memory of the crushing (the blades stay bruised after they stand up). Each
 * frame one fullscreen pass lets the flattening spring back (an e-fold in GROUND_PRESSURE_RECOVER_S) and stamps the
 * hulls: under a moving hull the blades lie along the travel direction, under a standing one they splay outward from
 * the belly; the stamp only ever raises the flattening, so a trail stays behind the tracks until it recovers.
 *
 * The texture is a torus over world space (texel = fract(world / WINDOW)) as in waterRipples.ts, so the mapping never
 * depends on the anchor; the state fades to rest toward the window's far edge, where the seam sits. The mobile tier
 * and headless receipts (no renderer) get null and the grass stands untouched.
 */
export const GROUND_PRESSURE_WINDOW_M = 96;
export const GROUND_PRESSURE_TEXELS = 256;
/** Spring-back time constant (s): a flattened lane keeps 37 % of its press after this long, 5 % after three. */
export const GROUND_PRESSURE_RECOVER_S = 20;
/** The bruise memory (s): crushed blades keep a darker tone about a minute. */
export const GROUND_PRESSURE_CRUSH_S = 45;
/** Feather past the hull skirt (m) over which the press falls to zero. */
export const GROUND_PRESSURE_FEATHER_M = 0.45;
const SLOT_CAP = 8;
const DEFAULT_HALF_LENGTH_M = 3.4;
const DEFAULT_HALF_WIDTH_M = 1.8;

const QUAD_VERTEX = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const RESET_FRAGMENT = 'void main(){ gl_FragColor = vec4(0.0); }';

/** R = flatten 0..1, GB = push direction (world xz, unit), A = crush memory 0..1. */
const STEP_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tState;
uniform float uSize;
uniform vec2 uAnchor;
uniform float uDt;
uniform float uRecover;
uniform float uCrushDecay;
uniform float uFeather;
uniform vec4 uHullA[8];
uniform vec4 uHullB[8];
uniform int uHullCount;
// The torus copy of this texel nearest the window centre (period uSize): the mapping never depends on uAnchor.
vec2 texelWorld(vec2 uv) {
  vec2 w = uv * uSize;
  return w + uSize * floor((uAnchor - w) / uSize + 0.5);
}
// Signed distance to a hull's rounded footprint (half length b.x, half width b.y) in its own frame.
float hullDistance(vec2 w, vec4 a, vec4 b) {
  vec2 rel = w - a.xy;
  vec2 fwd = a.zw;
  vec2 side = vec2(-fwd.y, fwd.x);
  vec2 q = vec2(abs(dot(rel, fwd)) - b.x, abs(dot(rel, side)) - b.y);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
void main() {
  vec4 c = texture2D(tState, vUv);
  vec2 w = texelWorld(vUv);
  float press = c.r * exp(-uDt / uRecover);
  float crush = c.a * exp(-uDt / uCrushDecay);
  vec2 dir = c.gb;
  for (int i = 0; i < 8; i++) {
    if (i >= uHullCount) break;
    vec4 a = uHullA[i];
    vec4 b = uHullB[i];
    float inside = (1.0 - smoothstep(-0.15, uFeather, hullDistance(w, a, b))) * b.z;
    if (inside > press) {
      vec2 rel = w - a.xy;
      vec2 side = vec2(-a.w, a.z);
      float across = dot(rel, side);
      // moving: the blades lie along the travel direction; standing: they splay out from the belly; the flanks
      // always lean a little outward so a trail reads as two rolled lanes, not one flat stripe
      vec2 push = b.w > 0.5 ? a.zw : normalize(rel + vec2(1e-4, 0.0));
      push = normalize(push + side * sign(across) * mix(0.55, 0.30, b.w));
      dir = normalize(mix(dir, push, clamp((inside - press) * 3.0, 0.0, 1.0)) + vec2(1e-5, 0.0));
      press = inside;
    }
    crush = max(crush, inside * 0.85);
  }
  // the window: the state fades to rest toward the far edge, where the torus seam sits
  vec2 off = abs(w - uAnchor) / uSize;
  float window = 1.0 - smoothstep(0.40, 0.47, max(off.x, off.y));
  gl_FragColor = vec4(press, dir, crush) * window;
}
`;

/** One hull's footprint this frame (main.ts publishes every vehicle, in water or not). */
export interface GroundDisturbance {
  readonly x: number;
  readonly z: number;
  /** Direction of travel in world XZ (the hull's facing when standing); any length, defaults to +Z. */
  readonly dirX?: number;
  readonly dirZ?: number;
  /** Ground speed in m/s (magnitude); above GROUND_PRESSURE_MOVING_MPS the blades lie along the travel direction. */
  readonly speed?: number;
  /** Hull footprint half extents in metres (defaults: 3.4 x 1.8). */
  readonly halfLength?: number;
  readonly halfWidth?: number;
  /** 0..1 press strength (a hovering / flying hull presses less); defaults to 1. */
  readonly strength?: number;
}
/** Ground speed from which a hull is "moving" for the push direction. */
export const GROUND_PRESSURE_MOVING_MPS = 0.6;

export interface GroundPressureField {
  /** The current state texture (R press, GB direction, A crush) — the grass shader's own uniform value object. */
  readonly stateUniform: { value: THREE.Texture | null };
  /** (window m, anchor x, anchor z, active 0/1) for the grass shader. */
  readonly params: THREE.Vector4;
  /** Steps integrated so far. */
  readonly steps: number;
  setDisturbances(sources: readonly GroundDisturbance[]): void;
  /** One pass toward real time (dt clamped to 0.1 s), the window centred on the anchor. */
  step(dt: number, anchorX: number, anchorZ: number): void;
  /** Return the field to rest (map switch, teleport). */
  clear(): void;
  dispose(): void;
}

interface GroundPressureOptions {
  windowM?: number;
  texels?: number;
  tier?: 'mobile' | 'desktop';
}

/** The renderer surface the field needs; receipts hand a recording stub, production the WebGLRenderer. */
type GroundPressureRenderer = Pick<THREE.WebGLRenderer, 'render' | 'setRenderTarget' | 'getRenderTarget'>
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

export function createGroundPressureField(
  renderer: GroundPressureRenderer | null | undefined,
  options: GroundPressureOptions = {},
): GroundPressureField | null {
  if (!renderer || typeof renderer.setRenderTarget !== 'function' || typeof renderer.render !== 'function') return null;
  if ((options.tier ?? getDeviceTier()) === 'mobile') return null;
  const windowM = options.windowM ?? GROUND_PRESSURE_WINDOW_M;
  const texels = options.texels ?? GROUND_PRESSURE_TEXELS;
  let read = makeTarget(texels, 'groundPressure.a');
  let write = makeTarget(texels, 'groundPressure.b');
  const hullA = Array.from({ length: SLOT_CAP }, () => new THREE.Vector4(0, 0, 0, 1));
  const hullB = Array.from({ length: SLOT_CAP }, () => new THREE.Vector4(DEFAULT_HALF_LENGTH_M, DEFAULT_HALF_WIDTH_M, 0, 0));
  const uniforms = {
    tState: { value: read.texture as THREE.Texture | null },
    uSize: { value: windowM },
    uAnchor: { value: new THREE.Vector2(0, 0) },
    uDt: { value: 1 / 60 },
    uRecover: { value: GROUND_PRESSURE_RECOVER_S },
    uCrushDecay: { value: GROUND_PRESSURE_CRUSH_S },
    uFeather: { value: GROUND_PRESSURE_FEATHER_M },
    uHullA: { value: hullA },
    uHullB: { value: hullB },
    uHullCount: { value: 0 },
  };
  const stepMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader: QUAD_VERTEX, fragmentShader: STEP_FRAGMENT, depthTest: false, depthWrite: false,
  });
  stepMaterial.name = 'groundPressure:step';
  const resetMaterial = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX, fragmentShader: RESET_FRAGMENT, depthTest: false, depthWrite: false,
  });
  resetMaterial.name = 'groundPressure:reset';
  const stepQuad = new FullScreenQuad(stepMaterial);
  const resetQuad = new FullScreenQuad(resetMaterial);
  const stateUniform = { value: null as THREE.Texture | null };
  const params = new THREE.Vector4(windowM, 0, 0, 0);
  const gl = renderer as THREE.WebGLRenderer;
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
    get steps() { return steps; },
    setDisturbances(sources) {
      const n = Math.min(SLOT_CAP, sources.length);
      for (let i = 0; i < n; i++) {
        const s = sources[i];
        let fx = s.dirX ?? 0, fz = s.dirZ ?? 1;
        const len = Math.hypot(fx, fz);
        if (Number.isFinite(len) && len > 1e-6) { fx /= len; fz /= len; } else { fx = 0; fz = 1; }
        const strength = Number.isFinite(s.strength ?? 1) ? Math.min(1, Math.max(0, s.strength ?? 1)) : 0;
        const speed = Math.abs(s.speed ?? 0);
        hullA[i].set(s.x, s.z, fx, fz);
        hullB[i].set(Math.max(0.5, s.halfLength ?? DEFAULT_HALF_LENGTH_M), Math.max(0.3, s.halfWidth ?? DEFAULT_HALF_WIDTH_M),
          strength, Number.isFinite(speed) && speed >= GROUND_PRESSURE_MOVING_MPS ? 1 : 0);
      }
      uniforms.uHullCount.value = n;
    },
    step(dt, anchorX, anchorZ) {
      if (disposed || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(anchorX) || !Number.isFinite(anchorZ)) return;
      uniforms.uDt.value = Math.min(dt, 0.1);
      uniforms.uAnchor.value.set(anchorX, anchorZ);
      params.set(windowM, anchorX, anchorZ, 1);
      const previousTarget = gl.getRenderTarget();
      const previousAutoClear = gl.autoClear;
      gl.autoClear = false;
      try {
        if (!primed) resetTargets();
        uniforms.tState.value = read.texture;
        gl.setRenderTarget(write);
        stepQuad.render(gl);
        const swap = read; read = write; write = swap;
        steps++;
      } finally {
        gl.setRenderTarget(previousTarget);
        gl.autoClear = previousAutoClear;
      }
      stateUniform.value = read.texture;
    },
    clear() {
      if (disposed) return;
      const previousTarget = gl.getRenderTarget();
      const previousAutoClear = gl.autoClear;
      gl.autoClear = false;
      try { resetTargets(); } finally { gl.setRenderTarget(previousTarget); gl.autoClear = previousAutoClear; }
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

/** CPU twin of the shader's rounded-footprint press at a world point (the receipt and the trail metric use it). */
export function groundPressAt(
  x: number, z: number, hull: GroundDisturbance, feather = GROUND_PRESSURE_FEATHER_M,
): number {
  let fx = hull.dirX ?? 0, fz = hull.dirZ ?? 1;
  const len = Math.hypot(fx, fz);
  if (len > 1e-6) { fx /= len; fz /= len; } else { fx = 0; fz = 1; }
  const relX = x - hull.x, relZ = z - hull.z;
  const along = Math.abs(relX * fx + relZ * fz) - Math.max(0.5, hull.halfLength ?? DEFAULT_HALF_LENGTH_M);
  const across = Math.abs(relX * -fz + relZ * fx) - Math.max(0.3, hull.halfWidth ?? DEFAULT_HALF_WIDTH_M);
  const qx = Math.max(along, 0), qz = Math.max(across, 0);
  const d = Math.hypot(qx, qz) + Math.min(Math.max(along, across), 0);
  const t = Math.min(1, Math.max(0, (d + 0.15) / (feather + 0.15)));
  const s = t * t * (3 - 2 * t);
  return (1 - s) * Math.min(1, Math.max(0, hull.strength ?? 1));
}
