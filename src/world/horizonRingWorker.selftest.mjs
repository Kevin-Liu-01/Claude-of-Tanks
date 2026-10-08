// Receipt for the horizon ring worker (2026-10-08, the time-to-battle lane): the ring's geometry pipeline built off the
// main thread (horizonRingWorker.ts, horizonRingPrefetch.ts) is the pipeline the page builds where it stands.
//
//   1. Every map: the worker's pipeline (its own config from the map id, its own height field, the shared
//      horizonRingGeometrySteps, packed, posted with its arrays transferred, unpacked) equals the inline pipeline on the
//      page's height field — every geometry attribute's bytes, the index, groups, draw range, bounds and userData, the
//      ring's rows and arrays, the sea, the sea openings, the relief bake (its timings aside), the forest cover and the
//      colours. The trench variant too.
//   2. The ring the terrain build makes from a precomputed pipeline equals the ring it builds inline (mesh, material
//      identity, every descendant), on maps with and without a continued border.
//   3. The prefetch: no worker means no pipeline (the terrain build builds it where it stands and keeps it); a kept ring
//      serves the same map's next build, a copy each time, and no other map; a failed or disposed worker yields nothing.
//   4. The wiring, on the ring's hook (horizonRingHook.ts, fix/inherited-reds): maps/horizon.ts installs the pipeline
//      beside the builder; map.ts supplies the hook with its prefetch for its own build and withdraws it; the hook hands
//      a terrain build the supply of its own map and variant only; terrain.ts takes the ring only through the hook — a
//      supplied build leaves the ring's stage on the group and map.ts finishes it after the props, before the world is
//      assembled (the worker's whole build to answer; the stage builds the pipeline meanwhile and takes the worker's the
//      moment it arrives, never waiting) — and keeps the ring the terrain's first child.
//   5. The worker's realm: a worker never resolves the device tier (getDeviceTier() is 'desktop' there) while a phone's
//      page resolves 'mobile', so the pipeline depends on the tier only through its request (`vista`): a child process
//      with the tier resolved to 'mobile' builds the same requests to the same arrays.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';

installWorldBuildFixture();
// (part 5's child: the page's realm on a phone — the tier resolved to 'mobile' — prints its pipelines' wire digests)
const TIER_CHILD = process.argv[2] === '--tier-child';
if (TIER_CHILD) {
  const quality = await import('../engine/quality.ts');
  globalThis.window = { location: { search: '?tier=mobile' } };
  try { quality.resolveDeviceTier(); } finally { delete globalThis.window; }
  if (quality.getDeviceTier() !== 'mobile') throw new Error('the child did not resolve the mobile tier');
}
const { MAP_IDS, getMapConfig } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');
const { buildHorizonRingSteps, horizonRingGeometrySteps } = await import('./maps/horizon.ts');
const { buildHorizonRingWire } = await import('./horizonRingWorker.ts');
const { unpackHorizonRing, packHorizonRing } = await import('./horizonRingWire.ts');
const { startHorizonRingBuild, horizonRingKey, forgetHorizonRing } = await import('./horizonRingPrefetch.ts');
const { horizonRing, horizonRingSupplyFor, supplyHorizonRing, withdrawHorizonRing } = await import('./horizonRingHook.ts');
const { worldBuildConfig } = await import('./worldBuildConfig.ts');

const drain = (g) => { let s = g.next(); while (!s.done) s = g.next(); return s.value; };
const bytes = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
/**
 * A digest of plain data and typed arrays (array class and bytes), timings and uuids aside. A three.js object met inside
 * (a mesh or a texture a userData record holds) is summarised by its type, name and size, never walked, and an object
 * met twice is a reference (userData records point back at their meshes).
 */
function digestValue(h, value, key = '', seen = new Set()) {
  if (key === 'passMs') return;
  if (ArrayBuffer.isView(value)) { h.update(`${key}:${value.constructor.name}:${value.length}|`); h.update(bytes(value)); return; }
  if (value && typeof value === 'object') {
    if (seen.has(value)) { h.update(`${key}=ref|`); return; }
    seen.add(value);
    if (value.isVector2 || value.isVector3 || value.isVector4 || value.isColor || value.isSphere || value.isBox3 || value.isMatrix4) {
      h.update(`${key}=${JSON.stringify(value)}|`);
      return;
    }
    if (value.isObject3D || value.isMaterial || value.isTexture || value.isBufferGeometry) {
      h.update(`${key}=${value.type ?? (value.isTexture ? 'Texture' : '')}:${value.name ?? ''}:${value.image?.width ?? ''}x${value.image?.height ?? ''}|`);
      return;
    }
    if (Array.isArray(value)) { h.update(`${key}[${value.length}|`); value.forEach((v, i) => digestValue(h, v, String(i), seen)); h.update(']'); return; }
    h.update(`${key}{`);
    for (const k of Object.keys(value).sort()) digestValue(h, value[k], k, seen);
    h.update('}');
    return;
  }
  if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value)) return;
  if (typeof value === 'function') { h.update(`${key}=fn|`); return; }
  h.update(`${key}=${typeof value === 'number' && Object.is(value, -0) ? '-0' : String(value)}|`);
}
function geometryDigest(h, g) {
  for (const [name, a] of Object.entries(g.attributes)) { h.update(`${name}|${a.itemSize}|${a.normalized}|`); digestValue(h, a.array); }
  if (g.index) digestValue(h, g.index.array, 'index');
  digestValue(h, { groups: g.groups, drawRange: g.drawRange, name: g.name, userData: g.userData,
    sphere: g.boundingSphere ? [g.boundingSphere.center.toArray(), g.boundingSphere.radius] : null,
    box: g.boundingBox ? [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()] : null });
}
function pipelineDigest(p) {
  const h = createHash('sha1');
  geometryDigest(h, p.geometry);
  const { geometry: _geometry, ...rest } = p;
  digestValue(h, rest);
  return h.digest('hex');
}

// --- 5. the worker's realm -----------------------------------------------------------------------------------------------
const REALM_MAPS = ['verdant', 'badlands'];
const wireDigest = (wire) => { const h = createHash('sha1'); digestValue(h, wire); return h.digest('hex'); };
const realmRequest = (mapId) => ({ mapId, terrainVariant: null, fieldSeed: 1337, ringSeed: 1337, vista: false, debugColors: false });
if (TIER_CHILD) {
  console.log(JSON.stringify(REALM_MAPS.map((mapId) => wireDigest(buildHorizonRingWire(realmRequest(mapId)).wire))));
  process.exit(0);
}
{
  const { getDeviceTier } = await import('../engine/quality.ts');
  assert.equal(getDeviceTier(), 'desktop', 'the parent stands for the worker: the tier unresolved');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--tier-child'],
    { encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(child.status, 0, `the mobile-tier child failed: ${child.stderr?.slice(-600)}`);
  const childDigests = JSON.parse(child.stdout.trim().split('\n').at(-1));
  const parentDigests = REALM_MAPS.map((mapId) => wireDigest(buildHorizonRingWire(realmRequest(mapId)).wire));
  assert.deepEqual(childDigests, parentDigests,
    'the pipeline depends on the device tier only through the request: a phone\'s page and its worker build the same ring');
}

// --- 1. every map: the worker's pipeline is the page's ---------------------------------------------------------------
const maps = [...MAP_IDS];
assert.ok(maps.length >= 30, `the catalog's maps (${maps.length})`);
let checked = 0, vertices = 0;
const inlineByMap = new Map();
for (const mapId of maps) {
  const cfg = getMapConfig(mapId);
  const field = createHeightField(1337, cfg);
  const inline = drain(horizonRingGeometrySteps(cfg, 1337, field, { vista: true }));
  // the worker's handler, posted the way postMessage posts it (structured clone, its arrays transferred)
  const { wire, transfer } = buildHorizonRingWire({ mapId, terrainVariant: null, fieldSeed: 1337, ringSeed: 1337, vista: true, debugColors: false });
  const posted = structuredClone(wire, { transfer });
  assert.ok(transfer.every((buffer) => buffer.byteLength === 0), `${mapId}: the worker's arrays were handed over, not copied`);
  const fromWorker = unpackHorizonRing(posted);
  assert.equal(pipelineDigest(fromWorker), pipelineDigest(inline), `${mapId}: the worker's ring pipeline is the page's`);
  inlineByMap.set(mapId, { cfg, field, inline });
  checked++;
  vertices += inline.geometry.attributes.position.count;
}
// the mobile tier's pipeline (no vista bake) and the trench variant travel the same way
{
  const mapId = 'verdant';
  const cfg = worldBuildConfig(mapId, 'assault-trenches');
  assert.equal(cfg.assaultTrenches, true, 'the trench variant');
  assert.equal(worldBuildConfig(mapId, null), getMapConfig(mapId), 'no variant: the catalog config itself');
  for (const vista of [true, false]) {
    const field = createHeightField(1337, cfg);
    const inline = drain(horizonRingGeometrySteps(cfg, 1337, field, { vista }));
    const { wire, transfer } = buildHorizonRingWire({ mapId, terrainVariant: 'assault-trenches', fieldSeed: 1337, ringSeed: 1337, vista, debugColors: false });
    assert.equal(pipelineDigest(unpackHorizonRing(structuredClone(wire, { transfer }))), pipelineDigest(inline), `trenches, vista ${vista}`);
  }
}

// --- 2. the ring built from a precomputed pipeline is the ring built inline -------------------------------------------
function meshDigest(mesh) {
  const h = createHash('sha1');
  geometryDigest(h, mesh.geometry);
  digestValue(h, mesh.userData, 'userData');
  const material = (m) => (Array.isArray(m) ? m : m ? [m] : []).map((x) => ({ type: x.type, name: x.name, side: x.side,
    uniforms: Object.fromEntries(Object.entries(x.uniforms ?? {}).map(([k, u]) => [k, typeof u?.value === 'number' || typeof u?.value === 'boolean'
      ? u.value : u?.value?.toArray ? u.value.toArray() : typeof u?.value])) }));
  digestValue(h, material(mesh.material), 'material');
  mesh.traverse((o) => {
    if (o === mesh) return;
    digestValue(h, { name: o.name, type: o.type, visible: o.visible, cast: o.castShadow, count: o.count ?? null, matrix: [...o.matrix.elements] });
    if (o.geometry) geometryDigest(h, o.geometry);
    if (o.instanceMatrix) digestValue(h, o.instanceMatrix.array, 'instances');
    digestValue(h, material(o.material), 'material');
  });
  return h.digest('hex');
}
for (const mapId of ['verdant', 'badlands', 'coastal']) {
  const { cfg } = inlineByMap.get(mapId);
  const builtInline = drain(buildHorizonRingSteps(null, cfg, 1337, createHeightField(1337, cfg), { terrainBound: true }));
  const field = createHeightField(1337, cfg);
  const { wire, transfer } = buildHorizonRingWire({ mapId, terrainVariant: null, fieldSeed: 1337, ringSeed: 1337, vista: true, debugColors: false });
  const builtFromWorker = drain(buildHorizonRingSteps(null, cfg, 1337, field, {
    terrainBound: true, geometry: unpackHorizonRing(structuredClone(wire, { transfer })) }));
  assert.equal(meshDigest(builtFromWorker), meshDigest(builtInline), `${mapId}: the ring from the worker's pipeline is the inline ring`);
}

// --- 3. the prefetch ---------------------------------------------------------------------------------------------------
{
  forgetHorizonRing();
  const request = { mapId: 'verdant', terrainVariant: null, fieldSeed: 1337, ringSeed: 1337, vista: true, debugColors: false };
  const none = startHorizonRingBuild(request, null);
  assert.equal(none.pending, false);
  assert.equal(none.take(), null, 'no worker: no pipeline (the terrain build builds it where it stands)');
  assert.equal(none.stats.source, 'inline');
  const { inline } = inlineByMap.get('verdant');
  none.remember(inline);
  // a kept ring serves the same map's next build, a copy each time, and survives the first build's changes
  const kept = startHorizonRingBuild(request, null);
  const first = kept.take();
  assert.equal(kept.stats.source, 'kept');
  assert.equal(kept.take(), null, 'taken once');
  assert.equal(pipelineDigest(first), pipelineDigest(inline), 'the kept ring is the ring');
  first.geometry.attributes.position.array.fill(0);
  first.colors.fill(0);
  const second = startHorizonRingBuild(request, null).take();
  assert.equal(pipelineDigest(second), pipelineDigest(inline), 'a copy each time: one build\'s changes never reach the next');
  assert.notEqual(second.geometry.attributes.position.array, first.geometry.attributes.position.array);
  assert.equal(startHorizonRingBuild({ ...request, mapId: 'coastal' }, null).take(), null, 'another map is not kept');
  assert.equal(startHorizonRingBuild({ ...request, vista: false }, null).take(), null, 'another tier is not kept');
  assert.notEqual(horizonRingKey(request), horizonRingKey({ ...request, terrainVariant: 'assault-trenches' }));
  forgetHorizonRing();
  // a stand-in worker that answers with the handler's own reply; one that fails; one disposed before it answers
  const port = (answer) => {
    const p = { onmessage: null, onerror: null, terminated: false, terminate() { this.terminated = true; },
      postMessage(job) { queueMicrotask(() => answer(p, job)); } };
    return p;
  };
  const ok = startHorizonRingBuild(request, () => port((p, job) => {
    const { wire, transfer } = buildHorizonRingWire(job);
    p.onmessage?.({ data: { id: job.id, ok: true, wire: structuredClone(wire, { transfer }), ms: 1 } });
  }));
  assert.equal(ok.pending, true);
  assert.equal(ok.take(), null, 'nothing to take while the worker is at it (the terrain build makes the ring meanwhile)');
  await ok.settled();
  assert.equal(ok.pending, false);
  assert.equal(pipelineDigest(ok.take()), pipelineDigest(inline), 'the worker\'s answer is the ring');
  assert.equal(ok.stats.source, 'worker', 'taken from the worker');
  const rematchTake = startHorizonRingBuild(request, null);
  assert.ok(rematchTake.take());
  assert.equal(rematchTake.stats.source, 'kept', 'the worker\'s ring is kept for a rematch');
  // the record the world build leaves on the terrain group (map.ts: userData.horizonRingLoad): when the terrain build
  // first asked (the ring stage began), when the worker answered, when the build took its pipeline (ms from the start);
  // the build never waits: a ring it made itself is 'inline', whatever the worker does after
  forgetHorizonRing();
  let clock = 0;
  const timed = startHorizonRingBuild(request, () => port((p, job) => {
    p.onmessage?.({ data: { id: job.id, ok: true, wire: structuredClone(packHorizonRing(inline).wire), ms: 7 } });
  }), () => clock);
  clock = 100;
  assert.equal(timed.take(), null, 'the ring stage began before the worker answered');
  clock = 250;
  await timed.settled();
  clock = 300;
  assert.ok(timed.take(), 'its answer is taken at the next step');
  assert.deepEqual({ ...timed.stats }, { source: 'worker', failed: false, workerMs: 7, doneMs: 250, askedMs: 100, takenMs: 300 },
    'asked at 100 ms, answered at 250 ms, taken at 300 ms');
  clock = 1000;
  const rematch = startHorizonRingBuild(request, null, () => clock);
  clock = 1040;
  assert.ok(rematch.take());
  assert.deepEqual({ ...rematch.stats }, { source: 'kept', failed: false, workerMs: 0, doneMs: 0, askedMs: 40, takenMs: 40 },
    'a rematch takes the kept ring at once');
  forgetHorizonRing();
  clock = 0;
  const late = startHorizonRingBuild(request, () => port(() => {}), () => clock);
  clock = 80;
  assert.equal(late.take(), null);
  late.remember(inline);
  late.dispose();
  assert.deepEqual({ ...late.stats }, { source: 'inline', failed: false, workerMs: 0, doneMs: 80, askedMs: 80, takenMs: -1 },
    'no answer before the build finished the ring itself: inline, the worker disposed with the build');
  forgetHorizonRing();
  const failed = startHorizonRingBuild(request, () => port((p, job) => p.onmessage?.({ data: { id: job.id, ok: false, message: 'boom' } })));
  await failed.settled();
  assert.equal(failed.take(), null, 'a failed worker: no pipeline');
  assert.equal(failed.stats.failed, true);
  const crashed = startHorizonRingBuild(request, () => port((p) => p.onerror?.({ message: 'worker crashed' })));
  await crashed.settled();
  assert.equal(crashed.take(), null);
  let disposedPort = null;
  const disposed = startHorizonRingBuild(request, () => (disposedPort = port(() => {})));
  disposed.dispose();
  await disposed.settled();
  assert.equal(disposed.take(), null, 'disposed before it answers: no pipeline');
  assert.equal(disposedPort.terminated, true, 'and its worker is terminated');
  const threw = startHorizonRingBuild(request, () => { throw new Error('no workers here'); });
  assert.equal(threw.pending, false);
  assert.equal(threw.take(), null);
  // (a packed pipeline survives a structured clone: no function or class instance in it)
  structuredClone(packHorizonRing(inline).wire);
}

// --- 4. the wiring -----------------------------------------------------------------------------------------------------
const terrainSource = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const rows = terrainSource.indexOf('  for (let cz = 0; cz < CHUNKS; cz++) yield* buildTerrainRow(cz);');
const ring = terrainSource.indexOf("buildHorizonRingSteps(engineCtx, cfg, 1337, heightField, { terrainBound: true, geometry: ringPipeline })");
const bind = terrainSource.indexOf('bindAutumnHorizonGround(horizonMesh, mat, splatTextures');
assert.ok(rows > 0 && ring > rows && bind > ring, 'terrain.ts builds the ring after the chunk rows, then binds it');
assert.ok(terrainSource.includes('group.children.unshift(group.children.pop()!);'), 'the ring stays the terrain\'s first child');
assert.ok(terrainSource.includes('ringSource.remember(ringPipeline);'), 'a ring built where it stands is kept');
assert.match(terrainSource, /if \(ringSource\) group\.userData\.finishHorizonRing = horizonRingStage;\s*else yield\* horizonRingStage\(\);/,
  'a supplied build leaves the ring stage for the world build\'s end; any other build makes it after the chunks');
assert.match(terrainSource, /ringPipeline = ringSource\.take\(\);\s*if \(ringPipeline\) break;/,
  'the stage takes the worker\'s pipeline the moment it arrives');
assert.doesNotMatch(terrainSource, /ringSource\.settled\(\)/, 'nothing waits for the worker');
assert.match(terrainSource, /export function buildTerrainMeshes\([\s\S]{0,700}userData\.finishHorizonRing[\s\S]{0,300}while \(!steps\.next\(\)\.done\)/,
  'a synchronous terrain build that met a supply finishes the deferred ring itself');
assert.ok(terrainSource.includes('const ringSource = horizonRingSupplyFor(cfg);'), 'terrain.ts takes the ring through the hook');
assert.doesNotMatch(terrainSource, /^import (?!type)[^;]*from '\.\/(maps\/horizon|horizonRingPrefetch|horizonRingWorker|horizonRingWire)\.ts'/m,
  'terrain.ts imports neither the visual horizon nor the prefetch: the authority\'s height field stays clear of both');
const mapSource = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
assert.match(mapSource, /startHorizonRingBuild\(\{\s*mapId, terrainVariant: terrainVariant \?\? null, fieldSeed: seed, ringSeed: 1337/);
assert.match(mapSource, /supplyHorizonRing\(ringSource\);/);
assert.match(mapSource, /withdrawHorizonRing\(ringSource\);\s*ringSource\.dispose\(\);/);
{
  const props = mapSource.indexOf('const props = await createPropsAsync(');
  const finish = mapSource.indexOf('await finishHorizonRingAsync(terrain, ');
  const assemble = mapSource.indexOf('const world = assembleWorld(engineCtx, config, heightField, terrain, vegetation, props);');
  assert.ok(props > 0 && finish > props && assemble > finish, 'map.ts finishes the ring after the props, before the world is assembled');
}
// the hook: the installed pipeline is the module's; a supply serves its own map and variant only, until withdrawn
assert.equal(horizonRing().horizonRingGeometrySteps, horizonRingGeometrySteps, 'maps/horizon.ts installs its pipeline');
{
  const supply = startHorizonRingBuild({ mapId: 'verdant', terrainVariant: null, fieldSeed: 1337, ringSeed: 1337, vista: true, debugColors: false }, null);
  supplyHorizonRing(supply);
  assert.equal(horizonRingSupplyFor(getMapConfig('verdant')), supply);
  assert.equal(horizonRingSupplyFor(getMapConfig('coastal')), null, 'another map\'s build gets no supply');
  assert.equal(horizonRingSupplyFor(worldBuildConfig('verdant', 'assault-trenches')), null, 'nor does the trench variant');
  assert.equal(horizonRingSupplyFor(null), null);
  const later = startHorizonRingBuild({ mapId: 'coastal', terrainVariant: null, fieldSeed: 1337, ringSeed: 1337, vista: true, debugColors: false }, null);
  supplyHorizonRing(later);
  withdrawHorizonRing(supply);
  assert.equal(horizonRingSupplyFor(getMapConfig('coastal')), later, 'an ended build withdraws only its own supply');
  withdrawHorizonRing(later);
  assert.equal(horizonRingSupplyFor(getMapConfig('coastal')), null);
  supplyHorizonRing(supply);
  supplyHorizonRing(null);
  assert.equal(horizonRingSupplyFor(getMapConfig('verdant')), null, 'withdrawn when the world build ends');
}

console.log(`horizonRingWorker.selftest: ${checked} maps' ring pipelines (${vertices} vertices) identical worker against inline, the trench `
  + 'variant on both tiers, the ring from a precomputed pipeline identical on 3 maps, the prefetch\'s kept ring, fallbacks and disposal, '
  + 'and the wiring PASS');
