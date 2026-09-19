// Local QA registration for the owner's complete ARES APC comparison model.
// The source is never part of playable loading or public model provenance.
export const ARES_APC_X_REFERENCE_OVERRIDES = Object.freeze({
  ares_apc_x: Object.freeze({
    source: 'glb',
    qualityBar: 'exemplar',
    glb: Object.freeze({
      path: '/models/community-candidates/ares_apc_x_source.glb',
      // Source nodes establish an assembly inventory, but the owner graph does
      // not truthfully isolate a complete moving RWS/gun subtree. Score the
      // whole assembled vehicle without fabricating component masks.
      fixedMount: true,
      componentMasks: false,
      geometryComponentMasks: false,
    }),
  }),
});
