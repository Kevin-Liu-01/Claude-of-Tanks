import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { MAP_IDS } from '../src/world/maps/catalog.ts';
import { MAP_ART_VIEWS, preflightMapArt, requireNative4kPng, requireRequestedViews,
  requireNativeCapture, requireMinimapCapture } from './map-art-guards.mjs';

assert.deepEqual(Object.keys(MAP_ART_VIEWS), MAP_IDS);
assert.equal(MAP_IDS.length, 30);
assert.throws(() => requireRequestedViews(['battlefield'], ['typo']), /requested screenshot/);
assert.throws(() => requireRequestedViews(['battlefield'], ['battlefield', 'battlefield']), /requested screenshot/);
assert.deepEqual(requireRequestedViews(['one', 'two'], ['two', 'one']), ['two', 'one']);
const native = { canvas: [3840, 2160], renderScale: '1.000', dynScale: '1.000' };
requireNativeCapture({ canvas: [1600, 900], renderScale: '0.8' }, 1280, 720, 2, 0.8);
requireNativeCapture(native, 3840, 2160, 1, 1);
assert.throws(() => requireNativeCapture({ ...native, renderScale: '0.8' }, 3840, 2160, 1, 1), /native 4K/);
assert.throws(() => requireNativeCapture(native, 3840, 2160, 1, null), /native 4K/);
assert.throws(() => requireNativeCapture({ ...native, canvas: [1920, 1080] }, 3840, 2160, 1, 1), /canvas/);
const result = { mapId: 'polders', capture: { source: 'scene', width: 440, height: 440 }, dataUrl: 'data:image/webp;base64,' + 'A'.repeat(100) };
requireMinimapCapture(result, 'polders');
assert.throws(() => requireMinimapCapture({ ...result, capture: { ...result.capture, source: 'procedural' } }, 'polders'), /verified textured/);
assert.throws(() => requireMinimapCapture(result, 'mangrove'), /verified textured/);

const fixture = mkdtempSync(join(tmpdir(), 'cot-map-art-guards-'));
try {
  const shots = join(fixture, 'shots');
  mkdirSync(shots);
  const pngHeader = (width, height) => {
    const bytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12);
    bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
    return bytes;
  };
  for (const view of Object.values(MAP_ART_VIEWS)) writeFileSync(join(shots, `${view}.png`), pngHeader(3840, 2160));
  preflightMapArt({ shotsDir: shots, rootDir: fixture });
  assert.throws(() => preflightMapArt({ only: ['bogus'], shotsDir: shots, rootDir: fixture }), /unknown/);
  assert.throws(() => preflightMapArt({ only: ['verdant'], shotsDir: shots, rootDir: fixture }), /preserved/);
  const last = join(shots, 'battlefield_reservoir.png');
  writeFileSync(last, pngHeader(1440, 900));
  assert.throws(() => requireNative4kPng(last), /no upscaling/);
  // The actual generator must reject a bad LAST input before making any output
  // directory or calling the encoder for an earlier valid input.
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./map-thumbs.mjs', import.meta.url)), '--shots-dir', shots],
    { cwd: fixture, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /no upscaling/);
  assert.equal(existsSync(join(fixture, 'public')), false, 'failed batch does not write earlier assets');
  writeFileSync(last, Buffer.from('not a PNG'));
  assert.throws(() => requireNative4kPng(last), /invalid PNG/);
} finally { rmSync(fixture, { recursive: true, force: true }); }
console.log('map-art-guards.selftest: all30 views, native4K, strict minimaps, and no partial writes on preflight failure passed');
