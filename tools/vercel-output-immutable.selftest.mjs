// The per-file immutable routes: only files that exist in the build output ever carry the
// year-long header, a missing path matches nothing, the deploy-89 style prefix rule is removed,
// the routes sit ahead of the filesystem handle, and the tool is idempotent (2026-09-25).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  IMMUTABLE_CACHE_CONTROL, applyImmutableRoutes, buildImmutableRoutes, isImmutableAssetRoute, listHashedAssets, uncoveredAssets,
} from './vercel-output-immutable.mjs';

const root = mkdtempSync(join(tmpdir(), 'cot-vercel-output-'));
const output = join(root, 'output');
const hashed = ['main-BH4OBsnX.js', 'index-abc12345.css', 'tankThumbs-w0SiTs32.js', 'nested/part-Zz9_-Ab1.js', 'type90X-k2BRO2jE.js'];
const unhashed = ['readme.txt', 'plate.png', 'main-short.js', 'index-abcdefghi.css'];
for (const file of [...hashed, ...unhashed]) {
  mkdirSync(join(output, 'static', 'assets', file.includes('/') ? file.split('/')[0] : ''), { recursive: true });
  writeFileSync(join(output, 'static', 'assets', file), '/* bytes */');
}
mkdirSync(join(output, 'static', 'maps'), { recursive: true });
writeFileSync(join(output, 'static', 'maps', 'verdant-a1b2c3d4.png'), 'png');
const baseConfig = {
  version: 3,
  routes: [
    { src: '^/surface-studio$', headers: { Location: '/gallery?layer=markup' }, status: 308 },
    { src: '^/assets(?:/(.*))$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '^/gallery$', headers: { 'Cache-Control': 'private, no-store, max-age=0' }, continue: true },
    { handle: 'filesystem' },
    { src: '^/api/(.*)$', dest: '/api/$1' },
    { handle: 'miss' },
  ],
};
writeFileSync(join(output, 'config.json'), JSON.stringify(baseConfig));

try {
  const files = listHashedAssets(join(output, 'static'));
  assert.deepEqual(files, [...hashed].sort(), 'only Vite-hashed files under static/assets are listed (maps and unhashed names are not)');

  const applied = applyImmutableRoutes(baseConfig, files, 2);
  const immutable = applied.routes.filter(isImmutableAssetRoute);
  assert.equal(immutable.length, 3, 'groups of two over five files make three routes');
  assert.equal(applied.routes.some((route) => route.src === '^/assets(?:/(.*))$'), false, 'the prefix rule that cached 404s is removed');
  const firstHandle = applied.routes.findIndex((route) => typeof route.handle === 'string');
  assert.ok(applied.routes.slice(0, firstHandle).filter(isImmutableAssetRoute).length === 3, 'every immutable route sits ahead of the filesystem handle');
  assert.equal(applied.routes[0].src, '^/surface-studio$', 'the redirects before them keep their place');
  for (const route of immutable) {
    assert.equal(route.continue, true);
    assert.equal(route.caseSensitive, true, 'odd-case paths never earn the header');
    assert.equal(route.headers['cache-control'], IMMUTABLE_CACHE_CONTROL);
  }
  const patterns = immutable.map((route) => new RegExp(route.src));
  for (const file of hashed) {
    assert.equal(patterns.filter((re) => re.test(`/assets/${file}`)).length, 1, `${file} matches exactly one route`);
  }
  for (const path of ['/assets/main-DEADBEEF.js', '/assets/main-BH4OBsnX.js.map', '/assets/MAIN-BH4OBSNX.js', '/assets/readme.txt', '/maps/verdant-a1b2c3d4.png', '/assets/main-BH4OBsnXXjs']) {
    assert.equal(patterns.some((re) => re.test(path)), false, `${path} matches no immutable route`);
  }
  assert.deepEqual(uncoveredAssets(applied, files), [], 'the check finds every file covered');
  assert.deepEqual(uncoveredAssets(baseConfig, files).length, 0, 'the old prefix rule also counts as coverage (so --check reports the state, not the shape)');
  assert.equal(buildImmutableRoutes([], 40).length, 0);

  // The CLI: writes the config, is idempotent, and --check passes afterwards and fails before.
  const tool = new URL('./vercel-output-immutable.mjs', import.meta.url).pathname;
  writeFileSync(join(output, 'config.json'), JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }] }));
  assert.throws(() => execFileSync(process.execPath, [tool, `--output=${output}`, '--check'], { stdio: 'pipe' }), 'without routes --check exits non-zero');
  const first = execFileSync(process.execPath, [tool, `--output=${output}`, '--group=40'], { encoding: 'utf8' });
  assert.match(first, /5 hashed files under \/assets → 1 immutable routes/);
  const once = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8'));
  execFileSync(process.execPath, [tool, `--output=${output}`, '--group=40'], { encoding: 'utf8' });
  const twice = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8'));
  assert.deepEqual(twice, once, 'running the tool again changes nothing');
  assert.equal(twice.routes.filter(isImmutableAssetRoute).length, 1);
  assert.equal(twice.routes[twice.routes.length - 1].handle, 'filesystem');
  assert.match(execFileSync(process.execPath, [tool, `--output=${output}`, '--check'], { encoding: 'utf8' }), /every one of the 5 hashed files is covered/);
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('vercel-output-immutable.selftest: hashed-only listing, per-file routes ahead of the filesystem handle, no match for a miss, idempotent CLI and --check pass');
