/**
 * projectileTracers.ts — rounds in flight as their tracers show them (atmospherics lane, 2026-10-08; the owner: "in the
 * new efects cn we get new tracers?").
 *
 * A tracer is a pyrotechnic charge in the base of the round (strontium burns red, barium green). What a camera or an
 * eye sees of it, and what this draws:
 *   - a small, very bright point (the burning compound) smeared along its flight by the exposure: a short streak whose
 *     length is speed x exposure (an APFSDS at 1,650 m/s draws ~27 m at 1/60 s, a machine-gun round ~14 m), as thin as
 *     a line on the screen whatever the range;
 *   - by day it is a faint orange-red spark against a bright scene; at sunset and night the camera opens up and the same
 *     light reads vivid, with a soft halo (the bloom catches its hot core): the scene's light model (lightModel.ts) sets
 *     the halo, the exposure does the rest;
 *   - machine guns and autocannons load a belt mix: only every 4th or 5th round is a tracer (the rest fly unseen), red
 *     in NATO ammunition and green in Soviet-lineage ammunition (keyed to the firing vehicle);
 *   - a tank round's tracer is in every round (APFSDS-T, HEAT-T, HE-T): a brighter, hotter orange-red point;
 *   - a round that skips off armour or the ground tumbles: its tracer flickers as it spins and wobbles off at its new
 *     angle (the simulation reflects the round; this draws the tumble);
 *   - the charge burns for a few seconds only, so a long shot goes dark before it lands.
 * (r2, the blind waves 310a/310b) The charge lights a few metres past the muzzle and the trace is a short dash behind
 * its hot point (a tank round's dart never a lit rod from the muzzle); by day the point is a warm red-orange, not a
 * white glare (the hot white core is the dark's); a round that strikes draws its last dash into the strike and throws a
 * brief spray of sparks there, a machine-gun round often skipping off on a ricochet.
 *
 * One instanced draw for every tracer (a capsule quad per round, built in screen space so its width is in pixels),
 * additive, depth-tested against the world in the late effects pass, no per-frame allocation (a pooled record per
 * round in flight, reused).
 * (lane ac130-fx-228, 2026-10-19; the owner: "make our ac 130 use our new tracers ... get rid of the old ones") the
 * AC-130's guns draw here too, each its own class (gunshipRounds.ts resolves the gun): the 30 mm autocannon a NATO belt
 * read from the orbit, the 152 mm howitzer a heavy traced shell whose burn outlasts its slant flight. The screenshot
 * composer's frozen round (composeFiringMoment) is a pooled static entry of the same draw, aged on the effects clock.
 */
import * as THREE from 'three';
import { LATE_FX_LAYER } from './layers.ts';
import { tankSeedId } from '../vehicles/tankIdAliases.ts';
import { gunshipRoundOf } from './gunshipRounds.ts';

type ShellKey = number | string;

/** The shell fields a tracer reads (the simulation's ShellEntity and the Studio's shells carry them). */
interface TracerShell {
  id: ShellKey;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  ageS?: number;
  distM?: number;
  dead?: boolean;
  shooterId?: ShellKey;
  /** times the round has been deflected (sim/damage.ts deflectShell) */
  bounces?: number;
  spec?: { type?: string; caliberMm?: number; tracer?: string; name?: string; reloadGroup?: string; soundProfile?: string;
    guided?: boolean } | null;
}

/** The firing vehicle, as the tracer's ammunition lineage (and, for a networked round, its weapon) needs it. */
interface TracerShooter {
  id?: string;
  nation?: string;
  gun?: { caliberMm?: number; shells?: readonly { type?: string }[] } | null;
}

interface TracerOptions {
  shooter(id: ShellKey | undefined): TracerShooter | null | undefined;
  /** the scene whose light model (userData.lightModel: night 0..1, exposure) sets the halo */
  scene?: THREE.Scene | null;
  /** the effects clock (s): flicker phase */
  now(): number;
  /** whether the firing vehicle flies the gunship (a networked round names no weapon: its aircraft does) */
  gunship?(id: ShellKey | undefined): boolean;
  /** (ac130-fx-228 r2) this frame's camera images heat (the gunship's infrared or thermal lens, a thermal sight): a
   *  tracer's burning charge is its hottest thing whatever the daylight, so the rounds draw at their night radiance */
  thermal?(): boolean;
  /** (ac130-barrels-230) a gunship round seen from its own lens (the camera at the orbit centre it left; `heavy` the
   *  howitzer's): its gun's muzzle beside the lens off the round's origin (world m, out x/y/z) and the range (m,
   *  out.rangeM) over which the drawn round joins its flight line; false when no gun is drawn there */
  lens?(heavy: boolean, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: LensRound): boolean;
  capacity?: number;
}
/** (ac130-barrels-230) a lens gun's muzzle off its round's origin (world m) and the range (m) the drawn round joins in */
export interface LensRound { x: number; y: number; z: number; rangeM: number }

/** A round's tracer class: how its belt is mixed, how long the charge burns, its width and its light. */
interface TracerClass {
  /** every Nth round of a belt carries a tracer (1: every round) */
  beltEvery: number;
  /** burn time (s): the tracer goes dark after this */
  burnS: number;
  /** the core's half width and the halo's radius at night, in 1080p pixels */
  halfWidthPx: number;
  haloPx: number;
  /** linear radiance of the core and of the halo's peak at night (by day the halo keeps HALO_DAY of it) */
  core: number;
  halo: number;
  /** the charge lights this far past the muzzle (m): nothing is drawn nearer the gun */
  igniteM: number;
  /** the streak's longest (m): a dash behind the hot point, never a lit rod */
  streakMaxM: number;
  /** a heavy shell's trace (a tank gun's, the gunship howitzer's): the deep orange compound, the hot bead, no ricochet,
   *  the heavier strike spray */
  heavy?: boolean;
  /** the bead's gain at the head */
  bead?: number;
  /** (ac130-fx-228 r2) the day core's radiance and width gains over the shared day law (default 1 and DAY_WIDTH_K): a
   *  round read from far off against a bright sky needs more than a ground gun's */
  dayK?: number;
  dayWidthK?: number;
  /** (ac130-fx-228 r2) its own day colour over its lineage's (the gunship's cannon: read from the ground against the sky) */
  dayRgb?: readonly number[];
  /** (ac130-fx-228 r3) seen from a camera at its own muzzle (the gunship's lens), it lights this far out (m) */
  lensClearM?: number;
}

// Classes by calibre: rifle and heavy machine guns, autocannons, tank guns.
const MG_NATO: TracerClass = { beltEvery: 5, burnS: 2.8, halfWidthPx: 0.85, haloPx: 5.5, core: 2.4, halo: 0.16,
  igniteM: 4, streakMaxM: 24 };
const MG_EAST: TracerClass = { ...MG_NATO, beltEvery: 4 };
const AUTOCANNON: TracerClass = { beltEvery: 4, burnS: 3.4, halfWidthPx: 1.05, haloPx: 6.5, core: 2.8, halo: 0.18,
  igniteM: 6, streakMaxM: 24 };
// (r2, wave 310b: "a long rod anchored to the muzzle") a tank round's trace: a short dash behind the dart's hot point
const TANK: TracerClass = { beltEvery: 1, burnS: 3.6, halfWidthPx: 1.35, haloPx: 8, core: 3.4, halo: 0.2,
  igniteM: 10, streakMaxM: 12, heavy: true, bead: 2.4 };
// (ac130-fx-228) the gunship's guns, read from a 240 m orbit through a 55-9 degree gimbal: the 30 mm autocannon's belt
// a little denser and its core a little wider than a ground autocannon's (every second round traced: at 7 rounds a
// second the burst still reads as a stream of dashes, not single sparks), always NATO ammunition whatever tank the
// pilot chose; the 152 mm howitzer every round traced, its core and halo about 1.7x a tank round's, its streak the
// exposure's (800 m/s: ~13 m by day, ~22 m in the dark), its charge burning past the 0.3-0.5 s slant flight
// (r2, the motion critic: "by day, from the ground, thin pale-pink lines that nearly vanish against bright sky"; "in
// daylight IR 1-2 px dots") by day its core burns over twice the shared day share and widens to about double, so the
// strontium reads as a hot orange-red dash on sky and in the thermal lens
// (r2b, the round's own film from the ground: "pale pink" on a blue sky) its day colour carries more of the strontium's
// orange, so the additive dash reads hot orange-red against sky and cloud, not a pink line
const GUNSHIP_CANNON_DAY: readonly number[] = [1.0, 0.38, 0.08];
const GUNSHIP_CANNON: TracerClass = { beltEvery: 2, burnS: 3.4, halfWidthPx: 1.5, haloPx: 9, core: 3.4, halo: 0.24,
  igniteM: 6, streakMaxM: 24, dayK: 2.3, dayWidthK: 1.0, dayRgb: GUNSHIP_CANNON_DAY, lensClearM: 45 };
const GUNSHIP_HOWITZER: TracerClass = { beltEvery: 1, burnS: 6, halfWidthPx: 2.3, haloPx: 14, core: 5.6, halo: 0.34,
  igniteM: 8, streakMaxM: 24, heavy: true, bead: 2.8, lensClearM: 45 };
/** (ac130-fx-228 r3) a camera within this of a round's muzzle is that gun's own lens */
const LENS_EYE_M = 12;
/** (ac130-barrels-230) a round drawn from its lens gun lights this far out of the muzzle (m): seen from beside the gun its
 *  class's ignite distance (6-8 m) is a third of its way to the screen's centre, so it would still start mid-air */
const LENS_IGNITE_M = 0.4;
/** (ac130-barrels-230) its first LENS_LINE_M also draw the frame's whole record from the muzzle to the round as an even
 *  line (LENS_LINE_K of its radiance, dimming as it flies on): the tapered dash alone reads only near the screen's centre,
 *  because seen from beside the gun its nearest metres fill most of its length on the screen */
const LENS_LINE_M = 48, LENS_LINE_K = 0.75;
/** (ac130-fx-228) the screenshot composer's frozen rounds held at once (pooled; the oldest reused past it) */
const STATIC_CAPACITY = 8;
/** (ac130-fx-228 r3) a distant backdrop round's radiance by day, as a share of its night radiance */
const AMBIENT_DAY_K = 0.35;
/** the halo's share by day (a bright scene: the spark alone reads; r2: enough of it to tint the point) */
const HALO_DAY = 0.5;
/** (r2, wave 310a: "by day a pale pinprick or a white orb, no warm colour") by day the core burns at this share of its
 *  night radiance, in its saturated day colour (the tone curve bleaches a brighter point to white), a little wider */
const DAY_CORE_K = 0.45, DAY_WIDTH_K = 0.4;
/** exposure (s) the streak is smeared over: a day camera's 1/60 s, opening to 1/36 s in the dark */
const EXPOSURE_DAY_S = 1 / 60, EXPOSURE_NIGHT_S = 1 / 36;
/** the streak never reaches back past the muzzle, nor longer than this (m) */
const STREAK_MAX_M = 42;
/** a burnt-out tracer dims over this long (s), flickering */
const BURNOUT_S = 0.14;

// Colours (linear): the core is the hot compound (whitish through the tone curve), the halo its saturated light.
// (fx 8, the critics after atmos r2: "neon-green T-90M") as cameras record them: strontium burns an orange-red with a
// pink-white heart; the Soviet-lineage barium compound a pale yellow-green (the T-46 trace on film), never a neon
// emerald; a tank round's trace a deep orange
const RED_CORE: readonly number[] = [1.0, 0.48, 0.22], RED_HALO: readonly number[] = [1.0, 0.16, 0.05];
const GREEN_CORE: readonly number[] = [0.78, 1.0, 0.5], GREEN_HALO: readonly number[] = [0.42, 0.85, 0.2];
const TANK_CORE: readonly number[] = [1.0, 0.6, 0.3], TANK_HALO: readonly number[] = [1.0, 0.27, 0.07];
// the day cores: the compound's own colour, saturated (strontium red-orange, barium yellow-green, a tank tracer's orange)
const RED_DAY: readonly number[] = [1.0, 0.22, 0.05], GREEN_DAY: readonly number[] = [0.6, 1.0, 0.24];
const TANK_DAY: readonly number[] = [1.0, 0.3, 0.07];
// the strike's sparks: (fx 8, "dull cream sparks"; wave 334b: "pure-white puffy blobs that hang for several frames and
// outshine the tracers by day") small hot grains, yellow-orange in the dark and a saturated orange by day, gone in a frame
// or two
const SPARK_CORE: readonly number[] = [1.0, 0.62, 0.24];
const SPARK_DAY: readonly number[] = [1.0, 0.38, 0.08];
const SPARK_HALO: readonly number[] = [1.0, 0.32, 0.06];
/** sparks in flight at once (a pooled record each; the oldest is reused past it) */
const SPARK_CAPACITY = 96;

/** Soviet-lineage ammunition (green tracers): these nations' own vehicles, and the Soviet-design hulls others field. */
const EAST_NATIONS = new Set(['Russia', 'USSR', 'USSR/Russia', 'RU', 'China', 'CN', 'North Korea', 'DPRK', 'Belarus', 'Iran', 'Syria']);
const SOVIET_DESIGN = /(^|_)(t34|t54|t55|t62|t64|t72|t80|t84|t90|pt91|oplot|bmp|btr|bmd|zubr|hetman|twardy|rys|jaguar)/;
const MIXED_NATIONS = new Set(['Ukraine', 'UA', 'Poland', 'PL']);

/** Green (Soviet lineage) or red (NATO and everyone else) for a vehicle's machine guns and autocannons. */
export function tracerLineage(shooter: TracerShooter | null | undefined): 'east' | 'nato' {
  const nation = shooter?.nation ?? '';
  if (EAST_NATIONS.has(nation)) return 'east';
  // SOVIET_DESIGN reads the schema-1 id vocabulary (tankIdAliases.ts): a rename never changes a tracer's colour.
  if (MIXED_NATIONS.has(nation) && SOVIET_DESIGN.test(tankSeedId(String(shooter?.id ?? '')))) return 'east';
  return 'nato';
}

/** The class a round's tracer takes: by calibre (machine gun < 15 mm, autocannon < 45 mm, tank gun). */
export function tracerClassFor(caliberMm: number, lineage: 'east' | 'nato'): TracerClass {
  if (caliberMm < 15) return lineage === 'east' ? MG_EAST : MG_NATO;
  if (caliberMm < 45) return AUTOCANNON;
  return TANK;
}

interface RoundClass { cls: TracerClass; lineage: 'east' | 'nato'; caliberMm: number }

/** (ac130-fx-228) A round's class and lineage: the gunship's guns their own (NATO ammunition, whatever the pilot's
 *  garage tank), every other round by its calibre and its vehicle's lineage. (r2) Written into `out` (the runtime's
 *  scratch: a new round allocates nothing). */
export function tracerRoundClass(spec: TracerShell['spec'], shooter: TracerShooter | null | undefined,
  shooterIsGunship: boolean, out: RoundClass = { cls: TANK, lineage: 'nato', caliberMm: 0 }): RoundClass {
  const gun = gunshipRoundOf(spec, shooterIsGunship);
  if (gun === 'cannon') { out.cls = GUNSHIP_CANNON; out.lineage = 'nato'; out.caliberMm = 30; return out; }
  if (gun === 'howitzer') { out.cls = GUNSHIP_HOWITZER; out.lineage = 'nato'; out.caliberMm = 152; return out; }
  out.lineage = tracerLineage(shooter);
  out.caliberMm = tracerCaliber(spec, shooter);
  out.cls = tracerClassFor(out.caliberMm, out.lineage);
  return out;
}

/**
 * A round's calibre: its own when it carries one (the solo battle's and the Studio's shells), else (a networked round:
 * the wire sends its type, not its calibre) the firing vehicle's main gun when that gun fires this type, and a roof
 * machine gun's for an AP round the main gun does not fire.
 */
export function tracerCaliber(spec: TracerShell['spec'], shooter: TracerShooter | null | undefined): number {
  const own = spec?.caliberMm;
  if (typeof own === 'number' && Number.isFinite(own) && own > 0) return own;
  const type = spec?.type ?? '';
  const gun = shooter?.gun;
  const main = gun?.caliberMm;
  if (typeof main === 'number' && Number.isFinite(main) && main > 0) {
    if (type !== 'AP' || (gun?.shells ?? []).some((s) => s?.type === 'AP')) return main;
    return 12.7;
  }
  return type === 'AP' ? 12.7 : 100;
}

/** Whether the nth round (0-based) a gun fires carries a tracer: the first of each beltEvery. */
export function beltCarriesTracer(roundIndex: number, beltEvery: number): boolean {
  return beltEvery <= 1 || roundIndex % beltEvery === 0;
}

interface RoundRecord {
  id: ShellKey;
  lit: boolean;
  cls: TracerClass;
  core: readonly number[];
  day: readonly number[];
  halo: readonly number[];
  seed: number;
  seen: boolean;
  /** last frame's head and streak tail (drawn once more after the round ends, so a short life still shows) */
  hx: number; hy: number; hz: number; tx: number; ty: number; tz: number; k: number;
  /** last frame's speed (m/s) */
  speed: number;
  /** (ac130-barrels-230) seen from its own lens: 0 not yet asked, 1 no gun drawn there, 2 drawn from its muzzle (lx, ly,
   *  lz off its origin, joining its line by lr metres) */
  lens: 0 | 1 | 2; lx: number; ly: number; lz: number; lr: number;
}

/** A spark (or a ricochet) thrown off a strike: a short streak on a ballistic arc, dying out. */
interface Spark {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  /** effects clock at birth (s), its life (s), core radiance, half width (1080p px) */
  t0: number; life: number; k: number; w: number;
  day: readonly number[];
  core: readonly number[];
  halo: readonly number[];
  /** a ricochet: a lit round skipping off (its tracer's colour and halo, the exposure's smear) */
  ricochet: boolean;
}

const VERT = /* glsl */ `
attribute vec4 aHead;   // head xyz (the round), core half width (1080p px)
attribute vec4 aTail;   // tail xyz (the smear's start), halo radius (1080p px)
attribute vec4 aCore;   // core rgb x radiance, bead gain
attribute vec4 aHalo;   // halo rgb x radiance, the scene's dark level (0 day .. 1 night)
uniform vec2 uViewport;
uniform vec2 uNearFade;
varying vec2 vLocal;
varying float vLen;
varying vec4 vCore;
varying vec3 vHalo;
varying float vHalfW;
varying float vHaloR;
varying float vDark;
#ifdef USE_FOG
  varying float vFogDepth;
#endif
void main() {
  vDark = aHalo.w;
  vec4 vh = viewMatrix * vec4( aHead.xyz, 1.0 );
  vec4 vt = viewMatrix * vec4( aTail.xyz, 1.0 );
  // the part of the streak in front of the near plane (a round leaving the lens is cut, not flipped)
  float zc = -0.6;
  if ( ( vh.z > zc && vt.z > zc ) || aCore.x + aCore.y + aCore.z <= 0.0 ) {
    vLocal = vec2( 0.0 ); vLen = 0.0; vCore = vec4( 0.0 ); vHalo = vec3( 0.0 ); vHalfW = 0.0; vHaloR = 0.0;
    gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
    #ifdef USE_FOG
      vFogDepth = 1.0;
    #endif
    return;
  }
  if ( vh.z > zc ) vh = mix( vt, vh, ( zc - vt.z ) / ( vh.z - vt.z ) );
  if ( vt.z > zc ) vt = mix( vh, vt, ( zc - vh.z ) / ( vt.z - vh.z ) );
  vec4 ch = projectionMatrix * vh;
  vec4 ct = projectionMatrix * vt;
  vec2 ph = ch.xy / ch.w * 0.5 * uViewport;
  vec2 pt = ct.xy / ct.w * 0.5 * uViewport;
  vec2 d = ph - pt;
  float len = length( d );
  vec2 dir = len > 1e-3 ? d / len : vec2( 1.0, 0.0 );
  vec2 nrm = vec2( -dir.y, dir.x );
  float pxScale = uViewport.y / 1080.0;
  float halfW = max( aHead.w * pxScale, 0.6 );
  float haloR = aTail.w * pxScale;
  float r = max( halfW * 2.5, haloR * 2.2 ) + 1.0;
  float along = position.x;
  float ext = along * 2.0 - 1.0;
  vec2 p = mix( pt, ph, along ) + dir * ext * r + nrm * position.y * r;
  vLocal = vec2( along * len + ext * r, position.y * r );
  vLen = len;
  vHalfW = halfW;
  vHaloR = haloR;
  // a round right at the lens fades (an own shot leaving the scope)
  float dist = length( mix( vt.xyz, vh.xyz, along ) );
  float near = smoothstep( uNearFade.x, uNearFade.y, dist );
  vCore = vec4( aCore.rgb * near, aCore.w );
  vHalo = aHalo.rgb * near;
  // every corner at w = 1: the quad is flat on the screen, so its pixel distances interpolate exactly, and its depth
  // (linear in screen space along a projected segment) still tests against the world
  float z = mix( ct.z / ct.w, ch.z / ch.w, along );
  gl_Position = vec4( p / ( 0.5 * uViewport ), z, 1.0 );
  #ifdef USE_FOG
    vFogDepth = -mix( vt.z, vh.z, along );
  #endif
}
`;

const FRAG = /* glsl */ `
varying vec2 vLocal;
varying float vLen;
varying vec4 vCore;
varying vec3 vHalo;
varying float vHalfW;
varying float vHaloR;
varying float vDark;
#ifdef USE_FOG
  uniform vec3 fogColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  varying float vFogDepth;
#endif
void main() {
  // distance (px) to the streak, and along it from its tail (0) to the round (1)
  float dx = max( 0.0, max( -vLocal.x, vLocal.x - vLen ) );
  float d = length( vec2( dx, vLocal.y ) );
  float t = vLen > 0.5 ? clamp( vLocal.x / vLen, 0.0, 1.0 ) : 1.0;
  // (fx 8, the critics after atmos r2: "even-width white-cored rods with no hot head and fading tail") the burning
  // compound is a point at the head; the smear behind it is the exposure's record of that point, and a real trace on
  // film is brightest and widest where the round is and thins and dims back along its tail (the charge flickers and
  // the eye and the sensor keep less of where it was): radiance and width both taper from the head to the tail
  // (fx 8b2, wave 334b: "B turns the APFSDS tracer into a soft white glowing ball that creeps a few pixels per frame";
  // "day and sunset tracers are still bars of even thickness") the taper and the hot head scale with the streak's
  // length ON SCREEN: a long streak tapers hard from a wider head (the eye reads the point and its fading record); a
  // streak foreshortened to a few pixels (a dart flying away downrange) stays an even warm dash, its head no brighter
  // than its trace — never a ball. The head whitens only in the dark (by day the compound's own colour reads)
  // (fx 9a) a negative bead gain marks an untapered line: a missile's command wire
  float lenK = vCore.a < 0.0 ? 0.0 : smoothstep( 4.0, 28.0, vLen );
  float tailK = mix( 1.0, 0.06 + 0.94 * t * t, lenK );
  float hw = vHalfW * mix( 1.0, 0.3 + 0.9 * t, lenK );
  float core = 1.0 - smoothstep( max( hw - 0.7, 0.0 ), hw + 0.7, d );
  // the round itself: the brightest point, at the head
  float dh = length( vec2( vLocal.x - vLen, vLocal.y ) );
  float bead = exp( -dh * dh / max( vHalfW * vHalfW * ( 2.0 + 2.0 * lenK ), 0.6 ) ) * ( 0.25 + 0.75 * lenK );
  float beadK = max( vCore.a, 0.0 );
  float hr = vHaloR * mix( 1.0, 0.55 + 0.45 * t, lenK );
  float halo = exp( -d * d / max( hr * hr, 0.25 ) ) * ( 0.2 + 0.8 * tailK );
  float peak = max( vCore.r, max( vCore.g, vCore.b ) );
  vec3 hot = mix( vCore.rgb, vec3( peak ), ( 0.08 + 0.37 * vDark ) * lenK );
  vec3 col = vCore.rgb * core * tailK + hot * bead * beadK + vHalo * halo;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( -fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    // a bright point carries through haze far better than the scene behind it: dimmed, never fogged out
    col *= 1.0 - 0.6 * fogFactor;
  #endif
  if ( max( col.r, max( col.g, col.b ) ) < 0.002 ) discard;
  gl_FragColor = vec4( min( col, vec3( 64.0 ) ), 1.0 );
}
`;

interface ProjectileTracers {
  readonly mesh: THREE.Mesh;
  /** start a frame's write; (ac130-fx-228 r3) `eye` is this frame's camera (world m), for the gunship's lens clearance */
  begin(eye?: { x: number; y: number; z: number } | null): void;
  /** one round in flight this frame (non-guided, non-aerial): its tracer when it carries one */
  write(shell: TracerShell): void;
  /** close the frame: rounds not seen draw their last streak once more, then go */
  end(): void;
  /** (fx 9a) a raw capsule this frame (call between begin and end): a missile's motor and its plume (head the motor, tail
   *  the plume's end), core and halo radiance as given by day and night; a negative bead draws an untapered line (a
   *  command wire) */
  glow(hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, halfWidthPx: number, haloPx: number,
    core: readonly number[], coreK: number, halo: readonly number[], haloK: number, bead: number): void;
  /** the scene's dark level this frame (0 day .. 1 night), for callers that scale their own capsules */
  darkLevel(): number;
  /** a round struck at `pos` (its terrain, prop or armour hit): its last dash reaches into the strike and, when its
   *  tracer still burns, the strike throws sparks (none off water) */
  strike(id: ShellKey | undefined, pos: readonly number[], water?: boolean): void;
  /** (ac130-fx-228) a frozen round for the screenshot composer (composeFiringMoment): its tracer from tail to head as a
   *  round of `caliberMm` draws it, born at `bornAtS` on the effects clock (full for 0.3 s, gone by 0.9 s); a rocket's
   *  is its motor's hot streak */
  compose(hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, caliberMm: number, bornAtS: number,
    rocket?: boolean): void;
  /** the effects clock was rebased by `delta` s (fx.setFrozen / resetClock): the births keep their age */
  shiftTime(delta: number): void;
  /** (ac130-fx-228 r2) a round that is not a shell this frame (the frontline backdrop's AA fire: world/destructibles.ts
   *  setAmbientRoundSource), drawn as an autocannon round of its lineage is: its head, unit direction, speed (m/s),
   *  distance flown (m), strength (0..1, its own burn-out); call between begin and end */
  ambient(hx: number, hy: number, hz: number, dx: number, dy: number, dz: number, speedMps: number, travelledM: number,
    k: number, east: boolean): void;
  reset(): void;
  active(): boolean;
  /** receipts: tracer rounds drawn this frame, rounds tracked */
  stats(): { drawn: number; tracked: number; dark: number; sparks: number; statics: number };
}

export function createProjectileTracers(o: TracerOptions): ProjectileTracers {
  const _roundClass: RoundClass = { cls: TANK, lineage: 'nato', caliberMm: 0 }; // tracerRoundClass's scratch
  const capacity = Math.max(16, o.capacity ?? 512);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const head = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const tail = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const core = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const halo = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const attrs = [head, tail, core, halo];
  for (const a of attrs) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aHead', head);
  geo.setAttribute('aTail', tail);
  geo.setAttribute('aCore', core);
  geo.setAttribute('aHalo', halo);
  geo.instanceCount = 0;
  const uViewport = { value: new THREE.Vector2(1920, 1080) };
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      uViewport, uNearFade: { value: new THREE.Vector2(1.5, 5.0) },
    }),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'Projectile tracers';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 24.5;
  mesh.layers.set(LATE_FX_LAYER);
  mesh.visible = false;
  // the pixel widths need the target the late pass draws into (the composer's internal resolution)
  const _vp = new THREE.Vector4();
  mesh.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(_vp);
    if (_vp.z > 0 && _vp.w > 0) uViewport.value.set(_vp.z, _vp.w);
  };
  // the callback reads the viewport alone: the late pass may draw it through its view (engine/lateFxSceneView.ts)
  mesh.userData.lateFxSceneAgnostic = true;

  const records = new Map<ShellKey, RoundRecord>();
  const free: RoundRecord[] = [];
  const beltCount = new Map<number, number>();
  let n = 0;
  let dark = 0;
  /** (ac130-fx-228 r3) this frame's camera, when the caller gave it */
  let eyeX = 0, eyeY = 0, eyeZ = 0, eyeSet = false;
  const lensOut: LensRound = { x: 0, y: 0, z: 0, rangeM: 1 };
  let drawnLast = 0;

  function lightLevel(): number {
    const model = (o.scene?.userData?.lightModel ?? null) as { night?: number; exposure?: number } | null;
    const night = Number.isFinite(model?.night) ? (model!.night as number) : 0;
    const exposure = Number.isFinite(model?.exposure) ? (model!.exposure as number) : 1.5;
    // the night's dome, or a camera opened past the day key (a low sun, an overcast deck)
    return Math.min(1, Math.max(0, night, (exposure - 1.7) / 1.3));
  }

  function record(shell: TracerShell): RoundRecord {
    let r = records.get(shell.id);
    if (r) return r;
    r = free.pop() ?? { id: 0, lit: false, cls: TANK, core: TANK_CORE, day: TANK_DAY, halo: TANK_HALO, seed: 0,
      seen: false, hx: 0, hy: 0, hz: 0, tx: 0, ty: 0, tz: 0, k: 0, speed: 0, lens: 0, lx: 0, ly: 0, lz: 0, lr: 1 };
    const who = o.shooter(shell.shooterId);
    const { cls, lineage, caliberMm: cal } = tracerRoundClass(shell.spec, who, o.gunship?.(shell.shooterId) === true, _roundClass);
    // the belt: a per-weapon round count (the shooter's gun of this calibre: a coax and a main gun are two belts), so a
    // burst shows its tracers at the belt's own rhythm
    const who_ = shell.shooterId;
    const key = (typeof who_ === 'number' ? who_ : who_ == null ? -1 : hashKey(String(who_))) * 1024 + Math.round(cal);
    const index = beltCount.get(key) ?? 0;
    beltCount.set(key, index + 1);
    if (beltCount.size > 256) beltCount.clear();
    r.id = shell.id;
    r.cls = cls;
    r.lit = beltCarriesTracer(index, cls.beltEvery);
    if (cls.heavy) { r.core = TANK_CORE; r.day = TANK_DAY; r.halo = TANK_HALO; }
    else if (lineage === 'east') { r.core = GREEN_CORE; r.day = GREEN_DAY; r.halo = GREEN_HALO; }
    else { r.core = RED_CORE; r.day = RED_DAY; r.halo = RED_HALO; }
    if (cls.dayRgb) r.day = cls.dayRgb;
    const h = typeof shell.id === 'number' ? shell.id : hashKey(shell.id);
    r.seed = ((Math.imul(h | 0, 0x9e3779b1) >>> 0) % 10007) / 10007;
    r.seen = false;
    r.k = 0;
    r.lens = 0;
    records.set(shell.id, r);
    return r;
  }

  function put(r: RoundRecord, k: number, wobble: number): void {
    if (!(k > 0.001)) return;
    const cls = r.cls;
    write4(r.hx, r.hy, r.hz, r.tx, r.ty, r.tz, cls.halfWidthPx * (1 + (cls.dayWidthK ?? DAY_WIDTH_K) * (1 - dark)) * (1 + 0.3 * wobble),
      cls.haloPx * (0.45 + 0.55 * dark), r.day, r.core, cls.core * k, r.halo, cls.halo * (HALO_DAY + (1 - HALO_DAY) * dark) * k,
      cls.bead ?? 1.8, cls.dayK ?? 1);
  }
  /** One capsule: head and tail (m), half width and halo radius (1080p px), the core (its day colour by day, its hot
   *  night colour in the dark) at radiance coreK, the halo at haloK, the head's bead gain. */
  function write4(hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, halfW: number, haloR: number,
    dayRgb: readonly number[], nightRgb: readonly number[], coreK: number, haloRgb: readonly number[], haloK: number,
    bead: number, dayK = 1): void {
    if (n >= capacity) return;
    const i = n * 4;
    const kd = coreK * DAY_CORE_K * dayK * (1 - dark), kn = coreK * dark;
    head.array[i] = hx; head.array[i + 1] = hy; head.array[i + 2] = hz; head.array[i + 3] = halfW;
    tail.array[i] = tx; tail.array[i + 1] = ty; tail.array[i + 2] = tz; tail.array[i + 3] = haloR;
    core.array[i] = dayRgb[0]! * kd + nightRgb[0]! * kn;
    core.array[i + 1] = dayRgb[1]! * kd + nightRgb[1]! * kn;
    core.array[i + 2] = dayRgb[2]! * kd + nightRgb[2]! * kn;
    core.array[i + 3] = bead;
    halo.array[i] = haloRgb[0]! * haloK; halo.array[i + 1] = haloRgb[1]! * haloK; halo.array[i + 2] = haloRgb[2]! * haloK;
    halo.array[i + 3] = dark;
    n++;
  }

  // ---- the strike's sparks and ricochets (r2): a fixed pool, each spark a short streak on its arc ----
  const sparks: Spark[] = Array.from({ length: SPARK_CAPACITY }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    t0: 0, life: 0, k: 0, w: 0, day: SPARK_CORE, core: SPARK_CORE, halo: RED_HALO, ricochet: false }));
  let sparkCursor = 0, sparksLive = 0;
  /** a deterministic stream for one strike (the round's seed): no Math.random in what a replay redraws */
  function strikeRandom(seed: number): () => number {
    let a = (Math.imul((seed * 10007) | 0, 0x9e3779b1) ^ 0x5bd1e995) | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, k: number, w: number,
    dayRgb: readonly number[], coreRgb: readonly number[], haloRgb: readonly number[], ricochet: boolean): void {
    const s = sparks[sparkCursor]!;
    sparkCursor = (sparkCursor + 1) % SPARK_CAPACITY;
    s.x = x; s.y = y; s.z = z; s.vx = vx; s.vy = vy; s.vz = vz;
    s.t0 = o.now(); s.life = life; s.k = k; s.w = w; s.day = dayRgb; s.core = coreRgb; s.halo = haloRgb;
    s.ricochet = ricochet;
  }
  /** The strike's spray: a few grains thrown up and back off the surface, and (a machine-gun or autocannon round, more
   *  often than not) the round itself skipping off on a ricochet, its tracer still burning. */
  function strikeSpray(r: RoundRecord, x: number, y: number, z: number): void {
    const R = strikeRandom(r.seed + 0.37);
    const len = Math.hypot(r.hx - r.tx, r.hy - r.ty, r.hz - r.tz) || 1;
    const dx = (r.hx - r.tx) / len, dy = (r.hy - r.ty) / len, dz = (r.hz - r.tz) / len;
    const tank = r.cls.heavy === true;
    if (!tank && R() < 0.6) {
      // the ricochet: on along the ground's plane, kicked up 8-30 degrees, swung up to 25 degrees off the line, a third
      // to a half of its speed
      const yaw = (R() - 0.5) * 0.87, up = 0.14 + R() * 0.38, v = r.speed * (0.32 + R() * 0.18);
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      let hx = dx * c - dz * sn, hz = dx * sn + dz * c;
      const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      spark(x, y + 0.05, z, hx * v * Math.cos(up), Math.abs(dy) * 0.2 * v + v * Math.sin(up), hz * v * Math.cos(up),
        0.25 + R() * 0.2, r.cls.core * 0.75, r.cls.halfWidthPx, r.day, r.core, r.halo, true);
    }
    // (wave 334b) a few small fast grains, gone in a frame or two (the dart vanishes into a brief spark)
    const grains = tank ? 7 : 3;
    for (let g = 0; g < grains; g++) {
      const a = R() * Math.PI * 2, up = 0.35 + R() * 0.55, v = (tank ? 30 : 16) + R() * (tank ? 40 : 24);
      // thrown back up out of the strike, leaning the way the round came in
      const ex = Math.cos(a) * (1 - up) * v - dx * v * 0.25, ez = Math.sin(a) * (1 - up) * v - dz * v * 0.25;
      spark(x, y + 0.04, z, ex, up * v, ez, (tank ? 0.04 : 0.03) + R() * (tank ? 0.05 : 0.035), tank ? 4.2 : 3.2, 0.55,
        SPARK_DAY, SPARK_CORE, SPARK_HALO, false);
    }
  }
  /** Draw the live sparks (each a streak of the exposure behind it, fading). */
  function drawSparks(): void {
    const t = o.now();
    const exposureS = EXPOSURE_DAY_S + (EXPOSURE_NIGHT_S - EXPOSURE_DAY_S) * dark;
    sparksLive = 0;
    for (const s of sparks) {
      if (!(s.life > 0)) continue;
      const a = t - s.t0;
      if (a < 0 || a > s.life) { if (a > s.life) s.life = 0; continue; }
      sparksLive++;
      const g = 9.81;
      const hx = s.x + s.vx * a, hy = s.y + s.vy * a - 0.5 * g * a * a, hz = s.z + s.vz * a;
      // the smear: the exposure's worth of its path behind it, never back past its birth
      const back = Math.min(exposureS, a + 1 / 240);
      const tx = hx - s.vx * back, ty = hy - (s.vy - g * a) * back, tz = hz - s.vz * back;
      const u = a / s.life;
      // a grain dies fast and twinkles; a ricochet's tracer burns on, tumbling, and dims as it flies off
      const k = s.ricochet ? s.k * (1 - u) * (0.55 + 0.45 * Math.abs(Math.sin(a * 37 + s.x)))
        : s.k * (1 - u) * (1 - u) * (0.6 + 0.4 * Math.abs(Math.sin(a * 90 + s.x)));
      if (s.ricochet) {
        write4(hx, hy, hz, tx, ty, tz, s.w * (1 + DAY_WIDTH_K * (1 - dark)), 5.5 * (0.45 + 0.55 * dark), s.day, s.core, k,
          s.halo, 0.16 * (HALO_DAY + (1 - HALO_DAY) * dark) * (1 - u), 1.1);
      } else {
        write4(hx, hy, hz, tx, ty, tz, s.w, 2.0 * (0.5 + 0.5 * dark), s.day, s.core, k, s.halo,
          0.05 * (0.4 + 0.6 * dark) * (1 - u), 0.5);
      }
    }
  }

  // ---- (ac130-fx-228) the composer's frozen rounds: a fixed pool, each drawn as its class's tracer, fading on the clock ----
  const statics = Array.from({ length: STATIC_CAPACITY }, () => ({ hx: 0, hy: 0, hz: 0, tx: 0, ty: 0, tz: 0, born: 0,
    live: false, cls: TANK }));
  let staticCursor = 0, staticsLive = 0;
  function drawStatics(): void {
    const t = o.now();
    staticsLive = 0;
    for (const s of statics) {
      if (!s.live) continue;
      const age = t - s.born;
      // stepped captures age the round honestly: full for 0.3 s, gone by 0.9 s (the old ribbon's composer timing)
      const u = Math.min(1, Math.max(0, (age - 0.3) / 0.6));
      const fade = 1 - u * u * (3 - 2 * u);
      if (fade <= 0.001) { if (age > 0.9) s.live = false; continue; }
      staticsLive++;
      const cls = s.cls, heavy = cls.heavy === true;
      write4(s.hx, s.hy, s.hz, s.tx, s.ty, s.tz, cls.halfWidthPx * (1 + DAY_WIDTH_K * (1 - dark)),
        cls.haloPx * (0.45 + 0.55 * dark), heavy ? TANK_DAY : RED_DAY, heavy ? TANK_CORE : RED_CORE, cls.core * fade,
        heavy ? TANK_HALO : RED_HALO, cls.halo * (HALO_DAY + (1 - HALO_DAY) * dark) * fade, cls.bead ?? 1.8);
    }
  }

  // hoisted Map callbacks: the per-frame walks allocate nothing
  const unsee = (r: RoundRecord): void => { r.seen = false; };
  const release = (r: RoundRecord): void => { r.k = 0; free.push(r); };
  const retire = (r: RoundRecord, id: ShellKey): void => {
    if (r.seen) return;
    // its last dash once more (moved into its strike when one was reported), then the record is reused
    if (r.lit && r.k > 0) put(r, r.k * 0.8, 0);
    records.delete(id);
    release(r);
  };

  return {
    mesh,
    begin(eye) {
      n = 0;
      eyeSet = !!eye;
      if (eye) { eyeX = eye.x; eyeY = eye.y; eyeZ = eye.z; }
      // (ac130-fx-228 r2, the motion critic: in the default daylight infrared lens "the 30 mm rounds and impacts show as
      // 1-2 px dots") a heat-imaging camera sees the burning compound as the night does: hot cores, halos, sparks
      dark = o.thermal?.() === true ? 1 : lightLevel();
      records.forEach(unsee);
    },
    write(shell) {
      if (shell.dead) return;
      const r = record(shell);
      r.seen = true;
      if (!r.lit) return;
      const v = shell.vel;
      const speed = Math.hypot(v.x, v.y, v.z);
      const age = Number.isFinite(shell.ageS) ? (shell.ageS as number) : (shell.distM ?? 0) / Math.max(speed, 1);
      // burnt out: dark for the rest of its flight (a short flickering dim first)
      const over = age - r.cls.burnS;
      if (over >= BURNOUT_S) { r.k = 0; return; }
      const t = o.now();
      let k = 1;
      if (over > 0) k = (1 - over / BURNOUT_S) * (0.55 + 0.45 * Math.sin(t * 61 + r.seed * 40));
      // a tumbling round (deflected): its tracer flickers as it spins and its smear wanders off the line of flight
      const tumbling = (shell.bounces ?? 0) > 0;
      let wobble = 0;
      if (tumbling) {
        const spin = Math.abs(Math.sin(t * 37 + r.seed * 29)) * 0.75 + 0.25 * Math.abs(Math.sin(t * 13.3 + r.seed * 7));
        k *= 0.35 + 0.65 * spin;
        wobble = Math.sin(t * 23 + r.seed * 11);
      }
      const exposureS = EXPOSURE_DAY_S + (EXPOSURE_NIGHT_S - EXPOSURE_DAY_S) * dark;
      // (r2) the charge lights a little past the muzzle: dark before, and the smear never reaches back past that point
      let flown = Number.isFinite(shell.distM) ? (shell.distM as number) : Infinity;
      let ignite = r.cls.igniteM;
      // (ac130-fx-228 r3, the blind critic: from the gimbal lens a 30 mm round read as "a thin needle", "more ribbon than
      // tracer") a gunship round seen from the camera at its own muzzle (its lens rides at the orbit centre the round
      // leaves): it flies almost down the line of sight, so its first metres smear across the lens; it draws once it is
      // LENS_CLEAR_M out, a dash converging on the aim point. Any other camera sees it light at its gun as before
      // (ac130-barrels-230, the owner: the tracers "should look like theyre cominng from behindd the camerA") seen from
      // its lens the round leaves its gun's muzzle beside the lens (o.lens) and its drawn line runs straight from there to
      // where it is aimed, lit at the muzzle (LENS_IGNITE_M); only with no gun drawn there does it light lensClearM out
      if (r.cls.lensClearM && speed > 1e-3 && (r.lens === 2 || eyeSet)) {
        // a networked round carries its age, not its distance: its flight so far is its age at its speed
        const f = Number.isFinite(flown) ? flown / speed : age;
        if (Number.isFinite(f)) {
          const sx = shell.pos.x - v.x * f, sy = shell.pos.y - v.y * f, sz = shell.pos.z - v.z * f;
          const ox = sx - eyeX, oy = sy - eyeY, oz = sz - eyeZ;
          if (r.lens === 2 || ox * ox + oy * oy + oz * oz < LENS_EYE_M * LENS_EYE_M) {
            flown = f * speed;
            if (r.lens === 0) {
              const drawn = o.lens?.(r.cls.heavy === true, sx, sy, sz, v.x / speed, v.y / speed, v.z / speed, lensOut) === true;
              r.lens = drawn ? 2 : 1;
              if (drawn) { r.lx = lensOut.x; r.ly = lensOut.y; r.lz = lensOut.z; r.lr = Math.max(1, lensOut.rangeM); }
            }
            ignite = r.lens === 2 ? Math.min(ignite, LENS_IGNITE_M) : Math.max(ignite, r.cls.lensClearM);
          }
        }
      }
      const alight = flown - ignite;
      if (!(alight > 0)) { r.k = 0; return; }
      const len = Math.min(STREAK_MAX_M, r.cls.streakMaxM, speed * exposureS, Math.max(0.05, alight));
      const inv = speed > 1e-3 ? len / speed : 0;
      r.hx = shell.pos.x; r.hy = shell.pos.y; r.hz = shell.pos.z;
      r.tx = shell.pos.x - v.x * inv; r.ty = shell.pos.y - v.y * inv; r.tz = shell.pos.z - v.z * inv;
      if (r.lens === 2) {
        // the muzzle's offset left at each end: whole at the muzzle, none where the round is aimed (a straight line)
        const kh = Math.max(0, 1 - flown / r.lr), kt = Math.max(0, 1 - (flown - len) / r.lr);
        r.hx += r.lx * kh; r.hy += r.ly * kh; r.hz += r.lz * kh;
        r.tx += r.lx * kt; r.ty += r.ly * kt; r.tz += r.lz * kt;
      }
      if (tumbling) {
        // the smear swings off the flight line by up to ~12 degrees as the round tumbles
        const sw = 0.2 * len * wobble;
        r.tx += -v.z / Math.max(speed, 1e-3) * sw; r.tz += v.x / Math.max(speed, 1e-3) * sw; r.ty += 0.12 * len * Math.cos(t * 19 + r.seed * 5);
      }
      r.k = k;
      r.speed = speed;
      put(r, k, tumbling ? wobble : 0);
      if (r.lens === 2 && flown < LENS_LINE_M) {
        // the drawn point at the ignite distance (on the line from the muzzle) to the round, untapered (a negative bead)
        const back = (flown - ignite) / speed, ki = Math.max(0, 1 - ignite / r.lr), kl = k * LENS_LINE_K * (1 - flown / LENS_LINE_M);
        const cls = r.cls;
        write4(r.hx, r.hy, r.hz, shell.pos.x - v.x * back + r.lx * ki, shell.pos.y - v.y * back + r.ly * ki,
          shell.pos.z - v.z * back + r.lz * ki, cls.halfWidthPx * (1 + (cls.dayWidthK ?? DAY_WIDTH_K) * (1 - dark)),
          cls.haloPx * (0.45 + 0.55 * dark), r.day, r.core, cls.core * kl, r.halo, cls.halo * (HALO_DAY + (1 - HALO_DAY) * dark) * kl,
          -1, cls.dayK ?? 1);
      }
    },
    strike(id, pos, water = false) {
      if (id == null) return;
      const r = records.get(id);
      if (!r || !r.lit || !(r.k > 0)) return;
      const x = pos[0] ?? r.hx, y = pos[1] ?? r.hy, z = pos[2] ?? r.hz;
      if (!Number.isFinite(x + y + z)) return;
      // the last dash, moved along its line to end in the strike (not left short of it: wave 310b's "the dart and its
      // trail disagree")
      const ox = x - r.hx, oy = y - r.hy, oz = z - r.hz;
      r.hx = x; r.hy = y; r.hz = z; r.tx += ox; r.ty += oy; r.tz += oz;
      if (!water) strikeSpray(r, x, y, z);
    },
    end() {
      // a round that ended since the last frame draws its last streak once more (a fast round born and gone between
      // two frames still leaves its line), then its record is reused
      records.forEach(retire);
      drawStatics();
      drawSparks();
      geo.instanceCount = n;
      mesh.visible = n > 0;
      if (n > 0 || drawnLast > 0) for (const a of attrs) a.needsUpdate = true;
      drawnLast = n;
    },
    reset() {
      records.forEach(release);
      records.clear();
      beltCount.clear();
      for (const sp of sparks) sp.life = 0;
      sparkCursor = 0; sparksLive = 0;
      for (const st of statics) st.live = false;
      staticCursor = 0; staticsLive = 0;
      n = 0; drawnLast = 0;
      geo.instanceCount = 0;
      mesh.visible = false;
    },
    glow(hx, hy, hz, tx, ty, tz, halfWidthPx, haloPx, coreRgb, coreK, haloRgb, haloK, bead) {
      if (n >= capacity) return;
      const i = n * 4;
      head.array[i] = hx; head.array[i + 1] = hy; head.array[i + 2] = hz; head.array[i + 3] = halfWidthPx;
      tail.array[i] = tx; tail.array[i + 1] = ty; tail.array[i + 2] = tz; tail.array[i + 3] = haloPx;
      core.array[i] = coreRgb[0]! * coreK; core.array[i + 1] = coreRgb[1]! * coreK; core.array[i + 2] = coreRgb[2]! * coreK;
      core.array[i + 3] = bead;
      halo.array[i] = haloRgb[0]! * haloK; halo.array[i + 1] = haloRgb[1]! * haloK; halo.array[i + 2] = haloRgb[2]! * haloK;
      halo.array[i + 3] = dark;
      n++;
    },
    compose(hx, hy, hz, tx, ty, tz, caliberMm, bornAtS, rocket = false) {
      const s = statics[staticCursor]!;
      staticCursor = (staticCursor + 1) % STATIC_CAPACITY;
      s.hx = hx; s.hy = hy; s.hz = hz; s.tx = tx; s.ty = ty; s.tz = tz; s.born = bornAtS; s.live = true;
      // a tank gun's dart (every round traced), an autocannon's lit round, a rocket's motor streak (the heavy class)
      s.cls = rocket ? GUNSHIP_HOWITZER : caliberMm >= 45 ? TANK : AUTOCANNON;
      staticsLive++;
    },
    shiftTime(delta) {
      if (!Number.isFinite(delta) || delta === 0) return;
      for (const st of statics) if (st.live) st.born += delta;
      for (const sp of sparks) if (sp.life > 0) sp.t0 += delta;
    },
    ambient(hx, hy, hz, dx, dy, dz, speedMps, travelledM, k, east) {
      // (ac130-fx-228 r3, the blind critic: the backdrop's AA rounds read "like confetti" over a day sky) the front's guns
      // fire 0.4-0.9 km off: by day their trace is a faint point at that range, at night the streams the camera opens to
      k *= AMBIENT_DAY_K + (1 - AMBIENT_DAY_K) * dark;
      if (!(k > 0.001)) return;
      const cls = AUTOCANNON;
      const alight = travelledM - cls.igniteM;
      if (!(alight > 0)) return;
      const exposureS = EXPOSURE_DAY_S + (EXPOSURE_NIGHT_S - EXPOSURE_DAY_S) * dark;
      const len = Math.min(STREAK_MAX_M, cls.streakMaxM, speedMps * exposureS, alight);
      write4(hx, hy, hz, hx - dx * len, hy - dy * len, hz - dz * len, cls.halfWidthPx * (1 + DAY_WIDTH_K * (1 - dark)),
        cls.haloPx * (0.45 + 0.55 * dark), east ? GREEN_DAY : RED_DAY, east ? GREEN_CORE : RED_CORE, cls.core * k,
        east ? GREEN_HALO : RED_HALO, cls.halo * (HALO_DAY + (1 - HALO_DAY) * dark) * k, 1.8);
    },
    darkLevel: () => dark,
    active: () => geo.instanceCount > 0 || sparksLive > 0 || staticsLive > 0,
    stats: () => ({ drawn: geo.instanceCount, tracked: records.size, dark, sparks: sparksLive, statics: staticsLive }),
  };
}

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}
