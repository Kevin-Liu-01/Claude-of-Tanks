import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs source ${b} ±${t}`);
function visibleMeshes(root){const list=[];root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)list.push(m);});return list;}
function sourceTops(meshes){
  for(const[x,z,y]of [[-.35,1.05,2.1257962708],[-.35,1.2,2.0773627771],[-.35,1.4,2.0130354594],[-.35,1.6,1.9432642610],
    [-.25,1.05,2.1145680274],[-.25,1.2,2.0912020748],[-.25,1.4,2.0268072195],[-.25,1.6,1.9587104250],[-.25,1.8,1.8930866268],
    [-.15,1.2,2.1060411625],[-.15,1.4,2.0405789795],[-.15,1.6,1.9741565890],[-.15,1.8,1.9113345827],[-.15,1.9,1.8803848653],
    [0,1.2,2.1269879242],[0,1.4,2.1236100197],[0,1.6,1.9968588030],
    [.15,1.05,2.1145680274],[.15,1.2,2.0988628159],[.15,1.4,2.0357838831],[.15,1.6,1.9690554065],[.15,1.8,1.9076471176],
    [.25,1.2,2.0804924221],[.25,1.4,2.0175964713],[.25,1.6,1.9477622217],[.25,1.8,1.8800340813]]){
    const h=new THREE.Raycaster(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0),0,2).intersectObjects(meshes,false)[0];
    near(h?.point.y,y,.002,'complete source sloping hood/fore wings and upper fixture');
  }
}
function frontSurfaces(meshes){
  for(const[x,y,z]of [[-.3,1.8,1.7036806636],[-.15,1.8,1.7745619403],[.15,1.8,1.7620192125],[.25,1.8,1.7155983449],
    [-.3,1.9,1.7482074307],[-.15,1.9,1.8366225725],[.15,1.9,1.8258090650],[.25,1.9,1.7346465882],
    [-.3,2,1.4605661324],[-.15,2,1.5264792614],[0,2,1.5893915413],[.15,2,1.5121648525],[.25,2,1.4527363599],
    [-.3,2.05,1.3064824662],[-.15,2.05,1.3707091146],[0,2.05,1.4902299643],[.15,2.05,1.3550687877],[.25,2.05,1.2970636149],
    [-.3,2.1,1.1510275154],[-.15,2.1,1.2183300342],[0,2.1,1.5802299976],[.15,2.1,1.1963801104],[.25,2.1,1.1379033903]]){
    const h=new THREE.Raycaster(new THREE.Vector3(x,y,2.2),new THREE.Vector3(0,0,-1),0,2).intersectObjects(meshes,false)[0];
    near(h?.point.z,z,.0035,'source inclined outer and lower wing surface, small folds approximated');
  }
}
function openings(meshes){
  for(const z of [1.72,1.78,1.85]){
    const ray=new THREE.Raycaster(new THREE.Vector3(-.06,1.97,z),new THREE.Vector3(1,0,0),0,.12);
    assert.equal(ray.intersectObjects(meshes,false).length,0,'source forward central fork above the barrel remains genuine air');
  }
  for(const z of [1.52,1.55]){
    const ray=new THREE.Raycaster(new THREE.Vector3(-.02,2.07,z),new THREE.Vector3(1,0,0),0,.085);
    assert.equal(ray.intersectObjects(meshes,false).length,0,'upper fixture overhang is not a solid tall rectangular block');
  }
}
function ownership(tank){
  const mount=tank.root.getObjectByName('gunMount'),pitch=tank.root.getObjectByName('rig_gun'),recoil=tank.root.getObjectByName('rig_recoil');
  assert.equal(mount.parent,pitch,'source fixed shell is pitching, not recoil-owned');
  const geometry=mount.geometry,point=new THREE.Vector3(.023, .296, .058),before=point.clone().applyMatrix4(mount.matrixWorld);
  recoil.position.z=-.2;tank.root.updateMatrixWorld(true);
  assert.ok(before.distanceTo(point.clone().applyMatrix4(mount.matrixWorld))<1e-9,'barrel recoil leaves shell fixed');
  pitch.rotation.x=-.15;tank.root.updateMatrixWorld(true);
  assert.ok(before.distanceTo(point.clone().applyMatrix4(mount.matrixWorld))>.02,'shell follows actual pitch');
  assert.equal(mount.geometry,geometry,'pose updates preserve cold-created mesh buffers');
}
for(const quality of ['high','low']){
  const t=createTank('t90ms_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{t.root.updateMatrixWorld(true);const meshes=visibleMeshes(t.root);sourceTops(meshes);frontSurfaces(meshes);openings(meshes);ownership(t);}
  finally{t.dispose();}
}
console.log('t90msXGunBase: actual high/low source shell, 49 held-out depths, fork/upper-leaf air and fixed pitch ownership pass');
