// Regression probe for the owner-reported dual-reticle mismatch.
//
// It parks the physical barrel 1.25 degrees off the requested aim point —
// inside the server-aim correction window used by the firing pipeline — then
// verifies that the visible gun marker and the zero-dispersion shell center
// resolve to the same screen position. The old HUD followed the raw bore while
// firing silently snapped to the requested point, producing a tens-of-pixels lie.
//
// Usage: node tools/reticle-shot-parity-probe.mjs [--screenshot /tmp/reticle.png]
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const screenshotAt = args.indexOf('--screenshot');
const screenshotPath = screenshotAt >= 0 ? args[screenshotAt + 1] : '';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: {
    port: 7600 + Math.floor(Math.random() * 300),
    strictPort: false,
    hmr: false,
    watch: null,
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
let failed = false;
try {
  await server.listen();
  const url = `http://localhost:${server.config.server.port}/?nosplash`;
  console.log(`[reticle-shot-parity] target ${url}`);
  browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 360000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      pageErrors.push(message.text());
    }
  });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('cot.settings.v1', JSON.stringify({ aiDifficulty: 'easy' }));
    } catch (_) { /* private mode */ }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 180000 });

  await page.evaluate(() => window.__DEBUG.startBattle('m1a2'));
  await sleep(500);
  const target = await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const V = Object.getPrototypeOf(D.camera.position).constructor;
    const muzzle = new V();
    const dir = new V();
    D.fastForward(2);
    p.visual.gunMuzzleWorld(muzzle);
    let picked = null;
    // Find a long, static terrain lay so a 1.25 degree disagreement is large
    // on screen and no moving target or sticky-armor hysteresis contaminates
    // the comparison.
    for (const yawOff of [0, -20, 20, -40, 40, -60, 60, 90, -90]) {
      for (const pitchDeg of [-0.5, -1, -2, -3, -5, -8, -12]) {
        const yaw = p.state.yaw + yawOff * Math.PI / 180;
        const pitch = pitchDeg * Math.PI / 180;
        dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        const hit = D.world.raycast(muzzle, dir, 800);
        if (!hit || hit.dist < 140) continue;
        if (!picked || hit.dist > picked.dist) picked = { point: hit.point.clone(), dist: hit.dist };
      }
    }
    if (!picked) throw new Error('no long terrain lay for reticle parity setup');
    p.input.aimPoint.copy(picked.point);
    D.fastForward(4); // settle the articulated gun onto the chosen static lay

    p.visual.gunMuzzleWorld(muzzle);
    dir.copy(picked.point).sub(muzzle).normalize();
    // Pause owns the next frames, so neither the sim nor the rig can rewrite
    // the controlled aim pose while the HUD samples it.
    D.settings.open();
    const settingsRoot = document.querySelector('.cot-settings');
    if (settingsRoot) settingsRoot.style.visibility = 'hidden';
    D.camera.position.copy(muzzle).addScaledVector(dir, -1.2);
    D.camera.position.y += 0.25;
    D.camera.lookAt(picked.point);
    D.camera.updateMatrixWorld(true);
    D.camera.updateProjectionMatrix();
    D.rig.aimPoint.copy(picked.point);
    D.rig.aimDist = D.camera.position.distanceTo(picked.point);
    p.input.aimPoint.copy(picked.point);
    return { distM: picked.dist };
  });
  await sleep(350);

  // Freeze the simulation but keep the camera/HUD render loop live. Skewing
  // state (instead of an arbitrary mesh) keeps this an honest articulated-gun
  // pose and lets computeAimInfo read exactly what a player sees.
  await page.evaluate(() => {
    const D = window.__DEBUG;
    const p = D.game.player;
    D.game.preBattleS = Infinity;
    p.state.turretYaw += 1.25 * Math.PI / 180;
    p.state.atGunLimit = false;
    p.state.gunLimitSpec = false;
    p.visual.syncFromState(p.state);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(
    () => requestAnimationFrame(resolve))));

  if (screenshotPath) await page.screenshot({ path: screenshotPath });

  const report = await page.evaluate(async () => {
    const D = window.__DEBUG;
    const p = D.game.player;
    const V = Object.getPrototypeOf(D.camera.position).constructor;
    const muzzle = new V();
    const bore = new V();
    const aimDir = new V();
    p.visual.gunMuzzleWorld(muzzle);
    p.visual.gunDirWorld(bore).normalize();
    aimDir.copy(p.input.aimPoint).sub(muzzle).normalize();
    const rawBoreErrorDeg = bore.angleTo(aimDir) * 180 / Math.PI;

    // Snapshot marker + camera before firing. Recoil affects presentation
    // after the shell event and must not move the sampled pre-shot truth.
    const marker = D.frameInfo.aim.gunMarker.clone();
    const desired = D.frameInfo.aim.point.clone();
    const camera = D.camera.clone();
    camera.position.copy(D.camera.position);
    camera.quaternion.copy(D.camera.quaternion);
    camera.scale.copy(D.camera.scale);
    camera.projectionMatrix.copy(D.camera.projectionMatrix);
    camera.projectionMatrixInverse.copy(D.camera.projectionMatrixInverse);
    camera.matrixWorld.copy(D.camera.matrixWorld);
    camera.matrixWorldInverse.copy(D.camera.matrixWorldInverse);
    const hud = window.__HUD_DEBUG.getReticleState();

    // Falsification: push the bore outside the correction window. The marker
    // must separate again and remain collinear with the real articulated bore
    // instead of being permanently glued to the camera marker.
    const insideTurretYaw = p.state.turretYaw;
    p.state.turretYaw = insideTurretYaw + 2 * Math.PI / 180;
    p.visual.syncFromState(p.state);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const outsideMuzzle = new V();
    const outsideBore = new V();
    p.visual.gunMuzzleWorld(outsideMuzzle);
    p.visual.gunDirWorld(outsideBore).normalize();
    const outsideAimDir = p.input.aimPoint.clone().sub(outsideMuzzle).normalize();
    const outsideMarkerDir = D.frameInfo.aim.gunMarker.clone().sub(outsideMuzzle).normalize();
    const outside = {
      boreErrorDeg: outsideBore.angleTo(outsideAimDir) * 180 / Math.PI,
      markerToBoreDeg: outsideMarkerDir.angleTo(outsideBore) * 180 / Math.PI,
      hudGunOffsetPx: window.__HUD_DEBUG.getReticleState().gunOffsetPx,
    };
    p.state.turretYaw = insideTurretYaw;
    p.visual.syncFromState(p.state);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    let fired = null;
    const off = D.bus.on('shell:fired', (event) => {
      if (!event.isPlayer) return;
      fired = {
        muzzle: [...event.muzzlePos],
        dir: [...event.dir],
        velocityMps: event.velocityMps,
      };
    });
    // rng=1 makes Box-Muller radius zero, isolating the reticle CENTER from
    // the already-tested dispersion envelope.
    D.game.combatRng = () => 1;
    p.combat.reload.t = 0;
    D.flags.forceFire = true;
    D.game.preBattleS = 0;
    D.fastForward(1 / 60);
    D.flags.forceFire = false;
    off();
    if (!fired) throw new Error('controlled player shot did not fire');

    const fm = new V(...fired.muzzle);
    const fd = new V(...fired.dir);
    const g = 9.81 * 2.2;
    const at = (t, out = new V()) => out
      .copy(fm)
      .addScaledVector(fd, fired.velocityMps * t)
      .addScaledVector(new V(0, -1, 0), 0.5 * g * t * t);
    // Find the trajectory point nearest the requested server aim. This is
    // the actual zero-dispersion shot center at the aimed range.
    const flightGuess = fm.distanceTo(desired) / fired.velocityMps;
    let lo = 0;
    let hi = Math.max(0.25, flightGuess * 1.8);
    const a = new V();
    const b = new V();
    for (let i = 0; i < 90; i++) {
      const t1 = lo + (hi - lo) / 3;
      const t2 = hi - (hi - lo) / 3;
      const d1 = at(t1, a).distanceToSquared(desired);
      const d2 = at(t2, b).distanceToSquared(desired);
      if (d1 < d2) hi = t2;
      else lo = t1;
    }
    const shotCenter = at((lo + hi) * 0.5);
    const markerNdc = marker.clone().project(camera);
    const shotNdc = shotCenter.clone().project(camera);
    const desiredNdc = desired.clone().project(camera);
    const ndcToPx = (q) => ({ x: (q.x + 1) * 800, y: (1 - q.y) * 450 });
    const mp = ndcToPx(markerNdc);
    const sp = ndcToPx(shotNdc);
    const dp = ndcToPx(desiredNdc);
    return {
      aimDistM: fm.distanceTo(desired),
      targetId: D.frameInfo.aim.gunTargetId,
      rawBoreErrorDeg,
      shotNearDesiredM: shotCenter.distanceTo(desired),
      markerToShotPx: Math.hypot(mp.x - sp.x, mp.y - sp.y),
      markerToDesiredPx: Math.hypot(mp.x - dp.x, mp.y - dp.y),
      hudGunOffsetPx: hud.gunOffsetPx,
      atGunLimit: hud.atGunLimit,
      markerPx: mp,
      shotPx: sp,
      desiredPx: dp,
      outside,
    };
  });

  const checks = [
    ['fixture is inside the 2 degree correction window', report.rawBoreErrorDeg > 0.35 && report.rawBoreErrorDeg < 1.95],
    ['zero-dispersion shell center reaches requested aim', report.shotNearDesiredM < 1.5],
    ['visible gun marker matches actual shot center', report.markerToShotPx <= 3],
    ['visible gun marker converges with desired marker when the shot does', report.markerToDesiredPx <= 3],
    ['outside the correction window the gun marker separates', report.outside.boreErrorDeg > 2 && report.outside.hudGunOffsetPx > 8],
    ['outside the correction window the gun marker stays on the bore', report.outside.markerToBoreDeg < 0.01],
    ['runtime had no page errors', pageErrors.length === 0],
  ];
  console.log(`[reticle-shot-parity] terrain=${target.distM.toFixed(1)}m report=${JSON.stringify(report)}`);
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name}`);
    if (!pass) failed = true;
  }
  if (pageErrors.length) console.error(pageErrors.join('\n'));
} catch (error) {
  failed = true;
  console.error(error && error.stack ? error.stack : error);
} finally {
  if (browser) await browser.close();
  await server.close();
}

process.exit(failed ? 1 : 0);
