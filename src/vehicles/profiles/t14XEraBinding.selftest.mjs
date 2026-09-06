import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildT14X} from './t14X.ts';

function fingerprint(root){
  root.updateMatrixWorld(true);const triangles=[],point=new THREE.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||mesh.userData.shadowOnly||mesh.userData.vehicleMarking)return;
    const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
    for(let i=0;i<(index?.count??p.count);i+=3){const corners=[];
      for(let j=0;j<3;j++)corners.push(point.fromBufferAttribute(p,index?index.getX(i+j):i+j)
        .applyMatrix4(mesh.matrixWorld).toArray().map(v=>v.toFixed(7)).join(','));
      triangles.push(corners.sort().join('|'));
    }
  });
  return createHash('sha256').update(triangles.sort().join('\n')).digest('hex');
}
function ray(mesh,origin,direction){return new THREE.Raycaster(new THREE.Vector3(...origin),
  new THREE.Vector3(...direction),0,12).intersectObject(mesh,false)[0]?.point;}
for(const quality of ['high','low']){
  registerProfiledBuilders({t14_x:P=>{
    const original=P.destructibleCluster;P.destructibleCluster=(_name,fill)=>fill();
    try{buildT14X(P);}finally{P.destructibleCluster=original;}
  }});
  let expected;
  try{const old=createTank('t14_x',null,{quality,geometryReceipt:true,proceduralOnly:true,camoSeed:4242});
    try{expected=fingerprint(old.root);}finally{old.dispose();}
  }finally{registerProfiledBuilders({t14_x:buildT14X});}
  const tank=createTank('t14_x',null,{quality,geometryReceipt:true,proceduralOnly:true,camoSeed:4242});
  try{
    assert.equal(fingerprint(tank.root),expected,'binding preserves every visible source triangle');
    const hull=tank.root.getObjectByName('hull'),turret=tank.root.getObjectByName('turret');
    const permanent=[hull,turret].map(m=>m.geometry.attributes.position.array.slice());
    for(const name of ['glacis_era_L','glacis_era_R','skirt_era_L','skirt_era_R']){
      assert.equal(tank.stripEra(name),true,`${name}: actual existing panels deplete`);
    }
    for(const [i,m]of[hull,turret].entries())assert.deepEqual(m.geometry.attributes.position.array,permanent[i],
      'depleting every ERA zone never removes permanent load-bearing skin');
    assert.ok(Math.abs(ray(hull,[0,4,3.8],[0,-1,0]).y-1.2235)<.00001,'closed source bow survives spent cassette bank');
    for(const side of [-1,1])assert.ok(Math.abs(ray(hull,[side*3,.8,0],[-side,0,0]).x-side)<.00001,
      'permanent inner side wall remains closed behind removed skirts');
    assert.equal(tank.resetEra(),true);
    assert.equal(fingerprint(tank.root),expected,'round reset restores exact source triangle multiset');
  }finally{tank.dispose();}
}
console.log('t14XEraBinding: exact source triangle invariance and closed permanent bow/sides after all four zones deplete pass high/low');
