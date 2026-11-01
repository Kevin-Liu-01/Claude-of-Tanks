/**
 * Couch seats (docs/COUCH-MODE.md "Seats in the battle"): which tank of a local battle each phone drives, and each
 * seat's controls between ticks. Pure and DOM-free: the local driver applies a seat's controls once per tick through the
 * core's player input stage (the authority's own), so a seat steps as a network seat does.
 *
 * Seats take tanks of the mode's own roster. The first seat present drives the battle's first tank (the page's player
 * seat: its HUD, its verdict); every other seat takes the next tank on its side, in roster order, and the rest stay the
 * mode's bots. A seat with no tank left on its side sits out the battle.
 */
import { PLAYER_ACTION_BITS } from '../sim/playerActions.ts';
import type { CouchSides } from '../sim/matchRuleset.ts';
import type { PadHoldAction, PadTapAction } from '../pad/padProtocol.ts';

export interface CouchSeatAssignment<T> {
  seat: number;
  entity: T;
}

/** How a couch battle is asked for: the lobby's seat numbers in play and how they take sides. */
export interface CouchBattle {
  seats: readonly number[];
  sides: CouchSides;
}

/** A couch battle's seats on the page (game.couch). */
export interface CouchSession<T> {
  sides: CouchSides;
  seats: CouchSeatAssignment<T>[];
}

/**
 * Seat the phones on the roster. `seats` are the lobby's seat numbers in play, `sides` each one's side (true: the first
 * tank's side, sim/matchRuleset.ts couchSeatSides), `allies` the tanks on the first tank's side.
 */
export function assignCouchSeats<T>(tanks: readonly T[], allies: ReadonlySet<T>, seats: readonly number[],
  sides: readonly boolean[]): CouchSeatAssignment<T>[] {
  const ordered = [...seats].sort((a, b) => a - b).slice(0, sides.length);
  const free = { ally: tanks.slice(1).filter((tank) => allies.has(tank)), enemy: tanks.slice(1).filter((tank) => !allies.has(tank)) };
  const assigned: CouchSeatAssignment<T>[] = [];
  ordered.forEach((seat, index) => {
    if (index === 0) { if (tanks[0] !== undefined) assigned.push({ seat, entity: tanks[0] }); return; }
    const entity = (sides[index] ? free.ally : free.enemy).shift();
    if (entity !== undefined) assigned.push({ seat, entity });
  });
  return assigned;
}

/** The input a seat hands the player input stage each tick (sim/playerInputStage.ts AuthoritativePlayerInput). */
export interface CouchSeatInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimLocked: boolean;
  shellSlot: number;
  actionBits: number;
  aimYaw: number;
  aimPitch: number;
  aimDistance: number;
}

/** The aim pad's drag, in the mapper's units (padInput.ts PAD_AIM_GAIN applied), turned into radians of bearing. */
const AIM_RAD_PER_UNIT = 0.0035;
/** A seat's sight sits this far out along its bearing until something nearer is in the way (the driver may shorten it). */
export const COUCH_AIM_DISTANCE_M = 400;
const PITCH_LIMIT = 0.35;

/** The phone's taps that are presses in the core (one tick each); the scope and zoom keys mean nothing here. */
const TAP_BITS: Partial<Record<PadTapAction, number>> = {
  consumable1: PLAYER_ACTION_BITS.REPAIR,
  consumable2: PLAYER_ACTION_BITS.FIRST_AID,
  consumable3: PLAYER_ACTION_BITS.EXTINGUISHER,
  reloadMagazine: PLAYER_ACTION_BITS.RELOAD_MAGAZINE,
  specialAction: PLAYER_ACTION_BITS.SPECIAL_ACTION,
  selfRight: PLAYER_ACTION_BITS.SELF_RIGHT,
  smoke: PLAYER_ACTION_BITS.SMOKE,
};
const SHELL_TAPS: Partial<Record<PadTapAction, number>> = { shell1: 0, shell2: 1, shell3: 2 };

/**
 * One seat's controls, driven by its phone receiver as the touch HUD drives the input layer (padInput.ts PadInputPort),
 * read by the local driver once per tick. Levels (stick, fire, brake) hold until they change; a tap is a press the next
 * tick carries once, then clears (the core consumes action bits each tick: a held bit would press again every tick).
 */
export interface CouchSeatControls {
  setVirtualMove(x: number, y: number): void;
  addVirtualAim(dx: number, dy: number): void;
  pressVirtual(actionId: PadHoldAction | PadTapAction): void;
  releaseVirtual(actionId: PadHoldAction | PadTapAction): void;
  tapVirtual(actionId: PadTapAction): void;
  /** Point the sight along a world bearing (a new battle: the seat's hull and gun). */
  aimAlong(yaw: number): void;
  /** Write this tick's input into `out`, and clear the presses it carried. */
  take(out: CouchSeatInput): CouchSeatInput;
  /** Let every control go (the phone left, the battle ended). */
  release(): void;
}

export function createCouchSeatControls(): CouchSeatControls {
  let steer = 0;
  let throttle = 0;
  let fire = false;
  let brake = false;
  let shellSlot = 0;
  let pending = 0;
  let aimYaw = 0;
  let aimPitch = 0;
  return {
    setVirtualMove(x, y) {
      // the stick's x is screen-right; a tank's steer is positive hull yaw, the nose toward screen-left (playerFrameInput)
      steer = Math.max(-1, Math.min(1, -x));
      throttle = Math.max(-1, Math.min(1, y));
    },
    addVirtualAim(dx, dy) {
      // dragging right turns the gun right, toward the hull's -X side: the bearing (atan2(x, z)) falls
      aimYaw -= dx * AIM_RAD_PER_UNIT;
      aimPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, aimPitch - dy * AIM_RAD_PER_UNIT * 0.5));
    },
    pressVirtual(actionId) {
      if (actionId === 'fire') fire = true;
      else if (actionId === 'handbrake') brake = true;
    },
    releaseVirtual(actionId) {
      if (actionId === 'fire') fire = false;
      else if (actionId === 'handbrake') brake = false;
    },
    tapVirtual(actionId) {
      const slot = SHELL_TAPS[actionId];
      if (slot !== undefined) { shellSlot = slot; return; }
      pending |= TAP_BITS[actionId] ?? 0;
    },
    aimAlong(yaw) { aimYaw = yaw; aimPitch = 0; },
    take(out) {
      out.throttle = throttle;
      out.steer = steer;
      out.brake = brake;
      out.fire = fire;
      out.aimLocked = false;
      out.shellSlot = shellSlot;
      out.actionBits = pending;
      out.aimYaw = aimYaw;
      out.aimPitch = aimPitch;
      out.aimDistance = COUCH_AIM_DISTANCE_M;
      pending = 0;
      return out;
    },
    release() {
      steer = 0; throttle = 0; fire = false; brake = false; pending = 0;
    },
  };
}
