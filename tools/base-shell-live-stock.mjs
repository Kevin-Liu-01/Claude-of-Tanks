// Audit evidence only: compare captured authoring triangles to final drawable
// mesh buffers. A partCensus callback can precede P.clear / replacement, so
// presence in that callback alone does not establish shipped geometry.
import {Matrix4,Vector3,Triangle} from 'three';

const POINT_SCALE=1e5;
const MIN_AREA=1e-9; // Same nondegenerate-triangle threshold as shellPart.
const key=p=>p.map(value=>Math.round(value*POINT_SCALE)).join(',');
const faceKey=points=>{
  const [a,b,c]=points.map(key);
  // Cyclic rotations retain winding; reversed triangles must not match.
  return [`${a}|${b}|${c}`,`${b}|${c}|${a}`,`${c}|${a}|${b}`].sort()[0];
};
const drawable=material=>material&&material.visible!==false&&material.colorWrite!==false
  &&!(material.transparent&&material.opacity<=0);

function drawableRanges(mesh){
  const geometry=mesh.geometry,position=geometry.getAttribute('position');
  if(!position)return [];
  const count=geometry.index?.count??position.count,draw=geometry.drawRange;
  const start=Math.max(0,draw.start),end=Math.min(count,draw.start+draw.count);
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  // Three.js uses groups only when material is an array.
  const groups=Array.isArray(mesh.material)?geometry.groups:[{start:0,count,materialIndex:0}];
  return groups.filter(group=>drawable(materials[group.materialIndex??0]))
    .map(group=>[Math.max(start,group.start),Math.min(end,group.start+group.count)])
    .filter(([a,b])=>b-a>=3);
}
function nativeTriangles(mesh,matrix,ranges,emit){
  const geometry=mesh.geometry,position=geometry.getAttribute('position'),index=geometry.index;
  const a=new Vector3(),b=new Vector3(),c=new Vector3(),triangle=new Triangle(a,b,c);
  // Overlapping material groups should not pretend a missing source face
  // exists twice. Count each actual mesh/instance triangle once.
  const seen=new Set();
  for(const [start,end]of ranges)for(let i=start;i+2<end;i+=3){
    if(seen.has(i))continue;seen.add(i);
    a.fromBufferAttribute(position,index?index.getX(i):i).applyMatrix4(matrix);
    b.fromBufferAttribute(position,index?index.getX(i+1):i+1).applyMatrix4(matrix);
    c.fromBufferAttribute(position,index?index.getX(i+2):i+2).applyMatrix4(matrix);
    if(triangle.getArea()>MIN_AREA)emit([a.toArray(),b.toArray(),c.toArray()]);
  }
}

/** Final mesh triangles in each hull/turret owner's local coordinate frame.
 * Does not use a part's own geometry as the expected native buffer. Hidden
 * objects/material groups and discarded draw ranges do not provide evidence.
 */
export function nativeStructuralStock(root,bucketNames){
  root.updateMatrixWorld(true);
  const buckets=new Map(bucketNames.map(name=>[name,new Map()]));
  const meshes=[],unsupported=[];
  root.traverseVisible(mesh=>{
    if(!mesh.isMesh||!buckets.has(mesh.name)||mesh.userData.shadowOnly||mesh.userData.authoredShadowProxy)return;
    const ownerName=mesh.name.startsWith('turret')?'rig_turret':'rig_hull';
    const owner=root.getObjectByName(ownerName);
    if(!owner||mesh.isBatchedMesh){unsupported.push({mesh:mesh.name,reason:!owner?'missing canonical owner':'batched mesh requires explicit range expansion'});return;}
    const matrix=owner.matrixWorld.clone().invert().multiply(mesh.matrixWorld),ranges=drawableRanges(mesh);
    let triangleCount=0;const index=buckets.get(mesh.name),emit=points=>{const key=faceKey(points);index.set(key,(index.get(key)??0)+1);triangleCount++;};
    if(mesh.isInstancedMesh){
      for(let instance=0;instance<mesh.count;instance++){
        const transform=new Matrix4();mesh.getMatrixAt(instance,transform);
        nativeTriangles(mesh,matrix.clone().multiply(transform),ranges,emit);
      }
    }else nativeTriangles(mesh,matrix,ranges,emit);
    meshes.push({name:mesh.name,owner:ownerName,triangles:triangleCount,instances:mesh.isInstancedMesh?mesh.count:1});
  });
  return {buckets,meshes,unsupported};
}

/** Geometry correspondence, not unique original-object identity. Duplicate
 * equal captured parts may refer to one rendered stock; do not sum matches
 * into a native part count or call an unmatched capture discarded without
 * independent source replacement evidence. Partial matches stay explicit.
 */
export function mapCapturedStock(part,nativeIndex){
  const available=new Map(nativeIndex??[]),missing=[];let matched=0;
  for(let i=0;i<part.triangles.length;i++){
    const points=part.triangles[i].points,key=faceKey(points),count=available.get(key)??0;
    if(count>0){available.set(key,count-1);matched++;}
    else if(missing.length<3)missing.push({triangle:i,points});
  }
  const total=part.triangles.length;
  return {triangles:total,matchedTriangles:matched,unmatchedTriangles:total-matched,
    status:total===0?'empty-captured-stock':matched===total?'all-native-triangles':matched?'partial-native-match':'no-native-match',
    unmatchedWitnesses:missing};
}
