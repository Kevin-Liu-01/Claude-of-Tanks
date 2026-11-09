// src/world/civic/plans/frontier.ts — Frontier Basin's civic plan (item built-env-270). The Fulda Gap, 1984: the Hessian village's through road and the
// valley road kerbed and paved where the farmhouses front them (the photos: low precast kerbs, narrow concrete-slab
// pavements, a basalt sett gutter); the farm and ridge lanes kerbless. The map never laid the legacy kerbs.
import type { CivicPlanSource } from '../types.ts';

export const FRONTIER_CIVIC_PLAN: CivicPlanSource = {
  mapId: 'frontier',
  overlay: {},
  pathways: {
    classes: { 0: 'main', 1: 'main' },
    kerbM: 3.8,
    frontage: [1.2, 8],
    returnR: 2.5,
    maxWalkM: 2.0,
    openWalkM: 0.8,
    lane: { face: 0.06, maxWalkM: 1.6, openWalkM: 0.6 },
    // only before the fronts, joined over a gap of up to 8 m (no ribbon of flags along open ground), no stub under 6 m
    // (r1, the blind critics: "the kerb runs only along some house fronts and looks like stubs") joined over a farmyard's gap,
    // no run under 12 m
    openGapM: 14,
    minRunM: 12,
    walkEase: 0.5,
    exclude: [],
    gates: [],
    inside: [[[-128, -86], [128, -86], [128, 86], [-128, 86]]],
    mouths: [],
  },
  areas: [],
};
