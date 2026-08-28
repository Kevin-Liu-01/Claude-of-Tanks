import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';

for (const options of [
  { proceduralOnly: true, geometryReceipt: true, quality: 'high' },
  { proceduralOnly: true, geometryReceipt: true, quality: 'low', batchStatic: true },
]) {
  const tank = createTank('type10b', null, options);
  const layered = [];
  const layerIds = new Set();
  tank.root.traverse((object) => {
    if (!object.isMesh || object.userData.vehicleMarking
        || object.userData.authoredShadowProxy) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some((material) => material?.colorWrite !== false)) return;
    const layer = object.userData.coplanarDepthLayer;
    assert.ok(Number.isInteger(layer) && layer > 0,
      `${object.name || object.type} has a positive deterministic depth layer`);
    assert.ok(!layerIds.has(layer), `depth layer ${layer} is unique inside one tank`);
    layerIds.add(layer);
    layered.push(object);
  });
  assert.equal(tank.root.userData.coplanarDepthLayerCount, layered.length,
    'root receipt counts every final color-pass mesh');

  const hull = tank.root.getObjectByName('hull');
  const detail = tank.root.getObjectByName('hullDark');
  assert.ok(hull && detail, 'representative armor and detail meshes exist');
  hull.onBeforeRender(null, null, null, hull.geometry, hull.material, null);
  assert.equal(hull.material.polygonOffsetFactor, 0,
    'armor uses slope-independent depth arbitration');
  assert.equal(hull.material.polygonOffsetUnits, -hull.userData.coplanarDepthLayer,
    'armor draw applies its object-local layer');
  detail.onBeforeRender(null, null, null, detail.geometry, detail.material, null);
  assert.equal(detail.material.polygonOffsetUnits, -detail.userData.coplanarDepthLayer,
    'detail draw applies its distinct object-local layer');
  assert.notEqual(hull.userData.coplanarDepthLayer, detail.userData.coplanarDepthLayer,
    'cross-material coplanar surfaces cannot retain equal depth');
  tank.dispose();
}

console.log('coplanarDepthLayers.selftest: high-detail and batched meshes have unique stable depth');
