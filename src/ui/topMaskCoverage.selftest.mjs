// topMaskCoverage.selftest.mjs — the top-down mask passes draw coverage-only stand-ins (2026-10-12, the MP lane).
//
// Program counts come from three's own WebGLPrograms (getParameters + getProgramCacheKey) under the mask pass's
// conditions: a light-less scene, no shadows, an offscreen render target. A tank-like hierarchy of ~19 distinct real
// materials (physical/standard/lambert, maps, shader hooks, ordinary/instanced/batched, front/double-sided) must link
// at most MAX_MASK_PROGRAMS programs, and every stand-in keeps exactly the inputs that decide alpha and depth.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLPrograms } from 'three/src/renderers/webgl/WebGLPrograms.js';
import { applyTopMaskCoverage, topMaskCoverageMaterial } from './topMaskCoverage.ts';

/**
 * Stand-in programs for one tank's two mask passes: the opaque stand-in once per side and mesh kind (here front:
 * ordinary, instanced, batched; double: ordinary, instanced) plus one per alpha class (cutout, glass, vertex-alpha
 * decal). Materials a stand-in cannot reproduce keep their own programs on top of these.
 */
const MAX_MASK_PROGRAMS = 8;

const target = new THREE.WebGLRenderTarget(384, 384);
const renderer = {
  getRenderTarget: () => target,
  state: { buffers: { depth: { getReversed: () => false } } },
  shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
  outputColorSpace: THREE.SRGBColorSpace,
  toneMapping: THREE.ACESFilmicToneMapping,
  localClippingEnabled: false,
};
const programs = new WebGLPrograms(renderer, { get: () => null }, { has: () => true },
  { logarithmicDepthBuffer: false, reversedDepthBuffer: false, precision: 'highp', getMaxPrecision: (p) => p,
    vertexTextures: true, floatVertexTextures: true, maxVertexUniforms: 1024 },
  {}, { numPlanes: 0, numIntersection: 0 });
const lights = { directional: [], point: [], spot: [], spotLightMap: [], rectArea: [], hemi: [], directionalShadowMap: [],
  pointShadowMap: [], spotShadowMap: [], numSpotLightShadowsWithMaps: 0, numLightProbes: 0 };
const scene = new THREE.Scene();
const parametersOf = (material, object) => programs.getParameters(material, lights, [], scene, object, []);
const programKey = (material, object) => programs.getProgramCacheKey(parametersOf(material, object));

function programKeys(root) {
  const keys = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of [object.material].flat()) keys.add(programKey(material, object));
  });
  return keys;
}

const canvasTexture = (name) => { const texture = new THREE.Texture(); texture.name = name; return texture; };
const geometry = new THREE.BoxGeometry(1, 1, 1);

/** A built vehicle's material mix: every real material is its own program in the old mask pass. */
function tankLike(tag) {
  const root = new THREE.Group();
  root.name = tag;
  const hull = new THREE.Group(); hull.name = 'rig_hull'; root.add(hull);
  const turret = new THREE.Group(); turret.name = 'rig_turret'; root.add(turret);
  const real = [];
  for (let index = 0; index < 16; index++) {
    const Material = index % 3 === 0 ? THREE.MeshPhysicalMaterial : index % 3 === 1 ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
    const material = new Material({ color: 0x405030 + index, side: index % 4 === 3 ? THREE.DoubleSide : THREE.FrontSide });
    material.name = `${tag}:paint-${index}`;
    if (index % 2 === 0) material.map = canvasTexture(`${tag}-camo-${index}`);
    if (index % 5 === 0 && 'normalMap' in material) material.normalMap = canvasTexture(`${tag}-normal-${index}`);
    // Shader hooks (CSM, cloud shade, wear) make each material its own program variant.
    const hookKey = `${tag}-hook-${index}`;
    material.onBeforeCompile = (shader) => { shader.fragmentShader = `// ${hookKey}\n${shader.fragmentShader}`; };
    material.customProgramCacheKey = () => hookKey;
    real.push(material);
    const parent = index < 10 ? hull : turret;
    if (index % 7 === 1) {
      const instanced = new THREE.InstancedMesh(geometry, material, 4);
      instanced.setColorAt(0, new THREE.Color(0x222222));
      parent.add(instanced);
    } else if (index % 7 === 2) {
      const batch = new THREE.BatchedMesh(2, 48, 72, material);
      batch.addInstance(batch.addGeometry(geometry));
      parent.add(batch);
    } else {
      parent.add(new THREE.Mesh(geometry, material));
    }
  }
  // Alpha-relevant classes: a cutout net (map alpha + alphaTest), glass (transparent opacity), a decal with vertex alpha.
  const net = new THREE.MeshStandardMaterial({ map: canvasTexture(`${tag}-net`), alphaTest: 0.5, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.35, depthWrite: false });
  const decal = new THREE.MeshStandardMaterial({ transparent: true, vertexColors: true, alphaMap: canvasTexture(`${tag}-decal`) });
  const decalGeometry = new THREE.PlaneGeometry(1, 1);
  decalGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(16).fill(0.5), 4));
  turret.add(new THREE.Mesh(geometry, net));
  turret.add(new THREE.Mesh(geometry, glass));
  hull.add(new THREE.Mesh(decalGeometry, decal));
  // A depth-only occluder (colorWrite:false) and a multi-material mesh.
  const occluder = new THREE.MeshStandardMaterial({ colorWrite: false });
  hull.add(new THREE.Mesh(geometry, occluder));
  const multiGeometry = geometry.clone();
  hull.add(new THREE.Mesh(multiGeometry, [real[0], real[3]]));
  // Coverage a stand-in cannot reproduce keeps the real material.
  const shader = new THREE.ShaderMaterial({ vertexShader: 'void main(){gl_Position=vec4(0.);}', fragmentShader: 'void main(){gl_FragColor=vec4(1.);}' });
  const displaced = new THREE.MeshStandardMaterial({ displacementMap: canvasTexture(`${tag}-displace`), displacementScale: 0.2 });
  const transmissive = new THREE.MeshPhysicalMaterial({ transmission: 1 });
  hull.add(new THREE.Mesh(geometry, shader));
  hull.add(new THREE.Mesh(geometry, displaced));
  turret.add(new THREE.Mesh(geometry, transmissive));
  root.updateMatrixWorld(true);
  return { root, real, net, glass, decal, occluder, shader, displaced, transmissive };
}

function snapshotMaterials(root) {
  const rows = [];
  root.traverse((object) => { if (object.isMesh) rows.push([object, object.material]); });
  return rows;
}

let checks = 0;
const check = (name, body) => { body(); checks++; console.log(`ok ${name}`); };

const first = tankLike('alpha');
const before = snapshotMaterials(first.root);
const oldKeys = programKeys(first.root);
const restore = applyTopMaskCoverage(first.root);
const newKeys = programKeys(first.root);

check('a tank-like mask pass links at most MAX_MASK_PROGRAMS stand-in programs, far fewer than its real materials', () => {
  assert.ok(oldKeys.size >= 22, `the fixture reproduces the old per-material programs (${oldKeys.size})`);
  const kept = new Set([first.shader, first.displaced, first.transmissive]);
  const standInKeys = new Set();
  const keptKeys = new Set();
  first.root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of [object.material].flat()) (kept.has(material) ? keptKeys : standInKeys).add(programKey(material, object));
  });
  assert.ok(standInKeys.size <= MAX_MASK_PROGRAMS, `coverage stand-ins link ${standInKeys.size} programs (limit ${MAX_MASK_PROGRAMS})`);
  assert.equal(newKeys.size, standInKeys.size + keptKeys.size);
  assert.equal(keptKeys.size, 3, 'each kept material keeps exactly its own program');
});

check('every opaque real material shares one stand-in per side and raster state, whatever its type, maps or hooks', () => {
  const front = first.real.filter((material) => material.side === THREE.FrontSide).map(topMaskCoverageMaterial);
  const double = first.real.filter((material) => material.side === THREE.DoubleSide).map(topMaskCoverageMaterial);
  assert.equal(new Set(front).size, 1);
  assert.equal(new Set(double).size, 1);
  assert.notStrictEqual(front[0], double[0]);
  for (const standIn of [front[0], double[0]]) {
    assert.ok(standIn instanceof THREE.MeshBasicMaterial);
    assert.equal(standIn.map, null, 'an opaque pass writes alpha 1 everywhere: no texture is sampled');
    assert.equal(standIn.transparent, false);
    assert.equal(standIn.alphaTest, 0);
  }
  assert.equal(front[0].side, THREE.FrontSide);
  assert.equal(double[0].side, THREE.DoubleSide);
});

check('each stand-in decides alpha exactly as its source: OPAQUE, alpha test, vertex alpha, maps', () => {
  first.root.traverse((object) => {
    if (!object.isMesh) return;
    const index = before.findIndex(([mesh]) => mesh === object);
    const sources = [before[index][1]].flat();
    const standIns = [object.material].flat();
    sources.forEach((source, slot) => {
      const standIn = standIns[slot];
      if (standIn === source) return;
      const a = parametersOf(source, object);
      const b = parametersOf(standIn, object);
      for (const field of ['opaque', 'alphaTest', 'alphaHash', 'alphaToCoverage', 'vertexAlphas', 'doubleSided', 'flipSided',
        'instancing', 'batching', 'skinning', 'morphTargets', 'premultipliedAlpha']) {
        assert.equal(b[field], a[field], `${source.name || source.type}: ${field}`);
      }
      if (!a.opaque || a.alphaTest) {
        assert.equal(b.map, a.map, `${source.name || source.type}: map alpha`);
        assert.equal(b.alphaMap, a.alphaMap, `${source.name || source.type}: alphaMap`);
        assert.strictEqual(standIn.map, source.map ?? null);
        assert.strictEqual(standIn.alphaMap, source.alphaMap ?? null);
        assert.equal(standIn.opacity, source.opacity);
      }
      for (const field of ['side', 'visible', 'colorWrite', 'depthWrite', 'depthTest', 'depthFunc', 'forceSinglePass',
        'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'blending']) {
        assert.equal(standIn[field], source[field], `${source.name || source.type}: ${field}`);
      }
    });
  });
});

check('a depth-only occluder stays a depth-only occluder', () => {
  const standIn = topMaskCoverageMaterial(first.occluder);
  assert.equal(standIn.colorWrite, false);
  assert.equal(standIn.depthWrite, true);
  assert.notStrictEqual(standIn, topMaskCoverageMaterial(first.real[1]), 'colour-writing meshes never share it');
});

check('coverage a stand-in cannot reproduce keeps the real material', () => {
  for (const material of [first.shader, first.displaced, first.transmissive]) {
    assert.strictEqual(topMaskCoverageMaterial(material), material);
  }
  const stencil = new THREE.MeshStandardMaterial({ stencilWrite: true });
  assert.strictEqual(topMaskCoverageMaterial(stencil), stencil);
  assert.strictEqual(topMaskCoverageMaterial(new THREE.LineBasicMaterial()) instanceof THREE.LineBasicMaterial, true);
});

check('restore puts back every original material and material array', () => {
  restore();
  assert.deepEqual(snapshotMaterials(first.root).map(([mesh, material]) => [mesh.uuid, material]),
    before.map(([mesh, material]) => [mesh.uuid, material]));
  assert.notStrictEqual(snapshotMaterials(first.root).find(([, material]) => Array.isArray(material)), undefined);
});

check('a second tank reuses the shared stand-ins: no new opaque program keys', () => {
  const second = tankLike('bravo');
  const restoreSecond = applyTopMaskCoverage(second.root);
  const secondKeys = programKeys(second.root);
  const fresh = [...secondKeys].filter((key) => !newKeys.has(key));
  // Only the kept materials (their own shader hooks/textures differ per tank) may add keys.
  assert.ok(fresh.length <= 3, `new keys for the second tank: ${fresh.length}`);
  assert.strictEqual(topMaskCoverageMaterial(second.real[0]), topMaskCoverageMaterial(first.real[0]));
  restoreSecond();
});

check('alpha stand-ins follow their source between passes and die with it', () => {
  const standIn = topMaskCoverageMaterial(first.glass);
  first.glass.opacity = 0.6;
  const swapped = new THREE.Texture();
  first.net.map = swapped;
  assert.strictEqual(topMaskCoverageMaterial(first.glass), standIn, 'one stand-in per alpha source');
  assert.equal(standIn.opacity, 0.6);
  assert.strictEqual(topMaskCoverageMaterial(first.net).map, swapped);
  let disposed = 0;
  standIn.addEventListener('dispose', () => disposed++);
  first.glass.dispose();
  assert.equal(disposed, 1, 'disposing the source releases its stand-in');
  assert.notStrictEqual(topMaskCoverageMaterial(first.glass), standIn, 'a reused source gets a fresh stand-in');
});

check('a failing traversal leaves no mesh on a stand-in', () => {
  const third = tankLike('charlie');
  const rows = snapshotMaterials(third.root);
  const poison = new THREE.Mesh(geometry, first.real[1]);
  Object.defineProperty(poison, 'material', { get: () => { throw new Error('poisoned material'); }, configurable: true });
  third.root.add(poison);
  assert.throws(() => applyTopMaskCoverage(third.root), /poisoned material/);
  for (const [mesh, material] of rows) assert.strictEqual(mesh.material, material);
});

console.log(`topMaskCoverage.selftest: ${checks} checks; mask passes link ${newKeys.size} programs instead of ${oldKeys.size}`);
