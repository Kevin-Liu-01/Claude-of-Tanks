import { Vector3 } from 'three';
import { createCombatState } from '../sim/damage.js';
import { createTankState, shotRecoilScale } from '../sim/movement.js';
import { getSpec } from '../vehicles/specs.js';
import { createTank, ensureTankBuilder } from '../vehicles/fleetFactory.js';
import { prebakeSharedTextures } from '../vehicles/materials.js';
import { pushHullFromObstacle } from '../world/collision.js';
import { LocalTankPredictor } from './localTankPrediction.ts';
import { PresentationEventQueue } from './presentationEventQueue.js';
import { SNAPSHOT_FLAGS } from './snapshot.js';
import { createSpecialActionState } from '../sim/specialActions.js';

const POS_SCALE = 100;
const VEL_SCALE = 100;
const MAP_HALF_M = 508;
const _muzzleTip = new Vector3(); // §5.362 twin-plant flash-origin scratch

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Reconcile viewer-filtered network snapshots into first-party tank visuals.
 * No local gameplay is simulated here; interpolation output is presentation
 * state only and every combat value comes from authority.
 */
export function createBrowserBattleBridge({
  engineCtx,
  game,
  bus,
  viewerId,
  spectator = false,
  worldCollision = null,
  createTankVisual = createTank,
  prepareVisualTextures = prebakeSharedTextures,
} = {}) {
  if (!engineCtx || !engineCtx.scene || !game) throw new TypeError('engineCtx and game are required');
  const id = String(viewerId || '');
  if (!id) throw new TypeError('viewerId is required');
  const entities = new Map();
  const roster = [];
  const shellById = new Map();
  const visibleRoster = [];
  const liveShells = [];
  let viewerTeam = null;
  let perspectiveTeam = null;
  let snapshotPhase = null;
  let mounted = false;
  let legacyState = null;
  const destructionCause = new Map();
  const nearbyPredictionObstacles = [];
  let appliedDestructibleRevision = -1;
  let visualDestroyCount = 0;
  let visualDestroyTotalMs = 0;
  let visualDestroyMaxMs = 0;

  function collidePrediction(entity, pos, _radius, outPush) {
    outPush.set(0, 0, 0);
    const safeX = Math.max(-MAP_HALF_M, Math.min(MAP_HALF_M, pos.x));
    const safeZ = Math.max(-MAP_HALF_M, Math.min(MAP_HALF_M, pos.z));
    outPush.x = safeX - pos.x;
    outPush.z = safeZ - pos.z;
    if (!worldCollision) return outPush.x !== 0 || outPush.z !== 0;
    const halfL = entity.spec.dims.hullLengthM * 0.5;
    const halfW = entity.spec.dims.widthM * 0.5;
    const yaw = entity.state.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = fz, rz = -fx;
    const broadRadius = Math.hypot(halfL, halfW) + 0.01;
    const candidates = typeof worldCollision.queryObstacles === 'function'
      ? worldCollision.queryObstacles(
        pos.x - broadRadius, pos.z - broadRadius,
        pos.x + broadRadius, pos.z + broadRadius,
        nearbyPredictionObstacles,
      )
      : (typeof worldCollision.getObstacles === 'function' ? worldCollision.getObstacles() : []);
    for (const obstacle of candidates) {
      if (obstacle.crushed || pos.y > obstacle.max[1] + 0.5) continue;
      // Fast overruns are resolved by authority. Let prediction continue
      // through crushable dressing instead of visibly stopping at a fence
      // that the next snapshot is about to destroy.
      if (obstacle.crushable &&
          Math.abs(entity.state.speed) > (obstacle.crushMin ?? 2.8)) continue;
      const closestX = Math.max(obstacle.min[0], Math.min(pos.x, obstacle.max[0]));
      const closestZ = Math.max(obstacle.min[2], Math.min(pos.z, obstacle.max[2]));
      const dx = pos.x - closestX, dz = pos.z - closestZ;
      if (dx * dx + dz * dz >= broadRadius * broadRadius) continue;
      if (pushHullFromObstacle(pos, fx, fz, rx, rz, halfL, halfW, obstacle, outPush)) {
        entity._predictionStaticContacts = (entity._predictionStaticContacts || 0) + 1;
      }
    }

    // Authority resolves tanks as hull capsules. Predicting only static world
    // collision lets the local hull drive several metres through a teammate
    // before a snapshot pulls it back, producing the rapid rubber-band loop
    // seen after sustained movement. Mirror the same narrow phase against
    // currently disclosed snapshot poses; never consult hidden entities.
    const mySeg = Math.max(halfL - halfW, 0);
    for (const other of entities.values()) {
      if (other.id === id || !other.state ||
          (!other.networkVisible && !other.combat?.destroyed)) continue;
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
      entity._predictionDynamicContacts = (entity._predictionDynamicContacts || 0) + 1;
      const distance = Math.sqrt(Math.max(distanceSq, 1e-8));
      const push = minDistance - distance;
      if (distance > 1e-4) {
        outPush.x += (wx / distance) * push;
        outPush.z += (wz / distance) * push;
      } else {
        outPush.x += rx * push;
        outPush.z += rz * push;
      }
    }
    return outPush.x !== 0 || outPush.z !== 0;
  }

  function ensureEntity(snapshot) {
    let entity = entities.get(snapshot.id);
    if (entity) {
      if (snapshot.name) entity.displayName = snapshot.name;
      return entity;
    }
    const spec = getSpec(snapshot.specId);
    const pos = new Vector3(snapshot.x, snapshot.y, snapshot.z);
    const state = createTankState(spec, pos, snapshot.yaw);
    const combat = createCombatState(spec);
    const visual = createTankVisual(spec.id, engineCtx, {
      camoSeed: 4000 + (hashString(snapshot.id) % 100000),
      camoPattern: snapshot.camo || 'factory',
      quality: snapshot.id === id ? 'high' : 'ai',
    });
    engineCtx.scene.add(visual.root);
    visual.setVisible(false);
    entity = {
      id: snapshot.id,
      specId: spec.id,
      spec,
      camo: snapshot.camo || 'factory',
      displayName: snapshot.name || null,
      networkTeam: snapshot.team,
      team: 'enemy',
      isPlayer: !spectator && snapshot.id === id,
      state,
      combat,
      specialAction: createSpecialActionState(spec),
      input: {
        throttle: 0,
        steer: 0,
        brake: false,
        fire: false,
        shellSlot: 0,
        aimPoint: state.aimPoint.clone(),
      },
      visual,
      contactGeom: visual.contactGeom || null,
      rigidGear: false,
      networkVisible: false,
      _networkPoseReady: false,
      _networkDestroyed: false,
      _lastX: snapshot.x,
      _lastZ: snapshot.z,
    };
    if (!spectator && snapshot.id === id && worldCollision?.heightField) {
      entity.predictor = new LocalTankPredictor({
        entity,
        heightField: worldCollision.heightField,
        collide: collidePrediction,
      });
    }
    entities.set(entity.id, entity);
    roster.push(entity);
    return entity;
  }

  async function prepareRoster(players, onProgress = null) {
    const active = (players || []).filter((player) => player.team !== 'spectator');
    const warmed = new Set();
    for (let index = 0; index < active.length; index++) {
      const player = active[index];
      await ensureTankBuilder(player.specId);
      const quality = !spectator && player.id === id ? 'high' : 'ai';
      const camo = player.camo || 'factory';
      const warmKey = `${player.specId}:${camo}:${quality}`;
      if (!warmed.has(warmKey)) {
        warmed.add(warmKey);
        try {
          await prepareVisualTextures(
            getSpec(player.specId),
            engineCtx.anisotropy ?? 4,
            quality,
            nextFrame,
            camo,
          );
        } catch (_) { /* createTank retains its synchronous compatibility path */ }
      }
      ensureEntity({
        id: player.id,
        name: player.name,
        specId: player.specId,
        camo,
        team: player.team,
        x: 0, y: 0, z: 0, yaw: 0,
      });
      if (onProgress) onProgress((index + 1) / Math.max(1, active.length), player.specId);
      await nextFrame();
    }
  }

  function updateEntity(entity, snapshot, dt, immediateAuthority = null) {
    entity.networkTeam = snapshot.team;
    if (!spectator && entity.id === id) viewerTeam = snapshot.team;
    const referenceTeam = spectator ? perspectiveTeam : viewerTeam;
    entity.team = snapshot.team === referenceTeam ? 'player' : 'enemy';
    entity.isPlayer = !spectator && entity.id === id;
    entity.networkVisible = true;
    const state = entity.state;
    const combat = entity.combat;
    combat.hp = snapshot.hp;
    combat.maxHp = snapshot.maxHp;
    combat.reload.t = snapshot.reloadS;
    combat.reload.totalS = Math.max(snapshot.reloadTotalS || 0, snapshot.reloadS);
    combat.reload.kind = snapshot.reloadKind || 'ready';
    if (snapshot.magazineCapacity > 0) {
      if (!combat.magazine) combat.magazine = { rounds: 0, capacity: 0 };
      combat.magazine.rounds = snapshot.magazineRounds;
      combat.magazine.capacity = snapshot.magazineCapacity;
    } else {
      combat.magazine = null;
    }
    combat.shellSlot = snapshot.shellSlot;
    combat.fire.burning = !!(snapshot.flags & SNAPSHOT_FLAGS.BURNING);
    const destroyed = !!(snapshot.flags & SNAPSHOT_FLAGS.DESTROYED);
    combat.destroyed = destroyed;
    entity.input.fire = !!(snapshot.flags & SNAPSHOT_FLAGS.FIRING);
    entity.input.shellSlot = snapshot.shellSlot;
    entity.specialAction.active = !!(snapshot.flags & SNAPSHOT_FLAGS.SPECIAL_ACTIVE);
    entity.specialAction.pendingFire = !!(snapshot.flags & SNAPSHOT_FLAGS.SPECIAL_PENDING);
    state.suspensionAim = entity.specialAction.kind === 'hydropneumatic_aim' &&
      entity.specialAction.active;
    if (destroyed) visualDestroy(entity);
    else if (!destroyed && entity._networkDestroyed) {
      if (entity.visual.resetDestroyed) entity.visual.resetDestroyed();
      entity._networkDestroyed = false;
      entity._networkDestroyPop = false;
    }
    if (entity.predictor && immediateAuthority) {
      entity.predictor.reconcile({
        ...immediateAuthority,
        sampledEntity: snapshot,
      }, dt, destroyed);
    } else {
      const dx = snapshot.x - entity._lastX;
      const dz = snapshot.z - entity._lastZ;
      const forwardDistance = dx * Math.sin(snapshot.yaw) + dz * Math.cos(snapshot.yaw);
      state.trackScroll.l += forwardDistance;
      state.trackScroll.r += forwardDistance;
      state.pos.set(snapshot.x, snapshot.y, snapshot.z);
      state.verticalSpeed = snapshot.vy || 0;
      state.grounded = !(snapshot.flags & SNAPSHOT_FLAGS.AIRBORNE);
      if (state._ride) {
        state._ride.y = snapshot.y;
        state._ride.v = state.verticalSpeed;
        state._ride.grounded = state.grounded;
      }
      state.yaw = snapshot.yaw;
      state.visualPitch = snapshot.pitch;
      state.visualRoll = snapshot.roll;
      state.turretYaw = snapshot.turretYaw;
      state.gunPitch = snapshot.gunPitch;
      const speed = Math.hypot(snapshot.vx, snapshot.vz);
      const direction = snapshot.vx * Math.sin(snapshot.yaw) + snapshot.vz * Math.cos(snapshot.yaw);
      state.speed = direction < 0 ? -speed : speed;
    }
    entity._lastX = state.pos.x;
    entity._lastZ = state.pos.z;
    // Prepared network visuals live at a hidden staging origin. Seed the
    // renderer from authority exactly once before revealing them; the normal
    // main-loop sync remains the sole per-frame owner after this point.
    if (!entity._networkPoseReady) {
      entity.visual.syncFromState(state, 0);
      entity._networkPoseReady = true;
    }
    entity.visual.setVisible(true);
  }

  function visualDestroy(entity) {
    const pop = destructionCause.get(entity.id) === 'ammo_rack';
    if (entity._networkDestroyed && entity._networkDestroyPop === pop) return;
    entity._networkDestroyed = true;
    entity._networkDestroyPop = pop;
    if (entity.visual.setDestroyed) {
      const startedAt = performance.now();
      entity.visual.setDestroyed({ pop });
      const elapsedMs = performance.now() - startedAt;
      visualDestroyCount += 1;
      visualDestroyTotalMs += elapsedMs;
      visualDestroyMaxMs = Math.max(visualDestroyMaxMs, elapsedMs);
    }
  }

  function updateShells(rawShells) {
    const live = new Set();
    for (const raw of rawShells || []) {
      const shellId = Number(raw.id);
      live.add(shellId);
      let shell = shellById.get(shellId);
      if (!shell) {
        shell = {
          id: shellId,
          shooterId: raw.shooterId,
          pos: new Vector3(),
          prevPos: new Vector3(),
          vel: new Vector3(),
          spec: {
            type: raw.type,
            tracer: raw.guided ? 'ATGM' : raw.type,
            guided: !!raw.guided,
          },
          dead: false,
          ageS: 0,
          distM: 0,
        };
        shellById.set(shellId, shell);
      }
      shell.prevPos.copy(shell.pos);
      shell.pos.set(raw.x / POS_SCALE, raw.y / POS_SCALE, raw.z / POS_SCALE);
      if (shell.prevPos.lengthSq() === 0) shell.prevPos.copy(shell.pos);
      else shell.distM += shell.prevPos.distanceTo(shell.pos);
      shell.vel.set(raw.vx / VEL_SCALE, raw.vy / VEL_SCALE, raw.vz / VEL_SCALE);
      shell.spec.type = raw.type;
      shell.spec.guided = !!raw.guided;
      shell.spec.tracer = raw.guided ? 'ATGM' : raw.type;
      shell.ageS = Math.max(0, game.timeS - (shell.spawnedAtS || game.timeS));
      if (shell.spawnedAtS == null) shell.spawnedAtS = game.timeS;
    }
    for (const [shellId, shell] of shellById) {
      if (!live.has(shellId)) { shell.dead = true; shellById.delete(shellId); }
    }
    liveShells.length = 0;
    for (const shell of shellById.values()) liveShells.push(shell);
    game.shells = liveShells;
  }

  function emitEvent(event) {
    if (!bus || typeof bus.emit !== 'function') return;
    if (event.type === 'shell_fired') {
        const shooter = entities.get(event.shooterId);
        // §5.362 fleet recoil in networked battles: the authoritative sim
        // fires server-side, so play the same presentation recuperator
        // stroke the local sim would (state.js tryFire wiring) on the
        // shooter's first-party visual — flash and barrel throw share this
        // one event. Belt rounds resolve the shared rapid scale from the
        // fired shell exactly like the local path.
        let muzzlePos = [event.x, event.y, event.z];
        let shellSpec = null;
        let muzzleIndex = -1;
        if (shooter && shooter.visual && shooter.visual.recoilKick) {
          const shells = (shooter.spec && shooter.spec.gun && shooter.spec.gun.shells) || [];
          shellSpec = shells.find((s) => s.name === event.shellName)
            || shells.find((s) => s.type === event.shellType) || null;
          muzzleIndex = shooter.visual.recoilKick(
            0, shotRecoilScale(shooter.spec, shellSpec));
          // Twin-plant ids: the flash spawns at the firing barrel's tip
          // (the visual owns the alternation cursor here — the server's
          // center-bore ballistics stay authoritative for the shell).
          if (muzzleIndex != null && shooter.visual.gunMuzzleWorld) {
            shooter.visual.gunMuzzleWorld(_muzzleTip, muzzleIndex);
            muzzlePos = [_muzzleTip.x, _muzzleTip.y, _muzzleTip.z];
          }
        }
        bus.emit('shell:fired', {
          shellId: event.shellId,
          shooterId: event.shooterId,
          isPlayer: event.shooterId === id,
          shellType: event.shellType,
          shellName: event.shellName,
          weaponSound: event.weaponSound || shellSpec?.soundProfile
            || shooter?.spec?.gun?.soundProfile || null,
          muzzleIndex,
          caliberMm: event.caliberMm,
          velocityMps: event.velocityMps,
          timeS: event.timeS,
          muzzlePos,
          dir: [event.dx, event.dy, event.dz],
          shooterSpecId: shooter?.specId,
        });
    } else if (event.type === 'shell_hit') {
        bus.emit('shell:hit', {
          ...event,
          attackerId: event.attackerId || event.shooterId,
        });
    } else if (event.type === 'shell_impact') {
        bus.emit('shell:expired', {
          shellId: event.shellId,
          shooterId: event.shooterId,
          hitTerrain: event.kind === 'terrain',
          pos: [event.x, event.y, event.z],
        });
    } else if (event.type === 'tank_destroyed') {
        const entity = entities.get(event.id);
        bus.emit('tank:destroyed', {
          id: event.id,
          specId: entity && entity.specId,
          killerId: event.killerId,
          cause: event.cause === 'ammo_rack' ? 'ammorack' : event.cause,
          pos: entity ? [entity.state.pos.x, entity.state.pos.y, entity.state.pos.z] : null,
        });
    } else if (event.type === 'world_prop_destroyed') {
        const obstacle = worldCollision && typeof worldCollision.getObstacles === 'function'
          ? worldCollision.getObstacles()[event.obstacleIndex]
          : null;
        if (obstacle && !obstacle.crushed && typeof worldCollision.crushObstacle === 'function') {
          worldCollision.crushObstacle(
            obstacle,
            event.directionX,
            event.directionZ,
            event.speedMps,
          );
        }
        bus.emit('prop:crushed', {
          kind: event.kind,
          speedMps: event.speedMps,
          cause: event.cause,
          pos: obstacle ? [
            (obstacle.min[0] + obstacle.max[0]) * 0.5,
            obstacle.min[1],
            (obstacle.min[2] + obstacle.max[2]) * 0.5,
          ] : null,
          dir: [event.directionX, 0, event.directionZ],
        });
    } else if (event.type === 'consumable_used' && event.id === id) {
        bus.emit('ui:consumableUsed', {
          slot: event.slot,
          cooldownS: event.cooldownS,
          readyAt: event.readyAt,
        });
    } else if (event.type === 'consumable_denied' && event.id === id) {
        bus.emit('ui:consumableDenied', {
          slot: event.slot,
          reason: event.reason,
          remainingS: event.remainingS,
        });
    } else if (event.type === 'special_action' && event.id === id) {
        bus.emit('ui:specialActionResult', {
          kind: event.kind,
          active: !!event.active,
          reason: event.reason || null,
        });
    } else if (event.type === 'special_action_denied' && event.id === id) {
        bus.emit('ui:specialActionDenied', {
          kind: event.kind,
          reason: event.reason,
        });
    } else if (event.type === 'module_state') {
        bus.emit('module:state', {
          id: event.id,
          module: event.module,
          state: event.state,
          source: event.source,
        });
    } else if (event.type === 'tank_fire') {
        bus.emit('tank:fire', { id: event.id, burning: event.burning });
    } else if (event.type === 'tank_ram') {
        bus.emit('tank:ram', {
          aId: event.aId,
          bId: event.bId,
          dmgA: event.damageA,
          dmgB: event.damageB,
          closingMps: event.closingMps,
          aIsPlayer: event.aId === id,
          bIsPlayer: event.bId === id,
          pos: [event.x, event.y, event.z],
        });
    } else if (event.type === 'match_ended') {
        const result = spectator ? 'draw' : event.result === 'draw' ? 'draw'
          : event.result === viewerTeam ? 'victory' : 'defeat';
        game.result = result;
        game.resultReason = event.reason || 'elimination';
        bus.emit('battle:ended', {
          result,
          reason: game.resultReason,
          timeS: game.timeS,
          map: game.mapId,
          roster: resultRoster(),
        });
    }
  }

  const presentationEvents = new PresentationEventQueue({ emit: emitEvent });

  function resultRoster() {
    return [...entities.values()].map((entity) => ({
      id: entity.id,
      name: entity.displayName || entity.spec?.name || entity.specId,
      vehicle: entity.displayName || entity.spec?.name || entity.specId,
      specId: entity.specId,
      team: entity.team === 'enemy' ? 'enemy' : 'ally',
      alive: !entity.combat?.destroyed,
      isPlayer: !!entity.isPlayer,
    }));
  }

  function reconcileDestructibles(meta) {
    const revision = Number(meta?.destructibleRevision);
    if (!Number.isSafeInteger(revision) || revision < 0 ||
        revision <= appliedDestructibleRevision) return;
    const destroyed = meta?.destroyedObstacleIndices;
    if (!Array.isArray(destroyed) || !worldCollision ||
        typeof worldCollision.getObstacles !== 'function') {
      appliedDestructibleRevision = revision;
      return;
    }
    const obstacles = worldCollision.getObstacles();
    for (const rawIndex of destroyed) {
      const index = Number(rawIndex);
      if (!Number.isSafeInteger(index) || index < 0 || index >= obstacles.length) continue;
      const obstacle = obstacles[index];
      if (!obstacle || obstacle.crushed) continue;
      if (typeof worldCollision.crushObstacle === 'function') {
        worldCollision.crushObstacle(obstacle, 0, 1, 0);
      }
      obstacle.crushed = true;
    }
    appliedDestructibleRevision = revision;
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    legacyState = {
      tanks: game.tanks,
      tankById: game.tankById,
      player: game.player,
      shells: game.shells,
      spotting: game.spotting,
    };
    for (const entity of game.allTanks || []) {
      if (entity.visual) entity.visual.setVisible(false);
    }
    visibleRoster.length = 0;
    for (const entity of entities.values()) visibleRoster.push(entity);
    game.tanks = visibleRoster;
    game.tankById = entities;
    game.player = spectator ? null : entities.get(id) || null;
    game.shells = [];
    game.spotting = {
      isSpotted: (targetId) => !!entities.get(targetId)?.networkVisible,
      getConcealment: () => ({
        camo: 0, base: 0, paint: 0, equip: 0, bush: 0, bloom: 0,
        moving: false, fired: false, inBush: false, spotted: false,
      }),
    };
  }

  function apply(snapshot, dt = 1 / 60, reliableEvents = []) {
    if (!snapshot) return false;
    snapshotPhase = snapshot.meta?.phase || snapshotPhase;
    // Index destruction causes before state reconciliation so an ammo-rack
    // turret pop is staged once, with the correct variant, instead of first
    // creating a generic wreck and rebuilding it when the event arrives.
    for (const event of reliableEvents) {
      if (event?.type === 'tank_destroyed') destructionCause.set(event.id, event.cause);
    }
    for (const entity of entities.values()) entity.networkVisible = false;
    // Establish the viewer's team before classifying any other entity.
    const own = spectator ? null : snapshot.entities.find((entry) => entry.id === id);
    if (own) viewerTeam = own.team;
    for (const entry of snapshot.entities) updateEntity(
      ensureEntity(entry),
      entry,
      dt,
      entry.id === id ? snapshot.immediateAuthority : null,
    );
    for (const entity of entities.values()) {
      const referenceTeam = spectator ? perspectiveTeam : viewerTeam;
      entity.team = entity.networkTeam === referenceTeam ? 'player' : 'enemy';
      if (!entity.networkVisible) entity.visual.setVisible(false);
    }
    if (!mounted) mount();
    visibleRoster.length = 0;
    for (const entity of entities.values()) {
      if (entity.networkVisible || entity.combat.destroyed) visibleRoster.push(entity);
    }
    game.tanks = visibleRoster;
    game.tankById = entities;
    game.player = spectator ? null : entities.get(id) || null;
    game.timeS = snapshot.meta?.battleTimeMs != null
      ? snapshot.meta.battleTimeMs / 1000
      : snapshot.serverTimeMs / 1000;
    game.preBattleS = snapshot.meta?.countdownMs != null
      ? snapshot.meta.countdownMs / 1000
      : 0;
    updateShells(snapshot.shells);
    presentationEvents.enqueue(reliableEvents);
    presentationEvents.flush();
    reconcileDestructibles(snapshot.meta);

    // The verdict is persistent snapshot state. Reliable events preserve the
    // cinematic chronology, but reconnects/keyframes must still converge if
    // the original match_ended event predates this client.
    if (!game.result && snapshot.meta?.result &&
        !presentationEvents.hasType('match_ended')) {
      const authorityResult = snapshot.meta.result;
      game.result = spectator ? 'draw' : authorityResult === 'draw' ? 'draw'
        : authorityResult === viewerTeam ? 'victory' : 'defeat';
      game.resultReason = snapshot.meta.resultReason || 'elimination';
      bus.emit('battle:ended', {
        result: game.result,
        reason: game.resultReason,
        timeS: game.timeS,
        map: game.mapId,
        roster: resultRoster(),
      });
    }
    return true;
  }

  function endDisconnected() {
    if (game.result) return false;
    game.result = 'draw';
    game.resultReason = 'network_disconnect';
    bus.emit('battle:ended', {
      result: game.result,
      reason: game.resultReason,
      timeS: game.timeS,
      map: game.mapId,
      roster: resultRoster(),
    });
    return true;
  }

  function setPerspective(entityId) {
    if (!spectator) return false;
    const target = entities.get(String(entityId || ''));
    if (!target) return false;
    perspectiveTeam = target.networkTeam;
    for (const entity of entities.values()) {
      entity.team = entity.networkTeam === perspectiveTeam ? 'player' : 'enemy';
    }
    return true;
  }

  function recordInput(input, dt, inputSeq) {
    if (spectator || snapshotPhase !== 'playing') return false;
    const own = entities.get(id);
    return own?.predictor?.recordInput(input, dt, inputSeq) || false;
  }

  function getPredictionStats() {
    return entities.get(id)?.predictor?.getStats() || null;
  }

  function unmount() {
    if (!mounted || !legacyState) return;
    game.tanks = legacyState.tanks;
    game.tankById = legacyState.tankById;
    game.player = legacyState.player;
    game.shells = legacyState.shells;
    game.spotting = legacyState.spotting;
    for (const entity of game.allTanks || []) {
      if (entity.visual) entity.visual.setVisible(true);
    }
    mounted = false;
    legacyState = null;
  }

  function dispose() {
    unmount();
    for (const entity of entities.values()) entity.visual.dispose();
    entities.clear();
    roster.length = 0;
    visibleRoster.length = 0;
    liveShells.length = 0;
    shellById.clear();
    destructionCause.clear();
    presentationEvents.clear();
  }

  return {
    entities,
    roster,
    prepareRoster,
    mount,
    apply,
    endDisconnected,
    recordInput,
    getPredictionStats,
    getPresentationEventStats: () => ({
      ...presentationEvents.getStats(),
      visualDestroyCount,
      visualDestroyTotalMs: Math.round(visualDestroyTotalMs * 10) / 10,
      visualDestroyMaxMs: Math.round(visualDestroyMaxMs * 10) / 10,
    }),
    setPerspective,
    unmount,
    dispose,
  };
}
