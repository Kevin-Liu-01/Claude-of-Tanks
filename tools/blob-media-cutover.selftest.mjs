// blob-media-cutover.selftest.mjs — the site's big media is on Vercel Blob, all of it, and only there (media-blob-279; Kevin
// 2026-11-26: "move all the big media to blob too"; Main's rulings the same day). Copyright © 2026 Kevin B. Liu.
//   (a) no tracked file under public/media is big media (tools/blob-media.mjs isBigMedia: every film, and any other file of
//       256 KB or more but a JSON manifest): a big file lives in the staging folder and the manifest, never in git;
//   (b) every path item of the manifest (src/presentation/blobMedia.json) is referenced: by its old /media/ path in a
//       page, the code or a runtime JSON file, or as a member of a run-time family (blobMediaFamily.ts); and every
//       /media/ file a page, the code or a runtime JSON names ships, from public/media or as a path item;
//   (c) the family maps agree with the manifest (tools/blob-media.mjs families --check);
//   (d) the build's rewrite (rewriteDist) on a fixture dist: a moved path becomes its URL, the site's own absolute link
//       too, a small file and another origin's path stay; it refuses a moved file without a URL, a moved file left in
//       dist, a /media/ path that names nothing, a path built from a folder of moved files outside a family, and a chunk
//       that carries the manifest;
//   and controls: a deleted public file with no row, a big file committed, a row nothing references, and a family map
//   off the manifest each make the matching check fail.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { familyBlobUrl } from '../src/presentation/blobMediaFamily.ts';
import { sitePathOf } from '../src/presentation/blobMediaPath.ts';
import { stillPathOf, stillRungs } from '../src/presentation/responsivePicture.ts';
import {
  BIG_BYTES, RUNTIME_FAMILIES, familyMaps, familyProblems, idForPath, isBigMedia, manifestProblems, mediaPaths, pathIndex, pathnameForPath,
  readManifest, rewriteDist,
} from './blob-media.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readManifest();
const index = pathIndex(manifest);
assert.deepEqual(manifestProblems(manifest), [], 'the manifest is staged');

// (a) the tracked tree (tools/selftest-scans.mjs: this lists the tracked files under public/media with their sizes)
const tracked = execFileSync('git', ['ls-files', '-z', '--format=%(objectsize)\t%(path)', '--', 'public/media'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean).map((line) => {
  const tab = line.indexOf('\t');
  return { bytes: Number(line.slice(0, tab)), path: line.slice(tab + 1) };
});
const bigInGit = (files) => files.filter((file) => isBigMedia(file.path, file.bytes)).map((file) => file.path);
assert.ok(tracked.length > 1000, `the scan read ${tracked.length} tracked media files`);
assert.deepEqual(bigInGit(tracked), [], 'no big media file is tracked under public/media (node tools/blob-media.mjs adopt --sweep)');
assert.deepEqual(bigInGit([{ path: 'public/media/x/a.webm', bytes: 10 }, { path: 'public/media/x/b.webp', bytes: BIG_BYTES }]),
  ['public/media/x/a.webm', 'public/media/x/b.webp'], 'control: a film of any size, and a still at the threshold, is big');
assert.deepEqual(bigInGit([{ path: 'public/media/x/m.json', bytes: 4 * BIG_BYTES }, { path: 'public/media/x/c.webp', bytes: BIG_BYTES - 1 }]), [],
  'a JSON manifest and a still under the threshold stay in the repository');

// (b) the references: the pages, the code and the runtime JSON the pages fetch (tools/selftest-scans.mjs)
const SOURCES = /\.(?:html|ts|css|json|mjs)$/;
const REGISTER = new Set(['src/presentation/blobMedia.json']);
const sourceFiles = execFileSync('git', ['ls-files', '-z', '--', 'site', 'src', 'index.html', '404.html', 'public/media', 'public/*.css'],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter((file) => SOURCES.test(file)
  && !/\.(?:selftest|test-support)\.mjs$/.test(file) && !REGISTER.has(file) && !file.startsWith('src/presentation/blobMediaFamilies/')
  && (!file.startsWith('public/') || extname(file) === '.json'));
const referencesIn = (files, read) => {
  const found = new Map();
  for (const file of files) {
    const text = read(file);
    if (!text.includes('media/')) continue;
    for (const hit of mediaPaths(text)) if (hit.full) found.set(hit.path, [...(found.get(hit.path) ?? []), file]);
  }
  return found;
};
const references = referencesIn(sourceFiles, (file) => readFileSync(join(ROOT, file), 'utf8'));
const publicMedia = new Set(tracked.map((file) => `/${file.path.slice('public/'.length)}`));
const families = Object.values(RUNTIME_FAMILIES);
// Moved files no page shows are retired, not kept (Main 2026-11-26: the nine the cutover found were dropped and deleted;
// git history keeps them): the ledger stays empty, so a future unserved row fails here
const UNSERVED = new Map();
/** Rows no page, code or runtime JSON names, no run-time family builds and the ledger does not name. */
const unreferenced = (items, refs) => [...items.keys()].filter((path) => !refs.has(path) && !families.some((prefix) => path.startsWith(prefix))
  && !UNSERVED.has(path));
/** /media/ files a source names that ship from neither public/media nor Blob. */
const dangling = (refs, items, local) => [...refs].filter(([path]) => !local.has(path) && !items.has(path)).map(([path, files]) => `${path} (${files[0]})`);
assert.ok(references.size > 500, `the scan found ${references.size} media references`);
assert.deepEqual(unreferenced(index, references), [], 'every Blob path item is referenced by a page, the code, a runtime JSON or a family');
assert.deepEqual([...UNSERVED.keys()].filter((path) => !index.has(path) || references.has(path)), [], 'the unserved ledger names only unserved rows');
assert.deepEqual(dangling(references, index, publicMedia), [], 'every /media/ file a source names ships from public/media or Blob');
// controls: a public file deleted with no row, and a row nothing names
const someMoved = [...references.keys()].find((path) => index.has(path) && !families.some((prefix) => path.startsWith(prefix)));
const withoutRow = new Map(index);
withoutRow.delete(someMoved);
assert.equal(dangling(references, withoutRow, publicMedia).length, 1, `control: ${someMoved} deleted from public/ with no Blob row fails`);
const someSmall = [...references.keys()].find((path) => publicMedia.has(path));
const lessPublic = new Set(publicMedia);
lessPublic.delete(someSmall);
assert.equal(dangling(references, index, lessPublic).length, 1, `control: ${someSmall} deleted from public/media fails`);
const stray = new Map(index).set('/media/nowhere-r1/stray.webm', { path: '/media/nowhere-r1/stray.webm' });
assert.deepEqual(unreferenced(stray, references), ['/media/nowhere-r1/stray.webm'], 'control: a row nothing references fails');

// (c) the family maps
assert.deepEqual(familyProblems(manifest), [], 'the family maps agree with the manifest (node tools/blob-media.mjs families --write)');
const familyBytes = Object.keys(RUNTIME_FAMILIES).reduce((sum, name) => sum + statSync(join(ROOT, `src/presentation/blobMediaFamilies/${name}.json`)).size, 0);
assert.ok(familyBytes <= 24 * 1024, `the family maps are ${familyBytes} B, at most 24 KB (Main 2026-11-26: about 20 KB raw)`);

// every path item's URL reads back as its path (sitePathOf), and a family builds that URL (familyBlobUrl)
const origin = 'https://s.public.blob.vercel-storage.com';
assert.deepEqual([...index.values()].filter((row) => sitePathOf(`${origin}/${row.pathname}`) !== row.path).map((row) => row.path), [],
  'a Blob URL gives its old path back, so a page reads a path\'s shape from it');
for (const url of [`${origin}/media/site50-r14/stills/a-0123456789abcdef.webp`, '/media/x/a.webp', 'https://x.example/media/a.webp']) {
  assert.equal(stillPathOf(url), sitePathOf(url), `responsivePicture's copy reads ${url} as blobMediaPath does`);
}
assert.deepEqual(stillRungs(`${origin}/media/site50-r14/stills/a-0123456789abcdef.webp`).map((rung) => rung.src),
  ['/media/site50-r14/stills/a-thumb.webp', `${origin}/media/site50-r14/stills/a-0123456789abcdef.webp`], 'a moved still keeps its 640 rung');
for (const [name, prefix] of Object.entries(RUNTIME_FAMILIES)) {
  const map = { ...JSON.parse(readFileSync(join(ROOT, `src/presentation/blobMediaFamilies/${name}.json`), 'utf8')), origin };
  for (const member of Object.keys(map.items)) {
    assert.equal(familyBlobUrl(map, `${prefix}${member}`), `${origin}/${index.get(`${prefix}${member}`).pathname}`, `${name}: ${member}'s URL`);
  }
}

// (d) the build's rewrite, on a fixture dist
const sha = (n) => n.toString(16).padStart(64, '0');
const item = (path, n, url = 'https://s.public.blob.vercel-storage.com') => {
  const id = idForPath(path);
  const pathname = pathnameForPath(path, sha(n));
  return [id, { file: path.slice('/media/'.length), path, pathname, url: url && `${url}/${pathname}`, bytes: BIG_BYTES, sha256: sha(n), type: 'image/webp', width: 2, height: 2 }];
};
const fixtureManifest = (url) => ({ host: 'public.blob.vercel-storage.com', items: Object.fromEntries([
  item('/media/x-r1/a.webp', 1, url), item('/media/maps-r1/m-640.webp', 2, url),
]) });
const scratch = mkdtempSync(join(tmpdir(), 'blob-media-cutover-'));
const run = (files, fixture) => {
  const dist = join(scratch, `dist-${Math.random().toString(36).slice(2)}`);
  const familiesDir = join(scratch, `families-${Math.random().toString(36).slice(2)}`);
  mkdirSync(familiesDir, { recursive: true });
  for (const [name, map] of Object.entries(familyMaps(fixture))) writeFileSync(join(familiesDir, `${name}.json`), `${JSON.stringify(map)}\n`);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, file)), { recursive: true });
    writeFileSync(join(dist, file), text);
  }
  const result = rewriteDist(dist, fixture, { familiesDir });
  const out = Object.fromEntries(Object.keys(files).map((file) => [file, readFileSync(join(dist, file), 'utf8')]));
  return { ...result, out };
};
try {
  const good = fixtureManifest();
  const url = good.items[idForPath('/media/x-r1/a.webp')].url;
  const ok = run({
    'index.html': '<img src="/media/x-r1/a.webp" srcset="/media/x-r1/small.webp 640w"><meta content="https://cot.kevinliu.studio/media/x-r1/a.webp">',
    'media/x-r1/small.webp': 'RIFF',
    'media/x-r1/index.json': '{"files":[{"path":"media/x-r1/a.webp"}]}',
    'assets/a.js': 'const u="/media/maps-r1/"+id+"-640.webp";const o="https://elsewhere.example/media/x-r1/a.webp";',
  }, good);
  assert.deepEqual(ok.problems, [], 'a clean fixture dist ships');
  assert.equal(ok.out['index.html'], `<img src="${url}" srcset="/media/x-r1/small.webp 640w"><meta content="${url}">`,
    'a moved path and the site\'s own absolute link become the URL; a small file stays');
  assert.equal(ok.out['media/x-r1/index.json'], `{"files":[{"path":"${url}"}]}`, 'a runtime manifest\'s bare media/ path becomes the URL');
  assert.match(ok.out['assets/a.js'], /elsewhere\.example\/media\/x-r1\/a\.webp/, 'another origin\'s path is left alone');
  const refused = (files, fixture, pattern, what) => {
    const result = run(files, fixture);
    assert.ok(result.problems.some((problem) => pattern.test(problem)), `control: ${what} (${result.problems.join('; ') || 'no problem'})`);
  };
  refused({ 'index.html': '<img src="/media/x-r1/a.webp">' }, fixtureManifest(null), /not uploaded/, 'a moved file without a URL fails the build');
  refused({ 'media/x-r1/a.webp': 'RIFF' }, good, /a moved file is in the build/, 'a moved file left in dist fails');
  refused({ 'index.html': '<img src="/media/x-r1/gone.webp">' }, good, /names no file and no Blob item/, 'a deleted file a page still names fails');
  refused({ 'assets/b.js': 'const u="/media/x-r1/"+id+".webp";' }, good, /outside a run-time family/, 'a path built from a moved folder outside a family fails');
  refused({ 'assets/c.js': `const m=${JSON.stringify(good)};` }, good, /carries the Blob manifest/, 'a chunk with the manifest fails');
  refused({ 'assets/d.js': 'const d="/media/x-r1";const u=`${d}/${id}.webp`;' }, good, /outside a run-time family/,
    'a folder constant without its slash, outside a family, fails');
  const offMap = run({ 'index.html': '' }, good);
  assert.deepEqual(offMap.problems, [], 'the fixture maps agree');
  const drifted = { ...good, items: { ...good.items, ...Object.fromEntries([item('/media/maps-r1/n-640.webp', 3)]) } };
  const familiesDir = join(scratch, 'families-drift');
  mkdirSync(familiesDir, { recursive: true });
  for (const [name, map] of Object.entries(familyMaps(good))) writeFileSync(join(familiesDir, `${name}.json`), `${JSON.stringify(map)}\n`);
  assert.ok(familyProblems(drifted, familiesDir).some((problem) => /maps-r1/.test(problem)), 'control: a family map off the manifest fails');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const movedBytes = [...index.values()].reduce((sum, row) => sum + row.bytes, 0);
const keptBytes = tracked.reduce((sum, file) => sum + file.bytes, 0);
console.log(`blob-media-cutover.selftest: ${index.size} path items (${(movedBytes / 1048576).toFixed(1)} MB) on Blob, `
  + `${tracked.length} small files (${(keptBytes / 1048576).toFixed(1)} MB) in public/media, none big; ${references.size} references all ship; `
  + `${Object.keys(RUNTIME_FAMILIES).length} family maps (${familyBytes} B) agree; the rewrite and its six refusals hold, and every Blob URL reads back as its path`);
