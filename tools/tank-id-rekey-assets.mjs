#!/usr/bin/env node
// Re-key public/icons/tank-assets.json after a tank id rename, on the CPU (SSOT 2.19, ID.04/05).
//
//   node tools/tank-id-rekey-assets.mjs            write the re-keyed manifest
//   node tools/tank-id-rekey-assets.mjs --check    exit 1 when the manifest is not what this tool would write
//
// A rename moves the icon files byte for byte (tools/tank-id-move-files.mjs) and changes neither geometry nor looks
// (every look seed hashes tankSeedId), so each entry's rendered receipts carry over unchanged: geometryHash,
// presentationAnchor/Hash/Projection, appearance, muzzleBore and vehicleMarkings. This tool recomputes only what names
// the vehicle, exactly as tools/icons-page.html does: tankAssetMetadata(spec) and its metadataFingerprint, the file
// names from requiredTankAssetFiles(id), and every asset's bytes and sha256 from the file now on disk. It finds each
// vehicle's previous entry by its display name, which a rename never changes and tankLabelUniqueness keeps unique, so
// it is idempotent and needs no schema bookkeeping. On an unrenamed tree it rewrites the manifest byte for byte.
//
// It never renders. A vehicle with no previous entry, or whose files are missing, fails: that is a real change and
// belongs to `node tools/genIcons.mjs` under the capture lock.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../src/vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { TANK_ASSET_VIEWS, metadataFingerprint, requiredTankAssetFiles, tankAssetMetadata } from '../src/vehicles/tankAssets.ts';

const check = process.argv.includes('--check');
const outDir = resolve('public/icons');
const manifestPath = resolve(outDir, 'tank-assets.json');
const before = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(before);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const failures = [];

function assetRecord(file, view) {
  const def = TANK_ASSET_VIEWS[view];
  const path = resolve(outDir, file);
  if (!existsSync(path)) { failures.push(`missing ${file}`); return null; }
  const buffer = readFileSync(path);
  const record = { file, width: def.width, height: def.height, mime: def.ext === 'png' ? 'image/png' : 'image/webp',
    bytes: buffer.length, sha256: sha256(buffer) };
  if (view === 'angle') {
    const thumbnailFile = `thumbs/${file}`;
    const thumbPath = resolve(outDir, thumbnailFile);
    if (!existsSync(thumbPath)) { failures.push(`missing ${thumbnailFile}`); return record; }
    const thumbnailBuffer = readFileSync(thumbPath);
    record.thumbnail = { file: thumbnailFile, width: 256, height: 256, mime: 'image/webp',
      bytes: thumbnailBuffer.length, sha256: sha256(thumbnailBuffer) };
  }
  return record;
}

const byName = new Map();
for (const [key, entry] of Object.entries(manifest.tanks)) {
  const name = entry.label?.displayName;
  if (!name) { failures.push(`${key}: entry has no display name`); continue; }
  if (byName.has(name)) failures.push(`two entries are shown as "${name}"`);
  byName.set(name, entry);
}

const ids = Object.keys(manifest.tanks).length === ALL_TANK_IDS.length ? ALL_TANK_IDS : null;
if (!ids) failures.push(`the manifest holds ${Object.keys(manifest.tanks).length} vehicles, the registry ${ALL_TANK_IDS.length}: regenerate with genIcons`);
const tanks = {};
let moved = 0;
for (const id of ids ?? []) {
  const spec = getSpec(id);
  const metadata = tankAssetMetadata(spec);
  const previous = byName.get(metadata.label?.displayName);
  if (!previous) { failures.push(`${id}: no previous entry shown as "${metadata.label?.displayName}" (a real change: genIcons)`); continue; }
  if (previous.id !== id) moved += 1;
  const files = requiredTankAssetFiles(id);
  const assets = {};
  for (const view of Object.keys(previous.assets ?? {})) {
    const record = assetRecord(files[view], view);
    if (record) assets[view] = record;
  }
  // The same key order as genIcons: the page's record, then the assets.
  tanks[id] = {
    ...metadata,
    geometryHash: previous.geometryHash,
    metadataHash: metadataFingerprint(metadata),
    presentationAnchor: previous.presentationAnchor,
    presentationHash: previous.presentationHash,
    presentationProjection: previous.presentationProjection,
    appearance: previous.appearance,
    muzzleBore: previous.muzzleBore,
    vehicleMarkings: previous.vehicleMarkings,
    assets,
  };
  for (const key of Object.keys(tanks[id])) if (tanks[id][key] === undefined) delete tanks[id][key];
}

if (failures.length) {
  for (const failure of failures.slice(0, 40)) console.error(`[rekey-assets] ${failure}`);
  console.error(`[rekey-assets] FAILED (${failures.length})`);
  process.exit(1);
}
const sortedTanks = Object.fromEntries(Object.entries(tanks).sort(([a], [b]) => a.localeCompare(b)));
const after = `${JSON.stringify({ ...manifest, tanks: sortedTanks }, null, 2)}\n`;
if (check) {
  if (after !== before) { console.error('[rekey-assets] public/icons/tank-assets.json is not keyed to the current ids: run node tools/tank-id-rekey-assets.mjs'); process.exit(1); }
  console.log(`[rekey-assets] PASS: ${ids.length} vehicles keyed to the current ids`);
} else {
  if (after !== before) writeFileSync(manifestPath, after);
  console.log(`[rekey-assets] ${ids.length} vehicles, ${moved} re-keyed, ${after === before ? 'manifest unchanged' : 'manifest written'}`);
}
