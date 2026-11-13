// modeWeaponReload.selftest — a mode weapon swap takes the whole reload machine with it (audit M5, 2026-11-02).
// setModeWeapon (Gun Game's ladder, the AC-130's guns) replaced `reload` and `reloadChannels` but left `gunReload`, the
// cannon channel the snapshot rows and the magazine read, on the old gun's timer: a swap mid-reload sent that frozen
// timer (it no longer ticked, being in no channel) for the rest of the life.
import assert from 'node:assert/strict';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState, tickReload } from './damage.ts';
import { setModeWeapon } from './modeLoadout.ts';
import { GUN_GAME_WEAPONS } from './matchRuleset.ts';

const spec = getSpec('m1a1_abrams_hc');
const entity = { spec, combat: createCombatState(spec), input: { shellSlot: 0 } };
entity.combat.gunReload.t = 4; entity.combat.gunReload.totalS = 6; entity.combat.gunReload.kind = 'shell';
setModeWeapon(entity, 2);
const { combat } = entity;
assert.equal(combat.gunReload, combat.reload, 'the ladder gun\'s cannon channel is its active channel');
assert.equal(combat.gunReload, combat.reloadChannels[0], 'and the channel its round binds to');
assert.equal(combat.gunReload.t, 0, 'the new gun starts ready');
assert.equal(combat.gunReload.totalS, GUN_GAME_WEAPONS[2].reloadS, 'on its own cycle');
combat.reload.t = 1; combat.reload.kind = 'shell';
tickReload(combat, 0.5);
assert.equal(combat.gunReload.t, 0.5, 'the channel the rows report ticks');
setModeWeapon(entity, 'gunship');
assert.ok(combat.reloadChannels.every((channel) => channel !== combat.gunReload || channel === combat.reload),
  'the gunship keeps no channel of the ladder gun');
assert.equal(combat.gunReload.t, 0, 'and its cannon channel is its own, ready');
console.log('modeWeaponReload: a mode weapon swap repoints the cannon channel with the rest of the reload machine');
