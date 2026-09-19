import assert from 'node:assert/strict';
import { ARES_APC_X_REFERENCE_OVERRIDES } from './ares-apc-x-reference-overrides.ts';
import { SOURCE_WORLD_FRAMES } from './source-world-registration.mjs';

const override = ARES_APC_X_REFERENCE_OVERRIDES.ares_apc_x;
const certificate = SOURCE_WORLD_FRAMES.ares_apc_x;
assert.equal(override.source, 'glb');
assert.equal(override.qualityBar, 'exemplar');
assert.equal(override.glb.fixedMount, true);
assert.equal(override.glb.componentMasks, false);
assert.equal(override.glb.geometryComponentMasks, false);
assert.match(override.glb.path, /^\/models\/community-candidates\//);
assert.equal(certificate.sha256, 'f43fce5b07bcd04f6089aa23338ed3c4114ff75866eec0ce98e1800171891ff1');
assert.equal(certificate.fused, true);
assert.deepEqual(certificate.turret, [-0.3835, 2.2502, 0.5027]);
assert.deepEqual(certificate.gun, [-0.4265, 3.078, 0.397]);
console.log('ares-apc-x-reference: PASS');
