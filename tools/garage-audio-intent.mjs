// Serialized before page boot. Observe native construction without inspecting
// arguments/devices or changing options, methods, context state, or audio output.
export function installGarageAudioIntent() {
  if (window.__GARAGE_AUDIO_INTENT) throw new Error('Garage audio observer already installed');
  const LIMIT = 64, EVENT_LIMIT = 32;
  const pointerEvents = ['pointerdown', 'pointermove', 'pointerup',
    'pointercancel', 'gotpointercapture', 'lostpointercapture'];
  const owners = [], availableNames = [], installationErrors = [], invocations = [], events = [], proxies = new WeakMap();
  let count = 0, errorCount = 0, dropped = 0, eventsDropped = 0, stopped = false, gestureTarget = null;
  let stopResult = null;
  const snapshot = () => ({ count, errorCount, dropped, stopped,
    availableNames: [...availableNames],
    wrappedNames: owners.filter(owner => window[owner.name] === owner.wrapper).map(owner => owner.name),
    installationErrors: [...installationErrors],
    invocations: invocations.map(row => ({ ...row })),
    events: events.map(row => ({ ...row })), eventsDropped });
  const wrap = name => {
    const native = window[name];
    if (typeof native !== 'function') return;
    availableNames.push(name);
    const descriptor = Object.getOwnPropertyDescriptor(window, name);
    if (!descriptor || !('value' in descriptor) || (!descriptor.configurable && !descriptor.writable)) {
      installationErrors.push(`${name}: unsupported constructor property descriptor`);
      return;
    }
    const wrapper = proxies.get(native) ?? new Proxy(native, {
      construct(target, args, newTarget) {
        if (stopped) return Reflect.construct(target, args, newTarget);
        const row = { invocation: ++count, name, startMs: performance.now(), endMs: null, error: false };
        if (invocations.length < LIMIT) invocations.push(row);
        else dropped++;
        try { return Reflect.construct(target, args, newTarget); }
        catch (error) { row.error = true; errorCount++; throw error; }
        finally { row.endMs = performance.now(); }
      },
    });
    proxies.set(native, wrapper);
    Object.defineProperty(window, name, { ...descriptor, value: wrapper });
    owners.push({ name, wrapper, descriptor });
  };
  const onPointer = event => {
    if (!gestureTarget) return;
    if (events.length >= EVENT_LIMIT) { eventsDropped++; return; }
    events.push({ type: event.type, trusted: event.isTrusted, canvasTarget: event.target === gestureTarget,
      atMs: performance.now(), x: event.clientX, y: event.clientY, buttons: event.buttons,
      movementX: event.movementX ?? null, movementY: event.movementY ?? null,
      pointerId: event.pointerId ?? null, pointerType: event.pointerType ?? null, button: event.button ?? null });
  };
  const api = {
    snapshot,
    armGesture(target) {
      if (stopped || gestureTarget) throw new Error('Garage gesture observer is not idle');
      gestureTarget = target;
      events.length = 0;
      eventsDropped = 0;
    },
    finishGesture() { gestureTarget = null; return snapshot(); },
    stop() {
      if (stopResult) return stopResult;
      stopped = true;
      gestureTarget = null;
      for (const type of pointerEvents) document.removeEventListener(type, onPointer, true);
      const cleanup = { restoredNames: [], notOwnedNames: [], failedNames: [] };
      for (const owner of owners) {
        if (window[owner.name] !== owner.wrapper) { cleanup.notOwnedNames.push(owner.name); continue; }
        try {
          Object.defineProperty(window, owner.name, owner.descriptor);
          cleanup.restoredNames.push(owner.name);
        } catch (_) { cleanup.failedNames.push(owner.name); }
      }
      if (window.__GARAGE_AUDIO_INTENT === api) delete window.__GARAGE_AUDIO_INTENT;
      stopResult = { ...snapshot(), cleanup };
      return stopResult;
    },
  };
  window.__GARAGE_AUDIO_INTENT = api;
  try {
    for (const name of ['AudioContext', 'webkitAudioContext']) wrap(name);
    for (const type of pointerEvents) document.addEventListener(type, onPointer, true);
  } catch (error) { api.stop(); throw error; }
}

// Self-contained page reader: actual production camera/showroom owners only.
export function readGarageAudioIntent() {
  const d = window.__DEBUG, orbit = d?.showroom?.debugState(), visual = d?.pedestalVisual;
  const showroomState = () => ({ moving: d?.showroom?.moving ?? null, dragging: orbit?.dragging ?? null,
    sinceInputS: orbit?.sinceInputS ?? null, pitchDeg: orbit?.pitchDeg ?? null });
  const frameState = () => ({
    frameLoopScheduler: d?.frameLoopScheduler ?? null, garageFramePacer: d?.garageFramePacer ?? null,
    rendererFrame: d?.renderer?.info?.render?.frame ?? null, graphicsContextLost: d?.graphicsContextLost ?? null,
    garageGpuResidency: d?.garageGpuResidency ?? null });
  const pedestalState = () => ({ specId: visual?.specId ?? null, onStage: d?.pedestalOnStage ?? null,
    rootUuid: visual?.root?.uuid ?? null, rootPosition: visual?.root?.position?.toArray() ?? null,
    rootVisible: visual?.root?.visible ?? null, compiling: visual?.__pedestalCompiling ?? null,
    compilePending: !!visual?.__pedestalCompileP });
  return { atMs: performance.now(), observer: window.__GARAGE_AUDIO_INTENT?.snapshot() ?? null,
    phase: d?.game?.phase ?? null, showroomActive: d?.showroom?.active === true,
    yawDeg: orbit?.yawDeg ?? null, quaternion: d?.camera?.quaternion?.toArray() ?? null,
    showroomState: showroomState(), pedestalState: pedestalState(), ...frameState(),
    pedestalTrace: Array.isArray(window.__PED_TRACE) ? window.__PED_TRACE.slice(-8).map(row => ({ ...row })) : [],
    visibility: { hidden: document.hidden, state: document.visibilityState, focused: document.hasFocus() },
    stage: orbit?.stage ?? null };
}

// showroom.debugState().stage is NDC, not CSS pixels (cameraRig.ts).
// Each converted candidate stays inside both the stage and the viewport.
export function garageAudioGestureCandidates(stage, viewport) {
  if (![stage?.cx, stage?.cy, stage?.hx, stage?.hy, viewport?.width, viewport?.height].every(Number.isFinite)) {
    throw new Error('Garage gesture requires finite stage and viewport receipts');
  }
  const cx = (stage.cx + 1) * viewport.width / 2, cy = (1 - stage.cy) * viewport.height / 2;
  const hx = stage.hx * viewport.width / 2, hy = stage.hy * viewport.height / 2;
  const left = Math.max(12, cx - hx + 12), right = Math.min(viewport.width - 12, cx + hx - 12);
  const top = Math.max(12, cy - hy + 12), bottom = Math.min(viewport.height - 12, cy + hy - 12);
  if (right - left < 120 || bottom - top < 24) throw new Error('Garage stage is too small for a bounded canvas drag');
  const x = Math.round((left + right) / 2 - 50);
  return [0.5, 0.35, 0.65].map(fraction => ({ start: { x, y: Math.round(top + (bottom - top) * fraction) },
    end: { x: x + 100, y: Math.round(top + (bottom - top) * fraction) } }));
}

function checkObserver(snapshot, label, expectedCount) {
  const observer = snapshot?.observer;
  if (!observer || observer.stopped || !observer.availableNames?.length
    || observer.availableNames.some(name => !observer.wrappedNames?.includes(name))
    || observer.installationErrors?.length || observer.dropped || observer.errorCount) {
    return [`${label}: missing, incomplete, or failed native AudioContext observation`];
  }
  const failures = [];
  if (observer.count !== expectedCount) failures.push(`${label}: expected ${expectedCount} AudioContext constructors, observed ${observer.count}`);
  if (observer.invocations.length !== observer.count || observer.invocations.some(row => row.error
    || !Number.isFinite(row.startMs) || !Number.isFinite(row.endMs) || row.endMs < row.startMs)) {
    failures.push(`${label}: incomplete AudioContext constructor timing`);
  }
  return failures;
}

export function checkGarageAudioGesture(receipt) {
  const failures = [];
  const before = receipt?.before, after = receipt?.after;
  failures.push(...checkObserver(before, 'Garage before gesture', 0), ...checkObserver(after, 'Garage after gesture', 0));
  if (before?.phase !== 'garage' || after?.phase !== 'garage' || !before?.showroomActive || !after?.showroomActive) {
    failures.push('Garage gesture: production showroom was not active throughout');
  }
  if (receipt?.canvasHitVerified !== true) failures.push('Garage gesture: input path did not hit the actual renderer canvas');
  const events = after?.observer?.events ?? [];
  for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
    if (!events.some(event => event.type === type && event.trusted && event.canvasTarget
      && (type !== 'pointermove' || event.buttons === 1))) failures.push(`Garage gesture: missing trusted canvas ${type}`);
  }
  if (after?.observer?.eventsDropped) failures.push('Garage gesture: incomplete pointer event evidence');
  const yawMoved = Number.isFinite(before?.yawDeg) && Number.isFinite(after?.yawDeg) && Math.abs(after.yawDeg - before.yawDeg) > 0.1;
  const a = before?.quaternion, b = after?.quaternion;
  const poseMoved = a?.length === 4 && b?.length === 4 && a.every(Number.isFinite) && b.every(Number.isFinite)
    && Math.min(...[1, -1].map(sign => Math.hypot(...a.map((value, index) => value - sign * b[index])))) > 0.0001;
  if (!yawMoved && !poseMoved) failures.push('Garage gesture: production showroom yaw/camera did not move');
  if (!Number.isFinite(receipt?.observationMs) || receipt.observationMs < 1000) {
    failures.push('Garage gesture: missing bounded post-input async observation window');
  }
  return failures;
}

export function checkGarageAudioIntent(receipt, actions) {
  const failures = checkGarageAudioGesture(receipt);
  for (const action of ['battle', 'battle-again', 'return-to-garage']) {
    failures.push(...checkObserver(actions.find(row => row.action === action)?.garageAudioIntent, action, 1));
  }
  return failures;
}

/** Separate from the zero-constructor Garage-orbit gate: only a real splash
 * entry gesture may pay silent preparation before the first Battle click. */
export function checkBootAudioIntent(receipt, actions) {
  const failures = [
    ...checkObserver(receipt?.before, 'Before boot entry', 0),
    ...checkObserver(receipt?.after, 'After boot entry', 1),
  ];
  if (receipt?.opaqueBefore !== true || receipt?.gateReady !== true || receipt?.dismissed !== true) failures.push('Boot entry: missing opaque ready gate or dismissal');
  if (!receipt?.after?.observer?.events?.some(event => event.type === 'pointerdown' && event.trusted && event.canvasTarget)) failures.push('Boot entry: missing trusted gate pointer');
  if (receipt?.after?.observer?.eventsDropped) failures.push('Boot entry: incomplete pointer observation');
  if (!Number.isFinite(receipt?.armedAtMs) || !Number.isFinite(receipt?.finishedAtMs)
      || !(receipt.finishedAtMs > receipt.armedAtMs)) failures.push('Boot entry: missing timing edges');
  const invocation = receipt?.after?.observer?.invocations?.[0];
  if (!(invocation?.startMs >= receipt?.armedAtMs && invocation?.endMs <= receipt?.finishedAtMs)) failures.push('Boot entry: constructor is outside the observed gesture');
  // Production entry runs in window capture; this observer runs in document
  // capture of that same trusted pointer, before target/bubble or any microtask.
  const pointer = receipt?.after?.observer?.events?.find(event => event.type === 'pointerdown' && event.trusted && event.canvasTarget);
  if (!Number.isFinite(pointer?.atMs) || !(invocation?.endMs <= pointer.atMs)) failures.push('Boot entry: construction was not synchronous in the entry handler');
  for (const action of ['battle', 'battle-again', 'return-to-garage']) {
    failures.push(...checkObserver(actions.find(row => row.action === action)?.garageAudioIntent, action, 1));
  }
  return failures;
}
