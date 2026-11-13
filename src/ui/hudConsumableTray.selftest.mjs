// 2026-11-02 audit M4 (the HUD side): the consumable tray was an event-built copy of the authority's kits
// (ui:consumableUsed / ui:consumableReset / ui:battleConsumables). A revive makes a fresh consumable state at spawn
// (solo state.ts revive, the authority's reviveForMode) and nothing told the tray, so in every reviving mode a kit spent
// in the last life read empty, or still counted down, after the revive. Driven through the real HUD (initHud) over the
// recording DOM: the tray now reads the player's own consumable state each frame when the frame carries it (a solo
// battle, a Watch seat), and a network client (whose entity carries none) resets the tray on its own mode:respawn.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { createConsumableState, DEFAULT_CONSUMABLE_LOADOUT } from '../sim/consumableRules.ts';
import { consumableTiming } from '../sim/matchRuleset.ts';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';

await ensureAuthorityFleet(['m1a1_abrams_hc']);
const bus = createBus();
const hud = initHud(bus);
hud.setMode('battle');
const spec = getSpec('m1a1_abrams_hc');
const player = {
  id: 'player', team: 'alpha', isPlayer: true, spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
  state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
  visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } },
};
const freshKits = () => createConsumableState(DEFAULT_CONSUMABLE_LOADOUT, consumableTiming, player.combat);
const aim = { singleReticle: false, point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
let timeS = 20;
const frame = () => {
  timeS += 1 / 60;
  hud.update({ timeS, mode: 'battle', player, tanks: [player], spotting: { isSpotted: () => true }, aim, camera: null });
};
const tile = (slot) => created.filter((e) => e.classes.has('cot-con'))[slot];
const count = (slot) => tile(slot).querySelector('.cnt').textContent;

/** The authority spends a slot (solo playerBattleActions / the network's consumable_used): its event, and, when the
 *  entity carries it, its state. */
function spend(slot, { state = true } = {}) {
  const readyAt = timeS + 60;
  if (state) {
    player.consumables.readyAt[slot] = readyAt;
    player.consumables.charges[slot] = 0;
  }
  bus.emit('ui:consumableUsed', { slot, readyAt, cooldownS: 60, charges: 0 });
  frame();
}

// a solo battle: the entity carries its kits; a revive replaces them with a fresh set (no tray event is sent)
player.consumables = freshKits();
frame(); frame();
assert.equal(tile(0).classes.has('empty'), false);
spend(0);
assert.equal(tile(0).classes.has('empty'), true, 'the spent kit reads empty');
assert.equal(tile(0).classes.has('cooling'), true, 'and counts down');
player.consumables = freshKits(); // state.ts revive / reviveForMode: createConsumableState at spawn
frame();
assert.equal(tile(0).classes.has('empty'), false, 'after the revive the kit reads ready (the tray reads the state)');
assert.equal(tile(0).classes.has('cooling'), false, 'and no longer counts down');
assert.notEqual(count(0), '0');

// a Watch seat taken mid-cooldown: the tray shows the authority's running cooldown, not a fresh tile
const seat = freshKits();
seat.readyAt[1] = timeS + 30;
player.consumables = seat;
frame();
assert.equal(tile(1).classes.has('cooling'), true, 'a taken seat\'s running cooldown shows');
assert.equal(count(1), '30');

// a network client: the entity carries no kits; the own mode:respawn resets the tray as the authority's revive does
player.consumables = undefined;
bus.emit('ui:consumableReset', {});
frame();
spend(2, { state: false });
assert.equal(tile(2).classes.has('empty'), true);
bus.emit('mode:respawn', { id: 'ally-7' });
frame();
assert.equal(tile(2).classes.has('empty'), true, 'another tank\'s revive leaves the tray alone');
bus.emit('mode:respawn', { id: 'player' });
frame();
assert.equal(tile(2).classes.has('empty'), false, 'the player\'s own revive refills the tray');
assert.equal(tile(2).classes.has('cooling'), false);

console.log('hudConsumableTray.selftest: a revive refills the tray from the state (solo) and on the own respawn (network); a taken seat shows its running cooldown');
