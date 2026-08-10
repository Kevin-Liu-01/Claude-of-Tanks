#!/usr/bin/env node
// Live firing-pipeline gate for IFV recoil scaling. Verifies that a rapid
// autocannon round carries the shared 0.18 scale through gun animation,
// camera pitch/trauma and FOV punch, while an IFV ATGM and an MBT retain 1.0.

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const SCALE = 0.18;
const near = (a, b, eps, label) => {
  if (!Number.isFinite(a) || Math.abs(a - b) > eps) {
    throw new Error(`${label}: expected ${b} ±${eps}, got ${a}`);
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: {
    port: 7990 + Math.floor(Math.random() * 80), strictPort: false,
    hmr: false, watch: { ignored: ['**/*'] },
  },
  optimizeDeps: {
    entries: ['index.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});

let browser;
const errors = [];
try {
  await server.listen();
  const url = `http://localhost:${server.config.server.port}/`;
  console.log(`[ifv-recoil] vite up at ${url}`);
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 120000 });

  await page.evaluate(() => {
    const D = window.__DEBUG;
    window.__IFV_RECOIL = { log: [], visuals: new WeakSet() };
    const R = window.__IFV_RECOIL;
    const wrap = (obj, name, tag) => {
      const original = obj[name].bind(obj);
      obj[name] = (...args) => {
        R.log.push({ tag, args: args.map((x) => typeof x === 'number' ? x : null) });
        return original(...args);
      };
    };
    wrap(D.rig, 'addTrauma', 'trauma');
    wrap(D.rig, 'recoilKick', 'camera');
    D.bus.on('shell:fired', (e) => {
      if (e.isPlayer) R.log.push({ tag: 'fired', caliberMm: e.caliberMm });
    });
  });

  async function fireCase(specId, shellSlot) {
    const setup = await page.evaluate(({ specId, shellSlot }) => {
      const D = window.__DEBUG;
      D.startBattle(specId);
      D.game.preBattleS = 0;
      D.flags.forceFire = false;
      const p = D.game.player;
      const R = window.__IFV_RECOIL;
      R.log.length = 0;
      if (!R.visuals.has(p.visual)) {
        R.visuals.add(p.visual);
        const original = p.visual.recoilKick.bind(p.visual);
        p.visual.recoilKick = (...args) => {
          R.log.push({ tag: 'visual', args: args.map((x) => typeof x === 'number' ? x : null) });
          return original(...args);
        };
      }
      p.input.shellSlot = shellSlot;
      p.combat.shellSlot = shellSlot;
      p.combat.reload.t = 0;
      p.input.fire = false;
      let target = D.aimAtNearest();
      for (let i = 0; i < 10 && !target; i++) {
        D.fastForward(0.25);
        target = D.aimAtNearest();
      }
      if (!target) return { ok: false, reason: 'no target' };
      D.flags.forceFire = true;
      for (let i = 0; i < 20 && !R.log.some((x) => x.tag === 'fired'); i++) {
        D.fastForward(0.05);
      }
      D.flags.forceFire = false;
      return { ok: R.log.some((x) => x.tag === 'fired'), log: R.log.slice() };
    }, { specId, shellSlot });
    if (!setup.ok) throw new Error(`${specId} slot ${shellSlot} did not fire: ${setup.reason || JSON.stringify(setup.log)}`);
    await sleep(35);
    const recoilZ = await page.evaluate(() => {
      const root = window.__DEBUG.game.player.visual.root;
      const group = root.getObjectByName('rig_recoil');
      return group ? group.position.z : null;
    });
    return { log: setup.log, recoilZ };
  }

  const rapid = await fireCase('m2a2_bradley', 0);
  await sleep(900);
  const missile = await fireCase('m2a2_bradley', 1);
  await sleep(900);
  const mbt = await fireCase('m1a2', 0);

  const entry = (run, tag) => run.log.find((x) => x.tag === tag);
  near(entry(rapid, 'visual').args[1], SCALE, 1e-9, 'IFV visual scale');
  near(entry(rapid, 'trauma').args[0], 0.10 * SCALE, 1e-9, 'IFV trauma');
  near(entry(rapid, 'camera').args[0], 0.006 * SCALE, 1e-9, 'IFV camera pitch');
  near(entry(rapid, 'camera').args[1], SCALE, 1e-9, 'IFV FOV scale');

  near(entry(missile, 'visual').args[1], 1, 1e-9, 'ATGM visual scale');
  near(entry(missile, 'camera').args[1], 1, 1e-9, 'ATGM FOV scale');
  near(entry(mbt, 'visual').args[1], 1, 1e-9, 'MBT visual scale');
  near(entry(mbt, 'camera').args[1], 1, 1e-9, 'MBT FOV scale');
  if (!(Math.abs(missile.recoilZ) > Math.abs(rapid.recoilZ) * 3)) {
    throw new Error(`gun travel not materially reduced: IFV ${rapid.recoilZ}, ATGM ${missile.recoilZ}`);
  }
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

  console.log('[ifv-recoil] measurements', JSON.stringify({ rapid, missile, mbt }));
  console.log('[ifv-recoil] GREEN');
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
