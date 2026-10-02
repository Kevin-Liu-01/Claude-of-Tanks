// Drift receipt for the dedicated collision shards (maps-and-layouts lane, 2026-10-01). A multiplayer host plays on
// server/world-collision-manifests/<map>.json, a capture of the rendered world. Nothing re-checked a shard after the
// tree moved, so fifteen of 33 had drifted by October 1 (wreck bounds that followed the fleet rebuild). Since the
// rendered world's records come from deterministic builders that also run in Node (tools/headlessWorldCollision.mjs),
// every shard is rebuilt here and must match its committed records; a browser capture may differ from the Node build
// in the last packed digit of a rare record, which the check reports and accepts. On a failure, regenerate the named
// maps: node tools/capture-world-collision-manifests.mjs --node --maps <ids>.
//
// The maps split over a few child processes, each running the capture tool's --check on its share.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';

const tool = fileURLToPath(new URL('../tools/capture-world-collision-manifests.mjs', import.meta.url));
const workers = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 4), MAP_IDS.length));
const shares = Array.from({ length: workers }, (_, w) => MAP_IDS.filter((_, index) => index % workers === w));

function check(maps) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tool, '--check', '--maps', maps.join(',')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

const results = await Promise.all(shares.map(check));
const rows = new Map();
for (const { out } of results) {
  for (const line of out.split('\n')) {
    const match = /^([a-z_]+): (current|DRIFTED)(.*)$/.exec(line.trim());
    if (match) rows.set(match[1], match[2] + match[3]);
  }
}
for (const { code, err } of results) {
  assert.ok(code === 0 || code === 1, `drift check exited ${code}: ${err.split('\n').filter((l) => !/warning/i.test(l)).slice(-6).join(' | ')}`);
}
assert.deepEqual([...rows.keys()].sort(), [...MAP_IDS].sort(), 'every canonical map was rebuilt and compared');
const drifted = [...rows.entries()].filter(([, status]) => !status.startsWith('current'));
const rounded = [...rows.entries()].filter(([, status]) => status.startsWith('current ('));
assert.deepEqual(drifted, [], `collision shards match the tree (regenerate: node tools/capture-world-collision-manifests.mjs --node --maps ${drifted.map(([id]) => id).join(',')})`);
console.log(`collisionManifestDrift.selftest: ${rows.size}/${MAP_IDS.length} shards match the Node build`
  + ` (${rows.size - rounded.length} byte-identical, ${rounded.length} within the last packed digit: ${rounded.map(([id]) => id).join(', ') || 'none'}; ${workers} workers)`);
