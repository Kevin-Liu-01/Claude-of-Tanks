// src/world/civic/plans/blackglass.ts — Suzhou Creek's civic plan (the maps lane, 229 b2; the owner, 2026-10-19: "expand
// its breadth to finalize all 'pathway' architecture and civic areas for maps that would need that"). Shanghai, autumn
// 1937: the International Settlement south of the creek, Zhabei north of it; world metres, north +z, east +x.
//
// Pathways only (the 229 census: 1,313 legacy kerb pieces, 88 % of them under houses or fronting nothing, 147 junctions
// left open). No square: the empty rooms the census finds are the zone-2 clearance and a block gap the lilong rows keep
// 72 m off the zones by design. The Settlement's streets take granite kerbstones and concrete flags: the two diagonals,
// the south tram street and the west road are main streets, Zhabei's north street and the thin east road lanes; the
// creek's four bridges keep their parapets (the kit stops at a deck). The whole valley floor is the town (no wall).
import type { CivicPlan } from '../types.ts';

export const BLACKGLASS_CIVIC_PLAN: CivicPlan = {
  mapId: 'blackglass',
  style: 'shanghai',
  overlay: {},
  pathways: {
    classes: { 0: 'main', 1: 'main', 2: 'main', 3: 'gasse', 4: 'main', 5: 'gasse' },
    kerbM: 3.8,
    frontage: [1.2, 3.5],
    returnR: 3.5,
    // (229 b2 r2, the blind critics: a dirt strip between the pavement and the row houses' fronts) the Settlement's
    // pavements out to the facades up to 5 m back
    maxWalkM: 5.0,
    openWalkM: 2.0,
    lane: { face: 0.10, maxWalkM: 1.6, openWalkM: 1.2 },
    exclude: [],
    gates: [],
    inside: [[[-294, -288], [304, -288], [304, 302], [-294, 302]]],
    mouths: [],
  },
  areas: [],
};
