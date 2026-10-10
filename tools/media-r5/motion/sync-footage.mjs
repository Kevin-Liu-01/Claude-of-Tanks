#!/usr/bin/env node
// Link final film proxies into the motion projects' assets/shots/<id>.mp4 (landscape; portrait as <id>-p.mp4): hard
// links, since 2160p proxies copied into five projects would fill the disk (a copy when a link cannot be made).
//   node tools/media-r5/motion/sync-footage.mjs [finalRoot=shots/media-r5/final] [--renders=renders,renders-r13]
// --renders (launch night, 2026-10-09): the site fifty's render folders, in order, a later folder's takes replacing an
// earlier one's (each finals round renders into its own folder: site50-finals.mjs --tag).
import { readdirSync, existsSync, copyFileSync, linkSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FINAL as DEFAULT_FINAL, MOTION } from '../paths.mjs';
const argv = process.argv.slice(2), flags = Object.fromEntries(argv.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const FINAL = resolve(argv.find(a => !a.startsWith('--')) ?? DEFAULT_FINAL);
const RENDERS = String(flags.renders ?? 'renders').split(',').filter(Boolean);
const projects = ['trailer-24h', 'cut-30', 'vertical-15', 'lineup', 'studio-feature'];
let n = 0;
const place = (from, to) => { if (existsSync(to)) unlinkSync(to); try { linkSync(from, to); } catch { copyFileSync(from, to); } };
for (const kind of ['films', 'films-v2', 'films-portrait', 'films-portrait3']) { // films-v2 re-renders override the first pass (copied after it)
  const root = join(FINAL, kind); if (!existsSync(root)) continue;
  for (const id of readdirSync(root)) {
    const fd = join(root, id, 'films'); if (!existsSync(fd)) continue;
    const proxy = readdirSync(fd).find(f => f.endsWith('-proxy.mp4')); if (!proxy) continue;
    const name = kind.startsWith('films-portrait') ? `${id}-p.mp4` : `${id}.mp4`; // films-v2 shares the landscape name
    for (const p of projects) {
      const dir = join(MOTION, p, 'assets/shots'); if (!existsSync(dir)) continue;
      const dst = join(dir, name);
      if (!existsSync(dst) || statSync(dst).size !== statSync(join(fd, proxy)).size) { place(join(fd, proxy), dst); n++; }
    }
  }
}
// The site fifty's takes (site50-finals.mjs: site50/renders/films/<id>/films/*-proxy.mp4) feed the round-2 cuts
// under their own ids (s01-main-street-push ...); portrait takes render to site50/renders/films-portrait/<id>.
for (const renders of RENDERS) for (const [kind, suffix] of [['films', ''], ['films-portrait', '-p']]) {
  const root = join(FINAL, '..', 'site50', renders, kind); if (!existsSync(root)) continue;
  for (const id of readdirSync(root).filter(d => /^s\d\d-/.test(d))) {
    const fd = join(root, id, 'films'); if (!existsSync(fd)) continue;
    const proxy = readdirSync(fd).find(f => f.endsWith('-proxy.mp4')); if (!proxy) continue;
    for (const p of projects) {
      const dir = join(MOTION, p, 'assets/shots'); if (!existsSync(dir)) continue;
      const dst = join(dir, `${id}${suffix}.mp4`);
      if (!existsSync(dst) || statSync(dst).ino !== statSync(join(fd, proxy)).ino) { place(join(fd, proxy), dst); n++; }
    }
  }
}
// Studio UI captures: ui/<script>/studio-ui.mp4 (ui2 = tab-aware retakes, preferred); the trailer's Studio cut is t24-studio-ui
const UI_NAMES = { 'ui-trailer': ['ui-trailer', 't24-studio-ui'], 'ui-feature-stage': ['ui-feature-stage'], 'ui-feature-time': ['ui-feature-time'], 'ui-feature-picture': ['ui-feature-picture'] };
for (const kind of ['ui', 'ui2']) {
  const root = join(FINAL, kind); if (!existsSync(root)) continue;
  for (const script of readdirSync(root)) {
    const src = join(root, script, 'studio-ui.mp4'); if (!existsSync(src)) continue;
    for (const name of UI_NAMES[script.replace(/2$/, '')] ?? []) for (const p of projects) {
      const dir = join(MOTION, p, 'assets/shots'); if (!existsSync(dir)) continue;
      const dst = join(dir, `${name}.mp4`);
      if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) { copyFileSync(src, dst); n++; }
    }
  }
}
console.log(`synced ${n} footage files`);
