// featureVideos.selftest.mjs — the Field Manual index's feature videos (docs-refresh-279): a card per clip once it is
// uploaded to Vercel Blob, each loading nothing before it is played (preload="none", its poster deferred to docs.ts), and
// nothing at all while no clip is uploaded; the release cut says its release. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { BLOB_MEDIA, blobMediaItem } from '../presentation/blobMedia.ts';
import { FEATURE_VIDEOS, featureVideosMarkup } from './featureVideos.ts';

const items = Object.entries(BLOB_MEDIA.items);
for (const { id } of FEATURE_VIDEOS) assert.ok(BLOB_MEDIA.items[id]?.poster, `the manifest has the feature video ${id} with its poster`);

// the markup: nothing while no clip is uploaded; with every clip uploaded (a fixture), a card each that loads nothing early
const uploaded = items.filter(([id]) => blobMediaItem(id)).length;
const committed = featureVideosMarkup();
assert.equal(committed === '', uploaded === 0, 'the section shows only when a clip is uploaded');
assert.equal((committed.match(/<figure class="docs-video">/g) ?? []).length, FEATURE_VIDEOS.filter(({ id }) => blobMediaItem(id)).length,
  'one card per uploaded clip');
const fixture = { ...BLOB_MEDIA, items: Object.fromEntries(items.map(([id, item]) => [id, { ...item,
  url: `https://store.${BLOB_MEDIA.host}/${item.pathname}` }])) };
const all = featureVideosMarkup(fixture);
const videos = all.match(/<video\b[^>]*>/g) ?? [];
assert.equal(videos.length, FEATURE_VIDEOS.length, 'a card for every feature video once uploaded');
for (const tag of videos) {
  assert.match(tag, /preload="none"/, 'a film loads nothing before it is played');
  assert.match(tag, /data-poster="\/media\//, 'its poster waits in data-poster');
  assert.doesNotMatch(tag, /\sposter=|autoplay/, 'no eager poster and no autoplay');
}
assert.equal((all.match(/<source src="https:\/\/store\.public\.blob\.vercel-storage\.com\/media\//g) ?? []).length, FEATURE_VIDEOS.length,
  'every source is the store\'s');
// a dated clip says its release
assert.match(all, /data-i18n="docs\.videos\.release\.title" data-i18n-vars='\{"release":"\d+"\}'/, 'the release cut is labelled with its release');

console.log(`featureVideos.selftest: ${FEATURE_VIDEOS.length} clips, ${uploaded} uploaded; every card plays on a click`);
