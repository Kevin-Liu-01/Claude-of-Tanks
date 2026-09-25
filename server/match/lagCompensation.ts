/**
 * Lag compensation (Multiplayer v2 charter §4).
 *
 * Rule: every sweep of a shell fired by a seated player tests every other tank
 * at the pose it had `R` ticks earlier, where `R = round((owd + interp) / tickMs)`
 * — the shooter's measured one-way latency (half the median of its last eight
 * RTT samples) plus the interpolation delay it reported in its last INPUT —
 * clamped to [0, MAX_REWIND_TICKS] (15 ticks = 250 ms). R is fixed for the
 * shell's whole flight, so a shot lands where the shooter's reticle was at
 * every range; a rewound target is at most 250 ms "in the past" for the
 * victim. Bots and spectators never rewind. HE bursts and damage localization
 * inside the sweep read the same rewound poses; the live poses are restored
 * before the next shell (authoritativeMatch's `shellRewind` seam).
 */
import type { AuthoritativeEntity, ShellRewindHook } from '../../src/sim/authoritativeMatch.ts';
import type { DamageShell } from '../../src/sim/damage.ts';
import { SIM_DT } from '../../src/sim/movement.ts';
import { createPoseHistory, createTankArmorPose, type PoseHistory } from '../../src/sim/poseHistory.ts';

export const MAX_REWIND_TICKS = 15;
export const POSE_HISTORY_TICKS = 24;
const RTT_SAMPLES = 8;
const MAX_INTERP_DELAY_MS = 250;
const STRIDE = 8;

export interface LatencyTracker {
  /** Record one RTT sample (ms) for the seat. */
  sampleRtt(rttMs: number): void;
  setInterpDelayMs(value: number): void;
  /** Median one-way delay in ms (0 until sampled). */
  readonly owdMs: number;
  readonly interpDelayMs: number;
  /** The rewind this seat earns right now, in ticks. */
  rewindTicks(tickMs: number): number;
}

export function createLatencyTracker(): LatencyTracker {
  const samples: number[] = [];
  let interpDelayMs = 0;
  let owdMs = 0;
  const recompute = () => {
    if (!samples.length) { owdMs = 0; return; }
    const sorted = samples.slice().sort((a, b) => a - b);
    owdMs = sorted[sorted.length >> 1]! / 2;
  };
  return {
    sampleRtt(rttMs) {
      if (!Number.isFinite(rttMs) || rttMs < 0) return;
      samples.push(Math.min(2000, rttMs));
      if (samples.length > RTT_SAMPLES) samples.shift();
      recompute();
    },
    setInterpDelayMs(value) {
      interpDelayMs = Math.max(0, Math.min(MAX_INTERP_DELAY_MS, Number.isFinite(value) ? value : 0));
    },
    get owdMs() { return owdMs; },
    get interpDelayMs() { return interpDelayMs; },
    rewindTicks(tickMs) {
      return Math.max(0, Math.min(MAX_REWIND_TICKS, Math.round((owdMs + interpDelayMs) / tickMs)));
    },
  };
}

export interface LagCompensationStats {
  rewoundShots: number;
  rewoundSweeps: number;
  /** Sum and max over rewound shots of the nearest target's live-vs-rewound displacement (m). */
  mismatchSumM: number;
  mismatchMaxM: number;
  /** Sweeps where the history no longer held the tick (kept live). */
  historyMisses: number;
}

export interface LagCompensation extends ShellRewindHook {
  readonly history: PoseHistory;
  readonly stats: LagCompensationStats;
  /** Record every entity's pose after the step for `tick`. */
  record(tick: number): void;
  /** Bind an entity to a history slot (its wire entity id - 1). */
  bind(entity: AuthoritativeEntity, slot: number): void;
  unbind(entity: AuthoritativeEntity): void;
  /** Rewind budget per shooter id (seat latency), consulted at every sweep. */
  setRewindTicks(shooterId: string, ticks: number): void;
  readonly currentTick: number;
}

export function createLagCompensation({ entities, tickMs = SIM_DT * 1000 }: {
  entities: readonly AuthoritativeEntity[];
  tickMs?: number;
}): LagCompensation {
  const history = createPoseHistory({ capacityTicks: POSE_HISTORY_TICKS, maxSlots: 64 });
  const slots = new Map<AuthoritativeEntity, number>();
  const rewindByShooter = new Map<string, number>();
  const saved = new Float64Array(64 * STRIDE);
  const swapped: AuthoritativeEntity[] = [];
  const pose = createTankArmorPose();
  const stats: LagCompensationStats = { rewoundShots: 0, rewoundSweeps: 0, mismatchSumM: 0, mismatchMaxM: 0, historyMisses: 0 };
  let currentTick = 0;
  let active = false;

  return {
    history,
    stats,
    get currentTick() { return currentTick; },
    bind(entity, slot) { slots.set(entity, slot); },
    unbind(entity) {
      const slot = slots.get(entity);
      if (slot != null) history.clear(slot);
      slots.delete(entity);
    },
    setRewindTicks(shooterId, ticks) { rewindByShooter.set(shooterId, Math.max(0, Math.min(MAX_REWIND_TICKS, ticks | 0))); },
    record(tick) {
      currentTick = tick;
      for (const [entity, slot] of slots) {
        if (entity.modeActive === false) continue;
        history.record(slot, tick, entity.state);
      }
    },
    begin(shell: DamageShell) {
      if (active) return;
      const rewind = rewindByShooter.get(shell.shooterId) ?? 0;
      if (rewind <= 0) return;
      const targetTick = currentTick - rewind;
      if (targetTick < 0) return;
      const firstSweep = shell.ageS <= SIM_DT * 1.5;
      let nearestM = Infinity;
      let nearestMismatchM = 0;
      active = true;
      for (const entity of entities) {
        if (entity.id === shell.shooterId || entity.modeActive === false) continue;
        const slot = slots.get(entity);
        if (slot == null) continue;
        if (!history.rewind(slot, targetTick, pose)) { stats.historyMisses++; continue; }
        const state = entity.state;
        const base = slot * STRIDE;
        saved[base] = state.pos.x; saved[base + 1] = state.pos.y; saved[base + 2] = state.pos.z;
        saved[base + 3] = state.yaw; saved[base + 4] = state.visualPitch; saved[base + 5] = state.visualRoll;
        saved[base + 6] = state.turretYaw; saved[base + 7] = state.gunPitch;
        if (firstSweep) {
          const distance = state.pos.distanceTo(shell.pos);
          if (distance < nearestM) { nearestM = distance; nearestMismatchM = state.pos.distanceTo(pose.pos); }
        }
        state.pos.copy(pose.pos);
        state.yaw = pose.yaw; state.visualPitch = pose.pitch; state.visualRoll = pose.roll;
        state.turretYaw = pose.turretYaw; state.gunPitch = pose.gunPitch;
        swapped.push(entity);
      }
      stats.rewoundSweeps++;
      if (firstSweep) {
        stats.rewoundShots++;
        if (Number.isFinite(nearestM)) {
          stats.mismatchSumM += nearestMismatchM;
          if (nearestMismatchM > stats.mismatchMaxM) stats.mismatchMaxM = nearestMismatchM;
        }
      }
    },
    end() {
      if (!active) return;
      for (const entity of swapped) {
        const base = slots.get(entity)! * STRIDE;
        const state = entity.state;
        state.pos.set(saved[base]!, saved[base + 1]!, saved[base + 2]!);
        state.yaw = saved[base + 3]!; state.visualPitch = saved[base + 4]!; state.visualRoll = saved[base + 5]!;
        state.turretYaw = saved[base + 6]!; state.gunPitch = saved[base + 7]!;
      }
      swapped.length = 0;
      active = false;
    },
  };
}
