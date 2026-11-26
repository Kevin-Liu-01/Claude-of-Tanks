import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mediaBytes } from '../media-files.mjs';

const manifest = JSON.parse(readFileSync('public/media/feature-evidence-r2/manifest.json', 'utf8'));
assert.equal(manifest.libraryId, 'claude-of-tanks-feature-evidence-r2');
assert.equal(manifest.images.length, 6);
assert.equal(manifest.qualityGate.failed, 0);
for (const image of manifest.images) {
  assert.equal(image.width, 3840);
  assert.equal(image.height, 2160);
  // (media-blob-279) a 4K capture is big media on Vercel Blob; tools/media-files.mjs reads its bytes from either place
  assert.ok(mediaBytes(image.path) > 200_000, `${image.path} is present and substantial`);
}
console.log('feature-evidence.selftest: six native 4K production captures pass');
