import type { BufferGeometry, BufferAttribute, InterleavedBufferAttribute } from 'three';

interface Frame {
  authoredU: Readonly<{ x: number; y: number; z: number }>;
  authoredNormal: Readonly<{ x: number; y: number; z: number }>;
}
interface SavedFrame { ux: number; uy: number; uz: number; nx: number; ny: number; nz: number }
interface SavedPart {
  part: BufferGeometry;
  attribute: BufferAttribute | InterleavedBufferAttribute | undefined;
  values: Float64Array;
}
interface Entry { parts: SavedPart[]; surfaces: number[][][] }

// One synchronous construction invocation owns the memo and closes it in
// finally after its receipts. Nothing survives into a later tank build.
// Calculate must be pure over these ordered legacy parts, side and full frame.
export function createInvocationEraWholeReuse() {
  const byParts = new Map<readonly BufferGeometry[], Map<number | symbol, Map<SavedFrame, Entry>>>();
  const frames: SavedFrame[] = [];
  let byFrame = new WeakMap<Frame, SavedFrame>();
  const negativeZero = Symbol('negative-zero-side');
  let closed = false;
  const counts = { hits: 0, misses: 0, bypasses: 0 };
  const copy = (surfaces: number[][][]): number[][][] => surfaces.map(surface => surface.map(vertex => vertex.slice()));
  const sameFrame = (saved: SavedFrame, frame: Frame): boolean => Object.is(saved.ux, frame.authoredU.x)
    && Object.is(saved.uy, frame.authoredU.y) && Object.is(saved.uz, frame.authoredU.z)
    && Object.is(saved.nx, frame.authoredNormal.x) && Object.is(saved.ny, frame.authoredNormal.y)
    && Object.is(saved.nz, frame.authoredNormal.z);
  const frameKey = (frame: Frame): SavedFrame => {
    const previous = byFrame.get(frame);
    if (previous && sameFrame(previous, frame)) return previous;
    let saved = frames.find(candidate => sameFrame(candidate, frame));
    if (!saved) {
      saved = { ux: frame.authoredU.x, uy: frame.authoredU.y, uz: frame.authoredU.z,
        nx: frame.authoredNormal.x, ny: frame.authoredNormal.y, nz: frame.authoredNormal.z };
      frames.push(saved);
    }
    byFrame.set(frame, saved);
    return saved;
  };
  const capturePart = (part: BufferGeometry): SavedPart => {
    const attribute = part.getAttribute('position');
    const values = new Float64Array((attribute?.count ?? 0) * 3);
    for (let index = 0; index < (attribute?.count ?? 0); index++) {
      values[index * 3] = attribute.getX(index);
      values[index * 3 + 1] = attribute.getY(index);
      values[index * 3 + 2] = attribute.getZ(index);
    }
    return { part, attribute, values };
  };
  const samePart = (saved: SavedPart, part: BufferGeometry): boolean => {
    const attribute = part.getAttribute('position');
    if (saved.part !== part || saved.attribute !== attribute
      || saved.values.length !== (attribute?.count ?? 0) * 3) return false;
    for (let index = 0; index < (attribute?.count ?? 0); index++) {
      if (!Object.is(saved.values[index * 3], attribute.getX(index))
        || !Object.is(saved.values[index * 3 + 1], attribute.getY(index))
        || !Object.is(saved.values[index * 3 + 2], attribute.getZ(index))) return false;
    }
    return true;
  };
  return {
    fit(parts: readonly BufferGeometry[], side: number, frame: Frame, calculate: () => number[][][]): number[][][] {
      if (closed) throw new Error('ERA whole-call memo is closed');
      if (parts.some(part => part.userData.eraHitFaceVertexStarts != null)) {
        counts.bypasses++;
        return calculate();
      }
      let sides = byParts.get(parts);
      if (!sides) { sides = new Map(); byParts.set(parts, sides); }
      const signedSide = Object.is(side, -0) ? negativeZero : side;
      let entries = sides.get(signedSide);
      if (!entries) { entries = new Map(); sides.set(signedSide, entries); }
      const key = frameKey(frame), previous = entries.get(key);
      if (previous && previous.parts.length === parts.length
        && parts.every((part, index) => samePart(previous.parts[index], part))) {
        counts.hits++;
        return copy(previous.surfaces);
      }
      // Read private doubles rather than retaining caller vectors or owning
      // disposable geometry/material clones. Unversioned writes remain visible.
      const savedParts = parts.map(capturePart);
      const surfaces = calculate();
      entries.set(key, { parts: savedParts, surfaces: copy(surfaces) });
      counts.misses++;
      return surfaces;
    },
    close(): void { byParts.clear(); byFrame = new WeakMap(); frames.length = 0; closed = true; },
    stats() { return { ...counts, retainedPartLists: byParts.size, retainedFrames: frames.length, closed }; },
  };
}
