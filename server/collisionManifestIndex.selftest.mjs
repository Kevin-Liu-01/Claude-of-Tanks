// Every published world collision shard — the base maps and every battlefield variant — matches its index.json entry
// byte for byte (size and sha256) and decodes to the census the entry records: exactly what the loaders check before a
// match loads a shard (server/collisionManifestLoader.ts, the browser host's worldCollision.ts), so a mismatch is a mode
// that cannot start on that map. Every variant shard on disk has its entry. (2026-10-14, physics stream: four
// assault-trenches shards — Blackglass, Skybridge, Airfield, the Moon — kept index entries from another regeneration,
// and Frontline would have thrown "collision manifest checksum mismatch" on all four; the codec and dedicated-world
// receipts read the base maps only.)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { decodeCollisionManifest } from './collisionManifestCodec.ts';
import { collisionManifestShardName, readCollisionManifestIndex, validateCollisionManifestCounts } from './collisionManifestFormat.ts';
import { MAP_IDS } from '../src/world/maps/catalog.ts';

const directory = new URL('./world-collision-manifests/', import.meta.url);
const index = readCollisionManifestIndex(JSON.parse(readFileSync(new URL('index.json', directory), 'utf8')));
const shards = [
  ...MAP_IDS.map((id) => [id, null, index.maps[id]]),
  ...Object.entries(index.variants ?? {}).flatMap(([variant, entries]) => Object.entries(entries).map(([id, entry]) => [id, variant, entry])),
];
const failures = [];
for (const [id, variant, entry] of shards) {
  const name = collisionManifestShardName(id, variant);
  if (!entry) { failures.push(`${name}: no index entry`); continue; }
  const bytes = readFileSync(new URL(`${name}.json`, directory));
  if (bytes.length !== entry.bytes) { failures.push(`${name}: ${bytes.length} bytes, the index says ${entry.bytes}`); continue; }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== entry.sha256) { failures.push(`${name}: sha256 ${sha256.slice(0, 12)}, the index says ${entry.sha256.slice(0, 12)}`); continue; }
  try {
    validateCollisionManifestCounts(decodeCollisionManifest(JSON.parse(bytes.toString('utf8'))), entry);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}
const indexed = new Set(shards.map(([id, variant]) => collisionManifestShardName(id, variant)));
for (const file of readdirSync(directory)) {
  if (!file.endsWith('.json') || file === 'index.json') continue;
  if (!indexed.has(file.slice(0, -5))) failures.push(`${file}: a shard with no index entry`);
}
assert.deepEqual(failures, [], 'every published collision shard matches its index entry');
const variants = shards.length - MAP_IDS.length;
console.log(`collisionManifestIndex.selftest: ${shards.length} shards (${MAP_IDS.length} base, ${variants} variant) match index.json byte for byte and decode to their census; no unindexed shard`);
