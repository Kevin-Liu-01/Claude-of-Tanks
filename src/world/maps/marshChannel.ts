/** Pure authoring helper: samples overlap even after shoreline modulation. */
interface MarshChannelStation {
  x: number;
  z: number;
  r: number;
  dip: number;
}

/** Liquid reaches must share one explicit level, including interpolated cells. */
export function createLakeChannel(
  stations: readonly { x: number; z: number; r: number }[], level: number,
): Array<{ x: number; z: number; r: number; level: number }> {
  return createMarshChannel(stations.map((station) => ({ ...station, dip: 0 })))
    .map(({ x, z, r }) => ({ x, z, r, level }));
}

/** `spacing` is the largest gap between cells as a share of the smaller radius (1.15 by default). A river whose bank
 * line must read smooth from the air lays its cells closer (maps lane B, 2026-10-03, Amberford: 0.5): a union of
 * circles is scalloped between its cells, 0.21 of the radius deep at 1.15 and 0.03 at 0.5, and the closer cells are
 * proportionally shallower, so the summed bed keeps its depth. */
export function createMarshChannel(stations: readonly MarshChannelStation[], spacing = 1.15): MarshChannelStation[] {
  const channel: MarshChannelStation[] = [];
  for (let index = 0; index < stations.length; index++) {
    const current = stations[index];
    channel.push({ ...current });
    const next = stations[index + 1];
    if (!next) continue;
    // The shoreline can contract to 80% of r. At <=1.15*r spacing,
    // neighboring wet cores still meet; a mere bounding-circle overlap
    // leaves disconnected pools after the rendered water ramp is applied.
    const count = Math.ceil(Math.hypot(next.x - current.x, next.z - current.z)
      / (Math.min(current.r, next.r) * spacing));
    for (let step = 1; step < count; step++) {
      const t = step / count;
      channel.push({
        x: current.x + (next.x - current.x) * t,
        z: current.z + (next.z - current.z) * t,
        r: current.r + (next.r - current.r) * t,
        // Keep added overlaps shallow rather than summing several full
        // authored bowl depths into a trench at every interpolated point.
        dip: Math.min(0.65, current.dip + (next.dip - current.dip) * t) * Math.min(1, spacing / 1.15),
      });
    }
  }
  return channel;
}
