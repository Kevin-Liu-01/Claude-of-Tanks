import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs source ${b} ±${t}`);
function sensor(mesh){
  for(const[y,back,front]of [[2.3,-.8407623615,-.7804975663],[2.5,-.8486330350,-.7721269290],
    [2.56,-.8545299684,-.7659928487],[2.62,-.9039299488,-.7173299789],[2.7,-.8653299809,-.7554299831],
    [2.8,-.8653299809,-.7554299831],[2.84,-.8472299576,-.7740299702],[2.90,-.8526300105,-.7681299542],
    [2.94,-.8393552000,-.7816933948],[2.975,-.8296300173,-.7916300297],[3.01,-.8682299852,-.7525299788],
    [3.04,-.8545299768,-.7666299343]])for(const[side,z]of [[-1,back],[1,front]]){
    const r=new THREE.Raycaster(new THREE.Vector3(.32815,y,side<0?-1.1:-.5),new THREE.Vector3(0,0,-side),0,.4);
    near(r.intersectObject(mesh,false)[0]?.point.z,z,.005,'source sensor segmented body and tapered neck; fine facets approximated');
  }
  for(const x of [.314,.342]){
    const r=new THREE.Raycaster(new THREE.Vector3(x,3.2,-.81),new THREE.Vector3(0,-1,0),0,.3);
    near(r.intersectObject(mesh,false)[0]?.point.y,3.0493800640,.000002,'source upper cap height');
  }
  assert.equal(new THREE.Raycaster(new THREE.Vector3(.32815,2.74,-.9),new THREE.Vector3(1,0,0),0,.1).intersectObject(mesh,false).length,0,
    'broad base ledge does not fill upper sensor air');
}
function sideArmor(t){
  const armor=t.root.getObjectByName('hullExternalArmor');
  for(const side of [-1,1])for(const[z,y,outer,inner,rim]of [[1.28103,1.17891,1.90889,1.83349,1.87009],
    [1.95968,1.13215,1.90764,1.83364,1.86874],[2.63516,1.07866,1.90670,1.83130,1.86780]]){
    const shift=side<0?0:-.0019;
    let r=new THREE.Raycaster(new THREE.Vector3(side*2.2,y,z),new THREE.Vector3(-side,0,0),0,.5);
    near(r.intersectObject(armor,false)[0]?.point.x,side*(outer+shift),.000002,'exact source outer cassette plane');
    r=new THREE.Raycaster(new THREE.Vector3(side*1.8,y,z),new THREE.Vector3(side,0,0),0,.2);
    near(r.intersectObject(armor,false)[0]?.point.x,side*(inner+shift),.000002,'actual raised inner pad, not a solid full-depth block');
    r.ray.origin.y=y-.23;
    near(r.intersectObject(armor,false)[0]?.point.x,side*(rim+shift),.000002,'shallower source perimeter back');
  }
  for(const side of [-1,1])for(const z of [.55,1.62,2.3]){
    const r=new THREE.Raycaster(new THREE.Vector3(side*2.1,1.18,z),new THREE.Vector3(-side,0,0),0,.25);
    assert.equal(r.intersectObject(armor,false).length,0,'source three-cassette course retains its real separated gaps');
  }
  const fixed=t.root.getObjectByName('hullDetail').geometry.attributes.position.array.slice();
  for(const side of ['L','R']){
    assert.equal(t.stripEra(`skirt_era_${side}`),true);
    assert.deepEqual(t.root.getObjectByName('hullDetail').geometry.attributes.position.array,fixed,'narrow hinge carriers remain attached/permanent after cassette depletion');
  }
  t.resetEra();
}
// The owner requested the canonical Shtora emitter instead of the source's
// painted rectangular face. Its actual aperture/rig are covered by shtora's
// dedicated test; unrelated source cases/carriers retain their exact oracle.
function cases(mesh){
  for(const[x,z,y]of [[1,-.8,2.0658302232],[1.2,-.8,2.0863284269],[1.4,-.6,2.0877798410],
    [1.5,-.55,2.0882597220],[-.9,-.85,2.0634799004],[-1.1,-.75,2.0856647460],[-1.25,-.65,2.0866237938],[-1.35,-.55,2.0584301512]]){
    const h=new THREE.Raycaster(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0),0,2).intersectObject(mesh,false)[0];
    near(h?.point.y,y,.0002,'separate source case roof and proud inclined lid');
  }
  for(const[x,z]of [[-.6,-1.2798101953],[0,-1.2798101953],[.6,-1.2798101953],[1.05,-1.2787536133]]){
    const h=new THREE.Raycaster(new THREE.Vector3(x,1.6671,-1.5),new THREE.Vector3(0,0,1),0,.5).intersectObject(mesh,false)[0];
    near(h?.point.z,z,.0012,'separate transverse tubular carrier, fine right-end fitting simplified');
  }
}
for(const quality of ['high','low']){
  const t=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{t.root.updateMatrixWorld(true);const mesh=t.root.getObjectByName('turretDetail');sensor(mesh);sideArmor(t);cases(mesh);}
  finally{t.dispose();}
}
console.log('t90AwXDetails: high/low source sensor crowns/sections/air and six exact stepped side cassettes pass');
