import type { RuntimeValue } from '../runtimeTypes.ts';
import type { PresentationEvent } from './presentationEventQueue.ts';

export interface ShotPresentationInput {
  fire?: boolean;
  shellSlot?: number;
  actionBits?: number;
}

export interface ShotPredictionContext {
  fireIntentSeq: number | null;
  supported: boolean;
  nowMs: number;
  authorityReceivedAtMs: number | null;
}

/** Reused frame-owned data, applied after fresh state and before impact events. */
export interface LocalShotPresentationFrame {
  input: ShotPresentationInput | null;
  context: ShotPredictionContext;
  events: PresentationEvent[];
}

/** Presentation eligibility only. No simulation, ammunition or projectile state. */
export interface ShotAuthorityReadiness {
  tick: number;
  alive: boolean;
  shellSlot: number;
  reloadS: number;
  ammo: number;
  magazineRounds: number;
  magazineCapacity: number;
  guided: boolean;
  weaponBlocked: boolean;
}

export interface PredictedShotRecord {
  intentSeq: number;
  shellSlot: number;
  muzzleIndex: number | null;
  confirmed: boolean;
}

const MAX_RECENT_INTENTS = 64;
const MAX_AUTHORITY_AGE_MS = 250;

export class LocalShotPrediction {
  private readonly predictions = new Map<number, PredictedShotRecord>();
  private authority: ShotAuthorityReadiness | null = null;
  private readyEpoch = 0;
  private predictedEpoch = -1;
  private pendingIntent: number | null = null;

  get authorityTick(): number { return this.authority?.tick ?? -1; }

  observe(authority: ShotAuthorityReadiness): void {
    const previous = this.authority;
    if (previous && authority.tick <= previous.tick) return;
    if (!previous || previous.alive !== authority.alive || previous.shellSlot !== authority.shellSlot ||
        previous.ammo !== authority.ammo || previous.magazineRounds !== authority.magazineRounds ||
        this.ready(previous) !== this.ready(authority)) {
      this.readyEpoch++;
      this.pendingIntent = null;
    }
    this.authority = { ...authority };
  }

  private ready(authority: ShotAuthorityReadiness): boolean {
    return authority.alive && !authority.weaponBlocked && authority.reloadS <= 0 && authority.ammo > 0 &&
      (authority.guided || authority.magazineCapacity <= 0 || authority.magazineRounds > 0);
  }

  predict(intentSeq: number | null, shellSlot: number, nowMs: number, authorityReceivedAtMs: number | null): PredictedShotRecord | null {
    const authority = this.authority;
    if (!Number.isSafeInteger(intentSeq) || Number(intentSeq) < 0 || Number(intentSeq) > 0x7fffffff ||
        !Number.isFinite(nowMs) || authorityReceivedAtMs == null || !Number.isFinite(authorityReceivedAtMs) ||
        nowMs < authorityReceivedAtMs || nowMs - authorityReceivedAtMs > MAX_AUTHORITY_AGE_MS ||
        !authority || shellSlot !== authority.shellSlot || !this.ready(authority) ||
        this.pendingIntent != null || this.predictedEpoch === this.readyEpoch ||
        this.predictions.has(Number(intentSeq))) return null;
    const record: PredictedShotRecord = { intentSeq: Number(intentSeq), shellSlot,
      muzzleIndex: null, confirmed: false };
    this.predictions.set(record.intentSeq, record);
    if (this.predictions.size > MAX_RECENT_INTENTS) {
      this.predictions.delete(this.predictions.keys().next().value!);
    }
    this.pendingIntent = record.intentSeq;
    this.predictedEpoch = this.readyEpoch;
    return record;
  }

  confirm(intentSeq: RuntimeValue, shellSlot: RuntimeValue): PredictedShotRecord | null {
    if (typeof intentSeq !== 'number' || typeof shellSlot !== 'number') return null;
    const record = this.predictions.get(intentSeq);
    if (!record || record.confirmed || record.shellSlot !== shellSlot) return null;
    record.confirmed = true;
    if (this.pendingIntent === intentSeq) this.pendingIntent = null;
    return record;
  }

  /** Retain bounded dedup receipts so a late accepted shot cannot replay a flash. */
  cancel(): void { this.pendingIntent = null; }

  reset(): void {
    this.predictions.clear();
    this.authority = null;
    this.readyEpoch = 0;
    this.predictedEpoch = -1;
    this.pendingIntent = null;
  }
}
