/** Optional production QA observers. Never change ICE policy, packets, or simulation state. */
export function installFeedbackPeerObserver() {
  if (window.__COT_FEEDBACK_NETWORK) return;
  const peers = new Set();
  const channels = new WeakSet();
  const state = { peers, onAuthority: null, failures: 0 };
  window.__COT_FEEDBACK_NETWORK = state;
  function observeChannel(channel) {
    if (channels.has(channel) || channel.label !== 'cot-match-v1') return;
    channels.add(channel);
    channel.addEventListener('message', (event) => {
      if (!state.onAuthority || typeof event.data !== 'string' || event.data.length > 262144) return;
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      if (message.type !== 'event' || !Array.isArray(message.payload?.events)) return;
      const id = window.__DEBUG?.game?.player?.id;
      for (const shot of message.payload.events.slice(0, 256)) {
        if (shot.type === 'shell_fired' && shot.shooterId === id) {
          state.onAuthority(shot.shellId, performance.now());
        }
      }
    });
  }
  function observe(peer) {
    if (peers.size >= 16) { state.failures++; return; }
    peers.add(peer);
    peer.addEventListener('connectionstatechange', () => {
      if (peer.connectionState === 'closed') peers.delete(peer);
    });
    peer.addEventListener('datachannel', (event) => observeChannel(event.channel));
    const create = peer.createDataChannel;
    peer.createDataChannel = function (...args) {
      const channel = Reflect.apply(create, this, args);
      observeChannel(channel);
      return channel;
    };
  }
  const NativePeer = window.RTCPeerConnection;
  window.RTCPeerConnection = new Proxy(NativePeer, {
    construct(target, args, newTarget) {
      const peer = Reflect.construct(target, args, newTarget);
      observe(peer);
      return peer;
    },
  });
}

/** STUN/consent RTT, not SCTP gameplay RTT. No addresses, credentials, or IDs leave the page. */
export async function readFeedbackIceStats() {
  const output = [];
  for (const peer of window.__COT_FEEDBACK_NETWORK?.peers || []) {
    if (peer.connectionState !== 'connected') continue;
    try {
      const stats = await peer.getStats();
      let pair;
      for (const entry of stats.values()) {
        if (entry.type === 'transport' && entry.selectedCandidatePairId) {
          pair = stats.get(entry.selectedCandidatePairId);
          break;
        }
      }
      if (!pair) continue;
      const local = stats.get(pair.localCandidateId);
      const remote = stats.get(pair.remoteCandidateId);
      const candidate = (value) => ['host', 'srflx', 'prflx', 'relay'].includes(value) ? value : null;
      output.push({ localType: candidate(local?.candidateType), remoteType: candidate(remote?.candidateType),
        protocol: ['udp', 'tcp'].includes(local?.protocol) ? local.protocol : null,
        relayProtocol: ['udp', 'tcp', 'tls'].includes(local?.relayProtocol) ? local.relayProtocol : null,
        stunRttMs: Number.isFinite(pair.currentRoundTripTime) ? pair.currentRoundTripTime * 1000 : null });
    } catch (_) { window.__COT_FEEDBACK_NETWORK.failures++; }
  }
  return output;
}

export function startFeedbackSample() {
  const debug = window.__DEBUG;
  const trace = window.__QA_TRACE;
  if (!debug?.input?.onAction || !debug.bus?.on || !trace?.enabled) throw new Error('feedback_qa_unavailable');
  window.__COT_FEEDBACK_SAMPLE?.dispose();
  const sample = { started: performance.now(), traceStart: trace.stats().durationMs, actions: [],
    shots: [], predicted: [], authority: new Map(), diagnostics: [], ice: [], rafs: new Set(), disposed: false };
  const active = () => !document.hidden && document.hasFocus() && debug.game.phase === 'battle' &&
    debug.game.preBattleS <= 0 && !debug.game.result;
  const numeric = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const project = (source, keys) => Object.fromEntries(keys.map((key) => [key, numeric(source?.[key])]));
  function diagnostics() {
    if (!active() || sample.diagnostics.length >= 200) return;
    const net = debug.network;
    sample.diagnostics.push({ at: performance.now() - sample.started,
      ...project(net, ['rttMs', 'rttJitterMs', 'transportBufferedBytes', 'pendingEventBatches', 'inputAckLag',
        'snapshotPacketsReceived', 'estimatedMissingSnapshots', 'inputPacketsSubmitted']),
      ...project(net?.prediction, ['reconciliations', 'hardSnaps', 'droppedHistory', 'lastPositionErrorM',
        'maxPositionErrorM', 'maxCorrectionStepM', 'maxVerticalCorrectionStepM']),
      presentationPending: numeric(debug.networkPresentation?.pending) });
  }
  const offInput = debug.input.onAction('fire', () => {
    if (!active() || sample.actions.length >= 128) return;
    sample.actions.push({ at: performance.now(), ready: debug.game.player?.combat?.reload?.t <= 0,
      matched: false, ambiguous: false });
  });
  function feedback(event, target) {
    if (!active() || target.length >= 128 || !event.isPlayer) return;
    const at = performance.now();
    const candidates = sample.actions.filter((action) => !action.matched && action.ready && at - action.at <= 2000);
    if (candidates.length !== 1) {
      for (const action of candidates) action.ambiguous = true;
      return;
    }
    const action = candidates[0];
    if (target === sample.shots) action.matched = true;
    const receivedAt = sample.authority.get(event.shellId);
    const row = { inputToFeedbackMs: at - action.at, inputToNextRafMs: null,
      predictionSuppressed: target === sample.shots && event.feedbackPredicted === true,
      authorityToFeedbackMs: Number.isFinite(receivedAt) ? at - receivedAt : null };
    target.push(row);
    const raf = requestAnimationFrame(() => {
      sample.rafs.delete(raf);
      if (active()) row.inputToNextRafMs = performance.now() - action.at;
    });
    sample.rafs.add(raf);
  }
  const offShot = debug.bus.on('shell:fired', (event) => feedback(event, sample.shots));
  const offPredicted = debug.bus.on('weapon:predicted', (event) => feedback(event, sample.predicted));
  if (window.__COT_FEEDBACK_NETWORK) {
    window.__COT_FEEDBACK_NETWORK.onAuthority = (id, at) => {
      if (sample.authority.size < 128) sample.authority.set(id, at);
    };
  }
  const timer = setInterval(diagnostics, 200);
  diagnostics();
  sample.dispose = () => {
    if (sample.disposed) return;
    sample.disposed = true;
    clearInterval(timer);
    offInput(); offShot(); offPredicted();
    for (const raf of sample.rafs) cancelAnimationFrame(raf);
    if (window.__COT_FEEDBACK_NETWORK) window.__COT_FEEDBACK_NETWORK.onAuthority = null;
  };
  window.__COT_FEEDBACK_SAMPLE = sample;
}

/** Export only numeric measurements and closed enums, never raw bus/trace/RTC objects. */
export function stopFeedbackSample() {
  const sample = window.__COT_FEEDBACK_SAMPLE;
  if (!sample) throw new Error('feedback_sample_missing');
  sample.dispose();
  const trace = window.__QA_TRACE.snapshot({ gpu: false, events: false });
  const index = (key) => trace.frameSchema.indexOf(key);
  const frames = trace.frames.filter((row) => row[index('tMs')] >= sample.traceStart &&
    row[index('phase')] === 'battle' && row[index('preBattleS')] <= 0 &&
    (row[index('flags')] & 127) === 0);
  const result = { durationMs: performance.now() - sample.started,
    actions: sample.actions.map(({ ready, matched, ambiguous }) => ({ ready, matched, ambiguous })),
    shots: sample.shots, predicted: sample.predicted, diagnostics: sample.diagnostics,
    gapsMs: frames.map((row) => row[index('gapMs')]),
    traceFramesDropped: trace.stats.framesDropped,
    observerFailures: window.__COT_FEEDBACK_NETWORK?.failures || 0 };
  delete window.__COT_FEEDBACK_SAMPLE;
  return result;
}

export function metricDistribution(values) {
  const sorted = values.filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const percentile = (fraction) => sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
  return { count: sorted.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99),
    max: sorted.at(-1) ?? null };
}

export function summarizeFeedbackSample(raw, ice = []) {
  const samples = Array.isArray(raw.diagnostics) ? raw.diagnostics : [];
  const distribution = (key) => metricDistribution(samples.map((row) => row[key]));
  const delta = (key) => {
    const first = samples[0]?.[key];
    const last = samples.at(-1)?.[key];
    return Number.isFinite(first) && Number.isFinite(last) && last >= first ? last - first : null;
  };
  const shots = (rows) => ({ count: rows.length,
    predictionSuppressedCount: rows.filter((row) => row.predictionSuppressed === true).length,
    inputToConfirmedCallbackMs: metricDistribution(rows.map((row) => row.inputToFeedbackMs)),
    inputToNextRafCallbackMs: metricDistribution(rows.map((row) => row.inputToNextRafMs)),
    authorityReceiptToCallbackMs: metricDistribution(rows.map((row) => row.authorityToFeedbackMs)) });
  const path = (row) => ['host', 'srflx', 'prflx', 'relay'].includes(row) ? row : null;
  return { durationMs: Number.isFinite(raw.durationMs) ? raw.durationMs : null,
    frameGapMs: metricDistribution(raw.gapsMs || []),
    firing: { attempts: raw.actions?.length || 0,
      readyAttempts: raw.actions?.filter((row) => row.ready === true).length || 0,
      unmatchedReadyAttempts: raw.actions?.filter((row) => row.ready === true && row.matched !== true).length || 0,
      ambiguousAttempts: raw.actions?.filter((row) => row.ambiguous === true).length || 0,
      confirmed: shots(raw.shots || []), predicted: shots(raw.predicted || []) },
    applicationSmoothedRttMs: distribution('rttMs'), applicationRttJitterMs: distribution('rttJitterMs'),
    bufferedBytes: distribution('transportBufferedBytes'), pendingEventBatches: distribution('pendingEventBatches'),
    inputAckLag: distribution('inputAckLag'), sampledPositionErrorM: distribution('lastPositionErrorM'),
    cumulativeCorrectionStepMaxM: distribution('maxCorrectionStepM').max,
    cumulativeVerticalCorrectionStepMaxM: distribution('maxVerticalCorrectionStepM').max,
    hardSnaps: delta('hardSnaps'), reconciliations: delta('reconciliations'), droppedHistory: delta('droppedHistory'),
    snapshotPackets: delta('snapshotPacketsReceived'), inputPackets: delta('inputPacketsSubmitted'),
    missingSnapshotEstimate: delta('estimatedMissingSnapshots'),
    ice: { stunRttMs: metricDistribution(ice.map((row) => row.stunRttMs)),
      paths: [...new Set(ice.map((row) => JSON.stringify({ localType: path(row.localType),
        remoteType: path(row.remoteType), protocol: ['udp', 'tcp'].includes(row.protocol) ? row.protocol : null,
        relayProtocol: ['udp', 'tcp', 'tls'].includes(row.relayProtocol) ? row.relayProtocol : null })))].map(JSON.parse) },
    traceFramesDropped: Number.isFinite(raw.traceFramesDropped) ? raw.traceFramesDropped : null,
    observerFailures: Number.isFinite(raw.observerFailures) ? raw.observerFailures : null };
}

export async function measureNativeFeedback(page, durationMs = 20_000) {
  await page.bringToFront();
  await page.waitForFunction(() => window.__DEBUG?.game?.preBattleS <= 0 && !window.__DEBUG?.game?.result);
  await page.evaluate(startFeedbackSample);
  const ice = [];
  const started = performance.now();
  try {
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    while (performance.now() - started < durationMs) {
      const ready = await page.evaluate(() => window.__DEBUG.game.player?.combat?.reload?.t <= 0 &&
        !window.__DEBUG.game.player?.combat?.destroyed);
      if (ready) {
        // Trusted canvas input: no debug fire, reload, ammo or authority mutation.
        const canvas = await page.$('canvas');
        const box = await canvas?.boundingBox();
        if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await canvas?.dispose();
      }
      ice.push(...await page.evaluate(readFeedbackIceStats));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const result = summarizeFeedbackSample(await page.evaluate(stopFeedbackSample), ice);
    if (result.firing.predicted.count !== result.firing.confirmed.predictionSuppressedCount) {
      throw new Error('predicted_feedback_confirmation_mismatch');
    }
    return result;
  } finally {
    await page.keyboard.up('w').catch(() => {});
    await page.keyboard.up('d').catch(() => {});
    await page.mouse.up().catch(() => {});
    await page.evaluate(() => window.__COT_FEEDBACK_SAMPLE?.dispose()).catch(() => {});
  }
}
