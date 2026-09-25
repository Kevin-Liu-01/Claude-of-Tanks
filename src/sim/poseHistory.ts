/**
 * Per-entity pose history for server-side lag compensation (Multiplayer v2).
 *
 * A fixed ring of the last `capacityTicks` armor poses per entity slot,
 * allocation-free after construction. The match actor records every entity
 * after each fixed step and rewinds a target to the tick a shooter was
 * looking at when a shell's sweep tests it (authoritativeMatch's
 * `traceTargetPose` seam). Renderer-free; ticks are the authority's own.
 */
import { Vector3 } from 'three';
import type { ArmorPoseState, TankArmorPose } from './armor.ts';

const STRIDE = 8; // x y z yaw pitch roll turretYaw gunPitch
const NO_TICK = -1;

export interface PoseHistory {
  readonly capacityTicks: number;
  readonly maxSlots: number;
  /** Store `state`'s pose for `slot` at `tick` (ticks must not decrease per slot). */
  record(slot: number, tick: number, state: ArmorPoseState): void;
  /** Write the pose recorded at `tick` into `out`; false when it is not held. */
  rewind(slot: number, tick: number, out: TankArmorPose): boolean;
  /** The newest recorded tick for a slot, or -1. */
  latestTick(slot: number): number;
  /** The oldest tick still held for a slot, or -1. */
  oldestTick(slot: number): number;
  /** Forget a slot (an entity that left the match). */
  clear(slot: number): void;
}

export function createTankArmorPose(): TankArmorPose {
  return { pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
}

export function createPoseHistory({ capacityTicks = 24, maxSlots = 64 }: { capacityTicks?: number; maxSlots?: number } = {}): PoseHistory {
  if (!Number.isInteger(capacityTicks) || capacityTicks < 1 || capacityTicks > 600) {
    throw new TypeError('pose history capacity must be 1..600 ticks');
  }
  if (!Number.isInteger(maxSlots) || maxSlots < 1 || maxSlots > 256) {
    throw new TypeError('pose history slots must be 1..256');
  }
  const values = new Float64Array(maxSlots * capacityTicks * STRIDE);
  const ticks = new Int32Array(maxSlots * capacityTicks).fill(NO_TICK);
  const latest = new Int32Array(maxSlots).fill(NO_TICK);

  function checkSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= maxSlots) {
      throw new RangeError(`pose history slot out of range: ${slot}`);
    }
  }

  function ring(slot: number, tick: number): number {
    return slot * capacityTicks + (tick % capacityTicks);
  }

  return {
    capacityTicks,
    maxSlots,
    record(slot, tick, state) {
      checkSlot(slot);
      if (!Number.isInteger(tick) || tick < 0) throw new RangeError(`pose history tick out of range: ${tick}`);
      if (tick < latest[slot]!) throw new RangeError('pose history ticks must not decrease');
      const entry = ring(slot, tick);
      const base = entry * STRIDE;
      values[base] = state.pos.x;
      values[base + 1] = state.pos.y;
      values[base + 2] = state.pos.z;
      values[base + 3] = state.yaw;
      values[base + 4] = state.visualPitch;
      values[base + 5] = state.visualRoll;
      values[base + 6] = state.turretYaw;
      values[base + 7] = state.gunPitch;
      ticks[entry] = tick;
      latest[slot] = tick;
    },
    rewind(slot, tick, out) {
      checkSlot(slot);
      if (!Number.isInteger(tick) || tick < 0) return false;
      const entry = ring(slot, tick);
      if (ticks[entry] !== tick) return false;
      const base = entry * STRIDE;
      out.pos.set(values[base]!, values[base + 1]!, values[base + 2]!);
      out.yaw = values[base + 3]!;
      out.pitch = values[base + 4]!;
      out.roll = values[base + 5]!;
      out.turretYaw = values[base + 6]!;
      out.gunPitch = values[base + 7]!;
      return true;
    },
    latestTick(slot) {
      checkSlot(slot);
      return latest[slot]!;
    },
    oldestTick(slot) {
      checkSlot(slot);
      const newest = latest[slot]!;
      if (newest < 0) return NO_TICK;
      let oldest = newest;
      for (let back = 1; back < capacityTicks; back++) {
        const tick = newest - back;
        if (tick < 0 || ticks[ring(slot, tick)] !== tick) break;
        oldest = tick;
      }
      return oldest;
    },
    clear(slot) {
      checkSlot(slot);
      ticks.fill(NO_TICK, slot * capacityTicks, (slot + 1) * capacityTicks);
      latest[slot] = NO_TICK;
    },
  };
}
