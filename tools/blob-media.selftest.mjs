// blob-media.selftest.mjs — the site's large media stays on Vercel Blob (docs-refresh-279; Kevin 2026-11-26: "use a vercel
// blob for all this big media"). Copyright © 2026 Kevin B. Liu.
//   - the manifest (src/presentation/blobMedia.json) is staged, and every URL it has is https on the store's host at the
//     item's content-addressed pathname (tools/blob-media.mjs manifestProblems);
//   - no item's bytes are in the repository: no tracked file has an item's name, and the posters' folder holds stills only;
//   - each poster is in public/, a WebP of at most 100 KB (Main 2026-11-26);
//   - the CSP blocks no Blob host: it sets no default-src, media-src or img-src, or one that names the host;
//   - a page reads an item only once it has a URL on the store (blobMediaItem), and a loopback host only in a fixture.
// The docs index's use of it is src/docs/featureVideos.selftest.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestProblems } from './blob-media.mjs';
import { BLOB_MEDIA, blobMediaItem, isBlobMediaUrl } from '../src/presentation/blobMedia.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const items = Object.entries(BLOB_MEDIA.items);

assert.equal(BLOB_MEDIA.host, 'public.blob.vercel-storage.com', 'the committed manifest names the Blob store\'s public host');
assert.deepEqual(manifestProblems(BLOB_MEDIA), [], 'the manifest is staged and its URLs are content-addressed on the store');

// no media bytes in the repository (tools/selftest-scans.mjs: this lists the tracked files under public/)
const tracked = execFileSync('git', ['ls-files', '--', 'public'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).split('\n').filter(Boolean);
const names = new Set(items.flatMap(([, item]) => [item.file, item.pathname.split('/').pop()]));
assert.deepEqual(tracked.filter((path) => names.has(path.split('/').pop())), [], 'no Blob item is a tracked file');
const posterDirs = new Set(items.filter(([, item]) => item.poster).map(([, item]) => `public${dirname(item.poster)}/`));
assert.deepEqual(tracked.filter((path) => [...posterDirs].some((dir) => path.startsWith(dir)) && !path.endsWith('.webp')), [],
  'the posters\' folders hold stills only');

for (const [id, item] of items.filter(([, entry]) => entry.poster)) {
  const path = join(ROOT, 'public', item.poster);
  assert.ok(existsSync(path), `${id}: its poster ${item.poster} is in public/`);
  assert.ok(statSync(path).size <= 100 * 1024, `${id}: its poster is ${statSync(path).size} B, 100 KB at most`);
}

// the CSP: a fetch directive that governs media would have to name the store
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const policies = vercel.headers.flatMap((rule) => rule.headers).filter((header) => /content-security-policy/i.test(header.key)).map((header) => header.value);
assert.ok(policies.length > 0, 'vercel.json sends a CSP');
for (const policy of policies) {
  for (const directive of ['default-src', 'media-src', 'img-src', 'connect-src']) {
    const value = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${directive} `));
    assert.ok(!value || value.includes(BLOB_MEDIA.host), `the CSP's ${directive} lets the Blob host (${BLOB_MEDIA.host}) through`);
  }
}

// the rule for any item (the media lane adds stills, sounds and packs): a film needs its size, length and poster, a still
// its size, a sound its length, any item a type its extension names
const sha = 'a'.repeat(64);
const staged = (id, file, extra) => ({ file, pathname: `media/${id}-${sha.slice(0, 16)}${file.slice(file.lastIndexOf('.'))}`, url: null, bytes: 1, sha256: sha, ...extra });
const probe = (item) => manifestProblems({ host: BLOB_MEDIA.host, items: { x: item } });
assert.deepEqual(probe(staged('x', 'a.webp', { type: 'image/webp', width: 2, height: 2 })), [], 'a still with its size is ready');
assert.deepEqual(probe(staged('x', 'a.bin', { type: 'application/octet-stream' })), [], 'a data pack needs no size');
assert.deepEqual(probe(staged('x', 'a.ogg', { type: 'audio/ogg', durationS: 1 })), [], 'a sound with its length is ready');
assert.equal(probe(staged('x', 'a.mp4', { type: 'video/mp4', width: 2, height: 2, durationS: 1 })).length, 1, 'a film without a poster is not');
assert.equal(probe(staged('x', 'a.exe', { type: 'application/x-msdownload' })).length, 1, 'an extension with no type is refused');
assert.equal(probe({ ...staged('x', 'a.bin', { type: 'application/octet-stream' }), url: `https://s.${BLOB_MEDIA.host}/media/other.bin` }).length, 1,
  'a url must be the item\'s own pathname');

// the reader: no URL, or one off the store, is no item; a loopback URL passes only a fixture's manifest
const [firstId, firstItem] = items[0];
const withUrl = (url, host = BLOB_MEDIA.host) => ({ host, items: { [firstId]: { ...firstItem, url } } });
assert.equal(blobMediaItem(firstId, withUrl(null)), null, 'an item without a URL is not shown');
assert.equal(blobMediaItem(firstId, withUrl(`https://elsewhere.example/${firstItem.pathname}`)), null, 'a URL off the store is not shown');
assert.ok(blobMediaItem(firstId, withUrl(`https://s.${BLOB_MEDIA.host}/${firstItem.pathname}`)), 'a URL on the store is shown');
assert.equal(isBlobMediaUrl('http://127.0.0.1:1/a.mp4'), false, 'loopback http is not the store');
assert.ok(isBlobMediaUrl('http://127.0.0.1:1/a.mp4', '127.0.0.1'), 'a fixture manifest\'s loopback host passes');
const uploaded = items.filter(([id]) => blobMediaItem(id)).length;

console.log(`blob-media.selftest: ${items.length} items (${uploaded} uploaded), ${tracked.length} public files checked, CSP clear for ${BLOB_MEDIA.host}`);
