#!/usr/bin/env node
/**
 * Re-encode every committed world collision shard in the newest exact encoding (server/collisionManifestCodec.ts) without
 * rebuilding a world (the shards' storage budget, 2026-10-14: primitive-kind-dict-v3). Each shard's bytes are checked
 * against the index first; its decoded manifest is written again (tools/worldCollisionManifestFiles.mjs) and decoded
 * back, and every record, key, number and string must equal the original bit for bit (Object.is: no -0 for 0, no
 * rounding) before the index is rewritten with the new bytes and checksums. A shard already in the newest encoding is
 * left as it is.
 *
 *   node tools/transcode-collision-manifests.mjs [--check]     (--check: transcode in memory, report, write nothing)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeCollisionManifest, encodeCollisionManifest } from '../server/collisionManifestCodec.ts';
import { collisionManifestCounts, collisionManifestShardName, readCollisionManifestIndex } from '../server/collisionManifestFormat.ts';
import { MAP_IDS } from '../src/world/maps/catalog.ts';
import {
  collisionManifestDirectory, writeCollisionManifestIndex, writeCollisionManifestShard,
} from './worldCollisionManifestFiles.mjs';

const check = process.argv.includes('--check');
const directory = collisionManifestDirectory;

/** The first difference between two decoded values (key order, Object.is numbers), or null. */
export function exactDifference(a, b, path = '') {
  if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b) ? null : `${path}: ${a} != ${b}`;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return `${path}: array shape`;
    for (let i = 0; i < a.length; i++) {
      const d = exactDifference(a[i], b[i], `${path}/${i}`);
      if (d) return d;
    }
    return null;
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') return `${path}: object shape`;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.join('\u0000') !== kb.join('\u0000')) return `${path}: keys ${ka} != ${kb}`;
    for (const key of ka) {
      const d = exactDifference(a[key], b[key], `${path}.${key}`);
      if (d) return d;
    }
    return null;
  }
  return a === b ? null : `${path}: ${String(a)} != ${String(b)}`;
}

const index = readCollisionManifestIndex(JSON.parse(readFileSync(new URL('index.json', directory), 'utf8')));
const maps = { ...index.maps };
const variants = Object.fromEntries(Object.entries(index.variants ?? {}).map(([name, entries]) => [name, { ...entries }]));
const rows = [];
let before = 0, after = 0;
const shards = [...MAP_IDS.map((id) => [id, null]),
  ...Object.entries(variants).flatMap(([variant, entries]) => Object.keys(entries).map((id) => [id, variant]))];
for (const [id, variant] of shards) {
  const entry = variant ? variants[variant][id] : maps[id];
  const name = collisionManifestShardName(id, variant);
  const bytes = readFileSync(new URL(`${name}.json`, directory));
  if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
    throw new Error(`${name}: the committed shard does not match its index entry`);
  }
  const published = JSON.parse(bytes.toString('utf8'));
  const original = decodeCollisionManifest(published);
  const text = JSON.stringify(encodeCollisionManifest(original));
  const difference = exactDifference(decodeCollisionManifest(JSON.parse(text)), original);
  if (difference) throw new Error(`${name}: the re-encoded shard decodes differently (${difference})`);
  if (JSON.stringify(collisionManifestCounts(original)) !== JSON.stringify(collisionManifestCounts(decodeCollisionManifest(JSON.parse(text))))) {
    throw new Error(`${name}: census changed`);
  }
  before += bytes.length;
  after += Buffer.byteLength(text);
  rows.push([name, bytes.length, Buffer.byteLength(text)]);
  if (check) continue;
  const written = writeCollisionManifestShard(id, original, directory, variant);
  if (written.bytes !== Buffer.byteLength(text)) throw new Error(`${name}: the writer's bytes differ from the check's`);
  if (variant) variants[variant][id] = written;
  else maps[id] = written;
}
if (!check) writeCollisionManifestIndex(maps, directory, variants);
for (const [name, a, b] of rows) console.log(`${name.padEnd(32)} ${(a / 1e6).toFixed(3)} -> ${(b / 1e6).toFixed(3)} MB`);
const base = rows.filter(([name]) => !name.includes('@'));
const sum = (list, i) => list.reduce((total, row) => total + row[i], 0);
console.log(`transcode-collision-manifests: ${rows.length} shards bit for bit; base ${(sum(base, 1) / 1e6).toFixed(3)} -> ${(sum(base, 2) / 1e6).toFixed(3)} MB, `
  + `all ${(before / 1e6).toFixed(3)} -> ${(after / 1e6).toFixed(3)} MB${check ? ' (check: nothing written)' : ''}`);
