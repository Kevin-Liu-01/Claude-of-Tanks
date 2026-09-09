import { startMultiplayerSourceProfile, sourceProfileFailureDetails } from './multiplayer-source-profile.mjs';
import { browserOperationFailure } from './browser-failure-evidence.mjs';

/** Browser-local, read-only diagnostics. Never retain room/player text or URLs.
 * RAF timestamps are callbacks, not presentation/photons; render.frame includes
 * offscreen submissions. These counters are evidence, not a dual-render claim.
 */
export function installProductionEntryObserver() {
  globalThis.__COT_PRODUCTION_ENTRY?.stop();
  const limits = { frames: 6000, transitions: 256, longTasks: 256 };
  const state = { startedAt: performance.now(), launchAt: null, bothHiddenAt: null,
    stoppedAt: null, frames: [], transitions: [], longTasks: [],
    framesDropped: 0, transitionsDropped: 0, longTasksDropped: 0,
    rafCallbacks: 0, maxRafGapMs: 0, firstLoaderHidden: null, loaderSeen: false,
    longTaskObserver: false, countdown: [], foregroundCountdown: [] };
  let raf = null;
  let observer = null;
  let previousAt = null;
  let previousSignature = '';
  let stoppedReceipt = null;
  const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const nonnegative = (value) => {
    const number = finite(value);
    return number !== null && number >= 0 ? number : null;
  };
  const prefetchCounters = () => {
    const value = window.__WORLD_PREFETCH;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return Object.fromEntries(['requested', 'completed', 'joined', 'promoted',
      'cancelled', 'skippedCapacity', 'lastMs'].map((key) => [key, nonnegative(value[key])]));
  };
  const prefetchAtStart = prefetchCounters();
  let prefetchAtLaunch = null;
  const counters = () => ({
    animationTicks: finite(window.__DEBUG?.frameLoopScheduler?.animationTicks),
    backgroundTicks: finite(window.__DEBUG?.frameLoopScheduler?.backgroundTicks),
    rendererFrame: finite(window.__DEBUG?.renderer?.info?.render?.frame),
    programCount: Array.isArray(window.__DEBUG?.renderer?.info?.programs)
      ? window.__DEBUG.renderer.info.programs.length : null,
  });
  const append = (key, value) => {
    if (state[key].length < limits[key]) state[key].push(value);
    else state[`${key}Dropped`]++;
  };
  const stageNames = ['Opening battle channel', 'Securing match channel', 'Loading battlefield',
    'Synchronizing authority', 'Warming suspension terrain', 'Priming wreck variants',
    'Preparing player panel', 'Priming combat effects', 'Compiling combat shaders', 'Ready', 'Restoring Garage'];
  const sample = () => {
    const loader = document.querySelector('.cot-bl');
    const overlay = document.querySelector('.cot-prebattle');
    const loaderStyle = loader ? getComputedStyle(loader) : null;
    const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    const text = overlay?.querySelector('.n')?.textContent?.trim();
    const label = loader?.querySelector('.fstage')?.textContent?.trim();
    const phase = window.__DEBUG?.game?.phase;
    return { at: performance.now(), phase: ['garage', 'battle', 'ended'].includes(phase) ? phase : null,
      focused: document.hasFocus(), hidden: document.hidden,
      loaderOn: loader?.classList.contains('on') || false,
      loaderHidden: !!loader && loaderStyle.display === 'none',
      loaderOpacity: loader ? finite(Number(loaderStyle.opacity)) : null,
      loaderStage: stageNames.includes(label) ? label : label?.startsWith('Painting ') ? 'Painting vehicle' : null,
      progress: finite(Number(loader?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'))),
      waiting: overlay?.classList.contains('waiting') || false,
      countdown: /^[1-5]$/.test(text || '') ? Number(text) : null,
      rollout: text === 'ROLL OUT!',
      overlayVisible: !!overlay?.getClientRects().length &&
        overlayStyle?.visibility !== 'hidden' && Number(overlayStyle?.opacity) > 0,
      ...counters() };
  };
  const remember = (frame) => {
    if (frame.loaderOn) state.loaderSeen = true;
    if (state.loaderSeen && frame.loaderHidden && !state.firstLoaderHidden) state.firstLoaderHidden = frame;
    const signature = JSON.stringify([frame.phase, frame.loaderOn, frame.loaderHidden,
      frame.loaderStage, frame.waiting, frame.countdown, frame.rollout, frame.focused, frame.hidden]);
    if (signature !== previousSignature) { append('transitions', frame); previousSignature = signature; }
    if (frame.countdown !== null && state.countdown.at(-1) !== frame.countdown && state.countdown.length < 32) {
      state.countdown.push(frame.countdown);
    }
    if (frame.countdown !== null && frame.loaderHidden && frame.overlayVisible && frame.focused &&
        !frame.hidden && state.foregroundCountdown.at(-1) !== frame.countdown && state.foregroundCountdown.length < 32) {
      state.foregroundCountdown.push(frame.countdown);
    }
  };
  const tick = () => {
    if (state.stoppedAt !== null) return;
    const frame = sample();
    if (previousAt !== null) state.maxRafGapMs = Math.max(state.maxRafGapMs, frame.at - previousAt);
    previousAt = frame.at;
    state.rafCallbacks++;
    append('frames', frame);
    remember(frame);
    raf = requestAnimationFrame(tick);
  };
  const ingestTasks = (entries) => {
    for (const entry of entries) if (finite(entry.startTime) !== null && finite(entry.duration) !== null &&
        entry.startTime >= state.startedAt) append('longTasks', { at: entry.startTime, durationMs: entry.duration });
  };
  try {
    observer = new PerformanceObserver((list) => ingestTasks(list.getEntries()));
    observer.observe({ type: 'longtask', buffered: false });
    state.longTaskObserver = true;
  } catch { observer = null; }
  // Bounded numeric build details and fixed slow-slice tags retain attribution
  // without error messages, URLs, identities, or arbitrary string-valued telemetry.
  const numericTree = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 3) return null;
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 64)) {
      if (!/^[a-z][A-Za-z0-9]{0,47}$/.test(key)) continue;
      if (finite(item) !== null) output[key] = item;
      else if (item && typeof item === 'object') output[key] = numericTree(item, depth + 1);
    }
    return output;
  };
  const worldSliceStages = {
    propsDetail: ['yard-clutter', 'boundary-walls', 'village-well', 'settlement-dressing',
      'military-clutter', 'hay-and-crates', 'roadside-utilities', 'rock-variants', 'tactical-outcrops',
      'surface-rocks', 'embedded-rocks', 'boulder-outcrops', 'rock-instances', 'field-haystacks',
      'field-logs-and-stumps', 'finalize'],
    vegetationDetail: ['grassPrep', 'grassScatter', 'grassCarpet', 'treePrep', 'treeClusters',
      'treeLoneAndBelts', 'treeRimAndMeshes', 'treeRootDecals', 'bushes', 'finalize', 'other'],
  };
  const slowestSlices = (value, family) => Array.isArray(value) ? value.slice(0, 8).flatMap((row) => {
    const ms = nonnegative(row?.ms);
    if (ms === null) return [];
    if (worldSliceStages[family].includes(row?.stage)) return [{ stage: row.stage, ms }];
    // Props' unnamed generator checkpoints encode only their bounded ordinal.
    const match = family === 'propsDetail' && typeof row?.stage === 'string'
      ? /^slice-(0|[1-9]\d{0,3})$/.exec(row.stage) : null;
    return match && Number(match[1]) < 4096 ? [{ stage: 'slice', index: Number(match[1]), ms }] : [];
  }) : [];
  const worldBuildDetail = (value) => {
    const detail = numericTree(value);
    if (!detail) return detail;
    for (const family of Object.keys(worldSliceStages)) {
      const source = value[family];
      if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
      detail[family] = { ...numericTree(source, 1), slowest: slowestSlices(source.slowest, family) };
    }
    return detail;
  };
  const networkStageNames = ['modulesWorldAndConnect', 'roster', 'initialSnapshot',
    'atmosphere', 'terrainGrid', 'wreckWarm', 'panelMasks', 'compile', 'panelJoin', 'combatWarm', 'reveal', 'readyBarrier'];
  const intervals = (value, allowedStages, limit = 32) => Array.isArray(value) ? value.slice(0, limit)
    .filter((row) => allowedStages.includes(row?.stage))
    .map((row) => ({ stage: row.stage, startTime: finite(row.startTime), endTime: finite(row.endTime) })) : [];
  const nativeOperations = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const keys = ['render', 'copyTextureToTexture', 'setRenderTarget', 'clear',
      'getUniformLocation', 'getProgramParameter', 'getParameter', 'getLinkStatus', 'getActiveUniform', 'shaderDiagnostics'];
    return { operations: Object.fromEntries(keys.filter((key) => value[key]
      && typeof value[key] === 'object' && !Array.isArray(value[key]))
      .map((key) => [key, Object.fromEntries(['count', 'totalMs', 'maxMs']
        .map((field) => [field, nonnegative(value[key][field])]))])) };
  };
  const newProgramTypes = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { newProgramTypes: Object.fromEntries(['depth', 'distance', 'standard', 'basic', 'shader', 'raw', 'other']
      .map((key) => [key, nonnegative(value[key])])) };
  };
  const programCompileReceipt = (value) => {
    if (!value || typeof value !== 'object') return null;
    const receipt = Object.fromEntries(['targetBindMs', 'submissionMs', 'targetRestoreMs', 'programsBefore', 'programsAfter',
      'maxSubmissionMs', 'submissionSlices', 'extensionMs', 'queryMs', 'maxQueryMs', 'queryCount',
      'existingQueryMs', 'maxExistingQueryMs', 'existingQueryCount', 'newQueryMs', 'maxNewQueryMs', 'newQueryCount',
      'pollMs', 'maxPollMs', 'pollCount', 'yields',
      'uniformMs', 'maxUniformMs', 'uniformCount', 'uniformFailures', 'uniformYields', 'uniformPending', 'uniformReused',
      'openingRenderMs']
      .map((key) => [key, finite(value[key])]));
    // Pass ordinals identify the fixed production chain without serializing
    // class/material names, arbitrary labels, or scene/user metadata.
    if (Array.isArray(value.openingPasses)) receipt.openingPasses = value.openingPasses.slice(0, 16)
      .filter((row) => Number.isSafeInteger(row?.index) && row.index >= 0 && row.index < 16)
      .map((row) => ({ index: row.index, renderMs: nonnegative(row.renderMs),
        programsBefore: nonnegative(row.programsBefore), programsAfter: nonnegative(row.programsAfter),
        ...nativeOperations(row.operations), ...newProgramTypes(row.newProgramTypes) }));
    return receipt;
  };
  const topMaskReadbacks = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { readbacks: Object.fromEntries(['hull', 'turret'].map((layer) => {
      const timings = value[layer];
      if (!timings || typeof timings !== 'object' || Array.isArray(timings)) return [layer, null];
      return [layer, Object.fromEntries(['contextQuery', 'createBuffer', 'bindingQuery',
        'bindBuffer', 'bufferData', 'sizeQuery', 'readPixels', 'fence', 'flush', 'wait', 'copy', 'release']
        .map((stage) => [stage, nonnegative(timings[stage])]))];
    })) };
  };
  const worldLoadReceipt = (world) => world ? {
    id: world.id === 'winter' ? 'winter' : null, cached: typeof world.cached === 'boolean' ? world.cached : null,
    status: ['pending', 'complete', 'failed'].includes(world.status) ? world.status : null,
    startedAt: finite(world.startedAt), endedAt: finite(world.endedAt), totalMs: finite(world.totalMs),
    timings: Object.fromEntries(['build', 'present', 'compile', 'shadowWarm', 'clouds', 'activate']
      .map((key) => [key, finite(world[key])])),
    stageIntervals: Array.isArray(world.stageIntervals) ? world.stageIntervals.slice(0, 32)
      .filter((row) => ['build', 'present', 'compile', 'shadowWarm', 'clouds', 'activate'].includes(row?.stage))
      .map((row) => ({ stage: row.stage, startTime: finite(row.startTime), endTime: finite(row.endTime) })) : [],
    buildDetail: worldBuildDetail(world.buildDetail), error: !!world.error,
  } : null;
  const receipt = () => {
    const network = window.__NETWORK_LOAD;
    const world = window.__WORLD_LOAD;
    const topMask = window.__TOP_MASK_LOAD;
    const end = counters();
    const delta = Object.fromEntries(Object.keys(end).map((key) => [key,
      end[key] !== null && state.startCounters[key] !== null &&
        (key === 'programCount' || end[key] >= state.startCounters[key])
        ? end[key] - state.startCounters[key] : null]));
    const finalFrame = sample();
    const reveal = window.__BATTLE_REVEAL;
    return { ...state, limits, clock: 'page-performance-now-ms', endCounters: end, counterDeltas: delta,
      worldPrefetch: { start: prefetchAtStart, launch: prefetchAtLaunch, end: prefetchCounters() },
      readiness: { phase: finalFrame.phase, loaderHidden: finalFrame.loaderHidden,
        connected: window.__DEBUG?.network?.connected === true,
        postAvailable: !!window.__DEBUG?.post?.composer,
        reveal: reveal ? { primed: reveal.primed === true, frameSerial: finite(reveal.frameSerial),
          waitMs: finite(reveal.waitMs) } : null },
      networkLoad: network ? {
        map: network.map === 'winter' ? 'winter' : null,
        status: ['pending', 'complete', 'failed'].includes(network.status) ? network.status : null,
        startedAt: finite(network.startedAt), endedAt: finite(network.endedAt),
        stageIntervals: intervals(network.stageIntervals, networkStageNames),
        ...(Array.isArray(network.preparationSlices) ? {
          preparationSlices: intervals(network.preparationSlices, ['rosterAssets', 'panelMasks', 'compile'], 3),
        } : {}),
        ...(Object.hasOwn(network, 'rosterAssetsFailed') ? {
          rosterAssetsFailed: typeof network.rosterAssetsFailed === 'boolean' ? network.rosterAssetsFailed : null,
        } : {}),
        revealSlices: intervals(network.revealSlices,
          ['activation', 'finalShadows', 'blackWatchdog', 'primeReveal', 'loaderFade']),
        modulesMs: finite(network.modulesMs), worldMs: finite(network.worldMs),
        connectMs: finite(network.connectMs), totalMs: finite(network.totalMs),
        stages: numericTree(network.stages),
        programCompile: programCompileReceipt(network.programCompile),
        scarCompile: programCompileReceipt(network.scarCompile),
        shadowPrime: network.shadowPrime ? {
          ...Object.fromEntries(['cascadeCount', 'totalMs', 'maxMs']
            .map((key) => [key, finite(network.shadowPrime[key])])),
          ...(network.shadowPrime.casterWarmup ? { casterWarmup: {
            ...Object.fromEntries(['batches', 'casterCount', 'totalMs', 'maxMs']
              .map((key) => [key, finite(network.shadowPrime.casterWarmup[key])])),
            batchMs: Array.isArray(network.shadowPrime.casterWarmup.batchMs)
              ? network.shadowPrime.casterWarmup.batchMs.slice(0, 128).map(finite) : [],
          } } : {}),
        } : null,
        blackCheck: network.blackCheck ? { before: finite(network.blackCheck.before),
          after: finite(network.blackCheck.after), rescued: network.blackCheck.rescued === true,
          error: !!network.blackCheck.error || network.blackCheck.failed === true,
          measurements: Array.isArray(network.blackCheck.measurements)
            ? network.blackCheck.measurements.slice(0, 8).map((row) => ({
              ...Object.fromEntries(['startTime', 'endTime', 'setupMs', 'renderMs', 'readbackMs', 'enqueueMs', 'waitMs',
                'reduceMs', 'restoreMs', 'programsBeforeRender', 'programsAfterRender']
                .map((key) => [key, finite(row?.[key])])),
              ...(row?.readbackSteps && typeof row.readbackSteps === 'object' ? {
                readbackSteps: Object.fromEntries(['contextQuery', 'createBuffer', 'bindingQuery',
                  'bindBuffer', 'bufferData', 'sizeQuery', 'readPixels', 'fence', 'flush', 'wait', 'copy', 'release']
                  .map((key) => [key, finite(row.readbackSteps[key])])),
              } : {}),
            })) : [],
        } : null,
      } : null,
      worldLoad: worldLoadReceipt(world),
      topMaskLoad: topMask && typeof topMask === 'object' && !Array.isArray(topMask) ? {
        status: ['pending', 'complete', 'failed'].includes(topMask.status) ? topMask.status : null,
        startedAt: finite(topMask.startedAt), endedAt: finite(topMask.endedAt),
        intervals: intervals(topMask.intervals, ['clone', 'build', 'hullCompile', 'hullRender', 'hullReadback',
          'hullCanvas', 'turretCompile', 'turretRender', 'turretReadback', 'turretCanvas'], 16),
        ...topMaskReadbacks(topMask.readbacks),
      } : null };
  };
  state.startCounters = counters();
  globalThis.__COT_PRODUCTION_ENTRY = {
    mark(action) {
      if (action === 'launch') {
        state.launchAt = performance.now(); state.startCounters = counters();
        prefetchAtLaunch = prefetchCounters();
      }
      if (action === 'both-hidden') state.bothHiddenAt = performance.now();
      remember(sample());
    },
    read: () => stoppedReceipt ?? receipt(),
    stop() {
      if (state.stoppedAt === null) {
        state.stoppedAt = performance.now();
        cancelAnimationFrame(raf);
        if (observer) { ingestTasks(observer.takeRecords()); observer.disconnect(); }
        remember(sample());
        stoppedReceipt = receipt();
      }
      return stoppedReceipt;
    },
  };
  remember(sample());
  raf = requestAnimationFrame(tick);
}

export function readProductionEntryObserver(action = 'read') {
  const owner = globalThis.__COT_PRODUCTION_ENTRY;
  if (!owner) return null;
  if (action === 'stop') return owner.stop();
  if (action !== 'read') { owner.mark(action); return null; }
  return owner.read();
}

export function productionBattleLoaderHidden() {
  const loader = document.querySelector('.cot-bl');
  return window.__DEBUG?.game?.phase === 'battle' && window.__DEBUG?.network?.connected === true &&
    !!loader && getComputedStyle(loader).display === 'none';
}

function boundedRead(page, operation, argument) {
  let timer;
  return Promise.race([Promise.resolve().then(() => page.evaluate(operation, argument)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(
      new Error('entry_observer_command_failed'), { operationFailure: 'command-timeout' })), 2000); })])
    .finally(() => clearTimeout(timer));
}

async function readPeerEvidence(page, role, readContext) {
  const peer = { role, observation: null, renderingContext: null,
    observationFailure: null, renderingContextFailure: null };
  try { peer.observation = await boundedRead(page, readProductionEntryObserver, 'stop'); }
  catch (error) { peer.observationFailure = browserOperationFailure(error); }
  if (readContext) {
    try { peer.renderingContext = await boundedRead(page, readContext); }
    catch (error) { peer.renderingContextFailure = browserOperationFailure(error); }
  }
  return peer;
}

/** Profiles only Start -> both loader-hidden boundaries; longer entries retain
 * the existing profiler's 25-second partial window. DOM observation may continue
 * through countdown, but never claims background text was actually visible.
 */
export async function observeProductionEntry(pages, options, enter, {
  startProfile = startMultiplayerSourceProfile, onEvidence = () => {}, afterReveal = async () => {},
  readContext = null,
} = {}) {
  let profile;
  let capture = null;
  let profileFailure = null;
  let profileDiagnostics = null;
  let problem;
  let stopped = false;
  const selectedRole = ['host', 'guest'].includes(options.entryProfile) ? options.entryProfile : null;
  const stopProfile = async () => {
    if (!profile || stopped) return;
    stopped = true;
    try { capture = await profile.stop(); }
    catch (error) {
      profileFailure = 'source_profile_stop_failed';
      profileDiagnostics = sourceProfileFailureDetails(error);
      if (!problem) problem = error;
    }
  };
  try {
    await Promise.all(pages.map((page) => boundedRead(page, installProductionEntryObserver)));
    if (selectedRole) {
      try { profile = await startProfile(pages[selectedRole === 'host' ? 0 : 1], { origin: options.origin }); }
      catch (error) {
        profileFailure = 'source_profile_start_failed';
        profileDiagnostics = sourceProfileFailureDetails(error);
        throw error;
      }
    }
    await Promise.all(pages.map((page) => boundedRead(page, readProductionEntryObserver, 'launch')));
    await enter();
    await Promise.all(pages.map((page) => boundedRead(page, readProductionEntryObserver, 'both-hidden')));
    await stopProfile();
    if (!problem) await afterReveal();
  } catch (error) { problem = error; }
  finally {
    await stopProfile();
    const peers = await Promise.all(pages.map((page, index) =>
      readPeerEvidence(page, index ? 'guest' : 'host', readContext)));
    const selected = selectedRole ? peers[selectedRole === 'host' ? 0 : 1]?.observation : null;
    const fullyCovered = !!capture && Number.isFinite(selected?.launchAt) && Number.isFinite(selected?.bothHiddenAt) &&
      capture.startAfterPageTimeMs <= selected.launchAt &&
      capture.startBeforePageTimeMs + capture.profileDurationMs >= selected.bothHiddenAt;
    onEvidence({ selectedRole, diagnosticOverhead: true,
      scope: selectedRole ? 'source-profile-start-to-both-loaders-hidden; DOM-through-countdown'
        : 'timings-only-start-to-both-loaders-hidden; DOM-through-countdown',
      sourceProfile: capture ? { ...capture, entryFullyCovered: fullyCovered,
        entryStartOffsetMs: selected?.launchAt - capture.baselinePageTimeMs,
        entryEndOffsetMs: selected?.bothHiddenAt === null ? null : selected?.bothHiddenAt - capture.baselinePageTimeMs } : null,
      profileFailure, profileDiagnostics, peers });
  }
  if (problem) throw problem;
}
