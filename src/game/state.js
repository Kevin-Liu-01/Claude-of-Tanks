/**
 * state.js — integration-owned game state: the event bus, the tank roster,
 * battle setup, and the fixed-step combat simulation (ARCHITECTURE.md §1.5,
 * §2.4, §4 step 2). No rendering here; the render loop lives in main.js.
 */
import * as THREE from 'three';
import { getSpec, TANK_IDS, RUNTIME_TANK_IDS } from '../vehicles/specs.js';
import { createTank } from '../vehicles/fleetFactory.js';
import { tankTier } from '../vehicles/tier.js';
import {
  createTankState, updateTank, fireRecoil, shotRecoilScale, computeDispersionRadM, SIM_DT,
} from '../sim/movement.js';
import {
  createShell, stepShell, applyDispersion, guideShellToward, shellGravityMps2,
} from '../sim/ballistics.js';
import { tankPoseFromState, traceTank } from '../sim/armor.js';
import {
  createCombatState, resolveShellHit, resolveHeBurst, tickFire, tickModuleRepairs,
  selectShell, startPostShotReload, startReload, tickReload, isHeClass, ramDamage,
} from '../sim/damage.js';
import {
  completeGuidedMissileFlight,
  createSpecialActionState,
  finishSpecialActionFire,
  specialActionGuidesShell,
} from '../sim/specialActions.js';
import { createAI, roleOf } from './ai.js';
import { createBotNavigationGrid, planBotRoute } from '../sim/botRoutePlanner.js';
import { pushHullFromObstacle } from '../world/collision.js';
import { getStoredDifficulty } from './input.js';
import { isGarageVisibleTankId, rankMatchCandidates } from './matchmaking.js';
// SPOTTING WIRING: concealment/spotting sim + camo-paint bonus source
import { createSpottingSystem, CAMO_PAINT_BONUS } from '../sim/spotting.js';
import { hasCamoPaint, setCamoOverride, clearCamoOverrides, applyCamoPatterns } from '../vehicles/materials.js';
// EQUIPMENT SYSTEM (game/equipment.js): per-tank loadouts — the player's
// persisted picks, per-role AI defaults, and the equipMults record the
// damage/movement/repair hooks read off CombatState.
import {
  loadEquipment as loadEquipmentCatalog, applyEquipmentToCombat, defaultLoadoutFor,
} from './equipment.js';
import { getDeviceTier } from '../engine/quality.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const COMBAT_SEED = 6000;
// module repair duration lives with the state machine: sim/damage.js REPAIR_S
const FIRE_TICK_S = 0.5;
const BATTLE_TIME_LIMIT_S = 900; // 15:00 clock (HUD counts it down) — timeout = draw

// module-scope scratch — no per-frame allocation
const _muzzle = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _toC = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();

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
  sh.gravityMps2 = shellGravityMps2(shellSpec);
  return sh;
}
const _firedEv = {
  shellId: 0, shooterId: '', isPlayer: false, shellType: '', shellName: '',
  caliberMm: 0, velocityMps: 0, timeS: 0,
  muzzlePos: [0, 0, 0], dir: [0, 0, 0],
};

/**
 * Reference event bus (ARCHITECTURE.md §1.5).
 * @returns {{on:Function, off:Function, emit:Function}}
 */
export function createBus(onEmit = null) {
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
      // DEV flight-recorder seam: snapshot at emission because several hot
      // payloads are deliberately reused after listeners return. Diagnostics
      // are isolated so a recorder failure can never affect gameplay.
      if (onEmit) {
        try { onEmit(ev, payload); } catch (_) { /* diagnostic only */ }
      }
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
    // battle_countdown r1: pre-battle hold (seconds). While > 0 the fixed-step
    // sim never runs — every tank (player included) is frozen and cannot fire
    // or move. Armed to Infinity by the player battle-entry path the moment
    // the roster spawns (so nothing can fire under the loading screen), reset
    // to the visible 5 s countdown when the loading screen drops (openBattle),
    // and 0 on every debug/probe entry path (unchanged behavior there).
    preBattleS: 0,
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
    resultReason: null,         // null | 'elimination' | 'time_limit' | 'network_disconnect'
    spotting: null,             // SPOTTING WIRING: SpottingSystem (per battle)
    openingRouteJobs: [],       // solo deployment A* jobs, drained before rollout
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
  RUNTIME_TANK_IDS.forEach((specId, i) => {
    const spec = getSpec(specId);
    const ent = {
      id: specId,
      specId,
      spec,
      team: 'enemy',
      isPlayer: false,
      state: null,
      combat: null,
      specialAction: createSpecialActionState(spec),
      input: {
        throttle: 0, steer: 0, brake: false, fire: false,
        aimPoint: new THREE.Vector3(), shellSlot: 0,
      },
      visual: null,
      // True when the rendered running gear lacks a complete wheel + belt
      // terrain-conformance layer. Some comparison GLBs remain rigid; newer
      // imports publish __glbConformingGear after both layers are discovered.
      rigidGear: false,
      // gameplay_feel r7: measured GLB contact footprint (null = procedural
      // spec fractions). Stamped with rigidGear — see measureContactGeom.
      contactGeom: null,
      _camoSeed: 4000 + i,
      ai: null,
      aiCtl: null,
      _destroyedAnnounced: false,
    };
    game.allTanks.push(ent);
    game.tankById.set(ent.id, ent);
  });
  // RUNTIME_TANK_IDS is garage/family ordered; the staged screenshot battle is
  // the explicitly locked core roster and must not depend on carousel order.
  game.tanks = TANK_IDS.map((id) => game.tankById.get(id)).filter(Boolean);
  // PERF (performance_budget r3): the staged battle's 7 ENEMY bakes are the
  // single biggest load-to-ready block (~2.2 s of 2048² canvas painting +
  // SimplexNoise + first-use GPU uploads on the boot path; bootprobe:
  // heightToNormal 1050 ms + noise 2.2 s). Nobody can see the staged battle
  // behind the garage screen, so boot builds NONE of it — ensureStagedVisuals()
  // (idempotent, chunked by the caller) builds the roster post-ready, and
  // main.js runs it synchronously from warmCombatPipeline(), which
  // __SHOTS.set() and startBattle() already invoke before anything can look
  // at the battlefield.
  //
  // LOADING PERF (boot r9): the PLAYER's visual used to be built right here,
  // on the boot-critical path — a full hero-tier build (~300-400 ms: 2048²
  // texture bake + geometry + GLB swap kick) for a tank the garage never
  // renders (the pedestal hero is a separate visual; battle visuals are
  // guaranteed by warmCombatPipeline before any battlefield frame). It now
  // streams in with the rest of the staged roster via the post-ready idle
  // pump — the tick loop already guards `!ent.visual` for exactly this
  // deferred window.
}

/**
 * PERF (performance_budget r3): build any still-missing staged-battle
 * visuals. Synchronous and idempotent — a no-op once all 8 exist. `limit`
 * lets the post-ready idle pump build one vehicle per slice so the garage
 * dwell absorbs ~300 ms chunks instead of one 2 s freeze.
 * @param {object} game game state
 * @param {number} [limit] max visuals to build this call (default: all)
 * @param {?function(object):boolean} [predicate] optional roster subset
 * @returns {boolean} true when every staged participant has a visual
 */
export function ensureStagedVisuals(game, limit = Infinity, predicate = null) {
  let built = 0;
  for (const ent of game.tanks) {
    if (ent.visual || (predicate && !predicate(ent))) continue;
    if (built >= limit) return false;
    ensureTankVisual(game, ent);
    built++;
  }
  return true;
}

/** perf-r4b: the next entity ensureStagedVisuals(game, 1) would build, plus
 * the texture tier ensureTankVisual will bake it at — the pre-battle loading
 * loop prebakes that exact entry chunked before the build acquires it.
 * @param {?function(object):boolean} [predicate] optional roster subset
 * @returns {?{ent: object, quality: string}} */
export function nextStagedBake(game, predicate = null) {
  const ent = game.tanks.find((e) => !e.visual && (!predicate || predicate(e)));
  if (!ent) return null;
  return { ent, quality: textureQualityFor(game, ent) };
}

/** Visual-only battle geometry policy; garage/Studio use separate builders. */
export function battleGeometryQuality(playerActor, deviceTier = getDeviceTier()) {
  return !playerActor || deviceTier === 'mobile' ? 'low' : 'high';
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
  // place). AI roster fills bake at a compact tier: 5-7 full hero sets per battle
  // measured 666-685 MB scene textures vs the FROZEN 512 MB gate, and each
  // 2048² bake costs 250-350 ms of main-thread canvas work.
  const textureQuality = textureQualityFor(game, ent);
  const playerActor = ent.isPlayer || ent === game.tanks[0];
  const deviceTier = getDeviceTier();
  const mobileBot = !playerActor && deviceTier === 'mobile';
  const battleBot = !playerActor;
  ent.visual = createTank(ent.specId, engineCtx, {
    camoSeed: ent._camoSeed,
    quality: textureQuality,
    // The low-detail branches are authored per vehicle profile and preserve
    // armor silhouettes. Battle bots use them on every tier, and mobile also
    // uses them for the player's battle-only copy: the full-fidelity garage
    // hero remains untouched while avoiding a desktop-grade build and GPU
    // footprint for a subject mostly framed below the HUD. Desktop players,
    // garage, Studio, and authored close-up paths remain full fidelity.
    geometryQuality: battleGeometryQuality(playerActor, deviceTier),
    // Every battle actor keeps its exact authored geometry while anonymous
    // same-material fittings are transform-baked into articulation-local
    // batches. AI additionally detaches purely cosmetic detail at range. The
    // separate garage/studio constructors remain untouched, and close combat
    // or a killcam restores every retained bot detail automatically.
    batchStatic: true,
    battleDetailLod: battleBot && !mobileBot,
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

function textureQualityFor(game, ent) {
  // The first participant is the player before setupBattle stamps isPlayer.
  // Mobile keeps that close camera subject at hero resolution, but distant
  // bots use the AI tier. Garage selection still upgrades its shared entry.
  // 1024/512 is still finer than the chase-camera projection, while the old
  // 2048/1024 player bake created the single largest cold-entry task. The
  // garage uses this same dedicated close-up preview tier.
  if (ent.isPlayer || ent === game.tanks[0]) return 'preview';
  return getDeviceTier() !== 'mobile' && HERO_TEX_SPECS.has(ent.specId)
    ? 'preview' : 'ai';
}

// Matchmaking and every tier badge consume the same canonical table in
// vehicles/tier.js. This prevents a newly added tank from showing one tier in
// the garage while being matched as another.

/**
 * COMMUNITY TANKS: pick this battle's participants — the player plus the
 * non-player slots. BATTLE-AI r7 (7v7): every RANDOM battle (all garage
 * entries go through startBattle's random:true) fields 13 non-players so the
 * teams split player+6 vs 7. The deterministic staged battle (boot /
 * screenshot contract) keeps the core 8 — killcam_xray and the establishing
 * shots are framed against that roster and no player ever sees it as a
 * battle. `randomize` shuffles the whole pool (seeded per battle) so random
 * rosters include community vehicles.
 * @returns {object[]} TankEntity[] (player's entity included)
 */
function pickParticipants(game, playerSpecId, randomize, battleOrdinal = game.battleCount) {
  const player = game.tankById.get(playerSpecId);
  const enemySlots = randomize ? 13 : 7;
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
    // BATTLE-AI r7: random battles are 7v7 now — a pinned lineup shorter than
    // the slot count (perfprobe's 7-id worst case predates 7v7) TOPS UP from
    // the seeded shuffle so the perf gate measures a real 14-tank battle, not
    // a legacy 8-tank one. battleCount is deterministic per probe run, so the
    // fill is reproducible. Explicit 13-id rosters pin everything as before,
    // and flags.rosterExact suppresses the top-up entirely (perf A/B tooling
    // — an 8-tank control battle is not otherwise reachable post-7v7).
    const exact = typeof window !== 'undefined' && window.__DEBUG &&
      window.__DEBUG.flags && window.__DEBUG.flags.rosterExact;
    if (randomize && !exact && list.length < enemySlots) {
      const rng = mulberry32(0x51e57 ^ (battleOrdinal * 2654435761));
      const pool = game.allTanks.filter((e) =>
        e !== player && !list.includes(e) && isGarageVisibleTankId(e.specId));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      for (const e of pool) {
        if (list.length >= enemySlots) break;
        list.push(e);
      }
    }
    return [player, ...list.slice(0, enemySlots)];
  }
  let others;
  if (randomize) {
    const rng = mulberry32(0x51e57 ^ (battleOrdinal * 2654435761));
    others = game.allTanks.filter((e) => e !== player && isGarageVisibleTankId(e.specId));
    for (let i = others.length - 1; i > 0; i--) {       // Fisher-Yates
      const j = (rng() * (i + 1)) | 0;
      [others[i], others[j]] = [others[j], others[i]];
    }
    // Curated matchmaking: same-era tanks always fill first, ordered by
    // nearest tier. A cross-era tank is now an emergency fallback only when
    // the visible garage roster cannot fill all 13 non-player slots; picking
    // the Random battlefield no longer turns WWII vs modern back on.
    others = rankMatchCandidates(others, player, tankTier);
  } else {
    // deterministic staged battle (boot, screenshot contract): core roster
    others = TANK_IDS.filter((id) => id !== playerSpecId).map((id) => game.tankById.get(id));
  }
  return [player, ...others.slice(0, enemySlots)];
}

/**
 * Resolve the next battle's deterministic participant ids without mutating
 * game state. Battle entry uses this while the battlefield chunk/build is in
 * flight so every required procedural profile can transfer and parse in
 * parallel instead of waiting behind world construction.
 */
export function planBattleParticipantIds(game, playerSpecId, randomize = true) {
  return pickParticipants(game, playerSpecId, randomize, game.battleCount + 1)
    .map((entity) => entity.specId);
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
 * EQUIPMENT (camo_spotting r1 → EQUIPMENT SYSTEM): per-tank loadout persisted
 * in localStorage (`cot.equip.<specId>`). Now delegates to game/equipment.js,
 * which validates ids against the full catalog, era-gates modern-only gear
 * and clamps to the 3 slots. Kept as an export for compatibility.
 * @param {string} specId
 * @returns {?Array<string>} equipped item ids, or null when none saved
 */
export function loadEquipment(specId) {
  const arr = loadEquipmentCatalog(specId, getSpec(specId));
  return arr.length ? arr : null;
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
  game.resultReason = null;
  game.battleCount++;
  game.openingRouteJobs.length = 0;

  // COMMUNITY TANKS: field the participants; park everyone else (hidden,
  // null state/combat — every sim/HUD/audio consumer guards on those).
  game.tanks = pickParticipants(game, playerSpecId, !!opts.random);
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
    // camo_spotting r6 (critic: factory-green ally on open snow in the winter
    // AUTO battle): on high-contrast biomes (winter/desert) a parade-green
    // bot is never plausible — the AUTO roll is ~100% there, with variety
    // carried by the per-spec paint bakes (every whitewash/desert coat is
    // seeded per tank). Verdant/urban keep the 60% mix: green factory paint
    // is plausible against grass and rubble. camoRng is still drawn per bot
    // so the battle seed stream stays position-identical across biomes.
    const forceAuto = game.mapId === 'winter' || game.mapId === 'desert';
    for (const ent of game.tanks) {
      if (ent.specId === playerSpecId) continue;
      const roll = camoRng();
      if (forceAuto || roll < 0.6) setCamoOverride(ent.specId, 'auto');
    }
  }
  // perf-r2f: real battle entries defer this sweep to the caller's CHUNKED
  // pass (main.js startBattle — one yielding sweep covers biome + the rolls
  // above without pinning the loading bar). The synchronous sweep stays for
  // every other caller: ensureShotWorld's capture contract requires the
  // frame to be fully determined when setupBattle returns.
  if (!opts.deferCamoRepaint) applyCamoPatterns();
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
    ent.contactGeom = null; // r7: measured footprint dies with the visual too
    ent._glbContactStampedVisual = null;
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
    // EQUIPMENT layer: vision/concealment items resolve from the loadout
    // attached at spawn (player = saved picks, AI = role defaults) — the
    // old per-check localStorage read leaked the PLAYER'S saved loadout onto
    // any bot fielding the same spec.
    getEquipment: (ent) => ent.equip || null,
    rng: mulberry32(9100),
  });

  const aiDeps = {
    heightField: world.heightField,
    raycast: world.raycast,
    getObstacles: () => world.getObstacles(),
    queryObstacles: world.queryObstacles || null,
    // BATTLE-AI r7: vegetation concealment discs — scouts pick spotting legs
    // through real bushes (state.js nudges their waypoints; ai.js may sample
    // them for repositioning). Absent in headless fixtures.
    getConcealment: () => (world.getConcealment ? world.getConcealment() : []),
  };
  // One immutable terrain/ground/cover scan is shared by every local bot.
  // Opening doctrine still authors the tactical points below; A* only expands
  // each leg into a path this specific drivetrain can actually traverse.
  const botNavigation = createBotNavigationGrid({
    heightField: world.heightField,
    queryObstacles: world.queryObstacles || null,
    getObstacles: () => world.getObstacles(),
  });

  // SYMMETRIC TEAMS (hud_ui r1) → BATTLE-AI r7 (7v7): random battles field 13
  // non-players and split them 6 ALLIES + 7 ENEMIES with a tier-balanced
  // greedy pass — highest tier places first onto the side with the lower
  // running tier sum (the ally side starts pre-loaded with the PLAYER's own
  // tier), capacity-capped at 6/7. The seeded shuffle order stays the
  // tie-break, so rosters remain reproducible per battleCount. The
  // deterministic staged battle keeps the legacy 3-ally pick and its locked
  // team assignments so the establishing-shot framing remains unchanged.
  const nonPlayers = game.tanks.filter((e) => e.specId !== playerSpecId);
  let allyPick;
  if (opts.random) {
    // flags.rosterExact (perf A/B tooling): a pinned short roster splits at
    // the LEGACY ally count (3) so an 8-tank control battle mirrors the old
    // 4v4 shape instead of 7v1.
    const exactCap = typeof window !== 'undefined' && window.__DEBUG &&
      window.__DEBUG.flags && window.__DEBUG.flags.rosterExact &&
      nonPlayers.length < 13 ? 3 : 6;
    const allyCap = Math.min(exactCap, Math.max(1, nonPlayers.length - 1));
    const enemyCap = nonPlayers.length - allyCap;
    const byTier = nonPlayers.slice()
      .sort((a, b) => tankTier(b.specId) - tankTier(a.specId)); // stable sort
    let allySum = tankTier(playerSpecId);
    let enemySum = 0;
    let enemyN = 0;
    allyPick = [];
    for (const e of byTier) {
      const t = tankTier(e.specId);
      const allyRoom = allyPick.length < allyCap;
      const enemyRoom = enemyN < enemyCap;
      // ties go to the enemy side: it fields one more hull, so it fills first
      if (allyRoom && (!enemyRoom || allySum < enemySum)) {
        allyPick.push(e);
        allySum += t;
      } else {
        enemyN++;
        enemySum += t;
      }
    }
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
  // Allies spawn AROUND the player spawn: a 6-slot wedge (two lateral pairs +
  // a rear rank) perpendicular to the player spawn yaw, settled onto the
  // heightfield. BATTLE-AI r7: was a 3-slot lateral line; the wedge keeps the
  // 7-tank team inside a ~110 m x 40 m block — one spawn zone, no scatter.
  const ALLY_SLOTS = [
    { lat: 26, back: 0 }, { lat: -26, back: 0 }, { lat: 52, back: 8 },
    { lat: -52, back: 8 }, { lat: 20, back: 30 }, { lat: -20, back: 30 },
  ];
  const _ppYaw = sp.player.yaw;
  const _perpX = Math.cos(_ppYaw);
  const _perpZ = -Math.sin(_ppYaw);
  const _fwdX = Math.sin(_ppYaw);
  const _fwdZ = Math.cos(_ppYaw);
  const _allyTaken = []; // settled ally cells — no two allies share a cell
  // Enemy spawn centroid: the allies' opening push target.
  let _ecx = 0, _ecz = 0;
  for (const es of sp.enemies) { _ecx += es.pos[0]; _ecz += es.pos[2]; }
  _ecx /= sp.enemies.length || 1;
  _ecz /= sp.enemies.length || 1;

  // BATTLE-AI r7 OPENING PLANS: per-team role counters (ai.js roleOf) so each
  // role opens on its own doctrine lane — see the waypoint block below.
  const _roleCounts = { player: {}, enemy: {} };
  const _teamHasBrawler = { player: false, enemy: false };
  const _teamHasScout = { player: false, enemy: false };
  for (const e of game.tanks) {
    if (e.specId === playerSpecId) continue;
    const team = allySet.has(e) ? 'player' : 'enemy';
    const r = roleOf(e.spec);
    if (r === 'brawler') _teamHasBrawler[team] = true;
    if (r === 'scout') _teamHasScout[team] = true;
  }
  // BATTLE-AI r7: spawn cells must not seed inside prop/tree footprints —
  // a hull materializing in a trunk reads as broken even though the crush
  // system would resolve it on the first meter of drive. 2.6 m margin ~=
  // hull half-width + clearance.
  const _obstacles = world.getObstacles ? world.getObstacles() : [];
  const _cellBlocked = (x, z, margin = 2.6) => {
    for (const o of _obstacles) {
      if (o.crushed) continue;
      if (x > o.min[0] - margin && x < o.max[0] + margin &&
          z > o.min[2] - margin && z < o.max[2] + margin) return true;
    }
    return false;
  };
  const _conceal = world.getConcealment ? world.getConcealment() : [];
  // Snap a scout leg onto the nearest REAL bush (add >= 0.3 — canopy discs
  // soft-conceal at 0.08 and are not hides) within 45 m, else keep the leg.
  const _bushNudge = (x, z) => {
    let bx = x, bz = z, best = 45;
    for (const c of _conceal) {
      if (!c || c.add < 0.3) continue;
      const cd = Math.hypot(c.x - x, c.z - z);
      if (cd < best) { best = cd; bx = c.x; bz = c.z; }
    }
    return [bx, bz];
  };
  const _clampW = (v) => Math.max(-460, Math.min(460, v));
  // BATTLE-AI r7 TOWN SKIRT: on block-grid maps (urban/railyard — town rect
  // >= 200 m wide) opening-lane waypoints that land INSIDE the town are
  // pushed out past the nearest rect edge, so the two fronts meet on the
  // outskirts/streets instead of 14 hulls wedging into the block maze on
  // minute one (r7 flow probe: whole-team 0-shell stalls, 81 s first spot).
  // Engagement-time navigation (vantage + ai.js corner-hop router) owns the
  // street fighting AFTER contact.
  const _village = world.heightField && world.heightField._layout
    ? world.heightField._layout.village : null;
  const _skirtTown = !!(_village && (_village.x1 - _village.x0) >= 200);
  const _skirtWp = (wx, wz) => {
    if (!_skirtTown) return [wx, wz];
    const v = _village;
    const pad = 24, out = 45;
    if (wx < v.x0 - pad || wx > v.x1 + pad ||
        wz < v.z0 - pad || wz > v.z1 + pad) return [wx, wz];
    // exit past the nearest edge — a lane already leaning left skirts left
    const exL = wx - v.x0, exR = v.x1 - wx;
    const ezL = wz - v.z0, ezR = v.z1 - wz;
    const m = Math.min(exL, exR, ezL, ezR);
    if (m === exL) return [v.x0 - out, wz];
    if (m === exR) return [v.x1 + out, wz];
    if (m === ezL) return [wx, v.z0 - out];
    return [wx, v.z1 + out];
  };

  let enemyIdx = 0;
  let allyIdx = 0;
  game.tanks.forEach((ent, i) => {
    const isPlayer = ent.specId === playerSpecId;
    const isAlly = !isPlayer && allySet.has(ent);
    let spawn;
    if (isPlayer) {
      spawn = sp.player;
    } else if (isAlly) {
      // content_breadth r1 → BATTLE-AI r7: slope/water-reject ally cells. A
      // wedge slot can land on a mesa/cliff wall (terrain normal.y < 0.85) or
      // a marsh/strand cell ('soft' ground) and the tank renders fused into
      // rock or bogged at 0 m/s; walk outward along the slot's lateral axis
      // in 9 m steps until a drivable cell is found that no other ally took
      // (worst case: keep the original slot rather than stack on the player).
      const slot = ALLY_SLOTS[allyIdx++ % ALLY_SLOTS.length];
      let ax = sp.player.pos[0] + _perpX * slot.lat - _fwdX * slot.back;
      let az = sp.player.pos[2] + _perpZ * slot.lat - _fwdZ * slot.back;
      if (world.heightField.getNormalAt) {
        for (let k = 0; k < 8; k++) {
          const off = slot.lat + Math.sign(slot.lat || 1) * k * 9;
          const cx = sp.player.pos[0] + _perpX * off - _fwdX * slot.back;
          const cz = sp.player.pos[2] + _perpZ * off - _fwdZ * slot.back;
          if (world.heightField.getNormalAt(cx, cz).y < 0.85) continue;
          if (world.heightField.getGroundType &&
              world.heightField.getGroundType(cx, cz) === 'soft') continue;
          if (_cellBlocked(cx, cz)) continue; // r7: never seed inside a prop
          let taken = false;
          for (const q of _allyTaken) {
            if (Math.hypot(q[0] - cx, q[1] - cz) < 14) { taken = true; break; }
          }
          if (taken) continue;
          ax = cx; az = cz;
          break;
        }
      }
      _allyTaken.push([ax, az]);
      spawn = { pos: [ax, world.heightField.getHeightAt(ax, az), az], yaw: sp.player.yaw };
    } else {
      spawn = sp.enemies[enemyIdx++];
      // BATTLE-AI r7: the arc pads are authored prop-clear, but seeded props
      // can drift onto one as maps evolve — nudge around the pad's 9 m flat
      // core rather than seed a hull inside a trunk.
      if (_cellBlocked(spawn.pos[0], spawn.pos[2])) {
        outer:
        for (const r of [4, 7]) {
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const nx = spawn.pos[0] + Math.sin(a) * r;
            const nz = spawn.pos[2] + Math.cos(a) * r;
            if (_cellBlocked(nx, nz)) continue;
            spawn = {
              pos: [nx, world.heightField.getHeightAt(nx, nz), nz],
              yaw: spawn.yaw,
            };
            break outer;
          }
        }
      }
    }
    _spawnPos.set(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
    ent.team = isPlayer || isAlly ? 'player' : 'enemy';
    ent.isPlayer = isPlayer;
    ent.state = createTankState(ent.spec, _spawnPos, spawn.yaw);
    ent.combat = createCombatState(ent.spec);
    ent.specialAction = createSpecialActionState(ent.spec);
    // EQUIPMENT SYSTEM: attach the loadout — player fights with the garage
    // picks, every bot gets its role-default kit (AI parity: the player is
    // never uniquely advantaged). applyEquipmentToCombat stores the
    // equipMults record the damage/movement/repair hooks read and scales
    // module durability (wet rack / suspension / safety fuel).
    ent.equip = isPlayer
      ? (loadEquipment(ent.specId) || [])
      : defaultLoadoutFor(ent.spec);
    applyEquipmentToCombat(ent.combat, ent.equip, ent.spec);
    ent.input.throttle = 0;
    ent.input.steer = 0;
    ent.input.brake = false;
    ent.input.fire = false;
    ent.input.shellSlot = 0;
    ent.input.aimPoint.copy(ent.state.aimPoint);
    ent._destroyedAnnounced = false;
    ent._openingRoute = null;
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
      const botRng = mulberry32(7000 + i);
      const routeRng = mulberry32(17000 + i);
      ent.aiCtl = createAI(ent, {
        difficulty: getStoredDifficulty(),
        rng: botRng,
        deps: {
          ...aiDeps,
          // SYMMETRIC TEAMS: every bot fights the OPPOSING team (allied bots
          // hunt enemies; enemy bots engage the player AND the allies).
          getEnemies: () => game.tanks.filter(
            (t) => t.team !== ent.team && t.combat && !t.combat.destroyed),
          // BATTLE-AI r7: living teammates — low-HP/tracked bots retreat
          // toward support instead of dying in the open (ai.js doctrine).
          getAllies: () => game.tanks.filter(
            (t) => t !== ent && t.team === ent.team && t.combat && !t.combat.destroyed),
          // AI target acquisition goes THROUGH the spotting sim (§camo
          // charter) from the bot's OWN team's intel, with the bot as the
          // radio-debuff receiver (simulation_correctness r1).
          spotting: {
            isSpotted: (id, receiver) =>
              (game.spotting ? game.spotting.isSpotted(id, ent.team, receiver) : true),
          },
        },
      });
      // BATTLE-AI r7 OPENING PLANS: each bot opens on its CLASS doctrine lane
      // (ai.js roleOf — driven by the bot's own spec) instead of the old
      // one-size standoff push. Both teams advance from their own spawn zones
      // toward the opposing spawn, so the battle opens with two fronts:
      //  - brawlers (heavies + slow MBTs) take the vanguard lanes straight up
      //    the middle to a tight standoff ring — they lead the push;
      //  - flankers (mediums + fast MBTs) swing 95-170 m wide before turning
      //    onto the opposing spawn — support fire from the sides;
      //  - snipers (TDs) drive to a sightline post on their OWN half and hold
      //    it (ai.js shoot-and-scoot relocates them after 1-2 shots);
      //  - scouts (lights/IFVs) run wide spotting legs along real bushes
      //    (_bushNudge) — they light targets up for the team intel net.
      // Every mobile plan still ends ON the opposing spawn: a push that meets
      // nobody keeps hunting toward where the opposition was guaranteed to
      // be, so proximity spotting (50 m floor) eventually forces contact.
      // (Bots stuck on obstacles skip waypoints — ai.js progress unstick —
      // so lanes survive walls and rocks; the lane-starvation fixes stand.)
      const pp = ent.team === 'enemy' ? sp.player.pos : [_ecx, 0, _ecz];
      const dx = pp[0] - spawn.pos[0];
      const dz = pp[2] - spawn.pos[2];
      const d = Math.hypot(dx, dz) || 1;
      const ux = dx / d, uz = dz / d;
      const lx = uz, lz = -ux; // lateral basis (perp of the advance axis)
      const rc = _roleCounts[ent.team];
      let role = roleOf(ent.spec);
      // vanguard guarantee: a team with no brawler promotes its FIRST flanker
      // so somebody always leads the push (early-contact requirement).
      if (role === 'flanker' && !_teamHasBrawler[ent.team] && !rc._vanguard) {
        rc._vanguard = true;
        role = 'brawler';
      } else if (role === 'flanker' && !_teamHasScout[ent.team] && !rc._scoutLane) {
        // spotting-lane guarantee: a scout-less team sends one flanker up a
        // wide scout lane (waypoints only — it still FIGHTS as a flanker) so
        // first contact never waits on a slow heavy grind (autumn probe:
        // 46.7 s first spot on a scout-less draw vs the 45 s gate).
        rc._scoutLane = true;
        role = 'scout';
      }
      const n = rc[role] || 0; // 0-based index within role+team
      rc[role] = n + 1;
      // opposite teams fan to opposite sides first so lanes interleave
      const side = (n % 2 === 0 ? 1 : -1) * (ent.team === 'enemy' ? 1 : -1);
      const W = [];
      if (role === 'sniper') {
        // sightline post on the own half, fanned off the advance axis
        const f = 0.30 + (n % 3) * 0.06;
        const lat = (34 + n * 27) * side;
        W.push([spawn.pos[0] + dx * f + lx * lat, spawn.pos[2] + dz * f + lz * lat]);
      } else if (role === 'scout') {
        const lat = (190 + n * 42) * side;
        W.push(
          _bushNudge(spawn.pos[0] + dx * 0.42 + lx * lat, spawn.pos[2] + dz * 0.42 + lz * lat),
          _bushNudge(spawn.pos[0] + dx * 0.68 + lx * lat * 0.7, spawn.pos[2] + dz * 0.68 + lz * lat * 0.7),
          [pp[0], pp[2]],
        );
      } else if (role === 'flanker') {
        const lat = (95 + (n % 3) * 38) * side;
        const standoff = Math.min(d, 165 + (n % 3) * 22);
        W.push(
          [spawn.pos[0] + dx * 0.45 + lx * lat, spawn.pos[2] + dz * 0.45 + lz * lat],
          [pp[0] - ux * standoff + lx * lat * 0.55, pp[2] - uz * standoff + lz * lat * 0.55],
          [pp[0], pp[2]],
        );
      } else {
        // brawler vanguard: near-center lanes, tightest ring; the first
        // brawler is the spearhead at 105 m so contact always happens early
        const lat = ((n % 3) - 1) * 44 * (ent.team === 'enemy' ? 1 : -1);
        const standoff = Math.min(d, n === 0 ? 105 : 135 + (n % 3) * 22);
        W.push(
          [spawn.pos[0] + dx * 0.5 + lx * lat, spawn.pos[2] + dz * 0.5 + lz * lat],
          [pp[0] - ux * standoff + lx * lat, pp[2] - uz * standoff + lz * lat],
          [pp[0], pp[2]],
        );
      }
      // town skirt applies to staging legs only — the FINAL sweep leg keeps
      // hunting through the opposing spawn (proximity-spot guarantee).
      const doctrineWaypoints = W.map((pt, wi) => {
        const [wx, wz] = wi < W.length - 1 ? _skirtWp(pt[0], pt[1]) : pt;
        return [_clampW(wx), _clampW(wz)];
      });
      const prepareOpeningRoute = () => {
        const terrainWaypoints = [];
        let routeStart = { x: spawn.pos[0], z: spawn.pos[2] };
        for (const [wx, wz] of doctrineWaypoints) {
          const leg = planBotRoute({
            start: routeStart,
            goal: { x: wx, z: wz },
            navigation: botNavigation,
            rng: routeRng,
            role,
            spec: ent.spec,
            useRoleDetour: false,
          });
          if (!leg.length) break;
          terrainWaypoints.push(...leg);
          routeStart = { x: wx, z: wz };
        }
        ent.aiCtl.setWaypoints(terrainWaypoints, { loop: false });
        // Retain the immutable battle-start copy so main can prime the fast
        // terrain grid before rollout instead of baking under moving bots.
        ent._openingRoute = terrainWaypoints;
      };
      if (opts.deferOpeningRoutes) game.openingRouteJobs.push(prepareOpeningRoute);
      else prepareOpeningRoute();
    }
    // Spawn warm-start (r5 terrain-contact gate): run the movement sim for a
    // few ticks so the attitude spring settles and the terrain support solve
    // owns pos.y BEFORE the first rendered frame — the raw spawn pose (flat
    // attitude, pad-center height) rendered one frame with a track end
    // clipped ~0.3 m into the pad-edge slope. Rigid-gear detection first: a
    refreshContactGeometry(ent);
    for (let k = 0; k < 30; k++) updateTank(ent, world.heightField, SIM_DT);
    // PERF r3: deferred boot visuals sync when ensureTankVisual builds them
    if (ent.visual) {
      ent.visual.syncFromState(ent.state);
      ent.visual.setVisible(true);
    }
  });
}

/**
 * Prepare one deterministic solo-bot opening route. Player battle entry calls
 * this behind the frozen deployment countdown; synchronous tests/captures keep
 * setupBattle's original eager behavior by omitting deferOpeningRoutes.
 * @returns {boolean} true when a job was consumed
 */
export function prepareNextOpeningRoute(game) {
  const job = game.openingRouteJobs.shift();
  if (!job) return false;
  job();
  return true;
}

// ---------------------------------------------------------------------------
// Fixed-step simulation
// ---------------------------------------------------------------------------

/**
 * Publish the authored visual's measured contact footprint once per visual.
 * All playable tanks use terrain-conforming first-party running gear.
 * @param {object} ent pool entity
 * @returns {void}
 */
function refreshContactGeometry(ent) {
  if (!ent.visual) return;
  ent.rigidGear = false;
  // MOVEMENT r1 (fidelity-rebuild fallout): PROCEDURAL visuals carry as-built
  // contact metadata too (tankFactory measures the rest pose at construction —
  // the rebuilt profiles moved wheel/track lines off the old y = 0 /
  // ±0.45 L assumption, floating some parked tanks past the 3 cm gate and
  // resting crest drives on up to ~1 m of phantom contact per end). Stamp it
  // once per visual.
  if (!ent.contactGeom && ent.visual.contactGeom) {
    const cg = ent.visual.contactGeom;
    const d = ent.spec && ent.spec.dims;
    if (d) {
      const L = d.hullLengthM;
      const W = d.widthM;
      const clamp = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));
      ent.contactGeom = {
        halfLenM: cg.halfLenM != null
          ? clamp(cg.halfLenM, CONTACT_LEN_FRAC_MIN * L, CONTACT_LEN_FRAC_MAX * L)
          : 0.45 * L,
        halfWidM: cg.halfWidM != null
          ? clamp(cg.halfWidM, CONTACT_WID_FRAC_MIN * W, CONTACT_WID_FRAC_MAX * W)
          : 0.5 * W,
        zCenterM: cg.zCenterM != null
          ? clamp(cg.zCenterM, -CONTACT_ZC_FRAC_MAX * L, CONTACT_ZC_FRAC_MAX * L)
          : 0,
        bottomYM: clamp(cg.bottomYM || 0, CONTACT_BOTY_MIN, CONTACT_BOTY_MAX),
        // measured hull-pan floor: the movement belly guard hard-clamps at the
        // real plate instead of the stale fixed 0.34 m line (see tankFactory)
        panYM: cg.panYM != null ? clamp(cg.panYM, CONTACT_PAN_MIN, CONTACT_PAN_MAX) : null,
        // wrap approach-rise for the line-end guard samples (tankFactory)
        endRise: cg.endRise
          ? {
            dzM: clamp(cg.endRise.dzM || 0.4, 0.2, 0.6),
            frontM: clamp(cg.endRise.frontM, 0.02, 0.5),
            rearM: clamp(cg.endRise.rearM, 0.02, 0.5),
          }
          : null,
      };
    }
  }
}

// gameplay_feel r7 (round critique CRITICAL — resting/rolling FLOAT): the
// support solve assumed every visual's track bottom runs ±0.45 × hullLengthM
// (true for tankFactory's procedural gear by construction). GLB swaps do NOT
// honor that layout — the sourced Abrams' rendered contact run measures only
// ±2.3 m of its 7.93 m hull (0.29 L), tracks curling UP well before ±0.45 L,
// so the solve held the hull on ~1.25 m of phantom contact beyond each real
// track end: median 20-21 cm of daylight under the lowest rendered vertex on
// rolling ground, 21 cm hover at rest. Fix: scan the swapped visual's LOW
// BAND exactly like the r7 probe — hull-local vertices within 5 cm of the
// overall min-Y — and derive the contact half-length/half-width/center from
// that band. Runs ONCE per swap detection (a few hundred k verts, strided),
// in the visual root's local frame (== the sim's hull frame: root.position =
// state.pos, root.rotation = sim attitude, so inv(rootWorld)·meshWorld drops
// any pose above/at the root).
const CONTACT_BAND_M = 0.05;      // low band: vertices within 5 cm of min-Y
const CONTACT_MIN_SAMPLES = 24;   // fewer band samples than this = no trust
const CONTACT_LEN_FRAC_MIN = 0.22; // sanity clamps vs spec dims — a scan that
const CONTACT_LEN_FRAC_MAX = 0.50; // lands outside these is wrong, not novel
const CONTACT_WID_FRAC_MIN = 0.30;
const CONTACT_WID_FRAC_MAX = 0.58;
const CONTACT_ZC_FRAC_MAX = 0.12; // contact-run center offset cap (× hull L)
// MOVEMENT r1: hull-local Y of the lowest rendered surface — the support
// solve seats THIS plane on the terrain (pos.y = ground − bottomY + margin).
// The rebuilt profiles park it anywhere from −0.016 (pad grousers a hair
// under the old plane) to +0.10 (community placeholder pontoons / raised
// print floor lines); outside this band the scan hit paint, not a track.
const CONTACT_BOTY_MIN = -0.20;
const CONTACT_BOTY_MAX = 0.30;
// Measured hull-pan floor band (belly-guard line): pans outside this are a
// mis-scan (gun barrel over the bow, open-topped interiors) — fall back to
// the fixed guard rather than trust them.
const CONTACT_PAN_MIN = 0.12;
const CONTACT_PAN_MAX = 0.70;
function measureContactGeom(ent) {
  const root = ent.visual && ent.visual.root;
  const spec = ent.spec;
  if (!root || !spec || !spec.dims) return null;
  const L = spec.dims.hullLengthM;
  const W = spec.dims.widthM;
  try {
    root.updateMatrixWorld(true);
    const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
      // skip hidden subtrees (the swapped-out procedural gear) and non-color
      // helpers (shadow proxies write no color but DO define the cast shadow
      // silhouette — they clone hidden gear geometry, so keep them out too)
      if (o.material && o.material.colorWrite === false) return;
      let p = o;
      let vis = true;
      while (p && p !== root) { if (!p.visible) { vis = false; break; } p = p.parent; }
      if (!vis) return;
      const pa = o.geometry.getAttribute && o.geometry.getAttribute('position');
      if (!pa) return;
      meshes.push({ o, pa });
    });
    if (!meshes.length) return null;
    // pass 1: hull-local Y of every (strided) vertex. The floor is the FIRST
    // DENSE SHELL (lowest level with 12 samples inside 1.5 cm), not the
    // absolute min — a stray low vertex (loose export debris, a tow-hook tip)
    // would otherwise float the whole seated contact run by its depth, while
    // a global percentile overshoots sparse-bottomed exports (merkava4b's
    // track underside holds few verts against a dense upper hull — the 0.4 %
    // quantile called its floor +0.086 and buried the real one 3.8 cm).
    // Mirrors tankFactory robustFloorY (MOVEMENT r1).
    const pts = [];
    const ys = [];
    const trackYs = [];
    const v = new THREE.Vector3();
    for (const { o, pa } of meshes) {
      rel.multiplyMatrices(invRoot, o.matrixWorld);
      const step = Math.max(1, Math.floor(pa.count / 20000));
      for (let i = 0; i < pa.count; i += step) {
        v.fromBufferAttribute(pa, i).applyMatrix4(rel);
        pts.push(v.x, v.y, v.z);
        ys.push(v.y);
        // Track contact lives outboard. A dense center keel, mine plough tip,
        // or low belly plate must not become the load-bearing floor and hold
        // both visible track runs in the air.
        if (Math.abs(v.x) >= W * 0.20) trackYs.push(v.y);
      }
    }
    if (!ys.length) return null;
    const denseFloor = (list) => {
      list.sort((a, b) => a - b);
      let floor = list[0];
      if (list.length >= 12) {
        for (let i = 0; i + 11 < list.length; i++) {
          if (list[i + 11] - list[i] <= 0.015) { floor = list[i]; break; }
        }
      }
      return floor;
    };
    const minY = trackYs.length >= CONTACT_MIN_SAMPLES
      ? denseFloor(trackYs) : denseFloor(ys);
    // hull-pan floor for the belly guard — lowest root-local bbox bottom over
    // meshes whose bbox SPANS the centerline (vertex sampling cannot see a
    // wide belly plate; mirrors tankFactory measureRestContact). Floored
    // above the contact plane; see the CONTACT_PAN_* note.
    let panYM = null;
    {
      const corner = new THREE.Vector3();
      for (const { o } of meshes) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox;
        rel.multiplyMatrices(invRoot, o.matrixWorld);
        let mnX = Infinity, mxX = -Infinity, mnY = Infinity;
        for (const cx of [bb.min.x, bb.max.x]) {
          for (const cy of [bb.min.y, bb.max.y]) {
            for (const cz of [bb.min.z, bb.max.z]) {
              corner.set(cx, cy, cz).applyMatrix4(rel);
              if (corner.x < mnX) mnX = corner.x;
              if (corner.x > mxX) mxX = corner.x;
              if (corner.y < mnY) mnY = corner.y;
            }
          }
        }
        if (mnX < -0.2 && mxX > 0.2 && (panYM === null || mnY < panYM)) panYM = mnY;
      }
      if (panYM !== null) {
        panYM = Math.max(panYM, minY + 0.05);
        if (!(panYM >= CONTACT_PAN_MIN && panYM <= CONTACT_PAN_MAX)) panYM = null;
      }
    }
    // pass 2: extents of the low band
    const band = minY + CONTACT_BAND_M;
    let zMin = Infinity, zMax = -Infinity, xMin = Infinity, xMax = -Infinity, n = 0;
    for (let i = 0; i < pts.length; i += 3) {
      if (pts[i + 1] > band) continue;
      const x = pts[i], z = pts[i + 2];
      if (trackYs.length >= CONTACT_MIN_SAMPLES && Math.abs(x) < W * 0.20) continue;
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      n++;
    }
    if (n < CONTACT_MIN_SAMPLES || zMax - zMin < 1 || xMax - xMin < 0.5) return null;
    const clamp = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));
    return {
      halfLenM: clamp((zMax - zMin) / 2, CONTACT_LEN_FRAC_MIN * L, CONTACT_LEN_FRAC_MAX * L),
      halfWidM: clamp((xMax - xMin) / 2, CONTACT_WID_FRAC_MIN * W, CONTACT_WID_FRAC_MAX * W),
      zCenterM: clamp((zMax + zMin) / 2, -CONTACT_ZC_FRAC_MAX * L, CONTACT_ZC_FRAC_MAX * L),
      // MOVEMENT r1: the support solve seats the measured bottom plane on the
      // terrain. Sourced GLBs are ground-normalized by modelLoader so this is
      // ~0 for most, but a handful ride their export's floor line (is6b
      // parked +1.5 cm of daylight before this).
      bottomYM: clamp(minY, CONTACT_BOTY_MIN, CONTACT_BOTY_MAX),
      panYM,
      // GLB wraps curl up right past the measured run — a conservative fixed
      // rise for the line-end guard samples (procedural rigs export exact)
      endRise: { dzM: 0.4, frontM: 0.12, rearM: 0.12 },
    };
  } catch (e) {
    return null; // scan is best-effort: fall back to spec fractions
  }
}

/**
 * Tank collision layer (gameplay_feel r6 — round critique MAJOR "invisible
 * walls"): the old narrow phase was ONE fat circle per tank
 * (spec.armor.boundingRadiusM 4.1–4.55 m, gun barrel included) against prop
 * AABBs — the live probe dead-stopped twice in 13 s of open-meadow driving,
 * both times ~2 m short of any visible geometry, and grazing paths deflected
 * ~2.5 m before the hull could reach the prop. Replaced with:
 *  - tank vs OBSTACLE: the true 2D hull footprint (hullLengthM × widthM
 *    oriented box, NO barrel) vs the AABB via SAT minimum-translation
 *    push-out — contact happens where the tracks visually touch;
 *  - tank vs TANK: hull capsules (segment down the hull axis, radius
 *    widthM/2 each) — tight nose-to-nose / side-by-side contact instead of a
 *    6 m circular force field;
 *  - broad phase stays a cheap circle reject (footprint circumradius).
 * CRUSHABLE props (round critique MAJOR "nothing in the world crushes"):
 * obstacle records tagged `crushable` by the world layer (vegetation.js tags
 * tree trunks — see docs/handoff/gameplay_feel-r6.md) do NOT wall a hull that
 * is already moving faster than CRUSH_MIN_MPS: the overlap is queued on
 * `pendingCrush` and simStep fells the prop (world.crushObstacle topple
 * anim), bleeds a little momentum and emits `prop:crushed` for fx/audio.
 * A `crushed` record stops colliding for everyone (ai.js avoidance skips it
 * too). Below the threshold the trunk still resists a parked nudge; boulders,
 * buildings and every untagged prop stay permanently solid.
 */
const RAM_PAIR_COOLDOWN_S = 0.5; // one damage event per pair per shove
const CRUSH_MIN_MPS = 6 / 3.6;   // ~6 km/h — WoT fells small trees on any real overrun
const CRUSH_SPEED_KEEP = 0.94;   // per-prop momentum bite (v *= keep on crush)
// Below the speed threshold a trunk is solid — but a hull HOLDING drive
// against it saws it down after this much continuous press (replay probe: a
// hull clank-stopped by a boulder sat WEDGED between the rock and the solid
// slow-speed tree behind it for 4+ s, because a wedged tank can never reach
// 6 km/h again; WoT tanks push saplings over from a standstill). A parked
// nudge (no throttle) still never fells anything.
const CRUSH_PRESS_S = 0.45;      // s of held-throttle contact that fells a trunk
const CRUSH_PRESS_GAP_S = 0.2;   // press bookkeeping resets after this gap
function makeCollide(game, world) {
  let self = null;
  const obstacles = world.getObstacles();
  const nearby = [];
  const pendingCrush = [];
  // RAMMING: tank-tank contacts this tick, resolved by simStep after the
  // movement loop (mirror of pendingCrush). Each entry records the CONTACT
  // normal and both hulls' velocity vectors AT detection time — resolving
  // later from live state would read speeds the blocked-drive bleed has
  // already zeroed and see every head-on ram as a 0 m/s kiss.
  const pendingRams = [];
  function collide(pos, radiusM, outPush) {
    outPush.set(0, 0, 0);
    let pushed = false;
    const spec = self ? self.spec : null;
    const halfL = spec ? spec.dims.hullLengthM * 0.5 : radiusM * 0.6;
    const halfW = spec ? spec.dims.widthM * 0.5 : radiusM * 0.45;
    const yaw = self && self.state ? self.state.yaw : 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);   // hull forward (world XZ)
    const rx = fz, rz = -fx;                        // hull right
    const mySeg = Math.max(halfL - halfW, 0);       // capsule half-segment
    const selfSpeed = self && self.state ? Math.abs(self.state.speed) : 0;

    // --- other tanks: hull capsule vs hull capsule (2D segment-segment) ----
    for (const other of game.tanks) {
      if (other === self || !other.state) continue;
      const od = other.spec.dims;
      const oHalfW = od.widthM * 0.5;
      const oSeg = Math.max(od.hullLengthM * 0.5 - oHalfW, 0);
      const minD = halfW + oHalfW;
      const dx0 = pos.x - other.state.pos.x;
      const dz0 = pos.z - other.state.pos.z;
      const outer = mySeg + oSeg + minD;
      if (dx0 * dx0 + dz0 * dz0 > outer * outer) continue;
      const ofx = Math.sin(other.state.yaw), ofz = Math.cos(other.state.yaw);
      // closest points between segments A(s)=pos+f·s, B(t)=oPos+of·t
      const b = fx * ofx + fz * ofz;            // f·of
      const dU = dx0 * fx + dz0 * fz;           // d·f   (d = A0 − B0)
      const dV = dx0 * ofx + dz0 * ofz;         // d·of
      const denom = 1 - b * b;
      let s = denom > 1e-6 ? (b * dV - dU) / denom : -dU;
      s = s < -mySeg ? -mySeg : (s > mySeg ? mySeg : s);
      let t = dV + b * s;
      t = t < -oSeg ? -oSeg : (t > oSeg ? oSeg : t);
      s = b * t - dU;
      s = s < -mySeg ? -mySeg : (s > mySeg ? mySeg : s);
      const wx = dx0 + fx * s - ofx * t;        // B-closest → A-closest
      const wz = dz0 + fz * s - ofz * t;
      const d2 = wx * wx + wz * wz;
      if (d2 < minD * minD) {
        const d = Math.sqrt(Math.max(d2, 1e-8));
        if (d > 1e-4) {
          outPush.x += (wx / d) * (minD - d);
          outPush.z += (wz / d) * (minD - d);
        } else {
          // dead-center overlap: push out sideways
          outPush.x += rx * minD;
          outPush.z += rz * minD;
        }
        pushed = true;
        // RAMMING: queue the contact with closing speed along the contact
        // normal (n points other → self). Hulls only move along their own
        // forward axis, so v = fwd · signed speed captures each side fully.
        if (self && self.state && d > 1e-4) {
          const nx = wx / d, nz = wz / d;
          const vSelf = self.state.speed;
          const vOther = other.state.speed;
          const relX = fx * vSelf - ofx * vOther;
          const relZ = fz * vSelf - ofz * vOther;
          const closing = -(relX * nx + relZ * nz); // >0 = approaching
          if (closing > 0) {
            pendingRams.push({ a: self, b: other, closing, nx, nz });
          }
        }
      }
    }

    // --- static obstacle AABBs: hull OBB vs box via 2D SAT -----------------
    const broadR = Math.sqrt(halfL * halfL + halfW * halfW) + 0.01;
    const candidates = world.queryObstacles
      ? world.queryObstacles(pos.x - broadR, pos.z - broadR,
        pos.x + broadR, pos.z + broadR, nearby)
      : obstacles;
    for (const ob of candidates) {
      if (ob.crushed) continue;                 // felled — ghosts for everyone
      if (pos.y > ob.max[1] + 0.5) continue;
      const ccx = Math.max(ob.min[0], Math.min(pos.x, ob.max[0]));
      const ccz = Math.max(ob.min[2], Math.min(pos.z, ob.max[2]));
      const bdx = pos.x - ccx;
      const bdz = pos.z - ccz;
      if (bdx * bdx + bdz * bdz >= broadR * broadR) continue;
      // Narrow phase honors a prop's projected shape: rotated structures are
      // OBBs, trunks/round props are circles, and displaced rocks publish the
      // convex hull of their rendered mesh. The helper adds the exact MTV to
      // a scratch vector so a crushable can still choose to ignore it.
      const beforeX = outPush.x, beforeZ = outPush.z;
      if (!pushHullFromObstacle(pos, fx, fz, rx, rz, halfL, halfW, ob, outPush)) continue;
      if (ob.crushable && self) {
        // DESTRUCTIBLES r1: per-obstacle overrun threshold — heavy light-cover
        // (stone wall runs) resists a touch harder than a sapling before the
        // hull powers through; the held-press saw below still defeats
        // everything crushable, so nothing tagged can permanently wall a hull.
        let crushNow = selfSpeed > (ob.crushMin ?? CRUSH_MIN_MPS);
        // BATTLE-AI r7: held-press threshold 0.5 -> 0.35. AI throttle shaping
        // (arrival ease-in, obstacle damping) legitimately drives at 0.35-0.5
        // against a sapling and used to dead-stop under the old bar forever
        // (coastal spawn-exit trace: 30 s at spd 0, thr 0.4). 0.35+ is still
        // a deliberate push — a parked nudge (zero throttle) never fells.
        if (!crushNow && self.input &&
            Math.abs(self.input.throttle || 0) > 0.35) {
          // slow-speed press: the trunk resists, but held drive saws it down
          // after CRUSH_PRESS_S of continuous contact (wedge-deadlock fix).
          if (game.timeS - (ob._pressT || -1e9) > CRUSH_PRESS_GAP_S) {
            ob._pressS = 0;
          }
          ob._pressT = game.timeS;
          ob._pressS = (ob._pressS || 0) + SIM_DT;
          crushNow = ob._pressS >= CRUSH_PRESS_S;
        }
        if (crushNow) {
          // momentum (or the held press) carries the hull THROUGH — queue the
          // crush (deduped); simStep resolves it (topple + speed bite + bus).
          let queued = false;
          for (let qi = 0; qi < pendingCrush.length; qi++) {
            if (pendingCrush[qi].ob === ob) { queued = true; break; }
          }
          if (!queued) pendingCrush.push({ ob, ent: self });
          // A crushed/queued prop carries no blocking push this tick.
          outPush.x = beforeX; outPush.z = beforeZ;
          continue;
        }
      }
      pushed = true;
    }
    return pushed;
  }
  return { collide, setSelf(e) { self = e; }, pendingCrush, pendingRams };
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
      bus.emit('module:state', {
        id: ev.targetId, module: m.module, state: m.newState, source: 'hit',
      });
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
  if (c.magazine && c.magazine.rounds <= 0) return;
  if (c.modules.gun && c.modules.gun.state === 'red') return;
  // BATTLE-AI r7 hardening: clamp to the spec's REAL magazine — a slot index
  // past shells.length (2-shell loadouts like the sturmtiger) fed an
  // undefined spec into acquireShell and crashed the sim step.
  const maxSlot = ent.spec.gun.shells.length - 1;
  const slot = Math.max(0, Math.min(Math.min(2, maxSlot), ent.input.shellSlot | 0));
  if (slot !== c.shellSlot) {
    if (c.magazine) {
      selectShell(c, slot, ent.spec);
      return;
    }
    // PER-SHELL RELOAD guard: switching INTO a slower slot at fire time must
    // pay the incoming shell's load first (an IFV bot flipping its 0.4 s
    // autocannon timer onto the ATGM rail would otherwise fire the missile
    // instantly). Switching down to an equal/faster shell stays free — the
    // longer load already waited covers it.
    const sh = ent.spec.gun.shells;
    const newBase = (sh[slot] && sh[slot].reloadS) || ent.spec.gun.reloadS;
    const oldBase = (sh[c.shellSlot] && sh[c.shellSlot].reloadS) || ent.spec.gun.reloadS;
    c.shellSlot = slot;
    if (newBase > oldBase) { startReload(c, ent.spec); return; }
  }
  const shellSpec = ent.spec.gun.shells[c.shellSlot];
  const guidedSpecial = !!(shellSpec.guided && ent.specialAction?.active &&
    ent.specialAction.pendingFire && c.shellSlot === ent.specialAction.missileSlot);

  // Barrel direction from the visual (already chasing input.aimPoint).
  // controls_gunnery r3 CRITICAL: use the articulated bore AXIS (recoil-group
  // +Z), NOT muzzle-minus-pivot — on GLB-swapped tanks the muzzle anchor is
  // re-derived from real tube-tip vertices and sits off the trunnion axis
  // (m1a2: ~45 mrad skew), so the anchor-difference line pointed every
  // "settled" shot ~15 m wide at 330 m while the sim gun-lay was perfect.
  // §5.362 twin-plant alternation (spec.gun.muzzles — bmpt_terminator2's
  // twin 30 mms): shot N fires from muzzles[N % len]. The cursor lives on
  // the gun's combat state (deterministic with the fire sequence, reset with
  // every fresh combat state); the shell origin, the muzzle-flash origin
  // (shell:fired muzzlePos) and the visual's asymmetric recoil kick all use
  // the same index. Single-bore fleet: muzzleIndex stays undefined and every
  // path below is byte-identical legacy.
  const gunMuzzles = ent.spec.gun.muzzles;
  let muzzleIndex;
  if (Array.isArray(gunMuzzles) && gunMuzzles.length > 1) {
    muzzleIndex = (c.muzzleCursor || 0) % gunMuzzles.length;
    c.muzzleCursor = muzzleIndex + 1;
  }
  ent.visual.gunMuzzleWorld(_muzzle, muzzleIndex);
  if (ent.visual.gunDirWorld) {
    ent.visual.gunDirWorld(_dir);
  } else {
    ent.visual.gunPivotWorld(_pivot);
    _dir.copy(_muzzle).sub(_pivot).normalize();
  }

  // Dispersion: sigmaRad = r(100 m)/200 (§3.5.1 locked), gun yellow ⇒ σ×2.
  let sigmaRad = computeDispersionRadM(ent.spec, ent.state, 100) / 200;
  if (c.modules.gun && c.modules.gun.state === 'yellow') sigmaRad *= 2;
  applyDispersion(_dir, sigmaRad, game.combatRng);

  const shell = acquireShell(shellSpec, ent.id, ent.isPlayer, _muzzle, _dir, game.nextShellId++);
  game.shells.push(shell);
  // The actual shell matters for IFVs: rapid autocannon belt rounds should
  // barely disturb the stabilized lay, while the same vehicle's ATGM rail
  // still produces full bloom and physical/presentation recoil.
  const recoilScale = shotRecoilScale(ent.spec, shellSpec);
  fireRecoil(ent.state, ent.spec, shellSpec);
  ent.visual.recoilKick(0, recoilScale, muzzleIndex);
  if (ent.isPlayer && rig) {
    // Dedicated feel pass: the old fixed impulse made a 30 mm autocannon and
    // a 152 mm siege gun kick the camera identically. Scale both concussion
    // and pitch by bore size while preserving the former 120 mm baseline.
    const caliberK = Math.max(0, Math.min(1, (shellSpec.caliberMm - 30) / 122));
    rig.addTrauma((0.10 + caliberK * 0.20) * recoilScale);
    if (rig.recoilKick) {
      rig.recoilKick((0.006 + caliberK * 0.011) * recoilScale, recoilScale);
    }
  }
  _firedEv.shellId = shell.id;
  _firedEv.shooterId = ent.id;
  _firedEv.isPlayer = ent.isPlayer;
  _firedEv.shellType = shellSpec.type;
  _firedEv.shellName = shellSpec.name; // SHOT-INFO ENRICHMENT (additive)
  // Weapon-native audio stays presentation-only. Shell overrides distinguish
  // ATGM/100 mm launches from the vehicle's default autocannon report.
  _firedEv.weaponSound = shellSpec.soundProfile || ent.spec.gun.soundProfile || null;
  // §5.362 (additive): which barrel fired on twin-plant ids, -1 single-bore.
  // The payload object is REUSED — always write so no stale index leaks.
  _firedEv.muzzleIndex = muzzleIndex != null ? muzzleIndex : -1;
  _firedEv.caliberMm = shellSpec.caliberMm;
  _firedEv.velocityMps = shellSpec.velocityMps;
  _firedEv.timeS = game.timeS;
  _firedEv.muzzlePos[0] = _muzzle.x; _firedEv.muzzlePos[1] = _muzzle.y; _firedEv.muzzlePos[2] = _muzzle.z;
  _firedEv.dir[0] = _dir.x; _firedEv.dir[1] = _dir.y; _firedEv.dir[2] = _dir.z;
  bus.emit('shell:fired', _firedEv);
  startPostShotReload(c, ent.spec);
  if (guidedSpecial) finishSpecialActionFire(ent, shell.id);
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
    const shooter = game.tankById.get(shell.shooterId);
    if (specialActionGuidesShell(shooter, shell)) {
      guideShellToward(shell, shooter.input?.aimPoint, SIM_DT);
    }
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
      const shell = shells[i];
      const shooter = game.tankById.get(shell.shooterId);
      if (completeGuidedMissileFlight(shooter, shell.id)) {
        bus.emit('ui:specialActionResult', {
          kind: shooter.specialAction.kind,
          active: false,
          reason: 'IMPACT',
        });
      }
      if (_shellPool.length < 64) _shellPool.push(shell);
      shells.splice(i, 1);
    }
  }
}

/** Red-module auto-repair to yellow after REPAIR_S (§2.4 locked). The state
 * transition lives in sim/damage.js tickModuleRepairs — ONE module state
 * machine (module_hitbox r1); the toolbox repair-rate equipment multiplier
 * is honored there. This wrapper only broadcasts the results. */
function tickRepairs(game, bus, dt) {
  for (const ent of game.tanks) {
    if (!ent.combat) continue;
    for (const name of tickModuleRepairs(ent.combat, dt)) {
      // repaired:true = this yellow is a RECOVERY (red → yellow), so the HUD
      // toasts 'REPAIRED', not 'DAMAGED'. Audio infers direction on its own
      // prev-state tracker; the flag is additive for everyone else.
      bus.emit('module:state', { id: ent.id, module: name, state: 'yellow', repaired: true });
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
    refreshContactGeometry(ent);
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

  // b2. crushable props (gameplay_feel r6): resolve the hull-overrun crushes
  // the collider queued this tick — mark the record dead for all collision/AI
  // consumers, fell the world visual (topple anim — vegetation.js/map.js via
  // world.crushObstacle, see docs/handoff/gameplay_feel-r6.md), bite a little
  // momentum (WoT: small trees barely slow a hull) and announce for fx/audio.
  const pending = collider.pendingCrush;
  if (pending && pending.length) {
    for (const q of pending) {
      const ob = q.ob;
      if (ob.crushed) continue;
      ob.crushed = true;
      const ent = q.ent;
      const dirSign = ent.state ? Math.sign(ent.state.speed || 1) : 1;
      const dirX = ent.state ? Math.sin(ent.state.yaw) * dirSign : 0;
      const dirZ = ent.state ? Math.cos(ent.state.yaw) * dirSign : 1;
      // DESTRUCTIBLES r1: the overrun speed rides into the world break so
      // debris inherits the hull's velocity (a 50 km/h ram throws chunks; a
      // crawl shoulders them aside), and the momentum bite is per-prop mass
      // (ob.crushKeep — sandbags barely register, a stone wall run scrubs
      // noticeably, but nothing crushable ever hard-stops the hull).
      const overrunMps = ent.state ? Math.abs(ent.state.speed) : 0;
      if (world.crushObstacle) world.crushObstacle(ob, dirX, dirZ, overrunMps);
      if (ent.state) ent.state.speed *= (ob.crushKeep ?? CRUSH_SPEED_KEEP);
      bus.emit('prop:crushed', {
        id: ent.id,
        specId: ent.specId,
        isPlayer: ent.isPlayer,
        speedMps: ent.state ? Math.abs(ent.state.speed) : 0,
        kind: ob.kind || 'tree',
        h: ob.max[1] - ob.min[1],
        pos: [
          (ob.min[0] + ob.max[0]) * 0.5,
          ob.min[1],
          (ob.min[2] + ob.max[2]) * 0.5,
        ],
        dir: [dirX, 0, dirZ],
      });
    }
    pending.length = 0;
  }

  // b3. RAMMING — resolve the tank-tank contacts the collider queued this
  // tick. Each collision is detected up to twice (once per side's movement
  // update, with mirrored roles); dedupe by unordered pair keeping the
  // detection with the highest closing speed. Damage split is mass-weighted
  // kinetic (sim/damage.js ramDamage); wrecks still bruise the hull that
  // plows into them but take nothing. The wall-impact clank/jolt feedback
  // already fires from the movement blocked-drive path — this block adds hp,
  // kill attribution ('ram' cause) and the tank:ram event only.
  const rams = collider.pendingRams;
  if (rams && rams.length) {
    if (!game._ramPairT) game._ramPairT = new Map();
    const best = new Map(); // pairKey -> contact with max closing
    for (const q of rams) {
      const key = q.a.id < q.b.id ? `${q.a.id}|${q.b.id}` : `${q.b.id}|${q.a.id}`;
      const cur = best.get(key);
      if (!cur || q.closing > cur.closing) best.set(key, q);
    }
    for (const [key, q] of best) {
      const last = game._ramPairT.get(key);
      // (timeS < last = stale entry from a previous battle — timeS reset)
      if (last !== undefined && game.timeS >= last &&
          game.timeS - last < RAM_PAIR_COOLDOWN_S) continue;
      const a = q.a, b = q.b;
      if (!a.combat || !b.combat || a.combat.destroyed) continue;
      const dmg = ramDamage(
        a.spec.weightTons, b.spec.weightTons,
        // sub-tick overshoot: the recorded closing speed is the approach at
        // contact detection — exactly the speed the pushback then absorbed
        q.closing);
      if (dmg.total <= 0) continue;
      game._ramPairT.set(key, game.timeS);
      const bWreck = b.combat.destroyed;
      const dmgA = dmg.toA;
      const dmgB = bWreck ? 0 : dmg.toB;
      a.combat.hp = Math.max(0, a.combat.hp - dmgA);
      if (!bWreck) b.combat.hp = Math.max(0, b.combat.hp - dmgB);
      if (a.combat.hp <= 0) a.combat.destroyed = true;
      if (!bWreck && b.combat.hp <= 0) b.combat.destroyed = true;
      if (b.combat.destroyed && !bWreck && !b._destroyedAnnounced) {
        announceDestroyed(game, bus, b, a.id, 'ram');
      }
      if (a.combat.destroyed && !a._destroyedAnnounced) {
        announceDestroyed(game, bus, a, bWreck ? null : b.id, 'ram');
      }
      // extra camera bite when the PLAYER is in a damaging ram (the baseline
      // wall-clank trauma from the movement path is tuned for scenery hits)
      if (rig) {
        const playerDmg = a.isPlayer ? dmgA : (b.isPlayer ? dmgB : 0);
        if (playerDmg > 0) rig.addTrauma(Math.min(0.55, 0.12 + playerDmg * 0.0009));
      }
      bus.emit('tank:ram', {
        aId: a.id, bId: b.id,
        aSpecId: a.specId, bSpecId: b.specId,
        dmgA, dmgB,
        closingMps: q.closing,
        aIsPlayer: !!a.isPlayer, bIsPlayer: !!b.isPlayer,
        pos: [
          (a.state.pos.x + b.state.pos.x) * 0.5,
          (a.state.pos.y + b.state.pos.y) * 0.5,
          (a.state.pos.z + b.state.pos.z) * 0.5,
        ],
      });
    }
    rams.length = 0;
  }

  // c. reload timers + firing
  for (const ent of game.tanks) {
    const c = ent.combat;
    if (!c || c.destroyed) continue;
    const reload = c.reload;
    if (reload.t > 0) {
      const wasReloading = reload.t;
      const reloadKind = reload.kind;
      const done = tickReload(c, dt);
      if (ent.isPlayer) {
        // This is a 60 Hz presentation event while a load is active. Reuse one
        // payload per entity instead of allocating hundreds of short-lived
        // objects during every long-calibre reload.
        const ev = ent._reloadEvent || (ent._reloadEvent = {
          t: 0, total: 0, progress: 0, kind: 'ready', caliberMm: 0,
          magazineRounds: 0, magazineCapacity: 0, done: false,
        });
        const shell = ent.spec.gun.shells[c.shellSlot] || ent.spec.gun.shells[0];
        ev.t = reload.t;
        ev.total = reload.totalS;
        ev.progress = reload.totalS > 0
          ? Math.max(0, Math.min(1, 1 - reload.t / reload.totalS)) : 1;
        // tickReload changes kind to "ready" on the terminal edge. Preserve
        // the cycle that actually completed so presentation can distinguish
        // a shell load, an autoloader index, and a magazine replenishment.
        ev.kind = reloadKind;
        ev.caliberMm = (shell && shell.caliberMm) || ent.spec.gun.caliberMm || 100;
        ev.magazineRounds = c.magazine ? c.magazine.rounds : 0;
        ev.magazineCapacity = c.magazine ? c.magazine.capacity : 0;
        ev.done = wasReloading > 0 && done;
        bus.emit('player:reload', ev);
      }
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
    if (enemiesLeft === 0) {
      game.result = 'victory';
      game.resultReason = 'elimination';
    } else if (game.player.combat.destroyed && alliesLeft === 0) {
      game.result = 'defeat';
      game.resultReason = 'elimination';
    } else if (game.timeS >= BATTLE_TIME_LIMIT_S) {
      game.result = 'draw';
      game.resultReason = 'time_limit';
    }
    // SHOT-INFO ENRICHMENT (additive): announce the decision once so results
    // UIs (src/ui/shotInfo.js session stats) can render without polling.
    if (game.result !== null) {
      bus.emit('battle:ended', {
        result: game.result, reason: game.resultReason, timeS: game.timeS,
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
