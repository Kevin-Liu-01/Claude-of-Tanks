// tools/tmp-pb-r3-diag.mjs — perf-owner r3 attribution: texture MB by owner
// subtree + size histogram, world-child triangle breakdown, per-tank mesh/
// material counts, and live A/B toggles (shadowMap, world casters, subtree
// visibility) measured against renderer.info. One battle, m1a2/verdant.
// Usage: node tools/tmp-pb-r3-diag.mjs [--out file] [--roster id1,id2,...]
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, fb) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : fb; };
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
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
await page.evaluate(() => {
  window.__DEBUG.startBattle('m1a2', 'verdant');
  window.__DEBUG.flags.forceFire = true;
});
// let GLB swaps land
await new Promise((r) => setTimeout(r, 12000));

const report = await page.evaluate(async () => {
  const D = window.__DEBUG;
  const R = D.renderer;
  const out = {};

  // ---- texture attribution ----
  const texInfo = new Map(); // uuid -> {mb,w,h,owners:Set,kind}
  const mbOf = (t) => {
    const img = t.image;
    let w = 0; let h = 0;
    if (img) { w = img.width || 0; h = img.height || 0; }
    else if (t.isDataTexture && t.source && t.source.data) { w = t.source.data.width || 0; h = t.source.data.height || 0; }
    if (!w || !h) return { mb: 0, w, h };
    const mip = t.generateMipmaps ? 1.3333 : 1;
    return { mb: (w * h * 4 * mip * (t.isCubeTexture ? 6 : 1)) / 1048576, w, h };
  };
  const ownerOf = (o) => {
    let n = o;
    while (n && n.parent && n.parent.type !== 'Scene') n = n.parent;
    return (n && n.name) || o.name || o.type;
  };
  D.scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (!v || !v.isTexture) continue;
        if (!texInfo.has(v.uuid)) {
          const s = mbOf(v);
          texInfo.set(v.uuid, { mb: s.mb, w: s.w, h: s.h, owners: new Set(), slots: new Set(), name: v.name || '' });
        }
        const e = texInfo.get(v.uuid);
        e.owners.add(ownerOf(o));
        e.slots.add(k);
      }
    }
  });
  if (D.scene.environment) { const s = mbOf(D.scene.environment); texInfo.set('env', { mb: s.mb, w: s.w, h: s.h, owners: new Set(['<environment>']), slots: new Set(['env']), name: 'env' }); }
  // group by primary owner
  const byOwner = new Map();
  let totalMB = 0;
  for (const e of texInfo.values()) {
    totalMB += e.mb;
    const key = [...e.owners][0] || '?';
    const g = byOwner.get(key) || { mb: 0, n: 0, sizes: {} };
    g.mb += e.mb; g.n += 1;
    const sz = `${e.w}x${e.h}`;
    g.sizes[sz] = (g.sizes[sz] || 0) + 1;
    byOwner.set(key, g);
  }
  out.textureTotalMB = +totalMB.toFixed(1);
  out.textureCount = texInfo.size;
  out.texturesByOwner = [...byOwner.entries()]
    .map(([k, v]) => ({ owner: k, mb: +v.mb.toFixed(1), n: v.n, sizes: v.sizes }))
    .sort((a, b) => b.mb - a.mb);
  // largest individual textures
  out.largestTextures = [...texInfo.values()]
    .sort((a, b) => b.mb - a.mb).slice(0, 24)
    .map((e) => ({ mb: +e.mb.toFixed(1), dims: `${e.w}x${e.h}`, owners: [...e.owners].slice(0, 3), slots: [...e.slots].slice(0, 4), name: e.name }));

  // ---- world child triangle breakdown ----
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
  const worldRoot = D.scene.children.find((c) => /^world-/.test(c.name || ''));
  out.worldChildren = [];
  if (worldRoot) {
    for (const c of worldRoot.children) {
      const s = statsOf(c);
      if (!s.meshes) continue;
      out.worldChildren.push({ name: c.name || c.type, ...s });
    }
    out.worldChildren.sort((a, b) => b.tris - a.tris);
    // one more level into the biggest child if it's a group
    const big = worldRoot.children.slice().sort((a, b) => statsOf(b).tris - statsOf(a).tris)[0];
    if (big && big.children && big.children.length > 1) {
      out.biggestChildBreakdown = { name: big.name || big.type, children: [] };
      for (const c of big.children) {
        const s = statsOf(c);
        if (!s.meshes) continue;
        out.biggestChildBreakdown.children.push({ name: c.name || `${c.type}(${(c.geometry && c.geometry.type) || ''})`, ...s });
      }
      out.biggestChildBreakdown.children.sort((a, b) => b.tris - a.tris);
      out.biggestChildBreakdown.children = out.biggestChildBreakdown.children.slice(0, 30);
    }
  }

  // ---- per-tank mesh/material/draw shape ----
  out.tanks = [];
  for (const t of (D.game.tanks || [])) {
    if (!t.visual || !t.visual.root) continue;
    const mats = new Set(); let meshes = 0; let tris = 0; let rootVisible = true;
    let n = t.visual.root; while (n) { if (n.visible === false) rootVisible = false; n = n.parent; }
    t.visual.root.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh)) return;
      let vis = o.visible; let p = o.parent;
      while (vis && p && p !== t.visual.root.parent) { vis = p.visible !== false; p = p.parent; }
      if (!vis) return;
      meshes++; tris += triOf(o.geometry) * (o.isInstancedMesh ? (o.count || 0) : 1);
      const mm = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mm) if (m) mats.add(m.uuid);
    });
    out.tanks.push({ id: t.specId, isPlayer: !!t.isPlayer, rootVisible, meshes, materials: mats.size, tris });
  }
  out.tanks.sort((a, b) => b.meshes - a.meshes);

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
  const M = 2500;
  out.ab = {};
  out.ab.base = await measure(M);
  // shadow map off => total shadow-pass contribution
  R.shadowMap.enabled = false;
  out.ab.shadowOff = await measure(M);
  R.shadowMap.enabled = true;
  await measure(400);
  return out;
});

// second pass: world-child A/B needs names from the first pass
const tops = (report.worldChildren || []).slice(0, 7).map((c) => c.name);
report.abWorldChildren = await page.evaluate(async (names) => {
  const D = window.__DEBUG;
  const R = D.renderer;
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
  const worldRoot = D.scene.children.find((c) => /^world-/.test(c.name || ''));
  const outAB = {};
  if (!worldRoot) return outAB;
  for (const name of names) {
    const node = worldRoot.children.find((c) => (c.name || c.type) === name);
    if (!node) continue;
    node.visible = false;
    outAB[name] = await measure(2000);
    node.visible = true;
    await measure(300);
  }
  return outAB;
}, tops);

report.consoleErrors = errors.slice(0, 10);
const json = JSON.stringify(report, null, 2);
console.log(json);
if (outFile) writeFileSync(resolve(outFile), json);
await browser.close();
await server.close();
process.exit(0);
