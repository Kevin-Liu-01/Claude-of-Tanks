// Export an immutable historical first-party comparison, never a runtime asset.
// A clean detached snapshot is mandatory: the current candidate cannot certify
// itself by being exported as its own oracle. See leopard-revolution-source.md.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const snapshot = path.resolve(option('snapshot') || '.');
const commit = option('commit');
const sourceId = option('id');
const output = option('output');
assert.match(commit || '', /^[0-9a-f]{40}$/, '--commit must pin the full immutable source commit');
assert.ok(sourceId && output, '--id and --output are required');
const git = (...args) => execFileSync('git', ['-C', snapshot, ...args], { encoding: 'utf8' }).trim();
assert.equal(git('rev-parse', 'HEAD'), commit, 'snapshot HEAD must match the pinned commit');
assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'tracked snapshot must be clean');
assert.notEqual(snapshot, process.cwd(), 'export must use an independent historical snapshot');

// GLTFExporter needs only Blob readers after geometry/material-only conversion.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); });
  }
};
const options = { camoSeed: 4242, quality: 'high', proceduralOnly: true, materialMode: 'geometry-only' };
const { createTank } = await import(pathToFileURL(path.join(snapshot, 'src/vehicles/tankFactory.ts')));
const original = createTank(sourceId, null, options);
const visible = (object) => {
  for (let node = object; node; node = node.parent) if (!node.visible || /shadow/i.test(node.name)) return false;
  return true;
};
// This physical triangle receipt ignores material/ID labels, but includes every
// visible surface and instance in its unchanged world/articulation frame.
function geometryReceipt(root) {
  root.updateMatrixWorld(true);
  const rows = [];
  const vertex = new THREE.Vector3();
  const instance = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  root.traverse((object) => {
    if (!object.isMesh || !visible(object)) return;
    const positions = object.geometry.getAttribute('position');
    const index = object.geometry.index;
    let owner = 'hull';
    for (let node = object; node; node = node.parent) {
      if (node.name === 'rig_gun') { owner = 'gun'; break; }
      if (node.name === 'rig_turret') { owner = 'turret'; break; }
    }
    for (let n = 0; n < (object.isInstancedMesh ? object.count : 1); n++) {
      world.copy(object.matrixWorld);
      if (object.isInstancedMesh) { object.getMatrixAt(n, instance); world.multiply(instance); }
      const hash = createHash('sha256');
      hash.update(owner);
      for (let i = 0; i < (index?.count ?? positions.count); i++) {
        vertex.fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(world);
        hash.update(vertex.toArray().map((v) => Math.round(v * 1e6)).join(',') + ';');
      }
      rows.push(hash.digest('hex'));
    }
  });
  return { geometrySha256: createHash('sha256').update(rows.sort().join('\n')).digest('hex'), meshInstances: rows.length };
}
const baselineReceipt = geometryReceipt(original.root);
if (option('candidate-id')) {
  const candidateFactory = await import(pathToFileURL(path.resolve('src/vehicles/tankFactory.ts')));
  const candidate = candidateFactory.createTank(option('candidate-id'), null, options);
  const candidateReceipt = geometryReceipt(candidate.root);
  candidate.dispose();
  assert.deepEqual(candidateReceipt, baselineReceipt, 'candidate geometry must exactly preserve the historical triangles at 1 micrometre precision');
}
const neutral = new THREE.MeshStandardMaterial({ color: 0x66745d, roughness: 0.88, metalness: 0.1 });
function exportTree(object) {
  if (!visible(object)) return null;
  // Expand GPU instances into ordinary static meshes so the baseline has no
  // runtime animation/shader dependency and the comparison sees every wheel.
  const copy = object.isMesh && !object.isInstancedMesh
    ? new THREE.Mesh(object.geometry, neutral) : new THREE.Group();
  copy.name = object.name === 'rig_turret' ? 'preserved_turret'
    : object.name === 'rig_gun' ? 'preserved_gun' : object.name;
  copy.position.copy(object.position);
  copy.quaternion.copy(object.quaternion);
  copy.scale.copy(object.scale);
  if (object.isInstancedMesh) {
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < object.count; index++) {
      const mesh = new THREE.Mesh(object.geometry, neutral);
      mesh.name = `${object.name}_instance_${index}`;
      object.getMatrixAt(index, matrix);
      matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      copy.add(mesh);
    }
  }
  for (const child of object.children) {
    const exported = exportTree(child);
    if (exported) copy.add(exported);
  }
  return copy;
}
const tree = exportTree(original.root);
tree.name = 'first_party_preservation_baseline';
const binary = await new GLTFExporter().parseAsync(tree, { binary: true, onlyVisible: true });
const bytes = Buffer.from(binary);
const receipt = { comparisonPurpose: 'preservation', sourceCommit: commit, sourceId,
  ...baselineReceipt, glbSha256: createHash('sha256').update(bytes).digest('hex'),
  buildOptions: options, bounds: new THREE.Box3().setFromObject(tree),
  notice: 'Historical first-party geometry preservation only; not real-world source fidelity.' };
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(output, bytes);
await fs.writeFile(`${output}.json`, JSON.stringify(receipt, null, 2) + '\n');
original.dispose();
console.log(JSON.stringify(receipt, null, 2));
