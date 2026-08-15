/**
 * Headless authoritative battle simulation.
 *
 * This is the multiplayer-safe composition seam for the existing pure combat
 * modules. It deliberately owns no Three.js scene objects, DOM state, camera,
 * audio, localStorage, or presentation events. Browser-hosted private rooms,
 * solo loopback, and dedicated Node servers can all run the same instance.
 */

import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.js';
import { getMapConfig } from '../world/maps/index.js';
import { createHeightField, createLayout } from '../world/terrain.js';
import {
  SIM_DT,
  computeDispersionRadM,
  createTankState,
  fireRecoil,
  updateTank,
} from './movement.js';
import { applyDispersion, createShell, stepShell } from './ballistics.js';
import { tankPoseFromState, traceTank } from './armor.js';
import {
  createCombatState,
  isHeClass,
  ramDamage,
  repairAllModules,
  resolveHeBurst,
  resolveShellHit,
  selectShell,
  startReload,
  tickFire,
  tickModuleRepairs,
} from './damage.js';
import { createSpottingSystem } from './spotting.js';
import { captureWorldSnapshot } from '../net/snapshot.js';
import { pushHullFromObstacle } from '../world/collision.js';
import { applyEquipmentToCombat, defaultLoadoutFor } from '../game/equipment.js';
import { botFriendlyFireRisk, createAI, roleOf } from '../game/ai.js';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.js';
import { CONSUMABLE_RULES, cooldownRemaining } from '../game/consumables.js';
import { PLAYER_ACTION_BITS } from '../net/protocol.js';

const BATTLE_LIMIT_S = 15 * 60;
const FIRE_TICK_S = 0.5;
const MAP_HALF_M = 508;
const AIM_DISTANCE_M = 1000;
const MAX_EVENTS = 128;
const CRUSH_MIN_MPS = 6 / 3.6;
const CRUSH_PRESS_S = 0.45;
const CRUSH_PRESS_GAP_S = 0.2;
const CRUSH_SPEED_KEEP = 0.94;
const RAM_PAIR_COOLDOWN_S = 0.5;
const TEAM_ALPHA = 'alpha';
const TEAM_BRAVO = 'bravo';
const TEAM_SPECTATOR = 'spectator';

const _spawn = new Vector3();
const _push = new Vector3();
const _aim = new Vector3();
const _muzzle = new Vector3();
const _gunDir = new Vector3();
const _segmentDir = new Vector3();
const _hullMatrix = new Matrix4();
const _turretMatrix = new Matrix4();
const _localMatrix = new Matrix4();
const _quat = new Quaternion();
const _euler = new Euler();
const _unit = new Vector3(1, 1, 1);
const terrainCache = new Map();

function sharedTerrain(mapId) {
  const key = String(mapId || 'verdant');
  let cached = terrainCache.get(key);
  if (cached) return cached;
  const config = getMapConfig(key);
  // The rendered battlefields use seed 1337 unless explicitly overridden.
  // Height fields are immutable after construction, so dedicated matches can
  // safely share this expensive 1 km terrain bake while keeping combat state
  // and future destructible overlays match-local.
  const terrainSeed = Number.isSafeInteger(config.seed) ? config.seed : 1337;
  cached = {
    config,
    heightField: createHeightField(terrainSeed, config),
    layout: createLayout(config),
  };
  terrainCache.set(key, cached);
  return cached;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeTeam(value) {
  return value === TEAM_BRAVO ? TEAM_BRAVO
    : value === TEAM_SPECTATOR ? TEAM_SPECTATOR : TEAM_ALPHA;
}

function makeInput() {
  return {
    throttle: 0,
    steer: 0,
    brake: false,
    fire: false,
    shellSlot: 0,
    actionBits: 0,
    aimPoint: new Vector3(),
  };
}

function spawnFor(index, team, layout, override) {
  if (override && Number.isFinite(override.x) && Number.isFinite(override.z)) {
    return {
      x: override.x,
      z: override.z,
      yaw: finite(override.yaw, team === TEAM_ALPHA ? 0 : Math.PI),
    };
  }
  if (team === TEAM_ALPHA) {
    const base = layout.spawns.player;
    const row = Math.floor(index / 4);
    const col = index % 4;
    return {
      x: base.x + (col - 1.5) * 8,
      z: base.z - row * 10,
      yaw: base.yaw,
    };
  }
  const base = layout.spawns.enemies[index % layout.spawns.enemies.length];
  return { x: base.x, z: base.z, yaw: base.yaw + Math.PI };
}

function gunWorldPose(entity) {
  const state = entity.state;
  const armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const barrelM = Math.max(0.5, finite(armor.gunBarrel && armor.gunBarrel.lengthM, 3));

  _euler.set(-state.visualPitch, state.yaw, state.visualRoll, 'YXZ');
  _quat.setFromEuler(_euler);
  _hullMatrix.compose(state.pos, _quat, _unit);
  _localMatrix.makeRotationY(state.turretYaw);
  _localMatrix.setPosition(turretPivot[0], turretPivot[1], turretPivot[2]);
  _turretMatrix.multiplyMatrices(_hullMatrix, _localMatrix);

  const sinPitch = Math.sin(state.gunPitch);
  const cosPitch = Math.cos(state.gunPitch);
  _gunDir.set(0, sinPitch, cosPitch).transformDirection(_turretMatrix).normalize();
  _muzzle.set(gunPivot[0], gunPivot[1], gunPivot[2])
    .applyMatrix4(_turretMatrix)
    .addScaledVector(_gunDir, barrelM);
  return { muzzle: _muzzle, direction: _gunDir };
}

function segmentTerrainHit(heightField, from, to) {
  const STEPS = 8;
  let priorT = 0;
  let priorGap = from.y - heightField.getHeightAt(from.x, from.z);
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const z = from.z + (to.z - from.z) * t;
    const gap = y - heightField.getHeightAt(x, z);
    if (gap <= 0 && priorGap > 0) {
      let lo = priorT;
      let hi = t;
      for (let n = 0; n < 8; n++) {
        const mid = (lo + hi) * 0.5;
        const mx = from.x + (to.x - from.x) * mid;
        const my = from.y + (to.y - from.y) * mid;
        const mz = from.z + (to.z - from.z) * mid;
        if (my > heightField.getHeightAt(mx, mz)) lo = mid;
        else hi = mid;
      }
      return hi;
    }
    priorT = t;
    priorGap = gap;
  }
  return null;
}

function firstTankTrace(shell, entities) {
  let best = null;
  let bestDistance = Infinity;
  const segmentLength = shell.prevPos.distanceTo(shell.pos);
  for (const target of entities) {
    if (target.id === shell.shooterId || !target.state || !target.combat) continue;
    const radius = finite(target.spec.armor && target.spec.armor.boundingRadiusM,
      target.spec.dims.hullLengthM * 0.65);
    const centerDistance = target.state.pos.distanceTo(shell.prevPos);
    if (centerDistance > segmentLength + radius + 2) continue;
    const pose = tankPoseFromState(target.state);
    const hits = traceTank(shell.prevPos, shell.pos, pose, target.spec.armor,
      target.combat.eraSpent);
    if (!hits.length) continue;
    const distance = shell.prevPos.distanceTo(hits[0].point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { target, hits, distance };
    }
  }
  return best;
}

function segmentWorldHit(worldCollision, heightField, from, to) {
  if (worldCollision && typeof worldCollision.raycast === 'function') {
    _segmentDir.subVectors(to, from);
    const distance = _segmentDir.length();
    if (distance <= 1e-9) return null;
    _segmentDir.multiplyScalar(1 / distance);
    const hit = worldCollision.raycast(from, _segmentDir, distance);
    return hit ? {
      t: Math.max(0, Math.min(1, hit.dist / distance)),
      kind: hit.kind,
      record: hit.record || null,
    } : null;
  }
  const t = segmentTerrainHit(heightField, from, to);
  return t == null ? null : { t, kind: 'terrain' };
}

/**
 * Create one deterministic headless battle.
 *
 * Player records are `{id,specId,team}` with optional test/tooling `spawn`.
 * IDs are match identities and may never be inferred from `specId`.
 */
export function createAuthoritativeMatch({
  players = [],
  mapId = 'verdant',
  seed = 6000,
  battleLimitS = BATTLE_LIMIT_S,
  countdownS = 5,
  worldCollision = null,
} = {}) {
  if (!Array.isArray(players) || players.length < 1 || players.length > 14) {
    throw new TypeError('players must contain 1-14 records');
  }
  const ids = new Set();
  if (worldCollision && worldCollision.mapId && worldCollision.mapId !== mapId) {
    throw new Error(`world collision map mismatch: expected ${mapId}, got ${worldCollision.mapId}`);
  }
  const shared = sharedTerrain(mapId);
  const heightField = worldCollision?.heightField || shared.heightField;
  const layout = shared.layout;
  const rng = mulberry32(seed);
  const entities = [];
  const entityById = new Map();
  const teamIndex = { [TEAM_ALPHA]: 0, [TEAM_BRAVO]: 0 };
  const pendingEvents = [];
  const destroyedObstacleIndices = [];
  let destructibleRevision = 0;
  let shells = [];
  let nextShellId = 1;
  let timeS = 0;
  let fireTickAcc = 0;
  let result = null;
  let phase = 'loading';
  let countdownRemainingS = Math.max(0, finite(countdownS, 5));
  const staticObstacles = worldCollision && typeof worldCollision.getObstacles === 'function'
    ? worldCollision.getObstacles() : [];
  const nearbyObstacles = [];
  const obstacleIndex = new Map(staticObstacles.map((obstacle, index) => [obstacle, index]));
  const obstacleByPropIdx = new Map();
  for (const obstacle of staticObstacles) {
    if (obstacle.propIdx != null && !obstacleByPropIdx.has(obstacle.propIdx)) {
      obstacleByPropIdx.set(obstacle.propIdx, obstacle);
    }
  }
  const pendingCrush = [];
  const pendingCrushSet = new Set();
  const pendingRams = [];
  const ramPairTime = new Map();

  for (const record of players) {
    const id = String(record && record.id || '').trim();
    if (!id || ids.has(id)) throw new TypeError('player ids must be non-empty and unique');
    ids.add(id);
    const team = normalizeTeam(record.team);
    if (team === TEAM_SPECTATOR) continue;
    const spec = getSpec(String(record.specId || ''));
    if (!spec) throw new TypeError(`unknown vehicle spec: ${String(record.specId)}`);
    const pad = spawnFor(teamIndex[team]++, team, layout, record.spawn);
    _spawn.set(pad.x, heightField.getHeightAt(pad.x, pad.z), pad.z);
    const state = createTankState(spec, _spawn, pad.yaw);
    const input = makeInput();
    input.aimPoint.copy(state.aimPoint);
    const combat = createCombatState(spec);
    const bot = !!record.bot;
    const equipment = applyEquipmentToCombat(
      combat,
      Array.isArray(record.equipment) ? record.equipment : defaultLoadoutFor(spec),
      spec,
    );
    const entity = {
      id,
      specId: spec.id,
      spec,
      team,
      state,
      combat,
      equip: equipment,
      input,
      bot,
      isPlayer: !bot,
      connected: true,
      kills: 0,
      damage: 0,
      consumableReadyAt: [0, 0, 0],
    };
    entities.push(entity);
    entityById.set(id, entity);
    for (let n = 0; n < 30; n++) updateTank(entity, heightField, SIM_DT);
  }

  const spottingRaycast = worldCollision && typeof worldCollision.raycast === 'function'
    ? (origin, direction, maxDistance) => worldCollision.raycast(origin, direction, maxDistance)
    : (origin, direction, maxDistance) => {
      _aim.set(
        origin.x + direction.x * maxDistance,
        origin.y + direction.y * maxDistance,
        origin.z + direction.z * maxDistance,
      );
      const hitT = segmentTerrainHit(heightField, origin, _aim);
      return hitT == null ? null : { dist: hitT * maxDistance, kind: 'terrain' };
    };
  const spotting = createSpottingSystem({
    getTanks: () => entities,
    raycast: spottingRaycast,
    concealers: worldCollision && typeof worldCollision.getConcealment === 'function'
      ? worldCollision.getConcealment() : [],
    getEquipment: (entity) => entity.equip,
    getCamoBonus: () => 0,
    rng: mulberry32(seed + 31000),
    teams: [TEAM_ALPHA, TEAM_BRAVO],
  });
  const botNavigation = entities.some((entity) => entity.bot)
    ? createBotNavigationGrid({
      heightField,
      queryObstacles: worldCollision?.queryObstacles || null,
      getObstacles: () => staticObstacles,
    })
    : null;

  for (let index = 0; index < entities.length; index++) {
    const entity = entities[index];
    if (!entity.bot) continue;
    const opponents = entities.filter((entry) => entry.team !== entity.team);
    const allies = entities.filter((entry) => entry !== entity && entry.team === entity.team);
    const botRng = mulberry32(seed + 41000 + index * 997);
    entity.aiCtl = createAI(entity, {
      difficulty: players.find((record) => String(record.id) === entity.id)?.difficulty || 'normal',
      rng: botRng,
      deps: {
        heightField,
        raycast: spottingRaycast,
        getEnemies: () => opponents,
        getAllies: () => allies,
        getObstacles: () => staticObstacles,
        queryObstacles: worldCollision?.queryObstacles || null,
        spotting: {
          isSpotted: (targetId, receiver) =>
            spotting.isSpotted(targetId, entity.team, receiver || entity),
        },
      },
    });
    const goal = opponents[Math.floor(botRng() * Math.max(1, opponents.length))]?.state.pos;
    if (goal) {
      entity.aiCtl.setWaypoints(planBotRoute({
        start: entity.state.pos,
        goal,
        navigation: botNavigation,
        rng: botRng,
        role: roleOf(entity.spec),
      }));
    }
  }

  function emit(type, payload) {
    if (pendingEvents.length >= MAX_EVENTS) pendingEvents.shift();
    pendingEvents.push({ type, timeS, ...payload });
  }

  function applyNetworkInput(entity, input) {
    if (!input || entity.combat.destroyed) {
      entity.input.throttle = 0;
      entity.input.steer = 0;
      entity.input.brake = true;
      entity.input.fire = false;
      entity.input.actionBits = 0;
      return;
    }
    entity.input.throttle = input.throttle;
    entity.input.steer = input.steer;
    entity.input.brake = input.brake;
    entity.input.fire = input.fire;
    entity.input.actionBits = input.actionBits | 0;
    const shellSlot = Math.min(entity.spec.gun.shells.length - 1, input.shellSlot);
    if (shellSlot !== entity.combat.shellSlot) selectShell(entity.combat, shellSlot, entity.spec);
    entity.input.shellSlot = shellSlot;
    const cosPitch = Math.cos(input.aimPitch);
    _aim.set(
      entity.state.pos.x + Math.sin(input.aimYaw) * cosPitch * AIM_DISTANCE_M,
      entity.state.pos.y + Math.sin(input.aimPitch) * AIM_DISTANCE_M,
      entity.state.pos.z + Math.cos(input.aimYaw) * cosPitch * AIM_DISTANCE_M,
    );
    entity.input.aimPoint.copy(_aim);
  }

  function collideFor(entity, pos, _radius, outPush) {
    outPush.set(0, 0, 0);
    const safeX = Math.max(-MAP_HALF_M, Math.min(MAP_HALF_M, pos.x));
    const safeZ = Math.max(-MAP_HALF_M, Math.min(MAP_HALF_M, pos.z));
    outPush.x += safeX - pos.x;
    outPush.z += safeZ - pos.z;

    const halfL = entity.spec.dims.hullLengthM * 0.5;
    const halfW = entity.spec.dims.widthM * 0.5;
    const yaw = entity.state.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = fz;
    const rz = -fx;
    const broadRadius = Math.hypot(halfL, halfW) + 0.01;
    const candidates = worldCollision && typeof worldCollision.queryObstacles === 'function'
      ? worldCollision.queryObstacles(
        pos.x - broadRadius, pos.z - broadRadius,
        pos.x + broadRadius, pos.z + broadRadius,
        nearbyObstacles,
      )
      : staticObstacles;
    for (const obstacle of candidates) {
      if (obstacle.crushed || pos.y > obstacle.max[1] + 0.5) continue;
      const closestX = Math.max(obstacle.min[0], Math.min(pos.x, obstacle.max[0]));
      const closestZ = Math.max(obstacle.min[2], Math.min(pos.z, obstacle.max[2]));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      if (dx * dx + dz * dz >= broadRadius * broadRadius) continue;
      const beforeX = outPush.x;
      const beforeZ = outPush.z;
      if (!pushHullFromObstacle(
        pos, fx, fz, rx, rz, halfL, halfW, obstacle, outPush,
      )) continue;
      if (obstacle.crushable) {
        let crushNow = Math.abs(entity.state.speed) > (obstacle.crushMin ?? CRUSH_MIN_MPS);
        if (!crushNow && Math.abs(entity.input.throttle || 0) > 0.35) {
          if (timeS - (obstacle._pressT || -1e9) > CRUSH_PRESS_GAP_S) obstacle._pressS = 0;
          obstacle._pressT = timeS;
          obstacle._pressS = (obstacle._pressS || 0) + SIM_DT;
          crushNow = obstacle._pressS >= CRUSH_PRESS_S;
        }
        if (crushNow) {
          outPush.x = beforeX;
          outPush.z = beforeZ;
          if (!pendingCrushSet.has(obstacle)) {
            pendingCrushSet.add(obstacle);
            pendingCrush.push({ obstacle, entity, cause: 'ram' });
          }
        }
      }
    }

    // Match the local simulation's hull-capsule contact instead of using a
    // circular force field. This keeps close formation driving natural and
    // gives ram damage a stable contact normal.
    const mySeg = Math.max(halfL - halfW, 0);
    for (const other of entities) {
      if (other === entity || !other.state) continue;
      const otherHalfW = other.spec.dims.widthM * 0.5;
      const otherSeg = Math.max(other.spec.dims.hullLengthM * 0.5 - otherHalfW, 0);
      const minDistance = halfW + otherHalfW;
      const dx = pos.x - other.state.pos.x;
      const dz = pos.z - other.state.pos.z;
      const outer = mySeg + otherSeg + minDistance;
      if (dx * dx + dz * dz > outer * outer) continue;
      const ofx = Math.sin(other.state.yaw);
      const ofz = Math.cos(other.state.yaw);
      const parallel = fx * ofx + fz * ofz;
      const alongSelf = dx * fx + dz * fz;
      const alongOther = dx * ofx + dz * ofz;
      const denom = 1 - parallel * parallel;
      let selfT = denom > 1e-6
        ? (parallel * alongOther - alongSelf) / denom
        : -alongSelf;
      selfT = Math.max(-mySeg, Math.min(mySeg, selfT));
      let otherT = alongOther + parallel * selfT;
      otherT = Math.max(-otherSeg, Math.min(otherSeg, otherT));
      selfT = Math.max(-mySeg, Math.min(mySeg, parallel * otherT - alongSelf));
      const wx = dx + fx * selfT - ofx * otherT;
      const wz = dz + fz * selfT - ofz * otherT;
      const distanceSq = wx * wx + wz * wz;
      if (distanceSq >= minDistance * minDistance) continue;
      const distance = Math.sqrt(Math.max(distanceSq, 1e-8));
      const nx = distance > 1e-4 ? wx / distance : rx;
      const nz = distance > 1e-4 ? wz / distance : rz;
      const push = minDistance - distance;
      outPush.x += nx * push;
      outPush.z += nz * push;
      if (distance > 1e-4) {
        const relativeX = fx * entity.state.speed - ofx * other.state.speed;
        const relativeZ = fz * entity.state.speed - ofz * other.state.speed;
        const closing = -(relativeX * nx + relativeZ * nz);
        if (closing > 0) pendingRams.push({ a: entity, b: other, closing });
      }
    }
    return outPush.x !== 0 || outPush.z !== 0;
  }

  function destroyObstacle(obstacle, entity, cause = 'ram') {
    if (!obstacle || obstacle.crushed) return false;
    const directionSign = entity?.state ? Math.sign(entity.state.speed || 1) : 1;
    const directionX = entity?.state ? Math.sin(entity.state.yaw) * directionSign : 0;
    const directionZ = entity?.state ? Math.cos(entity.state.yaw) * directionSign : 1;
    const speedMps = entity?.state ? Math.abs(entity.state.speed) : 0;
    const destroyed = worldCollision && typeof worldCollision.crushObstacle === 'function'
      ? worldCollision.crushObstacle(obstacle, directionX, directionZ, speedMps)
      : true;
    if (destroyed === false) return false;
    obstacle.crushed = true;
    const destroyedIndex = obstacleIndex.get(obstacle);
    if (Number.isSafeInteger(destroyedIndex)) {
      destroyedObstacleIndices.push(destroyedIndex);
      destructibleRevision++;
    }
    if (entity?.state) entity.state.speed *= obstacle.crushKeep ?? CRUSH_SPEED_KEEP;
    emit('world_prop_destroyed', {
      obstacleIndex: destroyedIndex,
      propIdx: obstacle.propIdx,
      treeIdx: obstacle.treeIdx,
      kind: obstacle.kind || (obstacle.treeIdx != null ? 'tree' : 'prop'),
      cause,
      directionX,
      directionZ,
      speedMps,
    });
    return true;
  }

  function resolvePendingCrushes() {
    for (const entry of pendingCrush) {
      destroyObstacle(entry.obstacle, entry.entity, entry.cause);
    }
    pendingCrush.length = 0;
    pendingCrushSet.clear();
  }

  function resolvePendingRams() {
    if (!pendingRams.length) return;
    const best = new Map();
    for (const contact of pendingRams) {
      const key = contact.a.id < contact.b.id
        ? `${contact.a.id}|${contact.b.id}` : `${contact.b.id}|${contact.a.id}`;
      const current = best.get(key);
      if (!current || contact.closing > current.closing) best.set(key, contact);
    }
    pendingRams.length = 0;
    for (const [key, contact] of best) {
      const last = ramPairTime.get(key);
      if (last != null && timeS - last < RAM_PAIR_COOLDOWN_S) continue;
      const a = contact.a;
      const b = contact.b;
      if (!a.combat || !b.combat || a.combat.destroyed) continue;
      const damage = ramDamage(a.spec.weightTons, b.spec.weightTons, contact.closing);
      if (damage.total <= 0) continue;
      ramPairTime.set(key, timeS);
      const bWasDestroyed = b.combat.destroyed;
      const damageA = damage.toA;
      const damageB = bWasDestroyed ? 0 : damage.toB;
      a.combat.hp = Math.max(0, a.combat.hp - damageA);
      if (!bWasDestroyed) b.combat.hp = Math.max(0, b.combat.hp - damageB);
      a.combat.destroyed = a.combat.hp <= 0;
      if (!bWasDestroyed) b.combat.destroyed = b.combat.hp <= 0;
      emit('tank_ram', {
        aId: a.id,
        bId: b.id,
        damageA,
        damageB,
        closingMps: contact.closing,
        x: (a.state.pos.x + b.state.pos.x) * 0.5,
        y: (a.state.pos.y + b.state.pos.y) * 0.5,
        z: (a.state.pos.z + b.state.pos.z) * 0.5,
      });
      if (!bWasDestroyed && b.combat.destroyed) {
        a.kills += 1;
        emit('tank_destroyed', { id: b.id, killerId: a.id, cause: 'ram' });
      }
      if (a.combat.destroyed) {
        if (!bWasDestroyed) b.kills += 1;
        emit('tank_destroyed', { id: a.id, killerId: bWasDestroyed ? null : b.id, cause: 'ram' });
      }
    }
  }

  function useConsumables(entity) {
    const bits = entity.input.actionBits | 0;
    entity.input.actionBits = 0;
    if (!bits || entity.combat.destroyed) return;
    for (let slot = 0; slot < CONSUMABLE_RULES.length; slot++) {
      const bit = 1 << slot;
      if (!(bits & bit)) continue;
      const remainingS = cooldownRemaining(timeS, entity.consumableReadyAt[slot]);
      if (remainingS > 0) {
        emit('consumable_denied', { id: entity.id, slot, reason: 'COOLDOWN', remainingS });
        continue;
      }
      let used = false;
      if (bit === PLAYER_ACTION_BITS.REPAIR) {
        const modules = repairAllModules(entity.combat);
        used = modules.length > 0;
        for (const module of modules) emit('module_state', {
          id: entity.id, module, state: 'ok',
        });
      } else if (bit === PLAYER_ACTION_BITS.FIRST_AID) {
        for (const crew of Object.keys(entity.combat.crew)) {
          if (entity.combat.crew[crew] === false) {
            entity.combat.crew[crew] = true;
            used = true;
          }
        }
      } else if (bit === PLAYER_ACTION_BITS.EXTINGUISHER && entity.combat.fire.burning) {
        entity.combat.fire.burning = false;
        entity.combat.fire.ticksLeft = 0;
        entity.combat.fire.tickTimer = 0;
        used = true;
        emit('tank_fire', { id: entity.id, burning: false });
      }
      if (!used) {
        emit('consumable_denied', { id: entity.id, slot, reason: 'NOTHING' });
        continue;
      }
      const cooldownS = CONSUMABLE_RULES[slot].cooldownS;
      const readyAt = timeS + cooldownS;
      entity.consumableReadyAt[slot] = readyAt;
      emit('consumable_used', { id: entity.id, slot, cooldownS, readyAt });
    }
  }

  function tryFire(entity) {
    const combat = entity.combat;
    if (!entity.input.fire || combat.destroyed || combat.reload.t > 0) return;
    if (combat.modules.gun && combat.modules.gun.state === 'red') return;
    const shellSpec = entity.spec.gun.shells[combat.shellSlot];
    if (!shellSpec) return;
    if (entity.bot) {
      const friendlyRisk = botFriendlyFireRisk(
        entity, entity.input.aimPoint, shellSpec, entities,
      );
      if (friendlyRisk) {
        if (entity.aiCtl?.notifyFriendlyBlocked) {
          entity.aiCtl.notifyFriendlyBlocked(friendlyRisk);
        }
        return;
      }
    }
    const gun = gunWorldPose(entity);
    _gunDir.copy(gun.direction);
    const sigma = computeDispersionRadM(entity.spec, entity.state, 100) / 200;
    applyDispersion(_gunDir, sigma, rng);
    const shell = createShell(shellSpec, entity.id, true, gun.muzzle, _gunDir, nextShellId++);
    shells.push(shell);
    startReload(combat, entity.spec);
    fireRecoil(entity.state, entity.spec, shellSpec);
    spotting.notifyFired(entity.id, timeS, shellSpec.caliberMm);
    if (!entity.bot) {
      const respondingBots = entities
        .filter((entry) => entry.bot && entry.team !== entity.team && entry.aiCtl)
        .sort((a, b) => a.state.pos.distanceToSquared(entity.state.pos) -
          b.state.pos.distanceToSquared(entity.state.pos));
      for (let index = 0; index < respondingBots.length; index++) {
        respondingBots[index].aiCtl.notifyPlayerFired(entity, index);
      }
    }
    emit('shell_fired', {
      shellId: shell.id,
      shooterId: entity.id,
      shellType: shellSpec.type,
      shellName: shellSpec.name,
      caliberMm: shellSpec.caliberMm,
      velocityMps: shellSpec.velocityMps,
      x: gun.muzzle.x,
      y: gun.muzzle.y,
      z: gun.muzzle.z,
      dx: _gunDir.x,
      dy: _gunDir.y,
      dz: _gunDir.z,
    });
  }

  function recordShellHit(shell, hit, wasDestroyed = false) {
    const target = hit.targetId ? entityById.get(hit.targetId) : null;
    const shooter = entityById.get(shell.shooterId);
    if (shooter && hit.damage > 0) shooter.damage += hit.damage;
    if (shooter?.aiCtl) shooter.aiCtl.notifyShellResult({
      ...hit,
      targetId: target?.id || null,
    });
    if (shooter && target && hit.damage > 0) {
      for (const ally of entities) {
        if (ally.team === target.team && ally.aiCtl) ally.aiCtl.notifyUnderFire(shooter);
      }
    }
    emit('shell_hit', {
      ...hit,
      shooterId: shell.shooterId,
      attackerId: shell.shooterId,
      targetName: target?.spec.name,
      targetSpecId: target?.specId,
      targetMaxHp: target?.combat.maxHp || 0,
      damage: Math.max(0, Math.round(hit.damage || 0)),
      targetHp: Math.max(0, Math.round(target?.combat.hp || 0)),
    });
    if (target && Array.isArray(hit.modulesHit)) {
      for (const module of hit.modulesHit) emit('module_state', {
        id: target.id,
        module: module.module,
        state: module.newState,
        source: 'hit',
      });
    }
    if (target && hit.fireStarted) emit('tank_fire', { id: target.id, burning: true });
    if (target && !wasDestroyed && target.combat.destroyed) {
      if (shooter) shooter.kills += 1;
      emit('tank_destroyed', {
        id: target.id,
        killerId: shell.shooterId,
        cause: hit.ammoRacked ? 'ammo_rack' : 'shot',
      });
    }
  }

  function stepShells(dt) {
    for (const shell of shells) {
      if (shell.dead) continue;
      stepShell(shell, dt);
      const worldHit = segmentWorldHit(worldCollision, heightField, shell.prevPos, shell.pos);
      const tankHit = firstTankTrace(shell, entities);
      const segmentLength = shell.prevPos.distanceTo(shell.pos);
      if (worldHit && (!tankHit || worldHit.t * segmentLength < tankHit.distance)) {
        shell.pos.lerpVectors(shell.prevPos, shell.pos, worldHit.t);
        if (isHeClass(shell.spec.type)) {
          const wasDestroyed = new Map(entities.map((entity) => [entity.id, entity.combat.destroyed]));
          const hits = resolveHeBurst(shell, shell.pos, entities, null, null, rng);
          for (const hit of hits) recordShellHit(
            shell, hit, hit.targetId ? wasDestroyed.get(hit.targetId) : false,
          );
        } else {
          shell.dead = true;
        }
        if (worldHit.record?.propIdx != null) {
          const propObstacle = obstacleByPropIdx.get(worldHit.record.propIdx);
          if (propObstacle?.crushable) destroyObstacle(propObstacle, null, 'shell');
        }
        emit('shell_impact', {
          shellId: shell.id,
          shooterId: shell.shooterId,
          kind: worldHit.kind,
          x: shell.pos.x,
          y: shell.pos.y,
          z: shell.pos.z,
        });
        continue;
      }
      if (!tankHit) continue;
      if (isHeClass(shell.spec.type)) {
        const burstPoint = tankHit.hits[0].point;
        const wasDestroyed = new Map(entities.map((entity) => [entity.id, entity.combat.destroyed]));
        const hits = resolveHeBurst(
          shell, burstPoint, entities, tankHit.target, tankHit.hits, rng,
        );
        for (const hit of hits) recordShellHit(
          shell, hit, hit.targetId ? wasDestroyed.get(hit.targetId) : false,
        );
      } else {
        const wasDestroyed = tankHit.target.combat.destroyed;
        const hit = resolveShellHit(shell, tankHit.target, tankHit.hits, rng);
        recordShellHit(shell, hit, wasDestroyed);
      }
    }
    shells = shells.filter((shell) => !shell.dead);
  }

  function updateVisibility() {
    for (const event of spotting.update(SIM_DT, timeS)) {
      emit('tank_spotted', event);
    }
  }

  function determineResult() {
    let alpha = 0;
    let bravo = 0;
    for (const entity of entities) {
      if (entity.combat.destroyed) continue;
      if (entity.team === TEAM_ALPHA) alpha++;
      else if (entity.team === TEAM_BRAVO) bravo++;
    }
    if (alpha === 0 || bravo === 0 || timeS >= battleLimitS) {
      result = alpha === bravo ? 'draw' : alpha > bravo ? TEAM_ALPHA : TEAM_BRAVO;
      emit('match_ended', { result });
    }
  }

  const simulation = {
    entities,
    entityById,
    requiredPeerIds: entities.filter((entity) => !entity.bot).map((entity) => entity.id),
    heightField,
    get timeS() { return timeS; },
    get result() { return result; },
    get phase() { return phase; },

    onMatchReady() {
      if (phase !== 'loading') return;
      phase = countdownRemainingS > 0 ? 'countdown' : 'playing';
      emit(phase === 'countdown' ? 'match_countdown' : 'match_started', {
        countdownMs: Math.round(countdownRemainingS * 1000),
      });
    },

    onPeerJoin({ peerId }) {
      const entity = entityById.get(peerId);
      if (entity) entity.connected = true;
    },

    onPeerLeave({ peerId }) {
      const entity = entityById.get(peerId);
      if (entity) {
        entity.connected = false;
        entity.input.throttle = 0;
        entity.input.steer = 0;
        entity.input.brake = true;
        entity.input.fire = false;
      }
    },

    step({ dt, inputs }) {
      if (result) return;
      if (Math.abs(dt - SIM_DT) > 1e-9) {
        throw new Error(`authoritative match requires ${SIM_DT}s fixed steps`);
      }
      if (phase === 'countdown') {
        countdownRemainingS = Math.max(0, countdownRemainingS - dt);
        for (const entity of entities) applyNetworkInput(entity, null);
        if (countdownRemainingS === 0) {
          phase = 'playing';
          emit('match_started', { countdownMs: 0 });
        }
        updateVisibility();
        return;
      }
      if (phase !== 'playing') return;
      timeS += dt;
      for (const entity of entities) {
        if (entity.bot) entity.aiCtl?.update(dt, timeS);
        else applyNetworkInput(entity, inputs.get(entity.id));
        useConsumables(entity);
      }
      for (const entity of entities) {
        if (entity.combat.destroyed) continue;
        updateTank(entity, heightField, dt,
          (pos, radius, out) => collideFor(entity, pos, radius, out));
      }
      resolvePendingCrushes();
      resolvePendingRams();
      for (const entity of entities) {
        if (entity.combat.destroyed) continue;
        if (entity.combat.reload.t > 0) {
          entity.combat.reload.t = Math.max(0, entity.combat.reload.t - dt);
        }
        tryFire(entity);
      }
      stepShells(dt);
      fireTickAcc += dt;
      if (fireTickAcc >= FIRE_TICK_S) {
        fireTickAcc -= FIRE_TICK_S;
        for (const entity of entities) {
          if (entity.combat.destroyed) continue;
          const fire = tickFire(entity, rng);
          if (fire.extinguished) emit('tank_fire', { id: entity.id, burning: false });
          if (fire.destroyed) emit('tank_destroyed', {
            id: entity.id,
            killerId: entity.id,
            cause: 'fire',
          });
        }
      }
      for (const entity of entities) {
        for (const module of tickModuleRepairs(entity.combat, dt)) {
          emit('module_state', { id: entity.id, module, state: 'yellow', repaired: true });
        }
      }
      updateVisibility();
      determineResult();
    },

    snapshot({ tick, serverTimeMs, viewerId, ackInputSeq }) {
      const viewer = entityById.get(viewerId);
      const canObserve = (_id, entity) => !viewer || entity.team === viewer.team ||
        entity.combat.destroyed || spotting.isSpotted(entity.id, viewer.team, viewer);
      const canObserveShell = (_id, shell) => {
        const shooter = entityById.get(shell.shooterId);
        return !shooter || canObserve(viewerId, shooter);
      };
      const canObserveEvent = (_id, event) => {
        if (!viewer) return true;
        if (event.type === 'world_prop_destroyed') return true;
        for (const id of [
          event.id, event.shooterId, event.targetId, event.killerId,
          event.aId, event.bId,
        ]) {
          if (!id) continue;
          const entity = entityById.get(id);
          if (entity && canObserve(viewerId, entity)) return true;
        }
        return event.type === 'match_ended';
      };
      return captureWorldSnapshot({
        tick,
        serverTimeMs,
        entities,
        shells,
        events: pendingEvents,
        viewerId,
        ackInputSeq,
        canObserve,
        canObserveShell,
        canObserveEvent,
        meta: {
          phase,
          countdownMs: Math.round(countdownRemainingS * 1000),
          battleTimeMs: Math.round(timeS * 1000),
          result,
          destructibleRevision,
          destroyedObstacleIndices: destroyedObstacleIndices.slice(),
        },
      });
    },

    afterSnapshotBroadcast() {
      pendingEvents.length = 0;
    },
  };
  updateVisibility();
  return simulation;
}
