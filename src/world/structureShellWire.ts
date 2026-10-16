// src/world/structureShellWire.ts — a structure's geometry as the shell-band derivation reads it, packed for a worker
// (2026-10-13, the perf stream: Plan W, structureShellPool.ts). structureCollision.ts reads exactly this of a bucket's
// geometry: its position attribute's count and getX/getY/getZ, its index's count and getX, and the userData flags
// noCollision, noCollisionVertices, collisionHull and collisionHullRanges. The wire carries those values, never re-rounded: a non-interleaved Float32
// position array is copied as it is (getX reads it back unchanged); any other layout (interleaved, normalized, another
// array type) is read through getX/getY/getZ into a Float64Array, which holds every value a getter returns exactly.
// The unpacked geometry answers the same reads with the same numbers, in the same bucket and geometry order.
import type { BufferGeometry } from 'three';

export interface StructureShellGeometryWire {
  /** x, y, z per vertex */
  position: Float32Array | Float64Array;
  count: number;
  index: Uint16Array | Uint32Array | null;
  indexCount: number;
  noCollision: boolean;
  noCollisionVertices: Uint8Array | null;
  /** (physics, 2026-10-16) the geometry stands as its plan hull (structureCollision.ts hullPrism) */
  collisionHull: boolean;
  /** (physics, 2026-10-16) vertex ranges [start, end, ...] that each stand as their own hull */
  collisionHullRanges: Uint32Array | null;
}

export type StructureShellWire = Array<[bucket: string, geometries: StructureShellGeometryWire[]]>;

type GeometryLike = Pick<BufferGeometry, 'getAttribute' | 'getIndex' | 'userData'>;
type AttributeLike = {
  count: number; itemSize?: number; normalized?: boolean; array?: ArrayLike<number>; isInterleavedBufferAttribute?: boolean;
  getX(i: number): number; getY(i: number): number; getZ(i: number): number;
};

/** Copy a structure's buckets (pending its placement transform) into transferable arrays. */
export function packStructureShellWire(
  buckets: Readonly<Record<string, readonly GeometryLike[] | undefined>>,
): { wire: StructureShellWire; transfer: ArrayBuffer[] } {
  const wire: StructureShellWire = [];
  const transfer: ArrayBuffer[] = [];
  for (const [bucket, geometries] of Object.entries(buckets)) {
    if (!geometries) continue;
    const packed: StructureShellGeometryWire[] = [];
    for (const geometry of geometries) {
      const attribute = geometry.getAttribute('position') as unknown as AttributeLike | undefined;
      const count = attribute?.count ?? 0;
      let position: Float32Array | Float64Array;
      if (attribute && !attribute.isInterleavedBufferAttribute && !attribute.normalized && attribute.itemSize === 3
        && attribute.array instanceof Float32Array) {
        position = attribute.array.slice(0, count * 3);
      } else {
        position = new Float64Array(count * 3);
        for (let i = 0; i < count; i++) {
          position[i * 3] = attribute!.getX(i); position[i * 3 + 1] = attribute!.getY(i); position[i * 3 + 2] = attribute!.getZ(i);
        }
      }
      transfer.push(position.buffer as ArrayBuffer);
      const sourceIndex = geometry.getIndex() as unknown as { count: number; getX(i: number): number; array?: ArrayLike<number> } | null;
      let index: Uint16Array | Uint32Array | null = null;
      if (sourceIndex) {
        index = new Uint32Array(sourceIndex.count);
        for (let i = 0; i < sourceIndex.count; i++) index[i] = sourceIndex.getX(i);
        transfer.push(index.buffer as ArrayBuffer);
      }
      const flags = geometry.userData?.noCollisionVertices as Uint8Array | undefined;
      const noCollisionVertices = flags ? flags.slice() : null;
      if (noCollisionVertices) transfer.push(noCollisionVertices.buffer as ArrayBuffer);
      const ranges = geometry.userData?.collisionHullRanges as ArrayLike<number> | undefined;
      const collisionHullRanges = ranges?.length ? Uint32Array.from(ranges) : null;
      if (collisionHullRanges) transfer.push(collisionHullRanges.buffer as ArrayBuffer);
      packed.push({ position, count, index, indexCount: sourceIndex?.count ?? 0,
        noCollision: !!geometry.userData?.noCollision, noCollisionVertices, collisionHull: !!geometry.userData?.collisionHull, collisionHullRanges });
    }
    wire.push([bucket, packed]);
  }
  return { wire, transfer };
}

/** The geometry the derivation reads, rebuilt from the wire (in a worker, or in a Node receipt). */
export function unpackStructureShellWire(wire: StructureShellWire): Record<string, BufferGeometry[]> {
  const buckets: Record<string, BufferGeometry[]> = {};
  for (const [bucket, geometries] of wire) {
    buckets[bucket] = geometries.map((g) => {
      const p = g.position;
      const position = { count: g.count, getX: (i: number) => p[i * 3], getY: (i: number) => p[i * 3 + 1], getZ: (i: number) => p[i * 3 + 2] };
      const ix = g.index;
      const index = ix ? { count: g.indexCount, getX: (i: number) => ix[i] } : null;
      const userData: Record<string, unknown> = {};
      if (g.noCollision) userData.noCollision = true;
      if (g.noCollisionVertices) userData.noCollisionVertices = g.noCollisionVertices;
      if (g.collisionHull) userData.collisionHull = true;
      if (g.collisionHullRanges) userData.collisionHullRanges = g.collisionHullRanges;
      return { getAttribute: (name: string) => (name === 'position' ? position : undefined), getIndex: () => index, userData } as unknown as BufferGeometry;
    });
  }
  return buckets;
}
