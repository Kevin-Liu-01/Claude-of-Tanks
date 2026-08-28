/**
 * ai.js — Shared allied/enemy tank AI controller (pure logic, node-runnable).
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

import { Euler, Quaternion, Vector3 } from 'three';
import { computeDispersionRadM } from '../sim/movement.ts';
import { solveBallisticGunLay } from '../sim/ballistics.ts';
import { tankPoseFromState, queryAimArmor } from '../sim/armor.ts';
import { blastRadiusM, estimatePenRatio, isHeClass } from '../sim/damage.ts';
import { terrainTravelCostFactor } from '../sim/terrainMobility.ts';

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
 *                sigma equals baseSigma × aimErrMult.
 *  - trackLagS/leadSigma: persistent human fire-control estimation error. The
 *                barrel visibly follows the estimate; shells are never bent.
 *  - probeLevel: index into PROBE_SETS (easy center-mass, hard weak-spot hunting).
 */
const DIFFICULTY_TIERS = {
  // engageRangeM must exceed the typical spawn-to-spawn LOS distance
  // (~350-450 m on every map) or bots idle outside it while spotted targets
  // trade: r7 raised normal 330→400 and hard 420→500 so a known contact is
  // always worth advancing on at full throttle.
  easy:   { fireFactor: 0.55, reactionS: 1.65, aimErrMult: 5.0, playerSpreadMult: 1.5, probeLevel: 0, engageRangeM: 300, holdRangeM: 180, coverIQ: 0.35, trackLagS: 0.46, leadSigma: 0.34 },
  // Shared-combat r1: normal is the default live battle tier. Faster target
  // confirmation, tighter lays and stronger reload-cover discipline make
  // both allied and enemy bots competent without hard-tier perfect aim.
  normal: { fireFactor: 0.85, reactionS: 1.3, aimErrMult: 4.0, playerSpreadMult: 1.0, probeLevel: 1, engageRangeM: 450, holdRangeM: 260, coverIQ: 0.82, trackLagS: 0.36, leadSigma: 0.28 },
  hard:   { fireFactor: 1.0, reactionS: 0.8, aimErrMult: 2.5, playerSpreadMult: 0.4, probeLevel: 2, engageRangeM: 500, holdRangeM: 300, coverIQ: 1.0, trackLagS: 0.18, leadSigma: 0.16 },
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

/**
 * BATTLE-AI r7 — platform-role doctrine ("good ideas of their tank").
 * Tactical behavior is derived from the bot's OWN mechanical role, never
 * from its public era category or an external assignment:
 *  - scout   (light/IFV): spotting runs, keeps range, never brawls;
 *  - sniper  (TD/SPG):    sightline posts, hold-until-fired, shoot-and-scoot;
 *  - brawler (heavy + slow/armored MBTs): leads pushes, angles the hull,
 *            trades when the enemy gun is cycling;
 *  - flanker (medium + fast MBTs): wide lanes, keeps moving between cover,
 *            support fire on spotted targets.
 * Modern MBTs split by their own mobility numbers: a 66+ km/h hull with
 * 21+ hp/t fights like a medium, the rest anchor like heavies.
 * @param {object} spec TankSpec-like ({ role, topSpeedKmh, enginePowerHp, weightTons })
 * @returns {'scout'|'sniper'|'brawler'|'flanker'}
 */
export function roleOf(spec) {
  const c = spec && spec.role;
  if (c === 'light' || c === 'ifv') return 'scout';
  if (c === 'td' || c === 'spg') return 'sniper';
  if (c === 'heavy') return 'brawler';
  if (c === 'mbt') {
    const pw = (spec.enginePowerHp || 0) / Math.max(1, spec.weightTons || 1);
    return (spec.topSpeedKmh >= 66 && pw >= 21) ? 'flanker' : 'brawler';
  }
  return 'flanker'; // medium + unknown roles
}

/**
 * Role tuning applied over the difficulty tier:
 *  - hold:   holdRangeM multiplier (class engagement band — TDs long,
 *            heavies close), capped under the engage envelope;
 *  - engage: engageRangeM multiplier (snipers commit from further out);
 *  - cover:  coverIQ multiplier (reload discipline — snipers/mediums duck
 *            between shots more, heavies hold the line);
 *  - angle:  hull-angling radians while holding (turreted hulls only —
 *            casemates must keep the bow on the target);
 *  - scootAfter: shots from one position before a TD relocates (0 = never).
 */
const ROLE_TUNE = {
  brawler: { hold: 0.72, engage: 1.0, cover: 0.75, angle: 0.5, scootAfter: 2 },
  flanker: { hold: 1.0, engage: 1.0, cover: 1.15, angle: 0.18, scootAfter: 1 },
  sniper:  { hold: 1.5, engage: 1.15, cover: 1.3, angle: 0, scootAfter: 1 },
  scout:   { hold: 1.15, engage: 1.0, cover: 0.9, angle: 0, scootAfter: 1 },
};
// scout kiting: closer than this to any live opponent → break off and orbit
const SCOUT_KITE_M = 130;
// retreat-toward-support (universal): hp fraction / window / cooldown
const FALLBACK_HP_FRAC = {
  brawler: 0.38,
  flanker: 0.48,
  sniper: 0.52,
  scout: 0.55,
};
const FALLBACK_S = 8;
const FALLBACK_CD_S = 14;
const BURST_RETREAT_FRAC = 0.12;
const BURST_RETREAT_WINDOW_S = 4;

// Shared fire-discipline constants. Both teams run the same controller and
// therefore obey the same corridor, moving-friendly prediction and HE splash
// rules. The authoritative simulation repeats this check immediately before
// spawning a bot shell (state.js), so a stale controller decision cannot hit
// a teammate that crossed the muzzle between AI and fire phases.
const FRIENDLY_CORRIDOR_PAD_M = 1.25;
const FRIENDLY_HE_PAD_M = 1.5;
const FRIENDLY_PREDICT_MAX_S = 1.5;
const FRIENDLY_LANE_RELOCATE_S = 1.2;
const FRIENDLY_SEPARATION_LOOK_M = 26;
const FRIENDLY_SEPARATION_PREDICT_S = 1.8;
const FRIENDLY_STOP_DECEL_MPS2 = 4.0;

const LOS_INTERVAL_S    = 0.14;   // target-acquisition / LOS cadence
const PROBE_INTERVAL_S  = 0.55;   // weak-spot + shell-slot probe cadence
const COVER_INTERVAL_S  = 6.0;    // hull-down re-search cadence
const OBSTACLE_REFRESH_S = 5.0;   // static AABB cache refresh
const TARGET_MEMORY_S   = 5.0;    // chase last-seen position this long after LOS loss
const FLANK_TIMEOUT_S   = 20.0;
const FLANK_ASPECT_RAD  = Math.PI / 3;  // 60° off target nose = flank achieved
const STUCK_TIME_S      = 2.0;
const UNSTICK_TIME_S    = 1.4;
const SLOPE_BLOCK_RECOVERY_S = 0.35;
const TERRAIN_ROUTE_LOOK_M = 28;
const TERRAIN_ROUTE_STEP_M = 4;
const TERRAIN_ROUTE_FAN_RAD = Object.freeze([
  0.42, -0.42, 0.78, -0.78, 1.12, -1.12, 1.48, -1.48,
]);
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
// lives in the sim (spotting.ts muzzle-flash branch resolves it through the
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
// REPEAT-OFFENDER MEMORY (controls_gunnery r4): a player who fires 2+ times
// from one position is a FIXED KNOWN position, and converting a blocked-LOS
// commit at 300-400 m into a firing position is a 30-60 s drive — the 18 s
// base window died mid-reposition and every committed bot reverted to
// patrol (unstaged probe: 3 player shots, all 4 bots back in patrol with
// zero shells returned). Repeat shots escalate the window so the chase
// survives the drive.
const MUZZLE_INTEL_REPEAT_WINDOW_S = 45;
const STALEMATE_SILENT_S = 12;   // no shot fired this long w/ contact → push
const STALEMATE_PUSH_S = 8;      // duration of one forced push window
// RETURN-FIRE LOCK (controls_gunnery r4): three rounds of aggro plumbing
// (r4 sticky slot, r5 muzzle intel + hard-commit) still measured 76 enemy
// shells / 2 aimed at the player / 0 hits across 5 battles. Two remaining
// holes closed here: (1) notifyUnderFire CLOBBERED lastSeen — the shared
// chase point — with the latest ALLIED shooter's position, so every
// "player-committed" bot was actually driving at the player's escorts; and
// (2) nothing ever forced a bot that could ALREADY see the player to convert
// commitment into trigger time ranked above the closer allied brawl. Now
// state.js distance-ranks the shell:fired fan-out, and the nearest ranked
// bots (rank <= PLAYER_LOCK_RANK) with a clear personal ray LOCK the player
// as target outright for PLAYER_LOCK_S — no d² ally bias, no cover roll, no
// memory expiry — refreshed on every subsequent player shot.
const PLAYER_LOCK_S = 9;
const PLAYER_LOCK_RANK = 2;      // the three nearest earshot enemies qualify
// PLAYER PRIORITY BUMP + FIRST-AIMED-SHOT BUDGET (controls_gunnery r6): with
// the player parked FULLY BROADSIDE in the open at 196 m, botPressure showed
// aimedAtPlayer stuck at 0 for 30+ s while the bots put 11 shells into the
// allied brawl — a 100 m bot still out-ranked a 200 m player on d² even with
// playerDistMult. Inside PLAYER_NEAR_BONUS range the player's weighted d² is
// halved again (threat x2), and a per-controller budget guarantees that a
// team-spotted player inside PLAYER_BUDGET range with a clear personal ray is
// CLAIMED as target within PLAYER_ENGAGE_BUDGET_S — WoT bots punish a
// stationary flank at 200 m in seconds, not minutes.
const PLAYER_NEAR_BONUS_D2 = 300 * 300; // priority x2 (d² x0.5) inside 300 m
const PLAYER_ENGAGE_BUDGET_S = 8;       // max s a visible near player goes unclaimed
const PLAYER_BUDGET_D2 = 250 * 250;     // budget applies inside 250 m

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
const _vF = new Vector3();
const _hullEuler = new Euler(0, 0, 0, 'YXZ');
const _hullQuat = new Quaternion();

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

function tankSafetyRadius(ent) {
  if (!ent || !ent.spec) return 2.5;
  const dims = ent.spec.dims || {};
  const hullR = Math.hypot(dims.widthM || 3, dims.lengthM || 6) * 0.38;
  const armorR = ent.spec.armor && ent.spec.armor.boundingRadiusM;
  return Math.max(2.2, hullR, armorR ? armorR * 0.72 : 0);
}

/**
 * Predict whether a bot's intended shot can intersect a living teammate.
 * This is deliberately team-symmetric and pure so both the controller and
 * the authoritative fire path can use exactly the same rule.
 *
 * @param {object} shooter TankEntity-like shooter
 * @param {{x:number,y:number,z:number}} aimPoint intended impact point
 * @param {object} shellSpec gun shell spec
 * @param {object[]} candidates tanks to inspect (all tanks or teammates)
 * @returns {null|{allyId:string,kind:'corridor'|'blast',clearanceM:number}}
 */
export function botFriendlyFireRisk(shooter, aimPoint, shellSpec, candidates) {
  if (!shooter || !shooter.state || !aimPoint || !shellSpec) return null;
  const sp = shooter.state.pos;
  const sx = sp.x, sz = sp.z;
  let dx = aimPoint.x - sx, dz = aimPoint.z - sz;
  const shotLen = Math.hypot(dx, dz);
  if (shotLen < 4) return null;
  dx /= shotLen;
  dz /= shotLen;
  const velocity = Math.max(100, shellSpec.velocityMps || 700);
  const heRadius = isHeClass(shellSpec.type)
    ? blastRadiusM(shellSpec.caliberMm || 0) : 0;
  const list = candidates || [];

  for (let i = 0; i < list.length; i++) {
    const ally = list[i];
    if (!ally || ally === shooter || !ally.state || !ally.spec ||
        (ally.combat && ally.combat.destroyed)) continue;
    if (shooter.team != null && ally.team != null && ally.team !== shooter.team) continue;

    const ap = ally.state.pos;
    const relX = ap.x - sx, relZ = ap.z - sz;
    const initialAlong = relX * dx + relZ * dz;
    const travelS = Math.min(FRIENDLY_PREDICT_MAX_S,
      Math.max(0, initialAlong) / velocity);
    const speed = ally.state.speed || 0;
    const ax = ap.x + Math.sin(ally.state.yaw || 0) * speed * travelS;
    const az = ap.z + Math.cos(ally.state.yaw || 0) * speed * travelS;
    const px = ax - sx, pz = az - sz;
    const along = px * dx + pz * dz;
    const radius = tankSafetyRadius(ally);

    // Ignore tanks behind the muzzle and beyond the intended impact. An ally
    // at the target itself is handled by the blast check below for HE.
    if (along > 2 && along < shotLen - 1) {
      const lateral = Math.abs(px * dz - pz * dx);
      const clearance = lateral - radius;
      if (clearance < FRIENDLY_CORRIDOR_PAD_M) {
        return { allyId: ally.id || '', kind: 'corridor', clearanceM: clearance };
      }
    }

    if (heRadius > 0) {
      const burstD = Math.hypot(ax - aimPoint.x, az - aimPoint.z);
      const clearance = burstD - radius - heRadius;
      if (clearance < FRIENDLY_HE_PAD_M) {
        return { allyId: ally.id || '', kind: 'blast', clearanceM: clearance };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Controller factory
// ---------------------------------------------------------------------------

/**
 * Create the shared AI controller for one non-player tank on either team.
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
 *   concealment sim (src/sim/spotting.ts): tanks the AI's team has not
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
  const hfRaw = deps.heightField;
  // perf-r3b: AI terrain probes (cover eval, hull-down checks, LOS eyelines)
  // are pure reads that never seat geometry — serve them from the baked 1 m
  // grid when the heightfield provides one (headless fixtures don't).
  // Prototype delegation (NOT a spread): the live proxy's getters must keep
  // resolving against the active world.
  const hf = typeof hfRaw.getHeightAtFast === 'function'
    ? Object.create(hfRaw, { getHeightAt: { value: (x, z) => hfRaw.getHeightAtFast(x, z) } })
    : hfRaw;
  // SPOTTING WIRING: optional concealment gate (absent in headless fixtures)
  const spotting = deps.spotting && typeof deps.spotting.isSpotted === 'function'
    ? deps.spotting : null;
  // camo_spotting r2: the under-fire/muzzle-intel windows NO LONGER bypass
  // the concealment formula. Fire reveal now resolves INSIDE the spotting sim
  // (spotting.ts: notifyFired pulls the shooter's next check in, and the
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
  // BATTLE-AI r7 doctrine wiring (see roleOf/ROLE_TUNE above).
  const role = roleOf(spec);
  const tune = ROLE_TUNE[role];
  // Casemate: the gun aims with the HULL (movement.ts §7 auto hull-traverse)
  // — angling would swing the gun off target, so casemates always face in.
  const casemate = spec.gunArcDeg != null && spec.gunArcDeg <= 30;
  // r7: the spec's REAL HE-class slot (not a blind index 2 — the sturmtiger
  // carries [HE, HEAT] and `shells[2]` crashed tryFire; probed by class so
  // splash fallbacks and the no-pen fire gate work on every magazine).
  let heSlot = spec.gun.shells.length - 1;
  for (let i = 0; i < spec.gun.shells.length; i++) {
    if (spec.gun.shells[i] && isHeClass(spec.gun.shells[i].type)) { heSlot = i; break; }
  }
  const angleRad = casemate ? 0 : tune.angle;
  const roleEngageR = () => tier.engageRangeM * tune.engage;
  const roleHoldR = () =>
    Math.min(tier.holdRangeM * tune.hold, roleEngageR() - 60);
  const getAllies = typeof deps.getAllies === 'function' ? deps.getAllies : null;
  const selfEyeM = spec.dims.heightM * EYE_FRAC;
  // A real match opens with a deployment/read phase, not both teams driving
  // straight into an immediate DPM check.  Roles release progressively:
  // scouts establish first contact, then flankers, line tanks, and finally
  // overwatch.  Close contacts still trigger a fight, and return-fire/aggro
  // paths intentionally bypass this gate, so this is tactics rather than an
  // invulnerability timer.
  const deploymentUntilS = role === 'scout' ? 120
    : role === 'flanker' ? 135
      : role === 'brawler' ? 150 : 165;
  const deploymentEngageM = role === 'scout' ? 100
    : role === 'flanker' ? 95
      : role === 'brawler' ? 90 : 85;
  // Gun trunnion height above ground contact — the movement sim aims the
  // barrel from here (movement.ts gunPivotHeight), so the alignment gate must
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
  let loopWaypoints = true;

  const moveTarget = { x: 0, z: 0 };         // hull-down / approach point
  let hasMoveTarget = false;
  // LOS vantage seek: when the bot KNOWS where the enemy is (team intel)
  // but its own ray is blocked for a while, beelining lastSeen just parks
  // it against the blocking building. Sample a ring of candidate positions
  // around lastSeen and drive to the nearest one with a clear sightline.
  const vantage = { x: 0, z: 0 };
  let hasVantage = false;
  let losBlockedT = 0;
  // r7 UNREACHABLE-VANTAGE VETO: a vantage the nav layer failed to reach
  // (wedge strikes) is blacklisted for 20 s — the deterministic ring search
  // otherwise re-picks the exact same cell and the bot loops {pick, wedge,
  // drop, re-pick} for half a minute (winter is1 trace: 29 s at one wall).
  const vantageVeto = [
    { x: 0, z: 0, untilS: -1 }, { x: 0, z: 0, untilS: -1 },
    { x: 0, z: 0, untilS: -1 }, { x: 0, z: 0, untilS: -1 },
  ];
  let vantageVetoIdx = 0;
  function vetoVantage() {
    const v = vantageVeto[vantageVetoIdx];
    v.x = vantage.x;
    v.z = vantage.z;
    v.untilS = nowS + 20;
    vantageVetoIdx = (vantageVetoIdx + 1) % vantageVeto.length;
  }
  function vantageVetoed(cx, cz) {
    for (let i = 0; i < vantageVeto.length; i++) {
      const v = vantageVeto[i];
      if (nowS < v.untilS && Math.hypot(v.x - cx, v.z - cz) < 15) return true;
    }
    return false;
  }
  // controls_gunnery r3 (§7 return-fire watchdog): battles with 5-6 landed
  // player shots drew ZERO enemy shells aimed back — idle bots without
  // personal LOS never rotate into engagement. If this long passes with a
  // spotted opposing tank inside engage range and no target committed,
  // force-commit to the nearest spotted enemy and let the vantage-seek
  // machinery drive toward a firing position.
  const ENGAGE_WATCHDOG_S = 15;
  let lastEngagedS = 0;
  // r6: last sim time this controller HELD the player as target (stamped per
  // update tick) — arms the FIRST-AIMED-SHOT BUDGET claim in acquireTarget.
  let lastPlayerEngageS = 0;
  const coverPoint = { x: 0, z: 0 };
  let hasCoverPoint = false;
  let coverRollPassed = false;               // coverIQ roll for the current reload cycle
  let coverRolled = false;

  const flankPoints = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
  let flankIndex = 0;
  let flankUntilS = 0;
  let nonPenCount = 0;
  // ---- BATTLE-AI r7 doctrine state ----
  const angleSide = rng() < 0.5 ? 1 : -1; // stable hull-angling side per bot
  // sniper shoot-and-scoot: shots fired from the current position; after
  // ROLE_TUNE.scootAfter the TD relocates to a fresh sightline 40-85 m away.
  const spotPos = { x: entity.state.pos.x, z: entity.state.pos.z };
  let shotsFromSpot = 0;
  const scootPoint = { x: 0, z: 0 };
  let scootUntilS = -1;
  let relocations = 0;   // probe-visible shoot-and-scoot counter
  let prevReloadT = 0;   // reload-edge watch (a jump up = a shot left the gun)
  // universal retreat-toward-support (tracked/low): time-boxed reverse window
  const fallbackPoint = { x: 0, z: 0 };
  let fallbackUntilS = -1;
  let fallbackCdS = -1;
  let fallbackReverse = true;
  let lastHp = entity.combat && entity.combat.hp != null ? entity.combat.hp : 0;
  let burstDamage = 0;
  let burstDamageUntilS = -1;
  // scout kite/orbit: keep moving between cover, never brawl
  const kitePoint = { x: 0, z: 0 };
  let kiteUntilS = -1;
  let orbitSide = rng() < 0.5 ? 1 : -1;
  let orbitFlipS = 0;
  // no-suicide guard bookkeeping (see outnumberedSolo)
  let guardT = 0;
  let guardLastS = -1;
  let guardReleaseUntilS = -1;
  // hull-down stare-down breaker (see runProbes miss branch)
  let probeMiss = false;
  let probeMissT = 0;
  // geometry-hard blocked commit → follow the authored lane a while
  let laneFallbackUntilS = -1;
  // starved trigger + clear ray → forced clean halt (settled-shot window)
  let settleUntilS = -1;
  let settleStreak = 0;
  let settleCdUntilS = -1;
  // A friendly holding the shell corridor is a maneuver problem, not a reason
  // to shoot through them or stare forever. Sustained blocks trigger a short
  // lateral firing-lane relocation shared by both teams.
  let friendlyBlockT = 0;
  let friendlyBlockCount = 0;
  let friendlyLaneMoves = 0;
  let lastFriendlyRisk = null;
  let underFire = null;            // shooter entity revealed by hitting us/a teammate
  let underFireUntilS = -Infinity; // reaction window end (sim seconds)
  let playerAggro = null;          // sticky PLAYER attacker-of-record (r4)
  let playerAggroUntilS = -Infinity;
  let playerShotsInWindow = 0;     // player shots inside the live intel window (r2)
  let playerLockUntilS = -Infinity; // RETURN-FIRE LOCK window (r4, see tuning)
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
  let targetTrackLagS = 0;
  let targetLeadScale = 1;
  // Blind-fire spread (camo_spotting r5) — see resampleAimError.
  let blindYawRad = 0;
  let blindPitchRad = 0;
  let playerYawRad = 0;
  let playerPitchRad = 0;

  // Timers (count down with dt).
  let losTimer = rng() * LOS_INTERVAL_S;     // stagger AI work across ticks
  let probeTimer = rng() * PROBE_INTERVAL_S;
  let coverTimer = 0;
  let errTimer = 0;
  let obstacleTimer = 0;

  // Formation deconfliction is a movement authority, not a cosmetic steer
  // nudge. It survives route/unstick logic and is exposed to headless soaks.
  let allyYielding = false;
  let allyAvoidingId = null;
  let allyClosestM = Infinity;
  let allyYieldT = 0;
  let allyDeadlockT = 0;
  let allyEmergencyActive = false;
  let allyEmergencyStops = 0;
  let allyReverseEscapes = 0;

  // Stuck / gun-limit recovery.
  let lowSpeedT = 0;
  let slopeBlockT = 0;
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
  let freeMoveT = 0;    // r7: sustained-free-movement clock (strike clearing)
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
  // BATTLE-AI r7: role-scaled — snipers/flankers duck between shots more
  // (reload discipline), brawlers hold the line they pushed.
  const effCoverIQ = () => (nowS < pressUntilS
    ? 0
    : clamp(tier.coverIQ * tune.cover, 0, 1) * clamp(1.15 - nowS / 240, 0.35, 1));

  const scanPhase = rng() * TAU;             // idle turret sweep phase
  // r4: per-controller vantage fan bias — clustered bots hunting the same
  // contact used to fan identical bearings, converge on one candidate and
  // wedge against each other at full throttle (probe: thr=1.0, spd=0.1).
  const vantageBias = (rng() - 0.5) * 0.9;
  let obstacles = deps.getObstacles();
  const nearbyObstacles = [];
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
    targetTrackLagS = Math.max(0.02,
      tier.trackLagS * (0.72 + rng() * 0.56));
    targetLeadScale = clamp(1 + gauss(rng) * tier.leadSigma, 0.55, 1.35);
    // camo_spotting r5: blind-fire spread — shelling a REMEMBERED muzzle
    // position is area fire, not a lay on a seen hull. Sampled separately
    // (additive with the tier error) because the hard tier's aimErrMult of
    // 1.0 makes the tier sigma exactly zero; ~10 mrad yaw / 6 mrad pitch
    // puts a 2.5 m sigma on a 250 m blind shot — real suppression, not a
    // laser.
    blindYawRad = gauss(rng) * 0.010;
    blindPitchRad = gauss(rng) * 0.006;
    playerYawRad = gauss(rng) * 0.0045;
    playerPitchRad = gauss(rng) * 0.0030;
    // Hold one imperfect estimate long enough to read as a human correction,
    // not per-frame aim jitter or omniscient tracking.
    errTimer = 1.8 + rng() * 1.25;
  }

  function aliveEnemies() {
    const list = deps.getEnemies();
    return list; // filtered inline at use sites to avoid allocation
  }

  function enemyAlive(e) {
    return e && e !== entity && (!e.combat || !e.combat.destroyed);
  }

  const focusCounts = new Map();
  function refreshFocusCounts() {
    focusCounts.clear();
    if (!getAllies) return;
    const friends = getAllies();
    for (let i = 0; i < friends.length; i++) {
      const ctl = friends[i] && friends[i].aiCtl;
      const id = ctl && ctl.targetId;
      if (id) focusCounts.set(id, (focusCounts.get(id) || 0) + 1);
    }
  }

  // Fire-team allocation: one ally already laying on a target is a signal to
  // cover the other lane, not to dog-pile the same hull. This removes the
  // two-volley snowball that ended small-team matches in under two minutes.
  // A bot still returns fire immediately and can finish its own target.
  function focusWeight(e) {
    if (!e) return 1;
    const focus = focusCounts.get(e.id) || 0;
    // The player remains a high-priority threat, but ordinary visibility may
    // assign only one default attacker. Extra bots join when the player fires
    // or damages the team through the return-fire paths above.
    if (e.isPlayer && focus === 1) return 4.5;
    if (e.isPlayer && focus >= 2) return 8;
    if (focus === 1) return 1.35;
    if (focus === 2) return 1.7;
    if (focus === 3) return 2.05;
    if (focus >= 4) return 2.4;
    return 1;
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
    refreshFocusCounts();
    const ex = st.pos.x, ey = st.pos.y + selfEyeM, ez = st.pos.z;

    // RETURN-FIRE LOCK (controls_gunnery r4): a live lock — or a live
    // REPEAT-OFFENDER window (2+ muzzle flashes from one position: the bots
    // know exactly which bush) — pins the player as the target OUTRIGHT: no
    // ally-proximity re-rank, no cover roll, no 5 s memory expiry, and
    // losClear comes from the RAW personal ray, not vis && ray. The
    // vis-gated losClear was the last dead end in three rounds of aggro
    // plumbing: a static sniper's fire bloom decays in seconds, so by the
    // time a committed bot finished its 30-60 s reposition the player was
    // formally unspotted again and gunReady stayed false forever at a
    // geometrically clear 250 m ray (r4 unstaged probe). Scope-limited to
    // the self-revealed repeat offender + time-boxed windows, per the r2
    // hardClaim precedent — a one-shot ambusher stays camo-protected.
    if (playerAggro && enemyAlive(playerAggro) &&
        (timeS < playerLockUntilS ||
         (playerShotsInWindow >= 2 && timeS < playerAggroUntilS))) {
      const pp = playerAggro.state.pos;
      if (target !== playerAggro) {
        target = playerAggro;
        acquiredAtS = timeS;
        nonPenCount = 0;
        probeTimer = 0;
      }
      losClear = hasLos(ex, ey, ez, pp.x, eyeY(playerAggro), pp.z);
      // camo_spotting r5: chase intel only tracks the LIVE position while
      // the spotting sim actually shows the player. The old `losClear ||`
      // arm streamed exact coordinates of a formally UNSPOTTED player
      // through a raw geometric ray (vegetation is transparent to it) —
      // the "precisely-aimed return fire through the bush" leak. While
      // hidden, lastSeen stays at the muzzle position notifyPlayerFired
      // stamped (refreshed per shot) and aimAndFire's blind-lock path
      // shells that point with blind-fire spread instead.
      if (isVisibleToTeam(playerAggro)) {
        lastSeen.x = pp.x; lastSeen.z = pp.z;
        lastSeenAtS = timeS;
      }
      return;
    }

    // FIRST-AIMED-SHOT BUDGET (controls_gunnery r6, critic major #2): a
    // team-spotted player inside 250 m with a clear personal ray is claimed
    // as the target whenever no player-lay has been held for
    // PLAYER_ENGAGE_BUDGET_S — measured live before the fix: a stationary
    // broadside Abrams at 196 m drew zero aimed shells for 30+ s while the
    // bots farmed the allied brawl. The update() stamp re-arms the budget
    // while the player IS the target, so bots alternate between the human
    // and the escorts instead of permanently tunneling either. No wallhack:
    // spotting gate + personal ray both still required.
    if ((!target || !target.isPlayer) &&
        timeS - lastPlayerEngageS > PLAYER_ENGAGE_BUDGET_S) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p || !p.isPlayer) continue;
        if (!enemyAlive(p) || !isVisibleToTeam(p)) break;
        if ((focusCounts.get(p.id) || 0) >= 1) break;
        const pp = p.state.pos;
        const bdx = pp.x - ex, bdz = pp.z - ez;
        const budgetD2 = timeS < deploymentUntilS
          ? Math.min(PLAYER_BUDGET_D2, deploymentEngageM * deploymentEngageM)
          : PLAYER_BUDGET_D2;
        if (bdx * bdx + bdz * bdz > budgetD2) break;
        if (!hasLos(ex, ey, ez, pp.x, eyeY(p), pp.z)) break;
        target = p;
        losClear = true;
        acquiredAtS = timeS;
        lastSeenAtS = timeS;
        lastSeen.x = pp.x; lastSeen.z = pp.z;
        nonPenCount = 0;
        probeTimer = 0;
        return;
      }
    }

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
        // camo_spotting r5: only a SEEN shooter's live position stamps the
        // chase intel — a hardClaim (formally unspotted repeat offender)
        // keeps the muzzle position notifyPlayerFired recorded at the shot.
        if (seen) {
          lastSeenAtS = timeS;
          lastSeen.x = up.x; lastSeen.z = up.z;
        }
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
          if ((focusCounts.get(p.id) || 0) >= 1) continue;
          const pp = p.state.pos;
          const pdx = pp.x - ex, pdz = pp.z - ez;
          const cdx = tp.x - ex, cdz = tp.z - ez;
          const pd2 = pdx * pdx + pdz * pdz;
          const pEff = pd2 * playerDistMult *
            (pd2 < PLAYER_NEAR_BONUS_D2 ? 0.5 : 1); // r6 near bump
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
      // BATTLE-AI r7 (focus low-HP): on the LOS cadence a healthy current
      // target is dropped for a nearly-dead visible enemy at comparable
      // range — securing the kill beats farming a fresh hull. Player targets
      // are never abandoned this way (the r4-r6 pressure plumbing owns that
      // slot), and the 0.4/0.25 hysteresis keeps the switch from flapping.
      if (!target.isPlayer && losClear && target.combat && target.combat.maxHp &&
          target.state && target.combat.hp / target.combat.maxHp > 0.4) {
        const cdx = target.state.pos.x - ex, cdz = target.state.pos.z - ez;
        const curD2 = cdx * cdx + cdz * cdz;
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!e || e === target || !enemyAlive(e) || e.isPlayer) continue;
          if (!e.combat || !e.combat.maxHp ||
              e.combat.hp / e.combat.maxHp >= 0.25) continue;
          if ((focusCounts.get(e.id) || 0) >= 1) continue;
          if (!isVisibleToTeam(e)) continue;
          const kp = e.state.pos;
          const kdx = kp.x - ex, kdz = kp.z - ez;
          if (kdx * kdx + kdz * kdz > curD2 * 1.3) continue;
          if (!hasLos(ex, ey, ez, kp.x, eyeY(e), kp.z)) continue;
          target = e;
          losClear = true;
          acquiredAtS = timeS;
          lastSeenAtS = timeS;
          lastSeen.x = kp.x; lastSeen.z = kp.z;
          nonPenCount = 0;
          probeTimer = 0;
          return;
        }
      }
      // r4: a PLAYER attacker-of-record survives the 5 s spot-memory for the
      // whole aggro window — the commitment has POSITION intel (the muzzle
      // flash), and dropping it mid-reposition is why three rounds of aggro
      // plumbing still measured zero conversions. lastSeen intentionally
      // stays at the muzzle position (not live-tracked) while unspotted.
      if (timeS - lastSeenAtS <= TARGET_MEMORY_S ||
          (target === playerAggro && timeS < playerAggroUntilS)) return;
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
      if (timeS < deploymentUntilS && d2 > deploymentEngageM * deploymentEngageM) continue;
      // Threat weighting: the player ranks as if 0.59x its true distance
      // (0.35x for the playerHunter fraction — controls_gunnery r4).
      // r6 PRIORITY BUMP: inside 300 m the player counts DOUBLE threat
      // (weighted d² halved) — a broadside human at 200 m now outranks a
      // 100 m allied bot for every controller, not just the hunters.
      // BATTLE-AI r7 (focus low-HP): a nearly-dead target ranks as if ~26%
      // closer (weighted d² down to 0.55x at 0 hp) — WoT bots finish kills.
      const hpW = e.combat && e.combat.maxHp
        ? 0.55 + 0.45 * Math.max(0, e.combat.hp / e.combat.maxHp)
        : 1;
      const eff = ((e.isPlayer
        ? d2 * playerDistMult * (d2 < PLAYER_NEAR_BONUS_D2 ? 0.5 : 1)
        : d2) * hpW) * focusWeight(e);
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
      // controls_gunnery r3 (§7): engagement watchdog — force-commit to the
      // nearest SPOTTED enemy in engage range after ENGAGE_WATCHDOG_S of no
      // target (no personal-LOS gate; losBlockedT primes the r5 hard-commit
      // vantage path so the bot drives to a firing position).
      if (timeS - lastEngagedS > ENGAGE_WATCHDOG_S) {
        let near = null, nearD2 = Infinity;
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!enemyAlive(e) || !isVisibleToTeam(e)) continue;
          const tp2 = e.state.pos;
          const ndx = tp2.x - ex, ndz = tp2.z - ez;
          const d2 = ndx * ndx + ndz * ndz;
          if (d2 < nearD2) { near = e; nearD2 = d2; }
        }
        const wr = timeS < deploymentUntilS ? deploymentEngageM : roleEngageR();
        if (near && nearD2 < wr * wr) {
          target = near;
          acquiredAtS = timeS;
          lastSeenAtS = timeS;
          lastSeen.x = near.state.pos.x; lastSeen.z = near.state.pos.z;
          losBlockedT = Math.max(losBlockedT, 5); // vantage seek NOW
          nonPenCount = 0;
          probeTimer = 0;
        }
      }
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
      aimHFrac = 0.5; aimLatFrac = 0; chosenSlot = heSlot;
      cachedPenRatio = bestRatio; penGateOk = false;
    } else {
      // All probes missed the hull — the target is HULL-DOWN (only the
      // turret crests the fold; the eye-line LOS passes while every hull
      // zone probe hits terrain). BATTLE-AI r7: shoot at what IS visible —
      // lob HE at the turret line (no pen gate) instead of holding fire in
      // a mutual 380 m stare-down (steppe probe: ready+aligned bots parked
      // silent for 60+ s exactly here). driveEngage escalates to a better
      // firing angle when the probes stay blind (probeMissT).
      aimHFrac = 0.82; aimLatFrac = 0; chosenSlot = heSlot;
      cachedPenRatio = 0; penGateOk = false;
      probeMiss = true;
      return;
    }
    probeMiss = false;
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
    // r4: NEAR-SELF fan first — a firing position 35-100 m from the BOT
    // (fanned toward the contact, so no 180-degree pivots) converts a
    // blocked commit in seconds. The old lastSeen-ring-only search demanded
    // a 200-350 m cross-map drive that stall-prone navigation never
    // finished: the r4 unstaged probe showed committed bots pivoting at
    // spd=0 for 60+ s, blkT ever-growing, zero conversions.
    const bearing = Math.atan2(lastSeen.x - st.pos.x, lastSeen.z - st.pos.z) + vantageBias;
    // r7: a long-blocked commit widens the fan — inside towns / steppe folds
    // every 35-100 m candidate can be wall-shadowed while a 150 m one clears.
    for (const r of (losBlockedT > 10 ? [35, 65, 100, 150] : [35, 65, 100])) {
      for (let k = -3; k <= 3; k++) {
        const a = bearing + k * 0.35;
        const cx = st.pos.x + Math.sin(a) * r;
        const cz = st.pos.z + Math.cos(a) * r;
        if (vantageVetoed(cx, cz)) continue; // r7: nav-proven unreachable
        const cy = hf.getHeightAt(cx, cz) + selfEyeM;
        if (!hasLos(cx, cy, cz, lastSeen.x, ty, lastSeen.z)) continue;
        const dx = cx - st.pos.x, dz = cz - st.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; vantage.x = cx; vantage.z = cz; found = true; }
      }
      if (found) return true;
    }
    const a0 = rng() * TAU;
    for (const r of [70, 110]) {
      for (let k = 0; k < 8; k++) {
        const a = a0 + (k / 8) * TAU;
        const cx = lastSeen.x + Math.sin(a) * r;
        const cz = lastSeen.z + Math.cos(a) * r;
        if (vantageVetoed(cx, cz)) continue; // r7: nav-proven unreachable
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
    const candidates = deps.queryObstacles
      ? deps.queryObstacles(px - margin, pz - margin, px + margin, pz + margin, nearbyObstacles)
      : obstacles;
    for (let i = 0; i < candidates.length; i++) {
      const o = candidates[i];
      if (o.crushed) continue; // gameplay_feel r6: felled crushables don't block
      if (px < o.min[0] - margin || px > o.max[0] + margin) continue;
      if (pz < o.min[2] - margin || pz > o.max[2] + margin) continue;
      // BATTLE-AI r7: a CRUSHABLE in the lane is driven THROUGH, not around —
      // and with authority. The old ×0.6 damping (and the ease-in) parked
      // bots at 0.4 throttle against saplings forever, just under the
      // held-press crush threshold (coastal trace: spawn-exit wedge, 30 s at
      // spd 0). WoT hulls flatten small trees on the move.
      if (o.crushable) {
        if (input.throttle > 0.05) input.throttle = Math.max(input.throttle, 0.7);
        continue;
      }
      const cx = (o.min[0] + o.max[0]) * 0.5 - st.pos.x;
      const cz = (o.min[2] + o.max[2]) * 0.5 - st.pos.z;
      const crossY = fz * cx - fx * cz;          // >0 → obstacle to the right
      input.steer = clamp(input.steer - Math.sign(crossY || 1) * 1.0, -1, 1);
      input.throttle *= 0.6;
      return;
    }
  }

  /**
   * Formation separation with deterministic right-of-way. It predicts
   * crossing traffic, gives a following tank responsibility for the gap,
   * makes one tank yield in head-on/crossing deadlocks, and performs a short
   * reverse escape only after both hulls have settled. The final guard runs
   * after stuck recovery so an unstick burst can never drive through an ally.
   */
  function avoidAllies(input, dt) {
    if (!getAllies || Math.abs(input.throttle) <= 0.05) {
      allyYieldT = Math.max(0, allyYieldT - dt * 2);
      allyDeadlockT = Math.max(0, allyDeadlockT - dt * 2);
      allyEmergencyActive = false;
      return;
    }
    const st = entity.state;
    const motionSign = input.throttle >= 0 ? 1 : -1;
    const fx = Math.sin(st.yaw) * motionSign;
    const fz = Math.cos(st.yaw) * motionSign;
    const speed = Math.abs(st.speed || 0);
    const stoppingM = speed * speed / (2 * FRIENDLY_STOP_DECEL_MPS2);
    const look = FRIENDLY_SEPARATION_LOOK_M + stoppingM + speed * 0.8;
    const friends = getAllies();
    const ownR = tankSafetyRadius(entity) * 0.74;
    const ownHalfL = (spec.dims.hullLengthM || spec.dims.lengthM || 6) * 0.5;
    const ownHalfW = (spec.dims.widthM || 3) * 0.5;
    let best = null;
    let bestScore = Infinity;
    let bestAlong = 0;
    let bestCross = 0;
    let bestDistance = Infinity;
    let bestLongSafe = 0;
    let bestHeadingDot = 1;
    let bestPredCross = 0;
    for (let i = 0; i < friends.length; i++) {
      const ally = friends[i];
      if (!ally || !ally.state || (ally.combat && ally.combat.destroyed)) continue;
      const rx = ally.state.pos.x - st.pos.x;
      const rz = ally.state.pos.z - st.pos.z;
      const distance = Math.hypot(rx, rz);
      if (distance >= look) continue;
      const along = rx * fx + rz * fz;
      const cross = fz * rx - fx * rz; // >0 = teammate to hull-right
      const allyFx = Math.sin(ally.state.yaw);
      const allyFz = Math.cos(ally.state.yaw);
      const allyMotionSign = (ally.state.speed || 0) < -0.2 ? -1 : 1;
      const headingDot = fx * allyFx * allyMotionSign + fz * allyFz * allyMotionSign;
      const allyVx = allyFx * (ally.state.speed || 0);
      const allyVz = allyFz * (ally.state.speed || 0);
      const selfVx = Math.sin(st.yaw) * (st.speed || 0);
      const selfVz = Math.cos(st.yaw) * (st.speed || 0);
      const rvx = allyVx - selfVx;
      const rvz = allyVz - selfVz;
      const rv2 = rvx * rvx + rvz * rvz;
      const closestT = rv2 > 0.01
        ? clamp(-(rx * rvx + rz * rvz) / rv2, 0, FRIENDLY_SEPARATION_PREDICT_S)
        : 0;
      const predX = rx + rvx * closestT;
      const predZ = rz + rvz * closestT;
      const predAlong = predX * fx + predZ * fz;
      const predCross = fz * predX - fx * predZ;
      const allyHalfL = ((ally.spec?.dims?.hullLengthM || ally.spec?.dims?.lengthM || 6) * 0.5);
      const allyHalfW = (ally.spec?.dims?.widthM || 3) * 0.5;
      const longSafe = ownHalfL + allyHalfL + 2.2;
      const laneSafe = ownHalfW + allyHalfW + 1.6;
      const radialSafe = ownR + tankSafetyRadius(ally) * 0.74 + 1.4;
      const aheadRisk = along > -1 && along < look && Math.abs(cross) < laneSafe;
      const crossingRisk = closestT > 0 && predAlong > -longSafe &&
        Math.hypot(predX, predZ) < radialSafe;
      if (!aheadRisk && !crossingRisk) continue;
      const score = Math.min(
        aheadRisk ? Math.max(0, along) : Infinity,
        crossingRisk ? Math.hypot(predX, predZ) + closestT * 2 : Infinity,
      );
      if (score >= bestScore) continue;
      best = ally;
      bestScore = score;
      bestAlong = along;
      bestCross = cross;
      bestDistance = distance;
      bestLongSafe = longSafe;
      bestHeadingDot = headingDot;
      bestPredCross = predCross;
    }
    if (!best) {
      allyYieldT = Math.max(0, allyYieldT - dt * 2);
      allyDeadlockT = Math.max(0, allyDeadlockT - dt * 2);
      allyEmergencyActive = false;
      return;
    }

    allyAvoidingId = best.id;
    allyClosestM = bestDistance;
    const following = bestHeadingDot > 0.55 && bestAlong > 0;
    const headOn = bestHeadingDot < -0.25;
    const hasPriority = String(entity.id) < String(best.id);
    const mustYield = following || !hasPriority;
    allyYielding = mustYield;
    if (mustYield) allyYieldT += dt;
    else allyYieldT = Math.max(0, allyYieldT - dt);

    // Both head-on hulls take their own right; otherwise split a perfectly
    // centered convoy by stable entity id and move away from the crossing.
    const side = headOn ? 1 : Math.sign(
      (Math.abs(bestPredCross) > 0.2 ? -bestPredCross : -bestCross) ||
      (hasPriority ? -1 : 1));
    input.steer = clamp(input.steer + side * (headOn ? 1.0 : 0.9), -1, 1);

    const longitudinalGap = bestAlong - bestLongSafe;
    const emergency = bestDistance < ownR + tankSafetyRadius(best) * 0.74 + 0.55 ||
      (bestAlong > 0 && longitudinalGap < 0.8);
    const closing = Math.max(0,
      speed - Math.max(0, Math.abs(best.state.speed || 0) * bestHeadingDot));
    if (emergency) {
      if (!allyEmergencyActive) allyEmergencyStops++;
      allyEmergencyActive = true;
      input.throttle = 0;
      input.brake = speed > 0.45;
      allyDeadlockT += speed < 0.7 ? dt : 0;
      // The yielding hull backs out only after settling, and only if its aft
      // corridor is clear. This resolves nose-to-nose doorways without the
      // generic stuck recovery randomly reversing into a third teammate.
      if (mustYield && allyDeadlockT > 0.9 && speed < 0.45) {
        const backFx = -Math.sin(st.yaw), backFz = -Math.cos(st.yaw);
        let aftClear = true;
        for (let i = 0; i < friends.length; i++) {
          const other = friends[i];
          if (!other || other === best || !other.state || (other.combat && other.combat.destroyed)) continue;
          const arx = other.state.pos.x - st.pos.x;
          const arz = other.state.pos.z - st.pos.z;
          const aAlong = arx * backFx + arz * backFz;
          const aCross = backFz * arx - backFx * arz;
          if (aAlong > 0 && aAlong < 10 && Math.abs(aCross) < ownHalfW + 2.4) {
            aftClear = false;
            break;
          }
        }
        if (aftClear) {
          input.throttle = -0.42;
          input.brake = false;
          allyReverseEscapes++;
          allyDeadlockT = 0;
        }
      }
      return;
    }

    allyEmergencyActive = false;
    allyDeadlockT = Math.max(0, allyDeadlockT - dt * 2);
    const stopBuffer = stoppingM + bestLongSafe;
    let cap = bestAlong < stopBuffer ? 0.1
      : bestAlong < stopBuffer + 8 ? 0.32 : 0.58;
    if (!mustYield) cap = Math.max(cap, 0.38);
    if (mustYield && bestAlong > 0 && bestAlong < stopBuffer && speed > 1.5) {
      input.throttle = 0;
      input.brake = true;
      return;
    }
    if (motionSign > 0) {
      input.throttle = Math.min(input.throttle,
        Math.max(0.06, cap - closing * 0.035));
    } else {
      input.throttle = Math.max(input.throttle, -Math.max(0.08, cap * 0.7));
    }
  }

  // BATTLE-AI r7 CORNER-HOP ROUTER: reactive avoidance + unstick could not
  // navigate the urban block grid — the r7 flow probe measured BOTH teams
  // wedged against building faces for 30-90 s (losBlockedT 45 s, strikes
  // cycling, ~1 m/10 s displacement) because every drive helper steered at a
  // goal BEHIND a 60 m rect it could only graze along. When the straight
  // segment to the goal crosses a solid obstacle AABB within ROUTE_LOOK_M,
  // steer for the cheapest expanded-box corner first (one hop; the recheck
  // cadence chains hops around consecutive blocks). Crushables are ignored —
  // hulls drive through those. Plans are cached ROUTE_RECHECK_S so the cost
  // is a few hundred slab tests per bot every ~0.6 s, not per tick.
  const ROUTE_RECHECK_S = 0.6;
  const ROUTE_LOOK_M = 85;
  const routeCorner = { x: 0, z: 0 };
  let routeActive = false;
  let routeTimer = 0;
  let routeGoalX = 1e9;
  let routeGoalZ = 1e9;
  let terrainRouteUntilS = -1;
  // a corner just reached is vetoed briefly so the replan hops to the NEXT
  // corner along the box instead of re-offering the same cell (the crawl
  // loop the autumn rock-cluster trace measured)
  const lastCorner = { x: 1e9, z: 1e9, untilS: -1 };
  function terrainLineCost(sx, sz, startH, ux, uz) {
    let previousH = startH;
    let worstCost = 1;
    const debuff = entity.state._debuff;
    const powerMult = debuff?.powerMult ?? 1;
    const accelMult = debuff?.accelMult ?? 1;
    for (let distance = TERRAIN_ROUTE_STEP_M;
      distance <= TERRAIN_ROUTE_LOOK_M; distance += TERRAIN_ROUTE_STEP_M) {
      const x = sx + ux * distance;
      const z = sz + uz * distance;
      const height = hf.getHeightAt(x, z);
      const rise = (height - previousH) / TERRAIN_ROUTE_STEP_M;
      const ground = typeof hf.getGroundType === 'function'
        ? hf.getGroundType(x, z)
        : 'medium';
      const cost = terrainTravelCostFactor(
        spec, ground, rise, powerMult, accelMult,
      );
      if (!Number.isFinite(cost)) return Infinity;
      if (cost > worstCost) worstCost = cost;
      previousH = height;
    }
    return worstCost;
  }

  function planTerrainRoute(sx, sz, dirx, dirz, goalX, goalZ) {
    const startH = hf.getHeightAt(sx, sz);
    if (Number.isFinite(terrainLineCost(sx, sz, startH, dirx, dirz))) {
      return false;
    }

    let bestScore = Infinity;
    let bestX = 0;
    let bestZ = 0;
    for (let index = 0; index < TERRAIN_ROUTE_FAN_RAD.length; index++) {
      const angle = TERRAIN_ROUTE_FAN_RAD[index];
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const ux = dirx * c + dirz * s;
      const uz = -dirx * s + dirz * c;
      const terrainCost = terrainLineCost(sx, sz, startH, ux, uz);
      if (!Number.isFinite(terrainCost)) continue;
      const cx = sx + ux * TERRAIN_ROUTE_LOOK_M;
      const cz = sz + uz * TERRAIN_ROUTE_LOOK_M;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 480) continue;
      const side = Math.sign(angle) || 1;
      const score = Math.hypot(goalX - cx, goalZ - cz) + (terrainCost - 1) * 7 +
        Math.abs(angle) * 5 + (side === detourSide ? 0 : 8);
      if (score < bestScore) {
        bestScore = score;
        bestX = cx;
        bestZ = cz;
      }
    }
    if (bestScore === Infinity) return false;
    routeCorner.x = bestX;
    routeCorner.z = bestZ;
    routeActive = true;
    return true;
  }

  function planRoute(gx, gz) {
    routeActive = false;
    const st = entity.state;
    const sx = st.pos.x, sz = st.pos.z;
    let dx = gx - sx, dz = gz - sz;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) return;
    const lim = Math.min(dist, ROUTE_LOOK_M);
    dx /= dist; dz /= dist;
    const margin = spec.dims.widthM * 0.5 + 1.4;
    let bestT = Infinity;
    let box = null;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.crushed || o.crushable) continue;
      const minX = o.min[0] - margin, maxX = o.max[0] + margin;
      const minZ = o.min[2] - margin, maxZ = o.max[2] + margin;
      let t0 = 0, t1 = lim;
      if (Math.abs(dx) < 1e-9) {
        if (sx < minX || sx > maxX) continue;
      } else {
        let a = (minX - sx) / dx, b = (maxX - sx) / dx;
        if (a > b) { const tt = a; a = b; b = tt; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
      }
      if (Math.abs(dz) < 1e-9) {
        if (sz < minZ || sz > maxZ) continue;
      } else {
        let a = (minZ - sz) / dz, b = (maxZ - sz) / dz;
        if (a > b) { const tt = a; a = b; b = tt; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
      }
      if (t0 > t1 || t1 < 0 || t0 > lim) continue;
      if (t0 < bestT) { bestT = t0; box = o; }
    }
    if (!box) {
      if (nowS < terrainRouteUntilS) planTerrainRoute(sx, sz, dx, dz, gx, gz);
      return;
    }
    const m2 = margin + 2.8; // corner clearance: a TURNING hull's diagonal
                             // swings ~halfL past its track line
    const cs = [
      [box.min[0] - m2, box.min[2] - m2], [box.max[0] + m2, box.min[2] - m2],
      [box.min[0] - m2, box.max[2] + m2], [box.max[0] + m2, box.max[2] + m2],
    ];
    // reject corners whose straight approach re-crosses THIS box (a start
    // point near corner A scores the DIAGONAL corner best on d1+d2 — and the
    // segment to it runs through the box face; the coastal spawn-exit trace
    // wedged exactly like that, throttle 0.4 into a rock face for 30 s)
    const inMinX = box.min[0] - margin * 0.85, inMaxX = box.max[0] + margin * 0.85;
    const inMinZ = box.min[2] - margin * 0.85, inMaxZ = box.max[2] + margin * 0.85;
    const segHitsBox = (ex, ez) => {
      let ddx = ex - sx, ddz = ez - sz;
      const len = Math.hypot(ddx, ddz) || 1e-9;
      ddx /= len; ddz /= len;
      let t0 = 0, t1 = len;
      if (Math.abs(ddx) < 1e-9) {
        if (sx < inMinX || sx > inMaxX) return false;
      } else {
        let a = (inMinX - sx) / ddx, b = (inMaxX - sx) / ddx;
        if (a > b) { const tt = a; a = b; b = tt; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
      }
      if (Math.abs(ddz) < 1e-9) {
        if (sz < inMinZ || sz > inMaxZ) return false;
      } else {
        let a = (inMinZ - sz) / ddz, b = (inMaxZ - sz) / ddz;
        if (a > b) { const tt = a; a = b; b = tt; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
      }
      return t0 <= t1 && t1 > 0 && t0 < len;
    };
    let best = Infinity, bx = 0, bz = 0;
    for (let i = 0; i < cs.length; i++) {
      const cx = cs[i][0], cz = cs[i][1];
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 500) continue;
      const d1 = Math.hypot(cx - sx, cz - sz);
      if (d1 < 2) continue; // standing on this corner already
      if (nowS < lastCorner.untilS &&
          Math.hypot(cx - lastCorner.x, cz - lastCorner.z) < 3) continue;
      if (segHitsBox(cx, cz)) continue; // diagonal-through-the-box corner
      const score = d1 + Math.hypot(gx - cx, gz - cz) +
        cornerBias(sx, sz, dx, dz, cx, cz);
      if (score < best) { best = score; bx = cx; bz = cz; }
    }
    if (best === Infinity) return;
    routeCorner.x = bx;
    routeCorner.z = bz;
    routeActive = true;
  }
  // r7: corner preference bias — repeated strikes flip detourSide, and the
  // replan then prefers corners on the OTHER flank of the advance line, so
  // consecutive plans try genuinely different ways around a stubborn block.
  function cornerBias(sx, sz, dirx, dirz, cx, cz) {
    const side = Math.sign(dirz * (cx - sx) - dirx * (cz - sz)) || 1;
    return side === detourSide ? 0 : 25;
  }

  /**
   * BATTLE-AI r7 POCKET ESCAPE (last-resort nav): five wedge cycles on one
   * leg means the hull sits in a multi-box pocket (rock-outcrop clusters,
   * town courtyards) that per-box corner hops cannot solve. Sample 8
   * bearings for the clearest 30 m escape lane — no solid box on the
   * segment, no sharp terrain rise — and commit to it via the scoot drive
   * for a few seconds before resuming the mission.
   * @returns {boolean} true when an escape leg was committed
   */
  function escapePocket() {
    const st = entity.state;
    const sx = st.pos.x, sz = st.pos.z;
    const margin = spec.dims.widthM * 0.5 + 1.0;
    let bestScore = -Infinity, bx = 0, bz = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + scanPhase;
      const ux = Math.sin(a), uz = Math.cos(a);
      // clear length against solid boxes (crushables are drive-through)
      let clear = 34;
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o.crushed || o.crushable) continue;
        const minX = o.min[0] - margin, maxX = o.max[0] + margin;
        const minZ = o.min[2] - margin, maxZ = o.max[2] + margin;
        let t0 = 0, t1 = clear;
        if (Math.abs(ux) < 1e-9) {
          if (sx < minX || sx > maxX) continue;
        } else {
          let lo = (minX - sx) / ux, hi = (maxX - sx) / ux;
          if (lo > hi) { const tt = lo; lo = hi; hi = tt; }
          if (lo > t0) t0 = lo;
          if (hi < t1) t1 = hi;
        }
        if (Math.abs(uz) < 1e-9) {
          if (sz < minZ || sz > maxZ) continue;
        } else {
          let lo = (minZ - sz) / uz, hi = (maxZ - sz) / uz;
          if (lo > hi) { const tt = lo; lo = hi; hi = tt; }
          if (lo > t0) t0 = lo;
          if (hi < t1) t1 = hi;
        }
        if (t0 <= t1 && t1 > 0 && t0 < clear) clear = Math.max(0, t0);
      }
      if (clear < 12) continue;
      const ex = sx + ux * clear, ez = sz + uz * clear;
      if (Math.max(Math.abs(ex), Math.abs(ez)) > 470) continue;
      const h0 = hf.getHeightAt(sx, sz);
      const terrainCost = terrainLineCost(sx, sz, h0, ux, uz);
      if (!Number.isFinite(terrainCost)) continue;
      const score = clear - (terrainCost - 1) * 4 + rng() * 3;
      if (score > bestScore) { bestScore = score; bx = ex; bz = ez; }
    }
    if (bestScore === -Infinity) return false;
    scootPoint.x = bx;
    scootPoint.z = bz;
    scootUntilS = nowS + 6;
    routeTimer = 0;
    return true;
  }

  // r6 NAV-PROGRESS WATCHDOG (engagement-starvation root cause): the r7
  // displacement-EMA stuck test is blind to two wedge modes measured in the
  // r6 probe — (a) obstacle ORBITING, where pivot->drive->avoid->pivot cycles
  // around a spawn prop cluster produce 1-2 m/s of continuous displacement
  // (the flanker danced 115 s at its spawn, obs=3, yaw churning end to end),
  // and (b) damped-throttle GRINDS, where avoidObstacles' x0.6 and the
  // arrival ease-in push throttle under the old |throttle|>0.25 arming term
  // so exactly the bots pressing against props never armed the stuck timer.
  // Track progress toward the CURRENT drive goal instead: driveIntent marks
  // every tick a drive helper actually wants motion (any throttle), and
  // navNoProgressT accumulates while the goal distance refuses to shrink.
  let navGoalX = 1e9;
  let navGoalZ = 1e9;
  let navBestD = Infinity;
  let navNoProgressT = 0;
  let driveIntent = false;
  function trackNavProgress(x, z, dist) {
    driveIntent = true;
    if (Math.abs(x - navGoalX) > 15 || Math.abs(z - navGoalZ) > 15) {
      navGoalX = x; navGoalZ = z;   // new leg — fresh baseline
      navBestD = dist;
      navNoProgressT = 0;
    } else if (dist < navBestD - 1.5) {
      navBestD = dist;              // genuine approach — reset the clock
      navNoProgressT = 0;
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
    trackNavProgress(x, z, dist); // r6 wedge watchdog (see update())
    if (dist < ARRIVE_DIST_M) {
      input.throttle = 0;
      input.steer = 0;
      input.brake = Math.abs(st.speed) > 0.5;
      return true;
    }
    // r7 CORNER-HOP ROUTER (see planRoute): re-plan when the goal moved or
    // the recheck timer lapsed; while a solid blocker sits on the straight
    // line, the steering goal becomes the corner around it.
    if (routeTimer <= 0 ||
        Math.abs(x - routeGoalX) > 12 || Math.abs(z - routeGoalZ) > 12) {
      routeGoalX = x;
      routeGoalZ = z;
      routeTimer = ROUTE_RECHECK_S;
      planRoute(x, z);
    }
    let viaCorner = false;
    if (routeActive) {
      const cdx = routeCorner.x - st.pos.x;
      const cdz = routeCorner.z - st.pos.z;
      if (Math.hypot(cdx, cdz) < 4.5) {
        // corner reached — veto it briefly and replan (next hop or straight)
        lastCorner.x = routeCorner.x;
        lastCorner.z = routeCorner.z;
        lastCorner.untilS = nowS + 4;
        routeActive = false;
        routeTimer = 0;
      } else {
        viaCorner = true;
        x = routeCorner.x;
        z = routeCorner.z;
        dx = cdx;
        dz = cdz;
        dist = Math.hypot(dx, dz);
      }
    } else if (nowS < detourUntilS && dist > 25) {
      // Blocked-route detour (see detourUntilS): steer for a point offset
      // sideways from the real target so the hull clears the blocking face.
      // (Fallback for wedges the router cannot see — tank pile-ups.)
      const px = dz / dist, pz = -dx / dist; // perp of the bearing
      x += px * 55 * detourSide;
      z += pz * 55 * detourSide;
      dx = x - st.pos.x; dz = z - st.pos.z;
      dist = Math.hypot(dx, dz);
    }
    const bearing = Math.atan2(dx, dz);
    const err = wrapAngle(bearing - st.yaw);
    input.steer = clamp(err * 2.2, -1, 1);
    input.brake = false;
    if (Math.abs(err) > 1.2) {
      // r4 PIVOT DEADLOCK FIX: the old near-pivot (0.15 throttle, then
      // avoidObstacles damping it to 0.09 AND counter-steering against the
      // bearing steer every tick) left hulls parked next to spawn props
      // wobbling at spd=0 for 60+ s (unstaged probe traces: thr=0.1, zero
      // rotation, blkT growing forever). A rotating-in-place hull neither
      // needs obstacle avoidance nor moves enough to hit anything — skip
      // it, and give the pivot enough drive to actually break friction.
      input.throttle = 0.3;
      return false;
    }
    input.throttle = clamp(1 - Math.abs(err) * 0.55, 0.25, 1) * speedScale;
    // ease into ARRIVALS only — an intermediate route corner is a waypoint,
    // not a destination (the ease floor made bots crawl corner chains at
    // 0.2 throttle and wedge; r7 autumn trace)
    if (!viaCorner) input.throttle *= clamp(dist / 10, 0.35, 1);
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

  /**
   * BATTLE-AI r7: back up while keeping the BOW on a bearing. movement.ts
   * flips the steering sign while reversing (reversing-car semantics, §
   * "Reverse-steer flip") — plain faceYaw+negative throttle therefore spun
   * hulls AWAY from the target (probe: 800-2700 mrad yaw errors mid-pullback,
   * bots reversing in circles). Compensate the flip once the hull actually
   * rolls backwards.
   */
  function reverseFacing(input, wantYaw, throttle) {
    const st = entity.state;
    const err = wrapAngle(wantYaw - st.yaw);
    const sign = st.speed < -0.15 ? -1 : 1; // movement.ts reverse-steer flip
    input.steer = Math.abs(err) > 0.06 ? clamp(err * 2.5, -1, 1) * sign : 0;
    input.throttle = throttle;
    input.brake = false;
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
    loopWaypoints = true;
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
      if (wpIndex < waypoints.length - 1) wpIndex++;
      else if (loopWaypoints) wpIndex = 0;
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
    // camo_spotting r5: an UNSPOTTED target's live position is server-side
    // truth the bot's team does not have — navigation and hull facing use
    // the last team-known point instead (lastSeen refreshes per spotting
    // check and per muzzle flash), so a hull never visibly tracks a
    // concealed tank crawling inside its bush.
    const tVis = isVisibleToTeam(target);
    const navX = tVis ? tp.x : lastSeen.x;
    const navZ = tVis ? tp.z : lastSeen.z;

    // Gun pinned at a limit while trying to shoot → back away from the crest.
    if (timeS < nudgeUntilS) {
      input.throttle = -0.6;
      input.steer = 0;
      input.brake = false;
      return;
    }

    // BATTLE-AI r7 RETREAT-TOWARD-SUPPORT: a tracked/low hull disengages for
    // a few seconds toward the nearest living teammate (trigger lives in
    // update()). Reverse when the support is behind — bow armor stays on the
    // threat and the turret keeps firing the whole way.
    if (timeS < fallbackUntilS) {
      if (fallbackReverse) {
        reverseFacing(input, Math.atan2(navX - st.pos.x, navZ - st.pos.z), -0.75);
      } else {
        driveToXZ(input, fallbackPoint.x, fallbackPoint.z, 1.0);
      }
      return;
    }

    if (!losClear) {
      // BATTLE-AI r7 LANE FALLBACK: 20+ s of blocked ray WITH nav strikes
      // means the direct commit is geometry-hard (urban trace: a bot pressed
      // the town's north wall for 30 s re-picking vantage cells behind the
      // same face). Give up the direct line for a while and follow the
      // AUTHORED opening lane instead — lanes are nav-proven (town-skirted,
      // open ground), so the bot swings around the block and re-engages
      // from a fresh sector with the turret still tracking.
      if (timeS < laneFallbackUntilS) {
        drivePatrol(input);
        return;
      }
      // trigger: wedged AND blocked, or simply blocked for a long time
      // (urban probe: 90 s blocked with ZERO strikes — the vantage cycle
      // spun in place without ever wedging hard enough to strike)
      if ((losBlockedT > 14 && stuckStrikes >= 2) || losBlockedT > 18) {
        laneFallbackUntilS = timeS + 12;
        losBlockedT = 0; // fresh grace after the lane leg
        hasVantage = false;
        drivePatrol(input);
        return;
      }
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
      if (chaseToXZ(input, lastSeen.x, lastSeen.z, target.isPlayer ? 1.0 : 0.9)) {
        // BATTLE-AI r7 BLOCKED-ARRIVAL ESCALATION: parked ON the last-seen
        // point with still no ray — the contact moved behind the next fold/
        // block. The r7 flow probe measured bots oscillating here for 60+ s
        // (press cycles re-driving them onto the same parked spot, 0 shells).
        // Push a fresh probe leg toward the OPPONENTS' 50 m-quantized sector
        // centroid (route intel, same softness rule as the stalemate
        // breaker — never precise live coordinates) via the vantage drive.
        const list = deps.getEnemies();
        let cx = 0, cz = 0, n = 0;
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!enemyAlive(e)) continue;
          cx += e.state.pos.x;
          cz += e.state.pos.z;
          n++;
        }
        if (n > 0) {
          const qx = Math.round(cx / n / 50) * 50;
          const qz = Math.round(cz / n / 50) * 50;
          const b = Math.atan2(qx - st.pos.x, qz - st.pos.z) + (rng() - 0.5) * 0.6;
          vantage.x = st.pos.x + Math.sin(b) * 90;
          vantage.z = st.pos.z + Math.cos(b) * 90;
          hasVantage = true;
        }
      }
      return;
    }
    hasVantage = false; // ray is clear — fight from here
    // r7 direct settle trigger: ray clear but the trigger has starved 8+ s —
    // commit to a clean halt NOW (the stalemate press variant waits 12 s and
    // its cooldown misses half the flicker duels the urban probe measured).
    // Three back-to-back fruitless settles yield to the normal maneuver
    // logic for a while (the shot may simply not exist from this cell).
    if (timeS - lastFiredAtS > 8 && timeS >= settleUntilS &&
        timeS >= settleCdUntilS &&
        entity.combat && entity.combat.reload && entity.combat.reload.t <= 0.5) {
      settleStreak = timeS - settleUntilS < 1.5 ? settleStreak + 1 : 0;
      if (settleStreak >= 3) {
        settleStreak = 0;
        settleCdUntilS = timeS + 8;
      } else {
        settleUntilS = timeS + 3.5;
      }
    }
    // r5: the engage envelope extends unconditionally toward a PLAYER
    // attacker-of-record and during a stalemate push — not only while the
    // 15 s underFire window happens to be live. BATTLE-AI r7: the base
    // envelope is role-scaled (snipers commit from further out).
    const engageR = roleEngageR() +
      ((timeS < underFireUntilS ||
        (target.isPlayer && timeS < playerAggroUntilS) ||
        timeS < pressUntilS) ? UNDER_FIRE_RANGE_BONUS_M : 0);
    if (distToTarget > engageR) {
      // BATTLE-AI r7 NO-SUICIDE GUARD: a lone hull does not free-run into a
      // covered group — it halts at the envelope edge and snipes until a
      // teammate is on station (the stalemate breaker still overrides, so a
      // pressing push never deadlocks; scouts are exempt — speed is their
      // armor and spotting the group is their job).
      if (role !== 'scout' && timeS >= pressUntilS &&
          distToTarget < engageR + 90 && outnumberedSolo()) {
        faceYaw(input, Math.atan2(navX - st.pos.x, navZ - st.pos.z));
        return;
      }
      chaseToXZ(input, navX, navZ, 1.0); // committed leg (r3) — leadable mover
      return;
    }
    if (hasMoveTarget) {                          // roll into the hull-down spot
      if (driveToXZ(input, moveTarget.x, moveTarget.z, 0.6)) hasMoveTarget = false;
      return;
    }
    // BATTLE-AI r7 scout doctrine: never brawl, never park — kite out of
    // knife range and orbit the band with flipping sides (active spotting).
    if (role === 'scout') {
      scoutMove(input, timeS, distToTarget, navX, navZ);
      return;
    }
    const holdR = roleHoldR();
    if (distToTarget > holdR) {
      // HALT-AND-VOLLEY (controls_gunnery r5): the old branch crept at 0.45
      // throttle the whole way from engageR down to holdRange — movement
      // bloom kept computeDispersionRadM above the fire gate for the entire
      // 240-580 m band, so mid-range bots with clear LOS simply never shot
      // (diag: 60 s, two live enemies staring at contacts, zero shells; only
      // sub-holdRange bots ever fired). WoT bots stop-shoot-move: advance
      // while the gun is loading, HALT and settle the moment it is ready.
      const rl = entity.combat && entity.combat.reload;
      // BATTLE-AI r7 TRADE WINDOW (brawlers): the target's gun is visibly
      // cycling (it just fired — its reload state is the observable muzzle
      // flash) and ours is seated — heavies push the reload window hard.
      const tgtCycling = target.combat && target.combat.reload &&
        target.combat.reload.t > 1.5;
      if (role === 'brawler' && tgtCycling && (!rl || rl.t <= 0.3)) {
        chaseToXZ(input, navX, navZ, 0.85);
        return;
      }
      if (rl && rl.t > 1.2) {
        // r7 reload windows by role: snipers HOLD their sightline (never
        // creep into it), flankers advance on an angled slip toward the next
        // cover line, brawlers close straight in; nobody dives a covered
        // group alone (outnumberedSolo pins the advance to the band edge).
        if (role === 'sniper') {
          faceYaw(input, Math.atan2(navX - st.pos.x, navZ - st.pos.z));
          return;
        }
        if (timeS >= pressUntilS && outnumberedSolo()) {
          faceYaw(input, Math.atan2(navX - st.pos.x, navZ - st.pos.z));
          return;
        }
        if (role === 'flanker') {
          const lx2 = navZ - st.pos.z, lz2 = -(navX - st.pos.x);
          const ll = Math.hypot(lx2, lz2) || 1;
          chaseToXZ(input, navX + (lx2 / ll) * 48 * angleSide,
            navZ + (lz2 / ll) * 48 * angleSide, 0.7);
          return;
        }
        chaseToXZ(input, navX, navZ, 0.6); // close distance during the reload
        return;
      }
      faceYaw(input, Math.atan2(navX - st.pos.x, navZ - st.pos.z));
      return;
    }
    // Hold band. BATTLE-AI r7 reload discipline: peek only when loaded —
    // non-brawlers pull straight back while the gun cycles (bow on the
    // threat, turret still tracking); brawlers stand their ground and ANGLE
    // the hull off the contact bearing instead (casemates keep the bow on —
    // movement.ts aims their gun with the hull).
    const bearing = Math.atan2(navX - st.pos.x, navZ - st.pos.z);
    const rl2 = entity.combat && entity.combat.reload;
    const mods = entity.combat && entity.combat.modules;
    const gunOut = mods && mods.gun && mods.gun.state === 'red';
    // casemates NEVER pull back mid-duel — their fire solution IS the hull
    // facing, and the reverse dance left them 300-800 mrad off-axis when the
    // reload seated (steppe probe); they hold the lay and trust the armor.
    if (((rl2 && rl2.t > 1.2 && role !== 'brawler' && !casemate) || gunOut) &&
        distToTarget > 55) {
      reverseFacing(input, bearing, -0.45); // bow on the threat, backing out
      return;
    }
    // r7: a damaged turret ring traverses slowly or not at all — swing the
    // HULL square onto the target so the gun still comes to bear (probe:
    // ring-jammed heavies parked 100-900 mrad off-axis, never firing).
    const ringOut = mods && mods.turretRing && mods.turretRing.state !== 'ok';
    faceYaw(input, bearing + (ringOut ? 0 : angleRad * angleSide));
  }

  /**
   * BATTLE-AI r7: true when diving the current target alone is suicide —
   * 2+ live opponents inside 200 m of the target and this hull is a genuine
   * LONE SPEARHEAD: no living teammate within 170 m AND nobody at least as
   * far forward (within 40 m of my target distance). The "as far forward"
   * arm is the deadlock breaker — the first cut froze whole battle lines
   * because every bot in a spread formation read its >130 m neighbors as
   * absent support and mutually held (r7 flow probe: 12-bot idle stalls).
   * A line advancing abreast is support; only the man way out front waits.
   * A continuous 10 s hold also self-releases for 15 s — WoT bots commit.
   * Headless fixtures without getAllies never trigger the guard.
   * @returns {boolean}
   */
  function outnumberedSolo() {
    if (!target || !target.state || !getAllies) return false;
    if (nowS < guardReleaseUntilS) return false;
    const list = deps.getEnemies();
    let near = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!enemyAlive(e)) continue;
      const dx = e.state.pos.x - target.state.pos.x;
      const dz = e.state.pos.z - target.state.pos.z;
      if (dx * dx + dz * dz < 200 * 200) near++;
      if (near >= 2) break;
    }
    if (near < 2) { guardT = 0; return false; }
    const st = entity.state;
    const tp = target.state.pos;
    const myD = Math.hypot(tp.x - st.pos.x, tp.z - st.pos.z);
    const friends = getAllies();
    for (let i = 0; i < friends.length; i++) {
      const f = friends[i];
      if (!f || !f.state) continue;
      const dx = f.state.pos.x - st.pos.x;
      const dz = f.state.pos.z - st.pos.z;
      if (dx * dx + dz * dz < 170 * 170) { guardT = 0; return false; }
      const fd = Math.hypot(tp.x - f.state.pos.x, tp.z - f.state.pos.z);
      if (fd < myD + 40) { guardT = 0; return false; } // line abreast = support
    }
    const step = nowS - guardLastS;
    guardT = step < 0.12 ? guardT + Math.max(0, step) : 0; // consecutive ticks only
    guardLastS = nowS;
    if (guardT > 10) {
      guardT = 0;
      guardReleaseUntilS = nowS + 15;
      return false;
    }
    return true;
  }

  /**
   * BATTLE-AI r7 scout movement: kite out of knife range through a lateral
   * escape point (never a straight reverse — speed is the scout's armor),
   * otherwise orbit the engagement band tangentially, flipping sides every
   * 9-15 s and spiraling out when too close / in when too far. The scout
   * stays lit-up-proof and keeps feeding the team's spotting net.
   */
  function scoutMove(input, timeS, dist, navX, navZ) {
    const st = entity.state;
    if (timeS >= kiteUntilS) {
      let nd2 = Infinity;
      let nearest = null;
      const list = deps.getEnemies();
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!enemyAlive(e)) continue;
        const dx = e.state.pos.x - st.pos.x, dz = e.state.pos.z - st.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < nd2) { nd2 = d2; nearest = e; }
      }
      if (nearest && nd2 < SCOUT_KITE_M * SCOUT_KITE_M) {
        const away = Math.atan2(st.pos.x - nearest.state.pos.x,
          st.pos.z - nearest.state.pos.z);
        const esc = away + orbitSide * 0.7;
        kitePoint.x = st.pos.x + Math.sin(esc) * 150;
        kitePoint.z = st.pos.z + Math.cos(esc) * 150;
        kiteUntilS = timeS + 5;
      }
    }
    if (timeS < kiteUntilS) {
      if (driveToXZ(input, kitePoint.x, kitePoint.z, 1.0)) kiteUntilS = -1;
      return;
    }
    if (timeS >= orbitFlipS) {
      orbitSide = -orbitSide;
      orbitFlipS = timeS + 9 + rng() * 6;
    }
    const holdR = roleHoldR();
    const bearing = Math.atan2(navX - st.pos.x, navZ - st.pos.z);
    // tangential orbit with a spiral bias: >90° off the bearing when inside
    // the band (opens distance), <90° when outside (closes it)
    const orb = bearing + orbitSide * (Math.PI / 2) * (dist < holdR ? 1.2 : 0.8);
    driveToXZ(input, st.pos.x + Math.sin(orb) * 60, st.pos.z + Math.cos(orb) * 60, 0.95);
  }

  /**
   * BATTLE-AI r7 ARC-PIN REPOSITION: the gun has been pitch-pinned for
   * seconds (hull nose-up/down on a fold face — steppe diag measured
   * visualPitch +17-21° vs 5-7° of gun depression, 260+ mrad of pitch error
   * held for 60+ s while the 1.2 s reverse nudge cycled uselessly on the
   * same slope). Sample a ring of nearby FLAT cells (normal.y >= 0.94),
   * prefer one that keeps a sightline to the target, and drive there via
   * the scoot slot. A tank that knows its gun arcs finds ground that lets
   * the gun work — core "good ideas of their tank".
   * @returns {boolean} true when scootPoint was filled
   */
  function pickFlatCell() {
    if (!target || !target.state) return false;
    const st = entity.state;
    const tp = target.state.pos;
    const ty = eyeY(target);
    let bx = 0, bz = 0, found = false, bestScore = -Infinity;
    for (const r of [18, 30, 45]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        const cx = st.pos.x + Math.sin(a) * r;
        const cz = st.pos.z + Math.cos(a) * r;
        if (Math.max(Math.abs(cx), Math.abs(cz)) > 470) continue;
        const ny = hf.getNormalAt(cx, cz).y; // shared scratch — read .y now
        if (ny < 0.94) continue;
        const cy = hf.getHeightAt(cx, cz) + selfEyeM;
        const sight = hasLos(cx, cy, cz, tp.x, ty, tp.z) ? 1 : 0;
        const score = sight * 100 + ny * 10 - r * 0.1;
        if (score > bestScore) { bestScore = score; bx = cx; bz = cz; found = true; }
      }
      if (found && bestScore >= 100) break; // flat AND sighted — take it
    }
    if (found) { scootPoint.x = bx; scootPoint.z = bz; }
    return found;
  }

  /**
   * BATTLE-AI r7: sample a relocation cell 45-85 m out, biased to the rear
   * quarters of the target bearing; prefer one that keeps a sightline to the
   * last known contact so the next shot is already set up.
   * @returns {boolean} true when scootPoint was filled
   */
  function pickScoot() {
    const st = entity.state;
    const tb = target && target.state
      ? Math.atan2(target.state.pos.x - st.pos.x, target.state.pos.z - st.pos.z)
      : st.yaw;
    const ty = hf.getHeightAt(lastSeen.x, lastSeen.z) + 1.5;
    let fx = 0, fz = 0, found = false;
    for (let k = 0; k < 6; k++) {
      // ±(94°..152°) off the contact bearing — sideways-to-rear arcs
      const a = tb + (k % 2 ? -1 : 1) * (1.65 + 0.5 * ((k / 2) | 0));
      const r = 45 + rng() * 40;
      const cx = st.pos.x + Math.sin(a) * r;
      const cz = st.pos.z + Math.cos(a) * r;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 470) continue;
      const cy = hf.getHeightAt(cx, cz) + selfEyeM;
      const sight = hasLos(cx, cy, cz, lastSeen.x, ty, lastSeen.z);
      if (!found || sight) { fx = cx; fz = cz; found = true; }
      if (sight) break;
    }
    if (found) { scootPoint.x = fx; scootPoint.z = fz; }
    return found;
  }

  /** Move sideways out of a teammate-blocked gun lane. Short, flat, LOS-safe
   * candidates beat the normal 45-85 m shoot-and-scoot because this is a
   * formation adjustment, not a full relocation. */
  function pickFriendlyFireLane() {
    if (!target || !target.state) return false;
    const st = entity.state;
    const tx = target.state.pos.x, tz = target.state.pos.z;
    let dx = tx - st.pos.x, dz = tz - st.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const px = dz, pz = -dx;
    const friends = getAllies ? getAllies() : [];
    let bestScore = -Infinity, bx = 0, bz = 0;
    for (const r of [22, 34, 46]) {
      for (const side of [angleSide, -angleSide]) {
        const cx = st.pos.x + px * r * side - dx * 4;
        const cz = st.pos.z + pz * r * side - dz * 4;
        if (Math.max(Math.abs(cx), Math.abs(cz)) > 470) continue;
        if (hf.getNormalAt && hf.getNormalAt(cx, cz).y < 0.9) continue;
        const cy = hf.getHeightAt(cx, cz) + selfEyeM;
        if (!hasLos(cx, cy, cz, tx, eyeY(target), tz)) continue;
        let clearance = 80;
        for (let i = 0; i < friends.length; i++) {
          const f = friends[i];
          if (!f || !f.state) continue;
          clearance = Math.min(clearance,
            Math.hypot(f.state.pos.x - cx, f.state.pos.z - cz));
        }
        const score = Math.min(40, clearance) - r * 0.12 + (side === angleSide ? 1 : 0);
        if (score > bestScore) { bestScore = score; bx = cx; bz = cz; }
      }
      if (bestScore > 18) break;
    }
    if (bestScore === -Infinity) return false;
    scootPoint.x = bx;
    scootPoint.z = bz;
    return true;
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
    // A bot observes a delayed track and estimates lead; it does not read the
    // exact current transform as a perfect fire-control solution. The error is
    // correlated for a few seconds so aim visibly walks onto a mover.
    _vC.x -= tvx * targetTrackLagS;
    _vC.z -= tvz * targetTrackLagS;
    _vD.copy(_vC);
    let dist = 0;
    for (let i = 0; i < 2; i++) {
      _vE.set(_vD.x - ex, _vD.y - ey, _vD.z - ez);
      dist = _vE.length();
      const t = dist / shell.velocityMps;
      _vD.set(_vC.x + tvx * t * targetLeadScale,
        _vC.y, _vC.z + tvz * t * targetLeadScale);
    }

    // r4 BLIND-FIRE FALLBACK (WoT bush-fire): a bot with a live
    // repeat-offender window (2+ muzzle flashes from one position — the bots
    // know exactly which bush) that has been LOS-pinned for 15+ s shells the
    // KNOWN muzzle position instead of holding fire forever. Pathological
    // spawn-cluster rosters wedge on nav and would otherwise contribute zero
    // pressure for the whole battle (r4 unstaged probe, seed 2). Rate is
    // naturally capped by the reload; the aim point is the INTEL position
    // (lastSeen ground line), never the live unspotted target.
    const blindFire = !losClear && target.isPlayer &&
      playerShotsInWindow >= 2 && timeS < playerAggroUntilS &&
      losBlockedT > 15 && dist <= MAX_FIRE_RANGE_M;
    // BLIND LOCK (camo_spotting r5): the return-fire lock can hold a player
    // target the spotting sim does NOT currently show (double-flash claim,
    // or the reveal lapsed mid-lock) with losClear coming from the raw
    // geometric ray. Aiming the LIVE hull there was the ground-truth leak
    // the critic flagged — two shots from a formally unspotted deep bush
    // drew precisely-aimed fire through the vegetation. The lay now goes to
    // the REMEMBERED muzzle position (lastSeen — refreshed per flash, never
    // live-tracked while hidden) with the blind-fire spread on top: the bot
    // shells the known bush like a WoT player would, and a target that
    // crawled away inside concealment is safe.
    const blindLock = losClear && target.isPlayer && spotting &&
      !isVisibleToTeam(target) &&
      (timeS < playerLockUntilS ||
        (playerShotsInWindow >= 2 && timeS < playerAggroUntilS));
    if (blindFire || blindLock) {
      _vD.set(lastSeen.x, hf.getHeightAt(lastSeen.x, lastSeen.z) + 1.2, lastSeen.z);
    }

    // Difficulty aim error (persistent, resampled periodically).
    _vD.x += px * errYawRad * dist;
    _vD.z += pz * errYawRad * dist;
    _vD.y += errPitchRad * dist;
    // Break perfect center-mass streaks against the human on easy/normal at
    // range. Close brawls and hard difficulty remain unchanged.
    if (target.isPlayer && tier.playerSpreadMult > 0 && dist > 150) {
      const ramp = Math.min(1, (dist - 150) / 150) * tier.playerSpreadMult;
      _vD.x += px * playerYawRad * dist * ramp;
      _vD.z += pz * playerYawRad * dist * ramp;
      _vD.y += playerPitchRad * dist * ramp;
    }
    if (blindFire || blindLock) {
      // blind-fire spread (r5): area fire on a remembered point — additive
      // with the tier error, which is zero on the hard tier.
      _vD.x += px * blindYawRad * dist;
      _vD.z += pz * blindYawRad * dist;
      _vD.y += blindPitchRad * dist;
    }

    // Explicitly lay the BOT'S physical barrel for gravity before it fires.
    // Trigger-time shell steering was removed: every round now leaves on the
    // articulated bore, so a compensated bot visibly elevates its own gun
    // instead of launching a projectile above the rendered tube.
    _vE.set(ex, st.pos.y + selfGunM, ez);
    const layDistance = _vE.distanceTo(_vD);
    if (solveBallisticGunLay(_vF, _vE, _vD, shell)) {
      _vD.copy(_vE).addScaledVector(_vF, layDistance);
    }

    input.aimPoint.copy(_vD);
    input.shellSlot = /** @type {0|1|2} */ (
      clamp(chosenSlot, 0, Math.min(2, spec.gun.shells.length - 1)));

    // ---- fire gates ----
    const reactionOk = timeS - acquiredAtS >= tier.reactionS;
    // r7: a RED gun cannot fire (tryFire hard-blocks it) — the AI must know,
    // or it stands "ready" in the open for the whole 10 s repair.
    const gunRed = cb && cb.modules && cb.modules.gun && cb.modules.gun.state === 'red';
    const reloadReady = !cb || (cb.reload && cb.reload.t <= 1e-3 && !cb.destroyed && !gunRed);
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

    // Alignment gate: compare the requested lay to the exact articulated bore
    // using the same YXZ hull composition as movement and rendering. A linear
    // pitch/roll approximation can be more than a degree wrong on a sidehill.
    const gy = st.pos.y + selfGunM;
    const dxA = input.aimPoint.x - ex, dyA = input.aimPoint.y - gy, dzA = input.aimPoint.z - ez;
    const horiz = Math.hypot(dxA, dzA) || 1e-6;
    const wantYaw = Math.atan2(dxA, dzA);
    const wantPitch = Math.atan2(dyA, horiz);
    _hullEuler.set(-(st.visualPitch || 0), st.yaw, st.visualRoll || 0, 'YXZ');
    _hullQuat.setFromEuler(_hullEuler);
    _vF.set(
      Math.sin(st.turretYaw) * Math.cos(st.gunPitch),
      Math.sin(st.gunPitch),
      Math.cos(st.turretYaw) * Math.cos(st.gunPitch),
    ).applyQuaternion(_hullQuat).normalize();
    const gunYaw = Math.atan2(_vF.x, _vF.z);
    const gunPitch = Math.atan2(_vF.y, Math.hypot(_vF.x, _vF.z));
    const yawErr = Math.abs(wrapAngle(wantYaw - gunYaw));
    const pitchErr = Math.abs(wantPitch - gunPitch);
    // With trigger-time shell snapping gone, a one-centiradian "ready" cone
    // can miss a 3 m tank by five meters at 500 m. Wait for the physical bore
    // to enter the target-sized cone instead; the gun rates still determine
    // how quickly that happens.
    const tol = Math.max(0.0015, Math.atan2(tw * 0.3, dist));
    // Arc-limit fallback: when the barrel is pinned at a pitch stop and still
    // off the solution, repositioning (the reverse nudge) runs in parallel —
    // but after a few seconds the AI takes the best shot its gun arc allows
    // instead of holding fire forever (bounded: within ~4x tolerance).
    const gunReady = losClear && reactionOk && reloadReady && rangeOk;
    // r7: the clamp flag is NOT required — a slope's attitude composite can
    // hold the solution outside the barrel's reach without atGunLimit ever
    // latching (probe: 227 mrad pitch error, lim=false, parked 45 s).
    if ((st.atGunLimit || pitchErr > 0.1) && gunReady && pitchErr >= tol * 1.5) {
      arcLimitedT += dt;
    } else if ((!st.atGunLimit && pitchErr <= 0.1) || pitchErr < tol * 1.5) {
      arcLimitedT = 0;
    }
    const pitchTol = arcLimitedT > 2.5 ? Math.min(0.06, tol * 4) : tol * 1.5;
    // r7 ARC-PIN REPOSITION (see pickFlatCell): a pitch error the widened
    // tolerance can never absorb (hull on a fold face) converts into a
    // relocation to flat ground instead of an eternal nudge cycle. The
    // threshold is the LIVE tolerance itself — the first cut used a fixed
    // 70 mrad and left a 40-70 mrad dead zone where the bot neither fired
    // nor moved (steppe probe: jpz_e100 parked at 45 mrad for 50 s).
    if (arcLimitedT > 3 && pitchErr > pitchTol && timeS >= scootUntilS) {
      if (pickFlatCell()) {
        scootUntilS = timeS + 10;
        hasMoveTarget = false;
        hasCoverPoint = false;
        if (mode === 'seekCover') mode = 'engage';
      }
      arcLimitedT = 0;
    }
    const alignOk = yawErr < tol && pitchErr < pitchTol;

    // (r5 settled-shot timeout — see the dispersion-gate note above)
    // r7: the timer DECAYS through brief gate flickers instead of hard
    // resetting — an urban duel's LOS blinks on/off every second or two and
    // the old reset meant the 2.5 s settle could never complete (probe:
    // eight town bots at rdy=true/disp=false for 30-60 s without a shell).
    if (gunReady && alignOk && !dispersionOk) dispGateT += dt;
    else dispGateT = Math.max(0, dispGateT - dt * 2);
    const dispersionPass = dispersionOk || dispGateT > 2.5;

    const wouldFire = (gunReady && dispersionPass && alignOk &&
        (penGateOk || chosenSlot === heSlot)) ||
      // blind bush-fire skips LOS/pen/dispersion gates — the lay itself is
      // the message — but still demands reaction time, a seated shell and
      // the gun actually pointed at the intel position.
      (blindFire && reactionOk && reloadReady && rangeOk && alignOk);
    const friendlyRisk = wouldFire && getAllies
      ? botFriendlyFireRisk(entity, input.aimPoint, shell, getAllies()) : null;
    if (friendlyRisk) {
      if (friendlyBlockT <= 0) friendlyBlockCount++;
      friendlyBlockT += dt;
      lastFriendlyRisk = friendlyRisk;
    } else {
      friendlyBlockT = Math.max(0, friendlyBlockT - dt * 2);
      if (friendlyBlockT === 0) lastFriendlyRisk = null;
    }
    input.fire = wouldFire && !friendlyRisk;
    if (input.fire) lastFiredAtS = timeS; // STALEMATE BREAKER bookkeeping (r5)
    // controls_gunnery r5 debug surface (headless probes): why is/isn't this
    // bot firing right now? Plain snapshot object — no live references.
    _dbg.losClear = losClear; _dbg.reactionOk = reactionOk;
    _dbg.reloadReady = reloadReady; _dbg.rangeOk = rangeOk;
    _dbg.dispersionOk = dispersionOk; _dbg.dispGateT = +dispGateT.toFixed(1);
    _dbg.alignOk = alignOk;
    _dbg.penGateOk = penGateOk; _dbg.slot = chosenSlot;
    _dbg.friendlyBlocked = !!friendlyRisk;
    _dbg.friendlyBlockKind = friendlyRisk ? friendlyRisk.kind : null;
    _dbg.friendlyBlockId = friendlyRisk ? friendlyRisk.allyId : null;
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
    // Casemate YAW pins are excluded: movement.ts's §7 auto hull-traverse is
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

  // Both the low-speed detector and orbit watchdog escalate through this
  // same recovery policy. Low-speed wedges wait for a repeated strike;
  // orbiting proves a bad route immediately and skips that first-strike hold.
  function escalateStuckRecovery(timeS, requireRepeatedStrike) {
    stuckStrikes++;
    if (requireRepeatedStrike && stuckStrikes < 2) return;

    detourSide = -detourSide;
    detourUntilS = timeS + UNSTICK_TIME_S + 6;
    // A live corner plan caused the wedge, so replace it immediately. With
    // no plan, let the wide detour own steering for the recovery window.
    if (routeActive) {
      routeActive = false;
      routeTimer = 0;
    } else {
      routeTimer = UNSTICK_TIME_S + 6;
    }
    if (mode === 'patrol' && waypoints.length > 1) {
      if (wpIndex < waypoints.length - 1) wpIndex++;
      else if (loopWaypoints) wpIndex = 0;
    } else if (hasMoveTarget) {
      hasMoveTarget = false;
    }
    if (hasVantage) vetoVantage();
    hasVantage = false;

    // Four failed legs mean the bot is pocketed rather than merely wedged.
    if (stuckStrikes >= 4) {
      if (timeS >= scootUntilS && escapePocket()) stuckStrikes = 0;
      else stuckStrikes = 2;
    }
  }

  // ---- main update ----------------------------------------------------------

  function update(dt, timeS) {
    nowS = timeS;
    const input = entity.input;
    const st = entity.state;
    const cb = entity.combat;
    const allyYieldingPrev = allyYielding;
    allyYielding = false;
    allyAvoidingId = null;
    allyClosestM = Infinity;

    if (cb && cb.destroyed) {
      input.throttle = 0; input.steer = 0; input.brake = false; input.fire = false;
      return;
    }

    // Survival memory: a large burst of damage is actionable even when the
    // remaining HP is still above the role threshold. The window is based on
    // observed own HP only—no hidden enemy reload or damage information.
    if (cb && cb.hp != null) {
      if (timeS > burstDamageUntilS) burstDamage = 0;
      if (cb.hp < lastHp) {
        burstDamage += lastHp - cb.hp;
        burstDamageUntilS = timeS + BURST_RETREAT_WINDOW_S;
      }
      lastHp = cb.hp;
    }

    losTimer -= dt; probeTimer -= dt; coverTimer -= dt; errTimer -= dt; obstacleTimer -= dt;
    routeTimer -= dt; // r7 corner-hop replan cadence

    if (obstacleTimer <= 0) {
      obstacles = deps.getObstacles();
      obstacleTimer = OBSTACLE_REFRESH_S;
    }
    if (losTimer <= 0) {
      acquireTarget(timeS);
      losTimer = LOS_INTERVAL_S * (0.8 + rng() * 0.4);
    }
    // controls_gunnery r3 (§7): feed the engagement watchdog.
    if (target) lastEngagedS = timeS;
    // r6: re-arm the first-aimed-shot budget while the player IS the lay.
    if (target && target.isPlayer) lastPlayerEngageS = timeS;
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
        // r7 SHOT STARVATION SETTLE: contact held, ray clear, still no shot
        // for 12+ s — the dispersion/alignment churn from constant micro-
        // movement is starving the trigger (probe: standoff pairs posturing
        // at 170-320 m for 30-60 s without a shell; a relocation variant
        // made it WORSE — more churn). Force a clean 3.5 s halt: the
        // settled-shot timeout (dispGateT) then takes the wide shot.
        if (target && losClear) settleUntilS = timeS + 3.5;
      } else if (timeS >= deploymentUntilS && !hasContact &&
                 timeS - lastFiredAtS > 25 &&
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
          // camo_spotting r5: QUANTIZE the destination to a ~50 m map-grid
          // sector — route intel means "push toward sector G7", never the
          // opponent's exact live coordinates (the old waypoint was a soft
          // ground-truth leak: an unspotted survivor drew a bot beeline to
          // its precise position after 25 s of silence).
          const qx = Math.round(bestE.state.pos.x / 50) * 50;
          const qz = Math.round(bestE.state.pos.z / 50) * 50;
          waypoints.push({
            x: (st.pos.x + qx) / 2,
            z: (st.pos.z + qz) / 2,
          });
          waypoints.push({ x: qx, z: qz });
          wpIndex = 0;
          autoPatrolBuilt = true;
          loopWaypoints = false;
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

    // ---- BATTLE-AI r7 doctrine triggers ----
    {
      // Reload-edge shot watch: reload.t jumping UP means a shell just left
      // THIS gun — the per-position shot budget snipers scoot on.
      const rt = cb && cb.reload ? cb.reload.t : 0;
      if (rt > prevReloadT + 1) {
        if (Math.hypot(st.pos.x - spotPos.x, st.pos.z - spotPos.z) > 22) {
          spotPos.x = st.pos.x;
          spotPos.z = st.pos.z;
          shotsFromSpot = 0;
        }
        shotsFromSpot++;
        if (tune.scootAfter > 0 && shotsFromSpot >= tune.scootAfter &&
            timeS >= scootUntilS && pickScoot()) {
          scootUntilS = timeS + 14; // window bounds the drive, arrival ends it
          // the relocation IS the survival play — drop any competing
          // cover/hull-down intention so the leg actually happens
          hasMoveTarget = false;
          hasCoverPoint = false;
          if (mode === 'seekCover') mode = 'engage';
        }
      }
      prevReloadT = rt;
      // Hull-down target the armor probes cannot solve from here (probeMiss,
      // runProbes): HE keeps lobbing at the turret line meanwhile, and after
      // 6 s the bot CHANGES ITS FIRING ANGLE via the scoot slot — WoT play
      // is reposition-for-the-hull, not an eternal stare-down.
      if (probeMiss && target && losClear) probeMissT += dt;
      else probeMissT = 0;
      if (probeMissT > 6 && timeS >= scootUntilS) {
        if (pickScoot()) {
          scootUntilS = timeS + 10;
          hasMoveTarget = false;
          hasCoverPoint = false;
          if (mode === 'seekCover') mode = 'engage';
        }
        probeMissT = 0;
      }
      // Retreat-toward-support: tracked, role-low, or recently chunked while
      // a live threat sits near the hold band—unless the target is nearly
      // dead (finish it). A burst retreat requires the gun to be cycling or
      // the hull to be genuinely isolated, so a supported loaded brawler does
      // not abandon a favorable trade after every penetration.
      if (timeS >= fallbackUntilS && timeS >= fallbackCdS &&
          mode === 'engage' && target && getAllies) {
        const hpFrac = cb && cb.maxHp ? cb.hp / cb.maxHp : 1;
        const trackRed = cb && cb.modules &&
          ((cb.modules.trackL && cb.modules.trackL.state === 'red') ||
           (cb.modules.trackR && cb.modules.trackR.state === 'red'));
        const tgtNearDead = target.combat && target.combat.maxHp &&
          target.combat.hp / target.combat.maxHp < 0.18;
        const reloading = cb && cb.reload && cb.reload.t > 0.8;
        const burstHit = cb && cb.maxHp && timeS <= burstDamageUntilS &&
          burstDamage / cb.maxHp >= BURST_RETREAT_FRAC &&
          (reloading || outnumberedSolo());
        if ((hpFrac < FALLBACK_HP_FRAC[role] || trackRed || burstHit) &&
            !tgtNearDead && distToTarget < roleHoldR() * 1.35) {
          let f = null, fd2 = Infinity;
          const friends = getAllies();
          for (let i = 0; i < friends.length; i++) {
            const a = friends[i];
            if (!a || !a.state) continue;
            const fdx = a.state.pos.x - st.pos.x;
            const fdz = a.state.pos.z - st.pos.z;
            const d2 = fdx * fdx + fdz * fdz;
            if (d2 > 25 * 25 && d2 < fd2) { fd2 = d2; f = a; }
          }
          if (f && fd2 < 400 * 400) {
            fallbackPoint.x = f.state.pos.x;
            fallbackPoint.z = f.state.pos.z;
            // reverse when the support is behind (rear ~160° cone): the bow
            // armor stays on the threat while the hull backs out
            const toF = Math.atan2(fallbackPoint.x - st.pos.x,
              fallbackPoint.z - st.pos.z);
            fallbackReverse = Math.abs(wrapAngle(toF - st.yaw)) > Math.PI * 0.55;
          } else {
            // No support in reach: create distance from the known threat
            // instead of remaining exposed merely because the team is gone.
            let ax = st.pos.x - target.state.pos.x;
            let az = st.pos.z - target.state.pos.z;
            const al = Math.hypot(ax, az) || 1;
            ax /= al; az /= al;
            fallbackPoint.x = clamp(st.pos.x + ax * 75, -470, 470);
            fallbackPoint.z = clamp(st.pos.z + az * 75, -470, 470);
            fallbackReverse = true;
          }
          fallbackUntilS = timeS + FALLBACK_S;
          fallbackCdS = timeS + FALLBACK_CD_S;
          burstDamage = 0;
          hasMoveTarget = false;
          hasCoverPoint = false;
        }
      }
    }

    // A stable friendly obstruction should produce a better firing angle,
    // not a blocked trigger forever. Movement begins on the tick after the
    // fire-discipline gate observes the corridor, keeping AI/fire ordering
    // deterministic and identical for both teams.
    if (friendlyBlockT >= FRIENDLY_LANE_RELOCATE_S && target && losClear &&
        timeS >= scootUntilS && pickFriendlyFireLane()) {
      scootUntilS = timeS + 7;
      friendlyBlockT = 0;
      friendlyLaneMoves++;
      hasMoveTarget = false;
      hasCoverPoint = false;
      if (mode === 'seekCover') mode = 'engage';
    }

    // ---- movement by mode ----
    input.brake = false;
    driveIntent = false; // r6: set by trackNavProgress inside the drive helpers
    if (timeS < settleUntilS && target && losClear) {
      // r7 SHOT-STARVATION SETTLE (see the stalemate breaker): a clean halt
      // facing the contact so the settled-shot timeout can take the shot.
      faceYaw(input, Math.atan2(
        target.state.pos.x - st.pos.x, target.state.pos.z - st.pos.z));
    } else if (timeS < scootUntilS) {
      // BATTLE-AI r7 SHOOT-AND-SCOOT: an active relocation leg overrides mode
      // movement in every mode (the turret keeps aiming/firing via
      // aimAndFire below) — the r7 flow probe measured scoots dying inside
      // seekCover/patrol before this override existed.
      if (driveToXZ(input, scootPoint.x, scootPoint.z, 0.95)) {
        scootUntilS = -1;
        spotPos.x = st.pos.x;
        spotPos.z = st.pos.z;
        shotsFromSpot = 0;
        relocations++;
      }
    } else {
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
    // movement.ts reports an engine/traction capability rejection explicitly. Waiting
    // for the generic two-second low-speed heuristic made bots repeatedly
    // grind into short cliffs that the coarse 25 m route grid cannot see.
    // A sustained slope block is definitive terrain feedback: reverse and
    // invalidate the leg promptly so the existing seeded detour/replan policy
    // can route around it. The short dwell filters one-tick ridge contacts.
    if (driveIntent && st.slopeBlocked && timeS >= unstickUntilS) {
      // Turn on the comparatively richer terrain fan only after the movement
      // solver reports a real rejected face. It remains active briefly while
      // the tank clears that local feature, keeping ordinary AI updates on
      // the existing low-cost obstacle path.
      terrainRouteUntilS = timeS + 6;
      routeTimer = 0;
      slopeBlockT += dt;
      if (slopeBlockT >= SLOPE_BLOCK_RECOVERY_S) {
        slopeBlockT = 0;
        unstickUntilS = timeS + UNSTICK_TIME_S;
        navNoProgressT = 0;
        navBestD = Infinity;
        escalateStuckRecovery(timeS, false);
        // A rejected grade is geometric, not probabilistic. Reuse the newly
        // flipped detour side so this recovery does not consume the combat RNG
        // stream; the route recovery above owns any macro-waypoint change.
        unstickSteer = detourSide;
      }
    } else {
      slopeBlockT = 0;
    }

    if (timeS < unstickUntilS) {
      input.throttle = -0.7;
      input.steer = unstickSteer;
      input.brake = false;
      lowSpeedT = 0;
      navNoProgressT = 0; // r6: reversing away — give the goal a fresh chance
      navBestD = Infinity;
    } else if (driveIntent && !allyYieldingPrev &&
               (Math.abs(st.speed) < 0.3 || progressRate < 0.45)) {
      // r6: arming keys on driveIntent, NOT |throttle|>0.25 — avoidObstacles'
      // x0.6 damping and the arrival ease-in put wedged bots at 0.07-0.24
      // throttle, which is exactly when the unstick must be armable (probe:
      // bots ground at thr=0.18-0.25 against props for 60-115 s, never
      // arming). Intentional halts (faceYaw hold, arrivals) set no intent.
      lowSpeedT += dt;
      if (lowSpeedT > STUCK_TIME_S) {
        unstickUntilS = timeS + UNSTICK_TIME_S;
        unstickSteer = rng() < 0.5 ? -1 : 1;
        lowSpeedT = 0;
        escalateStuckRecovery(timeS, true);
      }
    } else {
      lowSpeedT = 0;
      // r7: strikes clear only after SUSTAINED free movement — the unstick's
      // own 1.4 s reverse burst used to push progressRate over the bar and
      // launder the counter every cycle, so detour/veto/pocket escalations
      // never armed (desert trace: full throttle, zero speed, k pinned 0-1).
      if (progressRate > 2.5) {
        freeMoveT += dt;
        if (freeMoveT > 2.2) stuckStrikes = 0;
      } else {
        freeMoveT = 0;
      }
    }

    // r6 ORBIT WATCHDOG (see trackNavProgress): continuous displacement with
    // NO approach to the nav goal — a bot circling a spawn prop cluster keeps
    // progressRate at 1-2 m/s, so the stuck test above never fires (probe:
    // the flanker orbited its spawn for 115 s, obs=3, yaw churning end to
    // end, and the whole enemy team contributed 0 shells for 60 s). Six
    // seconds without closing on the goal is a strike through the SAME
    // unstick/detour/waypoint-skip machinery.
    if (driveIntent && !allyYieldingPrev && timeS >= unstickUntilS) {
      navNoProgressT += dt;
      if (navNoProgressT > 6) {
        navNoProgressT = 0;
        navBestD = Infinity;
        unstickUntilS = timeS + UNSTICK_TIME_S;
        unstickSteer = rng() < 0.5 ? -1 : 1;
        escalateStuckRecovery(timeS, false);
      }
    } else if (!driveIntent) {
      navNoProgressT = 0;
    }

    // Last movement authority: applies to ordinary routes, fallback reverse,
    // and generic unstick bursts alike.
    avoidAllies(input, dt);
    aimAndFire(input, dt, timeS);
    controller.state = mode;
  }

  /**
   * Replace the patrol route.
   * @param {Array<[number, number]>} points [x,z] pairs in world meters
   * @param {{loop?: boolean}} options route behavior; patrol routes loop by default
   */
  function setWaypoints(points, { loop = true } = {}) {
    waypoints.length = 0;
    for (let i = 0; i < points.length; i++) {
      waypoints.push({ x: points[i][0], z: points[i][1] });
    }
    wpIndex = 0;
    autoPatrolBuilt = true; // user route supersedes the auto loop
    loopWaypoints = !!loop;
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
    // RETURN-FIRE LOCK (controls_gunnery r4) ROOT-CAUSE FIX: lastSeen is the
    // CHASE POINT for the CURRENT target, but this unconditional write
    // teleported it onto whichever ALLIED bot landed the latest teammate hit
    // — so every bot "committed" to the player was measurably driving at the
    // player's escorts instead (r5 probe: aggro'd bots stalled mid-chase,
    // 76 enemy shells / 2 aimed at the player). The intel position now only
    // updates when the shooter IS — or here BECOMES — the target.
    const takesSlot = !target || !enemyAlive(target) ||
        shooterEnt === target ||
        (shooterEnt.isPlayer && target !== shooterEnt);
    if (takesSlot) {
      lastSeen.x = shooterEnt.state.pos.x;
      lastSeen.z = shooterEnt.state.pos.z;
      lastSeenAtS = nowS;
    }
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
   * @param {number} [rank=99] distance rank among this shot's earshot
   *   receivers (0 = nearest enemy to the player; state.js sorts the fan-out)
   */
  function notifyPlayerFired(shooterEnt, rank = 99) {
    if (!shooterEnt || !shooterEnt.state || !shooterEnt.combat ||
        shooterEnt.combat.destroyed || shooterEnt.team === entity.team) return;
    // REPEAT-OFFENDER COUNT (controls_gunnery r2): shots inside one intel
    // window accumulate; the count resets when the window lapses.
    if (nowS > playerAggroUntilS) playerShotsInWindow = 0;
    playerShotsInWindow += 1;
    playerAggro = shooterEnt;
    playerAggroUntilS = Math.max(playerAggroUntilS, nowS +
      (playerShotsInWindow >= 2 ? MUZZLE_INTEL_REPEAT_WINDOW_S : MUZZLE_INTEL_WINDOW_S));
    const sp = shooterEnt.state.pos;
    // RETURN-FIRE LOCK (controls_gunnery r4): one of the nearest ranked
    // enemies with a clear personal ray converts the muzzle flash into a
    // DUEL right now — target locked for PLAYER_LOCK_S (refreshed per shot),
    // cover/vantage intentions dropped, engage mode forced. Deep-concealment
    // courtesy: shot 1 from a formally unspotted bush only locks bots the
    // spotting sim shows the player to; a SECOND flash from the same window
    // is unambiguous and locks regardless (r2 hardClaim precedent).
    if (rank <= PLAYER_LOCK_RANK &&
        (isVisibleToTeam(shooterEnt) || playerShotsInWindow >= 2)) {
      const st = entity.state;
      if (hasLos(st.pos.x, st.pos.y + selfEyeM, st.pos.z,
                 sp.x, eyeY(shooterEnt), sp.z)) {
        playerLockUntilS = nowS + PLAYER_LOCK_S;
        if (target !== shooterEnt) {
          target = shooterEnt;
          acquiredAtS = nowS;
          nonPenCount = 0;
          probeTimer = 0;
        }
        losClear = true;
        lastSeen.x = sp.x; lastSeen.z = sp.z;
        lastSeenAtS = nowS;
        hasMoveTarget = false;
        hasCoverPoint = false;
        hasVantage = false;
        if (mode !== 'engage' && mode !== 'flank') mode = 'engage';
        return;
      }
    }
    // r4 (symmetric with notifyUnderFire): lastSeen is the CURRENT target's
    // chase point — writes below only land in branches where the player IS
    // or BECOMES the target, so a bot mid-duel with an allied bot keeps its
    // own chase intel.
    if (target === shooterEnt) {
      lastSeen.x = sp.x; lastSeen.z = sp.z;
      lastSeenAtS = nowS;
    }
    if (!target || !enemyAlive(target)) {
      // camo_spotting r7 (regression guard vs the old wallhack): an IDLE bot
      // used to claim the shooter as TARGET on the very first flash even
      // when the spotting sim still hid it — the one acquisition path that
      // skipped both the deep-concealment courtesy of the lock path above
      // and the >=2-shot hardClaim rule. Same gate now: shot 1 from a
      // formally unspotted bush claims nobody (the sim's own muzzle-flash
      // branch resolves an open-ground shooter within the forced check, so
      // a visible shooter is claimed a LOS tick later at most); a repeat
      // offender (2+ flashes, one window) is unambiguous intel as before.
      if (isVisibleToTeam(shooterEnt) || playerShotsInWindow >= 2) {
        target = shooterEnt;
        acquiredAtS = nowS;
        nonPenCount = 0;
        probeTimer = 0;
        lastSeen.x = sp.x; lastSeen.z = sp.z;
        lastSeenAtS = nowS;
        if (mode === 'patrol') mode = 'engage';
      }
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
      lastSeen.x = sp.x; lastSeen.z = sp.z; // chase the MUZZLE position (r4)
      lastSeenAtS = nowS;
      if (mode === 'patrol' || mode === 'seekCover') mode = 'engage';
    }
  }

  /** Authoritative fire path callback when a same-tick friendly crossing was
   * caught after the controller update. It feeds the same relocation timer. */
  function notifyFriendlyBlocked(risk) {
    if (!risk) return;
    if (friendlyBlockT <= 0) friendlyBlockCount++;
    friendlyBlockT = Math.max(friendlyBlockT, 0.25);
    lastFriendlyRisk = risk;
  }

  const controller = {
    update,
    setWaypoints,
    notifyShellResult,
    notifyUnderFire,
    notifyPlayerFired,
    notifyFriendlyBlocked,
    get targetId() { return target ? target.id : null; },
    /** Headless-probe introspection (controls_gunnery r5): gate snapshot. */
    debugInfo: () => ({
      mode, targetId: target ? target.id : null,
      targetIsPlayer: !!(target && target.isPlayer),
      // BATTLE-AI r7 doctrine surface: class role + measurable signals
      // (sniper relocations, live scoot/kite/fallback windows) for probes.
      role, relocations, shotsFromSpot,
      scooting: nowS < scootUntilS,
      kiting: nowS < kiteUntilS,
      fallingBack: nowS < fallbackUntilS,
      hpFrac: entity.combat && entity.combat.maxHp
        ? +(entity.combat.hp / entity.combat.maxHp).toFixed(2) : 1,
      burstDamage: Math.round(burstDamage),
      friendlyBlockT: +friendlyBlockT.toFixed(2),
      friendlyBlockCount,
      friendlyLaneMoves,
      friendlyBlockKind: lastFriendlyRisk ? lastFriendlyRisk.kind : null,
      friendlyBlockId: lastFriendlyRisk ? lastFriendlyRisk.allyId : null,
      allyYielding, allyAvoidingId,
      allyClosestM: Number.isFinite(allyClosestM) ? +allyClosestM.toFixed(2) : null,
      allyYieldT: +allyYieldT.toFixed(2),
      allyEmergencyStops, allyReverseEscapes,
      losBlockedT: +losBlockedT.toFixed(1), hasVantage,
      navT: +navNoProgressT.toFixed(1), strikes: stuckStrikes, // r6 watchdog
      playerBudgetT: +(nowS - lastPlayerEngageS).toFixed(1),   // r6 budget arm
      pressing: nowS < pressUntilS,
      playerShotsInWindow, // r2: repeat-offender aggro count (intel window)
      playerLocked: nowS < playerLockUntilS, // r4 RETURN-FIRE LOCK live
      // camo_spotting r7: chase-intel snapshot for the acquisition selftest —
      // asserts a hardClaim keeps the MUZZLE stamp, never the live position,
      // while the spotting sim hides the shooter.
      lastSeenX: lastSeen.x, lastSeenZ: lastSeen.z, lastSeenAtS,
      targetTrackLagS: +targetTrackLagS.toFixed(3),
      targetLeadScale: +targetLeadScale.toFixed(3),
      ..._dbg,
    }),
    state: mode,
  };
  entity.ai = controller;
  return controller;
}
