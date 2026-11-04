#!/usr/bin/env node
// tools/audio/run-critic.mjs — run the ear proxy (tools/audio/sfx-critic.py, a local YAMNet AudioSet classifier) over the
// raw takes of every catalog entry that names a `critic` class, and record each take's verdict beside the take cache
// (<cache>/critic.json, keyed by the take's file name). These verdicts choose build-sfx.mjs's candidates; its own
// verdict on each file it ships is the one of record (tools/audio/sfx-verdicts.json), so a crack-only cannon or a
// cap-gun machine gun cannot ship (gun-reports-269, owner 2026-11-04).
//
//   COT_CRITIC_PYTHON=<venv>/bin/python COT_CRITIC_MODEL=<yamnet.tflite> node tools/audio/run-critic.mjs [--ids a,b] [--force]
//
// The critic's environment is local and free (critic.mjs). A verdict is reused until --force. A single-shot bank is
// judged on its take cut before the second report (sfx-qa.mjs firstShotOnly), as it ships: a raw take that is really
// a burst is heard as a machine gun although its cut is one bare round.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { SFX_CATALOG } from './sfx-catalog.mjs';
import { CRITIC_SETUP, criticReady, judgeFiles } from './critic.mjs';
import { CACHE_ROOT } from './elevenlabs.mjs';
import { deinterleave } from './pcm.mjs';
import { SINGLE_SHOT, firstShotOnly } from './sfx-qa.mjs';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : null);
const ids = opt('ids')?.split(',') ?? null;
const force = args.includes('--force');
if (!criticReady()) {
  console.error(CRITIC_SETUP);
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

let judged = 0;
for (const entry of SFX_CATALOG) {
  if (!entry.critic || (ids && !ids.includes(entry.id))) continue;
  const takes = (index[entry.id] || []).filter((f) => existsSync(f));
  const cutJudged = SINGLE_SHOT.test(entry.id);
  const todo = takes.filter((f) => force || !verdicts[basename(f)] || verdicts[basename(f)].class !== entry.critic
    || !!verdicts[basename(f)].cut !== cutJudged);
  const heard = todo.map((f) => shipped(entry, f));
  judgeFiles(entry, heard).forEach((v, i) => {
    v.single.file = todo[i];
    if (v.burst) v.burst.file = todo[i];
    verdicts[basename(todo[i])] = { id: entry.id, ...v, ...(cutJudged ? { cut: true } : {}) };
    judged++;
  });
  const all = takes.map((f) => verdicts[basename(f)]).filter(Boolean);
  const passed = all.filter((v) => v.pass).length;
  console.log(`${entry.id.padEnd(26)} ${entry.critic.padEnd(16)} ${passed}/${all.length} pass`
    + `  ${all.map((v) => `${v.pass ? '+' : '-'}${v.single.best.split(',')[0]} ${v.single.bestScore}/${v.single.against.split(',')[0]} ${v.single.againstScore}${v.burst ? ` [${v.burst.best.split(',')[0]} ${v.burst.bestScore}/${v.burst.against.split(',')[0]} ${v.burst.againstScore}]` : ''}`).join('  ')}`);
}
rmSync(cuts, { recursive: true, force: true });
writeFileSync(VERDICTS, JSON.stringify(verdicts, null, 1));
console.log(`judged ${judged} takes → ${VERDICTS}`);
