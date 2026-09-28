// One lightweight layout for the owner-requested AMX-10P 25 standoff kit.
// Both the visual loft and its spaced combat plates use these exact stations.
export const AMX10P25_SKIRT_CONTOUR = [[1.53, 1.10], [1.72, 1.10], [1.72, 1.24],
  [1.61, 1.37], [1.72, 1.37], [1.72, 1.49], [1.61, 1.62],
  [1.72, 1.62], [1.72, 1.78], [1.53, 1.78]] as const;

export const AMX10P25_SKIRT_STATIONS = [[-2.66, .85], [-2.38, 1], [1.74, 1], [2.66, .50]] as const;

export function amx10p25SkirtPoint(side: number, station: number, corner: number): [number, number, number] {
  const [z, heightScale] = AMX10P25_SKIRT_STATIONS[station];
  const [x, y] = AMX10P25_SKIRT_CONTOUR[corner];
  return [side * x, 1.10 + (y - 1.10) * heightScale, z];
}
