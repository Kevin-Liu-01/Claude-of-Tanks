// site-loops.mjs resumes only from whole outputs (2026-11-02 audit S5). It wrote every ffmpeg output straight to its
// final name and called a take up to date when its <id>.mp4 was newer than the master, so an encode killed mid-run left a
// truncated format the next run reported "formats up to date" (and site-media shipped); a truncated film proxy at its
// final name let --drop-film-masters delete the master, the only good copy. Each output is now written under a partial
// name and renamed into place once whole (atomic-output.mjs), and a take is up to date only once every output it should
// have is there and its completion record, written after the last of them, is newer than its inputs. Round 2: the poster
// had been taken for the last output, but the scene and the stills come after it, so a run stopped between the poster
// and the stills left the old still delivered under a "formats up to date". Round 3: the outputs come in groups, each from
// one input (the formats from the film, the stills from the still masters), the scene is copied when its bytes differ, and
// the record keeps each group's input as it was made. Round 2 counted the scene as an input of every format, and
// cinema-jobs rewrites it unchanged on every finals launch: each delivered take was re-encoded on a relaunch, one whose
// master was dropped from its H.264 proxy.
// The real site-loops.mjs runs on a fixture take with a stand-in ffmpeg and ffprobe on PATH (shell scripts: ffmpeg writes
// "complete <name>" to its last argument, or, for the name FAKE_FFMPEG_FAIL matches, a few bytes and exits 1 as an encode
// stopped part-way would, and logs each output it was asked for); a stand-in master filter copies stills and films, or
// SIGKILLs the run at a still (FAKE_FILTER_KILL).
// Nothing real is encoded and nothing outside a temporary directory is written.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
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
[ -n "$FAKE_FFMPEG_LOG" ] && basename "$last" >> "$FAKE_FFMPEG_LOG"
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
  const ffLog = join(root, 'ffmpeg.log');
  const run = (ids, fail = null, ...flags) => spawnSync(process.execPath, [TOOL, renders, deliver, ids, ...flags], { encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MEDIA_R5_FEATURES: 'off', COT_MASTER_FILTER: '', FAKE_FFMPEG_LOG: ffLog,
      ...(fail ? { FAKE_FFMPEG_FAIL: fail } : {}) } });
  // the outputs ffmpeg was asked for since the last call (by their final names: each is written under a partial one)
  const encodes = () => {
    const names = existsSync(ffLog) ? readFileSync(ffLog, 'utf8').split('\n').filter(Boolean) : [];
    rmSync(ffLog, { force: true });
    return names.map((name) => name.replace(/^\.(.+)\.partial-\d+(\.[^.]*)?$/, '$1'));
  };
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
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MEDIA_R5_FEATURES: 'off', COT_MASTER_FILTER: filter, FAKE_FFMPEG_LOG: ffLog, ...extra } });
    writeFileSync(stillFile, stillA);
    const first = filtered();
    assert.equal(first.status, 0, first.stderr);
    assert.ok(delivered().equals(stillA), 'the still is delivered');
    // a new film and a new still master: the next run re-encodes the formats, and is stopped at the still
    writeFileSync(join(renders, 'films', id, 'films', `${id}-master.mov`), 'the master, rendered again');
    writeFileSync(stillFile, stillB);
    encodes();
    const killed = filtered({ FAKE_FILTER_KILL: '1' });
    assert.equal(killed.signal, 'SIGKILL', `the run is stopped at the still (${killed.status} ${killed.signal})`);
    assert.ok(statSync(out(id, `${id}.jpg`)).mtimeMs > statSync(stillFile).mtimeMs, 'after its poster was renamed into place');
    assert.ok(encodes().includes(`${id}.jpg`), 'the stopped run re-encoded the formats');
    const resumed = filtered();
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.doesNotMatch(resumed.stdout, /formats up to date/, `a take stopped before its stills is not up to date (${resumed.stdout.trim()})`);
    assert.ok(delivered().equals(stillB), 'the next run delivers the new still');
    assert.deepEqual(encodes(), [], 'and only the still: the formats made whole before the stop are not encoded again');
    assert.match(filtered().stdout, /s03-test: formats up to date/, 'then the take is up to date');
    // a newer still alone: only the stills are made again
    writeFileSync(stillFile, stillA);
    const stillOnly = filtered();
    assert.match(stillOnly.stdout, /s03-test: formats current, not re-encoded; delivering the still/, stillOnly.stdout);
    assert.deepEqual(encodes(), [], 'a new still re-encodes no format');
    assert.ok(delivered().equals(stillA));
  }

  // ---- round 3: a relaunch rewrites the scene with the same bytes; a dropped master's take is never re-encoded ----------
  {
    const id = 's04-test', films = join(renders, 'films', id, 'films'), sceneFile = join(renders, 'films', 'scenes', `${id}.json`);
    mkdirSync(films, { recursive: true });
    mkdirSync(join(renders, 'films', 'scenes'), { recursive: true });
    const scene = `${JSON.stringify({ id, map: 'test' }, null, 1)}\n`;
    // cinema rendered the master and its proxy, and cinema-jobs wrote the scene, before the run
    writeFileSync(join(films, `${id}-master.mov`), 'the master');
    writeFileSync(join(films, `${id}-proxy.mp4`), 'the cinema proxy');
    writeFileSync(sceneFile, scene);
    const past = new Date(Date.now() - 120_000);
    for (const file of [join(films, `${id}-master.mov`), join(films, `${id}-proxy.mp4`), sceneFile]) utimesSync(file, past, past);
    encodes();
    const first = run(id, null, '--drop-film-masters');
    assert.equal(first.status, 0, first.stderr);
    assert.ok(encodes().includes(`${id}.mp4`), 'the formats are encoded from the master');
    assert.equal(existsSync(join(films, `${id}-master.mov`)), false, 'the master is dropped');
    assert.equal(readFileSync(join(films, `${id}-proxy.mp4`), 'utf8'), 'the cinema proxy', 'cinema\'s proxy stays as it was');
    assert.equal(readFileSync(out(id, `${id}.scene.json`), 'utf8'), scene, 'the scene is delivered');
    assert.match(run(id, null, '--drop-film-masters').stdout, /s04-test: formats up to date/);
    // the finals' film-jobs step rewrites the scene with the same bytes on every launch
    const relaunch = () => { writeFileSync(sceneFile, scene); return run(id, null, '--drop-film-masters'); };
    const relaunched = relaunch();
    assert.match(relaunched.stdout, /s04-test: formats up to date/, `a rewritten, unchanged scene changes nothing (${relaunched.stdout.trim()})`);
    assert.deepEqual(encodes(), [], 'and nothing is re-encoded from the proxy');
    // a take delivered before the record: its outputs are newer than the film (the proxy), whatever the scene's time
    rmSync(out(id, `.${id}.complete.json`));
    const legacy = relaunch();
    assert.match(legacy.stdout, /s04-test: formats up to date/, `a take delivered before the record is not re-encoded wholesale (${legacy.stdout.trim()})`);
    assert.deepEqual(encodes(), []);
    // a scene whose bytes changed is copied; no format is made again
    const changed = `${JSON.stringify({ id, map: 'test', hour: 18 }, null, 1)}\n`;
    writeFileSync(sceneFile, changed);
    const sceneRun = run(id, null, '--drop-film-masters');
    assert.match(sceneRun.stdout, /s04-test: formats current, not re-encoded; delivering the scene/, sceneRun.stdout);
    assert.deepEqual(encodes(), [], 'a new scene re-encodes no format');
    assert.equal(readFileSync(out(id, `${id}.scene.json`), 'utf8'), changed, 'the new scene is delivered');
    assert.match(run(id).stdout, /s04-test: formats up to date/, 'then the take is up to date (recorded from its times)');
    // a film rendered again (a new proxy, the master gone) is a new input: the formats are made again
    writeFileSync(join(films, `${id}-proxy.mp4`), 'the cinema proxy, rendered again');
    encodes();
    assert.doesNotMatch(run(id).stdout, /s04-test: formats up to date/, 'a new film is not up to date');
    assert.ok(encodes().includes(`${id}.mp4`), 'its formats are encoded again');
  }
  const index = JSON.parse(readFileSync(join(deliver, 'deliver-index.json'), 'utf8'));
  assert.deepEqual(index.map((row) => row.id), ['s01-test', 's02-test', 's03-test', 's04-test'], 'the index lists the whole takes');
  console.log('site-loops-resume.selftest: outputs are whole or absent; a stopped encode re-encodes its take; a stopped proxy never costs the master; a run stopped between the poster and the stills delivers the new still next time; each group follows its own input (an unchanged scene rewrite or a new still re-encodes no format, a dropped master\'s take stays current on its proxy)');
} finally {
  rmSync(root, { recursive: true, force: true });
}
