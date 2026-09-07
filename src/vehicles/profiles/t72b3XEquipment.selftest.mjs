import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} versus independent source ${b} ±${t}`);
function opaqueMeshes(root){
  const meshes=[];
  root.traverseVisible(m=>{
    if(!m.isMesh||m.userData.shadowOnly)return;
    const mats=Array.isArray(m.material)?m.material:[m.material];
    if(mats.some(v=>v.visible&&!v.transparent&&v.colorWrite!==false))meshes.push(m);
  });return meshes;
}
function checkCases(meshes){
  const top=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0),0,5).intersectObjects(meshes,false)[0];
  for(const side of [-1,1]){
    near(top(side*1.6,-.5)?.point.y,2.0467003,.0002,'source side-case horizontal roof');
    for(const z of [-.8,-.5])near(top(side*1.4,z)?.point.y,2.0615003,.0002,'two separate small yawed case lids');
    for(const z of [-1.1,-.8,-.2])assert.ok(top(side*1.6,z)?.point.y<1.5,'real tapered case footprint leaves turret air');
  }
  near(top(0,-1.5)?.point.y,2.1550715279,.002,'separate thin central case lid');
  const back=new THREE.Raycaster(new THREE.Vector3(0,1.8,-2),new THREE.Vector3(0,0,1),0,1).intersectObjects(meshes,false)[0];
  // Source's inclined central rear wall, not the draft short hanging box.
  near(back?.point.z,(.8108050267+.3969670955*1.8)/(-.9178328416)+.172150015831,.0005,'source inclined low rear case wall');
}
function checkRoof(meshes){
  const top=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0),0,5).intersectObjects(meshes,false)[0];
  for(const z of [-.96,-.88])near(top(-.55,z)?.point.y,2.8327637126,.0002,'actual short beveled high MG boss');
  near(top(-.614,-.75)?.point.y,2.4321005344,.0002,'open fork reaches its true low crossmember');
  assert.ok(top(-.55,-1.24)?.point.y<1.5,'no false long high MG crossbar');
  near(top(-.55,-1.12)?.point.y,2.6706303024,.001,'source inclined ammunition-box lid');
  for(const z of [.05,.14])near(top(-.614,z)?.point.y,2.7282614466,.0001,'source octagonal commander optic crown');
  for(const [x,z,y]of [[.5,-.04,2.2053003311],[.8,-.04,2.4014003277],[.5,.1,2.2142002583],[.8,.1,2.4014003277],
    [.5,.5,2.1425001621],[.5,.75,2.1417002678]])near(top(x,z)?.point.y,y,.0002,'independent stepped Sosna courses');
  for(const [x,z,y]of [[1.2,-.2,1.9464122757],[-1.2,-.2,1.8158901454],[.8,.3,2.0826894181],[.8,.5,2.0143515143]]){
    near(top(x,z)?.point.y,y,.020,'source cast transverse shoulder, analytic smooth approximation');
  }
}
function checkDrumAir(meshes){
  for(const x of [0,-.015,.015,-.05,.05,-.10,.10])for(const z of [-3.56,-3.7,-3.3]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0),0,5);
    assert.equal(ray.intersectObjects(meshes,false).length,0,'real air between separate X-axis fuel drums and retaining hoops');
  }
  const top=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0),0,5).intersectObjects(meshes,false)[0];
  for(const x of [-1.04,-.6,-.2,.2,.6,1.04])near(top(x,-3.534)?.point.y,1.754087,.0002,'source twelve-sided drum shell, separate from tall plumbing');
  for(const x of [-.877,-.287,.3028,.8929])near(top(x,-3.534)?.point.y,1.763587,.0002,'source wide retaining band top');
  for(const x of [-.75,-.435,.44,.756])near(top(x,-3.534)?.point.y,1.783566,.0002,'source separate narrow raised shell ring');
  for(const[x,y]of [[-.10,1.529756537],[-.05,1.518888006],[0,1.508019475],[.05,1.514925980],[.10,1.525787452]]){
    near(top(x,-3.18)?.point.y,y,.0005,'real low sloping inter-drum pipe');
  }
}
function checkDrumAttachment(tank){
  const hull=tank.root.getObjectByName('hull'),equipment=tank.root.getObjectByName('hullDetail');
  for(const x of [-.8955,-.2951,.3132,.9136]){
    // The independently closed small tongue spans the open source root into
    // the native transom. An actual point is inside both meshes, not just AABBs.
    const insideY=1.17,z=-3.124;
    for(const mesh of [hull,equipment]){
      const down=new THREE.Raycaster(new THREE.Vector3(x,1.3,z),new THREE.Vector3(0,-1,0),0,.3).intersectObject(mesh,false)[0];
      const up=new THREE.Raycaster(new THREE.Vector3(x,1.05,z),new THREE.Vector3(0,1,0),0,.3).intersectObject(mesh,false)[0];
      assert.ok(down?.point.y>insideY&&up?.point.y<insideY,'positive actual tongue-to-transom interior contact');
    }
  }
}
function checkAntennas(meshes){
  // Held-out source surface depths between authored axis/radius stations.
  // These constrain physical bend, taper and both faces independently of masks.
  for(const[x,y,back,front]of [[-.2274,2.4,-1.0329447072,-1.0146728478],[-.2274,2.8,-1.0392605281,-1.0223420939],
    [-.2274,3.1,-1.0475002147,-1.0318698014],[-.2274,3.5,-1.0657915200,-1.0524477225],
    [-.2274,3.8,-1.0854633166,-1.0748834154],[-.2274,4.1,-1.1097062404,-1.1026956264],
    [1.0405,2.5,-.1878204668,-.1693567133],[1.0405,3,-.1870904668,-.1700346850],
    [1.0405,3.5,-.1951052908,-.1797371436],[1.0405,4,-.2107636461,-.1973275865],
    [1.0405,4.5,-.2352976332,-.2244577626],[1.0405,5.2,-.2791499482,-.2726559155]]){
    for(const[side,depth]of [[-1,back],[1,front]]){
      const h=new THREE.Raycaster(new THREE.Vector3(x,y,side*3),new THREE.Vector3(0,0,-side),0,6).intersectObjects(meshes,false)[0];
      near(h?.point.z,depth,.00002,'actual source bent/tapered whip surface');
    }
  }
  for(const[y,back,front]of [[2.4,-.9478368716,-.8890112230],[2.48,-.9833179284,-.8535242105],
    [2.55,-.9733948810,-.8634572307],[2.63,-.9462880460,-.8905173683],
    [2.67,-.9365939206,-.9002283482],[2.73,-.9286944028,-.9081529545],[2.77,-.9443156616,-.8924814913]]){
    for(const[side,depth]of [[-1,back],[1,front]]){
      const h=new THREE.Raycaster(new THREE.Vector3(.4146,y,side*3),new THREE.Vector3(0,0,-side),0,6).intersectObjects(meshes,false)[0];
      near(h?.point.z,depth,.0002,'actual compact antenna separate stepped housings');
    }
  }
}
for(const quality of ['high','low']){
  const tank=createTank('t72b3_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try{tank.root.updateMatrixWorld(true);const meshes=opaqueMeshes(tank.root);checkCases(meshes);checkRoof(meshes);checkDrumAir(meshes);checkDrumAttachment(tank);checkAntennas(meshes);}
  finally{tank.dispose();}
}
console.log('t72b3XEquipment: actual high/low source case tapers, inclined rear wall, open fork, short MG boss, optic courses and separate drum air pass');
