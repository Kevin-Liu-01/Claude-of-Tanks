// The world's assembly in steps (battle-spikes-253): createMap drains them in one go, createMapAsync paces a sliced build
// between them, a pacing that throws (a cancelled build) lets the assembly finish so a real world owns what it wired, and a
// sliced assembly keeps its group hidden until its last step. map.ts's own declarations, run over stub steps.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';

const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
function declaration(name) {
  const ast = ts.createSourceFile('map.ts', map, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches = [];
  (function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  })(ast);
  assert.equal(matches.length, 1, `unique declaration: ${name}`);
  return stripTypeScriptTypes(matches[0].getText());
}
const load = (name, bindings) => new Function(...Object.keys(bindings), `${declaration(name)}\nreturn ${name};`)(...Object.values(bindings));

const ran = [];
let sliced = null;
function* assembleWorldSteps(_engine, _config, _field, _terrain, _vegetation, _props, slicedFlag) {
  sliced = slicedFlag;
  for (const step of ['grids', 'seal', 'litter']) { ran.push(step); yield; }
  ran.push('done');
  return { world: true };
}
const assembleWorld = load('assembleWorld', { assembleWorldSteps });
const assembleWorldPaced = load('assembleWorldPaced', { assembleWorldSteps });

// createMap: every step in one go, unsliced
assert.deepEqual(assembleWorld(), { world: true });
assert.deepEqual(ran.splice(0), ['grids', 'seal', 'litter', 'done']);
assert.equal(sliced, false, 'the synchronous assembly keeps its group as built');

// createMapAsync's fine slices: a pace after each step, the steps in order between them
{
  const paces = [];
  const world = await assembleWorldPaced(0, 0, 0, 0, 0, 0, async () => { paces.push(ran.at(-1)); });
  assert.deepEqual(world, { world: true });
  assert.deepEqual(ran.splice(0), ['grids', 'seal', 'litter', 'done']);
  assert.deepEqual(paces, ['grids', 'seal', 'litter'], 'paced after each step');
  assert.equal(sliced, true, 'a paced assembly is sliced');
}
// a pace that throws (the coordinator's cancelled build): no further pacing, the assembly finishes, the world returns
{
  let paces = 0;
  const world = await assembleWorldPaced(0, 0, 0, 0, 0, 0, async () => { paces++; if (paces === 2) throw new Error('cancelled'); });
  assert.deepEqual(world, { world: true }, 'the world is returned for the coordinator to release');
  assert.deepEqual(ran.splice(0), ['grids', 'seal', 'litter', 'done']);
  assert.equal(paces, 2, 'no pacing after the throw');
}
// no pace: one go, unsliced
{
  assert.deepEqual(await assembleWorldPaced(0, 0, 0, 0, 0, 0, null), { world: true });
  assert.deepEqual(ran.splice(0), ['grids', 'seal', 'litter', 'done']);
  assert.equal(sliced, false);
}
// timedSteps sums the work of each step and leaves the waits between them out
{
  let clock = 0;
  const timedSteps = load('timedSteps', { performance: { now: () => clock } });
  function* work() { clock += 3; yield; clock += 4; yield; clock += 5; }
  const into = { ms: 0 };
  const steps = timedSteps(work(), into);
  let yields = 0;
  while (!steps.next().done) { yields++; clock += 100; }
  assert.equal(into.ms, 12, 'work only');
  assert.equal(yields, 2);
}

// the wiring: createMapAsync assembles through the paced steps on fine slices; a sliced group is hidden from its scene
// add to its last step; the ground cover's seal is a step per grass mesh
assert.match(map, /const world = await assembleWorldPaced\(engineCtx, config, heightField, terrain, vegetation, props,\s*fineSlices \? \(\) => step\('Sealing the battlefield', 0\.99\) : null\);/);
assert.match(map, /engineCtx\.scene\.add\(group\);\n  if \(sliced\) group\.visible = false;/, 'hidden from its scene add');
assert.match(map, /if \(sliced\) group\.visible = true;\n  return \{/, 'visible again at its last step');
assert.equal((map.slice(map.indexOf('function* assembleWorldSteps('), map.indexOf('if (sliced) group.visible = true;')).match(/\n  yield;\n/g) ?? []).length, 10,
  'the assembly\'s own steps');
assert.match(map, /yield\* timedSteps\(vegetation\.groundCoverSealSteps\(groundCoverClearance\(\)\), groundCoverSeal\);/);
// (rel259) a camera that is not finite holds the world's streaming (the grass carpet's cell request threw every frame)
assert.match(map, /update\([\s\S]{0,240}\) \{\n[\s\S]{0,400}if \(!Number\.isFinite\(cameraPos\.x\) \|\| !Number\.isFinite\(cameraPos\.y\) \|\| !Number\.isFinite\(cameraPos\.z\)\) \{[\s\S]{0,300}return;\n      \}\n      terrain\.userData\.updateLOD\(cameraPos\);/,
  'a non-finite camera returns before the terrain, the vegetation and the sward stream from it');
const vegetation = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
assert.match(vegetation, /function\* groundCoverSealSteps\(blocked: GroundCoverBlocked\)[\s\S]{0,1800}if \(mesh\.instanceColor\) mesh\.instanceColor\.needsUpdate = true;\n      yield;\n    \}/,
  'the seal yields after each grass mesh it compacts');

console.log('worldAssemblySteps.selftest: drained, paced, a throwing pace finishes the world, the sliced group hidden until its last step, the seal per grass mesh');
