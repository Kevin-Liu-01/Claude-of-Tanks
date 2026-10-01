import assert from 'node:assert/strict';
import {Vector3,Raycaster,Mesh,MeshBasicMaterial,DoubleSide} from 'three';
import {createTank} from '../tankFactory.ts';
import {ensureInteriorFills} from '../interiorFills.ts';

await ensureInteriorFills(['amx30b2']);
for(const quality of ['high','low']) {
  const tank=createTank('amx30b2',null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
  try {
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    const parts=tank.root.userData.combatGeometryParts;
    const cupola=parts.filter(p=>p.bucket==='turretCupola');
    assert(cupola.length>=4,'structural cupola and loader coaming remain hittable');
    const shell=turret.getObjectByName('turret');
    const localShell=new Mesh(shell.geometry,new MeshBasicMaterial({side:DoubleSide}));
    localShell.updateMatrixWorld(true);
    const cast=(start,dir,far)=>new Raycaster(new Vector3(...start),new Vector3(...dir),0,far).intersectObject(localShell);
    // Both structural rings overlap the casting, not a free-floating roof disk.
    // Independent source station coordinates: the donor AMX-30B cupola is
    // negative local X. Camera-facing right/left must never mirror this pair.
    for(const [x,z,bottom] of [[-.553,-.520,.680],[.552,-.439,.6955]]) {
      const hits=cast([x,1.3,z],[0,-1,0],1.3).map(h=>h.point.y);
      assert(hits.some(y=>y>=bottom-.015&&y<=bottom+.025),'coaming sits on the cast roof');
    }
    const roots=[];turret.traverse(o=>{if(o.userData.fittingRoot&&o.userData.fitting==='pintleMG')roots.push(o)});
    assert.equal(roots.length,2,'exactly two complete roof machine guns');
    const names=['amx30b2_commander_machine_gun','amx30b2_loader_machine_gun'];
    assert(turret.getObjectByName(names[0]).position.x<-.8,'commander MG follows negative-X cupola');
    assert(turret.getObjectByName(names[1]).position.x>.8,'loader MG follows positive-X hatch');
    const localCupola=new Mesh(turret.getObjectByName('turretCupola').geometry,localShell.material);
    localCupola.updateMatrixWorld(true);
    const upper=new Raycaster(new Vector3(-.553,1.5,-.520),new Vector3(0,-1,0),0,1.5).intersectObject(localCupola);
    assert(upper.some(h=>h.point.y>1.05),'raised structural commander cupola at source station');
    assert(!new Raycaster(new Vector3(.552,1.5,-.439),new Vector3(0,-1,0),0,.69)
      .intersectObject(localCupola).length,'opposite station stays a low loader hatch');
    assert(new Raycaster(new Vector3(-.883,.79,-.490),new Vector3(0,1,0),0,.04)
      .intersectObject(localCupola).length,'commander bearing foot overlaps the structural cupola');
    for(const name of names) {
      const weapon=turret.getObjectByName(name);assert(weapon&&roots.includes(weapon));
      const meshes=[];weapon.traverse(o=>{if(o.isMesh)meshes.push(o)});
      const body=meshes.find(m=>m.name==='browningDerivedMachineGunBody');
      assert(body,'complete receiver and barrel stock');body.geometry.computeBoundingBox();
      const size=body.geometry.boundingBox.getSize(new Vector3());
      assert(size.z>.70&&size.y>.20,'both MGs retain full receiver, bearing and connected barrel');
      const p=weapon.position;
      assert(cast([p.x,p.y+.1,p.z],[0,-1,0],.7).length,'MG bearing has a structural roof underneath');
    }
    const rest=roots.map(o=>o.position.clone());
    for(const [yaw,pitch] of [[0,0],[-1.47,-.15],[1.2,.3]]) {
      turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
      roots.forEach((weapon,i)=>{
        assert.equal(weapon.parent,turret,'roof mount stays under turret yaw, outside main-gun pitch');
        assert(weapon.position.distanceTo(rest[i])<1e-10);
        const expected=turret.localToWorld(rest[i].clone());
        assert(weapon.getWorldPosition(new Vector3()).distanceTo(expected)<1e-8,'actual fitting follows yaw');
      });
    }
    localShell.material.dispose();
  } finally {tank.dispose();}
}
console.log('AMX-30B2: structural cupola, roof seats, two complete MGs and yaw/pitch ownership PASS');
