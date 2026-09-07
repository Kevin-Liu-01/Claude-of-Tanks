import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildStrv122X} from './strv122XPhotoDraft.ts';

// Preserve the photo-draft contract without qualifying the supplied-file ID.
registerProfiledBuilders({strv122_x:buildStrv122X});

// These are photo-led assembly/air contracts, not millimetric measurements
// invented from a photograph. Primary FMV envelope tests remain separate.
const near=(a,b,eps,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=eps,
  `${label}: ${a} versus ${b} ± ${eps}`);
function cast(meshes,origin,direction,far=20,matrix=new THREE.Matrix4()) {
  return new THREE.Raycaster(new THREE.Vector3(...origin).applyMatrix4(matrix),
    new THREE.Vector3(...direction).transformDirection(matrix),0,far).intersectObjects(meshes,false)[0];
}
function roofAir(meshes,turret) {
  const move=turret.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0,-1.61,-.61));
  for(const x of [.355,.565]) {
    assert.ok(!cast(meshes,[x,2.51,1.69],[0,0,-1],.14,move),
      'each rounded hood has a real open approach, not a dark painted box');
    const back=cast(meshes,[x,2.51,1.9],[0,0,-1],1,move);
    assert.equal(back?.object.name,'turretDetail','the opening terminates at supported rear stock');
    near(back?.distance,.377,.0001,'hood back lies behind the empty mouth');
    const crown=cast(meshes,[x,3,1.60],[0,-1,0],1,move);
    assert.equal(crown?.object.name,'turretDetail','curved solid hood crown surrounds its air');
    near(crown?.distance,.43465,.001,'seated hood crown');
  }
  for(const [x,z] of [[.63,-.36],[-.58,-.19]]) {
    assert.ok(!cast(meshes,[x,2.626,z+.26],[0,0,-1],.20,move),'hatch handle center stays open');
    assert.equal(cast(meshes,[x,2.651,z+.26],[0,0,-1],.20,move)?.object.name,
      'turretDetail','open handle retains its actual crossbar');
  }
}
for(const quality of ['high','low']) {
  const tank=createTank('strv122_x',null,{proceduralOnly:true,quality,geometryReceipt:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const meshes=[];tank.root.traverse(m=>{if(m.isMesh&&!m.name.startsWith('procShadow_')&&!m.userData.vehicleMarking)meshes.push(m);});
    const hull=tank.root.getObjectByName('hull'),turret=tank.root.getObjectByName('rig_turret');
    const gun=tank.root.getObjectByName('rig_gun'),mount=tank.root.getObjectByName('gunMount');
    assert.equal(mount.parent,gun,'entire rounded boot and cast support belong to gun pitch');
    for(const side of [-1,1]) {
      const heights=[1.1,1.35,1.6,1.8].map(x=>cast([hull],[side*x,3,2.9],[0,-1,0],3)?.point.y);
      for(const y of heights)assert.ok(y>1.48&&y<1.52,'shared shoulder/glacis section has no missing span or slab step');
      for(let n=1;n<heights.length;n++)assert.ok(Math.abs(heights[n]-heights[n-1])<.018,
        'permanent roof transitions continuously across each shoulder');
      assert.ok(!cast(meshes,[side*.83,.98,4.2],[0,0,-1],.30),'tow eye has true front-facing air');
      const rim=cast(meshes,[side*.907,.98,4.2],[0,0,-1],.5);
      assert.equal(rim?.object.name,'hullDetail','forward tow-eye ring survives around its open center');
      near(rim?.point.z,3.947,.001,'tow eye seats in front of the bow, not behind its armor');
      const plate=cast([hull],[side*1.672,2,3.47],[0,-1,0],2);
      assert.ok(plate?.point.y>1.32,'marker housing overlaps permanent shoulder rather than floating');
      assert.ok(!cast(meshes,[side*1.42,1.19,2.86],[0,1,0],.10),
        'new permanent shoulders do not plug the track-to-guard bay');
    }
    roofAir(meshes,turret);
    for(const yaw of [-.8,.7])for(const pitch of [-.12,.25]) {
      turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);roofAir(meshes,turret);
      const move=gun.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0,-2.055,-1.63));
      const boot=cast([mount],[.4,2.055,2.49],[-1,0,0],.30,move);
      assert.ok(boot&&boot.distance>.14&&boot.distance<.18,'rounded gun boot stays seated through pitch and yaw');
    }
  }finally{tank.dispose();}
}
console.log('strv122XSurfaceAssembly.selftest: high/low continuous shoulders, open cowls/handles/tow eyes and posed rounded boot passed');
