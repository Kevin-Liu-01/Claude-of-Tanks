import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';

// Independent physical witnesses for the owner's open gun approach. These
// intentionally include generated interiors, both qualities and posed rigs.
const datums={leo2a7v_x:[0,.2426,1.50],leo2a6m_x:[-.0065,.3704,1.442],leo2a4m_x:[-.0773,.258,1.55]};
let air=0,poses=0,rearClearance=0;
for(const [id,pivot] of Object.entries(datums))for(const quality of ['high','low']) {
  const t=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    const turret=t.root.getObjectByName('rig_turret'),gun=t.root.getObjectByName('rig_gun');
    const mount=t.root.getObjectByName('gunMount'),recoil=t.root.getObjectByName('rig_recoil');
    assert.equal(mount.parent,gun);assert.notEqual(mount.parent,recoil);
    assert.ok(gun.position.distanceTo(new T.Vector3(...pivot))<1e-5,`${id}: original trunnion`);
    const fixed=[],movingStock=[];
    gun.traverse(o=>{if(o.isMesh&&/^(gunMount|gunInteriorFill)/.test(o.name))movingStock.push(o);});
    turret.traverse(o=>{if(o.isMesh&&(o.name==='turret'||o.name==='turretInteriorFill'))fixed.push(o);});
    for(const yaw of [0,-1.1,1.1])for(const pitch of [-.35,0,.175]) {
      turret.rotation.y=yaw;gun.rotation.x=pitch;t.root.updateMatrixWorld(true);
      const down=new T.Vector3(0,-1,0).transformDirection(turret.matrixWorld);
      for(const dx of [-.30,0,.30])for(const dz of [-.28,0,.3,.6,.9]) {
        const origin=turret.localToWorld(new T.Vector3(pivot[0]+dx,pivot[1]+1,pivot[2]+dz));
        const hits=new T.Raycaster(origin,down,0,1.31).intersectObjects(fixed,false);
        assert.equal(hits.length,0,`${id}/${quality}: open approach x${dx} z${dz}: ${hits[0]?.object.name}`);air++;
      }
      // Both physical bearing axes meet the pitching trunnion on their real
      // receiving surface; yaw and elevation do not open a lateral joint.
      for(const side of [-1,1]) {
        const origin=gun.localToWorld(new T.Vector3(side*.50,0,0));
        const direction=new T.Vector3(-side,0,0).transformDirection(gun.matrixWorld);
        const hits=new T.Raycaster(origin,direction,0,.25).intersectObjects(fixed,false);
        assert.ok(hits.length,`${id}: fixed bearing contacts trunnion axis`);
      }
      const muzzle=t.root.getObjectByName('gun');assert.equal(muzzle.parent,recoil);
      const direction=new T.Vector3(0,0,-1).transformDirection(gun.matrixWorld);
      const origin=gun.localToWorld(new T.Vector3(0,0,1.8));
      const contact=new T.Raycaster(origin,direction,0,1.4).intersectObject(mount,false)[0];
      assert.ok(contact&&contact.distance<.85,`${id}: receiving collar surrounds bore`);
      // Both rear shoulders remain close to fixed armor throughout the sweep.
      // The old short shield had no receiving stock here at all.
      for(const side of [-1,1]) {
        const sample=gun.localToWorld(new T.Vector3(side*.34,.10,-.44));
        const outward=new T.Vector3(side,0,0).transformDirection(gun.matrixWorld);
        // Start outside and look inward to measure the actual outward-facing skin.
        const outside=gun.localToWorld(new T.Vector3(side*.48,.10,-.44));
        const inward=outward.clone().negate();
        const skin=new T.Raycaster(outside,inward,0,.25).intersectObject(mount,false)[0];
        assert.ok(skin&&skin.distance>=.095&&skin.distance<=.12,`${id}: broad rear rocker occupies the receiver`);
        const wall=new T.Raycaster(sample,outward,0,.15).intersectObjects(fixed,false)[0];
        assert.ok(wall,`${id}: rocker shoulder seats inside fixed cheek`);
        assert.ok(wall.distance-(.14-skin.distance)>.015&&wall.distance-(.14-skin.distance)<.04,
          `${id}: finite side running clearance`);
      }
      // Measure both native skins along rays through the rear receiver. This
      // catches a pitching rocker intersecting its fixed curved return even
      // when the neutral front view and lateral shoulder checks look correct.
      for(const x of [-.30,0,.30])for(let degrees=-70;degrees<=70;degrees+=10) {
        const angle=degrees*Math.PI/180;
        const center=turret.localToWorld(new T.Vector3(pivot[0]+x,pivot[1],pivot[2]));
        const radial=new T.Vector3(0,Math.sin(angle),-Math.cos(angle)).transformDirection(turret.matrixWorld);
        const wall=new T.Raycaster(center,radial,.25,.90).intersectObjects(fixed,false)[0];
        if(!wall)continue; // Above/below the finite shell is intentionally open.
        const outside=center.clone().addScaledVector(radial,2);
        const skin=new T.Raycaster(outside,radial.clone().negate(),0,1.8).intersectObjects(movingStock,false)[0];
        if(!skin)continue;
        const clearance=wall.distance-(2-skin.distance);
        assert.ok(clearance>=.028,`${id}/${quality}: rear receiver clearance ${clearance} at x${x} ${degrees}°, pitch ${pitch}; ${wall.object.name} r=${wall.distance}, moving r=${2-skin.distance}`);
        rearClearance++;
      }
      if(pitch===0)for(const x of [-.30,0,.30])for(const z of [-.35,0,.35,.70]) {
        const origin=gun.localToWorld(new T.Vector3(x,.9,z));
        const down=new T.Vector3(0,-1,0).transformDirection(gun.matrixWorld);
        const cover=new T.Raycaster(origin,down,0,1).intersectObject(mount,false)[0];
        assert.ok(cover&&cover.distance<.71,`${id}: full armored cover bridges the former trench x${x} z${z}`);
      }
      poses++;
    }
  } finally {t.dispose();}
}
assert.ok(rearClearance>=300, `rear receiver coverage: ${rearClearance}`);
console.log(`Leopard gun openings: ${air} air witnesses, ${poses} articulation poses, ${rearClearance} rear clearance witnesses PASS (HIGH/LOW, fills included)`);
