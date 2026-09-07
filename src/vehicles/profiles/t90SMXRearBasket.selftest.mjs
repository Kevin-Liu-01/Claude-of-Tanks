import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

function hit(root,origin,direction,far=8) {
  return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,far)
    .intersectObject(root,true).find(h=>{
      for(let o=h.object;o;o=o.parent)if(!o.visible)return false;
      return !/shadow/.test(h.object.name);
    });
}

function near(h,axis,source,tolerance,label) {
  assert.ok(h&&Math.abs(h.point[axis]-source)<=tolerance,
    `${label}: ${h?.point[axis]} versus independent source ${source} ± ${tolerance}`);
}

for(const quality of ['high','low']) {
  const tank=createTank('t90sm_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    for(const [y,z]of [[1.93831,-2.922269],[1.99279,-2.920161],[2.05251,-2.922269],
      [2.10936,-2.922269],[2.16596,-2.922269],[2.223315,-2.922269]]) {
      near(hit(tank.root,[0,y,-3.1],[0,0,1]),'z',z,.001,
        `${quality}: six thin rear rails stay at actual source heights`);
    }
    for(const [side,y,z,x]of [[-1,2.007875,-2.7,-.926675],[-1,2.23578,-1.8,-1.063514],
      [1,2.17843,-2.5,.972828],[1,2.23578,-2.32,1.001594]]) {
      near(hit(tank.root,[side*3,y,z],[-side,0,0]),'x',x,.003,
        `${quality}: independently canted asymmetric side return ${side}/${z}`);
    }
    for(const y of [1.84,1.88,2.02,2.08,2.195])assert.equal(
      hit(tank.root,[0,y,-3.1],[0,0,1],.35),undefined,
      `${quality}: rear basket gaps and the space below it remain real air at ${y}`);
    near(hit(tank.root,[0,2.08,-3.1],[0,0,1]),'z',-2.686959,.001,
      `${quality}: open rails reveal the separate existing case, not an invented rear wall`);
    const post=hit(tank.root,[.83,2.08,-3.1],[0,0,1]);
    near(post,'z',-2.896995,.001,`${quality}: measured inset upright`);
    const marking=tank.root.getObjectByName('turretPermanentMarkingSurface');
    assert.ok(marking,`${quality}: permanent marking surface remains independently owned`);
  } finally { tank.dispose(); }
}
console.log('t90SMXRearBasket: actual rail levels, asymmetric side returns, inset posts and open gaps pass high/low');
