import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
const v=a=>new THREE.Vector3(...a),X=-.3867,Y=2.765;
const ray=(object,p,d,far=2)=>new THREE.Raycaster(v(p),v(d),0,far).intersectObject(object,true)[0];
const near=(a,b,e,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,`${label}: ${a} vs ${b}`);
function closedAt(object,p,axis){
  const saved=[];object.traverse(m=>{if(m.isMesh){saved.push([m,m.material.side]);m.material.side=THREE.DoubleSide;}});
  const a=ray(object,p,axis,.15),b=ray(object,p,axis.map(n=>-n),.15);
  for(const [m,side]of saved)m.material.side=side;
  assert.ok(a&&b&&a.distance>1e-6&&b.distance>1e-6,'point is inside actual closed stock');
}
for(const quality of ['high','low']){
  const tank=createTank('k1a1_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{
    tank.root.updateMatrixWorld(true);
    const gun=tank.root.getObjectByName('k1a1XPhotoRoofMachineGun');
    assert.equal(gun.parent,tank.root.getObjectByName('rig_turret'));
    assert.equal(gun.userData.fitting,'pintleMG');assert.equal(gun.userData.fittingRoot,true);
    assert.equal(gun.userData.reference,'DVIDS3912303-photo-inferred-dimensions');
    const barrel=gun.getObjectByName('sourceMachineGun_turretDark');
    for(const z of [1.25,1.50,1.70]){
      near(ray(barrel,[X+.2,Y,z],[-1,0,0])?.point.x,X+.0175,1e-6,'straight barrel stock axis');
      near(ray(barrel,[X,Y+.2,z],[0,-1,0])?.point.y,Y+.0175,1e-6,'straight barrel crown axis');
    }
    assert.equal(Boolean(ray(gun,[X,Y,1.90],[0,0,-1],.27)),false,'12.7mm bore is genuinely open, not a dark disk');
    near(ray(gun,[X,Y,1.90],[0,0,-1])?.point.z,1.61,1e-6,'recessed bore back is closed');
    near(ray(gun,[X+.06,Y,.949],[-1,0,0])?.point.x,X+.023,1e-5,'round jacket hole exposes separate inner barrel');
    near(ray(gun,[X+.06,Y,.922],[-1,0,0])?.point.x,X+.036,1e-5,'real jacket skin remains beside perforation');
    const detail=tank.root.getObjectByName('turretDetail');
    for(const point of [[-.43,2.708,.648],[-.3444,2.708,.648]]){
      closedAt(detail,point,[0,1,0]);closedAt(gun,point,[0,1,0]);
    }
    assert.equal(Boolean(ray(tank.root,[X,2.67,.90],[0,0,-1],.40)),false,'source tray retains air beneath the new bearing');
    const point=v([X,Y,1.50]),local=gun.worldToLocal(point.clone());
    for(const yaw of [-1.1,.8,Math.PI]){
      const turret=tank.root.getObjectByName('rig_turret');turret.rotation.y=yaw;
      tank.root.getObjectByName('rig_gun').rotation.x=.2;tank.root.updateMatrixWorld(true);
      const center=gun.localToWorld(local.clone()),axis=v([1,0,0]).transformDirection(gun.matrixWorld);
      const hit=new THREE.Raycaster(center.clone().addScaledVector(axis,.2),axis.clone().negate()).intersectObject(gun,true)[0];
      near(hit.point.distanceTo(center),.0175,1e-6,'whole attached weapon follows turret, not main-gun elevation');
    }
  }finally{tank.dispose();}
}
console.log('k1a1XMachineGun: high/low photo-led weapon, actual yoke engagement, straight stock, deep bore, perforated jacket air and yaw ownership pass');
