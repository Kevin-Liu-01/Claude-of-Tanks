import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {abramsPlanarCheek} from './abramsPlanarCheek.ts';
import {shellPart,mirroredSurfaceError} from '../../../tools/base-shell-audit-math.mjs';

const roof=z=>.68+(.76-.68)*(z-1.08)/(-.54-1.08);
const bottom=[[.36,.06,2.18],[1.60,-.10,1.20],[1.60,-.10,.38],[.36,-.10,1.13]];
const top=[[.36,.50,1.74],[1.15,.68,1.08],[1.15,roof(.38),.38],[.36,roof(1.03),1.03]];
const right=abramsPlanarCheek(bottom,top,1),left=abramsPlanarCheek(bottom,top,-1);
const r=shellPart(right),l=shellPart(left);
assert.ok(mirroredSurfaceError(r,l).maxM<1e-6,'entire cheek surface mirrors, including triangle interiors');
for(const part of [r,l]){
  const edges=new Map();
  for(const t of part.triangles)for(let i=0;i<3;i++){
    const a=t.points[i].join(','),b=t.points[(i+1)%3].join(','),k=[a,b].sort().join('|');
    const row=edges.get(k)??{count:0,winding:0};row.count++;row.winding+=a<b?1:-1;edges.set(k,row);
  }
  for(const edge of edges.values())assert.deepEqual(edge,{count:2,winding:0},'closed directed edge pairing');
  assert.ok(part.volume>0,'outward volume');
  // Published front and aft roof courses are actual planes, not shaded-over folds.
  const front=part.triangles.slice(0,2),aftRoof=part.triangles.slice(10,12);
  for(const pair of [front,aftRoof]){
    const [a,b]=pair.map(t=>t.triangle.getNormal(new Vector3()));
    assert.ok(a.dot(b)>1-1e-10,'no diagonal normal break inside a welded course');
  }
  const tip=part.vertices.find(p=>Math.abs(Math.abs(p[0])-.36)<1e-6&&Math.abs(p[1]-.5)<1e-6);
  assert.ok(Math.abs(tip[2]-1.890107238606)<1e-6,'flat front retains the low brow');
  assert.ok(part.vertices.every(p=>Math.abs(p[0])>=.35999),'gun throat remains open');
}
right.dispose();left.dispose();
console.log('M1A3 cheek: flat welded courses, exact physical mirror, outward closed shell, open gun throat passed');
