/**
 * movement.js — pure-logic tank movement, attitude, turret/gun kinematics and
 * dispersion bloom. Implements docs/research/movement-physics.md §2–§8 and §10
 * under the interface locked in docs/ARCHITECTURE.md §3.4.
 *
 * Conventions (ARCHITECTURE §1.1): meters / seconds / radians, +Y up,
 * forwardAxis(yaw) = [sin(yaw), 0, cos(yaw)], rightAxis(yaw) = [cos(yaw), 0, -sin(yaw)],
 * yaw = 0 faces +Z, positive pitch = nose up, positive roll = right side down.
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
// in 6.5 s). 0.20 with a softer C_DRAG (0.85→0.72) keeps the initial surge in
// the same band while high hp/t tanks close the last 30% with WoT authority.
const K_ACCEL = 0.20;            // m/s² per (hp/t) on resistance-1 ground
const C_DRAG = 0.72;             // quadratic drag fraction — asymptotic crawl to v_max (§3)
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
const TURN_DIRECT_BLEED = 0.15;  // per-second multiplicative speed loss at full-rate turn (§4)
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
const HALF_LEN_FRAC = 0.35;      // corner sampling half-length = 0.35 × hullLengthM
const HALF_WID_FRAC = 0.5;       // corner sampling half-width  = 0.5  × widthM
const SPRING_OMEGA = 2 * Math.PI * 3; // hull attitude spring natural frequency (rad/s)
const SPRING_ZETA = 0.6;         // damping ratio
const K_INERTIA = 0.006;         // rad of pitch target per m/s² of longitudinal accel
const INERTIA_CLAMP = 0.1;       // rad — max inertial pitch contribution
const DVDT_CLAMP = 16;           // m/s² — reject collision-pushback spikes
const BLOOM_GROW_TAU = 0.05;     // s — bloom-up is effectively instant
const LN3 = Math.log(3);         // aimTime = time to shrink to 1/3 ⇒ tau = aimTime/ln3
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

  // ---- terrain pitch/roll from 4-corner sampling at the track contact rect ----
  const hl = HALF_LEN_FRAC * spec.dims.hullLengthM;
  const hw = HALF_WID_FRAC * spec.dims.widthM;
  const fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);   // forwardAxis
  const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);  // rightAxis
  const px = state.pos.x, pz = state.pos.z;
  const hFL = heightField.getHeightAt(px + fx * hl - rx * hw, pz + fz * hl - rz * hw);
  const hFR = heightField.getHeightAt(px + fx * hl + rx * hw, pz + fz * hl + rz * hw);
  const hRL = heightField.getHeightAt(px - fx * hl - rx * hw, pz - fz * hl - rz * hw);
  const hRR = heightField.getHeightAt(px - fx * hl + rx * hw, pz - fz * hl + rz * hw);
  // Positive pitch = nose up; positive roll = right side down.
  const terrPitch = Math.atan2((hFL + hFR - hRL - hRR) * 0.5, 2 * hl);
  const terrRoll = Math.atan2((hFL + hRL - hFR - hRR) * 0.5, 2 * hw);

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
  if (braking || debuff.immobile || vTarget * state.speed < 0) {
    rate = brakeRate; // hard brake / direction reversal — capped, ~2 s from top speed
  } else if (throttle === 0) {
    rate = Math.min(baseRate * COAST_MULT, brakeCap * 0.5); // rolling friction
  } else if (Math.abs(vTarget) < Math.abs(state.speed) - 1e-9) {
    rate = baseRate; // over target (turn bleed / slope / overspeed): drag pulls back
  } else {
    // Driving: quadratic drag tapers the accel — fast initial surge, asymptotic
    // crawl to the transmission limit (§3): a = a_drive × (1 − C_DRAG·(v/v_max)²).
    const vRef = Math.max(throttle >= 0 ? topMps : revMps, 1e-6);
    const u = Math.min(Math.abs(state.speed) / vRef, 1);
    rate = baseRate * (1 - C_DRAG * u * u);
    // Steering diverts engine power to the tracks (§4): while turning hard the
    // drive can't refill what the turn bleeds, so serpentining costs momentum.
    if (trMax > 1e-6) {
      rate *= 1 - TURN_POWER_DIVERT * Math.min(Math.abs(state.yawRate) / trMax, 1);
    }
  }
  state.speed = approach(state.speed, vTarget, rate * dt);
  // Direct multiplicative turn bleed (movement doc §4): every hard turn costs
  // momentum at ANY speed — v *= 1 − k·|yawRate|/trMax·dt — not only near
  // v_max where the target-scaling above already bites.
  if (trMax > 1e-6 && state.yawRate !== 0) {
    state.speed *= 1 - TURN_DIRECT_BLEED * Math.min(Math.abs(state.yawRate) / trMax, 1) * dt;
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
  state.pos.y = heightField.getHeightAt(state.pos.x, state.pos.z);

  // ---- hull attitude spring: terrain target + inertial pitch (nose dip/lift) ----
  const dvdt = clamp((state.speed - state._prevSpeed) / dt, -DVDT_CLAMP, DVDT_CLAMP);
  const inertialPitch = clamp(K_INERTIA * dvdt, -INERTIA_CLAMP, INERTIA_CLAMP);
  const targetPitch = terrPitch + inertialPitch;
  const targetRoll = terrRoll;
  spr.pitchV += (SPRING_OMEGA * SPRING_OMEGA * (targetPitch - spr.pitch) -
                 2 * SPRING_ZETA * SPRING_OMEGA * spr.pitchV) * dt;
  spr.pitch += spr.pitchV * dt;
  spr.rollV += (SPRING_OMEGA * SPRING_OMEGA * (targetRoll - spr.roll) -
                2 * SPRING_ZETA * SPRING_OMEGA * spr.rollV) * dt;
  spr.roll += spr.rollV * dt;
  state.visualPitch = spr.pitch;
  state.visualRoll = spr.roll;
  state._prevSpeed = state.speed;

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
    state.atGunLimit = desiredGun < lo - 1e-4 || desiredGun > hi + 1e-4;
    state.gunPitch = clamp(
      approach(state.gunPitch, clamp(desiredGun, lo, hi), spec.gunPitchDegS * DEG2RAD * dt),
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
    : (spec.gun.aimTimeS * debuff.aimTimeMult) / LN3;
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
  // firing forward lifts the nose; firing over the right side rolls left-side-down.
  const ct = Math.cos(state.turretYaw), st = Math.sin(state.turretYaw);
  spr.pitchV += kick * ct;
  spr.rollV -= kick * st;
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
