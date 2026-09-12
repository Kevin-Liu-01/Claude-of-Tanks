import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {measureTurretBarrelCircularity} from '../turretBarrelCircularity.ts';

// Independent source-only circle/axis measurements, not candidate bounds.
const SOURCE={yaw:[.0000072471277,1.52948397398,.1143146502203],
  gun:[.0014311877863,1.82199396492,1.334185526985],muzzle:6.587516409117,floor:5.890883855316,
  physicalRoof:2.35125696659,wheels:[-1.822412,-.953673,-.089323,.858392,1.722743,2.591482]};
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: actual ${a}, source ${b} ±${t}`);
function actualOpaque(root){
  const rows=[];root.traverseVisible(o=>{
    if(!o.isMesh||o.userData.shadowOnly)return;
    const materials=Array.isArray(o.material)?o.material:[o.material];
    if(materials.some(m=>m.visible&&m.colorWrite!==false&&!m.transparent))rows.push(o);
  });return rows;
}
function frames(tank){
  for(const [name,point]of [['rig_turret',SOURCE.yaw],['rig_gun',SOURCE.gun]]){
    const p=tank.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
    point.forEach((v,i)=>near(p.getComponent(i),v,.000002,`${name} source measured/inferred joint`));
  }
  near(getSpec('t72b3m_x').dims.heightM,SOURCE.physicalRoof,.000002,'physical casting roof is not elevated AA height');
  const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
  assert.ok(gun.getObjectByName('gunMount')?.isMesh,'actual pitching canvas/mount geometry');
  assert.equal(gun.getObjectByName('rig_recoil').parent,gun);
  for(const yaw of [0,-1.2,.73])for(const pitch of [0,-.075,.22]){
    turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
    const expected=new THREE.Vector3(0,0,SOURCE.muzzle-SOURCE.gun[2]).applyAxisAngle(new THREE.Vector3(1,0,0),pitch)
      .add(new THREE.Vector3(...SOURCE.gun).sub(new THREE.Vector3(...SOURCE.yaw)))
      .applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(...SOURCE.yaw));
    near(tank.gunMuzzleWorld(new THREE.Vector3()).distanceTo(expected),0,.000002,'actual physical muzzle follows legal source joints');
  }
  turret.rotation.y=0;gun.rotation.x=0;tank.root.updateMatrixWorld(true);
}
function bore(tank){
  const metal=tank.root.getObjectByName('gun'),all=actualOpaque(tank.root);
  near(new THREE.Box3().setFromObject(metal).max.z,SOURCE.muzzle,.000003,'real circular metal tip');
  for(const z of [2.325,3.142,3.963]){
    const hit=new THREE.Raycaster(new THREE.Vector3(SOURCE.gun[0]+.2,SOURCE.gun[1]+.0001,z),new THREE.Vector3(-1,0,0),0,.1).intersectObject(metal,false)[0];
    near(hit?.point.x-SOURCE.gun[0],.135-.0001*Math.tan(Math.PI/32),.000003,'source jacket clamp truly wraps the longitudinal firing axis');
  }
  for(const [dx,dy]of [[0,0],[.03,0],[-.03,0],[0,.03],[0,-.03]]){
    const ray=new THREE.Raycaster(new THREE.Vector3(SOURCE.gun[0]+dx,SOURCE.gun[1]+dy,SOURCE.muzzle+.2),new THREE.Vector3(0,0,-1),0,1.1);
    near(ray.intersectObject(metal,false)[0]?.point.z,SOURCE.floor,.00002,'source axial bore depth after neutral-pose correction');
    const first=ray.intersectObjects(all,false)[0];
    assert.equal(first?.object.name,'muzzleBoreShadowFallbackDisc');
    // Visible mouth disc seats at the tube edge (owner direction 2026-09-11);
    // the physical source bore depth is asserted separately above.
    near(first?.point.z,SOURCE.muzzle+.0003,.00002,'only the shared 0.3 mm mouth lining at the tube edge may lead the metal');
  }
  assert.ok(measureTurretBarrelCircularity(tank,{requireMeasurement:true}).pass,'actual centered physically circular125mm bore');
}
function covers(tank){
  const meshes=actualOpaque(tank.root);
  for(const [point,n]of [
    [[-.59824,1.93354,1.54708],[-.14365,.857658,.493748]],
    [[1.32502,1.92166,1.00438],[.445996,.850585,.278554]],
    [[-1.48508,1.91604,.57381],[-.44491,.881787,.156542]],
  ]){
    const p=new THREE.Vector3(...point),normal=new THREE.Vector3(...n).normalize();
    const hit=new THREE.Raycaster(p.clone().addScaledVector(normal,.035),normal.clone().negate(),0,.075).intersectObjects(meshes,false)[0];
    near(hit?.point.distanceTo(p),0,.00003,'source cheek exposed plane');
  }
  const receipt=tank.root.userData.eraVisualBindingReceipt;
  assert.equal(receipt.plates.length,6);
  const hull=tank.root.getObjectByName('hull').geometry.attributes.position.array.slice();
  const casting=tank.root.getObjectByName('turret').geometry.attributes.position.array.slice();
  for(const row of receipt.plates){
    assert.ok(row.registered&&row.ownerMatches&&row.fittedSurfaces.length,'actual removable physical field');
    assert.ok(row.fittedSurfaces.every(face=>face[2].every((v,i)=>v===face[3][i])),'exact authored triangles, not rectangles fitted in air');
    assert.equal(tank.stripEra(row.name),true);
    const positions=tank.root.getObjectByName(`${row.owner}ExternalArmor`).geometry.attributes.position,spent=positions.array.slice(),version=positions.version;
    tank.stripEra(row.name);assert.deepEqual(positions.array,spent);assert.equal(positions.version,version);
    assert.deepEqual(tank.root.getObjectByName('hull').geometry.attributes.position.array,hull,'permanent carrier remains');
    assert.deepEqual(tank.root.getObjectByName('turret').geometry.attributes.position.array,casting,'permanent casting remains');
    assert.equal(tank.resetEra(),true);
  }
}
function gearAndFitting(tank){
  const tires=tank.root.getObjectByName('gearRoadWheelTires'),matrix=new THREE.Matrix4(),p=new THREE.Vector3();
  assert.equal(tires.count,12);
  for(let i=0;i<tires.count;i++){
    tires.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix).applyMatrix4(tires.matrixWorld);
    near(p.y,.4728865,.000002,'source road axle height');
    assert.ok(SOURCE.wheels.some(z=>Math.abs(z-p.z)<.000002),'documented average of paired source axle stations');
  }
  const gun=tank.root.getObjectByName('sourceMachineGun_turretDark'),group=gun.parent;
  assert.equal(group.parent,tank.root.getObjectByName('rig_turret'));
  const axis=new THREE.Vector3(0,0,1).transformDirection(group.matrixWorld),source=new THREE.Vector3(-.21215,.54465,.81139).normalize();
  near(axis.distanceTo(source),0,.000002,'coherent elevated source AA firing axis');
  const muzzle=new THREE.Vector3(-1.0939276,3.7383842,1.4189293),ray=new THREE.Raycaster(muzzle.clone().addScaledVector(source,.01),source.clone().negate(),0,.06);
  near(ray.intersectObject(gun,false)[0]?.point.distanceTo(muzzle),0,.000003,'actual source AA barrel end');
}
for(const quality of ['high','low']){
  const tank=createTank('t72b3m_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try{tank.root.updateMatrixWorld(true);frames(tank);bore(tank);covers(tank);gearAndFitting(tank);}
  finally{tank.dispose();}
}
console.log('t72b3mXGeometry: actual high/low physical joints, deep bore, native axles, ERA backing and elevated AA ownership pass; full visual gates separate');
