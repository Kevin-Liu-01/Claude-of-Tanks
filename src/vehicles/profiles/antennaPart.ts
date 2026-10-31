import type { BufferGeometry } from 'three';

/**
 * The antenna seat role on a part drawn into an ordinary bucket (a whip, its pot, a mast): the spare-track seats keep
 * clear of it (spareTrackSeat.ts seatRoleForPart) and the geometry gate's body leaves it out of the measured height
 * (tools/body-height-parts.mjs, Main's ruling 2026-10-30). Tagging only, never a position change. A helper that passes
 * its port along can wrap the whole drawing in withSeatRole(P, 'antenna', ...) instead.
 */
export function antennaPart<G extends BufferGeometry>(geometry: G): G {
  geometry.userData.seatRole = 'antenna';
  return geometry;
}
