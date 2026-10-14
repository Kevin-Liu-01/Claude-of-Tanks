#!/usr/bin/env node
// Recreate the films' HyperFrames projects (shots/media-r5/motion/<film>/, outside git) from their tracked sources in
// tools/media-r5/films/<film>/ (owner 2026-10-12: "keep our code for these videos and setup preserved so we can always
// tweak them"):
//  - each project's sources as last rendered: index.html, compositions/, edl.json, the cue sheets, scenes-cut/, the
//    music plan and receipt and the posters' index (motion/build.mjs and motion/edl-gen.mjs, which made them, are
//    the toolkit's own);
//  - the generated music bed, music/music-gen.wv, decoded back to music/music-gen.wav. The bed is 32-bit float
//    (score/music.mjs), which FLAC cannot hold, so it is kept as WavPack: the decode is exact, and ffmpeg's -xerror
//    stops on a block whose checksum fails;
//  - in assets/: the brand marks and fonts the compositions load (public/brand, public/fonts/abc-monument-grotesk) and
//    the film grain motion/build.mjs draws.
// The footage, the mixes and the posters' art stay out of git: motion/sync-footage.mjs links the footage, motion/recut.zsh
// re-cuts a film's score and renders it, motion/rerender.zsh renders it as it is, and motion/posters-build.mjs copies
// the posters' art from the stills. The script prints these next steps.
//   node tools/media-r5/films/restore.mjs [film ...] [--out=<dir>] [--dry] [--force]
// --out: where the projects go (default shots/media-r5/motion, the one the tools read). A project file that exists with
// other content is kept and listed unless --force. --dry prints the plan and writes nothing.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MOTION, REPO } from '../paths.mjs';

export const FILMS_DIR = dirname(fileURLToPath(import.meta.url));
export const BED = 'music/music-gen.wv';
/** What every project's assets/ takes from the repo: [repo path, project path]. */
export const SHARED = [
  ...['logo-full-metal.svg', 'logo-mark-metal.svg', 'logo-mark.svg'].map((f) => [`public/brand/${f}`, `assets/brand/${f}`]),
  ...['Regular', 'Medium', 'Bold'].map((w) => `ABCMonumentGrotesk-${w}.woff2`)
    .map((f) => [`public/fonts/abc-monument-grotesk/${f}`, `assets/fonts/${f}`]),
];

const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), base) : [relative(base, join(dir, e.name))]));

/** The films kept here: each folder with an index.html. */
export function listFilms() {
  return readdirSync(FILMS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(FILMS_DIR, e.name, 'index.html'))).map((e) => e.name).sort();
}

/** One film's restore steps, sorted by the project path each writes: copy (a source or a shared asset), decode (the
 *  music bed) or grain. */
export function restorePlan(film, out = MOTION) {
  const src = join(FILMS_DIR, film);
  if (!existsSync(join(src, 'index.html'))) throw new Error(`no film ${film} in ${FILMS_DIR} (${listFilms().join(', ')})`);
  const steps = walk(src).map((rel) => (rel === BED
    ? { op: 'decode', rel: 'music/music-gen.wav', from: join(src, rel) }
    : { op: 'copy', rel, from: join(src, rel) }));
  for (const [from, rel] of SHARED) steps.push({ op: 'copy', rel, from: join(REPO, from) });
  steps.push({ op: 'grain', rel: 'assets/grain.png' });
  for (const s of steps) s.to = join(resolve(out), film, s.rel);
  return steps.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/** The film grain every project's compositions/grain.html overlays: the 256 px tile motion/build.mjs draws (writeGrain). */
export async function grainPng() {
  const { createCanvas } = await import('@napi-rs/canvas');
  const c = createCanvas(256, 256), g = c.getContext('2d'), img = g.createImageData(256, 256);
  let a = 0x2545F491;
  const rnd = () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 1000) / 1000; };
  for (let i = 0; i < 256 * 256; i++) { const v = Math.round(128 + (rnd() + rnd() + rnd() - 1.5) * 120); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v)); img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c.toBuffer('image/png');
}

function decodeBed(from, to) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-nostdin', '-xerror', '-y', '-i', from, '-c:a', 'pcm_f32le', '-f', 'wav', to], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${from}: ${(r.stderr || r.error?.message || `exit ${r.status}`).trim()}`);
}

/** Restore one film into out/<film>; returns its steps and what each did (new, same, replaced, kept). */
export async function restore(film, { out = MOTION, dry = false, force = false } = {}) {
  const steps = restorePlan(film, out);
  const tally = { new: [], same: [], replaced: [], kept: [] };
  if (dry) return { steps, tally };
  let grain = null;
  for (const s of steps) {
    mkdirSync(dirname(s.to), { recursive: true });
    let bytes = null, cleanup = null, write;
    if (s.op === 'copy') write = () => copyFileSync(s.from, s.to);
    else if (s.op === 'grain') { bytes = grain ??= await grainPng(); write = () => writeFileSync(s.to, bytes); }
    else {
      const tmp = `${s.to}.decoding`;
      decodeBed(s.from, tmp);
      cleanup = () => { if (existsSync(tmp)) unlinkSync(tmp); };
      write = () => renameSync(tmp, s.to);
      if (existsSync(s.to)) bytes = readFileSync(tmp);
    }
    if (!existsSync(s.to)) { write(); tally.new.push(s.rel); }
    else if (readFileSync(s.to).equals(bytes ?? readFileSync(s.from))) tally.same.push(s.rel);
    else if (force) { write(); tally.replaced.push(s.rel); }
    else tally.kept.push(s.rel);
    cleanup?.();
  }
  return { steps, tally };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const bad = argv.filter((a) => a.startsWith('--') && !/^--(?:out=.+|dry|force)$/.test(a));
  if (bad.length) throw new Error(`unknown option ${bad.join(' ')}; usage: restore.mjs [film ...] [--out=<dir>] [--dry] [--force]`);
  const out = resolve(argv.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? MOTION);
  const dry = argv.includes('--dry'), force = argv.includes('--force');
  const films = argv.filter((a) => !a.startsWith('--'));
  for (const film of films.length ? films : listFilms()) {
    const { steps, tally } = await restore(film, { out, dry, force });
    if (dry) {
      console.log(`${film}: ${steps.length} files -> ${join(out, film)} (dry run)`);
      for (const s of steps) console.log(`  ${s.op.padEnd(6)} ${s.rel}`);
      continue;
    }
    console.log(`${film}: ${tally.new.length} new, ${tally.same.length} unchanged, ${tally.replaced.length} replaced, ${tally.kept.length} kept -> ${join(out, film)}`);
    if (tally.kept.length) console.log(`  kept as they are (they differ from git; --force replaces them): ${tally.kept.join(' ')}`);
  }
  if (!dry) console.log(`
Next, from the repo root (the tools read shots/media-r5/motion):
  node tools/media-r5/motion/sync-footage.mjs --renders=renders,renders-r13,renders-r14
      links each take's footage into the films' assets/shots (the site fifty's render folders, oldest first)
  zsh tools/media-r5/motion/recut.zsh <film> <tag>
      re-cuts a film's score over its music bed and renders it (trailer-24h, cut-30, lineup, vertical-15)
  zsh tools/media-r5/motion/rerender.zsh <film...>
      renders a film as it is, after a titles or edit change (its assets/audio/mix.wav comes from a re-cut)
  node tools/media-r5/motion/posters-build.mjs tools/media-r5/motion/posters-v2.json
      lays out the posters and copies their art from the takes' stills; then
      node tools/media-r5/motion/render.mjs posters-land --snap=0.5,1.5,... renders them (poster i at i + 0.5 s)`);
}
