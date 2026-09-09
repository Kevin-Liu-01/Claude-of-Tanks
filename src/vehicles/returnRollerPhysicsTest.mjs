import assert from 'node:assert/strict';
import * as T from 'three';

// Test-only finite stock routines shared by fitted return-roller regressions.
// Context is {port,cfg,gear,receipt,tank}; bounds are actual hull-frame
// {center:Vector3,minX,maxX,r}. No frame or source witness is manufactured.
// continuousShoeClearance proves nonpenetration, NOT visible upper support;
// use returnRollerContactTest separately for the unchanged 6 mm support gate.
export function matrix(mesh,i,hull){
 const m=new T.Matrix4().copy(hull.matrixWorld).invert().multiply(mesh.matrixWorld);
 if(mesh.isInstancedMesh){const own=new T.Matrix4();mesh.getMatrixAt(i,own);m.multiply(own);}return m;
}
function clip(poly,x,above){const out=[];for(let i=0;i<poly.length;i++){
 const a=poly[i],b=poly[(i+1)%poly.length],inside=p=>above?p.x>=x:p.x<=x;
 if(inside(a))out.push(a);if(inside(a)!==inside(b))out.push(a.clone().lerp(b,(x-a.x)/(b.x-a.x)));
}return out;}
function distance2D(poly,center){
 let distance=Infinity,positive=false,negative=false,area=0;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],ay=a.y-center.y,az=a.z-center.z,dy=b.y-a.y,dz=b.z-a.z;
  const cross=ay*dz-az*dy;positive||=cross>1e-12;negative||=cross< -1e-12;
  area+=cross;
  const t=Math.max(0,Math.min(1,-(ay*dy+az*dz)/(dy*dy+dz*dz||1)));
  distance=Math.min(distance,Math.hypot(ay+t*dy,az+t*dz));
 }
 return poly.length>=3&&Math.abs(area)>1e-12&&!(positive&&negative)?0:distance;
}
export function finiteClearance(mesh,m,bounds,{scanAllYZ=false}={}){
 const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,points=Array.from({length:p.count},(_,j)=>new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(m));
 let result=Infinity;
 for(const b of bounds)for(let j=0;j<(ix?.count??p.count);j+=3){
  let tri=[0,1,2].map(k=>points[ix?ix.getX(j+k):j+k]);
  const axialGap=Math.max(b.minX-Math.max(...tri.map(p=>p.x)),Math.min(...tri.map(p=>p.x))-b.maxX);
  if(axialGap>0){
   // Outside the finite axle slab, axial surface separation alone is a
   // rigorous positive lower bound; never subtract a radial radius from it.
   if(scanAllYZ)result=Math.min(result,axialGap);
   continue;
  }
  if(!scanAllYZ&&(
   tri.every(p=>p.y<b.center.y-b.r-.001)||tri.every(p=>p.y>b.center.y+b.r+.05)
   ||tri.every(p=>p.z<b.center.z-b.r-.05)||tri.every(p=>p.z>b.center.z+b.r+.05)))continue;
  tri=clip(clip(tri,b.minX,true),b.maxX,false);if(tri.length)result=Math.min(result,distance2D(tri,b.center)-b.r);
 }return result;
}
export function continuousShoeClearance(c,bounds){
 let minimum=Infinity;
 // Every finite native shoe triangle is clipped to the receiving axle's
 // actual X slab. On the straight return, its most inward point bounds ALL
 // translations, not only the sampled poses below. Other course segments
 // use a conservative full-shoe radial envelope about the actual carrier.
 for(const b of bounds)for(const name of['gearTrackPads','gearTrackPadsSimplified']){
  const shoe=c.port.hullG.getObjectByName(name),p=shoe.geometry.attributes.position,ix=shoe.geometry.index;
  const lane=Math.sign(b.center.x)*c.cfg.xc;let low=Infinity,radial=0;
  for(let j=0;j<(ix?.count??p.count);j+=3){
   let tri=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(j+k):j+k));
   tri=clip(clip(tri,b.minX-lane,true),b.maxX-lane,false);
   for(const v of tri){low=Math.min(low,v.y);radial=Math.max(radial,Math.hypot(v.y,v.z));}
  }
  assert.ok(Number.isFinite(low),'Actual shoe occupies its roller lane');
  const band=c.port.hullG.getObjectByName(b.center.x<0?'gearTrackBandL':'gearTrackBandR'),bp=band.geometry.attributes.position;
  assert.equal(bp.count,c.receipt.loopPoints.length*24,'Use every current native carrier cell');
  const offset=shoe.userData.trackShoeCenterOffsetM;
  const endpoint=(base,end)=>{
   const outer=base+(end?0:2),inner=base+(end?8:6);
   if(!c.cfg.trackCarrierFromOuterFace)return[(bp.getY(outer)+bp.getY(inner))/2,(bp.getZ(outer)+bp.getZ(inner))/2];
   const dy=bp.getY(inner)-bp.getY(outer),dz=bp.getZ(inner)-bp.getZ(outer),length=Math.hypot(dy,dz);
   assert.ok(length>0,'Actual finite inner/outer carrier stock exists');
   // Authored inner lining extends the original unit-normal stock direction.
   // Only the original nominal half-thickness locates the real shoe course.
   return[bp.getY(outer)+dy/length*c.cfg.trackTh/2,bp.getZ(outer)+dz/length*c.cfg.trackTh/2];
  };
  for(let i=0;i<bp.count;i+=24){
   const [y0,z0]=endpoint(i,false),[y1,z1]=endpoint(i,true);
   const dy=y1-y0,dz=z1-z0,length=Math.hypot(dy,dz);
   assert.ok(length>1e-7);
   const t=Math.max(0,Math.min(1,((b.center.y-y0)*dy+(b.center.z-z0)*dz)/(length*length)));
   const finiteBound=Math.hypot(y0+t*dy-b.center.y,z0+t*dz-b.center.z)-radial-offset-b.r;
   let gap=finiteBound;
   if(dz>0&&y0>c.cfg.wheelY+c.cfg.wheelR&&y1>c.cfg.wheelY+c.cfg.wheelR){
    const planeBound=((y0-b.center.y)*dz-(z0-b.center.z)*dy)/length+offset+low-b.r;
    // Both independently bound the complete finite swept shoe from below.
    // An endpoint span's infinite plane must not falsely stand in for stock
    // several metres beyond its actual segment and finite shoe footprint.
    gap=Math.max(planeBound,finiteBound);
   }
   minimum=Math.min(minimum,gap);
  }
 }
 assert.ok(minimum>=-2e-6,`Complete continuous near/far shoe course: ${minimum} m`);return minimum;
}
export function rollerSuspensionFixtures(c){
 const aim=c.port.spec.hydropneumaticAim;
 const compression=c.cfg.suspensionCompressionM??aim?.compressionM??.30;
 const droop=c.cfg.suspensionDroopM??aim?.droopM??.22;
 const hull=c.port.hullG,scale=hull.scale.y,floor=c.gear.contactGeom.bottomYM*scale+hull.position.y;
 assert.ok([compression,droop,scale].every(n=>Number.isFinite(n)&&n>0)&&Number.isFinite(floor));
 // Match native conform's actual world contact plane; absolute ground Y is
 // NOT itself a suspension offset. The level fixtures use the configured
 // clamps, including hydraulic/spec and explicit per-rig overrides.
 return[
  ...[['flat',0],['compression',compression],['droop',-droop]].map(([name,targetM])=>
   ({name,targetM,sample:()=>floor+targetM*scale})),
  {name:'wave',targetM:null,sample:(_x,z)=>floor+.20*scale*Math.sin((z-hull.position.z)/hull.scale.z*1.7)},
 ];
}
export function moving(c,bounds){
 let minimum=Infinity,roadMinimum=Infinity,poses=0;const strokes=[];
 const roads=c.port.hullG.getObjectByName('gearRoadWheelTires');
 c.gear.resetPose();c.tank.root.updateMatrixWorld(true);
 const rest=Array.from({length:roads.count},(_,i)=>new T.Vector3().setFromMatrixPosition(matrix(roads,i,c.port.hullG)).y);
 for(const {name,targetM,sample} of rollerSuspensionFixtures(c)){
  c.gear.resetPose();
  for(let tick=0;tick<180;tick++)c.gear.conform({pos:new T.Vector3(),yaw:0,visualPitch:0,visualRoll:0},sample,0,0,1/60);
  c.gear.update(0,0);c.tank.root.updateMatrixWorld(true);
  const actual=rest.map((y,i)=>new T.Vector3().setFromMatrixPosition(matrix(roads,i,c.port.hullG)).y-y);
  const measured={name,targetM,minimumM:Math.min(...actual),maximumM:Math.max(...actual)};strokes.push(measured);
  if(targetM!==null)assert.ok(actual.every(d=>Math.abs(d-targetM)<2e-6),
   `Actual ${name} axle displacement must reach the configured limit: ${JSON.stringify(measured)}`);
  for(let phase=0;phase<16;phase++){
   const scroll=c.receipt.shoePitchM*phase/16;c.gear.update(scroll,-scroll,1/60);c.tank.root.updateMatrixWorld(true);
   for(const name of['gearTrackBandL','gearTrackBandR','gearTrackPads','gearTrackPadsSimplified']){
    const mesh=c.port.hullG.getObjectByName(name);
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++)minimum=Math.min(minimum,finiteClearance(mesh,matrix(mesh,i,c.port.hullG),bounds));
   }
   // Broad-phase rejection proves absence of contact but yields Infinity
   // for distant stock. Scan all stock for a finite conservative lower bound.
   for(let i=0;i<roads.count;i++)roadMinimum=Math.min(roadMinimum,finiteClearance(roads,matrix(roads,i,c.port.hullG),bounds,{scanAllYZ:true}));
   poses++;
  }
 }
 assert.ok(Number.isFinite(roadMinimum)&&roadMinimum>=-2e-6,`Full-stroke road-wheel stock intersects return rollers: ${roadMinimum} m`);
 return {minimum,roadMinimum,poses,strokes};
}
