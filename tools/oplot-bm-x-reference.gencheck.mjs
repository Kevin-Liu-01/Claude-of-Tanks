// Release 262: the T-84BM Oplot-M's comparison oracle is registered once, source-only (source-x-oracle --prepare: the
// reviewed recipe [-x, y, -z], uniform 4.10, docs/references/tanks/bm_oplot_m.md), at the exemplar bar, whole-vehicle.
import assert from 'node:assert/strict';
import { OPLOT_BM_X_REFERENCE_OVERRIDES } from './oplot-bm-x-reference-overrides.ts';
import { SOURCE_WORLD_FRAMES } from './source-world-registration.mjs';

const override = OPLOT_BM_X_REFERENCE_OVERRIDES.bm_oplot_m;
const certificate = SOURCE_WORLD_FRAMES.bm_oplot_m;
assert.equal(override.source, 'glb');
assert.equal(override.qualityBar, 'exemplar');
assert.equal(override.glb.fixedMount, true);
assert.equal(override.glb.componentMasks, false);
assert.equal(override.glb.geometryComponentMasks, false);
assert.match(override.glb.path, /^\/models\/community-candidates\/bm_oplot_m_x_source\.glb$/);
assert.equal(certificate.sha256, 'd2adad43bba88a867f743aeeacf969587e7be0c2bbcaeee0259218f3145ab22a');
assert.equal(certificate.fused, true);
assert.deepEqual(certificate.turret, [-0.012, 1.4965, 0.185]);
assert.deepEqual(certificate.gun, [-0.012, 1.808, 1.518]);
assert.equal(OPLOT_BM_X_REFERENCE_OVERRIDES.bm_oplot_t, undefined, 'the Oplot-T is not certified against the Oplot-M oracle');
console.log('oplot-bm-x-reference: PASS');
