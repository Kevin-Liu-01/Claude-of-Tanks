/**
 * Continuous aircraft sound for the Drone and AC-130 modes.
 *
 *   world – an aircraft heard from outside: one motor or engine loop placed in
 *           the listener frame (its distance law, air absorption, pan and
 *           Doppler), pitched by the drone's speed
 *   own   – the pilot's or crew's perspective: flying the drone, its motors
 *           are the lead sound (a hover hum crossfading into the full-throttle
 *           buzz with motor load, pitched by load, spooling up at launch and
 *           sagging with the battery), the wind rising with speed and the
 *           link's hiss toward the edge of its range and the end of its
 *           battery; or the gunship's cabin drone
 *
 * Every rig ends in one gain → lowpass → stereo pan chain on its bus.
 */

import {
  airAbsorptionCutoffHz, clamp, dbToGain, distanceAttenuationDb,
  type AtmosphereProfile, type RelativePosition,
} from './audioMath.ts';
import type { AssetLibrary } from './assetLibrary.ts';
import type { Mixer } from './mixer.ts';

type AerialKind = 'drone' | 'gunship';
type AerialPerspective = 'world' | 'own';

/**
 * Per aircraft: the loops, the world distance law (a small drone is loud close
 * and gone in a few hundred metres; four turboprops carry across the map) and
 * the own-perspective level and feed band.
 */
const AERIAL_SOUND = Object.freeze({
  drone: Object.freeze({ loop: 'drone_fpv_loop', ownLoop: 'drone_fpv_loop', hoverLoop: 'drone_fpv_hover_loop', windLoop: 'drone_wind_loop', refM: 6, rolloff: 1, maxM: 500, ownLevelDb: -1, ownCutoffHz: 9000, rate: [0.9, 1.2] as const }),
  gunship: Object.freeze({ loop: 'gunship_orbit_loop', ownLoop: 'gunship_cabin_loop', hoverLoop: null, windLoop: null, refM: 80, rolloff: 0.8, maxM: 3000, ownLevelDb: -5, ownCutoffHz: 20000, rate: [1, 1] as const }),
});

interface AerialDeps {
  readonly mixer: Mixer;
  readonly library: AssetLibrary;
  readonly random: () => number;
  readonly reverb: boolean;
}

/** Per-frame facts the engine resolves for an aircraft. */
export interface AerialFrame {
  rel: RelativePosition;
  atmosphere: AtmosphereProfile;
  doppler: number;
  /** 0..1 of the drone's top speed (the gunship's orbit is constant). */
  speedK: number;
  /** 0..1: how near the drone's link is to failing (range, battery). Own drone only. */
  strain: number;
  /** 0..1: how hard the motors work (speed, climb, correction). Own drone only. */
  load: number;
  /** 0..1 through the launch spool-up. Own drone only. */
  spool: number;
  /** 0..1 over the battery's last seconds, when the motors sag. Own drone only. */
  sag: number;
}

export interface AerialRig {
  readonly kind: AerialKind;
  readonly perspective: AerialPerspective;
  update(frame: AerialFrame): void;
  kill(fadeS?: number): void;
  readonly lastGain: number;
  readonly lastRate: number;
}

interface Loop {
  asset: string;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  lastGain: number;
  lastRate: number;
}

export function createAerialRig(deps: AerialDeps, kind: AerialKind, perspective: AerialPerspective): AerialRig {
  const { mixer, library, random } = deps;
  const ctx = mixer.ctx;
  const sound = AERIAL_SOUND[kind];
  const own = perspective === 'own';
  let dead = false;
  let lastGain = 0;
  let lastRate = 1;

  const output = ctx.createGain();
  output.gain.value = 0;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = own ? sound.ownCutoffHz : 20000;
  lowpass.Q.value = 0.55;
  const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
  output.connect(lowpass);
  if (panner) lowpass.connect(panner);
  const tail: AudioNode = panner ?? lowpass;
  tail.connect(mixer.input(own ? 'own' : 'vehicles'));
  let send: GainNode | null = null;
  if (deps.reverb && !own) {
    send = ctx.createGain();
    send.gain.value = 0.1;
    tail.connect(send);
    send.connect(mixer.reverbInput);
  }

  function makeLoop(asset: string, highpassHz = 0): Loop {
    // A live loop's buffer must outlive the library's idle eviction.
    library.pin([asset]);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    if (highpassHz > 0) {
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = highpassHz;
      highpass.Q.value = Math.SQRT1_2;
      gain.connect(highpass);
      highpass.connect(output);
    } else gain.connect(output);
    return { asset, source: null, gain, lastGain: 0, lastRate: 1 };
  }

  function setLoop(loop: Loop, gain: number, rate: number): void {
    if (!loop.source) {
      const buffer = library.variant(loop.asset, 0);
      if (!buffer) { library.pick(loop.asset, random); return; }
      const record = library.record(loop.asset);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const points = record?.l;
      if (points) {
        source.loopStart = points[0];
        source.loopEnd = Math.min(points[1], buffer.duration);
      }
      source.connect(loop.gain);
      const span = points ? points[1] - points[0] : buffer.duration;
      source.start(ctx.currentTime + 0.01, (points ? points[0] : 0) + random() * Math.max(0.01, span));
      loop.source = source;
    }
    const t = ctx.currentTime;
    if (Math.abs(gain - loop.lastGain) > 0.004) { loop.gain.gain.setTargetAtTime(gain, t, 0.08); loop.lastGain = gain; }
    const r = clamp(rate, 0.5, 2);
    if (Math.abs(r - loop.lastRate) > 0.002) { loop.source.playbackRate.setTargetAtTime(r, t, 0.06); loop.lastRate = r; }
  }

  function dropLoop(loop: Loop, fadeS: number): void {
    const t = ctx.currentTime;
    loop.gain.gain.cancelScheduledValues(t);
    loop.gain.gain.setValueAtTime(loop.gain.gain.value, t);
    loop.gain.gain.linearRampToValueAtTime(0, t + fadeS);
    try { loop.source?.stop(t + fadeS + 0.02); } catch { /* stopped */ }
  }

  const motor = makeLoop(own ? sound.ownLoop : sound.loop);
  const pilot = own && kind === 'drone';
  const hover = pilot && sound.hoverLoop ? makeLoop(sound.hoverLoop) : null;
  // The wind's buffeting rumble would mask the battle under it: only its rush is kept.
  const wind = pilot && sound.windLoop ? makeLoop(sound.windLoop, 150) : null;
  const hiss = pilot ? makeLoop('drone_feed_static_loop') : null;
  const loops = [motor, hover, wind, hiss].filter((loop): loop is Loop => loop != null);

  return {
    kind,
    perspective,
    update(frame) {
      if (dead) return;
      const t = ctx.currentTime;
      let levelDb: number = sound.ownLevelDb;
      if (!own) {
        const d = frame.rel.distance;
        levelDb = d > sound.maxM ? -120 : distanceAttenuationDb(d, sound.refM, sound.rolloff) + frame.atmosphere.transmissionDb;
        lowpass.frequency.setTargetAtTime(clamp(airAbsorptionCutoffHz(d, frame.atmosphere, 0.8), 120, 20000), t, 0.1);
        if (panner) panner.pan.setTargetAtTime(d > 0.01 ? clamp(frame.rel.right / d, -1, 1) * 0.9 : 0, t, 0.08);
        if (send) send.gain.setTargetAtTime(clamp(0.08 + d / 1600, 0, 0.5), t, 0.2);
      }
      if (hover) {
        // The pilot's drone: the motors spool up from rest, hover at a hum, rise into the
        // full-throttle buzz as they work harder and sag over the battery's last seconds.
        const spool = clamp(frame.spool, 0, 1);
        const load = clamp(frame.load, 0, 1);
        const blend = clamp((load - 0.25) / 0.6, 0, 1);
        lastGain = dbToGain(levelDb) * (0.25 + 0.75 * spool) * (0.85 + 0.15 * load);
        lastRate = (0.62 + 0.38 * spool) * (0.92 + 0.26 * load) * (1 - 0.07 * clamp(frame.sag, 0, 1));
        setLoop(hover, Math.cos(blend * Math.PI / 2), lastRate);
        setLoop(motor, Math.sin(blend * Math.PI / 2), lastRate);
        const speedK = clamp(frame.speedK, 0, 1);
        if (wind) setLoop(wind, 0.45 * speedK * speedK, 0.9 + 0.2 * speedK);
      } else {
        lastGain = dbToGain(levelDb);
        const [lo, hi] = sound.rate;
        lastRate = (lo + (hi - lo) * clamp(frame.speedK, 0, 1)) * frame.doppler;
        setLoop(motor, 1, lastRate);
      }
      output.gain.setTargetAtTime(lastGain, t, 0.1);
      // The feed's hiss: a trace of it always, most of it as the link frays.
      if (hiss) setLoop(hiss, 0.05 + 0.45 * frame.strain * frame.strain, 1);
    },
    kill(fadeS = 0.3) {
      if (dead) return;
      dead = true;
      for (const loop of loops) dropLoop(loop, fadeS);
      const t = ctx.currentTime;
      output.gain.cancelScheduledValues(t);
      output.gain.setValueAtTime(output.gain.value, t);
      output.gain.linearRampToValueAtTime(0, t + fadeS);
      setTimeout(() => {
        for (const node of [...loops.map((loop) => loop.gain), output, lowpass, ...(panner ? [panner] : []), ...(send ? [send] : [])]) {
          try { node.disconnect(); } catch { /* detached */ }
        }
      }, (fadeS + 0.1) * 1000);
    },
    get lastGain() { return lastGain; },
    get lastRate() { return lastRate; },
  };
}
