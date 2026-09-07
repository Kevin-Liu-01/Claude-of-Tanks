import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';

// Independent source-frame and held-out source-ray values. This test uses the
// actual registered ID, never the superseded photo builder or source geometry.
const yawPoint=[0,1.705,-.12],pitchPoint=[.00787,2.02397,1.24],muzzle=5.48842252;
const near=(a,b,e,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,`${label}: ${a} vs ${b} ±${e}`);
const ray=(meshes,origin,axis,far=20)=>new T.Raycaster(new T.Vector3(...origin),
  new T.Vector3(...axis),0,far).intersectObjects(meshes,false)[0];

function sourceSurfaces(root,all){
  const hull=root.getObjectByName('hull'),turret=root.getObjectByName('turret');
  for(const [x,z,y]of [[.75,-3.6,1.747807],[1.3,-3.6,1.748343],
    [.75,2.6,1.489412],[.75,3.2,1.405786],[1.3,2.6,1.488225]])
    near(ray([hull],[x,4,z],[0,-1,0])?.point.y,y,.018,'source hull roof');
  for(const [x,z,y]of [[0,-2.8,2.420929],[.75,-1.6,2.486732],
    [.42,.8,2.415369],[.75,1.1,2.383472],[1.3,1.1,2.213293],
    [1.05,1.4,2.159448],[.75,1.7,2.139083]])
    near(ray([turret],[x,4,z],[0,-1,0])?.point.y,y,.022,'held-out source turret plane');
  // Longitudinal holdouts between the source-measured outline stations, plus
  // independent upper/lower wall cuts. These catch the old abrupt 57–79mm
  // outward bulge and verify stock is still present below the side equipment.
  for(const[z,y,right,left]of [[-1.10,2.17,1.353194,-1.331152],
    [-.90,2.17,1.379961,-1.358647],[-1.10,1.95,1.355798,-1.335402],
    [-.90,1.95,1.380463,-1.360213],[-1.10,2.32,1.348234,-1.323474],
    [-.90,2.32,1.368569,-1.345205]]){
    near(ray([turret],[3,y,z],[-1,0,0])?.point.x,right,.008,'held-out source right side plane');
    near(ray([turret],[-3,y,z],[1,0,0])?.point.x,left,.008,'held-out source left side plane');
  }
  // Physical metal is behind the opening; no dark cap at the muzzle lip.
  assert.ok(!ray(all,[pitchPoint[0],pitchPoint[1],muzzle-.006],[0,0,-1],.30),
    'deep muzzle approach remains real air');
  near(ray([root.getObjectByName('gunDark')],[pitchPoint[0],pitchPoint[1],muzzle+.02],
    [0,0,-1])?.point.z,5.145,.00001,'explicit inferred blind stock inside measured source solid/hollow bracket');
  assert.ok(!ray([turret],[.60,1.81,-2.45],[0,0,1],.37),
    'source rising bustle underside stays empty above deck');
  // Both sight hoods contain real recesses with a glass back and solid jambs.
  // The independent detail audit identified the wide low left visor, not
  // the earlier guessed tall box. Keep its source-defined recessed front.
  for(const [x,y,z,air,jambX]of [[-.8175,2.461,1.064,.040,-1.043],
    [1.055,2.459,1.101,.018,1.096]]){
    assert.ok(!ray(all,[x,y,z],[0,0,-1],air),
      'source optical mouth is open ahead of its back');
    assert.ok(ray(all,[jambX,y,z+.012],[0,0,-1],.035),
      'solid optical side-wall survives next to air');
  }
}

function physicalEnvelope(t,all){
  const bounds=new T.Box3(),p=new T.Vector3(),m=new T.Matrix4();
  for(const o of all)for(let n=0;n<(o.isInstancedMesh?o.count:1);n++){
    if(o.isInstancedMesh){o.getMatrixAt(n,m);m.premultiply(o.matrixWorld);}else m.copy(o.matrixWorld);
    for(let i=0;i<o.geometry.attributes.position.count;i++){
      p.fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(m);
      assert.ok(p.toArray().every(Number.isFinite));bounds.expandByPoint(p);
    }
  }
  near(bounds.max.y,5.359131746953,.00001,'full source antenna height is not filtered away');
  near(bounds.max.x-bounds.min.x,3.78,.00001,'full measured source width');
  assert.ok(bounds.min.y>=-1e-6,'all physical moving shoe vertices stay above ground');
  near(t.gunMuzzleWorld(new T.Vector3()).z,muzzle,.000002,'source actual muzzle anchor');
}

function articulation(t){
  const yaw=t.root.getObjectByName('rig_turret'),gun=t.root.getObjectByName('rig_gun');
  const recoil=t.root.getObjectByName('rig_recoil');
  for(const [rig,point]of [[yaw,yawPoint],[gun,pitchPoint]])
    near(rig.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(...point)),0,2e-6,'source-frame functional joint');
  assert.ok(t.root.getObjectByName('gunMount').parent===gun,'mantlet is owned by pitch rig');
  assert.ok(t.root.getObjectByName('gun').parent===recoil,'barrel is owned by recoil rig');
  for(const y of [-.71,.93])for(const p of [-.10,.18]){
    yaw.rotation.y=y;gun.rotation.x=p;t.root.updateMatrixWorld(true);
    const expected=new T.Vector3(0,0,muzzle-pitchPoint[2]).applyAxisAngle(new T.Vector3(1,0,0),p)
      .add(new T.Vector3(...pitchPoint).sub(new T.Vector3(...yawPoint)))
      .applyAxisAngle(new T.Vector3(0,1,0),y).add(new T.Vector3(...yawPoint));
    near(t.gunMuzzleWorld(new T.Vector3()).distanceTo(expected),0,2e-6,'whole cannon follows native yaw and pitch');
    const before=t.gunMuzzleWorld(new T.Vector3());recoil.position.z=-.12;t.root.updateMatrixWorld(true);
    near(t.gunMuzzleWorld(new T.Vector3()).distanceTo(before),.12,2e-6,'native recoil owns the gun and sleeves');
    recoil.position.z=0;
  }
}

for(const quality of ['high','low']){
  const t=createTank('strv122_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{
    t.root.updateMatrixWorld(true);const all=[];
    t.root.traverse(o=>{if(o.isMesh&&!o.name.startsWith('procShadow_')&&!o.userData.vehicleMarking)all.push(o);});
    sourceSurfaces(t.root,all);physicalEnvelope(t,all);articulation(t);
  }finally{t.dispose();}
}
console.log('strv122XSupplied: actual high/low source frame, held-out sloped planes, real recesses, full physical envelope and articulation pass');
