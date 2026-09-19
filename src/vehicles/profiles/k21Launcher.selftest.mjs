import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';

await ensureInteriorFills(['k21_x']);
assert.ok(hasInteriorFills('k21_x'), 'test requires the real generated K21 fills loaded');
const angle=Math.PI/9, sin=Math.sin(angle), cos=Math.cos(angle);
const axis=new THREE.Vector3(0,sin,cos);
const canonical=(x,v,n)=>new THREE.Vector3(x-.000015,v*cos+n*sin-.0138,-v*sin+n*cos);
const rawN=p=>(p.y+.0138)*sin+p.z*cos;
const rows=[];
for(const quality of ['high','low']) {
  const tank=createTank('k21_x',null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});
  try {
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    assert.ok(turret&&gun,'actual turret and gun rigs are required');
    let fillMeshes=0;
    tank.root.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.interiorFill)fillMeshes++});
    assert.ok(fillMeshes>0,'registered fill data must actually be installed in the tested scene');
    const restPivot=turret.position.clone();
    function ray(x,v,n,direction,far) {
      tank.root.updateMatrixWorld(true);const surfaces=[];
      tank.root.traverseVisible(mesh=>{if(mesh.isMesh)surfaces.push(mesh)});
      const origin=turret.localToWorld(canonical(x,v,n).sub(restPivot));
      const d=axis.clone().multiplyScalar(direction).transformDirection(turret.matrixWorld);
      const scale=turret.getWorldScale(new THREE.Vector3()).x;
      const hit=new THREE.Raycaster(origin,d,0,far*scale).intersectObjects(surfaces,false)[0];
      if(!hit)return null;
      const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
      assert.equal(material.side,THREE.FrontSide,'actual first-visible stock must retain FrontSide winding');
      return {name:hit.object.name,n:rawN(turret.worldToLocal(hit.point.clone()).add(restPivot))};
    }
    for(const [yaw,pitch]of[[0,0],[.73,-.32],[-.81,.25]]) {
      turret.rotation.y=yaw;gun.rotation.x=pitch;
      for(const [i,v]of[2.71787735,2.90094968].entries()) {
        const offset=i*.0012817;
        // Full raw-source Object_27 first-visible witnesses, sampled off seams.
        for(const [r,expected]of[[0,.3939056],[.02,.3907381],[.04,.3823858],[.06,.3635324],[.068,.3479754]]) {
          const a=.173,hit=ray(1.24239+Math.cos(a)*r,v+Math.sin(a)*r,.70,-1,.50);
          assert.ok(hit&&hit.name==='turretDetail',`closed cap must be first visible stock ${quality}/${yaw}/${i}/${r}: ${JSON.stringify(hit)}`);
          assert.ok(Math.abs(hit.n-expected-offset)<.003,`cap is recessed and convex, not the old flat cover: ${JSON.stringify(hit)}`);
        }
        for(const a of[.173,1.173,2.173,3.173,4.173,5.173]) {
          const rim=ray(1.24239+Math.cos(a)*.080,v+Math.sin(a)*.080,.70,-1,.50);
          assert.ok(rim&&rim.name==='turretDetail'&&Math.abs(rim.n-.4243)<.0005,'real perforated receiving rim remains in front of the cap');
          assert.equal(ray(1.24239+Math.cos(a)*.050,v+Math.sin(a)*.050,.4245,-1,.035),null,'finite air lies ahead of the recessed closed terminal');
        }
        const back=ray(1.24239,v,-.95,1,.10);
        assert.ok(back&&back.name==='turretDetail'&&Math.abs(back.n+.8886)<.0005,'closed rear receiver supports the full tube, no floating front cap');
      }
      rows.push({quality,yaw,pitch,closedCaps:2});
    }
    // Negative control: a flat plate across either aperture must become the
    // first visible surface. A mesh-name-only or through-stock ray would miss it.
    turret.rotation.y=0;gun.rotation.x=0;
    const badGeometry=new THREE.BoxGeometry(.16,.40,.008),badMaterial=new THREE.MeshBasicMaterial();
    const bad=new THREE.Mesh(badGeometry,badMaterial);bad.name='counterfactualFlatCover';
    bad.position.copy(canonical(1.24239,2.81,.4283).sub(restPivot));bad.rotation.x=-angle;turret.add(bad);
    for(const v of[2.71787735,2.90094968]) {
      const hit=ray(1.24239,v,.70,-1,.50);
      assert.equal(hit?.name,'counterfactualFlatCover','a plate blocking the real terminal must fail first-hit ownership');
      assert.ok(hit.n>.4243,'negative cover lies ahead of the real cap');
    }
    turret.remove(bad);badGeometry.dispose();badMaterial.dispose();
  } finally {tank.dispose()}
}
console.log('k21Launcher: full-scene HIGH/LOW FrontSide closed curved caps, receiving rim/air, rear support and turret yaw/gun-pitch independence pass',JSON.stringify(rows));
