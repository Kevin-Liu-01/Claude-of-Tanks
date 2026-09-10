import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';

const candidateSource = readFileSync(new URL('./rosterState.ts', import.meta.url), 'utf8');
const names = ['ensureStagedVisuals', 'ensureStagedVisualsSteps', 'nextStagedBake',
  'battleGeometryQuality', 'ensureTankVisual', 'ensureTankVisualSteps', 'buildRosterVisual', 'textureQualityFor'];
function load(source, ports) {
  const tree = ts.createSourceFile('rosterState.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  const code = ts.transpileModule(functions.map(node => node.getText(tree).replace(/^export /, '')).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function('createTank', 'createTankSteps', 'getDeviceTier', 'HERO_TEX_SPECS',
    `${code}\nreturn {${functions.map(node => node.name.text).join(',')}};`)(
    ports.sync, ports.steps, ports.tier, new Set(['m1a2', 'tiger1', 't34_85', 't90m', 'leo2a7']));
}
function fixture({ mobile = false, player = false, pooled = false, fail = null } = {}) {
  const scene = new THREE.Scene(), trace = [], created = [], ground = () => 0;
  const ent = { specId: 'merkava1b', _camoSeed: 4242, state: {}, visual: null, isPlayer: player };
  const game = { tanks: player ? [ent] : [{ visual: {} }, ent], battleCount: 3,
    _engineCtx: { scene }, _groundSampler: ground };
  function make() {
    const root = new THREE.Group();
    const visual = { specId: ent.specId, root, disposed: 0,
      dispose() { this.disposed++; },
      setGroundSampler(value) { assert.equal(value, ground); trace.push('ground'); if (fail === 'ground') throw Error('ground failed'); },
      syncFromState(value) { assert.equal(value, ent.state); trace.push('pose'); if (fail === 'pose') throw Error('pose failed'); },
      setVisible(value) { root.visible = value; trace.push(`visible:${value}`); },
    };
    created.push(visual);
    return visual;
  }
  scene.addEventListener('childadded', () => {
    assert.ok(ent.visual, 'entity is bound before the established scene-add callback');
    trace.push('scene'); if (fail === 'scene') throw Error('scene failed');
  });
  const builds = [];
  const ports = {
    tier: () => mobile ? 'mobile' : 'desktop',
    sync(id, engine, options) { builds.push({ mode: 'sync', id, engine, options }); return make(); },
    *steps(id, engine, options) {
      builds.push({ mode: 'steps', id, engine, options });
      const visual = make(); let complete = false;
      try {
        yield;
        if (fail === 'factory') throw Error('factory failed');
        yield;
        complete = true; return visual;
      } finally { if (!complete) visual.dispose(); }
    },
  };
  if (pooled) game._battleVisualPool = { take() { trace.push('take'); return make(); } };
  return { game, ent, scene, created, trace, builds, ports, api: load(candidateSource, ports) };
}
function drain(steps, onYield = () => {}) {
  let result = steps.next();
  while (!result.done) { onYield(); result = steps.next(); }
  return result.value;
}

for (const player of [true, false]) for (const mobile of [true, false]) for (const pooled of [true, false]) {
  const poolHit = pooled && !player;
  const expectedBinding = [...(poolHit ? ['take'] : []), 'scene', 'ground', 'pose', 'visible:true'];
  const expectedBuild = poolHit ? [] : [{
    id: 'merkava1b', options: { camoSeed: 4242, quality: player ? 'preview' : 'ai',
      geometryQuality: player && !mobile ? 'high' : 'low',
      batchStatic: true, battleDetailLod: !player && !mobile },
  }];
  for (const staged of [false, true]) {
    const f = fixture({ player, mobile, pooled });
    let checkpoints = 0;
    const result = staged ? drain(f.api.ensureTankVisualSteps(f.game, f.ent), () => {
      checkpoints++; assert.equal(f.ent.visual, null); assert.equal(f.scene.children.length, 0);
      assert.equal(f.created[0].disposed, 0);
    }) : f.api.ensureTankVisual(f.game, f.ent);
    assert.equal(result, f.ent.visual);
    assert.equal(result.root.parent, f.scene);
    assert.equal(result.disposed, 0);
    assert.deepEqual(f.trace, expectedBinding, 'binding and pool policy retain the independently recorded original order');
    assert.deepEqual(f.builds.map(({ id, options }) => ({ id, options })),
      expectedBuild, 'identical quality, camo and geometry options');
    assert.equal(checkpoints, staged && !(pooled && !player) ? 2 : 0);
    assert.equal(f.api.ensureTankVisual(f.game, f.ent), result, 'sync existing visual is idempotent');
    assert.equal(drain(f.api.ensureTankVisualSteps(f.game, f.ent)), result, 'staged existing visual is idempotent');
  }
}

for (const mutate of [
  f => { f.game.tanks = [...f.game.tanks]; },
  f => { f.game.battleCount++; },
  f => { f.game._engineCtx = { scene: new THREE.Scene() }; },
  f => { f.game.tanks.splice(1, 1); },
  f => { f.ent.specId = 't90'; },
  f => { f.ent._camoSeed++; },
  f => { f.ent.state = {}; },
  f => { f.ent.isPlayer = !f.ent.isPlayer; },
  f => { f.game.tanks[0] = {}; },
  f => { f.game._groundSampler = () => 1; },
  f => { f.ent.visual = { competing: true }; },
]) {
  const f = fixture(), iterator = f.api.ensureTankVisualSteps(f.game, f.ent);
  assert.equal(iterator.next().done, false);
  mutate(f);
  assert.throws(() => iterator.next(), /superseded/);
  assert.equal(f.created[0].disposed, 1, 'superseded private factory graph disposed exactly once');
  assert.equal(f.scene.children.length, 0);
  assert.notEqual(f.ent.visual, f.created[0]);
  assert.equal(iterator.next().done, true);
}

for (const call of ['return', 'throw']) for (const count of [1, 2]) {
  const f = fixture(), iterator = f.api.ensureStagedVisualsSteps(f.game, 1);
  for (let i = 0; i < count; i++) assert.equal(iterator.next().done, false);
  if (call === 'throw') assert.throws(() => iterator.throw(Error('cancel')), /cancel/);
  else iterator.return();
  assert.equal(f.created[0].disposed, 1);
  assert.equal(f.ent.visual, null);
  assert.equal(f.scene.children.length, 0);
}
for (const fail of ['factory', 'scene', 'ground', 'pose']) {
  const f = fixture({ fail });
  assert.throws(() => drain(f.api.ensureTankVisualSteps(f.game, f.ent)), /failed/);
  assert.equal(f.created[0].disposed, 1, `${fail}: transaction owns cleanup exactly once`);
  assert.equal(f.ent.visual, null);
  assert.equal(f.scene.children.length, 0);
}
{
  const f = fixture();
  assert.equal(drain(f.api.ensureStagedVisualsSteps(f.game, 0)), false);
  assert.equal(f.created.length, 0);
  assert.equal(drain(f.api.ensureStagedVisualsSteps(f.game, 1, () => false)), true);
  assert.equal(f.created.length, 0);
  assert.equal(drain(f.api.ensureStagedVisualsSteps(f.game, 1)), true);
  assert.equal(f.created.length, 1);
  f.game._engineCtx = undefined;
  f.ent.visual = null;
  assert.throws(() => f.api.ensureTankVisual(f.game, f.ent), /context is unavailable/);
}
console.log('roster staging: PASS recorded synchronous policy parity, private graph publication, cancellation, stale lifetimes, pools and failure cleanup');
