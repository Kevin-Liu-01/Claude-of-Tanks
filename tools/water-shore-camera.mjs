// Self-contained so the same selection runs against the loaded browser world
// and synthetic height fields. These are fresh evidence poses, never replacements
// for archived matched cameras. The mask excludes dry roads, pads and frozen ice.
export function selectWaterShoreViews(input) {
  const world = input ? null : window.__DEBUG.world;
  const hf = input?.heightField ?? world.heightField;
  const waters = input?.waters ?? [
    ...(world.config.terrain?.lakes ?? []), ...(world.config.terrain?.marshes ?? []),
  ];
  const half = hf.size / 2 - 24;
  const height = (x, z) => hf.getHeightAt(x, z);
  const wet = (x, z) => hf.getWaterMaskAt(x, z);
  const inside = (x, z) => Math.max(Math.abs(x), Math.abs(z)) <= half;
  const rows = [];
  for (const [body, water] of waters.entries()) {
    let best = null;
    // Canonical shorelineRadiusAt never cuts below .8r without authored
    // radii. Use the inscribed core as a conservative ownership witness:
    // nearby union liquid outside this body's contour cannot certify it.
    const radius = water.r * (water.radii ? Math.min(...water.radii) : .8);
    for (let z = Math.max(-half, water.z - radius); z <= Math.min(half, water.z + radius); z += 8) {
      for (let x = Math.max(-half, water.x - radius); x <= Math.min(half, water.x + radius); x += 8) {
        if (Math.hypot(x - water.x, z - water.z) > radius || wet(x, z) < .9) continue;
        const y = height(x, z);
        // The material rejects steep banks even when the liquid mask is wet.
        if (Math.max(Math.abs(height(x + 1, z) - height(x - 1, z)),
          Math.abs(height(x, z + 1) - height(x, z - 1))) > .4) continue;
        let wetSamples = 0;
        for (const dx of [-4, 0, 4]) for (const dz of [-4, 0, 4]) if (wet(x + dx, z + dz) >= .8) wetSamples++;
        if (wetSamples < 6) continue;
        for (let angle = 0; angle < 8; angle++) {
          const a = angle * Math.PI / 4;
          const cx = x + Math.cos(a) * 28, cz = z + Math.sin(a) * 28;
          if (!inside(cx, cz) || wet(cx, cz) > .1) continue;
          const cy = height(cx, cz) + 6.2, ty = y + .3;
          let clearance = Infinity;
          for (let i = 1; i < 28; i++) {
            const t = i / 28;
            clearance = Math.min(clearance, cy + (ty - cy) * t - height(cx + (x - cx) * t, cz + (z - cz) * t));
          }
          if (clearance < .3) continue;
          const score = wetSamples * 100 - Math.abs(height(cx, cz) - y) * 10 - Math.hypot(cx, cz) / 1024;
          if (!best || score > best.score) best = {
            body, position: [cx, cy, cz], target: [x, ty, z], fov: 50,
            targetMask: wet(x, z), cameraMask: wet(cx, cz), wetSamples,
            terrainSightlineClearanceM: clearance, halfExtent: half, score,
            ownership: {kind:'canonical-inscribed-core', center:[water.x,water.z], radius},
          };
        }
      }
    }
    rows.push(best ?? {body, unresolved: 'No dry-bank camera with a broad liquid target and clear terrain sightline inside the battlefield'});
  }
  return rows;
}
