/**
 * spotting.js — WoT-style concealment & spotting simulation (pure logic,
 * node-runnable; selftest: src/sim/spotting.selftest.mjs).
 *
 * Model (locked by the camo/spotting charter):
 *  - Per-tank base camo (stationary / moving), plausible per class per
 *    docs/research/tank-roster.md (heavies are billboards, mediums sneak,
 *    modern MBTs sit between; smaller silhouettes rate higher).
 *  - Firing bloom: a shot costs most of the tank's OWN camo, decaying
 *    exponentially back over a few seconds.
 *  - Bush/foliage concealment: vegetation discs intersecting the 2D line
 *    spotter→target add camo (capped). The 15 m proximity rule: while a
 *    tank's fire bloom is hot, foliage within 15 m of it turns transparent
 *    (muzzle flash lights it up) — bushes further back keep concealing.
 *  - Per-tank view range; camo paint pattern adds a flat bonus (+3–4%).
 *  - spotRange = viewRange − (viewRange − 50) × targetCamo, clamped to
 *    [50 m, MAX_SPOT_RANGE_M].
 *  - Periodic checks (0.5–2 s by proximity, staggered per target — never
 *    per-frame) with a 5 s spotted linger after the last successful check.
 *
 * No three.js imports: positions/directions are duck-typed {x,y,z} and the
 * injected `raycast(origin, dir, maxDist)` only ever READS those fields.
 */

// ---------------------------------------------------------------------------
// Tuning tables
// ---------------------------------------------------------------------------

export const MAX_SPOT_RANGE_M = 445;   // matches the HUD minimap spot circle
export const MIN_SPOT_RANGE_M = 50;    // WoT proximity spotting floor
export const SPOT_LINGER_S = 5;        // spotted state persists after last pass
export const BUSH_FIRE_TRANSPARENT_M = 15; // 15 m rule radius
export const CAMO_PAINT_BONUS = 0.035; // equipped camo pattern (+3.5%)
export const MAX_BUSH_BONUS = 0.6;     // stacked-foliage cap
export const FIRE_CAMO_LOSS = 0.82;    // own-camo fraction lost at full bloom
export const FIRE_BLOOM_TAU_S = 1.7;   // bloom e-folding time
const FIRE_BLOOM_EPS = 0.03;           // below this the shot is "cold"
const MOVING_SPEED_MPS = 0.4;
const CHECK_NEAR_S = 0.5;              // spotting-check cadence by proximity
const CHECK_MID_S = 1.0;
const CHECK_FAR_S = 2.0;
const LOS_TOLERANCE_M = 2.0;           // raycast slack when the hit is the target

/** Per-tank view range in meters (modern optics/thermals out-spot WW2 glass). */
export const VIEW_RANGE_M = {
  m4a3e8: 370, tiger1: 370, t34_85: 360, is2: 350, panther_g: 380,
  m1a2: 445, t90m: 430, leo2a7: 445,
};

/** Per-tank base camo { still, moving } in [0,1]. */
export const BASE_CAMO = {
  m4a3e8:    { still: 0.24, moving: 0.18 },
  tiger1:    { still: 0.11, moving: 0.07 },
  t34_85:    { still: 0.26, moving: 0.20 },
  is2:       { still: 0.12, moving: 0.08 },
  panther_g: { still: 0.20, moving: 0.15 },
  m1a2:      { still: 0.17, moving: 0.12 },
  t90m:      { still: 0.21, moving: 0.16 },
  leo2a7:    { still: 0.18, moving: 0.13 },
};

/** Class fallbacks for specs not in the tables (test fixtures, future tanks). */
export const CLASS_CAMO = {
  light:  { still: 0.34, moving: 0.34 },
  medium: { still: 0.23, moving: 0.17 },
  heavy:  { still: 0.12, moving: 0.08 },
  mbt:    { still: 0.18, moving: 0.13 },
  td:     { still: 0.30, moving: 0.18 },
  spg:    { still: 0.08, moving: 0.05 },
};
const CLASS_VIEW_M = { light: 390, medium: 370, heavy: 360, mbt: 440, td: 370, spg: 340 };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

/**
 * View range for a spec (table → class fallback → medium default).
 * @param {object} spec TankSpec-like ({ id, class })
 * @returns {number} meters
 */
export function viewRangeOf(spec) {
  if (spec && VIEW_RANGE_M[spec.id] != null) return VIEW_RANGE_M[spec.id];
  return (spec && CLASS_VIEW_M[spec.class]) || 370;
}

/**
 * Base camo for a spec.
 * @param {object} spec TankSpec-like
 * @param {boolean} moving hull is moving
 * @returns {number} camo in [0,1]
 */
export function baseCamoOf(spec, moving) {
  const row = (spec && (BASE_CAMO[spec.id] || CLASS_CAMO[spec.class])) || CLASS_CAMO.medium;
  return moving ? row.moving : row.still;
}

/**
 * Firing bloom at `timeS` for a shot fired at `firedAtS` (1 → just fired).
 * @returns {number} bloom in [0,1]
 */
export function fireBloomAt(firedAtS, timeS) {
  const age = timeS - firedAtS;
  if (age < 0) return 0;
  const b = Math.exp(-age / FIRE_BLOOM_TAU_S);
  return b < FIRE_BLOOM_EPS ? 0 : b;
}

/**
 * The spotting formula (locked): spotRange = vr − (vr − 50) × camo,
 * clamped to [MIN_SPOT_RANGE_M, MAX_SPOT_RANGE_M].
 * @param {number} viewRangeM spotter view range
 * @param {number} targetCamo total target camo [0,1]
 * @returns {number} meters
 */
export function spotRangeM(viewRangeM, targetCamo) {
  const c = clamp(targetCamo, 0, 1);
  const r = viewRangeM - (viewRangeM - MIN_SPOT_RANGE_M) * c;
  return clamp(r, MIN_SPOT_RANGE_M, MAX_SPOT_RANGE_M);
}

/**
 * Total camo of a target from its parts.
 * Own camo (base + paint) is scaled down by fire bloom; bush bonus rides on
 * top (the 15 m transparency rule is applied when the bonus is computed).
 * @param {{base:number, paint?:number, bloom?:number, bush?:number}} p
 * @returns {number} camo in [0, 0.95]
 */
export function combineCamo(p) {
  const own = (p.base + (p.paint || 0)) * (1 - FIRE_CAMO_LOSS * (p.bloom || 0));
  return clamp(own + (p.bush || 0), 0, 0.95);
}

/** Check cadence by spotter→target distance (0.5–2 s, per the charter). */
export function checkIntervalS(distM) {
  return distM < 120 ? CHECK_NEAR_S : distM < 280 ? CHECK_MID_S : CHECK_FAR_S;
}

/**
 * Foliage camo bonus along the 2D segment (sx,sz)→(tx,tz).
 * Each concealer disc {x,z,r,add} that the segment crosses contributes `add`;
 * the sum is capped at MAX_BUSH_BONUS. When `targetFired` is true, discs
 * within BUSH_FIRE_TRANSPARENT_M of the TARGET are skipped (15 m rule).
 * @param {Array<{x:number,z:number,r:number,add:number}>} concealers
 * @returns {number} bonus in [0, MAX_BUSH_BONUS]
 */
export function bushBonusBetween(concealers, sx, sz, tx, tz, targetFired) {
  if (!concealers || concealers.length === 0) return 0;
  const dx = tx - sx, dz = tz - sz;
  const len2 = dx * dx + dz * dz;
  let bonus = 0;
  for (let i = 0; i < concealers.length; i++) {
    const c = concealers[i];
    // cheap reject: outside the segment's bounding box grown by r
    const r = c.r;
    if (c.x < Math.min(sx, tx) - r || c.x > Math.max(sx, tx) + r) continue;
    if (c.z < Math.min(sz, tz) - r || c.z > Math.max(sz, tz) + r) continue;
    // point-segment distance in 2D
    let t = len2 > 1e-9 ? ((c.x - sx) * dx + (c.z - sz) * dz) / len2 : 0;
    t = clamp(t, 0, 1);
    const px = sx + dx * t, pz = sz + dz * t;
    const ddx = c.x - px, ddz = c.z - pz;
    if (ddx * ddx + ddz * ddz > r * r) continue;
    if (targetFired) {
      const fx = c.x - tx, fz = c.z - tz;
      if (Math.hypot(fx, fz) - r < BUSH_FIRE_TRANSPARENT_M) continue; // lit up
    }
    bonus += c.add;
    if (bonus >= MAX_BUSH_BONUS) return MAX_BUSH_BONUS;
  }
  return bonus;
}

// ---------------------------------------------------------------------------
// Spotting system
// ---------------------------------------------------------------------------

const TEAMS = ['player', 'enemy'];

/**
 * Create the battle spotting system.
 *
 * @param {object} deps
 * @param {() => Array<object>} deps.getTanks TankEntity[] — needs
 *   { id, team, spec: {id,class,dims:{heightM}}, state: {pos:{x,y,z}, speed},
 *     combat: {destroyed} } (duck-typed; extra fields ignored)
 * @param {(origin:{x,y,z}, dir:{x,y,z}, maxDist:number) => ?{dist:number}} [deps.raycast]
 *   hard-cover LOS test (terrain + props). Omit/null = always clear.
 * @param {Array<{x:number,z:number,r:number,add:number}>} [deps.concealers]
 *   vegetation concealment discs (world.getConcealment()).
 * @param {(ent:object) => number} [deps.getCamoBonus] equipped-pattern bonus.
 * @param {() => number} [deps.rng] deterministic PRNG for check staggering.
 * @returns {object} SpottingSystem
 */
export function createSpottingSystem(deps) {
  if (!deps || typeof deps.getTanks !== 'function') {
    throw new Error('createSpottingSystem: deps.getTanks is required');
  }
  const raycast = typeof deps.raycast === 'function' ? deps.raycast : null;
  const concealers = deps.concealers || [];
  const getCamoBonus = typeof deps.getCamoBonus === 'function' ? deps.getCamoBonus : () => 0;
  const rng = typeof deps.rng === 'function' ? deps.rng : Math.random;

  /** per-tank record: fire bloom + per-observing-team spotted state */
  const recs = new Map(); // id -> rec
  let raycastCalls = 0;   // instrumentation (selftest asserts staggering)
  const events = [];      // reused churn buffer returned by update()

  const _o = { x: 0, y: 0, z: 0 };
  const _d = { x: 0, y: 0, z: 0 };

  function recOf(ent) {
    let r = recs.get(ent.id);
    if (!r) {
      r = {
        firedAtS: -1e9,
        nextCheckS: rng() * CHECK_NEAR_S, // stagger initial checks
        byTeam: {
          player: { spotted: false, lastPassS: -1e9 },
          enemy: { spotted: false, lastPassS: -1e9 },
        },
      };
      recs.set(ent.id, r);
    }
    return r;
  }

  function alive(e) {
    return e && e.state && (!e.combat || !e.combat.destroyed);
  }

  function eyeY(e) { return e.state.pos.y + (e.spec.dims ? e.spec.dims.heightM : 2.6) * 0.9; }

  /** Hard-cover LOS: clear to either the turret top or the hull center. */
  function hardLos(spotter, target) {
    if (!raycast) return true;
    const sp = spotter.state.pos, tp = target.state.pos;
    const h = target.spec.dims ? target.spec.dims.heightM : 2.6;
    const sy = eyeY(spotter);
    for (const frac of [0.85, 0.45]) {
      _o.x = sp.x; _o.y = sy; _o.z = sp.z;
      const dx = tp.x - sp.x, dy = tp.y + h * frac - sy, dz = tp.z - sp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1e-3) return true;
      _d.x = dx / dist; _d.y = dy / dist; _d.z = dz / dist;
      raycastCalls++;
      const hit = raycast(_o, _d, dist);
      if (!hit || hit.dist > dist - LOS_TOLERANCE_M) return true;
    }
    return false;
  }

  /** Full spot test: does `spotter` see `target` right now? */
  function canSpot(spotter, target, timeS) {
    const sp = spotter.state.pos, tp = target.state.pos;
    const dx = tp.x - sp.x, dy = tp.y - sp.y, dz = tp.z - sp.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist <= MIN_SPOT_RANGE_M) return hardLos(spotter, target); // proximity
    if (dist > MAX_SPOT_RANGE_M) return false;
    const rec = recOf(target);
    const bloom = fireBloomAt(rec.firedAtS, timeS);
    const moving = Math.abs(target.state.speed || 0) > MOVING_SPEED_MPS;
    const bush = bushBonusBetween(concealers, sp.x, sp.z, tp.x, tp.z, bloom > 0);
    const camo = combineCamo({
      base: baseCamoOf(target.spec, moving),
      paint: getCamoBonus(target),
      bloom,
      bush,
    });
    if (dist > spotRangeM(viewRangeOf(spotter.spec), camo)) return false;
    return hardLos(spotter, target);
  }

  /** Run the spot checks for one target against every live opposing tank. */
  function checkTarget(target, tanks, timeS) {
    const rec = recOf(target);
    let nearest = Infinity;
    const seenBy = { player: false, enemy: false };
    for (let i = 0; i < tanks.length; i++) {
      const sp = tanks[i];
      if (sp === target || !alive(sp) || sp.team === target.team) continue;
      const d = Math.hypot(sp.state.pos.x - target.state.pos.x,
        sp.state.pos.z - target.state.pos.z);
      if (d < nearest) nearest = d;
      if (!seenBy[sp.team] && canSpot(sp, target, timeS)) seenBy[sp.team] = true;
    }
    for (const team of TEAMS) {
      if (team === target.team) continue;
      const st = rec.byTeam[team];
      if (seenBy[team]) {
        if (!st.spotted) events.push({ id: target.id, team, timeS });
        st.spotted = true;
        st.lastPassS = timeS;
      } else if (st.spotted && timeS - st.lastPassS > SPOT_LINGER_S) {
        st.spotted = false;
      }
    }
    rec.nextCheckS = timeS + checkIntervalS(isFinite(nearest) ? nearest : 1e9);
  }

  // reused result object for getConcealment (no per-frame allocation)
  const _conc = {
    camo: 0, base: 0, paint: 0, bush: 0, bloom: 0,
    moving: false, fired: false, inBush: false, spotted: false,
  };

  const sys = {
    /**
     * Advance the system. Cheap unless a target's check timer fires.
     * @param {number} dt seconds (unused directly; kept for symmetry)
     * @param {number} timeS sim clock
     * @returns {Array<{id:string,team:string,timeS:number}>} newly-spotted
     *   events (buffer reused across calls — consume synchronously)
     */
    update(dt, timeS) {
      events.length = 0;
      const tanks = deps.getTanks();
      for (let i = 0; i < tanks.length; i++) {
        const t = tanks[i];
        if (!alive(t)) continue;
        const rec = recOf(t);
        if (timeS >= rec.nextCheckS) checkTarget(t, tanks, timeS);
      }
      return events;
    },

    /** Force an immediate check of every live tank (tests/debug). */
    forceCheck(timeS) {
      events.length = 0;
      const tanks = deps.getTanks();
      for (const t of tanks) {
        if (alive(t)) checkTarget(t, tanks, timeS);
      }
      return events;
    },

    /**
     * Is tank `id` currently spotted by `team` (linger included)?
     * @param {string} id target tank id
     * @param {'player'|'enemy'} team observing team
     */
    isSpotted(id, team) {
      const r = recs.get(id);
      return r ? !!(r.byTeam[team] && r.byTeam[team].spotted) : false;
    },

    /** Register a shot for the fire-bloom penalty + 15 m rule. */
    notifyFired(id, timeS) {
      const r = recs.get(id);
      if (r) r.firedAtS = timeS;
      else recs.set(id, { ...freshRec(), firedAtS: timeS });
      function freshRec() {
        return {
          firedAtS: -1e9, nextCheckS: 0,
          byTeam: {
            player: { spotted: false, lastPassS: -1e9 },
            enemy: { spotted: false, lastPassS: -1e9 },
          },
        };
      }
    },

    /**
     * Live concealment snapshot for one tank (HUD camo/eye indicator).
     * Returns a REUSED object — copy if you must keep it.
     */
    getConcealment(ent, timeS) {
      const rec = recOf(ent);
      const p = ent.state.pos;
      const moving = Math.abs(ent.state.speed || 0) > MOVING_SPEED_MPS;
      const bloom = fireBloomAt(rec.firedAtS, timeS);
      // "in bush": concealers overlapping the hull position (any direction)
      let bush = 0;
      for (let i = 0; i < concealers.length; i++) {
        const c = concealers[i];
        const dx = c.x - p.x, dz = c.z - p.z;
        if (dx * dx + dz * dz > (c.r + 1.2) * (c.r + 1.2)) continue;
        if (bloom > 0) continue; // 15 m rule: own bush is lit while hot
        bush += c.add;
        if (bush >= MAX_BUSH_BONUS) { bush = MAX_BUSH_BONUS; break; }
      }
      _conc.base = baseCamoOf(ent.spec, moving);
      _conc.paint = getCamoBonus(ent);
      _conc.bloom = bloom;
      _conc.bush = bush;
      _conc.moving = moving;
      _conc.fired = bloom > 0;
      _conc.inBush = bush > 0 || (bloom > 0 && bushNearby(p));
      _conc.camo = combineCamo({ base: _conc.base, paint: _conc.paint, bloom, bush });
      const opp = ent.team === 'player' ? 'enemy' : 'player';
      _conc.spotted = sys.isSpotted(ent.id, opp);
      return _conc;
    },

    /** Bush bonus along the observer→target LOS (debug/tests). */
    bushBonusBetween(spotter, target, timeS) {
      const rec = recOf(target);
      return bushBonusBetween(concealers,
        spotter.state.pos.x, spotter.state.pos.z,
        target.state.pos.x, target.state.pos.z,
        fireBloomAt(rec.firedAtS, timeS) > 0);
    },

    /** One-shot spot test bypassing timers/linger (debug/tests). */
    testSpot(spotter, target, timeS) { return canSpot(spotter, target, timeS); },

    /** Raycast-call counter (selftest asserts checks are staggered). */
    get raycastCalls() { return raycastCalls; },

    reset() { recs.clear(); },
  };

  function bushNearby(p) {
    for (let i = 0; i < concealers.length; i++) {
      const c = concealers[i];
      const dx = c.x - p.x, dz = c.z - p.z;
      if (dx * dx + dz * dz <= (c.r + 1.2) * (c.r + 1.2)) return true;
    }
    return false;
  }

  return sys;
}
