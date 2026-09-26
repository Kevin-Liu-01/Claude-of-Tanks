import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {SECOND_WAVE_X_IDS} from './sourceXSecondWaveSpecs.ts';
import {SUPPLIED_SOURCE_IDS} from './suppliedSourceFleetSpecs.ts';
import {SURFACE_MARKING_STYLE,VEHICLE_MARKING_ANCHORS} from './vehicleMarkings.ts';

// This immutable hash is the 151 original anchor records at c26b3194200f52b,
// not an acceptance baseline generated from the new candidate anchors.
// 2026-09-23 (owner: "no hidden tanks"): ten of those records retired with their hulls (isu122s, isu152, jpz_e100,
// m1a2_legacy, m26_pershing, m45_patton, panther_g, sturmtiger, t95, tiger1). The 141 that remain are the originals:
// the historical set minus those ten hashes to 232c0501… on the pre-retirement tree (a10d0a30b), the value this tree
// yields, so the count and digest below are that subset of the c26b319 baseline, not a new acceptance baseline.
const newIds=new Set(SECOND_WAVE_X_IDS);
// These records were added after this regression's immutable baseline (the Abrams studies;
// the Chinese Type 100 on 2026-09-15). Do not mistake later additions for modifications of
// its original 151 records.
const laterAbramsIds=new Set(['m1a2_x','m1a2_tusk_x',
  'm1a2_sepv2_x','m1a2_sepv3_x','ua_m1a1_x']);
const laterIds=new Set([...laterAbramsIds,'type100','ztz100_x','ztz100_prototype','object695_x','ares_apc_x','merkava4_trophy','merkava4_barak','namer_ifv','tos1a_tagil','ariete_c2_x','griffin_viper',
  // 2026-09-25 IFV identity batch: three X replicas and three photographic additions with their own anchors.
  'spz_puma_s1_x','cv90_x','type89_x','dardo','lrmv_lynx','borsuk',...SUPPLIED_SOURCE_IDS]);
assert.equal(newIds.size,23,'the C2 addition does not change the original second-wave batch');
assert.equal(newIds.has('ariete_c2_x'),false);
assert.deepEqual(VEHICLE_MARKING_ANCHORS.ariete_c2_x,{
  schemaVersion:1,owner:'turret',side:'left',longitudinal:.31,vertical:.43,sizeM:.24,designationDirection:1,
},'C2 has its own explicit permanent-armor anchor, separately from the historical151');
assert.ok(VEHICLE_MARKING_ANCHORS.griffin_viper, 'new American concept has its own anchor');
assert.ok(VEHICLE_MARKING_ANCHORS.tos1a_tagil,'the later TOS concept has its own anchor');
assert.ok(VEHICLE_MARKING_ANCHORS.ztz100_prototype,'the separately restored historical prototype has its own anchor');
for(const id of SUPPLIED_SOURCE_IDS)assert.ok(VEHICLE_MARKING_ANCHORS[id],`${id}: new supplied-source anchor is present`);
for(const id of laterAbramsIds)assert.ok(VEHICLE_MARKING_ANCHORS[id],`${id}: later Abrams anchor remains present`);
const oldAnchors=Object.fromEntries(Object.entries(VEHICLE_MARKING_ANCHORS)
  .filter(([id])=>!newIds.has(id)&&!laterIds.has(id)).sort(([a],[b])=>a.localeCompare(b)));
assert.equal(Object.keys(oldAnchors).length,141,'all pre-second-wave anchors of the live fleet remain');
// Owner 2026-09-21: XK2 now wears the current K1A1 turret and its marking seat.
assert.deepEqual(oldAnchors.k2, VEHICLE_MARKING_ANCHORS.k1a1_x);
oldAnchors.k2={schemaVersion:1,owner:'turret',side:'right',longitudinal:.39,
  vertical:.44,sizeM:.24,designationDirection:-1};
assert.equal(createHash('sha256').update(JSON.stringify(oldAnchors)).digest('hex'),
  '232c050174a9397c45d2ea16c5b1b3a1347db20491fffc29246608d6b4fc204c',
  'the original 141 anchors are preserved apart from the authenticated XK2 turret transplant');

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
    // 2026-09-14: the T-72B3M X skirt gap is closed (owner ruling); its marks now sit on the
    // turret's right cheek like every other explicitly sided anchor.
    assert.ok(local.x*side>.10,`${id}/${phase}: both marks stay on their explicitly chosen side`);
    sides.push(Math.sign(local.x));
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
  assert.equal(sides.length,2,`${id}: two real footprints`);
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
const checkedIds=new Set([...SECOND_WAVE_X_IDS,'ariete_c2_x']);
const selected=selectedFlag?selectedFlag.slice(6).split(','):[...checkedIds];
assert.ok(selected.length>0&&selected.every(id=>checkedIds.has(id)),
  'only explicit second-wave IDs and the separately registered C2 upgrade may be selected');
const failures=[];
for(const id of selected)for(const quality of ['high','low']) {
  try {verify(id,quality);} catch(error) {failures.push({id,quality,error:error.message});console.error(error);}
}
assert.deepEqual(failures,[],'every requested actual-model marking footprint must pass');
console.log(`sourceXSecondWaveMarkings: ${selected.length} actual native IDs pass high/low permanent paint support; original 141 anchors unchanged`);
