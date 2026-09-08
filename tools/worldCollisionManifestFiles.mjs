import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  collisionManifestCounts, readCollisionManifest, readCollisionManifestIndex,
} from '../server/collisionManifestFormat.ts';
import { isMapId, MAP_IDS } from '../src/world/maps/catalog.ts';
import { encodeCollisionManifest } from '../server/collisionManifestCodec.ts';

export const collisionManifestDirectory = new URL('../server/world-collision-manifests/', import.meta.url);

/** The retired migration must never be interpreted as a capture session. */
export function assertCollisionCaptureArgs(args) {
  if (args.some((arg) => arg === '--migrate' || arg.startsWith('--migrate='))) {
    throw new Error('--migrate is retired; capture the canonical map shards with tools/capture-world-collision-manifests.mjs <session>');
  }
}

/** Resolve CLI intent before opening a browser or touching any shard. */
export function collisionCaptureOptions(args) {
  assertCollisionCaptureArgs(args);
  let session = null, selected = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--maps' || arg.startsWith('--maps=')) {
      if (selected !== null) throw new Error('--maps may be supplied only once');
      const value = arg === '--maps' ? args[++i] : arg.slice(7);
      selected = (value || '').split(',');
      if (selected.some((id) => !isMapId(id)) || new Set(selected).size !== selected.length) {
        throw new Error('--maps requires unique canonical map IDs');
      }
    } else if (arg.startsWith('-') || session !== null) {
      throw new Error(`invalid collision capture argument: ${arg}`);
    } else session = arg;
  }
  return { session: session || 'cot-manifest', partial: selected !== null,
    mapIds: selected === null ? MAP_IDS : MAP_IDS.filter((id) => selected.includes(id)) };
}

/** Partial refreshes retain a validated, complete roster rather than silently
 * publishing a one-map index. Verify sibling bytes both before and after capture.
 */
export function readCollisionCaptureEntries(selectedMapIds, directory = collisionManifestDirectory) {
  const index = readCollisionManifestIndex(JSON.parse(readFileSync(new URL('index.json', directory), 'utf8')));
  if (Object.keys(index.maps).length !== MAP_IDS.length || MAP_IDS.some((id) => !index.maps[id])) {
    throw new Error('partial collision capture requires the complete canonical map index');
  }
  assertUnchangedCollisionShards(index.maps, selectedMapIds, directory);
  return { ...index.maps };
}

export function assertUnchangedCollisionShards(maps, selectedMapIds, directory = collisionManifestDirectory) {
  for (const id of MAP_IDS) {
    if (selectedMapIds.includes(id)) continue;
    const bytes = readFileSync(new URL(`${id}.json`, directory));
    if (bytes.length !== maps[id]?.bytes || createHash('sha256').update(bytes).digest('hex') !== maps[id]?.sha256) {
      throw new Error(`${id}: unchanged collision shard checksum mismatch`);
    }
  }
}

function writeAtomic(url, text) {
  const temporary = new URL(`${url.pathname}.tmp-${process.pid}`, url);
  writeFileSync(temporary, text);
  renameSync(temporary, url);
}

/** Stream one captured map to disk; retain only its tiny receipt in the generator. */
export function writeCollisionManifestShard(mapId, data, directory = collisionManifestDirectory) {
  if (!isMapId(mapId)) throw new Error(`invalid collision map id: ${mapId}`);
  const manifest = readCollisionManifest(data);
  const text = JSON.stringify(encodeCollisionManifest(manifest));
  const entry = {
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    ...collisionManifestCounts(manifest),
  };
  mkdirSync(directory, { recursive: true });
  writeAtomic(new URL(`${mapId}.json`, directory), text);
  return entry;
}

/** Publish the index last, after every selected map has been captured successfully. */
export function writeCollisionManifestIndex(maps, directory = collisionManifestDirectory) {
  const index = readCollisionManifestIndex({
    version: 2, terrainSeed: 1337, propsSeed: 2002, vegetationSeed: 2001, maps,
  });
  mkdirSync(directory, { recursive: true });
  writeAtomic(new URL('index.json', directory), JSON.stringify(index, null, 2) + '\n');
  return index;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertCollisionCaptureArgs(process.argv.slice(2));
}
