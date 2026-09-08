// Numeric evidence policy only; importing this module never starts a browser.
import { PINNED_SCENE, isPinnedSceneReceipt } from './pinned-scene-acquisition.mjs';
import {
  RESIDENCY_CAMERA_PROTOCOL, cameraManifestValid, isCameraStateReceipt,
} from './residency-camera-acquisition.mjs';

// v3 requires actual pinned scene and absolute camera identities. Earlier reports remain evidence
// under their original evaluator, never a matched baseline for this protocol.
export const RESIDENCY_SCHEMA = 3;
export const RESIDENCY_LIMITS = Object.freeze({
  repeatHeapBytes: 1_048_576,
  repeatHeapFraction: 0.01,
  comparisonHeapBytes: 2_097_152,
  comparisonHeapFraction: 0.02,
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (checks, name, pass, actual, expected) => {
  checks.push({ name, pass: Boolean(pass), actual, expected });
};
const result = checks => ({ pass: checks.every(row => row.pass), checks });

function sameAcquisition(before, after) {
  return typeof before.acquisitionHash === 'string' && before.acquisitionHash.length > 0
    && before.acquisitionHash === after.acquisitionHash;
}

function compareSamples(checks, label, before, after, comparison) {
  check(checks, `${label} matched cache`, same(before.worldIds, after.worldIds),
    after.worldIds, before.worldIds);
  check(checks, `${label} matched actual scene`, same(before.sceneIdentity, after.sceneIdentity),
    after.sceneIdentity, before.sceneIdentity);
  check(checks, `${label} matched actual camera and render state`, same(before.cameraState, after.cameraState),
    after.cameraState, before.cameraState);
  // Independent browser worlds have different UUIDs. The acquired view and
  // production LOD counts must still agree; fewer uploaded resources from a
  // different camera is not a successful memory comparison.
  for (const key of ['camera', 'initialGeometryCount', 'streamedGeometryCount', 'indexReferences']) {
    check(checks, `${label} matched terrain ${key}`,
      same(before.terrainWarm?.topology?.[key], after.terrainWarm?.topology?.[key]),
      after.terrainWarm?.topology?.[key], before.terrainWarm?.topology?.[key]);
  }
  for (const key of ['geometries', 'textures', 'programs']) {
    check(checks, `${label} renderer ${key}`, after.renderer[key] <= before.renderer[key],
      after.renderer[key] - before.renderer[key], '<= 0 retained count growth');
  }
  for (const key of ['usedSize', 'backingStorageSize', 'embedderHeapUsedSize']) {
    const absolute = comparison ? RESIDENCY_LIMITS.comparisonHeapBytes : RESIDENCY_LIMITS.repeatHeapBytes;
    const fraction = comparison ? RESIDENCY_LIMITS.comparisonHeapFraction : RESIDENCY_LIMITS.repeatHeapFraction;
    const tolerance = Math.max(absolute, before.heap[key] * fraction);
    check(checks, `${label} ${key}`, Number.isFinite(before.heap[key]) && Number.isFinite(after.heap[key])
      && after.heap[key] <= before.heap[key] + tolerance,
    after.heap[key] - before.heap[key], `<= ${Math.ceil(tolerance)} bytes (declared measurement tolerance)`);
  }
}

function checkEviction(checks, unsupported, row, previous, label) {
  if (!row.releaseSupported) unsupported.add('world disposal receipt');
  if (row.worldIds === null || row.worldLimit === null) {
    unsupported.add('world cache membership/limit');
    return;
  }
  check(checks, `${label} bounded cache`, row.worldIds.length <= row.worldLimit
    && row.worldIds.includes(row.mapId), row.worldIds, `<= ${row.worldLimit}, including active map`);
  const removed = (previous?.worldIds || []).filter(id => !row.worldIds.includes(id));
  if (!removed.length || !row.releaseSupported) return;
  check(checks, `${label} actual eviction`, removed.length === 1
    && row.lastRelease?.id === removed[0] && row.lastRelease.geometries > 0
    && row.lastRelease.textures > 0,
  row.lastRelease, `disposed ${removed.join(', ')}, including geometry and textures`);
}

function checkExpectedCache(report, checks, row, index, label) {
  if (row.worldIds === null || row.worldLimit === null) return;
  const limit = report.scenario.tier === 'mobile' ? 1 : 2;
  check(checks, `${label} measured cache policy`, row.worldLimit === limit, row.worldLimit, limit);
  const expected = report.samples.slice(Math.max(0, index + 1 - limit), index + 1).map(sample => sample.mapId);
  check(checks, `${label} expected cache occupants`, same(row.worldIds, expected), row.worldIds, expected);
}

function checkTerrainSettlement(checks, row, label) {
  const receipt = row.terrainWarm, topology = receipt?.topology;
  check(checks, `${label} exact scheduled terrain settled`,
    receipt?.protocol === 'countdown-lookahead-v1' && receipt.exhausted === true
    && receipt.verified === true && receipt.pendingAfterRender === 0
    && Number.isInteger(receipt.jobs) && receipt.jobs >= 0 && receipt.jobs < 256,
  receipt ?? null, 'bounded 0/1 production queue exhausted, then unchanged through actual frames');
  check(checks, `${label} terrain topology receipt`, Boolean(topology)
    && topology.worldUuid === row.worldUuid
    && Array.isArray(topology.camera) && topology.camera.length === 7 && topology.camera.every(Number.isFinite)
    && ['initialGeometryCount', 'streamedGeometryCount', 'indexReferences']
      .every(key => Number.isInteger(topology[key]) && topology[key] >= 0),
  topology ?? null, 'same world, finite camera pose, actual nonnegative topology counts');
}

function checkCamera(checks, row, label, manifest, viewport) {
  const expected = manifest?.content.maps.find(camera => camera.mapId === row.mapId) ?? null;
  check(checks, `${label} absolute camera and native render state`,
    isCameraStateReceipt(row.cameraState, expected, viewport),
    row.cameraState ?? null, 'exact manifest camera and actual native, untrimmed render settings');
  check(checks, `${label} terrain acquired for manifest camera`, expected
    && same(row.terrainWarm?.topology?.camera, [...expected.position, ...expected.quaternion]),
  row.terrainWarm?.topology?.camera ?? null, expected);
}

function checkSamples(report, checks, unsupported) {
  const { maps, sweeps } = report.scenario;
  const manifest = cameraManifestValid(report.scenario.cameraManifest, maps) ? report.scenario.cameraManifest : null;
  check(checks, 'complete repeat sweep', report.samples.length === maps.length * sweeps,
    report.samples.length, maps.length * sweeps);
  let previous = null;
  const seenWorlds = new Map();
  for (const [index, row] of report.samples.entries()) {
    const label = `sweep${row.sweep}/${row.mapId}`;
    check(checks, `${label} ordered scenario`, row.mapId === maps[index % maps.length]
      && row.sweep === Math.floor(index / maps.length), [row.sweep, row.mapId],
    [Math.floor(index / maps.length), maps[index % maps.length]]);
    check(checks, `${label} strict post-GC receipt`, row.gcPasses === 2,
      row.gcPasses, '2 successful CDP collections');
    for (const key of ['usedSize', 'backingStorageSize', 'embedderHeapUsedSize']) {
      check(checks, `${label} measured ${key}`, Number.isFinite(row.heap[key]) && row.heap[key] >= 0,
        row.heap[key] ?? null, 'finite CDP byte count, never a missing-value zero');
    }
    for (const key of ['geometries', 'textures', 'programs']) {
      check(checks, `${label} measured renderer ${key}`,
        Number.isInteger(row.renderer[key]) && row.renderer[key] >= 0,
        row.renderer[key] ?? null, 'finite nonnegative renderer resource count');
    }
    check(checks, `${label} valid world identity`, typeof row.worldUuid === 'string' && row.worldUuid.length > 0,
      row.worldUuid, 'nonempty world root UUID');
    check(checks, `${label} live graphics context`, row.contextLost !== true, row.contextLost ?? null, 'not lost');
    check(checks, `${label} active map`, row.activeMapId === row.mapId, row.activeMapId, row.mapId);
    checkTerrainSettlement(checks, row, label);
    check(checks, `${label} pinned actual scene`, isPinnedSceneReceipt(row.sceneIdentity),
      row.sceneIdentity ?? null, 'fixed ordered M1A2 player, lineup, teams and visual spec identities');
    checkCamera(checks, row, label, manifest, report.scenario.viewport);
    checkExpectedCache(report, checks, row, index, label);
    checkEviction(checks, unsupported, row, previous, label);
    const earlier = seenWorlds.get(row.mapId);
    if (earlier && previous?.worldIds && !previous.worldIds.includes(row.mapId)) {
      check(checks, `${label} evicted world rebuilt`, row.worldUuid !== earlier,
        row.worldUuid, `new root, not previously evicted ${earlier}`);
    }
    seenWorlds.set(row.mapId, row.worldUuid);
    if (row.textureReadiness !== 'results-verified') unsupported.add('per-texture success receipts');
    check(checks, `${label} texture settle status`,
      ['results-verified', 'promise-only', 'unsupported'].includes(row.textureReadiness),
      row.textureReadiness, 'verified or explicitly unsupported legacy API, not a failed load');
    previous = row;
  }
}

function hasReportShape(report) {
  return report && report.scenario && report.metadata && Array.isArray(report.errors)
    && Array.isArray(report.scenario.maps) && Array.isArray(report.samples)
    && report.samples.every(row => row && row.heap && row.renderer
      && (row.worldIds === null || Array.isArray(row.worldIds)));
}

function checkScenario(report, checks) {
  const { scenario, metadata } = report;
  check(checks, 'receipt schema', report.schemaVersion === RESIDENCY_SCHEMA, report.schemaVersion, RESIDENCY_SCHEMA);
  check(checks, 'at least one warm and two measured sweeps', Number.isInteger(scenario.sweeps) && scenario.sweeps >= 3,
    scenario.sweeps, 'integer >= 3');
  check(checks, 'scenario can force world eviction', new Set(scenario.maps).size >= 3
    && new Set(scenario.maps).size === scenario.maps.length, scenario.maps, '>= 3 unique maps');
  for (const key of ['browserVersion', 'gpuRenderer', 'probeHash', 'acquisitionHash', 'revision', 'sourceHash']) {
    check(checks, `measured metadata ${key}`, typeof metadata[key] === 'string' && metadata[key].length > 0,
      metadata[key] ?? null, 'recorded nonempty identity');
  }
  check(checks, 'production build identity', !scenario.production
    || typeof metadata.buildIndexHash === 'string' && metadata.buildIndexHash.length > 0,
  metadata.buildIndexHash ?? null, 'built index hash when using production');
  if (scenario.diagnostics) {
    check(checks, 'diagnostic implementation identity', typeof metadata.diagnosticsHash === 'string'
      && metadata.diagnosticsHash.length > 0, metadata.diagnosticsHash ?? null, 'recorded instrumentation identity');
  }
  check(checks, 'known terrain and scene acquisition protocol',
    same(scenario.acquisition, { terrain: 'countdown-lookahead-v1', scene: PINNED_SCENE.protocol,
      camera: RESIDENCY_CAMERA_PROTOCOL }),
    scenario.acquisition ?? null, 'countdown-lookahead-v1 plus fixed roster and absolute camera');
  check(checks, 'fixed declared scene', same(scenario.scene, PINNED_SCENE),
    scenario.scene ?? null, PINNED_SCENE);
  check(checks, 'immutable absolute camera manifest', cameraManifestValid(scenario.cameraManifest, scenario.maps),
    scenario.cameraManifest ?? null, 'valid content hash, finite cameras, source provenance and complete map coverage');
}

function evaluateLocal(report) {
  const evidence = [], boundedness = [], unsupported = new Set();
  check(evidence, 'usable report structure', hasReportShape(report), Boolean(report), 'scenario, metadata, errors and scalar samples');
  if (!evidence[0].pass) return { evidence: result(evidence), boundedness: result([]), unsupported: [] };
  checkScenario(report, evidence);
  checkSamples(report, evidence, unsupported);
  const warm = new Map(report.samples.filter(row => row.sweep === 1).map(row => [row.mapId, row]));
  for (const row of report.samples.filter(row => row.sweep >= 2)) {
    const before = warm.get(row.mapId);
    if (before) compareSamples(boundedness, `repeat/${row.sweep}/${row.mapId}`, before, row, false);
  }
  check(evidence, 'no browser or required resource errors', report.errors.length === 0, report.errors, []);
  return { evidence: result(evidence), boundedness: result(boundedness), unsupported: [...unsupported].sort() };
}

function compareBaseline(report, baseline, local, checks) {
  const verified = evaluateLocal(baseline);
  check(checks, 'baseline measurement evidence valid', verified.evidence.pass,
    verified.evidence.checks.filter(row => !row.pass), 'complete, valid measured evidence (not necessarily bounded)');
  const recomputedPass = verified.evidence.pass && verified.boundedness.pass;
  check(checks, 'baseline recorded outcome agrees with raw evidence', baseline.ok === recomputedPass
    && baseline.evaluation?.pass === recomputedPass,
  { ok: baseline.ok ?? null, pass: baseline.evaluation?.pass ?? null }, { ok: recomputedPass, pass: recomputedPass });
  const recordedChecks = baseline.evaluation?.checks;
  const recomputedFailures = [...verified.evidence.checks, ...verified.boundedness.checks]
    .filter(row => !row.pass);
  const recordedFailures = Array.isArray(recordedChecks) ? recordedChecks.filter(row => !row?.pass) : [];
  check(checks, 'baseline original gate records retained', Array.isArray(recordedChecks)
    && recordedChecks.length > 0 && same(recordedFailures, recomputedFailures),
  recordedFailures, recomputedFailures);
  const summary = {
    evidence: verified.evidence, boundedness: verified.boundedness,
    recordedOk: baseline.ok ?? null, recordedPass: baseline.evaluation?.pass ?? null,
    recordedFailures,
    unsupported: verified.unsupported,
  };
  if (!verified.evidence.pass || !local.evidence.pass) return summary;
  for (const key of ['production', 'viewport', 'tier', 'maps', 'sweeps', 'settleMs', 'seed', 'diagnostics', 'acquisition', 'scene', 'cameraManifest']) {
    check(checks, `baseline matched ${key}`, same(baseline.scenario[key], report.scenario[key]),
      report.scenario[key], baseline.scenario[key]);
  }
  for (const key of ['browserVersion', 'gpuRenderer']) {
    check(checks, `baseline matched ${key}`, same(baseline.metadata[key], report.metadata[key]),
      report.metadata[key], baseline.metadata[key]);
  }
  if (report.scenario.diagnostics) {
    check(checks, 'baseline matched diagnostics implementation',
      report.metadata.diagnosticsHash === baseline.metadata.diagnosticsHash,
      report.metadata.diagnosticsHash, baseline.metadata.diagnosticsHash);
  }
  check(checks, 'baseline matched acquisition protocol', sameAcquisition(baseline.metadata, report.metadata),
    { probeHash: report.metadata.probeHash, acquisitionHash: report.metadata.acquisitionHash },
    { probeHash: baseline.metadata.probeHash, acquisitionHash: baseline.metadata.acquisitionHash });
  const oldRows = new Map(baseline.samples.map(row => [`${row.sweep}/${row.mapId}`, row]));
  for (const row of report.samples.filter(row => row.sweep >= 1)) {
    const before = oldRows.get(`${row.sweep}/${row.mapId}`);
    if (before) compareSamples(checks, `pristine/${row.sweep}/${row.mapId}`, before, row, true);
    else check(checks, `pristine/${row.sweep}/${row.mapId} exists`, false, null, 'matched sample');
  }
  return summary;
}

export function evaluateWorldResidency(report, baseline = null) {
  const local = evaluateLocal(report);
  const checks = [...local.evidence.checks, ...local.boundedness.checks];
  let baselineResult = null;
  if (baseline) {
    baselineResult = compareBaseline(report, baseline, local, checks);
  }
  return { ...result(checks), ...local, baseline: baselineResult, limits: RESIDENCY_LIMITS };
}
