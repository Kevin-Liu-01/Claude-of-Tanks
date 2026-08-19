import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FEATURED_IMAGES, FEATURED_SHOTS, featuredShotForMap } from './featuredShots.js';
import { MAP_THUMBS } from './mapThumbs.js';

assert.equal(FEATURED_SHOTS.length, 9, 'all approved featured captures are registered');
assert.deepEqual(FEATURED_IMAGES, FEATURED_SHOTS.map((shot) => shot.img));
assert.equal(new Set(FEATURED_IMAGES).size, FEATURED_IMAGES.length, 'featured URLs must be unique');

for (const shot of FEATURED_SHOTS) {
  assert.ok(shot.cap && shot.focal, `missing loading-screen metadata for ${shot.img}`);
  const asset = fileURLToPath(new URL(`../../public${shot.img}`, import.meta.url));
  assert.ok((await stat(asset)).size > 50_000, `featured capture is missing or undersized: ${shot.img}`);
}

for (const mapId of Object.keys(MAP_THUMBS)) {
  const shot = featuredShotForMap(mapId);
  assert.ok(shot.maps.includes(mapId), `no curated loading capture for ${mapId}`);
}

assert.equal(
  featuredShotForMap('fjord').img,
  '/media/featured/f9_studio_fjord_firefight.webp',
  'the owner-authored fjord capture should headline Glacier Fjord',
);

console.log('loading screen featured-capture selftest: PASS');
