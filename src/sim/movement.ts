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
  [name: string]: unknown;
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
) => unknown;

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
// tankFactory.js (SUSP_W/SUSP_Z, accel squat, 4-corner fit, clamps) — see
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
// MUST stay in lockstep with tankFactory.js SUSP_VIS_P/SUSP_VIS_R/SWAY_VIS;
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
const LN3 = Math.log(3);         // aimTime = time to shrink to 1/3 ⇒ tau = aimTime/ln3
// controls_gunnery r2: SHRINK tau uses ln6 (grow keeps LN3 semantics via
// BLOOM_GROW_TAU) — pairs with the smaller afterShot multipliers in specs.js
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

/**
 * Extract movement-relevant debuffs from a CombatState per the locked table in
 * ARCHITECTURE §2.4. `combat == null` ⇒ fully healthy.
 */
function readDebuffs(
  combat: MovementCombatState | null | undefined,
  out: MovementDebuffs,
): MovementDebuffs {
  let immobile = false;
  let powerMult = 1;
  let accelMult = 1;
  let traverseMult = 1;
  let turretMult = 1;
  let aimTimeMult = 1;
  let bloomMult = 1;
  let gunYellow = false;
  if (combat) {
    if (combat.destroyed) immobile = true;
    const m = combat.modules;
    if (m) {
      const eng = m.engine;
      if (eng) {
        if (eng.state === 'red') immobile = true;
        else if (eng.state === 'yellow') powerMult = ENGINE_YELLOW_POWER_MULT;
      }
      const transmission = m.transmission;
      if (transmission) {
        if (transmission.state === 'red') {
          powerMult *= 0.3;
          accelMult *= 0.45;
          traverseMult *= 0.45;
        } else if (transmission.state === 'yellow') {
          powerMult *= 0.72;
          accelMult *= 0.75;
          traverseMult *= 0.75;
        }
      }
      if ((m.trackL && m.trackL.state === 'red') ||
          (m.trackR && m.trackR.state === 'red')) immobile = true;
      const ring = m.turretRing || m.gunMount;
      if (ring) {
        if (ring.state === 'red') turretMult = 0.2;
        else if (ring.state === 'yellow') turretMult = 0.5;
      }
      if (m.gun && m.gun.state === 'yellow') gunYellow = true;
    }
    const crew = combat.crew;
    if (crew) {
      if (crew.driver === false) { accelMult = DRIVER_DEAD_MULT; traverseMult = DRIVER_DEAD_MULT; }
      if (crew.gunner === false) aimTimeMult = GUNNER_DEAD_AIMTIME_MULT;
    }
    // EQUIPMENT SYSTEM (game/equipment.ts): loadout multipliers attached to
    // the combat state once per battle. Improved rotation raises hull+turret
    // traverse (traverse >1 ⇒ rate UP), GLD/vents cut aim time (aimTime <1 ⇒
    // faster settle), vertical stabilizer shrinks the movement-bloom EXCESS
    // (bloomMult <1, applied at the bloom target below). All stack
    // multiplicatively with the damage/crew debuffs above, exactly like the
    // ammo-rack × loader stack in damage.ts startReload.
    const em = combat.equipMults;
    if (em) {
      if (typeof em.traverse === 'number') traverseMult *= em.traverse;
      if (typeof em.turret === 'number') turretMult *= em.turret;
      if (typeof em.aimTime === 'number') aimTimeMult *= em.aimTime;
      if (typeof em.bloom === 'number') bloomMult = em.bloom;
    }
  }
  out.immobile = immobile;
  out.powerMult = powerMult;
  out.accelMult = accelMult;
  out.traverseMult = traverseMult;
  out.turretMult = turretMult;
  out.aimTimeMult = aimTimeMult;
  out.gunYellow = gunYellow;
  out.bloomMult = bloomMult;
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
 * @param {object} spec - TankSpec (specs.js schema, ARCHITECTURE §2.2).
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
  if (ride) {
    ride.y = y;
    ride.v = state.verticalSpeed;
    ride.supportY = NaN;
    ride.groundV = 0;
    ride.grounded = state.grounded;
    ride.airTime = 0;
  }
  if (state._sup) state._sup.x = NaN;
  if (state._body) {
    state._body.landingBlendS = 0;
    state._body.dynamicSupport = false;
    if (grounded !== false && !state.overturned) state._body.tumbling = false;
  }
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
  const input = entity.input;
  const debuff = readDebuffs(
    entity.combat,
    state._debuff || (state._debuff = {} as MovementDebuffs),
  );
  const groundedAtStart = state.grounded !== false;
  const body = state._body || (state._body = {
    tumbling: false, landingBlendS: 0, dynamicSupport: false, autoRighting: false,
  });
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

  const drivetrainLocked = debuff.immobile || body.tumbling || state.overturned;
  const throttle = drivetrainLocked ? 0 : clamp(input.throttle || 0, -1, 1);
  const steer = drivetrainLocked ? 0 : clamp(input.steer || 0, -1, 1);
  const braking = !!input.brake;

  // ---- ground sampling (hull center) ----
  // Ground material affects track force only while the tracks are loaded.
  // Retaining the last material in flight avoids a needless terrain lookup and
  // prevents mid-air engine/brake authority from changing horizontal momentum.
  const ground = groundedAtStart
    ? heightField.getGroundType(state.pos.x, state.pos.z)
    : state._groundType;
  if (groundedAtStart) state._groundType = ground;
  const res = spec.terrainResistance;
  const R = res[ground] || res.medium;
  const Rh = res.hard;

  // ---- terrain pitch/roll: previous tick's contact-line plane fit ----
  // The fit itself is computed at the settled post-integration pose below (so
  // the support solve and the fit share one sampling pass); the speed/slope
  // logic reads the one-tick-old plane, which is imperceptible at 60 Hz.
  // r7 float gate: GLB-swapped visuals carry MEASURED contact geometry (see
  // the SUPPORT_LEN_FRAC note) — the support lines must ride the rendered
  // track bottoms, not the spec hull box.
  // MOVEMENT r1 (fidelity-rebuild fallout): EVERY visual now publishes its
  // as-built footprint (state.ts stamps it from tankFactory's rest scan /
  // gear metadata — the rebuilt profiles moved wheel/track lines off the old
  // hull-local y = 0 / ±0.45 L assumption). cg.bottomYM is the hull-local
  // height of the lowest rendered surface: the support lines live at THAT
  // plane, so the solve seats the rendered contact on the terrain instead of
  // floating a raised track line (russia pads +2 cm, placeholder pontoons
  // +10 cm) or burying a dropped one.
  const cg = entity.contactGeom;
  const hw = cg ? cg.halfWidM : HALF_WID_FRAC * spec.dims.widthM;
  const yBot = cg && cg.bottomYM ? cg.bottomYM : 0;
  const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);   // forwardAxis
  const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);  // rightAxis
  const terrPitch = state._terr.pitch;

  // Objective modes may opt a tank into a faster ruleset without mutating the
  // shared vehicle spec (or changing standard-battle handling). Keep the
  // multiplier on the authoritative entity so local and network simulations
  // apply the same transmission limits.
  const modeSpeedMult = clamp(
    Number.isFinite(entity.modeSpeedMultiplier) ? entity.modeSpeedMultiplier! : 1,
    0.25, 3,
  );
  const topMps = spec.topSpeedKmh / 3.6 * modeSpeedMult;
  const revMps = spec.reverseSpeedKmh / 3.6 * modeSpeedMult;

  // ---- hull traverse (wiki formula reduced: Tr = Tn × Rh/Rx × Pc, + debuffs) ----
  // STEERING SIGN (locked — every producer of input.steer depends on it):
  //   input.steer > 0  ⇒  yawRate > 0  ⇒  yaw INCREASES.
  // Increasing yaw rotates forwardAxis(yaw) = [sin yaw, 0, cos yaw] toward +X,
  // and in this Y-up right-handed world a camera looking along the hull's
  // forward has screen-right = world -X (three.js lookAt: x_axis = up ×
  // (eye−target)) — so POSITIVE steer is a turn toward the player's
  // screen-LEFT, i.e. toward +rightAxis(yaw), which is the hull's local +X
  // side, NOT the visual right side. Two independent consumers confirm this
  // reading and stay correct under it:
  //   • the 'pivot' drift below moves the hull center along +rightAxis for
  //     positive steer — orbiting about the INNER (locked) track, as it should;
  //   • trackScroll.l (= wheels at hull-local x < 0, i.e. the VISUAL RIGHT
  //     side per tankFactory's `e.x < 0 ? l : r`) gets +yawRate × arm, i.e.
  //     the outer track in a screen-left turn runs faster.
  // The AI is the main producer and matches: `steer = wrapAngle(bearing −
  // yaw) × k` (ai.js driveToXZ/faceYaw) needs +steer to raise yaw. Therefore
  // the PLAYER's key map is where "right" is turned into a sign: main.ts sends
  // `steer = left − right` (a D press is negative). Never invert the mapping
  // here or in ai.js — that silently breaks bot navigation; and never fix a
  // perceived inversion downstream in the renderer (it would desync the sim,
  // the reticle, spotting and hit resolution from the visuals).
  const trMaxHealthy = spec.hullTraverseDegS * DEG2RAD * (Rh / R) *
    (spec.pivotStyle === 'neutral' ? NEUTRAL_TURN_MULT : 1);
  // Speed-scaled traverse, quadratic: near-nominal yaw rate through the whole
  // mid band (WoT tanks steer at spec rate while moving), a gentle widening
  // only near the transmission limit.
  const speedFrac = Math.min(Math.abs(state.speed) / Math.max(topMps, 1e-6), 1);
  const trMax = trMaxHealthy * debuff.powerMult * debuff.traverseMult *
    (1 - TRAVERSE_SPEED_SCALE * speedFrac * speedFrac);
  // Reverse-steer flip: while backing up, A/D behave like a reversing car.
  const steerSign = state.speed < -PIVOT_SPEED_EPS ? -1 : 1;
  // Casemate auto hull-traverse (§7): with the gun yaw clamped to ±gunArc in
  // the turret chase below, an aim point beyond the arc feeds the EXCESS into
  // a synthesized steer input — the hull traverses toward the target, exactly
  // WoT's sniper-mode behavior for turretless TDs. Explicit steer (player or
  // AI) always wins, and the reverse-steer flip does NOT apply: the hull must
  // rotate toward the target in world space regardless of drive direction.
  const gunArc = gunArcRadFor(spec);
  let steerCmd = steer * steerSign;
  if (steer === 0 && gunArc !== Infinity && input.aimPoint && !debuff.immobile) {
    const wantRel = wrapAngle(Math.atan2(
      input.aimPoint.x - state.pos.x, input.aimPoint.z - state.pos.z) - state.yaw);
    const excess = Math.abs(wantRel) - gunArc;
    if (excess > 0) {
      steerCmd = clamp(excess / AUTO_TRAVERSE_RAMP_RAD, 0, 1) * Math.sign(wantRel);
    }
  }
  const yawTarget = steerCmd * trMax;
  if (groundedAtStart) {
    state.yawRate = approach(
      state.yawRate, yawTarget, (Math.max(trMax, 1e-6) / YAW_SPOOL_S) * dt,
    );
  }
  state.yaw = wrapAngle(state.yaw + state.yawRate * dt);
  // 'pivot' tanks rotate about the locked track: the hull center orbits sideways.
  if (groundedAtStart && Math.abs(state.speed) < PIVOT_SPEED_EPS &&
      spec.pivotStyle === 'pivot' && steerCmd !== 0) {
    const drift = Math.sign(steerCmd) * PIVOT_OFFSET_M * Math.abs(state.yawRate) * dt;
    state.pos.x += rx * drift;
    state.pos.z += rz * drift;
  }

  // ---- longitudinal speed ----
  const pSpec = (spec.enginePowerHp * debuff.powerMult) / spec.weightTons;
  const accel = K_ACCEL * (pSpec / R) * debuff.accelMult * Math.sqrt(modeSpeedMult);
  const driveSign = throttle !== 0 ? Math.sign(throttle) : Math.sign(state.speed);
  const pitchAlong = terrPitch * (driveSign || 1);
  let vLim = throttle >= 0 ? topMps : revMps;
  vLim *= slopeSpeedFactor(spec, ground, pitchAlong, debuff.powerMult, debuff.accelMult);
  vLim = Math.min(vLim, topMps * OVERSPEED_CAP);
  let vTarget = (braking || debuff.immobile) ? 0 : vLim * throttle;
  // Turning bleeds the TARGET speed (movement doc §4): the steady-state speed
  // in a full-rate turn settles at ~65% of straight-line speed regardless of
  // engine power — no free serpentining at v_max.
  if (trMax > 1e-6 && vTarget !== 0) {
    vTarget *= 1 - TURN_SPEED_LOSS * Math.min(Math.abs(state.yawRate) / trMax, 1);
  }
  // Immobilized tanks brake with locked tracks at a healthy rate.
  const baseRate = debuff.immobile ? K_ACCEL * (spec.enginePowerHp / spec.weightTons) / R : accel;
  // Role-scaled brake cap (healthy hp/t — brakes are not the engine): heavies
  // stop noticeably softer than lights instead of every tank sharing one snap.
  const brakeCap = clamp(
    BRAKE_CAP_BASE + BRAKE_CAP_PER_HPT * (spec.enginePowerHp / spec.weightTons),
    BRAKE_CAP_MIN, BRAKE_CAP_MAX,
  );
  const brakeRate = Math.min(baseRate * BRAKE_MULT, brakeCap);
  let rate;
  let spoolTarget = 0; // closed throttle unwinds the torque spool
  if (braking || debuff.immobile || vTarget * state.speed < 0) {
    rate = brakeRate; // hard brake / direction reversal — capped, ~2 s from top speed
  } else if (throttle === 0) {
    rate = Math.min(baseRate * COAST_MULT, brakeCap * 0.5); // rolling friction
  } else if (Math.abs(vTarget) < Math.abs(state.speed) - 1e-9) {
    // Over target. TWO regimes (r4 crit — turn bleed stacked too harshly):
    // past the slope/transmission limit itself, drag pulls back at full drive
    // force (post-8.0 overspeed snaps back hard); but when the overage exists
    // only because turning scaled the TARGET down, the scrub is a gentle
    // TURN_OVER_RATE fraction — momentum carries through a sweeping turn.
    const vLimAbs = Math.abs(vLim * throttle);
    rate = Math.abs(state.speed) > vLimAbs + 1e-9 ? baseRate : baseRate * TURN_OVER_RATE;
    spoolTarget = 1; // throttle is open — keep the engine spooled
  } else {
    // Driving: quadratic drag tapers the accel — fast initial surge, asymptotic
    // crawl to the transmission limit (§3): a = a_drive × (1 − C_DRAG·(v/v_max)²).
    const vRef = Math.max(throttle >= 0 ? topMps : revMps, 1e-6);
    const u = Math.min(Math.abs(state.speed) / vRef, 1);
    rate = baseRate * (1 - C_DRAG * u * u);
    // Engine torque spool: the launch reads heavy — SPOOL_FLOOR of the force
    // bites instantly, the rest builds over SPOOL_S on a QUADRATIC ramp
    // (see the r3 retune note at the constants).
    const spool = state._spool || 0;
    rate *= SPOOL_FLOOR + (1 - SPOOL_FLOOR) * spool * spool;
    spoolTarget = 1;
    // Steering diverts engine power to the tracks (§4): while turning hard the
    // drive can't refill what the turn bleeds, so serpentining costs momentum.
    if (trMax > 1e-6) {
      rate *= 1 - TURN_POWER_DIVERT * Math.min(Math.abs(state.yawRate) / trMax, 1);
    }
  }
  // Tracks cannot create longitudinal force while unloaded. Preserve the
  // horizontal component through flight; gravity is integrated independently
  // by the vertical phase below.
  if (!groundedAtStart) {
    rate = 0;
    spoolTarget = 0;
  }
  state._spool = spoolTarget > 0
    ? Math.min(1, (state._spool || 0) + dt / SPOOL_S)
    : Math.max(0, (state._spool || 0) - dt / SPOOL_DECAY_S);
  const preAccelSpeed = state.speed; // for the CLIMB_CREEP net-accel floor
  state.speed = approach(state.speed, vTarget, rate * dt);
  // Direct multiplicative turn bleed (movement doc §4): every hard turn costs
  // momentum — v *= 1 − k·|yawRate|/trMax·dt. r4 crit: fades out below
  // ~half top speed so mid-speed serpentining stays fluid; the target-scale
  // bleed above remains the dominant term.
  if (groundedAtStart && trMax > 1e-6 && state.yawRate !== 0) {
    const bleedFade = clamp(
      (Math.abs(state.speed) / Math.max(topMps, 1e-6) - TURN_BLEED_FADE_LO) /
        (TURN_BLEED_FADE_HI - TURN_BLEED_FADE_LO), 0, 1);
    state.speed *= 1 -
      TURN_DIRECT_BLEED * bleedFade * Math.min(Math.abs(state.yawRate) / trMax, 1) * dt;
  }
  // Engine strength determines whether open throttle can sustain this climb;
  // track grip separately determines whether the support contact can hold the
  // face at all. Only grip failure cancels carried uphill momentum outright.
  // An engine-limited tank decelerates through the normal target/gravity solve
  // and rolls back, while both failures publish slopeBlocked for bot recovery.
  const commandedPitch = terrPitch * Math.sign(throttle || 1);
  const driveBlocked = groundedAtStart && throttle !== 0 && commandedPitch > 0 &&
    uphillDriveMargin(
      spec, ground, commandedPitch, debuff.powerMult, debuff.accelMult,
    ) <= TERRAIN_MARGIN_EPS;
  const motionPitch = terrPitch * Math.sign(state.speed || throttle || 1);
  const gripBlocked = groundedAtStart && motionPitch > 0 &&
    trackGripMargin(spec, ground, motionPitch) <= TERRAIN_MARGIN_EPS;
  if (driveBlocked || gripBlocked) state.slopeBlocked = true;
  if (gripBlocked && state.speed * terrPitch > 0) {
    state.speed = 0;
  }
  if (groundedAtStart && !debuff.immobile) {
    // Gravity along the track line: stalled tanks slide back, coasting gains
    // downhill. r3: the throttled share is SPEED-gated — a near-stationary
    // tank on a slope hasn't hooked the ground yet (tracks barely turning:
    // full gravity for the first moments of a slope start, pairing with the
    // heavy-launch spool), then fades to the locked tracked share of 0.3 by
    // ~3 m/s. r4 (round critique — dead heavy uphill starts): the unhooked
    // share ALSO fades with the engine spool — a spooled drivetrain means the
    // tracks are turning and biting, so a slope start goes heavy for the
    // first ~half second and then hooks up instead of losing to gravity for
    // 3+ s at 12 hp/t. Flat launches (sin ≈ 0 — the 0-30 tuning case) and all
    // moving driving are untouched.
    const slow = throttle !== 0
      ? (1 - clamp((Math.abs(state.speed) - 1.0) / 2.0, 0, 1)) * (1 - (state._spool || 0))
      : 0;
    state.speed += -GRAVITY * Math.sin(terrPitch) * dt *
      (gripBlocked ? 1.0 : (throttle !== 0 ? 0.3 + 0.7 * slow : 1.0));
  }
  // CLIMB_CREEP floor (r4, see the constant): with the throttle open toward a
  // reachable target, the net of drive − drag − gravity this tick never drops
  // below +creep in the drive direction. The creep is scaled by the DRIVABLE
  // MARGIN in the throttle direction (§5 slope law): full strength when
  // engine/track force comfortably exceeds gravity, fading to zero as the
  // available force is exhausted. At zero margin the tank grinds to a crawl
  // and rolls back; no fleet-wide angle participates in the decision.
  // doc. The pitch is re-derived from throttle sign (not moveSign): while
  // the hull momentarily slides BACKWARD on a steep grade, moveSign flips
  // pitchAlong to "downhill" and vTarget goes positive for a tick — the
  // margin gate must not read that flip as a drivable slope.
  if (groundedAtStart && throttle !== 0 && !braking && !debuff.immobile &&
      vTarget * throttle > 0) {
    const drivable = slopeSpeedFactor(
      spec,
      ground,
      terrPitch * Math.sign(throttle),
      debuff.powerMult,
      debuff.accelMult,
    );
    if (drivable > 0.01) {
      const creep = CLIMB_CREEP_MPS2 * Math.min(1, drivable / 0.15);
      const dir = Math.sign(vTarget);
      const want = Math.min(preAccelSpeed * dir + creep * dt, Math.abs(vTarget));
      if (state.speed * dir < want) state.speed = dir * want;
    }
  }
  state.speed = clamp(state.speed, -revMps * OVERSPEED_CAP, topMps * OVERSPEED_CAP);

  // ---- integrate position (+ decaying recoil translation) & stick to terrain ----
  const spr = state._spring;
  state.pos.x += (fx * state.speed + spr.recoilVX) * dt;
  state.pos.z += (fz * state.speed + spr.recoilVZ) * dt;
  const recoilDecay = Math.exp(-dt / RECOIL_DECAY_TAU);
  spr.recoilVX *= recoilDecay;
  spr.recoilVZ *= recoilDecay;
  if (collide) {
    const radiusM = (spec.armor && spec.armor.boundingRadiusM)
      ? spec.armor.boundingRadiusM
      : spec.dims.hullLengthM * 0.5;
    _push.set(0, 0, 0);
    state.impactMps = 0;
    if (collide(state.pos, radiusM, _push)) {
      state.pos.add(_push);
      // r2 (blocked-drive wheelspin — round critique MAJOR): the pushback used
      // to restore position while leaving state.speed untouched, so a tank
      // wedged against a wall ran-in-place indefinitely — tracks scrolling at
      // 14-35 km/h, dust pluming, ZERO displacement, no impact feedback (the
      // probe held a Tiger I frozen at one coordinate for ~9 s). WoT/AAA is a
      // hard stop: cancel the velocity component the wall actually blocked.
      // Project the pushback onto the drive direction — the fraction of this
      // tick's forward travel that collide() undid is the blocked fraction
      // (head-on: |push·fwd| ≈ |v|·dt ⇒ full stop; grazing a wall at a
      // shallow angle: push ⊥ fwd ⇒ no bleed, the hull keeps sliding along).
      const pushFwd = _push.x * fx + _push.z * fz;
      const travel = Math.abs(state.speed) * dt;
      if (travel > 1e-9 && pushFwd * state.speed < 0) {
        const blocked = clamp(Math.abs(pushFwd) / travel, 0, 1);
        const lost = Math.abs(state.speed) * blocked;
        state.speed *= 1 - blocked;
        // Impact telemetry for integration (state.ts): closing speed the wall
        // absorbed THIS tick, in m/s. A genuine hit reads several m/s on the
        // first contact tick; while held against the wall afterwards the
        // per-tick re-acceleration is only ~accel·dt (< 0.2 m/s), so the
        // consumer's threshold fires ONE impact event per collision, not a
        // machine-gun of them. Also kills the spool so the engine re-bites
        // from scratch instead of instantly re-launching off the wall.
        state.impactMps = lost;
        if (lost > 1.5) state._spool = 0;
      }
    }
  }

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
  const fl = state._flinch;
  let flP = 0;
  let flR = 0;
  if (fl) {
    if (fl.p !== 0 || fl.r !== 0 || fl.pv !== 0 || fl.rv !== 0) {
      fl.pv += (-FLINCH_W * FLINCH_W * fl.p - 2 * FLINCH_Z * FLINCH_W * fl.pv) * dt;
      fl.p += fl.pv * dt;
      fl.rv += (-FLINCH_W * FLINCH_W * fl.r - 2 * FLINCH_Z * FLINCH_W * fl.rv) * dt;
      fl.r += fl.rv * dt;
      if (Math.abs(fl.p) + Math.abs(fl.pv) + Math.abs(fl.r) + Math.abs(fl.rv) < 1e-4) {
        fl.p = fl.r = fl.pv = fl.rv = 0;
      }
    }
    flP = fl.p;
    flR = fl.r;
  }

  const sup = state._sup;
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
  let suspensionAimPitch = state.suspensionAimPitch || 0;
  const hydraulicAim = spec.hydropneumaticAim;
  const fixedHydraulicGun = hasFixedHydraulicGun(spec);
  // Ordinary vehicles take only this predictable false branch. The extra aim
  // math runs solely while a Strv mode is engaged or its offset is settling.
  if ((state.suspensionAim && hydraulicAim) || suspensionAimPitch !== 0) {
    let suspensionAimTarget = 0;
    if (state.suspensionAim && input.aimPoint) {
      let requestedPitch;
      if (fixedHydraulicGun) {
        // Feedback from the ACTUAL rendered fixed bore. Terrain pitch, roll,
        // spring lag and the authored trunnion position are all present in
        // this frame, so adding the remaining local pitch error to the current
        // hydraulic offset converges the visible barrel itself onto the aim.
        // No virtual gunPitch joint is needed to hide an approximation error.
        _hullEuler.set(-state.visualPitch, state.yaw, state.visualRoll, 'YXZ');
        _hullQuat.setFromEuler(_hullEuler);
        const armor = spec.armor || {};
        const turretPivot = armor.turretPivot || [0, spec.dims.heightM * 0.7, 0];
        const gunPivot = armor.gunPivot || [0, spec.dims.heightM * 0.15, 0];
        _gunOriginWorld.set(
          turretPivot[0] + gunPivot[0],
          turretPivot[1] + gunPivot[1],
          turretPivot[2] + gunPivot[2],
        ).applyQuaternion(_hullQuat).add(state.pos);
        _aimLocal.copy(input.aimPoint).sub(_gunOriginWorld)
          .applyQuaternion(_hullQuat.conjugate());
        _hullQuat.conjugate();
        const borePitchError = Math.atan2(
          _aimLocal.y, Math.max(Math.hypot(_aimLocal.x, _aimLocal.z), 1e-6));
        // Close the remaining bore error as a damped feedback loop. Applying
        // the whole error every 60 Hz tick fights the slower hull-attitude
        // spring and produces a visible ±0.4° limit cycle; a 4 Hz correction
        // converges promptly without hunting while the outer rate clamp still
        // governs large moves.
        requestedPitch = suspensionAimPitch + borePitchError * Math.min(1, dt * 4);
      } else {
        const adx = input.aimPoint.x - state.pos.x;
        const adz = input.aimPoint.z - state.pos.z;
        const ady = input.aimPoint.y - (state.pos.y + gunPivotHeight(spec));
        const worldAimPitch = Math.atan2(ady, Math.max(Math.hypot(adx, adz), 1e-6));
        requestedPitch = worldAimPitch - state._terr.pitch;
      }
      suspensionAimTarget = clamp(
        requestedPitch,
        -(hydraulicAim?.noseDownDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_DOWN_DEG) * DEG2RAD,
        (hydraulicAim?.noseUpDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_UP_DEG) * DEG2RAD,
      );
    }
    suspensionAimPitch = approach(
      suspensionAimPitch,
      suspensionAimTarget,
      (hydraulicAim?.rateDegS ?? SUSPENSION_AIM_DEFAULT_RATE_DEG_S) * DEG2RAD * dt,
    );
    if (!state.suspensionAim && Math.abs(suspensionAimPitch) < 1e-6) suspensionAimPitch = 0;
    state.suspensionAimPitch = suspensionAimPitch;
  }
  // Once unsupported, terrain below cannot torque the hull. The spring's two
  // rate fields become the rigid body's pitch/roll angular velocity until
  // contact resumes, so the launch attitude evolves continuously instead of
  // being critically damped in mid-air. Reusing this already-authoritative
  // state keeps snapshots, armor pose and local prediction on one attitude.
  const targetPitch = groundedAtStart
    ? state._terr.pitch + inertialPitch + suspensionAimPitch
    : spr.pitch;
  const targetRoll = groundedAtStart ? state._terr.roll : spr.roll;
  if (landingImpactAtStart > 0) {
    // A landing applies torque toward the support plane in proportion to the
    // closing impulse and attitude error. This is a bounded impulse, not an
    // instantaneous pose assignment; nose/side-first landings can therefore
    // continue into a roll while square landings settle quickly.
    const pitchError = wrapAngle(targetPitch - spr.pitch);
    const rollError = wrapAngle(targetRoll - spr.roll);
    spr.pitchV += clamp(
      pitchError * landingImpactAtStart * LANDING_TORQUE_GAIN,
      -LANDING_TORQUE_MAX,
      LANDING_TORQUE_MAX,
    );
    spr.rollV += clamp(
      rollError * landingImpactAtStart * LANDING_TORQUE_GAIN,
      -LANDING_TORQUE_MAX,
      LANDING_TORQUE_MAX,
    );
    body.landingBlendS = LANDING_CONTACT_BLEND_S;
    // Do not turn an ordinary hard landing into a drivetrain lock merely from
    // closing speed × terrain-angle error. The bounded torque above already
    // rotates the hull; it enters tumble naturally if that motion carries the
    // center of mass past the physical attitude threshold. Direct tank-body
    // contacts can also enter tumble through their measured lever impulse.
    if (upYAtStart < TUMBLE_ENTER_UP_Y) {
      body.tumbling = true;
    }
  }

  const rigidAttitude = !groundedAtStart || body.tumbling;
  if (rigidAttitude) {
    if (groundedAtStart) {
      // Approximate gravity about the contact edge. -sin(2a) has stable
      // equilibria both upright and roof-down, and an unstable balance on the
      // side: the hull falls naturally to whichever side its center of mass
      // crossed instead of receiving a magical self-righting torque.
      const relativePitch = wrapAngle(spr.pitch - state._terr.pitch);
      const relativeRoll = wrapAngle(spr.roll - state._terr.roll);
      if (body.autoRighting) {
        // Modern random-battle recovery is represented as a strong, bounded
        // righting actuator rather than a pose teleport. The hull visibly
        // rolls back across its contact edge and keeps the same angular-rate
        // cap as every other grounded tumble.
        spr.pitchV += (-AUTO_RIGHT_OMEGA * AUTO_RIGHT_OMEGA * relativePitch -
          2 * AUTO_RIGHT_ZETA * AUTO_RIGHT_OMEGA * spr.pitchV) * dt;
        spr.rollV += (-AUTO_RIGHT_OMEGA * AUTO_RIGHT_OMEGA * relativeRoll -
          2 * AUTO_RIGHT_ZETA * AUTO_RIGHT_OMEGA * spr.rollV) * dt;
      } else {
        spr.pitchV += -Math.sin(2 * relativePitch) * GROUND_TUMBLE_GRAVITY * dt;
        spr.rollV += -Math.sin(2 * relativeRoll) * GROUND_TUMBLE_GRAVITY * dt;
        const contactDrag = Math.exp(-GROUND_TUMBLE_DAMP_S * dt);
        spr.pitchV *= contactDrag;
        spr.rollV *= contactDrag;
      }
    } else {
      const airDrag = Math.exp(-AIR_ANGULAR_DRAG_S * dt);
      spr.pitchV *= airDrag;
      spr.rollV *= airDrag;
    }
    const angularCap = body.tumbling ? TUMBLE_ANGULAR_SPEED_MAX : AIR_ANGULAR_SPEED_MAX;
    spr.pitchV = clamp(spr.pitchV, -angularCap, angularCap);
    spr.rollV = clamp(spr.rollV, -angularCap, angularCap);
    spr.pitch = wrapAngle(spr.pitch + spr.pitchV * dt);
    spr.roll = wrapAngle(spr.roll + spr.rollV * dt);

    const upY = Math.cos(spr.pitch) * Math.cos(spr.roll);
    const relativeUpY = Math.cos(wrapAngle(spr.pitch - state._terr.pitch)) *
      Math.cos(wrapAngle(spr.roll - state._terr.roll));
    if ((!groundedAtStart || landingImpactAtStart > 0) && upY < TUMBLE_ENTER_UP_Y) {
      body.tumbling = true;
    }
    // Settle relative to the supporting terrain plane. A tank upright on a
    // steep authored slope can have world-up dot < the old threshold; using
    // world up here left its drivetrain locked in a permanent false tumble.
    if (groundedAtStart && body.autoRighting && relativeUpY > 0.94 &&
        Math.abs(spr.pitchV) + Math.abs(spr.rollV) < 0.18) {
      body.autoRighting = false;
      body.tumbling = false;
    } else if (groundedAtStart && body.tumbling && !body.autoRighting &&
        relativeUpY > TUMBLE_EXIT_UP_Y &&
        Math.abs(spr.pitchV) + Math.abs(spr.rollV) < 0.12 &&
        landingImpactAtStart <= 0) {
      body.tumbling = false;
    }
  } else {
    body.landingBlendS = Math.max(0, (body.landingBlendS || 0) - dt);
    const settle = body.landingBlendS > 0
      ? 1 - body.landingBlendS / LANDING_CONTACT_BLEND_S
      : 1;
    const springScale = LANDING_SPRING_MIN_SCALE +
      (1 - LANDING_SPRING_MIN_SCALE) * settle;
    const wP = SPRING_OMEGA * springScale * (1 + PERCH_W_BOOST * perch);
    const zP = SPRING_ZETA + (1 - SPRING_ZETA) * perch;
    spr.pitchV += (wP * wP * (targetPitch - spr.pitch) -
                   2 * zP * wP * spr.pitchV) * dt;
    spr.pitch += spr.pitchV * dt;
    const wR = SPRING_OMEGA * springScale;
    spr.rollV += (wR * wR * (targetRoll - spr.roll) -
                  2 * SPRING_ZETA * wR * spr.rollV) * dt;
    spr.roll += spr.rollV * dt;
  }
  state.visualPitch = spr.pitch;
  state.visualRoll = spr.roll;
  const upYAfterAttitude = Math.cos(spr.pitch) * Math.cos(spr.roll);
  state.overturned = state.overturned
    ? upYAfterAttitude < OVERTURN_EXIT_UP_Y
    : upYAfterAttitude < OVERTURN_ENTER_UP_Y;

  // ---- mirror of tankFactory's visual susp rock layer -----------------------
  // syncFromState (which runs right after this tick) will render the hull at
  // rotation.set(-(visualPitch + suspP), yaw, visualRoll + suspR + sway) —
  // replicate its spring tick-for-tick so the support solve below clears the
  // terrain at the pose that actually reaches the screen.
  {
    const accel = groundedAtStart
      ? clamp(poseDvdt, -SUSP_ACCEL_CLAMP, SUSP_ACCEL_CLAMP)
      : 0;
    let pT = accel * SUSP_ACCEL_GAIN;
    let rT = 0;
    if (groundedAtStart) {
      const hl2 = SUSP_FIT_LEN * spec.dims.hullLengthM;
      const hw2 = SUSP_FIT_WID * spec.dims.widthM;
      const fx2 = Math.sin(state.yaw), fz2 = Math.cos(state.yaw);
      const rx2 = Math.cos(state.yaw), rz2 = -Math.sin(state.yaw);
      const px2 = state.pos.x, pz2 = state.pos.z;
      const hFL = hAt(px2 + fx2 * hl2 - rx2 * hw2, pz2 + fz2 * hl2 - rz2 * hw2);
      const hFR = hAt(px2 + fx2 * hl2 + rx2 * hw2, pz2 + fz2 * hl2 + rz2 * hw2);
      const hRL = hAt(px2 - fx2 * hl2 - rx2 * hw2, pz2 - fz2 * hl2 - rz2 * hw2);
      const hRR = hAt(px2 - fx2 * hl2 + rx2 * hw2, pz2 - fz2 * hl2 + rz2 * hw2);
      const terrP2 = Math.atan2((hFL + hFR - hRL - hRR) * 0.5, 2 * hl2);
      // Renderer-consistent roll sign (positive lifts the right side): the rock
      // layer's roll delta now measures the true conformance error instead of
      // fighting the main spring on side slopes.
      const terrR2 = Math.atan2((hFR + hRR - hFL - hRL) * 0.5, 2 * hw2);
      // Perch gate (see PERCH_SUSP_BLEED): a hull carried by one line end has no
      // loaded bogies — fade the terrain-delta target and bleed the stored
      // displacement so the ×SUSP_VIS amplification cannot hold the rendered
      // pose dived past the two-contact pose (the r5 egg-crate levitation).
      const kf = Math.min(1, Math.abs(state.speed) / SUSP_K_SPEED) *
        SUSP_K_GAIN * (1 - perch);
      pT += clamp((terrP2 - state.visualPitch) * kf, -SUSP_P_CLAMP, SUSP_P_CLAMP);
      rT += clamp((terrR2 - state.visualRoll) * kf, -SUSP_R_CLAMP, SUSP_R_CLAMP);
    }
    susp.pv += (SUSP_W * SUSP_W * (pT - susp.p) - 2 * SUSP_Z * SUSP_W * susp.pv) * dt;
    susp.p += susp.pv * dt;
    susp.rv += (SUSP_W * SUSP_W * (rT - susp.r) - 2 * SUSP_Z * SUSP_W * susp.rv) * dt;
    susp.r += susp.rv * dt;
    if (perch > 0) {
      const bleed = Math.exp(-dt * perch * PERCH_SUSP_BLEED);
      susp.p *= bleed; susp.pv *= bleed;
      susp.r *= bleed; susp.rv *= bleed;
    }
  }

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
  const rigidGear = entity.rigidGear === true;
  const supFresh =
    Math.abs(state.pos.x - sup.x) < 0.004 && Math.abs(state.pos.z - sup.z) < 0.004 &&
    Math.abs(wrapAngle(state.yaw - sup.yaw)) < 0.0012 &&
    Math.abs(pitchEff - sup.pitch) < 0.0012 && Math.abs(rollEff - sup.roll) < 0.0012 &&
    sup.rigid === rigidGear && sup.cg === cg;
  if (!supFresh) {
    // Measured contact run for GLB gear (see the SUPPORT_LEN_FRAC r7 note):
    // half-length + longitudinal center come from the rendered track-bottom
    // band. zc shifts every sample's hull-local z; the plane FIT uses levers
    // about zc (the sample centroid — the Σz=0 symmetry the closed-form
    // slope assumes) while the support deficit keeps the ACTUAL z lever arm
    // (worldY of a contact point = pos.y + x·sinR·cosP + z·sinP).
    const sl = cg ? cg.halfLenM : SUPPORT_LEN_FRAC * spec.dims.hullLengthM;
    const zc = cg ? cg.zCenterM : 0;
    const nLine = Math.min(SUPPORT_MAX_N, Math.max(5, Math.ceil((2 * sl) / SUPPORT_SPACING_M) + 1));
    const step = (2 * sl) / (nLine - 1);
    // Project the hull-local contact points to world XZ with the same YXZ
    // composition the renderer uses, at the exact rendered attitude.
    const cb = Math.cos(state.yaw), sb = Math.sin(state.yaw);
    const ca0 = Math.cos(-pitchEff), sa0 = Math.sin(-pitchEff);
    const cr0 = Math.cos(rollEff), sr0 = Math.sin(rollEff);
    const sinP = Math.sin(pitchEff), cosP = Math.cos(pitchEff);
    const sinR = Math.sin(rollEff);
    const px1 = state.pos.x, pz1 = state.pos.z;
    let sumHZ = 0, sumZZ = 0, sumL = 0, sumR = 0, nLR = 0;
    let outerMax = -Infinity; // track outer edges: HARD support (also the fit)
    let sumD = 0, nD = 0;     // all yOff=0 deficits — patch roughness estimate
    // Two-point settle bookkeeping (r3): deepest contact overall + deepest in
    // each longitudinal half (center band excluded — no lever there).
    // MOVEMENT r1 FLAT-GROUND POSE LOCK (pre-existing, HEAD-reproducible):
    // settle/roughness used to read the RENDERED-pose deficits d. The
    // rendered pose carries the ×SUSP_VIS_P-amplified susp rock, so a small
    // squat fed the settle a spurious tip, the spring chased it, the susp
    // mirror re-amplified the difference, and the loop ramped until tipRaw
    // pinned at the ±0.09 clamp: on an ANALYTICALLY FLAT field every tank
    // cruised pitched ~5.7° nose-up with pos.y ridden up +0.35 m (rear pads
    // kissing, front track hanging in daylight), perch engaged and the fan
    // yield opened 0.25 m — and the phantom "downhill" pitch fed a top-speed
    // bonus. Settle, perch and roughness are TERRAIN-adaptation terms, so
    // they now read deficits dS in the PREVIOUS FIT frame (state._terr —
    // pose-decoupled: identically zero spread on flat/planar ground at any
    // rendered attitude, unchanged semantics in the V-trough/crest cases the
    // r3 settle was built for). The SUPPORT terms (outerMax/fanMax/bellyMax
    // and the pos.y clamp) stay at the rendered pose — the no-burial
    // guarantee is exactly about what reaches the screen.
    const zHalf = 0.25 * sl;
    let argZ = 0;
    let outerMaxS = -Infinity;
    let frontMax = -Infinity, frontZ = sl;
    let rearMax = -Infinity, rearZ = -sl;
    const sinPf = Math.sin(terrPitch), cosPf = Math.cos(terrPitch);
    const sinRf = Math.sin(state._terr.roll), cosRf = Math.cos(state._terr.roll);
    // MOVEMENT r1: the contact lines live at hull-local y = yBot (the measured
    // bottom of the rendered gear — 0 without metadata). Same composition as
    // the fan lines below: a point (x, yBot, z) renders at
    //   worldY = pos.y + (x·sinR + yBot·cosR)·cosP + z·sinP.
    const yLift = yBot * cr0 * cosP;
    const yLiftF = yBot * cosRf * cosPf;
    for (let side = -1; side <= 1; side += 2) {
      const x = side * hw;
      const x1 = x * cr0 - yBot * sr0, y1 = x * sr0 + yBot * cr0;
      for (let k = 0; k < nLine; k++) {
        const zr = -sl + k * step; // lever about the contact-run center (fit)
        const z = zc + zr;         // actual hull-local z (deficit / projection)
        const z2 = y1 * sa0 + z * ca0;
        const h = hAt(px1 + x1 * cb + z2 * sb, pz1 - x1 * sb + z2 * cb);
        sumHZ += h * zr;
        sumZZ += zr * zr;
        if (side < 0) sumL += h; else sumR += h;
        nLR++;
        // support deficit at the rendered pose (worldY of the contact point
        // relative to pos.y): pos.y must sit at max over samples of
        // h − ((x·sinR + yBot·cosR)·cosP + z·sinP)
        const d = h - (x * sinR * cosP + yLift + z * sinP);
        if (d > outerMax) outerMax = d;
        // settle/perch/roughness deficit in the previous-fit frame (see the
        // pose-lock note above)
        const dS = h - (x * sinRf * cosPf + yLiftF + z * sinPf);
        if (dS > outerMaxS) { outerMaxS = dS; argZ = zr; }
        if (zr < -zHalf && dS > rearMax) { rearMax = dS; rearZ = zr; }
        else if (zr > zHalf && dS > frontMax) { frontMax = dS; frontZ = zr; }
        sumD += dS; nD++;
      }
      // MOVEMENT r1 wrap-end guard (support only): one sample just past each
      // end of the flat run, raised by the measured wrap approach-rise, so
      // the rising track ends cannot spear a steep bank the (true, shorter)
      // contact span no longer touches — parked nose-to-wall, the old 0.45 L
      // phantom line propped the hull there by accident (leo2a4 pad: wrap
      // pads −14 cm into a rise). Excluded from the fit/settle: it is a
      // clearance guard, not ground contact.
      if (cg && cg.endRise) {
        for (let end = 0; end < 2; end++) {
          const zg = end === 0
            ? zc + sl + cg.endRise.dzM
            : zc - sl - cg.endRise.dzM;
          const rise = end === 0 ? cg.endRise.frontM : cg.endRise.rearM;
          const yg = yBot + rise;
          const xg = x * cr0 - yg * sr0;
          const yg1 = x * sr0 + yg * cr0;
          const z2g = yg1 * sa0 + zg * ca0;
          const hg = hAt(px1 + xg * cb + z2g * sb, pz1 - xg * sb + z2g * cb);
          const dg = hg - ((x * sinR + yg * cr0) * cosP + zg * sinP);
          if (dg > outerMax) outerMax = dg;
        }
      }
    }
    // r5 lateral fan (see SUPPORT_FAN): support-only lines between the outer
    // track edges — road-wheel run, track inner edge, hull-belly guard. A
    // hull-local point (x, yOff, z) renders (YXZ compose) at
    //   worldY  = pos.y + (x·sinR + yOff·cosR)·cosP + z·sinP
    //   worldXZ = yaw-rotate of (x·cosR − yOff·sinR,  (x·sinR + yOff·cosR)·
    //             sin(−pitch) + z·cos(−pitch))
    // so pos.y must also sit at max of h − ((x·sinR + yOff·cosR)·cosP + z·sinP)
    // over these lines. Coarse spacing (every other z sample, endpoints kept).
    // yOff=0 wheel-run lines are SOFT (fanMax, yield below); the yOff>0
    // hull-belly guard stays HARD (bellyMax) — the pan is rigid geometry with
    // no conform layer under it.
    let fanMax = -Infinity;
    let bellyMax = -Infinity;
    // Fan sampling stride: the 2× coarse spacing was a perf trade justified
    // when the fan lines were SOFT supports (conform absorbs sub-sample
    // bulges). For rigid gear they are hard constraints — sample at full
    // resolution (r5 drive gate: a 4 cm terrain bulge between 0.66 m-spaced
    // fan samples put a GLB track vertex −3.1 cm under at 27 km/h).
    const fanStride = rigidGear ? 1 : 2;
    // MOVEMENT r1 BELLY GUARD AT THE MEASURED PAN: the fixed 0.34 m guard
    // line assumed "every roster hull bottom is ≥ 0.40 m" — stale on the
    // rebuilt profiles (soviet-heavy / sepv2 pans at 0.30, i.e. BELOW the
    // guard) — and it shared the fan yield on the premise the first 6 cm
    // never reach rendered geometry. Result: a ridge crest under a parked
    // hull buried the pan up to 15 cm (is1, live verdant pad). With measured
    // pan metadata the guard samples 1.5 cm under the REAL plate and clamps
    // HARD (the pan is rigid — no conform absorbs a yielded crest there).
    // Metadata-less entities (selftest fixtures) keep the r5 soft behavior.
    const panY = cg && cg.panYM ? cg.panYM - 0.015 : null;
    for (const ln of SUPPORT_FAN) {
      // MOVEMENT r1: the whole fan translates with the measured contact plane
      // (wheel-run lines ride the rendered gear bottom; the belly guard keeps
      // its clearance above the contact surface — conservative when the
      // rebuilt pan sits lower than spec, which only lifts, never buries).
      const yo = ln.yOff > 0 && panY !== null ? panY : ln.yOff + yBot;
      for (let side = -1; side <= 1; side += 2) {
        const x = side * hw * ln.f;
        const x1 = x * cr0 - yo * sr0;
        const y1 = x * sr0 + yo * cr0;
        const lift = (x * sinR + yo * cr0) * cosP;
        const liftF = (x * sinRf + yo * cosRf) * cosPf; // settle-frame (pose lock)
        for (let k = 0; k < nLine; k += fanStride) {
          const z = zc + (k === nLine - 2 ? sl : -sl + k * step); // keep the far end
          const z2 = y1 * sa0 + z * ca0;
          const h = hAt(px1 + x1 * cb + z2 * sb, pz1 - x1 * sb + z2 * cb);
          const d = h - (lift + z * sinP);
          if (ln.yOff === 0) {
            if (d > fanMax) fanMax = d;
            sumD += h - (liftF + z * sinPf); nD++;
          } else if (d > bellyMax) {
            bellyMax = d;
          }
        }
        // wrap-end guard on the wheel-run lines too (HARD — wrap pads past
        // the last road wheel get little conform): a sharp crest under an
        // INBOARD rear/front wrap corner buried a parked type90 12 cm on
        // desert dunes while the outer-line guards straddled it.
        if (ln.yOff === 0 && cg && cg.endRise) {
          for (let end = 0; end < 2; end++) {
            const zg = end === 0
              ? zc + sl + cg.endRise.dzM
              : zc - sl - cg.endRise.dzM;
            const rise = end === 0 ? cg.endRise.frontM : cg.endRise.rearM;
            const ygr = yBot + rise;
            const xg1 = x * cr0 - ygr * sr0;
            const yg1 = x * sr0 + ygr * cr0;
            const z2g = yg1 * sa0 + zg * ca0;
            const hg = hAt(px1 + xg1 * cb + z2g * sb, pz1 - xg1 * sb + z2g * cb);
            const dg = hg - ((x * sinR + ygr * cr0) * cosP + zg * sinP);
            if (dg > outerMax) outerMax = dg;
          }
        }
        if (ln.f === 0) break; // centerline: one line, not two
      }
    }
    // Assemble the support height (see FAN_YIELD_* note): track edges clamp
    // exactly — the max-deficit outer sample always sits ON the ground
    // (levitation-proof anchor) — while the wheel-run fan lines lose
    // authority as the patch roughens (their residual is absorbed by the
    // renderer's per-wheel conform + articulated track band), and the belly
    // guard stays absolute.
    // r5 TERRAIN-CONTACT HARD GATE (round critique CRITICAL): the yield's
    // whole premise is that tankFactory's per-wheel conform layer (one-to-one
    // ground travel, +0.30 m compression) absorbs terrain left proud under the
    // wheel lines. GLB-swapped visuals hide the procedural gear. Imports that
    // do not expose BOTH detectable wheel pivots and a deformable belt still
    // take the FULL hard clamp on every fan/belly line. Imports with both
    // layers clear rigidGear after their first visual sync and may spend the
    // same bounded suspension travel as procedural gear. Entities without a
    // visual (selftest fixtures, headless sim, pre-build pool entries) keep
    // procedural semantics — nothing renders for them until a visual exists.
    const rough = outerMaxS - sumD / nD; // settle-frame: pose-decoupled (see above)
    const yieldWant = rigidGear
      ? 0
      : clamp(rough - FAN_YIELD_FREE_M, 0, FAN_YIELD_MAX_M);
    const yieldPrev = state._fanYield || 0;
    const fanYield = yieldWant > yieldPrev
      ? Math.min(yieldWant, yieldPrev + FAN_YIELD_OPEN_MPS * dt)
      : yieldWant; // closing (harder clamp) applies instantly
    state._fanYield = fanYield;
    // Hydraulic siege suspension can compress the high end of the loaded
    // track run while the opposite end droops. Treating the outer track edge
    // as a rigid hull point forced the chassis to sit on its highest tilted
    // pad; every road wheel then saturated in droop and the rendered belt
    // stayed almost parallel to the hull. Lower the sprung root by half the
    // intentional hydraulic rise, bounded by the authored compression
    // travel. The hard belly/undercut guards below remain unyielding.
    const rigidUndercut = cg && Number.isFinite(cg.gearBottomYM) &&
      Number.isFinite(cg.bottomYM) &&
      (cg.bottomYM as number) < (cg.gearBottomYM as number) - 0.01;
    const hydraulicTrackYield = state.suspensionAim && hydraulicAim && !rigidUndercut
      ? Math.min(hydraulicAim.compressionM ?? RIDE_COMPRESSION_M,
        Math.abs(Math.sin(suspensionAimPitch)) * sl)
      : 0;
    let supportY = outerMax - hydraulicTrackYield;
    if (fanMax - fanYield - hydraulicTrackYield > supportY) {
      supportY = fanMax - fanYield - hydraulicTrackYield;
    }
    // The METADATA-LESS belly guard shares the roughness yield: on ≤ 4 m-cell
    // live maps a pan-threatening crest between the tracks cannot exist while
    // the patch is smooth (guard fully hard there, r5 behavior), and on
    // high-frequency synthetic fields honoring it would hover the whole
    // contact patch (the selftest levitation gate). With MEASURED pan
    // metadata the guard line sits at the real plate and clamps HARD — see
    // the panY note above (the is1 ridge burial).
    const bellyYield = panY !== null ? 0 : fanYield;
    const bellySupportY = bellyMax - bellyYield;
    if (bellySupportY > supportY) supportY = bellySupportY;
    // The ordinary support polygon intentionally samples running gear and the
    // belly only. During a rollover those are no longer the lowest rigid
    // surfaces: a roof, turret side, nose or tail can carry the hull. Use the
    // exact closed armor-shell vertices that traceTank uses, including the
    // current turret yaw. The former spec-dimensions cuboid put the full
    // published height at every hull corner (including antenna/RWS height) and
    // visibly levitated roof-down tanks by up to nearly a metre.
    let rigidBodySupportY = -Infinity;
    if (body.tumbling || upYAfterAttitude < TUMBLE_ENTER_UP_Y) {
      const armor = spec.armor;
      const contact = armor?.bodyContactPoints;
      if (contact && contact.hull && contact.hull.length >= 3) {
        rigidBodySupportY = pointCloudSupportY(
          contact.hull, hAt, px1, pz1, cb, sb, ca0, sa0, cr0, sr0,
        );
        const turret = contact.turret;
        if (turret && turret.length >= 3) {
          const tp = armor.turretPivot || [0, 0, 0];
          const turretCosYaw = Math.cos(state.turretYaw || 0);
          const turretSinYaw = Math.sin(state.turretYaw || 0);
          const turretSupportY = pointCloudSupportY(
            turret, hAt, px1, pz1, cb, sb, ca0, sa0, cr0, sr0,
            turretCosYaw, turretSinYaw, tp[0], tp[1], tp[2],
          );
          if (turretSupportY > rigidBodySupportY) rigidBodySupportY = turretSupportY;
        }
      } else {
        // Non-finalized development fixtures retain a conservative fallback;
        // every playable fleet spec publishes bodyContactPoints during combat
        // anatomy finalization.
        const bodyHalfL = spec.dims.hullLengthM * 0.5;
        const bodyHalfW = spec.dims.widthM * 0.5;
        const bodyTopY = Math.max(spec.dims.heightM, yBot + 0.8);
        for (let yi = 0; yi < 2; yi++) {
          const localY = yi === 0 ? yBot : bodyTopY;
          for (let xi = -1; xi <= 1; xi += 2) {
            const localX = xi * bodyHalfW;
            const x1 = localX * cr0 - localY * sr0;
            const y1 = localX * sr0 + localY * cr0;
            for (let zi = -1; zi <= 1; zi += 2) {
              const localZ = zi * bodyHalfL;
              const z2 = y1 * sa0 + localZ * ca0;
              const h = hAt(
                px1 + x1 * cb + z2 * sb,
                pz1 - x1 * sb + z2 * cb,
              );
              const yOffset = y1 * cosP + localZ * sinP;
              const deficit = h - yOffset;
              if (deficit > rigidBodySupportY) rigidBodySupportY = deficit;
            }
          }
        }
      }
    }
    // Least-squares plane: pitch from the along-track height gradient (Σz = 0
    // by symmetry), roll from the mean left/right line difference. RENDERER
    // ROLL SIGN: positive roll lifts the right side, so ground higher on the
    // RIGHT must give a POSITIVE roll target (the old 4-corner fit used the
    // opposite sign and leaned the hull INTO every side slope).
    state._terr.pitch = Math.atan2(sumHZ, sumZZ);
    state._terr.roll = Math.atan2((sumR - sumL) / (nLR / 2), 2 * hw);
    // r3 TWO-POINT SETTLE: the LSQ plane under-rotates in V-troughs and on
    // sharp crests, so a single line-END contact carries the whole hull while
    // every other sample hangs (rigid bodies don't rest on one point — they
    // pivot about it until a second contact lands). When the deepest contact
    // sits in one longitudinal half, rotate the spring's pitch target toward
    // the deepest sample of the OPPOSITE half: ΔP = (d₁−d₂)/(z₁−z₂) is
    // exactly the rotation that brings both onto the plane. Zero on planar
    // ground (uniform deficits ⇒ ΔP ≈ 0), clamped so smooth terrain keeps the
    // pure fit; the attitude spring provides the damping/rate limit.
    let tipRaw = 0;
    if (argZ > zHalf && rearMax > -Infinity) {
      tipRaw = (outerMaxS - rearMax) / (argZ - rearZ);
    } else if (argZ < -zHalf && frontMax > -Infinity) {
      tipRaw = (outerMaxS - frontMax) / (argZ - frontZ);
    }
    state._terr.pitch += clamp(tipRaw, -SETTLE_CLAMP_RAD, SETTLE_CLAMP_RAD);
    // PERCH factor (see PERCH_W_BOOST): settle demand past the clamp means the
    // deepest contact is carrying the hull alone off one line end — feed the
    // smoothed 0..1 excess to the pitch spring boost. Instant attack (the
    // decay above already ran this tick), PERCH_RELEASE_S release.
    const perchWant = clamp(Math.abs(tipRaw) / SETTLE_CLAMP_RAD - 1, 0, 1);
    if (groundedAtStart && perchWant > state._perch) state._perch = perchWant;
    // Attitude-scaled margin (see SUPPORT_MARGIN_ATT_M): worst-case combined
    // pitch+roll lifts the plane an extra centimeter so the track link pads
    // (1–2 cm below the contact plane) can never approach the 3 cm gate.
    // During a PERCH the att share fades (× 1−0.7·perch): the hull hangs off
    // a single line END with every other pad meters in the air — the pad-hang
    // insurance protects nothing there while its full centimeter shows up
    // directly as patch float (the r5 egg-crate levitation was margin 3.3 cm
    // + the dense scan's endpoint blind spot). The tip contact itself keeps
    // the full SUPPORT_MARGIN_M base, and the 30% att floor still covers the
    // near-end pads through the release tail. RIGID gear keeps the FULL att
    // margin: GLB tanks have no conform to absorb fast-rotation transients
    // and no levitation gate riding on the margin (the selftest fixture is
    // procedural), so headroom beats float there.
    const perchCut = rigidGear ? 0 : 0.7 * state._perch;
    const supportMargin = SUPPORT_MARGIN_M + SUPPORT_MARGIN_ATT_M * (1 - perchCut) *
      Math.min(1, (Math.abs(pitchEff) + Math.abs(rollEff)) / SUPPORT_MARGIN_ATT_RAD);
    // Track/wheel contact may compress into the suspension, but a measured
    // hull pan is rigid and remains an absolute floor. If a visual publishes
    // a keel below its gear plane, that undercut is also rigid: do not spend
    // suspension travel by pushing the hull itself through the terrain.
    const normalCompressionFloorY = (rigidUndercut
      ? supportY
      : Math.max(bellySupportY, supportY - RIDE_COMPRESSION_M)) + supportMargin;
    const rigidBodyFloorY = rigidBodySupportY + RIGID_BODY_MARGIN_M;
    const compressionFloorY = Math.max(normalCompressionFloorY, rigidBodyFloorY);
    supportY = Math.max(supportY + supportMargin, rigidBodyFloorY);
    sup.x = state.pos.x; sup.z = state.pos.z; sup.yaw = state.yaw;
    sup.pitch = pitchEff; sup.roll = rollEff;
    sup.y = supportY; sup.floorY = compressionFloorY;
    sup.rigid = rigidGear;
    sup.cg = cg; // measured-footprint identity: a new stamp re-solves a parked tank
  }

  // Vertical contact state. While loaded, the sprung mass follows support
  // inside the authored compression/droop envelope. When terrain falls beyond
  // full droop, contact opens and the root follows a ballistic arc independent
  // of the heightfield. Re-contact occurs when the fully extended running gear
  // reaches support; the existing spring then absorbs the landing.
  {
    const supportY = sup.y;
    const floorY = Number.isFinite(sup.floorY) ? sup.floorY : supportY;
    const ride = state._ride || (state._ride = {
      y: state.pos.y, v: 0, supportY, groundV: 0, grounded: true, airTime: 0,
    });
    state.landingImpactMps = 0;
    if (!Number.isFinite(ride.y)) ride.y = state.pos.y;
    if (!Number.isFinite(ride.v)) ride.v = 0;
    if (!Number.isFinite(ride.supportY)) {
      // Fresh spawns are authored on terrain. Authority reconciliation may
      // deliberately seed an airborne pose; preserve its Y/v and phase.
      if (state.grounded !== false) {
        ride.y = supportY;
        ride.v = 0;
        ride.grounded = true;
      }
      ride.supportY = supportY;
      ride.groundV = 0;
    }

    const rawGroundV = clamp((supportY - ride.supportY) / dt,
      -RIDE_SUPPORT_V_CAP, RIDE_SUPPORT_V_CAP);
    const groundAlpha = 1 - Math.exp(-dt / RIDE_GROUND_V_TAU);
    ride.groundV += (rawGroundV - ride.groundV) * groundAlpha;
    ride.supportY = supportY;
    const contactY = supportY + RIDE_DROOP_M;
    let grounded = groundedAtStart;

    if (!grounded) {
      ride.v -= GRAVITY * dt;
      ride.y += ride.v * dt;
      ride.airTime = (ride.airTime || 0) + dt;
      // Only a descending/closing body can land. This avoids a rising ramp
      // below an ascending hull spuriously grabbing it back out of flight.
      if (ride.y <= contactY && ride.v <= ride.groundV + RIDE_DETACH_REL_V_MPS) {
        const closingMps = Math.max(0, ride.groundV - ride.v);
        ride.y = Math.max(contactY, floorY);
        ride.grounded = true;
        ride.airTime = 0;
        grounded = true;
        state.landingImpactMps = closingMps;
      }
    } else {
      // Test contact before applying the spring. Across a cliff, support can
      // move several meters in one tick; letting that delta enter the spring
      // would create the same unbounded downward tether as the old clamp.
      const clearOfDroop = ride.y - contactY > RIDE_DETACH_CLEARANCE_M;
      const separating = ride.v - ride.groundV > RIDE_DETACH_REL_V_MPS;
      if (clearOfDroop && separating) {
        ride.grounded = false;
        ride.airTime = 0;
        grounded = false;
      } else {
        ride.grounded = true;
        ride.airTime = 0;
        ride.v += (RIDE_OMEGA * RIDE_OMEGA * (supportY - ride.y) +
          2 * RIDE_ZETA * RIDE_OMEGA * (ride.groundV - ride.v)) * dt;
        ride.y += ride.v * dt;

        if (ride.y < floorY) {
          ride.y = floorY;
          if (ride.v < ride.groundV) ride.v = ride.groundV;
        } else if (ride.y > contactY) {
          if (ride.v - ride.groundV > RIDE_DETACH_REL_V_MPS) {
            ride.grounded = false;
            grounded = false;
          } else {
            ride.y = contactY;
            if (ride.v > ride.groundV) ride.v = ride.groundV;
          }
        }
      }
    }

    if (grounded && ride.y < floorY) {
      // A rapidly rising landing surface may overtake the chassis between
      // fixed ticks. The rigid compression floor remains the final no-tunnel
      // constraint.
      ride.y = floorY;
      if (ride.v < ride.groundV) ride.v = ride.groundV;
    }
    state.grounded = grounded;
    ride.grounded = grounded;
    state.verticalSpeed = ride.v;
    state.pos.y = ride.y;
  }

  // ---- turret & gun chase the world aim point (limits in hull space) ----
  const aim = input.aimPoint;
  const prevTurretYaw = state.turretYaw;
  if (aim) {
    // Solve the requested ray in the actual rendered hull frame. The former
    // small-angle subtraction (`world pitch - hull pitch/roll contribution`)
    // missed by more than a degree on combined sidehills. Firing then hid that
    // miss with a server-side shell snap, so the projectile visibly departed
    // above the barrel. Exact inverse YXZ composition makes the articulated
    // gun itself own the lay; fire code never needs to steer the shell.
    _hullEuler.set(-state.visualPitch, state.yaw, state.visualRoll, 'YXZ');
    _hullQuat.setFromEuler(_hullEuler);
    const armor = spec.armor || {};
    const turretPivot = armor.turretPivot || [0, spec.dims.heightM * 0.7, 0];
    const gunPivot = armor.gunPivot || [0, spec.dims.heightM * 0.15, 0];
    _gunOriginWorld.set(gunPivot[0], gunPivot[1], gunPivot[2])
      .applyAxisAngle(_worldUp, state.turretYaw)
      .add(_turretPivotLocal.set(turretPivot[0], turretPivot[1], turretPivot[2]))
      .applyQuaternion(_hullQuat)
      .add(state.pos);
    const dx = aim.x - _gunOriginWorld.x;
    const dy = aim.y - _gunOriginWorld.y;
    const dz = aim.z - _gunOriginWorld.z;
    const horiz = Math.hypot(dx, dz);
    const wantPitchWorld = Math.atan2(dy, Math.max(horiz, 1e-6));
    _aimLocal.set(dx, dy, dz).applyQuaternion(_hullQuat.conjugate());
    _hullQuat.conjugate();
    const localHoriz = Math.hypot(_aimLocal.x, _aimLocal.z);
    const wantTurretYaw = localHoriz > 1e-6
      ? Math.atan2(_aimLocal.x, _aimLocal.z)
      : state.turretYaw;
    const desiredGun = Math.atan2(_aimLocal.y, Math.max(localHoriz, 1e-6));
    if (fixedHydraulicGun) {
      // A hydraulic siege TD has one physical aiming joint: its hull. Keep the
      // authoritative firing state on that same visible bore instead of using
      // invisible turret/gun angles to finish the lay. The suspension feedback
      // above removes desiredGun while auto-traverse removes wantTurretYaw.
      state.turretYaw = 0;
      state.gunPitch = 0;
      const noseDown = (hydraulicAim?.noseDownDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_DOWN_DEG) * DEG2RAD;
      const noseUp = (hydraulicAim?.noseUpDeg ?? SUSPENSION_AIM_DEFAULT_NOSE_UP_DEG) * DEG2RAD;
      const requestedSuspensionPitch = suspensionAimPitch + desiredGun;
      const yawPinned = Math.abs(wrapAngle(wantTurretYaw)) > 1e-4;
      const pitchPinned = !state.suspensionAim ||
        requestedSuspensionPitch < -noseDown - 1e-4 ||
        requestedSuspensionPitch > noseUp + 1e-4;
      state.atGunLimit = yawPinned || pitchPinned;
      const labelWant = Math.abs(steer) < 0.2 && state.atGunLimit &&
        horiz >= GUN_LIMIT_LABEL_DIST_M;
      state._gunLimitHoldS = labelWant ? (state._gunLimitHoldS || 0) + dt : 0;
      state.gunLimitSpec = state._gunLimitHoldS >= GUN_LIMIT_LABEL_DWELL_S;
    } else {
      const turretRate = spec.turretTraverseDegS * DEG2RAD * debuff.turretMult;
      state.turretYaw = chaseAngle(state.turretYaw, wantTurretYaw, turretRate * dt);
    // Casemate gun-arc clamp (§7): the "virtual turret" (fire-control fine
    // lay) only slews inside ±gunArc of the hull; the reticle pins red
    // (atGunLimit) while the auto hull-traverse above swings the excess onto
    // the target.
    let yawPinned = false;
    if (gunArc !== Infinity) {
      if (state.turretYaw > gunArc) state.turretYaw = gunArc;
      else if (state.turretYaw < -gunArc) state.turretYaw = -gunArc;
      yawPinned = Math.abs(wrapAngle(wantTurretYaw)) > gunArc + 1e-4;
    }
    const lo = -spec.gunDepressionDeg * DEG2RAD;
    const hi = spec.gunElevationDeg * DEG2RAD;
    // Gun-terrain clamp (r5 minor): auto-depression onto close server-aim hits
    // used to sink the muzzle up to ~1.4 m into rising ground. Keep the muzzle
    // (and mid-barrel) at least MUZZLE_CLEARANCE_M above the heightfield by
    // raising the effective depression floor; the reticle pins via atGunLimit.
    let loEff = lo;
    const barrelLen = spec.armor && spec.armor.gunBarrel ? spec.armor.gunBarrel.lengthM : 0;
    if (barrelLen > 1) {
      _hullUpWorld.set(0, 1, 0).applyQuaternion(_hullQuat);
      _turretForwardWorld.set(
        Math.sin(state.turretYaw), 0, Math.cos(state.turretYaw),
      ).applyQuaternion(_hullQuat);
      _gunWorldDir.copy(_hullUpWorld).multiplyScalar(Math.sin(state.gunPitch))
        .addScaledVector(_turretForwardWorld, Math.cos(state.gunPitch));
      let needSin = -1;
      for (const frac of MUZZLE_CLEARANCE_FRACTIONS) { // muzzle tip + mid-barrel
        const hMuz = hAt(
          _gunOriginWorld.x + _gunWorldDir.x * barrelLen * frac,
          _gunOriginWorld.z + _gunWorldDir.z * barrelLen * frac,
        );
        const s = (hMuz + MUZZLE_CLEARANCE_M - _gunOriginWorld.y) / (barrelLen * frac);
        if (s > needSin) needSin = s;
      }
      if (needSin > -1) {
        // worldY(p) = A·sin(p) + B·cos(p) = R·sin(p + phase).
        // Invert that exact relation for the local gun pitch required to keep
        // the tube over terrain.
        const aY = _hullUpWorld.y;
        const bY = _turretForwardWorld.y;
        const radiusY = Math.hypot(aY, bY) || 1;
        const phaseY = Math.atan2(bY, aY);
        const loTerr = Math.asin(clamp(needSin / radiusY, -1, 1)) - phaseY;
        if (loTerr > loEff) loEff = Math.min(loTerr, hi);
      }
    }
    // Pin classification (r3): specPinned = the gun physically cannot reach
    // the lay within its OWN limits (true depression/elevation stop or the
    // casemate yaw arc) — always labeled. A pin introduced only by the
    // terrain-clearance floor (loEff > lo) tints the reticle but labels only
    // for far asks (≥ GUN_LIMIT_LABEL_DIST_M): close-range clearance pins are
    // the every-crest noise the round critique flagged, and a genuinely
    // obstructed close shot surfaces as PATH BLOCKED instead.
    const specPinned = yawPinned || desiredGun < lo - 1e-4 || desiredGun > hi + 1e-4;
    state.atGunLimit = specPinned || desiredGun < loEff - 1e-4;
    state.gunPitch = clamp(
      approach(state.gunPitch, clamp(desiredGun, loEff, hi), spec.gunPitchDegS * DEG2RAD * dt),
      lo, hi,
    );
    // Label DWELL + attitude-origin gate (r5 round critique MINOR): the label
    // fired persistently while simply driving rolling terrain (3 of 6 drive
    // captures) — WoT communicates transient depression pins with reticle
    // color only. Two filters on the LABEL (the red tint stays tick-instant):
    //  1. ATTITUDE-ORIGIN pins go label-silent at speed: if the ask would be
    //     INSIDE the gun's own arc with the hull level (wantPitchWorld within
    //     [lo, hi]) the pin exists only because the hull is momentarily
    //     pitched/rolled — on a crest transit above ~15 km/h that is terrain
    //     noise, not an aiming problem the player can fix. Parked or creeping
    //     hull-down lays (the deliberate case) keep the label.
    //  2. DWELL: any labeled state needs GUN_LIMIT_LABEL_DWELL_S of
    //     CONTINUOUS pin first, clearing instantly on release — one-crest
    //     flickers never reach the HUD.
    const attitudePin =
      (desiredGun < lo - 1e-4 || desiredGun > hi + 1e-4) &&
      wantPitchWorld >= lo - 1e-4 && wantPitchWorld <= hi + 1e-4;
    const fastTransient = attitudePin && Math.abs(state.speed) * 3.6 > 15;
    //  3. STEER (r6 round critique MINOR): the label re-fired during
    //     quasi-stationary obstacle escapes — hard steering at a crawl kept
    //     the hull under the 15 km/h transient gate while the reticle asked
    //     for depression over the near crest. Active maneuvering
    //     (|commanded steer| ≥ 0.2) never labels; WoT reserves the words for
    //     deliberate hull-down lays, and the red tint still marks the pin.
    //     Casemate auto-traverse is unaffected (it synthesizes steerCmd only
    //     when input.steer is 0, and `steer` here is the raw command).
    const labelWant = !fastTransient && Math.abs(steer) < 0.2 &&
      (specPinned || (state.atGunLimit && horiz >= GUN_LIMIT_LABEL_DIST_M));
    state._gunLimitHoldS = labelWant ? (state._gunLimitHoldS || 0) + dt : 0;
      state.gunLimitSpec = state._gunLimitHoldS >= GUN_LIMIT_LABEL_DWELL_S;
    }
  }
  state.turretYawRate = wrapAngle(state.turretYaw - prevTurretYaw) / dt;

  // ---- track scroll: outer track runs faster (v ± yawRate × 1.5 m) ----
  state.trackScroll.l += (state.speed + state.yawRate * OUTER_TRACK_ARM_M) * dt;
  state.trackScroll.r += (state.speed - state.yawRate * OUTER_TRACK_ARM_M) * dt;

  // ---- dispersion bloom (movement doc §8): grow fast, shrink with aim-time tau ----
  const b = spec.gun.bloom;
  let bloomTarget = Math.sqrt(1 +
    (b.move * Math.abs(state.speed) * 3.6) ** 2 +
    (b.hullRot * Math.abs(state.yawRate) * RAD2DEG) ** 2 +
    (b.turret * Math.abs(state.turretYawRate) * RAD2DEG) ** 2);
  // EQUIPMENT SYSTEM: vertical stabilizer scales the movement-bloom EXCESS
  // (the part above the fully-aimed 1.0 floor) so a parked tank gains
  // nothing — WoT's -20% dispersion-on-move semantics.
  if (debuff.bloomMult !== 1) bloomTarget = 1 + (bloomTarget - 1) * debuff.bloomMult;
  if (debuff.gunYellow) bloomTarget = Math.max(bloomTarget * 2, GUN_YELLOW_BLOOM_FLOOR);
  const tau = bloomTarget > state.bloomF
    ? BLOOM_GROW_TAU
    : (spec.gun.aimTimeS * debuff.aimTimeMult) / LN6;
  state.bloomF += (bloomTarget - state.bloomF) * (1 - Math.exp(-dt / tau));
  if (debuff.gunYellow && state.bloomF < GUN_YELLOW_BLOOM_FLOOR) {
    state.bloomF = GUN_YELLOW_BLOOM_FLOOR;
  }
  if (state.bloomF < 1) state.bloomF = 1;
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
