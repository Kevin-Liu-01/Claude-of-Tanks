import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';

// Existing source-measured receiving stock, before its ownership correction.
// Bounds distinguish a real cradle from an invented stub or renamed barrel.
const cases = [
  ['kf41_lynx_x', [-.3465,-.27766,-.16], [.289,.43164,3.57]],
  ['cv90_mkiv_x', [-.29,-.24,-.14], [.29,.26,.42]],
  ['cv90105_tml_x', [-.597,-.194,-.16], [.506,.249,1.215]],
  ['sabra_mk2_x', [-.63,-.24,-.16], [.63,.35,.83]],
  ['aft10_x', [-1.245,-.315,-.93], [1.245,-.235,.88]],
];
await ensureInteriorFills(cases.map(([id]) => id));
const DEG = Math.PI / 180;
const point = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const normal = new THREE.Vector3(), edge = new THREE.Vector3();
function near(a,b,eps,label) { assert.ok(Number.isFinite(a) && Math.abs(a-b)<=eps, `${label}: ${a} vs ${b}`); }
function onGun(mesh,gun) {
  point.fromBufferAttribute(mesh.geometry.attributes.position,0);
  return gun.worldToLocal(mesh.localToWorld(point)).clone();
}
function gap(a,b) {
  return Math.hypot(...['x','y','z'].map(axis=>Math.max(0,a.min[axis]-b.max[axis],b.min[axis]-a.max[axis])));
}
function firstVisible(root,ray) {
  return ray.intersectObject(root).find(hit=>{
    for(let o=hit.object;o;o=o.parent) if(!o.visible) return false;
    const m=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
    return m?.colorWrite!==false && !hit.object.userData.shadowOnly;
  });
}
function hasExposedCradle(root,mount) {
  const g=mount.geometry,p=g.attributes.position,index=g.index,count=index?.count??p.count;
  // Rays originate just outside actual triangles and test the complete loaded
  // native vehicle, so a completely buried/hollow placeholder cannot pass.
  for(let i=0;i<count;i+=Math.max(3,Math.floor(count/90/3)*3)) {
    a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mount.matrixWorld);
    b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(mount.matrixWorld);
    c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(mount.matrixWorld);
    normal.subVectors(b,a).cross(edge.subVectors(c,a)).normalize();
    if(normal.lengthSq()<.9)continue;
    const center=a.clone().add(b).add(c).multiplyScalar(1/3);
    const ray=new THREE.Raycaster(center.addScaledVector(normal,.025),normal.clone().negate(),0,.026);
    if(firstVisible(root,ray)?.object===mount)return true;
  }
  return false;
}
for(const quality of ['high','low']) for(const [id,min,max] of cases) {
  assert.ok(hasInteriorFills(id), `${id}: actual generated fill loaded`);
  const spec=getSpec(id),tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,batchStatic:false});
  const disposed=[];
  try {
    const root=tank.root,gun=root.getObjectByName('rig_gun'),recoil=root.getObjectByName('rig_recoil');
    const turret=root.getObjectByName('rig_turret'),mount=gun.getObjectByName('gunMount'),barrel=recoil.getObjectByName('gun');
    assert.ok(mount?.isMesh && barrel?.isMesh,`${id}: real receiving cradle and distinct recoil stock`);
    assert.equal(mount.parent,gun,`${id}: cradle pitches without recoiling`);
    assert.equal(barrel.parent,recoil,`${id}: true barrel/canister stock retains its original owner`);
    assert.equal(mount.material,barrel.material,`${id}: reuse original barrel finish without changing shared material`);
    mount.geometry.computeBoundingBox();
    for(const [which,expected] of [['min',min],['max',max]])
      mount.geometry.boundingBox[which].toArray().forEach((v,i)=>near(v,expected[i],.000002,`${id}: measured cradle ${which}[${i}]`));
    const dark=gun.getObjectByName('gunMountDark');
    for(const mesh of [mount,dark].filter(Boolean)) {
      const row={name:mesh.name,count:0};disposed.push(row);
      mesh.geometry.addEventListener('dispose',()=>row.count++);
    }
    const geometryIds=[];root.traverse(o=>{if(o.isMesh)geometryIds.push(o.geometry.uuid);});geometryIds.sort();
    const state=createTankState(spec,new THREE.Vector3(),0);
    for(const yaw of [0,.71]) for(const pitchDeg of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]) {
      state.turretYaw=yaw;state.gunPitch=pitchDeg*DEG;tank.syncFromState(state,1);root.updateMatrixWorld(true);
      assert.ok(hasExposedCradle(root,mount),`${id}/${quality}: real cradle stock exposed at yaw${yaw}, pitch${pitchDeg}`);
      const mountBox=new THREE.Box3().setFromObject(mount,true),barrelBox=new THREE.Box3().setFromObject(recoil,true);
      const turretBox=new THREE.Box3().setFromObject(turret.getObjectByName('turret')||turret,true);
      assert.ok(gap(mountBox,barrelBox)<=.10,`${id}: native cradle remains seated to the barrel`);
      assert.ok(gap(mountBox,turretBox)<=.125,`${id}: native cradle remains seated to the turret`);
      const fixedBefore=onGun(mount,gun),movingBefore=onGun(barrel,gun);
      const lensesBefore=dark?onGun(dark,gun):null;
      const muzzleBefore=Array.from({length:spec.gun.fixedLaunchCanisters?8:1},(_,i)=>tank.gunMuzzleWorld(new THREE.Vector3(),i).clone());
      tank.recoilKick(0,1);tank.syncFromState(state,.12);root.updateMatrixWorld(true);
      near(onGun(mount,gun).distanceTo(fixedBefore),0,1e-6,`${id}: receiving stock stays fixed in gun frame during firing`);
      if(dark)near(onGun(dark,gun).distanceTo(lensesBefore),0,1e-6,`${id}: receiver optics stay with the cradle`);
      if(id==='cv90105_tml_x') for(const [x,y,z] of [[-.4058,-.02445,.360],[.400,.046,.1435]]) {
        const ray=new THREE.Raycaster(gun.localToWorld(new THREE.Vector3(x,y,1.3)),
          new THREE.Vector3(0,0,-1).transformDirection(gun.matrixWorld));
        const hit=firstVisible(root,ray);
        assert.equal(hit?.object,dark,'actual recessed receiver stays the first full-scene hit during recoil');
        near(gun.worldToLocal(hit.point.clone()).z,z,.001,'source optical face depth is fixed through legal yaw/pitch and recoil');
      }

      const motion=onGun(barrel,gun).sub(movingBefore);
      near(motion.x,0,1e-6,`${id}: recoil preserves lateral axis`);near(motion.y,0,1e-6,`${id}: recoil preserves vertical axis`);
      if(spec.gun.fixedLaunchCanisters) {
        near(motion.z,0,1e-9,`${id}: sealed launch canisters never receive cannon recoil`);
        for(let i=0;i<8;i++)near(tank.gunMuzzleWorld(new THREE.Vector3(),i).distanceTo(muzzleBefore[i]),0,1e-8,`${id}: launch anchor ${i} stays seated`);
      } else assert.ok(motion.z<-.03,`${id}: actual tube still recoils independently of its cradle`);
      tank.syncFromState(state,1);root.updateMatrixWorld(true);
      near(onGun(barrel,gun).distanceTo(movingBefore),0,1e-6,`${id}: barrel returns to battery`);
    }
    if(id==='cv90105_tml_x') {
      assert.equal(dark.parent,gun,'both recessed optical faces retain direct pitching ownership');
      const camera=new THREE.PerspectiveCamera();
      for(const distance of [2,1000,2,1000,2]) {
        camera.position.set(0,0,distance);camera.updateMatrixWorld(true);
        root.traverse(o=>{if(o.isLOD)o.update(camera);});
        assert.equal(dark.visible,true,'far and near LOD updates cannot hide the migrated real optical faces');
        const references=[];root.traverse(o=>{if(o.isLOD)for(const level of o.levels)if(level.object===dark)references.push(o);});
        assert.equal(references.length,0,'no stale LOD retains the migrated optical mesh');
        assert.equal(gun.children.filter(o=>o===dark).length,1,'dark receiving stock has exactly one parent reference');
      }
    }
    const after=[];root.traverse(o=>{if(o.isMesh)after.push(o.geometry.uuid);});after.sort();
    assert.deepEqual(after,geometryIds,`${id}: animation creates no duplicate geometry resources`);
  } finally {tank.dispose();}
  for(const row of disposed)assert.equal(row.count,1,`${id}: ${row.name} geometry disposes exactly once`);
}
console.log('europeGunOwnership: filled HIGH/LOW real cradle stock, full-range seating, independent recoil, fixed AFT anchors and retained optical LOD/disposal pass');
