// worldBuildCloseContracts.selftest.mjs — (2026-11-02 audit R1) the world build's cancellation contract, the same on every
// builder, and the impostor warm after a release:
// 1. createVegetationAsync closes its generator when a tick throws (its in-generator finally blocks run), as the terrain
//    and the props builders close theirs; it had no finally and left the generator suspended;
// 2. finishHorizonRingAsync keeps the deferred ring stage on the terrain group until it has drained: deleted first, a
//    cancelled drain left a ringless group with nothing to finish it; a drained stage leaves;
// 3. an impostor atlas bake whose world was released while its programs linked draws nothing (the world's warm passes
//    its liveness): a late draw re-created the released atlas's framebuffers with no owner to free them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { createTreeImpostorLibrary } from './treeImpostors.ts';
import { terrainSourceText } from './terrainSourceText.mjs';

function declaration(text, name) {
  const ast = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(found, `the real declaration: ${name}`);
  return stripTypeScriptTypes(found.getText(ast)).replace('export ', '');
}

// ---- 1. the vegetation's async builder closes its generator on a failed tick
{
  const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  const events = [];
  function* vegetationBuildSteps() {
    try {
      for (let i = 0; i < 4; i++) { events.push(`step ${i}`); yield { stage: 'trees', fine: false }; }
      return { group: new THREE.Group() };
    } finally { events.push('closed'); }
  }
  const createVegetationAsync = new Function('vegetationBuildSteps', 'performance',
    declaration(source, 'createVegetationAsync') + '\nreturn createVegetationAsync;')(vegetationBuildSteps, performance);
  const failure = new Error('cancelled');
  let ticks = 0;
  await assert.rejects(createVegetationAsync({}, {}, 2001, null, () => { if (++ticks === 2) throw failure; }),
    (error) => error === failure, 'the pacing failure stays the rejection');
  assert.deepEqual(events, ['step 0', 'step 1', 'closed'], 'the generator is closed where the tick failed');
  events.length = 0;
  const built = await createVegetationAsync({}, {}, 2001, null, () => {});
  assert.ok(built.group && built._buildDetail, 'a completed build returns its runtime');
  assert.equal(events.at(-1), 'closed');
}

// ---- 2. the deferred ring stage stays on the group until it has drained
{
  const finishHorizonRingAsync = new Function(declaration(terrainSourceText(), 'finishHorizonRingAsync')
    + '\nreturn finishHorizonRingAsync;')();
  let runs = 0, built = 0;
  const group = { userData: { finishHorizonRing: function* () {
    runs++;
    for (let i = 0; i < 3; i++) yield [1, 2, true];
    built++;
  } } };
  const failure = new Error('cancelled');
  await assert.rejects(finishHorizonRingAsync(group, () => { throw failure; }), (error) => error === failure);
  assert.equal(typeof group.userData.finishHorizonRing, 'function', 'a cancelled drain leaves the stage to finish the ring');
  await finishHorizonRingAsync(group, async () => {});
  assert.equal(built, 1, 'the retried drain builds the ring');
  assert.equal(group.userData.finishHorizonRing, undefined, 'a drained stage leaves the group');
  assert.equal(runs, 2);
}

// ---- 3. a released world's atlas is not drawn after its links
{
  const card = () => {
    const geometry = new THREE.PlaneGeometry(2, 3).translate(0, 2.5, 0);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3).fill(1), 3));
    return geometry;
  };
  const trunk = () => {
    const geometry = new THREE.CylinderGeometry(0.1, 0.15, 2, 6).translate(0, 1, 0);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3).fill(1), 3));
    return geometry;
  };
  const leaf = new THREE.DataTexture(new Uint8Array([40, 90, 30, 255]), 1, 1);
  const calls = [];
  let target = null;
  const renderer = {
    getRenderTarget: () => target, setRenderTarget(next) { target = next; },
    render() { calls.push('render'); }, clear() { calls.push('clear'); }, compile() { calls.push('compile'); },
    getClearColor: (out) => out.set(0, 0, 0), getClearAlpha: () => 1, setClearColor() {},
    autoClear: true, shadowMap: { autoUpdate: true },
  };
  const library = createTreeImpostorLibrary({
    rows: [0, 1, 2].map((variant) => ({ species: 'oak', variant, trunk: trunk(), cards: card(), foliage: leaf })),
    bark: new THREE.DataTexture(new Uint8Array([90, 70, 50, 255]), 1, 1), flood: new THREE.Color(0.2, 0.3, 0.1),
    hook() {}, setupMaterial() {}, renderer,
  });
  let alive = true;
  assert.equal(await library.ensureBakedAsync(async () => { alive = false; }, () => alive), false,
    'the world released during the link wait: no bake');
  assert.deepEqual(calls.filter((call) => call !== 'compile'), [], 'and no draw into its atlas');
  assert.equal(library.baked, false);
  assert.equal(await library.ensureBakedAsync(async () => {}, () => true), true, 'a live world bakes');
  assert.ok(calls.includes('render'));
  const vegetation = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  assert.match(vegetation, /warmImpostors: \(\) => \(treeImpostors && !disposed \? treeImpostors\.ensureBaked\(\) : false\)/,
    'the vegetation\'s warm bakes nothing once it is disposed');
  assert.match(vegetation, /treeImpostors\.ensureBakedAsync\(waitLinks, \(\) => !disposed\)/, 'and passes its liveness to the async bake');
}

console.log('worldBuildCloseContracts.selftest: the vegetation builder closes its generator on a failed tick, the deferred ring stage stays until drained, a released world\'s atlas is never drawn after its links PASS');
