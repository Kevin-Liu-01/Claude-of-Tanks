import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { WebGLMaterials } from 'three/src/renderers/webgl/WebGLMaterials.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { MAP_IDS } from './maps/index.ts';
import { composeSurface } from './sourcedTextures.ts';
import { resolveDeviceTier, texSize } from '../engine/quality.ts';

// Execute the actual private constructor without building a battlefield or
// exposing a production test API. The real props bucket must call it too.
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('props.ts', source, ts.ScriptTarget.Latest, true);
const constructor = ast.statements.find(node => ts.isFunctionDeclaration(node)
  && node.name?.text === 'makeRoofMaterial');
assert.ok(constructor, 'actual roof material constructor exists');
let bound = 0;
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'roof'
    && node.initializer.getText(ast) === 'makeRoofMaterial(roofT, mapId)') bound++;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(bound, 1, 'the production roof bucket uses this constructor exactly once');
const code = ts.transpileModule(constructor.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
let materialCount = 0;
const countingThree = { ...THREE, MeshStandardMaterial: class extends THREE.MeshStandardMaterial {
  constructor(parameters) { super(parameters); materialCount++; }
} };
const makeRoofMaterial = new Function('THREE', `${code}; return makeRoofMaterial;`)(countingThree);
const roof = Object.fromEntries(['albedo', 'normal', 'surface'].map(role => [role, new THREE.Texture()]));
roof.albedo.colorSpace = THREE.SRGBColorSpace;
const refresh = WebGLMaterials({}, { get: () => ({}) });
const textureTable = Object.fromEntries(Object.values(roof).map(texture => [texture.uuid, texture]));
const loader = new THREE.MaterialLoader().setTextures(textureTable);
const serial = material => {
  const { uuid, ...json } = material.toJSON();
  return json;
};
function assertMaterial(material, baseline, gain) {
  assert.equal(material.roughness, gain, 'only the declared map receives roughness gain');
  assert.deepEqual(serial(material), { ...serial(baseline), roughness: gain },
    'all other actual material properties and texture descriptors stay exact');
  assert.deepEqual(Object.keys(material), Object.keys(baseline), 'no added retained material field');
  for (const [slot, role] of Object.entries({ map: 'albedo', normalMap: 'normal', roughnessMap: 'surface', aoMap: 'surface' })) {
    assert.equal(material[slot], roof[role], `${slot}: exact existing texture owner`);
  }
  assert.equal(new Set(Object.values(material).filter(value => value?.isTexture)).size, 3);
  assert.equal(material.customProgramCacheKey(), baseline.customProgramCacheKey(), 'same shader variant');
  const uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms);
  refresh.refreshMaterialUniforms(uniforms, material, 1, 900);
  assert.equal(uniforms.roughness.value, gain, 'actual WebGL upload does not clamp the gain before map multiplication');
  assert.equal(uniforms.roughnessMap.value, roof.surface, 'actual upload retains the shared surface');
}

const baseline = new THREE.MeshStandardMaterial({ map: roof.albedo, normalMap: roof.normal,
  roughnessMap: roof.surface, aoMap: roof.surface, roughness: 1, metalness: 0 });
try {
  assert.equal(MAP_IDS.length, 30);
  for (const id of MAP_IDS) {
    const before = materialCount;
    const material = makeRoofMaterial(roof, id);
    assert.equal(materialCount - before, 1, `${id}: one existing material owner`);
    const clone = material.clone(), restored = loader.parse(material.toJSON());
    try {
      const gain = id === 'foundry' ? 1.3 : 1;
      for (const copy of [material, clone, restored]) assertMaterial(copy, baseline, gain);
    } finally { material.dispose(); clone.dispose(); restored.dispose(); }
  }
  const wrong = makeRoofMaterial(roof, 'copper_mesa');
  try {
    wrong.roughness = 1.3;
    assert.throws(() => assertMaterial(wrong, baseline, 1), /declared map/, 'Copper inheritance leak is caught');
    wrong.roughness = 1;
    wrong.roughnessMap = roof.normal;
    assert.throws(() => assertMaterial(wrong, baseline, 1), /properties|owner/, 'surface ownership regression is caught');
  } finally { wrong.dispose(); }
} finally {
  baseline.dispose();
  Object.values(roof).forEach(texture => texture.dispose());
}

// Protect the dependency behavior this >1 map gain relies on, not its entire
// source text. A scalar-only clamp before multiplication would change the art.
function assertShaderOrder(roughness, physical) {
  const init = roughness.indexOf('roughnessFactor = roughness;');
  const multiply = roughness.indexOf('roughnessFactor *= texelRoughness.g;');
  assert.ok(init >= 0 && multiply > init, 'map G multiplies the original scalar');
  assert.doesNotMatch(roughness.slice(init, multiply), /clamp\s*\(|min\s*\(/, 'no early scalar clamp');
  const minimum = physical.indexOf('material.roughness = max( roughnessFactor, 0.0525 );');
  const geometry = physical.indexOf('material.roughness += geometryRoughness;');
  const maximum = physical.indexOf('material.roughness = min( material.roughness, 1.0 );');
  assert.ok(minimum >= 0 && geometry > minimum && maximum > geometry, 'physical roughness clamps after map and geometry');
}
assertShaderOrder(THREE.ShaderChunk.roughnessmap_fragment, THREE.ShaderChunk.lights_physical_fragment);
assert.throws(() => assertShaderOrder(THREE.ShaderChunk.roughnessmap_fragment.replace(
  'roughnessFactor = roughness;', 'roughnessFactor = roughness; roughnessFactor = min(roughnessFactor, 1.0);'),
THREE.ShaderChunk.lights_physical_fragment), /early scalar clamp/);
assert.throws(() => assertShaderOrder(THREE.ShaderChunk.roughnessmap_fragment.replace('texelRoughness.g', 'texelRoughness.r'),
  THREE.ShaderChunk.lights_physical_fragment), /map G/);

// Native JPEG decode and the real linear AO/G compositor, at both supported
// texture sizes. Histogram measures the map response with geometryRoughness=0;
// it is not an observed GPU highlight or a guarantee against distant AA loss.
const tier = process.argv.includes('--tier=mobile') ? 'mobile' : 'desktop';
const saved = new Map(['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
try {
  globalThis.window = { location: { search: `?tier=${tier}` }, localStorage: { getItem: () => null } };
  globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
  assert.equal(resolveDeviceTier(), tier);
  const roughImage = await loadImage(readFileSync(new URL('../../public/textures/buildings/RoofingTiles012A_1K-JPG_Roughness.jpg', import.meta.url)));
  const size = Math.min(roughImage.width, texSize(1024));
  const surface = composeSurface(null, roughImage, size);
  const data = surface.getContext('2d').getImageData(0, 0, size, size).data;
  const histogram = new Uint32Array(256);
  for (let at = 0; at < data.length; at += 4) histogram[data[at + 1]]++;
  const count = size * size;
  let accumulated = 0, clipped = 0;
  const percentiles = {};
  for (let value = 0; value < 256; value++) {
    accumulated += histogram[value];
    if (value / 255 * 1.3 >= 1) clipped += histogram[value];
    for (const percentile of [0.05, 0.5, 0.95]) {
      if (percentiles[percentile] === undefined && accumulated >= count * percentile) percentiles[percentile] = value / 255;
    }
  }
  assert.ok(clipped / count < .25, 'at least three quarters of actual roof pixels retain unsaturated roughness variation');
  assert.ok(percentiles[0.5] * 1.3 < 1, 'the median roof response is not flattened to full roughness');
  assert.equal(data.byteLength, size * size * 4, 'unchanged existing surface dimensions');
  console.log(JSON.stringify({ test: 'foundryRoof', tier, maps: MAP_IDS.length, size,
    histogram: [...histogram], originalPercentiles: percentiles,
    effectivePercentiles: Object.fromEntries(Object.entries(percentiles).map(([p, value]) => [p, Math.min(1, Math.max(.0525, value * 1.3))])),
    gain: 1.3, clippedPixels: clipped, clippedFraction: clipped / count,
    scope: 'actual constructor/uniform/clone/serialization and native JPEG histogram; no GPU visual or frame-cost acceptance' }));
} finally {
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
