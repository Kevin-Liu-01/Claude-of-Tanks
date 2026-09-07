import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addT90SMGunSaddles} from './t90SMXGunSaddles.ts';

// Independent source misc_b mid-span rays, not builder-derived targets.
const SOURCE=[
  [2.6608,2.024034438,2.011857361],
  [3.542,2.019426136,2.007319170],
  [4.4192,2.015210141,2.003494290],
  [5.55166,2.005360398,1.993553135],
  [6.19367,2.006304602,1.994680998],
  [6.75148,2.007030526,1.994993112],
];
function near(actual,target,tolerance,label) {
  assert.ok(Number.isFinite(actual)&&Math.abs(actual-target)<tolerance,
    `${label}: ${actual} vs source ${target} ± ${tolerance}`);
}
function helperParts(material) {
  const root=new THREE.Group();root.position.set(.001,1.90309,1.56);
  addT90SMGunSaddles({add(bucket,geometry,x,y,z){
    assert.equal(bucket,'gun','all saddles are recoil-owned barrel equipment');
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);root.add(mesh);
  }});root.updateMatrixWorld(true);return root;
}
function topHits(root,x,z) {
  return new THREE.Raycaster(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0),0,2)
    .intersectObject(root,true);
}
function integratedVertices(gun,helper,label) {
  const p=gun.geometry.attributes.position,positions=[];
  for(let i=0;i<p.count;i++)positions.push(new THREE.Vector3().fromBufferAttribute(p,i));
  for(const mesh of helper.children) {
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const point=new THREE.Vector3().fromBufferAttribute(p,i).add(mesh.position);
      assert.ok(positions.some(actual=>actual.distanceToSquared(point)<4e-12),
        `${label}: actual visible recoil mesh contains each authored saddle vertex within2µm at${point.toArray()}`);
    }
  }
}
function testSourcePlanes(helper,label) {
  assert.equal(helper.children.length,6,'exact six measured partial upper saddles');
  for(const [i,[z,center,outer]]of SOURCE.entries()) {
    const part=helper.children[i],bounds=new THREE.Box3().setFromObject(part);
    near(bounds.min.x,-.0483836,.00001,`${label}: source saddle left extent`);
    near(bounds.max.x,.050095,.00001,`${label}: source saddle right extent`);
    assert.ok(bounds.min.y>1.96,'partial upper saddle must never become a full circular collar');
    near(topHits(part,0,z)[0]?.point.y,center,.00002,`${label}: held-out central source crown ${i}`);
    near(topHits(part,.02,z)[0]?.point.y,outer,.00002,`${label}: held-out outboard source plane ${i}`);
  }
}
function testActualSeating(gun,helper,label,material) {
  const actual=new THREE.Mesh(gun.geometry,material);
  actual.matrix.copy(gun.matrixWorld);actual.matrixAutoUpdate=false;actual.updateMatrixWorld(true);
  for(const [i,[z,center]]of SOURCE.entries()) {
    const hits=topHits(actual,0,z).map(hit=>hit.point.y);
    // The fourth clamp is largely buried by the unchanged smooth jacket;
    // do not inflate it merely to become the first visible surface.
    if(i===3)assert.ok(hits[0]>center&&hits[0]<center+.001,
      `${label}: unchanged jacket only occludes the measured fourth crown by less than1mm`);
    else near(hits[0],center,.00003,`${label}: actual full barrel/saddle first surface ${i}`);
    assert.ok(hits.some(y=>Math.abs(y-center)<.00003),
      `${label}: actual saddle keeps measured crown even where the smooth jacket is higher`);
    // The independent jacket top must lie strictly within the closed sheet,
    // not coincide with its upper or lower face. This proves positive seat.
    const internal=hits.filter(y=>y<center-.0008&&y>center-.0055);
    assert.ok(internal.length,`${label}: saddle ${i} engages real native jacket, without coplanar skin`);
    const outer=topHits(helper.children[i],.02,z)[0].point.y;
    const roof=topHits(actual,.02,z)[0].point.y;
    assert.ok(roof>outer+.001,
      `${label}: measured outer saddle leg ${i} stays seated inside smoother native jacket (${roof-outer})`);
  }
}
function testPoseOwnership(tank,gun,label) {
  const pitch=tank.root.getObjectByName('rig_gun'),recoil=tank.root.getObjectByName('rig_recoil');
  assert.equal(gun.parent,recoil,`${label}: actual saddle buffer lives under recoil`);
  const before=new THREE.Vector3(0,.121,1.1008).applyMatrix4(gun.matrixWorld),geometry=gun.geometry;
  recoil.position.z=-.20;tank.root.updateMatrixWorld(true);
  const after=new THREE.Vector3(0,.121,1.1008).applyMatrix4(gun.matrixWorld);
  near(after.z-before.z,-.20,.000001,`${label}: saddles physically recoil with barrel`);
  pitch.rotation.x=-14*Math.PI/180;tank.root.updateMatrixWorld(true);
  assert.equal(gun.geometry,geometry,`${label}: pitch and recoil preserve creation-time buffers`);
}
for(const quality of ['high','low']) {
  const tank=createTank('t90sm_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),helper=helperParts(material);
  try {
    tank.root.updateMatrixWorld(true);
    const gun=tank.root.getObjectByName('rig_recoil')?.getObjectByName('gun');
    assert.ok(gun?.isMesh&&gun.visible,`${quality}: actual barrel owner is present and visible`);
    integratedVertices(gun,helper,quality);testSourcePlanes(helper,quality);
    testActualSeating(gun,helper,quality,material);testPoseOwnership(tank,gun,quality);
  } finally {
    tank.dispose();helper.traverse(mesh=>{if(mesh.isMesh)mesh.geometry.dispose();});material.dispose();
  }
}
console.log('t90SMXGunSaddles: six source-sized partial clamps, actual high/low source crowns, jacket engagement and recoil ownership pass');
