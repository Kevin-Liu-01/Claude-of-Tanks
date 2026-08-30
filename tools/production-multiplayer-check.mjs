import { pathToFileURL } from 'node:url';

function turnUrls(servers) {
  const urls = [];
  for (const server of servers || []) {
    const values = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    for (const value of values) {
      if (typeof value === 'string' && /^turns?:/i.test(value)) urls.push(value);
    }
  }
  return urls;
}

async function fetchJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  let body = null;
  try { body = await response.json(); } catch (_) { /* diagnosed below */ }
  if (!response.ok) {
    const error = new Error(`${label} returned HTTP ${response.status}`);
    error.code = `${label}_http_${response.status}`;
    error.detail = body?.error || null;
    throw error;
  }
  if (!body || typeof body !== 'object') {
    const error = new Error(`${label} returned invalid JSON`);
    error.code = `${label}_invalid_json`;
    throw error;
  }
  return body;
}

function validateSignaling(signal) {
  if (signal.ok !== true || signal.distributed !== true || signal.redis?.ok !== true ||
      signal.redis?.command !== 'ready' || signal.redis?.subscriber !== 'ready') {
    const error = new Error('distributed signaling is not fully ready');
    error.code = 'signal_not_ready';
    throw error;
  }
  return signal;
}

function validateIce(ice) {
  const relays = turnUrls(ice.iceServers);
  if (!relays.length) {
    const error = new Error('ICE response has no TURN relay');
    error.code = 'turn_relay_missing';
    throw error;
  }
  return { ice, relays };
}

function failureRecord(reason) {
  return {
    code: reason?.code || 'dependency_check_failed',
    message: reason?.message || String(reason),
    detail: reason?.detail || null,
  };
}

/** Prove the two production dependencies required by a first-time friend join. */
export async function checkProductionMultiplayer({
  baseUrl = 'https://cot.kevinliu.studio',
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const base = new URL(baseUrl);
  const origin = base.origin;
  const signalUrl = new URL('/api/signal', base);
  const iceUrl = new URL('/api/ice', base);
  const request = (url) => fetchJson(fetchImpl, url, {
    headers: { origin },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  }, url.pathname === '/api/signal' ? 'signal' : 'ice');
  const [signalResult, iceResult] = await Promise.allSettled([
    request(signalUrl).then(validateSignaling),
    request(iceUrl).then(validateIce),
  ]);
  const dependencies = {
    signal: signalResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, ...failureRecord(signalResult.reason) },
    ice: iceResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, ...failureRecord(iceResult.reason) },
  };
  const failures = [signalResult, iceResult].filter((result) => result.status === 'rejected');
  if (failures.length === 1) {
    const error = failures[0].reason;
    error.dependencies = dependencies;
    throw error;
  }
  if (failures.length > 1) {
    const error = new Error('signaling and TURN dependency checks both failed');
    error.code = 'production_dependencies_failed';
    error.detail = dependencies;
    error.dependencies = dependencies;
    throw error;
  }
  const { ice, relays } = iceResult.value;
  return {
    ok: true,
    origin,
    signaling: 'distributed-ready',
    relayCount: relays.length,
    secureRelayCount: relays.filter((url) => /^turns:/i.test(url)).length,
    expiresInSeconds: Number.isFinite(ice.expiresInSeconds)
      ? Number(ice.expiresInSeconds) : null,
  };
}

/**
 * Prove that a pristine browser can turn the issued credentials into an
 * actual relay candidate. URL validation alone cannot detect expired,
 * revoked, unreachable, or provider-rejected TURN credentials.
 */
export async function verifyProductionTurnAllocation({
  baseUrl = 'https://cot.kevinliu.studio',
  timeoutMs = 15_000,
  launchBrowser = null,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('TURN allocation timeout must be positive');
  }
  const launch = launchBrowser || (async () => {
    const { default: puppeteer } = await import('puppeteer');
    return puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });
  const browser = await launch();
  let context = null;
  try {
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setCacheEnabled?.(false);
    const probeUrl = new URL('/robots.txt?cot-turn-allocation-probe=1', baseUrl).href;
    await page.goto(probeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    const receipt = await page.evaluate(async (allocationTimeoutMs) => {
      const response = await fetch('/api/ice', { cache: 'no-store' });
      if (!response.ok) throw new Error(`ICE endpoint returned HTTP ${response.status}`);
      const config = await response.json();
      if (!Array.isArray(config?.iceServers)) {
        throw new Error('ICE endpoint returned no server list');
      }

      const peer = new RTCPeerConnection({
        iceServers: config.iceServers,
        iceTransportPolicy: 'relay',
      });
      const protocols = new Set();
      let relayCandidateCount = 0;
      let gatheringTimer = 0;
      try {
        const gathering = new Promise((resolve, reject) => {
          gatheringTimer = setTimeout(() => reject(new Error('TURN allocation timed out')),
            allocationTimeoutMs);
          peer.addEventListener('icecandidate', (event) => {
            const candidate = event.candidate;
            if (!candidate) {
              clearTimeout(gatheringTimer);
              resolve(undefined);
              return;
            }
            if (candidate.type !== 'relay') return;
            relayCandidateCount++;
            if (candidate.protocol) protocols.add(candidate.protocol);
          });
        });
        peer.createDataChannel('cot-turn-allocation-probe');
        await peer.setLocalDescription(await peer.createOffer());
        await gathering;
      } finally {
        clearTimeout(gatheringTimer);
        peer.close();
      }
      if (relayCandidateCount < 1) throw new Error('TURN returned no relay candidate');
      return {
        relayCandidateCount,
        protocols: [...protocols].sort(),
      };
    }, timeoutMs);
    if (!receipt || !Number.isInteger(receipt.relayCandidateCount) ||
        receipt.relayCandidateCount < 1 || !Array.isArray(receipt.protocols)) {
      throw new Error('browser returned an invalid TURN allocation receipt');
    }
    return {
      ok: true,
      relayCandidateCount: receipt.relayCandidateCount,
      protocols: receipt.protocols.map(String),
      pristineBrowserContext: true,
    };
  } catch (error) {
    const wrapped = new Error(`production TURN allocation failed: ${error?.message || error}`);
    wrapped.code = 'turn_allocation_failed';
    throw wrapped;
  } finally {
    await context?.close?.().catch(() => {});
    await browser?.close?.().catch(() => {});
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const baseUrl = process.argv.find((arg) => arg.startsWith('--url='))?.slice(6)
    || 'https://cot.kevinliu.studio';
  let dependencyReceipt = null;
  try {
    dependencyReceipt = await checkProductionMultiplayer({ baseUrl });
    const allocation = process.argv.includes('--dependency-only')
      ? null
      : await verifyProductionTurnAllocation({ baseUrl });
    console.log(JSON.stringify({
      ...dependencyReceipt,
      ...(allocation ? { allocation } : {}),
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error?.code || 'production_multiplayer_check_failed',
      message: error?.message || String(error),
      detail: error?.detail || null,
      dependencies: error?.dependencies || (dependencyReceipt ? {
        signal: { ok: true },
        ice: { ok: true },
      } : null),
    }, null, 2));
    process.exitCode = 1;
  }
}
