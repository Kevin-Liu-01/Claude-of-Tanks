// worldBuildIndependence.selftest.mjs — a world build never depends on the maps built before it in the same process
// (the 225 gate, 2026-10-15: huts' field hospital left its part tag set, and Skybridge's obstacles read differently after
// Urban, the rail yard, Badlands and Foundry had been built). Skybridge is built alone in one process and after those four
// maps in another; its packed collision (obstacles, colliders, concealers) must be the same to the byte.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = (maps) => `
  const { createHash } = await import('node:crypto');
  const { buildWorldCollisionData } = await import(${JSON.stringify(path.join(root, 'tools/headlessWorldCollision.mjs'))});
  let last = null;
  for (const mapId of ${JSON.stringify(maps)}) last = await buildWorldCollisionData(mapId);
  process.stdout.write('DIGEST ' + createHash('sha256').update(JSON.stringify(last)).digest('hex') + '\\n');
`;
const digest = (maps) => {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script(maps)], {
    cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=4096' },
  });
  const line = out.split('\n').find((l) => l.startsWith('DIGEST '));
  assert.ok(line, `a digest for ${maps.join(', ')}`);
  return line.slice(7);
};

const alone = digest(['skybridge']);
const after = digest(['urban', 'railyard', 'badlands', 'foundry', 'skybridge']);
assert.equal(after, alone, 'Skybridge builds the same after Urban, the rail yard, Badlands and Foundry as alone');
console.log(`worldBuildIndependence.selftest: Skybridge alone and after four maps: the same collision (${alone.slice(0, 12)}) PASS`);
