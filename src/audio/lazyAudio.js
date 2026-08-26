/**
 * Boot-light audio facade.
 *
 * The full synthesized/spatial mixer is intentionally loaded only after
 * explicit sound intent. A Battle click still creates and resumes an
 * AudioContext synchronously inside the gesture, then starts this module's
 * tiny oscillator-only loading bed immediately. The dynamically imported
 * mixer adopts that exact context and replaces the fallback without an
 * autoplay-policy gap.
 */

function stopFallback(record, fadeS = 0.08) {
  if (!record) return;
  const { context, gain, nodes } = record;
  const now = context.currentTime;
  try {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
  } catch (_) { /* context may have been reclaimed */ }
  for (const node of nodes) {
    try { node.stop(now + fadeS + 0.02); } catch (_) { /* already stopped */ }
  }
  nodes[0].onended = () => {
    try { gain.disconnect(); } catch (_) { /* detached */ }
  };
}

/** Immediate loading sound: no fetch, decode, timer, or frame-loop work. */
export function startFallbackLoadingTone(context) {
  if (!context) return null;
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.08);
  gain.connect(context.destination);

  const rumble = context.createOscillator();
  rumble.type = 'sine';
  rumble.frequency.value = 54;
  const machinery = context.createOscillator();
  machinery.type = 'triangle';
  machinery.frequency.value = 108;
  const rumbleGain = context.createGain();
  const machineryGain = context.createGain();
  rumbleGain.gain.value = 0.72;
  machineryGain.gain.value = 0.14;
  rumble.connect(rumbleGain); rumbleGain.connect(gain);
  machinery.connect(machineryGain); machineryGain.connect(gain);

  // An unmistakable one-shot mechanical engage cue confirms the Battle click
  // even when the full mixer chunk has not arrived yet. Oscillator-only means
  // it starts in the gesture-created context with no fetch/decode dependency.
  const engage = context.createOscillator();
  engage.type = 'sawtooth';
  engage.frequency.setValueAtTime?.(148, now);
  engage.frequency.exponentialRampToValueAtTime?.(62, now + 0.24);
  const engageGain = context.createGain();
  engageGain.gain.setValueAtTime(0.0001, now);
  engageGain.gain.exponentialRampToValueAtTime(0.19, now + 0.008);
  engageGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  engage.connect(engageGain); engageGain.connect(gain);

  rumble.start(now); machinery.start(now); engage.start(now);
  engage.stop(now + 0.36);
  return { context, gain, nodes: [rumble, machinery, engage] };
}

export function createLazyAudio({
  loadMixer = () => import('./audio.js'),
  createContext = () => {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    return AC ? new AC({ latencyHint: 'interactive' }) : null;
  },
} = {}) {
  let context = null;
  let real = null;
  let modulePromise = null;
  let realPromise = null;
  let bus = null;
  let fallback = null;
  let loadingRequested = false;
  let ambientRequested = false;
  let muted = false;
  let garageStingPending = false;

  const unlockContext = () => {
    if (!context) context = createContext();
    if (!context) return null;
    if (context.state === 'suspended') context.resume();
    return context;
  };

  const settleReal = (created) => {
    real = created;
    if (bus) real.bindBus(bus);
    // createAudio may adopt an already-unlocked context. Construct its graph
    // before invoking methods that write graph nodes (mute/applyMaster). The
    // previous order rejected this promise and left a half-initialized mixer
    // whose first engine update tried to connect to a null bus.
    if (context) real.resume();
    real.mute(muted);
    if (fallback) {
      stopFallback(fallback);
      fallback = null;
    }
    real.loadingOn(loadingRequested);
    real.ambientOn(ambientRequested);
    if (garageStingPending) {
      garageStingPending = false;
      real.playGarageSting();
    }
    return real;
  };

  const preload = () => {
    if (!modulePromise) {
      modulePromise = loadMixer().catch((error) => {
        modulePromise = null;
        console.warn('[audio] deferred mixer load failed:', error);
        return null;
      });
    }
    return modulePromise;
  };

  const ensureReal = () => {
    if (real) return Promise.resolve(real);
    if (!realPromise) {
      realPromise = preload().then((module) => (
        module ? settleReal(module.createAudio({ context })) : null
      )).finally(() => {
        if (!real) realPromise = null;
      });
    }
    return realPromise;
  };

  const resume = () => {
    unlockContext();
    if (real) real.resume();
    else ensureReal();
  };

  const loadingOn = (on) => {
    loadingRequested = !!on;
    if (real) {
      real.loadingOn(loadingRequested);
      return;
    }
    if (loadingRequested) {
      const unlocked = unlockContext();
      if (unlocked && !fallback) fallback = startFallbackLoadingTone(unlocked);
      ensureReal();
    } else if (fallback) {
      stopFallback(fallback, 0.16);
      fallback = null;
    }
  };

  return {
    preload,
    resume,
    bindBus(nextBus) {
      bus = nextBus;
      if (real) real.bindBus(nextBus);
    },
    update(dt, listener, tanks) { real?.update(dt, listener, tanks); },
    setMasterVolume(value) { real?.setMasterVolume(value); },
    mute(on) {
      muted = !!on;
      if (fallback) fallback.gain.gain.value = muted ? 0.0001 : 0.055;
      real?.mute(muted);
    },
    playGarageSting() {
      if (real) real.playGarageSting();
      else { garageStingPending = true; ensureReal(); }
    },
    loadingOn,
    warmBattleEvents() {
      return ensureReal().then((mixer) => mixer?.warmBattleEvents?.());
    },
    ambientOn(on) {
      ambientRequested = !!on;
      real?.ambientOn(ambientRequested);
    },
    hitConfirm(kind, damage = 0) { real?.hitConfirm(kind, damage); },
    get ready() { return !!real; },
    get loadingActive() { return !!fallback || loadingRequested; },
  };
}
