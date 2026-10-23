import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript-compiler-api';
import { gunshipShotOf } from '../fx/gunshipRounds.ts';

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
  fireWeapon: (...args) => calls.push(['report', ...args]),
  shellFlyby: () => calls.push(['whizz']),
  say: () => calls.push(['radio']),
  logSound: (kind) => calls.push(['log', kind]),
  // Own main-gun rounds in flight, for the gunner's miss call.
  ownRounds: new Map(),
  resolveWeaponReport: () => ({ cls: { id: 'gun_120' } }),
  // The route log's range and level fields.
  listenerValid: true,
  distanceTo: () => 120,
  // The caption stream (BUI-F9): a remote cannon heard close by is captioned with its direction.
  playerId: 'player',
  sameTeam: (a, b) => a === b,
  caption: (id) => calls.push(['caption', id]),
  distanceAttenuationDb: () => -20,
  dbToGain: (db) => 10 ** (db / 20),
};
const predictAudio = await receiver('../audio/audioEngine.ts', namedFunction('onPredictedWeapon'), audioBindings);
const confirmAudio = await receiver('../audio/audioEngine.ts', namedFunction('onShellFired'), audioBindings);
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
assert.deepEqual(calls.filter(([kind]) => kind === 'caption'), [['caption', 'gunfire']], 'and only it is captioned (our own shots are not)');
const reportCount = calls.length;
for (const change of [{ ctx: null }, { phase: 'garage' }, { battleOver: true }, { listenerOwnerId: null }]) {
  const denied = await receiver('../audio/audioEngine.ts', namedFunction('onPredictedWeapon'), { ...audioBindings, ...change });
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
  // the destruction-fx lane's record of a fired round's class and charge (its burst reads it at expiry)
  rememberMunition: () => {},
  // (fx 9a) a missile's or rocket's launch is its own (missileLooks.ts firedIsMissile, missileRecipes.ts): its own
  // launch beat instead of the gun's flash, and its launch point anchors its wires
  firedIsMissile: (sound) => sound === 'missile', missileLaunchAt: new Map(), idSeed: () => 1,
  missileLaunchFx: () => fxCalls.push('missile'),
  // (FX lane 10-14) a wire-guided round pays out its wire from the launcher's tube (missileWires.selftest)
  missileLookFor: (name) => ({ wires: name === 'TOW' ? 2 : 0 }),
  beginWire: (e, look) => fxCalls.push(`wire:${e.shellId}:${look.wires}`),
  // (ac130-fx-228) the AC-130's shots: the real resolver, their own muzzle (gunshipMuzzleFx), never a tank cannon's
  gunshipShotOf, gunshipMuzzleFx: (e, gun) => fxCalls.push(`gunship:${gun}`), gunshipCaliberMm: () => 180,
  subjectFor: (id) => (id === 'pilot' ? { aerial: { kind: 'gunship' } } : null),
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
// (fx 9a) a missile: its own launch beat, never the gun's flash; predicted once, not doubled by the confirmation
const missile = { ...shot, caliberMm: 152, shellType: 'HEAT', weaponSound: 'missile' };
predictFx(missile);
assert.deepEqual(fxCalls.slice(4), ['missile'], 'a predicted missile launch is its own beat');
confirmFx({ ...missile, shellId: 20, feedbackPredicted: true });
assert.deepEqual(fxCalls.slice(4), ['missile'], 'its confirmation neither doubles the launch nor flashes the gun');
assert.deepEqual(Array.from(fxBindings.missileLaunchAt.get(20)), [...shot.muzzlePos, 152],
  'its launch point anchors its trail, its calibre sizes its airframe');
confirmFx({ ...missile, shellId: 21, shellName: 'TOW' });
assert.deepEqual(fxCalls.slice(5), ['missile', 'wire:21:2'], 'a confirmed wire-guided round pays out its wire from its launcher');
// (ac130-fx-228) the gunship's three guns: their own muzzle by their sound, or by the firing aircraft for a networked shot
{
  const before = fxCalls.length;
  predictFx({ ...shot, weaponSound: 'gunship-autocannon', caliberMm: 30, shellType: 'AP' });
  confirmFx({ ...shot, shellId: 30, weaponSound: 'gunship-howitzer', caliberMm: 152, shellType: 'HE' });
  confirmFx({ ...shot, shellId: 31, weaponSound: 'gunship-missile', caliberMm: 180, shellType: 'HE' });
  confirmFx({ ...shot, shellId: 32, weaponSound: null, shooterId: 'pilot', caliberMm: 152, shellType: 'HE' });
  assert.deepEqual(fxCalls.slice(before), ['gunship:cannon', 'gunship:howitzer', 'gunship:missile', 'gunship:howitzer'],
    "the gunship's shots take the gunship muzzle, never a tank cannon's flash at the lens");
  assert.deepEqual(Array.from(fxBindings.missileLaunchAt.get(31)), [...shot.muzzlePos, 180], "the gunship missile anchors its hellfire's trail");
}
console.log('localWeaponPresentation.selftest: production audio/FX receivers isolate intent feedback and retain authority');
