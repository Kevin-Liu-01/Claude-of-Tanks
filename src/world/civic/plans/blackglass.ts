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
  // (229, the owner: "add a lot of cars in civic areas ... same should apply to ... suzhou") the Settlement's Buicks,
  // Chevrolets, delivery vans and a pickup at the kerbs of its streets (the tram street's west and east blocks, the
  // diagonals off the crossing, the west road) and of Zhabei's north street, parked with the traffic a little off true,
  // each a seat no base battle's hull touched (probes/pace carseats.mjs: the zone and Frontline battles)
  streetParking: [
    { kind: 'sedan', x: -41.8, z: -98.69, yawDeg: 95.9 },
    { kind: 'wagon', x: -33.83, z: -99.43, yawDeg: 94.4 },
    { kind: 'sedan', x: -12.79, z: -101.4, yawDeg: 96.4 },
    { kind: 'van', x: -4.83, z: -102.14, yawDeg: 94.9 },
    { kind: 'sedan', x: -27.35, z: -105.36, yawDeg: -83.9 },
    { kind: 'sedan', x: -10.3, z: -106.95, yawDeg: -85.9 },
    { kind: 'wagon', x: 107.05, z: -91.76, yawDeg: 83.8 },
    { kind: 'sedan', x: 114.99, z: -90.83, yawDeg: 82.6 },
    { kind: 'pickup', x: 135.86, z: -88.39, yawDeg: 84.3 },
    { kind: 'sedan', x: -30.22, z: 56.21, yawDeg: -41.9 },
    { kind: 'wagon', x: -18.32, z: 50.69, yawDeg: 139.6 },
    { kind: 'sedan', x: 1.12, z: 33.35, yawDeg: -133.1 },
    { kind: 'sedan', x: -216.82, z: -47.73, yawDeg: -169.5 },
    { kind: 'van', x: -218.18, z: -55.61, yawDeg: -171.0 },
    { kind: 'wagon', x: -4.42, z: 151.38, yawDeg: -78.5 },
    { kind: 'sedan', x: 3.45, z: 149.95, yawDeg: -80.0 },
  ],
  // (229, the owner: "other decorations ... and so on") the tram street's own life between the parked cars: rickshaws
  // waiting at the kerb and three hawkers' stalls on the south pavement where it is widest, each facing the street, all
  // seats no base battle's hull touched (probes/pace seatcheck.mjs: a metre and more off every front)
  streetFurniture: [
    { kind: 'handcart', x: -25.87, z: -100.18, yawDeg: 95.3 }, { kind: 'handcart', x: -46.27, z: -103.6, yawDeg: -84.7 },
    { kind: 'handcart', x: 3.14, z: -102.88, yawDeg: 95.3 }, { kind: 'handcart', x: -2.33, z: -107.7, yawDeg: -84.7 },
    { kind: 'stall', x: -40.34, z: -107.82, yawDeg: 5.3 }, { kind: 'stall', x: -28.34, z: -108.93, yawDeg: 5.3 },
    { kind: 'stall', x: -10.34, z: -110.6, yawDeg: 5.3 },
  ],
  pathways: {
    classes: { 0: 'main', 1: 'main', 2: 'main', 3: 'gasse', 4: 'main', 5: 'gasse' },
    kerbM: 3.8,
    frontage: [1.2, 3.5],
    returnR: 3.5,
    // (229 b2 r2, the blind critics: a dirt strip between the pavement and the row houses' fronts) the Settlement's
    // pavements out to the facades up to 5 m back
    maxWalkM: 5.0,
    openWalkM: 2.0,
    // (229 b2 r3, the blind critics' physical major: a zig-zag slab on the tram street's corner lot, a stub of kerb on the
    // carriageway) the edge eased at 0.35 m a metre, no run under 8 m
    walkEase: 0.35,
    minRunM: 8,
    lane: { face: 0.10, maxWalkM: 1.6, openWalkM: 1.2 },
    exclude: [],
    gates: [],
    inside: [[[-294, -288], [304, -288], [304, 302], [-294, 302]]],
    mouths: [],
  },
  areas: [],
};
