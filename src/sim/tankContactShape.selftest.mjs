import assert from 'node:assert/strict';
import '../vehicles/tankFactory.ts';
import {ALL_TANK_IDS,getSpec} from '../vehicles/specs.ts';
import {tankContactRect} from './tankContactShape.ts';
import {pushHullFromHull,pushHullFromObstacle,setObbShape} from '../world/collision.ts';

for(const id of ALL_TANK_IDS) {
  const spec=getSpec(id), rect=tankContactRect(spec);
  assert.ok(rect.exact,`${id}: uses authored hull shell, never a padded barrel radius`);
  const points=spec.armor.bodyContactPoints.hull;
  const xs=points.filter((_,i)=>i%3===0),zs=points.filter((_,i)=>i%3===2);
  assert.ok(Math.abs(rect.halfWidth*2-(Math.max(...xs)-Math.min(...xs)))<1e-9,`${id}: no width padding`);
  assert.ok(Math.abs(rect.halfLength*2-(Math.max(...zs)-Math.min(...zs)))<1e-9,`${id}: no length padding`);
  for(const yaw of [0,0.39,Math.PI/2,2.1]) for(const longitudinal of [false,true]) {
    const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=fz,rz=-fx;
    const nx=longitudinal?fx:rx,nz=longitudinal?fz:rz;
    const size=2*(longitudinal?rect.halfLength:rect.halfWidth);
    for(const clearance of [0.001,-0.001]) {
      const x=nx*(size+clearance),z=nz*(size+clearance),out={x:0,z:0};
      assert.equal(pushHullFromHull(x,z,fx,fz,rx,rz,rect.halfLength,rect.halfWidth,0,0,fx,fz,rx,rz,rect.halfLength,rect.halfWidth,out),clearance<0,`${id}: tank contact at actual surface`);
      const obstacle=setObbShape({min:[0,0,0],max:[0,3,0]},0,0,rect.halfWidth,rect.halfLength,yaw);
      assert.equal(pushHullFromObstacle({x,z},fx,fz,rx,rz,rect.halfLength,rect.halfWidth,obstacle,{x:0,z:0}),clearance<0,`${id}: world contact at actual surface`);
    }
  }
}
console.log(`tankContactShape: all ${ALL_TANK_IDS.length} tanks have unpadded contact dimensions; 1 mm clearance/overlap checks passed at four headings`);
