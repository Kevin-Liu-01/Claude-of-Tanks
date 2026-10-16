// An optional local pass over the masters before any delivery is encoded from them.
// (site-loops and site-media for the site's takes; the minimap, field-guide, social-card, map and gallery publishers
// for the pictures they publish.)
//
// When the environment names an executable in COT_MASTER_FILTER (or shots/media-r5/master-filter exists and is
// executable), every master goes through it once:
//   <filter> still <in.png> <out.png> <id>     a still master, written to <out.png>
//   <filter> film  <in> <out.mov> <id>         a film master, written to <out.mov>
// and the deliveries are encoded from its output. With no filter configured, stills are copied byte for byte and
// films are read as rendered, exactly as before. A configured filter that fails stops the run: a delivery is never
// encoded half-filtered.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SHOTS } from './paths.mjs';

const LOCAL = join(SHOTS, 'master-filter');

function executable(file) {
  try { accessSync(file, constants.X_OK); return statSync(file).isFile(); } catch { return false; }
}

/** The configured filter executable, or null. */
export function masterFilter(env = process.env, local = LOCAL) {
  const named = env.COT_MASTER_FILTER;
  if (named) {
    if (!executable(named)) throw new Error(`COT_MASTER_FILTER=${named} is not an executable file`);
    return named;
  }
  return executable(local) ? local : null;
}

function runFilter(filter, args) {
  execFileSync(filter, args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

/** Writes the still master <src> to <dst> (through the filter when one is configured) and returns <dst>. */
export function filterStill(src, dst, id, filter = masterFilter()) {
  mkdirSync(dirname(dst), { recursive: true });
  if (!filter) { copyFileSync(src, dst); return dst; }
  runFilter(filter, ['still', src, dst, id]);
  if (!existsSync(dst)) throw new Error(`master filter wrote no still for ${id}`);
  return dst;
}

/**
 * The still to encode from: <src> itself with no filter, else its filtered copy in <workDir> (made once and reused
 * while it is newer than <src>).
 */
export function filteredStill(src, workDir, id, filter = masterFilter()) {
  if (!filter) return src;
  const dst = join(workDir, `${id}.master.png`);
  if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs) return dst;
  return filterStill(src, dst, id, filter);
}

/** The film to encode from: <src> itself with no filter, else its filtered copy in <workDir>. */
export function filteredFilm(src, workDir, id, filter = masterFilter()) {
  if (!filter) return src;
  mkdirSync(workDir, { recursive: true });
  const dst = join(workDir, `${id}.master.mov`);
  runFilter(filter, ['film', src, dst, id]);
  if (!existsSync(dst)) throw new Error(`master filter wrote no film for ${id}`);
  return dst;
}

/**
 * The bytes to publish for a picture a publisher encodes itself (a browser capture, a screenshot). With no filter the
 * bytes come back untouched. With one, the decoded picture goes through it as a PNG master, and is re-encoded at the
 * same type and quality (0-100) only when the filter changed it; a filter that passes it through keeps the original.
 */
export async function filterPublishedImage(bytes, id, { type, quality = 90, workDir = join(tmpdir(), 'cot-master-filter') } = {},
  filter = masterFilter()) {
  if (!filter) return bytes;
  if (!/^image\/(png|webp|jpeg)$/.test(type ?? '')) throw new Error(`filterPublishedImage: unsupported type ${type}`);
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const draw = async (data) => {
    const image = await loadImage(data);
    const canvas = createCanvas(image.width, image.height);
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas;
  };
  mkdirSync(workDir, { recursive: true });
  const src = join(workDir, `${id}.capture.png`), dst = join(workDir, `${id}.capture.filtered.png`);
  const png = (await draw(bytes)).toBuffer('image/png');
  writeFileSync(src, png);
  filterStill(src, dst, id, filter);
  const filtered = readFileSync(dst);
  if (filtered.equals(png)) return bytes;
  const canvas = await draw(filtered);
  return type === 'image/png' ? canvas.toBuffer('image/png') : canvas.toBuffer(type, quality);
}
