// 2026-11-02 audit F8: the Q key's ATGM toggle (the guided round, then back to the cannon round it left) was decided
// inside the HUD's tile (hud.ts toggleExtraMissile, from a slot latch kept in presentation state): Q did nothing until
// the HUD chunk loaded. It is decided here, with the other battle keys, from the game's own state; the HUD's tile asks
// through the same ui:atgmToggle request.
import assert from 'node:assert/strict';
import { createPlayerBattleActions } from './playerBattleActions.ts';
import { createBus } from './stateCore.ts';
import { selectShell } from '../sim/damage.ts';
import { activateSpecialAction, guidedMissileSlot, specialActionKind } from '../sim/specialActions.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { hasAmmunition } from '../sim/ammunition.ts';
import { AIR_STRIKE_KINDS } from '../sim/matchRuleset.ts';
import { AIR_STRIKE_BITS } from '../sim/playerActions.ts';

// (round 8 Y11) 270's Air Support port, as main.ts passes it
const strikes = { kinds: AIR_STRIKE_KINDS, bit: (kind) => AIR_STRIKE_BITS[kind] };

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
  network: { isActive: () => false, queueConsumable() {}, queueAction() {} }, strikes,
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

// (reviewer, 2026-11-03) a network client: every snapshot row rewrites combat.shellSlot with the authority's slot, which
// lags the player's pick by a round trip, while input.shellSlot keeps the pick until the authority itself moves
// (mp/presentation/battlePresentation.ts). The toggle and its return slot read the pick, as the HUD's tile did.
game.phase = 'battle';
const row = (authoritySlot) => { player.combat.shellSlot = authoritySlot; };
input.press('shell1');
row(0);
assert.equal(player.input.shellSlot, 0);
input.press('atgm');
assert.equal(player.input.shellSlot, 2, 'Q picks the guided round on a client');
row(0); // the authority has not seen the pick yet
input.press('atgm');
assert.equal(player.input.shellSlot, 0, 'a second Q within one round trip toggles back, not onto the missile again');
row(0);
input.press('shell2');
row(0); // the HEAT pick is still on its way
input.press('atgm');
assert.equal(player.input.shellSlot, 2);
row(0);
input.press('atgm');
assert.equal(player.input.shellSlot, 1, 'Q returns to the round the digit picked, not the lagging row\'s cannon round');

// (U23, round 2; round 3 B9: driven, not mirrored) the pad's LB enters the missile through the sim's guided-missile action:
// the pad's press (a 'Pad' key code) raises ui:specialAction {pad:true}, whose handler asks the production rules
// (sim/specialActions.ts activateSpecialAction -> activateGuidedMissile, which selects the missile itself and remembers
// the round it left as previousShellSlot; no ui:shellSelect). Q then returns to that round, never to the last round a
// digit left. Every rule here is the one main.ts wires (game/battleClientRuntime.ts), on the sim's own action state.
{
  const padInput = {
    handlers: new Map(),
    onAction(action, listener) {
      if (!this.handlers.has(action)) this.handlers.set(action, new Set());
      this.handlers.get(action).add(listener);
      return () => this.handlers.get(action).delete(listener);
    },
    press(action, code) { for (const listener of this.handlers.get(action) || []) listener(code); },
  };
  const padBus = createBus();
  const padSpec = { gun: { shells: spec.gun.shells.map((shell) => ({ ...shell })) } };
  const tank = {
    id: 'pad', spec: padSpec, state: { overturned: false, grounded: true, _body: { tumbling: false, autoRighting: false } },
    combat: { ...player.combat, destroyed: false, shellSlot: 0, ammo: [20, 10, 4], ammoCapacity: [20, 10, 4] },
    input: { shellSlot: 0 }, specialAction: createSpecialActionState(padSpec),
  };
  assert.equal(tank.specialAction.kind, 'guided_missile', 'a launcher with a cannon round: its pad system is the missile');
  createPlayerBattleActions({
    game: { phase: 'battle', timeS: 10, player: tank }, bus: padBus, input: padInput, isSettingsOpen: () => false,
    network: { isActive: () => false, queueConsumable() {}, queueAction() {} }, strikes,
    rules: { ...rules, selectShell, activateSpecialAction, guidedMissileSlot, specialActionKind, hasAmmunition },
  });
  padInput.press('shell1', 'Digit1');
  padInput.press('shell2', 'Digit2'); // HEAT (the digit leaves Sabot: the toggle's own return slot reads Sabot from here)
  assert.equal(tank.combat.shellSlot, 1);
  padInput.press('specialAction', 'PadLB');
  assert.deepEqual([tank.combat.shellSlot, tank.input.shellSlot], [2, 2], 'the pad\'s LB selects the missile in the sim');
  assert.equal(tank.specialAction.previousShellSlot, 1, 'and the sim remembers the HEAT round it left');
  padInput.press('atgm', 'KeyQ');
  assert.equal(tank.combat.shellSlot, 1, 'Q after LB returns to the HEAT round the missile left (the sim\'s memory)');
  // and a keyboard press of the same action (E, a hull whose E is not its suspension's) is not the pad's: nothing moves
  padInput.press('specialAction', 'KeyE');
  assert.equal(tank.combat.shellSlot, 1, 'E on a missile hull leaves the round alone (the pad\'s LB only)');
}
{
  const other = createBus();
  const tracked = { ...player, combat: { ...player.combat, shellSlot: 1, ammo: [20, 10, 4] }, input: { shellSlot: 1 }, specialAction: null };
  const otherGame = { phase: 'battle', timeS: 0, player: tracked };
  const actions = createPlayerBattleActions({
    game: otherGame, bus: other, input: { onAction: () => () => {} }, rules, isSettingsOpen: () => false,
    network: { isActive: () => false, queueConsumable() {}, queueAction() {} }, strikes,
  });
  other.emit('ui:atgmToggle', {});
  assert.equal(tracked.combat.shellSlot, 2, 'on the missile from HEAT');
  // the next battle's tank: two cannon rounds the other way round, the missile last; the last tank's HEAT slot is stale
  const nextSpec = { gun: { shells: [spec.gun.shells[1], spec.gun.shells[0], spec.gun.shells[2]] } };
  actions.setTank(nextSpec);
  tracked.spec = nextSpec;
  tracked.combat.shellSlot = 2; tracked.input.shellSlot = 2; // it spawns on its missile (no pick yet this battle)
  other.emit('ui:atgmToggle', {});
  assert.equal(tracked.combat.shellSlot, 0, 'a new tank returns to its first cannon round, not the last tank\'s slot');
}

console.log('atgmToggle.selftest: Q and the HUD tile toggle the guided round and back from the game state, with no HUD loaded, through a lagging network row, after the pad\'s LB and across a tank change');
