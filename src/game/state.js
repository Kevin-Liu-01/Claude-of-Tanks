/**
 * state.js — integration-owned game state: the event bus, the tank roster,
 * battle setup, and the fixed-step combat simulation (ARCHITECTURE.md §1.5,
 * §2.4, §4 step 2). No rendering here; the render loop lives in main.js.
 */
import * as THREE from 'three';
import { getSpec, TANK_IDS } from '../vehicles/specs.js';
import { createTank } from '../vehicles/tankFactory.js';
import {
  createTankState, updateTank, fireRecoil, computeDispersionRadM, SIM_DT,
} from '../sim/movement.js';
import {
  createShell, stepShell, applyDispersion, aimElevationRad,
} from '../sim/ballistics.js';
import { tankPoseFromState, traceTank } from '../sim/armor.js';
import {
  createCombatState, resolveShellHit, resolveHeBurst, tickFire, startReload,
} from '../sim/damage.js';
import { createAI } from './ai.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const COMBAT_SEED = 6000;
const MODULE_REPAIR_S = 10;
const FIRE_TICK_S = 0.5;

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
    tanks: [],                  // TankEntity[] (all 8, player included)
    tankById: new Map(),
    player: null,
    shells: [],
    nextShellId: 1,
    timeS: 0,
    fireTickAcc: 0,
    combatRng: mulberry32(COMBAT_SEED),
    result: null,               // null | 'victory' | 'defeat'
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
  TANK_IDS.forEach((specId, i) => {
    const spec = getSpec(specId);
    const visual = createTank(specId, engineCtx, { camoSeed: 4000 + i, quality: 'high' });
    engineCtx.scene.add(visual.root);
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
      visual,
      ai: null,
      aiCtl: null,
      _destroyedAnnounced: false,
    };
    game.tanks.push(ent);
    game.tankById.set(ent.id, ent);
  });
}

/**
 * (Re)start a battle: place the chosen tank at the player spawn, the other
 * seven at the enemy spawns, reset movement/combat state and attach AI.
 * @param {object} game game state
 * @param {string} playerSpecId chosen TankId
 * @param {object} world World (§2.7)
 * @returns {void}
 */
export function setupBattle(game, playerSpecId, world) {
  const sp = world.spawnPoints;
  game.shells.length = 0;
  game.nextShellId = 1;
  game.timeS = 0;
  game.fireTickAcc = 0;
  game.combatRng = mulberry32(COMBAT_SEED);
  game.result = null;

  const aiDeps = {
    heightField: world.heightField,
    raycast: world.raycast,
    getObstacles: () => world.getObstacles(),
  };

  let enemyIdx = 0;
  game.tanks.forEach((ent, i) => {
    const isPlayer = ent.specId === playerSpecId;
    const spawn = isPlayer ? sp.player : sp.enemies[enemyIdx++];
    _spawnPos.set(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
    ent.team = isPlayer ? 'player' : 'enemy';
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
    ent.ai = null;
    if (isPlayer) {
      game.player = ent;
      ent.aiCtl = null;
    } else {
      ent.aiCtl = createAI(ent, {
        difficulty: 'normal',
        rng: mulberry32(7000 + i),
        deps: {
          ...aiDeps,
          getEnemies: () => (game.player && !game.player.combat.destroyed ? [game.player] : []),
        },
      });
      // Open aggressively: advance via a mid-map staging point to a standoff
      // ring around the player spawn, so contact happens inside the first
      // minute instead of enemies idling on local patrol loops at their spawn.
      const pp = sp.player.pos;
      const dx = pp[0] - spawn.pos[0];
      const dz = pp[2] - spawn.pos[2];
      const d = Math.hypot(dx, dz) || 1;
      const standoff = Math.min(d, 170 + (enemyIdx % 3) * 35);
      ent.aiCtl.setWaypoints([
        [spawn.pos[0] + dx * 0.5, spawn.pos[2] + dz * 0.5],
        [pp[0] - (dx / d) * standoff, pp[2] - (dz / d) * standoff],
      ]);
    }
    ent.visual.syncFromState(ent.state);
    ent.visual.setVisible(true);
  });
}

// ---------------------------------------------------------------------------
// Fixed-step simulation
// ---------------------------------------------------------------------------

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
  bus.emit('shell:hit', ev);
  const target = ev.targetId ? game.tankById.get(ev.targetId) : null;
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
}

function announceDestroyed(game, bus, ent, killerId, cause) {
  ent._destroyedAnnounced = true;
  ent.visual.setDestroyed();
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
  ent.visual.gunMuzzleWorld(_muzzle);
  ent.visual.gunPivotWorld(_pivot);
  _dir.copy(_muzzle).sub(_pivot).normalize();

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

  const shell = createShell(shellSpec, ent.id, ent.isPlayer, _muzzle, _dir, game.nextShellId++);
  game.shells.push(shell);
  fireRecoil(ent.state, ent.spec);
  ent.visual.recoilKick();
  if (ent.isPlayer && rig) {
    rig.addTrauma(0.25);
    if (rig.recoilKick) rig.recoilKick(0.012);
  }
  bus.emit('shell:fired', {
    shellId: shell.id,
    shooterId: ent.id,
    isPlayer: ent.isPlayer,
    shellType: shellSpec.type,
    caliberMm: shellSpec.caliberMm,
    muzzlePos: [_muzzle.x, _muzzle.y, _muzzle.z],
    dir: [_dir.x, _dir.y, _dir.z],
  });
  startReload(c, ent.spec);
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
      if (!ent.state || !ent.combat || ent.combat.destroyed) continue;
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
      if (shell.spec.type === 'HE') {
        const burst = bestHits[0].point;
        const events = resolveHeBurst(shell, burst, game.tanks, bestEnt, bestHits, game.combatRng);
        for (const ev of events) emitHitOutcome(game, bus, ev);
      } else {
        const ev = resolveShellHit(shell, bestEnt, bestHits, game.combatRng);
        emitHitOutcome(game, bus, ev);
      }
    } else if (worldHit) {
      if (shell.spec.type === 'HE') {
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
  // compact
  for (let i = shells.length - 1; i >= 0; i--) {
    if (shells[i].dead) shells.splice(i, 1);
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

  // a. AI writes inputs
  for (const ent of game.tanks) {
    if (ent.aiCtl && !ent.combat.destroyed) ent.aiCtl.update(dt, game.timeS);
  }

  // b. movement
  for (const ent of game.tanks) {
    if (!ent.state || ent.combat.destroyed) continue;
    collider.setSelf(ent);
    updateTank(ent, world.heightField, dt, collider.collide);
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

  // win/lose
  if (game.result === null && game.player) {
    if (game.player.combat.destroyed) game.result = 'defeat';
    else {
      let enemiesLeft = 0;
      for (const ent of game.tanks) {
        if (!ent.isPlayer && ent.combat && !ent.combat.destroyed) enemiesLeft++;
      }
      if (enemiesLeft === 0) game.result = 'victory';
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
