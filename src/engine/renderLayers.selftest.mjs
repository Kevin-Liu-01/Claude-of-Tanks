import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SHADOW_ONLY_LAYER,
  markShadowOnly,
  routeShadowOnlyLayer,
} from './renderLayers.ts';

const proxy = markShadowOnly(new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ colorWrite: false }),
));
const presentationCamera = new THREE.PerspectiveCamera();
let maskInsideShadowRender = 0;
const renderer = {
  shadowMap: {
    render(_lights, _scene, camera) { maskInsideShadowRender = camera.layers.mask; },
  },
};
routeShadowOnlyLayer(renderer);
routeShadowOnlyLayer(renderer);
const presentationMask = presentationCamera.layers.mask;
renderer.shadowMap.render([], new THREE.Scene(), presentationCamera);

assert.equal(SHADOW_ONLY_LAYER, 29, 'shadow proxies stay clear of late FX layer 30');
assert.equal(proxy.layers.test(presentationCamera.layers), false,
  'presentation cameras never submit invisible proxy geometry');
assert.notEqual(maskInsideShadowRender & (1 << SHADOW_ONLY_LAYER), 0,
  'native shadow traversal sees authored proxy casters');
assert.equal(presentationCamera.layers.mask, presentationMask,
  'the exact presentation mask is restored before forward rendering');
assert.equal(proxy.userData.shadowOnly, true, 'debug/audit semantics remain explicit');

proxy.geometry.dispose();
proxy.material.dispose();
console.log('renderLayers.selftest: shadow-only proxy routing passed');
