#!/usr/bin/env node
// blob-media.mjs — the one writer of the site's Vercel Blob media manifest (src/presentation/blobMedia.json; the reader and
// the reasons are src/presentation/blobMedia.ts). Copyright © 2026 Kevin B. Liu.
//
// Any large file the site serves lives on Blob: films, stills, sounds, data packs. Two kinds of item share the manifest:
//   - an id item (docs-refresh-279: the docs' feature films): a media id with its local `file` under --dir and a poster;
//   - a path item (media-blob-279; Kevin 2026-11-26 "move all the big media to blob too"): a file that used to be
//     public/media/<file>, with its old site `path` (/media/<file>) and the id idForPath gives it. The pages, the
//     runtime JSON and the code keep writing the path; the build rewrites it to the item's URL (`rewrite` below).
// Every item has the MIME type its extension gives (TYPES below), its bytes and SHA-256, a content-addressed store
// `pathname` (`media/<id>-<sha256 first 16>.<ext>`), its `url` once uploaded, and, where they apply, its pixel size and
// its length. What is big (isBigMedia): every film, and any other file of 256 KB or more except a JSON manifest (Main
// 2026-11-26). A big file never enters public/media (tools/blob-media-cutover.selftest.mjs); a small one stays there.
//
// The staging folder (--staging, $COT_MEDIA_STAGING, default ~/cot-media-staging) holds the path items' bytes at their
// old places under /media/ (staging/site50-r14/loops/a.webm is /media/site50-r14/loops/a.webm). The tools that make
// media write their big files there, never into public/.
//
//   node tools/blob-media.mjs add --id=<id> --file=<path> [--poster=/media/…] [--dir=<root>]
//       Adds an id item (or renames its file and poster), then stages it when --dir is given.
//   node tools/blob-media.mjs adopt [--staging=<dir>] [--sweep]
//       Adds a path item for every file in the staging folder (or restages it), then stages them all. A small file is
//       refused: it belongs in public/media. --sweep first moves every big file a media tool wrote into public/media
//       to its place in the staging folder: run it after any tool that publishes media (tools/media-r5,
//       tools/marketing-shots, tools/media-library, ...), then families --write; blob-media-cutover.selftest fails while
//       a big file is left in public/media.
//   node tools/blob-media.mjs drop --path=/media/…[,/media/…]
//       Removes path items a page no longer uses (the store keeps the bytes: a content address is never reused).
//   node tools/blob-media.mjs stage [--dir=<root>] [--staging=<dir>] [--only=<id>,<id>]
//       Reads each item's file: bytes, sha256, type, size and length (ffprobe), pathname. No network. An item whose
//       bytes changed loses its url, since its pathname changes with its hash, and is uploaded again.
//   BLOB_READ_WRITE_TOKEN=… node tools/blob-media.mjs upload --blob-module=<dir> [--dir=<root>] [--staging=<dir>]
//         [--only=…] [--jobs=6] [--dry-run]
//       Puts each staged item without a url at its pathname: public, no random suffix, never overwriting, cached a year.
//       An object already at the pathname with the same size is taken as is, so a re-run is a no-op. Runs --jobs puts at
//       a time, appends each one to ~/cot-blob-tool/upload-progress.jsonl and writes the manifest every 25 items and at
//       the end, so an interrupted run resumes where it stopped (the log fills in the urls a killed run had not yet
//       written). <dir> has @vercel/blob installed, outside the repository so the lockfile does not move:
//         mkdir -p ~/cot-blob-tool && npm --prefix ~/cot-blob-tool install @vercel/blob@2.9.0
//       The token is the owner's credential: never committed, never in a file under the repository.
//   node tools/blob-media.mjs fixture --port=<n> --out=<file> --links=<dir> [--dir=<root>] [--staging=<dir>] [--only=…]
//       A test manifest whose urls are http://127.0.0.1:<n>/<pathname>, and <dir> a tree of links at those pathnames to
//       the staged files, for a local static server over <dir>. A build reads it through COT_BLOB_MEDIA_MANIFEST=<file>
//       (families --write, rewrite, tools/docs-prerender.mjs). Never committed.
//   node tools/blob-media.mjs families --write|--check
//       The run-time family maps (src/presentation/blobMediaFamilies/<family>.json, blobMediaFamily.ts) from the manifest;
//       --check exits 1 when one disagrees with it.
//   node tools/blob-media.mjs rewrite --dir=dist
//       The build step (npm run build): every path item's path in dist's pages, scripts, styles and JSON becomes its URL.
//       Exits 1 when a path item has no URL, a moved file is in dist, a /media/ path names no file and no item, a path
//       is built at run time from a folder that holds moved files outside a family, a chunk carries the manifest, or a
//       family map disagrees with the manifest. Writes dist/blob-media-rewrite.json (each path's rewrites).
//   node tools/blob-media.mjs check
//       Exits 1 when an item is not staged or a url is not its pathname on the store's host (tools/blob-media.selftest.mjs).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { idForPath, PATHNAME_PREFIX, pathnameFor, pathnameForPath } from '../src/presentation/blobMediaPath.ts';
import { mediaPaths, rewriteText } from './blobMediaRewrite.ts';

export { idForPath, mediaPaths, PATHNAME_PREFIX, pathnameFor, pathnameForPath, rewriteText };
/** An item's content-addressed pathname: an id item's by its id, a path item's by its old path. */
export const itemPathname = (id, item, sha256 = item.sha256) => (item.path ? pathnameForPath(item.path, sha256) : pathnameFor(id, sha256, item.file));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = join(ROOT, 'src/presentation/blobMedia.json');
/** The types the store serves, by extension; a file of another extension cannot be added. */
export const TYPES = Object.freeze({
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.json': 'application/json', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.pdf': 'application/pdf',
});
const typeOf = (file) => TYPES[extname(file).toLowerCase()];
/** Big media (Main 2026-11-26): every film, and any other file of this many bytes or more except a JSON manifest. */
export const BIG_BYTES = 256 * 1024;
const FILM = new Set(['.mp4', '.webm', '.mov']);
export const isBigMedia = (file, bytes) => {
  const ext = extname(file).toLowerCase();
  return ext !== '.json' && (FILM.has(ext) || bytes >= BIG_BYTES);
};
/** A year: the pathname changes whenever the bytes do, so a cached copy is never stale. */
const CACHE_MAX_AGE_S = 31536000;
const ID = /^[a-z0-9][a-z0-9-]*$/;
/** The run-time families (blobMediaFamily.ts): a page builds these paths from an id while it runs, so the build cannot
 *  rewrite them in place. Each has a map, imported only by the module that builds its paths. */
export const RUNTIME_FAMILIES = Object.freeze({
  'maps-r1': '/media/maps-r1/',
  'battle-end-r1': '/media/battle-end-r1/',
  'site50-stills': '/media/site50-r14/stills/',
  'site50-loops': '/media/site50-r14/loops/',
  'tutorial-r1': '/media/tutorial-r1/',
  'library-r3': '/media/library-r3/',
  'filming-r1': '/media/filming-r1/',
  'site50-reels': '/media/site50-r14/reels/',
  'web-video-r1': '/media/web-video-r1/',
  'docs-hero-r2': '/media/docs-hero-r2/',
});
export const FAMILIES_DIR = join(ROOT, 'src/presentation/blobMediaFamilies');

export const readManifest = (path = MANIFEST_PATH) => JSON.parse(readFileSync(path, 'utf8'));
/** The manifest a build reads: a test fixture's when COT_BLOB_MEDIA_MANIFEST names one, else the committed one. */
export const buildManifestPath = () => (process.env.COT_BLOB_MEDIA_MANIFEST ? resolve(process.env.COT_BLOB_MEDIA_MANIFEST) : MANIFEST_PATH);
const writeManifest = (manifest, path = MANIFEST_PATH) => writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const stagingDir = () => resolve(arg('staging') ?? process.env.COT_MEDIA_STAGING ?? join(homedir(), 'cot-media-staging'));
const selected = (manifest) => {
  const only = arg('only')?.split(',').filter(Boolean);
  for (const id of only ?? []) if (!manifest.items[id]) throw new Error(`blob-media: no item ${id}`);
  return Object.entries(manifest.items).filter(([id]) => !only || only.includes(id));
};
/** Where an item's bytes are: a path item's under the staging folder, an id item's under --dir. */
const sourceOf = (item, dirs) => {
  const base = item.path ? dirs.staging : dirs.dir;
  if (!base) throw new Error(`blob-media: ${item.file} needs ${item.path ? '--staging' : '--dir'}`);
  return join(base, item.file);
};

/** Every path item by its site path (the whole row, for the tools). */
export function pathIndex(manifest) {
  const index = new Map();
  for (const [id, item] of Object.entries(manifest.items)) if (item.path) index.set(item.path, { id, ...item });
  return index;
}

/** Why the manifest is not ready to ship, one line per problem (empty: ready). */
export function manifestProblems(manifest) {
  const problems = [];
  const paths = new Set();
  const origins = new Set();
  for (const [id, item] of Object.entries(manifest.items)) {
    if (!ID.test(id)) problems.push(`${id}: an id is lowercase letters, digits and hyphens`);
    if (item.path !== undefined) {
      if (!/^\/media\/[^?#\s]+$/.test(item.path)) problems.push(`${id}: path ${item.path} is not a site path under /media/`);
      if (id !== idForPath(item.path)) problems.push(`${id}: a path item's id is ${idForPath(item.path)}`);
      if (item.file !== item.path.slice('/media/'.length)) problems.push(`${id}: a path item's file is its path under /media/`);
      if (paths.has(item.path)) problems.push(`${id}: ${item.path} is a second item's path`);
      paths.add(item.path);
      if (item.bytes > 0 && !isBigMedia(item.file, item.bytes)) problems.push(`${id}: ${item.bytes} B is not big media (it stays in public/media)`);
    }
    const type = typeOf(item.file ?? '');
    if (!type) { problems.push(`${id}: ${item.file} has no type in TYPES`); continue; }
    if (!item.sha256 || !/^[0-9a-f]{64}$/.test(item.sha256)) { problems.push(`${id}: not staged (node tools/blob-media.mjs stage)`); continue; }
    if (item.pathname !== itemPathname(id, item)) problems.push(`${id}: pathname ${item.pathname} is not its content address`);
    if (item.type !== type) problems.push(`${id}: type ${item.type}, ${type} by its extension`);
    if (!(item.bytes > 0)) problems.push(`${id}: bytes`);
    const film = type.startsWith('video/');
    if ((film || type.startsWith('image/')) && !(item.width > 0 && item.height > 0)) problems.push(`${id}: its pixel size`);
    if ((film || type.startsWith('audio/')) && !(item.durationS > 0)) problems.push(`${id}: its length`);
    // an id film carries its own poster; a path film's page names its poster where it names the film
    if (film && !item.path && !item.poster) problems.push(`${id}: a film needs a poster`);
    if (item.poster !== undefined && !/^\/media\/[^?#]+\.(?:webp|avif|jpg|png)$/.test(item.poster)) problems.push(`${id}: poster ${item.poster} is not a still under /media/`);
    if (item.url !== null) {
      let url;
      try { url = new URL(item.url); } catch { problems.push(`${id}: url ${item.url}`); continue; }
      if (url.protocol !== 'https:' || !(url.hostname === manifest.host || url.hostname.endsWith(`.${manifest.host}`))) problems.push(`${id}: ${item.url} is not on ${manifest.host}`);
      if (url.pathname !== `/${item.pathname}`) problems.push(`${id}: ${item.url} is not its pathname ${item.pathname}`);
      origins.add(url.origin);
    }
  }
  if (origins.size > 1) problems.push(`the urls are on ${origins.size} origins (${[...origins].join(', ')}): one store holds every item`);
  return problems;
}

/** A film's, picture's or sound's size and length (ffprobe), as the manifest records them. */
function probe(path, type) {
  if (!/^(?:video|image|audio)\//.test(type)) return {};
  const json = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration',
    '-of', 'json', path], { encoding: 'utf8' }));
  const picture = json.streams.find((stream) => stream.codec_type === 'video');
  const seconds = Number(json.format?.duration);
  return {
    ...(picture && !type.startsWith('audio/') ? { width: picture.width, height: picture.height } : {}),
    ...(!type.startsWith('image/') && seconds > 0 ? { durationS: Math.round(seconds * 10) / 10 } : {}),
  };
}

function stageItems(manifest, entries, dirs) {
  for (const [id, item] of entries) {
    const path = sourceOf(item, dirs);
    const bytes = readFileSync(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const type = typeOf(item.file);
    if (!type) throw new Error(`blob-media: ${item.file} has no type in TYPES`);
    const moved = item.sha256 !== sha256;
    if (!moved && item.pathname === itemPathname(id, item, sha256) && item.bytes === bytes.length) continue;
    const { width: _w, height: _h, durationS: _d, ...rest } = item;
    manifest.items[id] = { ...rest, pathname: itemPathname(id, item, sha256), url: moved ? null : item.url, bytes: bytes.length, sha256, type,
      ...probe(path, type) };
    console.log(`${id}: ${item.file} ${(bytes.length / 1048576).toFixed(2)} MB ${manifest.items[id].pathname}${moved && item.url ? ' (new bytes: url cleared)' : ''}`);
  }
}

function add(dir) {
  const id = arg('id'), file = arg('file'), poster = arg('poster');
  if (!id || !ID.test(id) || !file) throw new Error('blob-media: add --id=<lowercase-id> --file=<path> [--poster=/media/…]');
  if (!typeOf(file)) throw new Error(`blob-media: ${file} has no type in TYPES`);
  const manifest = readManifest();
  const before = manifest.items[id];
  if (before?.path) throw new Error(`blob-media: ${id} is a path item (adopt it from the staging folder)`);
  manifest.items[id] = { ...(before ?? { pathname: '', url: null, bytes: 0, sha256: '' }), file, type: typeOf(file), ...(poster ? { poster } : {}) };
  if (dir) stageItems(manifest, [[id, manifest.items[id]]], { dir });
  writeManifest(manifest);
  console.log(`blob-media: ${before ? 'updated' : 'added'} ${id}${dir ? '' : ' (stage it with --dir)'}`);
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
});

/** Move every big file a tool wrote into public/media to the same place in the staging folder (its public copy goes). */
function sweep(staging) {
  const media = join(ROOT, 'public', 'media');
  let moved = 0;
  for (const full of walk(media)) {
    const file = relative(media, full).split(sep).join('/');
    if (!typeOf(file) || !isBigMedia(file, statSync(full).size)) continue;
    const target = join(staging, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(full, target);
    rmSync(full);
    moved++;
    console.log(`blob-media: swept /media/${file} to the staging folder`);
  }
  return moved;
}

function adopt(staging) {
  if (process.argv.includes('--sweep')) sweep(staging);
  if (!existsSync(staging)) throw new Error(`blob-media: no staging folder ${staging}`);
  const manifest = readManifest();
  const adopted = [];
  const small = [];
  for (const full of walk(staging).sort()) {
    const file = relative(staging, full).split(sep).join('/');
    if (file.split('/').some((part) => part.startsWith('.'))) continue;
    if (!typeOf(file)) throw new Error(`blob-media: ${file} has no type in TYPES`);
    if (!isBigMedia(file, statSync(full).size)) { small.push(file); continue; }
    const path = `/media/${file}`;
    const id = idForPath(path);
    const before = manifest.items[id];
    if (before && before.path !== path) throw new Error(`blob-media: ${id} is already ${before.path ?? 'an id item'}`);
    manifest.items[id] = before ?? { file, path, pathname: '', url: null, bytes: 0, sha256: '', type: typeOf(file) };
    adopted.push([id, manifest.items[id]]);
  }
  if (small.length) throw new Error(`blob-media: ${small.length} small files belong in public/media, not on Blob:\n  ${small.slice(0, 10).join('\n  ')}`);
  stageItems(manifest, adopted, { staging });
  writeManifest(manifest);
  console.log(`blob-media: ${adopted.length} path items from ${staging}`);
}

function drop() {
  const manifest = readManifest();
  const paths = (arg('path') ?? '').split(',').filter(Boolean);
  if (!paths.length) throw new Error('blob-media: drop --path=/media/…[,/media/…]');
  for (const path of paths) {
    const id = idForPath(path);
    if (manifest.items[id]?.path !== path) throw new Error(`blob-media: no path item ${path}`);
    delete manifest.items[id];
  }
  writeManifest(manifest);
  console.log(`blob-media: dropped ${paths.length} path items; run families --write`);
}

const PROGRESS_LOG = join(homedir(), 'cot-blob-tool', 'upload-progress.jsonl');

async function upload(dirs, moduleDir, dryRun) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token && !dryRun) throw new Error('blob-media: BLOB_READ_WRITE_TOKEN is not set (the owner\'s credential; never committed)');
  const manifest = readManifest();
  // a killed run's puts: the log has their urls, the manifest may not
  if (existsSync(PROGRESS_LOG)) {
    for (const line of readFileSync(PROGRESS_LOG, 'utf8').split('\n').filter(Boolean)) {
      const done = JSON.parse(line);
      const item = manifest.items[done.id];
      if (item && !item.url && item.pathname === done.pathname && item.bytes === done.bytes) manifest.items[done.id] = { ...item, url: done.url };
    }
  }
  const entries = selected(manifest);
  const problems = manifestProblems({ ...manifest, items: Object.fromEntries(entries.map(([id, item]) => [id, { ...item, url: null }])) });
  if (problems.length) throw new Error(`blob-media: stage first:\n  ${problems.slice(0, 20).join('\n  ')}`);
  const due = entries.filter(([, item]) => !item.url);
  for (const [, item] of due) {
    if (createHash('sha256').update(readFileSync(sourceOf(item, dirs))).digest('hex') !== item.sha256) {
      throw new Error(`blob-media: ${item.file} differs from its staged hash (stage again)`);
    }
  }
  const total = due.reduce((sum, [, item]) => sum + item.bytes, 0);
  if (dryRun) {
    for (const [id, item] of due) console.log(`${id}: would put ${item.pathname} (${item.bytes} B)`);
    console.log(`blob-media: ${due.length} to put (${(total / 1048576).toFixed(1)} MB), ${entries.length - due.length} already uploaded`);
    writeManifest(manifest);
    return;
  }
  if (!moduleDir) throw new Error('blob-media: --blob-module=<dir with @vercel/blob installed>');
  const require = createRequire(join(resolve(moduleDir), 'package.json'));
  const { head, put } = await import(pathToFileURL(require.resolve('@vercel/blob')).href);
  mkdirSync(dirname(PROGRESS_LOG), { recursive: true });
  const jobs = Math.max(1, Number(arg('jobs') ?? 6));
  const started = Date.now();
  let next = 0, done = 0, sent = 0;
  const one = async ([id, item]) => {
    let url;
    try {
      const found = await head(item.pathname, { token });
      if (found.size !== item.bytes) throw new Error(`blob-media: ${item.pathname} is in the store at ${found.size} B, not ${item.bytes} B`);
      url = found.url;
    } catch (error) {
      if (error?.name !== 'BlobNotFoundError' && !/not.?found/i.test(String(error?.message))) throw error;
      url = (await put(item.pathname, readFileSync(sourceOf(item, dirs)), { access: 'public', addRandomSuffix: false, allowOverwrite: false,
        contentType: item.type, cacheControlMaxAge: CACHE_MAX_AGE_S, token })).url;
    }
    manifest.items[id] = { ...item, url };
    appendFileSync(PROGRESS_LOG, `${JSON.stringify({ id, pathname: item.pathname, bytes: item.bytes, url })}\n`);
    done++; sent += item.bytes;
    if (done % 25 === 0 || done === due.length) {
      writeManifest(manifest);
      const s = (Date.now() - started) / 1000;
      console.log(`blob-media: ${done}/${due.length} (${(sent / 1048576).toFixed(0)}/${(total / 1048576).toFixed(0)} MB, ${s.toFixed(0)} s)`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, due.length) }, async () => {
    while (next < due.length) await one(due[next++]);
  }));
  writeManifest(manifest);
  const after = manifestProblems(manifest);
  if (after.length) throw new Error(`blob-media: the store's answer does not match the manifest:\n  ${after.join('\n  ')}`);
  console.log(`blob-media: ${due.length} put, ${entries.length - due.length} already there; commit src/presentation/blobMedia.json, then run families --write`);
}

function fixture(dirs, port, out, links) {
  const manifest = readManifest();
  const entries = selected(manifest);
  rmSync(links, { recursive: true, force: true });
  for (const [, item] of entries) {
    const source = sourceOf(item, dirs);
    if (!existsSync(source)) throw new Error(`blob-media: ${source} is not there`);
    const link = join(links, item.pathname);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(source, link);
    item.url = `http://127.0.0.1:${port}/${item.pathname}`;
  }
  writeManifest({ host: '127.0.0.1', items: Object.fromEntries(entries) }, out);
  console.log(`blob-media: fixture ${out} (${entries.length} items at http://127.0.0.1:${port}/, links under ${links})`);
}

/** The run-time family maps the manifest gives (blobMediaFamily.ts), by family name. */
export function familyMaps(manifest) {
  const pathItems = [...pathIndex(manifest).values()];
  const urls = pathItems.map((item) => item.url);
  const origin = urls.length && urls.every(Boolean) ? new URL(urls[0]).origin : null;
  return Object.fromEntries(Object.entries(RUNTIME_FAMILIES).map(([name, prefix]) => {
    const items = Object.fromEntries(pathItems.filter((item) => item.path.startsWith(prefix)).sort((a, b) => (a.path < b.path ? -1 : 1))
      .map((item) => [item.path.slice(prefix.length), item.sha256.slice(0, 16)]));
    return [name, { prefix, origin, items }];
  }));
}
const familyText = (map) => `${JSON.stringify(map)}\n`;

/** Family map files that disagree with the manifest (empty: they agree). */
export function familyProblems(manifest, dir = FAMILIES_DIR) {
  const problems = [];
  const maps = familyMaps(manifest);
  for (const [name, map] of Object.entries(maps)) {
    const path = join(dir, `${name}.json`);
    if (!existsSync(path)) problems.push(`${name}: no ${relative(ROOT, path)} (families --write)`);
    else if (readFileSync(path, 'utf8') !== familyText(map)) problems.push(`${name}: ${relative(ROOT, path)} disagrees with the manifest (families --write)`);
  }
  if (existsSync(dir)) for (const file of readdirSync(dir)) if (!maps[file.replace(/\.json$/, '')]) problems.push(`${file}: no such family`);
  return problems;
}

function families(write) {
  const manifest = readManifest(buildManifestPath());
  if (write) {
    mkdirSync(FAMILIES_DIR, { recursive: true });
    for (const [name, map] of Object.entries(familyMaps(manifest))) writeFileSync(join(FAMILIES_DIR, `${name}.json`), familyText(map));
  }
  const problems = familyProblems(manifest);
  if (problems.length) { console.error(`blob-media: ${problems.join('\n  ')}`); process.exit(1); }
  console.log(`blob-media: ${Object.keys(RUNTIME_FAMILIES).length} family maps agree with ${relative(ROOT, buildManifestPath())}`);
}

const TEXT_FILES = new Set(['.html', '.js', '.mjs', '.css', '.json', '.xml', '.txt', '.webmanifest', '.svg']);

/** The build step: rewrite dist in place, and say why it may not ship (empty: it may). */
export function rewriteDist(dist, manifest, { familiesDir = FAMILIES_DIR } = {}) {
  const index = pathIndex(manifest);
  const problems = [];
  for (const [path, item] of index) if (!item.url) problems.push(`${path}: on Blob but not uploaded (no url)`);
  if (problems.length > 5) problems.splice(5, problems.length - 5, `… and ${problems.length - 5} more without a url`);
  problems.push(...familyProblems(manifest, familiesDir));
  const movedFolders = new Set();
  for (const path of index.keys()) for (let cut = path.indexOf('/', 7); cut !== -1; cut = path.indexOf('/', cut + 1)) movedFolders.add(path.slice(0, cut + 1));
  const families = Object.values(RUNTIME_FAMILIES);
  const shas = [...index.values()].map((item) => item.sha256);
  const hits = new Map();
  let files = 0;
  for (const full of walk(dist)) {
    const rel = relative(dist, full).split(sep).join('/');
    if (rel.startsWith('media/') && index.has(`/${rel}`)) problems.push(`dist/${rel}: a moved file is in the build`);
    if (!TEXT_FILES.has(extname(full).toLowerCase()) || lstatSync(full).size > 32 * 1048576) continue;
    const text = readFileSync(full, 'utf8');
    if (!text.includes('media/')) continue;
    for (const found of mediaPaths(text)) {
      if (found.full) {
        if (!index.has(found.path) && !existsSync(join(dist, found.path))) problems.push(`dist/${rel}: ${found.path} names no file and no Blob item`);
      } else if ((movedFolders.has(`${found.path.replace(/\/$/, '')}/`) || movedFolders.has(found.path.slice(0, found.path.lastIndexOf('/') + 1)))
        && !families.some((prefix) => found.path.startsWith(prefix) || `${found.path}/` === prefix)) {
        problems.push(`dist/${rel}: builds a path from ${found.path}, a folder with moved files outside a run-time family (blobMediaFamily.ts)`);
      }
    }
    if (/\.m?js$/.test(rel) && shas.some((sha) => text.includes(sha))) problems.push(`dist/${rel}: carries the Blob manifest (import blobMediaPath.ts or a family map, not blobMedia.ts)`);
    const next = rewriteText(text, index, hits);
    if (next !== text) { writeFileSync(full, next); files++; }
  }
  return { problems, hits, files };
}

function rewrite(dist) {
  const manifest = readManifest(buildManifestPath());
  const { problems, hits, files } = rewriteDist(dist, manifest);
  const total = [...hits.values()].reduce((sum, n) => sum + n, 0);
  writeFileSync(join(dist, 'blob-media-rewrite.json'), `${JSON.stringify({ manifest: relative(ROOT, buildManifestPath()), files, rewrites: Object.fromEntries([...hits].sort()) }, null, 1)}\n`);
  if (problems.length) {
    console.error(`blob-media rewrite: ${problems.length} problems; the build may not ship:\n  ${problems.slice(0, 40).join('\n  ')}${problems.length > 40 ? `\n  … ${problems.length - 40} more` : ''}`);
    process.exit(1);
  }
  console.log(`blob-media rewrite: ${total} links to ${hits.size} Blob items in ${files} files`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const dirs = { dir: arg('dir') ? resolve(arg('dir')) : undefined, staging: stagingDir() };
  if (command === 'add') add(dirs.dir);
  else if (command === 'adopt') adopt(dirs.staging);
  else if (command === 'drop') drop();
  else if (command === 'stage') { const manifest = readManifest(); stageItems(manifest, selected(manifest), dirs); writeManifest(manifest); }
  else if (command === 'upload') await upload(dirs, arg('blob-module'), process.argv.includes('--dry-run'));
  else if (command === 'fixture' && arg('port') && arg('out') && arg('links')) fixture(dirs, Number(arg('port')), resolve(arg('out')), resolve(arg('links')));
  else if (command === 'families' && (process.argv.includes('--write') || process.argv.includes('--check'))) families(process.argv.includes('--write'));
  else if (command === 'rewrite' && dirs.dir) rewrite(dirs.dir);
  else if (command === 'check') {
    const problems = manifestProblems(readManifest());
    if (problems.length) { console.error(`blob-media: ${problems.join('\n  ')}`); process.exit(1); }
    console.log(`blob-media: manifest ok (${Object.keys(readManifest().items).length} items)`);
  } else {
    console.error('usage: node tools/blob-media.mjs add|adopt|drop|stage|upload|fixture|families|rewrite|check (see the header)');
    process.exit(2);
  }
}
