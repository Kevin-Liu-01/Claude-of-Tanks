import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  FEATURED_IMAGES,
  FEATURED_SHOTS,
  TRANSITION_SHOTS,
  featuredShotForMap,
  nextFeaturedShot,
} from './featuredShots.js';
import { BOOT_HERO_SHOTS } from './bootScreen.js';
import { MAP_THUMBS } from './mapThumbs.js';

assert.equal(FEATURED_SHOTS.length, 10, 'the complete garage gallery stays available');
assert.equal(TRANSITION_SHOTS.length, 5, 'only the current owner-authored captures rotate');
assert.deepEqual(FEATURED_IMAGES, TRANSITION_SHOTS.map((shot) => shot.img));
assert.deepEqual(
  BOOT_HERO_SHOTS,
  TRANSITION_SHOTS,
  'the first percentage loading screen must use the current curated captures',
);
assert.equal(new Set(FEATURED_IMAGES).size, FEATURED_IMAGES.length, 'featured URLs must be unique');
assert.ok(FEATURED_IMAGES.every((img) => /\/f(?:[6-9]|[1-9]\d+)_studio_/.test(img)),
  'legacy marketing renders must not return to loading-screen rotation');

for (const shot of FEATURED_SHOTS) {
  assert.ok(shot.cap && shot.focal, `missing loading-screen metadata for ${shot.img}`);
  const asset = fileURLToPath(new URL(`../../public${shot.img}`, import.meta.url));
  assert.ok((await stat(asset)).size > 50_000, `featured capture is missing or undersized: ${shot.img}`);
}

assert.ok(TRANSITION_SHOTS.every((shot) => shot.maps?.length),
  'every transition capture must declare its battlefield coverage');

for (const mapId of Object.keys(MAP_THUMBS)) {
  const shot = featuredShotForMap(mapId);
  assert.ok(shot.maps.includes(mapId), `no curated loading capture for ${mapId}`);
}

assert.equal(
  featuredShotForMap('fjord').img,
  '/media/featured/f9_studio_fjord_firefight.webp',
  'the owner-authored fjord capture should headline Glacier Fjord',
);
assert.equal(
  featuredShotForMap('urban').img,
  '/media/featured/f10_studio_urban_crossfire.webp',
  'the latest owner-authored urban capture should headline Steinburg',
);

const cycleSize = TRANSITION_SHOTS.length;
const rotation = Array.from({ length: cycleSize * 2 }, () => nextFeaturedShot().img);
for (let i = 1; i < rotation.length; i++) {
  assert.notEqual(rotation[i], rotation[i - 1], 'curated rotation must not repeat immediately');
}
assert.equal(new Set(rotation.slice(0, cycleSize)).size, cycleSize,
  'each rotation cycle visits every capture');
assert.equal(new Set(rotation.slice(cycleSize)).size, cycleSize,
  'refilled rotation visits every capture');

await import('./imagePreload.selftest.mjs');
console.log('loading screen featured-capture selftest: PASS');
