import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  collisionManifestCounts, collisionManifestShardName, readCollisionManifest, readCollisionManifestIndex,
} from '../server/collisionManifestFormat.ts';
import { isMapId, MAP_IDS } from '../src/world/maps/catalog.ts';
import { encodeCollisionManifest } from '../server/collisionManifestCodec.ts';

export const collisionManifestDirectory = new URL('../server/world-collision-manifests/', import.meta.url);

/** The retired migration must never be interpreted as a capture session. */
function assertCollisionCaptureArgs(args) {
  if (args.some((arg) => arg === '--migrate' || arg.startsWith('--migrate='))) {
    throw new Error('--migrate is retired; capture the canonical map shards with tools/capture-world-collision-manifests.mjs <session>');
  }
}

/** Resolve CLI intent before opening a browser or touching any shard. */
export function collisionCaptureOptions(args) {
  assertCollisionCaptureArgs(args);
  let session = null, selected = null, headless = false, cacheDir = null, node = false, check = false, variant = null, tier = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--maps' || arg.startsWith('--maps=')) {
      if (selected !== null) throw new Error('--maps may be supplied only once');
      const value = arg === '--maps' ? args[++i] : arg.slice(7);
      selected = (value || '').split(',');
      if (selected.some((id) => !isMapId(id)) || new Set(selected).size !== selected.length) {
        throw new Error('--maps requires unique canonical map IDs');
      }
    } else if (arg === '--headless') {
      // round 61: a private vite server + headless Chrome on this checkout instead of an agent-browser session
      if (headless) throw new Error('--headless may be supplied only once');
      headless = true;
    } else if (arg === '--node') {
      // 2026-10-01: build the world in Node (tools/headlessWorldCollision.mjs) instead of capturing a rendered page
      if (node) throw new Error('--node may be supplied only once');
      node = true;
    } else if (arg === '--check') {
      // 2026-10-01: compare a fresh Node build with the committed shards and write nothing (exit 1 on drift)
      if (check) throw new Error('--check may be supplied only once');
      check = true;
    } else if (arg.startsWith('--variant=')) {
      // 2026-10-08 (destruction core lane): a mode's battlefield variant ('assault-trenches': Frontline's carved trenches
      // and their works), built in Node from the variant's config into its own `<map>@<variant>.json` shards
      if (variant !== null) throw new Error('--variant may be supplied only once');
      variant = arg.slice('--variant='.length);
      if (variant !== 'assault-trenches') throw new Error(`--variant names an unknown battlefield variant: ${variant}`);
    } else if (arg.startsWith('--tier=')) {
      // 2026-10-08 (destruction core lane, layout identity): build at a device tier ('mobile') and compare with the
      // committed shards, which are the desktop's — a phone must place every blocking record where the desktop does
      if (tier !== null) throw new Error('--tier may be supplied only once');
      tier = arg.slice('--tier='.length);
      if (tier !== 'mobile') throw new Error(`--tier names an unknown device tier to check: ${tier}`);
    } else if (arg.startsWith('--cache-dir=')) {
      // a warm vite optimizer cache of the caller's own (headless mode; default: a fresh temporary directory)
      if (cacheDir !== null) throw new Error('--cache-dir may be supplied only once');
      cacheDir = arg.slice('--cache-dir='.length);
      if (!cacheDir) throw new Error('--cache-dir requires a directory');
    } else if (arg.startsWith('-') || session !== null) {
      throw new Error(`invalid collision capture argument: ${arg}`);
    } else session = arg;
  }
  if (headless && session !== null) throw new Error('--headless takes no agent-browser session');
  if (!headless && cacheDir !== null) throw new Error('--cache-dir applies to --headless captures only');
  if (check) node = true;
  if (variant !== null) node = true;
  // a phone's build is only ever checked against the desktop's shards, never written
  if (tier !== null) { if (variant !== null) throw new Error('--tier checks the base maps only'); node = true; check = true; }
  if (node && (headless || session !== null)) throw new Error('--node builds without a browser session');
  return { session: session || 'cot-manifest', partial: selected !== null, headless, cacheDir, node, check,
    ...(variant !== null ? { variant } : {}),
    ...(tier !== null ? { tier } : {}),
    mapIds: selected === null ? MAP_IDS : MAP_IDS.filter((id) => selected.includes(id)) };
}

/** Partial refreshes retain a validated, complete roster rather than silently
 * publishing a one-map index. Verify sibling bytes both before and after capture.
 */
export function readCollisionCaptureEntries(selectedMapIds, directory = collisionManifestDirectory) {
  const index = readCollisionManifestIndex(JSON.parse(readFileSync(new URL('index.json', directory), 'utf8')));
  // A partial capture starts from the complete canonical index; the one exception is a map that is
  // being captured for the first time (Mars mode, 2026-09-18: Olympus Basin joined the catalog), whose
  // shard the capture itself supplies before the index is rewritten.
  const missing = MAP_IDS.filter((id) => !index.maps[id]);
  if (Object.keys(index.maps).some((id) => !MAP_IDS.includes(id)) || missing.some((id) => !selectedMapIds.includes(id))) {
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

/** The committed index's variants (kept by every base capture, extended by a variant capture). */
export function readCollisionManifestVariants(directory = collisionManifestDirectory) {
  try {
    return readCollisionManifestIndex(JSON.parse(readFileSync(new URL('index.json', directory), 'utf8'))).variants ?? {};
  } catch { return {}; }
}

/** Stream one captured map to disk (a variant's as `<map>@<variant>.json`); retain only its tiny receipt. */
export function writeCollisionManifestShard(mapId, data, directory = collisionManifestDirectory, variant = null) {
  if (!isMapId(mapId)) throw new Error(`invalid collision map id: ${mapId}`);
  const manifest = readCollisionManifest(data);
  const text = JSON.stringify(encodeCollisionManifest(manifest));
  const entry = {
    bytes: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    ...collisionManifestCounts(manifest),
  };
  mkdirSync(directory, { recursive: true });
  writeAtomic(new URL(`${collisionManifestShardName(mapId, variant)}.json`, directory), text);
  return entry;
}

/** Publish the index last, after every selected map has been captured successfully (the variants are kept). */
export function writeCollisionManifestIndex(maps, directory = collisionManifestDirectory, variants = readCollisionManifestVariants(directory)) {
  const index = readCollisionManifestIndex({
    version: 2, terrainSeed: 1337, propsSeed: 2002, vegetationSeed: 2001, maps,
    ...(Object.keys(variants).length ? { variants } : {}),
  });
  mkdirSync(directory, { recursive: true });
  writeAtomic(new URL('index.json', directory), JSON.stringify(index, null, 2) + '\n');
  return index;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertCollisionCaptureArgs(process.argv.slice(2));
}
