import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createTank} from '../tankFactory.ts';
import {orientedSlab} from './kit.ts';
import {shellPart,mirroredSurfaceError,slabWarps} from '../../../tools/base-shell-audit-math.mjs';
import {shellEdgeTopology,properSurfaceCrossings} from '../../../tools/base-shell-integrity.mjs';

// Actual family builders, including roster names whose stable IDs still say A2.
const ids=['m1a1','m1a1ha','ua_m1a1','m1a2','m1a2_tusk','m1a2_sepv2','m1a2_sepv3'];
for(const quality of ['high','low'])for(const id of ids){
 const cheeks=[];
 const tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,
  partCensus(bucket,g,source){
   if(bucket==='turret'&&source==='add'&&new Error().stack.includes('addAbramsShellCheeks'))cheeks.push(shellPart(g));
  }});
 assert.equal(cheeks.length,2,`${id}/${quality}: both native cheek solids captured`);
 assert.ok(mirroredSurfaceError(cheeks[0],cheeks[1]).maxM<.000002,`${id}: reflected triangle interiors coincide`);
 for(const part of cheeks){
  assert.deepEqual(shellEdgeTopology(part),{boundary:0,nonmanifold:0,inconsistent:0},`${id}: closed coherent armor`);
  assert.equal(properSurfaceCrossings(part).length,0,`${id}: finite armor has no crossed surfaces`);
  assert.ok(part.volume>0,`${id}: outward positive stock`);
  for(const pair of [[0,1],[10,11]]){
   const [a,b]=pair.map(i=>part.triangles[i].triangle.getNormal(new Vector3()));
   assert.ok(a.dot(b)>1-1e-9,`${id}: broad front and roof courses have no diagonal fold`);
  }
  assert.ok(part.vertices.every(p=>Math.abs(p[0])>=.38999),`${id}: real central gun throat survives`);
 }
 tank.dispose();
}
// Original source-fitted right cheek reproduced independently: welded front
// was twisted, not a texture, collision overlay, or intended casting feature.
const old=orientedSlab([.39,.12,1.77],[1.525,-.102,1.14],[1.57,-.102,.32],[.39,-.102,.72],
 [.39,.58,1.45],[1.27,.65,1.02],[1.27,.65,.32],[.39,.64,.62]);
assert.ok(slabWarps(shellPart(old)).some(w=>w.face===0&&w.deviationM>.02),'old warped front must fail the physical plane check');
old.dispose();
console.log('Abrams cheek surfaces: all seven HIGH/LOW family builds, planar fronts/roofs, physical mirror, closed stock, old-fold negative control passed');
