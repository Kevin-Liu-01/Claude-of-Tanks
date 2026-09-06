import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

function bottom(mesh,x,z){
  return new THREE.Raycaster(new THREE.Vector3(x,0,z),new THREE.Vector3(0,1,0),0,2)
    .intersectObject(mesh,false)[0]?.point.y;
}
for(const quality of ['high','low']){
  const tank=createTank('t90sm_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{
    tank.root.updateMatrixWorld(true);const hull=tank.root.getObjectByName('hull');
    for(const [x,z,y]of [[.66,-2.7459,.493488],[.9,-2.7459,.493012],[.66,-2.7,.50353],
      [.66,-2.5,.546715],[.5,0,.600345],[.9,0,.64506],[1,0,.806934],
      [.9,1.4,.644586],[.66,2.4,.5970],[.9,2.9,.618]]){
      const actual=bottom(hull,x,z);
      assert.ok(Number.isFinite(actual)&&Math.abs(actual-y)<.016,`${quality}: source transverse lower tub at ${x}/${z}: ${actual} vs ${y}`);
    }
    assert.ok(bottom(hull,.9,0)-bottom(hull,0,0)>.060,'main tub genuinely turns upward toward its lower sides');
    assert.ok(bottom(hull,0,-2.746)-bottom(hull,.66,-2.746)>.03,'rear lower side bays remain deeper than central floor');
  }finally{tank.dispose();}
}
console.log('t90SMXHullTub: real high/low source underside rays, rear side bays and transverse lower air pass');
