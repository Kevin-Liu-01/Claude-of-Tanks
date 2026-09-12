import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {measureTurretBarrelCircularity} from '../turretBarrelCircularity.ts';

const SOURCE={yaw:[.00489819586996,1.33032792438745,.248076543568282],
  gun:[.002245869663885,1.629788855115796,1.37094868816255],muzzle:6.558946867971733,floor:6.453155544449773};
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs source ${b} ±${t}`);
function opaque(root){const out=[];root.traverseVisible(m=>{
  if(m.isMesh&&!m.userData.shadowOnly&&(Array.isArray(m.material)?m.material:[m.material]).some(a=>a.visible&&a.colorWrite!==false&&!a.transparent))out.push(m);
});return out;}
function frames(t){
  for(const[name,point]of [['rig_turret',SOURCE.yaw],['rig_gun',SOURCE.gun]]){
    const p=t.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());point.forEach((v,i)=>near(p.getComponent(i),v,.000002,`${name} inferred source joint`));
  }
  near(getSpec('t72bu_x').dims.heightM,2.16259918790,.000002,'casting roof remains distinct from highest mast');
  assert.ok(t.root.getObjectByName('gunMount')?.isMesh,'actual pitching canvas and trunnion seat');
  const turret=t.root.getObjectByName('rig_turret'),gun=t.root.getObjectByName('rig_gun');
  for(const yaw of [0,-1.1,.79])for(const pitch of [0,-.07,.19]){
    turret.rotation.y=yaw;gun.rotation.x=pitch;t.root.updateMatrixWorld(true);
    const expected=new THREE.Vector3(0,0,SOURCE.muzzle-SOURCE.gun[2]).applyAxisAngle(new THREE.Vector3(1,0,0),pitch)
      .add(new THREE.Vector3(...SOURCE.gun).sub(new THREE.Vector3(...SOURCE.yaw))).applyAxisAngle(new THREE.Vector3(0,1,0),yaw)
      .add(new THREE.Vector3(...SOURCE.yaw));
    near(t.gunMuzzleWorld(new THREE.Vector3()).distanceTo(expected),0,.000002,'physical muzzle uses actual articulated design datums');
  }turret.rotation.y=0;gun.rotation.x=0;t.root.updateMatrixWorld(true);
}
function bore(t){
  const gun=t.root.getObjectByName('gun'),all=opaque(t.root);
  near(new THREE.Box3().setFromObject(gun).max.z,SOURCE.muzzle,.000003,'actual closed stock terminal plane');
  for(const [x,y]of [[0,0],[.03,0],[-.03,0],[0,.03],[0,-.03]]){
    const ray=new THREE.Raycaster(new THREE.Vector3(SOURCE.gun[0]+x,SOURCE.gun[1]+y,SOURCE.muzzle+.2),new THREE.Vector3(0,0,-1),0,.5);
    near(ray.intersectObject(gun,false)[0]?.point.z,SOURCE.floor,.00002,'true metal bore floor has source depth');
    const hit=ray.intersectObjects(all,false)[0];assert.equal(hit?.object.name,'muzzleBoreShadowFallbackDisc');
    // Visible mouth disc seats at the tube edge (owner direction 2026-09-11);
    // the physical source bore depth is asserted separately above.
    near(hit?.point.z,SOURCE.muzzle+.0003,.00002,'complete opaque gun seats its shared mouth lining at the tube edge');
  }assert.ok(measureTurretBarrelCircularity(t,{requireMeasurement:true}).pass,'physically circular125mm stock');
}
function sourceForms(t){
  const hull=t.root.getObjectByName('hull');
  for(const[x,z,y,tol]of [[0,0,1.36027,.001],[0,2.9,.9374747,.001],[1.4,3.5,1.2834693,.006],[-1.4,3.7,1.2637582,.006]]){
    const hit=new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0),0,4).intersectObject(hull,false)[0];
    near(hit?.point.y,y,tol,'source main tub/crowned fender surface');
  }
  const detail=t.root.getObjectByName('hullDetail');
  for(const x of [-.59360,.58002]){
    const hit=new THREE.Raycaster(new THREE.Vector3(x,3,-3.4954),new THREE.Vector3(0,-1,0),0,2).intersectObject(detail,false)[0];
    near(hit?.point.y,1.765735,.000003,'source actual transverse rear drum crown');
  }
  assert.equal(new THREE.Raycaster(new THREE.Vector3(0,1.75,-3.4954),new THREE.Vector3(0,-1,0),0,.35).intersectObject(detail,false).length,0,'real air between drums');
  const mg=t.root.getObjectByName('sourceMachineGun_turretDark');assert.equal(mg.parent.parent,t.root.getObjectByName('rig_turret'));
  const ray=new THREE.Raycaster(new THREE.Vector3(-.60653,2.68942,2.3),new THREE.Vector3(0,0,-1),0,.3);
  near(ray.intersectObject(mg,false)[0]?.point.z,2.18421,.000003,'coherent actual source AA terminal');
}
function gearAndEra(t){
  const wheel=t.root.getObjectByName('gearRoadWheelTires'),m=new THREE.Matrix4(),v=new THREE.Vector3();assert.equal(wheel.count,12);
  for(let i=0;i<wheel.count;i++){
    wheel.getMatrixAt(i,m);v.setFromMatrixPosition(m).applyMatrix4(wheel.matrixWorld);
    near(v.y,.451075,.000002,'source paired axle average');
    near(Math.abs(v.x),1.424,.000002,'source paired axle lane plus documented12mm mechanical clearance');
    assert.ok([-1.5872,-.7276,.14085,1.00566,1.85831,2.72517].some(z=>Math.abs(z-v.z)<.000002));
  }
  const band=new THREE.Box3().setFromObject(t.root.getObjectByName('gearTrackBandR'));
  near(band.max.x-band.min.x,.56169,.000003,'source full track width preserved');
  near(band.min.x,1.090155,.000003,'whole moving lane, not clipped source shoes');
  assert.ok(band.min.x-1.07251>.017,'positive measured native tub/band corridor');
  const rows=t.root.userData.eraVisualBindingReceipt.plates;assert.equal(rows.length,6);
  const tub=t.root.getObjectByName('hull').geometry.attributes.position.array.slice(),casting=t.root.getObjectByName('turret').geometry.attributes.position.array.slice();
  for(const row of rows){
    assert.ok(row.registered&&row.ownerMatches&&row.fittedSurfaces.length);assert.ok(row.fittedSurfaces.every(f=>f[2].every((n,i)=>n===f[3][i])),'actual authored triangular protection faces');
    assert.equal(t.stripEra(row.name),true);const p=t.root.getObjectByName(`${row.owner}ExternalArmor`).geometry.attributes.position,spent=p.array.slice(),version=p.version;
    t.stripEra(row.name);assert.deepEqual(p.array,spent);assert.equal(p.version,version);
    assert.deepEqual(t.root.getObjectByName('hull').geometry.attributes.position.array,tub);assert.deepEqual(t.root.getObjectByName('turret').geometry.attributes.position.array,casting);
    assert.equal(t.resetEra(),true);
  }
}
for(const quality of ['high','low']){
  const t=createTank('t72bu_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try{t.root.updateMatrixWorld(true);frames(t);bore(t);sourceForms(t);gearAndEra(t);}finally{t.dispose();}
}
console.log('t72buXGeometry: actual high/low source joints, true bore depth, crowns/drum air, native wheels and reactive backing pass; full visual gates separate');
