// The media library (2026-10-19, owner: "lets get all our images on main, all of them ... all should be visible on the
// website"; 2026-10-20 on r1's 11,215 pictures: "wth that seems like way too much", so finals only): public/media/
// library-r2 holds the current final of every subject the media rounds filmed, by collection. Each collection's index
// names its sets and pictures; a picture is a byte range of a pack file (WebP files end to end, read by the page with an
// HTTP range request) or a file the site already publishes, and its thumbnail is a cell of a thumbnail sheet. This
// receipt reads every range back as a WebP of the stated size, holds every cell inside its sheet, every pack covered
// end to end, and the counts the pages print equal to the index.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB = join(ROOT, 'public/media/library-r2');
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
  for (const key of ['mediaLibrary.total', 'mediaLibrary.openAria', 'mediaLibrary.loading', 'docs.topic.filming.s11.t',
    'docs.topic.filming.s11.p1', 'docs.aside.libraryTitle']) {
    assert.ok(catalog[key], `${locale} has ${key}`);
  }
}

if (!existsSync(join(LIB, 'index.json'))) {
  console.log('media-library.selftest: no library in this tree; the page and catalogs checked');
  process.exit(0);
}
const top = JSON.parse(readFileSync(join(LIB, 'index.json'), 'utf8'));
assert.equal(top.version, 1);
assert.ok(top.collections.length >= 6, 'the library holds the finals by collection');
let pictures = 0, ranges = 0, links = 0, sheets = 0, bytes = 0;
for (const summary of top.collections) {
  assert.match(summary.key, /^[a-z0-9-]+$/);
  const dir = join(LIB, summary.key);
  const collection = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  assert.equal(collection.key, summary.key);
  const sheetSizes = collection.sheets.map(([name, w, h]) => {
    const size = webpSize(headAt(join(dir, name)));
    assert.deepEqual(size, [w, h], `${summary.key}/${name}: the sheet is the size its index states`);
    sheets++;
    return size;
  });
  const covered = collection.packs.map(() => 0);
  let count = 0;
  for (const set of collection.sets) {
    assert.match(set.key, /^[a-z0-9-]+$/, `${summary.key}: set key ${set.key}`);
    const names = new Set();
    for (const item of set.items) {
      const [name, w, h, sheet, x, y, tw, th, ...ref] = item;
      assert.match(name, /^[a-z0-9-]+$/, `${summary.key}/${set.key}: picture name ${name}`);
      assert.ok(!names.has(name), `${summary.key}/${set.key}: ${name} once`);
      names.add(name);
      const [sw, sh] = sheetSizes[sheet];
      assert.ok(x >= 0 && y >= 0 && tw > 0 && th > 0 && x + tw <= sw && y + th <= sh, `${summary.key}/${set.key}/${name}: the thumbnail is inside its sheet`);
      if (typeof ref[0] === 'string') {
        assert.ok(existsSync(join(ROOT, 'public', ref[0])), `${summary.key}/${set.key}/${name}: the published file ${ref[0]} exists`);
        links++;
      } else {
        const [pack, offset, length] = ref;
        assert.equal(offset, covered[pack], `${summary.key}/${set.key}/${name}: ranges run end to end`);
        covered[pack] += length;
        assert.deepEqual(webpSize(headAt(join(dir, collection.packs[pack]), offset)), [w, h], `${summary.key}/${set.key}/${name}: its range is a WebP of ${w}x${h}`);
        ranges++;
      }
      count++;
    }
  }
  collection.packs.forEach((pack, k) => {
    const size = statSync(join(dir, pack)).size;
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
console.log(`media-library.selftest: ${pictures} pictures in ${top.collections.length} collections (${ranges} pack ranges, `
  + `${links} published files, ${sheets} thumbnail sheets, ${(bytes / 1048576).toFixed(0)} MB of packs) read back`);
