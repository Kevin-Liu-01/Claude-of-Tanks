// src/world/civic/plans/foundry.ts — Ironworks' civic plan (item built-env-270, the owner 2026-11-05: "update roads ... paths, sidewalks ... anyu built
// enviornmennt"). Völklingen, March 1945: the works town's streets in setts, kerbed in granite where the terraces and the
// works' walls front them (the photos), the yards and the roads past the town kerbless. The map never laid the legacy
// kerbs, so the pathways spend no draws and push no seat.
import type { CivicPlanSource } from '../types.ts';

export const FOUNDRY_CIVIC_PLAN: CivicPlanSource = {
  mapId: 'foundry',
  overlay: {},
  pathways: {
    classes: { 0: 'main', 1: 'main', 2: 'main', 3: 'main', 4: 'main', 5: 'main', 6: 'main', 7: 'main', 8: 'main' },
    kerbM: 3.8,
    frontage: [1.2, 8],
    returnR: 2.5,
    maxWalkM: 2.0,
    openWalkM: 0.8,
    lane: { face: 0.06, maxWalkM: 1.6, openWalkM: 0.6 },
    // only before the fronts, joined over a gap of up to 8 m (no ribbon of flags along open ground), no stub under 6 m
    openGapM: 8,
    minRunM: 6,
    walkEase: 0.5,
    exclude: [],
    gates: [],
    inside: [[[-286, -288], [286, -288], [286, 288], [-286, 288]]],
    mouths: [],
  },
  areas: [],
};
