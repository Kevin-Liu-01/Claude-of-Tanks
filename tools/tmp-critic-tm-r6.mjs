// tools/tmp-critic-tm-r6.mjs — tank_models r6 critic sampling probe.
// Walks garage era chips + carousel cards, screenshots each pedestal hero,
// cycles camo patterns on two paint-path representatives, and spot-checks
// turret articulation by yawing named turret nodes on GLB heroes.
// Usage: node tools/tmp-critic-tm-r6.mjs [--out shots/tm_r6]

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fb) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fb; };
const outDir = resolve(opt('out', 'shots/tm_r6'));
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: {
    port: 6400 + Math.floor(Math.random() * 300), strictPort: false,
    hmr: false, watch: { ignored: ['**/*'] },
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
console.log(`[tm-r6] vite up at ${url}`);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const CHIP = { ww2: 'WWII', modern: 'MODERN', community: 'COMMUNITY' };

async function clickChip(group) {
  return page.evaluate((label) => {
    const chips = [...document.querySelectorAll('.cot-era-chip')];
    const chip = chips.find((c) => c.textContent.toUpperCase().includes(label));
    if (!chip) return false;
    chip.click();
    return true;
  }, CHIP[group]);
}

async function clickCard(id) {
  return page.evaluate((tid) => {
    const cards = [...document.querySelectorAll('.cot-card')];
    const card = cards.find((c) => c.querySelector(`img[data-cot-thumb="${tid}"]`));
    if (!card) return false;
    card.scrollIntoView();
    card.click();
    return true;
  }, id);
}

// wait until the pedestal group for this id exists, is visible, and (for GLB
// swaps) has settled — poll visible mesh count stability.
async function waitPedestal(id, timeoutMs = 16000) {
  const t0 = Date.now();
  let last = -1, stable = 0;
  while (Date.now() - t0 < timeoutMs) {
    const n = await page.evaluate((tid) => {
      const D = window.__DEBUG; if (!D) return -2;
      let found = null;
      D.scene.traverse((o) => {
        if (found) return;
        if (!o.name || o.name !== `tank_${tid}`) return;
        const dx = o.position.x + 1500, dz = o.position.z + 1500;
        if (dx * dx + dz * dz > 3600) return;
        found = o;
      });
      if (!found || !found.visible) return -1;
      let vis = 0;
      found.traverse((c) => { if (c.isMesh && c.visible) vis++; });
      return vis;
    }, id);
    if (n > 0 && n === last) { stable++; if (stable >= 2) return n; } else stable = 0;
    last = n;
    await new Promise((r) => setTimeout(r, 700));
  }
  return -1;
}

async function shoot(name) {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`[tm-r6] captured ${name}.png`);
}

// yaw a GLB turret node (finds first node matching /turretpivot|^turret$|Object_2|Tank_Turret/i
// inside the pedestal group), returns node name or null
async function yawTurret(id, rad) {
  return page.evaluate((tid, r) => {
    const D = window.__DEBUG; if (!D) return null;
    let root = null;
    D.scene.traverse((o) => {
      if (root) return;
      if (o.name === `tank_${tid}`) {
        const dx = o.position.x + 1500, dz = o.position.z + 1500;
        if (dx * dx + dz * dz <= 3600) root = o;
      }
    });
    if (!root) return null;
    let node = null;
    const re = /(turretpivot|^turret$|^Turret$|Object_2|Tank_Turret)/i;
    root.traverse((o) => { if (!node && o.name && re.test(o.name)) node = o; });
    if (!node) return null;
    node.rotation.y += r;
    return node.name;
  }, id, rad);
}

const WALK = [
  // ---- modern expansion sample (>=6, incl >=2 CC-BY variants) ----
  ['modern', 'm1a1'],        // CC-BY variant (dannzjs base, SEP kit stripped)
  ['modern', 'm1a2_tusk'],   // CC-BY variant (ARAT/TUSK kit)
  ['modern', 't90a'],        // CC-BY variant (xarchenko clay)
  ['modern', 'leo2a6'],      // userdrop GLB (L55 check)
  ['modern', 'leclerc'],     // userdrop GLB
  ['modern', 'merkava4'],    // userdrop GLB
  ['modern', 'kf51'],        // userdrop GLB
  ['modern', 't80u'],        // userdrop GLB
  ['modern', 'chieftain'],   // procedural
  ['modern', 'k2'],          // procedural
  ['modern', 't14'],         // procedural
  ['modern', 'challenger2'], // procedural
  // ---- WWII core ----
  ['ww2', 'tiger1'],
  ['ww2', 't34_85'],
  ['ww2', 'panther_g'],
  ['ww2', 'm4a3e8'],
  ['ww2', 'is2'],
  // ---- community cohesion sample ----
  ['community', 'tiger2'],
  ['community', 'is7'],
  ['community', 'kv2'],
  ['community', 'strv103'],
  ['community', 'object279'],
];

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 3500)); // boot pedestal reveal settle

  for (const [group, id] of WALK) {
    if (!(await clickChip(group))) { console.log(`  ${id}: CHIP ${group} NOT FOUND`); continue; }
    await new Promise((r) => setTimeout(r, 250));
    if (!(await clickCard(id))) { console.log(`  ${id}: CARD NOT FOUND in ${group}`); continue; }
    const vis = await waitPedestal(id);
    if (vis <= 0) console.log(`  ${id}: PEDESTAL NOT SETTLED (vis=${vis})`);
    await new Promise((r) => setTimeout(r, 350));
    await shoot(`ped_${id}`);
  }

  // ---- articulation spot check on GLB heroes ----
  for (const [group, id] of [['modern', 'm1a2_tusk'], ['modern', 't80u'], ['community', 'tiger2']]) {
    await clickChip(group);
    await new Promise((r) => setTimeout(r, 250));
    await clickCard(id);
    await waitPedestal(id);
    const node = await yawTurret(id, 0.7);
    console.log(`  articulation ${id}: node=${node}`);
    await new Promise((r) => setTimeout(r, 400));
    await shoot(`art_${id}_yaw`);
  }

  // ---- camo cycle: GLB overlay path (m1a2) + procedural paint path (tiger1) ----
  const camoIdx = async (i) => page.evaluate((k) => {
    const cards = [...document.querySelectorAll('.cot-camo-card')];
    if (!cards[k]) return null;
    cards[k].click();
    return cards[k].textContent.trim();
  }, i);
  for (const [group, id] of [['modern', 'm1a2'], ['ww2', 'tiger1']]) {
    await clickChip(group);
    await new Promise((r) => setTimeout(r, 250));
    await clickCard(id);
    await waitPedestal(id);
    for (let i = 0; i < 6; i++) {
      const label = await camoIdx(i);
      if (label == null) break;
      await new Promise((r) => setTimeout(r, 1100));
      await shoot(`camo_${id}_${i}_${label.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`);
    }
  }
} catch (err) {
  console.error(`[tm-r6] FAILED: ${err.message}`);
} finally {
  if (errors.length) { console.error(`[tm-r6] console errors (${errors.length}):`); for (const e of errors.slice(0, 12)) console.error('  ' + e); }
  await browser.close();
  await server.close();
}
process.exit(0);
