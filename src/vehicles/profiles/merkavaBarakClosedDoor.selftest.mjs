import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {ensureInteriorFills} from '../interiorFills.ts';
import {sourceOpeningRayProbe} from '../../../tools/source-opening-rays.mjs';

// Independent calipers of the owner's closed-door target. Probe the complete
// rendered model, including loaded fills, rather than trusting part metadata.
const doorFace=-2.633583;
function checkClosedDoor(root) {
  const probe=sourceOpeningRayProbe(root);
  try {
    for(const x of[-.20,-.10,0,.10,.20])for(const y of[.63,.76,.90,1.12,1.26,1.38]){
      const hit=probe.cast([x,y,-4.3],[0,0,1],4);
      assert.ok(hit&&Math.abs(hit.point.z-doorFace)<.001,
        `closed leaf must stop the rear ray at ${x},${y}; hit ${hit?.point.z}`);
      assert.equal(hit.object.name,'hull','door is permanent hull stock');
    }
    for(const [x,y]of[[0,.90],[.10,1.25]]){
      const hit=probe.cast([x,y,-2.4],[0,0,-1],.5);
      assert.ok(hit&&Math.abs(hit.point.z+2.555583)<.001,'leaf has a real interior surface');
    }
    const back=probe.cast([0,.9,-2.4],[0,0,1],3);
    assert.ok(back&&Math.abs(back.point.z+.6815763)<.002,'passenger bay is not filled');
    const floor=probe.cast([0,1,-2],[0,-1,0],1);
    assert.ok(floor&&Math.abs(floor.point.y-.5134441)<.002,'existing bay floor is retained');
  } finally {probe.dispose();}
}
function checkFrameOverlap(root) {
  const hull=root.getObjectByName('hull'),original=hull.material;
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});hull.material=material;
  try{
    for(const x of[-.288,.288]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,.9,-3),new THREE.Vector3(0,0,1),0,1)
        .intersectObject(hull,false).map(hit=>hit.point.z);
      for(const z of[-2.633583,-2.595583,-2.555583,-2.475583])
        assert.ok(hits.some(actual=>Math.abs(actual-z)<.001),'finite leaf/frame entry and exit surfaces');
      const near=z=>hits.reduce((a,b)=>Math.abs(b-z)<Math.abs(a-z)?b:a);
      assert.ok(near(-2.555583)-near(-2.595583)>.039,'leaf overlaps existing frame by 40 mm');
    }
  }finally{hull.material=original;material.dispose();}
}
function checkDoorHardware(root) {
  const probe=sourceOpeningRayProbe(root);
  const hits=[
    ...[.7378825,1.2778825].flatMap(y=>[
      {x:-.3085,y,z:-2.660583,owner:'hullDetail'}, // hinge barrel
      {x:-.251,y,z:-2.650583,owner:'hullDetail'}, // receiver above leaf
    ]),
    {x:.1795,y:1.0078825,z:-2.653583,owner:'hullDetail'}, // latch base
    {x:.2165,y:1.055,z:-2.674083,owner:'hullDark'}, // latch handle
  ];
  try{
    for(const w of hits){
      const hit=probe.cast([w.x,w.y,-3],[0,0,1],.6);
      assert.ok(hit&&Math.abs(hit.point.z-w.z)<.001&&hit.object.name===w.owner,
        'actual door hinge and latch hardware retains its fitted station');
    }
  }finally{probe.dispose();}
}
await ensureInteriorFills(['merkava4_barak']);
for(const quality of['high','low']){
  const tank=createTank('merkava4_barak',null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
  try{
    tank.root.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels.forEach((l,i)=>l.object.visible=i===0);}});
    for(const yaw of[0,Math.PI/2,Math.PI]){
      tank.root.getObjectByName('rig_turret').rotation.y=yaw;
      checkClosedDoor(tank.root);checkFrameOverlap(tank.root);checkDoorHardware(tank.root);
    }
    const hull=tank.root.getObjectByName('hull'),original=hull.geometry,p=original.attributes.position;
    const indices=[];let removed=0;
    for(let i=0;i<p.count;i+=3){
      const outerFace=[i,i+1,i+2].every(j=>Math.abs(p.getZ(j)-doorFace)<1e-5);
      if(outerFace)removed++;else indices.push(i,i+1,i+2);
    }
    assert.ok(removed>=6,'negative removes the real leaf face');
    const open=original.clone();open.setIndex(indices);hull.geometry=open;
    assert.throws(()=>checkClosedDoor(tank.root),/closed leaf/,'open or inward-culling leaf fails');
    hull.geometry=original;open.dispose();
    const shifted=original.clone(),positions=shifted.attributes.position;
    for(let i=0;i<positions.count;i++)if(Math.abs(positions.getZ(i)-doorFace)<1e-5)
      positions.setZ(i,positions.getZ(i)-.05);
    hull.geometry=shifted;
    assert.throws(()=>checkClosedDoor(tank.root),/closed leaf/,'a floating plate in front of the frame fails');
    hull.geometry=original;shifted.dispose();
    const detail=tank.root.getObjectByName('hullDetail');detail.visible=false;
    assert.throws(()=>checkDoorHardware(tank.root),/hinge and latch/,'missing hardware fails');
    detail.visible=true;detail.position.z-=.05;
    assert.throws(()=>checkDoorHardware(tank.root),/hinge and latch/,'displaced hardware fails');
    detail.position.z+=.05;
    const dark=tank.root.getObjectByName('hullDark');dark.visible=false;
    assert.throws(()=>checkDoorHardware(tank.root),/hinge and latch/,'missing latch handle fails');
    dark.visible=true;
    console.log(`merkavaBarakClosedDoor ${quality}: 30 rear rays, inner face, finite frame overlap, preserved bay, yaw and missing/moved negatives PASS`);
  }finally{tank.dispose();}
}
