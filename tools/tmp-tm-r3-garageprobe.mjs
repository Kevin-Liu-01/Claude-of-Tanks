// tools/tmp-tm-r3-garageprobe.mjs — tank_models r3 diagnostic.
// Mode A (default): replay the harness view sequence (battlefield -> garage)
//   and sample __GLB_STATS + pedestal tank visibility over time.
// Mode B (--live ids): live-mode carousel walk — click each id's card, wait,
//   report WHICH tank group sits on the pedestal + screenshot it.
// Usage: node tools/tmp-tm-r3-garageprobe.mjs [--live id1,id2] [--out shots/tm_r3]

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fb) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fb; };
const outDir = resolve(opt('out', 'shots/tm_r3'));
const liveIds = opt('live', '') ? opt('live', '').split(',') : null;
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: {
    port: 6100 + Math.floor(Math.random() * 300), strictPort: false,
    hmr: false, watch: { ignored: ['**/*'] }, // concurrent editors must not reload the probe page
  },
  optimizeDeps: {
    entries: ['index.html'],
    include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js'],
  },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
console.log(`[tmprobe] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// Sample the pedestal: every tank_* group within 60 m of the garage disc.
const SAMPLE = `(() => {
  const D = window.__DEBUG; if (!D) return null;
  const out = { stats: { ...(window.__GLB_STATS || {}) }, tanks: [] };
  D.scene.traverse((o) => {
    if (!o.name || !o.name.startsWith('tank_')) return;
    if (o.parent !== D.scene) return;
    const dx = o.position.x + 1500, dz = o.position.z + 1500;
    if (dx * dx + dz * dz > 3600) return;
    let visCount = 0, hidCount = 0;
    o.traverse((c) => { if (c.isMesh) (c.visible ? visCount++ : hidCount++); });
    out.tanks.push({ name: o.name, groupVisible: o.visible, visMeshes: visCount, hidMeshes: hidCount });
  });
  return out;
})()`;

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });

  if (!liveIds) {
    console.log('[tmprobe] MODE A: harness replay (full preceding view list)');
    console.log('  at ready:', JSON.stringify(await page.evaluate(SAMPLE)));
    const pre = ['battlefield', 'player_view', 'sniper_view', 'tank_closeup_modern',
      'tank_closeup_ww2', 'tank_closeup_t90m', 'tank_closeup_leo2a7',
      'detrack', 'combat_firing', 'explosion'];
    for (const v of pre) {
      await page.evaluate(`window.__SHOTS.set('${v}')`);
      await new Promise((r) => setTimeout(r, 1200));
    }
    console.log('  after 10 views:', JSON.stringify(await page.evaluate(SAMPLE)));
    await page.evaluate(`window.__SHOTS.set('garage')`);
    for (let t = 0; t <= 3600; t += 400) {
      const s = await page.evaluate(SAMPLE);
      console.log(`  garage+${t}ms:`, JSON.stringify(s));
      if (t === 1200) await page.screenshot({ path: `${outDir}/harness_garage_1200.png` });
      await new Promise((r) => setTimeout(r, 400));
    }
    await page.screenshot({ path: `${outDir}/harness_garage_4000.png` });
  } else {
    console.log('[tmprobe] MODE B: live carousel walk');
    // wait for the boot pedestal reveal to settle first
    await new Promise((r) => setTimeout(r, 4000));
    for (const id of liveIds) {
      const clicked = await page.evaluate((tid) => {
        const cards = [...document.querySelectorAll('.cot-card')];
        // find by thumb data attr (stable id key)
        const card = cards.find((c) => c.querySelector(`img[data-cot-thumb="${tid}"]`));
        if (!card) return false;
        card.scrollIntoView();
        card.click();
        return true;
      }, id);
      if (!clicked) { console.log(`  ${id}: CARD NOT FOUND`); continue; }
      await new Promise((r) => setTimeout(r, 2600));
      const s = await page.evaluate(SAMPLE);
      console.log(`  ${id}:`, JSON.stringify(s));
      await page.screenshot({ path: `${outDir}/live_${id}.png` });
    }
  }
} catch (err) {
  console.error(`[tmprobe] FAILED: ${err.message}`);
} finally {
  if (errors.length) { console.error(`[tmprobe] console errors (${errors.length}):`); for (const e of errors.slice(0, 10)) console.error('  ' + e); }
  await browser.close();
  await server.close();
}
process.exit(0);
