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
  rumble.start(now); machinery.start(now);
  return { context, gain, nodes: [rumble, machinery] };
}

export function createLazyAudio() {
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
    if (!context) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      context = new AC({ latencyHint: 'interactive' });
    }
    if (context.state === 'suspended') context.resume();
    return context;
  };

  const settleReal = (created) => {
    real = created;
    if (bus) real.bindBus(bus);
    real.mute(muted);
    if (context) real.resume();
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
      modulePromise = import('./audio.js').catch((error) => {
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
    ambientOn(on) {
      ambientRequested = !!on;
      real?.ambientOn(ambientRequested);
    },
    hitConfirm(kind, damage = 0) { real?.hitConfirm(kind, damage); },
    get ready() { return !!real; },
    get loadingActive() { return !!fallback || loadingRequested; },
  };
}
