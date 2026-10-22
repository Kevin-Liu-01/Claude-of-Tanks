// Release 230 (UA/PL round 11; promoted from the lane's census, streams/turret-upgrades/uapl/tools/r12/coverage.mjs): the
// gameplay ERA coverage of a vehicle in the authoritative hit model (src/sim/armor.ts traceTank on getSpec(id).armor, the
// calibrated combat anatomy), counted in 5 cm cells as the first plate a parallel ray meets:
//   side      rays from +x (the vehicle's left) over y .45-1.70, z -3.4..3.6 (the critic's UAPL-C8-4 grid);
//   sideBand  the same over y 1.30-1.50;
//   roof      rays straight down over x -1.3..1.3, z -1.4..1.9 (hull frame, the turret's plan);
//   front     rays from +z over x -1.8..1.8, y .3-2.6, level.
// Each count is { era: rays whose first plate is ERA, bySector: { sector: rays } }; frontEraPackages.selftest pins them.
import * as THREE from 'three';
import { getSpec } from './specs.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';

const S = .05, V = (x, y, z) => new THREE.Vector3(x, y, z);

/** The census of `id` (its spec must be loaded: import tankFactory.ts first). */
export function eraCoverage(id) {
  const spec = getSpec(id), pose = tankPoseFromState({ pos: V(0, 0, 0), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
  const tally = (rays) => {
    const out = { rays: 0, era: 0, bySector: {} };
    for (const [from, to] of rays) {
      out.rays++;
      const first = traceTank(from, to, pose, spec.armor).find(h => h.kind === 'plate');
      if (first?.plate.kind !== 'era') continue;
      out.era++; out.bySector[first.plate.name] = (out.bySector[first.plate.name] ?? 0) + 1;
    }
    return out;
  };
  const grid = (a0, a1, b0, b1, ray) => { const rays = []; for (let a = a0; a <= a1 + 1e-9; a += S) for (let b = b0; b <= b1 + 1e-9; b += S) rays.push(ray(a, b)); return rays; };
  return {
    side: tally(grid(.45, 1.70, -3.4, 3.6, (y, z) => [V(5, y, z), V(-5, y, z)])),
    sideBand: tally(grid(1.30, 1.50, -3.4, 3.6, (y, z) => [V(5, y, z), V(-5, y, z)])),
    roof: tally(grid(-1.3, 1.3, -1.4, 1.9, (x, z) => [V(x, 6, z), V(x, -1, z)])),
    front: tally(grid(-1.8, 1.8, .3, 2.6, (x, y) => [V(x, y, 8), V(x, y, -8)])),
  };
}
