// Pack the authored prop-model JSON into an exact typed-array archive.
// Runtime loads the gzip stream behind the battle transition instead of
// asking the JavaScript parser to materialize ~200k numeric literals.
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const MAGIC = 'COTPROP1';
const HEADER_BYTES = 12;
const RECORD_HEADER_BYTES = 40;
const align4 = (value) => (value + 3) & ~3;

export function encodePropModelArchive(models) {
  // Preserve the baker's stable insertion order. It intentionally keeps the
  // two near-identical trench meshes adjacent, which gives gzip substantially
  // better cross-record matches than alphabetical ordering.
  const entries = Object.entries(models);
  let totalBytes = HEADER_BYTES;
  for (const [name, model] of entries) {
    const nameBytes = Buffer.byteLength(name);
    totalBytes += RECORD_HEADER_BYTES + align4(nameBytes)
      + (model.positions.length + model.normals.length + model.colors.length) * 4
      + model.indices.length * 2;
    totalBytes = align4(totalBytes);
  }

  const archive = Buffer.allocUnsafe(totalBytes);
  archive.fill(0);
  archive.write(MAGIC, 0, 'ascii');
  archive.writeUInt32LE(entries.length, 8);
  let offset = HEADER_BYTES;
  for (const [name, model] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const vertexCount = model.positions.length / 3;
    if (!Number.isInteger(vertexCount)
        || model.normals.length !== model.positions.length
        || model.colors.length !== model.positions.length) {
      throw new Error(`${name}: malformed position/normal/color streams`);
    }
    if (model.indices.some((index) => index < 0 || index > 0xffff)) {
      throw new Error(`${name}: prop archive requires 16-bit indices`);
    }
    archive.writeUInt16LE(nameBuffer.length, offset);
    archive.writeUInt16LE(2, offset + 2);
    archive.writeUInt32LE(vertexCount, offset + 4);
    archive.writeUInt32LE(model.indices.length, offset + 8);
    archive.writeUInt32LE(model.tris, offset + 12);
    let scalarOffset = offset + 16;
    for (const value of [...model.bbox.min, ...model.bbox.max]) {
      archive.writeFloatLE(value, scalarOffset);
      scalarOffset += 4;
    }
    offset += RECORD_HEADER_BYTES;
    nameBuffer.copy(archive, offset);
    offset += align4(nameBuffer.length);
    for (const key of ['positions', 'normals', 'colors']) {
      for (const value of model[key]) {
        archive.writeFloatLE(value, offset);
        offset += 4;
      }
    }
    for (const index of model.indices) {
      archive.writeUInt16LE(index, offset);
      offset += 2;
    }
    offset = align4(offset);
  }
  if (offset !== archive.length) throw new Error('prop archive size accounting drifted');
  return archive;
}

export function writePropModelArchive({
  input = resolve('src/world/props-models.json'),
  output = resolve('src/world/props-models.bin.gz'),
} = {}) {
  const models = JSON.parse(readFileSync(input, 'utf8'));
  const archive = encodePropModelArchive(models);
  const compressed = gzipSync(archive, { level: 9, mtime: 0 });
  writeFileSync(output, compressed);
  console.log(`[prop-pack] ${archive.length} B -> ${compressed.length} B: ${output}`);
  return { archiveBytes: archive.length, compressedBytes: compressed.length };
}

if (import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href
    && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writePropModelArchive();
}
