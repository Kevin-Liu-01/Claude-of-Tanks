import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';

// Held-out rays on the existing source-measured housing stock, in the gun
// frame. These also cross real tube/cradle receiving sections; an empty
// named mount or a parent-only assertion cannot satisfy the test.
const cases = [
  { id:'kurganets25_x', origin:[0,.3,.12], direction:[0,-1,0], planeAxis:1, plane:.08, seatZ:.19,
    dark:{origin:[1.1,.022,-.70],direction:[-1,0,0]} },
  { id:'fv510_milan_x', origin:[.18,.10,.6], direction:[0,0,-1], planeAxis:2,
    plane:.04+(.26+Math.sin(-.09)*.10)/Math.cos(-.09), seatZ:.20 },
  { id:'bmp3m_dragun125_x', origin:[.154,0,.5], direction:[0,0,-1], planeAxis:2, plane:.0895, seatZ:.04 },
  { id:'griffin50_x', origin:[0,.4,.75], direction:[0,-1,0], planeAxis:1,
    plane:.165+(.1493-.165)*(.59/.60), seatZ:.30 },
  { id:'k21_x', origin:[.14,.08,.6], direction:[0,0,-1], planeAxis:2,
    plane:.05+(.265+Math.sin(-.06)*.02)/Math.cos(-.06), seatZ:.12 },
  { id:'ajax_x', origin:[-.12,.04,.5], direction:[0,0,-1], planeAxis:2, plane:.214, seatZ:.14,
    dark:{origin:[-.172,-.059,.26],direction:[0,0,-1]} },
];
await ensureInteriorFills(cases.map(row=>row.id));

for (const quality of ['high','low']) for (const row of cases) {
  const label=`${row.id} ${quality}`,spec=getSpec(row.id);
  const tank=createTank(row.id,null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242,batchStatic:false});
  const disposed=new Map();
  try {
    assert.ok(hasInteriorFills(row.id),`${label}: runtime interior record loaded`);
    const root=tank.root,pitch=root.getObjectByName('rig_gun'),recoil=root.getObjectByName('rig_recoil');
    const mount=root.getObjectByName('gunMount'),gun=root.getObjectByName('gun');
    const dark=root.getObjectByName('gunMountDark');
    const preservedShadowSources=[];
    root.traverse(object=>{if(object.userData.preserveRecoilShadowSource)preservedShadowSources.push(object);});
    assert.deepEqual(preservedShadowSources,row.dark?[dark]:[],
      `${label}: only the actual migrated dark stock preserves its prior shadow participation`);
    assert.ok(mount?.isMesh&&mount.geometry.attributes.position.count>=36,`${label}: real cradle stock`);
    assert.equal(mount.parent,pitch,`${label}: cradle pitches independently of cannon recoil`);
    assert.equal(gun.parent,recoil,`${label}: tube retains the real recoil path`);
    assert.equal(mount.material,gun.material,`${label}: migrated paint retains the actual barrel material`);
    for(const mesh of [mount,gun,dark].filter(Boolean)) if(!disposed.has(mesh.geometry)) {
      disposed.set(mesh.geometry,0);
      mesh.geometry.addEventListener('dispose',()=>disposed.set(mesh.geometry,disposed.get(mesh.geometry)+1));
    }
    const visibleMeshes=()=>{const meshes=[];root.traverseVisible(o=>{
      if(o.isMesh&&!o.userData.shadowOnly&&[].concat(o.material).some(m=>m.colorWrite!==false))meshes.push(o);
    });return meshes;};
    const cast=(mesh,origin,direction)=>new THREE.Raycaster(
      pitch.localToWorld(new THREE.Vector3(...origin)),
      new THREE.Vector3(...direction).transformDirection(pitch.matrixWorld),0,3,
    ).intersectObject(mesh,false)[0];
    const witness=(mesh,ray)=>{
      const hit=cast(mesh,ray.origin,ray.direction);
      assert.ok(hit,`${label}: measured housing ray must hit real stock`);
      const local=pitch.worldToLocal(hit.point.clone());
      if(ray.planeAxis!==undefined)assert.ok(Math.abs(local.getComponent(ray.planeAxis)-ray.plane)<.00002,
        `${label}: measured source housing plane changed: ${local.toArray()}`);
      // A short outward ray through the complete scene proves the measured
      // stock remains exposed, instead of finding an invisible buried copy.
      const outward=new THREE.Vector3(...ray.direction).negate().transformDirection(pitch.matrixWorld);
      const actual=new THREE.Raycaster(hit.point.clone().addScaledVector(outward,.004),outward.negate(),0,.008)
        .intersectObjects(visibleMeshes(),false)[0];
      assert.equal(actual?.object,mesh,`${label}: housing is first visible stock`);
      return mesh.worldToLocal(hit.point.clone());
    };
    const seat=()=>{
      const materials=new Map();
      for(const mesh of [mount,gun])for(const mat of [].concat(mesh.material))if(!materials.has(mat)){
        materials.set(mat,mat.side);mat.side=THREE.DoubleSide;
      }
      try {
        const intervals=[mount,gun].map(mesh=>{
          const hits=new THREE.Raycaster(pitch.localToWorld(new THREE.Vector3(-3,0,row.seatZ)),
            new THREE.Vector3(1,0,0).transformDirection(pitch.matrixWorld),0,6).intersectObject(mesh,false);
          assert.ok(hits.length>=2,`${label}: receiving section needs both physical sides`);
          return [hits[0].distance,hits.at(-1).distance];
        });
        assert.ok(Math.min(...intervals.map(i=>i[1]))-Math.max(...intervals.map(i=>i[0]))>.02,
          `${label}: tube remains positively seated in real cradle cross section`);
      } finally {for(const [material,side] of materials)material.side=side;}
    };
    const state=createTankState(spec,new THREE.Vector3(),0);
    for(const [elevation,yaw] of [[-spec.gunDepressionDeg,-.61],[0,0],[spec.gunElevationDeg,.53]]) {
      state.gunPitch=THREE.MathUtils.degToRad(elevation);state.turretYaw=yaw;
      tank.syncFromState(state,1);root.updateMatrixWorld(true);
      const point=witness(mount,row),darkPoint=row.dark?witness(dark,row.dark):null;
      const localBefore=pitch.worldToLocal(mount.localToWorld(point.clone()));
      tank.recoilKick(0,spec.gun.autocannon?.36:1);
      tank.syncFromState(state,spec.gun.autocannon?.06:.12);root.updateMatrixWorld(true);
      assert.ok(recoil.position.z<-.04,`${label}: actual cannon recoil exercised`);
      assert.ok(pitch.worldToLocal(mount.localToWorld(point.clone())).distanceTo(localBefore)<1e-8,
        `${label}: real housing stock must not slide with barrel`);
      witness(mount,row);if(darkPoint)witness(dark,row.dark);seat();
      // Negative control: the old parent reproduces the failure using the
      // same real vertices, not a mocked parent label or fabricated mount.
      recoil.add(mount);root.updateMatrixWorld(true);
      assert.ok(pitch.worldToLocal(mount.localToWorld(point.clone())).distanceTo(localBefore)>.04,
        `${label}: old recoiling housing parent must be detected`);
      pitch.add(mount);root.updateMatrixWorld(true);
      if(darkPoint){
        const before=pitch.worldToLocal(dark.localToWorld(darkPoint.clone()));
        recoil.add(dark);root.updateMatrixWorld(true);
        assert.ok(pitch.worldToLocal(dark.localToWorld(darkPoint.clone())).distanceTo(before)>.04);
        pitch.add(dark);root.updateMatrixWorld(true);
      }
    }
    if(row.dark) {
      assert.equal(dark.userData.preserveRecoilShadowSource,true,`${label}: historical gun-dark shadow source retained`);
      assert.equal(dark.parent,pitch,`${label}: dark sight/receiver is always-visible pitch stock`);
      const camera=new THREE.PerspectiveCamera(40,1,.1,1000);
      for(const distance of [2,500,2]) {
        camera.position.set(0,3,distance);camera.updateMatrixWorld(true);
        let count=0;
        root.traverse(o=>{if(o===dark)count++;if(o.isLOD){
          assert.ok(o.levels.every(level=>level.object!==dark),`${label}: no stale LOD reference`);
          o.update(camera);
        }});
        assert.equal(count,1,`${label}: exactly one dark housing mesh`);
        assert.equal(dark.visible,true,`${label}: dark stock survives near/far/near updates`);
      }
      root.updateMatrixWorld(true);witness(dark,row.dark);
    }
  } finally {tank.dispose();}
  for(const count of disposed.values())assert.equal(count,1,`${label}: factory disposes each migrated geometry once`);
}
console.log('sourceStudyGunCradles: six HIGH/LOW measured housing planes, legal pitch/recoil seats, old-parent negatives, unchanged paint, dark LOD and disposal pass');
