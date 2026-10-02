// The fleet pass harness (fleetPass.test-support.mjs) on a scripted factory, no fleet build: one construction per tank
// shared in declared order, synchronous checks before the build's microtasks and async ones after one turn, the
// shared-build guard (pose and mesh bytes), failure isolation with a fresh build for the remaining audits, coverage
// rosters, setup and build failures, and a final error that names every failed audit and tank.
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { runFleetPass } from './fleetPass.test-support.mjs';

function scriptedFactory() {
  const built = [], disposed = [];
  const createTank = (id, engine, build) => {
    assert.equal(engine, null);
    built.push({ id, build });
    const root = new Group(), turret = new Group(), mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    turret.name = 'rig_turret';
    root.add(turret);
    turret.add(mesh);
    // like kf51's builder: a microtask rewrites the merged mesh after createTank returns
    queueMicrotask(() => { mesh.geometry.attributes.uv.array[0] = 0.5; mesh.userData.remapped = true; });
    return { root, mesh, turret, dispose: () => disposed.push(id) };
  };
  return { createTank, built, disposed };
}

const quiet = { log: () => {}, logError: () => {} };
const failureOf = async (pass) => {
  try { await runFleetPass({ ...quiet, ...pass }); } catch (error) { return error; }
  assert.fail(`${pass.name}: expected the pass to fail`);
};

{
  // one build per tank, shared in declared order; sync checks never yield, async checks see the build after one turn
  const factory = scriptedFactory();
  const seen = [];
  const audit = (name, { async = false } = {}) => ({
    name,
    create: () => async
      ? { async check(id, tank) { seen.push([name, id, tank.mesh.userData.remapped === true]); }, finish() { seen.push([name, 'finish']); } }
      : { check(id, tank) { seen.push([name, id, tank.mesh.userData.remapped === true]); }, finish() { seen.push([name, 'finish']); } },
  });
  const result = await runFleetPass({ ...quiet, name: 'order', build: { quality: 'high' }, ids: ['a', 'b'],
    createTank: factory.createTank, audits: [audit('first'), audit('second'), audit('third', { async: true }), audit('fourth')] });
  assert.deepEqual(result, { tanks: 2, builds: 2 });
  assert.deepEqual(factory.built, [{ id: 'a', build: { quality: 'high' } }, { id: 'b', build: { quality: 'high' } }]);
  assert.deepEqual(factory.disposed, ['a', 'b'], 'every build is disposed once');
  assert.deepEqual(seen, [
    ['first', 'a', false], ['second', 'a', false], ['third', 'a', true], ['fourth', 'a', true],
    ['first', 'b', false], ['second', 'b', false], ['third', 'b', true], ['fourth', 'b', true],
    ['first', 'finish'], ['second', 'finish'], ['third', 'finish'], ['fourth', 'finish'],
  ], 'synchronous audits see the build as createTank returned it; the async one and those after it see it after one turn');
}

{
  // the guard: an audit that leaves a pose or mesh bytes changed fails and the next audit gets a fresh build;
  // an audit that restores what it poses passes; the last audit may pose
  const factory = scriptedFactory();
  const received = [];
  const error = await failureOf({ name: 'guard', build: {}, ids: ['a', 'b'], createTank: factory.createTank, audits: [
    { name: 'restores', create: () => ({ check(id, tank) {
      const yaw = tank.turret.rotation.y;
      tank.turret.rotation.y = Math.PI / 2;
      tank.turret.rotation.y = yaw;
    } }) },
    { name: 'poses', create: () => ({ check(id, tank) { if (id === 'a') tank.turret.rotation.y = 0.3; } }) },
    { name: 'paints', create: () => ({ check(id, tank) { received.push([id, tank.turret.rotation.y]); if (id === 'b') tank.mesh.geometry.attributes.position.array[0] += 1; } }) },
    { name: 'last', create: () => ({ check(id, tank) { received.push(['last', id, tank.turret.rotation.y]); tank.turret.rotation.y = 1; } }) },
  ] });
  assert.match(error.message, /^guard: 2 of 4 fleet audits failed$/m);
  assert.match(error.message, /\[poses\] a: a: poses left the shared build changed \(Group\/rig_turret quaternion\.y\)/);
  assert.match(error.message, /\[paints\] b: b: paints left the shared build changed \(mesh geometry, instances or materials\)/);
  assert.doesNotMatch(error.message, /\[restores\]|\[last\]/, 'restoring audits and the last audit pass');
  assert.deepEqual(received, [['a', 0], ['last', 'a', 0], ['b', 0], ['last', 'b', 0]],
    'the audits after a guard failure read a fresh build');
  assert.deepEqual(factory.built.map((row) => row.id), ['a', 'a', 'b', 'b'], 'one rebuild after each guard failure');
  assert.deepEqual(factory.disposed, ['a', 'a', 'b', 'b'], 'a discarded build is disposed too');
}

{
  // isolation: a failing audit stops receiving tanks and skips finish(); the others go on; its message keeps the values
  const factory = scriptedFactory();
  const calls = { steady: [], flaky: [] };
  const finished = [];
  const error = await failureOf({ name: 'isolation', build: {}, ids: ['a', 'b', 'c'], createTank: factory.createTank, audits: [
    { name: 'flaky', create: () => ({ check(id) { calls.flaky.push(id); assert.equal(id, 'a', `${id}: only a passes`); }, finish() { finished.push('flaky'); } }) },
    { name: 'steady', create: () => ({ check(id) { calls.steady.push(id); }, finish() { finished.push('steady'); } }) },
  ] });
  assert.deepEqual(calls, { flaky: ['a', 'b'], steady: ['a', 'b', 'c'] });
  assert.deepEqual(finished, ['steady'], 'finish() runs only for audits that never failed');
  assert.match(error.message, /^isolation: 1 of 2 fleet audits failed\n {2}\[flaky\] b: b: only a passes\n/);
  assert.match(error.message, /^ {6}'b' !== 'a'$/m, 'the original assertion values are quoted under the audit line');
}

{
  // coverage rosters, a setup failure, a build failure and a finish failure are each named
  const factory = scriptedFactory();
  const createTank = (id, engine, build) => {
    if (id === 'broken') throw new Error('builder exploded');
    return factory.createTank(id, engine, build);
  };
  const covered = [];
  const error = await failureOf({ name: 'named', build: {}, ids: ['a', 'broken', 'c'], createTank, audits: [
    { name: 'partial', ids: ['broken', 'c'], create: () => ({ check(id) { covered.push(id); } }) },
    { name: 'setupFails', create: () => { throw new Error('generator source drifted'); } },
    { name: 'counts', create: () => ({ check() {}, finish() { assert.fail('fleet floor not reached'); } }) },
  ] });
  assert.deepEqual(covered, [], 'the build failure at "broken" stops every audit pending there, so none reaches "c"');
  assert.match(error.message, /^named: 3 of 3 fleet audits failed$/m);
  assert.match(error.message, /\[setupFails\] setup: generator source drifted/);
  assert.match(error.message, /\[partial\] broken: builder exploded/);
  assert.match(error.message, /\[counts\] broken: builder exploded/);
  assert.doesNotMatch(error.message, /fleet floor not reached/, 'a failed audit runs no finish()');
  const roster = [];
  await runFleetPass({ ...quiet, name: 'roster', build: {}, ids: ['a', 'b', 'c'], createTank: factory.createTank, audits: [
    { name: 'some', ids: new Set(['b']), create: () => ({ check(id) { roster.push(id); } }) },
  ] });
  assert.deepEqual(roster, ['b'], 'an audit receives only the ids it covers');
  const finishError = await failureOf({ name: 'finish', build: {}, ids: ['a'], createTank: factory.createTank, audits: [
    { name: 'counts', create: () => ({ check() {}, finish() { assert.fail('fleet floor not reached'); } }) },
  ] });
  assert.match(finishError.message, /\[counts\] fleet: fleet floor not reached/);
  await assert.rejects(runFleetPass({ ...quiet, name: 'dupe', build: {}, ids: ['a'], createTank: factory.createTank, audits: [
    { name: 'x', create: () => ({ check() {} }) }, { name: 'x', create: () => ({ check() {} }) },
  ] }), /dupe: name each fleet audit once/);
  await assert.rejects(runFleetPass({ ...quiet, name: 'nofactory', build: {}, ids: ['a'], audits: [
    { name: 'x', create: () => ({ check() {} }) },
  ] }), /nofactory: pass createTank from tankFactory\.ts/);
}

console.log('fleetPass.selftest: shared builds in declared order, the microtask turn, the shared-build guard, isolation and named failures pass');
