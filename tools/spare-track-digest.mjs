// The geometry digest a spare-track ledger row is measured against (tools/spare-track-placement-check.mjs, STALE):
// every visible mesh's name, positions and world matrix, in scene order (LOD level 0 only). A row whose digest differs
// from the build's must be re-measured. Its runs are matched on ledgerSiteKeys (below), never on source line numbers.
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

// A run's ledger key is its bundle name with every `fn@file:line` site reduced to `fn@file`: the source and part
// (fitting, strip, decor slot, registered course name) and the authoring function and file, never a line number. A line
// number is not an identity: --update keeps a row whose geometry is unchanged while --gate measures afresh, so a key
// that held a line failed the gate after any unrelated edit above the call (fv510, uk.ts, 2026-10-18). Where two
// distinct calls of one row reduce to the same key (two calls in one stage function), each site in them carries a content
// hash of its call instead: the call line's text and how many identical lines precede it in the file, so moving the call
// keeps the key. Runs from one call (a helper called twice, a loop) share their key, as they always did.
const SITE_LINE_RE = /@([\w./-]+?\.ts):(\d+)/g;
const norm = (t) => (t ?? '').trim().replace(/\s+/g, ' ');

/** The content hash of the call at `file:line`; `linesOf(file)` returns the file's source lines. */
function callHash(linesOf, file, line) {
  const L = linesOf(file), text = norm(L[line - 1]);
  let same = 0;
  for (let i = 0; i < line - 1 && i < L.length; i++) if (norm(L[i]) === text) same++;
  return createHash('sha256').update(`${text}\n${same}`).digest('hex').slice(0, 8);
}

/** Ledger keys for one row's run names (bundle names, in run order); a name that is already a key is kept. */
export function ledgerSiteKeys(names, linesOf) {
  const bare = names.map((s) => s.replace(SITE_LINE_RE, '@$1'));
  const calls = new Map();   // bare key -> the distinct names (calls) behind it
  bare.forEach((b, i) => { if (!calls.has(b)) calls.set(b, new Set()); calls.get(b).add(names[i]); });
  return names.map((s, i) => (calls.get(bare[i]).size > 1
    ? s.replace(SITE_LINE_RE, (_, f, l) => `@${f}~${callHash(linesOf, f, Number(l))}`) : bare[i]));
}
