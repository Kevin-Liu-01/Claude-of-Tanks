// Local QA registration for the owner's T-84BM Oplot-M comparison model (release 262; docs/references/tanks/bm_oplot_m.md).
// The source is never part of playable loading or public model provenance. Its GUS/KOLLO/HULL/SKIRT/TUR nodes are real,
// but the 125 mm gun is fused into TUR and the remote gun's parts are loose top-level meshes, so no honest moving
// gun owner exists: the whole assembled vehicle is scored at rest without fabricated component masks. The Oplot-T
// (bm_oplot_t) is a declared first-party derivative of this base, not certified against the Oplot-M's oracle.
export const OPLOT_BM_X_REFERENCE_OVERRIDES = Object.freeze({
  bm_oplot_m: Object.freeze({
    source: 'glb',
    qualityBar: 'exemplar',
    glb: Object.freeze({
      path: '/models/community-candidates/bm_oplot_m_x_source.glb',
      fixedMount: true,
      componentMasks: false,
      geometryComponentMasks: false,
    }),
  }),
});
