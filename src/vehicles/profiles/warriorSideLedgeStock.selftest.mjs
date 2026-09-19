import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { isTrackShoeMesh } from '../../../tools/track-clip-classification.mjs';
import { buildFv510MilanX } from './fv510MilanX.ts';
import { KIT } from './kit.ts';

// Independent complete-source FrontSide calipers, never source topology.
// Canonical source SHA e568badc436980b9f2b718db9786120fcc7527b7fe6465c3efa66889fa208c04.
// Each tuple is [origin, direction, far, first hit/null]. These 47 locations
// were chosen independently of the continuity raster. Object_9's cover is
// deliberately retained as the first occluder above the forward hull edge.
const witnesses = [
  [[-1.68,6,-2.2],[0,-1,0],20,[-1.68,1.900499939918518,-2.2]],
  [[-1.8,6,-2.2],[0,-1,0],20,null],
  [[-1.68,6,-1.55],[0,-1,0],20,[-1.68,1.900499939918518,-1.55]],
  [[-1.8,6,-1.55],[0,-1,0],20,null],
  [[-1.68,6,-0.65],[0,-1,0],20,[-1.68,1.900499939918518,-0.65]],
  [[-1.8,6,-0.65],[0,-1,0],20,null],
  [[-1.68,6,0.45],[0,-1,0],20,[-1.68,1.900499939918518,0.45]],
  [[-1.8,6,0.45],[0,-1,0],20,null],
  [[-1.68,6,1.23],[0,-1,0],20,[-1.68,1.900499939918518,1.23]],
  [[-1.8,6,1.23],[0,-1,0],20,null],
  [[-1.68,6,1.83],[0,-1,0],20,null],
  [[-1.8,6,1.83],[0,-1,0],20,null],
  [[1.68,6,-2.2],[0,-1,0],20,[1.68,1.900499939918518,-2.2]],
  [[1.8,6,-2.2],[0,-1,0],20,null],
  [[1.68,6,-1.55],[0,-1,0],20,[1.68,1.900499939918518,-1.55]],
  [[1.8,6,-1.55],[0,-1,0],20,null],
  [[1.68,6,-0.65],[0,-1,0],20,[1.68,1.900499939918518,-0.65]],
  [[1.8,6,-0.65],[0,-1,0],20,null],
  [[1.68,6,0.45],[0,-1,0],20,[1.68,1.900499939918518,0.45]],
  [[1.8,6,0.45],[0,-1,0],20,null],
  [[1.68,6,1.23],[0,-1,0],20,[1.68,1.8997430329993739,1.23]],
  [[1.8,6,1.23],[0,-1,0],20,null],
  [[1.68,6,1.83],[0,-1,0],20,[1.68,1.7499048573478886,1.83]],
  [[1.8,6,1.83],[0,-1,0],20,null],
  [[-1.895,6,-2.2],[0,-1,0],20,[-1.895,1.862690305768382,-2.2]],
  [[-1.895,6,-1.55],[0,-1,0],20,[-1.895,1.862690305768382,-1.55]],
  [[-1.895,6,-0.65],[0,-1,0],20,[-1.895,1.862690305768382,-0.65]],
  [[-1.895,6,0.45],[0,-1,0],20,[-1.895,1.862690305768382,0.45]],
  [[-1.895,6,1.23],[0,-1,0],20,[-1.895,1.862690305768382,1.23]],
  [[-1.57,6,1.7],[0,-1,0],20,[-1.57,1.53371027602938,1.7]],
  [[-1.57,6,2.15],[0,-1,0],20,[-1.57,1.521810021893491,2.15]],
  [[-1.8,1.3,-2.2],[1,0,0],0.3,[-1.7060999870300293,1.3,-2.2]],
  [[-1.8,1.7,-2.2],[1,0,0],0.3,[-1.7060999870300293,1.7,-2.2]],
  [[-1.8,1.3,-0.65],[1,0,0],0.3,[-1.7060999870300293,1.3,-0.65]],
  [[-1.8,1.7,-0.65],[1,0,0],0.3,[-1.7060999870300293,1.7,-0.65]],
  [[-1.8,1.3,0.45],[1,0,0],0.3,[-1.7060999870300293,1.3,0.45]],
  [[-1.8,1.7,0.45],[1,0,0],0.3,[-1.7060999870300293,1.7,0.45]],
  [[-1.8,1.3,1.23],[1,0,0],0.3,[-1.7060999870300293,1.3,1.23]],
  [[-1.8,1.7,1.23],[1,0,0],0.3,[-1.7060999870300293,1.7,1.23]],
  [[1.8,1.3,-2.2],[-1,0,0],0.3,[1.701200008392334,1.3,-2.2]],
  [[1.8,1.7,-2.2],[-1,0,0],0.3,[1.701200008392334,1.7,-2.2]],
  [[1.8,1.3,-0.65],[-1,0,0],0.3,[1.701200008392334,1.3,-0.65]],
  [[1.8,1.7,-0.65],[-1,0,0],0.3,[1.701200008392334,1.7,-0.65]],
  [[1.8,1.3,0.45],[-1,0,0],0.3,[1.7148000001907349,1.3,0.45]],
  [[1.8,1.7,0.45],[-1,0,0],0.3,[1.7148000001907349,1.7,0.45]],
  [[1.8,1.3,1.23],[-1,0,0],0.3,[1.701200008392334,1.3,1.23]],
  [[1.8,1.7,1.23],[-1,0,0],0.3,[1.701200008392334,1.7,1.23]],
];
const id='fv510_milan_x';
const frontMaterial=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
const sectionMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const ray=new THREE.Raycaster();
await ensureInteriorFills([id]);
assert.ok(hasInteriorFills(id),'test actual loaded interior stock');
function visible(hit) {
  for(let object=hit.object;object;object=object.parent)if(!object.visible)return false;
  const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
  return material?.colorWrite!==false&&!hit.object.userData.shadowOnly;
}
function first(root,origin,direction,far=20) {
  ray.set(new THREE.Vector3(...origin),new THREE.Vector3(...direction));ray.near=0;ray.far=far;
  return ray.intersectObject(root,true).find(visible);
}
function checkWitnesses(root) {
  let maxResidual=0;
  for(const [origin,direction,far,expected] of witnesses) {
    const hit=first(root,origin,direction,far);
    assert.equal(!!hit,!!expected,`source stock/air at ${origin}`);
    if(expected) {
      const residual=hit.point.distanceTo(new THREE.Vector3(...expected));
      assert.ok(residual<=.002,`source first-hit residual ${residual}m at ${origin}`);
      maxResidual=Math.max(maxResidual,residual);
    }
  }
  return maxResidual;
}
// The last physical crossing before the witness must be an entering face,
// and the following crossing an exit. This rejects the empty cavity inside
// a concave J section even when its complete AABB encloses the witness.
function contains(mesh,point,axis) {
  const direction=new THREE.Vector3();direction[axis]=1;
  const p=new THREE.Vector3(...point);
  ray.set(p.clone().addScaledVector(direction,-5),direction);ray.near=0;ray.far=10;
  const hits=ray.intersectObject(mesh).filter((hit,i,all)=>!i||Math.abs(hit.distance-all[i-1].distance)>1e-7);
  const before=hits.filter(hit=>hit.distance<5-1e-6).at(-1);
  const after=hits.find(hit=>hit.distance>5+1e-6);
  return !!before&&!!after&&before.face.normal.dot(direction)<-.001&&after.face.normal.dot(direction)>.001;
}
function buildCaptured(quality,mutation=null) {
  const parts=[];
  registerProfiledBuilders({[id](P){
    const add=P.add;
    P.add=(bucket,geometry,...transform)=>{
      let stock=KIT.xform(geometry.clone(),...transform);
      if(mutation==='unseat-panels'&&bucket==='hullExternalArmor') {
        stock.computeBoundingBox();const b=stock.boundingBox;
        const side=b.min.x>1.61&&b.max.x<1.74?1:b.max.x< -1.61&&b.min.x> -1.74?-1:0;
        if(side){const x=(transform[0]??0)-side*.03;transform=[x,...transform.slice(1)];stock.dispose();stock=KIT.xform(geometry.clone(),...transform);}
      }
      const mesh=new THREE.Mesh(stock,sectionMaterial);
      mesh.updateMatrixWorld(true);mesh.geometry.computeBoundingBox();
      const bounds=mesh.geometry.boundingBox;
      if(mutation==='delete-right-ledge'&&bucket==='hull'&&bounds.min.x>1.57&&bounds.max.x<1.74&&bounds.max.y>1.89) {
        mesh.geometry.dispose();return;
      }
      parts.push({bucket,mesh,bounds});
      return add(bucket,geometry,...transform);
    };
    buildFv510MilanX(P);
    if(mutation==='fill-open-corridor')P.add('hull',new THREE.BoxGeometry(.10,.20,.20),1.8,1.80,-2.2);
  }});
  let tank;
  try {tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,batchStatic:false});}
  finally {registerProfiledBuilders({[id]:buildFv510MilanX});}
  tank.root.traverse(object=>{
    if(object.isLOD){object.autoUpdate=false;object.levels.forEach((level,i)=>level.object.visible=i===0);}
    if(object.isMesh) {
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(object.userData.shadowOnly||materials.every(m=>m.colorWrite===false))object.visible=false;
      else object.material=frontMaterial;
    }
  });
  tank.root.updateMatrixWorld(true);
  return {tank,parts,dispose(){tank.dispose();for(const part of parts)part.mesh.geometry.dispose();}};
}
function partTriangles(part) {
  const geometry=part.mesh.geometry,p=geometry.attributes.position,index=geometry.index,result=[];
  for(let i=0;i<(index?.count??p.count);i+=3)result.push(new THREE.Triangle(...[0,1,2].map(k=>
    new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k))));
  return result;
}
const report=[];
try {
  for(const quality of ['high','low']) {
    const built=buildCaptured(quality),{tank,parts}=built;
    try {
      const root=tank.root,maxResidual=checkWitnesses(root);
      const seats=[
        {name:'right panel upper rim',point:[1.7171,1.874,-2.2],axis:'x',buckets:['hull','hullExternalArmor']},
        {name:'left panel upper rim',point:[-1.7219,1.874,-2.2],axis:'x',buckets:['hull','hullExternalArmor']},
        {name:'cover folded foot',point:[-1.557,1.461,2.225],axis:'y',buckets:['hull','hullDetail']},
        {name:'right inner web',point:[1.590,1.70,0],axis:'x',buckets:['hull','hull']},
        {name:'left inner web',point:[-1.5988,1.70,0],axis:'x',buckets:['hull','hull']},
      ];
      for(const seat of seats) {
        const hits=parts.filter(part=>contains(part.mesh,seat.point,seat.axis));
        for(const bucket of new Set(seat.buckets))assert.ok(
          hits.filter(part=>part.bucket===bucket).length>=seat.buckets.filter(b=>b===bucket).length,
          `${seat.name} has finite material on both sides of its physical seat`);
      }
      for(const side of [-1,1]) {
        const cavity=[side*1.66,1.885,-2.2];
        assert.ok(parts.every(part=>!contains(part.mesh,cavity,'x')),'J underside retains measured air above hanging panel');
      }
      for(const z of [-1.225,.17,.48]) {
        assert.equal(first(root,[1.72,1.91,z],[0,-1,0],.06),undefined,'source outer flange seam stays open');
        assert.ok(first(root,[1.65,1.91,z],[0,-1,0],.04),'source narrow inner shelf continues through seam');
      }
      const recess=first(root,[1.8,1.2833,1.8438],[-1,0,0],.25);
      assert.ok(recess&&Math.abs(recess.point.x-1.6582)<.0001,'forward panel blind recess retains actual floor');
      const rim=first(root,[1.8,1.2833,1.96],[-1,0,0],.25);
      assert.ok(rim&&Math.abs(rim.point.x-1.7012)<.0001,'the recess is in a real surrounding broad face');
      let triangles=0;
      root.traverseVisible(object=>{if(object.isMesh)triangles+=Math.min(object.geometry.index?.count??object.geometry.attributes.position.count,
        object.geometry.drawRange.count)/3*(object.isInstancedMesh?object.count:1);});
      assert.ok(triangles<=80000,`${quality} actual selected geometry stays below fixed IFV budget`);
      const guarded=parts.filter(({bucket,bounds:b})=>['hull','hullExternalArmor','hullDetail'].includes(bucket)&&
        b.min.y>=.7954&&b.max.y<=1.901&&b.min.z>=-2.7701&&b.max.z<=2.758&&
        ((b.min.x>=1.40&&b.max.x<=2.103)||(b.max.x<=-1.40&&b.min.x>=-2.103)));
      assert.ok(guarded.length>50,'test the actual narrow new body parts');
      const stockTriangles=guarded.flatMap(partTriangles),shoes=[];
      root.traverse(object=>{if(isTrackShoeMesh(object))shoes.push(object);});
      assert.ok(shoes.length>0,'native moving instanced shoes are installed');
      const state=createTankState(getSpec(id),new THREE.Vector3(),0);
      const instance=new THREE.Matrix4(),world=new THREE.Matrix4();let checks=0;
      for(const phase of [0,.023,.057,.101,.149]) {
        state.trackScroll.l=phase;state.trackScroll.r=phase;tank.syncFromState(state,1);root.updateMatrixWorld(true);
        for(const shoe of shoes) {
          shoe.geometry.computeBoundingBox();
          for(let i=0;i<shoe.count;i++) {
            shoe.getMatrixAt(i,instance);world.multiplyMatrices(shoe.matrixWorld,instance);
            const bounds=shoe.geometry.boundingBox.clone().applyMatrix4(world).expandByScalar(.01);checks++;
            for(const triangle of stockTriangles)assert.equal(bounds.intersectsTriangle(triangle),false,
              `${quality}: actual shoe ${shoe.name}/${i} clears side stock by 10mm at phase ${phase}`);
          }
        }
      }
      report.push({quality,witnesses:47,air:13,maxResidualM:maxResidual,finiteSeats:seats.length,shoeBounds:checks,triangles});
    } finally {built.dispose();}
    const unseated=buildCaptured(quality,'unseat-panels');
    try {
      for(const point of [[1.7171,1.874,-2.2],[-1.7219,1.874,-2.2]])assert.ok(
        unseated.parts.filter(part=>part.bucket==='hullExternalArmor').every(part=>!contains(part.mesh,point,'x')),
        'a retained but retracted panel has no stock at the J return seat');
    } finally {unseated.dispose();}
    for(const mutation of ['delete-right-ledge','fill-open-corridor']) {
      const negative=buildCaptured(quality,mutation);
      try {assert.throws(()=>checkWitnesses(negative.tank.root),assert.AssertionError,`${mutation} is rejected`);}
      finally {negative.dispose();}
    }
  }
  assert.ok(report[1].triangles<=report[0].triangles*.75,'LOW meets fixed 75% reduction budget');
} finally {frontMaterial.dispose();sectionMaterial.dispose();registerProfiledBuilders({[id]:buildFv510MilanX});}
console.log('warriorSideLedgeStock: source first hits, real air, finite seats, mutated-stock negatives and moving-shoe clearance PASS',JSON.stringify(report));
