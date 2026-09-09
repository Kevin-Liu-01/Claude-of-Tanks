import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders,KIT} from '../tankFactoryCore.ts';
import {buildLeopard2A7VX,buildLeopard2A6MX,buildLeopard2A4MX} from './leopardX.ts';
import {buildLeopardRevolution} from './leopardRevolution.ts';

const cases=[
  ['leo2a7v_x',buildLeopard2A7VX,.043,.22,.034,12,-.48,1],
  ['leo2a6m_x',buildLeopard2A6MX,.043,.22,.034,12,-.48,1],
  ['leo2a4m_x',buildLeopard2A4MX,.043,.22,.034,12,-.48,1],
  ['leo2_revolution',buildLeopardRevolution,.034,.17,.025,10,-.32,.4],
];
const stats={builds:0,launchers:0,posedPairs:0,oldAxisFailures:0,negativeControls:0,
  maximumOldAxisErrorM:{},maximumNewAxisErrorM:0};
const hash=g=>{
  const h=crypto.createHash('sha256');
  for(const k of Object.keys(g.attributes).sort()){
    const a=g.attributes[k];h.update(k);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
  }
  if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));
  return h.digest('hex');
};
function capture(c,quality,legacy){
  const [id,build,r,length,cr,segments,rx,ry]=c,pairs=[],retained=[];let pending,darkMaterial;
  registerProfiledBuilders({[id]:P=>build(new Proxy(P,{get(target,key){
    darkMaterial??=target.mats.dark;
    if(!['add','addEquipment','addMudguard'].includes(key))return Reflect.get(target,key);
    return(...original)=>{
      let args=original;const at=key==='addMudguard'?1:0,slot=args[at],g=args[at+1],p=g.parameters;
      const transform=args.slice(at+2),angle=transform[4];
      const sameAim=Math.abs(transform[3]-rx)<1e-12&&Math.abs(Math.abs(angle)-ry)<1e-12;
      const body=key==='addEquipment'&&sameAim&&slot==='turretDetail'&&p?.radiusTop===r&&p.height===length;
      const cap=key==='addEquipment'&&sameAim&&slot==='turretDark'&&p?.radiusTop===cr&&p.height===.012;
      if(body){
        assert.equal(p.radialSegments,segments);assert.equal(p.openEnded,false);
        assert.equal(pending,undefined,'Each cap immediately follows its own tube');
        assert.equal(transform[5]??0,0,'Retain each original zero-roll aim');
        pending={transform:[...transform],origin:new T.Vector3(...transform.slice(0,3)),rotation:new T.Euler(rx,angle,0),
          body:KIT.xform(g.clone(),...transform),length,r,cr};
      }
      if(cap){
        assert.ok(pending);assert.deepEqual(transform,pending.transform,
          'Body and cap share the exact emitted mount transform, including wrapper defaults');
        if(legacy){
          // Exact prechange freehand placement, not a second revised recipe.
          const offset=id==='leo2_revolution'?[0,.027,.079]:[Math.sign(angle)*.084,.052,.050];
          const position=pending.origin.clone().add(new T.Vector3(...offset));
          args=[slot,KIT.cylZ(cr,.012,segments),...position.toArray(),rx,angle];g.dispose();
        }
        pending.cap=KIT.xform(args[1].clone(),...args.slice(2));pairs.push(pending);pending=undefined;
      }else{
        const transformed=KIT.xform(g.clone(),...transform);
        retained.push([key,at?args[0]:null,slot,hash(transformed)]);transformed.dispose();
      }
      return target[key](...args);
    };
  }}))});
  try{
    const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
    assert.equal(pending,undefined);assert.equal(pairs.length,16,`${id}: all original bilateral launchers`);
    tank.root.updateMatrixWorld(true);stats.builds++;return{tank,pairs,retained,darkMaterial};
  }finally{registerProfiledBuilders({[id]:build});}
}
const material=new T.MeshBasicMaterial({side:T.DoubleSide});
function localBox(g,pair,matrix){
  const own=new T.Matrix4().compose(pair.origin,new T.Quaternion().setFromEuler(pair.rotation),new T.Vector3(1,1,1));
  const frame=matrix.clone().multiply(own).invert(),box=new T.Box3();
  for(let i=0;i<g.attributes.position.count;i++)box.expandByPoint(new T.Vector3()
    .fromBufferAttribute(g.attributes.position,i).applyMatrix4(matrix).applyMatrix4(frame));
  return box;
}
function aligned(pair,matrix){
  const b=localBox(pair.body,pair,matrix),cap=localBox(pair.cap,pair,matrix),center=cap.getCenter(new T.Vector3());
  const radial=Math.hypot(center.x,center.y);
  assert.ok(radial<2e-6,`Cap center must lie on actual tube axis; error ${radial}`);
  assert.ok(Math.abs(b.max.z-pair.length/2)<2e-6&&Math.abs(b.min.z+pair.length/2)<2e-6);
  assert.ok(b.max.z-cap.min.z>.0059&&b.max.z-cap.min.z<.0061,'Positive 6 mm axial cap/tube overlap');
  assert.ok(cap.max.z-b.max.z>.0059&&cap.max.z-b.max.z<.0061,'Cap front stays 6 mm outside the closed tube');
  assert.ok(Math.max(Math.abs(cap.min.x),Math.abs(cap.max.x))<pair.r-.008,
    'Finite cap perimeter fits within the actual tube end, not just intersecting AABBs');
  // Five finite parallel entry rays land on both actual closed surfaces.
  const localToWorld=matrix.clone().multiply(new T.Matrix4().compose(pair.origin,
    new T.Quaternion().setFromEuler(pair.rotation),new T.Vector3(1,1,1)));
  const body=new T.Mesh(pair.body,material),end=new T.Mesh(pair.cap,material);
  body.matrixAutoUpdate=end.matrixAutoUpdate=false;body.matrixWorld.copy(matrix);end.matrixWorld.copy(matrix);
  for(const [x,y]of [[0,0],[pair.cr*.4,0],[-pair.cr*.4,0],[0,pair.cr*.4],[0,-pair.cr*.4]]){
    const ray=new T.Raycaster(new T.Vector3(x,y,pair.length).applyMatrix4(localToWorld),
      new T.Vector3(0,0,-1).transformDirection(localToWorld),0,pair.length);
    const a=ray.intersectObject(body,false)[0],b=ray.intersectObject(end,false)[0];
    assert.ok(a&&b&&Math.abs((a.distance-b.distance)-.006)<3e-6,
      'Real end-cap triangles cover and overlap the closed receiving face');
  }
  return radial;
}
function rows(g){
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,index=g.index,out=[];
  for(let j=0;j<(index?.count??p.count);j++){
    const i=index?index.getX(j):j;
    out.push([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),uv.getX(i),uv.getY(i)]
      .map(v=>Math.round(v*1e5)).join(','));
  }return out;
}
function nativeRetained(c){
  const all=[];let capMeshes=0;
  c.tank.root.traverse(o=>{
    if(!o.isMesh)return;
    if(o.name==='turretDark'){
      const available=new Map();for(const row of rows(o.geometry))available.set(row,(available.get(row)??0)+1);
      for(const p of c.pairs)for(const row of rows(p.cap)){
        const count=available.get(row)??0;assert.ok(count>0,'Every cap triangle is present in the actual merged native dark mesh');
        available.set(row,count-1);
      }
      all.push([o.name,[...available].filter(([,count])=>count).sort()]);capMeshes++;
      assert.equal(o.material,c.darkMaterial,'Exact existing dark-role material identity from the live builder');
      let owner=o;while(owner&&owner.name!=='rig_turret')owner=owner.parent;
      assert.ok(owner,'Native merged caps remain owned by the rotating turret');
    }else all.push([o.name,hash(o.geometry)]);
    all.push(['ownership',o.name,o.parent?.name,o.matrix.elements,o.material.name,
      o.isInstancedMesh?Array.from(o.instanceMatrix.array):null,o.visible]);
  });
  assert.equal(capMeshes,1,'One original dark equipment bucket; no new per-launcher meshes');
  return all;
}
function dispose(c){c.tank.dispose();for(const p of c.pairs){p.body.dispose();p.cap.dispose();}}
for(const c of cases)for(const quality of ['high','low']){
  const old=capture(c,quality,true),current=capture(c,quality,false),[id]=c;
  assert.deepEqual(current.retained,old.retained,'Every non-cap authored emission is byte-identical');
  assert.deepEqual(nativeRetained(current),nativeRetained(old),
    'All native retained geometry, materials, ownership, matrices and instance buffers stay unchanged');
  const turret=current.tank.root.getObjectByName('rig_turret');
  for(const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI]){
    turret.rotation.y=yaw;current.tank.root.updateMatrixWorld(true);
    for(const p of current.pairs){
      stats.maximumNewAxisErrorM=Math.max(stats.maximumNewAxisErrorM,aligned(p,turret.matrixWorld));stats.posedPairs++;
    }
  }
  for(let i=0;i<old.pairs.length;i++){
    const p=old.pairs[i],b=localBox(p.cap,p,new T.Matrix4()),center=b.getCenter(new T.Vector3());
    stats.maximumOldAxisErrorM[id]=Math.max(stats.maximumOldAxisErrorM[id]??0,Math.hypot(center.x,center.y));
    assert.throws(()=>aligned(p,new T.Matrix4()),/Cap center/);stats.oldAxisFailures++;
    assert.equal(hash(p.body),hash(current.pairs[i].body),'Unchanged tube including original aim and station');
    stats.launchers++;
  }
  for(const delta of [[.020,0,0],[0,0,.020]]){
    const p=current.pairs[0],mutant={...p,cap:p.cap.clone()},q=new T.Quaternion().setFromEuler(p.rotation);
    mutant.cap.translate(...new T.Vector3(...delta).applyQuaternion(q).toArray());
    assert.throws(()=>aligned(mutant,new T.Matrix4()),/Cap center|overlap/);mutant.cap.dispose();stats.negativeControls++;
  }
  dispose(old);dispose(current);
}
material.dispose();
console.log(JSON.stringify({pass:true,...stats,scope:'Actual Node procedural assemblies and finite triangles; no rendered or complete release claim.'}));
