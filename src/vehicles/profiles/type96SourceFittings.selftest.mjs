import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';

await ensureInteriorFills(['type96b_x']);
assert.ok(hasInteriorFills('type96b_x'), 'actual generated Type96 fill data is required');
const rows=[];
for(const quality of ['high','low']) {
  const tank=createTank('type96b_x',null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});
  try {
    const hull=tank.root.getObjectByName('rig_hull'),turret=tank.root.getObjectByName('rig_turret');
    const pivot=turret.position.clone();
    function ray(owner,point,direction,far) {
      tank.root.updateMatrixWorld(true);
      const surfaces=[];
      tank.root.traverseVisible(mesh=>{if(mesh.isMesh)surfaces.push(mesh)});
      const local=new THREE.Vector3(...point);if(owner===turret)local.sub(pivot);
      const hit=new THREE.Raycaster(owner.localToWorld(local),new THREE.Vector3(...direction).transformDirection(owner.matrixWorld),0,far*owner.getWorldScale(new THREE.Vector3()).x).intersectObjects(surfaces,false)[0];
      if(!hit)return null;
      const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
      assert.equal(material.side,THREE.FrontSide,'installed source stock must be outward FrontSide');
      const position=owner.worldToLocal(hit.point.clone());if(owner===turret)position.add(pivot);
      return {mesh:hit.object,position};
    }
    for(const yaw of [0,.73,-.81]) {
      turret.rotation.y=yaw;
      // Source Object_12 stem reaches continuously through the native roof
      // to the existing upper rod; these witnesses lie inside the old air gap.
      for(const y of [2.30,2.35,2.40]) {
        const hit=ray(turret,[.90,y,-1.32903],[-1,0,0],.2);
        assert.ok(hit&&hit.mesh.name==='turretDetail'&&Math.abs(hit.position.x-.7905)<.002,
          `missing mast stem: ${quality}/${yaw}/${y}`);
      }
      const collar=ray(turret,[.797,2.49,-1.32903],[0,-1,0],.10);
      assert.ok(collar&&collar.mesh.name==='turretDetail'&&Math.abs(collar.position.y-2.45766)<.0005,'square upper collar seats the original rod');
      for(const x of [-.79935,-.25125,.25125,.79935]) {
        const hit=ray(hull,[x,1.57845,-3.55],[0,0,1],.20);
        assert.ok(hit&&hit.mesh.name==='hullDetail'&&Math.abs(hit.position.z+3.4727)<.0005,'source rear latch remains exposed ahead of its receiving cap');
      }
    }
    turret.rotation.y=0;
    // Held-out raw Object_23 top-plane rays (canonical +4.2 mm Y).
    // All five must be first visible, not hidden inside the former hull roof.
    for(const [x,z,y] of [[-.30,3.30,1.262553],[.30,3.30,1.262553],
      [-.75,2.85,1.39804],[0,2.85,1.398067],[.75,2.85,1.39804],
      [.30,3.44,1.205351],[.30,3.54,1.16449]]) {
      const hit=ray(hull,[x,1.8,z],[0,-1,0],1);
      assert.ok(hit&&hit.mesh.name==='hullExternalArmor'&&Math.abs(hit.position.y-y)<.002,
        `raised source armor must be first visible ${quality}/${x}/${z}: ${hit?.mesh.name}/${hit?.position.y}`);
      assert.equal(hit.mesh.userData.combatHitboxRole,'externalArmor','source protective stock must carry permanent armor ownership');
    }
    // The independently measured underside/receiver overlap must be finite:
    // blocks cannot pass merely by floating at their correct visible height.
    tank.root.updateMatrixWorld(true);
    const armor=tank.root.getObjectByName('hullExternalArmor'),shell=tank.root.getObjectByName('hull');
    for(const [x,z] of [[-.30,3.30],[.30,3.30],[-.75,2.85],[0,2.85],[.75,2.85]]) {
      const cast=(mesh,y,dy)=>{
        const hit=new THREE.Raycaster(hull.localToWorld(new THREE.Vector3(x,y,z)),new THREE.Vector3(0,dy,0).transformDirection(hull.matrixWorld),0,2).intersectObject(mesh,false)[0];
        assert.ok(hit,'closed armor underside and solid receiver must both exist');
        return hull.worldToLocal(hit.point.clone()).y;
      };
      const underside=cast(armor,0,1),receiver=cast(shell,2,-1);
      assert.ok(receiver>=underside&&receiver-underside<.025,`finite seated armor ${quality}/${x}/${z}: ${receiver-underside}`);
    }
    // Reinserting the old coarse roof must fail the first-visible test. Its
    // measured Y1.29862 at this witness is above the real block Y1.26255.
    const wrong=new THREE.Mesh(new THREE.BoxGeometry(.2,.02,.10),new THREE.MeshBasicMaterial());
    wrong.name='counterfactualCoarseGlacis';wrong.position.set(.30,1.288621,3.30);hull.add(wrong);
    assert.equal(ray(hull,[.30,1.8,3.30],[0,-1,0],1)?.mesh.name,wrong.name,'first-hit proof must reject stock hidden by the old roof');
    hull.remove(wrong);wrong.geometry.dispose();wrong.material.dispose();
    rows.push({quality,mastAndLatches:true,visibleBowBlocks:5});
  } finally {tank.dispose()}
}
console.log('type96SourceFittings: actual filled HIGH/LOW source receivers pass',JSON.stringify(rows));
