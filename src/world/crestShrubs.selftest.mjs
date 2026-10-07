// The trees lane (2026-10-07, the scenery lane's bocage banks: the field works' built crests, handed over by the world —
// map.ts `plantBankCrests`): the crest shrubs on the real seeded producer of Saltmere Coast (gorse) and Frontier Basin
// (blackthorn), fed synthetic crest lines in fieldWorks' FieldBankCrests layout: sparse clumps seated on the crowns, one
// instanced mesh of the place's shrub-only form, decor only (no collider, no concealment, no tree record), once; a
// place without a crest entry plants none. A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeCrest } from './treeBiomes.ts';
import { GROWTH_SPECIES, TREE_GROWTH_PROFILES } from './treeGrowth.ts';
import { SPRAY_KINDS } from './treeSprayAtlas.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function canvasFixture() {
  const saved = new Map(['document', 'ImageData'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class ImageData { constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  } }
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
      getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}

// the forms: shrub-only (never a tree slot), each with its own spray atlas
for (const form of ['gorse', 'blackthorn']) {
  assert.ok(!GROWTH_SPECIES.includes(form) && TREE_GROWTH_PROFILES[form], `${form}: a shrub-only form`);
  assert.ok(SPRAY_KINDS.includes(form), `${form}: its own sprays`);
}
assert.equal(treeBiomeCrest('coastal')?.form, 'gorse', "north Finistère's banks grow gorse");
assert.equal(treeBiomeCrest('frontier')?.form, 'blackthorn', "Hesse's banks grow blackthorn");
assert.equal(treeBiomeCrest('verdant'), null, 'a place without the entry seats none');

/** fieldWorks' FieldBankCrests layout: rows (x, crownY, z, alongX, alongZ) about 1.4 m apart along each line. */
function crestLines(field, lines) {
  const rows = [], starts = [];
  for (const [x0, z0, x1, z1] of lines) {
    starts.push(rows.length / 5);
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 1.4), ax = (x1 - x0) / len, az = (z1 - z0) / len;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ax * 1.4 * i, z = z0 + az * 1.4 * i;
      rows.push(x, field.getHeightAt(x, z) + 1.3, z, ax, az);
    }
  }
  starts.push(rows.length / 5);
  return { points: new Float32Array(rows), lines: new Uint32Array(starts) };
}

const restore = canvasFixture();
try {
  for (const mapId of ['coastal', 'frontier', 'verdant']) {
    const cfg = getMapConfig(mapId), field = createHeightField(1337, cfg), law = treeBiomeCrest(mapId);
    const world = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    try {
      const crests = crestLines(field, [[-260, -40, -60, -40], [40, 120, 40, 300], [100, -200, 220, -320]]);
      const obstacles = world.treeObstacles.length, concealers = world.concealers.length, trees = world._trees.length;
      const meshesBefore = world.group.children.length;
      world.plantBankCrests(crests);
      const crestMesh = world.group.children.find((m) => m.userData?.crestShrubs);
      if (!law) {
        assert.ok(!crestMesh && world.group.userData.crestShrubs === undefined, `${mapId}: no crest entry, no shrub`);
        continue;
      }
      const census = world.group.userData.crestShrubs;
      assert.ok(crestMesh && census && census.form === law.form && census.lines === 3, `${mapId}: the crest shrubs planted (${JSON.stringify(census)})`);
      assert.equal(crestMesh.count, census.shrubs, `${mapId}: one instance a shrub`);
      // decor only: no record, collider or concealment comes with them
      assert.equal(world.treeObstacles.length, obstacles, `${mapId}: no collider`);
      assert.equal(world.concealers.length, concealers, `${mapId}: no concealment`);
      assert.equal(world._trees.length, trees, `${mapId}: no tree record`);
      // sparse clumps, no wall: about one clump every gapM, a few shrubs to one; every shrub on a row's crown
      const total = (crests.lines.at(-1) - 3) * 1.4;
      assert.ok(census.clumps <= total / law.gapM[0] + 3 && census.clumps >= total / law.gapM[1] - 3,
        `${mapId}: a clump every ${law.gapM[0]}-${law.gapM[1]} m (${census.clumps} on ${total.toFixed(0)} m)`);
      assert.ok(census.shrubs >= census.clumps * law.clump[0] && census.shrubs <= census.clumps * law.clump[1], `${mapId}: ${law.clump[0]}-${law.clump[1]} a clump`);
      const m = new crestMesh.instanceMatrix.array.constructor(16), P = crests.points;
      for (let i = 0; i < crestMesh.count; i++) {
        for (let k = 0; k < 16; k++) m[k] = crestMesh.instanceMatrix.array[i * 16 + k];
        let best = Infinity, crown = 0;
        for (let r = 0; r < P.length / 5; r++) {
          const d = Math.hypot(P[r * 5] - m[12], P[r * 5 + 2] - m[14]);
          if (d < best) { best = d; crown = P[r * 5 + 1]; }
        }
        assert.ok(best < 0.4 && Math.abs(m[13] - (crown - 0.06)) < 1e-3, `${mapId}: shrub ${i} on its crest's crown (${best.toFixed(2)} m off, y ${m[13].toFixed(2)} for ${crown.toFixed(2)})`);
      }
      // once: a second hand-over plants nothing more
      world.plantBankCrests(crests);
      assert.equal(world.group.children.length, meshesBefore + 1, `${mapId}: planted once`);
      console.log(JSON.stringify({ map: mapId, census }));
    } finally {
      world.dispose(); disposeObject3DResources(world.group);
    }
  }
} finally { restore(); }
console.log('crestShrubs.selftest: gorse on Saltmere\'s bank crests and blackthorn on Frontier\'s, sparse clumps on the crowns, decor only, once; none elsewhere PASS');
