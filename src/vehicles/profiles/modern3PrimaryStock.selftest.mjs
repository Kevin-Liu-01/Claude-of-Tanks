import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute,Vector3} from 'three';
import {createTank,KIT} from '../tankFactory.ts';
import {shellPart,mirroredSurfaceError} from '../../../tools/base-shell-audit-math.mjs';
import {properSurfaceCrossings} from '../../../tools/base-shell-integrity.mjs';

function assertClosedConvex(part,label) {
  const edges=new Map();
  for(const row of part.triangles) {
    const normal=row.triangle.getNormal(new Vector3());
    for(const vertex of part.vertices) {
      const outside=normal.dot(new Vector3(...vertex).sub(row.triangle.a));
      assert.ok(outside<1e-5,`${label}: armor face is a supporting plane, not an inward diagonal (${outside} m)`);
    }
    for(let i=0;i<3;i++) {
      const a=row.points[i].join(','),b=row.points[(i+1)%3].join(','),key=[a,b].sort().join('|');
      const edge=edges.get(key)??{count:0,winding:0};edge.count++;edge.winding+=a<b?1:-1;edges.set(key,edge);
    }
  }
  assert.ok(part.volume>0,`${label}: positive stock volume`);
  for(const edge of edges.values())assert.deepEqual(edge,{count:2,winding:0},`${label}: manifold outward closure`);
}
const pumaCorners=[
  [1.26,1.44,3.58],[1.42,1.46,3.42],[1.66,1.64,1.41],[1.42,1.92,1.63],
  [1.18,1.48,3.56],[1.34,1.50,3.40],[1.58,1.68,1.43],[1.34,1.96,1.63],
];
// Old quad ordering really crosses its caps; don't replace the regression
// with an assertion over the replacement helper's output alone.
const oldPuma=KIT.slab(...[0,3,2,1,4,7,6,5].map(i=>pumaCorners[i]));
assert.throws(()=>assertClosedConvex(shellPart(oldPuma),'old Puma'),assert.AssertionError);
const oldK2=KIT.slab(
  [-.38,-.08,2.45],[.38,-.08,2.45],[1.12,0,1.55],[-1.12,0,1.55],
  [-.28,.57,2.45],[.28,.57,2.45],[.72,.59,1.55],[-.72,.59,1.55]);
assert.throws(()=>assertClosedConvex(shellPart(oldK2),'old K2'),assert.AssertionError);
assert.ok(mirroredSurfaceError(shellPart(oldK2),shellPart(oldK2)).maxM>.075,'old K2 fails actual surface reflection');
oldPuma.dispose();oldK2.dispose();

const chinCorners=[
 [-.72,.40,3.33],[.72,.40,3.33],[.72,.40,3.11],[-.72,.40,3.11],
 [-1.08,.90,3.51],[1.08,.90,3.51],[1.08,.88,3.41],[-1.08,.88,3.41],
];
const pointKey=p=>p.map(v=>Math.round(v*1e5)).join(',');
const cornerKeys=new Set(chinCorners.map(pointKey));
const oldChin=KIT.slab(...chinCorners),oldChinPart=shellPart(oldChin);
assert.ok(mirroredSurfaceError(oldChinPart,oldChinPart).maxM>.0056,
 'historical K2 chin dent fails actual reflected triangle interiors by over 5.6 mm');
const flatChinFaces=oldChinPart.triangles.filter(t=>
 t.points.every(p=>Math.abs(p[1]-.4)<1e-6)
 || t.points.every(p=>Math.abs(p[2]-3.33-(p[1]-.4)*.36)<1e-6)
 || t.points.every(p=>Math.abs(p[2]-3.11-(p[1]-.4)*.625)<1e-6)
 || t.points.every(p=>Math.abs(p[2]-3.51-(p[1]-.9)*5)<1e-6));
assert.equal(flatChinFaces.length,8,'historical broad front, back, upper and lower faces are planar');
for(const quality of ['high','low'])for(const id of ['k2','k2b']) {
 const emissions=[];
 const tank=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,batchStatic:false,camoSeed:4242,
  partCensus(bucket,g,source){if(source==='add'&&g.userData.primaryStockRole==='k2-bow-chin')emissions.push(shellPart(g));}});
 const geometry=new BufferGeometry();
 try {
  assert.equal(emissions.length,1,`${id}/${quality}: actual K2 chin is retained`);
  // Verify the merged native draw, not only the authored helper emission.
  const positions=tank.root.getObjectByName('hull').geometry.attributes.position,values=[];
  for(let i=0;i<positions.count;i+=3) {
   const points=[0,1,2].map(j=>[positions.getX(i+j),positions.getY(i+j),positions.getZ(i+j)]);
   if(points.every(p=>cornerKeys.has(pointKey(p))))values.push(...points.flat());
  }
  geometry.setAttribute('position',new Float32BufferAttribute(values,3));
  const chin=shellPart(geometry);
  assert.equal(chin.triangles.length,12,`${quality}: entire finite chin reaches the native hull mesh`);
  assert.deepEqual(chin.vertices.map(pointKey).sort(),[...cornerKeys].sort(),`${quality}: all eight exact chin datums survive`);
  assertClosedConvex(chin,`${quality}: K2 chin`);
  assert.equal(properSurfaceCrossings(chin).length,0,`${quality}: no crossed chin faces`);
  assert.ok(mirroredSurfaceError(chin,chin).maxM<1e-6,`${quality}: reflected native chin surfaces coincide`);
  for(const face of flatChinFaces) {
   const center=face.triangle.getMidpoint(new Vector3());
   const normal=face.triangle.getNormal(new Vector3());
   const matching=chin.triangles.filter(t=>t.points.every(p=>Math.abs(normal.dot(new Vector3(...p).sub(center)))<1e-6));
   assert.ok(matching.length===2&&matching.some(t=>t.triangle.closestPointToPoint(center,new Vector3()).distanceTo(center)<1e-6),
    `${quality}: original broad glacis, back, top and bottom planes remain exact`);
  }
 }finally{geometry.dispose();tank.dispose();}
}
oldChin.dispose();

for(const quality of ['high','low'])for(const id of ['spz_puma','k2b']) {
  const parts=[];
  const tank=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,batchStatic:false,camoSeed:4242,
    partCensus(bucket,g,source) {
      if(source==='add'&&['puma-bow-shoulder','k2-turret-shell'].includes(g.userData.primaryStockRole))
        parts.push(shellPart(g,{bucket,role:g.userData.primaryStockRole}));
    }});
  try {
    assert.equal(parts.length,id==='spz_puma'?2:12,`${id}/${quality}: all repaired native primary stock was built`);
    for(const part of parts)assertClosedConvex(part,`${id}/${quality}/${part.role}`);
    if(id==='spz_puma') {
      assert.ok(mirroredSurfaceError(parts[0],parts[1]).maxM<1e-6,`${quality}: bow shoulder surfaces physically mirror`);
      const right=parts.find(p=>p.bounds.min.x>0);
      assert.deepEqual(right.vertices.map(p=>p.map(v=>Math.round(v*1e5)).join(',')).sort(),
        pumaCorners.map(p=>p.map(v=>Math.round(v*1e5)).join(',')).sort(),`${quality}: all eight bow/fender outline datums retained`);
    } else {
      for(const part of parts)assert.ok(mirroredSurfaceError(part,part).maxM<1e-6,`${id}/${quality}: entire station reflects with the same physical surface`);
      const front=parts.find(p=>Math.abs(p.bounds.max.z-2.45)<1e-5);
      assert.ok(front,`${id}: preserved front station`);
      assert.ok(Math.abs(front.bounds.max.x-1.12)<1e-6&&Math.abs(front.bounds.min.y+.08)<1e-6,
        `${id}: original cheek silhouette extents remain`);
    }
  }finally{tank.dispose();}
}
console.log('Modern3 native Puma bow, K2 chin and K2B shell: positive convex stock, manifold closure, mirrored surfaces and retained outlines pass HIGH/LOW');
