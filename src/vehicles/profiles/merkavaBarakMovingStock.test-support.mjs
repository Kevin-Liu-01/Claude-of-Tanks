import assert from 'node:assert/strict';
import * as T from 'three';
import {createTankState} from '../../sim/movement.ts';
import {getSpec} from '../specs.ts';

const stats={instances:0,triangleTests:0,rejectedAabbs:0,containmentExclusions:0,gearMeshes:new Set(),stockTypes:new Set()};
function hull(points){
  const planes=[],box=new T.Box3().setFromPoints(points);
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)for(let k=j+1;k<points.length;k++){
    const n=points[j].clone().sub(points[i]).cross(points[k].clone().sub(points[i]));
    if(n.lengthSq()<1e-16)continue;n.normalize();let d=-n.dot(points[i]);
    const ds=points.map(p=>n.dot(p)+d),lo=Math.min(...ds),hi=Math.max(...ds);
    if(lo < -2e-7 && hi > 2e-7)continue;
    if(lo>=-2e-7){n.negate();d=-d;}
    if(!planes.some(p=>p.n.distanceToSquared(n)<1e-12&&Math.abs(p.d-d)<2e-7))planes.push({n,d});
  }
  assert.ok(planes.length>=6,'Finite convex occupied component');return {planes,box};
}
function triangleIntersects(points,solid){
  let poly=points;
  for(const {n,d} of solid.planes){
    const next=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=n.dot(a)+d+1e-7,db=n.dot(b)+d+1e-7;
      if(da<=0)next.push(a);
      if((da<0)!==(db<0))next.push(a.clone().lerp(b,da/(da-db)));
    }
    poly=next;if(poly.length<3)return false;
  }
  let area=0;for(let i=1;i<poly.length-1;i++)area+=poly[i].clone().sub(poly[0]).cross(poly[i+1].clone().sub(poly[0])).length();
  return area>1e-12;
}
function movingStock(tank,solids,check=true){
  const rig=tank.root.getObjectByName('rig_hull'),inverse=rig.matrixWorld.clone().invert();
  const matrix=new T.Matrix4(),box=new T.Box3(),triBox=new T.Box3();
  let penetrations=0;
  rig.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.userData.runningGear)return;
    stats.gearMeshes.add(mesh.name);stats.stockTypes.add(mesh.isInstancedMesh?'instanced':'merged');
    const g=mesh.geometry,p=g.attributes.position,index=g.index,n=index?index.count:p.count;
    // The carrier is deformed in place. Construction-time boxes are stale
    // and cannot exclude current occupied stock from the physical proof.
    g.computeBoundingBox();
    for(let instance=0;instance<(mesh.isInstancedMesh?mesh.count:1);instance++){
      if(mesh.isInstancedMesh)mesh.getMatrixAt(instance,matrix);else matrix.identity();
      matrix.premultiply(mesh.matrixWorld).premultiply(inverse);stats.instances++;
      box.copy(g.boundingBox).applyMatrix4(matrix);
      const candidates=solids.filter(s=>box.intersectsBox(s.box));
      if(!candidates.length){stats.rejectedAabbs++;continue;}
      if(check)for(const s of candidates){
        // Surface clipping also catches an entire gear component inside a
        // folded cell. The opposite containment could otherwise hide with no
        // intersecting gear face: conservatively reject any native mesh box
        // capable of enclosing a complete new convex cell. A disjoint portion
        // of the real cell's bounds rules that case out; this is not an AABB
        // substituted for occupied stock. Ambiguous enclosure must fail.
        assert.ok(!box.containsBox(s.box),'No new convex fender cell may hide wholly inside native gear stock');
        stats.containmentExclusions++;
      }
      // Indexed and nonindexed, visible and hidden far shoes, complete open
      // and closed finite surfaces: none is dropped by an oracle-name filter.
      for(let i=0;i<n;i+=3){
        const tri=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(matrix));
        triBox.setFromPoints(tri);
        for(const s of candidates)if(triBox.intersectsBox(s.box)){
          stats.triangleTests++;if(triangleIntersects(tri,s))penetrations++;
        }
      }
    }
  });
  if(check)assert.equal(penetrations,0,'No actual moving stock finite surface may enter the new folded stock');
  return penetrations;
}

function occupied(sheet){
  const p=sheet.geometry.attributes.position,n=p.count===36?4:6;
  assert.equal(p.count,n===4?36:60,'known closed four/six corner parametric sheet');
  const a=[],b=[];
  for(let i=0;i<n;i++){
    a.push(new T.Vector3().fromBufferAttribute(p,i*6));
    b.push(new T.Vector3().fromBufferAttribute(p,i*6+5));
  }
  const pieces=n===4?[[0,1,2,3]]:[[0,1,2,5],[2,3,4,5]];
  return pieces.map(indices=>hull([...indices.map(i=>a[i]),...indices.map(i=>b[i])]));
}
export function proveBarakMovingRearStock(tank,sheets){
  const before={instances:stats.instances,triangleTests:stats.triangleTests};
  const solids=sheets.flatMap(occupied),state=createTankState(getSpec('merkava4_barak'),new T.Vector3(),0);
  const original=sheets[0].geometry.clone(),p=original.attributes.position;
  for(let i=0;i<p.count;i++)if(p.getZ(i)>-3.5)p.setZ(i,-3.31463);
  assert.ok(movingStock(tank,occupied({geometry:original}),false)>0,'original source-overlapping tip fails real native stock proof');
  original.dispose();
  let phases=0;
  for(const terrain of[null,()=>1,()=>-1,(x,z)=>.035*Math.sin(z*2.1)+.025*x]){
    tank.setGroundSampler(terrain);
    for(let phase=0;phase<=32;phase++){
      state.trackScroll.l=phase/32*(2*Math.PI*.353);state.trackScroll.r=-phase/32*(2*Math.PI*.3332);
      state.visualPitch=terrain?.(0,0)===1?.10:0;state.visualRoll=terrain?.(0,0)===-1?-.08:0;
      state.yaw=.31;tank.syncFromState(state,1/60,10);tank.root.updateMatrixWorld(true);
      movingStock(tank,solids);phases++;
    }
  }
  return {phases,instances:stats.instances-before.instances,triangleTests:stats.triangleTests-before.triangleTests};
}
