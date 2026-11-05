/**
 * How a destroyed obstacle fell, in one byte (round 2 of the 2026-11-02 audit, U27; wire 11): the cause and the direction
 * a seat that did not see the fall lays the prop with (a late joiner's, a rejoin's or a reconnect's settled destroyed
 * list: mp/presentation/battlePresentation.ts applyDestroyed). Before, that replay laid every listed prop as a ram toward
 * +Z, because the list carried indices only.
 *
 *   bits 6-7  the cause: 0 none, 1 ram, 2 shell (a blast fells a prop as a shell does, as the live event lays it); 3 is
 *             no code;
 *   bits 0-5  the fall's heading, atan2(dx, dz) in 64ths of a turn (5.6 degrees); 0 when the cause is none.
 *
 * `none` is a fall this viewer may not read (the authority withholds a fall's cause and direction from a viewer that did
 * not see its source, as it withholds them from the live world_prop_destroyed event: sim/authoritativeMatch.ts
 * viewerWorldEvent) or one nobody recorded (a list restored from a migration keyframe). It lays the prop as a ram along
 * the prop's own heading (withheldObstacleFall: a fixed hash of its authority index), the lay the withheld live event
 * gets too, so a seat that watched a withheld fall and a seat that joined after it lay the prop alike. Not direction
 * (0, 0): the world's hinge reads a zero direction as a fall toward +Z (world/topple.ts setToppleAxis, settledToppleAngle),
 * so until the round 2 review every withheld fall, settled or live, lay toward +Z.
 *
 * Pure: the encoder reads detMath (the authority's), the decoder plain Math (presentation). Node-runnable.
 */
import * as detMath from './detMath.ts';

export const OBSTACLE_FALL_NONE = 0;
const CAUSE_SHIFT = 6;
const HEADING_BITS = 6;
const HEADING_MASK = 0x3f;
const HEADING_STEPS = 64;
const CAUSE_RAM = 1;
const CAUSE_SHELL = 2;

export type ObstacleFallCause = 'ram' | 'shell';

/** A fall as the presentation's crush takes it: the world-space direction (unit) and the cause. */
export interface ObstacleFall {
  cause: ObstacleFallCause;
  dx: number;
  dz: number;
}

/** The authority's fall as its byte: `cause` as destroyObstacle names it ('ram', 'shell', 'blast'), the direction it fell. */
export function encodeObstacleFall(cause: string, dx: number, dz: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return OBSTACLE_FALL_NONE;
  const code = cause === 'shell' || cause === 'blast' ? CAUSE_SHELL : CAUSE_RAM;
  const turns = detMath.atan2(dx, dz) / (2 * Math.PI);
  const heading = ((Math.round(turns * HEADING_STEPS) % HEADING_STEPS) + HEADING_STEPS) % HEADING_STEPS;
  return (code << CAUSE_SHIFT) | heading;
}

/** Whether a byte is a fall code (the decoder refuses anything else). */
export function isObstacleFallCode(code: number): boolean {
  if (!Number.isInteger(code) || code < 0 || code > 0xff) return false;
  const cause = code >> CAUSE_SHIFT;
  if (cause === 3) return false;
  return cause !== 0 || (code & HEADING_MASK) === 0;
}

/**
 * The fall a byte names for the prop with authority index `index`, into `out` (none, or no fall code: that prop's
 * withheld lay, withheldObstacleFall).
 */
export function decodeObstacleFall(code: number, index: number, out: ObstacleFall): ObstacleFall {
  const cause = isObstacleFallCode(code) ? code >> CAUSE_SHIFT : 0;
  if (cause === 0) return withheldObstacleFall(index, out);
  return headingFall(cause, code & HEADING_MASK, out);
}

/**
 * The lay of a fall this viewer may not read, for the prop with authority index `index` (the identity every seat shares,
 * whatever its world's layout): a ram along a heading that is the prop's own, the index's Fibonacci hash in 64ths of a
 * turn, so it says nothing the index does not, differs from prop to prop and is the same on every seat. The settled list's
 * none (battlePresentation applyDestroyed) and the live world_prop_destroyed event without its direction (the same
 * module's event handler) both lay a prop with it.
 */
export function withheldObstacleFall(index: number, out: ObstacleFall): ObstacleFall {
  return headingFall(CAUSE_RAM, Math.imul((index | 0) + 1, 0x9e3779b1) >>> (32 - HEADING_BITS), out);
}

function headingFall(cause: number, step: number, out: ObstacleFall): ObstacleFall {
  const heading = (step / HEADING_STEPS) * 2 * Math.PI;
  out.cause = cause === CAUSE_SHELL ? 'shell' : 'ram';
  out.dx = Math.sin(heading);
  out.dz = Math.cos(heading);
  return out;
}
