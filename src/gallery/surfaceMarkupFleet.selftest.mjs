import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../vehicles/tankFactory.ts';
import { ALL_TANK_IDS } from '../vehicles/specs.ts';
import { collectSurfacePickTargets, effectiveVisible } from './surfaceMarkup.ts';
import '../ui/i18nCatalog.ts';

let visiblePrimitiveCount = 0;
let fittingPrimitiveCount = 0;
let spareTrackPrimitiveCount = 0;

for (const id of ALL_TANK_IDS) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  await Promise.resolve();
  visual.root.updateMatrixWorld(true);

  const sourceState = new Map();
  const expected = [];
  visual.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry?.getAttribute('position')) return;
    sourceState.set(object, { parent: object.parent, visible: object.visible });
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const rendered = materials.some((material) => material
      && material.visible !== false
      && material.colorWrite !== false
      && (!material.transparent || material.opacity > 0));
    if (!effectiveVisible(object) || object.userData.gallerySurfaceMarkup
        || object.userData.authoredShadowProxy || object.userData.shadowOnly || !rendered) return;
    expected.push(object);
    visiblePrimitiveCount++;
    if (object.name?.startsWith('fitting_') || object.userData.fitting) fittingPrimitiveCount++;
    if (/spare.?track/i.test(object.name || '') || object.userData.fitting === 'spareTrackLinks') {
      spareTrackPrimitiveCount++;
    }
  });

  const actual = collectSurfacePickTargets(visual.root);
  assert.equal(actual.length, expected.length,
    `${id}: Gallery exposes every rendered primitive and no hidden proxy`);
  for (const primitive of expected) {
    assert.ok(actual.includes(primitive),
      `${id}/${primitive.name || primitive.type}: rendered primitive remains Gallery-selectable`);
  }
  for (const [primitive, state] of sourceState) {
    assert.equal(primitive.parent, state.parent,
      `${id}/${primitive.name || primitive.type}: Gallery collection preserves source parentage`);
    assert.equal(primitive.visible, state.visible,
      `${id}/${primitive.name || primitive.type}: Gallery collection preserves source visibility`);
  }
  visual.dispose();
}

assert.ok(visiblePrimitiveCount > ALL_TANK_IDS.length * 10,
  'fleet gate covers a substantial set of visible primitives');
assert.ok(fittingPrimitiveCount > 0, 'fleet gate covers visible fitting primitives');
assert.ok(spareTrackPrimitiveCount > 0, 'fleet gate covers visible spare-track primitives');

console.log(`surfaceMarkupFleet.selftest: ${visiblePrimitiveCount} visible primitives across ${ALL_TANK_IDS.length} tanks remain rendered and Gallery-selectable`);
