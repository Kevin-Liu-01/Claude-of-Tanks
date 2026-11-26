// media-files.mjs — where a /media/ file ships from, for the receipts and tools that check it (media-blob-279; Kevin
// 2026-11-26: "move all the big media to blob too"). A small file is in public/media; a big one (tools/blob-media.mjs
// isBigMedia) is a path item of the Blob manifest (src/presentation/blobMedia.json), which records its bytes, SHA-256,
// type and, for a picture or film, its pixel size and length. A receipt asks here instead of statting public/, so it
// holds for both and never reads bytes the repository no longer has. Copyright © 2026 Kevin B. Liu.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBigMedia, pathIndex, readManifest } from './blob-media.mjs';
import { idForPath } from '../src/presentation/blobMediaPath.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
/** Where the tools that make media put big files (tools/blob-media.mjs adopt reads it), outside the repository. */
export const STAGING = resolve(process.env.COT_MEDIA_STAGING ?? join(homedir(), 'cot-media-staging'));
let index;
const items = () => (index ??= pathIndex(readManifest()));

/** A media path in any of the forms the code writes (`/media/x`, `media/x`, `public/media/x`, an absolute file path under
 *  public/) as its site path, `/media/x`; null for anything else. */
export function sitePath(path) {
  const plain = String(path).split(/[?#]/)[0];
  if (plain.startsWith(`${PUBLIC}/`)) return plain.slice(PUBLIC.length);
  const match = /^(?:\/|public\/)?(media\/.+)$/.exec(plain);
  return match ? `/${match[1]}` : null;
}

/**
 * The file a media path (or the Blob URL a page was given for one) names: { where: 'public', bytes, file } for one in
 * public/, { where: 'blob', bytes, sha256, type, width, height, durationS, url, item } for a Blob path item, or null when
 * it ships from neither.
 */
export function mediaFile(path) {
  const site = sitePath(path);
  if (site) {
    const file = join(PUBLIC, site);
    if (existsSync(file) && statSync(file).isFile()) return { where: 'public', path: site, file, bytes: statSync(file).size };
  }
  // a site path, or a URL a page was given for one (a family's or the rewrite's: its pathname names the item)
  const item = (site && items().get(site)) || blobItemForUrl(path);
  if (!item) return null;
  return { where: 'blob', path: item.path, bytes: item.bytes, sha256: item.sha256, type: item.type, width: item.width, height: item.height,
    durationS: item.durationS, url: item.url, item };
}

/** True when the path ships, from public/ or from Blob (any site path: one outside /media/ ships from public/ alone). */
export const mediaExists = (path) => mediaFile(path) !== null
  || (/^\/[^?#]+$/.test(String(path)) && existsSync(join(PUBLIC, String(path))) && statSync(join(PUBLIC, String(path))).isFile());

/** The path's bytes, from either place (an Error when it ships from neither). */
export function mediaBytes(path) {
  const found = mediaFile(path);
  if (!found) throw new Error(`media-files: ${path} ships from neither public/ nor Blob`);
  return found.bytes;
}

/** The path's bytes and SHA-256, for a byte receipt: hashed from public/, or the Blob manifest's row (which
 *  tools/blob-media.mjs staged from the same bytes). An Error when it ships from neither. */
export function mediaDigest(path) {
  const found = mediaFile(path);
  if (!found) throw new Error(`media-files: ${path} ships from neither public/ nor Blob`);
  if (found.where === 'blob') return { bytes: found.bytes, sha256: found.sha256, where: 'blob' };
  return { bytes: found.bytes, sha256: createHash('sha256').update(readFileSync(found.file)).digest('hex'), where: 'public' };
}

/** The path item a run-time family URL (blobMediaFamily.ts) or a rewritten URL names, by its pathname; null if none. */
let byPathname;
export function blobItemForUrl(url) {
  byPathname ??= new Map([...items().values()].map((item) => [item.pathname, item]));
  return byPathname.get(String(url).split(/[?#]/)[0].replace(/^[a-z]+:\/\/[^/]+/, '').replace(/^\//, '')) ?? null;
}

/** The site path `url` stands for: itself when it is a /media/ path, a path item's path when it is that item's family or
 *  rewritten URL; null otherwise. */
export function mediaPathOf(url) {
  return blobItemForUrl(url)?.path ?? sitePath(url);
}

/** The file names directly in a /media/ folder, from public/ and from Blob together (a folder that once held them all). */
export function mediaFolder(folder) {
  const site = sitePath(folder.endsWith('/') ? folder : `${folder}/`);
  if (!site) throw new Error(`media-files: ${folder} is not a /media/ folder`);
  const local = join(PUBLIC, site);
  const names = new Set(existsSync(local) ? readdirSync(local, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name) : []);
  for (const path of items().keys()) if (path.startsWith(site) && !path.slice(site.length).includes('/')) names.add(path.slice(site.length));
  return [...names].sort();
}

/** A picture's bytes, SHA-256 and pixel size [width, height]: read (and its header decoded by `readSize`) from public/,
 *  or the Blob manifest's row. An Error when it ships from neither. */
export function mediaPicture(path, readSize) {
  const found = mediaFile(path);
  if (!found) throw new Error(`media-files: ${path} ships from neither public/ nor Blob`);
  if (found.where === 'blob') return { bytes: found.bytes, sha256: found.sha256, size: [found.width, found.height], where: 'blob' };
  const bytes = readFileSync(found.file);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), size: readSize(bytes), where: 'public' };
}

export { idForPath };

/** Every file under a /media/ folder (its subfolders too), from public/ and from Blob together, as sorted site paths;
 *  `kind` filters by name. */
export function mediaWalk(folder, kind = /./) {
  const site = sitePath(folder.endsWith('/') ? folder : `${folder}/`);
  if (!site) throw new Error(`media-files: ${folder} is not a /media/ folder`);
  const out = new Set();
  const walk = (dir, base) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${base}${entry.name}/`);
      else if (entry.isFile() && kind.test(entry.name)) out.add(`${base}${entry.name}`);
    }
  };
  walk(join(PUBLIC, site), site);
  for (const path of items().keys()) if (path.startsWith(site) && kind.test(path.slice(path.lastIndexOf('/') + 1))) out.add(path);
  return [...out].sort();
}

/** The top folders under /media/ that hold anything, from public/ and from Blob together. */
export function mediaTopFolders() {
  const names = new Set(readdirSync(join(PUBLIC, 'media'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  for (const path of items().keys()) names.add(path.split('/')[2]);
  return [...names].sort();
}

/** A local file with the path's bytes, for a tool that reads them (a decoder, a thumbnail cutter): public/ for a small
 *  file, the staging folder for a big one (an Error when it is on Blob and not staged on this machine). */
export function mediaSource(path) {
  const found = mediaFile(path);
  if (found?.where === 'public') return found.file;
  const site = sitePath(path);
  const staged = site && join(STAGING, site.slice('/media/'.length));
  if (staged && existsSync(staged)) return staged;
  throw new Error(`media-files: ${path} is ${found ? 'on Blob and not in the staging folder' : 'not published'} (${STAGING})`);
}

/**
 * Write a media file where it belongs: a small one into public/, a big one (blob-media isBigMedia) into the staging
 * folder, removing any public copy, for `node tools/blob-media.mjs adopt` to stage and the owner's upload to put.
 * Returns 'public' or 'staging'.
 */
export function writeMedia(path, bytes) {
  const site = sitePath(path);
  if (!site) throw new Error(`media-files: ${path} is not a /media/ path`);
  const big = isBigMedia(site, bytes.length);
  const target = big ? join(STAGING, site.slice('/media/'.length)) : join(PUBLIC, site);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(target) || !readFileSync(target).equals(bytes)) writeFileSync(target, bytes);
  if (big) rmSync(join(PUBLIC, site), { force: true });
  return big ? 'staging' : 'public';
}

/** Remove a media file from public/ and the staging folder; a Blob item's manifest row goes with
 *  `node tools/blob-media.mjs drop --path=/media/…`. */
export function removeMedia(path) {
  const site = sitePath(path);
  if (!site) throw new Error(`media-files: ${path} is not a /media/ path`);
  rmSync(join(PUBLIC, site), { force: true });
  rmSync(join(STAGING, site.slice('/media/'.length)), { force: true });
}
