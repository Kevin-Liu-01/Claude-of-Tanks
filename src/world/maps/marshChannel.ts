/** Pure authoring helper: samples overlap even after shoreline modulation. */
export interface MarshChannelStation {
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

export function createMarshChannel(stations: readonly MarshChannelStation[]): MarshChannelStation[] {
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
      / (Math.min(current.r, next.r) * 1.15));
    for (let step = 1; step < count; step++) {
      const t = step / count;
      channel.push({
        x: current.x + (next.x - current.x) * t,
        z: current.z + (next.z - current.z) * t,
        r: current.r + (next.r - current.r) * t,
        // Keep added overlaps shallow rather than summing several full
        // authored bowl depths into a trench at every interpolated point.
        dip: Math.min(0.65, current.dip + (next.dip - current.dip) * t),
      });
    }
  }
  return channel;
}
