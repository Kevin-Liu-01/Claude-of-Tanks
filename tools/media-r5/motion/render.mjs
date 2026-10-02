#!/usr/bin/env node
// Lints and renders motion projects to <project>/renders/<project>.mp4 with the pinned HyperFrames CLI.
//   node tools/media-r5/motion/render.mjs [project ...]   (default: the five films)
//   --lint-only   lint without rendering;  --snap=1.5,6,22   snapshot those seconds into <project>/snap instead
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { MOTION } from '../paths.mjs';

const HF = 'hyperframes@0.8.106';
const FILMS = ['lineup', 'trailer-24h', 'cut-30', 'vertical-15', 'studio-feature'];
const args = process.argv.slice(2), flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const projects = args.filter(a => !a.startsWith('--'));
const run = (cwd, ...cli) => {
  const r = spawnSync('npx', ['--yes', HF, ...cli], { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
let failed = 0;
for (const p of projects.length ? projects : FILMS) {
  const dir = join(MOTION, p), t0 = Date.now();
  const lint = run(dir, 'lint');
  const summary = /(\d+) error(?:s|\(s\))?, (\d+) warning(?:s|\(s\))?/.exec(lint.out)?.[0] ?? "lint output unreadable";
  if (!/^0 error/.test(summary)) { console.log(`${p}: lint FAILED (${summary})\n${lint.out.slice(-2000)}`); failed++; continue; }
  if ('lint-only' in flags) { console.log(`${p}: ${summary}`); continue; }
  if (flags.snap) {
    const snapDir = flags['snap-out'] ?? 'snap';
    rmSync(join(dir, snapDir), { recursive: true, force: true });
    const s = run(dir, 'snapshot', '--at', flags.snap, '--no-end', '-o', snapDir);
    console.log(`${p}: ${summary}; snapshots ${s.ok ? `written to ${snapDir}/` : `FAILED\n${s.out.slice(-1500)}`}`); if (!s.ok) failed++;
    continue;
  }
  mkdirSync(join(dir, 'renders'), { recursive: true });
  const r = run(dir, 'render', '-q', 'delivery', '-w', '3', '-o', `renders/${p}.mp4`);
  console.log(`${p}: ${summary}; render ${r.ok ? 'ok' : 'FAILED'} in ${((Date.now() - t0) / 60000).toFixed(1)} min${r.ok ? '' : `\n${r.out.slice(-2000)}`}`);
  if (!r.ok) failed++;
}
process.exitCode = failed ? 1 : 0;
