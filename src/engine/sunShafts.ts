/**
 * sunShafts.ts — round 69 (2026-09-24): screen-space sun shafts (crepuscular rays) at quarter resolution.
 *
 * Mittring (2007, "Finding next gen — CryEngine 2") and Sousa (2008, "Crysis next gen effects"): the sky around the
 * sun is the light source, everything in front of it an occluder, and a radial blur of that occlusion mask toward
 * the sun's screen position integrates the in-scatter along each pixel's line to the sun — the streaks through a
 * treeline, a ridge or a gorge wall. Three quarter-resolution draws:
 *
 *   1. mask     — sky (device depth at the far plane) × a radial falloff around the sun's screen position, one
 *                 depth fetch per texel (the round-68 cloud lane may multiply a cloud transmittance in here);
 *   2. blur ×2  — twelve taps along the segment from the texel to the sun with exponential decay, the first pass
 *                 spanning the whole segment, the second a twelfth of it (144 effective samples);
 *   3. write    — the blurred mask × the shaft colour × strength into the light target the grade adds to the
 *                 frame before its tonemap (post.ts). The lens flare (lensFlare.ts) adds into the same target.
 *
 * Colour: the atmosphere's sun transmittance (round 65's summary — warm and dim at a low sun, white at noon) under
 * a slight warm tint; the legacy sun colour when the physical sky is not showing. Strength: the per-map haze law
 * `sunShaftMapStrength` (the receipt's table) — the aerosol the sky preset asks for (turbidity × mieCoefficient,
 * round 65's mie mapping) or the fog density, whichever is stronger, × a low-sun factor (long paths through the
 * near air; a high sun gets nearly none) × the day factor (no moon shafts) — × the sun-in-frame fade (the sun may
 * sit a little outside the frame: its rays still enter it). Nothing runs while the strength is zero except a
 * clear of the light target.
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { AtmospherePublishedState } from './sky.ts';
import type { PublishedLightRig } from './contactShadows.ts';

export const SUN_SHAFT_TAPS = 12;
export const SUN_SHAFT_DECAY = 0.90;
export const SUN_SHAFT_SPANS = Object.freeze([1.0, 1 / SUN_SHAFT_TAPS]);
/** Radius of the sky region around the sun that feeds the shafts (screen-height units, aspect corrected). */
export const SUN_SHAFT_MASK_RADIUS = 0.62;
/** Linear HDR gain of the fully lit shaft field (the sky near the sun sits around 1.0–1.45). */
export const SUN_SHAFT_GAIN = 0.34;
export const SUN_SHAFT_TINT = Object.freeze([1.0, 0.93, 0.80] as const);
/** The sun may leave the frame by this much (NDC) before the rays fade out. */
export const SUN_SHAFT_FRAME_FADE = Object.freeze([1.0, 1.55] as const);
/** Sun elevation band over which the shafts fade out (degrees): long near-air paths below, nearly none above. */
export const SUN_SHAFT_ELEVATION_FADE_DEG = Object.freeze([26, 46] as const);
/** Aerosol proxy band (turbidity × mieCoefficient × 40, round 65's mie mapping without its 1.25). */
export const SUN_SHAFT_AEROSOL_BAND = Object.freeze([0.6, 2.2] as const);
/** Fog density band (1/m). */
export const SUN_SHAFT_FOG_BAND = Object.freeze([0.0004, 0.0009] as const);
/** The dome's night law (sky.ts nightAmount): full night at .08, none from .30 up. */
const NIGHT_FULL = 0.08, NIGHT_TOP = 0.30;

export interface SunShaftSkyInputs {
  fogDensity: number;
  turbidity: number;
  mieCoefficient: number;
  sunElevationDeg: number;
  skyIntensity: number;
}

const clamp01 = (x: number): number => THREE.MathUtils.clamp(x, 0, 1);

/** 1 by day, 0 under the full night dome (the same two constants as the dome's own night amount). */
export function sunShaftDayFactor(skyIntensity: number): number {
  return 1 - clamp01((NIGHT_TOP - skyIntensity) / (NIGHT_TOP - NIGHT_FULL));
}

/** The haze the preset asks for: aerosol or fog, whichever is stronger. */
export function sunShaftHaze(inputs: Pick<SunShaftSkyInputs, 'fogDensity' | 'turbidity' | 'mieCoefficient'>): number {
  const aerosol = clamp01((inputs.turbidity * inputs.mieCoefficient * 40 - SUN_SHAFT_AEROSOL_BAND[0])
    / (SUN_SHAFT_AEROSOL_BAND[1] - SUN_SHAFT_AEROSOL_BAND[0]));
  const fog = clamp01((inputs.fogDensity - SUN_SHAFT_FOG_BAND[0]) / (SUN_SHAFT_FOG_BAND[1] - SUN_SHAFT_FOG_BAND[0]));
  return Math.max(aerosol, fog);
}

/** Low-sun factor: 1 up to 26°, 0 from 46°. */
export function sunShaftElevationFactor(sunElevationDeg: number): number {
  return 1 - THREE.MathUtils.smoothstep(sunElevationDeg, SUN_SHAFT_ELEVATION_FADE_DEG[0], SUN_SHAFT_ELEVATION_FADE_DEG[1]);
}

/** Per-map strength in [0, 1]: haze × low sun × day. */
export function sunShaftMapStrength(inputs: SunShaftSkyInputs): number {
  return sunShaftHaze(inputs) * sunShaftElevationFactor(inputs.sunElevationDeg) * sunShaftDayFactor(inputs.skyIntensity);
}

/** Fade with the sun's NDC position: 1 inside the frame, 0 once it is more than half a frame outside. */
export function sunShaftFrameFade(ndcX: number, ndcY: number, ahead: boolean): number {
  if (!ahead) return 0;
  const edge = Math.max(Math.abs(ndcX), Math.abs(ndcY));
  return 1 - THREE.MathUtils.smoothstep(edge, SUN_SHAFT_FRAME_FADE[0], SUN_SHAFT_FRAME_FADE[1]);
}

export interface SunScreenState {
  /** Sun screen position in uv (0..1, y up) — valid when `ahead`. */
  uv: THREE.Vector2;
  /** The sun is in front of the camera. */
  ahead: boolean;
  ndc: THREE.Vector2;
}

const _sunPoint = new THREE.Vector3();
const _forward = new THREE.Vector3();

/** Project the world sun direction through the camera (shared by the shafts and the flare). */
export function projectSunToScreen(camera: THREE.Camera, sunDir: THREE.Vector3, out: SunScreenState): SunScreenState {
  _forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  out.ahead = _forward.dot(sunDir) > 0.02;
  if (!out.ahead) {
    out.ndc.set(0, 0);
    out.uv.set(0.5, 0.5);
    return out;
  }
  _sunPoint.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
  out.ndc.set(_sunPoint.x, _sunPoint.y);
  out.uv.set(_sunPoint.x * 0.5 + 0.5, _sunPoint.y * 0.5 + 0.5);
  return out;
}

const QUAD_VERTEX = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const MASK_FRAGMENT = /* glsl */`
uniform sampler2D tDepth;
uniform vec2 uSun;
uniform float uAspect;
varying vec2 vUv;
void main() {
  float sky = step( 0.9999999, texture2D( tDepth, vUv ).x );
  vec2 q = ( vUv - uSun ) * vec2( uAspect, 1.0 );
  float w = 1.0 - smoothstep( 0.0, ${SUN_SHAFT_MASK_RADIUS.toFixed(3)}, length( q ) );
  gl_FragColor = vec4( sky * w, 0.0, 0.0, 1.0 );
}`;

const BLUR_FRAGMENT = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uSpan;
varying vec2 vUv;
void main() {
  vec2 stepUv = ( uSun - vUv ) * ( uSpan / ${SUN_SHAFT_TAPS.toFixed(1)} );
  vec2 uv = vUv;
  float acc = 0.0, wsum = 0.0, w = 1.0;
  for ( int i = 0; i < ${SUN_SHAFT_TAPS}; i++ ) {
    acc += texture2D( tSrc, uv ).r * w;
    wsum += w;
    w *= ${SUN_SHAFT_DECAY.toFixed(3)};
    uv += stepUv;
  }
  gl_FragColor = vec4( acc / wsum, 0.0, 0.0, 1.0 );
}`;

const WRITE_FRAGMENT = /* glsl */`
uniform sampler2D tSrc;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4( uColor * texture2D( tSrc, vUv ).r, 1.0 );
}`;

function quarterTarget(width: number, height: number, name: string): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
  });
  target.texture.name = name;
  return target;
}

function material(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, name: string): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms, vertexShader: QUAD_VERTEX, fragmentShader,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  m.name = name;
  return m;
}

/** The light target the shafts write and the flare adds into: quarter resolution, linear HDR. */
export function createLightFxTarget(width: number, height: number): THREE.WebGLRenderTarget {
  return quarterTarget(Math.round(width / 4), Math.round(height / 4), 'PostLightFx.light');
}

export class SunShaftsPass extends Pass {
  readonly output: THREE.WebGLRenderTarget;
  private readonly mask: THREE.WebGLRenderTarget;
  private readonly ping: THREE.WebGLRenderTarget;
  private readonly maskMaterial: THREE.ShaderMaterial;
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly writeMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly camera: THREE.Camera;
  private readonly scene: THREE.Scene;
  readonly sun: SunScreenState = { uv: new THREE.Vector2(0.5, 0.5), ahead: false, ndc: new THREE.Vector2() };
  /** Strength this frame after every fade (probes); 0 = the pass only clears the light target. */
  strength = 0;
  /** The per-map law's value this frame (probes). */
  mapStrength = 0;
  /** Effect lever (postLightFxPolicy); the pass still clears the light target when off but enabled. */
  active = false;
  readonly color = new THREE.Color(1, 1, 1);

  constructor(
    camera: THREE.Camera, scene: THREE.Scene, depthTexture: THREE.DepthTexture, output: THREE.WebGLRenderTarget,
    width: number, height: number,
  ) {
    super();
    this.needsSwap = false;
    this.camera = camera;
    this.scene = scene;
    this.output = output;
    const w = Math.max(1, Math.round(width / 4)), h = Math.max(1, Math.round(height / 4));
    this.mask = quarterTarget(w, h, 'SunShafts.mask');
    this.ping = quarterTarget(w, h, 'SunShafts.blur');
    this.maskMaterial = material(MASK_FRAGMENT, {
      tDepth: { value: depthTexture }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 16 / 9 },
    }, 'SunShafts.mask');
    this.blurMaterial = material(BLUR_FRAGMENT, {
      tSrc: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uSpan: { value: 1 },
    }, 'SunShafts.blur');
    this.writeMaterial = material(WRITE_FRAGMENT, {
      tSrc: { value: null }, uColor: { value: new THREE.Vector3(1, 1, 1) },
    }, 'SunShafts.write');
    this.quad = new FullScreenQuad(this.maskMaterial);
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width / 4)), h = Math.max(1, Math.round(height / 4));
    this.mask.setSize(w, h);
    this.ping.setSize(w, h);
    if (this.output.width !== w || this.output.height !== h) this.output.setSize(w, h);
  }

  /** Per frame, before the composer renders: the sun on screen, the map law, the colour. */
  update(active: boolean): void {
    this.active = active;
    const scene = this.scene;
    const sunDir = scene.userData.sunDirWorld as THREE.Vector3 | undefined;
    if (!active || !sunDir) {
      this.strength = 0;
      return;
    }
    projectSunToScreen(this.camera, sunDir, this.sun);
    const inputs = scene.userData.skyHazeInputs as SunShaftSkyInputs | undefined;
    const atmosphere = scene.userData.atmosphere as AtmospherePublishedState | undefined;
    const elevationDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(sunDir.y, -1, 1)));
    this.mapStrength = sunShaftMapStrength({
      fogDensity: inputs?.fogDensity ?? (scene.fog as THREE.FogExp2 | null)?.density ?? 0.0006,
      turbidity: inputs?.turbidity ?? 4,
      mieCoefficient: inputs?.mieCoefficient ?? 0.006,
      sunElevationDeg: inputs?.sunElevationDeg ?? elevationDeg,
      skyIntensity: inputs?.skyIntensity ?? atmosphere?.skyIntensity ?? 1,
    });
    this.strength = this.mapStrength * sunShaftFrameFade(this.sun.ndc.x, this.sun.ndc.y, this.sun.ahead);
    const rig = scene.userData.lightRig as PublishedLightRig | undefined;
    const transmittance = atmosphere?.active ? atmosphere.summary?.sunTransmittance : null;
    if (transmittance) this.color.copy(transmittance);
    else if (rig) this.color.copy(rig.sunColor);
    else this.color.setRGB(1, 1, 1);
    this.color.multiply(new THREE.Color(...SUN_SHAFT_TINT));
  }

  render(renderer: THREE.WebGLRenderer): void {
    const previousTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      if (!(this.strength > 0.003)) {
        renderer.setRenderTarget(this.output);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
        return;
      }
      const aspect = (this.camera as THREE.PerspectiveCamera).aspect || (this.output.width / Math.max(1, this.output.height));
      const mu = this.maskMaterial.uniforms;
      mu.uSun.value.copy(this.sun.uv);
      mu.uAspect.value = aspect;
      this.quad.material = this.maskMaterial;
      renderer.setRenderTarget(this.mask);
      this.quad.render(renderer);
      const bu = this.blurMaterial.uniforms;
      bu.uSun.value.copy(this.sun.uv);
      let source = this.mask, destination = this.ping;
      for (const span of SUN_SHAFT_SPANS) {
        bu.tSrc.value = source.texture;
        bu.uSpan.value = span;
        this.quad.material = this.blurMaterial;
        renderer.setRenderTarget(destination);
        this.quad.render(renderer);
        const swap = source; source = destination; destination = swap;
      }
      const wu = this.writeMaterial.uniforms;
      wu.tSrc.value = source.texture;
      const k = SUN_SHAFT_GAIN * this.strength;
      wu.uColor.value.set(this.color.r * k, this.color.g * k, this.color.b * k);
      this.quad.material = this.writeMaterial;
      renderer.setRenderTarget(this.output);
      this.quad.render(renderer);
    } finally {
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(previousTarget);
    }
  }

  dispose(): void {
    this.mask.dispose();
    this.ping.dispose();
    this.maskMaterial.dispose();
    this.blurMaterial.dispose();
    this.writeMaterial.dispose();
    this.quad.dispose();
  }
}
