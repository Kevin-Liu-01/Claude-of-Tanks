import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const close=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,
  `${label}: ${a}, expected ${b}`);
for(const quality of ['high','low']) {
  const tank=createTank('amx40_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try {
    tank.root.updateMatrixWorld(true);
    const ray=(p,d,far=12)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObject(tank.root,true)[0];
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    const recoil=tank.root.getObjectByName('rig_recoil'),muzzle=tank.root.getObjectByName('rig_muzzle');
    const tire=tank.root.getObjectByName('gearRoadWheelTires');
    const disc=tank.root.getObjectByName('gearRoadWheelDiscs');
    const pressed=tank.root.getObjectByName('amx40WheelPressedFaces');
    const matrix=new THREE.Matrix4(),metalMatrix=new THREE.Matrix4();
    assert.equal(tire.count,12,'six source tire stations on each side');
    for(let i=0;i<tire.count;i++) {
      tire.getMatrixAt(i,matrix);pressed.getMatrixAt(i,metalMatrix);
      assert.deepEqual(matrix.toArray(),metalMatrix.toArray(),'pressed face belongs to its actual suspension wheel');
      const center=new THREE.Vector3().setFromMatrixPosition(matrix);
      const s=Math.sign(center.x),origin=new THREE.Vector3(s*2,center.y+.22,center.z);
      const direction=new THREE.Vector3(-s,0,0),r=new THREE.Raycaster(origin,direction,0,1);
      assert.equal(r.intersectObject(tire,false).length,0,'rubber is an annulus, not an opaque cap over the recessed disc');
      assert.ok(r.intersectObject(disc,false).length>0,'real painted metal remains behind the tire opening');
      r.set(new THREE.Vector3(s*2,center.y+.32,center.z),direction);
      assert.ok(r.intersectObject(tire,false).length>0,'rubber crown stays physically present');
      close(Math.abs(center.x),1.29715,1e-6,'source rubber center, not its inboard axle extent');
      close(center.y,.41530,1e-6,'source wheel center height');
    }
    close(turret.position.y,1.56289,1e-6,'measured source bearing height');
    close(turret.position.z,.16819,1e-6,'measured source bearing station');
    close(muzzle.getWorldPosition(new THREE.Vector3()).z,6.6028,1e-6,'metal tube endpoint');
    for(const x of[-.4,0,.4])for(const[z,y]of[[1.21999,2.30659],[1.42699,2.24359],[1.49,2.23871]]) {
      close(ray([x,3,z],[0,-1,0])?.point.y,y,.001,'source thin front roof apron');
    }
    assert.ok(!ray([0,2.21,1.49],[1,0,0],.20),
      'real space under the thin apron and above the pitching mantlet');
    for(const[dx,dy]of[[0,0],[.035,0],[-.035,0],[0,.035],[0,-.035]]) {
      const p=[-.00005+dx,1.94827+dy,6.70];
      close(ray(p,[0,0,-1])?.point.z,5.3677,.00002,'source bore floor with the native 1.2mm seated dark lining');
      assert.ok(!ray(p,[0,0,-1],1.30),'source 1.2363m bore recess has continuous physical air');
    }
    for(const[z,x]of[[3.20,.12370],[4.20,.11370],[5.20,.10650],[5.60,.10150],
      [6.20,.10370],[6.53,.07475],[6.60,.07445]]) {
      close(ray([.4,1.94827,z],[-1,0,0])?.point.x,x,.0015,'held-out source tube section, including the narrow muzzle');
    }
    // The source has two distinct round mantlet optics, not the previous
    // broad rectangular window whose centre was actually solid cast armor.
    for(const[x,y,front,glass]of[[-.8269,1.96837,2.2171,2.1258],
      [-.33165,1.89192,1.9793,1.8877],
      [-.5584,2.787,.10585,.045905]]) {
      const hit=ray([x,y,front+.06],[0,0,-1]);
      assert.ok(hit?.object.name.endsWith('Glass'),'first surface must be glazing behind the reveal');
      close(hit.point.z,glass,.003,'recessed glazing position');
      assert.equal(ray([x,y,front+.03],[0,0,-1],.04),undefined,'no hidden front-fill plane');
    }
    close(ray([-.5885,1.93962,2.8],[0,0,-1])?.point.z,1.977516,.002,
      'held-out source solid armor between the two actual optics');
    for(const[x,z,y]of[[0,-1.8,3.11269],[.05,-1.8,2.86369],[.10,-1.8,2.615945]]) {
      close(ray([x,4,z],[0,-1,0])?.point.y,y,.006,'source tapered meteo mast, not a square panoramic sight');
    }
    assert.ok(!ray([.10,3.0,-1.8],[0,0,1],.10),'air beside the narrower upper mast remains open');
    close(ray([-.5589,2.83,-.38],[0,-1,0])?.point.y,2.7436,.002,'recessed hatch below guard rim');
    assert.equal(ray([-.5589,2.83,-.38],[0,-1,0],.06),undefined,'cupola well remains open');
    for(const yaw of[-.7,0,.7])for(const pitch of[-.14,.21]) {
      turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
      const before=muzzle.getWorldPosition(new THREE.Vector3());
      recoil.position.z=-.12;tank.root.updateMatrixWorld(true);
      close(before.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())),.12,1e-6,'pitched assembly recoils coherently');
      recoil.position.z=0;
    }
  } finally {tank.dispose();}
}
console.log('amx40X: actual high/low source-depth bore, stepped tube and mast, recessed optics, cupola air and pitched recoil pass; visual qualification separate');
