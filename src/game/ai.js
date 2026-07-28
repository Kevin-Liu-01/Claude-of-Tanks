/**
 * ai.js — Enemy tank AI controller (pure logic, node-runnable).
 *
 * Implements ARCHITECTURE.md §3.6: waypoint navigation on the terrain heightfield,
 * line-of-sight target acquisition, hull-down / cover seeking, shell-travel-time
 * aim lead with gravity compensation, dispersion-gated firing, weak-spot probing,
 * flanking on repeated non-penetrations, and three difficulty tiers.
 *
 * The controller drives its tank exclusively through the shared TankInput
 * (`entity.input`) — the exact same interface the player uses. It reads enemy
 * state read-only and never touches the scene graph.
 *
 * Imports are restricted to three.js math classes and the pure-logic sim modules,
 * per §1.3. All randomness flows through the injected `rng`; all time arrives as
 * `dt` / `timeS` parameters.
 */

import { Vector3 } from 'three';
import { computeDispersionRadM } from '../sim/movement.js';
import { aimElevationRad } from '../sim/ballistics.js';
import { tankPoseFromState, queryAimArmor } from '../sim/armor.js';
import { estimatePenRatio } from '../sim/damage.js';

/**
 * Canonical deterministic PRNG (ARCHITECTURE.md §1.4, copied verbatim).
 * @param {number} a seed
 * @returns {() => number} generator of floats in [0,1)
 */
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const DEFAULT_SEED = 7001;

/**
 * Difficulty tiers (§3.6 locked values):
 *  - fireFactor: dispersion gate — fire when r(dist) < targetWidth/2 × fireFactor.
 *  - reactionS:  delay between first sighting a target and being allowed to fire.
 *  - aimErrMult: inflates effective sigma; extra aim-point error so the combined
 *                sigma equals baseSigma × aimErrMult (hard = 1.0 → no extra error).
 *  - probeLevel: index into PROBE_SETS (easy center-mass, hard weak-spot hunting).
 */
const DIFFICULTY_TIERS = {
  easy:   { fireFactor: 0.6, reactionS: 1.2, aimErrMult: 2.0, probeLevel: 0, engageRangeM: 260, holdRangeM: 180, coverIQ: 0.35 },
  normal: { fireFactor: 0.9, reactionS: 0.7, aimErrMult: 1.4, probeLevel: 1, engageRangeM: 330, holdRangeM: 240, coverIQ: 0.7  },
  hard:   { fireFactor: 1.2, reactionS: 0.3, aimErrMult: 1.0, probeLevel: 2, engageRangeM: 420, holdRangeM: 300, coverIQ: 1.0  },
};

/**
 * Aim-zone probe candidates as [heightFraction, lateralFraction] of the target's
 * height/width. Easy aims center mass; hard probes lower glacis, turret, and
 * side offsets via queryAimArmor and picks the best estimatePenRatio.
 */
const PROBE_SETS = [
  [[0.48, 0]],
  [[0.48, 0], [0.28, 0]],
  [[0.48, 0], [0.28, 0], [0.72, 0], [0.5, 0.28], [0.5, -0.28], [0.32, 0.28], [0.32, -0.28]],
];

const LOS_INTERVAL_S    = 0.14;   // target-acquisition / LOS cadence
const PROBE_INTERVAL_S  = 0.55;   // weak-spot + shell-slot probe cadence
const COVER_INTERVAL_S  = 6.0;    // hull-down re-search cadence
const OBSTACLE_REFRESH_S = 5.0;   // static AABB cache refresh
const TARGET_MEMORY_S   = 5.0;    // chase last-seen position this long after LOS loss
const FLANK_TIMEOUT_S   = 20.0;
const FLANK_ASPECT_RAD  = Math.PI / 3;  // 60° off target nose = flank achieved
const STUCK_TIME_S      = 2.0;
const UNSTICK_TIME_S    = 1.4;
const GUN_LIMIT_NUDGE_S = 1.5;    // gun pinned this long → back up for depression
const EYE_FRAC          = 0.85;   // eye/turret-top height as fraction of heightM
const ARRIVE_DIST_M     = 6.0;
const MAX_FIRE_RANGE_M  = 620;

// Module-scope scratch vectors (no per-frame allocation, §1.3).
const _vA = new Vector3();
const _vB = new Vector3();
const _vC = new Vector3();
const _vD = new Vector3();
const _vE = new Vector3();

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Standard-normal sample via Box–Muller from the injected rng. */
function gauss(rng) {
  let u = rng();
  while (u <= 1e-9) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
}

// ---------------------------------------------------------------------------
// Controller factory
// ---------------------------------------------------------------------------

/**
 * Create an AI controller for one enemy tank.
 *
 * @param {object} entity TankEntity (§2.4) — `{ id, spec, state, combat, input, ai }`.
 *   The controller writes `entity.input` (throttle/steer/brake/fire/aimPoint/shellSlot)
 *   and nothing else; it also claims `entity.ai` as its opaque state slot.
 * @param {object} opts
 * @param {'easy'|'normal'|'hard'} [opts.difficulty='normal'] behavior tier
 * @param {() => number} [opts.rng] deterministic PRNG in [0,1); defaults to mulberry32(7001)
 * @param {object} opts.deps injected world access:
 *   `{ heightField, raycast(origin,dir,maxDist), getEnemies(): TankEntity[], getObstacles(): AABB[],
 *      spotting?: { isSpotted(id): boolean } }`
 *   When `spotting` is provided, target ACQUISITION goes through the
 *   concealment sim (src/sim/spotting.js): tanks the AI's team has not
 *   spotted are invisible to it — exactly like the player's minimap/HUD.
 *   Raw raycast LOS is still required to actually FIRE.
 * @returns {{ update(dt:number, timeS:number): void,
 *             setWaypoints(points: Array<[number, number]>): void,
 *             notifyShellResult(hitEvent: object): void,
 *             state: string }} AIController (§3.6)
 */
export function createAI(entity, opts = {}) {
  if (!entity || !entity.spec || !entity.state) {
    throw new Error('createAI: entity must carry spec and state');
  }
  const deps = opts.deps;
  if (!deps || !deps.heightField || typeof deps.raycast !== 'function' ||
      typeof deps.getEnemies !== 'function' || typeof deps.getObstacles !== 'function') {
    throw new Error('createAI: opts.deps must provide heightField, raycast, getEnemies, getObstacles');
  }
  const tier = DIFFICULTY_TIERS[opts.difficulty ?? 'normal'];
  if (!tier) throw new Error(`createAI: unknown difficulty '${opts.difficulty}'`);
  const rng = typeof opts.rng === 'function' ? opts.rng : mulberry32(DEFAULT_SEED);
  const hf = deps.heightField;
  // SPOTTING WIRING: optional concealment gate (absent in headless fixtures)
  const spotting = deps.spotting && typeof deps.spotting.isSpotted === 'function'
    ? deps.spotting : null;
  const isVisibleToTeam = (e) => !spotting || spotting.isSpotted(e.id);

  // Ensure the shared input record exists (integration normally creates it).
  if (!entity.input) {
    entity.input = { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0 };
  } else if (!entity.input.aimPoint) {
    entity.input.aimPoint = new Vector3();
  }

  const spec = entity.spec;
  const selfEyeM = spec.dims.heightM * EYE_FRAC;
  // Gun trunnion height above ground contact — the movement sim aims the
  // barrel from here (movement.js gunPivotHeight), so the alignment gate must
  // measure the wanted pitch from the same origin, not from the eye point.
  const selfGunM = spec.armor && spec.armor.turretPivot && spec.armor.gunPivot
    ? spec.armor.turretPivot[1] + spec.armor.gunPivot[1]
    : spec.dims.heightM * 0.85;

  // ---- persistent controller state ----------------------------------------
  let mode = 'patrol';                       // 'patrol'|'engage'|'seekCover'|'flank'
  let target = null;                         // TankEntity or null
  let losClear = false;
  let acquiredAtS = -Infinity;               // when current target was first seen
  let lastSeenAtS = -Infinity;
  const lastSeen = { x: 0, z: 0 };

  const waypoints = [];                      // [{x,z}] patrol route
  let wpIndex = 0;
  let autoPatrolBuilt = false;

  const moveTarget = { x: 0, z: 0 };         // hull-down / approach point
  let hasMoveTarget = false;
  const coverPoint = { x: 0, z: 0 };
  let hasCoverPoint = false;
  let coverRollPassed = false;               // coverIQ roll for the current reload cycle
  let coverRolled = false;

  const flankPoints = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
  let flankIndex = 0;
  let flankUntilS = 0;
  let nonPenCount = 0;

  // Aim solution (updated by probes at PROBE_INTERVAL_S).
  let aimHFrac = 0.48;
  let aimLatFrac = 0;
  let chosenSlot = 0;
  let cachedPenRatio = 1;
  let penGateOk = true;

  // Persistent aim error (resampled periodically and after every shot result).
  let errYawRad = 0;
  let errPitchRad = 0;

  // Timers (count down with dt).
  let losTimer = rng() * LOS_INTERVAL_S;     // stagger AI work across ticks
  let probeTimer = rng() * PROBE_INTERVAL_S;
  let coverTimer = 0;
  let errTimer = 0;
  let obstacleTimer = 0;

  // Stuck / gun-limit recovery.
  let lowSpeedT = 0;
  let unstickUntilS = -1;
  let unstickSteer = 1;
  let gunLimitT = 0;
  let nudgeUntilS = -1;
  let arcLimitedT = 0;              // gun pinned at an elevation/depression stop

  const scanPhase = rng() * TAU;             // idle turret sweep phase
  let obstacles = deps.getObstacles();
  let nowS = 0;                              // last timeS seen by update()

  resampleAimError();

  // ---- helpers -------------------------------------------------------------

  function resampleAimError() {
    const m = tier.aimErrMult;
    const extra = Math.sqrt(Math.max(0, m * m - 1));
    // Fully-aimed sigma in radians: baseAccuracy is 2σ @ 100 m (§3.5.1 lock).
    const sigma = ((spec.gun.baseAccuracy / 2) / 100) * extra;
    errYawRad = gauss(rng) * sigma;
    errPitchRad = gauss(rng) * sigma;
    errTimer = 1.1 + rng() * 0.5;
  }

  function aliveEnemies() {
    const list = deps.getEnemies();
    return list; // filtered inline at use sites to avoid allocation
  }

  function enemyAlive(e) {
    return e && e !== entity && (!e.combat || !e.combat.destroyed);
  }

  /** Line of sight between two eye points via the world raycast. */
  function hasLos(ax, ay, az, bx, by, bz) {
    _vA.set(ax, ay, az);
    _vB.set(bx - ax, by - ay, bz - az);
    const dist = _vB.length();
    if (dist < 1e-3) return true;
    _vB.multiplyScalar(1 / dist);
    const hit = deps.raycast(_vA, _vB, dist);
    return !hit || hit.dist > dist - 2.0;
  }

  function eyeY(e) { return e.state.pos.y + e.spec.dims.heightM * EYE_FRAC; }

  function acquireTarget(timeS) {
    const st = entity.state;
    const list = aliveEnemies();
    const ex = st.pos.x, ey = st.pos.y + selfEyeM, ez = st.pos.z;

    // Keep the current target while it lives; refresh visibility through the
    // spotting sim (team intel keeps lastSeen fresh even without personal
    // LOS), but firing still demands a clear personal ray (losClear).
    if (target && enemyAlive(target)) {
      const tp = target.state.pos;
      const vis = isVisibleToTeam(target);
      losClear = vis && hasLos(ex, ey, ez, tp.x, eyeY(target), tp.z);
      if (vis) {
        lastSeen.x = tp.x; lastSeen.z = tp.z;
        lastSeenAtS = timeS;
      }
      if (timeS - lastSeenAtS <= TARGET_MEMORY_S) return;
      target = null; // memory expired — rescan below
    } else if (target) {
      target = null;
      losClear = false;
    }

    // Nearest SPOTTED enemy with personal LOS becomes the target — tanks the
    // team has not lit up are ghosts, exactly like the player's minimap.
    let best = null, bestD2 = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!enemyAlive(e)) continue;
      if (!isVisibleToTeam(e)) continue; // concealment gate (spotting sim)
      const tp = e.state.pos;
      const dx = tp.x - ex, dz = tp.z - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 >= bestD2) continue;
      if (!hasLos(ex, ey, ez, tp.x, eyeY(e), tp.z)) continue;
      best = e; bestD2 = d2;
    }
    if (best) {
      target = best;
      losClear = true;
      acquiredAtS = timeS;
      lastSeenAtS = timeS;
      lastSeen.x = best.state.pos.x;
      lastSeen.z = best.state.pos.z;
      nonPenCount = 0;
      probeTimer = 0; // probe the new target immediately
    } else {
      losClear = false;
    }
  }

  /**
   * Probe candidate aim zones on the current target with queryAimArmor +
   * estimatePenRatio; choose aim fractions and shell slot. Escalates from the
   * standard round to the special round, and to HE when nothing penetrates.
   */
  function runProbes() {
    if (!target) return;
    const armor = target.spec && target.spec.armor;
    if (!armor) { // headless fixtures without armor models: aim center, assume pen
      aimHFrac = 0.48; aimLatFrac = 0; chosenSlot = 0; cachedPenRatio = 1; penGateOk = true;
      return;
    }
    const st = entity.state;
    const tp = target.state.pos;
    const th = target.spec.dims.heightM;
    const tw = target.spec.dims.widthM;
    const ex = st.pos.x, ey = st.pos.y + selfEyeM, ez = st.pos.z;
    // Lateral basis: perpendicular to the line of sight, in the ground plane.
    let px = tp.z - ez, pz = -(tp.x - ex);
    const pl = Math.hypot(px, pz) || 1;
    px /= pl; pz /= pl;

    const pose = tankPoseFromState(target.state);
    const set = PROBE_SETS[tier.probeLevel];
    let bestScore = -Infinity, bestRatio = 0, bestH = 0.48, bestLat = 0, bestSlot = 0;

    for (let slot = 0; slot <= 1; slot++) {
      const shell = spec.gun.shells[slot];
      if (!shell) continue;
      for (let i = 0; i < set.length; i++) {
        const h = set[i][0], lat = set[i][1];
        const cx = tp.x + px * lat * tw;
        const cy = tp.y + h * th;
        const cz = tp.z + pz * lat * tw;
        _vA.set(ex, ey, ez);
        _vB.set(cx - ex, cy - ey, cz - ez);
        const dist = _vB.length();
        if (dist < 1e-3) continue;
        _vB.multiplyScalar(1 / dist);
        const info = queryAimArmor(_vA, _vB, dist + 10, pose, armor);
        if (!info) continue;
        const ratio = estimatePenRatio(shell, dist, info);
        // Prefer the standard round and comfortable margins; cap the reward so
        // the AI does not chase 3× overkill zones over center mass.
        const score = Math.min(ratio, 1.6) - slot * 0.08 - Math.abs(lat) * 0.02;
        if (score > bestScore) {
          bestScore = score; bestRatio = ratio; bestH = h; bestLat = lat; bestSlot = slot;
        }
      }
      if (bestRatio >= 1.05 && bestSlot === 0) break; // standard round already comfortable
    }

    if (bestRatio >= 0.9) {
      aimHFrac = bestH; aimLatFrac = bestLat; chosenSlot = bestSlot;
      cachedPenRatio = bestRatio; penGateOk = true;
    } else if (bestScore > -Infinity) {
      // Nothing penetrates reliably: lob HE at center mass (splash needs no pen gate).
      aimHFrac = 0.5; aimLatFrac = 0; chosenSlot = 2;
      cachedPenRatio = bestRatio; penGateOk = false;
    } else {
      // All probes missed the hull (extreme angles) — hold fire, keep center aim.
      aimHFrac = 0.48; aimLatFrac = 0; cachedPenRatio = 0; penGateOk = false;
    }
  }

  /**
   * Search the retreat ray (away from the target) for a crest position.
   * `full=false` → hull-down: hull covered, turret retains LOS.
   * `full=true`  → complete cover for reloading.
   * @returns {boolean} true if `out` was filled
   */
  function findCrest(out, full) {
    if (!target) return false;
    const st = entity.state;
    const tp = target.state.pos;
    let ax = st.pos.x - tp.x, az = st.pos.z - tp.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al; az /= al;
    const hSelf = spec.dims.heightM;
    for (let d = 3; d <= 27; d += 3) {
      const cx = st.pos.x + ax * d;
      const cz = st.pos.z + az * d;
      const hC = hf.getHeightAt(cx, cz);
      const h1 = hf.getHeightAt(cx - ax * 5, cz - az * 5);
      const h2 = hf.getHeightAt(cx - ax * 10, cz - az * 10);
      const crest = Math.max(h1, h2) - hC;
      if (full) {
        if (crest > hSelf * 0.9 + 0.3) { out.x = cx; out.z = cz; return true; }
      } else if (crest > hSelf * 0.45 && crest < hSelf * 0.95) {
        if (hasLos(cx, hC + selfEyeM, cz, tp.x, eyeY(target), tp.z)) {
          out.x = cx; out.z = cz; return true;
        }
      }
    }
    return false;
  }

  function startFlank(timeS) {
    if (!target) return;
    const st = entity.state;
    const tp = target.state.pos;
    const dx = st.pos.x - tp.x, dz = st.pos.z - tp.z;
    const dist = Math.hypot(dx, dz) || 1;
    const r = clamp(dist, 80, 200);
    const baseAng = Math.atan2(dx, dz);            // bearing target → self
    const side = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const a = baseAng + side * (0.6 + 0.6 * i);  // 34°, 69°, 103° around the target
      flankPoints[i].x = tp.x + Math.sin(a) * r;
      flankPoints[i].z = tp.z + Math.cos(a) * r;
    }
    flankIndex = 0;
    flankUntilS = timeS + FLANK_TIMEOUT_S;
    mode = 'flank';
  }

  /** Aspect angle between the target's nose and the bearing target→self. */
  function aspectAngle() {
    if (!target) return 0;
    const st = entity.state;
    const tp = target.state.pos;
    const bearing = Math.atan2(st.pos.x - tp.x, st.pos.z - tp.z);
    return Math.abs(wrapAngle(bearing - target.state.yaw));
  }

  // ---- driving -------------------------------------------------------------

  /** Steer toward the first blocking obstacle's clear side; damp throttle. */
  function avoidObstacles(input) {
    const st = entity.state;
    const look = 6 + Math.abs(st.speed) * 1.5;
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    const px = st.pos.x + fx * look;
    const pz = st.pos.z + fz * look;
    const margin = spec.dims.widthM * 0.5 + 1.2;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (px < o.min[0] - margin || px > o.max[0] + margin) continue;
      if (pz < o.min[2] - margin || pz > o.max[2] + margin) continue;
      const cx = (o.min[0] + o.max[0]) * 0.5 - st.pos.x;
      const cz = (o.min[2] + o.max[2]) * 0.5 - st.pos.z;
      const crossY = fz * cx - fx * cz;          // >0 → obstacle to the right
      input.steer = clamp(input.steer - Math.sign(crossY || 1) * 1.0, -1, 1);
      input.throttle *= 0.6;
      return;
    }
  }

  /**
   * Drive toward (x,z). Returns true when within ARRIVE_DIST_M.
   * Steering = signed angle to the point; throttle eases off in tight turns.
   */
  function driveToXZ(input, x, z, speedScale) {
    const st = entity.state;
    const dx = x - st.pos.x, dz = z - st.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE_DIST_M) {
      input.throttle = 0;
      input.steer = 0;
      input.brake = Math.abs(st.speed) > 0.5;
      return true;
    }
    const bearing = Math.atan2(dx, dz);
    const err = wrapAngle(bearing - st.yaw);
    input.steer = clamp(err * 2.2, -1, 1);
    if (Math.abs(err) > 1.2) {
      input.throttle = 0.15;                     // near-pivot turn
    } else {
      input.throttle = clamp(1 - Math.abs(err) * 0.55, 0.25, 1) * speedScale;
    }
    input.throttle *= clamp(dist / 10, 0.35, 1); // ease into arrivals
    input.brake = false;
    avoidObstacles(input);
    return false;
  }

  /** Pivot in place to face a world yaw. */
  function faceYaw(input, wantYaw) {
    const st = entity.state;
    const err = wrapAngle(wantYaw - st.yaw);
    input.steer = Math.abs(err) > 0.06 ? clamp(err * 2.5, -1, 1) : 0;
    input.throttle = 0;
    input.brake = Math.abs(st.speed) > 0.5;
  }

  function buildAutoPatrol() {
    const st = entity.state;
    const r = 45 + rng() * 40;
    const a0 = rng() * TAU;
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i / 4) * TAU + (rng() - 0.5) * 0.5;
      waypoints.push({
        x: clamp(st.pos.x + Math.sin(a) * r, -500, 500),
        z: clamp(st.pos.z + Math.cos(a) * r, -500, 500),
      });
    }
    wpIndex = 0;
    autoPatrolBuilt = true;
  }

  function drivePatrol(input) {
    if (waypoints.length === 0) {
      if (!autoPatrolBuilt) buildAutoPatrol();
      if (waypoints.length === 0) { input.throttle = 0; input.steer = 0; return; }
    }
    const wp = waypoints[wpIndex];
    if (driveToXZ(input, wp.x, wp.z, 0.85)) {
      wpIndex = (wpIndex + 1) % waypoints.length;
    }
  }

  function driveEngage(input, timeS, distToTarget) {
    const st = entity.state;
    if (!target) {
      // Chase the last known position, then fall back to patrol.
      if (timeS - lastSeenAtS < TARGET_MEMORY_S + 6 &&
          !driveToXZ(input, lastSeen.x, lastSeen.z, 0.9)) return;
      mode = 'patrol';
      drivePatrol(input);
      return;
    }
    const tp = target.state.pos;

    // Gun pinned at a limit while trying to shoot → back away from the crest.
    if (timeS < nudgeUntilS) {
      input.throttle = -0.6;
      input.steer = 0;
      input.brake = false;
      return;
    }

    if (!losClear) {
      driveToXZ(input, lastSeen.x, lastSeen.z, 0.9);
      return;
    }
    if (distToTarget > tier.engageRangeM) {
      driveToXZ(input, tp.x, tp.z, 1.0);
      return;
    }
    if (hasMoveTarget) {                          // roll into the hull-down spot
      if (driveToXZ(input, moveTarget.x, moveTarget.z, 0.6)) hasMoveTarget = false;
      return;
    }
    if (distToTarget > tier.holdRangeM) {         // creep closer while shooting
      driveToXZ(input, tp.x, tp.z, 0.45);
      return;
    }
    // Hold: face the target hull-on and shoot.
    faceYaw(input, Math.atan2(tp.x - st.pos.x, tp.z - st.pos.z));
  }

  // ---- aiming & firing -----------------------------------------------------

  function aimAndFire(input, dt, timeS) {
    const st = entity.state;
    const cb = entity.combat;

    if (!target || !enemyAlive(target)) {
      // Idle scan: sweep the turret slowly across the heading.
      const scanYaw = st.yaw + Math.sin(timeS * 0.3 + scanPhase) * 0.9;
      const sx = st.pos.x + Math.sin(scanYaw) * 160;
      const sz = st.pos.z + Math.cos(scanYaw) * 160;
      input.aimPoint.set(sx, hf.getHeightAt(sx, sz) + selfEyeM, sz);
      input.fire = false;
      return;
    }

    const tp = target.state.pos;
    const th = target.spec.dims.heightM;
    const tw = target.spec.dims.widthM;
    const ex = st.pos.x, ey = st.pos.y + selfEyeM, ez = st.pos.z;

    // Lateral basis for the aim-zone offset (perpendicular to LOS, ground plane).
    let px = tp.z - ez, pz = -(tp.x - ex);
    const pl = Math.hypot(px, pz) || 1;
    px /= pl; pz /= pl;

    // Base aim point on the chosen zone.
    _vC.set(tp.x + px * aimLatFrac * tw, tp.y + aimHFrac * th, tp.z + pz * aimLatFrac * tw);

    // Travel-time lead, iterated twice (§3.6).
    const shell = spec.gun.shells[clamp(chosenSlot, 0, spec.gun.shells.length - 1)];
    const tvx = Math.sin(target.state.yaw) * target.state.speed;
    const tvz = Math.cos(target.state.yaw) * target.state.speed;
    _vD.copy(_vC);
    let dist = 0;
    for (let i = 0; i < 2; i++) {
      _vE.set(_vD.x - ex, _vD.y - ey, _vD.z - ez);
      dist = _vE.length();
      const t = dist / shell.velocityMps;
      _vD.set(_vC.x + tvx * t, _vC.y, _vC.z + tvz * t);
    }

    // Gravity compensation: raise the aim point by the ballistic elevation.
    const elev = aimElevationRad(dist, shell.velocityMps);
    _vD.y += Math.tan(elev) * dist;

    // Difficulty aim error (persistent, resampled periodically).
    _vD.x += px * errYawRad * dist;
    _vD.z += pz * errYawRad * dist;
    _vD.y += errPitchRad * dist;

    input.aimPoint.copy(_vD);
    input.shellSlot = /** @type {0|1|2} */ (clamp(chosenSlot, 0, 2));

    // ---- fire gates ----
    const reactionOk = timeS - acquiredAtS >= tier.reactionS;
    const reloadReady = !cb || (cb.reload && cb.reload.t <= 1e-3 && !cb.destroyed);
    const rangeOk = dist <= MAX_FIRE_RANGE_M;

    // Dispersion gate: reticle smaller than half the target width × difficulty factor.
    const dispersionOk =
      computeDispersionRadM(spec, st, dist) < (tw / 2) * tier.fireFactor;

    // Alignment gate: the gun itself (not just the aim point) is on target.
    // The wanted pitch is measured from the TRUNNION (movement.js drives the
    // barrel from pos.y + gunPivotHeight), and the barrel's world pitch uses
    // the same YXZ pose composition as the movement sim:
    //   worldPitch ≈ gunPitch + visualPitch·cos(turretYaw) + visualRoll·sin(turretYaw).
    // The old `gunPitch + visualPitch` ignored turret azimuth and roll, and a
    // hard `!atGunLimit` veto froze the AI whenever the clamped barrel was
    // pinned even marginally — on slopes the settled gun could sit exactly ON
    // target with atGunLimit=true, so an uphill Tiger never fired (r6).
    const gy = st.pos.y + selfGunM;
    const dxA = input.aimPoint.x - ex, dyA = input.aimPoint.y - gy, dzA = input.aimPoint.z - ez;
    const horiz = Math.hypot(dxA, dzA) || 1e-6;
    const wantYaw = Math.atan2(dxA, dzA);
    const wantPitch = Math.atan2(dyA, horiz);
    const gunYaw = st.yaw + st.turretYaw;
    const gunPitch = st.gunPitch +
      (st.visualPitch || 0) * Math.cos(st.turretYaw) +
      (st.visualRoll || 0) * Math.sin(st.turretYaw);
    const yawErr = Math.abs(wrapAngle(wantYaw - gunYaw));
    const pitchErr = Math.abs(wantPitch - gunPitch);
    const tol = Math.max(0.01, Math.atan2(tw * 0.3, dist));
    // Arc-limit fallback: when the barrel is pinned at a pitch stop and still
    // off the solution, repositioning (the reverse nudge) runs in parallel —
    // but after a few seconds the AI takes the best shot its gun arc allows
    // instead of holding fire forever (bounded: within ~4x tolerance).
    const gunReady = losClear && reactionOk && reloadReady && rangeOk;
    if (st.atGunLimit && gunReady && pitchErr >= tol * 1.5) arcLimitedT += dt;
    else if (!st.atGunLimit || pitchErr < tol * 1.5) arcLimitedT = 0;
    const pitchTol = arcLimitedT > 2.5 ? Math.min(0.06, tol * 4) : tol * 1.5;
    const alignOk = yawErr < tol && pitchErr < pitchTol;

    input.fire = gunReady && dispersionOk && alignOk && (penGateOk || chosenSlot === 2);
  }

  // ---- state machine -------------------------------------------------------

  function stepStateMachine(dt, timeS, distToTarget) {
    const cb = entity.combat;

    switch (mode) {
      case 'patrol':
        if (target && losClear) {
          mode = 'engage';
          hasMoveTarget = false;
          coverTimer = 0;
        }
        break;

      case 'engage': {
        if (!target && timeS - lastSeenAtS > TARGET_MEMORY_S + 6) {
          mode = 'patrol';
          break;
        }
        // Hull-down search on a slow cadence (coverIQ gates how often it happens).
        if (target && losClear && coverTimer <= 0) {
          coverTimer = COVER_INTERVAL_S;
          if (rng() < tier.coverIQ && findCrest(moveTarget, false)) hasMoveTarget = true;
        }
        // Long reload + low commitment → duck into full cover.
        if (target && cb && cb.reload && cb.reload.t > 2.0) {
          if (!coverRolled) { coverRolled = true; coverRollPassed = rng() < tier.coverIQ; }
          if (coverRollPassed && findCrest(coverPoint, true)) {
            hasCoverPoint = true;
            mode = 'seekCover';
          }
        } else if (cb && cb.reload && cb.reload.t <= 1e-3) {
          coverRolled = false;
        }
        break;
      }

      case 'seekCover': {
        const reloading = cb && cb.reload && cb.reload.t > 0.6;
        if (!reloading || !hasCoverPoint) {
          mode = 'engage';
          hasMoveTarget = false;
          hasCoverPoint = false;
          coverRolled = false;
        }
        break;
      }

      case 'flank': {
        if (!target || !enemyAlive(target)) {
          mode = target ? 'engage' : 'patrol';
          nonPenCount = 0;
          break;
        }
        if (timeS > flankUntilS || aspectAngle() > FLANK_ASPECT_RAD || flankIndex >= 3) {
          mode = 'engage';
          nonPenCount = 0;
          hasMoveTarget = false;
          probeTimer = 0;
        }
        break;
      }
    }

    // Gun pinned at a limit while wanting to shoot → schedule a reverse nudge.
    const st = entity.state;
    if (mode === 'engage' && target && losClear && st.atGunLimit) {
      gunLimitT += dt;
      if (gunLimitT > GUN_LIMIT_NUDGE_S && timeS >= nudgeUntilS) {
        nudgeUntilS = timeS + 1.2;
        gunLimitT = 0;
      }
    } else {
      gunLimitT = 0;
    }
    void distToTarget;
  }

  // ---- main update ----------------------------------------------------------

  function update(dt, timeS) {
    nowS = timeS;
    const input = entity.input;
    const st = entity.state;
    const cb = entity.combat;

    if (cb && cb.destroyed) {
      input.throttle = 0; input.steer = 0; input.brake = false; input.fire = false;
      return;
    }

    losTimer -= dt; probeTimer -= dt; coverTimer -= dt; errTimer -= dt; obstacleTimer -= dt;

    if (obstacleTimer <= 0) {
      obstacles = deps.getObstacles();
      obstacleTimer = OBSTACLE_REFRESH_S;
    }
    if (losTimer <= 0) {
      acquireTarget(timeS);
      losTimer = LOS_INTERVAL_S * (0.8 + rng() * 0.4);
    }
    if (probeTimer <= 0 && target) {
      runProbes();
      probeTimer = PROBE_INTERVAL_S * (0.8 + rng() * 0.4);
    }
    if (errTimer <= 0) resampleAimError();

    let distToTarget = Infinity;
    if (target) {
      const tp = target.state.pos;
      distToTarget = Math.hypot(tp.x - st.pos.x, tp.z - st.pos.z);
    }

    stepStateMachine(dt, timeS, distToTarget);

    // ---- movement by mode ----
    input.brake = false;
    switch (mode) {
      case 'patrol':    drivePatrol(input); break;
      case 'engage':    driveEngage(input, timeS, distToTarget); break;
      case 'seekCover':
        if (driveToXZ(input, coverPoint.x, coverPoint.z, 0.9)) { /* wait out the reload */ }
        break;
      case 'flank': {
        const fp = flankPoints[Math.min(flankIndex, 2)];
        if (driveToXZ(input, fp.x, fp.z, 1.0)) flankIndex++;
        break;
      }
    }

    // ---- stuck detection & recovery ----
    if (timeS < unstickUntilS) {
      input.throttle = -0.7;
      input.steer = unstickSteer;
      input.brake = false;
      lowSpeedT = 0;
    } else if (Math.abs(input.throttle) > 0.25 && Math.abs(st.speed) < 0.3) {
      lowSpeedT += dt;
      if (lowSpeedT > STUCK_TIME_S) {
        unstickUntilS = timeS + UNSTICK_TIME_S;
        unstickSteer = rng() < 0.5 ? -1 : 1;
        lowSpeedT = 0;
      }
    } else {
      lowSpeedT = 0;
    }

    aimAndFire(input, dt, timeS);
    controller.state = mode;
  }

  /**
   * Replace the patrol route.
   * @param {Array<[number, number]>} points [x,z] pairs in world meters
   */
  function setWaypoints(points) {
    waypoints.length = 0;
    for (let i = 0; i < points.length; i++) {
      waypoints.push({ x: points[i][0], z: points[i][1] });
    }
    wpIndex = 0;
    autoPatrolBuilt = true; // user route supersedes the auto loop
  }

  /**
   * Feedback for shells this tank fired (integration calls this per §3.6 lock).
   * Two consecutive non-penetrating results on the current target trigger a flank;
   * every result also resamples the aim error and forces a fresh weak-spot probe.
   * @param {object} hitEvent HitEvent (§2.6)
   */
  function notifyShellResult(hitEvent) {
    if (!hitEvent) return;
    if (target && hitEvent.targetId === target.id) {
      const k = hitEvent.kind;
      if (k === 'nonpen' || k === 'ricochet' || k === 'spaced_absorb' || k === 'era') {
        nonPenCount++;
        probeTimer = 0; // re-evaluate aim zone / shell slot immediately
        if (nonPenCount >= 2 && mode !== 'flank') startFlank(nowS);
      } else if (k === 'pen' || k === 'he_pen') {
        nonPenCount = 0;
      }
    }
    resampleAimError();
  }

  const controller = {
    update,
    setWaypoints,
    notifyShellResult,
    state: mode,
  };
  entity.ai = controller;
  return controller;
}
