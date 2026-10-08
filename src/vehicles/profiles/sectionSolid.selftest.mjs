import assert from 'node:assert/strict';
import { sectionSolid } from './sectionSolid.ts';
import {Vector3} from 'three';
import {shellPart,mirroredSurfaceError} from '../../../tools/base-shell-audit-math.mjs';

const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const concave = [[-1, -1], [1, -1], [1, 0], [0, 0], [0, 1], [-1, 1]];
for (const [ring, expectedVolume] of [[square, 8], [concave, 6]]) for(const centeredSideQuads of [false,true]) {
  const geometry = sectionSolid([{ z: -1, ring }, { z: 1, ring }],{centeredSideQuads});
  const p = geometry.getAttribute('position');
  const edges = new Map();
  let volume = 0;
  const point = (i) => [p.getX(i), p.getY(i), p.getZ(i)];
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [point(i), point(i + 1), point(i + 2)];
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const keys = [u.join(','), v.join(',')];
      const sign = keys[0] < keys[1] ? 1 : -1;
      const key = keys.sort().join('|');
      const row = edges.get(key) ?? { count: 0, winding: 0 };
      row.count++; row.winding += sign; edges.set(key, row);
    }
  }
  assert.ok(Math.abs(volume - expectedVolume) < 1e-6, 'outward closed volume');
  for (const edge of edges.values()) assert.deepEqual(edge, { count: 2, winding: 0 });
  geometry.dispose();
}
assert.throws(() => sectionSolid([]), /two/);
assert.throws(() => sectionSolid([{ z: 1, ring: square }, { z: 0, ring: square }]), /increasing/);
assert.throws(() => sectionSolid([{ z: 0, ring: square }, { z: 1, ring: [...square].reverse() }]), /counter-clockwise/);
assert.throws(() => sectionSolid([{ z: 0, ring: square }, { z: 1, ring: concave }]), /correspondence/);
const tapered=[{z:-1,ring:[[-1,0],[1,0],[.7,1],[-.7,1]]},
  {z:1,ring:[[-.9,0],[.9,0],[.4,.8],[-.4,.8]]}];
const old=sectionSolid(tapered),centered=sectionSolid(tapered,{centeredSideQuads:true,smoothSideEdges:[1,2,3]});
assert.ok(mirroredSurfaceError(shellPart(old),shellPart(old)).maxM>.005,'old warped loft is a failing mirror control');
assert.ok(mirroredSurfaceError(shellPart(centered),shellPart(centered)).maxM<1e-6,'centered loft reflects actual surfaces');
const p=centered.getAttribute('position'),n=centered.getAttribute('normal'),normalAt=new Map();
for(let i=0;i<48;i++){
  if(i<12)continue; // underside stays flat and sharp
  const key=[p.getX(i),p.getY(i),p.getZ(i)].join(','),v=new Vector3().fromBufferAttribute(n,i);
  if(normalAt.has(key))assert.ok(v.distanceTo(normalAt.get(key))<1e-7,'shared curved course has continuous normals');
  normalAt.set(key,v);
}
for(let i=48;i<p.count;i++)assert.ok(Math.abs(n.getZ(i))>.99999,'end caps keep hard axial normals');
assert.throws(()=>sectionSolid(tapered,{smoothSideEdges:[4]}),/outside contour/);
old.dispose();centered.dispose();
const shoulder=[{z:-1,ring:[[1,.7],[2,.6],[2,.65],[1,.75]]},
  {z:1,ring:[[1,.9],[2,.6],[2,.65],[1,.95]]}];
const mirroredShoulder=shoulder.map(({z,ring})=>({z,ring:ring.map(([x,y])=>[-x,y]).reverse()}));
const shoulderRight=sectionSolid(shoulder),shoulderWrong=sectionSolid(mirroredShoulder);
const shoulderLeft=sectionSolid(mirroredShoulder,{sideQuadDiagonal:'bd'});
assert.ok(mirroredSurfaceError(shellPart(shoulderRight),shellPart(shoulderWrong)).maxM>.01,'reversing contours alone changes a folded shoulder surface');
assert.ok(mirroredSurfaceError(shellPart(shoulderRight),shellPart(shoulderLeft)).maxM<1e-6,'explicit reflected diagonal retains shoulder geometry');
for(const g of [shoulderRight,shoulderWrong,shoulderLeft])g.dispose();
console.log('sectionSolid: convex/concave caps, watertight winding and invalid inputs passed');
