// 2026-11-02 audit F8: the Q key's ATGM toggle (the guided round, then back to the cannon round it left) was decided
// inside the HUD's tile (hud.ts toggleExtraMissile, from a slot latch kept in presentation state): Q did nothing until
// the HUD chunk loaded. It is decided here, with the other battle keys, from the game's own state; the HUD's tile asks
// through the same ui:atgmToggle request.
import assert from 'node:assert/strict';
import { createPlayerBattleActions } from './playerBattleActions.ts';
import { createBus } from './stateCore.ts';

const handlers = new Map();
const input = {
  onAction(action, listener) {
    if (!handlers.has(action)) handlers.set(action, new Set());
    handlers.get(action).add(listener);
    return () => handlers.get(action).delete(listener);
  },
  press(action) { for (const listener of handlers.get(action) || []) listener('KeyQ'); },
};
const events = [];
const bus = createBus((event, payload) => events.push({ event, payload }));
const spec = {
  gun: {
    shells: [
      { name: 'Sabot', type: 'APFSDS', dmg: 500, pen100Mm: 640 },
      { name: 'Heat', type: 'HEAT', dmg: 600, pen100Mm: 480 },
      { name: 'Missile', type: 'ATGM', dmg: 700, pen100Mm: 800, guided: true },
    ],
  },
};
const player = {
  id: 'player', spec, state: { overturned: false, grounded: true, _body: { tumbling: false, autoRighting: false } },
  combat: {
    destroyed: false, shellSlot: 0, ammo: [20, 10, 4], ammoCapacity: [20, 10, 4], magazine: null,
    crew: { commander: true }, fire: { burning: false, ticksLeft: 0, tickTimer: 0 },
  },
  input: { shellSlot: 0 }, specialAction: null,
};
const game = { phase: 'battle', timeS: 10, player };
const rules = {
  selectShell(combat, slot) { if ((combat.ammo[slot] || 0) <= 0) return false; combat.shellSlot = slot; return true; },
  repairAllModules: () => [], magazineReloadDenialReason: () => null, startMagazineReload: () => false,
  activateSpecialAction: () => ({ ok: false }), specialActionKind: () => 'none',
  guidedMissileSlot: (s) => s.gun.shells.findIndex((shell) => shell.guided),
  hasAmmunition: (combat, slot) => (combat.ammo[slot] || 0) > 0,
  shellAmmunitionCapacity: () => 20, rulesetUnlimitedFor: () => false, hasConsumableRule: () => true,
  useSoloConsumable: () => ({ ok: false }), requestTankSelfRight: () => false, requestTankJump: () => false,
};
createPlayerBattleActions({
  game, bus, input, rules, isSettingsOpen: () => false,
  network: { isActive: () => false, queueConsumable() {}, queueAction() {} },
});

// no HUD on this bus: Q alone toggles
input.press('atgm');
assert.equal(player.combat.shellSlot, 2, 'Q selects the guided round with no HUD loaded');
input.press('atgm');
assert.equal(player.combat.shellSlot, 0, 'Q again returns to the cannon round it left');
// the round it left is the one the player was on, by any key
input.press('shell2');
assert.equal(player.combat.shellSlot, 1);
input.press('shell3'); // the missile by its digit
assert.equal(player.combat.shellSlot, 2);
input.press('atgm');
assert.equal(player.combat.shellSlot, 1, 'Q returns to the HEAT round the digit left');
// the HUD's tile asks through the same request
bus.emit('ui:atgmToggle', {});
assert.equal(player.combat.shellSlot, 2, 'the tile toggles as the key does');
bus.emit('ui:atgmToggle', {});
assert.equal(player.combat.shellSlot, 1);
// an empty launcher: nothing happens (the tile is struck and disabled), as before
player.combat.ammo[2] = 0;
const before = events.length;
input.press('atgm');
assert.equal(player.combat.shellSlot, 1);
assert.equal(events.slice(before).some(({ event }) => event === 'ui:ammoSelectionDenied'), false, 'no denial alert for a struck tile');
// a wreck or the Garage: inert
player.combat.ammo[2] = 4;
game.phase = 'garage';
input.press('atgm');
assert.equal(player.combat.shellSlot, 1, 'the Garage ignores Q');

console.log('atgmToggle.selftest: Q and the HUD tile toggle the guided round and back from the game state, with no HUD loaded');
