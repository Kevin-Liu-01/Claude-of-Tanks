import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Vector3 } from 'three';

// Execute the actual private entry points without booting Studio/solo's DOM,
// renderer or whole fleet. AST extraction fails if the entry point disappears.
function privateFunction(file, name, dependencies) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const matches = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(matches.length, 1, `${file}: unique actual ${name}`);
  const js = ts.transpileModule(matches[0].getText(tree), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${js}\nreturn ${name};`)(...Object.values(dependencies));
}

const muzzle = new Vector3(), direction = new Vector3(), origins = [];
const prepare = privateFunction('./state.ts', 'prepareMuzzleDirection', { _muzzle: muzzle, _dir: direction });
const rack = [{ x: -1 }, { x: 1 }, { x: 2 }];
const entity = {
  spec: { gun: { launcherMuzzles: rack, muzzles: [{ x: -.2 }, { x: .2 }] } },
  combat: { launcherCursor: 2, muzzleCursor: 1 },
  visual: { gunMuzzleWorld(out, index, guided) {
    origins.push({ index, guided }); out.set(guided ? rack[index].x : index, 2, 0);
  }, gunDirWorld(out) { out.set(0, 0, 1); } },
};
assert.equal(prepare(entity, { guided: true }), 2);
assert.equal(entity.combat.launcherCursor, 0, 'accepted missile wraps rack');
assert.equal(entity.combat.muzzleCursor, 1, 'missile leaves cannon alternation intact');
assert.equal(prepare(entity, { guided: false }), 1);
assert.equal(entity.combat.launcherCursor, 0, 'cannon leaves next missile untouched');
assert.equal(prepare(entity, { guided: true }), 0);
assert.deepEqual(origins, [{ index: 2, guided: true }, { index: 1, guided: false }, { index: 0, guided: true }]);
const oldCursor = entity.combat.launcherCursor;
assert.equal(prepare({ ...entity, visual: null }, { guided: true }), null);
assert.equal(entity.combat.launcherCursor, oldCursor, 'no visual/no launch cannot consume a tube');
const legacy = { ...entity, spec: { gun: { muzzles: [{}, {}] } }, combat: { muzzleCursor: 1 } };
assert.equal(prepare(legacy, {}), 1, 'ordinary multi-cannon selection remains unchanged');
assert.equal(legacy.combat.launcherCursor, undefined);

const effects = [], kicks = [], positions = [];
const fireMoment = privateFunction('./studio.ts', 'fireFiringMoment', {
  _v2: new Vector3(), _v3: new Vector3(), fx: { composeFiringMoment: value => effects.push(value) },
});
const actor = { spec: { gun: { caliberMm: 30, shells: [
  { guided: true, caliberMm: 152, type: 'HEAT' },
  { guided: true, caliberMm: 152, type: 'HE' },
  { guided: false, caliberMm: 30, type: 'APFSDS' },
] } }, state: {}, visual: {
  recoilKick(age, scale, index, guided) { kicks.push({ guided }); return guided ? 4 : null; },
  syncFromState() {},
  gunMuzzleWorld(out, index, guided) { positions.push({ index, guided }); out.set(guided ? 1 : 0, 2, 3); },
  gunDirWorld(out) { out.set(0, 0, 1); },
} };
assert.equal(fireMoment({ actor: null, params: {} }), false);
for (const slot of [0, 1, 2]) assert.equal(fireMoment({ actor, params: { slot } }), true);
assert.deepEqual(effects.map(effect => [effect.caliberMm, effect.tracerType]),
  [[152, 'HEAT'], [152, 'HE'], [30, 'APFSDS']], 'selected round governs both caliber and tracer');
assert.deepEqual(positions, [{ index: 4, guided: true }, { index: 4, guided: true },
  { index: undefined, guided: false }]);
assert.deepEqual(kicks.map(value => value.guided), [true, true, false]);
fireMoment({ actor, params: { slot: 2, caliberMm: 40, shellType: 'HE', ageS: .2 } });
assert.deepEqual([effects.at(-1).caliberMm, effects.at(-1).tracerType, effects.at(-1).ageS], [40, 'HE', .2],
  'explicit Studio artistic overrides remain supported');
console.log('missilePresentation: actual solo cursor isolation and Studio selected-shell FX PASS');
