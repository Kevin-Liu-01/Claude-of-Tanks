/**
 * state.js — integration-owned game state: the event bus, the tank roster,
 * battle setup, and the fixed-step combat simulation (ARCHITECTURE.md §1.5,
 * §2.4, §4 step 2). No rendering here; the render loop lives in main.js.
 */
import * as THREE from 'three';
import { getSpec, TANK_IDS, ALL_TANK_IDS } from '../vehicles/specs.js';
import { createTank } from '../vehicles/tankFactory.js';
import {
  createTankState, updateTank, fireRecoil, computeDispersionRadM, SIM_DT,
} from '../sim/movement.js';
import {
  createShell, stepShell, applyDispersion, aimElevationRad,
} from '../sim/ballistics.js';
import { tankPoseFromState, traceTank } from '../sim/armor.js';
import {
  createCombatState, resolveShellHit, resolveHeBurst, tickFire, startReload, isHeClass,
} from '../sim/damage.js';
import { createAI } from './ai.js';
import { getStoredDifficulty } from './input.js';
// SPOTTING WIRING: concealment/spotting sim + camo-paint bonus source
import { createSpottingSystem, CAMO_PAINT_BONUS } from '../sim/spotting.js';
import { hasCamoPaint, setCamoOverride, clearCamoOverrides, applyCamoPatterns } from '../vehicles/materials.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const COMBAT_SEED = 6000;
const MODULE_REPAIR_S = 10;
const FIRE_TICK_S = 0.5;
const BATTLE_TIME_LIMIT_S = 900; // 15:00 clock (HUD counts it down) — timeout = draw

// module-scope scratch — no per-frame allocation
const _muzzle = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _upOrtho = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _toC = new THREE.Vector3();
const _push2 = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// PERF (steady-churn): shell objects + the shell:fired payload were the last
// per-shot allocations in the combat hot path (8 tanks firing every 4-8 s for
// minutes feeds the major-GC cycle whose ~30 ms pauses show up in the 60 s
// frame-time tail). Dead shells return to a free list in stepShells; the
// fired-event payload is a reused scratch object (every consumer — fx muzzle
// flash, audio gunshot/whizz, HUD ammo counter, killcam traj-start, shot-info
// counters — reads it synchronously inside emit; verified 2026-07-28).
const _shellPool = [];
function acquireShell(shellSpec, shooterId, isPlayer, muzzlePos, dir, id) {
  const sh = _shellPool.pop();
  if (!sh) return createShell(shellSpec, shooterId, isPlayer, muzzlePos, dir, id);
  sh.id = id;
  sh.shooterId = shooterId;
  sh.isPlayer = isPlayer;
  sh.spec = shellSpec;
  sh.pos.copy(muzzlePos);
  sh.prevPos.copy(muzzlePos);
  sh.vel.copy(dir).multiplyScalar(shellSpec.velocityMps);
  sh.ageS = 0;
  sh.distM = 0;
  sh.dead = false;
  sh.penRollDone = false;
  sh.remainingPenMm = 0;
  sh.dmgRoll = 0;
  sh.bounces = 0;
  sh.carriedThrough = false;
  return sh;
}
const _firedEv = {
  shellId: 0, shooterId: '', isPlayer: false, shellType: '', shellName: '',
  caliberMm: 0, muzzlePos: [0, 0, 0], dir: [0, 0, 0],
};

/**
 * Reference event bus (ARCHITECTURE.md §1.5).
 * @returns {{on:Function, off:Function, emit:Function}}
 */
export function createBus() {
  const m = new Map();
  return {
    on(ev, fn) {
      let a = m.get(ev);
      if (!a) { a = []; m.set(ev, a); }
      a.push(fn);
      return () => this.off(ev, fn);
    },
    off(ev, fn) {
      const a = m.get(ev);
      if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
    },
    emit(ev, payload) {
      const a = m.get(ev);
      if (a) for (const fn of a.slice()) fn(payload);
    },
  };
}

/**
 * Create the mutable game-state container.
 * @returns {object} game state
 */
export function createGameState() {
  return {
    phase: 'garage',            // 'garage' | 'battle' | 'ended' | 'shot'
    mapId: 'verdant',           // MAP-CONFIG WIRING: active battlefield id (main.js startBattle)
    tanks: [],                  // TankEntity[] — THIS battle's participants (player included)
    allTanks: [],               // COMMUNITY TANKS: full entity pool (core + community)
    battleCount: 0,             // COMMUNITY TANKS: seeds the per-battle roster shuffle
    tankById: new Map(),
    player: null,
    shells: [],
    nextShellId: 1,
    timeS: 0,
    fireTickAcc: 0,
    combatRng: mulberry32(COMBAT_SEED),
    result: null,               // null | 'victory' | 'defeat'
    spotting: null,             // SPOTTING WIRING: SpottingSystem (per battle)
  };
}

/**
 * Build the eight TankEntity records (one per roster spec) with visuals.
 * Called once at startup; battles reuse the entities via setupBattle().
 * @param {object} game createGameState() result
 * @param {object} engineCtx EngineCtx (§2.8)
 * @returns {void}
 */
export function spawnTanks(game, engineCtx) {
  // COMMUNITY TANKS: build entities for the FULL pool (core roster + sourced
  // community vehicles). A battle fields 8 of them (setupBattle picks the
  // participants); the rest sit hidden with null state/combat.
  //
  // PERF (performance_budget r4): visuals are built LAZILY. Baking a vehicle's
  // texture set is ~250-350 ms of 2048²-canvas painting per spec, and building
  // all 17 pool vehicles at boot (a) doubled load-to-ready (4.2 s -> 8.4 s)
  // and (b) parked ~580 MB of generated maps on the GPU for vehicles that are
  // not even in the battle (scene texture estimate 716.8 MB vs the 512 MB
  // ratchet target). Only the staged default battle (screenshot contract) is
  // built at boot; setupBattle builds the picked participants on entry and
  // EVICTS the visuals of everyone parked (the per-spec texture cache in
  // materials.js is refcounted, so eviction frees the canvases/GPU maps).
  game._engineCtx = engineCtx;   // for lazy visual builds (ensureTankVisual)
  game._groundSampler = null;    // set by main.js; applied to lazy visuals too
  ALL_TANK_IDS.forEach((specId, i) => {
    const spec = getSpec(specId);
    const ent = {
      id: specId,
      specId,
      spec,
      team: 'enemy',
      isPlayer: false,
      state: null,
      combat: null,
      input: {
        throttle: 0, steer: 0, brake: false, fire: false,
        aimPoint: new THREE.Vector3(), shellSlot: 0,
      },
      visual: null,
      // gameplay_feel r5: true once the visual GLB-swaps (rigid running gear,
      // no per-wheel conform) — movement.js hard-clamps its support fan then.
      rigidGear: false,
      _camoSeed: 4000 + i,
      ai: null,
      aiCtl: null,
      _destroyedAnnounced: false,
    };
    game.allTanks.push(ent);
    game.tankById.set(ent.id, ent);
  });
  game.tanks = game.allTanks.slice(0, TANK_IDS.length); // staged default battle
  // PERF (performance_budget r3): the staged battle's 7 ENEMY bakes are the
  // single biggest load-to-ready block (~2.2 s of 2048² canvas painting +
  // SimplexNoise + first-use GPU uploads on the boot path; bootprobe:
  // heightToNormal 1050 ms + noise 2.2 s). Nobody can see the staged battle
  // behind the garage screen, so boot builds ONLY the player's visual;
  // ensureStagedVisuals() (idempotent, chunked by the caller) builds the
  // rest post-ready — and main.js runs it synchronously from
  // warmCombatPipeline(), which __SHOTS.set() and startBattle() already
  // invoke before anything can look at the battlefield.
  ensureTankVisual(game, game.tanks[0]);
}

/**
 * PERF (performance_budget r3): build any still-missing staged-battle
 * visuals. Synchronous and idempotent — a no-op once all 8 exist. `limit`
 * lets the post-ready idle pump build one vehicle per slice so the garage
 * dwell absorbs ~300 ms chunks instead of one 2 s freeze.
 * @param {object} game game state
 * @param {number} [limit] max visuals to build this call (default: all)
 * @returns {boolean} true when every staged participant has a visual
 */
export function ensureStagedVisuals(game, limit = Infinity) {
  let built = 0;
  for (const ent of game.tanks) {
    if (ent.visual) continue;
    if (built >= limit) return false;
    ensureTankVisual(game, ent);
    built++;
  }
  return true;
}

/**
 * PERF (performance_budget r4): build a pool entity's visual on demand (battle
 * roster selection). Shares the per-spec texture cache with any live instance
 * of the same spec (garage pedestal, thumbs booth) via materials.js refcounts.
 * @param {object} game game state
 * @param {object} ent TankEntity from game.allTanks
 * @returns {object} the entity's TankVisual
 */
export function ensureTankVisual(game, ent) {
  if (ent.visual) return ent.visual;
  const engineCtx = game._engineCtx;
  // PERF (performance_budget r3): texture-quality tier. Hero-grade 2048²
  // bakes go to vehicles the camera can inspect at arm's length — the
  // player's pick and the closeup screenshot-contract specs (the garage
  // pedestal acquires 'high' itself and upgrades a cached 'ai' entry in
  // place). AI roster fills bake at half size: 5-7 full hero sets per battle
  // measured 666-685 MB scene textures vs the FROZEN 512 MB gate, and each
  // 2048² bake costs 250-350 ms of main-thread canvas work.
  const hero = ent.isPlayer || ent === game.tanks[0] || HERO_TEX_SPECS.has(ent.specId);
  ent.visual = createTank(ent.specId, engineCtx, {
    camoSeed: ent._camoSeed, quality: hero ? 'high' : 'ai',
  });
  engineCtx.scene.add(ent.visual.root);
  if (game._groundSampler && ent.visual.setGroundSampler) {
    ent.visual.setGroundSampler(game._groundSampler);
  }
  // PERF r3: a deferred staged visual streams in AFTER setupBattle posed the
  // entity — pose it now so it never renders a frame at the origin.
  if (ent.state && ent.visual.syncFromState) {
    ent.visual.syncFromState(ent.state);
    ent.visual.setVisible(true);
  }
  return ent.visual;
}

// PERF r3: specs whose closeup contract shots (tank_closeup_*) frame the
// vehicle at 3-6 m — always hero texture tier regardless of roster role.
const HERO_TEX_SPECS = new Set(['m1a2', 'tiger1', 't34_85', 't90m', 'leo2a7']);

/**
 * MATCHMAKING TIERS (controls_gunnery r3): WoT-style tier per spec, keyed off
 * hp/gun class. Random rosters cap the spread at ±2 around the player's tier
 * — an M1A2 (X) vs a Panzer III (IV) match plinked 20 he_splash hits for
 * 0 damage across 90 s while nothing on the field could threaten the player.
 * Tanks beyond the cap only appear when the ±2 pool cannot fill 7 slots, and
 * then nearest-tier-first (never a tier-II/III vs a tier-X).
 */
// numerically mirrors the HUD's roman-numeral badges (hud.js TIER_BY_ID) so
// the matchmaking the player experiences matches the tiers the roster shows
const SPEC_TIER = {
  m4a3e8: 6, tiger1: 7, t34_85: 6, is2: 7, panther_g: 7,
  m1a2: 10, t90m: 10, leo2a7: 10,
  strv103: 9, is3: 8, t34_85_cad: 6, newc_tiger: 7,
  newc_pziii: 4, pziii_konserwa: 3, leichttraktor: 1, recon_tank: 8, q_heavy: 9,
  // community waves 2+3 (print-model crawl / IS-series hunt)
  kv2: 6, tiger2: 8, sherman_jumbo: 6, jagdtiger: 9, jpz_e100: 10,
  sturmtiger: 8, t95: 9, t30: 9, is7: 10, object279: 10, is6b: 8, is1: 5,
  // MODERN EXPANSION (docs/research/modern-roster.md Appendix A ladder):
  // cold-war 7 · 1st-gen 8 · 2nd-gen 9 · flagship 10 · IFV support 7-8
  m1a1: 9, t90a: 9, m1a2_tusk: 10,
  t72b3: 8, challenger2: 9, merkava4: 9, leo2a6: 9,
  leo2a4: 8, t80u: 8, leclerc: 9, type99a: 9, leo1a5: 7, t14: 10,
  chieftain_mk10: 7, k2: 9, type10: 9, m2a2_bradley: 8, bmp2: 7, ariete: 8,
  // USER DROPS (2026-07-28): Type 74 fills the Japan tier-8 ghost
  type74: 8,
  // USER DROPS wave 2 (recovered batch): Stryker pair + BMP-1
  bmp1: 6, m1128: 8, m1296: 7,
  // USER DROPS wave 4 (recovered batch, final sweep): KF51 tops the German ladder
  kf51: 10,
};
const specTier = (specId) => SPEC_TIER[specId] != null ? SPEC_TIER[specId] : 6;

/**
 * COMMUNITY TANKS: pick this battle's participants — the player plus 7
 * enemies. Deterministic default (the core 8, adjusted when the player drives
 * a community tank); `randomize` shuffles the whole pool (seeded per battle)
 * so random enemy rosters include community vehicles.
 * @returns {object[]} TankEntity[] (player's entity included)
 */
function pickParticipants(game, playerSpecId, randomize, mixedEra = false) {
  const player = game.tankById.get(playerSpecId);
  const enemySlots = 7;
  // PERF (performance_budget r3, certification determinism): an explicit
  // debug roster bypasses the seeded shuffle/era matchmaking so the perf
  // gate measures a PINNED worst-case lineup (all multi-mesh GLB heavies)
  // instead of whatever the pool happens to draw — the round-2 critic
  // measured 1095 worst-frame draw calls on one random roster and 470 on
  // another, on the identical build. Debug/tooling only (perfprobe).
  const forced = (typeof window !== 'undefined' && window.__DEBUG &&
    window.__DEBUG.flags && window.__DEBUG.flags.forceRoster) || null;
  if (Array.isArray(forced) && forced.length) {
    const list = forced
      .map((id) => game.tankById.get(id))
      .filter((e) => e && e !== player);
    return [player, ...list.slice(0, enemySlots)];
  }
  let others;
  if (randomize) {
    const rng = mulberry32(0x51e57 ^ (game.battleCount * 2654435761));
    others = game.allTanks.filter((e) => e !== player);
    for (let i = others.length - 1; i > 0; i--) {       // Fisher-Yates
      const j = (rng() * (i + 1)) | 0;
      [others[i], others[j]] = [others[j], others[i]];
    }
    // MODERN EXPANSION — era-matched matchmaking: a modern battle draws its
    // roster from the modern pool, a WWII battle from the WWII pool. Only the
    // RANDOM battlefield card rolls mixed-era rosters (mixedEra=true from
    // main.js). Era mismatches still back-fill an under-populated pool
    // (never fewer than 7 enemies), nearest-tier first.
    const pEra = player && player.spec ? player.spec.era : null;
    const eraOk = (e) => mixedEra || !pEra || e.spec.era === pEra;
    // Tier cap (±2 template): stable partition of the shuffled pool — legal
    // tiers keep their shuffle order and fill first; the remainder is sorted
    // by tier distance so an under-filled pool degrades to the NEAREST tiers.
    const pTier = specTier(playerSpecId);
    const legal = others.filter((e) => eraOk(e) && Math.abs(specTier(e.specId) - pTier) <= 2);
    const rest = others
      .filter((e) => !(eraOk(e) && Math.abs(specTier(e.specId) - pTier) <= 2))
      .sort((a, b) =>
        (eraOk(a) === eraOk(b) ? 0 : eraOk(a) ? -1 : 1) ||
        (Math.abs(specTier(a.specId) - pTier) - Math.abs(specTier(b.specId) - pTier)));
    others = [...legal, ...rest];
  } else {
    // deterministic staged battle (boot, screenshot contract): core roster
    others = TANK_IDS.filter((id) => id !== playerSpecId).map((id) => game.tankById.get(id));
  }
  return [player, ...others.slice(0, enemySlots)];
}

/**
 * (Re)start a battle: place the chosen tank at the player spawn, the other
 * seven at the enemy spawns, reset movement/combat state and attach AI.
 * @param {object} game game state
 * @param {string} playerSpecId chosen TankId
 * @param {object} world World (§2.7)
 * @param {{random?:boolean}} [opts] COMMUNITY TANKS: random=true shuffles the
 *   enemy roster from the full pool (garage-started battles); default keeps
 *   the deterministic core-8 staging (boot, screenshot contract).
 * @returns {void}
 */
/**
 * EQUIPMENT (camo_spotting r1): per-tank loadout persisted in localStorage
 * (`cot.equip.<specId>` — JSON array of ids from spotting.js EQUIPMENT).
 * Camo net / binoculars / vents effects are applied inside spotting.js.
 * @param {string} specId
 * @returns {?Array<string>} equipped item ids, or null when none saved
 */
export function loadEquipment(specId) {
  try {
    const raw = localStorage.getItem(`cot.equip.${specId}`);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

export function setupBattle(game, playerSpecId, world, opts = {}) {
  const sp = world.spawnPoints;
  for (const sh of game.shells) { if (_shellPool.length < 64) _shellPool.push(sh); }
  game.shells.length = 0;
  game.nextShellId = 1;
  game.timeS = 0;
  game.fireTickAcc = 0;
  game.combatRng = mulberry32(COMBAT_SEED);
  game.result = null;
  game.battleCount++;

  // COMMUNITY TANKS: field the participants; park everyone else (hidden,
  // null state/combat — every sim/HUD/audio consumer guards on those).
  game.tanks = pickParticipants(game, playerSpecId, !!opts.random, !!opts.mixedEra);
  // BOT BIOME CAMO (camo_spotting r5): non-player participants of a random
  // battle roll a 60% chance of fielding the biome-matched AUTO pattern so
  // snowfields/dunes stop being full of factory-green bots (the player's
  // AUTO paint already matched). Runtime overrides only — localStorage and
  // the garage picker are untouched; the player's spec is never rolled
  // (participants are keyed by spec id, so no bot shares it). Seeded per
  // battle for reproducibility. main.js startBattle calls setCamoBiome
  // BEFORE setupBattle, so the repaint below resolves the right biome; the
  // trailing applyCamoPatterns() also restores factory paint on entries a
  // PREVIOUS battle's overrides repainted (cheap no-op otherwise).
  clearCamoOverrides();
  if (opts.random) {
    const camoRng = mulberry32(8600 + game.battleCount);
    for (const ent of game.tanks) {
      if (ent.specId === playerSpecId) continue;
      if (camoRng() < 0.6) setCamoOverride(ent.specId, 'auto');
    }
  }
  applyCamoPatterns();
  // PERF (performance_budget r4): participants get visuals on demand; parked
  // vehicles' visuals are EVICTED (scene detach + dispose) so only fielded
  // tanks keep generated texture sets resident — see spawnTanks.
  // PERF r3: the BOOT staging call defers the 7 enemy bakes off the
  // load-to-ready path (opts.deferVisuals; main.js streams them post-ready
  // via ensureStagedVisuals — see spawnTanks). Real battle entries build
  // eagerly, exactly as before.
  if (!opts.deferVisuals) {
    for (const ent of game.tanks) ensureTankVisual(game, ent);
  } else {
    ensureTankVisual(game, game.tanks[0]); // the player is always staged
  }
  for (const ent of game.allTanks) {
    if (game.tanks.includes(ent)) continue;
    ent.state = null;
    ent.combat = null;
    ent.ai = null;
    ent.aiCtl = null;
    ent.team = 'enemy';
    ent.isPlayer = false;
    // gameplay_feel r5: the rigid-gear stamp belongs to the DISPOSED visual —
    // a recycled slot may get a procedural (conform-capable) visual next.
    ent.rigidGear = false;
    if (ent.visual) {
      if (ent.visual.resetDestroyed) ent.visual.resetDestroyed();
      ent.visual.setVisible(false);
      game._engineCtx.scene.remove(ent.visual.root);
      ent.visual.dispose();
      ent.visual = null;
    }
  }

  // SPOTTING WIRING: fresh concealment/spotting sim bound to this battle's
  // world (raycast for hard cover, vegetation discs for bush concealment).
  game.spotting = createSpottingSystem({
    getTanks: () => game.tanks,
    raycast: world.raycast,
    concealers: world.getConcealment ? world.getConcealment() : [],
    getCamoBonus: (ent) => (hasCamoPaint(ent.specId) ? CAMO_PAINT_BONUS : 0),
    // EQUIPMENT layer (camo_spotting r1): camo net (+0.12 still), binoculars
    // (+25% spotter view still), vents (+2%/+2%) — table in spotting.js.
    getEquipment: (ent) => loadEquipment(ent.specId),
    rng: mulberry32(9100),
  });

  const aiDeps = {
    heightField: world.heightField,
    raycast: world.raycast,
    getObstacles: () => world.getObstacles(),
  };

  // SYMMETRIC TEAMS (hud_ui r1): 3 of the 7 non-player participants fight as
  // ALLIES on the player's team — WoT identity requires mirrored team panels
  // (the old 1v7 split rendered an impossible 1/1 vs 7/7 roster). Deterministic
  // default keeps tiger1 an ENEMY (killcam_xray stages a player shot into it)
  // and mirrors the tier spread; random rosters take the first 3 shuffled.
  const nonPlayers = game.tanks.filter((e) => e.specId !== playerSpecId);
  let allyPick;
  if (opts.random) {
    allyPick = nonPlayers.slice(0, 3);
  } else {
    const preferred = ['m4a3e8', 't34_85', 'panther_g'];
    allyPick = nonPlayers.filter((e) => preferred.includes(e.specId));
    for (const e of nonPlayers) {
      if (allyPick.length >= 3) break;
      if (e.specId === 'tiger1' || allyPick.includes(e)) continue;
      allyPick.push(e);
    }
    allyPick = allyPick.slice(0, 3);
  }
  const allySet = new Set(allyPick);
  // Allies spawn AROUND the player spawn: lateral offsets perpendicular to
  // the player spawn yaw, settled onto the heightfield.
  const ALLY_OFFSETS_M = [22, -22, 44];
  const _ppYaw = sp.player.yaw;
  const _perpX = Math.cos(_ppYaw);
  const _perpZ = -Math.sin(_ppYaw);
  // Enemy spawn centroid: the allies' opening push target.
  let _ecx = 0, _ecz = 0;
  for (const es of sp.enemies) { _ecx += es.pos[0]; _ecz += es.pos[2]; }
  _ecx /= sp.enemies.length || 1;
  _ecz /= sp.enemies.length || 1;

  let enemyIdx = 0;
  let allyIdx = 0;
  game.tanks.forEach((ent, i) => {
    const isPlayer = ent.specId === playerSpecId;
    const isAlly = !isPlayer && allySet.has(ent);
    let spawn;
    if (isPlayer) {
      spawn = sp.player;
    } else if (isAlly) {
      // content_breadth r1: slope-reject ally cells. A lateral offset can
      // land on a mesa/cliff wall (terrain normal.y < 0.85) and the tank
      // renders fused into the rock; walk outward along the perp axis in
      // 9 m steps until a drivable cell is found (worst case: keep the
      // original offset rather than stack on the player).
      const base = ALLY_OFFSETS_M[allyIdx++ % ALLY_OFFSETS_M.length];
      let ax = sp.player.pos[0] + _perpX * base;
      let az = sp.player.pos[2] + _perpZ * base;
      if (world.heightField.getNormalAt) {
        for (let k = 0; k < 8; k++) {
          const off = base + Math.sign(base || 1) * k * 9;
          const cx = sp.player.pos[0] + _perpX * off;
          const cz = sp.player.pos[2] + _perpZ * off;
          if (world.heightField.getNormalAt(cx, cz).y >= 0.85) { ax = cx; az = cz; break; }
        }
      }
      spawn = { pos: [ax, world.heightField.getHeightAt(ax, az), az], yaw: sp.player.yaw };
    } else {
      spawn = sp.enemies[enemyIdx++];
    }
    _spawnPos.set(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
    ent.team = isPlayer || isAlly ? 'player' : 'enemy';
    ent.isPlayer = isPlayer;
    ent.state = createTankState(ent.spec, _spawnPos, spawn.yaw);
    ent.combat = createCombatState(ent.spec);
    ent.input.throttle = 0;
    ent.input.steer = 0;
    ent.input.brake = false;
    ent.input.fire = false;
    ent.input.shellSlot = 0;
    ent.input.aimPoint.copy(ent.state.aimPoint);
    ent._destroyedAnnounced = false;
    ent._lastImpactT = -1; // impact-event cooldown must not carry across battles
    ent.ai = null;
    // Rematch: undo any wreck look / thrown tracks / stripped ERA from the
    // previous battle (visuals only — combat state above is already fresh).
    // PERF r3: visual may still be streaming in (boot deferVisuals path) —
    // a fresh build needs no reset.
    if (ent.visual && ent.visual.resetDestroyed) ent.visual.resetDestroyed();
    if (isPlayer) {
      game.player = ent;
      ent.aiCtl = null;
    } else {
      ent.aiCtl = createAI(ent, {
        difficulty: getStoredDifficulty(),
        rng: mulberry32(7000 + i),
        deps: {
          ...aiDeps,
          // SYMMETRIC TEAMS: every bot fights the OPPOSING team (allied bots
          // hunt enemies; enemy bots engage the player AND the allies).
          getEnemies: () => game.tanks.filter(
            (t) => t.team !== ent.team && t.combat && !t.combat.destroyed),
          // AI target acquisition goes THROUGH the spotting sim (§camo
          // charter) from the bot's OWN team's intel, with the bot as the
          // radio-debuff receiver (simulation_correctness r1).
          spotting: {
            isSpotted: (id, receiver) =>
              (game.spotting ? game.spotting.isSpotted(id, ent.team, receiver) : true),
          },
        },
      });
      // Open aggressively: advance via a mid-map staging point to a standoff
      // ring around the opposing spawn, so contact happens inside the first
      // 45 s instead of bots idling on local patrol loops at their spawn.
      // The first enemy of every battle is the FLANKER: it pushes to a much
      // tighter ring so someone always forces early contact; the rest stage
      // at 140-190 m. (Bots stuck on obstacles now skip waypoints — ai.js
      // progress-based unstick — so the push survives walls and rocks.)
      const pp = ent.team === 'enemy' ? sp.player.pos : [_ecx, 0, _ecz];
      const dx = pp[0] - spawn.pos[0];
      const dz = pp[2] - spawn.pos[2];
      const d = Math.hypot(dx, dz) || 1;
      const standoff = Math.min(d, ent.team === 'enemy' && enemyIdx === 1
        ? 100
        : 140 + ((ent.team === 'enemy' ? enemyIdx : allyIdx) % 3) * 25);
      // Final leg sweeps THROUGH the opposing spawn: a patrol that reaches
      // its standoff ring without contact keeps hunting toward the last
      // place the opposition was guaranteed to be, so proximity spotting
      // (50 m floor) eventually forces contact instead of a stare-down
      // behind cover.
      ent.aiCtl.setWaypoints([
        [spawn.pos[0] + dx * 0.5, spawn.pos[2] + dz * 0.5],
        [pp[0] - (dx / d) * standoff, pp[2] - (dz / d) * standoff],
        [pp[0], pp[2]],
      ]);
    }
    // Spawn warm-start (r5 terrain-contact gate): run the movement sim for a
    // few ticks so the attitude spring settles and the terrain support solve
    // owns pos.y BEFORE the first rendered frame — the raw spawn pose (flat
    // attitude, pad-center height) rendered one frame with a track end
    // clipped ~0.3 m into the pad-edge slope. Rigid-gear detection first: a
    // reused garage/pool visual may already be GLB-swapped at restage.
    refreshRigidGear(ent);
    for (let k = 0; k < 30; k++) updateTank(ent, world.heightField, SIM_DT);
    // PERF r3: deferred boot visuals sync when ensureTankVisual builds them
    if (ent.visual) {
      ent.visual.syncFromState(ent.state);
      ent.visual.setVisible(true);
    }
  });
}

// ---------------------------------------------------------------------------
// Fixed-step simulation
// ---------------------------------------------------------------------------

/**
 * gameplay_feel r5 (terrain-contact hard gate): stamp `ent.rigidGear = true`
 * once the entity's visual has GLB-swapped. movement.js softens its wheel-run
 * support lines (FAN_YIELD) only on the premise that tankFactory's per-wheel
 * conform layer absorbs the yielded terrain — modelLoader.applySwap HIDES the
 * procedural running gear (stamping hullG.userData.__glbSwapped on the hull
 * group, a direct child of the visual root) and renders rigid GLB wheels
 * with no conform, so the yield buried them up to 9 cm on rough corridors.
 * The swap is one-way and can land any time after the visual builds (deferred
 * stream-in), so poll the direct root children each tick until found — a
 * handful of flag reads per tank, no traversal. movement.js reads the flag
 * and hard-clamps every support line for rigid gear.
 * @param {object} ent pool entity
 * @returns {void}
 */
function refreshRigidGear(ent) {
  if (ent.rigidGear || !ent.visual || !ent.visual.root) return;
  const kids = ent.visual.root.children;
  for (let i = 0; i < kids.length; i++) {
    const ud = kids[i].userData;
    if (ud && ud.__glbSwapped) { ent.rigidGear = true; return; }
  }
}

/** Tank-vs-tank + tank-vs-obstacle circle pushback used by movement. */
function makeCollide(game, world) {
  let self = null;
  const obstacles = world.getObstacles();
  function collide(pos, radiusM, outPush) {
    outPush.set(0, 0, 0);
    let pushed = false;
    // other tanks
    for (const other of game.tanks) {
      if (other === self || !other.state) continue;
      const oR = other.spec.dims.widthM * 0.75;
      const minD = radiusM + oR;
      _toC.set(pos.x - other.state.pos.x, 0, pos.z - other.state.pos.z);
      const d = _toC.length();
      if (d > 1e-4 && d < minD) {
        outPush.addScaledVector(_toC, (minD - d) / d);
        pushed = true;
      }
    }
    // static obstacle AABBs (2D footprint, expanded by radius)
    for (const ob of obstacles) {
      if (pos.y > ob.max[1] + 0.5) continue;
      const cx = Math.max(ob.min[0], Math.min(pos.x, ob.max[0]));
      const cz = Math.max(ob.min[2], Math.min(pos.z, ob.max[2]));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radiusM * radiusM) {
        const d = Math.sqrt(Math.max(d2, 1e-6));
        _push2.set(dx / d, 0, dz / d);
        outPush.addScaledVector(_push2, radiusM - d);
        pushed = true;
      }
    }
    return pushed;
  }
  return { collide, setSelf(e) { self = e; } };
}

/** Emit the derived bus events flagged inside one HitEvent. */
function emitHitOutcome(game, bus, ev) {
  const target = ev.targetId ? game.tankById.get(ev.targetId) : null;
  // SHOT-INFO ENRICHMENT (ADDITIVE ONLY — consumed by src/ui/shotInfo.js):
  // resolve ids to names/spec ids + stamp sim time. Existing fields untouched.
  ev.timeS = game.timeS;
  const attacker = ev.attackerId ? game.tankById.get(ev.attackerId) : null;
  if (attacker && attacker.spec) {
    ev.attackerName = attacker.spec.name;
    ev.attackerSpecId = attacker.specId;
  }
  if (target && target.spec) {
    ev.targetName = target.spec.name;
    ev.targetSpecId = target.specId;
    ev.targetMaxHp = target.combat ? target.combat.maxHp : 0;
  }
  // KILL-CAM CAPTURE (ADDITIVE — src/game/killcam.js): snapshot the fully
  // resolved event chain + victim pose for lethal-shot replays. main.js
  // assigns game.killcam; nothing here changes when it is absent.
  if (game.killcam) game.killcam.onShellHit(ev, target);
  bus.emit('shell:hit', ev);
  if (ev.modulesHit && ev.modulesHit.length && ev.targetId) {
    for (const m of ev.modulesHit) {
      bus.emit('module:state', { id: ev.targetId, module: m.module, state: m.newState });
    }
  }
  if (ev.fireStarted && ev.targetId) {
    bus.emit('tank:fire', { id: ev.targetId, burning: true });
  }
  if (ev.destroyed && target && !target._destroyedAnnounced) {
    announceDestroyed(game, bus, target, ev.attackerId, ev.ammoRacked ? 'ammorack' : 'shot');
  }
  const shooter = game.tankById.get(ev.attackerId);
  if (shooter && shooter.aiCtl) shooter.aiCtl.notifyShellResult(ev);
  // UNDER-FIRE REACTION (controls_gunnery r2): being shot reveals the shooter
  // (tracer + muzzle flash). The victim and teammates within 200 m turn on
  // the attacker even when the shot came from outside their normal spotting
  // and engage envelopes — return fire pressure is core WoT feel.
  if (shooter && target && target.state && target.combat &&
      shooter.team !== target.team) {
    for (const ent of game.tanks) {
      if (ent.team !== target.team || !ent.aiCtl || !ent.state ||
          !ent.combat || ent.combat.destroyed) continue;
      if (ent !== target &&
          ent.state.pos.distanceToSquared(target.state.pos) > 200 * 200) continue;
      if (ent.aiCtl.notifyUnderFire) ent.aiCtl.notifyUnderFire(shooter);
    }
  }
}

function announceDestroyed(game, bus, ent, killerId, cause) {
  ent._destroyedAnnounced = true;
  // turret toss is RESERVED for ammo-rack detonations (WoT spectacle);
  // plain HP kills / burn-outs keep the turret seated (gun droop + smoke)
  ent.visual.setDestroyed({ pop: cause === 'ammorack' });
  bus.emit('tank:destroyed', {
    id: ent.id,
    specId: ent.specId,
    pos: [ent.state.pos.x, ent.state.pos.y, ent.state.pos.z],
    killerId,
    cause,
  });
}

/** Fire the loaded shell if the trigger is held and the gun is ready. */
function tryFire(game, ent, bus, rig) {
  const c = ent.combat;
  if (!ent.input.fire || c.destroyed || c.reload.t > 0) return;
  if (c.modules.gun && c.modules.gun.state === 'red') return;
  const slot = Math.max(0, Math.min(2, ent.input.shellSlot | 0));
  if (slot !== c.shellSlot) c.shellSlot = slot;
  const shellSpec = ent.spec.gun.shells[c.shellSlot];

  // Barrel direction from the visual (already chasing input.aimPoint).
  // controls_gunnery r3 CRITICAL: use the articulated bore AXIS (recoil-group
  // +Z), NOT muzzle-minus-pivot — on GLB-swapped tanks the muzzle anchor is
  // re-derived from real tube-tip vertices and sits off the trunnion axis
  // (m1a2: ~45 mrad skew), so the anchor-difference line pointed every
  // "settled" shot ~15 m wide at 330 m while the sim gun-lay was perfect.
  ent.visual.gunMuzzleWorld(_muzzle);
  if (ent.visual.gunDirWorld) {
    ent.visual.gunDirWorld(_dir);
  } else {
    ent.visual.gunPivotWorld(_pivot);
    _dir.copy(_muzzle).sub(_pivot).normalize();
  }

  // Server-gun correction (WoT rule: the shot goes where the GUN is aimed,
  // i.e. the server aim point — the rendered barrel is cosmetic and can sit a
  // fraction of a degree off the sim's ideal solution). When the barrel has
  // settled onto the aim point (within ~2°), fire exactly at it so the impact
  // matches the reticle at server-aim distance; while still slewing, the shell
  // follows the barrel.
  _aimDir.copy(ent.input.aimPoint).sub(_muzzle);
  const aimLen = _aimDir.length();
  if (aimLen > 4) {
    _aimDir.multiplyScalar(1 / aimLen);
    if (_dir.dot(_aimDir) > 0.99939) _dir.copy(_aimDir); // cos ~2.0°
  }

  // Ballistic elevation for the aimed range (WoT-style auto-elevation).
  const dist = ent.input.aimPoint.distanceTo(_muzzle);
  const elev = aimElevationRad(dist, shellSpec.velocityMps);
  _upOrtho.copy(UP).addScaledVector(_dir, -UP.dot(_dir));
  if (_upOrtho.lengthSq() > 1e-8) {
    _upOrtho.normalize();
    _dir.multiplyScalar(Math.cos(elev)).addScaledVector(_upOrtho, Math.sin(elev)).normalize();
  }

  // Dispersion: sigmaRad = r(100 m)/200 (§3.5.1 locked), gun yellow ⇒ σ×2.
  let sigmaRad = computeDispersionRadM(ent.spec, ent.state, 100) / 200;
  if (c.modules.gun && c.modules.gun.state === 'yellow') sigmaRad *= 2;
  applyDispersion(_dir, sigmaRad, game.combatRng);

  const shell = acquireShell(shellSpec, ent.id, ent.isPlayer, _muzzle, _dir, game.nextShellId++);
  game.shells.push(shell);
  fireRecoil(ent.state, ent.spec);
  ent.visual.recoilKick();
  if (ent.isPlayer && rig) {
    rig.addTrauma(0.25);
    if (rig.recoilKick) rig.recoilKick(0.012);
  }
  _firedEv.shellId = shell.id;
  _firedEv.shooterId = ent.id;
  _firedEv.isPlayer = ent.isPlayer;
  _firedEv.shellType = shellSpec.type;
  _firedEv.shellName = shellSpec.name; // SHOT-INFO ENRICHMENT (additive)
  _firedEv.caliberMm = shellSpec.caliberMm;
  _firedEv.muzzlePos[0] = _muzzle.x; _firedEv.muzzlePos[1] = _muzzle.y; _firedEv.muzzlePos[2] = _muzzle.z;
  _firedEv.dir[0] = _dir.x; _firedEv.dir[1] = _dir.y; _firedEv.dir[2] = _dir.z;
  bus.emit('shell:fired', _firedEv);
  startReload(c, ent.spec);
  // SPOTTING WIRING: firing blooms the shooter's camo (with decay) and lights
  // up any concealing foliage within 15 m (see src/sim/spotting.js).
  if (game.spotting) game.spotting.notifyFired(ent.id, game.timeS);
  // PLAYER MUZZLE-FLASH INTEL (controls_gunnery r5): a firing player is
  // visible intel — muzzle flash + tracer — to every enemy within 420 m,
  // even while camo keeps them formally unspotted. WW2 bots (350-380 m view
  // range) could otherwise never acquire a 400 m sniping player: the r5
  // probe measured 29+ enemy shells across two 60 s runs with ZERO aimed at
  // the player. ai.js notifyPlayerFired re-reveals the player for
  // MUZZLE_INTEL_WINDOW_S and hard-commits idle bots onto the shooter.
  if (ent.isPlayer) {
    // controls_gunnery r4: DISTANCE-RANKED fan-out — ai.js's RETURN-FIRE
    // LOCK lets the nearest ranked receivers with a clear personal ray pin
    // the player as their target outright (rank 0 = closest). Runs once per
    // player shot, so the sort allocation is negligible.
    // r4: earshot 420 -> 500 m — the intel radius must exceed the worst
    // spawn standoff (~450 m) the same way engageRangeM had to (r7 tier
    // note), or opening snipes from spawn draw zero receivers at all.
    const near = [];
    for (const e of game.tanks) {
      if (e === ent || e.team === ent.team || !e.aiCtl || !e.state ||
          !e.combat || e.combat.destroyed) continue;
      const d2 = e.state.pos.distanceToSquared(ent.state.pos);
      if (d2 > 500 * 500) continue;
      near.push({ e, d2 });
    }
    near.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < near.length; i++) {
      const e = near[i].e;
      if (e.aiCtl.notifyPlayerFired) e.aiCtl.notifyPlayerFired(ent, i);
    }
  }
}

/** Advance all live shells one step and resolve collisions. */
function stepShells(game, bus, world) {
  const shells = game.shells;
  for (let si = 0; si < shells.length; si++) {
    const shell = shells[si];
    if (shell.dead) continue;
    stepShell(shell, SIM_DT);

    _seg.copy(shell.pos).sub(shell.prevPos);
    const segLen = _seg.length();
    if (segLen < 1e-6) {
      if (shell.dead) bus.emit('shell:expired', { shellId: shell.id, pos: [shell.pos.x, shell.pos.y, shell.pos.z], hitTerrain: false });
      continue;
    }
    _seg.multiplyScalar(1 / segLen);

    const worldHit = world.raycast(shell.prevPos, _seg, segLen);
    const worldT = worldHit ? worldHit.dist : Infinity;

    // Broadphase: nearest tank whose armor trace yields intersections.
    let bestT = Infinity;
    let bestEnt = null;
    let bestHits = null;
    for (const ent of game.tanks) {
      // Wrecks stay in the broadphase: resolveShellHit branches to
      // resolveWreckHit for destroyed hulls (cover tactics — WoT core).
      if (!ent.state || !ent.combat) continue;
      if (ent.id === shell.shooterId) continue;
      const r = ent.spec.armor.boundingRadiusM;
      _toC.copy(ent.state.pos);
      _toC.y += ent.spec.dims.heightM * 0.5;
      _toC.sub(shell.prevPos);
      const proj = Math.max(0, Math.min(segLen, _toC.dot(_seg)));
      const d2 = _toC.lengthSq() - proj * proj;
      if (d2 > r * r) continue;
      const pose = tankPoseFromState(ent.state);
      const hits = traceTank(shell.prevPos, shell.pos, pose, ent.spec.armor, ent.combat.eraSpent);
      if (!hits.length) continue;
      const t = hits[0].t * segLen;
      if (t < bestT) { bestT = t; bestEnt = ent; bestHits = hits; }
    }

    if (bestEnt && bestT <= worldT) {
      if (isHeClass(shell.spec.type)) {
        const burst = bestHits[0].point;
        const events = resolveHeBurst(shell, burst, game.tanks, bestEnt, bestHits, game.combatRng);
        for (const ev of events) emitHitOutcome(game, bus, ev);
      } else {
        const ev = resolveShellHit(shell, bestEnt, bestHits, game.combatRng);
        emitHitOutcome(game, bus, ev);
      }
    } else if (worldHit) {
      if (isHeClass(shell.spec.type)) {
        const events = resolveHeBurst(shell, worldHit.point, game.tanks, null, null, game.combatRng);
        for (const ev of events) emitHitOutcome(game, bus, ev);
      } else {
        shell.dead = true;
      }
      bus.emit('shell:expired', {
        shellId: shell.id,
        pos: [worldHit.point.x, worldHit.point.y, worldHit.point.z],
        hitTerrain: worldHit.kind === 'terrain',
      });
    } else if (shell.dead) {
      // lifetime expiry mid-air
      bus.emit('shell:expired', { shellId: shell.id, pos: [shell.pos.x, shell.pos.y, shell.pos.z], hitTerrain: false });
    }
  }
  // compact + recycle (nothing retains a shell past its death: killcam copies
  // positions, fx trails copy into their own arrays, damage events copy fields)
  for (let i = shells.length - 1; i >= 0; i--) {
    if (shells[i].dead) {
      if (_shellPool.length < 64) _shellPool.push(shells[i]);
      shells.splice(i, 1);
    }
  }
}

/** Red-module auto-repair to yellow (hp = 50%) after 10 s (§2.4 locked). */
function tickRepairs(game, bus, dt) {
  for (const ent of game.tanks) {
    const c = ent.combat;
    if (!c || c.destroyed) continue;
    for (const name of Object.keys(c.modules)) {
      const m = c.modules[name];
      if (m.state !== 'red') continue;
      m.repairT += dt;
      if (m.repairT >= MODULE_REPAIR_S) {
        m.repairT = 0;
        m.hp = m.maxHp * 0.5;
        m.state = 'yellow';
        bus.emit('module:state', { id: ent.id, module: name, state: 'yellow' });
      }
    }
  }
}

/**
 * One fixed simulation step (ARCHITECTURE.md §4 step 2).
 * @param {object} game game state
 * @param {object} bus event bus
 * @param {object} world World
 * @param {object} rig camera rig (trauma on player fire)
 * @param {object} collider makeCollide bundle (created once via createCollider)
 * @returns {void}
 */
export function simStep(game, bus, world, rig, collider) {
  const dt = SIM_DT;
  game.timeS += dt;

  // a0. SPOTTING WIRING: periodic concealment checks (staggered inside the
  // system — 0.5-2 s cadence, never per-frame). Newly-spotted events feed the
  // sixth-sense lamp when the player is the one lit up.
  if (game.spotting) {
    const spotEvents = game.spotting.update(dt, game.timeS);
    for (const ev of spotEvents) {
      bus.emit('tank:spotted', ev);
      if (game.player && ev.id === game.player.id && ev.team === 'enemy') {
        bus.emit('player:spotted', { timeS: game.timeS });
      }
    }
  }

  // a. AI writes inputs
  for (const ent of game.tanks) {
    if (ent.aiCtl && !ent.combat.destroyed) ent.aiCtl.update(dt, game.timeS);
  }

  // b. movement
  for (const ent of game.tanks) {
    if (!ent.state || ent.combat.destroyed) continue;
    refreshRigidGear(ent); // GLB swap detection for the support-solve yield
    collider.setSelf(ent);
    updateTank(ent, world.heightField, dt, collider.collide);
    // r2 blocked-drive impact (gameplay_feel critique MAJOR): movement now
    // bleeds the wall-blocked speed component and reports the closing speed
    // it absorbed (state.impactMps). Surface it as feedback — WoT slams to a
    // halt with a clank + camera jolt instead of running-in-place. The
    // >1.5 m/s (~5.4 km/h) floor means ONE event per genuine hit; leaning on
    // the wall afterwards re-bleeds only ~accel·dt per tick and stays silent.
    const impact = ent.state.impactMps;
    if (impact > 1.5 && game.timeS - (ent._lastImpactT || -1) > 0.3) {
      // 0.3 s per-entity cooldown: a hard hit can bleed across 2 sim ticks
      // (first tick absorbs only the sub-tick overshoot into the wall) — one
      // collision must read as ONE clank/jolt, not a 16 ms double-tap.
      ent._lastImpactT = game.timeS;
      if (ent.isPlayer && rig) {
        rig.addTrauma(Math.min(0.5, 0.10 + impact * 0.030)); // 10 m/s ≈ 0.4
      }
      bus.emit('tank:impact', {
        id: ent.id,
        specId: ent.specId,
        isPlayer: ent.isPlayer,
        speedMps: impact,
        pos: [ent.state.pos.x, ent.state.pos.y, ent.state.pos.z],
      });
    }
  }

  // c. reload timers + firing
  for (const ent of game.tanks) {
    const c = ent.combat;
    if (!c || c.destroyed) continue;
    if (c.reload.t > 0) {
      c.reload.t = Math.max(0, c.reload.t - dt);
      if (ent.isPlayer) bus.emit('player:reload', { t: c.reload.t, total: c.reload.totalS });
    }
    tryFire(game, ent, bus, rig);
  }

  // KILL-CAM CAPTURE (ADDITIVE — src/game/killcam.js): record trajectory
  // points for every live shell (new shells contribute their muzzle position;
  // the impact point is appended at capture time from the HitEvent).
  if (game.killcam) game.killcam.recordSimStep(game);

  // d. shells
  stepShells(game, bus, world);

  // e. fire ticks every 0.5 s + module auto-repair
  game.fireTickAcc += dt;
  if (game.fireTickAcc >= FIRE_TICK_S) {
    game.fireTickAcc -= FIRE_TICK_S;
    for (const ent of game.tanks) {
      const c = ent.combat;
      if (!c || c.destroyed || !c.fire.burning) continue;
      const r = tickFire(ent, game.combatRng);
      if (r.extinguished) bus.emit('tank:fire', { id: ent.id, burning: false });
      if (r.destroyed && !ent._destroyedAnnounced) {
        announceDestroyed(game, bus, ent, ent.id, 'fire');
      }
    }
  }
  tickRepairs(game, bus, dt);

  // win/lose (plus draw when the 15:00 battle clock runs out).
  // killcam_shotinfo r1: the player's death no longer hard-ends the battle —
  // WoT-style, the team fights on (main.js plays the death replay at the
  // moment of death and drops into the wreck-orbit spectate cam). DEFEAT is
  // a TEAM verdict: player dead AND no allies left standing.
  if (game.result === null && game.player) {
    let enemiesLeft = 0;
    let alliesLeft = 0;
    for (const ent of game.tanks) {
      if (!ent.combat || ent.combat.destroyed) continue;
      // SYMMETRIC TEAMS: only ENEMY-team survivors block victory (allied
      // survivors are the point of having allies).
      if (ent.team === 'enemy') enemiesLeft++;
      else if (!game.player || ent.id !== game.player.id) alliesLeft++;
    }
    if (enemiesLeft === 0) game.result = 'victory';
    else if (game.player.combat.destroyed && alliesLeft === 0) game.result = 'defeat';
    else if (game.timeS >= BATTLE_TIME_LIMIT_S) game.result = 'draw';
    // SHOT-INFO ENRICHMENT (additive): announce the decision once so results
    // UIs (src/ui/shotInfo.js session stats) can render without polling.
    if (game.result !== null) {
      bus.emit('battle:ended', {
        result: game.result, timeS: game.timeS,
        map: game.mapId, // SHOT-INFO ENRICHMENT (r3): report header map name
        // SHOT-INFO ENRICHMENT (additive): full team roster for the report
        roster: game.tanks.map((t) => ({
          id: t.id, specId: t.specId,
          vehicle: t.spec ? t.spec.name : t.specId,
          team: t.team,                                  // 'player' | 'enemy'
          alive: !(t.combat && t.combat.destroyed),
          isPlayer: !!(game.player && t.id === game.player.id),
        })),
      });
    }
  }
}

/**
 * Create the shared collision closure bundle for movement pushback.
 * @param {object} game game state
 * @param {object} world World
 * @returns {{collide:Function, setSelf:Function}}
 */
export function createCollider(game, world) {
  return makeCollide(game, world);
}
