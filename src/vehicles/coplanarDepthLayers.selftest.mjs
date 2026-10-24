import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { assignCoplanarDepth, MARKING_DEPTH_MARGIN } from './coplanarDepth.ts';

// 2026-10-23 (lane 243; the owner: "insignias and marks on tanks are still glitching ... fix any glitching of that or
// tank props"): every colour-pass mesh keeps a unique place in the semantic order (`coplanarDepthLayer`), and draws
// with an offset bounded by contact (`coplanarDepthOffset`, coplanarDepth.ts): the old one-unit-per-mesh ladder drew
// the last meshes 52-173 units forward, centimetres of eye depth at Gallery and battle range.
const MAX_OFFSET = 32;

// ---- the contact rule, on a scene built for it --------------------------------------------------------------------
{
  const root = new THREE.Group();
  const plane = (name, x, y, z, w = 1, h = 1) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ name }));
    mesh.name = name;
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const base = plane('base', 0, 0, 0, 2, 2);
  const plate = plane('plate', 0.2, 0, 0, 0.5, 0.5); // coplanar on the base
  const stencil = plane('stencil', 0.2, 0, 0, 0.2, 0.2); // coplanar on both
  const proud = plane('proud', -0.5, 0, 0.004, 0.3, 0.3); // 4 mm in front: no tie
  const far = plane('far', 5, 0, 0, 0.5, 0.5); // the base's plane, bounds apart
  const turned = plane('turned', 0.2, 0, 0, 0.3, 0.3); // coplanar but facing away
  turned.rotation.y = Math.PI;
  const records = [base, plate, stencil, proud, far, turned]
    .map((object, index) => ({ object, materials: [object.material], layer: index + 1 }));
  const depth = Object.fromEntries(assignCoplanarDepth(root, records).map((record) => [record.object.name, record.depth]));
  assert.deepEqual(depth, { base: 1, plate: 2, stencil: 3, proud: 1, far: 1, turned: 1 },
    'only meshes that share a facing plane where their bounds meet are ordered; each ordered pair keeps the ladder\'s winner');
  // instanced draws move their planes per instance: they order against every record their bounds meet
  const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial(), 2);
  pads.name = 'pads';
  pads.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0.2, 0.05, 0.02));
  pads.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4.0, 0, 0));
  root.add(pads);
  const withPads = assignCoplanarDepth(root, [...records, { object: pads, materials: [pads.material], layer: 7 }]);
  assert.equal(withPads.find((record) => record.object === pads).depth, 4,
    'an instanced draw orders after everything its bounds meet (base, plate, stencil, turned)');
}

// ---- the fleet build ----------------------------------------------------------------------------------------------
for (const options of [
  { proceduralOnly: true, geometryReceipt: true, quality: 'high' },
  { proceduralOnly: true, geometryReceipt: true, quality: 'low', batchStatic: true },
]) {
  const tank = createTank('type10b', null, options);
  const layered = [];
  const layerIds = new Set();
  const markings = [];
  tank.root.traverse((object) => {
    if (!object.isMesh || object.userData.authoredShadowProxy) return;
    if (object.userData.vehicleMarking) { markings.push(object); return; }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some((material) => material?.colorWrite !== false)) return;
    const layer = object.userData.coplanarDepthLayer;
    assert.ok(Number.isInteger(layer) && layer > 0,
      `${object.name || object.type} has a positive deterministic depth layer`);
    assert.ok(!layerIds.has(layer), `depth layer ${layer} is unique inside one tank`);
    const offset = object.userData.coplanarDepthOffset;
    assert.ok(Number.isInteger(offset) && offset > 0 && offset <= MAX_OFFSET,
      `${object.name || object.type} draws with a bounded offset (${offset})`);
    layerIds.add(layer);
    layered.push(object);
  });
  assert.equal(tank.root.userData.coplanarDepthLayerCount, layered.length + markings.length,
    'root receipt counts every final color-pass mesh and every marking draw');
  assert.ok(tank.root.userData.coplanarDepthTop <= MAX_OFFSET,
    `the deepest offset stays bounded (${tank.root.userData.coplanarDepthTop})`);

  const hull = tank.root.getObjectByName('hull');
  const detail = tank.root.getObjectByName('hullDark');
  assert.ok(hull && detail, 'representative armor and detail meshes exist');
  hull.onBeforeRender(null, null, null, hull.geometry, hull.material, null);
  assert.equal(hull.material.polygonOffsetFactor, 0,
    'armor uses slope-independent depth arbitration');
  assert.equal(hull.material.polygonOffsetUnits, -hull.userData.coplanarDepthOffset,
    'armor draw applies its bounded offset');
  detail.onBeforeRender(null, null, null, detail.geometry, detail.material, null);
  assert.equal(detail.material.polygonOffsetUnits, -detail.userData.coplanarDepthOffset,
    'detail draw applies its own offset');

  // markings draw in front of every layer their bounds meet, the armour they are painted on included
  assert.ok(markings.length >= 2, 'the Type 10B carries its insignia and designation');
  for (const mark of markings) {
    const surface = mark.parent.getObjectByName(mark.userData.surfaceMesh ?? 'hull')
      ?? tank.root.getObjectByName(mark.userData.surfaceOwner === 'turret' ? 'turret' : 'hull');
    assert.ok(surface, `${mark.name}: its armour exists`);
    const material = Array.isArray(mark.material) ? mark.material[0] : mark.material;
    mark.onBeforeRender(null, null, null, mark.geometry, material, null);
    assert.equal(material.polygonOffsetFactor, 0, `${mark.name}: slope-independent`);
    assert.ok(mark.userData.coplanarDepthOffset >= (surface.userData.coplanarDepthOffset ?? 0) + MARKING_DEPTH_MARGIN,
      `${mark.name} (${mark.userData.coplanarDepthOffset}) draws ${MARKING_DEPTH_MARGIN} units in front of its armour (${surface.userData.coplanarDepthOffset})`);
    assert.equal(material.polygonOffsetUnits, -mark.userData.coplanarDepthOffset, `${mark.name}: its offset applies`);
  }
  tank.dispose();
}

console.log('coplanarDepthLayers.selftest: contact-bounded offsets keep every tie\'s winner; markings draw over their armour');
