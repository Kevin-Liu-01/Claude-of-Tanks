/**
 * The viewer's controls for the match wire, sampled from the own actor's input record (the rig writes its aim point every
 * frame) with the HUD's action presses queued between ticks. Shared by the multiplayer composition and the solo sim
 * Worker's battle (src/game/soloSimBattleRuntime.ts): no room or session reaches it.
 */
import type { ControlSample } from '../match/inputStream.ts';
import { ACTION_BITS } from '../wire/index.ts';
import type { MatchActor } from './battlePresentation.ts';

const NAMED_ACTION_BITS: Readonly<Record<'reloadMagazine' | 'specialAction' | 'selfRight' | 'smoke' | 'lights' | 'roofGun' | 'lightsOff' | 'drone' | 'supplyAmmo' | 'supplyHeal', number>> = Object.freeze({
  reloadMagazine: ACTION_BITS.RELOAD_MAGAZINE,
  specialAction: ACTION_BITS.SPECIAL_ACTION,
  selfRight: ACTION_BITS.SELF_RIGHT,
  smoke: ACTION_BITS.SMOKE, lights: ACTION_BITS.LIGHTS, roofGun: ACTION_BITS.ROOF_GUN, lightsOff: ACTION_BITS.LIGHTS_OFF, drone: ACTION_BITS.DRONE, supplyAmmo: ACTION_BITS.SUPPLY_AMMO, supplyHeal: ACTION_BITS.SUPPLY_HEAL,
});
const CONSUMABLE_BITS = ACTION_BITS.REPAIR | ACTION_BITS.FIRST_AID | ACTION_BITS.EXTINGUISHER;
const DEFAULT_AIM_DISTANCE_M = 1000;
const MIN_AIM_DISTANCE_M = 0.01;
const MAX_AIM_DISTANCE_M = 2000;

function clampAimDistance(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AIM_DISTANCE_M;
  return Math.max(MIN_AIM_DISTANCE_M, Math.min(MAX_AIM_DISTANCE_M, value));
}

export interface ControlSampler {
  /** The viewer's controls for a tick from the own actor's input record (the rig writes its aim point every frame). */
  sample(tick: number): Readonly<ControlSample> | null;
  queueConsumable(slot: number): void;
  queueAction(action: 'reloadMagazine' | 'specialAction' | 'selfRight' | 'smoke' | 'lights' | 'roofGun' | 'lightsOff' | 'drone' | 'supplyAmmo' | 'supplyHeal'): void;
  reset(): void;
}

/** v1's browser input frame over the own actor: throttle/steer/brake/fire/aim from the input record, action edges queued by the HUD. */
export function createControlSampler(getOwn: () => MatchActor | null): ControlSampler {
  let pendingBits = 0;
  const scratch: ControlSample = {
    throttle: 0, steer: 0, brake: false, fire: false, aimLocked: false,
    aimYaw: 0, aimPitch: 0, aimDistance: DEFAULT_AIM_DISTANCE_M, shellSlot: 0, actionPresses: 0,
  };
  return {
    sample() {
      const own = getOwn();
      if (!own || own.combat.destroyed) return null;
      const { input, state } = own;
      const pos = own.aerial?.active ? own.aerial : state.pos;
      const target = input.aimPoint;
      const dx = target ? target.x - pos.x : Math.sin(state.yaw) * DEFAULT_AIM_DISTANCE_M;
      const dy = target ? target.y - pos.y : 0;
      const dz = target ? target.z - pos.z : Math.cos(state.yaw) * DEFAULT_AIM_DISTANCE_M;
      const horizontal = Math.hypot(dx, dz);
      scratch.throttle = input.throttle || 0;
      scratch.steer = input.steer || 0;
      scratch.brake = !!input.brake;
      scratch.fire = !!input.fire;
      scratch.aimLocked = !!input.aimLocked;
      scratch.aimYaw = Math.atan2(dx, dz);
      scratch.aimPitch = Math.atan2(dy, Math.max(1e-6, horizontal));
      scratch.aimDistance = clampAimDistance(Math.hypot(horizontal, dy));
      scratch.shellSlot = input.shellSlot | 0;
      scratch.actionPresses = pendingBits;
      pendingBits = 0;
      return scratch;
    },
    queueConsumable(slot) {
      if (!Number.isInteger(slot) || slot < 0 || slot > 2) return;
      pendingBits |= (1 << slot) & CONSUMABLE_BITS;
    },
    queueAction(action) {
      const bit = NAMED_ACTION_BITS[action];
      if (action==='lights'||action==='lightsOff')pendingBits &= ~(ACTION_BITS.LIGHTS|ACTION_BITS.LIGHTS_OFF);
      if (bit) pendingBits = action==='roofGun' ? pendingBits^bit : pendingBits|bit;
    },
    reset() { pendingBits = 0; },
  };
}
