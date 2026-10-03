// src/world/maps/geology.ts — landform kits for the geological detail of the authored relief (maps lane B,
// 2026-10-03). The gauntlet's wave 0 read every battlefield landform as "smooth, symmetric shells with no rock,
// jointing, erosion gullies, talus or scree". These kits return ordinary landforms (terrain.ts sampleLandformHeight),
// so the shapes stay data: a map file names where a gully cuts, how deep and how it bends, and the height field, the
// collision shard, the navigation grid and the minimap all see the one surface.

type Basin = { kind: 'basin'; x: number; z: number; rx: number; rz: number; height: number; yawDeg: number };

/** A gully — a balka in a loess scarp, a coombe in a chalk escarpment, a couloir down a mountain flank, a wash off a
 * mesa. Three overlapping troughs climb from the mouth to the head, each narrower and shallower than the one below,
 * bending by bendM at mid-length, so the floor undulates and the cut narrows into the slope like a real gully head. */
export function gully(mouthX: number, mouthZ: number, headX: number, headZ: number, depth: number,
  mouthHalfWidth: number, bendM: number): Basin[] {
  const dx = headX - mouthX, dz = headZ - mouthZ, length = Math.hypot(dx, dz);
  const nx = -dz / length, nz = dx / length;
  const at = (t: number): [number, number] => [mouthX + dx * t + nx * bendM * Math.sin(Math.PI * t),
    mouthZ + dz * t + nz * bendM * Math.sin(Math.PI * t)];
  return [0, 1, 2].map((i) => {
    const t = (i + 0.5) / 3;
    const [x, z] = at(t), [x0, z0] = at(t - 0.08), [x1, z1] = at(t + 0.08);
    return {
      kind: 'basin' as const,
      x: Math.round(x), z: Math.round(z),
      rx: Math.round(length * 0.26), rz: Math.round(mouthHalfWidth * [1, 0.72, 0.5][i]),
      height: -Math.round(depth * [1, 0.8, 0.55][i] * 10) / 10,
      yawDeg: Math.round(Math.atan2(z1 - z0, x1 - x0) * 180 / Math.PI),
    };
  });
}
