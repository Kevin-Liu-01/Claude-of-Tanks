import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';

// Source-only datums from the canonical supplied files. Complete native rays
// include the loaded interior stock, so a later shell/fill cannot hide a lens.
const ids = ['cv90105_tml_x', 'sabra_mk2_x'];
await ensureInteriorFills(ids);
const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
function firstHit(tank, owner, x, y, z, direction) {
  const origin = owner.localToWorld(new THREE.Vector3(x,y,z));
  const dir = new THREE.Vector3(...direction).transformDirection(owner.matrixWorld);
  const ray = new THREE.Raycaster(origin,dir);
  const hits = ray.intersectObject(tank.root).filter(hit => {
    for(let object=hit.object;object;object=object.parent) if(!object.visible) return false;
    return !hit.object.userData.shadowOnly;
  });
  assert.ok(hits.length, 'complete native geometry has a front-facing surface');
  return { mesh:hits[0].object.name, point:owner.worldToLocal(hits[0].point.clone()) };
}
for (const quality of ['high','low']) for (const id of ids) {
  assert.ok(hasInteriorFills(id), `${id}: generated interior record must be loaded`);
  const tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true});
  let roofGunDisposals = null;
  try {
    tank.root.traverse(object=>{if(object.isMesh && object.material?.colorWrite!==false) object.material=material;});
    tank.root.updateMatrixWorld(true);
    const turret=tank.root.getObjectByName('rig_turret'), gun=tank.root.getObjectByName('rig_gun');
    if(id==='cv90105_tml_x') {
      for(const [yaw,pitch] of [[0,0],[.65,-.12],[-.55,.20]]) {
        turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
        for(const [x,y,z] of [[-.4058,-.02445,.360],[.400,.046,.1435]]) {
          const hit=firstHit(tank,gun,x,y,1.3,[0,0,-1]);
          assert.equal(hit.mesh,'gunMountDark', `${quality}: actual non-recoil optical face is the first complete-gun hit`);
          assert.ok(Math.abs(hit.point.z-z)<.001, `${quality}: lens retains its source depth through yaw/pitch`);
        }
        const leftRim=firstHit(tank,gun,-.4058+.055,-.02445,1.3,[0,0,-1]);
        assert.ok(Math.abs(leftRim.point.z-.443)<.001,'left receiver has a real 83mm recess behind its rim');
        const rightRim=firstHit(tank,gun,.475,.046,1.3,[0,0,-1]);
        assert.ok(Math.abs(rightRim.point.z-.1745)<.001,'right receiver retains its separate shallower frame');
      }
    } else {
      const fitting=tank.root.getObjectByName('sabraSourceCupolaWeapon');
      assert.equal(fitting?.parent,turret,'real roof weapon belongs to the turret yaw rig');
      assert.equal(fitting.userData.fitting,'pintleMG');
      assert.equal(fitting.userData.fittingRoot,true);
      const weapon=fitting.getObjectByName('sabraCupolaReceiverAndBarrel');
      assert.ok(weapon?.isMesh && weapon.visible,'fitting contains the existing visible weapon stock');
      assert.equal(weapon.userData.combatHitboxRole,'equipment');
      assert.equal(weapon.geometry.attributes.position.count/3,quality==='high'?172:140,
        'one original receiver and tube, with no added proxy or duplicate weapon');
      assert.equal(weapon.parent.isLOD,true);
      assert.equal(weapon.parent.levels[1].distance,quality==='high'?150:64,
        'source weapon retains the previous turret-detail distance reduction');
      roofGunDisposals={count:0};
      weapon.geometry.addEventListener('dispose',()=>roofGunDisposals.count++);
      for(const side of [-1,1]) for(const dx of [-.0657,.0657]) {
        const hit=firstHit(tank,tank.root,side*.7473+dx,1.31665,3.6,[0,0,-1]);
        assert.equal(hit.mesh,'hullGlass', `${quality}: all four lamp faces remain exposed`);
        assert.ok(Math.abs(hit.point.z-3.1896)<.001,'paired lamps retain measured face depth');
      }
      for(const yaw of [0,.7]) {
        turret.rotation.y=yaw;tank.root.updateMatrixWorld(true);
        // Complete native first hits include cupola, main gun and loaded fills.
        // Yaw moves these real surfaces together; no detached fitting marker.
        const muzzle=firstHit(tank,turret,-.5059,2.7738-1.57,2,[0,0,-1]);
        assert.equal(muzzle.mesh,'sabraCupolaReceiverAndBarrel');
        assert.ok(Math.abs(muzzle.point.z-(1.3011-.05))<.00001,
          'existing 790mm cupola barrel retains its source-forward endpoint');
        const receiver=firstHit(tank,turret,-.5059,2.815-1.57,2,[0,0,-1]);
        assert.equal(receiver.mesh,'sabraCupolaReceiverAndBarrel');
        assert.ok(Math.abs(receiver.point.z-(.54-.05))<.00001,
          'existing receiver remains the exposed complete-scene front hit');
        const roof=firstHit(tank,turret,-.67,2,-1.41973,[0,-1,0]);
        assert.ok(Math.abs(roof.point.y-(2.58052-1.57))<.001,'rear circular fitting stays behind the cupola on −X');
        const cap=firstHit(tank,turret,-.53295,2,.20,[0,-1,0]);
        assert.ok(Math.abs(cap.point.y-(2.928-1.57))<.006,'forward crown uses the measured curved cap height');
      }
    }
  } finally { tank.dispose(); }
  if(roofGunDisposals) assert.equal(roofGunDisposals.count,1,'real roof weapon geometry is disposed exactly once');
}
material.dispose();
console.log('europeSourceDetail: loaded HIGH/LOW complete-stock optical recesses, four exposed lamps, roof cover, curved cap and real cupola weapon ownership pass');
