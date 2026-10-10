#!/usr/bin/env node
// The site formats of a finals round rendered with --skip-loops, in the background (launch night, 2026-10-09: the GPU work
// never waits on the CPU's). Every take whose film and stills are complete gets its master from the kept frames
// (film-master.mjs) and its formats (site-loops.mjs, which keeps the proxy and drops the master), one take at a time, at
// nice 15. While <renders>/pause-encodes exists no new take starts. It ends once <renders>/encoder-done exists and no take
// is pending. --audio gives each delivered take its sound (take-audio.mjs: the game's recorded world, muxed into every
// video format; owner 2026-10-09, "make sure our videos have audio").
//   node tools/media-r5/site50-encoder.mjs <renders> <deliver> [--poll=60] [--audio]
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOOL } from './paths.mjs';

const argv = process.argv.slice(2), flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [rendersArg, deliverArg] = argv.filter((a) => !a.startsWith('--'));
if (!deliverArg) throw new Error('usage: site50-encoder.mjs <renders> <deliver> [--poll=60]');
const renders = resolve(rendersArg), deliver = resolve(deliverArg), POLL_MS = Number(flags.poll ?? 60) * 1000;
const stamp = () => new Date().toTimeString().slice(0, 8);
const receipt = (dir) => { try { return JSON.parse(readFileSync(join(dir, 'cinema-receipt.json'), 'utf8')); } catch { return null; } };
const complete = (r, kind) => !!r && (r[kind] ?? []).length > 0 && r[kind].every((row) => row.complete);
// a take is ready when its film rows and its stills are all complete (cinema finishes a take's film before its stills
// start, so a take with no stills receipt yet is not ready)
const ready = () => {
  const films = join(renders, 'films');
  if (!existsSync(films)) return [];
  return readdirSync(films).filter((id) => /^s\d\d-/.test(id)).sort().filter((id) => complete(receipt(join(films, id)), 'films')
    && complete(receipt(join(renders, 'stills', id)), 'stills'));
};
// done when its landscape loop is newer than the take's render and its 4K still is delivered. The render's time is its
// newest kept frame (the review frames stay after the master): the film receipt is no clock, since cinema re-saves every
// receipt of a batch when the batch ends (launch day: S04's loop, encoded during its own lease, read as undelivered and
// spent its second try). A take with no kept frames falls back to its receipt.
const newestFrameMs = (id) => {
  let newest = 0;
  const dir = join(renders, 'films', id, 'films');
  if (!existsSync(dir)) return 0;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of readdirSync(join(dir, d.name))) if (/^frame-\d{5}\.png$/.test(f)) newest = Math.max(newest, statSync(join(dir, d.name, f)).mtimeMs);
  }
  return newest;
};
const delivered = (id) => {
  const mp4 = join(deliver, id, `${id}.mp4`), rec = join(renders, 'films', id, 'cinema-receipt.json');
  if (!existsSync(mp4) || !existsSync(join(deliver, id, `${id}-4k.png`))) return false;
  const rendered = newestFrameMs(id) || (existsSync(rec) ? statSync(rec).mtimeMs : 0);
  return rendered > 0 && statSync(mp4).mtimeMs > rendered;
};
// a take's master, or its kept frames (more than the review frames cinema keeps)
const filmsOf = (id) => join(renders, 'films', id, 'films');
const hasMaster = (id) => existsSync(filmsOf(id)) && readdirSync(filmsOf(id)).some((f) => f.endsWith('-master.mov'));
const hasFrames = (id) => existsSync(filmsOf(id)) && readdirSync(filmsOf(id), { withFileTypes: true }).some((d) => d.isDirectory()
  && readdirSync(join(filmsOf(id), d.name)).filter((f) => /^frame-\d{5}\.png$/.test(f)).length > 20);
const nice = (script, args) => spawnSync('nice', ['-n', '15', 'node', join(TOOL, script), ...args], { stdio: 'inherit' }).status;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`[encoder] ${renders} -> ${deliver} ${stamp()}`);
const failed = new Map();
for (;;) {
  const pending = ready().filter((id) => !delivered(id) && (failed.get(id) ?? 0) < 2);
  if (!pending.length) {
    if (existsSync(join(renders, 'encoder-done'))) break;
    await sleep(POLL_MS);
    continue;
  }
  // masters first, for every ready take: each turns ~3.8 GB of kept frames into a ~0.77 GB master, and the takes render
  // faster than their formats encode (the pause holds the formats only: the masters free the disk)
  const unmastered = pending.filter((id) => !hasMaster(id) && hasFrames(id));
  if (unmastered.length) { console.log(`[encoder] masters for ${unmastered.join(', ')} ${stamp()}`); nice('film-master.mjs', [renders, unmastered.join(',')]); }
  if (existsSync(join(renders, 'pause-encodes'))) { await sleep(POLL_MS); continue; }
  const id = pending[0];
  console.log(`[encoder] ${id} ${stamp()}`);
  const l = nice('site-loops.mjs', [renders, deliver, id, '--drop-film-masters']);
  if (l !== 0 || !delivered(id)) { failed.set(id, (failed.get(id) ?? 0) + 1); console.log(`[encoder] ${id}: formats ${l}; tried ${failed.get(id)} time(s)`); }
  else if ('audio' in flags) {
    const a = nice('take-audio.mjs', [deliver, id]);
    if (a !== 0) console.log(`[encoder] ${id}: take-audio ${a}; its formats stay silent until take-audio.mjs runs again`);
  }
}
const left = ready().filter((id) => !delivered(id));
console.log(`[encoder] done ${stamp()}${left.length ? `; not delivered: ${left.join(', ')}` : ''}`);
