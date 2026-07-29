// tools/tmp-perf-diag.mjs — perf-owner diagnostic: enter the perfprobe battle
// (m1a2/verdant, forceFire) and attribute draw calls / triangles / shadow
// casters per scene subtree and per tank over a full 60 s probe-shaped window.
// Emits a per-second timeline (phase, glb stats, calls, tris, heap) so content
// landings and battle-phase transitions are visible, then a final subtree /
// per-tank attribution snapshot.
// Usage: node tools/tmp-perf-diag.mjs [--seconds 60] [--out file]
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, fb) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : fb; };
const seconds = parseFloat(opt('seconds', '60'));
const outFile = opt('out', '');

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
await page.evaluate(() => {
  window.__DEBUG.startBattle('m1a2', 'verdant');
  window.__DEBUG.flags.forceFire = true;
});
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => { if (window.gc) { window.gc(); window.gc(); } });
await page.keyboard.down('KeyW');

await page.evaluate((sampleMs) => {
  const D = window.__DEBUG;
  const R = D.renderer;
  R.info.autoReset = false;
  window.__DIAG = { timeline: [], done: false, maxCalls: 0, maxCallsAt: 0, tris: [], calls: [] };
  const G = window.__DIAG;
  const t0 = performance.now();
  let secMark = 0;
  let frameCalls = 0; let frameTris = 0;
  function frame(now) {
    const t = now - t0;
    if (t > sampleMs) { R.info.autoReset = true; G.done = true; return; }
    frameCalls = R.info.render.calls; frameTris = R.info.render.triangles;
    if (frameCalls > 0) { G.calls.push(frameCalls); G.tris.push(frameTris); }
    if (frameCalls > G.maxCalls) { G.maxCalls = frameCalls; G.maxCallsAt = +(t / 1000).toFixed(1); }
    if (t >= secMark * 1000) {
      G.timeline.push({
        t: secMark,
        phase: D.game.phase,
        timeS: +(D.game.timeS || 0).toFixed(0),
        glb: window.__GLB_STATS ? `${window.__GLB_STATS.settled}/${window.__GLB_STATS.started}` : '-',
        calls: frameCalls,
        tris: frameTris,
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1,
        aliveTanks: (D.game.tanks || []).filter((x) => !x.dead && !x.destroyed).length,
      });
      secMark += 1;
    }
    R.info.reset();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}, seconds * 1000);
await page.waitForFunction('window.__DIAG && window.__DIAG.done === true', { timeout: (seconds + 30) * 1000 });
await page.keyboard.up('KeyW');

const report = await page.evaluate(() => {
  const D = window.__DEBUG;
  const G = window.__DIAG;
  const out = { timeline: G.timeline, maxCalls: G.maxCalls, maxCallsAt: G.maxCallsAt, tanks: [], subtrees: [] };
  const sorted = G.tris.slice().sort((a, b) => a - b);
  const csorted = G.calls.slice().sort((a, b) => a - b);
  out.trisMedian = sorted[Math.floor(sorted.length / 2)] || 0;
  out.callsMedian = csorted[Math.floor(csorted.length / 2)] || 0;
  const triOf = (g) => {
    if (!g) return 0;
    const idx = g.index; const pos = g.attributes && g.attributes.position;
    const n = idx ? idx.count : (pos ? pos.count : 0);
    return Math.floor(n / 3);
  };
  function statsOf(root) {
    let meshes = 0; let casters = 0; let tris = 0; let casterTris = 0;
    root.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      let vis = o.visible; let p = o.parent;
      while (vis && p) { vis = p.visible !== false; p = p.parent; }
      if (!vis) return;
      const mult = o.isInstancedMesh ? (o.count || 0) : 1;
      meshes++;
      const t = triOf(o.geometry) * mult;
      tris += t;
      if (o.castShadow) { casters++; casterTris += t; }
    });
    return { meshes, casters, tris, casterTris };
  }
  for (const child of D.scene.children) {
    const s = statsOf(child);
    if (s.meshes === 0) continue;
    out.subtrees.push({ name: child.name || child.type, ...s });
  }
  for (const t of (D.game.tanks || [])) {
    if (!t.visual || !t.visual.root) continue;
    const s = statsOf(t.visual.root);
    out.tanks.push({ id: (t.spec && t.spec.id) || '?', isPlayer: !!t.isPlayer, dead: !!(t.dead || t.destroyed), ...s });
  }
  out.tanks.sort((a, b) => b.tris - a.tris);
  out.subtrees.sort((a, b) => b.tris - a.tris);
  return out;
});
report.consoleErrors = errors.slice(0, 10);

const json = JSON.stringify(report, null, 2);
console.log(json);
if (outFile) writeFileSync(resolve(outFile), json);
await browser.close();
await server.close();
process.exit(0);
