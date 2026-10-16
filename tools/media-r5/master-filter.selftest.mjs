// master-filter.mjs: with no filter the masters pass untouched (stills byte for byte, films by path); a configured
// filter is called once per master with the documented arguments and its output is what gets encoded; a filter that
// fails, or names a non-executable, stops the run; a publisher's own encode is kept unless the filter changed it.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { filterPublishedImage, filterStill, filteredFilm, filteredStill, masterFilter } from './master-filter.mjs';

const dir = mkdtempSync(join(tmpdir(), 'master-filter-'));
try {
  const still = join(dir, 'still.png'), film = join(dir, 'film.mov');
  writeFileSync(still, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  writeFileSync(film, 'film');

  // no filter: nothing configured, no local file
  assert.equal(masterFilter({}, join(dir, 'absent')), null);
  const copied = filterStill(still, join(dir, 'out', 'copy.png'), 's01-still', null);
  assert.deepEqual(readFileSync(copied), readFileSync(still), 'an unfiltered still is a byte copy');
  assert.equal(filteredStill(still, join(dir, 'work'), 's01-still', null), still, 'an unfiltered still is read in place');
  assert.equal(filteredFilm(film, join(dir, 'work'), 's01-film', null), film, 'an unfiltered film is read in place');

  // a named filter must be executable
  writeFileSync(join(dir, 'plain.txt'), 'x');
  assert.throws(() => masterFilter({ COT_MASTER_FILTER: join(dir, 'plain.txt') }), /not an executable/);

  // a working filter: logs its arguments and writes its output
  const log = join(dir, 'calls.log'), fake = join(dir, 'filter.sh');
  writeFileSync(fake, `#!/bin/sh\necho "$1 $4" >> '${log}'\ncp "$2" "$3"\n`);
  chmodSync(fake, 0o755);
  assert.equal(masterFilter({ COT_MASTER_FILTER: fake }), fake);
  assert.equal(masterFilter({}, fake), fake, 'the local file is used when the environment names none');
  const s = filterStill(still, join(dir, 'out', 'f.png'), 's02-still', fake);
  assert.deepEqual(readFileSync(s), readFileSync(still));
  const work = join(dir, 'work');
  const cached = filteredStill(still, work, 'b07-frame', fake);
  assert.equal(cached, join(work, 'b07-frame.master.png'));
  const later = Date.now() / 1000 + 5;
  utimesSync(cached, later, later);
  assert.equal(filteredStill(still, work, 'b07-frame', fake), cached, 'a filtered still newer than its master is reused');
  const f = filteredFilm(film, work, 's02-film', fake);
  assert.equal(f, join(work, 's02-film.master.mov'));
  assert.equal(readFileSync(f, 'utf8'), 'film');
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), ['still s02-still', 'still b07-frame', 'film s02-film'],
    'one call per master, with its kind and id');

  // a failing filter stops the run instead of encoding an unfiltered delivery
  const bad = join(dir, 'bad.sh');
  writeFileSync(bad, '#!/bin/sh\nexit 3\n');
  chmodSync(bad, 0o755);
  assert.throws(() => filterStill(still, join(dir, 'out', 'bad.png'), 's03-still', bad));
  assert.throws(() => filteredFilm(film, work, 's03-film', bad));
  assert.ok(!existsSync(join(dir, 'out', 'bad.png')));
  // a publisher's own encode: kept when there is no filter or the filter passes the picture through; re-encoded at
  // the publisher's type when the filter changes it
  const picture = (shade) => { const c = createCanvas(16, 9); const g = c.getContext('2d'); g.fillStyle = shade; g.fillRect(0, 0, 16, 9); return c; };
  const webpBytes = picture('#556b2f').toBuffer('image/webp', 90);
  assert.equal(await filterPublishedImage(webpBytes, 'og-test', { type: 'image/webp', quality: 90, workDir: work }, null), webpBytes);
  assert.equal(await filterPublishedImage(webpBytes, 'og-test', { type: 'image/webp', quality: 90, workDir: work }, fake), webpBytes,
    'a pass-through filter keeps the original encode');
  const changed = join(dir, 'changed.png'); writeFileSync(changed, picture('#8b4513').toBuffer('image/png'));
  const swap = join(dir, 'swap.sh');
  writeFileSync(swap, `#!/bin/sh\ncp '${changed}' "$3"\n`); chmodSync(swap, 0o755);
  const out = await filterPublishedImage(webpBytes, 'minimap-test', { type: 'image/webp', quality: 90, workDir: work }, swap);
  assert.notDeepEqual(out, webpBytes, 'a changed picture is re-encoded');
  assert.equal(out.subarray(0, 4).toString('latin1'), 'RIFF'); assert.equal(out.subarray(8, 12).toString('latin1'), 'WEBP');
  const jpeg = await filterPublishedImage(webpBytes, 'og-jpeg', { type: 'image/jpeg', quality: 88, workDir: work }, swap);
  assert.deepEqual([...jpeg.subarray(0, 2)], [0xff, 0xd8], 'the publisher\'s type is kept');
  await assert.rejects(() => filterPublishedImage(webpBytes, 'bad', { type: 'image/gif', workDir: work }, swap), /unsupported type/);
  console.log('master-filter selftest: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
