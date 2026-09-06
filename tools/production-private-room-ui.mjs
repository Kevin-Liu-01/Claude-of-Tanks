import { pathToFileURL } from 'node:url';
import { isAbsolute, join, normalize, parse } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { installFeedbackPeerObserver, measureNativeFeedback } from './multiplayer-feedback-probe.mjs';
import { startMultiplayerCpuTimeline } from './multiplayer-cpu-timeline.mjs';
import { startMultiplayerFrameTrace } from './multiplayer-frame-trace.mjs';
import { startMultiplayerSourceProfile } from './multiplayer-source-profile.mjs';

function validateAmmoSelection(ammoSlot, measurePerformance) {
  if (ammoSlot !== undefined && (!measurePerformance || !Number.isSafeInteger(ammoSlot) ||
      ammoSlot < 1 || ammoSlot > 3)) {
    throw new TypeError('ammo slot must be 1, 2, or 3 and requires --performance');
  }
}

function validateCpuTimeline(cpuTimeline, measurePerformance) {
  if (typeof cpuTimeline !== 'boolean' || (cpuTimeline && !measurePerformance)) {
    throw new TypeError('CPU timeline requires --performance');
  }
}

function validateFrameTrace(frameTrace, cpuTimeline, measurePerformance) {
  if (typeof frameTrace !== 'boolean' || (frameTrace && !measurePerformance)) {
    throw new TypeError('frame trace requires --performance');
  }
  if (frameTrace && cpuTimeline) throw new TypeError('frame trace and CPU timeline are mutually exclusive');
}

function validateSourceProfile(sourceProfile, measurePerformance, cpuTimeline, frameTrace) {
  if (sourceProfile === undefined) return;
  if (!['host', 'guest'].includes(sourceProfile) || !measurePerformance) {
    throw new TypeError('source profile must select host or guest and requires --performance');
  }
  if (cpuTimeline || frameTrace) throw new TypeError('source profile and other CPU diagnostics are mutually exclusive');
}

function captureOptions({ forceRelay, frameTrace, cpuTimeline, sourceProfile, ammoSlot, screenshots }) {
  return { ...(forceRelay ? { forceRelay: true } : {}),
    ...(frameTrace ? { frameTrace: true } : {}),
    ...(cpuTimeline ? { cpuTimeline: true } : {}),
    ...(sourceProfile === undefined ? {} : { sourceProfile }),
    ...(ammoSlot === undefined ? {} : { ammoSlot }),
    ...(screenshots === undefined ? {} : { screenshots: normalize(screenshots) }) };
}

export function productionUiOptions({ url, timeoutMs = 300_000, screenshots, measurePerformance = false,
  ammoSlot, cpuTimeline = false, forceRelay = false, frameTrace = false, sourceProfile } = {}) {
  let origin;
  try { origin = new URL(url); } catch (_) { throw new TypeError('an explicit frontend origin is required'); }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.pathname !== '/' ||
      origin.username || origin.password || origin.search || origin.hash) {
    throw new TypeError('frontend must be a credential-free HTTP(S) origin without a path');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 300_000) {
    throw new TypeError('timeout must be an integer from 30000 through 300000 ms');
  }
  validateAmmoSelection(ammoSlot, measurePerformance);
  validateCpuTimeline(cpuTimeline, measurePerformance);
  validateFrameTrace(frameTrace, cpuTimeline, measurePerformance);
  validateSourceProfile(sourceProfile, measurePerformance, cpuTimeline, frameTrace);
  if (typeof forceRelay !== 'boolean' || (forceRelay && !measurePerformance)) {
    throw new TypeError('force relay requires --performance');
  }
  if (screenshots !== undefined && (typeof screenshots !== 'string' || !isAbsolute(screenshots) ||
      screenshots.split(/[\\/]/).includes('..') || normalize(screenshots) === parse(screenshots).root ||
      !measurePerformance)) {
    throw new TypeError('screenshots require --performance and an absolute artifact subdirectory');
  }
  return { origin: origin.origin, timeoutMs,
    ...captureOptions({ forceRelay, frameTrace, cpuTimeline, sourceProfile, ammoSlot, screenshots }) };
}

/** Optional diagnosis has measurable overhead and is not a timing certification. */
function frameTraceReceipt(sample, capture) {
  const start = sample.sampleStartedAtMs;
  const duration = sample.durationMs;
  const baseline = capture.baselinePageTimeMs;
  const end = capture.captureEndPageTimeMs;
  const sampleFullyCovered = [start, duration, baseline, end].every(Number.isFinite) &&
    duration >= 0 && baseline <= start && end >= start + duration;
  const clockAligned = Number.isFinite(capture.clockDriftMs) && Math.abs(capture.clockDriftMs) <= 2;
  const complete = capture.complete === true && sampleFullyCovered && clockAligned;
  const offset = start - baseline;
  return { ...capture, captureComplete: capture.complete === true, complete,
    sampleFullyCovered, clockAligned,
    sampleStartOffsetMs: Number.isFinite(offset) ? offset : null, diagnosticOverhead: true,
    attributionValid: complete && capture.dataLossOccurred === false && capture.rowsDropped === 0 &&
      capture.malformed === 0 && capture.stackOverflow === 0 && capture.openDurationEvents === 0 };
}

function sourceProfileReceipt(sample, capture) {
  const offset = sample.sampleStartedAtMs - capture.baselinePageTimeMs;
  const end = sample.sampleStartedAtMs + sample.durationMs;
  // Profile and performance.now epochs differ. Bracket start instead of silently
  // treating CDP microseconds as page time; no claim finer than this uncertainty.
  const sampleFullyCovered = Number.isFinite(end) &&
    capture.startAfterPageTimeMs <= sample.sampleStartedAtMs &&
    capture.startBeforePageTimeMs + capture.profileDurationMs >= end;
  const observedStartOffsetMs = Math.max(0, capture.startAfterPageTimeMs - sample.sampleStartedAtMs);
  const observedEndOffsetMs = Math.min(sample.durationMs,
    capture.startBeforePageTimeMs + capture.profileDurationMs - sample.sampleStartedAtMs);
  return { ...capture, sampleStartOffsetMs: Number.isFinite(offset) ? offset : null,
    sampleFullyCovered, captureComplete: true,
    observedStartOffsetMs: Number.isFinite(observedStartOffsetMs) ? observedStartOffsetMs : null,
    observedEndOffsetMs: Number.isFinite(observedEndOffsetMs) ? observedEndOffsetMs : null,
    observerSetupAndReportExcluded: true,
    cpuWeightsScope: 'whole-profile-including-startup-use-observed-window-bounds',
    observedFullBinStartIndex: Number.isFinite(offset)
      ? Math.max(0, Math.ceil((sample.sampleStartedAtMs - capture.startBeforePageTimeMs) / capture.binMs)) : null,
    observedFullBinEndIndexExclusive: Number.isFinite(end)
      ? Math.max(0, Math.floor((end - capture.startAfterPageTimeMs) / capture.binMs)) : null };
}

export async function measureProductionFeedback(page, options, {
  startTimeline = startMultiplayerCpuTimeline, startTrace = startMultiplayerFrameTrace,
  startSourceProfile = startMultiplayerSourceProfile, measure = measureNativeFeedback, role = 'host',
} = {}) {
  const profileSelected = options.sourceProfile === role;
  if (!options.cpuTimeline && !options.frameTrace && !profileSelected) return measure(page, 20_000, options.ammoSlot);
  let timeline;
  let sample;
  let cpu;
  let measurementError;
  try {
    const capture = profileSelected ? {
      afterSampleStarted: async () => { timeline = await startSourceProfile(page, { origin: options.origin }); },
      afterSample: async () => { cpu = await timeline.stop(); },
    } : { beforeSample: async () => {
      timeline = await (options.frameTrace ? startTrace(page) : startTimeline(page));
    } };
    sample = await measure(page, 20_000, options.ammoSlot, capture);
  }
  catch (error) { measurementError = error; }
  // Native readiness or capture acquisition can fail before any CDP owner exists.
  if (!timeline) throw measurementError || new Error('feedback_sample_missing');
  try { cpu ??= await timeline.stop(); }
  catch (error) {
    throw Object.assign(failure('native_feedback_performance'), productionDiagnosticDetails(error), {
      measurementDiagnosticCode: measurementCode(productionDiagnosticCode(measurementError)),
    });
  }
  if (measurementError) throw measurementError;
  if (profileSelected) return { ...sample, sourceProfile: sourceProfileReceipt(sample, cpu) };
  const offset = sample.sampleStartedAtMs - cpu.baselinePageTimeMs;
  if (options.frameTrace) return { ...sample, frameTrace: frameTraceReceipt(sample, cpu) };
  return { ...sample, cpuTimeline: { ...cpu,
    sampleStartOffsetMs: Number.isFinite(offset) ? offset : null,
    diagnosticOverhead: true } };
}

function failure(stage) {
  return Object.assign(new Error('production private-room UI smoke failed'), {
    code: 'production_private_room_ui_failed', stage,
  });
}

const DIAGNOSTIC_CODES = new Set([
  'frame_trace_start_failed', 'frame_trace_stop_failed', 'frame_trace_cleanup_failed',
  'feedback_qa_unavailable', 'feedback_sample_missing', 'feedback_ammo_selection_timeout',
  'predicted_feedback_confirmation_mismatch', 'cpu_timeline_start_failed',
  'cpu_timeline_sample_failed', 'cpu_timeline_cleanup_failed', 'relay_verification_failed',
  'source_profile_start_failed', 'source_profile_stop_failed', 'source_profile_cleanup_failed',
]);
const RELAY_REASONS = ['pair', 'observer', 'channels', 'disconnected', 'counter', 'policy', 'missing', 'stats'];
const FAILURE_EVIDENCE = new WeakMap();

export function productionFailureEvidence(error) {
  return FAILURE_EVIDENCE.get(error) ?? { performance: null, partialRelay: null };
}

function retainFailureEvidence(error, evidence) {
  FAILURE_EVIDENCE.set(error, evidence);
  return Object.assign(error, evidence);
}

function relayPairDetails(error) {
  const match = /^relay_verification_failed:pair:(null|frozen|waiting|in-progress|failed|succeeded):(0|1):(null|host|srflx|prflx|relay):(null|host|srflx|prflx|relay)$/.exec(error?.message);
  const value = match ? { pairState: match[1] === 'null' ? null : match[1], selectedPairPresent: match[2] === '1',
    localType: match[3] === 'null' ? null : match[3], remoteType: match[4] === 'null' ? null : match[4] } : error?.relayPair;
  if (!value || ![null, 'frozen', 'waiting', 'in-progress', 'failed', 'succeeded'].includes(value.pairState) ||
      typeof value.selectedPairPresent !== 'boolean' ||
      ![null, 'host', 'srflx', 'prflx', 'relay'].includes(value.localType) ||
      ![null, 'host', 'srflx', 'prflx', 'relay'].includes(value.remoteType)) return null;
  return { pairState: value.pairState, selectedPairPresent: value.selectedPairPresent,
    localType: value.localType, remoteType: value.remoteType };
}

function relayReason(error) {
  if (relayPairDetails(error)) return 'pair';
  if (RELAY_REASONS.includes(error?.relayReason)) return error.relayReason;
  return RELAY_REASONS.find((reason) => error?.message === `relay_verification_failed:${reason}`) ?? null;
}

/** Exact enum matches only: provider errors, URLs, stacks and suffixes stay private. */
export function productionDiagnosticCode(error) {
  for (const value of [error?.diagnosticCode, error?.code, error?.message]) {
    if (DIAGNOSTIC_CODES.has(value)) return value;
  }
  return relayReason(error) ? 'relay_verification_failed' : null;
}

function measurementCode(value) {
  return ['feedback_qa_unavailable', 'feedback_sample_missing', 'feedback_ammo_selection_timeout',
    'predicted_feedback_confirmation_mismatch'].includes(value) ? value : null;
}

/** No arbitrary strings or raw nested errors cross the public receipt boundary. */
export function productionDiagnosticDetails(error) {
  return { diagnosticCode: productionDiagnosticCode(error),
    measurementDiagnosticCode: measurementCode(error?.measurementDiagnosticCode),
    traceStage: ['end-mark', 'end-command', 'flush'].includes(error?.traceStage) ? error.traceStage : null,
    traceFailure: ['timeout', 'not-started', 'protocol-or-target-error'].includes(error?.traceFailure)
      ? error.traceFailure : null,
    completeBeforeStop: typeof error?.completeBeforeStop === 'boolean' ? error.completeBeforeStop : null,
    cleanupFailed: typeof error?.cleanupFailed === 'boolean' ? error.cleanupFailed : null,
    relayReason: relayReason(error),
    relayRole: ['host', 'guest'].includes(error?.relayRole) ? error.relayRole : null,
    relayPair: relayPairDetails(error),
    relaySampleCount: Number.isSafeInteger(error?.relaySampleCount) && error.relaySampleCount >= 0 &&
      error.relaySampleCount <= 90 ? error.relaySampleCount : null };
}

function bounded(promise, milliseconds, stage) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(failure(stage)), Math.max(1, milliseconds));
  })]).finally(() => clearTimeout(timer));
}

/** Explicit tool-only override: preserve native RTC behavior and deployed ICE servers. */
export function installProductionRelayPolicy() {
  if (window.__COT_FORCE_RELAY) return;
  const NativePeer = window.RTCPeerConnection;
  window.RTCPeerConnection = new Proxy(NativePeer, {
    construct(target, args, newTarget) {
      return Reflect.construct(target, [
        { ...args[0], iceTransportPolicy: 'relay' }, ...args.slice(1),
      ], newTarget);
    },
  });
  window.__COT_FORCE_RELAY = true;
}

/** Only bounded numeric aggregates leave the page; never return raw RTC stats. */
export async function readProductionRelayConnections({ reset = false } = {}) {
  let rejectedPair = null;
  function count(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('relay_counter_invalid');
    return value;
  }
  function selectedPair(peer, stats, output) {
    if (peer.getConfiguration().iceTransportPolicy !== 'relay') throw new Error('relay_policy_invalid');
    let pair;
    for (const row of stats.values()) {
      if (row.type === 'transport' && row.selectedCandidatePairId) pair = stats.get(row.selectedCandidatePairId);
    }
    const remoteType = stats.get(pair?.remoteCandidateId)?.candidateType;
    // Relay policy constrains LOCAL candidates. RFC 8445 §7.3.1.3 permits learning
    // peer-reflexive REMOTE candidates from incoming checks; inspect both browsers.
    const localType = stats.get(pair?.localCandidateId)?.candidateType;
    // libwebrtc Connection::Ping marks a still-selected writable pair IN_PROGRESS
    // for each consent check; ReceivedPingResponse restores SUCCEEDED.
    if (!['succeeded', 'in-progress'].includes(pair?.state) || localType !== 'relay' ||
        !['host', 'srflx', 'prflx', 'relay'].includes(remoteType)) {
      const type = (value) => ['host', 'srflx', 'prflx', 'relay'].includes(value) ? value : 'null';
      const state = ['frozen', 'waiting', 'in-progress', 'failed', 'succeeded'].includes(pair?.state) ? pair.state : 'null';
      rejectedPair = `${state}:${pair ? 1 : 0}:${type(localType)}:${type(remoteType)}`;
      throw new Error('relay_pair_invalid');
    }
    if (!output.remoteCandidateTypes.includes(remoteType)) output.remoteCandidateTypes.push(remoteType);
    return pair;
  }
  function gameChannels(stats, output) {
    const labels = new Set();
    for (const row of stats.values()) {
      if (row.type !== 'data-channel' || row.state !== 'open' ||
          !['cot-match-v1', 'cot-state-v1'].includes(row.label)) continue;
      labels.add(row.label);
      output.gameMessagesSent += count(row.messagesSent);
      output.gameMessagesReceived += count(row.messagesReceived);
    }
    if (labels.size !== 2) throw new Error('relay_game_channels_missing');
    output.openGameChannels += labels.size;
  }
  function recordPairObservation(peer, pair, output, succeededPeers) {
    if (!output.observedPairStates.includes(pair.state)) output.observedPairStates.push(pair.state);
    if (pair.state === 'succeeded') succeededPeers.add(peer);
    if (succeededPeers.has(peer)) output.succeededPeers++;
  }
  try {
    const state = window.__COT_FEEDBACK_NETWORK;
    if (!window.__COT_FORCE_RELAY || !state || state.failures || state.peers.size > 16) {
      throw new Error('relay_observer_invalid');
    }
    if (reset || !state.relaySucceededPeers) state.relaySucceededPeers = new WeakSet();
    const output = { policy: 'relay', connectedPeers: 0, openGameChannels: 0, remoteCandidateTypes: [],
      observedPairStates: [], succeededPeers: 0, bytesSent: 0, bytesReceived: 0,
      gameMessagesSent: 0, gameMessagesReceived: 0 };
    for (const peer of state.peers) {
      if (peer.connectionState === 'closed') continue;
      if (peer.connectionState !== 'connected') throw new Error('relay_peer_disconnected');
      const stats = await peer.getStats();
      if (peer.connectionState !== 'connected') throw new Error('relay_peer_disconnected');
      const pair = selectedPair(peer, stats, output);
      output.connectedPeers++;
      output.bytesSent += count(pair.bytesSent);
      output.bytesReceived += count(pair.bytesReceived);
      gameChannels(stats, output);
      recordPairObservation(peer, pair, output, state.relaySucceededPeers);
    }
    if (output.connectedPeers === 0) throw new Error('relay_peer_missing');
    return output;
  } catch (error) {
    // Browser exceptions preserve their message, not arbitrary custom fields.
    if (rejectedPair) throw new Error(`relay_verification_failed:pair:${rejectedPair}`);
    const reasons = { relay_pair_invalid: 'pair', relay_observer_invalid: 'observer',
      relay_game_channels_missing: 'channels', relay_peer_disconnected: 'disconnected',
      relay_counter_invalid: 'counter', relay_policy_invalid: 'policy', relay_peer_missing: 'missing' };
    const reason = Object.hasOwn(reasons, error?.message) ? reasons[error.message] : 'stats';
    throw new Error(`relay_verification_failed:${reason}`);
  }
}

function validateRelayCheckObservation(row) {
  if (!Number.isSafeInteger(row.succeededPeers) || row.succeededPeers < 0 ||
      row.succeededPeers > row.connectedPeers || !Array.isArray(row.observedPairStates) ||
      row.observedPairStates.length < 1 || row.observedPairStates.length > 2 ||
      row.observedPairStates.some((state) => !['succeeded', 'in-progress'].includes(state))) {
    throw failure('relay_gameplay');
  }
}

function validateRelayRows(rows, pageCount) {
  if (!Array.isArray(rows) || rows.length !== pageCount) throw failure('relay_gameplay');
  for (const row of rows) {
    validateRelayCheckObservation(row);
    if (row?.policy !== 'relay' || !Number.isSafeInteger(row.connectedPeers) ||
        row.connectedPeers < 1 || row.connectedPeers > 16 ||
        row.openGameChannels !== row.connectedPeers * 2) throw failure('relay_gameplay');
    for (const key of ['bytesSent', 'bytesReceived', 'gameMessagesSent', 'gameMessagesReceived']) {
      if (!Number.isSafeInteger(row[key]) || row[key] < 0) throw failure('relay_gameplay');
    }
    if (!Array.isArray(row.remoteCandidateTypes) || row.remoteCandidateTypes.length < 1 ||
        row.remoteCandidateTypes.length > 4 || row.remoteCandidateTypes.some((type) =>
        !['host', 'srflx', 'prflx', 'relay'].includes(type))) throw failure('relay_gameplay');
  }
}

async function sampleRelayPages(pages, observation) {
  return Promise.all(pages.map((page, index) => bounded(page.evaluate(readProductionRelayConnections, observation),
    2_000, 'relay_gameplay').catch((error) => {
    throw Object.assign(failure('relay_gameplay'), productionDiagnosticDetails(error), {
      relayRole: index ? 'guest' : 'host',
    });
  })));
}

function relayGameplayReceipt(first, last, result, sampleCount, remoteTypes, pairStates) {
  if (result?.samples?.length !== first.length || result.samples.some((sample) =>
    !Number.isSafeInteger(sample?.firing?.confirmed?.count) || sample.firing.confirmed.count < 1)) {
    throw failure('relay_gameplay');
  }
  const peers = last.map((row, index) => {
    const messagesSent = row.gameMessagesSent - first[index].gameMessagesSent;
    const messagesReceived = row.gameMessagesReceived - first[index].gameMessagesReceived;
    if (row.succeededPeers !== row.connectedPeers || messagesSent <= 0 || messagesReceived <= 0 || row.bytesSent <= first[index].bytesSent ||
        row.bytesReceived <= first[index].bytesReceived) throw failure('relay_gameplay');
    return { role: index ? 'guest' : 'host', connectedPeers: row.connectedPeers,
      remoteCandidateTypes: [...remoteTypes[index]].sort(),
      observedPairStates: [...pairStates[index]].sort(), succeededPeers: row.succeededPeers,
      openGameChannels: row.openGameChannels, messagesSent, messagesReceived };
  });
  return { policyOverride: 'tool-only-force-relay', localCandidateType: 'relay',
    sampleIntervalMs: 1000, sampleCount, maxSamples: 90, gameplayConfirmed: true,
    sameMachine: true, additionalRtcPolling: true, peers };
}

function partialRelayReceipt(first, last, sampleCount, remoteTypes, pairStates) {
  const peers = first && last ? last.map((row, index) => ({ role: index ? 'guest' : 'host',
    connectedPeers: row.connectedPeers, openGameChannels: row.openGameChannels,
    remoteCandidateTypes: [...remoteTypes[index]].sort(),
    observedPairStates: [...pairStates[index]].sort(), succeededPeers: row.succeededPeers,
    ...Object.fromEntries(['gameMessagesSent', 'gameMessagesReceived', 'bytesSent', 'bytesReceived'].map((key) => {
      const delta = row[key] - first[index][key];
      return [key.replace('gameMessages', 'messages'), delta >= 0 ? delta : null];
    })),
  })) : [];
  return { verified: false, sampleCount, sampleIntervalMs: 1000,
    policyOverride: 'tool-only-force-relay', peers };
}

function relayFailure(error, partialRelay) {
  return retainFailureEvidence(Object.assign(failure('relay_gameplay'), productionDiagnosticDetails(error), {
    relaySampleCount: partialRelay.sampleCount,
  }), { performance: null, partialRelay });
}

/** Bounded, non-overlapping checks cover the native movement/fire operation. */
export async function withProductionRelayValidation(pages, run, {
  sample = sampleRelayPages, schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  if (!Array.isArray(pages) || pages.length !== 2) throw failure('relay_gameplay');
  let stopped = false;
  let failed = false;
  let diagnosticError;
  let timer;
  let pending;
  let first;
  let last;
  let sampleCount = 0;
  const remoteTypes = pages.map(() => new Set());
  const pairStates = pages.map(() => new Set());
  let result;
  async function poll() {
    if (sampleCount >= 90) throw failure('relay_gameplay');
    const rows = await sample(pages, { reset: sampleCount === 0 });
    validateRelayRows(rows, pages.length);
    for (const [index, row] of rows.entries()) {
      for (const type of row.remoteCandidateTypes) remoteTypes[index].add(type);
      for (const state of row.observedPairStates) pairStates[index].add(state);
    }
    first ||= rows;
    last = rows;
    sampleCount++;
  }
  async function scheduledPoll() {
    pending = poll();
    try { await pending; } catch (error) {
      failed = true; diagnosticError ||= error;
    }
    if (!stopped && !failed) timer = schedule(scheduledPoll, 1000);
  }
  try {
    await poll();
    timer = schedule(scheduledPoll, 1000);
    result = await bounded(Promise.resolve().then(run), 90_000, 'relay_gameplay');
  } catch (error) { failed = true; diagnosticError = error; }
  finally {
    stopped = true;
    if (timer !== undefined) cancel(timer);
    await pending?.catch(() => {});
  }
  if (failed) throw relayFailure(diagnosticError, partialRelayReceipt(first, last, sampleCount, remoteTypes, pairStates));
  try {
    await poll();
    return { result, relay: relayGameplayReceipt(first, last, result, sampleCount, remoteTypes, pairStates) };
  } catch (error) {
    throw relayFailure(error, partialRelayReceipt(first, last, sampleCount, remoteTypes, pairStates));
  }
}

/** Capture after timing. Weather/quality stay untouched; unknown values remain null. */
export function readProductionRenderingContext() {
  const debug = window.__DEBUG;
  const weather = debug?.battleAtmosphere?.current?.weather;
  const preset = debug?.quality?.resolvePresetName?.();
  function finite(value, maximum) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
  }
  function particles() {
    const children = debug?.scene?.children;
    if (!Array.isArray(children)) return null;
    for (let index = 0; index < Math.min(512, children.length); index++) {
      const node = children[index];
      if (node.name !== 'battle-precipitation') continue;
      if (!node.visible) return 0;
      const count = finite(node.geometry?.instanceCount, 4096);
      return Number.isInteger(count) ? count : null;
    }
    return children.length <= 512 ? 0 : null;
  }
  return {
    condition: ['clear', 'fog', 'rain', 'snow'].includes(weather?.condition) ? weather.condition : null,
    timeOfDay: ['day', 'night'].includes(weather?.timeOfDay) ? weather.timeOfDay : null,
    precipitationIntensity: finite(weather?.precipitationIntensity, 1),
    particleCount: particles(),
    preset: ['low', 'medium', 'high', 'ultra', 'mobile-low', 'mobile', 'mobile-high'].includes(preset) ? preset : null,
    renderScale: finite(debug?.post?.dynScale, 2),
  };
}

/** Read-only projection: never export player IDs, invitation codes, storage, or signaling secrets. */
export function readUiState() {
  const shown = (selector) => {
    const element = document.querySelector(selector);
    return !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  };
  const network = window.__DEBUG?.network;
  return { phase: window.__DEBUG?.game?.phase || null, ready: window.__GAME_READY === true,
    garageVisible: shown('.cot-battle'), lobbyVisible: shown('.cot-play .lobby.show'),
    lobbyPlayers: document.querySelector('.cot-play .lobby.show .players')?.children.length || 0,
    failureVisible: shown('.cot-play .room-failure:not([hidden])'),
    loadingVisible: shown('.cot-bl.on'), connected: network?.connected === true,
    snapshotPacketsReceived: Number(network?.snapshotPacketsReceived) || 0,
    inputPacketsSubmitted: Number(network?.inputPacketsSubmitted) || 0,
    hasRoomUrl: new URL(location.href).searchParams.has('room') };
}

/** Fail closed rather than photograph an invitation, settings, login, or stale lobby. */
export function battleScreenshotAllowed() {
  const shown = (selector) => Array.from(document.querySelectorAll(selector)).some((element) =>
    element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
  const game = window.__DEBUG?.game;
  if (game?.phase !== 'battle' || game.result || !window.__DEBUG?.network?.connected ||
      document.hidden || !document.hasFocus() ||
      (window.__COT_FEEDBACK_SAMPLE && !window.__COT_FEEDBACK_SAMPLE.disposed)) return false;
  if (shown('.cot-play.show, .cot-bl.on, .cot-settings.open, dialog[open], input[type="password"], .cot-room-chat.open')) {
    return false;
  }
  const visibleText = document.body.innerText.toUpperCase();
  const code = new URL(location.href).searchParams.get('room')?.toUpperCase();
  if (code && visibleText.includes(code)) return false;
  const ids = [game.player?.id, ...(game.tanks || []).slice(0, 32).map((tank) => tank.id)];
  return !ids.some((id) => typeof id === 'string' && id.length >= 8 && visibleText.includes(id.toUpperCase()));
}

/** Two fixed filenames, viewport only, exclusive writes; never overwrite prior evidence. */
export async function captureBattleScreenshot(page, directory, role, io = { mkdir, writeFile }) {
  if (!['host', 'guest'].includes(role)) throw failure('screenshot_role');
  if (!await page.evaluate(battleScreenshotAllowed)) throw failure('screenshot_battle_guard');
  const bytes = await bounded(page.screenshot({ type: 'png', fullPage: false,
    captureBeyondViewport: false }), 5000, 'screenshot_capture');
  // A terminal/menu transition during capture must not persist sensitive pixels.
  if (!await page.evaluate(battleScreenshotAllowed)) throw failure('screenshot_battle_guard');
  const filename = `${role}-battle.png`;
  await io.mkdir(directory, { recursive: true });
  await io.writeFile(join(directory, filename), bytes, { flag: 'wx' });
  return { role, filename, capturedAfterSample: true, viewportOnly: true };
}

export function validateUiProgress(before, after) {
  if (before.length !== 2 || after.length !== 2) throw failure('battle_progress');
  return after.map((state, index) => {
    const prior = before[index];
    if (state.phase !== 'battle' || !state.connected || state.loadingVisible ||
        state.snapshotPacketsReceived <= prior.snapshotPacketsReceived ||
        state.inputPacketsSubmitted <= prior.inputPacketsSubmitted) throw failure('battle_progress');
    return { role: index ? 'guest' : 'host', phase: 'battle', connected: true,
      snapshotIncrease: state.snapshotPacketsReceived - prior.snapshotPacketsReceived,
      inputIncrease: state.inputPacketsSubmitted - prior.inputPacketsSubmitted };
  });
}

async function visible(page, selector) {
  return page.$eval(selector, (element) => element.getClientRects().length > 0)
    .catch(() => false);
}

async function nativeClick(page, selector, timeoutMs) {
  await page.bringToFront();
  await page.waitForSelector(selector, { visible: true, timeout: timeoutMs });
  await page.click(selector);
}

async function openPrivateMenu(page, timeoutMs) {
  await nativeClick(page, '.cot-battle-mode', timeoutMs);
  await nativeClick(page, '.cot-battle-choice[data-mode="private"]', timeoutMs);
  await nativeClick(page, '.cot-battle', timeoutMs);
  await page.waitForSelector('.cot-play.show [data-action="create"]', { visible: true, timeout: timeoutMs });
}

async function selectMenuOption(page, control, value, timeoutMs) {
  await nativeClick(page, `${control} [data-select-trigger]`, timeoutMs);
  await nativeClick(page, `${control} [role="option"][data-value="${value}"]`, timeoutMs);
}

/** Phase flips before asynchronous Garage restore; only uncovered native controls are usable. */
export function readProductionGarageReadiness() {
  const shown = (selector) => {
    const element = document.querySelector(selector);
    return !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  };
  return window.__DEBUG?.game?.phase === 'garage' && !shown('.cot-trans.on') && !shown('.cot-bl.on') &&
    (shown('.cot-battle') || shown('.cot-play.show [data-action="leave"]'));
}

async function nativeLeaveBattle(page, timeoutMs, onCleanupStage = () => {}) {
  onCleanupStage('battle_menu');
  await page.bringToFront();
  await page.keyboard.press('Escape');
  if (!await visible(page, '.cot-settings.open .leave')) {
    // The first Escape can belong to native pointer-lock release.
    await page.keyboard.press('Escape');
  }
  onCleanupStage('battle_leave');
  await nativeClick(page, '.cot-settings.open .leave', timeoutMs);
  onCleanupStage('garage_ready');
  await page.waitForFunction(readProductionGarageReadiness, { timeout: timeoutMs });
}

function productionRoomClosed() {
  return window.__DEBUG?.game?.phase === 'garage' && !window.__DEBUG?.network &&
    !new URL(location.href).searchParams.has('room');
}

async function closeOwnedRoom(page, timeoutMs, onCleanupStage = () => {}) {
  onCleanupStage('page_closed');
  if (!page || page.isClosed()) return false;
  onCleanupStage('state_read');
  const state = await page.evaluate(readUiState);
  const leftBattle = state.phase === 'battle';
  if (leftBattle) {
    try { await nativeLeaveBattle(page, timeoutMs, onCleanupStage); }
    catch (error) {
      // The host may close the room after this guest's battle-state read.
      // A vanished Leave button alone is not success: verify actual teardown.
      if (await page.evaluate(productionRoomClosed).catch(() => false)) return true;
      throw error;
    }
  }
  if (!(await page.evaluate(readUiState)).hasRoomUrl) return true;
  if (!await visible(page, '.cot-play.show [data-action="leave"]')) {
    // Retained room membership is reopened through the same native garage control.
    onCleanupStage('garage_ready');
    if (!leftBattle) await page.waitForFunction(readProductionGarageReadiness, { timeout: timeoutMs });
    onCleanupStage('room_menu');
    await nativeClick(page, '.cot-battle', timeoutMs);
    await page.waitForSelector('.cot-play.show [data-action="leave"]', { visible: true, timeout: timeoutMs });
  }
  onCleanupStage('room_leave');
  await nativeClick(page, '.cot-play.show [data-action="leave"]', timeoutMs);
  onCleanupStage('room_removed');
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('room'), { timeout: timeoutMs });
  return !(await page.evaluate(readUiState)).hasRoomUrl;
}

export async function cleanupProductionUi({ browser, pages, roomCreated }, timeoutMs = 10_000) {
  const roomCleanup = [];
  if (roomCreated) {
    // Host first: its explicit native Leave closes this exact room for both players.
    for (const [index, page] of pages.entries()) {
      let stage = 'state_read';
      const closed = await bounded(closeOwnedRoom(page, 3_000, (next) => { stage = next; }),
        timeoutMs, 'room_cleanup').catch(() => false);
      roomCleanup.push({ role: index ? 'guest' : 'host', closed, stage: closed ? 'complete' : stage });
    }
  }
  let browserClosed = !browser;
  if (browser) {
    try { await bounded(browser.close(), 5_000, 'browser_cleanup'); browserClosed = true; }
    catch (_) { browser.process()?.kill('SIGKILL'); }
  }
  return { roomCleanupVerified: !roomCreated || roomCleanup.every((row) => row.closed), browserClosed,
    ...(roomCreated ? { roomCleanup } : {}) };
}

async function freshPage(browser, origin, timeoutMs, owners, onPageError, measurePerformance, forceRelay) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  owners.pages.push(page);
  page.on('pageerror', onPageError);
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.setDefaultTimeout(Math.min(15_000, timeoutMs));
  page.setDefaultNavigationTimeout(Math.min(60_000, timeoutMs));
  if (forceRelay) await page.evaluateOnNewDocument(installProductionRelayPolicy);
  if (measurePerformance) await page.evaluateOnNewDocument(installFeedbackPeerObserver);
  await page.goto(`${origin}/${measurePerformance ? '?debug=1' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cot-battle-mode', { visible: true, timeout: Math.min(90_000, timeoutMs) });
  if (new URL(page.url()).origin !== origin) throw failure('frontend_origin');
  return page;
}

/** Native deployed controls only; never override endpoints, import /src, or change game state. */
export async function verifyProductionPrivateRoomUi({ url, timeoutMs = 300_000,
  launchBrowser = null, onStage = () => {}, measurePerformance = false, screenshots, ammoSlot,
  cpuTimeline = false, forceRelay = false, frameTrace = false, sourceProfile } = {}) {
  const options = productionUiOptions({ url, timeoutMs, screenshots, measurePerformance, ammoSlot,
    cpuTimeline, forceRelay, frameTrace, sourceProfile });
  const started = performance.now();
  const owners = { browser: null, pages: [], roomCreated: false };
  let stage = 'browser_launch';
  let problem;
  let result;
  let completedPerformance = null;
  let pageErrors = 0;
  const left = () => Math.max(1, timeoutMs - 27_000 - (performance.now() - started));
  const run = (next, action) => {
    stage = next;
    onStage(next);
    return bounded(Promise.resolve().then(action), left(), next);
  };
  try {
    const launch = launchBrowser || (async () => {
      const { default: puppeteer } = await import('puppeteer');
      return puppeteer.launch({ headless: true, timeout: Math.min(30_000, timeoutMs),
        protocolTimeout: 60_000, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--enable-webgl'] });
    });
    owners.browser = await launch();
    for (const role of ['host', 'guest']) {
      await run(`${role}_garage`, () => freshPage(owners.browser, options.origin, left(), owners,
        () => { pageErrors++; }, measurePerformance, forceRelay));
    }
    const [host, guest] = owners.pages;
    await run('private_controls', () => openPrivateMenu(host, left()));
    const modes = await host.$$eval('.cot-play [data-mode]', (elements) => elements.map((el) => el.dataset.mode));
    if (modes.join(',') !== 'solo,private,lan') throw failure('private_controls');
    // Read the built-in endpoint only. There is deliberately no endpoint override option.
    const endpoint = await host.$eval('.cot-play [data-field="signal"]', (el) => el.value);
    const signaling = new URL(endpoint);
    if (signaling.protocol !== 'wss:' || signaling.pathname !== '/rooms') throw failure('default_endpoint');
    await run('create_1v1_room', async () => {
      await selectMenuOption(host, '.cot-play [data-field="create-size"]', '1', left());
      owners.roomCreated = true;
      await nativeClick(host, '.cot-play [data-action="create"]', left());
      await host.waitForSelector('.cot-play .lobby.show .code', { visible: true, timeout: left() });
    });
    const code = await host.$eval('.cot-play .lobby.show .code', (el) => el.textContent.trim());
    if (!/^[A-Z0-9]{6}$/.test(code)) throw failure('room_code');
    const invite = new URL('/', options.origin);
    invite.searchParams.set('room', code);
    if (measurePerformance) invite.searchParams.set('debug', '1');
    await run('guest_native_invite', async () => {
      await guest.goto(invite.href, { waitUntil: 'domcontentloaded' });
      await guest.waitForFunction(() => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2,
        { timeout: left() });
      await host.waitForFunction(() => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2,
        { timeout: left() });
    });
    await run('ready_and_launch', async () => {
      await selectMenuOption(host, '.cot-play [data-control="map"]', 'winter', left());
      await nativeClick(guest, '.cot-play [data-action="ready"]', left());
      await nativeClick(host, '.cot-play [data-action="ready"]', left());
      await host.waitForFunction(() => document.querySelector('.cot-play [data-action="start"]')?.disabled === false,
        { timeout: left() });
      await nativeClick(host, '.cot-play [data-action="start"]', left());
    });
    await run('both_live_battles', () => Promise.all(owners.pages.map((page) => page.waitForFunction(() =>
      window.__DEBUG?.game?.phase === 'battle' && window.__DEBUG?.network?.connected === true &&
      !document.querySelector('.cot-bl.on'), { timeout: left() }))));
    const before = await Promise.all(owners.pages.map((page) => page.evaluate(readUiState)));
    await run('battle_progress', () => Promise.all(owners.pages.map((page, index) => page.waitForFunction((prior) =>
      window.__DEBUG.network.snapshotPacketsReceived > prior.snapshotPacketsReceived + 5 &&
      window.__DEBUG.network.inputPacketsSubmitted > prior.inputPacketsSubmitted + 5,
    { timeout: Math.min(10_000, left()) }, before[index]))));
    const after = await Promise.all(owners.pages.map((page) => page.evaluate(readUiState)));
    const peers = validateUiProgress(before, after);
    const performanceReceipt = measurePerformance ? await run('native_feedback_performance', async () => {
      const collect = async () => {
        const samples = [];
        const captures = [];
        for (const [index, page] of owners.pages.entries()) {
          const role = index ? 'guest' : 'host';
          samples.push({ role, ...await measureProductionFeedback(page, options, { role }) });
          if (options.screenshots) captures.push(await captureBattleScreenshot(page, options.screenshots, role));
          samples.at(-1).renderingContext = await page.evaluate(readProductionRenderingContext);
        }
        const receipt = { scenario: 'native-private-1v1-winter', sampleMsPerRole: 20_000,
          ammoSlot: options.ammoSlot ?? 1,
          viewport: [1280, 800], deviceScaleFactor: 1, cpuThrottle: 1,
          twoRenderedContextsSameMachine: true, foregroundRolesMeasuredSequentially: true,
          externalGpuContention: 'not-detected-or-controlled-by-this-probe',
          latencyMeaning: 'application-input-edge-to-confirmed-effect-and-next-rAF-callback-not-click-to-photon',
          samples, ...(options.screenshots ? { screenshots: captures } : {}) };
        completedPerformance = receipt;
        return receipt;
      };
      if (!options.forceRelay) return collect();
      const verified = await withProductionRelayValidation(owners.pages, collect);
      return { ...verified.result, relay: verified.relay };
    }) : null;
    await run('native_exit_and_room_close', async () => {
      await nativeLeaveBattle(host, left());
      await closeOwnedRoom(host, left());
      await guest.waitForFunction(() => window.__DEBUG?.game?.phase === 'garage' &&
        !window.__DEBUG?.network && !new URL(location.href).searchParams.has('room'), { timeout: left() });
    });
    if (pageErrors) throw failure('page_errors');
    result = { ok: true, freshBrowserContexts: 2, nativePrivate1v1: true, defaultRoomEndpoint: true,
      nativeInviteJoined: true, nativeReadyAndLaunch: true, peers, nativeExitAndRoomClose: true, pageErrors };
    if (performanceReceipt) result.performance = performanceReceipt;
  } catch (error) {
    problem = failure(error?.stage === 'relay_gameplay' ? 'relay_gameplay' : stage);
    Object.assign(problem, productionDiagnosticDetails(error));
    retainFailureEvidence(problem, { performance: completedPerformance,
      partialRelay: productionFailureEvidence(error).partialRelay });
    problem.lastStates = await Promise.all(owners.pages.map((page) =>
      bounded(page.evaluate(readUiState), 1_000, 'last_state').catch(() => null)));
  }
  const cleanup = await cleanupProductionUi(owners);
  if (problem) throw Object.assign(problem, { cleanup });
  if (!cleanup.browserClosed || !cleanup.roomCleanupVerified) throw retainFailureEvidence(
    Object.assign(failure('cleanup'), { cleanup }), { performance: completedPerformance, partialRelay: null });
  return { ...result, cleanup };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  try {
    const ammoSlot = option('ammo-slot');
    if ((ammoSlot !== undefined || process.argv.includes('--ammo-slot')) && !/^[123]$/.test(ammoSlot || '')) {
      throw new TypeError('ammo slot must be 1, 2, or 3');
    }
    if (process.argv.includes('--source-profile')) throw new TypeError('source profile must select host or guest');
    const result = await verifyProductionPrivateRoomUi({ url: option('url'),
      measurePerformance: process.argv.includes('--performance'),
      cpuTimeline: process.argv.includes('--cpu-timeline'),
      forceRelay: process.argv.includes('--force-relay'),
      frameTrace: process.argv.includes('--frame-trace'),
      sourceProfile: option('source-profile'),
      ammoSlot: ammoSlot === undefined ? undefined : Number(ammoSlot),
      screenshots: option('screenshots'),
      timeoutMs: option('timeout-ms') === undefined ? 300_000 : Number(option('timeout-ms')),
      onStage: (stage) => console.log(`[production-ui] ${stage}`) });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: 'production_private_room_ui_failed',
      ...productionDiagnosticDetails(error),
      ...productionFailureEvidence(error),
      stage: error?.stage || 'configuration', lastStates: error?.lastStates || null, cleanup: error?.cleanup || null }, null, 2));
    process.exitCode = 1;
  }
}
