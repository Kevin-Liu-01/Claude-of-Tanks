// QA-only owner-source registrations. No source loader or geometry enters
// src/ or a public build. Canonical GLBs already have +Y up, +Z forward,
// a centered 6.86 m structural hull, ground zero and 3.78 m full width.
// The common loader's width registration therefore has unit scale (apart
// from floating-point epsilon); do not also scaleToOverall/hullLength.
import { AUTHORING_SOURCE_WORLD_FRAMES, SOURCE_WORLD_FRAMES } from './source-world-registration.mjs';

// A turret's islands start at its certified ring datum; the plane that keeps them sits 5 mm under it.
const RING_PLANE_MARGIN_M = .005;
const articulated = (id: string) => ({
  source: 'glb', qualityBar: 'exemplar',
  glb: {
    path: `/models/community-candidates/${id}_source.glb`,
    turretNode: '^OracleTurret$', gunNode: '^OracleGun$',
    autoPivot: true, paintUntextured: true,
  },
});

export const T90_X_REFERENCE_OVERRIDES = {
  // 2026-09-12 (owner decision): the T-90A carries the same Russian X track
  // standard and scores 91.4 against its thin-tracked source; fleet bar.
  t90a: { ...articulated('t90a'), qualityBar: 'fleet' },
  // 2026-09-12 (owner decision): the Russian X track standard (.030 band,
  // .036 pad) is applied to the T-90M as well; against the thin-tracked source
  // it scores 91.0 on hull curves, so the class is qualified at the fleet bar.
  // 267: the print's OracleTurret mesh 'Turret' also carries a drum hidden inside the hull, 30 faces from y 0.879 up
  // to 1.39 (r 1.05, 0.46 m under the 1.337 ring datum); the build draws nothing under its ring, and neither do the
  // T-90A, T-90SM, T-90 and T-90MS prints. The turret is its islands from the ring up (the lowest start at 1.372); the
  // drum's islands leave the hull and turret masks for the whole views (reference-glb-loader.ts componentSubsets).
  t90m: { ...articulated('t90m'), qualityBar: 'fleet', glb: { ...articulated('t90m').glb,
    turretComponentSubset: { node: '^Turret$', worldMinY: SOURCE_WORLD_FRAMES.t90m!.turret[1] - RING_PLANE_MARGIN_M,
      excludeRemainderFromHull: true } } },
  t90sm: articulated('t90sm'),
  t90a_vladimir: {
    source: 'glb', qualityBar: 'exemplar',
    glb: {
      path: '/models/community-candidates/t90a_vladimir_x_source.glb',
      turretNode: '^OracleTurret$', autoPivot: true, paintUntextured: true,
      // The intact owner FBX merges the complete barrel into Tower and
      // mixes hull/turret windows in Glass. Its neutral whole masks are
      // authoritative; disjoint component masks are not yet certified.
      componentMasks: false,
    },
  },
  // 267 (Main's ruling 2026-10-31): the T-90A X hull (profiles/t90X.ts) under the Burlak prototype turret
  // (t90.ts buildT90BurlakTurret). Its reference is the T-90A X source's hull under the Burlak X source's turret and gun
  // (the source the production t90a_burlak passes), seated ring datum on ring datum (source-world-registration.mjs
  // t90a_burlak_proto). The Burlak X source's owners are fused by material: its turret owners are Object_2, 3, 4, 7, 11,
  // 16, 17, 20 and 23, its gun Object_15 (the legacy print row's split), and Object_18 is mixed, its turret fittings over
  // the ring and its hull fittings (bow lights, rear brackets) under it. Islands that start under the Burlak's ring datum
  // stay behind: Object_18's hull fittings and Object_2's ring floor (y 1.388-1.475, inside the hull).
  t90a_burlak_proto: {
    source: 'glb', qualityBar: 'fleet',
    glb: {
      path: '/models/community-candidates/t90a_x_source.glb', paintUntextured: true,
      graft: {
        path: '/models/community-candidates/t90a_burlak_x_source.glb', replaces: '^Oracle(?:Turret|Gun)$',
        nodes: '^Object_(?:2|3|4|7|11|15|16|17|18|20|23)$',
        worldMinY: SOURCE_WORLD_FRAMES.t90a_burlak_proto!.graft!.turret[1] - RING_PLANE_MARGIN_M,
      },
      turretNode: '^Object_(?:2|3|4|7|11|16|17|18|20|23)$', gunNode: '^Object_15$', autoPivot: true,
      pivot: AUTHORING_SOURCE_WORLD_FRAMES.t90a_burlak_proto!.turret,
      gunPivot: AUTHORING_SOURCE_WORLD_FRAMES.t90a_burlak_proto!.gun,
    },
  },
} as const;
