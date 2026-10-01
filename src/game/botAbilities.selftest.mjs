import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createTankState, requestTankJump } from '../sim/movement.ts';
import { auxiliaryState, requestAuxiliary, stepRoofGun } from '../sim/auxiliarySystems.ts';
import { PLAYER_ACTION_BITS as B } from '../sim/playerActions.ts';
import { createBotAbilityPlanner } from './botAbilities.ts';

function fixture(team = 'alpha') {
  const spec = getSpec('m1a2');
  const entity = { id: `bot-${team}`, team, spec, state: createTankState(spec, new Vector3(), 0), combat: createCombatState(spec) };
  const context = { hitAtS: 10, hitBearing: 0, retreating: true, reloadS: 6, contactM: 90, safeJump: false };
  return { entity, context, planner: createBotAbilityPlanner(spec) };
}
for (const team of ['alpha', 'bravo']) {
  const {entity, context, planner} = fixture(team);
  entity.combat.hp = entity.combat.maxHp * .3;
  const bits = planner.update(entity, 10, context);
  assert.ok(bits & B.SMOKE, 'wounded hull screens a frontal threat');
  assert.ok(bits & B.ROOF_GUN, 'a nearby clear spotted contact enables the actual roof gun');
  assert.ok(bits & B.LIGHTS_OFF, 'night lights are blacked out');
  assert.equal(requestAuxiliary(entity, 'smoke', 10), true);
  assert.equal(requestAuxiliary(entity, 'roofGun', 10), true);
  assert.equal(requestAuxiliary(entity, 'lightsOff', 10), true);
  const aux = auxiliaryState(entity);
  assert.equal(aux.smokeCharges, 2);
  assert.ok(aux.smoke.canisters.length > 0, 'real ballistic canisters launch, not a cosmetic bot-only screen');
  assert.equal(planner.update(entity, 10.1, context), 0, 'four-Hz decisions emit edges, not repeated toggles');
  assert.equal(planner.update(entity, 10.3, context), 0, 'active gun does not toggle off next decision');
  context.contactM = Infinity;
  assert.ok(!(planner.update(entity, 12, context) & B.ROOF_GUN), 'brief loss of contact does not flicker gun state');
  assert.ok(planner.update(entity, 14, context) & B.ROOF_GUN, 'roof gun stands down after losing contact');
  context.hitAtS = 15;
  assert.ok(!(planner.update(entity, 15, context) & B.SMOKE), 'cannot bypass player smoke cooldown');
  context.hitAtS = 40;
  assert.ok(planner.update(entity, 40, context) & B.SMOKE, 'a later threat can use the next charge');
}
for (const change of [
  f => { f.context.hitAtS = 0; },
  f => { f.context.hitBearing = Math.PI; },
  f => { f.entity.state.grounded = false; },
  f => { auxiliaryState(f.entity).smokeCharges = 0; },
  f => { f.entity.combat.destroyed = true; },
  f => { f.entity.modeActive = false; },
]) {
  const f = fixture(); f.entity.combat.hp = 1; change(f);
  assert.ok(!(f.planner.update(f.entity, 10, f.context) & B.SMOKE), 'invalid, airborne, empty or misplaced smoke is refused');
}
{
  const f = fixture(); f.context.retreating = false;
  assert.ok(!(f.planner.update(f.entity, 10, f.context) & B.SMOKE), 'healthy offensive tank preserves its own firing lane');
}
{
  const f = fixture(); f.entity.modeJumpMps = 6; f.entity.state.speed = 8;
  assert.equal(f.planner.jumpEligible(f.entity, 10, f.context), true);
  assert.ok(!(f.planner.update(f.entity, 10, f.context) & B.SELF_RIGHT), 'landing path must be certified before a jump');
  f.context.safeJump = true;
  assert.ok(f.planner.update(f.entity, 10.3, f.context) & B.SELF_RIGHT);
  assert.equal(requestTankJump(f.entity.state, f.entity.modeJumpMps), true);
  assert.equal(f.entity.state.grounded, false, 'jump command enters shared airborne physics');
  f.context.hitAtS = 11;
  assert.ok(!(f.planner.update(f.entity, 11, f.context) & B.SELF_RIGHT), 'never boost repeatedly in the air');
  f.entity.state.grounded = true;
  assert.ok(!(f.planner.update(f.entity, 11.3, f.context) & B.SELF_RIGHT), 'landing does not reset jump discipline');
}
{
  const f = fixture(); const enemy = fixture('bravo').entity;
  enemy.state.pos.set(0, 0, 80);
  requestAuxiliary(f.entity, 'roofGun', 10);
  const world = { entities: [f.entity, enemy], visible: () => false, clear: () => true };
  assert.equal(stepRoofGun(f.entity, 10, .1, world), false, 'automatic gun cannot see through spotting');
  world.visible = () => true; world.clear = () => false;
  assert.equal(stepRoofGun(f.entity, 10.1, .1, world), false, 'automatic gun cannot see through cover or smoke');
  world.clear = () => true;
  let fired = false;
  for (let i = 0; i < 30; i++) fired ||= stepRoofGun(f.entity, 10.2 + i * .1, .1, world);
  assert.ok(fired, 'an exposed enemy receives a real auxiliary shot');
}
console.log('botAbilities.selftest: team parity, smoke inventory/direction/cooldown, gun safety, lighting and grounded jump discipline passed');
