// Gallery surface markup on every tank (formerly surfaceMarkupFleet.selftest.mjs): each rendered primitive stays
// Gallery-selectable, no hidden proxy is, and collection preserves parentage and visibility. A fleet audit
// (src/vehicles/fleetPass.test-support.mjs) on the unbatched seed-4242 HIGH build; fleetPassHigh.selftest runs it.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ALL_TANK_IDS } from '../vehicles/specs.ts';
import { collectSurfacePickTargets, effectiveVisible } from './surfaceMarkup.ts';

export function createSurfaceMarkupFleetAudit() {
  let visiblePrimitiveCount = 0;
  let fittingPrimitiveCount = 0;
  let spareTrackPrimitiveCount = 0;
  return {
    async check(id, visual) {
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
    },
    finish() {
      assert.ok(visiblePrimitiveCount > ALL_TANK_IDS.length * 10,
        'fleet gate covers a substantial set of visible primitives');
      assert.ok(fittingPrimitiveCount > 0, 'fleet gate covers visible fitting primitives');
      assert.ok(spareTrackPrimitiveCount > 0, 'fleet gate covers visible spare-track primitives');

      console.log(`surfaceMarkupFleet: ${visiblePrimitiveCount} visible primitives across ${ALL_TANK_IDS.length} tanks remain rendered and Gallery-selectable`);
    },
  };
}
