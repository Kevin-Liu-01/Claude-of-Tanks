// QA-only owner-source registrations. No source loader or geometry enters
// src/ or a public build. Canonical GLBs already have +Y up, +Z forward,
// a centered 6.86 m structural hull, ground zero and 3.78 m full width.
// The common loader's width registration therefore has unit scale (apart
// from floating-point epsilon); do not also scaleToOverall/hullLength.
const articulated = (id: string) => ({
  source: 'glb', qualityBar: 'exemplar',
  glb: {
    path: `/models/community-candidates/${id}_source.glb`,
    turretNode: '^OracleTurret$', gunNode: '^OracleGun$',
    autoPivot: true, paintUntextured: true,
  },
});

export const T90_X_REFERENCE_OVERRIDES = {
  t90a_x: articulated('t90a_x'),
  t90m_x: articulated('t90m_x'),
  t90sm_x: articulated('t90sm_x'),
  t90a_vladimir_x: {
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
} as const;
