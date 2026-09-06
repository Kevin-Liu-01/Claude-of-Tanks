/**
 * effects.ts — combat VFX orchestration (public Fx API, ARCHITECTURE §3.8.2).
 *
 * Muzzle flash (light + additive cards + smoke ring), per-type shell tracers,
 * impact effects by HitEvent.kind (spark fans, ricochet streaks, HE dirt
 * plumes, penetration flash, ERA pops), vehicle destruction (fireball, turret
 * pop, debris, persistent smoke column), track dust and engine exhaust.
 *
 * Dynamic light budget: exactly 2 pooled PointLights (muzzle 90 ms,
 * explosion 1.1 s). All randomness via seeded mulberry32; time only advances
 * through update(dt), so setFrozen() fully pins the frame for screenshots.
 */
import * as THREE from 'three';
import { createParticleSystem, mulberry32, makeFbm } from './particles.ts';
import { LATE_FX_LAYER } from './layers.ts';
import { registerFxClock, noteFxClockShift, registerPopTrail } from './clock.ts';
import { createImpactDecals } from './impactDecals.ts';
import { syncSubjectEmitterAnchor } from './effectAttachments.ts';
import { isEraActivation } from '../game/eraActivation.ts';
import type { EventBus } from '../game/stateCore.ts';
// world-dressing r1: destructible small-prop seam — fx registers the
// kind-flavored break bursts and forwards shell flight/impact data so light
// props (fences, carts, barrels, bales...) break under fire without the sim
// layer knowing about them (see src/world/destructibles.ts).
import { setBreakFxProvider, notifyShellSweep, notifyShellImpact } from '../world/destructibles.ts';

type Rng = () => number;
type MutableVec3 = [number, number, number];
type WireVec3 = readonly [number, number, number];
type ShellId = string | number;
type TracerType = 'ATGM' | 'AP' | 'APCR' | 'HEAT' | 'HE' | 'HESH' | 'APFSDS';
type DestructionCause = 'ammorack' | 'shot' | 'fire';

interface FxEngineContext {
  camera?: THREE.Camera;
  anisotropy?: number;
  scene?: THREE.Scene;
}

interface FxHeightField {
  getHeightAt?(x: number, z: number): number;
  getWaterMaskAt?(x: number, z: number): number;
  getGroundType?(x: number, z: number): string;
}

interface FxOptions {
  seed?: number;
  /** Resolve the live presentation entity for any struck tank, including the player. */
  resolveEntity?(targetId: ShellId): object | null;
}

interface PuffScratch {
  pos: MutableVec3;
  vel: MutableVec3;
  life: number;
  size0: number;
  size1: number;
  rot: number;
  rotVel: number;
  col0: MutableVec3;
  col1: MutableVec3;
  alpha: number;
  grav: number;
  birthOffset: number;
}

interface StreakScratch {
  pos: MutableVec3;
  vel: MutableVec3;
  life: number;
  width: number;
  stretch: number;
  grav: number;
  col: MutableVec3;
  alpha: number;
  seed: number;
  birthOffset: number;
}

interface DebrisScratch {
  pos: MutableVec3;
  vel: MutableVec3;
  life: number;
  axis: MutableVec3;
  spin: number;
  scale: number;
  groundY: number;
  hot: boolean | number;
  seed: number;
  birthOffset: number;
}

interface JetScratch {
  pos: MutableVec3;
  axis: MutableVec3;
  life: number;
  width: number;
  len0: number;
  len1: number;
  seed: number;
  col: MutableVec3;
  alpha: number;
  birthOffset: number;
}

interface FxVisual {
  root: THREE.Object3D;
  setDestroyed(options?: { pop?: boolean; ageS?: number }): void;
}

export interface FxDecalVisual {
  root: THREE.Object3D;
}

interface FxEntity {
  visual: FxVisual;
  state: {
    pos?: THREE.Vector3;
    yaw?: number;
  };
}

interface FxDebugSurface {
  game?: {
    tankById?: Map<ShellId, FxEntity>;
  };
}

type FxEventBus = Pick<EventBus, 'on'>;

function onFxEvent<EventName extends keyof FxEventMap>(
  bus: FxEventBus,
  event: EventName,
  listener: (payload: FxEventMap[EventName]) => void,
): () => void {
  return bus.on(event, (payload) => listener(payload as FxEventMap[EventName]));
}

interface LightState {
  light: THREE.PointLight;
  bornAt: number;
  dur: number;
  peak: number;
  pow: number;
}

interface ShockRingState {
  mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  mat: THREE.MeshBasicMaterial;
  bornAt: number;
  scaleK?: number;
  alphaK?: number;
}

interface MuzzleRingState {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  mat: THREE.MeshBasicMaterial;
  bornAt: number;
  att: number;
  dir: THREE.Vector3;
  origin: THREE.Vector3;
}

interface GuidedTrail {
  points: Float32Array;
  count: number;
  age: number;
  seen: boolean;
}

interface TracerTrail {
  d: Float32Array;
  age: number;
  seen: boolean;
}

interface FxTimer {
  t: number;
  fn: () => void;
}

interface SmokeColumn {
  key: string | null;
  pos: MutableVec3;
  localPos?: number[];
  anchorSpace?: object;
  anchorMode?: 'visual-root' | 'state-yaw';
  attachmentResolved?: boolean;
  acc: number;
  ttl: number;
  smolder?: number;
  scale: number;
}

interface LiveShell {
  id: ShellId;
  pos: THREE.Vector3;
  prevPos?: THREE.Vector3;
  vel: THREE.Vector3;
  dead?: boolean;
  distM?: number;
  isPlayer?: boolean;
  spec?: {
    guided?: boolean;
    tracer?: TracerType;
  };
}

interface TracerGeometry extends THREE.InstancedBufferGeometry {
  _lastCount?: number;
}

interface FiringMoment {
  muzzlePos: THREE.Vector3;
  dir: THREE.Vector3;
  caliberMm: number;
  tracerType: Exclude<TracerType, 'ATGM'>;
  ageS: number;
}

interface ExplosionMoment {
  pos: THREE.Vector3;
  ageS: number;
}

interface PredictedWeaponEvent {
  muzzlePos: WireVec3;
  dir: WireVec3;
  caliberMm: number;
  isPlayer?: boolean;
}

interface ShellFiredEvent extends PredictedWeaponEvent {
  shellType: string;
  shellId: ShellId;
  feedbackPredicted?: boolean;
}

interface ShellHitEvent {
  pos: WireVec3;
  normal: WireVec3;
  caliberMm: number;
  kind: string;
  targetId?: string;
  shellId?: ShellId;
  eraPlate?: string | null;
  eraActivations?: readonly {
    plate: string;
    pos?: WireVec3;
    normal?: WireVec3;
  }[];
  zone?: string;
  modulesHit?: readonly { module: string; newState: string; dmg: number }[];
  crewHit?: readonly string[];
  ammoRacked?: boolean;
  fireStarted?: boolean;
  impactFrame?: 'hull' | 'turret' | 'gun' | 'barrel';
  impactLocalPos?: WireVec3;
  impactLocalNormal?: WireVec3;
  impactLocalDir?: WireVec3;
  localPos?: WireVec3;
  localDir?: WireVec3;
}

interface ShellExpiredEvent {
  shellId: ShellId;
  pos: WireVec3;
  normal?: WireVec3;
  hitKind?: string;
  hitTerrain?: boolean;
  caliberMm?: number;
}

interface TankDestroyedEvent {
  id: string;
  pos: WireVec3;
  cause?: DestructionCause;
}

interface ModuleStateEvent {
  id: string;
  module: string;
  state: string;
}

interface TankFireEvent {
  id: string;
  burning: boolean;
}

interface FxEventMap {
  'shell:fired': ShellFiredEvent;
  'weapon:predicted': PredictedWeaponEvent;
  'shell:hit': ShellHitEvent;
  'shell:expired': ShellExpiredEvent;
  'tank:destroyed': TankDestroyedEvent;
  'module:state': ModuleStateEvent;
  'tank:fire': TankFireEvent;
}

export interface FxRuntime {
  readonly group: THREE.Group;
  setReplaySuppressed(suppressed: boolean): void;
  getReplaySuppressionDebug(): object;
  getGuidedMissileDebug(): object;
  getAttachmentDebug(): object;
  warmTextures(): void;
  preloadTextures(): Promise<boolean>;
  warmTexturesChunked(yieldFrame: () => Promise<void>): Promise<void>;
  warmOpeningEffects(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    normal: THREE.Vector3,
    caliberMm?: number,
  ): void;
  warmProjectilePresentation(pos: THREE.Vector3, dir: THREE.Vector3): void;
  update(
    dt: number,
    shells: LiveShell[],
    camera: THREE.Camera,
    resolveSubject?: ((id: string) => FxEntity | null) | null,
  ): void;
  bindBus(bus: FxEventBus): void;
  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, caliberMm: number): void;
  vehicleCollision(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    closingMps?: number,
  ): void;
  impact(kind: string, pos: THREE.Vector3, normal: THREE.Vector3, caliberMm: number): void;
  armorScar(
    visual: FxVisual,
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    caliberMm: number,
  ): void;
  impactDecalStats(): object;
  clearVehicleDecals(visual: FxDecalVisual): void;
  destruction(
    pos: THREE.Vector3,
    visual: FxVisual | null,
    cause?: DestructionCause,
  ): void;
  dust(pos: THREE.Vector3, dir: THREE.Vector3, intensity: number): void;
  exhaust(pos: THREE.Vector3, intensity: number, sooty?: boolean): void;
  loosePropHit(pos: THREE.Vector3, dir: THREE.Vector3, heightM?: number): void;
  propCrush(pos: THREE.Vector3, dir: THREE.Vector3, heightM?: number): void;
  propBreak(kind: string, pos: THREE.Vector3, dir: THREE.Vector3, heightM?: number): void;
  setFrozen(frozen: boolean, atTimeS?: number | null): void;
  resetSeed(seed: number): void;
  resetAll(): void;
  composeFiringMoment(moment: FiringMoment): void;
  composeExplosionMoment(moment: ExplosionMoment): void;
}

declare global {
  interface Window {
    __DEBUG?: FxDebugSurface;
    __FX_SKIP_DESTRUCTION?: boolean;
  }
}

function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('fx/effects: Canvas2D context unavailable');
  return context;
}

function bufferAttribute(
  geometry: THREE.BufferGeometry,
  name: string,
): THREE.BufferAttribute {
  const value = geometry.getAttribute(name);
  if (!(value instanceof THREE.BufferAttribute)) {
    throw new Error(`fx/effects: ${name} is not a BufferAttribute`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Tracer presets (shells-ballistics §10 — colors/widths verbatim)
// ---------------------------------------------------------------------------

// Widths boosted ~1.7x from the ballistic-scale values: tracers are core
// battlefield readability (WoT deliberately thickens them) and the thin r2
// ribbons were invisible in 60 fps frames.
const TRACER_PRESETS = {
  ATGM:   { core: 0xffff82, glow: 0xffd21f, width: 0.16 },
  AP:     { core: 0xffd27a, glow: 0xff9030, width: 0.16 },
  APCR:   { core: 0xe8f4ff, glow: 0x9cc8ff, width: 0.11 },
  HEAT:   { core: 0xff6a3c, glow: 0xff3020, width: 0.19 },
  HE:     { core: 0xffb02e, glow: 0xffe080, width: 0.26 },
  HESH:   { core: 0xffc46b, glow: 0xffa040, width: 0.24 },
  // r5: teal-green APFSDS bolt was an arcade/War-Thunder tell — modern AAA
  // presentation runs hot yellow-white tracers across the board.
  APFSDS: { core: 0xfff2c0, glow: 0xffb060, width: 0.10 },
};
// Afterglow: a dying tracer streak lingers this long after the shell dies (or
// outruns the frame) so every 60 fps frame catches a readable line of flight.
// r4: the afterglow is no longer the BRIGHT ribbon fading in place (the
// critic's "sci-fi laser hanging in the air at 150/300/600 ms") — it is a
// faint desaturated VAPOR ribbon (see trail write below: alpha < 0.25, grey)
// gone in < 300 ms, and it ages against the SHARED PARTICLE CLOCK so
// frozen-stepped captures fade it exactly like live frames do (the old
// `if (!frozen) age += dt` gate held a full-brightness beam through every
// stepped capture window).
const TRAIL_S = 0.28;
const ATGM_TRAIL_S = 0.48;
const ATGM_TRAIL_POINTS = 24;
const ATGM_TRAIL_SPACING_M = 0.55;
const MAX_ATGM_BODIES = 12;

// Nominal muzzle velocities used ONLY by composeFiringMoment (m/s)
const COMPOSE_VELOCITY = { AP: 800, APCR: 1050, HEAT: 780, HE: 750, HESH: 780, APFSDS: 1700 };

const MAX_TRACERS = 256;
const MUZZLE_LIGHT_S = 0.14;   // lighting_post r6: composed frame catches 41% of peak
// 210 (was 1150): the 1150 peak stamped a ~20 m saturated yellow disc onto
// the terrain and whited out the bottom half of the scope (r6 "flashbang").
// 210 at range 11 (was 18) still reads a clear warm kick on barrel/glacis/
// ground inside ~5 m against the 4.5-intensity sun, then dies quadratically —
// a muzzle kiss, not a floodlight. Scoped view additionally attenuates the
// LIGHT (see spawnMuzzleFlash return), matching the geometry suppression.
// lighting_post r5: 210 flooded hull+dust to flat pale yellow — at the
// composed 50 ms frame the light contributed 2-8x the sun's irradiance on
// the glacis/turret front (hull maxima 206-214 display).
// r5 (critic: "muzzle light floods ~20m+ of road as a fog-like diagonal
// wash ... size hierarchy inverts: ground glow >> flash"): 210/16 lit a
// ~20 m pool that out-massed the flash itself from every side framing.
// 130/10 keeps a clear warm kick on barrel/mantlet/ground inside ~5 m
// (at 5 m: ~5.2 vs the 4.5-intensity sun) and dies inside ~10 m — a
// muzzle-scaled pool, never a road-wash.
// lighting_post r5 (critic MAJOR: "muzzle flash casts no light on the firing
// vehicle"): 130 over-corrected the r5 flood — at the composed 50 ms frame
// the light decays to ~53 and the mantlet/glacis sit 4-5 m from the bore tip
// (~0.5x sun, invisible after ACES). 300 puts the hull front at ~1.2x sun and
// the barrel underside at 3-8x in the composed frame — a clear warm kick —
// while the ground pool still dies inside ~6 m (range 12 with the quartic
// cutoff), so the old "ground glow >> flash" inversion cannot return.
// r7 (critic: "no light splash on terrain readable from the chase cam"):
// 300 -> 460. At the composed 50 ms frame the hull front now reads ~1.8x sun
// and the ground pool inside ~6 m carries a clear warm kick; range stays 12
// with quadratic decay, so the r5 "20 m road wash" cannot return.
const MUZZLE_LIGHT_PEAK = 460;
const MUZZLE_LIGHT_RANGE = 12;
// lighting_post r3: 1.1 s / pow-3 decay left the light at 9% of peak while
// the fireball sprites were at their VISUAL peak (composed ageS 0.6) — the
// scene read as "fire barely influences lighting". 1.6 s + pow 1.6 keeps a
// readable warm pool (~42% at 0.6 s) for the fireball's visible lifetime
// while the front-loaded punch survives (t=0 still peak).
// lighting_post r3 (round 3): 1.6 s meant a staged capture at t=1.5 s caught
// ~1% of peak — the fireball sprite was huge/bright but its light was gone,
// so debris/turret right above it rendered pure black. 2.6 s tracks the
// fireball's ~2.4 s visible life (pow lowered 1.6 → 1.15 in lightStates).
// effects r6 (critic major: "explosion ground light reads as a painted
// stain ... static flat orange wash over the road, unchanged frame-to-frame
// for ~2.5 s"): 2.6 s at pow 1.15 held 230+ intensity through the composed
// 0.6 s frame and ~110 at 1.5 s — a parked uniform floor tint. The blast
// light now COLLAPSES with the fireball (1.15 s, pow 2.6 ≈ 13% at 0.6 s,
// dead by ~1 s) and hands off to the FLICKERING wreck-fire light in
// update() — living firelight, never a decal. Range 17 -> 13 m so the pool
// can't tint a road 10 m out (clamped to ~1.5 hull lengths).
// lighting_post r5 (critic MAJOR: "explosion light must light its debris"):
// 1.15 s collapsed before the composed 0.6 s frame caught any of it. 1.9 s
// (pow stays 2.6 — the light still collapses by ~1.5 s, so the r1
// "terracotta deck" long-tail cannot return) catches ~150 intensity at the
// composed frame: wreck deck ~1.7x sun, airborne turret underside blazing,
// grass ring warm to ~10 m.
const EXPLOSION_LIGHT_S = 1.9;
// 250 with CUBIC decay (was 85 quadratic): 85 was too weak to sell the blast
// on the surrounding terrain in the first 400 ms (r6). The cubic curve front-
// loads the energy — at 0.15 s it is ~3x the old warm-up, while by 0.6 s
// (the composed frame) it is back to ~25, so the wreck albedo never cooks
// to flat emissive orange (the regression that drove the 190 -> 85 cut).
// r5 (critic: "flat sickly yellow-green stain ... reads as a painted decal
// circle"): 430 over a 24 m range held the surrounding grass at ~half-sun
// intensity out to the hard range cutoff — a filled disc. 300 over 17 m
// falls below ~1/4 sun by 12 m, so the pool dies as inverse-square falloff
// well inside the cutoff; the hue moves off amber toward orange so the
// green channel stops lifting grass into the sickly band.
const EXPLOSION_LIGHT_PEAK = 520;
// 40 (was 30) + a 35 s smolder tail (r7: "battlefield shows no lasting
// evidence a tank just died" — WoT wrecks pump a column for 20 s+ and
// smolder for the rest of the match).
const SMOKE_COLUMN_S = 40;
const SMOKE_SMOLDER_S = 35;    // post-column ember/wisp stage on the wreck
// r5 column-continuity rebuild: 0.05 (was 0.11) — the 9 Hz cadence of very
// large puffs is what let the column macro-structure fall apart in motion
// (a detached dark blob with clear air between it and the burning wreck at
// +2.4-4.2 s). 20 Hz of HALF-SIZE puffs keeps the column a continuous
// turbulent volume. PERF: per-puff fill area drops with size^2, so 2.2x the
// rate at ~0.55x the card size is a net fill-rate REDUCTION per column.
const COLUMN_TICK_S = 0.05;
// Wind shear on the column (unit XZ dir * strength): higher puffs get more
// lateral velocity so the column visibly bends downwind instead of rising as
// a laser-straight stack. Matches the world wind's general drift direction.
const COLUMN_WIND_X = 0.82, COLUMN_WIND_Z = 0.28;
// PERF: cap concurrent smoke-column emitters. Late battle every wreck runs a
// 30 s column at dozens of puffs/s; 5+ simultaneous columns is pure
// fill-rate pile-up at retina resolutions (measured 25-28 ms frames in
// the 60 s probe tail). 4 columns reads identically in battle — when a 5th
// kill lands, the column closest to burning out is retired early.
const MAX_COLUMNS = 4;

// ---------------------------------------------------------------------------
// Tracer shader (instanced stretched additive ribbon, camera-facing)
// ---------------------------------------------------------------------------

const TRACER_VERT = `
attribute vec4 aA;     // tail.xyz, width
attribute vec4 aB;     // head.xyz, brightness
attribute vec3 aCore;
attribute vec3 aGlow;
attribute float aTint;
varying vec2 vUv;
varying vec3 vCore;
varying vec3 vGlow;
varying float vBright;
varying float vSeed;
varying float vTint;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
uniform vec2 uNearFade;
void main() {
  vUv = uv; vCore = aCore; vGlow = aGlow; vBright = aB.w; vTint = aTint;
  vSeed = fract( dot( aA.xyz, vec3( 0.1031, 0.11369, 0.13787 ) ) );
  if ( aB.w <= 0.0 ) {
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #ifdef USE_FOG
      vFogDepth = 1.0;
    #endif
    return;
  }
  vec3 axisRaw = aB.xyz - aA.xyz;
  float len = max( length( axisRaw ), 1e-4 );
  vec3 axis = axisRaw / len;
  vec3 wpos = mix( aA.xyz, aB.xyz, position.x + 0.5 );
  // lens fade: a ribbon segment right at the eye (own shot leaving the scope)
  // must not flood the frame — fade the vertex's brightness in close
  vBright *= smoothstep( uNearFade.x, uNearFade.y, distance( wpos, cameraPosition ) );
  vec3 viewDir = normalize( cameraPosition - wpos );
  vec3 side = cross( axis, viewDir );
  float sl = length( side );
  side = sl > 1e-4 ? side / sl : vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
  // The incandescent wake starts needle-thin and blooms only around the
  // projectile head. This silhouette reads as a shell in flight instead of
  // a constant-width billboard/laser, while retaining combat readability.
  float along = position.x + 0.5;
  float widthProfile = mix( 0.38, 1.0, smoothstep( 0.08, 0.78, along ) );
  wpos += side * position.y * aA.w * 3.2 * widthProfile;
  vec4 mvPosition = viewMatrix * vec4( wpos, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mvPosition.z;
  #endif
  gl_Position = projectionMatrix * mvPosition;
}
`;

const TRACER_FRAG = `
varying vec2 vUv;
varying vec3 vCore;
varying vec3 vGlow;
varying float vBright;
varying float vSeed;
varying float vTint;
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying float vFogDepth;
#endif
void main() {
  float x = clamp( vUv.x, 0.0, 1.0 );
  float d = abs( vUv.y * 2.0 - 1.0 );
  float core = exp( -d * d * 48.0 );
  float corona = exp( -d * d * 7.5 );
  // Bright projectile bead plus a turbulent incandescent wake. The wake is
  // tapered at birth and energy rises toward the round, white-hot head.
  float tailGate = smoothstep( 0.0, 0.12, x );
  float tailEnergy = pow( x, 0.78 ) * tailGate;
  float shimmer = 0.91 + 0.09 * sin( x * 58.0 + vSeed * 31.0 );
  vec2 hp = vec2( ( x - 0.955 ) * 1.75, ( vUv.y - 0.5 ) * 2.0 );
  float bead = exp( -dot( hp, hp ) * 15.0 );
  float a = ((core * 0.92 + corona * 0.28) * tailEnergy * shimmer
    + bead * 1.15) * vBright;
  if ( a < 0.004 ) discard;
  #ifdef USE_FOG
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #else
    float fogFactor = 0.0;
  #endif
  // A neutral hot core preserves the physical incandescent read; the shell
  // preset lives in the close corona, so AP/APCR/HE remain distinguishable.
  vec3 neutralHot = mix( vCore, vec3( 1.0, 0.97, 0.88 ), 0.72 );
  vec3 hot = mix( neutralHot, vCore, vTint );
  vec3 col = ( hot * core * 3.6 + vGlow * corona * 0.95 )
    * tailEnergy * shimmer * vBright;
  vec3 beadColor = mix( vec3( 1.0, 0.985, 0.92 ), vCore, vTint );
  col += beadColor * bead * vBright * 3.0;
  gl_FragColor = vec4( col * ( 1.0 - fogFactor ), a );
}
`;

// ---------------------------------------------------------------------------
// Module-scope scratch (reused — no per-frame allocation)
// ---------------------------------------------------------------------------

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _camV = new THREE.Vector3(); // camera-relative scratch (never aliased by callers)
const _mfPos = new THREE.Vector3(); // spawnMuzzleFlash-private origin copy
const _mfDir = new THREE.Vector3(); // spawnMuzzleFlash-private direction copy
const _sv = new THREE.Vector3();     // recipe-internal scratch (never an argument carrier)
const _subjectAnchor = new THREE.Vector3(); // moving-emitter attachment scratch
const _UP = new THREE.Vector3(0, 1, 0);  // read-only
const _c0 = new THREE.Color();

/** Build an orthonormal basis (outU, outV) perpendicular to unit dir. */
function basisFrom(dir: THREE.Vector3, outU: THREE.Vector3, outV: THREE.Vector3): void {
  if (Math.abs(dir.y) < 0.94) outU.set(0, 1, 0);
  else outU.set(1, 0, 0);
  outU.crossVectors(outU, dir).normalize();
  outV.crossVectors(dir, outU).normalize();
}

function col3(hex: number, out: MutableVec3): MutableVec3 {
  _c0.setHex(hex);
  out[0] = _c0.r; out[1] = _c0.g; out[2] = _c0.b;
  return out;
}

/**
 * Scorch decal texture: charred black core, sooty radial streaks, irregular
 * bitten rim. RGB near-black, alpha carries the shape.
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeScorchTexture(rng: Rng): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = context2d(cv);
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.0, 'rgba(4,3,3,0.94)');
  g.addColorStop(0.30, 'rgba(9,7,6,0.84)');
  g.addColorStop(0.62, 'rgba(14,11,9,0.52)'); // r5: mid-ring lifted — the part visible past the hull
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // radial soot rays
  for (let i = 0; i < 24; i++) {
    const a = rng() * Math.PI * 2;
    const len = (0.34 + rng() * 0.5) * c;
    const w = (0.03 + rng() * 0.05) * c;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const sg = ctx.createRadialGradient(len * 0.9, 0, 0, len * 0.9, 0, len);
    sg.addColorStop(0, 'rgba(6,5,4,0.5)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(len * 0.9, 0, len, w, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // irregular rim bite-outs
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2;
    const d = (0.55 + rng() * 0.45) * c;
    const bx = c + Math.cos(a) * d;
    const by = c + Math.sin(a) * d;
    const r = (0.07 + rng() * 0.15) * c;
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    bg.addColorStop(0, 'rgba(0,0,0,0.85)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Dust-pressure annulus for the expanding shockwave ring: a translucent band
 * with a feathered (never hard) inner edge, radial streak stretching, and
 * fbm-eroded alpha so it reads as a torn dust wave, not solid geometry.
 * Alpha-only payload (RGB white — material color supplies the dirt tint).
 * @param {() => number} rng
 * @returns {THREE.CanvasTexture}
 */
function makeShockRingTexture(rng: Rng): THREE.CanvasTexture {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = context2d(cv, { willReadFrequently: true });
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  // soft band: wide feathered shoulders on BOTH edges (the r5 hard inner
  // edge is what made the ring read as a whipped-cream torus)
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0.40, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.80, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.34)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // radial streak stretching: dust dragged outward by the pressure front
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 42; i++) {
    const a = rng() * Math.PI * 2;
    const r0 = (0.42 + rng() * 0.26) * c;
    const len = (0.26 + rng() * 0.34) * c;
    const w = (0.014 + rng() * 0.035) * c;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    const sg = ctx.createLinearGradient(r0, 0, r0 + len, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.55, `rgba(255,255,255,${0.22 + rng() * 0.25})`);
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(r0, -w, len, w * 2);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  // fbm erosion: bite the band apart so no arc is a continuous solid
  const fbm = makeFbm(rng);
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = fbm(x / s * 2.3, y / s * 2.3);
      const m = Math.max(0, Math.min(1, n * 2.0 - 0.35));
      d[(y * s + x) * 4 + 3] = Math.min(255, d[(y * s + x) * 4 + 3] * m);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Preallocated emit-option scratch objects (mutated per emit call)
const _puffO: PuffScratch = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 2, rot: 0, rotVel: 0, col0: [0, 0, 0], col1: [0, 0, 0], alpha: 1, grav: 0, birthOffset: 0 };
const _strkO: StreakScratch = { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.02, grav: -21.6, col: [0, 0, 0], alpha: 1, seed: 0, birthOffset: 0 };
const _debO: DebrisScratch = { pos: [0, 0, 0], vel: [0, 0, 0], life: 4, axis: [0, 1, 0], spin: 5, scale: 0.2, groundY: 0, hot: false, seed: 0, birthOffset: 0 };
const _jetO: JetScratch = { pos: [0, 0, 0], axis: [0, 0, 1], life: 0.1, width: 0.4, len0: 0.4, len1: 2.5, seed: 0, col: [0, 0, 0], alpha: 1, birthOffset: 0 };

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the combat VFX controller.
 * @param {object} engineCtx render-side dependency bundle (ARCHITECTURE §2.8)
 * @param {object} heightField terrain height query (ARCHITECTURE §2.7)
 * @param {{ seed?: number, resolveEntity?: (targetId: ShellId) => unknown }} [opts]
 * fx seed and live presentation-entity resolver
 * @returns {object} Fx per ARCHITECTURE §3.8.2
 */
export function createFx(
  engineCtx: FxEngineContext,
  heightField: FxHeightField,
  { seed = 5000, resolveEntity }: FxOptions = {},
): FxRuntime {
  const particles = createParticleSystem(engineCtx, { seed });
  // r5: tank-visual animation timelines (recoil, turret pop, char, embers)
  // age against THIS clock — see src/fx/clock.ts. Live play is unchanged
  // (the clock advances by render dt); frozen/stepped captures now hold and
  // step the destruction/fire beats exactly like every particle.
  registerFxClock(() => particles.getTime());
  // r6 tumbling-turret wake (critic: the popped turret "reads as a distant
  // bird" with no motion cue): tankFactory's applyPop samples the arc through
  // this bridge — dark smoke puffs + cooling ember flecks glued to the
  // turret's real flight path (backdated births for composed captures).
  registerPopTrail((x, y, z, heat, birthOffset = 0) => {
    _puffO.pos[0] = x; _puffO.pos[1] = y; _puffO.pos[2] = z;
    _puffO.vel[0] = (rng() - 0.5) * 0.7 + COLUMN_WIND_X * 0.4;
    _puffO.vel[1] = 0.4 + rng() * 0.7;
    _puffO.vel[2] = (rng() - 0.5) * 0.7 + COLUMN_WIND_Z * 0.4;
    _puffO.life = 1.0 + rng() * 0.8;
    _puffO.size0 = 0.5 + rng() * 0.3; _puffO.size1 = 1.6 + rng() * 0.8;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.5;
    col3(0x3a352f, _puffO.col0); col3(0x6a655c, _puffO.col1);
    _puffO.alpha = 0.42 + 0.2 * heat; _puffO.grav = 0.5;
    _puffO.birthOffset = birthOffset;
    particles.emit('smoke', _puffO);
    // hot early flight sheds ember flecks — the fireball's grip on the toss
    if (heat > 0.15 && rng() < 0.55) {
      _strkO.pos[0] = x; _strkO.pos[1] = y; _strkO.pos[2] = z;
      _strkO.vel[0] = (rng() - 0.5) * 2.2; _strkO.vel[1] = -0.5 - rng() * 1.5; _strkO.vel[2] = (rng() - 0.5) * 2.2;
      _strkO.life = 0.4 + rng() * 0.35;
      _strkO.width = 0.025 + rng() * 0.02; _strkO.stretch = 0.028; _strkO.grav = -12;
      col3(0xffb662, _strkO.col); _strkO.alpha = 0.5 + 0.4 * heat; _strkO.seed = rng();
      _strkO.birthOffset = birthOffset;
      particles.emit('sparks', _strkO);
    }
  });
  const group = new THREE.Group();
  group.name = 'fx';
  group.matrixAutoUpdate = false;
  group.add(particles.group);

  let rng = mulberry32(seed);
  let frozen = false;
  // Killcam reconstruction temporarily presents a pre-impact tank in the
  // same world as its already-recorded destruction. Keep the pooled scene
  // objects alive (stable Three.js light/program counts), but do not let the
  // old wreck emitters or their orange light leak over that intact replay.
  // The impact/finale beat releases this gate before spawning its own FX.
  let replaySuppressed = false;

  // --- dynamic lights (budget: exactly 2 PointLights) -----------------------
  // Muzzle: warm white-amber (was deep orange — the "saturated ground decal"
  // read); tighter range so it kisses the hull rather than floods the field.
  const muzzleLight = new THREE.PointLight(0xffe4c4, 0, MUZZLE_LIGHT_RANGE, 2); // r5: less saturated kiss
  // lighting_post r5: range 34 -> 24 — the wide range warmed the ENTIRE
  // visible field to mustard from the 22 m camera; wreck/debris keep their
  // warm pool, the wider grass field drops out of the mustard band.
  // effects r5: 24 -> 17 + hue 0xff9a52 -> 0xff7f38 (see EXPLOSION_LIGHT_PEAK)
  // effects r6: 17 -> 13 (the static-stain fix — see EXPLOSION_LIGHT_S)
  const explosionLight = new THREE.PointLight(0xff7f38, 0, 13, 2);
  muzzleLight.castShadow = false;
  explosionLight.castShadow = false;
  group.add(muzzleLight, explosionLight);
  // pow: temporal decay exponent — explosion uses 3 (front-loaded punch that
  // collapses fast, see EXPLOSION_LIGHT_PEAK note), muzzle keeps 2.
  // r1 CLOCK-BASED AGING: lights (and rings below) age against the SHARED
  // particle clock (bornAt), not a self-advanced timer gated on !frozen —
  // the old self-timer never decayed across frozen stepped captures, so
  // every destroy_* frame past 0 s still carried the FULL 430-peak orange
  // blast light parked over the wreck (THE "uniform terracotta deck").
  const lightStates: LightState[] = [
    { light: muzzleLight, bornAt: -1e9, dur: MUZZLE_LIGHT_S, peak: MUZZLE_LIGHT_PEAK, pow: 2 },
    // pow 2.6 (was 1.15): front-loaded blast punch that visibly collapses —
    // the r5 near-linear decay was the "static painted stain" (r6 major)
    { light: explosionLight, bornAt: -1e9, dur: EXPLOSION_LIGHT_S, peak: EXPLOSION_LIGHT_PEAK, pow: 2.6 },
  ];

  function lightAge(state: LightState): number {
    return particles.getTime() - state.bornAt;
  }

  function applyLight(state: LightState): void {
    if (replaySuppressed) {
      state.light.intensity = 0;
      return;
    }
    const age = lightAge(state);
    const k = Math.max(0, 1 - age / state.dur);
    let v = state.peak * Math.pow(k, state.pow || 2);
    // r7 fire-moment exposure wash (critic: "at ignition the flash glow +
    // dust veil bleach the firing tank and ~half the frame to cream"): the
    // muzzle light ATTACKS over ~40 ms instead of stamping full peak on the
    // ignition frame — t=0/17 ms keep the hull camo legible, while the
    // composed 50 ms frame (and the 60 ms petal beat) still catch ~full peak.
    if (state.light === muzzleLight) v *= THREE.MathUtils.smoothstep(age, 0.0, 0.042);
    // r6: fire is never a steady lamp — the blast light carries a two-band
    // flicker past its initial pop so the floor pool visibly LIVES while it
    // collapses (the static-stain fix's motion half).
    if (state.light === explosionLight && k > 0 && k < 0.92) {
      const t = particles.getTime();
      v *= 0.80 + 0.13 * Math.sin(t * 15.3) + 0.07 * Math.sin(t * 7.7 + 1.3);
    }
    state.light.intensity = v;
  }

  function flashLight(
    state: LightState,
    pos: THREE.Vector3,
    peak: number,
    ageS = 0,
  ): void {
    state.light.position.copy(pos);
    state.bornAt = particles.getTime() - ageS;
    state.peak = peak;
    applyLight(state);
  }

  // --- tracer instanced mesh -------------------------------------------------
  const tracerGeo: TracerGeometry = new THREE.InstancedBufferGeometry();
  tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  tracerGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  tracerGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const trA = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 4), 4);
  const trB = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 4), 4);
  const trCore = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 3), 3);
  const trGlow = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 3), 3);
  const trTint = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS), 1);
  const tracerAttrs = [trA, trB, trCore, trGlow, trTint];
  for (const a of tracerAttrs) a.setUsage(THREE.DynamicDrawUsage);
  tracerGeo.setAttribute('aA', trA);
  tracerGeo.setAttribute('aB', trB);
  tracerGeo.setAttribute('aCore', trCore);
  tracerGeo.setAttribute('aGlow', trGlow);
  tracerGeo.setAttribute('aTint', trTint);
  tracerGeo.instanceCount = 0;
  const tracerMat = new THREE.ShaderMaterial({
    vertexShader: TRACER_VERT,
    fragmentShader: TRACER_FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uNearFade: { value: new THREE.Vector2(1.0, 3.8) },
    }),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,   // ribbon winding flips with view direction
    fog: true,
  });
  const tracerMesh = new THREE.Mesh(tracerGeo, tracerMat);
  tracerMesh.frustumCulled = false;
  tracerMesh.matrixAutoUpdate = false;
  tracerMesh.renderOrder = 24;
  tracerMesh.layers.set(LATE_FX_LAYER);
  group.add(tracerMesh);

  // Guided missiles need a readable projectile, not only the same short
  // ribbon used by supersonic shells. These two instanced pools draw a pale
  // missile body and its hot yellow exhaust point without allocating meshes
  // during flight. Geometry faces local +Z, matching projectile velocity.
  const atgmBodyGeo = new THREE.CylinderGeometry(0.15, 0.18, 1.25, 8, 1, false);
  atgmBodyGeo.rotateX(Math.PI / 2);
  const atgmBodyMat = new THREE.MeshBasicMaterial({ color: 0xffe15a });
  const atgmBodies = new THREE.InstancedMesh(atgmBodyGeo, atgmBodyMat, MAX_ATGM_BODIES);
  atgmBodies.count = 0;
  atgmBodies.frustumCulled = false;
  atgmBodies.renderOrder = 25;
  atgmBodies.layers.set(LATE_FX_LAYER);
  atgmBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const atgmFlareGeo = new THREE.SphereGeometry(0.25, 8, 6);
  const atgmFlareMat = new THREE.MeshBasicMaterial({
    color: 0xffd21f,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const atgmFlares = new THREE.InstancedMesh(atgmFlareGeo, atgmFlareMat, MAX_ATGM_BODIES);
  atgmFlares.count = 0;
  atgmFlares.frustumCulled = false;
  atgmFlares.renderOrder = 26;
  atgmFlares.layers.set(LATE_FX_LAYER);
  atgmFlares.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(atgmBodies, atgmFlares);

  // Static tracers (screenshot composers) survive per-frame rebuilds:
  // [ax,ay,az, bx,by,bz, width, bright, coreR,G,B, glowR,G,B, bornAtS] × N
  // bornAtS (r5): stepped-frozen-clock captures used to show the composed
  // bolt persisting unfaded for 2.5 s+ — statics now age against the shared
  // particle clock like everything else (full bright ≤0.3 s, gone by 0.9 s).
  const staticTracers: number[][] = [];
  // Afterglow trails: shellId -> { d: Float32Array(14), age, seen }
  const trails = new Map<ShellId, TracerTrail>();
  // Guided flight paths retain multiple sampled positions so steering reads
  // as a curved yellow trace. Each record owns one fixed buffer; the hot
  // render loop only shifts and rewrites it.
  const guidedTrails = new Map<ShellId, GuidedTrail>();
  const _trailCore: MutableVec3 = [0, 0, 0];
  const _trailGlow: MutableVec3 = [0, 0, 0];
  const _atgmCore: MutableVec3 = [1, 0.64, 0.015];
  const _atgmGlow: MutableVec3 = [1, 0.36, 0];
  const _atgmObject = new THREE.Object3D();
  const _atgmFlareObject = new THREE.Object3D();
  let renderedAtgmBodies = 0;
  let renderedAtgmTrailSegments = 0;

  // --- scorch decals (pooled, persistent, slope-aligned) ---------------------
  const MAX_SCORCH = 8;
  const scorchTex = makeScorchTexture(mulberry32((seed ^ 0x9e3779) >>> 0));
  const scorchMat = new THREE.MeshBasicMaterial({
    map: scorchTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  // r5 TERRAIN-DRAPED scorch: the old single-plane disc was slope-ALIGNED but
  // flat, so on any convex ground (road crowns, hill shoulders — i.e. exactly
  // where kills happen) its outer half cut UNDER the surface and the wreck
  // showed no ground scorch at all (r4 wreck-closeup major). Each pooled
  // decal now owns a 4-ring disc whose vertices are conformed to the sampled
  // terrain height at stamp time.
  const SCORCH_SEG = 24, SCORCH_RINGS = 4;
  function makeScorchDiscGeo() {
    const verts = [0, 0, 0];
    const uvs = [0.5, 0.5];
    const idx = [];
    for (let r = 1; r <= SCORCH_RINGS; r++) {
      const rad = r / SCORCH_RINGS;
      for (let s = 0; s < SCORCH_SEG; s++) {
        const a = (s / SCORCH_SEG) * Math.PI * 2;
        verts.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        uvs.push(Math.cos(a) * rad * 0.5 + 0.5, Math.sin(a) * rad * 0.5 + 0.5);
      }
    }
    const ringStart = (r: number) => 1 + (r - 1) * SCORCH_SEG;
    for (let s = 0; s < SCORCH_SEG; s++) idx.push(0, ringStart(1) + s, ringStart(1) + (s + 1) % SCORCH_SEG);
    for (let r = 1; r < SCORCH_RINGS; r++) {
      const a0 = ringStart(r), b0 = ringStart(r + 1);
      for (let s = 0; s < SCORCH_SEG; s++) {
        const s1 = (s + 1) % SCORCH_SEG;
        idx.push(a0 + s, b0 + s, b0 + s1, a0 + s, b0 + s1, a0 + s1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    return g;
  }
  const scorchTemplate = makeScorchDiscGeo();
  const scorchTemplatePos = bufferAttribute(scorchTemplate, 'position').array;
  const scorchMeshes: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>> = [];
  let scorchCursor = 0;
  for (let i = 0; i < MAX_SCORCH; i++) {
    const g = scorchTemplate.clone();
    bufferAttribute(g, 'position').setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Mesh(g, scorchMat);
    m.visible = false;
    m.frustumCulled = false; // vertices are written in world space
    m.matrixAutoUpdate = false;
    m.renderOrder = 2; // after terrain, before all particles
    group.add(m);
    scorchMeshes.push(m);
  }

  /** Stamp a charred-ground decal at (x, z), draped over the terrain. */
  function spawnScorch(x: number, z: number, radius: number): void {
    const m = scorchMeshes[scorchCursor];
    scorchCursor = (scorchCursor + 1) % MAX_SCORCH;
    const attr = bufferAttribute(m.geometry, 'position');
    const arr = attr.array;
    const yaw = rng() * Math.PI * 2;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let i = 0; i < arr.length; i += 3) {
      const lx = scorchTemplatePos[i], lz = scorchTemplatePos[i + 2];
      const wx = x + (lx * cy - lz * sy) * radius;
      const wz = z + (lx * sy + lz * cy) * radius;
      arr[i] = wx;
      arr[i + 1] = groundY(wx, wz) + 0.08;
      arr[i + 2] = wz;
    }
    attr.needsUpdate = true;
    m.visible = true;
  }

  // --- shockwave rings (pooled, ground-aligned, first ~400 ms of a blast) ----
  // Normal-blended dusty tint at low opacity: a translucent pressure/dust
  // wave skimming the grass — the r5 additive cream torus read as geometry.
  const SHOCK_DUR = 0.4;
  const shockTex = makeShockRingTexture(mulberry32((seed ^ 0x3c6ef3) >>> 0));
  const shockGeo = new THREE.CircleGeometry(1, 48);
  shockGeo.rotateX(-Math.PI / 2); // face up
  const shockRings: ShockRingState[] = [];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: shockTex,
      color: 0x90887a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const m = new THREE.Mesh(shockGeo, mat);
    m.visible = false;
    m.renderOrder = 20;
    m.layers.set(LATE_FX_LAYER);
    group.add(m);
    shockRings.push({ mesh: m, mat, bornAt: -1e9 });
  }
  let shockCursor = 0;

  function applyShockRing(r: ShockRingState): void {
    if (replaySuppressed) {
      r.mesh.visible = false;
      r.mat.opacity = 0;
      return;
    }
    const t = (particles.getTime() - r.bornAt) / SHOCK_DUR;
    if (t >= 1 || t < 0) { r.mesh.visible = false; r.mat.opacity = 0; return; }
    const k = 1 - Math.pow(1 - t, 2.4);         // fast launch, decelerating
    // r7 (critic: "no readable expanding ground shockwave ring in the first
    // 400 ms"): faster radial launch + ~50% more opacity so the ring reads
    // against road/dirt at the 20 m kill framing before it dies at 400 ms.
    r.mesh.scale.setScalar((1.6 + 14.5 * k) * (r.scaleK || 1));
    r.mat.opacity = 0.45 * (r.alphaK || 1) * Math.pow(1 - t, 1.5);
    r.mesh.visible = true;
  }

  /**
   * Launch a pressure ring expanding across the ground from (x, z).
   * scaleK/alphaK let the muzzle-blast reuse the pool at reduced footprint
   * (r4: the 120 mm live fire event needs a visible ground pressure wave —
   * the bore-axis "refraction ring" is hard-gated off side-on framings).
   */
  function spawnShockRing(
    x: number,
    z: number,
    ageS = 0,
    scaleK = 1,
    alphaK = 1,
  ): void {
    const r = shockRings[shockCursor];
    shockCursor = (shockCursor + 1) % shockRings.length;
    r.mesh.position.set(x, groundY(x, z) + 0.35, z);
    r.scaleK = scaleK;
    r.alphaK = alphaK;
    r.bornAt = particles.getTime() - ageS;
    applyShockRing(r);
  }

  // --- muzzle shock rings (pooled, bore-axis aligned, first ~200 ms) ---------
  // Cheap "refraction ring" read: a soft additive annulus perpendicular to
  // the bore that expands away from the brake and fades fast.
  const MUZZLE_RING_DUR = 0.2;
  const muzzleRingGeo = new THREE.PlaneGeometry(2, 2);
  const muzzleRings: MuzzleRingState[] = [];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: shockTex,
      color: 0xfff3dd,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(muzzleRingGeo, mat);
    m.visible = false;
    m.renderOrder = 23;
    m.layers.set(LATE_FX_LAYER);
    group.add(m);
    muzzleRings.push({ mesh: m, mat, bornAt: -1e9, att: 1, dir: new THREE.Vector3(0, 0, 1), origin: new THREE.Vector3() });
  }
  let muzzleRingCursor = 0;
  // SceneAAPass discovers this state on the top-level fx group. The copied
  // scene-depth uniforms come from the particle system; the activity gate
  // also includes non-particle late FX so a lone tracer/ring is never skipped.
  group.userData.softParticles = {
    ...particles.softParticles,
    isActive: () => particles.softParticles.isActive()
      || tracerGeo.instanceCount > 0
      || atgmBodies.count > 0
      || shockRings.some((r) => r.mesh.visible)
      || muzzleRings.some((r) => r.mesh.visible),
  };
  const _Z = new THREE.Vector3(0, 0, 1); // read-only

  function applyMuzzleRing(r: MuzzleRingState): void {
    if (replaySuppressed) {
      r.mesh.visible = false;
      r.mat.opacity = 0;
      return;
    }
    const t = (particles.getTime() - r.bornAt) / MUZZLE_RING_DUR;
    if (t >= 1 || t < 0) { r.mesh.visible = false; r.mat.opacity = 0; return; }
    const k = 1 - Math.pow(1 - t, 2.2);
    r.mesh.position.copy(r.origin).addScaledVector(r.dir, 0.25 + 1.7 * k);
    r.mesh.scale.setScalar(0.35 + 1.5 * k);
    // view-angle fade: full strength looking down the bore, HARD-GATED off
    // below ~55° alignment — the pow(align, 1.6) residual left a bright
    // vertical spike from side-on cameras that crossed the horizontal tracer
    // into a 4-point lens-flare diamond (r6 fire2/kill frames).
    // CRITICAL (r5): this must use _camV, NOT _v4 — bindBus passes the shared
    // _v4 scratch as `dir` into muzzleFlash, and spawnMuzzleFlash calls
    // spawnMuzzleRing -> applyMuzzleRing MID-FLASH. Writing _v4 here turned
    // the caller's fire direction into an ~11 m camera-ward vector, so every
    // element emitted after the ring (tongues, bore spark fan, jets, smoke,
    // dust, sabot petals, the muzzle light anchor) launched at 100-250 m/s
    // along the VIEW RAY — the r4 "screen-crossing amber beam through the
    // firing tank" + full-frame amber wash + vanishing muzzle smoke.
    let align = 1;
    const cam = engineCtx && engineCtx.camera;
    if (cam) {
      _camV.copy(cam.position).sub(r.mesh.position);
      const len = _camV.length();
      if (len > 1e-4) align = Math.abs(_camV.dot(r.dir)) / len;
    }
    const aGate = THREE.MathUtils.smoothstep(align, 0.62, 0.9);
    if (aGate <= 0.001) { r.mesh.visible = false; r.mat.opacity = 0; return; }
    r.mat.opacity = 0.30 * r.att * Math.pow(1 - t, 1.7) * aGate;
    r.mesh.visible = true;
  }

  /** Expanding pressure ring blown out along the bore axis. */
  function spawnMuzzleRing(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    s: number,
    ageS = 0,
    att = 1,
  ): void {
    const r = muzzleRings[muzzleRingCursor];
    muzzleRingCursor = (muzzleRingCursor + 1) % muzzleRings.length;
    r.origin.copy(pos);
    r.dir.copy(dir);
    r.att = att;
    r.mesh.quaternion.setFromUnitVectors(_Z, dir);
    r.mesh.scale.setScalar(s);
    r.bornAt = particles.getTime() - ageS;
    applyMuzzleRing(r);
  }

  // --- armor impact decals (src/fx/impactDecals.ts) --------------------------
  // Ballistic scarring stamped into the struck NODE's local space (hull root
  // or rig_turret): pen holes with molten rims + spall, ricochet gouges
  // aligned to the impact tangent, HE scorch blots, non-pen scuffs. Replaces
  // the old 14-quad near-black scar pool (the "plain black rhombus" marks —
  // which additionally turned into OPAQUE burnt quads on every wreck when
  // tankFactory's burn sweep hit their un-hookable Basic material). Decals
  // are per-vehicle (cap 24, oldest evicted), persist for the battle and are
  // cleared when the vehicle wrecks — see the tank:destroyed handler and
  // spawnDestruction, which clear BEFORE setDestroyed's material traverse
  // can ever see a decal mesh.
  const impactDecals = createImpactDecals({
    anisotropy: engineCtx && engineCtx.anisotropy,
    seed: (seed ^ 0x51f7a3) >>> 0,
  });
  function isDecalEntity(value: object | null | undefined): value is FxEntity {
    if (!value) return false;
    const entity = value as Partial<FxEntity>;
    return !!entity.visual?.root && !!entity.state;
  }

  /** targetId -> live presentation entity. Production injects this resolver
   *  from the composition root; the diagnostics fallback only preserves
   *  standalone engineering harnesses that construct FX directly. */
  function decalEntityFor(targetId: ShellId | null | undefined): FxEntity | null {
    if (targetId == null) return null;
    const resolved = resolveEntity?.(targetId);
    if (isDecalEntity(resolved)) return resolved;
    if (typeof window === 'undefined') return null;
    const dbg = window.__DEBUG;
    const g = dbg && dbg.game;
    const ent = g && g.tankById ? g.tankById.get(targetId) : null;
    return isDecalEntity(ent) ? ent : null;
  }
  /** decal sweep accumulator (see update()) */
  let decalSweepAcc = 0;

  // --- track-print decals (r1: "no track-print decals behind the sprockets") -
  // A ring of terrain-conformed dark quads stamped under each moving track,
  // fading over ~12 s — a driving tank leaves a readable print corridor.
  // One draw call: CPU writes 4 conformed corners per stamp into a shared
  // dynamic buffer; the shader fades each print against the fx clock.
  const MAX_PRINTS = 96;
  const PRINT_DUR = 12;
  const printTex = (() => {
    const prng = mulberry32((seed ^ 0x77d1e5) >>> 0);
    const s = 64, h = 128;
    const cv = document.createElement('canvas');
    cv.width = s; cv.height = h;
    const ctx = context2d(cv, { willReadFrequently: true });
    ctx.clearRect(0, 0, s, h);
    // ladder of track-pad rungs with ragged edges
    for (let y = 4; y < h - 4; y += 11) {
      const a = 0.45 + prng() * 0.35;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(6 + prng() * 4, y + prng() * 2, s - 14, 6);
    }
    // fbm erosion so prints never read as clean stamped rectangles
    const fbm = makeFbm(prng);
    const img = ctx.getImageData(0, 0, s, h);
    const dd = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < s; x++) {
        const n = fbm(x / s * 1.8, y / h * 3.4);
        dd[(y * s + x) * 4 + 3] *= Math.max(0, Math.min(1, n * 1.9 - 0.25));
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  })();
  const printGeo = new THREE.BufferGeometry();
  const printPos = new THREE.Float32BufferAttribute(new Float32Array(MAX_PRINTS * 4 * 3), 3);
  const printUv = new THREE.Float32BufferAttribute(new Float32Array(MAX_PRINTS * 4 * 2), 2);
  const printBirth = new THREE.Float32BufferAttribute(new Float32Array(MAX_PRINTS * 4).fill(-1e9), 1);
  // 0 = dry tread print, 1 = churned-water wake. Sharing the same dynamic
  // quad ring keeps wet interaction inside the existing single draw call.
  const printSurface = new THREE.Float32BufferAttribute(new Float32Array(MAX_PRINTS * 4), 1);
  printPos.setUsage(THREE.DynamicDrawUsage);
  printBirth.setUsage(THREE.DynamicDrawUsage);
  printSurface.setUsage(THREE.DynamicDrawUsage);
  {
    const idx = [];
    const uvArr = printUv.array;
    for (let i = 0; i < MAX_PRINTS; i++) {
      const v = i * 4;
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      uvArr[v * 2] = 0; uvArr[v * 2 + 1] = 0;
      uvArr[v * 2 + 2] = 1; uvArr[v * 2 + 3] = 0;
      uvArr[v * 2 + 4] = 1; uvArr[v * 2 + 5] = 1;
      uvArr[v * 2 + 6] = 0; uvArr[v * 2 + 7] = 1;
    }
    printGeo.setAttribute('position', printPos);
    printGeo.setAttribute('uv', printUv);
    printGeo.setAttribute('aBirth', printBirth);
    printGeo.setAttribute('aSurface', printSurface);
    printGeo.setIndex(idx);
  }
  const printUniforms = { uTime: { value: 0 }, uMap: { value: printTex } };
  const printMat = new THREE.ShaderMaterial({
    uniforms: printUniforms,
    vertexShader: `
      attribute float aBirth;
      attribute float aSurface;
      varying vec2 vUv;
      varying float vFade;
      varying float vWater;
      uniform float uTime;
      void main() {
        vUv = uv;
        vWater = aSurface;
        float age = uTime - aBirth;
        float duration = mix(${PRINT_DUR.toFixed(1)}, 4.6, vWater);
        vFade = ( age >= 0.0 && age < duration )
          ? 1.0 - age / duration : 0.0;
        gl_Position = vFade <= 0.0 ? vec4( 0.0, 0.0, 2.0, 1.0 )
          : projectionMatrix * viewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying float vFade;
      varying float vWater;
      void main() {
        float strength = mix(0.34, 0.52, vWater);
        float a = texture2D( uMap, vUv ).a * vFade * strength;
        if ( a < 0.01 ) discard;
        vec3 color = mix(vec3(0.055, 0.05, 0.042), vec3(0.74, 0.84, 0.84), vWater);
        gl_FragColor = vec4(color, a);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const printMesh = new THREE.Mesh(printGeo, printMat);
  printMesh.frustumCulled = false;
  printMesh.matrixAutoUpdate = false;
  printMesh.renderOrder = 3;
  group.add(printMesh);
  const printCenters = new Float32Array(MAX_PRINTS * 2).fill(1e9);
  let printCursor = 0;

  /** Stamp one dry print or water wake at (pos) aligned to dir. */
  function stampTrackPrint(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    water = false,
  ): void {
    for (let i = 0; i < MAX_PRINTS; i++) {
      const dx = pos.x - printCenters[i * 2], dz = pos.z - printCenters[i * 2 + 1];
      if (dx * dx + dz * dz < 0.85) return; // a print already covers this spot
    }
    const i = printCursor;
    printCursor = (printCursor + 1) % MAX_PRINTS;
    printCenters[i * 2] = pos.x; printCenters[i * 2 + 1] = pos.z;
    let fx2 = dir.x, fz2 = dir.z;
    const fl = Math.hypot(fx2, fz2) || 1;
    fx2 /= fl; fz2 /= fl;
    const rx = fz2, rz = -fx2;
    const hw = water ? 0.38 : 0.30;
    const hl = water ? 0.78 : 0.62;
    const arr = printPos.array;
    const v = i * 4 * 3;
    const corners = [
      [pos.x - rx * hw - fx2 * hl, pos.z - rz * hw - fz2 * hl],
      [pos.x + rx * hw - fx2 * hl, pos.z + rz * hw - fz2 * hl],
      [pos.x + rx * hw + fx2 * hl, pos.z + rz * hw + fz2 * hl],
      [pos.x - rx * hw + fx2 * hl, pos.z - rz * hw + fz2 * hl],
    ];
    for (let k = 0; k < 4; k++) {
      arr[v + k * 3] = corners[k][0];
      arr[v + k * 3 + 1] = groundY(corners[k][0], corners[k][1]) + (water ? 0.065 : 0.035);
      arr[v + k * 3 + 2] = corners[k][1];
    }
    const b = printBirth.array;
    b[i * 4] = b[i * 4 + 1] = b[i * 4 + 2] = b[i * 4 + 3] = particles.getTime();
    const s = printSurface.array;
    s[i * 4] = s[i * 4 + 1] = s[i * 4 + 2] = s[i * 4 + 3] = water ? 1 : 0;
    printPos.addUpdateRange(v, 12);
    printBirth.addUpdateRange(i * 4, 4);
    printSurface.addUpdateRange(i * 4, 4);
    printPos.needsUpdate = true;
    printBirth.needsUpdate = true;
    printSurface.needsUpdate = true;
  }

  const _coreArr: MutableVec3 = [0, 0, 0];
  const _glowArr: MutableVec3 = [0, 0, 0];

  function writeTracer(
    i: number,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    width: number,
    bright: number,
    core: MutableVec3,
    glow: MutableVec3,
    tint = 0,
  ): void {
    let j = i * 4;
    trA.array[j] = ax; trA.array[j + 1] = ay; trA.array[j + 2] = az; trA.array[j + 3] = width;
    trB.array[j] = bx; trB.array[j + 1] = by; trB.array[j + 2] = bz; trB.array[j + 3] = bright;
    j = i * 3;
    trCore.array[j] = core[0]; trCore.array[j + 1] = core[1]; trCore.array[j + 2] = core[2];
    trGlow.array[j] = glow[0]; trGlow.array[j + 1] = glow[1]; trGlow.array[j + 2] = glow[2];
    trTint.array[i] = tint;
  }

  function appendGuidedTrailPoint(
    trail: GuidedTrail,
    x: number,
    y: number,
    z: number,
  ): void {
    const points = trail.points;
    const count = trail.count;
    if (count > 0) {
      const p = (count - 1) * 3;
      const dx = x - points[p], dy = y - points[p + 1], dz = z - points[p + 2];
      if (dx * dx + dy * dy + dz * dz < ATGM_TRAIL_SPACING_M * ATGM_TRAIL_SPACING_M) {
        points[p] = x; points[p + 1] = y; points[p + 2] = z;
        return;
      }
    }
    if (trail.count >= ATGM_TRAIL_POINTS) {
      points.copyWithin(0, 3, ATGM_TRAIL_POINTS * 3);
      trail.count = ATGM_TRAIL_POINTS - 1;
    }
    const p = trail.count * 3;
    points[p] = x; points[p + 1] = y; points[p + 2] = z;
    trail.count++;
  }

  function writeGuidedTrail(
    trail: GuidedTrail,
    firstInstance: number,
    opacity = 1,
  ): number {
    let instance = firstInstance;
    const points = trail.points;
    const denom = Math.max(1, trail.count - 1);
    for (let i = 1; i < trail.count && instance < MAX_TRACERS; i++) {
      const a = (i - 1) * 3;
      const b = i * 3;
      const head = i / denom;
      writeTracer(instance++,
        points[a], points[a + 1], points[a + 2],
        points[b], points[b + 1], points[b + 2],
        0.08 + 0.09 * head,
        (0.55 + 1.05 * head) * opacity,
        _atgmCore, _atgmGlow, 1);
      renderedAtgmTrailSegments++;
    }
    return instance;
  }

  // --- timers, continuous emitters, event bookkeeping ------------------------
  /** @type {{t:number, fn:Function}[]} pending one-shot callbacks (sim-frozen aware) */
  const timers: FxTimer[] = [];
  /** @type {{key:string|null, pos:number[], localPos?:number[], anchorSpace?:object,
   * anchorMode?:string, attachmentResolved?:boolean, acc:number, ttl:number,
   * scale:number}[]} smoke-column emitters */
  const columns: SmokeColumn[] = [];
  /** last known world position per tank id (fed by bus events that carry pos) */
  const lastKnownPos = new Map<string, MutableVec3>();
  // world-dressing r1: shellId -> shell type, so a world impact knows whether
  // it was HE (radius-breaks destructible props) — fed by shell:fired,
  // cleared on shell:expired (+ a hard size guard against leaks).
  const shellKinds = new Map<ShellId, string>();
  // world-dressing r1: shellId -> last swept point. The sim can step a shell
  // several fixed ticks per render frame (an APFSDS covers ~28 m/tick), so
  // sweeping only prevPos->pos would leave gaps a whole haystack fits into —
  // chaining from the last swept point makes flight coverage continuous.
  const sweepTails = new Map<ShellId, MutableVec3>();
  const _sweepSeen = new Set<ShellId>();
  /** r4: clock cursor for delta-driven emitters (see update()) */
  let lastTickS = 0;
  /** r4: seconds since battle start (resetAll) — drives the exhaust
   *  cold-start belch during the opening flyby */
  let battleFreshS = 999;

  function groundY(x: number, z: number): number {
    return heightField && heightField.getHeightAt ? heightField.getHeightAt(x, z) : 0;
  }

  function calScale(caliberMm: number): number {
    return THREE.MathUtils.clamp(caliberMm / 100, 0.5, 1.7);
  }

  // --------------------------------------------------------------------------
  // Effect recipes (birthOffset lets the screenshot composers backdate spawns)
  // --------------------------------------------------------------------------

  /**
   * True when the camera is scoped (sniper view) and `pos` is the player's
   * own muzzle right in front of the lens — WoT hides own-gun flash geometry
   * in the scope and sells the shot with light + shake instead.
   */
  function scopedOwnGun(pos: THREE.Vector3): boolean {
    const cam = engineCtx && engineCtx.camera;
    return !!(cam && cam.userData && cam.userData.scoped &&
      cam.position.distanceToSquared(pos) < 100);
  }

  interface MuzzleFlashState {
    pos: THREE.Vector3;
    dir: THREE.Vector3;
    caliberMm: number;
    birthOffset: number;
    reach: number;
    s: number;
    scoped: boolean;
    nearAtt: number;
    dkF: number;
    axSize: number;
    axSizeC: number;
    axAtt: number;
    lightK: number;
  }

  const muzzleFlashState: MuzzleFlashState = {
    pos: _mfPos,
    dir: _mfDir,
    caliberMm: 0,
    birthOffset: 0,
    reach: 1,
    s: 1,
    scoped: false,
    nearAtt: 1,
    dkF: 1,
    axSize: 1,
    axSizeC: 1,
    axAtt: 1,
    lightK: 1,
  };

  function emitMuzzleCoreAndPetals(state: MuzzleFlashState): void {
    const { pos, dir, s, caliberMm, birthOffset, axSize, axSizeC, axAtt } = state;
    _puffO.pos[0] = pos.x + dir.x * 0.12; _puffO.pos[1] = pos.y + dir.y * 0.12; _puffO.pos[2] = pos.z + dir.z * 0.12;
    _puffO.vel[0] = dir.x * 1.5; _puffO.vel[1] = dir.y * 1.5; _puffO.vel[2] = dir.z * 1.5;
    _puffO.life = Math.max(0.105, -birthOffset * 2.6);
    const coreK = 0.8 + (caliberMm / 120) * 0.5;
    _puffO.size0 = 0.66 * s * axSizeC * coreK; _puffO.size1 = 1.62 * s * axSizeC * coreK;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xffffff, _puffO.col0); col3(0xffffff, _puffO.col1);
    _puffO.alpha = 0.32 + 0.42 * axAtt; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
    particles.emit('flash', _puffO);
    _puffO.life = Math.max(0.17, -birthOffset * 3.0);
    _puffO.size0 = 0.55 * s * axSizeC * coreK; _puffO.size1 = 1.38 * s * axSizeC * coreK;
    _puffO.rotVel = (rng() - 0.5) * 2;
    col3(0xffffff, _puffO.col0); col3(0xffc558, _puffO.col1);
    particles.emit('flash', _puffO);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4 + rng() * 0.6;
      const tilt = 1.02 + rng() * 0.3;
      const st2 = Math.sin(tilt), ct2 = Math.cos(tilt);
      _sv.set(
        dir.x * ct2 + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * st2,
        dir.y * ct2 + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * st2,
        dir.z * ct2 + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * st2,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.14; _jetO.pos[1] = pos.y + dir.y * 0.14; _jetO.pos[2] = pos.z + dir.z * 0.14;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = Math.max(0.07 + rng() * 0.03, -birthOffset * 1.5);
      _jetO.width = 0.20 * s * axSize;
      _jetO.len0 = 0.42 * s; _jetO.len1 = (1.0 + rng() * 0.4) * s;
      _jetO.seed = rng();
      col3(0xfff0c4, _jetO.col);
      _jetO.alpha = 0.92 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    if (birthOffset >= 0) {
      spawnMuzzleRing(_sv.set(pos.x + dir.x * 0.3, pos.y + dir.y * 0.3, pos.z + dir.z * 0.3),
        dir, s * axSize, 0, axAtt);
    }
  }

  function emitMuzzleAxialAndBrakeJets(state: MuzzleFlashState): void {
    const { pos, dir, s, birthOffset, reach, dkF, axSize, axAtt } = state;
    for (let i = 0; i < 3; i++) {
      const off = i === 0 ? 0 : 0.10 + rng() * 0.08;
      const a = rng() * Math.PI * 2;
      _sv.set(
        dir.x + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * off,
        dir.y + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * off,
        dir.z + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * off,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.1; _jetO.pos[1] = pos.y + dir.y * 0.1; _jetO.pos[2] = pos.z + dir.z * 0.1;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = Math.max(i === 0 ? 0.135 : 0.105, -birthOffset * 2.2);
      _jetO.width = (i === 0 ? 0.38 : 0.28) * s * axSize;
      _jetO.len0 = 0.40 * s;
      _jetO.len1 = (i === 0 ? 1.6 + rng() * 0.4 : 1.1 + rng() * 0.35) * s * reach *
        (0.7 + 0.3 * dkF);
      _jetO.seed = rng();
      col3(i === 0 ? 0xffe6b0 : 0xffcf7e, _jetO.col);
      _jetO.alpha = (i === 0 ? 0.7 : 0.45) * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    for (let i = 0; i < 2; i++) {
      const a = rng() * Math.PI * 2;
      _sv.set(
        -dir.x * 0.6 + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)),
        -dir.y * 0.6 + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)),
        -dir.z * 0.6 + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)),
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.06; _jetO.pos[1] = pos.y + dir.y * 0.06; _jetO.pos[2] = pos.z + dir.z * 0.06;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.07 + rng() * 0.02;
      _jetO.width = 0.20 * s * axSize;
      _jetO.len0 = 0.2 * s; _jetO.len1 = (0.55 + rng() * 0.2) * s;
      _jetO.seed = rng();
      col3(0xffd88a, _jetO.col);
      _jetO.alpha = 0.5 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    _puffO.pos[0] = pos.x - dir.x * 0.22; _puffO.pos[1] = pos.y - dir.y * 0.22; _puffO.pos[2] = pos.z - dir.z * 0.22;
    _puffO.vel[0] = -dir.x * 1.2; _puffO.vel[1] = -dir.y * 1.2 + 0.3; _puffO.vel[2] = -dir.z * 1.2;
    _puffO.life = 0.07;
    _puffO.size0 = 0.5 * s * axSize; _puffO.size1 = 0.72 * s * axSize;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xfff1cc, _puffO.col0); col3(0xffb050, _puffO.col1);
    _puffO.alpha = 0.55 * axAtt; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
    particles.emit('flash', _puffO);
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.5 + rng() * 0.9;
      _sv.set(
        (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * 0.55 + dir.x * 0.65,
        (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * 0.55 + dir.y * 0.65,
        (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * 0.55 + dir.z * 0.65,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.22; _jetO.pos[1] = pos.y + dir.y * 0.22; _jetO.pos[2] = pos.z + dir.z * 0.22;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.06 + rng() * 0.02;
      _jetO.width = 0.17 * s * axSize;
      _jetO.len0 = 0.22 * s; _jetO.len1 = (0.45 + rng() * 0.20) * s * Math.max(reach, 0.7);
      _jetO.seed = rng();
      col3(0xffc86e, _jetO.col);
      _jetO.alpha = 0.40 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
  }

  function emitMuzzleCombustionAndAfterflash(state: MuzzleFlashState): void {
    const { pos, dir, s, birthOffset, axSize, axAtt } = state;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng() * 1.1;
      const tilt = 0.22 + rng() * 0.15;
      const st = Math.sin(tilt), ct = Math.cos(tilt);
      _sv.set(
        dir.x * ct + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * st,
        dir.y * ct + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * st,
        dir.z * ct + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * st,
      ).normalize();
      _jetO.pos[0] = pos.x + dir.x * 0.16; _jetO.pos[1] = pos.y + dir.y * 0.16; _jetO.pos[2] = pos.z + dir.z * 0.16;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.07 + rng() * 0.04;
      _jetO.width = (0.19 + rng() * 0.05) * s * axSize;
      _jetO.len0 = 0.16 * s; _jetO.len1 = (0.55 + rng() * 0.35) * s;
      _jetO.seed = rng();
      col3(0xffdf9a, _jetO.col);
      _jetO.alpha = 0.32 * axAtt; _jetO.birthOffset = birthOffset;
      particles.emit('jet', _jetO);
    }
    for (let i = 0; i < 2; i++) {
      const j = i < 1 ? 0 : 0.22;
      const jx = (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * j;
      const jy = (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * j;
      const jz = (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * j;
      const v = ((i < 1 ? 14 : 11) + rng() * 4) * state.reach;
      _strkO.pos[0] = pos.x + dir.x * 0.2; _strkO.pos[1] = pos.y + dir.y * 0.2; _strkO.pos[2] = pos.z + dir.z * 0.2;
      _strkO.vel[0] = dir.x * v + jx; _strkO.vel[1] = dir.y * v + jy; _strkO.vel[2] = dir.z * v + jz;
      _strkO.life = 0.06 + rng() * 0.04;
      _strkO.width = (0.06 + rng() * 0.05) * s; _strkO.stretch = 0.05; _strkO.grav = 0;
      col3(0xffc25e, _strkO.col); _strkO.alpha = 0.7 * axAtt; _strkO.seed = rng(); _strkO.birthOffset = birthOffset;
      particles.emit('sparks', _strkO);
    }
    for (let i = 0; i < 3; i++) {
      const along = 0.3 + rng() * 0.55 * s;
      _puffO.pos[0] = pos.x + dir.x * along + (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * 0.16 * s;
      _puffO.pos[1] = pos.y + dir.y * along + (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * 0.16 * s;
      _puffO.pos[2] = pos.z + dir.z * along + (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * 0.16 * s;
      const v = 4 + rng() * 4;
      _puffO.vel[0] = dir.x * v; _puffO.vel[1] = dir.y * v; _puffO.vel[2] = dir.z * v;
      _puffO.life = 0.05 + rng() * 0.05;
      _puffO.size0 = 0.26 * s; _puffO.size1 = 0.62 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 8;
      col3(0xffe9a0, _puffO.col0); col3(0xff6a14, _puffO.col1);
      _puffO.alpha = 0.38 * axAtt; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
    for (let i = 0; i < 6; i++) {
      const along = (0.22 + rng() * 0.7) * s;
      _puffO.pos[0] = pos.x + dir.x * along + (_v1.x * (rng() - 0.5) + _v2.x * (rng() - 0.5)) * 0.14 * s;
      _puffO.pos[1] = pos.y + dir.y * along + (_v1.y * (rng() - 0.5) + _v2.y * (rng() - 0.5)) * 0.14 * s;
      _puffO.pos[2] = pos.z + dir.z * along + (_v1.z * (rng() - 0.5) + _v2.z * (rng() - 0.5)) * 0.14 * s;
      const v = 2.2 + rng() * 2.8;
      _puffO.vel[0] = dir.x * v + (rng() - 0.5) * 0.6;
      _puffO.vel[1] = dir.y * v + 0.35 + rng() * 0.4;
      _puffO.vel[2] = dir.z * v + (rng() - 0.5) * 0.6;
      _puffO.life = 0.08 + rng() * 0.08;
      _puffO.size0 = 0.34 * s; _puffO.size1 = (0.85 + rng() * 0.55) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 6;
      col3(0xffb45e, _puffO.col0); col3(0xb3491a, _puffO.col1);
      _puffO.alpha = 0.4 * (0.4 + 0.6 * axAtt); _puffO.grav = 0.6; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
  }

  function emitMuzzlePropellantMass(state: MuzzleFlashState): void {
    const { pos, dir, s, birthOffset } = state;
    for (let i = 0; i < 7; i++) {
      const along = 0.3 + (i / 6) * 1.9 + rng() * 0.35;
      const la = rng() * Math.PI * 2;
      const lr = rng() * 0.30 * s;
      _puffO.pos[0] = pos.x + dir.x * along + (_v1.x * Math.cos(la) + _v2.x * Math.sin(la)) * lr;
      _puffO.pos[1] = pos.y + dir.y * along + (_v1.y * Math.cos(la) + _v2.y * Math.sin(la)) * lr;
      _puffO.pos[2] = pos.z + dir.z * along + (_v1.z * Math.cos(la) + _v2.z * Math.sin(la)) * lr;
      _puffO.vel[0] = dir.x * (1.8 + rng() * 1.6) + (rng() - 0.5) * 0.8 + 0.3;
      _puffO.vel[1] = dir.y * (1.8 + rng() * 1.6) + 0.5 + rng() * 0.5;
      _puffO.vel[2] = dir.z * (1.8 + rng() * 1.6) + (rng() - 0.5) * 0.8;
      _puffO.life = 1.5 + rng() * 1.3;
      _puffO.size0 = (1.6 + rng() * 0.7) * s; _puffO.size1 = (3.0 + rng() * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.2;
      col3(0xaba79f, _puffO.col0); col3(0x8f8c86, _puffO.col1);
      _puffO.alpha = 0.16 + rng() * 0.07; _puffO.grav = 0.4;
      _puffO.birthOffset = birthOffset - 0.09 - rng() * 0.06;
      particles.emit('psmoke', _puffO);
    }
    for (let i = 0; i < 3; i++) {
      const la = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x - dir.x * 0.25 + (_v1.x * Math.cos(la) + _v2.x * Math.sin(la)) * 0.2;
      _puffO.pos[1] = pos.y - dir.y * 0.25 + (_v1.y * Math.cos(la) + _v2.y * Math.sin(la)) * 0.2;
      _puffO.pos[2] = pos.z - dir.z * 0.25 + (_v1.z * Math.cos(la) + _v2.z * Math.sin(la)) * 0.2;
      _puffO.vel[0] = -dir.x * (0.9 + rng() * 0.7) + (rng() - 0.5) * 0.7 + 0.3;
      _puffO.vel[1] = 0.7 + rng() * 0.6;
      _puffO.vel[2] = -dir.z * (0.9 + rng() * 0.7) + (rng() - 0.5) * 0.7;
      _puffO.life = 1.4 + rng() * 0.9;
      _puffO.size0 = 0.9 * s; _puffO.size1 = (2.1 + rng() * 1.0) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xaea99f, _puffO.col0); col3(0x928f88, _puffO.col1);
      _puffO.alpha = 0.18 + rng() * 0.07; _puffO.grav = 0.4;
      _puffO.birthOffset = birthOffset - 0.08;
      particles.emit('psmoke', _puffO);
    }
  }

  function emitMuzzleSmoke(state: MuzzleFlashState): void {
    const { pos, dir, s, birthOffset, scoped } = state;
    const smokeBirth = birthOffset - 0.2;
    const smokeA = scoped ? 0.30 : 0.62;
    const lifeK = scoped ? 0.45 : 1;
    const donutCount = scoped ? 4 : 9;
    for (let i = 0; i < donutCount; i++) {
      const a = rng() * Math.PI * 2;
      const r = (0.15 + rng() * 0.24) * s;
      const rx = _v1.x * Math.cos(a) + _v2.x * Math.sin(a);
      const ry = _v1.y * Math.cos(a) + _v2.y * Math.sin(a);
      const rz = _v1.z * Math.cos(a) + _v2.z * Math.sin(a);
      const along = 0.4 + rng() * 0.5;
      _puffO.pos[0] = pos.x + dir.x * along + rx * r;
      _puffO.pos[1] = pos.y + dir.y * along + ry * r;
      _puffO.pos[2] = pos.z + dir.z * along + rz * r;
      const v = 2.4 + rng() * 2.6;
      const fwd = 2.2 + rng() * 2.4;
      _puffO.vel[0] = rx * v + dir.x * fwd; _puffO.vel[1] = ry * v + dir.y * fwd; _puffO.vel[2] = rz * v + dir.z * fwd;
      _puffO.life = (1.6 + rng() * 1.2) * lifeK;
      _puffO.size0 = (0.9 + rng() * 0.45) * s; _puffO.size1 = (2.3 + rng() * 1.7) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0xb1ada4, _puffO.col0); col3(0x94918b, _puffO.col1);
      _puffO.alpha = (0.19 + rng() * 0.13) * smokeA; _puffO.grav = 0.6;
      _puffO.birthOffset = smokeBirth - rng() * 0.30;
      particles.emit('psmoke', _puffO);
    }
    const plumeCount = scoped ? 4 : 10;
    for (let i = 0; i < plumeCount; i++) {
      const along = 0.8 + rng() * 3.2 * s;
      const lat = along * 0.24 * (rng() - 0.5) * 2;
      const la = rng() * Math.PI * 2;
      const lx = _v1.x * Math.cos(la) + _v2.x * Math.sin(la);
      const ly = _v1.y * Math.cos(la) + _v2.y * Math.sin(la);
      const lz = _v1.z * Math.cos(la) + _v2.z * Math.sin(la);
      _puffO.pos[0] = pos.x + dir.x * along + lx * lat;
      _puffO.pos[1] = pos.y + dir.y * along + ly * lat;
      _puffO.pos[2] = pos.z + dir.z * along + lz * lat;
      const v = 4 + rng() * 5;
      _puffO.vel[0] = dir.x * v + lx * 1.1 + 0.4 + (rng() - 0.5) * 0.6;
      _puffO.vel[1] = dir.y * v + ly * 1.1 + 0.7 + rng() * 0.7;
      _puffO.vel[2] = dir.z * v + lz * 1.1 + (rng() - 0.5) * 0.6;
      _puffO.life = (1.7 + rng() * 1.5) * lifeK;
      _puffO.size0 = (0.6 + rng() * 0.35) * s; _puffO.size1 = (1.7 + rng() * 1.5) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xbdb9b1, _puffO.col0); col3(0x94928c, _puffO.col1);
      _puffO.alpha = (0.10 + rng() * 0.11) * smokeA; _puffO.grav = 0.5;
      _puffO.birthOffset = smokeBirth - rng() * 0.35 - (along / (3.2 * s + 0.8)) * 0.25;
      particles.emit('psmoke', _puffO);
    }
  }

  function emitLingeringMuzzleFx(state: MuzzleFlashState): void {
    const { pos, dir, s, birthOffset, reach, axAtt } = state;
    const smokeBirth = birthOffset - 0.2;
    for (let i = 0; i < 8; i++) {
      const along = 0.15 + rng() * 0.45;
      _puffO.pos[0] = pos.x + dir.x * along; _puffO.pos[1] = pos.y + dir.y * along; _puffO.pos[2] = pos.z + dir.z * along;
      _puffO.vel[0] = dir.x * 0.3 + (rng() - 0.5) * 0.4 + 0.35;
      _puffO.vel[1] = 0.55 + rng() * 0.55;
      _puffO.vel[2] = dir.z * 0.3 + (rng() - 0.5) * 0.4 + 0.12;
      _puffO.life = 2.3 + rng() * 1.4;
      _puffO.size0 = 0.5 * s; _puffO.size1 = (2.0 + rng() * 0.9) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0xc6c2ba, _puffO.col0); col3(0x9a9791, _puffO.col1);
      _puffO.alpha = 0.20 + rng() * 0.10; _puffO.grav = 0.4;
      _puffO.birthOffset = smokeBirth - rng() * 0.4;
      particles.emit('psmoke', _puffO);
    }
    _sv.set(pos.x + dir.x * 0.6, pos.y + dir.y * 0.6, pos.z + dir.z * 0.6);
    sparkFan(_sv, dir, Math.round(9 * (0.4 + 0.6 * axAtt)), 14 * s * reach, 0.22, 0xffd58a, 0.11, 0.018, 0.03, birthOffset);
  }

  function emitMuzzleGroundBlast(state: MuzzleFlashState): void {
    const { pos, dir, caliberMm, birthOffset, nearAtt, dkF } = state;
    const gy = groundY(pos.x, pos.z);
    const hK = THREE.MathUtils.clamp(1 - (pos.y - gy - 1.2) / 3.4, 0, 1);
    if (hK <= 0.05) return;
    spawnShockRing(pos.x + dir.x * 1.2, pos.z + dir.z * 1.2,
      Math.max(0, -birthOffset), 0.42 + 0.22 * hK, 0.7 * (0.5 + 0.5 * hK));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.6;
      _puffO.pos[0] = pos.x + dir.x * 0.9 + Math.cos(a) * 0.8;
      _puffO.pos[1] = gy + 0.75;
      _puffO.pos[2] = pos.z + dir.z * 0.9 + Math.sin(a) * 0.8;
      _puffO.vel[0] = Math.cos(a) * (9 + rng() * 4) + dir.x * 2;
      _puffO.vel[1] = 0.8 + rng() * 0.8;
      _puffO.vel[2] = Math.sin(a) * (9 + rng() * 4) + dir.z * 2;
      _puffO.life = 0.38 + rng() * 0.22;
      _puffO.size0 = 0.55; _puffO.size1 = (2.3 + rng() * 0.9) * (0.75 + 0.25 * hK);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.5;
      col3(0x99948a, _puffO.col0); col3(0x847f76, _puffO.col1);
      _puffO.alpha = (0.26 + 0.10 * hK) * (0.7 + 0.3 * nearAtt);
      _puffO.grav = -0.6; _puffO.birthOffset = birthOffset;
      particles.emit('dust', _puffO);
    }
    const donutN = Math.round(12 + 6 * hK) * (caliberMm >= 100 ? 1 : 0.7) | 0;
    for (let i = 0; i < donutN; i++) {
      const a = (i / donutN) * Math.PI * 2 + rng() * 0.5;
      const r0 = 0.6 + rng() * 0.7;
      const firstWave = i % 2 === 0;
      _puffO.pos[0] = pos.x + dir.x * 0.8 + Math.cos(a) * r0;
      _puffO.pos[1] = gy + 0.85;
      _puffO.pos[2] = pos.z + dir.z * 0.8 + Math.sin(a) * r0;
      _puffO.vel[0] = Math.cos(a) * (5.0 + rng() * 3.6) + dir.x * 1.5;
      _puffO.vel[1] = 1.1 + rng() * 1.3;
      _puffO.vel[2] = Math.sin(a) * (5.0 + rng() * 3.6) + dir.z * 1.5;
      _puffO.life = (firstWave ? 0.85 + rng() * 0.45 : 1.4 + rng() * 0.8) * (0.85 + 0.15 * dkF);
      _puffO.size0 = 0.45;
      _puffO.size1 = (2.2 + rng() * 1.2) * (0.7 + 0.3 * hK) * (0.75 + 0.3 * dkF);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.8;
      col3(0x969084, _puffO.col0); col3(0x827c72, _puffO.col1);
      _puffO.alpha = (firstWave ? (0.26 + 0.09 * hK) : (0.20 + 0.07 * hK)) *
        (0.85 + 0.13 * Math.min(dkF, 1.8));
      _puffO.grav = -0.4; _puffO.birthOffset = birthOffset - 0.03;
      particles.emit('dust', _puffO);
    }
    const chipN = Math.round(3 + 3 * hK);
    for (let i = 0; i < chipN; i++) {
      const a = rng() * Math.PI * 2;
      _debO.pos[0] = pos.x + dir.x * 0.9 + Math.cos(a) * 0.5;
      _debO.pos[1] = gy + 0.4;
      _debO.pos[2] = pos.z + dir.z * 0.9 + Math.sin(a) * 0.5;
      _debO.vel[0] = Math.cos(a) * (3.5 + rng() * 3.0) + dir.x * 2.5;
      _debO.vel[1] = 3.0 + rng() * 3.0 * (0.5 + 0.5 * hK);
      _debO.vel[2] = Math.sin(a) * (3.5 + rng() * 3.0) + dir.z * 2.5;
      _debO.life = 0.9; _debO.scale = 0.04 + rng() * 0.05; _debO.spin = 14 + rng() * 16;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
    }
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const ahead = 2.2 + rng() * 2.2;
      _puffO.pos[0] = pos.x + dir.x * ahead + Math.cos(a) * 1.2;
      _puffO.pos[1] = gy + 0.95;
      _puffO.pos[2] = pos.z + dir.z * ahead + Math.sin(a) * 1.2;
      _puffO.vel[0] = Math.cos(a) * (2.5 + rng() * 2.5) + dir.x * 4.5;
      _puffO.vel[1] = 0.9 + rng() * 1.1;
      _puffO.vel[2] = Math.sin(a) * (2.5 + rng() * 2.5) + dir.z * 4.5;
      _puffO.life = (1.2 + rng() * 1.0) * (0.85 + 0.15 * dkF);
      _puffO.size0 = 0.5;
      _puffO.size1 = (2.1 + rng() * 1.0) * (0.7 + 0.3 * hK) * (0.75 + 0.3 * dkF);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0x969084, _puffO.col0); col3(0x827c72, _puffO.col1);
      _puffO.alpha = 0.19 + 0.06 * hK; _puffO.grav = -0.4; _puffO.birthOffset = birthOffset - 0.03;
      particles.emit('dust', _puffO);
    }
  }

  /**
   * @param {number} reach forward-extent multiplier for the BRIGHT elements
   *   (tongues/spears). 1 for live fire; the screenshot composer passes <1 so
   *   the frozen cone stays inside the combat_firing frame instead of
   *   clipping the screen edge as a blown-out sheet.
   * @returns {number} muzzle-light peak factor (bore-axis view attenuation)
   */
  function spawnMuzzleFlash(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    caliberMm: number,
    birthOffset = 0,
    reach = 1,
  ): number {
    // Defensive copy (r5): callers may hand in shared scratch vectors; every
    // internal helper below must be free to reuse module scratch without any
    // risk of aliasing the flash's own origin/direction mid-spawn.
    pos = _mfPos.copy(pos);
    dir = _mfDir.copy(dir);
    const s = calScale(caliberMm);
    // Sniper-scope suppression: no flash geometry an inch from the lens —
    // only a thinned propellant haze; the muzzle light + camera kick carry it.
    const scoped = scopedOwnGun(pos);
    // Bore-axis view attenuation: from the dead-astern chase camera every
    // additive card + jet stacks along the view ray into one full-screen
    // white fountain. Shrink (~45%) and dim (~60%) the bright elements as
    // |view · bore| -> 1; side-on framings are untouched.
    let axial = 0;
    let camD = 30;
    const cam = engineCtx && engineCtx.camera;
    if (cam) {
      _camV.copy(pos).sub(cam.position);
      const l = _camV.length();
      camD = l;
      if (l > 1e-4) axial = Math.abs(_camV.dot(dir)) / l;
    }
    // Close-camera energy discipline (r7 "one shot covers 60% of the frame"):
    // inside ~14 m the flash already subtends a big screen area, so the
    // additive stack + bloom snowballed it into a diagonal white wash. Scale
    // brightness AND card size down as the camera closes in; far framings
    // (staged combat_firing at 13 m orbit ≈ 0.75/0.9) are barely touched.
    const nearAtt = THREE.MathUtils.clamp((camD - 3) / 11, 0, 1);
    const nearA = 0.4 + 0.6 * nearAtt;
    const nearS = 0.68 + 0.32 * nearAtt;
    // r5 chase-cam readability floor: from the 13-18 m gameplay camera the
    // shot was "nearly a non-event" — the flash subtends too little screen.
    // Scale the BRIGHT element sizes up with camera distance (1x inside 12 m,
    // up to 2.4x at 29 m+) so a main-gun shot keeps a readable screen-space
    // footprint from chase/battle framings. Alpha untouched — the flash gets
    // BIGGER at range, never hotter (no return of the r7 close-range wash).
    const dkF = THREE.MathUtils.clamp(camD / 12, 1, 2.4);
    // r7 fire-moment wash: the halo/core cards take a SOFTENED distance boost
    // (pow 0.6) — the full 2.4x on the white cores at a 25 m framing was the
    // ~4 m cream ball that bleached the hull at ignition. Jets/petals keep
    // the full dkF for silhouette reach.
    const dkC = Math.pow(dkF, 0.6);
    // r6 (critic: "firing your own gun is a non-event from the chase camera
    // ... reads like a cork pop"): the dead-astern suppression over-corrected
    // — from the default chase pose (axial ~0.95) it cut the flash to ~40%
    // alpha and ~60% size. Relaxed (0.45->0.32 size, 0.62->0.48 alpha): the
    // stacking-wash guard still bites straight down the bore, but the
    // player's own 120 mm shot keeps a readable bloom from the chase cam.
    const axSize = (1 - 0.32 * axial * axial) * nearS * dkF;
    // core-card variant of axSize (softened distance boost — see dkC)
    const axSizeC = (1 - 0.32 * axial * axial) * nearS * dkC;
    const axAtt = (1 - 0.48 * axial * axial) * nearA;
    const lightK = (1 - 0.5 * axial * axial) * (0.55 + 0.45 * nearAtt);
    const state = muzzleFlashState;
    state.pos.copy(pos);
    state.dir.copy(dir);
    state.caliberMm = caliberMm;
    state.birthOffset = birthOffset;
    state.reach = reach;
    state.s = s;
    state.scoped = scoped;
    state.nearAtt = nearAtt;
    state.dkF = dkF;
    state.axSize = axSize;
    state.axSizeC = axSizeC;
    state.axAtt = axAtt;
    state.lightK = lightK;
    basisFrom(dir, _v1, _v2);
    if (!scoped) {
      emitMuzzleCoreAndPetals(state);
      emitMuzzleAxialAndBrakeJets(state);
      emitMuzzleCombustionAndAfterflash(state);
      emitMuzzlePropellantMass(state);
    } // end !scoped
    emitMuzzleSmoke(state);
    // Scoped LIGHT attenuation (r6): the muzzle light an inch from the lens
    // whited out the bottom half of the scope — suppress it like the
    // geometry, leaving a readable kick without the flashbang.
    if (scoped) return lightK * 0.2; // no wisps/bore sparks/ground wash an inch from the lens
    emitLingeringMuzzleFx(state);
    emitMuzzleGroundBlast(state);
    return lightK;
  }

  /** APFSDS sabot petals discarding just past the muzzle (shells doc §10). */
  function spawnSabotPetals(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    birthOffset = 0,
  ): void {
    basisFrom(dir, _v1, _v2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng();
      const rx = _v1.x * Math.cos(a) + _v2.x * Math.sin(a);
      const ry = _v1.y * Math.cos(a) + _v2.y * Math.sin(a);
      const rz = _v1.z * Math.cos(a) + _v2.z * Math.sin(a);
      _debO.pos[0] = pos.x + dir.x * 1.5; _debO.pos[1] = pos.y + dir.y * 1.5; _debO.pos[2] = pos.z + dir.z * 1.5;
      _debO.vel[0] = dir.x * 60 + rx * 14; _debO.vel[1] = dir.y * 60 + ry * 14 + 2; _debO.vel[2] = dir.z * 60 + rz * 14;
      // r1: life 1.4 -> 0.55 s — petals launched from a ~2 m muzzle at 60 m/s
      // are down within ~0.5 s; the old life left them frozen on the grass as
      // paper-litter scraps for a full second after every APFSDS shot
      _debO.life = 0.55; _debO.scale = 0.09; _debO.spin = 20 + rng() * 20;
      _debO.axis[0] = rx; _debO.axis[1] = ry; _debO.axis[2] = rz;
      _debO.groundY = groundY(pos.x, pos.z);
      _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
    }
  }

  /**
   * Cone of spark streaks around `normal`. `jitterS` staggers births so a
   * frozen frame shows a mix of ages — long fresh leaders, short dying
   * drooping arcs — never a symmetric fan of identical lines.
   */
  function sparkFan(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
    speed: number,
    spread: number,
    colHex: number,
    life: number,
    width: number,
    stretch: number,
    birthOffset = 0,
    jitterS = 0,
  ): void {
    basisFrom(normal, _v1, _v2);
    col3(colHex, _strkO.col);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = rng() * spread;
      const st = Math.sin(tilt);
      const cx = Math.cos(a) * st, sx = Math.sin(a) * st, n = Math.cos(tilt);
      const v = speed * (0.4 + rng() * 0.9);
      _strkO.pos[0] = pos.x + normal.x * 0.05; _strkO.pos[1] = pos.y + normal.y * 0.05; _strkO.pos[2] = pos.z + normal.z * 0.05;
      _strkO.vel[0] = (normal.x * n + _v1.x * cx + _v2.x * sx) * v;
      _strkO.vel[1] = (normal.y * n + _v1.y * cx + _v2.y * sx) * v;
      _strkO.vel[2] = (normal.z * n + _v1.z * cx + _v2.z * sx) * v;
      _strkO.life = life * (0.5 + rng() * 0.8);
      // per-spark width/brightness variation so the shower never reads as
      // uniform confetti — a few fat bright leaders among dim thin trails
      _strkO.width = width * (0.6 + rng() * 0.9); _strkO.stretch = stretch * (0.7 + rng() * 0.7);
      _strkO.grav = -21.6;
      _strkO.alpha = 0.5 + rng() * 0.5; _strkO.seed = rng();
      _strkO.birthOffset = birthOffset - rng() * jitterS;
      particles.emit('sparks', _strkO);
    }
  }

  /** Drifting smoke puffs leaving an impact point along `normal`. */
  function impactSmoke(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
    size: number,
    colHex0: number,
    colHex1: number,
    alpha: number,
    birthOffset = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      _puffO.pos[0] = pos.x + normal.x * 0.2 + (rng() - 0.5) * 0.3;
      _puffO.pos[1] = pos.y + normal.y * 0.2 + (rng() - 0.5) * 0.3;
      _puffO.pos[2] = pos.z + normal.z * 0.2 + (rng() - 0.5) * 0.3;
      _puffO.vel[0] = normal.x * (1.5 + rng() * 2) + (rng() - 0.5);
      _puffO.vel[1] = normal.y * (1.5 + rng() * 2) + 0.8 + rng() * 0.5;
      _puffO.vel[2] = normal.z * (1.5 + rng() * 2) + (rng() - 0.5);
      _puffO.life = 0.9 + rng() * 1.0;
      _puffO.size0 = size * 0.4; _puffO.size1 = size * (1.4 + rng() * 0.6);
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(colHex0, _puffO.col0); col3(colHex1, _puffO.col1);
      _puffO.alpha = alpha; _puffO.grav = 0.9; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
  }

  /** Very short additive flash burst at a hit point. */
  function hitFlash(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    s: number,
    colHex0: number,
    colHex1: number,
    birthOffset = 0,
  ): void {
    for (let i = 0; i < 3; i++) {
      _puffO.pos[0] = pos.x + normal.x * 0.15; _puffO.pos[1] = pos.y + normal.y * 0.15; _puffO.pos[2] = pos.z + normal.z * 0.15;
      _puffO.vel[0] = normal.x * 2; _puffO.vel[1] = normal.y * 2; _puffO.vel[2] = normal.z * 2;
      _puffO.life = 0.06 + rng() * 0.05;
      _puffO.size0 = 0.5 * s; _puffO.size1 = 1.6 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
      col3(colHex0, _puffO.col0); col3(colHex1, _puffO.col1);
      _puffO.alpha = 1.0; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
  }

  function emitDirtClods(
    pos: THREE.Vector3,
    scale: number,
    big: boolean,
    birthOffset: number,
    gy: number,
    baseY: number,
  ): void {
    const clodCount = big ? 9 : 6;
    const trailCount = big ? 7 : 5;
    for (let index = 0; index < clodCount; index++) {
      const angle = rng() * Math.PI * 2;
      const tilt = rng() * 0.7;
      const vx = Math.cos(angle) * Math.sin(tilt) * 14 * scale;
      const vy = (9 + rng() * 9) * scale;
      const vz = Math.sin(angle) * Math.sin(tilt) * 14 * scale;
      _debO.pos[0] = pos.x;
      _debO.pos[1] = baseY;
      _debO.pos[2] = pos.z;
      _debO.vel[0] = vx;
      _debO.vel[1] = vy;
      _debO.vel[2] = vz;
      _debO.life = 2.2;
      _debO.scale = 0.1 + rng() * 0.12 * scale;
      _debO.spin = 6 + rng() * 14;
      _debO.axis[0] = rng() - 0.5;
      _debO.axis[1] = rng() - 0.5;
      _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy;
      _debO.hot = false;
      _debO.seed = rng();
      _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
      if (index >= trailCount) continue;
      for (let trailTime = 0.06; trailTime < 1.0; trailTime += 0.1) {
        const sampledDrag = (1 - Math.exp(-0.12 * trailTime)) / 0.12;
        const py = baseY + vy * sampledDrag - 10.8 * trailTime * trailTime;
        if (py < gy + 0.25) break;
        _puffO.pos[0] = pos.x + vx * sampledDrag + (rng() - 0.5) * 0.12;
        _puffO.pos[1] = py;
        _puffO.pos[2] = pos.z + vz * sampledDrag + (rng() - 0.5) * 0.12;
        _puffO.vel[0] = (rng() - 0.5) * 0.3;
        _puffO.vel[1] = -0.4 - rng() * 0.5;
        _puffO.vel[2] = (rng() - 0.5) * 0.3;
        _puffO.life = 0.5 + rng() * 0.4;
        _puffO.size0 = 0.15 * scale;
        _puffO.size1 = 0.5 * scale;
        _puffO.rot = rng() * Math.PI * 2;
        _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x4a3b29, _puffO.col0);
        col3(0x5d5040, _puffO.col1);
        _puffO.alpha = 0.7;
        _puffO.grav = -1.5;
        _puffO.birthOffset = birthOffset + trailTime * 0.9;
        particles.emit('smoke', _puffO);
      }
    }
  }

  /** HE / terrain dirt plume: dark column + radial skirt + clods + dust ring. */
  function dirtPlume(
    pos: THREE.Vector3,
    caliberMm: number,
    big: boolean,
    birthOffset = 0,
  ): void {
    const s = calScale(caliberMm) * (big ? 1.7 : 1.15);
    const gy = groundY(pos.x, pos.z);
    const baseY = Math.max(pos.y, gy) + 0.5;
    // dark ejecta core: a dense near-black heart the caliber punches out of
    // the soil — the r5 plume was one small brown puff with no core
    for (let i = 0; i < (big ? 6 : 4); i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.4 * s;
      _puffO.pos[1] = baseY + rng() * 0.3;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.4 * s;
      _puffO.vel[0] = (rng() - 0.5) * 1.6; _puffO.vel[1] = (9 + rng() * 6) * s; _puffO.vel[2] = (rng() - 0.5) * 1.6;
      _puffO.life = 0.9 + rng() * 0.7;
      _puffO.size0 = 0.5 * s; _puffO.size1 = (1.9 + rng() * 0.9) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0x362b1e, _puffO.col0); col3(0x4b3e2c, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = -7; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // central dirt column
    const colN = big ? 14 : 8;
    for (let i = 0; i < colN; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.8 * s;
      _puffO.pos[1] = baseY + rng() * 0.6;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.8 * s;
      _puffO.vel[0] = (rng() - 0.5) * 2.5; _puffO.vel[1] = (7 + rng() * 7) * s; _puffO.vel[2] = (rng() - 0.5) * 2.5;
      _puffO.life = 1.3 + rng() * 1.2;
      _puffO.size0 = 0.7 * s; _puffO.size1 = (2.8 + rng() * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x5c4a33, _puffO.col0); col3(0x77664d, _puffO.col1);
      _puffO.alpha = 0.85; _puffO.grav = -6; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // radial skirt
    const skN = big ? 12 : 7;
    for (let i = 0; i < skN; i++) {
      const a = (i / skN) * Math.PI * 2 + rng() * 0.5;
      _puffO.pos[0] = pos.x + Math.cos(a) * 0.5 * s; _puffO.pos[1] = baseY; _puffO.pos[2] = pos.z + Math.sin(a) * 0.5 * s;
      _puffO.vel[0] = Math.cos(a) * (5 + rng() * 3) * s;
      _puffO.vel[1] = 2.5 + rng() * 2;
      _puffO.vel[2] = Math.sin(a) * (5 + rng() * 3) * s;
      _puffO.life = 1.0 + rng() * 0.8;
      _puffO.size0 = 0.6 * s; _puffO.size1 = 2.2 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x6b5940, _puffO.col0); col3(0x857556, _puffO.col1);
      _puffO.alpha = 0.6; _puffO.grav = -3; _puffO.birthOffset = birthOffset;
      particles.emit('smoke', _puffO);
    }
    // lingering dust pall: a drifting haze that hangs ~3 s at the impact
    // point after the plume collapses (r5: pall was far too short)
    for (let i = 0; i < (big ? 10 : 7); i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 2.4 * s;
      _puffO.pos[0] = pos.x + Math.cos(a) * d; _puffO.pos[1] = baseY + 0.2; _puffO.pos[2] = pos.z + Math.sin(a) * d;
      _puffO.vel[0] = Math.cos(a) * (1.0 + rng()) + 0.3; _puffO.vel[1] = 0.6 + rng() * 0.6; _puffO.vel[2] = Math.sin(a) * (1.0 + rng());
      _puffO.life = 3.2 + rng() * 1.8;
      _puffO.size0 = 1.0 * s; _puffO.size1 = (4.4 + rng() * 1.4) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5);
      col3(0x8f8672, _puffO.col0); col3(0x7d766a, _puffO.col1);
      _puffO.alpha = 0.30 + rng() * 0.1; _puffO.grav = -0.25; _puffO.birthOffset = birthOffset + rng() * 0.5;
      particles.emit('dust', _puffO);
    }
    // dirt clods + arcing clod tracer streaks: each clod drags a dotted trail
    // of dark ejecta sampled along the same drag trajectory the debris shader
    // integrates (k = 0.12, g = -21.6) — the WoT "soil fountain" signature
    emitDirtClods(pos, s, big, birthOffset, gy, baseY);
  }

  /** HE detonation fireball (scaled by caliber) — flash + fire + black smoke. */
  function heFireball(
    pos: THREE.Vector3,
    caliberMm: number,
    birthOffset = 0,
  ): void {
    const s = calScale(caliberMm) * 1.3;
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = (3 + rng() * 5) * s;
      _puffO.pos[0] = pos.x; _puffO.pos[1] = pos.y + 0.2; _puffO.pos[2] = pos.z;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v + 1.5;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = 0.25 + rng() * 0.25;
      _puffO.size0 = 0.8 * s; _puffO.size1 = 2.6 * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 5;
      col3(0xfff0b0, _puffO.col0); col3(0xe65c14, _puffO.col1);
      _puffO.alpha = 1.0; _puffO.grav = 2; _puffO.birthOffset = birthOffset;
      particles.emit('fire', _puffO);
    }
    impactSmoke(_sv.set(pos.x, pos.y + 0.4, pos.z), _UP, 8, 1.6 * s, 0x2c2a28, 0x565450, 0.7, birthOffset);
  }

  function emitDestructionFlash(
    pos: THREE.Vector3,
    cy: number,
    burn: boolean,
    dk: number,
    birthOffset: number,
  ): void {
    const count = burn ? 1 : 3;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = 2 + rng() * 4;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.6; _puffO.pos[1] = cy + (rng() - 0.5) * 0.6; _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.6;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v + 2;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = 0.1 + rng() * 0.1;
      _puffO.size0 = (1.4 + rng()) * dk; _puffO.size1 = (3.2 + rng() * 1.2) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0xffffff, _puffO.col0); col3(0xffb040, _puffO.col1);
      _puffO.alpha = 1.0; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
      particles.emit('flash', _puffO);
    }
  }

  function emitDestructionOuterBillows(
    pos: THREE.Vector3,
    cy: number,
    rack: boolean,
    burn: boolean,
    fireS: number,
    dk: number,
    birthOffset: number,
  ): void {
    const count = rack ? 12 : (burn ? 6 : 9);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const crown = i < 3 && !burn;
      const v = (2.6 + rng() * 3.6) * fireS;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.1 * fireS;
      _puffO.pos[1] = cy + (crown ? 0.8 + rng() * 1.2 : (rng() - 0.4) * 1.1);
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.1 * fireS;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v * 0.5 + (crown ? 2.4 : 1.1);
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = crown ? 1.25 + rng() * 0.6 : 0.85 + rng() * 0.75;
      _puffO.size0 = (crown ? 2.8 + rng() * 1.0 : 2.0 + rng() * 1.0) * fireS * dk;
      _puffO.size1 = (crown ? 7.0 + rng() * 2.2 : 4.8 + rng() * 1.8) * fireS * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0x4a423a, _puffO.col0); col3(0x2b2723, _puffO.col1);
      _puffO.alpha = 0.88 + rng() * 0.1; _puffO.grav = 1.1;
      _puffO.birthOffset = i < count / 3
        ? birthOffset - rng() * 0.25
        : birthOffset + rng() * 0.35;
      particles.emit('billow', _puffO);
    }
  }

  function emitDestructionFirePockets(
    pos: THREE.Vector3,
    cy: number,
    rack: boolean,
    burn: boolean,
    fireS: number,
    dk: number,
    birthOffset: number,
  ): void {
    const count = rack ? 12 : (burn ? 6 : 9);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, b = rng() * Math.PI;
      const v = (3.0 + rng() * 4.2) * fireS;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.0 * fireS;
      _puffO.pos[1] = cy + (rng() - 0.55) * 1.0;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.0 * fireS;
      _puffO.vel[0] = Math.cos(a) * Math.sin(b) * v;
      _puffO.vel[1] = Math.abs(Math.cos(b)) * v * 0.45 + 0.9;
      _puffO.vel[2] = Math.sin(a) * Math.sin(b) * v;
      _puffO.life = 0.7 + rng() * 1.0;
      _puffO.size0 = (1.8 + rng() * 1.0) * fireS * dk; _puffO.size1 = (4.2 + rng() * 2.0) * fireS * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffd865, _puffO.col0); col3(0xe6520f, _puffO.col1);
      _puffO.alpha = 0.34 + rng() * 0.18; _puffO.grav = 1.0;
      _puffO.birthOffset = i < count / 3
        ? birthOffset - rng() * 0.25
        : birthOffset + rng() * 0.35;
      particles.emit('fire', _puffO);
    }
  }

  function emitDestructionFireball(
    pos: THREE.Vector3,
    cy: number,
    rack: boolean,
    burn: boolean,
    dk: number,
    birthOffset: number,
  ): number {
    const fireS = burn ? 0.7 : 1;
    const anchorCount = burn ? 2 : 4;
    for (let i = 0; i < anchorCount; i++) {
      const a = (i / 4) * Math.PI * 2 + rng() * 0.9;
      _puffO.pos[0] = pos.x + Math.cos(a) * (0.5 + rng() * 0.5);
      _puffO.pos[1] = cy - 0.85 + rng() * 0.35;
      _puffO.pos[2] = pos.z + Math.sin(a) * (0.5 + rng() * 0.5);
      _puffO.vel[0] = Math.cos(a) * (1.0 + rng() * 0.8);
      _puffO.vel[1] = 0.8 + rng() * 0.6;
      _puffO.vel[2] = Math.sin(a) * (1.0 + rng() * 0.8);
      _puffO.life = 0.9 + rng() * 0.5;
      _puffO.size0 = (2.1 + rng() * 0.7) * fireS * dk;
      _puffO.size1 = (4.2 + rng() * 1.2) * fireS * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.5;
      col3(0x4a423a, _puffO.col0); col3(0x2b2723, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = 1.0;
      _puffO.birthOffset = birthOffset - 0.1 - rng() * 0.15;
      particles.emit('billow', _puffO);
    }
    const coreCount = burn ? 1 : 3;
    for (let i = 0; i < coreCount; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
      _puffO.pos[1] = cy + (rng() - 0.6) * 0.9;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
      _puffO.vel[0] = (rng() - 0.5) * 0.8;
      _puffO.vel[1] = 1.3 + rng() * 0.7;
      _puffO.vel[2] = (rng() - 0.5) * 0.8;
      _puffO.life = 1.15 + rng() * 0.55;
      _puffO.size0 = (2.9 + rng() * 0.9) * fireS * dk;
      _puffO.size1 = (6.0 + rng() * 1.5) * fireS * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x4a423a, _puffO.col0); col3(0x2b2723, _puffO.col1);
      _puffO.alpha = 0.96; _puffO.grav = 0.9;
      _puffO.birthOffset = birthOffset - 0.06 - rng() * 0.12;
      particles.emit('billow', _puffO);
    }
    emitDestructionOuterBillows(pos, cy, rack, burn, fireS, dk, birthOffset);
    emitDestructionFirePockets(pos, cy, rack, burn, fireS, dk, birthOffset);
    return fireS;
  }

  function deferFxBatch(birthOffset: number, delayS: number, fn: () => void): void {
    if (birthOffset < 0 || frozen) fn();
    else timers.push({ t: delayS, fn });
  }

  function scheduleDestructionSmokeTakeover(
    posX: number,
    posZ: number,
    cy: number,
    fireS: number,
    dk: number,
    birthOffset: number,
  ): void {
    deferFxBatch(birthOffset, 0.03, () => {
      for (let i = 0; i < 14; i++) {
        const a = rng() * Math.PI * 2;
        const r = (0.6 + rng() * 1.5) * fireS;
        _puffO.pos[0] = posX + Math.cos(a) * r;
        _puffO.pos[1] = cy + rng() * 2.2;
        _puffO.pos[2] = posZ + Math.sin(a) * r;
        _puffO.vel[0] = Math.cos(a) * (1.2 + rng() * 1.8);
        _puffO.vel[1] = 2.2 + rng() * 2.6;
        _puffO.vel[2] = Math.sin(a) * (1.2 + rng() * 1.8);
        _puffO.life = 2.4 + rng() * 2.2;
        _puffO.size0 = (1.4 + rng() * 0.8) * dk; _puffO.size1 = (4.6 + rng() * 2.2) * dk;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x2f2b26, _puffO.col0); col3(0x605d53, _puffO.col1);
        _puffO.alpha = 0.62 + rng() * 0.14; _puffO.grav = 1.1;
        _puffO.birthOffset = birthOffset + 0.4 + rng() * 1.0;
        particles.emit('smoke', _puffO);
      }
    });
  }

  function emitDestructionInteriorSmoke(
    pos: THREE.Vector3,
    cy: number,
    birthOffset: number,
  ): void {
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.5 + rng() * 1.1;
      _puffO.pos[0] = pos.x + Math.cos(a) * r;
      _puffO.pos[1] = cy + (rng() - 0.3) * 1.4;
      _puffO.pos[2] = pos.z + Math.sin(a) * r;
      _puffO.vel[0] = Math.cos(a) * (1.5 + rng() * 2); _puffO.vel[1] = 1.8 + rng() * 2.2; _puffO.vel[2] = Math.sin(a) * (1.5 + rng() * 2);
      _puffO.life = 1.1 + rng() * 0.9;
      _puffO.size0 = 1.0 + rng() * 0.6; _puffO.size1 = 3.0 + rng() * 1.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0x211d1a, _puffO.col0); col3(0x3d3833, _puffO.col1);
      _puffO.alpha = 0.5 + rng() * 0.2; _puffO.grav = 1.2; _puffO.birthOffset = birthOffset - rng() * 0.15;
      particles.emit('smoke', _puffO);
    }
  }

  function emitDestructionHullFire(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    rack: boolean,
    burn: boolean,
    birthOffset: number,
  ): void {
    const skirtCount = burn ? 4 : 10;
    for (let i = 0; i < skirtCount; i++) {
      const a = rng() * Math.PI * 2;
      const r = 1.2 + rng() * 1.0;
      _puffO.pos[0] = pos.x + Math.cos(a) * r; _puffO.pos[1] = gy + 0.9 + rng() * 0.4; _puffO.pos[2] = pos.z + Math.sin(a) * r;
      _puffO.vel[0] = Math.cos(a) * (3.5 + rng() * 3);
      _puffO.vel[1] = 1.2 + rng() * 1.2;
      _puffO.vel[2] = Math.sin(a) * (3.5 + rng() * 3);
      _puffO.life = 0.55 + rng() * 0.5;
      _puffO.size0 = 0.8 + rng() * 0.4; _puffO.size1 = 2.2 + rng() * 0.8;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffc040, _puffO.col0); col3(0xff4a08, _puffO.col1);
      _puffO.alpha = 0.55; _puffO.grav = 1.5; _puffO.birthOffset = birthOffset - rng() * 0.15;
      particles.emit('fire', _puffO);
    }
    const ringFireCount = rack ? 4 : 0;
    for (let i = 0; i < ringFireCount; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.7;
      _puffO.pos[1] = cy + 0.15 + rng() * 0.3;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.7;
      _puffO.vel[0] = (rng() - 0.5) * 0.4;
      _puffO.vel[1] = 0.8 + rng() * 0.6;
      _puffO.vel[2] = (rng() - 0.5) * 0.4;
      _puffO.life = 1.5 + rng() * 1.3;
      _puffO.size0 = 0.9 + rng() * 0.4; _puffO.size1 = 1.6 + rng() * 0.7;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffd070, _puffO.col0); col3(0xff5a10, _puffO.col1);
      _puffO.alpha = 0.75; _puffO.grav = 1.2;
      _puffO.birthOffset = birthOffset - rng() * 0.4 + i * 0.45;
      particles.emit('fire', _puffO);
    }
    const geyserCount = rack ? 9 : 0;
    for (let i = 0; i < geyserCount; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
      _puffO.pos[1] = cy + 0.4 + rng() * 0.6;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
      _puffO.vel[0] = (rng() - 0.5) * 2.2;
      _puffO.vel[1] = 9 + rng() * 7;
      _puffO.vel[2] = (rng() - 0.5) * 2.2;
      _puffO.life = 0.55 + rng() * 0.55;
      _puffO.size0 = 0.8 + rng() * 0.5; _puffO.size1 = 2.0 + rng() * 1.0;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 5;
      col3(0xffe9a0, _puffO.col0); col3(0xff4a06, _puffO.col1);
      _puffO.alpha = 0.7; _puffO.grav = -2; _puffO.birthOffset = birthOffset - rng() * 0.12;
      particles.emit('fire', _puffO);
    }
    const hatchJetCount = rack ? 3 : (burn ? 0 : 2);
    for (let i = 0; i < hatchJetCount; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.45;
      _sv.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).normalize();
      _jetO.pos[0] = pos.x + (rng() - 0.5) * 1.0;
      _jetO.pos[1] = cy + 0.3;
      _jetO.pos[2] = pos.z + (rng() - 0.5) * 1.0;
      _jetO.axis[0] = _sv.x; _jetO.axis[1] = _sv.y; _jetO.axis[2] = _sv.z;
      _jetO.life = 0.14 + rng() * 0.08;
      _jetO.width = 0.30 + rng() * 0.12;
      _jetO.len0 = 0.5; _jetO.len1 = 2.6 + rng() * 1.4;
      _jetO.seed = rng();
      col3(0xffd98c, _jetO.col);
      _jetO.alpha = 0.85; _jetO.birthOffset = birthOffset - rng() * 0.05;
      particles.emit('jet', _jetO);
    }
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2; _puffO.pos[1] = cy + rng() * 0.6; _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2;
      _puffO.vel[0] = Math.cos(a) * (0.5 + rng()); _puffO.vel[1] = 4 + rng() * 4; _puffO.vel[2] = Math.sin(a) * (0.5 + rng());
      _puffO.life = 0.6 + rng() * 0.6;
      _puffO.size0 = 0.9 + rng() * 0.5; _puffO.size1 = 2.4 + rng();
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffc040, _puffO.col0); col3(0xff4a08, _puffO.col1);
      _puffO.alpha = 0.6; _puffO.grav = 3; _puffO.birthOffset = birthOffset - rng() * 0.2;
      particles.emit('fire', _puffO);
    }
  }

  function emitDestructionSmokeCap(
    pos: THREE.Vector3,
    cy: number,
    dk: number,
    birthOffset: number,
  ): void {
    for (let i = 0; i < 30; i++) {
      const a = rng() * Math.PI * 2;
      const v = 1 + rng() * 2.5;
      const high = i < 12;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2;
      _puffO.pos[1] = cy + (high ? 1.2 + rng() * 2.0 : rng() * 1.2);
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2;
      _puffO.vel[0] = Math.cos(a) * v + COLUMN_WIND_X * 0.7;
      _puffO.vel[1] = 3.2 + rng() * 4.0;
      _puffO.vel[2] = Math.sin(a) * v + COLUMN_WIND_Z * 0.7;
      _puffO.life = 3.2 + rng() * 2.0;
      _puffO.size0 = (2.5 + rng() * 0.8) * dk; _puffO.size1 = (5.8 + rng() * 2.4) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      if (i % 3 === 2) { col3(0x4a463f, _puffO.col0); col3(0x817d75, _puffO.col1); }
      else { col3(0x363029, _puffO.col0); col3(0x655f56, _puffO.col1); }
      _puffO.alpha = 0.60 + rng() * 0.14; _puffO.grav = 1.3; _puffO.birthOffset = birthOffset - 0.55;
      particles.emit('smoke', _puffO);
    }
  }

  function emitDestructionShockAndSparks(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    rack: boolean,
    burn: boolean,
    birthOffset: number,
  ): void {
    const ringN = burn ? 10 : 30;
    for (let i = 0; i < ringN; i++) {
      if (rng() < 0.3) continue;
      const a = (i / ringN) * Math.PI * 2 + (rng() - 0.5) * 0.85;
      const rs = 1.4 + rng() * 1.7;
      const sizeK = 0.7 + rng() * 0.9;
      _puffO.pos[0] = pos.x + Math.cos(a) * rs; _puffO.pos[1] = gy + 1.1; _puffO.pos[2] = pos.z + Math.sin(a) * rs;
      _puffO.vel[0] = Math.cos(a) * (7 + rng() * 8); _puffO.vel[1] = 1.1 + rng(); _puffO.vel[2] = Math.sin(a) * (7 + rng() * 8);
      _puffO.life = 1.0 + rng() * 0.9;
      _puffO.size0 = 1.0 * sizeK; _puffO.size1 = (4.0 + rng() * 2.4) * sizeK;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x8a8069, _puffO.col0); col3(0x776f5f, _puffO.col1);
      _puffO.alpha = 0.20 + rng() * 0.13; _puffO.grav = -0.5; _puffO.birthOffset = birthOffset - rng() * 0.1;
      particles.emit('dust', _puffO);
    }
    spawnScorch(pos.x, pos.z, (burn ? 3.6 : 5.4) + rng() * 1.4);
    if (!burn) spawnShockRing(pos.x, pos.z, Math.max(0, -birthOffset));
    sparkFan(_sv.set(pos.x, cy, pos.z), _UP, rack ? 16 : (burn ? 5 : 10), 18, 0.85, 0xffc470, 0.55, 0.05, 0.034, birthOffset, 0.35);
    sparkFan(_sv.set(pos.x, cy + 0.4, pos.z), _UP, rack ? 12 : (burn ? 3 : 8), 9, 1.45, 0xffb860, 0.8, 0.04, 0.04, birthOffset, 0.5);
  }

  function emitHotChunkTrail(
    pos: THREE.Vector3,
    cy: number,
    gy: number,
    dvx: number,
    dvy: number,
    dvz: number,
    birthOffset: number,
  ): void {
    _strkO.pos[0] = pos.x; _strkO.pos[1] = cy; _strkO.pos[2] = pos.z;
    _strkO.vel[0] = dvx; _strkO.vel[1] = dvy; _strkO.vel[2] = dvz;
    _strkO.life = 0.5 + rng() * 0.35;
    _strkO.width = 0.035 + rng() * 0.03; _strkO.stretch = 0.034; _strkO.grav = -21.6;
    col3(0xffc274, _strkO.col); _strkO.alpha = 0.8; _strkO.seed = rng();
    _strkO.birthOffset = birthOffset;
    particles.emit('sparks', _strkO);
    for (let ts = 0.10; ts < 0.6; ts += 0.16) {
      const sd = (1 - Math.exp(-0.12 * ts)) / 0.12;
      const py = cy + dvy * sd - 10.8 * ts * ts;
      if (py < gy + 0.3) break;
      _puffO.pos[0] = pos.x + dvx * sd; _puffO.pos[1] = py; _puffO.pos[2] = pos.z + dvz * sd;
      _puffO.vel[0] = (rng() - 0.5) * 0.4; _puffO.vel[1] = 0.5 + rng() * 0.4; _puffO.vel[2] = (rng() - 0.5) * 0.4;
      _puffO.life = 0.7 + rng() * 0.4;
      _puffO.size0 = 0.22; _puffO.size1 = 0.9 + rng() * 0.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x36322e, _puffO.col0); col3(0x605c55, _puffO.col1);
      _puffO.alpha = 0.5; _puffO.grav = 0.5; _puffO.birthOffset = birthOffset + ts;
      particles.emit('smoke', _puffO);
    }
  }

  function emitHotChunkLanding(
    lx: number,
    lz: number,
    birthOffset: number,
  ): void {
    _puffO.pos[1] = groundY(lx, lz) + 0.35;
    _puffO.vel[0] = 0; _puffO.vel[1] = 0.25; _puffO.vel[2] = 0;
    _puffO.life = 0.55 + rng() * 0.3;
    _puffO.size0 = 0.55; _puffO.size1 = 0.22;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xffa14e, _puffO.col0); col3(0x99290a, _puffO.col1);
    _puffO.alpha = 0.55; _puffO.grav = 0; _puffO.birthOffset = birthOffset;
    particles.emit('fire', _puffO);
    _puffO.pos[1] = groundY(lx, lz) + 0.7;
    _puffO.vel[1] = 0.8 + rng() * 0.5;
    _puffO.life = 1.1 + rng() * 0.6;
    _puffO.size0 = 0.25; _puffO.size1 = 1.0 + rng() * 0.5;
    _puffO.rotVel = (rng() - 0.5) * 2;
    col3(0x45403a, _puffO.col0); col3(0x6e6a61, _puffO.col1);
    _puffO.alpha = 0.4; _puffO.grav = 0.5; _puffO.birthOffset = birthOffset + 0.1;
    particles.emit('smoke', _puffO);
  }

  function emitChunkLanding(
    pos: THREE.Vector3,
    cy: number,
    gy: number,
    dvx: number,
    dvy: number,
    dvz: number,
    birthOffset: number,
    life: number,
    scale: number,
    fullHot: boolean,
  ): void {
    for (let ts = 0.14; ts < life; ts += 0.07) {
      const sd = (1 - Math.exp(-0.12 * ts)) / 0.12;
      const py = cy + dvy * sd - 10.8 * ts * ts;
      if (py > gy + scale * 0.5) continue;
      const lx = pos.x + dvx * sd, lz = pos.z + dvz * sd;
      _puffO.pos[0] = lx; _puffO.pos[1] = groundY(lx, lz) + 0.8; _puffO.pos[2] = lz;
      _puffO.vel[0] = dvx * 0.06 + (rng() - 0.5) * 0.6; _puffO.vel[1] = 0.9 + rng() * 0.7;
      _puffO.vel[2] = dvz * 0.06 + (rng() - 0.5) * 0.6;
      _puffO.life = 0.9 + rng() * 0.5;
      _puffO.size0 = 0.45; _puffO.size1 = 1.5 + rng() * 0.7;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
      col3(0x8a8069, _puffO.col0); col3(0x776f5f, _puffO.col1);
      _puffO.alpha = 0.34; _puffO.grav = -0.5; _puffO.birthOffset = birthOffset + ts;
      particles.emit('dust', _puffO);
      if (fullHot) emitHotChunkLanding(lx, lz, birthOffset + ts);
      break;
    }
  }

  function emitDestructionDebrisShower(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    rack: boolean,
    burn: boolean,
    birthOffset: number,
  ): void {
    const count = rack ? 30 : (burn ? 5 : 14);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.85;
      const bo = birthOffset - rng() * 0.15;
      _debO.pos[0] = pos.x; _debO.pos[1] = cy; _debO.pos[2] = pos.z;
      _debO.vel[0] = Math.cos(a) * Math.sin(tilt) * (13 + rng() * 11);
      _debO.vel[1] = 4 + rng() * 6;
      _debO.vel[2] = Math.sin(a) * Math.sin(tilt) * (13 + rng() * 11);
      _debO.life = 1.4 + rng() * 0.7;
      _debO.scale = 0.10 + rng() * 0.15;
      _debO.spin = 8 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      const fullHot = rng() < 0.55;
      _debO.groundY = gy; _debO.hot = fullHot ? 1 : 0.45; _debO.seed = rng(); _debO.birthOffset = bo;
      const dvx = _debO.vel[0], dvy = _debO.vel[1], dvz = _debO.vel[2];
      const life = _debO.life, scale = _debO.scale;
      particles.emit('debris', _debO);
      if (fullHot) emitHotChunkTrail(pos, cy, gy, dvx, dvy, dvz, bo);
      emitChunkLanding(pos, cy, gy, dvx, dvy, dvz, bo, life, scale, fullHot);
    }
  }

  function emitDestructionLargeChunks(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    rack: boolean,
    burn: boolean,
    birthOffset: number,
  ): void {
    const count = rack ? 5 : (burn ? 0 : 2);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.25 + rng() * 0.5;
      const vx = Math.cos(a) * Math.sin(tilt) * 14;
      const vy = 12 + rng() * 8;
      const vz = Math.sin(a) * Math.sin(tilt) * 14;
      _debO.pos[0] = pos.x; _debO.pos[1] = cy; _debO.pos[2] = pos.z;
      _debO.vel[0] = vx; _debO.vel[1] = vy; _debO.vel[2] = vz;
      _debO.life = 3; _debO.scale = 0.23 + rng() * 0.10; _debO.spin = 5 + rng() * 8;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = birthOffset;
      particles.emit('debris', _debO);
      for (let ts = 0.08; ts < 1.5; ts += 0.11) {
        const sd = (1 - Math.exp(-0.12 * ts)) / 0.12;
        const px = pos.x + vx * sd;
        const py = cy + vy * sd - 10.8 * ts * ts;
        const pz = pos.z + vz * sd;
        if (py < gy + 0.3) break;
        _puffO.pos[0] = px + (rng() - 0.5) * 0.15; _puffO.pos[1] = py; _puffO.pos[2] = pz + (rng() - 0.5) * 0.15;
        _puffO.vel[0] = (rng() - 0.5) * 0.4; _puffO.vel[1] = 0.5 + rng() * 0.4; _puffO.vel[2] = (rng() - 0.5) * 0.4;
        _puffO.life = 0.9 + rng() * 0.6;
        _puffO.size0 = 0.35; _puffO.size1 = 1.3 + rng() * 0.4;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x2a2826, _puffO.col0); col3(0x555350, _puffO.col1);
        _puffO.alpha = 0.55; _puffO.grav = 0.6; _puffO.birthOffset = birthOffset + ts;
        particles.emit('smoke', _puffO);
      }
    }
  }

  function emitDestructionHatchSlab(
    pos: THREE.Vector3,
    gy: number,
    cy: number,
    birthOffset: number,
  ): void {
    _debO.pos[0] = pos.x; _debO.pos[1] = cy + 0.6; _debO.pos[2] = pos.z;
    _debO.vel[0] = (rng() - 0.5) * 6; _debO.vel[1] = 9 + rng() * 4; _debO.vel[2] = (rng() - 0.5) * 6;
    _debO.life = 2.6; _debO.scale = 0.45 + rng() * 0.2; _debO.spin = 5 + rng() * 6;
    _debO.axis[0] = rng() - 0.5; _debO.axis[1] = 0.2; _debO.axis[2] = rng() - 0.5;
    _debO.groundY = gy; _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = birthOffset;
    particles.emit('debris', _debO);
  }

  function scheduleDestructionSettlingDust(
    posX: number,
    posZ: number,
    gy: number,
    birthOffset: number,
  ): void {
    deferFxBatch(birthOffset, 0.06, () => {
      for (let i = 0; i < 12; i++) {
        const a = rng() * Math.PI * 2;
        const d = 1.5 + rng() * 3.5;
        _puffO.pos[0] = posX + Math.cos(a) * d;
        _puffO.pos[1] = gy + 1.0;
        _puffO.pos[2] = posZ + Math.sin(a) * d;
        _puffO.vel[0] = Math.cos(a) * (0.5 + rng() * 0.6);
        _puffO.vel[1] = 0.25 + rng() * 0.3;
        _puffO.vel[2] = Math.sin(a) * (0.5 + rng() * 0.6);
        _puffO.life = 3.5 + rng() * 2.5;
        _puffO.size0 = 1.5; _puffO.size1 = 5.2 + rng() * 1.8;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.6;
        col3(0x867e6e, _puffO.col0); col3(0x746e60, _puffO.col1);
        _puffO.alpha = 0.15 + rng() * 0.06; _puffO.grav = -0.2;
        _puffO.birthOffset = birthOffset + 1.2 + rng() * 1.2;
        particles.emit('dust', _puffO);
      }
    });
  }

  function emitDestructionSmokeStalk(
    pos: THREE.Vector3,
    cy: number,
    burn: boolean,
    dk: number,
    birthOffset: number,
  ): void {
    const count = burn ? 6 : 14;
    for (let i = 0; i < count; i++) {
      const h = (i / 12) * 12 + rng() * 2;
      _puffO.pos[0] = pos.x + COLUMN_WIND_X * h * 0.30 + (rng() - 0.5) * (1.3 + h * 0.18);
      _puffO.pos[1] = cy + 1.5 + h;
      _puffO.pos[2] = pos.z + COLUMN_WIND_Z * h * 0.30 + (rng() - 0.5) * (1.3 + h * 0.18);
      _puffO.vel[0] = COLUMN_WIND_X * (0.3 + h * 0.09) + (rng() - 0.5) * 0.9;
      _puffO.vel[1] = 3.0 + rng() * 2.0;
      _puffO.vel[2] = COLUMN_WIND_Z * (0.3 + h * 0.09) + (rng() - 0.5) * 0.9;
      _puffO.life = 3.0 + rng() * 1.8;
      _puffO.size0 = (2.0 + rng() * 1.0 + h * 0.10) * dk;
      _puffO.size1 = (6.0 + rng() * 2.5 + h * 0.22) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.0;
      if (i % 3 === 2) { col3(0x423e38, _puffO.col0); col3(0x736f68, _puffO.col1); }
      else { col3(0x332e29, _puffO.col0); col3(0x5f5a52, _puffO.col1); }
      _puffO.alpha = 0.55 + rng() * 0.15; _puffO.grav = 1.0;
      _puffO.birthOffset = birthOffset - 1.1 + (h / 14) * 0.8;
      particles.emit('smoke', _puffO);
    }
  }

  function emitDestructionSmokeBridge(
    pos: THREE.Vector3,
    cy: number,
    burn: boolean,
    dk: number,
    birthOffset: number,
  ): void {
    const count = burn ? 5 : 10;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.4;
      _puffO.pos[1] = cy + 0.6 + rng() * 1.6;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.4;
      _puffO.vel[0] = Math.cos(a) * (0.5 + rng() * 0.7) + COLUMN_WIND_X * 0.5;
      _puffO.vel[1] = 2.6 + rng() * 2.0;
      _puffO.vel[2] = Math.sin(a) * (0.5 + rng() * 0.7) + COLUMN_WIND_Z * 0.5;
      _puffO.life = 4.0 + rng() * 2.5;
      _puffO.size0 = (1.8 + rng() * 0.8) * dk; _puffO.size1 = (5.4 + rng() * 2.2) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.4;
      if (i % 3 === 2) { col3(0x3d3934, _puffO.col0); col3(0x6e6a63, _puffO.col1); }
      else { col3(0x363029, _puffO.col0); col3(0x615b52, _puffO.col1); }
      _puffO.alpha = 0.6 + rng() * 0.14; _puffO.grav = 1.0;
      _puffO.birthOffset = birthOffset - 0.35 + (i / 9) * 2.85 + rng() * 0.25;
      particles.emit('smoke', _puffO);
    }
  }

  function emitDestructionEruptionSkirt(
    pos: THREE.Vector3,
    cy: number,
    burn: boolean,
    dk: number,
    birthOffset: number,
  ): void {
    const count = burn ? 4 : 8;
    for (let i = 0; i < count; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.7;
      const r = 1.3 + rng() * 1.3;
      _puffO.pos[0] = pos.x + Math.cos(a) * r;
      _puffO.pos[1] = cy + 0.4 + rng() * 1.2;
      _puffO.pos[2] = pos.z + Math.sin(a) * r;
      _puffO.vel[0] = Math.cos(a) * (0.9 + rng() * 0.8) + COLUMN_WIND_X * 0.4;
      _puffO.vel[1] = 2.0 + rng() * 1.6;
      _puffO.vel[2] = Math.sin(a) * (0.9 + rng() * 0.8) + COLUMN_WIND_Z * 0.4;
      _puffO.life = 3.5 + rng() * 1.5;
      _puffO.size0 = (2.0 + rng() * 0.8) * dk; _puffO.size1 = (5.0 + rng() * 1.8) * dk;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.8;
      if (i % 3 === 2) { col3(0x403c36, _puffO.col0); col3(0x716d66, _puffO.col1); }
      else { col3(0x332e27, _puffO.col0); col3(0x5c584f, _puffO.col1); }
      _puffO.alpha = 0.68 + rng() * 0.12; _puffO.grav = 1.1;
      _puffO.birthOffset = birthOffset + 0.05 + rng() * 0.3;
      particles.emit('smoke', _puffO);
    }
  }

  function finalizeDestroyedVisual(
    visual: FxVisual | null,
    rack: boolean,
    birthOffset: number,
  ): void {
    if (!visual) return;
    impactDecals.clearVehicle(visual);
    const delay = 0.15 + birthOffset;
    if (delay <= 0) visual.setDestroyed({ pop: rack, ageS: -delay });
    else timers.push({ t: delay, fn: () => visual.setDestroyed({ pop: rack }) });
  }

  /**
   * Full vehicle destruction sequence, optionally backdated (composer).
   * `cause` varies the spectacle so kills stop reading as one canned clip:
   *  - 'ammorack': the full turret-toss detonation (geyser, hatch jets, max
   *    debris) — the rare spectacular;
   *  - 'shot': plain HP kill — solid fireball but no rack geyser, fewer
   *    debris, turret stays seated (gun droop + hatch smoke);
   *  - 'fire': burn-out — flashover whoosh + heavy smoke, almost no debris.
   */
  function spawnDestruction(
    pos: THREE.Vector3,
    visual: FxVisual | null,
    birthOffset = 0,
    cause: DestructionCause = 'ammorack',
  ): void {
    const rack = cause === 'ammorack';
    const burn = cause === 'fire';
    const gy = groundY(pos.x, pos.z);
    const cy = Math.max(pos.y, gy) + 1.2;
    // distance-compensated spectacle (r7: a 244 m kill read as a ~40 px
    // orange puff) — scale the big volumetric cards up with camera distance
    const dk = distBoost(pos.x, cy, pos.z);
    emitDestructionFlash(pos, cy, burn, dk, birthOffset);
    const fireS = emitDestructionFireball(pos, cy, rack, burn, dk, birthOffset);
    // r2 SPAWN-FRAME BUDGET: batches whose particles are born in the FUTURE
    // (positive birthOffset) don't need to be written on the blast frame —
    // live kills stagger them over the next few frames via the timer queue
    // (the single-frame emit burst was part of the 55->26 fps kill hitch).
    // Composed/backdated captures still spawn synchronously.
    scheduleDestructionSmokeTakeover(pos.x, pos.z, cy, fireS, dk, birthOffset);
    emitDestructionInteriorSmoke(pos, cy, birthOffset);
    emitDestructionHullFire(pos, gy, cy, rack, burn, birthOffset);
    // rolling black smoke cap + buoyant column starters. Backdated 0.25 s so
    // the fade-in is already complete when the composer freezes at 0.6 s (and
    // live, thick smoke erupts with the fireball instead of trailing it).
    // r7 (critic: "the fire column caps in discrete soot-chip stipple instead
    // of rolling smoke"): the cap cards spawn BIGGER (size0 up ~60%) in a
    // tighter footprint so neighbours overlap from birth into one rolling
    // mass, and they inherit the column's upward velocity.
    emitDestructionSmokeCap(pos, cy, dk, birthOffset);
    // shockwave dust ring on the ground — fast, clearly expanding, but
    // ORGANIC: jittered radius/angle/size and ~30% of slots dropped so the
    // ring never resolves into evenly spaced puffs on a perfect circle (r5)
    // r2 ANTI-STATIC: the ring rode at gy+0.45 — waist-deep INSIDE the grass
    // blade band, so every card interleaved with alpha-tested blades into
    // per-pixel TV static across ~40% of the frame for the 2 s dust window
    // (THE r2 critical). The wave now skims the grass TOPS (gy+1.1), runs
    // bigger and dimmer cards (same total mass, no per-blade contrast), and
    // its silhouette reads against terrain instead of through the meadow.
    emitDestructionShockAndSparks(pos, gy, cy, rack, burn, birthOffset);
    emitDestructionDebrisShower(pos, gy, cy, rack, burn, birthOffset);
    emitDestructionLargeChunks(pos, gy, cy, rack, burn, birthOffset);
    if (rack) emitDestructionHatchSlab(pos, gy, cy, birthOffset);
    // settling dust: a delayed low blanket that drifts in AFTER the fireball
    // dies (positive birthOffset relative to the blast = future birth).
    // r2 anti-static: lifted from gy+0.35 (grass-root level — per-blade
    // interleave static) to just over the blade tops, dimmer + larger.
    // Deferred off the blast frame live (kill-hitch budget).
    scheduleDestructionSettlingDust(pos.x, pos.z, gy, birthOffset);
    // explosion light + persistent smoke column + burnt hull swap. Light sits
    // 2.4 m above the hull: warm falloff over wreck/terrain without nuking
    // the hull albedo to flat orange.
    flashLight(lightStates[1], _sv.set(pos.x, cy + 3.6, pos.z),
      EXPLOSION_LIGHT_PEAK * (burn ? 0.5 : 1), Math.max(0, -birthOffset));
    // INSTANT dark smoke stalk (r7 distant-kill readability): a column of
    // dense near-black puffs already standing 4-14 m over the wreck at the
    // moment of the blast, so a 200-400 m kill shows a rising black marker
    // instead of waiting ~8 s for the slow column puffs to climb.
    emitDestructionSmokeStalk(pos, cy, burn, dk, birthOffset);
    // fire-to-smoke bridge: dense deck-level puffs whose births SPAN the
    // window from the blast itself through the fireball's death (-0.35 s to
    // +2.5 s), so (a) the composed hero frame catches fresh dark smoke low
    // around the fire and (b) the column never detaches from the burning
    // hull during the live handoff (r1: "2.5-4 s lull").
    emitDestructionSmokeBridge(pos, cy, burn, dk, birthOffset);
    // instant eruption skirt: heavy black smoke bursting out WITH the
    // fireball, hugging its flanks low over the hull — this is the dark mass
    // the hero frame (and the first live second) reads as "smoke column
    // being born", before the stalk/column take over.
    emitDestructionEruptionSkirt(pos, cy, burn, dk, birthOffset);
    columns.push({ key: null, pos: [pos.x, Math.max(pos.y, gy), pos.z], acc: 0, ttl: SMOKE_COLUMN_S, scale: burn ? 1.45 : 1.3 });
    capColumns();
    finalizeDestroyedVisual(visual, rack, birthOffset);
  }

  /** Camera-distance size compensation so kills stay legible at 200-400 m. */
  function distBoost(x: number, y: number, z: number): number {
    const cam = engineCtx && engineCtx.camera;
    if (!cam) return 1;
    _camV.set(x, y, z);
    const d = cam.position.distanceTo(_camV);
    // 1 inside 90 m, up to ~1.9 at 300 m (applied to SIZE; alpha untouched)
    return Math.pow(THREE.MathUtils.clamp(d / 90, 1, 2.4), 0.75);
  }

  /** One tick of a persistent smoke column emitter (stage-decayed). */
  function emitColumnPuff(col: SmokeColumn, birthOffset = 0): void {
    // Stage decay: a fresh kill pumps thick black smoke; over the column's
    // life it thins toward pale grey wisps instead of cutting off.
    const stage = Math.min(1, Math.max(0, col.ttl / SMOKE_COLUMN_S));
    const dk = distBoost(col.pos[0], col.pos[1], col.pos[2]);
    const s = col.scale * (0.62 + 0.38 * stage) * dk;
    // r2 COLUMN CONTINUITY: the emitter only fed the bottom ~4 m while the
    // one-shot stalk/cap cards parked a huge long-lived blob at the top —
    // frame-to-frame the plume read as flame, a GAP, then a static ink mass
    // pinned at the frame top (r2 major). The feed now spans the column's
    // WHOLE current height (grown ~2 m/s from the wreck, capped at 15 m):
    // every band of the plume is continuously replaced by fresh advecting
    // puffs, so the column visibly rises, bends and dissolves over time.
    const ageS = SMOKE_COLUMN_S - Math.max(0, col.ttl);
    const H = Math.min(3.5 + ageS * 2.0, 15);
    // r5 CONTINUITY REBUILD (motion critique: "stack of giant soft blobs that
    // detaches from the wreck leaving a visible gap; walked up close it is
    // one featureless screen-filling mass"):
    //  - 20 Hz cadence of HALF-SIZE puffs (see COLUMN_TICK_S) — a continuous
    //    turbulent volume, never 3-4 discrete spheres;
    //  - LOW puffs live SHORT: the shader's alpha-in spans 12% of life, so
    //    the old 7.5-11 s base puffs took ~1 s to fade in and had already
    //    risen 2-4 m — that invisible zone WAS the base gap. A 3.5-5 s base
    //    puff is at full density ~0.5 s after birth, still on the deck;
    //  - wind shear: lateral velocity grows with emission height so the
    //    column bends downwind and stays connected instead of shearing;
    //  - per-puff alpha/size/rotation variance + a lower alpha ceiling so a
    //    near-camera column keeps silhouette detail instead of stacking to
    //    an opacity-clipped mass.
    // r4: a fresh column pumps 4 puffs/tick (the composed explosion promised
    // a thicker column than the 3-puff feed delivered); thins to 3 past ~15%
    const perTick = stage > 0.85 ? 4 : 3;
    for (let k = 0; k < perTick; k++) {
      // height sampled over the FULL living column, biased toward the base
      // (dense stalk) with the crown still refreshed every few ticks
      const hN = Math.pow(rng(), 1.35);              // 0..1, base-biased
      const h = hN * H;
      // the column leans downwind as it climbs — emission follows the lean
      // so fresh puffs are born INSIDE the bent plume, not beside it
      const leanX = COLUMN_WIND_X * h * 0.28, leanZ = COLUMN_WIND_Z * h * 0.28;
      _puffO.pos[0] = col.pos[0] + leanX + (rng() - 0.5) * (0.7 + h * 0.16) * s;
      _puffO.pos[1] = col.pos[1] + 0.9 + h + rng() * 0.8;
      _puffO.pos[2] = col.pos[2] + leanZ + (rng() - 0.5) * (0.7 + h * 0.16) * s;
      const shear = 0.35 + h * 0.20 + rng() * 0.4;  // more drift higher up
      _puffO.vel[0] = COLUMN_WIND_X * shear + (rng() - 0.5) * 0.9;
      // real buoyancy: every band keeps rising so the crown continuously
      // clears upward and dissolves instead of hanging as one parked mass
      _puffO.vel[1] = (2.4 + 1.2 * stage) + rng() * 1.6;
      _puffO.vel[2] = COLUMN_WIND_Z * shear + (rng() - 0.5) * 0.9;
      // short-ish lives everywhere: the plume is a FLOW, each band lives on
      // fresh puffs (the old 5.7-11 s crown cards were the static ink blob)
      _puffO.life = 2.8 + rng() * 1.4 + hN * 1.2;
      _puffO.size0 = (1.0 + rng() * 0.6 + h * 0.09) * s;
      _puffO.size1 = (3.6 + rng() * 2.0 + h * 0.30) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.9;
      // r2 albedo floor: capped well above black (0x3a→) and the crown runs
      // a shade lighter than the base — sunlit smoke, never an ink cutout
      const grey = rng() * 0.5 + hN * 0.5;
      if (grey < 0.45) { col3(0x3a3531, _puffO.col0); col3(0x6e6a63, _puffO.col1); }
      else if (grey < 0.8) { col3(0x4a4641, _puffO.col0); col3(0x807c74, _puffO.col1); }
      else { col3(0x5a564f, _puffO.col0); col3(0x94908a, _puffO.col1); }
      _puffO.alpha = (0.20 + rng() * 0.12) + 0.20 * stage;
      _puffO.grav = 0.45;
      _puffO.birthOffset = birthOffset - rng() * COLUMN_TICK_S; // intra-tick stagger
      particles.emit('smoke', _puffO);
    }
    // r7 persistent BLACK core (critic: "the long-tail wreck has no
    // persistent black smoke column"): one extra near-black puff per tick
    // hugging the column base — the sooty heart the grey shell wraps around,
    // present for the whole 5-30 s burning-wreck window.
    {
      const h = rng() * 3.5;
      _puffO.pos[0] = col.pos[0] + COLUMN_WIND_X * h * 0.28 + (rng() - 0.5) * 0.6 * s;
      _puffO.pos[1] = col.pos[1] + 1.1 + h;
      _puffO.pos[2] = col.pos[2] + COLUMN_WIND_Z * h * 0.28 + (rng() - 0.5) * 0.6 * s;
      _puffO.vel[0] = COLUMN_WIND_X * (0.4 + h * 0.18) + (rng() - 0.5) * 0.5;
      _puffO.vel[1] = 2.2 + rng() * 1.4;
      _puffO.vel[2] = COLUMN_WIND_Z * (0.4 + h * 0.18) + (rng() - 0.5) * 0.5;
      _puffO.life = 2.6 + rng() * 1.4;
      _puffO.size0 = (1.4 + rng() * 0.7 + h * 0.12) * s;
      _puffO.size1 = (3.4 + rng() * 1.6 + h * 0.25) * s;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.6;
      col3(0x2c2824, _puffO.col0); col3(0x4e4a44, _puffO.col1);
      _puffO.alpha = 0.30 + 0.22 * stage;
      _puffO.grav = 0.5;
      _puffO.birthOffset = birthOffset - rng() * COLUMN_TICK_S;
      particles.emit('smoke', _puffO);
    }
    // flame licks ANCHORED to the deck (r7 critic: "by 20 s the sustained
    // fire has detached into two cotton-ball flame blobs hovering above the
    // hull"): licks are born ON the deck line, rise slowly, live SHORT and
    // SHRINK with age — fire that licks up off the wreck and dies before it
    // can drift free. Higher rate so the base always carries flame.
    if (rng() < 0.70 + 0.30 * stage) {
      const licks = rng() < 0.35 ? 2 : 1;
      for (let li = 0; li < licks; li++) {
        _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.2;
        _puffO.pos[1] = col.pos[1] + 0.95 + rng() * 0.55;
        _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.2;
        _puffO.vel[0] = (rng() - 0.5) * 0.6; _puffO.vel[1] = 1.0 + rng() * 0.9; _puffO.vel[2] = (rng() - 0.5) * 0.6;
        _puffO.life = 0.30 + rng() * 0.28;
        _puffO.size0 = (1.15 + rng() * 0.4) * col.scale * dk;
        _puffO.size1 = (0.75 + rng() * 0.3) * col.scale * dk; // shrink as it dies
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
        col3(0xffcf70, _puffO.col0); col3(0xff5a10, _puffO.col1);
        _puffO.alpha = 0.95; _puffO.grav = 1.4; _puffO.birthOffset = birthOffset - rng() * 0.15;
        particles.emit('fire', _puffO);
      }
    }
  }

  /**
   * Smolder-stage tick (after the main column burns out): thin grey wisps +
   * the odd ember fleck, so the wreck keeps marking the battlefield instead
   * of going cold the moment the column emitter dies (r7 aftermath critique).
   */
  function emitSmolderPuff(col: SmokeColumn, birthOffset = 0): void {
    const k = Math.max(0, (col.smolder ?? 0) / SMOKE_SMOLDER_S); // 1 -> 0 over the tail
    const dk = distBoost(col.pos[0], col.pos[1], col.pos[2]);
    _puffO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.4;
    _puffO.pos[1] = col.pos[1] + 1.2 + rng() * 1.0; // r5: above the deck line
    _puffO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.4;
    _puffO.vel[0] = (rng() - 0.5) * 0.8 + COLUMN_WIND_X * 0.55;
    _puffO.vel[1] = 1.2 + rng() * 1.2;
    _puffO.vel[2] = (rng() - 0.5) * 0.8 + COLUMN_WIND_Z * 0.55;
    _puffO.life = 5 + rng() * 3;
    _puffO.size0 = (0.9 + rng() * 0.5) * dk; _puffO.size1 = (4.0 + rng() * 2.0) * dk;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 0.6;
    col3(0x4a4642, _puffO.col0); col3(0x7e7a73, _puffO.col1);
    _puffO.alpha = 0.14 + 0.20 * k; _puffO.grav = 0.3; _puffO.birthOffset = birthOffset;
    particles.emit('smoke', _puffO);
    // occasional ember fleck popping off the hot hull
    if (rng() < 0.25 + 0.3 * k) {
      _strkO.pos[0] = col.pos[0] + (rng() - 0.5) * 1.2;
      _strkO.pos[1] = col.pos[1] + 1.4; // r5: pop off the deck, not inside it
      _strkO.pos[2] = col.pos[2] + (rng() - 0.5) * 1.2;
      _strkO.vel[0] = (rng() - 0.5) * 1.5; _strkO.vel[1] = 2 + rng() * 2.5; _strkO.vel[2] = (rng() - 0.5) * 1.5;
      _strkO.life = 0.5 + rng() * 0.5;
      _strkO.width = 0.02 + rng() * 0.015; _strkO.stretch = 0.03; _strkO.grav = -9;
      col3(0xffb060, _strkO.col); _strkO.alpha = 0.7; _strkO.seed = rng(); _strkO.birthOffset = birthOffset;
      particles.emit('sparks', _strkO);
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Enforce MAX_COLUMNS by retiring the lowest-remaining-ttl emitter. */
  function capColumns(): void {
    while (columns.length > MAX_COLUMNS) {
      let low = 0;
      for (let i = 1; i < columns.length; i++) {
        if (columns[i].ttl < columns[low].ttl) low = i;
      }
      columns.splice(low, 1);
    }
  }

  /** Remove a live subject-following column; wreck columns are world-fixed. */
  function retireSubjectColumn(key: string): void {
    let live = 0;
    for (const col of columns) if (col.key !== key) columns[live++] = col;
    columns.length = live;
  }

  const _due: FxTimer[] = []; // reused timer-fire scratch (cleared after each use)

  function advanceFxClock(): number {
    const nowClockS = particles.getTime();
    let tickDt = nowClockS - lastTickS;
    lastTickS = nowClockS;
    if (!(tickDt > 0)) return 0;
    return Math.min(tickDt, 8);
  }

  function syncColumnAnchors(resolveSubject: ((id: string) => FxEntity | null) | null): void {
    if (!columns.length || !resolveSubject) return;
    for (const col of columns) {
      if (col.key == null) continue;
      const subject = resolveSubject(col.key);
      col.attachmentResolved = syncSubjectEmitterAnchor(col, subject, _subjectAnchor);
    }
  }

  function updateClockDrivenLights(): void {
    for (const st of lightStates) applyLight(st);
    for (const ring of shockRings) applyShockRing(ring);
    for (const ring of muzzleRings) applyMuzzleRing(ring);
  }

  function sweepImpactDecals(dt: number): void {
    decalSweepAcc += dt;
    if (decalSweepAcc <= 1.4) return;
    decalSweepAcc = 0;
    impactDecals.sweep();
  }

  function updateWreckLight(): void {
    if (replaySuppressed) return;
    const explosionState = lightStates[1];
    if (lightAge(explosionState) >= explosionState.dur && columns.length) {
      const col = columns[columns.length - 1];
      explosionLight.position.set(col.pos[0], col.pos[1] + 2.6, col.pos[2]);
      explosionLight.distance = 12;
      const time = particles.getTime();
      explosionLight.intensity = (
        9.5 + 3.2 * Math.sin(time * 13.7) + 2.2 * Math.sin(time * 7.1 + 1.9)
      ) * col.scale;
      return;
    }
    if (lightAge(explosionState) < explosionState.dur && explosionLight.distance !== 13) {
      explosionLight.distance = 13;
    }
  }

  function advanceTimers(tickDt: number): void {
    if (!timers.length) return;
    _due.length = 0;
    for (const timer of timers) {
      timer.t -= tickDt;
      if (timer.t <= 0) _due.push(timer);
    }
    if (!_due.length) return;
    let live = 0;
    for (const timer of timers) if (timer.t > 0) timers[live++] = timer;
    timers.length = live;
    if (!replaySuppressed) for (const timer of _due) timer.fn();
    _due.length = 0;
  }

  function advanceActiveColumn(col: SmokeColumn, tickDt: number): void {
    col.ttl -= tickDt;
    if (col.ttl <= 0) {
      col.ttl = 0;
      col.smolder = SMOKE_SMOLDER_S;
      col.acc = 0;
      return;
    }
    if (replaySuppressed) {
      col.acc = 0;
      return;
    }
    col.acc += tickDt;
    while (col.acc >= COLUMN_TICK_S) {
      col.acc -= COLUMN_TICK_S;
      emitColumnPuff(col, -col.acc);
    }
  }

  function advanceSmolderColumn(col: SmokeColumn, tickDt: number): boolean {
    col.smolder = (col.smolder === undefined ? SMOKE_SMOLDER_S : col.smolder) - tickDt;
    if (col.smolder <= 0) return false;
    if (replaySuppressed) {
      col.acc = 0;
      return true;
    }
    col.acc += tickDt;
    while (col.acc >= 0.45) {
      col.acc -= 0.45;
      emitSmolderPuff(col, -col.acc);
    }
    return true;
  }

  function compactSmokeColumns(): void {
    let live = 0;
    for (const col of columns) {
      if (col.ttl > 0 || (col.smolder ?? 0) > 0) columns[live++] = col;
    }
    columns.length = live;
  }

  function advanceSmokeColumns(tickDt: number): void {
    if (!columns.length) return;
    let compact = false;
    for (const col of columns) {
      if (col.ttl > 0) advanceActiveColumn(col, tickDt);
      else if (!advanceSmolderColumn(col, tickDt)) compact = true;
    }
    if (compact) compactSmokeColumns();
  }

  function advanceTimedFx(tickDt: number): void {
    if (!(tickDt > 0)) return;
    advanceTimers(tickDt);
    advanceSmokeColumns(tickDt);
  }

  function initialSweepTail(shell: LiveShell): [number, number, number] {
    const source = shell.prevPos ?? shell.pos;
    return [source.x, source.y, source.z];
  }

  function sweepShellsThroughProps(shells: LiveShell[]): void {
    if (frozen) return;
    _sweepSeen.clear();
    for (let index = 0; index < shells.length; index++) {
      const shell = shells[index];
      if (!shell.pos || shell.id == null) continue;
      _sweepSeen.add(shell.id);
      if (shell.dead) continue;
      let tail = sweepTails.get(shell.id);
      if (!tail) {
        tail = initialSweepTail(shell);
        sweepTails.set(shell.id, tail);
      }
      const dx = shell.pos.x - tail[0];
      const dy = shell.pos.y - tail[1];
      const dz = shell.pos.z - tail[2];
      if (dx * dx + dy * dy + dz * dz > 1e-6) {
        notifyShellSweep(tail[0], tail[1], tail[2], shell.pos.x, shell.pos.y, shell.pos.z);
      }
      tail[0] = shell.pos.x;
      tail[1] = shell.pos.y;
      tail[2] = shell.pos.z;
    }
    for (const id of sweepTails.keys()) if (!_sweepSeen.has(id)) sweepTails.delete(id);
  }

  let liveAtgmCount = 0;

  function writeGuidedBody(shellPos: THREE.Vector3, direction: THREE.Vector3): void {
    if (liveAtgmCount < MAX_ATGM_BODIES) {
      _atgmObject.position.copy(shellPos).addScaledVector(direction, -0.65);
      _atgmObject.quaternion.setFromUnitVectors(_Z, direction);
      _atgmObject.scale.set(1, 1, 1);
      _atgmObject.updateMatrix();
      atgmBodies.setMatrixAt(liveAtgmCount, _atgmObject.matrix);
      _atgmFlareObject.position.copy(shellPos).addScaledVector(direction, -1.35);
      _atgmFlareObject.quaternion.identity();
      _atgmFlareObject.scale.setScalar(1.15);
      _atgmFlareObject.updateMatrix();
      atgmFlares.setMatrixAt(liveAtgmCount, _atgmFlareObject.matrix);
      liveAtgmCount++;
    }
  }

  function writeGuidedShell(shell: LiveShell, tracerIndex: number): number {
    const shellPos = shell.pos;
    writeGuidedBody(shellPos, _v1);
    let trail = guidedTrails.get(shell.id);
    if (!trail) {
      trail = {
        points: new Float32Array(ATGM_TRAIL_POINTS * 3),
        count: 0,
        age: 0,
        seen: true,
      };
      guidedTrails.set(shell.id, trail);
      if (shell.prevPos) appendGuidedTrailPoint(
        trail, shell.prevPos.x, shell.prevPos.y, shell.prevPos.z,
      );
    }
    trail.age = 0;
    trail.seen = true;
    appendGuidedTrailPoint(trail, shellPos.x, shellPos.y, shellPos.z);
    return writeGuidedTrail(trail, tracerIndex);
  }

  function writeShellBolt(
    shell: LiveShell,
    camera: THREE.Camera,
    preset: (typeof TRACER_PRESETS)[keyof typeof TRACER_PRESETS],
    guided: boolean,
    tracerIndex: number,
  ): number {
    const shellPos = shell.pos;
    col3(preset.core, _coreArr);
    col3(preset.glow, _glowArr);
    let widthScale = shell.isPlayer ? 1 : 1.7;
    let brightness = shell.isPlayer ? 1.15 : 1.5;
    _camV.copy(shellPos).sub(camera.position);
    const cameraDistance = _camV.length();
    if (cameraDistance > 1e-4) {
      const alignment = THREE.MathUtils.smoothstep(
        Math.abs(_camV.dot(_v1)) / cameraDistance,
        0.9,
        0.995,
      );
      widthScale *= 1 + 2.6 * alignment;
      brightness *= 1 + 0.9 * alignment;
    }
    const width = Math.min(preset.width * widthScale, 0.15);
    writeTracer(
      tracerIndex,
      _v2.x, _v2.y, _v2.z,
      shellPos.x, shellPos.y, shellPos.z,
      width,
      brightness,
      guided ? _atgmCore : _coreArr,
      guided ? _atgmGlow : _glowArr,
      guided ? 1 : 0,
    );
    if (!guided) rememberShellTrail(shell, width, brightness);
    return tracerIndex + 1;
  }

  function rememberShellTrail(shell: LiveShell, width: number, brightness: number): void {
    let trail = trails.get(shell.id);
    if (!trail) {
      trail = { d: new Float32Array(14), age: 0, seen: true };
      trails.set(shell.id, trail);
    }
    trail.age = 0;
    trail.seen = true;
    const data = trail.d;
    data[0] = _v2.x;
    data[1] = _v2.y;
    data[2] = _v2.z;
    data[3] = shell.pos.x;
    data[4] = shell.pos.y;
    data[5] = shell.pos.z;
    data[6] = width * 1.3;
    data[7] = brightness * 0.16;
    data[8] = 0.45 + _coreArr[0] * 0.25;
    data[9] = 0.44 + _coreArr[1] * 0.25;
    data[10] = 0.43 + _coreArr[2] * 0.25;
    data[11] = 0.30 + _glowArr[0] * 0.25;
    data[12] = 0.30 + _glowArr[1] * 0.25;
    data[13] = 0.30 + _glowArr[2] * 0.25;
  }

  function writeLiveShellTracers(shells: LiveShell[], camera: THREE.Camera): number {
    let tracerCount = 0;
    liveAtgmCount = 0;
    renderedAtgmTrailSegments = 0;
    for (const trail of guidedTrails.values()) trail.seen = false;
    for (let index = 0; index < shells.length && tracerCount < MAX_TRACERS; index++) {
      const shell = shells[index];
      if (shell.dead) continue;
      const guided = !!shell.spec?.guided;
      const tracerId = guided ? 'ATGM' : shell.spec?.tracer;
      const preset = TRACER_PRESETS[tracerId ?? 'AP'];
      const speed = shell.vel.length();
      const length = Math.min(
        THREE.MathUtils.clamp(speed * 0.0035, 3, 6),
        Math.max(shell.distM || 0, 0.08),
      );
      _v1.copy(shell.vel).normalize();
      _v2.copy(shell.pos).addScaledVector(_v1, -length);
      if (guided) {
        tracerCount = writeGuidedShell(shell, tracerCount);
        if (tracerCount >= MAX_TRACERS) continue;
      }
      tracerCount = writeShellBolt(shell, camera, preset, guided, tracerCount);
    }
    return tracerCount;
  }

  function commitAtgmInstances(): void {
    atgmBodies.count = liveAtgmCount;
    atgmFlares.count = liveAtgmCount;
    renderedAtgmBodies = liveAtgmCount;
    if (liveAtgmCount > 0 || atgmBodies.userData.lastCount > 0) {
      atgmBodies.instanceMatrix.needsUpdate = true;
      atgmFlares.instanceMatrix.needsUpdate = true;
    }
    atgmBodies.userData.lastCount = liveAtgmCount;
  }

  function writeGuidedTrailAfterglow(tracerCount: number, tickDt: number): number {
    for (const [id, trail] of guidedTrails) {
      if (trail.seen) continue;
      trail.age += tickDt;
      if (trail.age >= ATGM_TRAIL_S) {
        guidedTrails.delete(id);
        continue;
      }
      const fade = 1 - trail.age / ATGM_TRAIL_S;
      tracerCount = writeGuidedTrail(trail, tracerCount, fade * fade);
    }
    return tracerCount;
  }

  function writeShellTrailAfterglow(tracerCount: number, tickDt: number): number {
    for (const [id, trail] of trails) {
      if (trail.seen) {
        trail.seen = false;
        continue;
      }
      trail.age += tickDt;
      if (trail.age >= TRAIL_S) {
        trails.delete(id);
        continue;
      }
      if (tracerCount >= MAX_TRACERS) continue;
      const fade = 1 - trail.age / TRAIL_S;
      const data = trail.d;
      _trailCore[0] = data[8];
      _trailCore[1] = data[9];
      _trailCore[2] = data[10];
      _trailGlow[0] = data[11];
      _trailGlow[1] = data[12];
      _trailGlow[2] = data[13];
      writeTracer(
        tracerCount++,
        data[0], data[1], data[2],
        data[3], data[4], data[5],
        data[6], data[7] * fade * fade,
        _trailCore, _trailGlow,
      );
    }
    return tracerCount;
  }

  function writeStaticTracerAfterglow(tracerCount: number): number {
    const nowS = particles.getTime();
    for (let index = 0; index < staticTracers.length && tracerCount < MAX_TRACERS; index++) {
      const tracer = staticTracers[index];
      const age = tracer.length > 14 ? nowS - tracer[14] : 0;
      const fade = 1 - THREE.MathUtils.smoothstep(age, 0.3, 0.9);
      if (fade <= 0.001) continue;
      _trailCore[0] = tracer[8];
      _trailCore[1] = tracer[9];
      _trailCore[2] = tracer[10];
      _trailGlow[0] = tracer[11];
      _trailGlow[1] = tracer[12];
      _trailGlow[2] = tracer[13];
      writeTracer(
        tracerCount++,
        tracer[0], tracer[1], tracer[2],
        tracer[3], tracer[4], tracer[5],
        tracer[6], tracer[7] * fade,
        _trailCore,
        _trailGlow,
      );
    }
    return tracerCount;
  }

  function commitTracerInstances(tracerCount: number): void {
    tracerGeo.instanceCount = tracerCount;
    if (tracerCount > 0 || tracerGeo._lastCount !== 0) {
      for (const attribute of tracerAttrs) attribute.needsUpdate = true;
    }
    tracerGeo._lastCount = tracerCount;
  }

  function emitWetTrackDust(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    waterMask: number,
  ): void {
    if (intensity > 0.06 && !frozen) stampTrackPrint(pos, dir, true);
    if (frozen || rng() > intensity * (0.72 + waterMask * 0.36)) return;
    const gy = groundY(pos.x, pos.z);
    _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.45;
    _puffO.pos[1] = Math.max(pos.y, gy) + 0.20 + waterMask * 0.16;
    _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.45;
    _puffO.vel[0] = -dir.x * (1.8 + intensity * 2.6) + (rng() - 0.5) * 1.2;
    _puffO.vel[1] = 1.15 + intensity * 1.55 + rng() * 0.65;
    _puffO.vel[2] = -dir.z * (1.8 + intensity * 2.6) + (rng() - 0.5) * 1.2;
    _puffO.life = 0.34 + rng() * 0.30;
    _puffO.size0 = 0.10 + intensity * 0.10;
    _puffO.size1 = 0.42 + intensity * 0.54;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 2.2;
    col3(0xd8e2dc, _puffO.col0);
    col3(0x8ca9aa, _puffO.col1);
    _puffO.alpha = (0.12 + intensity * 0.17) * (0.55 + waterMask * 0.45);
    _puffO.grav = -0.85;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
    if (rng() >= 0.82) return;
    _strkO.pos[0] = pos.x + (rng() - 0.5) * 0.35;
    _strkO.pos[1] = Math.max(pos.y, gy) + 0.22;
    _strkO.pos[2] = pos.z + (rng() - 0.5) * 0.35;
    _strkO.vel[0] = (rng() - 0.5) * 2.4 - dir.x * intensity;
    _strkO.vel[1] = 2.1 + rng() * 2.2;
    _strkO.vel[2] = (rng() - 0.5) * 2.4 - dir.z * intensity;
    _strkO.life = 0.25 + rng() * 0.24;
    _strkO.width = 0.018 + rng() * 0.012;
    _strkO.stretch = 0.022;
    _strkO.grav = -13.5;
    col3(0xb7d0cf, _strkO.col);
    _strkO.alpha = 0.34 + rng() * 0.20;
    _strkO.seed = rng();
    _strkO.birthOffset = 0;
    particles.emit('sparks', _strkO);
  }

  function drySurfaceMultiplier(groundType: string): number {
    if (groundType === 'hard') return 1.5;
    if (groundType === 'soft') return 1.2;
    return 1.9;
  }

  let dustSizeCap = 1;
  let dustAlphaCap = 1;
  let dustColor0 = 0xa8a189;
  let dustColor1 = 0x8e8a6c;

  function updateDustCameraCaps(pos: THREE.Vector3): void {
    let cameraFactor = 1;
    const camera = engineCtx.camera;
    if (camera) {
      _camV.set(pos.x, pos.y, pos.z).sub(camera.position);
      cameraFactor = THREE.MathUtils.clamp((_camV.length() - 6) / 12, 0, 1);
    }
    dustSizeCap = 0.62 + 0.38 * cameraFactor;
    dustAlphaCap = 0.55 + 0.45 * cameraFactor;
  }

  function updateDryDustColors(groundType: string): void {
    if (groundType === 'hard') {
      dustColor0 = 0xa79d8c;
      dustColor1 = 0x8f887b;
      return;
    }
    if (groundType === 'soft') {
      dustColor0 = 0x6d675a;
      dustColor1 = 0x5c574c;
      return;
    }
    dustColor0 = 0xa8a189;
    dustColor1 = 0x8e8a6c;
  }

  function emitTrackKick(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    groundType: string,
    gy: number,
  ): void {
    const kickRate = groundType === 'hard' ? 0.5 : 0.45;
    if (rng() >= kickRate) return;
    _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
    _puffO.pos[1] = Math.max(pos.y, gy) + (groundType === 'hard' ? 0.35 : 0.7);
    _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
    _puffO.vel[0] = -dir.x * (3.5 + rng() * 3) + (rng() - 0.5) * 1.2;
    _puffO.vel[1] = 1.6 + rng() * 1.6 * intensity;
    _puffO.vel[2] = -dir.z * (3.5 + rng() * 3) + (rng() - 0.5) * 1.2;
    _puffO.life = 0.8 + rng() * 0.5;
    _puffO.size0 = 0.35;
    _puffO.size1 = 1.3 + intensity * 1.1;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 3;
    if (groundType === 'hard') {
      col3(dustColor0, _puffO.col0);
      col3(dustColor1, _puffO.col1);
    } else {
      col3(0x57513f, _puffO.col0);
      col3(0x655e4c, _puffO.col1);
    }
    _puffO.alpha = (0.28 + 0.28 * intensity) * dustAlphaCap;
    _puffO.grav = -1.2;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
    if (groundType === 'hard' || rng() >= 0.55) return;
    _debO.pos[0] = pos.x;
    _debO.pos[1] = Math.max(pos.y, gy) + 0.5;
    _debO.pos[2] = pos.z;
    _debO.vel[0] = -dir.x * (4 + rng() * 4) + (rng() - 0.5) * 2;
    _debO.vel[1] = 2.5 + rng() * 3 * intensity;
    _debO.vel[2] = -dir.z * (4 + rng() * 4) + (rng() - 0.5) * 2;
    _debO.life = 0.9;
    _debO.scale = 0.05 + rng() * 0.05;
    _debO.spin = 12 + rng() * 14;
    _debO.axis[0] = rng() - 0.5;
    _debO.axis[1] = rng() - 0.5;
    _debO.axis[2] = rng() - 0.5;
    _debO.groundY = gy;
    _debO.hot = false;
    _debO.seed = rng();
    _debO.birthOffset = 0;
    particles.emit('debris', _debO);
  }

  function emitDryTrackWake(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    groundType: string,
    gy: number,
    surfaceMultiplier: number,
    sizeVariation: number,
    alphaVariation: number,
  ): void {
    _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.6;
    _puffO.pos[1] = Math.max(pos.y, gy) + (groundType === 'hard' ? 0.55 : 0.95) + rng() * 0.35;
    _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.6;
    const inheritedSpeed = intensity * 2.4;
    _puffO.vel[0] = dir.x * inheritedSpeed - dir.x * (1.5 + rng() * 1.8)
      + (rng() - 0.5) * 1.3 + COLUMN_WIND_X * 0.55;
    _puffO.vel[1] = 0.9 + (1.4 + rng() * 1.3) * intensity;
    _puffO.vel[2] = dir.z * inheritedSpeed - dir.z * (1.5 + rng() * 1.8)
      + (rng() - 0.5) * 1.3 + COLUMN_WIND_Z * 0.55;
    _puffO.life = 3.0 + rng() * 2.6;
    _puffO.size0 = (0.4 + intensity * 0.7) * sizeVariation;
    _puffO.size1 = Math.min(
      5.2,
      (2.4 + intensity * 3.4 + rng() * 1.2)
        * sizeVariation * Math.min(surfaceMultiplier, 1.25),
    ) * dustSizeCap;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 2.4;
    col3(dustColor0, _puffO.col0);
    col3(dustColor1, _puffO.col1);
    const maxAlpha = groundType === 'hard' ? 0.42 : 0.58;
    const baseAlpha = groundType === 'hard'
      ? 0.14 + 0.32 * intensity
      : 0.26 + 0.36 * intensity;
    _puffO.alpha = Math.min(maxAlpha, baseAlpha * alphaVariation * 1.18) * dustAlphaCap;
    _puffO.grav = -0.10;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
  }

  function emitUpperTrackWake(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    intensity: number,
    gy: number,
  ): void {
    _puffO.pos[0] = pos.x - dir.x * 1.2 + (rng() - 0.5) * 0.5;
    _puffO.pos[1] = Math.max(pos.y, gy) + 1.15 + rng() * 0.4;
    _puffO.pos[2] = pos.z - dir.z * 1.2 + (rng() - 0.5) * 0.5;
    _puffO.vel[0] = dir.x * intensity * 1.6 + (rng() - 0.5) + COLUMN_WIND_X * 0.6;
    _puffO.vel[1] = 1.5 + rng() * 1.2 * intensity;
    _puffO.vel[2] = dir.z * intensity * 1.6 + (rng() - 0.5) + COLUMN_WIND_Z * 0.6;
    _puffO.life = 2.6 + rng() * 1.6;
    _puffO.size0 = 0.8 + intensity * 0.5;
    _puffO.size1 = Math.min(5.6, 3.0 + intensity * 2.6 + rng() * 1.2) * dustSizeCap;
    _puffO.rot = rng() * Math.PI * 2;
    _puffO.rotVel = (rng() - 0.5) * 2.0;
    col3(0xa8a189, _puffO.col0);
    col3(0x8a876f, _puffO.col1);
    _puffO.alpha = Math.min(0.56, 0.34 + 0.34 * intensity) * dustAlphaCap;
    _puffO.grav = -0.06;
    _puffO.birthOffset = 0;
    particles.emit('dust', _puffO);
  }

  function rebaseFxClock(atTimeS: number): void {
    const delta = atTimeS - particles.getTime();
    if (Math.abs(delta) <= 20) return;
    particles.shiftTime(delta);
    for (const tracer of staticTracers) if (tracer.length > 14) tracer[14] += delta;
    for (const state of lightStates) state.bornAt += delta;
    for (const ring of shockRings) ring.bornAt += delta;
    for (const ring of muzzleRings) ring.bornAt += delta;
    const births = printBirth.array;
    for (let index = 0; index < births.length; index++) {
      if (births[index] > -1e8) births[index] += delta;
    }
    printBirth.clearUpdateRanges();
    printBirth.addUpdateRange(0, births.length);
    printBirth.needsUpdate = true;
    lastTickS += delta;
    noteFxClockShift(delta);
  }

  type PropBreakFamily =
    | 'drumblast'
    | 'woodbuilding'
    | 'canvasbuilding'
    | 'metalbuilding'
    | 'masonry'
    | 'sandbag'
    | 'vehicle'
    | 'canvas'
    | 'ammo'
    | 'wood'
    | 'hay'
    | 'barrel'
    | 'pot'
    | 'metal';

  function propBreakFamily(kind: string): PropBreakFamily {
    if (kind === 'drumblast') return 'drumblast';
    if (/fieldhut|leanto|huntingblind|fishershack|saunahut|alpinerefuge|stilthouse|longhouse/.test(kind)) return 'woodbuilding';
    if (/deserttent|commandtent|fieldhospital/.test(kind)) return 'canvasbuilding';
    if (/guardpost|motorpool|quonsethut|transformershed|checkpointhut/.test(kind)) return 'metalbuilding';
    if (/^wall/.test(kind)) return 'masonry';
    if (/^sandbag/.test(kind)) return 'sandbag';
    if (/truck|jeep/.test(kind)) return 'vehicle';
    if (kind === 'tent') return 'canvas';
    if (kind === 'ammobox') return 'ammo';
    if (/^fence|^gate|crate|pallet|cart|stall|bench|trough|firewood|sled|rugframe/.test(kind)) return 'wood';
    if (/bale|stook|hay/.test(kind)) return 'hay';
    if (kind === 'barrel') return 'barrel';
    if (kind === 'pot') return 'pot';
    if (/lamp|drum|churn/.test(kind)) return 'metal';
    return 'wood';
  }

  function emitBuildingBreak(
    family: 'woodbuilding' | 'canvasbuilding' | 'metalbuilding',
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    const canvas = family === 'canvasbuilding';
    const metal = family === 'metalbuilding';
    if (metal) {
      _v3.set(pos.x, gy + Math.min(1.8, heightM * 0.42), pos.z);
      sparkFan(_v3, _UP, 12, 9, 1.3, 0xffc980, 0.5, 0.035, 0.045, 0, 0.14);
    }
    const fragmentCount = canvas ? 8 : metal ? 13 : 17;
    for (let i = 0; i < fragmentCount; i++) {
      const a = rng() * Math.PI * 2;
      _debO.pos[0] = pos.x + (rng() - 0.5) * 2.8;
      _debO.pos[1] = gy + 0.35 + rng() * Math.min(2.4, heightM * 0.55);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 2.8;
      _debO.vel[0] = dir.x * (2.2 + rng() * 3.4) + Math.cos(a) * (1.2 + rng() * 3.5);
      _debO.vel[1] = 2.0 + rng() * 4.2;
      _debO.vel[2] = dir.z * (2.2 + rng() * 3.4) + Math.sin(a) * (1.2 + rng() * 3.5);
      _debO.life = 1.5 + rng() * 0.6;
      _debO.scale = (canvas ? 0.06 : 0.09) + rng() * (canvas ? 0.07 : 0.13);
      _debO.spin = 8 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = metal && rng() < 0.12 ? 0.35 : 0;
      _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    const dustA = canvas ? 0xa89b7d : metal ? 0x777979 : 0x8a745e;
    const dustB = canvas ? 0x82775f : metal ? 0x55595a : 0x675444;
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 3.6;
      _puffO.pos[1] = gy + 0.18 + rng() * 0.9;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 3.6;
      _puffO.vel[0] = Math.cos(a) * (1.8 + rng() * 3.0) + dir.x * 2.0;
      _puffO.vel[1] = 0.8 + rng() * 1.5;
      _puffO.vel[2] = Math.sin(a) * (1.8 + rng() * 3.0) + dir.z * 2.0;
      _puffO.life = 1.6 + rng() * 1.2;
      _puffO.size0 = 0.75 + rng() * 0.5; _puffO.size1 = 3.2 + rng() * 2.2;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.7;
      col3(dustA, _puffO.col0); col3(dustB, _puffO.col1);
      _puffO.alpha = 0.42 + rng() * 0.15; _puffO.grav = -0.38; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
  }

  function emitMasonryBreak(
    kind: string,
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    const adobe = /adobe/.test(kind);
    const dustA = adobe ? 0xa58a64 : 0x8d877b;
    const dustB = adobe ? 0x86704f : 0x6f695e;
    for (let i = 0; i < 15; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 1.6;
      _debO.pos[1] = gy + 0.25 + rng() * Math.min(1.0, heightM * 0.8);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 1.6;
      _debO.vel[0] = dir.x * (2.2 + rng() * 2.6) + (rng() - 0.5) * 3.6;
      _debO.vel[1] = 1.8 + rng() * 3.4;
      _debO.vel[2] = dir.z * (2.2 + rng() * 2.6) + (rng() - 0.5) * 3.6;
      _debO.life = 1.5 + rng() * 0.5;
      _debO.scale = 0.10 + rng() * 0.12;
      _debO.spin = 8 + rng() * 14;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    for (let i = 0; i < 11; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.8;
      _puffO.pos[1] = gy + 0.3 + rng() * 0.7;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.8;
      _puffO.vel[0] = Math.cos(a) * (1.8 + rng() * 2.4) + dir.x * 2.2;
      _puffO.vel[1] = 1.0 + rng() * 1.5;
      _puffO.vel[2] = Math.sin(a) * (1.8 + rng() * 2.4) + dir.z * 2.2;
      _puffO.life = 1.6 + rng() * 1.1;
      _puffO.size0 = 0.7 + rng() * 0.4; _puffO.size1 = 2.8 + rng() * 1.5;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.8;
      col3(dustA, _puffO.col0); col3(dustB, _puffO.col1);
      _puffO.alpha = 0.46 + rng() * 0.16; _puffO.grav = -0.42; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
  }

  function emitSandbagBreak(pos: THREE.Vector3, dir: THREE.Vector3, gy: number): void {
    for (let i = 0; i < 13; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.8;
      _puffO.pos[1] = gy + 0.2 + rng() * 0.5;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.8;
      _puffO.vel[0] = Math.cos(a) * (1.5 + rng() * 2.2) + dir.x * 2.6;
      _puffO.vel[1] = 0.7 + rng() * 1.0;
      _puffO.vel[2] = Math.sin(a) * (1.5 + rng() * 2.2) + dir.z * 2.6;
      _puffO.life = 1.5 + rng() * 1.0;
      _puffO.size0 = 0.6 + rng() * 0.4; _puffO.size1 = 2.6 + rng() * 1.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xa89772, _puffO.col0); col3(0x8a7b5c, _puffO.col1);
      _puffO.alpha = 0.48 + rng() * 0.14; _puffO.grav = -0.55; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
    for (let i = 0; i < 4; i++) {
      _debO.pos[0] = pos.x; _debO.pos[1] = gy + 0.4; _debO.pos[2] = pos.z;
      _debO.vel[0] = dir.x * (2 + rng() * 2.5) + (rng() - 0.5) * 3;
      _debO.vel[1] = 1.6 + rng() * 2.0;
      _debO.vel[2] = dir.z * (2 + rng() * 2.5) + (rng() - 0.5) * 3;
      _debO.life = 1.1; _debO.scale = 0.06 + rng() * 0.05; _debO.spin = 10 + rng() * 12;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitVehicleBreak(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    _v3.set(pos.x, gy + Math.min(1.2, heightM * 0.5), pos.z);
    sparkFan(_v3, _UP, 14, 11, 1.2, 0xffce8a, 0.5, 0.04, 0.04, 0, 0.12);
    for (let i = 0; i < 10; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 1.4;
      _debO.pos[1] = gy + 0.4 + rng() * Math.min(1.4, heightM * 0.6);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 1.4;
      _debO.vel[0] = dir.x * (2.6 + rng() * 3.2) + (rng() - 0.5) * 4.5;
      _debO.vel[1] = 2.4 + rng() * 3.6;
      _debO.vel[2] = dir.z * (2.6 + rng() * 3.2) + (rng() - 0.5) * 4.5;
      _debO.life = 1.5; _debO.scale = 0.08 + rng() * 0.09; _debO.spin = 10 + rng() * 16;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = rng() < 0.2 ? 0.45 : 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    for (let i = 0; i < 5; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2;
      _puffO.pos[1] = gy + 0.7 + rng() * 0.8;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2;
      _puffO.vel[0] = (rng() - 0.5) * 1.2; _puffO.vel[1] = 1.8 + rng() * 1.6; _puffO.vel[2] = (rng() - 0.5) * 1.2;
      _puffO.life = 0.5 + rng() * 0.3;
      _puffO.size0 = 0.5 + rng() * 0.3; _puffO.size1 = 1.1 + rng() * 0.5;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 3;
      col3(0xffb054, _puffO.col0); col3(0xd96a22, _puffO.col1);
      _puffO.alpha = 0.85; _puffO.grav = 0.6; _puffO.birthOffset = 0;
      particles.emit('fire', _puffO);
    }
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.2;
      _puffO.pos[1] = gy + 0.8 + rng() * 0.8;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.2;
      _puffO.vel[0] = Math.cos(a) * (0.8 + rng() * 1.2) + dir.x * 1.4;
      _puffO.vel[1] = 1.6 + rng() * 1.6;
      _puffO.vel[2] = Math.sin(a) * (0.8 + rng() * 1.2) + dir.z * 1.4;
      _puffO.life = 1.8 + rng() * 1.2;
      _puffO.size0 = 0.7 + rng() * 0.4; _puffO.size1 = 3.0 + rng() * 1.6;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.6;
      col3(0x2e2b28, _puffO.col0); col3(0x4a4642, _puffO.col1);
      _puffO.alpha = 0.5 + rng() * 0.15; _puffO.grav = 0.25; _puffO.birthOffset = 0;
      particles.emit('smoke', _puffO);
    }
  }

  function emitCanvasBreak(pos: THREE.Vector3, dir: THREE.Vector3, gy: number): void {
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.4;
      _puffO.pos[1] = gy + 0.3 + rng() * 0.9;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.4;
      _puffO.vel[0] = Math.cos(a) * (1.4 + rng() * 1.8) + dir.x * 2.0;
      _puffO.vel[1] = 0.9 + rng() * 1.2;
      _puffO.vel[2] = Math.sin(a) * (1.4 + rng() * 1.8) + dir.z * 2.0;
      _puffO.life = 1.3 + rng() * 0.8;
      _puffO.size0 = 0.5 + rng() * 0.3; _puffO.size1 = 2.0 + rng() * 1.0;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0xa39676, _puffO.col0); col3(0x857a5e, _puffO.col1);
      _puffO.alpha = 0.4 + rng() * 0.14; _puffO.grav = -0.35; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
    for (let i = 0; i < 4; i++) {
      _debO.pos[0] = pos.x; _debO.pos[1] = gy + 0.5; _debO.pos[2] = pos.z;
      _debO.vel[0] = dir.x * (2 + rng() * 2.5) + (rng() - 0.5) * 3.2;
      _debO.vel[1] = 2.0 + rng() * 2.4;
      _debO.vel[2] = dir.z * (2 + rng() * 2.5) + (rng() - 0.5) * 3.2;
      _debO.life = 1.2; _debO.scale = 0.05 + rng() * 0.05; _debO.spin = 12 + rng() * 14;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitAmmoBreak(pos: THREE.Vector3, dir: THREE.Vector3, gy: number): void {
    _v3.set(pos.x, gy + 0.4, pos.z);
    sparkFan(_v3, _UP, 8, 8, 1.0, 0xffd58a, 0.4, 0.03, 0.035, 0, 0.14);
    for (let i = 0; i < 9; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 0.6;
      _debO.pos[1] = gy + 0.3 + rng() * 0.4;
      _debO.pos[2] = pos.z + (rng() - 0.5) * 0.6;
      _debO.vel[0] = dir.x * (2.4 + rng() * 3.0) + (rng() - 0.5) * 4.0;
      _debO.vel[1] = 2.2 + rng() * 3.0;
      _debO.vel[2] = dir.z * (2.4 + rng() * 3.0) + (rng() - 0.5) * 4.0;
      _debO.life = 1.3; _debO.scale = 0.05 + rng() * 0.06; _debO.spin = 12 + rng() * 16;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitDrumBlast(pos: THREE.Vector3, gy: number): void {
    const cy = gy + 0.7;
    spawnScorch(pos.x, pos.z, 2.4 + rng() * 0.7);
    _puffO.pos[0] = pos.x; _puffO.pos[1] = cy + 0.4; _puffO.pos[2] = pos.z;
    _puffO.vel[0] = 0; _puffO.vel[1] = 0.6; _puffO.vel[2] = 0;
    _puffO.life = 0.22;
    _puffO.size0 = 1.6; _puffO.size1 = 3.6;
    _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
    col3(0xffe9b8, _puffO.col0); col3(0xffb45e, _puffO.col1);
    _puffO.alpha = 0.95; _puffO.grav = 0; _puffO.birthOffset = 0;
    particles.emit('flash', _puffO);
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.7;
      _puffO.pos[1] = cy + rng() * 0.7;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.7;
      _puffO.vel[0] = Math.cos(a) * (1.6 + rng() * 2.4);
      _puffO.vel[1] = 2.6 + rng() * 3.0;
      _puffO.vel[2] = Math.sin(a) * (1.6 + rng() * 2.4);
      _puffO.life = 0.5 + rng() * 0.35;
      _puffO.size0 = 0.8 + rng() * 0.5; _puffO.size1 = 2.0 + rng() * 0.9;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
      col3(0xffc262, _puffO.col0); col3(0xe06a1e, _puffO.col1);
      _puffO.alpha = 0.9; _puffO.grav = 1.1; _puffO.birthOffset = 0;
      particles.emit('fire', _puffO);
    }
    for (let i = 0; i < 7; i++) {
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.9;
      _puffO.pos[1] = cy + 0.4 + rng() * 0.9;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.9;
      _puffO.vel[0] = (rng() - 0.5) * 1.6;
      _puffO.vel[1] = 2.2 + rng() * 2.2;
      _puffO.vel[2] = (rng() - 0.5) * 1.6;
      _puffO.life = 1.9 + rng() * 1.3;
      _puffO.size0 = 1.0 + rng() * 0.6; _puffO.size1 = 3.6 + rng() * 1.8;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.4;
      col3(0x241f1b, _puffO.col0); col3(0x45403a, _puffO.col1);
      _puffO.alpha = 0.62; _puffO.grav = 0.35; _puffO.birthOffset = 0;
      particles.emit('billow', _puffO);
    }
    _v3.set(pos.x, cy, pos.z);
    sparkFan(_v3, _UP, 16, 15, 1.15, 0xffc274, 0.55, 0.045, 0.05, 0, 0.1);
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      _debO.pos[0] = pos.x; _debO.pos[1] = cy; _debO.pos[2] = pos.z;
      _debO.vel[0] = Math.cos(a) * (6 + rng() * 7);
      _debO.vel[1] = 3.5 + rng() * 5;
      _debO.vel[2] = Math.sin(a) * (6 + rng() * 7);
      _debO.life = 1.3 + rng() * 0.5;
      _debO.scale = 0.07 + rng() * 0.09;
      _debO.spin = 12 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = rng() < 0.5 ? 1 : 0.45; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitHayBreak(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.8;
      _puffO.pos[1] = gy + 0.3 + rng() * Math.min(1.6, heightM * 0.7);
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.8;
      _puffO.vel[0] = Math.cos(a) * (1.2 + rng() * 1.8) + dir.x * 2.0;
      _puffO.vel[1] = 0.8 + rng() * 1.4;
      _puffO.vel[2] = Math.sin(a) * (1.2 + rng() * 1.8) + dir.z * 2.0;
      _puffO.life = 1.6 + rng() * 1.2;
      _puffO.size0 = 0.5 + rng() * 0.4; _puffO.size1 = 2.0 + rng() * 1.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.6;
      col3(0xb59f5e, _puffO.col0); col3(0x93804a, _puffO.col1);
      _puffO.alpha = 0.42 + rng() * 0.14; _puffO.grav = -0.25; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
    for (let i = 0; i < 5; i++) {
      _debO.pos[0] = pos.x; _debO.pos[1] = gy + 0.5 + rng() * 0.6; _debO.pos[2] = pos.z;
      _debO.vel[0] = dir.x * (1.5 + rng() * 2) + (rng() - 0.5) * 3;
      _debO.vel[1] = 1.8 + rng() * 2.2;
      _debO.vel[2] = dir.z * (1.5 + rng() * 2) + (rng() - 0.5) * 3;
      _debO.life = 1.2; _debO.scale = 0.035 + rng() * 0.04; _debO.spin = 8 + rng() * 10;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
  }

  function emitMetalBreak(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    _v3.set(pos.x, gy + Math.min(1.0, heightM * 0.4), pos.z);
    sparkFan(_v3, _UP, 10, 9, 1.1, 0xffce8a, 0.45, 0.035, 0.035, 0, 0.1);
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x; _puffO.pos[1] = gy + 0.3; _puffO.pos[2] = pos.z;
      _puffO.vel[0] = Math.cos(a) * (1.4 + rng() * 1.6) + dir.x * 2.2;
      _puffO.vel[1] = 0.8 + rng() * 1.0;
      _puffO.vel[2] = Math.sin(a) * (1.4 + rng() * 1.6) + dir.z * 2.2;
      _puffO.life = 1.1 + rng() * 0.7;
      _puffO.size0 = 0.4 + rng() * 0.3; _puffO.size1 = 1.6 + rng() * 0.9;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      col3(0x6f6a60, _puffO.col0); col3(0x57534b, _puffO.col1);
      _puffO.alpha = 0.36 + rng() * 0.14; _puffO.grav = -0.35; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
  }

  function emitWoodBreak(
    family: 'wood' | 'barrel' | 'pot',
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number,
    gy: number,
  ): void {
    const nChip = family === 'barrel' ? 10 : family === 'pot' ? 9 : 12;
    const chipScaleBase = family === 'barrel' ? 0.08 : family === 'pot' ? 0.04 : 0.05;
    const chipScaleRange = family === 'barrel' ? 0.09 : family === 'pot' ? 0.05 : 0.07;
    for (let i = 0; i < nChip; i++) {
      _debO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
      _debO.pos[1] = gy + 0.3 + rng() * Math.min(1.1, heightM * 0.5);
      _debO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
      _debO.vel[0] = dir.x * (2.5 + rng() * 3.5) + (rng() - 0.5) * 4.5;
      _debO.vel[1] = 2.2 + rng() * 3.6;
      _debO.vel[2] = dir.z * (2.5 + rng() * 3.5) + (rng() - 0.5) * 4.5;
      _debO.life = 1.4; _debO.scale = chipScaleBase + rng() * chipScaleRange; _debO.spin = 12 + rng() * 18;
      _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
      _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
      particles.emit('debris', _debO);
    }
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
      _puffO.pos[1] = gy + 0.25 + rng() * 0.4;
      _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
      _puffO.vel[0] = Math.cos(a) * (1.5 + rng() * 2.0) + dir.x * 2.4;
      _puffO.vel[1] = 0.9 + rng() * 1.2;
      _puffO.vel[2] = Math.sin(a) * (1.5 + rng() * 2.0) + dir.z * 2.4;
      _puffO.life = 1.3 + rng() * 0.9;
      _puffO.size0 = 0.45 + rng() * 0.3; _puffO.size1 = 1.9 + rng() * 1.1;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      if (family === 'pot') { col3(0x9a6a4a, _puffO.col0); col3(0x7c5238, _puffO.col1); }
      else { col3(0x8a8271, _puffO.col0); col3(0x776f60, _puffO.col1); }
      _puffO.alpha = 0.4 + rng() * 0.15; _puffO.grav = -0.4; _puffO.birthOffset = 0;
      particles.emit('dust', _puffO);
    }
  }

  const fx: FxRuntime = {
    group,

    /**
     * Hide already-recorded battle destruction while killcam shows the
     * reconstructed pre-impact state. Emitters continue aging, so releasing
     * the gate never dumps a backlog; pooled lights stay in the scene with
     * zero intensity to preserve shader-program stability.
     */
    setReplaySuppressed(suppressed: boolean): void {
      replaySuppressed = !!suppressed;
      if (replaySuppressed) {
        for (const st of lightStates) st.light.intensity = 0;
        for (const r of shockRings) { r.mesh.visible = false; r.mat.opacity = 0; }
        for (const r of muzzleRings) { r.mesh.visible = false; r.mat.opacity = 0; }
      }
    },

    /** Read-only killcam/visual-regression telemetry. */
    getReplaySuppressionDebug() {
      return {
        suppressed: replaySuppressed,
        lightIntensities: [muzzleLight.intensity, explosionLight.intensity],
        worldFixedColumns: columns.reduce((count, col) => count + (col.key == null ? 1 : 0), 0),
      };
    },

    /** Render-side ATGM visibility telemetry used by the browser lifecycle gate. */
    getGuidedMissileDebug() {
      return {
        bodies: renderedAtgmBodies,
        trailSegments: renderedAtgmTrailSegments,
      };
    },

    /** Moving-emitter telemetry for deterministic browser/lifecycle probes. */
    getAttachmentDebug() {
      let keyed = 0;
      let resolved = 0;
      const subjects = [];
      for (const col of columns) {
        if (col.key == null) continue;
        keyed++;
        if (col.attachmentResolved) resolved++;
        subjects.push({
          id: col.key,
          resolved: !!col.attachmentResolved,
          pos: [col.pos[0], col.pos[1], col.pos[2]],
          localPos: col.localPos
            ? [col.localPos[0], col.localPos[1], col.localPos[2]] : null,
        });
      }
      return {
        keyedColumns: keyed,
        resolvedKeyedColumns: resolved,
        unresolvedKeyedColumns: keyed - resolved,
        worldFixedColumns: columns.length - keyed,
        subjects,
      };
    },

    /**
     * LOADING PERF (boot r9): finish the deferred particle sprite bakes
     * (idempotent, ~200 ms once). Must run before the first fx-visible frame;
     * main.ts warmCombatPipeline() is the enforcing call site.
     */
    warmTextures() { particles.warmTextures(); },

    /** Decode deterministic prebuilt atlases during quiet garage time. */
    preloadTextures() { return particles.preloadTextures(); },

    /** Paint the deferred sprite sheets one deterministic tile per frame. */
    warmTexturesChunked(yieldFrame: () => Promise<void>) {
      return particles.warmTexturesChunked(yieldFrame);
    },

    /**
     * Instantiate the exact pooled families reachable in the first seconds
     * of a battle. The caller renders once and resetAll() removes every warm
     * instance, so no synthetic event enters gameplay or survives loading.
     */
    warmOpeningEffects(
      pos: THREE.Vector3,
      dir: THREE.Vector3,
      normal: THREE.Vector3,
      caliberMm = 120,
    ): void {
      fx.muzzleFlash(pos, dir, caliberMm);
      spawnSabotPetals(pos, dir);
      fx.impact('pen', pos, normal, caliberMm);
      fx.impact('terrain', pos, normal, caliberMm);
      dirtPlume(pos, 76, false);
      for (const kind of ['fence', 'wall', 'sandbag', 'truck', 'drumblast']) {
        fx.propBreak(kind, pos, dir, 1.5);
      }
      fx.propCrush(pos, dir, 7);
    },

    /**
     * Covered loading only: submit one instance of each missile-only material
     * through the same body writer as real flight. There is no shell identity,
     * event, world sweep or persistent trail; resetAll removes both instances.
     * Call after update(), which normally rebuilds these counts from live shells.
     */
    warmProjectilePresentation(pos: THREE.Vector3, dir: THREE.Vector3): void {
      liveAtgmCount = 0;
      writeGuidedBody(pos, dir);
      commitAtgmInstances();
    },

    /**
     * Per-render-frame advance: particle clock, timers, lights, smoke columns,
     * and tracer ribbons rebuilt from live shell entities.
     * @param {number} dt render delta seconds
     * @param {object[]} shells live ShellEntity[] (§2.5)
     * @param {THREE.Camera} camera active camera (billboarding is GPU-side; unused)
     * @param {(id:string)=>object|null} [resolveSubject] live entity/actor lookup
     */
    update(
      dt: number,
      shells: LiveShell[],
      camera: THREE.Camera,
      resolveSubject: ((id: string) => FxEntity | null) | null = null,
    ): void {
      particles.update(dt);
      printUniforms.uTime.value = particles.getTime();
      const tickDt = advanceFxClock();
      battleFreshS += tickDt;
      syncColumnAnchors(resolveSubject);
      updateClockDrivenLights();
      sweepImpactDecals(dt);
      updateWreckLight();
      advanceTimedFx(tickDt);
      sweepShellsThroughProps(shells);
      let tracerCount = writeLiveShellTracers(shells, camera);
      commitAtgmInstances();
      tracerCount = writeGuidedTrailAfterglow(tracerCount, tickDt);
      tracerCount = writeShellTrailAfterglow(tracerCount, tickDt);
      tracerCount = writeStaticTracerAfterglow(tracerCount);
      commitTracerInstances(tracerCount);
    },

    /**
     * Subscribe to combat bus events (ARCHITECTURE §1.5 payloads).
     * @param {object} bus injected event bus
     */
    bindBus(bus: FxEventBus): void {
      onFxEvent(bus, 'shell:fired', (e) => {
        _v3.set(e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2]);
        _v4.set(e.dir[0], e.dir[1], e.dir[2]);
        if (!e.feedbackPredicted) fx.muzzleFlash(_v3, _v4, e.caliberMm);
        if (e.shellType === 'APFSDS') spawnSabotPetals(_v3, _v4);
        // world-dressing r1: remember the shell's type so its world impact
        // can size the destructible-prop blast (HE clears a radius), and
        // seed its sweep tail at the muzzle — a fast shell can be born and
        // dead between two render frames, so the expiry-time sweep below is
        // what guarantees flight coverage against destructible props.
        if (shellKinds.size > 96) { shellKinds.clear(); sweepTails.clear(); } // leak guard
        shellKinds.set(e.shellId, e.shellType);
        sweepTails.set(e.shellId, [e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2]]);
      });
      onFxEvent(bus, 'weapon:predicted', (e) => {
        if (!e.isPlayer) return;
        _v3.set(e.muzzlePos[0], e.muzzlePos[1], e.muzzlePos[2]);
        _v4.set(e.dir[0], e.dir[1], e.dir[2]);
        // Presentation only; sabot petals and sweep/prop ownership await authority.
        fx.muzzleFlash(_v3, _v4, e.caliberMm);
      });
      onFxEvent(bus, 'shell:hit', (e) => {
        _v3.set(e.pos[0], e.pos[1], e.pos[2]);
        _v4.set(e.normal[0], e.normal[1], e.normal[2]);
        if (e.targetId) lastKnownPos.set(e.targetId, [e.pos[0], e.pos[1], e.pos[2]]);
        // world-dressing r1: a tank hit still ends the shell — sweep the
        // unswept flight remainder against destructible props and drop the
        // bookkeeping (fences between shooter and target break too)
        if (e.shellId != null) {
          const tail = sweepTails.get(e.shellId);
          if (tail) {
            sweepTails.delete(e.shellId);
            notifyShellSweep(tail[0], tail[1], tail[2], e.pos[0], e.pos[1], e.pos[2]);
          }
          shellKinds.delete(e.shellId);
        }
        // Ballistic scarring has exactly one event owner. The FX runtime is
        // demand-loaded after main's presentation listeners, so attempting
        // to dedupe a second main-thread stamp by subscription order is not
        // reliable. All shell:hit marks are authored here from the exact
        // authoritative articulation-local contact data.
        const ent = decalEntityFor(e.targetId);
        if (ent) impactDecals.stampFromEvent(e, ent);
        // ERA is an outer-layer activation, not necessarily the final hit
        // result. A rod/jet may pop the cassette and continue into a pen or
        // non-pen on the base armor; preserve both visual events.
        const eraActivations = (e.eraActivations || []).filter(
          (activation) => activation?.pos?.length === 3,
        );
        if (eraActivations.length) {
          for (const activation of eraActivations) {
            _v5.fromArray(activation.pos!);
            _v6.fromArray(activation.normal?.length === 3 ? activation.normal : e.normal);
            fx.impact('era', _v5, _v6, e.caliberMm);
          }
        } else if (isEraActivation(e) && e.kind !== 'era') {
          fx.impact('era', _v3, _v4, e.caliberMm);
        }
        // A terminal ERA absorb already received its exact activation above.
        // Legacy payloads still fall through to their ordinary `era` impact.
        if (e.kind !== 'era' || !eraActivations.length) {
          fx.impact(e.kind, _v3, _v4, e.caliberMm);
        }
      });
      onFxEvent(bus, 'shell:expired', (e) => {
        // world-dressing r1: close out the shell's destructible-prop story —
        // (1) sweep the UNSWEPT remainder of its flight (tail -> expiry
        // point; a fast shell can live for fewer sim ticks than one render
        // frame, so this event is the coverage guarantee), then (2) break
        // props around the burst point (HE gets a real radius, AP a token
        // one). Runs BEFORE the terrain gate below — prop-collider hits
        // report hitTerrain=false but still carry pos.
        {
          const st = shellKinds.get(e.shellId);
          shellKinds.delete(e.shellId);
          const tail = sweepTails.get(e.shellId);
          if (tail) {
            sweepTails.delete(e.shellId);
            notifyShellSweep(tail[0], tail[1], tail[2], e.pos[0], e.pos[1], e.pos[2]);
          }
          const he = st === 'HE' || st === 'HESH';
          notifyShellImpact(e.pos[0], e.pos[1], e.pos[2], { he, r: he ? 4.6 : 1.0 });
        }
        _v3.set(e.pos[0], e.pos[1], e.pos[2]);
        if (e.hitKind === 'prop') {
          if (Array.isArray(e.normal)) _v4.set(e.normal[0], e.normal[1], e.normal[2]).normalize();
          else _v4.copy(_UP);
          fx.impact('structure', _v3, _v4, e.caliberMm || 90);
          return;
        }
        if (e.hitTerrain) dirtPlume(_v3, e.caliberMm || 76, false);
      });
      onFxEvent(bus, 'tank:destroyed', (e) => {
        // Transition from a moving live-tank emitter to one world-fixed wreck
        // emitter. Fire deaths otherwise left both columns alive for 40 s.
        retireSubjectColumn(e.id);
        lastKnownPos.set(e.id, [e.pos[0], e.pos[1], e.pos[2]]);
        // wreck burnt-swap clears the battle scarring (same beat that hides
        // the profile decalMeshes in setDestroyed) — and guarantees the burn
        // material traverse never converts a decal mesh into an opaque quad
        impactDecals.clearVehicle(e.id);
        const ent = decalEntityFor(e.id);
        if (ent) impactDecals.clearVehicle(ent.visual);
        _v3.set(e.pos[0], e.pos[1], e.pos[2]);
        fx.destruction(_v3, null, e.cause || 'shot');
      });
      onFxEvent(bus, 'module:state', (e) => {
        // de-track moment: thrown link fragments, a grinding spark burst and a
        // heavy dust kick at the running gear (the thrown-track ribbon, band
        // slump and road-wheel scatter live on the visual — tankFactory
        // setTrackState — this is the particle side of the same beat)
        if ((e.module === 'trackL' || e.module === 'trackR') && e.state === 'red') {
          const p = lastKnownPos.get(e.id);
          if (!p) return;
          // r5: the whole beat scaled ~3x and lifted above the grass line —
          // the r4 live test at 10 m in field grass showed no readable event
          // (0.03-width sparks + knee-high dust swallowed by the meadow).
          _v3.set(p[0], p[1] + 0.55, p[2]);
          // r2: dark disturbed-earth stamp under the shed point — the thrown
          // band must leave a gouge where it tore off (detrack minor)
          spawnScorch(p[0], p[2], 2.4 + rng() * 0.8);
          sparkFan(_v3, _UP, 26, 16, 1.25, 0xffce8a, 0.7, 0.05, 0.045, 0, 0.16);
          // link fragments: flat dark chips whipped off the sprocket
          for (let i = 0; i < 12; i++) {
            const a = rng() * Math.PI * 2;
            _debO.pos[0] = p[0]; _debO.pos[1] = p[1] + 0.55; _debO.pos[2] = p[2];
            _debO.vel[0] = Math.cos(a) * (4.5 + rng() * 6);
            _debO.vel[1] = 4.5 + rng() * 6;
            _debO.vel[2] = Math.sin(a) * (4.5 + rng() * 6);
            _debO.life = 1.6; _debO.scale = 0.09 + rng() * 0.10; _debO.spin = 14 + rng() * 16;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(p[0], p[2]); _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          // grinding dust burst boiling out of the running gear, tall enough
          // to silhouette over meadow grass
          for (let i = 0; i < 18; i++) {
            const a = rng() * Math.PI * 2;
            _puffO.pos[0] = p[0] + (rng() - 0.5) * 1.8;
            _puffO.pos[1] = p[1] + 0.5 + rng() * 0.5;
            _puffO.pos[2] = p[2] + (rng() - 0.5) * 1.8;
            _puffO.vel[0] = Math.cos(a) * (2.2 + rng() * 3.2);
            _puffO.vel[1] = 1.6 + rng() * 1.6;
            _puffO.vel[2] = Math.sin(a) * (2.2 + rng() * 3.2);
            _puffO.life = 1.6 + rng() * 1.2;
            _puffO.size0 = 0.7; _puffO.size1 = 3.4 + rng() * 1.6;
            _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
            col3(0x8d8571, _puffO.col0); col3(0x7a7263, _puffO.col1);
            _puffO.alpha = 0.5; _puffO.grav = -0.4; _puffO.birthOffset = -rng() * 0.15;
            particles.emit('dust', _puffO);
          }
        }
      });
      onFxEvent(bus, 'tank:fire', (e) => {
        if (e.burning) {
          const p = lastKnownPos.get(e.id);
          if (!p) return;
          // one column per tank id; refresh if already burning
          const existing = columns.find((c) => c.key === e.id);
          if (existing) existing.ttl = SMOKE_COLUMN_S;
          else {
            const col: SmokeColumn = {
              key: e.id,
              pos: [p[0], p[1], p[2]],
              acc: 0,
              ttl: SMOKE_COLUMN_S,
              scale: 0.8,
            };
            columns.push(col);
            emitColumnPuff(col); // ignition is visible even on a frozen frame
            capColumns();
          }
        } else {
          retireSubjectColumn(e.id);
        }
      });
    },

    /**
     * Muzzle flash: light + additive flash cards + smoke ring + ground dust.
     * @param {THREE.Vector3} pos muzzle tip (world)
     * @param {THREE.Vector3} dir unit fire direction
     * @param {number} caliberMm gun caliber (scales the effect)
     */
    muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, caliberMm: number): void {
      const lightK = spawnMuzzleFlash(pos, dir, caliberMm, 0);
      // r2 ON THE BORE AXIS: the r1 light floated 0.45 m ABOVE the tube and
      // its local pool rendered as a glowing lozenge sitting ON TOP of the
      // barrel at mid-length (critic: "as if the barrel exploded midway").
      // The light now sits a hair behind the tip ON the axis — the tube's
      // last meter, mantlet and hull front all catch the same falloff and
      // the brightest lit surface is the muzzle itself.
      _sv.copy(pos).addScaledVector(dir, -0.15);
      _sv.y += 0.10;
      flashLight(lightStates[0], _sv, MUZZLE_LIGHT_PEAK * lightK, 0);
    },

    /** Tank-on-tank metal contact: lateral sparks, track debris and a low
     * pressure-dust shove. Deliberately omits every shell/penetration cue. */
    vehicleCollision(
      pos: THREE.Vector3,
      normal: THREE.Vector3,
      closingMps = 0,
    ): void {
      const k = THREE.MathUtils.clamp((Number(closingMps) || 0) / 12, 0.35, 1.4);
      _v1.copy(normal);
      if (_v1.lengthSq() < 1e-6) _v1.set(0, 0, 1); else _v1.normalize();
      _v1.y = Math.max(0.12, _v1.y);
      _v1.normalize();
      sparkFan(pos, _v1, Math.round(20 + 18 * k), 12 + 8 * k,
        1.2, 0xffd09a, 0.55 + 0.2 * k, 0.045, 0.04, 0, 0.22);
      sparkFan(pos, _v2.copy(_v1).multiplyScalar(-1), Math.round(12 + 12 * k),
        8 + 6 * k, 1.5, 0xff9f55, 0.45, 0.035, 0.032, 0, 0.16);
      for (let i = 0; i < 10 + Math.round(8 * k); i++) {
        const a = rng() * Math.PI * 2;
        _debO.pos[0] = pos.x; _debO.pos[1] = pos.y + 0.28; _debO.pos[2] = pos.z;
        _debO.vel[0] = Math.cos(a) * (2.5 + rng() * 5.5) * k;
        _debO.vel[1] = 2.2 + rng() * 4.8;
        _debO.vel[2] = Math.sin(a) * (2.5 + rng() * 5.5) * k;
        _debO.life = 1.2 + rng() * 0.8;
        _debO.scale = 0.08 + rng() * 0.11;
        _debO.spin = 10 + rng() * 18;
        _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
        _debO.groundY = groundY(pos.x, pos.z);
        _debO.hot = false; _debO.seed = rng(); _debO.birthOffset = 0;
        particles.emit('debris', _debO);
      }
      for (let i = 0; i < 12; i++) {
        const a = rng() * Math.PI * 2;
        _puffO.pos[0] = pos.x + (rng() - 0.5) * 1.6;
        _puffO.pos[1] = pos.y + 0.12 + rng() * 0.35;
        _puffO.pos[2] = pos.z + (rng() - 0.5) * 1.6;
        _puffO.vel[0] = Math.cos(a) * (1.2 + rng() * 2.8) * k;
        _puffO.vel[1] = 0.8 + rng() * 1.5;
        _puffO.vel[2] = Math.sin(a) * (1.2 + rng() * 2.8) * k;
        _puffO.life = 0.8 + rng() * 0.8;
        _puffO.size0 = 0.45; _puffO.size1 = 2.0 + rng() * 1.4;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 1.5;
        col3(0x71695c, _puffO.col0); col3(0x4d4942, _puffO.col1);
        _puffO.alpha = 0.42; _puffO.grav = -0.25; _puffO.birthOffset = 0;
        particles.emit('dust', _puffO);
      }
      _sv.copy(pos); _sv.y += 0.45;
      flashLight(lightStates[1], _sv, EXPLOSION_LIGHT_PEAK * 0.08 * k, 0);
    },

    /**
     * Armor / terrain impact effect selected by HitEvent.kind.
     * @param {string} kind HitEvent.kind (§2.6)
     * @param {THREE.Vector3} pos impact point (world)
     * @param {THREE.Vector3} normal outward surface normal
     * @param {number} caliberMm shell caliber
     */
    impact(
      kind: string,
      pos: THREE.Vector3,
      normal: THREE.Vector3,
      caliberMm: number,
    ): void {
      // r5 combat-range readability: an aimed 340 m pen produced ZERO visible
      // impact through the scope — flash/spall/smoke sizes get the same
      // camera-distance compensation as destructions (sizes only, ~1x inside
      // 90 m up to ~1.9x at 300 m), so hits read down the sight line.
      const dk = distBoost(pos.x, pos.y, pos.z);
      const s = calScale(caliberMm) * dk;
      switch (kind) {
        case 'pen': {
          // layered penetration (r6: "a single small star sprite"):
          // flash core + directional spall cone off the plate normal +
          // wide secondary fan + dust/smoke ring + lingering crater glow
          hitFlash(pos, normal, s, 0xffffff, 0xffa030);
          // r7 WHITE-HOT PENETRATION CORE (critic: "no white-hot penetration
          // flash core" — the strike read as pale popcorn): a 2-3 frame
          // blinding pop pinned at the hole, 0.6-1 m, additive flash pool.
          _puffO.pos[0] = pos.x + normal.x * 0.14; _puffO.pos[1] = pos.y + normal.y * 0.14; _puffO.pos[2] = pos.z + normal.z * 0.14;
          _puffO.vel[0] = normal.x * 2.5; _puffO.vel[1] = normal.y * 2.5 + 0.5; _puffO.vel[2] = normal.z * 2.5;
          _puffO.life = 0.09;
          _puffO.size0 = 0.55 * s; _puffO.size1 = 1.05 * s;
          _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
          col3(0xffffff, _puffO.col0); col3(0xfff2d0, _puffO.col1);
          _puffO.alpha = 1.0; _puffO.grav = 0; _puffO.birthOffset = 0;
          particles.emit('flash', _puffO);
          // dust ring puffing out radially in the armor plane (before the
          // sparkFans — they clobber the shared _v1/_v2 basis)
          basisFrom(normal, _v1, _v2);
          // r7 DARK SPALL JET (critic: "no dark spall/armor-dust jet along
          // the incidence normal"): pulverized paint/armor dust blasting out
          // of the hole in a tight fast cone — the dark directional mass
          // that sells a penetration against the pale dust ring.
          for (let i = 0; i < 8; i++) {
            const a = rng() * Math.PI * 2;
            const tilt = rng() * 0.24;
            const st2 = Math.sin(tilt), ct2 = Math.cos(tilt);
            const jx = normal.x * ct2 + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * st2;
            const jy = normal.y * ct2 + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * st2;
            const jz = normal.z * ct2 + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * st2;
            const v = 10 + rng() * 9;
            _puffO.pos[0] = pos.x + normal.x * 0.15; _puffO.pos[1] = pos.y + normal.y * 0.15; _puffO.pos[2] = pos.z + normal.z * 0.15;
            _puffO.vel[0] = jx * v; _puffO.vel[1] = jy * v; _puffO.vel[2] = jz * v;
            _puffO.life = 0.45 + rng() * 0.4;
            _puffO.size0 = 0.20 * s; _puffO.size1 = (0.95 + rng() * 0.55) * s;
            _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 4;
            col3(0x38332d, _puffO.col0); col3(0x5c564d, _puffO.col1);
            _puffO.alpha = 0.8; _puffO.grav = -2.0; _puffO.birthOffset = -rng() * 0.03;
            particles.emit('smoke', _puffO);
          }
          // r7 directional debris cone: solid armor chips ejected along the
          // normal, gravity-arced (the critic's missing particulate mass)
          for (let i = 0; i < 5; i++) {
            const a = rng() * Math.PI * 2;
            const tilt = rng() * 0.45;
            const st2 = Math.sin(tilt), ct2 = Math.cos(tilt);
            _debO.pos[0] = pos.x; _debO.pos[1] = pos.y; _debO.pos[2] = pos.z;
            _debO.vel[0] = (normal.x * ct2 + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * st2) * (9 + rng() * 9);
            _debO.vel[1] = (normal.y * ct2 + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * st2) * (9 + rng() * 9) + 2.5;
            _debO.vel[2] = (normal.z * ct2 + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * st2) * (9 + rng() * 9);
            _debO.life = 1.3; _debO.scale = 0.05 + rng() * 0.06; _debO.spin = 14 + rng() * 18;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(pos.x, pos.z);
            _debO.hot = i < 2 ? 1 : 0.45; _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + rng() * 0.6;
            const rx = _v1.x * Math.cos(a) + _v2.x * Math.sin(a);
            const ry = _v1.y * Math.cos(a) + _v2.y * Math.sin(a);
            const rz = _v1.z * Math.cos(a) + _v2.z * Math.sin(a);
            _puffO.pos[0] = pos.x + rx * 0.3 + normal.x * 0.1;
            _puffO.pos[1] = pos.y + ry * 0.3 + normal.y * 0.1;
            _puffO.pos[2] = pos.z + rz * 0.3 + normal.z * 0.1;
            _puffO.vel[0] = rx * (3 + rng() * 2.5) + normal.x * 0.8;
            _puffO.vel[1] = ry * (3 + rng() * 2.5) + normal.y * 0.8 + 0.5;
            _puffO.vel[2] = rz * (3 + rng() * 2.5) + normal.z * 0.8;
            _puffO.life = 0.7 + rng() * 0.5;
            _puffO.size0 = 0.30 * s; _puffO.size1 = (1.2 + rng() * 0.6) * s;
            _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
            col3(0x8f8272, _puffO.col0); col3(0x6f675c, _puffO.col1);
            _puffO.alpha = 0.4; _puffO.grav = 0.3; _puffO.birthOffset = 0;
            particles.emit('dust', _puffO);
          }
          // brief incandescent crater glow pinned at the hole
          _puffO.pos[0] = pos.x + normal.x * 0.08; _puffO.pos[1] = pos.y + normal.y * 0.08; _puffO.pos[2] = pos.z + normal.z * 0.08;
          _puffO.vel[0] = 0; _puffO.vel[1] = 0; _puffO.vel[2] = 0;
          _puffO.life = 0.5;
          _puffO.size0 = 0.42 * s; _puffO.size1 = 0.30 * s;
          _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = 0;
          col3(0xffb050, _puffO.col0); col3(0xa2300a, _puffO.col1);
          _puffO.alpha = 0.85; _puffO.grav = 0; _puffO.birthOffset = 0;
          particles.emit('fire', _puffO);
          // tight bright spall cone + wide dimmer secondary fan (widths get
          // the distance boost too — a 0.03 m streak is sub-pixel at 340 m)
          sparkFan(pos, normal, 22, 26 * s, 0.45, 0xffd27e, 0.55, 0.032 * dk, 0.03, 0, 0.1);
          sparkFan(pos, normal, 14, 14 * s, 1.05, 0xffb860, 0.75, 0.024 * dk, 0.022, 0, 0.15);
          impactSmoke(pos, normal, 5, 1.1 * s, 0x2e2c2a, 0x5a5854, 0.65);
          break;
        }
        case 'he_pen':
          hitFlash(pos, normal, s * 1.3, 0xffffff, 0xff7018);
          heFireball(pos, caliberMm);
          sparkFan(pos, normal, 22, 18 * s, 1.1, 0xffc060, 0.8, 0.035, 0.028);
          break;
        case 'nonpen':
          sparkFan(pos, normal, 22, 20 * s, 0.9, 0xffd884, 0.55, 0.025 * dk, 0.022);
          impactSmoke(pos, normal, 4, 0.8 * s, 0x8a867e, 0xa7a49c, 0.45);
          break;
        case 'ricochet': {
          // elongated deflection streaks skimming along the plate
          basisFrom(normal, _v1, _v2);
          for (let i = 0; i < 8; i++) {
            const a = rng() * Math.PI * 2;
            const v = 30 + rng() * 25;
            _strkO.pos[0] = pos.x; _strkO.pos[1] = pos.y; _strkO.pos[2] = pos.z;
            _strkO.vel[0] = (normal.x * 0.35 + _v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * v;
            _strkO.vel[1] = (normal.y * 0.35 + _v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * v;
            _strkO.vel[2] = (normal.z * 0.35 + _v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * v;
            _strkO.life = 0.28 + rng() * 0.25;
            _strkO.width = 0.03 * dk; _strkO.stretch = 0.05; _strkO.grav = -21.6;
            col3(0xffe0a0, _strkO.col); _strkO.alpha = 1.0; _strkO.seed = rng(); _strkO.birthOffset = 0;
            particles.emit('sparks', _strkO);
          }
          sparkFan(pos, normal, 8, 12 * s, 1.1, 0xffcf80, 0.4, 0.02, 0.02);
          break;
        }
        case 'spaced_absorb':
          hitFlash(pos, normal, s * 0.7, 0xffe9b0, 0xff9040);
          sparkFan(pos, normal, 10, 12 * s, 1.0, 0xffce7a, 0.45, 0.022, 0.02);
          impactSmoke(pos, normal, 3, 0.7 * s, 0x77746e, 0x93908a, 0.4);
          break;
        case 'era': {
          // reactive tile pop: sharp directed blast + brick fragments
          hitFlash(pos, normal, s * 1.4, 0xffffff, 0xff6a10);
          sparkFan(pos, normal, 26, 24 * s, 0.8, 0xffc860, 0.6, 0.03, 0.026);
          impactSmoke(pos, normal, 6, 1.3 * s, 0x35322f, 0x605d58, 0.7);
          for (let i = 0; i < 4; i++) {
            _debO.pos[0] = pos.x; _debO.pos[1] = pos.y; _debO.pos[2] = pos.z;
            _debO.vel[0] = normal.x * (10 + rng() * 8) + (rng() - 0.5) * 6;
            _debO.vel[1] = normal.y * (10 + rng() * 8) + 4 + rng() * 4;
            _debO.vel[2] = normal.z * (10 + rng() * 8) + (rng() - 0.5) * 6;
            _debO.life = 1.8; _debO.scale = 0.12 + rng() * 0.08; _debO.spin = 10 + rng() * 15;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(pos.x, pos.z); _debO.hot = true; _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          break;
        }
        case 'he_splash':
          heFireball(pos, caliberMm);
          if (pos.y - groundY(pos.x, pos.z) < 2.5) dirtPlume(pos, caliberMm, true);
          break;
        case 'structure': {
          // World colliders are real shell targets. Give walls, buildings and
          // hard props a compact flash, chipped material and an outward dust
          // pulse so a stopped tracer can never read as having passed through.
          hitFlash(pos, normal, s * 0.65, 0xffedc7, 0xd59a55);
          sparkFan(pos, normal, 12, 13 * s, 0.85, 0xffcf83, 0.38, 0.022 * dk, 0.018);
          impactSmoke(pos, normal, 5, 0.72 * s, 0x777069, 0xa29a8e, 0.5);
          basisFrom(normal, _v1, _v2);
          for (let i = 0; i < 6; i++) {
            const a = rng() * Math.PI * 2;
            const side = 1.5 + rng() * 3;
            _debO.pos[0] = pos.x + normal.x * 0.04;
            _debO.pos[1] = pos.y + normal.y * 0.04;
            _debO.pos[2] = pos.z + normal.z * 0.04;
            _debO.vel[0] = normal.x * (3 + rng() * 5) + (_v1.x * Math.cos(a) + _v2.x * Math.sin(a)) * side;
            _debO.vel[1] = normal.y * (3 + rng() * 5) + (_v1.y * Math.cos(a) + _v2.y * Math.sin(a)) * side + 1.5;
            _debO.vel[2] = normal.z * (3 + rng() * 5) + (_v1.z * Math.cos(a) + _v2.z * Math.sin(a)) * side;
            _debO.life = 0.75 + rng() * 0.45;
            _debO.scale = 0.045 + rng() * 0.055;
            _debO.spin = 10 + rng() * 18;
            _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
            _debO.groundY = groundY(pos.x, pos.z); _debO.hot = false;
            _debO.seed = rng(); _debO.birthOffset = 0;
            particles.emit('debris', _debO);
          }
          break;
        }
        case 'terrain':
          dirtPlume(pos, caliberMm, caliberMm >= 105);
          break;
        default:
          sparkFan(pos, normal, 10, 12 * s, 1.0, 0xffd884, 0.5, 0.025, 0.022);
          break;
      }
    },

    /**
     * Stamp a persistent armor-scar decal directly onto a struck vehicle.
     *
     * This legacy entry point is reserved for non-event callers such as
     * Studio dressing and covered battle warmup. Live combat shell:hit marks
     * are owned exclusively by bindBus above, which preserves their exact
     * articulation-local frame and guarantees one mark per hit event.
     * @param {object} visual TankVisual (needs .root)
     * @param {THREE.Vector3} pos world impact point
     * @param {THREE.Vector3} normal outward surface normal (world)
     * @param {number} caliberMm scales the scar
     */
    armorScar(
      visual: FxVisual,
      pos: THREE.Vector3,
      normal: THREE.Vector3,
      caliberMm: number,
    ): void {
      if (!visual || !visual.root) return;
      impactDecals.stampDirect(visual, pos, normal, caliberMm, 'pen');
    },

    /** @returns {object} live impact-decal counters (probes/perf gates) */
    impactDecalStats() { return impactDecals.stats(); },

    /**
     * Clear one vehicle's impact decals; the per-battle warm
     * stamps a scar on every fielded visual so the decal program compiles
     * behind the loading screen (it re-links per battle otherwise), then
     * clears the warm marks with this before the battle opens.
     * @param {object} visual TankVisual
     */
    clearVehicleDecals(visual: FxDecalVisual): void { impactDecals.clearVehicle(visual); },

    /**
     * Vehicle destruction: fireball, debris, persistent smoke column; calls
     * visual.setDestroyed() at t ≈ 0.15 s when visual given (turret pop only
     * on ammo-rack kills).
     * @param {THREE.Vector3} pos hull center (world)
     * @param {object|null} visual TankVisual or null
     * @param {'ammorack'|'shot'|'fire'} [cause] kill cause (varies the show)
     */
    destruction(
      pos: THREE.Vector3,
      visual: FxVisual | null,
      cause: DestructionCause = 'ammorack',
    ): void {
      spawnDestruction(pos, visual, 0, cause);
    },

    /**
     * Track dust kicked up while driving. Call per frame per track; internally
     * probability-gated by intensity so callers need no rate limiting.
     * @param {THREE.Vector3} pos track contact point (world)
     * @param {THREE.Vector3} dir hull motion direction (unit-ish)
     * @param {number} intensity 0..1 from |speed| / topSpeed
     */
    dust(pos: THREE.Vector3, dir: THREE.Vector3, intensity: number): void {
      if (intensity <= 0.02) return;
      const waterMask = heightField?.getWaterMaskAt?.(pos.x, pos.z) ?? 0;
      if (waterMask > 0.02) {
        emitWetTrackDust(pos, dir, intensity, waterMask);
        return;
      }
      if (intensity > 0.08 && !frozen) stampTrackPrint(pos, dir);
      const groundType = heightField?.getGroundType?.(pos.x, pos.z) ?? 'medium';
      const surfaceMultiplier = drySurfaceMultiplier(groundType);
      if (rng() > intensity * 0.85 * surfaceMultiplier) return;
      const gy = groundY(pos.x, pos.z);
      updateDustCameraCaps(pos);
      updateDryDustColors(groundType);
      const sizeVariation = 0.6 + rng() * 0.8;
      const alphaVariation = 0.55 + rng() * 0.65;
      emitTrackKick(pos, dir, intensity, groundType, gy);
      emitDryTrackWake(
        pos, dir, intensity, groundType, gy, surfaceMultiplier, sizeVariation, alphaVariation,
      );
      if (groundType !== 'hard' && intensity > 0.28) {
        emitUpperTrackWake(pos, dir, intensity, gy);
      }
    },

    /**
     * Engine exhaust puff. Probability-gated like dust().
     * Default is the LIGHT profile (near-transparent warm grey, fast
     * dissipation) — correct for gas-turbine/modern powerpacks. Pass
     * sooty=true for WWII diesels to keep the darker puffing character
     * (r6: the Abrams dragged black soot blobs that hung against the sky).
     * @param {THREE.Vector3} pos exhaust stack tip (world)
     * @param {number} intensity 0..1 engine load
     * @param {boolean} [sooty=false] dark diesel puffs instead of thin haze
     */
    exhaust(pos: THREE.Vector3, intensity: number, sooty = false): void {
      // r1 "not a single exhaust puff anywhere": the old profile (alpha
      // 0.06-0.29, sub-meter cards, <1.2 s lives) was invisible from any
      // gameplay camera. Diesel puffs are now a clearly readable grey-brown
      // chug that shears downwind; turbines emit a visible warm haze plume
      // that thickens with throttle. Rates stay probability-gated.
      // r4 COLD-START BELCH: for ~2 s after battle start (the flyby window)
      // engines visibly light off — diesels cough a fat dark slug, turbines
      // whoosh a tall pale heat plume. Rate floor raised so the beat cannot
      // miss the sweep.
      const coldStart = battleFreshS < 2.2;
      if (coldStart && rng() < 0.35) {
        // r5 (critic: "cold-start belch is a single detached white cotton-
        // ball floating above the deck"): each belch event now emits a
        // 3-puff STREAM anchored at the louvres — small at the stack,
        // expanding as it climbs, births staggered so no frame ever catches
        // one orphaned blob with clear air under it.
        // r6 (flyby minor: "stray white exhaust wisp puff sitting ON the rear
        // deck"): belch puffs spawn CLEAR of the deck plate (+0.4 m and up)
        // with a faster initial rise, so no flyby frame catches a newborn
        // full-alpha card lying flat on the engine covers.
        for (let bi = 0; bi < 3; bi++) {
          _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.15;
          _puffO.pos[1] = pos.y + 0.4 + bi * 0.24;
          _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.15;
          _puffO.vel[0] = (rng() - 0.5) * 0.5 + COLUMN_WIND_X * 0.3;
          _puffO.vel[1] = 2.0 + rng() * 1.1;
          _puffO.vel[2] = (rng() - 0.5) * 0.5 + COLUMN_WIND_Z * 0.3;
          _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2.5;
          if (sooty) {
            _puffO.life = 1.5 + rng() * 0.7;
            _puffO.size0 = 0.22; _puffO.size1 = 2.2 + rng() * 0.8;
            col3(0x2e2b28, _puffO.col0); col3(0x5f5c58, _puffO.col1);
            _puffO.alpha = 0.46;
          } else {
            _puffO.life = 1.0 + rng() * 0.5;
            _puffO.size0 = 0.2; _puffO.size1 = 1.7 + rng() * 0.6;
            col3(0x8d8b86, _puffO.col0); col3(0x9a9894, _puffO.col1);
            _puffO.alpha = 0.24;
          }
          _puffO.grav = 0.6; _puffO.birthOffset = -bi * 0.09 - rng() * 0.05;
          particles.emit('smoke', _puffO);
        }
      }
      if (rng() > (coldStart ? 0.7 : 0.30 + intensity * 0.5)) return;
      _puffO.pos[0] = pos.x; _puffO.pos[1] = pos.y + 0.25; _puffO.pos[2] = pos.z; // r6: clear the deck
      _puffO.vel[0] = (rng() - 0.5) * 0.5 + COLUMN_WIND_X * 0.4;
      _puffO.vel[1] = 1.4 + rng() * 1.3 + intensity * 1.2;
      _puffO.vel[2] = (rng() - 0.5) * 0.5 + COLUMN_WIND_Z * 0.4;
      _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
      if (sooty) {
        // diesel: distinct dark puffs popping off the stacks, thinning as
        // they rise — readable at idle, a rolling chug under full throttle
        _puffO.life = 1.1 + rng() * 0.9;
        _puffO.size0 = 0.26 + intensity * 0.2;
        _puffO.size1 = 1.4 + intensity * 1.2;
        col3(0x3b3835, _puffO.col0); col3(0x6e6c68, _puffO.col1);
        _puffO.alpha = 0.30 + 0.22 * intensity;
      } else {
        // turbine: fast pale grey heat-haze jet off the deck vents
        _puffO.life = 0.7 + rng() * 0.6;
        _puffO.size0 = 0.22 + intensity * 0.18;
        _puffO.size1 = 1.1 + intensity * 0.9;
        col3(0x8d8b86, _puffO.col0); col3(0x9a9894, _puffO.col1);
        _puffO.alpha = 0.14 + 0.14 * intensity;
      }
      _puffO.grav = 0.5; _puffO.birthOffset = 0;
      particles.emit('smoke', _puffO);
    },

    /**
     * Small contact beat for persistent loose metal dressing. Unlike
     * propCrush this emits no wood splinters and does not imply destruction:
     * a few contact sparks plus curb dust sell the shove while the real mesh
     * continues rolling and can be hit again.
     */
    loosePropHit(pos: THREE.Vector3, dir: THREE.Vector3, heightM = 0.8): void {
      const gy = groundY(pos.x, pos.z);
      _v3.set(pos.x, gy + Math.min(0.48, heightM * 0.45), pos.z);
      sparkFan(_v3, _UP, 4, 4.5, 0.45, 0xffd2a0, 0.34, 0.018, 0.026, 0, 0.08);
      for (let i = 0; i < 4; i++) {
        const a = rng() * Math.PI * 2;
        _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.28;
        _puffO.pos[1] = gy + 0.10 + rng() * 0.18;
        _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.28;
        _puffO.vel[0] = Math.cos(a) * (0.5 + rng()) + dir.x * 0.8;
        _puffO.vel[1] = 0.35 + rng() * 0.6;
        _puffO.vel[2] = Math.sin(a) * (0.5 + rng()) + dir.z * 0.8;
        _puffO.life = 0.55 + rng() * 0.35;
        _puffO.size0 = 0.16 + rng() * 0.10; _puffO.size1 = 0.7 + rng() * 0.35;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x8d877c, _puffO.col0); col3(0x716c63, _puffO.col1);
        _puffO.alpha = 0.28 + rng() * 0.10; _puffO.grav = -0.4; _puffO.birthOffset = 0;
        particles.emit('dust', _puffO);
      }
    },

    /**
     * Crushable-prop impact (telephone pole / fence hit by a tank): dust
     * burst at the base, wood splinters whipped along the travel direction,
     * and a few bark chips. Called by the collision integration (see
     * docs/SYSTEMS.md — main.ts detects the overlap and
     * drives the prop's hinge-topple; this is the particle beat).
     * @param {THREE.Vector3} pos prop base (world)
     * @param {THREE.Vector3} dir tank travel direction (unit-ish, XZ)
     * @param {number} [heightM=6] prop height (scales the splinter throw)
     */
    propCrush(pos: THREE.Vector3, dir: THREE.Vector3, heightM = 6): void {
      const gy = groundY(pos.x, pos.z);
      // base dust burst
      for (let i = 0; i < 10; i++) {
        const a = rng() * Math.PI * 2;
        _puffO.pos[0] = pos.x + (rng() - 0.5) * 0.5;
        _puffO.pos[1] = gy + 0.3 + rng() * 0.4;
        _puffO.pos[2] = pos.z + (rng() - 0.5) * 0.5;
        _puffO.vel[0] = Math.cos(a) * (1.6 + rng() * 2.2) + dir.x * 2.5;
        _puffO.vel[1] = 1.0 + rng() * 1.4;
        _puffO.vel[2] = Math.sin(a) * (1.6 + rng() * 2.2) + dir.z * 2.5;
        _puffO.life = 1.4 + rng() * 1.0;
        _puffO.size0 = 0.5 + rng() * 0.3; _puffO.size1 = 2.2 + rng() * 1.2;
        _puffO.rot = rng() * Math.PI * 2; _puffO.rotVel = (rng() - 0.5) * 2;
        col3(0x8a8271, _puffO.col0); col3(0x776f60, _puffO.col1);
        _puffO.alpha = 0.42 + rng() * 0.15; _puffO.grav = -0.4; _puffO.birthOffset = 0;
        particles.emit('dust', _puffO);
      }
      // splinter chips thrown up the break line
      for (let i = 0; i < 8; i++) {
        _debO.pos[0] = pos.x; _debO.pos[1] = gy + 0.4 + rng() * Math.min(1.2, heightM * 0.2); _debO.pos[2] = pos.z;
        _debO.vel[0] = dir.x * (3 + rng() * 4) + (rng() - 0.5) * 4;
        _debO.vel[1] = 2.5 + rng() * 4;
        _debO.vel[2] = dir.z * (3 + rng() * 4) + (rng() - 0.5) * 4;
        _debO.life = 1.3; _debO.scale = 0.05 + rng() * 0.06; _debO.spin = 12 + rng() * 16;
        _debO.axis[0] = rng() - 0.5; _debO.axis[1] = rng() - 0.5; _debO.axis[2] = rng() - 0.5;
        _debO.groundY = gy; _debO.hot = 0; _debO.seed = rng(); _debO.birthOffset = 0;
        particles.emit('debris', _debO);
      }
    },

    /**
     * Destructible-prop break burst (world-dressing r1) — the KIND-flavored
     * beat layered on the break/topple moment: wood splinters for fences,
     * carts, crates and stalls; sprung staves for barrels; a slow straw puff
     * for hay; terracotta shards for pottery; a spark clang for metal. Rides
     * the same debris/dust particle language as propCrush/module hits.
     * Called through the src/world/destructibles.ts seam (props.ts caps the
     * rate — max ~6 flavored bursts per frame).
     * @param {string} kind destructible kind ('barrel', 'fenceplank', ...)
     * @param {THREE.Vector3} pos break point (world)
     * @param {THREE.Vector3} dir break direction (unit-ish, XZ)
     * @param {number} [heightM=1.2] prop height (scales throws)
     */
    propBreak(
      kind: string,
      pos: THREE.Vector3,
      dir: THREE.Vector3,
      heightM = 1.2,
    ): void {
      const gy = groundY(pos.x, pos.z);
      // DESTRUCTIBLES r1: dir now carries MAGNITUDE — 1 = shell-grade break,
      // a ramming hull scales it with its overrun speed (props.ts breakRecord)
      // so every throw velocity below inherits the tank's momentum.
      const family = propBreakFamily(kind);
      if (family === 'woodbuilding' || family === 'canvasbuilding' || family === 'metalbuilding') {
        emitBuildingBreak(family, pos, dir, heightM, gy);
        return;
      }
      if (family === 'masonry') {
        emitMasonryBreak(kind, pos, dir, heightM, gy);
        return;
      }
      if (family === 'sandbag') {
        emitSandbagBreak(pos, dir, gy);
        return;
      }
      if (family === 'vehicle') {
        emitVehicleBreak(pos, dir, heightM, gy);
        return;
      }
      if (family === 'canvas') {
        emitCanvasBreak(pos, dir, gy);
        return;
      }
      if (family === 'ammo') {
        emitAmmoBreak(pos, dir, gy);
        return;
      }
      if (family === 'drumblast') {
        emitDrumBlast(pos, gy);
        return;
      }
      if (family === 'hay') {
        emitHayBreak(pos, dir, heightM, gy);
        return;
      }
      if (family === 'metal') {
        emitMetalBreak(pos, dir, heightM, gy);
        return;
      }
      emitWoodBreak(family, pos, dir, heightM, gy);
    },

    /**
     * Freeze/unfreeze all fx (particle clock, timers, emitters, lights).
     *
     * r4 AGE-PRESERVING REBASE: when the pin moves the shared clock by more
     * than ~20 s (harness/probe pinning to a VIEW_TIME anchor like 500/900
     * from a live clock near 0), every live birth stamp, ring, light, decal
     * and trail is SHIFTED by the same delta so in-flight effects keep their
     * age instead of instantly expiring. Without this, any combat event that
     * landed before the pin (a kill staged a second before setFrozen) showed
     * up in stepped captures as a bare wreck with zero fx — the exact
     * "standard kill has no VFX" critical. Staged screenshot views are
     * unaffected: __SHOTS.set() calls resetAll() before pinning, so the
     * rebase operates on an empty system there.
     * @param {boolean} f
     * @param {number|null} [atTimeS] pin the shared clock to this time
     */
    setFrozen(f: boolean, atTimeS: number | null = null): void {
      if (atTimeS != null) rebaseFxClock(atTimeS);
      frozen = f;
      particles.setFrozen(f, atTimeS);
    },

    /**
     * Re-seed the deterministic effect RNG.
     * @param {number} newSeed
     */
    resetSeed(newSeed: number): void {
      rng = mulberry32(newSeed);
    },

    /** Kill all particles, tracers, decals, timers, emitters and lights. */
    resetAll() {
      replaySuppressed = false;
      particles.resetAll();
      lastTickS = particles.getTime();
      battleFreshS = 0; // fresh battle — arm the flyby exhaust start-up burst
      staticTracers.length = 0;
      trails.clear();
      guidedTrails.clear();
      tracerGeo.instanceCount = 0;
      liveAtgmCount = 0;
      atgmBodies.count = 0;
      atgmFlares.count = 0;
      renderedAtgmBodies = 0;
      renderedAtgmTrailSegments = 0;
      timers.length = 0;
      columns.length = 0;
      lastKnownPos.clear();
      shellKinds.clear();
      sweepTails.clear();
      for (const m of scorchMeshes) m.visible = false;
      scorchCursor = 0;
      printBirth.array.fill(-1e9);
      printSurface.array.fill(0);
      printBirth.needsUpdate = true;
      printSurface.needsUpdate = true;
      printCenters.fill(1e9);
      printCursor = 0;
      for (const r of shockRings) { r.bornAt = -1e9; r.mesh.visible = false; r.mat.opacity = 0; }
      shockCursor = 0;
      for (const r of muzzleRings) { r.bornAt = -1e9; r.mesh.visible = false; r.mat.opacity = 0; }
      muzzleRingCursor = 0;
      impactDecals.clearAll();
      for (const st of lightStates) { st.bornAt = -1e9; st.light.intensity = 0; }
    },

    /**
     * Deterministic screenshot composer: a firing moment frozen at ageS —
     * muzzle flash + smoke ring + tracer streak already down-range.
     * @param {{ muzzlePos: THREE.Vector3, dir: THREE.Vector3, caliberMm: number,
     *           tracerType: string, ageS: number }} o
     */
    composeFiringMoment({ muzzlePos, dir, caliberMm, tracerType, ageS }: FiringMoment): void {
      const preset = TRACER_PRESETS[tracerType] || TRACER_PRESETS.AP;
      const vel = COMPOSE_VELOCITY[tracerType] || 800;
      // NOTE (r5): the recipe samples gunMuzzleWorld AFTER advancing the
      // recoil, and the rendered barrel is equally recoiled — the anchor
      // always matches the visible tip, so the flash spawns exactly on it.
      // reach 0.55: the combat_firing camera has ~3.5 m of clear down-range
      // before the frame edge; the jet cone is compressed to sit inside it
      spawnMuzzleFlash(muzzlePos, dir, caliberMm, -ageS, 0.55);
      if (tracerType === 'APFSDS') spawnSabotPetals(muzzlePos, dir, -ageS);
      // shell position at ageS, tracer streak trailing back toward the muzzle.
      // Head capped at 2.2 m: clearly departed the barrel (a visible shot,
      // not an inert flash) yet still inside the combat_firing frame.
      // Width/brightness CUT HARD from r5 (2.2x/1.0 + a 3.0x/0.75 bridge):
      // those two fat additive ribbons out-shone the flash itself, so the
      // frame's brightest mass floated 1.5-3 m downrange of a bare barrel tip
      // (r6 critical). The tracer is now a slim bolt; the boosted core/jets
      // at the bore own the center-of-brightness.
      // lighting_post r5 (critic minor: contract tracer invisible in
      // combat_firing): at the 1.7 m cap the bolt was buried inside the
      // flash core; at 3.4 m it clearly separates downrange and stays
      // inside the frame.
      const headDist = Math.min(vel * ageS, 3.4);
      const len = Math.min(THREE.MathUtils.clamp(vel * 0.02, 2, 12), headDist - 0.55);
      _v1.copy(muzzlePos).addScaledVector(dir, headDist);
      _v2.copy(muzzlePos).addScaledVector(dir, Math.max(headDist - len, 0.3));
      col3(preset.core, _coreArr); col3(preset.glow, _glowArr);
      // ONE slim bolt (r7: the 1.3x/0.8 + 1.2x/0.32 pair read as multiple
      // simultaneous tracers from a single shot). The flash core owns the
      // frame's brightest pixels; the bolt just says "departed".
      staticTracers.push([
        _v2.x, _v2.y, _v2.z, _v1.x, _v1.y, _v1.z, preset.width * 1.05, 0.85,
        _coreArr[0], _coreArr[1], _coreArr[2], _glowArr[0], _glowArr[1], _glowArr[2],
        particles.getTime(), // bornAtS: stepped captures age the bolt honestly
      ]);
      // muzzle light state at ageS — still glowing at 50 ms (dur 120 ms).
      // r2 ON THE BORE at the tip (was muzzle - 0.9 m, +0.4 up): the pulled-
      // back overhead light pooled on the tube's TOP at mid-length and froze
      // in the 3x judged frame as a glowing lozenge between bore evacuator
      // and muzzle — "as if the barrel exploded midway" (r2 major). At the
      // tip the falloff still walks down the last meter of tube and kicks
      // onto the mantlet/hull front, but the hottest lit metal is the muzzle.
      _sv.copy(muzzlePos).addScaledVector(dir, -0.18);
      _sv.y += 0.10;
      flashLight(lightStates[0], _sv, MUZZLE_LIGHT_PEAK, ageS);
    },

    /**
     * Deterministic screenshot composer: a destruction frozen at ageS —
     * fireball + debris mid-flight + smoke column establishing.
     * @param {{ pos: THREE.Vector3, ageS: number }} o
     */
    composeExplosionMoment({ pos, ageS }: ExplosionMoment): void {
      if (!window.__FX_SKIP_DESTRUCTION) spawnDestruction(pos, null, -ageS);
      // pre-seed the smoke column puffs that would have been emitted by now
      const col = columns[columns.length - 1];
      if (col) {
        const ticks = Math.floor(ageS / COLUMN_TICK_S);
        for (let i = 0; i < ticks; i++) {
          // backdated births so the column reads as ageS old when frozen
          emitColumnPuff(col, -(ageS - (i + 1) * COLUMN_TICK_S));
        }
        col.ttl = SMOKE_COLUMN_S - ageS;
      }
      // light above the hull: terrain and wreck catch warm falloff without
      // the hull saturating to flat emissive orange
      flashLight(lightStates[1], _sv.set(pos.x, pos.y + 3.8, pos.z), EXPLOSION_LIGHT_PEAK, ageS);
    },
  };

  // world-dressing r1: hand the destructible-prop seam its particle provider —
  // props.ts emits (kind, pos, dir, h) whenever a small prop breaks/topples
  // and the kind-flavored burst renders through fx.propBreak above.
  {
    const _bkPos = new THREE.Vector3();
    const _bkDir = new THREE.Vector3();
    setBreakFxProvider((kind, x, y, z, dx, dz, h) => {
      if (frozen) return; // screenshot pins stay deterministic
      _bkPos.set(x, y, z);
      _bkDir.set(dx, 0, dz);
      fx.propBreak(kind, _bkPos, _bkDir, h);
    });
  }

  return fx;
}
