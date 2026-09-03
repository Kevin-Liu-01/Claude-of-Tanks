#!/usr/bin/env node

/**
 * Capture the exact rendered-map collision records for dedicated servers.
 *
 * Usage:
 *   npx vite --host 127.0.0.1 --port 5197
 *   agent-browser --session cot-manifest open http://127.0.0.1:5197/
 *   node tools/capture-world-collision-manifests.mjs cot-manifest
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAP_IDS } from '../src/world/maps/index.ts';

const session = process.argv[2] || 'cot-manifest';
const outputUrl = new URL('../server/world-collision-manifests.json', import.meta.url);

function evaluate(script) {
  const raw = execFileSync('agent-browser', [
    '--session', session,
    '--json',
    'eval',
    script,
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const envelope = JSON.parse(raw);
  if (!envelope.success) throw new Error(envelope.error || 'browser evaluation failed');
  return envelope.data.result;
}

const ready = evaluate('typeof window.__DEBUG === "object"');
if (!ready) throw new Error('game debug facade is not ready in the capture browser');

const maps = {};
for (const mapId of MAP_IDS) {
  const script = `(async () => {
    const world = await window.__DEBUG.switchMap(${JSON.stringify(mapId)});
    const n = (value) => Math.round(value * 10000) / 10000;
    const pack = (record) => {
      const out = { b: [
        n(record.min[0]), n(record.min[1]), n(record.min[2]),
        n(record.max[0]), n(record.max[1]), n(record.max[2]),
      ] };
      const shape = record.shape2;
      const packShape = (value) => value.kind === 'obb'
        ? ['o', n(value.cx), n(value.cz), n(value.hw), n(value.hl), n(value.yaw)]
        : value.kind === 'circle'
          ? ['c', n(value.cx), n(value.cz), n(value.r)]
          : ['v', ...value.points.map(n)];
      if (shape?.kind === 'compound') out.s = ['m', ...shape.parts.map(packShape)];
      else if (shape) out.s = packShape(shape);
      if (record.crushable) out.q = 1;
      // Tree contact policy is a shared runtime invariant; avoid repeating
      // its two constant values thousands of times in the server manifest.
      if (record.treeIdx == null && record.crushMin != null) out.m = n(record.crushMin);
      if (record.treeIdx == null && record.crushKeep != null) out.e = n(record.crushKeep);
      if (record.kind != null) out.k = record.kind;
      if (record.treeIdx != null) out.t = record.treeIdx;
      if (record.propIdx != null) out.p = record.propIdx;
      return out;
    };
    return {
      obstacles: world.getObstacles().map(pack),
      // Tree trunks are the exact same logical record for movement and shell
      // raycasts. Version 2 stores them once in obstacles; the headless world
      // reuses that object in its collider grid instead of inflating a clone.
      colliders: world.getColliders().filter((record) => record.treeIdx == null).map(pack),
      concealers: world.getConcealment().map((entry) => [n(entry.x), n(entry.z), n(entry.r), n(entry.add)]),
    };
  })()`;
  maps[mapId] = evaluate(script);
  const data = maps[mapId];
  console.log(`${mapId}: ${data.obstacles.length} obstacles, ` +
    `${data.colliders.length} colliders, ${data.concealers.length} concealers`);
}

const manifest = {
  version: 2,
  terrainSeed: 1337,
  propsSeed: 2002,
  vegetationSeed: 2001,
  maps,
};
writeFileSync(outputUrl, JSON.stringify(manifest));
console.log(`wrote ${fileURLToPath(outputUrl)}`);
