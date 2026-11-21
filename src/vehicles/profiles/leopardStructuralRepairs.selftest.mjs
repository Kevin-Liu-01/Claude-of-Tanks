import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank,KIT} from '../tankFactory.ts';
import {recessKF51BTurret,recessClosedTurret} from './kf51bGunRecess.ts';
import {properSurfaceCrossings} from '../../../tools/base-shell-integrity.mjs';
import {orientedSlab} from './kit.ts';
import {shellPart,mirroredSurfaceError} from '../../../tools/base-shell-audit-math.mjs';

function assertClosedRecess(geometry,label) {
  const part=shellPart(geometry),edges=new Map();
  const key=p=>p.map(v=>Math.round(v*1e5)).join(',');
  for(const row of part.triangles)for(let i=0;i<3;i++) {
    const a=key(row.points[i]),b=key(row.points[(i+1)%3]);
    assert.notEqual(a,b,`${label}: no collapsed cap edge`);
    const k=[a,b].sort().join('|'),uses=edges.get(k)??[];
    uses.push(a<b?1:-1);edges.set(k,uses);
  }
  for(const [edge,uses]of edges)assert.deepEqual(uses.slice().sort(),[-1,1],`${label}: one coherent closed surface at ${edge}`);
  assert.ok(part.volume>0,`${label}: outward stock`);
  assert.deepEqual(properSurfaceCrossings(part),[],`${label}: cut faces cannot cross`);
}
function assertExteriorPreserved(source,cut) {
  const mesh=new T.Mesh(cut,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld(true);
  for(const {triangle}of shellPart(source).triangles) {
    const center=triangle.getMidpoint(new T.Vector3());
    if(Math.abs(center.x)<.44&&center.z>.67)continue; // intentionally removed gun throat
    const normal=triangle.getNormal(new T.Vector3());
    const hit=new T.Raycaster(center.clone().addScaledVector(normal,.05),normal.clone().negate(),0,.1).intersectObject(mesh,false)[0];
    assert.ok(hit&&hit.point.distanceTo(center)<1e-5,'recess repair preserves existing exterior surface away from the opening');
  }
  mesh.material.dispose();
}
for(const segments of [16,26])for(const [r1,r2,h,y,z,stretch]of[[1,1.04,.09,-.02,-.35,1],[1.24,1.30,.12,.03,-.28,1.18]]) {
  const indexed=KIT.xform(KIT.cylY(r1,r2,h,segments,false),0,y,z,0,0,0,[1,1,stretch]);
  assert.ok(indexed.index,'production ring is indexed');
  const uncut=indexed.clone(),flat=indexed.toNonIndexed(),recess={halfWidthM:.43,backZM:.68};
  const fromIndex=recessClosedTurret(indexed,recess),fromFlat=recessClosedTurret(flat,recess);
  assert.deepEqual(fromIndex.getAttribute('position').array,fromFlat.getAttribute('position').array,
    'native indexed cylinder produces exactly the same physical faces as its nonindexed equivalent');
  assertClosedRecess(fromIndex,`${segments}-segment prototype bearing ring`);
  assertExteriorPreserved(uncut,fromIndex);uncut.dispose();
  fromIndex.dispose();fromFlat.dispose();
}

const apron=KIT.polyMultiLoft([[-.44,1.18],[.44,1.18],[.94,.78],[1.22,.16],[1.22,.08],[-1.22,.08],[-1.22,.16],[-.94,.78]],
  [{height:-.035,inset:1},{height:.11,inset:.985}]);
const cutApron=recessClosedTurret(apron.clone(),{halfWidthM:.43,backZM:.68});
assertExteriorPreserved(apron,cutApron);assertClosedRecess(cutApron,'prototype lower apron exterior control');apron.dispose();cutApron.dispose();

function outerSupport(part) {
  for(const row of part.triangles) {
    if(row.points.every(p=>Math.abs(p[0]-.43)<1e-5)
      ||row.points.every(p=>Math.abs(p[0]+.43)<1e-5)
      ||row.points.every(p=>Math.abs(p[2]-.88)<1e-5))continue; // actual recess return walls
    const normal=row.triangle.getNormal(new T.Vector3());
    for(const vertex of part.vertices)
      assert.ok(normal.dot(new T.Vector3(...vertex).sub(row.triangle.a))<1e-5,'outer Panther armor cannot fold inward through its own stock');
  }
}
const plan=[[-.36,1.95],[.36,1.95],[1.48,1.28],[1.55,.18],[1.40,-2.43],
  [.96,-2.96],[-.96,-2.96],[-1.40,-2.43],[-1.55,.18],[-1.48,1.28]];
const old=recessKF51BTurret(KIT.polyMultiLoft(plan,[{height:-.01,inset:.93},{height:.24,inset:1},
  {height:[.48,.48,.58,.63,.60,.56,.56,.60,.63,.58],inset:[.78,.78,.82,.84,.88,.92,.92,.88,.84,.82],centerHeight:.66}]));
assert.throws(()=>outerSupport(shellPart(old)),assert.AssertionError,'original native loft exposes the wrong cheek/fan triangulation');
assert.ok(mirroredSurfaceError(shellPart(old),shellPart(old)).maxM>.03,'old physical cheek reflection fails even though its corners match');
old.dispose();

// The old upper thermal skin crossed itself because its outer and backing
// quads used opposite diagonals. Keep the exact installed outer triangles.
const thermalCorners=[[.37,.318,2.46],[.91,.328,2.01],[.91,.423,1.72],[.40,.448,2.17]];
const oldThermal=orientedSlab(...thermalCorners.map(([x,y,z])=>[x,y-.018,z+.01]),...thermalCorners);
assert.ok(properSurfaceCrossings(shellPart(oldThermal)).length>0,'legacy thin skin is a genuine self-crossing control');oldThermal.dispose();
const lowerCorners=[[-.78,.48,3.24],[.78,.48,3.24],[.78,.48,2.92],[-.78,.48,2.92],[-.80,1.04,3.54],[.80,1.04,3.54],[.80,.74,3.30],[-.80,.74,3.30]];
const rearCorners=[[1.02,.16,.24],[1.31,.20,-.72],[1.22,.56,-.86],[.96,.45,.12],[.91,.46,.45],[1.16,.49,-.63],[1.05,.73,-.72],[.85,.70,.27]];
for(const points of [lowerCorners,rearCorners]) {
  const old=orientedSlab(...points);assert.ok(properSurfaceCrossings(shellPart(old)).length>0,'legacy Leopard 1A5 stock crossing is detected');old.dispose();
}
// (264: the 2A4 OTCO left the A6M build and its thermal skin for the 2A4 turret, profiles/leopard2A4Family.ts)
for(const quality of ['high','low'])for(const id of ['leo1a5']) {
  const repaired=[];
  const visual=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,partCensus(bucket,g,source){
    if(source==='add'&&['leo1a5-lower-bow','leo1a5-rear-applique','leo2a6m-thermal-skin'].includes(g.userData.primaryStockRole))repaired.push(g);
  }});
  try {
    // 262: the leo1a5 rebuild retired the rear cheek appliqué (its cast turret now carries the B&V wedge and side blocks)
    assert.equal(repaired.length,id==='leo1a5'?1:2,`${id}/${quality}: intended stock is repaired`);
    for(const geometry of repaired) {
      assertClosedRecess(geometry,`${id}/${quality}/${geometry.userData.primaryStockRole}`);
      const part=shellPart(geometry),side=part.bounds.max.x<0?-1:1;
      if(geometry.userData.primaryStockRole==='leo2a6m-thermal-skin') {
        const front=thermalCorners.map(([x,y,z])=>new T.Vector3(side*x,y,z)),mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));
        mesh.updateMatrixWorld(true);
        for(const indices of [[0,1,2],[0,2,3]]) {
          const triangle=new T.Triangle(...indices.map(i=>front[i]));
          const normal=triangle.getNormal(new T.Vector3());if(normal.y<0)normal.negate();
          for(const bary of [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]) {
            const expected=new T.Vector3().addScaledVector(triangle.a,bary[0]).addScaledVector(triangle.b,bary[1]).addScaledVector(triangle.c,bary[2]);
            const hit=new T.Raycaster(expected.clone().addScaledVector(normal,.1),normal.clone().negate(),0,.2).intersectObject(mesh,false)[0];
            assert.ok(hit&&hit.point.distanceTo(expected)<1e-6,'outer thermal face and its support datums remain in place');
          }
        }
        mesh.material.dispose();
      } else {
        const original=geometry.userData.primaryStockRole==='leo1a5-lower-bow'?lowerCorners:rearCorners.map(([x,y,z])=>[side*x,y,z]);
        const bounds=new T.Box3().setFromPoints(original.map(p=>new T.Vector3(...p)));
        assert.ok(bounds.min.distanceTo(part.bounds.min)<1e-6&&bounds.max.distanceTo(part.bounds.max)<1e-6,'original bow/bustle extents preserved');
        for(const row of part.triangles)for(const p of part.vertices)
          assert.ok(row.triangle.getNormal(new T.Vector3()).dot(new T.Vector3(...p).sub(row.triangle.a))<1e-5,'repaired original corners form outward supporting facets');
      }
    }
  } finally {visual.dispose();}
}

for(const quality of ['high','low']) {
  const parts=[];
  const panther=createTank('kf51_u',null,{proceduralOnly:true,quality,batchStatic:false,geometryReceipt:true,
    partCensus(_bucket,g,source){if(source==='add'&&g.userData.primaryStockRole==='kf51u-recessed-shell'){assertClosedRecess(g,`${quality} KF51-U shell`);parts.push(shellPart(g));}}});
  try {
    assert.equal(parts.length,1);outerSupport(parts[0]);
    assert.ok(mirroredSurfaceError(parts[0],parts[0]).maxM<1e-6,`${quality}: actual KF51-U cheek and crown triangles mirror`);
    // (268: the owner's r15 KF51-U turret raised its roof crown 0.66 -> 0.68 m on the same plan)
    // 2026-11-03 (268 r16): and the r16 turret's walls rise 7 cm more, its crown with them (0.68 -> 0.75 m)
    for(const [actual,expected]of[[parts[0].bounds.min.x,-1.55],[parts[0].bounds.max.x,1.55],[parts[0].bounds.min.z,-2.96],[parts[0].bounds.max.y,.75]])
      assert.ok(Math.abs(actual-expected)<1e-6,`${quality}: Panther primary silhouette remains`);
  }finally{panther.dispose();}
}
console.log('Leopard primary stock: true convex mirrored KF51-U cheeks and the authored Panther silhouette pass');
