// An alpha-cut draw casts through the cut the eye sees up close (265; the 264b preview, the owner: box-shaped shadows
// beside netted tanks). A suit's net, cover and garnish carry coverage-preserving mips (alphaCutTexture.ts): at a
// cascade's texel size the shadow draw took a coarse level, whose texels pass the cut in level 0's share but stand a
// strand or more wide, and cast a near-solid box. Every draw of a suited build that can cast (its own cast flag or the
// near hull's detail) and is cut by alpha casts through alphaCutDepthMaterial, whose shader reads the map's level 0;
// remote seats, the viewer's own and a copy for another seat. Its control: a suit draw without it is found.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { battleStaticDrawMerge, createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { cloneTankVisual } = await import('./tankVisualClone.ts');
const { alphaCutDepthMaterial } = await import('./alphaCutTexture.ts');
const { vehicleShadowDetailOf } = await import('../engine/nearVehicleShadowDetail.ts');

// the depth material's shader: the map read at level 0, never at the mip the shadow draw's derivatives pick
{
  const cloth = new THREE.MeshStandardMaterial({ alphaTest: 0.5 });
  const depth = alphaCutDepthMaterial(cloth);
  assert.equal(alphaCutDepthMaterial(cloth), depth, 'one cut depth a material');
  assert.notEqual(alphaCutDepthMaterial(new THREE.MeshStandardMaterial({ alphaTest: 0.5 })), depth, 'and its own for another (three uploads its map only when the material changes)');
  // (264c) a seat's builds share their net textures, not their materials: one cut texture, one depth draw
  const net = new THREE.Texture();
  const first = alphaCutDepthMaterial(new THREE.MeshStandardMaterial({ alphaTest: 0.5, map: net }));
  assert.equal(alphaCutDepthMaterial(new THREE.MeshStandardMaterial({ alphaTest: 0.5, map: net })), first, 'two materials on one cut texture share its depth');
  assert.notEqual(alphaCutDepthMaterial(new THREE.MeshStandardMaterial({ alphaTest: 0.5, map: new THREE.Texture() })), first, 'another texture has its own');
  const shader = { vertexShader: THREE.ShaderLib.depth.vertexShader, fragmentShader: THREE.ShaderLib.depth.fragmentShader, uniforms: {} };
  depth.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /textureLod\( map, vMapUv, 0\.0 \)/, 'the cut depth reads the map at level 0');
  assert.ok(!shader.fragmentShader.includes('#include <map_fragment>'), 'and not through three\'s sampled map');
  assert.equal(depth.depthPacking, THREE.RGBADepthPacking, 'at the RGBA packing every shadow depth draws at');
}

const isCutDepth = (material) => material?.name === 'cot:alpha-cut-depth' && material.isMeshDepthMaterial;
/** The draws that can cast (their own flag, or the near hull's detail) and are cut by alpha without the cut depth. */
function solidCutCasters(root) {
  const detail = new Set(vehicleShadowDetailOf(root)?.detail ?? []);
  const out = [];
  root.traverse((object) => {
    if (!object.isMesh || !(object.castShadow || detail.has(object))) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!material || !(material.alphaTest > 0)) return;
    if (!isCutDepth(object.customDepthMaterial)) out.push(object.name || object.type);
  });
  return out;
}
const suitDraws = (root) => {
  const out = [];
  root.traverse((object) => { if (object.isMesh && /_ghillie_(hull|turret|gun)_(net|leaves)$/.test(object.name)) out.push(object); });
  return out;
};

const remote = (id) => ({ quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: true, staticDrawMerge: battleStaticDrawMerge(id) });
const viewer = (id) => ({ quality: 'high', geometryQuality: 'high', batchStatic: true, battleDetailLod: false, staticDrawMerge: battleStaticDrawMerge(id) });
const rows = [];
// netted Leopards (a full suit, the Swedish field suit) and the CV9040C; the Leopard 2A6 wears none
for (const id of ['leo2a5', 'strv121', 'cv9040c', 'leo2a6']) {
  await ensureTankBuilder(id);
  for (const [label, options] of [['remote seat', remote(id)], ['viewer', viewer(id)]]) {
    const name = `${id} (${label})`;
    const settings = { camoSeed: 7, camoPattern: null, eraVisualBindingReceipt: false, ...options };
    const visual = createTank(id, null, settings);
    const suits = suitDraws(visual.root);
    if (id !== 'leo2a6') assert.ok(suits.length > 0, `${name}: wears a suit`);
    assert.deepEqual(solidCutCasters(visual.root), [], `${name}: every alpha-cut caster casts through its level-0 cut`);
    for (const mesh of suits) {
      assert.ok(isCutDepth(mesh.customDepthMaterial), `${name}: ${mesh.name} casts through its level-0 cut`);
    }
    const copy = cloneTankVisual(visual, null, settings);
    assert.deepEqual(solidCutCasters(copy.root), [], `${name}: and its copy for another seat`);
    for (const mesh of suitDraws(copy.root)) assert.ok(isCutDepth(mesh.customDepthMaterial), `${name}: the copy's ${mesh.name} too`);
    if (id === 'leo2a5' && label === 'remote seat') {
      // the control: a suit draw that can cast without the cut depth is found
      const mesh = suits.find((draw) => draw.castShadow || new Set(vehicleShadowDetailOf(visual.root)?.detail ?? []).has(draw)) ?? suits[0];
      const was = mesh.customDepthMaterial, cast = mesh.castShadow;
      mesh.customDepthMaterial = undefined;
      mesh.castShadow = true;
      assert.deepEqual(solidCutCasters(visual.root), [mesh.name], 'the control: a suit draw without the cut depth is found');
      mesh.customDepthMaterial = was;
      mesh.castShadow = cast;
    }
    rows.push(`${name} ${suits.length} suit draws`);
    copy.dispose();
    visual.dispose();
  }
}
restoreCanvas();
console.log(`alphaCutShadow selftest passed: every alpha-cut caster casts through its level-0 cut (${rows.join(', ')})`);
