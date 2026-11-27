#!/usr/bin/env node
// blob-media.mjs — the one writer of the site's Vercel Blob media manifest (src/presentation/blobMedia.json; the reader and
// the reasons are src/presentation/blobMedia.ts). Copyright © 2026 Kevin B. Liu.
//
// Any large file the site serves can live on Blob: films, stills, sounds, data packs. An item is a media id (lowercase
// letters, digits, hyphens) with its local `file` (a path relative to the --dir it is staged from), the MIME type its
// extension gives (TYPES below), its bytes and SHA-256, a content-addressed store `pathname`
// (`media/<id>-<sha256 first 16>.<ext>`), its `url` once uploaded, and, where they apply, its pixel size, its length and
// a `poster` (a small still under public/media/, which every film needs). No media bytes enter the repository.
//
//   node tools/blob-media.mjs add --id=<id> --file=<path> [--poster=/media/…] [--dir=<root>]
//       Adds an item (or renames its file and poster), then stages it when --dir is given.
//   node tools/blob-media.mjs stage --dir=<root> [--only=<id>,<id>]
//       Reads each item's file under <root>: bytes, sha256, type, size and length (ffprobe), pathname. No network. An item
//       whose bytes changed loses its url, since its pathname changes with its hash, and is uploaded again.
//   BLOB_READ_WRITE_TOKEN=… node tools/blob-media.mjs upload --dir=<root> --blob-module=<dir> [--only=…] [--dry-run]
//       Puts each staged item without a url at its pathname: public, no random suffix, never overwriting, cached a year.
//       An object already at the pathname with the same size is taken as is, so a re-run is a no-op. The manifest is
//       written after every item, so an interrupted run resumes. <dir> has @vercel/blob installed, outside the
//       repository so the lockfile does not move:
//         mkdir -p ~/cot-blob-tool && npm --prefix ~/cot-blob-tool install @vercel/blob@2.9.0
//       The token is the owner's credential: never committed, never in a file under the repository.
//   node tools/blob-media.mjs fixture --dir=<root> --port=<n> --out=<file> [--only=…]
//       A test manifest whose urls are http://127.0.0.1:<n>/<file>, for a local static server over <root>. A page build
//       reads it through COT_BLOB_MEDIA_MANIFEST=<file> (tools/docs-prerender.mjs). Never committed.
//   node tools/blob-media.mjs check
//       Exits 1 when an item is not staged or a url is not its pathname on the store's host (tools/blob-media.selftest.mjs).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = join(ROOT, 'src/presentation/blobMedia.json');
/** Every pathname lives under this prefix in the store. */
export const PATHNAME_PREFIX = 'media';
/** The types the store serves, by extension; a file of another extension cannot be added. */
export const TYPES = Object.freeze({
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.json': 'application/json', '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.pdf': 'application/pdf',
});
const typeOf = (file) => TYPES[extname(file).toLowerCase()];
/** A content-addressed name: the item's id and the first 16 hex of its SHA-256. */
export const pathnameFor = (id, sha256, file) => `${PATHNAME_PREFIX}/${id}-${sha256.slice(0, 16)}${extname(file).toLowerCase()}`;
/** A year: the pathname changes whenever the bytes do, so a cached copy is never stale. */
const CACHE_MAX_AGE_S = 31536000;
const ID = /^[a-z0-9][a-z0-9-]*$/;

export const readManifest = (path = MANIFEST_PATH) => JSON.parse(readFileSync(path, 'utf8'));
const writeManifest = (manifest, path = MANIFEST_PATH) => writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const selected = (manifest) => {
  const only = arg('only')?.split(',').filter(Boolean);
  for (const id of only ?? []) if (!manifest.items[id]) throw new Error(`blob-media: no item ${id}`);
  return Object.entries(manifest.items).filter(([id]) => !only || only.includes(id));
};

/** Why the manifest is not ready to ship, one line per problem (empty: ready). */
export function manifestProblems(manifest) {
  const problems = [];
  for (const [id, item] of Object.entries(manifest.items)) {
    if (!ID.test(id)) problems.push(`${id}: an id is lowercase letters, digits and hyphens`);
    const type = typeOf(item.file ?? '');
    if (!type) { problems.push(`${id}: ${item.file} has no type in TYPES`); continue; }
    if (!item.sha256 || !/^[0-9a-f]{64}$/.test(item.sha256)) { problems.push(`${id}: not staged (node tools/blob-media.mjs stage)`); continue; }
    if (item.pathname !== pathnameFor(id, item.sha256, item.file)) problems.push(`${id}: pathname ${item.pathname} is not its content address`);
    if (item.type !== type) problems.push(`${id}: type ${item.type}, ${type} by its extension`);
    if (!(item.bytes > 0)) problems.push(`${id}: bytes`);
    const film = type.startsWith('video/');
    if ((film || type.startsWith('image/')) && !(item.width > 0 && item.height > 0)) problems.push(`${id}: its pixel size`);
    if ((film || type.startsWith('audio/')) && !(item.durationS > 0)) problems.push(`${id}: its length`);
    if (film && !item.poster) problems.push(`${id}: a film needs a poster`);
    if (item.poster !== undefined && !/^\/media\/[^?#]+\.(?:webp|avif|jpg|png)$/.test(item.poster)) problems.push(`${id}: poster ${item.poster} is not a still under /media/`);
    if (item.url !== null) {
      let url;
      try { url = new URL(item.url); } catch { problems.push(`${id}: url ${item.url}`); continue; }
      if (url.protocol !== 'https:' || !(url.hostname === manifest.host || url.hostname.endsWith(`.${manifest.host}`))) problems.push(`${id}: ${item.url} is not on ${manifest.host}`);
      if (url.pathname !== `/${item.pathname}`) problems.push(`${id}: ${item.url} is not its pathname ${item.pathname}`);
    }
  }
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

function stageItems(manifest, entries, dir) {
  for (const [id, item] of entries) {
    const path = join(dir, item.file);
    const bytes = readFileSync(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const type = typeOf(item.file);
    if (!type) throw new Error(`blob-media: ${item.file} has no type in TYPES`);
    const moved = item.sha256 !== sha256;
    const { width: _w, height: _h, durationS: _d, ...rest } = item;
    manifest.items[id] = { ...rest, pathname: pathnameFor(id, sha256, item.file), url: moved ? null : item.url, bytes: bytes.length, sha256, type,
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
  manifest.items[id] = { ...(before ?? { pathname: '', url: null, bytes: 0, sha256: '' }), file, type: typeOf(file), ...(poster ? { poster } : {}) };
  if (dir) stageItems(manifest, [[id, manifest.items[id]]], dir);
  writeManifest(manifest);
  console.log(`blob-media: ${before ? 'updated' : 'added'} ${id}${dir ? '' : ' (stage it with --dir)'}`);
}

async function upload(dir, moduleDir, dryRun) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token && !dryRun) throw new Error('blob-media: BLOB_READ_WRITE_TOKEN is not set (the owner\'s credential; never committed)');
  const manifest = readManifest();
  const entries = selected(manifest);
  const problems = manifestProblems({ ...manifest, items: Object.fromEntries(entries.map(([id, item]) => [id, { ...item, url: null }])) });
  if (problems.length) throw new Error(`blob-media: stage first:\n  ${problems.join('\n  ')}`);
  for (const [, item] of entries) {
    if (createHash('sha256').update(readFileSync(join(dir, item.file))).digest('hex') !== item.sha256) {
      throw new Error(`blob-media: ${item.file} differs from its staged hash (stage again)`);
    }
  }
  const due = entries.filter(([, item]) => !item.url);
  if (dryRun) {
    for (const [id, item] of entries) console.log(`${id}: ${item.url ? 'uploaded' : `would put ${item.pathname} (${item.bytes} B)`}`);
    return;
  }
  if (!moduleDir) throw new Error('blob-media: --blob-module=<dir with @vercel/blob installed>');
  const require = createRequire(join(resolve(moduleDir), 'package.json'));
  const { head, put } = await import(pathToFileURL(require.resolve('@vercel/blob')).href);
  for (const [id, item] of due) {
    let url;
    try {
      const found = await head(item.pathname, { token });
      if (found.size !== item.bytes) throw new Error(`blob-media: ${item.pathname} is in the store at ${found.size} B, not ${item.bytes} B`);
      url = found.url;
      console.log(`${id}: already in the store`);
    } catch (error) {
      if (error?.name !== 'BlobNotFoundError' && !/not.?found/i.test(String(error?.message))) throw error;
      url = (await put(item.pathname, readFileSync(join(dir, item.file)), { access: 'public', addRandomSuffix: false, allowOverwrite: false,
        contentType: item.type, cacheControlMaxAge: CACHE_MAX_AGE_S, token })).url;
      console.log(`${id}: uploaded ${item.bytes} B`);
    }
    manifest.items[id] = { ...item, url };
    writeManifest(manifest);
  }
  const after = manifestProblems(manifest);
  if (after.length) throw new Error(`blob-media: the store's answer does not match the manifest:\n  ${after.join('\n  ')}`);
  console.log(`blob-media: ${due.length} uploaded, ${entries.length - due.length} already there; commit src/presentation/blobMedia.json`);
}

function fixture(dir, port, out) {
  const manifest = readManifest();
  const entries = selected(manifest);
  for (const [, item] of entries) {
    if (!existsSync(join(dir, item.file))) throw new Error(`blob-media: ${item.file} is not under ${dir}`);
    item.url = `http://127.0.0.1:${port}/${item.file.split('/').map(encodeURIComponent).join('/')}`;
  }
  writeManifest({ host: '127.0.0.1', items: Object.fromEntries(entries) }, out);
  console.log(`blob-media: fixture ${out} (${entries.length} items at http://127.0.0.1:${port}/)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const dir = arg('dir') ? resolve(arg('dir')) : undefined;
  if (command === 'add') add(dir);
  else if (command === 'stage' && dir) { const manifest = readManifest(); stageItems(manifest, selected(manifest), dir); writeManifest(manifest); }
  else if (command === 'upload' && dir) await upload(dir, arg('blob-module'), process.argv.includes('--dry-run'));
  else if (command === 'fixture' && dir && arg('port') && arg('out')) fixture(dir, Number(arg('port')), resolve(arg('out')));
  else if (command === 'check') {
    const problems = manifestProblems(readManifest());
    if (problems.length) { console.error(`blob-media: ${problems.join('\n  ')}`); process.exit(1); }
    console.log(`blob-media: manifest ok (${Object.keys(readManifest().items).length} items)`);
  } else {
    console.error('usage: node tools/blob-media.mjs add|stage|upload|fixture|check (see the header)');
    process.exit(2);
  }
}
