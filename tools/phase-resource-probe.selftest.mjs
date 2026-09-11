import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasFreshPhaseResourceFrame } from './phase-resource-frame-accounting.mjs';

// The CLI starts a real browser at module scope. Execute its actual pure budget
// section without launching a server, rather than duplicating policy predicates.
const source = readFileSync(new URL('./phase-resource-probe.mjs', import.meta.url), 'utf8');
function section(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing probe section: ${start}`);
  return source.slice(from, to);
}
const evaluate = new Function('hasFreshPhaseResourceFrame',
  section('const RESOURCE_BUDGETS =', 'const server =')
    + section('const checkResourceLimits =', 'const url =')
    + '\nreturn evaluateBudgets;')(hasFreshPhaseResourceFrame);
const battlePolicy = 'active battle releases only detached desktop Garage geometry buffers';
const returnPolicy = 'returned Garage completes desktop geometry-buffer restoration';
const release = { objects: 658, geometries: 382, materials: 0, textures: 0 };
function fixture() {
  return ['garage-idle', 'battle-active', 'garage-returned'].map((name, index) => ({
    name,
    resources: {
      phase: index === 1 ? 'battle' : 'garage', renderer: {},
      caches: { garageGpuResidency: {
        suspended: index === 1, releases: index ? 1 : 0,
        resumes: index === 2 ? 1 : 0, resumeFailures: 0, invalidations: 0,
        lastRelease: index ? { ...release } : null,
      } },
    },
  }));
}
function policy(phases, name) {
  const check = evaluate(phases).checks.find(entry => entry.name === name);
  assert.ok(check, `policy gate is missing: ${name}`);
  return check;
}
const valid = fixture();
assert.equal(policy(valid, battlePolicy).pass, true);
assert.equal(policy(valid, returnPolicy).pass, true);
for (const [index, name] of [[1, battlePolicy], [2, returnPolicy]]) {
  const cases = [
    stats => { stats.suspended = !stats.suspended; },
    stats => { stats.releases = 0; },
    stats => { stats.releases = 2; },
    stats => { stats.resumes = index === 1 ? 1 : 0; },
    stats => { stats.resumeFailures = 1; },
    stats => { stats.invalidations = 1; },
    stats => { delete stats.resumeFailures; },
    stats => { delete stats.invalidations; },
    stats => { stats.lastRelease = null; },
    stats => { stats.lastRelease.geometries = 0; },
    stats => { stats.lastRelease.geometries = Infinity; },
    stats => { stats.lastRelease.geometries = 0.5; },
    stats => { stats.lastRelease.materials = 1; },
    stats => { stats.lastRelease.textures = 1; },
    stats => { delete stats.lastRelease.materials; },
    stats => { delete stats.lastRelease.textures; },
  ];
  for (const [caseIndex, mutate] of cases.entries()) {
    const phases = fixture();
    mutate(phases[index].resources.caches.garageGpuResidency);
    assert.equal(policy(phases, name).pass, false, `${name}: negative ${caseIndex}`);
  }
  const missing = fixture();
  delete missing[index].resources.caches.garageGpuResidency;
  assert.equal(policy(missing, name).pass, false, `${name}: absent receipt`);
}
// Successful owner restoration cannot mask resource or timing failures. Keep
// these independent release limits at their existing values and failure rows.
const exceeded = fixture();
exceeded[0].resources.renderer.triangles = 240001;
exceeded[1].resources.renderer.geometries = 681;
exceeded[1].resources.sceneMaterials = 221;
exceeded[1].taskMsPerRender = 11.6;
exceeded[2].resources.renderer.triangles = 240001;
const result = evaluate(exceeded);
assert.equal(result.pass, false);
for (const [name, limit] of [
  ['garage idle complete-frame triangles', '<= 240000'],
  ['active battle renderer geometries', '<= 680'],
  ['active battle visible sceneMaterials', '<= 220'],
  ['active battle main-thread cost per rendered frame', '<= 11.5 ms/render'],
  ['returned Garage complete-frame triangles', '<= 240000'],
]) {
  const row = result.checks.find(entry => entry.name === name);
  assert.equal(row?.pass, false, name);
  assert.equal(row.limit, limit, name);
  assert.ok(row.actual > Number(limit.match(/[\d.]+/)[0]), `${name}: retain raw overage`);
}
assert.equal(policy(exceeded, battlePolicy).pass, true);
assert.equal(policy(exceeded, returnPolicy).pass, true);
console.log('phase-resource-probe: strict geometry-only suspension/restoration, missing/failed receipts and independent caps PASS');
