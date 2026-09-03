// Record the live application surfaces used by the 35-second feature promo.
//
// The compositor deliberately consumes video for every product/UI chapter.
// This capture pass records the real browser at 1920x1080 rather than turning
// screenshots into artificial camera moves.
//
// Usage:
//   npm run dev -- --host 127.0.0.1 --port 8129
//   node tools/feature-promo-capture.mjs --base http://127.0.0.1:8129
//   node tools/feature-promo-capture.mjs --battle-only --base http://127.0.0.1:8129
//   node tools/feature-promo-capture.mjs --garage-only --base http://127.0.0.1:8129


import {
  mkdirSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const args = process.argv.slice(2);
const BATTLE_ONLY = args.includes('--battle-only');
const GARAGE_ONLY = args.includes('--garage-only');
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const BASE = opt('base', 'http://127.0.0.1:8129').replace(/\/$/, '');
const OUT_DIR = resolve(ROOT, opt('out', 'shots/promo-35s/ui-video'));
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;
const consoleErrors = [];
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

mkdirSync(OUT_DIR, { recursive: true });

function normalizeContainer(path) {
  const remuxed = `${path}.remux.webm`;
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', path,
    '-map', '0:v:0', '-c', 'copy', remuxed,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    try { unlinkSync(remuxed); } catch (_) { /* no partial output */ }
    throw new Error(`could not normalize ${path}: ${result.stderr.trim()}`);
  }
  renameSync(remuxed, path);
}

async function waitForGame(page) {
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 180_000 });
  await delay(1_200);
}

async function record(page, name, durationMs, action = null) {
  const path = join(OUT_DIR, `${name}.webm`);
  console.log(`[feature-promo-capture] recording ${name}`);
  const recorder = await page.screencast({
    path,
    fps: FPS,
    quality: 16,
    overwrite: true,
  });
  const startedAt = Date.now();
  if (action) await action();
  const remaining = durationMs - (Date.now() - startedAt);
  if (remaining > 0) await delay(remaining);
  await recorder.stop();
  normalizeContainer(path);
  return path;
}

async function captureSurfaceOverlay(page, name) {
  const overlayPath = join(OUT_DIR, `${name}-overlay.png`);
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await delay(900);
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'promo-surface-isolation';
    style.textContent = [
      'html,body,#app{background:transparent!important}',
      '#app>canvas{visibility:hidden!important}',
    ].join('');
    document.head.append(style);
  });
  await page.screenshot({ path: overlayPath, omitBackground: true });
  await page.evaluate(() => document.querySelector('#promo-surface-isolation')?.remove());
  return overlayPath;
}

async function recordCanvasSurface(page, name, durationMs, action = null) {
  const path = join(OUT_DIR, `${name}.webm`);
  console.log(`[feature-promo-capture] recording ${name} from renderer canvas at ${FPS} fps`);
  const capture = page.evaluate(({ duration, fps }) => new Promise((resolveCapture, rejectCapture) => {
    const canvas = document.querySelector('#app>canvas');
    if (!canvas) {
      rejectCapture(new Error('application renderer canvas was not found'));
      return;
    }
    const mimeType = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 18_000_000,
    });
    const chunks = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener('error', (event) => rejectCapture(event.error), { once: true });
    recorder.addEventListener('stop', () => {
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      const reader = new FileReader();
      reader.addEventListener('load', () => resolveCapture({
        base64: String(reader.result).split(',')[1],
        size: blob.size,
      }), { once: true });
      reader.addEventListener('error', () => rejectCapture(reader.error), { once: true });
      reader.readAsDataURL(blob);
    }, { once: true });
    recorder.start(250);
    setTimeout(() => recorder.stop(), duration);
  }), { duration: durationMs, fps: FPS });

  if (action) await action();
  const result = await capture;
  const bytes = Buffer.from(result.base64, 'base64');
  if (bytes.length !== result.size) {
    throw new Error(`${name}: browser reported ${result.size} bytes, transferred ${bytes.length}`);
  }
  writeFileSync(path, bytes);
  normalizeContainer(path);
  const overlayPath = await captureSurfaceOverlay(page, name);
  return { path, overlayPath };
}

async function recordStudioCanvas(page, name) {
  const path = join(OUT_DIR, `${name}.webm`);
  console.log(`[feature-promo-capture] recording ${name} through Studio at ${FPS} fps`);
  const result = await page.evaluate(async ({ fps }) => {
    const recording = await window.__STUDIO.recordVideo({
      fps,
      videoBitsPerSecond: 18_000_000,
      download: false,
    });
    const base64 = await new Promise((resolveData, rejectData) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolveData(String(reader.result).split(',')[1]), { once: true });
      reader.addEventListener('error', () => rejectData(reader.error), { once: true });
      reader.readAsDataURL(recording.blob);
    });
    return { base64, size: recording.size, durationMs: recording.durationMs };
  }, { fps: FPS });
  const bytes = Buffer.from(result.base64, 'base64');
  if (bytes.length !== result.size || bytes.length < 20_000) {
    throw new Error(`${name}: invalid Studio transfer ${bytes.length}/${result.size}`);
  }
  writeFileSync(path, bytes);
  normalizeContainer(path);
  // Match the original Studio promo composition: the 9.6 s ammunition-rack
  // beat exposes the dense rail, FX, and camera-cue timeline in the UI layer.
  await page.evaluate(() => window.__STUDIO.seek(9600));
  const overlayPath = await captureSurfaceOverlay(page, name);
  return { path, overlayPath, durationMs: result.durationMs };
}

async function recordBattleCanvas(page, name, durationMs, action = null) {
  const path = join(OUT_DIR, `${name}.webm`);
  const reticlePath = join(OUT_DIR, `${name}-reticle.webm`);
  const hudPath = join(OUT_DIR, `${name}-hud.png`);
  console.log(`[feature-promo-capture] recording ${name} world + live reticle at ${FPS} fps`);

  // Freeze the DOM chrome at the real pre-shot state. Capturing this after
  // the take would leak the final score and penetration card backward into
  // the arcade and scope-entry frames.
  const captureViewport = page.viewport();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await delay(120);
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'promo-hud-isolation';
    style.textContent = [
      'html,body{background:transparent!important}',
      '#app>canvas{visibility:hidden!important}',
      '.cot-ret{visibility:hidden!important}',
      '.cot-prebattle{display:none!important}',
    ].join('');
    document.head.append(style);
  });
  await page.screenshot({ path: hudPath, omitBackground: true });
  await page.evaluate(() => document.querySelector('#promo-hud-isolation')?.remove());
  await page.setViewport(captureViewport);
  await delay(120);

  const capture = page.evaluate(({ duration, fps }) => {
    const recordLayer = (selector, videoBitsPerSecond) =>
      new Promise((resolveCapture, rejectCapture) => {
        const canvas = document.querySelector(selector);
        if (!canvas) {
          rejectCapture(new Error(`battle canvas was not found: ${selector}`));
          return;
        }
        const mimeType = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
        const stream = canvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
        const chunks = [];
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data?.size) chunks.push(event.data);
        });
        recorder.addEventListener('error', (event) => rejectCapture(event.error), { once: true });
        recorder.addEventListener('stop', () => {
          const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
          const reader = new FileReader();
          reader.addEventListener('load', () => resolveCapture({
            base64: String(reader.result).split(',')[1],
            size: blob.size,
            mimeType: blob.type,
          }), { once: true });
          reader.addEventListener('error', () => rejectCapture(reader.error), { once: true });
          reader.readAsDataURL(blob);
        }, { once: true });
        recorder.start(250);
        setTimeout(() => recorder.stop(), duration);
      });
    return Promise.all([
      recordLayer('#app>canvas', 18_000_000),
      recordLayer('.cot-ret', 6_000_000),
    ]).then(([world, reticle]) => ({ world, reticle }));
  }, { duration: durationMs, fps: FPS });

  if (action) await action();
  const result = await capture;
  const worldBytes = Buffer.from(result.world.base64, 'base64');
  const reticleBytes = Buffer.from(result.reticle.base64, 'base64');
  if (worldBytes.length !== result.world.size || reticleBytes.length !== result.reticle.size) {
    throw new Error(
      `${name}: invalid layer transfer world ${worldBytes.length}/${result.world.size}, ` +
      `reticle ${reticleBytes.length}/${result.reticle.size}`,
    );
  }
  writeFileSync(path, worldBytes);
  writeFileSync(reticlePath, reticleBytes);
  normalizeContainer(path);
  normalizeContainer(reticlePath);

  return { path, reticlePath, hudPath };
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--use-gl=angle',
    '--enable-webgl',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      const source = message.location().url;
      consoleErrors.push(source ? `${message.text()} (${source})` : message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  // Garage: canvas-first capture keeps the front-right hero orbit smooth while
  // a separately captured DOM layer preserves the real roster and controls.
  await goto(page, '/?nogate=1');
  await waitForGame(page);
  await page.evaluate(() => window.__DEBUG?.selectGarageTank?.('m1a2_sepv2'));
  await delay(1_000);
  await page.setViewport({ width: 800, height: 450, deviceScaleFactor: 1 });
  await delay(900);
  if (!BATTLE_ONLY) {
    // The interactive garage normally centers its hero in the UI-free stage
    // between the side panels. The opening lockup is centered on the entire
    // frame, so temporarily give the showroom that same full-screen stage.
    await page.evaluate(() => {
      const D = window.__DEBUG;
      if (!window.__PROMO_GARAGE_STAGE_RECT) {
        window.__PROMO_GARAGE_STAGE_RECT = D.garage.getStageRect;
      }
      D.garage.getStageRect = () => ({
        x: 0, y: 0, w: window.innerWidth, h: window.innerHeight,
      });
      D.showroom.reset();
    });
    await delay(250);
    await recordCanvasSurface(page, 'garage', 4_200, async () => {
    // Stay within the front-right quadrant and continue moving through the
    // end of capture. The modest arc reveals glacis, turret face, and gun.
    await page.mouse.move(360, 202);
    await page.mouse.down();
    for (let step = 1; step <= 82; step += 1) {
      await page.mouse.move(360 + step * 1.05, 202 + Math.sin(step / 13) * 4);
      await delay(50);
    }
    await page.mouse.up();
      await delay(350);
      await page.evaluate(() => {
        const D = window.__DEBUG;
        if (window.__PROMO_GARAGE_STAGE_RECT) {
          D.garage.getStageRect = window.__PROMO_GARAGE_STAGE_RECT;
          delete window.__PROMO_GARAGE_STAGE_RECT;
          D.showroom.reset();
        }
      });
    });
  }

  if (!GARAGE_ONLY) {

  // Battle entry: the real loading screen, progress motion, and battlefield art.
  await page.evaluate(() => window.__DEBUG?.selectGarageTank?.('m1a2_sepv2'));
  await page.evaluate(() => window.__DEBUG?.garage?.setSelectedMap?.('steppe'));
  await delay(800);
  const startBattle = async () => {
    const start = await page.$('button[aria-label="Start Bots battle"]');
    if (!start) throw new Error('Start Bots battle button was not found');
    await start.click();
  };
  if (BATTLE_ONLY) await startBattle();
  else await record(page, 'battle-entry', 3_600, startBattle);

  // Battle HUD: request 60 fps directly from the WebGL canvas. The DOM HUD is
  // captured as a transparent overlay and recombined by the promo compositor.
  await page.waitForFunction(
    "window.__DEBUG?.game?.phase === 'battle'",
    { timeout: 180_000 },
  );
  await delay(2_000);
  // Garage and battle are the heaviest live surfaces. Capture them at 450p so
  // Chromium can sustain real frame pacing; the compositor performs the only
  // Lanczos upscale to the 1080p master.
  await page.setViewport({ width: 800, height: 450, deviceScaleFactor: 1 });
  await delay(1_500);
  const battleStage = await page.evaluate(() => {
    const D = window.__DEBUG;
    const player = D?.game?.player;
    if (!player) throw new Error('battle player was not available for combat staging');

    // Advance the real fixed-step battle rather than filming the deployment
    // line. Steppe gives the shoulder rushers and sniper lane open visual
    // depth; player throttle and normal bot
    // simulation put the HUD inside a live engagement before capture begins.
    player.input.throttle = 1;
    player.input.steer = 0.08;
    D.fastForward(18);
    player.input.throttle = 0;
    player.input.steer = 0;
    D.fastForward(1.5);

    let aimed = D.aimAtNearest();
    if (!aimed) {
      player.input.throttle = 1;
      D.fastForward(6);
      player.input.throttle = 0;
      aimed = D.aimAtNearest();
    }
    // Maps can still leave every natural lane masked. In that case, move the
    // nearest live enemy—not the player—onto the first surveyed clear lane.
    // It remains a real bot with real combat state for the recorded battle.
    if (!aimed) {
      const enemies = D.game.tanks
        .filter((tank) => tank.team === 'enemy' && tank.state && !tank.combat?.destroyed)
        .sort((a, b) => a.state.pos.distanceToSquared(player.state.pos) -
          b.state.pos.distanceToSquared(player.state.pos));
      const target = enemies[0];
      if (!target) throw new Error('combat staging found no live enemy');
      const origin = player.state.pos.clone();
      origin.y += 2.2;
      let staged = false;
      for (const distance of [150, 180, 220, 120]) {
        for (let step = 0; step < 24; step += 1) {
          const yaw = player.state.yaw + (step - 12) * Math.PI / 24;
          const x = player.state.pos.x + Math.sin(yaw) * distance;
          const z = player.state.pos.z + Math.cos(yaw) * distance;
          if (Math.abs(x) > 460 || Math.abs(z) > 460) continue;
          const y = D.world.heightField.getHeightAt(x, z);
          const aim = target.state.pos.clone().set(x, y + target.spec.dims.heightM * 0.55, z);
          const ray = aim.clone().sub(origin);
          const rayDistance = ray.length();
          const block = D.world.raycast(origin, ray.normalize(), rayDistance);
          if (block && block.dist < rayDistance - 2) continue;
          target.state.pos.set(x, y, z);
          target.state.yaw = yaw + Math.PI * 0.72;
          target.state.speed = 0;
          target.state.yawRate = 0;
          target.visual.syncFromState(target.state);
          staged = true;
          break;
        }
        if (staged) break;
      }
      if (!staged) throw new Error('combat staging could not survey a clear engagement lane');
      aimed = D.aimAtNearest() || {
        id: target.id,
        distM: target.state.pos.distanceTo(player.state.pos),
      };
    }
    D.fastForward(1.25);

    const target = D.game.tankById.get(aimed.id);
    if (!target) throw new Error('combat staging lost its selected target');
    target.aiCtl = null;
    target.input.throttle = 0;
    target.input.steer = 0;
    target.input.brake = true;
    target.state.speed = 0;
    player.state.bloomF = 0;
    // Always restage the selected enemy onto a visually open firing lane.
    // A terrain-only ray can pass through a forest canopy, so the survey also
    // rejects concealment circles along the entire scope corridor.
    const origin = player.state.pos.clone();
    player.visual.gunMuzzleWorld(origin);
    const concealment = D.world.getConcealment?.() || [];
    const obstacles = D.world.getObstacles?.() || [];
    const laneAt = (candidateYaw, distance) => {
      const x = player.state.pos.x + Math.sin(candidateYaw) * distance;
      const z = player.state.pos.z + Math.cos(candidateYaw) * distance;
      if (Math.abs(x) > 450 || Math.abs(z) > 450) return null;
      const normal = D.world.heightField.getNormalAt?.(x, z);
      if (normal && normal.y < 0.85) return null;
      for (const obstacle of obstacles) {
        if (!obstacle.crushed && x > obstacle.min[0] - 5 && x < obstacle.max[0] + 5 &&
            z > obstacle.min[2] - 5 && z < obstacle.max[2] + 5) return null;
      }
      const dx = x - origin.x;
      const dz = z - origin.z;
      const flatDistance = Math.hypot(dx, dz);
      const ux = dx / flatDistance;
      const uz = dz / flatDistance;
      for (const circle of concealment) {
        if (Math.hypot(circle.x - x, circle.z - z) < circle.r + 2) return null;
        const wx = circle.x - origin.x;
        const wz = circle.z - origin.z;
        const along = wx * ux + wz * uz;
        const across = Math.abs(wx * uz - wz * ux);
        if (along > 55 && along < flatDistance - 8 && across < circle.r + 2) return null;
      }
      const y = D.world.heightField.getHeightAt(x, z);
      for (const heightFraction of [0.25, 0.55, 0.92]) {
        const sample = target.state.pos.clone().set(
          x,
          y + target.spec.dims.heightM * heightFraction,
          z,
        );
        const ray = sample.clone().sub(origin);
        const rayDistance = ray.length();
        const block = D.world.raycast(origin, ray.normalize(), rayDistance);
        if (block && block.dist < rayDistance - 0.5) return null;
      }
      // Reuse the game's pre-slew target selector, which applies the exact
      // muzzle-path gate without falsely requiring the turret to have settled
      // during this candidate scan.
      target.state.pos.set(x, y, z);
      target.visual.syncFromState(target.state);
      const exact = D.aimAtNearest();
      if (!exact || exact.id !== target.id) return null;
      D.fastForward(0.25);
      if (D.aimState()?.blockedDistM != null) return null;
      return { x, y, z, yaw: candidateYaw };
    };
    let openLane = null;
    outer:
    for (const distance of [120, 105, 90, 75, 60, 150, 45, 35]) {
      for (let step = 0; step < 24; step += 1) {
        const turn = step === 0 ? 0 : Math.ceil(step / 2) * (step % 2 ? 1 : -1);
        const candidateYaw = player.state.yaw + turn * Math.PI / 24;
        openLane = laneAt(candidateYaw, distance);
        if (openLane) break outer;
      }
    }
    if (!openLane) throw new Error('combat staging found no vegetation-clear sniper lane');
    target.state.pos.set(openLane.x, openLane.y, openLane.z);
    // Broadside presentation makes the scoped silhouette immediately legible
    // and gives the real APFSDS round a convincing finishing shot.
    target.state.yaw = openLane.yaw + Math.PI * 0.5;
    target.state.yawRate = 0;
    const yaw = Math.atan2(
      target.state.pos.x - player.state.pos.x,
      target.state.pos.z - player.state.pos.z,
    );
    // Hold the chosen victim on the surveyed lane for this short staged shot;
    // it remains a live combat entity and receives the real player shell.
    target.aiCtl = null;
    target.input.throttle = 0;
    target.input.steer = 0;
    target.input.brake = true;
    target.state.speed = 0;
    target.visual.syncFromState(target.state);
    D.fastForward(0.2);
    window.__PROMO_TARGET_ID = target.id;
    // Stage two real allied bots in parallel lanes beside the player. Their
    // movement physics carry them past both shoulders during the opening
    // arcade beat without crossing the gun line to the target.
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const rushers = D.game.tanks
      .filter((tank) => tank !== player && tank.team === 'player' &&
        tank.state && !tank.combat?.destroyed && tank.aiCtl)
      .slice(0, 2);
    const lanes = [
      { ahead: 0, side: -8.0, yawOffset: -0.05 },
      { ahead: 0, side: 8.0, yawOffset: 0.05 },
    ];
    rushers.forEach((tank, index) => {
      const lane = lanes[index];
      const x = player.state.pos.x + forwardX * lane.ahead + rightX * lane.side;
      const z = player.state.pos.z + forwardZ * lane.ahead + rightZ * lane.side;
      tank.state.pos.set(x, D.world.heightField.getHeightAt(x, z), z);
      tank.state.yaw = yaw + lane.yawOffset;
      tank.state.turretYaw = 0;
      tank.state.yawRate = 0;
      const rushSpeed = Math.min((tank.spec.topSpeedKmh / 3.6) * 0.72, 12);
      tank.state.speed = 0;
      tank.input.throttle = 0;
      tank.input.steer = 0;
      tank.input.brake = true;
      tank.aiCtl = null;
      tank.visual.syncFromState(tank.state);
      tank.userData = tank.userData || {};
      tank.userData.promoRush = {
        x, y: tank.state.pos.y, z, yaw: tank.state.yaw, speed: rushSpeed,
      };
    });
    // Conventional over-turret arcade framing makes the battle state, enemy
    // silhouettes, reticle, team status, modules and tactical map readable.
    D.rig.snapArcade(0, yaw, -3 * Math.PI / 180);
    return {
      timeS: D.game.timeS,
      enemyId: aimed.id,
      enemyDistM: target.state.pos.distanceTo(player.state.pos),
      rushers: rushers.map((tank) => tank.specId),
    };
  });
  console.log(
    `[feature-promo-capture] HUD staged at ${battleStage.timeS.toFixed(1)} s, ` +
    `${battleStage.enemyId} ${battleStage.enemyDistM.toFixed(0)} m, ` +
    `rushers ${battleStage.rushers.join(' + ')}`,
  );
  await delay(700);
  await recordBattleCanvas(page, 'battle-live', 4_200, async () => {
    // Establish the two allied rushers in arcade view, enter the real sniper
    // mode through the player binding, step to a useful magnification, then
    // fire the live gun down the pre-surveyed clear lane.
    await page.evaluate(() => {
      const D = window.__DEBUG;
      const target = D.game.tankById.get(window.__PROMO_TARGET_ID);
      if (target?.combat) target.combat.hp = Math.min(target.combat.hp, 150);
      for (const tank of D.game.tanks) {
        const rush = tank.userData?.promoRush;
        if (!rush) continue;
        tank.state.pos.set(rush.x, rush.y, rush.z);
        tank.state.yaw = rush.yaw;
        tank.state.yawRate = 0;
        tank.state.speed = rush.speed;
        tank.input.throttle = 1;
        tank.input.steer = 0;
        tank.input.brake = false;
        tank.visual.syncFromState(tank.state);
      }
    });
    await page.mouse.move(400, 225);
    await delay(850);
    await page.evaluate(() => {
      const D = window.__DEBUG;
      const player = D.game.player;
      const target = D.game.tankById.get(window.__PROMO_TARGET_ID);
      if (!player || !target || target.combat?.destroyed) {
        throw new Error('promo sniper target was unavailable');
      }
      const origin = player.state.pos.clone();
      player.visual.gunPivotWorld(origin);
      const aim = target.state.pos.clone();
      aim.y += target.spec.dims.heightM * 0.52;
      const dx = aim.x - origin.x;
      const dy = aim.y - origin.y;
      const dz = aim.z - origin.z;
      D.rig.snapSniper(4, Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz)));
      player.input.aimPoint.copy(aim);
    });
    await delay(220);
    await page.mouse.wheel({ deltaY: -120 });
    await delay(90);
    await page.mouse.wheel({ deltaY: -120 });
    await delay(360);
    await page.evaluate(() => {
      const D = window.__DEBUG;
      D.flags.forceFire = true;
      // Resolve the real player shell through the normal 60 Hz simulation in
      // the same captured beat, independent of headless rAF scheduling.
      D.fastForward(0.20);
      D.flags.forceFire = false;
    });
    await delay(160);
    await delay(2_450);
  });
  const battleResult = await page.evaluate(() => {
    const D = window.__DEBUG;
    const target = D.game.tankById.get(window.__PROMO_TARGET_ID);
    const shellLog = D.playerShellLog || [];
    return {
      targetHp: target?.combat?.hp ?? null,
      targetDestroyed: !!target?.combat?.destroyed,
      lastShell: shellLog.at(-1) || null,
    };
  });
  console.log(`[feature-promo-capture] HUD result ${JSON.stringify(battleResult)}`);

  if (!BATTLE_ONLY) {
  // Scene Studio: restore the original 15-second cinematic grammar—the low
  // passes, shell pursuit, ammunition-rack blast, shake, roll, and burning
  // pullback—using M1A2 SEPv2 as the hero tank.
  await goto(page, '/?studio=1&map=coastal&nogate=1');
  await page.waitForFunction(
    "window.__GAME_READY === true && window.__STUDIO?.active === true && window.__STUDIO.mapId === 'coastal'",
    { timeout: 180_000 },
  );
  // Keep Studio on the same 540p capture budget as the live battle. The
  // compositor performs the only upscale, leaving the browser enough GPU time
  // to render materially closer to the requested 60 fps.
  await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
  await page.evaluate(async () => {
    const S = window.__STUDIO;
    const actors = [
      { id: 'm1a2_sepv2', name: 'alpha', pos: [132, -52], facingDeg: 90, camo: 'summer' },
      { id: 'leclerc_xlr', name: 'bravo', pos: [188, -52], facingDeg: -90, camo: 'summer' },
    ];
    await S.load({ map: 'coastal', seed: 25137, actors, fxTime: 0, timeScale: 0 });
    S.directDuel({ variant: 0 });
    S.setRailVisible(true);
    const direct = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('DIRECT 15 S PROMO'));
    direct?.scrollIntoView({ block: 'center' });
  });
  await delay(1_200);
  await recordStudioCanvas(page, 'studio');

  // Gallery: keep the recurring public-facing hero on M1A2 Abrams SEPv2.
  await goto(page, '/gallery?id=m1a2_sepv2');
  await page.waitForFunction(
    "document.querySelector('#autoRotate') && document.querySelector('canvas')",
    { timeout: 180_000 },
  );
  await delay(3_500);
  await page.evaluate(() => document.querySelector('#autoRotate')?.click());
  await record(page, 'gallery', 3_800);

  // Docs: retain readable live typography while smoothly revealing the systems.
  await goto(page, '/docs');
  await page.waitForFunction('document.body.scrollHeight > innerHeight', { timeout: 60_000 });
  await page.evaluate(() => scrollTo(0, 0));
  await delay(800);
  await record(page, 'docs', 3_800, async () => {
    await page.evaluate(() => new Promise((resolveScroll) => {
      const start = performance.now();
      const duration = 3_250;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t * t * (3 - 2 * t);
        scrollTo(0, 720 * eased);
        if (t < 1) requestAnimationFrame(tick);
        else resolveScroll();
      };
      requestAnimationFrame(tick);
    }));
  });
  }
  }

  if (consoleErrors.length) {
    throw new Error(
      `captured pages emitted ${consoleErrors.length} console error(s): ` +
      consoleErrors.slice(0, 5).join(' | '),
    );
  }
  console.log(`[feature-promo-capture] complete: ${OUT_DIR}`);
} finally {
  await browser.close();
}
