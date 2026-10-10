/**
 * takramClouds.ts — TRIAL ONLY (branch trial/takram-clouds, 2026-10-09; the owner: "we should also be trying those new
 * three js clouds from that one github"). `?clouds=takram` swaps the volumetric layer's march for Takram's
 * @takram/three-clouds (MIT; github.com/takram-design-engineering/three-geospatial, packages/clouds) on the desktop tier,
 * so the gauntlet can compare frames and v3 can price it. sky.ts loads this module only through `import()` behind the
 * switch: no boot chunk carries it, phones never create the layer, and nothing changes without the switch.
 *
 * The layer object stays ours. sky.ts keeps driving it (presets, noise, warm), post.ts keeps calling
 * `beforeSceneRender` at the top of its frame, and the lens flare, the sun shafts, the horizon and the capture tools keep
 * reading it. installTakramClouds gives that one instance a prototype (over VolumetricCloudLayer's) whose march is
 * Takram's CloudsEffect.update — its Beer shadow map cascades, its 1/16 trace and temporal upscale — and whose dome (ours,
 * depth-tested in the scene's transparent queue) composites Takram's resolved overlay converted to our history
 * convention: premultiplied radiance × TAKRAM_EXPOSURE (their relative-luminance units to our sky units), alpha = the
 * view ray's transmittance. The cloud shade map the lit materials read (cloudShadeMap.ts) is cut from Takram's Beer shadow
 * map, so the ground's cloud shadows fall under the clouds drawn. Takram's own aerial-perspective effect, sky and haze are
 * not used (our aerial pass stays); its light shafts are off (our sun shafts stay).
 *
 * Frame: Takram works in ECEF on WGS84. Our world (metres, +Y up, ground near y = 0) is placed on the ellipsoid at
 * TAKRAM_SITE (+X east, +Y up, +Z south); cloud altitudes are our preset's base and thickness. Night (the key light is the
 * moon) and a missing preset fall back to our own layer, as does every frame before Takram's atmosphere tables exist.
 *
 * Runtime stays self-contained (docs/ATTRIBUTION.md): no default texture URL is ever used — the weather, shape, detail
 * and turbulence textures are Takram's procedural generators, the atmosphere tables come from its GPU generator, and the
 * spatiotemporal noise is our own blue-noise tile (takramBlue128.bin: cloudNoise.ts bakeCloudBlueNoise(128, 0x7a4b1c3d))
 * swept through time by the golden ratio.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import {
  CloudsEffect, CloudShape, CloudShapeDetail, LocalWeather, Turbulence, type CloudsQualityPreset,
} from '@takram/three-clouds';
import { PrecomputedTexturesGenerator } from '@takram/three-atmosphere';
import { Ellipsoid, Geodetic } from '@takram/three-geospatial';
import { publishCloudShade, type CloudShadeUniforms } from './cloudShadeMap.ts';
import { resolvePresetName } from './quality.ts';
import type { CloudLayerPreset } from './cloudPresets.ts';
import type { AtmospherePublishedState } from './sky.ts';
import {
  CLOUD_FAR_SHADE_EVERY, CLOUD_FAR_SHADE_SIZE, CLOUD_FAR_SHADE_SPAN_M, CLOUD_SHADOW_CORE, type VolumetricCloudLayer,
} from './volumetricClouds.ts';

/**
 * Takram's relative-luminance radiance to our sky units. Our trace lights the clouds with the sun at 8 × its
 * transmittance (volumetricClouds.ts applyAtmosphereUniforms: "the sun's irradiance in the sky's own units"); Takram's
 * Earth sun at the top of the atmosphere is (1.474, 1.850, 1.912) in radiance × its radiance-to-relative-luminance
 * weights, luminance ≈ 1.75. 8 / 1.75 ≈ 4.6 — the analytic start; the trial calibrates it once on Verdant and freezes it.
 */
export const TAKRAM_EXPOSURE = 4.6;
/** A still's settle (frames at dt 0): three full 4 × 4 Bayer cycles of the temporal upscale and the shadow pass's resolve. */
export const TAKRAM_SETTLE_FRAMES = 48;
/** Where our world sits on WGS84 (degrees): mid-latitude, far from the cube-sphere weather's face edges. */
export const TAKRAM_SITE = Object.freeze({ latDeg: 35, lonDeg: 10 });
/** The weather texture's repeat (tiles per cube face, Takram's default): one tile ≈ 100 km. */
const TAKRAM_WEATHER_REPEAT = 100;
/** Metres per weather tile at that repeat (a cube face spans a quarter of a great circle). */
const TAKRAM_WEATHER_TILE_M = (Math.PI / 2) * 6371000 / TAKRAM_WEATHER_REPEAT;
/** How far the Beer shadow map's cascades reach (m; our cloud shade map spans 12 km around the camera). */
const TAKRAM_SHADOW_FAR_M = 12000;
const GOLDEN = 0.6180339887498949;
/** The first-party blue-noise tile (Vite emits it beside the lazy chunk; a plain file URL under node). */
const BLUE_NOISE_URL = new URL('./takramBlue128.bin', import.meta.url).href;
const STBN_SIZE = 128, STBN_DEPTH = 64;

/** Our quality preset → Takram's (phones never get here: the mobile tier creates no layer). */
export function takramQualityFor(preset: string): CloudsQualityPreset {
  return preset === 'low' ? 'low' : preset === 'medium' ? 'medium' : 'high';
}

/** The `?takramScale=` resolution scale (Takram's default 1: its output at our scene resolution, the trace at 1/16). */
export function takramResolutionScale(search: string): number {
  const v = Number(new URLSearchParams(search).get('takramScale'));
  return Number.isFinite(v) && v >= 0.25 && v <= 1 ? v : 1;
}

/**
 * One cloud layer of Takram's four, as a plain record (the selftest pins the mapping without a GPU): low cumulus share,
 * the towers / second low layer, the cirrus sheet, none.
 */
export interface TakramLayerSpec {
  channel: 'r' | 'g' | 'b' | 'a';
  altitude: number;
  height: number;
  densityScale: number;
  shapeAmount: number;
  shapeDetailAmount: number;
  shadow: boolean;
}

/**
 * Our cloudscape preset → Takram's layers and coverage. Takram's art direction stays (its density, shape and detail
 * defaults); ours gives the heights and the amount. A cumuliform sky takes Takram's own pairing (CloudLayers.DEFAULT: a
 * thin low layer under a deeper one starting a little higher); a deck (stratiform ≥ 0.3) one layer filling its slab; the
 * cirrus sheet at the preset's altitude when the preset has cirrus.
 */
export function takramLayersFor(p: Pick<CloudLayerPreset, 'baseM' | 'thicknessM' | 'stratiform' | 'coverage' | 'cirrus' | 'cirrusAltM'>): {
  layers: TakramLayerSpec[]; coverage: number;
} {
  const base = Math.max(100, p.baseM);
  const thick = Math.max(150, p.thicknessM);
  const deck = p.stratiform >= 0.3;
  const layers: TakramLayerSpec[] = [
    { channel: 'r', altitude: base, height: deck ? thick : thick * 0.55, densityScale: 0.2, shapeAmount: 1, shapeDetailAmount: 1, shadow: true },
    deck
      ? { channel: 'g', altitude: 0, height: 0, densityScale: 0.2, shapeAmount: 1, shapeDetailAmount: 1, shadow: false }
      : { channel: 'g', altitude: base + thick * 0.2, height: thick, densityScale: 0.2, shapeAmount: 1, shapeDetailAmount: 1, shadow: true },
    { channel: 'b', altitude: Math.max(base + thick + 500, p.cirrusAltM), height: 500, densityScale: p.cirrus > 0 ? 0.003 : 0, shapeAmount: 0.4, shapeDetailAmount: 0, shadow: false },
    { channel: 'a', altitude: 0, height: 0, densityScale: 0, shapeAmount: 1, shapeDetailAmount: 1, shadow: false },
  ];
  // Takram's coverage moves the weather's cut (0.3 its default sky); ours is the sky fraction the regime asks for
  const coverage = Math.min(0.95, Math.max(0.05, 0.12 + 0.62 * p.coverage));
  return { layers, coverage };
}

/** world (+X east, +Y up, +Z south, metres, y = 0 on the ellipsoid) → ECEF, at TAKRAM_SITE. */
export function takramWorldToECEF(result = new THREE.Matrix4()): THREE.Matrix4 {
  const origin = new Geodetic(THREE.MathUtils.degToRad(TAKRAM_SITE.lonDeg), THREE.MathUtils.degToRad(TAKRAM_SITE.latDeg), 0).toECEF();
  const east = new THREE.Vector3(), north = new THREE.Vector3(), up = new THREE.Vector3();
  Ellipsoid.WGS84.getEastNorthUpVectors(origin, east, north, up);
  return result.makeBasis(east, up, north.negate()).setPosition(origin);
}

const QUAD_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

/** Takram's overlay (radiance integral, alpha = opacity) → our history convention (premultiplied, alpha = transmittance). */
const CONVERT_FRAGMENT = /* glsl */`
precision highp float;
uniform sampler2D tOverlay;
uniform float uExposure;
varying vec2 vUv;
void main() {
	vec4 c = texture2D( tOverlay, vUv );
	gl_FragColor = vec4( max( c.rgb, vec3( 0.0 ) ) * uExposure, 1.0 - clamp( c.a, 0.0, 1.0 ) );
}`;

/**
 * The cloud shade map from Takram's Beer shadow map: the square's texel is where a sun ray crosses our cloud base; the
 * cascade is chosen at the ray's ground point (Takram's interval rule: orthographic depth between the camera's near
 * and the cascades' far); a receiver under every cloud takes the ray's whole optical depth (b: max, a: its tail).
 */
const SHADE_FRAGMENT = /* glsl */`
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray tShadow;
uniform mat4 uShadowMatrices[ 4 ];
uniform vec2 uShadowIntervals[ 4 ];
uniform int uCascades;
uniform mat4 uView;
uniform vec2 uNearFar;
uniform vec3 uRect;
uniform float uBase;
uniform vec3 uSunDir;
uniform float uCore;
varying vec2 vUv;
void main() {
	vec2 xz = uRect.xy + ( vUv - 0.5 ) * uRect.z;
	vec3 pBase = vec3( xz.x, uBase, xz.y );
	vec3 pGround = pBase - uSunDir * ( uBase / max( uSunDir.y, 0.05 ) );
	float viewZ = ( uView * vec4( pGround, 1.0 ) ).z;
	float depth = ( -viewZ - uNearFar.x ) / max( uNearFar.y - uNearFar.x, 1.0 );
	float tau = 0.0;
	bool hit = false;
	for ( int i = 0; i < 4; i++ ) {
		if ( i >= uCascades || hit ) break;
		vec4 clip = uShadowMatrices[ i ] * vec4( pGround, 1.0 );
		vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
		if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) continue;
		if ( depth >= uShadowIntervals[ i ].y && i < uCascades - 1 ) continue;
		vec4 s = texture( tShadow, vec3( uv, float( i ) ) );
		tau = s.b + s.a;
		hit = true;
	}
	float shade = hit ? min( 1.0 - exp( -tau ), uCore ) : 0.0;
	gl_FragColor = vec4( shade, 0.0, 0.0, 1.0 );
}`;

/** The VolumetricCloudLayer members the trial reads and writes (TypeScript-private, plain fields at runtime). */
interface LayerInternals {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly atmosphere: AtmospherePublishedState;
  readonly domeMaterial: THREE.ShaderMaterial;
  readonly dome: THREE.Mesh;
  readonly currentPreset: CloudLayerPreset | null;
  readonly active: boolean;
  frozen: boolean;
  framesShown: number;
  since: number;
  targetWidth: number;
  targetHeight: number;
  farShadeValid: boolean;
  gpuTiming: boolean;
  lastTraceGpuMs: number;
  beginTimer(): void;
  endTimer(): void;
  dropCloudShade(): void;
  __takram?: TakramTrial;
}

type LayerMethod = (this: LayerInternals, ...args: never[]) => unknown;

function makeTarget(width: number, height: number, name: string, type: THREE.TextureDataType = THREE.HalfFloatType): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(width, height, { type, depthBuffer: false, stencilBuffer: false });
  rt.texture.name = name;
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.generateMipmaps = false;
  return rt;
}

/** Our 128² blue-noise tile swept through 64 slices by the golden ratio: spatially blue, temporally low-discrepancy. */
export function takramNoiseVolume(tile: Uint8Array): Uint8Array {
  if (tile.length !== STBN_SIZE * STBN_SIZE) throw new Error(`takram noise tile: ${tile.length} bytes`);
  const out = new Uint8Array(STBN_SIZE * STBN_SIZE * STBN_DEPTH);
  for (let z = 0; z < STBN_DEPTH; z++) {
    const shift = (z * GOLDEN) % 1;
    const o = z * STBN_SIZE * STBN_SIZE;
    for (let i = 0; i < tile.length; i++) {
      const v = (tile[i] / 255 + shift) % 1;
      out[o + i] = Math.min(255, Math.round(v * 255));
    }
  }
  return out;
}

/** The trial's state on one layer instance. */
export class TakramTrial {
  readonly effect: CloudsEffect;
  readonly worldToECEF = takramWorldToECEF();
  /** Diagnostics: the atmosphere tables, the noise volume, both → ready. */
  lutsReady = false;
  noiseReady = false;
  failed: string | null = null;
  /** Live-tunable for the calibration (QA): Takram's units → ours. */
  exposure = TAKRAM_EXPOSURE;
  /** Updates since the last reset (the capture settle counts these). */
  since = 0;
  /** Takram ran this frame (else our own layer drew). */
  drew = false;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly generator: PrecomputedTexturesGenerator;
  private readonly rotation = new THREE.Matrix3();
  private readonly quad: FullScreenQuad;
  private readonly convertMaterial: THREE.ShaderMaterial;
  private readonly shadeMaterial: THREE.ShaderMaterial;
  readonly converted: THREE.WebGLRenderTarget;
  private shadeTarget: THREE.WebGLRenderTarget | null = null;
  private shadeAge = Infinity;
  private readonly shadeInfo = { texture: null as THREE.Texture | null, rect: new THREE.Vector3(), baseM: 1400 };
  private readonly shadowMatrices = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()];
  private readonly shadowIntervals = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
  private width = 0;
  private height = 0;
  private depth: THREE.Texture | null = null;
  private presetKey = '';
  private quality = '';
  private readonly windWorld = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer, search: string) {
    this.renderer = renderer;
    this.rotation.setFromMatrix4(this.worldToECEF);
    const effect = new CloudsEffect(new THREE.PerspectiveCamera());
    this.effect = effect;
    effect.worldToECEFMatrix.copy(this.worldToECEF);
    effect.resolutionScale = takramResolutionScale(search);
    this.applyQuality(resolvePresetName());
    // Takram's procedural generators (rendered once, on the first update) — never its default URLs
    effect.shapeTexture = new CloudShape();
    effect.shapeDetailTexture = new CloudShapeDetail();
    effect.localWeatherTexture = new LocalWeather();
    effect.turbulenceTexture = new Turbulence();
    effect.localWeatherRepeat.setScalar(TAKRAM_WEATHER_REPEAT);
    effect.initialize(renderer, false, THREE.HalfFloatType);
    this.generator = new PrecomputedTexturesGenerator(renderer);
    const t = this.generator.textures;
    effect.transmittanceTexture = t.transmittanceTexture;
    effect.scatteringTexture = t.scatteringTexture as THREE.Data3DTexture;
    effect.irradianceTexture = t.irradianceTexture;
    effect.singleMieScatteringTexture = (t.singleMieScatteringTexture ?? null) as THREE.Data3DTexture | null;
    effect.higherOrderScatteringTexture = (t.higherOrderScatteringTexture ?? null) as THREE.Data3DTexture | null;
    this.convertMaterial = new THREE.ShaderMaterial({
      name: 'TakramCloudConvert', vertexShader: QUAD_VERTEX, fragmentShader: CONVERT_FRAGMENT,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: { tOverlay: { value: null }, uExposure: { value: this.exposure } },
    });
    this.shadeMaterial = new THREE.ShaderMaterial({
      name: 'TakramCloudShade', glslVersion: THREE.GLSL3, vertexShader: QUAD_VERTEX, fragmentShader: SHADE_FRAGMENT,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      uniforms: {
        tShadow: { value: null }, uShadowMatrices: { value: this.shadowMatrices }, uShadowIntervals: { value: this.shadowIntervals },
        uCascades: { value: 0 }, uView: { value: new THREE.Matrix4() }, uNearFar: { value: new THREE.Vector2(0.5, 4000) },
        uRect: { value: new THREE.Vector3() }, uBase: { value: 1400 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uCore: { value: CLOUD_SHADOW_CORE },
      },
    });
    this.quad = new FullScreenQuad(this.convertMaterial);
    this.converted = makeTarget(4, 4, 'takram-clouds-converted');
  }

  get ready(): boolean { return this.lutsReady && this.noiseReady && !this.failed; }

  /** Start the asynchronous parts: the atmosphere tables on the GPU (idle frames) and the noise tile (our asset). */
  start(): void {
    this.generator.update().then(() => { this.lutsReady = true; }, (error: unknown) => {
      this.failed = `atmosphere tables: ${error instanceof Error ? error.message : String(error)}`;
      console.warn('[clouds] takram trial:', this.failed);
    });
    fetch(BLUE_NOISE_URL).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    }).then((buffer) => {
      const volume = new THREE.Data3DTexture(takramNoiseVolume(new Uint8Array(buffer)), STBN_SIZE, STBN_SIZE, STBN_DEPTH);
      volume.format = THREE.RedFormat;
      volume.type = THREE.UnsignedByteType;
      volume.minFilter = THREE.NearestFilter;
      volume.magFilter = THREE.NearestFilter;
      volume.wrapS = volume.wrapT = volume.wrapR = THREE.RepeatWrapping;
      volume.needsUpdate = true;
      this.effect.stbnTexture = volume;
      this.noiseReady = true;
    }).catch((error: unknown) => {
      this.failed = `noise: ${error instanceof Error ? error.message : String(error)}`;
      console.warn('[clouds] takram trial:', this.failed);
    });
  }

  private applyQuality(preset: string): void {
    if (preset === this.quality) return;
    this.quality = preset;
    const effect = this.effect;
    effect.qualityPreset = takramQualityFor(preset);
    // ours stay: the aerial pass hazes the frame and the sun shafts draw the light shafts
    effect.lightShafts = false;
    effect.haze = false;
  }

  /** The preset's layers, coverage and wind (on a new preset key only). */
  applyPreset(preset: CloudLayerPreset): boolean {
    const key = `${preset.baseM}|${preset.thicknessM}|${preset.stratiform}|${preset.coverage}|${preset.cirrus}|${preset.cirrusAltM}|${preset.windSpeed}|${preset.windDirRad}|${preset.offset[0]}|${preset.offset[1]}`;
    if (key === this.presetKey) return false;
    this.presetKey = key;
    const { layers, coverage } = takramLayersFor(preset);
    const effect = this.effect;
    for (let i = 0; i < 4; i++) {
      const spec = layers[i];
      effect.cloudLayers[i].set({
        channel: spec.channel, altitude: spec.altitude, height: spec.height, densityScale: spec.densityScale,
        shapeAmount: spec.shapeAmount, shapeDetailAmount: spec.shapeDetailAmount, shadow: spec.shadow,
      });
    }
    effect.coverage = coverage;
    // the wind: shapes and details advect with it through ECEF; the weather drifts at its tile scale
    const wx = Math.cos(preset.windDirRad) * preset.windSpeed, wz = Math.sin(preset.windDirRad) * preset.windSpeed;
    const w = this.windWorld.set(wx, 0, wz).applyMatrix3(this.rotation);
    effect.shapeVelocity.copy(w).multiply(effect.shapeRepeat).multiplyScalar(-1);
    effect.shapeDetailVelocity.copy(w).multiply(effect.shapeDetailRepeat).multiplyScalar(-1);
    effect.localWeatherVelocity.set(-wx / TAKRAM_WEATHER_TILE_M, wz / TAKRAM_WEATHER_TILE_M);
    this.zeroDrift(preset);
    return true;
  }

  /** The drifts at scene time t (0 = a capture's pose): every offset from the map's own weather offset. */
  zeroDrift(preset: CloudLayerPreset | null, timeS = 0): void {
    const effect = this.effect;
    const t = Math.max(0, timeS);
    effect.localWeatherOffset.set(preset?.offset[0] ?? 0, preset?.offset[1] ?? 0).addScaledVector(effect.localWeatherVelocity, t);
    effect.shapeOffset.copy(effect.shapeVelocity).multiplyScalar(t);
    effect.shapeDetailOffset.copy(effect.shapeDetailVelocity).multiplyScalar(t);
  }

  /** Forget the temporal state: the jitter phase restarts (the history refills within a Bayer cycle). */
  reset(): void {
    this.since = 0;
    (this.effect as unknown as { frame: number }).frame = 0;
  }

  /** Size the effect and the converted target to the scene target (the dome samples the converted texels). */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.effect.setSize(width, height);
    const res = this.effect.resolution;
    this.converted.setSize(Math.max(4, res.width), Math.max(4, res.height));
    this.reset();
  }

  /** One update: Takram's passes, then the conversion into our convention. */
  march(layer: LayerInternals, camera: THREE.PerspectiveCamera, dt: number, width: number, height: number, sceneDepth: THREE.Texture | null): void {
    const effect = this.effect;
    const renderer = this.renderer;
    this.applyQuality(resolvePresetName());
    if (width !== this.width || height !== this.height) this.resize(width, height);
    if (effect.mainCamera !== camera) effect.mainCamera = camera;
    if (sceneDepth && sceneDepth !== this.depth) {
      this.depth = sceneDepth;
      effect.setDepthTexture(sceneDepth, THREE.BasicDepthPacking);
    }
    effect.sunDirection.copy(layer.atmosphere.sunDir).applyMatrix3(this.rotation).normalize();
    // the Beer shadow map's cascades reach as far as our cloud shade square (12 km), not the camera's far plane (4 km):
    // the ground's cloud shadows must not stop at 4 km in an establishing view
    effect.shadow.farScale = TAKRAM_SHADOW_FAR_M / Math.max(1, camera.far);
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    try {
      layer.beginTimer();
      effect.update(renderer, null as unknown as THREE.WebGLRenderTarget, dt);
      this.convertMaterial.uniforms.tOverlay.value = effect.cloudsPass.outputBuffer;
      this.convertMaterial.uniforms.uExposure.value = this.exposure;
      this.quad.material = this.convertMaterial;
      renderer.setRenderTarget(this.converted);
      this.quad.render(renderer);
      layer.endTimer();
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.autoClear = prevAutoClear;
    }
    this.since++;
  }

  /**
   * The cloud shade map from Takram's Beer shadow map (published to the lit materials), on the layer's schedule: when
   * its texel-snapped square moves, every CLOUD_FAR_SHADE_EVERY updates, or forced.
   */
  updateShade(layer: LayerInternals, camera: THREE.PerspectiveCamera, preset: CloudLayerPreset, force: boolean): void {
    if (!(preset.shadowPattern > 0) || preset.coverage <= 0) { layer.dropCloudShade(); return; }
    const texel = CLOUD_FAR_SHADE_SPAN_M / CLOUD_FAR_SHADE_SIZE;
    const camPos = this.scratch.setFromMatrixPosition(camera.matrixWorld);
    const cx = Math.round(camPos.x / texel) * texel, cz = Math.round(camPos.z / texel) * texel;
    const rect = this.shadeInfo.rect;
    const moved = !layer.farShadeValid || rect.x !== cx || rect.y !== cz;
    if (!force && !moved && ++this.shadeAge < CLOUD_FAR_SHADE_EVERY) return;
    const effect = this.effect;
    const maps = effect.shadowMaps;
    const count = Math.min(4, maps.cascadeCount);
    for (let i = 0; i < count; i++) {
      this.shadowMatrices[i].copy(maps.cascades[i].matrix);
      this.shadowIntervals[i].copy(maps.cascades[i].interval);
    }
    if (!this.shadeTarget) this.shadeTarget = makeTarget(CLOUD_FAR_SHADE_SIZE, CLOUD_FAR_SHADE_SIZE, 'takram-cloud-shade', THREE.UnsignedByteType);
    rect.set(cx, cz, CLOUD_FAR_SHADE_SPAN_M);
    const baseM = effect.cloudLayers[0].altitude;
    const u = this.shadeMaterial.uniforms;
    u.tShadow.value = effect.shadowPass.outputBuffer;
    u.uCascades.value = count;
    (u.uView.value as THREE.Matrix4).copy(camera.matrixWorldInverse);
    (u.uNearFar.value as THREE.Vector2).set(camera.near, maps.far);
    (u.uRect.value as THREE.Vector3).copy(rect);
    u.uBase.value = baseM;
    (u.uSunDir.value as THREE.Vector3).copy(layer.atmosphere.sunDir).normalize();
    const renderer = this.renderer;
    const prevTarget = renderer.getRenderTarget();
    try {
      this.quad.material = this.shadeMaterial;
      renderer.setRenderTarget(this.shadeTarget);
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(prevTarget);
    }
    this.shadeAge = 0;
    this.shadeInfo.texture = this.shadeTarget.texture;
    this.shadeInfo.baseM = baseM;
    layer.farShadeValid = true;
    const shared = layer.scene.userData.cloudShadeUniforms as CloudShadeUniforms | undefined;
    if (shared) publishCloudShade(shared, this.shadeInfo as { texture: THREE.Texture; rect: THREE.Vector3; baseM: number }, u.uSunDir.value as THREE.Vector3);
  }

  /** Compile Takram's programs (and render its procedural textures) under the loading cover. */
  warm(layer: LayerInternals, camera: THREE.PerspectiveCamera): void {
    const w = this.width, h = this.height;
    this.march(layer, camera, 0, 16, 16, null);
    this.width = w; this.height = h;
    if (w && h) this.resize(w, h);
    this.reset();
  }

  /** QA: the converted texture back as RGBA8 (radiance clamped to 1, alpha the transmittance). */
  read(): { width: number; height: number; rgba: Uint8Array } {
    const src = this.converted;
    const copy = makeTarget(src.width, src.height, 'takram-read', THREE.UnsignedByteType);
    const renderer = this.renderer;
    const prevTarget = renderer.getRenderTarget();
    const material = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX, fragmentShader: 'precision highp float; uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = texture2D( t, vUv ); }',
      uniforms: { t: { value: src.texture } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    try {
      this.quad.material = material;
      renderer.setRenderTarget(copy);
      this.quad.render(renderer);
      const rgba = new Uint8Array(src.width * src.height * 4);
      renderer.readRenderTargetPixels(copy, 0, 0, src.width, src.height, rgba);
      return { width: src.width, height: src.height, rgba };
    } finally {
      renderer.setRenderTarget(prevTarget);
      material.dispose();
      copy.dispose();
    }
  }

  dispose(): void {
    this.effect.dispose();
    this.generator.dispose();
    this.converted.dispose();
    this.shadeTarget?.dispose();
    this.convertMaterial.dispose();
    this.shadeMaterial.dispose();
    this.quad.dispose();
  }
}

/** Takram draws only by day with a preset (the key light at night is the moon, which Takram would light as a sun). */
function takramDraws(layer: LayerInternals, trial: TakramTrial): boolean {
  const preset = layer.currentPreset;
  return trial.ready && !!preset && layer.active && preset.timeOfDay !== 'night' && layer.atmosphere.sunDir.y > -0.02;
}

/**
 * Give one VolumetricCloudLayer instance Takram's march (idempotent). The instance keeps every field sky.ts, post.ts and
 * the tools touch; its prototype becomes one over VolumetricCloudLayer.prototype, so `Object.getPrototypeOf(vc)` (fifo2's
 * cloud freeze) finds the Takram settle.
 */
export function installTakramClouds(layer: VolumetricCloudLayer, renderer: THREE.WebGLRenderer, search = typeof location !== 'undefined' ? location.search : ''): TakramTrial {
  const L = layer as unknown as LayerInternals;
  if (L.__takram) return L.__takram;
  const base = Object.getPrototypeOf(layer) as Record<string, LayerMethod>;
  const baseHistory = Object.getOwnPropertyDescriptor(base, 'historyTexture')?.get;
  const trial = new TakramTrial(renderer, search);
  L.__takram = trial;

  const proto = Object.create(base, {
    beforeSceneRender: {
      configurable: true, writable: true,
      value(this: LayerInternals, r: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, dt: number, width: number, height: number,
        hazeDatum?: number, sceneDepth?: THREE.Texture | null): void {
        const t = this.__takram!;
        if (!takramDraws(this, t) || r !== this.renderer) {
          // our own layer draws (night, no preset, the tables not built yet); after a Takram frame its history sizes are
          // stale on the dome, so the base re-sizes (and rebuilds) on this call
          if (t.drew) { this.targetWidth = 0; this.targetHeight = 0; }
          t.drew = false;
          (base.beforeSceneRender as (this: LayerInternals, ...a: unknown[]) => void).call(this, r, camera, dt, width, height, hazeDatum, sceneDepth);
          return;
        }
        const preset = this.currentPreset!;
        if (t.applyPreset(preset)) t.reset();
        this.targetWidth = width;
        this.targetHeight = height;
        if (!this.frozen) t.march(this, camera, Math.max(0, Math.min(0.1, dt || 0)), width, height, sceneDepth ?? null);
        t.drew = true;
        this.since = t.since;
        this.framesShown++;
        const u = this.domeMaterial.uniforms;
        u.tClouds.value = t.converted.texture;
        (u.uHistorySize.value as THREE.Vector2).set(t.converted.width, t.converted.height);
        (u.uTargetSize.value as THREE.Vector2).set(width, height);
        u.uSkyIntensity.value = this.atmosphere.skyIntensity;
        (u.uSunDir.value as THREE.Vector3).copy(this.atmosphere.sunDir).normalize();
        (u.uFlash.value as THREE.Vector4).set(0, 0, 0, 0);
        const inside = camera.position.y > preset.baseM ? 1 : 0;
        u.uInside.value = inside;
        if (this.domeMaterial.depthTest === !!inside) this.domeMaterial.depthTest = !inside;
        this.dome.visible = true;
        if (!this.frozen) t.updateShade(this, camera, preset, false);
      },
    },
    historyTexture: {
      configurable: true,
      get(this: LayerInternals): THREE.Texture | null {
        const t = this.__takram!;
        if (t.drew) return this.active && this.dome.visible ? t.converted.texture : null;
        return baseHistory ? baseHistory.call(this) as THREE.Texture | null : null;
      },
    },
    captureFramesRemaining: {
      configurable: true,
      get(this: LayerInternals): number {
        const t = this.__takram!;
        if (!takramDraws(this, t)) return (Object.getOwnPropertyDescriptor(base, 'captureFramesRemaining')?.get?.call(this) as number) ?? 0;
        if (this.frozen) return 0;
        return Math.max(0, TAKRAM_SETTLE_FRAMES - t.since);
      },
    },
    settleForCapture: {
      configurable: true, writable: true,
      value(this: LayerInternals, camera: THREE.PerspectiveCamera): boolean {
        const t = this.__takram!;
        if (!takramDraws(this, t)) return (base.settleForCapture as (this: LayerInternals, c: THREE.PerspectiveCamera) => boolean).call(this, camera);
        if (!this.targetWidth || !this.targetHeight) return false;
        // a still's clouds are the pose's: every drift at scene time 0, the jitter phase from its start
        t.zeroDrift(this.currentPreset);
        const remaining = (this as unknown as { captureFramesRemaining: number }).captureFramesRemaining;
        const self = this as unknown as { beforeSceneRender(r: THREE.WebGLRenderer, c: THREE.PerspectiveCamera, dt: number, w: number, h: number): void };
        for (let i = 0; i < remaining; i++) self.beforeSceneRender(this.renderer, camera, 0, this.targetWidth, this.targetHeight);
        if (this.currentPreset && !this.frozen) t.updateShade(this, camera, this.currentPreset, true);
        return remaining > 0;
      },
    },
    resetHistory: {
      configurable: true, writable: true,
      value(this: LayerInternals): void {
        (base.resetHistory as (this: LayerInternals) => void).call(this);
        this.__takram?.reset();
      },
    },
    setCaptureTime: {
      configurable: true, writable: true,
      value(this: LayerInternals, timeS: number, restart = false): void {
        (base.setCaptureTime as (this: LayerInternals, t: number, r: boolean) => void).call(this, timeS, restart);
        this.__takram?.zeroDrift(this.currentPreset, timeS);
        if (restart) this.__takram?.reset();
      },
    },
    readHistory: {
      configurable: true, writable: true,
      value(this: LayerInternals): { width: number; height: number; rgba: Uint8Array } | null {
        const t = this.__takram!;
        if (t.drew) return t.read();
        return (base.readHistory as (this: LayerInternals) => { width: number; height: number; rgba: Uint8Array } | null).call(this);
      },
    },
    dispose: {
      configurable: true, writable: true,
      value(this: LayerInternals): void {
        this.__takram?.dispose();
        (base.dispose as (this: LayerInternals) => void).call(this);
      },
    },
  });
  Object.setPrototypeOf(layer, proto);
  trial.start();
  // Takram's programs and procedural textures now, under whatever covers the boot (the battle's first frame otherwise)
  try {
    trial.warm(L, new THREE.PerspectiveCamera(60, 1, 0.5, 4000));
  } catch (error) {
    trial.failed = `warm: ${error instanceof Error ? error.message : String(error)}`;
    console.warn('[clouds] takram trial:', trial.failed);
  }
  return trial;
}
