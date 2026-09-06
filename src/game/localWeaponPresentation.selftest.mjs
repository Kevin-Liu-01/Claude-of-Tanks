import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript-compiler-api';

// Execute the production receiver bodies with their audio/WebGL boundaries
// replaced. No AudioContext, GPU, timing guess, or duplicated routing policy.
async function receiver(path, matches, bindings) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let selected;
  function visit(node) {
    if (matches(node)) selected = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(selected, `production receiver found: ${path}`);
  const code = ts.transpileModule(`(${selected.getText(tree)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return runInNewContext(code, bindings);
}

const namedFunction = (name) => (node) => ts.isFunctionDeclaration(node) && node.name?.text === name;
const fxCallback = (event) => (node) => ts.isArrowFunction(node)
  && ts.isCallExpression(node.parent) && node.parent.expression.getText() === 'onFxEvent'
  && node.parent.arguments[1]?.text === event;
const calls = [];
const audioBindings = {
  ctx: {}, phase: 'battle', battleOver: false, listenerOwnerId: 'player', listenerScoped: false,
  spat: () => ({ dist: 1, gain: 1 }),
  gunshot: (...args) => calls.push(['report', ...args]),
  scheduleWhizz: () => calls.push(['whizz']),
  radio: { say: () => calls.push(['radio']) },
  logSound: (kind) => calls.push(['log', kind]),
  resolveWeaponReportProfile: () => ({ kind: 'cannon' }),
};
const predictAudio = await receiver('../audio/audio.ts', namedFunction('onPredictedWeapon'), audioBindings);
const confirmAudio = await receiver('../audio/audio.ts', namedFunction('onShellFired'), audioBindings);
const shot = { muzzlePos: [1, 2, 3], dir: [0, 0, 1], caliberMm: 120,
  isPlayer: true, shooterId: 'player', shellType: 'APFSDS', fireIntentSeq: 7 };
predictAudio(shot);
assert.deepEqual(calls.map(([kind]) => kind), ['report'], 'prediction has a report, no whizz/radio/shell log');
confirmAudio({ ...shot, shellId: 10, feedbackPredicted: true });
assert.equal(calls.filter(([kind]) => kind === 'report').length, 1, 'confirmation cannot double the report');
assert.equal(calls.filter(([kind]) => kind === 'radio').length, 1, 'confirmed shot still owns the crew call');
confirmAudio({ ...shot, shellId: 11 });
confirmAudio({ ...shot, shellId: 12, isPlayer: false, shooterId: 'enemy' });
assert.equal(calls.filter(([kind]) => kind === 'report').length, 3, 'ordinary own and remote reports survive');
assert.equal(calls.filter(([kind]) => kind === 'whizz').length, 1, 'only remote confirmed shot schedules a whizz');
const reportCount = calls.length;
for (const change of [{ ctx: null }, { phase: 'garage' }, { battleOver: true }, { listenerOwnerId: null }]) {
  const denied = await receiver('../audio/audio.ts', namedFunction('onPredictedWeapon'), { ...audioBindings, ...change });
  denied(shot);
}
predictAudio({ ...shot, shooterId: 'enemy' });
predictAudio({ ...shot, isPlayer: false });
assert.equal(calls.length, reportCount, 'unavailable/finished/non-owner prediction is silent');

const shellKinds = new Map(), sweepTails = new Map();
const fxCalls = [];
const scratch = () => ({ set() {} });
const fxBindings = {
  _v3: scratch(), _v4: scratch(), shellKinds, sweepTails,
  fx: { muzzleFlash: () => fxCalls.push('flash') },
  spawnSabotPetals: () => fxCalls.push('sabot'),
};
const predictFx = await receiver('../fx/effects.ts', fxCallback('weapon:predicted'), fxBindings);
const confirmFx = await receiver('../fx/effects.ts', fxCallback('shell:fired'), fxBindings);
predictFx(shot);
assert.deepEqual(fxCalls, ['flash']);
assert.equal(shellKinds.size + sweepTails.size, 0, 'prediction cannot register a shell or prop sweep');
confirmFx({ ...shot, shellId: 10, feedbackPredicted: true });
assert.deepEqual(fxCalls, ['flash', 'sabot'], 'only authority spawns sabot pieces, without a second flash');
assert.equal(shellKinds.get(10), 'APFSDS');
assert.deepEqual(Array.from(sweepTails.get(10)), shot.muzzlePos, 'confirmed shell sweep is retained');
confirmFx({ ...shot, shellId: 11 });
assert.deepEqual(fxCalls, ['flash', 'sabot', 'flash', 'sabot']);
predictFx({ ...shot, isPlayer: false });
assert.equal(fxCalls.length, 4, 'remote speculative flash is ignored');
console.log('localWeaponPresentation.selftest: production audio/FX receivers isolate intent feedback and retain authority');
