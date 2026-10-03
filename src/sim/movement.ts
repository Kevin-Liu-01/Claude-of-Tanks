import { movementDispersionFactor } from './movementDispersion.ts';
import { minimumMechanicalGunPitch } from './gunPitchLimits.ts';
import type { GunPitchByYawCurve } from './gunPitchLimits.ts';
import { usesLauncherMuzzles, type LauncherMuzzle } from './launcherPolicy.ts';
/**
 * movement.ts — pure-logic tank movement, attitude, turret/gun kinematics and
 * dispersion bloom. Implements docs/history/research/movement-physics.md §2–§8 and §10
 * under the interface locked in docs/ARCHITECTURE.md §3.4.
 *
 * Conventions (ARCHITECTURE §1.1): meters / seconds / radians, +Y up,
 * forwardAxis(yaw) = [sin(yaw), 0, cos(yaw)], rightAxis(yaw) = [cos(yaw), 0, -sin(yaw)],
 * yaw = 0 faces +Z, positive pitch = nose up.
 * ROLL SIGN (locked by the renderer): every consumer composes the pose as
 * rotation.set(-visualPitch, yaw, visualRoll, 'YXZ') (tankFactory syncFromState,
 * armor buildFrames, damage.ts, killcam) — under that composition POSITIVE roll
 * lifts the RIGHT side (worldY of a hull-local point = pos.y
 * + x·sin(roll)·cos(pitch) + z·sin(pitch)). The r5 terrain-contact gate traced
 * one track buried ~1 m while the other floated at rest to the old fit using
 * the opposite ("right side down") sign: the hull leaned INTO every side slope.
 *
 * No rendering, no DOM, no top-level side effects — runs under plain node.
 */

import { Euler, Quaternion, Vector3 } from 'three';
import { HULL_STEP_UP_M } from '../world/collision.ts';
import { CLIFF_GRADE,
  DRIVE_ACCEL_PER_HPT as K_ACCEL,
  GRAVITY_MPS2 as GRAVITY,
  TERRAIN_MARGIN_EPS,
  driveGroundTypeAt,
  trackGripMargin,
  trackSlideCoefficient,
  uphillDriveMargin,
} from './terrainMobility.ts';
import type { TerrainMobilitySpec } from './terrainMobility.ts';
import { STANDARD_PHYSICS, type RulesetPhysics } from './matchRuleset.ts';
import { tankContactRect } from './tankContactShape.ts';

type Vec3Tuple = readonly [number, number, number];
type HeightSampler = (x: number, z: number) => number;

export interface MovementGunSpec {
  shells?: readonly {name?: string; guided?: boolean; launcherTubes?: number}[];
  fixedLaunchCanisters?: boolean;
  launcherMuzzles?: readonly LauncherMuzzle[];
  aimTimeS: number;
  baseAccuracy: number;
  caliberMm: number;
  reloadS: number;
  bloom: {
    move: number;
    hullRot: number;
    turret: number;
    afterShot: number;
  };
}

export interface MovementArmorSpec {
  turretless?: boolean;
  boundingRadiusM?: number;
  turretPivot?: Vec3Tuple | number[];
  gunPivot?: Vec3Tuple | number[];
  gunBarrel?: { lengthM: number };
  bodyContactPoints?: {
    hull?: number[];
    turret?: number[];
  };
}

export interface MovementSpec extends TerrainMobilitySpec {
  dims: {
    hullLengthM: number;
    widthM: number;
    heightM: number;
  };
  gun: MovementGunSpec;
  armor?: MovementArmorSpec;
  enginePowerHp: number;
  weightTons: number;
  terrainResistance: Readonly<Record<string, number>> & {
    hard: number;
    medium: number;
  };
  topSpeedKmh: number;
  reverseSpeedKmh: number;
  hullTraverseDegS: number;
  turretTraverseDegS: number;
  gunPitchDegS: number;
  gunDepressionDeg: number;
  gunPitchByYawDeg?: GunPitchByYawCurve;
  gunElevationDeg: number;
  gunArcDeg?: number;
  pivotStyle?: 'neutral' | 'pivot' | string;
  role?: string;
  hydropneumaticAim?: {
    noseDownDeg?: number;
    noseUpDeg?: number;
    rateDegS?: number;
    compressionM?: number;
  };
}

interface MovementModuleState {
  state?: string;
}

export interface MovementCombatState {
  destroyed?: boolean;
  modules?: Record<string, MovementModuleState | undefined>;
  crew?: Record<string, boolean | undefined>;
  equipMults?: {
    traverse?: number;
    turret?: number;
    aimTime?: number;
    bloom?: number;
  };
}

interface MovementDebuffs {
  immobile: boolean;
  /** Destroyed hull: no drive, no brakes — locked tracks skid to rest, airborne momentum is kept. */
  wreck: boolean;
  powerMult: number;
  accelMult: number;
  traverseMult: number;
  turretMult: number;
  aimTimeMult: number;
  gunYellow: boolean;
  bloomMult: number;
}

interface AttitudeSpringState {
  pitch: number;
  roll: number;
  pitchV: number;
  rollV: number;
  recoilVX: number;
  recoilVZ: number;
}

interface RockState {
  p: number;
  r: number;
  pv: number;
  rv: number;
}

/** The suspension rock, and the share of its pitch that is weight transfer (`d`, the dive or squat, with its rate). */
interface SuspensionRockState extends RockState {
  d: number;
  dv: number;
}

interface RideState {
  y: number;
  v: number;
  supportY: number;
  groundV: number;
  grounded: boolean;
  airTime: number;
  /** Rebounds since the hull last left the ground (telemetry for the bounce receipts and probes). */
  bounces: number;
  /** The rebound a landing's springs owe the hull, returned as they extend (m/s over the ground's rate; 0: none). */
  rebound: number;
  /** 1 while the springs absorb a landing on the tracks (the landing stroke: compression and the return to the seat), at
   * the landing damping; 0 otherwise. */
  stroke: number;
}

interface RigidBodyState {
  tumbling: boolean;
  landingBlendS: number;
  dynamicSupport: boolean;
  autoRighting: boolean;
  /** Set by the tank contact pass (tankBodyContacts.ts) while the hull rests on another hull's roof: the root height
   * the ride stands at, its ground for the next step (NaN otherwise). */
  restSupportY: number;
}

export interface MovementContactGeometry {
  halfLenM: number;
  halfWidM: number;
  zCenterM: number;
  bottomYM?: number | null;
  panYM?: number | null;
  gearBottomYM?: number | null;
  endRise?: {
    dzM: number;
    frontM: number;
    rearM: number;
  } | null;
}

interface SupportCache {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  y: number;
  floorY: number;
  rigid: boolean;
  cg: MovementContactGeometry | null | undefined;
}

interface GunLaySolution {
  horizontalDistance: number;
  worldPitch: number;
  turretYaw: number;
  gunPitch: number;
}

interface SupportSamples {
  halfLength: number;
  centerZ: number;
  lineCount: number;
  step: number;
  cosYaw: number;
  sinYaw: number;
  cosNegPitch: number;
  sinNegPitch: number;
  cosRoll: number;
  sinRoll: number;
  sinPitch: number;
  cosPitch: number;
  fitSinPitch: number;
  fitCosPitch: number;
  fitSinRoll: number;
  fitCosRoll: number;
  worldX: number;
  worldZ: number;
  zHalf: number;
  sumHeightZ: number;
  sumZZ: number;
  sumLeft: number;
  sumRight: number;
  sideCount: number;
  outerMax: number;
  /** Hull-local x and z of the outer-line sample that sets outerMax (the contact the support rests on). */
  outerX: number;
  outerZ: number;
  settleDeficitSum: number;
  deficitCount: number;
  deepestZ: number;
  settleOuterMax: number;
  frontMax: number;
  frontZ: number;
  rearMax: number;
  rearZ: number;
  fanMax: number;
  bellyMax: number;
  panY: number | null;
  /** Outer-line samples recorded for the contact-aware fit (_fitZ/_fitX/_fitH/_fitD). */
  fitCount: number;
  /** Innermost |x| of a loaded wheel-run fan sample per side (Infinity when that side's fan lines all hang). */
  fanTouchLeftX: number;
  fanTouchRightX: number;
}

interface DriveStep {
  grounded: boolean;
  throttle: number;
  steer: number;
  braking: boolean;
  ground: string;
  resistance: number;
  hardResistance: number;
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
  terrainPitch: number;
  topSpeed: number;
  reverseSpeed: number;
  speedMultiplier: number;
  gravityScale: number;
  /** Ruleset landing rebound (matchRuleset.ts physics.restitution / bounceMinMps). */
  restitution: number;
  bounceMin: number;
  bounceMaxHeight: number;
  airAngularDrag: number;
  airAngularSpeedMax: number;
  /** The face under the tracks is steeper than they hold: no drive, no brake, the hull slides. */
  gripLost: boolean;
  traverseMax: number;
  gunArc: number;
  acceleration: number;
  baseRate: number;
  brakeCap: number;
  brakeRate: number;
  speedLimit: number;
  targetSpeed: number;
  rate: number;
  spoolTarget: number;
}

export interface TankState {
  modeScale?: number;
  /** Independent roof station pose, shared by firing and its damage volume. */
  roofGunYaw?: number;
  roofGunPitch?: number;
  pos: Vector3;
  yaw: number;
  speed: number;
  verticalSpeed: number;
  grounded: boolean;
  landingImpactMps: number;
  slopeBlocked: boolean;
  yawRate: number;
  visualPitch: number;
  visualRoll: number;
  overturned: boolean;
  rolloverCountdownS: number;
  turretYaw: number;
  gunPitch: number;
  turretYawRate: number;
  aimPoint: Vector3;
  bloomF: number;
  trackScroll: { l: number; r: number };
  atGunLimit: boolean;
  gunLimitSpec: boolean;
  suspensionAim: boolean;
  suspensionAimPitch: number;
  impactMps: number;
  /** What absorbed impactMps this tick: IMPACT_SOURCE_NONE / _CLIFF (the terrain wall probe) / _COLLIDER (the
   * integration's pushback — the integration knows whether that was a hard obstacle or another hull). */
  impactSource: number;
  /** Unit world-XZ direction the blocking contact pushed the hull (zero when nothing pushed). */
  impactNx: number;
  impactNz: number;
  _spring: AttitudeSpringState;
  _prevSpeed: number;
  _spool: number;
  /** Terrain plane fit: pitch/roll drive the attitude spring (pitch includes the two-point settle); fitPitch is the
   * pure least-squares slope the next tick's settle residuals are measured against. tipPitch/tipRoll (rad/s²) are the
   * gravity torque of a centre of mass that overhangs the loaded contacts (physics lane, 2026-10-03; 0 when supported). */
  _terr: { pitch: number; roll: number; fitPitch: number; tipPitch: number; tipRoll: number };
  _fanYield: number;
  _perch: number;
  _gunLimitHoldS: number;
  _autoTraverse: number;
  _swayEst: number;
  _susp: SuspensionRockState;
  _flinch: RockState;
  _ride: RideState;
  _body: RigidBodyState;
  _rollover: { elapsedS: number; expired: boolean };
  _groundType: string;
  _debuff: MovementDebuffs;
  _sup: SupportCache;
}

export interface MovementInput {
  auxiliaryBits?: number;
  throttle?: number;
  steer?: number;
  brake?: boolean;
  aimPoint?: Vector3 | null;
  /** Hold the current articulated turret/gun/hydraulic lay while sight aim moves. */
  aimLocked?: boolean;
}

export interface MovementEntity {
  spec: MovementSpec;
  state: TankState;
  input: MovementInput;
  combat?: MovementCombatState | null;
  contactGeom?: MovementContactGeometry | null;
  modeSpeedMultiplier?: number;
  /** Ruleset gravity scale (sim/matchRuleset.ts): airborne hulls and the slope pull scale by it. */
  modeGravityScale?: number;
  /** Ruleset impact physics (sim/matchRuleset.ts): the landing rebound; absent = the whole-game block. */
  modePhysics?: RulesetPhysics | null;
  rigidGear?: boolean;
}

export interface MovementHeightField {
  getHeightAt: HeightSampler;
  getHeightAtFast?: HeightSampler;
  getContactHeightAt?: HeightSampler;
  getGroundType(x: number, z: number): string;
  getDriveGroundType?(x: number, z: number): string;
}

export type MovementCollisionResolver = (
  position: Vector3,
  radiusM: number,
  outPush: Vector3,
) => boolean;

export interface MovementShellSpec {
  guided?: boolean;
  reloadS?: number;
}

/** Fixed simulation step in seconds (ARCHITECTURE §1.1). */
export const SIM_DT = 1 / 60;
/** Locked-track skid of a destroyed hull (dirt, ~0.45 g): a 12 m/s wreck slides about 16 m in 2.7 s. */
const WRECK_SKID_DECEL_MPS2 = 4.5;

// ---------------------------------------------------------------------------
// Tuning constants (movement-physics doc §3–§6, values locked by ARCHITECTURE §3.4)
// ---------------------------------------------------------------------------
// K_ACCEL 0.16 gave a good 0-30 km/h surge but a lazy top half (r-crit: the
// 22.5 hp/t Abrams needed ~3 s for 43→60 km/h and never reached its 67 limit
// in 6.5 s). 0.20/0.72 fixed the top half but made the launch arcade-hot
// (r4 crit: 0-30 in 1.74 s vs the 2.2-2.8 s WoT-medium band). 0.17/0.65 +
// the SPOOL_S torque ramp below lands flat-sim 0-30 ≈ 2.0 s (~2.2 s on live
// rough ground) while 43→60 stays well under 2 s (the r-crit authority
// requirement — verified by scratchpad/gf-r4-tune.mjs).
// r7 (round critique MINOR: firm-ground launch still hot — live 0-30 in
// 2.04 s on the M1A2): 0.17 → 0.165 with SPOOL_FLOOR 0.25 → 0.22 and
// SPOOL_S 1.05 → 1.2 lands module-measured flat HARD 2.20 s / MEDIUM 2.42 s
// (scratchpad/gf-r7-tune.mjs) while 43→60 stays 1.37/1.53 s — both launch
// cases inside/at the WoT band edges, top-half authority untouched.
const C_DRAG = 0.65;             // quadratic drag fraction — asymptotic crawl to v_max (§3)
// Engine torque spool (r4 crit "initial surge a touch hot"): drive force ramps
// from SPOOL_FLOOR to 1 over SPOOL_S when the throttle opens, so a 60-ton
// launch reads heavy (tracks bite, hull squats, THEN it surges) without
// materially changing 0-40 times.
// r3 retune (r2 critique + task #216: 0.35/0.25 measured 0-30 km/h = 1.85 s
// LIVE on flat medium — arcade-hot vs the locked 2.2-2.4 s WoT-medium band).
// The ramp is now QUADRATIC (spool² — torque builds in the back half, reads
// as the turbine spooling while the tracks hook up) with floor 0.25 over
// 1.05 s: module-measured flat-medium 0-30 = 2.25 s on the M1A2 (22.5 hp/t,
// R=0.8), 43→60 untouched at 1.50 s (< 2 s r-crit authority requirement) —
// a plain floor/ramp tweak saturates at ~2.0 s because the linear spool is
// spent after S seconds, hence the curve change. The slower decay
// (0.45 s) keeps sub-half-second throttle blips (serpentine, tap-brake) from
// dumping the spool — only a real stop/reversal relaunches heavy; wall
// impacts still zero it explicitly (impact hard-stop below).
const SPOOL_S = 1.2;             // s to full drive torque from a standing start
const SPOOL_FLOOR = 0.22;        // torque fraction available instantly
const SPOOL_DECAY_S = 0.45;      // s for the spool to unwind at closed throttle
const BRAKE_MULT = 3.0;          // softer service-brake force; avoids snap-stops
// Brake decel cap scales with specific power (weight class): a 12 hp/t heavy
// caps near 7 m/s² and coasts visibly longer than a 25+ hp/t light/MBT at 9.
// cap = clamp(BRAKE_CAP_BASE + BRAKE_CAP_PER_HPT × hp/t, BRAKE_CAP_MIN, BRAKE_CAP_MAX)
const BRAKE_CAP_BASE = 3.5;      // m/s²
const BRAKE_CAP_PER_HPT = 0.20;  // m/s² per hp/t
const BRAKE_CAP_MIN = 4.5;       // m/s² — even the heaviest sluggard stops eventually
const BRAKE_CAP_MAX = 7.5;       // m/s² — ~2.4 s stop from 65 km/h
const BRAKE_DIVE_MULT = 0.78;    // visual pitch/suspension response while shedding speed
const COAST_MULT = 1.75;         // rolling-friction decel ≈ 0.5 × brake when W is released
const TURN_SPEED_LOSS = 0.35;    // target-speed fraction lost in a full-rate turn
// r4 crit: the three turn penalties STACKED (0.35 target scale + 0.5 power
// divert + 0.15/s direct bleed + full-force over-target drag) shed 73→33.6
// km/h in 1.7 s — WoT fast mediums carry ~60-65% through a sweeping turn.
// The target-scale bleed stays the dominant term (research doc §4); the
// direct bleed drops to 0.08/s AND fades out below ~half top speed so
// mid-speed serpentining stays fluid, and the pull-down onto a turn-bled
// target uses TURN_OVER_RATE × drive force instead of full engine braking.
const TURN_DIRECT_BLEED = 0.08;  // per-second multiplicative speed loss at full-rate turn (§4)
const TURN_BLEED_FADE_LO = 0.45; // × top speed — direct bleed is zero below this
const TURN_BLEED_FADE_HI = 0.75; // × top speed — full direct bleed above this
const TURN_OVER_RATE = 0.45;     // × drive accel used to scrub down to a TURN-bled target
const TURN_POWER_DIVERT = 0.5;   // drive-accel fraction diverted to the tracks at full-rate turn
// Hull-traverse reduction at speed. The research doc's traverse formula (§4)
// scales only by terrain resistance — WoT tanks hold near-nominal yaw rate
// while moving — so this stays SMALL and QUADRATIC: ~nominal through the
// mid band, only the last ~20% of the speed band widens turns (r-crit: the
// linear 0.4 cut the M1A2 to ~22°/s of its 44°/s spec at 60+ km/h).
const TRAVERSE_SPEED_SCALE = 0.2;// hull traverse reduction fraction at top speed (× speedFrac²)
const DOWNHILL_BONUS_CAP = 0.25; // up to +25% v_target downhill
// r4 (round critique: "heavy-tank standing start on a grade reads dead"): an
// open throttle on a grade with positive engine/grip margin must always win the
// tug-of-war with gravity, however slowly — a WoT Tiger on a 12-17° grass
// slope visibly pulls away at 8-12 km/h, while here SPOOL_FLOOR × accel
// (Tiger I: 0.25 × 1.9 ≈ 0.47 m/s²) lost to the near-stationary full-gravity
// share (~2.5 m/s² at 15°) and the hull sat inert for seconds (live probe:
// 6.6 km/h peak in 3.2 s). Two coordinated changes (see the gravity block):
// the "tracks not hooked up yet" full-gravity share now fades with the
// engine spool (spooled drivetrain = tracks turning = hooked), and the NET
// per-tick accel toward an open-throttle target is floored at this value so
// low hp/t tanks always creep forward on any grade the spec can climb. The
// floor never adds speed past vTarget (slope/turn-scaled), so flat-ground
// 0-30 tuning and the turn-bleed regimes are untouched (their net accel is
// far above it).
const CLIMB_CREEP_MPS2 = 0.25;   // min net accel toward an open-throttle target
const OVERSPEED_CAP = 1.2;       // absolute speed ceiling: 1.2 × transmission limit
const YAW_SPOOL_S = 0.15;        // track spool-up time toward target yaw rate
const NEUTRAL_TURN_MULT = 0.95;  // Pc term of the wiki traverse formula
const PIVOT_OFFSET_M = 1.2;      // locked-track orbit offset for 'pivot' style turns
const PIVOT_SPEED_EPS = 0.1;     // m/s — below this a stationary pivot turn engages
const HALF_WID_FRAC = 0.5;       // contact-line half-width = 0.5 × widthM (track outer edge)
// Terrain-contact support solve (r5 hard gate): the hull pose is resolved so
// that NO point along either track contact line renders below the heightfield.
// Line half-length 0.45 × hullLengthM matches the rendered track bottom run
// for PROCEDURAL gear (tankFactory places idler/sprocket at ~±0.45 L; the
// arcs curve up past them).
// r7 TERRAIN-CONTACT HARD GATE (float side, round critique CRITICAL): GLB
// visuals do NOT share that layout — the swapped Abrams' rendered track
// bottom runs only ±2.3 m (0.29 L) with the tracks curling up past ±2.5 m,
// so a 0.45 L support line held the tank up on ~1.25 m of PHANTOM contact
// beyond each real track end: on WoT-typical rolling ground the lowest
// rendered vertex rode a MEDIAN 20-21 cm above the heightfield (53-69 cm
// peaks at speed) and PARKED hovering 21 cm — photographed daylight under
// the whole wheel run on desert. state.ts therefore scans the swapped
// visual's low band (vertices within 5 cm of min-Y, exactly like the r7
// probe) when it detects the swap and publishes the measured geometry as
// `entity.contactGeom = { halfLenM, halfWidM, zCenterM }`; the solve below
// uses it for the line half-length, half-width and longitudinal center.
// Procedural gear keeps the 0.45 L / 0.5 W spec fractions (they match
// tankFactory by construction — fallback when contactGeom is absent).
const SUPPORT_LEN_FRAC = 0.45;   // support line half-length = 0.45 × hullLengthM
const SUPPORT_SPACING_M = 0.35;  // max gap between contact samples along a line
const SUPPORT_MAX_N = 24;        // per-line sample cap (Maus-length hulls)
// r5 terrain-contact hard gate (round critique): the solve sampled ONLY the
// two outer track-edge lines (±0.5 × width). Terrain bumps cresting BETWEEN
// them — under the road wheels (xc ≈ 0.6–0.8 × hw) and the hull belly — were
// never resolved: parked on an open meadow the worst visible vertex sat
// -16.0 cm below the heightfield (a settled wheel rim -18.3 cm) while the two
// sampled lines held a perfect +1.0…+1.5 cm all run. The solve now samples a
// LATERAL FAN of longitudinal lines per side covering the whole track width,
// plus a hull-belly guard pair at the ground-clearance height:
//   ×hw   yOff  covers
//   1.00  0     track outer edge + skirts (the original pair — also the fit)
//   0.80  0     track centerline / road-wheel run
//   0.63  0     track inner edge (roster range 0.47–0.65 × hw)
//   0.32  0.34  hull belly (guard: every roster hull bottom is ≥ 0.40 m —
//   0.00  0.34  fires only on knife crests that would otherwise clip the pan)
// The added lines are support-only (the plane FIT stays on the outer pair —
// identical feel on smooth ground) and sample at 2× coarser longitudinal
// spacing: lateral crests vary slowly along z, and the fan costs ~2.4× the
// old two-line pass instead of 4×.
const SUPPORT_FAN = [
  { f: 0.80, yOff: 0 },
  { f: 0.63, yOff: 0 },
  { f: 0.32, yOff: 0.34 },
  { f: 0.00, yOff: 0.34 },
];
// r3 fan yield (selftest levitation, round critique): the yOff=0 wheel-run
// fan lines are SOFT supports. On a rough contact patch their allowed lift
// over the track-edge contact shrinks by (roughness − FREE), where roughness
// = outer-line max deficit − mean yOff=0 deficit (the critique's "spread
// between max and mean contact deficit"). The yield is capped so the terrain
// left proud under a wheel line never exceeds what the renderer's per-wheel
// conform layer absorbs (tankFactory: one-to-one ground travel, +0.30 m,
// band + link pads follow the wheels) — the rendered-vertex burial gate
// holds by construction. Smooth/planar patches (roughness < FREE: every
// live-map case, incl. the r5 parked-meadow wheel-rim evidence) keep the
// full hard clamp — bit-identical behavior to r5 there.
const FAN_YIELD_FREE_M = 0.10;   // roughness below this: fan lines stay hard
const FAN_YIELD_MAX_M = 0.30;    // max softening — conform absorbs ≤ 0.35 m
// Yield OPENS rate-limited (m/s): the renderer's per-wheel conform spring
// (tankFactory, 0.55/frame ease) is what bridges the yielded terrain, and
// handing it a step lets a wheel rim lag transiently into the ground (drive
// probe: −3.1 cm spike at 47 km/h). Slew-limited opening keeps the conform
// target inside what the ease tracks per frame; CLOSING stays instant — a
// rising clamp is always burial-safe.
// r4-fix: 0.6 → 0.35. The slew is SIM-time but the conform ease is per
// RENDERED frame — on a frame-starved page (or a low-fps player machine)
// main.ts batches up to MAX_SIM_STEPS ticks per frame, so at 0.6 m/s the
// yield could step 3-4× further per frame than the ease was budgeted for
// (contention drive probe: −5…−6 cm wheel-rim transients at sim/wall 0.28
// that never appear at real-time pacing). Halving the rate keeps the
// per-frame conform step in budget through 2-tick frames; on smooth->rough
// transitions the clamp simply stays hard ~0.2 s longer, which is the safe
// direction.
const FAN_YIELD_OPEN_MPS = 0.35;
// r3 two-point settle authority (see the fit block): max pitch correction the
// rigid-body settling may add on top of the LSQ plane per tick's target. On
// ordinary ground the deficit spread keeps ΔP a few milliradians — the clamp
// only engages on extreme single-tip cantilevers (plunging off a crest into a
// trough), where a large, fast rotation IS the physical motion.
const SETTLE_CLAMP_RAD = 0.09;
// r5 PERCH boost (selftest egg-crate levitation, round critique): when the
// settle asks for MORE rotation than the clamp allows, the hull is balancing
// on a single line-END contact — a knife-crest perch. Diagnosed on the failing
// selftest tick: front-left line end in true contact (+3.3 cm = margins) while
// every other contact sample hung ≥ 7 cm, the raw settle ratio ~0.33 rad vs
// the 0.09 clamp, and the 3 Hz attitude spring lagging the (clamped) target.
// Raising the clamp alone over-rotates the λ8/A1.5 sine case airborne — the
// physical fix is RATE, not authority: a hull tipping about one end carries
// the full gravitational moment, so the PITCH spring stiffens (ω up to
// ×(1+PERCH_W_BOOST)) and goes critically damped (ζ→1, ground reaction is
// dissipative — tip onto the second contact and STOP, no underdamped
// bounce-back float) while the perch persists. state._perch is the smoothed
// 0..1 factor: raw settle excess over the clamp, instant attack, ~0.3 s
// release. Exactly zero on ordinary ground (raw settle inside the clamp), so
// smooth-map feel is untouched.
const PERCH_W_BOOST = 1.0;       // pitch spring ω multiplier at full perch (×2)
const PERCH_RELEASE_S = 0.3;     // s for the perch factor to decay after touchdown
// The dominant float term during a perch is NOT the main spring but the susp
// ROCK MIRROR: its terrain-delta target pins at the ±SUSP_P_CLAMP and the
// render amplification can still add several degrees of COSMETIC nose-dive
// beyond the two-contact pose (diagnosed at the failing selftest
// tick: spring −0.084 rad vs susp contribution −0.136 rad). The solve then
// must float the whole patch to keep the dove pose clear. Physically a hull
// hanging off one line end has NO loaded bogies to chatter — the cosmetic
// layer yields to the rigid-body tip: the terrain-delta target fades with
// perch and the stored displacement bleeds off at PERCH_SUSP_BLEED (τ ≈ 80 ms
// at full perch). tankFactory renders state._susp directly (sim is the single
// authority since r5), so the gate reaches the screen with zero divergence.
const PERCH_SUSP_BLEED = 12;     // 1/s displacement bleed rate at full perch
// Contact margin: the solved plane rides this far above the highest contact
// sample. Covers (a) the sub-sample terrain bulge between support points and
// (b) the bounded phase error between this sim-tick susp mirror and the
// renderer's per-frame integration at non-60 fps — while staying under the
// track link pads, which hang ~1–2 cm below the hull-local contact plane.
// r3: 0.015 → 0.017 — pairs with the ATT bump below; the live drive gate at
// 50 km/h over 19 m relief brushed −3.0 cm (instantaneous, conform-lag class,
// r6 measured −2.4 for the same class) and the extra base margin buys it back.
const SUPPORT_MARGIN_M = 0.017;
// r6 hard-gate headroom: the margin GROWS with the rendered attitude. The
// track link pads hang 1–2 cm below the hull-local contact plane by design,
// and at combined attitude extremes they approached the 3 cm burial gate
// (-2.4 cm transient at 24° pitch with -17° roll — 60% of the gate). Up to
// +SUPPORT_MARGIN_ATT_M is blended in linearly, saturating at
// |pitch|+|roll| = SUPPORT_MARGIN_ATT_RAD; exactly zero cost on flat ground.
// r3: 0.010 → 0.014 — the drive probe's rendered-vertex scan brushed −3.1 cm
// once at 47 km/h on 19° attitude swings (conform-lag transient); the extra
// attitude-scaled headroom costs nothing on flat ground.
// r4-fix: 0.014 → 0.017 — the corrected (interleave-aware) vertex gate saw a
// −3.2 cm single-scan transient at 57 km/h on 27°/39° combined swings; one
// more attitude-scaled step keeps the worst conform-lag class inside the
// −3 cm gate. Still exactly zero cost on flat ground.
const SUPPORT_MARGIN_ATT_M = 0.017;
const SUPPORT_MARGIN_ATT_RAD = 35 * (Math.PI / 180);
// Closed armor-shell contact is rigid and does not need the track solver's
// attitude/transient insurance. Keep only a sub-centimetre interpolation
// allowance so an overturned hull visibly rests on its real roof/side rather
// than hovering above an invisible dimensions box.
const RIGID_BODY_MARGIN_M = 0.008;
// Physics lane (2026-10-03): the hull's own nose and tail. The solve seats the track lines; the armour beyond them (a
// glacis lip, a stern plate, a casemate's lower nose) was checked only while the hull tumbled, so a hull pitched into
// a trench's far wall or down onto a bank buried its nose up to 0.9 m. The lowest shell point of each end, per side and
// at the centre line, is a rigid floor every tick: up to six extra samples, never binding on ground the tracks rest on.
const END_GUARD_SPAN_FRAC = 0.4;      // shell points further than this × hull length from the centre are end points
const END_GUARD_MIN_Y_M = 0.15;       // a guard sits clear of the track line (never part of the flat-ground seat)
const END_GUARD_SIDE_X_M = 0.3;       // lateral bins: left of −x, centre, right of +x
const END_GUARD_LEAN = 0.5;           // tan ≈ 27°: the pitch at which a guard is chosen to touch first
// Vertical ride dynamics. The support solve below computes the minimum safe
// chassis height, but assigning pos.y to that value every fixed tick made the
// whole vehicle trace the heightfield like a rigid magnet. Keep the support
// value as a hard compression floor, then let the sprung mass follow it with
// bounded droop. Procedural bogies travel 0.22 m and sourced GLB wheels travel
// 0.20 m, so the limits below keep the chassis inside the visual suspension
// envelope while giving it enough inertia to round crests instead of snapping.
const RIDE_OMEGA = 2 * Math.PI * 1.8; // 1.8 Hz sprung-mass heave
const RIDE_ZETA = 1.0;                // critical damping: no chassis heave rebound
const RIDE_COMPRESSION_M = 0.20;      // track/wheel up-travel over a local crest
const RIDE_DROOP_M = 0.18;            // max chassis separation from support plane
const RIDE_GROUND_V_TAU = 0.09;       // smooth terrain-following launch velocity
/**
 * Sirocco Wadi, Zone Control, seed 57001 (maps lane matrix, 2026-10-03): an M1A2 climbing a 40-degree wadi face at
 * 9-17 m/s rose at 11 m/s with its support. The grade rule zeroed its uphill speed (applySlopeForces) — but not the
 * climb: the ride kept 11 m/s upward against a support that had stopped, detached, and flew 5.7 m. A blow that takes a
 * hull's travel (the grade rule, a cliff face, a collider) takes the same share of the vertical motion that travel was
 * carrying (_blockedSpeed, updateVerticalContact). It is a stop, not a crash: the grade rule prices nothing.
 */
let _blockedSpeed = 0;
/**
 * How far this tick's turn of the hull lowered the support at the contact it rests on (support solve), and whether the
 * turn was a gravity tip about that contact (updateSupportedAttitude). A hull tipping about an edge pivots on it: the
 * root goes down with the turn, as a rigid body's centre does about its pivot; rotating about its root alone, a hull
 * tipping onto its tail lifted the tail clear and hung over its support until gravity caught it up, and a hull tipping
 * onto a 45-degree face lost the face it slid on (physics lane, 2026-10-03). Only the turn's share is followed this way:
 * ground that falls away under a moving hull is still a fall (no faster than gravity).
 */
let _rotationDrop = 0;
/** Whether this tick's fit found every track sample carrying the hull (no edge, no drop under it): only then does a
 * grade it runs down carry its tracks with it (constrainLoadedRide). */
let _wholeTrackOnGround = true;
/** The support's own rise rate this step, unsmoothed (updateRideSupportVelocity; the floor clamp carries the ride at it). */
let _supportRate = 0;
/** World-space grade along the travel under an airborne hull this step (worldGradeAlong). */
let _airGrade = 0;
/** Half the run the world grade is read over. */
const AIR_GRADE_PROBE_M = 1.5;
/** Below this cosine of pitch the track samples no longer span the travel (worldGradeAlong reads the grade). */
const AIR_GRADE_MIN_COS = 0.3;

function worldGradeAlong(hAt: HeightSampler, x: number, z: number, forwardX: number, forwardZ: number): number {
  const ahead = hAt(x + forwardX * AIR_GRADE_PROBE_M, z + forwardZ * AIR_GRADE_PROBE_M);
  const behind = hAt(x - forwardX * AIR_GRADE_PROBE_M, z - forwardZ * AIR_GRADE_PROBE_M);
  return (ahead - behind) / (2 * AIR_GRADE_PROBE_M);
}
let _tippedThisTick = false;
const RIDE_SUPPORT_V_CAP = 12;         // m/s; bounds extreme launch ramps
/** A hull coming down on its shell stops its closing at the contact past this (m/s): the armour has no stroke. */
const LANDING_STOP_MPS = 3;
/** The springs turn a landing's fall into its rebound once they have slowed the fall into them below this (m/s). */
const REBOUND_TURN_MPS = 0.25;
/**
 * The landing stroke (physics lane, 2026-10-03; gauntlet wave 2: "wheels droop in the air, compress on impact, then a
 * damped settle with low restitution"). A landing on the tracks is taken by the springs at this damping ratio until the
 * hull has come back up through its seat: a hard landing bottoms on the stops (full compression), a soft one dips, and
 * each rises through the seat and overshoots it a little on drooping wheels before the ordinary, critically damped ride
 * settles it. Driving keeps the critical damping (no heave bob over every bump).
 */
const LANDING_ZETA = 0.45;
/** A closing under this is a settle onto the tracks, not a landing stroke (a hop off a kerb, the small re-landing after
 * a rebound): the ordinary ride takes it without the overshoot. */
const LANDING_STROKE_MIN_MPS = 2;
/** The bump stops never read less travel than this above the floor (bounds the stopping deceleration). */
const BUMP_STOP_MIN_ROOM_M = 0.01;
/** Ground falling away under a hull is followed as fast as it falls (physics lane, 2026-10-03): the launch bound held
 * the support's descent to 12 m/s too, so a hull sliding down a 48-degree face past 12 m/s fell behind its own
 * support, went airborne on the face and "landed" on it at 9 m/s. Only a rising support launches a hull. */
const RIDE_SUPPORT_V_FALL_CAP = 60;
// Contact is released once the terrain falls beyond full track droop. The old
// solver clamped the root to `support + droop` forever, effectively applying
// an unbounded downward constraint across cliffs. Free flight preserves the
// last support-relative vertical velocity and integrates gravity until the
// extended running gear intersects terrain again.
const RIDE_DETACH_CLEARANCE_M = 0.015;
const RIDE_DETACH_REL_V_MPS = 0.20;
/** How far past the physics droop a hull may hang and still count as grounded: the rendered road wheels droop 0.22 m,
 * 4 cm past RIDE_DROOP_M, and the tracks keep their purchase while they reach (physics lane, 2026-10-03). */
const RIDE_HANG_M = 0;
// Physics lane (2026-10-03, owner: "a lot better and less glitchy"): drop-aware attitude. The attitude spring used to
// chase a least-squares plane through EVERY track sample, including samples hanging over a drop — at a cliff edge or a
// trench the plane took the ground metres below as the slope to align with and pitched the hull nose-down at up to
// 8 rad/s, which (lifting the root) also launched it. Ground under a sample lower than the loaded track line by up to
// DROP_NEAR_M is terrain the hull settles onto (a bowl, a slope, a rut) and keeps its full weight in the fit; from
// DROP_NEAR_M to DROP_FAR_M the weight fades to nothing (a drop the hull bridges or tips over, never chases). A centre of
// mass that overhangs the samples still bearing weight tips the hull about that edge under gravity instead.
const DROP_NEAR_M = 0.6;
const DROP_FAR_M = 1.2;
/** A wheel-run fan sample within this of the loaded line counts as support for the lateral tip. */
const TOUCH_REACH_M = RIDE_DROOP_M + 0.17;
/** The centre of mass must overhang the last loaded sample by this much before the hull tips about it. */
const TIP_DEADBAND_M = 0.08;
/** Contact damping of a hull pivoting on an edge (1/s): the edge scrapes, it is not a hinge. */
const TIP_DAMP_S = 0.8;
/** Faster than this along the hull, the side the hull drives toward decides whether an overhang tips (contactAwareFit). */
const TIP_TRAVEL_MPS = 0.5;
/**
 * A hull tipping about samples that touch within this length along it pivots on an edge (a roof's, a ledge's, a
 * trench lip's): its belly is the face that rests on the edge, so the grade it slides on is its own pitch, not the plane
 * of the surface the edge belongs to (physics lane, 2026-10-03). The roof's plane held a hull tipped 67 degrees nose-up
 * over a roof edge on the edge for six seconds, rocking, because a level plane pulls nothing.
 */
const EDGE_BAND_M = 1.0;
// Unsupported hull attitude is a rigid-body phase. Angular momentum decays
// only very lightly in air; ground contact supplies the strong damping and
// gravity torque. This is intentionally separate from the suspension spring:
// using that spring in flight erased launch rotation, then produced a sharp
// nose lurch when a long jump reacquired terrain.
const AIR_ANGULAR_DRAG_S = 0.055;
const AIR_ANGULAR_SPEED_MAX = 1.15; // rad/s; ordinary launch-rate bound
const TUMBLE_ANGULAR_SPEED_MAX = 2.8; // collisions/rollovers may rotate faster
/** Round 30: the longest obstacle push one fixed step applies (60 steps/s → a 7 m intrusion resolves in ~120 ms). */
const OBSTACLE_PUSH_MAX_M_PER_STEP = 1.0;
/** state.impactSource values: what absorbed this tick's blocked closing speed. */
export const IMPACT_SOURCE_NONE = 0;
export const IMPACT_SOURCE_CLIFF = 1;
export const IMPACT_SOURCE_COLLIDER = 2;
// Impact physics (owner 2026-09-25, "make the physics more proper on regular modes"):
// Lateral grip. A hull turning at speed needs v·ω of lateral acceleration from its tracks; past what the ground
// supplies it would pirouette (the old law kept 80 % of the standing traverse rate at top speed — a 60 km/h
// Abrams turned inside 27 m). The yaw rate is capped so v·ω ≤ LATERAL_GRIP_MPS2 × g-scale × (hard / resistance):
// unchanged below ~30 km/h on hard ground, a 46 m radius at 60 km/h, wider on soft ground and under low gravity.
// The cap never takes more than TRAVERSE_FLOOR_FRAC of the standing rate so steering always answers.
const LATERAL_GRIP_MPS2 = 7;
const TRAVERSE_FLOOR_FRAC = 0.3;
// Static hold. Coasting or braking on a grade, the tracks hold the hull once it has stopped when the grade's pull
// is within the holding decel (coast ≈ 3.5 m/s² ≈ 21°, brake up to 7.5 m/s²); the old integration re-added one
// tick of gravity after every approach() and every parked hull crept down its slope at a few cm/s.
const STATIC_HOLD_EPS_MPS = 0.05;
/**
 * Round 30 (owner 2026-09-20: hulls "going up walls, or sides of steep hills at high speeds"): ground rising
 * steeper than this grade (tan 52°) right ahead of the tracks is a wall, not a climb. The hull stops against it
 * with an impact instead of riding the support solve up the face and launching off its top.
 */
export { CLIFF_GRADE } from './terrainMobility.ts';
/** How far beyond the leading track edge the cliff probe looks (one hull step at speed, a track length at rest). */
const CLIFF_PROBE_M = 1.5;
/** A wall keeps rising: the face must still be this much higher a few metres on, or it is a step a tank crosses
 * (trench and crater walls, kerbs of terraces) — the pacing receipt showed bots stranded at 2 m trench walls. */
const CLIFF_WALL_PROBE_M = 4.5;
const CLIFF_WALL_RISE_M = 3.0;
const LANDING_CONTACT_BLEND_S = 0.34;
const LANDING_SPRING_MIN_SCALE = 0.28;
const LANDING_TORQUE_GAIN = 0.22;
const LANDING_TORQUE_MAX = 1.7;
const TUMBLE_ENTER_UP_Y = 0.55;    // ~57° from upright
const TUMBLE_EXIT_UP_Y = 0.88;     // hysteresis: settle close to upright only
const OVERTURN_ENTER_UP_Y = -0.08; // center of mass has crossed past the side
const OVERTURN_EXIT_UP_Y = 0.48;
const GROUND_TUMBLE_DAMP_S = 1.7;
const GROUND_TUMBLE_GRAVITY = 3.1;
const AUTO_RIGHT_OMEGA = 3.4;
const AUTO_RIGHT_ZETA = 1.0;
// Mirror of tankFactory's turn-lean sway (visual layer adds it to rotation.z):
// the support solve folds the predicted sway into the effective roll so a hard
// fast turn cannot dip the leaned-into track edge below the terrain.
const SWAY_GAIN = 0.011;
const SWAY_CLAMP = 0.035;
// Matches the old 0.12-per-60-Hz response while remaining invariant when
// local multiplayer prediction advances in shorter render-rate substeps.
const SWAY_TAU_S = -SIM_DT / Math.log(1 - 0.12);
// Mirror of tankFactory's visual suspension rock layer (suspP/suspR in
// syncFromState): the renderer adds a restrained transient spring to the
// hull rotation on top of visualPitch/visualRoll, so the support solve must
// clear the terrain at THAT pose. Constants must stay in lockstep with
// tankFactory.ts (SUSP_W/SUSP_Z, accel squat, 4-corner fit, clamps) — see
// docs/history/research/movement-physics.md for the movement model.
const SUSP_W = 7.2;
const SUSP_Z = 0.65;
const SUSP_ACCEL_CLAMP = 9;      // m/s²
const SUSP_ACCEL_GAIN = 0.0044;  // rad per m/s² (nose up under accel)
const SUSP_FIT_LEN = 0.36;       // × hullLengthM (their corner fit)
const SUSP_FIT_WID = 0.42;       // × widthM
const SUSP_P_CLAMP = 0.065;      // rad — terrain-delta pitch authority
const SUSP_R_CLAMP = 0.055;      // rad — terrain-delta roll authority
const SUSP_K_SPEED = 4;          // m/s for full rate scale
const SUSP_K_GAIN = 0.76;
// Mirror of tankFactory's r6 VISIBLE-dynamics amplification: syncFromState
// renders the hull at susp.p × SUSP_VIS_P / susp.r × SUSP_VIS_R and sway =
// _swayEst × SWAY_VIS (readable squat/dive/turn-lean at gameplay camera
// distance). The support solve therefore clears the terrain at the AMPLIFIED
// pose — otherwise the exaggerated transient buries a track end ~10 cm on
// rough ground (r3 drive gate: minClear −11.7 cm before this fold). Constants
// MUST stay in lockstep with tankFactory.ts SUSP_VIS_P/SUSP_VIS_R/SWAY_VIS;
// tankFactory's half-lift compensation hack is removed by the REQUIRED
// movement contract in docs/history/research/movement-physics.md — the solve is the
// single authority. (The r2 handoff carried the same hunk but it was never
// applied; the stacked half-lift floated the whole contact patch 12-17 cm
// during full-speed turns — r1 critique, terrain-contact hard gate.)
const SUSP_VIS_P = 2.2;
const SUSP_VIS_R = 1.9;
const SWAY_VIS = 2.4;
// Mirror of tankFactory's hit-flinch rock (FLINCH_W/FLINCH_Z in the visual
// layer): a large-caliber hit kicks flinchPV up to ~0.36 rad/s ⇒ peak rock
// ~1.6°, which over a 3.5 m half-length transiently dips a track end ~10 cm —
// far past the 1.5 cm SUPPORT_MARGIN. The oscillator is therefore integrated
// HERE (state._flinch, once per sim tick) and folded into the support solve;
// tankFactory reads state._flinch for rendering and routes its hit/recoil
// impulses into it (see docs/history/research/movement-physics.md).
// RENDER SIGN: rotation.x = -(visualPitch + suspP) + flinchP, so flinch pitch
// SUBTRACTS from the movement-space pitch; flinch roll adds like the others.
const FLINCH_W = 13;
const FLINCH_Z = 0.32;
const MUZZLE_CLEARANCE_M = 0.15; // gun-terrain clamp: min muzzle height above ground
const MUZZLE_CLEARANCE_FRACTIONS = Object.freeze([1, 0.55]);
// GUN LIMIT label gating (r3, round critique): the muzzle-terrain clearance
// clamp pins the reticle near-CONSTANTLY while driving rough ground (every
// crest the barrel sweeps raises the depression floor over the close-range
// server-aim ask), which reads as UI noise — WoT only shouts at true
// depression limits. state.gunLimitSpec carries the LABEL: genuine spec pins
// (gunDepressionDeg / gunElevationDeg / casemate arc) always label; a pin
// that exists only because of the terrain-clearance floor stays label-silent
// at close range — the red tint still marks it, and a shot that would
// actually strike the near terrain raises the richer PATH BLOCKED indicator
// (hud blockedDistM), so no information is lost. Far asks (≥ the distance
// gate) keep the label: pinning there means real hull-down geometry.
const GUN_LIMIT_LABEL_DIST_M = 120; // terrain-floor pins label only past this
// r5 (round critique): even the far-ask label re-fired on every crest while
// rolling cross-country. The LABEL (not the tint) requires this much
// CONTINUOUS pin time — transient hull-pitch pins at speed never reach it,
// a deliberate hull-down lay does.
const GUN_LIMIT_LABEL_DWELL_S = 0.5;
const SPRING_OMEGA = 2 * Math.PI * 3; // hull attitude spring natural frequency (rad/s)
const SPRING_ZETA = 0.6;         // damping ratio
const K_INERTIA = 0.006;         // rad of pitch target per m/s² of longitudinal accel
const INERTIA_CLAMP = 0.1;       // rad — max inertial pitch contribution
const DVDT_CLAMP = 16;           // m/s² — reject collision-pushback spikes
const BLOOM_GROW_TAU = 0.05;     // s — bloom-up is effectively instant
// controls_gunnery r2: SHRINK tau uses ln6 (grow uses the fixed
// BLOOM_GROW_TAU) — pairs with the smaller afterShot multipliers in specs.ts
// so post-shot re-settle under the fire gate lands ~2.3 s on modern MBTs.
const LN6 = Math.log(6);
// Rapid IFV cannon fire is a stabilized stream, not a sequence of full-size
// cannon shocks. Keep each 1 s-or-faster belt round to a two-percent bloom
// nudge; the normal aim decay clears almost all of it before the next round.
// Slower IFV guns and missile rails retain their ordinary after-shot bloom.
export const IFV_AUTOCANNON_AFTER_SHOT_BLOOM = 1.02;
const IFV_AUTOCANNON_MAX_CYCLE_S = 1;
// FEEL: an IFV's 20-35 mm stream stays stabilized, but each shot must remain
// readable from the gameplay camera. 0.36 preserves a much lighter response
// than a tank cannon while giving the hull, camera and FOV layers enough
// impulse to survive normal motion. Slow IFV guns and ATGM rails stay full.
export const IFV_AUTOCANNON_RECOIL_SCALE = 0.36;
const RECOIL_VEL_MPS = 0.3;      // backward hull translation impulse on firing
const RECOIL_DECAY_TAU = 0.13;   // s — translation impulse decays in ~0.4 s
const LAUNCH_SPEED_CAP_MPS = 45; // ruleset launches never push the run speed past this
const KNOCK_TRANSLATION_GAIN = 2.2; // impact shove → decaying translation impulse (≈ knock × 0.29 m of displacement)
const JUMP_AIRTIME_GRACE_S = 0.05;
// round 30 (owner 2026-09-20: the jump should "be a lot more powerful, and work even when you're not on ground"):
// an airborne hull may fire its jump again once this much flight has passed since the last lift — a rocket boost
const JUMP_AIR_REPEAT_S = 0.35;
/** The rocket's ceiling: an air boost carries the hull at most this many single-jump apexes above its ground. */
const JUMP_CEILING_APEXES = 2;
const RECOIL_KICK_MIN_DEGS = 8;  // spring pitch-rate kick, light gun
const RECOIL_KICK_MAX_DEGS = 15; // spring pitch-rate kick, heavy gun
/** The share of the recoil kick an airborne hull takes as rotation (fireRecoil). */
const AIR_RECOIL_TURN_SCALE = 0.1;
const OUTER_TRACK_ARM_M = 1.5;   // trackScroll differential arm: v ± yawRate × 1.5
const GUN_YELLOW_BLOOM_FLOOR = 2;    // gun module yellow: no aim shrink below f = 2
const GUNNER_DEAD_AIMTIME_MULT = 1.5;
const DRIVER_DEAD_MULT = 0.7;    // accel & traverse when the driver is dead
const ENGINE_YELLOW_POWER_MULT = 0.5;

const DEG2RAD = Math.PI / 180;
// Swedish siege-TD hydropneumatic aiming is a target offset for the existing
// hull attitude/support solver, not a second visual transform: armor, muzzle,
// tracks, terrain contact, and remote snapshots all retain one canonical pose.
// Each vehicle owns its physical envelope in spec.hydropneumaticAim so new
// hydraulic hulls do not require another simulation ID allow-list.
const SUSPENSION_AIM_DEFAULT_NOSE_DOWN_DEG = 6;
const SUSPENSION_AIM_DEFAULT_NOSE_UP_DEG = 8;
const SUSPENSION_AIM_DEFAULT_RATE_DEG_S = 5;
const RAD2DEG = 180 / Math.PI;

// Casemate TDs (movement doc §7 + the §1 class-table note): the gun yaw is
// limited to ±arc instead of a full turret — when the aim point exceeds the
// arc, hull traverse toward the target auto-engages (WoT does exactly this in
// sniper mode). `spec.gunArcDeg` overrides per vehicle; any spec whose armor
// carries `turretless: true` (every fixed-mount vehicle in the roster: the
// Strv 103 family and jpz_e100_x) defaults to ±CASEMATE_ARC_DEG
// per the doc's ±10–15° band. Turreted tanks (arc = Infinity) are untouched.
const CASEMATE_ARC_DEG = 11;
// Excess-over-arc that commands a FULL-RATE hull traverse; below it the
// synthesized steer is proportional (a P-controller on the excess), so the
// hull eases onto the target and the residual decays exponentially
// (tau = ramp / traverse-rate ≈ 0.2 s) instead of parking a fixed error —
// the settled gun lands ON the aim point, not a deadband short of it.
const AUTO_TRAVERSE_RAMP_RAD = 8 * DEG2RAD;
// round 32 (owner 2026-09-21: "playing turretless tanks is so janky and glitchy"): the hull traverse used to
// let go the instant the sight re-entered the arc, parking the sight ON the arc edge where the yaw pin
// (|request| > arc) re-armed on every hull/mouse wobble, and it measured the sight from the hull centre while
// the gun lay measures from the gun origin — so the two disagreed by the parallax and the reticle sat red with
// the gun on target. Now ONE gun-origin request drives both; an engaged traverse carries the sight this far
// INSIDE the arc before it releases (the fine-lay joint owns the last degrees). Arcs narrower than the band
// park at half their arc.
const CASEMATE_TRAVERSE_SETTLE_RAD = 3 * DEG2RAD;
// The engaged traverse eases toward a point this far PAST the release line, so the sight crosses it at a
// finite rate and the latch actually lets go (a P-controller aimed exactly at the line only ever approaches it).
const CASEMATE_TRAVERSE_CROSS_RAD = 0.5 * DEG2RAD;
// Hydraulic fixed guns have no fine-lay joint: the hull IS the traverse and closes on the sight exponentially.
// Their traverse counts as engaged past the authored gunArcDeg (the Swedish specs carry 3–4°) and released at
// half of it — instead of the old 0.006° test that held the Strv 103 reticle red in 99% of frames.
const HYDRAULIC_REACH_DEFAULT_DEG = 3;
// A sight in the rear cone keeps the traverse direction it started with (the shortest way flips sign across
// 180°, which dithered the hull left/right on a target dead astern).
const REAR_LATCH_RAD = 165 * DEG2RAD;

/** True when the rendered barrel is rigidly attached to a hydraulic hull. */
function hasFixedHydraulicGun(spec: MovementSpec): boolean {
  return !!(spec.hydropneumaticAim && spec.armor && spec.armor.turretless);
}

/** Gun-yaw half-arc in radians for a spec (Infinity = full turret). */
function gunArcRadFor(spec: MovementSpec): number {
  // Swedish siege vehicles have no invisible fine-lay joint: the hull must
  // rotate all the way onto the sight line because the rendered gun is fixed.
  if (hasFixedHydraulicGun(spec)) return 0;
  if (typeof spec.gunArcDeg === 'number') return spec.gunArcDeg * DEG2RAD;
  if (spec.armor && spec.armor.turretless) return CASEMATE_ARC_DEG * DEG2RAD;
  return Infinity;
}

/** Yaw window (rad) inside which a hydraulic fixed gun counts as on the sight line. */
function hydraulicReachRad(spec: MovementSpec): number {
  return (typeof spec.gunArcDeg === 'number' ? spec.gunArcDeg : HYDRAULIC_REACH_DEFAULT_DEG) * DEG2RAD;
}

// Module-scope scratch (no per-frame allocation, ARCHITECTURE §1.3).
const _push = new Vector3();
const _aimLocal = new Vector3();
const _gunOriginWorld = new Vector3();
const _turretPivotLocal = new Vector3();
const _hullUpWorld = new Vector3();
const _turretForwardWorld = new Vector3();
const _gunWorldDir = new Vector3();
const _worldUp = new Vector3(0, 1, 0);
const _hullEuler = new Euler(0, 0, 0, 'YXZ');
const _hullQuat = new Quaternion();
const _gunLaySolution: GunLaySolution = {
  horizontalDistance: 0,
  worldPitch: 0,
  turretYaw: 0,
  gunPitch: 0,
};
const _supportSamples: SupportSamples = {
  halfLength: 0,
  centerZ: 0,
  lineCount: 0,
  step: 0,
  cosYaw: 1,
  sinYaw: 0,
  cosNegPitch: 1,
  sinNegPitch: 0,
  cosRoll: 1,
  sinRoll: 0,
  sinPitch: 0,
  cosPitch: 1,
  fitSinPitch: 0,
  fitCosPitch: 1,
  fitSinRoll: 0,
  fitCosRoll: 1,
  worldX: 0,
  worldZ: 0,
  zHalf: 0,
  sumHeightZ: 0,
  sumZZ: 0,
  sumLeft: 0,
  sumRight: 0,
  sideCount: 0,
  outerMax: -Infinity,
  outerX: 0,
  outerZ: 0,
  settleDeficitSum: 0,
  deficitCount: 0,
  deepestZ: 0,
  settleOuterMax: -Infinity,
  frontMax: -Infinity,
  frontZ: 0,
  rearMax: -Infinity,
  rearZ: 0,
  fanMax: -Infinity,
  bellyMax: -Infinity,
  panY: null,
  fitCount: 0,
  fanTouchLeftX: Infinity,
  fanTouchRightX: Infinity,
};
// Physics lane (2026-10-03): the outer-line samples of one support solve (hull-local centred z, x, ground height and
// rendered deficit), kept so the attitude fit can use only the samples that actually carry load.
const _fitZ = new Float64Array(2 * SUPPORT_MAX_N);
const _fitX = new Float64Array(2 * SUPPORT_MAX_N);
const _fitH = new Float64Array(2 * SUPPORT_MAX_N);
const _fitD = new Float64Array(2 * SUPPORT_MAX_N);
const _driveStep: DriveStep = {
  grounded: true,
  throttle: 0,
  steer: 0,
  braking: false,
  ground: 'medium',
  resistance: 1,
  hardResistance: 1,
  forwardX: 0,
  forwardZ: 1,
  rightX: 1,
  rightZ: 0,
  terrainPitch: 0,
  topSpeed: 0,
  reverseSpeed: 0,
  speedMultiplier: 1,
  gravityScale: 1,
  restitution: STANDARD_PHYSICS.restitution,
  bounceMin: STANDARD_PHYSICS.bounceMinMps,
  bounceMaxHeight: Infinity,
  airAngularDrag: AIR_ANGULAR_DRAG_S,
  airAngularSpeedMax: Infinity,
  gripLost: false,
  traverseMax: 0,
  gunArc: Infinity,
  acceleration: 0,
  baseRate: 0,
  brakeCap: 0,
  brakeRate: 0,
  speedLimit: 0,
  targetSpeed: 0,
  rate: 0,
  spoolTarget: 0,
};

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : (x > hi ? hi : x);
}

/** Wrap an angle to (-π, π]. */
function wrapAngle(a: number): number {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Move `cur` toward `target` by at most `maxDelta` (no overshoot). */
function approach(cur: number, target: number, maxDelta: number): number {
  const d = target - cur;
  if (d > maxDelta) return cur + maxDelta;
  if (d < -maxDelta) return cur - maxDelta;
  return target;
}

/** Move angle `cur` toward angle `target` along the shortest arc by ≤ `maxDelta`. */
function chaseAngle(cur: number, target: number, maxDelta: number): number {
  const d = wrapAngle(target - cur);
  if (d > maxDelta) return wrapAngle(cur + maxDelta);
  if (d < -maxDelta) return wrapAngle(cur - maxDelta);
  return wrapAngle(target);
}

/** Capability-derived climb penalty / downhill bonus for v_target. */
function slopeSpeedFactor(
  spec: MovementSpec,
  groundType: string,
  pitchAlongRad: number,
  powerMult: number,
  accelMult: number,
): number {
  const pitchDeg = pitchAlongRad * RAD2DEG;
  if (pitchDeg > 0) {
    return uphillDriveMargin(
      spec, groundType, pitchAlongRad, powerMult, accelMult,
    );
  }
  return 1 + Math.min(-pitchDeg / 45, DOWNHILL_BONUS_CAP);
}

function applyModuleDebuffs(
  modules: Record<string, MovementModuleState | undefined> | undefined,
  out: MovementDebuffs,
): void {
  if (!modules) return;
  const engine = modules.engine;
  if (engine?.state === 'red') out.immobile = true;
  else if (engine?.state === 'yellow') out.powerMult = ENGINE_YELLOW_POWER_MULT;

  const transmission = modules.transmission;
  if (transmission?.state === 'red') {
    out.powerMult *= 0.3;
    out.accelMult *= 0.45;
    out.traverseMult *= 0.45;
  } else if (transmission?.state === 'yellow') {
    out.powerMult *= 0.72;
    out.accelMult *= 0.75;
    out.traverseMult *= 0.75;
  }

  if (modules.trackL?.state === 'red' || modules.trackR?.state === 'red') {
    out.immobile = true;
  }
  const ring = modules.turretRing || modules.gunMount;
  if (ring?.state === 'red') out.turretMult = 0.2;
  else if (ring?.state === 'yellow') out.turretMult = 0.5;
  out.gunYellow = modules.gun?.state === 'yellow' || modules.gunMount?.state === 'yellow';
}

function applyCrewDebuffs(
  crew: Record<string, boolean | undefined> | undefined,
  out: MovementDebuffs,
): void {
  if (!crew) return;
  if (crew.driver === false) {
    out.accelMult = DRIVER_DEAD_MULT;
    out.traverseMult = DRIVER_DEAD_MULT;
  }
  if (crew.gunner === false) out.aimTimeMult = GUNNER_DEAD_AIMTIME_MULT;
}

function applyEquipmentDebuffs(
  equipment: MovementCombatState['equipMults'],
  out: MovementDebuffs,
): void {
  if (!equipment) return;
  if (typeof equipment.traverse === 'number') out.traverseMult *= equipment.traverse;
  if (typeof equipment.turret === 'number') out.turretMult *= equipment.turret;
  if (typeof equipment.aimTime === 'number') out.aimTimeMult *= equipment.aimTime;
  if (typeof equipment.bloom === 'number') out.bloomMult = equipment.bloom;
}

/**
 * Extract movement-relevant debuffs from a CombatState per the locked table in
 * ARCHITECTURE §2.4. `combat == null` ⇒ fully healthy.
 */
function readDebuffs(
  combat: MovementCombatState | null | undefined,
  out: MovementDebuffs,
): MovementDebuffs {
  out.immobile = combat?.destroyed === true;
  out.wreck = out.immobile;
  out.powerMult = 1;
  out.accelMult = 1;
  out.traverseMult = 1;
  out.turretMult = 1;
  out.aimTimeMult = 1;
  out.gunYellow = false;
  out.bloomMult = 1;
  if (!combat) return out;
  applyModuleDebuffs(combat.modules, out);
  applyCrewDebuffs(combat.crew, out);
  // Equipment multipliers stack with damage and crew effects.
  applyEquipmentDebuffs(combat.equipMults, out);
  return out;
}

/** Hull-local height of the gun trunnion above ground contact (for aim angles). */
function gunPivotHeight(spec: MovementSpec): number {
  const a = spec.armor;
  if (a && a.turretPivot && a.gunPivot) return a.turretPivot[1] + a.gunPivot[1];
  return spec.dims.heightM * 0.85;
}

const _endGuards = new WeakMap<object, readonly number[] | null>();

/** The lowest closed-shell point of each hull end in three lateral bins (hull-local xyz triples), cached per spec. */
function hullEndGuards(spec: MovementSpec): readonly number[] | null {
  const cached = _endGuards.get(spec);
  if (cached !== undefined) return cached;
  const hull = spec.armor?.bodyContactPoints?.hull;
  let guards: number[] | null = null;
  if (Array.isArray(hull) && hull.length >= 3) {
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < hull.length; i += 3) { minY = Math.min(minY, hull[i]); maxY = Math.max(maxY, hull[i]); }
    const midY = 0.5 * (minY + maxY);
    const reach = END_GUARD_SPAN_FRAC * spec.dims.hullLengthM;
    // six bins: end (rear, front) × side (left, centre, right); keep each bin's point below mid-height that a hull
    // pitched toward that end touches first (the lowest, favouring the furthest out at END_GUARD_LEAN)
    const best = new Array<number>(6).fill(-1);
    const bestScore = new Array<number>(6).fill(Infinity);
    for (let i = 0; i + 2 < hull.length; i += 3) {
      const x = hull[i], y = hull[i + 1], z = hull[i + 2];
      if (Math.abs(z) <= reach || y >= midY || y < END_GUARD_MIN_Y_M) continue;
      const bin = (z > 0 ? 3 : 0) + (x < -END_GUARD_SIDE_X_M ? 0 : x > END_GUARD_SIDE_X_M ? 2 : 1);
      const score = y - END_GUARD_LEAN * Math.abs(z);
      if (score < bestScore[bin]) { bestScore[bin] = score; best[bin] = i; }
    }
    const picked = best.filter((index) => index >= 0);
    if (picked.length) guards = picked.flatMap((index) => [hull[index], hull[index + 1], hull[index + 2]]);
  }
  const frozen = guards ? Object.freeze(guards) : null;
  _endGuards.set(spec, frozen);
  return frozen;
}

/**
 * Sample one frame-local closed-shell point cloud against terrain after the
 * exact rendered hull YXZ transform. Turret-local clouds pass their pivot and
 * yaw; hull-local clouds use the defaults. Arrays are flat xyz triples so the
 * rollover-only fixed-step path performs no allocation.
 */
function pointCloudSupportY(
  points: readonly number[] | null | undefined,
  hAt: HeightSampler,
  px: number,
  pz: number,
  hullCosYaw: number,
  hullSinYaw: number,
  hullCosPitch: number,
  hullSinPitch: number,
  hullCosRoll: number,
  hullSinRoll: number,
  frameCosYaw = 1,
  frameSinYaw = 0,
  pivotX = 0,
  pivotY = 0,
  pivotZ = 0,
): number {
  if (!Array.isArray(points) || points.length < 3) return -Infinity;
  let supportY = -Infinity;
  for (let i = 0; i + 2 < points.length; i += 3) {
    const localX = pivotX + points[i] * frameCosYaw + points[i + 2] * frameSinYaw;
    const localY = pivotY + points[i + 1];
    const localZ = pivotZ - points[i] * frameSinYaw + points[i + 2] * frameCosYaw;
    const rolledX = localX * hullCosRoll - localY * hullSinRoll;
    const rolledY = localX * hullSinRoll + localY * hullCosRoll;
    const pitchedZ = rolledY * hullSinPitch + localZ * hullCosPitch;
    const worldX = px + rolledX * hullCosYaw + pitchedZ * hullSinYaw;
    const worldZ = pz - rolledX * hullSinYaw + pitchedZ * hullCosYaw;
    const worldYOffset = rolledY * hullCosPitch - localZ * hullSinPitch;
    const deficit = hAt(worldX, worldZ) - worldYOffset;
    if (deficit > supportY) supportY = deficit;
  }
  return supportY;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a fresh TankState (ARCHITECTURE §2.4) for a tank at rest.
 *
 * @param {object} spec - TankSpec (specs.ts schema, ARCHITECTURE §2.2).
 * @param {Vector3} pos - World spawn position (copied; y snaps to terrain on first update).
 * @param {number} yaw - Hull yaw in radians (0 faces world +Z).
 * @returns {object} TankState owned by this module.
 */
export function createTankState(spec: MovementSpec, pos: Vector3, yaw: number): TankState {
  if (!spec || !spec.dims || !spec.gun || !spec.terrainResistance) {
    throw new Error('movement.createTankState: malformed TankSpec');
  }
  const aim = new Vector3(
    pos.x + Math.sin(yaw) * 250,
    pos.y + gunPivotHeight(spec),
    pos.z + Math.cos(yaw) * 250,
  );
  return {
    pos: pos.clone(),
    yaw: wrapAngle(yaw),
    speed: 0,
    verticalSpeed: 0,
    grounded: true,
    landingImpactMps: 0,
    slopeBlocked: false,
    yawRate: 0,
    visualPitch: 0,
    visualRoll: 0,
    overturned: false,
    rolloverCountdownS: 0,
    turretYaw: 0,
    gunPitch: 0,
    turretYawRate: 0,
    aimPoint: aim,
    bloomF: 1,
    trackScroll: { l: 0, r: 0 },
    atGunLimit: false,
    gunLimitSpec: false, // GUN LIMIT label flag (see GUN_LIMIT_LABEL_DIST_M)
    suspensionAim: false,
    suspensionAimPitch: 0,
    // r2 blocked-drive impact telemetry: closing speed (m/s) the collision
    // pushback absorbed this tick (0 = no blocked contact). state.ts reads it
    // right after updateTank to emit ONE 'tank:impact' bus event per hit.
    impactMps: 0,
    impactSource: IMPACT_SOURCE_NONE,
    impactNx: 0,
    impactNz: 0,
    _spring: {
      pitch: 0, roll: 0, pitchV: 0, rollV: 0, // attitude spring state
      recoilVX: 0, recoilVZ: 0,               // decaying hull translation impulse
    },
    _prevSpeed: 0,
    _spool: 0,                     // engine torque spool 0..1 (SPOOL_S ramp)
    _terr: { pitch: 0, roll: 0, fitPitch: 0, tipPitch: 0, tipRoll: 0 },  // last terrain plane fit (spring target source)
    _fanYield: 0,                  // slew-limited wheel-line yield (support solve)
    _perch: 0,                     // 0..1 single-end perch factor (spring boost)
    _gunLimitHoldS: 0,             // continuous-pin dwell for the GUN LIMIT label
    _autoTraverse: 0,              // ±1 while a fixed-mount hull traverse is engaged toward the sight (round 32)
    _swayEst: 0,                   // predicted visual turn-lean sway (rad)
    _susp: { p: 0, r: 0, pv: 0, rv: 0, d: 0, dv: 0 }, // mirror of the visual susp rock layer
    _flinch: { p: 0, r: 0, pv: 0, rv: 0 }, // hit-flinch rock (impulses fed by the visual)
    _ride: { // sprung vertical chassis motion + deterministic airborne phase
      y: pos.y, v: 0, supportY: NaN, groundV: 0, grounded: true, airTime: 0, bounces: 0, rebound: 0, stroke: 0,
    },
    _body: { // rigid attitude/contact state; dormant during ordinary driving
      tumbling: false, landingBlendS: 0, dynamicSupport: false, autoRighting: false, restSupportY: NaN,
    },
    _rollover: { elapsedS: 0, expired: false },
    _groundType: 'medium',
    _debuff: { // reused hot-loop output; readDebuffs allocates nothing per tick
      immobile: false,
      wreck: false,
      powerMult: 1,
      accelMult: 1,
      traverseMult: 1,
      turretMult: 1,
      aimTimeMult: 1,
      gunYellow: false,
      bloomMult: 1,
    },
    _sup: {                        // static-pose support cache (skip resampling)
      x: NaN, z: NaN, yaw: 0, pitch: 0, roll: 0,
      y: pos.y, floorY: pos.y, rigid: false, cg: null,
    },
  };
}

/**
 * Re-seed vertical contact after an integration-owned teleport or authored
 * pose change. This keeps tools and respawn code from leaving the ballistic
 * phase at the pre-teleport position.
 */
export function resetTankVerticalState(
  state: TankState | null | undefined,
  y: number = state?.pos?.y ?? Number.NaN,
  verticalSpeed = 0,
  grounded = true,
): void {
  if (!state || !state.pos || !Number.isFinite(y)) {
    throw new TypeError('movement.resetTankVerticalState: valid state and y are required');
  }
  state.pos.y = y;
  state.verticalSpeed = Number.isFinite(verticalSpeed) ? verticalSpeed : 0;
  state.grounded = grounded !== false;
  state.landingImpactMps = 0;
  const ride = state._ride;
  ride.y = y;
  ride.v = state.verticalSpeed;
  ride.supportY = NaN;
  ride.groundV = 0;
  ride.grounded = state.grounded;
  ride.airTime = 0;
  ride.bounces = 0;
  ride.rebound = 0;
  ride.stroke = 0;
  state._sup.x = NaN;
  state._body.landingBlendS = 0;
  state._body.dynamicSupport = false;
  state._body.restSupportY = NaN;
  if (grounded !== false && !state.overturned) state._body.tumbling = false;
}

function initializeRideState(state: TankState, supportY: number): RideState {
  const ride = state._ride;
  state.landingImpactMps = 0;
  if (!Number.isFinite(ride.y)) ride.y = state.pos.y;
  if (!Number.isFinite(ride.v)) ride.v = 0;
  if (Number.isFinite(ride.supportY)) return ride;

  // Fresh spawns are authored on terrain. Authority reconciliation may seed
  // an airborne pose, whose Y, vertical speed, and phase must remain intact.
  if (state.grounded !== false) {
    ride.y = supportY;
    ride.v = 0;
    ride.grounded = true;
  }
  ride.supportY = supportY;
  ride.groundV = 0;
  return ride;
}

function updateRideSupportVelocity(ride: RideState, supportY: number, dt: number): void {
  const rawGroundV = clamp(
    (supportY - ride.supportY) / dt,
    -RIDE_SUPPORT_V_FALL_CAP,
    RIDE_SUPPORT_V_CAP,
  );
  _supportRate = rawGroundV;
  const groundAlpha = 1 - Math.exp(-dt / RIDE_GROUND_V_TAU);
  ride.groundV += (rawGroundV - ride.groundV) * groundAlpha;
  ride.supportY = supportY;
}

/**
 * Ballistic flight and the landing. The contact is SWEPT inside the step: the fraction of the step at which the
 * ride crossed the contact line gives the true closing speed (not the post-step value a 40 m/s fall would read
 * 0.67 m past the ground), and the remainder of the step is integrated after the contact — so a rebound is the
 * same at any step size and the ride never ends a step below the contact line. Impact physics (2026-09-25): the
 * closing speed rebounds by the ruleset's restitution; a rebound under bounceMin settles and the loaded
 * suspension takes over (the old contact killed every landing's vertical speed on touch, so nothing ever bounced,
 * not even at 0.17 g).
 */
function advanceAirborneRide(
  state: TankState,
  ride: RideState,
  dt: number,
  contactY: number,
  floorY: number,
  gravityScale: number,
  restitution: number,
  bounceMin: number,
  bounceMaxHeight: number,
): boolean {
  const gravity = GRAVITY * gravityScale;
  const yBefore = ride.y;
  const vBefore = ride.v;
  ride.v -= gravity * dt;
  ride.y += ride.v * dt;
  ride.airTime = (ride.airTime || 0) + dt;
  // A rising hull must not be grabbed back out of flight by a ramp below it — but it is never let through its hard
  // floor (full compression, the rigid shell) either. Physics lane (2026-10-03): the rising test used to skip the
  // contact entirely, so a hull turning nose-up while it still rose buried its tail in the ground below (a 1.2 m step
  // at the Moon: 1.5 m deep for 0.7 s) and was then lifted 2 m in a single tick when it stopped rising.
  const rising = ride.v > ride.groundV + RIDE_DETACH_REL_V_MPS;
  if (ride.y >= floorY && (ride.y > contactY || rising)) return false;
  // Crossing the drooped tracks' line from above is a swept landing on that line. A ride that is already at or below
  // the line (the line came up past it: the hull turned, or the ground rose under it) is in contact where it is: it is
  // lifted only as far as its floor, never up to the droop line (that seat used to pop a slow or turning hull up to
  // 26 cm in one tick).
  const crossed = !rising && yBefore > contactY;
  const span = yBefore - ride.y;
  const fraction = crossed && span > 1e-9 ? clamp((yBefore - contactY) / span, 0, 1) : 0;
  const vAtContact = vBefore - gravity * fraction * dt;
  const closing = Math.max(0, ride.groundV - vAtContact);
  state.landingImpactMps = closing;
  const seat = crossed ? Math.max(contactY, floorY) : Math.max(Math.min(ride.y, contactY), floorY);
  const rebound = Math.min(closing * restitution, Math.sqrt(2 * gravity * bounceMaxHeight));
  ride.airTime = 0;
  ride.rebound = 0;
  ride.stroke = 0;
  if (state._body.tumbling || Math.cos(state.visualPitch) * Math.cos(state.visualRoll) <= TUMBLE_ENTER_UP_Y) {
    // A hull coming down on its shell (tumbling, on its side, on its roof) has no springs under it: the armour rebounds
    // at once by the ruleset's restitution, or stops the closing at the contact.
    if (rebound > bounceMin) {
      const rest = (1 - fraction) * dt;
      const vOut = ride.groundV + rebound;
      ride.v = vOut - gravity * rest;
      ride.y = Math.max(seat, seat + vOut * rest - 0.5 * gravity * rest * rest);
      ride.bounces = (ride.bounces || 0) + 1;
      return false;
    }
    ride.y = seat;
    if (closing > LANDING_STOP_MPS && ride.v < ride.groundV) ride.v = ride.groundV;
    ride.bounces = 0;
    return true;
  }
  // A landing on the tracks is the suspension's (physics lane, 2026-10-03; gauntlet wave 2). The rebound used to reverse
  // the hull at the drooped-track line like a rigid ball, its wheels still hanging, and a landing that did not rebound
  // stopped dead at that line before the springs took any load. The ride now carries its closing into the springs at the
  // landing stroke's damping (the floor, full compression, stops what they cannot), and the rebound the ruleset's
  // restitution owes is paid when the springs have stopped the fall and extend again (constrainLoadedRide): the hull
  // dips onto its suspension and rises off it.
  ride.y = seat;
  ride.rebound = rebound > bounceMin ? rebound : 0;
  ride.stroke = closing > LANDING_STROKE_MIN_MPS ? 1 : 0;
  if (ride.rebound === 0) ride.bounces = 0;
  return true;
}

function constrainLoadedRide(
  ride: RideState,
  supportY: number,
  contactY: number,
  floorY: number,
  dt: number,
  gravity: number,
  slopeFollowMps: number,
): boolean {
  let hang = ride.y - contactY;
  // A hull running down a grade keeps its tracks on it: the ground falls away under it at its own travel's rate over
  // the slope, and it follows that much as surface, not as a fall (physics lane, 2026-10-03). Only ground that curves
  // away faster is a flight; a hull sliding down a 45-degree face left it and bounced down it, unable to steer or stop.
  // (only a hang the grade's own descent this tick explains: ground that dropped away further is a drop, and flies)
  // (and only a ride that is not still rising: one going up over a crest cannot be pulled down the far face, it flies)
  // (the follow is the ride's own velocity, integrated once below: a pull of the position as well moved the hull twice
  // the grade's rate in a tick, a 0.17 m vertical pop entering a 32-degree flank)
  if (hang > 0 && slopeFollowMps > 0 && ride.v <= 0 && hang <= 2 * slopeFollowMps * dt + RIDE_DETACH_CLEARANCE_M) {
    if (ride.v > -slopeFollowMps) ride.v = -slopeFollowMps;
    hang = Math.max(0, hang - slopeFollowMps * dt);
  }
  // A landing's rebound comes out of the springs (physics lane, 2026-10-03; gauntlet wave 2). The loaded law below takes
  // the landing's closing; once the springs have stopped the hull's fall into them they extend and throw it off the
  // drooped tracks' line at the rebound the ruleset's restitution owes. On the way up they act as a spring whose free
  // length is that line, as stiff as the depth below it needs to return the rebound (energy: ½r² = ½u² + ½k·h² − g·h at
  // depth h and relative rate u), so their push fades to nothing at the line and the hull leaves it on gravity alone.
  // Ground that moves faster than the rebound leaves none to return: a hull landing on a face it then runs down, or one
  // the ground lifts (a trench's far wall under its nose carried a hull up at 5 m/s, and the rebound added on top of
  // that threw it a metre out of the trench).
  if (ride.rebound > 0 && Math.abs(ride.groundV) > ride.rebound) ride.rebound = 0;
  // the landing stroke ends once the springs have carried the hull back up through its seat
  if (ride.stroke > 0 && ride.y >= supportY && ride.v >= ride.groundV) ride.stroke = 0;
  const extending = ride.rebound > 0 && ride.v - ride.groundV >= -REBOUND_TURN_MPS;
  const separating = ride.v - ride.groundV > RIDE_DETACH_REL_V_MPS;
  // A ride still closing on ground that sinks away slower than it falls is in contact: it meets that ground within the
  // step (physics lane, 2026-10-03). A hull landing nose-first, its support sinking as it turned level about its nose,
  // lost the ground every other tick and landed again at full speed: nine landings at 13-14 m/s in a sixth of a second
  // off a 10 m cliff, 4044 hp, where the springs take the one landing.
  const closingGap = Math.max(0, ride.groundV - ride.v) * dt;
  if (!extending && hang > RIDE_DETACH_CLEARANCE_M + closingGap && (separating || hang > RIDE_HANG_M)) {
    // the step that leaves the ground is the flight's first: the ride moves through it on gravity alone (it used to
    // stand still for the step, a 13 cm stall in the motion of a hull leaving a face at 8 m/s)
    ride.v -= gravity * dt;
    ride.y += ride.v * dt;
    ride.airTime = 0;
    ride.stroke = 0;
    return false;
  }

  ride.airTime = 0;
  // Physics lane (2026-10-03): the ground pushes, it never pulls. Past the tracks' full droop the suspension carries
  // nothing, so the ride falls no faster than gravity and is not snapped back down onto the droop line: the kinematic
  // spring used to drag a hull down a support that fell away (a hull leaving a 30 m cliff at 15 m/s stuck to the face
  // and followed it at 35 m/s, faster than it could fall) and glued every hull to the ground over crests at any gravity.
  // Inside the droop the suspension extends to keep the tracks on the ground, as before.
  let accel: number;
  if (extending) {
    const depth = contactY - ride.y;
    const u = ride.v - ride.groundV;
    const r = ride.rebound;
    if (depth > Math.max(u, r) * dt) {
      accel = Math.max(0, r * r - u * u + 2 * gravity * depth) / depth - gravity;
    } else {
      // the last step to the line: it leaves the line at the rebound, gravity alone acting over what remains
      ride.v = ride.groundV + Math.sqrt(r * r + 2 * gravity * Math.max(0, depth));
      accel = 0;
    }
  } else {
    const zeta = ride.stroke > 0 ? LANDING_ZETA : RIDE_ZETA;
    accel = RIDE_OMEGA * RIDE_OMEGA * (supportY - ride.y) + 2 * zeta * RIDE_OMEGA * (ride.groundV - ride.v);
    if (hang > 0 && accel < -gravity) accel = -gravity;
    // The bump stops are progressive (physics lane, 2026-10-03): a fall the springs would not stop in the travel left
    // above the floor is stopped across that travel, not at the floor in one step (a hull bottoming at 9 m/s used to
    // halt dead there, a velocity step the size of the fall). The springs' own work over that travel (linear from here
    // to the floor) is what they stop: a slower fall is theirs alone (a hull sliding down a 48-degree face, its ride a
    // little behind its sinking support, was held up by the stops and floated off the face every few steps).
    const closingOnFloor = ride.groundV - ride.v;
    const room = ride.y - floorY;
    if (closingOnFloor > 0 && room > 0) {
      const springWork = RIDE_OMEGA * RIDE_OMEGA * ((supportY - ride.y) * room + 0.5 * room * room);
      if (0.5 * closingOnFloor * closingOnFloor > springWork) {
        const stop = closingOnFloor * closingOnFloor / (2 * Math.max(room, BUMP_STOP_MIN_ROOM_M));
        if (accel < stop) accel = Math.min(stop, closingOnFloor / dt);
      }
    }
  }
  ride.v += accel * dt;
  ride.y += ride.v * dt;
  if (ride.y < floorY) {
    ride.y = floorY;
    // a floor that stops falling stops the ride's fall with it this step (the smoothed ground rate lags it: a hull
    // bottoming out at the foot of a 32-degree flank at 22 m/s was lifted by the floor 9 cm a tick while its velocity
    // still read the fall); a rising floor carries it at the smoothed rate, as before (a face struck by the nose pushes
    // the nose, not the whole hull, at its own rate)
    const floorV = Math.max(ride.groundV, Math.min(_supportRate, Math.max(ride.groundV, 0)));
    if (ride.v < floorV) ride.v = floorV;
    return true;
  }
  if (extending && ride.y > contactY) {
    // off the line: in flight once clear of it (this step's motion kept, no stall at the lift-off)
    ride.rebound = 0;
    ride.stroke = 0;
    ride.bounces = (ride.bounces || 0) + 1;
    return ride.y - contactY <= RIDE_DETACH_CLEARANCE_M;
  }
  if (ride.y <= contactY) return true;
  if (ride.v - ride.groundV > RIDE_DETACH_REL_V_MPS) {
    ride.stroke = 0;
    return false;
  }
  // hanging on the drooped tracks: grounded while the wheels still reach (RIDE_HANG_M), in flight beyond
  return ride.y - contactY <= RIDE_HANG_M;
}

function updateVerticalContact(state: TankState, groundedAtStart: boolean, dt: number, drive: DriveStep): void {
  // a hull resting on another hull's roof stands on it: that roof is its ground until it drives off the edge
  const rest = state._body.restSupportY;
  const terrainSupportY = state._sup.y;
  const supportY = Number.isFinite(rest) ? Math.max(terrainSupportY, rest) : terrainSupportY;
  const terrainFloorY = Number.isFinite(state._sup.floorY) ? state._sup.floorY : terrainSupportY;
  const floorY = Number.isFinite(rest) ? Math.max(terrainFloorY, rest) : terrainFloorY;
  const ride = initializeRideState(state, supportY);
  let groundTurn = 0;
  if (groundedAtStart) {
    // a blow that took the hull's travel takes the climb (or descent) that travel carried (_blockedSpeed)
    if (_blockedSpeed > 0) {
      const kept = 1 - _blockedSpeed / (_blockedSpeed + Math.abs(state.speed));
      ride.v *= kept;
      ride.groundV *= kept;
    }
    // a gravity tip turns the hull about the contact it rests on: the root follows the turn down, and the support's
    // velocity does not carry it (_rotationDrop)
    if (_tippedThisTick && _rotationDrop > 0 && ride.y > supportY && Number.isFinite(ride.supportY)) {
      const follow = Math.min(_rotationDrop, ride.y - supportY);
      ride.y -= follow;
      ride.supportY -= follow;
    }
    const groundVStart = ride.groundV;
    updateRideSupportVelocity(ride, supportY, dt);
    groundTurn = ride.groundV - groundVStart;
  } else {
    // The support envelope changes when an airborne hull rotates. That is
    // geometry, not a moving floor. The bounded low-gravity rules must not
    // feed that motion back into the next bounce: their ground stands still.
    // Standard rules keep the ground rising or falling under the hull's own
    // travel (its speed over the slope beneath it), never its turning (physics
    // lane, 2026-10-03, Sirocco Wadi seed 57001: an M1A2 on its side yawing over
    // a 40-degree face read the envelope's 5.5 m/s as a rising floor, landed at
    // 12.8 m/s from a 2.8 m drop — 922 hp where its own 7.3 m/s costs 33 — and
    // rebounded at 7.2 m/s). Ground falling away under the travel falls as fast as it does (the launch cap bounds only a
    // rising one): a hull flying down a 45-degree flank at 14.6 m/s read the flank falling at 12, and landed on it 2.6 m/s
    // harder than its own approach.
    ride.supportY = supportY;
    ride.groundV = Number.isFinite(drive.bounceMaxHeight)
      ? 0
      : clamp(state.speed * _airGrade, -RIDE_SUPPORT_V_FALL_CAP, RIDE_SUPPORT_V_CAP);
  }
  const contactY = supportY + RIDE_DROOP_M;
  const grounded = groundedAtStart
    ? constrainLoadedRide(ride, supportY, contactY, floorY, dt, GRAVITY * drive.gravityScale,
      _wholeTrackOnGround ? Math.max(0, -state.speed * Math.tan(state._terr.pitch)) : 0)
    : advanceAirborneRide(state, ride, dt, contactY, floorY, drive.gravityScale, drive.restitution, drive.bounceMin, drive.bounceMaxHeight);
  if (groundedAtStart) {
    // a hull turning about its own axes (settling from a tumble, righting) moves its support by geometry, not by travel
    // over a grade, and a hull sliding on a face its tracks cannot hold moves along it under the slide law
    if (_wholeTrackOnGround && !state._body.tumbling && !state._body.autoRighting && !drive.gripLost) {
      turnAlongGrade(state, groundTurn);
    }
  } else if (state.landingImpactMps > 0) {
    landAlongGrade(state, ride);
  }
  state.grounded = grounded;
  ride.grounded = grounded;
  state.verticalSpeed = ride.v;
  state.pos.y = ride.y;
}

/** The weighted z-variance of supporting samples that span a pitch (a 1.5 m run: L²/12). */
const FIT_MIN_SPAN_ZZ = 1.5 * 1.5 / 12;

/** The steepest grade the turn reads (a face past it is a wall; cliffAhead and the grade rule own it). */
const GRADE_PUSH_MAX = Math.tan(60 * Math.PI / 180);
/** Below this travel the turn is nothing to see, and clipping it at zero would ratchet a crawl up a face. */
const GRADE_PUSH_MIN_TRAVEL_MPS = 1;

/**
 * The ground pushes along its normal (physics lane, 2026-10-03; Titan Gorge, Caldera CTF seed 0): the vertical speed a
 * grade gives a hull turns its travel, it does not add to it. Without the turn a hull's travel climbed for free:
 * driving at 9 m/s up a face steepening to 38 degrees it rose at 8.4 m/s with all its travel kept and flew 1.9 m off
 * the crest, and a hull falling at 9 m/s onto a 36 % upslope at 15 m/s rebounded at +6.6 m/s (the ground's rise under
 * its undiminished travel, plus the rebound) still at 15 m/s.
 *
 * Loaded on the ground, a change in the rate the ground lifts the hull at (the support's vertical speed under its
 * travel) moves the travel the other way by the grade, ds = -tan θ · dv: a grade taken gradually turns the velocity at
 * constant magnitude (travel × cos θ), one taken at once loses the plastic share (travel × cos² θ), and a crest the
 * hull stays on gives the travel back. The support's rate, not the ride's, so the suspension's swings move nothing.
 * The travel never passes through zero, and a crawl under a metre a second is left alone (a turn clipped at zero and
 * given back on the swing ratcheted a hull up a 45-degree face). Only a hull whose whole track is on the ground turns:
 * the plane of a partial contact (an edge, a trench wall its nose meets) is not a grade it travels along. In flight
 * nothing touches it.
 */
function turnAlongGrade(state: TankState, groundTurn: number): void {
  if (!(groundTurn !== 0) || !Number.isFinite(groundTurn)) return;
  shiftTravelAlongGrade(state, groundTurn);
}

/**
 * A landing on a face rising in the travel's direction is a normal impulse (turnAlongGrade's rule above): of the
 * vertical change the landing law owes (the closing, and the rebound) the travel gives up its share at the contact, and
 * the springs then take the hull to the ground's rise under the travel it kept and return the rebound over that (the
 * vertical part, cos² θ of the law's). A landing on a face falling away keeps the vertical law and the travel (the
 * drive, not the fall, decides how fast a hull runs downhill).
 */
function landAlongGrade(state: TankState, ride: RideState): void {
  // the vertical change the landing law owes: the closing the springs take to the ground's rate, and the rebound
  const push = state.landingImpactMps + ride.rebound;
  if (!(push > 0) || Math.abs(state.speed) < GRADE_PUSH_MIN_TRAVEL_MPS) return;
  const grade = clamp(Math.tan(state._terr.fitPitch), -GRADE_PUSH_MAX, GRADE_PUSH_MAX);
  if (!(grade * state.speed > 0)) return;
  shiftTravelAlongGrade(state, push / (1 + grade * grade));
  // the springs close to the ground's rise under the travel it kept
  ride.groundV = state.speed * grade;
}

function shiftTravelAlongGrade(state: TankState, rise: number): void {
  if (Math.abs(state.speed) < GRADE_PUSH_MIN_TRAVEL_MPS) return;
  const grade = clamp(Math.tan(state._terr.fitPitch), -GRADE_PUSH_MAX, GRADE_PUSH_MAX);
  if (grade === 0) return;
  const next = state.speed - grade * rise;
  const kept = state.speed > 0 ? Math.max(0, next) : Math.min(0, next);
  // the turn is not a braking or a launch of the drive: the inertial pitch reads the drive's change, not this one
  state._prevSpeed += kept - state.speed;
  state.speed = kept;
}

function solveGunLay(
  spec: MovementSpec,
  state: TankState,
  aim: Vector3,
  out: GunLaySolution,
): GunLaySolution {
  // Exact inverse YXZ composition keeps the articulated bore, shell origin,
  // reticle, and authoritative hit ray on one pose even on compound slopes.
  _hullEuler.set(-state.visualPitch, state.yaw, state.visualRoll, 'YXZ');
  _hullQuat.setFromEuler(_hullEuler);
  const turretPivot = spec.armor?.turretPivot;
  const gunPivot = spec.armor?.gunPivot;
  _gunOriginWorld.set(
    gunPivot?.[0] ?? 0,
    gunPivot?.[1] ?? spec.dims.heightM * 0.15,
    gunPivot?.[2] ?? 0,
  ).applyAxisAngle(_worldUp, state.turretYaw).add(_turretPivotLocal.set(
    turretPivot?.[0] ?? 0,
    turretPivot?.[1] ?? spec.dims.heightM * 0.7,
    turretPivot?.[2] ?? 0,
  )).applyQuaternion(_hullQuat).add(state.pos);

  const dx = aim.x - _gunOriginWorld.x;
  const dy = aim.y - _gunOriginWorld.y;
  const dz = aim.z - _gunOriginWorld.z;
  out.horizontalDistance = Math.hypot(dx, dz);
  out.worldPitch = Math.atan2(dy, Math.max(out.horizontalDistance, 1e-6));
  _aimLocal.set(dx, dy, dz).applyQuaternion(_hullQuat.conjugate());
  _hullQuat.conjugate();
  const localHorizontal = Math.hypot(_aimLocal.x, _aimLocal.z);
  out.turretYaw = localHorizontal > 1e-6
    ? Math.atan2(_aimLocal.x, _aimLocal.z)
    : state.turretYaw;
  out.gunPitch = Math.atan2(_aimLocal.y, Math.max(localHorizontal, 1e-6));
  return out;
}

function updateGunLimitDwell(state: TankState, labelWanted: boolean, dt: number): void {
  state._gunLimitHoldS = labelWanted ? (state._gunLimitHoldS || 0) + dt : 0;
  state.gunLimitSpec = state._gunLimitHoldS >= GUN_LIMIT_LABEL_DWELL_S;
}

/**
 * round 32 (owner 2026-09-21): a fixed-mount yaw pin is a LIMIT, not a lag. The hull closes on an off-arc sight
 * by itself and the single reticle shows the gun-true point sliding home, so the red tint is reserved for a
 * sight the hull cannot bring in: the player steering against it, or immobilised tracks.
 */
function fixedMountYawPinned(state: TankState, steer: number, debuff: MovementDebuffs): boolean {
  return state._autoTraverse !== 0 && (steer !== 0 || debuff.immobile);
}

function updateHydraulicGunLay(
  spec: MovementSpec,
  state: TankState,
  debuff: MovementDebuffs,
  solution: GunLaySolution,
  steer: number,
  dt: number,
): void {
  state.turretYaw = 0;
  state.gunPitch = 0;
  const hydraulicAim = spec.hydropneumaticAim;
  const noseDown = (hydraulicAim?.noseDownDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_DOWN_DEG) * DEG2RAD;
  const noseUp = (hydraulicAim?.noseUpDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_UP_DEG) * DEG2RAD;
  // round 32: the envelope test asks how much suspension pitch the sight NEEDS — its world elevation against
  // the bore's world pitch (solveGunLay just left the hull pose in _hullQuat) — the same yaw-independent
  // measure the suspension controller uses. The old hull-space gunPitch read a level sight astern of a
  // nose-up hull as steeply UP and pinned the reticle through every turn-around.
  _turretForwardWorld.set(0, 0, 1).applyQuaternion(_hullQuat);
  const borePitch = Math.asin(clamp(_turretForwardWorld.y, -1, 1));
  const requestedPitch = state.suspensionAimPitch + solution.worldPitch - borePitch;
  const yawPinned = fixedMountYawPinned(state, steer, debuff);
  const pitchPinned = !state.suspensionAim ||
    requestedPitch < -noseDown - 1e-4 || requestedPitch > noseUp + 1e-4;
  state.atGunLimit = yawPinned || pitchPinned;
  const labelWanted = Math.abs(steer) < 0.2 && state.atGunLimit &&
    solution.horizontalDistance >= GUN_LIMIT_LABEL_DIST_M;
  updateGunLimitDwell(state, labelWanted, dt);
}

function clampCasemateYaw(
  state: TankState,
  gunArc: number,
  steer: number,
  debuff: MovementDebuffs,
): boolean {
  if (gunArc === Infinity) return false;
  state.turretYaw = clamp(state.turretYaw, -gunArc, gunArc);
  return fixedMountYawPinned(state, steer, debuff);
}

function minimumTerrainGunPitch(
  spec: MovementSpec,
  state: TankState,
  hAt: HeightSampler,
  mechanicalLow: number,
  mechanicalHigh: number,
): number {
  const barrelLength = spec.armor?.gunBarrel?.lengthM ?? 0;
  if (barrelLength <= 1) return mechanicalLow;
  _hullUpWorld.set(0, 1, 0).applyQuaternion(_hullQuat);
  _turretForwardWorld.set(
    Math.sin(state.turretYaw),
    0,
    Math.cos(state.turretYaw),
  ).applyQuaternion(_hullQuat);
  _gunWorldDir.copy(_hullUpWorld).multiplyScalar(Math.sin(state.gunPitch))
    .addScaledVector(_turretForwardWorld, Math.cos(state.gunPitch));

  let requiredSin = -1;
  for (const fraction of MUZZLE_CLEARANCE_FRACTIONS) {
    const terrainY = hAt(
      _gunOriginWorld.x + _gunWorldDir.x * barrelLength * fraction,
      _gunOriginWorld.z + _gunWorldDir.z * barrelLength * fraction,
    );
    const candidate = (terrainY + MUZZLE_CLEARANCE_M - _gunOriginWorld.y) /
      (barrelLength * fraction);
    if (candidate > requiredSin) requiredSin = candidate;
  }
  if (requiredSin <= -1) return mechanicalLow;
  // worldY(p) = A·sin(p) + B·cos(p) = R·sin(p + phase).
  const radiusY = Math.hypot(_hullUpWorld.y, _turretForwardWorld.y) || 1;
  const phaseY = Math.atan2(_turretForwardWorld.y, _hullUpWorld.y);
  const terrainLow = Math.asin(clamp(requiredSin / radiusY, -1, 1)) - phaseY;
  return terrainLow > mechanicalLow
    ? Math.min(terrainLow, mechanicalHigh)
    : mechanicalLow;
}

function updateConventionalGunLay(
  spec: MovementSpec,
  state: TankState,
  debuff: MovementDebuffs,
  solution: GunLaySolution,
  hAt: HeightSampler,
  gunArc: number,
  steer: number,
  dt: number,
): void {
  const turretRate = spec.turretTraverseDegS * DEG2RAD * debuff.turretMult;
  state.turretYaw = chaseAngle(state.turretYaw, solution.turretYaw, turretRate * dt);
  const yawPinned = clampCasemateYaw(state, gunArc, steer, debuff);
  const mechanicalLow = minimumMechanicalGunPitch(spec, state.turretYaw);
  const mechanicalHigh = spec.gunElevationDeg * DEG2RAD;
  const terrainLow = minimumTerrainGunPitch(
    spec,
    state,
    hAt,
    mechanicalLow,
    mechanicalHigh,
  );
  const desiredGun = solution.gunPitch;
  const specPinned = yawPinned || desiredGun < mechanicalLow - 1e-4 ||
    desiredGun > mechanicalHigh + 1e-4;
  state.atGunLimit = specPinned || desiredGun < terrainLow - 1e-4;
  state.gunPitch = clamp(
    approach(
      state.gunPitch,
      clamp(desiredGun, terrainLow, mechanicalHigh),
      spec.gunPitchDegS * DEG2RAD * dt,
    ),
    mechanicalLow,
    mechanicalHigh,
  );

  // Suppress labels for transient terrain-only pins while driving; the red
  // reticle still communicates the instantaneous physical constraint.
  const attitudePin = (desiredGun < mechanicalLow - 1e-4 ||
    desiredGun > mechanicalHigh + 1e-4) &&
    solution.worldPitch >= mechanicalLow - 1e-4 &&
    solution.worldPitch <= mechanicalHigh + 1e-4;
  const fastTransient = attitudePin && Math.abs(state.speed) * 3.6 > 15;
  const labelWanted = !fastTransient && Math.abs(steer) < 0.2 &&
    (specPinned || (state.atGunLimit &&
      solution.horizontalDistance >= GUN_LIMIT_LABEL_DIST_M));
  updateGunLimitDwell(state, labelWanted, dt);
}

function updateGunLay(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  hAt: HeightSampler,
  gunArc: number,
  steer: number,
  dt: number,
): void {
  const { input, spec, state } = entity;
  const previousTurretYaw = state.turretYaw;
  if (input.aimPoint && !input.aimLocked) {
    const solution = solveGunLay(spec, state, input.aimPoint, _gunLaySolution);
    if (hasFixedHydraulicGun(spec)) {
      updateHydraulicGunLay(spec, state, debuff, solution, steer, dt);
    } else {
      updateConventionalGunLay(spec, state, debuff, solution, hAt, gunArc, steer, dt);
    }
  } else if (input.aimLocked) {
    // Holding the gun is deliberate rather than a mechanical limit.
    state.atGunLimit = false;
    state.gunLimitSpec = false;
    state._gunLimitHoldS = 0;
  }
  // Imported/held poses must obey the same finite deck boundary even when
  // no fresh aim point arrives. Other vehicles keep their original path.
  if (spec.gunPitchByYawDeg) {
    const low = minimumMechanicalGunPitch(spec, state.turretYaw);
    if (state.gunPitch < low) { state.gunPitch = low; state.atGunLimit = true; }
  }
  state.turretYawRate = wrapAngle(state.turretYaw - previousTurretYaw) / dt;
}

function updateTrackScrollAndBloom(
  spec: MovementSpec,
  state: TankState,
  debuff: MovementDebuffs,
  dt: number,
): void {
  state.trackScroll.l += (state.speed + state.yawRate * OUTER_TRACK_ARM_M) * dt;
  state.trackScroll.r += (state.speed - state.yawRate * OUTER_TRACK_ARM_M) * dt;

  const bloom = spec.gun.bloom;
  let target = movementDispersionFactor(bloom.move, bloom.hullRot, bloom.turret,
    state.speed * 3.6, state.yawRate * RAD2DEG, state.turretYawRate * RAD2DEG, debuff.bloomMult);
  if (debuff.gunYellow) target = Math.max(target * 2, GUN_YELLOW_BLOOM_FLOOR);
  const tau = target > state.bloomF
    ? BLOOM_GROW_TAU
    : (spec.gun.aimTimeS * debuff.aimTimeMult) / LN6;
  state.bloomF += (target - state.bloomF) * (1 - Math.exp(-dt / tau));
  if (debuff.gunYellow && state.bloomF < GUN_YELLOW_BLOOM_FLOOR) {
    state.bloomF = GUN_YELLOW_BLOOM_FLOOR;
  }
  if (state.bloomF < 1) state.bloomF = 1;
}

/**
 * Is the ground ahead of the leading track edge a cliff face the hull cannot climb? True when the surface rises
 * above the hull's step-up within CLIFF_PROBE_M at more than CLIFF_GRADE. Airborne hulls already above the rise
 * pass (a jump clearing a ridge is not a wall hit).
 */
export function cliffAhead(
  heightField: MovementHeightField,
  state: TankState,
  halfLength: number,
  forwardX: number,
  forwardZ: number,
): boolean {
  if (Math.abs(state.speed) < 0.05) return false;
  const dir = state.speed > 0 ? 1 : -1;
  const edgeX = state.pos.x + forwardX * dir * halfLength;
  const edgeZ = state.pos.z + forwardZ * dir * halfLength;
  const sample = heightField.getContactHeightAt ?? heightField.getHeightAtFast ?? heightField.getHeightAt;
  const here = sample(edgeX, edgeZ);
  const ahead = sample(edgeX + forwardX * dir * CLIFF_PROBE_M, edgeZ + forwardZ * dir * CLIFF_PROBE_M);
  if (ahead <= state.pos.y + HULL_STEP_UP_M) return false;
  if ((ahead - here) / CLIFF_PROBE_M <= CLIFF_GRADE) return false;
  // a single steep step (a trench wall, a crater rim, a terrace) is crossed as before; only a face that keeps
  // rising is a wall
  const wall = sample(edgeX + forwardX * dir * CLIFF_WALL_PROBE_M, edgeZ + forwardZ * dir * CLIFF_WALL_PROBE_M);
  return wall - here > CLIFF_WALL_RISE_M;
}

function integrateHorizontalMotion(
  spec: MovementSpec,
  state: TankState,
  heightField: MovementHeightField,
  collide: MovementCollisionResolver | null,
  forwardX: number,
  forwardZ: number,
  dt: number,
): void {
  const spring = state._spring;
  let cliffImpact = 0;
  state.impactSource = IMPACT_SOURCE_NONE;
  state.impactNx = 0;
  state.impactNz = 0;
  if (cliffAhead(heightField, state, spec.dims.hullLengthM * 0.5, forwardX, forwardZ)) {
    cliffImpact = Math.abs(state.speed);
    const dir = state.speed > 0 ? 1 : -1;
    _blockedSpeed += cliffImpact;
    state.speed = 0;
    if (cliffImpact > 1.5) state._spool = 0;
    if (cliffImpact > 0) {
      // the wall pushes straight back against the motion
      state.impactSource = IMPACT_SOURCE_CLIFF;
      state.impactNx = -forwardX * dir;
      state.impactNz = -forwardZ * dir;
    }
  }
  state.impactMps = cliffImpact;
  state.pos.x += (forwardX * state.speed + spring.recoilVX) * dt;
  state.pos.z += (forwardZ * state.speed + spring.recoilVZ) * dt;
  const recoilDecay = Math.exp(-dt / RECOIL_DECAY_TAU);
  spring.recoilVX *= recoilDecay;
  spring.recoilVZ *= recoilDecay;
  if (!collide) return;

  const radiusM = spec.armor?.boundingRadiusM ?? spec.dims.hullLengthM * 0.5;
  _push.set(0, 0, 0);
  if (!collide(state.pos, radiusM, _push)) return;
  // Round 30: a hull found deep inside a primitive (a clip through a wall, a roof it fell through, a spawn inside a
  // footprint) leaves it over a few steps instead of one 7 m teleport — the visible "goes crazy" pop.
  const pushLen = Math.hypot(_push.x, _push.z);
  if (pushLen > OBSTACLE_PUSH_MAX_M_PER_STEP) _push.multiplyScalar(OBSTACLE_PUSH_MAX_M_PER_STEP / pushLen);
  state.pos.add(_push);
  const pushForward = _push.x * forwardX + _push.z * forwardZ;
  const travel = Math.abs(state.speed) * dt;
  if (travel <= 1e-9 || pushForward * state.speed >= 0) return;

  const blockedFraction = clamp(Math.abs(pushForward) / travel, 0, 1);
  const lostSpeed = Math.abs(state.speed) * blockedFraction;
  _blockedSpeed += lostSpeed;
  state.speed *= 1 - blockedFraction;
  if (lostSpeed >= cliffImpact && pushLen > 1e-9) {
    // impact physics: the integration reads the source and the push direction to price a hard contact
    state.impactSource = IMPACT_SOURCE_COLLIDER;
    const pushNow = Math.hypot(_push.x, _push.z);
    state.impactNx = _push.x / pushNow;
    state.impactNz = _push.z / pushNow;
  }
  state.impactMps = Math.max(cliffImpact, lostSpeed);
  if (lostSpeed > 1.5) state._spool = 0;
}

function updateFlinchRock(state: TankState, dt: number): void {
  const flinch = state._flinch;
  if (!flinch) return;
  const active = flinch.p !== 0 || flinch.r !== 0 || flinch.pv !== 0 || flinch.rv !== 0;
  if (!active) return;
  flinch.pv += (-FLINCH_W * FLINCH_W * flinch.p -
    2 * FLINCH_Z * FLINCH_W * flinch.pv) * dt;
  flinch.p += flinch.pv * dt;
  flinch.rv += (-FLINCH_W * FLINCH_W * flinch.r -
    2 * FLINCH_Z * FLINCH_W * flinch.rv) * dt;
  flinch.r += flinch.rv * dt;
  if (Math.abs(flinch.p) + Math.abs(flinch.pv) +
      Math.abs(flinch.r) + Math.abs(flinch.rv) < 1e-4) {
    flinch.p = 0;
    flinch.r = 0;
    flinch.pv = 0;
    flinch.rv = 0;
  }
}

function fixedHydraulicPitchRequest(
  spec: MovementSpec,
  state: TankState,
  aim: Vector3,
  suspensionPitch: number,
  dt: number,
): number {
  _hullEuler.set(-state.visualPitch, state.yaw, state.visualRoll, 'YXZ');
  _hullQuat.setFromEuler(_hullEuler);
  const turretPivot = spec.armor?.turretPivot;
  const gunPivot = spec.armor?.gunPivot;
  _gunOriginWorld.set(
    (turretPivot?.[0] ?? 0) + (gunPivot?.[0] ?? 0),
    (turretPivot?.[1] ?? spec.dims.heightM * 0.7) +
      (gunPivot?.[1] ?? spec.dims.heightM * 0.15),
    (turretPivot?.[2] ?? 0) + (gunPivot?.[2] ?? 0),
  ).applyQuaternion(_hullQuat).add(state.pos);
  // round 32 (owner 2026-09-21): the error is the sight's WORLD elevation minus the bore's world pitch. The
  // old hull-space elevation flipped sign for a sight behind the hull (a nose-up hull sees a level target
  // above its rear axis), so every turn-around ran the suspension to its nose-up stop and pinned the reticle.
  const dx = aim.x - _gunOriginWorld.x;
  const dy = aim.y - _gunOriginWorld.y;
  const dz = aim.z - _gunOriginWorld.z;
  const sightPitch = Math.atan2(dy, Math.max(Math.hypot(dx, dz), 1e-6));
  _turretForwardWorld.set(0, 0, 1).applyQuaternion(_hullQuat);
  const borePitch = Math.asin(clamp(_turretForwardWorld.y, -1, 1));
  return suspensionPitch + (sightPitch - borePitch) * Math.min(1, dt * 4);
}

function conventionalHydraulicPitchRequest(
  spec: MovementSpec,
  state: TankState,
  aim: Vector3,
): number {
  const dx = aim.x - state.pos.x;
  const dz = aim.z - state.pos.z;
  const dy = aim.y - (state.pos.y + gunPivotHeight(spec));
  return Math.atan2(dy, Math.max(Math.hypot(dx, dz), 1e-6)) - state._terr.pitch;
}

function updateSuspensionAim(
  entity: MovementEntity,
  fixedHydraulicGun: boolean,
  dt: number,
): number {
  const { input, spec, state } = entity;
  let suspensionPitch = state.suspensionAimPitch || 0;
  const hydraulicAim = spec.hydropneumaticAim;
  if ((!state.suspensionAim || !hydraulicAim) && suspensionPitch === 0) return 0;

  let target = 0;
  if (input.aimLocked) {
    target = suspensionPitch;
  } else if (state.suspensionAim && input.aimPoint) {
    const requested = fixedHydraulicGun
      ? fixedHydraulicPitchRequest(spec, state, input.aimPoint, suspensionPitch, dt)
      : conventionalHydraulicPitchRequest(spec, state, input.aimPoint);
    target = clamp(
      requested,
      -(hydraulicAim?.noseDownDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_DOWN_DEG) * DEG2RAD,
      (hydraulicAim?.noseUpDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_UP_DEG) * DEG2RAD,
    );
  }
  suspensionPitch = approach(
    suspensionPitch,
    target,
    (hydraulicAim?.rateDegS ?? SUSPENSION_AIM_DEFAULT_RATE_DEG_S) * DEG2RAD * dt,
  );
  if (!state.suspensionAim && Math.abs(suspensionPitch) < 1e-6) suspensionPitch = 0;
  state.suspensionAimPitch = suspensionPitch;
  return suspensionPitch;
}

function applyLandingAttitudeImpulse(
  state: TankState,
  body: RigidBodyState,
  targetPitch: number,
  targetRoll: number,
  landingImpact: number,
  upYAtStart: number,
): void {
  if (landingImpact <= 0) return;
  const spring = state._spring;
  spring.pitchV += clamp(
    wrapAngle(targetPitch - spring.pitch) * landingImpact * LANDING_TORQUE_GAIN,
    -LANDING_TORQUE_MAX,
    LANDING_TORQUE_MAX,
  );
  spring.rollV += clamp(
    wrapAngle(targetRoll - spring.roll) * landingImpact * LANDING_TORQUE_GAIN,
    -LANDING_TORQUE_MAX,
    LANDING_TORQUE_MAX,
  );
  body.landingBlendS = LANDING_CONTACT_BLEND_S;
  if (upYAtStart < TUMBLE_ENTER_UP_Y) body.tumbling = true;
}

function updateRigidAttitude(
  state: TankState,
  body: RigidBodyState,
  groundedAtStart: boolean,
  landingImpact: number,
  dt: number,
  drive: DriveStep,
): void {
  const spring = state._spring;
  if (groundedAtStart) {
    const relativePitch = wrapAngle(spring.pitch - state._terr.pitch);
    const relativeRoll = wrapAngle(spring.roll - state._terr.roll);
    if (body.autoRighting) {
      spring.pitchV += (-AUTO_RIGHT_OMEGA * AUTO_RIGHT_OMEGA * relativePitch -
        2 * AUTO_RIGHT_ZETA * AUTO_RIGHT_OMEGA * spring.pitchV) * dt;
      spring.rollV += (-AUTO_RIGHT_OMEGA * AUTO_RIGHT_OMEGA * relativeRoll -
        2 * AUTO_RIGHT_ZETA * AUTO_RIGHT_OMEGA * spring.rollV) * dt;
    } else {
      spring.pitchV += -Math.sin(2 * relativePitch) * GROUND_TUMBLE_GRAVITY * dt;
      spring.rollV += -Math.sin(2 * relativeRoll) * GROUND_TUMBLE_GRAVITY * dt;
      const contactDrag = Math.exp(-GROUND_TUMBLE_DAMP_S * dt);
      spring.pitchV *= contactDrag;
      spring.rollV *= contactDrag;
    }
  } else {
    const airDrag = Math.exp(-drive.airAngularDrag * dt);
    spring.pitchV *= airDrag;
    spring.rollV *= airDrag;
  }

  const angularCap = Math.min(body.tumbling ? TUMBLE_ANGULAR_SPEED_MAX : AIR_ANGULAR_SPEED_MAX,
    groundedAtStart ? Infinity : drive.airAngularSpeedMax);
  spring.pitchV = clamp(spring.pitchV, -angularCap, angularCap);
  spring.rollV = clamp(spring.rollV, -angularCap, angularCap);
  spring.pitch = wrapAngle(spring.pitch + spring.pitchV * dt);
  spring.roll = wrapAngle(spring.roll + spring.rollV * dt);
  const upY = Math.cos(spring.pitch) * Math.cos(spring.roll);
  const relativeUpY = Math.cos(wrapAngle(spring.pitch - state._terr.pitch)) *
    Math.cos(wrapAngle(spring.roll - state._terr.roll));
  if ((!groundedAtStart || landingImpact > 0) && upY < TUMBLE_ENTER_UP_Y) {
    body.tumbling = true;
  }
  const settledSpeed = Math.abs(spring.pitchV) + Math.abs(spring.rollV);
  if (groundedAtStart && body.autoRighting && relativeUpY > 0.94 && settledSpeed < 0.18) {
    body.autoRighting = false;
    body.tumbling = false;
  } else if (groundedAtStart && body.tumbling && !body.autoRighting &&
      relativeUpY > TUMBLE_EXIT_UP_Y && settledSpeed < 0.12 && landingImpact <= 0) {
    body.tumbling = false;
  }
}

function updateSupportedAttitude(
  state: TankState,
  body: RigidBodyState,
  targetPitch: number,
  targetRoll: number,
  perch: number,
  dt: number,
): void {
  const spring = state._spring;
  body.landingBlendS = Math.max(0, (body.landingBlendS || 0) - dt);
  const settle = body.landingBlendS > 0
    ? 1 - body.landingBlendS / LANDING_CONTACT_BLEND_S
    : 1;
  const springScale = LANDING_SPRING_MIN_SCALE + (1 - LANDING_SPRING_MIN_SCALE) * settle;
  // physics lane (2026-10-03): a centre of mass overhanging the loaded contacts pivots on their edge under gravity
  // (contactAwareFit) — no spring pulls it toward ground it is not touching
  const tipPitch = state._terr.tipPitch || 0;
  const tipRoll = state._terr.tipRoll || 0;
  const edgeDrag = tipPitch !== 0 || tipRoll !== 0 ? Math.exp(-TIP_DAMP_S * dt) : 1;
  // a hull that ends a tip has just come down on its second contact: the spring takes it as it takes a landing,
  // from the soft end of the blend (a full-stiffness spring met a 0.4 rad error at 140 rad/s^2 and threw the hull's
  // nose down off its support — climb-face at Turbo speed)
  if (edgeDrag !== 1) {
    body.landingBlendS = LANDING_CONTACT_BLEND_S;
    _tippedThisTick = true;
  }
  if (tipPitch !== 0) {
    spring.pitchV = (spring.pitchV + tipPitch * dt) * edgeDrag;
  } else {
    const pitchOmega = SPRING_OMEGA * springScale * (1 + PERCH_W_BOOST * perch);
    const pitchZeta = SPRING_ZETA + (1 - SPRING_ZETA) * perch;
    spring.pitchV += (pitchOmega * pitchOmega * (targetPitch - spring.pitch) -
      2 * pitchZeta * pitchOmega * spring.pitchV) * dt;
  }
  spring.pitch += spring.pitchV * dt;
  if (tipRoll !== 0) {
    spring.rollV = (spring.rollV + tipRoll * dt) * edgeDrag;
  } else {
    const rollOmega = SPRING_OMEGA * springScale;
    spring.rollV += (rollOmega * rollOmega * (targetRoll - spring.roll) -
      2 * SPRING_ZETA * rollOmega * spring.rollV) * dt;
  }
  spring.roll += spring.rollV * dt;
}

function updateHullAttitude(
  state: TankState,
  body: RigidBodyState,
  groundedAtStart: boolean,
  targetPitch: number,
  targetRoll: number,
  perch: number,
  landingImpact: number,
  upYAtStart: number,
  dt: number,
  contactPitch: number,
  contactRoll: number,
  drive: DriveStep,
): void {
  // the landing torque always turns the hull toward the ground plane it struck — a rebounding hull (airborne
  // again at the start of this tick) would otherwise read its own attitude as the target and take no torque
  applyLandingAttitudeImpulse(
    state,
    body,
    contactPitch,
    contactRoll,
    landingImpact,
    upYAtStart,
  );
  if (!groundedAtStart || body.tumbling) {
    updateRigidAttitude(state, body, groundedAtStart, landingImpact, dt, drive);
  } else {
    updateSupportedAttitude(state, body, targetPitch, targetRoll, perch, dt);
  }
  state.visualPitch = state._spring.pitch;
  state.visualRoll = state._spring.roll;
  const upY = Math.cos(state._spring.pitch) * Math.cos(state._spring.roll);
  state.overturned = state.overturned
    ? upY < OVERTURN_EXIT_UP_Y
    : upY < OVERTURN_ENTER_UP_Y;
}

/** A rock corner's ground as the wheels there feel it: as it is within their reach below the hull's track plane, its
 * pull fading to nothing from that reach to twice it (ground the wheels hang over does not pitch the sprung hull). */
function reachableCorner(ground: number, plane: number): number {
  const gap = plane - ground;
  if (gap <= TOUCH_REACH_M) return ground;
  return plane - TOUCH_REACH_M * Math.max(0, 1 - (gap - TOUCH_REACH_M) / TOUCH_REACH_M);
}

function updateSuspensionRock(
  spec: MovementSpec,
  state: TankState,
  hAt: HeightSampler,
  groundedAtStart: boolean,
  poseAcceleration: number,
  perch: number,
  dt: number,
): void {
  const suspension = state._susp;
  const acceleration = groundedAtStart
    ? clamp(poseAcceleration, -SUSP_ACCEL_CLAMP, SUSP_ACCEL_CLAMP)
    : 0;
  let pitchTarget = acceleration * SUSP_ACCEL_GAIN;
  let rollTarget = 0;
  if (groundedAtStart) {
    const halfLength = SUSP_FIT_LEN * spec.dims.hullLengthM;
    const halfWidth = SUSP_FIT_WID * spec.dims.widthM;
    const forwardX = Math.sin(state.yaw);
    const forwardZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    const x = state.pos.x;
    const z = state.pos.z;
    // Physics lane (2026-10-03): a corner whose ground lies beyond the wheels' reach below the hull (a ramp's lip, a
    // drop, a trench) hangs free; it does not pitch the sprung hull toward ground it cannot touch. The rock chased the
    // 4 m drop past a launch ramp's lip down to its clamp, the support followed that rendered pitch, and the hull left
    // the lip falling instead of rising at the ramp's rate (the base hid it under a nose-dive that lifted the root).
    const sinPitch = Math.sin(state.visualPitch), sinRoll = Math.sin(state.visualRoll);
    const y = state.pos.y;
    const frontLeft = reachableCorner(hAt(x + forwardX * halfLength - rightX * halfWidth,
      z + forwardZ * halfLength - rightZ * halfWidth), y + halfLength * sinPitch - halfWidth * sinRoll);
    const frontRight = reachableCorner(hAt(x + forwardX * halfLength + rightX * halfWidth,
      z + forwardZ * halfLength + rightZ * halfWidth), y + halfLength * sinPitch + halfWidth * sinRoll);
    const rearLeft = reachableCorner(hAt(x - forwardX * halfLength - rightX * halfWidth,
      z - forwardZ * halfLength - rightZ * halfWidth), y - halfLength * sinPitch - halfWidth * sinRoll);
    const rearRight = reachableCorner(hAt(x - forwardX * halfLength + rightX * halfWidth,
      z - forwardZ * halfLength + rightZ * halfWidth), y - halfLength * sinPitch + halfWidth * sinRoll);
    const terrainPitch = Math.atan2(
      (frontLeft + frontRight - rearLeft - rearRight) * 0.5,
      2 * halfLength,
    );
    const terrainRoll = Math.atan2(
      (frontRight + rearRight - frontLeft - rearLeft) * 0.5,
      2 * halfWidth,
    );
    const conformance = Math.min(1, Math.abs(state.speed) / SUSP_K_SPEED) *
      SUSP_K_GAIN * (1 - perch);
    pitchTarget += clamp(
      (terrainPitch - state.visualPitch) * conformance,
      -SUSP_P_CLAMP,
      SUSP_P_CLAMP,
    );
    rollTarget += clamp(
      (terrainRoll - state.visualRoll) * conformance,
      -SUSP_R_CLAMP,
      SUSP_R_CLAMP,
    );
  }
  suspension.pv += (SUSP_W * SUSP_W * (pitchTarget - suspension.p) -
    2 * SUSP_Z * SUSP_W * suspension.pv) * dt;
  suspension.p += suspension.pv * dt;
  suspension.rv += (SUSP_W * SUSP_W * (rollTarget - suspension.r) -
    2 * SUSP_Z * SUSP_W * suspension.rv) * dt;
  suspension.r += suspension.rv * dt;
  if (perch <= 0) return;
  const bleed = Math.exp(-dt * perch * PERCH_SUSP_BLEED);
  suspension.p *= bleed;
  suspension.pv *= bleed;
  suspension.r *= bleed;
  suspension.rv *= bleed;
}

function resetSupportSamples(
  spec: MovementSpec,
  state: TankState,
  contact: MovementContactGeometry | null | undefined,
  pitch: number,
  roll: number,
): SupportSamples {
  const samples = _supportSamples;
  samples.halfLength = contact
    ? contact.halfLenM
    : SUPPORT_LEN_FRAC * spec.dims.hullLengthM;
  samples.centerZ = contact?.zCenterM ?? 0;
  samples.lineCount = Math.min(
    SUPPORT_MAX_N,
    Math.max(5, Math.ceil((2 * samples.halfLength) / SUPPORT_SPACING_M) + 1),
  );
  samples.step = (2 * samples.halfLength) / (samples.lineCount - 1);
  samples.cosYaw = Math.cos(state.yaw);
  samples.sinYaw = Math.sin(state.yaw);
  samples.cosNegPitch = Math.cos(-pitch);
  samples.sinNegPitch = Math.sin(-pitch);
  samples.cosRoll = Math.cos(roll);
  samples.sinRoll = Math.sin(roll);
  samples.sinPitch = Math.sin(pitch);
  samples.cosPitch = Math.cos(pitch);
  // Impact physics (2026-09-25, "bodies stop cleanly"): the settle residuals are measured against the pure
  // least-squares fit, not against last tick's pitch WITH its settle correction — measured against the latter, a
  // hull parked on a plane read its own previous correction as a residual trend, corrected the other way, and the
  // attitude spring chased a target that flipped ±0.4° at ~1 Hz for good (5 mm of height chatter on a 15° grade).
  samples.fitSinPitch = Math.sin(state._terr.fitPitch);
  samples.fitCosPitch = Math.cos(state._terr.fitPitch);
  samples.fitSinRoll = Math.sin(state._terr.roll);
  samples.fitCosRoll = Math.cos(state._terr.roll);
  samples.worldX = state.pos.x;
  samples.worldZ = state.pos.z;
  samples.zHalf = 0.25 * samples.halfLength;
  samples.sumHeightZ = 0;
  samples.sumZZ = 0;
  samples.sumLeft = 0;
  samples.sumRight = 0;
  samples.sideCount = 0;
  samples.outerMax = -Infinity;
  samples.outerX = 0;
  samples.outerZ = 0;
  samples.settleDeficitSum = 0;
  samples.deficitCount = 0;
  samples.deepestZ = 0;
  samples.settleOuterMax = -Infinity;
  samples.frontMax = -Infinity;
  samples.frontZ = samples.halfLength;
  samples.rearMax = -Infinity;
  samples.rearZ = -samples.halfLength;
  samples.fanMax = -Infinity;
  samples.bellyMax = -Infinity;
  samples.panY = contact?.panYM ? contact.panYM - 0.015 : null;
  samples.fitCount = 0;
  samples.fanTouchLeftX = Infinity;
  samples.fanTouchRightX = Infinity;
  return samples;
}

function sampleTrackWrapEnds(
  samples: SupportSamples,
  contact: MovementContactGeometry | null | undefined,
  hAt: HeightSampler,
  localX: number,
  gearBottomY: number,
): void {
  if (!contact?.endRise) return;
  for (let end = 0; end < 2; end++) {
    const localZ = end === 0
      ? samples.centerZ + samples.halfLength + contact.endRise.dzM
      : samples.centerZ - samples.halfLength - contact.endRise.dzM;
    const rise = end === 0 ? contact.endRise.frontM : contact.endRise.rearM;
    const localY = gearBottomY + rise;
    const rolledX = localX * samples.cosRoll - localY * samples.sinRoll;
    const rolledY = localX * samples.sinRoll + localY * samples.cosRoll;
    const pitchedZ = rolledY * samples.sinNegPitch + localZ * samples.cosNegPitch;
    const terrainY = hAt(
      samples.worldX + rolledX * samples.cosYaw + pitchedZ * samples.sinYaw,
      samples.worldZ - rolledX * samples.sinYaw + pitchedZ * samples.cosYaw,
    );
    const deficit = terrainY - ((localX * samples.sinRoll +
      localY * samples.cosRoll) * samples.cosPitch + localZ * samples.sinPitch);
    if (deficit > samples.outerMax) samples.outerMax = deficit;
  }
}

function sampleOuterTrackLines(
  samples: SupportSamples,
  contact: MovementContactGeometry | null | undefined,
  hAt: HeightSampler,
  halfWidth: number,
  gearBottomY: number,
): void {
  const renderedBottomLift = gearBottomY * samples.cosRoll * samples.cosPitch;
  const fittedBottomLift = gearBottomY * samples.fitCosRoll * samples.fitCosPitch;
  for (let side = -1; side <= 1; side += 2) {
    const localX = side * halfWidth;
    const rolledX = localX * samples.cosRoll - gearBottomY * samples.sinRoll;
    const rolledY = localX * samples.sinRoll + gearBottomY * samples.cosRoll;
    for (let index = 0; index < samples.lineCount; index++) {
      const centeredZ = -samples.halfLength + index * samples.step;
      const localZ = samples.centerZ + centeredZ;
      const pitchedZ = rolledY * samples.sinNegPitch + localZ * samples.cosNegPitch;
      const terrainY = hAt(
        samples.worldX + rolledX * samples.cosYaw + pitchedZ * samples.sinYaw,
        samples.worldZ - rolledX * samples.sinYaw + pitchedZ * samples.cosYaw,
      );
      samples.sumHeightZ += terrainY * centeredZ;
      samples.sumZZ += centeredZ * centeredZ;
      if (side < 0) samples.sumLeft += terrainY;
      else samples.sumRight += terrainY;
      samples.sideCount += 1;

      const deficit = terrainY - (localX * samples.sinRoll * samples.cosPitch +
        renderedBottomLift + localZ * samples.sinPitch);
      if (deficit > samples.outerMax) {
        samples.outerMax = deficit;
        samples.outerX = localX;
        samples.outerZ = localZ;
      }
      const record = samples.fitCount++;
      _fitZ[record] = centeredZ;
      _fitX[record] = localX;
      _fitH[record] = terrainY;
      _fitD[record] = deficit;
      const fittedDeficit = terrainY - (localX * samples.fitSinRoll * samples.fitCosPitch +
        fittedBottomLift + localZ * samples.fitSinPitch);
      if (fittedDeficit > samples.settleOuterMax) {
        samples.settleOuterMax = fittedDeficit;
        samples.deepestZ = centeredZ;
      }
      if (centeredZ < -samples.zHalf && fittedDeficit > samples.rearMax) {
        samples.rearMax = fittedDeficit;
        samples.rearZ = centeredZ;
      } else if (centeredZ > samples.zHalf && fittedDeficit > samples.frontMax) {
        samples.frontMax = fittedDeficit;
        samples.frontZ = centeredZ;
      }
      samples.settleDeficitSum += fittedDeficit;
      samples.deficitCount += 1;
    }
    sampleTrackWrapEnds(samples, contact, hAt, localX, gearBottomY);
  }
}

function sampleSupportFanSide(
  samples: SupportSamples,
  contact: MovementContactGeometry | null | undefined,
  hAt: HeightSampler,
  halfWidth: number,
  gearBottomY: number,
  line: (typeof SUPPORT_FAN)[number],
  side: number,
  stride: number,
): void {
  const localY = line.yOff > 0 && samples.panY !== null
    ? samples.panY
    : line.yOff + gearBottomY;
  const localX = side * halfWidth * line.f;
  const rolledX = localX * samples.cosRoll - localY * samples.sinRoll;
  const rolledY = localX * samples.sinRoll + localY * samples.cosRoll;
  const renderedLift = (localX * samples.sinRoll +
    localY * samples.cosRoll) * samples.cosPitch;
  const fittedLift = (localX * samples.fitSinRoll +
    localY * samples.fitCosRoll) * samples.fitCosPitch;
  for (let index = 0; index < samples.lineCount; index += stride) {
    const localZ = samples.centerZ + (index === samples.lineCount - 2
      ? samples.halfLength
      : -samples.halfLength + index * samples.step);
    const pitchedZ = rolledY * samples.sinNegPitch + localZ * samples.cosNegPitch;
    const terrainY = hAt(
      samples.worldX + rolledX * samples.cosYaw + pitchedZ * samples.sinYaw,
      samples.worldZ - rolledX * samples.sinYaw + pitchedZ * samples.cosYaw,
    );
    const deficit = terrainY - (renderedLift + localZ * samples.sinPitch);
    if (line.yOff === 0) {
      if (deficit > samples.fanMax) samples.fanMax = deficit;
      if (deficit >= samples.outerMax - TOUCH_REACH_M) {
        const reach = Math.abs(localX);
        if (side < 0) { if (reach < samples.fanTouchLeftX) samples.fanTouchLeftX = reach; }
        else if (reach < samples.fanTouchRightX) samples.fanTouchRightX = reach;
      }
      samples.settleDeficitSum += terrainY -
        (fittedLift + localZ * samples.fitSinPitch);
      samples.deficitCount += 1;
    } else if (deficit > samples.bellyMax) {
      samples.bellyMax = deficit;
    }
  }
  if (line.yOff === 0) sampleTrackWrapEnds(samples, contact, hAt, localX, gearBottomY);
}

function sampleSupportFan(
  samples: SupportSamples,
  contact: MovementContactGeometry | null | undefined,
  hAt: HeightSampler,
  halfWidth: number,
  gearBottomY: number,
  rigidGear: boolean,
): void {
  const stride = rigidGear ? 1 : 2;
  for (const line of SUPPORT_FAN) {
    const sideCount = line.f === 0 ? 1 : 2;
    for (let sideIndex = 0; sideIndex < sideCount; sideIndex++) {
      sampleSupportFanSide(
        samples,
        contact,
        hAt,
        halfWidth,
        gearBottomY,
        line,
        sideIndex === 0 ? -1 : 1,
        stride,
      );
    }
  }
}

function fallbackRigidBodySupport(
  spec: MovementSpec,
  samples: SupportSamples,
  hAt: HeightSampler,
  gearBottomY: number,
): number {
  const halfLength = spec.dims.hullLengthM * 0.5;
  const halfWidth = spec.dims.widthM * 0.5;
  const topY = Math.max(spec.dims.heightM, gearBottomY + 0.8);
  let supportY = -Infinity;
  for (let yIndex = 0; yIndex < 2; yIndex++) {
    const localY = yIndex === 0 ? gearBottomY : topY;
    for (let xSign = -1; xSign <= 1; xSign += 2) {
      const localX = xSign * halfWidth;
      const rolledX = localX * samples.cosRoll - localY * samples.sinRoll;
      const rolledY = localX * samples.sinRoll + localY * samples.cosRoll;
      for (let zSign = -1; zSign <= 1; zSign += 2) {
        const localZ = zSign * halfLength;
        const pitchedZ = rolledY * samples.sinNegPitch + localZ * samples.cosNegPitch;
        const terrainY = hAt(
          samples.worldX + rolledX * samples.cosYaw + pitchedZ * samples.sinYaw,
          samples.worldZ - rolledX * samples.sinYaw + pitchedZ * samples.cosYaw,
        );
        const deficit = terrainY -
          (rolledY * samples.cosPitch + localZ * samples.sinPitch);
        if (deficit > supportY) supportY = deficit;
      }
    }
  }
  return supportY;
}

function rigidBodySupport(
  spec: MovementSpec,
  state: TankState,
  samples: SupportSamples,
  hAt: HeightSampler,
  gearBottomY: number,
  includeRigidBody: boolean,
): number {
  if (!includeRigidBody) return -Infinity;
  const contact = spec.armor?.bodyContactPoints;
  if (!contact?.hull || contact.hull.length < 3) {
    return fallbackRigidBodySupport(spec, samples, hAt, gearBottomY);
  }
  let supportY = pointCloudSupportY(
    contact.hull,
    hAt,
    samples.worldX,
    samples.worldZ,
    samples.cosYaw,
    samples.sinYaw,
    samples.cosNegPitch,
    samples.sinNegPitch,
    samples.cosRoll,
    samples.sinRoll,
  );
  if (!contact.turret || contact.turret.length < 3) return supportY;
  const turretPivot = spec.armor?.turretPivot;
  const turretYaw = state.turretYaw || 0;
  const turretSupport = pointCloudSupportY(
    contact.turret,
    hAt,
    samples.worldX,
    samples.worldZ,
    samples.cosYaw,
    samples.sinYaw,
    samples.cosNegPitch,
    samples.sinNegPitch,
    samples.cosRoll,
    samples.sinRoll,
    Math.cos(turretYaw),
    Math.sin(turretYaw),
    turretPivot?.[0] ?? 0,
    turretPivot?.[1] ?? 0,
    turretPivot?.[2] ?? 0,
  );
  if (turretSupport > supportY) supportY = turretSupport;
  return supportY;
}

/** Below this RMS residual the samples' ground is one plane (a 0.6 m step under the hull leaves 0.15 m). */
const PLANAR_RESIDUAL_M = 0.12;

/** True when the ground under every outer-line sample lies on one plane within PLANAR_RESIDUAL_M. */
function groundIsPlanar(count: number): boolean {
  if (count < 4) return false;
  let sz = 0, sx = 0, sh = 0;
  for (let i = 0; i < count; i++) { sz += _fitZ[i]; sx += _fitX[i]; sh += _fitH[i]; }
  const mz = sz / count, mx = sx / count, mh = sh / count;
  let czz = 0, cxx = 0, czx = 0, czh = 0, cxh = 0, chh = 0;
  for (let i = 0; i < count; i++) {
    const z = _fitZ[i] - mz, x = _fitX[i] - mx, h = _fitH[i] - mh;
    czz += z * z; cxx += x * x; czx += z * x; czh += z * h; cxh += x * h; chh += h * h;
  }
  const det = czz * cxx - czx * czx;
  if (!(det > 1e-9)) return false;
  const a = (czh * cxx - cxh * czx) / det, b = (cxh * czz - czh * czx) / det;
  const residual = (chh - a * czh - b * cxh) / count;
  return residual < PLANAR_RESIDUAL_M * PLANAR_RESIDUAL_M;
}

const FIT_ALL_LOADED = 0;
const FIT_PARTIAL = 1;
const FIT_NONE_LOADED = 2;
const _contactFit = { pitch: 0, roll: 0, tipPitch: 0, tipRoll: 0, edge: false };

/**
 * The plane through the loaded outer-line samples only (see TOUCH_REACH_M) and the gravity tip of a centre of mass
 * that overhangs them. Returns FIT_ALL_LOADED when every sample carries load (the caller keeps the full fit, bit for
 * bit), FIT_NONE_LOADED when none does (the hull is leaving the ground: the previous plane stands), else FIT_PARTIAL
 * with _contactFit filled. Hull-local: z forward from the contact centre (the centre of mass), x right.
 */
function contactAwareFit(
  spec: MovementSpec,
  state: TankState,
  samples: SupportSamples,
  halfWidth: number,
  gravityScale: number,
): number {
  const top = samples.outerMax;
  let n = 0, wsum = 0, sz = 0, sx = 0, sh = 0, szz = 0, sxx = 0, szx = 0, szh = 0, sxh = 0;
  let zMin = Infinity, zMax = -Infinity, left = 0, right = 0, faded = 0, deepest = 0;
  for (let i = 0; i < samples.fitCount; i++) {
    const gap = top - _fitD[i];
    if (gap > deepest) deepest = gap;
    // the edge a hull tips about is where its tracks still touch (the droop's reach), not where the fit still weighs
    if (gap <= TOUCH_REACH_M) {
      if (_fitZ[i] < zMin) zMin = _fitZ[i];
      if (_fitZ[i] > zMax) zMax = _fitZ[i];
    }
    if (gap >= DROP_FAR_M) continue;
    const w = gap <= DROP_NEAR_M ? 1 : (DROP_FAR_M - gap) / (DROP_FAR_M - DROP_NEAR_M);
    if (w < 1) faded++;
    const z = _fitZ[i], x = _fitX[i], h = _fitH[i];
    n++; wsum += w; sz += w * z; sx += w * x; sh += w * h; szz += w * z * z; sxx += w * x * x;
    szx += w * z * x; szh += w * z * h; sxh += w * x * h;
    if (w >= 0.5) {
      if (x < 0) left++; else right++;
    }
  }
  // uneven ground the tracks bridge (nothing hangs past DROP_FAR_M) keeps the full fit, bit for bit as before
  if ((n === samples.fitCount && faded === 0) || deepest < DROP_FAR_M) return FIT_ALL_LOADED;
  // Ground that is one plane under the whole hull (a face it hangs over at one end, a slope it is turning onto) is the
  // plane it settles on, not an edge to tip over: a hull set level on a 48-degree face read the face's far end as a drop
  // and tipped onto it for a second instead of lying on it (impactPhysics' slide).
  if (groundIsPlanar(samples.fitCount)) return FIT_ALL_LOADED;
  if (n === 0 || wsum < 1e-6) return FIT_NONE_LOADED;
  const mz = sz / wsum, mx = sx / wsum, mh = sh / wsum;
  const czz = szz / wsum - mz * mz, cxx = sxx / wsum - mx * mx, czx = szx / wsum - mz * mx;
  const czh = szh / wsum - mz * mh, cxh = sxh / wsum - mx * mh;
  const det = czz * cxx - czx * czx;
  // a direction the supporting samples do not span keeps the hull's own attitude (no spring torque about it)
  let pitch = state._spring.pitch;
  let roll = state._spring.roll;
  // A pitch the supporting samples do not span (a cluster under a metre and a half long) is the face under it, not the
  // hull's plane: it falls back to the plane of all the samples, the fit before contact-awareness. A heavy hull crossing
  // an assault trench read the 45-degree far wall under its nose (its tail over the trench) as its grade for one tick,
  // the grade rule stopped it dead in the trench, and it see-sawed there at 40 degrees for three seconds.
  const spansPitch = czz > FIT_MIN_SPAN_ZZ;
  if (left > 0 && right > 0 && det > 1e-6) {
    pitch = spansPitch ? Math.atan((czh * cxx - cxh * czx) / det) : Math.atan2(samples.sumHeightZ, samples.sumZZ);
    roll = Math.atan((cxh * czz - czh * czx) / det);
  } else if (spansPitch) {
    pitch = Math.atan(czh / czz);
  } else if (czz > 1e-4) {
    pitch = Math.atan2(samples.sumHeightZ, samples.sumZZ);
  }
  _contactFit.pitch = pitch;
  _contactFit.roll = roll;
  // Gravity tip about the edge of the supporting samples, α = g·d·cos θ / (r² + d²) with r the radius of gyration —
  // for a hull that hangs over an edge it is leaving or stands on (an overhang on the side it drives toward, or any
  // overhang at a crawl). An overhang on the trailing side is a hull driving INTO rising ground with its tail still over
  // the low side (a trench's far wall, a ledge it climbs onto): there the loaded face turns it, and the spring takes it
  // to the plane of the samples that carry it (at 0.17 g a gravity-only tip left the nose down while the front climbed).
  const gravity = GRAVITY * gravityScale;
  const dims = spec.dims;
  const travel = state.speed > TIP_TRAVEL_MPS ? 1 : state.speed < -TIP_TRAVEL_MPS ? -1 : 0;
  let tipPitch = 0;
  if (zMax > -Infinity) {
    // The centre of mass sits over the hull box's centre (tankContactRect), not at the root (physics lane, 2026-10-03):
    // a hull whose box runs 0.87 m ahead of its root, set down with its root on a roof's back edge, has its weight over
    // the roof and settles onto it; read from the root it balanced on the edge, tipped back off it and hung at 80
    // degrees against the wall.
    const comZ = tankContactRect(spec).centerZ;
    const leverFront = comZ - zMax; // the centre of mass ahead of the front-most support: the nose goes down
    const leverRear = zMin - comZ;  // behind the rear-most: the tail goes down
    const pitchGyration = (dims.hullLengthM * dims.hullLengthM + dims.heightM * dims.heightM) / 12;
    if (leverFront > TIP_DEADBAND_M && travel >= 0) {
      tipPitch = -gravity * leverFront * Math.cos(state._spring.pitch) / (pitchGyration + leverFront * leverFront);
    } else if (leverRear > TIP_DEADBAND_M && travel <= 0) {
      tipPitch = gravity * leverRear * Math.cos(state._spring.pitch) / (pitchGyration + leverRear * leverRear);
    }
  }
  // a whole side hanging (its outer line and its wheel-run fan): roll toward it about the innermost loaded line
  let tipRoll = 0;
  const rollGyration = (dims.widthM * dims.widthM + dims.heightM * dims.heightM) / 12;
  if (left === 0 && samples.fanTouchLeftX === Infinity && right > 0) {
    const lever = Math.min(halfWidth, samples.fanTouchRightX);
    tipRoll = gravity * lever * Math.cos(state._spring.roll) / (rollGyration + lever * lever);
  } else if (right === 0 && samples.fanTouchRightX === Infinity && left > 0) {
    const lever = Math.min(halfWidth, samples.fanTouchLeftX);
    tipRoll = -gravity * lever * Math.cos(state._spring.roll) / (rollGyration + lever * lever);
  }
  _contactFit.tipPitch = tipPitch;
  _contactFit.tipRoll = tipRoll;
  _contactFit.edge = tipPitch !== 0 && zMax - zMin < EDGE_BAND_M;
  return FIT_PARTIAL;
}

function updateTerrainFitAndPerch(
  entity: MovementEntity,
  samples: SupportSamples,
  halfWidth: number,
  groundedAtStart: boolean,
): void {
  const { spec, state } = entity;
  const terr = state._terr;
  terr.tipPitch = 0;
  terr.tipRoll = 0;
  // a hull seated on another hull's roof stands on that roof, not on the terrain sampled metres below it: it keeps the
  // plane of the ground the lower hull stands on (the full fit), as before; a tumbling or overturned hull's tracks are
  // not what it rests on, and its righting turns toward the ground's plane (the full fit), not its own attitude
  if (groundedAtStart && !Number.isFinite(state._body.restSupportY) && !state._body.tumbling && !state.overturned) {
    const gravityScale = clamp(Number.isFinite(entity.modeGravityScale) ? entity.modeGravityScale! : 1, 0.1, 3);
    const contact = contactAwareFit(spec, state, samples, halfWidth, gravityScale);
    _wholeTrackOnGround = contact === FIT_ALL_LOADED;
    if (contact === FIT_NONE_LOADED) return;
    if (contact === FIT_PARTIAL) {
      terr.fitPitch = _contactFit.pitch;
      // pivoting on an edge, the hull slides on its own belly (EDGE_BAND_M): the grade the slope pull reads is its pitch
      terr.pitch = _contactFit.edge ? state._spring.pitch : _contactFit.pitch;
      terr.roll = _contactFit.roll;
      terr.tipPitch = _contactFit.tipPitch;
      terr.tipRoll = _contactFit.tipRoll;
      return;
    }
  }
  const fitPitch = Math.atan2(samples.sumHeightZ, samples.sumZZ);
  terr.fitPitch = fitPitch;
  terr.pitch = fitPitch;
  terr.roll = Math.atan2(
    (samples.sumRight - samples.sumLeft) / (samples.sideCount / 2),
    2 * halfWidth,
  );
  let tip = 0;
  if (samples.deepestZ > samples.zHalf && samples.rearMax > -Infinity) {
    tip = (samples.settleOuterMax - samples.rearMax) /
      (samples.deepestZ - samples.rearZ);
  } else if (samples.deepestZ < -samples.zHalf && samples.frontMax > -Infinity) {
    tip = (samples.settleOuterMax - samples.frontMax) /
      (samples.deepestZ - samples.frontZ);
  }
  // Half the clamped settle: measured against the previous pitch-with-settle, the old residual trend alternated
  // between the full slope and zero on successive ticks, so the tuned r3/r5 authority (the levitation and perch
  // receipts) was the average — half — with the chatter on top; the perch still reads the raw request.
  terr.pitch += 0.5 * clamp(tip, -SETTLE_CLAMP_RAD, SETTLE_CLAMP_RAD);
  const requestedPerch = clamp(Math.abs(tip) / SETTLE_CLAMP_RAD - 1, 0, 1);
  if (groundedAtStart && requestedPerch > state._perch) state._perch = requestedPerch;
}

function updateFanYield(
  state: TankState,
  samples: SupportSamples,
  rigidGear: boolean,
  dt: number,
): number {
  const roughness = samples.settleOuterMax -
    samples.settleDeficitSum / samples.deficitCount;
  const requested = rigidGear
    ? 0
    : clamp(roughness - FAN_YIELD_FREE_M, 0, FAN_YIELD_MAX_M);
  const previous = state._fanYield || 0;
  const next = requested > previous
    ? Math.min(requested, previous + FAN_YIELD_OPEN_MPS * dt)
    : requested;
  state._fanYield = next;
  return next;
}

function writeSupportCache(
  entity: MovementEntity,
  samples: SupportSamples,
  pitch: number,
  roll: number,
  suspensionPitch: number,
  groundedAtStart: boolean,
  rigidGear: boolean,
  rigidSupportY: number,
  dt: number,
): void {
  const { spec, state } = entity;
  const contact = entity.contactGeom;
  const fanYield = updateFanYield(state, samples, rigidGear, dt);
  const rigidUndercut = !!contact && Number.isFinite(contact.gearBottomYM) &&
    Number.isFinite(contact.bottomYM) &&
    (contact.bottomYM as number) < (contact.gearBottomYM as number) - 0.01;
  const hydraulicAim = spec.hydropneumaticAim;
  const hydraulicYield = state.suspensionAim && hydraulicAim && !rigidUndercut
    ? Math.min(
      hydraulicAim.compressionM ?? RIDE_COMPRESSION_M,
      Math.abs(Math.sin(suspensionPitch)) * samples.halfLength,
    )
    : 0;
  let supportY = Math.max(
    samples.outerMax - hydraulicYield,
    samples.fanMax - fanYield - hydraulicYield,
  );
  const bellyYield = samples.panY !== null ? 0 : fanYield;
  const bellySupportY = samples.bellyMax - bellyYield;
  if (bellySupportY > supportY) supportY = bellySupportY;
  updateTerrainFitAndPerch(
    entity,
    samples,
    contact ? contact.halfWidM : HALF_WID_FRAC * spec.dims.widthM,
    groundedAtStart,
  );

  const perchCut = rigidGear ? 0 : 0.7 * state._perch;
  const margin = SUPPORT_MARGIN_M + SUPPORT_MARGIN_ATT_M * (1 - perchCut) *
    Math.min(1, (Math.abs(pitch) + Math.abs(roll)) / SUPPORT_MARGIN_ATT_RAD);
  const normalFloor = (rigidUndercut
    ? supportY
    : Math.max(bellySupportY, supportY - RIDE_COMPRESSION_M)) + margin;
  const rigidFloor = rigidSupportY + RIGID_BODY_MARGIN_M;
  const cache = state._sup;
  // the support this turn of the hull took away at the contact it rests on (_rotationDrop): the contact's height over
  // the root at this attitude against the last solve's
  if (Number.isFinite(cache.x)) {
    const lift = (samples.outerX * (samples.sinRoll * samples.cosPitch - Math.sin(cache.roll) * Math.cos(cache.pitch))
      + samples.outerZ * (samples.sinPitch - Math.sin(cache.pitch)));
    _rotationDrop = lift > 0 ? lift : 0;
  }
  cache.x = state.pos.x;
  cache.z = state.pos.z;
  cache.yaw = state.yaw;
  cache.pitch = pitch;
  cache.roll = roll;
  cache.y = Math.max(supportY + margin, rigidFloor);
  cache.floorY = Math.max(normalFloor, rigidFloor);
  cache.rigid = rigidGear;
  cache.cg = contact;
}

function supportCacheIsFresh(
  state: TankState,
  contact: MovementContactGeometry | null | undefined,
  pitch: number,
  roll: number,
  rigidGear: boolean,
): boolean {
  const cache = state._sup;
  return Math.abs(state.pos.x - cache.x) < 0.004 &&
    Math.abs(state.pos.z - cache.z) < 0.004 &&
    Math.abs(wrapAngle(state.yaw - cache.yaw)) < 0.0012 &&
    Math.abs(pitch - cache.pitch) < 0.0012 &&
    Math.abs(roll - cache.roll) < 0.0012 &&
    cache.rigid === rigidGear && cache.cg === contact;
}

function solveSupportHeight(
  entity: MovementEntity,
  hAt: HeightSampler,
  groundedAtStart: boolean,
  pitch: number,
  roll: number,
  upY: number,
  suspensionPitch: number,
  dt: number,
): void {
  const { spec, state } = entity;
  const contact = entity.contactGeom;
  const rigidGear = entity.rigidGear === true;
  if (supportCacheIsFresh(state, contact, pitch, roll, rigidGear)) return;
  const gearBottomY = contact?.bottomYM || 0;
  const halfWidth = contact ? contact.halfWidM : HALF_WID_FRAC * spec.dims.widthM;
  const samples = resetSupportSamples(spec, state, contact, pitch, roll);
  sampleOuterTrackLines(samples, contact, hAt, halfWidth, gearBottomY);
  sampleSupportFan(samples, contact, hAt, halfWidth, gearBottomY, rigidGear);
  const shellSupportY = rigidBodySupport(
    spec,
    state,
    samples,
    hAt,
    gearBottomY,
    state._body.tumbling || upY < TUMBLE_ENTER_UP_Y,
  );
  const guardSupportY = pointCloudSupportY(
    hullEndGuards(spec),
    hAt,
    samples.worldX,
    samples.worldZ,
    samples.cosYaw,
    samples.sinYaw,
    samples.cosNegPitch,
    samples.sinNegPitch,
    samples.cosRoll,
    samples.sinRoll,
  );
  const rigidSupportY = guardSupportY > shellSupportY ? guardSupportY : shellSupportY;
  writeSupportCache(
    entity,
    samples,
    pitch,
    roll,
    suspensionPitch,
    groundedAtStart,
    rigidGear,
    rigidSupportY,
    dt,
  );
}

function prepareImpactPhysics(drive: DriveStep, physics: RulesetPhysics): void {
  drive.restitution = clamp(Number.isFinite(physics.restitution) ? physics.restitution : STANDARD_PHYSICS.restitution, 0, 0.95);
  drive.bounceMin = Number.isFinite(physics.bounceMinMps) && physics.bounceMinMps > 0
    ? physics.bounceMinMps : STANDARD_PHYSICS.bounceMinMps;
  drive.bounceMaxHeight = Number.isFinite(physics.bounceMaxHeightM) && physics.bounceMaxHeightM! > 0
    ? physics.bounceMaxHeightM! : Infinity;
  drive.airAngularDrag = Number.isFinite(physics.airAngularDrag) && physics.airAngularDrag! >= 0
    ? physics.airAngularDrag! : AIR_ANGULAR_DRAG_S;
  drive.airAngularSpeedMax = Number.isFinite(physics.airAngularSpeedMax) && physics.airAngularSpeedMax! > 0
    ? physics.airAngularSpeedMax! : Infinity;
}

function prepareDriveStep(
  entity: MovementEntity,
  heightField: MovementHeightField,
  debuff: MovementDebuffs,
  body: RigidBodyState,
): DriveStep {
  const { input, spec, state } = entity;
  const drive = _driveStep;
  drive.grounded = state.grounded !== false;
  // Rigid attitude settling can continue after the tracks regain purchase.
  // Keep that animation/physics state, but stop suppressing drive and steering
  // once the hull is aligned with its support plane. In flight the engine can
  // spool freely; updateDriveSpool prevents any airborne traction or braking.
  const tracksAligned = !body.tumbling ||
    Math.cos(state._spring.pitch - state._terr.pitch) *
      Math.cos(state._spring.roll - state._terr.roll) >= TUMBLE_EXIT_UP_Y;
  const drivetrainLocked = debuff.immobile ||
    (drive.grounded && (state.overturned || !tracksAligned));
  drive.throttle = drivetrainLocked ? 0 : clamp(input.throttle || 0, -1, 1);
  drive.steer = drivetrainLocked ? 0 : clamp(input.steer || 0, -1, 1);
  drive.braking = !!input.brake;
  drive.ground = drive.grounded
    ? driveGroundTypeAt(heightField, state.pos.x, state.pos.z)
    : state._groundType;
  if (drive.grounded) state._groundType = drive.ground;
  drive.resistance = spec.terrainResistance[drive.ground] || spec.terrainResistance.medium;
  drive.hardResistance = spec.terrainResistance.hard;
  drive.forwardX = Math.sin(state.yaw);
  drive.forwardZ = Math.cos(state.yaw);
  drive.rightX = Math.cos(state.yaw);
  drive.rightZ = -Math.sin(state.yaw);
  drive.terrainPitch = state._terr.pitch;
  drive.speedMultiplier = clamp(
    Number.isFinite(entity.modeSpeedMultiplier) ? entity.modeSpeedMultiplier! : 1,
    0.25,
    3,
  );
  // ruleset gravity (sim/matchRuleset.ts): Turbo Ball's 0.6 g keeps a jumped hull in the air longer
  // and softens the slope pull; the shell gravity scales at the muzzle from the same stamp.
  drive.gravityScale = clamp(
    Number.isFinite(entity.modeGravityScale) ? entity.modeGravityScale! : 1,
    0.1,
    3,
  );
  prepareImpactPhysics(drive, entity.modePhysics ?? STANDARD_PHYSICS);
  drive.gripLost = false;
  drive.topSpeed = spec.topSpeedKmh / 3.6 * drive.speedMultiplier;
  drive.reverseSpeed = spec.reverseSpeedKmh / 3.6 * drive.speedMultiplier;
  drive.traverseMax = 0;
  drive.gunArc = gunArcRadFor(spec);
  drive.acceleration = 0;
  drive.baseRate = 0;
  drive.brakeRate = 0;
  drive.speedLimit = 0;
  drive.targetSpeed = 0;
  drive.rate = 0;
  drive.spoolTarget = 0;
  return drive;
}

/**
 * Synthesized hull steer for fixed-mount guns: when the sight lies outside the gun's yaw reach the hull turns
 * onto it (WoT does exactly this for TDs). The request comes from the SAME gun-origin solve as the gun lay so
 * the traverse and the reticle pin never disagree. `state._autoTraverse` carries the engaged direction with
 * hysteresis — a casemate engages past its arc and releases once the sight is parked
 * CASEMATE_TRAVERSE_SETTLE_RAD inside it; a hydraulic hull engages past its reach window, releases at half of
 * it, and keeps closing to zero regardless because nothing else can lay its gun. The player's own steer always
 * wins and an immobile hull cannot act, but both keep the flag so the pin stays truthful.
 */
function casemateSteerCommand(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  drive: DriveStep,
  fallback: number,
): number {
  const { input, spec, state } = entity;
  if (drive.gunArc === Infinity) return fallback;
  if (!input.aimPoint || input.aimLocked) {
    state._autoTraverse = 0;
    return fallback;
  }
  const request = solveGunLay(spec, state, input.aimPoint, _gunLaySolution).turretYaw;
  const away = Math.abs(request);
  const fixedGun = drive.gunArc === 0;
  const engageAt = fixedGun ? hydraulicReachRad(spec) : drive.gunArc;
  const releaseAt = fixedGun
    ? engageAt * 0.5
    : Math.max(drive.gunArc * 0.5, drive.gunArc - CASEMATE_TRAVERSE_SETTLE_RAD);
  let engaged = state._autoTraverse;
  if (engaged === 0) {
    if (away > engageAt + 1e-6) engaged = request >= 0 ? 1 : -1;
  } else if (away <= releaseAt) {
    engaged = 0;
  } else if (away < REAR_LATCH_RAD) {
    engaged = request >= 0 ? 1 : -1;
  }
  state._autoTraverse = engaged;
  if (drive.steer !== 0 || debuff.immobile) return fallback;
  if (fixedGun) {
    const towards = engaged !== 0 && away >= REAR_LATCH_RAD ? engaged : (request >= 0 ? 1 : -1);
    return clamp(away / AUTO_TRAVERSE_RAMP_RAD, 0, 1) * towards;
  }
  if (engaged === 0) return fallback;
  return clamp((away - releaseAt + CASEMATE_TRAVERSE_CROSS_RAD) / AUTO_TRAVERSE_RAMP_RAD, 0, 1) * engaged;
}

function updateHullTraverse(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  drive: DriveStep,
  dt: number,
): void {
  const { spec, state } = entity;
  const healthyMax = spec.hullTraverseDegS * DEG2RAD *
    (drive.hardResistance / drive.resistance) *
    (spec.pivotStyle === 'neutral' ? NEUTRAL_TURN_MULT : 1);
  const speedFraction = Math.min(
    Math.abs(state.speed) / Math.max(drive.topSpeed, 1e-6),
    1,
  );
  drive.traverseMax = healthyMax * debuff.powerMult * debuff.traverseMult *
    (1 - TRAVERSE_SPEED_SCALE * speedFraction * speedFraction);
  if (drive.grounded) {
    // lateral grip (impact physics): v·ω is bounded by what the tracks hold sideways on this ground under this gravity
    const lateralCap = LATERAL_GRIP_MPS2 * drive.gravityScale * (drive.hardResistance / drive.resistance) /
      Math.max(Math.abs(state.speed), 1);
    drive.traverseMax = Math.max(Math.min(drive.traverseMax, lateralCap), healthyMax * TRAVERSE_FLOOR_FRAC);
  }
  const reverseSteer = state.speed < -PIVOT_SPEED_EPS ? -1 : 1;
  let steerCommand = drive.steer * reverseSteer;
  steerCommand = casemateSteerCommand(entity, debuff, drive, steerCommand);
  const targetYawRate = steerCommand * drive.traverseMax;
  if (drive.grounded) {
    state.yawRate = approach(
      state.yawRate,
      targetYawRate,
      (Math.max(drive.traverseMax, 1e-6) / YAW_SPOOL_S) * dt,
    );
  }
  state.yaw = wrapAngle(state.yaw + state.yawRate * dt);
  if (drive.grounded && Math.abs(state.speed) < PIVOT_SPEED_EPS &&
      spec.pivotStyle === 'pivot' && steerCommand !== 0) {
    const drift = Math.sign(steerCommand) * PIVOT_OFFSET_M * Math.abs(state.yawRate) * dt;
    state.pos.x += drive.rightX * drift;
    state.pos.z += drive.rightZ * drift;
  }
}

function prepareTargetSpeed(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  drive: DriveStep,
): void {
  const { spec, state } = entity;
  const powerToWeight = spec.enginePowerHp * debuff.powerMult / spec.weightTons;
  drive.acceleration = K_ACCEL * (powerToWeight / drive.resistance) *
    debuff.accelMult * Math.sqrt(drive.speedMultiplier);
  const driveSign = drive.throttle !== 0 ? Math.sign(drive.throttle) : Math.sign(state.speed);
  const pitchAlong = drive.terrainPitch * (driveSign || 1);
  // a face steeper than the tracks hold in either direction: the drivetrain has no purchase (applySlopeForces slides)
  drive.gripLost = drive.grounded &&
    trackGripMargin(spec, drive.ground, Math.abs(drive.terrainPitch)) <= TERRAIN_MARGIN_EPS;
  drive.speedLimit = drive.throttle >= 0 ? drive.topSpeed : drive.reverseSpeed;
  drive.speedLimit *= slopeSpeedFactor(
    spec,
    drive.ground,
    pitchAlong,
    debuff.powerMult,
    debuff.accelMult,
  );
  drive.speedLimit = Math.min(drive.speedLimit, drive.topSpeed * OVERSPEED_CAP);
  drive.targetSpeed = (drive.braking || debuff.immobile)
    ? 0
    : drive.speedLimit * drive.throttle;
  if (drive.traverseMax > 1e-6 && drive.targetSpeed !== 0) {
    drive.targetSpeed *= 1 - TURN_SPEED_LOSS * Math.min(
      Math.abs(state.yawRate) / drive.traverseMax,
      1,
    );
  }
  drive.baseRate = debuff.immobile
    ? K_ACCEL * (spec.enginePowerHp / spec.weightTons) / drive.resistance
    : drive.acceleration;
  drive.brakeCap = clamp(
    BRAKE_CAP_BASE + BRAKE_CAP_PER_HPT * (spec.enginePowerHp / spec.weightTons),
    BRAKE_CAP_MIN,
    BRAKE_CAP_MAX,
  );
  drive.brakeRate = Math.min(drive.baseRate * BRAKE_MULT, drive.brakeCap);
}

function selectDriveRate(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  drive: DriveStep,
): void {
  const state = entity.state;
  drive.spoolTarget = 0;
  // Wrecks (2026-09-19, owner: "when a tank gets destroyed it should continue being affected by physics"):
  // the drivetrain is gone, so a moving hull skids on its locked tracks instead of braking at engine rate;
  // updateDriveSpool zeroes the rate in the air, so a launched wreck keeps its ballistic trajectory.
  if (debuff.wreck) {
    drive.rate = WRECK_SKID_DECEL_MPS2;
    return;
  }
  if (drive.gripLost) {
    // tracks without purchase neither drive nor brake; the engine still spools against them
    drive.rate = 0;
    drive.spoolTarget = drive.throttle !== 0 ? 1 : 0;
    return;
  }
  if (drive.braking || debuff.immobile || drive.targetSpeed * state.speed < 0) {
    drive.rate = drive.brakeRate;
    return;
  }
  if (drive.throttle === 0) {
    drive.rate = Math.min(drive.baseRate * COAST_MULT, drive.brakeCap * 0.5);
    return;
  }
  if (Math.abs(drive.targetSpeed) < Math.abs(state.speed) - 1e-9) {
    const transmissionLimit = Math.abs(drive.speedLimit * drive.throttle);
    drive.rate = Math.abs(state.speed) > transmissionLimit + 1e-9
      ? drive.baseRate
      : drive.baseRate * TURN_OVER_RATE;
    drive.spoolTarget = 1;
    return;
  }

  const referenceSpeed = Math.max(
    drive.throttle >= 0 ? drive.topSpeed : drive.reverseSpeed,
    1e-6,
  );
  const speedFraction = Math.min(Math.abs(state.speed) / referenceSpeed, 1);
  drive.rate = drive.baseRate * (1 - C_DRAG * speedFraction * speedFraction);
  const spool = state._spool || 0;
  drive.rate *= SPOOL_FLOOR + (1 - SPOOL_FLOOR) * spool * spool;
  drive.spoolTarget = 1;
  if (drive.traverseMax > 1e-6) {
    drive.rate *= 1 - TURN_POWER_DIVERT * Math.min(
      Math.abs(state.yawRate) / drive.traverseMax,
      1,
    );
  }
}

function updateDriveSpool(state: TankState, drive: DriveStep, dt: number): void {
  if (!drive.grounded) {
    drive.rate = 0;
  }
  state._spool = drive.spoolTarget > 0
    ? Math.min(1, (state._spool || 0) + dt / SPOOL_S)
    : Math.max(0, (state._spool || 0) - dt / SPOOL_DECAY_S);
}

function applyTurnSpeedBleed(state: TankState, drive: DriveStep, dt: number): void {
  if (!drive.grounded || drive.traverseMax <= 1e-6 || state.yawRate === 0) return;
  const fade = clamp(
    (Math.abs(state.speed) / Math.max(drive.topSpeed, 1e-6) - TURN_BLEED_FADE_LO) /
      (TURN_BLEED_FADE_HI - TURN_BLEED_FADE_LO),
    0,
    1,
  );
  state.speed *= 1 - TURN_DIRECT_BLEED * fade *
    Math.min(Math.abs(state.yawRate) / drive.traverseMax, 1) * dt;
}

function applySlopeForces(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  drive: DriveStep,
  speedBeforeSlope: number,
  dt: number,
): void {
  const { spec, state } = entity;
  const commandedPitch = drive.terrainPitch * Math.sign(drive.throttle || 1);
  const driveBlocked = drive.grounded && drive.throttle !== 0 && commandedPitch > 0 &&
    uphillDriveMargin(
      spec,
      drive.ground,
      commandedPitch,
      debuff.powerMult,
      debuff.accelMult,
    ) <= TERRAIN_MARGIN_EPS;
  const motionPitch = drive.terrainPitch * Math.sign(state.speed || drive.throttle || 1);
  const gripBlocked = drive.grounded && motionPitch > 0 &&
    trackGripMargin(spec, drive.ground, motionPitch) <= TERRAIN_MARGIN_EPS;
  if (driveBlocked || gripBlocked || drive.gripLost) state.slopeBlocked = true;
  // residual uphill speed never crosses a grade the tracks cannot hold (ARCHITECTURE §3.4)
  if (gripBlocked && state.speed * drive.terrainPitch > 0) {
    _blockedSpeed += Math.abs(state.speed);
    state.speed = 0;
  }
  if (!drive.grounded) return;
  const gravity = GRAVITY * drive.gravityScale;
  if (drive.gripLost) {
    // Impact physics (owner 2026-09-25: hulls "climbing walls"): a face steeper than the tracks hold is a slide,
    // not a hover — the full slope pull against sliding friction μ·g·cos θ, which opposes the motion and never
    // reverses it; there is no drive and no brake to hang on with, an immobilised hull slides the same.
    const pull = -gravity * Math.sin(drive.terrainPitch) * dt;
    const friction = trackSlideCoefficient(spec, drive.ground) * gravity * Math.abs(Math.cos(drive.terrainPitch)) * dt;
    let speed = state.speed + pull;
    speed = speed > 0 ? Math.max(0, speed - friction) : Math.min(0, speed + friction);
    state.speed = speed;
    return;
  }
  if (debuff.immobile) return;
  const slow = drive.throttle !== 0
    ? (1 - clamp((Math.abs(state.speed) - 1) / 2, 0, 1)) * (1 - (state._spool || 0))
    : 0;
  const gravityShare = gripBlocked
    ? 1
    : (drive.throttle !== 0 ? 0.3 + 0.7 * slow : 1);
  const pull = gravity * Math.sin(drive.terrainPitch);
  state.speed += -pull * dt * gravityShare;
  // static hold: a stopped hull with no throttle stays put when the holding decel (coast, brake or a wreck's
  // locked tracks) matches the grade's pull — no creep, no jitter at rest
  if (drive.throttle === 0 && Math.abs(speedBeforeSlope) < STATIC_HOLD_EPS_MPS && Math.abs(pull) <= drive.rate + 1e-9) {
    state.speed = 0;
  }
}

function applyClimbCreep(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  drive: DriveStep,
  speedBeforeAcceleration: number,
  dt: number,
): void {
  const { spec, state } = entity;
  if (!drive.grounded || drive.gripLost || drive.throttle === 0 || drive.braking || debuff.immobile ||
      drive.targetSpeed * drive.throttle <= 0) return;
  const drivable = slopeSpeedFactor(
    spec,
    drive.ground,
    drive.terrainPitch * Math.sign(drive.throttle),
    debuff.powerMult,
    debuff.accelMult,
  );
  if (drivable <= 0.01) return;
  const creep = CLIMB_CREEP_MPS2 * Math.min(1, drivable / 0.15);
  const direction = Math.sign(drive.targetSpeed);
  const wanted = Math.min(
    speedBeforeAcceleration * direction + creep * dt,
    Math.abs(drive.targetSpeed),
  );
  if (state.speed * direction < wanted) state.speed = direction * wanted;
}

function updateLongitudinalSpeed(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  drive: DriveStep,
  dt: number,
): void {
  const state = entity.state;
  prepareTargetSpeed(entity, debuff, drive);
  selectDriveRate(entity, debuff, drive);
  updateDriveSpool(state, drive, dt);
  const speedBeforeAcceleration = state.speed;
  state.speed = approach(state.speed, drive.targetSpeed, drive.rate * dt);
  applyTurnSpeedBleed(state, drive, dt);
  applySlopeForces(entity, debuff, drive, state.speed, dt);
  applyClimbCreep(entity, debuff, drive, speedBeforeAcceleration, dt);
  // a slide is not geared: a hull sliding backwards down a face is bounded by the top-speed cap, not the reverse gear;
  // nor is a flight (physics lane, 2026-10-03): a hull leaving a slide or a launch backwards kept 12 m/s one tick and
  // 5 m/s the next
  const reverseCap = drive.gripLost || !drive.grounded ? drive.topSpeed : drive.reverseSpeed;
  state.speed = clamp(
    state.speed,
    -reverseCap * OVERSPEED_CAP,
    drive.topSpeed * OVERSPEED_CAP,
  );
}

/**
 * Advance one tank by `dt` seconds: terrain-resistance-gated hp/t acceleration,
 * slope penalty/overspeed + gravity slide, pivot/neutral track steering with
 * reverse flip, 4-corner attitude spring with inertial pitch, turret/gun chase
 * of `input.aimPoint` with hull-space limits, and dispersion bloom integration.
 * Mutates `entity.state` in place; touches nothing else.
 *
 * @param {object} entity - `{ spec, state, input, combat }` (combat may be null ⇒ healthy).
 *   Optional `entity.rigidGear === true` (stamped by state.ts when the active
 *   visual lacks a complete wheel + track conformance layer) hard-clamps every
 *   support fan line — see the FAN_YIELD_* / r5 hard-gate note in the solve.
 * @param {object} heightField - `{ getHeightAt(x,z), getNormalAt(x,z), getGroundType(x,z) }`.
 * @param {number} dt - Timestep in seconds (SIM_DT in-game).
 * @param {?function} collide - Optional `(pos, radiusM, outPush) => boolean` circle
 *   pushback provided by integration; when it returns true, `outPush` is added to `pos`.
 * @returns {void}
 */
export function updateTank(
  entity: MovementEntity,
  heightField: MovementHeightField,
  dt: number,
  collide: MovementCollisionResolver | null = null,
): void {
  // perf-r3b: terrain probes below run dozens of times per tank per frame
  // (pose corners, per-wheel gear lines, muzzle clearance). Real battles
  // provide the baked 1 m grid (≤ ~1 cm from the analytic surface); selftest
  // fixtures don't and keep their exact synthetic function.
  // Height-field samplers are closure-backed pure functions in both browser
  // and headless worlds. Selecting the method reference directly avoids one
  // short-lived closure per tank per 60 Hz tick (and matches map/headless
  // collision callers).
  const hAt = heightField.getContactHeightAt ?? heightField.getHeightAtFast ?? heightField.getHeightAt;
  if (!(dt > 0)) return;
  const spec = entity.spec;
  const state = entity.state;
  const debuff = readDebuffs(entity.combat, state._debuff);
  const groundedAtStart = state.grounded !== false;
  const body = state._body;
  body.dynamicSupport = false;
  const upYAtStart = Math.cos(state.visualPitch || 0) * Math.cos(state.visualRoll || 0);
  // A grounded tank on extreme authored terrain still belongs to the normal
  // support solver. Enter the rigid tumble phase automatically only after the
  // center of mass has genuinely crossed the side; lesser tilts need a launch
  // or landing/contact impulse.
  if (upYAtStart < OVERTURN_ENTER_UP_Y) body.tumbling = true;
  state.overturned = state.overturned
    ? upYAtStart < OVERTURN_EXIT_UP_Y
    : upYAtStart < OVERTURN_ENTER_UP_Y;
  const landingImpactAtStart = Number.isFinite(state.landingImpactMps)
    ? state.landingImpactMps : 0;
  state.slopeBlocked = false;
  _blockedSpeed = 0;
  _rotationDrop = 0;
  _supportRate = 0;
  _tippedThisTick = false;
  _wholeTrackOnGround = true;

  const drive = prepareDriveStep(entity, heightField, debuff, body);
  updateHullTraverse(entity, debuff, drive, dt);
  updateLongitudinalSpeed(entity, debuff, drive, dt);

  // ---- integrate position (+ decaying recoil translation) & stick to terrain ----
  const spr = state._spring;
  integrateHorizontalMotion(spec, state, heightField, collide, drive.forwardX, drive.forwardZ, dt);

  // ---- terrain contact: line sampling, plane fit, attitude spring, SUPPORT ----
  // r5 hard-gate fix. The old model snapped pos.y to the height under the hull
  // CENTER and tilted a rigid plane from 4 corner samples — on 2–8 m terrain
  // features that buried the rendered tracks up to 1.7 m (and levitated the
  // whole contact patch on crests) because nothing ever resolved penetration.
  // Now: (1) sample N points along BOTH track contact lines at the settled
  // post-integration pose, (2) least-squares fit the terrain plane for the
  // spring targets, (3) after the spring step, raise pos.y to the LARGEST
  // height deficit over all contact samples (support-polygon clamp) so no
  // contact point renders below the heightfield and — since the max deficit
  // point sits exactly ON the ground — the patch can never fully levitate.
  const priorSpeed = state._prevSpeed;
  const dvdt = clamp((state.speed - priorSpeed) / dt, -DVDT_CLAMP, DVDT_CLAMP);
  // Braking in either direction gets a slightly softer visual transfer than
  // acceleration. This removes the exaggerated nose lurch without muting
  // launch squat or collision flinch.
  // A slide has no traction to transfer weight with (physics lane, 2026-10-03): a hull sliding down a face it cannot
  // hold dipped its nose 0.1 rad under the slide's own acceleration, lost the face with its tail and bounced down it.
  const poseDvdt = drive.gripLost ? 0 : priorSpeed * dvdt < 0 ? dvdt * BRAKE_DIVE_MULT : dvdt;
  const inertialPitch = clamp(K_INERTIA * poseDvdt, -INERTIA_CLAMP, INERTIA_CLAMP);
  state._prevSpeed = state.speed;

  // Predicted visual turn-lean sway (tankFactory adds it to rotation.z): fold
  // it into the effective roll so hard fast turns keep the leaned track edge
  // above ground too.
  const swayTarget = clamp(state.yawRate * state.speed * SWAY_GAIN, -SWAY_CLAMP, SWAY_CLAMP);
  state._swayEst += (swayTarget - state._swayEst) *
    (1 - Math.exp(-dt / SWAY_TAU_S));

  // ---- hit-flinch rock: integrate the visual layer's damped oscillator ------
  // (constants in lockstep with tankFactory FLINCH_W/FLINCH_Z; impulses arrive
  // via state._flinch.pv/rv from the visual's hitFlinch/recoil rock). Stepped
  // once per sim tick BEFORE the support sampling so both the sample pass and
  // the final clamp see the exact pose syncFromState will render this tick.
  updateFlinchRock(state, dt);
  const flP = state._flinch?.p ?? 0;
  const flR = state._flinch?.r ?? 0;

  const susp = state._susp;

  // ---- hull attitude spring: terrain target + inertial pitch (nose dip/lift) ----
  // PERCH boost (see the constants): balancing on a single line-end contact
  // stiffens/critically-damps the PITCH axis so the hull tips onto its second
  // contact at gravity rate instead of hanging off one end for several ticks.
  state._perch = groundedAtStart
    ? Math.max(0, (state._perch || 0) - dt / PERCH_RELEASE_S)
    : 0;
  const perch = state._perch;
  // Swedish siege TDs have no conventional elevation mechanism: their
  // hydropneumatic suspension tilts the complete hull toward the sight line.
  // The mode is opt-in via the special-action edge. It feeds the same spring
  // and support solve used by terrain pitch, so it adds no render-time work or
  // duplicate collision pose. At rest, the existing static-pose cache resumes.
  const fixedHydraulicGun = hasFixedHydraulicGun(spec);
  const suspensionAimPitch = updateSuspensionAim(entity, fixedHydraulicGun, dt);
  // Once unsupported, terrain below cannot torque the hull. The spring's two
  // rate fields become the rigid body's pitch/roll angular velocity until
  // contact resumes, so the launch attitude evolves continuously instead of
  // being critically damped in mid-air. Reusing this already-authoritative
  // state keeps snapshots, armor pose and local prediction on one attitude.
  const targetPitch = groundedAtStart
    ? state._terr.pitch + inertialPitch + suspensionAimPitch
    : spr.pitch;
  const targetRoll = groundedAtStart ? state._terr.roll : spr.roll;
  updateHullAttitude(
    state,
    body,
    groundedAtStart,
    targetPitch,
    targetRoll,
    perch,
    landingImpactAtStart,
    upYAtStart,
    dt,
    state._terr.pitch + suspensionAimPitch,
    state._terr.roll,
    drive,
  );
  const upYAfterAttitude = Math.cos(state.visualPitch) * Math.cos(state.visualRoll);

  // ---- mirror of tankFactory's visual susp rock layer -----------------------
  // syncFromState (which runs right after this tick) will render the hull at
  // rotation.set(-(visualPitch + suspP), yaw, visualRoll + suspR + sway) —
  // replicate its spring tick-for-tick so the support solve below clears the
  // terrain at the pose that actually reaches the screen.
  updateSuspensionRock(spec, state, hAt, groundedAtStart, poseDvdt, perch, dt);

  // ---- support solve: no contact sample below ground at the rendered pose ----
  // Effective RENDERED attitude (movement space): rotation.x = -(pitch +
  // suspP×VIS) + flinchP ⇒ flinch pitch enters with a MINUS sign here; roll
  // adds. The susp/sway layers carry the renderer's visibility amplification.
  // Sampling, plane fit and clamp all run at THIS post-step attitude in one
  // pass — sampling at the pre-step attitude left a Δattitude × lever × slope
  // height error that the visibility amplification turned into multi-cm
  // track burial on rough ground (r3 drive gate). The fit lands in state._terr
  // for the NEXT tick's spring targets/slope logic (one-tick-old plane —
  // imperceptible at 60 Hz, and exactly the pre-existing contract).
  const pitchEff = spr.pitch + susp.p * SUSP_VIS_P - flP;
  const rollEff = spr.roll + susp.r * SUSP_VIS_R + state._swayEst * SWAY_VIS + flR;
  // Static-pose cache: a parked, settled tank re-uses the solved height instead
  // of re-sampling the (static) heightfield every tick. The rigid-gear flag is
  // part of the key: a GLB swap landing on a PARKED tank (deferred stream-in)
  // must re-solve immediately with the yield zeroed, not sit on a stale
  // yielded height with rigid wheels in the dirt.
  solveSupportHeight(
    entity,
    hAt,
    groundedAtStart,
    pitchEff,
    rollEff,
    upYAfterAttitude,
    suspensionAimPitch,
    dt,
  );

  // The ground's grade along the travel under a hull in flight, per horizontal metre (physics lane, 2026-10-03). The
  // track samples just taken lie at z·cos(pitch) along the travel, so their fit reads the grade times that cosine; past
  // 72 degrees of pitch they stack over one point and two world samples read it instead. A hull that left a 45-degree
  // flank nose-down read the flank as level, landed on it at 18.7 m/s "closing" against ground that was falling away at
  // 14.4 m/s under its travel, and took 4632 hp.
  if (!groundedAtStart) {
    const cosPitch = Math.cos(pitchEff);
    _airGrade = Math.abs(cosPitch) > AIR_GRADE_MIN_COS
      ? Math.tan(state._terr.fitPitch) / cosPitch
      : worldGradeAlong(hAt, state.pos.x, state.pos.z, drive.forwardX, drive.forwardZ);
  }
  // Loaded suspension follows the support envelope; once the droop limit is
  // exceeded, the chassis uses an independent ballistic phase until landing.
  updateVerticalContact(state, groundedAtStart, dt, drive);

  updateGunLay(entity, debuff, hAt, drive.gunArc, drive.steer, dt);
  updateTrackScrollAndBloom(spec, state, debuff, dt);
}

/** Shared selector for sim, tank visual and camera presentation recoil. */
export function shotRecoilScale(
  spec: MovementSpec,
  shellSpec: MovementShellSpec | null = null,
): number {
  const cycleS = (shellSpec && shellSpec.reloadS) || spec.gun.reloadS;
  if (spec.gun.launcherMuzzles?.length) {
    if (usesLauncherMuzzles(spec.gun, shellSpec)) return 0;
    if (cycleS <= IFV_AUTOCANNON_MAX_CYCLE_S) return IFV_AUTOCANNON_RECOIL_SCALE;
  }
  return spec.role === 'ifv' && cycleS <= IFV_AUTOCANNON_MAX_CYCLE_S
    ? IFV_AUTOCANNON_RECOIL_SCALE : 1;
}

/**
 * Apply firing recoil (movement doc §6.4): a pitch/roll-rate kick to the hull
 * attitude spring that tips the hull away from the muzzle, a small backward
 * translation impulse that decays over ~0.4 s, and the afterShot bloom multiplier.
 * Call once per shot, after createShell (ARCHITECTURE §4 step 2c).
 *
 * @param {object} state - TankState of the firing tank (mutated).
 * @param {object} spec - TankSpec of the firing tank.
 * @param {object|null} shellSpec - Fired shell; distinguishes autocannon belts
 *   from the slower missile rail carried by the same IFV.
 * @returns {void}
 */
/** Ruleset launch request: the fired shell's world direction and the mode's recoil launch scale. */
export interface RecoilLaunch { scale: number; dirX: number; dirY: number; dirZ: number }

/** The slice of a movement state a jump or lift touches; TankState and the client's action state both satisfy it. */
interface LiftableState {
  overturned?: boolean;
  grounded?: boolean;
  verticalSpeed?: number;
  _ride?: { y?: number; v?: number; airTime?: number; grounded?: boolean; supportY?: number };
}

/** Lift the ride into flight: vertical velocity plus an immediate detach, so the next tick integrates the airborne
 * parabola instead of the loaded suspension spring (which would damp a 9 m/s launch to under 1 m/s in one step). */
function liftTankRide(state: LiftableState, upMps: number): void {
  if (!(upMps > 0)) return;
  state.verticalSpeed = Math.max(state.verticalSpeed || 0, 0) + upMps;
  const ride = state._ride;
  if (ride) {
    ride.v = Math.max(ride.v || 0, 0) + upMps;
    ride.airTime = 0;
    if (Number.isFinite(ride.y)) ride.y = (ride.y as number) + RIDE_DETACH_CLEARANCE_M + 0.005;
    ride.grounded = false;
  }
  state.grounded = false;
}

/**
 * Jump (owner 2026-09-16, Turbo Ball F key): an upright hull gets `jumpMps` of upward velocity. Refused when
 * overturned or when the mode has no jump, so the key keeps its self-right meaning elsewhere. Round 30 (owner
 * 2026-09-20): it is a rocket — an airborne hull boosts again after JUMP_AIR_REPEAT_S of flight, so a held run
 * of presses climbs, and the ruleset launches are stronger.
 *
 * Physics lane (2026-10-03): the rocket has a ceiling. Each air boost used to add its full launch on top of the
 * climb, so mashing the key stacked +12.5 m/s every 0.35 s and flew a hull 6.6 km up on the Moon (262 m at 1 g).
 * A boost now tops the upward speed up to what carries the hull JUMP_CEILING_APEXES single-jump apexes above the
 * ground under it — a full double jump at the apex, then a hover at the ceiling — never further. `gravityScale` is
 * the ruleset's (entity.modeGravityScale); the ground is the ride's support seat.
 */
export function requestTankJump(
  state: LiftableState | null | undefined,
  jumpMps: number | null | undefined,
  gravityScale = 1,
): boolean {
  if (!state || !(jumpMps != null && jumpMps > 0)) return false;
  if (state.overturned === true) return false;
  const ride = state._ride;
  const airborne = state.grounded === false || (ride ? (ride.airTime || 0) > JUMP_AIRTIME_GRACE_S : false);
  if (airborne && ride && (ride.airTime || 0) < JUMP_AIR_REPEAT_S) return false;
  if (!airborne || !ride) {
    liftTankRide(state, jumpMps);
    return true;
  }
  const gravity = GRAVITY * clamp(Number.isFinite(gravityScale) ? gravityScale : 1, 0.1, 3);
  const ceiling = JUMP_CEILING_APEXES * jumpMps * jumpMps / (2 * gravity);
  const y = Number.isFinite(ride.y) ? ride.y as number : 0;
  const ground = Number.isFinite(ride.supportY) ? ride.supportY as number : y;
  const room = ceiling - Math.max(0, y - ground);
  const rising = Math.max(ride.v || 0, 0);
  const wanted = Math.min(rising + jumpMps, room > 0 ? Math.sqrt(2 * gravity * room) : 0);
  if (wanted <= rising + 1e-3) return false;
  liftTankRide(state, wanted - rising);
  return true;
}

/**
 * Shove a shell impact gives the hull it hits (owner 2026-09-16: "shells should have more physics effects that
 * knock you"): metres per second from calibre squared, shell speed and the victim's mass, times the ruleset scale.
 */
export function shellKnockMps(caliberMm: number, shellSpeedMps: number, massTons: number, scale = 1): number {
  const cal = clamp((caliberMm || 105) / 105, 0.3, 2.2);
  const speed = clamp((shellSpeedMps || 800) / 900, 0.3, 2.0);
  const mass = massTons > 0 ? clamp(45 / massTons, 0.4, 2.5) : 1;
  return Math.min(9, 1.3 * cal * cal * speed * mass * Math.max(0, scale));
}

/** Apply an impact shove along the shell's world direction: a decaying translation impulse (the hull is shoved,
 * the drivetrain speed is untouched so a hit never becomes a lasting drive input — balance duels stay stable),
 * an attitude rock, and for heavy shoves a lift of the ride. */
export function applyShellKnock(state: TankState, dirX: number, dirY: number, dirZ: number, knockMps: number): void {
  if (!(knockMps > 0)) return;
  const h = Math.hypot(dirX, dirZ) || 1;
  const kx = dirX / h, kz = dirZ / h;
  const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
  const along = kx * fx + kz * fz;
  const spr = state._spring;
  spr.recoilVX += kx * knockMps * KNOCK_TRANSLATION_GAIN;
  spr.recoilVZ += kz * knockMps * KNOCK_TRANSLATION_GAIN;
  spr.pitchV += -along * knockMps * 0.12;
  spr.rollV += (kx * fz - kz * fx) * knockMps * 0.12;
  if (knockMps > 2.5) liftTankRide(state, (knockMps - 2.5) * 0.35 + Math.max(0, dirY) * knockMps * 0.3);
}

export function fireRecoil(
  state: TankState,
  spec: MovementSpec,
  shellSpec: MovementShellSpec | null = null,
  launch: RecoilLaunch | null = null,
): void {
  const cal = spec.gun.caliberMm;
  const heavy = clamp((cal - 75) / 85, 0, 1); // 75 mm → light kick, 160 mm+ → max
  const kick = (RECOIL_KICK_MIN_DEGS + (RECOIL_KICK_MAX_DEGS - RECOIL_KICK_MIN_DEGS) * heavy)
    * DEG2RAD;
  const recoilScale = shotRecoilScale(spec, shellSpec);
  const spr = state._spring;
  // Split the kick onto hull axes from the gun's hull-relative azimuth:
  // firing forward lifts the nose; firing over the right side rocks the hull
  // left-side-down (= right side UP: positive roll under the renderer's
  // rotation.z = +visualRoll composition — see the roll-sign note up top).
  const ct = Math.cos(state.turretYaw), st = Math.sin(state.turretYaw);
  // In flight there is no suspension to rock against: the shot turns the whole hull about its centre of mass, the
  // impulse times the gun's height over the hull's inertia — a tenth of the rock (physics lane, 2026-10-03; at Mars
  // gravity a bot firing through a boost flight pitched over 95 degrees and came down on its back: the ground rock's
  // kick, three times a flight, and the air does not damp it back)
  const turn = state.grounded === false ? AIR_RECOIL_TURN_SCALE : 1;
  spr.pitchV += kick * ct * recoilScale * turn;
  spr.rollV += kick * st * recoilScale * turn;
  // Backward translation impulse along the horizontal gun direction.
  const gunYawWorld = state.yaw + state.turretYaw;
  const v = RECOIL_VEL_MPS * (0.7 + 0.6 * heavy) * recoilScale;
  spr.recoilVX -= Math.sin(gunYawWorld) * v;
  spr.recoilVZ -= Math.cos(gunYawWorld) * v;
  if (launch && launch.scale > 1) {
    // Ruleset launch (Turbo Ball): the recoil becomes a real velocity change opposite the muzzle — fire behind you
    // for a speed boost, fire downward to hop. The part along the hull joins the run speed, the lateral part rides
    // the decaying translation, the vertical part lifts the ride.
    const launchV = v * (launch.scale - 1);
    const h = Math.hypot(launch.dirX, launch.dirZ) || 1;
    const lx = -launch.dirX / h, lz = -launch.dirZ / h;
    const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
    const along = lx * fx + lz * fz;
    const down = Math.max(0, -launch.dirY);
    const horizontal = launchV * (1 - down);
    state.speed = clamp(state.speed + along * horizontal, -LAUNCH_SPEED_CAP_MPS, LAUNCH_SPEED_CAP_MPS);
    spr.recoilVX += (lx - along * fx) * horizontal * 0.5;
    spr.recoilVZ += (lz - along * fz) * horizontal * 0.5;
    if (down > 0.05) liftTankRide(state, launchV * down);
  }
  const rapidIfvShot = recoilScale < 1;
  const afterShotBloom = rapidIfvShot
    ? Math.min(spec.gun.bloom.afterShot, IFV_AUTOCANNON_AFTER_SHOT_BLOOM)
    : spec.gun.bloom.afterShot;
  state.bloomF *= afterShotBloom;
}

/**
 * Reticle dispersion radius r(D) in meters at range `distM` (movement doc §8):
 * `r(D) = baseAccuracy × (D / 100) × bloomF` where baseAccuracy is 2σ at 100 m.
 *
 * @param {object} spec - TankSpec.
 * @param {object} state - TankState (reads `bloomF`).
 * @param {number} distM - Range to the aim point in meters.
 * @returns {number} Dispersion radius (2σ) in meters at that range.
 */
export function computeDispersionRadM(
  spec: { gun: Pick<MovementGunSpec, 'baseAccuracy'> },
  state: { bloomF: number },
  distM: number,
): number {
  return spec.gun.baseAccuracy * (distM / 100) * state.bloomF;
}
