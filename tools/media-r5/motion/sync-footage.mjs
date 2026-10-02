#!/usr/bin/env node
// Copy final film proxies into the motion projects' assets/shots/<id>.mp4 (landscape; portrait as <id>-p.mp4).
//   node tools/media-r5/motion/sync-footage.mjs [finalRoot=shots/media-r5/final]
import { readdirSync, existsSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FINAL as DEFAULT_FINAL, MOTION } from '../paths.mjs';
const FINAL = resolve(process.argv[2] ?? DEFAULT_FINAL);
const projects = ['trailer-24h', 'cut-30', 'vertical-15', 'lineup', 'studio-feature'];
let n = 0;
for (const kind of ['films', 'films-v2', 'films-portrait', 'films-portrait3']) { // films-v2 re-renders override the first pass (copied after it)
  const root = join(FINAL, kind); if (!existsSync(root)) continue;
  for (const id of readdirSync(root)) {
    const fd = join(root, id, 'films'); if (!existsSync(fd)) continue;
    const proxy = readdirSync(fd).find(f => f.endsWith('-proxy.mp4')); if (!proxy) continue;
    const name = kind.startsWith('films-portrait') ? `${id}-p.mp4` : `${id}.mp4`; // films-v2 shares the landscape name
    for (const p of projects) {
      const dir = join(MOTION, p, 'assets/shots'); if (!existsSync(dir)) continue;
      const dst = join(dir, name);
      if (!existsSync(dst) || statSync(dst).size !== statSync(join(fd, proxy)).size) { copyFileSync(join(fd, proxy), dst); n++; }
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
