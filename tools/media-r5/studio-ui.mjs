#!/usr/bin/env node
// Scene Studio UI capture: the real page (3D view + panel) frame by frame while a scripted
// session plays — the Studio segment of the trailer and the Studio feature film.
//   node tools/media-r5/studio-ui.mjs --script=a.json[,b.json] --out=dir [--port=7424] [--dpr=1]
// Several scripts share one browser; the GPU lock is held per script (short leases).
// Script: { map, scene (path), fps, frames, viewport:[w,h], actions:[{frame, do:'picture'|'time'|'scroll'|'select'|'eval', ...}] }
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const ROOT = process.cwd();
const { createCaptureLock } = await import(join(ROOT, 'tools/capture-lock.mjs'));
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)=(.*)$/.exec(a); if (!m) throw Error(a); return [m[1], m[2]]; }));
const scripts = args.script.split(',').map(f => ({ name: f.split('/').pop().replace(/\.json$/, ''), ...JSON.parse(readFileSync(resolve(f), 'utf8')) }));
const outRoot = resolve(args.out);
const [VW, VH] = scripts[0].viewport ?? [1920, 1080], DPR = Number(args.dpr ?? 1), port = Number(args.port ?? 7424);
const lock = createCaptureLock(); // held per script below, not while the server and browser start
const lease = setInterval(() => lock.refresh?.(), 30000); lease.unref();
let server, browser;
try {
  server = await createServer({ root: ROOT, logLevel: 'error', cacheDir: join(outRoot, '.vite'), server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
  // the page opens only once the GPU is ours (a page left idle through a long queue can detach)
  let page = null;
  const raf = (n = 2) => page.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
  for (const script of scripts) {
    await lock.acquire(3 * 60 * 60 * 1000);
    try {
      await page?.close().catch(() => {});
      page = await browser.newPage();
      await page.setViewport({ width: VW, height: VH, deviceScaleFactor: DPR });
      await page.goto(`http://127.0.0.1:${port}/?studio=1&nosplash=1&tier=desktop&map=${script.map}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
      await page.waitForFunction(() => window.__STUDIO?.active && window.__GAME_READY, { timeout: 240000 });
      const out = join(outRoot, script.name); mkdirSync(join(out, 'frames'), { recursive: true });
      const scene = script.scene ? JSON.parse(readFileSync(resolve(script.scene), 'utf8')) : { map: script.map, actors: [], effects: [], fxTime: 0, timeScale: 0 };
      await page.evaluate(s => window.__STUDIO.load(s), scene);
      await page.evaluate(async () => { const { awaitMapCaptureReadiness } = await import('/src/dev/mapCaptureReadiness.ts'); await awaitMapCaptureReadiness(window.__DEBUG.world, () => window.__DEBUG.world); });
      // a paused timeline shows Studio's camera-rail guide (keyframe spheres drawn over everything); hide it unless the script wants it
      await page.evaluate(showRail => { window.__STUDIO.pause(); window.__STUDIO.seek?.(0); if (!showRail) window.__STUDIO.setRailVisible?.(false); window.__DEBUG.post.pinDynScale(1); window.__DEBUG.post.setAdaptiveSuspended(true); }, !!script.showRail);
      const act = async a => {
        if (a.do === 'picture') await page.evaluate(p => { window.__STUDIO.setPicture(p); window.__STUDIO.panel?.refreshPicture?.(); }, a.patch);
        else if (a.do === 'time') await page.evaluate(t => window.__STUDIO.setTimeOfDay(t), a.time);
        else if (a.do === 'light') await page.evaluate(l => window.__STUDIO.setLight(l), a.light);
        else if (a.do === 'scroll') await page.evaluate(text => {
          const el = [...document.querySelectorAll('.cot-studio *')].find(e => e.children.length < 4 && e.textContent?.trim().toLowerCase() === text.toLowerCase());
          el?.scrollIntoView({ block: 'start' });
        }, a.text);
        else if (a.do === 'click') await page.evaluate(text => {
          const el = [...document.querySelectorAll('.cot-studio button, .cot-studio [role=tab]')].find(e => e.textContent?.trim().toLowerCase().includes(text.toLowerCase()));
          el?.click();
        }, a.text);
        else if (a.do === 'eval') await page.evaluate(new Function(a.code));
      };
      const fps = script.fps ?? 30, frames = script.frames ?? 90, step = script.stepMs ?? 1000 / fps;
      for (let f = 0; f < frames; f++) {
        for (const a of script.actions ?? []) if (a.frame === f) await act(a);
        if (f && script.play !== false) await page.evaluate(ms => window.__STUDIO.advanceFrame(ms), step);
        await raf(script.settleRafs ?? 2);
        await page.screenshot({ path: join(out, 'frames', `f${String(f).padStart(5, '0')}.png`), type: 'png' });
        if (f % 30 === 0) console.log(`[ui] ${script.name} ${f}/${frames}`);
      }
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', join(out, 'frames/f%05d.png'), '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', join(out, 'studio-ui.mp4')]);
      console.log(`[ui] ${script.name} done -> ${join(out, 'studio-ui.mp4')}`);
    } finally { lock.release(); }
  }
} finally { await browser?.close().catch(() => {}); await server?.close().catch(() => {}); clearInterval(lease); lock.release(); }
