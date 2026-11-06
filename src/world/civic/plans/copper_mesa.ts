// src/world/civic/plans/copper_mesa.ts — Copper Mesa Mine's civic plan (item built-env-270). Queenstown, Tasmania, 1976: the town's main street in
// asphalt behind a concrete kerb-and-channel and asphalt footpaths where the shops and houses front it (the photos); the
// mine roads and the lanes kerbless. The map never laid the legacy kerbs.
import type { CivicPlanSource } from '../types.ts';

export const COPPER_MESA_CIVIC_PLAN: CivicPlanSource = {
  mapId: 'copper_mesa',
  overlay: {},
  pathways: {
    classes: { 0: 'main' },
    kerbM: 3.8,
    frontage: [1.2, 8],
    returnR: 2.5,
    maxWalkM: 2.0,
    openWalkM: 0.8,
    lane: { face: 0.06, maxWalkM: 1.6, openWalkM: 0.6 },
    // only before the fronts, joined over a farmyard's gap of up to 14 m (no ribbon of flags along open ground), no run under
    // 12 m (r1, the blind critics on Frontier's: short kerb runs read as stubs)
    openGapM: 14,
    minRunM: 12,
    walkEase: 0.5,
    exclude: [],
    gates: [],
    inside: [[[64, -190], [256, -190], [256, 128], [64, 128]]],
    mouths: [],
  },
  areas: [],
};
