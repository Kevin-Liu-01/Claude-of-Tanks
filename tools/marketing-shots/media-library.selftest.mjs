// The media library (2026-10-19, owner: "lets get all our images on main, all of them ... all should be visible on the
// website"; 2026-10-20 on r1's 11,215 pictures: "wth that seems like way too much"; 2026-10-21 on r2's 391 finals: "i
// feel like were missing so many pictures"): public/media/library-r3 holds every finished picture of the media rounds'
// current takes, grouped by what they show (battle scenes by battlefield, vehicles by country, duels by time of day, key
// art...), each with a caption in every locale: its title, a line about it, and its shot. Each collection's index
// names its sets and pictures; a picture is a byte range of a pack file (WebP files end to end, read by the page with an
// HTTP range request) or a file the site already publishes, and its thumbnail is a cell of a thumbnail sheet. This
// receipt reads every range back as a WebP of the stated size, holds every cell inside its sheet, every pack covered
// end to end, every caption worded in each locale (never a file name, never the media rounds' own words), and the
// counts the pages print equal to the index.
// Since 2026-11-16 (owner: "what about our /media page? its missing so much stuff ... between that page going up and
// new stuf"; the library was a snapshot built outside the repository, three weeks and 200 pictures behind) it also
// holds the library current with public/media (tools/media-library): every picture published there is in the library
// or has a reason in tools/media-library/sources.mjs, the committed library is what the builder plans from the
// manifests, and every linked picture is the file its thumbnail was cut from (a re-render in place re-cuts it).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { census, differences, entriesOf, lockOf, planLibrary, readLibrary, readLock } from '../media-library/library.mjs';
import { mediaBytes, mediaExists, mediaFile } from '../media-files.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB = join(ROOT, 'public/media/library-r3');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** A WebP file's pixel size from its first 30 bytes (VP8, VP8L or VP8X). */
export function webpSize(head) {
  assert.equal(head.toString('latin1', 0, 4), 'RIFF');
  assert.equal(head.toString('latin1', 8, 12), 'WEBP');
  const chunk = head.toString('latin1', 12, 16);
  if (chunk === 'VP8X') return [1 + head.readUIntLE(24, 3), 1 + head.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [head.readUInt16LE(26) & 0x3fff, head.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const b = head.subarray(21, 25);
    return [1 + (((b[1] & 0x3f) << 8) | b[0]), 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6))];
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

function headAt(file, offset, length = 30) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, offset);
    return buf;
  } finally {
    closeSync(fd);
  }
}

// the page: the Filming manual's last section mounts the library, the manual's index links to it
const topics = read('src/docs/topics.ts');
assert.match(topics, /docs\.topic\.filming\.s11\.t/, 'the Filming manual has the library section');
assert.match(read('src/docs/filming.ts'), /#topic-section-11[\s\S]*mediaLibrary\.ts/, 'filming.ts mounts the library in it');
for (const locale of ['en-US', 'zh-CN']) {
  const catalog = JSON.parse(read(`src/ui/i18nCatalog.${locale}.json`));
  for (const key of ['mediaLibrary.tabsAria', 'mediaLibrary.openAria', 'mediaLibrary.loading', 'docs.topic.filming.s11.t',
    'docs.topic.filming.s11.p1', 'docs.aside.libraryTitle']) {
    assert.ok(catalog[key], `${locale} has ${key}`);
  }
}

if (!existsSync(join(LIB, 'index.json'))) {
  console.log('media-library.selftest: no library in this tree; the page and catalogs checked');
  process.exit(0);
}
const top = JSON.parse(readFileSync(join(LIB, 'index.json'), 'utf8'));
assert.equal(top.version, 2, 'a captioned library');
const LOCALES = ['en-US', 'zh-CN'];
// the words a visitor reads, in a locale: a text is one string for every locale or a string per locale
const said = (text, locale) => (typeof text === 'string' ? text : text?.[locale]);
const ROUND_WORDS = /\b(?:round \d+|build \d+|finals|deliver(?:y|ies|ed)?|r\d+)\b/i;
function worded(text, what, optional = false) {
  if (text == null && optional) return;
  for (const locale of LOCALES) {
    const words = said(text, locale);
    assert.ok(typeof words === 'string' && words.trim(), `${what}: worded in ${locale}`);
    assert.ok(!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(words), `${what}: "${words}" is a file name, not a title`);
    if (locale === 'en-US') assert.ok(!ROUND_WORDS.test(words), `${what}: "${words}" names a media round`);
  }
}
let captions = 0;
assert.ok(top.collections.length >= 6, 'the library holds the finals by collection');
let pictures = 0, ranges = 0, links = 0, sheets = 0, bytes = 0, clips = 0, clipFiles = 0;
for (const summary of top.collections) {
  assert.match(summary.key, /^[a-z0-9-]+$/);
  worded(summary.title, `${summary.key}: the title`);
  worded(summary.blurb, `${summary.key}: the blurb`);
  const dir = join(LIB, summary.key);
  const collection = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  assert.equal(collection.key, summary.key);
  // (media-blob-279) a big sheet or pack is on Vercel Blob: its size and bytes are the Blob manifest's row, and a pack's
  // ranges are read only where its bytes are in the tree (tools/media-library/build.mjs reads them when it cuts a pack)
  const site = (name) => `/media/library-r3/${summary.key}/${name}`;
  const sheetSizes = collection.sheets.map(([name, w, h]) => {
    const blob = mediaFile(site(name))?.where === 'blob' ? mediaFile(site(name)) : null;
    const size = blob ? [blob.width, blob.height] : webpSize(headAt(join(dir, name)));
    assert.deepEqual(size, [w, h], `${summary.key}/${name}: the sheet is the size its index states`);
    sheets++;
    return size;
  });
  const covered = collection.packs.map(() => 0);
  let count = 0;
  for (const set of collection.sets) {
    assert.match(set.key, /^[a-z0-9-]+$/, `${summary.key}: set key ${set.key}`);
    worded(set.title, `${summary.key}/${set.key}: the title`);
    assert.equal(set.captions?.length, set.items.length, `${summary.key}/${set.key}: a caption a picture`);
    // a picture's clip: its moving take's published files in the player's ladder order (VP9 before H.264)
    if (set.clips) {
      assert.equal(set.clips.length, set.items.length, `${summary.key}/${set.key}: a clip entry a picture`);
      set.clips.forEach((clip, k) => {
        if (clip == null) return;
        const what = `${summary.key}/${set.key}/${set.items[k][0]}: its clip`;
        assert.ok(clip.sources.length > 0 && (clip.seconds == null || clip.seconds > 0), what);
        for (const [src, type, rung] of clip.sources) {
          assert.equal(type, /\.mp4$/.test(src) ? 'video/mp4' : 'video/webm', `${what}: ${src} is typed by its file`);
          assert.ok(rung === undefined || rung === 'phone' || rung === 'wide', `${what}: ${src}'s rung`);
          assert.ok(mediaExists(src), `${what}: ${src} is published`);
          clipFiles++;
        }
        clips++;
      });
    }
    set.captions.forEach(([title, about, shot], k) => {
      const what = `${summary.key}/${set.key}/${set.items[k][0]}`;
      worded(title, `${what}: the title`);
      worded(about, `${what}: the about line`, true);
      worded(shot, `${what}: the shot`, true);
      captions++;
    });
    const names = new Set();
    for (const item of set.items) {
      const [name, w, h, sheet, x, y, tw, th, ...ref] = item;
      assert.match(name, /^[a-z0-9-]+$/, `${summary.key}/${set.key}: picture name ${name}`);
      assert.ok(!names.has(name), `${summary.key}/${set.key}: ${name} once`);
      names.add(name);
      const [sw, sh] = sheetSizes[sheet];
      assert.ok(x >= 0 && y >= 0 && tw > 0 && th > 0 && x + tw <= sw && y + th <= sh, `${summary.key}/${set.key}/${name}: the thumbnail is inside its sheet`);
      if (typeof ref[0] === 'string') {
        assert.ok(mediaExists(ref[0]), `${summary.key}/${set.key}/${name}: the published file ${ref[0]} exists`);
        links++;
      } else {
        const [pack, offset, length] = ref;
        assert.equal(offset, covered[pack], `${summary.key}/${set.key}/${name}: ranges run end to end`);
        covered[pack] += length;
        if (existsSync(join(dir, collection.packs[pack]))) {
          assert.deepEqual(webpSize(headAt(join(dir, collection.packs[pack]), offset)), [w, h], `${summary.key}/${set.key}/${name}: its range is a WebP of ${w}x${h}`);
        }
        ranges++;
      }
      count++;
    }
  }
  collection.packs.forEach((pack, k) => {
    const size = mediaBytes(site(pack));
    assert.equal(covered[k], size, `${summary.key}/${pack}: every byte belongs to one picture`);
    assert.ok(size <= 24 * 1024 * 1024, `${summary.key}/${pack}: at most 24 MB`);
    bytes += size;
  });
  assert.equal(count, collection.count, `${summary.key}: its count`);
  assert.equal(count, summary.count, `${summary.key}: the library's count`);
  pictures += count;
}
assert.equal(pictures, top.count, 'the library count is the sum of its collections');
// the count the manual's index prints
const docs = read('site/docs.html');
const printed = docs.match(/data-i18n="docs\.aside\.libraryTitle" data-i18n-vars='\{"count":"([\d,]+)"\}'/);
assert.ok(printed, 'the manual index links the library with its count');
assert.equal(Number(printed[1].replaceAll(',', '')), top.count, 'the manual index prints the library count');
assert.match(docs, /href="\/docs\/filming#library"/, 'the manual index opens the library');

// current with public/media: the census, the plan and the thumbnails' lock (fix: node tools/media-library/build.mjs --write)
const WRITE = 'run node tools/media-library/build.mjs --write and commit the library';
const library = readLibrary(LIB);
const { plan, results } = planLibrary(library);
const { problems, counts } = census(plan, results);
assert.deepEqual(problems, [], `every picture under public/media is in the library or has a reason in tools/media-library/sources.mjs (${WRITE}, or give it a reason)`);
assert.deepEqual(differences(plan, library), [], `the committed library is the plan the manifests make (${WRITE})`);
const lock = readLock();
const cut = lockOf(plan);
assert.deepEqual(Object.keys(lock).sort(), Object.keys(cut).sort(), `lock.json names exactly the linked pictures (${WRITE})`);
const recut = Object.keys(cut).filter((url) => cut[url] !== lock[url]);
assert.deepEqual(recut, [], `every linked picture is the file its thumbnail was cut from (${WRITE})`);
// the census bites: a picture the library stopped showing, with no reason, is reported by name
const shown = entriesOf(plan).find((e) => e.item.ref.url?.startsWith('/media/gallery-r1/'));
assert.ok(shown, 'the library shows the owner\'s gallery (public/media/gallery-r1)');
const without = { collections: plan.collections.map((c) => ({ ...c, sets: c.sets.map((s) => ({ ...s, items: s.items.filter((i) => i !== shown.item) })) })) };
assert.deepEqual(census(without, results).problems.map((p) => p.split(':')[0]), [shown.item.ref.url], 'a published still missing from the library fails the census');
// and a film no picture plays, with no reason, is reported by name (a battlefield's landmark loop, here)
const landmark = entriesOf(plan).find((e) => e.item.ref.url?.startsWith('/media/maps-r1/') && e.item.clip);
assert.ok(landmark, 'the library plays the battlefield picker\'s loops from its landmarks (public/media/maps-r1)');
const silent = { collections: plan.collections.map((c) => ({ ...c, sets: c.sets.map((s) => ({ ...s,
  items: s.items.map((i) => (i === landmark.item ? { ...i, clip: null } : i)) })) })) };
assert.deepEqual(census(silent, results).problems.map((p) => p.split(':')[0]), landmark.item.clip.sources.map(([src]) => src),
  'a published film no picture plays fails the census');
console.log(`media-library.selftest: ${pictures} pictures in ${top.collections.length} collections (${ranges} pack ranges, `
  + `${links} published files, ${sheets} thumbnail sheets, ${(bytes / 1048576).toFixed(0)} MB of packs) read back, `
  + `${captions} captions worded in ${LOCALES.join(' and ')}, ${clips} clips (${clipFiles} files); current with public/media (${counts.files} pictures there: `
  + `${counts.linked} in the library, ${counts.noted} rungs, copies and older renders, ${counts.excluded} in excluded folders; `
  + `${counts.videos} films, ${counts.played} in clips)`);
