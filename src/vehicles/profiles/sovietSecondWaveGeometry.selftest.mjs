import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {measureTurretBarrelCircularity} from '../turretBarrelCircularity.ts';

// Fixed independent scalar source witnesses. No profile installation, source
// loader, candidate-derived target or missing-ID fallback is permitted here.
const SOURCES={
  t62mv1_x:{yaw:[0,1.446436,.3041853764],gun:[0,1.6650417561,1.5303753764],
    muzzle:5.920914939,boreFloor:5.65940,boreRadius:.0575,roof:2.082969,wheelY:.459085,
    wheels:[-1.858795,-.805165,.24309,1.14781,2.00987],
    hull:[[-1,1.423205327],[0,1.423205327],[1,1.423205327]],era:4},
  t72b_1987_x:{yaw:[-.0000548974,1.4040902854,-.0343498434],gun:[-.0000548633,1.6208176016,1.2669569241],
    muzzle:5.766827075,boreFloor:5.59804,boreRadius:.0625,roof:2.105640266,wheelY:.429605,
    wheels:[-1.835365,-1.024875,-.17634,.599355,1.400955,2.228465],
    hull:[[-.6,1.38950],[0,1.38950],[1.2,1.38950]],era:6},
  t80u_x:{yaw:[0,1.55158,.0718698169],gun:[0,1.7564274071,1.4199398169],
    muzzle:6.002754533,boreFloor:5.83777,boreRadius:.0625,roof:2.172451481,wheelY:.42629,
    wheels:[-1.96246,-1.107005,-.274385,.47443,1.317665,2.088745],
    hull:[[-1.5,1.563],[0,1.544],[1.5,1.522]],era:4},
};
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: actual${a}, source${b} ±${t}`);
function top(mesh,x,z){
  return new THREE.Raycaster(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0),0,6).intersectObject(mesh,false)[0]?.point.y;
}
function checkFrames(tank,id,source){
  for(const [name,expected]of [['rig_turret',source.yaw],['rig_gun',source.gun]]){
    const rig=tank.root.getObjectByName(name);assert.ok(rig,`${id}: actual ${name}`);
    const world=rig.getWorldPosition(new THREE.Vector3());
    expected.forEach((v,i)=>near(world.getComponent(i),v,.000002,`${id}/${name}/${i}`));
  }
  near(getSpec(id).dims.heightM,source.roof,.000002,`${id}: structural roof is not highest fitting`);
  const muzzle=tank.gunMuzzleWorld(new THREE.Vector3());
  [source.gun[0],source.gun[1],source.muzzle].forEach((value,axis)=>near(muzzle.getComponent(axis),value,.000002,`${id}: actual firing anchor ${axis}`));
  const cannon=tank.root.getObjectByName('gun');assert.ok(cannon?.isMesh,`${id}: actual recoil-owned barrel`);
  const box=new THREE.Box3().setFromObject(cannon);
  near(box.max.z,source.muzzle,.004,`${id}: measured physical muzzle plane`);
  assert.ok(tank.root.getObjectByName('gunMount')?.geometry,`${id}: real pitching trunnion seat`);
  assert.ok(measureTurretBarrelCircularity(tank,{requireMeasurement:true}).pass,`${id}: circular physical stock and centered firing axis`);
  // Test the authored opaque stock, not a black fallback-disc visual cue.
  for(const [dx,dy]of [[0,0],[.03,0],[-.03,0],[0,.03],[0,-.03]]){
    const from=new THREE.Vector3(source.gun[0]+dx,source.gun[1]+dy,source.muzzle+.2);
    const hit=new THREE.Raycaster(from,new THREE.Vector3(0,0,-1),0,.6).intersectObject(cannon,false)[0];
    near(hit?.point.z,source.boreFloor,.00002,`${id}: true unfilled source-depth bore ${dx}/${dy}`);
    const opaque=[];
    tank.root.traverseVisible(object=>{if(!object.isMesh||object.userData.shadowOnly)return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.some(material=>material.visible&&material.colorWrite!==false&&!material.transparent))opaque.push(object);
    });
    const complete=new THREE.Raycaster(from,new THREE.Vector3(0,0,-1),0,.6).intersectObjects(opaque,false)[0];
    // The existing shared opaque lining is seated 1.2mm proud of the real
    // metal floor. Pin it separately, without excluding it from the ray.
    assert.equal(complete?.object.name,'muzzleBoreShadowFallbackDisc');
    near(complete?.point.z,source.boreFloor+.0012,.00002,`${id}: complete visible bore has only its seated floor lining ${dx}/${dy}`);
  }
  const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
  for(const yaw of [-1.3,.8])for(const pitch of [-.08,.18]){
    turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
    const expected=new THREE.Vector3(0,0,source.muzzle-source.gun[2]).applyAxisAngle(new THREE.Vector3(1,0,0),pitch)
      .add(new THREE.Vector3(...source.gun).sub(new THREE.Vector3(...source.yaw)))
      .applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(...source.yaw));
    near(tank.gunMuzzleWorld(new THREE.Vector3()).distanceTo(expected),0,.000002,`${id}: actual moved firing anchor`);
  }
  turret.rotation.y=0;gun.rotation.x=0;tank.root.updateMatrixWorld(true);
}
function checkGear(tank,id,source){
  const tire=tank.root.getObjectByName('gearRoadWheelTires');assert.ok(tire?.isInstancedMesh);
  const m=new THREE.Matrix4(),p=new THREE.Vector3();
  assert.equal(tire.count,source.wheels.length*2,`${id}: exact source road axle count`);
  for(let i=0;i<tire.count;i++){
    tire.getMatrixAt(i,m);p.setFromMatrixPosition(m).applyMatrix4(tire.matrixWorld);
    assert.ok(source.wheels.some(z=>Math.abs(z-p.z)<.00001),`${id}: source wheel longitudinal station`);
    near(p.y,source.wheelY,.00001,`${id}: source wheel rest center`);
  }
  assert.equal(tank.root.getObjectByName('rig_hull').userData.runningGearReceipts.length,1);
  assert.ok(tank.root.getObjectByName('gearTrackPads')?.isInstancedMesh);
  assert.equal(tank.root.getObjectByName('gearTrackInnerLinks'),undefined);
  if(id==='t72b_1987_x'){
    const band=new THREE.Box3().setFromObject(tank.root.getObjectByName('gearTrackBandR'));
    near(band.max.x-band.min.x,.60311,.000002,'T72 source band width retained');
    near(band.min.x,1.04641+.012,.000002,'T72 documented12mm physical lane clearance correction');
    const wall=new THREE.Raycaster(new THREE.Vector3(3,.80,-2.65),new THREE.Vector3(-1,0,0),0,3)
      .intersectObject(tank.root.getObjectByName('hull'),false)[0];
    assert.ok(wall&&band.min.x-wall.point.x>=.020,'T72 positive20mm minimum native rear tub/band air');
  }
}
function checkKnownSourceFixtures(tank,id){
  const detail=tank.root.getObjectByName('hullDetail');
  if(id==='t72b_1987_x'){
    const straps=tank.root.getObjectByName('hullDark');
    for(const x of [-.821,-.363,.363,.821]){
      near(top(straps,x,-3.653),1.787,.00001,'T72 retaining hoop wraps around the transverse drum axis');
      const air=new THREE.Raycaster(new THREE.Vector3(x+.06,1.77,-3.653),new THREE.Vector3(0,-1,0),0,.035).intersectObject(straps,false);
      assert.equal(air.length,0,'T72 retaining hoop does not become a broad horizontal disk');
    }
  }
  if(id==='t62mv1_x'){
    for(const x of [-.458286,.464882])near(top(detail,x,-3.268563),1.8302124,.00001,'T62 actual full-size source drum crown');
    const air=new THREE.Raycaster(new THREE.Vector3(0,1.78,-3.268563),new THREE.Vector3(0,-1,0),0,.30).intersectObject(detail,false);
    assert.equal(air.length,0,'T62 genuine air between separate drums, not solid rack');
  }
  if(id==='t80u_x'){
    const air=new THREE.Raycaster(new THREE.Vector3(1.36,1.74,-3.31),new THREE.Vector3(0,-1,0),0,.26).intersectObject(detail,false);
    assert.equal(air.length,0,'T80 source empty rear cradle does not acquire a fuel drum');
    const apron=tank.root.getObjectByName('hullRubber');
    const hit=new THREE.Raycaster(new THREE.Vector3(0,.4,4),new THREE.Vector3(0,0,-1),0,1.2).intersectObject(apron,false)[0];
    near(hit?.point.z,3.015634537,.000002,'T80 separate thin low hanging bow apron');
  }
}
for(const [id,source]of Object.entries(SOURCES))for(const quality of ['high','low']){
  const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,batchStatic:false,camoSeed:4242});
  try{
    tank.root.updateMatrixWorld(true);checkFrames(tank,id,source);checkGear(tank,id,source);
    const hull=tank.root.getObjectByName('hull');
    for(const [z,y]of source.hull)near(top(hull,0,z),y,.001,`${id}: independent central roof ${z}`);
    const receipt=tank.root.userData.eraVisualBindingReceipt;
    assert.equal(receipt.plates.length,source.era,`${id}: exact named gameplay fields`);
    for(const row of receipt.plates)assert.ok(row.registered&&row.ownerMatches&&row.fittedSurfaces.length>0,`${id}/${row.name}: actual removable faces`);
    checkKnownSourceFixtures(tank,id);
  }finally{tank.dispose();}
}
console.log('sovietSecondWaveGeometry: source frames/axles/roof witnesses, removable fields and real drum/apron air pass at high+low (not full visual qualification)');
