import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { bakeTankWreck } from './wrecks.ts';
import { collectWreckSolids, placeWreckCollision } from './wreckCollision.ts';
import { pushHullFromObstacle, setObbShape } from './collision.ts';

const box = (name, w, h, l, x = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,l), new THREE.MeshBasicMaterial());
  mesh.name = name; mesh.position.set(x,h/2,z); return mesh;
};
const root = new THREE.Group();
root.add(box('hull',4,2,8), box('turret',2,1,2,-6), box('gun',14,0.2,0.2));
root.updateMatrixWorld(true);
const solids = collectWreckSolids(root);
assert.equal(solids.length,2);
const hit = (rec,x,z,halfL=1,halfW=1) => {
  const push = {x:0,z:0};
  const collided = pushHullFromObstacle({x,z},0,1,1,0,halfL,halfW,rec,push);
  return {collided,push};
};
const rec = placeWreckCollision(solids,new THREE.Matrix4());
assert.equal(hit(rec,3.001,0).collided,false,'one millimetre of visible side clearance stays clear');
assert.equal(hit(rec,0,5.001).collided,false,'one millimetre of end clearance stays clear');
assert.equal(hit(rec,2.99,0).collided,true,'actual hull overlap blocks');
assert.equal(hit(rec,-3.5,0,0.2,0.2).collided,false,'gap between hull and tossed turret stays open');
assert.equal(hit(rec,-6,0).collided,true,'tossed turret remains solid');
for(const yaw of [0.37,Math.PI/2,2.3]) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(17,4,-23);
  const transformed = placeWreckCollision(solids,m);
  const p = new THREE.Vector3(3.6,0,0).applyMatrix4(m);
  const out={x:0,z:0};
  assert.equal(pushHullFromObstacle(p,Math.sin(yaw),Math.cos(yaw),Math.cos(yaw),-Math.sin(yaw),1,1,transformed,out),false);
}
const slope = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.2,0.6,-0.12)).setPosition(19,7,-11);
const sloped = placeWreckCollision(solids,slope);
for (const [index,solid] of solids.entries()) {
  const part=sloped.shape2.parts[index];
  for(let i=0;i<solid.length;i+=3) {
    const p=new THREE.Vector3(...solid.slice(i,i+3)).applyMatrix4(slope);
    assert.ok(p.y>=part.y0-1e-9 && p.y<=part.y1+1e-9,'part vertical bounds follow the terrain tilt');
  }
}

let releasedCells=0;
for(const id of ['m1a2','t90m','k2','m551_sheridan','kv2','jpz_e100_x']) {
  await ensureTankBuilder(id);
  for(const pop of [false,true]) {
    const baked=bakeTankWreck(null,id,{seed:91234,pop});
    assert.ok(baked,`${id} bakes`);
    assert.ok(baked.solids.length>=1 && baked.solids.length<=2,`${id}: bounded solid bodies`);
    const placed=placeWreckCollision(baked.solids,new THREE.Matrix4());
    const old=setObbShape({min:[-baked.hx,0,-baked.hz],max:[baked.hx,baked.h,baked.hz]},0,0,baked.hx+0.2,baked.hz+0.2,0);
    let cleared=0;
    for(let x=-baked.hx-1;x<=baked.hx+1;x+=0.25) for(let z=-baked.hz-1;z<=baked.hz+1;z+=0.25) {
      if(hit(old,x,z,1,1).collided && !hit(placed,x,z,1,1).collided) cleared++;
    }
    assert.ok(cleared>0,`${id}/${pop}: real driving paths formerly blocked by padded envelope reopen`);
    releasedCells+=cleared;
    baked.geo.dispose();baked.shadowGeo?.dispose();
  }
}
console.log(`wreckCollision: 12 real wreck poses, rotation/slope/gap contacts passed; ${releasedCells} formerly blocked sample positions clear`);
