// Round 77c (2026-09-26): the horizon ring's forest drawn from the battlefield's impostor atlas
// (horizonForestImpostors.ts, bound by map.ts after the vegetation builds). On the real seeded ring and vegetation of
// Nordhavn Fjord (three species, the elevated ring), Verdant (four species, none) and Saltmere Bay with a recording
// renderer: the binding leaves the ring's packed placements byte-identical and redraws every placement as one quad on
// the vegetation's atlas — the species by class from the rim mix (conifer placements draw the mix's conifers, broadleaf
// placements its broadleaves, each in the mix's proportions), the near variant from the placement's tone, the mirror
// from its variant — at the rim trees' mean stature (the ring's own size spread kept); the near class's lobe pools stay
// as shadow-only casters at that stature and the band / range lobes and the lobe material are disposed; the material
// samples the far tier's albedo and normal atlases through the same program text as the far tier's quads and lights
// through the far tier's wrap, translucency and sky fill plus the ring's haze law; the binding is idempotent and a ring
// without packed placements is left alone. No GPU, no art claim.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { buildHorizonRing } from './maps/horizon.ts';
import { HORIZON_FOREST_PLACEMENT_STRIDE } from './horizonVista.ts';
import {
  HORIZON_FOREST_IMPOSTOR_PROGRAM_KEY, HORIZON_FOREST_IMPOSTOR_SKY_FILL, HORIZON_FOREST_IMPOSTOR_THIN, HORIZON_FOREST_IMPOSTOR_WRAP,
  bindHorizonForestImpostors, horizonForestImpostorPick, horizonForestImpostorVariant, resolveHorizonForestClassMix,
} from './horizonForestImpostors.ts';
import { TREE_IMPOSTOR_ALPHA_TEST } from './treeImpostors.ts';
import { TREE_ARCHETYPES } from './treeSpecies.ts';
import { SHADOW_ONLY_LAYER } from '../engine/renderLayers.ts';
import { getMapConfig } from './maps/index.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
globalThis.ImageData = ImageData;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };

const renderer = {
  getRenderTarget: () => null, setRenderTarget() {}, render() {}, clear() {}, getClearColor: target => target,
  getClearAlpha: () => 1, setClearColor() {}, autoClear: true, shadowMap: { autoUpdate: true }, xr: { enabled: false },
};
const STRIDE = HORIZON_FOREST_PLACEMENT_STRIDE;
const standard = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader });
const isConifer = species => TREE_ARCHETYPES[species]?.family === 'conifer';

const receipts = [];
try {
  for (const id of ['fjord', 'verdant', 'coastal']) {
    const cfg = getMapConfig(id), field = createHeightField(1337, cfg);
    const hooks = new Map();
    const engine = { renderer, setupShadowMaterial(material, hook) { hooks.set(material, hook); } };
    const ring = buildHorizonRing(engine, cfg, 1337, field);
    const forest = ring.getObjectByName('horizon-forest');
    assert.ok(forest, `${id}: the ring forest`);
    const record = forest.userData.horizonForest;
    assert.ok(record.placements instanceof Float32Array && record.placements.length === record.instances * STRIDE, `${id}: the packed placements`);
    assert.ok(record.tone && record.tone.fog.length === 3 && record.tone.haze > 0 && record.tone.maxHeight > 1, `${id}: the tone terms`);
    const packedBefore = Buffer.from(record.placements.buffer.slice(0));
    const lobePools = forest.children.filter(child => child.userData.horizonForestPool);
    assert.equal(lobePools.length, forest.children.length, `${id}: every pool tagged`);
    const lobeMaterial = lobePools[0].material;
    let lobeMaterialDisposed = 0;
    lobeMaterial.addEventListener('dispose', () => { lobeMaterialDisposed++; });
    const lobeHeights = new Map(lobePools.map(pool => [`${pool.userData.horizonForestPool.conifer}/${pool.userData.horizonForestPool.detail}/${pool.userData.horizonForestPool.variant}`, pool.userData.horizonForestPool.treeHeight]));
    const world = createVegetation(field, engine, 2001, cfg);
    const library = world._treeImpostors;
    assert.ok(library && world._rimTreeHeightM > 5 && world._rimTreeHeightM < 30, `${id}: the rim stature (${world._rimTreeHeightM})`);
    const released = [];
    assert.ok(world._rimTreeTint.every(c => c > 0.3 && c < 1.0), `${id}: the rim tint is a real darkening (${world._rimTreeTint.map(c => c.toFixed(3))})`);
    const receipt = bindHorizonForestImpostors(forest, {
      library, rimMix: world._rimMix, rimTreeHeightM: world._rimTreeHeightM, rimTreeTint: world._rimTreeTint,
      setupMaterial: (material, hook) => hooks.set(material, hook), releaseMaterial: material => released.push(material),
    });
    assert.ok(receipt, `${id}: bound`);
    assert.strictEqual(forest.userData.horizonForestImpostors, receipt);
    // the placements are the ring's
    assert.ok(packedBefore.equals(Buffer.from(record.placements.buffer)), `${id}: the packed placements are byte-identical after binding`);
    assert.equal(receipt.instances, record.instances);
    const impostorMeshes = forest.children.filter(child => child.userData.horizonForestImpostor);
    assert.equal(impostorMeshes.reduce((sum, mesh) => sum + mesh.count, 0), record.instances, `${id}: one quad per placement`);
    assert.equal(receipt.draws, impostorMeshes.length);
    assert.equal(Object.values(receipt.species).reduce((sum, n) => sum + n, 0), record.instances);
    // the assignment law: species by class from the rim mix, the variant from the tone, the mirror from the ring's variant,
    // the stature from the rim
    const librarySpecies = [...new Set(library.rows.map(row => row.species))];
    const classMix = [resolveHorizonForestClassMix(world._rimMix, librarySpecies, false), resolveHorizonForestClassMix(world._rimMix, librarySpecies, true)];
    for (const mix of classMix) assert.ok(Math.abs(mix.reduce((sum, [, w]) => sum + w, 0) - 1) < 1e-9, 'the class mix is normalised');
    const packed = record.placements, count = record.instances;
    const byKey = new Map();
    for (let i = 0; i < count; i++) byKey.set(`${packed[i * STRIDE].toFixed(3)},${packed[i * STRIDE + 2].toFixed(3)}`, i);
    let ringLobeSum = 0, ringScaleSum = 0;
    for (let i = 0; i < count; i++) {
      const o = i * STRIDE;
      const conifer = packed[o + 5] > 0.5, detail = packed[o + 9], variant = packed[o + 6];
      ringLobeSum += lobeHeights.get(`${conifer}/${detail}/${detail === 2 ? variant : -1}`) * packed[o + 3];
      ringScaleSum += packed[o + 3];
    }
    const ringLobeHeightM = ringLobeSum / count, ringScaleMean = ringScaleSum / count;
    assert.ok(Math.abs(receipt.stature.ringLobeHeightM - ringLobeHeightM) < 1e-6 && receipt.stature.rimTreeHeightM === world._rimTreeHeightM
      && Math.abs(receipt.stature.ratio - world._rimTreeHeightM / ringLobeHeightM) < 1e-9, `${id}: the stature law`);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    const seen = new Set();
    const classCounts = [{}, {}];
    let heightSum = 0;
    for (const mesh of impostorMeshes) {
      const { species, mirror } = mesh.userData.horizonForestImpostor;
      const cell = mesh.geometry.getAttribute('aImpCell');
      assert.equal(cell.getX(0), library.rowBase(species)); assert.equal(cell.getY(0), mirror ? 1 : 0); assert.equal(cell.getZ(0), library.variants);
      assert.equal(cell.getW(0), library.elevated ? library.groundRows + librarySpecies.indexOf(species) : -1, `${id}: the elevated row rides on the ring's quads too`);
      assert.strictEqual(mesh.material, forest.userData.horizonForestImpostorMaterial);
      assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false); assert.equal(mesh.frustumCulled, false); assert.equal(mesh.userData.aoExclude, true);
      const rows = mesh.geometry.getAttribute('aImpRow');
      for (let j = 0; j < mesh.count; j++) {
        mesh.getMatrixAt(j, matrix);
        matrix.decompose(position, quaternion, scale);
        const i = byKey.get(`${position.x.toFixed(3)},${position.z.toFixed(3)}`);
        assert.ok(i !== undefined && !seen.has(i), `${id}: every quad stands on one ring placement`);
        seen.add(i);
        const o = i * STRIDE, conifer = packed[o + 5] > 0.5;
        const expectedSpecies = (() => { const u = horizonForestImpostorPick(packed[o], packed[o + 2]); let acc = 0; const mix = classMix[conifer ? 1 : 0]; for (const [sp, w] of mix) { acc += w; if (u < acc) return sp; } return mix[mix.length - 1][0]; })();
        assert.equal(species, expectedSpecies, `${id}: the species by class from the rim mix`);
        assert.equal(mirror, packed[o + 6] > 0.5, `${id}: the mirror from the ring's variant`);
        const variant = horizonForestImpostorVariant(packed[o + 7], library.variants);
        assert.equal(rows.array[j], variant, `${id}: the near variant from the tone`);
        const row = library.rows[library.rowBase(species) + variant];
        const expectedScale = (packed[o + 3] / ringScaleMean) * ringLobeHeightM * receipt.stature.ratio / row.heightM;
        assert.ok(Math.abs(scale.y - expectedScale) < 1e-4 && Math.abs(scale.x - scale.y) < 1e-6, `${id}: the stature scale`);
        assert.ok(Math.abs(position.y - packed[o + 1]) < 1e-4, `${id}: the ring's own height`);
        const c = mesh.instanceColor;
        for (let k = 0; k < 3; k++) assert.ok(Math.abs(c.array[j * 3 + k] - packed[o + 7] * world._rimTreeTint[k]) < 1e-4, `${id}: the quad's colour is its ring tone × the rim tint`);
        heightSum += scale.y * row.heightM;
        classCounts[conifer ? 1 : 0][species] = (classCounts[conifer ? 1 : 0][species] ?? 0) + 1;
      }
    }
    assert.equal(seen.size, count);
    assert.ok(Math.abs(heightSum / count - world._rimTreeHeightM) < world._rimTreeHeightM * 0.02, `${id}: the ring's mean tree height is the rim's (${(heightSum / count).toFixed(2)} vs ${world._rimTreeHeightM.toFixed(2)})`);
    for (const conifer of [0, 1]) {
      const total = Object.values(classCounts[conifer]).reduce((sum, n) => sum + n, 0);
      for (const [species, weight] of classMix[conifer]) {
        assert.equal(isConifer(species), classMix[conifer].every(([sp]) => isConifer(sp) === !!conifer) ? !!conifer : isConifer(species));
        if (total >= 500) assert.ok(Math.abs((classCounts[conifer][species] ?? 0) / total - weight) < 0.05, `${id}: ${species} at its rim share (${((classCounts[conifer][species] ?? 0) / total).toFixed(3)} vs ${weight.toFixed(3)})`);
      }
    }
    // the lobes: the near class as shadow-only casters at the impostors' stature, the rest disposed
    const proxies = forest.children.filter(child => child.userData.horizonForestShadowProxy);
    assert.equal(proxies.length, receipt.shadowProxies);
    assert.equal(proxies.length, lobePools.filter(pool => pool.userData.horizonForestPool.detail === 2).length, `${id}: every near pool kept as a proxy`);
    for (const proxy of proxies) {
      assert.ok(proxy.layers.isEnabled(SHADOW_ONLY_LAYER) && proxy.userData.shadowOnly && proxy.castShadow && !proxy.receiveShadow, `${id}: shadow-only`);
      assert.equal(proxy.material.colorWrite, false); assert.equal(proxy.material.depthWrite, false);
      proxy.getMatrixAt(0, matrix); matrix.decompose(position, quaternion, scale);
      const i = byKey.get(`${position.x.toFixed(3)},${position.z.toFixed(3)}`);
      assert.ok(i !== undefined, `${id}: the proxy stands on its placement`);
      const quad = impostorMeshes.find(mesh => { for (let j = 0; j < mesh.count; j++) { mesh.getMatrixAt(j, matrix); if (Math.abs(matrix.elements[12] - position.x) < 1e-3 && Math.abs(matrix.elements[14] - position.z) < 1e-3) return true; } return false; });
      assert.ok(quad, `${id}: the proxy's placement has its quad`);
    }
    assert.equal(forest.children.filter(child => child.userData.horizonForestPool && child.userData.horizonForestPool.detail !== 2).length, 0, `${id}: the band and range lobes are gone`);
    assert.equal(forest.children.length, proxies.length + impostorMeshes.length);
    assert.deepEqual(released, [lobeMaterial]); assert.equal(lobeMaterialDisposed, 1, `${id}: the lobe material released and disposed`);
    // the material: the far tier's atlases through the far tier's program text, the far tier's lighting law, the ring's haze
    const material = forest.userData.horizonForestImpostorMaterial;
    assert.strictEqual(material.map, library.albedo.texture);
    assert.equal(material.customProgramCacheKey(), HORIZON_FOREST_IMPOSTOR_PROGRAM_KEY);
    assert.equal(material.alphaTest, TREE_IMPOSTOR_ALPHA_TEST); assert.equal(material.alphaToCoverage, true); assert.equal(material.side, THREE.DoubleSide);
    assert.equal(material.envMapIntensity, HORIZON_FOREST_IMPOSTOR_SKY_FILL); assert.equal(material.envMapIntensity, library.material.envMapIntensity, `${id}: the far tier's sky fill`);
    const ringShader = standard(), farShader = standard();
    hooks.get(material)(ringShader); hooks.get(library.material)(farShader);
    assert.strictEqual(ringShader.uniforms.uImpNormal.value, library.normal.texture); assert.strictEqual(ringShader.uniforms.uImpRows.value, farShader.uniforms.uImpRows.value);
    const block = (source, from, to) => { const a = source.indexOf(from), b = source.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return source.slice(a, b); };
    assert.equal(block(ringShader.vertexShader, 'float impRow = aImpCell.x', 'vImpFE = impView'), block(farShader.vertexShader, 'float impRow = aImpCell.x', 'vImpFE = impView'), `${id}: the same billboard text as the far tier`);
    assert.equal(block(ringShader.fragmentShader, 'vec4 impA = texture2D', 'diffuseColor *= impC;'), block(farShader.fragmentShader, 'vec4 impA = texture2D', 'diffuseColor *= impC;'));
    assert.equal(block(ringShader.fragmentShader, 'vec3 impN0 = texture2D', 'nonPerturbedNormal = normal;'), block(farShader.fragmentShader, 'vec3 impN0 = texture2D', 'nonPerturbedNormal = normal;'));
    const wrap = `( canopyRawNL + ${HORIZON_FOREST_IMPOSTOR_WRAP.toFixed(2)} )`, thin = `canopyBack * ${HORIZON_FOREST_IMPOSTOR_THIN.toFixed(2)}`;
    for (const source of [ringShader.fragmentShader, farShader.fragmentShader]) { assert.ok(source.includes(wrap) && source.includes(thin) && source.includes('canopyDiffuseNL * 0.70 + 0.075'), `${id}: the matte wrap and translucency`); }
    assert.ok(ringShader.fragmentShader.includes('smoothstep( 430.0, 1330.0, length( vVfWorld.xz ) )') && ringShader.fragmentShader.includes('vfHigh * 0.55'), `${id}: the ring's haze law`);
    assert.ok(ringShader.fragmentShader.indexOf('min( impMip, 3.5 ) * 0.25') < ringShader.fragmentShader.indexOf('float vfHz') && ringShader.fragmentShader.indexOf('float vfHz') < ringShader.fragmentShader.indexOf('#include <alphatest_fragment>'), `${id}: the haze after the mip give-back, before the alpha test`);
    assert.equal(ringShader.uniforms.uVfHaze.value, record.tone.haze);
    assert.ok(!ringShader.vertexShader.includes('uWindTime'), `${id}: no wind on the ring (it has no wind uniforms)`);
    // idempotent
    assert.equal(bindHorizonForestImpostors(forest, { library, rimMix: world._rimMix, rimTreeHeightM: world._rimTreeHeightM, setupMaterial() {} }), null);
    assert.equal(forest.children.length, proxies.length + impostorMeshes.length);
    receipts.push({ id, instances: receipt.instances, draws: receipt.draws, shadowProxies: receipt.shadowProxies, species: receipt.species,
      elevated: library.elevated, tint: receipt.tint.map(c => +c.toFixed(3)), stature: { rim: +receipt.stature.rimTreeHeightM.toFixed(2), ringLobes: +receipt.stature.ringLobeHeightM.toFixed(2), ratio: +receipt.stature.ratio.toFixed(3) } });
    world.dispose(); disposeObject3DResources(world.group); disposeObject3DResources(ring);
  }
  // a ring without packed placements (an older group, a treeless map) is left alone
  assert.equal(bindHorizonForestImpostors(new THREE.Group(), { library: null, rimMix: [], rimTreeHeightM: 0, setupMaterial() {} }), null);
} finally {
  if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  if (savedImageData === undefined) delete globalThis.ImageData; else globalThis.ImageData = savedImageData;
}
console.log(JSON.stringify({ receipts }));
console.log('horizonForestImpostors.selftest: the ring forest bound to the far tier\'s atlas on three producers — placements byte-identical, one quad per placement by class / tone / mirror at the rim\'s stature, near lobes as shadow-only casters, band and range lobes and the lobe material disposed, the far tier\'s program text and lighting law with the ring\'s haze, idempotent PASS');
