/**
 * Input sampler and stream (charter §4 "Input"). Controls are sampled once
 * per simulation tick; every INPUT frame carries the newest three ticks so
 * one lost frame loses nothing; the snapshot echoes the newest applied tick
 * and the consumed fire/action sequences. Fire and action edges are
 * sequence numbers that repeat in every frame until the snapshot acknowledges
 * them, so a press can never be lost and never applied twice by the client's
 * doing. The tick lead (how far ahead of the server the client samples) is
 * adjusted from the server's `inputMarginTicks` so controls arrive one to
 * three ticks early.
 */
import {
  ACTION_BIT_MASK, CONTROL_FLAGS, INPUT_MARGIN_UNKNOWN, MAX_CONTROLS_PER_INPUT, MESSAGE_TYPE, NO_TICK,
  dequantizeAimDistance, dequantizeAimPitch, dequantizeAngle, dequantizeControlAxis, quantizeAimDistance,
  quantizeAimPitch, quantizeAngle, quantizeControlAxis,
} from '../wire/index.ts';
import type { ControlFrame, InputMessage } from '../wire/index.ts';

/** What the presentation samples from the player's devices each tick (SI units, radians). */
export interface ControlSample {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimLocked: boolean;
  aimYaw: number;
  aimPitch: number;
  aimDistance: number;
  shellSlot: number;
  /** ACTION_BITS pressed since the previous sample (edges, not holds). */
  actionPresses: number;
}

/** The control the shared movement replay uses: the quantized values the server also sees. */
export interface PredictionControl {
  tick: number;
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimLocked: boolean;
  aimYaw: number;
  aimPitch: number;
  aimDistance: number;
  shellSlot: number;
  fireSeq: number;
  actionSeq: number;
  actionBits: number;
}

export interface InputStreamOptions {
  redundancy?: number;
  initialLeadTicks?: number;
  minLeadTicks?: number;
  maxLeadTicks?: number;
  historyTicks?: number;
  /** Margin the controller keeps the server's inputMarginTicks inside. */
  marginTarget?: { low: number; high: number };
  /** Rate limits of the lead controller. */
  raiseLeadEveryMs?: number;
  lowerLeadEveryMs?: number;
}

export interface InputStreamStats {
  sampledTicks: number;
  framesBuilt: number;
  leadTicks: number;
  lastMarginTicks: number;
  ackedInputTick: number;
  lastSampledTick: number;
  /** lastSampledTick − ackedInputTick at the last acknowledgement (ticks). */
  ackLagTicks: number;
  pendingFireEdges: number;
  pendingActionBits: number;
  skippedTicks: number;
}

export const NEUTRAL_CONTROL: Readonly<ControlSample> = Object.freeze({
  throttle: 0, steer: 0, brake: true, fire: false, aimLocked: true,
  aimYaw: 0, aimPitch: 0, aimDistance: 1000, shellSlot: 0, actionPresses: 0,
});

/** u16 sequence arithmetic: true when `a` is newer than `b`. */
export function seqNewer(a: number, b: number): boolean {
  const delta = (a - b) & 0xffff;
  return delta !== 0 && delta < 0x8000;
}

export function seqNewerOrEqual(a: number, b: number): boolean {
  return a === b || seqNewer(a, b);
}

function toPredictionControl(tick: number, frame: ControlFrame): PredictionControl {
  return {
    tick,
    throttle: dequantizeControlAxis(frame.throttle),
    steer: dequantizeControlAxis(frame.steer),
    brake: (frame.flags & CONTROL_FLAGS.BRAKE) !== 0,
    fire: (frame.flags & CONTROL_FLAGS.FIRE_HELD) !== 0,
    aimLocked: (frame.flags & CONTROL_FLAGS.AIM_LOCKED) !== 0,
    aimYaw: dequantizeAngle(frame.aimYaw),
    aimPitch: dequantizeAimPitch(frame.aimPitch),
    aimDistance: dequantizeAimDistance(frame.aimDistance),
    shellSlot: frame.shellSlot,
    fireSeq: frame.fireSeq,
    actionSeq: frame.actionSeq,
    actionBits: frame.actionBits,
  };
}

export class InputStream {
  readonly redundancy: number;
  readonly minLeadTicks: number;
  readonly maxLeadTicks: number;
  readonly historyTicks: number;
  readonly marginTarget: { low: number; high: number };
  readonly raiseLeadEveryMs: number;
  readonly lowerLeadEveryMs: number;
  private leadTicks: number;
  private nextTick = 0;
  private started = false;
  private fireSeq = 0;
  private actionSeq = 0;
  private lastFireHeld = false;
  private pendingActionBits = 0;
  private readonly actionFirstSeq = new Map<number, number>();
  private readonly frames: ControlFrame[] = [];
  private readonly controls = new Map<number, PredictionControl>();
  private ackedInputTick = NO_TICK;
  private ackedFireSeq = 0;
  private ackedActionSeq = 0;
  private lastMarginTicks = INPUT_MARGIN_UNKNOWN;
  private lastLeadRaiseMs = -Infinity;
  private lastLeadLowerMs = -Infinity;
  private ackLagTicks = 0;
  private sampledTicks = 0;
  private framesBuilt = 0;
  private skippedTicks = 0;

  constructor({
    redundancy = MAX_CONTROLS_PER_INPUT,
    initialLeadTicks = 2,
    minLeadTicks = 0,
    maxLeadTicks = 12,
    historyTicks = 240,
    marginTarget = { low: 1, high: 3 },
    raiseLeadEveryMs = 250,
    lowerLeadEveryMs = 1000,
  }: InputStreamOptions = {}) {
    if (redundancy < 1 || redundancy > MAX_CONTROLS_PER_INPUT) throw new TypeError('redundancy must be 1..3');
    this.redundancy = redundancy;
    this.leadTicks = initialLeadTicks;
    this.minLeadTicks = minLeadTicks;
    this.maxLeadTicks = maxLeadTicks;
    this.historyTicks = historyTicks;
    this.marginTarget = marginTarget;
    this.raiseLeadEveryMs = raiseLeadEveryMs;
    this.lowerLeadEveryMs = lowerLeadEveryMs;
  }

  get isStarted(): boolean { return this.started; }
  /** The tick the next sample receives. */
  get pendingTick(): number { return this.nextTick; }
  get lastSampledTick(): number { return this.nextTick - 1; }
  get lead(): number { return this.leadTicks; }
  get currentFireSeq(): number { return this.fireSeq; }
  get currentActionSeq(): number { return this.actionSeq; }

  /** Start (or restart after a reconnect) at a tick; older history is dropped. */
  start(tick: number): void {
    this.nextTick = Math.max(0, Math.floor(tick));
    this.started = true;
    this.frames.length = 0;
    this.controls.clear();
    this.lastFireHeld = false;
  }

  /**
   * Ticks to sample now so the newest control targets `targetTick`. Bounded
   * per display frame; a client that fell far behind (a suspended tab) skips
   * ahead instead of flooding the server with stale controls.
   */
  dueTicks(targetTick: number, maxPerFrame = 4, catchUpLimit = 8): number {
    if (!this.started) return 0;
    const behind = Math.floor(targetTick) - this.nextTick + 1;
    if (behind <= 0) return 0;
    if (behind > catchUpLimit) {
      const skipped = behind - maxPerFrame;
      this.skippedTicks += skipped;
      this.nextTick += skipped;
      return maxPerFrame;
    }
    return Math.min(behind, maxPerFrame);
  }

  /** Sample one tick of controls; returns the replay control for the predictor. */
  sample(control: Readonly<ControlSample>): PredictionControl {
    if (!this.started) throw new Error('input stream not started');
    const fireHeld = !!control.fire;
    if (fireHeld && !this.lastFireHeld) this.fireSeq = (this.fireSeq + 1) & 0xffff;
    this.lastFireHeld = fireHeld;
    const presses = (control.actionPresses | 0) & ACTION_BIT_MASK;
    const fresh = presses & ~this.pendingActionBits;
    if (fresh) {
      this.actionSeq = (this.actionSeq + 1) & 0xffff;
      for (let bit = 1; bit <= ACTION_BIT_MASK; bit <<= 1) {
        if (fresh & bit) this.actionFirstSeq.set(bit, this.actionSeq);
      }
      this.pendingActionBits |= fresh;
    }
    const frame: ControlFrame = {
      throttle: quantizeControlAxis(control.throttle),
      steer: quantizeControlAxis(control.steer),
      flags: (fireHeld ? CONTROL_FLAGS.FIRE_HELD : 0) | (control.brake ? CONTROL_FLAGS.BRAKE : 0) |
        (control.aimLocked ? CONTROL_FLAGS.AIM_LOCKED : 0),
      aimYaw: quantizeAngle(control.aimYaw),
      aimPitch: quantizeAimPitch(control.aimPitch),
      aimDistance: quantizeAimDistance(control.aimDistance),
      shellSlot: Math.max(0, Math.min(2, control.shellSlot | 0)),
      fireSeq: this.fireSeq,
      actionSeq: this.actionSeq,
      actionBits: this.pendingActionBits,
    };
    const tick = this.nextTick++;
    this.frames.push(frame);
    if (this.frames.length > this.redundancy) this.frames.shift();
    const replay = toPredictionControl(tick, frame);
    this.controls.set(tick, replay);
    if (this.controls.size > this.historyTicks) {
      const oldest = tick - this.historyTicks;
      for (const key of this.controls.keys()) { if (key <= oldest) this.controls.delete(key); else break; }
    }
    this.sampledTicks++;
    return replay;
  }

  /** The INPUT frame for the newest sampled ticks (null before the first sample). */
  frame(snapshotAckTick: number, interpDelayMs: number): InputMessage | null {
    if (this.frames.length === 0) return null;
    this.framesBuilt++;
    return {
      type: MESSAGE_TYPE.INPUT,
      clientTick: this.nextTick - 1,
      snapshotAckTick,
      interpDelayMs: Math.max(0, Math.min(255, Math.round(interpDelayMs))),
      controls: this.frames.slice(),
    };
  }

  /** The control sampled for `tick`, or the newest one before it (the server holds the last input too). */
  controlAt(tick: number): PredictionControl | null {
    const exact = this.controls.get(tick);
    if (exact) return exact;
    let best: PredictionControl | null = null;
    for (const control of this.controls.values()) {
      if (control.tick < tick && (!best || control.tick > best.tick)) best = control;
    }
    return best;
  }

  /** A snapshot's acknowledgements. */
  acknowledge(frame: { ackedInputTick: number; ackedFireSeq: number; ackedActionSeq: number; inputMarginTicks: number }, nowMs: number): void {
    if (frame.ackedInputTick !== NO_TICK) {
      if (this.ackedInputTick === NO_TICK || frame.ackedInputTick > this.ackedInputTick) this.ackedInputTick = frame.ackedInputTick;
      this.ackLagTicks = Math.max(0, this.lastSampledTick - frame.ackedInputTick);
    }
    if (seqNewer(frame.ackedFireSeq, this.ackedFireSeq)) this.ackedFireSeq = frame.ackedFireSeq;
    if (seqNewer(frame.ackedActionSeq, this.ackedActionSeq)) this.ackedActionSeq = frame.ackedActionSeq;
    for (const [bit, firstSeq] of this.actionFirstSeq) {
      if (seqNewerOrEqual(frame.ackedActionSeq, firstSeq)) {
        this.actionFirstSeq.delete(bit);
        this.pendingActionBits &= ~bit;
      }
    }
    if (frame.inputMarginTicks !== INPUT_MARGIN_UNKNOWN) this.adjustLead(frame.inputMarginTicks, nowMs);
  }

  private adjustLead(marginTicks: number, nowMs: number): void {
    this.lastMarginTicks = marginTicks;
    if (marginTicks < this.marginTarget.low) {
      if (nowMs - this.lastLeadRaiseMs >= this.raiseLeadEveryMs && this.leadTicks < this.maxLeadTicks) {
        this.leadTicks++;
        this.lastLeadRaiseMs = nowMs;
      }
    } else if (marginTicks > this.marginTarget.high) {
      if (nowMs - this.lastLeadLowerMs >= this.lowerLeadEveryMs && this.leadTicks > this.minLeadTicks) {
        this.leadTicks--;
        this.lastLeadLowerMs = nowMs;
      }
    }
  }

  /** Forget unsent presses (a reconnect starts a fresh stream; held controls are sampled anew). */
  clearPendingEdges(): void {
    this.pendingActionBits = 0;
    this.actionFirstSeq.clear();
    this.lastFireHeld = false;
  }

  stats(): InputStreamStats {
    return {
      sampledTicks: this.sampledTicks,
      framesBuilt: this.framesBuilt,
      leadTicks: this.leadTicks,
      lastMarginTicks: this.lastMarginTicks,
      ackedInputTick: this.ackedInputTick,
      lastSampledTick: this.lastSampledTick,
      ackLagTicks: this.ackLagTicks,
      pendingFireEdges: (this.fireSeq - this.ackedFireSeq) & 0xffff,
      pendingActionBits: this.pendingActionBits,
      skippedTicks: this.skippedTicks,
    };
  }
}
