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
 * viewerWorldEvent) or one nobody recorded (a list restored from a migration keyframe). It lays the prop as that withheld
 * event lays it: along the prop's own fall axis (direction 0, 0), as a ram.
 *
 * Pure: the encoder reads detMath (the authority's), the decoder plain Math (presentation). Node-runnable.
 */
import * as detMath from './detMath.ts';

export const OBSTACLE_FALL_NONE = 0;
const CAUSE_SHIFT = 6;
const HEADING_MASK = 0x3f;
const HEADING_STEPS = 64;
const CAUSE_RAM = 1;
const CAUSE_SHELL = 2;

export type ObstacleFallCause = 'ram' | 'shell';

/** A fall as the presentation's crush takes it: the world-space direction (unit, or 0, 0 for none) and the cause. */
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

/** The fall a byte names, into `out` (none: the withheld event's lay, direction 0, 0 as a ram). */
export function decodeObstacleFall(code: number, out: ObstacleFall): ObstacleFall {
  const cause = isObstacleFallCode(code) ? code >> CAUSE_SHIFT : 0;
  if (cause === 0) {
    out.cause = 'ram'; out.dx = 0; out.dz = 0;
    return out;
  }
  const heading = ((code & HEADING_MASK) / HEADING_STEPS) * 2 * Math.PI;
  out.cause = cause === CAUSE_SHELL ? 'shell' : 'ram';
  out.dx = Math.sin(heading);
  out.dz = Math.cos(heading);
  return out;
}
