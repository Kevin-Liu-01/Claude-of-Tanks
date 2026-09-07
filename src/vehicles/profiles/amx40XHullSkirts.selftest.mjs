import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

for(const quality of ['high','low']) {
  const tank=createTank('amx40_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('rig_hull');
    const ray=(p,d,far=.4)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObject(hull,true)[0];
    // Independent source first-side surfaces. The source rear course is
    // narrow and slightly folded; only the forward course reaches max width.
    for(const side of [-1,1])for(const [z,y,x]of [[-3.15,1.25,1.64051328],
      [-2.8,.8,1.64077268],[-2.8,1.25,1.64079943],[-2.35,1,1.64115249],
      [-1.8,.8,1.64375089],[-1.1,.8,1.64620042],[-1.1,1.25,1.64218933],
      [-.4,1,1.68050003],[.3,.8,1.68050003],[1.7,1.25,1.68050003],[2.9,1,1.68050003]]) {
      const expected=side<0?-x+.0025:x,hit=ray([side*2,y,z],[-side,0,0]);
      assert.ok(hit&&Math.abs(hit.point.x-expected)<.0005,`${quality} measured side ${side}/${z}/${y}: ${hit?.point.x} vs ${expected}`);
    }
    for(const side of [-1,1])for(const z of [-3.15,3.15]) {
      assert.ok(!ray([side*2,1,z],[-side,0,0]),'rising skirt ends preserve source air above end drums');
      assert.ok(ray([side*2,1.25,z],[-side,0,0]),'upper sheet remains present at each rising end');
    }
    for(const side of [-1,1]) {
      assert.ok(!ray([side*1.61,1.1,-2.0],[0,0,1],.2),'space inboard of the rear skin is not a solid box');
      assert.ok(ray([side*1.592,1.35,-1.6],[0,-1,0],.045),'folded root engages the permanent shoulder');
      assert.ok(!ray([side*1.693,1.265,-2.5],[0,0,1],.15),'unsupported outboard clip volume removed');
    }
    for(const[y,z]of[[1.50,-.9],[1.65,-2.1]]) {
      const h=ray([1.9,y,z],[-1,0,0]);
      assert.ok(h&&Math.abs(h.point.x-1.6123)<.00001,'actual starboard side plate occupies its measured face');
    }
  } finally {tank.dispose();}
}
console.log('amx40XHullSkirts: high/low source outer planes, rising ends, open bay, folded root and side plate contacts pass');
