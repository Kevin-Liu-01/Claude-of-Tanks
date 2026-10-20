// Render-layer contracts shared by the always-resident post stack and the
// demand-loaded combat effects runtime. Keep this module data-only: importing
// a layer number must never pull particle pools into the garage boot graph.

export const LATE_FX_LAYER = 30;
