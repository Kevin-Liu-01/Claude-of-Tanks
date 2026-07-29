// tools/tmp-pb-r5-diag.mjs — perf-owner r5 triangle attribution on the PINNED
// certification roster: per-pass split (main vs shadow cascades), world-child
// triangle breakdown, per-tank tris, and A/B toggles (shadowMap off, tank
// castShadow off, per-subtree castShadow off) against renderer.info.
// Triangle counts are contention-independent (renderer.info is exact).
// Usage: node tools/tmp-pb-r5-diag.mjs [--out file]
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
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--enable-precise-memory-info'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
await page.evaluate((roster) => {
  const D = window.__DEBUG;
  D.flags.forceRoster = roster;
  D.startBattle('m1a2', 'verdant');
  D.flags.forceFire = true;
}, ROSTER);
// let GLB swaps land (same settle logic class as perfprobe)
await page.waitForFunction(
  `(() => {
    const s = window.__GLB_STATS;
    if (!s) return true;
    const key = s.settled + '/' + s.started;
    if (s.settled < s.started) { window.__GLB_STABLE = null; return false; }
    if (!window.__GLB_STABLE || window.__GLB_STABLE.key !== key) {
      window.__GLB_STABLE = { key, at: performance.now() };
      return false;
    }
    return performance.now() - window.__GLB_STABLE.at > 3000;
  })()`,
  { timeout: 30000, polling: 250 },
).catch(() => {});

const report = await page.evaluate(async () => {
  const D = window.__DEBUG;
  const R = D.renderer;
  const out = {};

  const triOf = (g) => {
    if (!g) return 0;
    const idx = g.index; const pos = g.attributes && g.attributes.position;
    const n = idx ? idx.count : (pos ? pos.count : 0);
    return Math.floor(n / 3);
  };
  const statsOf = (root) => {
    let meshes = 0; let inst = 0; let tris = 0; let casters = 0; let casterTris = 0;
    root.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      let vis = o.visible; let p = o.parent;
      while (vis && p) { vis = p.visible !== false; p = p.parent; }
      if (!vis) return;
      const mult = o.isInstancedMesh ? (o.count || 0) : 1;
      meshes++; inst += mult;
      const t = triOf(o.geometry) * mult;
      tris += t;
      if (o.castShadow) { casters++; casterTris += t; }
    });
    return { meshes, inst, tris, casters, casterTris };
  };

  // ---- world child triangle breakdown ----
  const worldRoot = D.scene.children.find((c) => /^world-/.test(c.name || ''));
  out.worldChildren = [];
  if (worldRoot) {
    for (const c of worldRoot.children) {
      const s = statsOf(c);
      if (!s.meshes) continue;
      out.worldChildren.push({ name: c.name || c.type, ...s });
    }
    out.worldChildren.sort((a, b) => b.tris - a.tris);
  }
  // scene-level children too (tanks live outside world root?)
  out.sceneChildren = [];
  for (const c of D.scene.children) {
    const s = statsOf(c);
    if (!s.meshes) continue;
    out.sceneChildren.push({ name: c.name || c.type, ...s });
  }
  out.sceneChildren.sort((a, b) => b.tris - a.tris);
  out.sceneChildren = out.sceneChildren.slice(0, 20);

  // ---- per-tank tris + caster tris ----
  out.tanks = [];
  for (const t of (D.game.tanks || [])) {
    if (!t.visual || !t.visual.root) continue;
    const s = statsOf(t.visual.root);
    out.tanks.push({ id: t.specId, isPlayer: !!t.isPlayer, ...s });
  }
  out.tanks.sort((a, b) => b.tris - a.tris);
  out.tankTrisTotal = out.tanks.reduce((a, t) => a + t.tris, 0);
  out.tankCasterTrisTotal = out.tanks.reduce((a, t) => a + t.casterTris, 0);

  // ---- A/B toggles against renderer.info ----
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
          callsMax: calls[calls.length - 1] || 0,
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
  const M = 3000;
  out.ab = {};
  out.ab.base = await measure(M);
  // shadow map off => total shadow-pass contribution
  R.shadowMap.enabled = false;
  out.ab.shadowOff = await measure(M);
  R.shadowMap.enabled = true;
  await measure(400);
  // tanks castShadow off => tank shadow contribution
  const saved = [];
  for (const t of (D.game.tanks || [])) {
    if (!t.visual || !t.visual.root) continue;
    t.visual.root.traverse((o) => {
      if ((o.isMesh || o.isInstancedMesh) && o.castShadow) { saved.push(o); o.castShadow = false; }
    });
  }
  out.ab.tankShadowOff = await measure(M);
  for (const o of saved) o.castShadow = true;
  await measure(400);
  // tanks fully hidden => tank total contribution (main+shadow)
  const roots = [];
  for (const t of (D.game.tanks || [])) {
    if (!t.visual || !t.visual.root || t.isPlayer) continue;
    roots.push(t.visual.root); t.visual.root.visible = false;
  }
  out.ab.enemyTanksHidden = await measure(M);
  for (const r of roots) r.visible = true;
  await measure(400);
  // per world-subtree castShadow off (top 5 by casterTris)
  out.ab.worldCasters = {};
  if (worldRoot) {
    const tops = out.worldChildren.filter((c) => c.casterTris > 100000).slice(0, 6).map((c) => c.name);
    for (const name of tops) {
      const node = worldRoot.children.find((c) => (c.name || c.type) === name);
      if (!node) continue;
      const sv = [];
      node.traverse((o) => {
        if ((o.isMesh || o.isInstancedMesh) && o.castShadow) { sv.push(o); o.castShadow = false; }
      });
      out.ab.worldCasters[name] = await measure(2000);
      for (const o of sv) o.castShadow = true;
      await measure(300);
    }
  }
  return out;
});

report.consoleErrors = errors.slice(0, 10);
const json = JSON.stringify(report, null, 2);
console.log(json);
if (outFile) writeFileSync(resolve(outFile), json);
await browser.close();
await server.close();
process.exit(0);
