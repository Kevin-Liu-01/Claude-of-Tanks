// tool-only-public-files.selftest.mjs — the build drops files only repository tools read (FE-P15), and nothing
// that runs in production requests them.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolOnlyPublicFiles } from './tool-only-public-files.mjs';
import { iconUrl } from '../src/ui/icons.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 1. The matcher on a fixture build output.
const dist = mkdtempSync(join(tmpdir(), 'cot-tool-only-'));
try {
  for (const file of ['icons/tank-assets.json', 'icons/m1a1_markings.png', 'icons/m1a1_angle.webp',
    'icons/m1a1_armor_side.png', 'icons/m1a1_side_silhouette.png', 'icons/thumbs/m1a1.webp', 'media/tank-assets.json']) {
    mkdirSync(dirname(join(dist, file)), { recursive: true });
    writeFileSync(join(dist, file), 'x'.repeat(file.length));
  }
  assert.deepEqual(toolOnlyPublicFiles(dist), [
    { path: 'icons/m1a1_markings.png', bytes: 'icons/m1a1_markings.png'.length },
    { path: 'icons/tank-assets.json', bytes: 'icons/tank-assets.json'.length },
  ], 'only the manifest and the marking sheets in icons/ are tool-only; every runtime icon ships');
  assert.deepEqual(toolOnlyPublicFiles(join(dist, 'missing')), [], 'a build without icons/ has nothing to drop');
} finally {
  rmSync(dist, { recursive: true, force: true });
}

// 2. Nothing in production requests them: no runtime source names them, the runtime icon URL builder cannot
//    produce a marking sheet, and the asset-file naming helpers stay tool-side.
const runtimeFiles = execFileSync('git', ['ls-files', 'src', 'site', 'api', 'cloudflare/rooms/src', 'cloudflare/telemetry/src',
  'middleware.ts', 'index.html', '404.html', 'vercel.json', 'public/site.webmanifest'], { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n')
  .filter((file) => /\.(?:ts|js|mjs|html|json|webmanifest|css)$/.test(file))
  .filter((file) => !/\.(?:selftest|test-support|browser\.selftest)\.mjs$|\.test\.ts$/.test(file));
assert.ok(runtimeFiles.length > 500, `runtime source census found only ${runtimeFiles.length} files`);
const naming = [];
for (const file of runtimeFiles) {
  const text = readFileSync(resolve(ROOT, file), 'utf8');
  if (/tank-assets(?:\.json)?\b|_markings\.png|markings\.png/.test(text)) naming.push(file);
}
assert.deepEqual(naming, [], 'runtime code must not name tool-only public files');
assert.match(iconUrl('m1a1', 'markings'), /_markings\.webp$/, 'iconUrl never builds a .png marking sheet URL');
const importers = runtimeFiles.filter((file) => file !== 'src/vehicles/tankAssets.ts' && file.endsWith('.ts')
  && /\b(?:tankAssetFile|requiredTankAssetFiles|TANK_ASSET_VIEWS)\b/.test(readFileSync(resolve(ROOT, file), 'utf8')));
assert.deepEqual(importers, [], 'asset-file naming (which includes the marking sheets) is a tool concern');

// 3. The sources stay where the tools write them; the build step deletes the copies.
assert.ok(existsSync(resolve(ROOT, 'public/icons/tank-assets.json')), 'tools read public/icons/tank-assets.json');
const strip = readFileSync(resolve(ROOT, 'tools/strip-nc-assets.mjs'), 'utf8');
assert.match(strip, /toolOnlyPublicFiles\(DIST\)/, 'npm run build drops the tool-only files from dist/');
assert.match(readFileSync(resolve(ROOT, 'package.json'), 'utf8'), /"build": "[^"]*node tools\/strip-nc-assets\.mjs"/);

console.log(`tool-only-public-files.selftest: ${runtimeFiles.length} runtime files name no tool-only file; the build drops them`);
