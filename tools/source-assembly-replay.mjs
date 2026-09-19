// Local source-reference preparation only. This module never builds playable geometry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { loadSource } from './source-x-oracle.mjs';
import { SUPPLIED_SOURCE_ASSEMBLIES } from './supplied-source-assemblies.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = new THREE.Matrix4().toArray();
const repoRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

function readGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length');
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    assert.equal(length % 4, 0, 'GLB aligned chunk');
    assert(offset + 8 + length <= bytes.length, 'GLB chunk bounds');
    chunks.push({ type: bytes.readUInt32LE(offset + 4), data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  assert.equal(chunks[0].type, 0x4e4f534a);
  return { json: JSON.parse(chunks[0].data.toString('utf8')), chunks };
}

function encodeGlb(json, tailChunks) {
  const text = Buffer.from(JSON.stringify(json));
  const data = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const chunks = [{ type: 0x4e4f534a, data }, ...tailChunks];
  const length = 12 + chunks.reduce((n, c) => n + 8 + c.data.length, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(length, 8);
  const parts = [header];
  for (const chunk of chunks) {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(chunk.data.length, 0);
    h.writeUInt32LE(chunk.type, 4);
    parts.push(h, chunk.data);
  }
  return Buffer.concat(parts);
}

// The approved recipes pin this original 10µm welded-component enumeration.
function components(mesh) {
  const positions = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const map = new Map(), vertexToWeld = [], points = [], parent = [];
  for (let i = 0; i < positions.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    const key = point.toArray().map(value => Math.round(value * 1e5)).join(',');
    let weld = map.get(key);
    if (weld === undefined) {
      weld = points.length;
      map.set(key, weld);
      points.push(point);
      parent.push(weld);
    }
    vertexToWeld.push(weld);
  }
  const find = vertex => {
    while (parent[vertex] !== vertex) {
      parent[vertex] = parent[parent[vertex]];
      vertex = parent[vertex];
    }
    return vertex;
  };
  const triangles = [];
  for (let offset = 0; offset < (index?.count ?? positions.count); offset += 3) {
    const indices = [0, 1, 2].map(k => index ? index.getX(offset + k) : offset + k);
    const weld = indices.map(i => vertexToWeld[i]);
    for (const next of weld.slice(1)) {
      const a = find(weld[0]), b = find(next);
      if (a !== b) parent[b] = a;
    }
    triangles.push({ offset, indices, weld });
  }
  const groups = new Map();
  for (let i = 0; i < points.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, { points: [], triangles: [] });
    groups.get(root).points.push(points[i]);
  }
  for (const triangle of triangles) groups.get(find(triangle.weld[0])).triangles.push(triangle);
  return [...groups.values()].map((group, componentIndex) => {
    const box = new THREE.Box3().setFromPoints(group.points);
    const expanded = group.triangles.flatMap(t => t.weld.flatMap(w => points[w].toArray()));
    return {
      triangles: group.triangles,
      selector: {
        mesh: mesh.name, componentIndex, weldedPoints: group.points.length,
        triangles: group.triangles.length, min: box.min.toArray(), max: box.max.toArray(),
        center: box.getCenter(new THREE.Vector3()).toArray(),
        positionTriangleSha256: sha256(Buffer.from(new Float64Array(expanded).buffer)),
      },
    };
  });
}

function attributeHash(geometry, offsets) {
  const chunks = [];
  for (const name of Object.keys(geometry.attributes).sort()) {
    chunks.push(Buffer.from(name));
    const attribute = geometry.attributes[name], values = [];
    for (const offset of offsets) for (let k = 0; k < 3; k++) {
      const i = geometry.index ? geometry.index.getX(offset + k) : offset + k;
      for (let field = 0; field < attribute.itemSize; field++) values.push(attribute.array[i * attribute.itemSize + field]);
    }
    chunks.push(Buffer.from(new attribute.array.constructor(values).buffer));
  }
  return sha256(Buffer.concat(chunks));
}

function assertIdentityAncestors(json, nodeIndex) {
  const visited = new Set();
  let current = nodeIndex;
  while (true) {
    assert(!visited.has(current), 'source hierarchy cycle');
    visited.add(current);
    const parents = json.nodes.map((node, index) => ({ node, index })).filter(({ node }) => node.children?.includes(current));
    if (!parents.length) break;
    assert.equal(parents.length, 1, 'one canonical parent');
    current = parents[0].index;
    const node = parents[0].node;
    assert(!node.matrix && !node.translation && !node.rotation && !node.scale, 'canonical parent remains identity');
  }
}

async function moveWholeNodes(json, operations, sourcePath) {
  const { scene } = await loadSource(sourcePath);
  const meshes = [];
  scene.traverse(node => { if (node.isMesh) meshes.push(node); });
  const original = structuredClone(json), selected = new Set();
  for (const operation of operations) {
    assert.equal(operation.kind, 'rigid-node-transform');
    const { nodeIndex, nodeName, meshIndex, meshDefinitionSha256, originalMatrix } = operation.selector;
    assert(!selected.has(nodeIndex), 'unique selected node');
    selected.add(nodeIndex);
    const node = json.nodes[nodeIndex];
    assert(node, 'selected source node exists');
    assert.equal(node.name, nodeName, 'node selector');
    assert.equal(node.mesh, meshIndex, 'mesh selector');
    assert.equal(sha256(Buffer.from(JSON.stringify(json.meshes[meshIndex]))), meshDefinitionSha256, 'mesh definition selector');
    const matches = meshes.filter(mesh => mesh.name === nodeName);
    assert.equal(matches.length, 1, 'one selected source mesh');
    const mesh = matches[0], parts = components(mesh);
    const bounds = new THREE.Box3().setFromObject(mesh);
    assert.equal(parts.reduce((total, part) => total + part.selector.triangles, 0), operation.selector.triangles, 'node triangle selector');
    assert.equal(parts.length, operation.selector.connectedComponents, 'node component selector');
    assert.deepEqual({ min: bounds.min.toArray(), max: bounds.max.toArray() }, operation.selector.bounds, 'node bounds selector');
    assertIdentityAncestors(json, nodeIndex);
    assert.deepEqual(node.matrix ?? null, originalMatrix ?? null, 'original node matrix');
    assert(!node.translation && !node.rotation && !node.scale, 'canonical selected node');
    const matrix = operation.matrix;
    assert.equal(matrix.length, 16);
    assert(matrix.every(Number.isFinite), 'finite assembly matrix');
    assert.deepEqual([matrix[3], matrix[7], matrix[11], matrix[15]], [0, 0, 0, 1]);
    const rotation = new THREE.Matrix4().fromArray(matrix);
    const cols = [0, 1, 2].map(i => new THREE.Vector3(matrix[i * 4], matrix[i * 4 + 1], matrix[i * 4 + 2]));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      assert(Math.abs(cols[i].dot(cols[j]) - (i === j ? 1 : 0)) < 1e-9, 'rigid orthonormal transform');
    }
    assert(Math.abs(rotation.determinant() - 1) < 1e-9, 'proper rigid transform');
    node.matrix = matrix;
  }
  const before = structuredClone(original), after = structuredClone(json);
  for (const i of selected) { delete before.nodes[i].matrix; delete after.nodes[i].matrix; }
  assert.deepEqual(before, after, 'only selected node matrices may change');
  return { onlySelectedNodeMatricesChange: true, nonselectedJsonSha256: sha256(Buffer.from(JSON.stringify(before))) };
}

async function editComponents(json, binary, sourcePath, operations) {
  const { scene } = await loadSource(sourcePath);
  const meshes = [];
  scene.traverse(node => { if (node.isMesh) meshes.push(node); });
  assert.equal(new Set(meshes.map(m => m.name)).size, meshes.length, 'unique source mesh names');
  const selected = selectComponentOperations(meshes, operations);
  const buffers = [binary];
  let length = binary.length;
  const append = (array, template) => {
    const pad = (4 - length % 4) % 4;
    if (pad) { buffers.push(Buffer.alloc(pad)); length += pad; }
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const view = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    buffers.push(bytes);
    length += bytes.length;
    const accessor = { ...template, bufferView: view, byteOffset: 0,
      count: array.length / ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[template.type]) };
    delete accessor.min; delete accessor.max;
    if (template.type === 'VEC3' && template.min) {
      accessor.min = [Infinity, Infinity, Infinity]; accessor.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < array.length; i++) {
        accessor.min[i % 3] = Math.min(accessor.min[i % 3], array[i]);
        accessor.max[i % 3] = Math.max(accessor.max[i % 3], array[i]);
      }
    }
    const index = json.accessors.length;
    json.accessors.push(accessor);
    return index;
  };
  const unchanged = [];
  let removedTriangles = 0, movedTriangles = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const offsets = Array.from({ length: (geometry.index?.count ?? geometry.attributes.position.count) / 3 }, (_, i) => i * 3);
    const row = selected.get(mesh.name);
    if (!row) {
      unchanged.push({ mesh: mesh.name, triangles: offsets.length, sha256: attributeHash(geometry, offsets) });
      continue;
    }
    assert.deepEqual(mesh.matrixWorld.toArray(), identity, 'canonical identity mesh');
    const nodeIndex = json.nodes.findIndex(n => n.name === mesh.name);
    const node = json.nodes[nodeIndex];
    assertIdentityAncestors(json, nodeIndex);
    assert(!node.matrix && !node.translation && !node.rotation && !node.scale);
    const primitives = json.meshes[node.mesh].primitives;
    assert.equal(primitives.length, 1);
    const primitive = primitives[0];
    assert.equal(primitive.mode ?? 4, 4);
    assert(!primitive.targets && !primitive.extensions, 'unsupported source attributes are not dropped');
    const changes = collectComponentChanges(row);
    const { moves, removed, changed } = changes;
    removedTriangles += changes.removedTriangles;
    movedTriangles += changes.movedTriangles;
    const keep = offsets.filter(offset => !removed.has(offset));
    const stable = offsets.filter(offset => !changed.has(offset));
    const stableSet = new Set(stable);
    const stableNew = keep.flatMap((offset, i) => stableSet.has(offset) ? [i * 3] : []);
    const used = new Set();
    for (const offset of keep) for (let k = 0; k < 3; k++) used.add(geometry.index ? geometry.index.getX(offset + k) : offset + k);
    const vertices = [...used].sort((a, b) => a - b);
    assert(vertices.length > 0, 'empty source meshes are not implicitly deleted');
    const mapping = new Map(vertices.map((original, i) => [original, i]));
    const output = new THREE.BufferGeometry();
    appendMovedAttributes(geometry, vertices, moves, output, primitive, json, append);
    const indices = new Uint32Array(keep.flatMap(offset => [0, 1, 2].map(k => mapping.get(geometry.index ? geometry.index.getX(offset + k) : offset + k))));
    output.setIndex(new THREE.BufferAttribute(indices, 1));
    primitive.indices = append(indices, { ...json.accessors[primitive.indices], componentType: 5125, type: 'SCALAR' });
    const before = attributeHash(geometry, stable), after = attributeHash(output, stableNew);
    assert.equal(before, after, 'unchanged expanded source attributes');
    unchanged.push({ mesh: mesh.name, triangles: stable.length, sha256: before });
  }
  json.buffers[0].byteLength = length;
  const bin = Buffer.concat(buffers);
  return { binary: Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]),
    proof: { removedTriangles, movedTriangles, unchanged, unchangedSha256: sha256(Buffer.from(JSON.stringify(unchanged))) } };
}

/** Build in memory, then verify expected bytes before any destination write. */
export async function replaySourceAssembly(recipe, { root = repoRoot } = {}) {
  assert.equal(recipe.schemaVersion, 1);
  assert(/^[a-z0-9_]+_x$/.test(recipe.id));
  const sourcePath = path.resolve(root, recipe.source.path);
  const bytes = fs.readFileSync(sourcePath);
  assert.equal(sha256(bytes), recipe.source.sha256, 'original canonical source hash');
  assert(recipe.operations?.length > 0, 'explicit source operations');
  const { json, chunks } = readGlb(bytes);
  let result, proof;
  if (recipe.operations.every(operation => operation.kind === 'rigid-node-transform')) {
    proof = await moveWholeNodes(json, recipe.operations, sourcePath);
    result = encodeGlb(json, chunks.slice(1));
    proof.binaryChunksByteExact = true;
  } else {
    assert.equal(chunks.length, 2, 'canonical JSON+BIN source');
    assert.equal(chunks[1].type, 0x004e4942);
    assert.equal(json.buffers.length, 1, 'one canonical buffer');
    const edited = await editComponents(json, chunks[1].data, sourcePath, recipe.operations);
    result = encodeGlb(json, [{ type: 0x004e4942, data: edited.binary }]);
    proof = edited.proof;
  }
  const actual = sha256(result);
  assert.equal(actual, recipe.output.sha256, 'assembled output hash');
  return { bytes: result, sha256: actual, proof };
}

export async function prepareRegisteredSourceAssembly(id, { root = repoRoot } = {}) {
  const entry = SUPPLIED_SOURCE_ASSEMBLIES[id];
  assert(entry, 'registered assembled source ID');
  const recipeBytes = fs.readFileSync(path.join(root, entry.recipePath));
  assert.equal(sha256(recipeBytes), entry.recipeSha256, 'approved source recipe hash');
  const recipe = JSON.parse(recipeBytes);
  assert.equal(recipe.id, id);
  assert.equal(recipe.authorization.independentReviewStatus, 'accepted-static-assembly');
  assert.equal(recipe.source.sha256, entry.originalSha256);
  assert.equal(recipe.source.rawSha256, entry.rawSha256);
  assert.equal(recipe.output.sha256, entry.sha256);
  const expected = `public${entry.path}`;
  assert.equal(recipe.output.path, expected);
  assert.equal(expected, `public/models/community-candidates/${id}_assembled_20260918.glb`);
  assert.notEqual(path.resolve(root, recipe.source.path), path.resolve(root, expected));
  const result = await replaySourceAssembly(recipe, { root });
  const target = path.join(root, expected);
  execFileSync('git', ['check-ignore', '--no-index', target], { cwd: root, stdio: 'pipe' });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) assert.equal(sha256(fs.readFileSync(target)), entry.sha256, 'existing derived source differs; preserve it before replacement');
  else fs.writeFileSync(target, result.bytes, { flag: 'wx' });
  return { id, source: recipe.source, output: { path: expected, sha256: result.sha256 }, proof: result.proof };
}

async function main() {
  const ids = process.argv.find(arg => arg.startsWith('--ids='))?.slice(6).split(',').filter(Boolean);
  if (!ids?.length) throw new Error('Usage: node tools/source-assembly-replay.mjs --ids=<comma-separated registered IDs>');
  for (const id of ids) console.log(JSON.stringify(await prepareRegisteredSourceAssembly(id)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();

function selectComponentOperations(meshes, operations) {
  const selected = new Map();
  for (const operation of operations) {
    assert(['translate-components', 'remove-components'].includes(operation.kind), 'known component operation');
    if (operation.kind === 'translate-components') {
      assert.equal(operation.translation.length, 3);
      assert(operation.translation.every(Number.isFinite), 'finite source translation');
    }
    for (const selector of operation.selectors) {
      const mesh = meshes.find(m => m.name === selector.mesh);
      assert(mesh, 'selected mesh exists');
      if (!selected.has(mesh.name)) selected.set(mesh.name, { mesh, components: components(mesh), operations: new Map() });
      const row = selected.get(mesh.name), component = row.components[selector.componentIndex];
      assert(component, 'selected component exists');
      assert.deepEqual(component.selector, selector, 'component selector drift');
      assert(!row.operations.has(selector.componentIndex), 'one operation per component');
      row.operations.set(selector.componentIndex, operation);
    }
  }
  return selected;
}

function collectComponentChanges(row) {
  let removedTriangles = 0, movedTriangles = 0;
    const moves = new Map(), removed = new Set(), changed = new Set();
    for (let i = 0; i < row.components.length; i++) {
      const operation = row.operations.get(i);
      if (!operation) continue;
      const triangles = row.components[i].triangles;
      for (const triangle of triangles) {
        changed.add(triangle.offset);
        if (operation.kind === 'remove-components') removed.add(triangle.offset);
        else for (const vertex of triangle.indices) moves.set(vertex, operation.translation);
      }
      if (operation.kind === 'remove-components') removedTriangles += triangles.length;
      else movedTriangles += triangles.length;
    }
  return { moves, removed, changed, removedTriangles, movedTriangles };
}

function appendMovedAttributes(geometry, vertices, moves, output, primitive, json, append) {
    for (const name of Object.keys(geometry.attributes)) {
      const attribute = geometry.attributes[name];
      const array = new attribute.array.constructor(vertices.length * attribute.itemSize);
      for (let i = 0; i < vertices.length; i++) {
        const old = vertices[i], translation = name === 'position' ? moves.get(old) : null;
        for (let k = 0; k < attribute.itemSize; k++) {
          const value = attribute.array[old * attribute.itemSize + k];
          array[i * attribute.itemSize + k] = translation ? value + translation[k] : value;
        }
      }
      output.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
      const semantic = { position: 'POSITION', normal: 'NORMAL', uv: 'TEXCOORD_0', color: 'COLOR_0' }[name];
      assert(semantic, 'unsupported source attribute');
      primitive.attributes[semantic] = append(array, json.accessors[primitive.attributes[semantic]]);
    }
}
