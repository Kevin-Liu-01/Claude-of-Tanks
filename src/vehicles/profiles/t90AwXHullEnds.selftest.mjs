import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs independent source ${b} ±${t}`);
function visibleMeshes(t){const meshes=[];t.root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)meshes.push(m);});return meshes;}
function top(meshes,x,z){return new THREE.Raycaster(new THREE.Vector3(x,1.8,z),new THREE.Vector3(0,-1,0),0,1).intersectObjects(meshes,false)[0];}
function exhaust(meshes){
  const field=[[1.1,1.5285588785654],[1.2,1.5370999574661],[1.5,1.5370999574661],
    [1.64,1.4512602414255],[1.70,1.4441384958734],[1.75,1.4254324791911],[1.79,1.4039800848366],[1.83,1.3397688907152]];
  for(const z of [-1.95,-1.8,-1.65,-1.45])for(const[x,y]of field){
    const h=top(meshes,x,z);near(h?.point.y,y,.001,'source exhaust cap and separate folded upper louvre');
    assert.ok(h.face.normal.y>0,'exhaust crown is an outward physical face');
  }
  for(const[x,z]of [[1.79,-2.1],[1.79,-1.20]]){
    const r=new THREE.Raycaster(new THREE.Vector3(x,1.52,z),new THREE.Vector3(0,-1,0),0,.18);
    assert.equal(r.intersectObjects(meshes,false).length,0,'no formerly flat outer deck in source air');
  }
}
function cradles(meshes){
  for(const x of [.35,.365,.38,.80])for(const[z,y]of [[-3.75,1.2561910561861],[-3.65,1.2173564802429],
    [-3.55,1.2141703952786],[-3.45,1.2411110358537],[-3.35,1.3147844502637]])
    near(top(meshes,x,z)?.point.y,y,.0001,'actual 50.8 mm flange across its width and bent longitudinal sections');
  for(const[z,y]of [[-3.75,1.2644187476994],[-3.65,1.2212544265618],[-3.55,1.2168065930292],
    [-3.45,1.2403924491839],[-3.35,1.3108389486376]])
    near(top(meshes,-.8,z)?.point.y,y,.001,'independent left-outboard cradle offset');
  for(const x of [-.60,0,.6]){
    const r=new THREE.Raycaster(new THREE.Vector3(x,1.5,-3.55),new THREE.Vector3(0,-1,0),0,.5);
    assert.equal(r.intersectObjects(meshes,false).length,0,'empty drum space remains genuinely open between cradles');
  }
}
function skirts(meshes){
  for(const[z,y,x]of [[2.29245,1.1,1.7721612343412],[2.29245,.9,1.7723059138838],
    [-.45925,1.1,1.7778479685389],[-.45925,.9,1.7787763208285]]){
    const h=new THREE.Raycaster(new THREE.Vector3(2,y,z),new THREE.Vector3(-1,0,0),0,.3).intersectObjects(meshes,false)[0];
    near(h?.point.x,x,.003,'source bowed panel and independently folded attachment course');
  }
  for(const[z,y,x]of [[-2.06345,1.1,-1.7816256073065],[-2.06345,.9,-1.7821331846594]]){
    const h=new THREE.Raycaster(new THREE.Vector3(-2,y,z),new THREE.Vector3(1,0,0),0,.3).intersectObjects(meshes,false)[0];
    near(h?.point.x,x,.006,'source shallow left-rear fold, simplified transverse crease');
  }
  const gap=new THREE.Raycaster(new THREE.Vector3(-2,.80,-2.4),new THREE.Vector3(1,0,0),0,.30);
  assert.equal(gap.intersectObjects(meshes,false).length,0,'left rear rising source hem is not a low rectangular curtain');
}
function rootEngagement(t){
  const hull=t.root.getObjectByName('hull'),detail=t.root.getObjectByName('hullDetail');
  for(const x of [-.79865,-.3735,.36355,.80275]){
    const dy=x<-.7?.0029:0,dz=x<-.7?.0078:0;
    const p=new THREE.Vector3(x,1.17+dy,-3.15+dz);
    for(const mesh of [hull,detail]){
      const down=new THREE.Raycaster(p,new THREE.Vector3(0,-1,0),0,.05).intersectObject(mesh,false);
      const up=new THREE.Raycaster(p,new THREE.Vector3(0,1,0),0,.20).intersectObject(mesh,false);
      // Backface-insensitive interior membership, not an AABB-only seat claim.
      const material=mesh.material,side=material.side;material.side=THREE.DoubleSide;
      const lo=new THREE.Raycaster(p,new THREE.Vector3(0,-1,0),0,.05).intersectObject(mesh,false)[0];
      const hi=new THREE.Raycaster(p,new THREE.Vector3(0,1,0),0,.20).intersectObject(mesh,false)[0];material.side=side;
      assert.ok(lo&&hi&&lo.distance>0&&hi.distance>0,'actual cradle root shares finite interior with its permanent rear hull carrier');
      assert.equal(down.length+up.length,0,'interior witness faces are outward-wound');
    }
  }
}
for(const quality of ['high','low']){
  const t=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{t.root.updateMatrixWorld(true);const meshes=visibleMeshes(t);exhaust(meshes);cradles(meshes);skirts(meshes);rootEngagement(t);}
  finally{t.dispose();}
}
console.log('t90AwXHullEnds: high/low source exhaust crowns/outer-deck air, four empty-cradle flanges and real hull-root engagement pass');
