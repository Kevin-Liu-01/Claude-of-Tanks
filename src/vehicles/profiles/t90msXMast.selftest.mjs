import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

for(const quality of ['high','low']) {
  const tank=createTank('t90ms_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const yaw=tank.root.getObjectByName('rig_turret');
    const ray=(p,d,far=.3)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObject(yaw,true)[0];
    // Held-out source first surfaces (not the authored lathe's vertices).
    for(const[y,x]of [[2.12,.63160647],[2.14,.61692129],[2.16,.59555499],
      [2.22,.59555499],[2.23,.59091803],[2.24,.59392855],[2.26,.58314111],
      [2.29,.57793860],[2.33,.57793860],[2.35,.56902497],[2.40,.56618085]]) {
      const hit=ray([.68,y,-1.42146],[-1,0,0]);
      assert.ok(hit&&Math.abs(hit.point.x-x)<.0035,`${quality} real source antenna collar at ${y}: ${hit?.point.x} vs ${x}`);
    }
    // A full height sweep proves the flange reaches the roof and the
    // socket reaches the already-authored whip, rather than hiding one gap.
    for(let i=0;i<=180;i++) {
      const y=2.10+i*.002;
      assert.ok(ray([.9,y,-1.42146],[-1,0,0],.4),`${quality} continuous physical antenna load path at ${y}`);
    }
    assert.ok(!ray([.64,2.35,-1.42146],[0,0,1],.06),'air alongside the narrow socket is not filled by a support box');
    const equipment=yaw.getObjectByName('turretEquipment');
    assert.ok(equipment||yaw.getObjectByName('turretDetail'),'mount remains turret-owned equipment');
  } finally {tank.dispose();}
}
console.log('t90msXMast: high/low source collars, roof-to-whip contact and surrounding air pass');
