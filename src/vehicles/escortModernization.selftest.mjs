import assert from 'node:assert/strict';
import {Vector3,Mesh,MeshBasicMaterial,DoubleSide,Raycaster} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {ESCORT_FIELD_KITS} from './escortFieldKitLayout.ts';
import {VEHICLE_SIZE_FACTORS} from './vehicleSizePolicy.ts';
import {traceTank,tankPoseFromState} from '../sim/armor.ts';
const mat=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster();
const pose=tankPoseFromState({pos:new Vector3(),yaw:0,visualPitch:0,visualRoll:0,turretYaw:0,gunPitch:0});
for(const quality of ['high','low'])for(const [id,c] of Object.entries(ESCORT_FIELD_KITS)){
 const spec=getSpec(id),f=VEHICLE_SIZE_FACTORS[id]??1,t=createTank(id,null,{quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false});
 const proxies=[];
 try{
  t.root.updateMatrixWorld(true);
  t.root.traverse(o=>{if(o.isMesh&&o.name==='hullExternalArmor'){const m=new Mesh(o.geometry,mat);m.updateMatrixWorld(true);proxies.push(m);}});
  const plates=spec.armor.hullPlates.filter(p=>p.surfaceGroup?.startsWith('escort:fieldKit:'));
  assert.equal(plates.length,c.panels*2*18,'five exposed folds and two caps per cassette');
  for(const p of plates){
   const verts=p.verts.map(v=>new Vector3(...v)),center=verts.reduce((a,b)=>a.add(b),new Vector3()).multiplyScalar(1/3);
   const normal=verts[1].clone().sub(verts[0]).cross(verts[2].clone().sub(verts[0])).normalize();
   ray.set(center.clone().addScaledVector(normal,.006),normal.clone().negate());ray.near=0;ray.far=.012;
   assert(ray.intersectObjects(proxies).some(h=>h.point.distanceTo(center)<1e-4),`${id}/${quality}/${p.name}: finite armor follows the rendered cassette`);
  }
  const kitHits=(a,b)=>traceTank(new Vector3(...a),new Vector3(...b),pose,spec.armor)
   .filter(h=>h.kind==='plate'&&h.plate.surfaceGroup?.startsWith('escort:fieldKit:'));
  for(const side of [-1,1])for(let i=0;i<c.panels;i++){
   const z=(c.rear+(i+.5)*(c.front-c.rear)/c.panels)*f;
   assert.equal(kitHits([side*(c.outer+.3)*f,(c.hem+.2)*f,z],[side*(c.inner+.01)*f,(c.hem+.2)*f,z]).length,1,`${id}: side panel absorbs once`);
   assert.equal(kitHits([side*(c.outer+.3)*f,(c.hem-.1)*f,z],[side*(c.inner+.01)*f,(c.hem-.1)*f,z]).length,0,`${id}: cage air never becomes invisible armor`);
  }
  if(id==='upior'){
   const turret=t.root.getObjectByName('rig_turret'),gun=t.root.getObjectByName('rig_gun');
   assert(Math.abs(turret.position.y-1.64*f)<1e-5,'raised turret ring');
   const mouth=spec.gun.launcherMuzzles[0];assert.deepEqual([mouth.x,mouth.y,mouth.z],[1.10*f,.37*f,.83*f]);
   const stock=[];turret.traverse(o=>{if(o.isMesh&&!/Fill|Proxy|Shadow|gun/i.test(o.name)){
    const m=new Mesh(o.geometry,mat);m.updateMatrixWorld(true);stock.push(m);
   }});
   ray.set(new Vector3(mouth.x,mouth.y,mouth.z+.01),new Vector3(0,0,-1));ray.near=0;ray.far=.9*f;
   assert.equal(ray.intersectObjects(stock).length,0,'launcher has a real deep mouth, not a capped tube');
   for(const yaw of [-1.4,0,1.4]){
    turret.rotation.y=yaw;gun.rotation.x=-.2;t.root.updateMatrixWorld(true);
    const expected=turret.localToWorld(new Vector3(mouth.x,mouth.y,mouth.z));
    assert(t.gunMuzzleWorld(new Vector3(),0,true).distanceTo(expected)<1e-5,'missile launches from its independently owned side pod');
   }
   const gear=t.root.getObjectByName('rig_hull').userData.runningGearReceipts.at(-1);
   assert.equal(gear.wheelZs.length,6);assert.equal(gear.wheelR,.285);assert.equal(gear.trackW,.44);
  }
 }finally{t.dispose();}
}
mat.dispose();console.log('escortModernization: high/low finite cassette armor, open cage air, raised Upior turret and open articulated missile tube PASS');
