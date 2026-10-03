import assert from 'node:assert/strict';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { MAP_IDS } from '../world/maps/index.ts';
import { createMatchPlacement,matchPlacementAnchors,placementTerrainSafe } from './matchPlacement.ts';
import { collisionFootprintContainsPoint } from '../world/collision.ts';
import { planBotRoute } from './botRoutePlanner.ts';
import { getSpec } from '../vehicles/specs.ts';
let routes=0;
for(const mapId of MAP_IDS){
 const world=createDedicatedWorldCollision(mapId),field=world.heightField;
 const placement=createMatchPlacement({mode:'ac130',mapId,heightField:field,obstacles:world.getObstacles(),queryObstacles:world.queryObstacles,anchors:matchPlacementAnchors(field._layout.spawns)});
 const exit=placement.middle;
 assert.ok(placementTerrainSafe(field,exit,{radius:30,relief:7,normalY:.94,solidOnly:true}),mapId+': dry stable extraction area');
 for(const obstacle of world.queryObstacles(exit.x-30,exit.z-30,exit.x+30,exit.z+30,[])){
  if(obstacle.dead||obstacle.crushed||obstacle.crushable)continue;
  const y=field.getHeightAt(exit.x,exit.z);if(obstacle.max[1]<y-.5||obstacle.min[1]>y+5)continue;
  assert.equal(collisionFootprintContainsPoint(obstacle,exit.x,exit.z,30),false,mapId+': clear extraction footprint');
 }
 for(const team of ['alpha','bravo']){
  const starts=placement.anchors.deployments[team];
  assert.ok(starts.some(start=>{
   const route=planBotRoute({navigation:placement.navigation,start,goal:exit,spec:getSpec('m1a2'),rng:()=>.5,useRoleDetour:false});
   const end=route.at(-1);return end&&Math.hypot(end[0]-exit.x,end[1]-exit.z)<26;
  }),mapId+'/'+team+': escort and pursuers can reach extraction');routes++;
 }
}
console.log('gunshipEscortMaps:',MAP_IDS.length,'safe extraction sites and',routes,'ground routes passed');
