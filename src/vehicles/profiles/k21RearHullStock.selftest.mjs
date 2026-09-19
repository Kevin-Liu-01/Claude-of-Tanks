import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { isTrackShoeMesh } from '../../../tools/track-clip-classification.mjs';
import { buildK21X } from './k21X.ts';
import { KIT } from './kit.ts';

// Independent complete-source first-hit calipers from the approved assembled K21.
// Target SHA e2103e87628337778107ba4beec0fb5f6ad9e29136eab65ba27aa7f8bfdd956b.
// Original source SHA ea6a537c8dcbaa5a617e37dc429aaed5364f99ebfc06f9a1811b980e53af55d8.
// 50 body/end-fitting stock/air witnesses; four turret-only source rays are preserved
// in the study receipt, outside this bounded rear-body construction test.
const witnesses = [
  [[-1.5,2.3,-3.22],[0,-1,0],2,[-1.5,1.855299949645996,-3.22]],
  [[-1.4,2.3,-3.22],[0,-1,0],2,[-1.4,1.879644556057885,-3.22]],
  [[-1,2.3,-3.22],[0,-1,0],2,[-1,1.9529999494552612,-3.22]],
  [[-0.8,2.3,-3.22],[0,-1,0],2,[-0.8,1.953027134861021,-3.22]],
  [[0.8,2.3,-3.22],[0,-1,0],2,[0.8,1.9537819862123424,-3.22]],
  [[1,2.3,-3.22],[0,-1,0],2,[1,1.9538166861593789,-3.22]],
  [[1.4,2.3,-3.22],[0,-1,0],2,[1.4,1.880266030291638,-3.22]],
  [[1.5,2.3,-3.22],[0,-1,0],2,[1.5,1.855299949645996,-3.22]],
  [[-1.5,2.3,-2.53],[0,-1,0],2,[-1.5,1.855299949645996,-2.53]],
  [[-1.4,2.3,-2.53],[0,-1,0],2,[-1.4,1.8796445560578847,-2.53]],
  [[-1,2.3,-2.53],[0,-1,0],2,[-1,1.9529999494552612,-2.53]],
  [[-0.8,2.3,-2.53],[0,-1,0],2,[-0.8,1.9529999494552612,-2.53]],
  [[0.8,2.3,-2.53],[0,-1,0],2,[0.8,1.9535144873798835,-2.53]],
  [[1,2.3,-2.53],[0,-1,0],2,[1,1.9536113890985725,-2.53]],
  [[1.4,2.3,-2.53],[0,-1,0],2,[1.4,1.880140992734965,-2.53]],
  [[1.5,2.3,-2.53],[0,-1,0],2,[1.5,1.855299949645996,-2.53]],
  [[-1.5,2.3,-1.73],[0,-1,0],2,[-1.5,1.855299949645996,-1.73]],
  [[-1.4,2.3,-1.73],[0,-1,0],2,[-1.4,1.8796445560578847,-1.73]],
  [[1.4,2.3,-1.73],[0,-1,0],2,[1.4,1.8799960216547644,-1.73]],
  [[1.5,2.3,-1.73],[0,-1,0],2,[1.5,1.855299949645996,-1.73]],
  [[-1.3,1.42,-3.89],[0,-1,0],0.5,[-1.3,1.1999835241937968,-3.89]],
  [[-1.3,1.42,-3.77],[0,-1,0],0.5,[-1.3,1.2714366360191214,-3.77]],
  [[-1.3,1.42,-3.63],[0,-1,0],0.5,[-1.3,1.3845999240875244,-3.63]],
  [[1.3,1.42,-3.89],[0,-1,0],0.5,[1.3,1.1999835241937968,-3.89]],
  [[1.3,1.42,-3.77],[0,-1,0],0.5,[1.3,1.2714366360191214,-3.77]],
  [[1.3,1.42,-3.63],[0,-1,0],0.5,[1.3,1.3845999240875244,-3.63]],
  [[-1.62,2.3,-3.77],[0,-1,0],2.4,null],
  [[1.62,2.3,-3.77],[0,-1,0],2.4,null],
  [[-0.6,1.03,-4.1],[0,0,1],0.8,[-0.6,1.03,-3.602942922862398]],
  [[0.6,1.03,-4.1],[0,0,1],0.8,[0.6,1.03,-3.60299203117924]],
  [[-0.6,1.32,-4.1],[0,0,1],0.8,[-0.6,1.32,-3.6450442055853007]],
  [[0.6,1.32,-4.1],[0,0,1],0.8,[0.6,1.32,-3.6450933139021426]],
  [[-0.6,1.62,-4.1],[0,0,1],0.8,[-0.6,1.62,-3.6885972566779586]],
  [[0.6,1.62,-4.1],[0,0,1],0.8,[0.6,1.62,-3.6886463649948005]],
  [[-0.2,2.3,-3.12],[0,-1,0],0.6,[-0.2,1.9812999963760376,-3.12]],
  [[0.2,2.3,-3.12],[0,-1,0],0.6,[0.2,1.9812999963760376,-3.12]],
  [[-1.4036,2,-3.81],[0,-1,0],0.5,[-1.4036,1.8288120215061174,-3.81]],
  [[-1.4036,2,-3.7],[0,-1,0],0.5,[-1.4036,1.8374845495612557,-3.7]],
  [[1.4059,2,-3.81],[0,-1,0],0.5,[1.4059,1.8288120215061174,-3.81]],
  [[1.4059,2,-3.7],[0,-1,0],0.5,[1.4059,1.8374845495612557,-3.7]],
  [[-1.178335,2,3.41],[0,-1,0],0.5,[-1.178335,1.6560999155044556,3.41]],
  [[-1.178335,2,3.59],[0,-1,0],0.5,[-1.178335,1.6560999155044556,3.59]],
  [[-1.178335,2,3.615],[0,-1,0],0.5,[-1.178335,1.6560999155044556,3.615]],
  [[1.274565,2,3.41],[0,-1,0],0.5,[1.274565,1.6560999155044556,3.41]],
  [[1.274565,2,3.59],[0,-1,0],0.5,[1.274565,1.6560999155044556,3.59]],
  [[1.274565,2,3.615],[0,-1,0],0.5,[1.274565,1.6560999155044556,3.615]],
  [[-1.16394,1.57605,4],[0,0,-1],0.5,[-1.16394,1.57605,3.5897998809814453]],
  [[1.24237,1.57605,4],[0,0,-1],0.5,[1.24237,1.57605,3.5897998809814453]],
  [[-1.417835,1.6092,4],[0,0,-1],0.5,[-1.417835,1.6092,3.5957000255584717]],
  [[1.422065,1.6092,4],[0,0,-1],0.5,[1.422065,1.6092,3.5957000255584717]],
];
const id='k21_x';
const frontMaterial=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
const sectionMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const ray=new THREE.Raycaster();
await ensureInteriorFills([id]);
assert.ok(hasInteriorFills(id),'test actual loaded interior stock');
function visible(hit) {
  for(let object=hit.object;object;object=object.parent)if(!object.visible)return false;
  const material=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
  return material?.colorWrite!==false&&!hit.object.userData.shadowOnly;
}
function first(root,origin,direction,far=20) {
  ray.set(new THREE.Vector3(...origin),new THREE.Vector3(...direction));ray.near=0;ray.far=far;
  return ray.intersectObject(root,true).find(visible);
}
function checkWitnesses(root) {
  let maxResidual=0;
  for(const [origin,direction,far,expected] of witnesses) {
    const hit=first(root,origin,direction,far);
    assert.equal(!!hit,!!expected,`source stock/air at ${origin}`);
    if(expected) {
      const residual=hit.point.distanceTo(new THREE.Vector3(...expected));
      assert.ok(residual<=.002,`source first-hit residual ${residual}m at ${origin}`);
      maxResidual=Math.max(maxResidual,residual);
    }
  }
  return maxResidual;
}
// The last physical crossing before the witness must be an entering face,
// and the following crossing an exit. This rejects the empty cavity inside
// a concave J section even when its complete AABB encloses the witness.
function contains(mesh,point,axis) {
  const direction=new THREE.Vector3();direction[axis]=1;
  const p=new THREE.Vector3(...point);
  ray.set(p.clone().addScaledVector(direction,-12),direction);ray.near=0;ray.far=24;
  const hits=ray.intersectObject(mesh).filter((hit,i,all)=>!i||Math.abs(hit.distance-all[i-1].distance)>1e-7);
  const before=hits.filter(hit=>hit.distance<12-1e-6).at(-1);
  const after=hits.find(hit=>hit.distance>12+1e-6);
  return !!before&&!!after&&before.face.normal.dot(direction)<-.001&&after.face.normal.dot(direction)>.001;
}
function buildCaptured(quality,mutation=null) {
  const parts=[];
  registerProfiledBuilders({[id](P){
    const add=P.add,guard=P.addMudguard;
    const save=(bucket,geometry,transform,label=null)=> {
      const stock=KIT.xform(geometry.clone(),...transform);
      const mesh=new THREE.Mesh(stock,sectionMaterial);mesh.updateMatrixWorld(true);
      stock.computeBoundingBox();parts.push({bucket,mesh,bounds:stock.boundingBox,label});
    };
    P.add=(bucket,geometry,...transform)=>{
      const stock=KIT.xform(geometry.clone(),...transform);stock.computeBoundingBox();const b=stock.boundingBox;
      const deleteCap=mutation==='delete-rear-cap'&&bucket==='hullDetail'&&b.min.x>1.36&&b.max.x<1.45&&b.min.z< -3.82&&b.max.y>1.839;
      const deleteRail=mutation==='delete-channel'&&bucket==='hullDetail'&&b.min.x>1.48&&b.max.x<1.58&&
        b.min.z< -3.66&&b.max.z>-.981&&Math.abs(b.max.y-1.8553)<.0001;
      stock.dispose();if(deleteRail||deleteCap)return;
      save(bucket,geometry,transform);return add(bucket,geometry,...transform);
    };
    P.addMudguard=(label,bucket,geometry,...transform)=>{
      if(mutation==='unseat-flaps'&&/^k21-rear--?1$/.test(label))transform=[(transform[0]??0)+.45,...transform.slice(1)];
      save(bucket,geometry,transform,label);return guard(label,bucket,geometry,...transform);
    };
    buildK21X(P);
    if(mutation==='intrude-track-pocket')P.add('hull',new THREE.BoxGeometry(.51,.06,2.4),1.215,1.235,-2.30);
    if(mutation==='fill-hood-mouth')P.add('hull',new THREE.BoxGeometry(.05,.04,.03),1.274565,1.62,3.615);
    if(mutation==='fill-channel')P.add('hull',new THREE.BoxGeometry(.035,.018,.10),1.529,1.833,-3.25);
  }});
  let tank;
  try {tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,deferStaticBatch:true});}
  finally {registerProfiledBuilders({[id]:buildK21X});}
  tank.root.traverse(object=>{
    if(object.isLOD){object.autoUpdate=false;object.levels.forEach((level,i)=>level.object.visible=i===0);}
    if(object.isMesh) {
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(object.userData.shadowOnly||materials.every(m=>m.colorWrite===false))object.visible=false;
      else object.material=frontMaterial;
    }
  });tank.root.updateMatrixWorld(true);
  return {tank,parts,dispose(){tank.dispose();for(const part of parts)part.mesh.geometry.dispose();}};
}
function partTriangles(part) {
  const geometry=part.mesh.geometry,p=geometry.attributes.position,index=geometry.index,result=[];
  for(let i=0;i<(index?.count??p.count);i+=3)result.push(new THREE.Triangle(...[0,1,2].map(k=>
    new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k))));
  return result;
}
function checkChannelAir(parts,root) {
  for(const point of [[-1.529,1.833,-3.25],[1.529,1.833,-3.25],
    [-1.178335,1.620,3.615],[1.274565,1.620,3.615],[-1.4036,1.805,-3.81],[1.4059,1.805,-3.81]]) {
    assert.ok(parts.every(part=>!contains(part.mesh,point,'x')),'measured open channel retains its interior air');
    root.traverse(object=>{
      if(!object.isMesh||object.name!=='hullInteriorFill')return;
      const material=object.material;object.material=sectionMaterial;
      try {assert.equal(contains(object,point,'x'),false,'generated hull stock preserves real channel air');}
      finally {object.material=material;}
    });
  }
}
function checkMovingClearance(tank,parts,quality) {
  const root=tank.root;
  const guarded=parts.filter(({bucket,bounds:b})=>bucket.startsWith('hull')&&b.min.z<-.98);
  assert.ok(guarded.length>15,'test the actual rear hull, fenders and attachments');
  const stockTriangles=guarded.flatMap(partTriangles).filter(t=>Math.max(t.a.z,t.b.z,t.c.z)<-.98),shoes=[];
  // Generated internal stock must not close the actual mechanical clearance.
  root.traverse(object=>{
    if(object.isMesh&&object.name==='hullInteriorFill')for(const triangle of partTriangles({mesh:object})) {
      for(const point of [triangle.a,triangle.b,triangle.c])point.applyMatrix4(object.matrixWorld);
      if(Math.max(triangle.a.z,triangle.b.z,triangle.c.z)<-.98)stockTriangles.push(triangle);
    }
  });
  root.traverse(object=>{if(isTrackShoeMesh(object))shoes.push(object);});
  assert.ok(shoes.length>0,'native moving instanced shoes are installed');
  const state=createTankState(getSpec(id),new THREE.Vector3(),0);
  const instance=new THREE.Matrix4(),world=new THREE.Matrix4();let checks=0;
  for(const phase of [0,.023,.057,.101,.149]) {
    state.trackScroll.l=phase;state.trackScroll.r=phase;tank.syncFromState(state,1);root.updateMatrixWorld(true);
    for(const shoe of shoes) {
      shoe.geometry.computeBoundingBox();
      for(let i=0;i<shoe.count;i++) {
        shoe.getMatrixAt(i,instance);world.multiplyMatrices(shoe.matrixWorld,instance);
        const bounds=shoe.geometry.boundingBox.clone().applyMatrix4(world).expandByScalar(.01);checks++;
        for(const triangle of stockTriangles)assert.equal(bounds.intersectsTriangle(triangle),false,
          `${quality}: actual shoe ${shoe.name}/${i} clears rear stock by 10mm at phase ${phase}`);
      }
    }
  }
  return checks;
}
const report=[];
try {
  for(const quality of ['high','low']) {
    const built=buildCaptured(quality),{tank,parts}=built;
    try {
      const root=tank.root,maxResidual=checkWitnesses(root);
      const seats=[
        {name:'left fender inboard/hull',point:[-.899,1.16,-3.57],axis:'x'},
        {name:'right fender inboard/hull',point:[.901,1.16,-3.57],axis:'x'},
        {name:'left roof/rear lip',point:[-1.3,1.16,-3.932],axis:'y'},
        {name:'right roof/rear lip',point:[1.3,1.16,-3.932],axis:'y'},
        {name:'left lip/flap',point:[-1.3,1.15,-3.9265],axis:'z'},
        {name:'right lip/flap',point:[1.3,1.15,-3.9265],axis:'z'},
        {name:'hatch/hull',point:[0,1.9531,-3.2],axis:'y'},
        {name:'hatch lid/base',point:[0,1.95795,-3.2],axis:'y'},
        {name:'rear ramp/wall',point:[.6,1.3,-3.594],axis:'z'},
        {name:'access door/ramp',point:[.1,1.3,-3.641],axis:'z'},
        {name:'left stowage/wall',point:[-1.048,1.65,-3.645],axis:'z'},
        {name:'right stowage/wall',point:[1.048,1.65,-3.645],axis:'z'},
        {name:'end fitting seat 0',point:[-1.16394,1.6515,3.5576],axis:'z'},
        {name:'end fitting seat 1',point:[1.24237,1.6515,3.5576],axis:'z'},
        {name:'end fitting seat 2',point:[-1.417835,1.6515,3.5576],axis:'z'},
        {name:'end fitting seat 3',point:[1.422065,1.6515,3.5576],axis:'z'},
        {name:'end fitting seat 4',point:[-1.16394,1.6485,3.5576],axis:'z'},
        {name:'end fitting seat 5',point:[1.24237,1.6485,3.5576],axis:'z'},
        {name:'end fitting seat 6',point:[-1.417835,1.644,3.5576],axis:'z'},
        {name:'end fitting seat 7',point:[1.422065,1.644,3.5576],axis:'z'},
        {name:'end fitting seat 8',point:[-1.4788,1.7,-3.65],axis:'z'},
        {name:'end fitting seat 9',point:[-1.3284,1.7,-3.65],axis:'z'},
        {name:'end fitting seat 10',point:[1.3307,1.7,-3.65],axis:'z'},
        {name:'end fitting seat 11',point:[1.4811,1.7,-3.65],axis:'z'},
        // Source-supported hood receivers replace witnesses inside the old over-high roof.
        {name:'port hood receiving edge',point:[-.87195,1.50405,3.41893],axis:'z'},
        {name:'starboard hood receiving tab',point:[1.4819,1.56,3.45],axis:'z'},
      ];
      for(const seat of seats)assert.ok(parts.filter(part=>contains(part.mesh,seat.point,seat.axis)).length>=2,
        `${seat.name} has a finite shared-stock seat, not merely touching AABBs`);
      checkChannelAir(parts,root);
      const flaps=parts.filter(part=>/^k21-rear--?1$/.test(part.label??''));
      assert.equal(flaps.length,2);
      for(const flap of flaps)assert.ok(Math.abs(flap.bounds.min.y-1.038)<.0001,'rear flap keeps source ground clearance');
      let triangles=0;
      root.traverseVisible(object=>{if(object.isMesh)triangles+=Math.min(object.geometry.index?.count??object.geometry.attributes.position.count,
        object.geometry.drawRange.count)/3*(object.isInstancedMesh?object.count:1);});
      assert.ok(triangles<=80000,`${quality} actual selected geometry stays below fixed IFV budget`);
      const checks=checkMovingClearance(tank,parts,quality);
      report.push({quality,witnesses:50,air:2,maxResidualM:maxResidual,finiteSeats:seats.length,shoeBounds:checks,triangles});
    } finally {built.dispose();}
    const unseated=buildCaptured(quality,'unseat-flaps');
    try {
      for(const point of [[-1.3,1.15,-3.9265],[1.3,1.15,-3.9265]])assert.ok(
        unseated.parts.filter(part=>/^k21-rear--?1$/.test(part.label??'')).every(part=>!contains(part.mesh,point,'z')),
        'a displaced flap cannot retain the physical rear lip seat');
    } finally {unseated.dispose();}
    const deleted=buildCaptured(quality,'delete-channel');
    try {assert.throws(()=>checkWitnesses(deleted.tank.root),assert.AssertionError,'missing thin rail is rejected');}
    finally {deleted.dispose();}
    const cap=buildCaptured(quality,'delete-rear-cap');
    try {assert.throws(()=>checkWitnesses(cap.tank.root),assert.AssertionError,'missing rear lamp roof is rejected');}
    finally {cap.dispose();}
    const mouth=buildCaptured(quality,'fill-hood-mouth');
    try {assert.throws(()=>checkChannelAir(mouth.parts,mouth.tank.root),assert.AssertionError,'filled front hood mouth is rejected');}
    finally {mouth.dispose();}
    const intrusion=buildCaptured(quality,'intrude-track-pocket');
    try {assert.throws(()=>checkMovingClearance(intrusion.tank,intrusion.parts,quality),assert.AssertionError,
      'closing the mechanical relief intersects actual animated shoe stock');}
    finally {intrusion.dispose();}
    const filled=buildCaptured(quality,'fill-channel');
    try {assert.throws(()=>checkChannelAir(filled.parts,filled.tank.root),assert.AssertionError,'filled channel air is rejected');}
    finally {filled.dispose();}
  }
  assert.ok(report[1].triangles<=report[0].triangles*.75,'LOW meets fixed 75% reduction budget');
} finally {frontMaterial.dispose();sectionMaterial.dispose();registerProfiledBuilders({[id]:buildK21X});}
console.log('k21RearHullStock: source first hits, real air, finite seats, mutated-stock negatives and moving-shoe clearance PASS',JSON.stringify(report));
