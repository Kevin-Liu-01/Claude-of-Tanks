// src/world/civic/plans/saltwind.ts — Saltwind Narrows' civic plan (item built-env-270). The Dalmatian stone town, 1992: the quayside and market streets
// kerbed in dressed white limestone with limestone-slab pavements where the houses front them (the photos); the coast
// road past the town kerbless. The map never laid the legacy kerbs.
import type { CivicPlanSource } from '../types.ts';

export const SALTWIND_CIVIC_PLAN: CivicPlanSource = {
  mapId: 'saltwind',
  overlay: {},
  pathways: {
    classes: { 0: 'main', 1: 'main', 3: 'main' },
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
    inside: [[[-252, -116], [40, -116], [40, 138], [-252, 138]]],
    mouths: [],
  },
  areas: [],
};
