import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

function contains(meshes, point) {
  const saved=new Map();
  for(const mesh of meshes)for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(!saved.has(mat))saved.set(mat,mat.side);mat.side=THREE.DoubleSide;
  }
  const axis=new THREE.Vector3(0,1,0);
  const found=meshes.some(mesh=>{
    // Merged touching primitives contain coincident exit/entry faces, so
    // deduplicated parity can wrongly classify their union as empty. Require
    // an outward first surface in each direction instead (not AABB overlap).
    return [axis,axis.clone().negate()].every(direction=>{
      const hits=new THREE.Raycaster(point,direction,0,10).intersectObject(mesh,false);
      return hits.some(h=>h.distance>1e-7&&h.distance-hits[0].distance<1e-6
        &&h.face.normal.clone().transformDirection(mesh.matrixWorld).dot(direction)>0);
    });
  });
  for(const [mat,side]of saved)mat.side=side;
  return found;
}
for(const quality of ['high','low']){
  const tank=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{
    tank.root.updateMatrixWorld(true);
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('t90XMountedNsvt');
    assert.ok(gun);assert.equal(gun.parent,turret);
    assert.equal(gun.userData.weaponClass,'nsvt');assert.equal(gun.userData.barrelBridge,true);
    assert.equal(gun.userData.mount,'external-cradle');
    assert.deepEqual(gun.rotation.toArray().slice(0,3),[0,Math.PI,0],
      'complete weapon is parked straight rearward, not an independently tilted barrel');
    const guns=[];turret.traverse(n=>{if(n.userData.fittingRoot&&n.userData.fitting==='pintleMG')guns.push(n);});
    assert.deepEqual(guns,[gun],'one complete shared primitive weapon, not a marker on the source stock');
    const meshes=[];gun.traverse(n=>{if(n.isMesh)meshes.push(n);});
    for(const x of [-.040,.040]){
      const bearing=gun.localToWorld(new THREE.Vector3(x,.0075,.10));
      assert.ok(contains(meshes,bearing),'full-size receiver bears on the source cradle');
      assert.ok(contains([tank.root.getObjectByName('turretDark')],bearing),'each receiver edge contacts its retained source rail');
    }
    const bounds=new THREE.Box3().setFromObject(gun);
    assert.ok(bounds.max.y-bounds.min.y<.20,'no duplicate pedestal under the existing cradle-mounted receiver');
    for(const yaw of [0,.61,-1.1]){
      turret.rotation.y=yaw;tank.root.getObjectByName('rig_gun').rotation.x=.3;tank.root.updateMatrixWorld(true);
      for(const z of [.31,.45,.70,.89]){
        const center=gun.localToWorld(new THREE.Vector3(0,.053,z));
        const host=['turret','turretDark','turretDetail','turretEquipment','turretExternalArmor']
          .map(name=>tank.root.getObjectByName(name)).filter(Boolean);
        assert.equal(contains(host,center),false,
          'stowed barrel must not pass through the retained turret or source AA equipment');
        const axis=new THREE.Vector3(1,0,0).transformDirection(gun.matrixWorld);
        const hit=new THREE.Raycaster(center.clone().addScaledVector(axis,.12),axis.clone().negate(),0,.12).intersectObject(gun,true)[0];
        assert.ok(hit&&hit.point.distanceTo(center)<.027,'receiver bridge and barrel share a continuous straight axis at every yaw');
      }
    }
    const body=gun.getObjectByName('browningDerivedMachineGunBody');
    assert.equal(body.userData.appearanceRole,'machineGun');
  }finally{tank.dispose();}
}
console.log('t90AwXMachineGun: high/low full-size NSVT, actual dual source-rail contact, no duplicate pedestal, straight barrel and turret-only articulation pass');
