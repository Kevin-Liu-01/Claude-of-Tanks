#!/usr/bin/env node
// Does the living mark keep moving while the main thread is busy? (2026-10-26, the boot census; owner: "even the claude
// tank animation doesnt play bc its just loading".) For the svg loop (brandMarkMotionSVG) and the compositor layers
// (brandMarkMotionLayers), in a headless browser:
//   1. the same frames: every animation paused at the same times, each version's element screenshotted (out/frames/);
//   2. a 1.5 s busy main thread: the screencast frames whose pixels change inside it (a compositor animation keeps
//      producing them; a main-thread one produces none).
// Usage: node tools/mark-compositor-probe.mjs --src=<checkout with src/ui/brandMarkMotion.ts> --out=<dir> [--lock]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const src = resolve(arg('src') ?? '.');
const out = resolve(arg('out') ?? 'mark-probe');
const width = Number(arg('width') ?? 540);
const busyMs = Number(arg('busy-ms') ?? 1500);
const motion = await import(join(src, 'src/ui/brandMarkMotion.ts'));
const versions = {
  svg: { css: motion.BRAND_MOTION_CSS, markup: motion.brandMarkMotionSVG(106) },
  layers: { css: motion.BRAND_MOTION_LAYER_CSS, markup: motion.brandMarkMotionLayers() },
};
const page = (version) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#0b0e11;color:#f6f3ec;--accent:#f0a030}
.host{width:${width}px;margin:40px}.host>svg{display:block;width:100%;height:auto}${version.css}</style><div class="host">${version.markup}</div>`;

mkdirSync(join(out, 'frames'), { recursive: true });
const lock = process.argv.includes('--lock') ? createCaptureLock() : null;
if (lock) { await lock.acquire(60 * 60 * 1000, { place: 'mark-compositor-probe' }); setInterval(() => lock.refresh(), 30_000).unref(); }
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--js-flags=--max-old-space-size=3072', '--window-size=700,500'] });
const report = {};
try {
  for (const [name, version] of Object.entries(versions)) {
    // 1. the same frames
    const tab = await browser.newPage();
    await tab.setViewport({ width: width + 80, height: Math.round(width * 106 / 184) + 80, deviceScaleFactor: 2 });
    await tab.setContent(page(version), { waitUntil: 'load' });
    const host = await tab.$('.host');
    const shots = [];
    for (let t = 0; t < 1200; t += 100) {
      await tab.evaluate((ms) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; } }, t);
      await tab.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const file = join(out, 'frames', `${name}-${String(t).padStart(4, '0')}.png`);
      await host.screenshot({ path: file });
      shots.push(file);
    }
    const animations = await tab.evaluate(() => document.getAnimations().length);
    await tab.close();
    // 2. a busy main thread
    const live = await browser.newPage();
    await live.setViewport({ width: width + 80, height: Math.round(width * 106 / 184) + 80, deviceScaleFactor: 1 });
    await live.setContent(page(version), { waitUntil: 'load' });
    const cdp = await live.createCDPSession();
    const frames = [];
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      frames.push({ t: metadata.timestamp * 1000, hash: createHash('sha1').update(data).digest('hex'), data });
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await new Promise((r) => setTimeout(r, 800));
    const window = await live.evaluate((ms) => new Promise((done) => setTimeout(() => {
      const from = Date.now(); const until = performance.now() + ms;
      while (performance.now() < until) { /* the main thread held */ }
      done({ from, to: Date.now() });
    }, 0)), busyMs);
    await new Promise((r) => setTimeout(r, 600));
    await cdp.send('Page.stopScreencast');
    const inside = frames.filter((f) => f.t > window.from + 50 && f.t < window.to - 20);
    // a sample of the frames inside the window, for a look at which parts moved
    mkdirSync(join(out, 'busy'), { recursive: true });
    inside.filter((_, i) => i % Math.max(1, Math.floor(inside.length / 8)) === 0).slice(0, 8).forEach((f, i) =>
      writeFileSync(join(out, 'busy', `${name}-${i}.png`), Buffer.from(f.data, 'base64')));
    const distinct = new Set(inside.map((f) => f.hash)).size;
    const before = frames.filter((f) => f.t < window.from);
    report[name] = { animations, shots: shots.length, framesBefore: before.length, framesInsideBusy: inside.length, distinctInsideBusy: distinct,
      busyMs: window.to - window.from };
    await live.close();
  }
} finally {
  await browser.close();
  if (lock) await lock.release?.();
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
for (const [name, row] of Object.entries(report)) {
  console.log(`${name}: ${row.animations} animations; screencast frames before the busy window ${row.framesBefore}; inside its ${row.busyMs} ms `
    + `${row.framesInsideBusy} frames, ${row.distinctInsideBusy} distinct`);
}
process.exit(0);
