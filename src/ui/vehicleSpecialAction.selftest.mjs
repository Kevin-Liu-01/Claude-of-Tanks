import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createSpecialActionPresentationReader, depletedMissileLabel } from './vehicleSpecialAction.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { setModeWeapon } from '../sim/modeLoadout.ts';
import { initializeAerial } from '../sim/aerialCombat.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';

await ensureAuthorityFleet(['m1a2', 'bwp1', 'strv103a', 'leclerc']);
const read = createSpecialActionPresentationReader();
const spec = getSpec('m1a2');
const player = { id: 'player', team: 'alpha', spec, combat: createCombatState(spec),
  state: { pos: new Vector3(), yaw: 0 }, input: { shellSlot: 0 } };
assert.equal(read(player.spec).kind, 'none');
assert.equal(read(player.spec), null, 'unchanged controls do not repaint');

// Reproduce the actual AC-130 → Drone path, without an intervening tank swap.
initializeAerial(player, matchRulesetFor('ac130'));
setModeWeapon(player, 'gunship');
assert.equal(player.spec.id, spec.id, 'mode weapon replacement preserves the tank ID');
assert.equal(read(player.spec).shortLabel, 'ATGM');
player.spec = spec;
player.combat = createCombatState(spec);
initializeAerial(player, matchRulesetFor('drone'));
assert.equal(player.aerial.kind, 'drone');
assert.equal(read(player.spec).kind, 'none', 'Drone mode must clear the aircraft missile shortcut');
assert.equal(read(player.spec), null);
player.aerial.active = true;
assert.equal(read(player.spec), null, 'flying the drone never gives the tank an ATGM');
player.aerial.active = false;
assert.equal(read(player.spec), null, 'returning from flight keeps the tank capabilities');

assert.equal(read(getSpec('bwp1')).shortLabel, 'ATGM', 'real missile tanks retain their selector');
assert.equal(read(getSpec('strv103a')).shortLabel, 'Suspension');
assert.equal(read(getSpec('leclerc')).shortLabel, 'Reload');
assert.equal(read(null).kind, 'none', 'losing the player clears the last action');
assert.equal(read(null), null);

// Gun Game changes capability under the same identity as well. Also cover a
// live loadout edited in place instead of receiving a new spec object.
player.spec = spec;
setModeWeapon(player, 'gunship');
assert.equal(read(player.spec).kind, 'guided_missile');
setModeWeapon(player, 0);
assert.equal(read(player.spec).kind, 'none');
player.spec.gun.shells = [...getSpec('bwp1').gun.shells];
assert.equal(read(player.spec).kind, 'guided_missile');
player.spec.gun.shells = [...spec.gun.shells];
assert.equal(read(player.spec).kind, 'none');
console.log('vehicleSpecialAction: same-tank AC-130 → Drone, flight return, Gun Game, real missiles, suspension and reload passed');

const missileSpec = getSpec('bwp1');
const missileCombat = createCombatState(missileSpec);
const missileSlot = missileSpec.gun.shells.findIndex(shell => shell.guided);
const missileShell = missileSpec.gun.shells[missileSlot];
assert.equal(depletedMissileLabel(missileCombat, missileSlot, missileShell), null);
missileCombat.ammo[missileSlot] = 0;
assert.equal(depletedMissileLabel(missileCombat, missileSlot, missileShell), `0/${missileCombat.ammoCapacity[missileSlot]}`);
missileCombat.ammo[missileSlot] = 1;
assert.equal(depletedMissileLabel(missileCombat, missileSlot, missileShell), null, 'resupply restores the same tank control immediately');
assert.equal(depletedMissileLabel(missileCombat, -1, null), null, 'vehicles without missiles do not acquire an empty control');
assert.equal(depletedMissileLabel(null, 1, missileShell), null);
assert.equal(depletedMissileLabel({ammo:[4,0],ammoCapacity:[]}, 1, {type:'ATGM',count:6}), '0/6', 'missing snapshot capacities use authored ammo');
console.log('vehicleSpecialAction: empty missile inventory and same-tank resupply passed');
