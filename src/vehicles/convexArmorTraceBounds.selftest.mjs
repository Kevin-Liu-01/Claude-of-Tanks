import assert from 'node:assert/strict';
import {Vector3,Euler,Quaternion,Matrix4} from 'three';
import {convexArmorTraceBounds} from './convexArmorTraceBounds.ts';
import {traceTank} from '../sim/armor.ts';
import {assertArmorTraceBounds} from '../sim/armorOutline.test-support.mjs';
const serial=value=>JSON.stringify(value,(key,v)=>key==='traceBounds'?undefined:v);
const template={name:'exact test face',kind:'spaced',convexPolygon:true,physicalMm:25,keMm:30,ceMm:40};
const square=[[0,0,0],[1,0,0],[1,1,0],[0,1,0]];
const acute=[[0,0,0],[1,-.005,0],[1,.005,0]];
const sliver=[[0,0,0],[1,-.000005,0],[1,.000005,0]];
const skinny=[[0,0,0],[.00001,0,0],[.00001,1,0],[0,1,0]];
const subdivided=[[0,0,0],[1,0,0],[1,1,0],[.5,1,0],[0,1,0]];
const oblique=square.map(([x,y,z])=>[x,y,z+.23*x-.47*y]);
const slightlyTwisted=square.map(([x,y,z],i)=>[x,y,z+(i===3?5e-8:0)]);
for(const invalid of [[],[[0,0,0],[1,0,0],[2,0,0]],[[0,0,0],[1,0,0],[0,NaN,0]],
  [[0,0,0],[1e200,0,0],[0,1e200,0]],sliver,slightlyTwisted,
  [[0,0,0],[1,0,0],[.4,.3,0],[1,1,0],[0,1,0]]])
  assert.equal(convexArmorTraceBounds(invalid),undefined,'uncertain/overflowing outlines retain exact unbounded path');
for(const verts of[square,acute,skinny,subdivided,oblique]){
  const bounds=convexArmorTraceBounds(verts);assert.ok(bounds,'well-conditioned contour is accelerated');
  assertArmorTraceBounds(verts,bounds,'bounded physical contour');
}
assert.ok(convexArmorTraceBounds(acute).min[0]<-1e-5,'acute accepted region exceeds naïve epsilon-padded vertices');
const pose0={pos:new Vector3(),yaw:0,pitch:0,roll:0,turretYaw:0,gunPitch:0};
const ray=(plates,x,y,pose=pose0,fromZ=1,toZ=-1,frame=new Matrix4())=>traceTank(
  new Vector3(x,y,fromZ).applyMatrix4(frame),new Vector3(x,y,toZ).applyMatrix4(frame),pose,{hullPlates:plates});
const acutePlate={...template,verts:acute};
assert.equal(ray([acutePlate],-1e-5,0).length,1,'negative control: exact acute exterior-tolerance point is accepted');
assert.equal(ray([{...acutePlate,traceBounds:{min:[-1e-7,-.0050001,-1e-7],max:[1.0000001,.0050001,1e-7]}}],-1e-5,0).length,0,
  'naïve box loses a real accepted hit, so the equivalence check exercises corner expansion');

let comparisons=0;
for(const verts of[square,acute,sliver,skinny,subdivided,oblique,slightlyTwisted]){
  const single={...template,verts},depth={...single,name:'separate real layer',verts:verts.map(([x,y,z])=>[x,y,z-.005])};
  for(const plates of[[single],[{...single,openEdges:[0]}],[single,depth]]){
    const bounded=plates.map(p=>{const traceBounds=convexArmorTraceBounds(p.verts);return traceBounds?{...p,traceBounds}:p;});
    for(const pose of[pose0,{pos:new Vector3(12,-2,7),yaw:.71,pitch:-.17,roll:.09,turretYaw:.24,gunPitch:-.13}]){
      const frame=new Matrix4().compose(pose.pos,new Quaternion().setFromEuler(new Euler(-pose.pitch,pose.yaw,pose.roll,'YXZ')),new Vector3(1,1,1));
      for(const x of[-2,-2e-5,-1e-5,-1e-7,0,.000005,.5,1,1+1e-8,1+1e-7,1.000001,3])
        for(const y of[-1,-.005,-1e-7,-1e-8,0,1e-8,1e-7,.005,.5,1,1+1e-8,2])
          for(const[start,end]of[[2,-2],[-2,2],[5000,-5000],[.0001,-.0001]]){
            assert.equal(serial(ray(bounded,x,y,pose,start,end,frame)),serial(ray(plates,x,y,pose,start,end,frame)),
              'all exact fields, order, air, boundary, layers, oblique planes and posed results are identical');comparisons++;
          }
    }
  }
}
// The bounds must remain in the plate owner frame, including a pitching gun.
for(const gunFollow of[false,true]){
  const pose={pos:new Vector3(3,1,-4),yaw:.3,pitch:.2,roll:-.1,turretYaw:.5,gunPitch:-.2};
  const plates=[{...template,verts:square,gunFollow}];
  const bounded=plates.map(p=>({...p,traceBounds:convexArmorTraceBounds(p.verts)}));
  const base={turretPivot:[0,1,0],gunPivot:[0,.3,.2]};
  const owner=new Matrix4().compose(pose.pos,new Quaternion().setFromEuler(new Euler(-pose.pitch,pose.yaw,pose.roll,'YXZ')),new Vector3(1,1,1))
    .multiply(new Matrix4().makeTranslation(...base.turretPivot)).multiply(new Matrix4().makeRotationY(pose.turretYaw));
  if(gunFollow)owner.multiply(new Matrix4().makeTranslation(...base.gunPivot))
    .multiply(new Matrix4().makeRotationX(-pose.gunPitch))
    .multiply(new Matrix4().makeTranslation(...base.gunPivot.map(v=>-v)));
  const positiveFrom=new Vector3(.5,.5,1).applyMatrix4(owner),positiveTo=new Vector3(.5,.5,-1).applyMatrix4(owner);
  const positive=traceTank(positiveFrom,positiveTo,pose,{...base,turretPlates:plates});
  assert.equal(positive.length,1,'explicitly positive real owner-local center after hull/yaw/gun transforms');
  assert.equal(positive[0].impactFrame,gunFollow?'gun':'turret');
  assert.equal(serial(traceTank(positiveFrom,positiveTo,pose,{...base,turretPlates:bounded})),serial(positive));comparisons++;
  for(const x of[2,3,4])for(const y of[1,2,3]){
    const from=new Vector3(x,y,4),to=new Vector3(x,y,-8);
    assert.equal(serial(traceTank(from,to,pose,{...base,turretPlates:bounded})),serial(traceTank(from,to,pose,{...base,turretPlates:plates})));
    comparisons++;
  }
}
console.log(`convexArmorTraceBounds: PASS — ${comparisons} exact full-result controls, acute/sliver/finite-overflow fallbacks and unchanged physical boundaries`);
