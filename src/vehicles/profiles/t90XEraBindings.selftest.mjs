import assert from 'node:assert/strict';
import { Matrix4, Triangle, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import {addT90VFrontGuard} from './t90VXFrontGuards.ts';
import {addT90AXFenderClosures} from './t90AXFenderClosures.ts';

// The frozen pre-wrapper world-vertex multisets (and their historical Shtora / SM tire-face replays) are retired:
// whole-tank change detection of the four T-90 X hulls is the fleet geometry ledger's. Kept: the independently
// tested V guards and A fender closures really are in the built tank (exact vertex multiplicity), the inherited ERA
// gameplay zones, donor ERA values, removable-facet registration, fixed backing, reset and rig anchors.
const IDS=['t90a_x','t90a_vladimir_x','t90m_x','t90sm_x'];

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

function worldVertices(root) {
  root.updateMatrixWorld(true);
  const points=[],instance=new Matrix4(),world=new Matrix4();
  root.traverse(mesh=>{
    if(!mesh.isMesh||!visible(mesh))return;
    if(!mesh.isInstancedMesh) {appendVertices(mesh,mesh.matrixWorld,points);return;}
    for(let i=0;i<mesh.count;i++) {
      mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);
      appendVertices(mesh,world,points);
    }
  });
  return points;
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
for(const id of IDS)for(const quality of ['high','low']) {
  const tank=createTank(id,null,{quality,geometryReceipt:true,proceduralOnly:true,staticPreview:true});
  try {
    const label=`${id}/${quality}`,spec=getSpec(id);
    // The independently tested repair solids are physically present in the actual build, with exact multiplicity.
    if(id==='t90a_vladimir_x')subtractExactVertices(worldVertices(tank.root),currentVGuardVertices());
    if(id==='t90a_x')subtractExactVertices(worldVertices(tank.root),currentAFenderVertices());
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
    console.log(`${label}: wired source-tested repairs, inherited zones/donor values, exact removable facets, fixed backing and reset PASS`);
  } finally {tank.dispose();}
}
assert.deepEqual(anchorFailures,[],'all four combat/source rig anchors must agree at both LODs');
