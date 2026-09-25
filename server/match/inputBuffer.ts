/**
 * Per-seat input admission: a small tick-keyed buffer with v1's rejection
 * rules (stale, far-ahead, pre-handshake handled by the actor), an adaptive
 * 1..3 tick jitter buffer, held-input expiry and edge sequences applied once.
 */
import { ACTION_BIT_MASK, CONTROL_FLAGS, NO_TICK } from '../../src/mp/wire/constants.ts';
import type { ControlFrame, InputMessage } from '../../src/mp/wire/messages.ts';
import {
  dequantizeAimDistance, dequantizeAimPitch, dequantizeAngle, dequantizeControlAxis,
} from '../../src/mp/wire/quantize.ts';
import type { AuthoritativePlayerInput } from '../../src/sim/authoritativeMatch.ts';

const RING = 64;
const HELD_INPUT_LEASE_TICKS = 30;   // v1: 500 ms without a fresh frame releases the controls
const ADAPT_WINDOW = 60;             // frames per adaptation decision (about one second at 60 Hz)
const LATE_RATE_GROW = 0.05;
const MARGIN_SHRINK = 2;

export interface AdmitResult {
  /** Controls stored for future ticks (duplicates excluded). */
  accepted: number;
  /** Controls older than the newest already applied tick. */
  stale: number;
  /** True when the frame's tick is further ahead than the lead bound: the whole frame is rejected. */
  farAhead: boolean;
}

export interface SeatInputBufferOptions {
  /** The frame is rejected when its newest tick exceeds serverTick + maxLeadTicks (v1: 120). */
  maxLeadTicks?: number;
  initialBufferTicks?: number;
}

export interface SeatInputBuffer {
  readonly bufferTicks: number;
  readonly lastAppliedTick: number;
  readonly lastAppliedFireSeq: number;
  readonly lastAppliedActionSeq: number;
  readonly snapshotAckTick: number;
  readonly interpDelayMs: number;
  /** Ticks of margin the newest frame arrived with (smoothed minimum), or null. */
  readonly marginTicks: number | null;
  readonly stats: { frames: number; accepted: number; stale: number; farAhead: number; late: number; held: number; dry: number };
  admit(frame: InputMessage, serverTick: number): AdmitResult;
  /** The authority input for `serverTick` (applies tick serverTick - bufferTicks), or a neutral hold. */
  inputFor(serverTick: number): AuthoritativePlayerInput;
  /** A neutral, braking input (no driver). */
  neutral(): AuthoritativePlayerInput;
  reset(): void;
}

function makeInput(): AuthoritativePlayerInput {
  return {
    throttle: 0, steer: 0, brake: true, fire: false, fireIntentSeq: null, aimLocked: true,
    shellSlot: 0, actionBits: 0, aimYaw: 0, aimPitch: 0, aimDistance: 1000,
  };
}

export function createSeatInputBuffer({ maxLeadTicks = 120, initialBufferTicks = 1 }: SeatInputBufferOptions = {}): SeatInputBuffer {
  if (!Number.isInteger(maxLeadTicks) || maxLeadTicks < 1) throw new TypeError('maxLeadTicks must be a positive integer');
  const ticks = new Int32Array(RING).fill(-1);
  const controls: (ControlFrame | null)[] = new Array(RING).fill(null);
  const output = makeInput();
  const stats = { frames: 0, accepted: 0, stale: 0, farAhead: 0, late: 0, held: 0, dry: 0 };
  let bufferTicks = Math.min(3, Math.max(1, initialBufferTicks | 0));
  let lastAppliedTick = -1;
  let lastAppliedFireSeq = -1;
  let lastAppliedActionSeq = -1;
  let snapshotAckTick = NO_TICK;
  let interpDelayMs = 0;
  let newestStoredTick = -1;
  let lastFrameServerTick = -1;
  // adaptation window
  let windowFrames = 0;
  let windowLate = 0;
  let windowMinMargin = Infinity;
  let marginTicks: number | null = null;
  // held controls (the last applied) keep aim and ammunition selection across gaps
  let held: ControlFrame | null = null;
  let heldTick = -1;

  function slot(tick: number): number { return tick % RING; }

  function adapt(): void {
    if (windowFrames < ADAPT_WINDOW) return;
    const lateRate = windowLate / windowFrames;
    if (lateRate > LATE_RATE_GROW && bufferTicks < 3) bufferTicks++;
    else if (windowMinMargin >= bufferTicks + MARGIN_SHRINK && bufferTicks > 1) bufferTicks--;
    windowFrames = 0;
    windowLate = 0;
    windowMinMargin = Infinity;
  }

  function fillInput(control: ControlFrame, edges: boolean): AuthoritativePlayerInput {
    output.throttle = dequantizeControlAxis(control.throttle);
    output.steer = dequantizeControlAxis(control.steer);
    output.brake = (control.flags & CONTROL_FLAGS.BRAKE) !== 0;
    output.aimLocked = (control.flags & CONTROL_FLAGS.AIM_LOCKED) !== 0;
    output.aimYaw = dequantizeAngle(control.aimYaw);
    output.aimPitch = dequantizeAimPitch(control.aimPitch);
    output.aimDistance = Math.max(0.01, dequantizeAimDistance(control.aimDistance));
    output.shellSlot = control.shellSlot;
    const firePress = edges && control.fireSeq !== lastAppliedFireSeq;
    output.fire = (control.flags & CONTROL_FLAGS.FIRE_HELD) !== 0 || firePress;
    output.fireIntentSeq = output.fire ? control.fireSeq : null;
    const actionPress = edges && control.actionSeq !== lastAppliedActionSeq;
    output.actionBits = actionPress ? control.actionBits & ACTION_BIT_MASK : 0;
    if (edges) {
      lastAppliedFireSeq = control.fireSeq;
      lastAppliedActionSeq = control.actionSeq;
    }
    return output;
  }

  return {
    get bufferTicks() { return bufferTicks; },
    get lastAppliedTick() { return lastAppliedTick; },
    get lastAppliedFireSeq() { return lastAppliedFireSeq; },
    get lastAppliedActionSeq() { return lastAppliedActionSeq; },
    get snapshotAckTick() { return snapshotAckTick; },
    get interpDelayMs() { return interpDelayMs; },
    get marginTicks() { return marginTicks; },
    stats,
    admit(frame, serverTick) {
      stats.frames++;
      if (frame.clientTick > serverTick + maxLeadTicks) {
        stats.farAhead++;
        return { accepted: 0, stale: 0, farAhead: true };
      }
      if (frame.snapshotAckTick !== NO_TICK && frame.snapshotAckTick <= serverTick &&
          (snapshotAckTick === NO_TICK || frame.snapshotAckTick > snapshotAckTick)) {
        snapshotAckTick = frame.snapshotAckTick;
      }
      interpDelayMs = frame.interpDelayMs;
      let accepted = 0;
      let stale = 0;
      const first = frame.clientTick - frame.controls.length + 1;
      for (let index = 0; index < frame.controls.length; index++) {
        const tick = first + index;
        if (tick <= lastAppliedTick) { stale++; continue; }
        const at = slot(tick);
        if (ticks[at] === tick) continue; // redundant copy of a control already held
        ticks[at] = tick;
        controls[at] = frame.controls[index]!;
        if (tick > newestStoredTick) newestStoredTick = tick;
        accepted++;
      }
      stats.accepted += accepted;
      stats.stale += stale;
      // arrival margin of the newest control against its apply tick (serverTick + 1 - bufferTicks is the next apply target)
      if (serverTick !== lastFrameServerTick || windowFrames === 0) {
        const applyTarget = serverTick + 1 - bufferTicks;
        const margin = frame.clientTick - applyTarget;
        windowFrames++;
        if (margin < 0) windowLate++;
        if (margin < windowMinMargin) windowMinMargin = margin;
        marginTicks = marginTicks == null ? margin : Math.min(margin, Math.round(marginTicks * 0.9 + margin * 0.1));
        adapt();
      }
      lastFrameServerTick = serverTick;
      return { accepted, stale, farAhead: false };
    },
    inputFor(serverTick) {
      const target = serverTick - bufferTicks;
      let applyTick = -1;
      if (target >= 0 && ticks[slot(target)] === target && target > lastAppliedTick) applyTick = target;
      else {
        // a late control (arrived after its tick passed) is still newer than what runs: apply the newest one
        for (let tick = target - 1; tick > lastAppliedTick && tick > target - RING; tick--) {
          if (ticks[slot(tick)] === tick) { applyTick = tick; stats.late++; break; }
        }
      }
      if (applyTick >= 0) {
        const control = controls[slot(applyTick)]!;
        lastAppliedTick = applyTick;
        held = control;
        heldTick = serverTick;
        return fillInput(control, true);
      }
      if (held && serverTick - heldTick <= HELD_INPUT_LEASE_TICKS) {
        stats.held++;
        return fillInput(held, false);
      }
      stats.dry++;
      if (held) {
        // the lease expired: keep aim and ammunition, release drive and fire (v1)
        const neutral = fillInput(held, false);
        neutral.throttle = 0; neutral.steer = 0; neutral.brake = true; neutral.fire = false;
        neutral.fireIntentSeq = null; neutral.aimLocked = true; neutral.actionBits = 0;
        return neutral;
      }
      return this.neutral();
    },
    neutral() {
      const neutral = makeInput();
      return neutral;
    },
    reset() {
      ticks.fill(-1);
      controls.fill(null);
      lastAppliedTick = -1; lastAppliedFireSeq = -1; lastAppliedActionSeq = -1;
      snapshotAckTick = NO_TICK; newestStoredTick = -1; held = null; heldTick = -1;
      windowFrames = 0; windowLate = 0; windowMinMargin = Infinity; marginTicks = null;
    },
  };
}
