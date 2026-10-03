// One lightweight layout for the owner-requested AMX 56 field kit's thick folded
// side modules (profiles/leclercClassicXFieldKit.ts). Both the visual loft and
// its spaced combat plates (leclercClassicXKitArmor.ts) use these exact
// stations, as the AMX-10P 25 standoff kit does (amx10pSkirtLayout.ts).

/** [z, top y, outer x] of each right-side module station. */
export const AMX56_KIT_SIDE_STATIONS = [
  [-3.24, 1.60, 1.92], [-2.12, 1.54, 2.02],
  [1.30, 1.50, 2.02], [2.24, 1.46, 2.00], [3.27, 1.29, 1.91],
] as const;

/** Right-side ring segments i -> i + 1 that face away from the hull: bottom,
 * lower chamfer, outer face, upper chamfer and top. The bridge end and its
 * underside sit on the fender; the inner wall faces the running gear. */
export const AMX56_KIT_EXPOSED_SEGMENTS: readonly number[] = [0, 1, 2, 3, 4];

/** Counter-clockwise XY ring of one station viewed from +Z; the left side is
 * mirrored and reversed so that it stays counter-clockwise. */
export function amx56KitSideRing(side: number, station: number): [number, number][] {
  const [, top, outer] = AMX56_KIT_SIDE_STATIONS[station];
  // The upper bridge overlaps the existing fender; the lower cage stays open.
  const ring: [number, number][] = [[1.79, .94], [outer - .045, .94],
    [outer, 1.08], [outer, top - .085], [outer - .065, top],
    [1.65, top], [1.65, top - .04], [1.79, top - .04]];
  return side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring;
}

/** The right-side segment index that ring segment k -> k + 1 of `side` covers. */
export function amx56KitRightSegment(side: number, k: number): number {
  return side < 0 ? (6 - k + 8) % 8 : k;
}
