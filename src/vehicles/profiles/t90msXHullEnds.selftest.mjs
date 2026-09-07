import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addT90MSHullCages} from './t90msXHullCages.ts';
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs independent source ${b} ±${t}`);
function meshes(t){const out=[];t.root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)out.push(m);});return out;}
function hit(m,p,d,far=1){return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(m,false)[0];}
const top=(m,x,z)=>hit(m,[x,1.8,z],[0,-1,0]);
function rearCase(m){
  for(const x of [1.2,1.5])for(const z of [-3.6,-3.5,-2.8,-2.5,-2.2])
    near(top(m,x,z)?.point.y,1.46780002117157,.0002,'actual asymmetric source rear case crown');
  for(const x of [1.2,1.5])for(const z of [-3.3,-3.0])
    near(top(m,x,z)?.point.y,1.47950005531311,.0002,'source separate case lid');
  for(const x of [-1.5,-1.2])for(const z of [-3.6,-3.5])
    assert.equal(Boolean(top(m,x,z)),false,'no mirrored case or shelf in actual left-rear source air');
  for(const[x,z,y]of [[-1.5,-3.3,1.27460013204],[-1.2,-3.3,1.27545244094],[-1.5,-3,1.48462990464],
    [-1.2,-3,1.48479574033],[-1.5,-2.8,1.48542348707],[-1.2,-2.5,1.49037212679]])
    near(top(m,x,z)?.point.y,y,.004,'source exposed left rear course and separate inclined cover');
  for(const z of [-2.8,-2.6]){
    // Start above the unchanged native moving shoe envelope, not inside it.
    assert.equal(Boolean(hit(m,[1.4,1.25,z],[0,1,0],.03)),false,'source raised case underside retains return-course air');
    near(hit(m,[1.4,1.25,z],[0,1,0],.08)?.point.y,1.29690003395,.0002,'source high forward underside, not a deep solid box');
  }
  near(hit(m,[1.4,.8,-3.45],[0,1,0],.5)?.point.y,1.001416547243,.0002,'source inclined aft underside');
}
function cradleSurfaces(m){
  for(const x of [.35,.365,.38,.8])for(const[z,y]of [[-3.75,1.255363965768],[-3.65,1.217404794681],
    [-3.55,1.214212789989],[-3.45,1.241587747162],[-3.35,1.315604293962]])
    near(top(m,x,z)?.point.y,y,.0001,'MS independently measured 50.8 mm drum-bearing flange');
  for(const x of [-.60,0,.6])assert.equal(Boolean(hit(m,[x,1.5,-3.55],[0,-1,0],.5)),false,'real empty-drum standoff between narrow cradles');
}
function cageSurfaces(m){
  for(const side of [-1,1])for(const z of [-2.9,-2.4,-1.4])for(const y of [1.394,1.0715])
    near(hit(m,[side*2.1,y,z],[-side,0,0],.36)?.point.x,side<0?-1.87105000019:1.86524999142,.0002,'thin separate source cage rails');
  for(const side of [-1,1])for(const z of [-2.9,-2.4,-1.8,-1.4])for(const y of [1.04,1.10,1.16])
    assert.equal(Boolean(hit(m,[side*2.1,y,z],[-side,0,0],.21)),false,'actual air between cage rails is not opaque screen fill');
  for(const y of [1.2,1.264,1.136])assert.equal(Boolean(hit(m,[2.1,y,-1.7],[-1,0,0],.29)),false,'source right cage exhaust aperture stays open');
  for(const side of [-1,1]){
    near(hit(m,[side*2.1,1.22,-2.0586],[-side,0,0],.36)?.point.x,side*1.84765005,.0002,'width-setting post body is narrow above its toe');
    near(hit(m,[side*2.1,.98,-2.0586],[-side,0,0],.36)?.point.x,side<0?-1.88971307871:1.88896999796,.001,'source localized hinge toe sets the actual width');
    assert.equal(Boolean(hit(m,[side*2.1,1.22,-2.0586],[-side,0,0],.22)),false,'no tall bbox fill at the toe width');
  }
}
function actualAttachment(t){
  const hull=t.root.getObjectByName('hull'),detail=t.root.getObjectByName('hullDetail');
  for(const x of [-.7988,-.3735,.36355,.80275])for(const mesh of [hull,detail]){
    const p=[x,1.17+(x<-.7?.0029:0),-3.15+(x<-.7?.0078:0)],old=mesh.material.side;
    mesh.material.side=THREE.DoubleSide;
    const lo=hit([mesh],p,[0,-1,0],.06),hi=hit([mesh],p,[0,1,0],.20);mesh.material.side=old;
    assert.ok(lo&&hi&&lo.distance>0&&hi.distance>0,'four cradle roots share actual finite interior with the original hull carrier');
  }
  for(const mesh of [hull,detail]){
    const old=mesh.material.side;mesh.material.side=THREE.DoubleSide;
    const lo=hit([mesh],[1.03,1.32,-2.8],[0,-1,0],.7),hi=hit([mesh],[1.03,1.32,-2.8],[0,1,0],.3);mesh.material.side=old;
    assert.ok(lo&&hi,'source case engages its original hull shoulder rather than floating beside it');
  }
}
function cageBounds(){
  const geoms=[],P={addEquipment(_bucket,g,x=0,y=0,z=0){g.translate(x,y,z);geoms.push(g);}};
  addT90MSHullCages(P);const b=new THREE.Box3();
  for(const g of geoms){g.computeBoundingBox();b.union(g.boundingBox);g.dispose();}
  near(b.min.x,-1.89055001736,.000001,'actual left post-foot envelope');near(b.max.x,1.88964998722,.000001,'actual right post-foot envelope');
}
cageBounds();
for(const quality of ['high','low']){
  const t=createTank('t90ms_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{t.root.updateMatrixWorld(true);const m=meshes(t);rearCase(m);cradleSurfaces(m);cageSurfaces(m);actualAttachment(t);}
  finally{t.dispose();}
}
console.log('t90msXHullEnds: high/low source asymmetric case, exposed rear deck, MS cradle folds, thin cage rails/toes, actual air and physical hull engagements pass');
