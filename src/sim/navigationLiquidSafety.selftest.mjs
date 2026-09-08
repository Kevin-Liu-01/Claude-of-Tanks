import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createNavigationLiquidSafety } from './navigationLiquidSafety.ts';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.ts';
import { createTankState, SIM_DT } from './movement.ts';
import { createAI, mulberry32 } from '../game/ai.ts';
import { getSpec } from '../vehicles/specs.ts';

const contactSpec = { dims: { widthM: 4, hullLengthM: 8, heightM: 2 } };
assert.equal(createNavigationLiquidSafety({ getWaterMaskAt() { throw new Error('opt-out query'); } }, contactSpec), null);
const field = { navigationWaterPolicy: 'avoid-liquid', getWaterMaskAt: (x,z) => x > 8 ? 1 : 0 };
const safe = createNavigationLiquidSafety(field, contactSpec);
assert.equal(safe(0,0,0), true);
assert.equal(safe(7,0,0), false, 'dry center does not imply a dry hull');
assert.equal(safe(0,0,Math.PI/2,10), false, 'forward corridor');
assert.equal(safe(0,0,-Math.PI/2,-10), false, 'reverse corridor');
assert.equal(safe(0,0,-Math.PI/2,10), true, 'unobstructed opposite corridor');
const offsetSpec = { ...contactSpec, armor: { bodyContactPoints: { hull: [3,0,0,5,0,0,3,2,3,5,2,3] } } };
assert.equal(createNavigationLiquidSafety(field, offsetSpec)(4,0,0), false, 'contact center offset retained');
assert.equal(createNavigationLiquidSafety({ ...field, getWaterMaskAt: () => NaN }, contactSpec)(0,0,0), false);

const drivetrain = { ...contactSpec, enginePowerHp: 650, weightTons: 40,
  terrainResistance: { hard: .8, medium: 1, soft: 1.8 } };
const flat = { navigationWaterPolicy: 'avoid-liquid', getHeightAt: () => 0,
  getNormalAt: () => ({x:0,y:1,z:0}), getGroundType: () => 'medium', getWaterMaskAt: () => 0 };
const plan = (f,goal) => planBotRoute({ navigation: createBotNavigationGrid({ heightField:f }),
  start:{x:-100,z:0},goal,spec:drivetrain,rng:mulberry32(17),useRoleDetour:false });
assert.deepEqual(plan(flat,{x:13,z:2}).at(-1), [13,2], 'reachable off-grid arrival is not lost at snapped terminal');
const wetGoalField = { ...flat, getWaterMaskAt: (x,z) => x>5&&Math.abs(z)<12 ? 1:0 };
assert.notDeepEqual(plan(wetGoalField,{x:13,z:2}).at(-1),[13,2], 'exact wet destination is not restored');

function bot(speed, yaw) {
  const spec=getSpec('m1a2'), state=createTankState(spec,new Vector3(0,0,0),yaw);
  state.speed=speed;
  return { id:'liquid-test', specId:spec.id, spec, team:'alpha', state,
    combat:{hp:1000,maxHp:1000,destroyed:false,reload:{t:0,totalS:spec.gun.reloadS,kind:'ready'},shellSlot:0,
      modules:{},crew:{},fire:{burning:false,tickTimer:0,ticksLeft:0},magazine:null},
    input:{throttle:0,steer:0,brake:false,fire:false,aimPoint:new Vector3(),shellSlot:0,actionBits:0} };
}
for (const [speed,yaw] of [[12,0],[-12,Math.PI]]) {
  const entity=bot(speed,yaw);
  const controller=createAI(entity,{rng:mulberry32(41),deps:{
    heightField:{...flat,getWaterMaskAt:(_x,z)=>z>12?1:0},raycast:()=>null,
    getEnemies:()=>[],getAllies:()=>[],getObstacles:()=>[] } });
  controller.setWaypoints([[0,100]]);
  controller.update(SIM_DT,SIM_DT);
  assert.equal(entity.input.throttle,0,'post-controller hazard guard removes drive command');
  assert.equal(entity.input.brake,true,'actual forward/reverse momentum triggers braking');
}
console.log('navigationLiquidSafety.selftest: footprint, reverse, opt-out, exact arrival and AI brake passed');
