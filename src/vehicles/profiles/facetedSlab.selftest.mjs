import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {facetedSlab,symmetricSlab} from './facetedSlab.ts';
import {shellPart,mirroredSurfaceError} from '../../../tools/base-shell-audit-math.mjs';

const bowBottom=[[.60,1.24,3.22],[.75,1.24,3.22],[1.52,1.24,3.28],[.60,1.24,2.90]];
const bowTop=[[.60,1.355,3.22],[.75,1.355,3.22],[1.51,1.27,3.28],[.60,1.36,2.90]];
const cheekBottom=[[.40,.02,1.70],[.98,.02,1.52],[1.40,.02,1.22],[.78,.02,1.22]];
const cheekTop=[[.40,.17,1.60],[.92,.42,1.43],[1.20,.30,1.22],[.50,.34,1.22]];
const roofNormals=part=>part.triangles.slice(8,10).map(t=>t.triangle.getNormal(new Vector3()));
const fold=part=>Math.acos(Math.max(-1,Math.min(1,roofNormals(part)[0].dot(roofNormals(part)[1]))))*180/Math.PI;
const closed=part=>{
  const edges=new Map();
  for(const t of part.triangles)for(let i=0;i<3;i++){
    const a=t.points[i].join(','),b=t.points[(i+1)%3].join(','),key=[a,b].sort().join('|');
    const edge=edges.get(key)??{count:0,winding:0};edge.count++;edge.winding+=a<b?1:-1;edges.set(key,edge);
  }
  for(const e of edges.values())assert.deepEqual(e,{count:2,winding:0},'each edge is paired with opposite winding');
  assert.ok(part.volume>0,'positive outward volume');
};

for(const [name,bottom,top] of [['Bradley bow',bowBottom,bowTop],['Challenger 3 cheek',cheekBottom,cheekTop]]){
  const old=facetedSlab(bottom,top),right=facetedSlab(bottom,top,1,'bd'),left=facetedSlab(bottom,top,-1,'bd');
  const was=shellPart(old),r=shellPart(right),l=shellPart(left);
  assert.equal(was.signature,r.signature,`${name}: every silhouette corner is retained`);
  assert.ok(mirroredSurfaceError(r,l).maxM<1e-6,`${name}: the actual triangle surfaces reflect`);
  closed(r);closed(l);
  assert.ok(roofNormals(r).every(n=>n.y>0),`${name}: both roof triangles face up`);
  if(name==='Bradley bow'){
    assert.ok(roofNormals(was).some(n=>n.y<0),'negative control detects the downward bow triangle');
    assert.ok(fold(r)<8,'roof follows the shallow bow crease');
  }else{
    assert.ok(fold(was)>90,'negative control detects the folded cheek');
    assert.ok(fold(r)<51,'roof follows the convex ridge');
    const e=new Vector3(...top[0]),[f,g,h]=top.slice(1).map(p=>new Vector3(...p));
    const normal=new Vector3().crossVectors(f.clone().sub(e),h.clone().sub(e)).normalize();
    assert.ok(g.clone().sub(e).dot(normal)<0,'other roof corner lies behind the ridge plane');
  }
  for(const g of [old,right,left])g.dispose();
}
console.log('Faceted stock: outward bow cap, convex cheek ridge, closed volumes and exact mirrored surfaces passed');

const lower=[[-.70,1.25,3.92],[.70,1.25,3.92],[.82,1.51,2.72],[-.82,1.51,2.72]];
const upper=[[-.62,1.31,3.80],[.62,1.31,3.80],[.70,1.59,2.78],[-.70,1.59,2.78]];
const old=facetedSlab(lower,upper),fixed=symmetricSlab(...lower,...upper);
assert.ok(mirroredSurfaceError(shellPart(old),shellPart(old)).maxM>.01,'negative control detects opposite diagonals in a full-width slab');
assert.ok(mirroredSurfaceError(shellPart(fixed),shellPart(fixed)).maxM<1e-6,'full-width stock mirrors physically');
closed(shellPart(fixed));
assert.throws(()=>symmetricSlab([-.69,1.25,3.92],...lower.slice(1),...upper),/mirrored stations/,'asymmetric hulls cannot be silently symmetrized');
old.dispose();fixed.dispose();
