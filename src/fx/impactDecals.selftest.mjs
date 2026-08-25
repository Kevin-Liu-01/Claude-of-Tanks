import { IMPACT_DECAL_CAP, IMPACT_DECAL_LIFT_M } from './impactDecals.js';
import { SURFACE_MARKING_STYLE } from '../vehicles/vehicleMarkings.js';
import './lazyRuntime.selftest.mjs';

if (IMPACT_DECAL_CAP < 16) throw new Error('impact decal vehicle budget regressed');
if (IMPACT_DECAL_LIFT_M <= 0 || IMPACT_DECAL_LIFT_M > 0.01) {
  throw new Error(`impact decals must sit within 10 mm of armor (${IMPACT_DECAL_LIFT_M} m)`);
}
if (IMPACT_DECAL_LIFT_M !== SURFACE_MARKING_STYLE.surfaceLiftM) {
  throw new Error('impact scars and painted designations must share one surface-layer contract');
}
