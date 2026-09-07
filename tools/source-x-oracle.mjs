// Local-only source inspection and uniform registration; never a runtime loader.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bounds = object => {
  const box = new THREE.Box3().setFromObject(object);
  return { min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new THREE.Vector3()).toArray() };
};

function prepareNodeLoaders() {
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  globalThis.self = globalThis;
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
    readAsDataURL(blob) { blob.arrayBuffer().then(value => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(value).toString('base64')}`;
      this.onloadend?.();
    }); }
  };
}

export async function loadSource(file) {
  prepareNodeLoaders();
  const bytes = fs.readFileSync(file);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ext = path.extname(file).toLowerCase();
  let scene;
  if (ext === '.glb') scene = (await new GLTFLoader().parseAsync(buffer, '')).scene;
  else if (ext === '.fbx') scene = new FBXLoader().parse(buffer, '');
  else if (ext === '.obj') scene = new OBJLoader().parse(bytes.toString());
  else throw new Error('Use an unpacked local GLB, FBX or OBJ; archives are not silently selected.');
  scene.updateMatrixWorld(true);
  return { scene, digest: sha256(bytes) };
}

function hierarchy(scene) {
  const rows = [];
  function visit(object, ancestors) {
    const route = [...ancestors, object.name || '(unnamed)'];
    if (object.isMesh) {
      const geometry = object.geometry;
      rows.push({ path: route.join('/'), name: object.name,
        triangles: (geometry.index?.count ?? geometry.attributes.position.count) / 3,
        bounds: bounds(object), matrixWorld: object.matrixWorld.toArray() });
    }
    for (const child of object.children) visit(child, route);
  }
  visit(scene, []);
  return rows;
}

/** A proper axis rotation and uniform scale only. No candidate-relative fit. */
export function recipeMatrix(recipe) {
  if (!/^[a-z0-9_]+_x$/.test(recipe.id)) throw new Error('Expected a stable X ID.');
  if (!/^[a-f0-9]{64}$/.test(recipe.sourceSha256)) throw new Error('Recipe must pin the raw source SHA-256.');
  if (!Number.isFinite(recipe.scale) || recipe.scale <= 0) throw new Error('Positive uniform scale required.');
  if (!Array.isArray(recipe.translation) || recipe.translation.length !== 3
    || !recipe.translation.every(Number.isFinite)) throw new Error('Translation must have three finite metres.');
  if (!Array.isArray(recipe.axes) || recipe.axes.length !== 3
    || !recipe.axes.every(axis => /^-?[xyz]$/.test(axis))) throw new Error('Expected three signed source axes.');
  if (new Set(recipe.axes.map(axis => axis.at(-1))).size !== 3) throw new Error('Source axes must form a permutation.');
  if ((recipe.includeRoots?.length || recipe.exactDuplicateMeshes?.length) && !recipe.selectionReason?.trim()) throw new Error('Source subset requires an explicit physical selection reason.');
  if (recipe.includeRoots?.length && recipe.exactDuplicateMeshes?.length) throw new Error('Cannot combine root selection with duplicate proof against unselected meshes.');
  const rows = recipe.axes.map(axis => ['x', 'y', 'z'].map(name => axis.at(-1) === name ? (axis[0] === '-' ? -1 : 1) : 0));
  const matrix = new THREE.Matrix4().set(...rows[0], 0, ...rows[1], 0, ...rows[2], 0, 0, 0, 0, 1);
  if (Math.abs(matrix.determinant() - 1) > 1e-9) throw new Error('Axis recipe must preserve handedness.');
  matrix.scale(new THREE.Vector3().setScalar(recipe.scale));
  matrix.setPosition(...recipe.translation);
  return matrix;
}

function selected(object, recipe) {
  if (recipe.exactDuplicateMeshes?.includes(object.name)) return false;
  if (!recipe.includeRoots?.length) return true;
  for (let node = object; node; node = node.parent) if (recipe.includeRoots.includes(node.name)) return true;
  return false;
}

/** Optional source export alternatives may be removed only when every one of
 * their WORLD triangles already exists in a retained original mesh. Partial
 * option meshes are permitted, unmatched geometry or transforms fail closed. */
export function verifyDuplicateOptions(scene, names = []) {
  if (!names.length) return;
  const excluded = [], retained = new Map(), found = new Set();
  scene.updateMatrixWorld(true);
  const triangles = object => {
    const p = object.geometry.attributes.position, index = object.geometry.index, rows = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      rows.push([0,1,2].map(k => v.fromBufferAttribute(p,index ? index.getX(i+k) : i+k)
        .applyMatrix4(object.matrixWorld).toArray().map(n=>Math.round(n*1e6)).join(',')).sort().join(';'));
    }
    return rows;
  };
  scene.traverse(object => {
    if (!object.isMesh) return;
    const rows = triangles(object);
    if (names.includes(object.name)) { excluded.push([object.name,rows]); found.add(object.name); }
    else for (const row of rows) retained.set(row,(retained.get(row)??0)+1);
  });
  if (new Set(names).size !== names.length || names.some(name=>!found.has(name))) throw new Error('Duplicate option names must be unique and identify original meshes');
  for (const [name, rows] of excluded) {
    const counts = new Map();
    for (const row of rows) counts.set(row,(counts.get(row)??0)+1);
    for (const [row,count] of counts) if ((retained.get(row)??0)<count) throw new Error(`Unmatched source triangle in duplicate option ${name}`);
  }
}

function ignoredTarget(target) {
  const absolute = path.resolve(repo, target);
  if (!absolute.startsWith(`${repo}${path.sep}`)) throw new Error('Evidence target must be quarantined inside the worktree.');
  execFileSync('git', ['check-ignore', '--no-index', absolute], { cwd: repo, stdio: 'pipe' });
  return absolute;
}

/** Baking a reflected source node must also reverse its triangle winding.
 * The renderer used the original determinant for front-face orientation; the
 * exported identity mesh no longer has that transform to compensate for it. */
export function bakeSourceGeometry(object, matrix) {
  const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld).applyMatrix4(matrix);
  for (const name of Object.keys(geometry.attributes)) if (name !== 'position') geometry.deleteAttribute(name);
  if (object.matrixWorld.determinant() < 0) {
    const index = geometry.index;
    const position = geometry.attributes.position;
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      if (index) {
        const b = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, b);
      } else {
        const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
        position.setXYZ(i + 1, position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));
        position.setXYZ(i + 2, b.x, b.y, b.z);
      }
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

async function canonicalScene(scene, recipe) {
  const matrix = recipeMatrix(recipe);
  verifyDuplicateOptions(scene, recipe.exactDuplicateMeshes);
  const output = new THREE.Group();
  output.name = `${recipe.id}_source_only`;
  const material = new THREE.MeshStandardMaterial({ color: 0x798167, roughness: .8, metalness: .1 });
  const omitted = [];
  scene.traverse(object => {
    if (!object.isMesh) return;
    if (!selected(object, recipe)) { omitted.push(object.name); return; }
    const geometry = bakeSourceGeometry(object, matrix);
    const mesh = new THREE.Mesh(geometry, material);
    // Preserve genuine source mesh identities; do not invent component owners.
    mesh.name = object.name;
    output.add(mesh);
  });
  if (!output.children.length) throw new Error('Source selection is empty.');
  return { output, omitted };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const index = arg.indexOf('=');
    return [arg.slice(0, index < 0 ? undefined : index), index < 0 ? true : arg.slice(index + 1)];
  }));
  if (args['--help'] || !(args['--inspect'] || args['--prepare'])) {
    console.log('node tools/source-x-oracle.mjs --inspect=<local.glb|fbx|obj> [--report=<ignored.json>]\n'
      + 'node tools/source-x-oracle.mjs --prepare=<local-file> --recipe=<json> [--report=<ignored.json>]');
    return;
  }
  const file = path.resolve(args['--prepare'] || args['--inspect']);
  const { scene, digest } = await loadSource(file);
  const report = { file, sourceSha256: digest, rawBounds: bounds(scene), meshes: hierarchy(scene) };
  if (args['--prepare']) {
    if (!args['--recipe']) throw new Error('Preparation requires a reviewed source-only recipe.');
    const recipe = JSON.parse(fs.readFileSync(args['--recipe'], 'utf8'));
    if (recipe.sourceSha256 !== digest) throw new Error('Raw source hash differs from the approved recipe.');
    const { output, omitted } = await canonicalScene(scene, recipe);
    const target = ignoredTarget(`public/models/community-candidates/${recipe.id}_source.glb`);
    const bytes = Buffer.from(await new GLTFExporter().parseAsync(output, { binary: true }));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    Object.assign(report, { recipe, omittedMeshes: omitted, canonicalBounds: bounds(output), target, canonicalSha256: sha256(bytes) });
  }
  if (args['--report']) {
    const target = ignoredTarget(args['--report']);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ report: target, ...report, meshes: `${report.meshes.length} source meshes; see report` }, null, 2));
  } else console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
