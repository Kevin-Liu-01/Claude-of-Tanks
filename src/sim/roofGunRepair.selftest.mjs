// roofGunRepair.selftest — a red roof-gun module silences the station without throwing its switch (audit M4,
// 2026-11-02). stepRoofGun switched station 0 off (gunOn = false) the step its module went red, so after the auto-repair
// to yellow the gun stayed off until the crew pressed the toggle again; stations 1+ were only silenced. The switch is
// the crew's (and the bots') choice: damage refuses fire while red and the repair brings it back as it was.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState, tickModuleRepairs } from './damage.ts';
import { auxiliaryState, requestAuxiliary, stepRoofGun } from './auxiliarySystems.ts';
import { createTankState } from './movement.ts';

// the M1A1's roof station (auxiliaryInventory); its roofGun module as the roof-station vehicles' armour builds it
const spec = getSpec('m1a1_abrams_hc');
const tank = { id: 'roof', team: 'alpha', spec, combat: createCombatState(spec), state: createTankState(spec, new Vector3(0, 0, 0), 0) };
tank.combat.modules.roofGun ??= { hp: 100, maxHp: 100, state: 'ok', repairT: 0 };
const context = { entities: [], visible: () => true, clear: () => true };
assert.ok(tank.combat.modules.roofGun, 'the station has its own module');
assert.equal(auxiliaryState(tank).gunOn, true, 'automatic fire starts on');
Object.assign(tank.combat.modules.roofGun, { hp: 0, state: 'red', repairT: 0 });
assert.equal(stepRoofGun(tank, 1, 1 / 60, context), false, 'a red module silences the station');
assert.equal(tank.combat.auxiliary.gunOn, true, 'without throwing its switch');
assert.equal(requestAuxiliary(tank, 'roofGun', 1), false, 'and the switch is locked while red');
assert.ok(tickModuleRepairs(tank.combat, 60).includes('roofGun'), 'the crew repair brings the module back');
assert.equal(tank.combat.modules.roofGun.state, 'yellow');
assert.equal(tank.combat.auxiliary.gunOn, true, 'the station is back on as the crew left it, with no second press');
// a crew that had switched it off keeps it off through the damage and the repair
assert.equal(requestAuxiliary(tank, 'roofGun', 61), true);
assert.equal(tank.combat.auxiliary.gunOn, false);
Object.assign(tank.combat.modules.roofGun, { hp: 0, state: 'red', repairT: 0 });
stepRoofGun(tank, 62, 1 / 60, context);
tickModuleRepairs(tank.combat, 60);
assert.equal(tank.combat.auxiliary.gunOn, false, 'an off switch stays off');
console.log('roofGunRepair: damage silences the roof station; the repair restores it as the crew left it');
