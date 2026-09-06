import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Matrix4, Triangle, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import {addT90VFrontGuard} from './t90VXFrontGuards.ts';

// Immutable world-vertex multiset snapshots taken before the ERA wrappers.
// Paint decals and invisible shadow proxies are excluded, not real gun rims,
// native gear, permanent carriers, cassette furniture or stowage surfaces.
const BASELINES = {
  t90a_x: [
    [266200,'35689375dfffe09d65ce595c64629854dfeca68a6cf1a998f0e339dee2bdb168'],
    [252088,'4f0903dda8ad0700f181b4f078dd26726c5bf6377cf47669cdb726c8f05a9c71'],
  ],
  t90a_vladimir_x: [
    [217648,'e2a54c8fdb92b54a16505346db4fd78caa82c59f18ccb071eb407183443466df'],
    [203536,'9ee892f180732ebd7c32db69e0d3e720adec5dd780a3f81194df81461f39c955'],
  ],
  t90m_x: [
    [273196,'cb107b8fbb360ef975e7fab538fa83d55ac4f2b7406231cb55520eb91a10dd23'],
    [259084,'11ae4c4dd257cb4815487b9f0f03bf232df1e6391c4b641e67e51ae95bdb279e'],
  ],
  t90sm_x: [
    [287338,'4bb9ef025e63616044a414cc1c4d24b20f892ee382fde3c892949c98dd3e58cc'],
    [273226,'8d53537774c0a85c90e6cd66cd3f97078b30982c0e230ae46c98a93c3b9fc7e1'],
  ],
};

// Captured before the later source-confirmed A barrel taper/MRS correction.
// The original complete hashes above remain the binding-only provenance;
// gun geometry is now independently pinned by t90AXGun.selftest.mjs.
const A_NON_GUN_BASELINES=[
  [261264,'84b6235f4dfe4ee74e419690933651ba591443033507c3de2c840f6dd89dde91'],
  [247536,'482972716f8659f263d4d2cfaa209b63a6f829aeb99aa9b9f76446e45eae9d5f'],
];
// Independently captured before the V repair, subtracting only the exact
// two old guard solids (72 vertices), with multiplicity; no spatial mask.
const V_NON_GUARD_BASELINES=[
  [217576,'860dd67ce24612266e9ee08337af7f0832d837c7d35367ac3ef3a0717fe87f20'],
  [203464,'2d949878a9aa2db1cfb22fc9a00195267cba65095d363be9bf05c558ddf989b6'],
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

function subtractExactVertices(points,removed){
  const counts=new Map();
  for(const key of removed)counts.set(key,(counts.get(key)||0)+1);
  const kept=points.filter(key=>{
    const remaining=counts.get(key)||0;
    if(!remaining)return true;
    counts.set(key,remaining-1);return false;
  });
  assert.ok(Array.from(counts.values()).every(count=>count===0),
    'every excluded V source guard vertex is present in the actual built tank with exact multiplicity');
  return kept;
}

function vertexFingerprint(root,excludeGun=false,removeVGuards=false) {
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
  const retained=removeVGuards?subtractExactVertices(points,currentVGuardVertices()):points;
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
    assert.deepEqual(vertexFingerprint(tank.root,id==='t90a_x',id==='t90a_vladimir_x'),baseline,
      `${label}: every world vertex outside independently source-corrected A gun / exact V guards preserved`);
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
