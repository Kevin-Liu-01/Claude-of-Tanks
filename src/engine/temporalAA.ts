import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

// Temporal anti-aliasing (2026-09-12). Owner: "fix shadow flashing from trees
// and other objects, that's a persistent issue" and "as beautiful as triple-A
// games while maintaining extremely high performance". A one-pixel camera
// shift flipped 28 % of the frame's pixels (32 % on the 1049e4e reference):
// alpha-tested foliage, fine ground relief and PCF shadow dapple all sit at
// sub-pixel scale, and MSAA (geometry edges only) or SMAA (patterns) cannot
// settle them. Every AAA renderer answers that with temporal accumulation:
// a sub-pixel projection jitter per frame, the previous frame reprojected
// through depth, history clipped to the current neighbourhood (variance
// clipping) so moving tanks and smoke do not ghost, and a luminance-weighted
// blend so HDR sparkles cannot flash. One resolve plus one copy at the
// internal resolution — cheaper than a single extra shadow cascade.

export const TAA_HISTORY_WEIGHT = 0.9;
export const TAA_HISTORY_WEIGHT_MOVING = 0.82;
/** Max view-projection element change per frame above which the camera counts as fast. */
export const TAA_MOVING_DELTA = 0.02;
export const TAA_JITTER_LENGTH = 8;
export const TAA_STALE_MS = 250;
export const TAA_CLIP_GAMMA = 1.0;
/**
 * History depth is stored as linear view depth over the far plane (half-float
 * alpha keeps ~0.1 % relative precision there; non-linear NDC depth near 1.0
 * quantizes coarser than any useful tolerance and rejected almost every
 * sample). Rejection tolerance is a floor plus a relative share.
 */
export const TAA_DEPTH_REJECT_MIN = 0.02;
export const TAA_DEPTH_REJECT_RELATIVE = 0.1;

export function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = Math.max(0, Math.floor(index));
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/** Sub-pixel jitter for frame `frame`, in pixels, centred on the pixel. */
export function taaJitterOffset(frame: number): [number, number] {
  const index = (((frame % TAA_JITTER_LENGTH) + TAA_JITTER_LENGTH) % TAA_JITTER_LENGTH) + 1;
  return [halton(index, 2) - 0.5, halton(index, 3) - 0.5];
}

/** Shift a projection matrix by (jx, jy) pixels of an internal (width × height) frame. */
export function applyProjectionJitter(
  projection: THREE.Matrix4, jx: number, jy: number, width: number, height: number,
): void {
  projection.elements[8] += (2 * jx) / Math.max(1, width);
  projection.elements[9] += (2 * jy) / Math.max(1, height);
}

/** History share of the blend: none on a seed frame, less while the camera moves fast. */
export function resolveTaaHistoryWeight(maxMatrixDelta: number, seed: boolean): number {
  if (seed || !Number.isFinite(maxMatrixDelta)) return 0;
  return maxMatrixDelta > TAA_MOVING_DELTA ? TAA_HISTORY_WEIGHT_MOVING : TAA_HISTORY_WEIGHT;
}

export const TAA_RESOLVE_FRAGMENT = /* glsl */`
uniform sampler2D tNow, tHistory, tDepth;
uniform mat4 uInvViewProj, uPrevViewProj;
uniform vec2 uTexel, uNearFar;
uniform float uHistoryWeight, uSeed;
varying vec2 vUv;
// luminance weighting (Karis): bright HDR sparkles blend as bounded values
vec3 tmw(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 itmw(vec3 c) { return c / max(1e-4, 1.0 - max(c.r, max(c.g, c.b))); }
// linear view depth over the far plane from a [0,1] perspective depth
float linearDepth01(float d) {
  float z = d * 2.0 - 1.0;
  float lin = (2.0 * uNearFar.x * uNearFar.y) / (uNearFar.y + uNearFar.x - z * (uNearFar.y - uNearFar.x));
  return lin / uNearFar.y;
}
void main() {
  vec3 now = tmw(max(texture2D(tNow, vUv).rgb, vec3(0.0)));
  float depth = texture2D(tDepth, vUv).x;
  vec3 m1 = vec3(0.0), m2 = vec3(0.0), mn = vec3(1e9), mx = vec3(-1e9);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec3 c = tmw(max(texture2D(tNow, vUv + vec2(float(x), float(y)) * uTexel).rgb, vec3(0.0)));
      m1 += c; m2 += c * c; mn = min(mn, c); mx = max(mx, c);
    }
  }
  vec3 mu = m1 / 9.0;
  vec3 sigma = sqrt(max(m2 / 9.0 - mu * mu, vec3(0.0)));
  // variance clipping: history may only land inside the current neighbourhood
  vec3 lo = max(mn, mu - sigma * ${TAA_CLIP_GAMMA.toFixed(2)});
  vec3 hi = min(mx, mu + sigma * ${TAA_CLIP_GAMMA.toFixed(2)});
  vec4 world = uInvViewProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  world /= world.w;
  vec4 pc = uPrevViewProj * world;
  vec2 prevUv = (pc.xy / pc.w) * 0.5 + 0.5;
  bool off = depth >= 1.0 || pc.w <= 0.0
    || any(lessThan(prevUv, vec2(0.0))) || any(greaterThan(prevUv, vec2(1.0)));
  vec4 hs = texture2D(tHistory, prevUv);
  float expectedPrevLinear = linearDepth01((pc.z / pc.w) * 0.5 + 0.5);
  bool depthMismatch = abs(hs.a - expectedPrevLinear)
    > max(${TAA_DEPTH_REJECT_MIN.toFixed(4)}, expectedPrevLinear * ${TAA_DEPTH_REJECT_RELATIVE.toFixed(3)});
  vec3 hist = clamp(tmw(max(hs.rgb, vec3(0.0))), lo, hi);
  float w = (off || depthMismatch || uSeed > 0.5) ? 0.0 : uHistoryWeight;
  gl_FragColor = vec4(itmw(mix(now, hist, w)), linearDepth01(depth));
}`;

const COPY_FRAGMENT = /* glsl */`
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }`;

const QUAD_VERTEX = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

function makeHistoryTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  target.texture.name = 'TemporalAAPass.history';
  return target;
}

export class TemporalAAPass extends Pass {
  readonly material: THREE.ShaderMaterial;
  readonly copyMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly copyQuad: FullScreenQuad;
  private historyPrev: THREE.WebGLRenderTarget;
  private historyCur: THREE.WebGLRenderTarget;
  private readonly prevViewProj = new THREE.Matrix4();
  private readonly currentViewProj = new THREE.Matrix4();
  private lastMs = -1e9;
  /** Frames resolved since creation (probes). */
  frames = 0;
  /** Last history weight used (probes). */
  lastHistoryWeight = 0;
  /** Frames since the last seed (probes). */
  convergedFrames = 0;

  private readonly camera: THREE.Camera;

  constructor(
    camera: THREE.Camera,
    depthTexture: THREE.DepthTexture,
    width: number,
    height: number,
  ) {
    super();
    this.camera = camera;
    this.needsSwap = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tNow: { value: null },
        tHistory: { value: null },
        tDepth: { value: depthTexture },
        uInvViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / Math.max(1, width), 1 / Math.max(1, height)) },
        uNearFar: { value: new THREE.Vector2(0.1, 1000) },
        uHistoryWeight: { value: 0 },
        uSeed: { value: 1 },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: TAA_RESOLVE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    this.material.name = 'TemporalAAPass.resolve';
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: COPY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    this.copyMaterial.name = 'TemporalAAPass.copy';
    this.quad = new FullScreenQuad(this.material);
    this.copyQuad = new FullScreenQuad(this.copyMaterial);
    this.historyPrev = makeHistoryTarget(width, height);
    this.historyCur = makeHistoryTarget(width, height);
  }

  /** Forget the history: the next frame shows the current image only. */
  resetHistory(): void {
    this.lastMs = -1e9;
    this.convergedFrames = 0;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (this.historyPrev.width !== w || this.historyPrev.height !== h) {
      this.historyPrev.setSize(w, h);
      this.historyCur.setSize(w, h);
    }
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.resetHistory(); // old history is the wrong resolution
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const cam = this.camera;
    const u = this.material.uniforms;
    const perspective = cam as THREE.PerspectiveCamera;
    if (Number.isFinite(perspective.near) && Number.isFinite(perspective.far)) {
      u.uNearFar.value.set(perspective.near, perspective.far);
    }
    u.uInvViewProj.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
    this.currentViewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const now = performance.now();
    const seed = now - this.lastMs > TAA_STALE_MS;
    let maxDelta = 0;
    if (seed) {
      this.prevViewProj.copy(this.currentViewProj);
    } else {
      for (let i = 0; i < 16; i++) {
        maxDelta = Math.max(maxDelta,
          Math.abs(this.currentViewProj.elements[i] - this.prevViewProj.elements[i]));
      }
    }
    const weight = resolveTaaHistoryWeight(maxDelta, seed);
    u.uPrevViewProj.value.copy(this.prevViewProj);
    u.tNow.value = readBuffer.texture;
    u.tHistory.value = this.historyPrev.texture;
    u.uHistoryWeight.value = weight;
    u.uSeed.value = seed ? 1 : 0;
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.historyCur);
    this.quad.render(renderer);
    this.copyMaterial.uniforms.tDiffuse.value = this.historyCur.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.copyQuad.render(renderer);
    renderer.setRenderTarget(previousTarget);
    const swap = this.historyPrev;
    this.historyPrev = this.historyCur;
    this.historyCur = swap;
    this.prevViewProj.copy(this.currentViewProj);
    this.lastMs = now;
    this.lastHistoryWeight = weight;
    this.convergedFrames = seed ? 0 : this.convergedFrames + 1;
    this.frames++;
  }

  dispose(): void {
    this.historyPrev.dispose();
    this.historyCur.dispose();
    this.material.dispose();
    this.copyMaterial.dispose();
    this.quad.dispose();
    this.copyQuad.dispose();
  }
}
