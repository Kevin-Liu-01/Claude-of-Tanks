import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Scene Studio film accumulation (src/game/studioFilm.ts). Imported only by
 * the lazily loaded Studio chunk: battle and Garage never construct it.
 *
 * Inserted into the composer directly after the late-FX pass, where the
 * frame is still linear HDR: every opaque/transparent scene contribution of
 * one shutter sample is complete, and bloom, light FX, the display grade,
 * the picture finish, SMAA and reconstruction have not run yet. Each sample
 * is weighted into a 32-bit float target, so 64 HDR samples sum without the
 * half-float banding a composer buffer would add. The resolving sample writes
 * the average back into the chain; everything after this pass therefore runs
 * ONCE per output frame on the averaged image (motion-blurred highlights stay
 * hot through the tone curve, bloom streaks with them, grain is not averaged
 * away).
 */

const QUAD_VERTEX = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const ADD_FRAGMENT = /* glsl */`
uniform sampler2D tSample;
uniform float uWeight;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSample, vUv).rgb * uWeight, uWeight); }`;

// Fallback without EXT_float_blend: explicit ping-pong sum.
const SUM_FRAGMENT = /* glsl */`
uniform sampler2D tSample, tPrevious;
uniform float uWeight;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tPrevious, vUv) + vec4(texture2D(tSample, vUv).rgb * uWeight, uWeight);
}`;

const RESOLVE_FRAGMENT = /* glsl */`
uniform sampler2D tAccum;
uniform float uScale;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tAccum, vUv).rgb * uScale, 1.0); }`;

function accumulationTarget(width: number, height: number, name: string): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  target.texture.name = name;
  return target;
}

export type FilmAccumulateMode = 'accumulate' | 'resolve';

export class FilmAccumulatePass extends Pass {
  /** Weight of the next sample (equal-weight samples use 1 / N). */
  weight = 1;
  mode: FilmAccumulateMode = 'accumulate';
  /** Samples summed since the last begin(); probes and tests. */
  samples = 0;
  private weightSum = 0;
  private first = true;
  private readonly floatBlend: boolean;
  private target: THREE.WebGLRenderTarget;
  private spare: THREE.WebGLRenderTarget | null;
  private readonly addMaterial: THREE.ShaderMaterial;
  private readonly sumMaterial: THREE.ShaderMaterial;
  private readonly resolveMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly clearColor = new THREE.Color();

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
    super();
    this.needsSwap = false;
    // three requests the extension on first use; blending into RGBA32F is then legal.
    this.floatBlend = renderer.extensions.has('EXT_float_blend');
    this.target = accumulationTarget(width, height, 'FilmAccumulatePass.sum');
    this.spare = this.floatBlend ? null : accumulationTarget(width, height, 'FilmAccumulatePass.sumSpare');
    this.addMaterial = new THREE.ShaderMaterial({
      name: 'FilmAccumulatePass.add',
      uniforms: { tSample: { value: null }, uWeight: { value: 1 } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: ADD_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.sumMaterial = new THREE.ShaderMaterial({
      name: 'FilmAccumulatePass.sum',
      uniforms: { tSample: { value: null }, tPrevious: { value: null }, uWeight: { value: 1 } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: SUM_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });
    this.resolveMaterial = new THREE.ShaderMaterial({
      name: 'FilmAccumulatePass.resolve',
      uniforms: { tAccum: { value: this.target.texture }, uScale: { value: 1 } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: RESOLVE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });
    this.quad = new FullScreenQuad(this.addMaterial);
  }

  /** Start a new output frame: the next sample replaces the sum. */
  begin(): void {
    this.first = true;
    this.weightSum = 0;
    this.samples = 0;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, width), h = Math.max(1, height);
    if (this.target.width === w && this.target.height === h) return;
    this.target.setSize(w, h);
    this.spare?.setSize(w, h);
    this.begin();
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const previousTarget = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      if (this.floatBlend) {
        if (this.first) {
          renderer.getClearColor(this.clearColor);
          const alpha = renderer.getClearAlpha();
          renderer.setRenderTarget(this.target);
          renderer.setClearColor(0x000000, 0);
          renderer.clear(true, false, false);
          renderer.setClearColor(this.clearColor, alpha);
        }
        this.addMaterial.uniforms.tSample.value = readBuffer.texture;
        this.addMaterial.uniforms.uWeight.value = this.weight;
        this.quad.material = this.addMaterial;
        renderer.setRenderTarget(this.target);
        this.quad.render(renderer);
      } else {
        const spare = this.spare!;
        this.sumMaterial.uniforms.tSample.value = readBuffer.texture;
        this.sumMaterial.uniforms.tPrevious.value = this.target.texture;
        this.sumMaterial.uniforms.uWeight.value = this.weight;
        if (this.first) {
          renderer.getClearColor(this.clearColor);
          const alpha = renderer.getClearAlpha();
          renderer.setRenderTarget(this.target);
          renderer.setClearColor(0x000000, 0);
          renderer.clear(true, false, false);
          renderer.setClearColor(this.clearColor, alpha);
        }
        this.quad.material = this.sumMaterial;
        renderer.setRenderTarget(spare);
        this.quad.render(renderer);
        this.spare = this.target;
        this.target = spare;
      }
      this.first = false;
      this.weightSum += this.weight;
      this.samples++;
      if (this.mode === 'resolve') {
        this.resolveMaterial.uniforms.tAccum.value = this.target.texture;
        this.resolveMaterial.uniforms.uScale.value = this.weightSum > 0 ? 1 / this.weightSum : 0;
        this.quad.material = this.resolveMaterial;
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.quad.render(renderer);
        this.needsSwap = true;
      } else {
        this.needsSwap = false;
      }
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previousTarget);
    }
  }

  dispose(): void {
    this.target.dispose();
    this.spare?.dispose();
    this.addMaterial.dispose();
    this.sumMaterial.dispose();
    this.resolveMaterial.dispose();
    this.quad.dispose();
  }
}
