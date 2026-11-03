import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VolumetricCloudLayer } from './volumetricClouds.ts';

// 2026-11-02 audit R3 (context restore): the cloud layer's three noise volumes are GPU-baked render targets with no CPU
// image. A restored context re-creates them empty, yet refreshLifetime only reset the history, so ensureVolumes() kept
// returning true and the layer marched empty volumes until a reload. And warmAsync's link callback baked the volumes
// and warmed even after dispose() (a GPU leak on a layer disposed mid-link). Pinned without a GPU on a real layer.

function texture() { return new THREE.Data3DTexture(new Uint8Array(4), 1, 1, 1); }

{
  // a renewed renderer lifetime drops the volumes, so the next frame bakes them on the new context
  const layer = new VolumetricCloudLayer({}, new THREE.Scene(), {}, new THREE.Vector3(1, 1, 1));
  const disposed = [];
  const volumes = { shape: texture(), detail: texture(), turbulence: texture(),
    targets: [{ dispose: () => disposed.push('shape') }, { dispose: () => disposed.push('detail') }] };
  const contextA = { isContextLost: () => false }, contextB = { isContextLost: () => false };
  const infoA = { render: {} }, infoB = { render: {} };
  const renderer = { getContext: () => contextA, info: infoA };
  Object.assign(layer, { renderer, volumes });
  layer.bindNoise();
  assert.equal(layer.medium.tShape.value, volumes.shape);
  const first = layer.refreshLifetime();
  assert.equal(layer.volumes, volumes, 'the first adoption keeps the volumes the warm baked');
  layer.refreshLifetime();
  assert.equal(layer.volumes, volumes, 'an unchanged lifetime keeps them');
  // three's restore replaces renderer.info (and the GL objects behind every render target)
  renderer.getContext = () => contextB;
  renderer.info = infoB;
  const renewed = layer.refreshLifetime();
  assert.equal(layer.volumes, null, 'the empty re-created volumes are dropped');
  assert.equal(first, true);
  assert.equal(renewed, false, 'a renewed lifetime draws nothing this frame');
  assert.deepEqual(disposed, ['shape', 'detail']);
  assert.equal(layer.medium.tShape.value, null, 'the medium no longer samples them');
  assert.equal(layer.refreshLifetime(), true);
  layer.dispose();
}

{
  // a layer disposed while its programs link bakes nothing and warms nothing when the link settles
  const layer = new VolumetricCloudLayer({}, new THREE.Scene(), {}, new THREE.Vector3(1, 1, 1));
  let finish = null;
  let draws = 0;
  const renderer = {
    xr: { enabled: false }, toneMapping: THREE.NoToneMapping,
    getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: () => { draws += 1; }, render: () => { draws += 1; },
    compileAsync: () => new Promise((resolve) => { finish = resolve; }),
  };
  let warms = 0;
  Object.defineProperty(layer, 'active', { get: () => true });
  Object.assign(layer, { renderer, syncTier: () => {}, warm: () => { warms += 1; } });
  const linked = layer.warmAsync();
  assert.ok(finish, 'the link is in flight');
  layer.dispose();
  const before = draws;
  finish();
  await linked;
  assert.equal(warms, 0, 'no warm after dispose');
  assert.equal(draws, before, 'no volume bake after dispose');
  assert.equal(layer.volumes, null);
}

console.log('volumetricCloudsLifetime selftest: a restored context re-bakes the noise volumes; no bake after dispose');
