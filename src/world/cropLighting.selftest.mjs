import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

// Source-owned material/chaining and ideal cosine checks, not a Canvas/GPU
// render or proof of final scene brightness. Existing crop raster tests own
// the painter, alpha/mip input, seeded placement and terrain-support policy.
const propsSource = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const lightingSource = readFileSync(new URL('../engine/lighting.ts', import.meta.url), 'utf8');
function declaration(source, name, method = false) {
  const tree = ts.createSourceFile('owner.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches = [];
  function visit(node) {
    if ((method ? ts.isMethodDeclaration(node) : ts.isFunctionDeclaration(node))
      && node.name?.getText(tree) === name) matches.push(node.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(matches.length, 1, `unambiguous actual ${name} owner`);
  return matches[0];
}
const replaceSource = declaration(propsSource, '_mustReplace');
const hookSource = declaration(propsSource, 'cropAttributeNormal');
const finalizeSource = declaration(propsSource, 'finalizeCropFields');
const setupSource = declaration(lightingSource, 'setupShadowMaterial', true);
const createSetup = new Function('csm', 'buildCoverageMipmaps',
  `${stripTypeScriptTypes(`const owner = { ${setupSource} };`)}\nreturn owner.setupShadowMaterial;`);
function cropApi(group, engineCtx, finalize = finalizeSource, three = THREE) {
  return new Function('THREE', 'mergeGeometries', 'group', 'engineCtx',
    `${stripTypeScriptTypes(`${replaceSource}\n${hookSource}\n${finalize}`)}
      return { finalizeCropFields, cropAttributeNormal };`)(three, mergeGeometries, group, engineCtx);
}
function fixtureRow(z) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -2, .02, z, -2, 1.1, z, 2, .02, z, 2, 1.2, z,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1.6, 0, 1.6, 1], 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([
    .95, .95, .95, .95, .95, .95, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05,
  ], 3));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  return geometry;
}

function fixture(finalize = finalizeSource) {
  const group = new THREE.Group(), rows = [fixtureRow(0), fixtureRow(2.7)];
  // Existing-image stand-in: actual setup wrapper, recording mip-builder port.
  const image = { width: 256, height: 256, data: new Uint8Array([126, 110, 66, 23, 174, 153, 102, 255]) };
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  const originalPixels = image.data.slice(), mipCalls = [];
  const originalRows = Object.fromEntries(['position', 'uv', 'color'].map(name =>
    [name, new Float32Array(rows.flatMap(row => [...row.attributes[name].array]))]));
  // Real CSM setup/compile, supplying owner inputs without shadow lights/WebGL.
  const csm = Object.assign(Object.create(CSM.prototype), { cascades: 3, fade: false,
    camera: { near: .5, far: 1000 }, maxFar: 800, breaks: [.1, .4, 1], shaders: new Map() });
  const setup = createSetup({ setupMaterial(material) {
    csm.setupMaterial(material);
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      assert.ok(shader.fragmentShader.includes('#include <normal_fragment_begin>'),
        'actual setup wrapper must run CSM before the crop hook');
      compile(shader, renderer);
    };
  } }, (map, cutoff) => mipCalls.push([map, cutoff]));
  const api = cropApi(group, { setupShadowMaterial: setup }, finalize);
  api.finalizeCropFields(texture, rows);
  const mesh = group.children[0];
  return { group, rows, texture, image, originalPixels, originalRows, mipCalls, csm, setup, mesh,
    dispose() {
      mesh?.geometry.dispose(); mesh?.material.dispose(); texture.dispose();
      for (const row of rows) row.dispose();
      group.clear(); csm.shaders.clear();
    } };
}

function assertContract(f) {
  assert.equal(f.group.children.length, 1, 'one existing merged crop draw owner');
  const { mesh, texture } = f, material = mesh.material;
  assert.ok(material instanceof THREE.MeshStandardMaterial);
  for (const [key, value] of Object.entries({ alphaTest: .42, alphaToCoverage: true,
    side: THREE.DoubleSide, vertexColors: true, roughness: 1, metalness: 0,
    envMapIntensity: .5, transparent: false, opacity: 1, depthTest: true, depthWrite: true,
    flatShading: false, normalMap: null, bumpMap: null })) assert.equal(material[key], value, key);
  assert.equal(material.color.getHex(), 0xffffff);
  assert.equal(material.emissive.getHex(), 0);
  assert.strictEqual(material.map, texture);
  assert.deepEqual(Object.values(material).filter(value => value?.isTexture), [texture],
    'one retained texture, no extra normal/environment sampler owner');
  assert.equal(material.customProgramCacheKey(), 'world-crop-authored-normal-v1');
  assert.deepEqual(material.defines, { STANDARD: '', USE_CSM: 1, CSM_CASCADES: 3 });
  assert.deepEqual(f.mipCalls, [[texture, .42]], 'same coverage builder and alpha cutoff');
  assert.strictEqual(texture.source.data, f.image);
  assert.deepEqual(f.image.data, f.originalPixels, 'finalization does not repaint RGB or alpha');
  assert.deepEqual([texture.colorSpace, texture.wrapS, texture.anisotropy,
    texture.image.width, texture.image.height], [THREE.SRGBColorSpace, THREE.RepeatWrapping, 4, 256, 256]);
  assert.equal(mesh.name, 'crop-fields');
  assert.deepEqual([mesh.castShadow, mesh.receiveShadow, mesh.matrixAutoUpdate], [false, false, false]);
  assert.deepEqual(mesh.userData, { aoExclude: true });
  assert.deepEqual(Object.keys(mesh.geometry.attributes).sort(), ['color', 'normal', 'position', 'uv']);
  for (const name of ['position', 'uv', 'color']) {
    assert.deepEqual(mesh.geometry.attributes[name].array, f.originalRows[name], `original merged ${name} bytes`);
  }
  assert.deepEqual(mesh.geometry.index.array, new Uint16Array([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7]));
  assert.deepEqual(mesh.geometry.attributes.normal.array,
    new Float32Array(Array.from({ length: 8 }, () => [0, 1, 0]).flat()), 'unchanged authored up normals');
  const bytes = Object.values(mesh.geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0)
    + mesh.geometry.index.array.byteLength;
  assert.equal(bytes, 376, 'same two-row attribute/index allocation');
}

const include = '#include <normal_fragment_begin>', flip = 'normal *= faceDirection;';
const stock = THREE.ShaderChunk.normal_fragment_begin;
const parts = stock.split(flip);
assert.equal(parts.length, 2, 'stock shader owns exactly one normal-facing inversion');
const expectedChunk = parts[0] + parts[1];
const originalFragment = THREE.ShaderLib.standard.fragmentShader;
assert.equal(originalFragment.split(include).length, 2);
const expectedFragment = originalFragment.replace(include, expectedChunk);

function compile(f, fragmentShader = originalFragment) {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader, uniforms: {} };
  f.mesh.material.onBeforeCompile(shader, {});
  return shader;
}
function assertShader(shader) {
  assert.equal(shader.fragmentShader, expectedFragment,
    'all stock shader bytes preserved except expansion with the one faulty normal flip removed');
  assert.equal(shader.vertexShader, THREE.ShaderLib.standard.vertexShader, 'vertex transform is untouched');
}

const f = fixture();
try {
  assertContract(f);
  const shader = compile(f);
  assertShader(shader);
  assert.strictEqual(f.csm.shaders.get(f.mesh.material), shader, 'real CSM retains the patched shader owner');
  assert.deepEqual(shader.uniforms.CSM_cascades.value.map(v => v.toArray()), [[0, .1], [.1, .4], [.4, 1]]);
  assert.equal(shader.uniforms.cameraNear.value, .5); assert.equal(shader.uniforms.shadowFar.value, 800);
  assert.deepEqual(Object.keys(shader.uniforms).sort(), ['CSM_cascades', 'cameraNear', 'shadowFar']);
  const unrelated = new THREE.MeshStandardMaterial();
  try {
    f.setup(unrelated, () => {});
    assert.notEqual(f.mesh.material.customProgramCacheKey(), unrelated.customProgramCacheKey(),
      'crop shader cannot alias a different hook captured by the same engine wrapper');
  } finally { unrelated.dispose(); }
  // Test both required anchors independently of the CSM order assertion.
  const hook = cropApi(null, null).cropAttributeNormal;
  assert.throws(() => hook({ fragmentShader: originalFragment.replace(include, '') }),
    /shader anchor missing/, 'missing include cannot silently leave broken normals');
  const changedThree = { ...THREE, ShaderChunk: { ...THREE.ShaderChunk,
    normal_fragment_begin: parts.join('') } };
  assert.throws(() => cropApi(null, null, finalizeSource, changedThree).cropAttributeNormal({
    fragmentShader: originalFragment,
  }), /shader anchor missing/, 'changed stock facing statement requires explicit review');
  assert.throws(() => assertShader({ ...shader, fragmentShader: expectedFragment.replace(
    'vec3 normal = normalize( vNormal );', 'vec3 normal = vec3( 0.0, 1.0, 0.0 );') }),
  /stock shader bytes/, 'hard-coded view-space up cannot replace transformed normals');
  for (const [key, value] of [['alphaTest', .2], ['side', THREE.FrontSide], ['flatShading', true]]) {
    const before = f.mesh.material[key];
    f.mesh.material[key] = value;
    assert.throws(() => assertContract(f), new RegExp(key), `changed ${key} is not a lighting-only fix`);
    f.mesh.material[key] = before;
  }
  const normals = f.mesh.geometry.attributes.normal.array;
  normals[1] = -1;
  assert.throws(() => assertContract(f), /authored up normals/);
  normals[1] = 1;
} finally { f.dispose(); }

const missingHook = finalizeSource.replace('setupShadowMaterial(cropMat, cropAttributeNormal)',
  'setupShadowMaterial(cropMat)');
assert.notEqual(missingHook, finalizeSource);
const oldFacing = fixture(missingHook);
try { assert.throws(() => assertShader(compile(oldFacing)), /stock shader bytes/,
  'the actual historical unpatched material fails'); }
finally { oldFacing.dispose(); }

// Ideal incidence in several view frames, not fragment/GPU measurement.
for (const elevation of [17, 38, 60]) {
  const a = elevation * Math.PI / 180;
  const sun = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
  for (const [pitch, yaw] of [[0, 0], [.45, 1.2], [-.3, -2.1]]) {
    const view = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, 0));
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(view);
    const light = sun.clone().transformDirection(view);
    const incidence = Math.max(0, normal.dot(light));
    assert.ok(Math.abs(incidence - Math.sin(a)) < 1e-12);
    assert.equal(Math.max(0, normal.clone().negate().dot(light)), 0,
      'old backface inversion loses direct sun; removing it preserves the positive front-face incidence');
  }
}
console.log('cropLighting.selftest: actual crop finalizer, stock-minus-flip shader, CSM/cache, fixed resources and CPU incidence passed');
