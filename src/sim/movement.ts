/**
 * movement.ts — pure-logic tank movement, attitude, turret/gun kinematics and
 * dispersion bloom. Implements docs/research/movement-physics.md §2–§8 and §10
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
import {
  DRIVE_ACCEL_PER_HPT as K_ACCEL,
  GRAVITY_MPS2 as GRAVITY,
  TERRAIN_MARGIN_EPS,
  trackGripMargin,
  uphillDriveMargin,
} from './terrainMobility.ts';
import type { TerrainMobilitySpec } from './terrainMobility.ts';

type Vec3Tuple = readonly [number, number, number];
type HeightSampler = (x: number, z: number) => number;

export interface MovementGunSpec {
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

interface RideState {
  y: number;
  v: number;
  supportY: number;
  groundV: number;
  grounded: boolean;
  airTime: number;
}

interface RigidBodyState {
  tumbling: boolean;
  landingBlendS: number;
  dynamicSupport: boolean;
  autoRighting: boolean;
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
  _spring: AttitudeSpringState;
  _prevSpeed: number;
  _spool: number;
  _terr: { pitch: number; roll: number };
  _fanYield: number;
  _perch: number;
  _gunLimitHoldS: number;
  _swayEst: number;
  _susp: RockState;
  _flinch: RockState;
  _ride: RideState;
  _body: RigidBodyState;
  _rollover: { elapsedS: number; expired: boolean };
  _groundType: string;
  _debuff: MovementDebuffs;
  _sup: SupportCache;
}

export interface MovementInput {
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
  rigidGear?: boolean;
}

export interface MovementHeightField {
  getHeightAt: HeightSampler;
  getHeightAtFast?: HeightSampler;
  getGroundType(x: number, z: number): string;
}

export type MovementCollisionResolver = (
  position: Vector3,
  radiusM: number,
  outPush: Vector3,
) => boolean;

export interface MovementShellSpec {
  reloadS?: number;
}

/** Fixed simulation step in seconds (ARCHITECTURE §1.1). */
export const SIM_DT = 1 / 60;

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
const RIDE_SUPPORT_V_CAP = 12;         // m/s; bounds extreme launch ramps
// Contact is released once the terrain falls beyond full track droop. The old
// solver clamped the root to `support + droop` forever, effectively applying
// an unbounded downward constraint across cliffs. Free flight preserves the
// last support-relative vertical velocity and integrates gravity until the
// extended running gear intersects terrain again.
const RIDE_DETACH_CLEARANCE_M = 0.015;
const RIDE_DETACH_REL_V_MPS = 0.20;
// Unsupported hull attitude is a rigid-body phase. Angular momentum decays
// only very lightly in air; ground contact supplies the strong damping and
// gravity torque. This is intentionally separate from the suspension spring:
// using that spring in flight erased launch rotation, then produced a sharp
// nose lurch when a long jump reacquired terrain.
const AIR_ANGULAR_DRAG_S = 0.055;
const AIR_ANGULAR_SPEED_MAX = 1.15; // rad/s; ordinary launch-rate bound
const TUMBLE_ANGULAR_SPEED_MAX = 2.8; // collisions/rollovers may rotate faster
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
// docs/research/movement-physics.md for the movement model.
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
// movement contract in docs/research/movement-physics.md — the solve is the
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
// impulses into it (see docs/research/movement-physics.md).
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
const RECOIL_KICK_MIN_DEGS = 8;  // spring pitch-rate kick, light gun
const RECOIL_KICK_MAX_DEGS = 15; // spring pitch-rate kick, heavy gun
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
// carries `turretless: true` (every fixed-mount vehicle in the roster: strv103,
// jagdtiger, jpz_e100, sturmtiger, t95 and the ISU variants) defaults to ±CASEMATE_ARC_DEG
// per the doc's ±10–15° band. Turreted tanks (arc = Infinity) are untouched.
const CASEMATE_ARC_DEG = 11;
// Excess-over-arc that commands a FULL-RATE hull traverse; below it the
// synthesized steer is proportional (a P-controller on the excess), so the
// hull eases onto the target and the residual decays exponentially
// (tau = ramp / traverse-rate ≈ 0.2 s) instead of parking a fixed error —
// the settled gun lands ON the aim point, not a deadband short of it.
const AUTO_TRAVERSE_RAMP_RAD = 8 * DEG2RAD;

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
};
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
  out.gunYellow = modules.gun?.state === 'yellow';
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
    _spring: {
      pitch: 0, roll: 0, pitchV: 0, rollV: 0, // attitude spring state
      recoilVX: 0, recoilVZ: 0,               // decaying hull translation impulse
    },
    _prevSpeed: 0,
    _spool: 0,                     // engine torque spool 0..1 (SPOOL_S ramp)
    _terr: { pitch: 0, roll: 0 },  // last terrain plane fit (spring target source)
    _fanYield: 0,                  // slew-limited wheel-line yield (support solve)
    _perch: 0,                     // 0..1 single-end perch factor (spring boost)
    _gunLimitHoldS: 0,             // continuous-pin dwell for the GUN LIMIT label
    _swayEst: 0,                   // predicted visual turn-lean sway (rad)
    _susp: { p: 0, r: 0, pv: 0, rv: 0 }, // mirror of the visual susp rock layer
    _flinch: { p: 0, r: 0, pv: 0, rv: 0 }, // hit-flinch rock (impulses fed by the visual)
    _ride: { // sprung vertical chassis motion + deterministic airborne phase
      y: pos.y, v: 0, supportY: NaN, groundV: 0, grounded: true, airTime: 0,
    },
    _body: { // rigid attitude/contact state; dormant during ordinary driving
      tumbling: false, landingBlendS: 0, dynamicSupport: false, autoRighting: false,
    },
    _rollover: { elapsedS: 0, expired: false },
    _groundType: 'medium',
    _debuff: { // reused hot-loop output; readDebuffs allocates nothing per tick
      immobile: false,
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
  state._sup.x = NaN;
  state._body.landingBlendS = 0;
  state._body.dynamicSupport = false;
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
    -RIDE_SUPPORT_V_CAP,
    RIDE_SUPPORT_V_CAP,
  );
  const groundAlpha = 1 - Math.exp(-dt / RIDE_GROUND_V_TAU);
  ride.groundV += (rawGroundV - ride.groundV) * groundAlpha;
  ride.supportY = supportY;
}

function advanceAirborneRide(
  state: TankState,
  ride: RideState,
  dt: number,
  contactY: number,
  floorY: number,
): boolean {
  ride.v -= GRAVITY * dt;
  ride.y += ride.v * dt;
  ride.airTime = (ride.airTime || 0) + dt;
  // A rising hull must not be grabbed back out of flight by a ramp below it.
  if (ride.y > contactY || ride.v > ride.groundV + RIDE_DETACH_REL_V_MPS) return false;
  state.landingImpactMps = Math.max(0, ride.groundV - ride.v);
  ride.y = Math.max(contactY, floorY);
  ride.airTime = 0;
  return true;
}

function constrainLoadedRide(
  ride: RideState,
  supportY: number,
  contactY: number,
  floorY: number,
  dt: number,
): boolean {
  const clearOfDroop = ride.y - contactY > RIDE_DETACH_CLEARANCE_M;
  const separating = ride.v - ride.groundV > RIDE_DETACH_REL_V_MPS;
  if (clearOfDroop && separating) {
    ride.airTime = 0;
    return false;
  }

  ride.airTime = 0;
  ride.v += (RIDE_OMEGA * RIDE_OMEGA * (supportY - ride.y) +
    2 * RIDE_ZETA * RIDE_OMEGA * (ride.groundV - ride.v)) * dt;
  ride.y += ride.v * dt;
  if (ride.y < floorY) {
    ride.y = floorY;
    if (ride.v < ride.groundV) ride.v = ride.groundV;
    return true;
  }
  if (ride.y <= contactY) return true;
  if (ride.v - ride.groundV > RIDE_DETACH_REL_V_MPS) return false;
  ride.y = contactY;
  if (ride.v > ride.groundV) ride.v = ride.groundV;
  return true;
}

function updateVerticalContact(state: TankState, groundedAtStart: boolean, dt: number): void {
  const supportY = state._sup.y;
  const floorY = Number.isFinite(state._sup.floorY) ? state._sup.floorY : supportY;
  const ride = initializeRideState(state, supportY);
  updateRideSupportVelocity(ride, supportY, dt);
  const contactY = supportY + RIDE_DROOP_M;
  const grounded = groundedAtStart
    ? constrainLoadedRide(ride, supportY, contactY, floorY, dt)
    : advanceAirborneRide(state, ride, dt, contactY, floorY);
  state.grounded = grounded;
  ride.grounded = grounded;
  state.verticalSpeed = ride.v;
  state.pos.y = ride.y;
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

function updateHydraulicGunLay(
  spec: MovementSpec,
  state: TankState,
  solution: GunLaySolution,
  steer: number,
  dt: number,
): void {
  state.turretYaw = 0;
  state.gunPitch = 0;
  const hydraulicAim = spec.hydropneumaticAim;
  const noseDown = (hydraulicAim?.noseDownDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_DOWN_DEG) * DEG2RAD;
  const noseUp = (hydraulicAim?.noseUpDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_UP_DEG) * DEG2RAD;
  const requestedPitch = state.suspensionAimPitch + solution.gunPitch;
  const yawPinned = Math.abs(wrapAngle(solution.turretYaw)) > 1e-4;
  const pitchPinned = !state.suspensionAim ||
    requestedPitch < -noseDown - 1e-4 || requestedPitch > noseUp + 1e-4;
  state.atGunLimit = yawPinned || pitchPinned;
  const labelWanted = Math.abs(steer) < 0.2 && state.atGunLimit &&
    solution.horizontalDistance >= GUN_LIMIT_LABEL_DIST_M;
  updateGunLimitDwell(state, labelWanted, dt);
}

function clampCasemateYaw(state: TankState, requestedYaw: number, gunArc: number): boolean {
  if (gunArc === Infinity) return false;
  state.turretYaw = clamp(state.turretYaw, -gunArc, gunArc);
  return Math.abs(wrapAngle(requestedYaw)) > gunArc + 1e-4;
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
  const yawPinned = clampCasemateYaw(state, solution.turretYaw, gunArc);
  const mechanicalLow = -spec.gunDepressionDeg * DEG2RAD;
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
      updateHydraulicGunLay(spec, state, solution, steer, dt);
    } else {
      updateConventionalGunLay(spec, state, debuff, solution, hAt, gunArc, steer, dt);
    }
  } else if (input.aimLocked) {
    // Holding the gun is deliberate rather than a mechanical limit.
    state.atGunLimit = false;
    state.gunLimitSpec = false;
    state._gunLimitHoldS = 0;
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
  let target = Math.sqrt(1 +
    (bloom.move * Math.abs(state.speed) * 3.6) ** 2 +
    (bloom.hullRot * Math.abs(state.yawRate) * RAD2DEG) ** 2 +
    (bloom.turret * Math.abs(state.turretYawRate) * RAD2DEG) ** 2);
  if (debuff.bloomMult !== 1) target = 1 + (target - 1) * debuff.bloomMult;
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

function integrateHorizontalMotion(
  spec: MovementSpec,
  state: TankState,
  collide: MovementCollisionResolver | null,
  forwardX: number,
  forwardZ: number,
  dt: number,
): void {
  const spring = state._spring;
  state.pos.x += (forwardX * state.speed + spring.recoilVX) * dt;
  state.pos.z += (forwardZ * state.speed + spring.recoilVZ) * dt;
  const recoilDecay = Math.exp(-dt / RECOIL_DECAY_TAU);
  spring.recoilVX *= recoilDecay;
  spring.recoilVZ *= recoilDecay;
  if (!collide) return;

  const radiusM = spec.armor?.boundingRadiusM ?? spec.dims.hullLengthM * 0.5;
  _push.set(0, 0, 0);
  state.impactMps = 0;
  if (!collide(state.pos, radiusM, _push)) return;
  state.pos.add(_push);
  const pushForward = _push.x * forwardX + _push.z * forwardZ;
  const travel = Math.abs(state.speed) * dt;
  if (travel <= 1e-9 || pushForward * state.speed >= 0) return;

  const blockedFraction = clamp(Math.abs(pushForward) / travel, 0, 1);
  const lostSpeed = Math.abs(state.speed) * blockedFraction;
  state.speed *= 1 - blockedFraction;
  state.impactMps = lostSpeed;
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
  _aimLocal.copy(aim).sub(_gunOriginWorld).applyQuaternion(_hullQuat.conjugate());
  _hullQuat.conjugate();
  const pitchError = Math.atan2(
    _aimLocal.y,
    Math.max(Math.hypot(_aimLocal.x, _aimLocal.z), 1e-6),
  );
  return suspensionPitch + pitchError * Math.min(1, dt * 4);
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
    const airDrag = Math.exp(-AIR_ANGULAR_DRAG_S * dt);
    spring.pitchV *= airDrag;
    spring.rollV *= airDrag;
  }

  const angularCap = body.tumbling ? TUMBLE_ANGULAR_SPEED_MAX : AIR_ANGULAR_SPEED_MAX;
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
  const pitchOmega = SPRING_OMEGA * springScale * (1 + PERCH_W_BOOST * perch);
  const pitchZeta = SPRING_ZETA + (1 - SPRING_ZETA) * perch;
  spring.pitchV += (pitchOmega * pitchOmega * (targetPitch - spring.pitch) -
    2 * pitchZeta * pitchOmega * spring.pitchV) * dt;
  spring.pitch += spring.pitchV * dt;
  const rollOmega = SPRING_OMEGA * springScale;
  spring.rollV += (rollOmega * rollOmega * (targetRoll - spring.roll) -
    2 * SPRING_ZETA * rollOmega * spring.rollV) * dt;
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
): void {
  applyLandingAttitudeImpulse(
    state,
    body,
    targetPitch,
    targetRoll,
    landingImpact,
    upYAtStart,
  );
  if (!groundedAtStart || body.tumbling) {
    updateRigidAttitude(state, body, groundedAtStart, landingImpact, dt);
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
    const frontLeft = hAt(x + forwardX * halfLength - rightX * halfWidth,
      z + forwardZ * halfLength - rightZ * halfWidth);
    const frontRight = hAt(x + forwardX * halfLength + rightX * halfWidth,
      z + forwardZ * halfLength + rightZ * halfWidth);
    const rearLeft = hAt(x - forwardX * halfLength - rightX * halfWidth,
      z - forwardZ * halfLength - rightZ * halfWidth);
    const rearRight = hAt(x - forwardX * halfLength + rightX * halfWidth,
      z - forwardZ * halfLength + rightZ * halfWidth);
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
  samples.fitSinPitch = Math.sin(state._terr.pitch);
  samples.fitCosPitch = Math.cos(state._terr.pitch);
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
      if (deficit > samples.outerMax) samples.outerMax = deficit;
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

function updateTerrainFitAndPerch(
  state: TankState,
  samples: SupportSamples,
  halfWidth: number,
  groundedAtStart: boolean,
): void {
  state._terr.pitch = Math.atan2(samples.sumHeightZ, samples.sumZZ);
  state._terr.roll = Math.atan2(
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
  state._terr.pitch += clamp(tip, -SETTLE_CLAMP_RAD, SETTLE_CLAMP_RAD);
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
    state,
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
  const rigidSupportY = rigidBodySupport(
    spec,
    state,
    samples,
    hAt,
    gearBottomY,
    state._body.tumbling || upY < TUMBLE_ENTER_UP_Y,
  );
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

function prepareDriveStep(
  entity: MovementEntity,
  heightField: MovementHeightField,
  debuff: MovementDebuffs,
  body: RigidBodyState,
): DriveStep {
  const { input, spec, state } = entity;
  const drive = _driveStep;
  drive.grounded = state.grounded !== false;
  const drivetrainLocked = debuff.immobile || body.tumbling || state.overturned;
  drive.throttle = drivetrainLocked ? 0 : clamp(input.throttle || 0, -1, 1);
  drive.steer = drivetrainLocked ? 0 : clamp(input.steer || 0, -1, 1);
  drive.braking = !!input.brake;
  drive.ground = drive.grounded
    ? heightField.getGroundType(state.pos.x, state.pos.z)
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

function casemateSteerCommand(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  drive: DriveStep,
  fallback: number,
): number {
  const { input, state } = entity;
  if (drive.steer !== 0 || drive.gunArc === Infinity || !input.aimPoint ||
      input.aimLocked || debuff.immobile) return fallback;
  const requestedYaw = wrapAngle(Math.atan2(
    input.aimPoint.x - state.pos.x,
    input.aimPoint.z - state.pos.z,
  ) - state.yaw);
  const excess = Math.abs(requestedYaw) - drive.gunArc;
  if (excess <= 0) return fallback;
  return clamp(excess / AUTO_TRAVERSE_RAMP_RAD, 0, 1) * Math.sign(requestedYaw);
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
    drive.spoolTarget = 0;
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
  if (driveBlocked || gripBlocked) state.slopeBlocked = true;
  if (gripBlocked && state.speed * drive.terrainPitch > 0) state.speed = 0;
  if (!drive.grounded || debuff.immobile) return;
  const slow = drive.throttle !== 0
    ? (1 - clamp((Math.abs(state.speed) - 1) / 2, 0, 1)) * (1 - (state._spool || 0))
    : 0;
  const gravityShare = gripBlocked
    ? 1
    : (drive.throttle !== 0 ? 0.3 + 0.7 * slow : 1);
  state.speed += -GRAVITY * Math.sin(drive.terrainPitch) * dt * gravityShare;
}

function applyClimbCreep(
  entity: MovementEntity,
  debuff: MovementDebuffs,
  drive: DriveStep,
  speedBeforeAcceleration: number,
  dt: number,
): void {
  const { spec, state } = entity;
  if (!drive.grounded || drive.throttle === 0 || drive.braking || debuff.immobile ||
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
  applySlopeForces(entity, debuff, drive, dt);
  applyClimbCreep(entity, debuff, drive, speedBeforeAcceleration, dt);
  state.speed = clamp(
    state.speed,
    -drive.reverseSpeed * OVERSPEED_CAP,
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
  const hAt = heightField.getHeightAtFast || heightField.getHeightAt;
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

  const drive = prepareDriveStep(entity, heightField, debuff, body);
  updateHullTraverse(entity, debuff, drive, dt);
  updateLongitudinalSpeed(entity, debuff, drive, dt);

  // ---- integrate position (+ decaying recoil translation) & stick to terrain ----
  const spr = state._spring;
  integrateHorizontalMotion(spec, state, collide, drive.forwardX, drive.forwardZ, dt);

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
  const poseDvdt = priorSpeed * dvdt < 0 ? dvdt * BRAKE_DIVE_MULT : dvdt;
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

  // Loaded suspension follows the support envelope; once the droop limit is
  // exceeded, the chassis uses an independent ballistic phase until landing.
  updateVerticalContact(state, groundedAtStart, dt);

  updateGunLay(entity, debuff, hAt, drive.gunArc, drive.steer, dt);
  updateTrackScrollAndBloom(spec, state, debuff, dt);
}

/** Shared selector for sim, tank visual and camera presentation recoil. */
export function shotRecoilScale(
  spec: MovementSpec,
  shellSpec: MovementShellSpec | null = null,
): number {
  const cycleS = (shellSpec && shellSpec.reloadS) || spec.gun.reloadS;
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
export function fireRecoil(
  state: TankState,
  spec: MovementSpec,
  shellSpec: MovementShellSpec | null = null,
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
  spr.pitchV += kick * ct * recoilScale;
  spr.rollV += kick * st * recoilScale;
  // Backward translation impulse along the horizontal gun direction.
  const gunYawWorld = state.yaw + state.turretYaw;
  const v = RECOIL_VEL_MPS * (0.7 + 0.6 * heavy) * recoilScale;
  spr.recoilVX -= Math.sin(gunYawWorld) * v;
  spr.recoilVZ -= Math.cos(gunYawWorld) * v;
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
