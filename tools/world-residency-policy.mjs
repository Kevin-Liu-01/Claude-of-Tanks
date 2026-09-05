// Numeric evidence policy only; importing this module never starts a browser.
export const RESIDENCY_SCHEMA = 1;
export const RESIDENCY_LIMITS = Object.freeze({
  repeatHeapBytes: 1_048_576,
  repeatHeapFraction: 0.01,
  comparisonHeapBytes: 2_097_152,
  comparisonHeapFraction: 0.02,
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// The first pristine receipt predates the separate acquisition hash. This
// exact historical combined hash used the identical default browser/GC
// driver. Reviewed successors add identity metadata and opt-in diagnostics
// only; diagnostic scenarios cannot be compared with uninstrumented runs.
// Unknown old tool hashes are deliberately NOT compatible.
const LEGACY_ACQUISITION = Object.freeze({
  '3c71ab1f982f8ceedb79c2c8ea457817f158c7476e6d93dbc16a109f15ce35ad':
    'b33b02bc32a7b084f0d227278df6a48049b499156ccac2632a2ef1ad7a47b143',
});
const DEFAULT_ACQUISITION_COMPATIBILITY = Object.freeze({
  '563c1f4c0045545893ed14dd5018f210a61aec6ef501b18b86b0faf814ed0926':
    'b33b02bc32a7b084f0d227278df6a48049b499156ccac2632a2ef1ad7a47b143',
});
const check = (checks, name, pass, actual, expected) => {
  checks.push({ name, pass: Boolean(pass), actual, expected });
};
const result = checks => ({ pass: checks.every(row => row.pass), checks });

function acquisitionIdentity(metadata) {
  const hash = metadata.acquisitionHash || LEGACY_ACQUISITION[metadata.probeHash] || null;
  return DEFAULT_ACQUISITION_COMPATIBILITY[hash] || hash;
}

function sameAcquisition(before, after) {
  const oldHash = acquisitionIdentity(before), newHash = acquisitionIdentity(after);
  if (oldHash || newHash) return oldHash !== null && oldHash === newHash;
  return typeof before.probeHash === 'string' && before.probeHash === after.probeHash;
}

function compareSamples(checks, label, before, after, comparison) {
  check(checks, `${label} matched cache`, same(before.worldIds, after.worldIds),
    after.worldIds, before.worldIds);
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

function checkSamples(report, checks, unsupported) {
  const { maps, sweeps } = report.scenario;
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
    if (report.scenario.acquisition) checkTerrainSettlement(checks, row, label);
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
  for (const key of ['browserVersion', 'gpuRenderer', 'probeHash', 'revision', 'sourceHash']) {
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
  if (scenario.acquisition) {
    check(checks, 'known terrain acquisition protocol',
      same(scenario.acquisition, { terrain: 'countdown-lookahead-v1' }), scenario.acquisition,
      'countdown-lookahead-v1');
  }
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
  check(checks, 'baseline original gate records retained', Array.isArray(baseline.evaluation?.checks)
    && baseline.evaluation.checks.length > 0,
  baseline.evaluation?.checks?.length ?? null, 'original recorded checks, including every failure');
  const summary = {
    evidence: verified.evidence, boundedness: verified.boundedness,
    recordedOk: baseline.ok ?? null, recordedPass: baseline.evaluation?.pass ?? null,
    recordedFailures: baseline.evaluation?.checks?.filter(row => !row.pass) || [],
    unsupported: verified.unsupported,
  };
  if (!verified.evidence.pass || !local.evidence.pass) return summary;
  for (const key of ['production', 'viewport', 'tier', 'maps', 'sweeps', 'settleMs', 'seed', 'diagnostics', 'acquisition']) {
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
    { probeHash: report.metadata.probeHash, acquisitionHash: acquisitionIdentity(report.metadata) },
    { probeHash: baseline.metadata.probeHash, acquisitionHash: acquisitionIdentity(baseline.metadata) });
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
