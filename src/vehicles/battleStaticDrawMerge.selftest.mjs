// perf-250 (the coordinator's ruling of 2026-10-24): the source-X Abrams family's BATTLE builds bake pure translations in
// the P21 static merge (fleetFactory battleStaticDrawMerge); every other vehicle, and every Garage, Gallery and hero build,
// keeps the byte-exact identity merge. The battle roster passes the vehicle's own mode on every attempt (a fallback build
// takes its donor's), `?staticmerge=` still picks one mode for every build, and a SEPv3 bot folds its stations as measured.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { battleStaticDrawMerge, createTank, ensureTankBuilder } = await import('./fleetFactory.ts');
const { ABRAMS_SOURCE_X_IDS } = await import('./abramsSourceXSpecs.ts');

assert.deepEqual([...ABRAMS_SOURCE_X_IDS].sort(),
  ['m1a2_abrams', 'm1a2_abrams_sepv2', 'm1a2_abrams_sepv3', 'm1a2_abrams_tusk', 'ua_m1a2_abrams'], 'the family the ruling names');
for (const id of ABRAMS_SOURCE_X_IDS) assert.equal(battleStaticDrawMerge(id), 'translations', `${id} bakes translations`);
for (const id of ['m1a1_abrams_hc', 'm1a1_abrams_fep', 't90m', 'leo2_improved', 'challenger2']) {
  assert.equal(battleStaticDrawMerge(id), 'identity', `${id} keeps the identity merge`);
}
// the probes' same-build pairs: ?staticmerge= wins for every build
const realLocation = globalThis.location;
for (const mode of ['off', 'identity', 'translations']) {
  globalThis.location = { search: `?staticmerge=${mode}` };
  assert.equal(battleStaticDrawMerge('m1a2_abrams_sepv3'), mode);
  assert.equal(battleStaticDrawMerge('t90m'), mode);
}
globalThis.location = { search: '?staticmerge=bogus' };
assert.equal(battleStaticDrawMerge('m1a2_abrams_sepv3'), 'translations', 'an unknown value is no override');
globalThis.location = realLocation;

// only the battle roster asks for it, per attempt; the Garage pedestal (the hero lent to battle) and the Gallery never do
const roster = readFileSync(new URL('../game/rosterState.ts', import.meta.url), 'utf8');
assert.match(roster, /const attemptOptions = \{ \.\.\.attempt\.options, staticDrawMerge: battleStaticDrawMerge\(attempt\.specId\) \};/);
assert.match(roster, /createTankSteps\(attempt\.specId, engineCtx, attemptOptions\)\s*:\s*createTank\(attempt\.specId, engineCtx, attemptOptions\)/);
for (const path of ['../game/garagePedestalRuntime.ts', '../game/garageDressing.ts', '../gallery/gallery.ts', '../game/studio.ts']) {
  assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), 'utf8'), /staticDrawMerge|battleStaticDrawMerge/, `${path} builds no battle merge`);
}

// what the ruling buys: a SEPv3 bot (low geometry, battle detail) folds its gun rig and CROWS
await ensureTankBuilder('m1a2_abrams_sepv3');
const draws = (mode) => {
  const visual = createTank('m1a2_abrams_sepv3', null, { camoSeed: 7, quality: 'ai', geometryQuality: 'low', batchStatic: true,
    battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: mode });
  let n = 0;
  const visit = (o) => {
    if (!o.visible) return;
    if (o.isLOD) { if (o.levels.length) visit(o.levels[0].object); return; }
    if (o.isMesh) n += Array.isArray(o.material) ? o.material.length : 1;
    for (const child of o.children) visit(child);
  };
  visit(visual.root);
  return n;
};
const identity = draws('identity'), translations = draws('translations');
restoreCanvas();
assert.ok(translations <= identity - 30, `a SEPv3 bot folds 30+ draws (${identity} -> ${translations})`);
console.log(`battleStaticDrawMerge.selftest: the source-X Abrams family bakes translations in battle (SEPv3 bot ${identity} -> `
  + `${translations} draws), every other vehicle and every Garage, Gallery and hero build keeps identity, the probe override holds PASS`);
