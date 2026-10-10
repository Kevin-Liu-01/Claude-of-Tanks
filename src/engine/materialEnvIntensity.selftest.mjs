// materialEnvIntensity.selftest — a lit material's own share of the sky's image-based light (2026-10-08, the world-ibl
// lane with the fleet lane). three 0.185 overwrites the envMapIntensity uniform of every standard, Lambert and Phong
// material that reads scene.environment with scene.environmentIntensity on every draw, so every authored trim in this
// project was dead (the vehicles' 0.5 / 0.25 / 0.1, every world trim). This receipt fails while they are.
// Pinned: the two three lines the binding rests on (setProgram's write through the uniform's value; WebGLMaterials' copy
// of the material's own value when it carries an envMap), in three's source and in the build the game ships; the
// binding (scene x material read at every upload, no recompile; the own-envMap case; an untrimmed material uploads what it
// did before; Lambert and Phong; idempotent; no shader text); and the cascade setup binding every material it registers,
// world and vehicle alike, while a hook that already scales its sky light in GLSL (the fleet's uVehEnvScale) is left alone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MATERIAL_ENV_INTENSITY_BOUND, bindMaterialEnvIntensity } from './materialEnvIntensity.ts';

// ---- three: the lines the binding rests on, in its source and in the shipped build (package exports: build/three.module.js)
const build = new URL(import.meta.resolve('three'));
assert.ok(build.pathname.endsWith('/build/three.module.js'), `the game imports three's module build (${build.pathname})`);
const threeFile = (rel) => readFileSync(new URL(`../${rel}`, build), 'utf8');
const OVERRIDE = /\(\s*\(\s*material\.isMeshStandardMaterial \|\| material\.isMeshLambertMaterial \|\| material\.isMeshPhongMaterial\s*\)\s*&&\s*material\.envMap === null\s*&&\s*scene\.environment !== null\s*\)\s*\{\s*m_uniforms\.envMapIntensity\.value = scene\.environmentIntensity;\s*\}/;
const OWN_COPY = /if \( material\.envMap \) \{\s*(?:\/\/[^\n]*\s*)?uniforms\.envMapIntensity\.value = material\.envMapIntensity;\s*\}/g;
for (const [file, materialsFile] of [['src/renderers/WebGLRenderer.js', 'src/renderers/webgl/WebGLMaterials.js'],
  ['build/three.module.js', 'build/three.module.js']]) {
  const renderer = threeFile(file);
  assert.ok(OVERRIDE.test(renderer),
    `${file}: setProgram writes scene.environmentIntensity through the envMapIntensity uniform's value for standard, Lambert and Phong materials without an envMap (the binding's setter keeps it; a three that replaces the object instead must rebind)`);
  assert.equal(renderer.match(/m_uniforms\.envMapIntensity\b/g)?.length, 1, `${file}: and touches that uniform nowhere else`);
  assert.equal(threeFile(materialsFile).match(OWN_COPY)?.length, 3,
    `${materialsFile}: Lambert, Phong and standard copy the material's own value only when it carries an envMap`);
}

// ---- the binding on a compiled program's uniforms
const compiled = (lib) => ({ uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib[lib].uniforms),
  vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader });
/** What three uploads after setProgram: its write (the scene's intensity), then the value the upload reads. */
const drawn = (shader, sceneIntensity) => {
  shader.uniforms.envMapIntensity.value = sceneIntensity;
  return shader.uniforms.envMapIntensity.value;
};
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: ${actual} vs ${expected}`);
{
  const rock = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  rock.envMapIntensity = 0.35;
  const shader = compiled('standard'), vertex = shader.vertexShader, fragment = shader.fragmentShader;
  assert.equal(bindMaterialEnvIntensity(shader, rock), true, 'a standard program binds its material');
  assert.equal(shader.vertexShader, vertex, 'no vertex shader text');
  assert.equal(shader.fragmentShader, fragment, 'no fragment shader text: the program is unchanged, nothing recompiles');
  assert.equal(shader.uniforms.envMapIntensity[MATERIAL_ENV_INTENSITY_BOUND], true, 'the bound uniform is marked');
  close(drawn(shader, 0.8), 0.8 * 0.35, 'the upload reads the scene\'s intensity times the material\'s');
  close(drawn(shader, 0.21), 0.21 * 0.35, 'and follows the scene (time of day, weather)');
  const version = rock.version;
  rock.envMapIntensity = 0.6;
  close(shader.uniforms.envMapIntensity.value, 0.21 * 0.6, 'the material\'s value is read at every upload');
  assert.equal(rock.version, version, 'no needsUpdate, no program change');
  rock.envMapIntensity = -1;
  assert.equal(shader.uniforms.envMapIntensity.value, 0, 'a negative trim takes no light rather than subtracting it');
  rock.envMapIntensity = Number.NaN;
  close(shader.uniforms.envMapIntensity.value, 0.21, 'a non-number falls back to the scene\'s intensity');
  assert.equal(bindMaterialEnvIntensity(shader, rock), false, 'binding twice is a no-op');
  // a material with its own envMap: three writes the material's own value (WebGLMaterials) and no scene override
  const glossy = new THREE.MeshStandardMaterial();
  glossy.envMap = new THREE.Texture();
  glossy.envMapIntensity = 0.4;
  const own = compiled('standard');
  bindMaterialEnvIntensity(own, glossy);
  close(drawn(own, glossy.envMapIntensity), 0.4, 'an own envMap takes its value once, not squared');
}
{
  // an untrimmed material uploads exactly what three wrote: byte-identical pixels
  const plaster = new THREE.MeshStandardMaterial();
  const shader = compiled('standard');
  bindMaterialEnvIntensity(shader, plaster);
  for (const v of [0, 0.21, 0.8, 1, 1.37]) assert.equal(drawn(shader, v), v, `untrimmed: ${v} passes through unchanged`);
}
for (const [lib, Material] of [['lambert', THREE.MeshLambertMaterial], ['phong', THREE.MeshPhongMaterial]]) {
  // three 0.185 lights Lambert and Phong from scene.environment too (their iblIrradiance), with the same override
  const material = new Material();
  material.envMapIntensity = 0.75;
  const shader = compiled(lib);
  assert.equal(bindMaterialEnvIntensity(shader, material), true, `${lib}: bound`);
  close(drawn(shader, 0.5), 0.375, `${lib}: scene x material`);
}
{
  const shader = { uniforms: { uTime: { value: 0 } }, vertexShader: '', fragmentShader: '' };
  assert.equal(bindMaterialEnvIntensity(shader, new THREE.ShaderMaterial()), false, 'a program without the uniform is left alone');
  assert.ok(!('envMapIntensity' in shader.uniforms), 'and gets none');
}

// ---- the cascade setup binds every lit material it registers
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { search: '' } };
const { createLighting } = await import('./lighting.ts');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
camera.position.set(0, 3, 0);
camera.lookAt(0, 2, 10);
camera.updateMatrixWorld();
const rig = createLighting(scene, camera, new THREE.Vector3(1, 0.7, 0.4).normalize());
rig.updateFrustums();
const register = (material, hook = null, lib = 'standard') => {
  rig.setupShadowMaterial(material, hook);
  const shader = compiled(lib);
  material.onBeforeCompile(shader, null);
  return shader;
};
{
  // a world trim (the props' boulders), through the same registration every world material takes
  const rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  rock.envMapIntensity = 0.35;
  let hooked = 0;
  const shader = register(rock, (s) => { hooked++; s.uniforms.uRockDetail = { value: null }; });
  assert.equal(hooked, 1, 'the material\'s own hook still runs');
  close(drawn(shader, 0.8), 0.28, 'setupShadowMaterial: a world material takes its authored share of the sky light');
  // a world material that authors nothing keeps the scene's (the terrain, the buildings)
  const terrain = new THREE.MeshStandardMaterial({ roughness: 1 });
  assert.equal(drawn(register(terrain), 0.8), 0.8, 'an untrimmed world material is unchanged');
  // a Lambert card (the grass) registers the same way
  const grass = new THREE.MeshLambertMaterial();
  grass.envMapIntensity = 0.5;
  close(drawn(register(grass, null, 'lambert'), 0.6), 0.3, 'a Lambert registration is bound too');
  // a vehicle material registered with the fleet's readability hook (no GLSL scale of its own): bound like the world's
  const paint = new THREE.MeshStandardMaterial();
  paint.envMapIntensity = 0.5;
  const vehicleHook = (s) => { s.uniforms.uVehicleReadabilityScale = { value: 1 }; };
  close(drawn(register(paint, vehicleHook), 0.8), 0.4, 'a vehicle material takes its trim through the same binding');
  // transitional: a hook that already scales its sky light in GLSL (the fleet's uVehEnvScale) is not scaled twice
  const scaled = new THREE.MeshStandardMaterial();
  scaled.envMapIntensity = 0.5;
  const glslScaled = register(scaled, (s) => { s.uniforms.uVehEnvScale = { value: 0.5 }; });
  assert.equal(glslScaled.uniforms.envMapIntensity[MATERIAL_ENV_INTENSITY_BOUND], undefined, 'a GLSL-scaled hook keeps three\'s uniform');
  assert.equal(drawn(glslScaled, 0.8), 0.8, 'so its trim applies once, in its own GLSL');
  // each registration binds its own material (clones registered separately carry their own trims)
  const clone = rock.clone();
  clone.envMapIntensity = 0.9;
  close(drawn(register(clone), 0.8), 0.72, 'a clone registered on its own reads its own trim');
  close(drawn(shader, 0.8), 0.28, 'and the source keeps its own');
}
console.log('materialEnvIntensity.selftest: three\'s override and own-envMap lines pinned (source and build), scene x material read live with no shader text, own envMap, untrimmed unchanged, Lambert/Phong, the cascade setup binding world and vehicle materials, GLSL-scaled hooks left alone PASS');
