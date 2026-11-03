// site-loops.mjs resumes only from whole outputs (2026-11-02 audit S5). It wrote every ffmpeg output straight to its
// final name and called a take up to date when its <id>.mp4 was newer than the master, so an encode killed mid-run left a
// truncated format the next run reported "formats up to date" (and site-media shipped); a truncated film proxy at its
// final name let --drop-film-masters delete the master, the only good copy. Each output is now written under a partial
// name and renamed into place once whole (atomic-output.mjs), and a take is up to date only once its poster, the last
// format, is newer than its inputs.
// The real site-loops.mjs runs on a fixture take with a stand-in ffmpeg and ffprobe on PATH (shell scripts: ffmpeg writes
// "complete <name>" to its last argument, or, for the name FAKE_FFMPEG_FAIL matches, a few bytes and exits 1 as an encode
// stopped part-way would). Nothing real is encoded and nothing outside a temporary directory is written.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileAtomic, partialPath, sweepPartials, writeAtomic, writeFileAtomic } from './atomic-output.mjs';

const TOOL = fileURLToPath(new URL('./site-loops.mjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'cot-site-loops-'));
try {
  // ---- the helper: a throw mid-write leaves neither a final file nor a partial ---------------------------------------
  {
    const dir = join(root, 'helper');
    mkdirSync(dir);
    const final = join(dir, 'a.mp4');
    assert.match(partialPath(final), /\/\.a\.mp4\.partial-\d+\.mp4$/, 'hidden, beside the output, its extension kept for the muxer');
    assert.throws(() => writeAtomic(final, (partial) => { writeFileSync(partial, 'half'); throw new Error('encode stopped'); }), /encode stopped/);
    assert.deepEqual(readdirSync(dir), [], 'a failed write leaves no final file and no partial');
    writeFileAtomic(final, 'whole');
    copyFileAtomic(final, join(dir, 'b.mp4'));
    assert.deepEqual([readFileSync(final, 'utf8'), readFileSync(join(dir, 'b.mp4'), 'utf8')], ['whole', 'whole']);
    writeFileSync(join(dir, '.c.mp4.partial-999999999.mp4'), 'left by a killed run');
    assert.deepEqual(sweepPartials(dir), ['.c.mp4.partial-999999999.mp4'], 'a dead run\'s partial is swept');
    assert.deepEqual(readdirSync(dir).sort(), ['a.mp4', 'b.mp4']);
  }

  // ---- the real tool with a stand-in ffmpeg ----------------------------------------------------------------------------
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'ffmpeg'), `#!/bin/sh
for last; do :; done
case "$(basename "$last")" in
  *"\${FAKE_FFMPEG_FAIL:-<none>}"*) printf 'trunc' > "$last"; exit 1 ;;
esac
printf 'complete %s\\n' "$(basename "$last")" > "$last"
`);
  writeFileSync(join(bin, 'ffprobe'), `#!/bin/sh
case "$*" in *stream=height*) echo 2160 ;; *) echo 10.000 ;; esac
`);
  chmodSync(join(bin, 'ffmpeg'), 0o755);
  chmodSync(join(bin, 'ffprobe'), 0o755);
  const renders = join(root, 'renders'), deliver = join(root, 'deliver');
  for (const id of ['s01-test', 's02-test']) {
    mkdirSync(join(renders, 'films', id, 'films'), { recursive: true });
    writeFileSync(join(renders, 'films', id, 'films', `${id}-master.mov`), 'the master');
  }
  const run = (ids, fail = null, ...flags) => spawnSync(process.execPath, [TOOL, renders, deliver, ids, ...flags], { encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MEDIA_R5_FEATURES: 'off', COT_MASTER_FILTER: '', ...(fail ? { FAKE_FFMPEG_FAIL: fail } : {}) } });
  const out = (id, name) => join(deliver, id, name);
  const text = (id, name) => (existsSync(out(id, name)) ? readFileSync(out(id, name), 'utf8') : null);

  // an encode stopped part-way through the webm: no truncated webm at its final name, no poster
  const stopped = run('s01-test', '.webm');
  assert.notEqual(stopped.status, 0, 'the stopped encode fails the run');
  assert.equal(text('s01-test', 's01-test.webm'), null, `no truncated webm at its final name (${text('s01-test', 's01-test.webm')})`);
  assert.match(text('s01-test', 's01-test.mp4') ?? '', /^complete /, 'the formats before it are whole');
  assert.equal(existsSync(out('s01-test', 's01-test.jpg')), false, 'and the poster, written last, is not there');
  assert.deepEqual(readdirSync(join(deliver, 's01-test')).filter((name) => name.startsWith('.')), [], 'no partial is left behind');
  // the next run sees the take as not done and encodes every format again
  const resumed = run('s01-test');
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.doesNotMatch(resumed.stdout, /formats up to date/, 'a take whose encode stopped is not up to date');
  for (const name of ['s01-test.mp4', 's01-test-4k.mp4', 's01-test.webm', 's01-test-mobile.mp4', 's01-test.jpg']) {
    assert.match(text('s01-test', name) ?? '', /^complete /, `${name} is whole`);
  }
  assert.match(run('s01-test').stdout, /s01-test: formats up to date/, 'a whole take is up to date');

  // --drop-film-masters: a proxy encode stopped part-way leaves no proxy, so the master is never dropped for a stub
  const proxyStopped = run('s02-test', '-proxy.mp4', '--drop-film-masters');
  assert.notEqual(proxyStopped.status, 0);
  const films = join(renders, 'films', 's02-test', 'films');
  assert.equal(existsSync(join(films, 's02-test-proxy.mp4')), false, 'no truncated proxy at its final name');
  assert.equal(existsSync(join(films, 's02-test-master.mov')), true, 'the master stays');
  const dropped = run('s02-test', null, '--drop-film-masters', '--force');
  assert.equal(dropped.status, 0, dropped.stderr);
  assert.match(readFileSync(join(films, 's02-test-proxy.mp4'), 'utf8'), /^complete /, 'the proxy is encoded whole before the master goes');
  assert.equal(existsSync(join(films, 's02-test-master.mov')), false, 'then the master is dropped');
  const index = JSON.parse(readFileSync(join(deliver, 'deliver-index.json'), 'utf8'));
  assert.deepEqual(index.map((row) => row.id), ['s01-test', 's02-test'], 'the index lists both whole takes');
  console.log('site-loops-resume.selftest: outputs are whole or absent; a stopped encode re-encodes its take; a stopped proxy never costs the master');
} finally {
  rmSync(root, { recursive: true, force: true });
}
