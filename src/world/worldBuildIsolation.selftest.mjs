// One map's world build leaves nothing behind for the next (speed, 2026-10-13). A page builds map after map in one
// session (a player changes battlefields without a reload), so a module-level cache or pool that carries one build's
// state into the next would lay the next map out otherwise than a fresh page does, and the phone and the authority
// (which plays the committed shards) would disagree about its records.
//
// The capture tool's serial --check (the default, and the landing check) builds every map after every earlier map in one
// process, as a page that plays the roster in turn does, and reports drift only where that build differs from the
// committed shard, which a regeneration built in its own order: a leak both orders share, or one that later maps mask,
// passes it. The drift receipt builds each map only after its share's earlier maps. This receipt asks the question on
// purpose, in both directions for one pair, for a few sampled pairs: in one isolate it builds a probe map fresh, then
// another map, then the probe again, and the probe's collision manifest (its sha256 and its obstacle, collider and
// concealer counts) must be byte-identical to its fresh build. Each sequence runs in its own worker thread (a fresh
// module graph, as a fresh page), at most four at a time (the drift receipt's split). A map that one sequence builds
// second and another builds fresh is held to that fresh build too (frontier after badlands).
//
// It is a sample, not the class: a leak can travel between any two maps that share state, and no build order shows
// every one (2026-10-14, the third coverage check: an injected one-slot cache of the last map's western1944 footprints,
// which Polders bent, reached Reservoir only when Reservoir was built right after Polders; the full serial order never
// does that, so only origin/main's serial `--maps polders,reservoir` regeneration followed by the serial check showed
// it, and the capture tool now refuses to split a regeneration of some maps). The sampled pairs share builders and so
// share whatever a builder caches:
//   - badlands after frontier, and frontier after badlands: the coverage check's reproduction (a stale obstacle cache in
//     createProps made the split check pass where the serial one failed); the dry maps' civilian palette and the M60A3
//     wreck donor;
//   - frontier after urban: the germany1980s civilian fleet (civilianVehicleKit.ts caches a footprint per fleet and
//     role) and four wreck donors (M1A1, Leopard 1A5, Marder 1A3, BMP-2);
//   - saltwind after ruinspires: the yugoslav1990s fleet and three donors (T-72M1, Type 59, BMP-2);
//   - titan_gorge after skybridge: the us1960s fleet, the same four donors and the jebel horizon;
//   - reservoir after polders: the western1944 fleet, which five maps share (autumn, alpine, foundry, polders and
//     reservoir), and the third check's pair (its leak passed this receipt before the pair was sampled).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { buildWorldCollisionData } from '../../tools/headlessWorldCollision.mjs';
import { readCollisionManifest } from '../../server/collisionManifestFormat.ts';
import { encodeCollisionManifest } from '../../server/collisionManifestCodec.ts';

const SEQUENCES = Object.freeze([
  { probe: 'badlands', after: ['frontier'] },
  { probe: 'frontier', after: ['urban'] },
  { probe: 'saltwind', after: ['ruinspires'] },
  { probe: 'titan_gorge', after: ['skybridge'] },
  { probe: 'reservoir', after: ['polders'] },
]);

/** The build's manifest digest and counts, as the capture tool encodes a shard. */
function summarize(data) {
  const text = JSON.stringify(encodeCollisionManifest(readCollisionManifest(data)));
  return {
    sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text),
    obstacles: data.obstacles.length, colliders: data.colliders.length, concealers: data.concealers.length,
  };
}

/** The first packed record that differs between two builds of one map (null when none). */
function firstDifference(fresh, again) {
  for (const list of ['obstacles', 'colliders', 'concealers']) {
    const a = fresh[list], b = again[list];
    if (a.length !== b.length) return `${list} ${a.length} fresh, ${b.length} rebuilt`;
    for (let i = 0; i < a.length; i++) {
      const before = JSON.stringify(a[i]), after = JSON.stringify(b[i]);
      if (before !== after) return `${list}[${i}] ${before.slice(0, 120)} -> ${after.slice(0, 120)}`;
    }
  }
  return null;
}

if (!isMainThread) {
  // one sequence in this worker's own isolate: the probe fresh, then each other map followed by the probe again
  const { probe, after } = workerData;
  const fresh = await buildWorldCollisionData(probe);
  const reference = summarize(fresh);
  const builds = [{ map: probe, after: null, ...reference }];
  for (const other of after) {
    builds.push({ map: other, after: probe, ...summarize(await buildWorldCollisionData(other)) });
    const again = await buildWorldCollisionData(probe);
    const summary = summarize(again);
    builds.push({ map: probe, after: other, ...summary,
      difference: summary.sha256 === reference.sha256 ? null : firstDifference(fresh, again) ?? 'the encoded manifests differ' });
  }
  parentPort.postMessage(builds);
} else {
  const workers = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 4), SEQUENCES.length));
  const active = new Set();
  const runSequence = (sequence) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: sequence });
    active.add(worker);
    worker.once('exit', () => active.delete(worker));
    let builds = null;
    // the worker's isolate goes with its sequence (a builder may leave a timer or a pool behind; the next starts fresh)
    worker.once('message', (message) => { builds = message; worker.terminate().then(() => resolve(builds), reject); });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (!builds) reject(new Error(`the ${sequence.probe} sequence's worker exited ${code} without its builds`));
    });
  });
  const results = new Array(SEQUENCES.length);
  let next = 0;
  try {
    await Promise.all(Array.from({ length: workers }, async () => {
      while (next < SEQUENCES.length) {
        const index = next++;
        results[index] = await runSequence(SEQUENCES[index]);
      }
    }));
  } catch (error) {
    next = SEQUENCES.length;
    await Promise.all([...active].map((worker) => worker.terminate()));
    throw error;
  }
  // every build of a map after another map equals that map's fresh build: the probe's rebuilds in their own isolate
  // (with the first differing record), and, where another sequence builds the same map fresh, its builds here too
  // (frontier after badlands against frontier's fresh build: the coverage check's pair in both directions)
  const fresh = new Map(results.map((builds) => [builds[0].map, builds[0]]));
  const pairs = [], leaks = [];
  const counts = (build) => `${build.obstacles} obstacles, ${build.colliders} colliders, ${build.concealers} concealers, ${build.bytes} B`;
  for (const [index, { probe, after }] of SEQUENCES.entries()) {
    const builds = results[index];
    assert.equal(builds.length, 1 + 2 * after.length, `the ${probe} sequence built every map`);
    assert.ok(builds[0].obstacles > 0, `${probe} built records`);
    for (const build of builds.slice(1)) {
      const reference = fresh.get(build.map);
      if (!reference) continue;
      pairs.push(`${build.map} after ${build.after}`);
      if (build.sha256 === reference.sha256 && counts(build) === counts(reference)) continue;
      leaks.push(`${build.map} after ${build.after} (${build.map === probe ? 'same isolate' : 'against its fresh build in another isolate'}):`
        + ` ${counts(reference)} fresh, ${counts(build)} here${build.difference ? `; first difference ${build.difference}` : ''}`);
    }
  }
  assert.deepEqual(leaks, [], 'a map built after another map differs from its fresh build: a module-level cache or pool carries'
    + ' one map\'s build into the next (a page that changes battlefields would lay this map out otherwise than a fresh page)');
  const count = results.reduce((sum, builds) => sum + builds.length, 0);
  console.log(`worldBuildIsolation: ${pairs.join(', ')} build byte-identical to their fresh builds`
    + ` (${count} builds in ${SEQUENCES.length} isolates, ${workers} at a time) PASS`);
}
