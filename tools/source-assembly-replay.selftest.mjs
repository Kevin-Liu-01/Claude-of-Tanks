import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { replaySourceAssembly, prepareRegisteredSourceAssembly } from './source-assembly-replay.mjs';
import { SUPPLIED_SOURCE_ASSEMBLIES, withAssembledSourceFrames, assembledSourcePath } from './supplied-source-assemblies.mjs';
import { SOURCE_WORLD_FRAMES, validateSourceWorldFrame } from './source-world-registration.mjs';
import { SUPPLIED_SOURCE_REFERENCE_OVERRIDES } from './supplied-source-reference-overrides.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cot-source-assembly-unit-'));
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function glb(json, bin) {
  const text = Buffer.from(JSON.stringify(json));
  const j = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20), tail = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + j.length + bin.length, 8);
  header.writeUInt32LE(j.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  tail.writeUInt32LE(bin.length); tail.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, j, tail, bin]);
}
const bytesOf = array => Buffer.from(array.buffer);
function fixture() {
  const positions = new Float32Array([-1, 0, 0, 0, 0, 0, -1, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0, 5, 0, 0, 6, 0, 0, 5, 1, 0]);
  const normals = new Float32Array(Array.from({ length: 9 }, () => [0, 0, 1]).flat());
  const indices = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const bin = Buffer.concat([bytesOf(positions), bytesOf(normals), bytesOf(indices)]);
  const json = {
    asset: { version: '2.0' }, scenes: [{ nodes: [0] }], scene: 0,
    nodes: [{ name: 'source_root', children: [1] }, { name: 'source_stock', mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }] }],
    buffers: [{ byteLength: 252 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 108 }, { buffer: 0, byteOffset: 108, byteLength: 108 }, { buffer: 0, byteOffset: 216, byteLength: 36 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 9, type: 'VEC3', min: [-1, 0, 0], max: [6, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 9, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: 9, type: 'SCALAR' },
    ],
  };
  const bytes = glb(json, bin);
  fs.writeFileSync(path.join(temp, 'original.glb'), bytes);
  const selector = index => {
    const points = [...positions.slice(index * 9, index * 9 + 9)];
    const x = [-1, 2, 5][index];
    return { mesh: 'source_stock', componentIndex: index, weldedPoints: 3, triangles: 1,
      min: [x, 0, 0], max: [x + 1, 1, 0], center: [x + .5, .5, 0],
      positionTriangleSha256: sha(bytesOf(new Float64Array(points))) };
  };
  // Independently specify the entire expected compacted geometry and buffer layout.
  const expected = structuredClone(json);
  expected.meshes[0].primitives[0].attributes = { POSITION: 3, NORMAL: 4 };
  expected.meshes[0].primitives[0].indices = 5;
  expected.buffers[0].byteLength = 420;
  expected.bufferViews.push({ buffer: 0, byteOffset: 252, byteLength: 72 },
    { buffer: 0, byteOffset: 324, byteLength: 72 }, { buffer: 0, byteOffset: 396, byteLength: 24 });
  expected.accessors.push(
    { bufferView: 3, componentType: 5126, count: 6, type: 'VEC3', byteOffset: 0, min: [2.125, 0, -.5], max: [6, 1.25, 0] },
    { bufferView: 4, componentType: 5126, count: 6, type: 'VEC3', byteOffset: 0 },
    { bufferView: 5, componentType: 5125, count: 6, type: 'SCALAR', byteOffset: 0 });
  const finalPositions = new Float32Array([2.125, .25, -.5, 3.125, .25, -.5, 2.125, 1.25, -.5, 5, 0, 0, 6, 0, 0, 5, 1, 0]);
  const finalNormals = new Float32Array(Array.from({ length: 6 }, () => [0, 0, 1]).flat());
  const finalIndices = new Uint32Array([0, 1, 2, 3, 4, 5]);
  const expectedBytes = glb(expected, Buffer.concat([bin, bytesOf(finalPositions), bytesOf(finalNormals), bytesOf(finalIndices)]));
  return { json, bin, bytes, expectedBytes, selector,
    recipe: { schemaVersion: 1, id: 'fixture_x', source: { path: 'original.glb', sha256: sha(bytes) },
      output: { sha256: sha(expectedBytes) }, operations: [
        { kind: 'remove-components', selectors: [selector(0)] },
        { kind: 'translate-components', selectors: [selector(1)], translation: [.125, .25, -.5] },
      ] } };
}
try {
  const f = fixture();
  const actual = await replaySourceAssembly(f.recipe, { root: temp });
  assert.deepEqual(actual.bytes, f.expectedBytes, 'literal source geometry, winding, normals and compaction');
  assert.equal(actual.proof.removedTriangles, 1);
  assert.equal(actual.proof.movedTriangles, 1);
  assert.equal(actual.proof.unchanged[0].triangles, 1);
  assert.deepEqual(fs.readFileSync(path.join(temp, 'original.glb')), f.bytes, 'source never overwritten');
  for (const [mutate, expected] of [
    [r => { r.source.sha256 = '0'.repeat(64); }, /original canonical source hash/],
    [r => { r.operations[0].selectors[0].positionTriangleSha256 = '0'.repeat(64); }, /component selector drift/],
    [r => { r.operations[0].selectors[0].triangles++; }, /component selector drift/],
    [r => { r.operations[0].selectors[0].min[0] += .1; }, /component selector drift/],
    [r => { r.operations[0].selectors[0].componentIndex = 2; }, /component selector drift/],
    [r => { r.operations[1].selectors.push(r.operations[0].selectors[0]); }, /one operation per component/],
    [r => { r.operations[1].translation[0] = NaN; }, /finite source translation/],
    [r => { r.operations[1].translation[0] += .1; }, /assembled output hash/],
    [r => { r.output.sha256 = '0'.repeat(64); }, /assembled output hash/],
  ]) {
    const wrong = structuredClone(f.recipe); mutate(wrong);
    await assert.rejects(replaySourceAssembly(wrong, { root: temp }), expected);
  }
  const matrix = [...IDENTITY]; matrix[12] = .125; matrix[13] = .25; matrix[14] = -.5;
  const expectedNode = structuredClone(f.json); expectedNode.nodes[1].matrix = matrix;
  const rigidExpected = glb(expectedNode, f.bin);
  const rigid = { ...f.recipe, output: { sha256: sha(rigidExpected) }, operations: [{ kind: 'rigid-node-transform',
    selector: { nodeIndex: 1, nodeName: 'source_stock', meshIndex: 0, originalMatrix: null,
      triangles: 3, connectedComponents: 3, bounds: { min: [-1, 0, 0], max: [6, 1, 0] },
      meshDefinitionSha256: sha(Buffer.from(JSON.stringify(f.json.meshes[0]))) }, matrix }] };
  assert.deepEqual((await replaySourceAssembly(rigid, { root: temp })).bytes, rigidExpected, 'literal node translation preserves every binary byte');
  for (const [mutate, expected] of [
    [r => { r.operations[0].selector.nodeName = 'wrong'; }, /node selector/],
    [r => { r.operations[0].selector.meshDefinitionSha256 = '0'.repeat(64); }, /mesh definition selector/],
    [r => { r.operations[0].selector.triangles++; }, /node triangle selector/],
    [r => { r.operations[0].selector.connectedComponents++; }, /node component selector/],
    [r => { r.operations[0].selector.bounds.max[0] += .1; }, /node bounds selector/],
    [r => { r.operations[0].matrix[0] = 1.01; }, /rigid orthonormal transform/],
    [r => { r.operations[0].matrix[0] = -1; }, /proper rigid transform/],
  ]) {
    const wrong = structuredClone(rigid); mutate(wrong);
    await assert.rejects(replaySourceAssembly(wrong, { root: temp }), expected);
  }
  const legacyIds = ["aft10_x", "ajax_x", "amx30_x", "amx40_x", "ariete_c1_x", "challenger1_x", "chieftain5_x", "chieftain_mk10_x", "cv90105_tml_x", "cv90_mkiv_x", "jpz_e100_x", "k1a1_x", "kf41_lynx_x", "kf51_x", "leclerc_classic_x", "leclerc_x", "leo2a5_x", "leo2a6_x", "m1a2_sepv2_x", "sabra_mk2_x", "strv122_x", "t62mv1_x", "t72b3_x", "t72b3m_x", "t72b_1987_x", "t72bu_x", "t80u_x", "t90_x", "t90a_burlak_x", "t90a_x", "t90m_x", "t90ms_x", "t90sm_x", "type10_x", "type90_x", "type96b_x", "ztz100_x"];
  const legacy = Object.fromEntries(legacyIds.map(id => [id, SOURCE_WORLD_FRAMES[id]]));
  assert.equal(sha(Buffer.from(JSON.stringify(legacy))), "55524fedcd0cc405dce90f47795ce6753c9bcd5dd1e6245473d1f2a45f2f0f7e", 'all prior non-assembled certificates preserve their exact hashes and datums');
  for (const [id, assembly] of Object.entries(SUPPLIED_SOURCE_ASSEMBLIES)) {
    assert.deepEqual(SOURCE_WORLD_FRAMES[id], { ...assembly.originalFrame, sha256: assembly.sha256 }, 'only approved source hash changes');
    const reference = SUPPLIED_SOURCE_REFERENCE_OVERRIDES[id];
    assert.equal(reference.glb.path, assembly.path);
    assert.equal(reference.qualityBar, 'exemplar');
    assert.equal(reference.glb.fixedMount, true);
    assert.equal(reference.glb.componentMasks, false);
    assert.equal(reference.glb.paintUntextured, true);
    const baseline = { [id]: structuredClone(assembly.originalFrame) };
    const selected = { [id]: assembly };
    const before = structuredClone(baseline);
    assert.deepEqual(withAssembledSourceFrames(baseline, selected)[id], SOURCE_WORLD_FRAMES[id]);
    assert.deepEqual(baseline, before, 'original certificate is immutable input');
    for (const mutate of [r => { r[id].sha256 = '0'.repeat(64); }, r => { r[id].turret[1] += .001; }, r => { r[id].gun[2] += .001; }, r => { r[id].fused = false; }]) {
      const wrong = structuredClone(baseline); mutate(wrong);
      assert.throws(() => withAssembledSourceFrames(wrong, selected), /original source certificate changed/);
    }
    assert.throws(() => assembledSourcePath(id, '/models/community-candidates/other.glb'), /original source path changed/);
    const frame = { rootMatrix: IDENTITY, hull: [0, 0, 0], turret: assembly.originalFrame.turret, gun: assembly.originalFrame.gun };
    const frames = { procedural: frame, reference: { ...frame, turret: [0, 0, 0], gun: [0, 0, 0] } };
    assert(validateSourceWorldFrame(SOURCE_WORLD_FRAMES[id], assembly.sha256, frames).passed);
    assert(!validateSourceWorldFrame(SOURCE_WORLD_FRAMES[id], assembly.originalSha256, frames).passed, 'old bytes cannot certify as assembled');
    const recipePath = path.join(temp, assembly.recipePath);
    fs.mkdirSync(path.dirname(recipePath), { recursive: true });
    const recipeBytes = fs.readFileSync(path.join(root, assembly.recipePath));
    assert.equal(sha(recipeBytes), assembly.recipeSha256);
    fs.writeFileSync(recipePath, Buffer.concat([recipeBytes, Buffer.from(' ')]));
    await assert.rejects(prepareRegisteredSourceAssembly(id, { root: temp }), /approved source recipe hash/);
  }
  assert.equal(assembledSourcePath('m1a2', 'unchanged.glb'), 'unchanged.glb');
  for (const [id, reference] of Object.entries(SUPPLIED_SOURCE_REFERENCE_OVERRIDES)) {
    if (!SUPPLIED_SOURCE_ASSEMBLIES[id]) assert.equal(reference.glb.path, `/models/community-candidates/${id}_source.glb`);
  }
  console.log('source-assembly-replay: literal component/node fixtures, hash/selector/transform negatives, five source-only references and unchanged legacy datums pass');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
