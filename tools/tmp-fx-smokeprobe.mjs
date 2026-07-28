// TEMP effects_combat r1: inspect smoke pool state in the staged explosion view.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5960, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERR', String(e)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page.evaluate(() => { window.__SHOTS.set('explosion'); });
await new Promise((r) => setTimeout(r, 1500));
const info = await page.evaluate(() => {
  const D = window.__DEBUG;
  const pools = D.fx && D.fx.__pools ? D.fx.__pools : null;
  // reach into particles through the fx group
  const out = { time: null, pools: {} };
  const grp = D.fx.group;
  const pgrp = grp.children.find((c) => c.name === 'fx-particles');
  out.groupVisible = grp.visible;
  out.pgrpVisible = pgrp ? pgrp.visible : null;
  if (pgrp) {
    for (const mesh of pgrp.children) {
      const g = mesh.geometry;
      const mat = mesh.material;
      const uT = mat.uniforms && mat.uniforms.uTime ? mat.uniforms.uTime.value : null;
      let live = 0, minB = 1e9, maxB = -1e9, maxLife = 0;
      const pb = g.getAttribute('aPB');
      const vlA = g.getAttribute('aVL') || g.getAttribute('aAL');
      if (pb && vlA && uT !== null) {
        for (let i = 0; i < g.instanceCount; i++) {
          const birth = pb.array[i * 4 + 3];
          const life = vlA.array[i * 4 + 3];
          if (life <= 0) continue;
          const age = uT - birth;
          if (age >= 0 && age <= life) { live++; minB = Math.min(minB, birth); maxB = Math.max(maxB, birth); maxLife = Math.max(maxLife, life); }
        }
      }
      out.pools[mesh.uuid.slice(0, 4) + ':' + (g.instanceCount || 0)] = {
        order: mesh.renderOrder, visible: mesh.visible, uTime: uT, live, minB: minB === 1e9 ? null : +minB.toFixed(2), maxB: maxB === -1e9 ? null : +maxB.toFixed(2), maxLife,
      };
      out.time = uT;
    }
  }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: 'shots/fxprobe/explosion_probe.png' });
await browser.close();
await server.close();
// second pass: smoke isolation — hide all additive/billow pools, re-shoot
const server2 = await createServer({ root: process.cwd(), logLevel: 'error', server: { port: 5980, strictPort: false } });
await server2.listen();
const url2 = `http://localhost:${server2.config.server.port}/`;
const browser2 = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
const page2 = await browser2.newPage();
await page2.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page2.goto(url2, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page2.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
await page2.evaluate(() => {
  window.__SHOTS.set('explosion');
  const D = window.__DEBUG;
  const pgrp = D.fx.group.children.find((c) => c.name === 'fx-particles');
  for (const mesh of pgrp.children) {
    if (mesh.renderOrder >= 21.5 || mesh.renderOrder === 0) mesh.visible = false; // hide billow/fire/jet/flash/sparks/debris
  }
});
await new Promise((r) => setTimeout(r, 1500));
await page2.screenshot({ path: 'shots/fxprobe/explosion_smoke_only.png' });
await browser2.close();
await server2.close();
