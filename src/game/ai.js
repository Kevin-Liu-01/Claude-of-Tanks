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
// controls_gunnery r6: aimElevationRad import removed — tryFire (state.js)
// owns the ballistic solution; see the aim-point comment in aimAndFire().
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
  // engageRangeM must exceed the typical spawn-to-spawn LOS distance
  // (~350-450 m on every map) or bots idle outside it while spotted targets
  // trade: r7 raised normal 330→400 and hard 420→500 so a known contact is
  // always worth advancing on at full throttle.
  easy:   { fireFactor: 0.6, reactionS: 1.2, aimErrMult: 2.0, probeLevel: 0, engageRangeM: 300, holdRangeM: 180, coverIQ: 0.35 },
  normal: { fireFactor: 0.9, reactionS: 0.7, aimErrMult: 1.4, probeLevel: 1, engageRangeM: 400, holdRangeM: 240, coverIQ: 0.7  },
  hard:   { fireFactor: 1.2, reactionS: 0.3, aimErrMult: 1.0, probeLevel: 2, engageRangeM: 500, holdRangeM: 300, coverIQ: 1.0  },
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
// UNDER-FIRE REACTION + PLAYER THREAT (controls_gunnery r2): being shot
// reveals the shooter for a chase window, and the PLAYER's distance is
// weighted down during target selection so enemy aggression doesn't all
// drain onto the allied bots pushing ahead of the player (r2 critic: enemies
// fired 21-34 shells across three battles, zero directed at the player).
const UNDER_FIRE_WINDOW_S = 15;       // chase/engage window after a team hit
const UNDER_FIRE_RANGE_BONUS_M = 180; // engage-envelope extension toward the shooter
const PLAYER_THREAT_DIST_MULT = 0.35; // player counts as 35% of its true d² when ranking targets
// PLAYER ATTACKER-OF-RECORD (controls_gunnery r4): the single underFire slot
// was overwritten within a second or two by whichever ALLIED bot landed the
// next teammate hit, so the player's aggro claim evaporated before the next
// LOS tick — measured live: 3 player hits, underFire pointing at an allied
// Leo 2A7 on every snapshot, zero shells returned at the player across 90 s.
// A PLAYER shooter now also claims a dedicated sticky slot with a longer
// window (muzzle flash + tracer are intel). camo_spotting r2: the slot no
// longer bypasses the spotting gate — the firing-player reveal itself now
// lives in the sim (spotting.js muzzle-flash branch resolves it through the
// camo formula); the slot keeps the position intel + priority sticky.
const PLAYER_AGGRO_WINDOW_S = 25;
// PLAYER MUZZLE-FLASH INTEL (controls_gunnery r5): r4's playerAggro only
// armed on a LANDED player hit (shell:hit) — a player sniping from outside
// the bots' 350-380 m view range was revealed for one aggro window and then
// went dark again while the aggro'd bot stalled in a losBlockedT>5 chase.
// Decisive r5 probe: 3 penetrating player hits, 29+ enemy shells over two
// 60 s runs, ZERO aimed within 4° of the player — functionally invulnerable.
// Now every player SHOT (state.js fans out shell:fired to notifyPlayerFired)
// re-reveals the player to all enemies within earshot for this window, the
// aggro'd bots hard-commit (2 s vantage threshold, unconditional engage-range
// bonus), and a stalemate breaker forces silent bots with a known contact to
// push a firing position instead of idling in patrol/seekCover.
const MUZZLE_INTEL_WINDOW_S = 18;
const STALEMATE_SILENT_S = 12;   // no shot fired this long w/ contact → push
const STALEMATE_PUSH_S = 8;      // duration of one forced push window

// HEADING COMMITMENT (controls_gunnery r3): approach/chase legs used to steer
// at the LIVE target position every tick, so bots wove continuously (speed
// oscillating 1-14 m/s) and a constant-velocity lead solution NEVER converged
// — a settled 14-shell volley went 0/14 on a 415 m mover. Bots now commit to
// a chase point for 3-5 s (re-picked early only if the target displaces far),
// so leading a distant mover is learnable, exactly like WoT bots.
const CHASE_COMMIT_MIN_S = 3.0;
const CHASE_COMMIT_VAR_S = 2.0;
const CHASE_REPICK_DIST_M = 60;

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
  // camo_spotting r2: the under-fire/muzzle-intel windows NO LONGER bypass
  // the concealment formula. Fire reveal now resolves INSIDE the spotting sim
  // (spotting.js: notifyFired pulls the shooter's next check in, and the
  // muzzle-flash branch of canSpot reveals a bloom-hot shooter with no real
  // foliage cover even beyond the camo-formula spot range) — so a revealed
  // shooter arrives through isSpotted like any other contact, while a deep
  // double-bush ambusher the formula still hides STAYS hidden (WoT
  // bush-sniper play). The underFire/playerAggro slots keep only their
  // POSITIONAL roles: lastSeen chase intel, target priority, and the
  // engage-envelope extension.
  const isVisibleToTeam = (e) => !spotting || spotting.isSpotted(e.id, entity);

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
  // LOS vantage seek: when the bot KNOWS where the enemy is (team intel)
  // but its own ray is blocked for a while, beelining lastSeen just parks
  // it against the blocking building. Sample a ring of candidate positions
  // around lastSeen and drive to the nearest one with a clear sightline.
  const vantage = { x: 0, z: 0 };
  let hasVantage = false;
  let losBlockedT = 0;
  const coverPoint = { x: 0, z: 0 };
  let hasCoverPoint = false;
  let coverRollPassed = false;               // coverIQ roll for the current reload cycle
  let coverRolled = false;

  const flankPoints = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
  let flankIndex = 0;
  let flankUntilS = 0;
  let nonPenCount = 0;
  let underFire = null;            // shooter entity revealed by hitting us/a teammate
  let underFireUntilS = -Infinity; // reaction window end (sim seconds)
  let playerAggro = null;          // sticky PLAYER attacker-of-record (r4)
  let playerAggroUntilS = -Infinity;
  let playerShotsInWindow = 0;     // player shots inside the live intel window (r2)
  // PLAYER-HUNTER BIAS (controls_gunnery r4): r3's flat 0.35 d² weighting
  // still let every bot farm the closer allied escorts while the player
  // plinked from 350 m (probe: 26 enemy shells, zero at the player). A
  // persistent fraction of controllers (~40%) now treats a SPOTTED player
  // as a priority mark — 0.12 d² ranks a 350 m player like a 121 m bot —
  // so somebody always turns on the human without the whole team tunneling.
  const playerHunter = rng() < 0.4;
  const playerDistMult = playerHunter ? 0.12 : PLAYER_THREAT_DIST_MULT;

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
  // PROGRESS-based stuck sensing: `state.speed` is the DRIVETRAIN speed and
  // stays high while the collision pushback exactly cancels the motion
  // against a wall/rock — the old |speed|<0.3 test never fired and bots
  // ground against the first obstacle on their opening push for the whole
  // battle (r7 dead-air root cause). Track actual displacement instead.
  let progX = entity.state.pos.x;
  let progZ = entity.state.pos.z;
  let progressRate = 2; // m/s EMA of real displacement
  let stuckStrikes = 0; // consecutive unstick cycles without real progress
  // Blocked-route detour: after repeated strikes the straight line is a
  // wall/rock face — drive at a sideways-offset ghost target for a few
  // seconds (side flips on the next strike) so the route bends around the
  // blocker instead of ramming it forever.
  let detourUntilS = -1;
  let detourSide = 1;
  let gunLimitT = 0;
  let nudgeUntilS = -1;
  let arcLimitedT = 0;              // gun pinned at an elevation/depression stop
  // STALEMATE BREAKER (controls_gunnery r5): mid-battle enemy fire rate
  // collapsed to 1-2 shells/10 s (bots posturing in patrol/seekCover with
  // live contacts). Track the last time the trigger was actually pulled;
  // a long silent stretch WITH a contact forces a vantage push and
  // suspends cover-seeking for STALEMATE_PUSH_S.
  let lastFiredAtS = 0;
  let pressUntilS = -1;
  let dispGateT = 0; // time spent otherwise-ready but dispersion-gated (r5)
  // coverIQ hesitation decays over the battle so late-game bots commit
  // instead of endlessly rolling hull-down/cover searches between shots.
  const effCoverIQ = () =>
    nowS < pressUntilS ? 0 : tier.coverIQ * clamp(1.15 - nowS / 240, 0.35, 1);

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

    // ATTACKER-OF-RECORD AGGRO (controls_gunnery r4): a shooter that just
    // landed a shell on us or a nearby teammate takes the target slot
    // OUTRIGHT for its reaction window whenever we can draw a clear personal
    // ray — return fire is core WoT feel. The sticky PLAYER slot is checked
    // FIRST: r3's shared slot was overwritten by allied-bot fire within
    // seconds, so the player's claim never survived to an LOS tick (probe:
    // 5 player shots, 3 hits, zero shells back in 90 s).
    const aggro =
      (playerAggro && timeS < playerAggroUntilS && enemyAlive(playerAggro))
        ? playerAggro
        : (underFire && timeS < underFireUntilS && enemyAlive(underFire))
          ? underFire : null;
    if (aggro && aggro !== target) {
      const up = aggro.state.pos;
      // camo_spotting r2: the aggro slot only takes the target slot when the
      // spotting sim actually shows the shooter (fire reveal now resolves
      // through the formula there) — a raw geometric ray alone must never
      // acquire a concealment-hidden ambusher.
      // controls_gunnery r2 EXCEPTION: a PLAYER that has fired 2+ times
      // inside one muzzle-intel window is claimed even without visibility or
      // a personal ray — repeated muzzle flash/tracer from one position is
      // unambiguous intel, and the blocked-LOS engage path converts the
      // claim into a vantage push (2 s hard commit for player targets).
      const seen = isVisibleToTeam(aggro) && hasLos(ex, ey, ez, up.x, eyeY(aggro), up.z);
      const hardClaim = !seen && aggro === playerAggro && playerShotsInWindow >= 2;
      if (seen || hardClaim) {
        target = aggro;
        losClear = seen;
        acquiredAtS = timeS;
        lastSeenAtS = timeS;
        lastSeen.x = up.x; lastSeen.z = up.z;
        nonPenCount = 0;
        probeTimer = 0;
        return;
      }
    }

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
      // PLAYER RE-PRIORITIZATION (controls_gunnery r3): target-keeping was
      // absolute — a bot that opened on an allied bot never re-ranked, so
      // tier-X enemies spent whole battles shooting the player's escorts
      // while the player sat in the open untouched (90 s window: zero hits
      // on the player from the Leo 2A7 / IS-3). On the LOS cadence, a
      // SPOTTED player with a clear personal ray steals the slot whenever
      // its threat-weighted distance (PLAYER_THREAT_DIST_MULT) beats the
      // current target's — same ranking rule the fresh-scan path uses.
      if (!target.isPlayer && losClear) {
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (!p || !p.isPlayer || !enemyAlive(p) || !isVisibleToTeam(p)) continue;
          const pp = p.state.pos;
          const pdx = pp.x - ex, pdz = pp.z - ez;
          const cdx = tp.x - ex, cdz = tp.z - ez;
          const pEff = (pdx * pdx + pdz * pdz) * playerDistMult;
          if (pEff < cdx * cdx + cdz * cdz &&
              hasLos(ex, ey, ez, pp.x, eyeY(p), pp.z)) {
            target = p;
            losClear = true;
            acquiredAtS = timeS;
            lastSeenAtS = timeS;
            lastSeen.x = pp.x; lastSeen.z = pp.z;
            nonPenCount = 0;
            probeTimer = 0;
          }
          break;
        }
        if (target.isPlayer) return;
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
      // Threat weighting: the player ranks as if 0.59x its true distance
      // (0.35x for the playerHunter fraction — controls_gunnery r4).
      const eff = e.isPlayer ? d2 * playerDistMult : d2;
      if (eff >= bestD2) continue;
      if (!hasLos(ex, ey, ez, tp.x, eyeY(e), tp.z)) continue;
      best = e; bestD2 = eff;
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

  /**
   * Find a position with a clear sightline to lastSeen: candidates on two
   * rings around the contact point, nearest-to-self first. Writes `vantage`.
   * @returns {boolean} true when a sightline position was found
   */
  function findVantage() {
    const st = entity.state;
    const ty = hf.getHeightAt(lastSeen.x, lastSeen.z) + 1.5;
    let bestD2 = Infinity;
    let found = false;
    const a0 = rng() * TAU;
    for (const r of [70, 110]) {
      for (let k = 0; k < 8; k++) {
        const a = a0 + (k / 8) * TAU;
        const cx = lastSeen.x + Math.sin(a) * r;
        const cz = lastSeen.z + Math.cos(a) * r;
        const cy = hf.getHeightAt(cx, cz) + selfEyeM;
        if (!hasLos(cx, cy, cz, lastSeen.x, ty, lastSeen.z)) continue;
        const dx = cx - st.pos.x, dz = cz - st.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; vantage.x = cx; vantage.z = cz; found = true; }
      }
      if (found) break;
    }
    return found;
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
    let dx = x - st.pos.x, dz = z - st.pos.z;
    let dist = Math.hypot(dx, dz);
    // Blocked-route detour (see detourUntilS): steer for a point offset
    // sideways from the real target so the hull clears the blocking face.
    if (nowS < detourUntilS && dist > 25) {
      const px = dz / dist, pz = -dx / dist; // perp of the bearing
      x += px * 55 * detourSide;
      z += pz * 55 * detourSide;
      dx = x - st.pos.x; dz = z - st.pos.z;
      dist = Math.hypot(dx, dz);
    }
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

  // HEADING COMMITMENT (r3): committed chase point for moving-destination
  // legs. driveToXZ keeps its per-tick steering; only the DESTINATION is
  // frozen for the commit window so the hull holds a near-constant velocity.
  const chasePoint = { x: 0, z: 0 };
  let chaseUntilS = -1;
  function chaseToXZ(input, x, z, speedScale) {
    if (nowS >= chaseUntilS ||
        Math.hypot(x - chasePoint.x, z - chasePoint.z) > CHASE_REPICK_DIST_M) {
      chasePoint.x = x;
      chasePoint.z = z;
      chaseUntilS = nowS + CHASE_COMMIT_MIN_S + rng() * CHASE_COMMIT_VAR_S;
    }
    const arrived = driveToXZ(input, chasePoint.x, chasePoint.z, speedScale);
    if (arrived) chaseUntilS = -1; // reached the frozen point — re-pick now
    return arrived;
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
    // Full throttle before first contact (nowS is sim time): the opening
    // push is a transit, not a patrol — WoT rounds reach contact in
    // 30-60 s and every second of dawdling here is dead air. After the
    // first minute (contact made or not) drop back to patrol pace.
    if (driveToXZ(input, wp.x, wp.z, nowS < 60 ? 1.0 : 0.85)) {
      wpIndex = (wpIndex + 1) % waypoints.length;
    }
  }

  function driveEngage(input, timeS, distToTarget) {
    const st = entity.state;
    if (!target) {
      // Chase the last known position, then fall back to patrol.
      if (timeS - lastSeenAtS < TARGET_MEMORY_S + 6 &&
          !chaseToXZ(input, lastSeen.x, lastSeen.z, 0.9)) return;
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
      // Known contact, blocked ray: chase lastSeen briefly, then circle to
      // a sightline position instead of parking against the cover.
      if (hasVantage) {
        if (driveToXZ(input, vantage.x, vantage.z, 1.0)) hasVantage = false;
        return;
      }
      // r5: a PLAYER target (or a forced stalemate push) hard-commits — the
      // r4 aggro'd bot sat in the blocked chase for 5+ s per attempt and
      // never converted aggro into a firing position (probe: zero shells at
      // the player across 90 s while "chasing" it).
      const vantageAfterS =
        (target.isPlayer || timeS < pressUntilS) ? 2 : 5;
      if (losBlockedT > vantageAfterS && findVantage()) {
        hasVantage = true;
        driveToXZ(input, vantage.x, vantage.z, 1.0);
        return;
      }
      chaseToXZ(input, lastSeen.x, lastSeen.z, target.isPlayer ? 1.0 : 0.9);
      return;
    }
    hasVantage = false; // ray is clear — fight from here
    // r5: the engage envelope extends unconditionally toward a PLAYER
    // attacker-of-record and during a stalemate push — not only while the
    // 15 s underFire window happens to be live.
    const engageR = tier.engageRangeM +
      ((timeS < underFireUntilS ||
        (target.isPlayer && timeS < playerAggroUntilS) ||
        timeS < pressUntilS) ? UNDER_FIRE_RANGE_BONUS_M : 0);
    if (distToTarget > engageR) {
      chaseToXZ(input, tp.x, tp.z, 1.0); // committed leg (r3) — leadable mover
      return;
    }
    if (hasMoveTarget) {                          // roll into the hull-down spot
      if (driveToXZ(input, moveTarget.x, moveTarget.z, 0.6)) hasMoveTarget = false;
      return;
    }
    if (distToTarget > tier.holdRangeM) {
      // HALT-AND-VOLLEY (controls_gunnery r5): the old branch crept at 0.45
      // throttle the whole way from engageR down to holdRange — movement
      // bloom kept computeDispersionRadM above the fire gate for the entire
      // 240-580 m band, so mid-range bots with clear LOS simply never shot
      // (diag: 60 s, two live enemies staring at contacts, zero shells; only
      // sub-holdRange bots ever fired). WoT bots stop-shoot-move: advance
      // while the gun is loading, HALT and settle the moment it is ready.
      const rl = entity.combat && entity.combat.reload;
      if (rl && rl.t > 1.2) {
        chaseToXZ(input, tp.x, tp.z, 0.6); // close distance during the reload
        return;
      }
      faceYaw(input, Math.atan2(tp.x - st.pos.x, tp.z - st.pos.z));
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

    // controls_gunnery r6: NO gravity compensation here — tryFire (state.js)
    // already auto-elevates every shell for the aim-point distance (WoT-style
    // server elevation). Raising the aim point by tan(elev)·dist on top of
    // that DOUBLE-compensated: every settled bot shell flew ~tan(elev)·dist
    // HIGH at the target (a 750 m/s WW2 gun at 300 m = +1.7 m — clean over
    // the turret), which is exactly the "bots fired 20-27 shells and landed
    // zero" streaky-pressure failure. The aim point is the intended IMPACT
    // point; state.js owns the ballistic solution.

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
    // r5 SETTLED-SHOT TIMEOUT: at 350-620 m many guns can NEVER shrink the
    // reticle under (tw/2)×fireFactor — the gate is bloom DISCIPLINE, not a
    // range cap, yet it hard-vetoed every long shot: the r5 diag showed two
    // halted, aligned, loaded, LOS-clear bots staring at the player at
    // 400/416 m for 20+ s with dispersionOk false the whole time (this is
    // the "one-directional combat" critical). A bot that stays otherwise
    // ready for >2.5 s takes the fully-aimed shot anyway, exactly like a
    // WoT player firing on a settled-but-wide reticle.

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

    // (r5 settled-shot timeout — see the dispersion-gate note above)
    if (gunReady && alignOk && !dispersionOk) dispGateT += dt;
    else dispGateT = 0;
    const dispersionPass = dispersionOk || dispGateT > 2.5;

    input.fire = gunReady && dispersionPass && alignOk && (penGateOk || chosenSlot === 2);
    if (input.fire) lastFiredAtS = timeS; // STALEMATE BREAKER bookkeeping (r5)
    // controls_gunnery r5 debug surface (headless probes): why is/isn't this
    // bot firing right now? Plain snapshot object — no live references.
    _dbg.losClear = losClear; _dbg.reactionOk = reactionOk;
    _dbg.reloadReady = reloadReady; _dbg.rangeOk = rangeOk;
    _dbg.dispersionOk = dispersionOk; _dbg.dispGateT = +dispGateT.toFixed(1);
    _dbg.alignOk = alignOk;
    _dbg.penGateOk = penGateOk; _dbg.slot = chosenSlot;
    _dbg.penRatio = +cachedPenRatio.toFixed(2);
    _dbg.yawErrMrad = +(yawErr * 1000).toFixed(1);
    _dbg.pitchErrMrad = +(pitchErr * 1000).toFixed(1);
    _dbg.distM = Math.round(dist);
  }
  const _dbg = {};

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
        // Hull-down search on a slow cadence (coverIQ gates how often it
        // happens; r5 — decays over the battle + zero during a forced push).
        if (target && losClear && coverTimer <= 0) {
          coverTimer = COVER_INTERVAL_S;
          if (rng() < effCoverIQ() && findCrest(moveTarget, false)) hasMoveTarget = true;
        }
        // Long reload + low commitment → duck into full cover.
        if (target && cb && cb.reload && cb.reload.t > 2.0) {
          if (!coverRolled) { coverRolled = true; coverRollPassed = rng() < effCoverIQ(); }
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
    // Casemate YAW pins are excluded: movement.js's §7 auto hull-traverse is
    // already swinging the hull onto the target, and a reverse pulse during
    // that rotation would just wander the bot. The nudge answers PITCH pins
    // (gun depression over a crest), so it requires the aim azimuth to be
    // essentially on the gun already.
    const st = entity.state;
    const aimP = entity.input.aimPoint;
    const yawPinned = st.atGunLimit && aimP &&
      Math.abs(wrapAngle(
        Math.atan2(aimP.x - st.pos.x, aimP.z - st.pos.z) - st.yaw - st.turretYaw)) > 0.02;
    if (mode === 'engage' && target && losClear && st.atGunLimit && !yawPinned) {
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

    // Blocked-sightline timer for the vantage seek (driveEngage).
    if (mode === 'engage' && target && !losClear) losBlockedT += dt;
    else { losBlockedT = 0; if (losClear) hasVantage = false; }

    // STALEMATE BREAKER (controls_gunnery r5): a bot with a known living
    // contact that has not pulled the trigger for STALEMATE_SILENT_S is
    // posturing (cover loop / blocked vantage / patrol drift) — force a
    // push: abandon hull-down/cover intentions, re-engage, and if the ray
    // is blocked sample a fresh vantage immediately. Keeps mid-battle
    // tracer traffic alive instead of decaying to 1-2 shells/10 s.
    {
      const hasContact = (target && enemyAlive(target)) ||
        (timeS - lastSeenAtS < TARGET_MEMORY_S + 6);
      if (hasContact && timeS - lastFiredAtS > STALEMATE_SILENT_S &&
          timeS >= pressUntilS) {
        pressUntilS = timeS + STALEMATE_PUSH_S;
        hasMoveTarget = false;
        hasCoverPoint = false;
        if (mode === 'seekCover' || mode === 'patrol') mode = 'engage';
        if (target && !losClear && findVantage()) hasVantage = true;
      } else if (!hasContact && timeS - lastFiredAtS > 25 &&
                 timeS >= pressUntilS) {
        // NO contact and a long quiet stretch: re-route the patrol toward
        // the nearest living opponent's AREA (route intel only — spotting
        // still gates acquisition), so late battles never decay into two
        // survivors idling on opposite map rims with dead airwaves.
        const list = deps.getEnemies();
        let bestE = null, bestD2 = Infinity;
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!enemyAlive(e)) continue;
          const dx = e.state.pos.x - st.pos.x, dz = e.state.pos.z - st.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) { bestD2 = d2; bestE = e; }
        }
        if (bestE) {
          pressUntilS = timeS + STALEMATE_PUSH_S;
          waypoints.length = 0;
          waypoints.push({
            x: (st.pos.x + bestE.state.pos.x) / 2,
            z: (st.pos.z + bestE.state.pos.z) / 2,
          });
          waypoints.push({ x: bestE.state.pos.x, z: bestE.state.pos.z });
          wpIndex = 0;
          autoPatrolBuilt = true;
          if (mode === 'seekCover') mode = 'engage';
        }
      }
    }

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
    // Real displacement rate (EMA). The drivetrain `st.speed` lies when the
    // collision pushback cancels the motion against an obstacle, so the
    // stuck test uses BOTH: no wheel speed OR no ground actually covered.
    {
      const dx = st.pos.x - progX;
      const dz = st.pos.z - progZ;
      progX = st.pos.x;
      progZ = st.pos.z;
      const inst = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
      progressRate += (inst - progressRate) * Math.min(1, dt * 2.5);
    }
    if (timeS < unstickUntilS) {
      input.throttle = -0.7;
      input.steer = unstickSteer;
      input.brake = false;
      lowSpeedT = 0;
    } else if (Math.abs(input.throttle) > 0.25 &&
               (Math.abs(st.speed) < 0.3 || progressRate < 0.45)) {
      lowSpeedT += dt;
      if (lowSpeedT > STUCK_TIME_S) {
        unstickUntilS = timeS + UNSTICK_TIME_S;
        unstickSteer = rng() < 0.5 ? -1 : 1;
        lowSpeedT = 0;
        // Repeated strikes on the same leg = the straight line is blocked:
        // detour sideways (side flips per strike), and in patrol also skip
        // the waypoint, instead of ramming it until the battle clock runs
        // out.
        stuckStrikes++;
        if (stuckStrikes >= 2) {
          detourSide = -detourSide;
          detourUntilS = timeS + UNSTICK_TIME_S + 6;
          if (mode === 'patrol' && waypoints.length > 1) {
            wpIndex = (wpIndex + 1) % waypoints.length;
          } else if (hasMoveTarget) {
            hasMoveTarget = false;
          }
          hasVantage = false; // blocked vantage — re-sample a fresh one
          if (stuckStrikes >= 4) stuckStrikes = 2; // keep flipping sides
        }
      }
    } else {
      lowSpeedT = 0;
      if (progressRate > 2.5) stuckStrikes = 0; // moving freely again
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

  /**
   * Reaction to this tank (or a nearby teammate) taking an enemy hit: acquire
   * the shooter past the spotting gate, remember its position, and extend the
   * engage envelope toward it for UNDER_FIRE_WINDOW_S. A PLAYER shooter always
   * steals the target slot — return fire at the protagonist is the point.
   * @param {object} shooterEnt TankEntity that fired the shell
   */
  function notifyUnderFire(shooterEnt) {
    if (!shooterEnt || !shooterEnt.state || !shooterEnt.combat ||
        shooterEnt.combat.destroyed || shooterEnt.team === entity.team) return;
    if (shooterEnt.isPlayer) {
      // sticky attacker-of-record slot (r4) — teammate hits can't erase it
      playerAggro = shooterEnt;
      playerAggroUntilS = nowS + PLAYER_AGGRO_WINDOW_S;
    }
    underFire = shooterEnt;
    underFireUntilS = nowS + UNDER_FIRE_WINDOW_S;
    lastSeen.x = shooterEnt.state.pos.x;
    lastSeen.z = shooterEnt.state.pos.z;
    lastSeenAtS = nowS;
    if (!target || !enemyAlive(target) ||
        (shooterEnt.isPlayer && target !== shooterEnt)) {
      target = shooterEnt;
      acquiredAtS = nowS;
      nonPenCount = 0;
      probeTimer = 0;
      if (mode === 'patrol') mode = 'engage';
    }
  }

  /**
   * PLAYER MUZZLE-FLASH INTEL (controls_gunnery r5): the player FIRED within
   * earshot (state.js fans this out to enemies within 420 m on every player
   * shell:fired). Muzzle flash + tracer reveal the shooter — the player
   * claims the sticky attacker-of-record slot and idle bots commit to the
   * contact immediately. camo_spotting r2: actual VISIBILITY of the shooter
   * resolves through the spotting sim (notifyFired forces a bloom-hot check;
   * canSpot's flash branch covers beyond-view-range open-ground shots), so
   * this slot carries position intel and priority, never gate immunity.
   * Unlike notifyUnderFire this never steals an ENGAGED bot's living target
   * outright — acquireTarget's aggro path (clear personal ray) and the
   * threat-weighted re-rank handle that on the next LOS tick.
   * @param {object} shooterEnt the player TankEntity that fired
   */
  function notifyPlayerFired(shooterEnt) {
    if (!shooterEnt || !shooterEnt.state || !shooterEnt.combat ||
        shooterEnt.combat.destroyed || shooterEnt.team === entity.team) return;
    // REPEAT-OFFENDER COUNT (controls_gunnery r2): shots inside one intel
    // window accumulate; the count resets when the window lapses.
    if (nowS > playerAggroUntilS) playerShotsInWindow = 0;
    playerShotsInWindow += 1;
    playerAggro = shooterEnt;
    playerAggroUntilS = Math.max(playerAggroUntilS, nowS + MUZZLE_INTEL_WINDOW_S);
    lastSeen.x = shooterEnt.state.pos.x;
    lastSeen.z = shooterEnt.state.pos.z;
    lastSeenAtS = nowS;
    if (!target || !enemyAlive(target)) {
      target = shooterEnt;
      acquiredAtS = nowS;
      nonPenCount = 0;
      probeTimer = 0;
      if (mode === 'patrol') mode = 'engage';
    } else if (playerShotsInWindow >= 2 && target !== shooterEnt && !target.isPlayer) {
      // controls_gunnery r2: a player who keeps firing inside one intel
      // window takes the target slot OUTRIGHT — even from an ENGAGED bot and
      // even without personal LOS. r5's design left engaged bots on their
      // allied-bot targets and gated the aggro claim on team visibility, so
      // whole gate battles passed with 30 enemy shells and ZERO aimed at a
      // player firing 5 times from one position. The blocked-ray engage path
      // hard-commits to a vantage in 2 s for player targets (driveEngage),
      // so the claim converts into a firing position instead of idling.
      target = shooterEnt;
      losClear = false; // recomputed on the next LOS tick
      acquiredAtS = nowS;
      nonPenCount = 0;
      probeTimer = 0;
      if (mode === 'patrol' || mode === 'seekCover') mode = 'engage';
    }
  }

  const controller = {
    update,
    setWaypoints,
    notifyShellResult,
    notifyUnderFire,
    notifyPlayerFired,
    /** Headless-probe introspection (controls_gunnery r5): gate snapshot. */
    debugInfo: () => ({
      mode, targetId: target ? target.id : null,
      targetIsPlayer: !!(target && target.isPlayer),
      losBlockedT: +losBlockedT.toFixed(1), hasVantage,
      pressing: nowS < pressUntilS,
      playerShotsInWindow, // r2: repeat-offender aggro count (intel window)
      ..._dbg,
    }),
    state: mode,
  };
  entity.ai = controller;
  return controller;
}
