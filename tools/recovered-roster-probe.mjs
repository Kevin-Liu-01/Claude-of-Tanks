// Visual smoke gate for every tank added from the recovered owner drops.
// Selects each vehicle on the live garage pedestal, waits for its selected
// scored visual (GLB or articulated family fallback), and rejects invisible,
// non-finite, or wildly mis-scaled geometry.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const DEFAULT_IDS = [
  'm1a2_legacy', 'abramsx',
  'challenger1', 'chieftain5', 'fv510', 'leo2_revolution', 'leo2a5',
  'leo2a7v', 'm1a1ha', 'm1a2_sepv2', 'm60a1', 'pt91m',
  'merkava1b', 'merkava2b', 'merkava2d', 'merkava3b', 'merkava3c',
  'merkava3d', 'merkava4b', 't62mv1', 't64bv1', 't72b_1987', 't72b3m',
  't72bu', 't90sm', 'type90', 't90a_vladimir',
  'is3_bergman', 'isu152', 'isu122s', 'centurion3', 'centurion5', 'comet',
  'challenger_cruiser', 'charioteer', 'leopard2_proto', 'm1a1_aim',
  'm46_patton', 'm47_patton', 'm26_pershing', 'm45_patton', 'm60a3',
];
const IDS = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_IDS;

const failures = [];
let checks = 0;
const check = (name, ok, detail = '') => {
  checks++;
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`;
  (ok ? console.log : console.error)(`  ${line}`);
  if (!ok) failures.push(line);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 6100 + Math.floor(Math.random() * 300), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
page.setDefaultTimeout(15000);

const browserErrors = [];
page.on('pageerror', (e) => browserErrors.push(String(e)));
page.on('console', (m) => {
  const msg = m.text();
  if (m.type() === 'error' && !msg.includes('favicon')) browserErrors.push(msg);
  if (msg.includes('glb swap failed')) browserErrors.push(msg);
});

try {
  await page.goto(`http://localhost:${server.config.server.port}/?nosplash`, {
    waitUntil: 'domcontentloaded', timeout: 90000,
  });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  await sleep(800);

  const roster = await page.evaluate(() => ({
    count: window.__DEBUG.tankSpecs ? Object.keys(window.__DEBUG.tankSpecs).length : null,
    phase: window.__DEBUG.game.phase,
  }));
  check('garage booted', roster.phase === 'garage', `phase=${roster.phase}`);
  const sourceById = await page.evaluate(async () => {
    const { MODEL_SOURCE } = await import('/src/vehicles/specs.js');
    return Object.fromEntries(Object.entries(MODEL_SOURCE).map(([id, row]) => [id, row?.source]));
  });

  for (const id of IDS) {
    const expectGlb = sourceById[id] === 'glb';
    const errorStart = browserErrors.length;
    await page.evaluate((tankId) => window.__DEBUG.selectGarageTank(tankId), id);
    if (expectGlb) try {
      await page.waitForFunction((tankId) => {
        const D = window.__DEBUG;
        const visual = D.pedestalVisual;
        if (!visual || visual.specId !== tankId || !visual.root.visible) return false;
        let swapped = false;
        visual.root.traverse((o) => { if (o.userData && o.userData.__glbSwapped) swapped = true; });
        return swapped;
      }, { timeout: 15000, polling: 80 }, id);
    } catch (_) {
      // The detailed measurement below supplies a useful failure report.
    } else await sleep(30);
    await sleep(80);

    const result = await page.evaluate((tankId) => {
      const visual = window.__DEBUG.pedestalVisual;
      if (!visual || visual.specId !== tankId) return { wrong: visual && visual.specId };
      visual.root.updateMatrixWorld(true);
      const Vec = window.__DEBUG.camera.position.constructor;
      const min = new Vec(Infinity, Infinity, Infinity);
      const max = new Vec(-Infinity, -Infinity, -Infinity);
      const corner = new Vec();
      let visibleMeshes = 0;
      let swapped = false;
      let proceduralVisible = 0;
      let hiddenRenderNodes = 0;

      const effectivelyVisible = (o) => {
        for (let p = o; p; p = p.parent) if (!p.visible) return false;
        return true;
      };
      visual.root.traverse((o) => {
        if (o.userData && o.userData.__glbSwapped) swapped = true;
        if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh)) return;
        if (!effectivelyVisible(o)) { hiddenRenderNodes++; return; }
        // Shadow-only helpers are intentionally larger than the tank.
        if (/shadow/i.test(o.name || '')) return;
        const geometry = o.geometry;
        if (!geometry) return;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const bb = geometry.boundingBox;
        if (!bb) return;
        visibleMeshes++;
        // All eight local AABB corners transformed into world space.
        for (let xi = 0; xi < 2; xi++) for (let yi = 0; yi < 2; yi++) for (let zi = 0; zi < 2; zi++) {
          corner.set(xi ? bb.max.x : bb.min.x, yi ? bb.max.y : bb.min.y, zi ? bb.max.z : bb.min.z);
          corner.applyMatrix4(o.matrixWorld);
          min.min(corner); max.max(corner);
        }
        // Sourced nodes live below the swap marker. Any visible render node
        // outside it after a completed swap is a leaked procedural part.
        let belowSwap = false;
        for (let p = o; p && p !== visual.root; p = p.parent) {
          if (p.userData && p.userData.__glbSwapped) { belowSwap = true; break; }
        }
        if (swapped && !belowSwap) proceduralVisible++;
      });
      const size = max.clone().sub(min);
      const horizontal = [size.x, size.z].sort((a, b) => a - b);
      return {
        swapped, visible: visual.root.visible, visibleMeshes, hiddenRenderNodes,
        proceduralVisible, size: [size.x, size.y, size.z],
        minHorizontal: horizontal[0], maxHorizontal: horizontal[1], height: size.y,
        expectedLength: visual.dims && visual.dims.lengthM,
      };
    }, id);

    if (result.wrong) {
      check(`${id}: selected`, false, `pedestal=${result.wrong}`);
      continue;
    }
    const dims = result.size?.map((v) => Number.isFinite(v) ? v.toFixed(2) : String(v)).join('x');
    check(`${id}: scored visual selected`, result.swapped === expectGlb,
      expectGlb ? 'GLB' : 'articulated fallback');
    check(`${id}: visible geometry`, result.visible && result.visibleMeshes > 0,
      `meshes=${result.visibleMeshes}, size=${dims}`);
    check(`${id}: plausible normalized scale`, Number.isFinite(result.minHorizontal) &&
      result.minHorizontal >= 0.45 && result.minHorizontal <= 8 &&
      result.maxHorizontal >= 2.2 && result.maxHorizontal <= 18 &&
      (!result.expectedLength || (result.maxHorizontal / result.expectedLength >= 0.58 &&
        result.maxHorizontal / result.expectedLength <= 1.35)) &&
      result.height >= 0.45 && result.height <= 7,
    `size=${dims}, expectedLen=${result.expectedLength?.toFixed(2) || 'n/a'}`);
    check(`${id}: no load errors`, browserErrors.length === errorStart,
      browserErrors.slice(errorStart).join(' | '));
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\nrecovered-roster-probe: ${failures.length}/${checks} failed`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`\nrecovered-roster-probe: all ${checks} checks passed across ${IDS.length} sourced tanks`);
