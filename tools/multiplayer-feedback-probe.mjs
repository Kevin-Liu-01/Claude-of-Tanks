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
  const started = performance.now();
  const traceStart = trace.stats().durationMs;
  const traceClockReadSpanMs = performance.now() - started;
  const sample = { started, traceStart, traceClockReadSpanMs, actions: [],
    shots: [], predicted: [], authority: new Map(), diagnostics: [], ice: [], rafs: new Set(), disposed: false };
  const active = () => !document.hidden && document.hasFocus() && debug.game.phase === 'battle' &&
    debug.game.preBattleS <= 0 && !debug.game.result;
  const numeric = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const boolean = (value) => typeof value === 'boolean' ? value : null;
  const project = (source, keys) => Object.fromEntries(keys.map((key) => [key, numeric(source?.[key])]));
  function clickEligibility() {
    const player = debug.game.player;
    const combat = player?.combat;
    const locked = boolean(debug.input.isLocked?.());
    const cursorAim = boolean(debug.input.isCursorAim?.());
    return { locked, cursorAim,
      mouseFireLane: locked === null || cursorAim === null ? null : locked || cursorAim,
      pointerLocked: !!document.pointerLockElement, focused: document.hasFocus(), hidden: document.hidden,
      // getState(), isDown() and padActive() poll/consume input. Never invoke
      // them from an observer; no non-mutating held-fire getter is exposed.
      fireHeld: null, currentInputFire: boolean(player?.input?.fire),
      shellSlot: numeric(combat?.shellSlot), requestedShellSlot: numeric(player?.input?.shellSlot),
      authorityShellSlot: numeric(player?._networkShellSlot),
      selectionPending: boolean(player?._networkAmmoSelectionPending),
      ammo: numeric(combat?.ammo?.[combat?.shellSlot]),
      requestedAmmo: numeric(combat?.ammo?.[player?.input?.shellSlot]),
      reloadS: numeric(combat?.reload?.t),
      inputPacketsSubmitted: numeric(debug.network?.inputPacketsSubmitted) };
  }
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
      matched: false, ambiguous: false, eligibility: clickEligibility() });
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

/** End opt-in observation before recorder shutdown/report allocation. No game writes. */
export function endFeedbackSample() {
  const sample = window.__COT_FEEDBACK_SAMPLE;
  if (!sample) throw new Error('feedback_sample_missing');
  sample.endedAt ??= performance.now();
  sample.dispose();
  return sample.endedAt;
}

/** Source-profiler startup may pause V8. Start the observed gameplay interval
 * only after that handshake, reusing the trace clock without another stats sort.
 * This resets QA observer buffers, never the game's input/simulation/trace history.
 */
export function resetFeedbackSampleBoundary() {
  const sample = window.__COT_FEEDBACK_SAMPLE;
  if (!sample || sample.disposed) throw new Error('feedback_sample_missing');
  const next = performance.now();
  sample.observationResetExcludedMs = next - sample.started;
  sample.traceStart += sample.observationResetExcludedMs;
  sample.started = next;
  sample.actions.length = sample.shots.length = sample.predicted.length = sample.diagnostics.length = 0;
  sample.authority.clear();
  for (const raf of sample.rafs) cancelAnimationFrame(raf);
  sample.rafs.clear();
}

/** Export only numeric measurements and closed enums, never raw bus/trace/RTC objects. */
export function stopFeedbackSample() {
  const sample = window.__COT_FEEDBACK_SAMPLE;
  if (!sample) throw new Error('feedback_sample_missing');
  sample.dispose();
  const trace = window.__QA_TRACE.snapshot({ gpu: false });
  const index = (key) => trace.frameSchema.indexOf(key);
  const traceEnd = Number.isFinite(sample.endedAt) ? sample.traceStart + sample.endedAt - sample.started : Infinity;
  let observationBoundaryFramesExcluded = 0;
  const frames = trace.frames.filter((row) => row[index('tMs')] >= sample.traceStart &&
    row[index('tMs')] <= traceEnd &&
    row[index('phase')] === 'battle' && row[index('preBattleS')] <= 0 &&
    (row[index('flags')] & 127) === 0).filter((row) => {
    if (sample.observationResetExcludedMs === undefined ||
        row[index('tMs')] - row[index('gapMs')] >= sample.traceStart) return true;
    observationBoundaryFramesExcluded++;
    return false;
  });

  // Keep only bounded, numeric trace windows. Never export raw trace events:
  // their payloads can contain room codes, entity IDs, positions, or URLs.
  const numeric = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  function longTaskStart(event) {
    if (event.name !== 'longtask') return null;
    const start = numeric(event.data?.startTime);
    const duration = numeric(event.data?.duration);
    if (start === null || start < 0 || duration === null || duration < 0 ||
        !Number.isFinite(start + duration)) return null;
    // PerformanceEntry uses performance.now()'s epoch; trace rows use traceZero.
    return start - sample.started + sample.traceStart;
  }
  function eventTime(event, centerMs) {
    const start = longTaskStart(event);
    return start === null ? event.tMs : Math.min(Math.max(centerMs, start), start + event.data.duration);
  }
  function projectEvent(event, centerMs) {
    const row = { dtFromCenterMs: event.tMs - centerMs, name: event.name };
    if (event.name !== 'longtask') return row;
    const start = longTaskStart(event);
    return { ...row, startAtMs: start === null ? null : event.data.startTime - sample.started,
      startDtFromCenterMs: start === null ? null : start - centerMs,
      durationMs: start === null ? null : event.data.duration };
  }
  function precedingFrame(centerMs) {
    let previous = null;
    for (const row of trace.frames) {
      const at = numeric(row[index('tMs')]);
      if (at !== null && at < centerMs && (!previous || at > previous[index('tMs')])) previous = row;
    }
    return previous;
  }
  function closest(rows, time, centerMs, limit, anchors = []) {
    const pinned = anchors.filter((row) => row && rows.includes(row));
    const selected = rows.filter((row) => !pinned.includes(row)).sort((a, b) =>
      Math.abs(time(a) - centerMs) - Math.abs(time(b) - centerMs)).slice(0, limit - pinned.length);
    return [...pinned, ...selected].sort((a, b) => time(a) - time(b));
  }
  function timingWindow(kind, centerMs, ordinal = null, worstFrame = null) {
    const frameKeys = ['gapMs', 'dtMs', 'calls', 'triangles', 'programs', 'geometries',
      'textures', 'renderScale', 'heapMB', 'flags'];
    const eventNames = new Set(['fire', 'weapon:predicted', 'shell:fired', 'shell:hit',
      'shell:expired', 'tank:destroyed', 'tank:ram', 'prop:crushed', 'prop:destroyed',
      'longtask', 'frame:spike', 'screen:freeze', 'frame:hidden-spike', 'frame:hidden-gap']);
    const previous = worstFrame ? precedingFrame(centerMs) : null;
    const gapStart = worstFrame ? -Math.max(0, numeric(worstFrame[index('gapMs')]) ?? 0) : null;
    const previousAt = previous ? previous[index('tMs')] - centerMs : null;
    const startDt = Math.min(-250, gapStart ?? 0, previousAt ?? 0);
    const startMs = centerMs + startDt;
    const endMs = Math.min(centerMs + 250, traceEnd);
    const nearbyFrames = trace.frames.filter((row) =>
      row[index('tMs')] >= startMs && row[index('tMs')] <= endMs);
    const nearbyEvents = (trace.events || []).filter((event) => {
      if (!eventNames.has(event.name) || numeric(event.tMs) === null) return false;
      const start = longTaskStart(event);
      return start === null ? event.tMs >= startMs && event.tMs <= endMs
        : start <= endMs && start + event.data.duration >= startMs;
    });
    // Keep both endpoints of a stalled interval, even if following high-refresh
    // frames consume the 48-row budget. Omitted context remains explicit.
    return { kind, ordinal, atMs: centerMs - sample.traceStart,
      startDtFromCenterMs: startDt, endDtFromCenterMs: endMs - centerMs,
      ...(worstFrame ? { gapStartDtFromCenterMs: gapStart,
        precedingFrameDtFromCenterMs: previousAt } : {}),
      frameRowsOmitted: Math.max(0, nearbyFrames.length - 48),
      eventRowsOmitted: Math.max(0, nearbyEvents.length - 32),
      frames: closest(nearbyFrames, (row) => row[index('tMs')], centerMs, 48,
        [previous, worstFrame]).map((row) => ({
        dtFromCenterMs: row[index('tMs')] - centerMs,
        ...Object.fromEntries(frameKeys.map((key) => [key, numeric(row[index(key)])])),
      })),
      events: closest(nearbyEvents, (event) => eventTime(event, centerMs), centerMs, 32)
        .map((event) => projectEvent(event, centerMs)),
    };
  }
  const windows = sample.actions.slice(0, 4).map((action, ordinal) => timingWindow(
    ordinal === 0 ? 'first-click' : 'subsequent-click',
    sample.traceStart + action.at - sample.started, ordinal + 1,
  ));
  let worst = null;
  for (const row of frames) {
    if (!worst || row[index('gapMs')] > worst[index('gapMs')]) worst = row;
  }
  if (worst) {
    const window = timingWindow('worst-frame', worst[index('tMs')], null, worst);
    // frame() records the preceding interval at its END. Keep the original
    // aggregate unchanged, but identify a focus/start-boundary overlap.
    window.gapStartedBeforeSample = worst[index('tMs')] - worst[index('gapMs')] < sample.traceStart;
    windows.push(window);
  }
  const result = { sampleStartedAtMs: sample.started,
    ...(Number.isFinite(sample.observationResetExcludedMs) ? {
      observationResetExcludedMs: sample.observationResetExcludedMs, observationBoundaryFramesExcluded,
    } : {}),
    ...(Number.isFinite(sample.endedAt) ? { sampleEndedAtMs: sample.endedAt } : {}),
    durationMs: (sample.endedAt ?? performance.now()) - sample.started,
    actions: sample.actions.map(({ at, ready, matched, ambiguous, eligibility }) => ({
      atMs: at - sample.started, ready, matched, ambiguous, eligibility })),
    shots: sample.shots, predicted: sample.predicted, diagnostics: sample.diagnostics,
    gapsMs: frames.map((row) => row[index('gapMs')]),
    timingWindows: { halfWidthMs: 250, traceClockReadSpanMs: sample.traceClockReadSpanMs, windows },
    traceFramesDropped: trace.stats.framesDropped,
    observerFailures: window.__COT_FEEDBACK_NETWORK?.failures || 0 };
  delete window.__COT_FEEDBACK_SAMPLE;
  return result;
}

/** Defensive projection also makes summarization safe for stored QA input. */
export function sanitizeFeedbackTimingWindows(source) {
  if (!source || !Array.isArray(source.windows)) return null;
  const numeric = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const frameKeys = ['dtFromCenterMs', 'gapMs', 'dtMs', 'calls', 'triangles', 'programs',
    'geometries', 'textures', 'renderScale', 'heapMB', 'flags'];
  const eventNames = new Set(['fire', 'weapon:predicted', 'shell:fired', 'shell:hit',
    'shell:expired', 'tank:destroyed', 'tank:ram', 'prop:crushed', 'prop:destroyed',
    'longtask', 'frame:spike', 'screen:freeze', 'frame:hidden-spike', 'frame:hidden-gap']);
  const kinds = new Set(['first-click', 'subsequent-click', 'worst-frame']);
  const nonpositive = (value) => numeric(value) !== null && value <= 0 ? value : null;
  function taskStart(row) {
    const start = numeric(row.startDtFromCenterMs);
    const duration = numeric(row.durationMs);
    return row.name === 'longtask' && start !== null && duration !== null && duration >= 0 &&
      Number.isFinite(start + duration) ? start : null;
  }
  function projectEvent(row) {
    const event = { dtFromCenterMs: row.dtFromCenterMs, name: row.name };
    if (row.name !== 'longtask') return event;
    const start = taskStart(row);
    return { ...event, startAtMs: start === null ? null : numeric(row.startAtMs),
      startDtFromCenterMs: start, durationMs: start === null ? null : row.durationMs };
  }
  function projectWindow(window) {
    const isWorst = window.kind === 'worst-frame';
    const gapStart = isWorst ? nonpositive(window.gapStartDtFromCenterMs) : null;
    const previous = isWorst ? nonpositive(window.precedingFrameDtFromCenterMs) : null;
    const startDt = Math.min(-250, gapStart ?? 0, previous ?? 0);
    const endDt = Math.min(250, Math.max(0, numeric(window.endDtFromCenterMs) ?? 250));
    const nearby = (row) => row && numeric(row.dtFromCenterMs) !== null &&
      row.dtFromCenterMs >= startDt && row.dtFromCenterMs <= endDt;
    const eventNearby = (row) => {
      if (!row || !eventNames.has(row.name) || numeric(row.dtFromCenterMs) === null) return false;
      const start = taskStart(row);
      return start === null ? nearby(row) : start <= endDt && start + row.durationMs >= startDt;
    };
    return { kind: window.kind, ordinal: numeric(window.ordinal), atMs: numeric(window.atMs),
      startDtFromCenterMs: startDt, endDtFromCenterMs: endDt,
      frameRowsOmitted: numeric(window.frameRowsOmitted), eventRowsOmitted: numeric(window.eventRowsOmitted),
      ...(isWorst ? { gapStartedBeforeSample: window.gapStartedBeforeSample === true,
        gapStartDtFromCenterMs: gapStart, precedingFrameDtFromCenterMs: previous } : {}),
      frames: (Array.isArray(window.frames) ? window.frames : []).filter(nearby).slice(0, 48)
        .map((row) => Object.fromEntries(frameKeys.map((key) => [key, numeric(row[key])]))),
      events: (Array.isArray(window.events) ? window.events : [])
        .filter(eventNearby).slice(0, 32).map(projectEvent),
    };
  }
  const span = numeric(source.traceClockReadSpanMs);
  return { halfWidthMs: 250, traceClockReadSpanMs: span !== null && span >= 0 ? span : null,
    windows: source.windows.filter((row) => kinds.has(row?.kind)).slice(0, 5).map(projectWindow) };
}

export function metricDistribution(values) {
  const sorted = values.filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const percentile = (fraction) => sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
  return { count: sorted.length, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99),
    max: sorted.at(-1) ?? null };
}

/** Keep historical readiness/counts unchanged; expose bounded context, not a new admission gate. */
export function sanitizeFeedbackActions(source) {
  const numeric = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const boolean = (value) => typeof value === 'boolean' ? value : null;
  const booleans = ['locked', 'cursorAim', 'mouseFireLane', 'pointerLocked', 'focused',
    'hidden', 'fireHeld', 'currentInputFire', 'selectionPending'];
  const numbers = ['shellSlot', 'requestedShellSlot', 'authorityShellSlot', 'ammo', 'requestedAmmo', 'reloadS', 'inputPacketsSubmitted'];
  return (Array.isArray(source) ? source : []).slice(0, 128).map((action) => ({
    atMs: numeric(action?.atMs), ready: boolean(action?.ready), matched: boolean(action?.matched),
    ambiguous: boolean(action?.ambiguous), eligibility: {
      ...Object.fromEntries(booleans.map((key) => [key, boolean(action?.eligibility?.[key])])),
      ...Object.fromEntries(numbers.map((key) => [key, numeric(action?.eligibility?.[key])])),
    },
  }));
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
  return { sampleStartedAtMs: Number.isFinite(raw.sampleStartedAtMs) ? raw.sampleStartedAtMs : null,
    ...(Number.isFinite(raw.observationResetExcludedMs) ? {
      observationResetExcludedMs: raw.observationResetExcludedMs,
      observationBoundaryFramesExcluded: Number.isFinite(raw.observationBoundaryFramesExcluded)
        ? raw.observationBoundaryFramesExcluded : null,
    } : {}),
    ...(Number.isFinite(raw.sampleEndedAtMs) ? { sampleEndedAtMs: raw.sampleEndedAtMs } : {}),
    durationMs: Number.isFinite(raw.durationMs) ? raw.durationMs : null,
    frameGapMs: metricDistribution(raw.gapsMs || []),
    timingWindows: sanitizeFeedbackTimingWindows(raw.timingWindows),
    firing: { attempts: raw.actions?.length || 0,
      actions: sanitizeFeedbackActions(raw.actions),
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

/** Read-only scenario guard: an optimistic card change is not an acknowledged load. */
export function readFeedbackAmmoReadiness({ ammoSlot, requireReload }) {
  const player = window.__DEBUG?.game?.player;
  const combat = player?.combat;
  const slot = ammoSlot - 1;
  const count = combat?.ammo?.[slot];
  return combat?.shellSlot === slot && player?.input?.shellSlot === slot &&
    player?._networkShellSlot === slot && player?._networkAmmoSelectionPending !== true && !combat?.destroyed &&
    Number.isFinite(count) && count > 0 && (!requireReload || combat.reload?.t <= 0);
}

/** Optional trusted key selection before the timed sample; no authority writes. */
export async function selectNativeFeedbackAmmo(page, ammoSlot) {
  if (ammoSlot === undefined) return 1; // Preserve the original fresh-profile slot-one path.
  if (!Number.isSafeInteger(ammoSlot) || ammoSlot < 1 || ammoSlot > 3) {
    throw new TypeError('ammo slot must be 1, 2, or 3');
  }
  try {
    await page.keyboard.press(String(ammoSlot));
    await page.waitForFunction(readFeedbackAmmoReadiness, { timeout: 10_000 },
      { ammoSlot, requireReload: false });
  } catch (_) {
    throw new Error('feedback_ammo_selection_timeout');
  }
  return ammoSlot;
}

/** Bounded, identity-free preparation evidence, including failed native attempts. */
export function projectNativePreparation(value) {
  if (!value || typeof value !== 'object') return null;
  const count = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 128 ? n : null;
  const ammo = (array) => Array.from({ length: 3 }, (_, i) => {
    const n = array?.[i];
    return Number.isSafeInteger(n) && n >= 0 && n <= 100000 ? n : null;
  });
  return { nativeClickAttempts: count(value.nativeClickAttempts),
    nativeClickCompleted: value.nativeClickCompleted === true,
    fireActions: count(value.fireActions), predictedShots: count(value.predictedShots),
    confirmedShots: count(value.confirmedShots), overflow: value.overflow === true,
    ammoBefore: ammo(value.ammoBefore), ammoAfter: ammo(value.ammoAfter),
    durationMs: Number.isFinite(value.durationMs) && value.durationMs >= 0 && value.durationMs <= 20000
      ? value.durationMs : null, ready: value.ready === true };
}

/** Observation only: these callbacks never poll/consume input or change gameplay. */
export function startFeedbackInputPreparation() {
  window.__COT_FEEDBACK_PREPARATION?.dispose();
  const debug = window.__DEBUG;
  const canvas = debug?.renderer?.domElement;
  if (!canvas || !debug.input?.onAction || !debug.bus?.on || !debug.settings?.isOpen ||
      !debug.killcam?.isActive) throw new Error('feedback_native_input_preparation_failed');
  const started = performance.now();
  const ammo = () => Array.from({ length: 3 }, (_, i) => {
    const n = debug.game?.player?.combat?.ammo?.[i];
    return Number.isSafeInteger(n) && n >= 0 && n <= 100000 ? n : null;
  });
  const state = { nativeClickAttempts: 0, nativeClickCompleted: false,
    fireActions: 0, predictedShots: 0, confirmedShots: 0, overflow: false,
    ammoBefore: ammo(), ammoAfter: null, durationMs: 0, ready: false };
  let clickAt = -Infinity;
  let shotAt = -Infinity;
  let disposed = false;
  const stops = [];
  let timer;
  const active = () => canvas.isConnected && document.hasFocus() && !document.hidden &&
    debug.game?.phase === 'battle' && debug.game.preBattleS <= 0 && !debug.game.result &&
    !!debug.game.player?.combat && !debug.game.player.combat.destroyed &&
    !debug.settings.isOpen() && !debug.killcam.isActive();
  const locked = () => document.pointerLockElement === canvas && debug.input.isLocked?.() === true;
  const observedAmmoSpent = () => ammo().reduce((spent, n, i) => spent +
    (n === null || state.ammoBefore[i] === null ? 0 : Math.max(0, state.ammoBefore[i] - n)), 0);
  const ready = () => !disposed && active() && locked() && debug.game.player.input?.fire === false &&
    debug.network?.pendingInputEdges === 0 &&
    (state.nativeClickAttempts === 0 || (performance.now() - Math.max(clickAt, shotAt) >= 300 &&
      debug.game.player.combat.reload?.t <= 0 && state.predictedShots <= state.confirmedShots &&
      state.confirmedShots >= observedAmmoSpent()));
  const increment = (key) => {
    if (disposed) return;
    if (state[key] >= 128) state.overflow = true;
    else state[key]++;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    for (const stop of stops) stop();
  };
  window.__COT_FEEDBACK_PREPARATION = { dispose, ready,
    target() {
      if (ready()) return null;
      if (!active()) throw new Error('feedback_native_input_preparation_failed');
      if (locked()) return null; // Wait out existing input; never create another fire edge.
      const box = canvas.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (!(box.width > 0 && box.height > 0) || !Number.isFinite(x) || !Number.isFinite(y) ||
          document.elementFromPoint(x, y) !== canvas) throw new Error('feedback_native_input_preparation_failed');
      state.nativeClickAttempts++;
      clickAt = performance.now();
      return { x, y };
    },
    completed() { state.nativeClickCompleted = true; },
    finish() {
      state.ready = ready();
      state.ammoAfter = ammo();
      state.durationMs = performance.now() - started;
      dispose();
      return state;
    } };
  try {
    stops.push(debug.input.onAction('fire', () => increment('fireActions')));
    stops.push(debug.bus.on('weapon:predicted', (event) => {
      if (event.isPlayer === true) { increment('predictedShots'); shotAt = performance.now(); }
    }));
    stops.push(debug.bus.on('shell:fired', (event) => {
      if (event.isPlayer === true) { increment('confirmedShots'); shotAt = performance.now(); }
    }));
    // Also bounds a late evaluate that resolves after Node's command deadline.
    timer = setTimeout(dispose, 15000);
  } catch (error) { dispose(); throw error; }
  return { ready: ready() };
}

export function finishFeedbackInputPreparation() {
  return window.__COT_FEEDBACK_PREPARATION?.finish() ?? null;
}

async function boundedPreparationCommand(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('feedback_native_input_preparation_failed')), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

/** One trusted recovery gesture at most. A denied lock never becomes a timing sample. */
export async function prepareNativeFeedbackInput(page, timeoutMs = 10000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new TypeError('invalid preflight timeout');
  const deadline = performance.now() + timeoutMs;
  const abort = new AbortController();
  const run = (operation) => boundedPreparationCommand(operation, Math.max(1, deadline - performance.now()));
  let failed = false;
  let receipt = null;
  try {
    const initial = await run(() => page.evaluate(startFeedbackInputPreparation));
    if (!initial?.ready) {
      const target = await run(() => page.evaluate(() => window.__COT_FEEDBACK_PREPARATION.target()));
      if (target) {
        await run(() => page.mouse.click(target.x, target.y));
        await run(() => page.evaluate(() => window.__COT_FEEDBACK_PREPARATION.completed()));
      }
      await run(() => page.waitForFunction(() => window.__COT_FEEDBACK_PREPARATION?.ready(),
        { timeout: Math.max(1, deadline - performance.now()), polling: 50, signal: abort.signal })
        .then((handle) => boundedPreparationCommand(() => handle?.dispose(), 1000)));
    }
  } catch (_) { failed = true; }
  finally {
    abort.abort();
    try { receipt = projectNativePreparation(await boundedPreparationCommand(
      () => page.evaluate(finishFeedbackInputPreparation), 1000)); } catch (_) { failed = true; }
  }
  if (failed || !receipt?.ready || receipt.overflow) {
    const error = new Error('feedback_native_input_preparation_failed');
    error.nativePreparation = receipt;
    throw error;
  }
  return receipt;
}

export async function measureNativeFeedback(page, durationMs = 20_000, ammoSlot,
  { beforeSample, afterSampleStarted, afterSample, nativePreflight = false } = {}) {
  if (typeof nativePreflight !== 'boolean') throw new TypeError('native preflight must be boolean');
  const ice = [];
  let nativePreparation = null;
  try {
    const startup = (operation) => nativePreflight ? boundedPreparationCommand(operation, 10000) : operation();
    await startup(() => page.bringToFront());
    await startup(() => page.waitForFunction(() => window.__DEBUG?.game?.preBattleS <= 0 && !window.__DEBUG?.game?.result));
    nativePreparation = nativePreflight ? await prepareNativeFeedbackInput(page) : null;
    const selectedAmmoSlot = await selectNativeFeedbackAmmo(page, ammoSlot);
    // Optional diagnostics exclude native readiness but precede every timed listener/input edge.
    if (beforeSample) await beforeSample();
    await page.evaluate(startFeedbackSample);
    if (afterSampleStarted) {
      await afterSampleStarted();
      await page.evaluate(resetFeedbackSampleBoundary);
    }
    const started = performance.now();
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    while (performance.now() - started < durationMs) {
      const ready = await page.evaluate(readFeedbackAmmoReadiness,
        { ammoSlot: selectedAmmoSlot, requireReload: true });
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
    if (afterSample) {
      const sampleEndedAtMs = await page.evaluate(endFeedbackSample);
      await afterSample(sampleEndedAtMs);
    }
    const result = summarizeFeedbackSample(await page.evaluate(stopFeedbackSample), ice);
    if (result.firing.predicted.count !== result.firing.confirmed.predictionSuppressedCount) {
      throw new Error('predicted_feedback_confirmation_mismatch');
    }
    return { ...result, ammoSlot: selectedAmmoSlot, ...(nativePreflight ? { nativePreparation } : {}) };
  } catch (error) {
    if (nativePreparation && error instanceof Error) error.nativePreparation = nativePreparation;
    throw error;
  } finally {
    const cleanup = (operation) => (nativePreflight ? boundedPreparationCommand(operation, 1000) : operation()).catch(() => {});
    await cleanup(() => page.keyboard.up('w'));
    await cleanup(() => page.keyboard.up('d'));
    await cleanup(() => page.mouse.up());
    await cleanup(() => page.evaluate(() => window.__COT_FEEDBACK_SAMPLE?.dispose()));
  }
}
