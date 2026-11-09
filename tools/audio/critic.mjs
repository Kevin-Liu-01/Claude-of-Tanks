// tools/audio/critic.mjs — the ear proxy (sfx-critic.py, a local YAMNet AudioSet classifier) as both callers use it:
// run-critic.mjs on the raw takes (the cheap first pass, cached in critic.json) and build-sfx.mjs on every file it ships
// (the verdict of record, tools/audio/sfx-verdicts.json). gun-reports-269, owner 2026-11-04.
//
//   COT_CRITIC_PYTHON=<venv>/bin/python   a Python 3.12 venv with ai-edge-litert and numpy
//   COT_CRITIC_MODEL=<yamnet.tflite>      MediaPipe's float32 YAMNet
//     (storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite)

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const python = process.env.COT_CRITIC_PYTHON;
const model = process.env.COT_CRITIC_MODEL;

export const criticReady = () => !!python && !!model && existsSync(python) && existsSync(model);
export const CRITIC_SETUP = 'Set COT_CRITIC_PYTHON (a venv with ai-edge-litert and numpy) and COT_CRITIC_MODEL (yamnet.tflite).';

function run(klass, files, burst) {
  if (!files.length) return [];
  const argv = ['-I', join(HERE, 'sfx-critic.py'), '--model', model, '--class', klass, ...(burst ? ['--burst', `${burst[0]}:${burst[1]}`] : []), ...files];
  const out = execFileSync(python, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  return out.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
}

/**
 * Each file's verdict under its catalog entry's class, in the order given. An entry with a `burst` ([rounds, gap s]) is
 * also judged as the burst the engine fires: a machine gun's burst is ruled (it is how the gun is heard), an
 * autocannon's overlapping burst only reported.
 */
export function judgeFiles(entry, files) {
  if (!criticReady()) throw new Error(CRITIC_SETUP);
  const single = run(entry.critic, files, null);
  const burst = entry.burst ? run(entry.critic, files, entry.burst) : [];
  return files.map((file) => {
    const v = single.find((x) => x.file === file);
    if (!v) throw new Error(`${entry.id}: the critic returned no verdict for ${file}`);
    const b = burst.find((x) => x.file === file);
    return { class: entry.critic, pass: v.pass && (!b || entry.critic !== 'mg' || b.pass), single: v, ...(b ? { burst: b } : {}) };
  });
}

/** A verdict as a record keeps it: the rule's two deciding classes and the top class, never a local path. */
export function verdictRecord(v) {
  const brief = (x) => ({ best: x.best, bestScore: x.bestScore, against: x.against, againstScore: x.againstScore, top: x.top });
  return { class: v.class, pass: v.pass, single: brief(v.single), ...(v.burst ? { burst: brief(v.burst) } : {}) };
}
