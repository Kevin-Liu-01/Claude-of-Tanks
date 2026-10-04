/**
 * The crew radio net: national crew voices over a real-time intercom chain.
 *
 * Scheduling is radio discipline — one transmission at a time, a priority
 * ladder where survival calls cut chatter, per-line and per-group cooldowns,
 * a short queue whose stale calls are dropped rather than played late, and
 * no immediate repeat of a take.
 *
 * Every transmission is keyed: the recorded key-up click in, the take
 * through a band-limited (24 dB/oct, 320 Hz–3.4 kHz), compressed and driven
 * intercom chain into a headset speaker roll-off, over the recorded net
 * static, the recorded release out. Nothing here is synthesized or stood in
 * for: a keyed element still decoding is silent rather than replaced by a
 * tone, and a line the crew's pack lacks is silent rather than spoken by
 * another nation's crew.
 * A damaged radio narrows the band, adds drive, drops syllables and crackles.
 * The beds duck under speech.
 */

import { clamp } from './audioMath.ts';
import type { AssetLibrary } from './assetLibrary.ts';
import type { Mixer } from './mixer.ts';
import { RADIO_DISCIPLINE, VOICE_LINES, type VoiceLineMeta } from './voiceLines.ts';

interface SayOptions {
  prob?: number;
  force?: boolean;
  delayS?: number;
  staleS?: number;
  /** Speak this take of the line (its index in the script) instead of a random one. */
  take?: number;
}

interface Request {
  id: string;
  pri: number;
  group: string;
  atReq: number;
  readyAt: number;
  expiresAt: number;
  take?: number;
}

interface RadioLogEntry {
  id: string;
  lang: string;
  t: number;
  dur: number;
  take?: number;
}

export interface CrewRadio {
  say(id: string, options?: SayOptions): boolean;
  update(): void;
  silence(): void;
  cancelPending(keepGroups?: readonly string[], stopObsoleteActive?: boolean): void;
  setLanguage(language: string): void;
  setRadioDamage(level: 0 | 1 | 2): void;
  readonly language: string;
  readonly speaking: boolean;
  readonly log: readonly RadioLogEntry[];
  debugState(): { currentPri: number; currentGroup: string | null; currentEnd: number; pending: Request[] };
}

interface CrewRadioOptions {
  mixer: Mixer;
  library: AssetLibrary;
  random: () => number;
  /** The crew pack before the battle picks one (the engine sets the nation's at once). */
  initialLanguage?: string;
}

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 1 + amount * 8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export function createCrewRadio({ mixer, library, random, initialLanguage = 'en-US' }: CrewRadioOptions): CrewRadio {
  const ctx = mixer.ctx;
  const voiceBus = mixer.input('voice');
  let language = initialLanguage;
  let damage: 0 | 1 | 2 = 0;

  // ---- intercom chain (shared by every transmission): a 24 dB/oct telephone
  // band, a nasal presence peak, radio-style compression, then the drive.
  const input = ctx.createGain();
  const filter = (type: BiquadFilterType, hz: number, q: number): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    return f;
  };
  const hp = [filter('highpass', 320, 0.7), filter('highpass', 320, 0.7)];
  const lp = [filter('lowpass', 3400, 0.75), filter('lowpass', 3400, 0.75)];
  const presence = filter('peaking', 1900, 0.9);
  presence.gain.value = 5;
  const squash = ctx.createDynamicsCompressor();
  squash.threshold.value = -26;
  squash.knee.value = 6;
  squash.ratio.value = 6;
  squash.attack.value = 0.003;
  squash.release.value = 0.12;
  const drive = ctx.createWaveShaper();
  drive.curve = driveCurve(0.25);
  drive.oversample = '2x';
  // The headset speaker: rolls off the drive's harmonics above the band.
  const speaker = filter('lowpass', 4600, 0.6);
  const level = ctx.createGain();
  level.gain.value = 1.15;
  input.connect(hp[0]);
  hp[0].connect(hp[1]);
  hp[1].connect(lp[0]);
  lp[0].connect(lp[1]);
  lp[1].connect(presence);
  presence.connect(squash);
  squash.connect(drive);
  drive.connect(speaker);
  speaker.connect(level);
  level.connect(voiceBus);

  // Static bed under an open channel (gated with the transmission): the recorded net static, looping from the
  // first transmission after it has decoded.
  const bedFilter = filter('bandpass', 1900, 0.6);
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0;
  bedFilter.connect(bedGain);
  bedGain.connect(speaker);
  let bed: AudioBufferSourceNode | null = null;

  function ensureBed(): void {
    if (bed) return;
    const buffer = library.variant('radio_static_loop', 0);
    if (!buffer) { void library.load(['radio_static_loop']); return; }
    const loop = library.record('radio_static_loop')?.l;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (loop) {
      source.loopStart = loop[0];
      source.loopEnd = Math.min(loop[1], buffer.duration);
    }
    source.connect(bedFilter);
    const from = loop ? loop[0] : 0;
    const span = (loop ? Math.min(loop[1], buffer.duration) : buffer.duration) - from;
    source.start(ctx.currentTime, from + random() * Math.max(0.01, span));
    bed = source;
  }

  /** A keyed element of the net (key-up, release) into the headset speaker; its length, or 0 while it decodes. */
  function key(id: 'radio_key_in' | 'radio_key_out', when: number, gain: number): number {
    const buffer = library.pick(id, random);
    if (!buffer) return 0;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(speaker);
    src.start(when);
    src.onended = () => { try { g.disconnect(); } catch { /* detached */ } };
    return buffer.duration;
  }

  const lastPlay = new Map<string, number>();
  const lastGroupPlay = new Map<string, { t: number; pri: number }>();
  const queue: Request[] = [];
  const log: RadioLogEntry[] = [];
  let currentEnd = -1;
  let currentPri = -1;
  let currentGroup: string | null = null;
  let currentSrc: AudioBufferSourceNode | null = null;
  let currentGate: GainNode | null = null;

  function applyDamage(): void {
    const t = ctx.currentTime;
    const band = damage === 2 ? [620, 2100] : damage === 1 ? [430, 2700] : [320, 3400];
    for (const f of hp) f.frequency.setTargetAtTime(band[0], t, 0.05);
    for (const f of lp) f.frequency.setTargetAtTime(band[1], t, 0.05);
    drive.curve = driveCurve(damage === 2 ? 0.75 : damage === 1 ? 0.45 : 0.25);
  }

  /** The crew's own take, or nothing: every pack carries every line (crewRadio selftest), and one still decoding waits. */
  function bufferFor(id: string, take?: number): { buffer: AudioBuffer; lang: string } | null {
    const own = library.voice(language, id, random, take);
    return own ? { buffer: own, lang: language } : null;
  }

  function stopCurrent(): void {
    const src = currentSrc;
    currentSrc = null;
    if (src) {
      const t = ctx.currentTime;
      try {
        currentGate?.gain.setTargetAtTime(0, t, 0.015);
        src.stop(t + 0.06);
      } catch { /* stopped */ }
    }
    currentEnd = ctx.currentTime;
    currentPri = -1;
    currentGroup = null;
    bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    mixer.duckForVoice(false);
  }

  function playNow(id: string, take?: number): boolean {
    const line = VOICE_LINES[id];
    const chosen = line ? bufferFor(id, take) : null;
    if (!line || !chosen) return false;
    const now = ctx.currentTime;
    ensureBed();
    // Levels re the synthesized squelch they replaced (2026-10-03), matched on RMS.
    const keyS = key('radio_key_in', now + 0.005, damage === 2 ? 0.14 : 0.1);
    const startAt = now + 0.005 + Math.max(0.04, keyS * 0.7);
    const src = ctx.createBufferSource();
    src.buffer = chosen.buffer;
    src.playbackRate.value = 0.99 + random() * 0.02;
    const gate = ctx.createGain();
    gate.gain.value = 1;
    src.connect(gate);
    gate.connect(input);
    const dur = chosen.buffer.duration / src.playbackRate.value;
    src.start(startAt);
    if (damage === 2) {
      // Dropouts: a damaged set loses syllables.
      const drops = 2 + Math.floor(random() * 3);
      for (let i = 0; i < drops; i++) {
        const at = startAt + random() * Math.max(0.05, dur - 0.15);
        const len = 0.04 + random() * 0.09;
        gate.gain.setValueAtTime(1, at);
        gate.gain.linearRampToValueAtTime(0.08, at + 0.01);
        gate.gain.setValueAtTime(0.08, at + len);
        gate.gain.linearRampToValueAtTime(1, at + len + 0.01);
      }
    }
    const bedLevel = damage === 2 ? 0.175 : damage === 1 ? 0.112 : 0.07;
    bedGain.gain.setTargetAtTime(bedLevel, startAt - 0.02, 0.02);
    bedGain.gain.setTargetAtTime(0, startAt + dur + 0.05, 0.04);
    const outS = key('radio_key_out', startAt + dur + 0.02, damage === 2 ? 0.2 : 0.15);
    if (damage >= 1 && library.has('radio_interference') && random() < 0.6) {
      const crackle = library.pick('radio_interference', random);
      if (crackle) {
        const c = ctx.createBufferSource();
        c.buffer = crackle;
        const cg = ctx.createGain();
        cg.gain.value = damage === 2 ? 0.35 : 0.18;
        c.connect(cg);
        cg.connect(input);
        c.start(startAt + random() * dur * 0.7);
        c.onended = () => { try { cg.disconnect(); } catch { /* detached */ } };
      }
    }
    mixer.duckForVoice(true);
    src.onended = () => {
      try { gate.disconnect(); } catch { /* detached */ }
      if (currentSrc === src) {
        currentSrc = null;
        currentPri = -1;
        currentGroup = null;
        mixer.duckForVoice(false);
      }
    };
    currentSrc = src;
    currentGate = gate;
    currentEnd = startAt + dur + 0.02 + Math.max(0.12, Math.min(0.35, outS));
    currentPri = line.pri;
    currentGroup = line.group || id;
    lastPlay.set(id, now);
    lastGroupPlay.set(currentGroup, { t: now, pri: line.pri });
    log.push({ id, lang: chosen.lang, t: +now.toFixed(3), dur: +dur.toFixed(3), ...(take != null ? { take } : {}) });
    if (log.length > 64) log.shift();
    return true;
  }

  function cooldownActive(id: string, line: VoiceLineMeta, now: number): boolean {
    const last = lastPlay.get(id);
    if (last != null && now - last < line.cdS) return true;
    const groupLast = lastGroupPlay.get(line.group || id);
    return !!(line.groupCdS && groupLast && groupLast.pri >= line.pri && now - groupLast.t < line.groupCdS);
  }

  function replaceQueuedGroup(group: string, priority: number): boolean {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].group !== group) continue;
      if (queue[i].pri > priority) return false;
      queue.splice(i, 1);
    }
    return true;
  }

  function removeLowerPriority(priority: number): void {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].pri < priority) queue.splice(i, 1);
  }

  function reserveSlot(priority: number): boolean {
    if (queue.length < RADIO_DISCIPLINE.queueMax) return true;
    let worst = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].pri < queue[worst].pri || (queue[i].pri === queue[worst].pri && queue[i].atReq < queue[worst].atReq)) worst = i;
    }
    if (queue[worst].pri >= priority) return false;
    queue.splice(worst, 1);
    return true;
  }

  /** Survival cuts anything below it, a decisive event cuts situational calls, and a report cuts flavour. */
  function canInterrupt(pri: number, now: number): boolean {
    return !!currentSrc && currentEnd - now > 0.12
      && ((pri >= 4 && currentPri < 4) || (pri >= 3 && currentPri <= 1) || (pri >= 2 && currentPri === 0));
  }

  function enqueue(id: string, line: VoiceLineMeta, now: number, delayS: number, staleS: number | undefined, take: number | undefined): boolean {
    const group = line.group || id;
    if (!replaceQueuedGroup(group, line.pri)) return false;
    if (line.pri >= 3) removeLowerPriority(line.pri);
    if (!reserveSlot(line.pri)) return false;
    const readyAt = now + Math.max(0, delayS);
    queue.push({ id, pri: line.pri, group, atReq: now, readyAt, expiresAt: readyAt + (staleS ?? line.staleS ?? RADIO_DISCIPLINE.defaultStaleS), ...(take != null ? { take } : {}) });
    return true;
  }

  return {
    say(id, options) {
      const line = VOICE_LINES[id];
      if (!line) return false;
      const take = options?.take;
      if (options?.force) {
        queue.length = 0;
        stopCurrent();
        return playNow(id, take);
      }
      if (typeof options?.prob === 'number' && random() > options.prob) return false;
      const now = ctx.currentTime;
      if (cooldownActive(id, line, now)) return false;
      const delayS = Math.max(0, options?.delayS || 0);
      const busyUntil = currentEnd + RADIO_DISCIPLINE.gapS;
      if (currentGroup === (line.group || id) && now < currentEnd && line.pri <= currentPri) return false;
      if (delayS === 0) {
        if (now >= busyUntil) return playNow(id, take);
        if (canInterrupt(line.pri, now)) {
          stopCurrent();
          removeLowerPriority(line.pri);
          return playNow(id, take);
        }
      }
      if (line.pri === 0 && now < busyUntil) return false;
      return enqueue(id, line, now, delayS, options?.staleS, take);
    },
    update() {
      if (!queue.length) return;
      const now = ctx.currentTime;
      for (let i = queue.length - 1; i >= 0; i--) if (now > queue[i].expiresAt) queue.splice(i, 1);
      let best = -1;
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].readyAt > now) continue;
        if (best < 0 || queue[i].pri > queue[best].pri || (queue[i].pri === queue[best].pri && queue[i].atReq < queue[best].atReq)) best = i;
      }
      if (best < 0) return;
      if (now < currentEnd + RADIO_DISCIPLINE.gapS) {
        if (!canInterrupt(queue[best].pri, now)) return;
        stopCurrent();
      }
      const { id, take } = queue.splice(best, 1)[0];
      if (!cooldownActive(id, VOICE_LINES[id], now)) playNow(id, take);
    },
    silence() {
      queue.length = 0;
      stopCurrent();
    },
    cancelPending(keepGroups = [], stopObsoleteActive = false) {
      const keep = new Set(keepGroups);
      for (let i = queue.length - 1; i >= 0; i--) if (!keep.has(queue[i].group)) queue.splice(i, 1);
      if (stopObsoleteActive && currentSrc && (!currentGroup || !keep.has(currentGroup))) stopCurrent();
    },
    setLanguage(next) {
      if (next !== language) {
        queue.length = 0;
        if (currentSrc) stopCurrent();
      }
      language = next;
      void library.loadVoice(next);
    },
    setRadioDamage(next) {
      const value = clamp(next, 0, 2) as 0 | 1 | 2;
      if (value === damage) return;
      damage = value;
      applyDamage();
    },
    get language() { return language; },
    get speaking() { return !!currentSrc; },
    log,
    debugState() {
      return { currentPri, currentGroup, currentEnd, pending: queue.map((q) => ({ ...q })) };
    },
  };
}
