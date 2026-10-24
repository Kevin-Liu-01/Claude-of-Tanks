#!/usr/bin/env node
// The living mark's exports (owner, 2026-10-24: "an animated version where hes rolling along"): the loop of
// src/ui/brandMarkMotion.ts rendered frame by frame (every animation's clock set exactly, so the loop closes) and encoded
// for socials and the README. Copyright © 2026 Kevin B. Liu.
//   node tools/brand-motion-export.mjs
// Writes public/brand/motion/commander-loop.{mp4,webm,gif} (the tank alone, 1280x720; the GIF 640x360) and
// public/brand/motion/title-card-loop.{mp4,webm} (the tank over the stacked wordmark, 1080x1080). One headless browser
// (3 GB heap) renders the frames; ffmpeg encodes them.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { BRAND_MOTION_CSS, brandMarkMotionSVG } from '../src/ui/brandMarkMotion.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/brand/motion');
const FPS = 30, LOOP_S = 1.2, LOOPS = 4;
const FRAMES = Math.round(FPS * LOOP_S);
const GROUND = '#0b0e11';
const titleCard = readFileSync(join(ROOT, 'public/brand/title-card.svg'), 'utf8');

const scenes = [
  { name: 'commander-loop', w: 1280, h: 720, gif: 640,
    body: `<div style="width:760px">${brandMarkMotionSVG(438, '#f6f3ec', '#f0a030').replace(/width="\d+" height="\d+"/, 'width="760" height="438"')}</div>` },
  { name: 'title-card-loop', w: 1080, h: 1080,
    body: `<div style="width:560px">${titleCard.replace(/^<svg /, '<svg width="560" ').replace(/<!--[\s\S]*?-->/, '')}</div>` },
];

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: 'shell', args: ['--js-flags=--max-old-space-size=3072'] });
try {
  for (const scene of scenes) {
    const frames = mkdtempSync(join(tmpdir(), `brand-motion-${scene.name}-`));
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: scene.w, height: scene.h, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;height:100%;background:${GROUND};color:#f6f3ec;--accent:#f0a030}`
        + `body{display:grid;place-items:center}${BRAND_MOTION_CSS}</style></head><body>${scene.body}</body></html>`);
      for (let frame = 0; frame < FRAMES; frame++) {
        await page.evaluate((ms) => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = ms; } }, (frame / FPS) * 1000);
        await page.screenshot({ path: join(frames, `f${String(frame).padStart(3, '0')}.png`) });
      }
      await page.close();
      const input = ['-v', 'error', '-y', '-stream_loop', String(LOOPS - 1), '-framerate', String(FPS), '-i', join(frames, 'f%03d.png')];
      execFileSync('ffmpeg', [...input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart',
        join(OUT, `${scene.name}.mp4`)]);
      execFileSync('ffmpeg', [...input, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-row-mt', '1', join(OUT, `${scene.name}.webm`)]);
      if (scene.gif) {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(frames, 'f%03d.png'), '-vf',
          `scale=${scene.gif}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none`, '-loop', '0',
          join(OUT, `${scene.name}.gif`)]);
      }
      console.log('brand-motion:', scene.name, FRAMES, 'frames');
    } finally {
      rmSync(frames, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({
  libraryId: 'claude-of-tanks-brand-motion-245', author: 'Kevin B. Liu', copyright: 'Copyright © 2026 Kevin B. Liu',
  license: 'LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0',
  thirdParty: 'The commander figure is the Claude Code mascot glyph (Anthropic), verbatim; see docs/ATTRIBUTION.md.',
  generatedBy: 'node tools/brand-motion-export.mjs (src/ui/brandMarkMotion.ts), ffmpeg (libx264 crf 18, libvpx-vp9 crf 30, GIF palette 64)',
  loop: { seconds: LOOP_S, fps: FPS, loops: LOOPS },
  items: [
    { file: 'commander-loop.mp4', size: '1280x720' }, { file: 'commander-loop.webm', size: '1280x720' }, { file: 'commander-loop.gif', size: '640x360' },
    { file: 'title-card-loop.mp4', size: '1080x1080' }, { file: 'title-card-loop.webm', size: '1080x1080' },
  ],
}, null, 1)}\n`);
