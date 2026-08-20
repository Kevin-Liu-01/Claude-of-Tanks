#!/usr/bin/env node

/** Capture two real rendered multiplayer perspectives for the README. */

import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createSignalingServer } from '../../server/signalingServer.js';

const root = new URL('../..', import.meta.url).pathname;
const outputPath = resolve(root, 'public/media/multiplayer-r1/dual-perspective.webp');
const viewport = { width: 1280, height: 720, deviceScaleFactor: 1 };
const browserErrors = [];
let browser = null;

const vite = await createViteServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
});
const signaling = createSignalingServer({ host: '127.0.0.1', port: 0 });

function observe(page, label) {
  page.on('pageerror', (error) => browserErrors.push(`${label}: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`${label}: ${message.text()}`);
  });
}

async function openRenderedPlayer(origin, label) {
  const page = await browser.newPage();
  observe(page, label);
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
      configurable: true, get: () => 8,
    });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', {
      configurable: true, get: () => 8,
    });
  });
  await page.goto(`${origin}/?nosplash=1&tier=desktop&gfxreset=1`, {
    waitUntil: 'domcontentloaded', timeout: 180_000,
  });
  try {
    await page.waitForFunction(
      () => window.__GAME_READY === true && window.__DEBUG?.beginNetworkBattle,
      { timeout: 240_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      ready: window.__GAME_READY,
      hasDebug: !!window.__DEBUG,
      hasBattleEntry: !!window.__DEBUG?.beginNetworkBattle,
      title: document.title,
    })).catch(() => ({ unreachable: true }));
    throw new Error(`${label} did not finish boot: ${JSON.stringify(state)}`, { cause: error });
  }
  return page;
}

async function openAuthority(origin, label) {
  const page = await browser.newPage();
  observe(page, `${label}-authority`);
  await page.setViewport({ width: 800, height: 450, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tools/multiplayer-browser-soak.html`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  return page;
}

async function createStartingRoom(authorityPage, playerPage, signalUrl, config) {
  const room = await authorityPage.evaluate(async ({ url, config: pass }) => {
    const [{ RoomSignalingClient }, { PrivateRoomHostSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.js'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.createRoom({
      player: { id: `${pass.id}-opponent`, name: pass.opponentName },
      mode: 'lan', maxPlayers: 2,
    });
    const state = globalThis.__COT_DUAL = {
      signaling: signalingClient,
      roomInfo,
      lastLobby: null,
      startingLobby: null,
      errors: [],
    };
    state.session = new PrivateRoomHostSession({
      signaling: signalingClient,
      roomInfo,
      hostName: pass.opponentName,
      hostSpecId: pass.opponentSpecId,
      hostCamo: pass.opponentCamo,
      mapId: 'desert',
      teamSize: 1,
      onStart: (lobby) => { state.startingLobby = lobby; },
      onError: (error) => state.errors.push(error.message),
    });
    state.unsubscribe = state.session.runtime.onState((lobby) => { state.lastLobby = lobby; });
    return roomInfo;
  }, { url: signalUrl, config });

  await playerPage.evaluate(async ({ url, roomCode, config: pass }) => {
    const [{ RoomSignalingClient }, { PrivateRoomClientSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.js'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.joinRoom({
      roomCode,
      player: { id: `${pass.id}-player`, name: pass.playerName },
    });
    const state = globalThis.__COT_DUAL = {
      signaling: signalingClient,
      roomInfo,
      lastLobby: null,
      errors: [],
    };
    state.session = new PrivateRoomClientSession({
      signaling: signalingClient,
      roomInfo,
      onError: (error) => state.errors.push(error.message),
    });
    state.runtime = await state.session.ready;
    state.unsubscribe = state.runtime.onState((lobby) => { state.lastLobby = lobby; });
    await state.session.submit({ type: 'select_vehicle', specId: pass.playerSpecId });
    await state.session.submit({ type: 'select_camo', camo: pass.playerCamo });
  }, { url: signalUrl, roomCode: room.roomCode, config });

  await authorityPage.waitForFunction(
    (specs) => globalThis.__COT_DUAL?.lastLobby?.players?.length === 2 &&
      specs.every((specId) => globalThis.__COT_DUAL.lastLobby.players
        .some((player) => player.specId === specId)),
    { timeout: 30_000 }, [config.playerSpecId, config.opponentSpecId],
  );
  await playerPage.waitForFunction(
    () => globalThis.__COT_DUAL?.lastLobby?.players?.length === 2,
    { timeout: 30_000 },
  );
  const lobby = await authorityPage.evaluate(() => globalThis.__COT_DUAL.lastLobby);
  assert.equal(lobby.players.length, 2);
  assert.equal(lobby.teamSize, 1);
  assert.deepEqual(new Set(lobby.players.map((player) => player.specId)),
    new Set([config.playerSpecId, config.opponentSpecId]));

  await Promise.all([
    authorityPage.evaluate(() => globalThis.__COT_DUAL.session.command({
      type: 'set_ready', ready: true,
    })),
    playerPage.evaluate(() => globalThis.__COT_DUAL.session.submit({
      type: 'set_ready', ready: true,
    })),
  ]);
  await authorityPage.waitForFunction(
    () => globalThis.__COT_DUAL.lastLobby.players.every((player) => player.ready),
    { timeout: 20_000 },
  );
  await authorityPage.evaluate(() => globalThis.__COT_DUAL.session.command({
    type: 'start', matchSeed: 0xD0A15C4E,
  }));
  await Promise.all([
    authorityPage.waitForFunction(
      () => globalThis.__COT_DUAL.startingLobby?.phase === 'starting',
      { timeout: 20_000 },
    ),
    playerPage.waitForFunction(
      () => globalThis.__COT_DUAL.lastLobby?.phase === 'starting',
      { timeout: 20_000 },
    ),
  ]);
  return lobby;
}

async function startLightAuthority(authorityPage) {
  await authorityPage.evaluate(async () => {
    const state = globalThis.__COT_DUAL;
    const [{ beginPrivateHostMatch }, { createDedicatedWorldCollision }] = await Promise.all([
      import('/src/net/privateMatchHandoff.js'),
      import('/server/dedicatedWorldCollision.js'),
      import('/src/vehicles/tankFactory.js'),
    ]);
    state.worldCollision = createDedicatedWorldCollision(state.startingLobby.mapId);
    state.match = beginPrivateHostMatch({
      session: state.session,
      lobbyState: state.startingLobby,
      worldCollision: state.worldCollision,
    });
    state.match.ready();
    state.pumpTimer = setInterval(() => {
      try { state.lastSnapshot = state.match.advance(1000 / 60); }
      catch (error) { state.errors.push(error.message); }
    }, 1000 / 60);
  });
}

async function enterRenderedClient(playerPage) {
  await playerPage.evaluate(() => {
    const state = globalThis.__COT_DUAL;
    state.entry = window.__DEBUG.beginNetworkBattle({
      role: 'client', session: state.session, lobbyState: state.lastLobby,
    }).then((result) => { state.entryResult = result; })
      .catch((error) => { state.errors.push(error.message); state.entryResult = false; });
  });
  await playerPage.waitForFunction(
    () => (window.__DEBUG.game.phase === 'battle' && window.__DEBUG.game.preBattleS <= 0) ||
      globalThis.__COT_DUAL.entryResult === false,
    { timeout: 240_000, polling: 50 },
  );
  const entry = await playerPage.evaluate(() => ({
    phase: window.__DEBUG.game.phase,
    result: globalThis.__COT_DUAL.entryResult,
    errors: globalThis.__COT_DUAL.errors,
    failure: window.__NETWORK_ENTRY_FAILURE,
    load: window.__NETWORK_LOAD,
  }));
  assert.equal(entry.phase, 'battle', `rendered handoff failed: ${JSON.stringify(entry)}`);
  assert.notEqual(entry.result, false, `rendered entry failed: ${JSON.stringify(entry)}`);
}

async function stageFaceoff(authorityPage, lobby) {
  return authorityPage.evaluate((lobbyState) => {
    const state = globalThis.__COT_DUAL;
    const simulation = state.match?.simulation;
    const collision = state.worldCollision;
    if (!simulation || !collision) throw new Error('authority world unavailable');
    const heightField = collision.heightField;
    const heightAt = heightField.getHeightAtFast || heightField.getHeightAt.bind(heightField);
    const obstacles = [];
    const pointClear = (x, z, radius = 5.5) => {
      obstacles.length = 0;
      collision.queryObstacles(x - radius, z - radius, x + radius, z + radius, obstacles);
      if (obstacles.some((obstacle) => !obstacle.crushed &&
        obstacle.max[0] >= x - radius && obstacle.min[0] <= x + radius &&
        obstacle.max[2] >= z - radius && obstacle.min[2] <= z + radius)) return false;
      const heights = [
        heightAt(x, z), heightAt(x + 3.5, z), heightAt(x - 3.5, z),
        heightAt(x, z + 3.5), heightAt(x, z - 3.5),
      ];
      return Math.max(...heights) - Math.min(...heights) < 0.7;
    };
    const clearLine = (a, b) => {
      const probe = simulation.entityById.values().next().value.state.pos.clone();
      const target = probe.clone();
      probe.set(a.x, heightAt(a.x, a.z) + 2, a.z);
      target.set(b.x, heightAt(b.x, b.z) + 2, b.z);
      const direction = target.sub(probe);
      const distance = direction.length();
      direction.multiplyScalar(1 / distance);
      const hit = collision.raycast(probe, direction, distance - 2);
      return !hit || hit.dist >= distance - 2.5;
    };
    const candidates = [];
    for (let radius = 0; radius <= 320; radius += 40) {
      for (let x = -radius; x <= radius; x += 40) candidates.push([x, -radius], [x, radius]);
      for (let z = -radius + 40; z <= radius - 40; z += 40) {
        candidates.push([-radius, z], [radius, z]);
      }
    }
    let pair = null;
    search:
    for (const [cx, cz] of candidates) {
      for (const axis of ['z', 'x']) {
        const alpha = axis === 'z'
          ? { x: cx, z: cz - 15, yaw: 0 }
          : { x: cx - 15, z: cz, yaw: Math.PI / 2 };
        const bravo = axis === 'z'
          ? { x: cx, z: cz + 15, yaw: Math.PI }
          : { x: cx + 15, z: cz, yaw: -Math.PI / 2 };
        if (pointClear(alpha.x, alpha.z) && pointClear(bravo.x, bravo.z) &&
            clearLine(alpha, bravo)) {
          pair = { axis, alpha, bravo };
          break search;
        }
      }
    }
    if (!pair) throw new Error('no clear faceoff lane found');
    const alphaPlayer = lobbyState.players.find((player) => player.team === 'alpha');
    const bravoPlayer = lobbyState.players.find((player) => player.team === 'bravo');
    for (const [player, pose] of [[alphaPlayer, pair.alpha], [bravoPlayer, pair.bravo]]) {
      const entity = simulation.entityById.get(player.id);
      const y = heightAt(pose.x, pose.z);
      entity.state.pos.set(pose.x, y, pose.z);
      entity.state.yaw = pose.yaw;
      entity.state.speed = 0;
      entity.state.yawRate = 0;
      entity.state.visualPitch = 0;
      entity.state.visualRoll = 0;
      entity.state.turretYaw = 0;
      entity.state.gunPitch = 0;
      entity.state.turretYawRate = 0;
      entity.state._prevSpeed = 0;
      entity.state._spool = 0;
      if (entity.state._ride) {
        entity.state._ride.y = y;
        entity.state._ride.v = 0;
        entity.state._ride.supportY = y;
      }
      if (entity.state._sup) {
        entity.state._sup.x = NaN;
        entity.state._sup.z = NaN;
      }
      entity.input.throttle = 0;
      entity.input.steer = 0;
      entity.input.brake = true;
      entity.input.fire = false;
    }
    return {
      axis: pair.axis,
      alphaId: alphaPlayer.id,
      bravoId: bravoPlayer.id,
      alpha: pair.alpha,
      bravo: pair.bravo,
    };
  }, lobby);
}

async function framePerspective(page, opponentId) {
  await page.waitForFunction((id) => {
    const player = window.__DEBUG.game.player;
    const target = window.__DEBUG.game.tankById.get(id);
    const distance = player?.state && target?.state
      ? player.state.pos.distanceTo(target.state.pos) : Infinity;
    return distance > 24 && distance < 38;
  }, { timeout: 30_000 }, opponentId);
  await page.evaluate((id) => {
    const state = globalThis.__COT_DUAL;
    const loop = () => {
      const player = window.__DEBUG.game.player;
      const target = window.__DEBUG.game.tankById.get(id);
      if (player?.state && target?.state) {
        const forward = target.state.pos.clone().sub(player.state.pos).normalize();
        const up = forward.clone().set(0, 1, 0);
        const right = forward.clone().cross(up).normalize();
        const cameraPos = player.state.pos.clone()
          .addScaledVector(forward, -8.8)
          .addScaledVector(right, 3.1);
        cameraPos.y += 5.1;
        const lookAt = player.state.pos.clone().lerp(target.state.pos, 0.6);
        lookAt.y += 1.7;
        player.input.aimPoint.copy(target.state.pos);
        player.input.aimPoint.y += target.spec.dims.heightM * 0.52;
        window.__DEBUG.rig.setExternalPose(cameraPos, lookAt, 46);
      }
      state.cameraRaf = requestAnimationFrame(loop);
    };
    state.cameraRaf = requestAnimationFrame(loop);
  }, opponentId);
}

async function closePlayer(page) {
  if (!page || page.isClosed()) return;
  await page.evaluate(() => {
    const state = globalThis.__COT_DUAL;
    if (!state) return;
    if (state.cameraRaf) cancelAnimationFrame(state.cameraRaf);
    try { state.unsubscribe?.(); } catch (_) { /* best effort */ }
    try { state.session?.close('dual_capture_complete'); } catch (_) { /* best effort */ }
    try { state.signaling?.close('dual_capture_complete'); } catch (_) { /* best effort */ }
  }).catch(() => {});
  await page.close().catch(() => {});
}

async function closeAuthority(page) {
  if (!page || page.isClosed()) return;
  await page.evaluate(() => {
    const state = globalThis.__COT_DUAL;
    if (!state) return;
    if (state.pumpTimer) clearInterval(state.pumpTimer);
    try { state.unsubscribe?.(); } catch (_) { /* best effort */ }
    try { state.match?.close('dual_capture_complete'); } catch (_) { /* best effort */ }
    try { state.signaling?.close('dual_capture_complete'); } catch (_) { /* best effort */ }
  }).catch(() => {});
  await page.close().catch(() => {});
}

async function capturePerspective(origin, signalUrl, config) {
  console.log(`[multiplayer-shot] ${config.label}: booting rendered client`);
  const authorityPage = await openAuthority(origin, config.id);
  const playerPage = await openRenderedPlayer(origin, `${config.id}-player`);
  try {
    console.log(`[multiplayer-shot] ${config.label}: starting deterministic 1v1`);
    const lobby = await createStartingRoom(authorityPage, playerPage, signalUrl, config);
    await startLightAuthority(authorityPage);
    await enterRenderedClient(playerPage);
    const formation = await stageFaceoff(authorityPage, lobby);
    const own = lobby.players.find((player) => player.id === `${config.id}-player`);
    const opponent = lobby.players.find((player) => player.id !== own.id);
    await framePerspective(playerPage, opponent.id);
    await new Promise((resolveWait) => setTimeout(resolveWait, 2200));
    const image = await playerPage.screenshot({ type: 'jpeg', quality: 94 });
    const state = await playerPage.evaluate(() => ({
      phase: window.__DEBUG.game.phase,
      roster: window.__DEBUG.game.tankById.size,
      errors: globalThis.__COT_DUAL.errors,
      distance: window.__DEBUG.game.player.state.pos.distanceTo(
        window.__DEBUG.game.tanks.find((tank) => tank.id !== window.__DEBUG.game.player.id).state.pos,
      ),
    }));
    const authority = await authorityPage.evaluate(() => ({
      errors: globalThis.__COT_DUAL.errors,
      started: globalThis.__COT_DUAL.match?.host?.matchStarted,
      peerCount: globalThis.__COT_DUAL.match?.host?.peers?.size,
    }));
    assert.equal(state.phase, 'battle');
    assert.equal(state.roster, 2);
    assert.ok(state.distance > 24 && state.distance < 38);
    assert.deepEqual(state.errors, []);
    assert.deepEqual(authority.errors, []);
    assert.equal(authority.started, true);
    assert.equal(authority.peerCount, 2);
    return { image, state, formation };
  } finally {
    await Promise.all([closePlayer(playerPage), closeAuthority(authorityPage)]);
  }
}

async function compose(alphaImage, bravoImage) {
  const page = await browser.newPage();
  observe(page, 'composition');
  await page.setViewport({ width: 2400, height: 900, deviceScaleFactor: 1 });
  const dataUrl = (buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`;
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:2400px;height:900px;overflow:hidden}
    body{padding:28px;background:#06090d;color:#e8edf2;font-family:Inter,Arial,sans-serif}
    header{height:62px;display:flex;align-items:flex-start;justify-content:space-between;border-top:2px solid #f0a030;padding:14px 2px 0}
    .eyebrow{font:800 14px/1 Arial,sans-serif;letter-spacing:.28em;color:#f0aa38}
    h1{margin:7px 0 0;font:800 24px/1 Arial,sans-serif;letter-spacing:.05em;text-transform:uppercase}
    .truth{padding-top:9px;font:700 12px/1 Arial,sans-serif;letter-spacing:.2em;color:#93a2af}
    main{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:10px}
    figure{position:relative;margin:0;height:720px;overflow:hidden;background:#090d12;border:1px solid #38424c;border-top:2px solid #f0a030;box-shadow:0 18px 54px rgba(0,0,0,.48)}
    figure.bravo{border-top-color:#77b8d8}figure img{display:block;width:100%;height:100%;object-fit:cover}
    figcaption{position:absolute;left:18px;top:16px;display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(5,8,12,.86);border:1px solid rgba(255,255,255,.22);font:800 12px/1 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase}
    .alpha figcaption{border-left:3px solid #f0a030}.bravo figcaption{border-left:3px solid #77b8d8}
    .vehicle{color:#aab6c1;font-weight:700}.live{color:#70d68b}
    .link{position:absolute;z-index:2;left:50%;top:50%;transform:translate(-50%,-50%);width:74px;height:74px;display:grid;place-items:center;background:#0a0e13;border:2px solid #f0a030;box-shadow:0 0 0 8px rgba(6,9,13,.78);font:900 14px/1 Arial,sans-serif;letter-spacing:.12em;color:#f6bd61}
    footer{height:52px;display:flex;align-items:center;justify-content:center;gap:16px;color:#9ba8b3;font:800 12px/1 Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase}
    footer b{color:#e4ebf1}footer span{color:#f0a030}
  </style></head><body>
    <header><div><div class="eyebrow">Live browser multiplayer</div><h1>Two screens // opposing sights</h1></div><div class="truth">Intent → authority → filtered snapshots</div></header>
    <main>
      <figure class="alpha"><img src="${dataUrl(alphaImage)}" alt=""><figcaption><span class="live">Live</span> Player one <span class="vehicle">M1A2 Abrams</span></figcaption></figure>
      <figure class="bravo"><img src="${dataUrl(bravoImage)}" alt=""><figcaption><span class="live">Live</span> Player two <span class="vehicle">T-90M Proryv</span></figcaption></figure>
      <div class="link">VS</div>
    </main>
    <footer><b>Paired live multiplayer perspectives</b><span>◆</span> deterministic opposing faceoffs</footer>
  </body></html>`, { waitUntil: 'load' });
  await page.screenshot({ path: outputPath, type: 'webp', quality: 92 });
  await page.close();
}

try {
  await mkdir(dirname(outputPath), { recursive: true });
  console.log('[multiplayer-shot] starting local Vite and signaling servers');
  await vite.listen();
  const signalAddress = await signaling.listen();
  const viteAddress = vite.httpServer.address();
  const origin = `http://127.0.0.1:${viteAddress.port}`;
  const signalUrl = `ws://127.0.0.1:${signalAddress.port}/signal`;
  browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 600_000,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--enable-webgl',
    ],
  });
  const alpha = await capturePerspective(origin, signalUrl, {
    id: 'abrams',
    label: 'Abrams perspective',
    playerName: 'Alpha Commander',
    playerSpecId: 'm1a2',
    playerCamo: 'merdc',
    opponentName: 'Bravo Commander',
    opponentSpecId: 't90m',
    opponentCamo: 'desert',
  });
  const bravo = await capturePerspective(origin, signalUrl, {
    id: 'proryv',
    label: 'T-90M perspective',
    playerName: 'Bravo Commander',
    playerSpecId: 't90m',
    playerCamo: 'desert',
    opponentName: 'Alpha Commander',
    opponentSpecId: 'm1a2',
    opponentCamo: 'merdc',
  });
  console.log('[multiplayer-shot] composing the README feature image');
  await compose(alpha.image, bravo.image);
  assert.deepEqual(browserErrors, [], `browser errors:\n${browserErrors.join('\n')}`);
  console.log(JSON.stringify({
    ok: true,
    outputPath,
    perspectives: [
      { id: 'm1a2', state: alpha.state, formation: alpha.formation },
      { id: 't90m', state: bravo.state, formation: bravo.formation },
    ],
  }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  await signaling.close().catch(() => {});
  await vite.close().catch(() => {});
}
