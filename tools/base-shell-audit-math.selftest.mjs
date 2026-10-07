import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute} from 'three';
import {slab} from '../src/vehicles/factoryGeometry.ts';
import {shellPart,mirroredSurfaceError,slabWarps,auditShellParts} from './base-shell-audit-math.mjs';

const corners=[[.36,.06,2.18],[1.60,-.10,1.20],[1.60,-.10,.38],[.36,-.10,1.13],
  [.36,.50,1.74],[1.15,.68,1.08],[1.15,.7145679,.38],[.36,.6824691,1.03]];
const right=slab(...corners),m=p=>[-p[0],p[1],p[2]];
const wrong=slab(...[1,0,3,2,5,4,7,6].map(i=>m(corners[i])));
const reflected=right.clone(),p=reflected.getAttribute('position');
for(let i=0;i<p.count;i+=3){
  const v=[0,2,1].map(j=>m([p.getX(i+j),p.getY(i+j),p.getZ(i+j)]));
  v.forEach((q,j)=>p.setXYZ(i+j,...q));
}
const part=(g,ordinal)=>shellPart(g,{bucket:'turret',ordinal,site:['synthetic control']});
assert.ok(mirroredSurfaceError(part(right,0),part(wrong,1)).maxM>.020,
  'detect wrong diagonals inside mirrored boundaries, not only at corners');
assert.ok(mirroredSurfaceError(part(right,0),part(reflected,1)).maxM<1e-6,
  'exact reflected triangles occupy the same physical surface');
assert.ok(slabWarps(part(right,0)).some(w=>w.angleDeg>10&&w.deviationM>.10),
  'the historical M1A3 cheek is an independently failing warped-plate control');
const cube=slab([-1,0,1],[1,0,1],[1,0,-1],[-1,0,-1],[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]);
assert.deepEqual(slabWarps(part(cube,0)),[],'planar stock is not reported as warped');
const report=auditShellParts([part(right,0),part(reflected,1),part(cube.clone().translate(3,0,0),2)]);
assert.equal(report.mirroredPairs.length,1);
assert.equal(report.unmatched.length,1,'intentional offset stock is an unclassified candidate, not a failure');
const indexed=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
indexed.setIndex([0,1,2]);assert.equal(part(indexed,0).area,.5,'indexed input uses indices');
for(const g of [right,wrong,reflected,cube,indexed])g.dispose();
console.log('base shell audit: interior samples, warped/planar controls, exact reflection and unmatched classification passed');
