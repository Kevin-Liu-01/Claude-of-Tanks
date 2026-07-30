// Garage showroom regression gate: fitted framing, stage-only drag, wheel
// zoom, deterministic shot reset, and battle hand-off.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const failures = [];
let checks = 0;
const check = (name, ok, detail = '') => {
  checks++;
  if (ok) console.log(`  PASS ${name}${detail ? ` (${detail})` : ''}`);
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.error(`  FAIL ${name}${detail ? ` (${detail})` : ''}`); }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 5700 + Math.floor(Math.random() * 400), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const url = `http://localhost:${server.config.server.port}/?nosplash`;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) pageErrors.push(m.text()); });

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 90000 });
  await sleep(1400);

  const initial = await page.evaluate(() => {
    const D = window.__DEBUG;
    const s = D.showroom.debugState();
    const projected = (s.corners || []).map((v) => {
      const p = new D.camera.position.constructor(v[0], v[1], v[2]).project(D.camera);
      return [p.x, p.y];
    });
    return { s, projected, phase: D.game.phase };
  });
  check('boots in garage', initial.phase === 'garage', `phase=${initial.phase}`);
  check('showroom owns camera', initial.s.active && initial.s.running);
  check('vehicle bounds measured', !!initial.s.box && initial.projected.length === 8);
  const xs = initial.projected.map((p) => p[0]);
  const ys = initial.projected.map((p) => p[1]);
  const st = initial.s.stage;
  const fitted = Math.min(...xs) >= st.cx - st.hx - 0.04 && Math.max(...xs) <= st.cx + st.hx + 0.04 &&
    Math.min(...ys) >= st.cy - st.hy - 0.04 && Math.max(...ys) <= st.cy + st.hy + 0.04;
  check('complete silhouette fits UI-free stage', fitted,
    `x=${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)} y=${Math.min(...ys).toFixed(2)}..${Math.max(...ys).toFixed(2)}`);

  // A drag over the stats card must remain UI interaction, never camera input.
  const statsPoint = await page.evaluate(() => {
    const r = document.querySelector('.cot-garage .stats').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 30 };
  });
  await page.mouse.move(statsPoint.x, statsPoint.y);
  await page.mouse.down();
  await page.mouse.move(statsPoint.x - 140, statsPoint.y + 40, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
  const uiYaw = (await page.evaluate(() => window.__DEBUG.showroom.debugState())).yawDeg;
  check('UI drag does not orbit', Math.abs(uiYaw - initial.s.yawDeg) < 0.4,
    `${initial.s.yawDeg.toFixed(2)}° -> ${uiYaw.toFixed(2)}°`);

  const stagePoint = {
    x: (st.cx + 1) * 1440 / 2,
    y: (1 - st.cy) * 900 / 2,
  };
  await page.mouse.move(stagePoint.x, stagePoint.y);
  await page.mouse.down();
  await page.mouse.move(stagePoint.x + 180, stagePoint.y - 35, { steps: 12 });
  await page.mouse.up();
  await sleep(500);
  const dragged = await page.evaluate(() => window.__DEBUG.showroom.debugState());
  check('3D-stage drag orbits', Math.abs(dragged.yawDeg - initial.s.yawDeg) > 5,
    `${initial.s.yawDeg.toFixed(2)}° -> ${dragged.yawDeg.toFixed(2)}°`);
  check('orbit remains inside clamps', Math.abs(dragged.yawDeg - dragged.heroYawDeg) <= dragged.yawClampDeg + 0.2 &&
    dragged.pitchDeg >= dragged.pitchMinDeg - 0.2 && dragged.pitchDeg <= dragged.pitchMaxDeg + 0.2);

  await page.mouse.move(stagePoint.x, stagePoint.y);
  await page.mouse.wheel({ deltaY: -120 });
  await sleep(400);
  const zoomed = await page.evaluate(() => window.__DEBUG.showroom.debugState());
  check('stage wheel zooms', zoomed.zoom < dragged.zoom - 0.02,
    `${dragged.zoom.toFixed(3)} -> ${zoomed.zoom.toFixed(3)}`);

  await page.evaluate(() => window.__SHOTS.set('garage'));
  await sleep(250);
  const reset = await page.evaluate(() => window.__DEBUG.showroom.debugState());
  check('shot recipe resets orbit deterministically',
    Math.abs(reset.yawDeg - reset.heroYawDeg) < 0.05 && Math.abs(reset.pitchDeg - reset.heroPitchDeg) < 0.05 && Math.abs(reset.zoom - 1) < 0.01);

  // startBattle uses this same stop seam before the battle rig takes over;
  // exercise it without paying the deferred world-build cost in this focused
  // camera gate (controls-probe owns real BATTLE entry).
  await page.evaluate(() => window.__DEBUG.showroom.stop());
  const handed = await page.evaluate(() => ({
    active: window.__DEBUG.showroom.active,
  }));
  check('showroom releases camera ownership', !handed.active, `showroom=${handed.active}`);
  check('no browser errors', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\ngarage-camera-probe: ${failures.length}/${checks} failed`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\ngarage-camera-probe: all ${checks} checks passed`);
