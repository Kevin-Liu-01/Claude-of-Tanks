import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { SOURCE_X_IDS } from './sourceXFleetSpecs.ts';
import { SURFACE_MARKING_STYLE } from './vehicleMarkings.ts';
import { renderedMarkingFootprints } from './markingFootprints.test-support.mjs';

// 2026-10-23 (lane 243): markings are films cut to the armour under their seats (markingFilm.ts), so a footprint is no
// longer a quad's four corners. Each draw records its seats' footprints (low detail's batch included);
// renderedMarkingFootprints holds the rendered paint to them: every painted triangle inside one, each mostly painted.
// (the thirteen source-X seats carry paint over 81-100 % of their footprints: plate edges and hatch rims cut the rest)
const MIN_PAINT_COVERAGE = .75;
function actualMarkingFootprints(marks) {
  const footprints=[];
  for(const mesh of marks) {
    for(const footprint of renderedMarkingFootprints(mesh,{minCoverage:MIN_PAINT_COVERAGE})) {
      const {center,u,v,normal}=footprint;
      assert.ok(Math.abs(u.dot(v))<1e-7,'actual marking footprint retains perpendicular sides');
      assert.ok(u.length()>=.219&&v.length()>=.219,'native low-detail batch retains the full source-sized markings');
      footprints.push({name:`${mesh.name}/${footprints.length}`,center,u,v,normal});
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
    if (id === 't90sm') {
      const box = tank.root.getObjectByName('turretPermanentMarkingSurface');
      assert.ok(box?.isMesh, 'fixed ammunition bustle provides paint surface');
      const size = new THREE.Box3().setFromObject(box).getSize(new THREE.Vector3());
      assert.ok(Math.abs(size.x - 1.324) < 1e-5 && Math.abs(size.y - .497) < 1e-5,
        'actual source-sized existing equipment, not an invented marking patch');
      if(quality==='high')assert.ok(marks.some(mark => mark.userData.surfaceMesh === box.name), 'paint actually seated on fixed bustle');
    }
    if (id === 't90m') {
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
    if(id==='t90m'||id==='t90sm')assert.ok(supports.has('turretPermanentMarkingSurface'),
      `${label}: actual high/low paint buffers remain supported by the existing fixed box`);
    const permanent={t14_armata:'turret',kf51_panther:'turret',leo2a6m:'hull'}[id];
    if(permanent)assert.deepEqual([...supports],[permanent],
      `${label}: both complete footprints stay on the intended permanent source armor`);
  } finally { tank.dispose(); }
}
console.log('sourceXMarkings: all thirteen high/low complete footprints retain permanent physical support after all ERA is spent');
