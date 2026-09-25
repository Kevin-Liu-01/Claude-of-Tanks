import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Matrix4, Triangle, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import {addT90VFrontGuard} from './t90VXFrontGuards.ts';
import {addT90AXFenderClosures} from './t90AXFenderClosures.ts';
import {withHistoricalClassicShtora} from '../classicShtoraHistory.test-support.mjs';
import {withHistoricalClosedWheelFaces} from '../sourceXWheelFaceHistory.test-support.mjs';

// Immutable world-vertex multiset snapshots taken before the ERA wrappers.
// Paint decals and invisible shadow proxies are excluded, not real gun rims,
// native gear, permanent carriers, cassette furniture or stowage surfaces.
// 2026-09-11 fleet standard: every mouth lining seats on its tube edge and
// fittings carry camouflage; vertex counts are unchanged, only the moved
// lining vertices differ from the frozen captures below.
const BASELINES = {
  t90a_x: [
// 2026-09-12 fleet track/wheel standard: Russian X bands .030 (pads .036, webs .018),
// the fleet .024 band on AMX-30 X / AMX-40 X / Chieftain 5 X (course datums re-seated),
// and the scheme-painted pressed dish (plate 0.82 r) move every affected digest;
// values below are repinned from the current build.
    // (t90a_x binds A_NON_GUN_BASELINES below; these complete hashes stay as provenance.)
    [266200,'35689375dfffe09d65ce595c64629854dfeca68a6cf1a998f0e339dee2bdb168'],
    [252088,'4f0903dda8ad0700f181b4f078dd26726c5bf6377cf47669cdb726c8f05a9c71'],
  ],
  t90a_vladimir_x: [
    [217648,'e2a54c8fdb92b54a16505346db4fd78caa82c59f18ccb071eb407183443466df'],
    [203536,'9ee892f180732ebd7c32db69e0d3e720adec5dd780a3f81194df81461f39c955'],
  ],
  t90m_x: [
    // 2026-09-22 re-base (owner: "the point of adding holes instead of carving them into the barrel is that we save on triangles"): the fleet fallback mouth is a flat ring + disc (terminal-surface-fit-r3; the separate Annulus mesh is gone and the Rim geometry changed) and the second-wave/Abrams/Leclerc/Strv tubes are closed at their source tips, so the frozen digests below moved. Superseded: af34269f…, 233176, df148cfa…, 217048, 267205c2…, 288700, baa4ad47…, 272572, ea948078…, 303370, d1d5ac2a…, 287242.
    [288624,'e10add83d325ad09efe98b2eb058c32755ff063a1aac4419fe6d53c1b69cf378'], // 2026-09-25 FSP-03: source-measured return rollers restored, back to the pre-2026-09-23 count (288624 ->)
    // 2026-09-22 LOW road-wheel tier: LOW baseline moved with the base disc (272496 -> 255792); HIGH byte-identical.
    [255792,'fc49d2d7090027841fbe7203ba6d601efdd6fb98a1180c940579d7f307f3cd1a'], // 2026-09-25 FSP-03: source-measured return rollers restored, back to the pre-2026-09-23 count (255792 ->)
  ],
  t90sm_x: [
    [303294,'585834dc6daae7f884baa7926655163802e9fa392d21e589aa95c9eacd4c5d3f'], // 2026-09-25 FSP-03: source-measured return rollers restored, back to the pre-2026-09-23 count (303294 ->)
    // 2026-09-22 LOW road-wheel tier: LOW baseline moved with the base disc (287166 -> 270462); HIGH byte-identical.
    [270462,'dbef6233cb06ee02d198d2490f491ad5052e0c4398ce1205b7870732d62cb6fd'], // 2026-09-25 FSP-03: source-measured return rollers restored, back to the pre-2026-09-23 count (270462 ->)
  ],
};

// Captured before the later source-confirmed A barrel taper/MRS correction.
// The original complete hashes above remain the binding-only provenance;
// gun geometry is now independently pinned by t90AXGun.selftest.mjs.
// 2026-09-22 LOW road-wheel tier (roadWheelGeometry.ts WheelDetail): the pressed-six base disc under the T-90 X source face draws
// no ribs, lightening holes or bolt heads at LOW, so the LOW vertex baseline moved (262440 -> 245736); HIGH is byte-identical.
// 2026-09-23 (round 46, owner: the real T-72/T-90 family has no return rollers): the inferred hidden rollers left every T-90 X
// hull, so both LODs of every baseline moved — the roller rotors are gone at HIGH and the rollerless upper run re-samples the
// shoe course (count and hash repinned from the current build; hull, turret, ERA and gun stock are unchanged).
const A_NON_GUN_BASELINES=[
  [278184,'bfa6962f7e03fd61b45bb32d913a9e727aef6d03d005ad4ba8753d27f74869dc'], // 2026-09-25 FSP-03: source-measured return rollers restored, back to the pre-2026-09-23 count (278184 ->)
  [245736,'f2b53460a7d15229d1a4d531c37afcb3b66ae3fbd56bc03b8e9f734c7e9667cd'], // 2026-09-25 FSP-03: source-measured return rollers restored, back to the pre-2026-09-23 count (245736 ->)
];
// Independently captured before the V repair, subtracting only the exact
// two old guard solids (72 vertices), with multiplicity; no spatial mask.
// 2026-09-22 LOW road-wheel tier: the V's LOW vertex baseline moved with its base disc (216972 -> 200268); HIGH is byte-identical.
const V_NON_GUARD_BASELINES=[
  [233100,'6c5c9122ce98d63c1532f02987626eb564aa8141db9d61c805e3b33ce20aaa41'], // 2026-09-25 FSP-03: source-measured return rollers restored, back to the pre-2026-09-23 count (233100 ->)
  [200268,'fe095ad95af7337fc5a92749fe4acc3cd226ab5b085dc1602a8fd1582e679cf1'], // 2026-09-25 FSP-03: source-measured return rollers restored, back to the pre-2026-09-23 count (200268 ->)
];

function visible(object) {
  for(let cursor=object;cursor;cursor=cursor.parent)if(!cursor.visible)return false;
  return !object.userData.shadowOnly && !/^procShadow/.test(object.name)
    && !object.userData.vehicleMarking;
}

function appendVertices(mesh,transform,points) {
  const positions=mesh.geometry.getAttribute('position'),point=new Vector3();
  for(let i=0;i<positions.count;i++) {
    point.fromBufferAttribute(positions,i).applyMatrix4(transform);
    points.push(point.toArray().map(value=>value.toFixed(6)).join(','));
  }
}

function currentVGuardVertices(){
  const points=[],identity=new Matrix4();
  const port={addMudguard(label,bucket,original){
    assert.equal(bucket,'hull','V source guard is the sole scoped replacement');
    const geometry=original.index?original.toNonIndexed():original;
    appendVertices({geometry},identity,points);
    geometry.dispose();if(geometry!==original)original.dispose();
  }};
  for(const side of[-1,1])addT90VFrontGuard(port,side,'test-source-guard');
  return points;
}

function currentAFenderVertices(){
  const points=[],identity=new Matrix4();
  addT90AXFenderClosures({addMudguard(label,bucket,original){
    assert.equal(bucket,'hullFixedPaintedBodywork');
    const geometry=original.index?original.toNonIndexed():original;
    appendVertices({geometry},identity,points);
    geometry.dispose();if(geometry!==original)original.dispose();
  }});
  assert.equal(points.length,432,'only the four independently attachment-tested 144-triangle skins');
  return points;
}

function subtractExactVertices(points,removed){
  const counts=new Map();
  for(const key of removed)counts.set(key,(counts.get(key)||0)+1);
  const kept=points.filter(key=>{
    const remaining=counts.get(key)||0;
    if(!remaining)return true;
    counts.set(key,remaining-1);return false;
  });
  assert.ok(Array.from(counts.values()).every(count=>count===0),
    'every independently tested guard vertex is present in the actual built tank with exact multiplicity');
  return kept;
}

function vertexFingerprint(root,excludeGun=false,removeVGuards=false,removeAFenders=false) {
  root.updateMatrixWorld(true);
  const points=[],instance=new Matrix4(),world=new Matrix4();
  root.traverse(mesh=>{
    if(!mesh.isMesh||!visible(mesh))return;
    if(excludeGun)for(let owner=mesh;owner;owner=owner.parent)if(owner.name==='rig_gun')return;
    if(!mesh.isInstancedMesh) {appendVertices(mesh,mesh.matrixWorld,points);return;}
    for(let i=0;i<mesh.count;i++) {
      mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);
      appendVertices(mesh,world,points);
    }
  });
  const retained=removeVGuards?subtractExactVertices(points,currentVGuardVertices())
    :removeAFenders?subtractExactVertices(points,currentAFenderVertices()):points;
  return [retained.length,createHash('sha256').update(retained.sort().join('\n')).digest('hex')];
}

function meshSnapshots(root) {
  const snapshots=[];
  root.traverse(mesh=>{
    const positions=mesh.geometry?.getAttribute('position');
    if(!mesh.isMesh||!positions||!visible(mesh))return;
    snapshots.push({mesh,positions,before:positions.array.slice()});
  });
  return snapshots;
}

function removedTriangles(snapshots,label) {
  const triangles=[];
  for(const {mesh,positions,before}of snapshots) {
    const changed=[];
    for(let i=0;i<positions.count;i++)if(positions.getY(i)<-900)changed.push(i);
    if(!changed.length) {
      assert.deepEqual(positions.array,before,`${label}: untouched backing buffer ${mesh.name}`);
      continue;
    }
    assert.match(mesh.name,/ExternalArmor/,`${label}: only removable armor changes`);
    assert.equal(changed.length%3,0,`${label}: whole actual triangles disappear`);
    for(let i=0;i<changed.length;i+=3) {
      const points=changed.slice(i,i+3).map(vertex=>new Vector3()
        .fromArray(before,vertex*3).applyMatrix4(mesh.matrixWorld));
      triangles.push(new Triangle(...points));
    }
  }
  assert.ok(triangles.length>0,`${label}: real source-authored cassette triangles removed`);
  return triangles;
}

function assertActualFacet(surface,triangles,pivot,label) {
  const corners=surface.map(point=>new Vector3().fromArray(point).add(pivot));
  const first=new Triangle(corners[0],corners[1],corners[2]);
  assert.ok(first.getArea()>1e-10,`${label}: nondegenerate physical facet`);
  assert.ok(corners[2].distanceTo(corners[3])<1e-9,`${label}: exact triangle, not a PCA rectangle`);
  const samples=[...corners,first.getMidpoint(new Vector3()),
    corners[0].clone().lerp(corners[1],.5),corners[1].clone().lerp(corners[2],.5)];
  const nearest=new Vector3();
  assert.ok(triangles.some(triangle=>samples.every(point=>
    triangle.closestPointToPoint(point,nearest).distanceTo(point)<2e-6)),
  `${label}: complete hit face lies on one actual removed triangle (2 µm)`);
}

function expectedZones(id) {
  const sectors=id==='t90sm_x'?['glacis','turret']:['glacis','skirt','turret'];
  if(id==='t90m_x')sectors.push('side');
  return sectors.flatMap(sector=>['L','R'].map(side=>`${sector}_era_${side}`)).sort();
}

function assertDonorValues(id,plates) {
  for(const plate of plates) {
    const classic=id==='t90a_x'||id==='t90a_vladimir_x';
    const side=/^(skirt|side)_/.test(plate.name);
    assert.equal(plate.era.keReduction,classic?.2:side?.18:.3,`${id}/${plate.name}: donor KE unchanged`);
    assert.equal(plate.era.ceFlatMm,classic||side?400:600,`${id}/${plate.name}: donor CE unchanged`);
  }
}

function assertZone(tank,row,snapshots,label) {
  assert.equal(row.registered,true,`${label}: registered actual range`);
  assert.equal(row.ownerMatches,true,`${label}: native articulation owner`);
  assert.ok(row.fittedSurfaces.length>0,`${label}: physical hit surfaces exist`);
  assert.equal(tank.stripEra(row.name),true,`${label}: actual gameplay zone strips`);
  const triangles=removedTriangles(snapshots,label);
  const pivot=row.owner==='turret'?tank.root.getObjectByName('rig_turret').position.clone():new Vector3();
  for(const face of row.fittedSurfaces)assertActualFacet(face,triangles,pivot,label);
  // A false hit field translated into neighboring air must fail the same test.
  const translated=row.fittedSurfaces[0].map(point=>[point[0]+10,point[1],point[2]]);
  assert.throws(()=>assertActualFacet(translated,triangles,pivot,label),/actual removed triangle/);
  assert.equal(tank.resetEra(),true,`${label}: reset restores live cassette ranges`);
  for(const {positions,before}of snapshots)assert.deepEqual(positions.array,before,`${label}: reset exact buffer`);
}

const anchorFailures=[];
for(const [id,baselines]of Object.entries(BASELINES))for(const [lod,quality]of ['high','low'].entries()) {
  const tank=createTank(id,null,{quality,geometryReceipt:true,proceduralOnly:true,staticPreview:true});
  try {
    const label=`${id}/${quality}`,spec=getSpec(id);
    const baseline=id==='t90a_x'?A_NON_GUN_BASELINES[lod]
      :id==='t90a_vladimir_x'?V_NON_GUARD_BASELINES[lod]:baselines[lod];
    const classic=id==='t90a_x'||id==='t90a_vladimir_x';
    const historical=classic?withHistoricalClassicShtora(id,()=>createTank(id,null,
      {quality,geometryReceipt:true,proceduralOnly:true,staticPreview:true}))
      : id==='t90sm_x'?withHistoricalClosedWheelFaces(id,()=>createTank(id,null,
        {quality,geometryReceipt:true,proceduralOnly:true,staticPreview:true})):null;
    try{
      assert.deepEqual(vertexFingerprint(historical?.root??tank.root,id==='t90a_x',id==='t90a_vladimir_x',id==='t90a_x'),baseline,
        `${label}: immutable world-vertex baseline with exact inverses of independently tested Shtora, fender and SM tire-face repairs; all frozen baseline vertices retained`);
    }finally{historical?.dispose();}
    const rows=tank.root.userData.eraVisualBindingReceipt.plates;
    assert.deepEqual(rows.map(row=>row.name).sort(),expectedZones(id),`${label}: exactly inherited gameplay zones`);
    assertDonorValues(id,[...spec.armor.hullPlates,...spec.armor.turretPlates].filter(plate=>plate.kind==='era'));
    const snapshots=meshSnapshots(tank.root);
    for(const row of rows)assertZone(tank,row,snapshots,`${label}/${row.name}`);
    const yaw=tank.root.getObjectByName('rig_turret').position.toArray();
    if(spec.armor.turretPivot.some((value,index)=>Math.abs(value-yaw[index])>1e-9))
      anchorFailures.push(`${label}: combat and source yaw anchors differ`);
    const gun=tank.root.getObjectByName('rig_gun').position.toArray();
    if(spec.armor.gunPivot.some((value,index)=>Math.abs(value-gun[index])>1e-9))
      anchorFailures.push(`${label}: combat and source trunnions differ`);
    console.log(`${label}: pinned unchanged geometry outside source-tested repairs, exact removable facets, fixed backing and reset PASS`);
  } finally {tank.dispose();}
}
assert.deepEqual(anchorFailures,[],'all four combat/source rig anchors must agree at both LODs');
