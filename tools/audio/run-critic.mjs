#!/usr/bin/env node
// tools/audio/run-critic.mjs — run the ear proxy (tools/audio/sfx-critic.py, a local YAMNet AudioSet classifier) over the
// raw takes of every catalog entry that names a `critic` class, and record each take's verdict beside the take cache
// (<cache>/critic.json, keyed by the take's file name). build-sfx.mjs ships only takes whose verdict passes, so a
// crack-only cannon or a cap-gun machine gun cannot ship (gun-reports-269, owner 2026-11-04).
//
//   COT_CRITIC_PYTHON=<venv>/bin/python COT_CRITIC_MODEL=<yamnet.tflite> node tools/audio/run-critic.mjs [--ids a,b] [--force]
//
// The critic's environment is local and free: a Python 3.12 venv with `ai-edge-litert` and `numpy`, and MediaPipe's
// float32 YAMNet (storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite). A verdict is
// reused until --force; an entry with a `burst` ([rounds, gap s]) is also judged as the burst the engine plays. A
// single-shot bank is judged on what it ships: the take cut before its second report (sfx-qa.mjs firstShotOnly), as
// the negative control was judged on the shipped files; a raw take that is really a burst is heard as a machine gun
// although its cut is one bare round.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFX_CATALOG } from './sfx-catalog.mjs';
import { CACHE_ROOT } from './elevenlabs.mjs';
import { deinterleave } from './pcm.mjs';
import { SINGLE_SHOT, firstShotOnly } from './sfx-qa.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const ids = opt('ids')?.split(',') ?? null;
const force = args.includes('--force');
const python = process.env.COT_CRITIC_PYTHON;
const model = process.env.COT_CRITIC_MODEL;
if (!python || !model || !existsSync(python) || !existsSync(model)) {
  console.error('Set COT_CRITIC_PYTHON (a venv with ai-edge-litert and numpy) and COT_CRITIC_MODEL (yamnet.tflite).');
  process.exit(1);
}

export const VERDICTS = join(CACHE_ROOT, 'critic.json');
const verdicts = existsSync(VERDICTS) ? JSON.parse(readFileSync(VERDICTS, 'utf8')) : {};
const index = JSON.parse(readFileSync(join(CACHE_ROOT, 'sfx-index.json'), 'utf8'));
const cuts = mkdtempSync(join(tmpdir(), 'cot-critic-'));

/** The take as it ships: a single-shot bank's take cut before its second report (48 kHz stereo s16le, as cached). */
function shipped(entry, file) {
  if (!SINGLE_SHOT.test(entry.id)) return file;
  const buf = readFileSync(file);
  const frames = firstShotOnly(deinterleave(buf, 2), 48000, entry)[0].length;
  const cut = join(cuts, basename(file));
  writeFileSync(cut, buf.subarray(0, frames * 4));
  return cut;
}

function judge(klass, files, burst) {
  if (!files.length) return [];
  const argv = ['-I', join(HERE, 'sfx-critic.py'), '--model', model, '--class', klass, ...(burst ? ['--burst', `${burst[0]}:${burst[1]}`] : []), ...files];
  const out = execFileSync(python, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  return out.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
}

let judged = 0;
for (const entry of SFX_CATALOG) {
  if (!entry.critic || (ids && !ids.includes(entry.id))) continue;
  const takes = (index[entry.id] || []).filter((f) => existsSync(f));
  const cutJudged = SINGLE_SHOT.test(entry.id);
  const todo = takes.filter((f) => force || !verdicts[basename(f)] || verdicts[basename(f)].class !== entry.critic
    || !!verdicts[basename(f)].cut !== cutJudged);
  const heard = todo.map((f) => shipped(entry, f));
  const single = judge(entry.critic, heard, null);
  const burst = entry.burst ? judge(entry.critic, heard, entry.burst) : [];
  for (const v of single) {
    const b = burst.find((x) => x.file === v.file);
    v.file = todo[heard.indexOf(v.file)];
    if (b) b.file = v.file;
    // a machine gun's burst is ruled (it is how the gun is heard); an autocannon's overlapping burst is only reported
    const pass = v.pass && (!b || entry.critic !== 'mg' || b.pass);
    verdicts[basename(v.file)] = { id: entry.id, class: entry.critic, pass, ...(cutJudged ? { cut: true } : {}), single: v, ...(b ? { burst: b } : {}) };
    judged++;
  }
  const all = takes.map((f) => verdicts[basename(f)]).filter(Boolean);
  const passed = all.filter((v) => v.pass).length;
  console.log(`${entry.id.padEnd(26)} ${entry.critic.padEnd(16)} ${passed}/${all.length} pass`
    + `  ${all.map((v) => `${v.pass ? '+' : '-'}${v.single.best.split(',')[0]} ${v.single.bestScore}/${v.single.against.split(',')[0]} ${v.single.againstScore}${v.burst ? ` [${v.burst.best.split(',')[0]} ${v.burst.bestScore}/${v.burst.against.split(',')[0]} ${v.burst.againstScore}]` : ''}`).join('  ')}`);
}
rmSync(cuts, { recursive: true, force: true });
writeFileSync(VERDICTS, JSON.stringify(verdicts, null, 1));
console.log(`judged ${judged} takes → ${VERDICTS}`);
