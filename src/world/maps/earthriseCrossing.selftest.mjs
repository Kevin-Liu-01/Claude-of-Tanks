import { bridgeBallFloor } from '../../sim/bridgeBallSupport.ts';
import assert from 'node:assert/strict';
import {createHeightField,mulberry32} from '../terrain.ts';
import {getMapConfig,RANDOM_BATTLE_MAP_IDS} from './index.ts';
import {dressMapExtras} from './mapKits.ts';
import {structureTopAt} from '../../sim/structureSupport.ts';
import {trackSurfacePolicy} from '../trackSurface.ts';
const moon=getMapConfig('moon');
assert.equal(moon.sky.earth,1);assert.ok(moon.sky.planetDeg>=12);
assert.equal(moon.sky.cloudOpacity+moon.sky.cloudOpacity2,0);
assert.equal(moon.sky.fogDensity,0);assert.equal(moon.vegetation.grassDensity,0);
assert.equal(moon.vegetation.clusterCount+moon.vegetation.loneCount+moon.vegetation.rimCount,0);
assert.equal(trackSurfacePolicy(moon.splat.sourcedPalette),'sand','lunar regolith is powder, never snow');
assert.ok(!RANDOM_BATTLE_MAP_IDS.includes('moon'));assert.ok(RANDOM_BATTLE_MAP_IDS.includes('cliffbridge'));
const cfg=getMapConfig('cliffbridge');
for(const seed of [1337,19,8821]){
  const field=createHeightField(seed,cfg);const [deck]=field.bridgeDecks;
  assert.equal(field.bridgeDecks.length,1);assert.ok(deck.deckY-deck.bedY>30);
  for(let z=-100;z<=100;z+=.25)for(const x of [-7,0,7]){
    assert.ok(field.getHeightAt(x,z)<=deck.deckY+.1,`${seed}: no buried deck at ${x},${z}`);
    assert.equal(field.getWaterMaskAt(x,z),0,'dry gorge cannot produce water FX');
  }
  for(const sign of [-1,1])for(let z=101;z<=194;z+=.25){
    const grade=Math.abs(field.getHeightAt(0,sign*(z+.25))-field.getHeightAt(0,sign*z))/.25;
    assert.ok(grade<.22,`${seed}: driveable approach grade ${grade}`);
  }
  const names=['plaster','plaster2','plaster3','roof','stone','wood','dark','glass','curtain','straw','baked'];
  const buckets=Object.fromEntries(names.map(n=>[n,[]])),obstacles=[],colliders=[];
  dressMapExtras({mapId:'cliffbridge',extraKits:[],L:field._layout,heightField:field,rng:mulberry32(seed),buckets,obstacles,colliders});
  const bridges=colliders.filter(x=>x.kind==='bridge');assert.ok(bridges.length>1);
  assert.ok(bridges.every(r=>r.shape2.parts.length<=64),'every bridge record fits server format');
  for(let z=-98;z<=98;z+=2)for(const x of [-7,0,7])assert.equal(structureTopAt(bridges,bridges.length,x,z,deck.deckY+.1),deck.deckY,'continuous real deck support');
  assert.equal(bridgeBallFloor(field,0,0,deck.deckY+.1),deck.deckY,'rolling ball stays on bridge');
  assert.equal(bridgeBallFloor(field,0,0,deck.bedY+2),field.getHeightAt(0,0),'ball below bridge is not teleported up');
  assert.equal(bridgeBallFloor(field,25,0,deck.deckY),field.getHeightAt(25,0),'ball falls when it leaves the span');
  for(const list of Object.values(buckets))for(const g of list)g.dispose();
}
console.log('earthriseCrossing: lunar policy and full-width dry viaduct approaches/collision passed');

// Exercise real exported collision support through the fixed-step movement loop.
import {Vector3} from 'three';
import '../../vehicles/fleetFactory.ts';
import {TANK_SPECS} from '../../vehicles/specs.ts';
import {createDedicatedWorldCollision} from '../../../server/dedicatedWorldCollision.ts';
import {createStructureSupportField} from '../../sim/structureSupport.ts';
import {createTankState,updateTank,SIM_DT} from '../../sim/movement.ts';
import {createMatchPlacement,matchPlacementAnchors} from '../../sim/matchPlacement.ts';
const world=createDedicatedWorldCollision('cliffbridge'), field=world.heightField;
const support=createStructureSupportField(field,world);
for(const direction of [1,-1]) {
 const spec=TANK_SPECS.m1a2;
 const e={id:'drive',spec,state:createTankState(spec,new Vector3(0,field.getHeightAt(0,-direction*180),-direction*180),direction===1?0:Math.PI),input:{throttle:0,steer:0,brake:false,aimPoint:null},combat:null};
 for(let tick=0;tick<3000;tick++){
  e.input.throttle=tick<120?0:.6;
  support.beginHull(e.state.pos.x,e.state.pos.z,e.state.pos.y);
  updateTank(e,support,SIM_DT);
  if(Math.abs(e.state.pos.z)<95)assert.ok(e.state.pos.y>field.bridgeDecks[0].deckY-.6,'tracks cannot fall through deck');
  if(direction*e.state.pos.z>180)break;
 }
 assert.ok(direction*e.state.pos.z>180,`crossed both approaches: ${JSON.stringify(e.state.pos)}`);
 console.log('crossed',direction,e.state.pos.toArray());
}
for(const mapId of ['moon','cliffbridge']){
 const w=createDedicatedWorldCollision(mapId),cfg=getMapConfig(mapId);
 for(const mode of ['capture_the_flag','zone_control','turbo_ball','mars']){
  const p=createMatchPlacement({mapId,mode,anchors:matchPlacementAnchors(cfg.spawns),heightField:w.heightField,obstacles:w.getObstacles(),queryObstacles:w.queryObstacles});
  console.log(mapId,mode,JSON.stringify({zones:p.zones,middle:p.middle}));
 }
}
