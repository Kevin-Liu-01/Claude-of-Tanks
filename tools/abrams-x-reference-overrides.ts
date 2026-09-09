// QA only. The selected external OBJ is not a runtime visual or a shipped
// asset. This local canonical GLB preserves every source face, including
// censused duplicate track courses and collapsed, non-visible objects.
export const ABRAMS_X_REFERENCE_OVERRIDES = {
  m1a2_sepv2_x: {
    source: 'glb', qualityBar: 'exemplar',
    glb: {
      path: '/models/community-candidates/m1a2_sepv2_dc_source.glb',
      sourceWorldSha256: '7fc3216da131d26e6389c4d40818f70ba03603c99812c5ae42c2f8b798910d16',
      // Segment owners verified against the named archive without replacing
      // the owner's loose OBJ. Source joints are geometrically inferred.
      turretNode: '^source_(?:5[89]|6[0-4]|7[2-9]|[89][0-9]|10[0-7])_',
      gunNode: '^source_(?:6[5-9]|7[01])_',
      autoPivot: true,
      pivot: [-.000286, 1.513295, .392712],
      gunPivot: [-.020003, 1.849085, 1.396],
      paintUntextured: true,
    },
  },
} as const;

