# Terrain wall normal basis — unverified visual draft

The cliff shader samples normal textures in vertical X/Z projections, but
previously added their tangent XY channels along world X/Z only. Vertical
texture relief could not perturb lighting along world Y. Transform each
wall projection before blending, using packed world X,Z,Y perturbations.
Horizontal samples explicitly clear the formerly unused blue channel.

The main, coarse, distant-rock and sand-wall paths now share that conversion.
Texture fetch counts, texture resources, geometry and attenuation thresholds
are unchanged. This is not evidence of unchanged frame time.

Validation: terrainWallNormals.selftest.mjs passes cardinal, diagonal and
neutral-vector arithmetic plus source-wiring checks. Its initial run caught
an overlooked coarse-rock sampling path, which was then corrected.

Still required: native shader compilation, matched before/after views,
cross-biome inspection and performance/resource comparison. No visual
improvement or release readiness is claimed yet.

This shader checkpoint is separate from the unpublished Redrock geometry
experiments in its parent history. Cherry-pick only an accepted shader commit
if integrating independently; do not merge the experimental branch wholesale.
