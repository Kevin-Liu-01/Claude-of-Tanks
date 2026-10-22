// src/world/mapAmbience.ts — 2026-10-22: the map's air (mapAmbienceTable.ts says what floats over each battlefield).
//
// One instanced card draw per layer (a map carries at most two). Every particle lives in a box round the camera: its
// world position is its seed in the box plus the layer's drift, wrapped back into the box, so the specks stay put in the
// world as the camera moves and the ones that leave one side come back on the other, faded at the box's walls. The
// drift (wind, fall) is integrated on the CPU in doubles and wrapped there, three speed classes a layer; the sway, the
// tumble, the flicker and the flash run in the vertex shader from one time uniform. No per-particle CPU work and no
// per-frame allocation: a frame sets a few uniforms from the camera in the layers' onBeforeRender.
//
// Presentation only: the battle seed seeds the cards through the ambience's own hash domain (never the combat RNG),
// nothing reaches the simulation, the spotting, the traction or the wire. The cards draw unlit in the late-FX layer (the
// pass the pooled smoke and dust draw in, after the aerial haze, so a speck 20 m off is not hazed as the ridge behind
// it), take the scene's light through the pools' own tint (fx/sceneLightTint.ts: white by day, warm at sunset, a dim
// blue at night), brighten toward the sun, and fade into the scene's fog. They fade out in the gunner's sight and under
// an aerial camera, and near the lens.
import * as THREE from 'three';
import { fxClockNow } from '../fx/clock.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';
import { battleLightTintFromRig } from '../fx/sceneLightTint.ts';
import { sceneWindFor } from './sceneWind.ts';
import {
  AMBIENCE_KINDS, ambienceCount, ambienceHash, ambienceLayersFor, ambienceTimeOf,
  type AmbienceKindDef, type AmbienceLayer, type AmbienceTime,
} from './mapAmbienceTable.ts';

export interface MapAmbienceOptions {
  /** World-space parent that lives as long as the battle presentation (the scene). */
  parent: THREE.Object3D;
  /** The scene whose published light the cards take (the pools' tint). */
  scene: THREE.Scene;
  /** Ground height under the camera (the band's datum); null without a world. */
  getHeightAt?: (x: number, z: number) => number | null;
  /** Unit vector toward the sun (the moon at night). */
  getSunDirection?: () => THREE.Vector3 | null;
  /** True while the player looks through the gunner's sight: the air clears out of it. */
  isSightView?: () => boolean;
  /** The clock in seconds (default the shared fx clock, which the Studio's timeline and a frozen shot pin); null holds 0. */
  clock?: () => number | null;
  /** The device tier's density scale (QualityPreset.ambience): 0 turns the layer off. */
  getTierScale?: () => number;
}

export interface MapAmbienceStats {
  mapId: string | null;
  time: AmbienceTime | null;
  enabled: boolean;
  tierScale: number;
  draws: number;
  instances: number;
  layers: { kind: string; instances: number }[];
}

export interface MapAmbience {
  readonly group: THREE.Group;
  /** Build (or keep) the map's layers for a seed and a time of day (a battle's, or one of the Studio's seven). */
  prepare(seed: number | undefined, mapId: string, time: string): void;
  /** The Studio's toggle (and probes): off hides every layer. */
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  /** Re-read the tier's density (a preset change). */
  refreshTier(): void;
  /** A fixed density scale over the tier's (the Studio films at the full count); null returns to the tier. */
  setDensityOverride(scale: number | null): void;
  /** True while a layer draws: the late-FX pass must run. */
  isActive(): boolean;
  readonly stats: MapAmbienceStats;
  reset(): void;
  dispose(): void;
}

/** The box's half width (m): the wrap volume round the camera. */
export const AMBIENCE_RADIUS_M = 32;
/** Speed classes: each layer's particles fall and drift at three speeds (heavier and lighter flakes, leaves, specks). */
const SPEED_CLASSES = [0.8, 1, 1.22] as const;
/** Shader time wraps here (float precision for the sway phases; a pop of a few cm once in 2.3 h). */
const SHADER_TIME_WRAP_S = 8192;
/** Brightness of an unlit card under the pools' tint (calibrated against the lit ground on the beauty frames). */
const CARD_GAIN = 1.7;
const BASE_FOV_DEG = 60;
/** Camera height over the ground where the air fades out (the gunship's and the drone's views). */
const AERIAL_FADE_M: readonly [number, number] = [55, 90];

const VERTEX = /* glsl */ `
attribute vec4 aSeed;
attribute vec4 aRand;
uniform vec3 uBox;
uniform vec3 uOrigin;
uniform vec3 uOffset0;
uniform vec3 uOffset1;
uniform vec3 uOffset2;
uniform vec3 uVel;
uniform float uTime;
uniform vec2 uSize;
uniform float uAspect;
uniform float uStreakS;
uniform vec2 uWobble;
uniform float uSpin;
uniform float uJitter;
uniform float uAlpha;
uniform vec3 uPal0;
uniform vec3 uPal1;
uniform vec3 uPal2;
uniform vec2 uFadeR;
uniform vec2 uNear;
uniform float uVisible;
uniform float uPixel;
uniform vec3 uSunDir;
varying vec2 vC;
varying vec3 vAlbedo;
varying float vAlpha;
varying float vLight;
varying float vScat;
varying float vBlink;
#include <fog_pars_vertex>

const float TAU = 6.28318530718;

vec3 rotAxis( vec3 v, vec3 k, float a ) {
  float c = cos( a ), s = sin( a );
  return v * c + cross( k, v ) * s + k * dot( k, v ) * ( 1.0 - c );
}

void main() {
  float cls = floor( aRand.w * 2.999 );
  vec3 off = cls < 0.5 ? uOffset0 : ( cls < 1.5 ? uOffset1 : uOffset2 );
  float ph = aRand.z * TAU;
  float t = uTime;
  float wf = uWobble.y * ( 0.7 + 0.6 * aSeed.w ) * TAU;
  vec3 wob = vec3(
    sin( t * wf + ph ) + 0.5 * sin( t * wf * 2.31 + ph * 1.7 ),
    0.55 * sin( t * wf * 1.37 + ph * 2.3 ),
    cos( t * wf * 0.83 + ph * 0.7 ) + 0.5 * sin( t * wf * 1.91 + ph * 3.1 ) ) * uWobble.x;
#ifdef JITTER
  wob += vec3( sin( t * 37.0 + ph * 5.0 ) + sin( t * 23.0 + ph * 2.0 ), 0.7 * sin( t * 41.0 + ph * 7.0 ),
    sin( t * 29.0 + ph * 3.0 ) + sin( t * 17.0 + ph ) ) * uJitter;
#endif
  vec3 p = aSeed.xyz * uBox + off + wob;
  p = uOrigin + mod( p - uOrigin, uBox );

  vec3 toP = p - cameraPosition;
  float dist = length( toP );
  float yl = ( p.y - uOrigin.y ) / uBox.y;
  float a = uAlpha * uVisible
    * ( 1.0 - smoothstep( uFadeR.x, uFadeR.y, length( toP.xz ) ) )
    * smoothstep( 0.0, 0.06, yl ) * ( 1.0 - smoothstep( 0.84, 1.0, yl ) )
    * smoothstep( uNear.x, uNear.y, dist );
  if ( a < 0.002 ) {
    // nothing to draw: park the card outside the clip volume so it rasterizes nothing
    vC = vec2( 0.0 ); vAlbedo = vec3( 0.0 ); vAlpha = 0.0; vLight = 0.0; vScat = 0.0; vBlink = 0.0;
#ifdef USE_FOG
    vFogDepth = 0.0;
#endif
    gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
    return;
  }
  vec3 vdir = toP / max( dist, 1e-3 );
  vScat = pow( max( dot( vdir, uSunDir ), 0.0 ), 7.0 );
  vLight = 1.0;
  vC = position.xy * 2.0;
  vAlbedo = aRand.y < 0.45 ? uPal0 : ( aRand.y < 0.8 ? uPal1 : uPal2 );
  vAlbedo *= 0.86 + 0.28 * fract( aRand.y * 7.13 + aSeed.w );
  float size = mix( uSize.x, uSize.y, aRand.x );
  vec4 mvPosition;
#if defined( MOTION_TUMBLE )
  vec3 axis = normalize( vec3( aSeed.w - 0.5, 0.45 + 0.3 * aRand.x, aRand.z - 0.5 ) );
  // a falling card rocks as it turns: a slow spin about its own axis plus a pendulum swing
  float ang = t * uSpin * TAU * ( 0.7 + 0.6 * aRand.x ) + ph + 0.9 * sin( t * wf * 1.1 + ph );
  vec3 ex = rotAxis( vec3( 1.0, 0.0, 0.0 ), axis, ang );
  vec3 ey = rotAxis( vec3( 0.0, 1.0, 0.0 ), axis, ang );
  float px = size * uPixel / max( dist, 0.05 );
  float grow = max( 1.0, 2.0 / max( px, 1e-3 ) );
  a /= grow;
  size *= grow;
  vec3 wp = p + ( ex * position.x * uAspect + ey * position.y ) * size;
  // both faces take the light (thin, translucent); edge-on to the sun a card goes dim
  vLight = 0.45 + 0.55 * abs( dot( cross( ex, ey ), uSunDir ) );
  mvPosition = viewMatrix * vec4( wp, 1.0 );
#elif defined( MOTION_STREAK )
  vec3 vel = cls < 0.5 ? uVel * 0.8 : ( cls < 1.5 ? uVel : uVel * 1.22 );
  vec4 head = viewMatrix * vec4( p, 1.0 );
  vec4 tail = viewMatrix * vec4( p - vel * uStreakS, 1.0 );
  vec2 d2 = head.xy / max( -head.z, 0.05 ) - tail.xy / max( -tail.z, 0.05 );
  vec2 sd = dot( d2, d2 ) > 1e-12 ? normalize( d2 ) : vec2( 0.0, 1.0 );
  float px = size * uPixel / max( -head.z, 0.05 );
  float grow = max( 1.0, 1.2 / max( px, 1e-3 ) );
  a /= sqrt( grow );
  mvPosition = mix( tail, head, position.y + 0.5 );
  mvPosition.xy += vec2( -sd.y, sd.x ) * position.x * size * grow;
#else
  mvPosition = viewMatrix * vec4( p, 1.0 );
  float px = size * uPixel / max( -mvPosition.z, 0.05 );
  float grow = max( 1.0, 1.6 / max( px, 1e-3 ) );
  // a speck under the pixel floor keeps roughly its light, spread over the floor's area
  a /= grow * sqrt( grow );
  size *= grow;
  mvPosition.xy += position.xy * size;
#endif
#if defined( BLINK_FLICKER )
  // an ember brightens as it catches, flickers, and cools as it rises
  float life = fract( t * ( 0.09 + 0.06 * aSeed.w ) + aRand.z );
  vBlink = smoothstep( 0.0, 0.12, life ) * ( 1.0 - smoothstep( 0.45, 1.0, life ) )
    * ( 0.72 + 0.28 * sin( t * 13.0 + ph * 5.0 ) * sin( t * 7.3 + ph ) );
#elif defined( BLINK_PULSE )
  // a firefly's flash: a quick rise, a soft fall, dark between
  float period = 2.4 + 3.6 * aSeed.w;
  float c = fract( t / period + aRand.z );
  vBlink = smoothstep( 0.0, 0.05, c ) * ( 1.0 - smoothstep( 0.08, 0.34, c ) );
#elif defined( BLINK_GLINT )
  // a turning crystal flashes when its face meets the eye: sharp, brief, and different from every angle
  float g = sin( t * ( 1.1 + 1.8 * aSeed.w ) + ph * 9.0 + dot( vdir, vec3( 31.0, 17.0, 23.0 ) ) );
  vBlink = 0.12 + 1.6 * pow( max( g, 0.0 ), 28.0 );
#else
  vBlink = 1.0;
#endif
  vAlpha = a;
  gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uTint;
uniform float uGain;
uniform float uScatter;
uniform float uEmissive;
varying vec2 vC;
varying vec3 vAlbedo;
varying float vAlpha;
varying float vLight;
varying float vScat;
varying float vBlink;
#include <fog_pars_fragment>

void main() {
  vec2 c = vC;
  float r2 = dot( c, c );
  float shade = 1.0;
  float m;
#if defined( SHAPE_FLUFF )
  // a bright seed at the heart of a soft halo of hairs
  m = ( 0.55 * exp( -r2 * 12.0 ) + 0.45 * exp( -r2 * 2.4 ) ) * ( 1.0 - smoothstep( 0.7, 1.0, r2 ) );
#elif defined( SHAPE_FLAKE )
  m = ( 1.0 - smoothstep( 0.15, 1.0, r2 ) ) * ( 0.65 + 0.35 * exp( -r2 * 6.0 ) );
#elif defined( SHAPE_LEAF )
  // pointed at the tip, broadest below the middle, a darker midrib
  float hw = pow( max( 1.0 - c.y * c.y, 0.0 ), 0.6 ) * ( 0.9 - 0.14 * c.y );
  m = 1.0 - smoothstep( hw - 0.14, hw + 0.02, abs( c.x ) );
  shade = ( 1.0 - 0.28 * ( 1.0 - smoothstep( 0.02, 0.09, abs( c.x ) ) ) ) * ( 0.82 + 0.18 * ( 1.0 - abs( c.x ) / max( hw, 0.05 ) ) );
#elif defined( SHAPE_PETAL )
  // narrow at the claw, broad and round at the tip
  float v = c.y * 0.5 + 0.5;
  float hw = sqrt( max( v * ( 1.0 - v ) * 4.0, 0.0 ) ) * ( 0.42 + 0.58 * v );
  m = 1.0 - smoothstep( hw - 0.16, hw + 0.02, abs( c.x ) );
  shade = 0.78 + 0.22 * v;
#elif defined( SHAPE_SLIVER )
  m = ( 1.0 - smoothstep( 0.5, 1.0, abs( c.x ) ) ) * ( 1.0 - smoothstep( 0.78, 1.0, abs( c.y ) ) );
#elif defined( SHAPE_STREAK )
  float along = c.y * 0.5 + 0.5;
  m = ( 1.0 - smoothstep( 0.0, 1.0, abs( c.x ) ) ) * smoothstep( 0.0, 0.75, along ) * ( 1.0 - smoothstep( 0.92, 1.0, along ) );
#else
  m = exp( -r2 * 3.4 ) * ( 1.0 - smoothstep( 0.65, 1.0, r2 ) );
#endif
  float a = m * vAlpha;
  if ( a < 0.003 ) discard;
#ifdef EMISSIVE
  // self-lit: a hot core in a soft glow (the scene's light plays no part)
  vec3 col = vAlbedo * uEmissive * vBlink * ( 0.35 + 1.4 * exp( -r2 * 7.0 ) );
#else
  vec3 col = vAlbedo * shade * uTint * uGain * ( vLight + uScatter * vScat ) * vBlink;
#endif
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  #ifdef ADDITIVE
    a *= 1.0 - fogFactor;
  #else
    col = mix( col, fogColor, fogFactor );
  #endif
#endif
  gl_FragColor = vec4( col, a );
}
`;

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** The ambience's salt (its hash domain); each layer offsets it. */
const AMBIENCE_SALT = 0x3c6ef372;

/** Seeds for `count` cards: aSeed (xyz in the box, w a rate), aRand (size, palette, phase, speed class). */
export function ambienceSeeds(seed: number, layerIndex: number, def: AmbienceKindDef, count: number): {
  seeds: Float32Array; rands: Float32Array;
} {
  const rand = mulberry32(ambienceHash(seed, (AMBIENCE_SALT + Math.imul(layerIndex + 1, 0x9e3779b9)) >>> 0));
  const seeds = new Float32Array(count * 4), rands = new Float32Array(count * 4);
  const cluster = Math.max(0, Math.floor(def.cluster));
  let cx = 0, cy = 0, cz = 0, cls = 0;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    if (cluster > 0) {
      if (i % cluster === 0) { cx = rand(); cy = rand(); cz = rand(); cls = rand(); }
      // a swarm: members within about a metre of its centre, one speed class so it never comes apart
      const spreadXZ = 0.9 / (AMBIENCE_RADIUS_M * 2), spreadY = 0.6 / Math.max(0.5, def.bandM[1] - def.bandM[0]);
      seeds[o] = (cx + (rand() - 0.5) * 2 * spreadXZ + 1) % 1;
      seeds[o + 1] = Math.min(0.94, Math.max(0.08, cy + (rand() - 0.5) * 2 * spreadY));
      seeds[o + 2] = (cz + (rand() - 0.5) * 2 * spreadXZ + 1) % 1;
      rands[o + 3] = cls;
    } else {
      seeds[o] = rand(); seeds[o + 1] = rand(); seeds[o + 2] = rand();
      rands[o + 3] = rand();
    }
    seeds[o + 3] = rand();
    rands[o] = rand(); rands[o + 1] = rand(); rands[o + 2] = rand();
  }
  return { seeds, rands };
}

interface LayerRuntime {
  readonly layer: AmbienceLayer;
  readonly def: AmbienceKindDef;
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly capacity: number;
  /** Per speed class: the drift velocity (m/s, world). */
  readonly vel: THREE.Vector3[];
  readonly box: THREE.Vector3;
}

const QUAD_POSITIONS = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];

function wrapMod(value: number, size: number): number {
  const r = value % size;
  return r < 0 ? r + size : r;
}

export function createMapAmbience(options: MapAmbienceOptions): MapAmbience {
  const group = new THREE.Group();
  group.name = 'map-ambience';
  // shared per-frame uniforms (one object each, referenced by every layer's material)
  const uTime = { value: 0 };
  const uTint = { value: new THREE.Color(1, 1, 1) };
  const uSunDir = { value: new THREE.Vector3(0, 1, 0) };
  const uPixel = { value: 900 };
  const uVisible = { value: 1 };
  const uNear = { value: new THREE.Vector2(0.35, 1.6) };
  const uFadeR = { value: new THREE.Vector2(AMBIENCE_RADIUS_M * 0.7, AMBIENCE_RADIUS_M * 0.97) };
  const _cam = new THREE.Vector3();
  const layers: LayerRuntime[] = [];
  let enabled = true;
  let densityOverride: number | null = null;
  let tierScale = readTier();
  let preparedKey: string | null = null;
  let lastFrame = -1;
  let disposed = false;
  const stats: MapAmbienceStats = { mapId: null, time: null, enabled: true, tierScale, draws: 0, instances: 0, layers: [] };

  function readTier(): number {
    const scale = options.getTierScale?.() ?? 1;
    return Number.isFinite(scale) ? Math.max(0, Math.min(1, scale)) : 0;
  }

  function densityScale(): number {
    return densityOverride ?? tierScale;
  }

  function applyCounts(): void {
    const scale = densityScale();
    let draws = 0, instances = 0;
    stats.layers.length = 0;
    for (const l of layers) {
      const n = Math.min(l.capacity, ambienceCount(l.layer, scale));
      l.mesh.geometry.instanceCount = n;
      l.mesh.visible = enabled && n > 0;
      if (l.mesh.visible) { draws++; instances += n; }
      stats.layers.push({ kind: l.layer.kind, instances: l.mesh.visible ? n : 0 });
    }
    stats.draws = draws;
    stats.instances = instances;
    stats.enabled = enabled;
    stats.tierScale = scale;
  }

  /** Once a frame (the first layer drawn sets the shared uniforms; the others reuse them). */
  function frameUpdate(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const frame = renderer.info.render.frame;
    if (frame === lastFrame) return;
    lastFrame = frame;
    _cam.setFromMatrixPosition(camera.matrixWorld);
    const now = (options.clock ?? fxClockNow)();
    const t = typeof now === 'number' && Number.isFinite(now) ? now : 0;
    uTime.value = wrapMod(t, SHADER_TIME_WRAP_S);
    const ground = options.getHeightAt?.(_cam.x, _cam.z);
    const groundY = typeof ground === 'number' && Number.isFinite(ground) ? ground : _cam.y - 1.8;
    // the gunner's sight and the aerial views clear the air; elsewhere the lens keeps a short clear zone
    const height = _cam.y - groundY;
    const sight = options.isSightView?.() === true;
    uVisible.value = sight ? 0 : 1 - THREE.MathUtils.smoothstep(height, AERIAL_FADE_M[0], AERIAL_FADE_M[1]);
    const perspective = camera as THREE.PerspectiveCamera;
    const fov = perspective.isPerspectiveCamera ? perspective.fov : BASE_FOV_DEG;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(Math.max(1, fov)) / 2);
    // a long lens brings the near specks up to fill its frame: the clear zone grows with the zoom
    const zoom = Math.tan(THREE.MathUtils.degToRad(BASE_FOV_DEG) / 2) / tanHalf;
    uNear.value.set(0.35 * Math.max(1, zoom), 1.6 * Math.max(1, zoom));
    const target = renderer.getRenderTarget();
    const heightPx = target ? target.height : renderer.domElement.height;
    uPixel.value = heightPx / (2 * tanHalf);
    battleLightTintFromRig(options.scene, uTint.value);
    const sun = options.getSunDirection?.();
    if (sun && Number.isFinite(sun.x)) uSunDir.value.copy(sun).normalize();
    const tintLum = 0.2126 * uTint.value.r + 0.7152 * uTint.value.g + 0.0722 * uTint.value.b;
    const night = 1 - THREE.MathUtils.smoothstep(tintLum, 0.25, 0.8);
    for (const l of layers) {
      const u = l.mesh.material.uniforms;
      u.uOrigin.value.set(_cam.x - AMBIENCE_RADIUS_M, groundY + l.def.bandM[0], _cam.z - AMBIENCE_RADIUS_M);
      for (let c = 0; c < SPEED_CLASSES.length; c++) {
        const v = l.vel[c];
        (u[`uOffset${c}`].value as THREE.Vector3).set(wrapMod(v.x * t, l.box.x), wrapMod(v.y * t, l.box.y), wrapMod(v.z * t, l.box.z));
      }
      // embers and fireflies carry the night; by day an ember is a faint orange fleck
      if (l.def.emissive > 0) u.uEmissive.value = l.def.emissive * (0.3 + 0.7 * night);
    }
  }

  function buildLayer(seed: number, index: number, layer: AmbienceLayer, mapId: string): LayerRuntime {
    const def = AMBIENCE_KINDS[layer.kind];
    const capacity = Math.max(1, ambienceCount(layer, 1));
    const { seeds, rands } = ambienceSeeds(seed, index, def, capacity);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(QUAD_POSITIONS, 3));
    geometry.setIndex(QUAD_INDEX);
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 4));
    geometry.instanceCount = capacity;
    const box = new THREE.Vector3(AMBIENCE_RADIUS_M * 2, def.bandM[1] - def.bandM[0], AMBIENCE_RADIUS_M * 2);
    const wind = sceneWindFor(mapId);
    const along = Math.max(def.windShare * wind.speed, def.minWindMps);
    const vel = SPEED_CLASSES.map((k) => new THREE.Vector3(wind.dirX * along * k, -def.fallMps * k, wind.dirZ * along * k));
    const palette = layer.palette.map((hex) => new THREE.Color(hex));
    const defines: Record<string, string> = {
      [`MOTION_${def.motion.toUpperCase()}`]: '',
      [`SHAPE_${def.shape.toUpperCase()}`]: '',
    };
    if (def.blink !== 'none') defines[`BLINK_${def.blink.toUpperCase()}`] = '';
    if (def.additive) defines.ADDITIVE = '';
    if (def.emissive > 0) defines.EMISSIVE = '';
    if (def.jitterM > 0) defines.JITTER = '';
    const material = new THREE.ShaderMaterial({
      name: `MapAmbience.${layer.kind}`,
      defines,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uBox: { value: box },
        uOrigin: { value: new THREE.Vector3() },
        uOffset0: { value: new THREE.Vector3() },
        uOffset1: { value: new THREE.Vector3() },
        uOffset2: { value: new THREE.Vector3() },
        uVel: { value: vel[1].clone() },
        uTime,
        uSize: { value: new THREE.Vector2(def.sizeM[0], def.sizeM[1]) },
        uAspect: { value: def.aspect },
        uStreakS: { value: def.streakS },
        uWobble: { value: new THREE.Vector2(def.wobbleM, def.wobbleHz) },
        uSpin: { value: def.spinHz },
        uJitter: { value: def.jitterM },
        uAlpha: { value: def.alpha },
        uPal0: { value: palette[0] },
        uPal1: { value: palette[1] },
        uPal2: { value: palette[2] },
        uFadeR,
        uNear,
        uVisible,
        uPixel,
        uSunDir,
        uTint,
        uGain: { value: CARD_GAIN },
        uScatter: { value: def.scatter },
        uEmissive: { value: def.emissive },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: true,
      blending: def.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `map-ambience-${layer.kind}`;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // under the pools' smoke: a speck behind a puff is veiled by it
    mesh.renderOrder = -2;
    mesh.layers.set(LATE_FX_LAYER);
    // the late-FX view may draw it: this callback reads the camera and the renderer, never the scene it is handed
    mesh.userData.lateFxSceneAgnostic = true;
    mesh.onBeforeRender = (renderer, _scene, camera) => frameUpdate(renderer, camera);
    return { layer, def, mesh, capacity, vel, box };
  }

  function clearLayers(): void {
    for (const l of layers) {
      l.mesh.removeFromParent();
      l.mesh.geometry.dispose();
      l.mesh.material.dispose();
    }
    layers.length = 0;
  }

  function prepare(seed: number | undefined, mapId: string, timeOfDay: string): void {
    if (disposed) throw new Error('Map ambience is disposed');
    const time = ambienceTimeOf(timeOfDay);
    const canonical = (Number.isSafeInteger(seed) ? (seed as number) : 0) >>> 0;
    const key = `${mapId}|${time}|${canonical}`;
    tierScale = readTier();
    if (key !== preparedKey) {
      clearLayers();
      const rows = ambienceLayersFor(mapId, time);
      rows.forEach((layer, index) => {
        const runtime = buildLayer(canonical, index, layer, mapId);
        group.add(runtime.mesh);
        layers.push(runtime);
      });
      preparedKey = key;
      stats.mapId = mapId;
      stats.time = time;
    }
    if (group.parent !== options.parent) options.parent.add(group);
    options.scene.userData.mapAmbience = stats;
    applyCounts();
  }

  function reset(): void {
    clearLayers();
    group.removeFromParent();
    preparedKey = null;
    stats.mapId = null;
    stats.time = null;
    applyCounts();
    if (options.scene.userData.mapAmbience === stats) delete options.scene.userData.mapAmbience;
  }

  return {
    group,
    prepare,
    setEnabled(on: boolean) { enabled = !!on; applyCounts(); },
    get enabled() { return enabled; },
    refreshTier() { tierScale = readTier(); applyCounts(); },
    setDensityOverride(scale: number | null) {
      densityOverride = scale === null || !Number.isFinite(scale) ? null : Math.max(0, Math.min(1, scale));
      applyCounts();
    },
    // (not uVisible: the sight's fade is set while the layer draws, so a pass held off by it would never lift it again)
    isActive: () => group.parent !== null && stats.draws > 0,
    get stats() { return stats; },
    reset,
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
    },
  };
}
