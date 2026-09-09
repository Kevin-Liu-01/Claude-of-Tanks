import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from './tankFactory.ts';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildAbramsX} from './profiles/abramsSourceX.ts';
import {KIT} from './profiles/kit.ts';
const material=new T.MeshBasicMaterial({side:T.FrontSide});
const rearRay=(meshes,x,y,far=.6)=>new T.Raycaster(new T.Vector3(x,y,-4.1),new T.Vector3(0,0,1),0,far).intersectObjects(meshes,false);
const ray=(meshes,p,d,far)=>new T.Raycaster(new T.Vector3(...p),new T.Vector3(...d),0,far).intersectObjects(meshes,false);
function geometryHash(g,args){const h=createHash('sha256');for(const[name,a]of Object.entries(g.attributes)){
 h.update(name);h.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
 if(g.index)h.update(new Uint8Array(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));
 h.update(JSON.stringify(args));return h.digest('hex');}
const near=(a,b,label,tolerance=.000003)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<tolerance,`${label}: ${a}, source ${b}`);
function closedLeaf(g){const p=g.attributes.position,edges=new Map();let volume=0;
 assert.equal(p.count,96,'32 independently closed triangles, including concealed receiving cap');
 for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,i+k));
  assert.ok(v.every(q=>q.toArray().every(Number.isFinite)));
  assert.ok(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).length()>1e-11,'no zero-area nose triangles');
  volume+=v[0].dot(v[1].clone().cross(v[2]))/6;
  for(let k=0;k<3;k++){const a=v[k].toArray().join(','),b=v[(k+1)%3].toArray().join(',');
   const key=[a,b].sort().join('|'),e=edges.get(key)||{count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(key,e);}}
 assert.ok(volume>1e-6,'real positive-volume stock');
 for(const e of edges.values())assert.deepEqual(e,{count:2,balance:0},'exact paired outward edges');
}
// Independent complete-source OBJ 85c33cee…29, source2/3 connected leaves.
// These first-hit rays were retained before authoring (LBeuVI receipt), not
// calculated from the candidate stations. Near-inner tests include the bevel.
const leafWitnesses=[
 [-1,1.420965075,-1.032450033,1.436441839],
 [-1,1.348205030,-1.032450033,1.364334787],
 [-1,1.110746026,-1.032450033,1.126222871],
 [-1,1.037986517,-1.032450033,1.054116702],
 [1,1.361355066,1.037520004,1.380351841],
 [1,1.431510031,1.037520004,1.450511754],
 [1,1.107021511,1.037520004,1.125957869],
 [1,1.041181028,1.037520004,1.060177835],
];
for(const quality of ['high','low']){
 const stock=[],hull=[],beforeRows=[];
 registerProfiledBuilders({m1a2_sepv2_x:P=>buildAbramsX(new Proxy(P,{get(target,key){
  if(key==='addEquipment'||key==='add')return(bucket,g,...args)=>{
   const list=g.userData.abramsSourceRearGrille?stock:key==='add'&&bucket==='hull'?hull:null;
   if(g.userData.abramsSourceRearGrille)beforeRows.push({index:beforeRows.length,bucket,tag:g.userData.abramsSourceRearGrille,hash:geometryHash(g,args)});
   if(list){const m=new T.Mesh(KIT.xform(g.clone(),...args),material);m.name=g.userData.abramsSourceRearGrille??'hull';m.updateMatrixWorld(true);list.push(m);
    if(g.userData.abramsSourceRearGrille)assert.equal(bucket,'hullDetail','permanent hull equipment');}
   return target[key](bucket,g,...args);
  };return Reflect.get(target,key);
 }}))});
 let tank;
 try{
  tank=createTank('m1a2_sepv2_x',null,{proceduralOnly:true,geometryReceipt:true,quality,batchStatic:false});
  tank.root.updateMatrixWorld(true);const physical=[];tank.root.traverse(m=>{if(m.isMesh&&!m.userData.shadowOnly&&!/marking|shadow/i.test(m.name))physical.push(m);});
  const nonLeaves=beforeRows.filter(p=>p.tag!=='hinge-leaf');
  assert.equal(nonLeaves.length,127,'all grids/blades/frames retained');
  assert.equal(createHash('sha256').update(JSON.stringify(nonLeaves)).digest('hex'),
   '209513aaca7ac54cb1e84e6ec0f817dea5ef114210fbe38986fc372cc3c9c407',
   'immutable pre-edit127 primitive attributes/index/emission order/bucket/transform');
  const leaves=stock.filter(m=>m.name==='hinge-leaf'),walls=stock.filter(m=>m.name==='receiving-sidewall');
  assert.equal(leaves.length,8);
  for(let i=0;i<leaves.length;i++){
   const leaf=leaves[i],[side,y,x,top]=leafWitnesses[i];closedLeaf(leaf.geometry);
   for(const z of[-3.951,-3.941,-3.931]){
    near(ray([leaf],[x,top+.004,z],[0,-1,0],.012)[0]?.point.y,top,'source tapered receiving top');
   }
   const expectedX=side===1?1.121579166:-1.064779159;
   for(const yy of[y-.008,y,y+.008])near(ray([leaf],[side*1.16,yy,-3.951],[-side,0,0],.15)[0]?.point.x,expectedX,'source rounded outer nose');
   // Opposed finite surface rays prove a real overlapping stock interval,
   // rather than AABB overlap or a ray originating inside the material.
   const leafInner=ray([leaf],[0,y,-3.94],[side,0,0],1.2)[0];
   const wallOuter=ray(walls,[side*1.16,y,-3.94],[-side,0,0],.15)[0];
   assert.ok(leafInner&&wallOuter);
   near(side*(wallOuter.point.x-leafInner.point.x),.00051,'source0.51mm leaf-to-wall lap');
   // The rounded end does not fill its rectangular corner. This is a
   // leaf-stock-only negative witness (other real source hardware may sit ahead).
   assert.equal(ray([leaf],[side*(side===1?1.123:1.0662),y,-3.97],[0,0,1],.022).length,0,'unfilled rounded nose corner');
  }
  for(let i=0;i<3;i++){
   assert.equal(stock.filter(m=>m.name===`screen-${i}-horizontal`).length,12,'twelve physical horizontal wires per bay');
   assert.equal(stock.filter(m=>m.name===`screen-${i}-vertical`).length,[5,7,7][i],'source unequal vertical screen census');
  }
  assert.equal(stock.filter(m=>m.name==='side-folded-blade').length,12,'six substantial folds per outside bay');
  assert.equal(stock.filter(m=>m.name==='central-blade').length,3,'three taller central blades');
  // Complete original source2/3 first rearward intersections. Sparse plane
  // sections define the original analytic fold; these are held-out heights.
  for(const [x,y,z]of [[.55,1.1,-3.89561859],[.55,1.2,-3.85919973],[.55,1.3,-3.91955031],
   [.55,1.4,-3.88333178],[-.8,1.1,-3.91103423],[-.8,1.2,-3.87365640],
   [-.8,1.3,-3.93464968],[-.8,1.4,-3.89846192],[0,1.3,-3.93664726],[0,1.4,-3.80533336]]){
   const hits=rearRay(stock,x,y);assert.ok(hits.length,`actual FrontSide folded stock ${x}/${y}`);
   assert.ok(Math.abs(hits[0].point.z-z)<.004,`independent source blade face ${x}/${y}: ${hits[0].point.z}`);
  }
  for(const [x,y,z]of [[.55,.998517,-3.985885],[-.8,.998662,-3.992195],[0,1.124281,-3.987840]]){
   const hits=rearRay(stock,x,y,.2);assert.ok(hits.length);assert.ok(Math.abs(hits[0].point.z-z)<.0003,'physical wire rear face');
  }
  // Actual open wire cells retain depth before the source blade. They are
  // not painted dark patches on a solid backplate, in either quality.
  for(const meshes of [stock,physical])for(const [x,y]of [[.55,1.11],[-.8,1.11],[0,1.11]])
   assert.equal(rearRay(meshes,x,y,.145).length,0,'full-scene 145mm deep screen aperture');
  for(const x of [-1.027,1.032]){
   assert.ok(rearRay(stock,x,1.24,.22).length,'actual receiving sidewall');
   // Complete original143-owner FrontSide source has no stock on the old
   // purported seat ray: Z−3.97 is behind the actual sidewall. Retain that air.
   for(const meshes of[stock,hull,physical])assert.equal(ray(meshes,[x,1.24,-3.97],[Math.sign(x),0,0],.10).length,0,'source-confirmed old seat is real air');
  }
  const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');assert.ok(turret&&gun);
  for(const[yaw,pitch]of[[0,0],[.63,-.12],[Math.PI,.23]]){
   turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
   for(const[side,y]of leafWitnesses){const h=ray(physical,[side*1.16,y,-3.951],[-side,0,0],.15)[0];
    near(h?.point.x,side===1?1.121579166:-1.064779159,'actual posed hull-owned source leaf');
    assert.equal(h.object.name,'hullDetail','not turret/gun-owned');}
   for(const x of[-1.027,1.032])assert.equal(ray(physical,[x,1.24,-3.97],[Math.sign(x),0,0],.10).length,0,'posed complete-source air retained');
  }
  for(const m of stock){m.geometry.computeBoundingBox();const b=m.geometry.boundingBox;
   assert.ok(b.min.z> -4.011&&b.max.z< -3.60&&b.min.y>.94&&b.max.y<1.63,'grille-only source bounded extent');}
 }finally{tank?.dispose();for(const m of [...stock,...hull])m.geometry.dispose();registerProfiledBuilders({m1a2_sepv2_x:buildAbramsX});}
}
material.dispose();console.log('Abrams rear grilles PASS:high/low6poses,8closed asymmetric source leaves,0.51mm wall laps,127 immutable non-leaf primitives,3unequal screens/15blades/source held-outs and real air');
