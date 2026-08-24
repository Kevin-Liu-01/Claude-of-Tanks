#!/usr/bin/env node
// Live firing-pipeline gate for IFV recoil scaling. Verifies that a rapid
// autocannon round carries the shared 0.36 scale through gun animation,
// camera pitch/trauma and FOV punch, while an IFV ATGM and an MBT retain 1.0.
//
// §5.362 update: gun travel is measured by PINNING the shared fx clock at
// the shot and stepping exact stroke ages (the r5 stepped-capture ritual) —
// the old single 35 ms wall sample raced the clock leap after the
// synchronous fastForward block, and the new rapid belt stroke (5.5-7.7 cm,
// complete inside the belt cycle) is gone before any wall-clock sample.
// Asserts the §5.362 throw table: belt 5.5-7.7 cm rapid shudder, ATGM/MBT
// cannon recuperate (>= 6 cm floor / ~13 cm at 120 mm).

import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const SCALE = 0.36;
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
    const setup = await page.evaluate(async ({ specId, shellSlot }) => {
      const D = window.__DEBUG;
      await D.startBattle(specId);
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
      // §5.362: fire and PIN in the same synchronous block, then step the
      // shared clock to exact stroke ages — deterministic stroke receipts.
      const { fxNow } = await import('/src/fx/clock.js');
      D.flags.forceFire = true;
      for (let i = 0; i < 20 && !R.log.some((x) => x.tag === 'fired'); i++) {
        D.fastForward(0.05);
      }
      D.flags.forceFire = false;
      if (!R.log.some((x) => x.tag === 'fired')) return { ok: false, log: R.log.slice() };
      const g = p.visual.root.getObjectByName('rig_recoil');
      const t0 = fxNow();
      D.fx.setFrozen(true, t0);
      const stroke = [];
      for (const age of [0.02, 0.04, 0.06, 0.10, 0.14, 0.20, 0.30, 0.45, 0.65, 0.90, 1.10]) {
        D.fx.setFrozen(true, t0 + age);
        p.visual.syncFromState(p.state, 0);
        stroke.push({ age, z: g ? +g.position.z.toFixed(4) : null });
      }
      D.fx.setFrozen(false);
      return { ok: true, log: R.log.slice(), stroke };
    }, { specId, shellSlot });
    if (!setup.ok) throw new Error(`${specId} slot ${shellSlot} did not fire: ${setup.reason || JSON.stringify(setup.log)}`);
    const peak = Math.max(...setup.stroke.map((s) => Math.abs(s.z)));
    const settled = Math.abs(setup.stroke[setup.stroke.length - 1].z);
    const at = (age) => Math.abs(setup.stroke.find((s) => s.age === age).z);
    return { log: setup.log, stroke: setup.stroke, peak, settled, at };
  }

  const rapid = await fireCase('m2a2_bradley', 0);
  await sleep(900);
  const missile = await fireCase('m2a2_bradley', 1);
  await sleep(900);
  const mbt = await fireCase('m1a2', 0);

  const entry = (run, tag) => run.log.find((x) => x.tag === tag);
  console.log('[ifv-recoil] strokes', JSON.stringify({
    rapid: rapid.stroke, missile: missile.stroke, mbt: mbt.stroke,
  }));
  near(entry(rapid, 'visual').args[1], SCALE, 1e-9, 'IFV visual scale');
  near(entry(rapid, 'trauma').args[0], 0.10 * SCALE, 1e-9, 'IFV trauma');
  near(entry(rapid, 'camera').args[0], 0.006 * SCALE, 1e-9, 'IFV camera pitch');
  near(entry(rapid, 'camera').args[1], SCALE, 1e-9, 'IFV FOV scale');

  near(entry(missile, 'visual').args[1], 1, 1e-9, 'ATGM visual scale');
  near(entry(missile, 'camera').args[1], 1, 1e-9, 'ATGM FOV scale');
  near(entry(mbt, 'visual').args[1], 1, 1e-9, 'MBT visual scale');
  near(entry(mbt, 'camera').args[1], 1, 1e-9, 'MBT FOV scale');
  // §5.362 throw-table contract: belt rounds play the rapid 5.5-7.7 cm shudder
  // (final amplitude — the 0.36 scale governs hull/camera only) that
  // COMPLETES inside the belt cycle; the same vehicle's missile rail plays
  // the cannon-class recuperate (>= 6 cm floor), and a 120 mm MBT throws
  // ~13 cm. The old 3x single-sample ratio encoded the pre-§5.362 0.55 m
  // amplitudes.
  if (!(rapid.peak >= 0.05 && rapid.peak <= 0.08)) {
    throw new Error(`belt peak outside the rapid 5.5-7.7 cm class: ${rapid.peak}`);
  }
  if (!(rapid.at(0.45) < 0.004)) {
    throw new Error(`belt stroke still out of battery at 0.45 s: ${rapid.at(0.45)}`);
  }
  if (!(missile.peak >= 0.045 && missile.peak <= 0.09)) {
    throw new Error(`ATGM peak outside the cannon-class floor band: ${missile.peak}`);
  }
  if (!(missile.at(0.30) > 0.01)) {
    throw new Error(`ATGM recuperate return missing (battery too early): ${missile.at(0.30)}`);
  }
  if (!(mbt.peak >= 0.10 && mbt.peak <= 0.15)) {
    throw new Error(`120 mm MBT peak outside the class band: ${mbt.peak}`);
  }
  // The presentation-forward belt throw may approach the 30 mm gun's 6 cm
  // cannon-class floor; its identity is the much faster return, while the
  // missile/cannon stroke remains out of battery at 0.30 s.
  if (rapid.peak > missile.peak + 0.005) {
    throw new Error(`belt throw exceeds the missile/cannon stroke: IFV ${rapid.peak}, ATGM ${missile.peak}`);
  }
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);

  const brief = (r) => ({ peak: r.peak, settled: r.settled, stroke: r.stroke });
  console.log('[ifv-recoil] measurements', JSON.stringify({
    rapid: brief(rapid), missile: brief(missile), mbt: brief(mbt),
  }));
  console.log('[ifv-recoil] GREEN');
} finally {
  if (browser) await browser.close().catch(() => {});
  await server.close().catch(() => {});
}
