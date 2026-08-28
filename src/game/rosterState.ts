/**
 * Garage-safe roster, battle-visual construction, and deterministic battle
 * planning. Combat initialization and fixed-step simulation remain in
 * state.ts so this module can be loaded without ballistics, damage, AI, or
 * spotting.
 */
import { Vector3, type Object3D, type Scene } from 'three';
import { getSpec, TANK_IDS, RUNTIME_TANK_IDS } from '../vehicles/specs.js';
import { createTank } from '../vehicles/fleetFactory.js';
import { tankTier } from '../vehicles/tier.ts';
import { isGarageVisibleTankId, rankMatchCandidates } from './matchmaking.ts';
import { getDeviceTier } from '../engine/quality.ts';
import { mulberry32 } from './stateCore.ts';

interface BattleVisual {
  specId: string;
  root: Object3D;
  setGroundSampler?(sampler: unknown): void;
  syncFromState?(state: unknown): void;
  setVisible(visible: boolean): void;
  prepareForSimulation?(): void;
  resetForGaragePresentation?(): void;
  resetDestroyed?(): void;
  dispose(): void;
}

interface EngineContext {
  scene: Scene;
}

export interface RosterEntity {
  id: string;
  specId: string;
  spec: ReturnType<typeof getSpec>;
  team: string;
  isPlayer: boolean;
  state: unknown;
  combat: unknown;
  specialAction: unknown;
  input: {
    throttle: number;
    steer: number;
    brake: boolean;
    fire: boolean;
    aimPoint: Vector3;
    shellSlot: number;
  };
  visual: BattleVisual | null;
  rigidGear: boolean;
  contactGeom: unknown;
  _camoSeed: number;
  ai: unknown;
  aiCtl: unknown;
  _destroyedAnnounced: boolean;
}

export interface RosterGameState {
  allTanks: RosterEntity[];
  tankById: Map<string, RosterEntity>;
  tanks: RosterEntity[];
  battleCount: number;
  _engineCtx?: EngineContext;
  _groundSampler?: unknown;
  _battleVisualPool?: {
    take(specId: string): BattleVisual | null;
  };
}

type RosterPredicate = (entity: RosterEntity) => boolean;

interface DebugFlags {
  forceRoster?: string[];
  rosterExact?: boolean;
}

function debugFlags(): DebugFlags | null {
  const root = globalThis as typeof globalThis & {
    __DEBUG?: { flags?: DebugFlags };
  };
  return root.__DEBUG?.flags || null;
}

/**
 * Build every TankEntity record without constructing its visual. Called once
 * at startup; battles reuse the entities via setupBattle().
 * @param {object} game createGameState() result
 * @param {object} engineCtx EngineCtx (§2.8)
 * @returns {void}
 */
export function spawnTanks(game: RosterGameState, engineCtx: EngineContext) {
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
  game._groundSampler = null;    // set by main.ts; applied to lazy visuals too
  RUNTIME_TANK_IDS.forEach((specId: string, i: number) => {
    const spec = getSpec(specId);
    const ent = {
      id: specId,
      specId,
      spec,
      team: 'enemy',
      isPlayer: false,
      state: null,
      combat: null,
      specialAction: null,
      input: {
        throttle: 0, steer: 0, brake: false, fire: false,
        aimPoint: new Vector3(), shellSlot: 0,
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
  game.tanks = TANK_IDS.map((id) => game.tankById.get(id))
    .filter((entity): entity is RosterEntity => !!entity);
  // PERF (performance_budget r3): the staged battle's 7 ENEMY bakes are the
  // single biggest load-to-ready block (~2.2 s of 2048² canvas painting +
  // SimplexNoise + first-use GPU uploads on the boot path; bootprobe:
  // heightToNormal 1050 ms + noise 2.2 s). Nobody can see the staged battle
  // behind the garage screen, so boot builds NONE of it — ensureStagedVisuals()
  // (idempotent, chunked by the caller) builds the roster post-ready, and
  // main.ts runs it synchronously from warmCombatPipeline(), which
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
export function ensureStagedVisuals(
  game: RosterGameState,
  limit = Infinity,
  predicate: RosterPredicate | null = null,
) {
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
export function nextStagedBake(
  game: RosterGameState,
  predicate: RosterPredicate | null = null,
) {
  const ent = game.tanks.find((e) => !e.visual && (!predicate || predicate(e)));
  if (!ent) return null;
  return { ent, quality: textureQualityFor(game, ent) };
}

/** Visual-only battle geometry policy; garage/Studio use separate builders. */
export function battleGeometryQuality(
  playerActor: boolean,
  deviceTier: string = getDeviceTier(),
) {
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
export function ensureTankVisual(game: RosterGameState, ent: RosterEntity) {
  if (ent.visual) return ent.visual;
  const engineCtx = game._engineCtx;
  if (!engineCtx) throw new Error('battle roster engine context is unavailable');
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
  // A pooled graph has no entity, combat or damage owner. Bind it to this
  // roster slot now; setupBattle will create fresh state before revealing or
  // simulating it. Player actors continue to use the dedicated garage-lending
  // path and its higher texture/detail contract.
  if (battleBot) {
    const pooled = game._battleVisualPool?.take(ent.specId) || null;
    if (pooled) {
      ent.visual = pooled;
      engineCtx.scene.add(pooled.root);
      if (game._groundSampler && pooled.setGroundSampler) {
        pooled.setGroundSampler(game._groundSampler);
      }
      if (ent.state && pooled.syncFromState) {
        pooled.syncFromState(ent.state);
        pooled.setVisible(true);
      }
      return pooled;
    }
  }
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

function textureQualityFor(game: RosterGameState, ent: RosterEntity) {
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
// vehicles/tier.ts. This prevents a newly added tank from showing one tier in
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
export function pickBattleParticipants(
  game: RosterGameState,
  playerSpecId: string,
  randomize: boolean,
  battleOrdinal = game.battleCount,
): RosterEntity[] {
  const player = game.tankById.get(playerSpecId);
  if (!player) throw new Error(`unknown battle vehicle: ${playerSpecId}`);
  const enemySlots = randomize ? 13 : 7;
  // PERF (performance_budget r3, certification determinism): an explicit
  // debug roster bypasses the seeded shuffle/era matchmaking so the perf
  // gate measures a PINNED worst-case lineup (all multi-mesh GLB heavies)
  // instead of whatever the pool happens to draw — the round-2 critic
  // measured 1095 worst-frame draw calls on one random roster and 470 on
  // another, on the identical build. Debug/tooling only (perfprobe).
  const forced = debugFlags()?.forceRoster || null;
  if (Array.isArray(forced) && forced.length) {
    const list = forced
      .map((id) => game.tankById.get(id))
      .filter((entity): entity is RosterEntity => !!entity && entity !== player);
    // BATTLE-AI r7: random battles are 7v7 now — a pinned lineup shorter than
    // the slot count (perfprobe's 7-id worst case predates 7v7) TOPS UP from
    // the seeded shuffle so the perf gate measures a real 14-tank battle, not
    // a legacy 8-tank one. battleCount is deterministic per probe run, so the
    // fill is reproducible. Explicit 13-id rosters pin everything as before,
    // and flags.rosterExact suppresses the top-up entirely (perf A/B tooling
    // — an 8-tank control battle is not otherwise reachable post-7v7).
    const exact = !!debugFlags()?.rosterExact;
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
    others = TANK_IDS
      .filter((id) => id !== playerSpecId)
      .map((id) => game.tankById.get(id))
      .filter((entity): entity is RosterEntity => !!entity);
  }
  return [player, ...others.slice(0, enemySlots)];
}

/**
 * Resolve the next battle's deterministic participant ids without mutating
 * game state. Battle entry uses this while the battlefield chunk/build is in
 * flight so every required procedural profile can transfer and parse in
 * parallel instead of waiting behind world construction.
 */
export function planBattleParticipantIds(
  game: RosterGameState,
  playerSpecId: string,
  randomize = true,
) {
  return pickBattleParticipants(game, playerSpecId, randomize, game.battleCount + 1)
    .map((entity) => entity.specId);
}

export function autoCamoIdsForBattle(
  participants: RosterEntity[],
  playerSpecId: string,
  mapId: string,
  randomize: boolean,
  battleOrdinal: number,
) {
  if (!randomize) return [];
  const camoRng = mulberry32(8600 + battleOrdinal);
  const forceAuto = mapId === 'winter' || mapId === 'desert';
  const autoIds = [];
  for (const ent of participants) {
    if (ent.specId === playerSpecId) continue;
    const roll = camoRng();
    if (forceAuto || roll < 0.6) autoIds.push(ent.specId);
  }
  return autoIds;
}

/**
 * Resolve the next battle's deterministic bot AUTO-camouflage overrides
 * without mutating game or material state. The loading coordinator uses this
 * to paint the exact roster while the independent world is still building;
 * setupBattle consumes the same helper after it commits the battle ordinal.
 */
export function planBattleCamoOverrides(
  game: RosterGameState,
  playerSpecId: string,
  mapId: string,
  randomize = true,
) {
  const battleOrdinal = game.battleCount + 1;
  const participants = pickBattleParticipants(game, playerSpecId, randomize, battleOrdinal);
  return autoCamoIdsForBattle(
    participants, playerSpecId, mapId, randomize, battleOrdinal,
  );
}
