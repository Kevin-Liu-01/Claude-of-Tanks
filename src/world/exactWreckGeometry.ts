import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type CandidateAttribute = THREE.BufferAttribute & {
  isInterleavedBufferAttribute?: boolean;
  isInstancedBufferAttribute?: boolean;
  isFloat16BufferAttribute?: boolean;
};
interface Stream {
  name: string;
  attribute: CandidateAttribute;
  words: Uint32Array;
  size: number;
}
interface Input {
  count: number;
  streams: Stream[];
  bytes: number;
  wordsPerCorner: number;
}
interface IndexTable {
  remap: Uint32Array;
  representatives: Uint32Array;
  unique: number;
}
interface MergeInput {
  entries: [string, CandidateAttribute][];
  vertexCount: number;
  cornerCount: number;
}

function compactableAttribute(attribute: CandidateAttribute, count: number): boolean {
  return attribute.isBufferAttribute && !attribute.isInterleavedBufferAttribute
    && !attribute.isInstancedBufferAttribute && !attribute.isFloat16BufferAttribute
    && attribute.array.constructor === Float32Array && attribute.count === count
    && Number.isInteger(attribute.itemSize) && attribute.itemSize >= 1
    && attribute.array.length === count * attribute.itemSize
    && attribute.usage === THREE.StaticDrawUsage && attribute.updateRanges.length === 0
    && attribute.version === 0
    && attribute.onUploadCallback === THREE.BufferAttribute.prototype.onUploadCallback;
}

function staticInput(geometry: THREE.BufferGeometry): Input | null {
  if (geometry.index || 'isInstancedBufferGeometry' in geometry
    || Object.keys(geometry.morphAttributes).length) return null;
  const count = geometry.attributes.position?.count;
  if (!Number.isInteger(count) || count < 3 || count % 3 || count > 1_000_000) return null;
  const streams: Stream[] = [];
  let bytes = 0, wordsPerCorner = 0;
  for (const [name, inputAttribute] of Object.entries(geometry.attributes)) {
    const attribute = inputAttribute as CandidateAttribute;
    if (!compactableAttribute(attribute, count)) return null;
    streams.push({ name, attribute, words: new Uint32Array(attribute.array.buffer,
      attribute.array.byteOffset, attribute.array.length), size: attribute.itemSize });
    bytes += attribute.array.byteLength;
    wordsPerCorner += attribute.itemSize;
  }
  return streams.length ? { count, streams, bytes, wordsPerCorner } : null;
}

function sameCorner(streams: Stream[], a: number, b: number): boolean {
  for (let s = 0; s < streams.length; s++) {
    const { words, size } = streams[s], ai = a * size, bi = b * size;
    for (let j = 0; j < size; j++) if (words[ai + j] !== words[bi + j]) return false;
  }
  return true;
}

function hashCorner(streams: Stream[], corner: number): number {
  let hash = 0x811c9dc5;
  for (let s = 0; s < streams.length; s++) {
    const { words, size } = streams[s], offset = corner * size;
    for (let j = 0; j < size; j++) hash = Math.imul(hash ^ words[offset + j], 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function buildIndex(input: Input): IndexTable {
  const { count, streams } = input;
  let tableSize = 1;
  while (tableSize < count * 2) tableSize *= 2;
  const table = new Uint32Array(tableSize), representatives = new Uint32Array(count);
  const remap = new Uint32Array(count), mask = tableSize - 1;
  let unique = 0;
  for (let corner = 0; corner < count; corner++) {
    let slot = hashCorner(streams, corner) & mask;
    while (table[slot] && !sameCorner(streams, corner, representatives[table[slot] - 1])) slot = (slot + 1) & mask;
    if (!table[slot]) { representatives[unique] = corner; table[slot] = ++unique; }
    remap[corner] = table[slot] - 1;
  }
  return { remap, representatives, unique };
}

function compactAttribute(stream: Stream, index: IndexTable): THREE.BufferAttribute {
  const { attribute, words, size } = stream, { unique, representatives } = index;
  const compact = new Float32Array(unique * size), compactWords = new Uint32Array(compact.buffer);
  for (let row = 0; row < unique; row++) {
    const sourceOffset = representatives[row] * size, targetOffset = row * size;
    for (let j = 0; j < size; j++) compactWords[targetOffset + j] = words[sourceOffset + j];
  }
  const result = new THREE.BufferAttribute(compact, size, attribute.normalized);
  result.name = attribute.name; result.usage = attribute.usage; result.gpuType = attribute.gpuType;
  return result;
}

/** Construction-only: use immediately after painting and before translation.
 * All Float32 attribute bits and original triangle order are preserved. Never
 * call after GPU upload; unsupported or non-beneficial inputs remain unchanged.
 */
export function compactWreckGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const input = staticInput(geometry);
  if (!input) return geometry;
  const index = buildIndex(input);
  // WebGL2 reserves index 65535 for primitive restart, so 65536 vertices
  // require Uint32 even though their maximum index fits an unsigned short.
  const retainedBytes = index.unique * input.wordsPerCorner * 4 + input.count * (index.unique <= 65535 ? 2 : 4);
  if (retainedBytes >= input.bytes) return geometry;
  // Build every output before installation, so allocation failure cannot leave
  // a partially replaced geometry. No geometry/material identity is changed.
  const attributes = input.streams.map(stream => [stream.name, compactAttribute(stream, index)] as const);
  const indices = new THREE.BufferAttribute(index.unique <= 65535 ? Uint16Array.from(index.remap) : index.remap, 1);
  for (const [name, attribute] of attributes) geometry.setAttribute(name, attribute);
  geometry.setIndex(indices);
  return geometry;
}

function mixedInput(geometries: THREE.BufferGeometry[]): MergeInput {
  const entries = Object.entries(geometries[0].attributes) as [string, CandidateAttribute][];
  let vertexCount = 0, cornerCount = 0;
  for (const geo of geometries) {
    if (Object.keys(geo.attributes).length !== entries.length || Object.keys(geo.morphAttributes).length
      || 'isInstancedBufferGeometry' in geo) throw new Error('unsupported mixed wreck geometry');
    const count = geo.attributes.position.count;
    for (const [name, first] of entries) {
      const attr = geo.attributes[name] as CandidateAttribute;
      if (!attr || attr.isInterleavedBufferAttribute || attr.isInstancedBufferAttribute || attr.array.constructor !== Float32Array
        || attr.count !== count || attr.itemSize !== first.itemSize || attr.normalized !== first.normalized
        || attr.gpuType !== first.gpuType) throw new Error('incompatible mixed wreck attributes');
    }
    vertexCount += count; cornerCount += geo.index?.count ?? count;
  }
  return { entries, vertexCount, cornerCount };
}

function mergedIndex(geometries: THREE.BufferGeometry[], input: MergeInput): THREE.BufferAttribute {
  const indices = input.vertexCount <= 65535 ? new Uint16Array(input.cornerCount) : new Uint32Array(input.cornerCount);
  let vertexOffset = 0, cornerOffset = 0;
  for (const geo of geometries) {
    const count = geo.index?.count ?? geo.attributes.position.count;
    for (let i = 0; i < count; i++) indices[cornerOffset + i] = vertexOffset + (geo.index ? geo.index.array[i] : i);
    vertexOffset += geo.attributes.position.count; cornerOffset += count;
  }
  return new THREE.BufferAttribute(indices, 1);
}

function mergedAttribute(geometries: THREE.BufferGeometry[], name: string,
  first: CandidateAttribute, vertexCount: number): THREE.BufferAttribute {
  const output = new Float32Array(vertexCount * first.itemSize), words = new Uint32Array(output.buffer);
  let offset = 0;
  for (const geo of geometries) {
    const array = (geo.attributes[name] as CandidateAttribute).array;
    words.set(new Uint32Array(array.buffer, array.byteOffset, array.length), offset);
    offset += array.length;
  }
  const attr = new THREE.BufferAttribute(output, first.itemSize, first.normalized); attr.gpuType = first.gpuType;
  return attr;
}

/** Mixed indexed hulks/non-indexed debris, same ordered triangles and one draw.
 * Does not allocate an expanded world mesh or an ordinary JS merged-index array.
 */
export function mergeWreckGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (!geometries.length) throw new Error('empty mixed wreck merge');
  if (geometries.every(geometry => geometry.index === null)) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error('non-indexed wreck merge failed');
    return merged;
  }
  const input = mixedInput(geometries), result = new THREE.BufferGeometry();
  result.setIndex(mergedIndex(geometries, input));
  for (const [name, first] of input.entries) result.setAttribute(name, mergedAttribute(geometries, name, first, input.vertexCount));
  return result;
}
