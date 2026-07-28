/**
 * movement.js — pure-logic tank movement, attitude, turret/gun kinematics and
 * dispersion bloom. Implements docs/research/movement-physics.md §2–§8 and §10
 * under the interface locked in docs/ARCHITECTURE.md §3.4.
 *
 * Conventions (ARCHITECTURE §1.1): meters / seconds / radians, +Y up,
 * forwardAxis(yaw) = [sin(yaw), 0, cos(yaw)], rightAxis(yaw) = [cos(yaw), 0, -sin(yaw)],
 * yaw = 0 faces +Z, positive pitch = nose up.
 * ROLL SIGN (locked by the renderer): every consumer composes the pose as
 * rotation.set(-visualPitch, yaw, visualRoll, 'YXZ') (tankFactory syncFromState,
 * armor buildFrames, damage.js, killcam) — under that composition POSITIVE roll
 * lifts the RIGHT side (worldY of a hull-local point = pos.y
 * + x·sin(roll)·cos(pitch) + z·sin(pitch)). The r5 terrain-contact gate traced
 * one track buried ~1 m while the other floated at rest to the old fit using
 * the opposite ("right side down") sign: the hull leaned INTO every side slope.
 *
 * No rendering, no DOM, no top-level side effects — runs under plain node.
 */

import { Vector3 } from 'three';

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
const K_ACCEL = 0.17;            // m/s² per (hp/t) on resistance-1 ground
const C_DRAG = 0.65;             // quadratic drag fraction — asymptotic crawl to v_max (§3)
// Engine torque spool (r4 crit "initial surge a touch hot"): drive force ramps
// from SPOOL_FLOOR to 1 over SPOOL_S when the throttle opens, so a 60-ton
// launch reads heavy (tracks bite, hull squats, THEN it surges) without
// materially changing 0-40 times. Decays quickly when the throttle closes.
const SPOOL_S = 0.35;            // s to full drive torque from a standing start
const SPOOL_FLOOR = 0.25;        // torque fraction available instantly
const SPOOL_DECAY_S = 0.15;      // s for the spool to unwind at closed throttle
const BRAKE_MULT = 3.5;          // braking is this much stronger than driving
// Brake decel cap scales with specific power (weight class): a 12 hp/t heavy
// caps near 7 m/s² and coasts visibly longer than a 25+ hp/t light/MBT at 9.
// cap = clamp(BRAKE_CAP_BASE + BRAKE_CAP_PER_HPT × hp/t, BRAKE_CAP_MIN, BRAKE_CAP_MAX)
const BRAKE_CAP_BASE = 4;        // m/s²
const BRAKE_CAP_PER_HPT = 0.25;  // m/s² per hp/t
const BRAKE_CAP_MIN = 5;         // m/s² — even the heaviest sluggard stops eventually
const BRAKE_CAP_MAX = 9;         // m/s² — ~2 s stop from 65 km/h, the old flat cap
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
const GRAVITY = 9.81;            // m/s²
const MAX_CLIMB_DEG = 28;        // slope (deg) at which the drive stalls
const DOWNHILL_BONUS_CAP = 0.25; // up to +25% v_target downhill
const OVERSPEED_CAP = 1.2;       // absolute speed ceiling: 1.2 × transmission limit
const YAW_SPOOL_S = 0.15;        // track spool-up time toward target yaw rate
const NEUTRAL_TURN_MULT = 0.95;  // Pc term of the wiki traverse formula
const PIVOT_OFFSET_M = 1.2;      // locked-track orbit offset for 'pivot' style turns
const PIVOT_SPEED_EPS = 0.1;     // m/s — below this a stationary pivot turn engages
const HALF_WID_FRAC = 0.5;       // contact-line half-width = 0.5 × widthM (track outer edge)
// Terrain-contact support solve (r5 hard gate): the hull pose is resolved so
// that NO point along either track contact line renders below the heightfield.
// Line half-length 0.45 × hullLengthM matches the rendered track bottom run
// (tankFactory places idler/sprocket at ~±0.45 L; the arcs curve up past them).
const SUPPORT_LEN_FRAC = 0.45;   // support line half-length = 0.45 × hullLengthM
const SUPPORT_SPACING_M = 0.35;  // max gap between contact samples along a line
const SUPPORT_MAX_N = 24;        // per-line sample cap (Maus-length hulls)
// Contact margin: the solved plane rides this far above the highest contact
// sample. Covers (a) the sub-sample terrain bulge between support points and
// (b) the bounded phase error between this sim-tick susp mirror and the
// renderer's per-frame integration at non-60 fps — while staying under the
// track link pads, which hang ~1–2 cm below the hull-local contact plane.
const SUPPORT_MARGIN_M = 0.015;
// Mirror of tankFactory's turn-lean sway (visual layer adds it to rotation.z):
// the support solve folds the predicted sway into the effective roll so a hard
// fast turn cannot dip the leaned-into track edge below the terrain.
const SWAY_GAIN = 0.011;
const SWAY_CLAMP = 0.035;
const SWAY_SMOOTH = 0.12;
// Mirror of tankFactory's visual suspension rock layer (suspP/suspR in
// syncFromState): the renderer adds a self-timed under-damped spring to the
// hull rotation on top of visualPitch/visualRoll, so the support solve must
// clear the terrain at THAT pose. Constants must stay in lockstep with
// tankFactory.js (SUSP_W/SUSP_Z, accel squat, 4-corner fit, clamps) — see
// docs/handoff/gameplay_feel-r1.md for the pairing note.
const SUSP_W = 7.5;
const SUSP_Z = 0.30;
const SUSP_ACCEL_CLAMP = 9;      // m/s²
const SUSP_ACCEL_GAIN = 0.0052;  // rad per m/s² (nose up under accel)
const SUSP_FIT_LEN = 0.36;       // × hullLengthM (their corner fit)
const SUSP_FIT_WID = 0.42;       // × widthM
const SUSP_P_CLAMP = 0.07;       // rad — terrain-delta pitch authority
const SUSP_R_CLAMP = 0.06;       // rad — terrain-delta roll authority
const SUSP_K_SPEED = 4;          // m/s for full rate scale
const SUSP_K_GAIN = 0.8;
// Mirror of tankFactory's r6 VISIBLE-dynamics amplification: syncFromState
// renders the hull at susp.p × SUSP_VIS_P / susp.r × SUSP_VIS_R and sway =
// _swayEst × SWAY_VIS (readable squat/dive/turn-lean at gameplay camera
// distance). The support solve therefore clears the terrain at the AMPLIFIED
// pose — otherwise the exaggerated transient buries a track end ~10 cm on
// rough ground (r3 drive gate: minClear −11.7 cm before this fold). Constants
// MUST stay in lockstep with tankFactory.js SUSP_VIS_P/SUSP_VIS_R/SWAY_VIS;
// tankFactory's half-lift compensation hack is removed by the REQUIRED
// pairing patch in docs/handoff/gameplay_feel-r1.md §1 — the solve is the
// single authority. (The r2 handoff carried the same hunk but it was never
// applied; the stacked half-lift floated the whole contact patch 12-17 cm
// during full-speed turns — r1 critique, terrain-contact hard gate.)
const SUSP_VIS_P = 2.6;
const SUSP_VIS_R = 2.1;
const SWAY_VIS = 2.3;
// Mirror of tankFactory's hit-flinch rock (FLINCH_W/FLINCH_Z in the visual
// layer): a large-caliber hit kicks flinchPV up to ~0.36 rad/s ⇒ peak rock
// ~1.6°, which over a 3.5 m half-length transiently dips a track end ~10 cm —
// far past the 1.5 cm SUPPORT_MARGIN. The oscillator is therefore integrated
// HERE (state._flinch, once per sim tick) and folded into the support solve;
// tankFactory reads state._flinch for rendering and routes its hit/recoil
// impulses into it (see the pairing note in docs/handoff/gameplay_feel-r2.md).
// RENDER SIGN: rotation.x = -(visualPitch + suspP) + flinchP, so flinch pitch
// SUBTRACTS from the movement-space pitch; flinch roll adds like the others.
const FLINCH_W = 13;
const FLINCH_Z = 0.32;
const MUZZLE_CLEARANCE_M = 0.15; // gun-terrain clamp: min muzzle height above ground
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
const RAD2DEG = 180 / Math.PI;

// Module-scope scratch (no per-frame allocation, ARCHITECTURE §1.3).
const _push = new Vector3();

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------
function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

/** Wrap an angle to (-π, π]. */
function wrapAngle(a) {
  a = a % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Move `cur` toward `target` by at most `maxDelta` (no overshoot). */
function approach(cur, target, maxDelta) {
  const d = target - cur;
  if (d > maxDelta) return cur + maxDelta;
  if (d < -maxDelta) return cur - maxDelta;
  return target;
}

/** Move angle `cur` toward angle `target` along the shortest arc by ≤ `maxDelta`. */
function chaseAngle(cur, target, maxDelta) {
  const d = wrapAngle(target - cur);
  if (d > maxDelta) return wrapAngle(cur + maxDelta);
  if (d < -maxDelta) return wrapAngle(cur - maxDelta);
  return wrapAngle(target);
}

/** Climb penalty / downhill bonus factor for v_target (movement doc §5). */
function slopeSpeedFactor(pitchAlongRad) {
  const pitchDeg = pitchAlongRad * RAD2DEG;
  if (pitchDeg > 0) {
    return clamp(1 - pitchDeg / MAX_CLIMB_DEG, 0, 1);
  }
  return 1 + Math.min(-pitchDeg / 45, DOWNHILL_BONUS_CAP);
}

/**
 * Extract movement-relevant debuffs from a CombatState per the locked table in
 * ARCHITECTURE §2.4. `combat == null` ⇒ fully healthy.
 */
function readDebuffs(combat) {
  let immobile = false;
  let powerMult = 1;
  let accelMult = 1;
  let traverseMult = 1;
  let turretMult = 1;
  let aimTimeMult = 1;
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
      if ((m.trackL && m.trackL.state === 'red') ||
          (m.trackR && m.trackR.state === 'red')) immobile = true;
      const ring = m.turretRing;
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
  }
  return { immobile, powerMult, accelMult, traverseMult, turretMult, aimTimeMult, gunYellow };
}

/** Hull-local height of the gun trunnion above ground contact (for aim angles). */
function gunPivotHeight(spec) {
  const a = spec.armor;
  if (a && a.turretPivot && a.gunPivot) return a.turretPivot[1] + a.gunPivot[1];
  return spec.dims.heightM * 0.85;
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
export function createTankState(spec, pos, yaw) {
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
    yawRate: 0,
    visualPitch: 0,
    visualRoll: 0,
    turretYaw: 0,
    gunPitch: 0,
    turretYawRate: 0,
    aimPoint: aim,
    bloomF: 1,
    trackScroll: { l: 0, r: 0 },
    atGunLimit: false,
    _spring: {
      pitch: 0, roll: 0, pitchV: 0, rollV: 0, // attitude spring state
      recoilVX: 0, recoilVZ: 0,               // decaying hull translation impulse
    },
    _prevSpeed: 0,
    _spool: 0,                     // engine torque spool 0..1 (SPOOL_S ramp)
    _terr: { pitch: 0, roll: 0 },  // last terrain plane fit (spring target source)
    _swayEst: 0,                   // predicted visual turn-lean sway (rad)
    _susp: { p: 0, r: 0, pv: 0, rv: 0 }, // mirror of the visual susp rock layer
    _flinch: { p: 0, r: 0, pv: 0, rv: 0 }, // hit-flinch rock (impulses fed by the visual)
    _sup: {                        // static-pose support cache (skip resampling)
      x: NaN, z: NaN, yaw: 0, pitch: 0, roll: 0, y: pos.y,
    },
  };
}

/**
 * Advance one tank by `dt` seconds: terrain-resistance-gated hp/t acceleration,
 * slope penalty/overspeed + gravity slide, pivot/neutral track steering with
 * reverse flip, 4-corner attitude spring with inertial pitch, turret/gun chase
 * of `input.aimPoint` with hull-space limits, and dispersion bloom integration.
 * Mutates `entity.state` in place; touches nothing else.
 *
 * @param {object} entity - `{ spec, state, input, combat }` (combat may be null ⇒ healthy).
 * @param {object} heightField - `{ getHeightAt(x,z), getNormalAt(x,z), getGroundType(x,z) }`.
 * @param {number} dt - Timestep in seconds (SIM_DT in-game).
 * @param {?function} collide - Optional `(pos, radiusM, outPush) => boolean` circle
 *   pushback provided by integration; when it returns true, `outPush` is added to `pos`.
 * @returns {void}
 */
export function updateTank(entity, heightField, dt, collide = null) {
  if (!(dt > 0)) return;
  const spec = entity.spec;
  const state = entity.state;
  const input = entity.input;
  const debuff = readDebuffs(entity.combat);

  const throttle = debuff.immobile ? 0 : clamp(input.throttle || 0, -1, 1);
  const steer = debuff.immobile ? 0 : clamp(input.steer || 0, -1, 1);
  const braking = !!input.brake;

  // ---- ground sampling (hull center) ----
  const ground = heightField.getGroundType(state.pos.x, state.pos.z);
  const res = spec.terrainResistance;
  const R = res[ground] || res.medium;
  const Rh = res.hard;

  // ---- terrain pitch/roll: previous tick's contact-line plane fit ----
  // The fit itself is computed at the settled post-integration pose below (so
  // the support solve and the fit share one sampling pass); the speed/slope
  // logic reads the one-tick-old plane, which is imperceptible at 60 Hz.
  const hw = HALF_WID_FRAC * spec.dims.widthM;
  const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);   // forwardAxis
  const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);  // rightAxis
  const terrPitch = state._terr.pitch;

  const topMps = spec.topSpeedKmh / 3.6;
  const revMps = spec.reverseSpeedKmh / 3.6;

  // ---- hull traverse (wiki formula reduced: Tr = Tn × Rh/Rx × Pc, + debuffs) ----
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
  const yawTarget = steer * trMax * steerSign;
  state.yawRate = approach(state.yawRate, yawTarget, (Math.max(trMax, 1e-6) / YAW_SPOOL_S) * dt);
  state.yaw = wrapAngle(state.yaw + state.yawRate * dt);
  // 'pivot' tanks rotate about the locked track: the hull center orbits sideways.
  if (Math.abs(state.speed) < PIVOT_SPEED_EPS && spec.pivotStyle === 'pivot' && steer !== 0) {
    const drift = Math.sign(steer) * PIVOT_OFFSET_M * Math.abs(state.yawRate) * dt;
    state.pos.x += rx * drift;
    state.pos.z += rz * drift;
  }

  // ---- longitudinal speed ----
  const pSpec = (spec.enginePowerHp * debuff.powerMult) / spec.weightTons;
  const accel = K_ACCEL * (pSpec / R) * debuff.accelMult;
  const moveSign = state.speed !== 0 ? Math.sign(state.speed) : Math.sign(throttle);
  const pitchAlong = terrPitch * (moveSign || 1);
  let vLim = throttle >= 0 ? topMps : revMps;
  vLim *= slopeSpeedFactor(pitchAlong);
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
  // Class-scaled brake cap (healthy hp/t — brakes are not the engine): heavies
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
    // bites instantly, the rest builds over SPOOL_S.
    const spool = state._spool || 0;
    rate *= SPOOL_FLOOR + (1 - SPOOL_FLOOR) * spool;
    spoolTarget = 1;
    // Steering diverts engine power to the tracks (§4): while turning hard the
    // drive can't refill what the turn bleeds, so serpentining costs momentum.
    if (trMax > 1e-6) {
      rate *= 1 - TURN_POWER_DIVERT * Math.min(Math.abs(state.yawRate) / trMax, 1);
    }
  }
  state._spool = spoolTarget > 0
    ? Math.min(1, (state._spool || 0) + dt / SPOOL_S)
    : Math.max(0, (state._spool || 0) - dt / SPOOL_DECAY_S);
  state.speed = approach(state.speed, vTarget, rate * dt);
  // Direct multiplicative turn bleed (movement doc §4): every hard turn costs
  // momentum — v *= 1 − k·|yawRate|/trMax·dt. r4 crit: fades out below
  // ~half top speed so mid-speed serpentining stays fluid; the target-scale
  // bleed above remains the dominant term.
  if (trMax > 1e-6 && state.yawRate !== 0) {
    const bleedFade = clamp(
      (Math.abs(state.speed) / Math.max(topMps, 1e-6) - TURN_BLEED_FADE_LO) /
        (TURN_BLEED_FADE_HI - TURN_BLEED_FADE_LO), 0, 1);
    state.speed *= 1 -
      TURN_DIRECT_BLEED * bleedFade * Math.min(Math.abs(state.yawRate) / trMax, 1) * dt;
  }
  if (!debuff.immobile) {
    // Gravity along the track line: stalled tanks slide back, coasting gains downhill.
    state.speed += -GRAVITY * Math.sin(terrPitch) * dt * (throttle !== 0 ? 0.3 : 1.0);
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
    if (collide(state.pos, radiusM, _push)) state.pos.add(_push);
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
  const dvdt = clamp((state.speed - state._prevSpeed) / dt, -DVDT_CLAMP, DVDT_CLAMP);
  const inertialPitch = clamp(K_INERTIA * dvdt, -INERTIA_CLAMP, INERTIA_CLAMP);
  state._prevSpeed = state.speed;

  // Predicted visual turn-lean sway (tankFactory adds it to rotation.z): fold
  // it into the effective roll so hard fast turns keep the leaned track edge
  // above ground too.
  const swayTarget = clamp(state.yawRate * state.speed * SWAY_GAIN, -SWAY_CLAMP, SWAY_CLAMP);
  state._swayEst += (swayTarget - state._swayEst) * SWAY_SMOOTH;

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
  const targetPitch = state._terr.pitch + inertialPitch;
  const targetRoll = state._terr.roll;
  spr.pitchV += (SPRING_OMEGA * SPRING_OMEGA * (targetPitch - spr.pitch) -
                 2 * SPRING_ZETA * SPRING_OMEGA * spr.pitchV) * dt;
  spr.pitch += spr.pitchV * dt;
  spr.rollV += (SPRING_OMEGA * SPRING_OMEGA * (targetRoll - spr.roll) -
                2 * SPRING_ZETA * SPRING_OMEGA * spr.rollV) * dt;
  spr.roll += spr.rollV * dt;
  state.visualPitch = spr.pitch;
  state.visualRoll = spr.roll;

  // ---- mirror of tankFactory's visual susp rock layer -----------------------
  // syncFromState (which runs right after this tick) will render the hull at
  // rotation.set(-(visualPitch + suspP), yaw, visualRoll + suspR + sway) —
  // replicate its spring tick-for-tick so the support solve below clears the
  // terrain at the pose that actually reaches the screen.
  {
    const accel = clamp(dvdt, -SUSP_ACCEL_CLAMP, SUSP_ACCEL_CLAMP);
    let pT = accel * SUSP_ACCEL_GAIN;
    let rT = 0;
    const hl2 = SUSP_FIT_LEN * spec.dims.hullLengthM;
    const hw2 = SUSP_FIT_WID * spec.dims.widthM;
    const fx2 = Math.sin(state.yaw), fz2 = Math.cos(state.yaw);
    const rx2 = Math.cos(state.yaw), rz2 = -Math.sin(state.yaw);
    const px2 = state.pos.x, pz2 = state.pos.z;
    const hFL = heightField.getHeightAt(px2 + fx2 * hl2 - rx2 * hw2, pz2 + fz2 * hl2 - rz2 * hw2);
    const hFR = heightField.getHeightAt(px2 + fx2 * hl2 + rx2 * hw2, pz2 + fz2 * hl2 + rz2 * hw2);
    const hRL = heightField.getHeightAt(px2 - fx2 * hl2 - rx2 * hw2, pz2 - fz2 * hl2 - rz2 * hw2);
    const hRR = heightField.getHeightAt(px2 - fx2 * hl2 + rx2 * hw2, pz2 - fz2 * hl2 + rz2 * hw2);
    const terrP2 = Math.atan2((hFL + hFR - hRL - hRR) * 0.5, 2 * hl2);
    // Renderer-consistent roll sign (positive lifts the right side): the rock
    // layer's roll delta now measures the true conformance error instead of
    // fighting the main spring on side slopes.
    const terrR2 = Math.atan2((hFR + hRR - hFL - hRL) * 0.5, 2 * hw2);
    const kf = Math.min(1, Math.abs(state.speed) / SUSP_K_SPEED) * SUSP_K_GAIN;
    pT += clamp((terrP2 - state.visualPitch) * kf, -SUSP_P_CLAMP, SUSP_P_CLAMP);
    rT += clamp((terrR2 - state.visualRoll) * kf, -SUSP_R_CLAMP, SUSP_R_CLAMP);
    susp.pv += (SUSP_W * SUSP_W * (pT - susp.p) - 2 * SUSP_Z * SUSP_W * susp.pv) * dt;
    susp.p += susp.pv * dt;
    susp.rv += (SUSP_W * SUSP_W * (rT - susp.r) - 2 * SUSP_Z * SUSP_W * susp.rv) * dt;
    susp.r += susp.rv * dt;
  }

  // ---- support solve: no contact sample below ground at the rendered pose ----
  // Effective RENDERED attitude (movement space): rotation.x = -(pitch +
  // suspP×VIS) + flinchP ⇒ flinch pitch enters with a MINUS sign here; roll
  // adds. The susp/sway layers carry the renderer's visibility amplification.
  // Sampling, plane fit and clamp all run at THIS post-step attitude in one
  // pass — sampling at the pre-step attitude left a Δattitude × lever × slope
  // height error that the ×2.6 visibility amplification turned into multi-cm
  // track burial on rough ground (r3 drive gate). The fit lands in state._terr
  // for the NEXT tick's spring targets/slope logic (one-tick-old plane —
  // imperceptible at 60 Hz, and exactly the pre-existing contract).
  const pitchEff = spr.pitch + susp.p * SUSP_VIS_P - flP;
  const rollEff = spr.roll + susp.r * SUSP_VIS_R + state._swayEst * SWAY_VIS + flR;
  // Static-pose cache: a parked, settled tank re-uses the solved height instead
  // of re-sampling the (static) heightfield every tick.
  const supFresh =
    Math.abs(state.pos.x - sup.x) < 0.004 && Math.abs(state.pos.z - sup.z) < 0.004 &&
    Math.abs(wrapAngle(state.yaw - sup.yaw)) < 0.0012 &&
    Math.abs(pitchEff - sup.pitch) < 0.0012 && Math.abs(rollEff - sup.roll) < 0.0012;
  if (!supFresh) {
    const sl = SUPPORT_LEN_FRAC * spec.dims.hullLengthM;
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
    let supportY = -Infinity;
    for (let side = -1; side <= 1; side += 2) {
      const x = side * hw;
      const x1 = x * cr0, y1 = x * sr0;
      for (let k = 0; k < nLine; k++) {
        const z = -sl + k * step;
        const z2 = y1 * sa0 + z * ca0;
        const h = heightField.getHeightAt(px1 + x1 * cb + z2 * sb, pz1 - x1 * sb + z2 * cb);
        sumHZ += h * z;
        sumZZ += z * z;
        if (side < 0) sumL += h; else sumR += h;
        nLR++;
        // support deficit at the rendered pose (worldY of the contact point
        // relative to pos.y): pos.y must sit at max over samples of
        // h − (x·sinR·cosP + z·sinP)
        const d = h - (x * sinR * cosP + z * sinP);
        if (d > supportY) supportY = d;
      }
    }
    // Least-squares plane: pitch from the along-track height gradient (Σz = 0
    // by symmetry), roll from the mean left/right line difference. RENDERER
    // ROLL SIGN: positive roll lifts the right side, so ground higher on the
    // RIGHT must give a POSITIVE roll target (the old 4-corner fit used the
    // opposite sign and leaned the hull INTO every side slope).
    state._terr.pitch = Math.atan2(sumHZ, sumZZ);
    state._terr.roll = Math.atan2((sumR - sumL) / (nLR / 2), 2 * hw);
    supportY += SUPPORT_MARGIN_M;
    state.pos.y = supportY;
    sup.x = state.pos.x; sup.z = state.pos.z; sup.yaw = state.yaw;
    sup.pitch = pitchEff; sup.roll = rollEff; sup.y = supportY;
  } else {
    state.pos.y = sup.y;
  }

  // ---- turret & gun chase the world aim point (limits in hull space) ----
  const aim = input.aimPoint;
  const prevTurretYaw = state.turretYaw;
  if (aim) {
    const gy = state.pos.y + gunPivotHeight(spec);
    const dx = aim.x - state.pos.x;
    const dy = aim.y - gy;
    const dz = aim.z - state.pos.z;
    const horiz = Math.hypot(dx, dz);
    const wantYawWorld = horiz > 1e-6 ? Math.atan2(dx, dz) : state.yaw + state.turretYaw;
    const wantPitchWorld = Math.atan2(dy, Math.max(horiz, 1e-6));
    const turretRate = spec.turretTraverseDegS * DEG2RAD * debuff.turretMult;
    state.turretYaw = chaseAngle(state.turretYaw, wantYawWorld - state.yaw, turretRate * dt);
    // Hull-plane elevation along the gun azimuth: pitch and roll both tilt the gun.
    const ct = Math.cos(state.turretYaw), st = Math.sin(state.turretYaw);
    // Hull attitude's contribution to the barrel's WORLD pitch at turret
    // azimuth θ, matching the visual/armor YXZ pose composition
    // (root.rotation.set(-visualPitch, yaw, visualRoll, 'YXZ')):
    //   worldPitch ≈ gunPitch + visualPitch·cosθ + visualRoll·sinθ.
    // The roll term was previously subtracted, which pushed the settled gun
    // ~2·|roll·sinθ| off the aim point on rolled terrain (shots fell short).
    const hullPitchAtGun = state.visualPitch * ct + state.visualRoll * st;
    const lo = -spec.gunDepressionDeg * DEG2RAD;
    const hi = spec.gunElevationDeg * DEG2RAD;
    const desiredGun = wantPitchWorld - hullPitchAtGun;
    // Gun-terrain clamp (r5 minor): auto-depression onto close server-aim hits
    // used to sink the muzzle up to ~1.4 m into rising ground. Keep the muzzle
    // (and mid-barrel) at least MUZZLE_CLEARANCE_M above the heightfield by
    // raising the effective depression floor; the reticle pins via atGunLimit.
    let loEff = lo;
    const barrelLen = spec.armor && spec.armor.gunBarrel ? spec.armor.gunBarrel.lengthM : 0;
    if (barrelLen > 1) {
      const a = spec.armor;
      const trunnionFwd = (a.turretPivot ? a.turretPivot[2] : 0) + (a.gunPivot ? a.gunPivot[2] : 0);
      const gunYawW = state.yaw + state.turretYaw;
      const gyw = Math.sin(gunYawW), gzw = Math.cos(gunYawW);
      const cosWP = Math.cos(state.gunPitch + hullPitchAtGun); // planform reach, ~current pose
      let needSin = -1;
      for (const frac of [1, 0.55]) { // muzzle tip + mid-barrel
        const reach = trunnionFwd + barrelLen * frac * cosWP;
        const hMuz = heightField.getHeightAt(state.pos.x + gyw * reach, state.pos.z + gzw * reach);
        const s = (hMuz + MUZZLE_CLEARANCE_M - gy) / (barrelLen * frac);
        if (s > needSin) needSin = s;
      }
      if (needSin > -1) {
        const loTerr = Math.asin(Math.min(needSin, 1)) - hullPitchAtGun;
        if (loTerr > loEff) loEff = Math.min(loTerr, hi);
      }
    }
    state.atGunLimit = desiredGun < loEff - 1e-4 || desiredGun > hi + 1e-4;
    state.gunPitch = clamp(
      approach(state.gunPitch, clamp(desiredGun, loEff, hi), spec.gunPitchDegS * DEG2RAD * dt),
      lo, hi,
    );
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

/**
 * Apply firing recoil (movement doc §6.4): a pitch/roll-rate kick to the hull
 * attitude spring that tips the hull away from the muzzle, a small backward
 * translation impulse that decays over ~0.4 s, and the afterShot bloom multiplier.
 * Call once per shot, after createShell (ARCHITECTURE §4 step 2c).
 *
 * @param {object} state - TankState of the firing tank (mutated).
 * @param {object} spec - TankSpec of the firing tank.
 * @returns {void}
 */
export function fireRecoil(state, spec) {
  const cal = spec.gun.caliberMm;
  const heavy = clamp((cal - 75) / 85, 0, 1); // 75 mm → light kick, 160 mm+ → max
  const kick = (RECOIL_KICK_MIN_DEGS + (RECOIL_KICK_MAX_DEGS - RECOIL_KICK_MIN_DEGS) * heavy)
    * DEG2RAD;
  const spr = state._spring;
  // Split the kick onto hull axes from the gun's hull-relative azimuth:
  // firing forward lifts the nose; firing over the right side rocks the hull
  // left-side-down (= right side UP: positive roll under the renderer's
  // rotation.z = +visualRoll composition — see the roll-sign note up top).
  const ct = Math.cos(state.turretYaw), st = Math.sin(state.turretYaw);
  spr.pitchV += kick * ct;
  spr.rollV += kick * st;
  // Backward translation impulse along the horizontal gun direction.
  const gunYawWorld = state.yaw + state.turretYaw;
  const v = RECOIL_VEL_MPS * (0.7 + 0.6 * heavy);
  spr.recoilVX -= Math.sin(gunYawWorld) * v;
  spr.recoilVZ -= Math.cos(gunYawWorld) * v;
  state.bloomF *= spec.gun.bloom.afterShot;
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
export function computeDispersionRadM(spec, state, distM) {
  return spec.gun.baseAccuracy * (distM / 100) * state.bloomF;
}
