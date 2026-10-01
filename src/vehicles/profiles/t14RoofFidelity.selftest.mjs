import assert from 'node:assert/strict';
import { Box3, Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide } from 'three';
import {createTank} from '../tankFactory.ts';
import {ensureInteriorFills} from '../interiorFills.ts';

await ensureInteriorFills(['t14']);
for(const quality of ['high','low']) {
  const tank=createTank('t14',null,{proceduralOnly:true,quality,geometryReceipt:true,camoSeed:4242});
  const root=tank.root,hull=root.getObjectByName('rig_hull'),turret=root.getObjectByName('rig_turret');
  assert.equal(hull.userData.object148Design?.revision,2,'complete new hull builder');
  assert.equal(turret.userData.object148Design?.revision,2,'complete new turret builder');
  const parts=root.userData.combatGeometryParts;
  // Measure the authored structural shells, not the descriptive design flags.
  const belly=parts.find(p=>p.bucket==='hull'&&p.min[2]<-4.23&&p.max[2]>4.31&&p.min[1]<.36);
  assert(belly&&belly.max[0]<=1.001&&belly.min[0]>=-1.001,'new deep hull clears both inside shoe lanes');
  const capsule=parts.find(p=>p.bucket==='hull'&&Math.abs(p.min[2]-.70)<1e-4&&p.max[1]>1.85);
  assert(capsule&&capsule.max[2]>2.42,'long three-person crew capsule replaces the old hatch hood');
  const rear=parts.find(p=>p.bucket==='turret'&&Math.abs(p.min[2]+2.30)<1e-4&&Math.abs(p.max[2]-.12)<1e-4);
  assert(rear&&rear.max[0]>1.28&&rear.max[1]>.93,'new chamfered service bustle');
  const cheeks=parts.filter(p=>p.bucket==='turret'&&Math.abs(p.min[2]+.60)<1e-4&&Math.abs(p.max[2]-1.34)<1e-4);
  assert.equal(cheeks.length,2,'two independently authored cheek modules');
  assert(cheeks.every(p=>Math.min(Math.abs(p.min[0]),Math.abs(p.max[0]))>=.3699),'central gun channel stays open between cheeks');
  const race=parts.find(p=>p.bucket==='turret'&&Math.abs(p.min[1]+.02)<1e-4&&Math.abs(p.max[1]-.10)<1e-4);
  assert(race&&Math.abs((race.max[0]-race.min[0])-(race.max[2]-race.min[2]))<1e-4,'circular traverse race');

  const shell=root.getObjectByName('turret');
  const localShell=new Mesh(shell.geometry,new MeshBasicMaterial({side:DoubleSide}));
  localShell.updateMatrixWorld(true);
  const ray=new Raycaster();
  function shellHits(x,y,z,far) {
    ray.set(new Vector3(x,y,z),new Vector3(0,0,-1));ray.far=far;
    return ray.intersectObject(localShell);
  }
  assert.equal(shellHits(0,.72,1.9,1.2).length,0,'no roof bridges the upper gun channel');
  for(const side of [-1,1]) {
    assert.equal(shellHits(side*.81,.575,1.68,.28).length,0,'250 mm sight recess is actual empty space');
    assert(shellHits(side*.81,.575,1.68,.36).length>0,'sight recess has a sealed structural back wall');
  }
  root.updateMatrixWorld(true);
  // Generated fill solids must preserve all deliberately authored apertures.
  for(const [x,y,z,far] of [[0,.72,1.9,1.2],[-.81,.575,1.68,.28],[.81,.575,1.68,.28]]) {
    ray.set(turret.localToWorld(new Vector3(x,y,z)),new Vector3(0,0,-1));ray.far=far;
    assert.equal(ray.intersectObject(turret,true).length,0,'final generated solids preserve channel and optics air');
  }
  const fittings=[];turret.traverse(o=>{if(o.userData.fittingRoot&&o.userData.fitting==='pintleMG')fittings.push(o)});
  assert.equal(fittings.length,1,'one real roof autocannon; no inherited or nested duplicate weapons');
  const station=fittings[0],pitch=station.getObjectByName('auxiliaryWeaponPitch');
  assert(station.userData.remoteControlled&&station.userData.caliberMm===30&&pitch,'working remote 30 mm station');
  assert(Math.abs(station.position.y-.985)<1e-8,'yaw bearing seated on the new roof');
  const gun=root.getObjectByName('rig_gun');
  const guardSeats=root.userData.mudguardFenderSeats.filter(s=>s.label.startsWith('t14_'));
  assert.equal(guardSeats.length,4,'four physically supported guards');
  assert(guardSeats.every(s=>s.supported&&s.directGapM<=.005),'each guard joins a hull carrying rail');
  const originalLocal=station.position.clone();
  for(const [yaw,elevation] of [[0,0],[-1.47,-8],[1.2,20]]) {
    turret.rotation.y=yaw;gun.rotation.x=-elevation*Math.PI/180;
    station.rotation.y=.7;pitch.rotation.x=-.30;root.updateMatrixWorld(true);
    assert(station.position.distanceTo(originalLocal)<1e-10,'roof station stays fixed to its turret seat during aim');
    const box=new Box3().setFromObject(root);
    assert([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite),'finite complete articulated vehicle');
    for(const side of ['left','right']) {
      const antenna=root.getObjectByName(`t14_rear_antenna_${side}`);
      let p=antenna;while(p&&p!==turret)p=p.parent;
      assert.equal(p,turret,'rear instruments follow the turret');
    }
  }
  localShell.material.dispose();tank.dispose();
  console.log(`Object 148 ${quality}: new hull/turret, clear tracks, sealed recessed sights, open gun channel, seated articulated equipment PASS`);
}
