import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT,registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildMerkava3DX,buildMerkava4X} from './merkavaX.ts';
import {auditTankWheelQuality} from '../wheelQuality.ts';
import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {auditVisibleReturnRollerContact} from '../returnRollerContactTest.mjs';
import {rollerSuspensionFixtures,finiteClearance as completeStockClearance} from '../returnRollerPhysicsTest.mjs';

const cases=[['merkava3d_x',buildMerkava3DX],['merkava4_x',buildMerkava4X]];
// The old-config witness predates the new lining call. Remove exactly that
// call in a test-only module; a runtime no-op must not mask absent stations.
const profileUrl=new URL('./merkavaX.ts',import.meta.url),source=readFileSync(profileUrl,'utf8');
const liningCall='  lineMerkavaXUpperBand(P,[-1.6645,-.733,.27,2.017],.0038);\n';
assert.equal(source.split(liningCall).length-1,1,'One exact separately tested lining seam');
const oldCallSource=source.replace(liningCall,'').replace(/from (['"])([^'"]+)\1/g,
 (_all,quote,path)=>`from ${quote}${path.startsWith('.')?new URL(path,profileUrl).href:import.meta.resolve(path)}${quote}`);
const oldCallModule=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(oldCallSource)).toString('base64'));
// Exact pre-roller inputs at b0ed8d90f. Historical witnesses are not rewritten.
const ORIGINAL={
 merkava3d_x:{style:'rubber',wheelR:.371,wheelW:.38,wheelY:.446,xc:1.532,
  wheelZs:[-2.5495,-1.6665,-.5365,.3215,1.180,2.033].map(z=>z+.2258175),
  trackW:.637,trackTh:.068,sprocket:{z:3.040+.2258175,y:.874,r:.350},
  idler:{z:-3.365+.2258175,y:.844,r:.342},topY:1.230,botY:.0976,paintedEnds:true,arms:true,coveredTop:true},
 merkava4_x:{style:'rubber',wheelR:.3467,wheelW:.34,wheelY:.387,xc:1.444,
  wheelZs:[-2.062,-1.267,-.199,.739,1.617,2.417],trackW:.548,trackTh:.064,
  sprocket:{z:3.285,y:.761,r:.336},idler:{z:-3.020,y:.722,r:.314},
  topY:1.105,botY:.0956,paintedEnds:true,arms:true,coveredTop:true},
};
const stats={builds:0,rollers:0,poses:0,negativeControls:0,rows:[],physicalFailures:[],contactFailures:[],wheelQualityFailures:[],visibleContact:[]};
const hash=g=>{const h=createHash('sha256');for(const key of Object.keys(g.attributes).sort()){
 const a=g.attributes[key];h.update(key);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
 }if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');};
function capture(id,build,quality,old,unlined=false,settings={}){
 let port,cfg,gear;const emissions=[],bandBefore=new Map(),original=KIT.buildRunningGear;
 KIT.buildRunningGear=(p,input)=>{
  const {rollers,rollerR,returnRollerWidthM,returnRollerInsetM,returnRollerGeometry,trackCarrierFromOuterFace,loopPoints,...retained}=input;
  assert.deepEqual(retained,ORIGINAL[id],'Every pre-existing gear input remains exact');
  cfg=old?retained:{...input,...(settings.oldCarrier?{trackCarrierFromOuterFace:false}:{}),...(settings.chords?{rigidLinkChords:true}:{})};
  if(old)returnRollerGeometry.dispose();gear=original(p,cfg);
  for(const name of['gearTrackBandL','gearTrackBandR']){
   const g=p.hullG.getObjectByName(name).geometry;
   bandBefore.set(name,{position:g.attributes.position.array.slice(),normal:g.attributes.normal.array.slice()});
  }
  return gear;
 };
 const runBuild=old?oldCallModule[build.name]:build;assert.equal(typeof runBuild,'function');
 registerProfiledBuilders({[id]:P=>{port=P;runBuild(new Proxy(P,{get(target,key){
  if(!['add','addEquipment','addMudguard'].includes(key))return Reflect.get(target,key);
  return(...args)=>{
   const at=key==='addMudguard'?1:0,g=args[at+1],transform=args.slice(at+2);
   const geometry=KIT.xform(g.clone(),...transform);emissions.push([key,at?args[0]:null,args[at],hash(geometry)]);geometry.dispose();
   return target[key](...args);
  };
 }}));
 if(old){const mounts=P.hullG.getObjectByName('gearMerkavaReturnSpindles');assert.equal(mounts.count,8);mounts.removeFromParent();mounts.dispose();}
 }});
 try{
  const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  if(unlined)for(const [name,before]of bandBefore){
   const g=port.hullG.getObjectByName(name).geometry;
   for(const key of['position','normal']){g.attributes[key].array.set(before[key]);g.attributes[key].needsUpdate=true;}
   g.computeBoundingBox();g.computeBoundingSphere();
  }
  tank.root.updateMatrixWorld(true);stats.builds++;
  return{id,quality,tank,port,cfg,gear,emissions,bandBefore,receipt:port.hullG.userData.runningGearReceipts[0],dispose(){tank.dispose();}};
 }finally{KIT.buildRunningGear=original;registerProfiledBuilders({[id]:build});}
}
function body(root){const out=[];root.traverse(o=>{
 if(!o.geometry||! /^(hull|turret|gun)/.test(o.name))return;
 out.push([o.name,hash(o.geometry),o.material.name,o.matrix.elements,o.parent?.name]);
});return out;}
function cost(root){let selectedTriangles=0,expandedAllLodTriangles=0,rollerTriangles=0;root.traverse(o=>{
 if(!o.geometry)return;const count=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);
 expandedAllLodTriangles+=count;if(/gearReturnRoller|gearMerkavaReturn/.test(o.name))rollerTriangles+=count;
 let owner=o;while(owner){if(!owner.visible||owner.userData.shadowOnly)return;owner=owner.parent;}
 selectedTriangles+=count;
});return {selectedTriangles,expandedAllLodTriangles,rollerTriangles};}
function matrix(mesh,i,hull){
 const m=new T.Matrix4().copy(hull.matrixWorld).invert().multiply(mesh.matrixWorld);
 if(mesh.isInstancedMesh){const own=new T.Matrix4();mesh.getMatrixAt(i,own);m.multiply(own);}return m;
}
function rollerBounds(c){
 const tire=c.port.hullG.getObjectByName('gearReturnRollerRotors');
 assert.equal(tire.count,8);assert.deepEqual(tire.material,[c.port.mats.rubber,c.port.mats.wheels]);
 assert.equal(tire.visible,true);assert.equal(tire.userData.appearanceRole,undefined);
 assert.equal(tire.geometry.groups.length,2,'One complete rotor with two material groups');
 const bounds=[];
 for(let i=0;i<8;i++){
  const m=matrix(tire,i,c.port.hullG),center=new T.Vector3().setFromMatrixPosition(m),box=new T.Box3();let radius=0;
  for(const mesh of[tire]){const p=mesh.geometry.attributes.position,own=matrix(mesh,i,c.port.hullG);
   for(let j=0;j<p.count;j++){const v=new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(own);box.expandByPoint(v);radius=Math.max(radius,Math.hypot(v.y-center.y,v.z-center.z));}}
  assert.ok(Math.abs(radius-.095)<2e-7,'Actual emitted radius, not entry.r metadata');
  assert.ok(Math.abs(box.max.x-box.min.x-.14)<2e-7);
  assert.ok(Math.abs(Math.abs(center.x)-(c.cfg.xc-(c.cfg.trackW<.6?.29:.25)))<2e-7);
  bounds.push({center,minX:box.min.x,maxX:box.max.x,r:radius});
 }
 assert.equal(bounds.filter(b=>b.center.x<0).length,4);assert.equal(bounds.filter(b=>b.center.x>0).length,4);
 stats.rollers+=8;return bounds;
}
function axialRollerStock(c,bounds){
 const stock=[];
 // Recover the actual stepped cylinder envelope from finite native triangles.
 // Full tire radius must not extend through the much narrower hub overhang.
 for(const [i,b]of bounds.entries()){
  const triangles=[],xs=new Set();
  for(const name of['gearReturnRollerRotors']){
   const mesh=c.port.hullG.getObjectByName(name),p=mesh.geometry.attributes.position,ix=mesh.geometry.index,m=matrix(mesh,i,c.port.hullG);
   for(let j=0;j<(ix?.count??p.count);j+=3){
    const tri=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(j+k):j+k).applyMatrix4(m));
    triangles.push(tri);for(const v of tri)xs.add(Math.round(v.x*1e6)/1e6);
   }
  }
  const cuts=[...xs].sort((a,b)=>a-b);
  for(let j=1;j<cuts.length;j++){
   const minX=cuts[j-1],maxX=cuts[j];let r=0;
   for(const tri of triangles){
    if(Math.max(...tri.map(v=>v.x))<=minX+1e-7||Math.min(...tri.map(v=>v.x))>=maxX-1e-7)continue;
    for(const v of tri)r=Math.max(r,Math.hypot(v.y-b.center.y,v.z-b.center.z));
   }
   assert.ok(r>0,'Every actual axial slab has finite native cylinder stock');
   stock.push({center:b.center,minX:minX-1e-6,maxX:maxX+1e-6,r});
  }
 }
 return stock;
}
const material=new T.MeshBasicMaterial({side:T.DoubleSide});
function mounts(c,bounds){
 const solids=[];
 const skin=new T.Mesh(c.port.hullG.getObjectByName('hull').geometry,material);
 const mesh=c.port.hullG.getObjectByName('gearMerkavaReturnSpindles');
 assert.equal(mesh.count,8);assert.equal(mesh.geometry.parameters.radiusTop,.027);
 assert.equal(mesh.geometry.parameters.radialSegments,c.quality==='high'?8:4);assert.equal(mesh.geometry.parameters.openEnded,false);
 assert.equal(mesh.material,c.port.mats.wheels);assert.equal(mesh.userData.runningGear,true);
 assert.equal(mesh.parent,c.port.hullG,'Mounts share the roller assembly owner, not a disposable detail LOD');
 for(const [i,b]of bounds.entries()){
  const g=mesh.geometry.clone().applyMatrix4(matrix(mesh,i,c.port.hullG));g.computeBoundingBox();const box=g.boundingBox,side=Math.sign(b.center.x);g.dispose();
  const p=mesh.geometry.attributes.position,rim=new Map(),m=matrix(mesh,i,c.port.hullG);
  for(let j=0;j<p.count;j++)if(Math.hypot(p.getY(j),p.getZ(j))>.0269){
   const v=new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(m);
   rim.set(`${Math.round(v.y*1e7)}/${Math.round(v.z*1e7)}`,v);
  }
  solids.push({center:b.center,minX:box.min.x,maxX:box.max.x,r:.027,rim:[...rim.values()]});
  assert.ok(box.min.x<b.center.x&&box.max.x>b.center.x,'Spindle crosses finite hub interior');
  for(const [dy,dz]of[[0,0],[.008,0],[-.008,0],[0,.008],[0,-.008]]){
   const ray=new T.Raycaster(new T.Vector3(b.center.x,b.center.y+dy,b.center.z+dz),new T.Vector3(-side,0,0));
   const hit=ray.intersectObject(skin,false).find(h=>Math.abs(h.point.x)<(c.cfg.xc>1.5?1.13:1.0));
   assert.ok(hit,'Finite old hull receiving face exists');
   assert.ok(side>0?hit.point.x-box.min.x>.02:box.max.x-hit.point.x>.02,'More than 20 mm spindle/hull lap');
  }
 }
 return solids;
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
function finiteClearance(mesh,m,bounds){
 const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,points=Array.from({length:p.count},(_,j)=>new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(m));
 let result=Infinity;const box=new T.Box3().setFromPoints(points);
 for(const b of bounds){
  if(box.max.x<b.minX||box.min.x>b.maxX||box.max.y<b.center.y-b.r-.001||box.min.y>b.center.y+b.r+.05
   ||box.max.z<b.center.z-b.r-.05||box.min.z>b.center.z+b.r+.05)continue;
  for(let j=0;j<(ix?.count??p.count);j+=3){
  let tri=[0,1,2].map(k=>points[ix?ix.getX(j+k):j+k]);
  if(tri.every(p=>p.x<b.minX)||tri.every(p=>p.x>b.maxX)||tri.every(p=>p.y<b.center.y-b.r-.001)||tri.every(p=>p.y>b.center.y+b.r+.05)
   ||tri.every(p=>p.z<b.center.z-b.r-.05)||tri.every(p=>p.z>b.center.z+b.r+.05))continue;
  tri=clip(clip(tri,b.minX,true),b.maxX,false);if(tri.length)result=Math.min(result,distance2D(tri,b.center)-b.r);
  }
 }return result;
}
function carrierEndpoint(p,base,end,nominalThickness){
 const outer=base+(end?0:2),inner=base+(end?8:6);
 const dy=p.getY(inner)-p.getY(outer),dz=p.getZ(inner)-p.getZ(outer),length=Math.hypot(dy,dz);
 assert.ok(length>0,'Actual finite inner/outer receiving stock exists');
 // The outer course and original half-thickness define the shoe carrier.
 // Added inner stock must not silently move that independent datum.
 return [p.getY(outer)+dy/length*nominalThickness/2,p.getZ(outer)+dz/length*nominalThickness/2];
}
function carrierRecoveryControl(c){
 const band=c.port.hullG.getObjectByName('gearTrackBandL'),p=band.geometry.attributes.position,changed=p.clone();
 for(let base=0;base<p.count;base+=24)for(const end of[false,true]){
  const outer=base+(end?0:2),inner=base+(end?8:6);
  changed.setY(inner,p.getY(outer)+(p.getY(inner)-p.getY(outer))*1.25);
  changed.setZ(inner,p.getZ(outer)+(p.getZ(inner)-p.getZ(outer))*1.25);
  const before=carrierEndpoint(p,base,end,c.cfg.trackTh),after=carrierEndpoint(changed,base,end,c.cfg.trackTh);
  assert.ok(Math.hypot(before[0]-after[0],before[1]-after[1])<2e-7,
   'Inner-stock-only depth does not alter the independently recovered shoe course');
  assert.ok(Math.hypot((changed.getY(inner)-p.getY(inner))/2,(changed.getZ(inner)-p.getZ(inner))/2)>.007,
   'The former inner/outer midpoint would incorrectly move the carrier');
 }
 stats.negativeControls++;
}
function closedBand(g){
 const p=g.attributes.position,edges=new Map();let volume=0;
 const key=v=>[v.x,v.y,v.z].map(n=>Math.round(n*1e6)).join('/');
 for(let i=0;i<p.count;i+=3){
  const v=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,i+k));
  assert.ok(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).length()>1e-10);
  volume+=v[0].dot(v[1].clone().cross(v[2]))/6;
  for(let j=0;j<3;j++){
   const a=key(v[j]),b=key(v[(j+1)%3]),k=a<b?`${a}:${b}`:`${b}:${a}`;
   const e=edges.get(k)||{count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(k,e);
  }
 }
 for(const e of edges.values()){assert.equal(e.count,2,'Closed physical band edge');assert.equal(e.balance,0,'Consistent band winding');}
 assert.ok(volume>0,'The actual emitted band is closed positive-volume stock');return volume;
}
function liningReceipt(c){
 const deltas=new Map(),cells=[];let changedVertices=0,maximumDepthM=0,addedVolumeM3=0;
 for(const [name,before]of c.bandBefore){
  const band=c.port.hullG.getObjectByName(name),p=band.geometry.attributes.position;
  const original=new T.BufferAttribute(before.position,3),delta=p.array.map((v,i)=>v-before.position[i]);
  deltas.set(name,delta);const old=band.geometry.clone();old.attributes.position.array.set(before.position);
  addedVolumeM3+=closedBand(band.geometry)-closedBand(old);old.dispose();
  for(let i=0;i<p.count;i++){
   const depth=Math.hypot(delta[i*3+1],delta[i*3+2]);assert.equal(delta[i*3],0,'Band width is fixed');
   maximumDepthM=Math.max(maximumDepthM,depth);if(depth<1e-9)continue;changedVertices++;
   assert.ok([6,7,8,9,10,11,14,16,17,19,20,22].includes(i%24),'Only inner/side stock changes');
   assert.ok(p.getY(i)>c.cfg.wheelY,'No lower deformed vertex is modified');
  }
  for(let base=0;base<p.count;base+=24){
   for(const end of[false,true]){
    const a=carrierEndpoint(p,base,end,c.cfg.trackTh),b=carrierEndpoint(original,base,end,c.cfg.trackTh);
    assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<2e-7,'Actual lined arrays preserve the independent carrier');
   }
   if(!Array.from(delta.slice(base*3,(base+24)*3)).some(n=>n!==0))continue;
   const v=(attr,i)=>new T.Vector3().fromBufferAttribute(attr,base+i).applyMatrix4(matrix(band,0,c.port.hullG));
   const poly=[v(original,6),v(original,8),v(p,8),v(p,6)];
   const area=poly.reduce((sum,a,j)=>{const b=poly[(j+1)%poly.length];return sum+a.y*b.z-b.y*a.z;},0);
   for(let j=0;j<poly.length;j++){
    const a=poly[j],b=poly[(j+1)%poly.length],d=poly[(j+2)%poly.length];
    assert.ok(Math.sign(area)*((b.y-a.y)*(d.z-b.z)-(b.z-a.z)*(d.y-b.y))>=-1e-10,
     'Each actual added-stock cell is convex before finite triangle clipping');
   }
   cells.push({minX:Math.min(v(p,6).x,v(p,7).x),maxX:Math.max(v(p,6).x,v(p,7).x),poly});
  }
 }
 return{deltas,cells,changedVertices,maximumDepthM,addedVolumeM3};
}
function clipPlane(poly,distance){const out=[];for(let i=0;i<poly.length;i++){
 const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a),db=distance(b);
 if(da>=0)out.push(a);if((da>=0)!==(db>=0))out.push(a.clone().lerp(b,da/(da-db)));
}return out;}
function addedStockIntersections(c,cells){
 let intersections=0;
 c.port.hullG.traverse(mesh=>{
  if(!mesh.geometry||! /^(gearRoadWheel|gearEndWheel|gearSuspension)/.test(mesh.name))return;
  const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
  for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
   const m=matrix(mesh,i,c.port.hullG),points=Array.from({length:p.count},(_,j)=>new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(m));
   const box=new T.Box3().setFromPoints(points);
   for(const cell of cells){
    const cb=new T.Box3().setFromPoints(cell.poly);cb.min.x=cell.minX;cb.max.x=cell.maxX;
    if(!box.intersectsBox(cb))continue;
    const signedArea=cell.poly.reduce((sum,a,j)=>{const b=cell.poly[(j+1)%cell.poly.length];return sum+a.y*b.z-b.y*a.z;},0);
    if(Math.abs(signedArea)<1e-10)continue;const sign=Math.sign(signedArea);
    for(let j=0;j<(ix?.count??p.count);j+=3){
     let tri=[0,1,2].map(k=>points[ix?ix.getX(j+k):j+k]);
     if(!new T.Box3().setFromPoints(tri).intersectsBox(cb))continue;
     tri=clip(clip(tri,cell.minX+2e-6,true),cell.maxX-2e-6,false);
     for(let edge=0;edge<cell.poly.length&&tri.length;edge++){
      const a=cell.poly[edge],b=cell.poly[(edge+1)%cell.poly.length],dy=b.y-a.y,dz=b.z-a.z,len=Math.hypot(dy,dz);
      if(len<1e-8)continue;
      tri=clipPlane(tri,v=>sign*(dy*(v.z-a.z)-dz*(v.y-a.y))/len-2e-6);
     }
     if(tri.length)intersections++;
    }
   }
  }
 });return intersections;
}
function sameShoes(a,b){
 assert.equal(a.receipt.shoePitchM,b.receipt.shoePitchM);assert.equal(a.receipt.shoeCountPerSide,b.receipt.shoeCountPerSide);
 for(const name of['gearTrackPads','gearTrackPadsSimplified']){
  const x=a.port.hullG.getObjectByName(name),y=b.port.hullG.getObjectByName(name);
  assert.equal(hash(x.geometry),hash(y.geometry),'Actual near/far shoe stock stays exact');
  const ap=x.instanceMatrix.array,bp=y.instanceMatrix.array;
  assert.equal(ap.length,bp.length);
  for(let i=0;i<ap.length;i++)assert.ok(Math.abs(ap[i]-bp[i])<2e-7,
   'Inner-only lining cannot move actual near/far shoes, tangent, pitch, wrap or phase');
 }
}
function brokenPreservation(a,b){
 for(const broken of[true,false]){
  for(const c of[a,b]){c.gear.resetPose();c.gear.setBroken('trackL',broken);c.gear.update(.117,-.091,1/60);c.tank.root.updateMatrixWorld(true);}
  sameShoes(a,b);
  for(const c of[a,b]){
   assert.equal(c.port.hullG.getObjectByName('gearTrackBandL').visible,!broken);
   assert.equal(c.port.hullG.getObjectByName('gearTrackBandR').visible,true);
   const pads=c.port.hullG.getObjectByName('gearTrackPads'),m=new T.Matrix4();pads.getMatrixAt(0,m);
   assert.equal(new T.Vector3().setFromMatrixScale(m).length()<1e-8,broken,'Broken side hides its real shoes and repair restores them');
  }
 }
}
function continuousShoeClearance(c,bounds){
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
  if(!Number.isFinite(low))continue; // This finite hub strip is outside the shoe lane.
  const band=c.port.hullG.getObjectByName(b.center.x<0?'gearTrackBandL':'gearTrackBandR'),bp=band.geometry.attributes.position;
  assert.equal(bp.count,c.receipt.loopPoints.length*24,'Use every current native carrier cell');
  const offset=shoe.userData.trackShoeCenterOffsetM;
  for(let i=0;i<bp.count;i+=24){
   const [y0,z0]=carrierEndpoint(bp,i,false,c.cfg.trackTh);
   const [y1,z1]=carrierEndpoint(bp,i,true,c.cfg.trackTh);
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
function restAxles(c){
 c.gear.resetPose();c.tank.root.updateMatrixWorld(true);
 const roads=c.port.hullG.getObjectByName('gearRoadWheelTires');
 return Array.from({length:roads.count},(_,i)=>new T.Vector3().setFromMatrixPosition(matrix(roads,i,c.port.hullG)).y);
}
function settleSuspension(c,{name,targetM,sample},rest){
 c.gear.resetPose();
 for(let tick=0;tick<180;tick++)c.gear.conform({pos:new T.Vector3(),yaw:0,visualPitch:0,visualRoll:0},sample,0,0,1/60);
 c.gear.update(0,0);c.tank.root.updateMatrixWorld(true);
 const roads=c.port.hullG.getObjectByName('gearRoadWheelTires');
 const actual=rest.map((y,i)=>new T.Vector3().setFromMatrixPosition(matrix(roads,i,c.port.hullG)).y-y);
 const measured={name,targetM,minimumM:Math.min(...actual),maximumM:Math.max(...actual)};
 if(targetM!==null)assert.ok(actual.every(d=>Math.abs(d-targetM)<2e-6),
  `${c.id}/${c.quality}: actual axle displacement must reach configured limit: ${JSON.stringify(measured)}`);
 return measured;
}
function moving(c,bounds,spindles,rollers,unlined,lining){
 let minimum=Infinity,minimumWheelClearanceM=Infinity,maximumFarCarrierContactM=0;const strokes=[];
 const wheelStock=[],allSupports=[...bounds,...spindles];
 c.port.hullG.traverse(mesh=>{if(mesh.geometry&&/^(gearRoadWheel|gearEndWheel|gearSuspension)/.test(mesh.name))wheelStock.push(mesh);});
 for(const prefix of['gearRoadWheel','gearEndWheel','gearSuspension'])
  assert.ok(wheelStock.some(mesh=>mesh.name.startsWith(prefix)),`Actual ${prefix} stock is included`);
 const rest=restAxles(c),unlinedRest=restAxles(unlined),unlinedFixtures=rollerSuspensionFixtures(unlined);
 for(const [index,fixture]of rollerSuspensionFixtures(c).entries()){
  const stroke=settleSuspension(c,fixture,rest),unlinedStroke=settleSuspension(unlined,unlinedFixtures[index],unlinedRest);
  assert.deepEqual(stroke,unlinedStroke,'Inner lining cannot alter actual suspension travel');strokes.push(stroke);
  console.log(JSON.stringify({id:c.id,quality:c.quality,suspension:stroke}));
  const scrolls=[...Array.from({length:16},(_,phase)=>c.receipt.shoePitchM*phase/16),.095*Math.PI/(c.quality==='high'?24:12)];
  for(const [phase,scroll]of scrolls.entries()){
   c.gear.update(scroll,-scroll,1/60);c.tank.root.updateMatrixWorld(true);
   unlined.gear.update(scroll,-scroll,1/60);unlined.tank.root.updateMatrixWorld(true);
   sameShoes(c,unlined);
   for(const [name,delta]of lining.deltas){
    const a=c.port.hullG.getObjectByName(name).geometry,b=unlined.port.hullG.getObjectByName(name).geometry;
    const ap=a.attributes.position.array,bp=b.attributes.position.array;
    for(let j=0;j<ap.length;j++)assert.equal(ap[j]-bp[j],delta[j],
     'Actual native deformation preserves the lining, outer/wrap/lower positions and carrier independently');
    if(phase===0)closedBand(a);
   }
   const liningIntersections=addedStockIntersections(c,lining.cells);
   if(liningIntersections)stats.physicalFailures.push({id:c.id,quality:c.quality,fixture:fixture.name,phase,liningIntersections});
   for(const [i,b]of rollers.entries()){
    const tire=c.port.hullG.getObjectByName('gearReturnRollerRotors'),solid=new T.Mesh(tire.geometry,material);
    solid.applyMatrix4(matrix(tire,i,c.port.hullG));solid.updateMatrixWorld(true);
    for(const rim of spindles[i].rim){
     const side=Math.sign(b.center.x),margin=1+.0005/.027;
     const origin=new T.Vector3(b.center.x-side*.08,b.center.y+(rim.y-b.center.y)*margin,b.center.z+(rim.z-b.center.z)*margin);
     const entry=new T.Raycaster(origin,new T.Vector3(side,0,0)).intersectObject(solid,false)[0];
     assert.ok(entry&&Math.abs(entry.point.x-(b.center.x-side*.07))<2e-7,
      'Actual stationary spindle rim enters the rotating finite hub cap with 0.5 mm receiving margin at every phase');
    }
    const x=Math.sign(b.center.x)*Math.max(Math.abs(b.center.x),c.cfg.xc-c.cfg.trackW/2+.018);
    const crown=new T.Raycaster(new T.Vector3(x,b.center.y+.2,b.center.z),new T.Vector3(0,-1,0),0,.2)
     .intersectObject(solid,false)[0];assert.ok(crown);
    const band=c.port.hullG.getObjectByName(b.center.x<0?'gearTrackBandL':'gearTrackBandR');
    const contact=new T.Raycaster(crown.point,new T.Vector3(0,1,0),0,.03).intersectObject(band,false)[0];
    assert.ok(contact,'Actual far receiving face exists');
    if(contact.distance>.006)stats.contactFailures.push({id:c.id,quality:c.quality,fixture:fixture.name,phase,i,gap:contact.distance});
    maximumFarCarrierContactM=Math.max(maximumFarCarrierContactM,contact.distance);
   }
   for(const name of['gearTrackBandL','gearTrackBandR','gearTrackPads','gearTrackPadsSimplified']){
    const mesh=c.port.hullG.getObjectByName(name);
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++)minimum=Math.min(minimum,finiteClearance(mesh,matrix(mesh,i,c.port.hullG),bounds));
   }
   for(const mesh of wheelStock){
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
     const m=matrix(mesh,i,c.port.hullG),gap=completeStockClearance(mesh,m,allSupports,{scanAllYZ:true});
     assert.ok(Number.isFinite(gap),'Every finite native wheel/end/suspension triangle contributes to the clearance bound');
     minimumWheelClearanceM=Math.min(minimumWheelClearanceM,gap);
     if(gap< -2e-6)for(const [owner,solids]of [['rotor',bounds],['spindle',spindles]]){
      const ownedGap=completeStockClearance(mesh,m,solids,{scanAllYZ:true});
      if(ownedGap< -2e-6)stats.physicalFailures.push({id:c.id,quality:c.quality,name:mesh.name,i,owner,fixture:fixture.name,phase,gap:ownedGap});
     }
    }
   }
   stats.poses++;
  }
 }
 return {minimum,minimumWheelClearanceM,maximumFarCarrierContactM,strokes,wheelStockNames:wheelStock.map(mesh=>mesh.name)};
}
for(const [id,build]of cases)for(const quality of['high','low']){
 const old=capture(id,build,quality,true),current=capture(id,build,quality,false),unlined=capture(id,build,quality,false,true);
 try{
  assert.equal(old.port.hullG.getObjectByName('gearReturnRollerRotors'),undefined,'Original missing-roller witness');
  assert.deepEqual(current.emissions,old.emissions,'Every pre-existing authored emission is byte-identical');
  assert.deepEqual(body(current.tank.root),body(old.tank.root),'Actual hull/turret/gun armor, finish and rig stay exact');
  for(const name of['rig_hull','rig_turret','rig_gun'])assert.deepEqual(current.tank.root.getObjectByName(name).matrixWorld.elements,
   old.tank.root.getObjectByName(name).matrixWorld.elements,'Original normalized hull/turret/gun datums');
  for(const key of['wheelZs','wheelR','wheelY','sprocket','idler','botY','trackW','trackTh'])assert.deepEqual(current.receipt[key],old.receipt[key]);
  for(const name of['gearRoadWheelTires','gearRoadWheelDiscs','gearRoadWheelInsets','gearSuspensionLinks','gearSuspensionJointBosses']){
   const a=current.port.hullG.getObjectByName(name),b=old.port.hullG.getObjectByName(name);
   assert.equal(hash(a.geometry),hash(b.geometry));assert.deepEqual(a.instanceMatrix.array,b.instanceMatrix.array);
  }
  const lower=c=>c.receipt.loopPoints.slice(c.receipt.loopPoints.findIndex(([z])=>z>c.cfg.sprocket.z+1e-7));
  assert.deepEqual(lower(current),lower(old),'Existing lower contact/run and lower end arcs retained');
  for(let i=0;i<current.receipt.loopPoints.length;i++){
   const a=current.receipt.loopPoints[i],b=current.receipt.loopPoints[(i+1)%current.receipt.loopPoints.length];
   assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-7,'No zero-length carrier cell');
  }
  for(const issue of auditTankWheelQuality(current.tank.root).issues)stats.wheelQualityFailures.push({id,quality,issue});
  const bounds=rollerBounds(current),stock=axialRollerStock(current,bounds),spindles=mounts(current,bounds);
  for(const [i,b]of bounds.entries()){
   const band=current.port.hullG.getObjectByName(b.center.x<0?'gearTrackBandL':'gearTrackBandR');
   const gap=finiteClearance(band,matrix(band,0,current.port.hullG),[b]);
   assert.ok(gap>=-2e-6,'Finite upper carrier does not penetrate roller: '+gap);
   const tire=current.port.hullG.getObjectByName('gearReturnRollerRotors');
   const solid=new T.Mesh(tire.geometry,material);solid.applyMatrix4(matrix(tire,i,current.port.hullG));solid.updateMatrixWorld(true);
   const x=Math.sign(b.center.x)*Math.max(Math.abs(b.center.x),current.cfg.xc-current.cfg.trackW/2+.018);
   const top=new T.Raycaster(new T.Vector3(x,b.center.y+.2,b.center.z),new T.Vector3(0,-1,0),0,.2)
    .intersectObject(solid,false)[0];
   assert.ok(top,'Real finite tire surface exists inside the track lane');
   for(const name of['gearTrackPads','gearTrackPadsSimplified']){
    const shoe=current.port.hullG.getObjectByName(name);let contact=false;
    for(const dz of[0,-.005,.005,-.01,.01,-.015,.015]){
     const crown=new T.Raycaster(new T.Vector3(x,b.center.y+.2,b.center.z+dz),new T.Vector3(0,-1,0),0,.2)
      .intersectObject(solid,false)[0];
     if(!crown)continue;
     contact||=new T.Raycaster(crown.point.clone().add(new T.Vector3(0,.000005,0)),new T.Vector3(0,1,0),0,.006)
      .intersectObjects([band,shoe],false).length>0;
    }
    if(!contact)stats.contactFailures.push({id,quality,i,mesh:name,restContactWithin6mm:false});
   }
  }
  carrierRecoveryControl(current);
  const continuous=continuousShoeClearance(current,stock);
  const lining=liningReceipt(current);
  assert.equal(lining.changedVertices,id==='merkava4_x'?96:0,'Exactly four joined upper support frames per band');
  assert.ok(Math.abs(lining.maximumDepthM-(id==='merkava4_x'?.0038:0))<2e-7);
  if(lining.cells.length){
   assert.ok(lining.addedVolumeM3>0,'New lining is real positive stock, not a contact-only proxy');
   const bad=lining.cells.map(cell=>({...cell,poly:cell.poly.map((v,i)=>v.clone().add(new T.Vector3(0,i>=2?-.5:0,0)))}));
   assert.ok(addedStockIntersections(current,bad)>0,'Deepened-band control rejects actual road/end-wheel penetration');stats.negativeControls++;
  }
  const posed=moving(current,stock,spindles,bounds,unlined,lining),clearance=posed.minimum,after=cost(current.tank.root),budget=quality==='high'?160:80;
  stats.rows.push({id,quality,minimumTrackClearanceM:clearance,continuousShoeClearanceM:continuous,
   minimumWheelClearanceM:posed.minimumWheelClearanceM,
   wheelStockNames:posed.wheelStockNames,
   suspensionStrokes:posed.strokes,
   maximumFarCarrierContactM:posed.maximumFarCarrierContactM,
   lining:{changedVertices:lining.changedVertices,maximumDepthM:lining.maximumDepthM,addedVolumeM3:lining.addedVolumeM3},
   before:cost(old.tank.root),after,completeRollerTriangles:after.rollerTriangles/8,
   completeRollerTriangleBudget:budget,performanceBudgetPassed:after.rollerTriangles/8<=budget});
  console.log(JSON.stringify(stats.rows.at(-1)));
  assert.ok(after.rollerTriangles/8<=budget,'Frozen complete roller budget includes every finite spindle');
  assert.ok(Number.isFinite(clearance),'Actual finite stock was checked, not an empty collider set');
  assert.ok(clearance<.002,'The finite rollers meet a real band/web support surface, not floating below it');
  if(clearance< -2e-6)stats.physicalFailures.push({id,quality,owner:'track',gap:clearance});
  const bad=stock.map(b=>({...b,center:b.center.clone().add(new T.Vector3(0,.07,0))}));
  current.gear.resetPose();current.gear.update(0,0);current.tank.root.updateMatrixWorld(true);
  const band=current.port.hullG.getObjectByName('gearTrackBandL');
  assert.ok(finiteClearance(band,matrix(band,0,current.port.hullG),bad)<-.025,'Raised-roller negative control intersects real carrier');stats.negativeControls++;
  brokenPreservation(current,unlined);
 }finally{old.dispose();current.dispose();unlined.dispose();}
 // Real batched battle presentation, not just calling the distance API on
 // an inspection build which has no installed far-detail groups.
 let battleGear;const nativeBuild=KIT.buildRunningGear;KIT.buildRunningGear=(...args)=>battleGear=nativeBuild(...args);
 let battle;try{battle=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:true,battleDetailLod:true,camoSeed:4242});}
 finally{KIT.buildRunningGear=nativeBuild;}stats.builds++;
 let disposedGeometry=0,disposedInstances=0,disposedRotorGeometry=0,disposedRotorInstances=0;
 const shaft=battle.root.getObjectByName('gearMerkavaReturnSpindles');
 shaft.geometry.addEventListener('dispose',()=>disposedGeometry++);shaft.addEventListener('dispose',()=>disposedInstances++);
 const rotor=battle.root.getObjectByName('gearReturnRollerRotors');
 rotor.geometry.addEventListener('dispose',()=>disposedRotorGeometry++);rotor.addEventListener('dispose',()=>disposedRotorInstances++);
 try{
  if(quality==='high')assert.ok(battle.root.userData.battleDetailGroupCount>0,'Actual HIGH battle detail groups installed');
  const state=createTankState(getSpec(id),new T.Vector3(),0);
  const visible=auditVisibleReturnRollerContact(battle,battleGear,state,{radiusM:.095});
  stats.visibleContact.push({id,quality,rows:visible.map(row=>({distance:row.distance,phases:row.phases,
   maximumVisibleSupportGapM:row.maximumVisibleSupportGapM,shoeOnlyMaximumGapM:row.shoeOnlyMaximumGapM,
   contact:row.contact,owner:row.worst?.owner,
   eligibility:row.eligibility.map(({name,drawable,instanceCount,effectiveElements})=>({name,drawable,instanceCount,effectiveElements}))}))});
  for(const row of visible)if(row.contact!=='PASS')stats.contactFailures.push({id,quality,distance:row.distance,visibleSupportGapM:row.maximumVisibleSupportGapM});
  for(const distance of[150,300,15]){
   battle.syncFromState(state,1/60,distance);
   for(const name of['gearReturnRollerRotors','gearMerkavaReturnSpindles']){
    const mesh=battle.root.getObjectByName(name);assert.ok(mesh,`${name} remains attached at ${distance} m`);
    let owner=mesh;while(owner){assert.equal(owner.visible,true,`${name} stays visible at actual battle LOD`);owner=owner.parent;}
   }
  }
 }finally{battle.dispose();}
 assert.equal(disposedGeometry,1,'Owned shared spindle geometry disposed exactly once');
 assert.equal(disposedInstances,1,'Owned instanced spindle buffer disposed exactly once');
 assert.equal(disposedRotorGeometry,1,'Native rotor geometry disposed exactly once');
 assert.equal(disposedRotorInstances,1,'Native rotor instance buffer disposed exactly once');
}
for(const quality of['high','low']){
 const legacy=capture('merkava4_x',buildMerkava4X,quality,false,false,{oldCarrier:true});
 try{
  const bounds=axialRollerStock(legacy,rollerBounds(legacy)),shoe=legacy.port.hullG.getObjectByName('gearTrackPads');let worst=Infinity;
  for(let phase=0;phase<16;phase++){
   const scroll=legacy.receipt.shoePitchM*phase/16;legacy.gear.update(scroll,-scroll,1/60);legacy.tank.root.updateMatrixWorld(true);
   for(let i=0;i<shoe.count;i++)worst=Math.min(worst,finiteClearance(shoe,matrix(shoe,i,legacy.port.hullG),bounds));
  }
  assert.ok(worst<-.001,'Original averaging reproduces over 1 mm actual near-shoe penetration');stats.negativeControls++;
  console.log(JSON.stringify({id:'merkava4_x',quality,oldMidpointRejectedClearanceM:worst}));
 }finally{legacy.dispose();}
 const chord=capture('merkava4_x',buildMerkava4X,quality,false,false,{chords:true});
 const control=capture('merkava4_x',buildMerkava4X,quality,false,true,{chords:true});
 try{
  const rest=restAxles(chord),controlRest=restAxles(control),controlFixtures=rollerSuspensionFixtures(control);
  for(const [index,fixture]of rollerSuspensionFixtures(chord).entries()){
   assert.deepEqual(settleSuspension(chord,fixture,rest),settleSuspension(control,controlFixtures[index],controlRest),
    'Chord sampler lining cannot alter actual configured suspension travel');
   for(let phase=0;phase<16;phase++){
    const scroll=chord.receipt.shoePitchM*phase/16;
    for(const c of[chord,control]){c.gear.update(scroll,-scroll,1/60);c.tank.root.updateMatrixWorld(true);}
    sameShoes(chord,control);
   }
  }
  brokenPreservation(chord,control);
 }finally{chord.dispose();control.dispose();}
}
for(const quality of['high','low']){
 for(const id of['t62mv1_x','t62mv1']){
  const control=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true});stats.builds++;
  try{
   for(const name of['gearReturnRollerTires','gearReturnRollerDiscs','gearReturnRollerRotors','gearMerkavaReturnSpindles'])
    assert.equal(control.root.getObjectByName(name),undefined,id+': rollerless suspension retained');
  }finally{control.dispose();}
 }
}
material.dispose();
console.log('merkavaXReturnRollers: '+JSON.stringify({...stats,physicalFailures:stats.physicalFailures.slice(0,8),physicalFailureCount:stats.physicalFailures.length,
 deepestPhysicalFailure:stats.physicalFailures.reduce((a,b)=>!a||(b.gap??0)<(a.gap??0)?b:a,null),
 contactFailures:stats.contactFailures.slice(0,8),contactFailureCount:stats.contactFailures.length}));
assert.deepEqual(stats.wheelQualityFailures,[],'Native wheel quality remains a required gate');
assert.equal(stats.physicalFailures.length,0,'Actual track/road/end-wheel/suspension stock must clear every finite rotor/spindle and new lining by the unchanged 2 micrometre gate');
assert.equal(stats.contactFailures.length,0,'Unchanged 6 mm actual tire/carrier contact gate fails; this experimental checkpoint is not qualified');
