import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Box3,Vector3,Raycaster,Mesh,MeshBasicMaterial,DoubleSide} from 'three';
import {createTank} from './tankFactory.ts';
import {NATIONAL_ROOF_LOADOUTS,nationalStationWidth} from './nationalRoofConfig.ts';
import {NATIONAL_DONOR_TURRETS} from './nationalDonorTurrets.ts';
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
  // the whole station's stock (release 227: the Qilin's and the Kunlun's QJC-88 emplacements share their gun and differ
  // in their mount and shield)
  const hash=createHash('sha256');station.traverse(o=>{if(o.isMesh)hash.update(Buffer.from(o.geometry.attributes.position.array.buffer));});shapes.add(hash.digest('hex'));
  const pintle=l.mount==='pintle';
  tank.root.updateMatrixWorld(true);
  const socket=new Vector3(...station.userData.auxiliaryMuzzle).sub(new Vector3(...station.userData.auxiliaryPivot));
  const world=socket.clone().applyMatrix4(pitch.matrixWorld);
  const mat=new MeshBasicMaterial({side:DoubleSide}),proxies=stock.map(m=>{const o=new Mesh(m.geometry,mat);o.matrixAutoUpdate=false;o.matrix.copy(m.matrixWorld);o.updateMatrixWorld(true);return o});
  const ray=new Raycaster(world.clone().add(new Vector3(0,0,.03)),new Vector3(0,0,-1),0,.2);
  if(pintle){
   // a crew-served QJC-88: the published muzzle is the flash hider's front plus the class's 11 mm marker (kit.ts
   // fittingPintleMG), on the drawn barrel's axis
   let nearest=Infinity;const q=new Vector3();
   for(const m of stock){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++)nearest=Math.min(nearest,q.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld).distanceTo(world));}
   assert(nearest<.045,`${id}: the published muzzle sits on the QJC-88's flash hider (${nearest.toFixed(3)} m)`);
  }else{
  const floor=ray.intersectObjects(proxies,false)[0];
  assert(floor&&floor.distance>.07&&floor.distance<.12,`${id}: muzzle has a real recessed bore at the firing socket`);
  // Four radial probes land on its metal mouth, excluding an offset/floating socket.
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   ray.set(world.clone().add(new Vector3(dx*(l.caliber===30?.04:.03),dy*(l.caliber===30?.04:.03),.03)),new Vector3(0,0,-1));
   assert(ray.intersectObjects(proxies,false)[0]?.distance<.04,`${id}: physical muzzle rim`);
  }
  const width=nationalStationWidth(l),side=-l.feedSide;
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
  }
  mat.dispose();
  // Exclude the station's own bearings, which deliberately contact its stock.
  const fixed=[];turret.traverse(o=>{
   if(!o.isMesh||o.userData.presentationInvisible)return;
   for(let q=o;q;q=q.parent)if(q===station||q===tank.root.getObjectByName('rig_gun'))return;
   if(o.name.includes('Shadow'))return;fixed.push(o);
  });
  const floorY=station.getWorldPosition(new Vector3()).y;
  // A donor turret's station stands on its commander's cupola, the highest roof fitting under its sweep: the swept pitch
  // stock is then checked against the whole roof below the seat (the pedestal is not pitch stock), which also keeps the
  // lowered-station control meaningful.
  const heightAt=topIndex(fixed,NATIONAL_DONOR_TURRETS[id]?floorY-.30:floorY+.10),local=[];
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
  // Release 227: a station with a traverse arc and a depression table (src/sim/auxiliarySystems.ts honours both) is swept
  // over the arc it can take, at the depression its table allows at each yaw.
  const arc=station.userData.yawArc,table=station.userData.depressionByYaw;
  const depression=yaw=>{if(!table||yaw<table[0][0]||yaw>table.at(-1)[0])return gunProfile.depressionRad;
   for(let i=1;i<table.length;i++)if(yaw<=table[i][0])return Math.min(gunProfile.depressionRad,table[i-1][1],table[i][1]);return gunProfile.depressionRad;};
  const yaws=[];if(arc){for(let r=arc[0];r<arc[1];r+=10*Math.PI/180)yaws.push(r);yaws.push(arc[1]);}else for(let d=0;d<360;d+=10)yaws.push(d*Math.PI/180);
  const restYaw=station.rotation.y;
  for(const yaw of yaws)for(const elevation of [-depression(yaw),0,gunProfile.elevationRad]){
   const degrees=Math.round(yaw*180/Math.PI);
   station.rotation.y=restYaw+yaw;pitch.rotation.x=-elevation;tank.root.updateMatrixWorld(true);
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
