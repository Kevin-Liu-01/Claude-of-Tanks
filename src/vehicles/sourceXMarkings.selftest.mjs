import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { SOURCE_X_IDS } from './sourceXFleetSpecs.ts';
import { SURFACE_MARKING_STYLE } from './vehicleMarkings.ts';

function markingVertices(mesh) {
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

function actualMarkingFootprints(marks) {
  // Geometry-receipt low detail merges equal-material decals. Recover the two
  // actual connected quad buffers; do not infer two missing high-detail nodes
  // or substitute pristine proxy meshes for the rendered low-detail geometry.
  const footprints=[];
  for(const mesh of marks) {
    const nodes=markingVertices(mesh),pending=new Set(nodes.keys());
    while(pending.size) {
      const seed=pending.values().next().value,stack=[seed],points=[];
      while(stack.length) {
        const key=stack.pop();
        if(!pending.delete(key))continue;
        const vertex=nodes.get(key);points.push(vertex.point);
        stack.push(...vertex.neighbors);
      }
      assert.equal(points.length,4,'each real connected marking is a complete four-corner plane');
      const center=points.reduce((sum,point)=>sum.add(point),new THREE.Vector3()).multiplyScalar(.25);
      const adjacent=points.slice(1).sort((a,b)=>a.distanceToSquared(points[0])-b.distanceToSquared(points[0]));
      const u=adjacent[0].clone().sub(points[0]),v=adjacent[1].clone().sub(points[0]);
      assert.ok(Math.abs(u.dot(v))<1e-7,'actual marking footprint retains perpendicular sides');
      assert.ok(u.length()>=.219&&v.length()>=.219,'native low-detail batch retains the full source-sized markings');
      footprints.push({name:`${mesh.name}/${footprints.length}`,center,u,v,normal:nodes.get(seed).normal});
    }
  }
  return footprints;
}

function supportMeshes(tank) {
  const candidates = [];
  tank.root.traverse(object => {
    if (!object.isMesh || object.userData.vehicleMarking || object.userData.shadowOnly
        || object.userData.authoredShadowProxy || /shadow|void|\bAO\b/i.test(object.name)) return;
    for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return;
    candidates.push(object);
  });
  return candidates;
}

function assertPhysicalSupport(tank, footprints, id, phase) {
  const candidates=supportMeshes(tank),supportNames=new Set();
  for (const mark of footprints) {
    const normal=mark.normal;
    for (const u of [-.28, 0, .28]) for (const v of [-.28, 0, .28]) {
      const origin = mark.center.clone().addScaledVector(mark.u,u).addScaledVector(mark.v,v)
        .addScaledVector(normal, .03);
      const ray = new THREE.Raycaster(origin, normal.clone().negate(), 0, .055);
      const hit = ray.intersectObjects(candidates, false)[0];
      assert.ok(hit, `${id}/${mark.name}: (${u},${v}) has physical support ${phase}`);
      assert.ok(Math.abs(hit.distance - .03 - SURFACE_MARKING_STYLE.surfaceLiftM)
        <= SURFACE_MARKING_STYLE.visibilityToleranceM,
      `${id}/${mark.name}: (${u},${v}) is not floating ${phase}`);
      supportNames.add(hit.object.name);
    }
  }
  return supportNames;
}

function assertSpentSupport(tank, footprints, id) {
  const zones = new Set((tank.root.userData.eraVisualBindingReceipt?.plates ?? [])
    .filter(row => row.registered).map(row => row.name));
  for (const zone of zones) assert.equal(tank.stripEra(zone), true, `${id}/${zone}: deplete real armor`);
  tank.root.updateMatrixWorld(true);
  const supports=assertPhysicalSupport(tank,footprints,id,'after all ERA is spent');
  if (zones.size) assert.equal(tank.resetEra(), true, `${id}: restore real panels`);
  return supports;
}

for (const id of SOURCE_X_IDS) for (const quality of ['high','low']) {
  const label=`${id}/${quality}`;
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality });
  try {
    const marks = [];
    tank.root.traverse(object => {
      if (object.userData.vehicleMarking) marks.push(object);
    });
    tank.root.updateMatrixWorld(true);
    const footprints=actualMarkingFootprints(marks);
    assert.equal(footprints.length, 2, `${label}: actual insignia and designation quad buffers`);
    for (const mark of quality==='high'?marks:[]) {
      assert.equal(mark.userData.surfaceSupported, true, `${label}: real permanent support`);
      assert.equal(mark.userData.visibilityClearSamples, 9, `${label}: entire marking footprint clear`);
      assert.ok(mark.userData.maximumSurfaceErrorM <= SURFACE_MARKING_STYLE.visibilityToleranceM,
        `${label}: no decal bridging across absent or bent armor`);
    }
    if (id === 't90sm_x') {
      const box = tank.root.getObjectByName('turretPermanentMarkingSurface');
      assert.ok(box?.isMesh, 'fixed ammunition bustle provides paint surface');
      const size = new THREE.Box3().setFromObject(box).getSize(new THREE.Vector3());
      assert.ok(Math.abs(size.x - 1.324) < 1e-5 && Math.abs(size.y - .497) < 1e-5,
        'actual source-sized existing equipment, not an invented marking patch');
      if(quality==='high')assert.ok(marks.some(mark => mark.userData.surfaceMesh === box.name), 'paint actually seated on fixed bustle');
    }
    if (id === 't90m_x') {
      const box=tank.root.getObjectByName('turretPermanentMarkingSurface');
      assert.ok(box?.isMesh,'existing fixed left stowage box is a permanent paint surface');
      const size=new THREE.Box3().setFromObject(box).getSize(new THREE.Vector3());
      assert.ok(Math.abs(size.x-.34)<1e-5&&Math.abs(size.y-.41)<1e-5&&Math.abs(size.z-.87)<1e-5,
        'source-sized box is unchanged; no invented marking plate or removed basket');
      if(quality==='high')assert.ok(marks.every(mark=>mark.userData.surfaceMesh===box.name),
        'both complete paint footprints sit outside the corrected basket, on its fixed box');
    }
    assertPhysicalSupport(tank,footprints,label,'before damage');
    const supports=assertSpentSupport(tank, footprints, label);
    if(id==='t90m_x'||id==='t90sm_x')assert.ok(supports.has('turretPermanentMarkingSurface'),
      `${label}: actual high/low paint buffers remain supported by the existing fixed box`);
    const permanent={t14_x:'turret',kf51_x:'turret',leo2a6m_x:'hull'}[id];
    if(permanent)assert.deepEqual([...supports],[permanent],
      `${label}: both complete footprints stay on the intended permanent source armor`);
  } finally { tank.dispose(); }
}
console.log('sourceXMarkings: all thirteen high/low complete footprints retain permanent physical support after all ERA is spent');
