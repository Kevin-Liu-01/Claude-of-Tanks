import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Scene Studio film depth probe (src/game/studioFilm.ts). Imported only by the lazily loaded Studio chunk.
 *
 * A film frame's motion-adaptive sample count (studioFilmPlan.ts adaptiveSampleCount) follows the fastest image
 * travel in the frame, and the fastest travel belongs to the nearest surfaces: a bush brushing the lens, a pole, a
 * hull a few metres off. The Studio's motion probe found its depths by marching the terrain only, so props and
 * foliage near the lens went unmeasured and printed in stepped copies (shutter wave s1, 2026-10-08: S13 frame 90's
 * foreground foliage travelled about four times the measured 33 px and both critics read doubled leaf outlines).
 * After each film frame this pass reduces the frame's depth to the nearest surface in each cell of a coarse grid
 * and reads it back as world points, which the next frame's motion probe tracks across its shutter.
 */

const COLS = 16;
const ROWS = 9;
/** Depth taps per cell side: at 2160p a tap every 20 px of a 240 px cell. */
const TAPS = 12;

const QUAD_VERTEX = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const NEAREST_FRAGMENT = /* glsl */`
precision highp float;
uniform highp sampler2D tDepth;
uniform vec2 uSize;
uniform vec2 uGrid;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
#define TAPS ${TAPS}
void main() {
  vec2 cell = floor(vUv * uGrid);
  vec2 cellPx = uSize / uGrid;
  float nearest = 1.0;
  for (int j = 0; j < TAPS; j++) {
    for (int i = 0; i < TAPS; i++) {
      vec2 p = (cell + (vec2(float(i), float(j)) + 0.5) / float(TAPS)) * cellPx;
      nearest = min(nearest, texelFetch(tDepth, ivec2(min(p, uSize - 1.0)), 0).r);
    }
  }
  // distance along the view axis (m); 0 where the cell holds no surface (sky, the far plane)
  float viewZ = nearest >= 0.999999 ? 0.0 : (uNear * uFar) / (uFar - nearest * (uFar - uNear));
  gl_FragColor = vec4(viewZ, 0.0, 0.0, 1.0);
}`;

/**
 * World points of the cells' nearest surfaces: `viewDepth` holds one RGBA texel per cell (row 0 at the bottom, as
 * readRenderTargetPixels returns it), its red channel the surface's distance along the view axis (0: no surface).
 * Cells at or beyond `maxDistM` are skipped. Writes (x, y, z) triples into `out`; returns how many.
 */
export function nearSurfacePoints(
  viewDepth: Float32Array, cols: number, rows: number, camera: THREE.PerspectiveCamera, maxDistM: number,
  out: Float32Array, ray = new THREE.Vector3(),
): number {
  let n = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const viewZ = viewDepth[(row * cols + col) * 4];
      if (!(viewZ > 0 && viewZ < maxDistM)) continue;
      // the cell centre's ray in view space, scaled to the surface's distance along the view axis
      ray.set(((col + 0.5) / cols) * 2 - 1, ((row + 0.5) / rows) * 2 - 1, 0.5).applyMatrix4(camera.projectionMatrixInverse);
      ray.multiplyScalar(viewZ / -ray.z).applyMatrix4(camera.matrixWorld);
      out[n * 3] = ray.x;
      out[n * 3 + 1] = ray.y;
      out[n * 3 + 2] = ray.z;
      n++;
    }
  }
  return n;
}

/** The shader's depth-buffer value to view distance (perspective, standard depth): its mirror, for tests. */
export function viewDistanceFromDepth(depth: number, near: number, far: number): number {
  return depth >= 0.999999 ? 0 : (near * far) / (far - depth * (far - near));
}

export class FilmDepthProbe {
  /** World points (x, y, z) of each cell's nearest surface from the last read; `count` of them. */
  readonly points = new Float32Array(COLS * ROWS * 3);
  count = 0;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly pixels = new Float32Array(COLS * ROWS * 4);
  private readonly ray = new THREE.Vector3();

  constructor() {
    this.target = new THREE.WebGLRenderTarget(COLS, ROWS, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    this.target.texture.name = 'FilmDepthProbe.nearest';
    this.material = new THREE.ShaderMaterial({
      name: 'FilmDepthProbe.nearest',
      uniforms: {
        tDepth: { value: null }, uSize: { value: new THREE.Vector2(1, 1) }, uGrid: { value: new THREE.Vector2(COLS, ROWS) },
        uNear: { value: 0.1 }, uFar: { value: 1000 },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: NEAREST_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** Forget the last read (a cut, a new film): the next probe falls back to the terrain alone. */
  clear(): void {
    this.count = 0;
  }

  /**
   * Reduce `depth` (the frame just rendered through `camera`) and keep, as world points, the nearest surface of
   * every cell closer than `maxDistM`; farther cells are left to the terrain probe. False when the readback fails.
   */
  read(renderer: THREE.WebGLRenderer, depth: THREE.DepthTexture, camera: THREE.PerspectiveCamera, maxDistM = 80): boolean {
    this.count = 0;
    const image = depth.image as { width?: number; height?: number } | null;
    const width = image?.width ?? 0, height = image?.height ?? 0;
    if (!(width > 0 && height > 0)) return false;
    const u = this.material.uniforms;
    u.tDepth.value = depth;
    (u.uSize.value as THREE.Vector2).set(width, height);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear, previousToneMapping = renderer.toneMapping, previousXr = renderer.xr.enabled;
    try {
      renderer.xr.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = false;
      renderer.setRenderTarget(this.target);
      this.quad.render(renderer);
      renderer.readRenderTargetPixels(this.target, 0, 0, COLS, ROWS, this.pixels);
    } catch {
      return false;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = previousAutoClear;
      renderer.toneMapping = previousToneMapping;
      renderer.xr.enabled = previousXr;
      u.tDepth.value = null;
    }
    camera.updateMatrixWorld();
    this.count = nearSurfacePoints(this.pixels, COLS, ROWS, camera, maxDistM, this.points, this.ray);
    return true;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
