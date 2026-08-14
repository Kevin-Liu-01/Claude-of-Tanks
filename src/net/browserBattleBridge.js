import { Vector3 } from 'three';
import { createCombatState } from '../sim/damage.js';
import { createTankState } from '../sim/movement.js';
import { getSpec } from '../vehicles/specs.js';
import { createTank } from '../vehicles/tankFactory.js';
import { SNAPSHOT_FLAGS } from './snapshot.js';

const POS_SCALE = 100;
const VEL_SCALE = 100;

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
} = {}) {
  if (!engineCtx || !engineCtx.scene || !game) throw new TypeError('engineCtx and game are required');
  const id = String(viewerId || '');
  if (!id) throw new TypeError('viewerId is required');
  const entities = new Map();
  const roster = [];
  const shellById = new Map();
  let viewerTeam = null;
  let perspectiveTeam = null;
  let lastTick = -1;
  let mounted = false;
  let legacyState = null;
  const destructionCause = new Map();

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
    const visual = createTank(spec.id, engineCtx, {
      camoSeed: 4000 + (hashString(snapshot.id) % 100000),
      quality: snapshot.id === id ? 'high' : 'ai',
    });
    engineCtx.scene.add(visual.root);
    visual.setVisible(false);
    entity = {
      id: snapshot.id,
      specId: spec.id,
      spec,
      displayName: snapshot.name || null,
      networkTeam: snapshot.team,
      team: 'enemy',
      isPlayer: !spectator && snapshot.id === id,
      state,
      combat,
      input: {
        throttle: 0,
        steer: 0,
        brake: false,
        fire: false,
        shellSlot: 0,
        aimPoint: state.aimPoint.clone(),
      },
      visual,
      networkVisible: false,
      _networkDestroyed: false,
      _lastX: snapshot.x,
      _lastZ: snapshot.z,
    };
    entities.set(entity.id, entity);
    roster.push(entity);
    return entity;
  }

  async function prepareRoster(players, onProgress = null) {
    const active = (players || []).filter((player) => player.team !== 'spectator');
    for (let index = 0; index < active.length; index++) {
      const player = active[index];
      ensureEntity({
        id: player.id,
        name: player.name,
        specId: player.specId,
        team: player.team,
        x: 0, y: 0, z: 0, yaw: 0,
      });
      if (onProgress) onProgress((index + 1) / Math.max(1, active.length), player.specId);
      await nextFrame();
    }
  }

  function updateEntity(entity, snapshot, dt) {
    entity.networkTeam = snapshot.team;
    if (!spectator && entity.id === id) viewerTeam = snapshot.team;
    const referenceTeam = spectator ? perspectiveTeam : viewerTeam;
    entity.team = snapshot.team === referenceTeam ? 'player' : 'enemy';
    entity.isPlayer = !spectator && entity.id === id;
    entity.networkVisible = true;
    const state = entity.state;
    const dx = snapshot.x - entity._lastX;
    const dz = snapshot.z - entity._lastZ;
    const forwardDistance = dx * Math.sin(snapshot.yaw) + dz * Math.cos(snapshot.yaw);
    state.trackScroll.l += forwardDistance;
    state.trackScroll.r += forwardDistance;
    entity._lastX = snapshot.x;
    entity._lastZ = snapshot.z;
    state.pos.set(snapshot.x, snapshot.y, snapshot.z);
    state.yaw = snapshot.yaw;
    state.visualPitch = snapshot.pitch;
    state.visualRoll = snapshot.roll;
    state.turretYaw = snapshot.turretYaw;
    state.gunPitch = snapshot.gunPitch;
    const speed = Math.hypot(snapshot.vx, snapshot.vz);
    const direction = snapshot.vx * Math.sin(snapshot.yaw) + snapshot.vz * Math.cos(snapshot.yaw);
    state.speed = direction < 0 ? -speed : speed;
    const combat = entity.combat;
    combat.hp = snapshot.hp;
    combat.maxHp = snapshot.maxHp;
    combat.reload.t = snapshot.reloadS;
    combat.reload.totalS = Math.max(combat.reload.totalS, snapshot.reloadS);
    combat.shellSlot = snapshot.shellSlot;
    combat.fire.burning = !!(snapshot.flags & SNAPSHOT_FLAGS.BURNING);
    const destroyed = !!(snapshot.flags & SNAPSHOT_FLAGS.DESTROYED);
    combat.destroyed = destroyed;
    entity.input.fire = !!(snapshot.flags & SNAPSHOT_FLAGS.FIRING);
    entity.input.shellSlot = snapshot.shellSlot;
    if (destroyed && !entity._networkDestroyed) visualDestroy(entity);
    else if (!destroyed && entity._networkDestroyed) {
      if (entity.visual.resetDestroyed) entity.visual.resetDestroyed();
      entity._networkDestroyed = false;
    }
    entity.visual.setVisible(true);
    entity.visual.syncFromState(state, dt);
  }

  function visualDestroy(entity) {
    entity._networkDestroyed = true;
    if (entity.visual.setDestroyed) {
      entity.visual.setDestroyed({ pop: destructionCause.get(entity.id) === 'ammo_rack' });
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
          spec: { type: raw.type },
          dead: false,
          ageS: 0,
        };
        shellById.set(shellId, shell);
      }
      shell.prevPos.copy(shell.pos);
      shell.pos.set(raw.x / POS_SCALE, raw.y / POS_SCALE, raw.z / POS_SCALE);
      if (shell.prevPos.lengthSq() === 0) shell.prevPos.copy(shell.pos);
      shell.vel.set(raw.vx / VEL_SCALE, raw.vy / VEL_SCALE, raw.vz / VEL_SCALE);
      shell.ageS = Math.max(0, game.timeS - (shell.spawnedAtS || game.timeS));
      if (shell.spawnedAtS == null) shell.spawnedAtS = game.timeS;
    }
    for (const [shellId, shell] of shellById) {
      if (!live.has(shellId)) { shell.dead = true; shellById.delete(shellId); }
    }
    game.shells = [...shellById.values()];
  }

  function emitEvents(events) {
    if (!bus || typeof bus.emit !== 'function') return;
    for (const event of events || []) {
      if (event.type === 'shell_fired') {
        const shooter = entities.get(event.shooterId);
        bus.emit('shell:fired', {
          shellId: event.shellId,
          shooterId: event.shooterId,
          isPlayer: event.shooterId === id,
          shellType: event.shellType,
          shellName: event.shellName,
          caliberMm: event.caliberMm,
          velocityMps: event.velocityMps,
          timeS: event.timeS,
          muzzlePos: [event.x, event.y, event.z],
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
        destructionCause.set(event.id, event.cause);
        if (entity && entity._networkDestroyed && entity.visual.setDestroyed) {
          entity.visual.setDestroyed({ pop: event.cause === 'ammo_rack' });
        }
        bus.emit('tank:destroyed', {
          id: event.id,
          specId: entity && entity.specId,
          killerId: event.killerId,
          cause: event.cause,
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
        bus.emit('battle:ended', { result, timeS: game.timeS, map: game.mapId, roster: [] });
      }
    }
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
    game.tanks = [...entities.values()];
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

  function apply(snapshot, dt = 1 / 60) {
    if (!snapshot) return false;
    for (const entity of entities.values()) entity.networkVisible = false;
    // Establish the viewer's team before classifying any other entity.
    const own = spectator ? null : snapshot.entities.find((entry) => entry.id === id);
    if (own) viewerTeam = own.team;
    for (const entry of snapshot.entities) updateEntity(ensureEntity(entry), entry, dt);
    for (const entity of entities.values()) {
      const referenceTeam = spectator ? perspectiveTeam : viewerTeam;
      entity.team = entity.networkTeam === referenceTeam ? 'player' : 'enemy';
      if (!entity.networkVisible) entity.visual.setVisible(false);
    }
    if (!mounted) mount();
    game.tanks = [...entities.values()].filter((entity) => entity.networkVisible || entity.combat.destroyed);
    game.tankById = entities;
    game.player = spectator ? null : entities.get(id) || null;
    game.timeS = snapshot.meta?.battleTimeMs != null
      ? snapshot.meta.battleTimeMs / 1000
      : snapshot.serverTimeMs / 1000;
    game.preBattleS = snapshot.meta?.countdownMs != null
      ? snapshot.meta.countdownMs / 1000
      : 0;
    updateShells(snapshot.shells);
    if (snapshot.tick > lastTick) {
      lastTick = snapshot.tick;
      emitEvents(snapshot.events);
    }
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
    shellById.clear();
    destructionCause.clear();
  }

  return {
    entities,
    roster,
    prepareRoster,
    mount,
    apply,
    setPerspective,
    unmount,
    dispose,
  };
}
