#!/usr/bin/env node
// CPU-only refresh of static wreck records. Uses the production terrain/vegetation/props
// builders at canonical seeds; canvas painting is inert because pixels do not affect collision.
// Every unrelated record is retained. This is collision evidence, not a native rendering test.
// Run: node tools/refresh-wreck-collision-manifests.mjs [--check]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MAP_IDS, getMapConfig } from '../src/world/maps/index.ts';
import { decodeCollisionManifest } from '../server/collisionManifestCodec.ts';
import { writeCollisionManifestShard, writeCollisionManifestIndex } from './worldCollisionManifestFiles.mjs';
import { packCollisionRecord } from './headlessWorldCollision.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const n = value => Math.round(value * 10000) / 10000;
// (the hitbox lane, 2026-10-07: the shards' own packer, so a refreshed wreck packs as a capture packs it — a part whose
// extent is its record's own carries none — and a slabbed shell record round-trips)
const pack = packCollisionRecord;
function installGeometryCanvas() {
  globalThis.ImageData = class { constructor(data) { this.data = data; } };
  globalThis.Image = class {
    width = 8; height = 8;
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context;
    return canvas;
  } };
}
async function capture(mapId) {
  installGeometryCanvas();
  globalThis.fetch = async url => new Response(readFileSync(url));
  const { createProps, preloadPropModels } = await import('../src/world/props.ts');
  const { createHeightField } = await import('../src/world/terrain.ts');
  const { createVegetation } = await import('../src/world/vegetation.ts');
  const config = getMapConfig(mapId);
  await preloadPropModels();
  // The synchronous producer cannot await a family's streamed builder.
  const { ensureFullFleet } = await import('../src/vehicles/fleetFactory.ts');
  await ensureFullFleet();
  const context = { anisotropy: 4, setupShadowMaterial() {} };
  const field = createHeightField(1337, config);
  const vegetation = createVegetation(field, context, 2001, config);
  const props = createProps(field, context, 2002, config, vegetation);
  // (the hitbox lane, 2026-10-07: a wreck's shell record is its own slabs, no longer a copy of its movement record)
  const records = {
    obstacles: props.obstacles.filter(record => record.kind === 'tank-wreck').map(pack),
    colliders: props.colliders.filter(record => record.kind === 'tank-wreck').map(pack),
  };
  assert.equal(records.obstacles.length, props.tankWreckSpots.length);
  assert.equal(records.colliders.length, props.tankWreckSpots.length);
  console.log(JSON.stringify({ records, spots: props.tankWreckSpots }));
}
function same(a, b) {
  try { assert.deepEqual(a, b); return true; } catch { return false; }
}
function replaceWreck(records, updated, spot, check, label) {
  let indices = records.flatMap((record, index) => same(record, updated) ? [index] : []);
  if (indices.length === 1) return;
  assert.ok(!check, `${label}: stored collision needs refresh`);
  // Existing shards stored untagged, padded OBBs. Require the identical unique
  // authored anchor and heading, never nearest-neighbour matching or a tagged prop.
  indices = records.flatMap((record, index) => record.s?.[0] === 'o' &&
    record.s[1] === n(spot.x) && record.s[2] === n(spot.z) && record.s[5] === n(spot.yaw) &&
    !record.k && !record.q && record.p == null && record.t == null ? [index] : []);
  assert.equal(indices.length, 1, `${label}: exactly one legacy wreck must match`);
  records[indices[0]] = updated;
}
async function refresh(check) {
  const index = JSON.parse(readFileSync(new URL('../server/world-collision-manifests/index.json', import.meta.url), 'utf8'));
  const updates = [];
  for (const id of MAP_IDS) {
    const raw = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--capture', id], {
      cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 240000,
    });
    const { records, spots } = JSON.parse(raw.trim().split('\n').at(-1));
    assert.ok(records.obstacles.length > 0, `${id}: real wrecks must build; missing builders cannot pass verification`);
    const manifest = decodeCollisionManifest(JSON.parse(readFileSync(
      new URL(`../server/world-collision-manifests/${id}.json`, import.meta.url), 'utf8')));
    for (const key of ['obstacles', 'colliders']) for (let i = 0; i < records[key].length; i++) {
      replaceWreck(manifest[key], records[key][i], spots[i], check, `${id}/${i}/${key}`);
    }
    updates.push({ id, manifest, count: records.obstacles.length });
    console.log(`${id}: ${records.obstacles.length} wrecks ${check ? 'verified' : 'refreshed'}; other records retained`);
  }
  if (!check) {
    for (const { id, manifest } of updates) index.maps[id] = writeCollisionManifestShard(id, manifest);
    writeCollisionManifestIndex(index.maps);
  }
  console.log(`${updates.reduce((sum, row) => sum + row.count, 0)} wrecks across ${updates.length} maps`);
}
if (process.argv[2] === '--capture') await capture(process.argv[3]);
else {
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--check'), 'expected only --check');
  await refresh(process.argv[2] === '--check');
}
