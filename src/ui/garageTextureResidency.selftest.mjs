// 2026-11-02 audit (05-ui-2 #4): the Garage packs' shared PBR surface sets (garageEnvironmentKit.ts). A set whose load
// failed used to stay resident image-less for the session (the nine-set cap equals the table, so it never evicted it);
// one pack's release removed the shared render listener for every other pack; a disposed library still loaded and
// cached. Review round 2: a set that failed while a pack held it was inherited image-less by every later pack (plaster
// and wood, held by every outdoor bake, never came back); now the next request reloads its missing images into the
// textures the holders draw with. A fake loader stands in for three's TextureLoader (it sets the image and moves the
// version, as three's does).
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
      const ok = () => {
        texture.image = { url };
        texture.needsUpdate = true;
        onLoad?.(texture);
      };
      requests.push({ url, texture, ok, fail: () => onError?.(new Error(`404 ${url}`)) });
      return texture;
    },
  };
}
const settle = (loader, ok) => { for (const request of loader.requests.splice(0)) (ok ? request.ok : request.fail)(); };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const PLASTER = ['/textures/garage/Plaster007_1K-JPG_Color.webp', '/textures/garage/Plaster007_1K-JPG_NormalGL.webp'];

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

// 5. (review round 2) A set that fails while a pack holds it is reloaded by the next pack that asks, into the textures
// the first pack draws with, so both heal; the new pack's ready waits for the reload.
{
  const loader = fakeLoader();
  const assets = createGarageEnvironmentAssetLibrary({}, { loader });
  let rendersX = 0;
  let rendersY = 0;
  const x = assets.acquire('plaster', () => { rendersX += 1; });
  settle(loader, false);
  await x.ready;
  assert.deepEqual(assets.diagnostics(), { residentSets: 1, referencedSets: 1, failedSets: 1 });
  assert.equal(x.color.version, 0, 'nothing arrived: nothing to upload');
  const y = assets.acquire('plaster', () => { rendersY += 1; });
  assert.deepEqual(loader.requests.map((request) => request.url), PLASTER, 'the next pack that asks issues a reload');
  assert.equal(y.color, x.color, 'into the colour texture the first pack holds');
  assert.equal(y.normal, x.normal, 'and its normal texture');
  assert.equal(assets.diagnostics().failedSets, 0, 'the set is loading again');
  let yReady = false;
  void y.ready.then(() => { yReady = true; });
  await flush();
  assert.equal(yReady, false, "the new pack's ready waits for the reload");
  const z = assets.acquire('plaster', () => {});
  assert.equal(loader.requests.length, 2, 'a reload in flight is not asked for twice');
  const rendersXBefore = rendersX;
  settle(loader, true);
  await y.ready;
  assert.equal(yReady || (await flush(), yReady), true);
  assert.deepEqual(x.color.image, { url: PLASTER[0] }, "the first pack's texture received its image");
  assert.deepEqual(x.normal.image, { url: PLASTER[1] });
  assert.ok(x.color.version > 0 && x.normal.version > 0, 'and three uploads it (its version moved)');
  assert.equal(rendersX - rendersXBefore, 2, 'the first pack redraws once per image');
  assert.equal(rendersY, 2, 'and so does the second');
  assert.deepEqual(assets.diagnostics(), { residentSets: 1, referencedSets: 1, failedSets: 0 });
  for (const handle of [x, y, z]) handle.release();
  assert.deepEqual(assets.diagnostics(), { residentSets: 1, referencedSets: 0, failedSets: 0 }, 'a healed set stays warm');
}

// 6. The reviewer's path: warmAll starts all nine loads, the first outdoor pack acquires plaster and wood at once, and
// their loads fail while it holds them. The next pack reloads only the images that did not arrive; a reload that fails
// again stays failed (held) and the request after it asks again.
{
  const loader = fakeLoader();
  const assets = createGarageEnvironmentAssetLibrary({}, { loader });
  assets.warmAll(() => {});
  const first = [assets.acquire('plaster', () => {}), assets.acquire('wood', () => {})];
  assert.equal(loader.requests.length, 18, 'warmAll asked for every image once');
  for (const request of loader.requests.splice(0)) {
    const lost = request.url.includes('Plaster007') || request.url.includes('Planks023A_1K-JPG_NormalGL');
    (lost ? request.fail : request.ok)();
  }
  await Promise.all(first.map((handle) => handle.ready));
  assert.deepEqual(assets.diagnostics(), { residentSets: 9, referencedSets: 2, failedSets: 2 },
    'the held failed sets stay with their pack');
  const second = [assets.acquire('plaster', () => {}), assets.acquire('wood', () => {})];
  assert.deepEqual(loader.requests.map((request) => request.url),
    [...PLASTER, '/textures/garage/Planks023A_1K-JPG_NormalGL.webp'], 'only the images that did not arrive');
  settle(loader, false);
  await Promise.all(second.map((handle) => handle.ready));
  assert.equal(assets.diagnostics().failedSets, 2, 'a reload that fails again leaves the held sets failed');
  const third = assets.acquire('wood', () => {});
  assert.equal(loader.requests.length, 1, 'and the next request asks again');
  settle(loader, true);
  await third.ready;
  assert.ok(first[1].normal.version > 0, "the first pack's wood normal heals in place");
  assert.equal(assets.diagnostics().failedSets, 1, 'plaster waits for its next request');
}

// 7. retryFailed (every selection runs it): a held failed set reloads without a new acquire; a loading or ready set is
// never asked for again; a failed set nothing holds already left.
{
  const loader = fakeLoader();
  const assets = createGarageEnvironmentAssetLibrary({}, { loader });
  const held = assets.acquire('roof', () => {});
  const fine = assets.acquire('cobble', () => {});
  for (const request of loader.requests.splice(0)) (request.url.includes('RoofingTiles') ? request.fail : request.ok)();
  await Promise.all([held.ready, fine.ready]);
  assets.retryFailed();
  assert.deepEqual(loader.requests.map((request) => request.url), [
    '/textures/garage/RoofingTiles012A_1K-JPG_Color.webp', '/textures/garage/RoofingTiles012A_1K-JPG_NormalGL.webp',
  ]);
  assets.retryFailed();
  assert.equal(loader.requests.length, 2, 'a reload in flight is not asked for twice');
  settle(loader, true);
  assets.retryFailed();
  assert.equal(loader.requests.length, 0, 'a ready set is never refetched');
  assert.ok(held.color.version > 0);
}

// 8. A library disposed during a reload writes nothing into the textures it already disposed.
{
  const loader = fakeLoader();
  const assets = createGarageEnvironmentAssetLibrary({}, { loader });
  const held = assets.acquire('snow', () => {});
  settle(loader, false);
  await held.ready;
  const later = assets.acquire('snow', () => {});
  assert.equal(loader.requests.length, 2);
  assets.dispose();
  settle(loader, true);
  await later.ready;
  assert.equal(held.color.version, 0, 'the disposed texture is left alone');
  assets.retryFailed();
  assert.equal(loader.requests.length, 0, 'a disposed library asks for nothing');
}

console.log('garageTextureResidency.selftest: failed sets leave or reload in place, per-handle listeners, disposed library inert PASS');
