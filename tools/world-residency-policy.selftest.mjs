import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { evaluateWorldResidency } from './world-residency-policy.mjs';

function fixture() {
  const report = {
    schemaVersion: 1,
    scenario: { production: true, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      tier: 'desktop', maps: ['verdant', 'coastal', 'winter'], sweeps: 3, settleMs: 1500, seed: 1337 },
    metadata: { browserVersion: 'Chrome/test', gpuRenderer: 'test GPU', probeHash: 'fixed-probe',
      revision: 'test-revision', sourceHash: 'test-source', buildIndexHash: 'test-build' },
    samples: [], errors: [],
  };
  let cache = [];
  for (let sweep = 0; sweep < 3; sweep++) for (const mapId of report.scenario.maps) {
    const old = cache;
    cache = [...cache.filter(id => id !== mapId), mapId].slice(-2);
    const removed = old.find(id => !cache.includes(id));
    report.samples.push({ sweep, mapId, activeMapId: mapId, worldUuid: `${mapId}-${sweep}`,
      worldIds: cache, worldLimit: 2, releaseSupported: true,
      lastRelease: removed ? { id: removed, geometries: 60, textures: 20 } : null,
      gcPasses: 2, textureReadiness: 'results-verified',
      heap: { usedSize: 20_000_000, backingStorageSize: 40_000_000, embedderHeapUsedSize: 1_000_000 },
      renderer: { geometries: 400, textures: 160, programs: 120 },
    });
  }
  return report;
}

const good = fixture();
const original = JSON.stringify(good);
assert.equal(evaluateWorldResidency(good).pass, true);
assert.equal(JSON.stringify(good), original, 'policy never mutates measured evidence');
const baseline = { ...good, ok: true, evaluation: evaluateWorldResidency(good) };
assert.equal(evaluateWorldResidency(fixture(), baseline).pass, true);

for (const key of ['geometries', 'textures', 'programs']) {
  const report = fixture(); report.samples[6].renderer[key]++;
  assert.equal(evaluateWorldResidency(report).pass, false, `${key}: one retained extra GPU resource is a failure`);
}
for (const key of ['usedSize', 'backingStorageSize', 'embedderHeapUsedSize']) {
  const report = fixture(); report.samples[6].heap[key] += 2_000_000;
  assert.equal(evaluateWorldResidency(report).pass, false, `${key}: repeated growth cannot hide behind usedJSHeapSize only`);
  delete report.samples[6].heap[key];
  assert.equal(evaluateWorldResidency(report).pass, false, `${key}: missing memory is not zero`);
}
const noGc = fixture(); noGc.samples[0].gcPasses = 0;
assert.equal(evaluateWorldResidency(noGc).pass, false, 'optional/failed forced GC never passes');
const notEvicted = fixture(); notEvicted.samples[3].lastRelease = null;
assert.equal(evaluateWorldResidency(notEvicted).pass, false, 'cache IDs alone cannot masquerade as resource disposal');
const retained = fixture(); retained.samples[3].worldUuid = retained.samples[0].worldUuid;
assert.equal(evaluateWorldResidency(retained).pass, false, 'a supposedly evicted object must actually be rebuilt');
const unbounded = fixture(); unbounded.samples[3].worldIds = ['verdant', 'coastal', 'winter'];
assert.equal(evaluateWorldResidency(unbounded).pass, false, 'cache cap is enforced');
const incomplete = fixture(); incomplete.samples.pop();
assert.equal(evaluateWorldResidency(incomplete).pass, false, 'partial sweep never produces a passing report');
const duplicated = fixture(); duplicated.samples[6] = structuredClone(duplicated.samples[7]);
assert.equal(evaluateWorldResidency(duplicated).pass, false, 'duplicated favorable maps cannot replace scenario coverage');
const wrongViewport = fixture(); wrongViewport.scenario.viewport.width = 640;
assert.equal(evaluateWorldResidency(wrongViewport, baseline).pass, false, 'baseline viewport must match');
const wrongBrowser = fixture(); wrongBrowser.metadata.browserVersion = 'another-browser';
assert.equal(evaluateWorldResidency(wrongBrowser, baseline).pass, false, 'baseline browser must match');
assert.equal(evaluateWorldResidency(fixture(), { ...baseline, evaluation: { pass: false } }).pass, false,
  'a historical non-gated ok:true receipt cannot waive failed baseline gates');

const leaking = fixture();
for (const row of leaking.samples) {
  row.renderer.textures += row.sweep * 100;
  for (const key of ['usedSize', 'backingStorageSize', 'embedderHeapUsedSize']) row.heap[key] += row.sweep * 20_000_000;
}
leaking.evaluation = evaluateWorldResidency(leaking);
leaking.ok = leaking.evaluation.pass;
const preserved = JSON.stringify(leaking);
const repaired = evaluateWorldResidency(fixture(), leaking);
assert.equal(repaired.pass, true, 'a bounded candidate may be compared with valid but leaking pristine evidence');
assert.equal(repaired.evidence.pass, true);
assert.equal(repaired.boundedness.pass, true, 'candidate strict plateau must independently pass');
assert.equal(repaired.baseline.evidence.pass, true);
assert.equal(repaired.baseline.boundedness.pass, false, 'old leak is never relabeled bounded');
assert.equal(repaired.baseline.recordedOk, false);
assert.equal(repaired.baseline.recordedPass, false);
assert.deepEqual(repaired.baseline.recordedFailures, leaking.evaluation.checks.filter(row => !row.pass),
  'every original failed gate remains attached to comparative evidence');
assert.ok(repaired.baseline.recordedFailures.length > 0);
assert.equal(JSON.stringify(leaking), preserved, 'comparison never edits the pristine evidence');
assert.equal(evaluateWorldResidency(leaking, leaking).pass, false,
  'being no worse than a leaking pristine build cannot waive a candidate leak');
const smallerLeak = fixture(); smallerLeak.samples[6].heap.usedSize += 2_000_000;
assert.equal(evaluateWorldResidency(smallerLeak, leaking).pass, false,
  'a candidate smaller than pristine must still satisfy its own strict repeat bounds');
const fakePass = structuredClone(leaking); fakePass.ok = true; fakePass.evaluation.pass = true;
assert.equal(evaluateWorldResidency(fixture(), fakePass).pass, false, 'fabricated stored success cannot override raw leaking samples');

for (const damage of [
  report => { report.samples.pop(); },
  report => { report.samples[0].gcPasses = 0; },
  report => { report.samples[3].lastRelease = null; },
  report => { report.samples[3].worldUuid = report.samples[0].worldUuid; },
  report => { for (const row of report.samples) row.worldLimit = 30; },
  report => { report.samples[3].worldIds = ['skybridge', 'verdant']; },
  report => { report.samples[6].heap.usedSize = null; },
  report => { report.samples[6].renderer.textures = -1; },
  report => { report.samples[6].renderer.programs = Infinity; },
  report => { report.samples[6].contextLost = true; },
  report => { report.samples[6].worldUuid = null; },
  report => { report.samples[6].textureReadiness = 'failed'; },
  report => { report.errors.push('required texture failed'); },
  report => { delete report.metadata.buildIndexHash; },
]) {
  const invalid = structuredClone(leaking); damage(invalid);
  const comparison = evaluateWorldResidency(fixture(), invalid);
  assert.equal(comparison.pass, false, 'failed baseline evidence is distinct from a failed boundedness gate');
  assert.equal(comparison.baseline.evidence.pass, false);
}
assert.equal(evaluateWorldResidency(fixture(), {}).pass, false, 'malformed baseline fails without throwing');
const erasedFailures = structuredClone(leaking); erasedFailures.evaluation.checks = [];
assert.equal(evaluateWorldResidency(fixture(), erasedFailures).pass, false,
  'baseline historical failures cannot be erased before comparison');

const legacyHash = '3c71ab1f982f8ceedb79c2c8ea457817f158c7476e6d93dbc16a109f15ce35ad';
const acquisitionHash = createHash('sha256').update((await Promise.all(
  ['world-residency-probe.mjs', 'render-frame-sampler.mjs', 'world-residency-acquisition.mjs']
    .map(file => readFile(new URL(file, import.meta.url), 'utf8')),
)).join('\n')).digest('hex');
const oldTool = structuredClone(leaking); oldTool.metadata.probeHash = legacyHash;
const newPolicy = fixture();
newPolicy.metadata.probeHash = 'new-policy-only-hash';
newPolicy.metadata.acquisitionHash = acquisitionHash;
assert.equal(evaluateWorldResidency(newPolicy, oldTool).pass, false,
  'scheduled LOD exhaustion changes acquisition and requires a fresh baseline');
newPolicy.metadata.acquisitionHash = '563c1f4c0045545893ed14dd5018f210a61aec6ef501b18b86b0faf814ed0926';
assert.equal(evaluateWorldResidency(newPolicy, oldTool).pass, true,
  'historical unchanged default reports retain their explicitly reviewed compatibility');
newPolicy.metadata.acquisitionHash = 'changed-acquisition';
assert.equal(evaluateWorldResidency(newPolicy, oldTool).pass, false,
  'changed browser collection code cannot reuse the reviewed legacy acquisition bridge');
newPolicy.metadata.acquisitionHash = acquisitionHash;
oldTool.metadata.probeHash = 'unreviewed-legacy-driver';
assert.equal(evaluateWorldResidency(newPolicy, oldTool).pass, false,
  'unknown legacy combined hashes never receive an implicit compatibility waiver');
const newBaseline = structuredClone(baseline);
newBaseline.metadata.acquisitionHash = acquisitionHash;
assert.equal(evaluateWorldResidency(newPolicy, newBaseline).pass, true,
  'new receipts compare acquisition identity independently from policy identity');
newBaseline.metadata.acquisitionHash = 'changed-acquisition';
assert.equal(evaluateWorldResidency(newPolicy, newBaseline).pass, false);
const settled = fixture();
settled.scenario.acquisition = { terrain: 'countdown-lookahead-v1' };
settled.metadata.acquisitionHash = acquisitionHash;
for (const row of settled.samples) row.terrainWarm = {
  protocol: 'countdown-lookahead-v1', jobs: 42, exhausted: true, verified: true, pendingAfterRender: 0,
  topology: { worldUuid: row.worldUuid, camera: [1, 2, 3, 0, 0, 0, 1],
    initialGeometryCount: 64, streamedGeometryCount: 42, indexReferences: 106 },
};
const settledBaseline = { ...settled, ok: true, evaluation: evaluateWorldResidency(settled) };
assert.equal(evaluateWorldResidency(settled, settledBaseline).pass, true);
const sameHashOldProtocol = structuredClone(baseline);
sameHashOldProtocol.metadata.acquisitionHash = acquisitionHash;
assert.equal(evaluateWorldResidency(settled, sameHashOldProtocol).pass, false,
  'even a matching hash cannot hide an old walltime-only acquisition scenario');
for (const damage of [
  row => { delete row.terrainWarm; },
  row => { row.terrainWarm.jobs = 256; },
  row => { row.terrainWarm.pendingAfterRender = 1; },
  row => { row.terrainWarm.verified = false; },
  row => { row.terrainWarm.topology.camera[0] = Infinity; },
  row => { row.terrainWarm.topology.worldUuid = 'discarded-world'; },
  row => { row.terrainWarm.topology.streamedGeometryCount = -1; },
]) {
  const invalid = structuredClone(settled); damage(invalid.samples[6]);
  assert.equal(evaluateWorldResidency(invalid).evidence.pass, false, 'settled topology requires actual valid receipts');
}
const diagnosed = fixture();
diagnosed.scenario.diagnostics = { geometryInventory: true, heapSnapshots: [], warmTerrain: true };
diagnosed.metadata.diagnosticsHash = 'diagnostics-code';
assert.equal(evaluateWorldResidency(diagnosed, baseline).pass, false,
  'native snapshot/tracker/forced-LOD diagnostic scenarios cannot replace default acquisition evidence');
const oldApi = fixture();
for (const row of oldApi.samples) {
  row.worldIds = null; row.worldLimit = null; row.releaseSupported = false; row.textureReadiness = 'promise-only';
}
const unsupported = evaluateWorldResidency(oldApi);
assert.equal(unsupported.pass, true, 'legacy API still allows the measured heap/renderer boundedness check');
assert.ok(unsupported.unsupported.includes('world cache membership/limit'));
assert.ok(unsupported.unsupported.includes('per-texture success receipts'));
console.log('world-residency-policy.selftest: strict candidate bounds, valid failed baseline evidence, preserved failures, adversarial receipts and acquisition identity passed');
