#!/usr/bin/env node
// The media library's builder (2026-11-16): public/media/library-r3 from the published folders' manifests
// (tools/media-library/sources.mjs) and the pictures only the library holds (its packs). It replaces the hand-run
// snapshot of 10-21..24, built outside the repository (a lane folder's organize-r3.py and build.py, whose plan and
// masters are gone), which left /media three weeks behind the site.
//
//   node tools/media-library/build.mjs            check: the census is clean, the committed library is the plan, every
//                                                 linked picture is the file its thumbnail was cut from (lock.json), and
//                                                 the manual prints the count; exits 1 with what is stale
//   node tools/media-library/build.mjs --plan     the same, and every change the plan makes
//   node tools/media-library/build.mjs --write    write it: each changed collection's packs (its own pictures' WebP bytes
//                                                 end to end, at most 24 MB a pack), thumbnail sheets (rows of 135 px
//                                                 cells, 2040 px wide, WebP q55, through the master filter when one is
//                                                 configured: tools/media-r5/master-filter.mjs) and index; the library's
//                                                 index, lock.json and the manual index's count (site/docs.html)
//   --all                                         with --write: every collection's sheets again, changed or not
//
// A picture with a moving take carries its clip in its set's `clips` (its files in the player's ladder order); the viewer
// plays it on a press (src/presentation/mediaLibrary.ts). New words or clips rewrite the indexes only, never the sheets.
// After publishing a folder under public/media (or re-rendering a picture in place), run --write and commit the
// library with it; the library's receipt (tools/marketing-shots/media-library.selftest.mjs) fails until then.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LIB, LIBRARY_ROOT, LOCK_FILE, ROOT, census, differences, entriesOf, lockOf, planLibrary, publicFile, readLibrary, readLock, mediaSha16,
} from './library.mjs';
import { mediaBytes, mediaFolder, mediaSource, removeMedia, STAGING, writeMedia } from '../media-files.mjs';

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const ALL = args.has('--all');
const THUMB_H = 135, THUMB_MAX_W = 480, SHEET_W = 2040, SHEET_ROWS = 15, GUTTER = 2, PACK_MAX = 24 * 1024 * 1024;
const SHEET_QUALITY = 55;
const DOCS = join(ROOT, 'site/docs.html');
const COUNT_RE = /(data-i18n="docs\.aside\.libraryTitle" data-i18n-vars='\{"count":")([^"]*)("\}'>)([^<]*)(<)/;

/** The count as the manual index prints it ("1,046"). */
export const printedCount = (n) => n.toLocaleString('en-US');

function thumbSize(w, h) {
  let th = THUMB_H;
  let tw = Math.max(1, Math.round((w * th) / h));
  if (tw > THUMB_MAX_W) { tw = THUMB_MAX_W; th = Math.max(1, Math.round((h * THUMB_MAX_W) / w)); }
  return [tw, th];
}

/** Lay a collection's thumbnails out in rows on its sheets: each picture's [sheet, x, y, tw, th] and each sheet's height. */
function layout(items) {
  const cells = [];
  const heights = [];
  let sheet = -1, x = 0, y = 0;
  for (const item of items) {
    const [tw, th] = thumbSize(item.width, item.height);
    if (sheet >= 0 && x + tw > SHEET_W) { x = 0; y += THUMB_H + GUTTER; }
    if (sheet < 0 || y + THUMB_H > SHEET_ROWS * (THUMB_H + GUTTER)) { sheet++; x = 0; y = 0; heights.push(0); }
    cells.push([sheet, x, y, tw, th]);
    heights[sheet] = Math.max(heights[sheet], y + THUMB_H);
    x += tw + GUTTER;
  }
  return { cells, heights };
}

const stale = (lock, url) => lock[url] !== mediaSha16(url);

function check(library, plan, results, log) {
  const { problems, counts } = census(plan, results);
  const lines = [];
  if (problems.length) lines.push(`census: ${problems.length} published pictures neither in the library nor given a reason`, ...problems.slice(0, 20).map((p) => `  ${p}`));
  const diff = differences(plan, library);
  if (diff.length) lines.push('the committed library is not the plan:', ...diff.map((d) => `  ${d}`));
  const lock = readLock();
  const linked = [...new Set(entriesOf(plan).filter((e) => e.item.ref.url).map((e) => e.item.ref.url))];
  const changed = linked.filter((url) => !(url in lock) || stale(lock, url));
  if (changed.length) lines.push(`${changed.length} linked pictures changed since their thumbnails were cut (lock.json): ${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ' ...' : ''}`);
  const extra = Object.keys(lock).filter((url) => !linked.includes(url));
  if (extra.length) lines.push(`lock.json names ${extra.length} pictures the library does not link: ${extra.slice(0, 3).join(', ')}`);
  const printed = readFileSync(DOCS, 'utf8').match(COUNT_RE);
  if (!printed || printed[2] !== printedCount(plan.count)) lines.push(`site/docs.html prints ${printed?.[2] ?? 'no'} library count, the plan has ${printedCount(plan.count)}`);
  return { lines, counts };
}

async function write(library, plan) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const { filterPublishedImage, masterFilter } = await import('../media-r5/master-filter.mjs');
  const filter = masterFilter();
  console.log(filter ? `sheets through the master filter (${filter})` : 'no master filter configured: sheets as encoded');
  const lock = readLock();
  const written = new Set();
  const gone = [];
  const packBytes = new Map();
  const packedBytes = (collectionKey, ref) => {
    const old = library.collections.find((c) => c.key === collectionKey);
    // (media-blob-279) a pack is big media: its bytes are in the staging folder on the machine that builds the library
    const file = mediaSource(`/media/${LIBRARY_ROOT}/${collectionKey}/${old.packs[ref.pack]}`);
    if (!packBytes.has(file)) packBytes.set(file, readFileSync(file));
    return packBytes.get(file).subarray(ref.offset, ref.offset + ref.length);
  };
  const summaries = [];
  for (const c of plan.collections) {
    const dir = join(LIB, c.key);
    mkdirSync(dir, { recursive: true });
    const old = library.collections.find((x) => x.key === c.key);
    const items = c.sets.flatMap((s) => s.items);
    // the sheets and packs depend on the pictures' order, sizes and files only: new words or clips never re-cut them
    const cells = (col) => col.sets.flatMap((s) => s.items.map((i) => [i.width, i.height, i.ref.url ?? `packed:${i.ref.length}`]));
    const sameShape = old && JSON.stringify(cells(old)) === JSON.stringify(cells(c));
    const fresh = items.every((i) => !i.ref.url || (i.ref.url in lock && !stale(lock, i.ref.url)));
    const rebuild = ALL || !sameShape || !fresh || !old?.sheets?.length;
    let packs = old?.packs ?? [];
    let sheets = old?.sheets ?? [];
    if (rebuild) {
      // the packs: the collection's own pictures, end to end in the library's order
      const files = [];
      let current = null;
      for (const item of items) {
        if (item.ref.url) continue;
        const bytes = Buffer.from(packedBytes(c.key, item.ref));
        if (!current || current.size + bytes.length > PACK_MAX) { current = { parts: [], size: 0 }; files.push(current); }
        item.ref = { pack: files.length - 1, offset: current.size, length: bytes.length };
        current.parts.push(bytes);
        current.size += bytes.length;
        item.bytes = bytes;
      }
      packs = files.map((_, k) => `pack-${String(k).padStart(3, '0')}.bin`);
      // the sheets: every picture's thumbnail from its web copy
      const { cells, heights } = layout(items);
      const canvases = heights.map((h) => {
        const canvas = createCanvas(SHEET_W, h);
        const g = canvas.getContext('2d');
        g.fillStyle = '#07090b';
        g.fillRect(0, 0, SHEET_W, h);
        return canvas;
      });
      for (const [k, item] of items.entries()) {
        const [sheet, x, y, tw, th] = cells[k];
        const image = await loadImage(item.bytes ?? readFileSync(item.ref.url.startsWith('/media/') ? mediaSource(item.ref.url) : publicFile(item.ref.url)));
        // halve toward the cell before the last draw, so the thumbnail averages its picture instead of sampling it
        let src = image, w = image.width, h = image.height;
        while (w / 2 >= tw && h / 2 >= th) {
          const half = createCanvas(Math.round(w / 2), Math.round(h / 2));
          const hg = half.getContext('2d');
          hg.imageSmoothingEnabled = true;
          hg.imageSmoothingQuality = 'high';
          hg.drawImage(src, 0, 0, half.width, half.height);
          src = half; w = half.width; h = half.height;
        }
        const g = canvases[sheet].getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, x, y, tw, th);
        item.thumb = [sheet, x, y, tw, th];
        delete item.bytes;
      }
      sheets = [];
      for (const [k, canvas] of canvases.entries()) {
        const name = `thumbs-${String(k).padStart(3, '0')}.webp`;
        const encoded = await canvas.encode('webp', SHEET_QUALITY);
        const bytes = await filterPublishedImage(encoded, `media-${c.key}-${name.replace('.webp', '')}`, { type: 'image/webp', quality: SHEET_QUALITY }, filter);
        written.add(writeMedia(`/media/${LIBRARY_ROOT}/${c.key}/${name}`, Buffer.from(bytes)));
        sheets.push([name, SHEET_W, heights[k]]);
      }
      for (const [k, f] of files.entries()) {
        written.add(writeMedia(`/media/${LIBRARY_ROOT}/${c.key}/${packs[k]}`, Buffer.concat(f.parts)));
      }
      // files the collection no longer uses
      for (const f of mediaFolder(`/media/${LIBRARY_ROOT}/${c.key}/`)) {
        if (/^(?:pack-\d+\.bin|thumbs-\d+\.webp)$/.test(f) && !packs.includes(f) && !sheets.some(([n]) => n === f)) {
          removeMedia(`/media/${LIBRARY_ROOT}/${c.key}/${f}`);
          gone.push(`/media/${LIBRARY_ROOT}/${c.key}/${f}`);
        }
      }
      console.log(`${c.key}: ${items.length} pictures, ${packs.length} packs, ${sheets.length} sheets written`);
    } else {
      console.log(`${c.key}: ${items.length} pictures, unchanged`);
    }
    const index = {
      key: c.key, title: c.title, blurb: c.blurb, count: items.length, packs, sheets,
      sets: c.sets.map((s) => ({
        key: s.key, title: s.title, kind: s.kind,
        items: s.items.map((i) => [i.name, i.width, i.height, ...i.thumb, ...('url' in i.ref ? [i.ref.url] : [i.ref.pack, i.ref.offset, i.ref.length])]),
        captions: s.items.map((i) => i.caption),
        ...(s.items.some((i) => i.clip) ? { clips: s.items.map((i) => i.clip ?? null) } : {}),
      })),
    };
    writeFileSync(join(dir, 'index.json'), JSON.stringify(index));
    // a file just written to the staging folder is not in the Blob manifest until adopt: its size is the staged file's
    const sizeOf = (f) => (existsSync(join(STAGING, LIBRARY_ROOT, c.key, f)) ? statSync(join(STAGING, LIBRARY_ROOT, c.key, f)).size
      : mediaBytes(`/media/${LIBRARY_ROOT}/${c.key}/${f}`));
    const bytes = mediaFolder(`/media/${LIBRARY_ROOT}/${c.key}/`).reduce((sum, f) => sum + sizeOf(f), 0);
    summaries.push({ key: c.key, title: c.title, blurb: c.blurb, count: items.length, sets: c.sets.length, bytes });
  }
  // a collection the plan no longer has
  for (const old of library.collections) {
    if (!plan.collections.some((c) => c.key === old.key)) rmSync(join(LIB, old.key), { recursive: true, force: true });
  }
  const count = summaries.reduce((sum, c) => sum + c.count, 0);
  writeFileSync(join(LIB, 'index.json'), JSON.stringify({ version: 2, count, collections: summaries }, null, 1));
  writeFileSync(LOCK_FILE, `${JSON.stringify(lockOf(plan), null, 1)}\n`);
  const docs = readFileSync(DOCS, 'utf8');
  const shown = printedCount(count);
  const next = docs.replace(COUNT_RE, (_, a, _n, b, _t, c) => `${a}${shown}${b}${shown} pictures${c}`);
  if (next === docs && !COUNT_RE.test(docs)) throw new Error('site/docs.html has no library count to write');
  writeFileSync(DOCS, next);
  if (written.has('staging') || gone.length) {
    console.log(`library: big packs and sheets are in the staging folder; run node tools/blob-media.mjs adopt${gone.length ? ` and drop --path=${gone.join(',')}` : ''}, then families --write`);
  }
  console.log(`library: ${count} pictures in ${summaries.length} collections, ${(summaries.reduce((s, c) => s + c.bytes, 0) / 1048576).toFixed(1)} MB; the manual prints ${shown}`);
}

const library = readLibrary();
const { plan, results, log } = planLibrary(library);
if (args.has('--plan')) for (const line of log) console.log(line);
if (WRITE) {
  const { problems } = census(plan, results);
  if (problems.length) {
    console.error(`census: ${problems.length} published pictures neither in the library nor given a reason:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  await write(library, plan);
} else {
  const { lines, counts } = check(library, plan, results, log);
  if (lines.length) {
    console.error(`${lines.join('\n')}\nrun: node tools/media-library/build.mjs --write`);
    process.exit(1);
  }
  console.log(`media library: ${plan.count} pictures, ${entriesOf(plan).filter((e) => e.item.clip).length} of them with a clip, current with public/media (${counts.files} pictures there: ${counts.linked} in the library, ${counts.noted} rungs, copies and older renders, ${counts.excluded} in excluded folders; ${counts.videos} films: ${counts.played} in clips)`);
}
