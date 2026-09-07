import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {createTank as createPlayableTank} from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildChallenger1X as photoDraft} from './challenger1XPhotoDraft.ts';
import {buildChallenger1X as supplied} from './challenger1X.ts';
import {TANK_SPECS} from '../specs.ts';
// Historical photo fittings only; never current supplied-file acceptance.
function createTank(...args) {
 const armor=TANK_SPECS.challenger1_x.armor;
 const saved={turret:armor.turretPivot,gun:armor.gunPivot};
 // Exact historical dirt-UV frame is part of the immutable buffer receipt;
 // the new supplied model's source joints must not rewrite that old fixture.
 armor.turretPivot=[0,1.70,.54];armor.gunPivot=[0,.40,1.15];
 registerProfiledBuilders({challenger1_x:photoDraft});
 try{return createPlayableTank(...args);}
 finally{armor.turretPivot=saved.turret;armor.gunPivot=saved.gun;registerProfiledBuilders({challenger1_x:supplied});}
}

// These are pre-change native buffers, not a source metrology claim. They
// protect the load-bearing armor, gun and exact populated track courses.
const UNCHANGED = {
 gearTrackPads:'11a5898aad8844476b83c0fefe831da226a395c9b7d39da45de9fd21c771c50f',
 gearTrackPadsSimplified:'9427abdab14b8406f8a5319b317a772bad03e172e292d806eb453eb1218ec881',
 hull:'f79e51cdbc58bd075522a18b3a184652b257668618294180f7a17a2fb1878eb5',
 gun:'f31773814e430d60eae149c0b6e7e227e3b714d495d37ff14b12efaa94e0abac',
 gunDark:'83839050dccabbfffa939a1e91202abcce452bba69ebc309e08272f33764990b',
 gunMount:'2f33243dec650d58ed5dfc1a1c4602f335be1e50778106b42a1261a299ad5a4a',
 turret:'c0f4a5a0118491ae100cc5c92c2a26bd4d0d12863aafcd96624762cd4e67c8d4',
};
function fingerprint(m) {
 const h=crypto.createHash('sha256');
 for(const key of Object.keys(m.geometry.attributes).sort())h.update(new Uint8Array(m.geometry.attributes[key].array.buffer));
 if(m.geometry.index)h.update(new Uint8Array(m.geometry.index.array.buffer));
 if(m.instanceMatrix)h.update(new Uint8Array(m.instanceMatrix.array.buffer));
 return h.update(JSON.stringify(m.matrixWorld.elements)).digest('hex');
}
const near=(a,b,e,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,`${label}: ${a} vs ${b}`);
for(const quality of ['high','low']) {
 const tank=createTank('challenger1_x',null,{quality,geometryReceipt:true,batchStatic:false,proceduralOnly:true});
 try {
  tank.root.updateMatrixWorld(true);const meshes=[];
  tank.root.traverse(m=>{if(m.isMesh&&!m.name.startsWith('procShadow_')&&!m.userData.vehicleMarking)meshes.push(m);});
  const cast=(p,d,far=10,parts=meshes)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(parts,false)[0];
  const hull=meshes.filter(m=>m.name==='hull');
  const detail=meshes.filter(m=>m.name==='hullDetail'),rubber=meshes.filter(m=>m.name==='hullDark');
  for(const [name,hash]of Object.entries(UNCHANGED)) {
   const mesh=meshes.find(m=>m.name===name);assert.ok(mesh,`${quality}: real ${name} exists`);
   assert.equal(fingerprint(mesh),hash,`${quality}: ${name} buffers and world frame are unchanged`);
  }
  for(const side of [-1,1]) {
   const x=side*1.382;
   // Drawing-led crown values verify a physically folded thin sheet. They
   // are deterministic construction estimates, not falsely measured mm data.
   for(const [z,y]of[[3.72,1.337],[3.91,1.312],[4.055,1.285],[4.145,1.244]])
    near(cast([x,2,z],[0,-1,0])?.point.y,y,.00001,'bent longitudinal cap crown');
   near(cast([x+side*.326,2,3.91],[0,-1,0])?.point.y,1.29,.00001,'rounded outer cap crossfall');
   assert.ok(!cast([x+side*.340,1.035,4.25],[0,0,-1],.12),'rounded lower flap corner is real air');
   near(cast([x,1.05,4.25],[0,0,-1],.12)?.point.z,4.191,.00001,'rubber center remains a real hanging sheet');
   const rootTop=cast([x,2,3.30],[0,-1,0],2,detail)?.point.y;
   near(rootTop,1.405,.00001,'cap retains unchanged aft receiving station');
   const rootBottom=cast([x,1.30,3.30],[0,1,0],.2,detail)?.point.y;
   const receiver=cast([x,2,3.30],[0,-1,0],2,hull)?.point.y;
   assert.ok(receiver-rootBottom>.035,'actual rear sheet root overlaps permanent shoulder');
   for(const dx of [0,side*.326]) {
    const capBottom=cast([x+dx,1,4.18],[0,1,0],.4,detail)?.point.y;
    const flapTop=cast([x+dx,2,4.18],[0,-1,0],1,rubber)?.point.y;
    assert.ok(flapTop-capBottom>.02,'hanging rubber engages bent steel crown, not a floated panel');
   }
   // The old forgings were behind Z4.13; the new two roots are actually
   // inside that wall and both exposed limbs remain in front of it.
   for(const dx of [-.055,.055]) {
    const hit=cast([side*.77+dx,1.10,4.30],[0,0,-1]);
    assert.equal(hit?.object.name,'hullDetail','both hook limbs visible before armor');
    near(hit?.point.z,4.193,.00001,'exposed forging stays within original nose envelope');
    near(cast([side*.77+dx,1.10,4.30],[0,0,-1],1,hull)?.point.z,4.13,.00001,'permanent toe plate unchanged');
    const back=cast([side*.77+dx,1.10,4.05],[0,0,1],.10,meshes.filter(m=>m.name==='hullDetail'));
    near(back?.point.z,4.112,.00001,'hook root has 18 mm positive plate engagement');
   }
   near(cast([side*.77,1.10,4.30],[0,0,-1])?.point.z,4.13,.00001,'real open hook throat sees retained armor');
   assert.ok(!cast([side*.77,1.10,4.194],[0,0,-1],.055),'hook throat is not a painted solid disk');
  }
  const fixed=meshes.filter(m=>['hull','hullDetail','hullDark'].includes(m.name)).map(m=>[m,m.matrixWorld.clone()]);
  tank.root.getObjectByName('rig_turret').rotation.y=.8;
  tank.root.getObjectByName('rig_gun').rotation.x=.2;tank.root.updateMatrixWorld(true);
  for(const [m,matrix]of fixed)assert.ok(m.matrixWorld.equals(matrix),'permanent front fittings do not follow turret/pitch');
 }finally{tank.dispose();}
}
console.log('challenger1XFrontFittings.selftest: actual high/low folded caps, open rooted hooks, protected armor/gun/gear buffers passed');
