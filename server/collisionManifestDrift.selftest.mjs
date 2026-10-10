// Drift receipt for the dedicated collision shards (maps-and-layouts lane, 2026-10-01). A multiplayer host plays on
// server/world-collision-manifests/<map>.json, a capture of the rendered world. Nothing re-checked a shard after the
// tree moved, so fifteen of 33 had drifted by October 1 (wreck bounds that followed the fleet rebuild). Since the
// rendered world's records come from deterministic builders that also run in Node (tools/headlessWorldCollision.mjs),
// every shard is rebuilt here and must match its committed records; a browser capture may differ from the Node build
// in the last packed digit of a rare record, which the check reports and accepts. On a failure, regenerate the named
// maps: node tools/capture-world-collision-manifests.mjs --node --maps <ids>.
//
// The maps split over a few child processes, each running the capture tool's --check on its share.
//
// 2026-10-07 (map-vehicles lane): the same builds also walk every drawn geometry of each map's props and vegetation
// for V8's fast properties (COT_DRAWN_GEOMETRY_SHAPE; src/world/geometryStreams.ts says why a deletion costs a
// millisecond a frame), so the shape check rides on this receipt's world build instead of a second one;
// drawnGeometryShape.selftest keeps the control and the garages, fleetPassHigh the tanks.
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
    const child = spawn(process.execPath, [tool, '--check', '--maps', maps.join(',')],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, COT_DRAWN_GEOMETRY_SHAPE: '1' } });
    let out = '', err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

const results = await Promise.all(shares.map(check));
const rows = new Map(), shapes = new Map();
for (const { out } of results) {
  for (const line of out.split('\n')) {
    const match = /^([a-z_]+): (current|DRIFTED)(.*)$/.exec(line.trim());
    if (match) rows.set(match[1], match[2] + match[3]);
    const shape = /^drawn-shape ([a-z_]+): (\d+) walked, (\d+) stand-ins, (\d+) offenders(.*)$/.exec(line.trim());
    if (shape) shapes.set(shape[1], { walked: Number(shape[2]), standIns: Number(shape[3]), offenders: Number(shape[4]), first: shape[5] });
  }
}
for (const { code, err } of results) {
  assert.ok(code === 0 || code === 1, `drift check exited ${code}: ${err.split('\n').filter((l) => !/warning/i.test(l)).slice(-6).join(' | ')}`);
}
assert.deepEqual([...rows.keys()].sort(), [...MAP_IDS].sort(), 'every canonical map was rebuilt and compared');
const drifted = [...rows.entries()].filter(([, status]) => !status.startsWith('current'));
const rounded = [...rows.entries()].filter(([, status]) => status.startsWith('current ('));
assert.deepEqual(drifted, [], `collision shards match the tree (regenerate: node tools/capture-world-collision-manifests.mjs --node --maps ${drifted.map(([id]) => id).join(',')})`);
// the drawn-geometry shape on the same builds: every map walked, the vehicles' shadow stand-ins (hold 6's offenders)
// among what it reached, nothing left in dictionary mode
assert.deepEqual([...shapes.keys()].sort(), [...MAP_IDS].sort(), 'every map walked its drawn geometry');
const slow = [...shapes.entries()].filter(([, shape]) => shape.offenders > 0);
assert.deepEqual(slow.map(([id, shape]) => `${id}: ${shape.offenders}${shape.first}`), [],
  'drawn geometries left in dictionary mode (build them with src/world/geometryStreams.ts keepStreams, never trim them with deleteAttribute)');
assert.ok(shapes.get('railyard').standIns > 0 && shapes.get('alpine').standIns > 0, 'the walk reaches the vehicles\' shadow stand-ins');
const walked = [...shapes.values()].reduce((sum, shape) => sum + shape.walked, 0);
console.log(`collisionManifestDrift.selftest: ${rows.size}/${MAP_IDS.length} shards match the Node build`
  + ` (${rows.size - rounded.length} byte-identical, ${rounded.length} within the last packed digit: ${rounded.map(([id]) => id).join(', ') || 'none'}; ${workers} workers);`
  + ` ${walked} drawn geometries keep fast attribute objects (shadow stand-ins on ${[...shapes.values()].filter((shape) => shape.standIns > 0).length} maps)`);
