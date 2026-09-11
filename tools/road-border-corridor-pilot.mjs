// Four-map CPU geometry assessment, not native, population or timing evidence.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHeightField } from '../src/world/terrain.ts';
import { MAP_IDS, getMapConfig } from '../src/world/maps/index.ts';
import { ROAD_ENDPOINT_INTENTS, roadNetworkComponentCount } from '../src/world/maps/roadEndpoints.ts';
import { shorelineDistance } from '../src/world/shoreline.ts';
import { createCaptureLock } from './capture-lock.mjs';
import { AUTHORED_EXIT_FIXTURE, assertAuthoredExitConfig, authoredApproachEntries,
  withAuthoredExits } from './road-authored-exit-fixture.mjs';

const baselineRoot = process.argv.find(a => a.startsWith('--baseline-root='))?.slice(16);
const priorRoot = process.argv.find(a => a.startsWith('--prior-root='))?.slice(13);
const output = process.argv.find(a => a.startsWith('--out='))?.slice(6);
const matchedAuthoredLayout = process.argv.includes('--matched-authored-layout');
if (!baselineRoot || !priorRoot || !output) throw new Error('Require --baseline-root=<frozen-a643-road-worktree> --prior-root=<frozen-R3-worktree> --out=<fresh-json>');
const root = resolve(baselineRoot), baselineHead = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.ok(baselineHead.startsWith('a643b55c8'));
assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }), '');
const beforeTerrain = await import(pathToFileURL(resolve(root, 'src/world/terrain.ts')));
const beforeMaps = await import(pathToFileURL(resolve(root, 'src/world/maps/index.ts')));
if (matchedAuthoredLayout) for (const id of MAP_IDS) {
  assertAuthoredExitConfig(beforeMaps.getMapConfig(id), getMapConfig(id));
}
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const fingerprints = () => ({ terrain: hash('src/world/terrain.ts'),
  corridor: hash('src/world/maps/roadBorderCorridor.ts'), endpoints: hash('src/world/maps/roadEndpoints.ts'),
  stations: hash('src/world/maps/roadStations.ts'), props: hash('src/world/props.ts'),
  alpine: hash('src/world/maps/alpine.ts'), reservoir: hash('src/world/maps/reservoir.ts'),
  authoredFixture: hash('tools/road-authored-exit-fixture.mjs'),
  collisionIndex: hash('server/world-collision-manifests/index.json') });
const source = { baselineHead, baselineTerrain: hash(resolve(root, 'src/world/terrain.ts')), candidate: fingerprints() };
source.candidateHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(source.baselineTerrain, 'f4d8e4a9ba72ed073718f3896bb5e91f89f368417262c0a6178284c06de61d09');
const prior = resolve(priorRoot);
source.prior = { head: execFileSync('git', ['-C', prior, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  terrain: hash(resolve(prior, 'src/world/terrain.ts')), corridor: hash(resolve(prior, 'src/world/maps/roadBorderCorridor.ts')) };
assert.ok(source.prior.head.startsWith('0f3c77938'));
assert.equal(source.prior.terrain, 'a2defd1347a4164d02e38f7aa2a3fbccf15b3a6a862df0777a41e748a67deff0');
assert.equal(source.prior.corridor, 'f250dc8eabab63e0e5855a4d7b9427a38ca096b471fbbc4401fd5eb041fd4ecc');
assert.equal(execFileSync('git', ['-C', prior, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }), '');
const priorTerrain = await import(pathToFileURL(resolve(prior, 'src/world/terrain.ts')));
const priorMaps = await import(pathToFileURL(resolve(prior, 'src/world/maps/index.ts')));
source.harness = hash('tools/road-border-corridor-pilot.mjs');

function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
function portals(config, roads) {
  const spec = config.terrain.roads, result = [];
  if (!spec || spec === 'country' || !spec.paths) return result;
  const offset = spec.grid ? spec.grid.xs.length + spec.grid.zs.length : 0;
  spec.paths.forEach((path, i) => [0, 1].forEach(end => {
    if (ROAD_ENDPOINT_INTENTS[config.id][i + offset][end] !== 'boundary') return;
    const a = end ? path.at(-1) : path[0], b = end ? roads[i + offset].at(-1) : roads[i + offset][0];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length) result.push({ a, b, length, ux: (b[0] - a[0]) / length, uz: (b[1] - a[1]) / length,
      width: Math.max(32, 6 + Math.abs(config.terrain.rimH) * 2.4) });
  }));
  return result;
}
function inDeclaredSupport(config, field, entries, x, z) {
  // Existing road/pad support can inherit changed node grades through the
  // established smoothing and initialization. This is not exact old road Y.
  if (field._roadDist(x, z) <= 28) return true;
  const pads = [config.spawns.player, ...config.spawns.enemies];
  if (pads.some(p => Math.hypot(x - p.x, z - p.z) <= 26)) return true;
  if (entries.some(p => (x - p.a[0]) * p.ux + (z - p.a[1]) * p.uz > -38
    && Math.abs((x - p.a[0]) * p.uz - (z - p.a[1]) * p.ux) < p.width + 6)) return true;
  if (Math.max(Math.abs(x), Math.abs(z)) <= declaredOpening(config.id)) return false;
  // The historical portal strips above include removal of a643's broad
  // analytic cuts. New inward grading may only use actual road shoulders;
  // 70m conservatively covers the 64m construction stamp's bilinear cell.
  if (config.id === 'alpine' || config.id === 'reservoir') return field._roadDist(x, z) <= 70;
  const v = field._layout.village;
  return pads.some(p => segmentDistance(x, z, [p.x, p.z], [v.cx, v.cz]) < 36);
}
// Independently declared inward opening, not imported from the production
// helper. The inward maps no longer admit deployment-only support above.
function declaredOpening(id) {
  if (matchedAuthoredLayout && AUTHORED_EXIT_FIXTURE[id]) return 448;
  if (id === 'alpine') return 378;
  if (id === 'reservoir') return 311.8490566037736;
  return 430;
}
function assessPriorDomain(before, priorField, after) {
  const result = { samples: 0, changedFromR3: 0, baselineRestored: 0, newlyDifferentFromBaseline: 0,
    roadCoreChanged: 0, roadShoulderChanged: 0, beyond64Changed: 0, beyond64BaselineRestored: 0,
    maximumDeltaFromR3M: 0 };
  for (let z = -508; z <= 508; z += 8) for (let x = -508; x <= 508; x += 8) {
    const old = priorField.getHeightAt(x, z), next = after.getHeightAt(x, z);
    result.samples++;
    if (Object.is(old, next)) continue;
    result.changedFromR3++;
    result.maximumDeltaFromR3M = Math.max(result.maximumDeltaFromR3M, Math.abs(next - old));
    const baseline = before.getHeightAt(x, z), restored = Object.is(baseline, next);
    if (restored) result.baselineRestored++;
    if (Object.is(baseline, old)) result.newlyDifferentFromBaseline++;
    const rd = after._roadDist(x, z);
    if (rd <= 14) result.roadCoreChanged++;
    else if (rd < 64) result.roadShoulderChanged++;
    else {
      result.beyond64Changed++;
      if (restored) result.beyond64BaselineRestored++;
    }
  }
  return result;
}
function assessDomain(config, before, after, twin, entries) {
  const r = { samples: 0, exactChanged: 0, changedOver1e4: 0, borderChanged: 0,
    interiorChanged: 0, nonSupportChanged: 0, protectedWaterChanged: 0,
    distanceChanged: 0, materialChanged: 0, waterMaskChanged: 0, noVegChanged: 0,
    deterministicChanged: 0, maximumDeltaM: 0, firstNonSupport: null, firstProtectedWater: null };
  for (let z = -508; z <= 508; z += 8) for (let x = -508; x <= 508; x += 8) {
    assessDomainPoint(config, before, after, twin, entries, r, x, z);
  }
  return r;
}
function assessDomainPoint(config, before, after, twin, entries, r, x, z) {
    const a = before.getHeightAt(x, z), b = after.getHeightAt(x, z), delta = Math.abs(b - a);
    r.samples++;
    if (!Object.is(b, twin.getHeightAt(x, z))) r.deterministicChanged++;
    if (!Object.is(before._roadDist(x, z), after._roadDist(x, z))) r.distanceChanged++;
    if (before.getGroundType(x, z) !== after.getGroundType(x, z)) r.materialChanged++;
    if (!Object.is(before.getWaterMaskAt(x, z), after.getWaterMaskAt(x, z))) r.waterMaskChanged++;
    if (before._noVeg(x, z) !== after._noVeg(x, z)) r.noVegChanged++;
    if (Object.is(a, b)) return;
    r.exactChanged++;
    r.maximumDeltaM = Math.max(r.maximumDeltaM, delta);
    if (delta > 1e-4) {
      r.changedOver1e4++;
      if (Math.max(Math.abs(x), Math.abs(z)) > 430) r.borderChanged++;
      else r.interiorChanged++;
    }
    if (!inDeclaredSupport(config, before, entries, x, z)) {
      r.nonSupportChanged++; r.firstNonSupport ??= { x, z, before: a, after: b };
    }
    if (before.getWaterMaskAt(x, z) > .8 || before._layout.lakes.some(l => shorelineDistance(l, x, z) < .8)) {
      r.protectedWaterChanged++; r.firstProtectedWater ??= { x, z, before: a, after: b };
    }
}
function assessGrades(field, entries, config) {
  const r = { samples: 0, grade: 0, crossfall: 0, immediateShoulder: 0, wideShoulder: 0,
    maxSeam2mm: 0, worstGrade: null, worstCrossfall: null, worstImmediate: null, worstWide: null };
  for (const p of entries) for (let along = 2; along < p.length; along += 4) {
    assessPortalPoint(field, p, r, along);
  }
  // Inspect both one-sided tangents at every authored bend/tie-in, including
  // two metres on the original side. Relocating the endpoint cannot hide a
  // steep connector or the Reservoir spawn-adjacent turn from the same gates.
  if (matchedAuthoredLayout) for (const p of entries) {
    for (const along of [-2, 0, p.length, p.length + 2]) {
      if (Math.max(Math.abs(p.a[0] + p.ux * along), Math.abs(p.a[1] + p.uz * along)) <= 510) {
        assessPortalPoint(field, p, r, along);
      }
    }
  }
  r.maxSeam2mm = Math.max(r.maxSeam2mm, assessSeams(field, config));
  return r;
}
function assessPortalPoint(field, p, r, along) {
    const x = p.a[0] + p.ux * along, z = p.a[1] + p.uz * along;
    const grade = Math.abs(field.getHeightAt(x + p.ux * 2, z + p.uz * 2)
      - field.getHeightAt(x - p.ux * 2, z - p.uz * 2)) / 4;
    const cross = Math.abs(field.getHeightAt(x + p.uz * 2, z - p.ux * 2)
      - field.getHeightAt(x - p.uz * 2, z + p.ux * 2)) / 4;
    r.samples++;
    if (grade > r.grade) { r.grade = grade; r.worstGrade = { x, z }; }
    if (cross > r.crossfall) { r.crossfall = cross; r.worstCrossfall = { x, z }; }
    // The retained sections found Alpine's worst bank at36m, between the
    // old32/48m probes. Keep every old station and fill the complete2m
    // lattice; this strengthens sampling without changing physical limits.
    for (const side of [-1, 1]) for (let offset = 4; offset <= 192; offset += 2) {
      assessShoulder(field, p, r, x, z, side, offset);
    }
}
function assessShoulder(field, p, r, x, z, side, offset) {
      const px = x + p.uz * side * offset, pz = z - p.ux * side * offset;
      if (Math.max(Math.abs(px), Math.abs(pz)) > 510) return;
      const slope = Math.abs(field.getHeightAt(px + p.uz, pz - p.ux)
        - field.getHeightAt(px - p.uz, pz + p.ux)) / 2;
      if (slope > r.wideShoulder) {
        r.wideShoulder = slope; r.worstWide = { x: px, z: pz, side, offset,
          center: { x, z }, ux: p.ux, uz: p.uz, road: p.road, end: p.end, segment: p.segment, kind: p.kind };
      }
      if (offset === 18 || offset === 64) {
        r.maxSeam2mm = Math.max(r.maxSeam2mm, Math.abs(
          field.getHeightAt(px + p.uz * .001, pz - p.ux * .001)
          - field.getHeightAt(px - p.uz * .001, pz + p.ux * .001)));
      }
      if (offset <= 18 && slope > r.immediateShoulder) {
        r.immediateShoulder = slope; r.worstImmediate = { x: px, z: pz };
      }
}
function assessSeams(field, config) {
  let maximum = 0;
  // Bilerp cell edges and radial admission boundaries, not only coarse probes.
  const start = declaredOpening(config.id);
  for (const edge of [430, 432, 434, 436, 462, start, start + 4, start + 32]) for (const sign of [-1, 1]) {
    for (let other = -508; other <= 508; other += 4) for (const axis of [0, 1]) {
      const p = [edge * sign, other]; if (axis) p.reverse();
      const a = [...p], b = [...p]; a[axis] -= .001; b[axis] += .001;
      maximum = Math.max(maximum, Math.abs(field.getHeightAt(...a) - field.getHeightAt(...b)));
    }
  }
  return maximum;
}
function worstBankSection(before, after, worst) {
  if (!worst) return [];
  const rows = [], nx = worst.uz, nz = -worst.ux;
  for (let offset = -192; offset <= 192; offset += 2) {
    const x = worst.center.x + nx * offset, z = worst.center.z + nz * offset;
    if (Math.max(Math.abs(x), Math.abs(z)) > 510) continue;
    rows.push({ offset, x, z, before: before.getHeightAt(x, z), after: after.getHeightAt(x, z),
      slope: (after.getHeightAt(x + nx, z + nz) - after.getHeightAt(x - nx, z - nz)) / 2,
      roadDistance: after._roadDist(x, z) });
  }
  return rows;
}
const lock = createCaptureLock();
await lock.acquire(45 * 60 * 1000);
const heartbeat = setInterval(() => lock.refresh(), 30000);
const result = { test: 'road-border-corridor-pilot', source,
  comparisonMode: matchedAuthoredLayout ? 'matched-authored-layout-old-grading' : 'original-layout-grading-only',
  authoredExitFixture: matchedAuthoredLayout ? AUTHORED_EXIT_FIXTURE : null,
  scope: 'four maps CPU geometry only; unchanged physical thresholds. In matched-authored-layout mode frozen a643 grading receives ONLY the exact allowed new waypoint fixture; original-to-candidate layout/station/material/distance/height deltas remain separately reported. Neither mode certifies full dressing, collision manifests, native appearance or performance.',
  shoulderSampling: { firstOffsetM: 4, lastOffsetM: 192, intervalM: 2,
    slopeSpanM: 2, playableMaxAxisM: 510, thresholdsChanged: false },
  status: 'running', errors: [], records: [] };
try {
  for (const mapId of ['verdant', 'fjord', 'alpine', 'reservoir']) for (const seed of [1337, 2025]) {
    const config = getMapConfig(mapId), originalConfig = beforeMaps.getMapConfig(mapId);
    if (matchedAuthoredLayout) assertAuthoredExitConfig(originalConfig, config);
    const original = beforeTerrain.createHeightField(seed, originalConfig);
    const before = matchedAuthoredLayout && AUTHORED_EXIT_FIXTURE[mapId]
      ? beforeTerrain.createHeightField(seed, withAuthoredExits(originalConfig)) : original;
    const after = createHeightField(seed, config), twin = createHeightField(seed, config);
    const priorField = priorTerrain.createHeightField(seed, priorMaps.getMapConfig(mapId));
    assert.deepEqual(after._layout.roads, before._layout.roads);
    assert.deepEqual(after._layout.roadStations, before._layout.roadStations);
    assert.deepEqual(Object.keys(after), Object.keys(before));
    assert.equal(roadNetworkComponentCount(after._layout.roads), 1);
    const entries = matchedAuthoredLayout && AUTHORED_EXIT_FIXTURE[mapId]
      ? authoredApproachEntries(config, after._layout.roads) : portals(config, after._layout.roads);
    // Inspection chains/tie-in tangents do NOT grant earthwork ownership.
    // Only the matched predecessor's actual removed portal cuts may use the
    // historical strip allowance; road/pad and bounded448 support stay separate.
    const supportEntries = portals(config, before._layout.roads);
    const domain = assessDomain(config, before, after, twin, supportEntries), grades = assessGrades(after, entries, config);
    const r3Comparison = assessPriorDomain(original, priorField, after);
    const originalLayoutComparison = matchedAuthoredLayout ? {
      domain: assessDomain(config, original, after, twin, portals(originalConfig, original._layout.roads)),
      before: { roads: original._layout.roads, roadStations: original._layout.roadStations },
      after: { roads: after._layout.roads, roadStations: after._layout.roadStations },
      dressing: 'Authored station ordinals/counts intentionally change; raw layouts above expose every change. Full props/vegetation placement and RNG tails are NOT certified by this height-field probe.',
    } : null;
    result.records.push({ mapId, seed, domain, grades, measuredApproaches: entries,
      worstBankSection: worstBankSection(before, after, grades.worstWide), r3Comparison, originalLayoutComparison });
    if (originalLayoutComparison) for (const key of ['waterMaskChanged', 'protectedWaterChanged', 'deterministicChanged']) {
      if (originalLayoutComparison.domain[key]) result.errors.push(`${mapId}/${seed}: original-layout ${key}=${originalLayoutComparison.domain[key]}`);
    }
    if ((mapId === 'verdant' || mapId === 'fjord') && r3Comparison.changedFromR3) {
      result.errors.push(`${mapId}/${seed}: R3 control changed`);
    }
    for (const key of ['distanceChanged', 'materialChanged', 'waterMaskChanged', 'noVegChanged',
      'deterministicChanged', 'nonSupportChanged', 'protectedWaterChanged']) {
      if (domain[key]) result.errors.push(`${mapId}/${seed}: ${key}=${domain[key]}`);
    }
    if (mapId === 'verdant' && domain.exactChanged) result.errors.push(`${mapId}/${seed}: no-portal control changed`);
    if (domain.changedOver1e4 / domain.samples >= .14) result.errors.push(`${mapId}/${seed}: changed footprint >=14%`);
    for (const [key, limit] of [['grade', .35], ['crossfall', .25], ['immediateShoulder', 1.4], ['wideShoulder', 2], ['maxSeam2mm', .03]]) {
      if (grades[key] > limit) result.errors.push(`${mapId}/${seed}: ${key}=${grades[key]} exceeds ${limit}`);
    }
  }
  assert.deepEqual(fingerprints(), source.candidate, 'candidate source stayed frozen');
  result.status = result.errors.length ? 'failed' : 'passed';
  if (result.errors.length) process.exitCode = 1;
} catch (error) { result.status = 'failed'; result.errors.push(String(error)); process.exitCode = 1; }
finally {
  clearInterval(heartbeat); lock.release();
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
}
