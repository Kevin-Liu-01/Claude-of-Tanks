import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { WebGLMaterials } from 'three/src/renderers/webgl/WebGLMaterials.js';
import { MAP_IDS } from './maps/index.ts';

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
    assert.ok(material[slot] === roof[role], `${slot}: exact existing texture owner`);
  }
  assert.equal(new Set(Object.values(material).filter(value => value?.isTexture)).size, 3);
  assert.equal(material.customProgramCacheKey(), baseline.customProgramCacheKey(), 'same shader variant');
  const uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms);
  refresh.refreshMaterialUniforms(uniforms, material, 1, 900);
  assert.equal(uniforms.roughness.value, gain, 'actual WebGL upload does not clamp the gain before map multiplication');
  assert.ok(uniforms.roughnessMap.value === roof.surface, 'actual upload retains the shared surface');
}

const baseline = new THREE.MeshStandardMaterial({ map: roof.albedo, normalMap: roof.normal,
  roughnessMap: roof.surface, aoMap: roof.surface, roughness: 1, metalness: 0 });
try {
  assert.equal(MAP_IDS.length, 33); // 2026-09-19: Mars (Olympus Basin) joins the catalog
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

// (building-tex-diet-278) the native-decode histogram of the sourced roof photograph's roughness under the gain went with
// the retired roof tiles set (Kevin 2026-11-25): no battlefield draws it. The gain itself, its material and upload, and
// the shader order it relies on are held above.
console.log(JSON.stringify({ test: 'foundryRoof', maps: MAP_IDS.length, gain: 1.3,
  scope: 'actual constructor/uniform/clone/serialization and the roughness shader order; no GPU visual or frame-cost acceptance' }));
