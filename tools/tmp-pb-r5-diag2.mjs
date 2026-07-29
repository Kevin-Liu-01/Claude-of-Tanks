// tools/tmp-pb-r5-diag2.mjs — perf-owner r5: per-class triangle attribution at
// DETERMINISTIC __SHOTS views (player_view = chase cam, the probe's dominant
// regime; battlefield = establishing). Groups vegetation/props meshes by
// material cache-key class, measures per-class main+shadow contribution via
// visibility A/B against renderer.info. Contention-independent.
// Usage: node tools/tmp-pb-r5-diag2.mjs [--out file] [--view player_view]
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, fb) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : fb; };
const outFile = opt('out', '');
const ROSTER = ['kv2', 'jagdtiger', 'tiger2', 'object279', 'is7', 't30', 't95'];

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5900 + Math.floor(Math.random() * 90), strictPort: false, hmr: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });

const report = {};
for (const view of ['player_view', 'battlefield']) {
  await page.evaluate(async (v) => { await window.__SHOTS.set(v); }, view);
  await new Promise((r) => setTimeout(r, 1800));
  report[view] = await page.evaluate(async () => {
    const D = window.__DEBUG;
    const R = D.renderer;
    const out = {};
    const triOf = (g) => {
      if (!g) return 0;
      const idx = g.index; const pos = g.attributes && g.attributes.position;
      const n = idx ? idx.count : (pos ? pos.count : 0);
      return Math.floor(n / 3);
    };
    const classOf = (o) => {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m) return o.name || o.type;
      let key = '';
      try { key = typeof m.customProgramCacheKey === 'function' ? m.customProgramCacheKey() : ''; } catch (_) { /* */ }
      if (key && key !== 'undefined' && !/^\d+$/.test(key)) return key;
      return m.name || o.name || `${o.type}:${m.type}`;
    };
    const measure = (ms) => new Promise((res) => {
      R.info.autoReset = false;
      const calls = []; const tris = [];
      const t0 = performance.now();
      function frame() {
        const t = performance.now() - t0;
        if (t > ms) {
          R.info.autoReset = true;
          calls.sort((a, b) => a - b); tris.sort((a, b) => a - b);
          res({
            callsMed: calls[Math.floor(calls.length / 2)] || 0,
            trisMed: tris[Math.floor(tris.length / 2)] || 0,
          });
          return;
        }
        if (R.info.render.calls > 0) { calls.push(R.info.render.calls); tris.push(R.info.render.triangles); }
        R.info.reset();
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    // ---- inventory by class over the whole scene ----
    const classes = new Map(); // class -> {meshes:[], tris, inst, casterTris}
    D.scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      let vis = o.visible; let p = o.parent;
      while (vis && p) { vis = p.visible !== false; p = p.parent; }
      if (!vis) return;
      const cls = classOf(o);
      const mult = o.isInstancedMesh ? (o.count || 0) : 1;
      const t = triOf(o.geometry) * mult;
      const e = classes.get(cls) || { n: 0, inst: 0, tris: 0, casterTris: 0, objs: [] };
      e.n++; e.inst += mult; e.tris += t;
      if (o.castShadow) e.casterTris += t;
      e.objs.push(o.uuid);
      classes.set(cls, e);
    });
    out.classes = [...classes.entries()]
      .map(([k, v]) => ({ cls: k, n: v.n, inst: v.inst, tris: v.tris, casterTris: v.casterTris }))
      .sort((a, b) => b.tris - a.tris).slice(0, 28);

    // ---- A/B per top class (hide → measure delta) ----
    out.ab = {};
    out.ab.base = await measure(900);
    R.shadowMap.enabled = false;
    out.ab.shadowOff = await measure(900);
    R.shadowMap.enabled = true;
    await measure(250);
    const uuidToObj = new Map();
    D.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) uuidToObj.set(o.uuid, o); });
    for (const c of out.classes.slice(0, 12)) {
      if (c.tris < 120000) continue;
      const objs = [...classes.get(c.cls).objs].map((u) => uuidToObj.get(u)).filter(Boolean);
      const saved = objs.map((o) => o.visible);
      for (const o of objs) o.visible = false;
      out.ab[c.cls] = await measure(700);
      objs.forEach((o, i) => { o.visible = saved[i]; });
      await measure(200);
    }
    return out;
  });
}

report.consoleErrors = errors.slice(0, 10);
const json = JSON.stringify(report, null, 2);
console.log(json);
if (outFile) writeFileSync(resolve(outFile), json);
await browser.close();
await server.close();
process.exit(0);
