// The building-detail ratchet (BLD-04 / HB-1b; props Lane B, 2026-10-14; tools/building-detail-census.mjs,
// docs/BUILDING-DETAIL.md): every regional kit's buildings measured as the owner reads them, held to their own baseline.
//   1. the census reproduces the 10-12 study's anchors on the kits it scored (B1 §2.3: kolkhoz 17 of 20, shanghai 3,
//      siwa 2 when it was taken), so its instrumentation still sees the shared detail modules;
//   2. every builder builds at every seed and its geometry hashes are stable over two runs;
//   3. no kit drops below its baseline — elements, reading distances, face pass strictly; triangles per m² of wall and fine share
//      by no more than 10 % — and no battlefield's kit coverage drops (src/world/buildingDetail.baseline.json; a deliberate change
//      re-bases it with `node tools/building-detail-census.mjs --update-baseline`);
//   4. the ratchet catches a drop (a synthetic one).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASELINE_PATH, baselineOf, censusKits, censusMaps, ratchetFailures } from '../../tools/building-detail-census.mjs';

const { kits, builders } = await censusKits();
const maps = await censusMaps();
const run = { kits, builders, maps };
const kit = (id) => kits.find((k) => k.kit === id);

// 1. the anchors (floors: a kit may only rise past them)
assert.ok(kit('kolkhoz').score >= 17, `kolkhoz scores ${kit('kolkhoz').score} of 20 (B1: 17)`);
assert.ok(kit('shanghai').score >= 3, `shanghai scores ${kit('shanghai').score} (B1: 3)`);
assert.ok(kit('siwa').score >= 2, `siwa scores ${kit('siwa').score} (B1: 2)`);
for (const id of ['kolkhoz', 'franconian', 'hessian']) {
  assert.ok(kit(id).marks.E20 === '●' && kit(id).facePass === 1, `${id}: every dwelling through the house grammar`);
  assert.ok(kit(id).windows > 0 && kit(id).doors > 0, `${id}: the instrumentation sees its window and door units`);
}
assert.equal(kits.length, new Set(kits.map((k) => k.kit)).size, 'one row a kit');

// 2. every builder builds; its hashes are stable
const broken = builders.filter((b) => b.error);
assert.deepEqual(broken.map((b) => `${b.kit}/${b.id}: ${b.error}`), [], 'every builder builds at every seed');
const again = await censusKits({ kits: ['kolkhoz', 'shanghai', 'ruhr'] });
for (const b of again.builders) {
  const first = builders.find((x) => x.kit === b.kit && x.id === b.id);
  assert.deepEqual(b.hashes, first.hashes, `${b.kit}/${b.id}: the same geometry twice`);
}

// 3. the ratchet
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const failures = ratchetFailures(baseline, run);
assert.deepEqual(failures, [], `nothing dropped below the baseline:\n  ${failures.join('\n  ')}`);

// 4. a drop is caught
const drop = structuredClone(baselineOf(run));
drop.kits.kolkhoz.score += 1; drop.kits.kolkhoz.trisPerWallM2 *= 1.25; drop.maps.verdant.coverage = 2;
const caught = ratchetFailures(drop, run);
assert.ok(caught.some((f) => f.startsWith('kolkhoz: score')) && caught.some((f) => f.startsWith('kolkhoz: trisPerWallM2')) && caught.some((f) => f.startsWith('verdant: coverage')),
  `a synthetic drop is caught (${caught.join('; ')})`);

const top = [...kits].sort((a, b) => b.score - a.score).slice(0, 3).map((k) => `${k.kit} ${k.score}`).join(', ');
console.log(`building detail: ${builders.length} builders in ${kits.length} kits and ${maps.length} maps at or above their baseline (top: ${top}); hashes stable`);
