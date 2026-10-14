// Fast Node-only check (no browser) of the published Garage environment pictures written by
// tools/marketing-shots/capture-garage-environments.mjs: the three WebPs the field manual shows exist at
// 1280x577 (read from the WebP header) and match manifest.json's sha256 and byte counts.
// Usage: node tools/marketing-shots/capture-garage-environments.selftest.mjs [--dir=<captured output dir>]

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GARAGE_VARIANTS } from '../../src/game/garageVariants.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const dirArgument = process.argv.slice(2).find((argument) => argument.startsWith('--dir='));
const dir = dirArgument ? resolve(dirArgument.slice('--dir='.length)) : join(ROOT, 'public/media/garage-environments-r2');
const NAMES = ['verdant-workshop-floor', 'abrams-service-bay', 'burlak-service-bay'];
const WIDTH = 1280;
const HEIGHT = 577;

/** WebP canvas size from the RIFF container (VP8, VP8L or VP8X). */
function webpSize(buffer) {
  assert.ok(buffer.length >= 30, 'WebP file is truncated');
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF', 'WebP RIFF signature');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP', 'WebP form type');
  assert.equal(buffer.readUInt32LE(4) + 8, buffer.length, 'RIFF size matches the file');
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    assert.deepEqual([buffer[23], buffer[24], buffer[25]], [0x9d, 0x01, 0x2a], 'VP8 start code');
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  throw new assert.AssertionError({ message: `unknown WebP chunk ${chunk}` });
}

const manifestPath = join(dir, 'manifest.json');
assert.ok(existsSync(manifestPath), `${manifestPath} is missing (run the capture tool)`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.tool, 'tools/marketing-shots/capture-garage-environments.mjs', 'manifest names its tool');
assert.ok(Array.isArray(manifest.files), 'manifest lists its files');
assert.deepEqual(manifest.files.map((entry) => entry.file), NAMES.map((name) => `${name}.webp`),
  'manifest lists exactly the three published views, in page order');

const variantIds = new Set(GARAGE_VARIANTS.map((variant) => variant.id));
const digests = new Set();
for (const entry of manifest.files) {
  const path = join(dir, entry.file);
  assert.ok(existsSync(path), `${entry.file} exists`);
  const bytes = readFileSync(path);
  const size = webpSize(bytes);
  assert.deepEqual(size, { width: WIDTH, height: HEIGHT }, `${entry.file} is ${WIDTH}x${HEIGHT}`);
  assert.equal(entry.width, WIDTH, `${entry.file} manifest width`);
  assert.equal(entry.height, HEIGHT, `${entry.file} manifest height`);
  assert.equal(entry.bytes, bytes.length, `${entry.file} byte count matches the manifest`);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(entry.sha256, digest, `${entry.file} sha256 matches the manifest`);
  digests.add(digest);
  assert.equal(entry.view, entry.file.replace(/\.webp$/, ''), `${entry.file} records its view`);
  assert.ok(variantIds.has(entry.variant), `${entry.file} records a current Garage variant (${entry.variant})`);
  assert.ok(Array.isArray(entry.camera?.position) && entry.camera.position.length === 3
    && Array.isArray(entry.camera?.target) && entry.camera.target.length === 3
    && entry.camera.fovDeg > 0, `${entry.file} records its camera`);
}
assert.equal(digests.size, NAMES.length, 'the three pictures are distinct images');

// The pages that show the pictures still reference the published names.
for (const page of ['site/docs.html', 'docs/GARAGE-ENVIRONMENTS.md']) {
  const text = readFileSync(join(ROOT, page), 'utf8');
  for (const name of NAMES) {
    assert.ok(text.includes(`garage-environments-r2/${name}.webp`), `${page} shows ${name}.webp`);
  }
}

console.log(`capture-garage-environments selftest: ok (${NAMES.length} pictures at ${WIDTH}x${HEIGHT} in ${dir})`);
