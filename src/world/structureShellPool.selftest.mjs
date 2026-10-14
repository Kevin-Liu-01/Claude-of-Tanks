// structureShellPool.selftest.mjs — Plan W (2026-10-13, the perf stream): structure shell bands derived off the main
// thread give the records the inline build gives.
// 1. The wire (structureShellWire.ts) answers every read the derivation makes with the same numbers, for plain,
//    interleaved and normalized positions, indexed and not, with the noCollision and noCollisionVertices flags; the
//    shells derived from it equal the inline profile's.
// 2. The pooled build path (the deferred pool: pack at post, derive from the wire at the join) builds a world whose packed
//    collision and structure anatomies equal the inline build's, byte for byte.
// 3. The wiring: the join stands before the map kits' scans, packets derive inline, the async driver waits at the join,
//    a placeholder read before the join throws, and the worker stays out of the boot graph.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { installWorldBuildFixture, buildWorldCollisionData } from '../../tools/headlessWorldCollision.mjs';
import { deriveRuntimeStructureCollisionProfile, deriveRuntimeStructureShellBands } from './structureCollision.ts';
import { packStructureShellWire, unpackStructureShellWire } from './structureShellWire.ts';
import { createDeferredStructureShellPool, setStructureShellPoolFactory } from './structureShellPool.ts';

// ---- 1. the wire
const at = (g, x, y, z) => g.translate(x, y, z);
const wall = at(new THREE.BoxGeometry(6, 3, 0.3), 0, 1.5, -2);
const back = at(new THREE.BoxGeometry(6, 3, 0.3), 0, 1.5, 2);
const side = at(new THREE.BoxGeometry(0.3, 3, 4), 3, 1.5, 0).toNonIndexed();
const roof = at(new THREE.CylinderGeometry(0.1, 3.4, 1.6, 4, 1), 0, 3.8, 0);
const glass = at(new THREE.BoxGeometry(1, 1, 0.05), 0, 1.5, -2.2);
const trim = at(new THREE.BoxGeometry(6.2, 0.1, 0.1), 0, 3.05, -2.2);
trim.userData.noCollision = true;
// a merged geometry whose dressing triangles are flagged per vertex
const dressed = at(new THREE.BoxGeometry(0.4, 2.6, 0.4), -2.6, 1.3, 1.6);
dressed.userData.noCollisionVertices = new Uint8Array(dressed.getAttribute('position').count).map((_, i) => (i < 8 ? 1 : 0));
// an interleaved position stream and a normalized Int16 one
const interleavedSource = at(new THREE.BoxGeometry(0.5, 2.2, 0.5), 2.4, 1.1, 1.4);
const inter = new THREE.BufferGeometry();
{
  const p = interleavedSource.getAttribute('position'), n = p.count, data = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) { data[i * 5] = p.getX(i); data[i * 5 + 1] = p.getY(i); data[i * 5 + 2] = p.getZ(i); data[i * 5 + 3] = 7; data[i * 5 + 4] = 9; }
  inter.setAttribute('position', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(data, 5), 3, 0));
  inter.setIndex(interleavedSource.getIndex());
}
const norm = new THREE.BufferGeometry();
{
  const p = at(new THREE.BoxGeometry(0.6, 1.2, 0.6), -1, 0.6, 0).getAttribute('position'), n = p.count, data = new Int16Array(n * 3);
  for (let i = 0; i < n; i++) { data[i * 3] = Math.round(p.getX(i) / 8 * 32767); data[i * 3 + 1] = Math.round(p.getY(i) / 8 * 32767); data[i * 3 + 2] = Math.round(p.getZ(i) / 8 * 32767); }
  norm.setAttribute('position', new THREE.BufferAttribute(data, 3, true));
  norm.scale(1, 1, 1);
}
const buckets = { wall: [wall, back, side, inter, norm], roof: [roof], glass: [glass], trim: [trim], timber: [dressed], empty: undefined };
const { wire, transfer } = packStructureShellWire(buckets);
assert.ok(transfer.length >= 9, 'the wire hands its arrays over');
const rebuilt = unpackStructureShellWire(wire);
assert.deepEqual(Object.keys(rebuilt), ['wall', 'roof', 'glass', 'trim', 'timber'], 'the buckets in their order (an empty one dropped, as collectSolids skips it)');
for (const [bucket, list] of Object.entries(buckets)) {
  if (!list) continue;
  list.forEach((source, k) => {
    const copy = rebuilt[bucket][k];
    const a = source.getAttribute('position'), b = copy.getAttribute('position');
    assert.equal(b.count, a.count);
    for (let i = 0; i < a.count; i++) {
      assert.ok(Object.is(b.getX(i), a.getX(i)) && Object.is(b.getY(i), a.getY(i)) && Object.is(b.getZ(i), a.getZ(i)), `${bucket}[${k}] vertex ${i}`);
    }
    const ia = source.getIndex(), ib = copy.getIndex();
    assert.equal(!!ib, !!ia);
    if (ia) { assert.equal(ib.count, ia.count); for (let i = 0; i < ia.count; i++) assert.equal(ib.getX(i), ia.getX(i)); }
    assert.equal(!!copy.userData.noCollision, !!source.userData.noCollision);
    assert.deepEqual(copy.userData.noCollisionVertices ? [...copy.userData.noCollisionVertices] : null,
      source.userData.noCollisionVertices ? [...source.userData.noCollisionVertices] : null);
  });
}
const inline = deriveRuntimeStructureCollisionProfile(buckets);
assert.ok(inline.shell.length > 2, 'the fixture has shell bands');
assert.deepEqual(deriveRuntimeStructureShellBands(rebuilt), inline.shell, 'the shells from the wire are the inline profile\'s');

// ---- 2. the pooled build path equals the inline build (Verdant: its settlement, a yard shed, a carriageway-free map)
installWorldBuildFixture();
const anatomies = (dressing) => JSON.stringify([...dressing.structureDamage].map(([id, d]) => [id, d.builder, d.style, d.anatomy]));
let inlineAnatomy = null, pooledAnatomy = null;
setStructureShellPoolFactory(null);
const inlineData = await buildWorldCollisionData('verdant', { inspect: ({ dressing }) => { inlineAnatomy = anatomies(dressing); } });
const pools = [];
setStructureShellPoolFactory(() => { const pool = createDeferredStructureShellPool(); pools.push(pool); return pool; });
const pooledData = await buildWorldCollisionData('verdant', { inspect: ({ dressing }) => { pooledAnatomy = anatomies(dressing); } });
setStructureShellPoolFactory(null);
const posted = pools.reduce((n, pool) => n + pool.stats.posted, 0);
assert.ok(posted >= 5, `the pooled path ran (${posted} structures posted)`);
assert.equal(JSON.stringify(pooledData), JSON.stringify(inlineData), 'the packed collision equals the inline build\'s, byte for byte');
assert.equal(pooledAnatomy, inlineAnatomy, 'every structure anatomy (its mass class read at the join) equals the inline build\'s');

// ---- 3. the wiring
const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const joinAt = props.indexOf("if (shellPool && pendingShells.length) yield { stage: 'structure-shells', structureShells: shellPool.settled(STRUCTURE_SHELL_WAIT_MS) };\n  joinStructureShells();\n  dressMapExtras({");
assert.ok(joinAt > 0, 'the join stands right before the map kits (the first passes that scan every record)');
for (const reader of ['composeLoggingYard(', 'composeReservoirWaterworks(', 'composeMangroveFisheryWharf(', 'composeFoundryServiceCourt(', 'separateParkedVehicles(']) {
  assert.ok(props.indexOf(reader) > joinAt, `${reader} runs after the join`);
}
assert.equal(props.match(/addStructureCollision\([^;]*, packetNow\);/g)?.length, 2, 'the packet-bearing placements derive inline');
assert.match(props, /if \(step\?\.structureShells\) \{/, 'the async driver waits at the join');
assert.match(props, /joinStructureShells\(\); \/\/ \(Plan W\) no pooled structure outlives the build/);
assert.match(props, /throw new Error\(`\$\{id\}: structure shell record read \(\$\{key\}\) before the build joined the pool`\);/);
assert.match(props, /const shellPool = structureShellPoolFor\(sourceApplication\.worker === true\);/, 'workers only in the async build');
const pool = readFileSync(new URL('./structureShellPool.ts', import.meta.url), 'utf8');
assert.match(pool, /new Worker\(new URL\('\.\/structureShellWorker\.ts', import\.meta\.url\)/);
const { staticImportClosure } = await import('../../tools/static-import-closure.mjs');
const boot = staticImportClosure('src/main.ts', { root: new URL('../..', import.meta.url).pathname });
for (const module of ['src/world/structureShellPool.ts', 'src/world/structureShellWorker.ts', 'src/world/structureShellWire.ts']) {
  assert.ok(!boot.has(module), `${module} stays out of the boot graph`);
}

console.log(`structureShellPool.selftest: the wire answers every read exactly; the pooled Verdant build (${posted} structures) equals the inline one; the join stands before every scan`);
