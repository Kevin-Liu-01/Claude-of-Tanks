const TAU = Math.PI * 2;

/** Normalize a marker angle so equivalent headings produce stable canvas paths. */
export function normalizeMinimapAngle(angle: number): number {
  const value = Number(angle);
  if (!Number.isFinite(value)) return 0;
  const wrapped = ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return Math.abs(wrapped) < 1e-10 ? 0 : wrapped;
}

/**
 * Project a world-space point onto the fixed north-up tactical map.
 * World +Z is map-up. Looking along +Z in Three.js's right-handed world,
 * screen-right is world -X, so -X is map-right. This matches the native
 * top-down camera basis and the battle camera's mouse-right direction.
 */
export function projectWorldToMinimap(
  worldX: number,
  worldZ: number,
  worldSize: number,
  mapSize: number,
  out?: number[],
): number[] {
  const target = out || [0, 0];
  const half = worldSize * 0.5;
  target[0] = ((half - worldX) / worldSize) * mapSize;
  target[1] = ((half - worldZ) / worldSize) * mapSize;
  return target;
}

/** Canvas polar angle for a horizontal world direction on a north-up map. */
export function minimapAngleForDirection(worldX: number, worldZ: number): number {
  return normalizeMinimapAngle(Math.atan2(-worldZ, -worldX));
}

/**
 * Canvas rotation for an up-facing marker at the supplied world yaw (forward = (sin yaw, cos yaw)). Every directional map
 * glyph is drawn nose up the canvas and turned by this: tank arrows, aircraft, strike footprints (map-icon-heading-278).
 */
export function minimapYawForHeading(yaw: number): number {
  return normalizeMinimapAngle(-Number(yaw));
}

/**
 * Compass bearing (degrees, 0..359) of a world yaw as read on the north-up map: clockwise from map-up, so a run drawn
 * pointing map-right reads 090°. World +X is map-left, so the bearing is the negated yaw (map-icon-heading-278).
 */
export function minimapBearingDegrees(yaw: number): number {
  return Math.round(((-Number(yaw) * 180) / Math.PI % 360 + 360) % 360) % 360;
}

/**
 * A map point brought onto the plate's rim (`inset` from each edge of a `size` plate) along the line from an anchor on
 * the plate, so a marker off the plate sits at its true bearing from the anchor. A per-axis clamp slides it toward a
 * corner, off that line: an inbound aircraft's nose then disagreed with its own drawn approach (map-icon-heading-278).
 */
export function minimapRimPoint(x: number, y: number, anchorX: number, anchorY: number, inset: number, size: number,
  out: number[]): number[] {
  const lo = inset, hi = size - inset;
  if (x >= lo && x <= hi && y >= lo && y <= hi) { out[0] = x; out[1] = y; return out; }
  const ax = Math.max(lo, Math.min(hi, anchorX)), ay = Math.max(lo, Math.min(hi, anchorY));
  const dx = x - ax, dy = y - ay;
  let t = 1;
  if (x > hi) t = Math.min(t, (hi - ax) / dx); else if (x < lo) t = Math.min(t, (lo - ax) / dx);
  if (y > hi) t = Math.min(t, (hi - ay) / dy); else if (y < lo) t = Math.min(t, (lo - ay) / dy);
  out[0] = ax + dx * t; out[1] = ay + dy * t;
  return out;
}
