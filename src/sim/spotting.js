/**
 * spotting.js — WoT-style concealment & spotting simulation (pure logic,
 * node-runnable; selftest: src/sim/spotting.selftest.mjs).
 *
 * Model (locked by the camo/spotting charter):
 *  - Per-tank base camo (stationary / moving), plausible per class per
 *    docs/research/tank-roster.md (heavies are billboards, mediums sneak,
 *    modern MBTs sit between; smaller silhouettes rate higher).
 *  - Firing bloom: a shot costs most of the tank's OWN camo, decaying
 *    exponentially back over a few seconds. The loss fraction scales with
 *    the gun's caliber (fireCamoLossFor: 76 mm sheds ~64%, 120 mm ~80%).
 *  - Equipment (EQUIPMENT table): camo net (+still camo), binoculars
 *    (+still view range), vents — injected via deps.getEquipment.
 *  - Bush/foliage concealment: vegetation discs intersecting the 2D line
 *    spotter→target add camo (capped). The 15 m proximity rule: while a
 *    tank's fire bloom is hot, foliage within 15 m of it turns transparent
 *    (muzzle flash lights it up) — bushes further back keep concealing.
 *  - Per-tank view range; camo paint pattern adds a flat bonus (+3–4%).
 *  - spotRange = viewRange − (viewRange − 50) × targetCamo, clamped to
 *    [50 m, MAX_SPOT_RANGE_M]. Inside 50 m the spot is unconditional —
 *    WoT's proximity rule detects THROUGH houses/terrain (no LOS test).
 *  - Periodic checks (0.5–2 s by proximity, staggered per target — never
 *    per-frame) with a 5 s spotted linger after the last successful check.
 *  - Sixth sense (r8): the raw per-team spotted state (isSpotted) flips the
 *    instant a check passes — enemies aim/fire on it — but the PLAYER only
 *    learns of it SIXTH_SENSE_DELAY_S later, and only for the lamp's display
 *    window. getConcealment() (the HUD snapshot source) reports that gated
 *    state so no HUD element can leak the information the 3 s fuse hides.
 *  - Armor doc §9 module debuffs: a damaged observation device halves the
 *    spotter's view range; a damaged radio halves the signal range over which
 *    a spot is shared to teammates (isSpotted's optional receiver argument).
 *
 * No three.js imports: positions/directions are duck-typed {x,y,z} and the
 * injected `raycast(origin, dir, maxDist)` only ever READS those fields.
 */

// ---------------------------------------------------------------------------
// Tuning tables
// ---------------------------------------------------------------------------

export const MAX_SPOT_RANGE_M = 445;   // matches the HUD minimap spot circle
export const MIN_SPOT_RANGE_M = 50;    // WoT proximity spotting floor
// Armor doc §9 module debuffs wired into spotting:
export const OPTICS_VIEW_FACTOR = 0.5;   // damaged observation device: −50% view range
export const SIGNAL_RANGE_M = 600;       // healthy radio: team intel share range
export const RADIO_DAMAGED_FACTOR = 0.5; // damaged radio: share range halved
export const SPOT_LINGER_S = 5;        // spotted state persists after last pass
// Sixth sense: how long after the enemy's check passes the player LEARNS of
// it, and how long that knowledge stays displayed (mirrors the HUD lamp's
// 3 s fuse + 8 s bulb — src/ui/hud.js SIXTH_DELAY_S/SIXTH_SHOW_S). Only the
// getConcealment() display state uses these; isSpotted stays instant.
export const SIXTH_SENSE_DELAY_S = 3;
export const SIXTH_SENSE_SHOW_S = 8;
export const BUSH_FIRE_TRANSPARENT_M = 15; // 15 m rule radius
export const CAMO_PAINT_BONUS = 0.035; // equipped camo pattern (+3.5%)
// r9 forest-camping balance: 0.6 let any tree clump stack to the cap (canopy
// discs add 0.13 each) and, with the own-camo term bloom-stripped to ~0.05,
// a firing tank in forest still carried ~0.65 total — at 250 m+ the WoT
// fire-reveal moment never happened outside isolated bushes. 0.5 keeps
// deliberate double-bush play (2 x 0.35 still caps) while bloom-hot forest
// targets light up. Pairs with vegetation.js canopy add 0.13 -> 0.08
// (bushes stay 0.35): trees soft-conceal, bushes are the real hides.
export const MAX_BUSH_BONUS = 0.5;     // stacked-foliage cap
export const FIRE_CAMO_LOSS = 0.82;    // fallback own-camo loss at full bloom (unknown caliber)
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
 * Module state off a duck-typed entity ('ok' when the entity carries no
 * combat state — headless fixtures, probes).
 * @param {object} ent {combat?: {modules?: {[name]: {state}}}}
 * @param {string} name module name
 * @returns {'ok'|'yellow'|'red'}
 */
function moduleStateOf(ent, name) {
  const m = ent && ent.combat && ent.combat.modules && ent.combat.modules[name];
  return m && m.state ? m.state : 'ok';
}

/**
 * View range with the armor doc §9 optics debuff: −50% while the observation
 * device is damaged (yellow or red).
 * @param {object} ent TankEntity-like ({spec, combat?})
 * @returns {number} meters
 */
export function effectiveViewRangeM(ent) {
  const vr = viewRangeOf(ent.spec);
  return moduleStateOf(ent, 'optics') !== 'ok' ? vr * OPTICS_VIEW_FACTOR : vr;
}

/**
 * Radio intel share range (armor doc §9: damaged radio = reduced signal /
 * minimap share range).
 * @param {object} ent TankEntity-like
 * @returns {number} meters
 */
export function signalRangeM(ent) {
  return moduleStateOf(ent, 'radio') !== 'ok'
    ? SIGNAL_RANGE_M * RADIO_DAMAGED_FACTOR
    : SIGNAL_RANGE_M;
}

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
 * Caliber-scaled firing camo loss (r7: a 76 mm Sherman and a 120 mm Abrams
 * shed identical camo when firing — WoT scales the penalty with gun size,
 * which is what keeps small-caliber scout play viable).
 * loss = 0.55 + 0.35 × clamp((caliberMm − 50) / 100, 0, 1);
 * unknown caliber falls back to FIRE_CAMO_LOSS.
 * @param {?number} caliberMm shooter's gun caliber
 * @returns {number} own-camo fraction lost at full bloom, in [0.55, 0.90]
 */
export function fireCamoLossFor(caliberMm) {
  if (!(caliberMm > 0)) return FIRE_CAMO_LOSS;
  return 0.55 + 0.35 * clamp((caliberMm - 50) / 100, 0, 1);
}

// ---------------------------------------------------------------------------
// Equipment layer (concealment/vision loadout builds — r7 depth item).
// deps.getEquipment(ent) returns an array of ids from this table; effects:
//   camo      — flat own-camo bonus, always active           (vents)
//   camoStill — own-camo bonus while the TANK sits still     (camo net)
//   view      — view-range multiplier bonus, always active   (vents)
//   viewStill — view-range bonus while the SPOTTER is still  (binoculars)
// Wire-up lives in game/state.js (getEquipment dep) + the garage loadout UI.
// ---------------------------------------------------------------------------
export const EQUIPMENT = {
  camo_net:   { label: 'Camouflage Net',       camoStill: 0.12 },
  binoculars: { label: 'Binocular Telescope',  viewStill: 0.25 },
  vents:      { label: 'Improved Ventilation', camo: 0.02, view: 0.02 },
};

/**
 * Own-camo bonus from equipment (additive with base + paint, so it is
 * stripped by fire bloom like the rest of the tank's own camo).
 * @param {?Array<string>} equipIds ids into EQUIPMENT
 * @param {boolean} moving hull is moving (disables *Still effects)
 * @returns {number} camo bonus in [0, ~0.14]
 */
export function equipCamoBonus(equipIds, moving) {
  if (!equipIds) return 0;
  let b = 0;
  for (let i = 0; i < equipIds.length; i++) {
    const e = EQUIPMENT[equipIds[i]];
    if (!e) continue;
    if (e.camo) b += e.camo;
    if (e.camoStill && !moving) b += e.camoStill;
  }
  return b;
}

/**
 * View-range multiplier from equipment (applied to the spotter).
 * @param {?Array<string>} equipIds ids into EQUIPMENT
 * @param {boolean} moving spotter hull is moving (disables *Still effects)
 * @returns {number} multiplier >= 1
 */
export function equipViewMult(equipIds, moving) {
  if (!equipIds) return 1;
  let m = 1;
  for (let i = 0; i < equipIds.length; i++) {
    const e = EQUIPMENT[equipIds[i]];
    if (!e) continue;
    if (e.view) m *= 1 + e.view;
    if (e.viewStill && !moving) m *= 1 + e.viewStill;
  }
  return m;
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
 * Own camo (base + paint + equipment) is scaled down by fire bloom; bush
 * bonus rides on top (the 15 m transparency rule is applied when the bonus
 * is computed). `fireLoss` is the caliber-scaled bloom penalty
 * (fireCamoLossFor) — omitted, it falls back to FIRE_CAMO_LOSS.
 * @param {{base:number, paint?:number, equip?:number, bloom?:number,
 *          bush?:number, fireLoss?:number}} p
 * @returns {number} camo in [0, 0.95]
 */
export function combineCamo(p) {
  const loss = p.fireLoss != null ? p.fireLoss : FIRE_CAMO_LOSS;
  const own = (p.base + (p.paint || 0) + (p.equip || 0)) * (1 - loss * (p.bloom || 0));
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
 * @param {(ent:object) => ?Array<string>} [deps.getEquipment] equipped item
 *   ids (see EQUIPMENT). Omit = no equipment effects.
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
  const getEquipment = typeof deps.getEquipment === 'function' ? deps.getEquipment : () => null;
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
          player: { spotted: false, lastPassS: -1e9, spottedAtS: -1e9, spotter: null },
          enemy: { spotted: false, lastPassS: -1e9, spottedAtS: -1e9, spotter: null },
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

  // PERF: reused arg/result objects for the staggered checks (same pattern as
  // _conc below) — checkTarget/canSpot ran every 0.5-2 s per tank and were the
  // last steady allocation sites in the spotting path.
  const _camoArgs = { base: 0, paint: 0, equip: 0, bloom: 0, bush: 0, fireLoss: 0 };
  const _seenVia = { player: null, enemy: null };

  /** Full spot test: does `spotter` see `target` right now? */
  function canSpot(spotter, target, timeS) {
    const sp = spotter.state.pos, tp = target.state.pos;
    const dx = tp.x - sp.x, dy = tp.y - sp.y, dz = tp.z - sp.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Proximity rule: inside 50 m the spot is UNCONDITIONAL — WoT's proximity
    // detection works through obstacles (a tank idling 30 m away behind a
    // house lights up; r8: the old hardLos gate here read as a spotting bug
    // when brawling around the Steinburg blocks).
    if (dist <= MIN_SPOT_RANGE_M) return true;
    if (dist > MAX_SPOT_RANGE_M) return false;
    const rec = recOf(target);
    const bloom = fireBloomAt(rec.firedAtS, timeS);
    const moving = Math.abs(target.state.speed || 0) > MOVING_SPEED_MPS;
    const bush = bushBonusBetween(concealers, sp.x, sp.z, tp.x, tp.z, bloom > 0);
    _camoArgs.base = baseCamoOf(target.spec, moving);
    _camoArgs.paint = getCamoBonus(target);
    _camoArgs.equip = equipCamoBonus(getEquipment(target), moving);
    _camoArgs.bloom = bloom;
    _camoArgs.bush = bush;
    _camoArgs.fireLoss = rec.fireLoss;
    const camo = combineCamo(_camoArgs);
    // spotter view range: module damage (optics) x equipment (binocs/vents)
    const spotterMoving = Math.abs(spotter.state.speed || 0) > MOVING_SPEED_MPS;
    const vr = effectiveViewRangeM(spotter) *
      equipViewMult(getEquipment(spotter), spotterMoving);
    if (dist > spotRangeM(vr, camo)) return false;
    return hardLos(spotter, target);
  }

  /** Run the spot checks for one target against every live opposing tank. */
  function checkTarget(target, tanks, timeS) {
    const rec = recOf(target);
    let nearest = Infinity;
    // Per team: the best spotter that passed this round (null = not seen).
    // A healthy-radio spotter shares team-wide (SIGNAL_RANGE_M); a spot known
    // only through a damaged-radio spotter travels half as far (§9 radio
    // debuff), so we keep checking spotters until a full-share one passes.
    const seenVia = _seenVia;
    seenVia.player = null;
    seenVia.enemy = null;
    for (let i = 0; i < tanks.length; i++) {
      const sp = tanks[i];
      if (sp === target || !alive(sp) || sp.team === target.team) continue;
      const d = Math.hypot(sp.state.pos.x - target.state.pos.x,
        sp.state.pos.z - target.state.pos.z);
      if (d < nearest) nearest = d;
      const cur = seenVia[sp.team];
      if (cur && cur.shareM >= SIGNAL_RANGE_M) continue; // full share already
      if (canSpot(sp, target, timeS)) {
        const shareM = signalRangeM(sp);
        if (!cur || shareM > cur.shareM) {
          seenVia[sp.team] = { id: sp.id, x: sp.state.pos.x, z: sp.state.pos.z, shareM };
        }
      }
    }
    for (const team of TEAMS) {
      if (team === target.team) continue;
      const st = rec.byTeam[team];
      if (seenVia[team]) {
        if (!st.spotted) {
          st.spottedAtS = timeS; // rising edge — starts the sixth-sense fuse
          events.push({ id: target.id, team, timeS });
        }
        st.spotted = true;
        st.lastPassS = timeS;
        st.spotter = seenVia[team];
      } else if (st.spotted && timeS - st.lastPassS > SPOT_LINGER_S) {
        st.spotted = false;
      }
    }
    rec.nextCheckS = timeS + checkIntervalS(isFinite(nearest) ? nearest : 1e9);
  }

  // reused result object for getConcealment (no per-frame allocation)
  const _conc = {
    camo: 0, base: 0, paint: 0, equip: 0, bush: 0, bloom: 0,
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
     *
     * With no `receiver` the answer is team-wide (legacy callers keep full
     * intel). Passing the receiving entity applies the armor doc §9 radio
     * debuff: intel from the spotter only reaches teammates within
     * min(spotter, receiver) signal range — halved for a damaged radio —
     * while the spotter itself always keeps its own eyes.
     * @param {string} id target tank id
     * @param {'player'|'enemy'} team observing team
     * @param {object} [receiver] TankEntity-like teammate asking for the intel
     */
    isSpotted(id, team, receiver) {
      const r = recs.get(id);
      const st = r ? r.byTeam[team] : null;
      if (!st || !st.spotted) return false;
      if (!receiver || !st.spotter) return true; // team-wide query (legacy)
      if (receiver.id === st.spotter.id) return true; // own vision, no radio needed
      const p = receiver.state && receiver.state.pos;
      if (!p) return true;
      const shareM = Math.min(st.spotter.shareM, signalRangeM(receiver));
      return Math.hypot(p.x - st.spotter.x, p.z - st.spotter.z) <= shareM;
    },

    /**
     * Register a shot for the fire-bloom penalty + 15 m rule.
     * The bloom's camo loss scales with the shooter's caliber
     * (fireCamoLossFor): pass `caliberMm` explicitly, or it is read off the
     * shooter's `spec.gun.caliberMm` via getTanks(); unknown guns keep the
     * flat FIRE_CAMO_LOSS fallback.
     */
    notifyFired(id, timeS, caliberMm) {
      let r = recs.get(id);
      if (!r) {
        r = {
          firedAtS: -1e9, nextCheckS: 0,
          byTeam: {
            player: { spotted: false, lastPassS: -1e9, spottedAtS: -1e9, spotter: null },
            enemy: { spotted: false, lastPassS: -1e9, spottedAtS: -1e9, spotter: null },
          },
        };
        recs.set(id, r);
      }
      r.firedAtS = timeS;
      let cal = caliberMm;
      if (cal == null) {
        const tanks = deps.getTanks();
        for (let i = 0; i < tanks.length; i++) {
          if (tanks[i].id === id) {
            cal = tanks[i].spec && tanks[i].spec.gun ? tanks[i].spec.gun.caliberMm : null;
            break;
          }
        }
      }
      r.fireLoss = fireCamoLossFor(cal);
    },

    /**
     * Live concealment snapshot for one tank (HUD camo/eye indicator).
     * `spotted` is the sixth-sense DISPLAY state (3 s fuse + 8 s window),
     * NOT the raw team intel — use isSpotted() for the server truth.
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
      _conc.equip = equipCamoBonus(getEquipment(ent), moving);
      _conc.bloom = bloom;
      _conc.bush = bush;
      _conc.moving = moving;
      _conc.fired = bloom > 0;
      _conc.inBush = bush > 0 || (bloom > 0 && bushNearby(p));
      _camoArgs.base = _conc.base;
      _camoArgs.paint = _conc.paint;
      _camoArgs.equip = _conc.equip;
      _camoArgs.bloom = bloom;
      _camoArgs.bush = bush;
      _camoArgs.fireLoss = rec.fireLoss;
      _conc.camo = combineCamo(_camoArgs);
      // Sixth-sense display gate (r8 major): the HUD eye flipped red the
      // instant the enemy check passed, leaking exactly the information the
      // 3 s lamp fuse exists to hide. The snapshot's `spotted` is now the
      // player's KNOWLEDGE, not the server state: it lights SIXTH_SENSE_DELAY_S
      // after the rising edge and holds only for the lamp's SIXTH_SENSE_SHOW_S
      // window (WoT: after the bulb dies you do NOT know you are still seen).
      // Raw state stays on isSpotted() for enemies/minimap/AI.
      const opp = ent.team === 'player' ? 'enemy' : 'player';
      const st = rec.byTeam[opp];
      const knownAge = st.spotted ? timeS - st.spottedAtS : -1;
      _conc.spotted = knownAge >= SIXTH_SENSE_DELAY_S &&
        knownAge <= SIXTH_SENSE_DELAY_S + SIXTH_SENSE_SHOW_S;
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
