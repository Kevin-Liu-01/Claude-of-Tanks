// (battle-spikes-253) A geometry's arrays read where they stand when BufferAttribute's getters would read them the same
// way (the structure describers' triangle walks: the getters were a third of Verdant's church describe). Anything else —
// interleaved, normalized, half-float — goes through the getters.
import type { BufferAttribute, InterleavedBufferAttribute } from 'three';

/** A position attribute's floats when getX/getY/getZ read them straight (a plain Float32Array of three a vertex), else null. */
export function rawFloats(attribute: BufferAttribute | InterleavedBufferAttribute): Float32Array | null {
  const plain = attribute as BufferAttribute;
  return !(attribute as InterleavedBufferAttribute).isInterleavedBufferAttribute && !plain.normalized && plain.itemSize === 3
    && plain.array instanceof Float32Array ? plain.array : null;
}

/** An index attribute's entries when getX reads them straight. */
export function rawIndices(index: BufferAttribute): Uint16Array | Uint32Array | null {
  return index.itemSize === 1 && !index.normalized && (index.array instanceof Uint16Array || index.array instanceof Uint32Array) ? index.array : null;
}
