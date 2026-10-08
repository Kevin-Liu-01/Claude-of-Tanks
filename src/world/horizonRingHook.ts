// The horizon ring that terrain meshes are built with. maps/horizon.ts installs itself here when it loads, so
// terrain.ts never imports it: the authority's height field (createHeightField in the match host Worker and the
// dedicated server) would otherwise carry the whole visual horizon, its border farmsteads and every regional building
// kit (2026-10-08: 1.9 MB of the host Worker's 7.07 MB; hostFleet.selftest). map.ts, the visual world, imports the
// horizon before it builds terrain; a receipt that builds terrain meshes imports it the same way.
import type { buildHorizonRingSteps } from './maps/horizon.ts';

export interface HorizonRing {
  readonly HORIZON_SEGMENTS: number;
  readonly buildHorizonRingSteps: typeof buildHorizonRingSteps;
}

let installed: HorizonRing | null = null;

export function installHorizonRing(ring: HorizonRing): void {
  installed = ring;
}

export function horizonRing(): HorizonRing {
  if (!installed) throw new Error('terrain meshes need the horizon ring: import src/world/maps/horizon.ts before building them');
  return installed;
}
