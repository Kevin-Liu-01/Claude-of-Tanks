// site-loops.mjs resumes only from whole outputs (2026-11-02 audit S5). It wrote every ffmpeg output straight to its
// final name and called a take up to date when its <id>.mp4 was newer than the master, so an encode killed mid-run left a
// truncated format the next run reported "formats up to date" (and site-media shipped); a truncated film proxy at its
// final name let --drop-film-masters delete the master, the only good copy. Each output is now written under a partial
// name and renamed into place once whole (atomic-output.mjs), and a take is up to date only once every output it should
// have is there and its completion record, written after the last of them, is newer than its inputs. Round 2: the poster
// had been taken for the last output, but the scene and the stills come after it, so a run stopped between the poster
// and the stills left the old still delivered under a "formats up to date".
// The real site-loops.mjs runs on a fixture take with a stand-in ffmpeg and ffprobe on PATH (shell scripts: ffmpeg writes
// "complete <name>" to its last argument, or, for the name FAKE_FFMPEG_FAIL matches, a few bytes and exits 1 as an encode
// stopped part-way would); a stand-in master filter copies stills and films, or SIGKILLs the run at a still (FAKE_FILTER_KILL).
// Nothing real is encoded and nothing outside a temporary directory is written.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
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
  const filter = join(root, 'master-filter');
  writeFileSync(filter, `#!/bin/sh
case "$1" in
  still) if [ -n "$FAKE_FILTER_KILL" ]; then kill -9 $PPID; sleep 5; fi; cp "$2" "$3" ;;
  *) cp "$2" "$3" ;;
esac
`);
  chmodSync(join(bin, 'ffmpeg'), 0o755);
  chmodSync(join(bin, 'ffprobe'), 0o755);
  chmodSync(filter, 0o755);
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
  assert.match(run('s02-test').stdout, /s02-test: formats up to date/, 'the record follows the proxy: no re-encode from it');

  // ---- round 2: a run stopped between the poster and the stills delivers the new still on the next run --------------
  {
    const id = 's03-test', stills = join(renders, 'stills', id, 'stills');
    mkdirSync(join(renders, 'films', id, 'films'), { recursive: true });
    mkdirSync(stills, { recursive: true });
    writeFileSync(join(renders, 'films', id, 'films', `${id}-master.mov`), 'the master');
    const png = (colour) => { const canvas = createCanvas(8, 8); const g = canvas.getContext('2d'); g.fillStyle = colour; g.fillRect(0, 0, 8, 8); return canvas.toBuffer('image/png'); };
    const [stillA, stillB] = [png('#c03020'), png('#2040c0')];
    const stillFile = join(stills, `${id}-still-1000ms.png`), delivered = () => readFileSync(out(id, `${id}-4k.png`));
    const filtered = (extra = {}) => spawnSync(process.execPath, [TOOL, renders, deliver, id], { encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MEDIA_R5_FEATURES: 'off', COT_MASTER_FILTER: filter, ...extra } });
    writeFileSync(stillFile, stillA);
    const first = filtered();
    assert.equal(first.status, 0, first.stderr);
    assert.ok(delivered().equals(stillA), 'the still is delivered');
    writeFileSync(stillFile, stillB); // a new still master, newer than every delivered output
    const killed = filtered({ FAKE_FILTER_KILL: '1' });
    assert.equal(killed.signal, 'SIGKILL', `the run is stopped at the still (${killed.status} ${killed.signal})`);
    assert.ok(statSync(out(id, `${id}.jpg`)).mtimeMs > statSync(stillFile).mtimeMs, 'after its poster was renamed into place');
    const resumed = filtered();
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.doesNotMatch(resumed.stdout, /formats up to date/, `a take stopped before its stills is not up to date (${resumed.stdout.trim()})`);
    assert.ok(delivered().equals(stillB), 'the next run delivers the new still');
    assert.match(filtered().stdout, /s03-test: formats up to date/, 'then the take is up to date');
  }
  const index = JSON.parse(readFileSync(join(deliver, 'deliver-index.json'), 'utf8'));
  assert.deepEqual(index.map((row) => row.id), ['s01-test', 's02-test', 's03-test'], 'the index lists the whole takes');
  console.log('site-loops-resume.selftest: outputs are whole or absent; a stopped encode re-encodes its take; a stopped proxy never costs the master; a run stopped between the poster and the stills delivers the new still next time');
} finally {
  rmSync(root, { recursive: true, force: true });
}
