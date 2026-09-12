import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {measureTurretBarrelCircularity} from '../turretBarrelCircularity.ts';

// Independent source scalars, not imported candidate dimensions or a donor
// fallback. The source's 15.6mm-proud marker and conical hole are not targets.
const SOURCE={yaw:[.0000002374,1.457100315,.065591405],gun:[.006050285,1.758750301,1.096549988],
  muzzle:5.798749804,floor:4.505949855,roof:2.274000205,
  wheels:[-1.70205,-.91970,-.12865,.67990,1.47690,2.28460]};
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: actual${a}, source${b} ±${t}`);
function visibleMeshes(root){
  const meshes=[];
  root.traverseVisible(object=>{
    if(!object.isMesh||object.userData.shadowOnly)return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(materials.some(material=>material.visible&&material.colorWrite!==false&&!material.transparent))meshes.push(object);
  });return meshes;
}
function checkFrames(tank){
  for(const [name,expected]of [['rig_turret',SOURCE.yaw],['rig_gun',SOURCE.gun]]){
    const position=tank.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
    expected.forEach((v,i)=>near(position.getComponent(i),v,.000002,`${name} source datum`));
  }
  near(getSpec('t72b3_x').dims.heightM,SOURCE.roof,.000002,'physical cast roof, not5.457m whip');
  const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
  for(const yaw of [0,-1.3,.8])for(const pitch of [0,-.08,.18]){
    turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
    const expected=new THREE.Vector3(0,0,SOURCE.muzzle-SOURCE.gun[2]).applyAxisAngle(new THREE.Vector3(1,0,0),pitch)
      .add(new THREE.Vector3(...SOURCE.gun).sub(new THREE.Vector3(...SOURCE.yaw)))
      .applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(...SOURCE.yaw));
    near(tank.gunMuzzleWorld(new THREE.Vector3()).distanceTo(expected),0,.000002,'actual source muzzle follows yaw/pitch');
  }
  turret.rotation.y=0;gun.rotation.x=0;tank.root.updateMatrixWorld(true);
  assert.ok(gun.getObjectByName('gunMount')?.isMesh,'actual pitching mount, not an empty joint');
  assert.equal(gun.getObjectByName('rig_recoil').parent,gun);
}
function checkBore(tank){
  const cannon=tank.root.getObjectByName('gun'),all=visibleMeshes(tank.root);
  near(new THREE.Box3().setFromObject(cannon).max.z,SOURCE.muzzle,.000002,'physical metal tip');
  for(const [dx,dy]of [[0,0],[.03,0],[-.03,0],[0,.03],[0,-.03]]){
    const ray=new THREE.Raycaster(new THREE.Vector3(SOURCE.gun[0]+dx,SOURCE.gun[1]+dy,SOURCE.muzzle+.2),new THREE.Vector3(0,0,-1),0,2);
    near(ray.intersectObject(cannon,false)[0]?.point.z,SOURCE.floor,.00002,'real1.293m-deep physical bore');
    const first=ray.intersectObjects(all,false)[0];
    assert.equal(first?.object.name,'muzzleBoreShadowFallbackDisc');
    // The physical bore stays the source's 1.293 m tube (asserted above), but
    // the visible mouth disc now seats at the tube edge instead of the floor:
    // the owner rejected hollow throats whose dark hole sat far inside the
    // barrel (2026-09-11). The disc leads the metal tip by the fleet 1.2 mm.
    near(first?.point.z,SOURCE.muzzle+.0003,.00002,'opaque mouth disc seats at the tube edge, not the deep floor');
  }
  const result=measureTurretBarrelCircularity(tank,{requireMeasurement:true});
  assert.ok(result.pass,'source stock spans with physically circular centered125mm bore');
  near(result.muzzleZ,SOURCE.muzzle-SOURCE.gun[2],.000002,'circularity actually samples full stock length');
}
function checkCassettePlanes(tank){
  const rows=[
    {point:[-1.5095841238,1.919238621,.330019881],normal:[-.2477441304,.9582141229,.1429983938]},
    {point:[-1.129349684,1.932350504,.918400042],normal:[-.2046300905,.957211053,.204630218]},
    {point:[.644700326,1.919250132,1.33610003],normal:[.143028489,.958214057,.247727012]},
    {point:[-1.52375,1.702201,.33815],normal:[.370799774,.903723181,-.213990513]},
    {point:[-.542549,2.149450,.332200],normal:[0,.96587,.25903]},
  ],meshes=visibleMeshes(tank.root);
  for(const row of rows){
    const expected=new THREE.Vector3(...row.point),normal=new THREE.Vector3(...row.normal).normalize();
    const ray=new THREE.Raycaster(expected.clone().addScaledVector(normal,.04),normal.clone().negate(),0,.085);
    const hit=ray.intersectObjects(meshes,false)[0];
    assert.ok(hit,'actual complete scene hits the independent cassette witness');
    near(hit.point.distanceTo(expected),0,.0002,'measured upper/lower cassette plane');
    const worldNormal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
    assert.ok(worldNormal.dot(normal)>.99999,'actual source plane normal, not unrotated generic wedge');
  }
  const receipt=tank.root.userData.eraVisualBindingReceipt;
  assert.equal(receipt.plates.length,6,'six canonical named fields, not one row per generated triangle');
  const hull=tank.root.getObjectByName('hull').geometry.attributes.position.array.slice();
  const turret=tank.root.getObjectByName('turret').geometry.attributes.position.array.slice();
  for(const row of receipt.plates){
    assert.ok(row.registered&&row.ownerMatches&&row.fittedSurfaces.length>0,'actual cover registered to its owner');
    assert.ok(row.fittedSurfaces.every(face=>face[2].every((v,i)=>v===face[3][i])),'actual triangle faces, never protection fitted around air');
    assert.equal(tank.stripEra(row.name),true);
    const cover=tank.root.getObjectByName(`${row.owner}ExternalArmor`).geometry.attributes.position;
    const spent=cover.array.slice(),spentVersion=cover.version;
    assert.equal(tank.stripEra(row.name),true,'existing API reports registered name on idempotent calls');
    assert.deepEqual(cover.array,spent,'second strip cannot change already spent geometry');
    assert.equal(cover.version,spentVersion,'second strip does not upload unchanged geometry');
    assert.deepEqual(tank.root.getObjectByName('hull').geometry.attributes.position.array,hull,'permanent hull survives field depletion');
    assert.deepEqual(tank.root.getObjectByName('turret').geometry.attributes.position.array,turret,'permanent casting survives field depletion');
    assert.equal(tank.resetEra(),true);
  }
}
function checkGearAndMachineGun(tank){
  const carrier=new THREE.Raycaster(new THREE.Vector3(-1.65,1.08,1.26),new THREE.Vector3(-1,0,0),0,.3)
    .intersectObject(tank.root.getObjectByName('hullDetail'),false)[0];
  near(carrier?.point.x,-1.8021257933664245,.0002,'actual source left frame inner plane, not broad inboard support intersecting belt');
  assert.ok(Math.abs(carrier.face.normal.y-.08720369817)<.00001,'source carrier inclination preserved');
  const tire=tank.root.getObjectByName('gearRoadWheelTires'),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  assert.equal(tire.count,12);
  for(let i=0;i<tire.count;i++){
    tire.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix).applyMatrix4(tire.matrixWorld);
    near(point.y,.395,.000002,'actual source road-wheel rest height');
    assert.ok(SOURCE.wheels.some(z=>Math.abs(z-point.z)<.000002),'actual source axle station');
  }
  const gunMesh=tank.root.getObjectByName('sourceMachineGun_turretDark'),group=gunMesh.parent;
  assert.equal(group.parent,tank.root.getObjectByName('rig_turret'));
  assert.deepEqual(group.userData.barrelAxisLocal,[0,0,1]);
  const axis=new THREE.Vector3(0,0,1).transformDirection(group.matrixWorld);
  near(axis.distanceTo(new THREE.Vector3(0,0,-1)),0,.000002,'authentic aft stock and declared fitting axis agree');
  near(new THREE.Box3().setFromObject(gunMesh).min.z,-2.2026498318,.00002,'independently measured source aft-pointing AA muzzle end');
}
for(const quality of ['high','low']){
  const tank=createTank('t72b3_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try{tank.root.updateMatrixWorld(true);checkFrames(tank);checkBore(tank);checkCassettePlanes(tank);checkGearAndMachineGun(tank);}
  finally{tank.dispose();}
}
console.log('t72b3XGeometry: actual high/low source frames, true bore, cassette faces/backing, six axles and coherent aft AA stock pass; full visual gates remain separate');
