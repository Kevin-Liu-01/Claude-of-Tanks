// programVariants.ts (2026-10-16, the perf lane): a material drawn under two program variants gets a prototype twin
// for the second, which reads the original live and renders with the original's program for that variant.
// 1. The variant is exactly the object terms of three's needsProgramChange (read from three's own setProgram source).
// 2. The split: the plain variant keeps the original, the others get one twin each (shared across objects), material
//    arrays split per slot, a second pass changes nothing.
// 3. The twin: the original's id, uuid, maps, colours, defines, hooks and program key read through, live; an
//    original.needsUpdate bumps the twin's version, a twin's own needsUpdate only the twin's; disposing the original
//    disposes the twin (three's release of the twin's program).
// 4. The wiring: map.ts splits the assembled world once, after its last material patch at assembly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { programVariantOf, programVariantOrigin, splitProgramVariants } from './programVariants.ts';

// ---- 1. the object terms of needsProgramChange
const require = createRequire(import.meta.url);
const rendererSource = readFileSync(require.resolve('three/src/renderers/WebGLRenderer.js'), 'utf8');
const start = rendererSource.indexOf('let needsProgramChange = false;');
const block = rendererSource.slice(start, rendererSource.indexOf('let program = materialProperties.currentProgram;', start));
assert.ok(start > 0 && block.length > 200, 'three\'s needsProgramChange block');
const objectTerms = new Set([...block.matchAll(/object\.(\w+)/g)].map((m) => m[1]));
assert.deepEqual([...objectTerms].sort(), ['colorTexture', 'instanceColor', 'isBatchedMesh', 'isInstancedMesh', 'isSkinnedMesh', 'morphTexture'].sort(),
  `the object terms three re-resolves on (a new term needs a place in programVariantOf): ${[...objectTerms].join(', ')}`);
for (const term of ['vertexAlphas', 'vertexTangents', 'morphTargets', 'morphNormals', 'morphColors', 'morphTargetsCount']) {
  assert.ok(block.includes(`materialProperties.${term}`), `three still re-resolves on ${term}`);
}
const box = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshStandardMaterial({ color: 0x806040 });
assert.equal(programVariantOf(new THREE.Mesh(box, mat), mat), '');
const pool = new THREE.InstancedMesh(box, mat, 4);
assert.equal(programVariantOf(pool, mat), 'i');
pool.setColorAt(0, new THREE.Color(1, 1, 1));
assert.equal(programVariantOf(pool, mat), 'ic', 'instance colours are another variant');
const rgba = box.clone(); rgba.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(rgba.attributes.position.count * 4), 4));
assert.equal(programVariantOf(new THREE.Mesh(rgba, mat), mat), '', 'four-component colours count only under vertexColors');
const vc = new THREE.MeshStandardMaterial({ vertexColors: true });
assert.equal(programVariantOf(new THREE.Mesh(rgba, vc), vc), 'a');

// ---- 2. the split
const root = new THREE.Group();
const shared = new THREE.MeshStandardMaterial({ color: 0x406080, roughness: 0.7 });
shared.name = 'bucket';
shared.onBeforeCompile = (shader) => { shader.fragmentShader = '// hook\n' + shader.fragmentShader; };
shared.customProgramCacheKey = () => 'bucket-v1';
const merged = new THREE.Mesh(box, shared);
const poolA = new THREE.InstancedMesh(box, shared, 8), poolB = new THREE.InstancedMesh(box, shared, 8);
const coloured = new THREE.InstancedMesh(box, shared, 8); coloured.setColorAt(0, new THREE.Color(1, 0.5, 0.5));
const other = new THREE.MeshStandardMaterial();
const multi = new THREE.InstancedMesh(box, [shared, other], 2);
const alone = new THREE.InstancedMesh(box, other, 2);
root.add(merged, poolA, poolB, coloured, multi, alone);
const first = splitProgramVariants(root);
assert.deepEqual(first, { materials: 2, split: 1, twins: 2, objects: 4 }, JSON.stringify(first));
assert.ok(merged.material === shared, 'the plain variant keeps the original');
assert.ok(poolA.material !== shared);
assert.ok(poolA.material === poolB.material, 'one twin per variant, shared by its objects');
assert.ok(multi.material[0] === poolA.material, 'a material array splits per slot');
assert.ok(coloured.material !== poolA.material, 'instance colours have their own twin');
assert.ok(programVariantOrigin(poolA.material) === shared);
assert.ok(programVariantOrigin(shared) === shared);
// `other`: drawn instanced only by `alone` and `multi` — one variant, but its plain variant is absent: kept on the most
assert.ok(alone.material === other);
assert.ok(multi.material[1] === other);
assert.deepEqual(splitProgramVariants(root), { materials: 4, split: 0, twins: 0, objects: 0 }, 'a second pass changes nothing');

// ---- 3. the twin reads the original, live
const twin = poolA.material;
assert.ok(Object.getPrototypeOf(twin) === shared, 'the twin\'s prototype is the original');
assert.equal(twin.id, shared.id, 'the original\'s id: the render lists sort as before');
assert.equal(twin.uuid, shared.uuid);
assert.equal(twin.name, 'bucket');
assert.equal(twin.customProgramCacheKey(), 'bucket-v1', 'the original\'s program key');
assert.equal(twin.onBeforeCompile, shared.onBeforeCompile, 'the original\'s hook (wrapped once to share its uniforms)');
assert.ok(twin.isMeshStandardMaterial && twin instanceof THREE.MeshStandardMaterial);
shared.color.setHex(0x112233);
assert.equal(twin.color.getHex(), 0x112233, 'a colour change reaches the twin');
const map = new THREE.Texture();
shared.map = map;
assert.ok(twin.map === map, 'a new map reaches the twin');
shared.defines = { ...(shared.defines ?? {}), COT_TEST: '' };
assert.ok('COT_TEST' in twin.defines, 'new defines reach the twin');
const priorKey = shared.customProgramCacheKey;
shared.customProgramCacheKey = () => priorKey() + '|patched';
assert.equal(twin.customProgramCacheKey(), 'bucket-v1|patched', 'a later patch of the original reaches the twin');
const v0 = shared.version, t0 = twin.version;
shared.needsUpdate = true;
assert.equal(twin.version, t0 + 1, 'an original.needsUpdate recompiles the twin');
twin.needsUpdate = true;
assert.equal(twin.version, t0 + 2);
assert.equal(shared.version, v0 + 1, 'a twin\'s own needsUpdate leaves the original');
shared.needsUpdate = true;
assert.equal(twin.version, t0 + 3, 'and the original\'s next one still reaches it');
// one uniform map for every program of the original and its twins (three's getProgram: the hook, then its uniforms)
{
  const p1 = { uniforms: { a: { value: 1 } }, fragmentShader: '', vertexShader: '' };
  const p2 = { uniforms: { a: { value: 2 }, b: { value: 3 } }, fragmentShader: '', vertexShader: '' };
  shared.onBeforeCompile(p1, null);
  twin.onBeforeCompile(p2, null);
  assert.equal(p2.uniforms, p1.uniforms, 'the twin\'s program keeps the original\'s uniform map');
  assert.equal(p1.uniforms.a.value, 1, 'the first program\'s objects stay');
  assert.equal(p1.uniforms.b.value, 3, 'a uniform a later program adds joins the map');
}
// a material without its own program key keeps its hook's source as its key (three's default)
{
  const plain = new THREE.MeshStandardMaterial();
  plain.onBeforeCompile = function (shader) { shader.vertexShader += '// plain hook'; };
  const keyBefore = plain.customProgramCacheKey();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(box, plain), new THREE.InstancedMesh(box, plain, 2));
  splitProgramVariants(g);
  assert.equal(plain.customProgramCacheKey(), keyBefore, 'the key three derived from the hook is unchanged');
  const later = function (shader) { shader.vertexShader += '// a later hook'; };
  plain.onBeforeCompile = later;
  assert.equal(plain.customProgramCacheKey(), later.toString(), 'a later hook keys as three would');
}
let released = 0;
twin.addEventListener('dispose', () => { released++; });
assert.equal(shared._listeners?.dispose?.length ?? 0, 2, 'the twins keep their own listeners (the original holds one forward per twin)');
shared.dispose();
assert.equal(released, 1, 'disposing the original disposes the twin');

// ---- 4. the wiring
const mapSource = readFileSync(new URL('../world/map.ts', import.meta.url), 'utf8');
assert.match(mapSource, /import \{ splitProgramVariants \} from '\.\.\/engine\/programVariants\.ts';/);
assert.match(mapSource, /const programVariants = splitProgramVariants\(props\.group\);/, 'the assembled world\'s props are split once (their hooks keep no uniform map of their own)');

console.log('programVariants.selftest: the variant is three\'s needsProgramChange object terms; the plain variant keeps the material, every other variant one live prototype twin (id, key, hooks, maps, defines, versions and disposal through the original); a second pass changes nothing');
