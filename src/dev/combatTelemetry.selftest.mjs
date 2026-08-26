import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createCombatTelemetry } from './combatTelemetry.ts';

function createBus() {
  const listeners = new Map();
  return {
    listeners,
    on(event, listener) {
      const group = listeners.get(event) || [];
      group.push(listener);
      listeners.set(event, group);
    },
    emit(event, payload) {
      for (const listener of listeners.get(event) || []) listener(payload);
    },
  };
}

const disabledBus = createBus();
const disabled = createCombatTelemetry({
  enabled: false,
  bus: disabledBus,
  getGame: () => null,
  getPinnedTargetId: () => null,
  getAimBlockedDistance: () => null,
});
assert.equal(disabledBus.listeners.size, 0, 'ordinary production installs no QA shell listeners');
assert.deepEqual(disabled.playerShellLog, []);

const player = {
  id: 'player',
  isPlayer: true,
  team: 'player',
  state: { pos: new Vector3(0, 0, 0), speed: 0 },
  combat: { destroyed: false },
  spec: { dims: { heightM: 2 } },
};
const enemy = {
  id: 'enemy',
  team: 'enemy',
  state: { pos: new Vector3(0, 0, 100), speed: 5.25 },
  combat: { destroyed: false },
  spec: { dims: { heightM: 2 } },
};
const game = {
  timeS: 12.345,
  player,
  tanks: [player, enemy],
  tankById: new Map([[player.id, player], [enemy.id, enemy]]),
};
const bus = createBus();
const telemetry = createCombatTelemetry({
  enabled: true,
  bus,
  getGame: () => game,
  getPinnedTargetId: () => enemy.id,
  getAimBlockedDistance: () => 37.6,
});

bus.emit('shell:fired', {
  isPlayer: true,
  shellId: 1,
  muzzlePos: [0, 1, 0],
  dir: [0, 0, 1],
});
assert.equal(telemetry.playerShellLog.length, 1);
assert.deepEqual(telemetry.playerShellLog[0], {
  shellId: 1,
  t: 12.35,
  targetId: 'enemy',
  targetDistM: 100,
  targetSpeed: 5.3,
  blockedDistM: 38,
  terminal: null,
  hitKind: null,
  damage: 0,
  missM: null,
});
bus.emit('shell:hit', {
  shellId: 1,
  attackerId: player.id,
  targetId: enemy.id,
  kind: 'pen',
  damage: 421.8,
  pos: [0, 1, 100],
});
assert.equal(telemetry.playerShellLog[0].terminal, 'tank');
assert.equal(telemetry.playerShellLog[0].damage, 422);
assert.equal(telemetry.playerShellLog[0].missM, 0);

bus.emit('shell:fired', {
  isPlayer: false,
  shellId: 2,
  muzzlePos: [0, 1, 100],
  dir: [0, 0, -1],
});
assert.equal(telemetry.botPressure.enemyShells, 1);
assert.equal(telemetry.botPressure.aimedAtPlayer, 1);
bus.emit('shell:hit', { targetId: player.id, attackerId: enemy.id, damage: 55 });
assert.equal(telemetry.botPressure.hitsOnPlayer, 1);
assert.equal(telemetry.botPressure.dmgOnPlayer, 55);
bus.emit('phase:change', { phase: 'battle' });
assert.deepEqual(telemetry.botPressure, {
  enemyShells: 0,
  aimedAtPlayer: 0,
  hitsOnPlayer: 0,
  dmgOnPlayer: 0,
});

console.log('combatTelemetry.selftest: production gate and attributable QA receipts passed');
