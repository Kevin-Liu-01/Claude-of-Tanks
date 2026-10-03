/**
 * Procedural sound: the parts that are better synthesized (cabin alarms, the
 * radio squelch chirp, the transmission and electric-drive whines, the
 * battle-loading bed) and the fallbacks that keep every cue audible while
 * its samples are still downloading or on an engine that cannot decode them.
 *
 * Every builder schedules on the given context clock, allocates its nodes
 * once, and returns a handle that releases them.
 */

import { clamp } from './audioMath.ts';

export interface NoiseBank {
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
}

export function createNoiseBank(ctx: BaseAudioContext, random: () => number): NoiseBank {
  const sr = ctx.sampleRate;
  const white = ctx.createBuffer(1, Math.round(sr * 2), sr);
  const w = white.getChannelData(0);
  for (let i = 0; i < w.length; i++) w[i] = random() * 2 - 1;
  const pink = ctx.createBuffer(1, Math.round(sr * 3), sr);
  const p = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < p.length; i++) {
    const x = random() * 2 - 1;
    b0 = 0.99765 * b0 + x * 0.099046;
    b1 = 0.963 * b1 + x * 0.2965164;
    b2 = 0.57 * b2 + x * 1.0526913;
    p[i] = (b0 + b1 + b2 + x * 0.1848) * 0.18;
  }
  return { white, pink };
}

export interface Rig {
  stop(fadeS?: number): void;
}

function envGain(ctx: BaseAudioContext, when: number, attack: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + Math.max(0.001, attack));
  g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.001, attack) + decay);
  return g;
}

function noiseSource(ctx: BaseAudioContext, buffer: AudioBuffer, when: number, dur: number, offset: number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.start(when, offset % buffer.duration);
  s.stop(when + dur + 0.05);
  return s;
}

/** Fallback cannon/MG report: filtered blast + low thump, sized by bore. */
export function synthShot(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank, when: number, caliberMm: number, gain: number, random: () => number): void {
  const k = clamp((caliberMm - 7) / 145, 0, 1);
  const dur = 0.25 + k * 1.6;
  const n = noiseSource(ctx, noise.white, when, dur, random() * 1.5);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(9000 - k * 6000, when);
  lp.frequency.exponentialRampToValueAtTime(300 + (1 - k) * 600, when + dur);
  const e = envGain(ctx, when, 0.002, gain, dur);
  n.connect(lp); lp.connect(e); e.connect(dest);
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(90 - k * 45, when);
  thump.frequency.exponentialRampToValueAtTime(28, when + 0.35 + k * 0.4);
  const te = envGain(ctx, when, 0.003, gain * (0.4 + k * 0.6), 0.3 + k * 0.6);
  thump.connect(te); te.connect(dest);
  thump.start(when); thump.stop(when + 1.2);
}

/**
 * A muzzle blast as pressure (2026-10-02): the Friedlander pulse of the propellant gases leaving the
 * muzzle — an instant rise, a positive phase that scales with the charge (0.15 ms + 0.02 ms per millimetre
 * of bore: 0.3 ms for a rifle round, 2.6 ms for a 120 mm gun), then its shallow negative phase — the same
 * pulse reflected off the ground a few milliseconds behind, the punch of the expanding gas (a heavily
 * damped low partial of tens of milliseconds that only a large charge has, never a long sub sweep) and
 * the gas roar under it. Peak-normalised and mono; deterministic per bore.
 */
export function renderMuzzleBlast(out: Float32Array, sampleRate: number, caliberMm: number): void {
  const k = clamp((caliberMm - 7) / 145, 0, 1);
  const tPlus = 0.00015 + 0.00002 * caliberMm;
  const reflectS = 0.0012 + 0.004 * k;
  const punchHz = 95 - 45 * k;
  const punchTau = 0.01 + 0.035 * k;
  const punchAmp = 0.45 * Math.pow(k, 1.5);
  const roarTau = 0.005 + 0.03 * k;
  const roarAmp = 0.9 * (0.4 + 0.6 * k);
  const lowA = Math.exp((-2 * Math.PI * (3500 - 2000 * k)) / sampleRate);
  const highA = Math.exp((-2 * Math.PI * 300) / sampleRate);
  let seed = (Math.round(caliberMm * 10) * 2654435761) >>> 0;
  const noise = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
  const pulse = (t: number): number => (t < 0 ? 0 : (1 - t / tPlus) * Math.exp((-1.4 * t) / tPlus));
  let low = 0, high = 0, lastLow = 0, peak = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    low = lowA * low + (1 - lowA) * noise();
    high = highA * (high + low - lastLow);
    lastLow = low;
    const v = pulse(t) + 0.55 * pulse(t - reflectS)
      + punchAmp * Math.sin(2 * Math.PI * punchHz * t) * Math.exp(-t / punchTau) * (1 - Math.exp(-t / 0.0015))
      + roarAmp * high * Math.exp(-t / roarTau);
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
}

/** The muzzle blast of a bore as a buffer (see renderMuzzleBlast); about 60 ms for a rifle round, 0.3 s for 152 mm. */
export function muzzleBlastBuffer(ctx: BaseAudioContext, caliberMm: number): AudioBuffer {
  const k = clamp((caliberMm - 7) / 145, 0, 1);
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * (0.06 + 0.24 * k)), ctx.sampleRate);
  renderMuzzleBlast(buffer.getChannelData(0), ctx.sampleRate, caliberMm);
  return buffer;
}

/** Fallback explosion: long low-passed noise body with a falling sub. */
export function synthBoom(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank, when: number, size: number, gain: number, random: () => number): void {
  const k = clamp(size, 0.2, 2);
  const dur = 1.2 * k + 0.4;
  const n = noiseSource(ctx, noise.pink, when, dur, random() * 2.5);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2400, when);
  lp.frequency.exponentialRampToValueAtTime(180, when + dur);
  const e = envGain(ctx, when, 0.004, gain, dur);
  n.connect(lp); lp.connect(e); e.connect(dest);
  const sub = ctx.createOscillator();
  sub.frequency.setValueAtTime(60, when);
  sub.frequency.exponentialRampToValueAtTime(22, when + dur * 0.8);
  const se = envGain(ctx, when, 0.006, gain * 0.9, dur * 0.85);
  sub.connect(se); se.connect(dest);
  sub.start(when); sub.stop(when + dur + 0.1);
}

/**
 * The pressure under a heavy report or blast, layered beneath the generated
 * samples (thin below ~80 Hz): a sine falling from `fromHz` to `toHz` with a
 * fast attack and a body-length decay, plus a short low-passed noise kick
 * for the chest hit.
 */
export function subThump(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank, when: number, fromHz: number, toHz: number, durS: number, gain: number, random: () => number): void {
  if (gain < 0.002) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(fromHz, when);
  o.frequency.exponentialRampToValueAtTime(Math.max(18, toHz), when + durS * 0.7);
  const e = envGain(ctx, when, 0.008, gain, durS);
  o.connect(e); e.connect(dest);
  o.start(when); o.stop(when + durS + 0.1);
  const kick = noiseSource(ctx, noise.pink, when, 0.14, random() * 2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 170;
  const ke = envGain(ctx, when, 0.003, gain * 0.8, 0.14);
  kick.connect(lp); lp.connect(ke); ke.connect(dest);
}

/** Fallback armour impact: pen = low clang + debris; ricochet = rising whine; nonpen = dull knock. */
export function synthImpact(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank, when: number, kind: 'pen' | 'ricochet' | 'nonpen', gain: number, random: () => number): void {
  if (kind === 'ricochet') {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1100 + random() * 400, when);
    o.frequency.exponentialRampToValueAtTime(2600 + random() * 600, when + 0.4);
    const e = envGain(ctx, when, 0.002, gain * 0.5, 0.45);
    o.connect(e); e.connect(dest);
    o.start(when); o.stop(when + 0.55);
    return;
  }
  const n = noiseSource(ctx, noise.white, when, 0.5, random());
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = kind === 'pen' ? 900 : 420;
  bp.Q.value = 0.8;
  const e = envGain(ctx, when, 0.001, gain, kind === 'pen' ? 0.45 : 0.22);
  n.connect(bp); bp.connect(e); e.connect(dest);
  const o = ctx.createOscillator();
  o.frequency.value = kind === 'pen' ? 190 : 120;
  const oe = envGain(ctx, when, 0.002, gain * 0.6, 0.3);
  o.connect(oe); oe.connect(dest);
  o.start(when); o.stop(when + 0.4);
}

/** Interface click fallback. */
export function synthClick(ctx: BaseAudioContext, dest: AudioNode, when: number, gain: number, pitch = 1): void {
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(1400 * pitch, when);
  o.frequency.exponentialRampToValueAtTime(600 * pitch, when + 0.03);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  const e = envGain(ctx, when, 0.001, gain, 0.035);
  o.connect(lp); lp.connect(e); e.connect(dest);
  o.start(when); o.stop(when + 0.06);
}

/** Radio squelch: key-up chirp or the release tail, synthesized so it is exactly as short as a net click is. */
export function radioSquelch(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank, when: number, release: boolean, gain: number, random: () => number): number {
  const dur = release ? 0.13 : 0.07;
  const n = noiseSource(ctx, noise.white, when, dur, random());
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = release ? 2100 : 1700;
  bp.Q.value = 1.2;
  const e = envGain(ctx, when, 0.002, gain * (release ? 0.5 : 0.35), dur);
  n.connect(bp); bp.connect(e); e.connect(dest);
  const tone = ctx.createOscillator();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(release ? 1250 : 1750, when);
  if (release) tone.frequency.exponentialRampToValueAtTime(900, when + dur);
  const te = envGain(ctx, when, 0.001, gain * 0.22, release ? 0.08 : 0.04);
  tone.connect(te); te.connect(dest);
  tone.start(when); tone.stop(when + dur + 0.02);
  return dur;
}

/** Two-tone cabin fire klaxon (loops until stopped). */
export function fireKlaxon(ctx: BaseAudioContext, dest: AudioNode): Rig {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.11, now + 0.06);
  out.connect(dest);
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = 690;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 2.4;
  const depth = ctx.createGain();
  depth.gain.value = 120;
  lfo.connect(depth); depth.connect(o.frequency);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 950;
  bp.Q.value = 1.1;
  o.connect(bp); bp.connect(out);
  o.start(now); lfo.start(now);
  return {
    stop(fadeS = 0.15) {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + fadeS);
      try { o.stop(t + fadeS + 0.02); lfo.stop(t + fadeS + 0.02); } catch { /* stopped */ }
      o.onended = () => { try { out.disconnect(); } catch { /* detached */ } };
    },
  };
}

/** Urgent triple beep: ammunition stowage hit. */
export function ammoRackBeep(ctx: BaseAudioContext, dest: AudioNode, when: number, gain = 0.28): void {
  for (let i = 0; i < 3; i++) {
    const at = when + i * 0.15;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 980;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const e = envGain(ctx, at, 0.003, gain, 0.07);
    o.connect(lp); lp.connect(e); e.connect(dest);
    o.start(at); o.stop(at + 0.1);
  }
}

/** Low heartbeat pulses for critical damage (lub-dub at 58 bpm). */
export function heartbeat(ctx: BaseAudioContext, dest: AudioNode, when: number, seconds: number): Rig {
  const o = ctx.createOscillator();
  o.frequency.value = 56;
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(g); g.connect(dest);
  const beat = 60 / 58;
  for (let t0 = when + 0.05; t0 < when + seconds; t0 += beat) {
    for (const [off, amp] of [[0, 0.16], [0.28, 0.1]] as const) {
      const a = t0 + off;
      g.gain.setValueAtTime(0.0001, a);
      g.gain.linearRampToValueAtTime(amp, a + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, a + 0.18);
    }
  }
  o.start(when);
  o.stop(when + seconds + 0.4);
  o.onended = () => { try { g.disconnect(); } catch { /* detached */ } };
  return { stop() { try { o.stop(); } catch { /* stopped */ } } };
}

/**
 * Continuous whine: transmission/final-drive gear mesh, a gas-turbine
 * compressor or an electric drive motor. `set` retunes it every frame.
 */
export interface WhineRig extends Rig {
  set(hz: number, gain: number): void;
}

export function whine(ctx: BaseAudioContext, dest: AudioNode, kind: 'gear' | 'electric' | 'turbo'): WhineRig {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = kind === 'electric' ? 'sine' : 'sawtooth';
  b.type = 'sine';
  const filter = ctx.createBiquadFilter();
  filter.type = kind === 'turbo' ? 'bandpass' : 'lowpass';
  filter.frequency.value = kind === 'turbo' ? 3600 : 1800;
  filter.Q.value = kind === 'turbo' ? 4 : 0.7;
  const bg = ctx.createGain();
  bg.gain.value = 0.35;
  a.connect(filter);
  b.connect(bg); bg.connect(filter);
  filter.connect(out);
  a.start(now); b.start(now);
  let last = -1;
  return {
    set(hz, gain) {
      const t = ctx.currentTime;
      const f = clamp(hz, 20, 9000);
      if (Math.abs(f - last) > 0.5) {
        a.frequency.setTargetAtTime(f, t, 0.06);
        b.frequency.setTargetAtTime(f * (kind === 'gear' ? 2.0 : 1.5), t, 0.06);
        if (kind !== 'turbo') filter.frequency.setTargetAtTime(Math.max(600, f * 3), t, 0.1);
        last = f;
      }
      out.gain.setTargetAtTime(clamp(gain, 0, 1), t, 0.08);
    },
    stop(fadeS = 0.2) {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + fadeS);
      try { a.stop(t + fadeS + 0.02); b.stop(t + fadeS + 0.02); } catch { /* stopped */ }
      a.onended = () => { try { out.disconnect(); } catch { /* detached */ } };
    },
  };
}

/** Engine fallback used until a family's sampled bank decodes. */
export interface EngineFallback extends Rig {
  set(rpm: number, load: number, turbine: boolean): void;
}

export function engineFallback(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank, random: () => number): EngineFallback {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  const sawG = ctx.createGain();
  sawG.gain.value = 0.09;
  const subG = ctx.createGain();
  subG.gain.value = 0.12;
  saw.connect(lp); lp.connect(sawG); sawG.connect(out);
  sub.connect(subG); subG.connect(out);
  const n = ctx.createBufferSource();
  n.buffer = noise.pink;
  n.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 300;
  bp.Q.value = 0.7;
  const nG = ctx.createGain();
  nG.gain.value = 0.25;
  n.connect(bp); bp.connect(nG); nG.connect(out);
  saw.start(now); sub.start(now); n.start(now, random() * 2);
  out.gain.setTargetAtTime(1, now, 0.3);
  return {
    set(rpm, load, turbine) {
      const t = ctx.currentTime;
      const base = turbine ? 70 : 42;
      const hz = base * (0.75 + 0.9 * rpm);
      saw.frequency.setTargetAtTime(hz, t, 0.1);
      sub.frequency.setTargetAtTime(hz * 0.5, t, 0.1);
      bp.frequency.setTargetAtTime(turbine ? 1400 + 1800 * rpm : 200 + 380 * rpm, t, 0.1);
      lp.frequency.setTargetAtTime(400 + 900 * load, t, 0.1);
      nG.gain.setTargetAtTime(turbine ? 0.35 + 0.3 * rpm : 0.2 + 0.2 * load, t, 0.1);
    },
    stop(fadeS = 0.3) {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + fadeS);
      for (const s of [saw, sub, n]) { try { s.stop(t + fadeS + 0.02); } catch { /* stopped */ } }
      saw.onended = () => { try { out.disconnect(); } catch { /* detached */ } };
    },
  };
}

/** Battle-loading bed: low machinery rumble with a slow pulse. */
export function loadingBed(ctx: BaseAudioContext, dest: AudioNode, noise: NoiseBank, random: () => number): Rig {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(0.14, now + 0.2);
  out.connect(dest);
  const rumble = ctx.createOscillator();
  rumble.frequency.value = 56;
  const rg = ctx.createGain();
  rg.gain.value = 0.24;
  rumble.connect(rg); rg.connect(out);
  const air = ctx.createBufferSource();
  air.buffer = noise.pink;
  air.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 480;
  const ag = ctx.createGain();
  ag.gain.value = 0.5;
  air.connect(lp); lp.connect(ag); ag.connect(out);
  const pulse = ctx.createOscillator();
  pulse.frequency.value = 0.8;
  const pg = ctx.createGain();
  pg.gain.value = 0.03;
  pulse.connect(pg); pg.connect(out.gain);
  rumble.start(now); air.start(now, random() * 2); pulse.start(now);
  return {
    stop(fadeS = 0.3) {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + fadeS);
      for (const s of [rumble, air, pulse]) { try { s.stop(t + fadeS + 0.05); } catch { /* stopped */ } }
      rumble.onended = () => { try { out.disconnect(); } catch { /* detached */ } };
    },
  };
}
