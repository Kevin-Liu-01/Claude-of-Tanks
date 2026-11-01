import type { BufferGeometry } from 'three';

/** The stowage kinds the gate pairs (Main 2026-11-01): drums, their cradles, racks and baskets; jerry cans; unditching logs. */
export type StowageKind = 'stowage' | 'can' | 'log';

/**
 * Stowage on a part: a fuel drum, its cradle, a stowage rack or basket (or, by `kind`, a jerry can or an unditching log).
 * The geometry gate leaves it out of the body it compares, on the build and the source alike, with the score's ruler kept
 * whole (tools/body-height-parts.mjs, Main's rulings 2026-10-31 and 11-01). Drawn into an ordinary bucket, the merge keeps its span (the mesh's userData.stowageRanges); a mesh
 * of its own leaves whole. Tagging only, never a position change, and no seat role: the spare-track seats read the part as
 * they did before. A kind leaves only where the source names or boxes that kind too; otherwise it stays on both sides.
 */
export function stowagePart<G extends BufferGeometry>(geometry: G, kind: StowageKind = 'stowage'): G {
  geometry.userData.stowage = kind;
  return geometry;
}
