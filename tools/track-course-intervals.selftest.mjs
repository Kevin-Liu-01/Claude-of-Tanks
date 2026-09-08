import assert from 'node:assert/strict';
import * as T from 'three';
import {trackCourseIntervals,trigonometricRange} from './track-course-intervals.mjs';

// Synthetic closed carrier: expected positions are authored independently,
// not copied from a candidate tank or fitted to a sampled lower bound.
const loop=[[0,0],[1,0],[1.4,.3],[1.4,1],[.2,1],[-.3,.5]],positions=[];
for(let i=0;i<loop.length;i++){
 const a=loop[i],b=loop[(i+1)%loop.length],points=Array.from({length:24},()=>[0,a[1],a[0]]);
 for(const index of[0,8])points[index]=[0,b[1],b[0]];
 positions.push(...points.flat());
}
const band=new T.BufferGeometry();band.setAttribute('position',new T.Float32BufferAttribute(positions,3));
const vertices=[];
for(const x of[-.25,.25])for(const y of[-.055,.09])for(const z of[-.071,.071])vertices.push(new T.Vector3(x,y,z));
let witnesses=0;
for(const rigid of[false,true])for(const x of[-1.35,1.35]){
 const motion=trackCourseIntervals(band,{loopPoints:loop},.143,.034,rigid);
 assert.equal(motion.cuts[0],0);assert.equal(motion.cuts.at(-1),motion.length);
 const rounding=motion.nativeFloat32ErrorBound(vertices,x);
 assert.ok(rounding>0&&rounding<1e-6,'analytic IEEE754 matrix enclosure, not fixed visual tolerance');
 for(let i=1;i<motion.cuts.length;i++){
  const a=motion.cuts[i-1],b=motion.cuts[i];if(b-a<1e-12)continue;
  const bounds=motion.interval(vertices,a,b,x,rounding);
  for(let k=0;k<128;k++){
   // Exact segment one-sided limits are enclosed by the interval. Actual
   // uploaded matrix regression points avoid ambiguous tangent boundaries.
   const p=motion.pose(a+(b-a)*(k+.5)/128),matrix=new T.Matrix4().makeRotationX(-p.angle);
   matrix.setPosition(x,p.y,p.z);
   const uploaded=new T.Matrix4().fromArray(new Float32Array(matrix.elements));
   vertices.forEach((v,j)=>{
    const ideal=v.clone().applyMatrix4(matrix),actual=v.clone().applyMatrix4(uploaded);
    assert.ok(Math.max(Math.abs(ideal.x-actual.x),Math.abs(ideal.y-actual.y),Math.abs(ideal.z-actual.z))<=rounding);
    assert.ok(bounds.vertexBoxes[j].containsPoint(actual),'every live-matrix held-out vertex lies in the continuous enclosure');
    witnesses++;
   });
  }
 }
}
const range=trigonometricRange(2,3,-.3,2.2);
assert.ok(Math.abs(range[1]-Math.sqrt(13))<1e-12,'retain an extremum strictly between endpoints');
assert.deepEqual(trigonometricRange(2,3,2.2,-.3),range,'reversed bounds represent the same closed interval');
const full=trigonometricRange(2,3,-3*Math.PI,3*Math.PI);
assert.ok(Math.abs(full[0]+Math.sqrt(13))<1e-12&&Math.abs(full[1]-Math.sqrt(13))<1e-12);
assert.throws(()=>trackCourseIntervals(band,{loopPoints:loop.slice(1)},.143,.034,false),/exact native carrier topology/);
band.dispose();
console.log(`track-course-intervals: PASS ${witnesses} uploaded-matrix held-outs, both sides, rigid/tangent, analytic rounding and between-endpoint extrema`);
