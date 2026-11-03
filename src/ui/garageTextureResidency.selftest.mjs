// 2026-11-02 audit (05-ui-2 #4): the Garage packs' shared PBR surface sets (garageEnvironmentKit.ts). A set whose load
// failed used to stay resident image-less for the session (the nine-set cap equals the table, so it never evicted it);
// one pack's release removed the shared render listener for every other pack; a disposed library still loaded and
// cached. A fake loader stands in for three's TextureLoader.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGarageEnvironmentAssetLibrary } from './garageEnvironmentKit.ts';

function fakeLoader() {
  const requests = [];
  return {
    requests,
    load(url, onLoad, _onProgress, onError) {
      const texture = new THREE.Texture();
      texture.name = url;
      requests.push({ url, texture, ok: () => onLoad?.(texture), fail: () => onError?.(new Error(`404 ${url}`)) });
      return texture;
    },
  };
}
const settle = (loader, ok) => { for (const request of loader.requests.splice(0)) (ok ? request.ok : request.fail)(); };

// 1. A failed set leaves as soon as nothing holds it, and the next acquire loads it again.
{
  const loader = fakeLoader();
  const assets = createGarageEnvironmentAssetLibrary({}, { loader });
  const handle = assets.acquire('rock', () => {});
  assert.equal(loader.requests.length, 2, 'colour and normal');
  settle(loader, false);
  await handle.ready;
  assert.deepEqual(assets.diagnostics(), { residentSets: 1, referencedSets: 1, failedSets: 1 },
    'a held set that failed stays while its pack holds it');
  handle.release();
  assert.deepEqual(assets.diagnostics(), { residentSets: 0, referencedSets: 0, failedSets: 0 }, 'and leaves at its release');
  const again = assets.acquire('rock', () => {});
  assert.equal(loader.requests.length, 2, 'the next pack asks for it again');
  settle(loader, true);
  await again.ready;
  assert.deepEqual(assets.diagnostics(), { residentSets: 1, referencedSets: 1, failedSets: 0 });
  again.release();
  assert.equal(assets.diagnostics().residentSets, 1, 'a loaded set stays warm');
}

// 2. warmAll's prefetch (acquire then release at once) that fails leaves at the failure.
{
  const loader = fakeLoader();
  const assets = createGarageEnvironmentAssetLibrary({}, { loader });
  assets.warmAll(() => {});
  assert.equal(assets.diagnostics().residentSets, 9);
  const brick = loader.requests.filter((request) => request.url.includes('Bricks097'));
  assert.equal(brick.length, 2);
  for (const request of loader.requests.splice(0)) (request.url.includes('Bricks097') ? request.fail : request.ok)();
  assert.deepEqual(assets.diagnostics(), { residentSets: 8, referencedSets: 0, failedSets: 0 }, 'the failed set left; the rest stay');
  assets.acquire('brick', () => {});
  assert.equal(loader.requests.length, 2, 'the pack that wants it loads it again');
}

// 3. Every handle keeps its own render listener: one pack's release leaves the other's.
{
  const loader = fakeLoader();
  const assets = createGarageEnvironmentAssetLibrary({}, { loader });
  let renders = 0;
  const requestRender = () => { renders += 1; };
  const first = assets.acquire('grass', requestRender);
  const second = assets.acquire('grass', requestRender);
  first.release();
  settle(loader, true);
  assert.equal(renders, 2, 'the pack still holding the set is told when each texture lands');
  second.release();
}

// 4. A disposed library lends nothing and loads nothing.
{
  const loader = fakeLoader();
  const assets = createGarageEnvironmentAssetLibrary({}, { loader });
  assets.dispose();
  const late = assets.acquire('wood', () => {});
  assert.equal(late.color, null);
  assert.equal(loader.requests.length, 0);
  await late.ready;
  late.release();
  assert.deepEqual(assets.diagnostics(), { residentSets: 0, referencedSets: 0, failedSets: 0 });
}

console.log('garageTextureResidency.selftest: failed sets leave and reload, per-handle listeners, disposed library inert PASS');
