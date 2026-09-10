import assert from 'node:assert/strict';
import { tickModuleRepairs, REPAIR_S } from './damage.ts';
import { chooseAiSupportActionBits } from '../game/ai.ts';
import { PLAYER_ACTION_BITS } from '../net/protocol.ts';

function moduleState(state = 'red', repairT = 0) {
  return { hp: state === 'red' ? 0 : 100, maxHp: 100, state, repairT };
}

function combatState(modules = {}) {
  return {
    destroyed: false, modules, crew: {}, fire: { burning: false },
    reload: { t: 0, kind: 'ready' }, magazine: null,
  };
}

const output = ['stale'];
const first = combatState({ turretRing: moduleState(), engine: moduleState() });
assert.equal(tickModuleRepairs(first, REPAIR_S, output), output,
  'an explicit repair buffer is returned to its owning caller');
assert.deepEqual(output, ['turretRing', 'engine'],
  'completed repairs retain own-key insertion order and clear old receipts');
assert.equal(first.modules.engine.hp, 50);
assert.equal(first.modules.engine.state, 'yellow');
assert.equal(first.modules.engine.repairT, 0);
assert.equal(tickModuleRepairs(first, 1, output), output);
assert.deepEqual(output, [], 'completion is an edge, not a repeated event');

for (const inactive of [null, undefined, { destroyed: true }, {}, combatState()]) {
  output.push('stale');
  assert.equal(tickModuleRepairs(inactive, 1, output), output);
  assert.deepEqual(output, [], 'inactive/missing records cannot leak an earlier repair');
}

const retained = tickModuleRepairs(combatState({ engine: moduleState() }), REPAIR_S);
const independent = tickModuleRepairs(combatState({ trackL: moduleState() }), REPAIR_S);
assert.notEqual(retained, independent, 'default callers retain independently owned results');
assert.deepEqual(retained, ['engine']);
assert.deepEqual(independent, ['trackL']);
const otherOutput = [];
tickModuleRepairs(combatState({ trackR: moduleState() }), REPAIR_S, otherOutput);
tickModuleRepairs(null, 0, output);
assert.deepEqual(otherOutput, ['trackR'], 'one explicit consumer cannot clear another');

const inherited = moduleState();
const modules = Object.assign(Object.create({ ammoRack: inherited }), {
  trackR: moduleState(), engine: undefined, trackL: moduleState('ok'),
});
Object.defineProperty(modules, 'gun', { value: moduleState(), enumerable: false });
modules[Symbol('module')] = moduleState();
const dynamic = combatState(modules);
tickModuleRepairs(dynamic, REPAIR_S, output);
assert.deepEqual(output, ['trackR']);
assert.equal(inherited.repairT, 0, 'prototype modules never participate in repairs');
assert.equal(modules.gun.repairT, 0, 'non-enumerable modules retain legacy exclusion');
delete modules.trackR;
modules.engine = moduleState();
modules.autoloader = moduleState();
tickModuleRepairs(dynamic, REPAIR_S, output);
assert.deepEqual(output, ['engine', 'autoloader'],
  'new, replaced and removed modules are observed without a stale key cache');
delete modules.engine;
modules.engine = moduleState();
modules.autoloader = moduleState();
tickModuleRepairs(dynamic, REPAIR_S, output);
assert.deepEqual(output, ['autoloader', 'engine'], 'reinserted keys use their new own-key order');
const nullPrototype = Object.assign(Object.create(null), { trackL: moduleState() });
Object.defineProperty(nullPrototype, 'hasOwnProperty', { value: () => false });
tickModuleRepairs(combatState(nullPrototype), REPAIR_S, output);
assert.deepEqual(output, ['trackL'], 'null prototypes and shadowed builtins are safe');

const accelerated = combatState({ engine: moduleState() });
accelerated.equipMults = { repair: 2 };
tickModuleRepairs(accelerated, REPAIR_S / 2 - 0.01, output);
assert.deepEqual(output, []);
tickModuleRepairs(accelerated, 0.01, output);
assert.deepEqual(output, ['engine'], 'equipment preserves the exact ready boundary');

const fault = new Error('module read failed');
const throwingModules = Object.defineProperty({}, 'engine', {
  enumerable: true, get() { throw fault; },
});
assert.throws(() => tickModuleRepairs(combatState(throwingModules), 1, output),
  (error) => error === fault, 'repair errors retain their original identity');
assert.deepEqual(output, [], 'a failing new call has cleared stale caller receipts');
const rateFault = new Error('equipment rate failed');
const badEquipment = combatState();
badEquipment.equipMults = Object.defineProperty({}, 'repair', {
  get() { throw rateFault; },
});
assert.throws(() => tickModuleRepairs(badEquipment, 1, output),
  (error) => error === rateFault);
assert.deepEqual(tickModuleRepairs(null, 0, output), [], 'a recovery call retains no failed receipt');

function bot(combat) {
  return { combat, consumableReadyAt: [0, 0, 0] };
}

const support = bot(combatState({ engine: moduleState(), fuelTank: moduleState() }));
support.combat.crew = { driver: true, gunner: false };
support.combat.fire.burning = true;
assert.equal(chooseAiSupportActionBits(support, 10), PLAYER_ACTION_BITS.EXTINGUISHER);
support.combat.fire.burning = false;
assert.equal(chooseAiSupportActionBits(support, 10), PLAYER_ACTION_BITS.REPAIR);
support.consumableReadyAt[0] = 20;
assert.equal(chooseAiSupportActionBits(support, 10), PLAYER_ACTION_BITS.FIRST_AID);
support.consumableReadyAt[1] = 20;
assert.equal(chooseAiSupportActionBits(support, 10), 0);
support.consumableReadyAt[0] = 10;
assert.equal(chooseAiSupportActionBits(support, 10), PLAYER_ACTION_BITS.REPAIR,
  'consumables become available exactly at their cooldown deadline');

const sparseSupport = bot(combatState(Object.create({ engine: moduleState() })));
sparseSupport.combat.crew = Object.create({ gunner: false });
assert.equal(chooseAiSupportActionBits(sparseSupport, 10), 0,
  'inherited damaged modules and crew cannot trigger consumables');
sparseSupport.combat.modules.radio = moduleState('yellow');
assert.equal(chooseAiSupportActionBits(sparseSupport, 10), 0,
  'one noncritical damaged module does not spend a repair kit');
sparseSupport.combat.modules.fuelTank = moduleState('yellow');
assert.equal(chooseAiSupportActionBits(sparseSupport, 10), PLAYER_ACTION_BITS.REPAIR);
delete sparseSupport.combat.modules.radio;
delete sparseSupport.combat.modules.fuelTank;
sparseSupport.combat.crew.gunner = false;
assert.equal(chooseAiSupportActionBits(sparseSupport, 10), PLAYER_ACTION_BITS.FIRST_AID,
  'new own crew and module records take effect immediately');
delete sparseSupport.combat.crew.gunner;
for (const notInjured of [undefined, null, 0, '', true]) {
  sparseSupport.combat.crew.driver = notInjured;
  assert.equal(chooseAiSupportActionBits(sparseSupport, 10), 0,
    'only literal false means an injured crew member');
}
sparseSupport.combat.modules.radio = { state: 'unrecognized' };
sparseSupport.combat.modules.fuelTank = {};
assert.equal(chooseAiSupportActionBits(sparseSupport, 10), PLAYER_ACTION_BITS.REPAIR,
  'two truthy non-ok records retain the prior damaged-module rule');
const nullProtoSupport = bot(combatState(Object.assign(Object.create(null), {
  engine: moduleState(),
})));
Object.defineProperty(nullProtoSupport.combat.modules, 'hasOwnProperty', { value: () => false });
assert.equal(chooseAiSupportActionBits(nullProtoSupport, 10), PLAYER_ACTION_BITS.REPAIR);
const hiddenSupport = bot(combatState());
Object.defineProperty(hiddenSupport.combat.modules, 'engine', { value: moduleState() });
Object.defineProperty(hiddenSupport.combat.crew, 'gunner', { value: false });
hiddenSupport.combat.modules[Symbol('engine')] = moduleState();
hiddenSupport.combat.crew[Symbol('gunner')] = false;
assert.equal(chooseAiSupportActionBits(hiddenSupport, 10), 0,
  'non-enumerable and symbol-keyed support state stays excluded');
assert.throws(() => chooseAiSupportActionBits(bot(combatState(throwingModules)), 10),
  (error) => error === fault, 'support errors retain their original identity');

// Count only materializing enumeration of these exact live records. Imports,
// assertions and unrelated subsystem enumeration keep their original behavior.
const healthy = combatState({ engine: moduleState('ok'), trackL: moduleState('ok') });
healthy.crew = { driver: true, gunner: true };
const original = { keys: Object.keys, values: Object.values, entries: Object.entries };
let enumerations = 0;
try {
  for (const method of ['keys', 'values', 'entries']) {
    Object[method] = (record) => {
      if (record === healthy.modules || record === healthy.crew) enumerations += 1;
      return original[method](record);
    };
  }
  const healthyBot = bot(healthy);
  const context = { safeToReloadMagazine: false, wantsSuspensionAim: false };
  for (let tick = 0; tick < 120; tick += 1) {
    tickModuleRepairs(healthy, 1 / 60, output);
    chooseAiSupportActionBits(healthyBot, tick / 60, context);
  }
} finally {
  Object.assign(Object, original);
}
assert.equal(enumerations, 0, 'healthy maintenance does not materialize module/crew key/value arrays');
assert.deepEqual(output, []);
console.log('combatMaintenance.selftest: repair ownership/order and support allocation contracts passed');
