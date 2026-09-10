import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {SECOND_WAVE_X_IDS} from './sourceXSecondWaveSpecs.ts';
import {SURFACE_MARKING_STYLE,VEHICLE_MARKING_ANCHORS} from './vehicleMarkings.ts';

// This immutable hash is the 151 original anchor records at c26b3194200f52b,
// not an acceptance baseline generated from the new candidate anchors.
const newIds=new Set(SECOND_WAVE_X_IDS);
// These seven records were added after this regression's immutable baseline.
// Do not mistake later additions for modifications of its original 151 records.
const laterAbramsIds=new Set(['m1a1_x','m1a1ha_x','m1a2_x','m1a2_tusk_x',
  'm1a2_sepv2_x','m1a2_sepv3_x','ua_m1a1_x']);
for(const id of laterAbramsIds)assert.ok(VEHICLE_MARKING_ANCHORS[id],`${id}: later Abrams anchor remains present`);
const oldAnchors=Object.fromEntries(Object.entries(VEHICLE_MARKING_ANCHORS)
  .filter(([id])=>!newIds.has(id)&&!laterAbramsIds.has(id)).sort(([a],[b])=>a.localeCompare(b)));
assert.equal(Object.keys(oldAnchors).length,151,'all pre-second-wave anchors remain');
assert.equal(createHash('sha256').update(JSON.stringify(oldAnchors)).digest('hex'),
  '229edfafa18e3982c097bbc48d1b3778ac2db97601bdee218b2816674cc2209f',
  'the complete original 151 anchor records are unchanged');

function markingNodes(mesh) {
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index,nodes=new Map();
  for(let offset=0;offset<(index?.count??p.count);offset+=3) {
    const triangle=[0,1,2].map(j=>new THREE.Vector3()
      .fromBufferAttribute(p,index?index.getX(offset+j):offset+j).applyMatrix4(mesh.matrixWorld));
    const normal=new THREE.Triangle(...triangle).getNormal(new THREE.Vector3());
    const keys=triangle.map(point=>point.toArray().map(v=>v.toFixed(8)).join(','));
    for(let j=0;j<3;j++) {
      if(!nodes.has(keys[j]))nodes.set(keys[j],{point:triangle[j],normal,neighbors:new Set()});
      for(const key of keys)nodes.get(keys[j]).neighbors.add(key);
    }
  }
  return nodes;
}

function footprintOwner(mesh) {
  for(let node=mesh;node;node=node.parent) {
    if(node.name==='rig_hull')return'hull';
    if(node.name==='rig_turret')return'turret';
  }
  assert.fail('actual marking buffer has no hull/turret owner');
}

function connectedFootprints(mesh) {
  const nodes=markingNodes(mesh),pending=new Set(nodes.keys()),footprints=[];
  while(pending.size) {
    const seed=pending.values().next().value,stack=[seed],points=[];
    while(stack.length) {
      const key=stack.pop();
      if(!pending.delete(key))continue;
      const vertex=nodes.get(key);points.push(vertex.point);stack.push(...vertex.neighbors);
    }
    assert.equal(points.length,4,'each actual connected paint buffer has four corners');
    const center=points.reduce((sum,point)=>sum.add(point),new THREE.Vector3()).multiplyScalar(.25);
    const adjacent=points.slice(1).sort((a,b)=>a.distanceToSquared(points[0])-b.distanceToSquared(points[0]));
    const u=adjacent[0].clone().sub(points[0]),v=adjacent[1].clone().sub(points[0]);
    assert.ok(Math.abs(u.dot(v))<1e-7,'actual marking retains perpendicular edges');
    assert.ok(Math.min(u.length(),v.length())>=SURFACE_MARKING_STYLE.minimumReadableSizeM-1e-6,
      'the actual high/low quad remains readable, not a tiny success marker');
    footprints.push({center,u,v,normal:nodes.get(seed).normal,owner:footprintOwner(mesh)});
  }
  return footprints;
}

function markingMeshes(tank) {
  const meshes=[];
  tank.root.traverse(o=>{if(o.isMesh&&o.userData.vehicleMarking)meshes.push(o);});
  return meshes;
}

function visiblePhysicalMeshes(tank) {
  const meshes=[];
  tank.root.traverse(o=>{
    if(!o.isMesh||o.userData.vehicleMarking||o.userData.shadowOnly
      ||o.userData.authoredShadowProxy)return;
    for(let parent=o;parent;parent=parent.parent)if(!parent.visible)return;
    meshes.push(o);
  });
  return meshes;
}

function assertActualFootprints(tank,id,phase,checkExternalVisibility=true) {
  tank.root.updateMatrixWorld(true);
  const footprints=markingMeshes(tank).flatMap(connectedFootprints),physical=visiblePhysicalMeshes(tank);
  assert.equal(footprints.length,2,`${id}/${phase}: actual insignia and designation buffers`);
  const intended=VEHICLE_MARKING_ANCHORS[id].owner,supportNames=new Set();
  const sides=[];
  for(const mark of footprints) {
    assert.equal(mark.owner,intended,`${id}/${phase}: explicit intended articulation owner, not other-owner fallback`);
    const local=tank.root.getObjectByName(`rig_${mark.owner}`).worldToLocal(mark.center.clone());
    const side=VEHICLE_MARKING_ANCHORS[id].side==='left'?-1:1;
    if(id==='t72b3m_x') {
      // Source skirt gap -1.73..-1.389 exposes one fixed tub face on each
      // side. Two same-side readable planes do not fit; pin the intentional
      // pair instead of permitting arbitrary other-side/other-owner fallback.
      assert.ok(Math.abs(Math.abs(local.x)-1.1509999809265137)<1e-6
        &&Math.abs(local.y-.9587388834357262)<1e-6
        &&Math.abs(local.z+1.5853100113868712)<1e-6,
      `${id}/${phase}: exact permanent-tub exposed-gap centers`);
      sides.push(Math.sign(local.x));
    }else assert.ok(local.x*side>.10,`${id}/${phase}: both marks stay on their explicitly chosen side`);
    for(const u of [-.28,0,.28])for(const v of [-.28,0,.28]) {
      const point=mark.center.clone().addScaledVector(mark.u,u).addScaledVector(mark.v,v);
      const ray=new THREE.Raycaster(point.clone().addScaledVector(mark.normal,.03),
        mark.normal.clone().negate(),0,.055);
      const hit=ray.intersectObjects(physical,false)[0];
      assert.ok(hit,`${id}/${phase}: real support beneath paint (${u},${v})`);
      assert.ok(Math.abs(hit.distance-.03-SURFACE_MARKING_STYLE.surfaceLiftM)
        <=SURFACE_MARKING_STYLE.visibilityToleranceM,`${id}/${phase}: no floating footprint (${u},${v})`);
      assert.ok(['hull','hullTrackGuardL','hullTrackGuardR','turret','turretPermanentMarkingSurface'].includes(hit.object.name),
        `${id}/${phase}: paint sits on permanent authored armor, not removable ERA/furniture`);
      supportNames.add(hit.object.name);
      if(!checkExternalVisibility)continue;
      const outside=new THREE.Raycaster(point.clone().addScaledVector(mark.normal,8),
        mark.normal.clone().negate(),0,8.03).intersectObjects(physical,false)[0];
      assert.ok(outside,`${id}/${phase}: externally visible footprint (${u},${v})`);
      const offset=outside.distance-8-SURFACE_MARKING_STYLE.surfaceLiftM;
      assert.ok(offset>=-SURFACE_MARKING_STYLE.visibilityOcclusionToleranceM
        &&offset<=SURFACE_MARKING_STYLE.visibilityToleranceM,
      `${id}/${phase}: no equipment obscures paint (${u},${v}); offset=${offset}; hit=${outside.object.name}`);
    }
  }
  if(id==='t72b3m_x')assert.deepEqual(sides.sort(),[-1,1],`${id}: one real footprint on each required side`);
  return{footprints,supportNames:[...supportNames].sort()};
}

function assertHighMetadata(tank,id) {
  const marks=markingMeshes(tank);
  assert.deepEqual(marks.map(m=>m.userData.markingKind).sort(),['designation','insignia'],
    `${id}: two real marking kinds`);
  for(const mark of marks) {
    assert.equal(mark.userData.markingAnchorProfile,id,`${id}: explicit own anchor`);
    assert.equal(mark.userData.surfaceSupported,true,`${id}: authoritative physical solver seat`);
    assert.equal(mark.userData.visibilityClearSamples,9,`${id}: all nine footprint rays clear`);
    assert.ok(mark.userData.maximumSurfaceErrorM<=SURFACE_MARKING_STYLE.visibilityToleranceM,
      `${id}: no decal bridge across missing or sharply bent armor`);
    if(id==='t72b3m_x')assert.equal(Math.sign(mark.position.x),mark.userData.markingKind==='insignia'?1:-1,
      `${id}: deliberate right insignia and left designation, never swapped`);
  }
}

function verify(id,quality) {
  assert.ok(VEHICLE_MARKING_ANCHORS[id],`${id}: explicit second-wave anchor, no donor fallback`);
  const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,materialMode:'geometry-only'});
  try {
    assert.equal(tank.root.userData.markingSeatPath,'surface-solver',`${id}: no empty/stale generated receipt substituted`);
    if(quality==='high')assertHighMetadata(tank,id);
    const live=assertActualFootprints(tank,id,'live');
    const zones=[...new Set((tank.root.userData.eraVisualBindingReceipt?.plates??[])
      .filter(row=>row.registered).map(row=>row.name))];
    for(const zone of zones)assert.equal(tank.stripEra(zone),true,`${id}/${zone}: spend actual visible ERA`);
    const spent=assertActualFootprints(tank,id,'all ERA spent');
    assert.deepEqual(spent.supportNames,live.supportNames,`${id}: the same permanent supports survive depletion`);
    if(zones.length)assert.equal(tank.resetEra(),true,`${id}: restore actual cassettes`);
    assertActualFootprints(tank,id,'reset');
    tank.root.getObjectByName('rig_turret').rotation.y=.63;
    tank.root.getObjectByName('rig_gun').rotation.x=-.17;
    // A legitimate other articulation owner can cross the exterior sightline
    // after rotation (observed A6 turret equipment and Mk10 hull equipment).
    // All nine support/flatness rays and exact ownership remain mandatory;
    // external visibility is mandatory at neutral/live, spent and reset.
    const turned=assertActualFootprints(tank,id,'yaw/pitch',false);
    for(let i=0;i<turned.footprints.length;i++) {
      const distance=turned.footprints[i].center.distanceTo(live.footprints[i].center);
      assert.ok(VEHICLE_MARKING_ANCHORS[id].owner==='hull'?distance<1e-6:distance>.02,
        `${id}: actual high/low paint follows only its owning hull/turret rig`);
    }
    console.log(`${id}/${quality}: two readable permanent footprints, nine visible rays, ERA spent/reset and owner pose PASS`);
  } finally {tank.dispose();}
}

const selectedFlag=process.argv.find(arg=>arg.startsWith('--ids='));
const selected=selectedFlag?selectedFlag.slice(6).split(','):SECOND_WAVE_X_IDS;
assert.ok(selected.length>0&&selected.every(id=>newIds.has(id)),'only explicit current second-wave IDs may be selected');
const failures=[];
for(const id of selected)for(const quality of ['high','low']) {
  try {verify(id,quality);} catch(error) {failures.push({id,quality,error:error.message});console.error(error);}
}
assert.deepEqual(failures,[],'every requested actual-model marking footprint must pass');
console.log(`sourceXSecondWaveMarkings: ${selected.length} actual native IDs pass high/low permanent paint support; original 151 anchors unchanged`);
