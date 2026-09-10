import { createOpaqueLoadingYielder } from '../engine/frameScheduler.ts';
import { mulberry32 } from './audioPolicy.ts';

export type AudioBufferContext = Pick<AudioContext, 'sampleRate' | 'createBuffer'>;
type Random = () => number;
type GunKind = 'light' | 'medium' | 'heavy' | 'huge';

export interface PreparedAudioBuffers {
  readonly context: AudioBufferContext;
  readonly sampleRate: number;
  readonly white: AudioBuffer;
  readonly wind: AudioBuffer;
  readonly crackle: AudioBuffer;
  readonly guns: Readonly<Record<GunKind, AudioBuffer>>;
  /** The exact continuation consumed by subsequent live sound variation. */
  readonly random: Random;
}

interface PreparationOptions {
  yieldWork?(): Promise<void>;
  signal?: AbortSignal;
  now?(): number;
}

const SAMPLE_BLOCK = 256;
const MAX_STEP_WORK = 16384;
const STEP_BUDGET_MS = 2;
const defaultNow = (): number => performance.now();

function createBudget(now: () => number) {
  let started = now();
  let work = 0;
  return {
    spent(count: number): boolean {
      work += count;
      return work >= MAX_STEP_WORK || now() - started >= STEP_BUDGET_MS;
    },
    reset(): void { started = now(); work = 0; },
  };
}
type BufferBudget = ReturnType<typeof createBudget>;

function* whiteNoise(
  context: AudioBufferContext, random: Random, budget: BufferBudget,
): Generator<void, AudioBuffer, void> {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, (rate * 2) | 0, rate);
  const data = buffer.getChannelData(0);
  for (let start = 0; start < data.length; start += SAMPLE_BLOCK) {
    const end = Math.min(start + SAMPLE_BLOCK, data.length);
    for (let i = start; i < end; i++) data[i] = random() * 2 - 1;
    if (budget.spent(end - start)) { yield; budget.reset(); }
  }
  return buffer;
}

function* windNoise(
  context: AudioBufferContext, random: Random, budget: BufferBudget,
): Generator<void, AudioBuffer, void> {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, (rate * 4) | 0, rate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let start = 0; start < data.length; start += SAMPLE_BLOCK) {
    const end = Math.min(start + SAMPLE_BLOCK, data.length);
    for (let i = start; i < end; i++) {
      const w = random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    if (budget.spent(end - start)) { yield; budget.reset(); }
  }
  return buffer;
}

function* crackleNoise(
  context: AudioBufferContext, random: Random, budget: BufferBudget,
): Generator<void, AudioBuffer, void> {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, (rate * 2) | 0, rate);
  const data = buffer.getChannelData(0);
  for (let event = 0; event < 160; event++) {
    const at = (random() * data.length) | 0;
    const amp = 0.25 + random() * 0.75;
    const length = 12 + ((random() * 80) | 0);
    const sign = random() < 0.5 ? -1 : 1;
    let writes = 0;
    for (let i = 0; i < length && at + i < data.length; i++) {
      data[at + i] += sign * amp * Math.exp(-i / (length * 0.3)) * (random() * 2 - 1);
      writes++;
    }
    // Each complete impulse is at most 91 writes; preserve its overlap and RNG order.
    if (budget.spent(4 + writes)) { yield; budget.reset(); }
  }
  return buffer;
}

function* normalizeGunBed(
  data: Float32Array, output: number, budget: BufferBudget,
): Generator<void, void, void> {
  // Keep separate passes over the stored Float32 samples, exactly as before.
  let peak = 0;
  for (let start = 0; start < data.length; start += SAMPLE_BLOCK) {
    const end = Math.min(start + SAMPLE_BLOCK, data.length);
    for (let i = start; i < end; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
    if (budget.spent(end - start)) { yield; budget.reset(); }
  }
  const k = peak > 0 ? output / peak : 1;
  for (let start = 0; start < data.length; start += SAMPLE_BLOCK) {
    const end = Math.min(start + SAMPLE_BLOCK, data.length);
    for (let i = start; i < end; i++) data[i] *= k;
    if (budget.spent(end - start)) { yield; budget.reset(); }
  }
}

function* gunBed(
  context: AudioBufferContext, kind: GunKind, budget: BufferBudget,
): Generator<void, AudioBuffer, void> {
  const sr = context.sampleRate;
  const P = {
    light:  { dur: 0.55, crackT: 0.030, bodyT: 0.10, rumT: 0.20, f0: 62, f1: 46, subT: 0.16, bark: 195, barkT: 0.045, out: 0.78 },
    medium: { dur: 1.00, crackT: 0.040, bodyT: 0.17, rumT: 0.42, f0: 54, f1: 34, subT: 0.32, bark: 150, barkT: 0.060, out: 0.86 },
    heavy:  { dur: 1.70, crackT: 0.055, bodyT: 0.25, rumT: 0.80, f0: 46, f1: 27, subT: 0.50, bark: 120, barkT: 0.080, out: 0.92 },
    huge:   { dur: 2.60, crackT: 0.070, bodyT: 0.34, rumT: 1.25, f0: 40, f1: 22, subT: 0.75, bark: 96, barkT: 0.110, out: 0.97 },
  }[kind];
  const out = context.createBuffer(1, Math.ceil(sr * P.dur), sr);
  const data = out.getChannelData(0);
  const grng = mulberry32(0x6a09e667 ^ (P.bark | 0));
  let low = 0, prevNoise = 0, phaseAcc = 0;
  const barkW1 = Math.PI * 2 * P.bark / sr;
  const barkW2 = Math.PI * 2 * P.bark * 1.53 / sr;
  let bp1 = 0, bp2 = 0;
  for (let start = 0; start < data.length; start += SAMPLE_BLOCK) {
    const end = Math.min(start + SAMPLE_BLOCK, data.length);
    for (let i = start; i < end; i++) {
      const t = i / sr;
      const n = grng() * 2 - 1;
      low += (n - low) * (kind === 'huge' ? 0.02 : kind === 'heavy' ? 0.025 : kind === 'medium' ? 0.05 : 0.09);
      const high = n - prevNoise;
      prevNoise = n;
      const sweepT = Math.min(1, t / (P.subT * 0.9));
      phaseAcc += Math.PI * 2 * (P.f0 + (P.f1 - P.f0) * sweepT) / sr;
      bp1 += barkW1; bp2 += barkW2;
      const crack = high * Math.exp(-t / P.crackT);
      const body = n * Math.exp(-t / P.bodyT);
      const rumble = low * Math.exp(-t / P.rumT);
      const sub = Math.sin(phaseAcc) * Math.exp(-t / P.subT);
      const bark = (Math.sin(bp1) + 0.45 * Math.sin(bp2)) * Math.exp(-t / P.barkT);
      const attack = Math.min(1, t / 0.003);
      const value = attack * (crack * 0.34 + body * 0.40 + rumble * 0.68 + sub * 0.60 + bark * 0.30);
      data[i] = value;
    }
    if (budget.spent(end - start)) { yield; budget.reset(); }
  }
  yield* normalizeGunBed(data, P.out, budget);
  return out;
}

/** No graph/source is connected until this private pack is returned in full.
 * Closing a partial iterator drops its GC-owned AudioBuffers; it never closes
 * the borrowed device. Native createBuffer itself is not preemptible.
 */
export function* buildAudioBufferSteps(
  context: AudioBufferContext, random: Random = mulberry32(9001), now = defaultNow,
): Generator<void, PreparedAudioBuffers | undefined, void> {
  const budget = createBudget(now);
  yield; budget.reset();
  const white = yield* whiteNoise(context, random, budget);
  const wind = yield* windNoise(context, random, budget);
  const crackle = yield* crackleNoise(context, random, budget);
  const light = yield* gunBed(context, 'light', budget);
  const medium = yield* gunBed(context, 'medium', budget);
  const heavy = yield* gunBed(context, 'heavy', budget);
  const huge = yield* gunBed(context, 'huge', budget);
  return { context, sampleRate: context.sampleRate, white, wind, crackle,
    guns: { light, medium, heavy, huge }, random };
}

export function buildAudioBuffers(
  context: AudioBufferContext, random: Random = mulberry32(9001),
): PreparedAudioBuffers {
  const steps = buildAudioBufferSteps(context, random);
  for (;;) {
    const step = steps.next();
    if (step.done) {
      if (!step.value) throw new Error('Audio buffer build ended without a complete pack');
      return step.value;
    }
  }
}

/** One caller owns this draft. Shared facade callers join its one promise;
 * cancelling a loading cue does not cancel another caller's mixer acquisition.
 */
export async function prepareAudioBuffers(
  context: AudioBufferContext, { yieldWork, signal, now }: PreparationOptions = {},
): Promise<PreparedAudioBuffers> {
  const yieldBudget = createOpaqueLoadingYielder(2, 80);
  const pause = yieldWork ?? (() => yieldBudget(true));
  const steps = buildAudioBufferSteps(context, mulberry32(9001), now);
  let complete = false;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const step = steps.next();
      if (step.done) {
        if (!step.value) throw new Error('Audio buffer preparation ended without a complete pack');
        complete = true;
        return step.value;
      }
      await pause();
    }
  } finally {
    if (!complete) steps.return(undefined);
  }
}
