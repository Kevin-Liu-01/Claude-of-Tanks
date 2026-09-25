import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Vector3 } from 'three';
import * as THREE from 'three';
import { usesLauncherMuzzles, isUnguidedRocket, launcherMuzzleIndex } from '../sim/launcherPolicy.ts';
import { addInternalModuleModel } from '../vehicles/internalAnatomyVisuals.ts';

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
const prepare = privateFunction('./state.ts', 'prepareMuzzleDirection', { _muzzle: muzzle, _dir: direction, usesLauncherMuzzles, launcherMuzzleIndex });
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

// A cannon and two different missile systems must retain three feeds and
// select only the tubes for the requested weapon, including a copied round.
const rounds = [{ name: 'cannon' }, { name: 'Kornet', guided: true, launcherTubes: 2 },
  { name: 'Bulat', guided: true, launcherTubes: 3 }];
const banks = { shells: rounds, launcherMuzzles: [
  ...[0, 1].map(x => ({ x, y: 0, z: 1, shellSlots: [1] })),
  ...[2, 3, 4].map(x => ({ x, y: 1, z: 0, frame: 'turret', shellSlots: [2] })),
] };
const bankCalls = [];
const mixed = { spec: { gun: banks }, combat: { launcherCursor: 0 }, visual: {
  gunMuzzleWorld(out, index, launcher) { bankCalls.push(['origin', index, launcher]); out.set(index, 0, 0); },
  gunDirWorld(out, index, launcher) { bankCalls.push(['axis', index, launcher]); out.set(0, .2, 1).normalize(); },
} };
assert.deepEqual([prepare(mixed, rounds[2]), prepare(mixed, rounds[2]), prepare(mixed, rounds[1]),
  prepare(mixed, rounds[1]), prepare(mixed, { ...rounds[2] })], [2, 3, 0, 1, 2]);
assert.deepEqual(bankCalls.filter(row => row[0] === 'origin').map(row => row.slice(1)),
  bankCalls.filter(row => row[0] === 'axis').map(row => row.slice(1)), 'origin and direction use the same tube');
assert.equal(launcherMuzzleIndex(banks, { guided: true, launcherTubes: 0 }), -1,
  'a gun-fired missile never inherits an unrelated external rack');

const effects = [], kicks = [], positions = [];
const fireMoment = privateFunction('./studio.ts', 'fireFiringMoment', {
  usesLauncherMuzzles, isUnguidedRocket, launcherMuzzleIndex,
  _v2: new Vector3(), _v3: new Vector3(), fx: { composeFiringMoment: value => effects.push(value) },
});
const actor = { spec: { gun: { caliberMm: 30, launcherMuzzles: Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 1 })), shells: [
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

actor.spec.gun.fixedLaunchCanisters = true;
actor.spec.gun.shells = [{ guided: false, type: 'HE', caliberMm: 220, velocityMps: 300 }];
fireMoment({ actor, params: {} });
assert.equal(effects.at(-1).rocket, true, 'Studio exposes an unguided rocket firing presentation');
assert.equal(effects.at(-1).velocityMps, 300);
assert.deepEqual(positions.at(-1), { index: 4, guided: true }, 'fixed rockets use real launcher mouths without guidance');
actor.spec.gun.fixedLaunchCanisters = false;
fireMoment({ actor, params: {} });
assert.equal(effects.at(-1).rocket, false, 'ordinary HE retains the cannon presentation');

// Execute the actual killcam constructors and center calculation. Its damage
// box, label center and internal proxy must share the pitching turret-rest frame.
const pb = { group: new THREE.Group(), disposables: [], obstacles: [] };
const ghostArmor = { turretPivot: [0, 1.5, .1], gunPivot: [0, 1.3, -1.3] };
const ghostPose = { pos: [4, 2, -3], yaw: .4, pitch: .07, roll: -.05, turretYaw: -.3, gunPitch: Math.PI / 4 };
const createXrayGunFrame = privateFunction('./killcam.ts', 'createXrayGunFrame', { THREE });
const createXrayPoseGroups = privateFunction('./killcam.ts', 'createXrayPoseGroups', { THREE, pb, createXrayGunFrame });
const groups = createXrayPoseGroups(ghostPose, ghostArmor);
const ghostBox = { module: 'missileRack', min: [-.3, 1.1, .35], max: [.3, 1.5, .75], turretLocal: true, gunFollow: true };
const context = { ...groups, armor: { ...ghostArmor, modules: [ghostBox] }, vehiclePose: ghostPose, anchors: new Map(), snap: {} };
const xrayBoxCenter = privateFunction('./killcam.ts', 'xrayBoxCenter', {});
const xrayBoxCorners = privateFunction('./killcam.ts', 'xrayBoxCorners', { THREE });
const centerLocal = new Vector3(0, 1.3, .55);
const expectedCenter = centerLocal.clone().sub(new Vector3(...ghostArmor.gunPivot))
  .applyAxisAngle(new Vector3(1, 0, 0), -ghostPose.gunPitch).add(new Vector3(...ghostArmor.gunPivot))
  .applyAxisAngle(new Vector3(0, 1, 0), ghostPose.turretYaw).add(new Vector3(...ghostArmor.turretPivot));
assert.ok(xrayBoxCenter(context, ghostBox, new Vector3()).distanceTo(expectedCenter) < 1e-9);
const line = new THREE.LineBasicMaterial(), fill = new THREE.MeshBasicMaterial();
const addXrayBox = privateFunction('./killcam.ts', 'addXrayBox', {
  THREE, pb, S: { edgeDim: null }, xrayBoxCorners,
  addXrayBoxTrackSlats() { assert.fail('the missile rack is not a track'); },
});
addXrayBox(context, ghostBox, 'm:missileRack', line, fill);
const expectedWorld = groups.pose.localToWorld(expectedCenter.clone());
const drawnCenter = context.anchors.get('m:missileRack').getWorldPosition(new Vector3());
assert.ok(drawnCenter.distanceTo(expectedWorld) < 1e-9, 'real x-ray frame is posed at the damage center');
assert.equal(pb.obstacles[0].parent, groups.gun, 'label avoidance uses the posed physical frame');
assert.ok(xrayBoxCenter(context, { ...ghostBox, gunFollow: false }, new Vector3()).distanceTo(expectedCenter) > .5,
  'missing-pitch mutation exposes the old stale label');
const addXrayModuleInternals = privateFunction('./killcam.ts', 'addXrayModuleInternals', {
  addInternalModuleModel, clampXrayBox: (_context, box) => box,
  proxMatForState: () => fill, xrayModuleState: () => 'ok', pb, S: { proxSteel: fill },
});
const countBefore = groups.gun.children.length;
addXrayModuleInternals(context, 'modern', 220);
assert.ok(groups.gun.children.length > countBefore, 'actual internal rack model belongs to pitching frame');
for (const geometry of pb.disposables) geometry.dispose();
line.dispose(); fill.dispose();
console.log('missilePresentation: actual killcam rack frame, center, obstacles and internal proxy pitch together PASS');
