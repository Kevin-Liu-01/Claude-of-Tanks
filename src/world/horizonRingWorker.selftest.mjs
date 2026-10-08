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
//   4. The wiring: map.ts starts the prefetch with the world's seeds and disposes it; terrain.ts builds the ring after the
//      chunk rows from the source and keeps the ring the terrain's first child.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';

installWorldBuildFixture();
const { MAP_IDS, getMapConfig } = await import('./maps/index.ts');
const { createHeightField } = await import('./terrain.ts');
const { buildHorizonRingSteps, horizonRingGeometrySteps } = await import('./maps/horizon.ts');
const { buildHorizonRingWire } = await import('./horizonRingWorker.ts');
const { unpackHorizonRing, packHorizonRing } = await import('./horizonRingWire.ts');
const { startHorizonRingBuild, horizonRingKey, forgetHorizonRing } = await import('./horizonRingPrefetch.ts');
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
  await ok.settled();
  assert.equal(ok.pending, false);
  assert.equal(ok.stats.source, 'worker');
  assert.equal(pipelineDigest(ok.take()), pipelineDigest(inline), 'the worker\'s answer is the ring');
  assert.equal(startHorizonRingBuild(request, null).stats.source, 'kept', 'the worker\'s ring is kept for a rematch');
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
const mapSource = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
assert.match(mapSource, /startHorizonRingBuild\(\{\s*mapId, terrainVariant: terrainVariant \?\? null, fieldSeed: seed, ringSeed: 1337/);
assert.match(mapSource, /terrainSources, ringSource\)\)/);
assert.match(mapSource, /ringSource\.dispose\(\);/);

console.log(`horizonRingWorker.selftest: ${checked} maps' ring pipelines (${vertices} vertices) identical worker against inline, the trench `
  + 'variant on both tiers, the ring from a precomputed pipeline identical on 3 maps, the prefetch\'s kept ring, fallbacks and disposal, '
  + 'and the wiring PASS');
