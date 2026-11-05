// roofGunRepair.selftest — a red roof-gun module silences the station without throwing its switch (audit M4,
// 2026-11-02). stepRoofGun switched station 0 off (gunOn = false) the step its module went red, so after the auto-repair
// to yellow the gun stayed off until the crew pressed the toggle again; stations 1+ were only silenced. The switch is
// the crew's (and the bots') choice: damage refuses fire while red and the repair brings it back as it was. The HUD's B
// tile reads the same switch law (roofGunSwitch.ts): silenced while on and red, never shown as firing.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState, tickModuleRepairs } from './damage.ts';
import { auxiliaryState, requestAuxiliary, stepRoofGun } from './auxiliarySystems.ts';
import { roofGunSwitch, roofGunTogglable } from './roofGunSwitch.ts';
import { createTankState } from './movement.ts';

// the M1A1's roof station (auxiliaryInventory); its roofGun module as the roof-station vehicles' armour builds it
const spec = getSpec('m1a1_abrams_hc');
const tank = { id: 'roof', team: 'alpha', spec, combat: createCombatState(spec), state: createTankState(spec, new Vector3(0, 0, 0), 0) };
tank.combat.modules.roofGun ??= { hp: 100, maxHp: 100, state: 'ok', repairT: 0 };
const context = { entities: [], visible: () => true, clear: () => true };
// the switch law the HUD's B tile reads (round 2 review, 2026-11-05: the tile read the switch alone, so a silenced red gun
// showed as firing): what the crew sees, and whether a press can act, at every step below
const seen = () => roofGunSwitch(tank.combat.auxiliary?.gunOn ?? auxiliaryState(tank).gunOn, tank.combat.modules.roofGun.state);
const pressable = () => roofGunTogglable(tank.combat.auxiliary.gunOn, tank.combat.modules.roofGun.state);
assert.ok(tank.combat.modules.roofGun, 'the station has its own module');
assert.equal(auxiliaryState(tank).gunOn, true, 'automatic fire starts on');
assert.equal(seen(), 'on');
Object.assign(tank.combat.modules.roofGun, { hp: 0, state: 'red', repairT: 0 });
assert.equal(stepRoofGun(tank, 1, 1 / 60, context), false, 'a red module silences the station');
assert.equal(tank.combat.auxiliary.gunOn, true, 'without throwing its switch');
assert.equal(seen(), 'silenced', 'the HUD reads a switched-on red gun as silenced, not as firing');
assert.equal(pressable(), true, 'and its tile takes a press (to switch it off)');
// round 2 U9 (2026-11-04): while red the switch still turns the gun off (it was locked, so a crew could not silence a gun
// that would open fire again the moment the repair reached yellow), and only switching it on is refused
assert.equal(requestAuxiliary(tank, 'roofGun', 1), true, 'while red the crew may still switch the gun off');
assert.equal(tank.combat.auxiliary.gunOn, false);
assert.equal(seen(), 'off');
assert.equal(pressable(), false, 'the tile of an off red gun refuses a press, as the sim does');
assert.equal(requestAuxiliary(tank, 'roofGun', 1), false, 'but not on: a red module refuses the switch on');
assert.equal(tank.combat.auxiliary.gunOn, false);
assert.ok(tickModuleRepairs(tank.combat, 60).includes('roofGun'), 'the crew repair brings the module back');
assert.equal(tank.combat.modules.roofGun.state, 'yellow');
assert.equal(stepRoofGun(tank, 61, 1 / 60, context), false, 'the gun the crew switched off while red stays off after the repair');
assert.equal(pressable(), true);
assert.equal(requestAuxiliary(tank, 'roofGun', 61), true, 'and the repaired gun takes the switch on again');
assert.equal(tank.combat.auxiliary.gunOn, true);
assert.equal(seen(), 'on', 'a repaired switched-on gun reads as on');
// a crew that left it on through the damage gets it back on, with no second press
Object.assign(tank.combat.modules.roofGun, { hp: 0, state: 'red', repairT: 0 });
assert.equal(stepRoofGun(tank, 61, 1 / 60, context), false, 'red silences it again');
assert.equal(seen(), 'silenced');
assert.ok(tickModuleRepairs(tank.combat, 60).includes('roofGun'));
assert.equal(seen(), 'on', 'and on again at the repair');
assert.equal(tank.combat.auxiliary.gunOn, true, 'the station is back on as the crew left it, with no second press');
// a crew that had switched it off keeps it off through the damage and the repair
assert.equal(requestAuxiliary(tank, 'roofGun', 61), true);
assert.equal(tank.combat.auxiliary.gunOn, false);
Object.assign(tank.combat.modules.roofGun, { hp: 0, state: 'red', repairT: 0 });
stepRoofGun(tank, 62, 1 / 60, context);
tickModuleRepairs(tank.combat, 60);
assert.equal(tank.combat.auxiliary.gunOn, false, 'an off switch stays off');
// the law over every state the sim knows: silenced exactly when on and red; a press refused exactly when off and red
for (const gunOn of [false, true]) for (const state of ['ok', 'yellow', 'red', undefined]) {
  assert.equal(roofGunSwitch(gunOn, state), !gunOn ? 'off' : state === 'red' ? 'silenced' : 'on');
  assert.equal(roofGunTogglable(gunOn, state), gunOn || state !== 'red');
}
console.log('roofGunRepair: damage silences the roof station (the HUD reads it silenced); the crew may switch it off (never on) while red; the repair restores it as the crew left it');
