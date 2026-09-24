import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';

await ensureInteriorFills(['leo2_revolution_proto']);
const close = (a,b,epsilon=1e-5) => assert.ok(Math.abs(a-b)<epsilon, `${a} != ${b}`);
for (const quality of ['high','low']) {
  const spec=getSpec('leo2_revolution_proto');
  const tank=createTank(spec.id,null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});
  try {
    const turret=tank.root.getObjectByName('rig_turret');
    const gun=tank.root.getObjectByName('rig_gun');
    const mount=tank.root.getObjectByName('gunMount');
    const recoil=tank.root.getObjectByName('rig_recoil');
    const muzzle=tank.root.getObjectByName('rig_muzzle');
    const state=createTankState(spec,new THREE.Vector3(),0);
    assert.equal(gun.parent,turret);
    assert.equal(mount.parent,gun);
    assert.equal(recoil.parent,gun);
    assert.equal(tank.root.getObjectByName('revolutionPrototypeMachineGun').parent,turret);
    assert.ok(!tank.root.getObjectByName('rig_decor_turret'), 'authored prototype roof has no duplicate generic cargo or weapons');
    assert.deepEqual(turret.position.toArray(),spec.armor.turretPivot);
    assert.deepEqual(gun.position.toArray(),spec.armor.gunPivot);
    close(muzzle.position.z,spec.armor.gunBarrel.lengthM);
    const armor=tank.root.getObjectByName('turret');
    armor.geometry.computeBoundingBox();
    const bounds=armor.geometry.boundingBox;
    assert.ok(bounds.max.x-bounds.min.x<3.15,'early cheek kit is narrower than the production Revolution');
    assert.ok(bounds.max.z-bounds.min.z<3.8,'compact early bustle and cheeks replace the long legacy wedge');
    close(bounds.min.x,-bounds.max.x);
    // Actual solid ring must remain concentric at every turret heading.
    const ring=tank.root.userData.combatGeometryParts.find(p=>p.bucket==='turret'
      && Math.abs(p.min[1]+.02)<.002 && Math.abs(p.max[1]-.10)<.002);
    assert.ok(ring,'closed circular turret bearing exists');
    close(ring.min[0],-ring.max[0]);close(ring.min[2],-ring.max[2]);
    close(ring.max[0]-ring.min[0],ring.max[2]-ring.min[2]);

    tank.root.updateMatrixWorld(true);
    const fixed=[];
    turret.traverseVisible(object=>{
      if(!object.isMesh||object.userData.shadowOnly||object.userData.authoredShadowProxy)return;
      for(let owner=object;owner;owner=owner.parent)if(owner===gun)return;
      fixed.push(object);
    });
    const ray=new THREE.Raycaster();
    const hit=(origin,direction,distance)=>{
      ray.set(turret.localToWorld(new THREE.Vector3(...origin)),new THREE.Vector3(...direction).transformDirection(turret.matrixWorld));
      ray.far=distance;return ray.intersectObjects(fixed,false)[0];
    };
    for(const x of [-.38,0,.38])for(const z of [1.10,1.32,1.55,1.70]){
      assert.ok(!hit([x,.90,z],[0,-1,0],.80),`${quality}: real elevation opening at ${x}/${z}, including generated backing`);
    }
    for(const side of [-1,1]){
      const wall=hit([0,.30,1.46],[side,0,0],.60);
      assert.ok(wall,'bearing is carried by a closed inner cheek');
      close(Math.abs(turret.worldToLocal(wall.point.clone()).x),.43);
    }
    const optic=hit([.735,.455,1.75],[0,0,-1],.9);
    assert.ok(optic,'right front optical well has a seated rear lens');
    assert.ok(turret.worldToLocal(optic.point.clone()).z<1.03,'optic recess is real depth, not glass pasted on the nose');
    const rear=hit([0,.32,1.12],[0,0,-1],.4);
    assert.ok(rear,'gun channel ends at a closed bulkhead');

    // The bustle roof slopes down behind the bins. Every rack leg must meet
    // the actual armor there, not merely share the turret's owner group.
    const equipment=tank.root.userData.combatGeometryParts.filter(p=>p.bucket==='turretDetail');
    const rackPosts=equipment.filter(p=>Math.abs(p.max[0]-p.min[0]-.03)<.001
      && Math.abs(p.max[2]-p.min[2]-.03)<.001 && p.max[1]-p.min[1]>.1
      && p.min[2]>-2.05 && p.max[2]<-1.75);
    assert.equal(rackPosts.length,4,'four physical rack supports are present');
    for(const post of rackPosts){
      const x=(post.min[0]+post.max[0])/2,z=(post.min[2]+post.max[2])/2;
      ray.set(turret.localToWorld(new THREE.Vector3(x,1,z)),
        new THREE.Vector3(0,-1,0).transformDirection(turret.matrixWorld));
      ray.far=1;
      const roof=ray.intersectObject(armor,false)[0];
      assert.ok(roof,`${quality}: rack has armor beneath it at ${x}/${z}`);
      const roofY=turret.worldToLocal(roof.point.clone()).y;
      assert.ok(post.min[1]<=roofY+.002,`${quality}: rack foot floats above roof at ${x}/${z}`);
      assert.ok(equipment.some(p=>p!==post && p.max[1]-p.min[1]<.04
        && p.min[0]<=x && p.max[0]>=x && p.min[2]<=z && p.max[2]>=z
        && p.min[1]<=post.max[1] && p.max[1]>=post.max[1]),'rack leg reaches its rail');
    }

    for(const yaw of [0,90,-90,180])for(const pitch of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]){
      state.turretYaw=THREE.MathUtils.degToRad(yaw);
      state.gunPitch=THREE.MathUtils.degToRad(pitch);
      tank.syncFromState(state,0);
      tank.root.updateMatrixWorld(true);
      const position=mount.geometry.getAttribute('position');
      for(let i=0;i<position.count;i++){
        const p=turret.worldToLocal(mount.localToWorld(new THREE.Vector3().fromBufferAttribute(position,i)));
        assert.ok(Math.abs(p.x)<.38&&p.z>1.15,`${quality}: mantlet clears fixed armor at ${yaw}/${pitch}`);
      }
      const expected=new THREE.Vector3(0,0,spec.armor.gunBarrel.lengthM)
        .applyAxisAngle(new THREE.Vector3(1,0,0),-state.gunPitch)
        .add(new THREE.Vector3(...spec.armor.gunPivot))
        .applyAxisAngle(new THREE.Vector3(0,1,0),state.turretYaw)
        .add(new THREE.Vector3(...spec.armor.turretPivot));
      const actual=tank.root.worldToLocal(muzzle.getWorldPosition(new THREE.Vector3()));
      assert.ok(actual.distanceTo(expected)<1e-5,'visible muzzle matches the firing frame through articulation');
    }
    tank.recoilKick(0,1);tank.syncFromState(state,.12);tank.root.updateMatrixWorld(true);
    assert.ok(recoil.position.z<-.05,'barrel recoils within the fixed mantlet');
    recoil.traverseVisible(object=>{
      if(object.userData.shadowOnly||object.userData.authoredShadowProxy)return;
      const positions=object.geometry?.getAttribute('position');if(!positions)return;
      for(let i=0;i<positions.count;i++){
        const p=turret.worldToLocal(object.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,i)));
        assert.ok(p.z>.98,`${quality}: recoiling ${object.name} clears the rear bulkhead`);
      }
    });
    tank.syncFromState(state,1);close(recoil.position.z,0);
  } finally {tank.dispose();}
}
console.log('leopardRevolutionTurretCenter.selftest: ancestor turret, real apertures, closed bearing, HIGH/LOW articulation and recoil passed');
