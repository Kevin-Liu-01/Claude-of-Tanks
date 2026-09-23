// Source-only reference preparation; no playable profile, dimensions or masks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OBJECT695_EPOKHA as RECIPE, object695ModuleShift, object695SourceTransform } from './object695-epokha-reference.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonDigest = value => digest(Buffer.from(JSON.stringify(value)));

export function readReferenceGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length');
  const length = bytes.readUInt32LE(12), offset = 20 + length;
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk');
  assert.equal(bytes.readUInt32LE(offset + 4), 0x004e4942, 'BIN chunk');
  assert.equal(offset + 8 + bytes.readUInt32LE(offset), bytes.length, 'exact two chunks');
  return { json: JSON.parse(bytes.subarray(20, offset)), bin: bytes.subarray(offset + 8) };
}

function writeReferenceGlb(json, bin) {
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const head = Buffer.alloc(20), binHead = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(28 + padded.length + bin.length, 8);
  head.writeUInt32LE(padded.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, padded, binHead, bin]);
}

function accessorValues(glb, index) {
  const accessor = glb.json.accessors[index], view = glb.json.bufferViews[accessor.bufferView];
  assert(!accessor.sparse, 'no sparse source accessor');
  const width = { SCALAR: 1, VEC3: 3 }[accessor.type];
  const reader = { 5126: ['readFloatLE', 4], 5125: ['readUInt32LE', 4], 5123: ['readUInt16LE', 2] }[accessor.componentType];
  assert(width && reader, 'supported original source accessor');
  const [read, size] = reader, stride = view.byteStride ?? width * size;
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, i) => Array.from({ length: width }, (_, axis) =>
    glb.bin[read](offset + i * stride + axis * size)));
}

function trianglePoints(glb, node) {
  const primitives = glb.json.meshes[node.mesh].primitives;
  assert.equal(primitives.length, 1, 'one original source primitive per owner');
  const primitive = primitives[0], points = accessorValues(glb, primitive.attributes.POSITION);
  assert.equal(primitive.mode ?? 4, 4, 'source triangles');
  return primitive.indices === undefined ? points : accessorValues(glb, primitive.indices).map(([i]) => points[i]);
}

function bounds(points) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
  }
  return { min, max, size: min.map((value, axis) => max[axis] - value) };
}

function assertCanonicalNodes(glb) {
  assert.deepEqual(glb.json.scenes[glb.json.scene ?? 0].nodes, [0], 'single identity source root');
  assert.equal(glb.json.nodes[0].children.length, glb.json.nodes.length - 1, 'all mesh owners retained');
  for (const [index, node] of glb.json.nodes.entries()) {
    assert(!node.matrix && !node.rotation && !node.scale && !node.translation, 'identity source hierarchy');
    if (index) assert(glb.json.nodes[0].children.includes(index) && node.mesh !== undefined, 'direct complete owner');
  }
}

function correspondence(source, donor, selection) {
  const [name, index, triangles] = selection, node = source.json.nodes[index], other = donor.json.nodes[index];
  assert.equal(node.name, name, 'original selected owner');
  assert.equal(other.name, name, 'donor selected owner');
  const original = trianglePoints(source, node), target = trianglePoints(donor, other);
  assert.equal(original.length, triangles * 3, 'original triangle census');
  assert.equal(target.length, original.length, 'donor triangle census');
  const { scale, translation } = RECIPE.source;
  let residual = 0;
  for (let i = 0; i < original.length; i++) for (let axis = 0; axis < 3; axis++) {
    const expected = (target[i][axis] - RECIPE.donor.translation[axis]) * scale + translation[axis];
    residual = Math.max(residual, Math.abs(original[i][axis] - expected));
  }
  assert(residual < 1e-6, 'source-to-source ordered triangle correspondence');
  return { name, nodeIndex: index, meshIndex: node.mesh, triangles,
    originalBounds: bounds(original), donorBounds: bounds(target),
    originalTriangleSha256: jsonDigest(original), donorTriangleSha256: jsonDigest(target),
    maxCorrespondenceResidualM: residual };
}

export function verifyOnlySelectedTransforms(before, after) {
  assert.deepEqual(after.bin, before.bin, 'all original BIN bytes retained');
  const normalized = structuredClone(after.json), transform = object695SourceTransform();
  for (const [, index] of RECIPE.owners) {
    assert.deepEqual(normalized.nodes[index].scale, Array(3).fill(transform.scale), 'exact uniform source restoration');
    assert.deepEqual(normalized.nodes[index].translation, transform.translation, 'exact source frame translation');
    delete normalized.nodes[index].scale; delete normalized.nodes[index].translation;
  }
  assert.deepEqual(normalized, before.json, 'every nonselected node and all geometry/material definitions unchanged');
  return { binarySha256: digest(before.bin), nonselectedAndDefinitionsSha256: jsonDigest(normalized) };
}

function worldBounds(glb) {
  const points = [];
  for (const node of glb.json.nodes.slice(1)) {
    const scale = node.scale ?? [1, 1, 1], translation = node.translation ?? [0, 0, 0];
    for (const point of trianglePoints(glb, node)) points.push(point.map((value, axis) => value * scale[axis] + translation[axis]));
  }
  return bounds(points);
}

export function deriveObject695Reference(sourceBytes, donorBytes) {
  assert.equal(digest(sourceBytes), RECIPE.source.sha256, 'authenticated Object hull source');
  assert.equal(digest(donorBytes), RECIPE.donor.sha256, 'authenticated Kurg turret source');
  const source = readReferenceGlb(sourceBytes), donor = readReferenceGlb(donorBytes);
  assertCanonicalNodes(source); assertCanonicalNodes(donor);
  const census = RECIPE.owners.map(owner => correspondence(source, donor, owner));
  const transform = object695SourceTransform(), output = structuredClone(source.json);
  for (const [, index] of RECIPE.owners) {
    output.nodes[index].scale = Array(3).fill(transform.scale);
    output.nodes[index].translation = [...transform.translation];
  }
  const bytes = writeReferenceGlb(output, source.bin), after = readReferenceGlb(bytes);
  const preservation = verifyOnlySelectedTransforms(source, after);
  const shift = object695ModuleShift();
  const manifest = {
    schemaVersion: 1, id: 'object695_x',
    scope: 'Owner-authorized family derivation: retained Object hull and running gear, complete corrected source Epokha turret. Local QA only.',
    source: RECIPE.source, donor: RECIPE.donor,
    rawParentSha256: '0af5ccde32d66d5f56cbf7b543e000f64fa28e18cc0eb560d92ed7b05e7f7fd2',
    output: { path: RECIPE.outputPath, sha256: digest(bytes) },
    registration: { axes: ['x', 'y', 'z'], scale: RECIPE.source.scale, translation: RECIPE.source.translation,
      retainedForNonselectedStock: true, sourceTurret: RECIPE.donor.turret, retainedTurret: RECIPE.retainedTurret, moduleShift: shift },
    operations: census.map(selector => ({ kind: 'restore-source-module-scale-and-reseat', selector, transform,
      receiverEvidence: 'Retained Object construction ring [0,2.15,-1.10]; Kurg construction ring [0,2.21,-1.27] inferred from source receiving stock (not a supplied animation pivot). Uniform normalization inversion, followed by this ring-to-ring translation only.' })),
    preservation,
    sourceOnlyDatums: { gun: RECIPE.donor.gun.map((value, axis) => value + shift[axis]),
      muzzleZ: census.find(row => row.name === 'Object_31').donorBounds.max[2] + shift[2],
      originalBounds: worldBounds(source), derivedBounds: worldBounds(after) },
    limits: ['No procedural model or image is an input.', 'The old dropped ramp and all nonselected hull stock remain exactly as in the original Object reference.',
      'This is an authorized family-derived target, not a claim about a distinct historical Object 695 configuration.'],
  };
  return { bytes, manifest };
}

function writeObject695Reference(root) {
  const { bytes, manifest } = deriveObject695Reference(
    fs.readFileSync(path.join(root, RECIPE.source.path)), fs.readFileSync(path.join(root, RECIPE.donor.path)));
  fs.mkdirSync(path.dirname(path.join(root, RECIPE.recipePath)), { recursive: true });
  fs.writeFileSync(path.join(root, RECIPE.outputPath), bytes);
  fs.writeFileSync(path.join(root, RECIPE.recipePath), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  console.log(JSON.stringify(writeObject695Reference(root), null, 2));
}
