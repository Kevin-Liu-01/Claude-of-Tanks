import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT,registerProfiledBuilders} from '../tankFactoryCore.ts';
import {MODERN2_BUILDERS} from '../modern2.ts';
import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {matrix,rollerSuspensionFixtures} from '../returnRollerPhysicsTest.mjs';

// Authenticated before the apron edit at 6bba0ee6d, seed4242, native HIGH/LOW.
// These cover every original transformed builder emission, not a refreshed
// image/shape golden. Only the named new folds/risers are excluded;
// the two removed rails are reconstructed at their exact original slots.
const ORIGINAL={high:['510e86fc834e35722777f8398b0f31e54b241ace2005b97e0296e17ba5df70b0',276],
 low:['57acb1c9b45cee483376641832b3461eedc491dab85122ea6baa7e69cec0f230',272]};
const material=new T.MeshBasicMaterial({side:T.FrontSide});
const v=a=>new T.Vector3(...a);
const ray=(meshes,p,d,far)=>new T.Raycaster(v(p),v(d),0,far).intersectObjects(meshes,false);
const hash=g=>{const h=createHash('sha256');for(const key of Object.keys(g.attributes).sort()){
 const a=g.attributes[key];h.update(key+':'+a.itemSize+':'+a.normalized);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
}if(g.index)h.update(Buffer.from(g.index.array.buffer));return h.digest('hex');};
const stats={builds:0,poses:0,receiverSamples:0,negativeControls:0,riserReceiverWitnesses:[],rows:[]};

function capture(quality,omit=false){
 let port,cfg,gear;const old=KIT.buildRunningGear,emissions=[],receivers=[],added=[],legacyRails=[];
 KIT.buildRunningGear=(p,c)=>{cfg=c;gear=old(p,c);return gear;};
 registerProfiledBuilders({mbt70:P=>{port=P;MODERN2_BUILDERS.mbt70(new Proxy(P,{get(target,key){
  if(!['add','addMudguard','addEquipment','addCupola','addGunExtra','addGunExtraDark'].includes(key))return Reflect.get(target,key);
  return(...args)=>{
   const at=key==='addMudguard'?2:key.startsWith('addGun')?0:1,g=args[at],isNew=g.userData.mbt70UpperFenderReturn===true;
   const geometry=KIT.xform(g.clone(),...args.slice(at+1));
   if(isNew){assert.equal(key,'addMudguard');assert.match(args[1],/^hullTrackGuard[LR]$/);
    assert.match(args[0],/^mbt70_upper_fender_(return|mount)_(-1|1)$/);const mesh=new T.Mesh(geometry,material);mesh.name=args[0];mesh.updateMatrixWorld(true);added.push(mesh);
    if(omit){g.dispose();return;}
   }else{
    emissions.push([key,args.slice(0,at),hash(geometry)]);
    if(key==='addMudguard'&&/^mbt70_m1_rear_fender_(-1|1)$/.test(args[0])){
     // Exact inverse of the obsolete local rail, anchored at its original
     // emission position. The unchanged literal hash authenticates all
     // dimensions, transforms and ordering; unrelated stripping still fails.
     const side=args[0].endsWith('_-1')?-1:1;
     const rail=KIT.xform(KIT.box(.06,.08,5.46),side*1.69,1.39,.10);
     emissions.push(['add',['hullDetail'],hash(rail)]);
     const mesh=new T.Mesh(rail,material);mesh.updateMatrixWorld(true);legacyRails.push(mesh);
     if(omit)target.add('hullDetail',rail.clone());
    }
    if(args[at-1]==='hull'){const mesh=new T.Mesh(geometry,material);mesh.name=key==='addMudguard'?args[0]:'';mesh.updateMatrixWorld(true);receivers.push(mesh);}
    else geometry.dispose();
   }
   return target[key](...args);
  };
 }}));}});
 try{
  const tank=createTank('mbt70',null,{quality,geometryReceipt:true,proceduralOnly:true,camoSeed:4242,batchStatic:true,battleDetailLod:true});
  tank.root.updateMatrixWorld(true);stats.builds++;
  assert.equal(createHash('sha256').update(JSON.stringify(emissions)).digest('hex'),ORIGINAL[quality][0],'Every original authored emission remains exact');
  assert.equal(emissions.length,ORIGINAL[quality][1]);assert.equal(added.length,4);
  let disposed=false;
  return{tank,port,cfg,gear,added,receivers,legacyRails,receipt:port.hullG.userData.runningGearReceipts[0],
   dispose(){if(disposed)return;disposed=true;tank.dispose();for(const m of [...added,...receivers,...legacyRails])m.geometry.dispose();}};
 }finally{KIT.buildRunningGear=old;registerProfiledBuilders({mbt70:MODERN2_BUILDERS.mbt70});}
}
function closed(g,triangles=152,minimumVolume=.01){
 const p=g.attributes.position,edges=new Map();let volume=0;
 const raw=g.index?g.toNonIndexed():g;const positions=raw.attributes.position;
 assert.equal(positions.count/3,triangles,'Bounded triangle count per complete finite part');
 if(raw!==g){const result=closed(raw,triangles,minimumVolume);raw.dispose();return result;}
 for(let i=0;i<p.count;i+=3){const a=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,i+k));
  volume+=a[0].dot(a[1].clone().cross(a[2]))/6;
  const keys=a.map(q=>q.toArray().map(x=>Math.round(x*1e6)).join(','));
  for(let k=0;k<3;k++){const key=[keys[k],keys[(k+1)%3]].sort().join('|');edges.set(key,(edges.get(key)??0)+1);}
 }
 assert.ok(volume>minimumVolume&&Number.isFinite(volume),'Finite outward positive-volume stock');
 assert.ok([...edges.values()].every(n=>n===2),'Every edge has two faces, including concave end caps');
 assert.ok(g.attributes.normal&&g.attributes.uv,'Paintable finite surface attributes');
 return volume;
}
function checkWebLap(fender,web,side,z,y){
 const old=ray([fender],[side*1.80,y,z],[-side,0,0],.10)[0];
 const added=ray([web],[side*1.80,y,z],[-side,0,0],.10)[0];
 assert.ok(old&&added);const separation=side*(added.point.x-old.point.x);
 assert.ok(separation>.0019&&separation<.0021,'Exposed web stands 2 mm outside old finite end caps');
 assert.ok(side*old.point.x>1.752-.014,'End cap enters the 14 mm web by finite lap');
}
function seatedFoot(mount,fender){
 const box=new T.Box3().setFromBufferAttribute(mount.geometry.attributes.position),g=fender.geometry,p=g.attributes.position,ix=g.index;
 closed(g,(ix?.count??p.count)/3,.01);
 const foot=box.clone();foot.max.y=foot.min.y;foot.expandByScalar(.000002);
 const tri=new T.Triangle();
 for(let i=0;i<(ix?.count??p.count);i+=3){
  [tri.a,tri.b,tri.c].forEach((point,k)=>point.fromBufferAttribute(p,ix?ix.getX(i+k):i+k));
  assert.ok(!foot.intersectsTriangle(tri),'No actual cap boundary may cross the entire riser bottom');
 }
 // A connected foot cannot leave a closed solid without crossing its
 // boundary. Authenticate one interior point by odd crossings, rather than
 // treating the rounded cap's real faceted boundary as an ideal convex box.
 const double=new T.MeshBasicMaterial({side:T.DoubleSide}),cap=new T.Mesh(g,double);
 try{
  cap.updateMatrixWorld(true);const center=foot.getCenter(new T.Vector3());
  const distances=ray([cap],center.toArray(),[0,1,0],2).map(h=>h.distance)
   .filter((d,i,a)=>i===0||d-a[i-1]>.000001);
  assert.ok(distances.length%2===1&&distances[0]>.00001,'Entire riser bottom is inside actual closed cap stock');
 }finally{double.dispose();}
}
function contacts(c){
 const folds=c.added.filter(m=>m.name.includes('_return_')),mounts=c.added.filter(m=>m.name.includes('_mount_'));
 assert.equal(folds.length,2);assert.equal(mounts.length,2);mounts.forEach(m=>closed(m.geometry,12,.00001));
 for(const m of folds){closed(m.geometry);const p=m.geometry.attributes.position;
  const side=Math.sign(p.getX(0)),box=new T.Box3().setFromBufferAttribute(p);
  const xs=Array.from({length:p.count},(_,i)=>Math.abs(p.getX(i)));
  assert.ok(Math.min(...xs)>1.71899&&Math.max(...xs)<=1.75201);
  assert.ok(Math.abs(box.min.y-1.125)<1e-6,'Shallow apron leaves the lower wheel window open');
  // Read every real emitted top-skin interval, not a runtime receipt/list.
  const zs=[...new Set(Array.from({length:p.count},(_,i)=>p.getZ(i)))].sort((a,b)=>a-b);
  const roof=z=>Math.max(...Array.from({length:p.count},(_,i)=>p.getZ(i)===z?p.getY(i):-Infinity));
  for(let i=1;i<zs.length;i++)for(const t of [.05,.25,.5,.75,.95]){
   const z=zs[i-1]+(zs[i]-zs[i-1])*t,y=roof(zs[i-1])+(roof(zs[i])-roof(zs[i-1]))*t;
   if(z>=-2.50){
    // The retained front fender overlaps this lip from above near the bow.
    // Check the actual donor deck independently, not that taller end cap.
    const deck=c.receivers.filter(o=>!o.name.startsWith('mbt70_m1_'));
    const old=ray(deck,[side*1.721,y+.05,z],[0,-1,0],.075)[0];
    assert.ok(old&&old.point.y>y-.016&&old.point.y<y-.001,`Top lip laps real original deck stock, without a coplanar roof ${JSON.stringify({side,z,y,hit:old?.point.toArray()})}`);
   }else{
    const mount=mounts.find(o=>o.name.endsWith(`_${side}`)),fender=c.receivers.find(o=>o.name===`mbt70_m1_rear_fender_${side}`);
    const top=ray([mount],[side*1.726,y+.05,z],[0,-1,0],.075)[0];
    const foot=ray([fender],[side*1.726,1.705,z],[0,-1,0],.06)[0];
    assert.ok(top&&top.point.y>y-.016,'Rear tip is supported by real riser stock entering the finite roof lip');
    assert.ok(foot&&foot.point.y>1.635&&foot.point.y<1.706,'Riser bottom enters the original finite rear fender');
   }
   assert.ok(ray([m],[side*1.73,y+.05,z],[0,-1,0],.075).length,'Actual continuous top closure');stats.receiverSamples++;
  }
  for(const [end,z,y]of[['front',2.58,1.36],['rear',-2.60,1.64]]){
   const fender=c.receivers.find(o=>o.name===`mbt70_m1_${end}_fender_${side}`);assert.ok(fender);
   checkWebLap(fender,m,side,z,y);stats.receiverSamples++;
   const coplanar=new T.Mesh(m.geometry.clone().translate(-side*.002,0,0),material);coplanar.updateMatrixWorld(true);
   assert.throws(()=>checkWebLap(fender,coplanar,side,z,y),/2 mm outside/,'The old coincident exposed face fails the same real-surface test');
   coplanar.geometry.dispose();stats.negativeControls++;
  }
  assert.equal(ray(c.receivers,[side*1.80,1.2,0],[-side,0,0],.065).length,0,'Old upper side opening is a real missing outer face');
  assert.ok(ray([m],[side*1.80,1.2,0],[-side,0,0],.065).length,'Added apron closes that opening');stats.negativeControls++;
  for(const z of c.cfg.wheelZs)assert.equal(ray([m],[side*1.9,.42,z],[-side,0,0],.6).length,0,'Every lower road-wheel face remains unobscured');
  const mount=mounts.find(o=>o.name.endsWith(`_${side}`));
  const rearFender=c.receivers.find(o=>o.name===`mbt70_m1_rear_fender_${side}`);
  seatedFoot(mount,rearFender);
  const unseated=new T.Mesh(mount.geometry.clone().translate(0,.02,0),material);
  assert.throws(()=>seatedFoot(unseated,rearFender),/riser bottom/,'The measured 2.9 mm bevel-end gap fails the same whole-foot containment proof');
  unseated.geometry.dispose();stats.negativeControls++;
  for(const z of[-2.616,-2.59,-2.56,-2.53,-2.504]){
   const broad=ray(c.receivers,[side*1.726,1.705,z],[0,-1,0],.06)[0];
   const foot=ray([rearFender],[side*1.726,1.705,z],[0,-1,0],.06)[0];
   if(broad?.object!==rearFender)stats.riserReceiverWitnesses.push({side,z,broad: broad?{name:broad.object.name,point:broad.point.toArray()}:null,
    rearFender:foot?.point.toArray()});
   const roof=ray([m],[side*1.726,1.75,z],[0,-1,0],.06)[0];
   const box=new T.Box3().setFromBufferAttribute(mount.geometry.attributes.position);
   assert.ok(foot&&foot.point.y>box.min.y&&foot.point.y<box.max.y,`Entire finite riser bottom overlaps the existing fender ${JSON.stringify({side,z,hit:foot?.point.toArray(),receiver:foot?.object.name,min:box.min.toArray(),max:box.max.toArray()})}`);
   assert.ok(roof&&roof.point.y-.016<box.max.y&&roof.point.y>box.max.y,'Entire riser top overlaps the real roof without a coincident exposed top');stats.receiverSamples++;
  }
 }
}
function legacyRailIntersections(c){
 // Exact finite native shoe triangles against the removed physical rails,
 // with 0.5 mm inward shrink so mere touching cannot pass this negative.
 let hits=0;const tri=new T.Triangle();
 for(const rail of c.legacyRails){const box=new T.Box3().setFromBufferAttribute(rail.geometry.attributes.position).expandByScalar(-.0005);
  for(const name of ['gearTrackPads','gearTrackPadsSimplified']){
   const mesh=c.port.hullG.getObjectByName(name),p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
   const local=new T.Box3().setFromBufferAttribute(p);
   for(let i=0;i<mesh.count;i++){
    const m=matrix(mesh,i,c.port.hullG);if(!local.clone().applyMatrix4(m).intersectsBox(box))continue;
    for(let j=0;j<(ix?.count??p.count);j+=3){
     [tri.a,tri.b,tri.c].forEach((point,k)=>point.fromBufferAttribute(p,ix?ix.getX(j+k):j+k).applyMatrix4(m));
     if(box.intersectsTriangle(tri))hits++;
    }
   }
  }
 }return hits;
}
function gearRows(c){
 const out=[];c.port.hullG.traverse(m=>{if(!m.isMesh||!/^gear/.test(m.name))return;
  out.push([m.name,hash(m.geometry),[...stockInstances(m,c.port.hullG)].map(row=>row.transform.elements)]);});return out;
}
function* stockInstances(mesh,hull){
 if(mesh.isBatchedMesh){
  // Native battle end wheels are BatchedMesh, not InstancedMesh. Their
  // shared buffer is still origin-local: every live geometry range needs
  // its own native instance transform before any physical bounds claim.
  for(let i=0;i<mesh.instanceCount;i++){
   const geometryId=mesh.getGeometryIdAt(i),range=mesh.getGeometryRangeAt(geometryId);
   assert.ok(range.vertexCount>0);const box=new T.Box3(),point=new T.Vector3();
   for(let j=range.vertexStart;j<range.vertexStart+range.vertexCount;j++)box.expandByPoint(point.fromBufferAttribute(mesh.geometry.attributes.position,j));
   const own=new T.Matrix4();mesh.getMatrixAt(i,own);
   const transform=matrix(mesh,0,hull).multiply(own);yield{box:box.applyMatrix4(transform),transform};
  }
 }else{
  const source=new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
  for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
   const transform=matrix(mesh,i,hull);yield{box:source.clone().applyMatrix4(transform),transform};
  }
 }
}
function separation(c,targets){
 let minimum=Infinity,instances=0,batchedEndInstances=0;
 c.port.hullG.traverse(m=>{if(!m.isMesh||!/^gear/.test(m.name))return;
  for(const{box}of stockInstances(m,c.port.hullG)){
   // Full finite geometry AABB, not only vertices tested for containment.
   // Both compared solids are in hull-local coordinates, including the
   // MBT70 rig's nonidentity scale/seat. Positive box separation is a
   // conservative lower bound for ALL triangles within those two boxes.
   for(const target of targets){const gap=Math.max(target.min.x-box.max.x,box.min.x-target.max.x,
    target.min.y-box.max.y,box.min.y-target.max.y,target.min.z-box.max.z,box.min.z-target.max.z);
    minimum=Math.min(minimum,gap);
   }instances++;if(m.isBatchedMesh)batchedEndInstances++;
  }
 });
 assert.ok(instances>400,'Include both complete native shoe LODs, bands, suspension, wheels and end hardware');
 assert.equal(batchedEndInstances,8,'Actual two-sided batched idler/sprocket body and hardware instances are included');
 assert.ok(minimum>.0039,`Every complete stock box has positive separation: ${minimum} m`);return minimum;
}
function motion(c){
 const targets=c.added.map(m=>new T.Box3().setFromBufferAttribute(m.geometry.attributes.position));
 const roads=c.port.hullG.getObjectByName('gearRoadWheelTires');c.gear.resetPose();c.tank.root.updateMatrixWorld(true);
 const rest=Array.from({length:roads.count},(_,i)=>new T.Vector3().setFromMatrixPosition(matrix(roads,i,c.port.hullG)).y);
 const state=createTankState(getSpec('mbt70'),new T.Vector3(),0),strokes=[];let minimum=Infinity,legacyRailTriangleHits=0;
 const fixtures=rollerSuspensionFixtures(c);assert.equal(fixtures[1].targetM,.65);assert.equal(fixtures[2].targetM,-.65);
 for(const f of [...fixtures,...[-10,10].map(deg=>({name:`pitch${deg}`,targetM:null,sample:fixtures[0].sample,pitch:deg*Math.PI/180}))]){
  c.gear.resetPose();for(let tick=0;tick<180;tick++)c.gear.conform(state,f.sample,f.pitch??0,0,1/60);
  c.gear.update(0,0);c.tank.root.updateMatrixWorld(true);
  const actual=rest.map((y,i)=>new T.Vector3().setFromMatrixPosition(matrix(roads,i,c.port.hullG)).y-y);
  const stroke={name:f.name,minimumM:Math.min(...actual),maximumM:Math.max(...actual)};strokes.push(stroke);
  if(f.targetM!==null)assert.ok(actual.every(n=>Math.abs(n-f.targetM)<2e-6),`Actual configured axle stroke ${JSON.stringify(stroke)}`);
  for(let phase=0;phase<16;phase++){
   const scroll=c.receipt.shoePitchM*phase/16;c.gear.update(scroll,-scroll,1/60);c.tank.root.updateMatrixWorld(true);
   minimum=Math.min(minimum,separation(c,targets));stats.poses++;
   if(f.name==='flat')legacyRailTriangleHits+=legacyRailIntersections(c);
  }
 }
 const intruding=targets.map(b=>b.clone().translate(new T.Vector3(-Math.sign(b.max.x)*.1,0,0)));
 assert.throws(()=>separation(c,intruding),/positive separation/,'Inboard web/roof regression fails closed');stats.negativeControls++;
 const extended=targets.map(b=>b.clone().expandByVector(new T.Vector3(.01,0,.5)));
 assert.throws(()=>separation(c,extended),/positive separation/,'Wide stern extension into end hardware fails closed');stats.negativeControls++;
 assert.ok(legacyRailTriangleHits>0,'Actual continuous near/far shoes penetrate the obsolete rails by more than 0.5 mm');stats.negativeControls++;
 return{minimumM:minimum,legacyRailTriangleHits,strokes};
}
for(const quality of ['high','low']){
  const current=capture(quality),old=capture(quality,true);
  try{
  if(quality==='high')assert.ok(current.tank.root.userData.battleDetailGroupCount>0,'Native batched battle detail groups actually installed');
  assert.equal(current.port.hullG.scale.z,.94);assert.equal(current.port.hullG.position.z,-.14);
  assert.deepEqual(current.cfg,old.cfg,'Every native gear input remains exact');
  assert.deepEqual(gearRows(current),gearRows(old),'Native geometry, matrices and hierarchy unaffected at rest');
  contacts(current);const moving=motion(current);
  assert.equal(ray([old.port.hullG.getObjectByName('hull')],[1.80,1.2,-.14],[-1,0,0],.065).length,0,'Omitting only new stock leaves old side opening');stats.negativeControls++;
  const hull=current.port.hullG.getObjectByName('hull');
  assert.equal(hash(hull.geometry),hash(old.port.hullG.getObjectByName('hull').geometry),'Primary hull bytes and original armor silhouette unchanged');
  const guards=['hullTrackGuardL','hullTrackGuardR'].map(name=>current.port.hullG.getObjectByName(name));
  for(const guard of guards){assert.equal(guard.parent,current.port.hullG);
   assert.equal(guard.userData.combatHitboxRole,'nonArmor');assert.equal(guard.material,current.port.mats.hull);
   assert.equal(guard.userData.appearanceRole,'armorPaint');assert.equal(guard.userData.trackGuard,true);
   assert.ok(guard.geometry.attributes.uv&&guard.geometry.attributes.color,'Native merged camouflage projection and dirt color retained');}
  const state=createTankState(getSpec('mbt70'),new T.Vector3(),0);
  for(const distance of[15,75,300]){
   current.tank.syncFromState(state,1/60,distance);current.tank.root.updateMatrixWorld(true);
   for(const guard of guards){let owner=guard;while(owner){assert.equal(owner.visible,true);owner=owner.parent;}}
   const start=current.port.hullG.localToWorld(v([1.80,1.2,0]));
   assert.ok(new T.Raycaster(start,v([-1,0,0]),0,.065).intersectObjects(guards,false).length,'Actual native merged apron persists at distance');
  }
  // MBT70's visual cassette blocks are plain authored stock, not registered
  // gameplay ERA clusters. An empty strip loop would be a vacuous proof.
  assert.deepEqual(current.tank.root.userData.eraClusterNames??[],[],'No destructive ERA coverage applies to this model');
  const disposed=[0,0];guards.forEach((g,i)=>g.geometry.addEventListener('dispose',()=>disposed[i]++));current.dispose();assert.deepEqual(disposed,[1,1],'Native merged owners dispose closure geometry exactly once');
  stats.rows.push({quality,triangles:328,...moving});
 }finally{current.dispose();old.dispose();}
}
material.dispose();console.log(JSON.stringify({pass:true,...stats,
 limitation:'Whole-stock conservative separation at actual 96 poses per quality; rendered appearance/source-view gate are separate; destructive ERA not applicable (zero clusters).'}));
