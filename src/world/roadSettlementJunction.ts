type Road = readonly (readonly [number, number])[];
/** The central plaza belongs to a real road intersection. Vertex proximity
 * changes with curve tessellation and can put the square metres off the road. */
export function roadSettlementJunction(
  roads: readonly Road[], center: { x: number; z: number },
): { x: number; z: number } {
  let best = Infinity, result = { ...center };
  for (let a = 0; a < roads.length; a++) for (let b = a + 1; b < roads.length; b++) {
    for (let i = 1; i < roads[a].length; i++) for (let j = 1; j < roads[b].length; j++) {
      const crossing = segmentCrossing(roads[a][i - 1], roads[a][i], roads[b][j - 1], roads[b][j]);
      if (!crossing) continue;
      const { x, z } = crossing;
      const distance = Math.hypot(x - center.x, z - center.z);
      if (distance < best) { best = distance; result = { x, z }; }
    }
  }
  return result;
}

function segmentCrossing(p: readonly [number, number], endP: readonly [number, number],
  q: readonly [number, number], endQ: readonly [number, number]): { x: number; z: number } | null {
  const rx = endP[0] - p[0], rz = endP[1] - p[1];
  const sx = endQ[0] - q[0], sz = endQ[1] - q[1];
  const cross = rx * sz - rz * sx;
  if (Math.abs(cross) < 1e-9) return null; // overlapping lanes do not define a unique square
  const dx = q[0] - p[0], dz = q[1] - p[1];
  const t = (dx * sz - dz * sx) / cross, u = (dx * rz - dz * rx) / cross;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: p[0] + t * rx, z: p[1] + t * rz };
}
