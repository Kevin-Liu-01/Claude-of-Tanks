// QA-only, owner-supplied local oracles. See docs/research/west-x-source-inventory.md.
// These files already use metres, +Y up, +Z forward, a centered structural
// hull and ground zero. Spec widths must be their measured full widths so
// reference-glb-loader's published-width registration is unit scale. Do not
// add another yawOffset, scaleToOverall or hull-length scaling pass.
const fusedOracle = (id: string) => ({
  source: 'glb', qualityBar: 'exemplar',
  glb: {
    path: `/models/community-candidates/${id}_source.glb`,
    fixedMount: true, componentMasks: false, paintUntextured: true,
  },
});

export const WEST_X_REFERENCE_OVERRIDES = {
  // Mk4 is one fused mesh. Its 25-degree displayed turret yaw is neutralized
  // by complete connected islands in the local oracle; no axis is stretched.
  merkava4_x: fusedOracle('merkava4_x'),
  // Mk3D's nominal bone_turret includes internal hull geometry, and its
  // flat ex_armor material meshes mix owners. No false disjoint masks.
  merkava3d_x: fusedOracle('merkava3d_x'),
  // Object_19 mixes gun with suspension and Object_22 mixes turret/skirts.
  k2_x: fusedOracle('k2_x'),
  kf51_x: {
    source: 'glb', qualityBar: 'exemplar',
    glb: {
      path: '/models/community-candidates/kf51_x_source.glb',
      turretNode: '^KF51_Turret_Msh$', gunNode: '^Gun_Msh$',
      turretFollowers: '^MG_Msh$', autoPivot: true,
      pivot: [0, 1.4596, .5185], paintUntextured: true,
    },
  },
} as const;
