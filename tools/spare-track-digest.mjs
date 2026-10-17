// The geometry digest a spare-track ledger row is measured against (tools/spare-track-placement-check.mjs, STALE):
// every visible mesh's name, positions and world matrix, in scene order (LOD level 0 only). A row whose digest differs
// from the build's must be re-measured.
import { createHash } from 'node:crypto';

/** The build options both the receipt and its selftest use, so their digests agree. */
export const SPARE_TRACK_BUILD = Object.freeze({
  proceduralOnly: true, decor: true, quality: 'high', geometryQuality: 'high', camoSeed: 4242, geometryReceipt: true,
});

export function spareTrackGeometryDigest(root) {
  const h = createHash('sha256');
  root.updateMatrixWorld(true);
  const visit = (o) => {
    if (o.visible === false) return;
    if (o.isLOD) { if (o.levels?.length && o.levels[0].object) visit(o.levels[0].object); return; }
    const p = o.isMesh ? o.geometry?.getAttribute?.('position') : null;
    if (p) {
      h.update(o.name || '-');
      h.update(new Uint8Array(p.array.buffer, p.array.byteOffset, p.array.byteLength));
      h.update(new Uint8Array(new Float32Array(o.matrixWorld.elements).buffer));
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  return h.digest('hex').slice(0, 16);
}
