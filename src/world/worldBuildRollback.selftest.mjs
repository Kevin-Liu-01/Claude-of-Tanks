// worldBuildRollback.selftest.mjs — (2026-11-02 audit R1) a world build that fails or is cancelled part way releases the
// subsystems it already built. The real createMapAsync (map.ts) runs with its subsystem builders injected (no geometry
// or source IO), cancelled at each later stage:
// 1. the vegetation runtime is torn down and the built roots (terrain, vegetation, props) go to the build's owner
//    (`abandon`), detached from any parent first; nothing is released when the build completes;
// 2. with no owner (receipts) the build disposes them itself, keeping what the scene still shows;
// 3. the coordinator is that owner: it releases a cancelled build's roots with a world's keep rules.
// Before, every built subsystem was dropped as it stood (the terrain material's live preset listeners stayed subscribed).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';
import { createWorldBuildCoordinator } from './worldBuildCoordinator.ts';

const mapSource = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
function declaration(text, name) {
  const ast = ts.createSourceFile('map.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches = [];
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(matches.length, 1, `unique actual declaration: ${name}`);
  return matches[0].getText(ast);
}
const mapAsync = stripTypeScriptTypes(declaration(mapSource, 'createMapAsync')).replace('export ', '');

function tracked(label, disposals) {
  const material = new THREE.MeshBasicMaterial();
  material.addEventListener('dispose', () => disposals.push(label));
  const root = new THREE.Group();
  root.name = label;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  return root;
}

function mapFixture(failAt, abandon) {
  const field = { _layout: { spawns: { player: { x: 0, z: 0 } } } };
  const events = [], disposals = [], failure = new Error(`cancelled at ${failAt}`);
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  scene.add(parent);
  const config = { id: 'fixture', sky: {}, splat: {} };
  const dependencies = {
    getMapConfig: () => config, preloadPropModels: () => Promise.resolve(), prepareSourcedTerrain: () => ({ cancel() { events.push('sources-cancelled'); } }),
    worldBuildConfig: () => config, getDeviceTier: () => 'desktop',
    startHorizonRingBuild: () => ({ stats: {}, dispose() {} }), supplyHorizonRing: () => {}, withdrawHorizonRing: () => {}, finishHorizonRingAsync: async () => {},
    selectHinterland: () => false, startHinterlandBuild: () => null, supplyHinterland: () => {}, withdrawHinterland: () => {},
    skyDrawsEarth: () => false, loadEarthLand: () => Promise.resolve(),
    createHeightField: () => field, createHeightFieldAsync: async () => field,
    requireTerrainRoot: (value) => value,
    async buildTerrainMeshesAsync() { const root = tracked('terrain', disposals); parent.add(root); events.push('terrain'); return root; },
    async createVegetationAsync() {
      events.push('vegetation');
      return { group: tracked('vegetation', disposals), dispose() { events.push('vegetation-disposed'); } };
    },
    async createPropsAsync() { events.push('props'); return { group: tracked('props', disposals) }; },
    async assembleWorldPaced() { events.push('assembled'); return { group: new THREE.Group() }; },
    startPlannedWreckBakes: () => null, startSurfacePaints: () => null, plannedSurfacePaints: () => [],
    loadMapKits: () => Promise.resolve(),
    disposeObject3DResources,
  };
  const run = new Function(...Object.keys(dependencies), mapAsync + '\nreturn createMapAsync;')(...Object.values(dependencies));
  const abandoned = [];
  const pending = run({ scene }, { mapId: 'fixture' }, (label) => {
    if (label === failAt) throw failure;
  }, { fineSlices: false, ...(abandon ? { abandon: (roots) => { abandoned.push(...roots.map((root) => [root.name, root.parent])); abandon(roots); } } : {}) });
  return { pending, events, disposals, failure, abandoned };
}

// ---- 1. the owner receives what was built, detached, after the vegetation's own teardown
for (const [failAt, built] of [
  ['Placing structures', ['terrain', 'vegetation']],
  ['Sealing the battlefield', ['terrain', 'vegetation', 'props']],
]) {
  const h = mapFixture(failAt, () => {});
  await assert.rejects(h.pending, (error) => error === h.failure, 'the original failure stays the rejection');
  assert.deepEqual(h.abandoned.map(([name]) => name), built, `${failAt}: the built subsystems go to the build's owner`);
  assert.ok(h.abandoned.every(([, parent]) => parent === null), 'detached before they are handed over');
  assert.ok(h.events.includes('vegetation-disposed'), `${failAt}: the vegetation runtime is torn down`);
  assert.ok(h.events.includes('sources-cancelled'));
}
{
  const h = mapFixture('never', () => assert.fail('a completed build releases nothing'));
  await h.pending;
  assert.ok(h.events.includes('assembled') && !h.events.includes('vegetation-disposed'));
}

// ---- 2. no owner: the build disposes what it built itself
{
  const h = mapFixture('Placing structures', null);
  await assert.rejects(h.pending, (error) => error === h.failure);
  assert.deepEqual(h.disposals.sort(), ['terrain', 'vegetation'], 'the built roots\' resources are disposed');
}

// ---- 3. the coordinator owns the rollback of a cancelled build
{
  const disposals = [];
  const scene = new THREE.Scene();
  const live = tracked('live', disposals);
  scene.add(live);
  const sharedMaterial = live.children[0].material;
  let handedAbandon = null, release = null;
  const paced = new Promise((resolve) => { release = resolve; });
  const coordinator = createWorldBuildCoordinator({
    engineContext: {}, scene, renderer: { renderLists: { dispose() {} } }, deviceTier: 'desktop',
    getCurrentWorld: () => null,
    getGarageActivity: () => ({ phase: 'garage', transitionActive: false, lastActivityAt: 0 }),
    releaseShadowMaterial() {},
    loadModule: async () => ({ async createMapAsync(_engine, _options, progress, slicing) {
      handedAbandon = slicing.abandon;
      await progress('Building terrain meshes', 0.4);
      const terrain = tracked('partial-terrain', disposals);
      terrain.add(new THREE.Mesh(new THREE.BoxGeometry(), sharedMaterial));
      try { await progress('Planting vegetation', 0.58); } catch (error) { slicing.abandon([terrain]); throw error; }
      return { group: new THREE.Group() };
    } }),
    now: () => 0, foregroundYielder: () => () => paced, backgroundYielder: () => () => paced,
    resourceLimits: { pedestalVisuals: 4, worldScenes: 4 },
  });
  const pending = coordinator.prefetch('fixture', { intent: true });
  await new Promise((resolve) => setImmediate(resolve));
  coordinator.cancelBackgroundExcept();
  release();
  assert.equal(await pending, null);
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof handedAbandon, 'function', 'the coordinator hands every build its rollback owner');
  assert.deepEqual(disposals, ['partial-terrain'], 'the cancelled build\'s own resources are released, the live scene\'s kept');
}

console.log('worldBuildRollback.selftest: a build ended part way hands its built subsystems to its owner (vegetation torn down, roots detached), disposes them itself without one, and the coordinator releases them with a world\'s keep rules PASS');
