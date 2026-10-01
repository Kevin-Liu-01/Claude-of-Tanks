import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';

// Independent physical witnesses for the owner's open gun approach. These
// intentionally include generated interiors, both qualities and posed rigs.
const datums={leo2a7v_x:[0,.2426,1.50],leo2a6m_x:[-.0065,.3704,1.442],leo2a4m_x:[-.0773,.258,1.55]};
let air=0,poses=0;
for(const [id,pivot] of Object.entries(datums))for(const quality of ['high','low']) {
  const t=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    const turret=t.root.getObjectByName('rig_turret'),gun=t.root.getObjectByName('rig_gun');
    const mount=t.root.getObjectByName('gunMount'),recoil=t.root.getObjectByName('rig_recoil');
    assert.equal(mount.parent,gun);assert.notEqual(mount.parent,recoil);
    assert.ok(gun.position.distanceTo(new T.Vector3(...pivot))<1e-5,`${id}: original trunnion`);
    const fixed=[];
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
      const origin=gun.localToWorld(new T.Vector3(0,0,1.2));
      const contact=new T.Raycaster(origin,direction,0,1.4).intersectObject(mount,false)[0];
      assert.ok(contact&&contact.distance<.6,`${id}: receiving collar surrounds bore`);
      poses++;
    }
  } finally {t.dispose();}
}
console.log(`Leopard gun openings: ${air} air witnesses, ${poses} articulation poses PASS (HIGH/LOW, fills included)`);
