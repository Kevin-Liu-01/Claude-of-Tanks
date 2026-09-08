// Offline continuous neutral-course bounds. No sampled-only clearance claim.
import assert from 'node:assert/strict';
import * as T from 'three';
export function trigonometricRange(a,b,lo,hi){
 if(lo>hi)[lo,hi]=[hi,lo];const values=[a*Math.cos(lo)+b*Math.sin(lo),a*Math.cos(hi)+b*Math.sin(hi)];
 const angle=Math.atan2(b,a);
 for(let k=Math.ceil((lo-angle)/Math.PI);angle+k*Math.PI<=hi;k++)values.push(a*Math.cos(angle+k*Math.PI)+b*Math.sin(angle+k*Math.PI));
 return[Math.min(...values),Math.max(...values)];
}
export function trackCourseIntervals(band,receipt,pitch,offset,rigid){
 const bp=band.attributes.position,segments=[];let length=0;
 assert.equal(bp.count,receipt.loopPoints.length*24,'exact native carrier topology');
 for(let i=0;i<receipt.loopPoints.length;i++){
  const point=receipt.loopPoints[i],next=receipt.loopPoints[(i+1)%receipt.loopPoints.length];
  const l=Math.hypot(next[0]-point[0],next[1]-point[1])||1e-6,base=i*24;
  const y0=(bp.getY(base+2)+bp.getY(base+6))/2,z0=(bp.getZ(base+2)+bp.getZ(base+6))/2;
  const y1=(bp.getY(base)+bp.getY(base+8))/2,z1=(bp.getZ(base)+bp.getZ(base+8))/2;
  const live=Math.max(Math.hypot(z1-z0,y1-y0),1e-6);
  segments.push({c0:length,l,y0:y0+(z1-z0)/live*offset,z0:z0-(y1-y0)/live*offset,dy:y1-y0,dz:z1-z0});length+=l;
 }
 const wrap=s=>((s%length)+length)%length;
 const at=s=>{s=wrap(s);let i=0;while(i<segments.length-1&&s>=segments[i].c0+segments[i].l)i++;return segments[i];};
 const sample=(segment,s,near)=>{
  const distance=wrap(near)+(s-near),t=(distance-segment.c0)/segment.l;
  return{y:segment.y0+segment.dy*t,z:segment.z0+segment.dz*t};
 };
 const half=rigid?pitch/2:0;
 const pose=(s,a=at(s-half),b=at(s+half),near=s)=>{
  if(!rigid)return{...sample(a,s,near),dy:a.dy,dz:a.dz,angle:Math.atan2(a.dy,a.dz)};
  const av=sample(a,s-half,near-half),bv=sample(b,s+half,near+half);
  return{y:(av.y+bv.y)/2,z:(av.z+bv.z)/2,dy:bv.y-av.y,dz:bv.z-av.z,angle:Math.atan2(bv.y-av.y,bv.z-av.z)};
 };
 const cuts=[...new Set([0,length,...segments.flatMap(s=>[wrap(s.c0-half),wrap(s.c0+half)])])].sort((a,b)=>a-b);
 function interval(vertices,s0,s1,x,numericPad=3e-6){
  const mid=(s0+s1)/2,a=at(mid-half),b=at(mid+half),u=pose(s0,a,b,mid),v=pose(s1,a,b,mid),centre=pose(mid,a,b,mid);
  const dz=v.dz-u.dz,dy=v.dy-u.dy,t=Math.max(0,Math.min(1,-(u.dz*dz+u.dy*dy)/(dz*dz+dy*dy||1)));
  if(rigid)assert.ok(Math.hypot(u.dz+t*dz,u.dy+t*dy)>1e-5,'nonzero affine chord throughout interval');
  let end=v.angle;while(end-u.angle>Math.PI)end-=2*Math.PI;while(end-u.angle< -Math.PI)end+=2*Math.PI;
  const matrix=new T.Matrix4().makeRotationX(-centre.angle);matrix.setPosition(x,centre.y,centre.z);
  const points=vertices.map(p=>p.clone().applyMatrix4(matrix)),box=new T.Box3();
  let movement=0;
  const vertexBoxes=vertices.map((p,i)=>{
   const y=trigonometricRange(p.y,p.z,u.angle,end),z=trigonometricRange(p.z,-p.y,u.angle,end);
   const q=new T.Box3(new T.Vector3(x+p.x-numericPad,Math.min(u.y,v.y)+y[0]-numericPad,Math.min(u.z,v.z)+z[0]-numericPad),
    new T.Vector3(x+p.x+numericPad,Math.max(u.y,v.y)+y[1]+numericPad,Math.max(u.z,v.z)+z[1]+numericPad));
   const d=points[i];movement=Math.max(movement,Math.hypot(Math.max(Math.abs(q.min.y-d.y),Math.abs(q.max.y-d.y)),Math.max(Math.abs(q.min.z-d.z),Math.abs(q.max.z-d.z))));
   box.union(q);return q;
  });return{matrix,points,vertexBoxes,box,movement};
 }
 function nativeFloat32ErrorBound(vertices,x){
  // Float32 uploaded instance matrices round each coefficient to nearest:
  // |fl(a)-a| <= 2^-24 |a| + 2^-150, including subnormals. Positions are
  // already the exact native Float32 geometry values. A rigid rotation has
  // coefficients <=1, and every chord centre is a convex combination of
  // these finite translated carrier endpoints. This bound covers ALL phases,
  // independently of the128 actual-matrix regression stations.
  const translation=Math.max(Math.abs(x),...segments.flatMap(s=>[Math.abs(s.y0),Math.abs(s.y0+s.dy),Math.abs(s.z0),Math.abs(s.z0+s.dz)]));
  const local=Math.max(...vertices.map(p=>Math.abs(p.x)+Math.abs(p.y)+Math.abs(p.z)));
  const doubleArithmetic=Number.EPSILON*128*(translation+local+length+1);
  const bound=2**-24*(translation+local)+2**-150*(local+1)+doubleArithmetic;
  assert.ok(Number.isFinite(bound));return bound;
 }
 return{length,cuts,pose,interval,nativeFloat32ErrorBound};
}
