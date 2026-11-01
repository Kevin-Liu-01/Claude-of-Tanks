import type { BufferGeometry } from 'three';

/**
 * Stowage on a part: a fuel drum, its cradle, a stowage rack or basket. The geometry gate leaves it out of the body it
 * compares, on the build and the source alike, with the score's ruler kept whole (tools/body-height-parts.mjs, Main's
 * ruling 2026-10-31). Drawn into an ordinary bucket, the merge keeps its span (the mesh's userData.stowageRanges); a mesh
 * of its own leaves whole. Tagging only, never a position change, and no seat role: the spare-track seats read the part as
 * they did before.
 */
export function stowagePart<G extends BufferGeometry>(geometry: G): G {
  geometry.userData.stowage = true;
  return geometry;
}
