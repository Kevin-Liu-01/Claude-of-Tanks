// The per-file immutable routes: only files that exist in the build output ever carry the
// year-long header, a missing path matches nothing, the deploy-89 style prefix rule is removed,
// the routes sit ahead of the filesystem handle, and the tool is idempotent (2026-09-25).
// 2026-10-01 (INFRA-P10 / FE-P17): the content-addressed collision manifests are immutable too and the runtime images,
// audio and fonts take max-age=3600 + stale-while-revalidate=86400 — per existing file, so a miss keeps max-age=0.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  IMMUTABLE_CACHE_CONTROL, RUNTIME_CACHE_CONTROL, applyCacheRoutes, applyImmutableRoutes, buildCacheRoutes, buildImmutableRoutes,
  cacheRoutePlan, isImmutableAssetRoute, isManagedCacheRoute, listCollisionManifests, listHashedAssets, listRuntimeFiles,
  uncoveredAssets, uncoveredFiles,
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
// The collision manifests (content-addressed beside an unhashed index) and the runtime directories.
const staticFiles = ['mp-collision/index.json', 'mp-collision/verdant.3700dca0d36b.json', 'mp-collision/titan_gorge.0123456789ab.json',
  'mp-collision/verdant@assault-trenches.0123456789ab.json',
  'mp-collision/notes.json', 'mp-collision/verdant.3700DCA0D36B.json', 'mp-collision/nested/deep.0123456789ab.json',
  'textures/terrain/Grass004_1K-JPG_Color.jpg', 'icons/m1a2_sepv3_angle.webp', 'icons/pt91_side_silhouette.png', 'icons/tank-assets.json',
  'fonts/ABCMonumentGrotesk-Bold.woff2', 'fonts/inter/Inter.woff2', 'fonts/inter/OFL.txt', 'audio/shot.ogg', 'minimaps/verdant.webp',
  'media/hero.mp4', 'brand/og-image.png'];
for (const file of staticFiles) {
  mkdirSync(dirname(join(output, 'static', file)), { recursive: true });
  writeFileSync(join(output, 'static', file), 'bytes');
}
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

  // The collision manifests: the hashed names only — not the index, not an unhashed or upper-case name, not a subdirectory.
  assert.deepEqual(listCollisionManifests(join(output, 'static')), ['titan_gorge.0123456789ab.json', 'verdant.3700dca0d36b.json',
    'verdant@assault-trenches.0123456789ab.json']);
  // The runtime files: images, audio and fonts at any depth of the six directories; their JSON and licence text stay out.
  const runtime = listRuntimeFiles(join(output, 'static'));
  assert.deepEqual(runtime, {
    textures: ['terrain/Grass004_1K-JPG_Color.jpg'], icons: ['m1a2_sepv3_angle.webp', 'pt91_side_silhouette.png'],
    fonts: ['ABCMonumentGrotesk-Bold.woff2', 'inter/Inter.woff2'], audio: ['shot.ogg'], maps: ['verdant-a1b2c3d4.png'],
    minimaps: ['verdant.webp'],
  });
  const plan = cacheRoutePlan(join(output, 'static'));
  const full = applyCacheRoutes(baseConfig, plan, 2);
  const managed = full.routes.filter(isManagedCacheRoute);
  const handleAt = full.routes.findIndex((route) => typeof route.handle === 'string');
  assert.equal(full.routes.slice(0, handleAt).filter(isManagedCacheRoute).length, managed.length, 'every family route sits ahead of the filesystem handle');
  assert.equal(full.routes.some((route) => route.src === '^/assets(?:/(.*))$'), false, 'the prefix rule stays removed');
  const cacheFor = (path) => {
    const hits = managed.filter((route) => new RegExp(route.src).test(path));
    assert.ok(hits.length <= 1, `${path} matches at most one family route`);
    return hits[0]?.headers['cache-control'] ?? null;
  };
  for (const route of managed) {
    assert.equal(route.continue, true);
    assert.equal(route.caseSensitive, true);
  }
  assert.equal(cacheFor('/mp-collision/verdant.3700dca0d36b.json'), IMMUTABLE_CACHE_CONTROL, 'a content-addressed manifest is immutable');
  assert.equal(cacheFor('/mp-collision/titan_gorge.0123456789ab.json'), IMMUTABLE_CACHE_CONTROL);
  assert.equal(cacheFor('/mp-collision/verdant@assault-trenches.0123456789ab.json'), IMMUTABLE_CACHE_CONTROL,
    'a battlefield variant\'s manifest is content-addressed too');
  for (const path of ['/mp-collision/index.json', '/mp-collision/notes.json', '/mp-collision/verdant.000000000000.json',
    '/mp-collision/verdant.3700DCA0D36B.json', '/mp-collision/nested/deep.0123456789ab.json']) {
    assert.equal(cacheFor(path), null, `${path} keeps Vercel's default (the index names the hashes; a miss must not stick)`);
  }
  for (const [dir, files] of Object.entries(runtime)) {
    for (const file of files) assert.equal(cacheFor(`/${dir}/${file}`), RUNTIME_CACHE_CONTROL, `/${dir}/${file} takes the moderate TTL`);
  }
  for (const path of ['/icons/missing_angle.webp', '/ICONS/m1a2_sepv3_angle.webp', '/icons/tank-assets.json', '/fonts/inter/OFL.txt',
    '/media/hero.mp4', '/brand/og-image.png', '/textures/terrain/Grass004_1K-JPG_Color.jpg.bak', '/maps/verdant.webp']) {
    assert.equal(cacheFor(path), null, `${path} is not an existing runtime file and keeps max-age=0`);
  }
  assert.deepEqual(uncoveredFiles(full, plan), [], 'the check finds every family file covered');
  const withoutMaps = { ...full, routes: full.routes.filter((route) => !route.src?.startsWith('^/maps/')) };
  assert.deepEqual(uncoveredFiles(withoutMaps, plan), ['/maps/verdant-a1b2c3d4.png'], 'a missing family route is reported');
  assert.deepEqual(applyCacheRoutes(full, plan, 2), full, 'reapplying the plan changes nothing');
  // Long names: each route stays under the source limit however the files are grouped.
  const long = Array.from({ length: 300 }, (_, index) => `tank_${String(index).padStart(3, '0')}_${'x'.repeat(48)}_angle.webp`);
  const longRoutes = buildCacheRoutes('icons', long, RUNTIME_CACHE_CONTROL, 40);
  assert.ok(longRoutes.every((route) => route.src.length <= 3000), 'every route src stays under 3,000 characters');
  assert.equal(longRoutes.reduce((sum, route) => sum + route.src.split('|').length, 0), long.length, 'no name is lost to the length cap');

  // The CLI: writes the config, is idempotent, and --check passes afterwards and fails before.
  const tool = new URL('./vercel-output-immutable.mjs', import.meta.url).pathname;
  writeFileSync(join(output, 'config.json'), JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }] }));
  assert.throws(() => execFileSync(process.execPath, [tool, `--output=${output}`, '--check'], { stdio: 'pipe' }), 'without routes --check exits non-zero');
  const first = execFileSync(process.execPath, [tool, `--output=${output}`, '--group=40'], { encoding: 'utf8' });
  assert.match(first, /5 hashed files under \/assets → 1 immutable routes; 3 collision manifests → 1 immutable routes; 8 runtime files in textures, icons, fonts, audio, maps, minimaps → 6 routes/);
  const once = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8'));
  execFileSync(process.execPath, [tool, `--output=${output}`, '--group=40'], { encoding: 'utf8' });
  const twice = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8'));
  assert.deepEqual(twice, once, 'running the tool again changes nothing');
  assert.equal(twice.routes.filter(isImmutableAssetRoute).length, 1);
  assert.equal(twice.routes.filter(isManagedCacheRoute).length, 8, 'assets + collision + six runtime directories');
  assert.equal(twice.routes[twice.routes.length - 1].handle, 'filesystem');
  assert.match(execFileSync(process.execPath, [tool, `--output=${output}`, '--check'], { encoding: 'utf8' }), /every one of the 16 files is covered/);
  // --check covers the new families: drop the collision route and it fails.
  writeFileSync(join(output, 'config.json'), JSON.stringify({ ...twice, routes: twice.routes.filter((route) => !route.src?.startsWith('^/mp-collision/')) }));
  assert.throws(() => execFileSync(process.execPath, [tool, `--output=${output}`, '--check'], { stdio: 'pipe' }), 'an uncovered collision manifest fails --check');
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('vercel-output-immutable.selftest: hashed-only listing, per-file routes ahead of the filesystem handle, no match for a miss, idempotent CLI and --check pass; collision manifests immutable, runtime media one hour + a day stale, misses and the index default');
