// Every vehicle draw reads its own suit shade (264b preview, the owner: "the shadow issues were on all tanks"). Every
// vehicle program declares suitOcc (materials.ts vehicleAmbientFloorHook); three sets a material's attribute default only
// when a draw's vertex array is first built, into the one generic value an attribute location keeps for every program,
// so a draw without the attribute read whatever another program's default last left there, and tanks without a suit
// took a suit's shade. suitOcclusion.ts seeds zeros on every vehicle draw of every build. The scan: every draw whose
// compiled program reads suitOcc carries it as its own array (plain, instanced, batched; near and far; a clone; a
// remote seat, the viewer's own and a Garage build; unsuited and suited), zeros on an unsuited build. Its control: the
// scan finds a plain, an instanced and a batched draw with the attribute taken off.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { battleStaticDrawMerge, createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { getSpec } = await import('./specs.ts');
const { cloneTankVisual } = await import('./tankVisualClone.ts');
const { createTankState } = await import('../sim/movement.ts');
const { VEHICLE_SUIT_OCCLUSION_ATTRIBUTE: SUIT } = await import('./materials.ts');

const LIBS = [['isMeshPhysicalMaterial', 'physical'], ['isMeshStandardMaterial', 'standard'], ['isMeshLambertMaterial', 'lambert'],
  ['isMeshPhongMaterial', 'phong'], ['isMeshBasicMaterial', 'basic']];
const declares = new RegExp(`attribute\\s+float\\s+${SUIT}\\s*;`);
const compiled = new WeakMap();
/** Whether a material's program declares the suit's shade: its own compile chain run on three's shader source. */
function readsSuit(material) {
  if (compiled.has(material)) return compiled.get(material);
  const lib = LIBS.find(([flag]) => material[flag]);
  let reads = false;
  if (lib && material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
    const source = THREE.ShaderLib[lib[1]];
    const shader = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(source.uniforms), defines: { ...(material.defines || {}) } };
    material.onBeforeCompile(shader, { capabilities: { isWebGL2: true } });
    reads = declares.test(shader.vertexShader);
  }
  compiled.set(material, reads);
  return reads;
}

/** Every colour draw (any LOD level, shown or not) whose program reads suitOcc without an array of its own. */
function genericReaders(root) {
  const out = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.layers.isEnabled(0)) return;
    const position = object.geometry?.getAttribute('position');
    if (!position) return;
    for (const material of [object.material].flat()) {
      if (!material || !readsSuit(material)) continue;
      const shade = object.geometry.getAttribute(SUIT);
      if (!shade || shade.isInterleavedBufferAttribute || shade.count !== position.count) out.push(object.name || object.type);
    }
  });
  return out;
}

/** The shaded vertices over every vehicle draw, and the attribute's bytes (one per vertex, each geometry once). */
function shade(root) {
  const seen = new Set();
  let bytes = 0, shaded = 0, reads = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    if ([object.material].flat().some((material) => material && readsSuit(material))) reads++;
    const attribute = object.geometry?.getAttribute(SUIT);
    if (!attribute || seen.has(attribute)) return;
    seen.add(attribute);
    bytes += attribute.array.byteLength;
    for (const value of attribute.array) if (value) shaded++;
  });
  return { bytes, shaded, reads };
}

const remote = (id) => ({ quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: true, staticDrawMerge: battleStaticDrawMerge(id) });
const viewer = (id) => ({ quality: 'high', geometryQuality: 'high', batchStatic: true, battleDetailLod: false, staticDrawMerge: battleStaticDrawMerge(id) });
const garage = () => ({ quality: 'high' });
const settle = async (visual, state, dist) => { for (let i = 0; i < 2; i++) { visual.syncFromState(state, 1 / 30, dist); await new Promise((r) => setTimeout(r, 5)); } };
const rows = [];
// unsuited (a cast hull, an ERA hull, a western turret) and the suited CV9040C
for (const [id, suited] of [['t72b3', false], ['leo2a6', false], ['m1a1', false], ['cv9040c', true]]) {
  await ensureTankBuilder(id);
  const spec = getSpec(id);
  const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
  for (const [label, options] of [['remote seat', remote(id)], ['viewer', viewer(id)], ['garage', garage()]]) {
    const name = `${id} (${label})`;
    const visual = createTank(id, null, { camoSeed: 7, camoPattern: null, eraVisualBindingReceipt: false, ...options });
    await settle(visual, state, 10);
    assert.deepEqual(genericReaders(visual.root), [], `${name}: every draw reading the suit's shade carries its own`);
    if (options.batchStatic) {
      visual.prepareFarLod?.();
      await settle(visual, state, 200);
      assert.deepEqual(genericReaders(visual.root), [], `${name}: and far, its stand-ins too`);
      const clone = cloneTankVisual(visual, null, { camoSeed: 7, camoPattern: null, eraVisualBindingReceipt: false, ...options });
      assert.deepEqual(genericReaders(clone.root), [], `${name}: and its copy for another seat`);
      clone.dispose();
    }
    const { bytes, shaded, reads } = shade(visual.root);
    assert.ok(reads > 0, `${name}: its vehicle draws read the suit's shade`);
    if (suited) assert.ok(shaded > 0, `${name}: the suit shades the armour under it`);
    else assert.equal(shaded, 0, `${name}: no suit, no shade`);
    rows.push(`${name} ${bytes} B`);
    if (id === 't72b3' && label === 'remote seat') {
      // the control (near again: the far stand-ins park the gear's batches): a plain, an instanced and a batched draw
      // with the attribute taken off are found
      await settle(visual, state, 10);
      const picks = { plain: null, instanced: null, batched: null };
      visual.root.traverse((object) => {
        if (!object.isMesh || !object.layers.isEnabled(0) || !object.geometry?.getAttribute(SUIT)) return;
        if (![object.material].flat().some((material) => material && readsSuit(material))) return;
        const kind = object.isBatchedMesh ? 'batched' : object.isInstancedMesh ? 'instanced' : 'plain';
        if (!picks[kind]) picks[kind] = object;
      });
      for (const [kind, mesh] of Object.entries(picks)) {
        assert.ok(mesh, `t72b3: the control finds a ${kind} vehicle draw`);
        const attribute = mesh.geometry.getAttribute(SUIT);
        mesh.geometry.deleteAttribute(SUIT);
        assert.ok(genericReaders(visual.root).includes(mesh.name || mesh.type), `the control: a ${kind} draw without the attribute is found`);
        mesh.geometry.setAttribute(SUIT, attribute);
      }
      assert.deepEqual(genericReaders(visual.root), [], 'the control restored');
    }
    visual.dispose();
  }
}
restoreCanvas();
console.log(`suitShadeReads selftest passed: every vehicle draw reads its own suit shade (${rows.join(', ')})`);
