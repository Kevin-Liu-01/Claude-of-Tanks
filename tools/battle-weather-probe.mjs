// Native production regression: matched precipitation on/off at a frozen real
// battlefield pose, screenshot variants, quality changes, and Garage cleanup.
// node tools/battle-weather-probe.mjs --out=/tmp/cot-weather [--gate]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { preview } from 'vite';
import puppeteer from 'puppeteer';

const out = resolve(process.argv.find(x => x.startsWith('--out='))?.slice(6) ?? '/tmp/cot-weather-probe');
mkdirSync(out, { recursive: true });
const report = { build: createHash('sha256').update(readFileSync('dist/index.html')).digest('hex'),
  cases: [], errors: [], consoleErrors: [], passed: false };
const server = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 5852, strictPort: true } });
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 360_000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', event => { if (event.type() === 'error') report.consoleErrors.push(event.text()); });
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => localStorage.setItem('cot.gfxPreset', 'high'));

async function stage(mapId, specId = 'm1a1') {
  await page.evaluate(async ({ mapId, specId }) => {
    const d = window.__DEBUG;
    d.shotMode = false;
    if (d.game.phase !== 'garage') await d.enterGarage();
    await d.beginSoloBattle({ specId, mapId, randomRoster: true });
  }, { mapId, specId });
  await page.waitForFunction('window.__DEBUG.game.preBattleS <= 0 && window.__DEBUG.game.tanks.every(x => x.visual)', { timeout: 180_000 });
  await page.evaluate(() => {
    const d = window.__DEBUG;
    d.shotMode = true;
    d.post.setAdaptiveSuspended(true);
    const p = d.game.player.state.pos;
    d.camera.position.set(p.x + 12, p.y + 7, p.z - 14);
    d.camera.lookAt(p.x, p.y + 2, p.z + 22);
    d.camera.fov = 50; d.camera.updateProjectionMatrix();
    document.getElementById('cot-perfhud').style.display = 'none';
  });
}

async function sample(seed, mapId, budget) {
  return page.evaluate(async ({ seed, mapId, budget }) => {
    const d = window.__DEBUG, renderer = d.renderer;
    await d.battleAtmosphere.prepare(seed, mapId, budget);
    d.battleAtmosphere.update(12, budget);
    const next = () => new Promise(requestAnimationFrame);
    for (let i = 0; i < 120; i++) await next();
    const samples = [];
    const render = d.post.render.bind(d.post);
    let last = 0, measured = false;
    d.post.render = (dt) => {
      const started = performance.now();
      const auto = renderer.info.autoReset;
      renderer.info.autoReset = false; renderer.info.reset();
      try { return render(dt); }
      finally {
        if (measured) samples.push({ cpuMs: performance.now() - started,
          gapMs: last ? started - last : 0, calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles });
        last = started; renderer.info.autoReset = auto;
      }
    };
    try {
      measured = true;
      // Ten seconds per arm reduces scheduler/driver outliers; preserve both
      // bracketing controls and the same unrelaxed incremental cost limits.
      for (let i = 0; i < 600; i++) {
        d.battleAtmosphere.update(12 + i / 60, budget);
        await next();
      }
    } finally { d.post.render = render; }
    const percentile = (key, fraction) => {
      const values = samples.slice(1).map(x => x[key]).sort((a, b) => a - b);
      return values[Math.floor((values.length - 1) * fraction)];
    };
    const mesh = d.scene.getObjectByName('battle-precipitation');
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { weather: d.battleAtmosphere.current.weather, budget, samples: samples.length,
      medianMs: percentile('gapMs', .5), p95Ms: percentile('gapMs', .95),
      cpuP95Ms: percentile('cpuMs', .95), calls: percentile('calls', .5),
      triangles: percentile('triangles', .5), instances: mesh?.geometry.instanceCount ?? 0,
      programs: renderer.info.programs.length, textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries, glError: gl.getError(),
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      size: [renderer.domElement.width, renderer.domElement.height] };
  }, { seed, mapId, budget });
}

async function equipmentPictures() {
  await stage('verdant', 'leo2a6');
  await page.evaluate(async () => {
    const d = window.__DEBUG;
    await d.battleAtmosphere.prepare(1, 'verdant', 0);
    const turret = d.game.player.visual.root.getObjectByName('rig_turret');
    const target = d.camera.position.clone().set(.26, .405, -2.485);
    turret.localToWorld(target);
    d.camera.position.copy(target).add(d.camera.position.clone().set(.65, .8, -1.35));
    d.camera.lookAt(target); d.camera.fov = 42; d.camera.updateProjectionMatrix();
  });
  const settle = () => page.evaluate(async () => {
    for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame);
  });
  await settle();
  await page.screenshot({ path: resolve(out, 'equipment-before.png') });
  const result = await page.evaluate(() => {
    const visual = window.__DEBUG.game.player.visual;
    const event = { impactFrame: 'turret', impactLocalPos: [.26, .405, -2.463],
      impactLocalNormal: [0, 0, -1], caliberMm: 120, kind: 'nonpen' };
    return { applied: visual.applyEquipmentDamage(event), duplicate: visual.applyEquipmentDamage(event) };
  });
  assert.deepEqual(result, { applied: true, duplicate: false });
  await settle();
  await page.screenshot({ path: resolve(out, 'equipment-after.png') });
  await page.evaluate(() => window.__DEBUG.game.player.visual.resetDestroyed());
  await settle();
  await page.screenshot({ path: resolve(out, 'equipment-reset.png') });
  return result;
}

try {
  await page.goto('http://127.0.0.1:5852/?debug=1', { waitUntil: 'domcontentloaded', timeout: 360_000 });
  await page.waitForFunction('window.__GAME_READY && window.__DEBUG?.battleAtmosphere', { timeout: 360_000 });
  for (const [mapId, seed, label] of [['verdant', 24, 'rain'], ['winter', 13, 'snow'], ['winter', 3, 'night-snow']]) {
    await stage(mapId);
    const off = await sample(seed, mapId, 0);
    const on = await sample(seed, mapId, 768);
    await page.screenshot({ path: resolve(out, `${label}.png`) });
    const offAgain = await sample(seed, mapId, 0);
    const baselineP95 = Math.max(off.p95Ms, offAgain.p95Ms);
    const checks = {
      native: !/swiftshader|software/i.test(on.gpu),
      precipitation: on.instances > 0 && (on.weather.condition === 'rain' || on.weather.condition === 'snow'),
      enoughFrames: Math.min(off.samples, on.samples, offAgain.samples) >= 450,
      errors: on.glError === 0 && off.glError === 0 && offAgain.glError === 0,
      calls: on.calls - offAgain.calls <= 1,
      primitives: on.triangles - offAgain.triangles <= 1536,
      textures: on.textures === offAgain.textures,
      frameCost: on.p95Ms <= baselineP95 + 2,
      cpuCost: on.cpuP95Ms <= Math.max(off.cpuP95Ms, offAgain.cpuP95Ms) + 1,
    };
    report.cases.push({ label, off, on, offAgain, checks });
  }
  report.equipment = await equipmentPictures();
  report.garage = await page.evaluate(async () => {
    const d = window.__DEBUG;
    d.shotMode = false; await d.enterGarage();
    return { phase: d.game.phase, weather: d.battleAtmosphere.current.weather,
      attached: !!d.scene.getObjectByName('battle-precipitation') };
  });
  assert.deepEqual(report.garage, { phase: 'garage', weather: null, attached: false });
  report.passed = report.cases.every(c => Object.values(c.checks).every(Boolean))
    && report.errors.length === 0 && report.consoleErrors.length === 0;
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  writeFileSync(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report));
if (process.argv.includes('--gate') && !report.passed) process.exitCode = 1;
