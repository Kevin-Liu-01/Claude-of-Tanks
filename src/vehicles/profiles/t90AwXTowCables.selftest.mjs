import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addT90AWTowCables} from './t90AwXTowCables.ts';
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs source ${b} ±${t}`);
function hit(ms,p,d,far=1){return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(ms,false)[0];}
function interior(mesh,p,axis){const a=hit([mesh],p,axis,.15),b=hit([mesh],p,axis.map(n=>-n),.15);return Boolean(a&&b&&a.distance>0&&b.distance>0);}
function sourceRays(ms){
  // Independently sampled against the complete AW OBJ in its fixed frame.
  for(const[x,y,z]of [[0,1.41091,-3.2568482550960525],[0,1.33939,-3.2369504553240804],[.8,1.43431,-3.2500467034661846],
    [-1.107,1.007,-3.3476121130238905],[1.001,1.008,-3.3798133194161126],[-1.04,.78856,-3.286270311852719],
    [.88,.74947,-3.237376910183974],[-.96,1.27390,-3.3054278064649516]])
    near(hit(ms,[x,y,-4],[0,0,1],1.1)?.point.z,z,.004,'complete AW source cable first surface');
  for(const[x,y,z]of [[.5885,.83445,-3.153684028912189],[.7885,.73445,-3.2076684894989547],
    [.7885,.75445,-3.2092327293770913],[.8185,.75445,-3.2063659043686754],[-.83845,.7547,-3.178393313934662],
    [-.80845,.7347,-3.1703611617100487],[-.80845,.7547,-3.1774541000603524],
    [-.60845,.8347,-3.1412250570001787],[-.57845,.8347,-3.14234157441419]])
    near(hit(ms,[x,y,-4],[0,0,1],1.1)?.point.z,z,.0045,'AW source thin eye head and separate neck');
  for(const[x,y,z]of [[.6885,.83445,-2.9444215977805324],[-.70845,.8347,-2.9448302136005515]]){
    assert.equal(Boolean(hit(ms,[x,y,-3.4],[0,0,1],.4)),false,'true terminal eye aperture is not a disk');
    near(hit(ms,[x,y,-3.4],[0,0,1],.6)?.point.z,z,.001,'unchanged AW hull behind eye');
  }
  for(const x of [.64065,-.6528])for(const[y,z]of [[.8136,-3.0879442802033177],[.8336,-3.103080982016528]])
    near(hit(ms,[x,y,-3.4],[0,0,1],.6)?.point.z,z,.001,'actual J-shaped hook source plane');
  for(const x of [-1,0,1])for(const y of [.78,.90,1.05,1.18])
    assert.equal(Boolean(hit(ms,[x,y,-3.7],[0,0,1],.25)),false,'source air around suspended cables');
}
function helperContacts(){
  const parts=[],material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  addT90AWTowCables({addEquipment(_b,g,x=0,y=0,z=0){g.translate(x,y,z);const m=new THREE.Mesh(g,material);m.updateMatrixWorld();parts.push(m);}});
  for(const p of [[-.820,.727,-3.138],[.779,.742,-3.163],[1.33,1.448,-3.198],[-1.293,1.448,-3.143],
    [.62265,.943,-3.132],[-.65233,.9315,-3.1105],[-.65233,.929,-3.121]])
    assert.ok(parts.filter(m=>interior(m,p,[0,0,1])).length>=2,`actual terminal/bearing ${p} engages two physical closed parts`);
  for(const m of parts)m.geometry.dispose();material.dispose();
}
helperContacts();
for(const quality of ['high','low']){
  const t=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{t.root.updateMatrixWorld(true);const ms=[];t.root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)ms.push(m);});sourceRays(ms);
    const hull=t.root.getObjectByName('hull'),detail=t.root.getObjectByName('hullDetail');
    const previous=[hull.material.side,detail.material.side];hull.material.side=detail.material.side=THREE.DoubleSide;
    for(const p of [[1.33,1.301,-3.10],[-1.293,1.301,-3.10]])for(const m of [hull,detail])
      assert.ok(interior(m,p,[0,1,0]),`upper cable retainer actually seats in AW fender ${p}/${m.name}`);
    [hull.material.side,detail.material.side]=previous;
  }finally{t.dispose();}
}
console.log('t90AwXTowCables: actual high/low 23 source rays, hollow eye and suspended-line air, separate hook/neck contacts and native fender seating pass');
