// The body a broken-vehicle job names (perf-248, brokenVehicleJob.ts): the kit's own broken builder from the job's seed.
// The pool's worker and the props build's join both build through here, so the body is the same whichever made it.
import type * as THREE from 'three';
import { buildBrokenCivilianVehicle } from './maps/civilianVehicleKit.ts';
import { buildBrokenCart } from './maps/cartKit.ts';
import type { BrokenVehicleJob } from './brokenVehicleJob.ts';

export function buildBrokenVehicle(job: BrokenVehicleJob): THREE.BufferGeometry {
  return job.kit === 'civilian'
    ? buildBrokenCivilianVehicle(job.mapId, job.mobile, job.role, job.seed)
    : buildBrokenCart(job.mapId, job.mobile, job.role, job.seed);
}
