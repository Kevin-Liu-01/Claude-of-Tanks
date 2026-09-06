import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createSignalingServer } from '../server/signalingServer.ts';
import { SignalingRoomStore } from '../server/roomStore.ts';

// Functional UI regression: real menu/status modules and native signaling.
// No battlefield, renderer, FPS claim, production writes, or timeout overrides.
const output = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6)
  || '.qa-dev/private-room-errors');
await mkdir(output, { recursive: true });
const store = new SignalingRoomStore();
let failCreate = false;
let delayedCreate = null;
let delayEntered = false;
let createRequests = 0;
let joinRequests = 0;
const originalCreate = store.create.bind(store);
const originalJoin = store.join.bind(store);
store.create = async (...args) => {
  createRequests++;
  if (delayedCreate) {
    delayEntered = true;
    await delayedCreate;
    throw Object.assign(new Error('injected late service failure'), { code: 'signaling_capacity_exhausted' });
  }
  if (failCreate) throw Object.assign(new Error('injected service failure'), { code: 'signaling_capacity_exhausted' });
  return originalCreate(...args);
};
store.join = (...args) => { joinRequests++; return originalJoin(...args); };
const signaling = createSignalingServer({ port: 0, store });
let vite = null;
let browser = null;
let releaseDelayed = null;
const reports = [];
const pageErrors = [];

async function waitFailure(page, reason) {
  await page.waitForFunction(code => {
    const panel = document.querySelector('.room-failure');
    return panel && !panel.hidden && panel.dataset.reason === code;
  }, { timeout: 10_000 }, reason);
}

async function setCode(page, value) {
  await page.evaluate(code => {
    const input = document.querySelector('[data-field="code"]');
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

try {
  const address = await signaling.listen();
  process.env.VITE_SIGNAL_URL = `ws://127.0.0.1:${address.port}/signal`;
  vite = await createViteServer({ root: new URL('..', import.meta.url).pathname,
    logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  for (const [name, width, height] of [['desktop', 1280, 900], ['phone', 390, 844]]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(`${name}: ${error.message}`));
    await page.setViewport({ width, height, isMobile: name === 'phone', hasTouch: name === 'phone' });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`${origin}/tools/multiplayer-browser-soak.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      // Use the exact application viewport policy and shared surface styles;
      // the menu must not invent a separate test-only mobile breakpoint.
      await import('/src/ui/responsiveSurfaces.css');
      const [{ createPlayMenu }, { createNetworkStatus }, { installResponsiveLayout }] = await Promise.all([
        import('/src/ui/playMenu.ts'), import('/src/ui/networkStatus.ts'),
        import('/src/ui/responsiveLayout.ts'),
      ]);
      globalThis.__ROOM_ERRORS = { closed: [], starts: [], exits: 0 };
      const state = globalThis.__ROOM_ERRORS;
      state.responsive = installResponsiveLayout();
      const trigger = document.createElement('button');
      trigger.id = 'garage-trigger';
      trigger.textContent = 'Garage play';
      document.body.appendChild(trigger);
      trigger.focus();
      state.menu = createPlayMenu({ maps: [{ id: 'random', name: 'Random' }, { id: 'winter', name: 'Winter' }],
        vehicles: [{ id: 'm1a2', name: 'M1A2' }],
        getSelection: () => ({ specId: 'm1a2', mapId: 'winter', equipment: [], camo: 'factory' }),
        onNetworkClose: reason => state.closed.push(reason),
        onNetworkStart: request => { state.starts.push(request); },
      });
      state.status = createNetworkStatus({ onExit: () => state.exits++ });
      state.menu.show('ranked');
    });
    assert.equal(await page.$eval('body', node => node.dataset.cotWidth), name === 'phone' ? 'phone' : 'laptop');
    assert.deepEqual(await page.$$eval('.mode', nodes => nodes.map(node => node.dataset.mode)),
      ['solo', 'private', 'lan']);
    assert.equal(await page.$eval('.mode.on', node => node.dataset.mode), 'private');
    assert.equal(await page.$('[data-ranked],.ranked'), null);

    await page.evaluate(() => globalThis.__ROOM_ERRORS.menu.show('private', { autoJoin: true, roomCode: 'BAD' }));
    await waitFailure(page, 'invalid_room_code');
    assert.equal(await page.$eval('[data-field="code"]', node => node.getAttribute('aria-invalid')), 'true');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.roomFailure), 'code');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'code');

    await setCode(page, 'ZZZZZZ');
    const beforeMissing = joinRequests;
    await page.click('[data-action="join"]');
    await waitFailure(page, 'expired');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(joinRequests, beforeMissing + 1, 'terminal missing room never retries automatically');
    assert.equal(await page.$eval('[data-room-failure="retry"]', node => node.hidden), true);

    const full = originalCreate({}, { player: { id: `full-host-${name}`, name: 'Full host' }, maxPlayers: 2 });
    originalJoin({}, { roomCode: full.roomCode, player: { id: `full-guest-${name}`, name: 'Full guest' } });
    await page.click('[data-room-failure="code"]');
    await setCode(page, full.roomCode);
    await page.click('[data-action="join"]');
    await waitFailure(page, 'room_full');
    await page.screenshot({ path: resolve(output, `${name}-room-full.png`) });

    await page.evaluate(() => globalThis.__ROOM_ERRORS.menu.show('private'));
    failCreate = true;
    await page.click('[data-action="create"]');
    await waitFailure(page, 'signaling_unavailable');
    assert.equal(await page.$eval('.room', node => node.getAttribute('aria-busy')), 'false');
    assert.equal(await page.$eval('[data-room-failure="retry"]', node => node.hidden), false);
    await page.click('[data-room-failure="settings"]');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'signal');
    failCreate = false;
    const beforeRetry = createRequests;
    await page.click('[data-room-failure="retry"]');
    await page.waitForSelector('.lobby.show .player', { timeout: 10_000 });
    assert.equal(createRequests, beforeRetry + 1, 'one explicit retry creates one new generation');
    assert.equal(await page.$eval('.room-failure', node => node.hidden), true);
    const roomCode = await page.$eval('.lobby .code', node => node.textContent);
    const socket = [...store.membership].find(([, membership]) => membership.roomCode === roomCode)?.[0];
    assert.ok(socket?.send, 'test owns the real menu host signaling socket');
    store.leave(socket, 'host_left');
    socket.send(JSON.stringify({ type: 'room_closed', payload: { roomCode, reason: 'host_left' } }));
    await waitFailure(page, 'host_left');
    assert.equal(await page.$eval('[data-room-failure="retry"]', node => node.hidden), true);
    assert.deepEqual(await page.evaluate(() => globalThis.__ROOM_ERRORS.closed), ['host_left']);

    for (const reason of ['resume_denied', 'rtc_connect_timeout', 'rtc_recovery_exhausted', 'host_runtime_failed']) {
      await page.evaluate(code => globalThis.__ROOM_ERRORS.menu.showRoomFailure(code, 'lan'), reason);
      await waitFailure(page, reason);
      assert.equal(await page.$eval('.mode.on', node => node.dataset.mode), 'lan');
    }
    const layout = await page.evaluate(() => {
      const panel = document.querySelector('.room-failure');
      const bounds = panel.getBoundingClientRect();
      return { role: panel.getAttribute('role'), focus: document.activeElement === panel,
        left: bounds.left, right: bounds.right, width: innerWidth,
        widthBand: document.body.dataset.cotWidth,
        inputMode: document.body.dataset.cotInput,
        actionsDisplay: getComputedStyle(panel.querySelector('.room-failure-actions')).display,
        overflow: panel.scrollWidth > panel.clientWidth,
        minActionHeight: Math.min(...[...panel.querySelectorAll('button')].filter(node => !node.hidden)
          .map(node => node.getBoundingClientRect().height)),
      };
    });
    assert.equal(layout.role, 'alert');
    assert.equal(layout.focus, true);
    assert.ok(layout.left >= 0 && layout.right <= layout.width && !layout.overflow);
    assert.ok(layout.minActionHeight >= 44);
    if (name === 'phone') assert.equal(layout.actionsDisplay, 'grid');
    await page.screenshot({ path: resolve(output, `${name}-room-ended.png`) });
    await page.click('[data-room-failure="garage"]');
    assert.equal(await page.$eval('.cot-play', node => node.classList.contains('show')), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'garage-trigger');

    // A late old-room failure must not alter an in-flight replacement.
    delayedCreate = new Promise(resolve => { releaseDelayed = resolve; });
    delayEntered = false;
    await page.evaluate(() => globalThis.__ROOM_ERRORS.menu.show('lan'));
    await page.click('[data-action="create"]');
    for (let count = 0; !delayEntered && count < 100; count++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(delayEntered, true);
    await page.evaluate(() => {
      const { menu } = globalThis.__ROOM_ERRORS;
      menu.detachActiveRoom();
      menu.showRoomFailure('host_left', 'private');
    });
    assert.equal(await page.$eval('.mode.on', node => node.dataset.mode), 'lan');
    assert.equal(await page.$eval('.room', node => node.getAttribute('aria-busy')), 'true');
    assert.equal(await page.$eval('[data-action="create"]', node => node.disabled), true);
    assert.equal(await page.$eval('.room-failure', node => node.hidden), true);
    await page.click('.cot-play .close');
    releaseDelayed(); releaseDelayed = null; delayedCreate = null;
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await page.$eval('.cot-play', node => node.classList.contains('show')), false);
    assert.equal(await page.$eval('.room-failure', node => node.hidden), true);

    // The initial battle intentionally skips attachActiveRoom. Its frame owner
    // closes the native session without an onClose event before menu cleanup.
    await page.evaluate(() => globalThis.__ROOM_ERRORS.menu.show('lan'));
    await page.click('[data-action="create"]');
    await page.waitForSelector('.lobby.show .player', { timeout: 10_000 });
    await page.click('[data-action="ready"]');
    await page.waitForFunction(() => !document.querySelector('[data-action="start"]').disabled);
    await page.click('[data-action="start"]');
    await page.waitForFunction(() => globalThis.__ROOM_ERRORS.starts.length === 1);
    assert.equal(await page.$eval('.cot-play', node => node.classList.contains('show')), false);
    assert.equal(await page.evaluate(() => new URL(location.href).searchParams.has('room')), true);
    await page.evaluate(() => {
      const { menu, starts } = globalThis.__ROOM_ERRORS;
      starts[0].session.close('rtc_recovery_exhausted');
      menu.detachActiveRoom();
      menu.showRoomFailure('rtc_recovery_exhausted', 'lan');
    });
    await waitFailure(page, 'rtc_recovery_exhausted');
    assert.equal(await page.$eval('.cot-play', node => node.classList.contains('show')), true);
    assert.equal(await page.$eval('.room', node => node.getAttribute('aria-busy')), 'false');
    assert.equal(await page.evaluate(() => ['room', 'mode', 'host']
      .some(key => new URL(location.href).searchParams.has(key))), false,
    'frame cleanup removes the expired durable invite URL');
    assert.equal(await page.$eval('.cot-play', node => node.classList.contains('invite-entry')), false);
    assert.deepEqual(await page.evaluate(() => globalThis.__ROOM_ERRORS.closed), ['host_left'],
      'frame-owned intentional close does not invoke the menu terminal callback');

    // A late detach from the old round cannot retire the next waiting lobby.
    await page.click('[data-action="create"]');
    await page.waitForSelector('.lobby.show .player', { timeout: 10_000 });
    const replacementCode = await page.$eval('.lobby .code', node => node.textContent);
    await page.evaluate(() => {
      const { menu } = globalThis.__ROOM_ERRORS;
      menu.detachActiveRoom();
      menu.showRoomFailure('host_left', 'private');
    });
    assert.equal(await page.$eval('.lobby .code', node => node.textContent), replacementCode);
    assert.equal(await page.evaluate(() => new URL(location.href).searchParams.get('room')), replacementCode,
      'late old cleanup leaves the replacement invite URL intact');
    assert.equal(await page.$eval('.mode.on', node => node.dataset.mode), 'lan');
    assert.equal(await page.$eval('.room-failure', node => node.hidden), true);
    await page.click('[data-action="ready"]');
    await page.waitForFunction(() => !document.querySelector('[data-action="start"]').disabled);
    await page.click('[data-action="start"]');
    await page.waitForFunction(() => globalThis.__ROOM_ERRORS.starts.length === 2);
    await page.evaluate(() => {
      const { menu, starts } = globalThis.__ROOM_ERRORS;
      const request = starts[1];
      menu.attachActiveRoom({ state: request.lobbyState, role: request.role,
        playerId: request.session.roomInfo.peerId,
        command: command => request.session.command(command),
        leave: reason => request.session.close(reason) });
      request.session.close('rtc_recovery_exhausted');
      menu.detachActiveRoom();
      menu.showRoomFailure('rtc_recovery_exhausted', 'lan');
    });
    await waitFailure(page, 'rtc_recovery_exhausted');
    assert.equal(await page.evaluate(() => ['room', 'mode', 'host']
      .some(key => new URL(location.href).searchParams.has(key))), false);
    assert.equal(await page.$eval('.cot-play', node => node.classList.contains('invite-entry')), false);
    assert.deepEqual(await page.evaluate(() => globalThis.__ROOM_ERRORS.closed), ['host_left'],
      'already-retained room frame cleanup also leaves error presentation to the parent');
    await page.click('[data-room-failure="garage"]');
    assert.equal(await page.$eval('.cot-play', node => node.classList.contains('show')), false);

    for (const state of ['reconnecting', 'failed', 'connected', 'reconnected']) {
      await page.evaluate(value => globalThis.__ROOM_ERRORS.status.set({ state: value, attempt: 2,
        reason: value === 'failed' ? 'rtc_recovery_exhausted' : 'authority_stalled' }), state);
      const exitVisible = state === 'reconnecting' || state === 'failed';
      assert.equal(await page.$eval('.cot-network-status button', node => !node.hidden), exitVisible);
      if (exitVisible) {
        const bounds = await page.$eval('.cot-network-status', node => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: innerWidth, overflow: node.scrollWidth > node.clientWidth };
        });
        assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && !bounds.overflow);
        await page.click('.cot-network-status button');
      }
    }
    assert.equal(await page.evaluate(() => globalThis.__ROOM_ERRORS.exits), 2);
    reports.push({ viewport: name, modes: ['solo', 'private', 'lan'], terminalNoAutoRetry: true,
      nativeFailureRetryAndClose: true, lateFailureFenced: true, keyboardActions: true,
      nativeFrameCloseBeforeAttach: true, retainedFrameClose: true, replacementDetachFenced: true,
      networkStatusExit: true, layout });
    await page.evaluate(() => {
      const { menu, status, responsive } = globalThis.__ROOM_ERRORS;
      menu.dispose(); status.dispose(); responsive.destroy();
    });
    await context.close();
  }
  assert.deepEqual(pageErrors, []);
  const report = { ok: true, functionalOnly: true, signalingFaultInjection: true, reports, pageErrors };
  await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  releaseDelayed?.();
  if (browser) await browser.close().catch(() => {});
  await signaling.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
