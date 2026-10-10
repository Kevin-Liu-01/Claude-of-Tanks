/**
 * lensFlare.ts — round 69 (2026-09-24): a restrained lens flare from the sun's screen position.
 *
 * A camera lens flares because light from a bright source reflects between its elements: each pair of surfaces
 * images the aperture once more along the line from the source through the image centre (the ghosts), a wide
 * dispersive ring forms about the centre (the halo), and an anamorphic or dirty front element draws a streak
 * through the source. Hullin et al. (2011, "Physically-based real-time lens flare rendering") trace those paths
 * through a real lens prescription; this is the simplified procedural form every game ships: four ghosts on the
 * flipped axis with soft bodies, a faint rim and per-channel dispersion, one dispersive halo, one thin streak and
 * a small glow — all analytic, evaluated at quarter resolution into the light target the sun shafts write and the
 * grade adds before its tonemap (post.ts).
 *
 * Occlusion: a 1 × 1 pass samples the resolved scene depth on a golden-angle spiral over the sun's disc (24 taps,
 * `LENS_FLARE_DISC_DEG` across — wider than the disc so a treeline or a turret crossing the sun dims the flare
 * progressively) and eases the visible fraction toward its target over ~70 ms (a two-target ping-pong holds the
 * eased value), so the flare fades behind terrain and tanks without popping. The flare also fades over the last
 * ten percent before the frame edge and never shows for a sun behind the camera; under the night dome the moon is
 * the key light and flares at `LENS_FLARE_MOON` of the sun's strength. Colour: the atmosphere's sun transmittance
 * (round 65) or the legacy sun colour. `lensFlareVisibility` is the CPU twin of the occlusion pass (the receipt).
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { AtmospherePublishedState } from './sky.ts';
import type { PublishedLightRig } from './contactShadows.ts';
import { projectSunToScreen, sunShaftDayFactor, type SunScreenState } from './sunShafts.ts';
import { lightTune } from './lightModelCore.ts';

export const LENS_FLARE_VIS_TAPS = 24;
/** Angular diameter of the visibility disc (degrees; the sun disc itself is 0.53°). */
export const LENS_FLARE_DISC_DEG = 1.6;
/** Linear HDR gain of the whole flare for a fully visible noon sun. */
export const LENS_FLARE_GAIN = 0.05;
/** The moon's share of the sun's flare under the night dome. */
export const LENS_FLARE_MOON = 0.12;
/** Visibility easing rate (1/s). */
export const LENS_FLARE_EASE_RATE = 14;
/** Fade over the last tenth of the frame before the sun leaves it (NDC). */
export const LENS_FLARE_EDGE_FADE = 0.1;

export interface LensFlareGhost {
  /** Position along the axis: 1 at the sun, 0 at the image centre, negative past it. */
  readonly a: number;
  /** Radius in screen-height units. */
  readonly r: number;
  readonly tint: readonly [number, number, number];
  readonly k: number;
}

export const LENS_FLARE_GHOSTS: readonly LensFlareGhost[] = Object.freeze([
  { a: 0.62, r: 0.030, tint: [1.0, 0.86, 0.62], k: 0.50 },
  { a: 0.30, r: 0.055, tint: [0.60, 0.90, 1.0], k: 0.30 },
  { a: -0.25, r: 0.085, tint: [0.62, 0.78, 1.0], k: 0.20 },
  { a: -0.62, r: 0.040, tint: [1.0, 0.74, 0.86], k: 0.36 },
]);
export const LENS_FLARE_HALO_RADIUS = 0.42;
/**
 * 2026-10-04 (the gauntlet's wave 65 on Caldera's e-wall-300: "a translucent circular lens-flare artifact sits directly on
 * top of the mountain silhouette … breaking the solidity of the backlit ridge"): the sun stood above the ridge, so the
 * occlusion pass rightly drew the flare; what read as an artifact were the parts laid over the dark ridge — the halo's ring
 * (it carried most of the flare's visible pixels: 1.5 % of the frame over 3 levels with it, 0.3 % without) and the small
 * far ghost. Each part's share of the flare: the ghosts and the halo turned down, the streak and the glow at the sun kept.
 */
export const LENS_FLARE_PARTS = Object.freeze({ ghosts: 0.4, halo: 0.25, streak: 1, glow: 1 });

const clamp01 = (x: number): number => THREE.MathUtils.clamp(x, 0, 1);

/** In-frame fade from the sun's NDC position. */
export function lensFlareFrameFade(ndcX: number, ndcY: number, ahead: boolean): number {
  if (!ahead) return 0;
  const edge = Math.max(Math.abs(ndcX), Math.abs(ndcY));
  return clamp01((1 - edge) / LENS_FLARE_EDGE_FADE);
}

/** The golden-angle spiral over the unit disc the occlusion pass samples (uv offsets before the disc scale). */
export function lensFlareTapOffsets(taps = LENS_FLARE_VIS_TAPS): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < taps; i++) {
    const r = Math.sqrt((i + 0.5) / taps);
    const t = i * 2.39996323;
    out.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return out;
}

/** The visibility disc radius in uv (y axis) for a camera: half the disc's angular size over the half fov. */
export function lensFlareDiscRadiusUv(fovDeg: number): number {
  return Math.tan(THREE.MathUtils.degToRad(LENS_FLARE_DISC_DEG * 0.5)) / Math.tan(THREE.MathUtils.degToRad(fovDeg * 0.5)) * 0.5;
}

/**
 * CPU twin of the occlusion pass: the fraction of the taps that see the sky (`isSky(u, v)` over uv), times the
 * sun's height, in-frame and day factors.
 */
export function lensFlareVisibility(
  sunUv: [number, number], radiusUv: number, aspect: number, isSky: (u: number, v: number) => boolean,
  factors: { up: number; inFrame: number },
  cloudTransmittance: (u: number, v: number) => number = () => 1,
): number {
  let sky = 0;
  for (const [ox, oy] of lensFlareTapOffsets()) {
    if (isSky(sunUv[0] + ox * radiusUv / aspect, sunUv[1] + oy * radiusUv)) sky++;
  }
  // 2026-10-04: the clouds' transmittance toward the sun, over the centre and four taps on the disc's rim, through
  // lensFlareCloudGate (a veil the sun still burns through keeps the flare; a closed deck takes it all)
  let clouds = 0;
  for (const [ox, oy] of LENS_FLARE_CLOUD_TAPS) clouds += lensFlareCloudGate(cloudTransmittance(sunUv[0] + ox * radiusUv / aspect, sunUv[1] + oy * radiusUv));
  return (sky / LENS_FLARE_VIS_TAPS) * (clouds / LENS_FLARE_CLOUD_TAPS.length) * clamp01(factors.up) * clamp01(factors.inFrame);
}
/**
 * The flare's share at a cloud transmittance toward the sun: smoothstep(0, LENS_FLARE_CLOUD_FULL, T). Measured on the pair:
 * Redrock's sun behind cirrus at T ≈ 0.09 and Caldera's at ≈ 0.18 still show a white disc (the disc is tens of thousands of
 * times the sky), so their flare stays most of the way (0.30, 0.79); a closed deck (T 0 after the opaque cut) takes it all.
 */
export const LENS_FLARE_CLOUD_FULL = 0.25;
export function lensFlareCloudGate(t: number): number {
  const x = clamp01(t / LENS_FLARE_CLOUD_FULL);
  return x * x * (3 - 2 * x);
}
/** The cloud-transmittance taps over the visibility disc (uv offsets before the disc scale): the centre and its rim. */
export const LENS_FLARE_CLOUD_TAPS: ReadonlyArray<readonly [number, number]> = Object.freeze([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]);

/** Easing step toward the target visibility over dt seconds. */
export function lensFlareEase(previous: number, target: number, dt: number): number {
  return THREE.MathUtils.lerp(previous, target, 1 - Math.exp(-Math.min(dt, 0.1) * LENS_FLARE_EASE_RATE));
}

const QUAD_VERTEX = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const f = (x: number): string => x.toFixed(6);

function visibilityFragment(): string {
  const taps = lensFlareTapOffsets().map(([x, y]) =>
    `  sky += step( 0.9999999, texture2D( tDepth, uSun + vec2( ${f(x)}, ${f(y)} ) * uDisc ).x );`).join('\n');
  const cloudTaps = LENS_FLARE_CLOUD_TAPS.map(([x, y]) =>
    `    clouds += smoothstep( 0.0, ${f(LENS_FLARE_CLOUD_FULL)}, texture2D( tClouds, uSun + vec2( ${f(x)}, ${f(y)} ) * uDisc ).a );`).join('\n');
  return /* glsl */`
uniform sampler2D tDepth;
uniform sampler2D tPrev;
uniform vec2 uSun;
uniform vec2 uDisc;
uniform float uTarget;
uniform float uBlend;
// 2026-10-04 (wave 71: the flare drew under Titan Gorge's closed deck): the resolved cloud history (alpha = the clouds'
// transmittance along the view ray; volumetricClouds.ts historyTexture) and whether it is bound
uniform sampler2D tClouds;
uniform float uCloudsOn;
void main() {
  float sky = 0.0;
${taps}
  float clouds = 1.0;
  if ( uCloudsOn > 0.5 ) {
    clouds = 0.0;
${cloudTaps}
    clouds /= ${LENS_FLARE_CLOUD_TAPS.length.toFixed(1)};
  }
  float target = ( sky / ${LENS_FLARE_VIS_TAPS.toFixed(1)} ) * clouds * uTarget;
  float previous = texture2D( tPrev, vec2( 0.5 ) ).r;
  gl_FragColor = vec4( mix( previous, target, uBlend ), 0.0, 0.0, 1.0 );
}`;
}

function flareFragment(): string {
  const ghosts = LENS_FLARE_GHOSTS.map((g) => /* glsl */`
  {
    vec2 gp = p - s * ${f(g.a)};
    float d = length( gp );
    vec3 body = vec3( smoothstep( ${f(g.r * 0.97)}, ${f(g.r * 0.97 * 0.72)}, d ),
      smoothstep( ${f(g.r)}, ${f(g.r * 0.72)}, d ), smoothstep( ${f(g.r * 1.03)}, ${f(g.r * 1.03 * 0.72)}, d ) );
    float rim = smoothstep( ${f(g.r * 0.55)}, ${f(g.r)}, d ) * 0.6 + 0.4;
    ghosts += body * rim * vec3( ${g.tint.map(f).join(', ')} ) * ${f(g.k)};
  }`).join('');
  return /* glsl */`
uniform sampler2D tVis;
uniform vec2 uSun;
uniform float uAspect;
uniform vec3 uColor;
// 2026-10-04 (QA: LENS_FLARE_PART_GHOSTS / _HALO / _STREAK / _GLOW): each part's share of the flare
uniform vec4 uParts;
varying vec2 vUv;
void main() {
  float vis = texture2D( tVis, vec2( 0.5 ) ).r;
  if ( vis <= 0.001 ) { gl_FragColor = vec4( 0.0 ); return; }
  vec2 p = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
  vec2 s = ( uSun - 0.5 ) * vec2( uAspect, 1.0 );
  vec3 ghosts = vec3( 0.0 );${ghosts}
  // the ghosts collapse onto the sun at the image centre and vanish there
  ghosts *= smoothstep( 0.03, 0.22, length( s ) );
  // a dispersive ring about the image centre, stronger as the sun nears the edge
  float rc = length( p );
  vec3 halo = vec3( smoothstep( 0.035, 0.0, abs( rc - ${f(LENS_FLARE_HALO_RADIUS - 0.012)} ) ),
    smoothstep( 0.035, 0.0, abs( rc - ${f(LENS_FLARE_HALO_RADIUS)} ) ),
    smoothstep( 0.035, 0.0, abs( rc - ${f(LENS_FLARE_HALO_RADIUS + 0.014)} ) ) )
    * smoothstep( 0.22, 0.72, length( s ) ) * 0.22;
  // a thin streak through the sun and a small glow around it
  vec2 q = p - s;
  float streak = exp( -( q.x * q.x ) * 7.0 ) * exp( -( q.y * q.y ) * 3200.0 ) * 0.55;
  float glow = exp( -length( q ) * 9.0 ) * 0.30;
  gl_FragColor = vec4( uColor * vis * ( ghosts * uParts.x + halo * uParts.y + vec3( streak * uParts.z + glow * uParts.w ) ), 1.0 );
}`;
}

function tinyTarget(name: string): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
  });
  target.texture.name = name;
  return target;
}

export class LensFlarePass extends Pass {
  readonly output: THREE.WebGLRenderTarget;
  private visPrev: THREE.WebGLRenderTarget;
  private visCur: THREE.WebGLRenderTarget;
  private readonly visMaterial: THREE.ShaderMaterial;
  private readonly flareMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly scene: THREE.Scene;
  readonly sun: SunScreenState = { uv: new THREE.Vector2(0.5, 0.5), ahead: false, ndc: new THREE.Vector2() };
  readonly color = new THREE.Color(1, 1, 1);
  /** Target visibility before easing (probes): sun height × in-frame × day/moon. */
  target = 0;
  /** Effect lever (postLightFxPolicy). */
  active = false;
  /** post.ts: clear the shared light target first when the shafts pass did not run this frame. */
  clearTarget = false;
  /**
   * Scene Studio film renderer only: ease the visibility by this step (seconds)
   * instead of the wall-clock gap, so offline frames are deterministic. Null
   * (every live path) keeps the measured cadence.
   */
  fixedDt: number | null = null;
  private dt = 1 / 60;
  private lastMs = -1e9;
  /** The clock the visibility eases on (ms): the wall clock, or the Studio's export clock (setClock). */
  private clock: (() => number) | null = null;
  /** The next visibility render jumps to its target (a clip's start: no history from the last clip or page). */
  private snapNext = false;

  constructor(
    camera: THREE.PerspectiveCamera, scene: THREE.Scene, depthTexture: THREE.DepthTexture, output: THREE.WebGLRenderTarget,
  ) {
    super();
    this.needsSwap = false;
    this.camera = camera;
    this.scene = scene;
    this.output = output;
    this.visPrev = tinyTarget('LensFlare.visA');
    this.visCur = tinyTarget('LensFlare.visB');
    this.visMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: depthTexture }, tPrev: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) },
        uDisc: { value: new THREE.Vector2(0.01, 0.01) }, uTarget: { value: 0 }, uBlend: { value: 1 },
        tClouds: { value: null }, uCloudsOn: { value: 0 },
      },
      vertexShader: QUAD_VERTEX, fragmentShader: visibilityFragment(),
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.visMaterial.name = 'LensFlare.visibility';
    this.flareMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tVis: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 16 / 9 },
        uColor: { value: new THREE.Vector3(1, 1, 1) },
        uParts: { value: new THREE.Vector4(LENS_FLARE_PARTS.ghosts, LENS_FLARE_PARTS.halo, LENS_FLARE_PARTS.streak, LENS_FLARE_PARTS.glow) },
      },
      vertexShader: QUAD_VERTEX, fragmentShader: flareFragment(),
      depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
    });
    this.flareMaterial.name = 'LensFlare.flare';
    this.quad = new FullScreenQuad(this.visMaterial);
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width / 4)), h = Math.max(1, Math.round(height / 4));
    if (this.output.width !== w || this.output.height !== h) this.output.setSize(w, h);
  }

  /**
   * The Studio's offline export (2026-10-08, fifo2 twins: with the flare on, two runs of a clip whose smoke crossed the
   * sun differed at 2.4 % of pixels): the visibility eases on the export clock instead of the wall clock, so a render at
   * the same clock instant eases by nothing and each timeline step eases once, whatever the live renders between steps
   * and however loaded the machine. null: the wall clock again. Either way the next render snaps to its target.
   */
  setClock(nowMs: (() => number) | null): void {
    this.clock = nowMs;
    this.lastMs = -1e9;
    this.snapNext = true;
  }

  /** The next render jumps to its target (a clip's start or a seek). */
  snap(): void {
    this.snapNext = true;
  }

  /** Per frame, before the composer renders. */
  update(active: boolean): void {
    this.active = active;
    const now = this.clock ? this.clock() : performance.now();
    this.dt = this.fixedDt ?? (this.lastMs < -1e8 ? 1 / 60 : Math.min(0.1, Math.max(0, (now - this.lastMs) / 1000)));
    this.lastMs = now;
    const sunDir = this.scene.userData.sunDirWorld as THREE.Vector3 | undefined;
    if (!active || !sunDir) {
      this.target = 0;
      return;
    }
    projectSunToScreen(this.camera, sunDir, this.sun);
    const atmosphere = this.scene.userData.atmosphere as AtmospherePublishedState | undefined;
    const skyIntensity = atmosphere?.skyIntensity ?? 1;
    const day = sunShaftDayFactor(skyIntensity);
    const up = THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.04);
    this.target = up * lensFlareFrameFade(this.sun.ndc.x, this.sun.ndc.y, this.sun.ahead)
      * THREE.MathUtils.lerp(LENS_FLARE_MOON, 1, day);
    const rig = this.scene.userData.lightRig as PublishedLightRig | undefined;
    const transmittance = atmosphere?.active ? atmosphere.summary?.sunTransmittance : null;
    if (transmittance) this.color.copy(transmittance);
    else if (rig) this.color.copy(rig.sunColor);
    else this.color.setRGB(1, 1, 1);
    // 2026-10-04: the clouds' transmittance toward the sun joins the eased visibility (a closed deck draws no flare)
    const clouds = (this.scene.userData.volumetricClouds as { historyTexture?: THREE.Texture | null } | undefined)?.historyTexture ?? null;
    this.visMaterial.uniforms.tClouds.value = clouds;
    this.visMaterial.uniforms.uCloudsOn.value = clouds && lightTune('LENS_FLARE_CLOUD_GATE', 1) > 0 ? 1 : 0;
    (this.flareMaterial.uniforms.uParts.value as THREE.Vector4).set(lightTune('LENS_FLARE_PART_GHOSTS', LENS_FLARE_PARTS.ghosts),
      lightTune('LENS_FLARE_PART_HALO', LENS_FLARE_PARTS.halo), lightTune('LENS_FLARE_PART_STREAK', LENS_FLARE_PARTS.streak),
      lightTune('LENS_FLARE_PART_GLOW', LENS_FLARE_PARTS.glow));
  }

  render(renderer: THREE.WebGLRenderer): void {
    const previousTarget = renderer.getRenderTarget();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      if (this.clearTarget) {
        renderer.setRenderTarget(this.output);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
      }
      if (!this.active) return;
      // 1 × 1 eased visibility (runs even at target 0 so the flare fades out through the same easing)
      const vu = this.visMaterial.uniforms;
      const aspect = this.camera.aspect || 16 / 9;
      const radius = lensFlareDiscRadiusUv(this.camera.fov || 55);
      vu.uSun.value.copy(this.sun.uv);
      vu.uDisc.value.set(radius / aspect, radius);
      vu.uTarget.value = this.target;
      vu.uBlend.value = this.snapNext ? 1 : 1 - Math.exp(-this.dt * LENS_FLARE_EASE_RATE);
      this.snapNext = false;
      vu.tPrev.value = this.visPrev.texture;
      this.quad.material = this.visMaterial;
      renderer.setRenderTarget(this.visCur);
      this.quad.render(renderer);
      const swap = this.visPrev; this.visPrev = this.visCur; this.visCur = swap;
      if (!(this.target > 0.001)) return;
      const fu = this.flareMaterial.uniforms;
      fu.tVis.value = this.visPrev.texture;
      fu.uSun.value.copy(this.sun.uv);
      fu.uAspect.value = aspect;
      fu.uColor.value.set(this.color.r * LENS_FLARE_GAIN, this.color.g * LENS_FLARE_GAIN, this.color.b * LENS_FLARE_GAIN);
      this.quad.material = this.flareMaterial;
      renderer.setRenderTarget(this.output);
      this.quad.render(renderer);
    } finally {
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(previousTarget);
    }
  }

  dispose(): void {
    this.visPrev.dispose();
    this.visCur.dispose();
    this.visMaterial.dispose();
    this.flareMaterial.dispose();
    this.quad.dispose();
  }
}
