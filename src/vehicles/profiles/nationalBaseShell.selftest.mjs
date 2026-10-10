import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {castModernizedTurret} from './nationalDonorCore.ts';
import {weldedFlankHousing} from './weldedFlankHousing.ts';
import {shellPart,mirroredSurfaceError} from '../../../tools/base-shell-audit-math.mjs';

const housingRows=[[-1.76,.50,.96,.42,.54],[-1.31,.72,1.25,.34,.59],[-.58,1.04,1.48,.22,.61],[.24,.80,1.44,.22,.59]];
const l=weldedFlankHousing(housingRows,-1),r=weldedFlankHousing(housingRows,1);
assert.ok(mirroredSurfaceError(shellPart(l),shellPart(r)).maxM<1e-6,'Qilin welded housing mirrors actual surfaces');
for(const g of [l,r]){
  const part=shellPart(g);
  for(let i=0;i<36;i+=2){
    const a=part.triangles[i].triangle.getNormal(new Vector3()),b=part.triangles[i+1].triangle.getNormal(new Vector3());
    assert.ok(a.dot(b)>1-1e-9,'every longitudinal armor panel is planar');
  }
  assert.ok(part.volume>0,'housing has outward finite volume');
  g.dispose();
}
assert.throws(()=>weldedFlankHousing([[0,.5,1,.4,.4],[1,.5,1,.4,.6]],1),/positive/);

const parts=[];
castModernizedTurret({add:(_,g)=>parts.push(g)},
  {halfWidth:1.30,roofY:.69,rearZ:-1.36,frontZ:1.19,shoulderY:.46,crownHalf:.68});
const [body,left,right]=parts.slice(-3);
assert.ok(mirroredSurfaceError(shellPart(body),shellPart(body)).maxM<1e-6,'whole curved body reflects physically');
assert.ok(mirroredSurfaceError(shellPart(left),shellPart(right)).maxM<1e-6,'cast cheeks reflect physically');
const map=g=>{
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),out=new Map();
  for(let i=0;i<p.count;i++){
    const key=[Math.abs(p.getX(i)),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');
    const row=out.get(key)??[];row.push([Math.sign(p.getX(i))*n.getX(i),n.getY(i),n.getZ(i)]);out.set(key,row);
  }return out;
};
const lm=map(left),rm=map(right);
for(const [key,normals] of lm)for(const n of normals){
  assert.ok(rm.get(key)?.some(m=>Math.hypot(...m.map((v,i)=>v-n[i]))<1e-5),'mirrored casting keeps matching normals, including floor/lip seams');
}
for(const g of [left,right]){
  const p=g.getAttribute('position'),n=g.getAttribute('normal');let hardWall=0,hardFloor=0;
  for(let i=0;i<p.count;i++){
    if(Math.abs(Math.abs(p.getX(i))-.38)<1e-6&&Math.abs(n.getX(i))>.9999)hardWall++;
    if(Math.abs(p.getY(i)-.10)<1e-6&&n.getY(i)<-.9999)hardFloor++;
  }
  assert.ok(hardWall>0&&hardFloor>0,'open gun channel and casting underside keep sharp normals');
}
parts.forEach(g=>g.dispose());
console.log('National base stock: planar Qilin housing, mirrored cast surfaces/normals, sharp open gun throat and underside passed');
