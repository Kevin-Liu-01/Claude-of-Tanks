/**
 * cinematicFx.ts — Scene Studio cinematic pyrotechnics runtime (Studio chunk).
 *
 * The battle FX runtime (effects.ts) stays exactly as it is. Scene Studio
 * layers this companion on top of it through effects.ts' FxCinematicPort:
 *
 *  - companion particle pools (particles.ts `share`): they age on the battle
 *    clock, read the same copied scene depth in the late soft-particle pass
 *    and sample the same sprite sheets, but have much larger ring budgets so
 *    a heavy key-art scene never recycles live smoke;
 *  - continuous emitters (burning wrecks, columns, fire fields, embers,
 *    flares, smoke screens, track dust) ticking on an absolute time grid with
 *    private seeded streams (src/fx/cinematicRecipes.ts);
 *  - a light director: cook-off pulses flash the pooled explosion light,
 *    sustained fire drives it between blasts, and flares borrow one idle
 *    scene light (the sniper fill) — scene light counts never change;
 *  - glare sprites (flare cores, tracer heads), ground fire-glow decals and
 *    smoke-grenade canisters.
 *
 * Nothing here is imported by boot or battle code; Studio creates it on the
 * first cinematic need and disposes it on exit.
 */
import * as THREE from 'three';
import { LATE_FX_LAYER } from './layers.ts';
import type { FxCinematicPort } from './effects.ts';
import {
  cineRng, cineSeed, toneFromHex, muzzleBlast, fireball, shockwave, debrisBurst, emberBurst,
  sparkShower, penetration, heBurst, cookOffs, burningEmitter, fireFieldEmitter, emberEmitter,
  columnEmitter, flareEmitter, smokeScreenEmitter, trackDustPacket, cineClamp,
} from './cinematicRecipes.ts';
import type {
  CineCtx, CineEmitter, CineEnv, CineGlow, CineLight, CineSink, CineSprite, CineWorld,
  FlameSource, GroundTone, Puff, PuffPool, Rng, Streak, Chunk, Jet,
} from './cinematicRecipes.ts';

export type CinematicQuality = 'battle' | 'cinematic';

/** Studio actor facts the recipes need (hull centre, heading, dimensions). */
export interface CineActor {
  readonly uid: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly turretYaw: number;
  readonly lengthM: number;
  readonly widthM: number;
  readonly heightM: number;
  /** Turret ring pivot in hull space (x right, y up, z forward). */
  readonly pivot: readonly [number, number, number];
}

/** One Studio shell for the tracer-head glare. */
export interface CineShell {
  readonly pos: { x: number; y: number; z: number };
  readonly dead?: boolean;
  readonly spec?: { tracer?: unknown } | null;
}

/** Moving-actor sample for the step-independent track-dust emitter. */
export interface CineTrackSample { x: number; z: number; yawRad: number }

export interface CineTrackActor {
  readonly uid: string;
  readonly halfLengthM: number;
  readonly halfWidthM: number;
  /** Pose at an absolute Studio time (seconds); false when not driving. */
  poseAt(tS: number, out: CineTrackSample): boolean;
}

export interface StudioCinematicsOptions {
  port: FxCinematicPort;
  scene: THREE.Scene;
  /** One idle pooled PointLight Studio may drive (never added or removed). */
  light: THREE.PointLight | null;
  /** Terrain palette id of the active battlefield (dust tones). */
  palette(): string;
  seed(): number;
}

/** Near-lens fade of the cinematic cards: none inside 3 m of a card's centre, full beyond 10 m (battle pools: 0.5–4.6). */
const CINEMATIC_NEAR_FADE_M: readonly [number, number] = [3, 10];

const POOL_SIZES = {
  smoke: 6144, fire: 3072, billow: 768, psmoke: 1536, screen: 3072,
  dust: 4096, sparks: 4096, debris: 768, flash: 384, jet: 256,
} as const;

const MAX_SPRITES = 48;
const MAX_GLOWS = 6;
const MAX_CANISTERS = 64;
const TRACK_TICK_S = 1 / 60;
const TRACK_SPACING_M = 0.42;

// Dust tones per sourced terrain palette ([light, dark] sRGB hex).
const PALETTE_DUST: Readonly<Record<string, readonly [number, number]>> = {
  verdant: [0x8f8572, 0x6c6455], autumn: [0x8c7d66, 0x695c4b], frontier: [0x938670, 0x6e6352],
  steppe: [0xa69873, 0x7f7457], desert: [0xc9b48c, 0xa38f6c], badlands: [0xb08a6a, 0x86654c],
  winter: [0xe3e9ee, 0xbac6d0], alpine: [0xdfe6ec, 0xb4c0cb], urban: [0x9b968d, 0x77736c],
  railyard: [0x8f8a82, 0x6b6761], foundry: [0x8a857d, 0x66625c], coastal: [0xbdb196, 0x988c74],
  fjord: [0x9a9890, 0x75736d], delta: [0x7b7059, 0x5a5242], monsoon: [0x786c56, 0x574e3f],
  caldera: [0x8e7f71, 0x695d52], ruinspires: [0x9d958a, 0x79726a], blackglass: [0x7a7672, 0x55524f],
  titan_gorge: [0xa08d78, 0x7b6b5a], skybridge: [0xa49a8a, 0x7e7669], moon: [0x9a9a99, 0x737373],
};

function toneForPalette(palette: string): readonly [number, number] {
  return PALETTE_DUST[palette] ?? PALETTE_DUST.verdant;
}

// ---------------------------------------------------------------------------
// Glare sprites (additive camera-facing glow: core + halo)
// ---------------------------------------------------------------------------

const SPRITE_VERT = `
attribute vec4 aPS;   // position.xyz, size
attribute vec4 aCI;   // colour.rgb, intensity
varying vec2 vUv;
varying vec4 vCI;
#include <fog_pars_vertex>
void main() {
  vUv = uv * 2.0 - 1.0;
  vCI = aCI;
  if ( aCI.w <= 0.0 ) { gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 ); return; }
  vec3 camRight = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  vec3 camUp = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  vec3 wpos = aPS.xyz + ( camRight * position.x + camUp * position.y ) * aPS.w;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  #include <fog_vertex>
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SPRITE_FRAG = `
varying vec2 vUv;
varying vec4 vCI;
#include <fog_pars_fragment>
void main() {
  float r2 = dot( vUv, vUv );
  if ( r2 > 1.0 ) discard;
  float core = exp( -r2 * 60.0 );
  float halo = exp( -r2 * 7.0 ) * 0.32 + exp( -r2 * 2.2 ) * 0.10;
  vec3 col = ( vec3( 1.0 ) * core * 1.6 + vCI.rgb * halo ) * vCI.w;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    col *= 1.0 - fogFactor * 0.85;
  #endif
  gl_FragColor = vec4( col, 1.0 );
}
`;

// Procedural value noise shared by the ground decals (no canvas textures, so
// the layer also constructs in Node receipts).
const DECAL_NOISE = `
float dHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float dNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( dHash( i ), dHash( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( dHash( i + vec2( 0.0, 1.0 ) ), dHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`;

// Ground pressure ring: a torn dust band racing out and decelerating.
const RING_FRAG = `
uniform float uTime;
uniform float uBirth;
uniform float uDur;
uniform float uAlpha;
uniform float uSeed;
uniform vec3 uColor;
uniform vec3 uTint;
varying vec2 vUv;
${DECAL_NOISE}
void main() {
  float t = ( uTime - uBirth ) / uDur;
  if ( t < 0.0 || t > 1.0 ) discard;
  vec2 p = vUv * 2.0 - 1.0;
  float r = length( p );
  float k = 1.0 - pow( 1.0 - t, 2.4 );
  float front = 0.08 + 0.92 * k;
  float w = 0.05 + 0.20 * k;
  float band = smoothstep( front - w, front - w * 0.3, r ) * ( 1.0 - smoothstep( front, front + 0.035, r ) );
  float ang = atan( p.y, p.x );
  float n = dNoise( vec2( ang * 5.0 + uSeed, r * 7.0 - t * 2.5 ) ) * 0.6 + dNoise( vec2( ang * 19.0 - uSeed, r * 23.0 ) ) * 0.4;
  float a = band * smoothstep( 0.22, 0.72, n ) * uAlpha * pow( 1.0 - t, 1.3 );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor * uTint, a );
}
`;

// Charred ground: a dark irregular blot that appears with its blast.
const SCORCH_FRAG = `
uniform float uTime;
uniform float uBirth;
uniform float uAlpha;
uniform float uSeed;
varying vec2 vUv;
${DECAL_NOISE}
void main() {
  float age = uTime - uBirth;
  if ( age < 0.0 ) discard;
  vec2 p = vUv * 2.0 - 1.0;
  float r = length( p );
  float n = dNoise( p * 3.2 + uSeed ) * 0.62 + dNoise( p * 9.5 - uSeed ) * 0.38;
  float edge = 1.0 - smoothstep( 0.42 + 0.38 * n, 1.0, r );
  float core = 1.0 - smoothstep( 0.0, 0.6, r );
  float a = edge * ( 0.5 + 0.4 * core ) * uAlpha * smoothstep( 0.0, 0.12, age );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vec3( 0.018, 0.016, 0.014 ) + vec3( 0.03, 0.022, 0.015 ) * n, a );
}
`;

// Ground fire-glow decal: additive warm pool with a living flicker.
const GLOW_FRAG = `
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length( p );
  if ( r >= 1.0 ) discard;
  float fall = pow( 1.0 - r, 2.2 );
  float t = uTime + uSeed;
  float f = 0.82 + 0.10 * sin( t * 12.7 ) + 0.08 * sin( t * 6.3 + p.x * 3.0 );
  gl_FragColor = vec4( uColor * fall * f * uIntensity, 1.0 );
}
`;
const GLOW_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 );
}
`;

export interface StudioCinematics {
  readonly group: THREE.Group;
  readonly quality: CinematicQuality;
  setQuality(quality: CinematicQuality): void;
  readonly trackDust: boolean;
  setTrackDust(on: boolean): void;
  reset(): void;
  /**
   * Pin the authored playhead of the effect about to fire: emitters start on
   * the exact cue time, not on the step-accumulated clock (whose last bits
   * depend on the export step).
   */
  beginEffect(atS: number): void;
  /** `focus` (the camera) ranks sustained fires for the two scene lights. */
  update(dtS: number, nowS: number, shells: readonly CineShell[], tracks: readonly CineTrackActor[],
    focus?: { x: number; y: number; z: number } | null): void;
  muzzleBlast(id: string, pos: THREE.Vector3, dir: THREE.Vector3, caliberMm: number, ageS?: number): void;
  /** Frozen destruction still: the cinematic fireball backdated by ageS. */
  explosionMoment(id: string, pos: THREE.Vector3, ageS: number): void;
  groundHit(id: string, pos: THREE.Vector3, caliberMm: number, shellType: string): void;
  impact(id: string, kind: string, pos: THREE.Vector3, normal: THREE.Vector3, caliberMm: number): void;
  explosion(id: string, pos: THREE.Vector3, size: string, cause?: string): void;
  tankKill(id: string, actor: CineActor, cause: string): void;
  burning(id: string, actor: CineActor, on: boolean): void;
  barrage(id: string, pos: THREE.Vector3, count: number, radiusM: number, size: string, seedDeg: number, durationS: number): void;
  dustBurst(id: string, pos: THREE.Vector3, dirDeg: number, intensity: number, count: number): void;
  mgBurst(id: string, muzzle: THREE.Vector3, dir: THREE.Vector3, rounds: number, gapM: number, speedMps: number): void;
  smokeScreen(id: string, canisters: readonly (readonly number[])[], gravity: number, windX: number, windZ: number, durationS: number, density: number): void;
  flare(id: string, pos: THREE.Vector3, opts: FlareOptions): void;
  embers(id: string, pos: THREE.Vector3, radiusM: number, rate: number, durationS: number, rise: number): void;
  debris(id: string, pos: THREE.Vector3, count: number, speedMps: number, hot: number, sizeK: number): void;
  shockwave(id: string, pos: THREE.Vector3, radiusM: number, strength: number): void;
  fireField(id: string, pos: THREE.Vector3, radiusM: number, durationS: number, intensity: number, smoke: boolean): void;
  stats(): Readonly<Record<string, number>>;
  dispose(): void;
}

export interface FlareOptions {
  heightM: number; burnS: number; driftMps: number; fallMps: number;
  intensity: number; color: number; launch: boolean;
}

/**
 * Linear-RGB tint of normal-blended media from the live light rig: exactly
 * white in daylight (the battle look), falling through warm dusk tones to a
 * dim moonlit blue at night. Measured rigs (Verdant): day sun 4.5 / hemi
 * 0.45 -> 1.0; sunset 2.8 / 0.73 -> ~0.5 warm; night 0.6 / 0.75 -> ~0.2 blue.
 */
function lightTintFromRig(scene: THREE.Scene, out: THREE.Color): THREE.Color {
  const rig = scene.userData.lightRig as {
    sunIntensity?: number; sunColor?: THREE.Color; hemiIntensity?: number; hemiSky?: THREE.Color;
  } | undefined;
  if (!rig || !rig.sunColor || !rig.hemiSky) return out.setRGB(1, 1, 1);
  const sunI = rig.sunIntensity ?? 4.5, hemiI = rig.hemiIntensity ?? 0.45;
  const sc = rig.sunColor, hc = rig.hemiSky;
  const sunLum = 0.2126 * sc.r + 0.7152 * sc.g + 0.0722 * sc.b;
  const level = cineClamp((sunI * sunLum * 0.75 + hemiI * 0.9) / 3.4, 0.06, 1);
  // hue: sun and sky poles weighted by their share of the light
  const ws = sunI * 0.75, wh = hemiI * 0.9;
  let r = sc.r * ws + hc.r * wh, g = sc.g * ws + hc.g * wh, b = sc.b * ws + hc.b * wh;
  const peak = Math.max(r, g, b, 1e-4);
  r /= peak; g /= peak; b /= peak;
  const white = cineClamp((level - 0.82) / 0.13, 0, 1);
  const k = level * (1 - white);
  return out.setRGB(r * k + white, g * k + white, b * k + white);
}

export function createStudioCinematics(opts: StudioCinematicsOptions): StudioCinematics {
  const { port, scene } = opts;
  const group = new THREE.Group();
  group.name = 'fx-cinematic';
  group.matrixAutoUpdate = false;
  const particles = port.createParticleSystem({ scene }, {
    seed: 5000, share: port.sharing, poolSizes: POOL_SIZES,
  });
  particles.setLightTintShading(true);
  // These cards are metres wide (the gun-blast haze 9–13 m): fade them as the lens enters them, not only in the last two
  // metres, so a blast rolling toward a front lens passes through it instead of walling off the frame (2026-10-05).
  for (const pool of Object.values(particles.pools)) {
    const near = (pool.mesh.material as THREE.ShaderMaterial).uniforms?.uNearFade as { value: THREE.Vector2 } | undefined;
    near?.value.set(Math.max(near.value.x, CINEMATIC_NEAR_FADE_M[0]), Math.max(near.value.y, CINEMATIC_NEAR_FADE_M[1]));
  }
  group.add(particles.group);
  port.group.add(group);

  let quality: CinematicQuality = 'battle';
  let trackDustOn = false;
  let battleTinted = false;
  let muzzleExposure = 1;
  let muzzleCards = 1;

  // --- sink: recipes -> companion pools (scratch copies, no allocation) ----
  const sink: CineSink = {
    puff(pool: PuffPool, o: Readonly<Puff>) { particles.emit(pool, o); },
    streak(o: Readonly<Streak>) { particles.emit('sparks', o); },
    chunk(o: Readonly<Chunk>) { particles.emit('debris', o); },
    jet(o: Readonly<Jet>) { particles.emit('jet', o); },
  };

  // --- world adapter ---------------------------------------------------------
  const hf = port.heightField;
  const world: CineWorld = {
    groundY: (x, z) => port.groundY(x, z),
    water: (x, z) => hf.getWaterMaskAt?.(x, z) ?? 0,
    tone(x, z, out: GroundTone): GroundTone {
      const surface = hf.getTrackSurfaceAt?.(x, z) ?? 0;
      if (surface === 3) return toneFromHex(out, 0xe3e9ee, 0xbac6d0, true, false);
      const pal = opts.palette();
      if (surface === 2) {
        const [l, d] = pal === 'badlands' ? PALETTE_DUST.badlands : pal === 'moon' ? PALETTE_DUST.moon : PALETTE_DUST.desert;
        return toneFromHex(out, l, d, false, false);
      }
      const ground = hf.getGroundType?.(x, z) ?? 'medium';
      if (ground === 'hard') return toneFromHex(out, 0xa79d8c, 0x847b6d, false, false);
      const [l, d] = toneForPalette(pal);
      if (ground === 'soft') return toneFromHex(out, d, 0x4f493f, false, true);
      return toneFromHex(out, l, d, false, false);
    },
  };

  const env: CineEnv = { night: 0, nowS: 0 };
  const tint = new THREE.Color(1, 1, 1);

  // --- scheduled light pulses + emitters -------------------------------------
  interface Pulse { atS: number; x: number; y: number; z: number; peak: number }
  const pulses: Pulse[] = [];
  const emitters: CineEmitter[] = [];
  const emitterCtx = new Map<CineEmitter, CineCtx>();
  const _pv = new THREE.Vector3();

  function makeCtx(rng: Rng, shift = 0): CineCtx {
    const ctx: CineCtx = {
      sink, world, env, rng, shift,
      pulse(x, y, z, peak, offsetS) {
        pulses.push({ atS: env.nowS + offsetS + ctx.shift, x, y, z, peak });
      },
      addEmitter(emitter) { addEmitter(emitter); },
      scorch(x, z, radius, offsetS) { spawnScorchDecal(x, z, radius, offsetS + ctx.shift, ctx.rng()); },
      shockRing(x, z, radiusM, alpha, offsetS) { spawnRing(x, z, radiusM, alpha, offsetS + ctx.shift, ctx.rng()); },
    };
    return ctx;
  }

  function addEmitter(emitter: CineEmitter): void {
    emitters.push(emitter);
    emitterCtx.set(emitter, makeCtx(emitter.rng));
  }

  function addOwned(owner: string, emitter: CineEmitter): void {
    emitter.owner = owner;
    addEmitter(emitter);
  }

  function ctxFor(id: string, salt = 0, shift = 0): CineCtx {
    return makeCtx(cineRng(cineSeed(opts.seed(), id, salt)), shift);
  }

  function rngFor(id: string, salt: number): Rng {
    return cineRng(cineSeed(opts.seed(), id, salt));
  }

  // --- glare sprites ------------------------------------------------------------
  const spriteGeo = new THREE.InstancedBufferGeometry();
  spriteGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  spriteGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  spriteGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const aPS = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 4), 4);
  const aCI = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 4), 4);
  aPS.setUsage(THREE.DynamicDrawUsage); aCI.setUsage(THREE.DynamicDrawUsage);
  spriteGeo.setAttribute('aPS', aPS); spriteGeo.setAttribute('aCI', aCI);
  spriteGeo.instanceCount = 0;
  const spriteMat = new THREE.ShaderMaterial({
    vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG,
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
  });
  const sprites = new THREE.Mesh(spriteGeo, spriteMat);
  sprites.frustumCulled = false; sprites.matrixAutoUpdate = false;
  sprites.renderOrder = 26;
  sprites.layers.set(LATE_FX_LAYER);
  group.add(sprites);
  const spriteScratch: CineSprite = { x: 0, y: 0, z: 0, size: 1, r: 1, g: 1, b: 1, intensity: 0 };

  // --- ground glow decals ----------------------------------------------------
  const GLOW_SEG = 10;
  interface GlowDecal { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; key: string; x: number; z: number; r: number }
  const glows: GlowDecal[] = [];
  const glowUTime = { value: 0 };
  for (let i = 0; i < MAX_GLOWS; i++) {
    const geo = new THREE.PlaneGeometry(2, 2, GLOW_SEG, GLOW_SEG);
    geo.rotateX(-Math.PI / 2);
    (geo.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
      uniforms: { uTime: glowUTime, uIntensity: { value: 0 }, uSeed: { value: 0 }, uColor: { value: new THREE.Color(0xff7a2a) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = 4;
    group.add(mesh);
    glows.push({ mesh, key: '', x: NaN, z: NaN, r: 0 });
  }
  const glowTemplate = new THREE.PlaneGeometry(2, 2, GLOW_SEG, GLOW_SEG);
  glowTemplate.rotateX(-Math.PI / 2);
  const glowTemplatePos = (glowTemplate.getAttribute('position') as THREE.BufferAttribute).array;

  function conformGlow(decal: GlowDecal, x: number, z: number, radius: number): void {
    if (decal.x === x && decal.z === z && decal.r === radius) return;
    decal.x = x; decal.z = z; decal.r = radius;
    const attr = decal.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const wx = x + glowTemplatePos[i] * radius, wz = z + glowTemplatePos[i + 2] * radius;
      arr[i] = wx; arr[i + 1] = port.groundY(wx, wz) + 0.06; arr[i + 2] = wz;
    }
    attr.needsUpdate = true;
  }

  // --- shock rings + scorch decals (Studio pools; births on the shared clock) ---
  interface TimedDecal { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> }
  function makeDecalPool(count: number, frag: string, renderOrder: number, uniforms: () => Record<string, THREE.IUniform>): TimedDecal[] {
    const out: TimedDecal[] = [];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.PlaneGeometry(2, 2, GLOW_SEG, GLOW_SEG);
      geo.rotateX(-Math.PI / 2);
      (geo.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
      const mat = new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT, fragmentShader: frag,
        uniforms: { uTime: port.sharing.uTime, ...uniforms() },
        transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = renderOrder;
      group.add(mesh);
      out.push({ mesh });
    }
    return out;
  }
  const rings = makeDecalPool(14, RING_FRAG, 5, () => ({
    uBirth: { value: -1e9 }, uDur: { value: 1 }, uAlpha: { value: 0 }, uSeed: { value: 0 }, uColor: { value: new THREE.Color() },
    uTint: port.sharing.uLightTint,
  }));
  const scorches = makeDecalPool(24, SCORCH_FRAG, 3, () => ({
    uBirth: { value: -1e9 }, uAlpha: { value: 0 }, uSeed: { value: 0 },
  }));
  let ringCursor = 0, scorchCursor = 0;
  const _ringTone: GroundTone = { light: [0, 0, 0], dark: [0, 0, 0], snow: false, wet: false };

  function conformDecal(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>, x: number, z: number, radius: number, lift: number): void {
    const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const wx = x + glowTemplatePos[i] * radius, wz = z + glowTemplatePos[i + 2] * radius;
      arr[i] = wx; arr[i + 1] = port.groundY(wx, wz) + lift; arr[i + 2] = wz;
    }
    attr.needsUpdate = true;
  }

  function spawnRing(x: number, z: number, radiusM: number, alpha: number, offsetS: number, seed: number): void {
    const decal = rings[ringCursor];
    ringCursor = (ringCursor + 1) % rings.length;
    conformDecal(decal.mesh, x, z, Math.max(2, radiusM), 0.3);
    const u = decal.mesh.material.uniforms;
    u.uBirth.value = port.sharing.uTime.value + offsetS;
    u.uDur.value = cineClamp(0.32 + radiusM * 0.022, 0.35, 1.4);
    u.uAlpha.value = alpha * 0.55;
    u.uSeed.value = seed * 10;
    world.tone(x, z, _ringTone);
    (u.uColor.value as THREE.Color).setRGB(_ringTone.light[0], _ringTone.light[1], _ringTone.light[2]);
    decal.mesh.visible = true;
  }

  function spawnScorchDecal(x: number, z: number, radius: number, offsetS: number, seed: number): void {
    const decal = scorches[scorchCursor];
    scorchCursor = (scorchCursor + 1) % scorches.length;
    conformDecal(decal.mesh, x, z, radius, 0.07);
    const u = decal.mesh.material.uniforms;
    u.uBirth.value = port.sharing.uTime.value + offsetS;
    u.uAlpha.value = 0.88;
    u.uSeed.value = seed * 10;
    decal.mesh.visible = true;
  }

  function updateRings(): void {
    const now = port.sharing.uTime.value;
    for (const decal of rings) {
      if (!decal.mesh.visible) continue;
      const u = decal.mesh.material.uniforms;
      if (now > u.uBirth.value + u.uDur.value) decal.mesh.visible = false;
    }
  }

  // --- smoke-grenade canisters -------------------------------------------------
  const canisterGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.28, 8);
  const canisterMat = new THREE.MeshStandardMaterial({ color: 0xa8ad8f, metalness: 0.35, roughness: 0.6 });
  const canisters = new THREE.InstancedMesh(canisterGeo, canisterMat, MAX_CANISTERS);
  canisters.name = 'studioSmokeCanisters';
  canisters.count = 0; canisters.frustumCulled = false;
  canisters.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(canisters);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  const _yAxis = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _cp = new THREE.Vector3();

  // --- flare parachutes ---------------------------------------------------------------
  const chuteGeo = new THREE.SphereGeometry(0.75, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const chuteMat = new THREE.MeshStandardMaterial({ color: 0x8f8f86, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const chutes = new THREE.InstancedMesh(chuteGeo, chuteMat, 8);
  chutes.name = 'studioFlareParachutes';
  chutes.count = 0; chutes.frustumCulled = false;
  chutes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(chutes);
  const _chute: [number, number, number] = [0, 0, 0];
  const _chuteQ = new THREE.Quaternion();

  function updateParachutes(nowS: number): void {
    let n = 0;
    for (const e of emitters) {
      if (n >= 8 || !e.parachute || !e.parachute(nowS, _chute)) continue;
      _cp.set(_chute[0], _chute[1], _chute[2]);
      _chuteQ.setFromAxisAngle(_yAxis, nowS * 0.4 + n);
      _m.compose(_cp, _chuteQ, _s);
      chutes.setMatrixAt(n++, _m);
    }
    chutes.count = n;
    if (n) chutes.instanceMatrix.needsUpdate = true;
  }

  // --- borrowed light ---------------------------------------------------------------
  const borrowed = opts.light;
  const borrowedSaved = borrowed ? {
    color: borrowed.color.getHex(), distance: borrowed.distance, decay: borrowed.decay,
    intensity: borrowed.intensity, position: borrowed.position.clone(),
  } : null;
  const explosionLight = port.explosionLight;
  const explosionSaved = { color: explosionLight.color.getHex(), distance: explosionLight.distance };
  let explosionDriven = false;

  // --- track dust ----------------------------------------------------------------
  // One emitter per driven actor on the absolute 60 Hz grid from t = 0; it is
  // ordered with every other emitter tick, so any export step reproduces it.
  const trackEmitters = new Map<string, CineEmitter>();
  const _ts: CineTrackSample = { x: 0, z: 0, yawRad: 0 };

  function trackDustEmitter(actor: CineTrackActor): CineEmitter {
    const rng = rngFor(`track:${actor.uid}`, 7);
    const prev: CineTrackSample = { x: 0, z: 0, yawRad: 0 };
    let has = false;
    let acc = 0;
    return {
      id: `track:${actor.uid}`, startS: 0, endS: Infinity, periodS: TRACK_TICK_S, k: 0, rng,
      tick(ctx, tS, off) {
        if (!actor.poseAt(tS, _ts)) { has = false; return; }
        if (!has) { prev.x = _ts.x; prev.z = _ts.z; prev.yawRad = _ts.yawRad; has = true; return; }
        const dx = _ts.x - prev.x, dz = _ts.z - prev.z;
        const step = Math.hypot(dx, dz);
        const turn = Math.abs(Math.atan2(Math.sin(_ts.yawRad - prev.yawRad), Math.cos(_ts.yawRad - prev.yawRad)));
        acc += step + turn * actor.halfWidthM;
        const speed = step / TRACK_TICK_S;
        const fx = Math.sin(_ts.yawRad), fz = Math.cos(_ts.yawRad);
        const fwd = dx * fx + dz * fz >= 0 ? 1 : -1;
        const mx = fx * fwd, mz = fz * fwd;
        while (acc >= TRACK_SPACING_M) {
          acc -= TRACK_SPACING_M;
          for (let side = -1; side <= 1; side += 2) {
            const px = _ts.x + fz * side * actor.halfWidthM * 0.82 - mx * actor.halfLengthM * 0.92;
            const pz = _ts.z - fx * side * actor.halfWidthM * 0.82 - mz * actor.halfLengthM * 0.92;
            trackDustPacket(ctx, px, pz, mx, mz, speed, 1, off);
            if (ctx.rng() < 0.5) {
              _pv.set(px, 0, pz); _dir.set(mx, 0, mz);
              port.stampTrackPrint(_pv, _dir, false, (hf.getTrackSurfaceAt?.(px, pz) ?? 0));
            }
          }
        }
        prev.x = _ts.x; prev.z = _ts.z; prev.yawRad = _ts.yawRad;
      },
    };
  }

  function registerTracks(tracks: readonly CineTrackActor[]): void {
    for (const actor of tracks) {
      if (trackEmitters.has(actor.uid)) continue;
      const emitter = trackDustEmitter(actor);
      trackEmitters.set(actor.uid, emitter);
      addEmitter(emitter);
    }
  }

  // --- per-frame -------------------------------------------------------------------
  const _light: CineLight = { x: 0, y: 0, z: 0, intensity: 0, range: 10, color: 0xffffff, priority: 0 };
  const _glow: CineGlow = { x: 0, z: 0, radius: 1, intensity: 0, seed: 0 };
  interface LightPick { x: number; y: number; z: number; intensity: number; range: number; color: number; priority: number }
  const picks: LightPick[] = [];

  /**
   * Run every due tick in global time order (ties: creation order). With
   * private streams per emitter this makes the emitted particle sequence —
   * including the ring order that sets blend order — identical for any
   * sequence of update steps.
   */
  function tickEmitters(nowS: number): void {
    for (;;) {
      let best: CineEmitter | null = null;
      let bestT = Infinity;
      for (const e of emitters) {
        const tS = e.startS + (e.k + 1) * e.periodS;
        if (tS > nowS + 1e-9 || tS > e.endS + 1e-9) continue;
        if (tS < bestT) { bestT = tS; best = e; }
      }
      if (!best) break;
      best.k++;
      best.tick(emitterCtx.get(best)!, bestT, bestT - nowS, bestT - best.startS);
    }
    let compact = false;
    for (const e of emitters) if (nowS > e.endS + 30) compact = true;
    if (compact) {
      let live = 0;
      for (const e of emitters) {
        if (nowS > e.endS + 30) { emitterCtx.delete(e); continue; }
        emitters[live++] = e;
      }
      emitters.length = live;
    }
  }

  function firePulses(nowS: number): void {
    let live = 0;
    let fired: Pulse | null = null;
    for (const p of pulses) {
      if (p.atS <= nowS + 1e-9) {
        if (!fired || p.atS > fired.atS || (p.atS === fired.atS && p.peak > fired.peak)) fired = p;
      } else pulses[live++] = p;
    }
    pulses.length = live;
    if (fired && nowS - fired.atS < 1.9) {
      _pv.set(fired.x, fired.y, fired.z);
      port.flashExplosion(_pv, port.explosionPeak * fired.peak, nowS - fired.atS);
    }
  }

  let lightFocus: { x: number; y: number; z: number } | null = null;
  function directLights(nowS: number): void {
    picks.length = 0;
    for (const e of emitters) {
      if (e.light && e.light(nowS, _light)) {
        // fires nearest the lens win the scene lights; flares always outrank fires
        let priority = _light.priority;
        if (priority < 10 && lightFocus) {
          const d = Math.hypot(_light.x - lightFocus.x, _light.y - lightFocus.y, _light.z - lightFocus.z);
          priority = priority / (1 + d / 35);
        }
        picks.push({ x: _light.x, y: _light.y, z: _light.z, intensity: _light.intensity, range: _light.range, color: _light.color, priority });
      }
    }
    picks.sort((a, b) => b.priority - a.priority);
    const dayK = 0.2 + 0.8 * env.night;
    // borrowed light: the strongest source (flares outrank fires)
    let used = -1;
    if (borrowed) {
      const top = picks[0];
      if (top) {
        borrowed.position.set(top.x, top.y, top.z);
        borrowed.color.setHex(top.color);
        borrowed.distance = top.range;
        borrowed.decay = 2;
        borrowed.intensity = top.intensity * (top.priority >= 10 ? 1 : dayK);
        used = 0;
      } else borrowed.intensity = 0;
    }
    // explosion light: sustained fire between blasts (battle flashes win)
    const fire = picks.find((p, index) => index !== used && p.priority < 10);
    const flashAge = port.explosionFlashAgeS();
    if (fire && flashAge > 1.25) {
      explosionLight.position.set(fire.x, fire.y, fire.z);
      explosionLight.distance = fire.range;
      explosionLight.intensity = fire.intensity * dayK;
      explosionDriven = true;
    } else if (explosionDriven && flashAge <= 1.25) {
      explosionLight.distance = explosionSaved.distance;
      explosionDriven = false;
    }
  }

  function updateGlows(nowS: number): void {
    let n = 0;
    for (const e of emitters) {
      if (n >= MAX_GLOWS) break;
      if (!e.glow || !e.glow(nowS, _glow)) continue;
      const decal = glows[n++];
      conformGlow(decal, _glow.x, _glow.z, _glow.radius);
      decal.mesh.material.uniforms.uIntensity.value = _glow.intensity * (0.03 + 0.97 * env.night) * 0.12;
      decal.mesh.material.uniforms.uSeed.value = _glow.seed;
      decal.mesh.visible = true;
    }
    for (let i = n; i < MAX_GLOWS; i++) glows[i].mesh.visible = false;
    glowUTime.value = nowS;
  }

  const TRACER_COLOR: Readonly<Record<string, readonly [number, number, number]>> = {
    APFSDS: [1, 0.72, 0.38], AP: [1, 0.62, 0.25], APCR: [0.72, 0.84, 1], HEAT: [1, 0.36, 0.18],
    HE: [1, 0.78, 0.42], HESH: [1, 0.7, 0.36], ATGM: [1, 0.86, 0.2],
  };

  function updateSprites(nowS: number, shells: readonly CineShell[]): void {
    let n = 0;
    const ps = aPS.array as Float32Array, ci = aCI.array as Float32Array;
    for (const e of emitters) {
      if (!e.sprite) continue;
      for (let i = 0; n < MAX_SPRITES && e.sprite(nowS, i, spriteScratch); i++) {
        ps[n * 4] = spriteScratch.x; ps[n * 4 + 1] = spriteScratch.y; ps[n * 4 + 2] = spriteScratch.z; ps[n * 4 + 3] = spriteScratch.size;
        ci[n * 4] = spriteScratch.r; ci[n * 4 + 1] = spriteScratch.g; ci[n * 4 + 2] = spriteScratch.b; ci[n * 4 + 3] = spriteScratch.intensity;
        n++;
      }
    }
    if (quality === 'cinematic') {
      for (const shell of shells) {
        if (n >= MAX_SPRITES) break;
        if (shell.dead) continue;
        const tracer = shell.spec?.tracer;
        const c = (typeof tracer === 'string' ? TRACER_COLOR[tracer] : undefined) ?? TRACER_COLOR.AP;
        ps[n * 4] = shell.pos.x; ps[n * 4 + 1] = shell.pos.y; ps[n * 4 + 2] = shell.pos.z;
        ps[n * 4 + 3] = 0.9 + 1.1 * env.night;
        ci[n * 4] = c[0]; ci[n * 4 + 1] = c[1]; ci[n * 4 + 2] = c[2]; ci[n * 4 + 3] = 1.2 + 1.4 * env.night;
        n++;
      }
    }
    spriteGeo.instanceCount = n;
    if (n > 0 || (spriteGeo.userData.lastCount ?? 0) > 0) { aPS.needsUpdate = true; aCI.needsUpdate = true; }
    spriteGeo.userData.lastCount = n;
  }

  function updateCanisters(nowS: number): void {
    let n = 0;
    for (const e of emitters) {
      if (!e.canisters) continue;
      e.canisters(nowS, (x, y, z, dx, dy, dz) => {
        if (n >= MAX_CANISTERS) return;
        _cp.set(x, y, z);
        _dir.set(dx, dy, dz).normalize();
        _q.setFromUnitVectors(_yAxis, _dir);
        _m.compose(_cp, _q, _s);
        canisters.setMatrixAt(n++, _m);
      });
    }
    canisters.count = n;
    if (n) canisters.instanceMatrix.needsUpdate = true;
  }

  /** Scene light -> media tint, night factor and the muzzle exposure discipline. */
  function refreshEnvironment(): void {
    lightTintFromRig(scene, tint);
    particles.sharing.uLightTint.value.copy(tint);
    const lum = 0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b;
    env.night = cineClamp((0.85 - lum) / 0.6, 0, 1);
    // night discipline: the battle muzzle flash is tuned against daylight;
    // against a moonlit frame it clipped the whole front of the tank
    const exposure = quality === 'cinematic' ? 1 - 0.6 * env.night : 1;
    const cards = quality === 'cinematic' ? 1 - 0.42 * env.night : 1;
    if (exposure !== muzzleExposure || cards !== muzzleCards) {
      muzzleExposure = exposure; muzzleCards = cards;
      port.setMuzzleExposure(exposure, cards);
    }
  }

  function liveActivity(): boolean {
    return particles.softParticles.isActive() || spriteGeo.instanceCount > 0;
  }
  port.setLateFxActive(liveActivity);

  // --- recipe helpers ----------------------------------------------------------------
  function actorFlameSources(actor: CineActor, rng: Rng, count: number): FlameSource[] {
    const fx = Math.sin(actor.yaw), fz = Math.cos(actor.yaw);
    const rx = fz, rz = -fx;
    const deckY = actor.y + actor.heightM * 0.62;
    const out: FlameSource[] = [];
    // engine deck (rear), turret ring, hull flank
    const local: Array<[number, number, number, number]> = [
      [0, -actor.lengthM * 0.30, 0.0, 1.2],
      [actor.pivot[0], actor.pivot[2], actor.heightM * 0.18, 1.0],
      [actor.widthM * 0.28, -actor.lengthM * 0.05, -0.05, 0.75],
      [-actor.widthM * 0.30, actor.lengthM * 0.18, -0.1, 0.65],
    ];
    for (let i = 0; i < Math.min(count, local.length); i++) {
      const [lx, lz, ly, size] = local[i];
      const jx = (rng() - 0.5) * 0.4, jz = (rng() - 0.5) * 0.4;
      out.push({
        x: actor.x + rx * (lx + jx) + fx * (lz + jz),
        y: deckY + ly,
        z: actor.z + rz * (lx + jx) + fz * (lz + jz),
        size: size * cineClamp(actor.widthM / 3.6, 0.7, 1.25),
      });
    }
    return out;
  }

  const timelineEnd = Infinity;

  const api: StudioCinematics = {
    group,
    get quality() { return quality; },
    setQuality(next) {
      quality = next;
      const tintBattle = quality === 'cinematic';
      if (tintBattle !== battleTinted) {
        port.setLightTintShading(tintBattle);
        battleTinted = tintBattle;
      }
      port.setColumnCap(quality === 'cinematic' ? 12 : null);
      refreshEnvironment();
    },
    get trackDust() { return trackDustOn; },
    setTrackDust(on) { trackDustOn = on; },
    reset() {
      particles.resetAll();
      emitters.length = 0;
      emitterCtx.clear();
      pulses.length = 0;
      trackEmitters.clear();
      spriteGeo.instanceCount = 0;
      canisters.count = 0;
      chutes.count = 0;
      for (const g of glows) { g.mesh.visible = false; g.x = NaN; }
      for (const d of rings) d.mesh.visible = false;
      for (const d of scorches) d.mesh.visible = false;
      ringCursor = 0; scorchCursor = 0;
      if (borrowed) borrowed.intensity = 0;
      if (explosionDriven) { explosionLight.distance = explosionSaved.distance; explosionDriven = false; }
    },
    beginEffect(atS) {
      env.nowS = atS;
      refreshEnvironment();
    },
    update(_dtS, nowS, shells, tracks, focus = null) {
      env.nowS = nowS;
      refreshEnvironment();
      lightFocus = focus;
      if (trackDustOn && tracks.length) registerTracks(tracks);
      tickEmitters(nowS);
      firePulses(nowS);
      directLights(nowS);
      updateGlows(nowS);
      updateRings();
      updateSprites(nowS, shells);
      updateCanisters(nowS);
      updateParachutes(nowS);
      // the companion shares the battle clock: update(0) only uploads this
      // step's emissions (and the live sun direction) before the next draw
      particles.update(0);
      group.visible = true;
    },
    muzzleBlast(id, pos, dir, caliberMm, ageS = 0) {
      muzzleBlast(ctxFor(id, 1, -ageS), pos.x, pos.y, pos.z, dir.x, dir.y, dir.z, caliberMm);
    },
    explosionMoment(id, pos, ageS) {
      const ctx = ctxFor(id, 16, -ageS);
      const y = Math.max(pos.y - 0.4, port.groundY(pos.x, pos.z)) + 1.2;
      fireball(ctx, pos.x, y, pos.z, { scale: 1.1, smoke: 1.1, rise: 1.1 });
      debrisBurst(ctx, pos.x, y + 0.6, pos.z, 26, 20, 0.7, 1);
      emberBurst(ctx, pos.x, y + 1.5, pos.z, 90, 13);
    },
    groundHit(id, pos, caliberMm, shellType) {
      const ctx = ctxFor(id, 2);
      if (shellType === 'HE' || shellType === 'HESH') heBurst(ctx, pos.x, pos.z, cineClamp(caliberMm / 125, 0.5, 1.4), 0, 0.6);
      else {
        heBurst(ctx, pos.x, pos.z, cineClamp(caliberMm / 160, 0.35, 0.8), 0, 0);
        sparkShower(ctx, pos.x, pos.y + 0.2, pos.z, 0, 1, 0, 26, 18, 0.9);
      }
    },
    impact(id, kind, pos, normal, caliberMm) {
      const ctx = ctxFor(id, 3);
      if (kind === 'pen' || kind === 'he_pen') penetration(ctx, pos.x, pos.y, pos.z, normal.x, normal.y, normal.z, caliberMm);
      else if (kind === 'ricochet' || kind === 'nonpen' || kind === 'sparks') {
        sparkShower(ctx, pos.x, pos.y, pos.z, normal.x, normal.y + 0.2, normal.z, kind === 'ricochet' ? 70 : 46, kind === 'ricochet' ? 34 : 22, kind === 'ricochet' ? 0.55 : 0.95);
        emberBurst(ctx, pos.x, pos.y, pos.z, 10, 4);
      } else if (kind === 'he_splash' || kind === 'terrain') heBurst(ctx, pos.x, pos.z, cineClamp(caliberMm / 125, 0.5, 1.4));
      else if (kind === 'era') {
        penetration(ctx, pos.x, pos.y, pos.z, normal.x, normal.y, normal.z, caliberMm * 0.8);
        debrisBurst(ctx, pos.x, pos.y, pos.z, 8, 12, 0.5, 0.8, 0.4);
      }
    },
    explosion(id, pos, size, cause) {
      const ctx = ctxFor(id, 4);
      // a shell burst ('shot') is not a tank: no ammunition cook-offs — their hatch blowtorch jets would burn in mid-air
      // over open ground (2026-10-03, the floating fire in the site fifty)
      const ammunition = cause !== 'shot';
      const gy = port.groundY(pos.x, pos.z);
      const y = Math.max(pos.y - 0.4, gy) + 0.6;
      if (size === 'small') { heBurst(ctx, pos.x, pos.z, 1.0, 0, 0.6); return; }
      if (size === 'medium') {
        fireball(ctx, pos.x, y + 0.6, pos.z, { scale: 0.75, smoke: 0.8 });
        debrisBurst(ctx, pos.x, y + 0.8, pos.z, 14, 16, 0.6, 0.9);
        emberBurst(ctx, pos.x, y + 1.5, pos.z, 50, 11);
        return;
      }
      // a shell burst's flame also burns out fast and low: no fuel load to lift orange lobes metres above the hit, or to
      // hold a fireball over the water it landed in (2026-10-03, the site fifty)
      if (size === 'large') {
        fireball(ctx, pos.x, y + 0.8, pos.z, ammunition
          ? { scale: 1.15, smoke: 1.1, rise: 1.15 }
          : { scale: 1.0, smoke: 1.2, rise: 0.6, cool: 0.5 });
        debrisBurst(ctx, pos.x, y + 1, pos.z, 26, 20, 0.7, 1);
        emberBurst(ctx, pos.x, y + 2, pos.z, 90, 14);
        if (ammunition) cookOffs(ctx, pos.x, y + 0.6, pos.z, 2, 3, 0.9);
        return;
      }
      // huge: fuel / ammunition cook-off column; a heavy shell burst keeps the blast and a shorter smoke column but
      // lifts no second fireball 6 m up and leaves no 18 s ground fire or ember field where nothing is left to burn
      fireball(ctx, pos.x, y + 1, pos.z, ammunition
        ? { scale: 2.3, smoke: 1.6, rise: 1.6 }
        : { scale: 2.0, smoke: 1.7, rise: 0.8, cool: 0.55 });
      if (ammunition) fireball(ctx, pos.x, y + 6, pos.z, { scale: 1.5, smoke: 1.2, rise: 2.2, ground: false, delayS: 0.35 });
      debrisBurst(ctx, pos.x, y + 1.5, pos.z, 44, 28, 0.75, 1.5, 0.8);
      emberBurst(ctx, pos.x, y + 4, pos.z, 200, 20);
      shockwave(ctx, pos.x, pos.z, 34, 1.5);
      if (ammunition) cookOffs(ctx, pos.x, y + 0.5, pos.z, 5, 7, 1.2);
      const now = env.nowS;
      addEmitter(columnEmitter(`${id}:column`, rngFor(id, 41), now + 0.8, now + (ammunition ? 60 : 14), pos.x, y, pos.z,
        ammunition ? 48 : 30, ammunition ? 5 : 4, 0.85));
      if (!ammunition) return;
      addEmitter(fireFieldEmitter(`${id}:fire`, rngFor(id, 42), world, now + 0.5, now + 18, pos.x, pos.z, 6, 1.3, true));
      addEmitter(emberEmitter(`${id}:embers`, rngFor(id, 43), now + 0.6, now + 16, pos.x, y + 0.5, pos.z, 5, 26, 4));
    },
    tankKill(id, actor, cause) {
      const ctx = ctxFor(id, 5);
      const rack = cause !== 'shot' && cause !== 'fire';
      const burn = cause === 'fire';
      const y = actor.y + actor.heightM * 0.55;
      fireball(ctx, actor.x, y + 0.6, actor.z, { scale: rack ? 1.15 : burn ? 0.65 : 0.85, smoke: rack ? 1.15 : 0.9, rise: rack ? 1.2 : 1 });
      if (rack) {
        // turret-ring blowtorch: a roaring column of flame out of the ring
        const r = ctx.rng;
        for (let i = 0; i < 3; i++) {
          ctx.sink.jet({
            pos: [actor.x, y + 0.6, actor.z], axis: [(r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25],
            life: 0.7 + r() * 0.5, width: 0.9 + r() * 0.4, len0: 1.5, len1: 7 + r() * 4,
            seed: r(), col: [1, 0.66, 0.2], alpha: 0.9, birthOffset: i * 0.12 + ctx.shift,
          });
        }
      }
      debrisBurst(ctx, actor.x, y + 0.4, actor.z, rack ? 30 : burn ? 6 : 18, rack ? 22 : 16, 0.65, 1);
      emberBurst(ctx, actor.x, y + 1.2, actor.z, rack ? 130 : 60, rack ? 15 : 10);
      cookOffs(ctx, actor.x, y, actor.z, rack ? 6 : burn ? 1 : 2, rack ? 7 : 5, rack ? 0.9 : 1.6);
      const now = env.nowS;
      const sources = actorFlameSources(actor, rngFor(id, 51), rack ? 4 : 3);
      addOwned(actor.uid, burningEmitter(`${id}:burn`, rngFor(id, 52), now + 0.35, timelineEnd, sources, rack ? 1.15 : 1, 26, 1.2));
      addOwned(actor.uid, emberEmitter(`${id}:embers`, rngFor(id, 53), now + 1, timelineEnd, actor.x, y + 0.5, actor.z, 1.6, 10, 3));
    },
    burning(id, actor, on) {
      const now = env.nowS;
      if (!on) {
        // extinguish: the actor's fires stop feeding; live particles finish naturally
        for (const e of emitters) if (e.owner === actor.uid && e.endS > now) e.endS = now;
        return;
      }
      const sources = actorFlameSources(actor, rngFor(id, 61), 2);
      addOwned(actor.uid, burningEmitter(`${id}:burn`, rngFor(id, 62), now, timelineEnd, sources, 0.8, 18, 0.8));
      addOwned(actor.uid, emberEmitter(`${id}:embers`, rngFor(id, 63), now + 0.5, timelineEnd, actor.x, actor.y + actor.heightM * 0.7, actor.z, 1.2, 6, 2.6));
    },
    barrage(id, pos, count, radiusM, size, seedDeg, durationS) {
      const ctx = ctxFor(id, 6);
      const seedAngle = seedDeg * Math.PI / 180;
      for (let index = 0; index < count; index++) {
        const angle = seedAngle + (index / count) * Math.PI * 2;
        const distance = radiusM * (0.3 + 0.7 * (((index * 37) % 10) / 10));
        const x = pos.x + Math.sin(angle) * distance;
        const z = pos.z + Math.cos(angle) * distance;
        const medium = size === 'medium' || (size === 'mixed' && index % 3 === 0);
        // staggered arrivals: a walking salvo instead of one simultaneous flash
        const delay = count > 1 ? (index / (count - 1)) * durationS * (0.75 + ctx.rng() * 0.5) : 0;
        heBurst(ctx, x, z, medium ? 1.35 : 1.0, delay, medium ? 1 : 0.5);
        if (medium) fireball(ctx, x, port.groundY(x, z) + 1.2, z, { scale: 0.55, smoke: 0.5, delayS: delay + 0.02, ground: false });
      }
    },
    dustBurst(id, pos, dirDeg, intensity, count) {
      const ctx = ctxFor(id, 7);
      const a = dirDeg * Math.PI / 180;
      for (let i = 0; i < Math.max(1, Math.round(count / 3)); i++) {
        trackDustPacket(ctx, pos.x + (ctx.rng() - 0.5) * 2, pos.z + (ctx.rng() - 0.5) * 2,
          Math.sin(a), Math.cos(a), 6 + intensity * 8, 1.3, -ctx.rng() * 0.2);
      }
    },
    mgBurst(id, muzzle, dir, rounds, gapM, speedMps) {
      const ctx = ctxFor(id, 8);
      const r = ctx.rng;
      const interval = gapM / Math.max(100, speedMps);
      for (let i = 0; i < rounds; i++) {
        const off = -i * interval;
        ctx.sink.puff('flash', {
          pos: [muzzle.x + dir.x * 0.2, muzzle.y + dir.y * 0.2, muzzle.z + dir.z * 0.2], vel: [dir.x * 2, dir.y * 2, dir.z * 2],
          life: 0.045, size0: 0.35, size1: 0.8, rot: r() * Math.PI * 2, rotVel: 0,
          col0: [1, 0.9, 0.6], col1: [1, 0.55, 0.2], alpha: 0.9, grav: 0, birthOffset: off + ctx.shift,
        });
        sparkShower(ctx, muzzle.x + dir.x * 0.3, muzzle.y + dir.y * 0.3, muzzle.z + dir.z * 0.3, dir.x, dir.y, dir.z, 3, 40, 0.15, off);
      }
    },
    smokeScreen(id, cans, gravity, windX, windZ, durationS, density) {
      addEmitter(smokeScreenEmitter(id, rngFor(id, 9), env.nowS, durationS, density, cans, windX, windZ, gravity, world.groundY));
    },
    flare(id, pos, o) {
      addEmitter(flareEmitter(id, rngFor(id, 10), env.nowS, pos.x, pos.y, pos.z, o));
    },
    embers(id, pos, radiusM, rate, durationS, rise) {
      const now = env.nowS;
      addEmitter(emberEmitter(id, rngFor(id, 11), now, now + durationS, pos.x, pos.y, pos.z, radiusM, rate, rise));
    },
    debris(id, pos, count, speedMps, hot, sizeK) {
      debrisBurst(ctxFor(id, 12), pos.x, pos.y, pos.z, count, speedMps, hot, sizeK);
    },
    shockwave(id, pos, radiusM, strength) {
      shockwave(ctxFor(id, 13), pos.x, pos.z, radiusM, strength);
    },
    fireField(id, pos, radiusM, durationS, intensity, smoke) {
      const now = env.nowS;
      addEmitter(fireFieldEmitter(id, rngFor(id, 14), world, now, now + durationS, pos.x, pos.z, radiusM, intensity, smoke));
      addEmitter(emberEmitter(`${id}:embers`, rngFor(id, 15), now + 0.3, now + durationS, pos.x, port.groundY(pos.x, pos.z) + 0.3, pos.z, radiusM * 0.8, 6 + radiusM * 2, 3));
    },
    stats() {
      const out: Record<string, number> = {
        emitters: emitters.length, pulses: pulses.length, sprites: spriteGeo.instanceCount,
        borrowedLight: borrowed ? Math.round(borrowed.intensity) : -1,
        borrowedLightY: borrowed ? Math.round(borrowed.position.y * 10) / 10 : 0,
        night: Math.round(env.night * 100) / 100,
      };
      // `alive.<pool>`: cards burning at this instant (birth <= now < birth + life), so a recipe's lifetime is testable
      const now = port.sharing.uTime.value;
      for (const [name, pool] of Object.entries(particles.pools)) {
        out[`pool.${name}`] = pool.highWater;
        const birth = pool.attrs.aPB.array, life = pool.attrs[pool.lifeAttr];
        let alive = 0;
        for (let i = 0; i < pool.highWater; i++) {
          const b = birth[i * 4 + 3];
          if (b <= now && now < b + life.array[i * life.itemSize + pool.lifeComp]) alive++;
        }
        out[`alive.${name}`] = alive;
      }
      return out;
    },
    dispose() {
      api.reset();
      if (battleTinted) { port.setLightTintShading(false); battleTinted = false; }
      port.setColumnCap(null);
      port.setMuzzleExposure(1, 1);
      muzzleExposure = 1; muzzleCards = 1;
      port.setLateFxActive(null);
      if (borrowed && borrowedSaved) {
        borrowed.color.setHex(borrowedSaved.color);
        borrowed.distance = borrowedSaved.distance;
        borrowed.decay = borrowedSaved.decay;
        borrowed.intensity = 0;
        borrowed.position.copy(borrowedSaved.position);
      }
      explosionLight.color.setHex(explosionSaved.color);
      explosionLight.distance = explosionSaved.distance;
      group.removeFromParent();
      for (const pool of Object.values(particles.pools)) {
        pool.geometry.dispose();
        (pool.mesh.material as THREE.Material).dispose();
      }
      spriteGeo.dispose(); spriteMat.dispose();
      for (const g of glows) { g.mesh.geometry.dispose(); g.mesh.material.dispose(); }
      for (const d of [...rings, ...scorches]) { d.mesh.geometry.dispose(); d.mesh.material.dispose(); }
      glowTemplate.dispose();
      canisterGeo.dispose(); canisterMat.dispose(); canisters.dispose();
      chuteGeo.dispose(); chuteMat.dispose(); chutes.dispose();
    },
  };
  return api;
}
