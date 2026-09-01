import assert from 'node:assert/strict';
import { createPlayerBattleActions } from './playerBattleActions.ts';
import { createBus } from './stateCore.ts';

function createInput() {
  const handlers = new Map();
  return {
    onAction(action, listener) {
      let group = handlers.get(action);
      if (!group) handlers.set(action, group = new Set());
      group.add(listener);
      return () => group.delete(listener);
    },
    press(action) {
      for (const listener of handlers.get(action) || []) listener();
    },
  };
}

const events = [];
const bus = createBus((event, payload) => events.push({ event, payload }));
const input = createInput();
const localCalls = [];
const networkCalls = [];
let settingsOpen = false;
let networkActive = false;
const spec = {
  gun: {
    shells: [
      { name: 'Sabot', type: 'APFSDS', dmg: 500, pen100Mm: 640 },
      { name: 'Burst', type: 'HE', dmg: 720, pen100Mm: 68, count: 3 },
      { name: 'Novel', type: 'HESH', dmg: 610, pen100Mm: 145 },
    ],
  },
};
const player = {
  id: 'player-1',
  spec,
  combat: {
    destroyed: false,
    shellSlot: 0,
    ammo: [24, 3, 20],
    ammoCapacity: [24, 3, 20],
    magazine: null,
    crew: { commander: true, driver: true },
    fire: { burning: false, ticksLeft: 0, tickTimer: 0 },
  },
  input: { shellSlot: 0 },
  specialAction: null,
};
const game = { phase: 'garage', timeS: 10, player };
const rules = {
  selectShell(combat, slot) {
    localCalls.push(`shell:${slot}`);
    combat.shellSlot = slot;
  },
  repairAllModules(combat) {
    if (!combat.damagedModule) return [];
    const repaired = combat.damagedModule;
    combat.damagedModule = null;
    return [repaired];
  },
  magazineReloadDenialReason(combat) { return combat.magazineReason || null; },
  startMagazineReload() { localCalls.push('reload'); return true; },
  activateSpecialAction(entity) {
    localCalls.push('special');
    if (entity.spec.guidedAction) {
      const action = entity.specialAction;
      if (entity.combat.shellSlot === action.missileSlot) {
        entity.combat.shellSlot = action.previousShellSlot;
        entity.input.shellSlot = action.previousShellSlot;
        return {
          ok: true, kind: 'guided_missile', active: false, slot: action.previousShellSlot,
        };
      }
      action.previousShellSlot = entity.combat.shellSlot;
      entity.combat.shellSlot = action.missileSlot;
      entity.input.shellSlot = action.missileSlot;
      return { ok: true, kind: 'guided_missile', active: true, slot: action.missileSlot };
    }
    return { ok: true, action: 'siege' };
  },
  guidedMissileSlot() { return 1; },
  specialActionKind(actionSpec) {
    return actionSpec.guidedAction ? 'guided_missile' : 'none';
  },
  hasAmmunition(combat, slot) { return (combat.ammo[slot] || 0) > 0; },
  shellAmmunitionCapacity(shell) {
    if (shell.count != null) return shell.count;
    return ({ APFSDS: 24, HE: 12 }[shell.type] ?? 20);
  },
  hasConsumableRule(slot) { return slot >= 0 && slot < 3; },
  cooldownRemaining(timeS, readyAtS) { return Math.max(0, readyAtS - timeS); },
  resetConsumableCooldowns(readyAt) { readyAt.fill(0); },
  startConsumableCooldown(readyAt, slot, timeS) {
    readyAt[slot] = timeS + 35;
    return { durationS: 35, readyAtS: readyAt[slot] };
  },
};

const actions = createPlayerBattleActions({
  game,
  bus,
  input,
  rules,
  isSettingsOpen: () => settingsOpen,
  network: {
    isActive: () => networkActive,
    queueConsumable: (slot) => networkCalls.push(`consumable:${slot}`),
    queueAction: (action) => networkCalls.push(action),
  },
});

assert.deepEqual(actions.setTank(spec), [
  { name: 'Sabot', type: 'APFSDS', dmg: 500, penLabel: '640 mm', count: 24 },
  { name: 'Burst', type: 'HE', dmg: 720, penLabel: '68 mm', count: 3 },
  { name: 'Novel', type: 'HESH', dmg: 610, penLabel: '145 mm', count: 20 },
]);
assert.equal(actions.hasAmmo(0), true);
input.press('shell2');
assert.deepEqual(localCalls, [], 'garage action edges are inert');

game.phase = 'battle';
input.press('shell2');
assert.deepEqual(localCalls, ['shell:1']);
assert.equal(player.input.shellSlot, 1);
for (let shot = 0; shot < 4; shot++) {
  player.combat.ammo[1] = Math.max(0, player.combat.ammo[1] - 1);
  bus.emit('shell:fired', { isPlayer: true });
}
assert.equal(actions.shellCards[1].count, 0, 'ammo reaches zero but never becomes negative');
assert.equal(actions.hasAmmo(1), false);

player.combat.magazine = { capacity: 3 };
input.press('shell2');
assert.equal(localCalls.at(-1), 'reload', 'selecting the live magazine slot reloads');
assert.ok(events.some(({ event }) => event === 'ui:magazineReloadStarted'));
player.combat.magazineReason = 'MAGAZINE_RELOADING';
input.press('reloadMagazine');
assert.ok(events.some(({ event, payload }) =>
  event === 'ui:magazineReloadDenied' && payload.reason === 'MAGAZINE_RELOADING'));
player.combat.magazineReason = null;
player.combat.magazine = null;

input.press('shell1');
assert.equal(player.combat.shellSlot, 0, 'numbered ammunition remains selectable after ATGM use');

player.combat.damagedModule = 'engine';
input.press('consumable1');
assert.equal(player.combat.damagedModule, null);
assert(events.some(({ event, payload }) =>
  event === 'module:state' && payload.module === 'engine' && payload.state === 'ok'));
input.press('consumable1');
assert(events.some(({ event, payload }) =>
  event === 'ui:consumableDenied' && payload.reason === 'COOLDOWN'));

player.combat.crew.driver = false;
input.press('consumable2');
assert.equal(player.combat.crew.driver, true);
player.combat.fire = { burning: true, ticksLeft: 4, tickTimer: 0.2 };
input.press('consumable3');
assert.deepEqual(player.combat.fire, { burning: false, ticksLeft: 0, tickTimer: 0 });

input.press('specialAction');
assert.equal(localCalls.at(-1), 'special');
assert(events.some(({ event, payload }) =>
  event === 'ui:specialActionResult' && payload.action === 'siege'));

networkActive = true;
player.combat.damagedModule = 'trackL';
bus.emit('ui:consumable', { slot: 0 });
bus.emit('ui:magazineReload', {});
bus.emit('ui:specialAction', {});
assert.deepEqual(networkCalls, ['consumable:0', 'reloadMagazine', 'specialAction']);
assert.equal(player.combat.damagedModule, 'trackL', 'network authority owns state mutation');

spec.guidedAction = true;
spec.gun.shells[1].guided = true;
assert.equal(actions.setTank(spec)[1].type, 'ATGM',
  'guided ammunition is presented as an ATGM instead of its HEAT warhead class');
player.specialAction = {
  kind: 'guided_missile', missileSlot: 1, previousShellSlot: 0, active: false,
};
bus.emit('ui:specialAction', {});
assert.equal(player.input.shellSlot, 1,
  'E selects the guided ammunition through the ordinary shell-slot state');
assert.deepEqual(networkCalls, ['consumable:0', 'reloadMagazine', 'specialAction'],
  'guided E does not enqueue a separate network action mode');
assert(events.some(({ event, payload }) =>
  event === 'ui:specialActionResult' && payload.kind === 'guided_missile' &&
    payload.slot === 1 && payload.active === true));
bus.emit('ui:specialAction', {});
assert.equal(player.input.shellSlot, 0,
  'repeating E restores the previously selected conventional ammunition');
assert(events.some(({ event, payload }) =>
  event === 'ui:specialActionResult' && payload.kind === 'guided_missile' &&
    payload.slot === 0 && payload.active === false));

input.press('shell3');
assert.equal(player.input.shellSlot, 2);
input.press('shell2');
assert.equal(player.input.shellSlot, 1, 'key 2 directly selects the ATGM');
assert.equal(player.specialAction.previousShellSlot, 2,
  'direct ATGM selection remembers the conventional shell it replaced');
input.press('specialAction');
assert.equal(player.input.shellSlot, 2,
  'E deselects a key-2-selected ATGM and restores that remembered shell');
spec.guidedAction = false;
spec.gun.shells[1].guided = false;

settingsOpen = true;
input.press('reloadMagazine');
assert.deepEqual(networkCalls, ['consumable:0', 'reloadMagazine', 'specialAction']);
settingsOpen = false;
actions.resetConsumables();
networkActive = false;
player.combat.damagedModule = 'trackL';
input.press('consumable1');
assert.equal(player.combat.damagedModule, null, 'round reset clears local cooldowns');

actions.dispose();
const eventCount = events.length;
input.press('shell1');
bus.emit('ui:specialAction', {});
assert.equal(events.length, eventCount + 1, 'disposed owner contributes no new routed events');

console.log('playerBattleActions.selftest: ammo, cooldowns, local rules, and network routing passed');
