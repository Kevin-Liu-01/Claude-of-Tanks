import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

function explicitOrigin(value, label) {
  let url;
  try { url = new URL(value); } catch (_) { throw new TypeError(`${label} requires an explicit HTTP(S) origin`); }
  if (!['https:', 'http:'].includes(url.protocol) || url.pathname !== '/' ||
      url.username || url.password || url.search || url.hash) {
    throw new TypeError(`${label} requires a credential-free HTTP(S) origin without a path`);
  }
  return url;
}

export function roomWebRtcEndpoints({ baseUrl, backendUrl, timeoutMs = 45_000 } = {}) {
  const frontend = explicitOrigin(baseUrl, 'frontend');
  const backend = explicitOrigin(backendUrl, 'backend');
  if (frontend.protocol === 'https:' && backend.protocol !== 'https:') {
    throw new TypeError('HTTPS frontends require an HTTPS signaling backend');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new TypeError('timeout must be an integer from 1000 through 120000 ms');
  }
  const signaling = new URL('/rooms', backend);
  signaling.protocol = backend.protocol === 'https:' ? 'wss:' : 'ws:';
  return { origin: frontend.origin, signaling: signaling.href, timeoutMs,
    page: new URL('/robots.txt?cot-room-webrtc-probe=1', frontend).href,
    ice: new URL('/api/ice', frontend).href };
}

function probeFailure(stage) {
  return Object.assign(new Error('production room WebRTC peer-pair check failed'), {
    code: 'room_webrtc_probe_failed', stage,
  });
}

function deadline(promise, timeoutMs, stage) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(probeFailure(stage)), Math.max(1, timeoutMs));
  })]).finally(() => clearTimeout(timer));
}

/** Runs inside each separate browser context; credentials never return to Node. */
export async function installBrowserPeer({ endpoint, role, timeoutMs }) {
  const response = await fetch(endpoint, { cache: 'no-store', credentials: 'include',
    signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error('ICE endpoint failed');
  const config = await response.json();
  if (!Array.isArray(config?.iceServers) || !config.iceServers.some((server) =>
    (Array.isArray(server?.urls) ? server.urls : [server?.urls])
      .some((url) => typeof url === 'string' && /^turns?:/i.test(url)))) {
    throw new Error('ICE endpoint has no TURN service');
  }
  const peer = new RTCPeerConnection({ iceServers: config.iceServers, iceTransportPolicy: 'relay' });
  const state = { peer, channel: null, pendingIce: [], received: [], failed: false,
    offered: false, answered: false, relayedIce: 0 };
  globalThis.__cotRoomWebRtcProbe = state;
  const attach = (channel) => {
    state.channel = channel;
    channel.onmessage = (event) => {
      if (typeof event.data === 'string' && event.data.length <= 64 && state.received.length < 4) {
        state.received.push(event.data);
      }
    };
    channel.onerror = () => { state.failed = true; };
  };
  peer.onicecandidate = (event) => {
    if (!event.candidate) return;
    globalThis.__cotRoomRelay({ kind: 'ice', candidate: event.candidate.toJSON() })
      .catch(() => { state.failed = true; });
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed') state.failed = true;
  };
  peer.ondatachannel = (event) => attach(event.channel);
  if (role === 'host') attach(peer.createDataChannel('cot-production-room-probe', { ordered: true }));
}

export async function receiveBrowserSignal(signal) {
  const state = globalThis.__cotRoomWebRtcProbe;
  const peer = state.peer;
  if (signal.kind === 'ice') {
    state.relayedIce++;
    if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
    else state.pendingIce.push(signal.candidate);
    return null;
  }
  if (signal.kind !== 'description') throw new Error('unexpected probe signal');
  await peer.setRemoteDescription(signal.description);
  for (const candidate of state.pendingIce.splice(0)) await peer.addIceCandidate(candidate);
  if (signal.description.type === 'offer') {
    state.offered = true;
    await peer.setLocalDescription(await peer.createAnswer());
    return { kind: 'description', description: peer.localDescription.toJSON() };
  }
  if (signal.description.type !== 'answer') throw new Error('unexpected probe description');
  state.answered = true;
  return null;
}

export async function createBrowserOffer() {
  const peer = globalThis.__cotRoomWebRtcProbe.peer;
  await peer.setLocalDescription(await peer.createOffer());
  return { kind: 'description', description: peer.localDescription.toJSON() };
}

export async function browserPeerReceipt() {
  const state = globalThis.__cotRoomWebRtcProbe;
  const stats = await state.peer.getStats();
  let selected;
  for (const item of stats.values()) {
    if (item.type === 'transport' && item.selectedCandidatePairId) {
      selected = stats.get(item.selectedCandidatePairId);
      break;
    }
  }
  if (!selected) {
    selected = [...stats.values()].find((item) => item.type === 'candidate-pair' &&
      item.state === 'succeeded' && item.nominated);
  }
  const local = stats.get(selected?.localCandidateId);
  const remote = stats.get(selected?.remoteCandidateId);
  // Deliberately project primitives: no stats objects, ICE addresses, SDP or credentials.
  return { policy: state.peer.getConfiguration().iceTransportPolicy,
    connected: state.peer.connectionState === 'connected',
    channelOpen: state.channel?.readyState === 'open', failed: state.failed,
    localCandidateType: local?.candidateType, remoteCandidateType: remote?.candidateType,
    protocol: ['udp', 'tcp'].includes(local?.protocol) ? local.protocol : null,
    received: state.received.slice(), offered: state.offered, answered: state.answered,
    relayedIce: state.relayedIce };
}

export function validatePeerPairReceipts(host, guest) {
  for (const [receipt, payload] of [[host, 'cot-probe-guest-to-host'], [guest, 'cot-probe-host-to-guest']]) {
    if (receipt?.policy !== 'relay' || receipt.connected !== true || receipt.channelOpen !== true ||
        receipt.failed !== false || receipt.localCandidateType !== 'relay' ||
        receipt.remoteCandidateType !== 'relay' || !receipt.received?.includes(payload) ||
        !Number.isSafeInteger(receipt.relayedIce) || receipt.relayedIce < 1) {
      throw probeFailure('selected_relay_pair');
    }
  }
  if (host.answered !== true || guest.offered !== true) throw probeFailure('negotiation_receipt');
  return [host, guest].map((receipt, index) => ({ role: index ? 'guest' : 'host',
    iceTransportPolicy: 'relay', localCandidateType: 'relay', remoteCandidateType: 'relay',
    protocol: ['udp', 'tcp'].includes(receipt.protocol) ? receipt.protocol : null,
    receivedPayload: true, relayedIce: receipt.relayedIce }));
}

function waitForRoomClosed(guest, host, timeoutMs) {
  let unsubscribe;
  return deadline(new Promise((resolve, reject) => {
    unsubscribe = guest.onEvent((event) => {
      if (event.type === 'room_closed' && event.payload?.reason === 'host_left') resolve(true);
    });
    try { host.close('turn_pair_probe_complete'); } catch (_) { reject(probeFailure('room_close')); }
  }), timeoutMs, 'room_close').finally(() => unsubscribe?.());
}

async function signalingOwners(endpoints) {
  const [{ WebSocket }, { RoomSignalingClient }] = await Promise.all([
    import('ws'), import('../src/net/signalingClient.ts'),
  ]);
  const sockets = [];
  class OriginSocket extends WebSocket {
    constructor(url) {
      super(url, { origin: endpoints.origin, handshakeTimeout: Math.min(endpoints.timeoutMs, 10_000) });
      this.on('error', () => {});
      sockets.push(this);
    }
  }
  const clients = Array.from({ length: 2 }, () => new RoomSignalingClient({
    url: endpoints.signaling, WebSocketImpl: OriginSocket, resumeStorage: null,
    connectTimeoutMs: Math.min(endpoints.timeoutMs, 10_000),
    requestTimeoutMs: Math.min(endpoints.timeoutMs, 10_000),
  }));
  return { clients, sockets };
}

function sendSignal(sender, receiver, signal) {
  if (!sender.sendSignal(receiver.peerId, signal, receiver.sessionId)) throw probeFailure('signal_send');
}

function connectSignalReceiver(receiver, sender, page, fail) {
  let queue = Promise.resolve();
  return receiver.onEvent((event) => {
    if (event.type !== 'room_signal') return;
    const payload = event.payload;
    if (payload?.fromPeerId !== sender.peerId || payload.fromSessionId !== sender.sessionId ||
        payload.toSessionId !== receiver.sessionId) return;
    queue = queue.then(async () => {
      const answer = await page.evaluate(receiveBrowserSignal, payload.signal);
      if (answer) sendSignal(receiver, sender, answer);
    }).catch(fail);
  });
}

async function createProbePage(browser, endpoints, role, client, remote, owners) {
  const context = await browser.createBrowserContext();
  owners.contexts.push(context);
  const page = await context.newPage();
  owners.pages.push(page);
  await page.setCacheEnabled(false);
  await page.goto(endpoints.page, { waitUntil: 'domcontentloaded', timeout: endpoints.timeoutMs });
  if (new URL(page.url()).origin !== endpoints.origin) throw probeFailure('frontend_origin');
  await page.exposeFunction('__cotRoomRelay', (signal) => sendSignal(client, remote, signal));
  await page.evaluate(installBrowserPeer, { endpoint: endpoints.ice, role, timeoutMs: endpoints.timeoutMs });
  return page;
}

async function waitForOpen(page, timeoutMs) {
  await page.waitForFunction(() => {
    const state = globalThis.__cotRoomWebRtcProbe;
    return state?.failed || state?.channel?.readyState === 'open';
  }, { timeout: timeoutMs, polling: 50 });
  if (await page.evaluate(() => globalThis.__cotRoomWebRtcProbe.failed)) throw probeFailure('data_channel');
}

async function exchangePayload(page, payload, expected, timeoutMs) {
  await page.evaluate((value) => globalThis.__cotRoomWebRtcProbe.channel.send(value), payload);
  await page.waitForFunction((value) => globalThis.__cotRoomWebRtcProbe.received.includes(value),
    { timeout: timeoutMs, polling: 50 }, expected);
}

async function closeSocket(socket) {
  if (socket.readyState === 3) return true;
  let closed;
  try {
    await deadline(new Promise((resolve) => {
      closed = resolve;
      socket.once('close', resolve);
    }), 1_000, 'socket_cleanup');
    return true;
  } catch (_) {
    socket.terminate();
    return false;
  } finally { socket.off('close', closed); }
}

export async function cleanupPeerProbe(owners) {
  for (const unsubscribe of owners.unsubscribe) unsubscribe();
  for (const client of [...owners.clients].reverse()) {
    try { client.close('turn_pair_probe_cleanup'); } catch (_) { /* Still close native owners below. */ }
  }
  const sockets = await Promise.all(owners.sockets.map(closeSocket));
  await Promise.all(owners.pages.map((page) => deadline(page.evaluate(() => {
    globalThis.__cotRoomWebRtcProbe?.peer.close();
    delete globalThis.__cotRoomWebRtcProbe;
  }), 1_000, 'peer_cleanup').catch(() => {})));
  let browserClosed = !owners.browser;
  if (owners.browser) {
    try {
      await deadline(owners.browser.close(), 5_000, 'browser_cleanup');
      browserClosed = true;
    } catch (_) { owners.browser.process()?.kill('SIGKILL'); }
  }
  return { signalingSocketsClosed: sockets.every(Boolean), browserClosed };
}

/** Explicit scoped production write probe. Never run on import or select default production URLs. */
export async function verifyProductionRoomWebRtc({ baseUrl, backendUrl, timeoutMs = 45_000,
  launchBrowser = null } = {}) {
  const endpoints = roomWebRtcEndpoints({ baseUrl, backendUrl, timeoutMs });
  const owners = { ...await signalingOwners(endpoints), browser: null, contexts: [], pages: [], unsubscribe: [] };
  const started = performance.now();
  const remaining = () => Math.max(1, timeoutMs - (performance.now() - started));
  let stage = 'browser_launch';
  let receipt;
  let failure;
  let rejectRelay;
  const relayFailure = new Promise((_, reject) => { rejectRelay = reject; });
  relayFailure.catch(() => {});
  const run = (promise) => deadline(Promise.race([promise, relayFailure]), remaining(), stage);
  try {
    const launch = launchBrowser || (async () => {
      const { default: puppeteer } = await import('puppeteer');
      return puppeteer.launch({ headless: true, timeout: Math.min(timeoutMs, 30_000),
        args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    });
    // Puppeteer's native launch timeout owns cleanup before a browser handle exists.
    owners.browser = await launch();
    stage = 'room_create_join';
    const [host, guest] = owners.clients;
    const nonce = randomBytes(8).toString('hex');
    const room = await run(host.createRoom({ maxPlayers: 2, mode: 'private',
      player: { id: `turn_probe_h_${nonce}`, name: 'TURN Probe Host' } }));
    const joined = await run(guest.joinRoom({ roomCode: room.roomCode,
      player: { id: `turn_probe_g_${nonce}`, name: 'TURN Probe Guest' } }));
    if (joined.roomCode !== room.roomCode || joined.hostId !== room.hostId ||
        joined.peerId === room.peerId) throw probeFailure(stage);
    stage = 'browser_ice_setup';
    const hostPage = await run(createProbePage(owners.browser, endpoints, 'host', host, guest, owners));
    const guestPage = await run(createProbePage(owners.browser, endpoints, 'guest', guest, host, owners));
    const fail = () => rejectRelay(probeFailure('signal_receive'));
    owners.unsubscribe.push(connectSignalReceiver(host, guest, hostPage, fail),
      connectSignalReceiver(guest, host, guestPage, fail));
    stage = 'worker_offer_answer_ice';
    sendSignal(host, guest, await run(hostPage.evaluate(createBrowserOffer)));
    await run(Promise.all([waitForOpen(hostPage, remaining()), waitForOpen(guestPage, remaining())]));
    stage = 'bidirectional_payload';
    await run(Promise.all([
      exchangePayload(hostPage, 'cot-probe-host-to-guest', 'cot-probe-guest-to-host', remaining()),
      exchangePayload(guestPage, 'cot-probe-guest-to-host', 'cot-probe-host-to-guest', remaining()),
    ]));
    stage = 'selected_relay_pair';
    const pair = await run(Promise.all(owners.pages.map((page) => page.evaluate(browserPeerReceipt))));
    const peers = validatePeerPairReceipts(...pair);
    stage = 'room_close';
    await run(waitForRoomClosed(guest, host, remaining()));
    receipt = { ok: true, signaling: 'cloudflare-room-worker', freshBrowserContexts: 2,
      negotiationThroughSignaling: true, bidirectionalPayload: true, roomClosed: true, peers };
  } catch (_) { failure = probeFailure(stage); }
  const cleanup = await cleanupPeerProbe(owners);
  if (failure) throw Object.assign(failure, { cleanup });
  if (!cleanup.signalingSocketsClosed || !cleanup.browserClosed) {
    throw Object.assign(probeFailure('cleanup'), { cleanup });
  }
  return { ...receipt, cleanup };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (process.argv.includes('--help')) {
    console.log('Usage: node tools/production-room-webrtc-check.mjs --url=https://FRONTEND --backend-url=https://WORKER [--timeout-ms=45000]');
  } else {
    try {
      const receipt = await verifyProductionRoomWebRtc({ baseUrl: option('url'), backendUrl: option('backend-url'),
        timeoutMs: option('timeout-ms') === undefined ? 45_000 : Number(option('timeout-ms')) });
      console.log(JSON.stringify(receipt, null, 2));
    } catch (error) {
      // Never echo arbitrary provider/Chromium/WebSocket errors or input URLs.
      console.error(JSON.stringify({ ok: false, code: 'room_webrtc_probe_failed',
        stage: error?.stage || 'configuration', cleanup: error?.cleanup || null }, null, 2));
      process.exitCode = 1;
    }
  }
}
