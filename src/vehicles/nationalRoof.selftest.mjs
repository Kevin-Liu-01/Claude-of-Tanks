import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Box3,Vector3,Raycaster,Mesh,MeshBasicMaterial,DoubleSide} from 'three';
import {createTank} from './tankFactory.ts';
import {NATIONAL_ROOF_LOADOUTS} from './nationalRoofConfig.ts';
import {auxiliaryWeaponProfile} from './auxiliaryWeapons.ts';

import {topIndex} from './roofSweep.test-support.mjs';

for(const quality of ['high','low']){
 const shapes=new Set();
 for(const [id,l] of Object.entries(NATIONAL_ROOF_LOADOUTS)){
  const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});
  const turret=tank.root.getObjectByName('rig_turret'),station=turret.getObjectByName(l.name),pitch=station?.getObjectByName('auxiliaryWeaponPitch');
  assert(station&&pitch,`${id}: full yaw and pitch ownership`);
  assert.equal(station.userData.caliberMm,l.caliber);
  assert.equal(auxiliaryWeaponProfile(l.caliber,id).shell.caliberMm,l.caliber);
  const stock=[];pitch.traverse(o=>{if(o.isMesh)stock.push(o)});
  const hash=createHash('sha256');for(const m of stock)hash.update(Buffer.from(m.geometry.attributes.position.array.buffer));shapes.add(hash.digest('hex'));
  tank.root.updateMatrixWorld(true);
  const socket=new Vector3(...station.userData.auxiliaryMuzzle).sub(new Vector3(...station.userData.auxiliaryPivot));
  const world=socket.clone().applyMatrix4(pitch.matrixWorld);
  const mat=new MeshBasicMaterial({side:DoubleSide}),proxies=stock.map(m=>{const o=new Mesh(m.geometry,mat);o.matrixAutoUpdate=false;o.matrix.copy(m.matrixWorld);o.updateMatrixWorld(true);return o});
  const ray=new Raycaster(world.clone().add(new Vector3(0,0,.03)),new Vector3(0,0,-1),0,.2);
  const floor=ray.intersectObjects(proxies,false)[0];
  assert(floor&&floor.distance>.07&&floor.distance<.12,`${id}: muzzle has a real recessed bore at the firing socket`);
  // Four radial probes land on its metal mouth, excluding an offset/floating socket.
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   ray.set(world.clone().add(new Vector3(dx*(l.caliber===30?.04:.03),dy*(l.caliber===30?.04:.03),.03)),new Vector3(0,0,-1));
   assert(ray.intersectObjects(proxies,false)[0]?.distance<.04,`${id}: physical muzzle rim`);
  }
  const width=l.caliber===30?.245:.185,side=-l.feedSide;
  const footWorld=new Vector3(side*(width/2-.025),.35,.015).applyMatrix4(pitch.matrixWorld);
  ray.set(footWorld,new Vector3(0,-1,0));ray.near=0;ray.far=.45;
  const crossing=ray.intersectObjects(proxies,false).filter(h=>Math.abs(h.face.normal.y)>.001)
   .map(h=>({d:h.distance,enter:h.face.normal.y>0?1:-1}))
   .filter((h,i,a)=>!i||Math.abs(h.d-a[i-1].d)>1e-6||h.enter!==a[i-1].enter);
  let depth=0,previous=0;
  for(const h of crossing){
   if(Math.max(previous,.35-.205)<Math.min(h.d,.35-.03)-.001)assert(depth>0,`${id}: sight foot has an air gap to its receiver`);
   depth+=h.enter;previous=h.d;
  }
  assert(previous>.35-.03,`${id}: sight-foot probe reaches the receiver body`);
  mat.dispose();
  // Exclude the station's own bearings, which deliberately contact its stock.
  const fixed=[];turret.traverse(o=>{
   if(!o.isMesh||o.userData.presentationInvisible)return;
   for(let q=o;q;q=q.parent)if(q===station||q===tank.root.getObjectByName('rig_gun'))return;
   if(o.name.includes('Shadow'))return;fixed.push(o);
  });
  const floorY=station.getWorldPosition(new Vector3()).y;
  const heightAt=topIndex(fixed,floorY+.10),local=[];
  const inverse=pitch.matrixWorld.clone().invert(),unique=new Map();
  for(const m of stock){const p=m.geometry.attributes.position;
   for(let i=0;i<p.count;i++){
    const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).applyMatrix4(inverse);
    unique.set(v.toArray().map(n=>n.toFixed(6)).join(','),v);
   }
   for(let i=0;i<p.count;i+=3){
    const v=new Vector3();for(let k=0;k<3;k++)v.add(new Vector3().fromBufferAttribute(p,i+k));
    v.multiplyScalar(1/3).applyMatrix4(m.matrixWorld).applyMatrix4(inverse);local.push(v);
   }
  }
  local.push(...unique.values());
  const gunProfile=auxiliaryWeaponProfile(l.caliber,id);
  const supports=[];station.traverse(o=>{if(o.isMesh&&o.name==='sourceMachineGun_yawSupport')supports.push(o);});
  const supportMat=new MeshBasicMaterial({side:DoubleSide});
  const supportVolumes=supports.map(m=>{
   const o=new Mesh(m.geometry,supportMat);o.matrixAutoUpdate=false;o.matrix.copy(m.matrixWorld);o.updateMatrixWorld(true);
   return {mesh:o,bounds:new Box3().setFromObject(o)};
  });
  const supportRay=new Raycaster(new Vector3(),new Vector3(0,1,0));
  const axle=pitch.getWorldPosition(new Vector3());
  for(const elevation of [-gunProfile.depressionRad,0,gunProfile.elevationRad]){
   pitch.rotation.x=-elevation;tank.root.updateMatrixWorld(true);
   for(const v of local){
    const p=v.clone().applyMatrix4(pitch.matrixWorld);
    // Only the true cylindrical trunnion is intended to intersect its bearing.
    if(Math.hypot(p.y-axle.y,p.z-axle.z)<.082)continue;
    for(const {mesh,bounds} of supportVolumes){
     if(!bounds.containsPoint(p))continue;
     supportRay.ray.origin.copy(p);
     const distances=supportRay.intersectObject(mesh).map(h=>h.distance).filter((d,i,a)=>i===0||Math.abs(d-a[i-1])>1e-5);
     assert(distances.length%2===0||distances[0]<.002,`${id}: receiver/guard inside support at elevation ${elevation}: ${p.toArray()}`);
    }
   }
  }
  supportMat.dispose();pitch.rotation.x=0;tank.root.updateMatrixWorld(true);
  let samples=0,positive=0;
  for(let degrees=0;degrees<360;degrees+=10)for(const elevation of [-gunProfile.depressionRad,0,gunProfile.elevationRad]){
   station.rotation.y=degrees*Math.PI/180;pitch.rotation.x=-elevation;tank.root.updateMatrixWorld(true);
   for(const v of local){const p=v.clone().applyMatrix4(pitch.matrixWorld),h=heightAt(p);
    if(!Number.isFinite(h.top))continue;samples++;
    assert(p.y-h.top>=.008,`${id}/${quality}: roof gun intersects ${h.name} by ${(h.top-p.y).toFixed(4)}m at yaw ${degrees}, elevation ${elevation}, point ${p.toArray()}`);
    if(p.y-.7<h.top)positive++;
   }
  }
  assert(samples>100&&positive>100,`${id}: physical sweep has coverage and rejects a lowered station`);
  assert(tank.root.userData.nightLightCoverage.headlights>=4,`${id}: original driving lamps plus paired turret lamps`);
  tank.dispose();console.log(id,quality,'bore, caliber, lamps and 360° roof sweep PASS');
 }
 assert.equal(shapes.size,14,'fourteen distinct complete weapon assemblies');
}
