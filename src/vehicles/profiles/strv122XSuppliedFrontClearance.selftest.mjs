import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';

// Independent exact triangle/edge distances in the original two-cell region
// plus a surrounding margin. No voxel threshold or source datum is changed.
const region=new T.Box3(new T.Vector3(1.63,.90,3.44),new T.Vector3(1.77,1.16,3.60));
function clipBoundary(poly,axis,side,bound){
 const next=[];
 for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=side*(a[axis]-bound),db=side*(b[axis]-bound);
   if(da<=1e-12)next.push(a);
   if((da<0&&db>0)||(da>0&&db<0))next.push(a.clone().lerp(b,da/(da-db)));
 }return next;
}
function clipped(poly){
 for(const axis of ['x','y','z'])for(const side of[-1,1]){
  poly=clipBoundary(poly,axis,side,side<0?region.min[axis]:region.max[axis]);
  if(poly.length<3)return[];
 }return poly;
}
function triangles(mesh){
 const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,out=[];
 for(let i=0;i<(ix?.count??p.count);i+=3){
  const tri=new T.Triangle(...[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld)));
  if(!region.intersectsTriangle(tri))continue;
  const poly=clipped([tri.a,tri.b,tri.c]);
  for(let k=1;k+1<poly.length;k++){
   const piece=new T.Triangle(poly[0],poly[k],poly[k+1]);
   if(piece.getArea()>1e-14)out.push({tri:piece,index:i,name:mesh.name});
  }
 }return out;
}
const edges=t=>[[t.a,t.b],[t.b,t.c],[t.c,t.a]];
function closestSegments(p1,q1,p2,q2){
 const d1=q1.clone().sub(p1),d2=q2.clone().sub(p2),r=p1.clone().sub(p2);
 const a=d1.dot(d1),e=d2.dot(d2),f=d2.dot(r);let s=0,t=0;
 if(a<=1e-20&&e<=1e-20)return[p1.clone(),p2.clone()];
 if(a<=1e-20)t=T.MathUtils.clamp(f/e,0,1);
 else{
  const c=d1.dot(r);
  if(e<=1e-20)s=T.MathUtils.clamp(-c/a,0,1);
  else{const b=d1.dot(d2),den=a*e-b*b;s=den?T.MathUtils.clamp((b*f-c*e)/den,0,1):0;
   t=(b*s+f)/e;if(t<0){t=0;s=T.MathUtils.clamp(-c/a,0,1);}else if(t>1){t=1;s=T.MathUtils.clamp((b-c)/a,0,1);}
  }
 }return[p1.clone().addScaledVector(d1,s),p2.clone().addScaledVector(d2,t)];
}
function triangleDistance(a,b){
 let best={distance:Infinity};const offer=(p,q)=>{const distance=p.distanceTo(q);if(distance<best.distance)best={distance,a:p.clone(),b:q.clone()};};
 for(const p of[a.a,a.b,a.c])offer(p,b.closestPointToPoint(p,new T.Vector3()));
 for(const p of[b.a,b.b,b.c])offer(a.closestPointToPoint(p,new T.Vector3()),p);
 for(const [p,q]of edges(a))for(const [r,s]of edges(b))offer(...closestSegments(p,q,r,s));
 for(const [source,target]of[[a,b],[b,a]])for(const [p,q]of edges(source)){
  const d=q.clone().sub(p),length=d.length();if(length<1e-12)continue;
  const hit=new T.Ray(p,d.divideScalar(length)).intersectTriangle(target.a,target.b,target.c,false,new T.Vector3());
  if(hit&&hit.distanceTo(p)<=length+1e-10)offer(hit,hit);
 }
 return best;
}

function verifyDistances(){
 const a=new T.Triangle(new T.Vector3(0,0,0),new T.Vector3(1,0,0),new T.Vector3(0,1,0));
 const b=new T.Triangle(new T.Vector3(0,0,.02),new T.Vector3(1,0,.02),new T.Vector3(0,1,.02));
 assert.ok(Math.abs(triangleDistance(a,b).distance-.02)<1e-12,'independent20mm parallel-triangle control');
 const crossing=new T.Triangle(new T.Vector3(.2,.2,-1),new T.Vector3(.2,.2,1),new T.Vector3(.8,.2,0));
 assert.equal(triangleDistance(a,crossing).distance,0,'actual crossing negative control');
}
function ceilingAndRoof(hull){
 const ray=(x,z,up)=>new T.Raycaster(new T.Vector3(x,up?.90:4,z),
  new T.Vector3(0,up?1:-1,0)).intersectObject(hull,false)[0]?.point.y;
 // The original visible upper course and unrelieved side remain; only the
 // narrow right lower tip rises. These are independent original row scalars.
 for(const z of[3.47,3.52,3.58]){
  const t=(z-3.45)/.25,roof=1.353-.182*t,outer=1.79-.27*t;
  const x=outer-.02,expected=roof+.006*.005/(outer-.015-1.095);
  for(const side of[-1,1])assert.ok(Math.abs(ray(side*x,z,false)-expected)<.0002,
   'unchanged original exterior roof near its outer edge');
 }
 const wallAt1_70=1.0256+(1.70-1.6894)/.025*(1.30204-.026-1.0256);
 assert.ok(Math.abs(ray(1.70,3.52,true)-wallAt1_70)<.0002,
  'right outer wall stays present above the locally upturned foot');
}
verifyDistances();
for(const quality of['high','low']){
 const tank=createTank('strv122_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
 try{
  tank.root.updateMatrixWorld(true);let band=[],hull=[];let hullMesh;
  tank.root.traverse(m=>{if(m.name==='hull'){hullMesh=m;hull.push(...triangles(m));}
   if(m.name==='gearTrackBandR')band.push(...triangles(m));});
  assert.ok(band.length>8&&hull.length>8,'actual complete native assemblies enter exact surface test');
  let minimum=Infinity,intersections=0;
  for(const a of band)for(const b of hull){const d=triangleDistance(a.tri,b.tri).distance;
   minimum=Math.min(minimum,d);if(d<1e-9)intersections++;}
  assert.equal(intersections,0,'actual band and permanent skin never intersect');
  assert.ok(minimum>=.020&&minimum<.025,`bounded actual moving-joint gap20–25mm, got ${minimum}`);
  ceilingAndRoof(hullMesh);
 }finally{tank.dispose();}
}
console.log('strv122XSuppliedFrontClearance: actual high/low exact triangle gap≥20mm, crossing controls and retained exterior roof/skin PASS');
