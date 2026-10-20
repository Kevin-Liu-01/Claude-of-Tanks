// Render-layer contracts shared by the always-resident post stack and the
// demand-loaded combat effects runtime. Keep this module data-only: importing
// a layer number must never pull particle pools into the garage boot graph.

export const LATE_FX_LAYER = 30;

/**
 * userData key an FX owner sets on a late-layer object whose render callbacks never read their scene argument (a viewport
 * read for pixel widths): engine/lateFxSceneView.ts draws it through its retained view like a callback-free object.
 */
export const LATE_FX_SCENE_AGNOSTIC = 'lateFxSceneAgnostic';
