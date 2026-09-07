import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

function ray(mesh,origin,direction){
  return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,8).intersectObject(mesh,false)[0];
}
for(const quality of ['high','low']){
  const tank=createTank('t90sm_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{
    tank.root.updateMatrixWorld(true);const hull=tank.root.getObjectByName('hull');
    for(const [x,z,y]of [[1.30,-3.45,1.32865],[1.50,-3.35,1.32844],[1.50,-3.26,1.32820],
      [1.68,-2.5,1.32137],[1.72,-2.5,1.30363],[1.78,-2.5,1.27488],
      [1.30,-2.5,1.51858],[1.60,-2.5,1.51738]]){
      const actual=ray(hull,[x,2,z],[0,-1,0])?.point.y;
      assert.ok(Number.isFinite(actual)&&Math.abs(actual-y)<.016,`${quality}: source distinct casing/low wing at ${x}/${z}: ${actual} vs ${y}`);
    }
    const back=ray(hull,[1.50,1.42,-4],[0,0,1])?.point.z;
    assert.ok(Math.abs(back-(-3.24503))<.009,`${quality}: source raised rear housing begins after the low shelf: ${back}`);
    assert.equal(ray(hull,[1.50,1.35,-3.30],[0,0,1])?.point.z>=-3.2459,true,'true gap above shelf is not filled by a ramp');
  }finally{tank.dispose();}
}
console.log('t90SMXFenderShoulders: real low wing/casing source roofs and open rear tow-eye approach pass high/low');
