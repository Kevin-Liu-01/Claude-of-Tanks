import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { getDeviceTier, resolvePresetName, type PresetName } from '../engine/quality.ts';
import {
  OCEAN_FFT_SIZE, OCEAN_QUAD_VERTEX, oceanPassPlan, oceanStageShader, type OceanSpectrumTexels, type OceanState,
} from './oceanSpectrum.ts';

/**
 * Round 66 (2026-09-24): the FFT ocean on WebGL2 — no compute shaders, so the inverse transform is a chain of
 * fragment-shader passes over float render targets. One frame runs the pass plan of oceanSpectrum.ts (for a 128²
 * grid: a radix-16 and a radix-8 stage per axis, four passes in all) over ONE texture that stacks every cascade's
 * tile: the first pass evolves the time-zero spectrum to the current time and packs the eight real fields into two
 * complex pairs, the middle passes are Stockham butterflies, the last applies the (−1)^{x+z} sign, accumulates the
 * Jacobian foam against the previous frame and writes the two maps the sheet samples — displacement (λDx, Dy, λDz,
 * foam) and derivative (dDy/dx, dDy/dz, λ dDx/dx, λ dDz/dz). Intermediates are RGBA32F with nearest fetches; the maps
 * are RGBA16F, linear, wrapping in x through the sampler and in z through each tile's padded row.
 *
 * Tiers: the mobile tier and receipts (no renderer) get null and the sheet keeps its normal-map wave; the desktop
 * `low` preset halves the grid and every desktop preset below `high` updates on alternate frames.
 */
export interface OceanField {
  /** (λDx, Dy, λDz, foam) per cascade tile — the sheet shader's own uniform value object. */
  readonly displacement: { value: THREE.Texture | null };
  /** (dDy/dx, dDy/dz, λ dDx/dx, λ dDz/dz) per cascade tile. */
  readonly derivative: { value: THREE.Texture | null };
  /** Patch sizes in metres, large to small. */
  readonly patches: THREE.Vector3;
  /** (grid size n, rows per tile, cascades, active 0/1). */
  readonly grid: THREE.Vector4;
  readonly state: OceanState;
  /** The time-zero spectrum the field evolves (probes rebuild the CPU reference from it). */
  readonly spectrum: OceanSpectrumTexels;
  /** Significant wave height of the authored spectrum (m). */
  readonly hs: number;
  /** Frames the transform has rendered. */
  readonly frames: number;
  /** Advance the surface clock and, on this frame's turn, run the transform. */
  update(dt: number): void;
  /** Pin the surface clock (deterministic captures). */
  setTime(t: number): void;
  dispose(): void;
}

/** The renderer surface the field needs; receipts hand a recording stub, production the WebGLRenderer. */
type OceanRenderer = Pick<THREE.WebGLRenderer, 'render' | 'setRenderTarget' | 'getRenderTarget'>
  & { autoClear: boolean; extensions?: { has(name: string): boolean } };

interface OceanFieldOptions {
  tier?: 'mobile' | 'desktop';
  preset?: PresetName;
}

/** Grid size per cascade for a quality preset: the desktop `low` preset halves it. */
export function oceanGridSize(preset: PresetName): number {
  return preset === 'low' ? OCEAN_FFT_SIZE / 2 : OCEAN_FFT_SIZE;
}
/** Frames between transforms: every frame on `high` / `ultra`, alternate frames below. */
export function oceanFrameStride(preset: PresetName): number {
  return preset === 'high' || preset === 'ultra' ? 1 : 2;
}

/** Whether a renderer can host the field: a real render surface, float colour buffers, not the mobile tier. */
export function oceanFieldSupported(renderer: OceanRenderer | null | undefined, tier = getDeviceTier()): boolean {
  if (!renderer || typeof renderer.setRenderTarget !== 'function' || typeof renderer.render !== 'function') return false;
  if (tier === 'mobile') return false;
  return renderer.extensions?.has('EXT_color_buffer_float') === true;
}

function makeTarget(width: number, height: number, type: THREE.TextureDataType, filter: THREE.MagnificationTextureFilter,
  wrapS: THREE.Wrapping, name: string): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    count: 2, type, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    minFilter: filter, magFilter: filter, wrapS, wrapT: THREE.ClampToEdgeWrapping,
  });
  target.textures[0].name = `${name}.a`;
  target.textures[1].name = `${name}.b`;
  return target;
}

const RESET_FRAGMENT = 'layout(location = 0) out vec4 oA;\nlayout(location = 1) out vec4 oB;\nvoid main(){ oA = vec4(0.0); oB = vec4(0.0); }';

export function createOceanField(
  renderer: OceanRenderer | null | undefined,
  spectrum: OceanSpectrumTexels,
  state: OceanState,
  options: OceanFieldOptions = {},
): OceanField | null {
  if (!oceanFieldSupported(renderer, options.tier ?? getDeviceTier())) return null;
  const gl = renderer as THREE.WebGLRenderer;
  const preset = options.preset ?? resolvePresetName();
  const stride = oceanFrameStride(preset);
  const { n, rows, cascades } = spectrum;
  const height = rows * cascades;
  const spectrumTexture = new THREE.DataTexture(spectrum.data, n, height, THREE.RGBAFormat, THREE.FloatType);
  spectrumTexture.name = 'ocean.spectrum';
  spectrumTexture.minFilter = THREE.NearestFilter;
  spectrumTexture.magFilter = THREE.NearestFilter;
  spectrumTexture.generateMipmaps = false;
  spectrumTexture.needsUpdate = true;
  const ping = [makeTarget(n, height, THREE.FloatType, THREE.NearestFilter, THREE.ClampToEdgeWrapping, 'ocean.ping0'),
    makeTarget(n, height, THREE.FloatType, THREE.NearestFilter, THREE.ClampToEdgeWrapping, 'ocean.ping1')];
  const finals = [makeTarget(n, height, THREE.HalfFloatType, THREE.LinearFilter, THREE.RepeatWrapping, 'ocean.maps0'),
    makeTarget(n, height, THREE.HalfFloatType, THREE.LinearFilter, THREE.RepeatWrapping, 'ocean.maps1')];
  const uniforms = {
    tA: { value: null as THREE.Texture | null },
    tB: { value: null as THREE.Texture | null },
    tH0: { value: spectrumTexture as THREE.Texture },
    tPrev: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uDt: { value: 1 / 60 },
    uDepth: { value: state.depthM },
    uChop: { value: state.choppiness },
    // whitecaps: the Jacobian below which foam is made, its gain, its decay (1/s) and the rate it accumulates at
    uFoam: { value: new THREE.Vector4(0.55 + 0.35 * state.foam, 3.0, 0.35, 2.5) },
    uPatch: { value: new THREE.Vector3(...state.patches) },
  };
  const passes = oceanPassPlan(n, cascades).map((pass) => {
    const material = new THREE.ShaderMaterial({
      uniforms, glslVersion: THREE.GLSL3, vertexShader: OCEAN_QUAD_VERTEX, fragmentShader: oceanStageShader(pass),
      depthTest: false, depthWrite: false,
    });
    material.name = `ocean:${pass.horizontal ? 'h' : 'v'}${pass.radix}${pass.first ? ':spectrum' : pass.last ? ':maps' : ''}`;
    return { material, last: pass.last };
  });
  const resetMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: OCEAN_QUAD_VERTEX, fragmentShader: RESET_FRAGMENT, depthTest: false, depthWrite: false,
  });
  resetMaterial.name = 'ocean:reset';
  const quad = new FullScreenQuad(passes[0].material);
  const displacement = { value: null as THREE.Texture | null };
  const derivative = { value: null as THREE.Texture | null };
  const patches = new THREE.Vector3(...state.patches);
  const grid = new THREE.Vector4(n, rows, cascades, 0);
  let time = 0, frame = 0, frames = 0, primed = false, disposed = false, mapsWritten = 0;

  function transform(dt: number): void {
    const previousTarget = gl.getRenderTarget();
    const previousAutoClear = gl.autoClear;
    gl.autoClear = false;
    try {
      if (!primed) {
        // the foam feedback reads the other map set: both start at rest (no clear-colour API on the stub renderers)
        quad.material = resetMaterial;
        for (const target of finals) { gl.setRenderTarget(target); quad.render(gl); }
        primed = true;
      }
      uniforms.uTime.value = time;
      uniforms.uDt.value = Math.min(dt, 0.1);
      const writeMaps = mapsWritten & 1, readMaps = writeMaps ^ 1;
      let read = 0;
      for (const pass of passes) {
        uniforms.tA.value = ping[read].textures[0];
        uniforms.tB.value = ping[read].textures[1];
        uniforms.tPrev.value = finals[readMaps].textures[0];
        gl.setRenderTarget(pass.last ? finals[writeMaps] : ping[read ^ 1]);
        quad.material = pass.material;
        quad.render(gl);
        read ^= 1;
      }
      displacement.value = finals[writeMaps].textures[0];
      derivative.value = finals[writeMaps].textures[1];
      mapsWritten++;
      grid.w = 1;
      frames++;
    } finally {
      gl.setRenderTarget(previousTarget);
      gl.autoClear = previousAutoClear;
    }
  }

  return {
    displacement, derivative, patches, grid, state, spectrum, hs: spectrum.hs,
    get frames() { return frames; },
    update(dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      time += Math.min(dt, 0.1);
      frame++;
      if (frame % stride !== 0) return;
      transform(Math.min(dt, 0.1) * stride);
    },
    setTime(t) { if (Number.isFinite(t)) time = Math.max(0, t); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const target of ping) target.dispose();
      for (const target of finals) target.dispose();
      for (const pass of passes) pass.material.dispose();
      resetMaterial.dispose();
      quad.dispose();
      spectrumTexture.dispose();
      displacement.value = null;
      derivative.value = null;
      grid.w = 0;
    },
  };
}
