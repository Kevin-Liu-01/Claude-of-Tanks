#!/usr/bin/env node
// A film's take scenes as its footage was rendered: for each take the film cuts (its edl.json), the scene from the
// cinema receipt of the render round its assets/shots/<id>.mp4 hard-links to (the newest round of --renders first),
// written to motion/<film>/scenes-cut/<id>.json, so score/sfx-cues.mjs places every sound on the picture the film shows.
//   node tools/media-r5/motion/film-scenes.mjs <film> [--renders=renders,renders-r13,renders-r14]
// --renders names the site fifty's render folders oldest first, as sync-footage.mjs takes them (recut.zsh passes both
// the same list).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { MOTION, SHOTS } from '../paths.mjs';
const args = process.argv.slice(2);
const film = args.find((a) => !a.startsWith('--'));
if (!film) throw Error('usage: film-scenes.mjs <film> [--renders=renders,renders-r13,renders-r14]');
const renders = (args.find((a) => a.startsWith('--renders='))?.slice('--renders='.length) ?? 'renders,renders-r13,renders-r14')
  .split(',').filter(Boolean).reverse();
const byInode = new Map();
for (const r of renders) {
  for (const kind of ['films', 'films-portrait']) {
    const root = join(SHOTS, 'site50', r, kind);
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root)) {
      const dir = join(root, id, 'films');
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((f) => f.endsWith('-proxy.mp4'))) {
        const ino = statSync(join(dir, f)).ino;
        if (!byInode.has(ino)) byInode.set(ino, { round: r, receipt: join(root, id, 'cinema-receipt.json') });
      }
    }
  }
}
const edl = JSON.parse(readFileSync(join(MOTION, film, 'edl.json'), 'utf8'));
const out = join(MOTION, film, 'scenes-cut');
mkdirSync(out, { recursive: true });
const rounds = {}, missing = [];
for (const id of [...new Set(edl.shots.map((s) => basename(s.src, '.mp4')))]) {
  const f = join(MOTION, film, 'assets', 'shots', `${id}.mp4`);
  const src = existsSync(f) ? byInode.get(statSync(f).ino) : null;
  if (!src || !existsSync(src.receipt)) { missing.push(id); continue; }
  const scene = JSON.parse(readFileSync(src.receipt, 'utf8')).config?.scene;
  if (!scene) { missing.push(id); continue; }
  writeFileSync(join(out, `${id.replace(/-p$/, '')}.json`), JSON.stringify(scene, null, 1));
  (rounds[src.round] ??= []).push(id.slice(0, 3));
}
console.log(`${film}: ${Object.entries(rounds).map(([r, ids]) => `${r} ${ids.length}`).join(', ')}${missing.length ? `; no scene for ${missing.join(' ')}` : ''} -> ${out}`);
