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
  // The supplied Mark IV hierarchy is semantic, but each wheel axle and some
  // side equipment are fused across both sides.  The source-only bake keeps
  // the complete Trophy-equipped print while avoiding invented masks.
  merkava4_trophy: {
    ...fusedOracle('merkava4_trophy_x'),
    glb: { ...fusedOracle('merkava4_trophy_x').glb, componentMasks: false },
  },
  // The Armored Warfare Barak print is flattened by material into Object_2…35.
  // Its source-only bake omits only the documented detached sub-ground artifact.
  merkava4_barak: {
    ...fusedOracle('merkava4_barak_x'),
    glb: { ...fusedOracle('merkava4_barak_x').glb, componentMasks: false },
  },
  // The Namer source has a real turret subtree but its axle meshes fuse left
  // and right running gear, so whole-source comparison is the honest oracle.
  namer_ifv: {
    ...fusedOracle('namer_ifv_x'),
    glb: { ...fusedOracle('namer_ifv_x').glb, componentMasks: false },
  },
  // Object_19 mixes gun with suspension and Object_22 mixes turret/skirts.
  k2_x: fusedOracle('k2_x'),
  kf51_x: {
    // 2026-09-14 owner-directed tangent track wrap (tankFactoryCore roadWheelWrap): the source
    // GLB's track ramp starts at the old contact pins, so the right-view registration now puts
    // component.turret.right at 91.8 (was 92.8 at 88f235a41; whole right view 97.4 -> 95.7).
    // Recorded as a fleet bar per the owner-directed-change rule; every other view/component
    // still scores 95+.
    source: 'glb', qualityBar: 'fleet',
    glb: {
      path: '/models/community-candidates/kf51_x_source.glb',
      turretNode: '^KF51_Turret_Msh$', gunNode: '^Gun_Msh$',
      turretFollowers: '^MG_Msh$', autoPivot: true,
      pivot: [0, 1.4596, .5185], paintUntextured: true,
    },
  },
} as const;
