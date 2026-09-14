#!/usr/bin/env node
// Shadow render-truth check: verifies RENDERED sun shadows in a live battle scene
// instead of inspecting code shape. Still camera, temporal passes off, every
// render synchronous, so the baseline (same state rendered twice) is 0 px.
//
//   node tools/shadow-render-truth.mjs [--url=http://127.0.0.1:5197/?tier=desktop]
//        [--map=verdant] [--out=.qa-dev/out/shadow-render-truth] [--gate] [--strict]
//
// Checks
//   determinism  the same frame rendered twice gives identical shadow masks
//   cullParity   the cascade caster culling (__SHADOW_DEBUG.noCull off/on) changes
//                nothing a viewer can see — the 2026-09-13 root cause of whole
//                tree/bush/pole shadows flashing while the camera moved
//   casters      every caster class present in the scene contributes shadow pixels
//                (trunks, canopy proxies, bushes, props, tank, structures)
// --gate exits 1 when determinism or cullParity fail (or, with --strict, when a
// present caster class casts nothing). Output: JSON summary and diff PNGs.
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const url = opt('url', 'http://127.0.0.1:5197/?tier=desktop');
const mapId = opt('map', 'verdant');
const out = resolve(opt('out', '.qa-dev/out/shadow-render-truth'));
const gate = flag('gate');
const strict = flag('strict');
/** Pixels of mask difference tolerated for the hard checks (driver noise floor is 0 today). */
const PARITY_TOLERANCE_PX = Number(opt('tolerance', '25'));
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 10 * 60 * 1000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,720'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.setDefaultTimeout(300000);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 180000 });
  await page.evaluate((id) => window.__DEBUG.beginSoloBattle({ mapId: id }), mapId);
  await page.waitForFunction(() => window.__DEBUG?.game?.phase === 'battle', { timeout: 240000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 5000)));

  const result = await page.evaluate(() => {
    const D = window.__DEBUG;
    const src = D.renderer.domElement;
    const W = src.width, H = src.height, NP = W * H;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const lights = D.lighting.csm.lights;
    const saved = lights.map((l) => l.shadow.intensity);
    const taa = D.post?.taa;
    const taaWas = taa ? taa.enabled : null;
    if (taa) taa.enabled = false;
    const ao = D.post?.gtao ?? D.post?.passes?.gtao ?? D.post?.ao;
    const aoWas = ao ? ao.enabled : null;
    if (ao) ao.enabled = false;
    const grabLum = () => {
      ctx.drawImage(src, 0, 0);
      const d = ctx.getImageData(0, 0, W, H).data;
      const L = new Float32Array(NP);
      for (let p = 0; p < NP; p++) L[p] = 0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2];
      return L;
    };
    const renderAll = () => {
      for (const l of lights) l.shadow.needsUpdate = true;
      D.post.render(0, 0);
      for (const l of lights) l.shadow.needsUpdate = true;
      D.post.render(0, 0);
    };
    /** Screen-space sun-shadow mask: luminance lost when every cascade's shadow term is disabled. */
    const shadowMask = () => {
      for (const l of lights) l.shadow.intensity = 0;
      renderAll();
      const off = grabLum();
      lights.forEach((l, i) => { l.shadow.intensity = saved[i]; });
      renderAll();
      const on = grabLum();
      const m = new Uint8Array(NP);
      let n = 0;
      for (let p = 0; p < NP; p++) if (off[p] - on[p] > 10) { m[p] = 1; n++; }
      return { m, n, on };
    };
    const diff = (a, b) => { let d = 0, onlyA = 0, onlyB = 0; for (let p = 0; p < NP; p++) if (a[p] !== b[p]) { d++; if (a[p]) onlyA++; else onlyB++; } return { d, onlyA, onlyB }; };
    const diffPng = (base, a, b) => {
      const img = ctx.createImageData(W, H);
      for (let p = 0; p < NP; p++) {
        const g = base[p] * 0.45, q = p * 4;
        img.data[q] = a[p] && !b[p] ? 255 : g; img.data[q + 1] = !a[p] && b[p] ? 255 : g; img.data[q + 2] = g; img.data[q + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    };
    const setCull = (on) => { window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noCull: !on }); };

    // determinism + cull parity
    setCull(true);
    const a = shadowMask();
    const a2 = shadowMask();
    setCull(false);
    const b = shadowMask();
    setCull(true);
    const determinism = diff(a.m, a2.m);
    const parity = diff(a.m, b.m);
    const parityPng = diffPng(a.on, a.m, b.m);

    // caster classes: disable one class at a time, measure the shadow pixels that vanish
    const classOf = (o) => {
      if (!o.castShadow) return null;
      if (o.userData?.cotCasterProxy) return null; // follows its owner
      if (o.userData?.authoredShadowProxy || o.userData?.shadowVehicleId) return 'tank';
      if (o.userData?.treeTrunk) return 'trunks';
      if (o.userData?.treeCanopyShadowProxy) return 'canopies';
      if (o.isInstancedMesh && (o.material?.alphaTest ?? 0) > 0) return 'bushes';
      if (o.isInstancedMesh) return 'props';
      if (o.isMesh || o.isBatchedMesh) return 'structures';
      return null;
    };
    const classes = {};
    D.scene.traverse((o) => { const c = classOf(o); if (c) (classes[c] ||= []).push(o); });
    const casters = {};
    for (const [name, list] of Object.entries(classes)) {
      for (const o of list) { o.castShadow = false; for (const proxy of o.children) if (proxy.userData?.cotCasterProxy) proxy.castShadow = false; }
      const without = shadowMask();
      for (const o of list) { o.castShadow = true; for (const proxy of o.children) if (proxy.userData?.cotCasterProxy) proxy.castShadow = true; }
      const lost = diff(a.m, without.m);
      casters[name] = { objects: list.length, shadowPxLost: lost.onlyA, shadowPxGained: lost.onlyB };
    }
    renderAll();
    if (taa && taaWas !== null) taa.enabled = taaWas;
    if (ao && aoWas !== null) ao.enabled = aoWas;
    let proxies = 0;
    D.scene.traverse((o) => { if (o.userData?.cotCasterProxy) proxies++; });
    return { W, H, shadowPx: a.n, determinism, parity, parityPng, casters, proxies };
  });

  writeFileSync(`${out}/cull-parity-diff.png`, Buffer.from(result.parityPng.split(',')[1], 'base64'));
  const { parityPng, ...summary } = result;
  const failures = [];
  if (summary.determinism.d > PARITY_TOLERANCE_PX) failures.push(`determinism: ${summary.determinism.d} px differ between two renders of the same state`);
  if (summary.parity.d > PARITY_TOLERANCE_PX) failures.push(`cullParity: culling changes ${summary.parity.d} px (${summary.parity.onlyA} missing with cull, ${summary.parity.onlyB} extra)`);
  const silent = Object.entries(summary.casters).filter(([, c]) => c.objects > 0 && c.shadowPxLost === 0).map(([n]) => n);
  if (strict && silent.length) failures.push(`casters: present classes cast nothing: ${silent.join(', ')}`);
  const report = { url, map: mapId, tolerancePx: PARITY_TOLERANCE_PX, ...summary, silentCasterClasses: silent, failures, pass: failures.length === 0 };
  writeFileSync(`${out}/result.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, shadowPx: report.shadowPx, determinism: report.determinism.d, cullParity: report.parity.d, casters: report.casters, proxies: report.proxies, silentCasterClasses: silent, failures }));
  if (gate && failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
